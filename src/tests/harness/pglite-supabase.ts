import fs from 'fs';
import path from 'path';
import { PGlite } from '@electric-sql/pglite';

export type HarnessRole = 'service_role' | 'authenticated' | 'anon';

export interface HarnessClientOptions {
  role?: HarnessRole;
  userId?: string | null;
  email?: string | null;
}

export type HarnessRow = Record<string, unknown>;
export type HarnessDefaultData = HarnessRow[] & HarnessRow;

export interface HarnessQueryResult<T = HarnessDefaultData> {
  data: T;
  error: { message: string; code?: string; details?: string; hint?: string } | null;
  count?: number | null;
}

const DEFAULT_PK_BY_TABLE: Record<string, string> = {
  im_share_links: 'token',
  rate_limit_counters: 'bucket_key',
  user_subscriptions: 'user_id',
};

const JSONB_COLUMNS = new Set([
  'draft_payload',
  'published_snapshot',
  'correction_notice',
  'metadata',
  'layers',
  'confidence',
  'disclosure',
  'body',
  'source_refs',
  'raw_register',
  'event_data',
  'content',
  'sections',
  'deals',
  'contact',
  'pending_magazine_deals',
  'interest_profile',
  'field_note',
  'payload',
  'raw_data',
  'raw',
]);

const TEXT_ARRAY_COLUMNS = new Set([
  'preferred_regions',
  'tags',
  'deal_points',
  'caution_points',
  'buyer_fit_types',
  'hidden_fields',
  'requested_fields',
  'specialty_regions',
  'specialty_assets',
  'interest_tags',
  'target_segments',
  'featured_deal_ids',
  'cover_keywords',
  'theme_asset_types',
  'p_sigungu_codes',
  'p_district_keywords',
]);

const UUID_ARRAY_COLUMNS = new Set([
  'linked_building_ids',
  'linked_buyer_intent_ids',
]);

const BASE_SCHEMA_SQL = `
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION auth.role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), current_user::text);
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'broker',
  display_name text,
  phone text,
  company text,
  tagline text,
  photo_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

CREATE TABLE IF NOT EXISTS public.broker_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  card_name text,
  card_title text,
  slug text UNIQUE,
  bio text,
  seo_summary text,
  is_verified boolean NOT NULL DEFAULT false,
  is_public boolean NOT NULL DEFAULT true,
  specialty_regions text[] NOT NULL DEFAULT '{}',
  specialty_assets text[] NOT NULL DEFAULT '{}',
  deal_specialty text,
  deal_types_ratio jsonb,
  buyer_types text[] DEFAULT '{}',
  preferred_price_range text,
  deal_size_range text,
  languages text[] DEFAULT '{}',
  fee_policy text,
  consult_methods text[] DEFAULT '{}',
  response_time_hours int,
  career_start_year int,
  total_deal_count_self int,
  association text,
  license_number text,
  office_reg_number text,
  office_address text,
  representative_name text,
  office_district text,
  office_dong text,
  logo_company_url text,
  logo_partner_url text,
  photo_url text,
  magazine_cover_image text,
  kakao_channel text,
  naver_blog_url text,
  youtube_url text,
  linkedin_url text,
  faq_items jsonb DEFAULT '[]'::jsonb,
  vibe_vector jsonb,
  vibe_vti text,
  vibe_complement jsonb,
  vibe_valence numeric,
  vibe_trust numeric,
  vibe_analyzed_at timestamptz,
  vibe_template_id text,
  contact_email text,
  pending_magazine_deals jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.building_ssot_lite (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by_role text NOT NULL DEFAULT 'broker',
  input_type text NOT NULL DEFAULT 'manual_form',
  raw_input text NOT NULL DEFAULT '',
  raw_address text,
  address text,
  area_signal text,
  asset_type text,
  price_band text,
  size_signal text,
  current_use_signal text,
  vacancy_signal text,
  fit_summary text,
  caution_summary text,
  hidden_fields text[] NOT NULL DEFAULT '{}',
  layers jsonb NOT NULL DEFAULT '{}'::jsonb,
  pnu text,
  confidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  disclosure jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_register jsonb,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.building_signal_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id uuid NOT NULL REFERENCES public.building_ssot_lite(id) ON DELETE CASCADE,
  owner_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  title text NOT NULL,
  area_signal text,
  asset_type text,
  price_band text,
  deal_points text[] NOT NULL DEFAULT '{}',
  caution_points text[] NOT NULL DEFAULT '{}',
  buyer_fit_types text[] NOT NULL DEFAULT '{}',
  visibility text NOT NULL DEFAULT 'public_blind',
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','disclosure_checked','broker_reviewed','approved_internal','shared_external','archived')),
  body jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.document_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  source_type text NOT NULL DEFAULT 'building_ssot_lite',
  source_id uuid,
  building_id uuid REFERENCES public.building_ssot_lite(id) ON DELETE SET NULL,
  document_type text NOT NULL DEFAULT 'mobile_im',
  visibility text NOT NULL DEFAULT 'public_blind',
  status text NOT NULL DEFAULT 'draft',
  title text,
  body jsonb NOT NULL DEFAULT '{}'::jsonb,
  markdown text,
  source_refs jsonb NOT NULL DEFAULT '{}'::jsonb,
  model_version text,
  prompt_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_role text,
  event_type text NOT NULL,
  entity_type text,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Realistic 00001 / 00002 initial policies (dropped & replaced by 20261117000001)
ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "events_select_own" ON public.activity_events;
CREATE POLICY "events_select_own"
  ON public.activity_events FOR SELECT
  TO authenticated
  USING (actor_id = auth.uid());
DROP POLICY IF EXISTS "events_insert_authenticated" ON public.activity_events;
CREATE POLICY "events_insert_authenticated"
  ON public.activity_events FOR INSERT
  TO authenticated
  WITH CHECK (true);
DROP POLICY IF EXISTS "events_insert_anon" ON public.activity_events;
CREATE POLICY "events_insert_anon"
  ON public.activity_events FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.teaser_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teaser_config_id text,
  visitor_fp text,
  event_type text NOT NULL,
  event_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.broker_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_type text NOT NULL DEFAULT 'buyer',
  display_name text NOT NULL,
  company text,
  phone text,
  email text,
  tier text NOT NULL DEFAULT 'normal',
  tags text[] NOT NULL DEFAULT '{}',
  notes text,
  linked_building_ids uuid[] NOT NULL DEFAULT '{}',
  linked_buyer_intent_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Realistic 00020 initial policies (dropped & replaced by 20261117000002)
ALTER TABLE public.broker_clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "broker_clients_own_all" ON public.broker_clients;
CREATE POLICY "broker_clients_own_all"
  ON public.broker_clients FOR ALL
  TO authenticated
  USING (broker_id = auth.uid())
  WITH CHECK (broker_id = auth.uid());
DROP POLICY IF EXISTS "broker_clients_own" ON public.broker_clients;
CREATE POLICY "broker_clients_own"
  ON public.broker_clients FOR ALL
  TO authenticated
  USING (broker_id = auth.uid())
  WITH CHECK (broker_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.contact_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.broker_clients(id) ON DELETE CASCADE,
  contact_type text NOT NULL CHECK (contact_type IN ('phone', 'kakao', 'sms', 'email', 'meeting', 'site_visit', 'note')),
  summary text NOT NULL,
  scheduled_at timestamptz,
  completed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Realistic 00020 initial policy (locked down to owner SELECT + service_role writes)
ALTER TABLE public.contact_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "contact_history_own" ON public.contact_history;
CREATE POLICY "contact_history_own"
  ON public.contact_history FOR ALL
  TO authenticated
  USING (broker_id = auth.uid())
  WITH CHECK (broker_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.im_inquiry_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id text NOT NULL,
  doc_id uuid,
  broker_user_id uuid NOT NULL,
  requester_name text NOT NULL,
  requester_phone text NOT NULL,
  requester_email text,
  message text,
  source text NOT NULL DEFAULT 'im_cta',
  notification_sent boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gate_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id text NOT NULL,
  requester_id uuid,
  target_broker_id uuid,
  requested_level text NOT NULL DEFAULT 'G2',
  requested_fields text[] NOT NULL DEFAULT '{}',
  reason text,
  status text NOT NULL DEFAULT 'submitted',
  reviewer_id uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.im_share_links (
  token text PRIMARY KEY,
  series_id uuid NOT NULL,
  building_id text,
  broker_id uuid,
  created_by uuid,
  recipient_id uuid,
  status text NOT NULL DEFAULT 'active',
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Realistic 20261027000003 + 20261108000001 legacy policies (reconciled & locked down by 20261117000001)
ALTER TABLE public.im_share_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "im_share_links_select_all" ON public.im_share_links;
CREATE POLICY "im_share_links_select_all"
  ON public.im_share_links FOR SELECT
  TO authenticated
  USING (true);
DROP POLICY IF EXISTS "Brokers can insert own im_share_links" ON public.im_share_links;
CREATE POLICY "Brokers can insert own im_share_links"
  ON public.im_share_links FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = broker_id);
DROP POLICY IF EXISTS "Brokers can update own im_share_links" ON public.im_share_links;
CREATE POLICY "Brokers can update own im_share_links"
  ON public.im_share_links FOR UPDATE
  TO authenticated
  USING (auth.uid() = broker_id)
  WITH CHECK (auth.uid() = broker_id);

CREATE TABLE IF NOT EXISTS public.magazine_subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id text NOT NULL,
  broker_user_id uuid,
  subscriber_phone text,
  phone_e164 text,
  subscriber_email text,
  subscriber_name text,
  channel text NOT NULL DEFAULT 'email',
  status text NOT NULL DEFAULT 'active',
  confirm_status text NOT NULL DEFAULT 'confirmed',
  confirm_token_hash text,
  consent_channel text,
  consent_version text,
  marketing_consent_at timestamptz,
  reconfirm_due_at timestamptz,
  client_id uuid,
  email_delivery_status text,
  email_bounced_at timestamptz,
  email_bounce_reason text,
  source text DEFAULT 'manual',
  interest_profile jsonb DEFAULT '{}'::jsonb,
  segment text,
  night_consent boolean DEFAULT false,
  subscribed_at timestamptz DEFAULT now(),
  unsubscribed_at timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.magazine_editions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id text NOT NULL,
  broker_user_id uuid,
  issue_date text NOT NULL DEFAULT '',
  edition_type text,
  edition_label text,
  theme_color text,
  kind text NOT NULL DEFAULT 'weekly',
  status text NOT NULL DEFAULT 'draft',
  title text,
  headline text,
  ai_briefing text,
  market_temp text,
  cover_keywords text[] DEFAULT '{}',
  cover_image_url text,
  theme_title text,
  theme_body_md text,
  theme_asset_types text[] DEFAULT '{}',
  field_note jsonb,
  target_segments text[],
  featured_deal_ids text[],
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  sections jsonb NOT NULL DEFAULT '{}'::jsonb,
  deals jsonb NOT NULL DEFAULT '[]'::jsonb,
  view_count integer NOT NULL DEFAULT 0,
  share_count integer NOT NULL DEFAULT 0,
  version integer DEFAULT 1,
  scheduled_at timestamptz,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.magazine_analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_id uuid REFERENCES public.magazine_editions(id) ON DELETE CASCADE,
  broker_id text,
  event_type text NOT NULL,
  visitor_id text,
  scroll_pct integer,
  dwell_seconds integer,
  section_id text,
  target_url text,
  target_param text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.magazine_poll_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id text,
  edition_date text,
  choice integer NOT NULL,
  visitor_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.magazine_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id text NOT NULL,
  issue_date text NOT NULL,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (broker_id, issue_date)
);

CREATE TABLE IF NOT EXISTS public.magazine_dispatch_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text UNIQUE,
  edition_id uuid REFERENCES public.magazine_editions(id) ON DELETE CASCADE,
  broker_id text,
  broker_user_id uuid,
  subscriber_id uuid,
  channel text,
  kind text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'pending_worker', 'retryable', 'sent', 'blocked', 'failed', 'dry_run')),
  blocked_reason text,
  provider_msg_id text,
  error text,
  error_reason text,
  error_message text,
  recipient_hash text,
  sent_at timestamptz,
  updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.magazine_cron_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_key text,
  bucket_key text,
  run_id text,
  broker_id text,
  broker_user_id uuid,
  issue_date text,
  kind text,
  status text,
  reason text,
  duration_ms int,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_key, bucket_key)
);

CREATE TABLE IF NOT EXISTS public.party (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  owner_broker_id uuid,
  name text,
  phone_e164 text,
  email text,
  entity_type text,
  consent_version text,
  consent_at timestamptz,
  retention_until date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.buyer_condition (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id uuid REFERENCES public.party(id) ON DELETE CASCADE,
  observed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.im_pro_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid,
  building_id uuid,
  gate_request_id uuid,
  broker_id uuid,
  requester_id uuid,
  requester_name varchar(100) NOT NULL DEFAULT '',
  requester_phone varchar(50) NOT NULL DEFAULT '',
  requester_email varchar(100),
  status varchar(30) NOT NULL DEFAULT 'pending_nda',
  grant_token text,
  nda_signed_at timestamptz,
  watermark_seed varchar(100),
  max_downloads integer NOT NULL DEFAULT 5,
  download_count integer NOT NULL DEFAULT 0,
  pdf_export_allowed boolean NOT NULL DEFAULT true,
  is_revoked boolean NOT NULL DEFAULT false,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.track_event (
  id bigserial,
  tenant_id uuid,
  deal_id uuid,
  kind text NOT NULL,
  viewer_id uuid,
  share_token text,
  grant_token text,
  party_id uuid,
  payload jsonb DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
) PARTITION BY RANGE (occurred_at);

CREATE TABLE IF NOT EXISTS public.track_event_2026_08 PARTITION OF public.track_event
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE IF NOT EXISTS public.track_event_2026_09 PARTITION OF public.track_event
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE IF NOT EXISTS public.track_event_2026_10 PARTITION OF public.track_event
  FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');

CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'free',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.external_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'molit',
  address text NOT NULL DEFAULT '',
  district text,
  region_code text,
  dong text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  transaction_price bigint NOT NULL DEFAULT 0,
  land_area numeric(10,2),
  building_area numeric(10,2),
  floors integer,
  built_year integer,
  parking_count integer,
  usage_type text,
  land_price bigint,
  zoning text,
  transaction_date date NOT NULL DEFAULT CURRENT_DATE,
  deal_ymd text,
  deal_amount_manwon bigint,
  land_area_sqm numeric,
  gfa_sqm numeric,
  raw_data jsonb DEFAULT '{}'::jsonb,
  raw jsonb DEFAULT '{}'::jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA public TO anon;
`;

function sanitizeIdentifier(ident: string): string {
  const clean = ident.trim();
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(clean)) {
    throw new Error(`Invalid SQL identifier: ${ident}`);
  }
  return `"${clean}"`;
}

function toJsonPathSql(colExpr: string): { sql: string; isJsonText: boolean } {
  const clean = colExpr.trim();
  // e.g. metadata->>building_id or body->photos_v2 or metadata->im_item->>id
  if (clean.includes('->')) {
    const parts: string[] = [];
    const ops: string[] = [];
    let rest = clean;
    while (rest.length > 0) {
      const idx2 = rest.indexOf('->>');
      const idx1 = rest.indexOf('->');
      if (idx2 !== -1 && (idx1 === -1 || idx2 <= idx1)) {
        parts.push(rest.slice(0, idx2));
        ops.push('->>');
        rest = rest.slice(idx2 + 3);
      } else if (idx1 !== -1) {
        parts.push(rest.slice(0, idx1));
        ops.push('->');
        rest = rest.slice(idx1 + 2);
      } else {
        parts.push(rest);
        break;
      }
    }
    let expr = sanitizeIdentifier(parts[0]);
    for (let i = 0; i < ops.length; i++) {
      const key = parts[i + 1].replace(/^['"]|['"]$/g, '');
      if (!/^[a-zA-Z0-9_.-]+$/.test(key)) {
        throw new Error(`Invalid JSON key: ${key}`);
      }
      expr += `${ops[i]}'${key}'`;
    }
    return { sql: expr, isJsonText: ops[ops.length - 1] === '->>' };
  }
  return { sql: sanitizeIdentifier(clean), isJsonText: false };
}

function splitTopLevelSelect(selectStr: string): string[] {
  const raw = selectStr.trim();
  if (!raw || raw === '*') return ['*'];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildSelectClause(selectStr: string): { clause: string; onlyCount: boolean } {
  const cols = splitTopLevelSelect(selectStr);
  if (cols.length === 1 && cols[0] === '*') {
    return { clause: '*', onlyCount: false };
  }
  const sqlCols = cols.map((item) => {
    // Support alias:column->path
    const colonIdx = item.indexOf(':');
    if (colonIdx !== -1 && !item.includes('::')) {
      const alias = item.slice(0, colonIdx).trim();
      const target = item.slice(colonIdx + 1).trim();
      const { sql } = toJsonPathSql(target);
      return `${sql} AS ${sanitizeIdentifier(alias)}`;
    }
    if (item === '*') return '*';
    const { sql } = toJsonPathSql(item);
    return sql;
  });
  return { clause: sqlCols.join(', '), onlyCount: false };
}

interface FilterCond {
  type: 'eq' | 'neq' | 'in' | 'is' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike' | 'contains' | 'not' | 'or';
  col?: string;
  op?: string;
  val?: unknown;
  orExpr?: string;
}

function parseOrToken(token: string, params: unknown[]): string {
  const trimmed = token.trim();
  // Format: col.op.val (col may include -> or ->>)
  const match = trimmed.match(/^([a-zA-Z0-9_>-]+)\.(eq|neq|is|ilike|like|gt|gte|lt|lte|in)\.(.*)$/);
  if (!match) {
    return 'TRUE';
  }
  const [, rawCol, op, rawVal] = match;
  const { sql: colSql } = toJsonPathSql(rawCol);
  if (op === 'is') {
    if (rawVal === 'null') return `${colSql} IS NULL`;
    if (rawVal === 'true') return `${colSql} IS TRUE`;
    if (rawVal === 'false') return `${colSql} IS FALSE`;
  }
  if (op === 'in') {
    const inner = rawVal.replace(/^\(|\)$/g, '');
    const items = inner.split(',').map((s) => s.trim()).filter(Boolean);
    if (items.length === 0) return 'FALSE';
    const ph = items.map((v) => {
      params.push(v);
      return `$${params.length}`;
    });
    return `${colSql}::text IN (${ph.join(', ')})`;
  }
  params.push(rawVal);
  const pIdx = `$${params.length}`;
  switch (op) {
    case 'eq':
      return `${colSql}::text = ${pIdx}`;
    case 'neq':
      return `${colSql}::text IS DISTINCT FROM ${pIdx}`;
    case 'ilike':
      return `${colSql}::text ILIKE ${pIdx}`;
    case 'like':
      return `${colSql}::text LIKE ${pIdx}`;
    case 'gt':
      return `${colSql} > ${pIdx}`;
    case 'gte':
      return `${colSql} >= ${pIdx}`;
    case 'lt':
      return `${colSql} < ${pIdx}`;
    case 'lte':
      return `${colSql} <= ${pIdx}`;
    default:
      return 'TRUE';
  }
}

function compileWhere(filters: FilterCond[], params: unknown[]): string {
  if (filters.length === 0) return '';
  const parts: string[] = [];
  for (const f of filters) {
    if (f.type === 'or' && f.orExpr) {
      // Split commas outside parentheses
      const subTokens: string[] = [];
      let buf = '';
      let depth = 0;
      for (const ch of f.orExpr) {
        if (ch === '(') depth++;
        else if (ch === ')') depth = Math.max(0, depth - 1);
        if (ch === ',' && depth === 0) {
          subTokens.push(buf);
          buf = '';
        } else {
          buf += ch;
        }
      }
      if (buf.trim()) subTokens.push(buf);
      const orClauses = subTokens.map((tok) => parseOrToken(tok, params));
      parts.push(`(${orClauses.join(' OR ')})`);
      continue;
    }

    const { sql: colSql } = toJsonPathSql(f.col || 'id');
    switch (f.type) {
      case 'is': {
        if (f.val === null) parts.push(`${colSql} IS NULL`);
        else if (f.val === true) parts.push(`${colSql} IS TRUE`);
        else if (f.val === false) parts.push(`${colSql} IS FALSE`);
        else {
          params.push(f.val);
          parts.push(`${colSql} IS NOT DISTINCT FROM $${params.length}`);
        }
        break;
      }
      case 'eq': {
        params.push(f.val);
        parts.push(`${colSql} = $${params.length}`);
        break;
      }
      case 'neq': {
        params.push(f.val);
        parts.push(`${colSql} IS DISTINCT FROM $${params.length}`);
        break;
      }
      case 'gt': {
        params.push(f.val);
        parts.push(`${colSql} > $${params.length}`);
        break;
      }
      case 'gte': {
        params.push(f.val);
        parts.push(`${colSql} >= $${params.length}`);
        break;
      }
      case 'lt': {
        params.push(f.val);
        parts.push(`${colSql} < $${params.length}`);
        break;
      }
      case 'lte': {
        params.push(f.val);
        parts.push(`${colSql} <= $${params.length}`);
        break;
      }
      case 'like': {
        params.push(f.val);
        parts.push(`${colSql} LIKE $${params.length}`);
        break;
      }
      case 'ilike': {
        params.push(f.val);
        parts.push(`${colSql} ILIKE $${params.length}`);
        break;
      }
      case 'in': {
        const arr = Array.isArray(f.val) ? f.val : [];
        if (arr.length === 0) {
          parts.push('FALSE');
        } else {
          const ph = arr.map((v) => {
            params.push(v);
            return `$${params.length}`;
          });
          parts.push(`${colSql} IN (${ph.join(', ')})`);
        }
        break;
      }
      case 'contains': {
        if (Array.isArray(f.val)) {
          params.push(f.val);
          parts.push(`${colSql} @> $${params.length}`);
        } else {
          params.push(JSON.stringify(f.val ?? {}));
          parts.push(`${colSql} @> $${params.length}::jsonb`);
        }
        break;
      }
      case 'not': {
        const op = String(f.op || '').toLowerCase();
        if (op === 'is' && f.val === null) {
          parts.push(`${colSql} IS NOT NULL`);
        } else if (op === 'in') {
          const arr = Array.isArray(f.val)
            ? f.val
            : typeof f.val === 'string'
              ? f.val
                  .replace(/^\(|\)$/g, '')
                  .split(',')
                  .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
                  .filter(Boolean)
              : [];
          if (arr.length > 0) {
            const ph = arr.map((v) => {
              params.push(v);
              return `$${params.length}`;
            });
            parts.push(`${colSql} NOT IN (${ph.join(', ')})`);
          }
        } else {
          params.push(f.val);
          parts.push(`NOT (${colSql} = $${params.length})`);
        }
        break;
      }
    }
  }
  return parts.length > 0 ? `WHERE ${parts.join(' AND ')}` : '';
}

function serializeValueForParam(col: string, val: unknown): { value: unknown; cast: string } {
  if (val === undefined) return { value: null, cast: '' };
  if (val === null) return { value: null, cast: '' };
  if (TEXT_ARRAY_COLUMNS.has(col)) {
    return { value: Array.isArray(val) ? val : [], cast: '::text[]' };
  }
  if (UUID_ARRAY_COLUMNS.has(col)) {
    return { value: Array.isArray(val) ? val : [], cast: '::uuid[]' };
  }
  if (JSONB_COLUMNS.has(col) || (typeof val === 'object' && !(val instanceof Date))) {
    return { value: JSON.stringify(val), cast: '::jsonb' };
  }
  return { value: val instanceof Date ? val.toISOString() : val, cast: '' };
}

export class PgliteSupabaseHarness {
  public readonly db: PGlite;
  private queue: Promise<unknown> = Promise.resolve();

  private constructor(db: PGlite) {
    this.db = db;
  }

  static async create(options?: { extraMigrations?: string[] }): Promise<PgliteSupabaseHarness> {
    const db = new PGlite();
    await db.exec(BASE_SCHEMA_SQL);

    const migrationsDir = path.resolve(process.cwd(), 'supabase/migrations');
    const files = fs.existsSync(migrationsDir)
      ? fs
          .readdirSync(migrationsDir)
          .filter(
            (name) =>
              name.endsWith('.sql') &&
              (name.startsWith('20261115') ||
                name.startsWith('20261117') ||
                name.startsWith('20261119'))
          )
          .sort()
      : [];

    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      await db.exec(sql);
    }

    for (const extraSql of options?.extraMigrations || []) {
      await db.exec(extraSql);
    }

    await db.exec(`
      GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
      GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
      GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA public TO anon;
      DO $$
      BEGIN
        IF to_regclass('public.workspace_items') IS NOT NULL THEN
          -- WP-7.3C P1-3 mirror of 20261117000001: authenticated = owner-scoped
          -- SELECT only (writes are service-role + publish gates); anon = no access.
          REVOKE ALL ON TABLE public.workspace_items FROM PUBLIC, anon;
          REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.workspace_items FROM authenticated;
          GRANT SELECT ON TABLE public.workspace_items TO authenticated;
        END IF;
        IF to_regclass('public.activity_events') IS NOT NULL THEN
          -- WP-7.4E P0-1 mirror of 20261117000001: service_role writes only; authenticated = own SELECT.
          REVOKE ALL ON TABLE public.activity_events FROM PUBLIC, anon;
          REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.activity_events FROM authenticated;
          GRANT SELECT ON TABLE public.activity_events TO authenticated;
          GRANT ALL ON TABLE public.activity_events TO service_role;
        END IF;
        IF to_regclass('public.broker_clients') IS NOT NULL THEN
          -- WP-7.4E P0-1 mirror of 20261117000002: service_role writes only; authenticated = own SELECT.
          REVOKE ALL ON TABLE public.broker_clients FROM PUBLIC, anon;
          REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.broker_clients FROM authenticated;
          GRANT SELECT ON TABLE public.broker_clients TO authenticated;
          GRANT ALL ON TABLE public.broker_clients TO service_role;
        END IF;
        IF to_regclass('public.email_suppressions') IS NOT NULL THEN
          REVOKE ALL ON TABLE public.email_suppressions FROM PUBLIC, anon;
          REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.email_suppressions FROM authenticated;
          GRANT SELECT ON TABLE public.email_suppressions TO authenticated;
          GRANT ALL ON TABLE public.email_suppressions TO service_role;
        END IF;
        IF to_regclass('public.im_share_links') IS NOT NULL THEN
          ALTER TABLE public.im_share_links ENABLE ROW LEVEL SECURITY;
          ALTER TABLE public.im_share_links FORCE ROW LEVEL SECURITY;
          DROP POLICY IF EXISTS "Brokers can view own im_share_links" ON public.im_share_links;
          DROP POLICY IF EXISTS "Brokers can insert own im_share_links" ON public.im_share_links;
          DROP POLICY IF EXISTS "Brokers can update own im_share_links" ON public.im_share_links;
          DROP POLICY IF EXISTS "im_share_links_select_all" ON public.im_share_links;
          DROP POLICY IF EXISTS "im_share_links_broker_select_own" ON public.im_share_links;
          DROP POLICY IF EXISTS "im_share_links_broker_update_own" ON public.im_share_links;
          DROP POLICY IF EXISTS "im_share_links_select_own" ON public.im_share_links;
          DROP POLICY IF EXISTS "im_share_links_service_all" ON public.im_share_links;
          CREATE POLICY "im_share_links_service_all"
            ON public.im_share_links
            FOR ALL
            TO service_role
            USING (true)
            WITH CHECK (true);
          CREATE POLICY "im_share_links_select_own"
            ON public.im_share_links
            FOR SELECT
            TO authenticated
            USING (broker_id = auth.uid() OR created_by = auth.uid());
          REVOKE ALL ON TABLE public.im_share_links FROM PUBLIC, anon;
          REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.im_share_links FROM authenticated;
          GRANT SELECT ON TABLE public.im_share_links TO authenticated;
          GRANT ALL ON TABLE public.im_share_links TO service_role;
        END IF;
        IF to_regclass('public.contact_history') IS NOT NULL THEN
          ALTER TABLE public.contact_history ENABLE ROW LEVEL SECURITY;
          ALTER TABLE public.contact_history FORCE ROW LEVEL SECURITY;
          DROP POLICY IF EXISTS "contact_history_own" ON public.contact_history;
          DROP POLICY IF EXISTS "contact_history_own_all" ON public.contact_history;
          DROP POLICY IF EXISTS "contact_history_select_own" ON public.contact_history;
          DROP POLICY IF EXISTS "contact_history_service_all" ON public.contact_history;
          CREATE POLICY "contact_history_service_all"
            ON public.contact_history
            FOR ALL
            TO service_role
            USING (true)
            WITH CHECK (true);
          CREATE POLICY "contact_history_select_own"
            ON public.contact_history
            FOR SELECT
            TO authenticated
            USING (broker_id = auth.uid());
          REVOKE ALL ON TABLE public.contact_history FROM PUBLIC, anon;
          REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.contact_history FROM authenticated;
          GRANT SELECT ON TABLE public.contact_history TO authenticated;
          GRANT ALL ON TABLE public.contact_history TO service_role;
        END IF;
      END
      $$;
      DO $$
      DECLARE
        t text;
        r record;
        has_broker_user_id boolean;
        has_broker_id boolean;
        owner_expr text;
      BEGIN
        FOREACH t IN ARRAY ARRAY[
          'magazine_subscribers',
          'magazine_editions',
          'magazine_issues',
          'magazine_dispatch_logs'
        ]
        LOOP
          IF to_regclass('public.' || t) IS NOT NULL THEN
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
            EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);

            FOR r IN
              SELECT policyname
              FROM pg_policies
              WHERE schemaname = 'public'
                AND tablename = t
            LOOP
              EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, t);
            END LOOP;

            EXECUTE format(
              'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
              t || '_service_all',
              t
            );

            SELECT EXISTS (
              SELECT 1
              FROM information_schema.columns
              WHERE table_schema = 'public'
                AND table_name = t
                AND column_name = 'broker_user_id'
            ) INTO has_broker_user_id;

            SELECT EXISTS (
              SELECT 1
              FROM information_schema.columns
              WHERE table_schema = 'public'
                AND table_name = t
                AND column_name = 'broker_id'
            ) INTO has_broker_id;

            IF has_broker_user_id AND has_broker_id THEN
              owner_expr := '(broker_user_id = auth.uid() OR broker_id = auth.uid()::text OR EXISTS (SELECT 1 FROM public.broker_profiles bp WHERE bp.user_id = auth.uid() AND (bp.slug = broker_id OR bp.user_id::text = broker_id)))';
            ELSIF has_broker_user_id THEN
              owner_expr := '(broker_user_id = auth.uid())';
            ELSIF has_broker_id THEN
              owner_expr := '(broker_id = auth.uid()::text OR EXISTS (SELECT 1 FROM public.broker_profiles bp WHERE bp.user_id = auth.uid() AND (bp.slug = broker_id OR bp.user_id::text = broker_id)))';
            ELSE
              owner_expr := 'false';
            END IF;

            EXECUTE format(
              'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (%s)',
              t || '_select_own',
              t,
              owner_expr
            );

            EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon', t);
            EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.%I FROM authenticated', t);
            EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated', t);
            EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
          END IF;
        END LOOP;
      END
      $$;
    `);

    return new PgliteSupabaseHarness(db);
  }

  async close(): Promise<void> {
    await this.queue.catch(() => undefined);
    await this.db.close();
  }

  private runSerialized<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn);
    this.queue = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }

  async seedUser(input: {
    id: string;
    email: string;
    role?: 'broker' | 'admin' | 'public_user';
    displayName?: string;
    company?: string;
    phone?: string;
    slug?: string;
    registrationNo?: string;
    officeAddress?: string;
  }): Promise<void> {
    await this.runSerialized(async () => {
      await this.db.query(
        `INSERT INTO auth.users (id, email) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email`,
        [input.id, input.email]
      );
      await this.db.query(
        `INSERT INTO public.profiles (id, role, display_name, company, phone)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE
         SET role = EXCLUDED.role, display_name = EXCLUDED.display_name, company = EXCLUDED.company, phone = EXCLUDED.phone`,
        [
          input.id,
          input.role || 'broker',
          input.displayName || '김중개',
          input.company || '크리딜 공인중개사사무소',
          input.phone || '02-555-0199',
        ]
      );
      if ((input.role || 'broker') === 'broker') {
        await this.db.query(
          `INSERT INTO public.broker_profiles (user_id, card_name, slug, office_reg_number, office_address, representative_name, contact_email, is_public)
           VALUES ($1, $2, $3, $4, $5, $6, $7, true)
           ON CONFLICT (user_id) DO UPDATE
           SET card_name = EXCLUDED.card_name, office_reg_number = EXCLUDED.office_reg_number, office_address = EXCLUDED.office_address, representative_name = EXCLUDED.representative_name, contact_email = EXCLUDED.contact_email`,
          [
            input.id,
            input.displayName || '김중개',
            input.slug || `broker-${input.id.slice(0, 8)}`,
            input.registrationNo || '11680-2024-00011',
            input.officeAddress || '서울특별시 강남구 테헤란로 123',
            input.displayName || '김중개',
            input.email,
          ]
        );
      }
    });
  }

  async execSqlAs<TRow = HarnessRow>(
    opts: HarnessClientOptions,
    sql: string,
    params: unknown[] = []
  ): Promise<{ rows: TRow[] }> {
    return this.runSerialized(async () => {
      const role = opts.role || 'service_role';
      if (role === 'service_role') {
        return await this.db.query<TRow>(sql, params);
      }
      return await this.db.transaction(async (tx) => {
        await tx.query(`SET LOCAL ROLE ${role}`);
        if (opts.userId) {
          await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [opts.userId]);
        } else {
          await tx.query(`SELECT set_config('request.jwt.claim.sub', '', true)`);
        }
        await tx.query(`SELECT set_config('request.jwt.claim.role', $1, true)`, [role]);
        return await tx.query<TRow>(sql, params);
      });
    });
  }

  createClient(opts: HarnessClientOptions = {}) {
    const role: HarnessRole = opts.role || 'service_role';
    const userId = opts.userId || null;
    const email = opts.email || null;

    return {
      from: (tableName: string) => new HarnessQueryBuilder(this, { role, userId }, tableName),
      rpc: async <TData = HarnessDefaultData>(
        fnName: string,
        args: Record<string, unknown> = {}
      ): Promise<HarnessQueryResult<TData>> => {
        try {
          const entries = Object.entries(args);
          const params: unknown[] = [];
          const argSql = entries
            .map(([k, v]) => {
              const cleanKey = k.replace(/[^a-zA-Z0-9_]/g, '');
              const { value, cast } = serializeValueForParam(cleanKey, v);
              params.push(value);
              return `${cleanKey} => $${params.length}${cast}`;
            })
            .join(', ');
          const cleanFn = sanitizeIdentifier(fnName);
          const isTableReturning = cleanFn === '"consume_im_pro_grant_download"';
          const res = await this.execSqlAs<HarnessRow>(
            { role, userId },
            isTableReturning
              ? `SELECT * FROM public.${cleanFn}(${argSql})`
              : `SELECT public.${cleanFn}(${argSql}) AS result`,
            params
          );
          const rawData = isTableReturning ? res.rows ?? [] : res.rows?.[0]?.result ?? res.rows ?? null;
          return {
            data: rawData as TData,
            error: null,
          };
        } catch (err: unknown) {
          return {
            data: null as unknown as TData,
            error: extractPgError(err),
          };
        }
      },
      auth: {
        async getUser() {
          if (!userId) return { data: { user: null }, error: null };
          return { data: { user: { id: userId, email: email || 'user@example.com' } }, error: null };
        },
        admin: {
          getUserById: async (id: string) => {
            const res = await this.execSqlAs<{ id: string; email: string }>(
              { role: 'service_role' },
              `SELECT id, email FROM auth.users WHERE id = $1`,
              [id]
            );
            return { data: { user: res.rows?.[0] || null }, error: null };
          },
        },
      },
    };
  }
}

function extractPgError(err: unknown): {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
} {
  if (err && typeof err === 'object') {
    const rec = err as Record<string, unknown>;
    return {
      message: typeof rec.message === 'string' && rec.message ? rec.message : String(err),
      code: typeof rec.code === 'string' ? rec.code : undefined,
      details: typeof rec.detail === 'string' ? rec.detail : undefined,
      hint: typeof rec.hint === 'string' ? rec.hint : undefined,
    };
  }
  return { message: String(err) };
}

class HarnessQueryBuilder<TData = HarnessDefaultData> implements PromiseLike<HarnessQueryResult<TData>> {
  private op: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
  private selectStr = '*';
  private countMode: 'exact' | null = null;
  private headOnly = false;
  private returningSelect = false;
  private payload: object | object[] | null = null;
  private upsertConflictCols: string[] | null = null;
  private upsertIgnoreDuplicates = false;
  private filters: FilterCond[] = [];
  private orders: Array<{ col: string; ascending: boolean }> = [];
  private limitCount: number | null = null;
  private offsetCount: number | null = null;
  private singleMode: 'none' | 'single' | 'maybeSingle' = 'none';

  constructor(
    private readonly harness: PgliteSupabaseHarness,
    private readonly clientOpts: { role: HarnessRole; userId: string | null },
    private readonly tableName: string
  ) {}

  select(cols = '*', selectOpts?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean }) {
    if (this.op === 'insert' || this.op === 'update' || this.op === 'upsert' || this.op === 'delete') {
      this.returningSelect = true;
      this.selectStr = cols;
    } else {
      this.op = 'select';
      this.selectStr = cols;
    }
    if (selectOpts?.count) this.countMode = 'exact';
    if (selectOpts?.head) this.headOnly = true;
    return this;
  }

  insert(rows: object | object[]) {
    this.op = 'insert';
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }

  upsert(
    rows: object | object[],
    upsertOpts?: { onConflict?: string; ignoreDuplicates?: boolean }
  ) {
    this.op = 'upsert';
    this.payload = Array.isArray(rows) ? rows : [rows];
    if (upsertOpts?.onConflict) {
      this.upsertConflictCols = upsertOpts.onConflict
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    this.upsertIgnoreDuplicates = Boolean(upsertOpts?.ignoreDuplicates);
    return this;
  }

  update(patch: object) {
    this.op = 'update';
    this.payload = patch;
    return this;
  }

  delete() {
    this.op = 'delete';
    return this;
  }

  eq(col: string, val: unknown) {
    this.filters.push({ type: 'eq', col, val });
    return this;
  }
  neq(col: string, val: unknown) {
    this.filters.push({ type: 'neq', col, val });
    return this;
  }
  gt(col: string, val: unknown) {
    this.filters.push({ type: 'gt', col, val });
    return this;
  }
  gte(col: string, val: unknown) {
    this.filters.push({ type: 'gte', col, val });
    return this;
  }
  lt(col: string, val: unknown) {
    this.filters.push({ type: 'lt', col, val });
    return this;
  }
  lte(col: string, val: unknown) {
    this.filters.push({ type: 'lte', col, val });
    return this;
  }
  like(col: string, val: string) {
    this.filters.push({ type: 'like', col, val });
    return this;
  }
  ilike(col: string, val: string) {
    this.filters.push({ type: 'ilike', col, val });
    return this;
  }
  in(col: string, val: readonly unknown[]) {
    this.filters.push({ type: 'in', col, val });
    return this;
  }
  is(col: string, val: unknown) {
    this.filters.push({ type: 'is', col, val });
    return this;
  }
  not(col: string, op: string, val: unknown) {
    this.filters.push({ type: 'not', col, op, val });
    return this;
  }
  contains(col: string, val: unknown) {
    this.filters.push({ type: 'contains', col, val });
    return this;
  }
  or(expr: string) {
    this.filters.push({ type: 'or', orExpr: expr });
    return this;
  }
  order(col: string, orderOpts?: { ascending?: boolean }) {
    this.orders.push({ col, ascending: orderOpts?.ascending !== false });
    return this;
  }
  limit(n: number) {
    this.limitCount = n;
    return this;
  }
  range(from: number, to: number) {
    this.offsetCount = Math.max(0, from);
    this.limitCount = Math.max(0, to - from + 1);
    return this;
  }
  single(): HarnessQueryBuilder<HarnessRow> {
    this.singleMode = 'single';
    return this as unknown as HarnessQueryBuilder<HarnessRow>;
  }
  maybeSingle(): HarnessQueryBuilder<HarnessRow | null> {
    this.singleMode = 'maybeSingle';
    return this as unknown as HarnessQueryBuilder<HarnessRow | null>;
  }

  private async execute(): Promise<HarnessQueryResult<unknown>> {
    const tableSql = `public.${sanitizeIdentifier(this.tableName)}`;
    const params: unknown[] = [];
    const { role, userId } = this.clientOpts;
    try {
      if (this.op === 'select') {
        const whereSql = compileWhere(this.filters, params);
        let totalCount: number | null = null;
        if (this.countMode === 'exact') {
          const cntRes = await this.harness.execSqlAs<{ cnt: number }>(
            { role, userId },
            `SELECT count(*)::int AS cnt FROM ${tableSql} ${whereSql}`,
            params
          );
          totalCount = cntRes.rows?.[0]?.cnt ?? 0;
          if (this.headOnly) {
            return { data: null, error: null, count: totalCount };
          }
        }

        const { clause } = buildSelectClause(this.selectStr);
        const orderSql =
          this.orders.length > 0
            ? `ORDER BY ${this.orders
                .map((o) => `${toJsonPathSql(o.col).sql} ${o.ascending ? 'ASC' : 'DESC'}`)
                .join(', ')}`
            : '';
        const limitSql =
          this.limitCount !== null ? `LIMIT ${Math.max(0, Math.floor(this.limitCount))}` : '';
        const offsetSql =
          this.offsetCount !== null ? `OFFSET ${Math.max(0, Math.floor(this.offsetCount))}` : '';

        const res = await this.harness.execSqlAs<HarnessRow>(
          { role, userId },
          `SELECT ${clause} FROM ${tableSql} ${whereSql} ${orderSql} ${limitSql} ${offsetSql}`,
          params
        );
        const rows = res.rows || [];
        if (this.singleMode === 'single') {
          if (rows.length !== 1) {
            return {
              data: null,
              error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' },
            };
          }
          return { data: rows[0], error: null, count: totalCount };
        }
        if (this.singleMode === 'maybeSingle') {
          return { data: rows[0] ?? null, error: null, count: totalCount };
        }
        return { data: rows, error: null, count: totalCount };
      }

      if (this.op === 'insert' || this.op === 'upsert') {
        const rawRows = (Array.isArray(this.payload) ? this.payload : [this.payload]).filter(
          (item): item is object => Boolean(item && typeof item === 'object')
        );
        const rowsToWrite = rawRows.map((item) => item as Record<string, unknown>);
        if (rowsToWrite.length === 0) {
          return { data: this.returningSelect ? [] : null, error: null };
        }
        const colSet = new Set<string>();
        for (const row of rowsToWrite) {
          for (const [k, v] of Object.entries(row)) {
            if (v !== undefined) colSet.add(k);
          }
        }
        const cols = Array.from(colSet);
        const colIdents = cols.map(sanitizeIdentifier).join(', ');
        const valueTuples: string[] = [];
        for (const row of rowsToWrite) {
          const tuplePlaceholders: string[] = [];
          for (const col of cols) {
            if (row[col] === undefined) {
              tuplePlaceholders.push('DEFAULT');
            } else {
              const { value, cast } = serializeValueForParam(col, row[col]);
              params.push(value);
              tuplePlaceholders.push(`$${params.length}${cast}`);
            }
          }
          valueTuples.push(`(${tuplePlaceholders.join(', ')})`);
        }

        let conflictSql = '';
        if (this.op === 'upsert') {
          const conflictCols =
            this.upsertConflictCols && this.upsertConflictCols.length > 0
              ? this.upsertConflictCols
              : [DEFAULT_PK_BY_TABLE[this.tableName] || 'id'];
          const conflictIdents = conflictCols.map(sanitizeIdentifier).join(', ');
          if (this.upsertIgnoreDuplicates) {
            conflictSql = `ON CONFLICT (${conflictIdents}) DO NOTHING`;
          } else {
            const updateCols = cols.filter((c) => !conflictCols.includes(c));
            conflictSql =
              updateCols.length > 0
                ? `ON CONFLICT (${conflictIdents}) DO UPDATE SET ${updateCols
                    .map((c) => `${sanitizeIdentifier(c)} = EXCLUDED.${sanitizeIdentifier(c)}`)
                    .join(', ')}`
                : `ON CONFLICT (${conflictIdents}) DO NOTHING`;
          }
        }

        const retClause = this.returningSelect ? buildSelectClause(this.selectStr).clause : '1';
        const sql = `INSERT INTO ${tableSql} (${colIdents}) VALUES ${valueTuples.join(', ')} ${conflictSql} RETURNING ${retClause}`;
        const res = await this.harness.execSqlAs<HarnessRow>({ role, userId }, sql, params);
        const rows = res.rows || [];
        if (!this.returningSelect) {
          return { data: null, error: null };
        }
        if (this.singleMode === 'single') {
          return { data: rows[0] ?? null, error: null };
        }
        if (this.singleMode === 'maybeSingle') {
          return { data: rows[0] ?? null, error: null };
        }
        return { data: rows, error: null };
      }

      if (this.op === 'update') {
        const patchObj =
          this.payload && typeof this.payload === 'object' && !Array.isArray(this.payload)
            ? (this.payload as Record<string, unknown>)
            : {};
        const setClauses: string[] = [];
        for (const [k, v] of Object.entries(patchObj)) {
          if (v === undefined) continue;
          const { value, cast } = serializeValueForParam(k, v);
          params.push(value);
          setClauses.push(`${sanitizeIdentifier(k)} = $${params.length}${cast}`);
        }
        if (setClauses.length === 0) {
          return { data: this.returningSelect ? [] : null, error: null };
        }
        const whereSql = compileWhere(this.filters, params);
        const retClause = this.returningSelect ? `RETURNING ${buildSelectClause(this.selectStr).clause}` : '';
        const res = await this.harness.execSqlAs<HarnessRow>(
          { role, userId },
          `UPDATE ${tableSql} SET ${setClauses.join(', ')} ${whereSql} ${retClause}`,
          params
        );
        const rows = res.rows || [];
        if (!this.returningSelect) return { data: null, error: null };
        if (this.singleMode === 'single' || this.singleMode === 'maybeSingle') {
          return { data: rows[0] ?? null, error: null };
        }
        return { data: rows, error: null };
      }

      if (this.op === 'delete') {
        const whereSql = compileWhere(this.filters, params);
        const retClause = this.returningSelect ? `RETURNING ${buildSelectClause(this.selectStr).clause}` : '';
        const res = await this.harness.execSqlAs<HarnessRow>(
          { role, userId },
          `DELETE FROM ${tableSql} ${whereSql} ${retClause}`,
          params
        );
        return { data: this.returningSelect ? res.rows || [] : null, error: null };
      }

      return { data: null, error: null };
    } catch (err: unknown) {
      return {
        data: null,
        error: extractPgError(err),
      };
    }
  }

  then<TResult1 = HarnessQueryResult<TData>, TResult2 = never>(
    onfulfilled?: ((value: HarnessQueryResult<TData>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return (this.execute() as Promise<HarnessQueryResult<TData>>).then(onfulfilled, onrejected);
  }
}
