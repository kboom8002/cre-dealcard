/**
 * @module DataGradeEngine
 * @description Computes asset data grade (A, B, C, D) based on ontology slot coverage and provenance.
 * Grade A is required for DCF sensitivity matrix eligibility (Rule S0-T6).
 * @see SDD §6 S1-T7
 */

import { getGradeWeights, type AssetType } from '../building/asset-ontology';
import { isFeatureEnabled } from '../building/feature-flags';
import { lintProvenance } from '../building/provenance-lint';
import { gradeProfile, effectiveWeights } from '@/domain/ontology';

/**
 * Data grade for an asset based on slot coverage.
 * A is highest, D is lowest.
 */
export type DataGrade = 'A' | 'B' | 'C' | 'D';

export interface GradeAdvice {
  current: { score: number; grade: 'A' | 'B' | 'C' | 'D' };
  nextGrade: 'A' | 'B' | 'C';
  actions: Array<{
    slotGroup: string;
    label: string;
    scoreGain: number;
    effortMinutes: number;
    unlocks: string[];
  }>;
}

/**
 * Result of the data grade computation.
 */
export interface DataGradeResult {
  /** Computed overall data grade */
  grade: DataGrade;
  /** Overall score percentage */
  scorePct: number;
  /** Coverage percentage of required slots */
  requiredCoveragePct: number;
  /** Coverage percentage of enhanced slots */
  enhancedCoveragePct: number;
  /** List of missing required slots */
  missingRequiredSlots: string[];
  /** List of missing enhanced slots */
  missingEnhancedSlots: string[];
  /** Whether the asset is eligible for DCF analysis (requires Grade A) */
  dcfEligible: boolean;
  /** Top 3 effort-efficient actions */
  advice: GradeAdvice;
  /** Gate: D < 40 blocks publish */
  blockPublish?: boolean;
  /** Gate: C 40-65 suppresses total return */
  suppressTotalReturn?: boolean;
  /** Gate: B 65-85 suppresses DCF */
  suppressDcf?: boolean;
}

/**
 * Returns required slots dynamically based on posture.
 */
function getRequiredSlots(posture?: string): string[] {
  const baseSlots = ['pnu', 'address', 'landAreaPyung', 'totalFloorAreaPyung', 'askingPriceKrw', 'zoningRegion'];
  if (posture === 'income') return [...baseSlots, 'grossAnnualIncomeKrw'];
  if (posture === 'development') return [...baseSlots, 'farPct'];
  return baseSlots;
}

/**
 * List of enhanced slots for higher data grades.
 */
const ENHANCED_SLOTS = [
  'approvalDate',
  'farHeadroomPp',
  'evictionStatus',
  'rentRoll',
  'officialLandPricePerSqm',
  'roadContactType',
  'parkingCapacity',
];

const NEW_WEIGHTS: Record<string, number> = {
  lease_roll: 25,
  building_basic: 15,
  land_parcel: 15,
  financial_input: 15,
  zoning: 10,
  title_encumbrance: 10,
  road_access: 5,
  market_comp: 5
};

const PROVENANCE_COEFF: Record<string, number> = {
  public_data: 1.0,
  expert_verified: 0.95,
  seller_declared: 0.65,
  broker_input: 0.60,
  ai_inferred: 0.30,
  assumed: 0.30,
};

/**
 * Computes the data grade for an asset based on provided attributes.
 * 
 * @param attrsOrSlots - Key-value map of asset attributes or slots with filled/provenance
 * @param identityOrProvenance - Optional map of attribute provenances or identity object
 * @returns Data grade result containing the grade and missing slots
 * @see SDD §6 S1-T7
 */
export function computeDataGrade(
  attrsOrSlots: Record<string, any>,
  identityOrProvenance?: any,
  legacyAssetType?: AssetType
): DataGradeResult {
  let attrs: Record<string, any> = {};
  let identity: { assetType?: string; investmentPosture?: string } | undefined;
  let provenanceMap: Record<string, { tier: string }> | undefined;
  let assetType: AssetType | undefined = legacyAssetType;

  // Determine if arg1 is slots or attrs
  const isSlots = Object.values(attrsOrSlots).some(v => v && typeof v === 'object' && 'filled' in v);
  if (isSlots) {
    for (const [k, v] of Object.entries(attrsOrSlots)) {
      attrs[k] = v.filled ? 'filled' : '';
    }
  } else {
    attrs = attrsOrSlots;
  }

  // Determine arg2
  if (identityOrProvenance) {
    if ('assetType' in identityOrProvenance || 'investmentPosture' in identityOrProvenance) {
      identity = identityOrProvenance;
      assetType = identity?.assetType as AssetType;
    } else {
      provenanceMap = identityOrProvenance;
    }
  }

  let weights = (assetType && isFeatureEnabled('ff_s1_ontology_loader')) ? getGradeWeights(assetType) : null;
  
  if (identity && identity.assetType && identity.investmentPosture) {
    const profile = gradeProfile(identity.assetType as any, identity.investmentPosture as any);
    const notApplicableGroups: string[] = [];
    weights = effectiveWeights(profile, notApplicableGroups);
  }

  // v3: Run provenance lint (S1-T4)
  if (provenanceMap) {
    const lintResult = lintProvenance(attrs, provenanceMap);
    if (lintResult.overallHealth === 'major_conflicts') {
      console.warn('[grade-engine] Major provenance conflicts detected:', lintResult.conflicts.length);
    }
  }

  const missingRequired: string[] = [];
  let requiredCount = 0;
  let requiredWeightSum = 0;
  let totalRequiredWeight = 0;

  const reqSlots = getRequiredSlots(identity?.investmentPosture);
  for (const slot of reqSlots) {
    const w = weights ? (weights[slot] ?? 1) : 1;
    totalRequiredWeight += w;
    if (attrs[slot] != null && attrs[slot] !== '') {
      requiredCount++;
      requiredWeightSum += w;
    } else {
      missingRequired.push(slot);
    }
  }

  const missingEnhanced: string[] = [];
  let enhancedCount = 0;
  let enhancedWeightSum = 0;
  let totalEnhancedWeight = 0;

  for (const slot of ENHANCED_SLOTS) {
    const w = weights ? (weights[slot] ?? 1) : 1;
    totalEnhancedWeight += w;
    if (attrs[slot] != null && attrs[slot] !== '') {
      enhancedCount++;
      enhancedWeightSum += w;
    } else {
      missingEnhanced.push(slot);
    }
  }

  const requiredCoveragePct = weights 
    ? Math.round((requiredWeightSum / totalRequiredWeight) * 100) 
    : Math.round((requiredCount / reqSlots.length) * 100);
  const enhancedCoveragePct = weights 
    ? Math.round((enhancedWeightSum / totalEnhancedWeight) * 100) 
    : Math.round((enhancedCount / ENHANCED_SLOTS.length) * 100);

  // Use new weights for scorePct
  let totalNewWeight = 0;
  let earnedNewWeight = 0;
  const missingCategories: Array<{category: string, weight: number}> = [];

  const baseWeights = weights || NEW_WEIGHTS;

  const CATEGORY_SLOTS: Record<string, string[]> = {
    lease_roll: ['rentRoll', 'grossAnnualIncomeKrw'],
    building_basic: ['totalFloorAreaPyung', 'approvalDate', 'evictionStatus'],
    land_parcel: ['pnu', 'address', 'landAreaPyung', 'officialLandPricePerSqm'],
    financial_input: ['askingPriceKrw', 'grossAnnualIncomeKrw'],
    zoning: ['zoningRegion', 'farHeadroomPp'],
    title_encumbrance: ['pnu'],
    road_access: ['roadContactType'],
    market_comp: ['askingPriceKrw']
  };

  for (const [category, w] of Object.entries(baseWeights)) {
    totalNewWeight += w;
    const directData = isSlots ? (attrsOrSlots[category]?.filled) : (attrs[category] != null && attrs[category] !== '' && attrs[category] !== false);
    const mappedData = !directData && CATEGORY_SLOTS[category]?.some(slot => attrs[slot] != null && attrs[slot] !== '' && attrs[slot] !== false);
    const hasData = Boolean(directData || mappedData);
    
    if (hasData) {
      let provCoeff = 1.0;
      if (isSlots && attrsOrSlots[category]?.provenance) {
        provCoeff = PROVENANCE_COEFF[attrsOrSlots[category].provenance] ?? 1.0;
      }
      earnedNewWeight += (w * provCoeff);
    } else {
      missingCategories.push({ category, weight: w });
    }
  }

  const scorePct = totalNewWeight > 0 ? Math.round((earnedNewWeight / totalNewWeight) * 100) : 0;

  let grade: DataGrade = 'D';
  if (scorePct >= 85) {
    grade = 'A';
  } else if (scorePct >= 65) {
    grade = 'B';
  } else if (scorePct >= 40) {
    grade = 'C';
  } else {
    grade = 'D';
  }

  // Next grade logic
  let nextGrade: 'A' | 'B' | 'C' = 'A';
  if (grade === 'A') nextGrade = 'A';
  else if (grade === 'B') nextGrade = 'A';
  else if (grade === 'C') nextGrade = 'B';
  else if (grade === 'D') nextGrade = 'C';

  // Compute actions for GradeAdvice (using dummy effortMinutes)
  const actions = missingCategories
    .map(c => ({
      slotGroup: c.category,
      label: `Provide data for ${c.category}`,
      scoreGain: c.weight,
      effortMinutes: 5, // arbitrary default
      unlocks: [],
    }))
    .sort((a, b) => (b.scoreGain / b.effortMinutes) - (a.scoreGain / a.effortMinutes))
    .slice(0, 3);

  const adviceObj: GradeAdvice = {
    current: { score: scorePct, grade },
    nextGrade,
    actions,
  };

  // Grade-based feature gating
  const blockPublish = scorePct < 40;
  const suppressTotalReturn = scorePct >= 40 && scorePct < 65;
  const suppressDcf = scorePct >= 65 && scorePct < 85;

  return {
    grade,
    scorePct,
    requiredCoveragePct,
    enhancedCoveragePct,
    missingRequiredSlots: missingRequired,
    missingEnhancedSlots: missingEnhanced,
    dcfEligible: grade === 'A',
    advice: adviceObj,
    blockPublish,
    suppressTotalReturn,
    suppressDcf,
  };
}

export function computeGradeAdvice(unfilledSlots: Array<{key: string, weight: number}>) {
  // Sort unfilled slots by weight descending, return top 3
  const advice = unfilledSlots
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map(slot => ({
      slotKey: slot.key,
      scoreGain: slot.weight * 100,
      effortMinutes: slot.key.includes('lease') ? 30 : slot.key.includes('photo') ? 10 : 15,
      action: `'${slot.key}' 데이터를 입력하면 등급이 약 ${(slot.weight * 100).toFixed(0)}점 상승합니다.`,
    }));
  return advice;
}
