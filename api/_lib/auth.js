// ============================================================
// 백엔드 공용 헬퍼:
//   - Supabase 관리자 클라이언트 만들기
//   - 요청에서 사용자 토큰 검증 → 사용자 객체 받기
//   - 한국 시간(KST) "오늘 자정" 계산
//   - "이 사용자가 오늘 몇 번 썼는지" 조회
//
// 파일 이름이 _ 로 시작해서 Vercel/Vite 가 endpoint 로 노출하지 않음.
// ============================================================

import { createClient } from "@supabase/supabase-js";

// 하루 무료 횟수 (한 사람당)
// 2026-09-30 오너 지시: "지금까지 가입한 사람은 2장으로 냅둬줘 / 신규 가입자만 1장으로".
//   → 이 시각(9/30 15:00 KST) 전에 가입한 계정은 하루 2장, 그 뒤 가입한 계정은 1장.
//   (그 전 서버 값은 모두 1장이었다 — 기존 가입자는 이때 2장으로 올라갔다.)
export const FREE_DAILY = 1;
export const FREE_DAILY_EARLY = 2;
export const EARLY_SIGNUP_CUTOFF = Date.parse("2026-09-30T06:00:00Z");
// 베타 테스터는 하루 한도를 더 줌 (3장)
export const TESTER_DAILY = 3;
// 광고 테스트 계정: 사실상 무제한이지만 unlimited(어드민) 은 아님.
// 어드민/크레딧 사용자는 광고가 안 뜨므로(광고 조건: !unlimited && credits===0),
// "광고가 실제로 뜨는지" 검증하려면 무제한이 아닌 "무료 사용자 + 높은 한도" 가 필요.
export const AD_TEST_DAILY = 100000;

// 사용자 역할에 따른 하루 무료 한도
//   - 어드민(무제한)은 이 값과 무관 (별도 처리)
//   - 광고 테스터: AD_TEST_DAILY (사실상 무제한, 단 광고는 계속 노출)
//   - 베타 테스터: TESTER_DAILY
//   - 일반 사용자: 9/30 15:00 KST 전 가입 FREE_DAILY_EARLY(2) · 그 뒤 가입 FREE_DAILY(1)
export function dailyLimitFor(user) {
  if (isAdTester(user)) return AD_TEST_DAILY;
  if (isTester(user)) return TESTER_DAILY;
  const joined = Date.parse(user?.created_at || "");
  return Number.isFinite(joined) && joined < EARLY_SIGNUP_CUTOFF ? FREE_DAILY_EARLY : FREE_DAILY;
}

// 광고 테스트 계정 화이트리스트 (env AD_TEST_EMAILS, 콤마 구분)
// 무료 경로(광고 노출) 를 유지한 채 하루 한도만 사실상 무제한으로 열어줌.
export function isAdTester(user) {
  return matchEmailList(user, process.env.AD_TEST_EMAILS);
}

// 무제한 사용자 (관리자/VIP) 화이트리스트
// 환경변수 ADMIN_EMAILS 에 콤마로 구분된 이메일 목록을 넣어두면
// 이 사용자들은 하루 한도 적용을 받지 않음.
export function isUnlimited(user) {
  return matchEmailList(user, process.env.ADMIN_EMAILS);
}

// 베타 테스터 화이트리스트
// 환경변수 TESTER_EMAILS 에 등록된 사용자만 일반 사용 가능 (하루 FREE_DAILY 장)
// 이 목록에 없는 일반 사용자는 생성 자체가 막힘.
export function isTester(user) {
  return matchEmailList(user, process.env.TESTER_EMAILS);
}

function matchEmailList(user, raw) {
  const list = (raw || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const email = (user?.email || "").toLowerCase();
  return !!email && list.includes(email);
}

export function makeAdmin() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// Authorization 헤더에서 Bearer 토큰 꺼내 Supabase 에 검증
// 결과: { user, admin }  또는  { error, status }
export async function getAuthedUser(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    return { error: "로그인이 필요해요.", status: 401 };
  }
  const admin = makeAdmin();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) {
    return { error: "세션이 만료되었어요. 다시 로그인해 주세요.", status: 401 };
  }
  return { user: data.user, admin };
}

// KST(한국시간) 자정을 UTC 로 환산해서 돌려줌.
// 예: 지금이 한국 오후 2시면, 같은 날 오전 0시(=UTC 전날 15시)를 반환
export function getKstMidnightUtc() {
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 3600 * 1000);
  const kstMidnight = new Date(
    Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate())
  );
  return new Date(kstMidnight.getTime() - 9 * 3600 * 1000);
}

// 하루 무료 1장을 **생성 전에 원자적으로 잡는다** (2026-09-30, 오너 지시 "무료는 하루 1장으로 limit").
// 예전엔 개수만 세고(countTodayUsage) 성공한 **뒤에** 기록해서, 생성(20~30초)이 끝나기 전에 같은 사람이
// 또 보내면(여러 컨셉 한꺼번에 걸기·연타) 둘 다 0장으로 보고 무료로 나갔다
// (실측 9/16~9/30: 무료 사용자-일 145건 중 14건이 2~5장, 대부분 수 초 간격 2건).
// DB 함수 reserve_daily_usage_atomic(7/21 적용) — 사용자별 잠금 안에서 세고 바로 usage_log 행(kind 기본 'gen')을 넣는다.
// ⚠️ 이 DB 함수는 kind 를 가리지 않고 센다 — 얼굴 앵커(kind='face_anchor')까지 세므로 그만큼 한도를 늘려 넘긴다
//    (안 그러면 얼굴 스캔한 날 첫 생성이 "무료 다 씀"으로 막힌다).
// 반환: { ok: true, id } · { ok: false } (오늘 무료 다 씀 — 방금 다른 요청이 가져간 경우 포함) · { error }
export async function holdFreeUsage(admin, userId, limit) {
  const from = getKstMidnightUtc().toISOString();
  const { count: anchors, error: cntErr } = await admin
    .from("usage_log")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("kind", "face_anchor")
    .gte("created_at", from);
  if (cntErr) return { error: cntErr.message };
  const { data, error } = await admin.rpc("reserve_daily_usage_atomic", {
    p_user_id: userId, p_from_time: from, p_limit: limit + (anchors || 0),
  });
  if (error) return { error: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  return row?.ok ? { ok: true, id: row.log_id } : { ok: false };
}

// 잡아 둔 무료 1장을 되돌린다(생성 실패) — 그 행을 지운다.
export async function releaseFreeUsage(admin, id) {
  const { error } = await admin.rpc("refund_daily_usage_atomic", { p_log_id: id });
  if (error) throw new Error(error.message);
}

// 특정 사용자가 "오늘(KST 기준)" 몇 번 호출했는지 카운트
// 결과: { count } 또는 { error }
export async function countTodayUsage(admin, userId) {
  const fromTime = getKstMidnightUtc();
  const { count, error } = await admin
    .from("usage_log")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    // 페이스 프로필 앵커 생성(kind='face_anchor')은 무료 한도를 먹지 않는다.
    // 기존 행은 마이그레이션 default 로 전부 'gen'.
    .eq("kind", "gen")
    .gte("created_at", fromTime.toISOString());
  if (error) return { error: error.message };
  return { count: count || 0 };
}
