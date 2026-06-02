// ============================================================
// GET /api/checkout/packages
// 인증 불필요. 가격표 단일 진실원.
// 프론트는 이 응답으로 store 화면을 렌더.
// ============================================================

import { PACKAGES } from "../_lib/payments/packages.js";

export default function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "GET 만 허용됩니다." });
  }
  res.setHeader("Cache-Control", "public, max-age=300"); // 5분 캐시
  return res.status(200).json({
    packages: PACKAGES,
    providers: [
      { id: "paypal", label_ko: "PayPal", label_en: "PayPal", available: true },
      {
        id: "inicis",
        label_ko: "카드 / 카카오페이 / 네이버페이",
        label_en: "Card / KakaoPay / NaverPay",
        available: false, // 승인 받으면 true 로
      },
    ],
  });
}
