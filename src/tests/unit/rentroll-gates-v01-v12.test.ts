/**
 * 렌트롤 v1.5 P2 — V01/V12 게이트 + deriveRentrollGateContext
 * 정책: 생성은 막지 않는다. 승인·발행만 body.gateReport.blocked 로 차단 (V02/V03/V06~V10 은 비차단 경고).
 */
import { describe, it, expect } from 'vitest';
import {
  PUBLISH_GATES,
  RENTROLL_GATE_IDS,
  runPublishGates,
  deriveRentrollGateContext,
  type GateContext,
} from '@/domain/building/mobile-im/quality-gates-v02';

const ctx = (over: Record<string, unknown> = {}) => over as unknown as GateContext;
const only = (c: GateContext) => runPublishGates(c, RENTROLL_GATE_IDS);

describe('렌트롤 게이트 V01 / V12', () => {
  it('PUBLISH_GATES 에 V01·V12 만 렌트롤 차단 게이트로 등록 (V02/V03/V06~V10 은 게이트 아님)', () => {
    const ids = PUBLISH_GATES.map((g) => g.id);
    expect(ids).toContain('V01');
    expect(ids).toContain('V12');
    for (const id of ['V02', 'V03', 'V04', 'V05', 'V06', 'V07', 'V08', 'V09', 'V10', 'V11', 'V13']) {
      expect(ids).not.toContain(id);
    }
    expect(PUBLISH_GATES.filter((g) => RENTROLL_GATE_IDS.includes(g.id)).every((g) => g.severity === 'block')).toBe(true);
  });

  it('입력이 없으면(렌트롤 없음) 통과', () => {
    const r = only(ctx());
    expect(r.blocked).toBe(false);
    expect(r.results.map((g) => g.id).sort()).toEqual(['V01', 'V12']);
  });

  it('V01: 월세 누락·금액 중복 건수 > 0 이면 차단', () => {
    const r = only(ctx({ rentrollAmountIssues: 2 }));
    expect(r.blocked).toBe(true);
    expect(r.failedBlocks.map((g) => g.id)).toEqual(['V01']);
  });

  it('V12: 면적 단위 혼동은 차단, 사유가 있으면 해제되고 사유가 리포트에 남는다', () => {
    const blocked = only(ctx({ areaUnitMismatch: true }));
    expect(blocked.blocked).toBe(true);
    expect(blocked.failedBlocks.map((g) => g.id)).toEqual(['V12']);

    const empty = only(ctx({ areaUnitMismatch: true, areaUnitOverride: { reason: '   ' } }));
    expect(empty.blocked).toBe(true);

    const released = only(ctx({
      areaUnitMismatch: true,
      areaUnitOverride: { reason: '일부 층만 매각', by: 'user-1', at: '2026-10-10T00:00:00.000Z' },
    }));
    expect(released.blocked).toBe(false);
    const v12 = released.results.find((g) => g.id === 'V12')!;
    expect(v12.passed).toBe(true);
    expect(v12.note).toContain('일부 층만 매각');
    expect(v12.note).toContain('user-1');
  });

  it('V12 해제가 있어도 V01 이 걸리면 여전히 차단', () => {
    const r = only(ctx({
      rentrollAmountIssues: 1,
      areaUnitMismatch: true,
      areaUnitOverride: { reason: '사유' },
    }));
    expect(r.failedBlocks.map((g) => g.id)).toEqual(['V01']);
  });

  it('onlyIds 범위 한정 — 다른 게이트(G계열)는 평가하지 않는다', () => {
    const r = only(ctx());
    expect(r.results.every((g) => RENTROLL_GATE_IDS.includes(g.id))).toBe(true);
  });
});

describe('deriveRentrollGateContext', () => {
  const live = (over: Record<string, unknown> = {}) => ({ floor: '1F', area_sqm: 100, rent_manwon: 300, deposit_manwon: 3000, mgmt_fee_manwon: 30, ...over });

  it('행이 없거나 supplemental 이 비어 있으면 {}', () => {
    expect(deriveRentrollGateContext(undefined)).toEqual({});
    expect(deriveRentrollGateContext({})).toEqual({});
    expect(deriveRentrollGateContext({ floor_leases: [] })).toEqual({});
  });

  it('정상 렌트롤: 금액 이슈 0, 면적 정상', () => {
    const d = deriveRentrollGateContext({
      floor_leases: [live(), live({ floor: '2F', area_sqm: 100 })],
      rent_roll_meta: { gfa_sqm: 300 },
    });
    expect(d.rentrollAmountIssues).toBe(0);
    expect(d.areaUnitMismatch).toBe(false);
    expect(only(ctx(d as Record<string, unknown>)).blocked).toBe(false);
  });

  it('임대중인데 월세 누락 → V01 차단', () => {
    const d = deriveRentrollGateContext({ floor_leases: [live({ rent_manwon: undefined })] });
    expect(d.rentrollAmountIssues).toBe(1);
    expect(only(ctx(d as Record<string, unknown>)).blocked).toBe(true);
  });

  it('통합계약 대표 행 금액 중복 → V01 차단', () => {
    const d = deriveRentrollGateContext({
      floor_leases: [live({ contract_group: 'G1' }), live({ floor: '2F', contract_group: 'G1' })],
    });
    expect(d.rentrollAmountIssues).toBeGreaterThan(0);
  });

  it('통합계약: 대표 행에만 금액이 있으면 통과', () => {
    const d = deriveRentrollGateContext({
      floor_leases: [
        live({ contract_group: 'G1' }),
        live({ floor: '2F', contract_group: 'G1', rent_manwon: undefined, deposit_manwon: undefined, mgmt_fee_manwon: undefined }),
      ],
    });
    expect(d.rentrollAmountIssues).toBe(0);
  });

  it('공실·자가사용 행은 월세가 없어도 V01 대상 아님', () => {
    const d = deriveRentrollGateContext({
      floor_leases: [live(), live({ floor: '2F', rent_manwon: undefined, lease_state: '공실' }), live({ floor: '3F', rent_manwon: undefined, lease_state: '자가사용' })],
    });
    expect(d.rentrollAmountIssues).toBe(0);
  });

  it('매출연동(revenue_linked) 행은 고정 월세가 없어도 차단하지 않는다', () => {
    const d = deriveRentrollGateContext({
      floor_leases: [live({ rent_type: 'revenue_linked', rent_manwon: undefined })],
    });
    expect(d.rentrollAmountIssues).toBe(0);
  });

  it('V12: 임대면적 합 ÷ J4 > 2 (평/㎡ 혼동) → 차단, 해제 사유 있으면 통과', () => {
    const rows = [live({ area_sqm: 1000 }), live({ floor: '2F', area_sqm: 1000 })];
    const d = deriveRentrollGateContext({ floor_leases: rows, rent_roll_meta: { gfa_sqm: 500 } });
    expect(d.areaUnitMismatch).toBe(true);
    expect(only(ctx(d as Record<string, unknown>)).blocked).toBe(true);

    const d2 = deriveRentrollGateContext({
      floor_leases: rows,
      rent_roll_meta: { gfa_sqm: 500, area_unit_override: { reason: '구분소유 일부 매각', by: 'u', at: '2026-10-10T00:00:00.000Z' } },
    });
    expect(d2.areaUnitMismatch).toBe(true);
    expect(only(ctx(d2 as Record<string, unknown>)).blocked).toBe(false);
  });

  it('V12: J4 가 없으면 판정 보류 — 차단하지 않는다', () => {
    const d = deriveRentrollGateContext({ floor_leases: [live({ area_sqm: 99999 })] });
    expect(d.areaUnitMismatch).toBe(false);
  });
});

// 비임대 행(기계실·주차장)·상태 미기재 행은 V01 '월세 누락' 판정 대상이 아니다 (computeRentrollChecks V01 과 동일 기준)
describe('V01 게이트 — 비임대 행 제외', () => {
  it('기계실·주차장 행은 월세 누락으로 세지 않고, 실제 임대중 행의 누락만 센다', () => {
    const rows: any[] = [
      { floor: 'B1', tenant_name: '기계실' },
      { floor: '2F', tenant_name: '주차장' },
      { floor: '3F', tenant_name: '소매점', lease_state: '임대중', rent_manwon: 460 },
    ];
    expect(deriveRentrollGateContext({ floor_leases: rows }).rentrollAmountIssues).toBe(0);
    rows.push({ floor: '4F', tenant_name: '사무소', lease_state: '임대중' });
    expect(deriveRentrollGateContext({ floor_leases: rows }).rentrollAmountIssues).toBe(1);
  });
});
