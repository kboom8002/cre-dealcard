/**
 * @module ReidentSimulator
 * @description K-Anonymity re-identification risk simulator.
 * Checks if banded teaser data can be reverse-engineered to identify the property.
 * @see docs/credal_v3/specs/teaser.md, src/domain/guardrails/k-anonymity.ts
 */

import { bandPrice, bandArea } from './banding';

export interface ReidentResult {
  candidateCount: number;
  kThreshold: number;
  passed: boolean;
  riskLevel: 'low' | 'medium' | 'high';
  suggestion?: string;
}

/** High-density districts requiring K=30 */
const HIGH_DENSITY_DISTRICTS = [
  '강남구', '서초구', '송파구', '성동구', '마포구', '용산구',
  '영등포구', '종로구', '중구',
];

/**
 * Simulates re-identification risk by estimating how many similar properties
 * exist in public databases within the banded parameters.
 * 
 * Currently uses heuristic estimation. Future: actual DB query against
 * 건축물대장 목록 조회 API.
 */
export async function simulateReidentification(
  attrs: Record<string, unknown>,
  district: string
): Promise<ReidentResult> {
  const kThreshold = HIGH_DENSITY_DISTRICTS.includes(district) ? 30 : 20;

  // Heuristic estimation based on band width and district density
  const price = Number(attrs.askingPriceKrw || 0);
  const area = Number(attrs.totalFloorAreaPyung || 0);
  const assetType = String(attrs.assetType || '');

  // Base candidate count estimation (heuristic)
  let estimatedCandidates = 50; // default for medium districts

  if (HIGH_DENSITY_DISTRICTS.includes(district)) {
    estimatedCandidates = 120; // dense areas have more properties
  }

  // Narrow bands reduce candidates
  if (price > 100_0000_0000) estimatedCandidates = Math.round(estimatedCandidates * 0.3);
  if (price > 50_0000_0000) estimatedCandidates = Math.round(estimatedCandidates * 0.5);
  if (area > 500) estimatedCandidates = Math.round(estimatedCandidates * 0.4);
  if (assetType === 'hotel' || assetType === 'industrial') {
    estimatedCandidates = Math.round(estimatedCandidates * 0.3);
  }

  const passed = estimatedCandidates >= kThreshold;
  const riskLevel = estimatedCandidates >= kThreshold * 2 ? 'low'
    : estimatedCandidates >= kThreshold ? 'medium' : 'high';

  let suggestion: string | undefined;
  if (!passed) {
    suggestion = `후보 건물 수(${estimatedCandidates}건)가 K 임계값(${kThreshold})에 미달합니다. `
      + `면적 밴드를 넓히거나(현재: ${bandArea(area)}), `
      + `가격 밴드를 확대(현재: ${bandPrice(price)})해 주세요.`;
  }

  return {
    candidateCount: estimatedCandidates,
    kThreshold,
    passed,
    riskLevel,
    suggestion,
  };
}
