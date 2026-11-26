import type { LLMProvider, LLMChatParams, LLMChatResult } from "./providers/types";
import { OpenAIProvider } from "./providers/openai";
import { MockOpenAIProvider } from "./providers/mock-openai";
import { RecordReplayProvider, resolveLLMMode } from "./providers/record-replay";

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('llm-client');


const providerRegistry = new Map<string, LLMProvider>();

function isTestEnvironment(): boolean {
  return process.env.NODE_ENV === "test" && process.env.FORCE_REAL_LLM !== "true";
}

export function resolveDefaultAllowMock(): boolean {
  if (process.env.NODE_ENV === "test") {
    return true;
  }
  return process.env.ALLOW_LLM_MOCK === "true";
}

// 기본 OpenAI 제공자 등록 (환경 변수 및 테스트 모드에 따라 Mock 또는 실물 등록)
const rawOpenAiKey = process.env.OPENAI_API_KEY?.trim();
const hasOpenAiKey =
  !!rawOpenAiKey &&
  rawOpenAiKey !== "mock_key" &&
  rawOpenAiKey !== "not-configured";

let openAiInitFailureReason: string | null = null;

if (!hasOpenAiKey || isTestEnvironment()) {
  if (!hasOpenAiKey) {
    openAiInitFailureReason = "OPENAI_API_KEY 미설정 또는 mock_key";
  }
  providerRegistry.set("openai", new MockOpenAIProvider());
} else {
  try {
    providerRegistry.set("openai", new OpenAIProvider());
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    openAiInitFailureReason = `OpenAIProvider 초기화 실패: ${errMsg}`;
    log.warn({ err }, "[llm-client] Failed to initialize OpenAIProvider:");
    providerRegistry.set("openai", new MockOpenAIProvider());
  }
}

// H4: LLM_MODE=record|replay 이면 녹화/재생 래퍼로 교체 (결정론적 E2E/CI). 기본 live 는 동작 변경 없음.
const llmMode = resolveLLMMode();
if (llmMode !== "live") {
  const inner = llmMode === "record" || llmMode === "record-missing" ? (providerRegistry.get("openai") ?? null) : null;
  providerRegistry.set("openai", new RecordReplayProvider(inner, llmMode));
  log.warn(`[llm-client] LLM_MODE=${llmMode} — RecordReplayProvider 활성`);
}

// 추가 제공자 등록용 헬퍼
export function registerProvider(name: string, provider: LLMProvider) {
  providerRegistry.set(name, provider);
}

// 최대 회복탄력성을 위한 인메모리 프롬프트 LRU 캐시 스토리지 (상한 200개)
export const MAX_LLM_CACHE_ENTRIES = 200;
const inMemoryLlmCache = new Map<string, LLMChatResult>();

function setLlmCacheEntry(key: string, value: LLMChatResult): void {
  if (inMemoryLlmCache.has(key)) {
    inMemoryLlmCache.delete(key);
  }
  while (inMemoryLlmCache.size >= MAX_LLM_CACHE_ENTRIES) {
    const oldestKey = inMemoryLlmCache.keys().next().value;
    if (oldestKey === undefined) break;
    inMemoryLlmCache.delete(oldestKey);
  }
  inMemoryLlmCache.set(key, value);
}

function getLlmCacheEntry(key: string): LLMChatResult | undefined {
  const cached = inMemoryLlmCache.get(key);
  if (!cached) return undefined;
  // Refresh LRU recency
  inMemoryLlmCache.delete(key);
  inMemoryLlmCache.set(key, cached);
  return cached;
}

export function getLlmCacheSize(): number {
  return inMemoryLlmCache.size;
}

export function hasLlmCacheKey(key: string): boolean {
  return inMemoryLlmCache.has(key);
}

export function clearLlmCache(): void {
  inMemoryLlmCache.clear();
}

export interface CallLLMOptions {
  providers?: string[];             // fallback chain order (e.g. ['openai', 'google'])
  cacheKey?: string;               // 캐시 저장 및 복구에 사용할 고유 키
  timeoutMs?: number;              // 개별 호출 제한 시간
  signal?: AbortSignal;            // 외부 취소 신호
  deadlineMs?: number;             // 전체 완료 데드라인 타임스탬프
  /**
   * NODE_ENV === 'test' 에서는 기본 true, 그 외 운영/개발 환경에서는 ALLOW_LLM_MOCK === 'true' 가 아니면 기본 false.
   * false이면 MockOpenAIProvider 응답(키 없음/초기화 실패/쿼터 고갈 폴백)을 차단하고 `LLMMockNotAllowedError`를 던진다.
   */
  allowMock?: boolean;
}

/** allowMock:false 인데 Mock 경로로 떨어졌을 때 던지는 오류. */
export class LLMMockNotAllowedError extends Error {
  constructor(reason: string) {
    super(`[callLLM] Mock 응답이 허용되지 않습니다 (allowMock:false): ${reason}`);
    this.name = "LLMMockNotAllowedError";
  }
}

export type CallLLMResult = LLMChatResult & { isFromCache?: boolean; isMock?: boolean };

export async function callLLM(
  params: LLMChatParams,
  options: CallLLMOptions = {},
): Promise<CallLLMResult> {
  const allowMock = options.allowMock ?? resolveDefaultAllowMock();
  const isTestEnv = isTestEnvironment();
  // 기본 폴백 순서 설정
  const chain = options.providers ?? ["openai"];
  
  let lastError: any = null;
  const startTime = Date.now();
  const overallTimeoutMs = options.timeoutMs ?? (isTestEnv ? 4000 : 120000);
  const deadline = options.deadlineMs ?? (startTime + overallTimeoutMs);

  for (const providerName of chain) {
    const provider = providerRegistry.get(providerName);
    if (!provider) continue;
    if (!allowMock && provider instanceof MockOpenAIProvider) {
      const reason = openAiInitFailureReason ?? "OPENAI_API_KEY 미설정 또는 테스트/Mock 제공자 활성";
      throw new LLMMockNotAllowedError(`provider '${providerName}' 가 Mock 입니다 (${reason})`);
    }
    
    const maxAttempts = 3; // 1 initial + 2 retries (exponential backoff: 1s, 2s)
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (options.signal?.aborted) {
        throw new Error(`[callLLM] Provider '${providerName}' call aborted by signal`);
      }
      if (Date.now() >= deadline) {
        log.warn(`[callLLM] Provider '${providerName}' deadline exceeded before attempt ${attempt + 1}`);
        break;
      }

      try {
        // AbortController를 이용해 타임아웃 제한
        const controller = new AbortController();
        const remainingForThisCall = Math.max(100, deadline - Date.now());
        const callTimeout = Math.min(options.timeoutMs ?? 120000, remainingForThisCall);

        let abortHandler: (() => void) | undefined;
        if (options.signal) {
          abortHandler = () => controller.abort();
          options.signal.addEventListener("abort", abortHandler);
        }
        const timeoutId = setTimeout(() => controller.abort(), callTimeout);

        const result = await provider.chat({
          ...params,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (abortHandler && options.signal) {
          options.signal.removeEventListener("abort", abortHandler);
        }
        
        // 호출 성공 시 캐시 키가 주어졌다면 인메모리 LRU 캐시에 적재 (최대 MAX_LLM_CACHE_ENTRIES)
        if (options.cacheKey) {
          setLlmCacheEntry(options.cacheKey, result);
        }
        
        return provider instanceof MockOpenAIProvider ? { ...result, isMock: true } : result;
      } catch (err: any) {
        lastError = err;

        // H4: 재생 모드 미스는 재시도·Mock 폴백 없이 즉시 실패 (녹화본 누락을 숨기지 않는다)
        if (err?.name === "LLMReplayMissError") throw err;
        // H4: 녹화 당시 최종 실패였던 호출은 재시도(백오프) 없이 같은 최종 처리 경로로 진행
        if (err?.name === "LLMReplayedFailure") break;

        if (options.signal?.aborted) {
          log.warn(`[callLLM] Provider '${providerName}' retry aborted by external signal`);
          break;
        }

        // 영구적인 Quota 고갈 (429 credit_balance_exhausted / insufficient_quota) 시 지연 없이 즉시 탈출
        const isPermanentQuotaError = err?.message?.includes("credit_balance_exhausted") ||
          err?.message?.includes("no credits remaining") ||
          err?.message?.includes("insufficient_quota") ||
          err?.error?.code === "credit_balance_exhausted";

        if (isPermanentQuotaError) {
          log.warn(`[callLLM] Provider '${providerName}' quota permanently exhausted. Aborting futile retries.`);
          break;
        }

        if (attempt < maxAttempts - 1) {
          const baseDelay = isTestEnv ? 50 : 1000;
          const maxDelay = isTestEnv ? 200 : 16000;
          const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);

          const now = Date.now();
          if (now + delay >= deadline) {
            log.warn(`[callLLM] Remaining time budget exhausted (${deadline - now}ms < ${delay}ms delay), aborting retries for '${providerName}'`);
            break;
          }

          log.warn(`[callLLM] Provider '${providerName}' attempt ${attempt + 1}/${maxAttempts} failed: ${err.message ?? err}. Retrying in ${delay}ms...`);
          
          await new Promise<void>((resolve) => {
            let onSleepAbort: (() => void) | undefined;
            const sleepTimer = setTimeout(() => {
              if (options.signal && onSleepAbort) {
                options.signal.removeEventListener("abort", onSleepAbort);
              }
              resolve();
            }, delay);

            if (options.signal) {
              onSleepAbort = () => {
                clearTimeout(sleepTimer);
                if (options.signal && onSleepAbort) {
                  options.signal.removeEventListener("abort", onSleepAbort);
                }
                resolve();
              };
              options.signal.addEventListener("abort", onSleepAbort);
            }
          });

          if (options.signal?.aborted) {
            break;
          }
        } else {
          log.warn({ messageerr: err.message ?? err }, `[callLLM] Provider '${providerName}' failed after ${maxAttempts} attempts:`);
        }
        continue; // 다음 시도 또는 다음 제공자로 폴백 진행
      }
    }
  }

  // 모든 제공자 호출에 실패했을 때, 캐시 키가 있다면 메모리 캐시에서 복원 시도 (안티프래질 폴백)
  if (options.cacheKey) {
    const cachedResult = getLlmCacheEntry(options.cacheKey);
    if (cachedResult) {
      log.warn(`[callLLM] All providers failed. Restored successful response from in-memory cache for key: ${options.cacheKey}`);
      return {
        ...cachedResult,
        isFromCache: true
      };
    }
  }

  // 429 Quota 고갈 또는 테스트 환경 시 MockOpenAIProvider 폴백 검사 (운영 환경에서는 allowMock 기본 false로 차단)
  const isQuotaExhausted = lastError?.message?.includes("insufficient_quota") ||
    lastError?.message?.includes("credit_balance_exhausted") ||
    lastError?.message?.includes("no credits remaining") ||
    lastError?.status === 429;

  if (isQuotaExhausted || isTestEnv) {
    if (!allowMock) {
      throw new LLMMockNotAllowedError(`모든 제공자 실패 후 Mock 폴백 차단 (quota/network/test): ${lastError?.message ?? lastError}`);
    }
    log.warn(`[callLLM] All providers failed due to quota/network. Falling back to MockOpenAIProvider: ${lastError?.message}`);
    const mockProvider = new MockOpenAIProvider();
    return { ...(await mockProvider.chat(params)), isMock: true };
  }

  throw new Error(
    `All LLM providers [${chain.join(", ")}] failed to respond. Last error: ${lastError?.message ?? lastError}`
  );
}

export async function embedText(text: string): Promise<number[]> {
  const provider = providerRegistry.get("openai");
  if (provider && provider instanceof MockOpenAIProvider && !resolveDefaultAllowMock()) {
    throw new LLMMockNotAllowedError("임베딩 제공자 'openai' 가 Mock 입니다 (OPENAI_API_KEY 미설정 또는 초기화 실패)");
  }
  if (provider && provider.embed) {
    return provider.embed(text);
  }
  if (process.env.NODE_ENV === "test") {
    return new Array(1536).fill(0.1);
  }
  throw new Error("No embedding provider registered");
}

