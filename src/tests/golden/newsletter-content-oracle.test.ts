/**
 * @file src/tests/golden/newsletter-content-oracle.test.ts
 * @description Layer B · 뉴스레터 8대 골든 × 4종 산출물(공개 웹 뷰어 · 이메일 HTML/Text · 카카오 알림톡 · OG 카드)
 *              오프라인 "콘텐츠 적합성 7축 + 법정 표기 + 크로스-패리티" 오라클 (0원 · LLM 호출 0회).
 *
 * NL-G1: 월간 표준호 (monthly, 강남·서초, public_db 통계 2선, 추천 매물 3선, 5대 채널 균형)
 * NL-G2: 주간 브리핑 (weekly, 마포·성수, reference_benchmark 참고치, 매물 1선, Cap Rate/NOI 영문 병기)
 * NL-G3: 일간 무매물 브리핑 (daily, 매물 0건, Provenance Honesty: "공적장부 교차검증" 미노출)
 * NL-G4: 호외/세무 특집 (special, 2026 세무 클리닉 연동, 면책 및 세법 기준 표기)
 * NL-G5: 60대 간편모드 (format='simple', 미편집 서식 플레이스홀더 제거 및 정규 발행 호환)
 * NL-G6: 적대적 콘텐츠 스트레스 (가십·확정수익 권유·미출처 수치·모순·말줄임 잘림·내부 라벨 100% 차단)
 * NL-G7: 법정·발송 경계 스트레스 (야간 22시, 미동의, 미확인, 수신거부, (광고)/해지 누락, 5대 법정항목 누락, 지번 마스킹)
 * NL-G8: RSS 장애·오프라인 폴백 (CURATED_CHANNEL_POOL 단독 사용 정직 판별 + 유효 원문 URL + 빈 구독자 대응)
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/script', () => ({ default: () => null }));
vi.mock('next/navigation', () => ({ usePathname: () => '/magazine/hanseong-cre/2026-11-19' }));
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
import { renderMagazineEmail } from '@/domain/magazine/email-template';
import { renderMagazineKakaoText } from '@/domain/magazine/templates/kakao-text';
import {
  runMagazineQualityGate,
  runNewsletterContentSuitabilityGate,
} from '@/domain/magazine/quality-gate';
import { evaluateGate, type GateInput } from '@/domain/magazine/send-gate';
import { buildDefaultMonthlyGraphicPair } from '@/domain/magazine/monthly-stats-hydration';
import { CURATED_CHANNEL_POOL, resolveNewsChannel } from '@/domain/magazine/news-channels';
import { buildImageModel } from '@/lib/magazine/og-image-data';
import { normalizeContentForPublish } from '@/lib/magazine/edition-save';
import { assertPublishable } from '@/lib/legal/publish-gate';
import { stripUneditedFormatPlaceholders } from '@/lib/magazine/simple-format';

const GOLD_BROKER = {
  id: 'hanseong-cre',
  name: '박준영',
  displayName: '박준영',
  company: '한성빌딩부동산중개법인',
  officeAddress: '서울특별시 강남구 테헤란로 318',
  phone: '010-3482-9104',
  officeRegNumber: '11680-2025-04719',
  representativeName: '박준영',
  tagline: '강남·성수 중소형 빌딩 실거래 데이터 자문',
  specialtyRegions: ['강남구', '서초구', '성동구'],
  specialtyAssets: ['올근생 빌딩', '사옥형 오피스'],
};

const GOLD_ISSUES_MONTHLY = [
  {
    id: 'iss-1',
    title: '테헤란로 이면 꼬마빌딩 매매 호가 안정세 전환',
    brief: '급매 소진 후 우량 근생 위주 실수요 문의가 꾸준히 유입되고 있습니다.',
    source: '한국경제 부동산',
    url: 'https://www.hankyung.com/realestate',
    channel: 'real_estate',
    memoTone: 'amber',
  },
  {
    id: 'iss-2',
    title: '기준금리 동결 기조 속 시중은행 담보대출 금리 완만 하락',
    brief: '조달 금리 안정으로 보수적 레버리지 매수 검토가 재개되는 흐름입니다.',
    source: '매일경제 금융',
    url: 'https://www.mk.co.kr/news/economy/',
    channel: 'economy_finance',
    memoTone: 'sky',
  },
  {
    id: 'iss-3',
    title: '꼬마빌딩 가족법인·증여 승계 시 감정평가 활용 상담 증가',
    brief: '취득세와 양도세 부담을 비교해 보유 구조를 점검하는 건물주가 늘고 있습니다.',
    source: '세무·자산 저널',
    url: 'https://www.sedaily.com/NewsList/GD01',
    channel: 'tax_wealth',
    memoTone: 'mint',
  },
  {
    id: 'iss-4',
    title: '성수·한남 1층 리테일 체험형 플래그십 장기 임차 강세',
    brief: '층고와 전면 노출을 갖춘 단독 건물의 브랜드 임대 선호가 이어지고 있습니다.',
    source: '리테일 트렌드',
    url: 'https://www.mk.co.kr/news/business/',
    channel: 'commercial_trend',
    memoTone: 'lavender',
  },
  {
    id: 'iss-5',
    title: '노후 근생 벽돌 리모델링으로 공실 해소 및 임차 수준 상향',
    brief: '과도한 신축 대신 외관과 출입구 동선만 손봐도 건물 경쟁력이 높아집니다.',
    source: '건축·디자인 저널',
    url: 'https://www.hankyung.com/life',
    channel: 'culture_lifestyle',
    memoTone: 'peach',
  },
];

const GOLD_DEALS = [
  {
    id: '44444444-4444-4444-8444-444444444401',
    title: '역삼역 도보 4분 올근생 코너 빌딩',
    assetType: '올근생 빌딩',
    address: '서울특별시 강남구 역삼동 736-1',
    price: 14_500_000_000,
    priceWon: 14_500_000_000,
    grossYieldNetOfDeposit: 4.85,
    deposit: 700_000_000,
    monthlyRent: 55_000_000,
    landAreaM2: 396.7,
    grossFloorAreaM2: 1290.4,
    zoning: '제2종일반주거지역',
    floors: '지하1층/지상6층',
    totalFloors: 6,
    investmentPoint: '병의원·유명 카페 장기 임차로 공실 위험이 낮습니다',
    imUrl: '/im-lite/44444444-4444-4444-8444-444444444401',
  },
  {
    id: '44444444-4444-4444-8444-444444444402',
    title: '서초교대역 이면 사옥형 근생 빌딩',
    assetType: '사옥형 오피스',
    address: '서울특별시 서초구 서초동 1672-9',
    price: 18_200_000_000,
    priceWon: 18_200_000_000,
    grossYieldNetOfDeposit: 4.6,
    landAreaM2: 495.8,
    grossFloorAreaM2: 1750.0,
    zoning: '일반상업지역',
    floors: '지하2층/지상7층',
    totalFloors: 7,
    investmentPoint: '전 층 명도 가능해 법인 사옥 이전 수요에 적합합니다',
    imUrl: '/im-lite/44444444-4444-4444-8444-444444444402',
  },
  {
    id: '44444444-4444-4444-8444-444444444403',
    title: '논현동 리모델링 완료 근생 빌딩',
    assetType: '올근생 빌딩',
    address: '서울특별시 강남구 논현동 214-8',
    price: 11_800_000_000,
    priceWon: 11_800_000_000,
    grossYieldNetOfDeposit: 5.1,
    landAreaM2: 312.0,
    grossFloorAreaM2: 980.0,
    zoning: '제3종일반주거지역',
    floors: '지하1층/지상5층',
    totalFloors: 5,
    investmentPoint: '최근 외벽·승강기 수선 완료로 추가 수선비 부담이 적습니다',
    imUrl: '/im-lite/44444444-4444-4444-8444-444444444403',
  },
];

function renderViewerHtml(content: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    React.createElement(MagazineView, {
      data: { broker: GOLD_BROKER, ...content },
      brokerId: GOLD_BROKER.id,
      brokerSlug: GOLD_BROKER.id,
      date: '2026-11-19',
      dateLabel: '2026년 11월 19일 (목)',
      ...extra,
    } as React.ComponentProps<typeof MagazineView>),
  );
}

describe('Layer B · 뉴스레터 8대 골든 × 4종 산출물 콘텐츠 적합성 오라클', () => {
  const prevEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of ['MAGAZINE_SEND_ENABLED', 'MAGAZINE_SEND_DRY_RUN', 'MAGAZINE_SEND_ALLOWLIST']) {
      prevEnv[k] = process.env[k];
    }
    process.env.MAGAZINE_SEND_ENABLED = '1';
    delete process.env.MAGAZINE_SEND_ALLOWLIST;
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(prevEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('NL-G1: 월간 표준호 — 웹뷰어·이메일·알림톡·OG 4종 크로스-패리티 + 지번 마스킹 + public_db 배지', async () => {
    const publicCharts = buildDefaultMonthlyGraphicPair('gbd', 'molit_bok').map((chart) => ({
      ...chart,
      sourceMode: 'public_db' as const,
      sourceLabel: '국토부 실거래가·한국은행 공식 DB 실측',
    }));

    const norm = normalizeContentForPublish({
      content: {
        headline: '11월 강남·서초 중소형 빌딩 월간 자산관리 리포트',
        briefing:
          '강남·서초 핵심 상권은 우량 임차인을 확보한 근생 빌딩 위주로 실수요 문의가 이어지고 있습니다.\n보수적 대출 조건에서도 현금흐름이 안정적인 자산이 선별 거래되는 흐름입니다.',
        market_temp: '선별 매수',
        unitIssues: GOLD_ISSUES_MONTHLY,
        monthlyCharts: publicCharts,
        featured_deals: GOLD_DEALS,
      },
      broker: {
        name: GOLD_BROKER.name,
        slug: GOLD_BROKER.id,
        company: GOLD_BROKER.company,
        phone: GOLD_BROKER.phone,
        photoUrl: null,
        tagline: GOLD_BROKER.tagline,
        specialtyRegions: GOLD_BROKER.specialtyRegions,
        specialtyAssets: GOLD_BROKER.specialtyAssets,
      },
      kind: 'monthly',
      issueDate: '2026-11-19',
      nowIso: '2026-11-19T09:00:00.000Z',
    });

    expect(norm.ok).toBe(true);
    if (!norm.ok) return;

    // 1. 발행 법정 게이트 5대 항목 통과
    const pubGate = await assertPublishable({
      supabase: null,
      userId: '00000000-0000-4000-8000-000000000011',
      kind: 'magazine',
      brokerMetaOverride: {
        company: GOLD_BROKER.company,
        office_address: GOLD_BROKER.officeAddress,
        phone: GOLD_BROKER.phone,
        office_reg_number: GOLD_BROKER.officeRegNumber,
        representative_name: GOLD_BROKER.representativeName,
      },
    });
    expect(pubGate.ok).toBe(true);

    // 2. 콘텐츠 적합성 게이트 통과 + 5대 채널 모두 커버
    const suit = runNewsletterContentSuitabilityGate(norm.content, { cadence: 'monthly' });
    expect(suit.passed).toBe(true);
    expect(suit.hardViolations).toHaveLength(0);
    expect(suit.reviewWarnings).toHaveLength(0);
    expect(suit.isFallbackCuratedOnly).toBe(false);

    const coveredChannels = new Set(GOLD_ISSUES_MONTHLY.map((i) => resolveNewsChannel(i)));
    expect(coveredChannels.size).toBe(5);

    // 3. 4종 산출물 동시 렌더링
    const viewerHtml = renderViewerHtml(norm.content);
    const email = renderMagazineEmail({
      brokerName: GOLD_BROKER.name,
      officeName: GOLD_BROKER.company,
      brokerContact: GOLD_BROKER.phone,
      senderAddress: GOLD_BROKER.officeAddress,
      officeRegNumber: GOLD_BROKER.officeRegNumber,
      representativeName: GOLD_BROKER.representativeName,
      subscriberName: '김건물주',
      edition: {
        cadence: 'monthly',
        title: String(norm.content.headline),
        headline: String(norm.content.briefing),
        marketTemp: '선별 매수',
        date: '2026-11-19',
        url: 'https://credeal.kr/magazine/hanseong-cre/2026-11-19',
        deals: GOLD_DEALS.map((d) => ({ title: d.title, address: d.address, price: d.priceWon })),
        topNews: GOLD_ISSUES_MONTHLY.map((n) => ({ title: n.title, source: n.source })),
      },
      unsubscribeUrl: 'https://credeal.kr/unsubscribe?t=gold-nl-g1',
      isAd: true,
    });
    const kakao = renderMagazineKakaoText({
      brokerName: GOLD_BROKER.name,
      officeName: GOLD_BROKER.company,
      brokerContact: GOLD_BROKER.phone,
      senderAddress: GOLD_BROKER.officeAddress,
      officeRegNumber: GOLD_BROKER.officeRegNumber,
      representativeName: GOLD_BROKER.representativeName,
      subscriberName: '김건물주',
      edition: {
        cadence: 'monthly',
        title: String(norm.content.headline),
        headline: '강남·서초 우량 근생 실수요 중심 선별 거래',
        marketTemp: '선별 매수',
        date: '2026-11-19',
        url: 'https://credeal.kr/magazine/hanseong-cre/2026-11-19',
      },
      unsubscribeUrl: 'https://credeal.kr/unsubscribe?t=gold-nl-g1',
      isAd: true,
    });
    const ogModel = buildImageModel(
      { ...(norm.content as Record<string, unknown>), featured_deals: GOLD_DEALS },
      { name: GOLD_BROKER.name, company: GOLD_BROKER.company, phone: GOLD_BROKER.phone },
      '2026-11-19',
    );

    expect(ogModel).not.toBeNull();
    // 크로스-패리티: 제목, 월간 주기 문구, 5대 법정 표기, (광고), 지번 동단위 마스킹
    expect(viewerHtml).toContain('11월 강남·서초 중소형 빌딩 월간 자산관리 리포트');
    expect(viewerHtml).toContain('CREDEAL 안심 매거진 · 공적장부 교차검증');
    expect(email.subject).toContain('(광고)');
    expect(email.subject).toContain('11월 강남·서초 중소형 빌딩 월간 자산관리 리포트');
    expect(email.html).toContain('월간 부동산 브리핑');
    expect(email.html).toContain(GOLD_BROKER.officeRegNumber);
    expect(email.text).toContain('역삼동');
    expect(kakao.text).toContain('이번 달 매거진이 도착했습니다.');
    expect(kakao.hasAdLabel).toBe(true);
    expect(kakao.hasUnsubscribeLink).toBe(true);

    // 상세 지번(번지) 유출 0건 across all 4 outputs
    const leaks = ['736-1', '1672-9', '214-8'];
    for (const lot of leaks) {
      expect(viewerHtml).not.toContain(lot);
      expect(email.html).not.toContain(lot);
      expect(email.text).not.toContain(lot);
      expect(kakao.text).not.toContain(lot);
      expect(JSON.stringify(ogModel)).not.toContain(lot);
    }
    expect(ogModel?.deals[0]?.address).toContain('역삼동');
  });

  it('NL-G2: 주간 브리핑 — 주간 주기 정합 + 참고 기준치(reference_benchmark) 정직성 + CRE 약어 한글 병기', () => {
    const refCharts = buildDefaultMonthlyGraphicPair('seongsu', 'molit_bok');
    expect(refCharts.every((c) => c.sourceMode === 'reference_benchmark')).toBe(true);

    const content = {
      kind: 'weekly',
      headline: '11월 3주 성수·마포 주간 상권 및 Cap Rate 점검',
      briefing: '성수 리테일 거리는 Cap Rate와 NOI 관리 수준이 매매가 방어의 핵심입니다.',
      unitIssues: GOLD_ISSUES_MONTHLY,
      monthlyCharts: refCharts,
      featured_deals: [GOLD_DEALS[0]],
    };
    const suit = runNewsletterContentSuitabilityGate(content, { cadence: 'weekly' });
    expect(suit.passed).toBe(true);

    const email = renderMagazineEmail({
      brokerName: GOLD_BROKER.name,
      brokerContact: GOLD_BROKER.phone,
      edition: {
        cadence: 'weekly',
        title: content.headline,
        headline: content.briefing,
        marketTemp: '선별 매수',
        date: '2026-11-19',
        url: 'https://credeal.kr/magazine/hanseong-cre/2026-11-19',
        deals: [
          {
            title: GOLD_DEALS[0].title,
            address: GOLD_DEALS[0].address,
            price: GOLD_DEALS[0].priceWon,
          },
        ],
      },
      unsubscribeUrl: 'https://credeal.kr/unsubscribe?t=gold-nl-g2',
      isAd: true,
    });
    const kakao = renderMagazineKakaoText({
      brokerName: GOLD_BROKER.name,
      brokerContact: GOLD_BROKER.phone,
      edition: {
        cadence: 'weekly',
        title: content.headline,
        headline: content.briefing,
        marketTemp: '관망',
        date: '2026-11-19',
        url: 'https://credeal.kr/magazine/hanseong-cre/2026-11-19',
      },
      unsubscribeUrl: 'https://credeal.kr/unsubscribe?t=gold-nl-g2',
      isAd: true,
    });

    expect(email.html).toContain('주간 부동산 브리핑');
    expect(email.html).toContain('임대수익률(Cap Rate)');
    expect(email.html).toContain('순영업소득(NOI)');
    expect(kakao.text).toContain('이번 주 매거진이 도착했습니다.');
    expect(kakao.text).toContain('연 임대수익률(Cap Rate)');
  });

  it('NL-G3: 일간 무매물 브리핑 — 공적장부 미검증 배지 정직 생략 + 일간 주기 4종 정합', () => {
    const content = {
      kind: 'daily',
      headline: '오늘의 강남권 상업용 부동산 일간 핵심 요약',
      briefing: '한은 금통위 동결 이후 우량 입지 근생 빌딩의 매수 문의가 점진적으로 회복 중입니다.',
      unitIssues: GOLD_ISSUES_MONTHLY,
      featured_deals: [],
    };
    const suit = runNewsletterContentSuitabilityGate(content, { cadence: 'daily' });
    expect(suit.passed).toBe(true);

    const viewerHtml = renderViewerHtml(content);
    const email = renderMagazineEmail({
      brokerName: GOLD_BROKER.name,
      brokerContact: GOLD_BROKER.phone,
      edition: {
        cadence: 'daily',
        title: content.headline,
        headline: content.briefing,
        marketTemp: '관망',
        date: '2026-11-19',
        url: 'https://credeal.kr/magazine/hanseong-cre/2026-11-19',
        deals: [],
      },
      unsubscribeUrl: 'https://credeal.kr/unsubscribe?t=gold-nl-g3',
      isAd: true,
    });
    const kakao = renderMagazineKakaoText({
      brokerName: GOLD_BROKER.name,
      brokerContact: GOLD_BROKER.phone,
      edition: {
        cadence: 'daily',
        title: content.headline,
        headline: content.briefing,
        marketTemp: '관망',
        date: '2026-11-19',
        url: 'https://credeal.kr/magazine/hanseong-cre/2026-11-19',
      },
      unsubscribeUrl: 'https://credeal.kr/unsubscribe?t=gold-nl-g3',
      isAd: true,
    });

    // 무매물 + 공공 DB 차트 없음 → "공적장부 교차검증" 절대 미노출
    expect(viewerHtml).toContain('CREDEAL 안심 매거진');
    expect(viewerHtml).not.toContain('공적장부 교차검증');
    expect(email.html).toContain('일간 부동산 브리핑');
    expect(email.html).not.toContain('이번 호 주목 매물');
    expect(kakao.text).toContain('오늘의 부동산 브리핑이 도착했습니다.');
  });

  it('NL-G4: 호외/세무 특집 — 2026 세무 클리닉 연동 + 호외 주기 라벨 정합', () => {
    const content = {
      kind: 'special',
      headline: '2026년 꼬마빌딩 증여·가족법인 세무 전략 호외 특집',
      briefing: '올해 기준 상업용 빌딩 승계 시 부담부증여와 법인 현물출자 유불리를 짚어드립니다.',
      unitIssues: GOLD_ISSUES_MONTHLY,
    };
    const suit = runNewsletterContentSuitabilityGate(content, { cadence: 'special' });
    expect(suit.passed).toBe(true);

    const email = renderMagazineEmail({
      brokerName: GOLD_BROKER.name,
      brokerContact: GOLD_BROKER.phone,
      edition: {
        cadence: 'special',
        title: content.headline,
        headline: content.briefing,
        marketTemp: '관망',
        date: '2026-11-19',
        url: 'https://credeal.kr/magazine/hanseong-cre/2026-11-19',
        taxClinic: {
          title: '2026 상업용 빌딩 승계 세무 체크',
          scenario: '시가 80억 원 빌딩 자녀 증여 시 일반 증여 vs 부담부증여 세액 비교',
          conclusion: '담보대출 승계분 양도세율과 증여세 누진 구간을 함께 계산해야 합니다. 본 안내는 일반 참고용이며 최종 신고는 세무사 검토가 필요합니다.',
        },
      },
      unsubscribeUrl: 'https://credeal.kr/unsubscribe?t=gold-nl-g4',
      isAd: true,
    });
    const kakao = renderMagazineKakaoText({
      brokerName: GOLD_BROKER.name,
      brokerContact: GOLD_BROKER.phone,
      edition: {
        cadence: 'special',
        title: content.headline,
        headline: content.briefing,
        marketTemp: '관망',
        date: '2026-11-19',
        url: 'https://credeal.kr/magazine/hanseong-cre/2026-11-19',
      },
      unsubscribeUrl: 'https://credeal.kr/unsubscribe?t=gold-nl-g4',
      isAd: true,
    });

    expect(email.html).toContain('호외 부동산 브리핑');
    expect(email.html).toContain('2026 상업용 빌딩 승계 세무 체크');
    expect(email.html).toContain('세무사 검토');
    expect(kakao.text).toContain('부동산 호외 브리핑이 도착했습니다.');
  });

  it('NL-G5: 60대 간편모드(simple) — 미편집 서식 플레이스홀더 제거 및 정규 발행 게이트 호환', () => {
    const cleanedNote = stripUneditedFormatPlaceholders(
      '■ 소제목을 입력해 주세요\n■ 이번 주 강남 임차 동향\n「강조할 문구」\n우량 병의원 입점 문의가 꾸준히 이어지고 있습니다.\n────────────────────',
    );
    expect(cleanedNote).not.toContain('소제목을 입력해 주세요');
    expect(cleanedNote).not.toContain('강조할 문구');

    const norm = normalizeContentForPublish({
      content: {
        format: 'simple',
        headline: '이번 주 현장 매수자 동향 간편 브리핑',
        quickNote: cleanedNote,
        field_note: { comment: cleanedNote },
      },
      broker: {
        name: GOLD_BROKER.name,
        slug: GOLD_BROKER.id,
        company: GOLD_BROKER.company,
        phone: GOLD_BROKER.phone,
        photoUrl: null,
        tagline: GOLD_BROKER.tagline,
        specialtyRegions: GOLD_BROKER.specialtyRegions,
        specialtyAssets: GOLD_BROKER.specialtyAssets,
      },
      kind: 'weekly',
      issueDate: '2026-11-19',
      nowIso: '2026-11-19T09:00:00.000Z',
    });

    expect(norm.ok).toBe(true);
    if (!norm.ok) return;
    const suit = runNewsletterContentSuitabilityGate(norm.content, { cadence: 'weekly' });
    expect(suit.passed).toBe(true);
  });

  it('NL-G6: 적대적 콘텐츠 스트레스 — 가십·투자권유·내부라벨·잘린문장·미출처숫자·지표모순 100% 차단', () => {
    const hostileContent = {
      kind: 'monthly',
      market_temp: '적극 매수',
      headline: '오늘의 일간 금리 인하에 따른…',
      briefing:
        '핵심 팩트: 강남 공실률 2.3% 기록, 연 확정 수익 100% 보장으로 매수 과열 양상과 공실률 사상 최고치 경신이 동시에 나타남.',
      unitIssues: [
        {
          id: 'bad-1',
          title: '유명 여가수 200억짜리 자택 경매에 나온',
          brief: '열애설과 이혼 소송 여파로 자택 경매가 유찰되며…',
          channel: 'real_estate',
        },
      ],
    };

    const suit = runNewsletterContentSuitabilityGate(hostileContent, { cadence: 'monthly' });
    expect(suit.passed).toBe(false);
    expect(suit.hardViolations.length).toBeGreaterThanOrEqual(2);
    expect(suit.detectedSolicitations).toEqual(expect.arrayContaining(['100% 보장', '확정 수익']));
    expect(suit.gossipIssueTitles.length).toBeGreaterThanOrEqual(1);
    expect(suit.truncatedFields.length).toBeGreaterThanOrEqual(2);
    expect(suit.cadenceMismatches.length).toBeGreaterThanOrEqual(1);

    const qg = runMagazineQualityGate(
      hostileContent.briefing,
      { recentDealsCount: 2 },
      { marketTemp: '적극 매수' },
    );
    expect(qg.passed).toBe(false);
    expect(qg.failureReasons).toContain('UNMATCHED_CLAIMS');
    expect(qg.failureReasons).toContain('CONTRADICTION');
  });

  it('NL-G7: 법정·발송 경계 스트레스 — 야간(22시 KST)·미동의·미확인·수신거부·(광고)누락·5대법정누락 100% 차단', async () => {
    const daytimeKst = new Date('2026-11-19T14:00:00+09:00');
    const nightKst = new Date('2026-11-19T22:30:00+09:00');

    const baseInput: GateInput = {
      subscriber: {
        id: '55555555-5555-4555-8555-555555555501',
        subscriber_email: 'owner@example.com',
        channel: 'email',
        status: 'active',
        marketing_consent_at: '2026-11-01T09:00:00Z',
        confirm_status: 'confirmed',
        night_consent: false,
      },
      channel: 'email',
      editionKey: 'hanseong-cre:2026-11-19:monthly',
      brokerId: 'hanseong-cre',
      kind: 'weekly',
      rendered: {
        subject: '(광고) 한성빌딩부동산중개법인 월간 리포트',
        body: '<html>(광고)</html>',
        hasUnsubscribeLink: true,
        hasAdLabel: true,
        senderName: GOLD_BROKER.name,
        senderContact: GOLD_BROKER.phone,
      },
    };

    expect(evaluateGate(baseInput, daytimeKst, true)).toBeNull();
    expect(evaluateGate(baseInput, nightKst, true)).toEqual({ blocked: 'QUIET_HOURS' });
    expect(
      evaluateGate(
        { ...baseInput, subscriber: { ...baseInput.subscriber, marketing_consent_at: null } },
        daytimeKst,
        true,
      ),
    ).toEqual({ blocked: 'NO_CONSENT' });
    expect(
      evaluateGate(
        { ...baseInput, subscriber: { ...baseInput.subscriber, confirm_status: 'pending' } },
        daytimeKst,
        true,
      ),
    ).toEqual({ blocked: 'PENDING_CONFIRM' });
    expect(
      evaluateGate(
        { ...baseInput, subscriber: { ...baseInput.subscriber, status: 'unsubscribed' } },
        daytimeKst,
        true,
      ),
    ).toEqual({ blocked: 'UNSUBSCRIBED' });
    expect(
      evaluateGate(
        {
          ...baseInput,
          rendered: { ...baseInput.rendered, subject: '일반 안내 메일', hasAdLabel: false },
        },
        daytimeKst,
        true,
      ),
    ).toEqual({ blocked: 'MISSING_AD_LABEL' });

    const incompleteStatutory = await assertPublishable({
      supabase: null,
      userId: '00000000-0000-4000-8000-000000000099',
      kind: 'magazine',
      brokerMetaOverride: {
        company: GOLD_BROKER.company,
        office_address: GOLD_BROKER.officeAddress,
        phone: GOLD_BROKER.phone,
        office_reg_number: '',
        representative_name: '',
      },
    });
    expect(incompleteStatutory.ok).toBe(false);
    if (!incompleteStatutory.ok) {
      expect(incompleteStatutory.status).toBe(422);
      expect(incompleteStatutory.missingFields).toContain('office_reg_number');
    }
  });

  it('NL-G8: RSS 장애·오프라인 폴백 — CURATED_CHANNEL_POOL 단독 사용 정확 판별 + 전 원문 URL 유효성', () => {
    const fallbackIssues = CURATED_CHANNEL_POOL.slice(0, 5).map((item, idx) => ({
      id: item.id,
      title: item.cardTitle ?? item.title,
      brief: item.cardBrief ?? item.summary,
      source: item.source,
      url: item.url,
      channel: item.channel,
      memoTone: idx % 2 === 0 ? 'amber' : 'sky',
    }));

    const suit = runNewsletterContentSuitabilityGate(
      {
        kind: 'monthly',
        headline: '11월 강남권 상업용 부동산 월간 시장 요약',
        unitIssues: fallbackIssues,
      },
      { cadence: 'monthly' },
    );

    expect(suit.passed).toBe(true);
    expect(suit.isFallbackCuratedOnly).toBe(true);
    for (const item of CURATED_CHANNEL_POOL) {
      expect(item.url).toMatch(/^https:\/\//);
    }
  });
});
