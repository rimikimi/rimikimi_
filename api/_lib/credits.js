// ============================================================
// 초대 크레딧 계산
//   - 적립 크레딧 = floor(내가 초대한 사람 수 / 2)   (2명당 1개)
//   - 사용 크레딧 = user_credits.credits_used
//   - 잔여 크레딧 = max(0, 적립 - 사용)
// referrals 테이블이 "단일 진실원"이라 레이스 컨디션에 안전.
// ============================================================

const PER_CREDIT = 2; // 초대 N명당 크레딧 1개

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
  const creditsEarned = Math.floor(referralCount / PER_CREDIT);

  // 2) 사용한 크레딧 + 결제로 적립한 크레딧 + 공유 리워드로 적립한 크레딧
  const { data, error: uErr } = await admin
    .from("user_credits")
    .select("credits_used, credits_purchased, credits_shared")
    .eq("user_id", userId)
    .maybeSingle();
  if (uErr) return { error: uErr.message };
  const creditsUsed = data?.credits_used || 0;
  const creditsPurchased = data?.credits_purchased || 0;
  const creditsShared = data?.credits_shared || 0; // 공유 리워드(§A) — 구매/초대와 분리된 버킷

  // 총 적립 = 초대 보상 + 결제 충전 + 공유 리워드
  const totalEarned = creditsEarned + creditsPurchased + creditsShared;
  const creditsAvailable = Math.max(0, totalEarned - creditsUsed);

  return {
    referralCount,
    creditsEarned,        // 초대 보상으로 얻은 누적
    creditsPurchased,     // 결제로 충전한 누적
    creditsShared,        // 공유 리워드로 얻은 누적
    creditsUsed,
    creditsAvailable,
    perCredit: PER_CREDIT,
    // 다음 크레딧까지 남은 초대 수 (홀수일 때 "한 명 더!" 유도)
    untilNext: PER_CREDIT - (referralCount % PER_CREDIT || PER_CREDIT),
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
  if (need === 1) return consumeCredit(admin, userId);

  await admin
    .from("user_credits")
    .upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true });

  for (let attempt = 0; attempt < 3; attempt++) {
    const [{ count: referralCount, error: rErr }, { data: row, error: uErr }] =
      await Promise.all([
        admin.from("referrals").select("*", { count: "exact", head: true }).eq("referrer_id", userId),
        admin.from("user_credits")
          .select("credits_used, credits_purchased, credits_shared")
          .eq("user_id", userId).maybeSingle(),
      ]);
    if (rErr || uErr || !row) return false;

    const used = row.credits_used || 0;
    const totalEarned =
      Math.floor((referralCount || 0) / PER_CREDIT) +
      (row.credits_purchased || 0) +
      (row.credits_shared || 0);
    if (totalEarned - used < need) return false; // 잔액 부족 — 부분 차감 없이 거절

    const { data: updated, error: updErr } = await admin
      .from("user_credits")
      .update({ credits_used: used + need })
      .eq("user_id", userId)
      .eq("credits_used", used)
      .select("credits_used");
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
      .from("user_credits").select("credits_used").eq("user_id", userId).maybeSingle();
    if (error || !row) return false;
    const used = row.credits_used || 0;
    if (used <= 0) return true;
    const next = Math.max(0, used - back);
    const { data: updated, error: updErr } = await admin
      .from("user_credits").update({ credits_used: next })
      .eq("user_id", userId).eq("credits_used", used).select("credits_used");
    if (updErr) return false;
    if (updated && updated.length > 0) return true;
  }
  return false;
}

export async function consumeCredit(admin, userId) {
  // 현재 사용량 읽기
  const { data } = await admin
    .from("user_credits")
    .select("credits_used")
    .eq("user_id", userId)
    .maybeSingle();
  const used = data?.credits_used || 0;
  const { error } = await admin
    .from("user_credits")
    .upsert(
      { user_id: userId, credits_used: used + 1 },
      { onConflict: "user_id" }
    );
  return !error;
}
