/**
 * enums.ts — 온톨로지 v0.5 Enum 카탈로그 (30계열)
 * Spec: ONTOLOGY_V0.4_SPEC.md · CATALOG_SLOTS.md §5 · CATALOG_ASSET_TYPES.md
 *
 * v0.2의 9계열에서 v0.4의 26계열, v0.5의 30계열로 확장.
 * v0.5 신규: RISK_CATEGORY(5), LOCATION_CATEGORY(4), RISK_SEVERITY(3), FALLBACK_STRATEGY(3)
 * 전 계열은 ENUM_REGISTRY에 등록되어야 합니다.
 * 미등록 enum은 버전 Pin 대상에서 빠져 과거 IM 재현 검증을 통과해 버립니다.
 *
 * enum 값 추가는 minor, 의미 변경·삭제는 major입니다.
 * 폐기는 deprecated 플래그로 신규 선택만 막습니다.
 */

// ══════════════════════════════════════════════════════════════════════
// §1. v0.2 기존 9계열 (변경 없이 유지)
// ══════════════════════════════════════════════════════════════════════

// ── 1. 지목 (28종 법정) ──────────────────────────────────────────
export const JIMOK = [
  '전', '답', '과수원', '목장용지', '임야', '광천지', '염전',
  '대', '공장용지', '학교용지', '주차장', '주유소용지',
  '창고용지', '도로', '철도용지', '제방', '하천', '구거',
  '유지', '양어장', '수도용지', '공원', '체육용지', '유원지',
  '종교용지', '사적지', '묘지', '잡종지',
] as const;
export type Jimok = typeof JIMOK[number];

// ── 2. 용도지역 (21종) ───────────────────────────────────────────
export const USE_AREA = [
  '제1종전용주거지역', '제2종전용주거지역',
  '제1종일반주거지역', '제2종일반주거지역', '제3종일반주거지역',
  '준주거지역',
  '중심상업지역', '일반상업지역', '근린상업지역', '유통상업지역',
  '전용공업지역', '일반공업지역', '준공업지역',
  '보전녹지지역', '생산녹지지역', '자연녹지지역',
  '보전관리지역', '생산관리지역', '계획관리지역',
  '농림지역', '자연환경보전지역',
] as const;
export type UseArea = typeof USE_AREA[number];

// ── 3. 용도지구 (11종) ───────────────────────────────────────────
export const USE_DISTRICT = [
  '경관지구', '고도지구', '방화지구', '방재지구', '보존지구',
  '시설보호지구', '취락지구', '개발진흥지구', '특정용도제한지구',
  '복합용도지구', '미관지구',
] as const;
export type UseDistrict = typeof USE_DISTRICT[number];

// ── 4. 용도구역 (6종) ────────────────────────────────────────────
export const USE_ZONE = [
  '개발제한구역', '도시자연공원구역', '시가화조정구역',
  '수산자원보호구역', '입지규제최소구역', '복합용도구역',
] as const;
export type UseZone = typeof USE_ZONE[number];

// ── 5. 제척 사유 (7종) ───────────────────────────────────────────
export const EXCLUSION_KIND = [
  'road_setback',          // 도로 후퇴
  'green_buffer',          // 녹지 완충
  'utility_easement',      // 공익사업 지역권
  'slope_exclusion',       // 경사지 제외
  'river_setback',         // 하천 제방
  'heritage_buffer',       // 문화재 보호
  'other',                 // 기타
] as const;
export type ExclusionKind = typeof EXCLUSION_KIND[number];

// ── 6. 명도 조건 (3종) ───────────────────────────────────────────
export const HANDOVER_CONDITION = [
  'succession',            // 승계 (임차인 유지)
  'eviction',              // 명도 (비워서 인수)
  'negotiable',            // 협의
] as const;
export type HandoverCondition = typeof HANDOVER_CONDITION[number];

// ── 7. 관리비 유형 (2종) ─────────────────────────────────────────
export const MANAGEMENT_FEE_TYPE = [
  'fixed',                 // 정액
  'actual_cost',           // 실비
] as const;
export type ManagementFeeType = typeof MANAGEMENT_FEE_TYPE[number];

// ── 8. Cap Rate 기준 (7종 — v0.2 4종 + v0.4 3종 추가) ───────────
export const CAP_RATE_BASIS = [
  'gross_price',           // 총임대료 ÷ 매각가              (실무 "중개인형")
  'gross_price_deposit',   // 총임대료 ÷ (매각가 − 보증금)   🆕 실무 최빈값
  'noi_price',             // NOI ÷ 매각가                   (표준형)
  'noi_price_deposit',     // NOI ÷ (매각가 − 보증금)
  'noi_equity',            // NOI ÷ 자기자본                 (레버리지)
  'noi_total_cost',        // NOI ÷ 총취득원가               🆕 (회계사형)
  'gop_price',             // GOP ÷ 매각가                   🆕 (운영형 — C31 표기 강제)
] as const;
export type CapRateBasis = typeof CAP_RATE_BASIS[number];

// ── 9. 상임법 적용 범위 (2종) ────────────────────────────────────
export const LEASE_ACT_APPLICATION = [
  'full',                  // 전면 적용
  'partial',               // 일부 적용 (환산보증금 초과 호실 존재)
] as const;
export type LeaseActApplication = typeof LEASE_ACT_APPLICATION[number];

// ══════════════════════════════════════════════════════════════════════
// §2. v0.4 3축 자산 분류 (CATALOG_ASSET_TYPES.md)
// ══════════════════════════════════════════════════════════════════════

// ── 10. 법정 용도 (29종 — 건축법 시행령 별표1) ───────────────────
export const BUILDING_USE = [
  // 자동차 관련
  'auto_facility',         // 자동차관련시설
  // 산업 등
  'transport',             // 운수시설
  'warehouse',             // 창고시설
  'factory',               // 공장
  'hazardous',             // 위험물저장및처리시설
  'recycling',             // 자원순환관련시설
  'cemetery',              // 묘지관련시설
  'funeral',               // 장례시설
  // 전기통신
  'broadcast',             // 방송통신시설
  'power',                 // 발전시설
  // 문화집회
  'culture',               // 문화및집회시설
  'religion',              // 종교시설
  'amusement',             // 위락시설
  'tourism_rest',          // 관광휴게시설
  // 영업
  'retail',                // 판매시설
  'sports',                // 운동시설
  'lodging',               // 숙박시설
  'multi_living',          // 제2종근린생활시설 中 다중생활시설
  // 교육복지
  'medical',               // 의료시설
  'education',             // 교육연구시설
  'elderly_care',          // 노유자시설
  'training',              // 수련시설
  'campground',            // 야영장시설
  // 근린생활
  'nbhd_1',                // 제1종근린생활시설
  'nbhd_2',                // 제2종근린생활시설
  // 주거업무
  'house_single',          // 단독주택 (다가구 포함)
  'house_multi',           // 공동주택 (다세대·연립·아파트)
  'office',                // 업무시설 (오피스텔 포함)
  'correctional',          // 교정시설·국방군사시설
] as const;
export type BuildingUse = typeof BUILDING_USE[number];

// ── 11. 시장 유형 (17종) ─────────────────────────────────────────
export const ASSET_TYPE = [
  'nbhd_building',         // 근생빌딩
  'office_building',       // 사무용빌딩
  'mixed_shop_house',      // 상가주택
  'multi_household',       // 다가구·다중주택 (원룸)
  'multi_family',          // 다세대·연립
  'officetel',             // 오피스텔
  'knowledge_center',      // 지식산업센터
  'retail_strip',          // 근린상가·집합상가
  'hotel',                 // 호텔·모텔
  'serviced_residence',    // 생활형숙박시설
  'logistics',             // 물류창고
  'factory_building',      // 공장
  'medical_facility',      // 병원·요양시설
  'education_facility',    // 학원·교육시설
  'bare_land',             // 나대지·개발부지
  'raw_land',              // 임야·농지
  'special_use',           // 특수 (주유소·주차장·장례식장 등)
] as const;
export type AssetType = typeof ASSET_TYPE[number];

// ── 12. 투자 관점 (5종) ──────────────────────────────────────────
export const INVESTMENT_POSTURE = [
  'income',                // 임대수익형
  'owner_occupied',        // 자가사용형 (사옥)
  'development',           // 개발형
  'operating',             // 운영형 (호텔·요양·물류 자가운영)
  'trading',               // 단기매매형
] as const;
export type InvestmentPosture = typeof INVESTMENT_POSTURE[number];

// ══════════════════════════════════════════════════════════════════════
// §3. v0.4 Core 슬롯군 지원 enum (CATALOG_SLOTS.md)
// ══════════════════════════════════════════════════════════════════════

// ── 13. 도로접면 (12종) ──────────────────────────────────────────
export const ROAD_ACCESS_GRADE = [
  '광대한면',              // 25m 이상 도로
  '광대소각',
  '광대세장',
  '중로한면',              // 12~25m
  '중로소각',
  '중로세장',
  '소로한면',              // 8~12m
  '소로소각',
  '소로세장',
  '세로한면',              // 8m 미만
  '세로소각',
  '맹지',                  // 접면 없음
] as const;
export type RoadAccessGrade = typeof ROAD_ACCESS_GRADE[number];

// ── 14. 토지 형상 (6종) ──────────────────────────────────────────
export const LAND_SHAPE = [
  'rectangular',           // 정방형
  'elongated',             // 세장형
  'trapezoidal',           // 사다리형
  'triangular',            // 삼각형
  'flag_shaped',           // 자루형
  'irregular',             // 부정형
] as const;
export type LandShape = typeof LAND_SHAPE[number];

// ── 15. 지세 (5종) ───────────────────────────────────────────────
export const TERRAIN = [
  'flat',                  // 평지
  'gentle_slope',          // 완경사
  'moderate_slope',        // 보통경사
  'steep_slope',           // 급경사
  'cliff',                 // 절벽·단차
] as const;
export type Terrain = typeof TERRAIN[number];

// ── 16. 매수 목적 (5종) ──────────────────────────────────────────
export const BUYER_PURPOSE = [
  'owner_use',             // 실사용
  'rental_income',         // 임대수익
  'value_add',             // 밸류애드
  'development',           // 개발
  'asset_allocation',      // 자산배분
] as const;
export type BuyerPurpose = typeof BUYER_PURPOSE[number];

// ── 17. 임대차 법적 기초 (2종) ───────────────────────────────────
export const LEASE_UNIT_LEGAL_BASIS = [
  'commercial',            // 상가건물임대차보호법
  'residential',           // 주택임대차보호법
] as const;
export type LeaseUnitLegalBasis = typeof LEASE_UNIT_LEGAL_BASIS[number];

// ══════════════════════════════════════════════════════════════════════
// §4. v0.4 Pack 슬롯군 지원 enum (CATALOG_SLOTS.md §3)
// ══════════════════════════════════════════════════════════════════════

// ── 18. 램프 유형 (3종 — 물류) ───────────────────────────────────
export const RAMP_TYPE = [
  'straight',              // 직램프
  'spiral',                // 선회램프
  'none',                  // 없음
] as const;
export type RampType = typeof RAMP_TYPE[number];

// ── 19. 온도 구역 (4종 — 물류) ───────────────────────────────────
export const TEMPERATURE_ZONE = [
  'ambient',               // 상온
  'chilled',               // 저온 (0~10°C)
  'frozen',                // 냉동 (−18°C 이하)
  'mixed',                 // 복합
] as const;
export type TemperatureZone = typeof TEMPERATURE_ZONE[number];

// ── 20. 인허가 항목 (12종) ───────────────────────────────────────
export const PERMIT_KIND = [
  'height_limit',          // 고도제한
  'sunlight',              // 일조
  'parking',               // 주차
  'public_contribution',   // 기부채납
  'development_act',       // 개발행위허가
  'farmland_conversion',   // 농지전용
  'forest_conversion',     // 산지전용
  'cultural_heritage',     // 문화재지표조사
  'traffic_impact',        // 교통영향평가
  'environmental_impact',  // 환경영향평가
  'road_access_zone',      // 접도구역
  'infrastructure',        // 기반시설
] as const;
export type PermitKind = typeof PERMIT_KIND[number];

// ── 21. 명도 책임 (3종) ──────────────────────────────────────────
export const VACATE_RESPONSIBILITY = [
  'seller',                // 매도인 책임
  'buyer',                 // 매수인 책임
  'shared',                // 공동
] as const;
export type VacateResponsibility = typeof VACATE_RESPONSIBILITY[number];

// ══════════════════════════════════════════════════════════════════════
// §4.5 v0.5 신규 4계열 — 리스크·입지·폴백 온톨로지
// ══════════════════════════════════════════════════════════════════════

// ── 22v5. 리스크 카테고리 (5종) ────────────────────────────────────
export const RISK_CATEGORY = [
  'legal_right',           // 권리·등기·가압류 리스크
  'physical_building',     // 건축물 노후도·위반건축물·설비
  'zoning_regulatory',     // 용도지역·지구단위계획·건폐·용적률
  'financial_debt',        // 근저당·신탁·대출상환
  'tenant_vacancy',        // 공실률·임대차분쟁·명도 리스크
] as const;
export type RiskCategory = typeof RISK_CATEGORY[number];

// ── 23v5. 리스크 심각도 (3종) ─────────────────────────────────────
export const RISK_SEVERITY = [
  'low',                   // 경미 — 통상적 확인 사항
  'medium',                // 주의 — 실사 시 정밀 확인 필요
  'high',                  // 중대 — 거래 의사결정에 직접 영향
] as const;
export type RiskSeverityLevel = typeof RISK_SEVERITY[number];

// ── 24v5. 입지 분석 카테고리 (4종) ────────────────────────────────
export const LOCATION_CATEGORY = [
  'transit_access',        // 대중교통 접근성 (지하철·버스·도보)
  'road_network',          // 도로 접면·차량 진출입성
  'catchment_demand',      // 배후 수요 (세대수·유동인구·상권)
  'urban_amenity',         // 도시 편의시설 (관공서·병원·교육)
] as const;
export type LocationCategory = typeof LOCATION_CATEGORY[number];

// ── 25v5. 데이터 부재 시 폴백 전략 (3종) ──────────────────────────
export const FALLBACK_STRATEGY = [
  'institutional_checklist',  // 기관투자사 수준 실사 체크리스트 카드
  'skeleton_guide',           // 데이터 입력 가이드 스켈레톤
  'market_benchmark',         // 시장 비교 벤치마크 기반 추정
] as const;
export type FallbackStrategy = typeof FALLBACK_STRATEGY[number];

// ══════════════════════════════════════════════════════════════════════
// §5. 시스템 enum (CATALOG_SLOTS.md §1)
// ══════════════════════════════════════════════════════════════════════

// ── 22. 슬롯 상태 (9종) ──────────────────────────────────────────
export const SLOT_STATE = [
  'pending',               // 대기
  'fetching',              // 수집 중
  'fetched',               // 수집 완료
  'manual_required',       // 수동 입력 필요
  'broker_entered',        // 중개인 입력
  'seller_declared',       // 매도인 고지
  'verified',              // 검증 완료
  'failed',                // 실패
  'not_applicable',        // 해당 없음
] as const;
export type SlotState = typeof SLOT_STATE[number];

// ── 23. 등급 (4종) ───────────────────────────────────────────────
export const GRADE = ['A', 'B', 'C', 'D'] as const;
export type Grade = typeof GRADE[number];

// ── 24. 공개 티어 (2종) ──────────────────────────────────────────
export const TIER = ['basic', 'pro'] as const;
export type Tier = typeof TIER[number];

// ── 25. 영향도 (3종) ─────────────────────────────────────────────
export const IMPACT = [
  'cosmetic',              // 외관적
  'material',              // 실질적
  'critical',              // 중대
] as const;
export type Impact = typeof IMPACT[number];

// ── 26. 지표 공개 수준 (3종) ─────────────────────────────────────
export const METRIC_DISCLOSURE = [
  'primary',               // 주요 — 본문 표시
  'secondary',             // 보조 — 접기/부록
  'onRequest',             // 요청 시 — Pro에서만
] as const;
export type MetricDisclosure = typeof METRIC_DISCLOSURE[number];

// ── 27. PPTX 테마 프리셋 (5종 — v0.5.1) ───────────────────────────
export const PPTX_THEME_PRESET = [
  'golden_institutional',  // 골든 기관투자형 (황동/골드 + 네이비)
  'pro_dark_obsidian',     // 다크 옵시디언 (네온그린 + 다크슬레이트)
  'pro_emerald',           // 에메랄드 클래식 (에메랄드 + 다크포레스트)
  'pro_cyan_tech',         // 사이언 테크 (사이언 + 딥블루)
  'pro_modern_gold',       // 모던 골드 (샴페인골드 + 차콜)
] as const;
export type PptxThemePreset = typeof PPTX_THEME_PRESET[number];

// ── 28. PPTX 슬라이드 아키타입 (14종 — v0.5.1) ─────────────────────
export const PPTX_ARCHETYPE = [
  'A01',                   // 히어로 표지
  'A02',                   // 3x2 핵심지표 그리드
  'A03',                   // 대형 데이터 테이블 (렌트롤/비교사례)
  'A04',                   // 7:5 비대칭 스펙+사진/콜아웃
  'A05',                   // 7:4 비대칭 개발/수지분석
  'A06',                   // 입지 다이어그램 + 지도
  'A07',                   // 3단 리스크 블록 + 하단 안내바
  'A08',                   // 듀얼 테이블 (자가 vs 임차 비교)
  'A09',                   // 4단계 프로세스/타임라인
  'A10',                   // 클로징 면책/담당자 카드
  'A11',                   // 호실 스펙/공실 분석
  'A12',                   // 권리관계/지분 구조
  'A13',                   // 운영 KPI/GOP 분석
  'A14',                   // 4~6분할 사진 갤러리
] as const;
export type PptxArchetypeCode = typeof PPTX_ARCHETYPE[number];

// ── 29. 사진 카테고리 (17종 — v0.6.0) ─────────────────────────────
export const PHOTO_CATEGORY = [
  'exterior',        // 건물 외관 전경
  'aerial',          // 항공/드론 촬영
  'entrance',        // 건물 주 출입구
  'surroundings',    // 주변 환경 (도로, 상권)
  'signage',         // 건물 간판/사인
  'lobby',           // 1층 로비/안내데스크
  'corridor',        // 복도/계단/공용부
  'elevator',        // 엘리베이터홀
  'interior',        // 기준층 내부 (범용)
  'tenant_space',    // 임차인 전용 공간
  'floor_plan',      // 도면/평면도
  'parking',         // 주차장 (지상/지하)
  'rooftop',         // 옥상/테라스
  'mechanical',      // 기계실/전기실/설비
  'storage',         // 창고/보관실
  'map',             // 위치 지도 (자동 생성)
  'hero',            // 대표 사진 (브로커 지정)
] as const;
export type PhotoCategory = typeof PHOTO_CATEGORY[number];

// ── 30. 갤러리 그룹 (4종 — v0.6.0) ────────────────────────────────
export const GALLERY_GROUP = [
  'G1_exterior',    // 외관·입지 (Exterior & Context)
  'G2_common',      // 공용·로비 (Common & Lobby)
  'G3_leasable',    // 전용·임대 (Leasable Space)
  'G4_facility',    // 설비·부대 (Facilities)
] as const;
export type GalleryGroup = typeof GALLERY_GROUP[number];

// ══════════════════════════════════════════════════════════════════════
// §6. 통합 Enum Registry — 34계열 전량 등록 (v0.6.0)
// ══════════════════════════════════════════════════════════════════════

export const ENUM_REGISTRY: Record<string, readonly string[]> = {
  // v0.2 기존 9계열
  jimok: JIMOK,
  use_area: USE_AREA,
  use_district: USE_DISTRICT,
  use_zone: USE_ZONE,
  exclusion_kind: EXCLUSION_KIND,
  handover_condition: HANDOVER_CONDITION,
  management_fee_type: MANAGEMENT_FEE_TYPE,
  cap_rate_basis: CAP_RATE_BASIS,
  lease_act_application: LEASE_ACT_APPLICATION,
  // v0.4 3축 분류
  building_use: BUILDING_USE,
  asset_type: ASSET_TYPE,
  investment_posture: INVESTMENT_POSTURE,
  // v0.4 Core 지원
  road_access_grade: ROAD_ACCESS_GRADE,
  land_shape: LAND_SHAPE,
  terrain: TERRAIN,
  buyer_purpose: BUYER_PURPOSE,
  lease_unit_legal_basis: LEASE_UNIT_LEGAL_BASIS,
  // v0.4 Pack 지원
  ramp_type: RAMP_TYPE,
  temperature_zone: TEMPERATURE_ZONE,
  permit_kind: PERMIT_KIND,
  vacate_responsibility: VACATE_RESPONSIBILITY,
  // v0.5 리스크·입지·폴백
  risk_category: RISK_CATEGORY,
  risk_severity: RISK_SEVERITY,
  location_category: LOCATION_CATEGORY,
  fallback_strategy: FALLBACK_STRATEGY,
  // v0.5.1 PPTX 렌더링 SSoT
  pptx_theme_preset: PPTX_THEME_PRESET,
  pptx_archetype: PPTX_ARCHETYPE,
  // v0.6.0 사진/갤러리 SSoT
  photo_category: PHOTO_CATEGORY,
  gallery_group: GALLERY_GROUP,
  // 시스템
  slot_state: SLOT_STATE,
  grade: GRADE,
  tier: TIER,
  impact: IMPACT,
  metric_disclosure: METRIC_DISCLOSURE,
};

// ══════════════════════════════════════════════════════════════════════
// §7. 유틸리티
// ══════════════════════════════════════════════════════════════════════

/** enum 계열과 값의 유효성을 검증합니다. */
export function isValidEnumValue(family: string, value: string): boolean {
  const values = ENUM_REGISTRY[family];
  if (!values) return false;
  return values.includes(value as never);
}

/** 지정 enum 계열의 전체 값 목록을 반환합니다. */
export function getEnumValues(family: string): readonly string[] {
  return ENUM_REGISTRY[family] || [];
}

/** 전체 enum 계열 목록을 반환합니다. */
export function getEnumFamilies(): string[] {
  return Object.keys(ENUM_REGISTRY);
}

/** 전체 enum 계열 수를 반환합니다. */
export function getEnumFamilyCount(): number {
  return Object.keys(ENUM_REGISTRY).length;
}
