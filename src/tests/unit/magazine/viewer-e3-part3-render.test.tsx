/**
 * E3 Part3 — 뷰어 렌더 검증: 근거 없는 점수(62/100) 비노출 · 계산기 제목 중복 제거 · 뉴스 표시 정리.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/script', () => ({ default: () => null }));
vi.mock('@/hooks/use-magazine-analytics', () => ({
  useMagazineAnalytics: () => ({
    trackSectionView: vi.fn(),
    trackSection: vi.fn(),
    trackClick: vi.fn(),
    trackInteraction: vi.fn(),
  }),
}));
vi.mock('@/components/magazine/LazyIslands', async () => {
  const roi = await import('@/components/magazine/RoiIsland');
  const fwd = await import('@/components/magazine/ForwardSection');
  return { LazyRoiCalculator: roi.default, LazyForwardSection: fwd.ForwardSection };
});

import { MagazineView } from '@/app/(magazine)/magazine/[brokerId]/[date]/magazine-view';

const broker = { name: '김중개', company: '딜카드부동산', phone: '010-1234-5678' };

function render(data: Record<string, unknown>) {
  return renderToStaticMarkup(
    React.createElement(MagazineView, {
      data: { broker, ...data },
      brokerId: 'kim-jung-gae',
      brokerSlug: 'kim-jung-gae',
      date: '2026-09-20',
      dateLabel: '2026년 9월 20일 (일)',
    } as React.ComponentProps<typeof MagazineView>),
  );
}

const sectionIds = (html: string) =>
  Array.from(html.matchAll(/data-section-id="([a-z_]+)"/g)).map((m) => m[1]);

const LEGACY = {
  headline: '강남 오피스 거래, 3분기 회복 신호',
  briefing: '이번 주 투자자 심리는 62/100 으로 중립 이상입니다. 거래는 관망세입니다.',
  theme_title: '금리 인하 국면',
  theme_body_md: '심리 지수 62/100 구간에서 선별 접근이 필요합니다.',
  keyStats: [
    { label: '투자자 심리', value: '62/100', accent: 'emerald' },
    { label: '시장 상태', value: '매수 과열', accent: 'rose' },
    { label: '실거래', value: '12건', accent: 'indigo' },
  ],
  sentiment: { score: 62, status: '중립 이상', items: [] },
  recentTransactions: [{ dong: '역삼동', transaction_price: 5_000_000_000, transaction_date: '2026-09-01' }],
};

describe('① 근거 없는 점수 비노출 (실습1)', () => {
  it('레거시 발행본: 표지 지표·심리 섹션·본문에 62/100 이 없다', () => {
    const html = render(LEGACY);
    expect(html).not.toMatch(/62\s*\/\s*100/);
    expect(html).not.toContain('CRE 투자자 심리 지수');
    const header = html.slice(html.indexOf('data-section-id="cover"'), html.indexOf('</header>'));
    expect(header).not.toContain('매수 과열');
    expect(header).not.toMatch(/>투자자 심리</);
    expect(sectionIds(html)).not.toContain('sentiment_index');
    // 정당한 지표는 유지, 문장도 유지
    expect(html).toContain('12건');
    expect(html).toContain('중립 이상입니다.');
    expect(html).toContain('거래는 관망세입니다.');
    expect(html).toContain('선별 접근이 필요합니다.');
  });

  it('표지 지표 li 수 = 근거 없는 지표를 뺀 keyStats 수', () => {
    const html = render(LEGACY);
    const header = html.slice(html.indexOf('data-section-id="cover"'), html.indexOf('</header>'));
    expect(Array.from(header.matchAll(/<li /g))).toHaveLength(1);
  });

  it('근거(generation + 심리 항목 + 기준일)가 있으면 점수를 그대로 보여 준다', () => {
    const html = render({
      ...LEGACY,
      generation: { model: 'gemini', isMock: false },
      sentiment: { score: 62, status: '중립 이상', asOf: '2026-09-20', items: [{ keyword: '성수', score: 60 }] },
    });
    expect(html).toMatch(/62\s*\/\s*100/);
    expect(sectionIds(html)).toContain('sentiment_index');
  });
});

describe('실습: 섹션 제목 중복 제거', () => {
  it('수지분석 계산기 제목은 SectionCard 한 곳에만 나온다', () => {
    const html = render({ headline: 'h', briefing: 'b' });
    expect(html.split('수지분석 계산기').length - 1).toBe(1);
  });
});

describe('④ 뉴스 표시 정리 (렌더)', () => {
  it('제목의 &quot; 는 따옴표로, 요약의 내부 라벨·| 조각은 제거', () => {
    const html = render({
      headline: 'h',
      briefing: 'b',
      topNews: [{
        title: '&quot;공실&quot; 증가', summary: '핵심 팩트: 임차 문의 증가 | 브로커 임플리케이션: 선별', source: '한경',
        topic: 'rental', sentiment: 'neutral',
      }],
    });
    expect(html).not.toContain('&amp;quot;');
    expect(html).toContain('&quot;공실&quot; 증가'); // React 가 텍스트 따옴표를 다시 이스케이프한 정상 출력
    expect(html).not.toContain('핵심 팩트');
    expect(html).not.toContain('브로커 임플리케이션');
    expect(html).toContain('임차 문의 증가');
    expect(html).toContain('임대·공실');
  });
});
