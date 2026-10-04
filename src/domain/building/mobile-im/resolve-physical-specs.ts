/**
 * resolve-physical-specs.ts
 *
 * 주차 대수 / 승강기 대수 해석 — 단일 순수 함수 (D4).
 *
 * 우선순위: 건축물대장 값 > 중개인 입력값(바텀시트).
 * - 대장 값이 null/undefined/0/NaN/비정수 → "없음"으로 취급하고 중개인 값으로 보완.
 * - 중개인 값도 유효하지 않으면(비정수/음수/9999 초과/0) undefined → 기존 '-' 표기 유지.
 * - 어떤 경우에도 값을 지어내지 않는다 (Rule 34, Rule 37).
 */

export const BROKER_COUNT_MAX = 9999;

export interface PhysicalSpecCounts {
  parkingCount?: unknown;
  elevatorCount?: unknown;
}

export interface ResolvedPhysicalSpecs {
  parkingCount?: number;
  elevatorCount?: number;
  parkingSource?: 'register' | 'broker';
  elevatorSource?: 'register' | 'broker';
}

/** 입력값을 1~9999 범위 정수로 정규화. 그 외(null/0/음수/소수/NaN/문자열 쓰레기)는 undefined. */
function toPositiveCount(raw: unknown): number | undefined {
  if (raw === null || raw === undefined || raw === '') return undefined;
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.trim()) : NaN;
  if (!Number.isFinite(n) || !Number.isInteger(n)) return undefined;
  if (n <= 0 || n > BROKER_COUNT_MAX) return undefined;
  return n;
}

function pick(
  register: unknown,
  broker: unknown,
): { value?: number; source?: 'register' | 'broker' } {
  const reg = toPositiveCount(register);
  if (reg !== undefined) return { value: reg, source: 'register' };
  const brk = toPositiveCount(broker);
  if (brk !== undefined) return { value: brk, source: 'broker' };
  return {};
}

/**
 * 건축물대장 값을 우선하고, 대장 값이 비어 있을 때만 중개인 입력으로 보완한다.
 */
export function resolvePhysicalSpecs(sources: {
  register?: PhysicalSpecCounts | null;
  broker?: PhysicalSpecCounts | null;
}): ResolvedPhysicalSpecs {
  const p = pick(sources.register?.parkingCount, sources.broker?.parkingCount);
  const e = pick(sources.register?.elevatorCount, sources.broker?.elevatorCount);
  const out: ResolvedPhysicalSpecs = {};
  if (p.value !== undefined) {
    out.parkingCount = p.value;
    out.parkingSource = p.source;
  }
  if (e.value !== undefined) {
    out.elevatorCount = e.value;
    out.elevatorSource = e.source;
  }
  return out;
}

export type BrokerCountParseResult =
  | { ok: true; value: number | undefined }
  | { ok: false; error: string };

/**
 * 서버 측 입력 검증. 빈 값(undefined/null/'')은 ok + undefined,
 * 음수·소수·NaN·9999 초과·비숫자는 ok:false (요청 거부 대상). 0은 허용(저장)되나
 * resolvePhysicalSpecs에서는 '값 없음'으로 취급된다.
 */
export function parseBrokerCount(raw: unknown, label: string): BrokerCountParseResult {
  if (raw === null || raw === undefined) return { ok: true, value: undefined };
  if (typeof raw === 'string' && raw.trim() === '') return { ok: true, value: undefined };
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.trim()) : NaN;
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > BROKER_COUNT_MAX) {
    return { ok: false, error: `${label}은(는) 0~${BROKER_COUNT_MAX} 사이의 정수여야 합니다.` };
  }
  return { ok: true, value: n };
}
