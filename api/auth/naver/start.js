// ============================================================
// 네이버 로그인 — 시작 단계
//
// 하는 일:
//   1. CSRF 방지용 임의 문자열(state) 생성 → 쿠키에 저장
//   2. "로그인 끝나고 어디로 돌아갈지" returnTo 도 쿠키에 저장
//   3. 네이버 인증 페이지로 사용자 브라우저를 redirect
// ============================================================

import crypto from "node:crypto";

// ⚠️ 2026-09-26: 네이버 개발자센터에서 rimikimi 앱이 아직 "개발 중" 상태(검수 전)라 등록된
//    테스트 아이디만 로그인된다 — 일반 사용자는 네이버 화면에서 "입력하신 아이디로 로그인할 수
//    없습니다"를 본다(스레드 신고). 검수 통과 전까지는 네이버로 보내지 않고 안내 페이지를 보여 준다.
//    검수 통과 후: Vercel 환경변수 NAVER_LOGIN_OPEN=1 (또는 아래 기본값을 true 로) + 웹 LoginGate 의 NAVER_LOGIN_OPEN.
const NAVER_LOGIN_OPEN = process.env.NAVER_LOGIN_OPEN === "1";

const NOTICE = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>rimikimi</title><style>body{margin:0;font-family:-apple-system,system-ui,sans-serif;background:#FBF8F3;color:#231F20;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px;box-sizing:border-box}
.c{max-width:360px;text-align:center}h1{font-size:20px;margin:0 0 10px}p{font-size:15px;line-height:1.55;color:#6b6460;margin:0 0 8px}</style></head>
<body><div class="c"><h1>네이버 로그인 준비 중이에요</h1>
<p>지금은 Apple · Google · 카카오 로그인을 이용해 주세요.<br>이 창을 닫고 다른 방법을 선택하면 돼요.</p>
<p style="margin-top:18px;font-size:13px">Naver login is coming soon. Please close this window and sign in with Apple, Google or Kakao.</p></div></body></html>`;

export default function handler(req, res) {
  if (!NAVER_LOGIN_OPEN) {
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    return res.end(NOTICE);
  }
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
