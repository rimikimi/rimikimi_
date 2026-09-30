-- ============================================================
-- 하드닝: 크레딧/무료체험/일일한도 원자적 차감·선점·환불 RPC
--
-- 배경 (감사 결과, HIGH):
--   기존 consumeCredit() 은 "읽고(select credits_used) → 계산 → upsert" 순서의
--   비원자적 read-modify-write 였고, api/generate.js 는 "체크 → 비싼 Gemini
--   호출 → 성공 후 차감" 순서였다. 동시 요청 N개가 겹치면:
--     - N개 모두 크레딧 잔여 체크를 통과 (아직 아무도 차감 전)
--     - N개 모두 비싼 Pro 이미지를 생성
--     - N개의 upsert 가 서로 덮어써서 credits_used 는 실질적으로 1만 증가
--   즉 "크레딧 1개로 N장 Pro 생성"이 가능했다. 무료 Pro 체험(pro_sample_used)과
--   하루 무료 한도(usage_log 카운트)도 같은 구조의 TOCTOU 레이스였다.
--
-- 수정:
--   1) consume_credit_atomic — user_credits 행을 UPDATE...WHERE 로 조건부 증가.
--      Postgres 는 동시 UPDATE 가 같은 행을 잠그고 있으면 대기했다가, 잠금이
--      풀리면 "최신 커밋된 값"으로 WHERE 를 다시 평가한다(EvalPlanQual) — 그래서
--      두 트랜잭션이 동시에 들어와도 잔여 크레딧 이상으로는 절대 통과 못 한다.
--   2) claim_pro_sample_atomic — INSERT ... ON CONFLICT DO UPDATE ... WHERE
--      로 "아직 안 썼을 때만" 갱신하는 표준 원자적 1회성 선점 패턴.
--   3) reserve_daily_usage_atomic — 사용자별 advisory lock 으로 "카운트 확인 →
--      insert" 구간을 직렬화해서, 동시 요청이 몰려도 하루 한도를 절대 넘겨
--      예약할 수 없게 한다. usage_log 테이블 구조는 그대로 (기존 조회/삭제 코드
--      호환).
--   각 함수에 대응하는 refund_* 함수는 "예약 성공 → Gemini 호출 실패"일 때
--   되돌리기(환불)용. 정상 단일 요청 흐름은 결과가 기존과 100% 동일하다.
--
--   보안: 전부 SECURITY DEFINER (행 잠금을 쓰려면 테이블 접근이 필요하고, 이
--   테이블들은 RLS 가 켜져 있지만 정책이 없어 anon/authenticated 는 원래
--   테이블에 직접 접근 못 한다). PostgREST 가 새 함수를 기본적으로 anon/
--   authenticated 에 노출하므로, 이 함수들은 명시적으로 PUBLIC 권한을 revoke
--   하고 service_role 에게만 grant 한다 — 클라이언트가 anon 키로 남의 크레딧을
--   직접 두드리는 새 구멍을 만들지 않기 위함.
-- ============================================================

-- ---- 1) 크레딧 원자적 소비 ----------------------------------------------
create or replace function public.consume_credit_atomic(p_user_id uuid)
returns table (ok boolean, credits_used integer, credits_available integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_per_credit constant integer := 2; -- 초대 N명당 크레딧 1개 (credits.js PER_CREDIT 과 동일)
  v_referral_count integer;
  v_credits_earned integer;
  v_row public.user_credits%rowtype;
  v_total_earned integer;
begin
  -- 행이 없으면 만들어둔다 (첫 사용자)
  insert into public.user_credits (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select count(*) into v_referral_count
  from public.referrals
  where referrer_id = p_user_id;
  v_credits_earned := v_referral_count / v_per_credit; -- 정수 나눗셈 = floor

  -- 조건부 원자적 증가: 동시 트랜잭션은 이 행의 잠금이 풀릴 때까지 대기했다가
  -- 최신 커밋된 credits_used/credits_purchased 로 WHERE 를 재평가한다.
  -- ⚠️ 테이블 별칭(uc) 필수 — 이 함수의 OUT 파라미터 이름이 credits_used 라
  --   별칭 없이 쓰면 plpgsql이 "컬럼 vs OUT 파라미터"를 구분 못 해
  --   "column reference credits_used is ambiguous" 로 매 호출이 실패한다.
  update public.user_credits as uc
     set credits_used = uc.credits_used + 1
   where uc.user_id = p_user_id
     and uc.credits_used < (v_credits_earned + uc.credits_purchased)
  returning uc.* into v_row;

  if v_row.user_id is null then
    select * into v_row from public.user_credits where user_id = p_user_id;
    v_total_earned := v_credits_earned + coalesce(v_row.credits_purchased, 0);
    return query select
      false,
      coalesce(v_row.credits_used, 0),
      greatest(0, v_total_earned - coalesce(v_row.credits_used, 0));
  else
    v_total_earned := v_credits_earned + v_row.credits_purchased;
    return query select
      true,
      v_row.credits_used,
      greatest(0, v_total_earned - v_row.credits_used);
  end if;
end;
$$;

-- consume_credit_atomic 으로 예약된 크레딧 1개를 되돌린다 (생성 실패 시 환불).
create or replace function public.refund_credit_atomic(p_user_id uuid)
returns integer
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.user_credits
     set credits_used = greatest(0, credits_used - 1)
   where user_id = p_user_id
  returning credits_used;
$$;

-- ---- 2) 무료 Pro 체험(계정당 1회) 원자적 선점 ---------------------------
create or replace function public.claim_pro_sample_atomic(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_claimed boolean;
begin
  insert into public.user_credits (user_id, pro_sample_used)
  values (p_user_id, true)
  on conflict (user_id) do update
    set pro_sample_used = true
  where public.user_credits.pro_sample_used = false
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

-- claim_pro_sample_atomic 으로 선점한 1회를 되돌린다 (생성 실패 시 환불).
create or replace function public.refund_pro_sample_atomic(p_user_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.user_credits set pro_sample_used = false where user_id = p_user_id;
$$;

-- ---- 3) 하루 무료 한도 원자적 예약 ---------------------------------------
-- p_from_time: KST 자정의 UTC 환산 시각 (auth.js getKstMidnightUtc 와 동일 규칙)
-- p_limit: 역할별 하루 한도 (일반 1 / 테스터 3 / 광고테스터 100000 ...)
create or replace function public.reserve_daily_usage_atomic(
  p_user_id uuid,
  p_from_time timestamptz,
  p_limit integer
)
returns table (ok boolean, log_id bigint, used_count integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
  v_id bigint;
begin
  -- 사용자별 advisory lock 으로 "카운트 확인 → insert" 구간을 직렬화.
  -- 트랜잭션 종료 시 자동 해제(xact) — 동시 요청도 한 명씩 순서대로 처리되어
  -- 한도 초과 예약이 원천적으로 불가능하다.
  perform pg_advisory_xact_lock(hashtext('usage_log'), hashtext(p_user_id::text));

  select count(*) into v_count
  from public.usage_log
  where user_id = p_user_id
    and created_at >= p_from_time;

  if v_count >= p_limit then
    return query select false, null::bigint, v_count;
  else
    insert into public.usage_log (user_id) values (p_user_id) returning id into v_id;
    return query select true, v_id, v_count + 1;
  end if;
end;
$$;

-- reserve_daily_usage_atomic 으로 예약한 usage_log 행을 삭제해 되돌린다 (생성 실패 시 환불).
create or replace function public.refund_daily_usage_atomic(p_log_id bigint)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.usage_log where id = p_log_id;
$$;

-- ---- 권한: service_role(백엔드) 전용, anon/authenticated 는 직접 호출 불가 ----
-- ⚠️ 이 프로젝트는 신규 함수에 ALTER DEFAULT PRIVILEGES 로 anon/authenticated
-- EXECUTE 를 자동 부여한다 — "revoke ... from public" 만으로는 안 지워지므로
-- anon/authenticated 를 명시적으로 revoke 해야 한다 (안 하면 클라이언트가 anon
-- 키로 rpc() 를 직접 호출해 남의 크레딧/쿼터를 건드릴 수 있는 새 구멍이 생김).
revoke all on function public.consume_credit_atomic(uuid) from public, anon, authenticated;
revoke all on function public.refund_credit_atomic(uuid) from public, anon, authenticated;
revoke all on function public.claim_pro_sample_atomic(uuid) from public, anon, authenticated;
revoke all on function public.refund_pro_sample_atomic(uuid) from public, anon, authenticated;
revoke all on function public.reserve_daily_usage_atomic(uuid, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.refund_daily_usage_atomic(bigint) from public, anon, authenticated;

grant execute on function public.consume_credit_atomic(uuid) to service_role;
grant execute on function public.refund_credit_atomic(uuid) to service_role;
grant execute on function public.claim_pro_sample_atomic(uuid) to service_role;
grant execute on function public.refund_pro_sample_atomic(uuid) to service_role;
grant execute on function public.reserve_daily_usage_atomic(uuid, timestamptz, integer) to service_role;
grant execute on function public.refund_daily_usage_atomic(bigint) to service_role;
