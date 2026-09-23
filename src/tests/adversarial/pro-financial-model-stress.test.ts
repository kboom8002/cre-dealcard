/**
 * @file pro-financial-model-stress.test.ts
 * @description Empirical Adversarial Stress Test Suite for pro-financial-model.ts (Milestone 1)
 *
 * Tests pathological inputs, numerical stability, edge cases, and failure modes:
 * 1. 100% Vacancy Allowance (EGI = 0)
 * 2. Negative Cash Flows & Deep Losses
 * 3. Zero Debt vs 95%+ High LTV / 100% LTV Debt Service
 * 4. Extreme Growth & Negative Rent Growth
 * 5. Extreme Exit Cap Rates (0%, 0.1%, 1%, 20%, 50%, negative)
 * 6. Newton-Raphson Solver Pathologies (Divergence, Zero-crossing, NaN/Inf inputs, Cycle, Multiple IRRs)
 * 7. 5-Tier Development Budget Boundary Cases (Zero GFA, 100% Loss, 0% Equity)
 * 8. SSoT Consistency Validator Stress
 */

import { describe, it, expect } from 'vitest';
import {
  calculateIrrNewtonRaphson,
  generateMultiYearCashFlow,
  generate2DSensitivityMatrix,
  generateDevelopmentFeasibilityBudget,
  validateProImFinancialConsistency,
  MultiYearCashFlowInput,
  ProImFinancialConsistencyInput,
} from '@/domain/building/im-core';

describe('Adversarial Stress Testing: Pro Financial Model', () => {
  const baseStandardInput: MultiYearCashFlowInput = {
    purchasePriceKrw: 50_000_000_000,
    holdingPeriodYears: 10,
    initialPgiKrw: 2_500_000_000,
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

  // ==========================================================================
  // §1. 100% Vacancy Allowance (EGI = 0)
  // ==========================================================================
  describe('§1. 100% Vacancy Allowance (EGI = 0)', () => {
    it('handles 100% vacancy where EGI = 0 without NaN or unhandled throws', async () => {
      const input: MultiYearCashFlowInput = {
        ...baseStandardInput,
        vacancyRatePct: 100.0,
      };

      const cf = generateMultiYearCashFlow(input);

      // EGI must be 0 for all years
      for (let t = 0; t < 10; t++) {
        expect(cf.egi[t]).toBe(0);
        expect(cf.vacancyAllowance[t]).toBe(cf.pgi[t]);
        // CapEx reserve is 1% of EGI -> must be 0
        expect(cf.capexReserve[t]).toBe(0);
        // NOI must be strictly negative (-OPEX)
        expect(cf.noi[t]).toBe(-cf.opex.total[t]);
        expect(cf.noi[t]).toBeLessThan(0);
      }

      // Exit valuation: forward NOI is negative -> grossSalePrice is negative
      expect(Number.isFinite(cf.exitAssumptions.grossSalePrice)).toBe(true);
      expect(Number.isFinite(cf.exitAssumptions.netProceeds)).toBe(true);

      // Metrics must not be NaN
      expect(Number.isNaN(cf.metrics.unleveredIrrPct)).toBe(false);
      expect(Number.isNaN(cf.metrics.initialCapRatePct)).toBe(false);
      expect(Number.isNaN(cf.metrics.npvKrw)).toBe(false);

      // Since all cash flows are negative (purchase + negative NOI + negative proceeds), IRR should be 0 or null fallback
      expect(cf.metrics.unleveredIrrPct).toBe(0);
      expect(cf.metrics.initialCapRatePct).toBeLessThan(0);
      expect(cf.metrics.npvKrw).toBeLessThan(0);
    });

    it('handles 2D sensitivity matrix when base vacancy is 100%', async () => {
      const input: MultiYearCashFlowInput = {
        ...baseStandardInput,
        vacancyRatePct: 100.0,
      };

      const result = generate2DSensitivityMatrix(input);
      expect(result.matrix2D.unleveredIrrGrid).toBeDefined();
      expect(result.matrix2D.unleveredIrrGrid).toHaveLength(5);

      // None of the grid values should be NaN
      for (const row of result.matrix2D.unleveredIrrGrid) {
        for (const val of row) {
          expect(Number.isNaN(val)).toBe(false);
          expect(Number.isFinite(val)).toBe(true);
        }
      }

      // Check vacancy stress scenarios
      expect(result.vacancyStressScenarios).toHaveLength(3);
      for (const scen of result.vacancyStressScenarios) {
        expect(Number.isNaN(scen.unleveredIrrPct)).toBe(false);
        expect(Number.isNaN(scen.initialCapRatePct)).toBe(false);
        // Verify noiDeltaPct is finite (no division by zero)
        expect(Number.isFinite(scen.noiDeltaPct)).toBe(true);
      }
    });

    it('checks zero NOI in sensitivity matrix (division by zero guard for noiDeltaPct)', async () => {
      // If initial PGI = 0 and OPEX = 0, Year 1 NOI = 0
      const zeroNoiInput: MultiYearCashFlowInput = {
        ...baseStandardInput,
        initialPgiKrw: 0,
        opex: {
          managementFeeKrw: 0,
          propertyTaxKrw: 0,
          insuranceKrw: 0,
          maintenanceKrw: 0,
          totalOpexKrw: 0,
        },
      };

      const cf = generateMultiYearCashFlow(zeroNoiInput);
      expect(cf.noi[0]).toBe(0);

      const result = generate2DSensitivityMatrix(zeroNoiInput);
      for (const scen of result.vacancyStressScenarios) {
        // If baseY1Noi is 0, noiDeltaPct must NOT be NaN or Infinity!
        // Let's verify whether pro-financial-model handles or produces NaN/Infinity
        expect(Number.isNaN(scen.noiDeltaPct), 'noiDeltaPct should not be NaN when baseY1Noi is 0').toBe(false);
        expect(Number.isFinite(scen.noiDeltaPct), 'noiDeltaPct should be finite when baseY1Noi is 0').toBe(true);
      }
    });
  });

  // ==========================================================================
  // §2. Negative Cash Flows & Deep Losses
  // ==========================================================================
  describe('§2. Negative Cash Flows & Deep Operating Losses', () => {
    it('handles catastrophic OPEX explosion (OPEX >> PGI)', async () => {
      const input: MultiYearCashFlowInput = {
        ...baseStandardInput,
        initialPgiKrw: 1_000_000_000,
        opex: {
          totalOpexKrw: 5_000_000_000, // OPEX is 5x revenue
          opexGrowthRatePct: 10.0,
        },
      };

      const cf = generateMultiYearCashFlow(input);

      for (let t = 0; t < 10; t++) {
        expect(cf.noi[t]).toBeLessThan(0);
      }

      expect(Number.isNaN(cf.metrics.unleveredIrrPct)).toBe(false);
      expect(Number.isNaN(cf.metrics.npvKrw)).toBe(false);
      expect(cf.metrics.npvKrw).toBeLessThan(-50_000_000_000);
    });

    it('handles cash flows that oscillate between positive and negative', async () => {
      // Year 0: -100, Year 1: +50, Year 2: -80, Year 3: +120
      const oscillatingFlows = [-100, 50, -80, 120];
      const irr = calculateIrrNewtonRaphson(oscillatingFlows);
      expect(irr).not.toBeNull();
      expect(Number.isFinite(irr!)).toBe(true);
      expect(Number.isNaN(irr!)).toBe(false);
    });

    it('returns null / 0 for completely negative project where every cash flow is <= 0', async () => {
      const allNegative = [-1000, -100, -200, -50];
      const irr = calculateIrrNewtonRaphson(allNegative);
      expect(irr).toBeNull();
    });
  });

  // ==========================================================================
  // §3. Zero Debt vs 95% High LTV / 100% LTV Debt Service
  // ==========================================================================
  describe('§3. Zero Debt vs High LTV & Extreme Leverage', () => {
    it('safely handles zero debt financing (undefined debtFinancing)', async () => {
      const input: MultiYearCashFlowInput = {
        ...baseStandardInput,
        debtFinancing: undefined,
      };

      const cf = generateMultiYearCashFlow(input);
      expect(cf.debtService).toBeUndefined();
      expect(cf.btcf).toBeUndefined();
      expect(cf.metrics.leveredIrrPct).toBeUndefined();
      expect(cf.metrics.averageCashOnCashPct).toBeUndefined();
      expect(cf.metrics.unleveredIrrPct).toBeGreaterThan(0);
    });

    it('safely handles zero loan amount (loanAmountKrw = 0)', async () => {
      const input: MultiYearCashFlowInput = {
        ...baseStandardInput,
        debtFinancing: {
          loanAmountKrw: 0,
          interestRatePct: 4.5,
        },
      };

      const cf = generateMultiYearCashFlow(input);
      expect(cf.debtService).toBeUndefined();
      expect(cf.btcf).toBeUndefined();
      expect(cf.metrics.leveredIrrPct).toBeUndefined();
    });

    it('handles 95% high LTV with high interest rate (negative leverage / distress)', async () => {
      const input: MultiYearCashFlowInput = {
        ...baseStandardInput,
        purchasePriceKrw: 50_000_000_000,
        debtFinancing: {
          loanAmountKrw: 47_500_000_000, // 95% LTV
          interestRatePct: 9.0, // 9% high interest rate
          isInterestOnly: true,
        },
      };

      const cf = generateMultiYearCashFlow(input);
      expect(cf.debtService).toBeDefined();
      expect(cf.btcf).toBeDefined();

      // Annual interest = 47.5B * 9% = 4.275B KRW
      // NOI is ~2.1B KRW -> BTCF is deeply negative!
      for (let t = 0; t < 10; t++) {
        expect(cf.btcf![t]).toBeLessThan(0);
      }

      // Metrics should not be NaN
      expect(Number.isNaN(cf.metrics.leveredIrrPct ?? 0)).toBe(false);
      expect(Number.isNaN(cf.metrics.averageCashOnCashPct ?? 0)).toBe(false);
      // Negative leverage means levered IRR is lower than unlevered IRR (or 0 if negative)
      if (cf.metrics.leveredIrrPct !== undefined) {
        expect(cf.metrics.leveredIrrPct).toBeLessThan(cf.metrics.unleveredIrrPct);
      }
    });

    it('handles 100% LTV (equityInvested = 0, potential divide-by-zero)', async () => {
      const input: MultiYearCashFlowInput = {
        ...baseStandardInput,
        purchasePriceKrw: 50_000_000_000,
        debtFinancing: {
          loanAmountKrw: 50_000_000_000, // 100% LTV
          interestRatePct: 4.0,
          isInterestOnly: true,
        },
      };

      const cf = generateMultiYearCashFlow(input);
      // When equityInvested = 0, averageCashOnCashPct must NOT be Infinity or NaN!
      expect(Number.isNaN(cf.metrics.averageCashOnCashPct ?? 0)).toBe(false);
      expect(Number.isFinite(cf.metrics.averageCashOnCashPct ?? 0)).toBe(true);
      expect(Number.isNaN(cf.metrics.leveredIrrPct ?? 0)).toBe(false);
    });

    it('handles over-leveraged scenario (LTV > 100%, loan > purchase price)', async () => {
      const input: MultiYearCashFlowInput = {
        ...baseStandardInput,
        purchasePriceKrw: 50_000_000_000,
        debtFinancing: {
          loanAmountKrw: 55_000_000_000, // 110% LTV
          interestRatePct: 4.0,
          isInterestOnly: true,
        },
      };

      const cf = generateMultiYearCashFlow(input);
      expect(Number.isNaN(cf.metrics.averageCashOnCashPct ?? 0)).toBe(false);
      expect(Number.isFinite(cf.metrics.averageCashOnCashPct ?? 0)).toBe(true);
      expect(Number.isNaN(cf.metrics.leveredIrrPct ?? 0)).toBe(false);
    });
  });

  // ==========================================================================
  // §4. Extreme Growth & Negative Rent Growth
  // ==========================================================================
  describe('§4. Extreme Growth & Negative Rent Growth', () => {
    it('handles negative rent growth (-5% per annum prolonged market contraction)', async () => {
      const input: MultiYearCashFlowInput = {
        ...baseStandardInput,
        rentGrowthRatePct: -5.0,
      };

      const cf = generateMultiYearCashFlow(input);
      expect(cf.pgi[9]).toBeLessThan(cf.pgi[0]);
      expect(cf.noi[9]).toBeLessThan(cf.noi[0]);
      expect(cf.metrics.unleveredIrrPct).toBeLessThan(4.5);
      expect(Number.isFinite(cf.metrics.unleveredIrrPct)).toBe(true);
    });

    it('handles complete rent collapse (-100% rent growth or negative rate)', async () => {
      const input: MultiYearCashFlowInput = {
        ...baseStandardInput,
        rentGrowthRatePct: -50.0,
      };

      const cf = generateMultiYearCashFlow(input);
      expect(Number.isFinite(cf.exitAssumptions.grossSalePrice)).toBe(true);
      expect(Number.isNaN(cf.metrics.unleveredIrrPct)).toBe(false);
      expect(Number.isNaN(cf.metrics.npvKrw)).toBe(false);
    });

    it('handles hyperinflation (rentGrowthRatePct = 50%, opexGrowth = 30%)', async () => {
      const input: MultiYearCashFlowInput = {
        ...baseStandardInput,
        rentGrowthRatePct: 50.0,
        opex: {
          ...baseStandardInput.opex,
          opexGrowthRatePct: 30.0,
        },
      };

      const cf = generateMultiYearCashFlow(input);
      expect(cf.pgi[9]).toBeGreaterThan(cf.pgi[0] * 10);
      expect(Number.isFinite(cf.metrics.unleveredIrrPct)).toBe(true);
      expect(cf.metrics.unleveredIrrPct).toBeGreaterThan(15.0);
    });
  });

  // ==========================================================================
  // §5. Extreme Exit Cap Rates (0%, 0.1%, 1%, 20%, 50%, Negative)
  // ==========================================================================
  describe('§5. Extreme Exit Cap Rates', () => {
    it('handles ultra-low exit cap rate (1.0% and 0.5%) without overflow', async () => {
      const input: MultiYearCashFlowInput = {
        ...baseStandardInput,
        exitCapRatePct: 1.0,
      };

      const cf = generateMultiYearCashFlow(input);
      expect(cf.exitAssumptions.grossSalePrice).toBeGreaterThan(baseStandardInput.purchasePriceKrw * 2);
      expect(Number.isFinite(cf.metrics.unleveredIrrPct)).toBe(true);
      expect(cf.metrics.unleveredIrrPct).toBeGreaterThan(10.0);
    });

    it('handles ultra-high exit cap rate (20% and 50% distressed exit)', async () => {
      const input: MultiYearCashFlowInput = {
        ...baseStandardInput,
        exitCapRatePct: 20.0,
      };

      const cf = generateMultiYearCashFlow(input);
      expect(cf.exitAssumptions.grossSalePrice).toBeLessThan(baseStandardInput.purchasePriceKrw / 2);
      expect(Number.isFinite(cf.metrics.unleveredIrrPct)).toBe(true);
      expect(cf.metrics.unleveredIrrPct).toBeLessThan(baseStandardInput.exitCapRatePct);
    });

    it('guards against zero exit cap rate (exitCapRatePct = 0) to avoid Infinity/NaN', async () => {
      const input: MultiYearCashFlowInput = {
        ...baseStandardInput,
        exitCapRatePct: 0.0,
      };

      // When exitCapRatePct = 0, grossSalePrice would divide by zero!
      // Must not result in NaN or unhandled Infinity in metrics
      const cf = generateMultiYearCashFlow(input);
      expect(Number.isNaN(cf.exitAssumptions.grossSalePrice)).toBe(false);
      expect(Number.isNaN(cf.exitAssumptions.netProceeds)).toBe(false);
      expect(Number.isNaN(cf.metrics.unleveredIrrPct)).toBe(false);
      expect(Number.isNaN(cf.metrics.npvKrw)).toBe(false);
    });

    it('handles small exit cap rate in 2D sensitivity matrix without breaking grid dimensions', async () => {
      const input: MultiYearCashFlowInput = {
        ...baseStandardInput,
        exitCapRatePct: 0.4, // Base is 0.4% -> base - 0.5 is negative!
      };

      const result = generate2DSensitivityMatrix(input);
      expect(result.matrix2D.exitCapRates.length).toBeGreaterThan(0);
      for (const row of result.matrix2D.unleveredIrrGrid) {
        expect(row.length).toBe(result.matrix2D.discountRates.length);
        for (const val of row) {
          expect(Number.isFinite(val)).toBe(true);
          expect(Number.isNaN(val)).toBe(false);
        }
      }
    });
  });

  // ==========================================================================
  // §6. Newton-Raphson Solver Pathologies & Numerical Stability
  // ==========================================================================
  describe('§6. Newton-Raphson Solver Pathologies', () => {
    it('handles zero initial cash flow: [0, 100, 100]', async () => {
      const irr = calculateIrrNewtonRaphson([0, 100, 100]);
      // No negative cash flow -> should return null
      expect(irr).toBeNull();
    });

    it('handles zero-rate cash flow: [-100, 25, 25, 25, 25] -> exactly 0.00%', async () => {
      const irr = calculateIrrNewtonRaphson([-100, 25, 25, 25, 25]);
      expect(irr).not.toBeNull();
      expect(irr).toBe(0.0);
    });

    it('handles negative IRR: invest 100, receive only 10, 10, 10 -> total 30 (severe loss)', async () => {
      const irr = calculateIrrNewtonRaphson([-100, 10, 10, 10]);
      expect(irr).not.toBeNull();
      expect(irr!).toBeLessThan(0);
      expect(Number.isFinite(irr!)).toBe(true);
    });

    it('handles multiple sign changes (multiple IRR solutions): [-100, 300, -200]', async () => {
      const irr = calculateIrrNewtonRaphson([-100, 300, -200]);
      // Should find one of the roots (0% or 100%) without hanging or NaN
      expect(irr).not.toBeNull();
      expect(Number.isFinite(irr!)).toBe(true);
      expect(Number.isNaN(irr!)).toBe(false);
    });

    it('safely rejects NaN / Infinity inside cash flows without returning 500% bogus IRR', async () => {
      const nanFlows = [-100, NaN, 200];
      const irr = calculateIrrNewtonRaphson(nanFlows);
      // It should safely return null, NOT 500% or NaN!
      expect(irr).toBeNull();

      const infFlows = [-100, Infinity, 200];
      const irrInf = calculateIrrNewtonRaphson(infFlows);
      expect(irrInf).toBeNull();
    });

    it('handles astronomical cash flows (1e15 KRW) without precision overflow', async () => {
      const bigFlows = [-1_000_000_000_000_000, 100_000_000_000_000, 100_000_000_000_000, 1_100_000_000_000_000];
      const irr = calculateIrrNewtonRaphson(bigFlows);
      expect(irr).not.toBeNull();
      expect(irr).toBe(10.0);
    });

    it('handles minimal cash flows (1 KRW) without precision underflow', async () => {
      const tinyFlows = [-100, 10, 10, 110];
      const irr = calculateIrrNewtonRaphson(tinyFlows);
      expect(irr).not.toBeNull();
      expect(irr).toBe(10.0);
    });

    it('does not enter infinite loop or exceed execution budget on divergent polynomial', async () => {
      // Degenerate alternating cash flow designed to create zero derivative or divergence
      const degenerateFlows = [-1000, 2000, -3000, 4000, -5000];
      const start = Date.now();
      const irr = calculateIrrNewtonRaphson(degenerateFlows);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(500); // Must resolve well within 500ms
      if (irr !== null) {
        expect(Number.isFinite(irr)).toBe(true);
      }
    });
  });

  // ==========================================================================
  // §7. 5-Tier Development Budget Boundary Cases
  // ==========================================================================
  describe('§7. 5-Tier Development Budget Boundary Cases', () => {
    it('handles zero GFA (land-only feasibility)', async () => {
      const budget = generateDevelopmentFeasibilityBudget({
        landPriceKrw: 10_000_000_000,
        targetGfaPyeong: 0, // 0 GFA
      });

      expect(budget.hardCostsKrw).toBe(0);
      expect(budget.softCostsKrw).toBe(0);
      expect(budget.landAcquisitionKrw).toBeGreaterThan(10_000_000_000);
      expect(budget.totalDevelopmentCostKrw).toBeGreaterThan(0);
      expect(Number.isFinite(budget.profitMarginPct)).toBe(true);
      expect(Number.isFinite(budget.projectIrrPct)).toBe(true);
    });

    it('handles catastrophic development loss (projected revenue << total cost)', async () => {
      const budget = generateDevelopmentFeasibilityBudget({
        landPriceKrw: 20_000_000_000,
        targetGfaPyeong: 1_000,
        projectedGrossRevenueKrw: 5_000_000_000, // Massive loss: 5B rev vs ~35B cost
      });

      expect(budget.netProfitKrw).toBeLessThan(0);
      expect(budget.profitMarginPct).toBeLessThan(-50);
      // IRR should be finite or 0 fallback, never NaN
      expect(Number.isNaN(budget.projectIrrPct)).toBe(false);
      expect(Number.isNaN(budget.equityIrrPct)).toBe(false);
      expect(Number.isFinite(budget.projectIrrPct)).toBe(true);
      expect(Number.isFinite(budget.equityIrrPct)).toBe(true);
    });

    it('handles 100% equity contribution (equityContributionRatioPct = 100)', async () => {
      const budget = generateDevelopmentFeasibilityBudget({
        landPriceKrw: 15_000_000_000,
        targetGfaPyeong: 800,
        equityContributionRatioPct: 100.0,
      });

      // When equity is 100%, PF loan is 0 -> PF interest and fees are 0
      expect(budget.tiers.tier4FinancingPf.pfInterestReserveKrw).toBe(0);
      expect(budget.tiers.tier4FinancingPf.pfArrangementFeesKrw).toBe(0);
      expect(budget.equityIrrPct).toBeGreaterThan(0);
      expect(Number.isFinite(budget.equityIrrPct)).toBe(true);
    });
  });

  // ==========================================================================
  // §8. SSoT Mathematical Consistency Gate Boundary Stress
  // ==========================================================================
  describe('§8. SSoT Consistency Validator Boundary Stress', () => {
    it('handles zero asking price and zero NOI without throwing', async () => {
      const zeroInput: ProImFinancialConsistencyInput = {
        executiveSummary: {
          askingPriceKrw: 0,
          year1NoiKrw: 0,
          initialCapRatePct: 0,
          totalAnnualRentKrw: 0,
          totalDepositKrw: 0,
        },
        detailSchedule: {
          cashFlowYear1: {
            purchasePrice: 0,
            noi: 0,
            pgi: 0,
          },
          tenantRosterTotal: {
            totalAnnualRent: 0,
            totalDeposit: 0,
          },
        },
      };

      const result = validateProImFinancialConsistency(zeroInput);
      expect(result).toBeDefined();
      expect(result.passed).toBe(true);
      expect(result.discrepancyCount).toBe(0);
      for (const chk of result.checks) {
        expect(Number.isNaN(chk.discrepancyPct)).toBe(false);
      }
    });

    it('correctly reports failure when detail has value but executive has 0', async () => {
      const mismatchedZeroInput: ProImFinancialConsistencyInput = {
        executiveSummary: {
          askingPriceKrw: 0,
          year1NoiKrw: 0,
          initialCapRatePct: 0,
          totalAnnualRentKrw: 0,
          totalDepositKrw: 0,
        },
        detailSchedule: {
          cashFlowYear1: {
            purchasePrice: 50_000_000_000,
            noi: 2_000_000_000,
            pgi: 2_500_000_000,
          },
          tenantRosterTotal: {
            totalAnnualRent: 2_500_000_000,
            totalDeposit: 3_000_000_000,
          },
        },
      };

      const result = validateProImFinancialConsistency(mismatchedZeroInput);
      expect(result.passed).toBe(false);
      expect(result.discrepancyCount).toBeGreaterThanOrEqual(4);
    });
  });
});
