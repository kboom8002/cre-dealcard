/**
 * @module DataGradeEngine
 * @description Computes asset data grade (A, B, C, D) based on ontology slot coverage and provenance.
 * Grade A is required for DCF sensitivity matrix eligibility (Rule S0-T6).
 * @see SDD §6 S1-T7
 */

import { getGradeWeights, type AssetType } from '../building/asset-ontology';
import { isFeatureEnabled } from '../building/feature-flags';
import { lintProvenance } from '../building/provenance-lint';

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
}

/**
 * List of slots required for a baseline asset representation.
 */
const REQUIRED_SLOTS = [
  'pnu',
  'address',
  'landAreaPyung',
  'totalFloorAreaPyung',
  'askingPriceKrw',
  'grossAnnualIncomeKrw',
  'zoningRegion',
];

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

/**
 * Computes the data grade for an asset based on provided attributes.
 * 
 * @param attrs - Key-value map of asset attributes
 * @param provenanceMap - Optional map of attribute provenances
 * @returns Data grade result containing the grade and missing slots
 * @see SDD §6 S1-T7
 */
export function computeDataGrade(
  attrs: Record<string, unknown>,
  provenanceMap?: Record<string, { tier: string }>,
  assetType?: AssetType
): DataGradeResult {
  // Use asset-type-specific weights from ontology if available
  const weights = (assetType && isFeatureEnabled('ff_s1_ontology_loader')) ? getGradeWeights(assetType) : null;

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

  for (const slot of REQUIRED_SLOTS) {
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
    : Math.round((requiredCount / REQUIRED_SLOTS.length) * 100);
  const enhancedCoveragePct = weights 
    ? Math.round((enhancedWeightSum / totalEnhancedWeight) * 100) 
    : Math.round((enhancedCount / ENHANCED_SLOTS.length) * 100);

  // Use new weights for scorePct
  let totalNewWeight = 0;
  let earnedNewWeight = 0;
  const missingCategories: Array<{category: string, weight: number}> = [];

  for (const [category, w] of Object.entries(NEW_WEIGHTS)) {
    totalNewWeight += w;
    if (attrs[category] != null && attrs[category] !== '' && attrs[category] !== false) {
      earnedNewWeight += w;
    } else {
      missingCategories.push({ category, weight: w });
    }
  }

  const scorePct = Math.round((earnedNewWeight / totalNewWeight) * 100);

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

  return {
    grade,
    scorePct,
    requiredCoveragePct,
    enhancedCoveragePct,
    missingRequiredSlots: missingRequired,
    missingEnhancedSlots: missingEnhanced,
    dcfEligible: grade === 'A',
    advice: adviceObj,
  };
}

export function computeGradeAdvice(): GradeAdvice {
  return {
    current: { score: 0, grade: 'D' },
    nextGrade: 'C',
    actions: []
  };
}
