/**
 * D37 P1-6: 승인 게이트 — approval.* 네임스페이스
 *
 * D36 §2.7: 06 문서 미작성으로 Full Advisory 승격 조건 미구현.
 * BG (Broker Grade) 레벨까지만 승인 게이트를 제공합니다.
 *
 * @see docs/impipe/D37_P1P2_IMPLEMENTATION_PLAN.md §P1-6
 */

import type { ClaimRegistry } from './claim-registry';
import type { ReleaseTier } from './release-tier';
import type { InvestmentPosture } from '@/domain/ontology';

// ── 승인 레벨 ──

export type ApprovalLevel = 'draft' | 'broker_review' | 'bg_release';
// 'full_advisory' — 06 사양 완성 후 추가 예정

export interface ApprovalGateResult {
  level: ApprovalLevel;
  passed: boolean;
  blockers: ApprovalBlocker[];
  /** 06 미작성 안내 */
  fullAdvisoryNote: string;
}

export interface ApprovalBlocker {
  id: string;
  description: string;
  severity: 'block' | 'warn';
}

// ── 승인 검사 ──

/**
 * ClaimRegistry + ReleaseTier 기반 승인 게이트 실행.
 *
 * BG 레벨 검사:
 * 1. 미해결 충돌(conflicted) 0건
 * 2. not_available Claim이 필수 항목에 해당하지 않음
 * 3. ReleaseTier가 fact_om 이상
 * 4. 할루시네이션 미검출
 */
export function runApprovalGate(
  registry: ClaimRegistry,
  tier: ReleaseTier,
  options?: {
    hasHallucination?: boolean;
    publishBlocked?: boolean;
    posture?: InvestmentPosture;
  },
): ApprovalGateResult {
  const blockers: ApprovalBlocker[] = [];

  // 1. 미해결 충돌
  const conflicted = registry.findConflicted();
  if (conflicted.length > 0) {
    blockers.push({
      id: 'approval.conflict',
      description: `미해결 충돌 ${conflicted.length}건: ${conflicted.map(c => c.subject).join(', ')}`,
      severity: 'block',
    });
  }

  // 2. 필수 항목 존재 및 상태 검사 (G2 해결: 빈 Registry 허위 통과 방지)
  // 포스처별 필수 Claim 분기: gross_yield는 수익형에서만 필수
  const posture = options?.posture ?? 'income';
  const REQUIRED_SUBJECTS: string[] = ['asking_price', 'total_area'];
  if (posture === 'income' || posture === 'trading' || posture === 'operating') {
    REQUIRED_SUBJECTS.push('gross_yield');
  }
  const SUBJECT_ALIASES: Record<string, string[]> = {
    total_area: ['total_area', 'total_area_sqm'],
    gross_yield: ['gross_yield', 'yield_on_cost', 'cap_rate'],
  };
  const allClaims = registry.getAll ? registry.getAll() : [];
  if (allClaims.length === 0) {
    blockers.push({
      id: 'approval.empty_registry',
      description: '등록된 Claim이 없어 승인할 수 없습니다 (빈 ClaimRegistry 방지).',
      severity: 'block',
    });
  } else {
    for (const subj of REQUIRED_SUBJECTS) {
      const aliases = SUBJECT_ALIASES[subj] ?? [subj];
      const claims = allClaims.filter(c => aliases.includes(c.subject));
      if (claims.length === 0) {
        blockers.push({
          id: `approval.required_missing.${subj}`,
          description: `필수 항목 '${subj}'이 Claim 목록에 누락되었습니다`,
          severity: 'block',
        });
      } else if (claims.every(c => c.status === 'not_available' || c.status === 'unverified')) {
        blockers.push({
          id: `approval.required_na.${subj}`,
          description: `필수 항목 '${subj}'이 미확인 상태입니다`,
          severity: 'block',
        });
      }
    }

    // Numeric bounds validation — price and area must be positive
    const numericSubjects = ['asking_price', 'total_area_sqm', 'land_area_sqm'];
    for (const subj of numericSubjects) {
      const claimsForSubj = allClaims.filter(c => c.subject === subj);
      for (const claim of claimsForSubj) {
        if (typeof claim.value === 'number' && claim.value <= 0) {
          blockers.push({
            id: `approval.invalid_value.${subj}`,
            description: `'${subj}' 값이 0 이하입니다 (${claim.value})`,
            severity: 'block',
          });
        }
      }
    }
  }

  // 3. ReleaseTier 검사
  if (tier === 'internal_only') {
    blockers.push({
      id: 'approval.tier_insufficient',
      description: 'ReleaseTier가 internal_only입니다. 외부 발행 불가.',
      severity: 'block',
    });
  }

  // 4. 할루시네이션
  if (options?.hasHallucination) {
    blockers.push({
      id: 'approval.hallucination',
      description: '할루시네이션 검출됨. 검토 필요.',
      severity: 'warn',
    });
  }

  // 5. 발행 게이트 차단
  if (options?.publishBlocked) {
    blockers.push({
      id: 'approval.publish_gate',
      description: '발행 게이트(runPublishGates)가 차단 상태입니다.',
      severity: 'block',
    });
  }

  const hasBlocker = blockers.some(b => b.severity === 'block');

  return {
    level: hasBlocker ? 'draft' : 'bg_release',
    passed: !hasBlocker,
    blockers,
    fullAdvisoryNote: 'Full Advisory 승격 조건은 06번 사양 완성 후 적용 예정입니다.',
  };
}
