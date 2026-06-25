// ============================================================
// 현재 사용자의 오늘 사용량 / 한도 / 크레딧 정보 반환.
// 프론트가 페이지 로드 직후 호출.
// ============================================================

import { getAuthedUser, countTodayUsage, dailyLimitFor, isUnlimited, isTester } from "./_lib/auth.js";
import { getCreditInfo } from "./_lib/credits.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Methods","GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","authorization,content-type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") {
    return res.status(405).json({ error: "GET 만 받습니다." });
  }

  const auth = await getAuthedUser(req);
  if (auth.error) {
    return res.status(auth.status).json({ error: auth.error });
  }
  const { user, admin } = auth;

  // 크레딧 정보는 모든 로그인 사용자에게 공통으로 계산
  const credit = await getCreditInfo(admin, user.id);
  const creditFields = credit.error
    ? { credits: 0, referralCount: 0, untilNext: 2 }
    : {
        credits: credit.creditsAvailable,
        referralCount: credit.referralCount,
        untilNext: credit.untilNext,
      };

  // 어드민/무제한
  if (isUnlimited(user)) {
    return res.status(200).json({
      used: 0, limit: null, remaining: null,
      unlimited: true, blocked: false, ...creditFields,
    });
  }

  // 정식 오픈: 베타 차단 제거 — 모든 로그인 사용자가 하루 무료 한도 사용 가능
  // 오늘 사용량 + 역할별 한도
  const limit = dailyLimitFor(user); // 테스터 3 / 일반 1
  const usage = await countTodayUsage(admin, user.id);
  if (usage.error) {
    return res.status(500).json({ error: usage.error });
  }

  return res.status(200).json({
    used: usage.count,
    limit,
    remaining: Math.max(0, limit - usage.count),
    unlimited: false,
    blocked: false,
    ...creditFields,
  });
}
