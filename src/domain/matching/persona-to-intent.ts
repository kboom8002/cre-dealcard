import type { BuyerPersona } from '@/ai/schemas/ideal-buyer-persona';

export interface VirtualBuyerIntent {
  buyerType: string;
  budgetRange: { min: number | null; max: number | null; display: string };
  preferredRegions: string[];
  assetTypes: string[];
  purchasePurpose: string;
  investmentPosture?: string;
  mustHave: string[];
  niceToHave: string[];
  riskTolerance: string;
  inferredPurpose?: string;
  isVirtual: true;
  sourcePersonaLabel: string;
}

export function personaToVirtualIntent(
  persona: BuyerPersona,
  areaSignal: string,
  assetType: string
): VirtualBuyerIntent {
  return {
    buyerType: persona.buyerType,
    budgetRange: parseBudgetRangeDisplay(persona.budgetRange),
    preferredRegions: [areaSignal].filter(Boolean),
    assetTypes: [assetType].filter(Boolean),
    purchasePurpose: persona.motivation,
    investmentPosture: persona.purposeProfile,
    mustHave: persona.coreNeeds.slice(0, 3),
    niceToHave: persona.coreNeeds.slice(3),
    riskTolerance: 'moderate',
    inferredPurpose: persona.label,
    isVirtual: true,
    sourcePersonaLabel: persona.label,
  };
}

function parseBudgetRangeDisplay(display: string): { min: number | null; max: number | null; display: string } {
  const numbers = display.match(/\d+(?:\.\d+)?/g);
  if (!numbers) {
    return { min: null, max: null, display };
  }

  if (numbers.length >= 2) {
    const min = parseFloat(numbers[0]) * 100_000_000;
    const max = parseFloat(numbers[1]) * 100_000_000;
    return { min, max, display };
  } else if (numbers.length === 1) {
    const num = parseFloat(numbers[0]) * 100_000_000;
    return { min: num * 0.8, max: num * 1.2, display };
  }

  return { min: null, max: null, display };
}
