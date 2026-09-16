import { Platform } from "react-native";
import Purchases, { PRODUCT_CATEGORY, PURCHASES_ERROR_CODE, type CustomerInfo, type PurchasesStoreProduct } from "react-native-purchases";
import { getRcApiKey } from "./env";
import { iapGrant, ApiError } from "./api";
import { IAP_PRODUCTS, PRODUCT_IDS, baseProductId, isSubscription } from "./packs";

// ============================================================================
// IAP — RevenueCat (react-native-purchases). 1.x src/iap.js 흐름 그대로:
//   1) initIap(userId)  → Purchases.configure({ apiKey, appUserID })
//   2) loginIap(userId) → Purchases.logIn(userId)  (앱 유저 ID = Supabase user.id)
//   3) getIapPacks()    → getProducts(NON_SUBSCRIPTION) + getProducts(SUBSCRIPTION)
//      ⚠️ 안드로이드는 type 을 안 주면 SUBSCRIPTION 만 온다 — 1.x 2026-08-18 사고.
//   4) purchaseIap(pack) → purchaseStoreProduct → 거래ID(nonSubscriptionTransactions)
//   5) 호출부가 POST /api/iap/grant {productId, transactionId} — 202 면 재시도(6회·1.8s)
// 서버가 RevenueCat 을 재검증해 크레딧을 지급한다. 클라는 크레딧 수를 절대 정하지 않는다.
// 모든 네이티브 호출에 타임아웃 — 무한 스피너(심사 반려) 재발 차단.
// ============================================================================

export interface IapPack {
  id: string;
  count: number;
  priceString: string;
  isSub: boolean;
  _product: PurchasesStoreProduct;
}

let _configured = false;
let _lastError: string | null = null;

export function getIapDiag(): string | null {
  return _lastError ? _lastError.slice(0, 200) : null;
}
function setDiag(stage: string, e: unknown) {
  const err = e as { code?: string; message?: string };
  _lastError = `[${stage}] ${err?.code ? err.code + ": " : ""}${err?.message || String(e)}`;
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) =>
      setTimeout(() => rej(Object.assign(new Error(`${label} 응답이 없어요. 네트워크 확인 후 다시 시도해 주세요.`), { code: "TIMEOUT" })), ms)
    ),
  ]);
}

function apiKey(): string | null {
  return getRcApiKey(Platform.OS === "ios" ? "ios" : "android");
}

/** 네이티브 + 키 존재 */
export function iapAvailable(): boolean {
  return (Platform.OS === "android" || Platform.OS === "ios") && !!apiKey();
}

export async function initIap(userId?: string): Promise<boolean> {
  if (!iapAvailable() || _configured) return _configured;
  try {
    const key = apiKey()!;
    const already = await Purchases.isConfigured();
    if (!already) Purchases.configure({ apiKey: key, appUserID: userId || undefined });
    _configured = true;
    _lastError = null;
  } catch (e) {
    setDiag("configure", e);
  }
  return _configured;
}

export async function loginIap(userId: string): Promise<void> {
  if (!iapAvailable() || !userId) return;
  try {
    if (!_configured) await initIap(userId);
    await withTimeout(Purchases.logIn(String(userId)), 15000, "결제 로그인");
  } catch (e) {
    setDiag("logIn", e);
  }
}

export async function logoutIap(): Promise<void> {
  if (!iapAvailable() || !_configured) return;
  try {
    if (!(await Purchases.isAnonymous())) await Purchases.logOut();
  } catch { /* 무시 */ }
}

async function fetchAllProducts(): Promise<PurchasesStoreProduct[]> {
  const subIds = PRODUCT_IDS.filter(isSubscription);
  const oneTimeIds = PRODUCT_IDS.filter((id) => !isSubscription(id));
  const calls: { ids: string[]; type: PRODUCT_CATEGORY }[] = [];
  if (subIds.length) calls.push({ ids: subIds, type: PRODUCT_CATEGORY.SUBSCRIPTION });
  if (oneTimeIds.length) calls.push({ ids: oneTimeIds, type: PRODUCT_CATEGORY.NON_SUBSCRIPTION });
  const results = await Promise.all(
    calls.map((c) =>
      withTimeout(Purchases.getProducts(c.ids, c.type), 15000, "상품 조회")
        .then((r) => r || [])
        .catch((e) => { setDiag(`getProducts(${c.type})`, e); return [] as PurchasesStoreProduct[]; })
    )
  );
  return results.flat();
}

/** 스토어 실제 상품/가격. 구독·비구독 각각 조회해 합친다. count 오름차순. */
export async function getIapPacks(): Promise<IapPack[]> {
  if (!iapAvailable()) return [];
  if (!_configured) {
    const ok = await initIap();
    if (!ok) return [];
  }
  try {
    const products = await fetchAllProducts();
    const mapped: IapPack[] = products
      .map((pr) => ({ pr, base: baseProductId(pr.identifier) }))
      .filter(({ base }) => base in IAP_PRODUCTS)
      .map(({ pr, base }) => ({ id: base, count: IAP_PRODUCTS[base], priceString: pr.priceString || "", isSub: isSubscription(base), _product: pr }));
    if (mapped.length) _lastError = null;
    else if (!_lastError) setDiag("getProducts", new Error("스토어가 상품 0개를 반환"));
    return mapped.slice().sort((a, b) => a.count - b.count);
  } catch (e) {
    setDiag("getProducts", e);
    return [];
  }
}

// 결제 재진입 방지 — React state 가 아니라 동기 잠금(Justin C5).
let purchaseLock = false;

export type PurchaseResult = { cancelled: true } | { cancelled?: false; transactionId: string | null; productId: string };

export async function purchaseIap(pack: IapPack): Promise<PurchaseResult> {
  if (!iapAvailable()) throw Object.assign(new Error("결제를 사용할 수 없어요."), { code: "UNAVAILABLE" });
  if (!pack._product) {
    throw Object.assign(new Error("상품 정보를 불러오지 못했어요. 네트워크 확인 후 다시 시도해 주세요." + (_lastError ? ` (${_lastError})` : "")), { code: "NO_PRODUCT" });
  }
  if (purchaseLock) return { cancelled: true };
  purchaseLock = true;
  try {
    const r = await withTimeout(Purchases.purchaseStoreProduct(pack._product), 180000, "결제");
    const txId = latestTxId(r.customerInfo, pack.id) ?? txIdFromTransaction(r.transaction);
    return { transactionId: txId, productId: pack.id };
  } catch (e) {
    const err = e as { code?: string; userCancelled?: boolean; message?: string };
    if (err?.userCancelled || err?.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR || err?.code === "1" || /cancel/i.test(err?.message || "")) {
      return { cancelled: true };
    }
    setDiag("purchase", e);
    throw e;
  } finally {
    purchaseLock = false;
  }
}

export async function restoreIap(): Promise<{ restored: boolean; customerInfo?: CustomerInfo; error?: string }> {
  if (!iapAvailable()) return { restored: false };
  try {
    if (!_configured) await initIap();
    const customerInfo = await withTimeout(Purchases.restorePurchases(), 30000, "구매 복원");
    return { restored: true, customerInfo };
  } catch (e) {
    return { restored: false, error: (e as Error)?.message || String(e) };
  }
}

function txIdFromTransaction(tx: { transactionIdentifier?: string | null; purchaseToken?: string | null } | undefined): string | null {
  if (!tx) return null;
  // 서버 /api/iap/grant 는 RevenueCat 구독자 API 의 구매 목록 거래ID 와 비교한다 — 1.x 와 같이
  // transactionIdentifier(Play = orderId) 우선. purchaseToken 은 폴백.
  return tx.transactionIdentifier ?? tx.purchaseToken ?? null;
}

/** customerInfo 에서 해당 상품의 최신 비구독 거래ID (1.x latestTxId, Play 접미사 대응). */
function latestTxId(info: CustomerInfo | undefined, productId: string): string | null {
  try {
    const want = baseProductId(productId);
    const mine = (info?.nonSubscriptionTransactions || []).filter((t) => baseProductId(t.productIdentifier) === want);
    if (!mine.length) return null;
    const last = mine[mine.length - 1];
    return last.transactionIdentifier ?? last.purchaseToken ?? null;
  } catch {
    return null;
  }
}

/** 결제 직후 서버 적립 — RevenueCat 반영 지연(202) 대비 6회 재시도(웹 grantWithRetry). */
export async function grantWithRetry(token: string, productId: string, transactionId: string | null): Promise<void> {
  for (let i = 0; i < 6; i++) {
    const r = await iapGrant(token, productId, transactionId);
    if (r === "pending") { await new Promise((res) => setTimeout(res, 1800)); continue; }
    return;
  }
  throw new ApiError("구매 반영이 조금 늦어지고 있어요. 잠시 후 자동으로 들어와요.", 202);
}
