// ============================================================
// OAuth 로그인 후 돌아갈 경로(returnTo) 안전성 검사 — 오픈 리다이렉트 방지
//
//   허용: "/" 로 시작하는 우리 사이트 내부 상대경로만 (예: "/mypage")
//   거부: 절대 URL(스킴 포함, "https://evil.com"), 프로토콜-상대 URL("//evil.com"),
//         백슬래시 트릭("/\evil.com" 등 — 일부 브라우저가 "//" 로 정규화)
//   거부되면 안전한 기본값 "/" 로 대체한다 (에러를 던지지 않음 — 로그인 자체는 계속 성공).
// ============================================================

const SAFE_DEFAULT = "/";

export function sanitizeReturnTo(raw) {
  if (typeof raw !== "string" || !raw) return SAFE_DEFAULT;
  if (!raw.startsWith("/")) return SAFE_DEFAULT; // 스킴 있는 절대 URL 등 전부 차단
  if (raw.startsWith("//") || raw.startsWith("/\\")) return SAFE_DEFAULT; // 프로토콜-상대 URL 차단

  // 이중 확인: 고정된 내부 base 로 파싱했을 때 origin 이 그대로여야 "진짜 상대경로".
  // (WHATWG URL 파서는 http/https 같은 스페셜 스킴에서 "\" 도 "/" 처럼 host 구분자로
  //  해석하므로, 위 문자열 검사만으론 못 거르는 변형까지 여기서 같이 걸러진다.)
  try {
    const base = "http://internal.safe-redirect-check.invalid";
    const parsed = new URL(raw, base);
    if (parsed.origin !== base) return SAFE_DEFAULT;
  } catch {
    return SAFE_DEFAULT;
  }

  return raw;
}

// path(신뢰할 수 없는 입력이어도 됨) 를 "현재 요청 호스트" 기준 절대 URL 로 변환.
// ⚠️ path 에 스킴/호스트가 들어있어도 그대로 통과시키지 않는다 — 항상 우리 host 로 고정
// (이전 버전은 `new URL(path)` 가 성공하면 그대로 반환해 절대 URL 패스스루 = 오픈 리다이렉트 구멍이었음).
export function makeAbsoluteUrl(req, path) {
  const safePath = sanitizeReturnTo(path);
  const isHttps = req.headers["x-forwarded-proto"] === "https";
  const proto = isHttps ? "https" : "http";
  const host = req.headers.host;
  return `${proto}://${host}${safePath}`;
}

// 네이버 로그인 복귀 주소 — 앱·웹이 실제로 넘기는 것만 허용한다(2026-10-23 오픈 리다이렉트 수정).
//   · 내부 상대경로("/mypage")  · 우리 웹 주소(웹은 window.location.origin + "/" 를 넘긴다)
//   · 네이티브 딥링크 com.rimikimi.app://login-callback (iOS·안드·RN 이 넘긴다)
// 그 밖(외부 사이트 등)은 우리 홈으로.
const OWN_HOSTS = new Set(["rimikimi-app.vercel.app", "app.rimikimi.com", "rimikimi.com", "www.rimikimi.com", "localhost:5173", "localhost:3000"]);
const NATIVE_REDIRECTS = new Set(["com.rimikimi.app://login-callback"]);

export function safeRedirectTarget(req, raw) {
  if (typeof raw === "string" && NATIVE_REDIRECTS.has(raw)) return raw;
  if (typeof raw === "string" && /^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      if (OWN_HOSTS.has(u.host) || u.host === req.headers.host) return u.toString();
    } catch { /* 아래 기본값 */ }
    return makeAbsoluteUrl(req, "/");
  }
  return makeAbsoluteUrl(req, raw);
}
