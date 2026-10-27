-- ============================================================================
-- 20261027000002_p05_foundations_rollback.sql
-- 목적  : 20261027000002_p05_foundations.sql 마이그레이션 완전 롤백
-- ============================================================================

BEGIN;

-- 5. feature_flags 테이블 롤백
DROP TABLE IF EXISTS public.feature_flags CASCADE;

-- 4. jobs_v2 테이블 롤백
DROP TABLE IF EXISTS public.jobs_v2 CASCADE;

-- 3. im_generation_jobs 컬럼 롤백
DROP INDEX IF EXISTS public.im_generation_jobs_idempotency_idx;

ALTER TABLE public.im_generation_jobs
  DROP COLUMN IF EXISTS idempotency_key,
  DROP COLUMN IF EXISTS attempt,
  DROP COLUMN IF EXISTS max_attempts,
  DROP COLUMN IF EXISTS heartbeat_at,
  DROP COLUMN IF EXISTS started_at,
  DROP COLUMN IF EXISTS deadline_at,
  DROP COLUMN IF EXISTS cancel_requested,
  DROP COLUMN IF EXISTS stage,
  DROP COLUMN IF EXISTS progress,
  DROP COLUMN IF EXISTS error_class,
  DROP COLUMN IF EXISTS cost_usd,
  DROP COLUMN IF EXISTS llm_calls,
  DROP COLUMN IF EXISTS tokens;

-- 2. building_ssot_lite pnu 컬럼 롤백
DROP INDEX IF EXISTS public.building_ssot_lite_owner_pnu_idx;

ALTER TABLE public.building_ssot_lite
  DROP COLUMN IF EXISTS pnu;

-- 1. input_type 제약조건 원복
ALTER TABLE public.building_ssot_lite
  DROP CONSTRAINT IF EXISTS building_ssot_lite_input_type_check;

ALTER TABLE public.building_ssot_lite
  ADD CONSTRAINT building_ssot_lite_input_type_check
  CHECK (input_type IN ('address', 'broker_memo', 'voice_note', 'manual_form'));

COMMIT;
