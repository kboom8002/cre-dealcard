-- ============================================================
-- P1: canonical_properties — 물리 건물 정규 레지스트리
-- 
-- 동일 PNU(필지코드)의 건물을 하나의 정규(canonical) 엔티티로
-- 통합하여 매칭/프로모션/통계를 물리 건물 단위로 집계합니다.
-- ============================================================

-- 1. canonical_properties 테이블
CREATE TABLE IF NOT EXISTS public.canonical_properties (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 식별자 (PNU = 19자리 필지코드, UNIQUE)
  pnu         VARCHAR(19) UNIQUE,
  
  -- 주소 정보
  road_address  TEXT,                  -- 도로명 주소
  jibun_address TEXT,                  -- 지번 주소
  dong_name     TEXT,                  -- 동명 (예: "서초동")
  
  -- 위치 좌표 (WGS84)
  coordinates   JSONB,                 -- { lat: number, lng: number }
  
  -- 행정 코드
  sigungu_cd    VARCHAR(5),            -- 시군구코드 (예: "11650")
  bjdong_cd     VARCHAR(5),            -- 법정동코드 (예: "10800")
  bun           VARCHAR(4),            -- 본번 (예: "1320")
  ji            VARCHAR(4),            -- 부번 (예: "0005")
  
  -- 메타
  verified      BOOLEAN NOT NULL DEFAULT false,  -- 공공데이터 교차검증 완료 여부
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_canonical_properties_pnu 
  ON public.canonical_properties(pnu);
CREATE INDEX IF NOT EXISTS idx_canonical_properties_dong 
  ON public.canonical_properties(dong_name);
CREATE INDEX IF NOT EXISTS idx_canonical_properties_jibun 
  ON public.canonical_properties(jibun_address);

-- updated_at 트리거
CREATE TRIGGER canonical_properties_updated_at
  BEFORE UPDATE ON public.canonical_properties
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 2. building_ssot_lite에 FK 추가
ALTER TABLE public.building_ssot_lite
  ADD COLUMN IF NOT EXISTS canonical_property_id UUID
  REFERENCES public.canonical_properties(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bssl_canonical_property_id
  ON public.building_ssot_lite(canonical_property_id);

-- 3. building_ssot_lite에 raw_address 탑레벨 컬럼 추가 (기존 layers 내부에만 있던 것을 승격)
ALTER TABLE public.building_ssot_lite
  ADD COLUMN IF NOT EXISTS raw_address TEXT;

-- 4. RLS 정책 (canonical_properties)
ALTER TABLE public.canonical_properties ENABLE ROW LEVEL SECURITY;

-- 인증된 사용자 읽기 허용
CREATE POLICY "canonical_properties_select_authenticated"
  ON public.canonical_properties FOR SELECT
  TO authenticated
  USING (true);

-- Service role 전체 허용
CREATE POLICY "canonical_properties_service_all"
  ON public.canonical_properties FOR ALL
  USING (auth.role() = 'service_role');

-- 5. assets 테이블에도 canonical_property_id FK 추가 (v3 온톨로지 연동)
ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS canonical_property_id UUID
  REFERENCES public.canonical_properties(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_assets_canonical_property_id
  ON public.assets(canonical_property_id);
