/**
 * D37 P0-1: ClaimRegistry — Claim 중앙 저장소
 *
 * 모든 면이 같은 레지스트리를 참조하므로 값 모순이 구조적으로 불가능합니다.
 *
 * @see docs/impipe/D37_P0_IMPLEMENTATION_PLAN.md §P0-1
 */

import { randomUUID } from 'crypto';
import {
  type Claim,
  type ClaimStatus,
  type EvidenceRef,
  validateClaim,
  DISPLAY_LABELS,
} from './claim';
import type { ProvenanceKind } from '../mobile-im/pptx/imlib';
import type { Calculation } from './calculation';

// ── Claim 생성 옵션 ──

export interface CreateClaimOptions {
  subject: string;
  value: number | string | null;
  unit?: string;
  evidence: EvidenceRef[];
  provenance: ProvenanceKind;
  asOf: string;
  status?: ClaimStatus;
  expertRequired?: boolean;
  approvedBy?: string;
  calculation?: Calculation;
}

// ── ClaimRegistry ──

/**
 * Claim 중앙 저장소.
 *
 * 🔴 설계 원칙:
 * - writer.ts에서 1개 인스턴스를 생성하고 전 파이프라인에 주입
 * - 모든 면이 같은 레지스트리의 Claim을 참조 → V4 4면/10면 모순 불가
 * - 등록 시 불변조건 즉시 검사 (fail-fast)
 */
export class ClaimRegistry {
  private claims = new Map<string, Claim>();
  private subjectIndex = new Map<string, string[]>();

  /** Claim 등록. 불변조건 위반 시 violations 배열 반환 (빈 배열 = 정상) */
  register(options: CreateClaimOptions): { claim: Claim; violations: string[] } {
    const claim: Claim = {
      id: randomUUID(),
      subject: options.subject,
      value: options.value,
      unit: options.unit,
      evidence: options.evidence,
      provenance: options.provenance,
      displayLabel: DISPLAY_LABELS[options.provenance] ?? '? 미확인',
      asOf: options.asOf,
      status: options.status ?? 'unverified',
      expertRequired: options.expertRequired ?? false,
      approvedBy: options.approvedBy,
      calculation: options.calculation,
    };

    // value=null이면 status를 자동으로 not_available로 설정
    if (claim.value === null && claim.status !== 'not_available') {
      claim.status = 'not_available';
    }

    const violations = validateClaim(claim);

    this.claims.set(claim.id, claim);

    // subject 인덱스 갱신
    const existing = this.subjectIndex.get(claim.subject) ?? [];
    existing.push(claim.id);
    this.subjectIndex.set(claim.subject, existing);

    return { claim, violations };
  }

  /** ID로 Claim 조회 */
  get(id: string): Claim | undefined {
    return this.claims.get(id);
  }

  /** 전체 Claim 목록 반환 */
  getAll(): Claim[] {
    return Array.from(this.claims.values());
  }

  /** subject 이름으로 Claim 목록 조회 */
  getBySubject(subject: string): Claim[] {
    const ids = this.subjectIndex.get(subject) ?? [];
    return ids.map(id => this.claims.get(id)).filter((c): c is Claim => c !== undefined);
  }

  /** subject로 최신(마지막 등록) Claim 1건 조회 */
  getLatestBySubject(subject: string): Claim | undefined {
    const claims = this.getBySubject(subject);
    return claims.length > 0 ? claims[claims.length - 1] : undefined;
  }

  /** 증거 없는 Claim 검출 (B04/G49 차단 대상) */
  findUnevidenced(): Claim[] {
    return Array.from(this.claims.values()).filter(c => c.evidence.length === 0);
  }

  /** 미승인 Claim 검출 (Draft 워터마크 대상) */
  findUnapproved(): Claim[] {
    return Array.from(this.claims.values()).filter(c => !c.approvedBy);
  }

  /** 충돌 상태 Claim 검출 (B03/G48 차단 대상) */
  findConflicted(): Claim[] {
    return Array.from(this.claims.values()).filter(c => c.status === 'conflicted');
  }

  /** 스테일 Claim 검출 (90일 초과) */
  findStale(referenceDate?: Date): Claim[] {
    const now = referenceDate ?? new Date();
    const thresholdMs = 90 * 24 * 60 * 60 * 1000;
    return Array.from(this.claims.values()).filter(c => {
      const asOfDate = new Date(c.asOf);
      return now.getTime() - asOfDate.getTime() > thresholdMs;
    });
  }

  /** 상태별 집계 (Evidence Status 면용) */
  getStatusSummary(): Record<ClaimStatus, number> {
    const summary: Record<ClaimStatus, number> = {
      unverified: 0,
      broker_checked: 0,
      reconciled: 0,
      conflicted: 0,
      stale: 0,
      not_available: 0,
    };
    for (const claim of this.claims.values()) {
      summary[claim.status]++;
    }
    return summary;
  }

  /** 전체 Claim 수 */
  get size(): number {
    return this.claims.size;
  }

  /** 전체 Claim 배열 반환 */
  all(): Claim[] {
    return Array.from(this.claims.values());
  }

  /** 전체 불변조건 위반 검사 — 발행 전 게이트로 사용 */
  validateAll(): string[] {
    const violations: string[] = [];
    for (const claim of this.claims.values()) {
      violations.push(...validateClaim(claim));
    }
    return violations;
  }
}
