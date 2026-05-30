import { describe, it, expect } from "vitest";
import { maskBuildingResponse } from "./response-masker";

describe("maskBuildingResponse", () => {
  const sampleBuilding = {
    id: "bldg-123",
    area_signal: "역삼역 역세권",
    asset_type: "오피스빌딩",
    fit_summary: "공실률 낮고 안정적인 업무시설",
    deal_points: "초역세권 및 교통 우수",
    caution_points: "주차 협소",
    price_band: "300억",
    size_detail: "연면적 3,000평",
    floor_info: "지하 2층 ~ 지상 10층",
    build_year: 2015,
    seller_motivation: "급전 필요에 따른 급매",
    internal_notes: "이 건물은 소유자 대출 이자가 연체 중임",
  };

  const hiddenFields = ["price_band", "size_detail", "floor_info", "build_year", "deal_points", "caution_points"];

  it("should not mask any fields for owner and admin roles", () => {
    const ownerResult = maskBuildingResponse(sampleBuilding, hiddenFields, "owner", "none");
    expect(ownerResult.price_band).toBe("300억");
    expect(ownerResult.seller_motivation).toBe("급전 필요에 따른 급매");

    const adminResult = maskBuildingResponse(sampleBuilding, hiddenFields, "admin", "none");
    expect(adminResult.price_band).toBe("300억");
    expect(adminResult.seller_motivation).toBe("급전 필요에 따른 급매");
  });

  it("should mask hidden fields and completely delete ALWAYS_MASKED fields for generic broker at level none", () => {
    const result = maskBuildingResponse(sampleBuilding, hiddenFields, "broker", "none");
    
    // 공개 필드
    expect(result.area_signal).toBe("역삼역 역세권");
    expect(result.asset_type).toBe("오피스빌딩");
    expect(result.fit_summary).toBe("공실률 낮고 안정적인 업무시설");

    // 마스킹 필드
    expect(result.price_band).toBe("****");
    expect(result.size_detail).toBe("****");
    expect(result.floor_info).toBe("****");
    expect(result.deal_points).toBe("****");

    // 완전 차단 필드
    expect(result.seller_motivation).toBeUndefined();
    expect(result.internal_notes).toBeUndefined();
  });

  it("should reveal G1 fields but keep G2/G3 fields masked at gate level G1", () => {
    const result = maskBuildingResponse(sampleBuilding, hiddenFields, "broker", "G1");
    
    // G1 허용 필드
    expect(result.deal_points).toBe("초역세권 및 교통 우수");
    expect(result.price_band).toBe("300억");

    // G2 이상 필드 (마스킹 유지)
    expect(result.size_detail).toBe("****");
    expect(result.floor_info).toBe("****");
    expect(result.build_year).toBe("****");

    // 완전 차단 필드 유지
    expect(result.seller_motivation).toBeUndefined();
  });

  it("should reveal up to G2 fields at gate level G2", () => {
    const result = maskBuildingResponse(sampleBuilding, hiddenFields, "broker", "G2");
    
    expect(result.deal_points).toBe("초역세권 및 교통 우수");
    expect(result.price_band).toBe("300억");
    expect(result.size_detail).toBe("연면적 3,000평");
    expect(result.floor_info).toBe("지하 2층 ~ 지상 10층");
    expect(result.build_year).toBe(2015);

    // 완전 차단 필드 유지
    expect(result.seller_motivation).toBeUndefined();
  });

  it("should reveal all generic fields at gate level G3 but exclude ALWAYS_MASKED fields", () => {
    const result = maskBuildingResponse(sampleBuilding, hiddenFields, "broker", "G3");
    
    expect(result.deal_points).toBe("초역세권 및 교통 우수");
    expect(result.price_band).toBe("300억");
    expect(result.size_detail).toBe("연면적 3,000평");
    expect(result.floor_info).toBe("지하 2층 ~ 지상 10층");
    
    // 완전 차단 필드 유지
    expect(result.seller_motivation).toBeUndefined();
  });
});
