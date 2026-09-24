// Vercel Edge Middleware — 정적 파일보다 먼저 돈다(vercel.json rewrites 는 정적 index.html 에 막힌다).
// ?lang=en 요청이면 영어판 정적 HTML 을 준다: JS 를 안 돌리는 크롤러(AI 검색·링크 미리보기)도
// 영어 제목·설명·본문을 보게. 주소창은 그대로(?lang=en).
//   /          → /index.en.html   (빌드 때 scripts/vite-en-index.mjs 가 생성)
//   /download  → /download.en.html
export const config = { matcher: ["/", "/download"] };

const EN = { "/": "/index.en.html", "/download": "/download.en.html" };

export default function middleware(req) {
  const url = new URL(req.url);
  if (url.searchParams.get("lang") !== "en") return;
  const to = EN[url.pathname];
  if (!to) return;
  url.pathname = to;
  return new Response(null, { headers: { "x-middleware-rewrite": url.toString() } });
}
