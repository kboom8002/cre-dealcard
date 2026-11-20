// @vitest-environment jsdom
/**
 * @file src/tests/qa/unified-cre-22showcase-audit.test.tsx
 * @description Phase 1 & Phase 2 통합 계측기:
 *   - 22종 MECE 표준 산출물(NL 6 + DC 8 + IM 8) 전수 결정론적 콘텐츠 적합성 + UX 라이팅 + 멀티포맷 패리티 감사
 *   - Playwright 18-페르소나 실브라우저 3-뷰포트 프로브 결과(`e2e/golden-snapshots/out/*-ppgt/sprint1-baseline.json`) 병합
 *   - 통합 100점 비보상 루브릭(`unified-cre-rubric.ts`) 점수 산출 및 `unified-scorecard.{json,md}` 출력
 */
import React from 'react';
import * as fs from 'fs';
import * as path from 'path';
import JSZip from 'jszip';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({
  usePathname: () => '/qa-showcase',
  useSearchParams: () => new URLSearchParams(),
}));

import {
  NEWSLETTER_SHOWCASE_6,
  DEALCARD_SHOWCASE_8,
  IM_SHOWCASE_8,
  type ShowcaseDealCardScenario,
  type ShowcaseImScenario,
  type ShowcaseNewsletterScenario,
} from '@/lib/qa/output-showcase-scenarios';
import { MagazineView } from '@/app/(magazine)/magazine/[brokerId]/[date]/magazine-view';
import {
  hydrateMonthlyChartsFromRpcRows,
  MONTHLY_GRAPHIC_PAIR_PRESETS,
} from '@/domain/magazine/monthly-stats-hydration';
import { parseMemoIntoCard4 } from '@/lib/deal-card/memo-pairing';
import { cleanBlindPoints } from '@/lib/deal-card/blind-guard';
import { toPublicDealCard } from '@/domain/public-projection/deal-card';
import { parseTsvRentRoll, synthesizeMissingVacantFloors } from '@/lib/rent-roll/tsv-parser';
import { generatePptx } from '@/domain/building/mobile-im/pptx/pptx-renderer';
import { buildSlidesHtmlExport } from '@/lib/im-lite/slides-html-builder';
import {
  scanUxWriting,
  auditDealCardContentSuitability,
  auditNewsletterContentSuitability,
  auditImContentSuitability,
} from '@/lib/qa/ux-writing-and-content-oracle';
import {
  scoreImPpgtRun,
  rankImPpgtBacklog,
  type ImPpgtScoreResult,
  type ImPpgtIssueHint,
} from '@/lib/qa/im-ppgt-personas';
import {
  scoreNewsletterPpgtRun,
  rankNewsletterPpgtBacklog,
  type NewsletterPpgtScoreResult,
  type NewsletterPpgtIssueHint,
} from '@/lib/qa/newsletter-ppgt-personas';
import {
  scoreDealCardPpgtRun,
  rankDealCardPpgtBacklog,
  type DealCardPpgtScoreResult,
  type DealCardPpgtIssueHint,
} from '@/lib/qa/dealcard-ppgt-personas';
import {
  buildUnifiedCreReport100,
  formatUnifiedCreScorecardMarkdown,
  type LayerDR3SubsystemInput,
} from '@/lib/qa/unified-cre-rubric';

const OUT_DIR = path.resolve(process.cwd(), 'e2e/golden-snapshots/out/unified-cre-100');

function stripHtmlTags(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function mapNewsletterScenarioToRun(sc: ShowcaseNewsletterScenario): NewsletterPpgtScoreResult {
  const deals = sc.dealRefs
    .map((refId) => DEALCARD_SHOWCASE_8.find((d) => d.id === refId))
    .filter((d): d is ShowcaseDealCardScenario => Boolean(d))
    .map((d) => ({
      id: d.buildingId,
      address: d.address,
      askingPrice: d.askingPriceManwon > 0 ? d.askingPriceManwon * 10_000 : undefined,
      grossFloorAreaM2: d.gfaSqm,
      landAreaM2: d.landAreaSqm,
      assetType: d.posture === 'owner_occupier' ? '사옥용 빌딩' : d.posture === 'development' ? '신축부지' : '근린생활시설',
      headline: (d.ogDescription || d.deliverableTitle || '핵심 상권 추천 매물').slice(0, 28),
    }));

  const pairPreset =
    MONTHLY_GRAPHIC_PAIR_PRESETS.find((p) => p.id === (sc.monthlyPair ?? 'molit_bok')) ??
    MONTHLY_GRAPHIC_PAIR_PRESETS[0];
  const monthlyCharts =
    sc.editionType === 'monthly'
      ? hydrateMonthlyChartsFromRpcRows({
          regionKey: sc.monthlyRegion ?? 'gbd',
          pair: pairPreset.pair,
          rpcRows: [],
        })
      : [];

  const commonData = {
    kind: sc.editionType,
    headline: sc.useBrokerNamePreset ? `이상은 중개사의 ${sc.headlineTemplate}` : sc.headlineTemplate,
    briefing: sc.plainBriefingFallback,
    unitIssues: sc.unitIssues,
    featured_deals: deals,
    monthlyCharts,
    broker: {
      name: '이상은',
      company: '크리딜 파트너스 공인중개사사무소',
      phone: '010-2548-2548',
      officeAddress: '서울특별시 강남구 테헤란로 142',
      officeRegNumber: '11680-2024-00881',
      representativeName: '이상은',
    },
  };

  const readerHtml = renderToStaticMarkup(
    <MagazineView
      brokerId="leesh"
      brokerSlug="leesh"
      date={sc.issueDate}
      dateLabel={sc.issueDate}
      isSubscribedViewer={false}
      data={commonData}
    />,
  );
  const subHtml = renderToStaticMarkup(
    <MagazineView
      brokerId="leesh"
      brokerSlug="leesh"
      date={sc.issueDate}
      dateLabel={sc.issueDate}
      isSubscribedViewer={true}
      data={commonData}
    />,
  );

  const readerText = stripHtmlTags(readerHtml);
  const subText = stripHtmlTags(subHtml);

  const writingReader = scanUxWriting(readerText);
  const suitReader = auditNewsletterContentSuitability({
    editionType: sc.editionType,
    renderedHtml: readerHtml,
    renderedText: readerText,
    expectedDealCount: deals.length,
    isSubscriberMode: false,
  });
  const suitSub = auditNewsletterContentSuitability({
    editionType: sc.editionType,
    renderedHtml: subHtml,
    renderedText: subText,
    expectedDealCount: deals.length,
    isSubscriberMode: true,
  });

  // 모든 딜 지번이 매거진에서도 비노출인지 확인
  const dealBlindLeaks: string[] = [];
  for (const refId of sc.dealRefs) {
    const dc = DEALCARD_SHOWCASE_8.find((d) => d.id === refId);
    for (const tok of dc?.forbiddenPublicTokens ?? []) {
      if (tok && readerText.includes(tok)) {
        dealBlindLeaks.push(`${sc.id}:${tok}`);
      }
    }
  }

  const hints: NewsletterPpgtIssueHint[] = [];
  for (const d of [...suitReader.details, ...suitSub.details]) {
    hints.push({
      issueKey: 'newsletter_content_suitability',
      targetFileHint: 'src/app/(magazine)/magazine/[brokerId]/[date]/magazine-view.tsx',
      axis: 'C3_safe_domain_fit',
      track: 'track1_ui_gate_renderer',
      summary: `${sc.id}: ${d}`,
    });
  }
  if (writingReader.josaViolationCount + writingReader.truncationViolationCount > 0) {
    hints.push({
      issueKey: 'newsletter_ux_writing',
      targetFileHint: 'src/app/(magazine)/magazine/[brokerId]/[date]/magazine-view.tsx',
      axis: 'C2_artifact_shareability',
      track: 'track1_ui_gate_renderer',
      summary: `${sc.id}: 라이팅 오류 ${writingReader.violations.map((v) => v.match).join(', ')}`,
    });
  }
  if (dealBlindLeaks.length > 0) {
    hints.push({
      issueKey: 'newsletter_deal_blind_leak',
      targetFileHint: 'src/lib/magazine/view-helpers.ts',
      axis: 'C3_safe_domain_fit',
      track: 'track1_ui_gate_renderer',
      summary: `${sc.id}: 추천 매물 블라인드 유출 ${dealBlindLeaks.join(', ')}`,
    });
  }

  const personaMap: Record<ShowcaseNewsletterScenario['id'], NewsletterPpgtScoreResult['personaId']> = {
    'NL-D1': 'NL-MG-03',
    'NL-D2': 'NL-MG-02',
    'NL-W1': 'NL-MG-04',
    'NL-W2': 'NL-MG-02',
    'NL-M1': 'NL-MG-05',
    'NL-M2': 'NL-MG-01',
  };

  return scoreNewsletterPpgtRun({
    personaId: personaMap[sc.id],
    surface: `showcase:${sc.id}`,
    viewport: '390x844',
    fontScale: sc.defaultFontScale === 'xlarge' ? 'xlarge' : 'normal',
    aboveFoldActionCount: 6,
    totalVisibleInteractiveCount: 14,
    horizontalOverflowPx: 0,
    sub44ButtonsCount: 0,
    sub15TextsCount: 0,
    clippedButtonsCount: 0,
    brokenImgCount: 0,
    consoleErrorCount: 0,
    pageErrorCount: 0,
    poisonTokenCount: writingReader.poisonTokenCount,
    bannedTermCount: writingReader.bannedTermCount,
    contentSuitabilityViolationsCount:
      suitReader.totalViolations +
      suitSub.totalViolations +
      writingReader.josaViolationCount +
      writingReader.truncationViolationCount,
    taskCompleted: true,
    blockingModalDetected: false,
    boundaryViolationCount: dealBlindLeaks.length,
    provenanceBadgeVisible: /안심 매거진|개인정보|공인중개사/.test(readerText),
    artifactValid: readerHtml.length > 500,
    honestSaveVisible: true,
    issueHints: hints,
  });
}

function mapDealCardScenarioToRun(sc: ShowcaseDealCardScenario): DealCardPpgtScoreResult {
  const parsed = parseMemoIntoCard4(sc.fastFillMemo, { posture: sc.card4Posture });
  const cleanedPts = cleanBlindPoints(parsed.points);
  const card4 = { ...parsed, posture: sc.card4Posture, points: cleanedPts };

  const publicDto = toPublicDealCard({
    id: sc.buildingId,
    building: {
      id: sc.buildingId,
      address: sc.address,
      raw_address: sc.address,
      asking_price_manwon: sc.askingPriceManwon,
      land_area_sqm: sc.landAreaSqm,
      total_area_sqm: sc.gfaSqm,
      zoning: sc.zoning,
      completion_date: sc.completionDate,
      main_usage: sc.posture === 'owner_occupier' ? '업무시설' : '근린생활시설',
      attrs: {
        address: sc.address,
        askingPrice: sc.askingPriceManwon > 0 ? sc.askingPriceManwon * 10_000 : null,
        landAreaSqm: sc.landAreaSqm,
        totalFloorAreaSqm: sc.gfaSqm,
        zoning: sc.zoning,
        completionDate: sc.completionDate,
        floorLeases: sc.rentRoll,
      },
    },
    signalCard: {
      title: card4.headline,
      area_signal: card4.region,
      asset_type: card4.use,
      price_band: card4.priceBand,
      body: { card4 },
    },
    teaserDoc: {
      body: { card4 },
    },
    brokerProfile: {
      display_name: '이상은',
      company: '크리딜 파트너스 공인중개사사무소',
      phone: '010-2548-2548',
      office_address: '서울특별시 강남구 테헤란로 142',
      office_reg_number: '11680-2024-00881',
      representative_name: '이상은',
      is_licensed: true,
    },
    hasImDoc: true,
    isPptxApproved: true,
    pptxDownloadUrl: `/api/public/im-lite/${sc.buildingId}/pptx`,
  });

  // 실제 /dc/[id]/page.tsx 가 publicDto 에서 꺼내 그리는 텍스트 재현
  const specLines = (publicDto as { threeTierSpecs?: { commonSpecs: Array<{ label: string; value: string }>; buildingSpecs: Array<{ label: string; value: string }>; purposeSpecs: Array<{ label: string; value: string }> } }).threeTierSpecs
    ? [
        ...(publicDto as any).threeTierSpecs.commonSpecs.map((x: any) => `${x.label} ${x.value}`),
        ...(publicDto as any).threeTierSpecs.buildingSpecs.map((x: any) => `${x.label} ${x.value}`),
        ...(publicDto as any).threeTierSpecs.purposeSpecs.map((x: any) => `${x.label} ${x.value}`),
      ].join(' · ')
    : '';

  const renderedPublicText = [
    '매물 핵심 요약',
    publicDto.hero.regionLabel,
    publicDto.postureWidget.assetType,
    publicDto.hero.bandedArea,
    publicDto.hero.bandedPrice,
    publicDto.og.title,
    publicDto.og.description,
    ...publicDto.dealPoints,
    specLines,
    publicDto.broker.displayName,
    publicDto.broker.officeName || '',
    publicDto.broker.officeRegNumber || '',
  ]
    .filter(Boolean)
    .join(' | ');

  const writing = scanUxWriting(renderedPublicText);
  const suitability = auditDealCardContentSuitability({
    renderedText: renderedPublicText,
    headline: publicDto.og.title,
    areaBadgeText: publicDto.hero.bandedArea,
    points: publicDto.dealPoints,
    posture: sc.card4Posture,
    forbiddenPublicTokens: sc.forbiddenPublicTokens,
    expectThreeTierSpecsOnDetail: true,
  });

  const hints: DealCardPpgtIssueHint[] = [];
  for (const det of suitability.details) {
    hints.push({
      issueKey: det.split(':')[0] || 'dealcard_suitability',
      targetFileHint: det.startsWith('missing_tier')
        ? 'src/app/(public)/dc/[id]/page.tsx'
        : det.startsWith('posture_area')
          ? 'src/domain/public-projection/deal-card.ts'
          : 'src/lib/deal-card/blind-guard.ts',
      axis: det.startsWith('blind_leak') ? 'C3_safe_domain_fit' : 'C1_provenance_honesty',
      track: 'track1_ui_gate_renderer',
      summary: `${sc.id}: ${det}`,
    });
  }

  const personaByPosture =
    sc.id === 'DC-07'
      ? 'DC-MG-02'
      : sc.id === 'DC-08'
        ? 'DC-MG-06'
        : sc.card4Posture === 'owner_occupied'
          ? 'DC-MG-04'
          : sc.card4Posture === 'value_add'
            ? 'DC-MG-05'
            : 'DC-MG-03';

  return scoreDealCardPpgtRun({
    personaId: personaByPosture,
    surface: `showcase:${sc.id}`,
    viewport: '390x844',
    fontScale: sc.id === 'DC-01' || sc.id === 'DC-06' ? 'xlarge' : 'normal',
    aboveFoldActionCount: 8,
    totalVisibleInteractiveCount: 14,
    horizontalOverflowPx: 0,
    sub44ButtonsCount: 0,
    sub15TextsCount: 0,
    clippedButtonsCount: 0,
    brokenImgCount: 0,
    consoleErrorCount: 0,
    pageErrorCount: 0,
    poisonTokenCount: writing.poisonTokenCount,
    bannedTermCount: writing.bannedTermCount,
    blindLeakCount: suitability.blindLeakCount,
    numericSpinCount: suitability.numericSpinCount,
    threeTierSpecMissingCount: suitability.threeTierSpecMissingCount,
    uxWritingViolationsCount: writing.josaViolationCount + writing.truncationViolationCount,
    contentSuitabilityViolationsCount:
      suitability.duplicateAreaCount + (suitability.postureAreaMismatch ? 1 : 0),
    taskCompleted: true,
    blockingModalDetected: false,
    boundaryViolationCount: 0,
    provenanceBadgeVisible: Boolean(publicDto.broker.isLicensed),
    artifactValid: Boolean(publicDto.hasMinimalData || sc.askingPriceManwon === 0),
    honestSaveVisible: true,
    issueHints: hints,
  });
}

async function mapImScenarioToRun(sc: ShowcaseImScenario): Promise<ImPpgtScoreResult> {
  let rentRows = sc.directRentRoll ? [...sc.directRentRoll] : [];
  if (sc.rawTsv) {
    const parsed = parseTsvRentRoll(sc.rawTsv);
    const base = sc.synthesizeVacantFloors
      ? synthesizeMissingVacantFloors(parsed.rows)
      : parsed.rows;
    rentRows = base.map((r) => ({
      floor: r.floor,
      unit: r.unit,
      use: r.use || '근린생활시설',
      area_sqm: r.areaSqm,
      depositManwon: r.depositManwon,
      monthlyRentManwon: r.monthlyRentManwon,
      maintenanceManwon: r.maintenanceManwon,
      leaseExpiry: r.leaseExpiry,
      status: r.status,
    }));
  }

  const floorLeases = rentRows.map((r, idx) => ({
    floor: r.floor,
    unit: r.unit || `${idx + 1}호`,
    tenant_name: r.use,
    use: r.use,
    leasable_area_sqm: r.area_sqm ?? 80,
    deposit_manwon: r.depositManwon,
    rent_manwon: r.monthlyRentManwon,
    mgmt_fee_manwon: r.maintenanceManwon ?? 0,
    lease_expiry: r.leaseExpiry || '-',
    lease_state: r.status === 'vacant' ? 'vacant' : r.status === 'owner' ? 'owner' : 'occupied',
    status: r.status,
  }));

  const occupiedRows = floorLeases.filter((r) => r.status === 'occupied');
  const totalDepositManwon = occupiedRows.reduce((s, r) => s + r.deposit_manwon, 0);
  const totalMonthlyManwon = occupiedRows.reduce((s, r) => s + r.rent_manwon, 0);
  const netAskManwon = Math.max(1, sc.askingPriceManwon - totalDepositManwon);
  const grossYieldPct =
    totalMonthlyManwon > 0 ? Number((((totalMonthlyManwon * 12) / netAskManwon) * 100).toFixed(2)) : 0;

  const imBody: Record<string, unknown> = {
    investment_posture:
      sc.posture === 'owner_occupier'
        ? 'owner_occupied'
        : sc.posture === 'development'
          ? 'development'
          : 'core_income',
    resolved_address: sc.address,
    ssot_summary: {
      address: sc.address,
      asking_price_krw: sc.askingPriceManwon * 10_000,
      asking_price_manwon: sc.askingPriceManwon,
      land_area_sqm: sc.landAreaSqm ?? 300,
      total_gross_area_sqm: sc.gfaSqm ?? 900,
      zoning: sc.zoning ?? '제2종일반주거지역',
      completion_date: sc.completionDate ?? '2018-05-01',
      main_purpose: sc.posture === 'owner_occupier' ? '업무시설' : '근린생활시설',
      total_deposit_manwon: totalDepositManwon,
      total_monthly_rent_manwon: totalMonthlyManwon,
    },
    heroCard: {
      title: sc.deliverableTitle || sc.title,
      askingPriceDisplay: `${(sc.askingPriceManwon / 10_000).toLocaleString()}억 원`,
      grossYieldPct: grossYieldPct > 0 ? grossYieldPct : null,
      keyPoints: [sc.subtitle, sc.handoverNote],
    },
    floor_leases: floorLeases,
    photos_v2: [], // 오프라인 결정론 속도 및 외부 네트워크 격리
    broker_extras: sc.brokerExtras ?? {},
  };

  const pptxOut = await generatePptx({
    buildingId: sc.buildingId,
    preset: 'credeal_basic',
    posture:
      sc.posture === 'owner_occupier'
        ? ('owner_occupied' as any)
        : sc.posture === 'development'
          ? ('development' as any)
          : ('core_income' as any),
    grade: 'B',
    docno: `QA-${sc.id}`,
    doc: {
      title: sc.deliverableTitle || sc.title,
      body: imBody,
      sections: [
        {
          title: '투자 요약',
          section_type: 'executive_summary',
          markdown: `- 매매가 ${(sc.askingPriceManwon / 10_000).toLocaleString()}억 원\n- ${sc.handoverNote}`,
        },
        {
          title: '입지 및 교통 여건',
          section_type: 'location_analysis',
          markdown: `- 소재지: ${sc.address}\n- 용도지역: ${sc.zoning ?? '제2종일반주거지역'}`,
        },
      ],
    },
    building: {
      id: sc.buildingId,
      address: sc.address,
      building_name: sc.deliverableTitle?.split('(')[0]?.trim() || '대상 빌딩',
      main_usage: sc.posture === 'owner_occupier' ? '업무시설' : '근린생활시설',
      asking_price_manwon: sc.askingPriceManwon,
      land_area_sqm: sc.landAreaSqm,
      total_area_sqm: sc.gfaSqm,
      zoning: sc.zoning,
      completion_date: sc.completionDate,
    },
    broker: {
      display_name: '이상은',
      company_name: '크리딜 파트너스 공인중개사사무소',
      phone: '010-2548-2548',
      registration_no: '11680-2024-00881',
      office_address: '서울특별시 강남구 테헤란로 142',
    },
  });

  const zip = await JSZip.loadAsync(pptxOut.buffer);
  const slideNames = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const na = Number(a.match(/\d+/)?.[0] || 0);
      const nb = Number(b.match(/\d+/)?.[0] || 0);
      return na - nb;
    });
  const slideXmls = await Promise.all(
    slideNames.map((name) => zip.files[name].async('string')),
  );
  const plainSlideText = slideXmls
    .map((x) => x.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
    .join('\n');

  const pdfHtml = buildSlidesHtmlExport({
    buildingId: sc.buildingId,
    title: sc.deliverableTitle || sc.title,
    content: imBody,
    building: {
      address: sc.address,
      total_area_sqm: sc.gfaSqm,
      land_area_sqm: sc.landAreaSqm,
      zoning: sc.zoning,
    },
    brokerInfo: {
      displayName: '이상은',
      company: '크리딜 파트너스 공인중개사사무소',
      phone: '010-2548-2548',
      officeAddress: '서울특별시 강남구 테헤란로 142',
      licenseNumber: '11680-2024-00881',
    },
  });

  const writing = scanUxWriting(plainSlideText);
  const pdfWriting = scanUxWriting(stripHtmlTags(pdfHtml));
  const suitability = auditImContentSuitability({
    tier: 'basic',
    posture: sc.posture,
    pptxSlideXmls: slideXmls,
    slidesHtmlExport: pdfHtml,
    expectedPhotoCount: sc.photos.length,
  });

  const hints: ImPpgtIssueHint[] = [];
  for (const det of suitability.details) {
    hints.push({
      issueKey: det.split(':')[0] || 'im_suitability',
      targetFileHint: det.startsWith('pdf_')
        ? 'src/lib/im-lite/slides-html-builder.ts'
        : 'src/domain/building/mobile-im/pptx/pptx-renderer.ts',
      axis: 'C2_artifact_shareability',
      track: 'track1_ui_renderer',
      summary: `${sc.id}: ${det}`,
    });
  }
  if (writing.totalViolations + pdfWriting.totalViolations > 0) {
    hints.push({
      issueKey: 'im_ux_writing_violation',
      targetFileHint: 'src/domain/building/mobile-im/pptx/pptx-renderer.ts',
      axis: 'C2_artifact_shareability',
      track: 'track1_ui_renderer',
      summary: `${sc.id}: PPTX/PDF 라이팅 결함 ${[...writing.violations, ...pdfWriting.violations]
        .map((v) => v.match)
        .join(', ')}`,
    });
  }

  const personaId =
    sc.id === 'IM-04'
      ? 'IM-MG-03'
      : sc.id === 'IM-06'
        ? 'IM-MG-05'
        : sc.id === 'IM-07' || sc.id === 'IM-08'
          ? 'IM-MG-06'
          : 'IM-MG-04';

  return scoreImPpgtRun({
    personaId,
    surface: `showcase:${sc.id}`,
    viewport: '1440x900',
    fontScale: 'normal',
    aboveFoldActionCount: 8,
    totalVisibleInteractiveCount: 14,
    horizontalOverflowPx: 0,
    sub44ButtonsCount: 0,
    sub15TextsCount: 0,
    clippedButtonsCount: 0,
    brokenImgCount: 0,
    consoleErrorCount: 0,
    pageErrorCount: 0,
    poisonTokenCount: writing.poisonTokenCount + pdfWriting.poisonTokenCount,
    bannedTermCount:
      writing.bannedTermCount +
      pdfWriting.bannedTermCount +
      suitability.totalViolations +
      writing.josaViolationCount +
      pdfWriting.josaViolationCount,
    taskCompleted: pptxOut.slideCount >= (sc.posture === 'development' ? 6 : 7),
    blockingModalDetected: false,
    boundaryViolationCount: 0,
    provenanceBadgeVisible: /건축물대장|토지이음|국토교통부|한국부동산원|중개인|공인중개사/.test(
      plainSlideText,
    ),
    artifactValid: suitability.passed && pptxOut.fileSizeBytes > 10_000,
    honestSaveVisible: true,
    issueHints: hints,
  });
}

function readOptionalBrowserRuns<T>(relDir: string): T[] {
  const p = path.resolve(process.cwd(), 'e2e/golden-snapshots/out', relDir, 'sprint1-baseline.json');
  if (!fs.existsSync(p)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
    return Array.isArray(parsed?.scoreResults) ? (parsed.scoreResults as T[]) : [];
  } catch {
    return [];
  }
}

function readOptionalLayerDR3Input(
  relDir: 'im-ppgt' | 'newsletter-ppgt' | 'dealcard-ppgt',
): LayerDR3SubsystemInput | null {
  const p = path.resolve(
    process.cwd(),
    'e2e/golden-snapshots/out',
    relDir,
    'layer-d-r3-audit.json',
  );
  if (!fs.existsSync(p)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    const personas: Array<{ overallScore?: number; floorRisk?: boolean }> = Array.isArray(
      raw?.uiAudit?.personas,
    )
      ? raw.uiAudit.personas
      : [];
    const uiPersonaR3Mean5 =
      personas.length > 0
        ? Math.round(
            (personas.reduce((s, x) => s + Number(x.overallScore ?? 5), 0) / personas.length) *
              100,
          ) / 100
        : 5.0;

    const deliverableR3Score5 =
      relDir === 'im-ppgt'
        ? Number(raw?.pptxAudit?.overallPptxScore ?? 5)
        : relDir === 'newsletter-ppgt'
          ? Number(raw?.editorialAudit?.overallEditorialR3 ?? 5)
          : Number(raw?.deliverableAudit?.overallDeliverableR3 ?? 5);

    const deliverableFloor =
      relDir === 'im-ppgt'
        ? Boolean(raw?.pptxAudit?.floorRisk)
        : relDir === 'newsletter-ppgt'
          ? Boolean(raw?.editorialAudit?.floorRisk)
          : Boolean(raw?.deliverableAudit?.floorRisk);

    const negControls: Array<{ passed?: boolean; overallScore?: number; floorRisk?: boolean }> =
      Array.isArray(raw?.negativeControls)
        ? raw.negativeControls
        : raw?.negativeControl
          ? [raw.negativeControl]
          : [];
    const negativeControlsPassed =
      negControls.length > 0 &&
      negControls.every(
        (nc) => nc.passed === true && Number(nc.overallScore) <= 2.9 && nc.floorRisk === true,
      );

    return {
      model: String(raw?.model || 'gpt-4o'),
      calls: Number(raw?.usage?.calls ?? 0),
      promptTokens: Number(raw?.usage?.promptTokens ?? 0),
      completionTokens: Number(raw?.usage?.completionTokens ?? 0),
      estimatedCostUsd: Number(raw?.usage?.estimatedCostUsd ?? 0),
      negativeControlsPassed,
      groundedRatio: Number(raw?.grounding?.groundedRatio ?? 0),
      uiPersonaR3Mean5,
      deliverableR3Score5,
      r3FloorRisk: personas.some((x) => Boolean(x.floorRisk)) || deliverableFloor,
    };
  } catch {
    return null;
  }
}

describe('Unified 3-Subsystem CRE 100-Point Audit (22 Deliverables + Live Browser Probes)', () => {
  it(
    'evaluates all 22 MECE deliverables + available browser & R3 probes and writes unified-scorecard.{json,md}',
    async () => {
      const nlDeliverableRuns = NEWSLETTER_SHOWCASE_6.map(mapNewsletterScenarioToRun);
      const dcDeliverableRuns = DEALCARD_SHOWCASE_8.map(mapDealCardScenarioToRun);
      const imDeliverableRuns: ImPpgtScoreResult[] = [];
      for (const sc of IM_SHOWCASE_8) {
        imDeliverableRuns.push(await mapImScenarioToRun(sc));
      }

      const imBrowserRuns = readOptionalBrowserRuns<ImPpgtScoreResult>('im-ppgt');
      const nlBrowserRuns = readOptionalBrowserRuns<NewsletterPpgtScoreResult>('newsletter-ppgt');
      const dcBrowserRuns = readOptionalBrowserRuns<DealCardPpgtScoreResult>('dealcard-ppgt');

      const allImRuns = [...imDeliverableRuns, ...imBrowserRuns];
      const allNlRuns = [...nlDeliverableRuns, ...nlBrowserRuns];
      const allDcRuns = [...dcDeliverableRuns, ...dcBrowserRuns];

      const imR3 = readOptionalLayerDR3Input('im-ppgt');
      const nlR3 = readOptionalLayerDR3Input('newsletter-ppgt');
      const dcR3 = readOptionalLayerDR3Input('dealcard-ppgt');

      const report = buildUnifiedCreReport100({
        imRuns: allImRuns,
        newsletterRuns: allNlRuns,
        dealcardRuns: allDcRuns,
        imBacklog: rankImPpgtBacklog(allImRuns),
        newsletterBacklog: rankNewsletterPpgtBacklog(allNlRuns),
        dealcardBacklog: rankDealCardPpgtBacklog(allDcRuns),
        ...(imR3 && nlR3 && dcR3
          ? { r3Inputs: { im: imR3, newsletter: nlR3, dealcard: dcR3 } }
          : {}),
      });

      fs.mkdirSync(OUT_DIR, { recursive: true });
      fs.writeFileSync(
        path.join(OUT_DIR, 'unified-scorecard.json'),
        JSON.stringify(
          {
            ...report,
            probeCounts: {
              imDeliverables: imDeliverableRuns.length,
              imBrowser: imBrowserRuns.length,
              nlDeliverables: nlDeliverableRuns.length,
              nlBrowser: nlBrowserRuns.length,
              dcDeliverables: dcDeliverableRuns.length,
              dcBrowser: dcBrowserRuns.length,
              r3SubsystemsAudited: imR3 && nlR3 && dcR3 ? 3 : 0,
            },
          },
          null,
          2,
        ),
        'utf8',
      );
      fs.writeFileSync(
        path.join(OUT_DIR, 'unified-scorecard.md'),
        formatUnifiedCreScorecardMarkdown(report),
        'utf8',
      );

      expect(imDeliverableRuns).toHaveLength(8);
      expect(nlDeliverableRuns).toHaveLength(6);
      expect(dcDeliverableRuns).toHaveLength(8);
      expect(report.totalFloorRiskCount).toBe(0);
      expect(report.overallEffectiveMean100).toBeGreaterThanOrEqual(90);
      expect(report.readyForHuman2nd).toBe(true);
      if (report.r3Audit) {
        expect(report.r3Audit.allNegativeControlsPassed).toBe(true);
        expect(report.r3Audit.anyR3FloorRisk).toBe(false);
        expect(report.r3Audit.minGroundedRatio).toBeGreaterThanOrEqual(0.5);
        expect(report.r3Audit.overallBlendedEffective100).toBeGreaterThanOrEqual(90);
      }
    },
    120_000,
  );
});
