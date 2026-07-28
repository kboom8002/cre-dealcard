/**
 * @module DataGradeEngine
 * @description Computes asset data grade (A, B, C, D) based on ontology slot coverage and provenance.
 * Grade A is required for DCF sensitivity matrix eligibility (Rule S0-T6).
 * @see SDD §6 S1-T7
 */

/**
 * Data grade for an asset based on slot coverage.
 * A is highest, D is lowest.
 */
export type DataGrade = 'A' | 'B' | 'C' | 'D';

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
  provenanceMap?: Record<string, { tier: string }>
): DataGradeResult {
  const missingRequired: string[] = [];
  let requiredCount = 0;

  for (const slot of REQUIRED_SLOTS) {
    if (attrs[slot] != null && attrs[slot] !== '') {
      requiredCount++;
    } else {
      missingRequired.push(slot);
    }
  }

  const missingEnhanced: string[] = [];
  let enhancedCount = 0;

  for (const slot of ENHANCED_SLOTS) {
    if (attrs[slot] != null && attrs[slot] !== '') {
      enhancedCount++;
    } else {
      missingEnhanced.push(slot);
    }
  }

  const requiredCoveragePct = Math.round((requiredCount / REQUIRED_SLOTS.length) * 100);
  const enhancedCoveragePct = Math.round((enhancedCount / ENHANCED_SLOTS.length) * 100);
  const scorePct = Math.round((requiredCoveragePct * 0.7) + (enhancedCoveragePct * 0.3));

  let grade: DataGrade = 'D';
  if (requiredCoveragePct === 100 && enhancedCoveragePct >= 80) {
    grade = 'A';
  } else if (requiredCoveragePct === 100 && enhancedCoveragePct >= 50) {
    grade = 'B';
  } else if (requiredCoveragePct >= 70) {
    grade = 'C';
  } else {
    grade = 'D';
  }

  return {
    grade,
    scorePct,
    requiredCoveragePct,
    enhancedCoveragePct,
    missingRequiredSlots: missingRequired,
    missingEnhancedSlots: missingEnhanced,
    dcfEligible: grade === 'A',
  };
}
