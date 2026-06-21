/**
 * src/domain/building/mobile-im/__tests__/semantic-prompt-cache.test.ts
 * 시맨틱 프롬프트 캐시 단위 테스트
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { promptCache } from "@/lib/cache/semantic-prompt-cache";

describe("Semantic Prompt Cache", () => {
  beforeEach(() => {
    // 각 테스트 전에 캐시 초기화 (내부 Map 접근 불가하므로 새 인스턴스 사용)
    // 여기서는 기존 인스턴스의 메서드를 테스트
  });

  it("should generate deterministic keys for same input", () => {
    const key1 = promptCache.generateKey("property_overview", { a: 1, b: 2 });
    const key2 = promptCache.generateKey("property_overview", { a: 1, b: 2 });
    expect(key1).toBe(key2);
  });

  it("should generate different keys for different sections", () => {
    const key1 = promptCache.generateKey("property_overview", { a: 1 });
    const key2 = promptCache.generateKey("income_analysis", { a: 1 });
    expect(key1).not.toBe(key2);
  });

  it("should generate different keys for different data", () => {
    const key1 = promptCache.generateKey("property_overview", { a: 1 });
    const key2 = promptCache.generateKey("property_overview", { a: 2 });
    expect(key1).not.toBe(key2);
  });

  it("should return null for cache miss", async () => {
    const result = await promptCache.get("nonexistent_key");
    expect(result).toBeNull();
  });

  it("should set and get a cached value", async () => {
    const key = promptCache.generateKey("test_section", { x: 99 });
    await promptCache.set(key, "cached AI response", 3600);
    const result = await promptCache.get(key);
    expect(result).toBe("cached AI response");
  });

  it("should expire entries after TTL", async () => {
    const key = promptCache.generateKey("expire_test", { y: 42 });
    // Set with 0-second TTL → already expired
    await promptCache.set(key, "short-lived", 0);
    // Wait a tiny bit
    await new Promise(r => setTimeout(r, 5));
    const result = await promptCache.get(key);
    expect(result).toBeNull();
  });

  it("should invalidate by section pattern", async () => {
    const key1 = promptCache.generateKey("section_a", { z: 1 });
    const key2 = promptCache.generateKey("section_a", { z: 2 });
    const key3 = promptCache.generateKey("section_b", { z: 3 });

    await promptCache.set(key1, "v1", 3600);
    await promptCache.set(key2, "v2", 3600);
    await promptCache.set(key3, "v3", 3600);

    await promptCache.invalidateBySection("section_a");

    expect(await promptCache.get(key1)).toBeNull();
    expect(await promptCache.get(key2)).toBeNull();
    expect(await promptCache.get(key3)).toBe("v3"); // section_b는 유지
  });
});
