// src/tests/unit/audit-gates.test.ts
// Unit tests covering Dangsan 115B & Yangpyeong 250B audit findings

import { describe, it, expect } from 'vitest';
import { runDeterministicGates, checkQG19, checkQG18, checkCBASIS, checkQG21 } from '@/domain/building/gates/deterministic-gates';
import type { IMCore } from '@/types/im-core';

function createMockCore(overrides?: Partial<IMCore>): IMCore {
  return {
    meta: {
      generationId: 'gen-test-01',
      docId: 'doc-test-01',
      buildingId: 'b-test-01',
      version: 1,
      createdAt: new Date().toISOString(),
      tier: 'basic',
    },
    address: {
      raw: '서울특별시 영등포구 당산동5가 11-47',
      sido: '서울특별시',
      sigungu: '영등포구',
      dong: '당산동5가',
      roadAddress: '서울특별시 영등포구 당산로 123',
      jibunAddress: '서울특별시 영등포구 당산동5가 11-47',
    },
    physical: {
      landAreaSqm: 506.8,
      totalGrossAreaSqm: 1441.15,
      bcrPct: 58.2,
      farPct: 221.8,
      mainUse: '근린생활시설',
      structure: '철근콘크리트구조',
      floors: '지하 1층 / 지상 5층',
      completionYear: 2012,
    },
    price: {
      askingKrw: 11500000000,
      pricePerPyeongKrw: 75000000,
      vatIncluded: false,
    },
    equity: {
      price: 11500000000,
      acquisitionTax: 529000000,
      brokerFee: 103500000,
      totalAcquisitionCost: 12132500000,
      deposit: 290000000,
      loan: 5750000000,
      equity: 6092500000,
    },
    yields: {
      gross_price: { basis: 'gross_price', value: 2.03 },
      gross_price_deposit: { basis: 'gross_price_deposit', value: 2.08 },
    },
    headline: {
      posture: 'income',
      title: '당산역 역세권 메디컬 근생빌딩',
      kicker: 'INCOME STABLE',
      tags: ['초역세권', '메디컬'],
      priceBand: '110억 원대',
      b2cLabel: '당산동 110억대 수익형 빌딩',
    },
    leases: [
      {
        unitLabel: '1F 약국',
        leaseAreaSqm: 120.5,
        tenantBusiness: '약국',
        legalBasis: '상가',
        depositKrw: 60000000,
        monthlyRentKrw: 1830000,
        mgmtFeeKrw: 200000,
        firstContractDate: null,
        currentExpiryDate: '2026-12-31',
        leaseState: '임대중',
      },
      {
        unitLabel: '1F-2F 의원',
        leaseAreaSqm: 350.0,
        tenantBusiness: '내과/이비인후과',
        legalBasis: '상가',
        depositKrw: 140000000,
        monthlyRentKrw: 8830000,
        mgmtFeeKrw: 600000,
        firstContractDate: null,
        currentExpiryDate: '2027-05-31',
        leaseState: '임대중',
      },
      {
        unitLabel: '3F 헬스장',
        leaseAreaSqm: 250.0,
        tenantBusiness: '피트니스',
        legalBasis: '상가',
        depositKrw: 50000000,
        monthlyRentKrw: 4550000,
        mgmtFeeKrw: 400000,
        firstContractDate: null,
        currentExpiryDate: '2026-08-31',
        leaseState: '임대중',
      },
      {
        unitLabel: '4F 와인바',
        leaseAreaSqm: 180.0,
        tenantBusiness: '일반음식점',
        legalBasis: '상가',
        depositKrw: 30000000,
        monthlyRentKrw: 2600000,
        mgmtFeeKrw: 300000,
        firstContractDate: null,
        currentExpiryDate: '2026-10-31',
        leaseState: '임대중',
      },
      {
        unitLabel: '5F 의원',
        leaseAreaSqm: 150.0,
        tenantBusiness: '치과의원',
        legalBasis: '상가',
        depositKrw: 10000000,
        monthlyRentKrw: 1650000,
        mgmtFeeKrw: 250000,
        firstContractDate: null,
        currentExpiryDate: '2027-01-31',
        leaseState: '임대중',
      },
    ],
    comps: [],
    deficiencies: [],
    anchors: {
      monthlyRentTotalManwon: 1946,
      depositTotalManwon: 29000,
    },
    provenance: {},
    attachedDocs: [],
    ...overrides,
  };
}

describe('Audit Quality Gates (Dangsan & Yangpyeong Audit Verification)', () => {
  it('GT-G19-01: Summary vs Ledger exact sum matching passes when equal', () => {
    const core = createMockCore();
    // Leases sum: Deposit = 6000만 + 14000만 + 5000만 + 3000만 + 1000만 = 29000만 (2.9억)
    // Monthly = 183만 + 883만 + 455만 + 260만 + 165만 = 1946만
    const res = checkQG19(core);
    expect(res.passed).toBe(true);
  });

  it('GT-G19-02: Summary vs Ledger sum mismatch is blocked', () => {
    const core = createMockCore({
      equity: {
        price: 11500000000,
        totalAcquisitionCost: 12132500000,
        deposit: 240000000, // 2.4억 (5000만 불일치)
        loan: 5750000000,
        equity: 6092500000,
      },
    });
    const res = checkQG19(core);
    expect(res.passed).toBe(false);
    expect(res.severity).toBe('block');
  });

  it('GT-G18-01: Missing firstContractDate with renewal years text is blocked', () => {
    const core = createMockCore();
    const snippets = [
      { type: 'lease_status', text: '401호는 갱신요구권 7년 잔여로 인해 5% 상한이 적용됩니다.' },
    ];
    const res = checkQG18(core, snippets);
    expect(res.passed).toBe(false);
    expect(res.severity).toBe('block');
    expect(res.message).toContain('갱신요구권');
  });

  it('GT-G18-02: Missing firstContractDate without renewal years text passes', () => {
    const core = createMockCore();
    const snippets = [
      { type: 'lease_status', text: '호실별 임대차 계약 현황은 최초계약일 확인 필요 상태입니다.' },
    ];
    const res = checkQG18(core, snippets);
    expect(res.passed).toBe(true);
  });

  it('GT-C-BASIS-01: Gross yield labeled as Net Yield / Cap Rate is blocked', () => {
    const core = createMockCore();
    const snippets = [
      { type: 'summary', text: '연 순수익률 (Cap Rate) 2.08% 달성' },
    ];
    const res = checkCBASIS(core, snippets);
    expect(res.passed).toBe(false);
    expect(res.severity).toBe('block');
    expect(res.message).toContain('총수익률');
  });

  it('GT-C-BASIS-02: Gross yield properly labeled as Gross / 총임대료 기준 passes', () => {
    const core = createMockCore();
    const snippets = [
      { type: 'summary', text: '연 수익률 2.08% (총임대료 ÷ (매매가 - 보증금))' },
    ];
    const res = checkCBASIS(core, snippets);
    expect(res.passed).toBe(true);
  });

  it('GT-G21-01: Mismatched administrative district in attached documents is blocked', () => {
    const core = createMockCore({
      attachedDocs: [
        {
          docType: 'land_use_plan',
          fileName: '토지이용계획확인원.pdf',
          fileUrl: 'https://example.com/doc.pdf',
          verified: true,
          sigungu: '마포구', // 본건은 영등포구
        } as any,
      ],
    });
    const res = checkQG21(core);
    expect(res.passed).toBe(false);
    expect(res.message).toContain('다른 관할 공부');
  });

  it('GT-G21-02: Verified matching attached documents pass', () => {
    const core = createMockCore({
      attachedDocs: [
        {
          docType: 'building_ledger',
          fileName: '건축물대장.pdf',
          fileUrl: 'https://example.com/doc.pdf',
          verified: true,
          sigungu: '영등포구',
        } as any,
      ],
    });
    const res = checkQG21(core);
    expect(res.passed).toBe(true);
  });

  it('UT-ROE-01: In negative leverage regime (gross yield < loan rate), ROE decreases with leverage', () => {
    const price = 11500000000;
    const totalCost = 12132500000;
    const deposit = 290000000;
    const annualRent = 233520000; // gross yield ~2.03%
    const loanRate = 0.045; // 4.5%

    // LTV 0% (무차입)
    const eq0 = totalCost - deposit;
    const roe0 = (annualRent / eq0) * 100;

    // LTV 50%
    const loan50 = price * 0.5;
    const eq50 = totalCost - deposit - loan50;
    const interest50 = loan50 * loanRate;
    const netCashFlow50 = annualRent - interest50;
    const roe50 = (netCashFlow50 / eq50) * 100;

    expect(roe0).toBeGreaterThan(roe50); // 무차입 ROE가 LTV 50% ROE보다 높아야 함
    expect(roe50).toBeLessThan(0); // 당산동 115억의 LTV 50% ROE는 음수 (-0.41%)
  });
});
