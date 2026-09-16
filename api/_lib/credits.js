// ============================================================
// 초대 크레딧 계산
//   - 적립 크레딧 = 내가 초대한 사람 수 × 3   (1명당 3개)
//   - 사용 크레딧 = user_credits.credits_used
//   - 잔여 크레딧 = max(0, 적립 - 사용)
// referrals 테이블이 "단일 진실원"이라 레이스 컨디션에 안전.
// ============================================================

// 초대 1명당 지급 크레딧.
// 2026-08-24 이전엔 "2명당 1개"(PER_CREDIT=2)였다 → 1명당 3개로 변경(오너 지시).
// ⚠️ 적립은 referrals 행 수에서 **매번 계산**하므로, 이 상수를 바꾸면 기존 초대분에도
//    소급 적용된다(10명 초대한 사용자: 5개 → 30개). 의도된 동작이다 — 적립을 스냅샷으로
//    저장하지 않는 설계라 과거분만 옛 비율로 두려면 스키마 변경이 필요하다.
const CREDITS_PER_REFERRAL = 3;

// ── 만료되는 이벤트 크레딧 (2026-09-16 추석 이벤트) ──────────────────────────
// 기존 버킷(구매·초대·공유)과 **완전히 분리**한다. 사용량도 따로 센다.
//   왜: credits_used 하나로 합쳐 세면, 만료된 프로모를 쓴 기록이 credits_used 에
//   남아서 나중에 결제한 크레딧을 그만큼 갉아먹는다(사용자가 산 걸 못 쓰게 된다).
// 만료는 "삭제"가 아니라 "잔액 계산에서 제외"다 — 기록은 남겨 정산·문의에 쓴다.
const PROMO_COLS = "credits_promo, credits_promo_used, promo_expires_at";

function promoAvailable(row) {
  if (!row?.promo_expires_at) return 0;
  if (new Date(row.promo_expires_at).getTime() <= Date.now()) return 0;
  return Math.max(0, (row.credits_promo || 0) - (row.credits_promo_used || 0));
}

/** 구매·초대·공유 버킷의 잔액(프로모 제외). */
function normalAvailable(row, referralCount) {
  const earned =
    (referralCount || 0) * CREDITS_PER_REFERRAL +
    (row?.credits_purchased || 0) +
    (row?.credits_shared || 0);
  return Math.max(0, earned - (row?.credits_used || 0));
}

// 공유 리워드 일일 상한 (viral-loop-and-funnel-standard.md §A) — 어뷰즈 캡.
export const SHARE_DAILY_CAP = 3;

export async function getCreditInfo(admin, userId) {
  // 1) 내가 초대한 사람 수
  const { count, error: cErr } = await admin
    .from("referrals")
    .select("*", { count: "exact", head: true })
    .eq("referrer_id", userId);
  if (cErr) return { error: cErr.message };
  const referralCount = count || 0;
  const creditsEarned = referralCount * CREDITS_PER_REFERRAL;

  // 2) 사용한 크레딧 + 결제로 적립한 크레딧 + 공유 리워드로 적립한 크레딧
  const { data, error: uErr } = await admin
    .from("user_credits")
    .select(`credits_used, credits_purchased, credits_shared, ${PROMO_COLS}`)
    .eq("user_id", userId)
    .maybeSingle();
  if (uErr) return { error: uErr.message };
  const creditsUsed = data?.credits_used || 0;
  const creditsPurchased = data?.credits_purchased || 0;
  const creditsShared = data?.credits_shared || 0; // 공유 리워드(§A) — 구매/초대와 분리된 버킷

  // 총 적립 = 초대 보상 + 결제 충전 + 공유 리워드
  const totalEarned = creditsEarned + creditsPurchased + creditsShared;
  const promoAvail = promoAvailable(data);
  const creditsAvailable = Math.max(0, totalEarned - creditsUsed) + promoAvail;

  return {
    referralCount,
    creditsEarned,        // 초대 보상으로 얻은 누적
    creditsPurchased,     // 결제로 충전한 누적
    creditsShared,        // 공유 리워드로 얻은 누적
    creditsUsed,
    creditsAvailable,
    // 만료되는 이벤트 크레딧 — 클라이언트가 "N장 (오늘까지)" 를 띄울 수 있게 내려보낸다.
    promoCredits: promoAvail,
    promoExpiresAt: promoAvail > 0 ? data.promo_expires_at : null,
    perCredit: CREDITS_PER_REFERRAL,
    // 이제 초대 1명마다 바로 크레딧이 붙으므로 "다음 크레딧까지 N명" 개념이 없다.
    // 옛 클라이언트가 이 값을 읽어 "N명만 더" 를 표시하므로 항상 1로 내려보낸다.
    // (예전엔 `PER_CREDIT - (referralCount % PER_CREDIT)`. 그 전 세대 식은 초대 0명일 때
    //  "0명만 더 초대하면" 이라고 표시하는 버그가 있었다 — referral-audit-2026-08-19 §3-1)
    untilNext: 1,
  };
}

// 무료 Pro 체험(계정당 1회) 사용 여부
export async function getProSampleUsed(admin, userId) {
  const { data } = await admin
    .from("user_credits")
    .select("pro_sample_used")
    .eq("user_id", userId)
    .maybeSingle();
  return !!data?.pro_sample_used;
}

// 무료 Pro 체험 1회 소진 기록 (멱등)
export async function markProSampleUsed(admin, userId) {
  const { error } = await admin
    .from("user_credits")
    .upsert(
      { user_id: userId, pro_sample_used: true },
      { onConflict: "user_id" }
    );
  return !error;
}

// 크레딧 1개 사용 (credits_used += 1). 성공 시 true.
// 크레딧 N개를 한 번에 예약(차감)한다 — 묶음 생성(3/6/12장)용.
// picbox 구현을 rimikimi 스키마(credits_shared)에 맞춰 이식.
//
// ⚠️ 잔액이 모자라면 부분 차감 없이 통째로 거절한다. "12장 요청했는데 8장만
//    차감되고 8장만 나오는" 애매한 상태를 만들지 않기 위해서다.
// ⚠️ 낙관적 잠금(update ... eq(credits_used, used))으로 동시 요청 레이스를 막는다.
//    다른 요청이 먼저 바꿨으면 매칭이 0건이라 재시도한다.
export async function consumeCredits(admin, userId, n) {
  const need = Math.max(1, Math.floor(n || 1));

  await admin
    .from("user_credits")
    .upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true });

  for (let attempt = 0; attempt < 3; attempt++) {
    const [{ count: referralCount, error: rErr }, { data: row, error: uErr }] =
      await Promise.all([
        admin.from("referrals").select("*", { count: "exact", head: true }).eq("referrer_id", userId),
        admin.from("user_credits")
          .select(`credits_used, credits_purchased, credits_shared, ${PROMO_COLS}`)
          .eq("user_id", userId).maybeSingle(),
      ]);
    if (rErr || uErr || !row) return false;

    const promoAvail = promoAvailable(row);
    const normalAvail = normalAvailable(row, referralCount);
    if (promoAvail + normalAvail < need) return false; // 잔액 부족 — 부분 차감 없이 거절

    // 만료되는 것부터 쓴다(사용자에게 유리).
    const fromPromo = Math.min(promoAvail, need);
    const fromNormal = need - fromPromo;
    const used = row.credits_used || 0;
    const promoUsed = row.credits_promo_used || 0;

    // 두 버킷을 한 번의 update 로 바꾸고, 둘 다 CAS 로 건다 —
    // 하나만 성공해 어긋나는 상태가 생기지 않는다.
    let q = admin.from("user_credits").update({
      credits_used: used + fromNormal,
      credits_promo_used: promoUsed + fromPromo,
    }).eq("user_id", userId).eq("credits_used", used);
    if (fromPromo > 0) q = q.eq("credits_promo_used", promoUsed);

    const { data: updated, error: updErr } = await q.select("credits_used");
    if (updErr) return false;
    if (updated && updated.length > 0) return true;
  }
  return false;
}

// 예약한 크레딧을 실패분만큼 되돌린다(하한 0). best-effort —
// 환불 실패가 사용자 응답을 막아선 안 되므로 호출부는 반환값을 무시해도 된다.
export async function refundCredits(admin, userId, n) {
  const back = Math.max(1, Math.floor(n || 1));
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: row, error } = await admin
      .from("user_credits")
      .select(`credits_used, ${PROMO_COLS}`)
      .eq("user_id", userId).maybeSingle();
    if (error || !row) return false;
    const used = row.credits_used || 0;
    const promoUsed = row.credits_promo_used || 0;
    if (used <= 0 && promoUsed <= 0) return true;
    // 차감의 역순으로 되돌린다 — 프로모를 먼저 썼으니 일반분부터 돌려주고,
    // 남으면 프로모를 돌려준다. (프로모가 만료됐으면 돌려줘도 잔액엔 안 잡힌다)
    const backNormal = Math.min(used, back);
    const backPromo = Math.min(promoUsed, back - backNormal);
    const { data: updated, error: updErr } = await admin
      .from("user_credits")
      .update({ credits_used: used - backNormal, credits_promo_used: promoUsed - backPromo })
      .eq("user_id", userId)
      .eq("credits_used", used)
      .eq("credits_promo_used", promoUsed)
      .select("credits_used");
    if (updErr) return false;
    if (updated && updated.length > 0) return true;
  }
  return false;
}

// ⚠️ 예전엔 read-modify-write 였다(select → upsert, 조건 없음). 바로 위
//    consumeCredits(복수)에는 낙관적 잠금이 있는데 단수형만 빠져 있어서,
//    동시에 여러 번 생성하면 마지막 쓰기만 남아 1크레딧으로 N장이 나갔다.
//    → 같은 CAS + 재시도로 통일한다.
// 단수형도 복수형과 **같은 경로**를 탄다 — 예전에 단수형만 낙관적 잠금이 빠져 있어
// 1크레딧으로 N장이 나간 적이 있다. 프로모 우선 차감 규칙도 한 곳에서만 관리한다.
export async function consumeCredit(admin, userId) {
  return consumeCredits(admin, userId, 1);
}
