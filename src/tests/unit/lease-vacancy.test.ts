/**
 * oracle income-dangsan-r3: 자가사용·통합계약 후행 행이 공실/공실률 33.33% 로 표기되던 결함 + 신사 대지면적 정렬 + D2.
 */
import { describe, it, expect } from 'vitest';
import { resolveLeaseOccupancy, summarizeLeaseOccupancy, normalizeLeaseOccupancyFields } from '@/domain/building/mobile-im/lease-vacancy';
import { normalizeTextParsedRentRoll } from '@/lib/rentroll/text-parse-normalize';
import { extractLeaseFacts } from '@/domain/building/mobile-im/pptx/summary-highlights';
import { resolveTenantAndUse } from '@/domain/building/mobile-im/pptx/binder/rent-roll-table-builder';
import { alignPlatAreaForPrompt } from '@/domain/building/mobile-im/prompt-land-area';
import { calculateFinancials } from '@/domain/building/mobile-im/financials';

// 당산 스냅샷의 LLM 파싱 형태 (월세 0 → is_vacant:true 오표기)
const dangsan = [
  { floor: 'B1', tenant_type: '카페', is_vacant: true, lease_start: '2014-09-01', rent_manwon: 0, deposit_manwon: 0 },
  { floor: '1F', tenant_type: '약국', tenant_name: '고은약국', rent_manwon: 300, deposit_manwon: 3000 },
  { floor: '2F', tenant_name: '로뎀나무내과', is_vacant: true, lease_end: '2026-08-31', rent_manwon: 0 },
  { floor: '4F', tenant_type: '자가사용', is_vacant: true, rent_manwon: 0 },
];

describe('lease-vacancy SSOT', () => {
  it('당산형 행: 자가사용·통합계약 후행은 공실이 아니다 (공실률 0, 공실 층 없음)', () => {
    expect(resolveLeaseOccupancy(dangsan[0])).toBe('임대중');
    expect(resolveLeaseOccupancy(dangsan[2])).toBe('임대중');
    expect(resolveLeaseOccupancy(dangsan[3])).toBe('자가사용');
    const s = summarizeLeaseOccupancy(dangsan);
    expect(s.vacant).toBe(0);
    expect(s.ownerUse).toBe(1);
    expect(s.vacantFloors).toEqual([]);
    expect(s.vacancyPct).toBe(0);
  });

  it('명시적 공실은 여전히 공실이다', () => {
    expect(resolveLeaseOccupancy({ floor: '3F', tenant_name: '공실' })).toBe('공실');
    expect(resolveLeaseOccupancy({ floor: '3F', lease_state: '공실', is_vacant: true })).toBe('공실');
    expect(resolveLeaseOccupancy({ floor: '3F', is_vacant: true })).toBe('공실');
    const s = summarizeLeaseOccupancy([{ floor: '1F', tenant_name: 'A' }, { floor: '3F', lease_state: '공실' }]);
    expect(s.vacancyPct).toBe(50);
    expect(s.vacantFloors).toEqual(['3F']);
  });

  it('자가사용은 공실률 분모에서 제외된다', () => {
    const s = summarizeLeaseOccupancy([
      { floor: '1F', tenant_name: 'A', rent_manwon: 100 },
      { floor: '2F', lease_state: '공실' },
      { floor: '3F', tenant_type: '자가사용' },
    ]);
    expect(s.vacancyPct).toBe(50); // 1/2 (자가사용 제외)
  });

  it('normalizeLeaseOccupancyFields: is_vacant 오염 교정 + lease_state 채움', () => {
    const n: any = normalizeLeaseOccupancyFields(dangsan[2]);
    expect(n.is_vacant).toBe(false);
    expect(n.lease_state).toBe('임대중');
    expect((normalizeLeaseOccupancyFields(dangsan[3]) as any).lease_state).toBe('자가사용');
  });

  it('extractLeaseFacts: 당산 행에서 vacantFloors 가 비어 있다', () => {
    const f: any = extractLeaseFacts(dangsan);
    expect(f?.vacantFloors ?? []).toEqual([]);
  });

  it('resolveTenantAndUse: 임차인명 있는 2F 는 공실로 표기하지 않고 실명을 쓴다', () => {
    const r = resolveTenantAndUse(dangsan[2] as any);
    expect(r.isVacant).toBe(false);
    expect(r.tenant).toBe('로뎀나무내과');
  });

  it('normalizeTextParsedRentRoll: 합계·공실률 결정론 재계산', () => {
    const out = normalizeTextParsedRentRoll({
      floorLeases: dangsan as any,
      monthlyRent: 999, totalDeposit: 999, mgmtFeeTotal: 0, vacancyPct: 33.33,
    });
    expect(out.vacancyPct).toBe(0);
    expect(out.floorLeases.some((l) => l.is_vacant)).toBe(false);
    expect(out.monthlyRent).toBe(300 + 0 + 0);
  });
});

describe('alignPlatAreaForPrompt (신사 다필지)', () => {
  it('대장 대표 필지 면적과 해석 면적이 충돌하면 해석값으로 정렬', () => {
    const ext = { buildingRegister: { platArea: 571.5, other: 1 }, x: 1 };
    const out: any = alignPlatAreaForPrompt(ext, 1061.9);
    expect(out.buildingRegister.platArea).toBe(1061.9);
    expect(out.buildingRegister.other).toBe(1);
    expect(ext.buildingRegister.platArea).toBe(571.5); // 원본 불변
  });
  it('일치하거나 해석값이 없으면 그대로', () => {
    const ext = { buildingRegister: { platArea: 100 } };
    expect(alignPlatAreaForPrompt(ext, 100.2)).toBe(ext);
    expect(alignPlatAreaForPrompt(ext, null)).toBe(ext);
    expect(alignPlatAreaForPrompt(null, 100)).toBeNull();
  });
});

describe('D2 개발수익률 — 중개인 입력 없이 산출/노출 금지', () => {
  const base: any = { posture: 'development', purchasePriceKrw: 10_000_000_000, platAreaSqm: 500, targetGrossAreaPyeong: 1200 };
  it('분양가·공사비 미입력 → null', () => {
    const r: any = calculateFinancials(base);
    expect(r.devProfitMarginPct).toBeNull();
    expect(r.expectedSalesRevenueBil).toBeNull();
  });
  it('분양가만 입력(공사비 없음) → null', () => {
    const r: any = calculateFinancials({ ...base, expectedSalesPricePerPyeong: 4000 });
    expect(r.devProfitMarginPct).toBeNull();
  });
  it('둘 다 입력 → 산출', () => {
    const r: any = calculateFinancials({ ...base, constructionCostPerPyeong: 800, expectedSalesPricePerPyeong: 4000 });
    expect(r.devProfitMarginPct).not.toBeNull();
  });
});
