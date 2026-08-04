/**
 * @file asset-identity.ts
 * @description ONTOLOGY_V0.4_SPEC.md 및 CATALOG_ASSET_TYPES.md에 기반한 3축 자산 분류 모델 (Asset Identity)
 */

import type { AssetType, BuildingUse, InvestmentPosture } from './enums';

/**
 * 자산 정체성 (Asset Identity)
 * 3축으로 정의되는 자산의 근본적인 성격
 */
export interface AssetIdentity {
  /**
   * 건축물 용도 (나대지의 경우 null)
   */
  buildingUse: BuildingUse | null;
  /**
   * 자산 유형 (시장 관례적 분류)
   */
  assetType: AssetType;
  /**
   * 투자 자세 (투자/운영/개발 등 의도)
   */
  investmentPosture: InvestmentPosture;
}

/**
 * 용도별 법적 근거 판별
 * @param use 판별할 건물 용도
 * @returns 주거용, 상업용, 모호함, 해당없음 중 하나
 */
export function legalBasisOf(use: BuildingUse | null): 'commercial' | 'residential' | 'ambiguous' | 'not_applicable' {
  if (use === null) {
    return 'not_applicable';
  }
  if (use === 'house_single' || use === 'house_multi') {
    return 'residential';
  }
  if (use === 'office') {
    return 'ambiguous';
  }
  return 'commercial';
}

export type ValidationStatus = 'normal' | 'caution' | 'blocked';

/**
 * 자산 유형과 투자 자세 조합의 검증 결과
 */
export interface CombinationResult {
  status: ValidationStatus;
  message?: string;
}

/**
 * 자산 유형(AssetType)과 투자 관점(InvestmentPosture) 간의 17×5 조합 매트릭스
 * 정본: CATALOG_ASSET_TYPES.md §4
 */
const COMBINATION_MATRIX: Record<AssetType, Record<InvestmentPosture, ValidationStatus>> = {
  nbhd_building:      { income: 'normal',  owner_occupied: 'normal',  development: 'normal',  operating: 'blocked', trading: 'caution' },
  office_building:     { income: 'normal',  owner_occupied: 'normal',  development: 'normal',  operating: 'blocked', trading: 'caution' },
  mixed_shop_house:    { income: 'normal',  owner_occupied: 'caution', development: 'normal',  operating: 'blocked', trading: 'caution' },
  multi_household:     { income: 'normal',  owner_occupied: 'blocked', development: 'normal',  operating: 'blocked', trading: 'caution' },
  multi_family:        { income: 'normal',  owner_occupied: 'blocked', development: 'caution', operating: 'blocked', trading: 'normal'  },
  officetel:           { income: 'normal',  owner_occupied: 'caution', development: 'blocked', operating: 'blocked', trading: 'normal'  },
  knowledge_center:    { income: 'normal',  owner_occupied: 'normal',  development: 'blocked', operating: 'blocked', trading: 'caution' },
  retail_strip:        { income: 'normal',  owner_occupied: 'caution', development: 'caution', operating: 'blocked', trading: 'normal'  },
  hotel:               { income: 'caution', owner_occupied: 'blocked', development: 'normal',  operating: 'normal',  trading: 'caution' },
  serviced_residence:  { income: 'caution', owner_occupied: 'blocked', development: 'caution', operating: 'normal',  trading: 'normal'  },
  logistics:           { income: 'normal',  owner_occupied: 'normal',  development: 'normal',  operating: 'caution', trading: 'caution' },
  factory_building:    { income: 'normal',  owner_occupied: 'normal',  development: 'normal',  operating: 'blocked', trading: 'caution' },
  medical_facility:    { income: 'normal',  owner_occupied: 'normal',  development: 'caution', operating: 'normal',  trading: 'blocked' },
  education_facility:  { income: 'normal',  owner_occupied: 'normal',  development: 'caution', operating: 'blocked', trading: 'blocked' },
  bare_land:           { income: 'blocked', owner_occupied: 'blocked', development: 'normal',  operating: 'blocked', trading: 'normal'  },
  raw_land:            { income: 'blocked', owner_occupied: 'blocked', development: 'caution', operating: 'blocked', trading: 'normal'  },
  special_use:         { income: 'normal',  owner_occupied: 'caution', development: 'caution', operating: 'normal',  trading: 'caution' },
};

/**
 * 막힌 조합(blocked)에 대한 주요 사유
 */
const BLOCKED_REASONS: Record<string, string> = {
  'bare_land:income': '임대차가 존재하지 않음',
  'bare_land:owner_occupied': '자가 사용 불가',
  'multi_household:owner_occupied': '원룸 건물을 사옥으로 쓸 수 없음',
  'hotel:owner_occupied': '자가 숙박은 성립하지 않음',
  'officetel:development': '집합건물 — 전 소유자 동의 없이 개발 불가',
  'medical_facility:trading': '인허가 승계 문제로 단기 매매 부적합',
  'education_facility:trading': '인허가 승계 문제로 단기 매매 부적합',
};

/**
 * 주의가 필요한 조합(caution)에 대한 주요 메모
 */
const CAUTION_NOTES: Record<string, string> = {
  'office_building:trading': '단기 매매 목적이면 비교사례 회전율을 확인하십시오',
  'hotel:income': '호텔은 일반적으로 운영형이며, 임대차 운영인지 확인이 필요합니다',
  'officetel:owner_occupied': '주거용 사용 시 주택임대차보호법 적용 확인 필요',
};

/**
 * 자산 유형과 투자 자세 조합이 유효한지 검증합니다.
 * @param t 자산 유형
 * @param p 투자 자세
 * @returns 조합 검증 결과
 */
export function validateCombination(t: AssetType, p: InvestmentPosture): CombinationResult {
  const status = COMBINATION_MATRIX[t]?.[p] ?? 'blocked';
  const key = `${t}:${p}`;
  
  if (status === 'blocked') {
    return {
      status,
      message: BLOCKED_REASONS[key] ?? '유효하지 않은 조합'
    };
  }
  
  if (status === 'caution') {
    return {
      status,
      message: CAUTION_NOTES[key] ?? '비일반적 조합 — 중개인 확인 필요'
    };
  }
  
  return { status };
}

/**
 * v0.2에서 v0.4 모델로의 자산 유형 마이그레이션 매핑
 */
export const ASSET_TYPE_MIGRATION: Record<string, AssetType> = {
  office: 'office_building',
  retail: 'nbhd_building',
  logistics: 'logistics',
  residential: 'multi_household',
  mixed_use: 'mixed_shop_house',
  land: 'bare_land',
  hotel: 'hotel',
  industrial: 'factory_building',
};

/**
 * 자산 유형별 필수 팩 슬롯 그룹 매핑
 */
export const REQUIRED_PACKS: Record<AssetType, string[]> = {
  nbhd_building: [],
  office_building: [],
  mixed_shop_house: ['residential_spec'],
  multi_household: ['residential_spec'],
  multi_family: ['residential_spec', 'sectional_spec'],
  officetel: ['residential_spec', 'sectional_spec'],
  knowledge_center: ['sectional_spec', 'physical_spec'],
  retail_strip: ['sectional_spec'],
  hotel: ['hospitality_spec'],
  serviced_residence: ['hospitality_spec', 'sectional_spec'],
  logistics: ['physical_spec'],
  factory_building: ['physical_spec'],
  medical_facility: ['physical_spec'],
  education_facility: [],
  bare_land: ['development_plan', 'permit_risk'],
  raw_land: ['development_plan', 'permit_risk'],
  special_use: ['physical_spec'],
};
