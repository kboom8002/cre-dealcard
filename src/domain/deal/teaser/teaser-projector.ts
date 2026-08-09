import { bandArea, bandCapRate, bandBuildingEra, bandFarHeadroom, bandRoadContact } from './banding';
import { bandPriceDisplay } from '../../ontology/price-banding';
import { filterValidTiles } from '../../teaser/filter-valid-tiles';
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
  highlightText: string;
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
  urgencyTag?: 'urgent' | 'reviewing' | 'flexible';
}

export interface TeaserConfig {
  curiositySlotKey?: string;
  hookCopyOverride?: string;
  priceBandingMode?: 'single' | 'range';
  bandingOverrides?: Partial<{ priceUnit: number; areaUnit: number }>;
}

export function projectToTeaser(
  attrs: Record<string, unknown>,
  config?: TeaserConfig
): TeaserView {
  const price = Number(attrs.askingPriceKrw || 0);
  const priceManwon = price > 0 ? price / 10000 : 0;
  const area = Number(attrs.totalFloorAreaPyung || 0);
  const capRate = Number(attrs.capRatePct || 0);
  const buildYear = attrs.buildYear != null ? Number(attrs.buildYear) : null;
  const currentYear = new Date().getFullYear();
  const posture = String(attrs.investmentPosture || 'income');

  // Extract sigungu & region (시군구 · 권역명)
  const address = String(attrs.address || '');
  const sigunguMatch = address.match(/(?:서울|경기|인천|부산|대구|대전|광주|울산|세종|제주|\S+특별\S*)\s*(\S+[구군시])/);
  const sigungu = String(attrs.sigungu || sigunguMatch?.[1] || '');
  const areaSignal = String(attrs.regionLabel || attrs.areaSignal || attrs.region || '');
  
  let region = '비공개 권역';
  if (sigungu && areaSignal) {
    region = `${sigungu} · ${areaSignal}`;
  } else if (sigungu) {
    region = `${sigungu} 권역`;
  } else if (areaSignal) {
    region = `${areaSignal}`;
  }

  const assetType = String(attrs.assetType || attrs.asset_type || '상업용 건물');
  const archetype = String(attrs.archetype || 'STABLE_INCOME');

  // Building age banding (null-safe: missing buildYear → '정보 없음')
  const age = (buildYear && buildYear > 1900) ? currentYear - buildYear : null;
  const buildingAge = age == null ? '정보 없음' : age <= 0 ? '신축' : age <= 5 ? '5년 이내' : age <= 10 ? '10년 이내' : age <= 20 ? '20년 이내' : `${Math.floor(age / 10) * 10}년+`;

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

  const vacancyPct = attrs.vacancyPct != null ? Number(attrs.vacancyPct) : null;
  const evictionStatus = String(attrs.evictionStatus || '');
  let vacancyLabel = vacancyPct == null ? '공실 정보 없음' : `공실 ${vacancyPct}%`;
  if (evictionStatus && vacancyPct != null) vacancyLabel += ` (${evictionStatus})`;

  const bandedPrice = bandPriceDisplay(priceManwon, config?.priceBandingMode || 'single');
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
    slot4 = { emoji: '🏗️', label: '현재 용도', value: attrs.currentUseSignal ? String(attrs.currentUseSignal) : '나대지' };
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
    const isHotelOrResort = ['hotel', 'resort', 'motel'].includes(assetType.toLowerCase()) || assetType.includes('호텔');
    if (isHotelOrResort && (attrs.hospitalitySpec || attrs.roomCount)) {
      const spec = (attrs.hospitalitySpec as Record<string, unknown>) || {};
      const rc = Number(spec.totalRoomCount || attrs.roomCount || 0);
      const adrManwon = Number(spec.averageDailyRate || 0);
      const adrLabel = adrManwon > 0 ? `${adrManwon}만원/박` : '확인 필요';
      slot2 = { emoji: '🛏️', label: '객실 단가', value: rc > 0 ? `${rc}실 (${adrLabel})` : '확인 필요' };
      slot4 = { emoji: '🧑‍💼', label: '운영 방식', value: String(spec.operatingModel || attrs.operationType || '직영') };
    } else {
      // 일반 운영형 fallback -> income 스타일 타일 적용
      slot2 = { emoji: '📊', label: '예상 수익률', value: bandedCapRate };
      slot4 = { emoji: '🏠', label: '명도/공실', value: vacancyLabel || '정보 없음' };
    }
    curiositySlot = "🔒 객실/운영 효율 및 수익 구조를 확인하세요";
  } else if (posture === 'trading') {
    postureLabel = '단기매매형';
    const myPricePerPyung = Number(attrs.pricePerPyung || 0);
    const avgPricePerPyung = Number(attrs.comparableAvgPricePerPyung || 0);
    let positionLabel = '시세 수준';
    if (myPricePerPyung > 0 && avgPricePerPyung > 0) {
      const premiumPct = ((myPricePerPyung - avgPricePerPyung) / avgPricePerPyung) * 100;
      if (premiumPct < -5) positionLabel = '🟢 시세 대비 경쟁력';
      else if (premiumPct <= 10) positionLabel = '📊 권역 시세 수준';
      else positionLabel = '📊 프리미엄 포함';
    }
    slot2 = { emoji: '📈', label: '시세 포지션', value: positionLabel };
    slot4 = { emoji: '🔄', label: '거래 동향', value: '권역 거래 활발' };
    curiositySlot = "🔒 권역 실거래 대비 가격 경쟁력을 확인하세요";
  } else {
    // income
    if (attrs.rentGapPct) {
      curiositySlot = `🔒 임대료가 주변보다 ${attrs.rentGapPct}% 낮게 묶여 있습니다`;
    }
  }

  const hookCopy = config?.hookCopyOverride || generateHookCopy(archetype, region, assetType, attrs);
  const urgencyTag = (attrs.urgencyTag || attrs.urgency_tag) as 'urgent' | 'reviewing' | 'flexible' | undefined;

  // Build highlight text including loan details (CRE Point D)
  const highlightParts: string[] = [];
  if (hookCopy) highlightParts.push(hookCopy);
  const loanKrw = Number(attrs.loanAmountKrw || 0);
  if (loanKrw > 0 && price > 0) {
    const ltv = Math.round((loanKrw / price) * 100);
    const ltvBand = Math.round(ltv / 10) * 10;
    const loanStatus = String(attrs.loanStatus || '승계 가능');
    highlightParts.push(`기존 대출 ${loanStatus} (LTV ${ltvBand}%대)`);
  }
  const highlightText = highlightParts.join(' · ');

  // Hero tiles configuration with minimum 2 valid tiles guaranteed
  const allTiles = [
    { emoji: '💰', label: '매각가', value: bandedPrice },
    slot2,
    { emoji: '📍', label: '권역', value: region },
    slot4
  ];

  let postureHeroTiles = filterValidTiles(allTiles);
  if (postureHeroTiles.length < 2) {
    postureHeroTiles = allTiles.slice(0, 2);
  }

  return {
    region,
    assetType,
    bandedPrice,
    bandedCapRate,
    bandedArea,
    buildingAge,
    archetype,
    hookCopy,
    highlightText,
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
    postureHeroTiles,
    sliderAxis2,
    urgencyTag
  };
}

/**
 * Fact-based hook copy generation (CRE Point I)
 * No marketing hype / adjectives allowed.
 */
function generateHookCopy(archetype: string, region: string, assetType: string, attrs: Record<string, unknown>): string {
  const use = attrs.currentUseSignal ? String(attrs.currentUseSignal) : '';
  const vacancy = attrs.vacancyPct != null ? Number(attrs.vacancyPct) : null;
  const road = String(attrs.roadContactType || '');
  const roadLabel = road.includes('코너') || road.includes('각지') ? '코너 입지' 
    : road.includes('대로') ? '대로변 입지' 
    : '';

  if (archetype === 'STABLE_INCOME') {
    const stability = vacancy === 0 ? '만실 운영 중' : (vacancy != null && vacancy <= 10) ? '소규모 공실' : '';
    const useInfo = use ? `${use} 임차` : '';
    return [stability, useInfo, roadLabel, `${region} ${assetType}`].filter(Boolean).join(' · ');
  }
  if (archetype === 'VALUE_ADD') {
    return [roadLabel || `${region} 입지`, '밸류애드 여력', assetType].filter(Boolean).join(' · ');
  }
  if (archetype === 'DEVELOPMENT_SITE') {
    return [`${region} 개발 적지`, roadLabel, assetType].filter(Boolean).join(' · ');
  }
  if (archetype === 'SAFE_EVICTION_DEV') {
    return [`${region} 명도 후 개발`, roadLabel, assetType].filter(Boolean).join(' · ');
  }
  if (archetype === 'INSTITUTIONAL_LOGI') {
    return [`${region} 기관투자 적합`, '물류센터'].filter(Boolean).join(' · ');
  }
  return [roadLabel, use ? `${use} 운영` : '', `${region} ${assetType}`].filter(Boolean).join(' · ');
}


