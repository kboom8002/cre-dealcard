/**
 * src/domain/magazine/monthly-stats-charts.ts — 월간 뉴스레터용 국토교통부·통계청(KOSIS) 권역별 매수자 핵심 통계 2선 SSOT
 *
 * W0 신뢰성 원칙(NL-01):
 *  - 실제 공공기관 API/DB 집계 데이터가 연결되기 전에는 임의의 수치를
 *    국토교통부·한국부동산원·통계청 공식 확정 통계인 것처럼 기본 노출하지 않는다.
 *  - 기본 프리셋은 `isPlaceholder: true` 및 빈 `series: []` 로 반환하며,
 *    화면에는 "이번 달 통계 데이터가 아직 연결되지 않았습니다 (직접 입력하거나 이 구성을 빼고 발행할 수 있습니다)" /
 *    "통계 준비 중" 안내를 정직하게 표시한다.
 *
 * 클라이언트·서버 공용 순수 모듈 (Node 전용 import 금지).
 */

import type { MonthlyRegionalChart } from './types';

export type MonthlyRegionKey = 'gbd' | 'seongsu' | 'ybd' | 'mapo_yongsan' | 'cbd';

export type MonthlyChartType =
  | 'molit_tx_price_trend'
  | 'reb_vacancy_cap_spread'
  | 'kosis_commercial_vitality';

export const MONTHLY_STATS_PREPARING_LABEL = '통계 준비 중' as const;

export const MONTHLY_STATS_PLACEHOLDER_MESSAGE =
  '이번 달 통계 데이터가 아직 연결되지 않았습니다 (직접 입력하거나 이 구성을 빼고 발행할 수 있습니다)' as const;

export type HonestMonthlyRegionalChart = MonthlyRegionalChart & {
  isPlaceholder?: boolean;
  placeholderNotice?: string;
};

export interface MonthlyRegionPreset {
  key: MonthlyRegionKey;
  label: string;
  shortLabel: string;
  districts: string;
  buyerFocus: string;
}

export const MONTHLY_REGION_PRESETS: readonly MonthlyRegionPreset[] = [
  {
    key: 'gbd',
    label: '강남·서초 권역 (GBD)',
    shortLabel: '강남·서초',
    districts: '강남구 역삼·논현·신사·청담 / 서초구 서초·반포',
    buyerFocus: 'IT·메디컬·전문직 법인 사옥 실수요 및 중소형 빌딩 매수 수요 중심',
  },
  {
    key: 'seongsu',
    label: '성수·광진 권역',
    shortLabel: '성수·광진',
    districts: '성동구 성수동1·2가·왕십리 / 광진구 자양·화양',
    buyerFocus: '브랜드 매장·크리에이티브 사옥 수요 및 대지 평당가 비교 중심',
  },
  {
    key: 'ybd',
    label: '영등포·여의도 권역 (YBD)',
    shortLabel: '영등포·여의도',
    districts: '영등포구 여의도·당산·양평·문래',
    buyerFocus: '안정적 금융·업무 배후 임차수요 및 실질 연 수익률 비교 중심',
  },
  {
    key: 'mapo_yongsan',
    label: '마포·용산 권역',
    shortLabel: '마포·용산',
    districts: '마포구 홍대·연남·합정·공덕 / 용산구 한남·신용산',
    buyerFocus: '상권 확장·복합개발 수혜 및 우량 식음·미디어 임차 수요 중심',
  },
  {
    key: 'cbd',
    label: '종로·중구 도심권 (CBD)',
    shortLabel: '종로·중구 CBD',
    districts: '종로구 광화문·익선·안국 / 중구 을지로·명동·충무로',
    buyerFocus: '도심 재생·전통 업무권역 재편 및 관광·상가 회복 흐름 중심',
  },
] as const;

export const MONTHLY_CHART_TYPE_META: Readonly<
  Record<
    MonthlyChartType,
    {
      chartType: MonthlyChartType;
      shortTitle: string;
      authority: string;
      buyerReason: string;
    }
  >
> = {
  molit_tx_price_trend: {
    chartType: 'molit_tx_price_trend',
    shortTitle: '국토부 실거래량 · 평당 매매가 추이',
    authority: '국토교통부 실거래가 공개시스템 (상업·업무용)',
    buyerReason: '매수세 유입 속도(거래건수)와 진입 가격 수준(평당 매매가)을 한눈에 비교합니다.',
  },
  reb_vacancy_cap_spread: {
    chartType: 'reb_vacancy_cap_spread',
    shortTitle: '국토부·부동산원 공실률 & 연 수익률 비교',
    authority: '국토교통부·한국부동산원 상업용부동산 임대동향조사',
    buyerReason: '공실 위험과 대출 금리 대비 실질 연 수익률 우위를 점검합니다.',
  },
  kosis_commercial_vitality: {
    chartType: 'kosis_commercial_vitality',
    shortTitle: '통계청(KOSIS) 상권 소비 · 서비스업 활력 지수',
    authority: '통계청 국가통계포털(KOSIS) 서비스업동향 · 상권정보',
    buyerReason: '임차인의 매출 체력과 우량 업종 유입에 따른 임대료 여력을 확인합니다.',
  },
};

type PlaceholderChartBase = Omit<
  HonestMonthlyRegionalChart,
  'id' | 'regionKey' | 'regionLabel' | 'chartType'
>;

interface RegionChartDataset {
  txPriceTrend: PlaceholderChartBase;
  vacancyCapSpread: PlaceholderChartBase;
  commercialVitality: PlaceholderChartBase;
}

function buildPlaceholderChartBase(params: {
  title: string;
  subtitle: string;
  authorityLabel: string;
  unit: string;
  secondaryUnit?: string;
}): PlaceholderChartBase {
  return {
    title: params.title,
    subtitle: params.subtitle,
    authorityLabel: params.authorityLabel,
    asOf: MONTHLY_STATS_PREPARING_LABEL,
    unit: params.unit,
    ...(params.secondaryUnit ? { secondaryUnit: params.secondaryUnit } : {}),
    highlightMetric: {
      label: '이번 달 통계 상태',
      value: MONTHLY_STATS_PREPARING_LABEL,
      deltaText: '이번 달 통계 데이터가 아직 연결되지 않았습니다',
      tone: 'neutral',
    },
    series: [],
    buyerImplication: MONTHLY_STATS_PLACEHOLDER_MESSAGE,
    isPlaceholder: true,
    placeholderNotice: MONTHLY_STATS_PLACEHOLDER_MESSAGE,
  };
}

function createRegionPlaceholderDataset(regionShortLabel: string): RegionChartDataset {
  return {
    txPriceTrend: buildPlaceholderChartBase({
      title: `${regionShortLabel} 상업·업무용 빌딩 월간 거래량 및 평균 평당가`,
      subtitle: '매매 신고 기준 · 거래건수(건) 및 대지 평균 평당가(만원/평)',
      authorityLabel: '국토교통부 실거래가 공개시스템 (통계 준비 중)',
      unit: '건',
      secondaryUnit: '만원/평',
    }),
    vacancyCapSpread: buildPlaceholderChartBase({
      title: `${regionShortLabel} 상업용 빌딩 공실률 및 연 수익률 추이`,
      subtitle: '임대동향 기준 · 연 수익률(%) 및 공실률(%) 비교',
      authorityLabel: '국토교통부·한국부동산원 상업용부동산 임대동향조사 (통계 준비 중)',
      unit: '%',
      secondaryUnit: '%',
    }),
    commercialVitality: buildPlaceholderChartBase({
      title: `${regionShortLabel} 서비스업 생산 및 상권 소비활력 지수`,
      subtitle: '업종별 상권 매출·임차 유입 지수 추이',
      authorityLabel: '통계청 국가통계포털(KOSIS) 서비스업동향 · 상권정보 (통계 준비 중)',
      unit: 'pt',
    }),
  };
}

const REGION_DATASETS: Readonly<Record<MonthlyRegionKey, RegionChartDataset>> = {
  gbd: createRegionPlaceholderDataset('강남·서초'),
  seongsu: createRegionPlaceholderDataset('성수·광진'),
  ybd: createRegionPlaceholderDataset('영등포·여의도'),
  mapo_yongsan: createRegionPlaceholderDataset('마포·용산'),
  cbd: createRegionPlaceholderDataset('종로·중구(CBD)'),
};

export function normalizeMonthlyRegionKey(raw: unknown): MonthlyRegionKey {
  if (typeof raw !== 'string') return 'gbd';
  const v = raw.trim().toLowerCase();
  if (v === 'seongsu' || v.includes('성수') || v.includes('광진') || v.includes('성동')) return 'seongsu';
  if (v === 'ybd' || v.includes('여의도') || v.includes('영등포')) return 'ybd';
  if (v === 'mapo_yongsan' || v.includes('마포') || v.includes('용산') || v.includes('한남') || v.includes('홍대')) {
    return 'mapo_yongsan';
  }
  if (v === 'cbd' || v.includes('종로') || v.includes('중구') || v.includes('을지로') || v.includes('광화문')) {
    return 'cbd';
  }
  return 'gbd';
}

/**
 * 선택된 권역(regionKey)에 대해 월간 통계 차트 슬롯 2건을 반환한다.
 * 실제 통계 데이터가 연결되지 않은 기본 상태에서는 임의 수치를 넣지 않고
 * `isPlaceholder: true` 및 빈 `series: []` 상태로 정직하게 반환한다.
 */
export function getMonthlyChartsForRegion(
  regionKeyInput?: unknown,
  chartTypes: readonly [MonthlyChartType, MonthlyChartType] = [
    'molit_tx_price_trend',
    'reb_vacancy_cap_spread',
  ],
): HonestMonthlyRegionalChart[] {
  const regionKey = normalizeMonthlyRegionKey(regionKeyInput);
  const preset = MONTHLY_REGION_PRESETS.find((p) => p.key === regionKey) ?? MONTHLY_REGION_PRESETS[0];
  const dataset = REGION_DATASETS[regionKey] ?? REGION_DATASETS.gbd;

  const pickByType = (type: MonthlyChartType): HonestMonthlyRegionalChart => {
    const base =
      type === 'molit_tx_price_trend'
        ? dataset.txPriceTrend
        : type === 'reb_vacancy_cap_spread'
          ? dataset.vacancyCapSpread
          : dataset.commercialVitality;

    return {
      id: `${regionKey}-${type}`,
      regionKey,
      regionLabel: preset.label,
      chartType: type,
      ...base,
    };
  };

  return [pickByType(chartTypes[0]), pickByType(chartTypes[1])];
}

/**
 * 에디션 데이터에서 월간 통계 차트 2건을 안전하게 복원하거나 기본 권역 차트 2건을 생성한다.
 * 실제 입력된 series 데이터가 없는 차트는 `isPlaceholder: true` 로 표시한다.
 */
export function resolveMonthlyChartsFromData(
  data: Record<string, unknown>,
  opts: { forceDefaultIfMonthly?: boolean } = {},
): HonestMonthlyRegionalChart[] {
  if (Array.isArray(data.monthlyCharts) && data.monthlyCharts.length > 0) {
    const valid = data.monthlyCharts
      .filter(
        (c): c is HonestMonthlyRegionalChart =>
          !!c &&
          typeof c === 'object' &&
          typeof (c as MonthlyRegionalChart).title === 'string' &&
          Array.isArray((c as MonthlyRegionalChart).series),
      )
      .map((c) => {
        const hasRealSeries = c.series.length > 0 && c.isPlaceholder !== true;
        return {
          ...c,
          isPlaceholder: !hasRealSeries,
          placeholderNotice: hasRealSeries
            ? undefined
            : (c.placeholderNotice ?? MONTHLY_STATS_PLACEHOLDER_MESSAGE),
        };
      });
    if (valid.length > 0) return valid.slice(0, 2);
  }

  const isMonthly =
    data.kind === 'monthly' ||
    data.edition_type === 'monthly' ||
    opts.forceDefaultIfMonthly === true;

  if (!isMonthly) return [];
  return getMonthlyChartsForRegion(data.monthlyRegion ?? 'gbd');
}
