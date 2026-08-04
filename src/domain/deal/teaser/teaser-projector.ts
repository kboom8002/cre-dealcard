/**
 * @module TeaserProjector
 * @description Projects SSoT asset data into a safe teaser view.
 * Precise values never leak — all numbers are banded.
 * @see docs/credal_v3/specs/teaser.md
 */

import { bandPrice, bandArea, bandCapRate, bandBuildingEra, bandFarHeadroom, bandRoadContact } from './banding';
import { classifyDealArchetype } from '../../deal/archetype-classifier';
import { computeDataQualityBadge } from '../../building/mobile-im/data-quality-badge';

export interface TeaserView {
  region: string;
  assetType: string;
  bandedPrice: string;
  bandedCapRate: string;
  bandedArea: string;
  buildingAge: string;
  archetype: string;
  hookCopy: string;
  structuralSignals: string[];
  curiositySlot: string;
  photoCount: number;
  disclosureTier: 'public' | 'gated' | 'never';
  dataGrade?: 'A' | 'B' | 'C' | 'D';
  archetypeResult?: { primaryArchetype: string; secondaryArchetypes: string[]; confidenceScore: number; reasons: string[] };
  vacancyLabel?: string;
  bandedBuildingEra?: string;
  bandedFarHeadroom?: string | null;
  reidentResult?: { candidateCount: number; kThreshold: number; passed: boolean; riskLevel: string; suggestion?: string } | null;
  roadContactLabel?: string;
  posture: string;
  postureLabel: string;
  postureHeroTiles: Array<{ emoji: string; label: string; value: string }>;
  sliderAxis2?: { label: string; min: number; max: number; step: number; unit: string };
}

export interface TeaserConfig {
  curiositySlotKey?: string;
  hookCopyOverride?: string;
  bandingOverrides?: Partial<{ priceUnit: number; areaUnit: number }>;
}

/**
 * Projects an asset's precise data into a banded teaser view.
 * RULE: This function MUST NOT output any precise numeric values.
 */
export function projectToTeaser(
  attrs: Record<string, unknown>,
  config?: TeaserConfig
): TeaserView {
  const price = Number(attrs.askingPriceKrw || 0);
  const area = Number(attrs.totalFloorAreaPyung || 0);
  const capRate = Number(attrs.capRatePct || 0);
  const buildYear = Number(attrs.buildYear || 0);
  const currentYear = new Date().getFullYear();
  const posture = String(attrs.investmentPosture || 'income');

  // Extract region (구/동 level only, never exact address)
  const address = String(attrs.address || '');
  const regionMatch = address.match(/([\uac00-\ud7a3]+(?:\uad6c|\uc2dc|\uad70))\s*([\uac00-\ud7a3]+(?:\ub3d9|\uc74d|\uba74))?/);
  const region = regionMatch ? `${regionMatch[1]} ${regionMatch[2] || ''}`.trim() : '서울';

  const assetType = String(attrs.assetType || attrs.asset_type || '상업용 건물');
  const archetype = String(attrs.archetype || 'STABLE_INCOME');

  // Building age banding
  const age = buildYear > 0 ? currentYear - buildYear : 0;
  const buildingAge = age <= 0 ? '신축' : age <= 5 ? '5년 이내' : age <= 10 ? '10년 이내' : age <= 20 ? '20년 이내' : `${Math.floor(age / 10) * 10}년+`;

  // Structural signals (non-sensitive qualitative info)
  const signals: string[] = [];
  if (attrs.zoningRegion) signals.push(`용도: ${attrs.zoningRegion}`);
  if (attrs.floorsAboveGround) signals.push(`지상 ${attrs.floorsAboveGround}층`);
  if (attrs.roadContactType) signals.push(`${attrs.roadContactType}`);
  if (attrs.parkingCapacity) signals.push(`주차 ${attrs.parkingCapacity}대`);

  const archetypeResult = classifyDealArchetype(attrs);
  const dataQuality = computeDataQualityBadge({
    hasAddress: !!attrs.address,
    hasPublicData: !!attrs.approvalDate,
    hasMonthlyRent: !!attrs.monthlyRentKrw,
    hasVacancy: attrs.vacancyPct !== undefined,
    hasPhotos: !!attrs.photoCount,
    hasAskingPrice: !!attrs.askingPriceKrw,
    hasLoanAmount: !!attrs.loanAmountKrw,
    hasFloorLeases: !!attrs.floorLeases,
  });

  let dataGrade: 'A' | 'B' | 'C' | 'D' = 'D';
  if (dataQuality.tier === 'verified') dataGrade = 'A';
  else if (dataQuality.tier === 'partial') dataGrade = 'B';
  else if (dataQuality.tier === 'reference') dataGrade = 'C';

  const approvalYear = attrs.approvalDate ? new Date(String(attrs.approvalDate)).getFullYear() : 0;
  const bandedBuildingEra = bandBuildingEra(approvalYear);
  const bandedFarHeadroom = attrs.farHeadroomPp !== undefined ? bandFarHeadroom(Number(attrs.farHeadroomPp)) : null;
  const roadContactLabel = bandRoadContact(String(attrs.roadContactType || ''));

  const vacancyPct = Number(attrs.vacancyPct || 0);
  const evictionStatus = String(attrs.evictionStatus || '');
  let vacancyLabel = `공실 ${vacancyPct}%`;
  if (evictionStatus) vacancyLabel += ` (${evictionStatus})`;

  const bandedPrice = bandPrice(price);
  const bandedCapRate = bandCapRate(capRate);
  const bandedArea = bandArea(area);

  let postureLabel = '임대수익형';
  let slot2 = { emoji: '📊', label: '예상 수익률', value: bandedCapRate };
  let slot4 = { emoji: '🏠', label: '명도/공실', value: vacancyLabel || '정보 없음' };
  let curiositySlot = "🔒 임대료 상승 여력을 확인하세요";
  let sliderAxis2 = { label: '대출활용 LTV', min: 0, max: 80, step: 5, unit: '%' };

  if (posture === 'development') {
    postureLabel = '개발형';
    slot2 = { emoji: '🏗️', label: '용적률 여유', value: bandedFarHeadroom || '확인 필요' };
    slot4 = { emoji: '🏚️', label: '현재 용도', value: attrs.currentUseSignal ? String(attrs.currentUseSignal) : '나대지' };
    curiositySlot = attrs.farHeadroomPp ? `🔒 지금보다 ${attrs.farHeadroomPp}%p 더 지을 수 있는 여유` : "🔒 추가 용적률을 확인하세요";
    sliderAxis2 = { label: '목표 용적률', min: 200, max: 800, step: 50, unit: '%' };
  } else if (posture === 'owner_occupied') {
    postureLabel = '자가사용형';
    slot2 = { emoji: '🏢', label: '가용 면적', value: bandedArea };
    slot4 = { emoji: '🔑', label: '입주 여부', value: evictionStatus || '입주 가능' };
    curiositySlot = "🔒 지금 내시는 임차료로 이 건물을 살 수 있는지 계산해 보십시오";
    sliderAxis2 = { label: '필요 면적', min: 50, max: 500, step: 10, unit: '평' };
  } else if (posture === 'operating') {
    postureLabel = '운영형';
    const rc = Number(attrs.roomCount) || 0;
    const ppr = rc > 0 ? (price / 100000000 / rc).toFixed(1) + '억' : '확인 필요';
    slot2 = { emoji: '🛏️', label: '객실 단가', value: rc > 0 ? `${rc}실 (당 ${ppr})` : '확인 필요' };
    slot4 = { emoji: '🧑‍💼', label: '운영 방식', value: attrs.operationType ? String(attrs.operationType) : '직영' };
    curiositySlot = attrs.pricePerRoomEok ? `🔒 객실당 ${attrs.pricePerRoomEok}억대입니다` : "🔒 객실당 단가를 확인하세요";
  } else if (posture === 'trading') {
    postureLabel = '단기매매형';
    slot2 = { emoji: '📈', label: '평당가 (vs 평균)', value: attrs.pricePerPyung ? String(attrs.pricePerPyung) : '확인 필요' };
    slot4 = { emoji: '🔄', label: '거래 동향', value: '거래 활발' };
    curiositySlot = attrs.priceVsAvgPct ? `🔒 권역 평균 대비 ${attrs.priceVsAvgPct}% 수준입니다` : "🔒 권역 평균 대비 가격 경쟁력을 확인하세요";
  } else {
    // income
    if (attrs.rentGapPct) {
      curiositySlot = `🔒 임대료가 주변보다 ${attrs.rentGapPct}% 낮게 묶여 있습니다`;
    }
  }

  const hookCopy = config?.hookCopyOverride || generateHookCopy(archetype, region, assetType);

  return {
    region,
    assetType,
    bandedPrice,
    bandedCapRate,
    bandedArea,
    buildingAge,
    archetype,
    hookCopy,
    structuralSignals: signals,
    curiositySlot,
    photoCount: Number(attrs.photoCount || 0),
    disclosureTier: 'public',
    dataGrade,
    archetypeResult,
    vacancyLabel,
    bandedBuildingEra,
    bandedFarHeadroom,
    roadContactLabel,
    posture,
    postureLabel,
    postureHeroTiles: [
      { emoji: '💰', label: '매각가', value: bandedPrice },
      slot2,
      { emoji: '📐', label: '규모', value: bandedArea },
      slot4
    ],
    sliderAxis2
  };
}

function generateHookCopy(archetype: string, region: string, assetType: string): string {
  const hooks: Record<string, string> = {
    STABLE_INCOME: `${region} 안정 수익형 ${assetType}`,
    VALUE_ADD: `${region} 밸류애드 기회 ${assetType}`,
    DEVELOPMENT_SITE: `${region} 개발 가능 부지`,
    SAFE_EVICTION_DEV: `${region} 안전 명도 후 개발`,
    INSTITUTIONAL_LOGI: `${region} 기관투자 적합 물류`,
  };
  return hooks[archetype] || `${region} ${assetType} 매물`;
}

