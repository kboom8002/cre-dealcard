// src/lib/external/fetch-with-retry.ts
// data.go.kr 등 정부 API 대응 — 타임아웃 확장 + 재시도 + Retry-After 준수 + 즉시 Abort

import { createModuleLogger } from "@/lib/logger";

const logger = createModuleLogger("fetch-with-retry");

export interface FetchWithRetryOptions {
  timeoutMs?: number;
  maxRetries?: number;
  baseDelayMs?: number;
  deadlineMs?: number;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

function createAbortError(reason?: unknown): Error {
  if (reason instanceof Error) return reason;
  try {
    return new DOMException(
      typeof reason === "string" && reason ? reason : "The operation was aborted.",
      "AbortError",
    );
  } catch {
    const err = new Error(typeof reason === "string" && reason ? reason : "The operation was aborted.");
    err.name = "AbortError";
    return err;
  }
}

/**
 * HTTP `Retry-After` 헤더(초 단위 숫자 또는 HTTP-date 문자열)를 밀리초로 파싱합니다.
 */
export function parseRetryAfterMs(retryAfterHeader: string | null, nowMs = Date.now()): number | null {
  if (!retryAfterHeader) return null;
  const trimmed = retryAfterHeader.trim();
  if (!trimmed) return null;

  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    const seconds = Number(trimmed);
    return Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds * 1000) : null;
  }

  const parsedDateMs = Date.parse(trimmed);
  if (Number.isFinite(parsedDateMs)) {
    return Math.max(0, parsedDateMs - nowMs);
  }

  return null;
}

/**
 * 비-테스트 환경에서만 0.75x ~ 1.25x 유계 지터를 적용하여 동시 재시도 폭풍을 완화합니다.
 */
export function applyRetryJitter(delayMs: number): number {
  if (process.env.NODE_ENV === "test" || delayMs <= 0) {
    return delayMs;
  }
  return Math.round(delayMs * (0.75 + Math.random() * 0.5));
}

/**
 * 재시도 대기 중 외부 `AbortSignal`이 취소되면 타이머를 즉시 해제하고 reject합니다.
 */
export function sleepWithAbort(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(createAbortError(signal.reason));
  }
  if (delayMs <= 0) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onAbort = () => {
      if (timer !== undefined) clearTimeout(timer);
      reject(createAbortError(signal?.reason));
    };

    timer = setTimeout(() => {
      if (signal) {
        signal.removeEventListener("abort", onAbort);
      }
      resolve();
    }, delayMs);

    if (signal) {
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

function combineSignals(timeoutMs: number, externalSignal?: AbortSignal): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(Math.max(1, timeoutMs));
  if (!externalSignal) return timeoutSignal;
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([timeoutSignal, externalSignal]);
  }

  const controller = new AbortController();
  const abortFrom = (src: AbortSignal) => {
    if (!controller.signal.aborted) {
      controller.abort(src.reason);
    }
  };
  if (externalSignal.aborted) {
    abortFrom(externalSignal);
    return controller.signal;
  }
  timeoutSignal.addEventListener("abort", () => abortFrom(timeoutSignal), { once: true });
  externalSignal.addEventListener("abort", () => abortFrom(externalSignal), { once: true });
  return controller.signal;
}

/**
 * fetch with retry — 정부 공공데이터 API는 응답 지연이 빈번하므로
 * 타임아웃 확장 + 최대 재시도 (exponential backoff + 429/503 Retry-After 준수) 적용.
 */
export async function fetchWithRetry(
  url: string,
  opts: FetchWithRetryOptions = {},
): Promise<Response> {
  const {
    timeoutMs = 15_000,
    maxRetries = 1,
    baseDelayMs = 1000,
    deadlineMs,
    headers,
    signal,
  } = opts;

  const totalDeadlineMs = deadlineMs ?? timeoutMs * (maxRetries + 1) + baseDelayMs * Math.max(1, maxRetries);
  const deadlineAt = Date.now() + totalDeadlineMs;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (signal?.aborted) {
      throw createAbortError(signal.reason);
    }

    const remainingBeforeFetch = deadlineAt - Date.now();
    if (remainingBeforeFetch <= 0) {
      throw lastError ?? new Error(`Request deadline exceeded (${totalDeadlineMs}ms)`);
    }

    try {
      const attemptTimeout = Math.min(timeoutMs, remainingBeforeFetch);
      const res = await fetch(url, {
        signal: combineSignals(attemptTimeout, signal),
        headers,
      });

      // 429 Too Many Requests / 503 Service Unavailable — Retry-After 헤더 준수(남은 데드라인 상한)
      if ((res.status === 429 || res.status === 503) && attempt < maxRetries) {
        const remainingMs = deadlineAt - Date.now();
        if (remainingMs <= 0) {
          return res;
        }
        const retryAfterMs = parseRetryAfterMs(res.headers.get("Retry-After"));
        const rawDelay = retryAfterMs ?? applyRetryJitter(baseDelayMs * Math.pow(2, attempt));
        const cappedDelay = Math.max(0, Math.min(rawDelay, remainingMs));
        logger.warn(
          `${res.status} response, retrying in ${cappedDelay}ms (${attempt + 1}/${maxRetries})`,
        );
        await sleepWithAbort(cappedDelay, signal);
        continue;
      }

      // 4xx 클라이언트 에러는 재시도 무의미 → 즉시 반환
      if (res.status >= 400 && res.status < 500) {
        return res;
      }

      // 기타 5xx 서버 에러는 재시도 대상
      if (res.status >= 500 && attempt < maxRetries) {
        const remainingMs = deadlineAt - Date.now();
        if (remainingMs <= 0) {
          return res;
        }
        const jitteredBackoff = applyRetryJitter(baseDelayMs * Math.pow(2, attempt));
        const delay = Math.max(0, Math.min(jitteredBackoff, remainingMs));
        logger.warn(`${res.status} error, retrying in ${delay}ms (${attempt + 1}/${maxRetries})`);
        await sleepWithAbort(delay, signal);
        continue;
      }

      return res;
    } catch (err: unknown) {
      if (signal?.aborted) {
        throw createAbortError(signal.reason ?? err);
      }
      lastError = err instanceof Error ? err : new Error(String(err));

      // 마지막 시도면 재시도 안 함
      if (attempt < maxRetries) {
        const remainingMs = deadlineAt - Date.now();
        if (remainingMs <= 0) {
          break;
        }
        const jitteredBackoff = applyRetryJitter(baseDelayMs * Math.pow(2, attempt));
        const delay = Math.max(0, Math.min(jitteredBackoff, remainingMs));
        await sleepWithAbort(delay, signal);
      }
    }
  }

  throw lastError ?? new Error("fetchWithRetry failed");
}
