// ============================================================
// 현재 사용자의 오늘 사용량 / 한도 / 크레딧 정보 반환.
// 프론트가 페이지 로드 직후 호출.
// ============================================================

import { getAuthedUser, countTodayUsage, dailyLimitFor, isUnlimited, isTester } from "./_lib/auth.js";
import { getCreditInfo } from "./_lib/credits.js";

// ── 초대 코드 발급 ─────────────────────────────────────────────
// ⚠️ 별도 엔드포인트(api/referral/code.js)를 두면 Vercel 서버리스 함수 상한(12개)을
//    넘겨 **배포 전체가 실패한다**. 지금 정확히 12개다. 그래서 어차피 앱이 시작할 때마다
//    부르는 quota 에 얹는다(josephine 과 같은 이유·같은 방식).
//
// 혼동 문자(0/O/1/I/L) 제외 — 사람이 링크에서 눈으로 보고 읽을 수 있어야 한다.
const RC_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // 31자
const RC_LEN = 6; // 31^6 ≈ 8.87억

function randomCode() {
  // ⚠️ Math.random() 을 쓰지 않는다 — 초대 코드는 추측 가능하면 남의 초대를 가로챌 수 있다.
  const bytes = new Uint8Array(RC_LEN * 2);
  globalThis.crypto.getRandomValues(bytes);
  let out = "";
  // 256 % 31 != 0 이라 단순 나머지는 앞쪽 문자가 더 자주 나온다(모듈로 편향).
  // 248(=31*8) 이상 값은 버리고 다시 뽑아 균등하게 만든다.
  for (let i = 0; i < bytes.length && out.length < RC_LEN; i++) {
    if (bytes[i] >= 248) continue;
    out += RC_ALPHABET[bytes[i] % 31];
  }
  while (out.length < RC_LEN) out += RC_ALPHABET[Math.floor(Math.random() * 31)]; // 극히 드문 폴백
  return out;
}

// 이미 있으면 그대로, 없으면 발급. 코드는 한 번 나가면 절대 바꾸지 않는다
// (친구에게 이미 알려줬을 수 있다).
// ⚠️ 실패해도 null 만 돌려준다 — 코드 발급이 깨져도 quota 응답 자체는 살아야 한다.
async function ensureReferralCode(admin, userId) {
  try {
    const { data: mine } = await admin
      .from("referral_codes").select("code").eq("user_id", userId).maybeSingle();
    if (mine?.code) return mine.code;

    for (let i = 0; i < 5; i++) {
      const code = randomCode();
      const { error } = await admin.from("referral_codes").insert({ user_id: userId, code });
      if (!error) return code;
      // 23505 는 두 가지 의미다: 코드 충돌(다시 뽑으면 됨) 또는 이 사용자가 동시 요청으로
      // 이미 발급받음(그 코드를 써야 함). 후자를 먼저 확인한다.
      if (error.code !== "23505") return null;
      const { data: again } = await admin
        .from("referral_codes").select("code").eq("user_id", userId).maybeSingle();
      if (again?.code) return again.code;
    }
    return null;
  } catch (_) {
    return null;
  }
}

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

  // 초대 코드 — 없으면 여기서 발급한다(로그인 후 첫 quota 호출 시점)
  const referralCode = await ensureReferralCode(admin, user.id);

  // 크레딧 정보는 모든 로그인 사용자에게 공통으로 계산
  const credit = await getCreditInfo(admin, user.id);
  const creditFields = credit.error
    ? { credits: 0, referralCount: 0, untilNext: 1, referralCode }
    : {
        credits: credit.creditsAvailable,
        referralCount: credit.referralCount,
        untilNext: credit.untilNext,
        referralCode,
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
