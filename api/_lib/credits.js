// ============================================================
// 초대 크레딧 계산
//   - 적립 크레딧 = floor(내가 초대한 사람 수 / 2)   (2명당 1개)
//   - 사용 크레딧 = user_credits.credits_used
//   - 잔여 크레딧 = max(0, 적립 - 사용)
// referrals 테이블이 "단일 진실원"이라 레이스 컨디션에 안전.
// ============================================================

const PER_CREDIT = 2; // 초대 N명당 크레딧 1개

export async function getCreditInfo(admin, userId) {
  // 1) 내가 초대한 사람 수
  const { count, error: cErr } = await admin
    .from("referrals")
    .select("*", { count: "exact", head: true })
    .eq("referrer_id", userId);
  if (cErr) return { error: cErr.message };
  const referralCount = count || 0;
  const creditsEarned = Math.floor(referralCount / PER_CREDIT);

  // 2) 사용한 크레딧 + 결제로 적립한 크레딧
  const { data, error: uErr } = await admin
    .from("user_credits")
    .select("credits_used, credits_purchased")
    .eq("user_id", userId)
    .maybeSingle();
  if (uErr) return { error: uErr.message };
  const creditsUsed = data?.credits_used || 0;
  const creditsPurchased = data?.credits_purchased || 0;

  // 총 적립 = 초대 보상 + 결제 충전
  const totalEarned = creditsEarned + creditsPurchased;
  const creditsAvailable = Math.max(0, totalEarned - creditsUsed);

  return {
    referralCount,
    creditsEarned,        // 초대 보상으로 얻은 누적
    creditsPurchased,     // 결제로 충전한 누적
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
