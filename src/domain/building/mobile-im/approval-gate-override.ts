// src/domain/building/mobile-im/approval-gate-override.ts
// 승인 시점 V12(AREA_UNIT_MISMATCH) 해제 — 순수 도메인 로직 (라우트: im-lite/[id]/approve-override).
//
// 배경: V12 는 렌트롤 업로드 시점에 사유를 적어 해제할 수 있지만, 이미 생성된 문서가 V12 로
//   승인 차단된 경우 재업로드 없이 해제할 방법이 없었다. 이 모듈은 body.gateReport 를 재평가한다.
// 원칙
//  - 해제 가능한 게이트는 V12 뿐이다. V01 등 다른 게이트는 이 경로로 절대 풀리지 않는다 (리포트에 그대로 남는다).
//  - by/at 은 호출자(서버)가 주입한다 — 클라이언트 값은 라우트가 읽지 않는다.
//  - 사유: 필수·비어있지 않음·200자 이하, 제어문자 → 공백, '<' '>' 제거.

import { RENTROLL_GATE_IDS, deriveRentrollGateContext, runPublishGates, type GateContext } from './quality-gates-v02';
import { RENTROLL_META_LIMITS } from './rentroll-meta-parse';

export const APPROVAL_OVERRIDE_CODE = 'AREA_UNIT_MISMATCH' as const;

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F\u2028\u2029]+/g;

export type OverrideReasonResult = { ok: true; reason: string } | { ok: false; error: string };

/** 해제 사유 검증·정규화. 길이 초과는 자르지 않고 거부한다. */
export function sanitizeOverrideReason(raw: unknown): OverrideReasonResult {
  if (typeof raw !== 'string') return { ok: false, error: 'V12 해제 사유를 입력해주세요.' };
  const reason = raw.replace(CONTROL_CHARS, ' ').replace(/[<>]/g, '').replace(/ {2,}/g, ' ').trim();
  if (!reason) return { ok: false, error: 'V12 해제 사유를 입력해주세요.' };
  const max = RENTROLL_META_LIMITS.overrideReasonChars;
  if (reason.length > max) {
    return { ok: false, error: `V12 해제 사유는 ${max}자 이하로 입력해주세요. (현재 ${reason.length}자)` };
  }
  return { ok: true, reason };
}

export type ApplyAreaUnitOverrideResult =
  | { ok: true; body: Record<string, any>; gateReport: Record<string, unknown> }
  | { ok: false; status: number; code: string; error: string };

/** 렌트롤 게이트(V01·V12) 범위 리포트 — handler.ts 의 body.gateReport 와 같은 모양 */
export function buildRentrollGateReport(
  body: Record<string, any>,
  evaluatedAt: string,
): Record<string, unknown> {
  const ctx = deriveRentrollGateContext({ floor_leases: body.floor_leases, rent_roll_meta: body.rent_roll_meta });
  const rep = runPublishGates(ctx as unknown as GateContext, RENTROLL_GATE_IDS);
  return {
    scope: 'rentroll_v15',
    allPassed: rep.allPassed,
    blocked: rep.blocked,
    results: rep.results,
    failedBlocks: rep.failedBlocks,
    failedWarns: rep.failedWarns,
    evaluatedAt,
  };
}

/**
 * 문서 body 에 V12 해제를 적용하고 게이트 리포트를 재평가한다 (입력 body 는 변경하지 않는다).
 * V12 가 실제로 차단 중(면적 비율 이상)이 아니면 409 — 해제할 대상이 없다.
 */
export function applyAreaUnitOverride(
  body: Record<string, any>,
  opts: { reason: string; userId: string; now?: Date },
): ApplyAreaUnitOverrideResult {
  const at = (opts.now ?? new Date()).toISOString();
  const before = deriveRentrollGateContext({ floor_leases: body.floor_leases, rent_roll_meta: body.rent_roll_meta });
  if (before.areaUnitMismatch !== true) {
    return {
      ok: false,
      status: 409,
      code: 'V12_NOT_BLOCKING',
      error: '이 문서는 렌트롤 면적 단위 혼동(V12)으로 차단되어 있지 않아 해제할 수 없습니다.',
    };
  }

  const rentRollMeta = { ...(body.rent_roll_meta ?? {}), area_unit_override: { reason: opts.reason, by: opts.userId, at } };
  const next: Record<string, any> = {
    ...body,
    rent_roll_meta: rentRollMeta,
    override_log: [
      ...(Array.isArray(body.override_log) ? body.override_log : []),
      { code: APPROVAL_OVERRIDE_CODE, reason: opts.reason, by: opts.userId, at, stage: 'approval' },
    ],
  };

  // 저장된 서버 재계산 V12 도 해제 상태로 맞춘다 (PPTX·뷰어가 같은 사실을 보도록)
  const v12 = body.rentroll_checks?.V12;
  if (v12 && typeof v12 === 'object' && v12.level === 'block') {
    next.rentroll_checks = {
      ...body.rentroll_checks,
      V12: { ...v12, level: 'warn', overridden: true, message: `${v12.message} — 사유 입력으로 해제: ${opts.reason}` },
    };
  }

  const gateReport = buildRentrollGateReport(next, at);
  next.gateReport = gateReport;
  return { ok: true, body: next, gateReport };
}
