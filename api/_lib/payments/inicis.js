// ============================================================
// KG이니시스 (INIpay Web Standard) 어댑터
//
// 환경변수:
//   INICIS_MODE     = "sandbox" | "live"   (없으면 sandbox)
//   INICIS_MID      = 가맹점 MID
//   INICIS_SIGN_KEY = 사인키 (해시 검증용)
//
// 이니시스 결제도 토스처럼 클라이언트 SDK (INIStdPay) 가 결제창을 띄움.
// 그래서 createOrder() 는 SDK 호출에 필요한 폼 파라미터 + signature 를
// 반환하고, 실제 결제 완료 후 returnUrl 로 POST 콜백이 와서
// captureOrder() 가 그 콜백의 authToken/authUrl 로 승인 요청을 보냄.
//
// 흐름:
//   1) 클라이언트 → /api/checkout/create → sdkInit 받음
//   2) 클라이언트가 INIStdPay.pay(form) 호출 → 결제창
//   3) 결제 완료 → returnUrl 로 POST callback (authToken/authUrl 포함)
//   4) 우리 백엔드가 그 callback 받아서 /api/checkout/capture 트리거
//      (실제로는 callback 핸들러가 따로 필요. 현재는 placeholder)
// ============================================================

import crypto from "node:crypto";

const SANDBOX_DEFAULTS = {
  // 이니시스가 공식 문서에서 공개한 테스트 MID (실제 결제 불가)
  mid: "INIpayTest",
  signKey: "SU5JTElURV9UUklQTEVERVNfS0VZU1RS",
};

function getKeys() {
  const mode = (process.env.INICIS_MODE || "sandbox").toLowerCase();
  const mid =
    process.env.INICIS_MID ||
    (mode === "sandbox" ? SANDBOX_DEFAULTS.mid : null);
  const signKey =
    process.env.INICIS_SIGN_KEY ||
    (mode === "sandbox" ? SANDBOX_DEFAULTS.signKey : null);
  if (!mid || !signKey) {
    throw new Error("이니시스 환경변수 누락 (INICIS_MID/INICIS_SIGN_KEY)");
  }
  return { mode, mid, signKey };
}

// SHA256 → 16진수 소문자
function sha256(s) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

// 주문번호 (영문/숫자/-_, 40자 이하)
function genOid(pkgId) {
  const ts = Date.now().toString(36);
  const rand = Math.floor(Math.random() * 1e6).toString(36);
  return `rmk-${pkgId}-${ts}-${rand}`.slice(0, 40);
}

// ms 단위 timestamp 를 YYYYMMDDhhmmss 로
function fmtTs() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds())
  );
}

export async function createOrder({ pkg, userId, returnUrl, cancelUrl }) {
  const { mode, mid, signKey } = getKeys();
  const oid = genOid(pkg.id);
  const timestamp = fmtTs();
  const price = pkg.krw;
  // 이니시스 signature: SHA256(oid + price + timestamp)
  const signature = sha256(`oid=${oid}&price=${price}&timestamp=${timestamp}`);
  // mKey (사인키 해시) — 위변조 방지용
  const mKey = sha256(signKey);
  // verification: SHA256(oid=...&price=...&signKey=...&timestamp=...)
  const verification = sha256(
    `oid=${oid}&price=${price}&signKey=${signKey}&timestamp=${timestamp}`
  );

  return {
    externalId: oid,
    redirectUrl: null,
    // 프론트가 이 객체로 INIStdPay.pay(form) 호출
    sdkInit: {
      provider: "inicis",
      mode,
      // SDK 스크립트 (INIStdPay.js) URL
      scriptUrl:
        mode === "live"
          ? "https://stdpay.inicis.com/stdjs/INIStdPay.js"
          : "https://stgstdpay.inicis.com/stdjs/INIStdPay.js",
      // INIStdPay.pay() 가 읽는 폼 필드들
      form: {
        version: "1.0",
        mid,
        oid,
        price: String(price),
        timestamp,
        currency: "WON",
        goodname: `rimikimi ${pkg.credits} credits`,
        buyername: `user_${userId.slice(0, 8)}`,
        buyertel: "010-0000-0000", // 결제창에서 사용자가 수정 가능
        buyeremail: "",
        gopaymethod: "Card:Onlinebank:DirectBank:HPP:Mobile:vbank:kakaopay:naverpay:samsungpay:lpay:payco:tosspay",
        acceptmethod: "HPP(1):below1000:centerCd(Y)",
        signature,
        verification,
        mKey,
        returnUrl,
        closeUrl: cancelUrl,
        // languageView=ko 면 한국어, 기타 옵션...
      },
    },
    amount_cents: price,
    currency: "KRW",
  };
}

// 결제 완료 후 returnUrl 로 들어온 callback 에서 authToken/authUrl 받음.
// 우리 백엔드가 그걸로 승인 호출.
export async function captureOrder({ externalId, authToken, authUrl }) {
  if (!authToken || !authUrl) {
    throw new Error("이니시스 captureOrder: authToken/authUrl 필수");
  }
  const { mid, signKey } = getKeys();
  const timestamp = fmtTs();
  const signature = sha256(
    `authToken=${authToken}&timestamp=${timestamp}`
  );
  const verification = sha256(
    `authToken=${authToken}&signKey=${signKey}&timestamp=${timestamp}`
  );

  const params = new URLSearchParams({
    mid,
    authToken,
    timestamp,
    signature,
    verification,
    charset: "UTF-8",
    format: "JSON",
  });

  const r = await fetch(authUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const data = await r.json().catch(() => ({}));
  // 이니시스 응답: resultCode "0000" = 성공
  const ok = data?.resultCode === "0000";
  return {
    ok,
    status: data?.resultCode,
    amount_cents: Number(data?.TotPrice || data?.totalPrice || 0),
    currency: "KRW",
    raw: data,
    // 멱등성: 이미 처리된 거래는 별도 코드 (이니시스 문서 확인 필요)
  };
}
