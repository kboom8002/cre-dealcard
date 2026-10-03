/**
 * 건물명 공개 정책 — 마스킹 폐지 회귀 가드
 */
import { describe, it, expect } from 'vitest';
import { runDisclosureGuard, humanizeGuardrailTokensForView } from '@/domain/building/mobile-im/guardrails';

describe('건물명 공개 (마스킹 금지)', () => {
  it.each([
    '양평 소재 오피스빌딩으로, 핵심 입지 기반의 자산입니다.',
    '신사동 590 ICL빌딩은 대로변 코너에 위치합니다.',
    '서울센트럴타워 인근 역세권 자산',
  ])('runDisclosureGuard는 건물명/자산유형을 치환하지 않는다: %s', (text) => {
    const r = runDisclosureGuard(text);
    expect(r.safe_text).toBe(text);
    expect(r.safe_text).not.toContain('[건물명 비공개]');
    expect(r.redacted_fields).not.toContain('building_name');
  });

  it('레거시 [건물명 비공개] 토큰은 자연어로 치환된다 (조사 보존)', () => {
    expect(humanizeGuardrailTokensForView('양평 소재 [건물명 비공개]으로, 입지가 우수합니다.'))
      .toBe('양평 소재 본 자산으로, 입지가 우수합니다.');
  });

  it('연락처 등 개인정보 마스킹은 유지된다', () => {
    const r = runDisclosureGuard('담당 김철수 010-1234-5678');
    expect(r.status).toBe('redacted');
  });
});
