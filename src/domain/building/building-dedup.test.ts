import { describe, it, expect } from "vitest";
import { extractJibunKey, extractJibunKeyFromBuilding } from "./building-dedup";

describe("extractJibunKey", () => {
  it("정상: 구+동+번지 패턴에서 지번 키 추출", () => {
    expect(extractJibunKey("서초구 서초동 1320-5")).toBe("서초동 1320-5");
  });

  it("정상: 지번만 있는 경우 -0 보완", () => {
    expect(extractJibunKey("강남구 역삼동 823")).toBe("역삼동 823-0");
  });

  it("엣지: 권역만 있는 경우 null 반환", () => {
    expect(extractJibunKey("서초권역")).toBeNull();
  });

  it("엣지: 빈 문자열 null 반환", () => {
    expect(extractJibunKey("")).toBeNull();
  });

  it("정상: 긴 메모 본문에서 지번 추출", () => {
    const memo = "서초구 서초동 1320-5 근생건물 매각, 80억대, 대지 120평";
    expect(extractJibunKey(memo)).toBe("서초동 1320-5");
  });
});

describe("extractJibunKeyFromBuilding", () => {
  it("raw_address 우선 추출", () => {
    const building = {
      raw_address: "서초구 서초동 1320-5",
      raw_input: "성수동 100-1 근생",
      layers: null,
      area_signal: null,
    };
    expect(extractJibunKeyFromBuilding(building)).toBe("서초동 1320-5");
  });

  it("raw_address 없으면 raw_input 폴백", () => {
    const building = {
      raw_address: null,
      raw_input: "역삼동 823 오피스 매각",
      layers: null,
      area_signal: null,
    };
    expect(extractJibunKeyFromBuilding(building)).toBe("역삼동 823-0");
  });

  it("layers.location.address 폴백", () => {
    const building = {
      raw_address: null,
      raw_input: "매각 건",
      layers: { location: { address: "잠원동 55-3" } },
      area_signal: null,
    };
    expect(extractJibunKeyFromBuilding(building)).toBe("잠원동 55-3");
  });

  it("PNU 키 반환", () => {
    const building = {
      raw_address: null,
      raw_input: null,
      layers: { pnu: "1165010200013200005" },
      area_signal: null,
    };
    expect(extractJibunKeyFromBuilding(building)).toBe("PNU:1165010200013200005");
  });

  it("모든 필드 비어있으면 null", () => {
    const building = {
      raw_address: null,
      raw_input: null,
      layers: null,
      area_signal: "서초권역",
    };
    expect(extractJibunKeyFromBuilding(building)).toBeNull();
  });
});
