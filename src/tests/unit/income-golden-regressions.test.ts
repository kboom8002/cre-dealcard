import { describe, it, expect } from 'vitest';
import { resolveTotalGrossAreaSqm } from '@/domain/building/mobile-im/resolve-total-area';
import { reconcileAskingPrice } from '@/domain/building/price-reconcile';
import { sanitizePersona, stripMarkdown } from '@/domain/building/mobile-im/pptx/binder/binder-utils';

describe('resolveTotalGrossAreaSqm — 연면적 우선순위', () => {
  it('명시 ㎡ 입력이 최우선', () => {
    expect(resolveTotalGrossAreaSqm({ explicitSqm: 1000, ssotSqm: 2000, publicRegisterSqm: 3000 })).toBe(1000);
  });

  it('명시 평 입력은 ㎡로 환산', () => {
    expect(resolveTotalGrossAreaSqm({ explicitPyeong: 100, ssotSqm: 2000 })).toBeCloseTo(330.5785, 3);
  });

  it('명시 입력이 없으면 SSoT(공부) > 공공 건축물대장', () => {
    expect(resolveTotalGrossAreaSqm({ ssotSqm: 2300.46, publicRegisterSqm: 2400 })).toBe(2300.46);
    expect(resolveTotalGrossAreaSqm({ publicRegisterSqm: 1687.51 })).toBe(1687.51);
  });

  it('후보가 없으면 0 (렌트롤 임대면적 합으로 대체하지 않음)', () => {
    expect(resolveTotalGrossAreaSqm({})).toBe(0);
    expect(resolveTotalGrossAreaSqm({ explicitSqm: NaN, ssotSqm: null })).toBe(0);
  });
});

describe('PPTX 텍스트 정제 — 임차인 마스킹 라벨', () => {
  it('[임차인H] 등 마스킹 라벨이 본문에 남지 않는다', () => {
    const raw = '5층 일부 [임차인H]의 임대수익 업사이드, [임차인A] 외 [임차인]';
    for (const out of [sanitizePersona(raw), stripMarkdown(raw)]) {
      expect(out).not.toMatch(/\[임차인/);
      expect(out).toContain('임차인');
    }
  });
});

describe('reconcileAskingPrice — AI vs 메모 슬롯 교차 검증', () => {
  it('ig4 as-is: AI 가 250억을 2,500억으로 10배 오추출하면 메모 슬롯(250억) 채택', () => {
    const r = reconcileAskingPrice(25_000_000, 25_000_000_000);
    expect(r.source).toBe('slot_override');
    expect(r.manwon).toBe(2_500_000);
    expect(r.krw).toBe(25_000_000_000);
    expect(r.warning).toBeTruthy();
  });

  it('근접하면 AI 값 유지', () => {
    const r = reconcileAskingPrice(950_000, 9_500_000_000);
    expect(r.source).toBe('ai');
    expect(r.manwon).toBe(950_000);
  });

  it('한쪽만 있으면 그 값 사용, 둘 다 없으면 null', () => {
    expect(reconcileAskingPrice(null, 9_500_000_000).source).toBe('slot');
    expect(reconcileAskingPrice(950_000, null).krw).toBe(9_500_000_000);
    expect(reconcileAskingPrice(undefined, undefined)).toMatchObject({ manwon: null, krw: null, source: 'none' });
  });
});
