/**
 * @file src/tests/unit/magazine/wave2-remediation.test.ts
 * @description Wave 2 Remediation Unit Tests covering Challenger Findings:
 * 1. formatDealPrice string & numeric edge cases (협의, 미정, 상담, 0, negative, 억 원 suffixes)
 * 2. parseBulkLine phone-only, invalid phone digits, 3-part phone, email-only, and normal rows
 */

import { describe, it, expect } from "vitest";
import { formatDealPrice } from "@/components/magazine-editor/EditorThemeDealsTab";
import { parseBulkLine } from "@/components/magazine-editor/AddSubscriberForm";

describe("Wave 2 Remediation Unit Tests", () => {
  describe("1. formatDealPrice (EditorThemeDealsTab)", () => {
    it("handles non-numeric Korean price descriptor strings without appending 억 원", () => {
      expect(formatDealPrice("협의")).toBe("협의");
      expect(formatDealPrice("  협의  ")).toBe("협의");
      expect(formatDealPrice("미정")).toBe("미정");
      expect(formatDealPrice("상담")).toBe("상담");
      expect(formatDealPrice("가격협의")).toBe("가격협의");
    });

    it("preserves strings that already end with 억 or 원", () => {
      expect(formatDealPrice("12.5억")).toBe("12.5억");
      expect(formatDealPrice("50억")).toBe("50억");
      expect(formatDealPrice("100억 원")).toBe("100억 원");
      expect(formatDealPrice("  75억 원  ")).toBe("75억 원");
    });

    it("formats positive numeric strings < 10000 with 억 원", () => {
      expect(formatDealPrice("12.5")).toBe("12.5억 원");
      expect(formatDealPrice("50")).toBe("50억 원");
      expect(formatDealPrice("225")).toBe("225억 원");
    });

    it("formats large numeric strings (>= 10000) using 100M division or custom fmtFn", () => {
      // 20,000,000,000 (200억)
      expect(formatDealPrice("20000000000")).toBe("200.0억 원");
      expect(formatDealPrice("20000000000", (p) => `${p / 100000000}억원`)).toBe("200억원");
    });

    it("formats positive numbers cleanly", () => {
      expect(formatDealPrice(50)).toBe("50억 원");
      expect(formatDealPrice(120)).toBe("120억 원");
      expect(formatDealPrice(20000000000)).toBe("200.0억 원");
      expect(formatDealPrice(20000000000, (p) => `${p / 100000000}억원`)).toBe("200억원");
    });

    it("returns empty string for zero and negative values (consistent across string & number)", () => {
      expect(formatDealPrice(0)).toBe("");
      expect(formatDealPrice("0")).toBe("");
      expect(formatDealPrice(-5)).toBe("");
      expect(formatDealPrice("-5")).toBe("");
    });

    it("returns empty string for null, undefined, empty string, or whitespace", () => {
      expect(formatDealPrice(null)).toBe("");
      expect(formatDealPrice(undefined)).toBe("");
      expect(formatDealPrice("")).toBe("");
      expect(formatDealPrice("   ")).toBe("");
      expect(formatDealPrice({})).toBe("");
    });
  });

  describe("2. parseBulkLine (AddSubscriberForm)", () => {
    it("returns null for empty or whitespace-only lines", () => {
      expect(parseBulkLine("")).toBeNull();
      expect(parseBulkLine("   ")).toBeNull();
      expect(parseBulkLine("\t\r\n")).toBeNull();
    });

    it("parses valid multi-token lines across tabs, commas, and spaces", () => {
      const row1 = parseBulkLine("홍길동\t01012345678\thong@cre.kr");
      expect(row1).not.toBeNull();
      expect(row1?.valid).toBe(true);
      expect(row1?.name).toBe("홍길동");
      expect(row1?.phone).toBe("010-1234-5678");
      expect(row1?.email).toBe("hong@cre.kr");

      const row2 = parseBulkLine("김철수, 010-9876-5432, kim@cre.kr");
      expect(row2?.valid).toBe(true);
      expect(row2?.name).toBe("김철수");
      expect(row2?.phone).toBe("010-9876-5432");
      expect(row2?.email).toBe("kim@cre.kr");

      const row3 = parseBulkLine("박민수 010-3333-4444");
      expect(row3?.valid).toBe(true);
      expect(row3?.name).toBe("박민수");
      expect(row3?.phone).toBe("010-3333-4444");
      expect(row3?.email).toBe("");
    });

    it("reconstructs 3-part space-separated phone numbers cleanly", () => {
      const row = parseBulkLine("이영희 010 1111 2222 lee@cre.kr");
      expect(row?.valid).toBe(true);
      expect(row?.name).toBe("이영희");
      expect(row?.phone).toBe("010-1111-2222");
      expect(row?.email).toBe("lee@cre.kr");
    });

    it("does not treat phone-only lines as customer name", () => {
      const row = parseBulkLine("010-1234-5678");
      expect(row).not.toBeNull();
      expect(row?.valid).toBe(false);
      expect(row?.name).toBe("");
      expect(row?.phone).toBe("010-1234-5678");
      expect(row?.error).toContain("고객 이름을 입력해 주세요");
    });

    it("does not treat email-only lines as customer name", () => {
      const row = parseBulkLine("investor@domain.com");
      expect(row).not.toBeNull();
      expect(row?.valid).toBe(false);
      expect(row?.name).toBe("");
      expect(row?.email).toBe("investor@domain.com");
      expect(row?.error).toContain("고객 이름을 입력해 주세요");
    });

    it("rejects lines with short digit tokens that fail isPlausiblePhoneDigits", () => {
      const row = parseBulkLine("홍길동 123");
      expect(row).not.toBeNull();
      expect(row?.valid).toBe(false);
      expect(row?.name).toBe("홍길동");
      expect(row?.phone).toBe("");
      expect(row?.error).toContain("연락처");
    });

    it("rejects name-only lines with no contact info", () => {
      const row = parseBulkLine("김대표");
      expect(row).not.toBeNull();
      expect(row?.valid).toBe(false);
      expect(row?.name).toBe("김대표");
      expect(row?.phone).toBe("");
      expect(row?.email).toBe("");
      expect(row?.error).toContain("연락처");
    });
  });
});
