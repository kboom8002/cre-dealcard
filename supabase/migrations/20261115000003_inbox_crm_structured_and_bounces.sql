-- =============================================================================
-- Migration: 20261115000003_inbox_crm_structured_and_bounces.sql
-- Purpose:
--   Wave 5 — WP-18:
--   1. Add structured CRM columns (is_vip, client_role, preferred_regions,
--      budget_manwon, free_memo) + email deliverability columns
--      (email_delivery_status, email_bounced_at, email_bounce_reason)
--      idempotently on public.broker_clients without clobbering freeform notes.
--   2. Add email deliverability columns (email_delivery_status,
--      email_bounced_at, email_bounce_reason) idempotently on
--      public.magazine_subscribers for Resend bounce/complaint suppression.
--   3. Add composite CRM filter & email lookup indexes.
-- =============================================================================

begin;

-- ── 1. public.broker_clients structured CRM & bounce columns ─────────────────
alter table if exists public.broker_clients
  add column if not exists is_vip boolean not null default false,
  add column if not exists client_role text default 'buyer',
  add column if not exists preferred_regions text[] not null default '{}'::text[],
  add column if not exists budget_manwon bigint,
  add column if not exists free_memo text,
  add column if not exists email_delivery_status text not null default 'ok',
  add column if not exists email_bounced_at timestamptz,
  add column if not exists email_bounce_reason text;

do $$
begin
  if to_regclass('public.broker_clients') is not null then
    if not exists (
      select 1
      from pg_constraint
      where conrelid = 'public.broker_clients'::regclass
        and conname = 'broker_clients_client_role_check'
    ) then
      alter table public.broker_clients
        add constraint broker_clients_client_role_check
        check (client_role is null or client_role in ('buyer', 'seller', 'tenant', 'partner'));
    end if;

    if not exists (
      select 1
      from pg_constraint
      where conrelid = 'public.broker_clients'::regclass
        and conname = 'broker_clients_email_delivery_status_check'
    ) then
      alter table public.broker_clients
        add constraint broker_clients_email_delivery_status_check
        check (email_delivery_status in ('ok', 'bounced', 'complained'));
    end if;

    -- Non-destructive sync from legacy tier / client_type columns
    update public.broker_clients
       set is_vip = true
     where tier = 'vip'
       and is_vip = false;

    update public.broker_clients
       set client_role = 'seller'
     where client_type = 'seller'
       and (client_role is null or client_role = 'buyer');
  end if;
end $$;

create index if not exists idx_broker_clients_broker_vip_role
  on public.broker_clients (broker_id, is_vip, client_role);

create index if not exists idx_broker_clients_email_lc
  on public.broker_clients (lower(email))
  where email is not null;

create index if not exists idx_broker_clients_delivery_status
  on public.broker_clients (broker_id, email_delivery_status);

-- ── 2. public.magazine_subscribers bounce & complaint columns ────────────────
alter table if exists public.magazine_subscribers
  add column if not exists email_delivery_status text not null default 'ok',
  add column if not exists email_bounced_at timestamptz,
  add column if not exists email_bounce_reason text;

do $$
begin
  if to_regclass('public.magazine_subscribers') is not null then
    if not exists (
      select 1
      from pg_constraint
      where conrelid = 'public.magazine_subscribers'::regclass
        and conname = 'magazine_subscribers_email_delivery_status_check'
    ) then
      alter table public.magazine_subscribers
        add constraint magazine_subscribers_email_delivery_status_check
        check (email_delivery_status in ('ok', 'bounced', 'complained'));
    end if;
  end if;
end $$;

create index if not exists idx_mag_sub_email_delivery_status
  on public.magazine_subscribers (lower(subscriber_email), email_delivery_status)
  where subscriber_email is not null;

commit;
