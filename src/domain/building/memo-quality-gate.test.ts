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

  it("should pass when memo contains 3 fields (location, deal_type, numeric)", () => {
    const memo = "강남 매매 500억";
    const result = validateMemoQuality(memo);
    expect(result.pass).toBe(true);
    expect(result.score).toBe(3);
    expect(result.detectedFields).toContain("location");
    expect(result.detectedFields).toContain("numeric");
    expect(result.detectedFields).toContain("deal_type");
  });

  it("should pass when memo contains 3 fields (asset_type, deal_type, numeric)", () => {
    const memo = "오피스 임대 100평 보증금 1억";
    const result = validateMemoQuality(memo);
    expect(result.pass).toBe(true);
    expect(result.score).toBe(3);
  });

  it("should pass when memo has only 1 field (deal_type) — threshold is 1", () => {
    const memo = "급하게 매각 진행합니다. 문의주세요.";
    const result = validateMemoQuality(memo);
    expect(result.pass).toBe(true);
    expect(result.score).toBe(1);
    expect(result.detectedFields).toEqual(["deal_type"]);
  });

  it("should fail when memo is completely garbage (0 fields detected)", () => {
    const memo = "안녕하세요 반갑습니다. 테스트입니다.";
    const result = validateMemoQuality(memo);
    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
    expect(result.detectedFields).toHaveLength(0);
    expect(result.missingFields).toHaveLength(4);
    expect(result.suggestion).toContain("위치(지역명, 역명, 주소)");
  });

  it("should pass for real broker memo with address, floors, and lease info", () => {
    const memo = `* 주소 : 천안시 동남구 문화동 99-1 (천안동남구청 맞은편)
* 건물규모 : 지하2층~지상4층
* 주차대수 : 법정 21대 / 계획 30대
* 현임대상황/ 임대면적 :
 B2층 (주차장)
 B1층 (153평 소극장 임대)
 1층 (총109평 20평-약국 / 89평 공실)
 2층 (총127평 공실)
 3층 (131평 정형외과 임대)
 4층 (총131평 공실)`;
    const result = validateMemoQuality(memo);
    expect(result.pass).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(3);
    expect(result.detectedFields).toContain("location");
    expect(result.detectedFields).toContain("asset_type");
    expect(result.detectedFields).toContain("numeric");
    expect(result.detectedFields).toContain("deal_type");
  });

  it("should pass for minimal address-only memo", () => {
    const memo = "수원시 팔달구 인계동 건물 매매";
    const result = validateMemoQuality(memo);
    expect(result.pass).toBe(true);
    expect(result.detectedFields).toContain("location");
  });
});
