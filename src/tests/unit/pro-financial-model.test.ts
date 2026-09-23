import { describe, it, expect } from 'vitest';
import {
  calculateIrrNewtonRaphson,
  generateMultiYearCashFlow,
  generate2DSensitivityMatrix,
  generateDevelopmentFeasibilityBudget,
  validateProImFinancialConsistency,
  calculateTenantRosterSubtotal,
  chunkTenantRoster,
  calculateProWALE,
  InstitutionalTenantRosterItem,
  MultiYearCashFlowInput,
  ProImFinancialConsistencyInput,
} from '@/domain/building/im-core';

describe('Pro Financial Model & Tenancy Suite (Milestone 1)', () => {
  // ==========================================================================
  // 1. Newton-Raphson IRR Solver
  // ==========================================================================
  describe('Newton-Raphson IRR Solver', () => {
    it('accurately solves benchmark 3-year cash flows', async () => {
      // Invest 1,000, receive 100, 100, 1100 -> exactly 10.00%
      const irr = calculateIrrNewtonRaphson([-1000, 100, 100, 1100]);
      expect(irr).not.toBeNull();
      expect(irr).toBe(10.0);
    });

    it('accurately solves realistic commercial 10-year hold cash flows', async () => {
      // 50B acquisition, ~2.5B annual NOI, 60B exit proceeds
      const cashFlows = [
        -50_000_000_000,
        2_400_000_000,
        2_450_000_000,
        2_500_000_000,
        2_550_000_000,
        2_600_000_000,
        2_650_000_000,
        2_700_000_000,
        2_750_000_000,
        2_800_000_000,
        2_850_000_000 + 58_000_000_000,
      ];
      const irr = calculateIrrNewtonRaphson(cashFlows);
      expect(irr).not.toBeNull();
      expect(irr!).toBeGreaterThan(6.0);
      expect(irr!).toBeLessThan(8.0);
    });

    it('gracefully returns null for invalid inputs or no sign change', async () => {
      expect(calculateIrrNewtonRaphson([])).toBeNull();
      expect(calculateIrrNewtonRaphson([-100])).toBeNull();
      expect(calculateIrrNewtonRaphson([100, 200, 300])).toBeNull(); // all positive
      expect(calculateIrrNewtonRaphson([-100, -200, -300])).toBeNull(); // all negative
    });
  });

  // ==========================================================================
  // 2. Multi-Year Cash Flow Projection Generator
  // ==========================================================================
  describe('generateMultiYearCashFlow', () => {
    const defaultInput: MultiYearCashFlowInput = {
      purchasePriceKrw: 50_000_000_000, // 500억 원
      holdingPeriodYears: 10,
      initialPgiKrw: 2_600_000_000, // 연 임대료 26억 원
      rentGrowthRatePct: 2.0,
      vacancyRatePct: 3.0,
      capexReserveRatePct: 1.0,
      exitCapRatePct: 4.5,
      dispositionCostRatePct: 1.5,
      discountRatePct: 6.0,
      opex: {
        managementFeeKrw: 80_000_000,
        propertyTaxKrw: 100_000_000,
        insuranceKrw: 30_000_000,
        maintenanceKrw: 70_000_000,
        opexGrowthRatePct: 2.0,
      },
    };

    it('generates 10-year projection arrays maintaining mathematical identities', async () => {
      const cf = generateMultiYearCashFlow(defaultInput);

      expect(cf.years).toHaveLength(10);
      expect(cf.pgi).toHaveLength(10);
      expect(cf.vacancyAllowance).toHaveLength(10);
      expect(cf.egi).toHaveLength(10);
      expect(cf.opex.total).toHaveLength(10);
      expect(cf.capexReserve).toHaveLength(10);
      expect(cf.noi).toHaveLength(10);

      // Verify every year satisfies exact identities
      for (let t = 0; t < 10; t++) {
        // EGI = PGI - Vacancy
        expect(cf.egi[t]).toBe(cf.pgi[t] - cf.vacancyAllowance[t]);

        // OPEX Total = sum of line items
        const opexSum =
          cf.opex.managementFee[t] +
          cf.opex.propertyTax[t] +
          cf.opex.insurance[t] +
          cf.opex.maintenance[t];
        expect(cf.opex.total[t]).toBe(opexSum);

        // NOI = EGI - OPEX Total - CapEx
        expect(cf.noi[t]).toBe(cf.egi[t] - cf.opex.total[t] - cf.capexReserve[t]);
      }
    });

    it('correctly calculates terminal exit valuation and net proceeds', async () => {
      const cf = generateMultiYearCashFlow(defaultInput);
      const exit = cf.exitAssumptions;

      expect(exit.holdingPeriodYears).toBe(10);
      expect(exit.exitCapRatePct).toBe(4.5);
      expect(exit.grossSalePrice).toBeGreaterThan(0);
      expect(exit.dispositionCosts).toBe(Math.round(exit.grossSalePrice * 0.015));
      expect(exit.netProceeds).toBe(exit.grossSalePrice - exit.dispositionCosts);
    });

    it('calculates initial cap rate and positive unlevered IRR', async () => {
      const cf = generateMultiYearCashFlow(defaultInput);
      const expectedCapRate = Number(((cf.noi[0] / 50_000_000_000) * 100).toFixed(2));

      expect(cf.metrics.initialCapRatePct).toBe(expectedCapRate);
      expect(cf.metrics.unleveredIrrPct).toBeGreaterThan(4.0);
      expect(cf.metrics.npvKrw).toBeDefined();
    });

    it('models levered cash flows, debt service, and positive financial leverage', async () => {
      const leveredInput: MultiYearCashFlowInput = {
        ...defaultInput,
        debtFinancing: {
          loanAmountKrw: 30_000_000_000, // 300억 대출 (LTV 60%)
          interestRatePct: 4.2, // 이자율 4.2%
          isInterestOnly: true,
        },
      };

      const cf = generateMultiYearCashFlow(leveredInput);

      expect(cf.debtService).toBeDefined();
      expect(cf.btcf).toBeDefined();
      expect(cf.debtService!.interest).toHaveLength(10);
      expect(cf.debtService!.total[0]).toBe(Math.round(30_000_000_000 * 0.042));

      // BTCF = NOI - Debt Service
      for (let t = 0; t < 10; t++) {
        expect(cf.btcf![t]).toBe(cf.noi[t] - cf.debtService!.total[t]);
      }

      // Initial cap rate (~4.4%) > interest rate (4.2%) -> positive leverage -> Levered IRR > Unlevered IRR
      expect(cf.metrics.leveredIrrPct).toBeDefined();
      expect(cf.metrics.leveredIrrPct!).toBeGreaterThan(cf.metrics.unleveredIrrPct);
      expect(cf.metrics.averageCashOnCashPct).toBeGreaterThan(0);
    });

    it('supports fully amortizing debt schedules over holding period', async () => {
      const amortInput: MultiYearCashFlowInput = {
        ...defaultInput,
        debtFinancing: {
          loanAmountKrw: 25_000_000_000,
          interestRatePct: 4.5,
          isInterestOnly: false,
          amortizationYears: 20,
        },
      };

      const cf = generateMultiYearCashFlow(amortInput);
      expect(cf.debtService).toBeDefined();
      // In amortizing schedule, principal payment is positive
      expect(cf.debtService!.principal[0]).toBeGreaterThan(0);
      expect(cf.debtService!.total[0]).toBe(
        cf.debtService!.principal[0] + cf.debtService!.interest[0]
      );
      // Principal payment increases over time as interest decreases
      expect(cf.debtService!.principal[9]).toBeGreaterThan(
        cf.debtService!.principal[0]
      );
      expect(cf.debtService!.interest[9]).toBeLessThan(cf.debtService!.interest[0]);
    });
  });

  // ==========================================================================
  // 3. 2D Sensitivity Matrix & Vacancy Stress Scenarios
  // ==========================================================================
  describe('generate2DSensitivityMatrix', () => {
    const baseInput: MultiYearCashFlowInput = {
      purchasePriceKrw: 40_000_000_000,
      initialPgiKrw: 2_000_000_000,
      exitCapRatePct: 4.5,
      discountRatePct: 6.0,
      vacancyRatePct: 3.0,
    };

    it('generates a 5x5 grid of exit cap rates vs discount rates', async () => {
      const result = generate2DSensitivityMatrix(baseInput);

      expect(result.matrix2D.exitCapRates).toHaveLength(5);
      expect(result.matrix2D.discountRates).toHaveLength(5);
      expect(result.matrix2D.unleveredIrrGrid).toHaveLength(5);
      expect(result.matrix2D.npvGridKrw).toHaveLength(5);

      for (let i = 0; i < 5; i++) {
        expect(result.matrix2D.unleveredIrrGrid[i]).toHaveLength(5);
        expect(result.matrix2D.npvGridKrw[i]).toHaveLength(5);
      }
    });

    it('preserves institutional monotonicity in the sensitivity matrix', async () => {
      const result = generate2DSensitivityMatrix(baseInput);
      const { exitCapRates, discountRates, unleveredIrrGrid, npvGridKrw } =
        result.matrix2D;

      // Higher exit cap rate means lower exit valuation -> lower IRR across any discount rate
      const discIdx = 2; // base discount rate
      for (let r = 0; r < exitCapRates.length - 1; r++) {
        expect(unleveredIrrGrid[r][discIdx]).toBeGreaterThanOrEqual(
          unleveredIrrGrid[r + 1][discIdx]
        );
      }

      // Higher discount rate means lower NPV across any exit cap rate
      const capIdx = 2; // base exit cap
      for (let c = 0; c < discountRates.length - 1; c++) {
        expect(npvGridKrw[capIdx][c]).toBeGreaterThan(npvGridKrw[capIdx][c + 1]);
      }
    });

    it('generates Base, Moderate, and Severe vacancy stress test scenarios', async () => {
      const result = generate2DSensitivityMatrix(baseInput);
      const scenarios = result.vacancyStressScenarios;

      expect(scenarios).toHaveLength(3);
      const [base, mod, sev] = scenarios;

      expect(base.scenarioName).toBe('Base');
      expect(mod.scenarioName).toBe('Moderate');
      expect(sev.scenarioName).toBe('Severe');

      expect(base.vacancyRatePct).toBeLessThan(mod.vacancyRatePct);
      expect(mod.vacancyRatePct).toBeLessThan(sev.vacancyRatePct);

      // Stressed vacancy decreases Year 1 NOI
      expect(base.year1NoiKrw).toBeGreaterThan(mod.year1NoiKrw);
      expect(mod.year1NoiKrw).toBeGreaterThan(sev.year1NoiKrw);

      // NOI delta % is strictly negative for stressed scenarios
      expect(base.noiDeltaPct).toBe(0);
      expect(mod.noiDeltaPct).toBeLessThan(0);
      expect(sev.noiDeltaPct).toBeLessThan(mod.noiDeltaPct);

      // Stressed vacancy decreases IRR
      expect(base.unleveredIrrPct).toBeGreaterThan(sev.unleveredIrrPct);
    });
  });

  // ==========================================================================
  // 4. 5-Tier Development Feasibility Budget Engine
  // ==========================================================================
  describe('generateDevelopmentFeasibilityBudget', () => {
    it('computes 5-tier budget with exact subtotal and total balance', async () => {
      const budget = generateDevelopmentFeasibilityBudget({
        landPriceKrw: 20_000_000_000, // 토지대 200억
        targetGfaPyeong: 1_500, // 연면적 1,500평
        constructionCostPerPyeongKrw: 12_000_000, // 평당 1,200만 원
        contingencyRatePct: 5.0,
      });

      // Verify each tier matches its subtotal
      const t = budget.tiers;
      const t1Sum =
        t.tier1Land.purchasePriceKrw +
        t.tier1Land.acquisitionTaxKrw +
        t.tier1Land.brokerageFeeKrw +
        t.tier1Land.evictionCompensationKrw +
        t.tier1Land.carryingCostKrw;
      expect(budget.landAcquisitionKrw).toBe(t1Sum);

      const t2Sum =
        t.tier2HardCosts.demolitionKrw +
        t.tier2HardCosts.constructionCivilKrw +
        t.tier2HardCosts.constructionMepFinishKrw +
        t.tier2HardCosts.infrastructureHookupKrw;
      expect(budget.hardCostsKrw).toBe(t2Sum);

      const t3Sum =
        t.tier3SoftCosts.architecturalDesignKrw +
        t.tier3SoftCosts.supervisionKrw +
        t.tier3SoftCosts.permitsAndTaxesKrw +
        t.tier3SoftCosts.projectManagementKrw;
      expect(budget.softCostsKrw).toBe(t3Sum);

      const t4Sum =
        t.tier4FinancingPf.bridgeInterestAndFeesKrw +
        t.tier4FinancingPf.pfInterestReserveKrw +
        t.tier4FinancingPf.pfArrangementFeesKrw +
        t.tier4FinancingPf.trustFeesKrw;
      expect(budget.financingPfKrw).toBe(t4Sum);

      // Contingency equals 5% of subtotal
      const subtotal = t1Sum + t2Sum + t3Sum + t4Sum;
      expect(budget.contingencyKrw).toBe(Math.round(subtotal * 0.05));

      // Grand Total strictly balances
      expect(budget.totalDevelopmentCostKrw).toBe(subtotal + budget.contingencyKrw);

      // Revenue and profit margins
      expect(budget.netProfitKrw).toBe(
        budget.projectedGrossRevenueKrw - budget.totalDevelopmentCostKrw
      );
      expect(budget.profitMarginPct).toBeGreaterThan(0);
      expect(budget.projectIrrPct).toBeGreaterThan(0);
      expect(budget.equityIrrPct).toBeGreaterThan(0);
    });

    it('honors custom line-item overrides across tiers', async () => {
      const budget = generateDevelopmentFeasibilityBudget({
        landPriceKrw: 10_000_000_000,
        targetGfaPyeong: 800,
        customLandAcquisition: {
          evictionCompensationKrw: 500_000_000, // explicit 5억 eviction
        },
        customHardCosts: {
          demolitionKrw: 300_000_000, // explicit 3억 demolition
        },
      });

      expect(budget.tiers.tier1Land.evictionCompensationKrw).toBe(500_000_000);
      expect(budget.tiers.tier2HardCosts.demolitionKrw).toBe(300_000_000);
    });
  });

  // ==========================================================================
  // 5. Multi-Page Tenant Roster Chunking & Subtotals
  // ==========================================================================
  describe('chunkTenantRoster', () => {
    const mockTenants: InstitutionalTenantRosterItem[] = Array.from(
      { length: 26 },
      (_, idx) => ({
        floor: `${Math.floor(idx / 3) + 1}F`,
        unitNumber: `${(Math.floor(idx / 3) + 1) * 100 + (idx % 3) + 1}호`,
        tenantName: `테넌트_${idx + 1}`,
        industry: idx % 2 === 0 ? 'IT/소프트웨어' : '전문서비스',
        leasedAreaM2: 150.0,
        leasedAreaPyeong: 45.38,
        depositKrw: 50_000_000,
        monthlyRentKrw: 5_000_000,
        monthlyMaintenanceKrw: 800_000,
        leaseStartDate: '2023-01-01',
        leaseEndDate: '2027-12-31',
        renewalOption: '행사 가능',
        statutoryProtection10Y: true,
      })
    );

    it('splits 26 tenants into 3 chunks with 12 items limit', async () => {
      const chunks = chunkTenantRoster(mockTenants, 12);

      expect(chunks).toHaveLength(3);

      expect(chunks[0].pageIndex).toBe(1);
      expect(chunks[0].totalPages).toBe(3);
      expect(chunks[0].isFirstPage).toBe(true);
      expect(chunks[0].isLastPage).toBe(false);
      expect(chunks[0].items).toHaveLength(12);
      expect(chunks[0].grandTotal).toBeUndefined();

      expect(chunks[1].pageIndex).toBe(2);
      expect(chunks[1].totalPages).toBe(3);
      expect(chunks[1].items).toHaveLength(12);
      expect(chunks[1].grandTotal).toBeUndefined();

      expect(chunks[2].pageIndex).toBe(3);
      expect(chunks[2].totalPages).toBe(3);
      expect(chunks[2].isFirstPage).toBe(false);
      expect(chunks[2].isLastPage).toBe(true);
      expect(chunks[2].items).toHaveLength(2);
      expect(chunks[2].grandTotal).toBeDefined();
    });

    it('verifies running subtotals sum up exactly to the grand total on the final page', async () => {
      const chunks = chunkTenantRoster(mockTenants, 12);
      const grandTotal = chunks[2].grandTotal!;

      const sumMonthlyRent = chunks.reduce(
        (sum, chunk) => sum + chunk.subtotal.monthlyRentKrw,
        0
      );
      const sumDeposit = chunks.reduce(
        (sum, chunk) => sum + chunk.subtotal.depositKrw,
        0
      );
      const sumAreaM2 = chunks.reduce(
        (sum, chunk) => sum + chunk.subtotal.leasedAreaM2,
        0
      );
      const sumCount = chunks.reduce(
        (sum, chunk) => sum + chunk.subtotal.tenantCount,
        0
      );

      expect(sumMonthlyRent).toBe(grandTotal.monthlyRentKrw);
      expect(sumDeposit).toBe(grandTotal.depositKrw);
      expect(Number(sumAreaM2.toFixed(2))).toBe(grandTotal.leasedAreaM2);
      expect(sumCount).toBe(26);
      expect(grandTotal.tenantCount).toBe(26);
    });

    it('handles empty tenant list gracefully', async () => {
      const chunks = chunkTenantRoster([]);
      expect(chunks).toHaveLength(1);
      expect(chunks[0].items).toHaveLength(0);
      expect(chunks[0].subtotal.monthlyRentKrw).toBe(0);
      expect(chunks[0].grandTotal?.tenantCount).toBe(0);
    });
  });

  // ==========================================================================
  // 6. WALE Calculation Engine
  // ==========================================================================
  describe('calculateProWALE', () => {
    const asOfDate = '2026-01-01';
    const sampleRoster: InstitutionalTenantRosterItem[] = [
      {
        floor: '1F',
        unitNumber: '101호',
        tenantName: '앵커 리테일',
        industry: 'F&B',
        leasedAreaM2: 300,
        leasedAreaPyeong: 90.75,
        depositKrw: 300_000_000,
        monthlyRentKrw: 20_000_000,
        monthlyMaintenanceKrw: 2_000_000,
        leaseStartDate: '2023-01-01',
        leaseEndDate: '2029-12-31', // 4 years remaining
        statutoryProtection10Y: true,
      },
      {
        floor: '2F',
        unitNumber: '201호',
        tenantName: '스타트업 A',
        industry: 'IT',
        leasedAreaM2: 100,
        leasedAreaPyeong: 30.25,
        depositKrw: 50_000_000,
        monthlyRentKrw: 5_000_000,
        monthlyMaintenanceKrw: 500_000,
        leaseStartDate: '2024-01-01',
        leaseEndDate: '2026-06-30', // ~0.5 years remaining (within 12m)
        statutoryProtection10Y: true,
      },
      {
        floor: '3F',
        unitNumber: '301호',
        tenantName: '오피스 B',
        industry: '금융',
        leasedAreaM2: 200,
        leasedAreaPyeong: 60.5,
        depositKrw: 100_000_000,
        monthlyRentKrw: 10_000_000,
        monthlyMaintenanceKrw: 1_000_000,
        leaseStartDate: '2024-01-01',
        leaseEndDate: '2027-12-31', // 2 years remaining (within 24m)
        statutoryProtection10Y: true,
      },
    ];

    it('accurately computes rent-weighted and area-weighted WALE', async () => {
      const wale = calculateProWALE(sampleRoster, asOfDate);

      expect(wale.waleByRentYears).toBeGreaterThan(2.0);
      expect(wale.waleByRentYears).toBeLessThan(4.0);
      expect(wale.waleByAreaYears).toBeGreaterThan(2.0);
      expect(wale.totalMonthlyRentKrw).toBe(35_000_000);
      expect(wale.totalAnnualRentKrw).toBe(420_000_000);
      expect(wale.totalDepositKrw).toBe(450_000_000);
      expect(wale.totalLeasedAreaM2).toBe(600);
      expect(wale.activeTenantCount).toBe(3);
    });

    it('correctly calculates 12-month and 24-month lease expiry risk percentages', async () => {
      const wale = calculateProWALE(sampleRoster, asOfDate);

      // Only StartUp A (5M) expires within 12 months: 5M / 35M = 14.29%
      expect(wale.expiringWithin12mPct).toBe(14.29);

      // StartUp A (5M) + Office B (10M) expire within 24 months: 15M / 35M = 42.86%
      expect(wale.expiringWithin24mPct).toBe(42.86);
    });

    it('handles empty or expired leases without throwing or returning NaN', async () => {
      const emptyWale = calculateProWALE([], asOfDate);
      expect(emptyWale.waleByRentYears).toBe(0);
      expect(emptyWale.waleByAreaYears).toBe(0);
      expect(emptyWale.expiringWithin12mPct).toBe(0);
      expect(emptyWale.averageRentPerPyeongKrw).toBe(0);

      const expiredRoster: InstitutionalTenantRosterItem[] = [
        {
          floor: 'B1',
          unitNumber: 'B101',
          tenantName: '과거 임차인',
          industry: '창고',
          leasedAreaM2: 50,
          leasedAreaPyeong: 15,
          depositKrw: 10_000_000,
          monthlyRentKrw: 1_000_000,
          monthlyMaintenanceKrw: 100_000,
          leaseStartDate: '2020-01-01',
          leaseEndDate: '2024-12-31', // Expired before 2026
          statutoryProtection10Y: false,
        },
      ];
      const expiredWale = calculateProWALE(expiredRoster, asOfDate);
      expect(expiredWale.waleByRentYears).toBe(0);
      expect(expiredWale.activeTenantCount).toBe(0);
    });
  });

  // ==========================================================================
  // 7. SSoT Mathematical Consistency Gate
  // ==========================================================================
  describe('validateProImFinancialConsistency', () => {
    const perfectInput: ProImFinancialConsistencyInput = {
      executiveSummary: {
        askingPriceKrw: 60_000_000_000, // 600억
        year1NoiKrw: 2_700_000_000, // 27억
        initialCapRatePct: 4.5, // 27억 / 600억 = 4.50%
        totalAnnualRentKrw: 3_200_000_000, // 32억
        totalDepositKrw: 3_500_000_000, // 35억
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

    it('passes 100% with 0 discrepancy when executive and detail schedules match exactly', async () => {
      const result = validateProImFinancialConsistency(perfectInput);

      expect(result.passed).toBe(true);
      expect(result.discrepancyCount).toBe(0);
      expect(result.checks).toHaveLength(6);
      result.checks.forEach((chk) => {
        expect(chk.passed).toBe(true);
        expect(chk.discrepancyKrwOrUnit).toBe(0);
      });
    });

    it('detects and fails on asking price discrepancy', async () => {
      const corruptedInput: ProImFinancialConsistencyInput = {
        ...perfectInput,
        executiveSummary: {
          ...perfectInput.executiveSummary,
          askingPriceKrw: 62_000_000_000, // 620억 vs 600억
        },
      };

      const result = validateProImFinancialConsistency(corruptedInput);
      expect(result.passed).toBe(false);
      expect(result.discrepancyCount).toBeGreaterThanOrEqual(1);

      const askingCheck = result.checks.find(
        (c) => c.checkName === 'Asking Price Consistency'
      );
      expect(askingCheck).toBeDefined();
      expect(askingCheck!.passed).toBe(false);
      expect(askingCheck!.discrepancyKrwOrUnit).toBe(2_000_000_000);
    });

    it('detects and fails on Year 1 NOI discrepancy', async () => {
      const corruptedInput: ProImFinancialConsistencyInput = {
        ...perfectInput,
        executiveSummary: {
          ...perfectInput.executiveSummary,
          year1NoiKrw: 2_500_000_000, // 25억 vs 27억
        },
      };

      const result = validateProImFinancialConsistency(corruptedInput);
      expect(result.passed).toBe(false);
      const noiCheck = result.checks.find(
        (c) => c.checkName === 'Year 1 NOI Consistency'
      );
      expect(noiCheck!.passed).toBe(false);
    });

    it('detects and fails on Initial Cap Rate formula mismatch', async () => {
      const corruptedInput: ProImFinancialConsistencyInput = {
        ...perfectInput,
        executiveSummary: {
          ...perfectInput.executiveSummary,
          initialCapRatePct: 5.5, // 5.5% vs derived 4.5%
        },
      };

      const result = validateProImFinancialConsistency(corruptedInput);
      expect(result.passed).toBe(false);
      const capCheck = result.checks.find(
        (c) => c.checkName === 'Initial Cap Rate Formula Consistency'
      );
      expect(capCheck!.passed).toBe(false);
    });

    it('detects and fails on Tenant Roster Total Rent discrepancy', async () => {
      const corruptedInput: ProImFinancialConsistencyInput = {
        ...perfectInput,
        detailSchedule: {
          ...perfectInput.detailSchedule,
          tenantRosterTotal: {
            ...perfectInput.detailSchedule.tenantRosterTotal,
            totalAnnualRent: 3_000_000_000, // 30억 vs 32억
          },
        },
      };

      const result = validateProImFinancialConsistency(corruptedInput);
      expect(result.passed).toBe(false);
      const rentCheck = result.checks.find(
        (c) => c.checkName === 'Tenant Roster vs Executive Total Rent Consistency'
      );
      expect(rentCheck!.passed).toBe(false);
    });
  });
});
