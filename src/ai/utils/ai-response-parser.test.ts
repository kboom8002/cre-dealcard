import { describe, it, expect } from "vitest";
import { z } from "zod";
import { extractJsonString, safeParseAIResponse } from "./ai-response-parser";

describe("extractJsonString", () => {
  it("strips markdown json fences", () => {
    const raw = "```json\n{\"key\": \"value\"}\n```";
    expect(extractJsonString(raw)).toBe("{\"key\": \"value\"}");
  });

  it("handles trailing commas", () => {
    const raw = "{\"key\": \"value\",}";
    expect(extractJsonString(raw)).toBe("{\"key\": \"value\"}");
  });

  it("handles clean json string", () => {
    const raw = "{\"key\": \"value\"}";
    expect(extractJsonString(raw)).toBe("{\"key\": \"value\"}");
  });
});

describe("safeParseAIResponse", () => {
  const TestSchema = z.object({
    title: z.string(),
    count: z.number().default(0),
  });

  it("successfully parses valid json wrapped in markdown", () => {
    const raw = "```json\n{\"title\": \"Hello\", \"count\": 5}\n```";
    const res = safeParseAIResponse(raw, TestSchema);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.title).toBe("Hello");
      expect(res.data.count).toBe(5);
    }
  });

  it("returns error on invalid json", () => {
    const raw = "Not a JSON at all";
    const res = safeParseAIResponse(raw, TestSchema);
    expect(res.success).toBe(false);
  });

  it("returns error on schema mismatch", () => {
    const raw = "{\"title\": 123}";
    const res = safeParseAIResponse(raw, TestSchema);
    expect(res.success).toBe(false);
  });
});
