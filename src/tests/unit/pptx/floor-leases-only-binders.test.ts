/**
 * floor_leases 전용 문서 회귀 — 운영 문서는 렌트롤을 body.floor_leases(snake_case · 만원)로만 저장한다.
 * (body.leases / body.rentRoll / ssot_summary 월세·보증금 합계 키 없음)
 * 감사 대상: Pro 챕터 바인더(렌트롤·만기 스케줄·현금흐름), 프리미엄 institutional/commercial 바인더,
 *            개발형 사업수지(feasibility), 대출구조 표, A16 자본구조, 렌트롤 소계(tenantCount).
 * 공통 규칙: 공실·자가사용 행은 임차인/월세/보증금/WALE/NOI 에서 제외(lease-vacancy SSOT), 값이 없으면 '-' (0 단정 금지).
 */
import { describe, it, expect } from 'vitest';
import {
  bindProImChapterData,
  bindInstitutionalTemplateData,
  bindCommercialTemplateData,
  buildDevelopmentFeasibilityProps,
  buildLoanFromIncome,
  buildA16Props,
} from '@/domain/building/mobile-im/pptx/data-binder';
import { calculateTenantRosterSubtotal, type InstitutionalTenantRosterItem } from '@/domain/building/im-core/pro-tenant-roster';

/** 공실(희망 임대료 300만원 기입) · 임대중 2 · 자가사용 1 — 임대중 월세 합 1,200만원 / 보증금 합 12,000만원 */
const floorLeases = () => [
  { floor: 'B1', area_sqm: 100, lease_state: '공실', is_vacant: true, tenant_type: '공실', rent_manwon: 300, deposit_manwon: 3000 },
  { floor: '1F', area_sqm: 200, lease_state: '임대중', is_vacant: false, tenant_name: '스타벅스', tenant_type: '카페', rent_manwon: 700, deposit_manwon: 7000, mgmt_fee_manwon: 50, lease_start: '2024-01-01', lease_end: '2030-12-31' },
  { floor: '2F', area_sqm: 150, lease_state: '임대중', is_vacant: false, tenant_name: '법무법인', tenant_type: '법률서비스', rent_manwon: 500, deposit_manwon: 5000, lease_start: '2023-07-01', lease_end: '2028-06-30' },
  { floor: '3F', area_sqm: 150, lease_state: '자가사용', is_vacant: false, tenant_type: '자가사용', rent_manwon: 0, deposit_manwon: 0 },
];

/** floor_leases 외 렌트롤·합계 키가 전혀 없는 운영 문서 */
const floorLeasesOnlyDoc = (extra: Record<string, any> = {}) => ({
  title: 'floor_leases only',
  body: { investment_posture: 'income', asking_price_manwon: 250000, asOfDate: '2026-01-01', floor_leases: floorLeases(), ...extra },
});

describe('floor_leases-only 문서 — Pro 챕터 바인더', () => {
  const dm = bindProImChapterData(floorLeasesOnlyDoc() as any) as Record<string, any>;

  it('현금흐름 요약: 연 임대료·보증금이 임대중 행 합에서 도출된다 (공실 희망 임대료·자가사용 제외)', () => {
    const cf = dm['cash_flow_snapshot'];
    expect(cf.annualRent).toBe((700 + 500) * 12 * 10000); // 144,000,000원 (공실 B1 300만원 제외)
    expect(cf.totalDeposit).toBe((7000 + 5000) * 10000); // 120,000,000원
    expect(cf.askingPrice).toBe(250000 * 10000);
    expect(cf.capRateAsIs).toBeGreaterThan(0); // V04 폴백 — 0.00% 가 아니다
    expect(dm['dcf_valuation'].annualRent).toBe(cf.annualRent);
    expect(dm['debt_financing'].equityBreakdown.deposit).toBe(cf.totalDeposit);
  });

  it('렌트롤 표: 공실·자가사용은 임차인이 아니다 — 금액·만기·갱신권 없음, 업종은 tenant_type, 호실번호는 지어내지 않는다', () => {
    const rows: string[][] = dm['rentRollPart1'].tableRows;
    const byFloor = (f: string) => rows.find((r) => r[0] === f)!;
    // [층, 호실, 임차인명, 업종, 임대면적, 보증금, 월세, 만기, 갱신]
    expect(byFloor('B1')).toEqual(['B1', '-', '공실', '-', '100.00', '-', '-', '-', '-']);
    expect(byFloor('3F')).toEqual(['3F', '-', '자가사용', '-', '150.00', '-', '-', '-', '-']);
    expect(byFloor('1F')).toEqual(['1F', '-', '스타벅스', '카페', '200.00', '7,000', '700', '2030-12-31', '10년 보호']);
    expect(byFloor('2F')[3]).toBe('법률서비스'); // 기본값 '일반업무' 가 아니다
    // 합계 행: 임차인 수는 임대중 2개사 (행 4개 중 공실·자가사용 제외), 월세 합 1,200 / 보증금 합 12,000
    expect(byFloor('합계')).toEqual(['합계', '-', '2개사', '-', '600.00', '12,000', '1,200', '-', '-']);
    expect(rows.flat().join('|')).not.toMatch(/일반업무|01호/);
  });

  it('만기 스케줄(Part 2): 임대중 행의 실제 만기일로 채워진다 (빈 표 아님, 공실 제외)', () => {
    const p2 = dm['rentRollPart2'];
    expect(p2.tableRows).toEqual([
      ['2028년', '1개사', '150.00', '500', '41.7', '41.7'],
      ['2030년', '1개사', '200.00', '700', '58.3', '100.0'],
      ['합계', '2개사', '350.00', '1,200', '100.0', '-'],
    ]);
  });

  it('만기일이 하나도 없으면 만기 스케줄은 지어내지 않고 빈 표를 유지한다', () => {
    const noEnd = floorLeasesOnlyDoc({ floor_leases: floorLeases().map((l) => ({ ...l, lease_end: undefined })) });
    const out = bindProImChapterData(noEnd as any) as Record<string, any>;
    expect(out['rentRollPart2'].tableRows).toEqual([]);
  });

  it('문서에 합계 키(ssot_summary.monthly_rent_total_krw 등)가 있으면 그 값이 우선한다 (기존 우선순위 유지)', () => {
    const doc = floorLeasesOnlyDoc({ ssot_summary: { monthly_rent_total_krw: 20_000_000, total_deposit_manwon: 30000 } });
    const out = bindProImChapterData(doc as any) as Record<string, any>;
    expect(out['cash_flow_snapshot'].annualRent).toBe(20_000_000 * 12);
    expect(out['cash_flow_snapshot'].totalDeposit).toBe(30000 * 10000);
  });
});

describe('렌트롤 소계 tenantCount — 공실·자가사용 제외 (occupancyType 명시 시)', () => {
  const mk = (over: Partial<InstitutionalTenantRosterItem>): InstitutionalTenantRosterItem => ({
    floor: '1F', unitNumber: '101', tenantName: 'A', industry: '-', leasedAreaM2: 10, leasedAreaPyeong: 3, depositKrw: 0,
    monthlyRentKrw: 0, monthlyMaintenanceKrw: 0, leaseStartDate: '', leaseEndDate: '', statutoryProtection10Y: false, ...over,
  });
  it('occupancyType 가 vacant/owner_occupied 이면 제외, 없으면 기존처럼 전 행', () => {
    expect(calculateTenantRosterSubtotal([mk({}), mk({ occupancyType: 'vacant' }), mk({ occupancyType: 'owner_occupied' })]).tenantCount).toBe(1);
    expect(calculateTenantRosterSubtotal([mk({}), mk({}), mk({ occupancyType: 'leased' })]).tenantCount).toBe(3);
  });
});

describe('floor_leases-only 문서 — Institutional(golden_institutional) 바인더', () => {
  it('Cap Rate 키가 없어도 NOI 를 0 으로 두지 않는다 — 임대중 연 임대료×0.92 에서 도출, 매매가(asking_price_manwon)로 Cap 일치', () => {
    const dm = bindInstitutionalTemplateData(floorLeasesOnlyDoc(), {}) as Record<string, any>;
    const m = dm['summary'].metrics;
    expect(m.askingPrice).toBe('25.0억 원'); // asking_price_manwon(만원) 인식
    expect(m.noi).toBe('1.3억'); // 144,000,000 × 0.92 = 132,480,000
    expect(m.capRate).toBe('5.30%'); // 132,480,000 / 2,500,000,000
    expect(m.waleRent).not.toBe('-');
    expect(dm['rentRoll'].tableRows.length).toBe(4); // 공실·자가사용도 표에는 남는다
  });

  it('임대·만기 데이터가 전혀 없으면 Cap/NOI/WALE/만기도래 를 0 으로 단정하지 않고 "-" 로 둔다', () => {
    const vacantOnly = floorLeasesOnlyDoc({ asking_price_manwon: undefined, floor_leases: [floorLeases()[0]] });
    const m = (bindInstitutionalTemplateData(vacantOnly, {}) as Record<string, any>)['summary'].metrics;
    expect(m.capRate).toBe('-');
    expect(m.noi).toBe('-');
    expect(m.waleRent).toBe('-');
    expect(m.waleArea).toBe('-');
    expect(m.atRisk12m).toBe('-');
  });

  it('빈 레거시 body.leases[] 가 floor_leases 를 가리지 않는다', () => {
    const dm = bindInstitutionalTemplateData(floorLeasesOnlyDoc({ leases: [], rentRoll: { leases: [] } }), {}) as Record<string, any>;
    expect(dm['rentRoll'].tableRows.length).toBe(4);
  });
});

describe('floor_leases-only 문서 — Commercial(commercial_visual) 바인더', () => {
  it('공실 행의 희망 임대료·업종 라벨이 월 임대료 합계/추천 주용도/주요 임차인에 섞이지 않는다', () => {
    const dm = bindCommercialTemplateData(floorLeasesOnlyDoc(), {}) as Record<string, any>;
    const rows: string[][] = dm['plan'].tableRows;
    expect(rows[0]).toEqual(['B1', '공실', '100.00', '- / -', '']);
    expect(rows[3]).toEqual(['3F', '자가사용', '150.00', '- / -', '']);
    const metrics: Array<{ label: string; value: string }> = dm['summary'].metrics;
    const val = (label: string) => metrics.find((x) => x.label === label)?.value;
    expect(val('월 임대료 합계')).toBe('1,200만 원'); // 공실 300만원 제외
    expect(val('추천 주용도')).toBe('카페 / 법률서비스'); // '공실'·'자가사용' 미포함
    expect(val('주요 임차인')).toBe('스타벅스 / 법무법인');
  });
});

describe('floor_leases-only 문서 — 개발형·대출·자본구조 빌더', () => {
  it('개발형 사업수지: 기존 임대 월 총임대수익은 임대중 행만 합산 (공실 희망 임대료 제외)', () => {
    const props = buildDevelopmentFeasibilityProps({ developmentSpec: { totalCostManwon: 1_000_000 }, floor_leases: floorLeases() });
    const stat = props.right.stats.find((s: any) => s.label === '예상 월 총임대수익');
    expect(stat.value).toBe('1,200만원/월');
  });

  it('대출구조 표: 월세 키가 없으면 임대중 렌트롤 합으로 DSCR/자기자본수익률 산출 (DSCR 0.00 아님)', () => {
    const body = { asking_price_manwon: 250000, loan_scenario: { ltv_pct: 50, interest_pct: 4.5, term_years: 5 }, floor_leases: floorLeases() };
    const rows: string[][] = buildLoanFromIncome('', [], body).table1.rows;
    const dscr = rows.find((r) => r[0] === 'DSCR')![1];
    // 연 임대료 14,400만원 ÷ 연 이자 5,628만원(월 469만원×12) = 2.56
    expect(dscr).toBe('2.56');
  });

  it('A16 자본구조: ssot_summary.total_deposit_manwon(운영 키)을 읽고, 없으면 렌트롤 보증금·월세 합 사용', () => {
    const viaSsot = buildA16Props('', [], { asking_price_manwon: 250000, ssot_summary: { total_deposit_manwon: 53700, monthly_rent_total_krw: 51_470_000 } });
    expect(viaSsot.totalDepositBil).toBe('5.4');
    const viaRentRoll = buildA16Props('', [], { asking_price_manwon: 250000, floor_leases: floorLeases() });
    expect(viaRentRoll.totalDepositBil).toBe('1.2'); // 12,000만원 (공실 B1 3,000만원 제외)
    expect(viaRentRoll.grossYieldPct).toBe('5.76'); // 144,000,000 / 2,500,000,000
  });
});
