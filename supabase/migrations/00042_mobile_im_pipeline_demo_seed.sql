-- ============================================================
-- Migration 00042: Mobile IM Pipeline Demo Seed
-- 홍길동 데모(테헤란로 오피스)를 기반으로
-- Phase 0~1 신규 파이프라인이 생성하는 구조와 동일한
-- Mobile IM 도큐먼트를 document_objects에 시딩합니다.
--
-- 사용 빌딩: f1111111-1111-1111-1111-111111111111 (홍길동)
-- 생성 파이프라인:
--   1. building_ssot_lite  → SSoT 원천 데이터
--   2. external_data_cache → 공공데이터 스냅샷 (Mock 수준)
--   3. document_objects    → 7섹션 Mobile IM 최종 산출물
-- ============================================================

-- ─── Step 1: building_ssot_lite 시딩 ─────────────────────────────────────────
-- 홍길동 브로커가 투자 메모를 입력하면 파이프라인이 자동 생성하는 SSoT Lite 레코드.
-- raw_input: 브로커 메모 텍스트 (parse-memo API가 파싱)
-- layers: BSSoT 계층별 AI 추출 결과

INSERT INTO building_ssot_lite (
  id,
  owner_id,
  created_by_role,
  input_type,
  raw_input,
  area_signal,
  asset_type,
  price_band,
  size_signal,
  current_use_signal,
  vacancy_signal,
  fit_summary,
  caution_summary,
  hidden_fields,
  layers,
  confidence,
  disclosure,
  status,
  raw_address
) VALUES (
  -- 데모 빌딩 ID에 대응하는 SSoT Lite ID
  'b1111111-1111-1111-1111-111111111111',

  -- 홍길동 브로커 (owner_id)
  'e1a12345-1234-1234-1234-123456789abc',

  'broker',
  'broker_memo',

  -- 브로커 원문 메모 (parse-memo API 입력값)
  '강남구 테헤란로 427 소재 A급 오피스 빌딩 매각. 연면적 약 8,500㎡, 지하 3층/지상 15층.
2007년 준공 철골철근콘크리트 구조. 현재 완전임대 상태로 월 임대료 약 1.1억원 수준.
주요 임차인은 상장 IT기업, 외국계 금융사, 대형 법무법인 3개사 포함 총 6개사.
WALT 2.8년. 매각 희망가 450억원. 승강기 5대, 전용주차 120대.
GBD 핵심 입지, 강남역 5분 거리. 밸류업 여지 있음 (임대료 시장 대비 소폭 할인 추정).',

  -- AI 추출 SSoT 필드
  '강남구 GBD (테헤란로)',
  '오피스 빌딩',
  '450억원',
  '연면적 8,500㎡ (2,571평), 지하3층/지상15층',
  '완전임대 (Multi-tenant 오피스)',
  '완전임대 (0% 공실)',

  -- buyer_fit 분석
  '강남 GBD A급 오피스. 완전임대 안정 수익형으로 임대형 펀드·사옥 매입 법인에 최적. WALT 2.8년 단기 리스크 존재하나 임대료 인상 여지로 밸류업 가능.',

  -- caution
  '준공 18년 경과로 설비 노후화 확인 필요. 외국계 임차인 1.8년 만기 리스크.',

  -- 보호 필드 (공개 제한)
  ARRAY['tenant_name', 'exact_address', 'unit_rent', 'seller_motivation'],

  -- layers: BSSoT 7계층 구조 (AI 파이프라인 출력과 동일 구조)
  jsonb_build_object(
    'asset_identity', jsonb_build_object(
      'asset_type', '오피스 빌딩',
      'area_signal', '강남구 GBD (테헤란로)',
      'price_band', '450억원',
      'price_band_krw', 45000000000,
      'area_tier', 'GBD_A급',
      'asset_grade', 'A'
    ),
    'physical_fact', jsonb_build_object(
      'size_signal', '연면적 8,500㎡ (2,571평)',
      'total_area_sqm', 8500,
      'floors_above', 15,
      'floors_below', 3,
      'structure', '철골철근콘크리트조',
      'completion_year', 2007,
      'parking_count', 120,
      'elevator_count', 5,
      'vacancy_signal', '완전임대 (0%)',
      'vacancy_pct', 0
    ),
    'market_location', jsonb_build_object(
      'location_analysis', 'GBD 핵심 업무지구. 강남역 도보 5분(350m). 테헤란로 직접 접면.',
      'subway_access', '강남역 2호선 350m/도보5분, 신논현역 9호선 500m/도보7분',
      'gbd_position', '테헤란로 직접 접면 A급 입지',
      'vacancy_market', '3.2% (서울 평균 7.1% 대비 현저히 낮음)'
    ),
    'buyer_fit', jsonb_build_object(
      'fit_summary', '임대형 펀드·자산운용사 최적. 사옥 매입 법인 차선.',
      'buyer_types', ARRAY['자산운용사(임대형펀드)', '법인사옥매입', '고액자산가그룹'],
      'investment_thesis', 'GBD A급 완전임대 수익형. 밸류업(임대료정상화) 포텐셜 존재.'
    ),
    'income_signal', jsonb_build_object(
      'monthly_rent_krw', 110000000,
      'annual_gross_krw', 1320000000,
      'noi_base_krw', 1140000000,
      'noi_best_krw', 1400000000,
      'noi_worst_krw', 950000000,
      'cap_rate_base_pct', 2.53,
      'cap_rate_best_pct', 3.11,
      'irr_5y_base_pct', 8.4,
      'gross_yield_pct', 2.93,
      'price_per_sqm_krw', 5294118,
      'price_per_pyeong_krw', 17500000
    ),
    'risk_signals', jsonb_build_object(
      'building_age_years', 18,
      'walt_years', 2.8,
      'risk_flags', ARRAY['설비노후화', '외국계임차인만기1.8년'],
      'legal_risk', 'low',
      'physical_risk', 'medium'
    )
  ),

  -- confidence: 각 필드의 신뢰도
  jsonb_build_object(
    'asset_type', 'confirmed',
    'price_band', 'confirmed',
    'monthly_rent', 'inferred',
    'vacancy_signal', 'confirmed',
    'building_age', 'confirmed'
  ),

  -- disclosure: 공개/비공개 마스킹 설정
  jsonb_build_object(
    'tenant_name', 'redacted',
    'exact_address', 'redacted',
    'unit_rent', 'redacted',
    'seller_motivation', 'redacted'
  ),

  'snapshot_draft_ready',

  -- raw_address: 공공데이터 API 호출용
  '서울특별시 강남구 테헤란로 427'
)
ON CONFLICT (id) DO UPDATE
SET
  layers            = EXCLUDED.layers,
  status            = EXCLUDED.status,
  vacancy_signal    = EXCLUDED.vacancy_signal,
  updated_at        = NOW();

-- ─── Step 2: external_data_cache 시딩 ────────────────────────────────────────
-- 공공데이터 API 호출 결과 캐시 (실 API 키 없을 때의 Mock 수준 품질).
-- 실 API 연동 시 이 레코드가 실측값으로 갱신됩니다.

INSERT INTO external_data_cache (
  building_ssot_lite_id,
  pnu,
  legal_dong_code,
  road_address,
  jibun_address,
  latitude,
  longitude,
  building_register,
  building_register_fetched_at,
  official_land_price,
  land_price_fetched_at,
  land_use_plan,
  land_use_fetched_at,
  comparable_transactions,
  transactions_fetched_at,
  location_poi,
  location_fetched_at
) VALUES (
  'b1111111-1111-1111-1111-111111111111',

  -- PNU (19자리 필지고유번호 — 강남구 테헤란로 427 기준 추정)
  '1168010100103490000',

  -- 법정동코드
  '1168010100',

  -- 주소
  '서울특별시 강남구 테헤란로 427',
  '서울특별시 강남구 역삼동 823-21',

  -- 좌표 (역삼역 인근 테헤란로 기준)
  37.5010,
  127.0360,

  -- 건축물대장 (국토교통부 건축물대장정보 서비스 응답 구조)
  jsonb_build_object(
    'buildingName', '테헤란로 오피스 빌딩',
    'platArea', 1820.50,
    'archArea', 1092.30,
    'totArea', 8493.60,
    'bcRat', 59.99,
    'vlRat', 466.68,
    'mainPurposeCdNm', '업무시설',
    'etcPurpose', '근린생활시설(일부)',
    'strctCdNm', '철골철근콘크리트구조',
    'useAprDay', '20070612',
    'grndFlrCnt', 15,
    'ugrndFlrCnt', 3,
    'heit', 62.50,
    'useAprDay', '20070612',
    'mainBldg', 'Y',
    'totalArea', 8493.60,
    'platArea', 1820.50,
    'floorsAbove', 15,
    'floorsBelow', 3,
    'bcRat', 59.99,
    'vlRat', 466.68,
    'useAprDay', '20070612',
    'structure', '철골철근콘크리트구조',
    'mainPurpose', '업무시설',
    'buildingName', '테헤란로 오피스 빌딩'
  ),
  NOW() - INTERVAL '2 hours',

  -- 개별공시지가 (국토교통부 개별공시지가정보 서비스)
  jsonb_build_object(
    'pnu', '1168010100103490000',
    'pricePerSqm', 8350000,
    'baseYear', '2025',
    'baseMonth', '01',
    'priceTrend', jsonb_build_array(
      jsonb_build_object('year', '2022', 'pricePerSqm', 6820000),
      jsonb_build_object('year', '2023', 'pricePerSqm', 7340000),
      jsonb_build_object('year', '2024', 'pricePerSqm', 7980000),
      jsonb_build_object('year', '2025', 'pricePerSqm', 8350000)
    )
  ),
  NOW() - INTERVAL '2 hours',

  -- 토지이용계획 (LURIS 토지이용계획정보 서비스)
  jsonb_build_object(
    'pnu', '1168010100103490000',
    'zoningDistrict', '일반상업지역',
    'zoningOverlap', jsonb_build_array('방화지구', '도심지역'),
    'buildingCoverageMax', 60,
    'floorAreaRatioMax', 800,
    'currentBuildingCoverage', 59.99,
    'currentFloorAreaRatio', 466.68,
    'vlRemainder', 333.32
  ),
  NOW() - INTERVAL '2 hours',

  -- 실거래가 비교 사례 (국토교통부 상업용 부동산 실거래가 — 강남구 시군구 기준)
  jsonb_build_array(
    jsonb_build_object(
      'address', '서울 강남구 역삼동 (GBD 오피스)',
      'dealYear', 2024, 'dealMonth', 11,
      'area', 9120, 'totalPriceKrw', 48500000000,
      'pricePerPyeong', 17587000
    ),
    jsonb_build_object(
      'address', '서울 강남구 테헤란로 일대 (GBD)',
      'dealYear', 2024, 'dealMonth', 8,
      'area', 7830, 'totalPriceKrw', 39800000000,
      'pricePerPyeong', 16826000
    ),
    jsonb_build_object(
      'address', '서울 강남구 역삼동 (GBD 인근)',
      'dealYear', 2024, 'dealMonth', 5,
      'area', 6450, 'totalPriceKrw', 32700000000,
      'pricePerPyeong', 16739000
    ),
    jsonb_build_object(
      'address', '서울 강남구 논현동 (GBD 인접)',
      'dealYear', 2023, 'dealMonth', 12,
      'area', 11200, 'totalPriceKrw', 53900000000,
      'pricePerPyeong', 15917000
    )
  ),
  NOW() - INTERVAL '2 hours',

  -- 카카오 로컬 POI (kakao-map-api.ts 응답 구조)
  jsonb_build_object(
    'nearestStation', jsonb_build_object(
      'name', '강남역',
      'line', '2호선/신분당선',
      'distanceM', 350,
      'walkMinutes', 5
    ),
    'secondStation', jsonb_build_object(
      'name', '신논현역',
      'line', '9호선',
      'distanceM', 500,
      'walkMinutes', 7
    ),
    'poiCounts', jsonb_build_object(
      'subway', 2,
      'busStop', 8,
      'cafe', 47,
      'restaurant', 112,
      'parking', 6,
      'convenience', 9,
      'hotel5star', 2,
      'department', 1
    ),
    'fetchedAt', NOW() - INTERVAL '2 hours'
  ),
  NOW() - INTERVAL '2 hours'
)
ON CONFLICT (building_ssot_lite_id)
DO UPDATE SET
  building_register            = EXCLUDED.building_register,
  official_land_price          = EXCLUDED.official_land_price,
  land_use_plan                = EXCLUDED.land_use_plan,
  comparable_transactions      = EXCLUDED.comparable_transactions,
  location_poi                 = EXCLUDED.location_poi,
  updated_at                   = NOW();

-- ─── Step 3: document_objects — Mobile IM 최종 산출물 ─────────────────────────
-- Phase 0 파이프라인(writer.ts)이 생성하는 7섹션 content 구조와 동일.
-- body JSONB에 전체 섹션 콘텐츠, 재무 지표, 소스 프로비넌스를 포함.

-- document_type 체크 제약 완화 (mobile_im 추가)
ALTER TABLE document_objects
  DROP CONSTRAINT IF EXISTS document_objects_document_type_check;

ALTER TABLE document_objects
  ADD CONSTRAINT document_objects_document_type_check
  CHECK (document_type IN (
    'deal_curiosity_report',
    'blind_teaser',
    'buyer_fit_memo',
    'owner_prep_memo',
    'missing_data_checklist',
    'gate_request_note',
    'snapshot',
    'mobile_im'
  ));

-- status 체크 제약 완화 (pending_approval, published, revision_needed 추가)
ALTER TABLE document_objects
  DROP CONSTRAINT IF EXISTS document_objects_status_check;

ALTER TABLE document_objects
  ADD CONSTRAINT document_objects_status_check
  CHECK (status IN (
    'draft',
    'generating',
    'generated',
    'pending_approval',
    'published',
    'revision_needed',
    'disclosure_checked',
    'broker_reviewed',
    'approved_internal',
    'shared_external',
    'archived'
  ));

-- broker_id 컬럼 추가 (없는 경우)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'document_objects' AND column_name = 'broker_id'
  ) THEN
    ALTER TABLE document_objects ADD COLUMN broker_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- slug 컬럼 추가 (없는 경우)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'document_objects' AND column_name = 'slug'
  ) THEN
    ALTER TABLE document_objects ADD COLUMN slug TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS document_objects_slug_idx ON document_objects(slug) WHERE slug IS NOT NULL;
  END IF;
END $$;

-- content 컬럼 추가 (없는 경우 — body 대신 사용)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'document_objects' AND column_name = 'content'
  ) THEN
    ALTER TABLE document_objects ADD COLUMN content JSONB DEFAULT '{}';
  END IF;
END $$;

-- Mobile IM 도큐먼트 삽입
INSERT INTO document_objects (
  id,
  owner_id,
  broker_id,
  source_type,
  source_id,
  building_id,
  document_type,
  visibility,
  status,
  slug,
  title,
  model_version,
  prompt_version,
  body,
  content
) VALUES (
  -- Mobile IM 도큐먼트 ID
  'd1111111-1111-1111-1111-111111111111',

  -- 홍길동 브로커
  'e1a12345-1234-1234-1234-123456789abc',
  'e1a12345-1234-1234-1234-123456789abc',

  'building_ssot_lite',
  'b1111111-1111-1111-1111-111111111111',

  -- 빌딩 SSoT Lite ID (building_ssot_lite.id)
  'b1111111-1111-1111-1111-111111111111',

  'mobile_im',
  'public_blind',
  'published',

  -- 공개 slug (im-lite 페이지 URL: /im-lite/demo-gbd-office-hongildong)
  'demo-gbd-office-hongildong',

  -- 제목
  '강남구 GBD A급 오피스 빌딩 — Mobile IM',

  -- AI 모델 버전
  'gpt-4o-2024-11-20',
  'mobile-im-v1.2-phase0',

  -- body: 레거시 호환용 요약 데이터
  jsonb_build_object(
    'building_id', 'f1111111-1111-1111-1111-111111111111',
    'blind_name', '강남구 GBD *** 오피스 빌딩',
    'area_signal', '강남구 GBD (테헤란로)',
    'asset_type', '오피스 빌딩',
    'price_band', '450억원',
    'completeness_score', 92,
    'ai_used', true,
    'readiness_score', 92
  ),

  -- content: Phase 0 파이프라인 출력과 동일한 전체 구조
  jsonb_build_object(
    'building_ssot_lite_id', 'b1111111-1111-1111-1111-111111111111',
    'generated_at', NOW()::text,
    'ai_used', true,
    'model', 'gpt-4o-2024-11-20',
    'boundary_note', '본 모바일 IM은 AI가 공공데이터와 브로커 제공 정보를 기반으로 자동 생성한 예비 검토용 자료입니다. 투자 권유 또는 수익 보장이 아니며, 모든 수치는 추정값으로 실사 및 전문가 검토가 필요합니다.',
    'readiness', jsonb_build_object('score', 92, 'missing', jsonb_build_array()),
    'financial_summary', jsonb_build_object(
      'monthly_rent_krw', 110000000,
      'purchase_price_krw', 45000000000,
      'noi_base', 1140000000,
      'noi_best', 1400000000,
      'noi_worst', 950000000,
      'cap_rate_base', 2.53,
      'cap_rate_best', 3.11,
      'irr_5y_base', 8.4,
      'gross_yield', 2.93,
      'price_per_pyeong', 17500000,
      'land_value_ratio', 33.8,
      'disclaimer', 'AI 추정값 (참고용). 실제 수익은 임대차 조건·공실률·세금에 따라 상이합니다.'
    ),
    'external_data_snapshot', jsonb_build_object(
      'building_register', jsonb_build_object(
        'totalArea', 8493.60, 'platArea', 1820.50,
        'floorsAbove', 15, 'floorsBelow', 3,
        'structure', '철골철근콘크리트구조',
        'mainPurpose', '업무시설',
        'useAprDay', '20070612',
        'bcRat', 59.99, 'vlRat', 466.68
      ),
      'land_price', jsonb_build_object(
        'pricePerSqm', 8350000, 'baseYear', '2025'
      ),
      'land_use_plan', jsonb_build_object(
        'zoningDistrict', '일반상업지역',
        'buildingCoverageMax', 60,
        'floorAreaRatioMax', 800
      ),
      'location_poi', jsonb_build_object(
        'nearestStation', jsonb_build_object(
          'name', '강남역', 'distanceM', 350, 'walkMinutes', 5
        ),
        'poiCounts', jsonb_build_object(
          'subway', 2, 'cafe', 47, 'restaurant', 112,
          'parking', 6, 'convenience', 9
        )
      ),
      'comparable_transactions', jsonb_build_array(
        jsonb_build_object('pricePerPyeong', 17587000, 'dealYear', 2024, 'dealMonth', 11, 'area', 9120),
        jsonb_build_object('pricePerPyeong', 16826000, 'dealYear', 2024, 'dealMonth', 8,  'area', 7830),
        jsonb_build_object('pricePerPyeong', 16739000, 'dealYear', 2024, 'dealMonth', 5,  'area', 6450),
        jsonb_build_object('pricePerPyeong', 15917000, 'dealYear', 2023, 'dealMonth', 12, 'area', 11200)
      ),
      'enriched_at', (NOW() - INTERVAL '2 hours')::text
    ),
    'sections', jsonb_build_array(

      -- §1 자산 개요 (공공데이터 건축물대장 실수치 반영)
      jsonb_build_object(
        'section_type', 'property_overview',
        'section_order', 1,
        'title', '🏢 자산 개요 및 제원',
        'confidence', 'confirmed',
        'boundary_note', '건축물대장(국토교통부) 공공데이터 기반 확인 수치입니다.',
        'provenance', jsonb_build_array(
          jsonb_build_object('fieldKey', 'totalArea', 'value', '8,493.6㎡', 'source', 'public_data', 'sourceDetail', '건축물대장(국토교통부)', 'confidence', 'confirmed'),
          jsonb_build_object('fieldKey', 'price_band', 'value', '450억원', 'source', 'broker_input', 'sourceDetail', '브로커 제공', 'confidence', 'confirmed')
        ),
        'markdown', U&'**\AC15\B0A8\AD6C \D14C\D5E4\B780\B85C** \C18C\C7AC A\AE09 \D504\B77C\C784 \C624\D53C\C2A4 \BE4C\B529\C785\B2C8\B2E4. \AC74\CD95\BB3C\B300\C7A5(\AD6D\D1A0\BD80) \D655\C778 \C218\CE58\B97C \BC18\C601\D558\C600\C2B5\B2C8\B2E4.

| \D56D\BAA9 | \B0B4\C6A9 |
|------|------|
| **\C18C\C7AC\C9C0** | \C11C\C6B8\D2B9\BCC4\C2DC \AC15\B0A8\AD6C \D14C\D5E4\B780\B85C 427 (GBD) |
| **\C6A9\B3C4** | \C5C5\BB34\C2DC\C124 (\C624\D53C\C2A4) |
| **\C5F0\BA74\C801** | **8,493.6\33A1** (2,571\D3C9) — \AC74\CD95\BB3C\B300\C7A5 \D655\C778 |
| **\B300\C9C0\BA74\C801** | 1,820.5\33A1 (550\D3C9) |
| **\CE35\C218** | \C9C0\D558 3\CE35 / \C9C0\C0C1 15\CE35 |
| **\C900\ACF5\C5F0\B3C4** | 2007\B144 (18\B144 \ACBDnote\AC00) |
| **\AD6C\C870** | \CAE0\ACE8\CAE0\B8B0\B294\CF58\D06C\B9AC\D2B8\C870 |
| **\AC74\D3D0\C728** | 60.0% / \BC95\C815 \C0C1\D55C 60% |
| **\C6A9\C801\C728** | 466.7% / \BC95\C815 \C0C1\D55C 800% (\C5EC\C720 333%\B294 \B3C4\C2DC\AC1C\D68D \BC94\C704 \B0B4 \C99D\CD95 \AC00\B2A5) |
| **\C8FC\CC28** | \C804\C6A9\C8FC\CC28 120\B300 (\BC95\C815\AE30\C900 \CD94\AC00 \D655\BCF4) |
| **\C2B9\AC15\AE30** | \C2B9\AC1D\C6A9 4\B300, \D654\BB3C\C6A9 1\B300 |
| **\B9E4\AC01\AC00** | \C57D **450\C5B5 \C6D0** (VAT \BCC4\B3C4) |

> \BCF8 \B9E4\BB3C\C740 \AC15\B0A8 \BE44\C988\B2C8\C2A4 \C9C0\AD6C(GBD) \D575\C2EC \C785\C9C0\C758 \C644\C804\C784\B300 \C0C1\D0DC \C548\C815\C801 \C218\C775\D615 \C790\C0B0\C785\B2C8\B2E4.'
      ),

      -- §2 입지 및 교통 (카카오 POI + 실거래 비교 데이터 반영)
      jsonb_build_object(
        'section_type', 'location_access',
        'section_order', 2,
        'title', '📍 입지 및 대중교통 분석',
        'confidence', 'confirmed',
        'boundary_note', '카카오 로컬 API 및 공공데이터 기반입니다.',
        'provenance', jsonb_build_array(
          jsonb_build_object('fieldKey', 'nearestStation', 'value', '강남역 350m/도보5분', 'source', 'public_data', 'sourceDetail', '카카오 로컬 API', 'confidence', 'confirmed')
        ),
        'markdown', U&'**\AC15\B0A8 \BE44\C988\B2C8\C2A4 \C9C0\AD6C(GBD)** \D589\C2EC \C785\C9C0\B85C, \C11C\C6B8 3\B300 \C5C5\BB34\AD8C\C5ED \C911 \C784\B300 \C218\C694\AC00 \AC00\C7A5 \D65C\BC1C\D55C \C9C0\C5ED\C785\B2C8\B2E4.

### \AD50\D1B5 \C811\ADE0\C131
- 🚇 **\AC15\B0A8\C5ED (2\D638\C120 / \C2E0\BD84\B2F9\C120)** \B3C4\BCF4 **5\BD84** (\C57D 350m) — \CE74\CE74\C624 \B85C\CEE8 API \C2E4\CE21
- 🚇 **\C2E0\B17C\D604\C5ED (9\D638\C120)** \B3C4\BCF4 7\BD84 (\C57D 500m)
- 강남대로·테헤란로 **간선도로 직접 접면**, 주요 IC 15분 이내

### 주변 인프라 (반경 500m, 카카오 POI)
- ☕ 카페 **47개소** / 🍽️ 식당 **112개소** — 임직원 편의 탁월
- 🅿️ 공영주차장 **6개소** / 편의점 **9개소**
- 5성급 호텔 2개, 대형 상업시설 집중

### GBD 시장 현황
- 강남구 프라임 오피스 공실률: **3.2%** (서울 평균 7.1% 대비 현저히 낮음)
- 테헤란로 실질임대료: **3.2만원/3.3㎡/월** (전년比 +4.1%)
- 2027년까지 신규 공급 제한적 → 수급 긴장 지속'
      ),

      -- §3 임대차 현황 (브로커 입력 + NDA 보호)
      jsonb_build_object(
        'section_type', 'lease_status',
        'section_order', 3,
        'title', '📊 임대차 현황 및 공실 상태',
        'confidence', 'confirmed',
        'boundary_note', '임대차 현황은 브로커 제공 자료 기준이며, 임차인명·호실별 임대료는 NDA 체결 후 공개됩니다.',
        'provenance', jsonb_build_array(
          jsonb_build_object('fieldKey', 'vacancy_status', 'value', '완전임대 (0%)', 'source', 'broker_input', 'sourceDetail', '브로커 직접 확인', 'confidence', 'confirmed'),
          jsonb_build_object('fieldKey', 'monthly_rent', 'value', '1.1억원/월', 'source', 'broker_input', 'sourceDetail', '브로커 제공 추정', 'confidence', 'inferred')
        ),
        'markdown', U&'\D604\C7AC **\C644\C804\C784\B300(Full Occupancy)** \C0C1\D0DC\C785\B2C8\B2E4.

### 임대 구성 요약
| 항목 | 내용 |
|------|------|
| **공실률** | **0%** (완전임대) |
| **임차인 수** | 6개사 (기업 임차인) |
| **임대 유형** | 전층 분할임대 |
| **월 임대료 합계** | 약 1.1억 원/월 (추정, 실사 확인 필요) |
| **평균 임대기간** | 4.2년 |
| **WALT (잔여 가중평균임대기간)** | **2.8년** |

### 임차인 구성 (블라인드 처리)
- 2F–5F: 국내 상장 IT 기업 (잔여 3.2년)
- 6F–9F: **외국계 금융사** (잔여 1.8년 — 재계약 리스크 모니터링 필요)
- 10F–13F: 국내 대형 법무법인 (잔여 4.1년)
- 3F, 14F: 소규모 기업 임차인

> ⚠️ 임차인명 및 호실별 임대료는 공개 제한 사항으로 **NDA 체결 후** 공개됩니다.'
      ),

      -- §4 수익 분석 (financials.ts 고급 계산기 결과 반영)
      jsonb_build_object(
        'section_type', 'income_analysis',
        'section_order', 4,
        'title', '💸 수익률 및 공시지가 분석',
        'confidence', 'inferred',
        'boundary_note', 'AI 추정값. 실제 수익은 임대차 계약 확인 후 전문가 검토가 필요합니다.',
        'provenance', jsonb_build_array(
          jsonb_build_object('fieldKey', 'land_price', 'value', '835만원/㎡', 'source', 'public_data', 'sourceDetail', '국토부 개별공시지가(2025)', 'confidence', 'confirmed'),
          jsonb_build_object('fieldKey', 'noi', 'value', '11.4억~14.0억/년', 'source', 'ai_inferred', 'sourceDetail', 'financials.ts NOI 계산기', 'confidence', 'inferred'),
          jsonb_build_object('fieldKey', 'irr', 'value', '8.4%', 'source', 'ai_inferred', 'sourceDetail', 'Newton-Raphson 5년 IRR', 'confidence', 'inferred')
        ),
        'markdown', U&'\C544\B798 \C218\CE58\B294 **AI \CD94\C815\AC12**\C73C\B85C \CC38\ACE0\C6A9\C774\BA70, \D22C\C790 \ACB0\C815\C758 \ADFC\AC70\B85C \C0AC\C6A9\D560 \C218 \C5C6\C2B5\B2C8\B2E4.

### 수익 지표 (financials.ts 고급 계산기)
| 항목 | 추정값 | 비고 |
|------|--------|------|
| **연 순영업소득(NOI)** | 약 9.5억~**14.0억 원**/년 | 80% 신뢰구간 추정 |
| **Cap Rate** | **2.5%–3.1%** | 매각가 450억 기준 |
| **IRR (5년 보유)** | **7.8%–11.4%** | Newton-Raphson 시나리오 추정, 참고용 |
| **총 수익률(Gross Yield)** | **2.93%** | 연 임대수입/매각가 |
| **평당 매매가** | **17,500,000원/평** | 참고용 |
| **대지 지분 가치 비중** | **33.8%** | 하방 경직성 지표 |
| **공시지가 (2025)** | ㎡당 8,350,000원 (평당 27,598,000원) | 국토부 개별공시지가 확인 |

### 주변 실거래 비교 (강남구, 2023~2024)
| 거래 사례 | 거래 시기 | 면적 | 평당가 |
|----------|---------|------|------|
| GBD 오피스 ① | 2024년 11월 | 9,120㎡ | 약 17,587,000원 |
| GBD 오피스 ② | 2024년 8월 | 7,830㎡ | 약 16,826,000원 |
| GBD 인근 ③ | 2024년 5월 | 6,450㎡ | 약 16,739,000원 |
| GBD 인접 ④ | 2023년 12월 | 11,200㎡ | 약 15,917,000원 |

> 비교 사례 평균 평당가: **약 16,767,000원** → 본 물건 호가(17,500,000원/평)은 시장 상위권 수준

> ⚠️ **면책 조항**: 상기 수익 추정치는 AI가 공공 데이터를 기반으로 산출한 참고값입니다. 실제 수익은 임대차 조건, 공실률 변동, 세금 구조에 따라 현저히 다를 수 있으며, 본 자료는 투자 권유 또는 수익 보장이 아닙니다.'
      ),

      -- §5 리스크 진단 (건축물대장 + 토지이용계획 데이터 반영)
      jsonb_build_object(
        'section_type', 'risk_check',
        'section_order', 5,
        'title', '⚖️ 공법 규제 및 리스크 진단',
        'confidence', 'inferred',
        'boundary_note', '공법 규제 세부 내용은 관할 관청 및 전문가 확인이 필요합니다.',
        'provenance', jsonb_build_array(
          jsonb_build_object('fieldKey', 'zoning', 'value', '일반상업지역', 'source', 'public_data', 'sourceDetail', 'LURIS 토지이용계획', 'confidence', 'confirmed'),
          jsonb_build_object('fieldKey', 'vlRat', 'value', '466.7% / 상한 800%', 'source', 'public_data', 'sourceDetail', '건축물대장', 'confidence', 'confirmed')
        ),
        'markdown', U&'\C544\B798 \C0AC\D56D\C740 **\C2E4\C0AC(DD) \ACFC\C815\C5D0\C11C \BC18\B4DC\C2DC \D655\C778**\C774 \D544\C694\D55C \D56D\BAA9\C785\B2C8\B2E4.

### 건물·물리적 확인
- 🔶 **준공 18년 경과**: 외벽 커튼월 유리·공조(HVAC) 시스템 교체 시점 확인 필요 (비용 추정 필수)
- 🔶 **에너지 효율 등급**: 친환경 인증(LEED·G-SEED) 부재 — ESG 중심 기관투자자 관심 시 리스크
- 🔵 **석면 조사 보고서**: 2007년 준공 → 석면 함유 자재 여부 확인 권장

### 공법·용도 사항 (토지이용계획 확인)
- 🔵 **용도지역**: 일반상업지역 / 중복지구: 방화지구, 도심지역
- 🔵 **건폐율**: 현재 60.0% / 법정 상한 60% → **여유 없음, 증축 시 주의**
- 🟢 **용적률**: 현재 466.7% / 법정 상한 800% → **여유 333%p** (리모델링·증축 법적 여지)

### 임대차·권리 관계
- 🔶 **WALT 2.8년**: 단기 집중 만기 가능성 → 임차인별 갱신 의향 사전 파악 필수
- 🔶 **외국계 임차인 (6F–9F, 잔여 1.8년)**: 철수·이전 가능성 사전 확인 권장
- 🔵 **임대료 증액 조항**: 임대차계약서상 CPI 연동 여부 및 증액 한도 확인
- 🔵 **등기 현황**: ⚠️ 자동 조회 미연동 — 등기부등본 최신본 수동 확인 필수

> 🔶 우선 확인 | 🔵 일반 확인 | 공법 규제 세부는 관할 관청(강남구청) 및 법무사 확인 권장'
      ),

      -- §6 핵심 투자 포인트 (buyer_fit + 실거래 비교 사례 반영)
      jsonb_build_object(
        'section_type', 'investment_thesis',
        'section_order', 6,
        'title', '🎯 핵심 투자 메리트',
        'confidence', 'inferred',
        'boundary_note', '투자 판단은 전문가 자문 후 결정하시기 바랍니다.',
        'provenance', jsonb_build_array(
          jsonb_build_object('fieldKey', 'buyer_fit', 'value', '자산운용사 최적합', 'source', 'ai_inferred', 'sourceDetail', 'BSSoT buyer_fit 분석', 'confidence', 'inferred'),
          jsonb_build_object('fieldKey', 'comparables', 'value', '비교 사례 4건', 'source', 'public_data', 'sourceDetail', '국토부 실거래가', 'confidence', 'confirmed')
        ),
        'markdown', U&'\BCF8 \C790\C0B0\C758 **\D575\C2EC \D22C\C790 \AC00\CE58**\C640 \C608\C0C1 \B9E4\C218\C790 \C720\D615 \BD84\C11D\C785\B2C8\B2E4.

### 이 건물을 사야 하는 이유

**① GBD A급 완전임대 — 즉시 수익 발생**
강남역 5분, 테헤란로 직접 접면 A급 오피스 중 완전임대 상태로 매각되는 물건은 연간 거래 물량이 극히 제한적입니다. 취득 즉시 월 **1.1억 원 이상**의 임대 현금흐름이 발생합니다.

**② 공시지가 상승 추세 + 대지가치 하방 지지**
개별공시지가가 2022년 ㎡당 682만원 → 2025년 835만원으로 **3년간 22.4% 상승**. 대지 가치가 매매가의 **33.8%**를 지지하여 하방 경직성을 확보합니다.

**③ 용적률 여유 333%p → 밸류업 포텐셜**
현 용적률 466.7% 대비 법정 상한 800%까지 **333%p 여유**. 중장기적으로 리모델링·수직 증축 등 밸류업 시나리오 설계 가능합니다.

인근 실거래 사례 **4건** 기준 평균 평당가는 **약 16,767,000원**으로, 본 물건 호가와 비교 시 프리미엄 수준임을 확인할 수 있습니다.

> **전문가 한줄 의견**: "GBD 완전임대 A급 오피스는 공급이 워낙 희소해 매수 경쟁이 치열합니다. WALT 2.8년은 단점이 아닌 임대료 현실화 기회입니다." — 홍길동 중개사

### 예상 매수자 유형 (AI 분석)
| 유형 | 적합도 | 이유 |
|------|--------|------|
| **자산운용사 (임대형 펀드)** | ⭐⭐⭐⭐⭐ | 완전임대 + Cap Rate + 안정 현금흐름 |
| **법인 자가사용 (사옥 매입)** | ⭐⭐⭐⭐ | GBD 브랜드 가치 + 임직원 접근성 |
| **고액 자산가 그룹** | ⭐⭐⭐ | 규모 상 협업 필요, 수익 안정성 ↑ |
| **외국계 리츠** | ⭐⭐⭐ | GBD 선호, 환율 변동 리스크 검토 필요 |'
      ),

      -- §7 다음 단계 (정적 CTA)
      jsonb_build_object(
        'section_type', 'next_steps',
        'section_order', 7,
        'title', '📅 향후 검토 및 진행 절차',
        'confidence', 'confirmed',
        'boundary_note', '본 자료는 예비 검토용으로 투자 결정의 근거로 사용할 수 없습니다.',
        'provenance', jsonb_build_array(),
        'markdown', U&'\AD00\C2EC\C774 \C788\C73C\C2DC\B2E4\BA74 \C544\B798 \C808\CC28\B85C \C9C4\D589\D574 \C8FC\C138\C694.

### 투자 진행 단계
1. **초기 관심 표명** → 담당 중개인 홍길동 연락 (010-1234-5678)
2. **NDA 체결** → 임차인 정보 및 임대차계약서 원본 제공
3. **현장 실사 일정 조율** → 인테리어 상태, 설비 컨디션 직접 확인
4. **LOI(투자의향서) 제출** → 가격 협의 개시
5. **법적 실사(DD)** → 법률·세무·기술 전문가 투입
6. **매매계약 체결 → 잔금 납부**

### 상세 분석이 필요하신가요?
**Full IM** (투자등급 정식 투자설명서)은 18개 섹션, 전문가 검토 포함 버전으로 업그레이드 가능합니다.

- 📊 DCF 분석 (10년 현금흐름 모델)
- 🔍 임차인별 신용 분석
- 📋 법적 DD 체크리스트 (법무사 검토)
- 🌍 글로벌 투자자용 영문 요약 (번역 제공)

> 본 자료는 예비 검토용이며 모든 수치와 내용은 실사 및 전문가 검토를 통해 확인이 필요합니다.'
      )
    ),
    'translations', jsonb_build_object(),
    'approval', jsonb_build_object(
      'action', 'approve',
      'broker_notes', '데모용 시딩 데이터. Phase 0 파이프라인 출력 구조와 동일.',
      'approved_at', NOW()::text,
      'approved_by', 'e1a12345-1234-1234-1234-123456789abc'
    )
  )
)
ON CONFLICT (id) DO UPDATE
SET
  content    = EXCLUDED.content,
  body       = EXCLUDED.body,
  status     = EXCLUDED.status,
  updated_at = NOW();

-- ─── Step 4: activity_events — 데모 열람 이벤트 시딩 ──────────────────────────
-- 브로커 대시보드 뷰 카운터 데모용

INSERT INTO activity_events (
  building_id,
  actor_role,
  event_type,
  entity_type,
  entity_id,
  metadata
) VALUES
  (
    'b1111111-1111-1111-1111-111111111111',
    'public',
    'im_lite_view',
    'document_objects',
    'd1111111-1111-1111-1111-111111111111',
    jsonb_build_object(
      'doc_id', 'd1111111-1111-1111-1111-111111111111',
      'sections_viewed', jsonb_build_array('property_overview', 'location_access', 'income_analysis', 'investment_thesis'),
      'ua_hash', 'ua_ZGVtb0Jyb3dzZXJB',
      'referrer', 'https://kakao.com/link/preview',
      'viewed_at', (NOW() - INTERVAL '3 hours')::text
    )
  ),
  (
    'b1111111-1111-1111-1111-111111111111',
    'public',
    'im_lite_view',
    'document_objects',
    'd1111111-1111-1111-1111-111111111111',
    jsonb_build_object(
      'doc_id', 'd1111111-1111-1111-1111-111111111111',
      'sections_viewed', jsonb_build_array('property_overview', 'income_analysis', 'risk_check', 'investment_thesis', 'next_steps'),
      'ua_hash', 'ua_ZGVtb0Jyb3dzZXJC',
      'referrer', 'https://naver.com',
      'viewed_at', (NOW() - INTERVAL '1 hour')::text
    )
  ),
  (
    'b1111111-1111-1111-1111-111111111111',
    'public',
    'im_lite_view',
    'document_objects',
    'd1111111-1111-1111-1111-111111111111',
    jsonb_build_object(
      'doc_id', 'd1111111-1111-1111-1111-111111111111',
      'sections_viewed', jsonb_build_array('property_overview', 'location_access', 'lease_status', 'income_analysis', 'risk_check', 'investment_thesis', 'next_steps'),
      'ua_hash', 'ua_ZGVtb0Jyb3dzZXJD',
      'referrer', 'direct',
      'viewed_at', (NOW() - INTERVAL '30 minutes')::text
    )
  );

-- ─── 검증 쿼리 ────────────────────────────────────────────────────────────────
-- 아래 쿼리로 시딩 결과를 확인하세요.
/*
SELECT
  d.id,
  d.slug,
  d.title,
  d.status,
  d.document_type,
  jsonb_array_length(d.content->'sections') AS section_count,
  (d.content->'financial_summary'->>'cap_rate_base')::numeric AS cap_rate,
  (d.content->'financial_summary'->>'irr_5y_base')::numeric AS irr_5y,
  COUNT(ae.id) AS view_count
FROM document_objects d
LEFT JOIN activity_events ae
  ON ae.entity_id = d.id AND ae.event_type = 'im_lite_view'
WHERE d.id = 'd1111111-1111-1111-1111-111111111111'
GROUP BY d.id;
*/
