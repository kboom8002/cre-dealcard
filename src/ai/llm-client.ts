import type { LLMProvider, LLMChatParams, LLMChatResult } from "./providers/types";
import { OpenAIProvider } from "./providers/openai";
import { MockOpenAIProvider } from "./providers/mock-openai";

const providerRegistry = new Map<string, LLMProvider>();

// 기본 OpenAI 제공자 등록 (환경 변수 및 테스트 모드에 따라 Mock 또는 실물 등록)
const hasOpenAiKey = !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== "mock_key";
const isTestEnv = process.env.NODE_ENV === "test";

if (!hasOpenAiKey || isTestEnv) {
  providerRegistry.set("openai", new MockOpenAIProvider());
} else {
  try {
    providerRegistry.set("openai", new OpenAIProvider());
  } catch (err) {
    console.warn("[llm-client] Failed to initialize OpenAIProvider, falling back to Mock:", err);
    providerRegistry.set("openai", new MockOpenAIProvider());
  }
}

// 추가 제공자 등록용 헬퍼
export function registerProvider(name: string, provider: LLMProvider) {
  providerRegistry.set(name, provider);
}

// 최대 회복탄력성을 위한 단순 인메모리 프롬프트 캐시 스토리지
const inMemoryLlmCache = new Map<string, LLMChatResult>();

export interface CallLLMOptions {
  providers?: string[];             // fallback chain order (e.g. ['openai', 'google'])
  cacheKey?: string;               // 캐시 저장 및 복구에 사용할 고유 키
  timeoutMs?: number;              // 개별 호출 제한 시간
}

export async function callLLM(
  params: LLMChatParams,
  options: CallLLMOptions = {},
): Promise<LLMChatResult & { isFromCache?: boolean }> {
  // 기본 폴백 순서 설정
  const chain = options.providers ?? ["openai"];
  
  let lastError: any = null;

  for (const providerName of chain) {
    const provider = providerRegistry.get(providerName);
    if (!provider) continue;
    
    try {
      // AbortController를 이용해 타임아웃 제한
      const controller = new AbortController();
      const timeoutMs = options.timeoutMs ?? 30000;
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const result = await provider.chat({
        ...params,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      
      // 호출 성공 시 캐시 키가 주어졌다면 인메모리 캐시에 적재
      if (options.cacheKey) {
        inMemoryLlmCache.set(options.cacheKey, result);
      }
      
      return result;
    } catch (err: any) {
      console.warn(`[callLLM] Provider '${providerName}' failed:`, err.message ?? err);
      lastError = err;
      continue; // 다음 제공자로 폴백 진행
    }
  }

  // 모든 제공자 호출에 실패했을 때, 캐시 키가 있다면 메모리 캐시에서 복원 시도 (안티프래질 폴백)
  if (options.cacheKey) {
    const cachedResult = inMemoryLlmCache.get(options.cacheKey);
    if (cachedResult) {
      console.warn(`[callLLM] All providers failed. Restored successful response from in-memory cache for key: ${options.cacheKey}`);
      return {
        ...cachedResult,
        isFromCache: true
      };
    }
  }

  throw new Error(
    `All LLM providers [${chain.join(", ")}] failed to respond. Last error: ${lastError?.message ?? lastError}`
  );
}

export async function embedText(text: string): Promise<number[]> {
  const provider = providerRegistry.get("openai");
  if (provider && provider.embed) {
    return provider.embed(text);
  }
  if (process.env.NODE_ENV === "test") {
    return new Array(1536).fill(0.1);
  }
  throw new Error("No embedding provider registered");
}

