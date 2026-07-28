import { describe, it, expect } from 'vitest';
import { classifyAssetPhoto, filterPhotosForTier } from '@/domain/building/photo-classifier';
import { evaluateBrokerGiveToGetAccess, generateCollectiveInsightSummary } from '@/domain/analytics/collective-insights';
import { generateCoBrokerageAgreementTemplate } from '@/domain/handoff/p2p-template';

describe('Photo Auto-Classifier & Safety Guard (Stage 4 - Track MI)', () => {
  it('classifies exterior photo and flags it as restricted for Basic IM', () => {
    const photo = classifyAssetPhoto('p-1', '성수동_건물_외관_전경.jpg');
    expect(photo.category).toBe('exterior_front');
    expect(photo.isPublicSafe).toBe(false);
  });

  it('filters out exterior photos for Basic IM but retains all for Pro IM', () => {
    const photos = [
      classifyAssetPhoto('p-1', '외관_전경.jpg'),
      classifyAssetPhoto('p-2', '사무실_내부.jpg'),
    ];

    const basicPhotos = filterPhotosForTier(photos, 'basic', false);
    expect(basicPhotos.length).toBe(1);
    expect(basicPhotos[0].photoId).toBe('p-2');

    const proPhotos = filterPhotosForTier(photos, 'pro', true);
    expect(proPhotos.length).toBe(2);
  });
});

describe('Give-to-Get Collective Insights (Stage 4 - Track K)', () => {
  it('grants insight access to contributing brokers', () => {
    const status = evaluateBrokerGiveToGetAccess(3);
    expect(status.hasAccessToInsights).toBe(true);
    expect(status.tier).toBe('contributor');
  });

  it('gates statistics if N sample size is less than 5', () => {
    const smallSample = [
      { askingVsClosingGapPct: 4.5 },
      { askingVsClosingGapPct: 5.0 },
    ];
    const summary = generateCollectiveInsightSummary('성동구', smallSample);
    expect(summary.isGatedByNThreshold).toBe(true);
    expect(summary.avgAskingVsClosingGapPct).toBeNull();
  });

  it('computes collective insights when sample size N >= 5', () => {
    const sample = [
      { askingVsClosingGapPct: 5.0, falloutReason: 'loan_rejected' },
      { askingVsClosingGapPct: 4.0, falloutReason: 'price_too_high' },
      { askingVsClosingGapPct: 6.0, falloutReason: 'loan_rejected' },
      { askingVsClosingGapPct: 5.0, falloutReason: 'loan_rejected' },
      { askingVsClosingGapPct: 5.0, falloutReason: 'eviction_difficult' },
    ];
    const summary = generateCollectiveInsightSummary('성동구', sample);
    expect(summary.isGatedByNThreshold).toBe(false);
    expect(summary.avgAskingVsClosingGapPct).toBe(5.0);
    expect(summary.topFalloutReasons[0].reasonCode).toBe('loan_rejected');
  });
});

describe('P2P Agreement Template (Stage 4 - Track P2P)', () => {
  it('generates co-brokerage agreement text and prohibits automated fee distribution', () => {
    const template = generateCoBrokerageAgreementTemplate({
      listingBrokerName: '성수부동산',
      coBrokerName: '강남부동산',
      propertyTitle: '성수동 80억 근생',
      commissionSplitRatio: '50:50',
    });

    expect(template.isLegalTemplateOnly).toBe(true);
    expect(template.isAutomatedFeeDistributionEnabled).toBe(false);
    expect(template.agreementMarkdown).toContain('공동중개 협약서');
    expect(template.agreementMarkdown).toContain('50:50');
  });
});
