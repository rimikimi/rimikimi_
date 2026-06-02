// ============================================================
// POST /api/checkout/capture
// 입력:  { provider: "paypal", externalId: "..." }
// 출력:  { ok, credits, totalPurchased }
//
// 흐름:
//   1) 로그인 검증
//   2) DB 에서 해당 purchase 찾기 (본인 것인지 확인)
//   3) 이미 paid 면 멱등 처리 (다시 적립하지 않음)
//   4) provider 어댑터로 외부 결제 검증/캡처
//   5) DB 업데이트: status='paid', paid_at, raw
//   6) user_credits.credits_purchased += pkg.credits  (멱등 보장됨, 4의 외부 응답 기준 X — 우리 DB 상태로 분기)
// ============================================================

import { getAuthedUser } from "../_lib/auth.js";
import { getAdapter } from "../_lib/payments/registry.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "POST 만 허용됩니다." });
  }

  const { user, admin, error, status } = await getAuthedUser(req);
  if (error) return res.status(status).json({ error });

  const { provider, externalId } = req.body || {};
  if (!provider || !externalId) {
    return res.status(400).json({ error: "provider, externalId 필수" });
  }

  // 1) DB 에서 우리 쪽 기록 찾기
  const { data: purchase, error: selErr } = await admin
    .from("purchases")
    .select("*")
    .eq("provider", provider)
    .eq("external_id", externalId)
    .maybeSingle();
  if (selErr) {
    console.error("purchases select error", selErr);
    return res.status(500).json({ error: "DB 조회 실패" });
  }
  if (!purchase) {
    return res.status(404).json({ error: "주문을 찾을 수 없어요" });
  }
  if (purchase.user_id !== user.id) {
    return res.status(403).json({ error: "본인 주문이 아닙니다" });
  }

  // 2) 이미 paid → 멱등 응답 (재호출 안전)
  if (purchase.status === "paid") {
    const totals = await getTotals(admin, user.id);
    return res.status(200).json({
      ok: true,
      alreadyPaid: true,
      credits: purchase.credits,
      ...totals,
    });
  }
  if (purchase.status === "failed" || purchase.status === "cancelled") {
    return res
      .status(409)
      .json({ error: `이미 종료된 주문입니다 (${purchase.status})` });
  }

  // 3) 외부 검증/캡처
  let captured;
  try {
    const adapter = getAdapter(provider);
    captured = await adapter.captureOrder({ externalId });
  } catch (e) {
    console.error("adapter capture error", e);
    await admin
      .from("purchases")
      .update({ status: "failed", raw: { error: String(e.message || e) } })
      .eq("id", purchase.id);
    return res.status(502).json({ error: "결제 검증 실패: " + e.message });
  }

  if (!captured.ok) {
    await admin
      .from("purchases")
      .update({
        status: "failed",
        raw: captured.raw,
      })
      .eq("id", purchase.id);
    return res
      .status(402)
      .json({ error: `결제 미완료 (status=${captured.status})` });
  }

  // 4) 우리 DB 트랜잭션: status=paid + credits_purchased += pkg.credits
  // 핵심: WHERE status='created' 조건으로 UPDATE → 다른 동시 호출이 이미 paid 로 만들었다면 매치 0건 → 적립 스킵 (멱등)
  const { data: upd, error: updErr } = await admin
    .from("purchases")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      raw: captured.raw,
    })
    .eq("id", purchase.id)
    .eq("status", "created")
    .select("id, credits")
    .maybeSingle();

  if (updErr) {
    console.error("purchases mark paid error", updErr);
    return res.status(500).json({ error: "결제 기록 실패" });
  }

  if (upd) {
    // 우리가 정말로 created→paid 로 바꾼 첫 호출일 때만 크레딧 적립
    await addCredits(admin, user.id, purchase.credits);
  }

  const totals = await getTotals(admin, user.id);
  return res.status(200).json({
    ok: true,
    credits: purchase.credits,
    ...totals,
  });
}

async function addCredits(admin, userId, delta) {
  // upsert pattern
  const { data } = await admin
    .from("user_credits")
    .select("credits_purchased, credits_used")
    .eq("user_id", userId)
    .maybeSingle();
  const current = data?.credits_purchased || 0;
  const used = data?.credits_used || 0;
  await admin.from("user_credits").upsert(
    {
      user_id: userId,
      credits_purchased: current + delta,
      credits_used: used,
    },
    { onConflict: "user_id" }
  );
}

async function getTotals(admin, userId) {
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
