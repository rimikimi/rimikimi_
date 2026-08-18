// ============================================================
// IAP (인앱결제) — RevenueCat 래퍼
//
// 네이티브(iOS/Android)에서만 동작. 웹에서는 모든 함수가 no-op.
//
// 흐름:
//   1) 앱 시작 시 initIap()  → RevenueCat 설정 (익명)
//   2) 로그인 후 loginIap(userId) → RevenueCat app_user_id = 우리 Supabase user.id
//   3) StoreScreen 에서 getIapPacks() 로 스토어 실제 가격 받아 표시
//   4) purchaseIap(pack) 로 결제 → 성공 시 거래정보 반환
//   5) 호출측에서 /api/iap/grant 로 거래ID 전송 → 서버가 RevenueCat 재검증 후 크레딧 지급
//
// 환경변수 (Vite, 빌드 시 주입):
//   VITE_RC_IOS_KEY      = appl_xxx   (RevenueCat Apple 공개키)
//   VITE_RC_ANDROID_KEY  = goog_xxx   (RevenueCat Google 공개키)
// ============================================================

import { isNative, platform, restoreWebViewTouch } from "./nativeBridge";
// ⚠️ 정적 임포트 필수 — 네이티브 WKWebView 에서 lazy chunk 동적 import() 가 영원히
// pending 되는 버그(josephine 시뮬레이터 재현). configure 가 실행되지 않아 IAP 전체가
// 죽고(무한 Processing / 상품 0개), RC 백엔드에 고객 0명이 되던 근본 원인.
import { Purchases as _PurchasesStatic } from "@revenuecat/purchases-capacitor";

// 우리 팩 정의 (서버 packages.js PACKAGES 와 productId 1:1 매칭 필수)
// 소비형(크레딧) + 구독(rimikimi+). 구독은 1갱신당 지급 크레딧.
// 여기 있는 productId 만 스토어에서 조회/구매 대상이 된다 — 즉 "현재 판매중" 목록.
//
// 2026-08-14: 크레딧 팩을 claire.pack.* 와 동일 구조(6/12/24/45장)로 교체(오너 지시).
// ⚠️ 옛 productId(credits10/30/70/120, credits_10/30/70/120)는 여기서 뺐지만 코드에서
// 지우지 않았다 — 과거 구매자 그랜트/웹훅 판정용 매핑은 서버
// api/_lib/payments/packages.js 의 LEGACY_PACKAGES 에 그대로 남아있다. 이미 구매가
// 끝난 소비형 상품이라 이 화면에서 다시 조회/구매할 필요는 없다(복원은 RevenueCat
// restorePurchases() 로 별도 동작, IAP_PRODUCTS 맵과 무관).
export const IAP_PRODUCTS = {
  "rimikimi.pack.intro": 6,
  "rimikimi.pack.mini": 12,
  "rimikimi.pack.standard": 24,
  "rimikimi.pack.pro": 45,
  "rimikimi.sub.plus.weekly": 8,
  "rimikimi.sub.plus.monthly": 30,
  "rimikimi.sub.plus.annual": 240,
  // 옛 구독 — 신규 판매는 안 하지만 **기존 구독자가 갱신 중**이라 남긴다.
  // 여기서 빠지면 갱신 영수증이 "알 수 없는 상품"으로 거부돼 크레딧이 안 들어간다.
  plus_monthly: 20,
  plus_annual: 240,
  rimikimi_plus_monthly: 20,
  rimikimi_plus_annual: 240,
};
export const SUBSCRIPTION_IDS = [
  "rimikimi.sub.plus.weekly", "rimikimi.sub.plus.monthly", "rimikimi.sub.plus.annual",
  "plus_monthly", "plus_annual", "rimikimi_plus_monthly", "rimikimi_plus_annual",
];
export const isSubscription = (id) => SUBSCRIPTION_IDS.includes(id);
export const PRODUCT_IDS = Object.keys(IAP_PRODUCTS);

const RC_IOS_KEY = import.meta.env.VITE_RC_IOS_KEY || "";
const RC_ANDROID_KEY = import.meta.env.VITE_RC_ANDROID_KEY || "";

let _configured = false;
// TestFlight 진단용: 마지막 실패 지점/메시지 (paywall 하단에 노출)
let _lastError = null;
export function getIapDiag() {
  return _lastError ? String(_lastError).slice(0, 200) : null;
}
function setDiag(stage, e) {
  _lastError = `[${stage}] ${e?.code ? e.code + ": " : ""}${e?.message || String(e)}`;
  console.warn("[iap]", _lastError);
}

// 네이티브 호출이 영원히 안 돌아오는 것 방지 (리뷰어 '무한 스피너' 재발 차단)
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, rej) =>
      setTimeout(() => {
        const e = new Error(`${label} 응답이 없어요. 네트워크 확인 후 다시 시도해 주세요.`);
        e.code = "TIMEOUT";
        rej(e);
      }, ms)
    ),
  ]);
}

// 🔴 절대 async 로 프록시를 return/await 하지 말 것 — Capacitor 프록시는 .then 접근을
// 네이티브 호출로 해석해 "Purchases.then() is not implemented" + await 영구 정지 유발.
const getPurchases = () => _PurchasesStatic;

function apiKey() {
  return platform() === "ios" ? RC_IOS_KEY : RC_ANDROID_KEY;
}

// 사용 가능 여부 (네이티브 + 키 존재)
export function iapAvailable() {
  return isNative() && !!apiKey();
}

// 앱 시작 시 1회 호출 (실패해도 이후 getIapPacks/purchase 에서 재시도됨)
export async function initIap(userId) {
  if (!iapAvailable() || _configured) return _configured;
  try {
    const Purchases = getPurchases();
    await withTimeout(
      Purchases.configure({ apiKey: apiKey(), appUserID: userId || undefined }),
      15000,
      "결제 초기화"
    );
    _configured = true;
    _lastError = null;
  } catch (e) {
    setDiag("configure", e);
  }
  return _configured;
}

// 로그인 후 (우리 user.id 로 RevenueCat 식별자 정렬)
export async function loginIap(userId) {
  if (!iapAvailable() || !userId) return;
  try {
    if (!_configured) await initIap(userId);
    const Purchases = getPurchases();
    await Purchases.logIn({ appUserID: String(userId) });
  } catch (e) {
    console.warn("[iap] logIn 실패", e);
  }
}

export async function logoutIap() {
  if (!iapAvailable() || !_configured) return;
  try {
    const Purchases = getPurchases();
    await Purchases.logOut();
  } catch {}
}

// 스토어에서 실제 상품/가격 받아오기
// 반환: [{ id, count, priceString, isSub, _product }]
// getProducts 직접 조회 (Offerings 스킵 — 빈 오퍼링이 error23 + 로딩지연만 냈음).
export async function getIapPacks() {
  if (!iapAvailable()) return [];
  // configure 안 됐으면 여기서 재시도 (앱 시작 시 일시 실패해도 paywall 열 때 복구)
  if (!_configured) {
    const ok = await initIap();
    if (!ok) return [];
  }
  const Purchases = getPurchases();
  try {
    // ⚠️ 안드로이드는 한 번에 한 종류만 조회된다. type 을 안 주면 기본값이
    //    SUBSCRIPTION 이라 크레딧 팩(비구독)이 통째로 안 나온다 — 실제로
    //    안드로이드에서만 결제가 안 됐던 원인(2026-08-18). iOS 는 이 값을
    //    무시하므로 한 번만 부르면 되지만, 두 번 불러도 결과는 같다.
    const products = await fetchAllProducts(Purchases);
    const mapped = (products || [])
      .filter((pr) => pr.identifier in IAP_PRODUCTS)
      .map((pr) => ({
        id: pr.identifier,
        count: IAP_PRODUCTS[pr.identifier],
        priceString: pr.priceString || "",
        isSub: isSubscription(pr.identifier),
        _product: pr,
      }));
    if (mapped.length) _lastError = null;
    else if (!_lastError) setDiag("getProducts", new Error("스토어가 상품 0개를 반환"));
    return sortPacks(mapped);
  } catch (e) {
    setDiag("getProducts", e);
    return [];
  }
}

// 구독·비구독을 각각 조회해 합친다.
// 한쪽이 실패해도 다른 쪽은 살린다 — 팩은 되는데 구독만 안 되는 상황에서
// 화면이 통째로 비는 것보다 낫다.
async function fetchAllProducts(Purchases) {
  const subIds = PRODUCT_IDS.filter(isSubscription);
  const oneTimeIds = PRODUCT_IDS.filter((id) => !isSubscription(id));
  const calls = [];
  if (subIds.length) {
    calls.push({ productIdentifiers: subIds, type: "SUBSCRIPTION" });
  }
  if (oneTimeIds.length) {
    calls.push({ productIdentifiers: oneTimeIds, type: "NON_SUBSCRIPTION" });
  }
  const results = await Promise.all(
    calls.map((opts) =>
      withTimeout(Purchases.getProducts(opts), 15000, "상품 조회")
        .then((r) => r?.products || [])
        .catch((e) => { setDiag(`getProducts(${opts.type})`, e); return []; })
    )
  );
  return results.flat();
}

function sortPacks(arr) {
  return arr.slice().sort((a, b) => a.count - b.count);
}

// 결제 실행. 성공 시 { transactionId, productId } 반환, 취소 시 { cancelled:true }
// _product 가 없으면(스토어 상품 미로드) 명확히 실패시켜 UI 가 무한 스피너에 빠지지 않게.
export async function purchaseIap(pack) {
  if (!iapAvailable()) throw new Error("결제를 사용할 수 없어요.");
  if (!pack._pkg && !pack._product) {
    const e = new Error(
      "상품 정보를 불러오지 못했어요. 네트워크 확인 후 다시 시도해 주세요." +
        (_lastError ? ` (${_lastError})` : "")
    );
    e.code = "NO_PRODUCT";
    throw e;
  }
  const Purchases = getPurchases();
  try {
    let info;
    // 결제 시트는 사용자가 오래 붙잡을 수 있으니 타임아웃을 길게(3분).
    if (pack._pkg) {
      const r = await withTimeout(Purchases.purchasePackage({ aPackage: pack._pkg }), 180000, "결제");
      info = r.customerInfo;
    } else {
      const r = await withTimeout(Purchases.purchaseStoreProduct({ product: pack._product }), 180000, "결제");
      info = r.customerInfo;
    }
    const txId = latestTxId(info, pack.id);
    return { transactionId: txId, productId: pack.id };
  } catch (e) {
    if (e?.code === "1" || e?.userCancelled || e?.message?.includes("cancel")) {
      return { cancelled: true };
    }
    setDiag("purchase", e);
    throw e;
  } finally {
    // Play 결제 시트는 별도 액티비티라, 닫히고 돌아오면 안드로이드 WebView 가
    // 터치를 못 받는 프리즈가 난다(취소·실패 포함이라 finally 에 둔다).
    restoreWebViewTouch();
  }
}

// 구매 복원 (App Store 3.1.1). { restored, customerInfo } 반환, 웹은 no-op.
export async function restoreIap() {
  if (!iapAvailable()) return { restored: false };
  try {
    const Purchases = getPurchases();
    const { customerInfo } = await Purchases.restorePurchases();
    return { restored: true, customerInfo };
  } catch (e) {
    console.warn("[iap] restorePurchases 실패", e);
    return { restored: false, error: e?.message || String(e) };
  }
}

// customerInfo 에서 해당 상품의 최신 비구독(소비형) 거래ID 추출
function latestTxId(info, productId) {
  try {
    const txns = info?.nonSubscriptionTransactions || [];
    const mine = txns.filter(
      (t) => t.productIdentifier === productId || t.productId === productId
    );
    if (!mine.length) return null;
    const last = mine[mine.length - 1];
    return last.transactionIdentifier || last.transactionId || last.id || null;
  } catch {
    return null;
  }
}
