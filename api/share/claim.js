// ============================================================
// /api/share/claim — 결과/갤러리 사진 공유 완료 → 크레딧 +1 클레임
//   (viral-loop-and-funnel-standard.md §A. 저장 버튼과는 완전히 별개 경로 —
//   저장은 그대로 무팝업 직접저장·2K 원본이며, 이 엔드포인트는 [공유] 버튼이
//   공유시트를 통해 실제로 공유를 "완료"했을 때만 클라가 호출한다.)
//
// 클라 신고 불신 — 크레딧 지급은 오직 서버의 claim_share_reward_atomic() 원자 RPC
// (사용자별 advisory lock + UNIQUE(user_id,item_id))로만 결정된다.
// ============================================================

import { getAuthedUser, getKstMidnightUtc } from "../_lib/auth.js";
import { getCreditInfo, SHARE_DAILY_CAP } from "../_lib/credits.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "authorization,content-type");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "POST 만 받습니다." });
  }

  const { user, admin, error, status } = await getAuthedUser(req);
  if (error) return res.status(status).json({ error });

  const itemId = parseInt(req.body?.itemId, 10);
  if (!itemId || itemId <= 0) {
    return res.status(400).json({ error: "itemId 가 필요해요." });
  }

  const { data, error: rpcError } = await admin.rpc("claim_share_reward_atomic", {
    p_user_id: user.id,
    p_item_id: itemId,
    p_from_time: getKstMidnightUtc().toISOString(),
    p_daily_cap: SHARE_DAILY_CAP,
  });
  if (rpcError) {
    return res.status(500).json({ error: rpcError.message });
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || !row.ok) {
    return res.status(404).json({ error: "본인 항목이 아니거나 만료됐어요." });
  }
  if (row.capped) {
    return res.status(429).json({
      error: "오늘 공유 리워드를 다 받았어요. 내일 다시 시도해 주세요.",
      capped: true,
      sharedToday: row.shared_today,
      cap: SHARE_DAILY_CAP,
    });
  }

  const info = await getCreditInfo(admin, user.id);
  return res.status(200).json({
    ok: true,
    alreadyClaimed: !!row.already_claimed,
    creditsAvailable: info.error ? null : info.creditsAvailable,
    sharedToday: row.shared_today,
    cap: SHARE_DAILY_CAP,
  });
}
