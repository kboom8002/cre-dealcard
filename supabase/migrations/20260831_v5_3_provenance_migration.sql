-- E-3: Provenance 'public' → 'registry'/'public_api' 슬롯별 변환
-- 단계 1: 'public'을 'registry'로 일괄 변환 (안전한 기본값)
UPDATE building_ssot_lite
SET supplemental_data = jsonb_set(
  supplemental_data, '{provenance}',
  (SELECT jsonb_object_agg(key,
    CASE value::text
      WHEN '"public"' THEN '"registry"'::jsonb
      ELSE value END
  ) FROM jsonb_each(supplemental_data->'provenance'))
)
WHERE supplemental_data ? 'provenance'
  AND supplemental_data->'provenance' IS NOT NULL;

-- 단계 2: 검증 — 'public' 잔존 0건 확인
DO $$ DECLARE cnt BIGINT; BEGIN
  SELECT count(*) INTO cnt FROM building_ssot_lite,
    jsonb_each_text(supplemental_data->'provenance') jt
  WHERE jt.value = 'public';
  IF cnt > 0 THEN RAISE EXCEPTION 'Still % records with public provenance', cnt; END IF;
END $$;
