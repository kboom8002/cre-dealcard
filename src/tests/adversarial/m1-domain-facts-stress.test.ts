/**
 * @file src/tests/adversarial/m1-domain-facts-stress.test.ts
 * @description Adversarial Stress & Edge Case Test Suite for Domain Facts
 *
 * Scope:
 * 1. Stress-test `m2ToPyeong`, `pyeongToM2`, and `formatPyeong`:
 *    - 0, negative values, extreme floating point numbers, NaN, ±Infinity, untyped coercions.
 * 2. Stress-test `extractRentFacts`:
 *    - Empty rent roll `[]`, null, undefined, non-array candidates.
 *    - Undefined/null properties in rent roll units (sparse objects, null fields).
 *    - Units with zero rent, negative rent, mixed signs, missing floor, missing unit/tenant.
 * 3. Verify no runtime crashes, unhandled rejections, or unexpected NaN outputs:
 *    - Check mathematical invariants across derived fields (totals, manwon conversions, occupancy rate).
 *    - End-to-end pipeline integration (`extractPureBuildingFacts` -> `buildBasicImDocument`).
 *
 * Executed empirically by m1_challenger_1.
 */

import { describe, it, expect } from "vitest";
import {
  PYEONG_RATIO,
  SQM_RATIO,
  m2ToPyeong,
  pyeongToM2,
  formatPyeong,
} from "@/domain/building/im-core/facts/area";
import {
  extractRentFacts,
  type PureRentFacts,
  type PureRentUnit,
} from "@/domain/building/im-core/facts/rent";
import { extractPureBuildingFacts } from "@/domain/building/im-core/facts";
import { buildBasicImDocument } from "@/domain/building/im-core/basic-im-document";
import { extractValuationFacts } from "@/domain/building/im-core/facts/valuation";

describe("Adversarial Domain Facts & Edge Case Stress Suite", () => {
  // ==========================================================================
  // Section 1: m2ToPyeong & Area Conversion Stress Tests
  // ==========================================================================
  describe("1. Area Conversion Invariants (m2ToPyeong, pyeongToM2, formatPyeong)", () => {
    it("handles zero input cleanly without sign errors", () => {
      expect(m2ToPyeong(0)).toBe(0);
      expect(Object.is(m2ToPyeong(0), 0) || Object.is(m2ToPyeong(0), -0)).toBe(true);
      expect(pyeongToM2(0)).toBe(0);
      expect(formatPyeong(0, 1)).toBe("0.0");
      expect(formatPyeong(0, 0)).toBe("0");
      expect(formatPyeong(0, 3)).toBe("0.000");
    });

    it("handles negative values consistently and without crashing", () => {
      expect(m2ToPyeong(-1)).toBe(-0.3025);
      expect(m2ToPyeong(-100)).toBe(-30.25);
      expect(pyeongToM2(-30.25)).toBe(-100);
      expect(formatPyeong(-100, 1)).toBe("-30.3");
      expect(formatPyeong(-1230.46, 1)).toBe("-372.2");
      expect(formatPyeong(-0.04, 1)).toBe("-0.0");
    });

    it("handles NaN predictably without throwing exceptions", () => {
      const nanResult = m2ToPyeong(NaN);
      expect(Number.isNaN(nanResult)).toBe(true);

      const pyeongNan = pyeongToM2(NaN);
      expect(Number.isNaN(pyeongNan)).toBe(true);

      // formatPyeong should produce 'NaN' string rather than crashing
      expect(formatPyeong(NaN, 1)).toBe("NaN");
    });

    it("handles Infinity and -Infinity without crashing", () => {
      expect(m2ToPyeong(Infinity)).toBe(Infinity);
      expect(m2ToPyeong(-Infinity)).toBe(-Infinity);
      expect(pyeongToM2(Infinity)).toBe(Infinity);
      expect(pyeongToM2(-Infinity)).toBe(-Infinity);
      expect(formatPyeong(Infinity, 1)).toBe("Infinity");
      expect(formatPyeong(-Infinity, 1)).toBe("-Infinity");
    });

    it("survives extreme floating point boundary conditions", () => {
      // Number.MAX_VALUE
      const maxValPyeong = m2ToPyeong(Number.MAX_VALUE);
      expect(Number.isFinite(maxValPyeong)).toBe(true);
      expect(maxValPyeong).toBeCloseTo(Number.MAX_VALUE * 0.3025);

      // Number.MIN_VALUE (denormal float)
      const minValPyeong = m2ToPyeong(Number.MIN_VALUE);
      expect(typeof minValPyeong).toBe("number");
      expect(minValPyeong).toBeGreaterThanOrEqual(0);

      // MAX_SAFE_INTEGER / MIN_SAFE_INTEGER
      expect(m2ToPyeong(Number.MAX_SAFE_INTEGER)).toBe(9007199254740991 * 0.3025);
      expect(m2ToPyeong(Number.MIN_SAFE_INTEGER)).toBe(-9007199254740991 * 0.3025);

      // Extreme positive/negative powers
      expect(m2ToPyeong(1e300)).toBe(3.025e299);
      expect(m2ToPyeong(1e-300)).toBe(3.025e-301);
      expect(m2ToPyeong(-1e300)).toBe(-3.025e299);

      // formatPyeong with very large numbers (exponential notation in toFixed)
      expect(() => formatPyeong(1e25, 1)).not.toThrow();
    });

    it("handles untyped runtime inputs gracefully", () => {
      // Coercion edge cases in JS
      expect(m2ToPyeong(null as unknown as number)).toBe(0);
      expect(Number.isNaN(m2ToPyeong(undefined as unknown as number))).toBe(true);
      expect(m2ToPyeong("100" as unknown as number)).toBe(30.25);
      expect(m2ToPyeong("" as unknown as number)).toBe(0);
      expect(Number.isNaN(m2ToPyeong("invalid" as unknown as number))).toBe(true);

      expect(formatPyeong(null as unknown as number, 1)).toBe("0.0");
      expect(formatPyeong(undefined as unknown as number, 1)).toBe("NaN");
    });
  });

  // ==========================================================================
  // Section 2: extractRentFacts with Empty Rent Roll & Missing Structures
  // ==========================================================================
  describe("2. extractRentFacts — Empty Rent Roll & Missing Structures", () => {
    it("handles completely empty inputs ({}, null, undefined) without throwing", () => {
      const inputs = [{}, null as unknown as Record<string, any>, undefined as unknown as Record<string, any>];
      for (const input of inputs) {
        let facts: PureRentFacts | undefined;
        expect(() => {
          facts = extractRentFacts(input);
        }).not.toThrow();

        expect(facts).toBeDefined();
        expect(facts!.units).toEqual([]);
        expect(facts!.depositTotalKrw).toBe(0);
        expect(facts!.depositTotalManwon).toBe(0);
        expect(facts!.monthlyRentTotalKrw).toBe(0);
        expect(facts!.monthlyRentTotalManwon).toBe(0);
        expect(facts!.annualRentKrw).toBe(0);
        expect(facts!.maintenanceFeeMonthlyKrw).toBe(0);
        expect(facts!.unitCount).toBe(1);
        expect(facts!.occupiedCount).toBe(0);
        expect(facts!.vacantCount).toBe(1);
        expect(facts!.occupancyRatePct).toBe(0);

        // Assert no NaN in any numeric property
        Object.entries(facts!).forEach(([key, val]) => {
          if (typeof val === "number") {
            expect(Number.isNaN(val), `Field ${key} should not be NaN`).toBe(false);
          }
        });
      }
    });

    it("handles all alias variations for empty rent roll array", () => {
      const aliases = [
        { rent_roll: [] },
        { body: { rent_roll: [] } },
        { rentRoll: [] },
        { body: { rentRoll: [] } },
        { units: [] },
        { body: { units: [] } },
        { layers: { lease_units: [] } },
        { ssot_summary: { rent_roll: [] } },
        { ssot_summary: { rentRoll: [] } },
      ];

      for (const item of aliases) {
        const facts = extractRentFacts(item);
        expect(facts.units).toEqual([]);
        expect(facts.unitCount).toBe(1);
        expect(facts.occupancyRatePct).toBe(0);
      }
    });

    it("handles non-array candidateUnits gracefully (string, number, boolean, object)", () => {
      const nonArrays = [
        { rent_roll: "not an array" },
        { rent_roll: 12345 },
        { rent_roll: true },
        { rent_roll: { 0: { floor: "1F" } } },
      ];

      for (const item of nonArrays) {
        const facts = extractRentFacts(item);
        expect(facts.units).toEqual([]);
        expect(facts.depositTotalKrw).toBe(0);
        expect(facts.monthlyRentTotalKrw).toBe(0);
      }
    });

    it("falls back to summary totals when rent roll is empty, preserving totals and calculating occupancy", () => {
      const facts = extractRentFacts({
        rent_roll: [],
        monthly_rent_total_krw: 12_000_000,
        deposit_total_krw: 200_000_000,
        maintenance_fee_monthly_krw: 1_200_000,
        ssot_summary: {
          unit_count: 5,
          occupied_units: 4,
        },
      });

      expect(facts.units).toEqual([]);
      expect(facts.monthlyRentTotalKrw).toBe(12_000_000);
      expect(facts.monthlyRentTotalManwon).toBe(1200);
      expect(facts.depositTotalKrw).toBe(200_000_000);
      expect(facts.depositTotalManwon).toBe(20000);
      expect(facts.maintenanceFeeMonthlyKrw).toBe(1_200_000);
      expect(facts.annualRentKrw).toBe(144_000_000);
      expect(facts.unitCount).toBe(5);
      expect(facts.occupiedCount).toBe(4);
      expect(facts.vacantCount).toBe(1);
      expect(facts.occupancyRatePct).toBe(80); // (4 / 5) * 100 = 80%
    });

    it("handles manwon summary totals fallback correctly", () => {
      const facts = extractRentFacts({
        monthly_rent_total_manwon: 850,
        deposit_total_manwon: 15000,
      });

      expect(facts.monthlyRentTotalKrw).toBe(8_500_000);
      expect(facts.monthlyRentTotalManwon).toBe(850);
      expect(facts.depositTotalKrw).toBe(150_000_000);
      expect(facts.depositTotalManwon).toBe(15000);
      expect(facts.annualRentKrw).toBe(102_000_000);
    });
  });

  // ==========================================================================
  // Section 3: extractRentFacts with Undefined/Null Properties in Units
  // ==========================================================================
  describe("3. extractRentFacts — Undefined and Null Unit Properties", () => {
    it("handles unit objects with all properties undefined/missing ({})", () => {
      const facts = extractRentFacts({
        rent_roll: [{}],
      });

      expect(facts.units).toHaveLength(1);
      const unit = facts.units[0];
      expect(unit.floor).toBe("1F");
      expect(unit.tenantName).toBe("임차인 미상");
      expect(unit.rentKrw).toBe(0);
      expect(unit.depositKrw).toBe(0);
      expect(unit.maintenanceFeeKrw).toBe(0);
      expect(unit.areaSqm).toBeUndefined();
      expect(unit.status).toBe("occupied");
      expect(unit.expiryDate).toBeUndefined();

      expect(facts.unitCount).toBe(1);
      expect(facts.occupiedCount).toBe(1);
      expect(facts.vacantCount).toBe(0);
      expect(facts.occupancyRatePct).toBe(100);
      expect(facts.monthlyRentTotalKrw).toBe(0);
      expect(facts.depositTotalKrw).toBe(0);
    });

    it("handles unit objects with explicit null values for every property", () => {
      const facts = extractRentFacts({
        rent_roll: [
          {
            floor: null,
            tenant_name: null,
            rent_krw: null,
            rent_manwon: null,
            deposit_krw: null,
            deposit_manwon: null,
            maintenance_fee_krw: null,
            area_sqm: null,
            status: null,
            expiry_date: null,
          },
        ],
      });

      expect(facts.units).toHaveLength(1);
      const unit = facts.units[0];
      expect(unit.floor).toBe("1F");
      expect(unit.tenantName).toBe("임차인 미상");
      expect(unit.rentKrw).toBe(0);
      expect(unit.depositKrw).toBe(0);
      expect(unit.maintenanceFeeKrw).toBe(0);
      expect(unit.areaSqm).toBeUndefined();
      expect(unit.status).toBe("occupied");
      expect(unit.expiryDate).toBeUndefined();

      expect(facts.monthlyRentTotalKrw).toBe(0);
      expect(facts.depositTotalKrw).toBe(0);
      expect(facts.occupancyRatePct).toBe(100);
    });

    it("handles multiple units with mixed null/undefined fields across multiple floors", () => {
      const facts = extractRentFacts({
        rent_roll: [
          { floor: "B1", status: "vacant", rent_krw: null, deposit_krw: null },
          { floor: null, tenant_name: "스타벅스", rent_manwon: 1500, deposit_manwon: 10000 },
          { floor: "2F", use: "의원", rent_krw: 3_000_000, deposit_krw: 50_000_000 },
          { floor: "", status: "owner" },
        ],
      });

      expect(facts.units).toHaveLength(4);

      // Unit 0: B1 vacant
      expect(facts.units[0].floor).toBe("B1");
      expect(facts.units[0].tenantName).toBe("공실");
      expect(facts.units[0].status).toBe("vacant");
      expect(facts.units[0].rentKrw).toBe(0);
      expect(facts.units[0].depositKrw).toBe(0);

      // Unit 1: Missing floor (defaults to 2F since idx=1), tenant Starbucks
      expect(facts.units[1].floor).toBe("2F");
      expect(facts.units[1].tenantName).toBe("스타벅스");
      expect(facts.units[1].rentKrw).toBe(15_000_000);
      expect(facts.units[1].depositKrw).toBe(100_000_000);

      // Unit 2: 2F clinic
      expect(facts.units[2].floor).toBe("2F");
      expect(facts.units[2].tenantName).toBe("의원");
      expect(facts.units[2].rentKrw).toBe(3_000_000);
      expect(facts.units[2].depositKrw).toBe(50_000_000);

      // Unit 3: Empty string floor (defaults to 4F), owner
      expect(facts.units[3].floor).toBe("4F");
      expect(facts.units[3].status).toBe("owner");
      expect(facts.units[3].rentKrw).toBe(0);

      // Aggregates: occupiedCount counts only status === 'occupied'
      // Non-occupied (vacant + owner) increment vacantCount to preserve invariant unitCount = occupied + vacant
      expect(facts.unitCount).toBe(4);
      expect(facts.occupiedCount).toBe(2); // 스타벅스 & 의원
      expect(facts.vacantCount).toBe(2); // B1 (vacant) + 4F (owner)
      expect(facts.monthlyRentTotalKrw).toBe(18_000_000);
      expect(facts.depositTotalKrw).toBe(150_000_000);
      expect(facts.annualRentKrw).toBe(216_000_000);
      expect(facts.occupancyRatePct).toBe(50); // 2 / 4 = 50%
    });

    it("evaluates behavior on null or undefined array elements", () => {
      // Testing if raw candidate units with null elements throw or need defense
      let errorThrown = false;
      try {
        extractRentFacts({ rent_roll: [null as any] });
      } catch (e) {
        errorThrown = true;
      }
      // Empirical verification: Passing [null] throws TypeError because extractRentFacts accesses u.rent_krw directly
      expect(errorThrown).toBe(true);
    });

    it("evaluates behavior on string inputs with commas vs clean numeric strings", () => {
      // Clean numeric strings: auto-coerced cleanly
      const cleanFacts = extractRentFacts({
        rent_roll: [{ floor: "1F", rent_manwon: "1500", deposit_manwon: "10000", status: "occupied" }],
      });
      expect(cleanFacts.monthlyRentTotalKrw).toBe(15_000_000);
      expect(cleanFacts.depositTotalKrw).toBe(100_000_000);
      expect(Number.isNaN(cleanFacts.monthlyRentTotalKrw)).toBe(false);

      // Strings with Korean formatting commas (e.g. '1,500'): Number('1,500') results in NaN in standard JS
      const commaFacts = extractRentFacts({
        rent_roll: [{ floor: "1F", rent_manwon: "1,500", deposit_manwon: "10,000", status: "occupied" }],
      });
      // Empirical verification: Number('1,500') produces NaN
      expect(Number.isNaN(commaFacts.monthlyRentTotalKrw)).toBe(true);
    });

    it("survives primitives passed directly as raw (number, string, boolean)", () => {
      const primitives = [123, "arbitrary-string", false, true, Symbol("test")];
      for (const prim of primitives) {
        let facts: PureRentFacts | undefined;
        expect(() => {
          facts = extractRentFacts(prim as any);
        }).not.toThrow();
        expect(facts).toBeDefined();
        expect(facts!.units).toEqual([]);
        expect(Number.isNaN(facts!.monthlyRentTotalKrw)).toBe(false);
      }
    });
  });

  // ==========================================================================
  // Section 4: Zero Rent, Negative Rent & Boundary Values
  // ==========================================================================
  describe("4. extractRentFacts — Zero Rent, Negative Rent & Boundary Numbers", () => {
    it("handles zero rent units correctly (e.g. rent-free or owner)", () => {
      const facts = extractRentFacts({
        rent_roll: [
          { floor: "1F", tenant_name: "임대중 (렌트프리)", rent_krw: 0, deposit_krw: 50_000_000, status: "occupied" },
          { floor: "2F", tenant_name: "자영업 사옥", rent_krw: 0, deposit_krw: 0, status: "owner" },
          { floor: "3F", rent_krw: 0, deposit_krw: 0, status: "vacant" },
        ],
      });

      expect(facts.unitCount).toBe(3);
      expect(facts.occupiedCount).toBe(1);
      expect(facts.vacantCount).toBe(2); // owner + vacant
      expect(facts.monthlyRentTotalKrw).toBe(0);
      expect(facts.monthlyRentTotalManwon).toBe(0);
      expect(facts.annualRentKrw).toBe(0);
      expect(facts.depositTotalKrw).toBe(50_000_000);
      expect(facts.depositTotalManwon).toBe(5000);
      expect(facts.occupancyRatePct).toBe(33.3); // Math.round((1/3)*1000)/10 = 33.3%
    });

    it("handles negative rent values (concessions / adjustments) without runtime crashes", () => {
      const facts = extractRentFacts({
        rent_roll: [
          { floor: "1F", tenant_name: "주요 임차인", rent_krw: 5_000_000, deposit_krw: 50_000_000, status: "occupied" },
          { floor: "2F", tenant_name: "관리 보조 지원", rent_krw: -500_000, deposit_krw: 0, status: "occupied" },
        ],
      });

      expect(facts.unitCount).toBe(2);
      expect(facts.occupiedCount).toBe(2);
      expect(facts.monthlyRentTotalKrw).toBe(4_500_000);
      expect(facts.monthlyRentTotalManwon).toBe(450);
      expect(facts.annualRentKrw).toBe(54_000_000);
      expect(facts.depositTotalKrw).toBe(50_000_000);
      expect(facts.occupancyRatePct).toBe(100);
    });

    it("handles net negative monthly rent totals without NaN", () => {
      const facts = extractRentFacts({
        rent_roll: [
          { floor: "1F", tenant_name: "보조 임차인", rent_krw: -1_000_000, deposit_krw: 10_000_000, status: "occupied" },
        ],
      });

      expect(facts.monthlyRentTotalKrw).toBe(-1_000_000);
      expect(facts.monthlyRentTotalManwon).toBe(-100);
      expect(facts.annualRentKrw).toBe(-12_000_000);
      expect(facts.depositTotalKrw).toBe(10_000_000);
      expect(facts.depositTotalManwon).toBe(1000);
      expect(facts.occupancyRatePct).toBe(100);
    });

    it("handles large integers and floating-point rents cleanly", () => {
      const facts = extractRentFacts({
        rent_roll: [
          { floor: "1F", rent_krw: 1234567.89, deposit_krw: 987654321.11, status: "occupied" },
        ],
      });

      expect(facts.monthlyRentTotalKrw).toBe(1234567.89);
      expect(facts.monthlyRentTotalManwon).toBe(123); // Math.round(1234567.89 / 10000)
      expect(facts.depositTotalKrw).toBe(987654321.11);
      expect(facts.depositTotalManwon).toBe(98765);
      expect(facts.annualRentKrw).toBeCloseTo(1234567.89 * 12, 2);
    });

    it("handles areaSqm zero, negative, and extreme values cleanly", () => {
      const facts = extractRentFacts({
        rent_roll: [
          { floor: "1F", area_sqm: 0 },
          { floor: "2F", area_sqm: -100 },
          { floor: "3F", areaSqm: "250.5" },
        ],
      });

      // areaSqm <= 0 is filtered to undefined per extractRentFacts line 106
      expect(facts.units[0].areaSqm).toBeUndefined();
      expect(facts.units[1].areaSqm).toBeUndefined();
      expect(facts.units[2].areaSqm).toBe(250.5);
    });
  });

  // ==========================================================================
  // Section 5: End-to-End Pipeline Integration & Valuation Safety
  // ==========================================================================
  describe("5. End-to-End Pipeline Integration & Valuation Safety", () => {
    it("extractPureBuildingFacts produces fully valid structure with empty rent roll", () => {
      const raw = {
        title: "스트레스 테스트 빌딩",
        address: "서울특별시 강남구 역삼동 123-45",
        asking_price_manwon: 500000,
        rent_roll: [],
      };

      const buildingFacts = extractPureBuildingFacts(raw);
      expect(buildingFacts.rent.units).toEqual([]);
      expect(buildingFacts.rent.unitCount).toBe(1);
      expect(buildingFacts.rent.occupancyRatePct).toBe(0);
      expect(buildingFacts.rent.monthlyRentTotalKrw).toBe(0);

      // Verify valuation derivation with 0 rent
      expect(buildingFacts.valuation.grossYieldPct).toBe(0);
      expect(buildingFacts.valuation.capRatePct).toBe(0);
      expect(buildingFacts.valuation.netYieldPct).toBe(0);
      expect(Number.isNaN(buildingFacts.valuation.grossYieldPct)).toBe(false);
      expect(Number.isNaN(buildingFacts.valuation.capRatePct)).toBe(false);
    });

    it("buildBasicImDocument successfully binds facts with empty rent roll and zero rent", () => {
      const raw = {
        title: "임대차 공백 빌딩",
        address: "서울특별시 서초구 서초동 999",
        asking_price_manwon: 300000,
        rent_roll: [],
      };

      const buildingFacts = extractPureBuildingFacts(raw);
      const basicDoc = buildBasicImDocument(buildingFacts);

      expect(basicDoc).toBeDefined();
      expect(basicDoc.docHash).toBeDefined();
      expect(typeof basicDoc.docHash).toBe("string");
      expect(basicDoc.docHash.startsWith("sha256:")).toBe(true);
      expect(basicDoc.docHash.length).toBe(71);

      // Find Section 06: Rent Roll
      const rentSection = basicDoc.sections.find((s) => s.id === "06_rentroll");
      expect(rentSection).toBeDefined();
      expect(rentSection!.data.units).toEqual([]);
      expect(rentSection!.data.rows).toEqual([]);
      expect(rentSection!.data.monthlyRentTotalManwon).toBe(0);
      expect(rentSection!.data.depositTotalManwon).toBe(0);

      // Find Section 07: Yield & Valuation
      const yieldSection = basicDoc.sections.find((s) => s.id === "07_yield");
      expect(yieldSection).toBeDefined();
      expect(yieldSection!.data.grossYieldPct).toBe(0);
      expect(yieldSection!.data.netYieldPct).toBe(0);
      expect(yieldSection!.data.capRatePct).toBe(0);
    });

    it("extractValuationFacts survives negative rent, zero asking price, and extreme values without NaN", () => {
      // 1. Zero asking price
      const valZeroPrice = extractValuationFacts(0, 0, 0);
      expect(valZeroPrice.grossYieldPct).toBe(0);
      expect(valZeroPrice.capRatePct).toBe(0);
      expect(valZeroPrice.netYieldPct).toBe(0);
      expect(Number.isNaN(valZeroPrice.grossYieldPct)).toBe(false);

      // 2. Negative rent
      const valNegRent = extractValuationFacts(10_000_000_000, 1_000_000_000, -10_000_000);
      expect(valNegRent.grossYieldPct).toBe(0);
      expect(valNegRent.capRatePct).toBe(0);
      expect(valNegRent.netYieldPct).toBe(0);
      expect(Number.isNaN(valNegRent.grossYieldPct)).toBe(false);

      // 3. Deposit larger than asking price
      const valHugeDeposit = extractValuationFacts(5_000_000_000, 6_000_000_000, 10_000_000);
      expect(valHugeDeposit.grossYieldPct).toBeGreaterThan(0);
      expect(Number.isNaN(valHugeDeposit.grossYieldPct)).toBe(false);

      // 4. Extreme asking price
      const valHugePrice = extractValuationFacts(1e15, 1e12, 1e9);
      expect(Number.isFinite(valHugePrice.grossYieldPct)).toBe(true);
      expect(Number.isNaN(valHugePrice.grossYieldPct)).toBe(false);
    });
  });
});
