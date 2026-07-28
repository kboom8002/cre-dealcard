import { describe, it, expect } from 'vitest';
import { getIMRenderPolicy } from '@/domain/building/im-render-policy';
import { generateProIMWatermark } from '@/domain/gate/nda-watermark';
import { evaluateKAnonymity } from '@/domain/guardrails/k-anonymity';
import { matchBuyerWithDeal } from '@/domain/matching/explainable-matcher';
import { getMapTierCoordinates } from '@/domain/building/map-tier';

describe('IM Render Policy & Tiering (S3-T4)', () => {
  it('hides exact address and unit rent in Basic IM', () => {
    const policy = getIMRenderPolicy('basic', false);
    expect(policy.showExactAddress).toBe(false);
    expect(policy.showTenantNames).toBe(false);
    expect(policy.requiresNDA).toBe(false);
  });

  it('exposes full information in Pro IM when NDA is signed', () => {
    const policy = getIMRenderPolicy('pro', true);
    expect(policy.showExactAddress).toBe(true);
    expect(policy.showTenantNames).toBe(true);
    expect(policy.requiresWatermark).toBe(true);
  });
});

describe('Pro IM Watermark & NDA (S3-T5)', () => {
  it('generates secure watermark text with requester credentials', () => {
    const watermark = generateProIMWatermark({
      requesterName: '김대표',
      requesterPhone: '01012345678',
      dealId: 'd-100',
      grantId: 'g-200-300',
    });

    expect(watermark.watermarkText).toContain('김대표');
    expect(watermark.watermarkText).toContain('010-****-5678');
    expect(watermark.watermarkText).toContain('PRO IM CONFIDENTIAL');
  });
});

describe('K-Anonymity Re-identification Simulator (S3-T9)', () => {
  it('uses K=30 for Gangnam district and blocks if candidates < 30', () => {
    const result = evaluateKAnonymity({
      districtName: '강남구',
      totalCandidateCountInPublicDb: 15,
    });

    expect(result.passed).toBe(false);
    expect(result.requiredK).toBe(30);
    expect(result.status).toBe('blocked_reident_risk');
  });

  it('passes K-anonymity check when candidate count meets K threshold', () => {
    const result = evaluateKAnonymity({
      districtName: '마포구',
      totalCandidateCountInPublicDb: 25,
    });

    expect(result.passed).toBe(true);
    expect(result.requiredK).toBe(20);
    expect(result.status).toBe('safe');
  });
});

describe('Explainable 3-Tier Matcher (S3-T10)', () => {
  it('matches buyer with deal and outputs score, tier, and match highlights', () => {
    const buyer = {
      maxBudgetKrw: 10_000_000_000, // 100억
      targetRegions: ['성수동'],
      preferredArchetypes: ['VALUE_ADD'],
      minYieldPct: 4.0,
    };

    const deal = {
      dealId: 'deal-1',
      askingPriceKrw: 8_000_000_000, // 80억
      capRatePct: 4.5,
      regionName: '성수동2가',
      archetype: 'VALUE_ADD',
    };

    const result = matchBuyerWithDeal(buyer, deal);
    expect(result.isHardFilterPassed).toBe(true);
    expect(result.matchTier).toBe('S');
    expect(result.matchScore).toBeGreaterThanOrEqual(90);
    expect(result.matchHighlights.length).toBeGreaterThan(0);
  });

  it('disqualifies match if hard filter budget is exceeded', () => {
    const buyer = {
      maxBudgetKrw: 5_000_000_000,
      targetRegions: ['강남구'],
    };

    const deal = {
      dealId: 'deal-2',
      askingPriceKrw: 10_000_000_000, // 100억
      regionName: '강남구 역삼동',
      archetype: 'STABLE_INCOME',
    };

    const result = matchBuyerWithDeal(buyer, deal);
    expect(result.isHardFilterPassed).toBe(false);
    expect(result.matchTier).toBe('DISQUALIFIED');
    expect(result.mismatchReasons[0]).toContain('예산 초과');
  });
});

describe('Map Tiering (S3-T18)', () => {
  it('applies fuzzy offset for Basic IM and exact coordinates for Pro IM', () => {
    const exact = { lat: 37.5445, lng: 127.0560 };

    const basicMap = getMapTierCoordinates(exact, 'basic', false, 'deal-seed-123');
    expect(basicMap.isFuzzyOffset).toBe(true);
    expect(basicMap.displayCoordinates.lat).not.toBe(exact.lat);

    const proMap = getMapTierCoordinates(exact, 'pro', true, 'deal-seed-123');
    expect(proMap.isFuzzyOffset).toBe(false);
    expect(proMap.displayCoordinates.lat).toBe(exact.lat);
  });
});
