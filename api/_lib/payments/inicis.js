// ============================================================
// KG이니시스 어댑터 — 자리만 잡아둠 (승인 후 채울 것)
//
// 같은 인터페이스 (paypal.js 와 동일):
//   createOrder({ pkg, userId, returnUrl, cancelUrl })
//   captureOrder({ externalId })
//
// 이니시스는 결제 흐름이 약간 달라서 (mobile vs PC, 인증 → 승인 2단계)
// 승인 받은 후 mid/signKey 받으면 그때 구현.
// ============================================================

export async function createOrder() {
  throw new Error("inicis 어댑터는 아직 미구현 (승인 대기)");
}

export async function captureOrder() {
  throw new Error("inicis 어댑터는 아직 미구현 (승인 대기)");
}
