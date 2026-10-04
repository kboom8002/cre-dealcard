/**
 * @file invariant-telemetry.ts
 * @description H1 출력 불변식 위반의 운영 텔레메트리/모드 해석 (Hardening D3).
 *
 * IM_INVARIANT_MODE:
 *  - warn  (기본) : 렌더 비차단. warnings + 구조화 로그(`im_invariant_violation`)만 남긴다.
 *  - block        : error 위반이 1건이라도 있으면 PPTX 렌더를 실패시킨다 (2주 관측 후 상향 대상).
 */
import type { InvariantViolation } from './output-invariants';

export type InvariantMode = 'warn' | 'block';

export function resolveInvariantMode(env: NodeJS.ProcessEnv = process.env): InvariantMode {
  return (env.IM_INVARIANT_MODE ?? 'warn').toLowerCase() === 'block' ? 'block' : 'warn';
}

export interface ViolationSummary {
  errorCount: number;
  warnCount: number;
  /** 규칙 id 별 건수 */
  byRule: Record<string, number>;
  /** 위반이 발생한 슬라이드 번호(1-base, 중복 제거, 오름차순) */
  slides: number[];
}

export function summarizeViolations(violations: readonly InvariantViolation[]): ViolationSummary {
  const byRule: Record<string, number> = {};
  const slides = new Set<number>();
  let errorCount = 0;
  let warnCount = 0;
  for (const v of violations) {
    byRule[v.id] = (byRule[v.id] ?? 0) + 1;
    slides.add(v.unit + 1);
    if (v.severity === 'error') errorCount++; else warnCount++;
  }
  return { errorCount, warnCount, byRule, slides: [...slides].sort((a, b) => a - b) };
}
