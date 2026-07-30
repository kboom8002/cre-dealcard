/**
 * @module TeaserProjector
 * @description Projects SSoT asset data into a safe teaser view.
 * Precise values never leak — all numbers are banded.
 * @see docs/credal_v3/specs/teaser.md
 */

import { bandPrice, bandArea, bandCapRate } from './banding';

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

  // Curiosity slot (the locked info that drives CTA)
  const curiosityKey = config?.curiositySlotKey || 'exactCapRate';
  const curiositySlot = `🔒 ${curiosityKey === 'exactCapRate' ? '정확한 수익률' : '상세 정보'}을 확인하려면 관심 등록하세요`;

  const hookCopy = config?.hookCopyOverride || generateHookCopy(archetype, region, assetType);

  return {
    region,
    assetType,
    bandedPrice: bandPrice(price),
    bandedCapRate: bandCapRate(capRate),
    bandedArea: bandArea(area),
    buildingAge,
    archetype,
    hookCopy,
    structuralSignals: signals,
    curiositySlot,
    photoCount: Number(attrs.photoCount || 0),
    disclosureTier: 'public',
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
