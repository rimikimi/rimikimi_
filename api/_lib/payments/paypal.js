// ============================================================
// PayPal 어댑터 (Sandbox + Live 양쪽 지원)
//
// 환경변수:
//   PAYPAL_MODE        = "sandbox" | "live"
//   PAYPAL_CLIENT_ID
//   PAYPAL_SECRET
//
// 공통 인터페이스 (다른 어댑터도 이 모양으로 맞춤):
//   createOrder({ pkg, userId, returnUrl, cancelUrl })
//     → { externalId, redirectUrl, amount_cents, currency }
//   captureOrder({ externalId })
//     → { ok, status, amount_cents, currency, raw }
// ============================================================

function endpoint() {
  const mode = (process.env.PAYPAL_MODE || "sandbox").toLowerCase();
  return mode === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

async function accessToken() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_SECRET;
  if (!clientId || !secret) throw new Error("PayPal 환경변수 누락");
  const basic = Buffer.from(`${clientId}:${secret}`).toString("base64");
  const r = await fetch(`${endpoint()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`PayPal 토큰 발급 실패: ${r.status} ${t.slice(0, 200)}`);
  }
  const j = await r.json();
  return j.access_token;
}

// 주문 생성 → PayPal 결제창 URL 반환
export async function createOrder({ pkg, userId, returnUrl, cancelUrl }) {
  const token = await accessToken();
  const body = {
    intent: "CAPTURE",
    purchase_units: [
      {
        reference_id: `${pkg.id}__${userId}`,
        description: `rimikimi ${pkg.label_en} (${pkg.credits} credits)`,
        amount: { currency_code: "USD", value: pkg.usd },
        custom_id: `${userId}::${pkg.id}`,
      },
    ],
    application_context: {
      brand_name: "rimikimi",
      shipping_preference: "NO_SHIPPING",
      user_action: "PAY_NOW",
      return_url: returnUrl,
      cancel_url: cancelUrl,
    },
  };
  const r = await fetch(`${endpoint()}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`PayPal 주문 생성 실패: ${r.status} ${t.slice(0, 300)}`);
  }
  const data = await r.json();
  const approve = (data.links || []).find((l) => l.rel === "approve");
  if (!approve?.href) throw new Error("PayPal approve URL 없음");
  return {
    externalId: data.id,
    redirectUrl: approve.href,
    amount_cents: Math.round(parseFloat(pkg.usd) * 100),
    currency: "USD",
  };
}

// PayPal 주문 capture (결제 확정) — 멱등성 있음
// 이미 캡처된 주문은 422 + INSTRUMENT_DECLINED / ORDER_ALREADY_CAPTURED
export async function captureOrder({ externalId }) {
  const token = await accessToken();
  const r = await fetch(
    `${endpoint()}/v2/checkout/orders/${externalId}/capture`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );
  const data = await r.json().catch(() => ({}));

  // 이미 캡처된 주문이면 GET 으로 조회해서 결과 받기
  if (!r.ok) {
    const issue = (data?.details || [])[0]?.issue;
    if (issue === "ORDER_ALREADY_CAPTURED") {
      const got = await getOrder(token, externalId);
      return parseCaptureResult(got);
    }
    throw new Error(
      `PayPal capture 실패: ${r.status} ${JSON.stringify(data).slice(0, 300)}`
    );
  }
  return parseCaptureResult(data);
}

async function getOrder(token, externalId) {
  const r = await fetch(`${endpoint()}/v2/checkout/orders/${externalId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`PayPal 주문 조회 실패: ${r.status}`);
  return await r.json();
}

function parseCaptureResult(data) {
  const status = data?.status; // "COMPLETED" 이어야 정상
  const cap = data?.purchase_units?.[0]?.payments?.captures?.[0];
  const amount = cap?.amount?.value || data?.purchase_units?.[0]?.amount?.value;
  const currency =
    cap?.amount?.currency_code ||
    data?.purchase_units?.[0]?.amount?.currency_code ||
    "USD";
  return {
    ok: status === "COMPLETED",
    status,
    amount_cents: amount ? Math.round(parseFloat(amount) * 100) : null,
    currency,
    raw: data,
  };
}
