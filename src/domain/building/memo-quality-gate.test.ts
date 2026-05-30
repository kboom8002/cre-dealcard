import { describe, it, expect } from "vitest";
import { validateMemoQuality } from "./memo-quality-gate";

describe("validateMemoQuality", () => {
  it("should pass when memo contains all 4 fields (perfect match)", () => {
    const memo = "역삼역 근처 오피스빌딩 매각합니다. 가격은 300억 평단가 5천만원대";
    const result = validateMemoQuality(memo);
    expect(result.pass).toBe(true);
    expect(result.score).toBe(4);
    expect(result.detectedFields).toContain("location");
    expect(result.detectedFields).toContain("asset_type");
    expect(result.detectedFields).toContain("numeric");
    expect(result.detectedFields).toContain("deal_type");
    expect(result.missingFields).toHaveLength(0);
    expect(result.suggestion).toBe("");
  });

  it("should pass when memo contains 2 fields (location and numeric)", () => {
    const memo = "강남 매매 500억";
    const result = validateMemoQuality(memo);
    expect(result.pass).toBe(true);
    expect(result.score).toBe(3); // 강남(location) + 매매(deal_type) + 500억(numeric)
    expect(result.detectedFields).toContain("location");
    expect(result.detectedFields).toContain("numeric");
    expect(result.detectedFields).toContain("deal_type");
  });

  it("should pass when memo contains 2 fields (asset_type and numeric)", () => {
    const memo = "오피스 임대 100평 보증금 1억";
    const result = validateMemoQuality(memo);
    expect(result.pass).toBe(true);
    expect(result.score).toBe(3); // 오피스(asset_type) + 임대(deal_type) + 1억/100평(numeric)
  });

  it("should fail when memo contains only 1 field (deal_type only)", () => {
    const memo = "급하게 매각 진행합니다. 문의주세요.";
    const result = validateMemoQuality(memo);
    expect(result.pass).toBe(false);
    expect(result.score).toBe(1);
    expect(result.detectedFields).toEqual(["deal_type"]);
    expect(result.missingFields).toContain("location");
    expect(result.missingFields).toContain("asset_type");
    expect(result.missingFields).toContain("numeric");
    expect(result.suggestion).toContain("위치(지역명, 역명)");
  });

  it("should fail when memo is completely garbage", () => {
    const memo = "안녕하세요 반갑습니다. 테스트입니다.";
    const result = validateMemoQuality(memo);
    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
    expect(result.detectedFields).toHaveLength(0);
    expect(result.missingFields).toHaveLength(4);
    expect(result.suggestion).toContain("위치(지역명, 역명)");
  });
});
