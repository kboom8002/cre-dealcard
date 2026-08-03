-- 0300_fix_grants_rls.sql
-- 🚨 URGENT: Fix im_pro_grants PII exposure via public read policy
-- The current policy 'Public read grants' allows anonymous users to read
-- requester_name, requester_phone, requester_email.

DROP POLICY IF EXISTS "Public read grants" ON public.im_pro_grants;

-- Only service_role or the requester themselves can read grants
CREATE POLICY "Grant read by service or requester"
  ON public.im_pro_grants
  FOR SELECT
  USING (
    auth.role() = 'service_role'
  );
