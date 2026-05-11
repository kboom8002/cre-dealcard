/**
 * Price Prediction ETL + Feature Engineering — P-D
 * Fetches data from 국토부 실거래가 API and stores in external_transactions.
 */
import { createClient } from '@supabase/supabase-js';

function getClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

const MOLIT_API_KEY = process.env.MOLIT_API_KEY ?? '';
const MOLIT_BASE_URL = 'https://apis.data.go.kr/1613000/RTMSOBJSvc';

// 서울 25개 구 코드 (법정동 코드 앞 5자리)
const SEOUL_DISTRICT_CODES: Record<string, string> = {
  '강남구': '11680', '서초구': '11650', '송파구': '11710', '강동구': '11740',
  '용산구': '11170', '마포구': '11440', '성동구': '11200', '광진구': '11215',
  '종로구': '11110', '중구': '11140', '동대문구': '11230', '성북구': '11290',
  '강북구': '11305', '도봉구': '11320', '노원구': '11350', '은평구': '11380',
  '서대문구': '11410', '양천구': '11470', '강서구': '11500', '구로구': '11530',
  '금천구': '11545', '영등포구': '11560', '동작구': '11590', '관악구': '11620',
  '중랑구': '11260',
};

export interface MolitTransaction {
  address: string;
  district: string;
  dong: string;
  transactionPrice: number;
  buildingArea: number;
  floors: number;
  builtYear: number;
  usageType: string;
  transactionDate: string;
  rawData: Record<string, unknown>;
}

// ─── Fetch from 국토부 API ─────────────────────────────────────────────

export async function fetchMolitTransactions(
  districtCode: string,
  yearMonth: string, // YYYYMM
): Promise<MolitTransaction[]> {
  const params = new URLSearchParams({
    serviceKey: MOLIT_API_KEY,
    pageNo: '1',
    numOfRows: '1000',
    LAWD_CD: districtCode,
    DEAL_YMD: yearMonth,
  });

  const url = `${MOLIT_BASE_URL}/getRTMSDataSvcNonLandRTMSInfoDetail?${params}`;

  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`MOLIT API error: ${resp.status}`);

  const text = await resp.text();

  // Parse XML (simplified)
  const items: MolitTransaction[] = [];
  const itemMatches = text.matchAll(/<item>([\s\S]*?)<\/item>/g);

  for (const match of itemMatches) {
    const item = match[1];
    const get  = (tag: string) => item.match(new RegExp(`<${tag}>(.*?)</${tag}>`))?.[1]?.trim() ?? '';

    const priceStr = get('거래금액').replace(/,/g, '');
    const price    = parseInt(priceStr) * 10_000; // 만원 → 원
    if (isNaN(price) || price < 2_000_000_000) continue; // 20억 미만 제외
    if (price > 30_000_000_000) continue; // 300억 초과 제외

    const usageType = get('용도');
    if (!['근린생활시설', '업무시설', '주상복합', '상업용'].some((u) => usageType.includes(u))) continue;

    items.push({
      address:          get('도로명'),
      district:         get('시군구'),
      dong:             get('법정동'),
      transactionPrice: price,
      buildingArea:     parseFloat(get('전용면적') || '0'),
      floors:           parseInt(get('층') || '0'),
      builtYear:        parseInt(get('건축년도') || '0'),
      usageType,
      transactionDate:  `${get('년')}-${get('월').padStart(2,'0')}-${get('일').padStart(2,'0')}`,
      rawData:          { raw: item.slice(0, 500) },
    });
  }

  return items;
}

// ─── Batch ETL for all Seoul districts ────────────────────────────────

export async function runMolitETL(months = 12): Promise<{ fetched: number; stored: number }> {
  const supabase = getClient();
  let totalFetched = 0;
  let totalStored  = 0;

  const now    = new Date();
  const yearMonths: string[] = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    yearMonths.push(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  for (const [district, code] of Object.entries(SEOUL_DISTRICT_CODES)) {
    for (const ym of yearMonths) {
      try {
        const items = await fetchMolitTransactions(code, ym);
        totalFetched += items.length;

        if (items.length > 0) {
          const rows = items.map((t) => ({
            source:            'molit',
            address:           t.address,
            district:          t.district || district,
            dong:              t.dong,
            transaction_price: t.transactionPrice,
            building_area:     t.buildingArea,
            floors:            t.floors,
            built_year:        t.builtYear,
            usage_type:        t.usageType,
            transaction_date:  t.transactionDate,
            raw_data:          t.rawData,
          }));

          const { data } = await supabase
            .from('external_transactions')
            .upsert(rows, { onConflict: 'address,transaction_date,transaction_price', ignoreDuplicates: true })
            .select('id');
          totalStored += data?.length ?? 0;
        }

        // Rate limiting
        await new Promise((r) => setTimeout(r, 100));
      } catch (e) {
        console.warn(`[ETL] failed ${district} ${ym}:`, e);
      }
    }
  }

  return { fetched: totalFetched, stored: totalStored };
}

// ─── Heuristic price estimator (no ML model yet) ──────────────────────
// Used until 200+ external_transactions are loaded and model trained

export async function estimatePriceRange(params: {
  areaSignal:   string;
  assetType:    string;
  buildingArea: number;  // 평 단위
  builtYear?:   number;
}): Promise<{
  lower80: number | null;
  median:  number | null;
  upper80: number | null;
  sampleCount: number;
  confidence: 'data_based' | 'insufficient';
  boundaryNote: string;
} | null> {
  const supabase = getClient();

  // Map area_signal → district name
  const districtKeyword = params.areaSignal.split(' ')[0]; // "성수동" → "성수"

  const { data: comparables } = await supabase
    .from('external_transactions')
    .select('transaction_price, building_area')
    .ilike('district', `%${districtKeyword}%`)
    .gte('transaction_price', 1_000_000_000) // 10억+
    .gte('transaction_date', new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10))
    .limit(100);

  if (!comparables?.length || comparables.length < 5) {
    return {
      lower80: null, median: null, upper80: null,
      sampleCount: comparables?.length ?? 0,
      confidence: 'insufficient',
      boundaryNote: '비교 사례가 부족하여 가격 추정이 어렵습니다. 더 많은 실거래 데이터 수집 후 재시도해주세요.',
    };
  }

  // Per-평 price
  const perPyeongPrices = comparables
    .filter((c) => c.building_area > 0)
    .map((c) => c.transaction_price / (c.building_area / 3.306)); // ㎡ → 평 변환

  perPyeongPrices.sort((a, b) => a - b);
  const p10 = perPyeongPrices[Math.floor(perPyeongPrices.length * 0.10)];
  const p50 = perPyeongPrices[Math.floor(perPyeongPrices.length * 0.50)];
  const p90 = perPyeongPrices[Math.floor(perPyeongPrices.length * 0.90)];

  return {
    lower80: Math.round(p10 * params.buildingArea / 100_000_000) * 100_000_000, // 억 단위
    median:  Math.round(p50 * params.buildingArea / 100_000_000) * 100_000_000,
    upper80: Math.round(p90 * params.buildingArea / 100_000_000) * 100_000_000,
    sampleCount: comparables.length,
    confidence: 'data_based',
    boundaryNote: '가격 추정은 국토부 실거래가 통계 기반 참고치입니다. 실제 거래가와 다를 수 있으며 감정평가 또는 감정인 의견을 대체하지 않습니다.',
  };
}
