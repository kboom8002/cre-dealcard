/**
 * shortenWithoutEllipsis / imlib.rows: 본문 말줄임('…') 금지 (골든 오라클 — development-sutaek-r2, operating-hotel-r2 슬라이드3 '입지 가치 및 접근성')
 */
import { describe, it, expect } from 'vitest';
import { shortenWithoutEllipsis, enforceTextBudget } from '@/domain/building/mobile-im/pptx/text-budget';
import { rows } from '@/domain/building/mobile-im/pptx/imlib';

const LONG =
  '1. 역세권 입지: 대중교통 및 주요 간선도로와의 우수한 연계성을 갖추고 있어 풍부한 유동인구를 확보하고 있습니다. ' +
  '2. 안정적인 자산 가치: 300억 수준의 합리적인 매각가와 1162.4평(약 3842.6㎡) 규모의 토지를 보유하고 있어 장기 보유 가치가 높습니다.';

describe('shortenWithoutEllipsis', () => {
  it('예산 이내 텍스트는 그대로', () => {
    expect(shortenWithoutEllipsis('짧은 문장입니다.', 50)).toBe('짧은 문장입니다.');
  });

  it("'…' 를 만들지 않고 문장 경계에서 끊는다", () => {
    const out = shortenWithoutEllipsis(LONG, 140);
    expect(out).not.toContain('…');
    expect(out.length).toBeLessThanOrEqual(140);
    expect(out.endsWith('있습니다.')).toBe(true);
  });

  it("목록 번호('2.')·소수점('1162.4')을 문장 종결로 보지 않는다", () => {
    const out = shortenWithoutEllipsis(LONG, 150);
    expect(out).not.toMatch(/\d\.$/);
    expect(out).not.toContain('…');
  });

  it('문장 경계가 없으면 단어 경계로 줄이고 열린 괄호를 닫는다', () => {
    const out = shortenWithoutEllipsis('가나다 라마바 사아자 (차카타 파하 가나다라마바사 아자차카타', 24);
    expect(out).not.toContain('…');
    const open = (out.match(/\(/g) ?? []).length;
    const close = (out.match(/\)/g) ?? []).length;
    expect(open).toBe(close);
  });

  it("enforceTextBudget 의 '…' 최후 수단 계약은 유지", () => {
    expect(enforceTextBudget('가'.repeat(60), 20).endsWith('…')).toBe(true);
  });
});

describe('imlib.rows — 좁은 값 칸에서도 본문 말줄임 없음', () => {
  it("긴 값은 '…' 없이 경계 축약으로 렌더", () => {
    const texts: string[] = [];
    const slide = {
      addText: (t: unknown) => { texts.push(String(t)); },
      addShape: () => undefined,
    };
    rows(slide as never, 0.5, 1, 5.0, [['입지 가치 및 접근성', LONG]]);
    expect(texts.length).toBeGreaterThan(0);
    expect(texts.join('\n')).not.toContain('…');
  });
});
