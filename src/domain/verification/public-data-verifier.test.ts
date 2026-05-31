import { describe, it, expect } from "vitest";
import {
  extractAreaInSqm,
  verifyAgainstPublicData,
} from "./public-data-verifier";
import {
  resolveAddressToComponents,
} from "./address-resolver";

describe("Public Data Verifier Utilities", () => {
  describe("extractAreaInSqm", () => {
    it("should parse square meters directly", () => {
      expect(extractAreaInSqm("연면적 9917.3㎡")).toBeCloseTo(9917.3, 1);
      expect(extractAreaInSqm("1,200.50 ㎡")).toBeCloseTo(1200.5, 1);
    });

    it("should convert pyung to sqm using 3.30578 coefficient", () => {
      // 3000평 * 3.30578 = 9917.34
      expect(extractAreaInSqm("3,000평")).toBeCloseTo(9917.34, 1);
      expect(extractAreaInSqm("연면적 약 100 평형")).toBeCloseTo(330.578, 2);
    });

    it("should return null for invalid strings", () => {
      expect(extractAreaInSqm("면적 확인 필요")).toBeNull();
    });
  });

  describe("resolveAddressToComponents (fallback mode)", () => {
    // NOTE: In test environment, JUSO_CONFIRM_KEY is not set,
    // so resolveAddressToComponents falls back to hardcoded mapping.

    it("should parse Gangnam Yeoksam address via fallback", async () => {
      const comps = await resolveAddressToComponents("서울특별시 강남구 역삼동 742-1");
      expect(comps).not.toBeNull();
      expect(comps!.sigunguCd).toBe("11680");
      expect(comps!.bjdongCd).toBe("10100");
      expect(comps!.bun).toBe("742");
      expect(comps!.ji).toBe("1");
    });

    it("should parse Seocho address via fallback", async () => {
      const comps = await resolveAddressToComponents("서초동 1303-35");
      expect(comps).not.toBeNull();
      expect(comps!.sigunguCd).toBe("11650");
      expect(comps!.bjdongCd).toBe("10800");
      expect(comps!.bun).toBe("1303");
      expect(comps!.ji).toBe("35");
    });

    it("should parse Seongsu address via fallback", async () => {
      const comps = await resolveAddressToComponents("성수동 668-5");
      expect(comps).not.toBeNull();
      expect(comps!.sigunguCd).toBe("11200");
      expect(comps!.bjdongCd).toBe("11400");
      expect(comps!.bun).toBe("668");
      expect(comps!.ji).toBe("5");
    });

    it("should return null for invalid address", async () => {
      const comps = await resolveAddressToComponents("지구 건너편 은하계");
      expect(comps).toBeNull();
    });
  });

  describe("verifyAgainstPublicData", () => {
    it("should return verified when AI and public records match", async () => {
      // 역삼동 742-1 은 모의 응답에서 '업무시설', '9917.3' ㎡ 으로 셋업됨
      const result = await verifyAgainstPublicData(
        "서울특별시 강남구 역삼동 742-1",
        "오피스빌딩", // ASSET_TYPE_MAP에 '업무시설' 허용
        "3,000평",    // 3000평 * 3.30578 = 9917.34 -> 오차율 0%로 통과
      );

      expect(result.status).toBe("verified");
      expect(result.checks.buildingExists).toBe(true);
      expect(result.checks.purposeMatch).toBe(true);
      expect(result.checks.areaWithinRange).toBe(true);
      // 확장 필드 검증
      expect(result.details.govtFloors).toBe(15);
      expect(result.details.govtBuildYear).toBe(2015);
      expect(result.details.govtStructure).toBe("철근콘크리트구조");
    });

    it("should return mismatch when asset_type is completely different", async () => {
      const result = await verifyAgainstPublicData(
        "서울특별시 강남구 역삼동 742-1",
        "물류",      // 대장 주용도 '업무시설' ↔ 물류 용도 미매칭
        "3,000평",
      );

      expect(result.status).toBe("mismatch");
      expect(result.checks.purposeMatch).toBe(false);
      expect(result.checks.areaWithinRange).toBe(true); // 면적은 일치
    });

    it("should return mismatch when total floor area is out of 30% range", async () => {
      const result = await verifyAgainstPublicData(
        "서울특별시 강남구 역삼동 742-1",
        "오피스빌딩",
        "100평",      // 100평 * 3.30578 = 330.5 ㎡ ↔ 9917.3 ㎡ (오차율 96%)
      );

      expect(result.status).toBe("mismatch");
      expect(result.checks.purposeMatch).toBe(true); // 용도는 일치
      expect(result.checks.areaWithinRange).toBe(false);
    });

    it("should return not_found for non-existent address", async () => {
      const result = await verifyAgainstPublicData(
        "서울특별시 강남구 역삼동 999-99", // 모의 응답에서 false 반환
        "오피스빌딩",
        "3,000평",
      );

      expect(result.status).toBe("not_found");
      expect(result.checks.buildingExists).toBe(false);
    });

    it("should include resolvedComponents in result", async () => {
      const result = await verifyAgainstPublicData(
        "서울특별시 강남구 역삼동 742-1",
        "오피스빌딩",
        "3,000평",
      );

      expect(result.resolvedComponents).not.toBeNull();
      expect(result.resolvedComponents!.sigunguCd).toBe("11680");
    });
  });
});
