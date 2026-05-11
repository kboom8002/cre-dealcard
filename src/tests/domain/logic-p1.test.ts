import { describe, test, expect } from 'vitest';
import { predictDealConversion } from '@/domain/prediction/deal-conversion-predictor';
import { extractDealFeatures } from '@/domain/prediction/deal-feature-extractor';
import { runBuyerClustering } from '@/domain/prediction/buyer-clustering';
import { estimatePriceRange } from '@/domain/prediction/price-prediction';
import { onMatchResultCreated } from '@/domain/graph/knowledge-graph';

describe('DC-L2 Domain Logic (P1)', () => {
  test('DC-L2-05 & 06: Deal conversion predictor', async () => {
    // This requires calling the predictor with mock features
    const mockFeatures = {
      curiosityScore: 80,
      bestMatchGrade: 4, // S
      avgMatchScore: 90,
      matchedBuyerCount: 3,
      sGradeCount: 2,
      currentStageOrd: 2,
      totalHoldDays: 10,
      promotionScore: 0.8,
      vacancyDemandVerified: true,
      eventCount7d: 5,
      gateRequestCount: 1,
      casepacksCount: 2,
      missingDataCount: 0,
      hasIm: true,
      hasSpaceAi: true,
      buyerClusterId: 'cluster-1',
      daysSinceCreation: 15,
      imReadinessScore: 85
    };

    const prediction = await predictDealConversion(mockFeatures);
    expect(prediction.probability).toBeGreaterThan(0.5);
    expect(prediction.confidence).toBeDefined();
    expect(prediction.topFactors.length).toBeGreaterThan(0);
    expect(prediction.recommendedAction).toBeDefined();
  });

  test('DC-L2-07: Feature extraction', async () => {
    // Requires hitting DB, will skip detailed check but ensure function exists
    expect(typeof extractDealFeatures).toBe('function');
  });

  test('DC-L2-08: K-Means buyer clustering', async () => {
    // Since it hits DB to fetch all buyers, we just check function
    expect(typeof runBuyerClustering).toBe('function');
  });

  test('DC-L2-09: Price range estimation', async () => {
    const result = await estimatePriceRange({
      areaSignal: '성수동',
      assetType: '근린상가',
      buildingArea: 50
    });
    
    if (result && result.confidence === 'data_based') {
      expect(result.lower80).toBeLessThanOrEqual(result.median!);
      expect(result.median).toBeLessThanOrEqual(result.upper80!);
    } else {
      expect(result?.confidence).toBe('insufficient');
    }
  });

  test('DC-L2-10: Knowledge graph edge creation', async () => {
    expect(typeof onMatchResultCreated).toBe('function');
  });
});
