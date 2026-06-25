// ============================================================
// 최근 사람들이 가장 많이 "만든" 컨셉 TOP 5.
//   - user_gallery(생성 이력) 의 concept_id 를 최근 60일 기준으로 집계.
//   - 공개 GET (집계값이라 로그인 불필요). 실패해도 빈 배열 반환 → 프론트가 폴백.
//   - CDN 5분 캐시 (자주 안 바뀌고, 매 요청 DB 안 때리도록).
// ============================================================
import { makeAdmin } from "./_lib/auth.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Methods","GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","authorization,content-type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") {
    return res.status(405).json({ error: "GET 만 받습니다." });
  }
  try {
    const admin = makeAdmin();
    const cutoff = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString();
    const { data, error } = await admin
      .from("user_gallery")
      .select("concept_id, created_at")
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(3000);
    if (error) throw error;

    // 최근순으로 들어온 행을 카운트 (동률이면 더 최근 컨셉이 앞)
    const counts = new Map();
    for (const r of data || []) {
      if (r.concept_id == null) continue;
      counts.set(r.concept_id, (counts.get(r.concept_id) || 0) + 1);
    }
    const top = [...counts.entries()]
      .sort((a, b) => b[1] - a[1]) // 안정 정렬 → 동률은 삽입(최근)순 유지
      .slice(0, 5)
      .map(([id, count]) => ({ id, count }));

    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
    return res.status(200).json({ popular: top });
  } catch (e) {
    return res.status(200).json({ popular: [] });
  }
}
