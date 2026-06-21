import { describe, it, expect } from "vitest";
import { calculateFinancials } from "../financials";
import { calculateWACC, generateDCFSensitivity } from "../dcf-sensitivity";

describe("Financials Engine", () => {
  describe("calculateFinancials()", () => {
    it("should calculate basic financials correctly with 100% equity (no loan/deposit)", () => {
      const inputs = {
        monthlyRentKrw: 10_000_000,
        purchasePriceKrw: 3_000_000_000,
        assetType: "오피스",
        totalDepositManwon: 0,
        mgmtFeeTotalManwon: 0,
        loanAmountManwon: 0,
        totalAreaSqm: 500,
      };

      const result = calculateFinancials(inputs);
      
      // NOI: 10M * 12 * (1 - 0.05 vacancy - 0.15 opex) = 120M * 0.8 = 96M
      // Cap Rate: 96M / 3B = 3.2%
      expect(result.annualNoi.base).toBe(96_000_000);
      expect(result.capRate?.base).toBeCloseTo(3.2, 1);
      // Since equity = 3B and NOI = 96M, Leveraged Yield = 3.2%
      expect(result.leveragedYield).toBeCloseTo(3.2, 1);
    });

    it("should handle leverage (loan + deposit) properly", () => {
      const inputs = {
        monthlyRentKrw: 10_000_000, // 120M annual
        purchasePriceKrw: 3_000_000_000,
        assetType: "오피스",
        totalDepositManwon: 20_000, // 200M
        mgmtFeeTotalManwon: 0,
        loanAmountManwon: 150_000, // 1.5B
        totalAreaSqm: 500,
      };

      const result = calculateFinancials(inputs);
      
      // Debt = 1.7B, Equity = 1.3B
      // NOI = 96M
      // Leveraged Yield calculated as NOI / Equity = 96M / 1.3B = 7.38%
      expect(result.leveragedYield).toBeCloseTo(7.38, 2);
    });

    it("should clamp debtRatio when debt exceeds purchase price", () => {
      const inputs = {
        monthlyRentKrw: 10_000_000,
        purchasePriceKrw: 1_000_000_000,
        assetType: "오피스",
        totalDepositManwon: 100_000, // 1B
        mgmtFeeTotalManwon: 0,
        loanAmountManwon: 50_000, // 500M (Total Debt = 1.5B)
        totalAreaSqm: 500,
      };

      const result = calculateFinancials(inputs);
      
      // Debt ratio clamped to 1, Equity to 0
      // Leveraged Yield should be null when equity <= 0
      expect(result.leveragedYield).toBeNull();
    });
  });

  describe("calculateWACC()", () => {
    it("should return correct WACC for 0% debt", () => {
      // 100% equity (8%), 0% debt
      const wacc = calculateWACC(1, 0.08, 0, 0.05, 0.22);
      expect(wacc).toBeCloseTo(0.08, 4);
    });

    it("should return correct WACC for 50/50 capital structure", () => {
      // 50% equity (8%), 50% debt (5% before tax -> 3.9% after tax)
      // WACC = 0.5 * 8% + 0.5 * 5% * (1 - 0.22) = 4% + 1.95% = 5.95%
      const wacc = calculateWACC(0.5, 0.08, 0.5, 0.05, 0.22);
      expect(wacc).toBeCloseTo(0.0595, 4);
    });
  });

  describe("generateDCFSensitivity()", () => {
    it("should generate a 10-year DCF output with valid NPV and IRR", () => {
      const inputs = {
        purchasePriceKrw: 100_000,
        initialNoiKrw: 5_000,
        holdYears: 10,
        rentGrowthRate: 0.02,
        baseExitCapRate: 0.05,
        baseDiscountRate: 0.08,
      };

      const result = generateDCFSensitivity(inputs);

      expect(result.npvBase).toBeDefined();
      expect(result.irrBase).toBeDefined();
      if (result.irrBase) {
        expect(result.irrBase).toBeGreaterThan(0);
      }
      expect(result.sensitivityMatrix).toBeDefined();
      expect(result.sensitivityMatrix.length).toBe(9);
    });
  });
});
