import { describe, it, expect } from 'vitest';
import {
  POSTURE_CONTRACTS,
  getPostureContract,
  isPostureReady,
  PROVENANCE_REGISTRY,
  derivedConfidence,
  scoreToTier,
  formatBadge,
  type InvestmentPosture,
  type ProvenanceTier,
} from '../index';

describe('Posture Contract 13-slot (S1-1)', () => {
  const postures: InvestmentPosture[] = [
    'income',
    'owner_occupied',
    'development',
    'operating',
    'trading',
  ];

  it('5종 포스처 모두 13개 계약 슬롯을 충실히 채워야 한다', () => {
    for (const p of postures) {
      const contract = getPostureContract(p);
      expect(contract).toBeDefined();
      expect(contract.posture).toBe(p);
      expect(contract.archetypes.length).toBeGreaterThanOrEqual(3);
      expect(contract.sections.length).toBeGreaterThanOrEqual(7);
      expect(contract.emphasisSections.length).toBeGreaterThanOrEqual(2);
      expect(contract.requiredSlots.length).toBeGreaterThanOrEqual(2);
      expect(contract.valueMetric).toBeDefined();
      expect(contract.yieldBasis).toBeDefined();
      expect(contract.lAxisSlots.length).toBeGreaterThanOrEqual(2);
      expect(contract.minResolution).toBeDefined();
      expect(contract.layoutRules.length).toBeGreaterThanOrEqual(1);
      expect(contract.constraints.length).toBeGreaterThanOrEqual(1);
      expect(contract.gates.length).toBeGreaterThanOrEqual(3);
      expect(contract.nlgMasks.length).toBeGreaterThanOrEqual(2);
      expect(['commercial', 'beta', 'internal_only']).toContain(contract.status);
    }
  });

  it('income 포스처는 commercial 상태이고, trading은 internal_only이어야 한다', () => {
    expect(POSTURE_CONTRACTS.income.status).toBe('commercial');
    expect(isPostureReady('income')).toBe(true);

    expect(POSTURE_CONTRACTS.trading.status).toBe('internal_only');
    expect(isPostureReady('trading')).toBe(false);
  });
});

describe('9-Tier Provenance System (S1-1)', () => {
  it('9종 신규 티어 및 레거시 public 티어 정의가 올바르게 존재해야 한다', () => {
    const expectedTiers: ProvenanceTier[] = [
      'registry',
      'public_api',
      'broker_aug',
      'expert',
      'ledger',
      'seller',
      'broker',
      'derived',
      'assumed',
      'public',
    ];

    for (const tier of expectedTiers) {
      const meta = PROVENANCE_REGISTRY[tier];
      expect(meta).toBeDefined();
      expect(meta.badge).toBeDefined();
      expect(meta.label).toBeDefined();
    }
  });

  it('C21: derivedConfidence는 입력 출처의 최약 고리(최저 점수)를 승계해야 한다', () => {
    expect(derivedConfidence(['registry', 'public_api'])).toBe(0.95);
    expect(derivedConfidence(['registry', 'broker'])).toBe(0.60);
    expect(derivedConfidence(['expert', 'seller', 'assumed'])).toBe(0.30);
  });

  it('scoreToTier 및 formatBadge가 유효한 배지를 반환해야 한다', () => {
    expect(scoreToTier(1.0)).toBe('registry');
    expect(scoreToTier(0.60)).toBe('broker');
    expect(scoreToTier(0.30)).toBe('assumed');

    const badge = formatBadge('broker');
    expect(badge).toContain('●');
    expect(badge).toContain('중개인입력');
  });
});
