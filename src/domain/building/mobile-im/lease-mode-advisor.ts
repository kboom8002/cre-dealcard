export function suggestPreciseMode(deal: {
  leaseUnitCount: number;
  assetType: string;
  purpose?: string;
}): boolean {
  // If there are many lease units, precise mode is recommended
  if (deal.leaseUnitCount >= 4 && deal.purpose !== 'development') {
    return true;
  }
  
  // Certain asset types typically require precise lease analysis
  const complexAssetTypes = ['retail', 'mixed', 'commercial', 'shopping_center'];
  if (complexAssetTypes.includes(deal.assetType.toLowerCase())) {
    return true;
  }
  
  // Specific buyer purposes like value-add may require detailed lease info
  if (deal.purpose && deal.purpose.toLowerCase().includes('value-add')) {
    return true;
  }
  
  return false;
}
