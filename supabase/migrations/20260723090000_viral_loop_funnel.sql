-- ============================================================
-- 바이럴 루프 2차분: §A(공유 리워드) + §C(퍼널 이벤트)
--   정본: rimikimi studios/_reliability/viral-loop-and-funnel-standard.md
--   §B(초대 크레딧)는 rimikimi 원조 구현이 이미 있음(referrals 테이블 +
--   api/_lib/credits.js + api/referral/claim.js) — 이 마이그레이션은 §A·§C 만 추가한다.
--
-- §A — 결과/갤러리 사진 [공유] 버튼 → 크레딧 +1
--   (사진 1개당 평생 1회 · 일일 상한 3회 · 로그인 사용자만):
--   이 프로젝트의 원자성 모델은 20260721073059_atomic_credit_quota_rpcs.sql 과 동일한
--   "Postgres RPC(SECURITY DEFINER) + REVOKE FROM anon/authenticated + GRANT service_role"
--   이다 — picbox 구현(api/_lib/credits.js 의 claimShareReward, JS 레벨 카운트+INSERT)의
--   로직을 그대로 이식하되, 이 프로젝트 컨벤션에 맞춰 전부 단일 SQL 함수(원자적 트랜잭션)로
--   옮겼다. claim_share_reward_atomic() 이 "소유권 확인 → 평생1회 확인 → 일일상한 확인 →
--   지급"을 사용자별 advisory lock(reserve_daily_usage_atomic 과 동일 기법)으로 직렬화해서
--   한 번에 처리한다. share_claims.UNIQUE(user_id,item_id) 는 그 위의 최종 방어선
--   (이론상 advisory lock 만으로 충분하지만, 방어적으로 유니크 제약 + 예외처리도 남겨둔다).
--
-- §C — 퍼널 이벤트(최소 계측, "flow"):
--   events 는 반대로 "클라(anon/authenticated)가 자기 것만 INSERT" 하는 걸 의도적으로
--   허용한다(Supabase anon/authenticated 키로 직접 삽입 — 서버 API 없이 fire-and-forget
--   계측이 목적. picbox 마이그레이션과 동일 패턴). SELECT 는 어떤 role 에도 허용하지 않는다
--   (집계는 service_role/SQL Editor 로만).
-- ============================================================

-- ---- §A: 공유 리워드 ------------------------------------------------------

alter table public.user_credits
  add column if not exists credits_shared integer not null default 0; -- 공유 리워드 적립(구매/초대와 분리된 버킷 — 매출지표 오염 방지)

create table if not exists public.share_claims (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  item_id    bigint not null references public.user_gallery (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, item_id) -- 사진 1개당 평생 1회 지급의 최종 방어선 (23505 = 이미 지급됨)
);
create index if not exists share_claims_user_time_idx on public.share_claims (user_id, created_at);

alter table public.share_claims enable row level security;
-- 정책 없음 = anon/authenticated 직접 접근 차단 (user_credits/usage_log/referrals 와 동일
-- 컨벤션). 유일한 진입점은 아래 SECURITY DEFINER 함수이고, 그 함수의 EXECUTE 도
-- service_role 에게만 부여한다(이중 잠금 — 함수가 있어도 클라 키로는 호출 자체가 거부됨).

create or replace function public.claim_share_reward_atomic(
  p_user_id    uuid,
  p_item_id    bigint,
  p_from_time  timestamptz,  -- KST 자정의 UTC 환산 (호출측 getKstMidnightUtc() 와 동일 규칙)
  p_daily_cap  integer default 3
)
returns table (
  ok              boolean,  -- false = 본인 갤러리 항목이 아님(타인 소유·만료·삭제됨)
  already_claimed boolean,  -- true = 이 사진은 이미 지급받음 (무보상이지만 실패 아님)
  capped          boolean,  -- true = 오늘 일일 상한 도달 (무보상)
  shared_today    integer,  -- 이 요청 이후 기준, 오늘 지급받은 누적 횟수
  credits_shared  integer   -- 지급 후 user_credits.credits_shared 누적값
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owns        boolean;
  v_already     boolean;
  v_today_count integer;
  v_shared      integer;
begin
  -- 0) 소유권 확인 — 본인 갤러리 항목만 인정 (타인 item_id 로 크레딧을 긁어가는 것 방지).
  --    1시간 뒤 자동 삭제된 만료 항목도 여기서 자연히 걸러진다.
  select exists(
    select 1 from public.user_gallery as g
     where g.id = p_item_id and g.user_id = p_user_id
  ) into v_owns;

  if not v_owns then
    return query select false, false, false, 0, 0;
    return;
  end if;

  -- 1) 사용자별 advisory lock — "평생1회/일일상한 확인 → 지급" 구간을 직렬화한다
  --    (reserve_daily_usage_atomic 과 동일 기법). 트랜잭션 종료 시 자동 해제되고,
  --    같은 사용자의 동시 클레임 요청은 여기서 한 명씩 순서대로 처리되어 아래 조회들이
  --    항상 최신 커밋 상태를 본다 — 이중 지급/상한 초과가 원천적으로 불가능.
  perform pg_advisory_xact_lock(hashtext('share_claims'), hashtext(p_user_id::text));

  -- 2) 이미 지급된 항목인가 (평생 1회) — advisory lock 덕에 조회만으로 안전하게 판정된다.
  select exists(
    select 1 from public.share_claims as sc
     where sc.user_id = p_user_id and sc.item_id = p_item_id
  ) into v_already;

  if v_already then
    select coalesce(uc.credits_shared, 0) into v_shared
      from public.user_credits as uc where uc.user_id = p_user_id;
    return query select true, true, false, 0, coalesce(v_shared, 0);
    return;
  end if;

  -- 3) 오늘(KST) 지급 횟수 — 일일 상한.
  select count(*) into v_today_count
    from public.share_claims as sc
   where sc.user_id = p_user_id
     and sc.created_at >= p_from_time;

  if v_today_count >= p_daily_cap then
    return query select true, false, true, v_today_count, 0;
    return;
  end if;

  -- 4) 원자적 지급 — 감사기록 INSERT + credits_shared +1.
  --    advisory lock 이 있어 이론상 unique_violation 은 불가능하지만, 방어적으로 잡아서
  --    "이미 지급됨"으로 조용히 처리한다(호출부 재시도/레이스에도 절대 이중 지급되지 않음).
  begin
    insert into public.share_claims (user_id, item_id) values (p_user_id, p_item_id);
  exception when unique_violation then
    select coalesce(uc.credits_shared, 0) into v_shared
      from public.user_credits as uc where uc.user_id = p_user_id;
    return query select true, true, false, v_today_count, coalesce(v_shared, 0);
    return;
  end;

  insert into public.user_credits as uc (user_id, credits_shared)
  values (p_user_id, 1)
  on conflict (user_id) do update
    set credits_shared = uc.credits_shared + 1
  returning uc.credits_shared into v_shared;

  return query select true, false, false, v_today_count + 1, v_shared;
end;
$$;

-- ⚠️ 신규 함수는 anon/authenticated 에 EXECUTE 가 자동 부여되므로(ALTER DEFAULT
-- PRIVILEGES) 명시적으로 revoke 해야 한다 — 안 하면 클라가 anon/유저 키로 직접
-- rpc() 호출해 남의 item_id 로 크레딧을 시도할 수 있는 구멍이 생긴다.
revoke all on function public.claim_share_reward_atomic(uuid, bigint, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.claim_share_reward_atomic(uuid, bigint, timestamptz, integer) to service_role;

-- ---- §C: 퍼널 이벤트 -------------------------------------------------------

create table if not exists public.events (
  id         bigint generated always as identity primary key,
  user_id    uuid references auth.users (id) on delete set null,
  anon_id    text,
  event      text not null check (char_length(event) <= 64),
  props      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists events_event_time_idx on public.events (event, created_at);
create index if not exists events_user_idx        on public.events (user_id);

alter table public.events enable row level security;

-- 로그인 사용자: 본인 user_id(또는 null) 로만 INSERT 가능 — 남의 user_id 로 위장 삽입 차단.
drop policy if exists events_insert_authenticated on public.events;
create policy events_insert_authenticated on public.events
  for insert to authenticated
  with check (user_id is null or user_id = auth.uid());

-- 비로그인: user_id 는 반드시 null (anon_id 로만 식별) — anon 키로 다른 사용자 사칭 불가.
drop policy if exists events_insert_anon on public.events;
create policy events_insert_anon on public.events
  for insert to anon
  with check (user_id is null);

-- SELECT 정책 없음 = anon/authenticated 조회 불가. 집계는 아래 예시처럼 service_role/SQL Editor 에서.
--
-- select date_trunc('day', created_at) as day, event, count(*)
-- from public.events
-- where created_at > now() - interval '30 days'
-- group by 1, 2
-- order by 1 desc, 2;
