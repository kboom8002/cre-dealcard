/**
 * Matching Engine Types — Phase 1 ①
 * JS-Oracle 3-Stage pipeline ported to cre-dealcard
 */

export type MatchGrade = 'S' | 'A' | 'B' | 'C';
export type WeightProfile = '사옥' | '투자' | '증여' | 'default';

export interface MatchInput {
  buildingSsotLiteId: string;
  buyerIntentLiteId: string;
  brokerId: string;
  building: {
    areaSignal: string;
    assetType: string;
    priceBand: string | null;
    vacancySignal: string | null;
    fitSummary: string;
    cautionSummary: string;
    dealCuriosityScore?: number;
  };
  intent: {
    buyerType: string;
    budgetRange: { min: number | null; max: number | null; display: string };
    preferredRegions: string[];
    assetTypes: string[];
    purchasePurpose: string;
    mustHave: string[];
    niceToHave: string[];
    riskTolerance: string;
    inferredPurpose?: string;
    recommendedWeightProfile?: string;
  };
}

export interface MatchResult {
  grade: MatchGrade;
  score: number;
  stage1Passed: boolean;
  stage2Similarity: number;
  stage3Score: number;
  reasoning: string;
  purposeWeightProfile: WeightProfile;
}

export interface Stage1Result {
  passed: boolean;
  failReasons: string[];
}

// Purpose weights: market(시장), financial(재무), vacancy(공실), semantic(시맨틱)
export const PURPOSE_WEIGHTS: Record<WeightProfile, Record<string, number>> = {
  '사옥':   { market: 0.35, financial: 0.25, vacancy: 0.15, semantic: 0.25 },
  '투자':   { market: 0.20, financial: 0.40, vacancy: 0.15, semantic: 0.25 },
  '증여':   { market: 0.10, financial: 0.15, vacancy: 0.00, semantic: 0.25, tax: 0.50 },
  'default':{ market: 0.25, financial: 0.30, vacancy: 0.20, semantic: 0.25 },
};
