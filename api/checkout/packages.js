// ============================================================
// GET /api/checkout/packages
// 인증 불필요. 가격표 단일 진실원.
// 프론트는 이 응답으로 store 화면을 렌더.
// ============================================================

import { PACKAGES } from "../_lib/payments/packages.js";

// 각 PG 사용 가능 여부는 환경변수가 채워져 있을 때만 true.
// (사장님이 키 발급 후 .env 에 채우면 자동으로 사용 가능 상태가 됨)
function providerAvailable(name) {
  if (name === "paypal") {
    return !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_SECRET);
  }
  if (name === "toss") {
    // sandbox 는 docs 키 fallback 이 있어서 항상 가능
    const mode = (process.env.TOSS_MODE || "sandbox").toLowerCase();
    if (mode === "sandbox") return true;
    return !!(process.env.TOSS_CLIENT_KEY && process.env.TOSS_SECRET_KEY);
  }
  if (name === "inicis") {
    const mode = (process.env.INICIS_MODE || "sandbox").toLowerCase();
    if (mode === "sandbox") return true;
    return !!(process.env.INICIS_MID && process.env.INICIS_SIGN_KEY);
  }
  return false;
}

export default function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "GET 만 허용됩니다." });
  }
  res.setHeader("Cache-Control", "public, max-age=60"); // 1분 캐시
  return res.status(200).json({
    packages: PACKAGES,
    providers: [
      {
        id: "paypal",
        label_ko: "PayPal",
        label_en: "PayPal",
        sublabel_ko: "해외 카드 / PayPal 계정",
        sublabel_en: "International card / PayPal",
        currency: "USD",
        available: providerAvailable("paypal"),
      },
      {
        id: "toss",
        label_ko: "토스페이먼츠",
        label_en: "Toss Payments",
        sublabel_ko: "신용카드 / 토스페이 / 카카오페이 / 네이버페이 / 계좌이체",
        sublabel_en: "Card / KakaoPay / NaverPay / Bank transfer",
        currency: "KRW",
        available: providerAvailable("toss"),
      },
      {
        id: "inicis",
        label_ko: "KG이니시스",
        label_en: "KG Inicis",
        sublabel_ko: "신용카드 / 카카오페이 / 네이버페이 / 계좌이체",
        sublabel_en: "Card / KakaoPay / NaverPay / Bank transfer",
        currency: "KRW",
        available: providerAvailable("inicis"),
      },
    ],
  });
}
