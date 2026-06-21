/**
 * src/domain/building/mobile-im/__tests__/wale-calculator.test.ts
 * WALE (Weighted Average Lease Expiry) 계산기 단위 테스트
 */
import { describe, it, expect } from "vitest";
import { calculateWALE, type LeaseUnit } from "../wale-calculator";

describe("WALE Calculator", () => {
  const baseDate = "2026-06-01";

  it("should return 0 for empty leases", () => {
    const result = calculateWALE([], baseDate);
    expect(result.waleByRentYears).toBe(0);
    expect(result.waleByAreaYears).toBe(0);
    expect(result.atRiskRentPct12m).toBe(0);
  });

  it("should calculate WALE correctly for single lease", () => {
    const leases: LeaseUnit[] = [
      { tenantName: "A약국", rentAmount: 500, areaSqm: 30, leaseEndDate: "2028-06-01" },
    ];
    const result = calculateWALE(leases, baseDate);
    // 2년 잔여 → WALE ≈ 2.0
    expect(result.waleByRentYears).toBeCloseTo(2.0, 0);
    expect(result.waleByAreaYears).toBeCloseTo(2.0, 0);
    expect(result.atRiskRentPct12m).toBe(0); // 12개월 이내 아님
  });

  it("should weight by rent amount correctly", () => {
    const leases: LeaseUnit[] = [
      { tenantName: "고액임차", rentAmount: 900, areaSqm: 50, leaseEndDate: "2029-06-01" }, // 3년
      { tenantName: "소액임차", rentAmount: 100, areaSqm: 50, leaseEndDate: "2027-06-01" }, // 1년
    ];
    const result = calculateWALE(leases, baseDate);
    // Rent-weighted: (900 * 3yr + 100 * 1yr) / 1000 = 2.8yr
    expect(result.waleByRentYears).toBeCloseTo(2.8, 0);
    // Area-weighted: (50 * 3yr + 50 * 1yr) / 100 = 2.0yr
    expect(result.waleByAreaYears).toBeCloseTo(2.0, 0);
  });

  it("should compute at-risk rent percentage for leases expiring within 12 months", () => {
    const leases: LeaseUnit[] = [
      { tenantName: "만기임박", rentAmount: 300, areaSqm: 30, leaseEndDate: "2027-03-01" }, // ~9m
      { tenantName: "안정임차", rentAmount: 700, areaSqm: 70, leaseEndDate: "2030-01-01" }, // ~3.5yr
    ];
    const result = calculateWALE(leases, baseDate);
    expect(result.atRiskRentPct12m).toBeCloseTo(30, 0); // 300/1000 = 30%
  });

  it("should skip already-expired leases", () => {
    const leases: LeaseUnit[] = [
      { tenantName: "만기됨", rentAmount: 500, areaSqm: 50, leaseEndDate: "2025-01-01" }, // 이미 만기
      { tenantName: "활성", rentAmount: 500, areaSqm: 50, leaseEndDate: "2028-06-01" }, // 2년
    ];
    const result = calculateWALE(leases, baseDate);
    expect(result.waleByRentYears).toBeCloseTo(2.0, 0);
  });
});
