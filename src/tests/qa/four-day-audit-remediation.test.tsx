/**
 * @file src/tests/qa/four-day-audit-remediation.test.tsx
 * @description 4-Day Audit Remediation Regression Suite (Waves 1–3)
 *
 * Covers:
 *  1. Inbox `kakaoBrief` propagation in `buildKakaoOutreachPreset`, `buildInboxCopyBundle`, and `sendInboxClientEmail` HTML/text
 *  2. Newsletter email `<ul><li>` 3-line bullets (`parseMarketBriefingBullets`), blind `priceBand` prioritized over `priceWon`, up to 5 issues with short sources, and `computeNextKst0830Iso`
 *  3. Newsletter `toneStance` <-> `mapToneStanceToMarketTemp` round-trip & `showMarketTempBadge` default false behavior
 *  4. DealCard `normalizeCard4PointCandidates` preservation, `blind-guard` masking `연무장7길 11`, and `memo-pairing` preserving `양평동4가`/`을지로3가`
 *  5. Mobile IM `formatPnuLotShortLabel` mountain `산` lot handling & `/api/public/map/cadastral` handler / PNU validation
 *  6. PPTX `toPptxBrokerInput` / `buildA01Cover` / `buildA10Closing` separating `representative_name` from `display_name`
 *  7. `MINIMAL_ESSENTIAL_GLOSSARY` free of legacy `10년 땅값 단순합산` / `고객 소식지` and `/broker/profile` default collapsed state (`useState(false)`)
 */

import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';
import PptxGenJS from 'pptxgenjs';
import JSZip from 'jszip';

const cadastralMocks = vi.hoisted(() => ({
  fetchCadastralMapImage: vi.fn(),
}));

vi.mock('@/lib/external/vworld-wms-cadastral', () => ({
  fetchCadastralMapImage: (...args: unknown[]) => cadastralMocks.fetchCadastralMapImage(...args),
}));

import { buildKakaoOutreachPreset } from '@/app/(broker)/broker/w/inbox/_components/inbox-types';
import { buildInboxCopyBundle, sendInboxClientEmail } from '@/domain/inbox/inbox-outbound';
import { parseMarketBriefingBullets } from '@/domain/magazine/issue-clustering';
import { renderMagazineEmail } from '@/domain/magazine/email-template';
import { hydrateEditionForOutboundEmail } from '@/domain/magazine/send-batch';
import { computeNextKst0830Iso } from '@/domain/magazine/distribute-queue';
import {
  mapMarketTempToToneStance,
  mapToneStanceToMarketTemp,
} from '@/app/(broker)/broker/magazine-editor/_components/magazine-workspace-types';
import { NewsletterPreviewCard } from '@/app/(broker)/broker/magazine-editor/_components/NewsletterPreviewCard';
import { MagazineView } from '@/app/(magazine)/magazine/[brokerId]/[date]/magazine-view';
import { normalizeCard4PointCandidates } from '@/lib/deal-card/card4-schema';
import { cleanBlindPoints } from '@/lib/deal-card/blind-guard';
import { parseMemoIntoCard4 } from '@/lib/deal-card/memo-pairing';
import { formatPnuLotShortLabel } from '@/lib/address/multi-parcel-format';
import { GET as getCadastralMapRoute } from '@/app/api/public/map/cadastral/route';
import { toPptxBrokerInput } from '@/domain/broker/broker-contact';
import { buildA01Cover } from '@/domain/building/mobile-im/pptx/archetypes/a01-cover';
import { buildA10Closing } from '@/domain/building/mobile-im/pptx/archetypes/a10-closing';
import { MINIMAL_ESSENTIAL_GLOSSARY } from '@/lib/tutorial/minimal-guide-data';

const ROOT = process.cwd();
const readRepoFile = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

async function renderSlideXmlTexts(buildFn: (pres: PptxGenJS) => Promise<void> | void): Promise<string> {
  const pres = new PptxGenJS();
  pres.layout = 'LAYOUT_WIDE';
  await buildFn(pres);
  const buf = (await pres.write({ outputType: 'nodebuffer' })) as Buffer;
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file('ppt/slides/slide1.xml')!.async('string');
  return (xml.match(/<a:t>([^<]*)<\/a:t>/g) ?? [])
    .map((t) =>
      t
        .replace(/<\/?a:t>/g, '')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&'),
    )
    .join(' ');
}

describe('Four-Day Audit Remediation Regression Suite (Waves 1–3)', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    cadastralMocks.fetchCadastralMapImage.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('1. Inbox kakaoBrief propagation across preset, copy bundle & transactional email', () => {
    const kakaoBrief = '대지 140평 코너 근생이며 1층 스타벅스 장기 임차로 안정적입니다.';
    const shareUrl = 'https://credeal.net/dc/deal-123?sid=tok_abc';

    it('includes brief in buildKakaoOutreachPreset and buildInboxCopyBundle', () => {
      const kakaoText = buildKakaoOutreachPreset('followup_meeting', {
        clientName: '박대표',
        buildingTitle: '성수동 코너 근생',
        shareUrl,
        headline: '성수역 도보 3분 우량 매물',
        brief: kakaoBrief,
      });
      expect(kakaoText).toContain(kakaoBrief);
      expect(kakaoText).toContain('성수역 도보 3분 우량 매물');
      expect(kakaoText).toContain(shareUrl);

      const bundle = buildInboxCopyBundle({
        brokerName: '김선임',
        brokerPhone: '010-1111-2222',
        clientName: '박대표',
        buildingTitle: '성수동 코너 근생',
        shareUrl,
        headline: '성수역 도보 3분 우량 매물',
        brief: kakaoBrief,
        assetKind: 'dealcard',
      });
      expect(bundle.messageText).toContain(kakaoBrief);
      expect(bundle.messageText).toContain(shareUrl);
    });

    it('includes brief in sendInboxClientEmail HTML and plain text output', async () => {
      vi.stubEnv('RESEND_API_KEY', '');
      const res = await sendInboxClientEmail({
        toEmail: 'buyer@example.co.kr',
        brokerName: '김선임',
        brokerCompany: '크리딜중개법인',
        brokerPhone: '010-1111-2222',
        clientName: '박대표',
        buildingTitle: '성수동 코너 근생',
        shareUrl,
        headline: '성수역 도보 3분 우량 매물',
        brief: kakaoBrief,
        assetKind: 'dealcard',
        deliveryPurpose: 'transactional_reply',
        transactionalBasis: 'im_request',
      });
      expect(res.ok).toBe(true);
      expect(res.text).toContain(kakaoBrief);
      expect(res.html).toContain(kakaoBrief);
      expect(res.html).toContain(shareUrl);
    });
  });

  describe('2. Newsletter email bullets, blind priceBand priority, 5 short-source issues & KST 08:30 schedule', () => {
    it('parses 3-line bullets and renders <ul><li> in renderMagazineEmail', () => {
      const raw = '• 강남권 프라임 오피스 공실률 2%대 유지\n• 중소형 빌딩 100~150억대 실수요 거래 증가\n• 기준금리 동결 속 우량 임차인 선호 지속';
      const parsed = parseMarketBriefingBullets(raw);
      expect(parsed.isBulleted).toBe(true);
      expect(parsed.items).toHaveLength(3);

      const email = renderMagazineEmail({
        brokerName: '김중개',
        brokerContact: '010-2222-3333',
        subscriberName: '이매수',
        unsubscribeUrl: 'https://credeal.net/api/public/magazine/unsubscribe?t=tok',
        isAd: true,
        edition: {
          title: '11월 강남권 빌딩 리포트',
          headline: raw,
          marketTemp: '선별 매수',
          date: '2026-11-25',
          cadence: 'weekly',
          url: 'https://credeal.net/magazine/kim-cre/2026-11-25',
          topNews: Array.from({ length: 6 }, (_, i) => ({
            title: `핵심 이슈 ${i + 1}`,
            source: i === 0 ? '한국경제 · 증권' : '매일경제신문',
            brief: `이슈 ${i + 1} 상세 해설입니다.`,
          })),
        },
      });

      expect(email.html).toContain('<ul');
      expect(email.html).toContain('<li');
      expect(email.html).toContain('강남권 프라임 오피스 공실률 2%대 유지');
      expect(email.html).toContain('핵심 이슈 5');
      expect(email.html).not.toContain('핵심 이슈 6');
      expect(email.html).toContain('한국경제');
      expect(email.html).toContain('매일경제');
    });

    it('prioritizes blind priceBand over exact priceWon and limits hydrated topNews to 5 with short sources', async () => {
      const edId = '11111111-1111-4111-8111-111111111111';
      const fakeDb = {
        from() {
          const q: Record<string, unknown> = {
            select: () => q,
            eq: () => q,
            maybeSingle: async () => ({
              data: {
                id: edId,
                edition_type: 'weekly',
                title: '주간 브리핑',
                content: {
                  featured_deals: [
                    {
                      id: 'd-blind',
                      assetType: '꼬마빌딩',
                      address: '서울 영등포구 양평동4가 117',
                      priceBand: '90~100억',
                      priceWon: 9_500_000_000,
                    },
                  ],
                  unit_issues: Array.from({ length: 6 }, (_, i) => ({
                    id: `u-${i + 1}`,
                    title: `이슈 제목 ${i + 1}`,
                    sources: ['한국경제 · 부동산'],
                    brief: `이슈 요약 ${i + 1}`,
                  })),
                },
              },
              error: null,
            }),
          };
          return q;
        },
      };

      const hydrated = await hydrateEditionForOutboundEmail(fakeDb as never, edId);
      expect(hydrated.deals).toHaveLength(1);
      expect(hydrated.deals![0].price).toBe('90~100억');
      expect(hydrated.topNews).toHaveLength(5);
      expect(hydrated.topNews![0].source).toBe('한국경제');
    });

    it('computeNextKst0830Iso returns same-day 08:30 KST before 08:30 and next-day 08:30 KST at/after 08:30', () => {
      const before = new Date('2026-11-25T08:10:00+09:00');
      expect(computeNextKst0830Iso(before)).toBe('2026-11-24T23:30:00.000Z');

      const exact = new Date('2026-11-25T08:30:00+09:00');
      expect(computeNextKst0830Iso(exact)).toBe('2026-11-25T23:30:00.000Z');

      const night = new Date('2026-11-25T22:15:00+09:00');
      expect(computeNextKst0830Iso(night)).toBe('2026-11-25T23:30:00.000Z');
    });
  });

  describe('3. Newsletter toneStance <-> marketTemp round-trip & showMarketTempBadge default false', () => {
    it('round-trips toneStance and marketTemp cleanly', () => {
      for (const tone of ['positive', 'neutral', 'negative'] as const) {
        const temp = mapToneStanceToMarketTemp(tone);
        expect(mapMarketTempToToneStance(temp)).toBe(tone);
      }
      expect(mapToneStanceToMarketTemp('positive')).toBe('적극 매수');
      expect(mapToneStanceToMarketTemp('neutral')).toBe('선별 매수');
      expect(mapToneStanceToMarketTemp('negative')).toBe('조정 대기');
    });

    it('hides market temp badge by default when showMarketTempBadge is omitted/false and renders when true', () => {
      const previewDefaultHtml = renderToStaticMarkup(
        <NewsletterPreviewCard
          previewLifecycle="live_draft"
          activeUnitId={null}
          onFocusEditorUnit={() => {}}
          yearMonthLabel="2026년 11월호"
          marketTemp="적극 매수"
          headline="강남 코어 빌딩 리포트"
          brokerName="김중개"
          brokerOffice="크리딜중개"
          brokerPhone="010-0000-1111"
          cadence="monthly"
          monthlyRegion="gbd"
          monthlyCharts={[]}
          formattedPreviewBriefing="• 강남 빌딩 거래 회복"
          unitIssues={[]}
          selectedDeals={[]}
          dealComments={{}}
          isSectionEnabled={() => true}
        />,
      );
      expect(previewDefaultHtml).not.toContain('시장 분위기:');

      const viewerDefaultHtml = renderToStaticMarkup(
        <MagazineView
          data={{
            broker: { name: '김중개', company: '크리딜중개' },
            headline: '강남 코어 빌딩 리포트',
            briefing: '• 강남 빌딩 거래 회복',
            market_temp: '적극 매수',
          }}
          brokerId="kim-cre"
          brokerSlug="kim-cre"
          date="2026-11-25"
          dateLabel="2026년 11월 25일"
        />,
      );
      expect(viewerDefaultHtml).not.toContain('viewer-market-temp-badge');

      const viewerShownHtml = renderToStaticMarkup(
        <MagazineView
          data={{
            broker: { name: '김중개', company: '크리딜중개' },
            headline: '강남 코어 빌딩 리포트',
            briefing: '• 강남 빌딩 거래 회복',
            market_temp: '적극 매수',
            show_market_temp_badge: true,
          }}
          brokerId="kim-cre"
          brokerSlug="kim-cre"
          date="2026-11-25"
          dateLabel="2026년 11월 25일"
        />,
      );
      expect(viewerShownHtml).toContain('viewer-market-temp-badge');
      expect(viewerShownHtml).toContain('시장 분위기: 적극 매수');
    });
  });

  describe('4. DealCard pointCandidates preservation, road-number blind-guard & dong-ga preservation', () => {
    it('preserves valid candidates, deduplicates, and masks road building numbers', () => {
      const normalized = normalizeCard4PointCandidates([
        { text: '성수역 도보 4분 역세권 입지', axis: 'location' },
        '성수동 연무장7길 11 코너 사옥형',
        { text: '성수역 도보 4분 역세권 입지', axis: 'location' },
      ]);
      expect(normalized).toBeDefined();
      expect(normalized).toHaveLength(2);
      expect(normalized![0]).toEqual({ text: '성수역 도보 4분 역세권 입지', axis: 'location' });
      expect(normalized![1].text).not.toContain('연무장7길 11');
      expect(normalized![1].text).toContain('연무장7길 인근');

      const masked = cleanBlindPoints(['성수동 연무장7길 11 앞 코너']);
      expect(masked[0]).not.toContain('연무장7길 11');
      expect(masked[0]).toContain('연무장7길 인근');
    });

    it('preserves 양평동4가 and 을지로3가 in memo-pairing region extraction while masking exact jibun', () => {
      const yangpyeong = parseMemoIntoCard4(
        '영등포구 양평동4가 117 근생빌딩 매매 150억 연면적 400평 선유도역 도보 3분',
      );
      expect(yangpyeong.region).toContain('양평동4가');
      expect(yangpyeong.region).not.toContain('117');

      const euljiro = parseMemoIntoCard4(
        '중구 을지로3가 205 오피스 빌딩 매매 220억 대지 150평 을지로3가역 도보 2분',
      );
      expect(euljiro.region).toContain('을지로3가');
      expect(euljiro.region).not.toContain('205');
    });
  });

  describe('5. Mobile IM mountain (산) PNU lot label & /api/public/map/cadastral validation', () => {
    it('formats general and mountain (산) 19-digit PNU lot short labels', () => {
      expect(formatPnuLotShortLabel('1168010100107360001')).toBe('736-1');
      expect(formatPnuLotShortLabel('1168010100200120003')).toBe('산 12-3');
      expect(formatPnuLotShortLabel('1168010100200120000')).toBe('산 12');
      expect(formatPnuLotShortLabel('invalid')).toBe('');
    });

    it('validates PNU in /api/public/map/cadastral GET and serves PNG when valid', async () => {
      const badReq = new NextRequest('http://localhost/api/public/map/cadastral?pnu=12345');
      const badRes = await getCadastralMapRoute(badReq);
      expect(badRes.status).toBe(404);
      const badJson = (await badRes.json()) as { ok: boolean; error: string };
      expect(badJson.ok).toBe(false);

      cadastralMocks.fetchCadastralMapImage.mockResolvedValue({
        buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      });
      const okReq = new NextRequest(
        'http://localhost/api/public/map/cadastral?pnu=1168010100200120003&lat=37.501&lng=127.039',
      );
      const okRes = await getCadastralMapRoute(okReq);
      expect(okRes.status).toBe(200);
      expect(okRes.headers.get('Content-Type')).toBe('image/png');
      expect(cadastralMocks.fetchCadastralMapImage).toHaveBeenCalledWith(
        37.501,
        127.039,
        800,
        600,
        150,
        '1168010100200120003',
        [],
      );
    });
  });

  describe('6. PPTX representative_name vs display_name separation across contact, A01 cover & A10 closing', () => {
    it('maps representative_name separately in toPptxBrokerInput and renders distinct 대표자 & 담당 on cover and closing', async () => {
      const pptxBroker = toPptxBrokerInput({
        userId: 'u-1',
        displayName: '이담당',
        representativeName: '김대표',
        company: '크리딜부동산중개법인',
        phone: '010-5555-6666',
        email: 'staff@credeal.net',
        officeRegNumber: '11680-2025-00999',
        officeAddress: '서울특별시 강남구 테헤란로 100',
        licenseNumber: '제2025-1234호',
        specialty: '강남 오피스',
      });
      expect(pptxBroker).toMatchObject({
        display_name: '이담당',
        representative_name: '김대표',
        company_name: '크리딜부동산중개법인',
      });

      const coverText = await renderSlideXmlTexts(async (pres) => {
        await buildA01Cover({
          pres,
          slideNum: 1,
          docno: 'IM-REP-01',
          grade: 'B',
          provenance: {},
          data: {
            preset: 'credeal_basic',
            title: '강남 코어 빌딩 투자설명서',
            companyName: pptxBroker!.company_name,
            brokerName: pptxBroker!.display_name,
            representativeName: pptxBroker!.representative_name,
            registrationNo: pptxBroker!.registration_no,
            officeAddress: pptxBroker!.office_address,
            brokerPhone: pptxBroker!.phone,
          },
        });
      });
      expect(coverText).toContain('대표자 김대표');
      expect(coverText).toContain('담당 이담당');

      const closingText = await renderSlideXmlTexts(async (pres) => {
        await buildA10Closing({
          pres,
          slideNum: 9,
          docno: 'IM-REP-01',
          grade: 'B',
          provenance: {},
          data: {
            preset: 'credeal_basic',
            brokerContact: {
              name: pptxBroker!.display_name,
              representative_name: pptxBroker!.representative_name,
              company: pptxBroker!.company_name,
              phone: pptxBroker!.phone,
              email: pptxBroker!.email,
              registrationNo: pptxBroker!.registration_no,
              office_address: pptxBroker!.office_address,
            },
          },
        });
      });
      expect(closingText).toContain('대표자 김대표');
      expect(closingText).toContain('담당 이담당');
    });
  });

  describe('7. Glossary terminology hygiene & /broker/profile default collapsed state', () => {
    it('excludes legacy terms (10년 땅값 단순합산 / 고객 소식지) from MINIMAL_ESSENTIAL_GLOSSARY', () => {
      const serialized = JSON.stringify(MINIMAL_ESSENTIAL_GLOSSARY);
      expect(serialized).not.toContain('10년 땅값 단순합산');
      expect(serialized).not.toContain('고객 소식지');
      expect(serialized).toContain('기대수익률');
      expect(serialized).toContain('5년 지가 변동률(한국부동산원)');
      expect(serialized).toContain('부동산뉴스');
    });

    it('keeps /broker/profile optional sections collapsed by default (useState(false))', () => {
      const profileSrc = readRepoFile('src/app/(broker)/broker/profile/page.tsx');
      expect(profileSrc).toContain('const [showOptionalSections, setShowOptionalSections] = useState(false);');
    });
  });
});
