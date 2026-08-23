// src/domain/building/mobile-im/__tests__/im-core-mask.test.ts
import { describe, it, expect } from 'vitest';
import { applyMask } from '../render/apply-mask';
import type { IMCore } from '@/types/im-core';

describe('IMCore Masking Engine (Phase 2-3)', () => {
  const mockCore: IMCore = {
    meta: {
      assetId: 'test-asset-1',
      ontology: {
        buildingUse: '업무시설',
        assetType: 'office',
        posture: 'income',
      },
      generatedAt: '2026-08-23',
      resolution: 'R2',
      capabilities: ['yield_gross', 'yield_noi'],
      priceBand: 'B3',
    },
    address: {
      raw: '서울 영등포구 양평동 123-45',
      roadAddress: '서울 영등포구 선유로 100',
      jibunAddress: '서울 영등포구 양평동 123-45',
      sido: '서울',
      sigungu: '영등포구',
      dong: '양평동',
      pnu: '1156010100',
    },
    physical: {
      landAreaSqm: 500,
      totalGrossAreaSqm: 2500,
      floorsAbove: 10,
      floorsBelow: 1,
      completionYear: 2020,
      parkingCount: 15,
      elevatorCount: 1,
      zoning: '준공업지역',
      bcrPct: 58.4,
      farPct: 398.8,
      roadAccess: '12m 도로 접함',
    },
    price: {
      askingKrw: 25_000_000_000,
      perPyeongLand: 165_000_000,
      officialLandPriceRatio: 1.8,
    },
    equity: {
      price: 25_000_000_000,
      acquisitionTax: 1_150_000_000,
      brokerFee: 225_000_000,
      otherCost: 0,
      totalAcquisitionCost: 26_375_000_000,
      deposit: 500_000_000,
      loan: 12_500_000_000,
      equity: 13_375_000_000,
    },
    yields: {
      gross_price: { value: 4.25, basis: 'gross_price' },
      noi_price: { value: 3.65, basis: 'noi_price' },
    },
    headline: {
      posture: 'income',
      monthlyNetCashFlow: 35_000_000,
      negativeLeverage: false,
    },
    leases: [
      {
        unitLabel: '101호',
        tenantBusiness: '스타벅스',
        depositKrw: 100_000_000,
        monthlyRentKrw: 8_000_000,
        currentExpiryDate: '2028-12-31',
        leaseState: '임대중',
        contractGroup: null,
        leaseAreaSqm: 150,
        legalBasis: '상가',
        mgmtFeeKrw: 800_000,
        currentStartDate: '2023-12-31',
        firstContractDate: '2018-12-31',
        renewalExercised: null,
        opposingPower: '사업자등록',
        note: null,
      },
    ],
    comps: [],
    deficiencies: [
      {
        field: 'firstContractDate',
        label: '임차인 최초 계약일',
        affects: ['vacate_schedule'],
        nextBest: '최초 계약일 입력 시 명도 일정 산출',
        severity: 'note',
      },
    ],
    anchors: {
      askingPriceManwon: 2500000,
      totalDepositManwon: 50000,
      monthlyRentTotalManwon: 8854,
      grossYieldPct: 4.25,
      netYieldPct: 3.65,
      landAreaPyung: 151.25,
      grossAreaPyung: 756.25,
    },
    provenance: {},
    attachedDocs: [
      { docType: '대장', fileName: '건축물대장.pdf', fileUrl: 'https://example.com/doc.pdf', verified: true },
    ],
  };

  it('MSK-01: public mask masks address down to dong level', () => {
    const masked = applyMask(mockCore, 'public');
    expect(masked.address.raw).toBe('서울 영등포구 양평동 일대');
    expect(masked.address.roadAddress).toBeNull();
    expect(masked.address.jibunAddress).toBeNull();
  });

  it('MSK-02: public mask hides tenant business name', () => {
    const masked = applyMask(mockCore, 'public');
    expect(masked.leases[0].tenantBusiness).toContain('비공개');
    expect(masked.leases[0].tenantBusiness).not.toContain('스타벅스');
  });

  it('MSK-03: public mask strips attached document downloads', () => {
    const masked = applyMask(mockCore, 'public');
    expect(masked.attachedDocs.length).toBe(0);
  });

  it('MSK-04: public mask preserves deficiencies (확인사항은 투명 공개)', () => {
    const masked = applyMask(mockCore, 'public');
    expect(masked.deficiencies.length).toBe(1);
    expect(masked.deficiencies[0].label).toBe('임차인 최초 계약일');
  });

  it('MSK-05: full mask returns unmasked core data', () => {
    const full = applyMask(mockCore, 'full');
    expect(full.address.raw).toBe('서울 영등포구 양평동 123-45');
    expect(full.leases[0].tenantBusiness).toBe('스타벅스');
    expect(full.attachedDocs.length).toBe(1);
  });
});
