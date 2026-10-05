/**
 * 세무 클리닉 생성기 단위 테스트 (B3a, C-02: M2-15 / T3-02 / T3-LLM-1)
 *  - "감수" 표현 없음 / 근거 부족·Mock·LLM 실패 → null / 면책 포함 / 날조 수치 폐기 / 브로커 비의존 캐시
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  calls: 0,
  impl: null as null | (() => Promise<unknown>),
}));

vi.mock('@/lib/magazine/llm-guard', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/magazine/llm-guard')>();
  return {
    ...actual,
    callMagazineJson: async (...args: unknown[]) => {
      h.calls += 1;
      if (!h.impl) throw new Error('impl not set');
      void args;
      return h.impl();
    },
  };
});

import { MagazineLlmError } from '@/lib/magazine/llm-guard';
import {
  __resetTaxClinicCacheForTests,
  generateSharedTaxClinic,
  generateTaxClinicScenario,
} from '@/domain/magazine/tax-clinic-generator';
import { TAX_DISCLAIMER, TAX_RULES_REVIEW_STATUS, TAX_TOPICS, pickTaxTopic } from '@/domain/magazine/tax-rules-2026';

const WEEK = 'W41-2026';

/** 모든 주제의 필수 전제 키워드를 포함하되 숫자는 쓰지 않는 정상 출력 */
function goodOutput(extra = '') {
  return {
    data: {
      title: '증여와 매각의 세금 구조 비교',
      scenario: '건물주가 자녀에게 자산을 넘기는 일반적인 상황을 가정해 두 방법의 구조를 비교합니다.',
      comparison: {
        optionA: {
          name: 'A',
          description: '직접 처분하는 방식은 양도소득세 구조를 먼저 확인해야 합니다.',
          expectedTaxInfo: '양도소득세 과세 여부와 시가 평가 방식에 따라 부담이 달라집니다.',
        },
        optionB: {
          name: 'B',
          description: '증여 후 처분하는 방식은 증여세와 이월과세 적용 여부를 함께 봐야 합니다.',
          expectedTaxInfo: '증여세 과세 구조와 이월과세 적용 여부에 따라 결과가 달라질 수 있습니다.',
        },
      },
      conclusion: `이월과세, 양도소득세, 시가 평가, 법인전환, 임대업 여부와 증여세 구조를 함께 검토해야 합니다. ${extra}`.trim(),
    },
    response: { content: '{}', tokens: 321, model: 'test-model', latencyMs: 1, isMock: false },
  };
}

beforeEach(() => {
  h.calls = 0;
  h.impl = null;
  __resetTaxClinicCacheForTests();
});

describe('tax-rules-2026', () => {
  it('모든 주제는 근거 조문이 있고 필수 전제를 갖는다', () => {
    for (const t of TAX_TOPICS) {
      expect(t.facts.length).toBeGreaterThan(0);
      expect(t.facts.every((f) => f.ref.length > 0)).toBe(true);
      expect(t.mustMention.length).toBeGreaterThan(0);
    }
  });
  it('주제 선택은 결정적(Math.random 아님)', () => {
    expect(pickTaxTopic(WEEK).id).toBe(pickTaxTopic(WEEK).id);
  });
});

describe('generateSharedTaxClinic', () => {
  it('정상 생성: "감수" 표현 없음 + 면책·기준일·미검수 표시 포함', async () => {
    h.impl = async () => goodOutput();
    const r = await generateSharedTaxClinic(WEEK, null);
    expect(r).not.toBeNull();
    const all = JSON.stringify(r);
    expect(all).not.toMatch(/감수/);
    expect(r!.disclaimer).toBe(TAX_DISCLAIMER);
    expect(r!.disclaimer).toContain('세무 자문이 아닙니다');
    expect(r!.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r!.reviewStatus).toBe(TAX_RULES_REVIEW_STATUS);
    expect(r!.source).not.toMatch(/감수/);
    expect(r!.weekLabel).toBe(WEEK);
    // 대안 이름은 주제 정의를 그대로 사용 (LLM 이 바꾸지 못함)
    const topic = pickTaxTopic(WEEK);
    expect(r!.comparison.optionA.name).toBe(topic.optionAName);
    expect(r!.comparison.optionB.name).toBe(topic.optionBName);
  });

  it('출력에 "감수" 표현이 있으면 폐기(null)', async () => {
    h.impl = async () => goodOutput('본 내용은 세무 전문가 감수를 거쳤습니다.');
    expect(await generateSharedTaxClinic(WEEK, null)).toBeNull();
  });

  it('근거에 없는 세율/금액 날조 → 폐기(null)', async () => {
    h.impl = async () => goodOutput('이 경우 세율은 77%가 적용되어 세금이 312억원입니다.');
    expect(await generateSharedTaxClinic(WEEK, null)).toBeNull();
  });

  it('Mock 응답 → null (하드코딩 폴백 없음)', async () => {
    h.impl = async () => {
      const o = goodOutput();
      return { ...o, response: { ...o.response, isMock: true } };
    };
    expect(await generateSharedTaxClinic(WEEK, null)).toBeNull();
  });

  it('LLM 실패/Mock 차단 오류 → null', async () => {
    h.impl = async () => {
      throw new MagazineLlmError('MOCK_RESPONSE', 'AI 생성 실패: Mock 응답 차단');
    };
    expect(await generateSharedTaxClinic(WEEK, null)).toBeNull();
  });

  it('필수 전제 키워드 누락 → null (이월과세 등 전제 누락 방지)', async () => {
    h.impl = async () => {
      const o = goodOutput();
      o.data.conclusion = '어느 쪽이 더 낫다고 말하기는 어렵고 상황별로 다릅니다. 충분히 검토하시기 바랍니다.';
      o.data.title = '두 가지 방법의 일반적인 비교';
      o.data.scenario = '건물주가 자녀에게 자산을 넘기는 일반적인 상황을 가정해 구조를 비교합니다.';
      o.data.comparison.optionA.description = '첫 번째 방식은 구조를 먼저 확인해야 하는 방식입니다.';
      o.data.comparison.optionA.expectedTaxInfo = '상황에 따라 부담이 달라질 수 있는 구조입니다.';
      o.data.comparison.optionB.description = '두 번째 방식은 별도의 절차를 함께 봐야 하는 방식입니다.';
      o.data.comparison.optionB.expectedTaxInfo = '상황에 따라 결과가 달라질 수 있는 구조입니다.';
      return o;
    };
    expect(await generateSharedTaxClinic(WEEK, null)).toBeNull();
  });

  it('같은 주(브로커 무관)에는 LLM 1회만 호출, 실패(null)는 캐시하지 않는다', async () => {
    h.impl = async () => goodOutput();
    const a = await generateSharedTaxClinic(WEEK, null);
    const b = await generateTaxClinicScenario(null, { weekLabel: WEEK });
    expect(a).toEqual(b);
    expect(h.calls).toBe(1);

    __resetTaxClinicCacheForTests();
    h.calls = 0;
    h.impl = async () => {
      throw new MagazineLlmError('LLM_FAILED', 'fail');
    };
    expect(await generateSharedTaxClinic('W42-2026', null)).toBeNull();
    expect(await generateSharedTaxClinic('W42-2026', null)).toBeNull();
    expect(h.calls).toBe(2);
  });
});
