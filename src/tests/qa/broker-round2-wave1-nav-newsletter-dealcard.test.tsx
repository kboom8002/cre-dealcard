import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  WORKSPACE_IDENTITY_ORDER,
  WORKSPACE_IDENTITY,
} from '@/lib/ux/workspace-identity';
import { TERMS } from '@/lib/ux/lexicon';
import {
  detectSubjectiveNumericPhrases,
  isPureAreaRepetitionPoint,
  stripSubjectiveNumericSpin,
} from '@/lib/deal-card/blind-guard';
import {
  buildDeal3TierSpecs,
  formatObjectiveYieldComparison,
  getFieldStrengthTagsForPosture,
} from '@/lib/deal-card/field-strength-tags';
import { SubscriberShareButton } from '@/components/magazine/SubscriberShareButton';
import { MagazineView } from '@/app/(magazine)/magazine/[brokerId]/[date]/magazine-view';

vi.mock('next/script', () => ({ default: () => null }));
vi.mock('@/hooks/use-magazine-analytics', () => ({
  useMagazineAnalytics: () => ({
    trackSectionView: vi.fn(),
    trackSection: vi.fn(),
    trackClick: vi.fn(),
    trackInteraction: vi.fn(),
  }),
}));

describe('Round 2 Wave 1 — 4대 서비스 아이덴티티 · 부동산뉴스 · 딜카드 정직성 스펙', () => {
  it('1. 4대 핵심 서비스 순서·명칭·컬러 SSOT가 영업 퍼널(부동산뉴스→딜카드→IM→고객 소통)을 준수한다', () => {
    expect(WORKSPACE_IDENTITY_ORDER).toEqual(['magazine', 'dealcards', 'im', 'inbox']);
    expect(WORKSPACE_IDENTITY.magazine.label).toBe('부동산뉴스');
    expect(WORKSPACE_IDENTITY.magazine.accentHex).toBe('#059669');
    expect(WORKSPACE_IDENTITY.dealcards.label).toBe('딜카드');
    expect(WORKSPACE_IDENTITY.dealcards.accentHex).toBe('#D97706');
    expect(WORKSPACE_IDENTITY.im.label).toBe('IM');
    expect(WORKSPACE_IDENTITY.im.accentHex).toBe('#1D4ED8');
    expect(WORKSPACE_IDENTITY.inbox.label).toBe('고객 소통');
    expect(WORKSPACE_IDENTITY.inbox.accentHex).toBe('#DB2777');
    expect(TERMS.newsletter).toBe('부동산뉴스');
    expect(TERMS.inbox).toBe('고객 소통');
  });

  it('2. 뉴스레터 기구독자에게는 구독 폼 대신 소형 공유 버튼(지인에게 부동산뉴스 공유하기)을 노출한다', () => {
    const html = renderToStaticMarkup(
      React.createElement(MagazineView, {
        brokerId: 'broker-test',
        date: '2026-11-20',
        isSubscribedViewer: true,
        data: {
          headline: '강남권 11월 셋째 주 상업용 시장',
          briefing: '금주 주요 거래 요약입니다.',
          broker: { name: '홍길동', company: '크리딜중개법인', phone: '010-1234-5678' },
          featured_deals: [],
          sections_order: ['cover', 'ai_briefing', 'subscribe_cta'],
        },
      }),
    );

    expect(html).toContain('--accent:#059669');
    expect(html).toContain('data-testid="magazine-subscriber-share-btn"');
    expect(html).toContain('지인에게 부동산뉴스 공유하기');
    expect(html).not.toContain('data-testid="minimal-subscribe-submit"');

    const shareHtml = renderToStaticMarkup(
      React.createElement(SubscriberShareButton, {
        brokerId: 'broker-test',
        brokerName: '홍길동',
        date: '2026-11-20',
      }),
    );
    expect(shareHtml).toContain('지인에게 부동산뉴스 공유하기');
  });

  it('3. 딜카드 숫자(수익률·면적) 주관적 수식어 감지/제거 및 현장 강점 태그칩 + 3단 제원을 검증한다', () => {
    const warnings = detectSubjectiveNumericPhrases([
      '양호한 수익률 5.1% 건물',
      '대지 120평 연면적 450평',
      '코너 입지 가시성 우수',
    ]);
    expect(warnings).toHaveLength(2);
    expect(warnings[0].keyword).toContain('양호한 수익률');
    expect(warnings[1].pointIndex).toBe(1);

    expect(isPureAreaRepetitionPoint('대지 120평 · 연면적 450평')).toBe(true);
    expect(stripSubjectiveNumericSpin('양호한 수익률 5.1%와 넓은 대지')).toBe('수익률 5.1%와 대지');
    expect(stripSubjectiveNumericSpin('대지 120평 연면적 450평')).toBe('');

    const tags = getFieldStrengthTagsForPosture('income');
    expect(tags.length).toBeGreaterThanOrEqual(6);
    expect(tags.some((t) => t.label.includes('코너'))).toBe(true);

    expect(
      formatObjectiveYieldComparison({
        actualYieldPct: 5.2,
        benchmarkYieldPct: 4.18,
        regionLabel: '강남·서초',
      }),
    ).toContain('5.2%');
    expect(
      formatObjectiveYieldComparison({
        actualYieldPct: 3.5,
        benchmarkYieldPct: 4.18,
        regionLabel: '강남·서초',
      }),
    ).toBe('');

    const specs = buildDeal3TierSpecs({
      posture: 'income',
      priceDisplay: '120~140억',
      landAreaDisplay: '136평',
      zoningDisplay: '제2종일반주거지역',
      gfaDisplay: '450평',
      floorsDisplay: 'B1/6F',
      completionDateDisplay: '2018-05',
      depositDisplay: '5억',
      monthlyRentDisplay: '4,200만',
      yieldDisplay: '4.40%',
    });
    expect(specs.commonSpecs.map((s) => s.label)).toEqual(['매매금액', '대지면적', '용도지역']);
    expect(specs.buildingSpecs.map((s) => s.label)).toEqual(['연면적', '층수', '사용승인일']);
    expect(specs.purposeSpecs[0].label).toBe('보증금 / 월세');
  });
});
