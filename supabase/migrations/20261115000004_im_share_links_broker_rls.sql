-- =============================================================================
-- Migration: 20261115000004_im_share_links_broker_rls.sql
-- Purpose:
--   Wave 6 — WP-21:
--   Idempotently enable RLS on public.im_share_links (guarded with IF EXISTS)
--   and replace overly broad authenticated read policies with strict owner-scoped
--   SELECT / UPDATE policies allowing authenticated brokers to read/revoke their
--   own `created_by = auth.uid()` (or `broker_id = auth.uid()`) share links.
-- =============================================================================

begin;

alter table if exists public.im_share_links
  add column if not exists created_by uuid,
  add column if not exists broker_id uuid;

alter table if exists public.im_share_links enable row level security;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'im_share_links'
  ) then
    drop policy if exists "im_share_links_select_all" on public.im_share_links;
    drop policy if exists "im_share_links_broker_select_own" on public.im_share_links;
    drop policy if exists "im_share_links_broker_update_own" on public.im_share_links;

    create policy "im_share_links_broker_select_own"
      on public.im_share_links
      for select
      to authenticated
      using (created_by = auth.uid() or broker_id = auth.uid());

    create policy "im_share_links_broker_update_own"
      on public.im_share_links
      for update
      to authenticated
      using (created_by = auth.uid() or broker_id = auth.uid())
      with check (created_by = auth.uid() or broker_id = auth.uid());

    create index if not exists idx_im_share_links_created_by
      on public.im_share_links (created_by)
      where created_by is not null;
  end if;
end $$;

commit;
