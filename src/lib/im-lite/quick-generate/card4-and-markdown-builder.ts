/**
 * @file src/lib/im-lite/quick-generate/card4-and-markdown-builder.ts
 * @description Canonical Card4 synthesis, blind-guard companion sanitization, ssot_summary,
 * and PPTX Markdown section builders with CRE Lexicon polishing.
 */

import { m2ToPyeong, pyeongToM2 } from '@/domain/building/im-core/facts/area';
import { healCorruptedRegionLabel } from '@/domain/building/dealcard-publication/banding-engine';
import {
  applyBrokerExtrasToSections,
  parseBrokerExtras,
  type BrokerExtras,
} from '@/domain/building/mobile-im/broker-extras';
import { polishImCopyWithLexiconSync } from '@/domain/building/mobile-im/workspace-ai-enhancer';
import { cleanBlindPoints, suggestFallbackRegion } from '@/lib/deal-card/blind-guard';
import { Card4Schema, computeCard4Hash, type Card4Data } from '@/lib/deal-card/card4-schema';
import {
  isGenericAssetUse,
  isLandPriorityPosture,
  resolveCanonicalDealHeadline,
  resolveCanonicalDealSummary,
  sqmToRoundedPyeong,
} from '@/lib/deal-card/canonical-summary';
import { repairDealCardLine } from '@/lib/deal-card/copy-limits';
import { formatPriceRange, validateBlindPriceBand } from '@/lib/deal-card/price-band';
import { DEALCARD_PLACEHOLDER_REGION } from '@/lib/deal-card/publish-content-gate';
import type { WorkspaceItemRecord } from '@/lib/workspace/workspace-repository';
import type { Card4Posture } from './posture-normalizer';
import type { LiveDbCompItem } from './parcel-and-spatial-enricher';

const DEFAULT_SAMPLE_HEADLINES = new Set([
  '역세권 도보 3분 코너 · 전 층 우량 임차인 만실 운영',
  '순투자금 대비 연 4.2% 안정 수익 · 공실 위험 낮음',
  '제3종일반주거지역 토지 가치 · 중장기 리모델링 여력',
]);

export function resolveBrokerCopyAndDefaultPoints(params: {
  body: Record<string, any>;
  brokerExtras: unknown;
  existingSsot?: Record<string, any>;
  safeRentRoll: any[];
  derivedRegion: string;
  totalMonthlyRentManwon: number;
  effectiveMonthlyRentManwon: number;
  effectiveDepositManwon: number;
  effectiveLandSqm: number;
  priceNum: number;
}): {
  parsedExtras?: BrokerExtras;
  closingLine: string;
  defaultPoints: [string, string, string];
} {
  const {
    body,
    brokerExtras,
    existingSsot,
    safeRentRoll,
    derivedRegion,
    totalMonthlyRentManwon,
    effectiveMonthlyRentManwon,
    effectiveDepositManwon,
    effectiveLandSqm,
    priceNum,
  } = params;

  const estimatedYieldPct = (
    ((effectiveMonthlyRentManwon * 12) / Math.max(1, priceNum - effectiveDepositManwon)) *
    100
  ).toFixed(2);

  let parsedExtras: BrokerExtras | undefined;
  if (brokerExtras && typeof brokerExtras === 'object') {
    const parsed = parseBrokerExtras(brokerExtras);
    if (parsed.ok) {
      parsedExtras = parsed.value;
    }
  }

  const rawClosingLine = String(
    body.closingLine ||
      body.brokerExtras?.closingLine ||
      body.brokerExtras?.closing_line ||
      parsedExtras?.closing_line ||
      existingSsot?.closing_line ||
      '',
  ).trim();
  const earlyTenantPool = safeRentRoll.map((r: any) => ({
    tenant_name: String(r?.tenantName ?? r?.tenant_name ?? r?.use ?? ''),
    note: String(r?.note ?? ''),
  }));
  const closingLine = rawClosingLine
    ? polishImCopyWithLexiconSync(rawClosingLine, {
        tenantPoolSource: earlyTenantPool,
        isCompactHeadline: false,
      })
    : '';

  const subjectLandPyeongEarly = Math.max(1, m2ToPyeong(effectiveLandSqm));
  const subjectLandPricePerPyeongManwon =
    priceNum > 0 ? Math.round(priceNum / subjectLandPyeongEarly) : 0;

  const axiosHeadlinePoints = Array.isArray(body.axiosHighlights)
    ? body.axiosHighlights
        .map((h: any) => (typeof h?.headline === 'string' ? h.headline.trim() : ''))
        .filter((s: string) => s.length > 0 && !DEFAULT_SAMPLE_HEADLINES.has(s))
    : [];
  const customPoints = Array.isArray(body.investmentPoints)
    ? body.investmentPoints.filter(
        (p: unknown): p is string =>
          typeof p === 'string' && p.trim().length > 0 && !DEFAULT_SAMPLE_HEADLINES.has(p.trim()),
      )
    : axiosHeadlinePoints;

  const rawDefaultPoints: [string, string, string] = [
    customPoints[0] ||
      parsedExtras?.investment_points?.[0] ||
      `${derivedRegion} 핵심 상권 역세권 가시성 우수`,
    customPoints[1] ||
      parsedExtras?.investment_points?.[1] ||
      (totalMonthlyRentManwon > 0
        ? `월 임대수익 ${totalMonthlyRentManwon.toLocaleString()}만원 안정 운용`
        : '안정적 임차인 및 사옥·가치개선 활용 적격'),
    customPoints[2] ||
      parsedExtras?.investment_points?.[2] ||
      (effectiveMonthlyRentManwon > 0 && priceNum > 0
        ? `연 임대수익률 ${estimatedYieldPct}% 수익형 자산`
        : subjectLandPricePerPyeongManwon > 0
          ? `토지 평당 ${subjectLandPricePerPyeongManwon.toLocaleString()}만원 자산가치 우수`
          : '핵심 입지 및 실수요·투자 가치 우수'),
  ];

  const defaultPoints: [string, string, string] = [
    polishImCopyWithLexiconSync(rawDefaultPoints[0], {
      tenantPoolSource: earlyTenantPool,
      isCompactHeadline: true,
    }) || rawDefaultPoints[0],
    polishImCopyWithLexiconSync(rawDefaultPoints[1], {
      tenantPoolSource: earlyTenantPool,
      isCompactHeadline: true,
    }) || rawDefaultPoints[1],
    polishImCopyWithLexiconSync(rawDefaultPoints[2], {
      tenantPoolSource: earlyTenantPool,
      isCompactHeadline: true,
    }) || rawDefaultPoints[2],
  ];

  return { parsedExtras, closingLine, defaultPoints };
}

export function formatExactEokDisplay(priceNum: number): {
  exactEokNum: number;
  exactEokDisplay: string;
} {
  const exactEokNum = Math.round((priceNum / 10000) * 100) / 100;
  const exactEokWhole = Math.floor(priceNum / 10000);
  const exactRemManwon = Math.round(priceNum % 10000);
  const exactEokDisplay =
    priceNum > 0
      ? exactRemManwon > 0 && exactEokWhole > 0
        ? `${exactEokWhole.toLocaleString()}억 ${exactRemManwon.toLocaleString()}만 원`
        : exactEokWhole > 0
          ? `${exactEokWhole.toLocaleString()}억 원`
          : `${priceNum.toLocaleString()}만 원`
      : '가격 협의';
  return { exactEokNum, exactEokDisplay };
}

export function buildInitialCard4AndSizeSignal(params: {
  body: Record<string, any>;
  posture: string;
  card4Posture: Card4Posture;
  derivedRegion: string;
  priceNum: number;
  defaultPoints: [string, string, string];
  grossYieldPct: number;
  totalGrossAreaPyeong: number;
  landAreaPyeong: number;
  effectiveGfaSqm: number;
  effectiveLandSqm: number;
  knownMatch?: Record<string, any>;
  existingSsot?: Record<string, any>;
  preResolvedDealCardWs: WorkspaceItemRecord | null;
}): {
  card4: Card4Data;
  canonicalUse: string;
  resolvedSizeSignal: string;
  rawMainPurposeInput: string;
  newSpecificMainPurpose: string;
} {
  const {
    body,
    posture,
    card4Posture,
    derivedRegion,
    priceNum,
    defaultPoints,
    grossYieldPct,
    totalGrossAreaPyeong,
    landAreaPyeong,
    effectiveGfaSqm,
    effectiveLandSqm,
    knownMatch,
    existingSsot,
    preResolvedDealCardWs,
  } = params;

  const priceBand = formatPriceRange(priceNum * 10000);
  const points: [string, string, string] = [
    repairDealCardLine(defaultPoints[0]) || defaultPoints[0].slice(0, 18),
    repairDealCardLine(defaultPoints[1]) || defaultPoints[1].slice(0, 18),
    repairDealCardLine(
      grossYieldPct > 0 ? `연 임대수익률 ${grossYieldPct.toFixed(2)}%` : defaultPoints[2],
    ) || defaultPoints[2].slice(0, 18),
  ];

  const rawMainPurposeInput =
    (typeof body.mainPurpose === 'string' && body.mainPurpose.trim()) ||
    (typeof knownMatch?.mainPurpose === 'string' && knownMatch.mainPurpose.trim()) ||
    (typeof existingSsot?.main_usage === 'string' && existingSsot.main_usage.trim()) ||
    '';
  const existingCompanionCard4 = (
    preResolvedDealCardWs?.draftPayload as { card4?: Partial<Card4Data> } | undefined
  )?.card4;
  const newSpecificMainPurpose =
    rawMainPurposeInput && !isGenericAssetUse(rawMainPurposeInput) ? rawMainPurposeInput : '';

  const canonicalSummary = resolveCanonicalDealSummary({
    posture,
    region: derivedRegion.slice(0, 14),
    mainPurpose: rawMainPurposeInput || undefined,
    assetType: typeof existingSsot?.asset_type === 'string' ? existingSsot.asset_type : undefined,
    gfaSqm: effectiveGfaSqm,
    landSqm: effectiveLandSqm,
    gfaPyeong: totalGrossAreaPyeong,
    landPyeong: landAreaPyeong,
    brokerHeadline:
      typeof body.headline === 'string' && body.headline.trim() ? body.headline.trim() : undefined,
    existingHeadline:
      typeof existingCompanionCard4?.headline === 'string' &&
      existingCompanionCard4.headline.trim()
        ? existingCompanionCard4.headline.trim()
        : undefined,
  });

  const roundedGfaPyeong =
    canonicalSummary.gfaPyeong ??
    sqmToRoundedPyeong(effectiveGfaSqm) ??
    Math.round(Number(totalGrossAreaPyeong || 0));
  const roundedLandPyeong =
    canonicalSummary.landPyeong ??
    sqmToRoundedPyeong(effectiveLandSqm) ??
    Math.round(Number(landAreaPyeong || 0));
  const useLandPrioritySizeSignal =
    (isLandPriorityPosture(posture) && effectiveLandSqm > 0) ||
    (effectiveGfaSqm <= 0 && effectiveLandSqm > 0);
  const resolvedSizeSignal = useLandPrioritySizeSignal
    ? `토지 ${effectiveLandSqm.toLocaleString()}㎡ (${roundedLandPyeong.toLocaleString('ko-KR')}평)`
    : `연면적 ${effectiveGfaSqm.toLocaleString()}㎡ (${roundedGfaPyeong.toLocaleString('ko-KR')}평)`;

  const canonicalUse = canonicalSummary.use || '근린생활시설';
  const card4Area =
    canonicalSummary.areaLabel ||
    (useLandPrioritySizeSignal && roundedLandPyeong > 0
      ? `토지 ${roundedLandPyeong}평`
      : roundedGfaPyeong > 0
        ? `연면적 ${roundedGfaPyeong}평`
        : roundedLandPyeong > 0
          ? `토지 ${roundedLandPyeong}평`
          : undefined);
  const card4HeadlineCandidate =
    (typeof body.headline === 'string' && body.headline.trim()) ||
    canonicalSummary.headline ||
    resolveCanonicalDealHeadline({
      region: derivedRegion.slice(0, 14),
      assetType: canonicalUse,
    });

  const card4Draft = {
    posture: card4Posture,
    region: derivedRegion.slice(0, 14),
    use: canonicalUse,
    ...(card4HeadlineCandidate ? { headline: card4HeadlineCandidate } : {}),
    ...(card4Area ? { area: card4Area } : {}),
    ...(roundedGfaPyeong > 0 ? { gfaPyung: roundedGfaPyeong } : {}),
    ...(roundedLandPyeong > 0 ? { landAreaPyung: roundedLandPyeong } : {}),
    priceBand,
    points,
    provenance: {
      points: ['public', 'broker', 'ai'] as const,
    },
    card4_version: 1,
  };

  const card4_hash = computeCard4Hash(card4Draft);
  const card4: Card4Data = Card4Schema.parse({
    ...card4Draft,
    card4_hash,
  });

  return {
    card4,
    canonicalUse,
    resolvedSizeSignal,
    rawMainPurposeInput,
    newSpecificMainPurpose,
  };
}

export function buildSsotSummaryAndPptxSections(params: {
  body: Record<string, any>;
  cleanAddress: string;
  resolvedRoadAddress: string;
  resolvedJibunAddress: string;
  resolvedPnu: string;
  resolvedAllPnus: string[];
  resolvedCoords?: { lat: number; lng: number };
  resolvedTitle: string;
  canonicalUse: string;
  derivedRegion: string;
  priceNum: number;
  exactEokDisplay: string;
  effectiveMonthlyRentManwon: number;
  effectiveDepositManwon: number;
  totalMaintManwon: number;
  effectiveLandSqm: number;
  effectiveGfaSqm: number;
  resolvedSizeSignal: string;
  effectiveZoning: string;
  resolvedLandCategory: string;
  effectiveCompletionDate: string;
  effectiveFloorsAbove: number;
  effectiveFloorsBelow: number;
  rawBcrPct: number;
  bcrPct: number;
  rawFarPct: number;
  farPct: number;
  parkingSpaces: number;
  elevators: number;
  rawMainPurposeInput: string;
  effectiveOfficialLandPriceWonSqm: number;
  resolvedParcels: any;
  vacancyPct: number;
  capRatePct: number;
  grossYieldPct: number;
  handoverNote: unknown;
  closingLine: string;
  legacyPosture: string;
  existingSsot?: Record<string, any>;
  existingEnrichment?: Record<string, any>;
  facts: any;
  mappedFloorLeases: any[];
  defaultPoints: [string, string, string];
  liveLocationPoi: Record<string, any> | null;
  defaultComps: Array<{
    distance: string;
    dealDate: string;
    buildingUse: string;
    pricePerPyeongLandWon: number;
    comparisonDiffPct: number;
  }>;
  liveDbComps: LiveDbCompItem[];
  parsedExtras?: BrokerExtras;
}): {
  ssotSummary: Record<string, any>;
  pptxSections: Array<{ section_type: string; title: string; markdown: string }>;
  normalizedAxiosHighlights?: Array<{ headline: string; brief: string; tone: string }>;
} {
  const {
    body,
    cleanAddress,
    resolvedRoadAddress,
    resolvedJibunAddress,
    resolvedPnu,
    resolvedAllPnus,
    resolvedCoords,
    resolvedTitle,
    canonicalUse,
    derivedRegion,
    priceNum,
    exactEokDisplay,
    effectiveMonthlyRentManwon,
    effectiveDepositManwon,
    totalMaintManwon,
    effectiveLandSqm,
    effectiveGfaSqm,
    resolvedSizeSignal,
    effectiveZoning,
    resolvedLandCategory,
    effectiveCompletionDate,
    effectiveFloorsAbove,
    effectiveFloorsBelow,
    rawBcrPct,
    bcrPct,
    rawFarPct,
    farPct,
    parkingSpaces,
    elevators,
    rawMainPurposeInput,
    effectiveOfficialLandPriceWonSqm,
    resolvedParcels,
    vacancyPct,
    capRatePct,
    grossYieldPct,
    handoverNote,
    closingLine,
    legacyPosture,
    existingSsot,
    existingEnrichment,
    facts,
    mappedFloorLeases,
    defaultPoints,
    liveLocationPoi,
    defaultComps,
    liveDbComps,
    parsedExtras,
  } = params;

  const ssotSummary = {
    address: cleanAddress,
    raw_address: cleanAddress,
    road_address: resolvedRoadAddress,
    jibun_address: resolvedJibunAddress,
    pnu: resolvedPnu,
    ...(resolvedAllPnus.length > 0
      ? { pnus: resolvedAllPnus, parcel_count: resolvedAllPnus.length }
      : {}),
    coordinates: resolvedCoords,
    building_name: resolvedTitle,
    asset_type: canonicalUse,
    area_signal: derivedRegion,
    asking_price_manwon: priceNum,
    monthly_rent_total_manwon: effectiveMonthlyRentManwon,
    monthly_rent_total_krw: effectiveMonthlyRentManwon * 10000,
    total_deposit_manwon: effectiveDepositManwon,
    total_deposit_krw: effectiveDepositManwon * 10000,
    maintenance_fee_monthly_krw: totalMaintManwon * 10000,
    land_area_sqm: effectiveLandSqm,
    land_area_m2: effectiveLandSqm,
    total_gross_area_sqm: effectiveGfaSqm,
    total_gross_area_m2: effectiveGfaSqm,
    size_signal: resolvedSizeSignal,
    zoning: effectiveZoning,
    land_category: resolvedLandCategory,
    jimok: resolvedLandCategory,
    completion_date: effectiveCompletionDate,
    floors_above: effectiveFloorsAbove,
    floors_below: effectiveFloorsBelow,
    bcr_pct: bcrPct,
    far_pct: farPct,
    parking_total: parkingSpaces,
    parking_count: parkingSpaces,
    elevator_count: elevators,
    main_usage: rawMainPurposeInput || '제1·2종 근린생활시설',
    structure: '철근콘크리트구조',
    official_land_price_per_sqm: effectiveOfficialLandPriceWonSqm,
    ...(resolvedParcels ? { parcels: resolvedParcels } : {}),
    vacancy_pct: vacancyPct,
    vacancy_signal: vacancyPct === 0 ? '만실' : `공실률 ${vacancyPct}%`,
    cap_rate_pct: capRatePct,
    gross_yield_pct: grossYieldPct,
    handover_note: handoverNote || undefined,
    ...(closingLine ? { closing_line: closingLine } : {}),
    investment_posture: legacyPosture,
    building_register_source:
      rawBcrPct > 0 || rawFarPct > 0
        ? 'api'
        : existingSsot?.building_register_source || 'manual',
  };

  const rentTableLines = [
    '| 층 | 호수 | 임차인/업종 | 전용면적(평) | 보증금(만원) | 월임대료(만원) | 만기 | 비고 |',
    '|---|---|---|---|---|---|---|---|',
    ...mappedFloorLeases.map(
      (fl) =>
        `| ${fl.floor} | ${fl.unit_label} | ${fl.tenant_name} | ${fl.area_pyeong}평 | ${fl.deposit_manwon.toLocaleString()} | ${fl.rent_manwon.toLocaleString()} | ${fl.lease_end} | ${fl.lease_state} |`,
    ),
  ].join('\n');

  const pptxSections: Array<{ section_type: string; title: string; markdown: string }> = [
    {
      section_type: 'property_overview',
      title: '물건 개요',
      markdown: [
        `| 항목 | 내용 |`,
        `|---|---|`,
        `| 소재지 | ${cleanAddress} |`,
        `| 대지면적 | ${effectiveLandSqm.toLocaleString()}㎡ (${Number(facts.land.landAreaPyeong).toLocaleString('ko-KR')}평) |`,
        `| 연면적 | ${effectiveGfaSqm.toLocaleString()}㎡ (${Number(facts.building.totalGrossAreaPyeong).toLocaleString('ko-KR')}평) |`,
        `| 용도지역 | ${effectiveZoning} |`,
        `| 건축규모 | 지하 ${effectiveFloorsBelow}층 / 지상 ${effectiveFloorsAbove}층 |`,
        ...(bcrPct > 0 || farPct > 0
          ? [
              `| 건폐율 / 용적률 | ${bcrPct > 0 ? `${bcrPct}%` : '-'} / ${farPct > 0 ? `${farPct}%` : '-'} |`,
            ]
          : []),
        `| 사용승인일 | ${effectiveCompletionDate} |`,
        ...(parkingSpaces > 0 || elevators > 0
          ? (() => {
              const pType = String(
                body.parkingType ||
                  (existingEnrichment?.buildingRegister as any)?.parkingType ||
                  '',
              ).trim();
              const parkingLabel =
                pType === '자주식' || pType === 'self'
                  ? `자주식 ${parkingSpaces}대`
                  : `총 ${parkingSpaces}대`;
              if (parkingSpaces > 0 && elevators > 0) {
                return [`| 주차 / 승강기 | ${parkingLabel} / 승용 ${elevators}대 |`];
              }
              if (parkingSpaces > 0) {
                return [`| 주차 | ${parkingLabel} |`];
              }
              return [`| 승강기 | 승용 ${elevators}대 |`];
            })()
          : []),
        ``,
        `- **핵심 입지**: ${defaultPoints[0]}`,
        `- **수익 안정성**: ${defaultPoints[1]}`,
        `- **투자 매력**: ${defaultPoints[2]}`,
      ].join('\n'),
    },
    {
      section_type: 'location_access',
      title: '입지 및 교통 여건',
      markdown: [
        `- **소재지**: ${cleanAddress} (${resolvedRoadAddress})`,
        liveLocationPoi?.nearestStation?.name
          ? `- **대중교통 접근성**: ${liveLocationPoi.nearestStation.name}${
              liveLocationPoi.nearestStation.distanceM != null
                ? ` 약 ${Number(liveLocationPoi.nearestStation.distanceM).toLocaleString()}m`
                : ''
            }${
              liveLocationPoi.nearestStation.walkMinutes
                ? ` (도보 약 ${liveLocationPoi.nearestStation.walkMinutes}분)`
                : ''
            } 역세권 동선으로 출퇴근 및 방문객 접근성이 우수합니다.`
          : `- **대중교통 접근성**: 주요 지하철역 및 간선 대중교통 노선 인접 입지로 직장인·상권 유동인구 유입이 원활합니다.`,
        `- **도로 및 가시성**: 전면 도로 접면이 양호하여 차량 진출입과 상업적 가시성이 확보되어 있습니다.`,
        liveLocationPoi?.poiCounts &&
        Number(liveLocationPoi.poiCounts.cafe || 0) +
          Number(liveLocationPoi.poiCounts.restaurant || 0) >
          0
          ? `- **배후 상권**: 반경 500m 내 음식점·카페 ${
              Number(liveLocationPoi.poiCounts.restaurant || 0) +
              Number(liveLocationPoi.poiCounts.cafe || 0)
            }개소${
              Number(liveLocationPoi.poiCounts.busStop || 0) > 0
                ? `, 버스정류장 ${Number(liveLocationPoi.poiCounts.busStop)}개소`
                : ''
            }가 밀집된 활성 상권으로 임차 수요가 견고합니다.`
          : `- **배후 상권**: 업무·상업·주거 배후수요가 결합된 권역으로 임차 수요가 견고합니다.`,
      ].join('\n'),
    },
    {
      section_type: 'site_analysis',
      title: '토지 및 공적 규제 현황',
      markdown: [
        `| 항목 | 내용 |`,
        `|---|---|`,
        `| 지번주소 | ${resolvedJibunAddress} |`,
        `| 지목 / 대지면적 | ${resolvedLandCategory} / ${effectiveLandSqm.toLocaleString()}㎡ (${Number(facts.land.landAreaPyeong).toLocaleString('ko-KR')}평) |`,
        `| 용도지역 | ${effectiveZoning} |`,
        `| 개별공시지가 | ${effectiveOfficialLandPriceWonSqm > 0 ? `㎡당 ${effectiveOfficialLandPriceWonSqm.toLocaleString()}원` : '국토교통부 개별공시지가 고시 기준'} |`,
      ].join('\n'),
    },
    {
      section_type: 'lease_status',
      title: '층별 임대차 현황 (렌트롤)',
      markdown: [
        `- **보증금 합계**: ${effectiveDepositManwon.toLocaleString()}만원`,
        `- **월 임대료 합계**: ${effectiveMonthlyRentManwon.toLocaleString()}만원 (연간 ${(effectiveMonthlyRentManwon * 12).toLocaleString()}만원)`,
        `- **임대 현황**: 총 ${mappedFloorLeases.length}개 호실 (${ssotSummary.vacancy_signal})`,
        ``,
        rentTableLines,
      ].join('\n'),
    },
    {
      section_type: 'income_analysis',
      title: '매매가 및 수익률 분석',
      markdown: [
        `| 항목 | 금액 / 지표 | 비고 |`,
        `|---|---|---|`,
        `| 매매 희망가 | ${exactEokDisplay} (${priceNum.toLocaleString()}만원) | 확정 매각 희망가 |`,
        `| 총 보증금 | ${effectiveDepositManwon.toLocaleString()}만원 | 인수 보증금 합계 |`,
        `| 실투자금 (보증금 차감) | ${Math.max(0, priceNum - effectiveDepositManwon).toLocaleString()}만원 | 레버리지 전 기준 |`,
        `| 월 임대수익 / 연 임대수익 | 월 ${effectiveMonthlyRentManwon.toLocaleString()}만원 / 연 ${(effectiveMonthlyRentManwon * 12).toLocaleString()}만원 | 관리비 별도 |`,
        `| 임대수익률 / 자본환원율(Cap Rate) | 연 ${grossYieldPct.toFixed(2)}% / Cap Rate ${capRatePct.toFixed(2)}% | 보증금 차감 총수익률 · NOI 기준 |`,
        `| 토지 평당가 / 연면적 평당가 | 평당 ${Math.round(facts.transaction.pricePerPyeongLandWon / 10000).toLocaleString()}만원 / 평당 ${Math.round(facts.transaction.pricePerPyeongGfaWon / 10000).toLocaleString()}만원 | 대지 ${Number(facts.land.landAreaPyeong).toLocaleString('ko-KR')}평 기준 |`,
      ].join('\n'),
    },
    {
      section_type: 'comparable_analysis',
      title: '인근 실거래 및 시세 비교',
      markdown:
        defaultComps.length > 0
          ? [
              `| 구분 | 위치 | 거래시기 | 용도 | 토지평당가 |`,
              `|---|---|---|---|---|`,
              ...defaultComps.map(
                (c) =>
                  `| 실거래 사례 | ${c.distance} | ${c.dealDate} | ${c.buildingUse} | ${Math.round(c.pricePerPyeongLandWon / 10000).toLocaleString()}만원/평 |`,
              ),
            ].join('\n')
          : liveDbComps.length > 0
            ? [
                `| 구분 | 인근 소재지 | 거래시기 | 용도 | 거래금액 / 평당가 |`,
                `|---|---|---|---|---|`,
                ...liveDbComps.map(
                  (c) =>
                    `| 국토부 실거래 | ${c.location} | ${c.dealDate} | ${c.buildingUse} | ${(
                      Math.round((c.transactionPriceManwon / 10_000) * 100) / 100
                    ).toLocaleString()}억${
                      c.landPerPyManwon && c.landPerPyManwon > 0
                        ? ` (토지 ${c.landPerPyManwon.toLocaleString()}만원/평)`
                        : c.gfaPerPyManwon > 0
                          ? ` (건물 ${c.gfaPerPyManwon.toLocaleString()}만원/평)`
                          : ''
                    } |`,
                ),
              ].join('\n')
            : [
                `| 구분 | 산출 지표 | 단가 / 배율 | 기준 내역 |`,
                `|---|---|---|---|`,
                `| 본건 토지 단가 | 대지 ${Number(facts.land.landAreaPyeong).toLocaleString('ko-KR')}평 기준 | 평당 ${Math.round(facts.transaction.pricePerPyeongLandWon / 10000).toLocaleString()}만원 | ${effectiveZoning || '공적장부 기준'} |`,
                `| 본건 건물 단가 | 연면적 ${Number(facts.building.totalGrossAreaPyeong).toLocaleString('ko-KR')}평 기준 | 평당 ${Math.round(facts.transaction.pricePerPyeongGfaWon / 10000).toLocaleString()}만원 | 지상 ${effectiveFloorsAbove}층 / 지하 ${effectiveFloorsBelow}층 |`,
                ...(effectiveOfficialLandPriceWonSqm > 0
                  ? [
                      `| 공시지가 대비 배율 | 개별공시지가 ${Math.round(pyeongToM2(effectiveOfficialLandPriceWonSqm) / 10000).toLocaleString()}만원/평 | ${(
                        facts.transaction.pricePerPyeongLandWon /
                        Math.max(1, pyeongToM2(effectiveOfficialLandPriceWonSqm))
                      ).toFixed(2)}배 | 토지 호가 / 공시지가 비율 |`,
                    ]
                  : []),
              ].join('\n'),
    },
    {
      section_type: 'risk_check',
      title: '거래 조건 및 실사 체크포인트',
      markdown: [
        `- **명도 및 인도 조건**: ${handoverNote || '현 임대차 승계 또는 잔금 일정 협의 가능'}`,
        `- **공적장부 정합성**: 건축물대장 및 토지이용계획확인원 기준 면적·용도지역 정합 확인 완료`,
        `- **시설 및 유지관리**: 내·외관 및 승강기·주차 설비 상태 양호`,
      ].join('\n'),
    },
    {
      section_type: 'investment_thesis',
      title: '핵심 투자 포인트',
      markdown: [
        `- **입지 경쟁력**: ${defaultPoints[0]}`,
        `- **현금흐름 안정성**: ${defaultPoints[1]}`,
        `- **수익률 및 가치 상승**: ${defaultPoints[2]}`,
      ].join('\n'),
    },
    {
      section_type: 'next_steps',
      title: '매입 절차 및 담당자 안내',
      markdown: [
        `- **1단계 (투자의향서 접수)**: 매입 조건 및 자금 일정 검토`,
        `- **2단계 (현장 실사 및 임대차 확인)**: 층별 임대차 계약서 및 시설 실사`,
        `- **3단계 (본계약 및 잔금)**: 매매계약 체결 및 소유권 이전 등기`,
      ].join('\n'),
    },
  ];

  if (parsedExtras) {
    applyBrokerExtrasToSections(pptxSections, parsedExtras);
  }

  for (const sec of pptxSections) {
    sec.markdown = polishImCopyWithLexiconSync(sec.markdown, {
      tenantPoolSource: mappedFloorLeases,
      preserveLinesAndMarkdown: true,
    });
  }

  const normalizedAxiosHighlights = Array.isArray(body.axiosHighlights)
    ? body.axiosHighlights.slice(0, 3).map((h: any, idx: number) => {
        const rawHl = String(h?.headline || defaultPoints[idx] || '');
        const rawBr = String(h?.brief || '');
        return {
          headline:
            polishImCopyWithLexiconSync(rawHl, {
              tenantPoolSource: mappedFloorLeases,
              isCompactHeadline: true,
            }) || rawHl,
          brief: rawBr
            ? polishImCopyWithLexiconSync(rawBr, {
                tenantPoolSource: mappedFloorLeases,
                isCompactHeadline: false,
              })
            : '',
          tone:
            h?.tone === 'sky' || h?.tone === 'mint'
              ? h.tone
              : idx === 1
                ? 'sky'
                : idx === 2
                  ? 'mint'
                  : 'amber',
        };
      })
    : undefined;

  return { ssotSummary, pptxSections, normalizedAxiosHighlights };
}

export function stripLotNumbersSafe(raw: string): string {
  return raw
    .replace(
      /([가-힣0-9]+(?:동|로)\s*\d+가|[가-힣]+(?:동|읍|면|리|대로|번길|로|길))\s+(?:산\s*)?\d+(?:-\d+)?(?:\s*번지)?(?:\s*[,/·]\s*(?:산\s*)?\d+(?:-\d+)?(?:\s*번지)?)*(?:\s*외\s*\d*\s*필지)?/g,
      '$1',
    )
    .replace(
      /(?<![가-힣0-9])(?:산\s*)?\d{1,5}(?:-\d{1,5})?(?:\s*번지)?(?!(?:가|동|읍|면|리|로|길|번길|호선|역|[가-힣\d]))/g,
      '',
    );
}

export function checkUnmaskedLotNumber(cleanedRegionCandidate: string): boolean {
  return /(?:-\d+|번지|\s+\d+(?![\d]|(?:\s*(?:가|동|읍|면|리|로|길|번길|호선|역))))/.test(
    cleanedRegionCandidate,
  );
}

const GENERIC_TENANT_LABELS = new Set([
  '-',
  '공실',
  '자가사용',
  '자가',
  '임대중',
  '임차중',
  '근린생활시설',
  '제1종근린생활시설',
  '제2종근린생활시설',
  '제1·2종 근린생활시설',
  '사무실',
  '오피스',
  'IT 오피스',
  '상가',
  '의원',
  '병원',
  '약국',
  '카페',
  '프랜차이즈 카페',
  '음식점',
  '편의점',
  '스튜디오',
  '스튜디오/창고',
  '창고',
  '주차장',
]);

const escapeRegexLiteral = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function createBlindIdentifierStripper(params: {
  derivedRegion: string;
  buildingNameCandidates: unknown[];
  safeRentRoll: any[];
  mappedFloorLeases: any[];
}): (raw: string, buildingReplacement?: string, tenantReplacement?: string) => string {
  const { derivedRegion, buildingNameCandidates, safeRentRoll, mappedFloorLeases } = params;
  const genericBuildingLabels = new Set([
    '새 IM',
    '매물',
    '근생빌딩',
    '꼬마빌딩',
    '상업용 빌딩',
    '상업용 근생빌딩',
    '오피스빌딩',
    `${derivedRegion} 근생빌딩`,
  ]);

  const knownBuildingNames = Array.from(
    new Set(
      buildingNameCandidates
        .map((v) => (typeof v === 'string' ? v.trim() : ''))
        .filter((v) => v.length >= 2 && !genericBuildingLabels.has(v)),
    ),
  ).sort((a, b) => b.length - a.length);

  const knownTenantNames = Array.from(
    new Set(
      [
        ...safeRentRoll.flatMap((r: any) => [r?.tenantName, r?.tenant_name]),
        ...mappedFloorLeases.map((fl: any) => fl?.tenant_name),
      ]
        .map((v) => (typeof v === 'string' ? v.trim() : ''))
        .filter((v) => v.length >= 2 && !GENERIC_TENANT_LABELS.has(v)),
    ),
  ).sort((a, b) => b.length - a.length);

  return (
    raw: string,
    buildingReplacement = '해당 건물',
    tenantReplacement = '우량 임차업종',
  ): string => {
    let out = String(raw || '').trim();
    if (!out) return '';
    for (const bName of knownBuildingNames) {
      out = out.replace(new RegExp(escapeRegexLiteral(bName), 'gi'), buildingReplacement);
    }
    for (const tName of knownTenantNames) {
      out = out.replace(new RegExp(escapeRegexLiteral(tName), 'gi'), tenantReplacement);
    }
    out = cleanBlindPoints([out])[0] || out;
    return out.replace(/\s+/g, ' ').trim();
  };
}

export function buildPublicSanitizedCard4(params: {
  body: Record<string, any>;
  card4: Card4Data;
  cleanAddress: string;
  priceNum: number;
  safePublicRegion: string;
  stripBlindIdentifiers: (
    raw: string,
    buildingReplacement?: string,
    tenantReplacement?: string,
  ) => string;
}): Card4Data {
  const { body, card4, cleanAddress, priceNum, safePublicRegion, stripBlindIdentifiers } = params;

  const cleanedPointsTuple = card4.points.map((pt, idx) => {
    const stripped = stripBlindIdentifiers(pt);
    const repaired = repairDealCardLine(stripped) || stripped.slice(0, 22).trim();
    if (repaired) return repaired;
    return idx === 0
      ? '역세권 가시성 우수 입지'
      : idx === 1
        ? '안정적 임대수익 운용 자산'
        : '핵심 상권 중장기 가치 우수';
  }) as [string, string, string];

  const rawHeadlineInput =
    typeof body.headline === 'string' && body.headline.trim()
      ? body.headline.trim()
      : card4.headline;
  const cleanedHeadlineCandidate = rawHeadlineInput
    ? stripBlindIdentifiers(rawHeadlineInput)
    : undefined;
  const safePublicHeadline = cleanedHeadlineCandidate
    ? /(?:OO번지|OO-OO)/.test(cleanedHeadlineCandidate)
      ? `${safePublicRegion !== DEALCARD_PLACEHOLDER_REGION ? safePublicRegion : suggestFallbackRegion(cleanAddress)} ${card4.use}`.trim()
      : cleanedHeadlineCandidate
    : undefined;

  const cleanedPointBriefs = Array.isArray(card4.pointBriefs)
    ? (card4.pointBriefs.map((br) => stripBlindIdentifiers(br || '')) as [string, string, string])
    : undefined;

  const candidatePriceBand =
    typeof body.priceBand === 'string' && body.priceBand.trim()
      ? body.priceBand.trim()
      : card4.priceBand;
  const candidateBandCheck = validateBlindPriceBand(
    candidatePriceBand,
    priceNum > 0 ? priceNum * 10000 : null,
  );
  const safePublicPriceBand = candidateBandCheck.valid
    ? candidatePriceBand
    : priceNum > 0
      ? formatPriceRange(priceNum * 10000, 'standard')
      : candidatePriceBand;

  const card4ForPublicDraft = {
    ...card4,
    ...(safePublicHeadline ? { headline: safePublicHeadline } : {}),
    region: safePublicRegion,
    priceBand: safePublicPriceBand,
    points: cleanedPointsTuple,
    ...(cleanedPointBriefs ? { pointBriefs: cleanedPointBriefs } : {}),
  };
  return Card4Schema.parse({
    ...card4ForPublicDraft,
    card4_hash: computeCard4Hash(card4ForPublicDraft),
  });
}

export function mergeExistingCompanionCard4(params: {
  existingWs: WorkspaceItemRecord | null | undefined;
  generatedCard4: Card4Data;
  newSpecificMainPurpose: string;
  cleanAddress: string;
  resolvedTitle: string;
  stripBlindIdentifiers: (
    raw: string,
    buildingReplacement?: string,
    tenantReplacement?: string,
  ) => string;
}): Card4Data {
  const {
    existingWs,
    generatedCard4,
    newSpecificMainPurpose,
    cleanAddress,
    resolvedTitle,
    stripBlindIdentifiers,
  } = params;
  const existingPayload = (
    existingWs?.draftPayload as { card4?: Partial<Card4Data> } | undefined
  )?.card4;
  if (!existingPayload) return generatedCard4;

  const existingHeadlineRaw =
    typeof existingPayload.headline === 'string' ? existingPayload.headline.trim() : '';
  const preservedHeadline = existingHeadlineRaw
    ? stripBlindIdentifiers(existingHeadlineRaw) || existingHeadlineRaw
    : generatedCard4.headline;

  const existingUseRaw =
    typeof existingPayload.use === 'string' ? existingPayload.use.trim() : '';
  const preservedUse =
    existingUseRaw && !(isGenericAssetUse(existingUseRaw) && newSpecificMainPurpose)
      ? existingUseRaw
      : generatedCard4.use;

  const existingPts = Array.isArray(existingPayload.points) ? existingPayload.points : [];
  const hasMeaningfulExistingPts = existingPts.some(
    (p) => typeof p === 'string' && p.trim().length > 0 && p.trim() !== '-',
  );
  const preservedPoints: [string, string, string] = hasMeaningfulExistingPts
    ? ([
        (typeof existingPts[0] === 'string' && existingPts[0].trim()) || generatedCard4.points[0],
        (typeof existingPts[1] === 'string' && existingPts[1].trim()) || generatedCard4.points[1],
        (typeof existingPts[2] === 'string' && existingPts[2].trim()) || generatedCard4.points[2],
      ] as [string, string, string])
    : generatedCard4.points;

  const existingRegionRaw =
    typeof existingPayload.region === 'string' ? existingPayload.region.trim() : '';
  const isLegacyBrokenDongGa =
    /(?:동|로)가(?=$|[\s,])/.test(existingRegionRaw) &&
    /(?:동|로)\d+가(?=$|[\s,])/.test(generatedCard4.region);
  const healedExistingRegion = existingRegionRaw
    ? healCorruptedRegionLabel(
        stripBlindIdentifiers(existingRegionRaw, '', '') || existingRegionRaw,
        [generatedCard4.region, cleanAddress, resolvedTitle],
      )
    : '';
  const preservedRegion =
    healedExistingRegion &&
    healedExistingRegion !== DEALCARD_PLACEHOLDER_REGION &&
    !isLegacyBrokenDongGa
      ? healedExistingRegion
      : generatedCard4.region;

  const mergedDraft = {
    ...existingPayload,
    ...generatedCard4,
    region: preservedRegion,
    use: preservedUse,
    ...(preservedHeadline ? { headline: preservedHeadline } : {}),
    points: preservedPoints,
    ...(existingPayload.pointTones ? { pointTones: existingPayload.pointTones } : {}),
    ...(existingPayload.pointBriefs
      ? { pointBriefs: existingPayload.pointBriefs }
      : generatedCard4.pointBriefs
        ? { pointBriefs: generatedCard4.pointBriefs }
        : {}),
    ...(generatedCard4.area || existingPayload.area
      ? { area: generatedCard4.area || existingPayload.area }
      : {}),
    ...(generatedCard4.gfaPyung || existingPayload.gfaPyung
      ? { gfaPyung: generatedCard4.gfaPyung ?? existingPayload.gfaPyung }
      : {}),
    ...(generatedCard4.landAreaPyung || existingPayload.landAreaPyung
      ? { landAreaPyung: generatedCard4.landAreaPyung ?? existingPayload.landAreaPyung }
      : {}),
    card4_version: Math.max(
      Number(existingPayload.card4_version || 1),
      Number(generatedCard4.card4_version || 1),
    ),
  };
  return Card4Schema.parse({
    ...mergedDraft,
    card4_hash: computeCard4Hash(mergedDraft),
  });
}
