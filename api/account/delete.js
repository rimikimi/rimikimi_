// ============================================================
// POST /api/account/delete  — 인앱 계정 삭제 (App Store Guideline 5.1.1(v))
// 로그인한 본인의 계정 + 연관 데이터를 즉시 영구 삭제.
// ============================================================

import { getAuthedUser } from "../_lib/auth.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Methods","GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","authorization,content-type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "POST 만 허용됩니다." });
  }

  const { user, admin, error, status } = await getAuthedUser(req);
  if (error) return res.status(status).json({ error });

  const uid = user.id;
  try {
    // 1) 연관 데이터 삭제 (best-effort, 순서 무관)
    await admin.from("user_gallery").delete().eq("user_id", uid);
    await admin.from("usage_log").delete().eq("user_id", uid);
    await admin.from("user_credits").delete().eq("user_id", uid);
    await admin.from("iap_events").delete().eq("user_id", uid);
    await admin.from("purchases").delete().eq("user_id", uid);
    await admin.from("referrals").delete().eq("referrer_id", uid);
    await admin.from("referrals").delete().eq("referred_id", uid);

    // 2) 인증 계정 삭제 (Supabase Auth)
    const { error: delErr } = await admin.auth.admin.deleteUser(uid);
    if (delErr) {
      console.error("account deleteUser error", delErr);
      return res.status(500).json({ error: "계정 삭제에 실패했어요. 잠시 후 다시 시도해 주세요." });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("account delete error", e);
    return res.status(500).json({ error: "계정 삭제 중 오류가 발생했어요." });
  }
}
