-- ============================================================================
-- 20261004000013_magazine_editions_unique_kind.sql
-- 목적  : magazine_editions 의 유일성을 (broker_id, edition_type, edition_label) 로 보장한다. edition_type(kind) 이 키에 포함돼야
--         같은 날짜/라벨의 weekly·daily·special 이 서로 덮어쓰지 않는다. (00063 의 uq_edition_broker_type_label 이 운영에 없을 때를 대비한 멱등 보강)
--         ※ magazine_editions 에는 issue_date 컬럼이 없다(라벨 = 'W41-2026' / '2026-10-05'). 실제 컬럼명으로 작성.
-- 결함  : D2-04/E-01 계열, 함정 #12 — **조회 코드는 edition_type 필터를 동시에 사용**해야 한다(`.eq('edition_type', kind)` 없이
--         `maybeSingle()` 하면 다중 행 오류). 코드 배포를 이 마이그레이션보다 먼저/같이.
-- 적용  : SQL Editor 수동. 000002 이후.
--
-- [적용 전 확인 쿼리]
--   -- 중복(있으면 이 마이그레이션이 중단됨)
--   select broker_id, edition_type, edition_label, count(*) from public.magazine_editions
--    group by 1,2,3 having count(*) > 1;
--   -- 기존 유니크 제약/인덱스
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'public.magazine_editions'::regclass and contype = 'u';
--   select indexname, indexdef from pg_indexes where tablename = 'magazine_editions' and indexdef ilike '%unique%';
-- [적용 후 검증 쿼리]
--   select indexname from pg_indexes where tablename='magazine_editions' and indexdef ilike '%unique%' and indexdef ilike '%edition_type%';  -- ≥1행
-- [롤백]  supabase/migrations/_rollback/20261004000013_magazine_editions_unique_kind_rollback.sql
--         (이 파일이 만든 인덱스만 제거. 00063 의 uq_edition_broker_type_label 제약은 건드리지 않음)
-- ============================================================================
begin;

do $$
declare
  dup int;
  has_unique boolean;
begin
  if to_regclass('public.magazine_editions') is null then
    raise exception '000013 중단: public.magazine_editions 가 없습니다.';
  end if;

  select count(*) into dup from (
    select 1 from public.magazine_editions group by broker_id, edition_type, edition_label having count(*) > 1
  ) d;
  if dup > 0 then
    raise exception '000013 중단: (broker_id, edition_type, edition_label) 중복 % 그룹 — [적용 전 확인 쿼리]로 확인 후 정리하세요(삭제는 수동).', dup;
  end if;

  -- 이미 정확히 (broker_id, edition_type, edition_label) 를 덮는 UNIQUE 인덱스/제약이 있으면 새로 만들지 않는다
  select exists (
    select 1
    from pg_index i
    join pg_class c on c.oid = i.indrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'magazine_editions' and i.indisunique and i.indpred is null
      and (select array_agg(a.attname::text order by a.attname::text)
             from pg_attribute a where a.attrelid = c.oid and a.attnum = any (i.indkey)) = array['broker_id','edition_label','edition_type']
  ) into has_unique;

  if not has_unique then
    create unique index uq_magazine_editions_broker_type_label
      on public.magazine_editions (broker_id, edition_type, edition_label);
    raise notice 'uq_magazine_editions_broker_type_label 생성';
  else
    raise notice '이미 동일 키의 UNIQUE 가 존재 — 생성 생략';
  end if;
end $$;

commit;
