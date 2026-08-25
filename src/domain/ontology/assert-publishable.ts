/**
 * @file assert-publishable.ts
 * @description D29 BL-9: 포스처 계약 13칸 충족 검증 (G30)
 * 정본: ONTOLOGY_V0.5_SPEC §3 · §3.2 — 계약 미충족 시 G30 발행 차단
 */
import { POSTURE_CONTRACTS, type PostureContract } from './posture-contract';

export class PublishGateFailure extends Error {
  constructor(
    public readonly gateCode: string,
    message: string,
  ) {
    super(`[${gateCode}] ${message}`);
    this.name = 'PublishGateFailure';
  }
}

/**
 * 발행 직전 포스처 계약 13칸 충족 여부를 검증합니다.
 * 미충족 시 PublishGateFailure를 throw합니다.
 */
export function assertPublishable(posture: string): void {
  const contract = POSTURE_CONTRACTS[posture as keyof typeof POSTURE_CONTRACTS] as PostureContract | undefined;

  if (!contract) {
    throw new PublishGateFailure('G30', `미정의 포스처: ${posture}`);
  }

  if (contract.status !== 'commercial') {
    throw new PublishGateFailure('G30', `포스처 '${posture}' 상태: ${contract.status} — commercial만 발행 가능`);
  }

  // 계약 최소 아키타입 3종
  if (!contract.archetypes || contract.archetypes.length < 3) {
    throw new PublishGateFailure(
      'G30',
      `포스처 '${posture}' 아키타입 ${contract.archetypes?.length ?? 0}종 < 최소 3종`,
    );
  }

  // 13칸 필수 필드 검증
  const requiredFields: (keyof PostureContract)[] = [
    'posture', 'archetypes', 'sections', 'requiredSlots',
    'valueMetric', 'yieldBasis', 'lAxisSlots', 'minResolution',
  ];

  for (const field of requiredFields) {
    const value = contract[field];
    if (value === undefined || value === null) {
      throw new PublishGateFailure('G30', `계약 필드 '${field}' 미정의`);
    }
    if (Array.isArray(value) && value.length === 0) {
      throw new PublishGateFailure('G30', `계약 필드 '${field}' 빈 배열`);
    }
  }
}

// D29 M-3: 해상도 서열 (높을수록 상세)
const R_ORDER: Record<string, number> = { R0: 0, R1: 1, R2: 2, R3: 3 };
const P_ORDER: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

/**
 * D29 M-3: 달성 해상도가 포스처 계약의 minResolution을 충족하는지 검증.
 * 개발형은 P≥P3 필수, 명도책임 있으면 R≥R3 조건부 상향.
 */
export function checkMinResolution(
  posture: string,
  achievedL: string,
  achievedP: string,
  opts?: { hasEvictionLiability?: boolean },
): { passed: boolean; reason?: string } {
  const contract = POSTURE_CONTRACTS[posture as keyof typeof POSTURE_CONTRACTS];
  if (!contract) return { passed: false, reason: `미정의 포스처: ${posture}` };

  const minL = contract.minResolution.L;
  const minP = contract.minResolution.P;

  // P축 검증
  if ((P_ORDER[achievedP] ?? 0) < (P_ORDER[minP] ?? 0)) {
    return { passed: false, reason: `P축 해상도 ${achievedP} < 최소 ${minP} (포스처: ${posture})` };
  }

  // L축 검증 — 기본
  let effectiveMinL = minL;
  // 개발형 + 명도책임: R1 → R3 조건부 상향 (§6.4)
  if (posture === 'development' && opts?.hasEvictionLiability) {
    effectiveMinL = 'R3';
  }

  if ((R_ORDER[achievedL] ?? 0) < (R_ORDER[effectiveMinL] ?? 0)) {
    return {
      passed: false,
      reason: `L축 해상도 ${achievedL} < 최소 ${effectiveMinL}` +
        (opts?.hasEvictionLiability ? ' (명도책임 조건부 R3)' : '') +
        ` (포스처: ${posture})`,
    };
  }

  return { passed: true };
}

/**
 * assertPublishable의 non-throwing 버전.
 * 검증 결과를 반환합니다.
 */
export function checkPublishable(posture: string): {
  publishable: boolean;
  gateCode: string;
  message?: string;
} {
  try {
    assertPublishable(posture);
    return { publishable: true, gateCode: 'G30' };
  } catch (e) {
    if (e instanceof PublishGateFailure) {
      return { publishable: false, gateCode: e.gateCode, message: e.message };
    }
    return { publishable: false, gateCode: 'G30', message: String(e) };
  }
}
