/**
 * @module ArchetypeClassifier
 * @description Classifies a deal into 1 of 10 Deal Archetypes based on property attributes (R01-R10, v0.2 rules applied).
 * @see SDD §6 S1-T9
 */

/**
 * Represents one of the 10 domain-specific deal archetypes.
 */
export type DealArchetype =
  | 'STABLE_INCOME'
  | 'VALUE_ADD'
  | 'DEVELOPMENT_SITE'
  | 'SAFE_EVICTION_DEV'
  | 'INSTITUTIONAL_LOGI'
  | 'OWNER_OCCUPIED'
  | 'DISTRESSED'
  | 'MIXED_USE'
  | 'RETAIL_STREET'
  | 'REPOSITIONING';

/**
 * Result of the archetype classification process.
 */
export interface ArchetypeClassificationResult {
  /** The most likely archetype for the deal */
  primaryArchetype: DealArchetype;
  /** Secondary archetype matches */
  secondaryArchetypes: DealArchetype[];
  /** Confidence score of the primary archetype (0 to 1) */
  confidenceScore: number; // 0 to 1
  /** Human-readable reasons for the classifications */
  reasons: string[];
}

/**
 * Classifies an asset into Deal Archetypes using rules R01-R10.
 * Supported rules evaluated:
 * - R01: STABLE_INCOME (low vacancy, young building)
 * - R02: VALUE_ADD (older building, FAR headroom)
 * - R03: DEVELOPMENT_SITE (land or high FAR headroom)
 * - R04: SAFE_EVICTION_DEV (eviction secured, dev potential)
 * - R05: INSTITUTIONAL_LOGI (large logistics asset)
 * - R06: OWNER_OCCUPIED (owner-occupied asset)
 * - R07: DISTRESSED (high vacancy or delinquency)
 * - R08: MIXED_USE (mixed use asset)
 * - R09: RETAIL_STREET (retail asset)
 * 
 * @param attrs - The key-value map of asset attributes
 * @returns Classification result including primary and secondary archetypes
 * @see SDD §6 S1-T9
 */
export function classifyDealArchetype(attrs: Record<string, unknown>): ArchetypeClassificationResult {
  const archetypes: { archetype: DealArchetype; score: number; reason: string }[] = [];

  const assetType = String(attrs.assetType || '').toLowerCase();
  const askingPrice = Number(attrs.askingPriceKrw || 0);
  const farHeadroom = Number(attrs.farHeadroomPp || 0);
  const approvalYear = attrs.approvalDate ? new Date(String(attrs.approvalDate)).getFullYear() : null;
  const buildingAge = approvalYear ? new Date().getFullYear() - approvalYear : 0;
  const evictionStatus = String(attrs.evictionStatus || '');
  const vacancyPct = Number(attrs.vacancyPct ?? 0);

  // R05: INSTITUTIONAL_LOGI
  if (assetType.includes('logistics') || assetType.includes('물류')) {
    if (askingPrice >= 38_000_000_000) {
      archetypes.push({ archetype: 'INSTITUTIONAL_LOGI', score: 0.95, reason: '380억 이상 대형 물류센터 자산' });
    }
  }

  // R04: SAFE_EVICTION_DEV
  if (evictionStatus.includes('진행') || evictionStatus.includes('완료')) {
    if (farHeadroom >= 50 || assetType.includes('land') || assetType.includes('토지')) {
      archetypes.push({ archetype: 'SAFE_EVICTION_DEV', score: 0.90, reason: '명도 확보된 개발 부지 자산' });
    }
  }

  // R03: DEVELOPMENT_SITE
  if (assetType.includes('land') || assetType.includes('토지') || farHeadroom >= 60) {
    archetypes.push({ archetype: 'DEVELOPMENT_SITE', score: 0.85, reason: '용적률 여유 60% 이상 개발 부지' });
  }

  // R02: VALUE_ADD — v0.2: 유효 용적률 기준으로 변경
  const effectiveFarHeadroom = Number(attrs.effectiveFARHeadroomPp ?? attrs.farHeadroomPp ?? 0);
  if (buildingAge >= 20 && effectiveFarHeadroom >= 50) {
    archetypes.push({ archetype: 'VALUE_ADD', score: 0.80, reason: `건물연령 ${buildingAge}년 ≥20년, 유효 용적률 여유 ${effectiveFarHeadroom.toFixed(1)}%p ≥50%p` });
  }

  // R01: STABLE_INCOME
  if (vacancyPct <= 5 && buildingAge < 20) {
    archetypes.push({ archetype: 'STABLE_INCOME', score: 0.85, reason: '공실률 5% 이하 안정적 임대수익형 자산' });
  }

  // R06: OWNER_OCCUPIED — 자가 사용 목적
  if (String(attrs.purpose || '').includes('사옥') || String(attrs.purpose || '').includes('자가')) {
    archetypes.push({ archetype: 'OWNER_OCCUPIED', score: 0.75, reason: '자가 사용(사옥) 목적 자산' });
  }

  // R07: DISTRESSED — 부실 자산
  const delinquencyRate = Number(attrs.delinquencyRatePct || 0);
  if (vacancyPct >= 30 || delinquencyRate >= 20) {
    archetypes.push({ archetype: 'DISTRESSED', score: 0.85, reason: `공실률 ${vacancyPct}% 또는 연체율 ${delinquencyRate}% — 부실 자산` });
  }

  // R08: MIXED_USE — 복합 용도
  if (assetType.includes('mixed') || assetType.includes('복합')) {
    archetypes.push({ archetype: 'MIXED_USE', score: 0.70, reason: '복합 용도 자산' });
  }

  // R09: RETAIL_STREET
  if (assetType.includes('상가') || assetType.includes(' retail')) {
    archetypes.push({ archetype: 'RETAIL_STREET', score: 0.75, reason: '리테일 상권 중심 자산' });
  }

  // Fallback: R10 REPOSITIONING is deprecated in v0.2 (moved to T rules)
  if (archetypes.length === 0) {
    archetypes.push({ archetype: 'STABLE_INCOME', score: 0.50, reason: '기본 분류 — 안정 수익형 (v0.2: R10 폐기)' });
  }

  // Sort by score descending
  archetypes.sort((a, b) => b.score - a.score);

  return {
    primaryArchetype: archetypes[0].archetype,
    secondaryArchetypes: archetypes.slice(1).map((a) => a.archetype),
    confidenceScore: archetypes[0].score,
    reasons: archetypes.map((a) => a.reason),
  };
}
