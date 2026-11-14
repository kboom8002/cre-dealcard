// src/lib/external/real-transaction-api.ts
// 국토교통부 상업업무용 부동산 매매 신고 조회 API — 주변 실거래 비교 사례
import { fetchWithRetry } from './fetch-with-retry';
import { SQM_RATIO } from '@/lib/utils/area-conversion';
import { createModuleLogger } from '@/lib/logger';

const logger = createModuleLogger('real-transaction-api');

export interface ComparableTransaction {
  address: string;               // 주소
  dealYear: number;
  dealMonth: number;
  dealDay: number;
  dealAmount: number;            // 거래금액 (KRW)
  area: number;                  // 연면적 (sqm)
  pricePerSqm: number;           // 평방미터당 가격 (KRW)
  pricePerPyeong: number;        // 평당 가격 (KRW)
  buildingUse: string;           // 용도
  floors: number;                // 층수
  buildingType?: string;         // 일반 / 집합
  landAreaSqm?: number;          // 대지면적 (plottageAr, sqm)
  landPricePerPyeongManwon?: number; // 토지평당가 (만원/평)
  transactionType?: string;      // 매매, 전세, 월세
  _isFallback?: boolean;
}

export interface FetchComparableTransactionsOptions {
  /** 집합건물(구분상가·오피스텔 호실 등) 제외 여부 (기본값 true) */
  excludeStrata?: boolean;
}

/**
 * 국토부 상업업무용 실거래 원시 항목이 일반(통건물) 거래인지 판별합니다.
 * - buildingType === '집합' 인 구분소유 호실 제외
 * - 대지면적(plottageAr)이 없고 건물면적(buildingAr)이 66㎡ 미만인 소형 구분호실 제외
 */
export function isWholeBuildingTransactionItem(t: Record<string, unknown>): boolean {
  const bldgType = String(t.buildingType ?? '').trim();
  if (bldgType === '집합') return false;
  const plottage = parseFloat(String(t.plottageAr ?? '0')) || 0;
  const bldgAr = parseFloat(String(t.buildingAr ?? t.bldgArea ?? t.totArea ?? t.area ?? '0')) || 0;
  if (plottage <= 0 && bldgAr > 0 && bldgAr < 66) return false;
  return true;
}

export function filterWholeBuildingTransactions(items: readonly ComparableTransaction[]): ComparableTransaction[] {
  return items.filter((item) => {
    if (item.buildingType === '집합') return false;
    if ((item.landAreaSqm ?? 0) <= 0 && item.area > 0 && item.area < 66) return false;
    return true;
  });
}

/**
 * 현재 월 기준 직전 3개월 실거래 데이터를 조회합니다.
 * 국토부 API는 특정 월만 조회 가능하므로, 최근 3개월을 병렬 조회 후 병합합니다.
 */
export async function fetchComparableTransactions(
  sigunguCd: string,
  yearMonth?: string,
  opts?: FetchComparableTransactionsOptions,
): Promise<ComparableTransaction[]> {
  const apiKey = process.env.DATA_GO_KR_API_KEY;
  const excludeStrata = opts?.excludeStrata !== false;

  if (apiKey && apiKey !== "") {
    const months = yearMonth ? [yearMonth] : getRecentMonths(3);
    const allResults: ComparableTransaction[] = [];

    await Promise.all(months.map(async (ym) => {
      try {
        const url = `https://apis.data.go.kr/1613000/RTMSDataSvcNrgTrade/getRTMSDataSvcNrgTrade?ServiceKey=${encodeURIComponent(apiKey)}&LAWD_CD=${sigunguCd}&DEAL_YMD=${ym}&numOfRows=10&pageNo=1&_type=json`;
        const res = await fetchWithRetry(url, { timeoutMs: 10_000, maxRetries: 1 });
        if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
        const data = await res.json();

        const item = data?.response?.body?.items?.item;
        const itemsArray: any[] = Array.isArray(item) ? item : item ? [item] : [];

        if (itemsArray.length > 0) {
          const parsed: ComparableTransaction[] = itemsArray
            .map((t: any): ComparableTransaction | null => {
              // 해제된 거래 제외 (cdealType === 'O')
              if (String(t.cdealType || "").trim() === "O") return null;
              if (excludeStrata && !isWholeBuildingTransactionItem(t)) return null;

              const dealAmtTenThousand = parseInt(String(t.dealAmount || "0").replace(/,/g, "").trim(), 10) || 0;
              const dealAmount = dealAmtTenThousand * 10000;
              if (dealAmount <= 0) return null;

              const plottageSqm = parseFloat(String(t.plottageAr || "0"));
              const hasPlottage = Number.isFinite(plottageSqm) && plottageSqm > 0;

              // 국토부 상업업무용 API: buildingAr(건물면적) 우선, 없으면 plottageAr(대지면적)
              const rawArea = parseFloat(String(t.buildingAr || t.bldgArea || t.plottageAr || t.totArea || t.area || "0"));
              if (!rawArea || isNaN(rawArea) || rawArea <= 0) return null;

              const area = rawArea;
              const pricePerSqm = dealAmount / area;
              const pricePerPyeong = Math.round(pricePerSqm * SQM_RATIO);

              // 비정상 이상치(평당 50만원 미만 또는 평당 5억원 초과) 필터링
              if (pricePerPyeong < 500_000 || pricePerPyeong > 500_000_000) return null;

              const landPricePerPyeongManwon = hasPlottage
                ? Math.round((dealAmtTenThousand / (plottageSqm / SQM_RATIO)))
                : undefined;

              const sgg = String(t.sggNm || t.sigungu || "").trim();
              const umd = String(t.umdNm || t.dong || "").trim();
              const jibun = String(t.jibun || "").trim();
              const address = [sgg, umd, jibun].filter(Boolean).join(" ");
              const bldgType = String(t.buildingType || "").trim();

              return {
                address: address || "서울시 인근 상업용 자산",
                dealYear: parseInt(String(t.dealYear || "2025"), 10),
                dealMonth: parseInt(String(t.dealMonth || "1"), 10),
                dealDay: parseInt(String(t.dealDay || "1"), 10),
                dealAmount,
                area,
                pricePerSqm: Math.round(pricePerSqm),
                pricePerPyeong,
                buildingUse: String(t.buildingUse || "근린생활"),
                floors: parseInt(String(t.floor || t.flr || "0").trim(), 10) || 0,
                ...(bldgType ? { buildingType: bldgType } : {}),
                ...(hasPlottage ? { landAreaSqm: plottageSqm, landPricePerPyeongManwon } : {}),
                _isFallback: false
              };
            })
            .filter((item): item is ComparableTransaction => item !== null);

          allResults.push(...parsed);
        }
      } catch (err) {
        logger.warn(`API failed for ${ym}`, { err });
      }
    }));

    if (allResults.length > 0) {
      // 최신순 정렬, 최대 10건
      return allResults
        .sort((a, b) => (b.dealYear * 100 + b.dealMonth) - (a.dealYear * 100 + a.dealMonth))
        .slice(0, 10);
    }
  }

  // 실거래 데이터 없음
  return [];
}

/** 현재 월 기준 직전 N개월의 YYYYMM 배열 반환 */
function getRecentMonths(n: number): string[] {
  const result: string[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return result;
}

export interface WholeBuildingMonthlyTxItem {
  ym: string; // YYYY-MM
  dealYear: number;
  dealMonth: number;
  sigunguCode: string;
  dong: string;
  dealAmountManwon: number;
  dealAmountKrw: number;
  buildingAreaM2: number;
  landAreaM2: number;
  buildingType: string;
}

const MONTHLY_TX_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MONTHLY_TX_MAX_CACHE = 24;
const monthlyTxCache = new Map<
  string,
  { expiresAt: number; items: WholeBuildingMonthlyTxItem[] }
>();

/**
 * 월간 뉴스레터 상단 차트용 — 복수 시군구의 최근 N개월 통건물(일반) 실거래를 일괄 조회한다.
 * - 계약해제(cdealType === 'O') 및 구분상가·오피스텔 호실(buildingType === '집합') 제외
 * - 5초 타임아웃 + 6시간 메모리 LRU 캐시
 */
export async function fetchMonthlyWholeBuildingTransactions(
  sigunguCodes: readonly string[],
  months = 6,
): Promise<WholeBuildingMonthlyTxItem[]> {
  const apiKey = (process.env.DATA_GO_KR_API_KEY || process.env.MOLIT_API_KEY || '').trim();
  if (!apiKey || !Array.isArray(sigunguCodes) || sigunguCodes.length === 0) {
    return [];
  }

  const safeMonths = Math.max(2, Math.min(12, Math.floor(months)));
  const normalizedCodes = Array.from(new Set(sigunguCodes.map((c) => c.trim()).filter(Boolean))).sort();
  if (normalizedCodes.length === 0) return [];

  const cacheKey = `${normalizedCodes.join(',')}:${safeMonths}`;
  const nowMs = Date.now();
  const cached = monthlyTxCache.get(cacheKey);
  if (cached && cached.expiresAt > nowMs) {
    return cached.items;
  }

  const targetMonths = getRecentMonths(safeMonths);
  const collected: WholeBuildingMonthlyTxItem[] = [];

  await Promise.all(
    normalizedCodes.flatMap((sigunguCode) =>
      targetMonths.map(async (ym) => {
        try {
          const url = `https://apis.data.go.kr/1613000/RTMSDataSvcNrgTrade/getRTMSDataSvcNrgTrade?ServiceKey=${encodeURIComponent(apiKey)}&LAWD_CD=${encodeURIComponent(sigunguCode)}&DEAL_YMD=${ym}&numOfRows=200&pageNo=1&_type=json`;
          const res = await fetchWithRetry(url, { timeoutMs: 5000, maxRetries: 0 });
          if (!res.ok) return;
          const data = (await res.json().catch(() => null)) as {
            response?: { body?: { items?: { item?: unknown } } };
          } | null;
          const rawItem = data?.response?.body?.items?.item;
          const itemsArray: Record<string, unknown>[] = Array.isArray(rawItem)
            ? rawItem
            : rawItem && typeof rawItem === 'object'
              ? [rawItem as Record<string, unknown>]
              : [];

          for (const t of itemsArray) {
            if (String(t.cdealType || '').trim() === 'O') continue;
            if (!isWholeBuildingTransactionItem(t)) continue;

            const dealAmtManwon =
              parseInt(String(t.dealAmount || '0').replace(/,/g, '').trim(), 10) || 0;
            if (dealAmtManwon <= 0) continue;
            const dealAmountKrw = dealAmtManwon * 10_000;

            const landAreaM2 = parseFloat(String(t.plottageAr || '0')) || 0;
            const buildingAreaM2 =
              parseFloat(String(t.buildingAr || t.bldgArea || t.totArea || t.area || '0')) || 0;
            if (landAreaM2 <= 0 && buildingAreaM2 <= 0) continue;

            const dealYear = parseInt(String(t.dealYear || ym.slice(0, 4)), 10);
            const dealMonth = parseInt(String(t.dealMonth || ym.slice(4, 6)), 10);
            if (!Number.isFinite(dealYear) || !Number.isFinite(dealMonth)) continue;

            collected.push({
              ym: `${dealYear}-${String(dealMonth).padStart(2, '0')}`,
              dealYear,
              dealMonth,
              sigunguCode,
              dong: String(t.umdNm || t.dong || '').trim(),
              dealAmountManwon: dealAmtManwon,
              dealAmountKrw,
              buildingAreaM2,
              landAreaM2,
              buildingType: String(t.buildingType || '일반').trim() || '일반',
            });
          }
        } catch (err) {
          logger.warn('Monthly MOLIT fetch failed', { sigunguCode, ym, err });
        }
      }),
    ),
  );

  if (monthlyTxCache.size >= MONTHLY_TX_MAX_CACHE) {
    const oldest = monthlyTxCache.keys().next().value;
    if (oldest) monthlyTxCache.delete(oldest);
  }
  monthlyTxCache.set(cacheKey, { expiresAt: nowMs + MONTHLY_TX_CACHE_TTL_MS, items: collected });
  return collected;
}
