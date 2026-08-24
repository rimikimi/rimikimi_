// ============================================================
// 초대 기록 — 친구가 초대 링크로 가입한 직후 호출됨
//
// 흐름:
//   1. 로그인한 사용자(친구 B) 확인
//   2. body 의 ref (초대한 사람 A 의 user_id) 검증
//   3. 자기 자신 초대 / 중복 초대 차단
//   4. referrals 테이블에 (A→B) 기록
//      (referred_id 가 unique 라 B 는 평생 한 번만 인정됨)
// ============================================================

import { getAuthedUser } from "../_lib/auth.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// 초대 코드 6자. 알파벳에서 뺀 문자(0 O 1 I L)는 여기서도 받지 않는다 —
// 애초에 발급되지 않는 문자라, 들어왔다면 오타이거나 무작위 대입이다.
const CODE_RE = /^[2-9ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Methods","GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","authorization,content-type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST 만 받습니다." });
  }

  const auth = await getAuthedUser(req);
  if (auth.error) {
    return res.status(auth.status).json({ error: auth.error });
  }
  const { user, admin } = auth;

  let ref = (req.body?.ref || "").toString().trim();

  // ?ref= 에는 두 가지가 올 수 있다:
  //   ① 6자 초대 코드 (지금 방식) — 예: A3F9K2
  //   ② uuid (구버전 앱이 만든 링크) — 계속 받아준다. 이미 카톡·문자에 뿌려진
  //      링크들이 있고, 그게 죽으면 그 초대는 영영 인정 못 받는다.
  // 코드면 referral_codes 에서 주인을 찾아 uuid 로 바꾼 뒤, 아래 검증은 그대로 탄다.
  if (ref && !UUID_RE.test(ref)) {
    const code = ref.toUpperCase();
    if (!CODE_RE.test(code)) {
      return res.status(200).json({ ok: false, reason: "invalid_code" });
    }
    const { data: owner } = await admin
      .from("referral_codes").select("user_id").eq("code", code).maybeSingle();
    if (!owner?.user_id) {
      return res.status(200).json({ ok: false, reason: "code_not_found" });
    }
    ref = owner.user_id;
  }

  // 유효성: uuid 형식 + 자기 자신 아님
  if (!ref || !UUID_RE.test(ref)) {
    return res.status(200).json({ ok: false, reason: "invalid_ref" });
  }
  if (ref === user.id) {
    return res.status(200).json({ ok: false, reason: "self_referral" });
  }

  // 초대한 사람(A)이 실제 존재하는 사용자인지 확인
  const { data: refUser } = await admin.auth.admin.getUserById(ref);
  if (!refUser?.user) {
    return res.status(200).json({ ok: false, reason: "ref_not_found" });
  }

  // referrals 에 기록 (referred_id unique → 중복이면 에러, 무시)
  const { error } = await admin
    .from("referrals")
    .insert({ referrer_id: ref, referred_id: user.id });

  if (error) {
    // 중복 키 = 이미 초대받은 적 있음
    const already = (error.code === "23505") || /duplicate/i.test(error.message);
    return res.status(200).json({
      ok: false,
      reason: already ? "already_referred" : "db_error",
    });
  }

  return res.status(200).json({ ok: true });
}
