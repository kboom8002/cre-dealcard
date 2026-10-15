/**
 * @file posture-rentroll-v15-remediation.test.ts
 * @description 타 포스처(사옥·개발·매매·운영) 렌트롤 v1.5 의미 충돌 교정 회귀 테스트 (P1~P4 & P6).
 *
 * - P1 (D-DEV-1 / D-DEV-2): 개발형(development)에서 현황 floor_leases(철거·명도 대상)가 신축 후 보유수익(devHoldMonthlyRentManwon)이나
 *   사업수지 슬라이드(buildDevelopmentFeasibilityProps / buildDevelopmentProFormaProps), 계획 층 구성(buildDevelopmentScaleProps)에 섞이지 않는다.
 *   신축 후 보유수익은 오직 developmentSpec.stackingPlan(또는 holdMonthlyRentManwon)에서만 산출한다.
 * - P2 (Rule 76): sumLeasedRentRoll 백필은 공실(희망 임대료)·자가사용·비임대 행을 제외하고 임대중 행만 합산한다.
 * - P3 (D-DEV-3 / softForPostures): V01 게이트는 income·owner_occupied 에서 발행 차단(block)하되,
 *   development 포스처에서는 비차단 경고(warn, blocked: false)로 완화한다. V12 는 development 에서도 차단 유지(해제 사유 시 통과).
 * - P4: resolveLeaseOccupancy 는 양수 월세 또는 미래 사옥 전환 문구('본사 입주 예정', '명도 후 사옥', '사옥 사용 가능', '전환 예정')가 있는 행을
 *   '임대중'으로 분류하고, lease_state='자가사용' 또는 월세 0 + '자가사용'/'사옥'/'본사'/'직영'은 '자가사용'을 유지한다.
 * - P6: checkDataAbsence 는 operating(호텔/운영형) 포스처에서 floor_leases 미기입을 결측(rent_roll)으로 경고하지 않는다.
 */

import { describe, it, expect } from 'vitest';
import {
  resolveLeaseOccupancy,
  sumLeasedRentRoll,
  resolveDevHoldMonthlyRentManwon,
} from '@/domain/building/mobile-im/lease-vacancy';
import { calculateFinancials } from '@/domain/building/mobile-im/financials';
import {
  buildDevelopmentScaleProps,
  buildDevelopmentFeasibilityProps,
  buildDevelopmentProFormaProps,
} from '@/domain/building/mobile-im/pptx/binder/posture-builders';
import {
  RENTROLL_GATE_IDS,
  deriveRentrollGateContext,
  runPublishGates,
  type GateContext,
} from '@/domain/building/mobile-im/quality-gates-v02';
import { checkDataAbsence } from '@/domain/building/mobile-im/data-absence';

const existingEvictionFloorLeases = () => [
  { floor: 'B1', area_sqm: 120, lease_state: '공실', is_vacant: true, tenant_type: '공실', rent_manwon: 250, deposit_manwon: 2000 },
  { floor: '1F', area_sqm: 200, lease_state: '임대중', is_vacant: false, tenant_name: '편의점', tenant_type: '소매', rent_manwon: 600, deposit_manwon: 5000 },
  { floor: '2F', area_sqm: 200, lease_state: '임대중', is_vacant: false, tenant_name: '식당', tenant_type: '음식점', rent_manwon: 400, deposit_manwon: 4000 },
  { floor: '3F', area_sqm: 150, lease_state: '자가사용', is_vacant: false, tenant_type: '자가사용', rent_manwon: 0, deposit_manwon: 0 },
];

describe('P1: 개발형(development) 보유수익·규모 격리 (D-DEV-1 & D-DEV-2)', () => {
  it('D-DEV-1: 현황 floor_leases(명도 대상)가 있어도 developmentSpec.stackingPlan 이 없으면 devHoldMonthlyRentManwon·보유수익률로 산출하지 않는다', () => {
    const devSpecWithoutStacking = {
      totalCostManwon: 1_500_000,
      targetScalePyung: 600,
      constructionCostPerPyeong: 900,
    };
    expect(resolveDevHoldMonthlyRentManwon(devSpecWithoutStacking)).toBeUndefined();

    const fin = calculateFinancials({
      posture: 'development',
      purchasePriceKrw: 10_000_000_000,
      platAreaSqm: 500,
      targetGrossAreaPyeong: 600,
      constructionCostPerPyeong: 900,
      developmentSpec: devSpecWithoutStacking,
      floor_leases: existingEvictionFloorLeases(),
    } as any);
    expect(fin.devHoldYieldPct).toBeNull();
    expect(fin.devProfitMarginPct).toBeNull();

    const proForma = buildDevelopmentProFormaProps({
      developmentSpec: devSpecWithoutStacking,
      floor_leases: existingEvictionFloorLeases(),
    });
    const labels = proForma.right.stats.map((s: any) => s.label);
    expect(labels).not.toContain('예상 월 총임대수익');
    expect(labels).not.toContain('예상 연 총임대수익');
    expect(proForma.right.callouts[0].body).not.toMatch(/신축 후.*임대 운용 시 월/);
  });

  it('D-DEV-1: developmentSpec.stackingPlan 에 신축 후 층별 임대계획이 있을 때만 보유수익·보유형 연 순수익률을 산출한다', () => {
    const devSpecWithStacking = {
      totalCostManwon: 1_500_000, // 150억
      targetScalePyung: 600,
      constructionCostPerPyeong: 900,
      stackingPlan: [
        { floor: '1F', use: '근생', rent_manwon: 900, deposit_manwon: 10000 },
        { floor: '2F', use: '오피스', rent_manwon: 600, deposit_manwon: 6000 },
      ],
    };
    expect(resolveDevHoldMonthlyRentManwon(devSpecWithStacking)).toBe(1500);

    const fin = calculateFinancials({
      posture: 'development',
      purchasePriceKrw: 9_000_000_000,
      platAreaSqm: 500,
      targetGrossAreaPyeong: 600,
      constructionCostPerPyeong: 900,
      developmentSpec: devSpecWithStacking,
      floor_leases: existingEvictionFloorLeases(), // 현황 1,000만원은 무시되고 신축 1,500만원만 반영
    } as any);
    expect(fin.devHoldYieldPct).toBeGreaterThan(0);

    const proForma = buildDevelopmentFeasibilityProps({
      developmentSpec: devSpecWithStacking,
      floor_leases: existingEvictionFloorLeases(),
    });
    const monthlyStat = proForma.right.stats.find((s: any) => s.label === '예상 월 총임대수익');
    expect(monthlyStat?.value).toBe('1,500만원/월');
    expect(proForma.right.callouts[0].body).toContain('신축 후 2개 층 임대 운용 시 월 1,500만원 수익 예상');
  });

  it('D-DEV-2: buildDevelopmentScaleProps 의 "계획 층 구성"은 devSpec.newBuildFloors(없으면 ssot.floors)를 쓰며 현황 floor_leases 층 범위를 쓰지 않는다', () => {
    const withNewBuild = buildDevelopmentScaleProps({
      developmentSpec: { targetScalePyung: 500, newBuildFloors: 'B2~8F' },
      floor_leases: existingEvictionFloorLeases(),
    });
    const floorStat1 = withNewBuild.right.stats.find((s: any) => s.label === '계획 층 구성');
    expect(floorStat1?.value).toBe('B2~8F');

    const withoutNewBuild = buildDevelopmentScaleProps({
      developmentSpec: { targetScalePyung: 500 },
      floor_leases: existingEvictionFloorLeases(),
    });
    const floorStat2 = withoutNewBuild.right.stats.find((s: any) => s.label === '계획 층 구성');
    expect(floorStat2?.value).toBe('설계안 검토 중');
  });
});

describe('P2: sumLeasedRentRoll 백필 통일 (Rule 76)', () => {
  it('공실(희망 임대료)·자가사용·비임대(기계실) 행을 제외하고 실제 임대중 행만 합산한다', () => {
    const rows = [
      ...existingEvictionFloorLeases(),
      { floor: 'B2', tenant_name: '기계실', rent_manwon: 0, deposit_manwon: 0 },
    ];
    const sum = sumLeasedRentRoll(rows);
    expect(sum.rentManwon).toBe(1000); // 1F(600) + 2F(400); B1 공실(250) 제외
    expect(sum.monthlyRentManwon).toBe(1000);
    expect(sum.depositManwon).toBe(9000);
    expect(sum.count).toBe(2);
  });
});

describe('P3: 포스처 인식 발행 게이트 (D-DEV-3 / softForPostures)', () => {
  const brokenAmountRows = [
    { floor: '1F', area_sqm: 100, lease_state: '임대중', tenant_name: '임차인A', rent_manwon: undefined, deposit_manwon: 3000 },
  ];

  it('V01: income 및 owner_occupied 포스처에서는 월세 누락 시 발행 차단(blocked: true)', () => {
    for (const posture of ['income', 'owner_occupied']) {
      const gCtx = deriveRentrollGateContext({ floor_leases: brokenAmountRows }, posture);
      expect(gCtx.posture).toBe(posture);
      expect(gCtx.rentrollAmountIssues).toBe(1);
      const rep = runPublishGates(gCtx as unknown as GateContext, RENTROLL_GATE_IDS);
      expect(rep.blocked).toBe(true);
      expect(rep.failedBlocks.map((g) => g.id)).toEqual(['V01']);
    }
  });

  it('V01: development 포스처에서는 명도 대상 기존 임차인의 월세 누락을 경고(warn)로 완화하여 발행 차단하지 않는다(blocked: false)', () => {
    const gCtx = deriveRentrollGateContext({ floor_leases: brokenAmountRows }, 'development');
    expect(gCtx.posture).toBe('development');
    expect(gCtx.rentrollAmountIssues).toBe(1);

    const rep = runPublishGates(gCtx as unknown as GateContext, RENTROLL_GATE_IDS);
    expect(rep.blocked).toBe(false);
    expect(rep.failedBlocks).toEqual([]);
    expect(rep.failedWarns.map((g) => g.id)).toEqual(['V01']);
    expect(rep.classifiedFailures.find((f) => f.gateId === 'V01')?.category).toBe('quality_warn');
  });

  it('V12: development 포스처에서도 면적 단위 혼동(AREA_UNIT_MISMATCH)은 차단(blocked: true)하며 해제 사유가 있으면 통과한다', () => {
    const mismatchRows = [
      { floor: '1F', area_sqm: 1200, lease_state: '임대중', tenant_name: '임차인A', rent_manwon: 300, deposit_manwon: 3000 },
    ];
    const gCtxBlocked = deriveRentrollGateContext(
      { floor_leases: mismatchRows, rent_roll_meta: { gfa_sqm: 400 } },
      'development',
    );
    const repBlocked = runPublishGates(gCtxBlocked as unknown as GateContext, RENTROLL_GATE_IDS);
    expect(repBlocked.blocked).toBe(true);
    expect(repBlocked.failedBlocks.map((g) => g.id)).toEqual(['V12']);

    const gCtxOverridden = deriveRentrollGateContext(
      {
        floor_leases: mismatchRows,
        rent_roll_meta: {
          gfa_sqm: 400,
          area_unit_override: { reason: '구분상가 외 별도 부속건물 합산', by: 'broker-1', at: '2026-10-15T00:00:00.000Z' },
        },
      },
      'development',
    );
    const repOverridden = runPublishGates(gCtxOverridden as unknown as GateContext, RENTROLL_GATE_IDS);
    expect(repOverridden.blocked).toBe(false);
    expect(repOverridden.results.find((g) => g.id === 'V12')?.note).toContain('구분상가 외 별도 부속건물 합산');
  });
});

describe('P4: 사옥 전환 문맥의 OWNER_USE_RE 오분류 방지', () => {
  it('양수 월세 또는 미래 사옥 전환 문구("본사 입주 예정", "명도 후 사옥", "사옥 사용 가능", "전환 예정")가 있는 행은 "임대중"으로 분류한다', () => {
    expect(resolveLeaseOccupancy({ floor: '2F', tenant_name: 'A사', note: '본사 입주 예정', rent_manwon: 300 })).toBe('임대중');
    expect(resolveLeaseOccupancy({ floor: '3F', tenant: '본사 입주 예정', rent_manwon: 300 })).toBe('임대중');
    expect(resolveLeaseOccupancy({ floor: '4F', tenant_name: 'B사', note: '명도 후 사옥 사용 가능', rent_manwon: 0, deposit_manwon: 5000 })).toBe('임대중');
    expect(resolveLeaseOccupancy({ floor: '5F', tenant_name: 'C사', note: '사옥 전환 예정', rent_manwon: 0, deposit_manwon: 3000 })).toBe('임대중');
  });

  it('실제 자가사용(lease_state="자가사용" 또는 월세 0 + 자가사용/사옥/본사/직영)은 그대로 "자가사용"으로 분류한다', () => {
    expect(resolveLeaseOccupancy({ floor: '3F', lease_state: '자가사용', rent_manwon: 0 })).toBe('자가사용');
    expect(resolveLeaseOccupancy({ floor: '4F', tenant_type: '자가사용', rent_manwon: 0 })).toBe('자가사용');
    expect(resolveLeaseOccupancy({ floor: '5F', tenant_type: '사옥', rent_manwon: 0 })).toBe('자가사용');
    expect(resolveLeaseOccupancy({ floor: '6F', note: '소유자 직영', rent_manwon: 0 })).toBe('자가사용');
  });
});

describe('P6: 운영형(operating) 포스처 floor_leases 결측 경고 면제', () => {
  it('operating 포스처에서 floor_leases 가 비어 있어도 rent_roll 결측 경고를 발생시키지 않는다', () => {
    const resOperating = checkDataAbsence({ asking_price_manwon: 500_000, floor_leases: [] }, 'operating');
    expect(resOperating.missingFields.map((f) => f.fieldKey)).not.toContain('rent_roll');

    const resIncome = checkDataAbsence({ asking_price_manwon: 500_000, floor_leases: [] }, 'income');
    expect(resIncome.missingFields.map((f) => f.fieldKey)).toContain('rent_roll');
  });
});
