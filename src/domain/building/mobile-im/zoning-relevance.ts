export type BuyerPurpose = 'self_use' | 'rental_income' | 'value_add' | 'development' | 'allocation';

export interface ZoningItem {
  category: 'use_area' | 'use_district' | 'use_zone' | 'other_law';
  name: string;
  relevance: Record<BuyerPurpose, 'high' | 'medium' | 'low'>;
  impactNote: string | null;
}

export interface ZoningFilterResult {
  mainItems: ZoningItem[];     // high
  foldedItems: ZoningItem[];   // medium
  appendixItems: ZoningItem[]; // low
}

export function filterZoningByPurpose(
  items: ZoningItem[],
  purpose: BuyerPurpose,
): ZoningFilterResult {
  const mainItems = items.filter(i => i.relevance[purpose] === 'high');
  const foldedItems = items.filter(i => i.relevance[purpose] === 'medium');
  const appendixItems = items.filter(i => i.relevance[purpose] === 'low');
  return { mainItems, foldedItems, appendixItems };
}
