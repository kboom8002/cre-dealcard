import type { MobileIMSection, MobileIMSectionType } from './types';

/**
 * Fallback section factory for when a section exceeds the hard time limit (105s).
 * Migrates incomplete optional sections into a checklist notice (D30 BL-7).
 */
export function createTimeoutChecklistSection(
  sectionType: string,
  sectionOrder: number,
): MobileIMSection {
  return {
    section_type: 'checklist' as MobileIMSectionType,
    section_order: sectionOrder,
    title: `${sectionType} — 생성 시간 초과`,
    markdown: `> ⚠️ \`${sectionType}\` 섹션이 생성 시간 제한(105초)을 초과하여 확인사항으로 이관되었습니다.\n> 데이터를 보완한 후 재생성해 주세요.`,
    confidence: 'needs_check',
    boundary_note: 'D30 BL-7: 105초 초과 확인사항 이관',
    provenance: [],
    min_tier: 'public',
  };
}

/**
 * Fallback section factory for when all idempotency retries are exhausted (D30 M-8).
 */
export function createRetryExhaustedChecklistSection(
  sectionType: string,
  sectionOrder: number,
  maxRetries: number,
  errorMessage?: string,
): MobileIMSection {
  return {
    section_type: 'checklist' as MobileIMSectionType,
    section_order: sectionOrder,
    title: `${sectionType} — 생성 실패`,
    markdown: `> ⚠️ \`${sectionType}\` 섹션 생성이 ${maxRetries + 1}회 시도 후 실패했습니다.\n> 오류: ${errorMessage || '알 수 없음'}`,
    confidence: 'needs_check',
    boundary_note: 'D30 M-8: 재시도 소진 확인사항 이관',
    provenance: [],
    min_tier: 'public',
  };
}

/**
 * Fallback section factory for when global kill limit (120s) is reached (D29 BL-6).
 */
export function createKillLimitChecklistSection(
  sectionOrder: number,
  discardedCount: number,
): MobileIMSection {
  return {
    section_type: 'checklist' as MobileIMSectionType,
    section_order: sectionOrder,
    title: '생성 시간 초과 알림',
    markdown: `> ⚠️ 생성 시간이 제한(120초)을 초과하여 ${discardedCount}개 섹션이 제거되었습니다.\n> 데이터를 보완한 후 재생성해 주세요.`,
    confidence: 'needs_check',
    boundary_note: `BL-6: ${discardedCount}개 섹션 타임아웃 폐기`,
    provenance: [],
    min_tier: 'public',
  };
}
