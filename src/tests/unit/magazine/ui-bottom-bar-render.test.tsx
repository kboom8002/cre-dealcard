/**
 * BottomBar 라벨 잘림 회귀 방지 (Part3 골든: 390px 'IM…/복…', 360px 'I…/공…').
 *
 * 레이아웃 엔진 없이(브라우저/Playwright 금지) 두 가지를 검증한다.
 *  1) 렌더 마크업: 아이콘 위·라벨 아래 세로 배치, 줄바꿈 허용(whitespace-normal + line-clamp-2),
 *     `truncate`/`whitespace-nowrap` 부재, 44px 이상 터치 높이(min-h-12 = 48px).
 *  2) 폭 용량 계산: flex 가중치(Primary 1.4 : Secondary 1)로 360px 에서 각 버튼 라벨 영역을 계산하고,
 *     실제 뷰어 라벨이 '최대 2줄' 안에 전부 들어가는지(보수적 글자폭 추정) 확인한다.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// SSR 에서는 슬롯 소유권(useEffect claim)이 없어 null 을 그리므로, 소유자로 고정한다.
vi.mock('@/components/ui/use-bottom-slot', () => ({
  useBottomSlot: () => ({ isOwner: true }),
}));

import { BottomBar } from '@/components/ui/bottom-bar';
import { buildBottomBarActions } from '@/lib/magazine/view-helpers';

function renderBar() {
  return renderToStaticMarkup(
    React.createElement(BottomBar, {
      children: [
        React.createElement(BottomBar.Primary, { key: 'p', href: 'tel:01012345678', icon: 'P', children: '전화 상담' }),
        React.createElement(BottomBar.Secondary, { key: 'i', href: '/im', icon: 'I', children: 'IM 요청' }),
        React.createElement(BottomBar.Secondary, { key: 's', icon: 'S', children: '공유' }),
      ],
    }),
  );
}

describe('BottomBar 라벨 레이아웃', () => {
  const html = renderBar();

  it('모든 라벨 텍스트가 마크업에 온전히 존재한다', () => {
    for (const label of ['전화 상담', 'IM 요청', '공유']) {
      expect(html).toContain(`>${label}</span>`);
    }
  });

  it('라벨은 줄바꿈 허용 + 최대 2줄, 잘림(truncate/nowrap) 없음', () => {
    expect(html).toContain('whitespace-normal');
    expect(html).toContain('line-clamp-2');
    expect(html).toContain('break-keep');
    expect(html).toContain('min-w-0');
    expect(html).not.toMatch(/\btruncate\b/);
    expect(html).not.toMatch(/whitespace-nowrap/);
  });

  it('아이콘 위·라벨 아래 세로 배치 + 44px 이상 터치 높이', () => {
    expect(html).toContain('flex-col');
    expect(html).toContain('min-h-12'); // 48px ≥ 44px
    expect(html).not.toMatch(/\bh-(8|9|10)\b/);
  });

  it('Primary 가중(1.4) · Secondary 균등(1) flex 기준', () => {
    expect(html).toContain('flex-[1.4_1_0%]');
    expect(html.match(/flex-\[1_1_0%\]/g)?.length).toBe(2);
  });
});

describe('BottomBar 폭 용량 (360px)', () => {
  const VIEWPORT = 360;
  const NAV_PAD_X = 16 * 2; // px-4
  const GAP = 8; // gap-2
  const BTN_PAD_X = 6 * 2; // px-1.5
  const FONT = 13; // text-label
  /** 보수적 추정: 한글/전각 ≈ 1.0em, 영문·숫자 ≈ 0.62em, 공백 ≈ 0.3em (bold) */
  const charW = (c: string) => (/[\u3131-\uD79D]/.test(c) ? FONT : c === ' ' ? FONT * 0.3 : FONT * 0.62);
  const textW = (s: string) => [...s].reduce((a, c) => a + charW(c), 0);

  /** break-keep: 공백 단위로만 줄바꿈 → 가장 긴 단어가 한 줄에 들어가야 하고, 총 줄 수 ≤ 2 */
  function fitsInTwoLines(label: string, widthPx: number): boolean {
    const words = label.split(' ');
    if (words.some((w) => textW(w) > widthPx)) return false;
    let lines = 1;
    let cur = 0;
    for (const w of words) {
      const need = cur === 0 ? textW(w) : cur + charW(' ') + textW(w);
      if (need <= widthPx) cur = need;
      else {
        lines += 1;
        cur = textW(w);
      }
    }
    return lines <= 2;
  }

  function buttonInnerWidths(count: number): { primary: number; secondary: number } {
    const free = VIEWPORT - NAV_PAD_X - GAP * (count - 1);
    const total = 1.4 + (count - 1);
    return {
      primary: (free * 1.4) / total - BTN_PAD_X,
      secondary: free / total - BTN_PAD_X,
    };
  }

  it('전화·IM·공유 3버튼 조합: 모든 라벨이 2줄 이내로 전부 보인다', () => {
    const actions = buildBottomBarActions({
      phone: '010-1234-5678',
      brokerSlug: 'kim-jung-gae',
      kakaoUrl: null,
    });
    expect(actions.length).toBeGreaterThanOrEqual(2);
    const w = buttonInnerWidths(actions.length);
    actions.forEach((a, i) => {
      const width = i === 0 ? w.primary : w.secondary;
      expect(fitsInTwoLines(a.label, width), `${a.label} @${Math.round(width)}px`).toBe(true);
    });
  });

  it('카톡 문의·문의하기 라벨도 360px 3버튼에서 2줄 이내', () => {
    const w = buttonInnerWidths(3);
    for (const label of ['카톡 문의', '문의하기', '전화 상담', 'IM 요청', '공유']) {
      expect(fitsInTwoLines(label, w.secondary), label).toBe(true);
    }
  });
});
