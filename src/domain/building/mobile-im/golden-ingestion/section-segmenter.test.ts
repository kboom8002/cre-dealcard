import { describe, it, expect, vi } from "vitest";
import { segmentDocument } from "./section-segmenter";
import type { ParsedDocument } from "./file-parser";

describe("section-segmenter (L3-06 Safe JSON Parsing)", () => {
  it("should return empty array for empty rawText", async () => {
    const doc: ParsedDocument = {
      rawText: "   ",
      pages: [{ pageNumber: 1, text: "   ", hasTable: false, hasImage: false }],
      metadata: {
        fileName: "empty.pdf",
        fileType: "pdf",
        pageCount: 1,
        extractedAt: new Date().toISOString(),
      },
    };
    const result = await segmentDocument(doc);
    expect(result).toEqual([]);
  });

  it("should gracefully fallback to single section on AI failure/JSON parse error without crashing", async () => {
    const originalKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    try {
      const doc: ParsedDocument = {
        rawText: "이 건물은 서울시 강남구에 위치한 근생 건물입니다. 대지면적 500m2, 연면적 1500m2.",
        pages: [
          {
            pageNumber: 1,
            text: "이 건물은 서울시 강남구에 위치한 근생 건물입니다. 대지면적 500m2, 연면적 1500m2.",
            hasTable: false,
            hasImage: false,
          },
        ],
        metadata: {
          fileName: "test-brochure.pdf",
          fileType: "pdf",
          pageCount: 3,
          extractedAt: new Date().toISOString(),
        },
      };

      const result = await segmentDocument(doc);
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
      expect(result[0].mappedType).toBe("property_overview");
      expect(result[0].needsReview).toBe(true);
      expect(result[0].confidence).toBe(0.3);
    } finally {
      if (originalKey) {
        process.env.OPENAI_API_KEY = originalKey;
      }
    }
  });
});
