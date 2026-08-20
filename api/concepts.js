// ============================================================
// 컨셉 목록 — /concepts.json 이 이 함수로 rewrite 된다 (vercel.json).
//
// 왜 정적 파일이 아니라 함수인가:
//   컨셉을 "매일 20시(KST)에 2개씩" 자동 공개하기 위해서다. 각 컨셉에 publishAt 을
//   박아두고 여기서 시간이 지난 것만 내려주면, 크론도 재배포도 필요 없고
//   이미 설치된 앱(구버전 포함)까지 전부 같은 URL 을 보므로 그대로 반영된다.
//
// ⚠️ 앱 전체가 이 응답에 의존한다. 외부 호출·DB 없이 정적 import + 필터만 한다.
//    (실패하면 갤러리가 통째로 빈다)
// ============================================================

import ALL from "./_data/concepts.json" with { type: "json" };
import { publishedConcepts } from "./_lib/conceptList.js";

// 앞으로의 드롭 일정 — /api/drops 가 여기로 rewrite 된다.
// ⚠️ 별도 파일로 두면 Vercel Hobby 의 서버리스 함수 12개 상한을 넘어 배포가
//    통째로 실패한다(빌드는 성공하고 "Deploying outputs" 에서 죽음). 그래서 합쳤다.
function dropsResponse(req, res, now) {
  const days = Math.min(60, Math.max(1, parseInt(req.query?.days, 10) || 30));
  const until = now + days * 24 * 60 * 60 * 1000;

  const byTime = new Map();
  for (const c of ALL) {
    if (!c?.publishAt) continue;
    const t = Date.parse(c.publishAt);
    if (!Number.isFinite(t) || t <= now || t > until) continue;
    if (!byTime.has(c.publishAt)) byTime.set(c.publishAt, []);
    byTime.get(c.publishAt).push(c.title);
  }
  const drops = [...byTime.entries()]
    .sort((a, b) => Date.parse(a[0]) - Date.parse(b[0]))
    .map(([at, titles]) => ({ at, count: titles.length, titles }));

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=1800, stale-while-revalidate=3600");
  return res.status(200).send(JSON.stringify(drops));
}

// 공개된 컨셉 개수만 — 랜딩 페이지("N가지 컨셉")가 쓴다.
// 목록 전체는 400KB 라 마케팅 페이지에서 받게 하면 안 된다. 여기서 숫자만 준다.
function countResponse(req, res, now) {
  let n = 0;
  for (const c of ALL) {
    if (!c?.publishAt) { n++; continue; }
    const t = Date.parse(c.publishAt);
    if (!Number.isFinite(t) || t <= now) n++;
  }
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=300, stale-while-revalidate=600");
  return res.status(200).send(JSON.stringify({ total: n }));
}

export default function handler(req, res) {
  // ⚠️ CORS 필수. 네이티브 앱은 capacitor://localhost 에서 이 주소를 부르므로
  //    크로스 오리진이다. 정적 파일일 땐 Vercel 이 알아서 열어줬는데, 함수로
  //    바꾸면서 헤더가 빠져 앱의 fetch 가 통째로 차단됐다 → 앱이 번들된 옛
  //    목록으로 폴백해 새 컨셉이 열흘간 안 보였다(2026-08-05 ~ 08-15).
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  if (req.method === "OPTIONS") return res.status(204).end();

  const now = Date.now();
  if (req.query?.drops) return dropsResponse(req, res, now);
  if (req.query?.count) return countResponse(req, res, now);

  let list;
  try {
    // 필터·고정핀·정렬은 api/_lib/conceptList.js 에 있다. 빌드 때 오프라인 폴백
    // (public/concepts.fallback.json)을 굽는 scripts/build-fallback.mjs 가 같은
    // 함수를 쓰기 때문이다 — 로직이 두 벌이면 폴백이 조용히 어긋난다.
    list = publishedConcepts(ALL, now);
  } catch (_) {
    list = ALL; // 필터가 어떤 이유로든 터지면 전부 내보낸다 (빈 갤러리보다 낫다)
  }

  // 다음 공개 시각까지만 캐시 — 길어야 10분이라 드롭이 늦어도 10분 안에 반영된다.
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader(
    "Cache-Control",
    "public, max-age=0, s-maxage=300, stale-while-revalidate=600"
  );
  res.status(200).send(JSON.stringify(list));
}
