import type { BuildingSSoTLite } from '@/domain/building/building-ssot-lite.types';
import type { MobileIMSupplementalInput } from '@/domain/building/mobile-im/types';
import type { InvestmentPosture } from '@/domain/ontology/enums';

export interface PostureE2EFixture {
  caseId: string;         // e.g. 'case01_seocho_medical'
  posture: InvestmentPosture;
  expectedArchetype: string;
  rawMemo: string;         // Original broker memo text
  ssotLite: Partial<BuildingSSoTLite>;
  supplemental: MobileIMSupplementalInput;
  identity: {
    buildingUse?: string;
    assetType?: string;
    investmentPosture?: string;
  };
  description: string;     // Human-readable case description
}

export const CASE_01: PostureE2EFixture = {
  caseId: 'case01_seocho_medical',
  posture: 'income',
  expectedArchetype: 'STABLE_INCOME',
  rawMemo: '[전속/메디컬빌딩] 서초구 서초동 1320-5 역세권 올근생 메디컬 빌딩 매각\n- 대지면적: 142.5평 (471.1㎡) / 연면적: 620.8평 (2,052.2㎡)\n- 층수: 지하 2층 ~ 지상 7층 / 준공: 2017년 11월\n- 매매가: 165억원\n- 보증금 11억 5,000만원 / 월 임대료 5,950만원 / 관리비 680만원\n- Cap Rate: 4.62%',
  ssotLite: { id: 'stress-case-01', area_signal: '서초권역', asset_type: '근생빌딩', price_band: '165억', land_area_pyung: 142.5, total_floor_area_pyung: 620.8, asking_price_krw: 16500000000, gross_annual_income_krw: 714000000, layers: { location: {} }, completeness_score: 85 },
  supplemental: { monthly_rent_total_krw: 59500000, asking_price_manwon: 1650000, total_deposit_manwon: 115000, loan_amount_manwon: 850000, resolved_address: '서울특별시 서초구 서초동 1320-5', floor_leases: [
    { floor: 'B1~B2', tenant_type: '주차장', area_pyeong: 120, deposit_manwon: 0, rent_manwon: 0 },
    { floor: '1F', tenant_type: '대형약국', area_pyeong: 55, deposit_manwon: 30000, rent_manwon: 1200 },
    { floor: '2F', tenant_type: '안과', area_pyeong: 65, deposit_manwon: 20000, rent_manwon: 1100 },
    { floor: '3F', tenant_type: '피부과', area_pyeong: 65, deposit_manwon: 20000, rent_manwon: 1050 },
    { floor: '4F', tenant_type: '정형외과', area_pyeong: 65, deposit_manwon: 15000, rent_manwon: 1000 },
    { floor: '5F', tenant_type: '치과', area_pyeong: 65, deposit_manwon: 15000, rent_manwon: 950 },
    { floor: '6F~7F', tenant_type: '어학원', area_pyeong: 130, deposit_manwon: 15000, rent_manwon: 650 }
  ] },
  identity: { buildingUse: 'nbhd_2', assetType: 'medical_facility', investmentPosture: 'income' },
  description: '서초 메디컬 빌딩 (안정형 수익)'
};

export const CASE_02: PostureE2EFixture = {
  caseId: 'case02_hongdae_fnb',
  posture: 'income',
  expectedArchetype: 'STABLE_INCOME',
  rawMemo: '[급매] 마포구 서교동 395-88 홍대 서교거리 F&B 코너 올근생 꼬마빌딩\n- 대지: 62.3평 / 연면적: 158.4평\n- 규모: 지하1~지상4층 / 2015년 리모델링 완료\n- 매매가: 58억원\n- 보증금 3억원 / 월세 2,350만원',
  ssotLite: { id: 'stress-case-02', area_signal: '마포권역', asset_type: '꼬마빌딩', price_band: '58억', land_area_pyung: 62.3, total_floor_area_pyung: 158.4, asking_price_krw: 5800000000, gross_annual_income_krw: 282000000, layers: { location: {} }, completeness_score: 75 },
  supplemental: { monthly_rent_total_krw: 23500000, asking_price_manwon: 580000, total_deposit_manwon: 30000, resolved_address: '서울특별시 마포구 서교동 395-88', floor_leases: [
    { floor: 'B1~2F', tenant_type: 'F&B 브런치펍', area_pyeong: 95, deposit_manwon: 20000, rent_manwon: 1650 },
    { floor: '3F~4F', tenant_type: '디자인 스튜디오', area_pyeong: 63, deposit_manwon: 10000, rent_manwon: 700 }
  ] },
  identity: { buildingUse: 'nbhd_2', assetType: 'nbhd_building', investmentPosture: 'income' },
  description: '홍대 F&B 꼬마빌딩'
};

export const CASE_03: PostureE2EFixture = {
  caseId: 'case03_bundang_office',
  posture: 'income',
  expectedArchetype: 'STABLE_INCOME',
  rawMemo: '[프라임오피스] 경기도 성남시 분당구 수내동 12-4 수익형 빌딩 매각\n- 대지면적: 385.2평 / 연면적: 2450.6평\n- 매매가: 320억원\n- 보증금 22억원 / 월 임대료 1억 2,800만원',
  ssotLite: { id: 'stress-case-03', area_signal: '분당권역', asset_type: '프라임오피스', price_band: '320억', land_area_pyung: 385.2, total_floor_area_pyung: 2450.6, asking_price_krw: 32000000000, gross_annual_income_krw: 1536000000, layers: { location: {} }, completeness_score: 90 },
  supplemental: { monthly_rent_total_krw: 128000000, asking_price_manwon: 3200000, total_deposit_manwon: 2200000, loan_amount_manwon: 1800000, resolved_address: '경기도 성남시 분당구 수내동 12-4' },
  identity: { buildingUse: 'office', assetType: 'office_building', investmentPosture: 'income' },
  description: '분당 프라임 오피스'
};

export const CASE_04: PostureE2EFixture = {
  caseId: 'case04_seongsu_atelier',
  posture: 'income',
  expectedArchetype: 'STABLE_INCOME',
  rawMemo: '[신축근생] 성동구 성수동1가 685-12 아틀리에길 신축\n- 대지: 78.5평 / 연면적: 198.2평\n- 매매가: 88억원\n- 보증금 5억원 / 월세 3,100만원',
  ssotLite: { id: 'stress-case-04', area_signal: '성수권역', asset_type: '신축근생', price_band: '88억', land_area_pyung: 78.5, total_floor_area_pyung: 198.2, asking_price_krw: 8800000000, gross_annual_income_krw: 372000000, layers: { location: {} }, completeness_score: 80 },
  supplemental: { monthly_rent_total_krw: 31000000, asking_price_manwon: 880000, total_deposit_manwon: 50000, resolved_address: '서울특별시 성동구 성수동1가 685-12' },
  identity: { buildingUse: 'nbhd_2', assetType: 'nbhd_building', investmentPosture: 'income' },
  description: '성수 아틀리에길 신축'
};

export const CASE_05: PostureE2EFixture = {
  caseId: 'case05_seongsu_hq',
  posture: 'owner_occupied',
  expectedArchetype: 'OO-01',
  rawMemo: '[사옥추천] 성동구 성수동2가 277-33 IT밸리 통사옥\n- 대지: 135.8평 / 연면적: 512.4평\n- 매매가: 135억원 / 전체 공실 명도 가능',
  ssotLite: { id: 'stress-case-05', area_signal: '성수권역', asset_type: '사옥', price_band: '135억', land_area_pyung: 135.8, total_floor_area_pyung: 512.4, asking_price_krw: 13500000000, layers: { location: {} }, completeness_score: 70 },
  supplemental: { asking_price_manwon: 1350000, vacancy_pct: 100, resolved_address: '서울특별시 성동구 성수동2가 277-33' },
  identity: { buildingUse: 'office', assetType: 'office_building', investmentPosture: 'owner_occupied' },
  description: '성수 IT밸리 통사옥'
};

export const CASE_06: PostureE2EFixture = {
  caseId: 'case06_nonhyeon_creative',
  posture: 'owner_occupied',
  expectedArchetype: 'OO-01',
  rawMemo: '[통사옥] 강남구 논현동 112-9 크리에이티브 사옥\n- 대지: 94.2평 / 연면적: 285.6평\n- 매매가: 76억원 / 사옥 입주 추천',
  ssotLite: { id: 'stress-case-06', area_signal: '강남권역', asset_type: '사옥', price_band: '76억', land_area_pyung: 94.2, total_floor_area_pyung: 285.6, asking_price_krw: 7600000000, layers: { location: {} }, completeness_score: 70 },
  supplemental: { asking_price_manwon: 760000, vacancy_pct: 100, resolved_address: '서울특별시 강남구 논현동 112-9' },
  identity: { buildingUse: 'office', assetType: 'office_building', investmentPosture: 'owner_occupied' },
  description: '논현동 크리에이티브 사옥'
};

export const CASE_07: PostureE2EFixture = {
  caseId: 'case07_yeouido_corp',
  posture: 'owner_occupied',
  expectedArchetype: 'OO-01',
  rawMemo: '[법인사옥] 영등포구 여의도동 44-12 일반상업지역\n- 대지: 110.5평 / 연면적: 420.3평\n- 매매가: 95억원',
  ssotLite: { id: 'stress-case-07', area_signal: '여의도권역', asset_type: '사옥', price_band: '95억', land_area_pyung: 110.5, total_floor_area_pyung: 420.3, asking_price_krw: 9500000000, zoning_region: '일반상업지역', layers: { location: {} }, completeness_score: 72 },
  supplemental: { asking_price_manwon: 950000, vacancy_pct: 0, resolved_address: '서울특별시 영등포구 여의도동 44-12' },
  identity: { buildingUse: 'office', assetType: 'office_building', investmentPosture: 'owner_occupied' },
  description: '여의도 전문직 법인사옥'
};

export const CASE_08: PostureE2EFixture = {
  caseId: 'case08_hannam_flagship',
  posture: 'owner_occupied',
  expectedArchetype: 'OO-01',
  rawMemo: '[플래그십] 용산구 한남동 68-4 사옥 부지/건물\n- 대지: 128.4평 / 연면적: 265.8평\n- 매매가: 180억원',
  ssotLite: { id: 'stress-case-08', area_signal: '한남권역', asset_type: '사옥', price_band: '180억', land_area_pyung: 128.4, total_floor_area_pyung: 265.8, asking_price_krw: 18000000000, layers: { location: {} }, completeness_score: 68 },
  supplemental: { asking_price_manwon: 1800000, vacancy_pct: 0, resolved_address: '서울특별시 용산구 한남동 68-4' },
  identity: { buildingUse: 'nbhd_2', assetType: 'nbhd_building', investmentPosture: 'owner_occupied' },
  description: '한남동 플래그십 사옥'
};

export const CASE_09: PostureE2EFixture = {
  caseId: 'case09_sinsa_value_add',
  posture: 'trading',
  expectedArchetype: 'TR-01',
  rawMemo: '[밸류애드] 강남구 신사동 534-11 가로수길 노후빌딩\n- 대지: 102.3평 / 연면적: 215.4평\n- 매매가: 98억원 / 용적률 165% / 보증금 1.8억 월세 1,100만원',
  ssotLite: { id: 'stress-case-09', area_signal: '강남권역', asset_type: '노후빌딩', price_band: '98억', land_area_pyung: 102.3, total_floor_area_pyung: 215.4, asking_price_krw: 9800000000, gross_annual_income_krw: 132000000, far_pct: 165, layers: { location: {} }, completeness_score: 65 },
  supplemental: { monthly_rent_total_krw: 11000000, asking_price_manwon: 980000, total_deposit_manwon: 18000, vacancy_pct: 0, resolved_address: '서울특별시 강남구 신사동 534-11', investmentPosture: 'trading' },
  identity: { buildingUse: 'nbhd_2', assetType: 'nbhd_building', investmentPosture: 'trading' },
  description: '신사동 가로수길 밸류애드'
};

export const CASE_10: PostureE2EFixture = {
  caseId: 'case10_seocho_old_retail',
  posture: 'trading',
  expectedArchetype: 'TR-01',
  rawMemo: '[노후근생] 서초구 서초동 1573-2 법조타운\n- 대지: 118.6평 / 연면적: 345.8평\n- 매매가: 115억원 / 보증금 4억 월세 1,950만원',
  ssotLite: { id: 'stress-case-10', area_signal: '서초권역', asset_type: '노후근생', price_band: '115억', land_area_pyung: 118.6, total_floor_area_pyung: 345.8, asking_price_krw: 11500000000, gross_annual_income_krw: 234000000, layers: { location: {} }, completeness_score: 70 },
  supplemental: { monthly_rent_total_krw: 19500000, asking_price_manwon: 1150000, total_deposit_manwon: 40000, vacancy_pct: 0, resolved_address: '서울특별시 서초구 서초동 1573-2', investmentPosture: 'trading' },
  identity: { buildingUse: 'nbhd_2', assetType: 'nbhd_building', investmentPosture: 'trading' },
  description: '교대역 법조타운 노후 근생'
};

export const CASE_11: PostureE2EFixture = {
  caseId: 'case11_yongsan_mixed',
  posture: 'trading',
  expectedArchetype: 'TR-01',
  rawMemo: '[복합구옥] 용산구 원효로1가 41-10 용리단길\n- 대지: 48.2평 / 연면적: 78.5평\n- 매매가: 43억원 / 전체 명도 가능',
  ssotLite: { id: 'stress-case-11', area_signal: '용산권역', asset_type: '복합구옥', price_band: '43억', land_area_pyung: 48.2, total_floor_area_pyung: 78.5, asking_price_krw: 4300000000, layers: { location: {} }, completeness_score: 55 },
  supplemental: { asking_price_manwon: 430000, vacancy_pct: 100, resolved_address: '서울특별시 용산구 원효로1가 41-10', investmentPosture: 'trading' },
  identity: { buildingUse: 'nbhd_2', assetType: 'mixed_shop_house', investmentPosture: 'trading' },
  description: '용리단길 복합 구옥'
};

export const CASE_12: PostureE2EFixture = {
  caseId: 'case12_yeoksam_dev',
  posture: 'development',
  expectedArchetype: 'DEV-01',
  rawMemo: '[신축부지] 강남구 역삼동 735-8 제3종일반주거지역\n- 대지: 168.5평\n- 매매가: 210억원 / 개발 부지 추천',
  ssotLite: { id: 'stress-case-12', area_signal: '강남권역', asset_type: '신축부지', price_band: '210억', land_area_pyung: 168.5, asking_price_krw: 21000000000, zoning_region: '제3종일반주거지역', far_pct: 0, layers: { location: {} }, completeness_score: 60 },
  supplemental: { asking_price_manwon: 2100000, resolved_address: '서울특별시 강남구 역삼동 735-8', investmentPosture: 'development' },
  identity: { buildingUse: 'nbhd_1', assetType: 'bare_land', investmentPosture: 'development' },
  description: '역삼 테헤란로 신축부지'
};

export const CASE_13: PostureE2EFixture = {
  caseId: 'case13_mullae_dev',
  posture: 'development',
  expectedArchetype: 'DEV-01',
  rawMemo: '[준공업] 영등포구 문래동3가 55-20 개발부지\n- 대지: 245.0평\n- 매매가: 145억원',
  ssotLite: { id: 'stress-case-13', area_signal: '영등포권역', asset_type: '개발부지', price_band: '145억', land_area_pyung: 245.0, asking_price_krw: 14500000000, zoning_region: '준공업지역', far_pct: 0, layers: { location: {} }, completeness_score: 58 },
  supplemental: { asking_price_manwon: 1450000, resolved_address: '서울특별시 영등포구 문래동3가 55-20', investmentPosture: 'development' },
  identity: { buildingUse: 'factory', assetType: 'bare_land', investmentPosture: 'development' },
  description: '문래동 준공업 개발부지'
};

export const CASE_14: PostureE2EFixture = {
  caseId: 'case14_bangi_discount',
  posture: 'income',
  expectedArchetype: 'STABLE_INCOME',
  rawMemo: '[급매] 송파구 방이동 185-4 근생빌딩\n- 대지: 96.5평 / 연면적: 298.4평\n- 매매가: 72억원 / 보증금 3.8억 월세 2,200만원',
  ssotLite: { id: 'stress-case-14', area_signal: '송파권역', asset_type: '근생빌딩', price_band: '72억', land_area_pyung: 96.5, total_floor_area_pyung: 298.4, asking_price_krw: 7200000000, gross_annual_income_krw: 264000000, layers: { location: {} }, completeness_score: 78 },
  supplemental: { monthly_rent_total_krw: 22000000, asking_price_manwon: 720000, total_deposit_manwon: 38000, loan_amount_manwon: 420000, resolved_address: '서울특별시 송파구 방이동 185-4' },
  identity: { buildingUse: 'nbhd_2', assetType: 'nbhd_building', investmentPosture: 'income' },
  description: '방이동 급매'
};

export const CASE_15: PostureE2EFixture = {
  caseId: 'case15_jongro_family',
  posture: 'trading',
  expectedArchetype: 'TR-01',
  rawMemo: '[상속매각] 종로구 관수동 105-3 올근생\n- 대지: 232.8평 / 연면적: 890.5평\n- 매매가: 240억원 / 보증금 15억 월세 7,800만원',
  ssotLite: { id: 'stress-case-15', area_signal: '종로권역', asset_type: '올근생빌딩', price_band: '240억', land_area_pyung: 232.8, total_floor_area_pyung: 890.5, asking_price_krw: 24000000000, gross_annual_income_krw: 936000000, zoning_region: '일반상업지역', layers: { location: {} }, completeness_score: 82 },
  supplemental: { monthly_rent_total_krw: 78000000, asking_price_manwon: 2400000, total_deposit_manwon: 150000, resolved_address: '서울특별시 종로구 관수동 105-3', investmentPosture: 'trading' },
  identity: { buildingUse: 'nbhd_2', assetType: 'nbhd_building', investmentPosture: 'trading' },
  description: '관수동 종중 매각'
};

export const CASE_16: PostureE2EFixture = {
  caseId: 'case16_icheon_logistics',
  posture: 'operating',
  expectedArchetype: 'OP-01',
  rawMemo: '경기도 이천시 마장면 물류센터 매물\n대지 3000평 연면적 5500평 지하없음 지상3층 2020년 준공\n냉동·냉장 겸용 복합온도 물류센터\n도크 12개 레벨러 8개 천장고 12m\n현재 CJ대한통운 10년 장기계약 만실\n월 임대수입 1억2000만원\n매도 호가 450억\n영동고속도로 이천IC 3km',
  ssotLite: { id: 'stress-case-16-icheon', area_signal: '이천권역', asset_type: '물류센터', price_band: '450억', land_area_pyung: 3000, total_floor_area_pyung: 5500, asking_price_krw: 45000000000, gross_annual_income_krw: 1440000000, layers: { location: {} }, completeness_score: 80 },
  supplemental: { monthly_rent_total_krw: 120000000, asking_price_manwon: 4500000, total_deposit_manwon: 500000, vacancy_pct: 0, resolved_address: '경기도 이천시 마장면', investmentPosture: 'operating', logistics: { ceiling_height_m: 12, dock_count: 12, dock_leveler_count: 8, max_vehicle_ton: 25, floor_load_ton_m2: 3.5, cold_storage_type: 'both', cold_storage_area_pyeong: 1500, loading_area_pyeong: 800, vehicle_access_type: 'both', fire_rating: '1급', sprinkler: true, column_span_m: '10x10', power_capacity_kw: 2500, has_office_space: true, office_area_pyeong: 200, distance_to_ic_km: 3, ic_name: '이천IC' } },
  identity: { buildingUse: 'warehouse', assetType: 'logistics', investmentPosture: 'operating' },
  description: '이천 물류센터'
};

export const ALL_FIXTURES: PostureE2EFixture[] = [
  CASE_01, CASE_02, CASE_03, CASE_04, CASE_05,
  CASE_06, CASE_07, CASE_08, CASE_09, CASE_10,
  CASE_11, CASE_12, CASE_13, CASE_14, CASE_15, CASE_16
];

export const INCOME_FIXTURES: PostureE2EFixture[] = [
  CASE_01, CASE_02, CASE_03, CASE_04, CASE_14
];

export const OWNER_OCCUPIED_FIXTURES: PostureE2EFixture[] = [
  CASE_05, CASE_06, CASE_07, CASE_08
];

export const TRADING_FIXTURES: PostureE2EFixture[] = [
  CASE_09, CASE_10, CASE_11, CASE_15
];

export const DEVELOPMENT_FIXTURES: PostureE2EFixture[] = [
  CASE_12, CASE_13
];

export const OPERATING_FIXTURES: PostureE2EFixture[] = [
  CASE_16
];

export const POSTURE_REPRESENTATIVE_FIXTURES: Record<InvestmentPosture, PostureE2EFixture> = {
  income: CASE_01,
  owner_occupied: CASE_05,
  development: CASE_12,
  operating: CASE_16,
  trading: CASE_09
};

export function getFixtureByPosture(posture: InvestmentPosture): PostureE2EFixture[] {
  switch (posture) {
    case 'income': return INCOME_FIXTURES;
    case 'owner_occupied': return OWNER_OCCUPIED_FIXTURES;
    case 'trading': return TRADING_FIXTURES;
    case 'development': return DEVELOPMENT_FIXTURES;
    case 'operating': return OPERATING_FIXTURES;
    default: return [];
  }
}
