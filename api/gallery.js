// ============================================================
// 갤러리 API
//   GET  /api/gallery         → 내 갤러리 (signed URL 포함)
//   DELETE /api/gallery?id=N  → 항목 1개 삭제
// ============================================================

import { getAuthedUser } from "./_lib/auth.js";
import { listGallery, deleteItem } from "./_lib/gallery.js";

export default async function handler(req, res) {
  const auth = await getAuthedUser(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const { user, admin } = auth;

  if (req.method === "GET") {
    const result = await listGallery(admin, user.id);
    if (result.error) return res.status(500).json({ error: result.error });
    return res.status(200).json({ items: result.items });
  }

  if (req.method === "DELETE") {
    const url = new URL(req.url, "http://x");
    const id = parseInt(url.searchParams.get("id"), 10);
    if (!id) return res.status(400).json({ error: "id required" });
    const result = await deleteItem(admin, user.id, id);
    if (result.error) return res.status(404).json({ error: result.error });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "GET / DELETE 만 받습니다." });
}
