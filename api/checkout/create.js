// ============================================================
// POST /api/checkout/create
// 입력:  { provider: "paypal", packageId: "credits_10" }
// 출력:  { redirectUrl, purchaseId }
//
// 흐름:
//   1) 로그인 검증
//   2) 패키지 유효성 확인
//   3) provider 어댑터로 외부 주문 생성 (예: PayPal Order)
//   4) purchases 테이블에 status='created' 로 한 줄 INSERT
//   5) 사용자를 PayPal 결제창으로 보낼 URL 반환
// ============================================================

import { getAuthedUser } from "../_lib/auth.js";
import { findPackage } from "../_lib/payments/packages.js";
import { getAdapter, SUPPORTED_PROVIDERS } from "../_lib/payments/registry.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "POST 만 허용됩니다." });
  }

  const { user, admin, error, status } = await getAuthedUser(req);
  if (error) return res.status(status).json({ error });

  const { provider, packageId } = req.body || {};
  if (!SUPPORTED_PROVIDERS.includes(provider)) {
    return res.status(400).json({ error: "잘못된 결제수단입니다." });
  }
  const pkg = findPackage(packageId);
  if (!pkg) {
    return res.status(400).json({ error: "잘못된 패키지입니다." });
  }

  // 돌아올 URL (success/cancel)
  const origin =
    req.headers.origin ||
    `https://${req.headers.host || "rimikimi.com"}`;
  const returnUrl = `${origin}/checkout/success?provider=${provider}`;
  const cancelUrl = `${origin}/checkout/cancel?provider=${provider}`;

  try {
    const adapter = getAdapter(provider);
    const order = await adapter.createOrder({
      pkg,
      userId: user.id,
      returnUrl,
      cancelUrl,
    });

    // DB 기록 (status=created)
    const { data: row, error: insErr } = await admin
      .from("purchases")
      .insert({
        user_id: user.id,
        provider,
        external_id: order.externalId,
        package_id: pkg.id,
        credits: pkg.credits,
        amount_cents: order.amount_cents,
        currency: order.currency,
        status: "created",
      })
      .select("id")
      .single();
    if (insErr) {
      console.error("purchases insert error", insErr);
      // 이미 외부 주문은 만들어졌으니 사용자에겐 URL 은 돌려줌
    }

    return res.status(200).json({
      redirectUrl: order.redirectUrl || null,
      sdkInit: order.sdkInit || null, // 토스/이니시스 같은 SDK 방식
      externalId: order.externalId,
      purchaseId: row?.id || null,
      provider,
    });
  } catch (e) {
    console.error("checkout/create error", e);
    return res.status(500).json({ error: e.message || "결제 시작 실패" });
  }
}
