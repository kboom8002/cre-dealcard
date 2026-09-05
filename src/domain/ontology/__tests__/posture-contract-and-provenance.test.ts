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
import { THRESHOLDS } from '@/constants/thresholds';

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

  // Rule 7: Negative Pair
  it('Rule 7 (Negative Pair): 미등록 포스처 요청 시 에러를 throw해야 한다', () => {
    expect(() => getPostureContract('invalid_posture' as any)).toThrow('[PostureContract] 미등록 포스처 계약');
  });

  // Rule 7: Negative Pair
  it('Rule 7 (Negative Pair): 미등록 포스처에 대해 isPostureReady는 false를 반환해야 한다', () => {
    expect(isPostureReady('unknown_posture' as any)).toBe(false);
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
    expect(derivedConfidence(['registry', 'public_api'])).toBe(THRESHOLDS.PROVENANCE_PUBLIC_API);
    expect(derivedConfidence(['registry', 'broker'])).toBe(THRESHOLDS.PROVENANCE_BROKER);
    expect(derivedConfidence(['expert', 'seller', 'assumed'])).toBe(THRESHOLDS.PROVENANCE_ASSUMED);
  });

  // Rule 7: Negative Pair
  it('Rule 7 (Negative Pair): 빈 출처 목록 전달 시 기본 assumed 신뢰도(0.30)를 반환해야 한다', () => {
    expect(derivedConfidence([])).toBe(THRESHOLDS.PROVENANCE_ASSUMED);
  });

  it('scoreToTier 및 formatBadge가 유효한 배지를 반환해야 한다', () => {
    expect(scoreToTier(THRESHOLDS.PROVENANCE_REGISTRY)).toBe('registry');
    expect(scoreToTier(THRESHOLDS.PROVENANCE_BROKER)).toBe('broker');
    expect(scoreToTier(THRESHOLDS.PROVENANCE_ASSUMED)).toBe('assumed');

    const badge = formatBadge('broker');
    expect(badge).toContain('●');
    expect(badge).toContain('중개인입력');
  });

  // Rule 7: Negative Pair
  it('Rule 7 (Negative Pair): 최하위 점수 이하(0.1, -1)에 대해 assumed를 반환해야 한다', () => {
    expect(scoreToTier(0.1)).toBe('assumed');
    expect(scoreToTier(-1)).toBe('assumed');
  });
});
