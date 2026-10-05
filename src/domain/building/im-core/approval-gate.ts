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
import type { InvestmentPosture } from '@/domain/ontology/enums';

// ── 승인 레벨 ──

export type ApprovalLevel = 'draft' | 'broker_review' | 'bg_release';
// 'full_advisory' — 06 사양 완성 후 추가 예정

export interface ApprovalGateResult {
  level: ApprovalLevel;
  passed: boolean;
  blockers: ApprovalBlocker[];
  /** 승인을 막지 않는 안내성 경고 (포스처별 선택 항목 누락 등). blockers 와 분리해 기존 "blockers 비어 있음" 계약을 유지한다. */
  warnings: ApprovalBlocker[];
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
  const warnings: ApprovalBlocker[] = [];

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
  // 포스처별 면적 필수 항목 (2026-10 RCA R2):
  //   income/operating/owner_occupied/trading → 매매가 + 연면적 필수, 대지면적은 부수(없으면 warn)
  //   development → 매매가 + 대지면적 필수, 연면적(기존)은 선택(없으면 warn). 계획 연면적은 별도 subject(target_gross_area_sqm).
  const isDevelopment = posture === 'development';
  const REQUIRED_SUBJECTS: string[] = ['asking_price', isDevelopment ? 'land_area' : 'total_area'];
  if (posture === 'income') {
    REQUIRED_SUBJECTS.push('gross_yield');
  }
  // 필수는 아니지만 누락 시 경고만 남기는 항목
  const OPTIONAL_WARN_SUBJECTS: string[] = [isDevelopment ? 'total_area' : 'land_area'];
  const SUBJECT_ALIASES: Record<string, string[]> = {
    total_area: ['total_area', 'total_area_sqm', 'gross_floor_area_sqm', 'total_gross_area_sqm'],
    land_area: ['land_area', 'land_area_sqm', 'plat_area_sqm', 'site_area_sqm'],
    gross_yield: ['gross_yield', 'yield_on_cost', 'cap_rate', 'cap_rate_base', 'net_yield'],
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
        const severity = (subj === 'gross_yield' && posture === 'income') ? 'warn' : 'block';
        blockers.push({
          id: `approval.required_missing.${subj}`,
          description: `필수 항목 '${subj}'이 Claim 목록에 누락되었습니다`,
          severity,
        });
      } else if (claims.every(c => c.status === 'not_available' || c.status === 'unverified')) {
        blockers.push({
          id: `approval.required_na.${subj}`,
          description: `필수 항목 '${subj}'이 미확인 상태입니다`,
          severity: 'block',
        });
      }
    }

    // 선택(비필수) 면적 항목: 누락/미확인은 차단하지 않고 경고만 (0 값은 아래 invalid_value 가 계속 차단)
    for (const subj of OPTIONAL_WARN_SUBJECTS) {
      const aliases = SUBJECT_ALIASES[subj] ?? [subj];
      const claims = allClaims.filter(c => aliases.includes(c.subject));
      if (claims.length === 0 || claims.every(c => c.status === 'not_available' || c.status === 'unverified')) {
        warnings.push({
          id: `approval.optional_missing.${subj}`,
          description: `선택 항목 '${subj}'이(가) 없습니다 (${posture} 포스처에서는 발행을 막지 않음)`,
          severity: 'warn',
        });
      }
    }

    // Numeric bounds validation — price and area must be positive (방어선: 0 클레임이 등록돼도 차단)
    const numericSubjects = ['asking_price', 'total_area_sqm', 'land_area_sqm', 'plat_area_sqm', 'site_area_sqm', 'target_gross_area_sqm'];
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
    warnings,
    fullAdvisoryNote: 'Full Advisory 승격 조건은 06번 사양 완성 후 적용 예정입니다.',
  };
}
