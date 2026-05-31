// ============================================================
// 만료된 갤러리 항목 자동 삭제 (Vercel Cron)
// vercel.json schedule 에서 호출.
// 인증: Vercel Cron 은 자동으로 Authorization: Bearer <CRON_SECRET> 헤더 보냄.
// ============================================================

import { makeAdmin } from "../_lib/auth.js";
import { purgeExpired } from "../_lib/gallery.js";

export default async function handler(req, res) {
  // Vercel Cron 인증 검증 (자동 헤더)
  const expected = process.env.CRON_SECRET;
  const got = (req.headers.authorization || "").replace(/^Bearer\s+/, "");
  if (expected && got !== expected) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const admin = makeAdmin();
  const result = await purgeExpired(admin);
  return res.status(200).json({ ok: true, ...result });
}
