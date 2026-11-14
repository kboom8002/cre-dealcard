// src/lib/external/bok-ecos-api.ts
// 한국은행 ECOS 경제통계시스템 Open API — 예금은행 가중평균금리 (월간)
// 통계표: 121Y006 (예금은행 대출금리 - 신규취급액 기준), 항목: BECBLA02 (기업대출)
import { createModuleLogger } from '@/lib/logger';

const logger = createModuleLogger('bok-ecos-api');

export interface BokMonthlyLoanRatePoint {
  ym: string; // "YYYYMM"
  periodLabel: string; // 예: "26.09"
  corporateLoanRatePct: number; // 예: 4.62
}

interface CacheEntry {
  expiresAt: number;
  points: BokMonthlyLoanRatePoint[];
}

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 16;
const ecosCache = new Map<string, CacheEntry>();

function shiftYearMonth(now: Date, deltaMonths: number): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + deltaMonths, 1));
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}${m}`;
}

function formatPeriodLabel(ym: string): string {
  if (!/^\d{6}$/.test(ym)) return ym;
  return `${ym.slice(2, 4)}.${ym.slice(4, 6)}`;
}

/**
 * 한국은행 ECOS 월간 예금은행 가중평균 기업대출 금리(신규취급액 기준, 121Y006 / BECBLA02)를 조회한다.
 * - API 키 미설정·오프라인·시간초과 시 예외 없이 `[]` 반환 (호출부에서 정직한 참고치 폴백 사용)
 */
export async function fetchBokMonthlyLoanRates(
  months = 6,
): Promise<BokMonthlyLoanRatePoint[]> {
  const apiKey = (process.env.BOK_ECOS_API_KEY || process.env.BOK_API_KEY || '').trim();
  if (!apiKey) {
    return [];
  }

  const safeMonths = Math.max(2, Math.min(12, Math.floor(months)));
  const cacheKey = `121Y006:BECBLA02:${safeMonths}`;
  const nowMs = Date.now();
  const cached = ecosCache.get(cacheKey);
  if (cached && cached.expiresAt > nowMs) {
    return cached.points;
  }

  const now = new Date();
  // 한국은행 월간 금리는 전월말~익월 중순 공표 지연이 있어 +3개월 여유 구간으로 조회
  const startYm = shiftYearMonth(now, -(safeMonths + 3));
  const endYm = shiftYearMonth(now, 0);
  const url = `https://ecos.bok.or.kr/api/StatisticSearch/${encodeURIComponent(apiKey)}/json/kr/1/24/121Y006/M/${startYm}/${endYm}/BECBLA02`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      logger.warn('BOK ECOS non-OK response', { status: res.status });
      return [];
    }

    const json = (await res.json().catch(() => null)) as {
      StatisticSearch?: {
        row?: Array<{
          TIME?: string;
          DATA_VALUE?: string;
        }>;
      };
    } | null;

    const rows = json?.StatisticSearch?.row;
    if (!Array.isArray(rows) || rows.length === 0) {
      return [];
    }

    const parsed: BokMonthlyLoanRatePoint[] = [];
    for (const row of rows) {
      const ym = String(row?.TIME ?? '').trim();
      const val = parseFloat(String(row?.DATA_VALUE ?? '').trim());
      if (!/^\d{6}$/.test(ym) || !Number.isFinite(val)) continue;
      if (val < 0.5 || val > 25) continue;
      parsed.push({
        ym,
        periodLabel: formatPeriodLabel(ym),
        corporateLoanRatePct: Math.round(val * 100) / 100,
      });
    }

    parsed.sort((a, b) => a.ym.localeCompare(b.ym));
    const latest = parsed.slice(-safeMonths);

    if (ecosCache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = ecosCache.keys().next().value;
      if (oldestKey) ecosCache.delete(oldestKey);
    }
    ecosCache.set(cacheKey, { expiresAt: nowMs + CACHE_TTL_MS, points: latest });
    return latest;
  } catch (err) {
    logger.warn('BOK ECOS fetch failed', { err });
    return [];
  } finally {
    clearTimeout(timer);
  }
}
