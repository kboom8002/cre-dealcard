-- ============================================================================
-- 20261004000001_magazine_rls_lockdown.sql
-- 목적  : 매거진 4개 테이블의 PUBLIC `USING(true)` 쓰기 정책 제거 (anon 키로 쓰기·삭제 가능했음)
-- 결함  : S2-01(P0), S2-07, 보조 S2-14  (remediation_plan P0-01)
-- 적용  : Supabase SQL Editor 에서 수동 적용 (운영). 저장소 마이그레이션 러너로 자동 적용하지 않는다.
-- 순서  : 반드시 slug 수정(I-01) 코드 배포보다 먼저 적용 (함정 #10)
--
-- [적용 전 확인 쿼리]  docs/magazine/audit-2026-10-04/db-snapshots/pg_policies_before.sql 실행 → 결과 저장
--   select schemaname,tablename,policyname,roles,cmd,qual,with_check
--   from pg_policies
--   where tablename like 'magazine%' or tablename in ('activity_events','broker_profiles')
--   order by tablename, policyname;
--
-- [적용 후 검증 쿼리]  (이 파일 하단 DO 블록이 자동 단언하며, 아래는 수동 확인용)
--   select tablename, policyname, roles, cmd, qual, with_check
--   from pg_policies
--   where tablename in ('magazine_issues','magazine_editions','magazine_analytics_events','magazine_subscribers')
--   order by 1,2;
--   + node scripts/rls-probe.mjs   (anon 키: PASS 기대)
--
-- [롤백]  supabase/migrations/_rollback/20261004000001_magazine_rls_lockdown_rollback.sql
--         (원본 마이그레이션의 정책을 재생성. 운영이 원본과 달랐다면 pg_policies_before 덤프로 복원)
--
-- [코드 의존 점검 결과 (착수 시 grep, 2026-10-05)]
--   * 매거진 4테이블을 anon/브라우저 키로 직접 조회하는 코드: 없음(서버 컴포넌트·API 는 전부 createServiceClient).
--   * 브라우저(세션=authenticated)에서 직접 접근하는 곳 2곳:
--       - src/hooks/useMagazineDraft.ts:109,120  magazine_editions select/update
--           → `editions_broker_own`(auth.uid() + broker_profiles.slug=broker_id) 정책으로 계속 동작.
--             단, 에디터가 slug 폴백 'demo' 로 저장하던 행은 이 정책에 걸려 이제 거부된다(의도된 차단).
--       - src/app/(broker)/broker/clients/new/page.tsx:64  magazine_subscribers upsert (broker_id = user.id UUID, source='crm_sync')
--           → 지금까지는 `Public subscribe` INSERT(true) 덕에 통과했을 가능성. 정책 삭제 후에는
--             `Broker manages own subscribers`(broker_id ∈ own slug)에 걸려 **조용히 실패**(에러 무시됨).
--             → 서버 API(서비스 키) 경유로 옮겨야 함 (I-03/P0-03 소유자에게 요청). 이 마이그레이션은 그 정책을 되살리지 않는다.
-- ============================================================================

begin;

-- ── 0. 사전 가드: 대상 테이블 존재 확인 (없으면 즉시 중단) ───────────────────
do $$
declare t text;
begin
  foreach t in array array['magazine_issues','magazine_editions','magazine_analytics_events','magazine_subscribers'] loop
    if to_regclass('public.' || t) is null then
      raise exception 'RLS lockdown 중단: public.% 테이블이 없습니다.', t;
    end if;
  end loop;
end $$;

-- ── 1. 일반화 정리: PUBLIC/anon 에 열린 `true` 정책 제거 (운영 정책명이 원본과 달라도 잡는다) ──
--   대상 : roles 에 public 또는 anon 포함 AND (qual='true' OR with_check='true')
--   예외 : magazine_editions 의 SELECT 는 아래 3번에서 published 전용으로 재생성하므로 함께 제거해도 무방
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname, cmd, roles, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and tablename in ('magazine_issues','magazine_editions','magazine_analytics_events','magazine_subscribers')
      and (roles && array['public','anon']::name[])
      and (qual = 'true' or with_check = 'true')
  loop
    raise notice 'DROP POLICY %.% (cmd=%, roles=%, qual=%, with_check=%)', r.tablename, r.policyname, r.cmd, r.roles, r.qual, r.with_check;
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- ── 2. 이름 기반 명시 정리 (원본 마이그레이션 기준, 멱등) ────────────────────
drop policy if exists "Public can view magazine_issues"                  on public.magazine_issues;             -- 00054:15 SELECT true
drop policy if exists "Service role can insert/update magazine_issues"   on public.magazine_issues;             -- 00054:19 ALL true
drop policy if exists "editions_service_all"                             on public.magazine_editions;           -- 00063:108 ALL true
drop policy if exists "analytics_service_all"                            on public.magazine_analytics_events;   -- 00063:169 ALL true
drop policy if exists "analytics_insert_public"                          on public.magazine_analytics_events;   -- 00063 INSERT true (익명 방문자 INSERT → 서비스 API 경유로 대체)
drop policy if exists "Public subscribe"                                 on public.magazine_subscribers;        -- 00065:54 INSERT true (S2-07)

-- ── 3. service_role 전용 정책 재생성 ────────────────────────────────────────
-- (service_role 은 BYPASSRLS 라 정책이 없어도 동작하지만, 의도를 명시하고 PUBLIC 오적용을 막는다)
drop policy if exists "magazine_issues_service_all" on public.magazine_issues;
create policy "magazine_issues_service_all" on public.magazine_issues
  for all to service_role using (true) with check (true);

drop policy if exists "editions_service_all" on public.magazine_editions;
create policy "editions_service_all" on public.magazine_editions
  for all to service_role using (true) with check (true);

drop policy if exists "analytics_service_all" on public.magazine_analytics_events;
create policy "analytics_service_all" on public.magazine_analytics_events
  for all to service_role using (true) with check (true);

-- ── 4. anon/authenticated 읽기 정책 ─────────────────────────────────────────
-- 4-1. magazine_editions: published 만 SELECT (anon 포함)
drop policy if exists "editions_public_read" on public.magazine_editions;
create policy "editions_public_read" on public.magazine_editions
  for select to anon, authenticated using (status = 'published');

-- 4-2. magazine_issues: status 컬럼이 있을 때만 published SELECT 허용. 없으면(현 운영) SELECT 정책 없음 = 서버 경유 전용.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'magazine_issues' and column_name = 'status'
  ) then
    execute 'drop policy if exists "magazine_issues_public_read" on public.magazine_issues';
    execute $p$create policy "magazine_issues_public_read" on public.magazine_issues
              for select to anon, authenticated using (status = 'published')$p$;
    raise notice 'magazine_issues.status 존재 → published 전용 SELECT 정책 생성';
  else
    raise notice 'magazine_issues.status 없음 → anon/authenticated SELECT 정책 없음(서버 서비스키 경유만)';
  end if;
end $$;

-- 4-3. magazine_analytics_events / magazine_subscribers: anon 정책 0개 (INSERT 는 /api/public/magazine/* 서비스 키 경유)
--      (analytics_broker_read / analytics_admin_all / "Broker manages own subscribers" 는 auth.uid() 조건이라 anon 에게는 항상 false)

-- ── 5. RLS 강제 확인 ────────────────────────────────────────────────────────
alter table public.magazine_issues           enable row level security;
alter table public.magazine_editions         enable row level security;
alter table public.magazine_analytics_events enable row level security;
alter table public.magazine_subscribers      enable row level security;

-- ── 6. 자동 검증 (실패 시 예외 → 트랜잭션 전체 롤백) ─────────────────────────
do $$
declare
  bad int;
begin
  -- 6-1. public/anon 에 열린 쓰기 정책(ALL/INSERT/UPDATE/DELETE) 잔존 여부
  select count(*) into bad
  from pg_policies
  where schemaname = 'public'
    and tablename in ('magazine_issues','magazine_editions','magazine_analytics_events','magazine_subscribers')
    and (roles && array['public','anon']::name[])
    and cmd in ('ALL','INSERT','UPDATE','DELETE');
  if bad > 0 then
    raise exception '검증 실패: public/anon 쓰기 정책 % 건 잔존', bad;
  end if;

  -- 6-2. magazine_analytics_events 에 anon 정책 0개
  select count(*) into bad
  from pg_policies
  where schemaname = 'public' and tablename = 'magazine_analytics_events'
    and (roles && array['anon']::name[]);
  if bad > 0 then
    raise exception '검증 실패: magazine_analytics_events 에 anon 정책 % 건', bad;
  end if;

  -- 6-3. anon/public 의 SELECT true 잔존 여부 (magazine_* 4테이블)
  select count(*) into bad
  from pg_policies
  where schemaname = 'public'
    and tablename in ('magazine_issues','magazine_editions','magazine_analytics_events','magazine_subscribers')
    and (roles && array['public','anon']::name[])
    and (qual = 'true' or with_check = 'true');
  if bad > 0 then
    raise exception '검증 실패: public/anon true 정책 % 건 잔존', bad;
  end if;

  -- 6-4. RLS enabled
  select count(*) into bad
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('magazine_issues','magazine_editions','magazine_analytics_events','magazine_subscribers')
    and not c.relrowsecurity;
  if bad > 0 then
    raise exception '검증 실패: RLS 비활성 테이블 % 개', bad;
  end if;
end $$;

commit;
