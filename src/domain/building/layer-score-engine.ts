/**
 * @module LayerScoreEngine
 * @description CREDEAL v3 Document Completeness Scoring Engine
 * 
 * Computes a readiness score out of 100 based on the presence of various
 * CRE property documents across 10 categories. Maps score thresholds to eligible outputs.
 * @see SDD §4 S1-T2 Document completeness scoring
 */
import { LayerScores } from '@/types/database';

/**
 * Pre-defined weights for each document category.
 * The total weight sums up to 100 for a perfect completeness score.
 */
export const LAYER_WEIGHTS = {
  building_register:  20,
  registry_docs:      15,
  land_use_plan:      10,
  rent_roll:          25,
  photos:             10,
  floor_plan:         10,
  repair_history:     5,
  vacancy_docs:       5,
  asking_price:       5,
  disclosure_policy:  5,
} as const;

/**
 * Input format for the document completeness checklist.
 * True indicates the document or information is present.
 */
export interface ChecklistInput {
  /** 건축물대장 (Building Register) presence */
  buildingRegister?: boolean;
  /** 건축물대장 발급일자 (ISO Date string, e.g. "2026-05-01") */
  buildingRegisterDate?: string;
  /** 등기부등본 (Registry Documents) presence */
  registry?: boolean;
  /** 등기부등본 발급일자 */
  registryDate?: string;
  /** 토지이용계획 (Land Use Plan) presence */
  landUsePlan?: boolean;
  /** 렌트롤 (Rent Roll) presence */
  rentRoll?: boolean;
  /** 렌트롤 작성일자 */
  rentRollDate?: string;
  /** 사진 (Photos) presence */
  photos?: boolean;
  /** 도면 (Floor Plan) presence */
  floorPlan?: boolean;
  /** 수선이력 (Repair History) presence */
  repairHistory?: boolean;
  /** 공실현황 (Vacancy Status documents) presence */
  vacancyStatus?: boolean;
  /** 호가 (Asking Price/Offer) presence */
  askingPrice?: boolean;
  /** 정보공개정책 (Disclosure Policy) presence */
  disclosurePolicy?: boolean;
}

/**
 * 문서 신선도 감쇠 계수를 산출합니다. (0.0 ~ 1.0)
 * 유효기간 경과 시 점수 감쇠 적용.
 */
export function computeFreshnessFactor(dateStr?: string, maxAgeMonths: number = 6): number {
  if (!dateStr) return 1.0;
  const docDate = new Date(dateStr);
  if (isNaN(docDate.getTime())) return 1.0;
  const now = new Date();
  const diffMonths = (now.getFullYear() - docDate.getFullYear()) * 12 + (now.getMonth() - docDate.getMonth());
  if (diffMonths <= 0) return 1.0;
  if (diffMonths >= maxAgeMonths) return 0.5; // 경과 시 50% 감쇠
  return Math.max(0.5, 1 - (diffMonths / maxAgeMonths) * 0.5);
}

/**
 * Computes the layer score based on the provided document checklist.
 * Sums the configured weights for each present document, capping at 100.
 * 
 * @param {ChecklistInput} checklist - The boolean checklist indicating which documents are present.
 * @returns {LayerScores} An object containing the breakdown of scores per layer and the total score.
 * @example
 * const score = computeLayerScore({ buildingRegister: true, registry: true });
 * // score.total === 35
 */
export function computeLayerScore(checklist: ChecklistInput): LayerScores {
  const building_register = checklist.buildingRegister
    ? Math.round(LAYER_WEIGHTS.building_register * computeFreshnessFactor(checklist.buildingRegisterDate, 12))
    : 0;
  const registry_docs = checklist.registry
    ? Math.round(LAYER_WEIGHTS.registry_docs * computeFreshnessFactor(checklist.registryDate, 3))
    : 0;
  const land_use_plan = checklist.landUsePlan ? LAYER_WEIGHTS.land_use_plan : 0;
  const rent_roll = checklist.rentRoll
    ? Math.round(LAYER_WEIGHTS.rent_roll * computeFreshnessFactor(checklist.rentRollDate, 6))
    : 0;
  const photos = checklist.photos ? LAYER_WEIGHTS.photos : 0;
  const floor_plan = checklist.floorPlan ? LAYER_WEIGHTS.floor_plan : 0;
  const repair_history = checklist.repairHistory ? LAYER_WEIGHTS.repair_history : 0;
  const vacancy_docs = checklist.vacancyStatus ? LAYER_WEIGHTS.vacancy_docs : 0;
  const asking_price = checklist.askingPrice ? LAYER_WEIGHTS.asking_price : 0;
  const disclosure_policy = checklist.disclosurePolicy ? LAYER_WEIGHTS.disclosure_policy : 0;

  const rawSum =
    building_register +
    registry_docs +
    land_use_plan +
    rent_roll +
    photos +
    floor_plan +
    repair_history +
    vacancy_docs +
    asking_price +
    disclosure_policy;

  const total = Math.min(100, rawSum);

  return {
    building_register,
    registry_docs,
    land_use_plan,
    rent_roll,
    photos,
    floor_plan,
    repair_history,
    vacancy_docs,
    asking_price,
    disclosure_policy,
    total,
  };
}

/**
 * Determines which types of outputs (e.g., reports, IMs) the asset is eligible for
 * based on its total completeness score.
 * 
 * @param {number} score - The computed total layer score (0-100).
 * @returns {string[]} An array of eligible output identifiers.
 * @example
 * const eligible = getEligibleOutputs(65);
 * // returns ['deal_curiosity_report', 'blind_teaser', 'building_snapshot_draft']
 */
export function getEligibleOutputs(score: number): string[] {
  const outputs: string[] = [];
  if (score >= 20) outputs.push('deal_curiosity_report');
  if (score >= 40) outputs.push('blind_teaser');
  if (score >= 60) outputs.push('building_snapshot_draft');
  if (score >= 80) outputs.push('im_lite');
  if (score === 100) outputs.push('full_im_candidate');
  return outputs;
}
