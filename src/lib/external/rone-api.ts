// src/lib/external/rone-api.ts
// 한국부동산원 R-ONE 부동산통계정보 Open API — (연) 지역별 지가변동률 (STATBL_ID = 'A_2024_00902')
// 서울 25개 자치구 2016~2025 공식 확정 시계열 내장 + 미내장 시군구 실시간 조회 지원
import { fetchWithRetry } from './fetch-with-retry';
import { createModuleLogger } from '@/lib/logger';

const logger = createModuleLogger('rone-api');

export const RONE_ANNUAL_LAND_PRICE_RATE_STATBL_ID = 'A_2024_00902';

export interface RegionalLandPriceRateYear {
  year: string;
  ratePct: number;
}

export type RegionalLandPriceRatePoint = RegionalLandPriceRateYear;

export interface RegionalLandPriceRateSeries {
  sigunguCode: string;         // e.g. '11560'
  regionName: string;          // e.g. '서울 영등포구'
  statblId: string;            // 'A_2024_00902'
  source: 'rone_official';
  points: RegionalLandPriceRateYear[]; // 2016..2025
  years: RegionalLandPriceRateYear[];  // alias for points
  geometricMeanPct: number;    // 10-year geometric mean ((Π(1 + r/100))^(1/n) - 1)*100 rounded to 2dp (e.g. 3.90 for 영등포구)
  arithmeticMeanPct: number;   // 10-year arithmetic mean rounded to 2dp
  cumulativePct: number;       // 10-year cumulative compound rate ((Π(1 + r/100)) - 1)*100 rounded to 2dp (e.g. 46.63 for 영등포구)
}

interface RawSeoulDistrictEntry {
  sigunguCd: string;
  clsId: string;
  districtName: string;
  rates2016To2025: readonly [number, number, number, number, number, number, number, number, number, number];
}

const YEARS_2016_2025 = ['2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024', '2025'] as const;

/**
 * 한국부동산원 R-ONE 공식 통계표 A_2024_00902 ((연) 지역별 지가변동률)
 * 서울특별시 25개 자치구 2016~2025년 연간 지가변동률(%)
 */
const SEOUL_DISTRICT_RONE_TABLE: readonly RawSeoulDistrictEntry[] = [
  { sigunguCd: '11110', clsId: '510008', districtName: '종로구', rates2016To2025: [2.199, 3.284, 5.811, 4.457, 4.316, 5.006, 3.045, 0.831, 2.856, 3.413] },
  { sigunguCd: '11140', clsId: '510009', districtName: '중구',   rates2016To2025: [2.227, 3.244, 5.327, 4.763, 4.551, 4.882, 2.366, 0.638, 2.396, 3.349] },
  { sigunguCd: '11170', clsId: '510010', districtName: '용산구', rates2016To2025: [3.133, 5.225, 8.598, 5.86,  4.854, 5.507, 3.255, 1.374, 3.667, 6.146] },
  { sigunguCd: '11200', clsId: '510011', districtName: '성동구', rates2016To2025: [2.916, 5.221, 7.377, 5.882, 5.129, 6.173, 4.528, 1.446, 3.004, 4.844] },
  { sigunguCd: '11215', clsId: '510012', districtName: '광진구', rates2016To2025: [3.182, 4.343, 5.679, 5.324, 4.398, 5.037, 2.581, 0.681, 2.353, 3.412] },
  { sigunguCd: '11230', clsId: '510013', districtName: '동대문구', rates2016To2025: [2.574, 3.995, 6.241, 5.327, 4.394, 5.237, 2.736, 0.65,  2.774, 3.29] },
  { sigunguCd: '11260', clsId: '510014', districtName: '중랑구', rates2016To2025: [2.742, 3.73,  4.504, 4.239, 3.878, 4.339, 2.203, 0.464, 2.138, 2.394] },
  { sigunguCd: '11290', clsId: '510015', districtName: '성북구', rates2016To2025: [2.398, 3.124, 5.723, 4.97,  4.479, 4.777, 1.946, 0.254, 2.204, 2.49] },
  { sigunguCd: '11305', clsId: '510016', districtName: '강북구', rates2016To2025: [2.395, 3.697, 5.131, 4.462, 3.786, 4.181, 1.734, 0.313, 1.745, 1.777] },
  { sigunguCd: '11320', clsId: '510017', districtName: '도봉구', rates2016To2025: [2.609, 3.416, 4.387, 3.827, 3.258, 4.114, 1.779, 0.203, 1.654, 1.808] },
  { sigunguCd: '11350', clsId: '510018', districtName: '노원구', rates2016To2025: [2.885, 4.35,  4.638, 4.361, 4.092, 4.234, 1.755, 0.394, 1.833, 1.881] },
  { sigunguCd: '11380', clsId: '510019', districtName: '은평구', rates2016To2025: [2.266, 3.315, 5.407, 4.589, 4.412, 4.8,   1.971, 0.434, 2.208, 2.344] },
  { sigunguCd: '11410', clsId: '510020', districtName: '서대문구', rates2016To2025: [2.647, 3.447, 5.354, 4.675, 4.415, 4.699, 2.099, 0.294, 2.418, 2.636] },
  { sigunguCd: '11440', clsId: '510021', districtName: '마포구', rates2016To2025: [3.677, 5.322, 8.112, 5.402, 4.792, 5.318, 3.026, 0.916, 2.901, 4.362] },
  { sigunguCd: '11470', clsId: '510022', districtName: '양천구', rates2016To2025: [2.499, 3.793, 5.078, 5.059, 4.436, 4.664, 2.503, 0.652, 2.483, 3.024] },
  { sigunguCd: '11500', clsId: '510023', districtName: '강서구', rates2016To2025: [3.244, 5.476, 5.948, 5.028, 4.438, 4.962, 2.732, 0.503, 2.292, 2.396] },
  { sigunguCd: '11530', clsId: '510024', districtName: '구로구', rates2016To2025: [2.439, 3.723, 5.291, 4.501, 4.046, 4.046, 2.328, 0.332, 1.538, 2.02] },
  { sigunguCd: '11545', clsId: '510025', districtName: '금천구', rates2016To2025: [2.411, 3.913, 4.691, 5.067, 4.337, 4.246, 3.125, 0.527, 1.508, 1.855] },
  { sigunguCd: '11560', clsId: '510026', districtName: '영등포구', rates2016To2025: [2.376, 4.024, 6.303, 5.595, 4.766, 5.423, 3.328, 0.856, 2.814, 3.604] },
  { sigunguCd: '11590', clsId: '510027', districtName: '동작구', rates2016To2025: [2.854, 4.481, 8.121, 5.536, 4.931, 4.758, 2.457, 1.186, 2.421, 3.37] },
  { sigunguCd: '11620', clsId: '510028', districtName: '관악구', rates2016To2025: [2.674, 4.045, 4.757, 4.649, 4.344, 5.147, 2.643, 0.533, 1.707, 1.931] },
  { sigunguCd: '11650', clsId: '510029', districtName: '서초구', rates2016To2025: [3.102, 4.396, 6.552, 5.567, 5.182, 5.946, 3.982, 1.39,  4.003, 5.193] },
  { sigunguCd: '11680', clsId: '510030', districtName: '강남구', rates2016To2025: [3.821, 4.94,  6.423, 6.052, 5.518, 6.11,  3.701, 2.432, 5.23,  6.175] },
  { sigunguCd: '11710', clsId: '510031', districtName: '송파구', rates2016To2025: [3.195, 4.601, 5.943, 5.334, 5.404, 5.692, 3.655, 0.908, 2.256, 3.756] },
  { sigunguCd: '11740', clsId: '510032', districtName: '강동구', rates2016To2025: [3.127, 4.116, 5.694, 5.698, 4.653, 5.09,  2.648, 0.932, 2.512, 3.182] },
];

export function computeLandPriceRateStats(years: readonly RegionalLandPriceRateYear[]): {
  geometricMeanPct: number;
  arithmeticMeanPct: number;
  cumulativePct: number;
} {
  if (!years.length) return { geometricMeanPct: 0, arithmeticMeanPct: 0, cumulativePct: 0 };
  let prod = 1;
  let sum = 0;
  for (const y of years) {
    prod *= 1 + y.ratePct / 100;
    sum += y.ratePct;
  }
  const n = years.length;
  const geom = (Math.pow(prod, 1 / n) - 1) * 100;
  const arith = sum / n;
  const cum = (prod - 1) * 100;
  return {
    geometricMeanPct: Math.round(geom * 100) / 100,
    arithmeticMeanPct: Math.round(arith * 100) / 100,
    cumulativePct: Math.round(cum * 100) / 100,
  };
}

function toSeries(entry: RawSeoulDistrictEntry): RegionalLandPriceRateSeries {
  const years: RegionalLandPriceRateYear[] = YEARS_2016_2025.map((year, idx) => ({
    year,
    ratePct: entry.rates2016To2025[idx],
  }));
  const { geometricMeanPct, arithmeticMeanPct, cumulativePct } = computeLandPriceRateStats(years);
  return {
    sigunguCode: entry.sigunguCd,
    regionName: `서울 ${entry.districtName}`,
    statblId: RONE_ANNUAL_LAND_PRICE_RATE_STATBL_ID,
    source: 'rone_official',
    points: years,
    years,
    geometricMeanPct,
    arithmeticMeanPct,
    cumulativePct,
  };
}

const BY_SIGUNGU_CD = new Map<string, RegionalLandPriceRateSeries>();
const BY_DISTRICT_NAME = new Map<string, RegionalLandPriceRateSeries>();

for (const e of SEOUL_DISTRICT_RONE_TABLE) {
  const s = toSeries(e);
  BY_SIGUNGU_CD.set(e.sigunguCd, s);
  BY_DISTRICT_NAME.set(e.districtName, s);
}

/** 권역 신호(areaSignal) 또는 법정동 키워드 → 서울 자치구 보조 매핑 */
const AREA_SIGNAL_TO_DISTRICT: ReadonlyArray< readonly [RegExp, string] > = [
  [/영등포|당산|여의도|문래|양평동|신길동/, '영등포구'],
  [/강남구|역삼|테헤란|삼성동|청담|논현|대치|신사동|압구정|도곡|개포|수서/, '강남구'],
  [/서초|반포|양재|방배|잠원/, '서초구'],
  [/성동|성수|왕십리|옥수|금호/, '성동구'],
  [/마포|홍대|합정|상암|연남|공덕|서교|동교|망원/, '마포구'],
  [/용산|한남|이태원|청파|갈월|남영/, '용산구'],
  [/송파|잠실|문정|가락|방이|석촌/, '송파구'],
  [/종로|광화문|익선|삼청|관철|평창동/, '종로구'],
  [/을지로|명동|충무로|회현|소공동|장충동|신당동/, '중구'],
  [/강서구|마곡|화곡|등촌|염창/, '강서구'],
  [/구로|가산|구로디지털/, '구로구'],
  [/금천|가산디지털|독산|시흥동/, '금천구'],
  [/동작|노량진|사당|흑석|상도/, '동작구'],
  [/관악|신림|봉천/, '관악구'],
  [/광진|건대|자양|구의|화양/, '광진구'],
  [/동대문|청량리|회기|장안동|답십리/, '동대문구'],
  [/강동구|천호|길동|둔촌|고덕|명일/, '강동구'],
  [/양천|목동|신정동|신월동/, '양천구'],
  [/서대문|신촌|연희|충정로|홍제/, '서대문구'],
  [/은평|연신내|불광|응암|진관/, '은평구'],
  [/성북|성신여대|안암|정릉|길음/, '성북구'],
  [/강북구|수유|미아|번동/, '강북구'],
  [/도봉|창동|방학|쌍문/, '도봉구'],
  [/노원|상계|중계|하계|공릉/, '노원구'],
  [/중랑|면목|상봉|망우|묵동/, '중랑구'],
];

/**
 * PNU(앞 5자리 시군구코드) 또는 주소/권역 문자열에서 공식 R-ONE 연간 지가변동률 시계열을 동기 조회한다.
 */
export function getRegionalLandPriceRateSeries(params: {
  sigunguCode?: string | null;
  pnu?: string | null;
  address?: string | null;
}): RegionalLandPriceRateSeries | null {
  const rawSgg = (params.sigunguCode ?? '').trim();
  if (/^\d{5}/.test(rawSgg)) {
    const hit = BY_SIGUNGU_CD.get(rawSgg.slice(0, 5));
    if (hit) return hit;
  }

  const rawPnu = (params.pnu ?? '').trim();
  if (/^\d{5}/.test(rawPnu)) {
    const sgg = rawPnu.slice(0, 5);
    const hit = BY_SIGUNGU_CD.get(sgg);
    if (hit) return hit;
  }

  const addr = (params.address ?? '').trim();
  if (!addr) return null;

  // 타 광역시 중구(부산/대구/인천/대전/울산 중구) 오매칭 방어
  const isNonSeoulMetro = /^(부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)/.test(addr);

  // 1) '중구' 제외한 24개 자치구명 직접 매칭
  for (const [name, series] of BY_DISTRICT_NAME.entries()) {
    if (name === '중구') continue;
    if (addr.includes(name)) return series;
  }
  // 2) '중구'는 타 광역시가 아닐 때만 매칭
  if (addr.includes('중구') && !isNonSeoulMetro) {
    return BY_DISTRICT_NAME.get('중구') ?? null;
  }

  // 3) 권역명/법정동 키워드 보조 매칭 (예: '당산권역' -> '영등포구')
  if (!isNonSeoulMetro) {
    for (const [re, distName] of AREA_SIGNAL_TO_DISTRICT) {
      if (re.test(addr)) {
        return BY_DISTRICT_NAME.get(distName) ?? null;
      }
    }
  }

  return null;
}

/**
 * R-ONE (연) 지역별 지가변동률 비동기 조회:
 *  - 내장된 서울 25개 구는 즉시 반환
 *  - 미내장 지역이고 OFFLINE_RENDER !== '1' 및 RONE_API_KEY가 있으면 R-ONE Open API 호출
 */
export async function fetchRegionalLandPriceRateSeries(params: {
  sigunguCode?: string | null;
  pnu?: string | null;
  address?: string | null;
  clsId?: string | null;
  apiKey?: string;
}): Promise<RegionalLandPriceRateSeries | null> {
  const cached = getRegionalLandPriceRateSeries({
    sigunguCode: params.sigunguCode,
    pnu: params.pnu,
    address: params.address,
  });
  if (cached) return cached;

  if (process.env.OFFLINE_RENDER === '1') return null;
  const key = params.apiKey ?? process.env.RONE_API_KEY ?? '';
  const clsId = (params.clsId ?? '').trim();
  if (!key || !clsId) return null;

  try {
    const url =
      `https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do` +
      `?KEY=${encodeURIComponent(key)}` +
      `&STATBL_ID=${RONE_ANNUAL_LAND_PRICE_RATE_STATBL_ID}` +
      `&DTACYCLE_CD=YY&CLS_ID=${encodeURIComponent(clsId)}` +
      `&START_WRTTIME=2016&END_WRTTIME=2025&Type=json`;
    const res = await fetchWithRetry(url, { timeoutMs: 8000, maxRetries: 1 });
    if (!res.ok) return null;
    const data = await res.json();
    const rows: any[] = data?.SttsApiTblData?.[1]?.row ?? [];
    if (!Array.isArray(rows) || rows.length === 0) return null;

    const years: RegionalLandPriceRateYear[] = [];
    let regionName = '';
    for (const r of rows) {
      const yr = String(r.WRTTIME_IDTFR_ID ?? '').trim();
      const val = Number(r.DTA_VAL);
      if (/^\d{4}$/.test(yr) && Number.isFinite(val)) {
        years.push({ year: yr, ratePct: val });
      }
      if (!regionName && r.CLS_FULLNM) {
        regionName = String(r.CLS_FULLNM).replace(/>/g, ' ').trim();
      }
    }
    years.sort((a, b) => a.year.localeCompare(b.year));
    if (years.length === 0) return null;
    const { geometricMeanPct, arithmeticMeanPct, cumulativePct } = computeLandPriceRateStats(years);
    const sgg = (params.sigunguCode ?? params.pnu ?? '').trim().slice(0, 5);
    return {
      sigunguCode: sgg,
      regionName: regionName || (params.address ?? '해당 시군구'),
      statblId: RONE_ANNUAL_LAND_PRICE_RATE_STATBL_ID,
      source: 'rone_official',
      points: years,
      years,
      geometricMeanPct,
      arithmeticMeanPct,
      cumulativePct,
    };
  } catch (err) {
    logger.warn('R-ONE API request failed', { err });
    return null;
  }
}
