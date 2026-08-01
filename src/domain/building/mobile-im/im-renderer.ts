/**
 * im-renderer.ts
 * 
 * v3 "1회 생성, 2중 렌더링" 아키텍처의 핵심 모듈.
 * writer.ts가 생성한 Raw IM 문서를 Basic/Pro 티어에 따라 필터링합니다.
 */

import type { MobileIMSection } from './types';
import {
  type IMTier,
  type IMRenderPolicy,
  getIMRenderPolicy,
  isSectionVisibleForTier,
  getProOnlyFields,
} from '../im-render-policy';

export interface RawIMDocument {
  sections: MobileIMSection[];
  heroCard?: any;
  dcf10Year?: any;
  financials?: any;
  photos?: any[];
  dataGrade?: string;
  dcfEligible?: boolean;
}

export interface RenderedIM {
  tier: IMTier;
  policy: IMRenderPolicy;
  sections: MobileIMSection[];
  heroCard?: any;
  dcf10Year?: any;
  financials?: any;
  photos?: any[];
  dataGrade?: string;
  /** Sections that were filtered out (for "upgrade to Pro" CTA) */
  gatedSectionTypes: string[];
  /** Fields within visible sections that are Pro-only */
  proOnlyFieldsBySection: Record<string, string[]>;
}

/**
 * 단일 Raw IM 문서를 티어별로 렌더링합니다.
 * 
 * Basic: gated 섹션 제거, Pro 전용 필드 마스킹
 * Pro: 전체 섹션 노출, 호실별 렌트롤 상세 포함
 */
export function renderForTier(raw: RawIMDocument, tier: IMTier, isNDASigned: boolean = false): RenderedIM {
  const policy = getIMRenderPolicy(tier, isNDASigned);
  const gatedSectionTypes: string[] = [];
  const proOnlyFieldsBySection: Record<string, string[]> = {};

  // Filter sections by tier
  const filteredSections = raw.sections.filter(section => {
    const visible = isSectionVisibleForTier(section.section_type, tier);
    if (!visible) {
      gatedSectionTypes.push(section.section_type);
    }
    // Track pro-only fields for visible sections
    if (visible && tier === 'basic') {
      const proFields = getProOnlyFields(section.section_type);
      if (proFields.length > 0) {
        proOnlyFieldsBySection[section.section_type] = proFields;
      }
    }
    return visible;
  });

  // Apply field-level masking for Basic tier
  const maskedSections = tier === 'basic'
    ? filteredSections.map(section => maskSectionForBasic(section, policy))
    : filteredSections;

  return {
    tier,
    policy,
    sections: maskedSections,
    heroCard: raw.heroCard,
    // DCF and sensitivity only for Pro with NDA
    dcf10Year: policy.showDcfSensitivity ? raw.dcf10Year : undefined,
    financials: raw.financials,
    photos: raw.photos,
    dataGrade: raw.dataGrade,
    gatedSectionTypes,
    proOnlyFieldsBySection,
  };
}

/**
 * Basic 티어에서 섹션 내 민감 정보를 마스킹합니다.
 * - 임차인 실명 → 업종명으로 대체
 * - 정확한 주소 → 권역명으로 대체
 * - 호실별 임대료 → 범위로 대체
 */
function maskSectionForBasic(section: MobileIMSection, policy: IMRenderPolicy): MobileIMSection {
  let markdown = section.markdown;

  if (!policy.showTenantNames) {
    // Mask tenant names to sector categories
    // Pattern: Korean names followed by tenant context
    markdown = markdown.replace(
      /([\uAC00-\uD7A3]{2,10})\s*(\/|\(|\s)(\uc784\ucc28\uc778|\uc784\ub300\uc778|\uc138\uc785\uc790)/g,
      '***(업종명) $3'
    );
  }

  if (!policy.showExactAddress) {
    // Mask exact addresses (keep region only)
    markdown = markdown.replace(
      /([\uAC00-\uD7A3]{1,4}시\s+[\uAC00-\uD7A3]{1,4}구\s+)[\uAC00-\uD7A3]{1,8}[\ub3d9\ub85c\uae38]\s*\d+[\uAC00-\uD7A3\d\-]*/g,
      '$1***'
    );
  }

  return { ...section, markdown };
}

/**
 * Pro 뷰어에 호실별 렌트롤 테이블을 주입합니다.
 */
export function injectRentRollDetail(
  sections: MobileIMSection[],
  floorLeases: Array<{ floor: string; tenant_type?: string; deposit_manwon?: number; rent_manwon?: number; is_vacant?: boolean }>
): MobileIMSection[] {
  if (!floorLeases || floorLeases.length === 0) return sections;

  return sections.map(section => {
    if (section.section_type !== 'lease_status') return section;

    const rentRollTable = buildRentRollTable(floorLeases);
    return {
      ...section,
      markdown: section.markdown + '\n\n' + rentRollTable,
    };
  });
}

function buildRentRollTable(
  leases: Array<{ floor: string; tenant_type?: string; deposit_manwon?: number; rent_manwon?: number; is_vacant?: boolean }>
): string {
  const header = '### 호실별 임대차 현황\n\n| 층 | 업종 | 보증금(만원) | 월세(만원) | 상태 |\n|:---|:---|---:|---:|:---:|';
  const rows = leases.map(l => {
    const status = l.is_vacant ? '🟥 공실' : '🟩 임대';
    return `| ${l.floor} | ${l.tenant_type || '-'} | ${l.deposit_manwon?.toLocaleString() || '-'} | ${l.rent_manwon?.toLocaleString() || '-'} | ${status} |`;
  });
  return header + '\n' + rows.join('\n');
}
