// ============================================================
// 네이버 로그인 — 시작 단계
//
// 하는 일:
//   1. CSRF 방지용 임의 문자열(state) 생성 → 쿠키에 저장
//   2. "로그인 끝나고 어디로 돌아갈지" returnTo 도 쿠키에 저장
//   3. 네이버 인증 페이지로 사용자 브라우저를 redirect
// ============================================================

import crypto from "node:crypto";

export default function handler(req, res) {
  const clientId = process.env.NAVER_CLIENT_ID;
  if (!clientId) {
    res.statusCode = 500;
    return res.end(
      JSON.stringify({ error: "서버에 NAVER_CLIENT_ID 가 설정돼 있지 않습니다." })
    );
  }

  // 1) CSRF 방지용 random state
  const state = crypto.randomBytes(16).toString("hex");

  // 2) returnTo (브라우저가 ?redirectTo=... 로 알려주거나 기본값 "/")
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const returnTo = url.searchParams.get("redirectTo") || "/";

  // 3) 쿠키 두 개 굽기
  const isHttps = req.headers["x-forwarded-proto"] === "https";
  const secureFlag = isHttps ? "; Secure" : "";
  const baseAttrs = `Path=/; HttpOnly; SameSite=Lax; Max-Age=600${secureFlag}`;
  res.setHeader("Set-Cookie", [
    `naver_oauth_state=${state}; ${baseAttrs}`,
    `naver_return_to=${encodeURIComponent(returnTo)}; ${baseAttrs}`,
  ]);

  // 4) 네이버가 우리에게 돌려보낼 콜백 주소 (현재 호스트 기반으로 동적 계산)
  const proto = isHttps ? "https" : "http";
  const host = req.headers.host;
  const callbackUrl = `${proto}://${host}/api/auth/naver/callback`;

  // 5) 네이버 인증 페이지로 redirect
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: callbackUrl,
    state,
  });
  const authUrl = `https://nid.naver.com/oauth2.0/authorize?${params}`;

  res.statusCode = 302;
  res.setHeader("Location", authUrl);
  res.end();
}
