// ============================================================
// 갤러리 API
//   GET  /api/gallery         → 내 갤러리 (signed URL 포함)
//   POST /api/gallery         → 클라 합성물 1장 보관 (인생네컷 스트립)
//   DELETE /api/gallery?id=N  → 항목 1개 삭제
// ============================================================

import { getAuthedUser } from "./_lib/auth.js";
import { listGallery, deleteItem, saveToGallery } from "./_lib/gallery.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Methods","GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","authorization,content-type");
  if (req.method === "OPTIONS") return res.status(204).end();
  const auth = await getAuthedUser(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const { user, admin } = auth;

  if (req.method === "GET") {
    const result = await listGallery(admin, user.id);
    if (result.error) return res.status(500).json({ error: result.error });
    return res.status(200).json({ items: result.items });
  }

  // 인생네컷처럼 클라에서 합성한 "최종 1장"을 갤러리에 보관.
  // replaceIds = 합성 재료였던 개별 컷들 → 스트립 저장이 성공했을 때만 정리한다
  // (실패 시 컷을 지워버리면 사용자가 아무것도 못 건진다).
  // 사진첩 저장 기록 — 앱(iOS·안드)이 결과를 기기 사진첩에 저장했을 때 한 줄 남긴다(오너 11/20, 저장율 지표).
  // 분모는 user_gallery(서버가 생성 성공한 장마다 자동으로 넣는다), 분자는 이 이벤트의 고유 gallery_id 수.
  // ⚠️ 새 함수 파일을 만들지 않는다 — Vercel Hobby 함수 상한 12개가 꽉 차 있다(generate.js faceCheck 주석).
  if (req.method === "POST" && req.body?.event === "photo_save") {
    const b = req.body;
    const props = {
      gallery_id: b.galleryId != null ? String(b.galleryId).slice(0, 40) : null,
      concept: b.conceptId != null ? String(b.conceptId).slice(0, 20) : null,
      src: String(b.src || "result").slice(0, 20),
      plat: String(b.plat || "").slice(0, 10),
      v: String(b.v || "").slice(0, 20),
    };
    await admin.from("events").insert({ user_id: user.id, anon_id: null, event: "photo_save", props }).then(() => {}, () => {});
    return res.status(200).json({ ok: true });
  }

  if (req.method === "POST") {
    const { base64, mimeType, conceptId, conceptTitle, replaceIds } = req.body || {};
    if (!base64) return res.status(400).json({ error: "base64 required" });
    const saved = await saveToGallery(admin, user, {
      conceptId: conceptId || 0,
      conceptTitle: conceptTitle || null,
      base64,
      mimeType: mimeType || "image/jpeg",
    });
    if (!saved.ok) return res.status(500).json({ error: saved.error });
    if (Array.isArray(replaceIds)) {
      await Promise.all(
        replaceIds
          .map((v) => parseInt(v, 10))
          .filter((v) => Number.isFinite(v))
          .slice(0, 12)
          .map((id) => deleteItem(admin, user.id, id).catch(() => {}))
      );
    }
    return res.status(200).json({ id: saved.id, expiresAt: saved.expiresAt });
  }

  if (req.method === "DELETE") {
    const url = new URL(req.url, "http://x");
    const id = parseInt(url.searchParams.get("id"), 10);
    if (!id) return res.status(400).json({ error: "id required" });
    const result = await deleteItem(admin, user.id, id);
    if (result.error) return res.status(404).json({ error: result.error });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "GET / POST / DELETE 만 받습니다." });
}
