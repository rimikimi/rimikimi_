// ============================================================
// IAP (인앱결제) — RevenueCat 래퍼
//
// 네이티브(iOS/Android)에서만 동작. 웹에서는 모든 함수가 no-op.
//
// 흐름:
//   1) 앱 시작 시 initIap()  → RevenueCat 설정 (익명)
//   2) 로그인 후 loginIap(userId) → RevenueCat app_user_id = 우리 Supabase user.id
//   3) StoreScreen 에서 getIapPacks() 로 스토어 실제 가격 받아 표시
//   4) purchaseIap(productId) 로 결제 → 성공 시 거래정보 반환
//   5) 호출측에서 /api/iap/grant 로 거래ID 전송 → 서버가 RevenueCat 재검증 후 크레딧 지급
//
// 환경변수 (Vite, 빌드 시 주입):
//   VITE_RC_IOS_KEY      = appl_xxx   (RevenueCat Apple 공개키)
//   VITE_RC_ANDROID_KEY  = goog_xxx   (RevenueCat Google 공개키)
// ============================================================

import { isNative, platform } from "./nativeBridge";

// 우리 팩 정의 (서버 packages.js 와 productId 1:1 매칭 필수)
export const IAP_PRODUCTS = {
  credits_10: 10,
  credits_30: 30,
  credits_70: 70,
  credits_120: 120,
};
export const PRODUCT_IDS = Object.keys(IAP_PRODUCTS);

const RC_IOS_KEY = import.meta.env.VITE_RC_IOS_KEY || "";
const RC_ANDROID_KEY = import.meta.env.VITE_RC_ANDROID_KEY || "";

let _Purchases = null;
let _configured = false;

async function getPurchases() {
  if (_Purchases) return _Purchases;
  const mod = await import("@revenuecat/purchases-capacitor");
  _Purchases = mod.Purchases;
  return _Purchases;
}

function apiKey() {
  return platform() === "ios" ? RC_IOS_KEY : RC_ANDROID_KEY;
}

// 사용 가능 여부 (네이티브 + 키 존재)
export function iapAvailable() {
  return isNative() && !!apiKey();
}

// 앱 시작 시 1회 호출
export async function initIap(userId) {
  if (!iapAvailable() || _configured) return;
  try {
    const Purchases = await getPurchases();
    await Purchases.configure({
      apiKey: apiKey(),
      appUserID: userId || undefined,
    });
    _configured = true;
  } catch (e) {
    console.warn("[iap] configure 실패", e);
  }
}

// 로그인 후 (우리 user.id 로 RevenueCat 식별자 정렬)
export async function loginIap(userId) {
  if (!iapAvailable() || !userId) return;
  try {
    if (!_configured) await initIap(userId);
    const Purchases = await getPurchases();
    await Purchases.logIn({ appUserID: String(userId) });
  } catch (e) {
    console.warn("[iap] logIn 실패", e);
  }
}

export async function logoutIap() {
  if (!iapAvailable() || !_configured) return;
  try {
    const Purchases = await getPurchases();
    await Purchases.logOut();
  } catch {}
}

// 스토어에서 실제 상품/가격 받아오기
// 반환: [{ id, count, priceString, _pkg|_product }]
export async function getIapPacks() {
  if (!iapAvailable()) return [];
  const Purchases = await getPurchases();
  // 1) Offerings 우선 (RevenueCat 권장)
  try {
    const { current } = await Purchases.getOfferings();
    const pkgs = current?.availablePackages || [];
    const mapped = pkgs
      .map((p) => {
        const pid = p.product?.identifier;
        if (!pid || !(pid in IAP_PRODUCTS)) return null;
        return {
          id: pid,
          count: IAP_PRODUCTS[pid],
          priceString: p.product?.priceString || "",
          _pkg: p,
        };
      })
      .filter(Boolean);
    if (mapped.length) return sortPacks(mapped);
  } catch (e) {
    console.warn("[iap] getOfferings 실패, getProducts 로 폴백", e);
  }
  // 2) 폴백: 상품 직접 조회
  try {
    const { products } = await Purchases.getProducts({
      productIdentifiers: PRODUCT_IDS,
    });
    const mapped = (products || [])
      .filter((pr) => pr.identifier in IAP_PRODUCTS)
      .map((pr) => ({
        id: pr.identifier,
        count: IAP_PRODUCTS[pr.identifier],
        priceString: pr.priceString || "",
        _product: pr,
      }));
    return sortPacks(mapped);
  } catch (e) {
    console.warn("[iap] getProducts 실패", e);
    return [];
  }
}

function sortPacks(arr) {
  return arr.slice().sort((a, b) => a.count - b.count);
}

// 결제 실행. 성공 시 { transactionId, productId } 반환, 취소 시 { cancelled:true }
export async function purchaseIap(pack) {
  if (!iapAvailable()) throw new Error("결제를 사용할 수 없어요.");
  const Purchases = await getPurchases();
  try {
    let info;
    if (pack._pkg) {
      const r = await Purchases.purchasePackage({ aPackage: pack._pkg });
      info = r.customerInfo;
    } else if (pack._product) {
      const r = await Purchases.purchaseStoreProduct({ product: pack._product });
      info = r.customerInfo;
    } else {
      throw new Error("상품 정보가 없어요.");
    }
    const txId = latestTxId(info, pack.id);
    return { transactionId: txId, productId: pack.id };
  } catch (e) {
    if (e?.code === "1" || e?.userCancelled || e?.message?.includes("cancel")) {
      return { cancelled: true };
    }
    throw e;
  }
}

// 구매 복원 (App Store 3.1.1 필수). 성공 시 customerInfo 반환, 웹은 no-op.
export async function restoreIap() {
  if (!iapAvailable()) return null;
  const Purchases = await getPurchases();
  try {
    const { customerInfo } = await Purchases.restorePurchases();
    return customerInfo;
  } catch (e) {
    console.warn("[iap] restorePurchases 실패", e);
    throw e;
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
