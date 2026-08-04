// ============================================================
// 앞으로의 컨셉 드롭 일정.
//
// 앱이 이걸 받아서 로컬 알림을 미리 예약한다("새로운 컨셉이 도착했어요").
// 원격 푸시 서버 없이도 드롭 시각에 알림이 뜨는 이유가 이것 — 드롭 시각이
// 고정이라 예약이 가능하다.
//
// 응답: [{ at: ISO, count, titles: [...] }, ...]  (가까운 순, 최대 30일)
// ============================================================

import ALL from "./_data/concepts.json" with { type: "json" };

export default function handler(req, res) {
  const now = Date.now();
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
  res.status(200).send(JSON.stringify(drops));
}
