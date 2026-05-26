// ============================================================
// 현재 사용자의 오늘 사용량 / 한도를 알려주는 작은 endpoint.
// 프론트가 페이지 로드 직후 한 번 호출해서 헤더의 "무료 X/Y" 표시를 갱신.
// ============================================================

import { getAuthedUser, countTodayUsage, FREE_DAILY, isUnlimited, isTester } from "./_lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "GET 만 받습니다." });
  }

  const auth = await getAuthedUser(req);
  if (auth.error) {
    return res.status(auth.status).json({ error: auth.error });
  }

  // 어드민/무제한
  if (isUnlimited(auth.user)) {
    return res.status(200).json({
      used: 0,
      limit: null,
      remaining: null,
      unlimited: true,
      blocked: false,
    });
  }

  // 테스터 아닌 일반 사용자 → 차단
  if (!isTester(auth.user)) {
    return res.status(200).json({
      used: 0,
      limit: 0,
      remaining: 0,
      unlimited: false,
      blocked: true,
    });
  }

  // 테스터
  const usage = await countTodayUsage(auth.admin, auth.user.id);
  if (usage.error) {
    return res.status(500).json({ error: usage.error });
  }

  return res.status(200).json({
    used: usage.count,
    limit: FREE_DAILY,
    remaining: Math.max(0, FREE_DAILY - usage.count),
    unlimited: false,
    blocked: false,
  });
}
