import { LayerCategory } from '@/types/database';
import { LAYER_WEIGHTS } from './layer-score-engine';

export function computeCompletenessAfterUpload(
  currentScore: number,
  category: LayerCategory,
  uploadedCategories: string[],
): number {
  if (uploadedCategories.includes(category)) {
    return currentScore;
  }

  // Find the score weight for this category
  let weight = 0;
  if (category === 'building_register') weight = LAYER_WEIGHTS.building_register;
  else if (category === 'registry_docs') weight = LAYER_WEIGHTS.registry_docs;
  else if (category === 'land_use_plan') weight = LAYER_WEIGHTS.land_use_plan;
  else if (category === 'rent_roll') weight = LAYER_WEIGHTS.rent_roll;
  else if (category === 'photos') weight = LAYER_WEIGHTS.photos;
  else if (category === 'floor_plan') weight = LAYER_WEIGHTS.floor_plan;
  else if (category === 'repair_history') weight = LAYER_WEIGHTS.repair_history;
  else if (category === 'vacancy_docs') weight = LAYER_WEIGHTS.vacancy_docs;
  else if (category === 'asking_price') weight = LAYER_WEIGHTS.asking_price;
  else if (category === 'disclosure_policy') weight = LAYER_WEIGHTS.disclosure_policy;

  return Math.min(100, currentScore + weight);
}
