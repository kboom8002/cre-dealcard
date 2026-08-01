/**
 * @module IMRenderPolicy
 * @description CREDEAL v3 IM Render Policy
 * 
 * Dictates information exposure policy between Basic IM (Public/Masked) and Pro IM (Gated/Watermarked).
 * @see SDD §8 S3-T4
 */

/**
 * Represents the two tiers of Information Memorandum (IM) available to users.
 * - 'basic': Public view with masked address and fuzzy coordinates.
 * - 'pro': Gated view with full disclosure, requires NDA.
 */
export type IMTier = 'basic' | 'pro';

/**
 * Configuration for rendering an Information Memorandum (IM) based on tier and permissions.
 * Defines what sensitive information can be displayed.
 */
export interface IMRenderPolicy {
  /** The tier this policy represents */
  tier: IMTier;
  /** Whether to show the exact property address (hidden in Basic) */
  showExactAddress: boolean;
  showExactMapCoordinates: boolean;
  showTenantNames: boolean;
  showUnitRent: boolean;
  showDcfSensitivity: boolean;
  requiresWatermark: boolean;
  requiresNDA: boolean;
}

/**
 * Retrieves the Information Memorandum (IM) render policy for a given tier and NDA status.
 * Basic tier masks the exact address, coordinates, tenant names, and financial data.
 * Pro tier requires an NDA to unmask all sensitive data.
 * 
 * @param {IMTier} tier - The requested IM tier.
 * @param {boolean} [isNDASigned=false] - Whether the user has a signed NDA.
 * @returns {IMRenderPolicy} The resulting render policy determining data visibility.
 * @example
 * const policy = getIMRenderPolicy('basic');
 * // policy.showExactAddress === false
 */
export function getIMRenderPolicy(tier: IMTier, isNDASigned: boolean = false): IMRenderPolicy {
  if (tier === 'pro' && isNDASigned) {
    return {
      tier: 'pro',
      showExactAddress: true,
      showExactMapCoordinates: true,
      showTenantNames: true,
      showUnitRent: true,
      showDcfSensitivity: true,
      requiresWatermark: true,
      requiresNDA: true,
    };
  }

  // Basic IM (or Pro IM without signed NDA)
  return {
    tier: 'basic',
    showExactAddress: false,
    showExactMapCoordinates: false, // Use ±150m fuzzy offset
    showTenantNames: false,          // Redact to sector (e.g. F&B)
    showUnitRent: false,             // Redact to range
    showDcfSensitivity: false,       // Gated
    requiresWatermark: false,
    requiresNDA: false,
  };
}

/** Section-level visibility slot */
export type SlotVisibility = 'public' | 'gated';

/** Per-section render policy */
export interface IMSectionSlot {
  sectionType: string;
  visibility: SlotVisibility;
  proOnlyFields?: string[]; // Fields only exposed in Pro
}

/** v3 Section slot definitions */
export const IM_SECTION_SLOTS: IMSectionSlot[] = [
  { sectionType: 'property_overview', visibility: 'public' },
  { sectionType: 'location_access', visibility: 'public' },
  { sectionType: 'lease_status', visibility: 'public', proOnlyFields: ['rentRollDetail', 'tenantNames'] },
  { sectionType: 'income_analysis', visibility: 'public', proOnlyFields: ['dcf10Year', 'sensitivityMatrix'] },
  { sectionType: 'risk_check', visibility: 'public', proOnlyFields: ['granularRights', 'enforcementHistory'] },
  { sectionType: 'investment_thesis', visibility: 'public' },
  { sectionType: 'next_steps', visibility: 'public' },
  // Pro-only sections (Phase M4.5)
  { sectionType: 'loan_simulation', visibility: 'gated' },
  { sectionType: 'tax_scenarios', visibility: 'gated' },
  { sectionType: 'massing_yield', visibility: 'gated' },
];

/** Check if a section is visible for the given tier */
export function isSectionVisibleForTier(sectionType: string, tier: IMTier): boolean {
  const slot = IM_SECTION_SLOTS.find(s => s.sectionType === sectionType);
  if (!slot) return true; // Unknown sections default to visible
  if (slot.visibility === 'gated' && tier === 'basic') return false;
  return true;
}

/** Get pro-only fields for a section */
export function getProOnlyFields(sectionType: string): string[] {
  const slot = IM_SECTION_SLOTS.find(s => s.sectionType === sectionType);
  return slot?.proOnlyFields || [];
}

