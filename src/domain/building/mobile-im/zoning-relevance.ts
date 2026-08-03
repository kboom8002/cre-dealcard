export type BuyerPurpose = 'development' | 'value-add' | 'core' | 'owner-occupier' | 'investment';

export interface ZoningItem {
  id: string;
  name: string;
  relevance: BuyerPurpose[];
  description?: string;
  isRestrictive?: boolean;
}

export function filterZoningByPurpose(items: ZoningItem[], purpose: BuyerPurpose): ZoningItem[] {
  if (!purpose) {
    return items;
  }
  return items.filter(item => item.relevance.includes(purpose));
}
