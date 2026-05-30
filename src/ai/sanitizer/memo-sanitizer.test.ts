import { describe, it, expect } from "vitest";
import { sanitizeMemo, desanitizeOutput } from "./memo-sanitizer";

describe("PII Memo Sanitizer", () => {
  it("should sanitize and desanitize phone numbers", () => {
    const original = "연락처는 010-1234-5678 입니다. 다른 번호는 01098765432.";
    const { sanitizedText, tokens } = sanitizeMemo(original);

    expect(sanitizedText).toContain("[PHONE_A]");
    expect(sanitizedText).toContain("[PHONE_B]");
    expect(sanitizedText).not.toContain("010-1234-5678");
    expect(sanitizedText).not.toContain("01098765432");

    const restored = desanitizeOutput(sanitizedText, { sanitizedText, tokens });
    expect(restored).toBe(original);
  });

  it("should sanitize and desanitize exact addresses (bunji)", () => {
    const original = "주소는 역삼동 742-1번지 및 서초동 12-34 입니다.";
    const { sanitizedText, tokens } = sanitizeMemo(original);

    expect(sanitizedText).toContain("[ADDR_DETAIL_A]");
    expect(sanitizedText).toContain("[ADDR_DETAIL_B]");
    expect(sanitizedText).not.toContain("742-1");
    expect(sanitizedText).not.toContain("12-34");

    const restored = desanitizeOutput(sanitizedText, { sanitizedText, tokens });
    expect(restored).toBe(original);
  });

  it("should sanitize and desanitize building names", () => {
    const original = "강남 파이낸스센터 및 스타타워 빌딩 매매 건입니다.";
    const { sanitizedText, tokens } = sanitizeMemo(original);

    expect(sanitizedText).toContain("[BLDG_NAME_A]"); // 강남 파이낸스센터
    expect(sanitizedText).toContain("[BLDG_NAME_B]"); // 스타타워 빌딩
    expect(sanitizedText).not.toContain("파이낸스센터");
    expect(sanitizedText).not.toContain("스타타워");

    const restored = desanitizeOutput(sanitizedText, { sanitizedText, tokens });
    expect(restored).toBe(original);
  });

  it("should sanitize and desanitize tenant names with explicit keywords", () => {
    const original = "임차인: 삼성SDS, 세입자 라인플러스 입주 상태.";
    const { sanitizedText, tokens } = sanitizeMemo(original);

    expect(sanitizedText).toContain("[TENANT_A]");
    expect(sanitizedText).toContain("[TENANT_B]");
    expect(sanitizedText).not.toContain("삼성SDS");
    expect(sanitizedText).not.toContain("라인플러스");

    const restored = desanitizeOutput(sanitizedText, { sanitizedText, tokens });
    expect(restored).toBe(original);
  });

  it("should sanitize and desanitize owner names with explicit keywords", () => {
    const original = "소유주: 김중개, 건물주 이철수 공동 소유.";
    const { sanitizedText, tokens } = sanitizeMemo(original);

    expect(sanitizedText).toContain("[OWNER_A]");
    expect(sanitizedText).toContain("[OWNER_B]");
    expect(sanitizedText).not.toContain("김중개");
    expect(sanitizedText).not.toContain("이철수");

    const restored = desanitizeOutput(sanitizedText, { sanitizedText, tokens });
    expect(restored).toBe(original);
  });

  it("should handle mixed complex memo safely", () => {
    const original = "역삼동 719-24번지 소재 그레이스타워 매매 건. 임차인은 현대글로비스 이며 소유주는 박영희 씨입니다. 연락처는 010-5555-6666 입니다.";
    const { sanitizedText, tokens } = sanitizeMemo(original);

    expect(sanitizedText).not.toContain("719-24");
    expect(sanitizedText).not.toContain("그레이스타워");
    expect(sanitizedText).not.toContain("현대글로비스");
    expect(sanitizedText).not.toContain("박영희");
    expect(sanitizedText).not.toContain("010-5555-6666");

    const restored = desanitizeOutput(sanitizedText, { sanitizedText, tokens });
    expect(restored).toBe(original);
  });
});
