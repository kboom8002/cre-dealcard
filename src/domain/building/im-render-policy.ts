/**
 * @module IMRenderPolicy
 * @description CREDEAL v3 IM Render Policy
 * 
 * Dictates information exposure policy between Basic IM (Public/Masked) and Pro IM (Gated/Watermarked).
 * @see SDD §8 S3-T4
 */

import { DisclosurePolicy, DISCLOSURE_DEFAULT } from './mobile-im/disclosure-policy';


/**
 * Represents the IM tier (unified — Basic/Pro 구분 제거).
 * Legacy 'basic' | 'pro' values are still accepted for backward compatibility.
 */
export type IMTier = 'basic' | 'pro' | 'standard';

/**
 * Configuration for rendering an Information Memorandum (IM) based on data grade.
 * Defines what sensitive information can be displayed.
 */
export interface IMRenderPolicy {
  /** The tier this policy represents */
  tier: IMTier;
  /** Whether to show the exact property address */
  showExactAddress: boolean;
  showExactMapCoordinates: boolean;
  showTenantNames: boolean;
  showUnitRent: boolean;
  showDcfSensitivity: boolean;
  requiresWatermark: boolean;
  requiresNDA: boolean;
  disclosure: DisclosurePolicy;
}

/**
 * 등급 기반 IM 렌더 정책 (Basic/Pro 구분 제거).
 * A등급: 전체 공개 (주소, 임차인, 호실별 임대료, DCF)
 * B등급: 부분 공개 (주소 표시, 임차인/호실 임대료 마스킹, DCF 미포함)
 * C등급: 최소 공개 (주소 마스킹, 모든 민감 정보 마스킹)
 *
 * @param {string} grade - 데이터 등급 ('A' | 'B' | 'C')
 * @param {IMTier} [tier] - 레거시 호환용 (무시됨)
 * @param {boolean} [isNDASigned] - 레거시 호환용 (무시됨)
 * @returns {IMRenderPolicy}
 */
export function getIMRenderPolicy(tier: IMTier = 'standard', isNDASigned: boolean = false, grade?: string): IMRenderPolicy {
  // A등급: 전체 공개
  if (grade === 'A') {
    return {
      tier: 'standard',
      showExactAddress: true,
      showExactMapCoordinates: true,
      showTenantNames: true,
      showUnitRent: true,
      showDcfSensitivity: true,
      requiresWatermark: false,
      requiresNDA: false,
      disclosure: DISCLOSURE_DEFAULT['pro'],
    };
  }

  // B등급: 주소 공개, 임차인/호실 임대료 마스킹
  if (grade === 'B') {
    return {
      tier: 'standard',
      showExactAddress: true,
      showExactMapCoordinates: true,
      showTenantNames: false,
      showUnitRent: false,
      showDcfSensitivity: false,
      requiresWatermark: false,
      requiresNDA: false,
      disclosure: DISCLOSURE_DEFAULT['basic'],
    };
  }

  // C등급 또는 기본: 블라인드 (주소/좌표/임차인 모두 마스킹)
  return {
    tier: 'standard',
    showExactAddress: false,
    showExactMapCoordinates: false,
    showTenantNames: false,
    showUnitRent: false,
    showDcfSensitivity: false,
    requiresWatermark: false,
    requiresNDA: false,
    disclosure: DISCLOSURE_DEFAULT['basic'],
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

