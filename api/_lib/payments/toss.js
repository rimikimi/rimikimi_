// ============================================================
// 토스페이먼츠 어댑터 (Sandbox + Live 공통)
//
// 환경변수:
//   TOSS_MODE        = "sandbox" | "live"   (없으면 sandbox)
//   TOSS_CLIENT_KEY  = 브라우저용 (test_ck_... 또는 live_ck_...)
//   TOSS_SECRET_KEY  = 서버용 (test_sk_... 또는 live_sk_...)
//
// 토스 결제는 PayPal 과 다르게 "결제창 URL" 이 서버에 없고
// 클라이언트 SDK (window.TossPayments) 가 모달을 띄우는 방식.
// 그래서 createOrder() 는 redirectUrl 대신 sdkInit (클라이언트가
// SDK 부르는 데 필요한 파라미터) 를 돌려준다.
//
// 흐름:
//   1) 클라이언트가 /api/checkout/create 호출 → sdkInit 받음
//   2) 클라이언트가 TossPayments(clientKey).requestPayment(...) 호출
//   3) 결제창에서 사용자 결제 완료
//   4) successUrl 로 리다이렉트 (paymentKey, orderId, amount 쿼리 포함)
//   5) /api/checkout/capture 가 /v1/payments/confirm 호출해서 확정
// ============================================================

const SANDBOX_DEFAULTS = {
  // 토스 공식 문서가 공개한 docs 키 (가맹점 없이도 sandbox 결제 가능)
  clientKey: "test_ck_docs_Ovk5rk1EwkEbP0W43n07xlzm",
  secretKey: "test_sk_docs_OaPz8L5KdmQXkzRz3y47BMw6",
};

function getKeys() {
  const mode = (process.env.TOSS_MODE || "sandbox").toLowerCase();
  const clientKey =
    process.env.TOSS_CLIENT_KEY ||
    (mode === "sandbox" ? SANDBOX_DEFAULTS.clientKey : null);
  const secretKey =
    process.env.TOSS_SECRET_KEY ||
    (mode === "sandbox" ? SANDBOX_DEFAULTS.secretKey : null);
  if (!clientKey || !secretKey) {
    throw new Error("토스페이먼츠 환경변수 누락 (TOSS_CLIENT_KEY/TOSS_SECRET_KEY)");
  }
  return { mode, clientKey, secretKey };
}

function authHeader(secretKey) {
  // 토스는 secretKey + ":" 의 base64 (Basic Auth)
  return "Basic " + Buffer.from(secretKey + ":").toString("base64");
}

// 주문 ID 생성 (영문/숫자/-_ 만 허용, 6~64자)
function genOrderId(userId, pkgId) {
  const ts = Date.now().toString(36);
  const rand = Math.floor(Math.random() * 1e6).toString(36);
  const uid = (userId || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 8);
  return `rmk-${pkgId}-${uid}-${ts}-${rand}`.slice(0, 64);
}

// 결제 시작: 클라이언트에게 SDK 호출 정보 반환
export async function createOrder({ pkg, userId, returnUrl, cancelUrl }) {
  const { mode, clientKey } = getKeys();
  const orderId = genOrderId(userId, pkg.id);
  return {
    externalId: orderId,
    // PayPal과 달리 redirectUrl 없음 — 대신 sdkInit 으로 알려줌
    sdkInit: {
      provider: "toss",
      mode,
      clientKey,
      orderId,
      orderName: `rimikimi ${pkg.label_en} (${pkg.credits} credits)`,
      amount: pkg.krw, // KRW 정수
      currency: "KRW",
      successUrl: returnUrl,
      failUrl: cancelUrl,
      customerKey: `user_${userId}`,
    },
    redirectUrl: null,
    amount_cents: pkg.krw, // KRW 는 1원 = 1
    currency: "KRW",
  };
}

// 결제 확정: successUrl 로 돌아왔을 때 호출
// 입력 externalId 는 orderId. 추가로 paymentKey, amount 필요해서
// capture API 가 toss 어댑터에 한해 paymentKey/amount 도 받게 됨.
export async function captureOrder({ externalId, paymentKey, amount }) {
  if (!paymentKey || !amount) {
    throw new Error("토스 captureOrder: paymentKey/amount 필수");
  }
  const { secretKey } = getKeys();
  const r = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
    method: "POST",
    headers: {
      Authorization: authHeader(secretKey),
      "Content-Type": "application/json",
      "Idempotency-Key": externalId, // 멱등성: 같은 orderId 재호출 안전
    },
    body: JSON.stringify({
      paymentKey,
      orderId: externalId,
      amount: Number(amount),
    }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    // 이미 처리됨 케이스 (멱등성)
    if (data?.code === "ALREADY_PROCESSED_PAYMENT") {
      return {
        ok: true,
        status: "DONE",
        amount_cents: Number(amount),
        currency: "KRW",
        raw: data,
      };
    }
    throw new Error(
      `토스 confirm 실패: ${r.status} ${JSON.stringify(data).slice(0, 300)}`
    );
  }
  return {
    ok: data?.status === "DONE",
    status: data?.status,
    amount_cents: Number(data?.totalAmount || amount),
    currency: "KRW",
    raw: data,
  };
}
