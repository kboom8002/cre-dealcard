-- ROLLBACK for 20261016000001_magazine_settings_editor_mode.sql
begin;

do $$
begin
  if to_regclass('public.magazine_settings') is not null then
    alter table public.magazine_settings
      drop constraint if exists magazine_settings_editor_mode_check;
    alter table public.magazine_settings
      drop column if exists editor_mode;
  end if;
end $$;

commit;
