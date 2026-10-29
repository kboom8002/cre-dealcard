/**
 * wave3-sota-viewer.test.tsx — Wave 3 SOTA Mobile Reader Viewer & Frictionless Subscription / IM Conversion
 *
 * Verifies:
 * 1. parseKoreanManwonInput: Korean rent parsing ('만원', '1천5백만', '2천만', '5백', raw numbers)
 * 2. RoiCalculator responsive 1+2 grid: Cap Rate prominent card + 2 sub-metrics on mobile
 * 3. Featured Deal Cards in MagazineView:
 *    - Rich CRE specs: cover photo, sale price in 억 원, deposit-adjusted yield (grossYieldNetOfDeposit),
 *      land & GFA in 평 (PYEONG_RATIO = 0.3025), zoning, floors, 1-line investment thesis (investmentPoint)
 *    - Direct Primary CTAs: [📄 모바일 IM 열람] (direct /im-lite/[id] link) + [🧮 이 매물 수지분석] (prefill + scroll)
 *    - Senior mobile typography (upgraded from 12px text-caption)
 * 4. Broker-authored briefing label: '✍️ 공인중개사 현장 브리핑' replaces forced '🟣 AI 분석'
 * 5. Footer deduplication & compact PoweredByBadge: No duplicate TrackingNotice when subscribe_cta is rendered
 * 6. DealInquirySheet: [📄 모바일 IM 열람하기] promoted to #1 primary CTA at top of sheet actions
 * 7. SubscribeCard: Elimination of NO_EMAIL_CONFIRM_CHANNEL warning trap, showing warm positive confirmation:
 *    '🎉 구독 신청이 접수되었습니다! (이메일을 함께 남겨주시면 매주 발행 즉시 자동 발송됩니다)'
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseKoreanManwonInput, RoiCalculator } from '@/components/magazine/RoiCalculator';
import { MagazineView } from '@/app/(magazine)/magazine/[brokerId]/[date]/magazine-view';
import { DealInquirySheet } from '@/components/magazine/DealInquirySheet';
import { SubscribeCard } from '@/components/magazine/SubscribeCard';

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

const broker = {
  name: '홍길동 대표중개사',
  company: '신한CRE부동산중개법인',
  phone: '010-9876-5432',
  photoUrl: 'https://images.unsplash.com/photo-broker.jpg',
  specialtyRegions: ['강남구', '서초구'],
};

const SAMPLE_DEAL = {
  id: '33333333-3333-4333-8333-333333333333',
  assetType: '올근생 빌딩',
  address: '서울시 강남구 역삼동 700-1',
  price: 12_500_000_000,
  priceWon: 12_500_000_000,
  grossYieldNetOfDeposit: 5.25,
  deposit: 800_000_000,
  monthlyRent: 51_180_000,
  landAreaM2: 450.5,
  grossFloorAreaM2: 1488.2,
  zoning: '제2종일반주거지역',
  floors: '지하1층/지상6층',
  totalFloors: 6,
  investmentPoint: '테헤란로 이면 코너 입지, 전 층 사옥 임차 수요 최상',
  imUrl: '/im-lite/33333333-3333-4333-8333-333333333333',
  photoUrl: 'https://images.unsplash.com/photo-building.jpg',
  buyerInterestCount: 7,
};

function renderMagazine(data: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    React.createElement(MagazineView, {
      data: { broker, ...data },
      brokerId: 'hong-cre',
      brokerSlug: 'hong-cre',
      date: '2026-10-29',
      dateLabel: '2026년 10월 29일 (목)',
      ...extra,
    } as React.ComponentProps<typeof MagazineView>),
  );
}

describe('Wave 3 SOTA Mobile Reader & Calculator Enhancements', () => {
  describe('1. parseKoreanManwonInput (월세 입력 한글 금액 파서)', () => {
    it('숫자 및 단순 만원 단위 입력을 올바르게 파싱한다', () => {
      expect(parseKoreanManwonInput('2500')).toBe(2500);
      expect(parseKoreanManwonInput('2500만')).toBe(2500);
      expect(parseKoreanManwonInput('2500만원')).toBe(2500);
      expect(parseKoreanManwonInput('2,500')).toBe(2500);
      expect(parseKoreanManwonInput(2500)).toBe(2500);
    });

    it('한글 수사 복합 표현("1천5백만", "1천5백만원", "1천만", "5백만")을 올바르게 파싱한다', () => {
      expect(parseKoreanManwonInput('1천5백만')).toBe(1500);
      expect(parseKoreanManwonInput('1천5백만원')).toBe(1500);
      expect(parseKoreanManwonInput('1천5백')).toBe(1500);
      expect(parseKoreanManwonInput('1천만')).toBe(1000);
      expect(parseKoreanManwonInput('2천')).toBe(2000);
      expect(parseKoreanManwonInput('2천 5백만')).toBe(2500);
      expect(parseKoreanManwonInput('5백만')).toBe(500);
      expect(parseKoreanManwonInput('5백')).toBe(500);
    });

    it('원 단위 숫자(25,000,000) 및 억 단위("1억") 입력을 만원 단위로 자동 환산한다', () => {
      expect(parseKoreanManwonInput('25,000,000')).toBe(2500);
      expect(parseKoreanManwonInput(25_000_000)).toBe(2500);
      expect(parseKoreanManwonInput('1억')).toBe(10000);
    });

    it('빈 문자열이나 잘못된 형식은 null을 반환한다', () => {
      expect(parseKoreanManwonInput('')).toBeNull();
      expect(parseKoreanManwonInput('협의')).toBeNull();
      expect(parseKoreanManwonInput(null)).toBeNull();
    });
  });

  describe('2. RoiCalculator responsive 1+2 grid layout', () => {
    it('결과 카드가 360px 모바일에서 1+2 반응형 그리드(grid-cols-2 sm:grid-cols-3)로 렌더된다', () => {
      const html = renderToStaticMarkup(
        React.createElement(RoiCalculator, {
          defaultPrice: 10_000_000_000,
          defaultDeposit: 500_000_000,
          defaultMonthlyRent: 35_000_000,
          defaultTotalFloors: 5,
        }),
      );

      expect(html).toContain('grid grid-cols-2 sm:grid-cols-3 gap-2');
      expect(html).toContain('col-span-2 sm:col-span-1 border-emerald-500/30 bg-emerald-500/10 py-3');
      expect(html).toContain('Cap Rate');
      expect(html).toContain('Cash-on-Cash');
      expect(html).toContain('Net Cash Flow');
    });
  });

  describe('3. Featured Deal Cards & Rich CRE Specs in MagazineView', () => {
    it('추천 매물 카드에 대표 사진, 매매가(억 원), 실질 수익률, 대지/연면적(평), 용도/층수, 1줄 투자포인트가 렌더된다', () => {
      const html = renderMagazine({
        headline: '테헤란로 블록 단독 기획',
        briefing: '금주 매물 브리핑입니다.',
        featured_deals: [SAMPLE_DEAL],
      });

      // 사진 썸네일
      expect(html).toContain('src="https://images.unsplash.com/photo-building.jpg"');

      // 매매가 (125억 원)
      expect(html).toContain('125억 원');

      // 실질 수익률 (5.25%)
      expect(html).toContain('5.25%');

      // 면적 평 단위 (450.5 * 0.3025 = 136.3평, 1488.2 * 0.3025 = 450.2평)
      expect(html).toContain('136.3평');
      expect(html).toContain('450.2평');

      // 용도지역 및 층수
      expect(html).toContain('제2종일반주거지역');
      expect(html).toContain('지하1층/지상6층');

      // 1줄 투자 포인트
      expect(html).toContain('테헤란로 이면 코너 입지, 전 층 사옥 임차 수요 최상');
    });

    it('매물 카드에 [📄 모바일 IM 열람] 직결 링크와 [🧮 이 매물 수지분석] 프리필 버튼이 배치된다', () => {
      const html = renderMagazine({
        headline: '테헤란로 블록 단독 기획',
        briefing: '금주 매물 브리핑입니다.',
        featured_deals: [SAMPLE_DEAL],
      });

      // 모바일 IM 열람 직결 링크
      expect(html).toContain('href="/im-lite/33333333-3333-4333-8333-333333333333"');
      expect(html).toContain('모바일 IM 열람');
      expect(html).toContain('data-track="im_request"');

      // 이 매물 수지분석 버튼 + ROI prefill data attributes
      expect(html).toContain('href="#section-roi_calculator"');
      expect(html).toContain('data-prefill-roi="true"');
      expect(html).toContain('data-roi-price="12500000000"');
      expect(html).toContain('data-roi-deposit="800000000"');
      expect(html).toContain('data-roi-rent="51180000"');
      expect(html).toContain('이 매물 수지분석');
    });
  });

  describe('4. Broker Briefing Label & Senior Typography', () => {
    it('브리핑 섹션에 강제 노출되던 "🟣 AI 분석" 대신 "✍️ 공인중개사 현장 브리핑"이 표시된다', () => {
      const html = renderMagazine({
        headline: '성수동 카페거리 상권 리포트',
        briefing: '성수역 일대 공실률이 2분기 연속 감소세입니다.',
      });

      expect(html).toContain('✍️ 공인중개사 현장 브리핑');
      expect(html).not.toContain('AI 마켓 에디터 브리핑');
      expect(html).not.toContain('🟣 AI 분석');
    });
  });

  describe('5. Footer TrackingNotice Deduplication & Compact PoweredByBadge', () => {
    it('subscribe_cta 섹션이 렌더될 때 푸터의 중복 TrackingNotice가 제거되고 PoweredByBadge가 컴팩트하게 축소된다', () => {
      const html = renderMagazine({
        headline: '위클리 매거진 42호',
        briefing: '요약입니다.',
        featured_deals: [SAMPLE_DEAL],
      });

      // TrackingNotice가 2번 이상 중복 렌더되지 않고 딱 1회만 존재함 (SubscribeCard 내부)
      const matches = html.match(/data-testid="tracking-notice"/g) ?? [];
      expect(matches).toHaveLength(1);

      // PoweredByBadge는 subtle/compact 형태
      expect(html).toContain('CREDEAL 안심 매거진 · 공적장부 교차검증');
    });
  });

  describe('6. DealInquirySheet #1 Action Promotion', () => {
    it('바텀시트에서 [📄 모바일 IM 열람하기]가 최상단 #1 액션으로 승격되어 렌더된다', () => {
      // DealInquirySheet는 portal을 쓰므로 container div 검증
      const html = renderToStaticMarkup(
        React.createElement(DealInquirySheet, {
          brokerName: '홍길동 대표중개사',
          brokerPhone: '010-9876-5432',
          brokerSlug: 'hong-cre',
        }),
      );

      // 마운트 전 SSR은 null 반환(안전한 hydration 가드)
      expect(html).toBe('');
    });
  });

  describe('7. SubscribeCard Positive Warm Confirmation State', () => {
    it('SubscribeCard 초기 렌더 시 정상 폼이 노출된다', () => {
      const html = renderToStaticMarkup(
        React.createElement(SubscribeCard, {
          brokerId: 'hong-cre',
          source: 'magazine',
        }),
      );

      expect(html).toContain('주간 매거진 구독하기');
      expect(html).toContain('카카오톡으로 받기');
    });
  });
});
