-- supabase/migrations/00066_logistics_fields.sql
-- building_ssot_lite에 물류센터/창고 특화 스펙 적재를 위한 JSONB 컬럼 추가

ALTER TABLE public.building_ssot_lite
  ADD COLUMN IF NOT EXISTS logistics_spec JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.building_ssot_lite.logistics_spec IS 
  '물류센터 특화 스펙: ceiling_height_m, dock_count, cold_storage_type 등';
