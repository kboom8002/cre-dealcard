-- 0302_grant_pass_data_migration.sql
-- Migrate existing im_pro_grants data to normalized grant_pass + party tables
-- This runs AFTER 0301 creates the new tables

-- Step 1: Create party records from existing grants (deduplication by phone)
INSERT INTO public.party (tenant_id, owner_broker_id, name, phone_e164, consent_version, consent_at, retention_until)
SELECT 
  COALESCE(d.tenant_id, '00000000-0000-0000-0000-000000000000'::UUID) as tenant_id,
  COALESCE(d.broker_id, '00000000-0000-0000-0000-000000000000'::UUID) as owner_broker_id,
  g.requester_name,
  g.requester_phone,
  'v1-migrated',
  COALESCE(g.nda_signed_at, g.created_at),
  (COALESCE(g.nda_signed_at, g.created_at) + INTERVAL '24 months')::DATE
FROM public.im_pro_grants g
LEFT JOIN public.deals d ON d.id = g.deal_id
WHERE g.status IN ('granted', 'active')
ON CONFLICT (tenant_id, phone_e164) DO NOTHING;

-- Step 2: Create grant_pass records linked to parties
-- Note: token is generated as a random 28-char string using pg functions
INSERT INTO public.grant_pass (token, tenant_id, deal_id, party_id, issued_by, nda_signed_at, watermark_ref, expires_at)
SELECT
  encode(gen_random_bytes(21), 'base64') as token,
  COALESCE(d.tenant_id, '00000000-0000-0000-0000-000000000000'::UUID),
  g.deal_id,
  p.id,
  COALESCE(d.broker_id, '00000000-0000-0000-0000-000000000000'::UUID),
  COALESCE(g.nda_signed_at, g.created_at),
  COALESCE(g.watermark_seed, 'WM-' || LEFT(g.id::TEXT, 8)),
  COALESCE(g.expires_at, g.created_at + INTERVAL '7 days')
FROM public.im_pro_grants g
LEFT JOIN public.deals d ON d.id = g.deal_id
JOIN public.party p ON p.phone_e164 = g.requester_phone
  AND p.tenant_id = COALESCE(d.tenant_id, '00000000-0000-0000-0000-000000000000'::UUID)
WHERE g.status IN ('granted', 'active');

-- Note: im_pro_grants table is kept for backward compatibility
-- New code should use grant_pass exclusively
