// ============================================================
// IAP 크레딧 지급 공용 헬퍼 (grant 엔드포인트 + webhook 공유)
//
//  - PRODUCT_CREDITS : productId → 적립 크레딧 (packages.js ALL_PACKAGES 단일 출처.
//      판매중 상품(PACKAGES) + 레거시 상품(LEGACY_PACKAGES) 을 전부 포함해야
//      과거 productId 의 복원/웹훅 재전송이 "알 수 없는 상품"으로 거부되지 않는다.)
//  - grantCreditsForTransaction : 거래ID 기준 멱등 적립
//      (iap_events 에 거래ID UNIQUE → 중복 호출/웹훅 재전송에도 1회만 적립)
//  - fetchRevenueCatSubscriber : RevenueCat REST 로 구매 재검증
// ============================================================

import { ALL_PACKAGES } from "./payments/packages.js";

export const PRODUCT_CREDITS = Object.fromEntries(
  ALL_PACKAGES.map((p) => [p.id, p.credits])
);

// 🔴 2026-08-19 (claire 682c2ce 이식) 크레딧 지급 전면 불능의 근본원인:
//    RevenueCat 이 v2 의 expand 허용값을 바꿔서 /purchases?expand=items.product 가
//    400 parameter_error("'items.product' is not one of ['items.redemption']") 를 내기
//    시작했다. fetchCustomerPurchases 가 throw → handleGrant 가 502 → 결제는 되는데
//    크레딧이 안 들어간다. 실측: 2026-08-18 06:34~06:40 사이 사용자 3명이 당했다
//    (Vercel 런타임 에러 그룹, /api/iap/[action]).
//    ⇒ expand 에 의존하지 않는다. 상품 식별은 프로젝트 상품 목록으로 직접 해석한다.
//    ⚠️ 여기에 expand 를 다시 추가하지 말 것 — RC 가 언제든 또 막을 수 있고, 막히는
//       순간 매출이 통째로 0 이 된다.
const RC_BASE = "https://api.revenuecat.com/v2";

function rcEnv() {
  const key = process.env.RC_SECRET_KEY;
  const proj = process.env.RC_PROJECT_ID;
  if (!key || !proj) throw new Error("RC_SECRET_KEY / RC_PROJECT_ID 환경변수 누락");
  return { key, proj };
}

async function rcGet(path, { allow404 = false } = {}) {
  const { key } = rcEnv();
  const r = await fetch(RC_BASE + path, { headers: { Authorization: `Bearer ${key}` } });
  if (allow404 && r.status === 404) return null;
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`RevenueCat 조회 실패: ${r.status} ${t.slice(0, 200)}`);
  }
  return r.json();
}

// RC 내부 product_id(prod…) → 스토어 상품ID(rimikimi.pack.intro) 매핑.
// 구매 객체가 store_identifier 를 직접 주지 않고 RC 내부 id 만 주는 경우가 있어서,
// expand 없이도 상품을 특정하려면 이 표가 필요하다. 람다 1회 실행 동안만 캐시.
let _productMapCache = null;
export async function fetchProductMap() {
  if (_productMapCache) return _productMapCache;
  const { proj } = rcEnv();
  const map = new Map();
  let url = `/projects/${proj}/products?limit=100`;
  for (let page = 0; page < 5 && url; page++) {
    const j = await rcGet(url);
    for (const p of j?.items || []) {
      const store = p?.store_identifier || p?.identifier || null;
      if (p?.id && store) map.set(p.id, store);
    }
    url = j?.next_page || null;
  }
  _productMapCache = map;
  return map;
}

// RevenueCat REST v2: 고객의 비구독(소비형) 구매 조회.
// 반환: 구매 배열(없거나 고객 미존재면 []).
export async function fetchCustomerPurchases(appUserId) {
  const { proj } = rcEnv();
  const j = await rcGet(
    `/projects/${proj}/customers/${encodeURIComponent(appUserId)}/purchases`,
    { allow404: true }
  );
  return j?.items || [];
}

// 🔴 2026-08-19 (claire 이식) /purchases 는 비구독만 반환한다. 구독 상품
//    (rimikimi.sub.plus.*)은 여기서 따로 읽어야 한다. 이게 없어서 구독 결제는
//    grant 가 항상 202(pending) → 클라는 "구매 완료"를 띄우는데 크레딧은 0장이었다.
//    (claire 는 2026-08-04 에 같은 버그를 고쳤다.)
export async function fetchCustomerSubscriptions(appUserId) {
  const { proj } = rcEnv();
  const j = await rcGet(
    `/projects/${proj}/customers/${encodeURIComponent(appUserId)}/subscriptions`,
    { allow404: true }
  );
  return j?.items || [];
}

// 구매 객체에서 스토어 상품ID(우리 productId) 추출 (방어적)
// ⚠️ 구글플레이 구독은 `subId:basePlanId` 로 내려온다. 접미사를 안 떼면
//    PRODUCT_CREDITS 조회가 빗나가 적립이 영원히 pending(202) 된다.
export function purchaseStoreId(p, productMap) {
  const direct =
    p?.product?.store_identifier ||
    p?.store_identifier ||
    p?.product_identifier ||
    null;
  if (direct) return stripBasePlan(direct);
  const rcId = p?.product_id || p?.product?.id || null;
  if (rcId && productMap?.get) {
    const mapped = productMap.get(rcId);
    if (mapped) return stripBasePlan(mapped);
  }
  return rcId || null;
}

function stripBasePlan(id) {
  return id ? String(id).split(":")[0] : null;
}

// 구매 객체에서 스토어 거래ID 추출 (멱등 키, 방어적)
export function purchaseTxId(p) {
  return (
    p?.store_purchase_identifier ||
    p?.store_transaction_id ||
    p?.transaction_id ||
    p?.id ||
    null
  );
}

// 구매 시각(ms, 정렬용, 방어적)
export function purchaseTime(p) {
  const v = p?.purchased_at ?? p?.purchase_date ?? p?.created_at ?? 0;
  const n = typeof v === "number" ? v : Date.parse(v);
  return Number.isFinite(n) ? n : 0;
}

// 거래ID 기준 멱등 적립.
// 반환: { ok, credits, alreadyGranted, totalPurchased, totalUsed } 또는 { error }
export async function grantCreditsForTransaction(
  admin,
  { userId, productId, transactionId, store }
) {
  const credits = PRODUCT_CREDITS[productId];
  if (!credits) return { error: `알 수 없는 상품: ${productId}`, status: 400 };
  if (!transactionId) return { error: "거래ID 없음", status: 400 };

  // 1) iap_events 에 거래ID 기록 시도 (UNIQUE 충돌 = 이미 적립됨)
  const { error: insErr } = await admin.from("iap_events").insert({
    transaction_id: String(transactionId),
    user_id: userId,
    product_id: productId,
    credits,
    store: store || null,
  });

  if (insErr) {
    // 23505 = unique_violation → 이미 처리된 거래 (멱등 성공)
    if (insErr.code === "23505") {
      const totals = await getTotals(admin, userId);
      return { ok: true, alreadyGranted: true, credits, ...totals };
    }
    console.error("iap_events insert error", insErr);
    return { error: "적립 기록 실패", status: 500 };
  }

  // 2) 우리가 처음 기록한 거래일 때만 크레딧 적립
  await addCredits(admin, userId, credits);
  const totals = await getTotals(admin, userId);
  return { ok: true, credits, ...totals };
}

// ⚠️ 예전엔 credits_purchased 와 함께 **읽어온 credits_used 를 그대로 되썼다**.
//    두 가지가 터진다:
//      1) 읽기~쓰기 사이에 생성이 크레딧을 쓰면 그 차감이 지워진다. 묶음 생성은
//         120초 넘게 걸리므로 그 사이 결제가 들어오면 실제로 발생한다.
//      2) 같은 구매에 대해 grant 재시도(클라 최대 6회)와 웹훅이 동시에 오면
//         둘 다 같은 current 를 읽고 current+delta 를 써서 **한쪽 구매가 증발한다.**
//         iap_events 의 UNIQUE 는 이중 지급만 막지, 지급 유실은 못 막는다.
//    → credits_used 는 건드리지 않고, credits_purchased 만 CAS 로 올린다.
async function addCredits(admin, userId, delta) {
  await admin
    .from("user_credits")
    .upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true });

  for (let attempt = 0; attempt < 4; attempt++) {
    const { data: row, error } = await admin
      .from("user_credits")
      .select("credits_purchased")
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !row) return false;
    const current = row.credits_purchased || 0;
    const { data: updated, error: updErr } = await admin
      .from("user_credits")
      .update({ credits_purchased: current + delta })
      .eq("user_id", userId)
      .eq("credits_purchased", current)  // 동시 지급이 먼저 바꿨으면 0건 → 재시도
      .select("credits_purchased");
    if (updErr) return false;
    if (updated && updated.length > 0) return true;
  }
  // 여기까지 오면 지급이 안 된 것 — 호출부가 200 을 주기 전에 알아야 한다.
  throw new Error("크레딧 적립 경합 실패 (재시도 초과)");
}

export async function getTotals(admin, userId) {
  const { data } = await admin
    .from("user_credits")
    .select("credits_purchased, credits_used")
    .eq("user_id", userId)
    .maybeSingle();
  return {
    totalPurchased: data?.credits_purchased || 0,
    totalUsed: data?.credits_used || 0,
  };
}
