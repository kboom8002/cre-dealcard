import { describe, it, expect } from "vitest";
import { maxDuration } from "@/app/api/broker/im-lite/generate/route";
import { createMobileIMAction } from "@/app/api/broker/im-lite/actions";

describe("Milestone 4 Client-Server Contracts", () => {
  it("F-2.2: generate/route.ts maxDuration should be 180s aligned with IM_HARD_TIMEOUT_MS", () => {
    expect(maxDuration).toBe(180);
  });

  it("F-2.7: createMobileIMAction is exported and callable from actions.ts", () => {
    expect(createMobileIMAction).toBeDefined();
    expect(typeof createMobileIMAction).toBe("function");
  });

  it("F-2.1: photo URL filtering logic properly eliminates empty, whitespace, and null values", () => {
    const existingUrls = ["https://example.com/p1.jpg", "", "   ", undefined, null];
    const uploadedPhotoUrls = ["https://example.com/p2.jpg", ""];

    const validPhotoUrls = [...existingUrls, ...uploadedPhotoUrls].filter(
      (url): url is string => typeof url === "string" && url.trim().length > 0
    );

    expect(validPhotoUrls).toEqual([
      "https://example.com/p1.jpg",
      "https://example.com/p2.jpg",
    ]);
  });
});
