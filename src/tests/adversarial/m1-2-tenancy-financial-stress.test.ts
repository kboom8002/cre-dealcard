/**
 * @file m1-2-tenancy-financial-stress.test.ts
 * @description Empirical Adversarial Stress Test Suite for Milestone 1:
 *  - Tenancy Chunking Boundaries (0, 12, 13, 50+ tenants, subtotal/grand total math)
 *  - Mathematical Consistency Gate (tolerancePct, 1 KRW vs 1000 KRW, floating-point precision, zero-division NaN poison tokens)
 *
 * Executed and verified by Challenger M1-2.
 */

import { describe, it, expect } from 'vitest';
import {
  chunkTenantRoster,
  calculateTenantRosterSubtotal,
  calculateProWALE,
  InstitutionalTenantRosterItem,
  validateProImFinancialConsistency,
  ProImFinancialConsistencyInput,
} from '@/domain/building/im-core';

describe('Adversarial Tenancy Chunking Boundaries', () => {
  const createMockTenant = (id: number, overrides?: Partial<InstitutionalTenantRosterItem>): InstitutionalTenantRosterItem => ({
    floor: `${Math.floor(id / 3) + 1}F`,
    unitNumber: `${(Math.floor(id / 3) + 1) * 100 + (id % 3) + 1}호`,
    tenantName: `테넌트_${id}`,
    industry: id % 2 === 0 ? 'IT/소프트웨어' : '전문서비스',
    leasedAreaM2: 120.55,
    leasedAreaPyeong: 36.47,
    depositKrw: 50_000_000,
    monthlyRentKrw: 4_500_000,
    monthlyMaintenanceKrw: 500_000,
    leaseStartDate: '2024-01-01',
    leaseEndDate: '2027-12-31',
    renewalOption: '행사 가능',
    statutoryProtection10Y: true,
    ...overrides,
  });

  describe('Boundary 1: 0 Tenants (Empty Roster)', () => {
    it('handles empty array cleanly with 1 empty chunk and defined grandTotal', () => {
      const chunks = chunkTenantRoster([]);

      expect(chunks).toHaveLength(1);
      const first = chunks[0];
      expect(first.pageIndex).toBe(1);
      expect(first.totalPages).toBe(1);
      expect(first.isFirstPage).toBe(true);
      expect(first.isLastPage).toBe(true);
      expect(first.items).toEqual([]);
      expect(first.subtotal).toEqual({
        leasedAreaM2: 0,
        leasedAreaPyeong: 0,
        depositKrw: 0,
        monthlyRentKrw: 0,
        monthlyMaintenanceKrw: 0,
        annualRentKrw: 0,
        tenantCount: 0,
      });
      expect(first.grandTotal).toEqual(first.subtotal);
    });

    it('handles null or undefined input safely without throwing', () => {
      const chunksNull = chunkTenantRoster(null as any);
      expect(chunksNull).toHaveLength(1);
      expect(chunksNull[0].items).toHaveLength(0);

      const chunksUndefined = chunkTenantRoster(undefined as any);
      expect(chunksUndefined).toHaveLength(1);
      expect(chunksUndefined[0].items).toHaveLength(0);
    });
  });

  describe('Boundary 2: Exactly 12 Tenants (Single Slide Boundary)', () => {
    it('produces exactly 1 slide, isFirstPage=true, isLastPage=true, with grandTotal defined', () => {
      const tenants12 = Array.from({ length: 12 }, (_, i) => createMockTenant(i + 1));
      const chunks = chunkTenantRoster(tenants12, 12);

      expect(chunks).toHaveLength(1);
      const c = chunks[0];
      expect(c.pageIndex).toBe(1);
      expect(c.totalPages).toBe(1);
      expect(c.isFirstPage).toBe(true);
      expect(c.isLastPage).toBe(true);
      expect(c.items).toHaveLength(12);
      expect(c.grandTotal).toBeDefined();

      expect(c.subtotal.tenantCount).toBe(12);
      expect(c.grandTotal!.tenantCount).toBe(12);
      expect(c.subtotal.monthlyRentKrw).toBe(12 * 4_500_000);
      expect(c.grandTotal!.monthlyRentKrw).toBe(12 * 4_500_000);
      expect(c.subtotal.annualRentKrw).toBe(12 * 4_500_000 * 12);
    });
  });

  describe('Boundary 3: Exactly 13 Tenants (Two Slides, 1 Overflow Tenant)', () => {
    it('produces exactly 2 slides, second slide has 1 tenant + grand total', () => {
      const tenants13 = Array.from({ length: 13 }, (_, i) => createMockTenant(i + 1));
      const chunks = chunkTenantRoster(tenants13, 12);

      expect(chunks).toHaveLength(2);

      // Slide 1
      const c1 = chunks[0];
      expect(c1.pageIndex).toBe(1);
      expect(c1.totalPages).toBe(2);
      expect(c1.isFirstPage).toBe(true);
      expect(c1.isLastPage).toBe(false);
      expect(c1.items).toHaveLength(12);
      expect(c1.grandTotal).toBeUndefined();
      expect(c1.subtotal.tenantCount).toBe(12);

      // Slide 2
      const c2 = chunks[1];
      expect(c2.pageIndex).toBe(2);
      expect(c2.totalPages).toBe(2);
      expect(c2.isFirstPage).toBe(false);
      expect(c2.isLastPage).toBe(true);
      expect(c2.items).toHaveLength(1);
      expect(c2.subtotal.tenantCount).toBe(1);
      expect(c2.grandTotal).toBeDefined();
      expect(c2.grandTotal!.tenantCount).toBe(13);

      // Math across chunks
      expect(c1.subtotal.monthlyRentKrw + c2.subtotal.monthlyRentKrw).toBe(c2.grandTotal!.monthlyRentKrw);
      expect(c1.subtotal.depositKrw + c2.subtotal.depositKrw).toBe(c2.grandTotal!.depositKrw);
      expect(c1.subtotal.annualRentKrw + c2.subtotal.annualRentKrw).toBe(c2.grandTotal!.annualRentKrw);
    });
  });

  describe('Boundary 4: 50+ Tenants (Multi-Page Accumulation & Subtotal Math)', () => {
    it('splits 55 tenants into 5 pages with precise subtotal accumulation', () => {
      const tenants55 = Array.from({ length: 55 }, (_, i) => createMockTenant(i + 1));
      const chunks = chunkTenantRoster(tenants55, 12);

      expect(chunks).toHaveLength(5); // 12 + 12 + 12 + 12 + 7 = 55
      expect(chunks[0].items).toHaveLength(12);
      expect(chunks[1].items).toHaveLength(12);
      expect(chunks[2].items).toHaveLength(12);
      expect(chunks[3].items).toHaveLength(12);
      expect(chunks[4].items).toHaveLength(7);

      for (let p = 0; p < 4; p++) {
        expect(chunks[p].isLastPage).toBe(false);
        expect(chunks[p].grandTotal).toBeUndefined();
      }
      expect(chunks[4].isLastPage).toBe(true);
      expect(chunks[4].grandTotal).toBeDefined();

      const runningMonthlyRent = chunks.reduce((acc, c) => acc + c.subtotal.monthlyRentKrw, 0);
      const runningDeposit = chunks.reduce((acc, c) => acc + c.subtotal.depositKrw, 0);
      const runningMaintenance = chunks.reduce((acc, c) => acc + c.subtotal.monthlyMaintenanceKrw, 0);
      const runningAnnualRent = chunks.reduce((acc, c) => acc + c.subtotal.annualRentKrw, 0);
      const runningTenantCount = chunks.reduce((acc, c) => acc + c.subtotal.tenantCount, 0);

      const grand = chunks[4].grandTotal!;
      expect(runningMonthlyRent).toBe(grand.monthlyRentKrw);
      expect(runningDeposit).toBe(grand.depositKrw);
      expect(runningMaintenance).toBe(grand.monthlyMaintenanceKrw);
      expect(runningAnnualRent).toBe(grand.annualRentKrw);
      expect(runningTenantCount).toBe(grand.tenantCount);
      expect(grand.tenantCount).toBe(55);
    });

    it('empirically reveals floating-point rounding divergence in page subtotals vs grandTotal for 50+ tenants', () => {
      // 50 tenants with fractional area: 33.333 m2 each
      const fractionalTenants = Array.from({ length: 50 }, (_, i) =>
        createMockTenant(i + 1, {
          leasedAreaM2: 33.333,
          leasedAreaPyeong: 10.083,
        })
      );

      const chunks = chunkTenantRoster(fractionalTenants, 12);
      const grand = chunks[chunks.length - 1].grandTotal!;

      // Sum of page subtotals (each subtotal is individually rounded with toFixed(2))
      const sumPageAreaM2 = chunks.reduce((acc, c) => acc + c.subtotal.leasedAreaM2, 0);
      const sumPagePyeong = chunks.reduce((acc, c) => acc + c.subtotal.leasedAreaPyeong, 0);

      // Page 1: 12 * 33.333 = 399.996 -> 400.00
      // Page 2: 400.00
      // Page 3: 400.00
      // Page 4: 400.00
      // Page 5: 2 * 33.333 = 66.666 -> 66.67
      // Sum of pages = 1666.67 m2
      // Grand total = 50 * 33.333 = 1666.65 m2
      expect(sumPageAreaM2).toBe(1666.67);
      expect(grand.leasedAreaM2).toBe(1666.65);
      // Empirical divergence of 0.02 m2 between sum of page subtotals and grand total
      expect(Math.abs(sumPageAreaM2 - grand.leasedAreaM2)).toBeCloseTo(0.02, 4);
    });
  });

  describe('Adversarial Tenancy Edge Cases', () => {
    it('handles maxPerSlide edge cases (0, negative, larger than roster)', () => {
      const tenants = Array.from({ length: 5 }, (_, i) => createMockTenant(i + 1));

      const chunks0 = chunkTenantRoster(tenants, 0);
      expect(chunks0).toHaveLength(5); // Math.max(1, 0) -> 1 per slide

      const chunksNeg = chunkTenantRoster(tenants, -10);
      expect(chunksNeg).toHaveLength(5); // Math.max(1, -10) -> 1 per slide

      const chunksLarge = chunkTenantRoster(tenants, 1000);
      expect(chunksLarge).toHaveLength(1);
      expect(chunksLarge[0].items).toHaveLength(5);
    });

    it('handles tenants with missing or zero numeric fields without NaN', () => {
      const corruptTenants: InstitutionalTenantRosterItem[] = [
        {
          floor: '1F',
          unitNumber: '101호',
          tenantName: '결손 테넌트',
          industry: '기타',
          leasedAreaM2: undefined as any,
          leasedAreaPyeong: 0,
          depositKrw: undefined as any,
          monthlyRentKrw: 0,
          monthlyMaintenanceKrw: null as any,
          leaseStartDate: '',
          leaseEndDate: '',
          statutoryProtection10Y: false,
        },
      ];

      const subtotal = calculateTenantRosterSubtotal(corruptTenants);
      expect(subtotal.leasedAreaM2).toBe(0);
      expect(subtotal.depositKrw).toBe(0);
      expect(subtotal.monthlyRentKrw).toBe(0);
      expect(subtotal.monthlyMaintenanceKrw).toBe(0);
      expect(subtotal.annualRentKrw).toBe(0);
      expect(Number.isNaN(subtotal.leasedAreaM2)).toBe(false);
    });
  });
});

describe('Adversarial Mathematical Consistency Gate (validateProImFinancialConsistency)', () => {
  const baseInput: ProImFinancialConsistencyInput = {
    executiveSummary: {
      askingPriceKrw: 60_000_000_000,
      year1NoiKrw: 2_700_000_000,
      initialCapRatePct: 4.5,
      totalAnnualRentKrw: 3_200_000_000,
      totalDepositKrw: 3_500_000_000,
      totalDevelopmentCostKrw: 75_000_000_000,
    },
    detailSchedule: {
      cashFlowYear1: {
        purchasePrice: 60_000_000_000,
        noi: 2_700_000_000,
        pgi: 3_200_000_000,
      },
      tenantRosterTotal: {
        totalAnnualRent: 3_200_000_000,
        totalDeposit: 3_500_000_000,
      },
      developmentBudgetTotalKrw: 75_000_000_000,
    },
  };

  describe('Adversarial Defect 1: 1 KRW vs 1000 KRW & Broken Boolean Invariant', () => {
    it('verifies 1 KRW difference passes cleanly as exact match without contradiction', () => {
      const testInput: ProImFinancialConsistencyInput = {
        ...baseInput,
        executiveSummary: {
          ...baseInput.executiveSummary,
          askingPriceKrw: 60_000_000_001, // 1 KRW difference
        },
      };

      const res = validateProImFinancialConsistency(testInput, 0.00);
      const chk = res.checks.find(c => c.checkName === 'Asking Price Consistency')!;

      // Remediated: passed is TRUE because askingPriceDiff <= 1 is accepted as exact match
      expect(chk.passed).toBe(true);
      // Consistent: message says it MATCHES
      expect(chk.message).toBe('Executive Asking Price exactly matches Cash Flow Purchase Price.');
      // Overall gate passes
      expect(res.passed).toBe(true);
    });

    it('verifies that tolerancePct > 0 allows discrepancies within threshold', () => {
      const testInput: ProImFinancialConsistencyInput = {
        ...baseInput,
        executiveSummary: {
          ...baseInput.executiveSummary,
          askingPriceKrw: 60_000_010_000, // 10,000 KRW diff
        },
      };

      // Caller explicitly allows 0.5% tolerance (which is 300,000,000 KRW on 60B)
      const res = validateProImFinancialConsistency(testInput, 0.5);
      const chk = res.checks.find(c => c.checkName === 'Asking Price Consistency')!;

      // Diff % is 0.000016%, far below 0.5%
      expect(chk.discrepancyPct).toBeLessThan(0.5);
      // Remediated: passed is TRUE because tolerancePct allows 0.5%
      expect(chk.passed).toBe(true);
      expect(res.passed).toBe(true);
    });

    it('handles floating point epsilon diff (0.000001 KRW)', () => {
      const testInput: ProImFinancialConsistencyInput = {
        ...baseInput,
        executiveSummary: {
          ...baseInput.executiveSummary,
          askingPriceKrw: 60_000_000_000.000001,
        },
      };

      const res = validateProImFinancialConsistency(testInput, 0.00);
      const chk = res.checks.find(c => c.checkName === 'Asking Price Consistency')!;
      // In IEEE-754 double precision (53-bit mantissa), Number.EPSILON * 6e10 ≈ 0.000013 KRW.
      // Differences smaller than 0.000013 KRW at the 60B KRW scale are below machine precision and evaluate to 0.
      expect(chk.passed).toBe(true);
      expect(chk.discrepancyKrwOrUnit).toBe(0);
    });
  });

  describe('Adversarial Defect 2: Poison Token NaN Generation on Zero Division', () => {
    it('verifies that zero purchasePrice is safely guarded without NaN poison tokens', () => {
      const testInput: ProImFinancialConsistencyInput = {
        ...baseInput,
        detailSchedule: {
          ...baseInput.detailSchedule,
          cashFlowYear1: {
            purchasePrice: 0,
            noi: 0,
            pgi: 0,
          },
        },
      };

      const res = validateProImFinancialConsistency(testInput);
      const capChk = res.checks.find(c => c.checkName === 'Initial Cap Rate Formula Consistency')!;

      // Remediated: detailValue defaults safely to 0.0 without NaN
      expect(Number.isNaN(capChk.detailValue)).toBe(false);
      expect(capChk.detailValue).toBe(0.0);
      expect(Number.isNaN(capChk.discrepancyKrwOrUnit)).toBe(false);
      expect(Number.isNaN(capChk.discrepancyPct)).toBe(false);
      // Message does not contain poison token 'NaN%'
      expect(capChk.message).not.toContain('NaN%');
      expect(/NaN/.test(capChk.message ?? '')).toBe(false);
    });
  });

  describe('Adversarial Intentional Discrepancy Detections across All Dimensions', () => {
    it('detects intentional 1000 KRW Asking Price discrepancy', () => {
      const testInput: ProImFinancialConsistencyInput = {
        ...baseInput,
        executiveSummary: {
          ...baseInput.executiveSummary,
          askingPriceKrw: 60_000_001_000,
        },
      };
      const res = validateProImFinancialConsistency(testInput);
      const chk = res.checks.find(c => c.checkName === 'Asking Price Consistency')!;
      expect(chk.passed).toBe(false);
      expect(chk.discrepancyKrwOrUnit).toBe(1000);
      expect(res.passed).toBe(false);
    });

    it('detects intentional 1000 KRW NOI discrepancy', () => {
      const testInput: ProImFinancialConsistencyInput = {
        ...baseInput,
        executiveSummary: {
          ...baseInput.executiveSummary,
          year1NoiKrw: 2_700_001_000,
        },
      };
      const res = validateProImFinancialConsistency(testInput);
      const chk = res.checks.find(c => c.checkName === 'Year 1 NOI Consistency')!;
      expect(chk.passed).toBe(false);
      expect(chk.discrepancyKrwOrUnit).toBe(1000);
      expect(res.passed).toBe(false);
    });

    it('detects intentional 0.05%p Cap Rate discrepancy', () => {
      const testInput: ProImFinancialConsistencyInput = {
        ...baseInput,
        executiveSummary: {
          ...baseInput.executiveSummary,
          initialCapRatePct: 4.55, // 4.55% vs derived 4.50%
        },
      };
      const res = validateProImFinancialConsistency(testInput);
      const chk = res.checks.find(c => c.checkName === 'Initial Cap Rate Formula Consistency')!;
      expect(chk.passed).toBe(false);
      expect(chk.discrepancyKrwOrUnit).toBe(0.05);
      expect(res.passed).toBe(false);
    });

    it('detects intentional 1000 KRW Total Rent discrepancy', () => {
      const testInput: ProImFinancialConsistencyInput = {
        ...baseInput,
        executiveSummary: {
          ...baseInput.executiveSummary,
          totalAnnualRentKrw: 3_200_001_000,
        },
      };
      const res = validateProImFinancialConsistency(testInput);
      const chk = res.checks.find(c => c.checkName === 'Tenant Roster vs Executive Total Rent Consistency')!;
      expect(chk.passed).toBe(false);
      expect(chk.discrepancyKrwOrUnit).toBe(1000);
      expect(res.passed).toBe(false);
    });

    it('detects intentional 1000 KRW Total Deposit discrepancy', () => {
      const testInput: ProImFinancialConsistencyInput = {
        ...baseInput,
        executiveSummary: {
          ...baseInput.executiveSummary,
          totalDepositKrw: 3_500_001_000,
        },
      };
      const res = validateProImFinancialConsistency(testInput);
      const chk = res.checks.find(c => c.checkName === 'Tenant Roster vs Executive Deposit Consistency')!;
      expect(chk.passed).toBe(false);
      expect(chk.discrepancyKrwOrUnit).toBe(1000);
      expect(res.passed).toBe(false);
    });

    it('detects intentional 1000 KRW Development Budget discrepancy', () => {
      const testInput: ProImFinancialConsistencyInput = {
        ...baseInput,
        executiveSummary: {
          ...baseInput.executiveSummary,
          totalDevelopmentCostKrw: 75_000_001_000,
        },
      };
      const res = validateProImFinancialConsistency(testInput);
      const chk = res.checks.find(c => c.checkName === 'Development Feasibility Budget Total Consistency')!;
      expect(chk.passed).toBe(false);
      expect(chk.discrepancyKrwOrUnit).toBe(1000);
      expect(res.passed).toBe(false);
    });
  });
});
