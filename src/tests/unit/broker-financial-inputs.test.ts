/**
 * Rule 34 — 가정 기본값(GOP 35% / 시장임대료 7만원/평) 제거 + 중개인 제시값(구조화·원문 메모) → 재무 입력 연결.
 */
import { describe, it, expect } from 'vitest';
import { calculateFinancials, formatFinancialsMarkdown } from '@/domain/building/mobile-im/financials';
import { calculateFinancials as calculateImCoreFinancials } from '@/domain/building/im-core/financial-calculator';
import { brokerFinancialExtras, supplementBrokerMemoFacts } from '@/domain/building/mobile-im/broker-financial-inputs';

const HOTEL_MEMO = '총 객실 94실, ADR 95,000원, OCC 78%, GOP 마진 38%, 운영: 호텔로컬 위탁운영 (2030년 만료)';
const OWNER_MEMO = '사옥 매입 검토. 연간 임대료 절감 7.5억, 손익분기 4.2년';
const DEV_MEMO = '토지평당 1.2억, 허가 용적률 800%, 신축 가능 연면적 1,500평';

describe('operating — GOP 마진 가정(35%) 제거', () => {
  const base: any = { posture: 'operating', purchasePriceKrw: 30_000_000_000, annualRevenueKrw: 3_000_000_000 };
  for (const [name, fn] of [['mobile-im', calculateFinancials], ['im-core', calculateImCoreFinancials]] as const) {
    it(`${name}: 마진 미입력 → GOP·마진·GOP Cap Rate 모두 null`, () => {
      const r: any = (fn as any)(base);
      expect(r.gopMarginPct).toBeNull();
      expect(r.annualGopBil).toBeNull();
      expect(r.gopCapRatePct).toBeNull();
    });
    it(`${name}: 중개인 38% 입력 → 38% 그대로 (35 로 대체되지 않음)`, () => {
      const r: any = (fn as any)({ ...base, gopMarginPct: 38 });
      expect(r.gopMarginPct).toBe(38);
      expect(r.annualGopBil).toBe(11.4);
    });
    it(`${name}: 중개인 RevPAR 가 ADR×OCC 파생보다 우선`, () => {
      const r: any = (fn as any)({ ...base, adrKrw: 95_000, occPct: 78, revparKrw: 74_000 });
      expect(r.revparKrw).toBe(74_000);
    });
  }
  it('GOP 값(gopKrw)만 있으면 마진은 매출 대비로 역산', () => {
    const r: any = calculateFinancials({ ...base, gopKrw: 1_140_000_000 });
    expect(r.gopMarginPct).toBe(38);
  });
  it('마크다운에 null% 가 노출되지 않는다', () => {
    const md = formatFinancialsMarkdown(calculateFinancials({ ...base, gopKrw: 1_140_000_000 }) as any);
    expect(md).not.toContain('null');
  });
});

describe('owner_occupied — 시장임대료 가정(7만원/평) 제거', () => {
  const base: any = { posture: 'owner_occupied', purchasePriceKrw: 12_000_000_000, totalAreaSqm: 1000, loanAmountManwon: 720_000 };
  for (const [name, fn] of [['mobile-im', calculateFinancials], ['im-core', calculateImCoreFinancials]] as const) {
    it(`${name}: 임차료·시장임대료 모두 미입력 → 절감액·손익분기 null`, () => {
      const r: any = (fn as any)(base);
      expect(r.ownVsLeaseSavingsBil).toBeNull();
      expect(r.breakevenYears).toBeNull();
    });
    it(`${name}: 중개인 절감 7.5억 / 손익분기 4.2년 → 그 값 그대로`, () => {
      const r: any = (fn as any)({ ...base, brokerAnnualSavingsBil: 7.5, brokerBreakevenYears: 4.2 });
      expect(r.ownVsLeaseSavingsBil).toBe(7.5);
      expect(r.breakevenYears).toBe(4.2);
    });
    it(`${name}: 절감액만 제시하면 손익분기는 자기자본/절감액으로 파생`, () => {
      const r: any = (fn as any)({ ...base, brokerAnnualSavingsBil: 4.8 });
      expect(r.ownVsLeaseSavingsBil).toBe(4.8);
      expect(r.breakevenYears).toBeCloseTo(10, 1); // 자기자본 48억 / 4.8억
    });
  }
  it('현 임차료 입력 시 기존 계산 유지 (PF2-05b)', () => {
    const r: any = calculateFinancials({ ...base, currentRentManwon: 3800, monthlyRentKrw: 4_000_000 });
    expect(r.ownVsLeaseSavingsBil).toBe(1.8);
  });
});

describe('development — 중개인 토지평당가 우선', () => {
  it('brokerLandPricePerPyeongManwon 이 매매가 역산값보다 우선', () => {
    const r: any = calculateFinancials({ posture: 'development', purchasePriceKrw: 10_000_000_000, platAreaSqm: 500, brokerLandPricePerPyeongManwon: 12000 } as any);
    expect(r.landPricePerPyeong).toBe(12000);
  });
});

describe('supplementBrokerMemoFacts / brokerFinancialExtras', () => {
  it('operating: 원문 메모 → hotel_operating 보충 → 재무 입력', () => {
    const sup: any = {};
    const filled = supplementBrokerMemoFacts(sup, HOTEL_MEMO, 'operating');
    expect(filled.length).toBeGreaterThan(0);
    expect(sup.hotel_operating.gop_margin_pct).toBe(38);
    expect(sup.hotel_operating.adr_krw).toBe(95_000);
    const ex = brokerFinancialExtras(sup, 'operating');
    expect(ex.gopMarginPct).toBe(38);
    expect(ex.adrKrw).toBe(95_000);
    expect(ex.occPct).toBe(78);
    expect(ex.revparKrw).toBe(74_100);
  });
  it('구조화 입력이 우선, 메모는 빈 값만 보충', () => {
    const sup: any = { hotel_operating: { gop_margin_pct: 40 } };
    supplementBrokerMemoFacts(sup, HOTEL_MEMO, 'operating');
    expect(sup.hotel_operating.gop_margin_pct).toBe(40);
    expect(sup.hotel_operating.adr_krw).toBe(95_000);
  });
  it('owner_occupied: 절감/손익분기 보충', () => {
    const sup: any = {};
    supplementBrokerMemoFacts(sup, OWNER_MEMO, 'owner_occupied');
    const ex = brokerFinancialExtras(sup, 'owner_occupied');
    expect(ex.brokerAnnualSavingsBil).toBe(7.5);
    expect(ex.brokerBreakevenYears).toBe(4.2);
  });
  it('development: 토지평당가·허가용적률 보충 (구조화 targetScale 있으면 유지)', () => {
    const sup: any = { developmentSpec: { targetScalePyung: 900 } };
    supplementBrokerMemoFacts(sup, DEV_MEMO, 'development');
    expect(sup.developmentSpec.targetScalePyung).toBe(900);
    expect(sup.developmentSpec.landPricePerPyeongManwon).toBe(12000);
    expect(sup.developmentSpec.maxFarPct).toBe(800);
    expect(brokerFinancialExtras(sup, 'development').brokerLandPricePerPyeongManwon).toBe(12000);
  });
  it('메모에 값이 없으면 아무것도 만들지 않는다', () => {
    const sup: any = {};
    expect(supplementBrokerMemoFacts(sup, '당산동 근생빌딩 매각', 'operating')).toEqual([]);
    expect(supplementBrokerMemoFacts(sup, '', 'owner_occupied')).toEqual([]);
    expect(brokerFinancialExtras(sup, 'operating')).toEqual({});
  });
  it('다른 포스처 입력은 섞지 않는다 (income)', () => {
    const sup: any = {};
    supplementBrokerMemoFacts(sup, HOTEL_MEMO, 'income');
    expect(sup.hotel_operating).toBeUndefined();
  });
});
