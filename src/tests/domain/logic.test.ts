import { describe, test, expect } from 'vitest';
import { runMatchingEngine } from '@/domain/matching/matching-engine';
import { computePromotionScore } from '@/domain/promotion/promotion-ranker';
import { extractMatchCasePack } from '@/domain/casepack/casepack-extractor';
import { validateBridgeTransition, VALID_TRANSITIONS } from '@/domain/pipeline/bridge-state-machine';

describe('DC-L2 Domain Logic', () => {
  test('DC-L2-01: 3-Stage matching engine', async () => {
    const input = {
      buildingSsotLiteId: 'test-building',
      buyerIntentLiteId: 'test-buyer',
      brokerId: 'test-broker',
      building: {
        areaSignal: '강남구 역삼동',
        assetType: '근린상가',
        priceBand: '50억-100억',
        vacancySignal: '일부 공실',
        fitSummary: '수익형 투자자 적합',
        cautionSummary: '주차 공간 협소',
        dealCuriosityScore: 80,
      },
      intent: {
        buyerType: '개인 투자자',
        budgetRange: { min: 50, max: 100, display: '50억-100억' },
        preferredRegions: ['강남구', '서초구'],
        assetTypes: ['근린상가', '오피스'],
        purchasePurpose: '수익형 투자',
        mustHave: ['역세권'],
        niceToHave: ['코너 건물'],
        riskTolerance: '안정 지향',
        inferredPurpose: '수익형 투자',
        recommendedWeightProfile: 'yield_focus' as const,
      }
    };
    
    // We expect it to run without throwing and return a MatchResult
    const result = await runMatchingEngine(input);
    expect(result).toHaveProperty('grade');
    expect(['S', 'A', 'B', 'C']).toContain(result.grade);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(typeof result.reasoning).toBe('string');
  });

  test('DC-L2-02: Promotion score computation', () => {
    const score = computePromotionScore({
      dealCuriosityScore: 80,
      matchedBuyerCount: 5,
      inquiryCount: 2,
      vacancyDemandVerified: true,
      createdAt: new Date().toISOString()
    });
    expect(score.score).toBeGreaterThanOrEqual(0);
    expect(score.score).toBeLessThanOrEqual(100);
    expect(score.breakdown).toBeDefined();
  });

  test('DC-L2-03: CasePack extraction', () => {
    const casepack = extractMatchCasePack({
      buildingId: 'b-1',
      brokerId: 'broker-1',
      buildingLabel: '강남구 상가',
      matchGrade: 'S',
      matchScore: 90,
      reasoning: '수익률이 좋고 예산이 맞음.',
      purposeProfile: 'yield_focus'
    });
    
    expect(casepack).toHaveProperty('task');
    expect(casepack).toHaveProperty('knowledge');
    expect(casepack).toHaveProperty('warning');
    expect(casepack.task).toContain('매수자 매칭 분석');
  });

  test('DC-L2-04: Pipeline state machine', () => {
    const initialState = 'memo_input';
    expect(VALID_TRANSITIONS[initialState]).toContain('deal_card_created');
    
    const result = validateBridgeTransition('memo_input', 'deal_card_created', { building_ssot_lite_id: 'test-1' }, new Date().toISOString());
    expect(result.valid).toBe(true);
    
    const invalidResult = validateBridgeTransition('deal_card_created', 'gate_requested', {}, new Date().toISOString());
    expect(invalidResult.valid).toBe(false);
    expect(invalidResult.missing).toContain('gate_request_id');
  });
});
