/**
 * src/domain/magazine/monthly-stats-hydration.ts
 *
 * 월간 뉴스레터 상단 주요 통계 그래픽 2선 — 실거래·임대동향 DB 집계 + 온톨로지 기준 참고치 하이브리드 SSOT
 *
 * 설계 원칙:
 *  1. NL-01 정직성 준수: 미연결 상태에서 임의의 당월 확정 거래건수·공실률을 공공기관 실시간 확정치인 것처럼 위장하지 않는다.
 *  2. 공공 DB(`external_transactions`, `rental_trend_data`, `commercial_district`) 행이 있으면 `sourceMode: 'public_db'` 실측 추이로 승격한다.
 *  3. DB 적재 전이거나 오프라인 환경에서는 `src/domain/ontology/market-defaults.ts` 의 검증된 시장 기준치
 *     (`CAP_RATE_BENCHMARK`, `COMMERCIAL_MORTGAGE`, `CONSTRUCTION_COST_PER_PYUNG`, `ACQUISITION_COSTS`)로
 *     명확히 출처가 표기된 `sourceMode: 'reference_benchmark'` 비교 그래픽 2선을 기본 제공하며, 중개사가 직접 수치를 수정(`broker_custom`)할 수 있다.
 *  4. 클라이언트·서버 공용 순수 모듈 (Node/DB 직접 import 금지).
 */

import {
  ACQUISITION_COSTS,
  CAP_RATE_BENCHMARK,
  COMMERCIAL_MORTGAGE,
  CONSTRUCTION_COST_PER_PYUNG,
  DEVELOPMENT_DEFAULTS,
  OPERATING_DEFAULTS,
} from '@/domain/ontology/market-defaults';
import {
  MONTHLY_REGION_PRESETS,
  normalizeMonthlyRegionKey,
  type MonthlyChartType,
  type MonthlyRegionKey,
} from './monthly-stats-charts';
import type { MonthlyChartSeriesPoint, MonthlyRegionalChart } from './types';

export type MonthlyChartPairId = 'reb_molit' | 'molit_kosis' | 'reb_kosis';

export interface MonthlyChartPairPreset {
  id: MonthlyChartPairId;
  label: string;
  shortLabel: string;
  badge: string;
  pair: readonly [MonthlyChartType, MonthlyChartType];
}

export const MONTHLY_GRAPHIC_PAIR_PRESETS: readonly MonthlyChartPairPreset[] = [
  {
    id: 'reb_molit',
    label: '① 권역별 연 수익률 비교 + ② 자금조달·건축단가 기준',
    shortLabel: '수익률 + 조달·건축비',
    badge: '기본 추천',
    pair: ['reb_vacancy_cap_spread', 'molit_tx_price_trend'],
  },
  {
    id: 'molit_kosis',
    label: '① 자금조달·건축단가 기준 + ② 보유·밸류애드 운용 지표',
    shortLabel: '조달·건축비 + 운용지표',
    badge: '매수·신축 검토',
    pair: ['molit_tx_price_trend', 'kosis_commercial_vitality'],
  },
  {
    id: 'reb_kosis',
    label: '① 권역별 연 수익률 비교 + ② 보유·밸류애드 운용 지표',
    shortLabel: '수익률 + 운용지표',
    badge: '보유·임대 검토',
    pair: ['reb_vacancy_cap_spread', 'kosis_commercial_vitality'],
  },
] as const;

export const REGION_DISTRICT_KEYWORDS: Readonly<Record<MonthlyRegionKey, readonly string[]>> = {
  gbd: ['강남구', '서초구', '역삼', '논현', '신사', '서초'],
  seongsu: ['성동구', '광진구', '성수', '왕십리', '자양'],
  ybd: ['영등포구', '여의도', '당산', '양평', '문래'],
  mapo_yongsan: ['마포구', '용산구', '홍대', '합정', '연남', '한남'],
  cbd: ['종로구', '중구', '을지로', '광화문', '명동'],
};

const REGION_BENCHMARK_META: Readonly<
  Record<
    MonthlyRegionKey,
    {
      primaryDistrict: string;
      capRatePct: number;
      yieldImplication: string;
      costImplication: string;
      vitalityImplication: string;
    }
  >
> = {
  gbd: {
    primaryDistrict: '강남·서초',
    capRatePct: Math.round(((CAP_RATE_BENCHMARK.강남구 + CAP_RATE_BENCHMARK.서초구) / 2) * 10) / 10,
    yieldImplication:
      '강남·서초 권역은 시세 차익과 법인 사옥 수요가 두터워 초기 연 수익률보다 입지 희소성과 공실 방어력을 우선 검토합니다.',
    costImplication:
      '사옥 리모델링이나 신축 검토 시 대출 한도(LTV)와 철근콘크리트 표준 건축단가를 합산해 총 취득원가를 보수적으로 점검하세요.',
    vitalityImplication:
      '메디컬·전문직·IT 사옥 임차 비중이 높은 건물은 장기 보유 시 임대료 재계약 여력이 안정적입니다.',
  },
  seongsu: {
    primaryDistrict: '성동·광진',
    capRatePct: CAP_RATE_BENCHMARK.성동구,
    yieldImplication:
      '성수·광진 권역은 리모델링 전후 임대료 격차가 커 초기 수익률과 대지 활용도를 함께 비교하는 것이 유리합니다.',
    costImplication:
      '준공업·상업지 밸류애드 매수가 많은 권역으로 구조별 신축·대수선 단가와 브릿지·담보 금리 조건을 함께 따져봐야 합니다.',
    vitalityImplication:
      '브랜드 쇼룸과 크리에이티브 사옥 수요가 결합되는 입지는 저층부 임대 수익 개선 폭이 돋보입니다.',
  },
  ybd: {
    primaryDistrict: '영등포·여의도',
    capRatePct: CAP_RATE_BENCHMARK.영등포구,
    yieldImplication:
      '영등포·여의도 권역은 서울 핵심 업무지구 중 연 수익률 기준치가 돋보여 안정적 월세 현금흐름을 원하는 매수자에게 적합합니다.',
    costImplication:
      '당산·양평 역세권 근생·업무 빌딩은 자기자본 비율(40% 내외) 조정으로 이자부담 대비 순현금흐름 균형을 맞추기 유리합니다.',
    vitalityImplication:
      '주중 금융·업무 배후 직장인 수요가 탄탄해 경기 변동에도 임차 유지력이 꾸준한 편입니다.',
  },
  mapo_yongsan: {
    primaryDistrict: '마포·용산',
    capRatePct: CAP_RATE_BENCHMARK.마포구,
    yieldImplication:
      '마포·용산 권역은 서울 평균 수준의 연 수익률과 상권 확장성을 동시에 갖춰 중소형 코너 빌딩 선호도가 높습니다.',
    costImplication:
      '노후 근생 리모델링 시 취득세·부대비용(약 5.8%)과 구조별 표준 공사비를 초기 자금계획에 함께 반영하는 것이 안전합니다.',
    vitalityImplication:
      '평일 직장인과 주말 방문객 수요가 겹치는 주 7일 상권 특성상 식음·미디어 임차 업종 구성을 세심하게 살펴보세요.',
  },
  cbd: {
    primaryDistrict: '종로·중구',
    capRatePct: Math.round(((CAP_RATE_BENCHMARK.종로구 + CAP_RATE_BENCHMARK.중구) / 2) * 10) / 10,
    yieldImplication:
      '종로·중구 도심권은 전통 업무 수요와 관광·리테일 회복 흐름이 맞물려 강남 대비 합리적 진입가로 4%대 수익률 검토가 가능합니다.',
    costImplication:
      '도심 노후 빌딩 매수 시 대수선·엘리베이터 신설 등 공사비 예산과 담보대출 금리 조건을 사전에 면밀히 비교하세요.',
    vitalityImplication:
      '외국인 방문 상권과 오피스 배후 상권이 인접해 층별 용도 구성을 다변화하면 공실 위험을 낮출 수 있습니다.',
  },
};

export function mapPreferredRegionsToMonthlyKey(preferredRegions?: readonly string[]): MonthlyRegionKey {
  if (!Array.isArray(preferredRegions) || preferredRegions.length === 0) return 'gbd';
  for (const r of preferredRegions) {
    const key = normalizeMonthlyRegionKey(r);
    if (key !== 'gbd' || r.includes('강남') || r.includes('서초')) {
      return key;
    }
  }
  return normalizeMonthlyRegionKey(preferredRegions[0]);
}

function buildReferenceYieldChart(regionKey: MonthlyRegionKey, regionLabel: string): MonthlyRegionalChart {
  const meta = REGION_BENCHMARK_META[regionKey];
  const baseRate = 3.25; // 한국은행 기준금리 (market-defaults.ts 주석 기준)
  const spreadBp = Math.round((meta.capRatePct - baseRate) * 100);

  const series: MonthlyChartSeriesPoint[] = [
    {
      label: '강남구',
      primaryValue: CAP_RATE_BENCHMARK.강남구,
      displayPrimary: `${CAP_RATE_BENCHMARK.강남구.toFixed(1)}%`,
      displaySecondary: regionKey === 'gbd' ? '선택 권역' : '핵심 업무',
    },
    {
      label: '서초구',
      primaryValue: CAP_RATE_BENCHMARK.서초구,
      displayPrimary: `${CAP_RATE_BENCHMARK.서초구.toFixed(1)}%`,
      displaySecondary: regionKey === 'gbd' ? '선택 권역' : '서초·반포',
    },
    {
      label: '종로·중구',
      primaryValue: REGION_BENCHMARK_META.cbd.capRatePct,
      displayPrimary: `${REGION_BENCHMARK_META.cbd.capRatePct.toFixed(1)}%`,
      displaySecondary: regionKey === 'cbd' ? '선택 권역' : '도심권',
    },
    {
      label: '성동·성수',
      primaryValue: CAP_RATE_BENCHMARK.성동구,
      displayPrimary: `${CAP_RATE_BENCHMARK.성동구.toFixed(1)}%`,
      displaySecondary: regionKey === 'seongsu' ? '선택 권역' : '성수권',
    },
    {
      label: '영등포구',
      primaryValue: CAP_RATE_BENCHMARK.영등포구,
      displayPrimary: `${CAP_RATE_BENCHMARK.영등포구.toFixed(1)}%`,
      displaySecondary: regionKey === 'ybd' ? '선택 권역' : '여의도권',
    },
    {
      label: '마포구',
      primaryValue: CAP_RATE_BENCHMARK.마포구,
      displayPrimary: `${CAP_RATE_BENCHMARK.마포구.toFixed(1)}%`,
      displaySecondary: regionKey === 'mapo_yongsan' ? '선택 권역' : '홍대·공덕',
    },
  ];

  return {
    id: `${regionKey}-reb_vacancy_cap_spread`,
    regionKey,
    regionLabel,
    chartType: 'reb_vacancy_cap_spread',
    title: `${meta.primaryDistrict} 및 서울 주요 권역 연 수익률 기준 비교`,
    subtitle: `권역별 상업용 빌딩 목표 연 수익률(%) · 기준금리(${baseRate.toFixed(2)}%) 대비`,
    authorityLabel: '서울 권역별 수익률·한국은행 기준 참고치',
    asOf: '2026.3Q 기준 참고치',
    unit: '%',
    highlightMetric: {
      label: `${meta.primaryDistrict} 기준 수익률`,
      value: `연 ${meta.capRatePct.toFixed(1)}%`,
      deltaText:
        spreadBp >= 0
          ? `기준금리 대비 +${spreadBp}bp`
          : `기준금리 대비 ${spreadBp}bp`,
      tone: spreadBp >= 70 ? 'positive' : 'neutral',
    },
    series,
    buyerImplication: meta.yieldImplication,
    isPlaceholder: false,
    sourceMode: 'reference_benchmark',
  };
}

function buildReferenceFinancingCostChart(regionKey: MonthlyRegionKey, regionLabel: string): MonthlyRegionalChart {
  const meta = REGION_BENCHMARK_META[regionKey];
  const totalAcqPct =
    Math.round(
      (ACQUISITION_COSTS.taxRatePct + ACQUISITION_COSTS.brokerageFeePct + ACQUISITION_COSTS.legalFeesPct) * 10,
    ) / 10;

  const series: MonthlyChartSeriesPoint[] = [
    {
      label: '철골(SC)',
      primaryValue: CONSTRUCTION_COST_PER_PYUNG.SC,
      displayPrimary: `${CONSTRUCTION_COST_PER_PYUNG.SC}만`,
      displaySecondary: '평당 표준',
    },
    {
      label: '일반 평균',
      primaryValue: CONSTRUCTION_COST_PER_PYUNG.default,
      displayPrimary: `${CONSTRUCTION_COST_PER_PYUNG.default}만`,
      displaySecondary: '근생 기본',
    },
    {
      label: '철근콘크리트',
      primaryValue: CONSTRUCTION_COST_PER_PYUNG.RC,
      displayPrimary: `${CONSTRUCTION_COST_PER_PYUNG.RC}만`,
      displaySecondary: '중소형 주력',
    },
    {
      label: '철골철근(SRC)',
      primaryValue: CONSTRUCTION_COST_PER_PYUNG.SRC,
      displayPrimary: `${CONSTRUCTION_COST_PER_PYUNG.SRC}만`,
      displaySecondary: '중대형 사옥',
    },
  ];

  return {
    id: `${regionKey}-molit_tx_price_trend`,
    regionKey,
    regionLabel,
    chartType: 'molit_tx_price_trend',
    title: `${meta.primaryDistrict} 매수·신축 검토용 표준 건축단가 및 조달 기준`,
    subtitle: `구조별 평당 건축단가(만원/평) · 상업용 대출 평균 ${COMMERCIAL_MORTGAGE.interestRatePct}% · 부대비용 ${totalAcqPct}%`,
    authorityLabel: '상업용 빌딩 금융·건축원가 기준 참고치',
    asOf: '2026 하반기 기준 참고치',
    unit: '만원/평',
    highlightMetric: {
      label: '담보대출 평균 · 권장 LTV',
      value: `연 ${COMMERCIAL_MORTGAGE.interestRatePct}% · LTV ${COMMERCIAL_MORTGAGE.defaultLtvPct}%`,
      deltaText: `취득세 등 부대비용 약 ${totalAcqPct}%`,
      tone: 'neutral',
    },
    series,
    buyerImplication: meta.costImplication,
    isPlaceholder: false,
    sourceMode: 'reference_benchmark',
  };
}

function buildReferenceOperatingChart(regionKey: MonthlyRegionKey, regionLabel: string): MonthlyRegionalChart {
  const meta = REGION_BENCHMARK_META[regionKey];
  const series: MonthlyChartSeriesPoint[] = [
    {
      label: '담보대출 LTV',
      primaryValue: COMMERCIAL_MORTGAGE.defaultLtvPct,
      displayPrimary: `${COMMERCIAL_MORTGAGE.defaultLtvPct}%`,
      displaySecondary: `최대 ${COMMERCIAL_MORTGAGE.maxLtvPct}%`,
    },
    {
      label: '본PF LTC',
      primaryValue: 55,
      displayPrimary: '55%',
      displaySecondary: '신축 사업비',
    },
    {
      label: '운영형 가동률',
      primaryValue: OPERATING_DEFAULTS.defaultOccPct,
      displayPrimary: `${OPERATING_DEFAULTS.defaultOccPct}%`,
      displaySecondary: '숙박·운영 기준',
    },
    {
      label: '운영 GOP 마진',
      primaryValue: OPERATING_DEFAULTS.defaultGopMarginPct,
      displayPrimary: `${OPERATING_DEFAULTS.defaultGopMarginPct}%`,
      displaySecondary: `간접비 ${DEVELOPMENT_DEFAULTS.softCostRatioPct}%`,
    },
  ];

  return {
    id: `${regionKey}-kosis_commercial_vitality`,
    regionKey,
    regionLabel,
    chartType: 'kosis_commercial_vitality',
    title: `${meta.primaryDistrict} 빌딩 보유·밸류애드 자금 및 운용 기준 지표`,
    subtitle: '담보대출 LTV · 신축 LTC · 운영형 자산 기준 가동률(%) 비교',
    authorityLabel: '상업용 부동산 개발·운용 기준 참고치',
    asOf: '2026 하반기 기준 참고치',
    unit: '%',
    highlightMetric: {
      label: '표준 개발기간 · 간접비율',
      value: `${DEVELOPMENT_DEFAULTS.typicalProjectYears}년 · ${DEVELOPMENT_DEFAULTS.softCostRatioPct}%`,
      deltaText: `만기 기준 ${COMMERCIAL_MORTGAGE.typicalTermYears}년 운용`,
      tone: 'positive',
    },
    series,
    buyerImplication: meta.vitalityImplication,
    isPlaceholder: false,
    sourceMode: 'reference_benchmark',
  };
}

export function buildReferenceChartByType(
  regionKeyInput: unknown,
  chartType: MonthlyChartType,
): MonthlyRegionalChart {
  const regionKey = normalizeMonthlyRegionKey(regionKeyInput);
  const preset = MONTHLY_REGION_PRESETS.find((p) => p.key === regionKey) ?? MONTHLY_REGION_PRESETS[0];
  if (chartType === 'reb_vacancy_cap_spread') {
    return buildReferenceYieldChart(regionKey, preset.label);
  }
  if (chartType === 'molit_tx_price_trend') {
    return buildReferenceFinancingCostChart(regionKey, preset.label);
  }
  return buildReferenceOperatingChart(regionKey, preset.label);
}

/**
 * 월간 뉴스레터 상단 기본 통계 그래픽 2선을 반환한다.
 * 기본 조합: ① 권역별 연 수익률 기준 비교 + ② 매수 자금조달·건축단가 기준
 */
export function buildDefaultMonthlyGraphicPair(
  regionKeyInput?: unknown,
  pairOrId: MonthlyChartPairId | readonly [MonthlyChartType, MonthlyChartType] = 'reb_molit',
): MonthlyRegionalChart[] {
  const pair: readonly [MonthlyChartType, MonthlyChartType] =
    typeof pairOrId === 'string'
      ? (MONTHLY_GRAPHIC_PAIR_PRESETS.find((p) => p.id === pairOrId)?.pair ??
        MONTHLY_GRAPHIC_PAIR_PRESETS[0].pair)
      : pairOrId;

  return [
    buildReferenceChartByType(regionKeyInput, pair[0]),
    buildReferenceChartByType(regionKeyInput, pair[1]),
  ];
}

export interface DbTransactionRow {
  transaction_date?: string | null;
  transaction_price?: number | null;
  building_area?: number | null;
  district?: string | null;
  dong?: string | null;
  address?: string | null;
}

export interface DbRentalTrendRow {
  region?: string | null;
  quarter?: string | null;
  vacancy_rate?: number | null;
  rental_index?: number | null;
}

export interface DbCommercialDistrictRow {
  district_name?: string | null;
  sales_volume_index?: number | null;
  footfall_index?: number | null;
}

export interface HydrateMonthlyChartsFromDbInput {
  regionKey: unknown;
  yearMonth?: string;
  pair?: readonly [MonthlyChartType, MonthlyChartType];
  transactions?: readonly DbTransactionRow[];
  rentalRows?: readonly DbRentalTrendRow[];
  commercialRows?: readonly DbCommercialDistrictRow[];
}

/**
 * Supabase 공공 테이블(`external_transactions`, `rental_trend_data`, `commercial_district`) 조회 행이 있으면
 * `sourceMode: 'public_db'` 실측 차트로 승격하고, 부족한 슬롯은 정직한 `reference_benchmark` 차트로 채운다.
 */
export function hydrateMonthlyChartsFromDbRows(
  input: HydrateMonthlyChartsFromDbInput,
): MonthlyRegionalChart[] {
  const regionKey = normalizeMonthlyRegionKey(input.regionKey);
  const preset = MONTHLY_REGION_PRESETS.find((p) => p.key === regionKey) ?? MONTHLY_REGION_PRESETS[0];
  const meta = REGION_BENCHMARK_META[regionKey];
  const pair: readonly [MonthlyChartType, MonthlyChartType] = input.pair ?? [
    'molit_tx_price_trend',
    'reb_vacancy_cap_spread',
  ];

  // 1. 실거래 월별 집계 (최소 2개 월 이상 데이터가 있을 때 실측 차트 생성)
  let liveTxChart: MonthlyRegionalChart | null = null;
  const txRows = Array.isArray(input.transactions) ? input.transactions : [];
  if (txRows.length >= 2) {
    const bucket = new Map<string, { count: number; pyeongPrices: number[] }>();
    for (const r of txRows) {
      const ym = typeof r.transaction_date === 'string' ? r.transaction_date.slice(0, 7) : '';
      const price = typeof r.transaction_price === 'number' ? r.transaction_price : 0;
      if (!/^\d{4}-\d{2}$/.test(ym) || price <= 0) continue;
      const cur = bucket.get(ym) ?? { count: 0, pyeongPrices: [] };
      cur.count += 1;
      const area = typeof r.building_area === 'number' ? r.building_area : 0;
      if (area > 0) {
        const pyeong = area * 0.3025;
        if (pyeong > 0) {
          cur.pyeongPrices.push(Math.round(price / pyeong / 10_000));
        }
      }
      bucket.set(ym, cur);
    }

    const sortedMonths = Array.from(bucket.keys()).sort().slice(-6);
    if (sortedMonths.length >= 2) {
      const series: MonthlyChartSeriesPoint[] = sortedMonths.map((ym) => {
        const b = bucket.get(ym)!;
        const avgPyeongManwon =
          b.pyeongPrices.length > 0
            ? Math.round(b.pyeongPrices.reduce((a, v) => a + v, 0) / b.pyeongPrices.length)
            : undefined;
        return {
          label: `${Number(ym.slice(5, 7))}월`,
          primaryValue: b.count,
          ...(avgPyeongManwon ? { secondaryValue: avgPyeongManwon } : {}),
          displayPrimary: `${b.count}건`,
          ...(avgPyeongManwon ? { displaySecondary: `${avgPyeongManwon.toLocaleString()}만/평` } : {}),
        };
      });
      const latest = series[series.length - 1];
      const prev = series[series.length - 2];
      const diff = latest.primaryValue - prev.primaryValue;
      liveTxChart = {
        id: `${regionKey}-molit_tx_price_trend`,
        regionKey,
        regionLabel: preset.label,
        chartType: 'molit_tx_price_trend',
        title: `${meta.primaryDistrict} 상업·업무용 빌딩 월별 실거래 추이`,
        subtitle: '적재된 국토교통부 실거래 신고 데이터 월별 집계',
        authorityLabel: '국토교통부 실거래가 공개시스템 DB 집계',
        asOf: `${sortedMonths[sortedMonths.length - 1]} 집계`,
        unit: '건',
        secondaryUnit: '만원/평',
        highlightMetric: {
          label: '최근 집계 거래건수',
          value: latest.displaySecondary
            ? `${latest.displayPrimary} · ${latest.displaySecondary}`
            : latest.displayPrimary,
          deltaText:
            diff > 0
              ? `직전 집계월 대비 +${diff}건`
              : diff < 0
                ? `직전 집계월 대비 ${diff}건`
                : '직전 집계월과 동일',
          tone: diff >= 0 ? 'positive' : 'neutral',
        },
        series,
        buyerImplication: meta.costImplication,
        isPlaceholder: false,
        sourceMode: 'public_db',
      };
    }
  }

  // 2. 임대동향 분기별 집계
  let liveRentalChart: MonthlyRegionalChart | null = null;
  const rentalRows = Array.isArray(input.rentalRows) ? input.rentalRows : [];
  const validRentals = rentalRows.filter(
    (r) => typeof r.quarter === 'string' && r.quarter.trim() && typeof r.vacancy_rate === 'number',
  );
  if (validRentals.length >= 2) {
    const sorted = [...validRentals]
      .sort((a, b) => String(a.quarter).localeCompare(String(b.quarter)))
      .slice(-6);
    const series: MonthlyChartSeriesPoint[] = sorted.map((r) => {
      const vac = Math.round(Number(r.vacancy_rate) * 10) / 10;
      const idx = typeof r.rental_index === 'number' ? Math.round(r.rental_index * 10) / 10 : undefined;
      return {
        label: String(r.quarter),
        primaryValue: vac,
        ...(idx !== undefined ? { secondaryValue: idx } : {}),
        displayPrimary: `공실 ${vac.toFixed(1)}%`,
        ...(idx !== undefined ? { displaySecondary: `임대지수 ${idx}` } : {}),
      };
    });
    const latest = series[series.length - 1];
    liveRentalChart = {
      id: `${regionKey}-reb_vacancy_cap_spread`,
      regionKey,
      regionLabel: preset.label,
      chartType: 'reb_vacancy_cap_spread',
      title: `${meta.primaryDistrict} 분기별 상업용 공실률 및 임대지수 추이`,
      subtitle: `적재된 임대동향 분기별 공실률(%) · 권역 기준 수익률 연 ${meta.capRatePct.toFixed(1)}%`,
      authorityLabel: '한국부동산원 임대동향 DB 집계',
      asOf: `${latest.label} 기준`,
      unit: '%',
      highlightMetric: {
        label: '최근 분기 공실률 · 기준 수익률',
        value: `${latest.displayPrimary} · 연 ${meta.capRatePct.toFixed(1)}%`,
        deltaText: latest.displaySecondary ?? '분기 실측 집계',
        tone: latest.primaryValue <= 5 ? 'positive' : 'neutral',
      },
      series,
      buyerImplication: meta.yieldImplication,
      isPlaceholder: false,
      sourceMode: 'public_db',
    };
  }

  // 3. 상권 활력 DB 집계
  let liveCommercialChart: MonthlyRegionalChart | null = null;
  const commRows = Array.isArray(input.commercialRows) ? input.commercialRows : [];
  const validComm = commRows.filter(
    (r) => typeof r.district_name === 'string' && typeof r.sales_volume_index === 'number',
  );
  if (validComm.length >= 2) {
    const series: MonthlyChartSeriesPoint[] = validComm.slice(0, 5).map((r) => {
      const sales = Math.round(Number(r.sales_volume_index) * 10) / 10;
      const foot =
        typeof r.footfall_index === 'number' ? Math.round(r.footfall_index * 10) / 10 : undefined;
      return {
        label: String(r.district_name),
        primaryValue: sales,
        ...(foot !== undefined ? { secondaryValue: foot } : {}),
        displayPrimary: `${sales}pt`,
        ...(foot !== undefined ? { displaySecondary: `유동 ${foot}pt` } : {}),
      };
    });
    const latest = series[0];
    liveCommercialChart = {
      id: `${regionKey}-kosis_commercial_vitality`,
      regionKey,
      regionLabel: preset.label,
      chartType: 'kosis_commercial_vitality',
      title: `${meta.primaryDistrict} 주요 상권 매출·유동 활력 지수`,
      subtitle: '적재된 상권정보 매출·유동 지수(pt) 비교',
      authorityLabel: '상권정보 DB 집계',
      asOf: input.yearMonth ? `${input.yearMonth} 조회` : '최근 적재 기준',
      unit: 'pt',
      highlightMetric: {
        label: `${latest.label} 매출 지수`,
        value: latest.displayPrimary,
        deltaText: latest.displaySecondary ?? '상권 DB 실측',
        tone: 'positive',
      },
      series,
      buyerImplication: meta.vitalityImplication,
      isPlaceholder: false,
      sourceMode: 'public_db',
    };
  }

  const pickChart = (type: MonthlyChartType): MonthlyRegionalChart => {
    if (type === 'molit_tx_price_trend') {
      return liveTxChart ?? buildReferenceChartByType(regionKey, type);
    }
    if (type === 'reb_vacancy_cap_spread') {
      return liveRentalChart ?? buildReferenceChartByType(regionKey, type);
    }
    return liveCommercialChart ?? buildReferenceChartByType(regionKey, type);
  };

  return [pickChart(pair[0]), pickChart(pair[1])];
}
