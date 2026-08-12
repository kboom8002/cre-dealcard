// src/lib/external/fetch-with-retry.ts
// data.go.kr 등 정부 API 대응 — 타임아웃 확장 + 재시도

/**
 * fetch with retry — 정부 공공데이터 API는 응답 지연이 빈번하므로
 * 타임아웃 확장 + 최대 2회 재시도 (exponential backoff) 적용.
 *
 * @param url  요청 URL
 * @param opts.timeoutMs  개별 요청 타임아웃 (기본 15초)
 * @param opts.maxRetries 최대 재시도 횟수 (기본 1회, 즉 총 2회 시도)
 * @param opts.baseDelayMs 재시도 간 기본 대기시간 (기본 1초, 2배 증가)
 */
export async function fetchWithRetry(
  url: string,
  opts: {
    timeoutMs?: number;
    maxRetries?: number;
    baseDelayMs?: number;
  } = {}
): Promise<Response> {
  const { timeoutMs = 15_000, maxRetries = 1, baseDelayMs = 1000 } = opts;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      // 4xx 클라이언트 에러는 재시도 무의미 → 즉시 반환
      if (res.status >= 400 && res.status < 500) {
        return res;
      }
      // 5xx 서버 에러는 재시도 대상
      if (res.status >= 500 && attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        console.warn(`[fetch-with-retry] ${res.status} error, retrying in ${delay}ms (${attempt + 1}/${maxRetries})`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      return res;
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // 마지막 시도면 재시도 안 함
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError!;
}
