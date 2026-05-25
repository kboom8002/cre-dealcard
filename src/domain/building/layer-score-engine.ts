import { LayerScores } from '@/types/database';

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

export interface ChecklistInput {
  buildingRegister?: boolean;
  registry?: boolean;
  landUsePlan?: boolean;
  rentRoll?: boolean;
  photos?: boolean;
  floorPlan?: boolean;
  repairHistory?: boolean;
  vacancyStatus?: boolean;
  askingPrice?: boolean;
  disclosurePolicy?: boolean;
}

export function computeLayerScore(checklist: ChecklistInput): LayerScores {
  const building_register = checklist.buildingRegister ? LAYER_WEIGHTS.building_register : 0;
  const registry_docs = checklist.registry ? LAYER_WEIGHTS.registry_docs : 0;
  const land_use_plan = checklist.landUsePlan ? LAYER_WEIGHTS.land_use_plan : 0;
  const rent_roll = checklist.rentRoll ? LAYER_WEIGHTS.rent_roll : 0;
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

export function getEligibleOutputs(score: number): string[] {
  const outputs: string[] = [];
  if (score >= 20) outputs.push('deal_curiosity_report');
  if (score >= 40) outputs.push('blind_teaser');
  if (score >= 60) outputs.push('building_snapshot_draft');
  if (score >= 80) outputs.push('im_lite');
  if (score === 100) outputs.push('full_im_candidate');
  return outputs;
}
