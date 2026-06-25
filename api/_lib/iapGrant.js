// ============================================================
// IAP 크레딧 지급 공용 헬퍼 (grant 엔드포인트 + webhook 공유)
//
//  - PRODUCT_CREDITS : productId → 적립 크레딧 (packages.js 단일 출처)
//  - grantCreditsForTransaction : 거래ID 기준 멱등 적립
//      (iap_events 에 거래ID UNIQUE → 중복 호출/웹훅 재전송에도 1회만 적립)
//  - fetchRevenueCatSubscriber : RevenueCat REST 로 구매 재검증
// ============================================================

import { PACKAGES } from "./payments/packages.js";

export const PRODUCT_CREDITS = Object.fromEntries(
  PACKAGES.map((p) => [p.id, p.credits])
);

// RevenueCat REST v2: 고객(=우리 user.id)의 구매 내역 조회
//   GET /v2/projects/{project}/customers/{customer}/purchases?expand=items.product
// 반환: 구매 배열(없거나 고객 미존재면 []).
export async function fetchCustomerPurchases(appUserId) {
  const key = process.env.RC_SECRET_KEY;
  const proj = process.env.RC_PROJECT_ID;
  if (!key || !proj) throw new Error("RC_SECRET_KEY / RC_PROJECT_ID 환경변수 누락");
  const url =
    `https://api.revenuecat.com/v2/projects/${proj}` +
    `/customers/${encodeURIComponent(appUserId)}/purchases?expand=items.product`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
  if (r.status === 404) return []; // 아직 RevenueCat 에 고객/구매 없음
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`RevenueCat 조회 실패: ${r.status} ${t.slice(0, 200)}`);
  }
  const j = await r.json();
  return j?.items || [];
}

// 구매 객체에서 스토어 상품ID(우리 productId) 추출 (방어적)
export function purchaseStoreId(p) {
  return (
    p?.product?.store_identifier ||
    p?.store_identifier ||
    p?.product_identifier ||
    null
  );
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

async function addCredits(admin, userId, delta) {
  const { data } = await admin
    .from("user_credits")
    .select("credits_purchased, credits_used")
    .eq("user_id", userId)
    .maybeSingle();
  const current = data?.credits_purchased || 0;
  const used = data?.credits_used || 0;
  await admin.from("user_credits").upsert(
    { user_id: userId, credits_purchased: current + delta, credits_used: used },
    { onConflict: "user_id" }
  );
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
