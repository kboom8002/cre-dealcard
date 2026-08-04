/**
 * @file variant-manager.ts
 * @description 복수 관점 IM(variant) 관리 모듈
 * AUTH-08.3: 동일 딜에 대해 posture별 복수 IM 생성·관리
 *
 * 핵심 원칙:
 * - 슬롯 값은 딜 수준 공유 (variant간 중복 입력 없음)
 * - 편성·등급·발행은 variant 단위 분리
 * - 검수 서명은 딜 수준 통합
 */

import type { InvestmentPosture } from '@/domain/ontology';
import type { SectionPlan } from './section-catalog';
import { getSectionPlan } from './section-catalog';
import type { ArchetypeCode } from './archetype-registry';

/** 단일 IM variant 정의 */
export interface IMVariant {
  /** variant 고유 ID */
  variantId: string;
  /** 소속 딜 ID */
  dealId: string;
  /** 투자 관점 */
  posture: InvestmentPosture;
  /** 아키타입 (선택) */
  archetype: ArchetypeCode | null;
  /** 섹션 편성 계획 */
  sectionPlan: SectionPlan;
  /** 등급 (variant별 독립) */
  grade: { score: number; grade: string } | null;
  /** 발행 기록 */
  publishRecord: PublishRecord | null;
  /** 생성 시각 */
  createdAt: string;
}

/** 발행 기록 */
export interface PublishRecord {
  publishedAt: string;
  publishedBy: string;
  ontologyVersion: string;
  gateResults: Array<{ id: string; passed: boolean }>;
}

/** variant 생성 */
export function createVariant(
  dealId: string,
  posture: InvestmentPosture,
  archetype?: ArchetypeCode,
): IMVariant {
  const variantId = `var_${dealId}_${posture}_${Date.now().toString(36)}`;
  return {
    variantId,
    dealId,
    posture,
    archetype: archetype ?? null,
    sectionPlan: getSectionPlan(posture),
    grade: null,
    publishRecord: null,
    createdAt: new Date().toISOString(),
  };
}

/**
 * 딜의 모든 variant 목록 조회 (인메모리)
 * 실제 구현 시 DB 조회로 교체
 */
const variantStore = new Map<string, IMVariant[]>();

export function listVariants(dealId: string): IMVariant[] {
  return variantStore.get(dealId) ?? [];
}

export function addVariant(variant: IMVariant): void {
  const existing = variantStore.get(variant.dealId) ?? [];
  // 동일 posture 중복 방지
  const filtered = existing.filter(v => v.posture !== variant.posture);
  filtered.push(variant);
  variantStore.set(variant.dealId, filtered);
}

export function deleteVariant(dealId: string, variantId: string): void {
  const existing = variantStore.get(dealId) ?? [];
  variantStore.set(dealId, existing.filter(v => v.variantId !== variantId));
}

/** variant 등급 업데이트 */
export function updateVariantGrade(
  dealId: string,
  variantId: string,
  grade: { score: number; grade: string },
): void {
  const variants = variantStore.get(dealId) ?? [];
  const target = variants.find(v => v.variantId === variantId);
  if (target) target.grade = grade;
}
