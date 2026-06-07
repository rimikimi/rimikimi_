// ============================================================
// Apple "Sign in with Apple" 클라이언트 시크릿 자동 갱신 (Vercel Cron)
//
// 왜:
//   Apple 로그인용 client-secret(JWT)은 최대 6개월짜리.
//   만료되면 Apple 로그인이 끊긴다. 그래서 매달 1회 자동으로
//   새 JWT를 만들고 Supabase Auth 설정에 자동 등록한다.
//   (사람이 손댈 필요 없음)
//
// 동작:
//   1) Vercel Cron 이 매달 1일 이 엔드포인트를 호출
//      (Vercel 이 Authorization: Bearer <CRON_SECRET> 를 붙여줌)
//   2) APPLE_P8_KEY(.p8 내용)로 새 180일짜리 JWT 서명
//   3) Supabase Management API 로 external_apple_secret 갱신
//
// 필요한 환경변수 (Vercel):
//   CRON_SECRET            - 호출 인증 (이미 있음)
//   APPLE_P8_KEY           - .p8 파일 내용 (PEM)
//   SUPABASE_ACCESS_TOKEN  - Supabase 계정 Personal Access Token
//   SUPABASE_PROJECT_REF   - 프로젝트 ref (기본값 하드코딩)
// ============================================================

import { createSign } from "node:crypto";

// --- 고정 값 (Apple Developer 콘솔 값) ---
const TEAM_ID = "K6U5MWKT85";              // iss
const KEY_ID = "W3Z37VQNAF";               // kid
const SERVICES_ID = "com.rimikimi.signin"; // sub
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || "hedgjzdrivilclmwumoc";

// 수명: 180일 (Apple 최대 6개월 한도 안쪽)
const LIFETIME_SEC = 180 * 24 * 60 * 60;

function b64url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

// 알림 메일 발송 (Resend). RESEND_API_KEY 가 없으면 조용히 건너뜀(크론은 계속 동작).
async function sendAlert(subject, html) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.ALERT_EMAIL_TO || "ahrimmmk@gmail.com";
  const from = process.env.RESEND_FROM || "rimikimi <onboarding@resend.dev>";
  if (!apiKey) return { skipped: true };
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html }),
    });
    return { ok: r.ok, status: r.status };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

function makeAppleSecret(p8Pem) {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + LIFETIME_SEC;
  const header = { alg: "ES256", kid: KEY_ID };
  const payload = {
    iss: TEAM_ID,
    iat: now,
    exp,
    aud: "https://appleid.apple.com",
    sub: SERVICES_ID,
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signer = createSign("SHA256");
  signer.update(signingInput);
  signer.end();
  // Apple 은 raw(r||s, IEEE P1363) 서명 요구 (DER 아님)
  const signature = signer.sign({ key: p8Pem, dsaEncoding: "ieee-p1363" });
  return { jwt: `${signingInput}.${b64url(signature)}`, exp };
}

export default async function handler(req, res) {
  // 1) Cron 인증: Vercel 이 붙여주는 Bearer 토큰 확인
  const authHeader = req.headers.authorization || "";
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return res.status(401).json({ error: "unauthorized" });
  }

  // 2) 필수 env 확인
  const p8Raw = process.env.APPLE_P8_KEY;
  const sbToken = process.env.SUPABASE_ACCESS_TOKEN;
  if (!p8Raw || !sbToken) {
    await sendAlert(
      "⚠️ rimikimi Apple 키 자동갱신 실패",
      `<p>설정값이 비어 있어 Apple 로그인 키를 갱신하지 못했어요.</p>
       <p>APPLE_P8_KEY: ${p8Raw ? "있음" : "<b>없음</b>"} / SUPABASE_ACCESS_TOKEN: ${sbToken ? "있음" : "<b>없음</b>"}</p>
       <p>Vercel 환경변수를 확인해 주세요. (그동안 기존 키가 만료되면 Apple 로그인이 멈출 수 있어요.)</p>`
    );
    return res.status(500).json({ error: "missing env", hasP8: !!p8Raw, hasToken: !!sbToken });
  }
  // 환경변수에 \n 이 literal 로 들어간 경우 실제 개행으로 복원
  const p8Pem = p8Raw.includes("\\n") ? p8Raw.replace(/\\n/g, "\n") : p8Raw;

  // 3) 새 JWT 서명
  let jwt, exp;
  try {
    ({ jwt, exp } = makeAppleSecret(p8Pem));
  } catch (e) {
    await sendAlert(
      "⚠️ rimikimi Apple 키 자동갱신 실패 (서명 오류)",
      `<p>Apple 키(.p8)로 새 토큰을 만드는 중 오류가 났어요.</p><pre>${String(e.message || e)}</pre>
       <p>APPLE_P8_KEY 값이 깨졌을 수 있어요. keystore/AuthKey_W3Z37VQNAF.p8 로 다시 등록해 주세요.</p>`
    );
    return res.status(500).json({ error: "sign failed", detail: String(e.message || e) });
  }

  // 4) Supabase Auth 설정에 등록 (Management API)
  try {
    const resp = await fetch(
      `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${sbToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          external_apple_enabled: true,
          external_apple_secret: jwt,
        }),
      }
    );
    if (!resp.ok) {
      const text = await resp.text();
      await sendAlert(
        "⚠️ rimikimi Apple 키 자동갱신 실패 (Supabase 등록 오류)",
        `<p>새 키는 만들었는데 Supabase에 등록하는 데 실패했어요. (HTTP ${resp.status})</p>
         <p>Supabase 토큰이 폐기되었거나 권한이 바뀌었을 수 있어요. supabase.com/dashboard/account/tokens 에서 새 토큰을 만들어 Vercel의 SUPABASE_ACCESS_TOKEN 을 교체해 주세요.</p>
         <pre>${text.slice(0, 400)}</pre>`
      );
      return res.status(502).json({ error: "supabase update failed", status: resp.status, detail: text.slice(0, 500) });
    }
  } catch (e) {
    await sendAlert(
      "⚠️ rimikimi Apple 키 자동갱신 실패 (네트워크 오류)",
      `<p>Supabase 요청 중 오류가 났어요.</p><pre>${String(e.message || e)}</pre>`
    );
    return res.status(502).json({ error: "supabase request error", detail: String(e.message || e) });
  }

  const expIso = new Date(exp * 1000).toISOString();
  const kst = new Date(exp * 1000 + 9 * 3600 * 1000).toISOString().replace("T", " ").slice(0, 16);
  await sendAlert(
    "✅ rimikimi Apple 로그인 키 자동 갱신 완료",
    `<p>Apple 로그인 키가 자동으로 새로 발급·등록됐어요. 아무것도 안 하셔도 됩니다 🙂</p>
     <p>새 만료일: <b>${kst} (KST)</b></p>
     <p>다음 자동 갱신: 다음 달 1일</p>`
  );
  return res.status(200).json({ ok: true, message: "Apple secret rotated", expiresAt: expIso });
}
