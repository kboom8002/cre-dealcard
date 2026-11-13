// src/lib/external/land-price-api.ts
// 개별공시지가 API
// 1차: 브이월드(V-World) 토지특성속성조회 API
// 2차: data.go.kr 개별공시지가 (레거시 폴백)
import { fetchWithRetry } from './fetch-with-retry';
import { getVWorldApiKey, getVWorldReferer, getVWorldDomain } from './vworld-config';
import { createModuleLogger } from '@/lib/logger';

const logger = createModuleLogger('land-price-api');

export interface LandPriceData {
  pricePerSqm: number;        // 공시지가 (KRW/sqm)
  baseYear: string;           // 기준년도
  landCategory: string;       // 지목 (예: 대)
  landArea?: number;          // 토지면적 (㎡) — V-World 제공
  _source?: 'vworld' | 'data_go_kr';
  _isFallback?: boolean;
}

export async function fetchLandPrice(pnu: string): Promise<LandPriceData | null> {
  // ═══════════════════════════════════════════════════════════
  // 1차: 브이월드 토지특성속성조회 (getLandCharacteristics)
  // ═══════════════════════════════════════════════════════════
  const vworldKey = getVWorldApiKey();
  if (vworldKey && vworldKey !== "") {
    const currentYear = new Date().getFullYear();
    const yearsToTry = [currentYear.toString(), (currentYear - 1).toString()];

    for (const stdrYear of yearsToTry) {
      try {
        const url = `https://api.vworld.kr/ned/data/getLandCharacteristics?key=${vworldKey}&domain=${encodeURIComponent(getVWorldDomain())}&pnu=${pnu}&format=json&stdrYear=${stdrYear}&numOfRows=1&pageNo=1`;
        const res = await fetchWithRetry(url, {
          timeoutMs: 15_000,
          maxRetries: 2,
          headers: { 'Referer': getVWorldReferer() },
        });
        if (res.ok) {
          const data = await res.json();
          const items = data?.landCharacteristicss?.field;
          const item = Array.isArray(items) ? items[0] : items;

          if (item && parseFloat(item.pblntfPclnd || "0") > 0) {
            logger.info(`V-World 공시지가 조회 성공 (${stdrYear}): ${Number(item.pblntfPclnd).toLocaleString()}원/㎡ (PNU: ${pnu})`);
            return {
              pricePerSqm: parseFloat(item.pblntfPclnd),
              baseYear: item.lastUpdtDt ? String(item.lastUpdtDt).substring(0, 4) : stdrYear,
              landCategory: String(item.lndcgrCodeNm || "대"),
              landArea: item.lndpclAr ? parseFloat(item.lndpclAr) : undefined,
              _source: 'vworld',
            };
          } else {
            logger.info(`V-World 공시지가 ${stdrYear}년 데이터 없음, 이전 연도 확인 시도`);
          }
        } else {
          const body = await res.text().catch(() => '');
          logger.warn(`V-World 응답 오류 (${res.status}): ${body.slice(0, 200)}`);
        }
      } catch (err) {
        logger.warn(`V-World 호출 실패 (${stdrYear})`, { err });
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 2차: data.go.kr 개별공시지가 (레거시 폴백)
  // ═══════════════════════════════════════════════════════════
  logger.warn('data.go.kr 개별공시지가 서비스 폐기됨. V-World API 키(VWORLD_API_KEY) 설정을 권장합니다. (폴백 생략)');
  return null;
}

// ═══════════════════════════════════════════════════════════════════
// 공시지가 다년도(10년) 추이 조회
// ═══════════════════════════════════════════════════════════════════

export interface LandPriceHistoryItem {
  year: string;
  pricePerSqm: number;
}

export interface LandPriceHistoryResult {
  history: LandPriceHistoryItem[];
  /** 연평균 복리 성장률 (%) */
  cagrPct: number | null;
  /** 누적 상승률 (%) */
  totalGrowthPct: number | null;
  /** 최신 공시지가 (원/㎡) */
  latestPricePerSqm: number;
  /** 최초 조회 연도 공시지가 (원/㎡) */
  oldestPricePerSqm: number;
}

/**
 * PNU 기반 개별공시지가 다년도 추이 조회 (V-World API).
 * 최근 N년간 연도별 공시지가를 병렬 조회하여 CAGR과 누적 상승률을 산출합니다.
 *
 * @param pnu - 19자리 필지고유번호
 * @param years - 조회 기간 (기본 10년)
 * @returns 연도별 공시지가 배열 + CAGR + 누적 상승률 (데이터 부족 시 null)
 */
export async function fetchLandPriceHistory(
  pnu: string,
  years: number = 10,
): Promise<LandPriceHistoryResult | null> {
  const vworldKey = getVWorldApiKey();
  if (!vworldKey) {
    logger.warn('[fetchLandPriceHistory] VWORLD_API_KEY 미설정 — 생략');
    return null;
  }

  const resultsByYear = new Map<string, number>();

  // ── 1차: getIndvdLandPriceAttr (단일 HTTP 요청으로 최근 10개년 일괄 취득) ──
  try {
    const attrUrl =
      `https://api.vworld.kr/ned/data/getIndvdLandPriceAttr` +
      `?key=${vworldKey}&domain=${encodeURIComponent(getVWorldDomain())}` +
      `&pnu=${pnu}&format=json&numOfRows=60&pageNo=1`;
    const attrRes = await fetchWithRetry(attrUrl, {
      timeoutMs: 8_000,
      maxRetries: 1,
      headers: { Referer: getVWorldReferer() },
    });
    if (attrRes.ok) {
      const json = await attrRes.json().catch(() => null);
      const rawFields = json?.indvdLandPrices?.field ?? json?.landCharacteristicss?.field;
      const fields = Array.isArray(rawFields) ? rawFields : rawFields ? [rawFields] : [];
      for (const f of fields) {
        const yr = String(f?.stdrYear ?? '').trim();
        const price = parseFloat(String(f?.pblntfPclnd ?? '0'));
        if (/^\d{4}$/.test(yr) && Number.isFinite(price) && price > 0) {
          const prev = resultsByYear.get(yr) ?? 0;
          if (price > prev) resultsByYear.set(yr, price);
        }
      }
    }
  } catch (err) {
    logger.warn('[fetchLandPriceHistory] getIndvdLandPriceAttr 호출 실패 (getLandCharacteristics 폴백):', { err });
  }

  // ── 2차 폴백: getLandCharacteristics 연도별 배치 조회 (1차에서 <2개년일 때만) ──
  if (resultsByYear.size < 2) {
    const currentYear = new Date().getFullYear();
    const yearRange = Array.from({ length: years }, (_, i) => currentYear - i);
    const CONCURRENCY = 5;

    for (let batch = 0; batch < yearRange.length; batch += CONCURRENCY) {
      const chunk = yearRange.slice(batch, batch + CONCURRENCY);
      const settled = await Promise.allSettled(
        chunk.map(async (yr) => {
          try {
            const url = `https://api.vworld.kr/ned/data/getLandCharacteristics?key=${vworldKey}&domain=${encodeURIComponent(getVWorldDomain())}&pnu=${pnu}&format=json&stdrYear=${yr}&numOfRows=1&pageNo=1`;
            const res = await fetchWithRetry(url, {
              timeoutMs: 10_000,
              maxRetries: 1,
              headers: { Referer: getVWorldReferer() },
            });
            if (!res.ok) return null;
            const data = await res.json();
            const items = data?.landCharacteristicss?.field;
            const item = Array.isArray(items) ? items[0] : items;
            const price = parseFloat(item?.pblntfPclnd || '0');
            if (price > 0) return { year: String(yr), pricePerSqm: price };
            return null;
          } catch {
            return null;
          }
        }),
      );
      for (const r of settled) {
        if (r.status === 'fulfilled' && r.value) {
          const prev = resultsByYear.get(r.value.year) ?? 0;
          if (r.value.pricePerSqm > prev) {
            resultsByYear.set(r.value.year, r.value.pricePerSqm);
          }
        }
      }
    }
  }

  // 연도 오름차순 정렬 후 최신 N개년 추출
  const sorted = Array.from(resultsByYear.entries())
    .map(([year, pricePerSqm]) => ({ year, pricePerSqm }))
    .sort((a, b) => Number(a.year) - Number(b.year));
  const results = sorted.slice(-Math.max(2, years));

  if (results.length < 2) {
    logger.info(`[fetchLandPriceHistory] PNU ${pnu}: 데이터 ${results.length}건 — CAGR 산출 불가`);
    return null;
  }

  const oldest = results[0];
  const latest = results[results.length - 1];
  const span = Number(latest.year) - Number(oldest.year);

  let cagrPct: number | null = null;
  let totalGrowthPct: number | null = null;

  if (span > 0 && oldest.pricePerSqm > 0) {
    cagrPct = (Math.pow(latest.pricePerSqm / oldest.pricePerSqm, 1 / span) - 1) * 100;
    cagrPct = Math.round(cagrPct * 10) / 10;
    totalGrowthPct = ((latest.pricePerSqm - oldest.pricePerSqm) / oldest.pricePerSqm) * 100;
    totalGrowthPct = Math.round(totalGrowthPct * 10) / 10;
  }

  logger.info(`[fetchLandPriceHistory] PNU ${pnu}: ${results.length}개년 조회 완료 (CAGR ${cagrPct ?? 'N/A'}%)`);

  return {
    history: results,
    cagrPct,
    totalGrowthPct,
    latestPricePerSqm: latest.pricePerSqm,
    oldestPricePerSqm: oldest.pricePerSqm,
  };
}
