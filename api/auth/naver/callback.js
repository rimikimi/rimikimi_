// ============================================================
// 네이버 로그인 — 콜백 처리
//
// 흐름:
//   1. 네이버가 ?code=...&state=... 와 함께 우리에게 돌려보냄
//   2. 쿠키의 state 와 비교 (CSRF 검증)
//   3. code 를 네이버 토큰 엔드포인트에 보내서 access_token 받음
//   4. access_token 으로 네이버 사용자 정보(이메일/이름/ID) 조회
//   5. Supabase 에 그 사용자를 만들거나 찾음 (관리자 권한)
//   6. 그 사용자용 "매직 링크" 발급 → 브라우저를 그쪽으로 redirect
//   7. 매직 링크가 Supabase 세션을 만들고 우리 사이트로 다시 돌려보냄 → 로그인 완료
// ============================================================

import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const naverError = url.searchParams.get("error");

  // 1) 네이버가 에러로 돌아옴 (사용자가 취소 등)
  if (naverError || !code || !state) {
    return goHomeWithError(res, naverError || "네이버 로그인 정보가 부족합니다.");
  }

  // 2) 쿠키에서 우리 측 state / returnTo 꺼내기
  const cookies = parseCookies(req.headers.cookie || "");
  const expectedState = cookies.naver_oauth_state;
  if (!expectedState || expectedState !== state) {
    return goHomeWithError(res, "보안 검증 실패 (state 불일치)");
  }
  const returnTo = cookies.naver_return_to
    ? decodeURIComponent(cookies.naver_return_to)
    : "/";

  // 3) code → access_token 교환
  const tokenParams = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: process.env.NAVER_CLIENT_ID || "",
    client_secret: process.env.NAVER_CLIENT_SECRET || "",
    code,
    state,
  });

  let tokenJson;
  try {
    const tokenRes = await fetch(
      `https://nid.naver.com/oauth2.0/token?${tokenParams}`
    );
    tokenJson = await tokenRes.json();
  } catch (e) {
    return goHomeWithError(res, "네이버 토큰 교환 실패: " + (e?.message || String(e)));
  }
  if (!tokenJson?.access_token) {
    return goHomeWithError(
      res,
      "네이버 토큰 없음: " + (tokenJson?.error_description || "unknown")
    );
  }

  // 4) access_token 으로 사용자 정보 조회
  let me;
  try {
    const meRes = await fetch("https://openapi.naver.com/v1/nid/me", {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    me = await meRes.json();
  } catch (e) {
    return goHomeWithError(res, "네이버 사용자 정보 조회 실패");
  }
  if (me?.resultcode !== "00" || !me?.response) {
    return goHomeWithError(res, "네이버 사용자 응답 오류");
  }

  const naverUser = me.response; // { id, email?, name?, ... }
  // 이메일이 없으면 합성 이메일 (Supabase 는 email 필수)
  const email = naverUser.email || `naver-${naverUser.id}@no-email.local`;
  const displayName = naverUser.name || naverUser.nickname || "네이버사용자";

  // 5) Supabase 관리자 클라이언트 생성
  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // 사용자 만들기 (이미 있으면 에러 던짐 → 무시)
  await supabaseAdmin.auth.admin
    .createUser({
      email,
      email_confirm: true,
      user_metadata: {
        provider: "naver",
        naver_id: naverUser.id,
        full_name: displayName,
      },
    })
    .catch(() => {});

  // 6) 그 이메일로 magic link 발급 (메일 전송 없이 URL 만 받음)
  const { data: linkData, error: linkErr } =
    await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: makeAbsoluteUrl(req, returnTo) },
    });

  if (linkErr || !linkData?.properties?.action_link) {
    return goHomeWithError(
      res,
      "Supabase 로그인 링크 생성 실패: " + (linkErr?.message || "unknown")
    );
  }

  // 7) 쿠키 정리 + magic link 로 redirect
  res.setHeader("Set-Cookie", [
    "naver_oauth_state=; Path=/; HttpOnly; Max-Age=0",
    "naver_return_to=; Path=/; HttpOnly; Max-Age=0",
  ]);
  res.statusCode = 302;
  res.setHeader("Location", linkData.properties.action_link);
  res.end();
}

// ---- helpers ----

function parseCookies(header) {
  const out = {};
  header.split(";").forEach((c) => {
    const [k, ...rest] = c.trim().split("=");
    if (k) out[k] = rest.join("=");
  });
  return out;
}

function makeAbsoluteUrl(req, path) {
  const isHttps = req.headers["x-forwarded-proto"] === "https";
  const proto = isHttps ? "https" : "http";
  const host = req.headers.host;
  // path 가 이미 절대 URL 이면 그대로
  try {
    return new URL(path).toString();
  } catch {
    return `${proto}://${host}${path.startsWith("/") ? path : "/" + path}`;
  }
}

function goHomeWithError(res, message) {
  const params = new URLSearchParams({ auth_error: message });
  res.statusCode = 302;
  res.setHeader("Location", `/?${params}`);
  res.end();
}
