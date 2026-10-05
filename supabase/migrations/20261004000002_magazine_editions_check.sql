-- ============================================================================
-- 20261004000002_magazine_editions_check.sql
-- 목적  : magazine_editions CHECK 정리
--         · status      : `needs_review` 추가 (품질 게이트 불합격 상태, 기존 허용값 유지)
--         · edition_type: `owner_report` 제거, `special`·`flash` 포함 (기존 허용값과 합집합)
-- 결함  : D2-05, M2-06 (T2-02 계열) / 함정 #11 — QG fail-closed(C-02) 이전에 반드시 선적용
-- 적용  : Supabase SQL Editor 수동. 000001 이후 적용 권장.
--
-- [적용 전 확인 쿼리]  (결과를 db-snapshots 에 저장)
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = 'public.magazine_editions'::regclass and contype = 'c' order by 1;
--   select status, count(*) from public.magazine_editions group by 1;
--   select edition_type, count(*) from public.magazine_editions group by 1;
--
-- [적용 후 검증 쿼리]
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = 'public.magazine_editions'::regclass and contype = 'c'
--     and conname in ('magazine_editions_status_check','magazine_editions_edition_type_check');
--   -- status 정의에 needs_review 포함, edition_type 정의에 owner_report 없음, special/flash 포함 확인
--
-- [롤백]  supabase/migrations/_rollback/20261004000002_magazine_editions_check_rollback.sql
--
-- [동작]  운영의 기존 CHECK 정의를 읽어 따옴표 리터럴을 추출 → 정본 허용값과 **합집합**(owner_report 제외)으로 재생성.
--         기존 행 중 새 허용값 밖의 값이 있으면 예외로 중단(데이터 변경 없음).
-- 정본 : src/domain/magazine/types.ts EDITION_STATUSES / EditionType, 00063_weekly_magazine.sql:11-12,41-42
-- ============================================================================
begin;

do $$
declare
  canon_status text[] := array['draft','editing','review','needs_review','scheduled','published','archived'];
  canon_type   text[] := array['daily','weekly','monthly','special','flash'];
  r            record;
  existing     text[];
  v_status     text[];
  v_type       text[];
  bad          int;
begin
  if to_regclass('public.magazine_editions') is null then
    raise exception '000002 중단: public.magazine_editions 가 없습니다.';
  end if;

  -- ── status ────────────────────────────────────────────────────────────────
  v_status := canon_status;
  for r in
    select conname, pg_get_constraintdef(oid) as def
    from pg_constraint
    where conrelid = 'public.magazine_editions'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ~ '\mstatus\M'
      and pg_get_constraintdef(oid) !~ '\medition_type\M'
  loop
    select coalesce(array_agg(distinct m[1]), '{}') into existing
      from regexp_matches(r.def, '''([^'']+)''', 'g') as m;
    v_status := v_status || existing;
    raise notice '기존 status CHECK % : %', r.conname, r.def;
  end loop;
  select array_agg(distinct x order by x) into v_status from unnest(v_status) as x where x <> 'owner_report';

  select count(*) into bad from public.magazine_editions where status <> all (v_status);
  if bad > 0 then
    raise exception '000002 중단: status 가 허용값 밖인 행 % 건 — 확인 후 재시도', bad;
  end if;

  for r in
    select conname from pg_constraint
    where conrelid = 'public.magazine_editions'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ~ '\mstatus\M'
      and pg_get_constraintdef(oid) !~ '\medition_type\M'
  loop
    execute format('alter table public.magazine_editions drop constraint %I', r.conname);
  end loop;
  execute format(
    'alter table public.magazine_editions add constraint magazine_editions_status_check check (status in (%s))',
    (select string_agg(quote_literal(x), ',' order by x) from unnest(v_status) as x)
  );

  -- ── edition_type ──────────────────────────────────────────────────────────
  v_type := canon_type;
  for r in
    select conname, pg_get_constraintdef(oid) as def
    from pg_constraint
    where conrelid = 'public.magazine_editions'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ~ '\medition_type\M'
  loop
    select coalesce(array_agg(distinct m[1]), '{}') into existing
      from regexp_matches(r.def, '''([^'']+)''', 'g') as m;
    v_type := v_type || existing;
    raise notice '기존 edition_type CHECK % : %', r.conname, r.def;
  end loop;
  select array_agg(distinct x order by x) into v_type from unnest(v_type) as x where x <> 'owner_report';

  select count(*) into bad from public.magazine_editions where edition_type <> all (v_type);
  if bad > 0 then
    raise exception '000002 중단: edition_type 이 허용값 밖인 행 % 건 (owner_report 등) — 확인 후 재시도', bad;
  end if;

  for r in
    select conname from pg_constraint
    where conrelid = 'public.magazine_editions'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ~ '\medition_type\M'
  loop
    execute format('alter table public.magazine_editions drop constraint %I', r.conname);
  end loop;
  execute format(
    'alter table public.magazine_editions add constraint magazine_editions_edition_type_check check (edition_type in (%s))',
    (select string_agg(quote_literal(x), ',' order by x) from unnest(v_type) as x)
  );

  -- ── 자동 검증 ─────────────────────────────────────────────────────────────
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.magazine_editions'::regclass and conname = 'magazine_editions_status_check'
      and pg_get_constraintdef(oid) like '%needs_review%'
  ) then
    raise exception '검증 실패: status CHECK 에 needs_review 가 없습니다.';
  end if;
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.magazine_editions'::regclass and conname = 'magazine_editions_edition_type_check'
      and pg_get_constraintdef(oid) like '%owner_report%'
  ) then
    raise exception '검증 실패: edition_type CHECK 에 owner_report 가 남아 있습니다.';
  end if;
end $$;

commit;
