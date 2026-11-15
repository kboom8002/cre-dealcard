import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  callLLM,
  registerProvider,
  LLMMockNotAllowedError,
  MAX_LLM_CACHE_ENTRIES,
  getLlmCacheSize,
  hasLlmCacheKey,
  clearLlmCache,
} from "./llm-client";
import { MockOpenAIProvider } from "./providers/mock-openai";
import type { LLMProvider, LLMChatParams, LLMChatResult } from "./providers/types";

describe("LLM Abstraction & Fallback Cache", () => {
  // 모의 제공자(Mock Provider) 등록
  const mockOpenAI: LLMProvider = {
    name: "openai",
    async chat(params: LLMChatParams): Promise<LLMChatResult> {
      return {
        content: JSON.stringify({ message: "hello from openai" }),
        tokens: 10,
        model: params.model,
        provider: "openai",
        latencyMs: 5,
      };
    }
  };

  const mockGoogle: LLMProvider = {
    name: "google",
    async chat(params: LLMChatParams): Promise<LLMChatResult> {
      return {
        content: JSON.stringify({ message: "hello from google" }),
        tokens: 15,
        model: params.model,
        provider: "google",
        latencyMs: 8,
      };
    }
  };

  beforeEach(() => {
    registerProvider("openai", mockOpenAI);
    registerProvider("google", mockGoogle);
  });

  it("should successfully call the primary provider", async () => {
    const result = await callLLM({
      systemPrompt: "sys",
      userPrompt: "user",
      model: "gpt-5.6-terra",
    }, {
      providers: ["openai"],
    });

    expect(result.provider).toBe("openai");
    expect(result.content).toContain("hello from openai");
    expect(result.isFromCache).toBeUndefined();
  });

  it("should fallback to the next provider in chain when the first fails", async () => {
    const failingProvider: LLMProvider = {
      name: "failing-one",
      async chat(): Promise<LLMChatResult> {
        throw new Error("API rate limit exceeded");
      }
    };
    registerProvider("failing-one", failingProvider);

    const result = await callLLM({
      systemPrompt: "sys",
      userPrompt: "user",
      model: "default",
    }, {
      providers: ["failing-one", "google"],
    });

    expect(result.provider).toBe("google");
    expect(result.content).toContain("hello from google");
  });

  it("should restore from in-memory cache when all providers in the chain fail", async () => {
    const cacheKey = "test_resilience_key";
    
    // 1. 성공하는 제공자로 먼저 1회 호출해 캐시 채우기
    const okResult = await callLLM({
      systemPrompt: "sys",
      userPrompt: "user",
      model: "gpt-5.6-terra",
    }, {
      providers: ["openai"],
      cacheKey,
    });
    expect(okResult.provider).toBe("openai");

    // 2. 고의로 실패하는 제공자로 구성된 체인으로 호출 수행
    const brokenProvider: LLMProvider = {
      name: "broken",
      async chat(): Promise<LLMChatResult> {
        throw new Error("Network timeout");
      }
    };
    registerProvider("broken", brokenProvider);

    const fallbackResult = await callLLM({
      systemPrompt: "sys",
      userPrompt: "user",
      model: "gpt-5.6-terra",
    }, {
      providers: ["broken"],
      cacheKey, // 동일한 캐시 키
    });

    // 3. 실패에도 불구하고 에러가 터지지 않고 캐시로부터 정상 마스킹 복구 완료 확인!
    expect(fallbackResult.isFromCache).toBe(true);
    expect(fallbackResult.provider).toBe("openai");
    expect(fallbackResult.content).toContain("hello from openai");
  });

  it("should abort immediately when AbortSignal is already aborted or triggers abort", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      callLLM(
        { systemPrompt: "sys", userPrompt: "user", model: "default" },
        { providers: ["openai"], signal: controller.signal }
      )
    ).rejects.toThrow("aborted by signal");
  });

  it("should respect deadlineMs and abort retries when deadline is exceeded", async () => {
    const slowFailingProvider: LLMProvider = {
      name: "slow-fail",
      async chat(): Promise<LLMChatResult> {
        throw new Error("Temporary 503");
      },
    };
    registerProvider("slow-fail", slowFailingProvider);

    const start = Date.now();
    await expect(
      callLLM(
        { systemPrompt: "sys", userPrompt: "user", model: "default" },
        { providers: ["slow-fail"], deadlineMs: Date.now() + 60 }
      )
    ).resolves.toBeDefined();

    const elapsed = Date.now() - start;
    // Should terminate fast around deadline instead of sleeping 5 attempts
    expect(elapsed).toBeLessThan(1500);
  });

  describe("Zero-Mock Production Default & LRU Cache Cap", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
      clearLlmCache();
    });

    it("throws LLMMockNotAllowedError by default in NODE_ENV='production' when provider is MockOpenAIProvider", async () => {
      registerProvider("openai", new MockOpenAIProvider());
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("ALLOW_LLM_MOCK", "");

      await expect(
        callLLM({
          systemPrompt: "sys",
          userPrompt: "user",
          model: "gpt-5.6-terra",
        })
      ).rejects.toBeInstanceOf(LLMMockNotAllowedError);
    });

    it("remains compatible in NODE_ENV='test' (allowMock defaults to true) unless allowMock: false", async () => {
      registerProvider("openai", new MockOpenAIProvider());
      vi.stubEnv("NODE_ENV", "test");

      const testResult = await callLLM({
        systemPrompt: "sys",
        userPrompt: "user",
        model: "gpt-5.6-terra",
      });
      expect(testResult.isMock).toBe(true);

      await expect(
        callLLM(
          { systemPrompt: "sys", userPrompt: "user", model: "gpt-5.6-terra" },
          { allowMock: false }
        )
      ).rejects.toBeInstanceOf(LLMMockNotAllowedError);
    });

    it("enforces MAX_LLM_CACHE_ENTRIES = 200 LRU cap and evicts oldest keys", async () => {
      clearLlmCache();
      expect(MAX_LLM_CACHE_ENTRIES).toBe(200);

      for (let i = 0; i < MAX_LLM_CACHE_ENTRIES + 5; i++) {
        await callLLM(
          { systemPrompt: "sys", userPrompt: `prompt_${i}`, model: "gpt-5.6-terra" },
          { providers: ["openai"], cacheKey: `lru_key_${i}` }
        );
      }

      expect(getLlmCacheSize()).toBe(MAX_LLM_CACHE_ENTRIES);
      expect(hasLlmCacheKey("lru_key_0")).toBe(false);
      expect(hasLlmCacheKey("lru_key_4")).toBe(false);
      expect(hasLlmCacheKey("lru_key_5")).toBe(true);
      expect(hasLlmCacheKey(`lru_key_${MAX_LLM_CACHE_ENTRIES + 4}`)).toBe(true);
    });
  });
});
