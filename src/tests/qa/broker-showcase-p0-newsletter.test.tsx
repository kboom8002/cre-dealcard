// @vitest-environment jsdom
/**
 * @file src/tests/qa/broker-showcase-p0-newsletter.test.tsx
 * @description 중개인 쇼룸 P0 개선 + 권장 법적/면책 보호선 회귀 검증 스위트 (뉴스레터·OG·구독·쇼룸 메타)
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({
  usePathname: () => '/qa-broker/showcase',
  useSearchParams: () => new URLSearchParams(),
}));

import { MagazineView } from '@/app/(magazine)/magazine/[brokerId]/[date]/magazine-view';
import { SubscribeCard } from '@/components/magazine/SubscribeCard';
import { NewsSection } from '@/components/magazine/viewer-sections';
import { OgImage, makeTranslate } from '@/lib/magazine/og-image-render';
import { buildImageModel } from '@/lib/magazine/og-image-data';
import { markBrokerSubscribed } from '@/lib/magazine/subscriber-local-state';
import { ShowcaseDeliverableViewer } from '@/components/qa-showcase/ShowcaseDeliverableViewer';

describe('Broker Showcase Wave P0 — Newsletter & OG Remediation', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('hides SubscribeCard when isSubscribedViewer=true and preserves exactly 1 tracking-notice', () => {
    const html = renderToStaticMarkup(
      <MagazineView
        brokerId="test-broker-kim"
        brokerSlug="test-broker-kim"
        date="2026-10-21"
        dateLabel="2026년 10월 21일 (수)"
        isSubscribedViewer={true}
        data={{
          kind: 'daily',
          headline: '서울 핵심상권의 꼬마빌딩 매수 문의 증가',
          briefing: '강남, 마포 코너건물 인기 상승',
          broker: {
            name: '김테스트',
            company: '테스트부동산중개법인',
            phone: '010-2548-2548',
            officeAddress: '서울시 강남구 테헤란로 100',
            officeRegNumber: '11680-2024-00999',
            representativeName: '김테스트',
            specialtyRegions: ['강남서초'],
          },
        }}
      />,
    );

    expect(html).not.toContain('data-testid="minimal-subscribe-optin"');
    expect(html).not.toContain('뉴스레터 신청');
    expect((html.match(/data-testid="tracking-notice"/g) ?? []).length).toBe(1);
  });

  it('omits specialtyRegions pills, minimizes BrokerProfileSection to name+tel, and collapses statutory footer', () => {
    const html = renderToStaticMarkup(
      <MagazineView
        brokerId="test-broker-kim"
        brokerSlug="test-broker-kim"
        date="2026-10-21"
        dateLabel="2026년 10월 21일 (수)"
        isSubscribedViewer={false}
        data={{
          kind: 'daily',
          headline: '서울 핵심상권의 꼬마빌딩 매수 문의 증가',
          briefing: '강남, 마포 코너건물 인기 상승',
          broker: {
            name: '김테스트',
            company: '테스트부동산중개법인',
            phone: '010-2548-2548',
            officeAddress: '서울시 강남구 테헤란로 100',
            officeRegNumber: '11680-2024-00999',
            representativeName: '김테스트',
            specialtyRegions: ['강남서초'],
          },
        }}
      />,
    );

    expect(html).toContain('data-testid="minimal-subscribe-optin"');
    expect(html).not.toContain('강남서초');
    expect(html).not.toContain('지난 매거진 목록 보기');
    expect(html).not.toContain('중개사 프로필 보기');
    expect(html).toContain('href="tel:01025482548"');
    expect(html).toContain('010-2548-2548');
    expect(html).toContain('data-testid="magazine-broker-statutory-disclosure"');
    expect(html).toContain('중개사무소 법정 표시사항');
    expect(html).toContain('text-sm');
  });

  it('auto-hides minimal SubscribeCard on mount when markBrokerSubscribed was recorded in localStorage', () => {
    markBrokerSubscribed('test-broker-kim');
    const { container } = render(
      <SubscribeCard brokerId="test-broker-kim" source="magazine" variant="minimal" />,
    );
    expect(container.querySelector('[data-testid="minimal-subscribe-optin"]')).toBeNull();
  });

  it('removes sentiment pills, AI clustering fallback label, and gradient lines while showing clean source top-right', () => {
    const html = renderToStaticMarkup(
      <NewsSection
        items={[]}
        cadence="daily"
        unitIssues={[
          {
            id: 'i1',
            channel: 'rate_finance',
            topic: '대출·금리',
            title: '시중은행 상가담보 대출금리 4%초반 안착',
            brief: '대출 이자가 내려가며 월세로 이자 감당이 수월해졌습니다.',
            memoTone: 'sky',
            sentiment: 'bullish',
            sources: ['한국경제'],
          },
          {
            id: 'i2',
            channel: 'tax_legal',
            topic: '세무·법률',
            title: '꼬마빌딩 증여 전 공시·감정평가 기준 확인 필수',
            brief: '비주거용 건물 증여 시 기준시가 평가를 면밀히 확인해야 합니다.',
            memoTone: 'mint',
            sentiment: 'neutral',
          },
        ]}
      />,
    );

    expect(html).not.toContain('호재');
    expect(html).not.toContain('중립');
    expect(html).not.toContain('AI 클러스터링 종합');
    expect(html).not.toContain('linear-gradient');
    expect(html).toContain('data-testid="axios-postit-source"');
    expect(html).toContain('한국경제');
  });

  it('removes duplicate credeal.net badge and date pill from Newsletter OgImage while retaining required typography', () => {
    const model = buildImageModel(
      { headline: '서울 핵심상권의 꼬마빌딩 매수 문의 증가', market_temp: '선별 매수' },
      { name: '김테스트', company: '테스트부동산중개법인', phone: '010-2548-2548' },
      '2026-10-21',
    )!;
    const html = renderToStaticMarkup(
      React.createElement(OgImage, {
        m: model,
        t: makeTranslate(true),
        width: 1200,
        height: 630,
      }),
    );

    expect(html).not.toContain('credeal.net');
    expect(html).not.toContain(model.dateLabel);
    expect(html).toContain('CRE 매거진');
    expect(html).toContain('font-size:60px');
    expect(html).toContain('font-size:37px');
    expect(html).toContain('font-size:30px');
  });

  it('displays reader-facing OG title and description in ShowcaseDeliverableViewer instead of internal QA labels', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          manifest: null,
          buildStamp: { sha: 'abc1234', shortSha: 'abc1234', builtAt: '2026-11-20', env: 'test' },
          channelPolicy: { emailLiveAllowed: true, alimtalkLiveAllowed: false, summaryLabel: 'test' },
        }),
      }),
    );

    const { container } = render(
      <ShowcaseDeliverableViewer
        portalRole="broker"
        eyebrowLabel="QA"
        headingTitle="쇼룸"
        backHref="/qa-broker/signoff"
        backLabel="뒤로"
        summaryBadgeText="22"
      />,
    );

    await act(async () => {
      const ogBtn = container.querySelector('[data-testid="showcase-view-og"]') as HTMLButtonElement;
      ogBtn.click();
    });

    const ogTitle = container.querySelector('[data-testid="showcase-og-card-title"]')?.textContent ?? '';
    const ogDesc = container.querySelector('[data-testid="showcase-og-card-description"]')?.textContent ?? '';

    expect(ogTitle).toContain('오늘 서울 핵심 상권, 우량 꼬마빌딩 문의가 늘고 있습니다');
    expect(ogTitle).not.toContain('일간 · 표준형');
    expect(ogDesc).not.toContain('5줄 500자');
  });
});
