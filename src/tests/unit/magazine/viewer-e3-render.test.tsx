/**
 * E3 뷰어 렌더 스모크 (renderToStaticMarkup): 미발행 안내, 빈 데이터, 타깃별 섹션 순서, 섹션 on/off, 미리보기.
 * 브라우저 전용 의존(next/script, analytics 훅)은 모킹한다.
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
// next/dynamic(React.lazy) 은 renderToStaticMarkup 에서 중단되므로, 지연 래퍼를 실제 섬 컴포넌트로 치환해 SSR 출력을 검증한다.
vi.mock('@/components/magazine/LazyIslands', async () => {
  const roi = await import('@/components/magazine/RoiIsland');
  const fwd = await import('@/components/magazine/ForwardSection');
  return { LazyRoiCalculator: roi.default, LazyForwardSection: fwd.ForwardSection };
});

import { MagazineView } from '@/app/(magazine)/magazine/[brokerId]/[date]/magazine-view';
import { UnpublishedNotice } from '@/components/magazine/UnpublishedNotice';

const broker = { name: '김중개', company: '딜카드부동산', phone: '010-1234-5678' };

function render(data: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    React.createElement(MagazineView, {
      data: { broker, ...data },
      brokerId: 'kim-jung-gae',
      brokerSlug: 'kim-jung-gae',
      date: '2026-09-20',
      dateLabel: '2026년 9월 20일 (일)',
      ...extra,
    } as React.ComponentProps<typeof MagazineView>),
  );
}

const sectionIds = (html: string) =>
  Array.from(html.matchAll(/data-section-id="([a-z_]+)"/g)).map((m) => m[1]);

const FULL = {
  headline: '강남 오피스 거래, 3분기 회복 신호',
  briefing: '이번 주 시장 요약입니다.',
  field_note: { question: '현장 분위기', comment: '매수 문의가 늘었습니다.' },
  theme_title: '금리 인하 국면의 꼬마빌딩',
  featured_deals: [{ id: 'deal-1', assetType: '꼬마빌딩', address: '역삼동', price: 6_500_000_000 }],
  recentTransactions: [{ dong: '역삼동', transaction_price: 5_000_000_000, transaction_date: '2026-09-01' }],
  tax_clinic: { question: '양도세는?', answer: '일반 정보입니다.' },
};

describe('MagazineView 렌더 스모크', () => {
  it('h1 = 헤드라인, 날짜 라벨, main 랜드마크, 고정 문구/AI 개인화 없음', () => {
    const html = render(FULL);
    expect(html).toContain('<h1');
    expect(html).toMatch(/<h1[^>]*>강남 오피스 거래, 3분기 회복 신호<\/h1>/);
    expect(html).toContain('2026년 9월 20일 (일)');
    expect(html).toContain('<main id="magazine-main"');
    expect(html).not.toContain('CRE 위클리 매거진');
    expect(html).not.toContain('AI 개인화');
  });

  it('빈 데이터: EmptyState + 구독 카드, 헤드라인 없으면 이름 기반 h1', () => {
    const html = render({});
    expect(html).toContain('아직 게시된 내용이 없습니다');
    expect(html).toContain('김중개의 CRE 매거진');
    expect(sectionIds(html)).toContain('subscribe_cta');
    expect(html).not.toContain('수지분석 계산기');
  });

  it('설문이 없으면 poll 섹션이 없다 (기본 설문 하드코딩 금지)', () => {
    expect(sectionIds(render(FULL))).not.toContain('poll');
    const withPoll = render({ ...FULL, poll: { question: '고민은?', options: [{ label: '매수' }, { label: '매도', intent: 'seller' }] } });
    expect(sectionIds(withPoll)).toContain('poll');
  });

  it('타깃별 순서: seller 는 market_data 가 featured_deals 보다 앞, 기본(all)은 반대', () => {
    const seller = sectionIds(render(FULL, { target: 'seller' }));
    expect(seller.indexOf('market_data')).toBeLessThan(seller.indexOf('featured_deals'));
    const all = sectionIds(render(FULL));
    expect(all.indexOf('featured_deals')).toBeLessThan(all.indexOf('market_data'));
  });

  it('buyer 타깃에서는 세무 클리닉을 숨기고, all 에서는 보인다', () => {
    expect(sectionIds(render(FULL, { target: 'buyer' }))).not.toContain('tax_clinic');
    expect(sectionIds(render(FULL))).toContain('tax_clinic');
  });

  it('sections[].enabled=false 인 섹션은 렌더하지 않는다', () => {
    const ids = sectionIds(render({ ...FULL, sections: [{ id: 'featured_deals', enabled: false }] }));
    expect(ids).not.toContain('featured_deals');
    expect(ids).toContain('ai_briefing');
  });

  it('금액은 65억 형식, 푸터에 추적 고지가 있다', () => {
    const html = render(FULL);
    expect(html).toContain('65억');
    expect(html).toContain('data-testid="tracking-notice"');
  });

  it('미리보기: main 랜드마크 없음(div), 구독 카드 aria-hidden', () => {
    const html = render(FULL, { preview: true });
    expect(html).not.toContain('<main');
    expect(html).toContain('aria-hidden="true"');
  });

  it('U-06: 매물/세무 링크는 onClick 대신 data-track 속성으로 추적을 위임한다', () => {
    const html = render({ ...FULL, tax_clinic: { question: '양도세는?', answer: '일반 정보입니다.' } });
    expect(html).toContain('data-track="listing_click"');
    expect(html).toContain('data-track-listing-id="deal-1"');
    expect(html).toContain('data-track="im_request"');
    expect(html).toContain('data-track-click="featured_deal"');
  });

  it('U-06: 계산기·전달하기 섬이 SSR 로 렌더된다 (지연 로드여도 초기 HTML 유지)', () => {
    const html = render(FULL);
    expect(html).toContain('수지분석 계산기');
    expect(html).toContain('동료에게 구독 링크 전달하기');
  });
});

describe('UnpublishedNotice', () => {
  it('제목 유지(e2e) + 최신호·목록·구독 링크, 사유별 문구', () => {
    const html = renderToStaticMarkup(
      React.createElement(UnpublishedNotice, { reason: 'future', brokerSlug: 'kim-jung-gae', date: '2026-12-31', latestDate: '2026-09-20' }),
    );
    expect(html).toContain('아직 발행되지 않은 매거진입니다');
    expect(html).toContain('href="/magazine/kim-jung-gae/2026-09-20"');
    expect(html).toContain('href="/magazine/kim-jung-gae"');
    expect(html).toContain('href="/magazine/kim-jung-gae/subscribe"');
    expect(html).toContain('발행일이 되지 않았습니다');
  });

  it('최신호가 없으면 최신호 링크를 만들지 않고, 잘못된 날짜는 형식 안내', () => {
    const html = renderToStaticMarkup(
      React.createElement(UnpublishedNotice, { reason: 'invalid', brokerSlug: 'kim-jung-gae', date: 'abc', latestDate: null }),
    );
    expect(html).not.toContain('가장 최근 호 보기');
    expect(html).toContain('날짜 형식이 올바르지 않습니다');
  });
});
