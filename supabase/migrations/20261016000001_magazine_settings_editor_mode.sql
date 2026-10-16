-- ============================================================================
-- 20261016000001_magazine_settings_editor_mode.sql
-- 목적  : 매거진 에디터 기본 모드 선호('simple' | 'full')를 magazine_settings 에 영속화한다.
--         60대 중개사 기본값은 'simple'(간단 모드: 골디락스 미니멈 포맷)이며,
--         전체(고급) 모드로 전환한 중개사는 다음 진입 시에도 선호 모드를 유지한다.
-- 전제  : 20261004000007_magazine_settings.sql 이후 권장 (테이블 미존재 시에도 안전하게 건너뜀 — 멱등).
-- 롤백  : supabase/migrations/_rollback/20261016000001_rollback.sql
-- ============================================================================
begin;

do $$
begin
  if to_regclass('public.magazine_settings') is null then
    raise notice '건너뜀: public.magazine_settings 테이블이 아직 없습니다 (000007 적용 후 재실행 가능 — 멱등).';
  else
    alter table public.magazine_settings
      add column if not exists editor_mode text not null default 'simple';

    if not exists (
      select 1
        from pg_constraint
       where conrelid = 'public.magazine_settings'::regclass
         and conname = 'magazine_settings_editor_mode_check'
    ) then
      alter table public.magazine_settings
        add constraint magazine_settings_editor_mode_check
        check (editor_mode in ('simple', 'full'));
    end if;
  end if;
end $$;

commit;
