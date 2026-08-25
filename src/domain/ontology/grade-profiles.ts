/**
 * @file grade-profiles.ts
 * @description ONTOLOGY_V0.4_SPEC.md §6 및 CATALOG_ASSET_TYPES.md §6에 기반한 2-Tier 등급 프로파일 시스템
 */

import type { AssetType, InvestmentPosture } from './enums';

/** 슬롯군 필요도 등급 */
export type SlotGroupNeed = 'required' | 'important' | 'optional' | 'not_applicable';

/** 자산군별 기본 가중치 프로파일 */
export const BASE_PROFILE: Record<string, Record<string, number>> = {
  nbhd_building: {
    building_basic: 15, land_parcel: 15, zoning: 10, road_access: 5, lease_roll: 25, financial_input: 15, title_encumbrance: 10, market_comp: 5, pack: 0
  },
  office_building: {
    building_basic: 15, land_parcel: 15, zoning: 10, road_access: 5, lease_roll: 25, financial_input: 15, title_encumbrance: 10, market_comp: 5, pack: 0
  },
  multi_household: {
    building_basic: 15, land_parcel: 10, zoning: 5, road_access: 5, lease_roll: 20, financial_input: 15, title_encumbrance: 10, market_comp: 5, pack: 15
  },
  officetel: {
    building_basic: 10, land_parcel: 5, zoning: 5, road_access: 5, lease_roll: 25, financial_input: 15, title_encumbrance: 10, market_comp: 10, pack: 15
  },
  knowledge_center: {
    building_basic: 15, land_parcel: 5, zoning: 5, road_access: 5, lease_roll: 20, financial_input: 15, title_encumbrance: 10, market_comp: 10, pack: 15
  },
  hotel: {
    building_basic: 15, land_parcel: 15, zoning: 10, road_access: 5, lease_roll: 0, financial_input: 15, title_encumbrance: 10, market_comp: 0, pack: 30
  },
  logistics: {
    building_basic: 15, land_parcel: 15, zoning: 10, road_access: 10, lease_roll: 15, financial_input: 15, title_encumbrance: 10, market_comp: 0, pack: 10
  },
  bare_land: {
    building_basic: 0, land_parcel: 30, zoning: 30, road_access: 10, lease_roll: 0, financial_input: 0, title_encumbrance: 5, market_comp: 10, pack: 15
  },
  raw_land: {
    building_basic: 0, land_parcel: 30, zoning: 30, road_access: 10, lease_roll: 0, financial_input: 0, title_encumbrance: 5, market_comp: 10, pack: 15
  }
};

/** 투자 관점에 따른 가중치 보정값 */
export interface PostureAdjustment {
  /** 슬롯군 가중치 곱셈 보정 */
  multipliers: Record<string, number>;
  /** 슬롯군 가중치 덧셈 보정 (팩 슬롯군 중심) */
  additions: Record<string, number>;
}

export const POSTURE_ADJUSTMENT: Record<InvestmentPosture, PostureAdjustment> = {
  income: {
    multipliers: { lease_roll: 1.0, financial_input: 1.0 },
    additions: {}
  },
  owner_occupied: {
    multipliers: { lease_roll: 0.2, physical_spec: 1.5 },
    additions: { occupancy_plan: 15 }
  },
  development: {
    multipliers: { lease_roll: 0.4 },
    additions: { development_plan: 20, vacate_plan: 10, permit_risk: 10 }
  },
  operating: {
    multipliers: { lease_roll: 0.0 },
    additions: { hospitality_spec: 30 }
  },
  trading: {
    multipliers: { market_comp: 2.0, lease_roll: 0.3 },
    additions: {}
  }
};

/**
 * 실효 가중치 프로파일을 계산합니다.
 * @param assetType 시장 유형
 * @param posture 투자 관점
 */
export function gradeProfile(assetType: AssetType, posture: InvestmentPosture): Record<string, number> {
  const base = BASE_PROFILE[assetType] || BASE_PROFILE['nbhd_building'];
  const adj = POSTURE_ADJUSTMENT[posture];
  
  const profile: Record<string, number> = { ...base };
  
  if (adj.multipliers) {
    for (const [key, mult] of Object.entries(adj.multipliers)) {
      profile[key] = (profile[key] || 0) * mult;
    }
  }
  
  if (adj.additions) {
    for (const [key, add] of Object.entries(adj.additions)) {
      profile[key] = (profile[key] || 0) + add;
    }
  }

  const sum = Object.values(profile).reduce((acc, val) => acc + val, 0);
  if (sum === 0) return profile;

  // 100점 만점으로 정규화
  const normalized: Record<string, number> = {};
  for (const [key, val] of Object.entries(profile)) {
    normalized[key] = parseFloat(((val / sum) * 100).toFixed(2));
  }
  
  return normalized;
}

/**
 * 해당 없음(notApplicable) 항목을 제외하고 가중치를 재배분합니다.
 */
export function effectiveWeights(
  profile: Record<string, number>,
  notApplicable: string[],
): Record<string, number> {
  const active = Object.fromEntries(
    Object.entries(profile).filter(([k]) => !notApplicable.includes(k)));
  const total = Object.values(active).reduce((a, b) => a + b, 0);
  if (total === 0) return active;
  
  const scale = 100 / total;
  return Object.fromEntries(
    Object.entries(active).map(([k, v]) => [k, parseFloat((v * scale).toFixed(2))]));
}

type ColumnKey = 'income' | 'owner_occupied' | 'development' | 'land' | 'logistics';

const NEEDS_TABLE: Record<string, Record<ColumnKey, SlotGroupNeed>> = {
  land_parcel: { income: 'important', owner_occupied: 'important', development: 'required', land: 'required', logistics: 'important' },
  building_basic: { income: 'required', owner_occupied: 'required', development: 'important', land: 'not_applicable', logistics: 'required' },
  zoning: { income: 'important', owner_occupied: 'important', development: 'required', land: 'required', logistics: 'important' },
  road_access: { income: 'important', owner_occupied: 'required', development: 'important', land: 'required', logistics: 'required' },
  lease_roll: { income: 'required', owner_occupied: 'optional', development: 'optional', land: 'not_applicable', logistics: 'required' },
  lease_legal: { income: 'required', owner_occupied: 'optional', development: 'required', land: 'not_applicable', logistics: 'required' },
  financial_input: { income: 'required', owner_occupied: 'important', development: 'important', land: 'not_applicable', logistics: 'required' },
  title_encumbrance: { income: 'important', owner_occupied: 'important', development: 'important', land: 'important', logistics: 'important' },
  market_comp: { income: 'important', owner_occupied: 'important', development: 'required', land: 'required', logistics: 'important' },
  physical_spec: { income: 'optional', owner_occupied: 'required', development: 'not_applicable', land: 'not_applicable', logistics: 'required' },
  development_plan: { income: 'optional', owner_occupied: 'not_applicable', development: 'required', land: 'required', logistics: 'not_applicable' },
  vacate_plan: { income: 'optional', owner_occupied: 'optional', development: 'required', land: 'not_applicable', logistics: 'optional' },
  occupancy_plan: { income: 'not_applicable', owner_occupied: 'required', development: 'not_applicable', land: 'not_applicable', logistics: 'not_applicable' },
  permit_risk: { income: 'not_applicable', owner_occupied: 'not_applicable', development: 'required', land: 'required', logistics: 'optional' }
};

/**
 * 특정 자산군/관점에서의 슬롯군별 필요도를 산출합니다.
 */
export function getSlotGroupNeeds(assetType: AssetType, posture: InvestmentPosture): Record<string, SlotGroupNeed> {
  let col: ColumnKey = 'income'; // 기본값 설정
  
  if (assetType === 'bare_land' || assetType === 'raw_land') {
    col = 'land';
  } else if (assetType === 'logistics') {
    col = 'logistics';
  } else if (posture === 'owner_occupied' || posture === 'development' || posture === 'income') {
    col = posture;
  }
  
  const result: Record<string, SlotGroupNeed> = {};
  for (const [group, needs] of Object.entries(NEEDS_TABLE)) {
    result[group] = needs[col];
  }
  return result;
}

/** 등급 임계치 정의 */
export const GRADE_THRESHOLDS = { A: 85, B: 65, C: 40 } as const;

/**
 * 점수를 등급(A/B/C/D)으로 변환합니다.
 */
export function scoreToGrade(score: number): 'A' | 'B' | 'C' | 'D' {
  if (score >= 85) return 'A';
  if (score >= 65) return 'B';
  if (score >= 40) return 'C';
  return 'D';
}

// E-4/E-5: P축(물건 해상도) 가중치 — 전 포스처 공통, 합 50
export const P_WEIGHTS: Record<string, number> = {
  land_parcel: 12,
  building_basic: 12,
  zoning: 10,
  road_access: 8,
  title_encumbrance: 8,
};

// E-4/E-5: L축(리드 해상도) 가중치 — 포스처별, 합 50
export const L_WEIGHTS: Record<string, Record<string, number>> = {
  income: { lease_roll: 30, financial_input: 20 },
  operating: { operating_performance: 25, hospitality_spec: 10, financial_input: 15 },
  development: { development_plan: 20, vacate_plan: 15, permit_risk: 15 },
  owner_occupied: { occupancy_plan: 25, physical_spec: 25 },
  trading: { market_comp: 25, holding_history: 25 },
};

