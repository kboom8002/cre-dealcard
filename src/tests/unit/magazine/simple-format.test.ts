import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  SIMPLE_DEAL_LIMIT,
  SIMPLE_HIDDEN_SECTIONS,
  SIMPLE_NEWS_LIMIT,
  SIMPLE_SECTION_ORDER,
  SIMPLE_STARTER_CHIPS,
  applySimplePreset,
  countPreservedAdvancedItems,
  deriveFallbackBriefing,
  deriveFallbackHeadline,
  isSimpleEdition,
  isSingleCommentFieldNote,
  resolveEditorMode,
} from '@/lib/magazine/simple-format';
import {
  DEFAULT_SECTIONS,
  isSectionEnabled,
  pickTopNews,
  resolveSectionOrder,
} from '@/lib/magazine/view-helpers';
import { FieldNoteSection } from '@/components/magazine/viewer-sections';

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

describe('resolveEditorMode — 에디터 진입 모드 결정', () => {
  it('아무 입력이 없을 때 전원 기본값은 simple 이다', () => {
    expect(resolveEditorMode()).toBe('simple');
    expect(resolveEditorMode({})).toBe('simple');
    expect(resolveEditorMode({ queryMode: null, queryTab: null, savedMode: null })).toBe('simple');
  });

  it('URL ?mode=full 또는 ?mode=simple 이 최우선으로 적용된다', () => {
    expect(resolveEditorMode({ queryMode: 'full', savedMode: 'simple' })).toBe('full');
    expect(resolveEditorMode({ queryMode: 'FULL', queryTab: 'outreach', savedMode: 'simple' })).toBe('full');
    expect(resolveEditorMode({ queryMode: 'simple', queryTab: 'outreach', savedMode: 'full' })).toBe('simple');
  });

  it('URL ?tab=outreach 등 탭 파라미터가 있으면 해당 탭을 열기 위해 full 로 진입한다', () => {
    expect(resolveEditorMode({ queryTab: 'outreach' })).toBe('full');
    expect(resolveEditorMode({ queryTab: 'analytics', savedMode: 'simple' })).toBe('full');
    expect(resolveEditorMode({ queryTab: 'cover' })).toBe('full');
  });

  it('저장된 사용자 선호(savedMode)가 full 이면 full 로 진입한다', () => {
    expect(resolveEditorMode({ savedMode: 'full' })).toBe('full');
    expect(resolveEditorMode({ savedMode: 'simple' })).toBe('simple');
  });

  it('기능 플래그(simpleModeEnabled=false)가 꺼져 있으면 항상 full 을 반환한다', () => {
    expect(resolveEditorMode({ simpleModeEnabled: false })).toBe('full');
    expect(resolveEditorMode({ simpleModeEnabled: false, queryMode: 'simple', savedMode: 'simple' })).toBe('full');
  });
});

describe('isSingleCommentFieldNote — 단일 한마디 판별', () => {
  it('comment 만 채워져 있고 나머지 4개 항목이 비어 있으면 true 를 반환한다', () => {
    expect(
      isSingleCommentFieldNote({
        comment: '이번 주 역삼동 꼬마빌딩 매수 문의가 크게 늘었습니다.',
        question: '',
        buyerReaction: '   ',
        sellerReaction: '',
        marketJudgment: '',
      }),
    ).toBe(true);
    expect(isSingleCommentFieldNote({ comment: '한 줄 코멘트입니다.' })).toBe(true);
  });

  it('comment 가 비어 있거나 다른 Q&A 항목이 하나라도 있으면 false 를 반환한다', () => {
    expect(isSingleCommentFieldNote({})).toBe(false);
    expect(isSingleCommentFieldNote(null)).toBe(false);
    expect(isSingleCommentFieldNote({ comment: '   ' })).toBe(false);
    expect(
      isSingleCommentFieldNote({
        comment: '한마디 있음',
        question: '이번 주 시장은?',
      }),
    ).toBe(false);
    expect(
      isSingleCommentFieldNote({
        comment: '한마디 있음',
        buyerReaction: '매수자 관심 증가',
      }),
    ).toBe(false);
  });
});

describe('deriveFallbackHeadline & deriveFallbackBriefing — 결정론적 폴백', () => {
  it('한마디의 첫 문장에서 42자 이내 헤드라인을 추출한다', () => {
    const comment = '이번 주 강남권 실수요 매수 문의가 뚜렷하게 늘고 있습니다. 특히 역삼역 인근이 활발합니다.';
    expect(deriveFallbackHeadline(comment, '김영수')).toBe(
      '이번 주 강남권 실수요 매수 문의가 뚜렷하게 늘고 있습니다',
    );
  });

  it('첫 문장이 42자를 초과하면 40자에서 말줄임표(…)를 붙인다', () => {
    const longSentence =
      '금리 인하 기대감 속에서 강남과 서초 일대 중소형 빌딩을 찾는 법인 매수자의 문의가 눈에 띄게 증가하고 있습니다';
    const headline = deriveFallbackHeadline(longSentence, '김영수');
    expect(headline.endsWith('…')).toBe(true);
    expect(headline.length).toBeLessThanOrEqual(42);
  });

  it('한마디가 비어 있으면 중개사 이름을 포함한 기본 제목을 반환한다', () => {
    expect(deriveFallbackHeadline('', '김영수')).toBe('김영수 중개사의 이번 주 빌딩 시장 브리핑');
    expect(deriveFallbackHeadline(null)).toBe('이번 주 빌딩·상업용 부동산 핵심 브리핑');
  });

  it('deriveFallbackBriefing 은 입력된 한마디·온도·매물 수·뉴스 제목만으로 요약을 구성한다', () => {
    const text = deriveFallbackBriefing({
      comment: '이번 주 현장에서는 안정적인 임대수익 물건이 인기입니다.',
      dealCount: 2,
      marketTemp: '선별 매수',
      newsTitles: ['강남 오피스 공실률 하락', '기준금리 동결 전망'],
    });
    expect(text).toContain('이번 주 현장에서는 안정적인 임대수익 물건이 인기입니다.');
    expect(text).toContain("시장 온도는 '선별 매수'");
    expect(text).toContain('추천 매물 2건');
    expect(text).toContain('"강남 오피스 공실률 하락" 등 2건');
  });

  it('SIMPLE_STARTER_CHIPS 3종이 정의되어 있다', () => {
    expect(SIMPLE_STARTER_CHIPS).toHaveLength(3);
    for (const chip of SIMPLE_STARTER_CHIPS) {
      expect(chip.label.length).toBeGreaterThan(2);
      expect(chip.template.length).toBeGreaterThanOrEqual(10);
    }
  });
});

describe('applySimplePreset & countPreservedAdvancedItems — 간단 모드 프리셋 및 데이터 보존', () => {
  it('미작성 고급 섹션은 비활성화하고, 뉴스·매물을 최대 3건으로 제한하며 헤드라인을 자동 보충한다', () => {
    const preset = applySimplePreset(
      {
        headline: '',
        field_note: { comment: '이번 주 현장에서는 급매물 위주로 문의가 이어지고 있습니다.' },
        selected_news_ids: ['n1', 'n2', 'n3', 'n4', 'n5'],
        topNews: [
          { title: '뉴스1' },
          { title: '뉴스2' },
          { title: '뉴스3' },
          { title: '뉴스4' },
        ],
        featured_deal_ids: ['d1', 'd2', 'd3', 'd4'],
        dealHighlights: [{ id: 'd1' }, { id: 'd2' }, { id: 'd3' }, { id: 'd4' }],
      },
      { brokerName: '김영수' },
    );

    expect(isSimpleEdition(preset)).toBe(true);
    expect(preset.headline).toBe('이번 주 현장에서는 급매물 위주로 문의가 이어지고 있습니다');
    expect(preset.selected_news_ids).toHaveLength(SIMPLE_NEWS_LIMIT);
    expect(preset.topNews).toHaveLength(SIMPLE_NEWS_LIMIT);
    expect(preset.featured_deal_ids).toHaveLength(SIMPLE_DEAL_LIMIT);
    expect(preset.dealHighlights).toHaveLength(SIMPLE_DEAL_LIMIT);

    for (const id of SIMPLE_SECTION_ORDER) {
      expect(isSectionEnabled(preset.sections, id)).toBe(true);
    }
    for (const id of SIMPLE_HIDDEN_SECTIONS) {
      expect(isSectionEnabled(preset.sections, id)).toBe(false);
    }
  });

  it('전체 모드에서 이미 작성된 테마·투표·세무 데이터가 있으면 간단 모드에서도 비활성화하지 않고 보존한다', () => {
    const preset = applySimplePreset({
      headline: '직접 쓴 제목',
      field_note: { comment: '한마디' },
      theme_title: '역세권 꼬마빌딩 분석',
      theme_body_md: '본문 내용입니다.',
      poll: { question: '올해 매수 계획은?' },
      tax_clinic: { question: '법인 취득세율은?', answer: '안내입니다.' },
    });

    expect(isSectionEnabled(preset.sections, 'theme_of_week')).toBe(true);
    expect(isSectionEnabled(preset.sections, 'poll')).toBe(true);
    expect(isSectionEnabled(preset.sections, 'tax_clinic')).toBe(true);
    // 작성되지 않은 다른 고급 섹션은 여전히 false
    expect(isSectionEnabled(preset.sections, 'auction_picks')).toBe(false);
    expect(isSectionEnabled(preset.sections, 'reports')).toBe(false);
  });

  it('countPreservedAdvancedItems 가 보존 중인 고급 항목 개수와 라벨을 정확히 반환한다', () => {
    const res = countPreservedAdvancedItems({
      themeTitle: '테마 제목',
      pollQuestion: '투표 질문',
      taxQuestion: '',
      taxAnswer: '',
      fieldNote: { question: '주간 시장 요약' },
    });
    expect(res.count).toBe(3);
    expect(res.labels).toEqual(['이번 주 테마', '1-Click 투표', '현장 Q&A 상세 항목']);
  });
});

describe('resolveSectionOrder & pickTopNews — 뷰어 헬퍼 정합성', () => {
  it('customOrder 가 없을 때는 DEFAULT_SECTIONS(all/buyer/seller)를 그대로 반환한다 (Part 3 골든 호환)', () => {
    expect(resolveSectionOrder('all')).toEqual([...DEFAULT_SECTIONS.all]);
    expect(resolveSectionOrder('buyer')).toEqual([...DEFAULT_SECTIONS.buyer]);
    expect(resolveSectionOrder('seller')).toEqual([...DEFAULT_SECTIONS.seller]);
  });

  it('customOrder 에 reports 가 누락되어 있어도 auction_picks 뒤(또는 subscribe_cta 앞)에 보충한다', () => {
    const editorDefault12 = [
      'ai_briefing',
      'field_note',
      'theme_of_week',
      'featured_deals',
      'poll',
      'market_data',
      'news_curation',
      'auction_picks',
      'sentiment_index',
      'roi_calculator',
      'tax_clinic',
      'referral',
    ];
    const resolved = resolveSectionOrder('all', editorDefault12);
    expect(resolved).toContain('reports');
    expect(resolved.indexOf('reports')).toBe(resolved.indexOf('auction_picks') + 1);
    expect(resolved.slice(-2)).toEqual(['subscribe_cta', 'broker_profile']);

    // auction_picks 가 없는 짧은 customOrder 에는 reports 를 강제 주입하지 않고 subscribe_cta·broker_profile 만 뒤에 붙인다
    const minimalOrder = ['ai_briefing', 'field_note'];
    const minimalResolved = resolveSectionOrder('all', minimalOrder);
    expect(minimalResolved).toEqual([
      'ai_briefing',
      'field_note',
      'subscribe_cta',
      'broker_profile',
    ]);
  });

  it('pickTopNews 는 format: "simple" 에디션에서 기본 3건으로 제한하고, 일반 에디션은 6건을 유지한다', () => {
    const fiveNews = Array.from({ length: 5 }, (_, i) => ({
      title: `뉴스 제목 ${i + 1}`,
      summary: `요약 ${i + 1}`,
      source: '경제신문',
      sentiment: 'neutral',
    }));

    const fullPicked = pickTopNews({ topNews: fiveNews });
    expect(fullPicked).toHaveLength(5);

    const simplePicked = pickTopNews({ format: 'simple', topNews: fiveNews });
    expect(simplePicked).toHaveLength(SIMPLE_NEWS_LIMIT);
    expect(simplePicked.map((n) => n.title)).toEqual(['뉴스 제목 1', '뉴스 제목 2', '뉴스 제목 3']);
  });
});

describe('FieldNoteSection & MagazineView — 중개사의 한마디 인용 카드 및 빠른 이동 바', () => {
  it('comment 한 칸만 있을 때 "중개사의 한마디" 18px 인용 카드로 렌더링되고 빈 Q&A 라벨이 없다', () => {
    const html = renderToStaticMarkup(
      React.createElement(FieldNoteSection, {
        fieldNote: { comment: '이번 주 현장에서는 실수요 문의가 꾸준합니다.' },
        brokerName: '김영수',
        company: '딜카드부동산중개법인',
      }),
    );
    expect(html).toContain('data-testid="field-note-quote-card"');
    expect(html).toContain('중개사의 한마디');
    expect(html).toContain('text-reader');
    expect(html).toContain('leading-[1.8]');
    expect(html).toContain('이번 주 현장에서는 실수요 문의가 꾸준합니다.');
    expect(html).toContain('김영수');
    expect(html).toContain('딜카드부동산중개법인');
    expect(html).not.toContain('이번 주 시장');
    expect(html).not.toContain('매수 반응');
    expect(html).not.toContain('매도 반응');
  });

  it('question 등 다른 Q&A 항목이 함께 있으면 기존 "현장 노트" 레이아웃을 그대로 유지한다', () => {
    const html = renderToStaticMarkup(
      React.createElement(FieldNoteSection, {
        fieldNote: {
          question: '이번 주 강남 시장은?',
          buyerReaction: '급매 위주 문의',
          comment: '선별 접근이 필요합니다.',
        },
        brokerName: '김영수',
      }),
    );
    expect(html).not.toContain('data-testid="field-note-quote-card"');
    expect(html).toContain('김영수의 현장 노트');
    expect(html).toContain('이번 주 시장');
    expect(html).toContain('매수 반응');
    expect(html).toContain('중개인 한마디');
  });

  it('간단 모드 발행본 뷰어에서 빠른 이동 바가 실제 렌더된 섹션(한마디·매물·뉴스·계산기)만 노출한다', () => {
    const simpleData = applySimplePreset(
      {
        broker: { name: '김영수', company: '딜카드부동산', phone: '010-1234-5678' },
        briefing: '3줄 요약 브리핑입니다.',
        field_note: { comment: '실수요 매수 문의가 꾸준히 이어지고 있습니다.' },
        featured_deals: [{ id: 'd1', assetType: '꼬마빌딩', address: '역삼동', price: 6_500_000_000 }],
        topNews: [
          { title: '뉴스 1', summary: '요약 1', sentiment: 'bullish' },
          { title: '뉴스 2', summary: '요약 2', sentiment: 'neutral' },
          { title: '뉴스 3', summary: '요약 3', sentiment: 'bearish' },
          { title: '뉴스 4', summary: '요약 4', sentiment: 'neutral' },
        ],
      },
      { brokerName: '김영수' },
    );

    const html = renderToStaticMarkup(
      React.createElement(MagazineView, {
        data: simpleData,
        brokerId: 'kim-jung-gae',
        brokerSlug: 'kim-jung-gae',
        date: '2026-10-16',
        dateLabel: '2026년 10월 16일 (금)',
      }),
    );

    expect(html).toContain('💬 중개사의 한마디');
    expect(html).toContain('🏢 주목 매물');
    expect(html).toContain('📰 주요 뉴스');
    expect(html).toContain('🧮 수익률 계산기');
    expect(html).not.toContain('💰 세무·법률');
    expect(html).not.toContain('📊 이번 주 투표');
  });
});
