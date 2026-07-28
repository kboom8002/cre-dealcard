import { describe, it, expect } from 'vitest';
import { evaluateRAGIndexingEligibility } from '../src/domain/building/mobile-im/rag-hygiene';
import { validateColdModePitchGuard, sanitizeComplianceText } from '../src/domain/building/guardrails';
import { renderHeroMask, renderIncomeMask } from '../src/domain/building/nlg-mask-engine';

describe('RAG Hygiene Gate (S0-T3)', () => {
  it('rejects draft documents from RAG indexing', () => {
    const result = evaluateRAGIndexingEligibility({
      id: 'im-1',
      buildingId: 'b-1',
      status: 'draft',
      isBrokerApproved: false,
      content: 'Draft content...',
    });
    expect(result.eligibleForIndexing).toBe(false);
    expect(result.reason).toContain('Draft documents cannot be indexed');
  });

  it('approves broker-approved published documents for RAG indexing', () => {
    const result = evaluateRAGIndexingEligibility({
      id: 'im-2',
      buildingId: 'b-2',
      status: 'published',
      isBrokerApproved: true,
      content: 'Approved content...',
    });
    expect(result.eligibleForIndexing).toBe(true);
    expect(result.reason).toContain('RAGHygieneApproved');
  });
});

describe('Cold Mode Guardrails (S0-T5)', () => {
  it('prohibits price opinions in Cold mode without owner mandate', () => {
    const result = validateColdModePitchGuard({
      mode: 'cold',
      hasOwnerMandate: false,
      promptOrText: '본 매물의 적정매매가 평가 결과는 50억입니다.',
    });
    expect(result.passed).toBe(false);
    expect(result.violations[0]).toContain('ColdModePriceOpinionViolation');
  });

  it('allows Cold mode pitch without price keywords', () => {
    const result = validateColdModePitchGuard({
      mode: 'cold',
      hasOwnerMandate: false,
      promptOrText: '성수동 근생 건물 매도 제안서입니다.',
    });
    expect(result.passed).toBe(true);
  });

  it('sanitizes non-compliant performance guarantee text', () => {
    const text = '연 8% 수익률 보정 및 원금 보장 매물';
    const sanitized = sanitizeComplianceText(text);
    expect(sanitized).not.toContain('원금 보장');
    expect(sanitized).toContain('원금 손실 가능성 있음');
  });
});

describe('NLG Mask Engine Base (S0-T13)', () => {
  it('renders Hero and Income sections using deterministic financial values', () => {
    const payload = {
      inputs: {
        askingPriceKrw: 5_000_000_000, // 50억
        grossAnnualIncomeKrw: 250_000_000, // 2.5억
        dataGrade: 'A' as const,
      },
      regionName: '성수동',
      assetType: '꼬마빌딩',
    };

    const hero = renderHeroMask(payload);
    expect(hero.isMasked).toBe(true);
    expect(hero.contentMarkdown).toContain('50억 원');
    expect(hero.contentMarkdown).toContain('성수동 꼬마빌딩');

    const income = renderIncomeMask(payload);
    expect(income.isMasked).toBe(true);
    expect(income.contentMarkdown).toContain('순영업소득 (NOI)');
  });
});
