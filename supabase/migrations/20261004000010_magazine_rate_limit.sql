-- ============================================================================
-- 20261004000010_magazine_rate_limit.sql
-- 목적  : 공개 매거진 API 의 원자적 레이트리밋 (기존 rate-limiter.ts 는 fail-open·경합).
--         테이블 magazine_rate_limits + RPC magazine_rl_hit(key, window_seconds, max) + 정리 함수 magazine_rl_gc().
-- 결함  : F-03 public-guard(G3), S2-08(공개 analytics 남용), E-04/E-05
-- 적용  : SQL Editor 수동. 000001 이후 아무 때나. (미적용이면 public-guard 는 fail-closed 로 요청을 거부해야 한다)
--
-- [적용 전 확인 쿼리]  select to_regprocedure('public.magazine_rl_hit(text,int,int)');  -- null
-- [적용 후 검증 쿼리]
--   -- service_role 로만 실행되는지 (anon 호출은 permission denied 여야 함)
--   select has_function_privilege('anon', 'public.magazine_rl_hit(text,int,int)', 'execute');           -- false
--   select has_function_privilege('authenticated', 'public.magazine_rl_hit(text,int,int)', 'execute');  -- false
--   select has_function_privilege('service_role', 'public.magazine_rl_hit(text,int,int)', 'execute');   -- true
--   -- (service_role 키로) select public.magazine_rl_hit('probe:test', 60, 2);  → true,true,false
-- [롤백]  supabase/migrations/_rollback/20261004000010_magazine_rate_limit_rollback.sql
-- ============================================================================
begin;

create table if not exists public.magazine_rate_limits (
  key           text        not null,
  window_start  timestamptz not null,
  hits          int         not null default 0,
  primary key (key, window_start)
);

create index if not exists idx_magazine_rate_limits_window
  on public.magazine_rate_limits (window_start);

alter table public.magazine_rate_limits enable row level security;
drop policy if exists "magazine_rate_limits_service_all" on public.magazine_rate_limits;
create policy "magazine_rate_limits_service_all" on public.magazine_rate_limits
  for all to service_role using (true) with check (true);
revoke all on table public.magazine_rate_limits from anon, authenticated;

-- 원자적 카운터: 고정 윈도우. hits <= p_max 이면 true(허용), 초과면 false(차단).
create or replace function public.magazine_rl_hit(p_key text, p_window_seconds int, p_max int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz;
  v_hits   int;
begin
  if p_key is null or length(p_key) = 0 or length(p_key) > 200 then
    raise exception 'magazine_rl_hit: invalid key';
  end if;
  if p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'magazine_rl_hit: invalid window';
  end if;
  if p_max is null or p_max < 1 then
    raise exception 'magazine_rl_hit: invalid max';
  end if;

  -- 윈도우 시작 = epoch 를 window 초 단위로 내림
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.magazine_rate_limits as rl (key, window_start, hits)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set hits = rl.hits + 1
  returning rl.hits into v_hits;

  return v_hits <= p_max;
end;
$$;

-- 오래된 행 정리 (cron/수동 호출용)
create or replace function public.magazine_rl_gc(p_keep_hours int default 48)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted int;
begin
  delete from public.magazine_rate_limits
  where window_start < now() - make_interval(hours => greatest(coalesce(p_keep_hours, 48), 1));
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.magazine_rl_hit(text, int, int) from public, anon, authenticated;
revoke all on function public.magazine_rl_gc(int)             from public, anon, authenticated;
grant execute on function public.magazine_rl_hit(text, int, int) to service_role;
grant execute on function public.magazine_rl_gc(int)             to service_role;

do $$
begin
  if has_function_privilege('anon', 'public.magazine_rl_hit(text,int,int)', 'execute')
     or has_function_privilege('authenticated', 'public.magazine_rl_hit(text,int,int)', 'execute') then
    raise exception '검증 실패: magazine_rl_hit 가 anon/authenticated 에 실행 가능합니다.';
  end if;
end $$;

commit;
