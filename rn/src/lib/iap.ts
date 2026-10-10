import { useEffect, useSyncExternalStore } from "react";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import Purchases, { PACKAGE_TYPE, PRODUCT_CATEGORY, PURCHASES_ERROR_CODE, type CustomerInfo, type PurchasesPackage, type PurchasesStoreProduct } from "react-native-purchases";
import { getRcApiKey } from "./env";
import { iapGrant, ApiError } from "./api";
import { IAP_PRODUCTS, PRODUCT_IDS, baseProductId, isSubscription } from "./packs";
import { copy } from "./copy";
import { labelFlag, labelsVersionSubscribe } from "./copy21";

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
      setTimeout(() => rej(Object.assign(new Error(copy.errors.timeout(label)), { code: "TIMEOUT" })), ms)
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
    await withTimeout(Purchases.logIn(String(userId)), 15000, copy.errors.payLogin);
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
      withTimeout(Purchases.getProducts(c.ids, c.type), 15000, copy.errors.productQuery)
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
    else if (!_lastError) setDiag("getProducts", new Error(copy.errors.noProducts));
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
  if (!iapAvailable()) throw Object.assign(new Error(copy.store.unavailable), { code: "UNAVAILABLE" });
  if (!pack._product) {
    throw Object.assign(new Error(copy.errors.noProductDetail + (_lastError ? ` (${_lastError})` : "")), { code: "NO_PRODUCT" });
  }
  if (purchaseLock) return { cancelled: true };
  purchaseLock = true;
  try {
    const r = await withTimeout(Purchases.purchaseStoreProduct(pack._product), 180000, copy.errors.pay);
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
    const customerInfo = await withTimeout(Purchases.restorePurchases(), 30000, copy.store.restore);
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
  throw new ApiError(copy.store.grantLate, 202);
}

// ============================================================================
// 필터 이용권(Filter Pass) — 공통 계약서 scratchpad filterpass_spec.md (2026-10-10).
//
//   unlocked = entitlement("filters") active
//           || (trialStart != nil && now < trialStart + 3일)
//   trialStart = 원본이 아닌 필터를 처음 적용한 시각(카메라 필터 줄 또는 편집기 `filterUsed`).
//
// · 원격 스위치: 서버 이름표 `/labels.json` 의 `filterPass.enabled`(기본 false, 오너 2026-10-10).
//   꺼져 있으면 잠금·결제 시트 없음, 편집기 payload 는 filtersUnlocked=true. trialStart 도 기록하지 않는다
//   (스위치를 켠 날부터 각자 3일이 시작되게 — 켜자마자 기존 사용자가 전부 잠기지 않게).
// · trialStart 가 아직 없으면(한 번도 안 써 봄) 잠그지 않는다 — 처음 쓰는 순간 3일이 시작된다.
// · Android 는 SecureStore 에 둔다 → 재설치하면 초기화(계약서의 알려진 한계).
// · rimikimi+ 구독자는 무료 — RevenueCat entitlement 에 plus 상품이 묶여 있지만, 대시보드 설정 전이어도
//   되게 클라에서도 plus 구독을 본다.
// · dev 라우트 /dev/filterpass?state=… 가 상태를 강제한다(스위치도 켠다).
// ============================================================================

export const FILTER_ENTITLEMENT = "filters";
export const FILTER_OFFERING = "filters";
export const FILTER_FLAG_KEY = "filterPass.enabled";
const TRIAL_KEY = "filterpass.trialStart";
const TRIAL_MS = 3 * 24 * 60 * 60 * 1000;
const FILTER_PRODUCTS = ["rimikimi.filter.lifetime", "rimikimi.filter.annual", "rimikimi.filter.monthly"];

export type FilterDevState = "trial" | "expired" | "unlocked" | "plus";
export type FilterAccessSource = "off" | "entitlement" | "plus" | "trial" | "notStarted" | "locked";
export interface FilterAccess {
  /** 원격 스위치(또는 dev 강제)가 켜져 있나 — false 면 잠금·결제 없음. */
  enabled: boolean;
  unlocked: boolean;
  /** 3일 무료가 끝나는 시각(ISO). 시작 전·이용권 보유·스위치 꺼짐이면 null. */
  trialEndsAt: string | null;
  source: FilterAccessSource;
  devState: FilterDevState | null;
}

let fpTrialStart: number | null = null;
let fpTrialLoaded = false;
let fpEntitled = false;
let fpPlus = false;
let fpDev: { state: FilterDevState; trialStart: number | null; entitled: boolean; plus: boolean } | null = null;
let fpListenerOn = false;
const fpListeners = new Set<() => void>();

function computeFilterAccess(): FilterAccess {
  const devState = fpDev?.state ?? null;
  const enabled = !!fpDev || labelFlag(FILTER_FLAG_KEY);
  if (!enabled) return { enabled, unlocked: true, trialEndsAt: null, source: "off", devState };
  const entitled = fpDev ? fpDev.entitled : fpEntitled;
  const plus = fpDev ? fpDev.plus : fpPlus;
  const ts = fpDev ? fpDev.trialStart : fpTrialStart;
  if (entitled) return { enabled, unlocked: true, trialEndsAt: null, source: "entitlement", devState };
  if (plus) return { enabled, unlocked: true, trialEndsAt: null, source: "plus", devState };
  if (ts == null) return { enabled, unlocked: true, trialEndsAt: null, source: "notStarted", devState };
  const end = ts + TRIAL_MS;
  if (Date.now() < end) return { enabled, unlocked: true, trialEndsAt: new Date(end).toISOString(), source: "trial", devState };
  return { enabled, unlocked: false, trialEndsAt: new Date(end).toISOString(), source: "locked", devState };
}

let fpSnap: FilterAccess = computeFilterAccess();
function fpNotify() {
  const next = computeFilterAccess();
  const same = next.enabled === fpSnap.enabled && next.unlocked === fpSnap.unlocked && next.trialEndsAt === fpSnap.trialEndsAt
    && next.source === fpSnap.source && next.devState === fpSnap.devState;
  if (same) return;
  fpSnap = next;
  fpListeners.forEach((f) => f());
}
labelsVersionSubscribe(() => { fpNotify(); if (fpSnap.enabled) void refreshFilterAccess(); });

/** 지금 상태(동기). */
export function getFilterAccess(): FilterAccess { fpNotify(); return fpSnap; }
/** 유료 필터를 저장·공유해도 되나. 스위치가 꺼져 있으면 항상 true. */
export function hasFilterAccess(): boolean { return getFilterAccess().unlocked; }
/** 원본(none)은 언제나 무료. */
export function isPaidFilter(key: string | null | undefined): boolean { return !!key && key !== "none"; }

function applyCustomerInfo(info: CustomerInfo | null | undefined) {
  if (!info) return;
  try {
    const subs = (info.activeSubscriptions || []).map(baseProductId);
    const bought = (info.allPurchasedProductIdentifiers || []).map(baseProductId);
    fpEntitled = !!info.entitlements?.active?.[FILTER_ENTITLEMENT]
      || subs.some((id) => FILTER_PRODUCTS.includes(id))
      || bought.includes("rimikimi.filter.lifetime");
    fpPlus = subs.some((id) => id.startsWith("rimikimi.sub.plus."));
  } catch { /* 형식이 이상하면 그대로 */ }
  fpNotify();
}

async function loadTrialStart() {
  if (fpTrialLoaded) return;
  try {
    const v = await SecureStore.getItemAsync(TRIAL_KEY);
    const n = v ? Number(v) : NaN;
    fpTrialStart = Number.isFinite(n) && n > 0 ? n : null;
  } catch { /* 없음 */ }
  fpTrialLoaded = true;
}

/** SecureStore(trialStart) + RevenueCat(customerInfo) 를 다시 읽는다. 스위치가 꺼져 있으면 RevenueCat 은 안 부른다. */
export async function refreshFilterAccess(): Promise<FilterAccess> {
  await loadTrialStart();
  fpNotify();
  if (!fpSnap.enabled || fpDev || !iapAvailable()) return fpSnap;
  try {
    if (!_configured) await initIap(); // 게스트도 카메라를 쓴다 — 익명 RevenueCat 으로(로그인하면 logIn 이 합친다)
    if (!_configured) return fpSnap;
    if (!fpListenerOn) {
      fpListenerOn = true;
      Purchases.addCustomerInfoUpdateListener((info) => applyCustomerInfo(info));
    }
    applyCustomerInfo(await withTimeout(Purchases.getCustomerInfo(), 15000, copy.errors.productQuery));
  } catch (e) {
    setDiag("customerInfo", e);
  }
  return fpSnap;
}

/** 원본이 아닌 필터를 적용했다 — 3일 무료를 아직 시작 안 했으면 지금 시작. 스위치가 꺼져 있으면 아무것도 안 한다. */
export async function startFilterTrialIfNeeded(): Promise<FilterAccess> {
  await loadTrialStart();
  fpNotify();
  if (!fpSnap.enabled || fpDev || fpTrialStart != null) return fpSnap;
  fpTrialStart = Date.now();
  try { await SecureStore.setItemAsync(TRIAL_KEY, String(fpTrialStart)); } catch { /* 기기 저장 실패 — 이번 실행 동안만 */ }
  fpNotify();
  return fpSnap;
}

/** dev 전용 — 상태 강제(스위치도 켠다). null = 강제 해제(실제 상태로). */
export function setFilterDevState(state: FilterDevState | null) {
  if (!__DEV__) return;
  const day = 24 * 60 * 60 * 1000;
  fpDev = state == null ? null : {
    state,
    trialStart: state === "trial" ? Date.now() - day : state === "expired" ? Date.now() - 4 * day : null,
    entitled: state === "unlocked",
    plus: state === "plus",
  };
  fpNotify();
}

/** 카메라 줄·편집기·dev 화면이 같은 상태를 본다. 처음 쓸 때 한 번 다시 읽는다. */
export function useFilterAccess(): FilterAccess {
  const snap = useSyncExternalStore(
    (fn) => { fpListeners.add(fn); return () => { fpListeners.delete(fn); }; },
    () => fpSnap,
  );
  useEffect(() => { void refreshFilterAccess(); }, []);
  return snap;
}

export type FilterPlan = "annual" | "monthly" | "lifetime";
export interface FilterPackage { plan: FilterPlan; priceString: string; _pkg: PurchasesPackage }
/** 상품을 못 불러왔을 때 보여 줄 원화 참고가(오너 결정 가격). */
export const FILTER_PLAN_KRW: Record<FilterPlan, number> = { annual: 4900, monthly: 1900, lifetime: 9900 };
export const FILTER_PLAN_ORDER: FilterPlan[] = ["annual", "monthly", "lifetime"];

function planOf(p: PurchasesPackage): FilterPlan | null {
  if (p.packageType === PACKAGE_TYPE.ANNUAL) return "annual";
  if (p.packageType === PACKAGE_TYPE.MONTHLY) return "monthly";
  if (p.packageType === PACKAGE_TYPE.LIFETIME) return "lifetime";
  const id = baseProductId(p.product?.identifier || "");
  if (id === "rimikimi.filter.annual") return "annual";
  if (id === "rimikimi.filter.monthly") return "monthly";
  if (id === "rimikimi.filter.lifetime") return "lifetime";
  return null;
}

/** RevenueCat offering "filters" 의 3개 상품(연간 → 월간 → 평생). 못 불러오면 []. */
export async function getFilterPackages(): Promise<FilterPackage[]> {
  if (!iapAvailable()) return [];
  try {
    if (!_configured && !(await initIap())) return [];
    const offerings = await withTimeout(Purchases.getOfferings(), 15000, copy.errors.productQuery);
    const off = offerings?.all?.[FILTER_OFFERING];
    const list = (off?.availablePackages || [])
      .map((pkg) => ({ plan: planOf(pkg), pkg }))
      .filter((x): x is { plan: FilterPlan; pkg: PurchasesPackage } => !!x.plan)
      .map(({ plan, pkg }) => ({ plan, priceString: pkg.product?.priceString || "", _pkg: pkg }));
    if (!list.length) setDiag("offering(filters)", new Error(copy.errors.noProducts));
    return FILTER_PLAN_ORDER.map((pl) => list.find((x) => x.plan === pl)).filter((x): x is FilterPackage => !!x);
  } catch (e) {
    setDiag("offering(filters)", e);
    return [];
  }
}

/** 이용권 결제 — 크레딧 적립(/api/iap/grant)은 부르지 않는다. 결과는 entitlement 로만 판단. */
export async function purchaseFilterPackage(p: FilterPackage): Promise<{ cancelled: true } | { cancelled?: false; unlocked: boolean }> {
  if (!iapAvailable()) throw Object.assign(new Error(copy.store.unavailable), { code: "UNAVAILABLE" });
  if (purchaseLock) return { cancelled: true };
  purchaseLock = true;
  try {
    const r = await withTimeout(Purchases.purchasePackage(p._pkg), 180000, copy.errors.pay);
    applyCustomerInfo(r.customerInfo);
    return { unlocked: hasFilterAccess() };
  } catch (e) {
    const err = e as { code?: string; userCancelled?: boolean; message?: string };
    if (err?.userCancelled || err?.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR || err?.code === "1" || /cancel/i.test(err?.message || "")) {
      return { cancelled: true };
    }
    setDiag("purchaseFilter", e);
    throw e;
  } finally {
    purchaseLock = false;
  }
}

/** 구매 복원 → 이용권(또는 plus)이 있으면 unlocked. */
export async function restoreFilterAccess(): Promise<{ unlocked: boolean; error?: string }> {
  const r = await restoreIap();
  if (!r.restored) return { unlocked: false, error: r.error };
  applyCustomerInfo(r.customerInfo);
  return { unlocked: hasFilterAccess() };
}
