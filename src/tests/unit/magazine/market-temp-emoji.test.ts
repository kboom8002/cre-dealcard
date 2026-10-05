/**
 * 시장 온도 이모지 일치 (U2-24): 도메인 MARKET_TEMP_CONFIG · 뷰어 MARKET_TEMP_VIEW · 에디터 EDITOR_MARKET_TEMP_ICON 이
 * 같은 세트이고, 구독자 매수 온도 이모지(BUYER_TEMP_EMOJIS)와 겹치지 않는다.
 */
import { describe, it, expect } from 'vitest';
import { MARKET_TEMP_CONFIG } from '@/domain/magazine/types';
import { MARKET_TEMP_VIEW } from '@/lib/magazine/view-helpers';
import { EDITOR_MARKET_TEMP_ICON, BUYER_TEMP_EMOJIS } from '@/lib/magazine/editor-labels';

const KEYS = ['적극 매수', '선별 매수', '관망', '조정 대기', '위기 경계'] as const;

describe('시장 온도 이모지 일치 (U2-24)', () => {
  it.each(KEYS)('%s: 도메인 = 뷰어 = 에디터', (k) => {
    expect(MARKET_TEMP_CONFIG[k].emoji).toBe(EDITOR_MARKET_TEMP_ICON[k]);
    expect(MARKET_TEMP_VIEW[k].emoji).toBe(EDITOR_MARKET_TEMP_ICON[k]);
  });

  it('5종 모두 서로 다르고 구독자 온도 이모지와 겹치지 않는다', () => {
    const icons = KEYS.map((k) => MARKET_TEMP_VIEW[k].emoji);
    expect(new Set(icons).size).toBe(5);
    for (const e of icons) expect(BUYER_TEMP_EMOJIS).not.toContain(e);
  });

  it('색·설명도 도메인과 뷰어가 같다', () => {
    for (const k of KEYS) {
      expect(MARKET_TEMP_VIEW[k].color).toBe(MARKET_TEMP_CONFIG[k].color);
      expect(MARKET_TEMP_VIEW[k].description).toBe(MARKET_TEMP_CONFIG[k].description);
    }
  });
});
