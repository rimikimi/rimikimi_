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
export const FREE_DAILY = 2;

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

// 특정 사용자가 "오늘(KST 기준)" 몇 번 호출했는지 카운트
// 결과: { count } 또는 { error }
export async function countTodayUsage(admin, userId) {
  const fromTime = getKstMidnightUtc();
  const { count, error } = await admin
    .from("usage_log")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", fromTime.toISOString());
  if (error) return { error: error.message };
  return { count: count || 0 };
}
