import { describe, it, expect } from 'vitest';
import { computeEnsembleScore, scoreToGrade } from '../matching-engine';
import { PURPOSE_WEIGHTS } from '../matching-types';

describe('Matching Engine Buyer Temperature Adjustment', () => {
  const dummyBuilding = {
    areaSignal: '강남',
    assetType: '꼬마빌딩',
    priceBand: '50억',
    fitSummary: '임대수익 안정적',
    cautionSummary: '특이사항 없음',
    dealCuriosityScore: 80,
  };

  const baseIntent = {
    buyerType: 'investor',
    budgetRange: { min: 400000, max: 600000, display: '40억~60억' },
    preferredRegions: ['강남'],
    assetTypes: ['꼬마빌딩'],
    purchasePurpose: '임대수익',
    mustHave: [],
    niceToHave: [],
    riskTolerance: 'moderate',
  };

  it('should boost score by +5 for hot buyer temperature (>= 80)', () => {
    const baseScore = computeEnsembleScore({
      similarity: 0.8,
      dealCuriosityScore: 80,
      building: dummyBuilding,
      intent: baseIntent,
      purposeWeights: PURPOSE_WEIGHTS.income,
    });

    const hotScore = computeEnsembleScore({
      similarity: 0.8,
      dealCuriosityScore: 80,
      building: dummyBuilding,
      intent: baseIntent,
      purposeWeights: PURPOSE_WEIGHTS.income,
      buyerTemperatureScore: 85,
    });

    expect(hotScore).toBe(Math.min(baseScore + 5, 100));
  });

  it('should boost score by +2 for interested buyer temperature (>= 60)', () => {
    const baseScore = computeEnsembleScore({
      similarity: 0.8,
      dealCuriosityScore: 80,
      building: dummyBuilding,
      intent: baseIntent,
      purposeWeights: PURPOSE_WEIGHTS.income,
    });

    const warmScore = computeEnsembleScore({
      similarity: 0.8,
      dealCuriosityScore: 80,
      building: dummyBuilding,
      intent: baseIntent,
      purposeWeights: PURPOSE_WEIGHTS.income,
      buyerTemperatureScore: 65,
    });

    expect(warmScore).toBe(Math.min(baseScore + 2, 100));
  });

  it('should penalize cold buyer temperature (< 20) by -3', () => {
    const baseScore = computeEnsembleScore({
      similarity: 0.8,
      dealCuriosityScore: 80,
      building: dummyBuilding,
      intent: baseIntent,
      purposeWeights: PURPOSE_WEIGHTS.income,
    });

    const coldScore = computeEnsembleScore({
      similarity: 0.8,
      dealCuriosityScore: 80,
      building: dummyBuilding,
      intent: baseIntent,
      purposeWeights: PURPOSE_WEIGHTS.income,
      buyerTemperatureScore: 10,
    });

    expect(coldScore).toBe(Math.max(baseScore - 3, 0));
  });
});
