import { describe, it, expect, vi, beforeEach } from "vitest";
import { callLLM, registerProvider } from "./llm-client";
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
      model: "gpt-5.4",
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
      model: "gpt-5.4",
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
      model: "gpt-5.4",
    }, {
      providers: ["broken"],
      cacheKey, // 동일한 캐시 키
    });

    // 3. 실패에도 불구하고 에러가 터지지 않고 캐시로부터 정상 마스킹 복구 완료 확인!
    expect(fallbackResult.isFromCache).toBe(true);
    expect(fallbackResult.provider).toBe("openai");
    expect(fallbackResult.content).toContain("hello from openai");
  });
});
