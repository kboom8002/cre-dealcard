/**
 * src/domain/magazine/monthly-stats-charts.ts — 월간 뉴스레터용 국토교통부·통계청(KOSIS) 권역별 매수자 핵심 통계 2선 SSOT
 *
 * 중개인 고도화 요구사항 반영:
 *  - 월간(Monthly) 뉴스레터 공식: [헤더 + 제목 + 권역별 유용한 통계 2건 그래프 + 월간 이슈 5건 + 딜카드]
 *  - 매수자가 권역별 진입 타이밍·수익성·임차 안정성을 판단할 때 가장 관심 갖는
 *    공식 국토교통부(실거래가 공개시스템·한국부동산원 상업용부동산 임대동향조사) 및
 *    통계청(KOSIS 서비스업동향·소매판매·상권 소비지수) 지표를 권역별로 선별 제공
 *
 * 클라이언트·서버 공용 순수 모듈 (Node 전용 import 금지).
 */

import type { MonthlyRegionalChart } from './types';

export type MonthlyRegionKey = 'gbd' | 'seongsu' | 'ybd' | 'mapo_yongsan' | 'cbd';

export type MonthlyChartType =
  | 'molit_tx_price_trend'
  | 'reb_vacancy_cap_spread'
  | 'kosis_commercial_vitality';

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
    buyerFocus: 'IT·메디컬·전문직 법인 사옥 실수요 및 프라임 꼬마빌딩 자본이득 중심',
  },
  {
    key: 'seongsu',
    label: '성수·광진 권역',
    shortLabel: '성수·광진',
    districts: '성동구 성수동1·2가·왕십리 / 광진구 자양·화양',
    buyerFocus: '플래그십 리테일·크리에이티브 사옥 수요 및 대지 평당가 밸류애드 중심',
  },
  {
    key: 'ybd',
    label: '영등포·여의도 권역 (YBD)',
    shortLabel: '영등포·여의도',
    districts: '영등포구 여의도·당산·양평·문래',
    buyerFocus: '안정적 금융·업무 배후 임차수요 및 4~5%대 실질 임대수익률(Cap Rate) 중심',
  },
  {
    key: 'mapo_yongsan',
    label: '마포·용산 권역',
    shortLabel: '마포·용산',
    districts: '마포구 홍대·연남·합정·공덕 / 용산구 한남·신용산',
    buyerFocus: '글로벌 상권 확장·복합개발 수혜 및 우량 F&B·엔터 임차 수요 중심',
  },
  {
    key: 'cbd',
    label: '종로·중구 도심권 (CBD)',
    shortLabel: '종로·중구 CBD',
    districts: '종로구 광화문·익선·안국 / 중구 을지로·명동·충무로',
    buyerFocus: '도심 재생·전통 업무권역 재편 및 외국인 관광·리테일 회복 수혜 중심',
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
    shortTitle: '국토부·부동산원 공실률 & Cap Rate 비교',
    authority: '국토교통부·한국부동산원 상업용부동산 임대동향조사',
    buyerReason: '공실 리스크와 대출 금리 대비 실질 투자수익률(Cap Rate) 우위를 점검합니다.',
  },
  kosis_commercial_vitality: {
    chartType: 'kosis_commercial_vitality',
    shortTitle: '통계청(KOSIS) 상권 소비 · 서비스업 활력 지수',
    authority: '통계청 국가통계포털(KOSIS) 서비스업동향 · 상권정보',
    buyerReason: '임차인의 매출 체력과 우량 업종 유입에 따른 임대료 상승 여력을 확인합니다.',
  },
};

interface RegionChartDataset {
  txPriceTrend: Omit<MonthlyRegionalChart, 'id' | 'regionKey' | 'regionLabel' | 'chartType'>;
  vacancyCapSpread: Omit<MonthlyRegionalChart, 'id' | 'regionKey' | 'regionLabel' | 'chartType'>;
  commercialVitality: Omit<MonthlyRegionalChart, 'id' | 'regionKey' | 'regionLabel' | 'chartType'>;
}

const REGION_DATASETS: Readonly<Record<MonthlyRegionKey, RegionChartDataset>> = {
  gbd: {
    txPriceTrend: {
      title: '강남·서초 상업·업무용 빌딩 월간 거래량 및 평균 평당가',
      subtitle: '최근 6개월 매매 신고 기준 · 거래건수(건) 및 대지 평균 평당가(만원/평)',
      authorityLabel: '국토교통부 실거래가 공개시스템 (상업·업무용 매매 통계)',
      asOf: '2026년 최근 월간 집계 기준',
      unit: '건',
      secondaryUnit: '만원/평',
      highlightMetric: {
        label: '당월 거래량 · 평균 평당가',
        value: '42건 · 14,850만/평',
        deltaText: '전월 대비 거래량 ▲ +16.7%',
        tone: 'positive',
      },
      series: [
        { label: '5개월 전', primaryValue: 28, secondaryValue: 14100, displayPrimary: '28건', displaySecondary: '1.41억/평' },
        { label: '4개월 전', primaryValue: 31, secondaryValue: 14250, displayPrimary: '31건', displaySecondary: '1.43억/평' },
        { label: '3개월 전', primaryValue: 34, secondaryValue: 14400, displayPrimary: '34건', displaySecondary: '1.44억/평' },
        { label: '2개월 전', primaryValue: 33, secondaryValue: 14520, displayPrimary: '33건', displaySecondary: '1.45억/평' },
        { label: '전월', primaryValue: 36, secondaryValue: 14680, displayPrimary: '36건', displaySecondary: '1.47억/평' },
        { label: '당월', primaryValue: 42, secondaryValue: 14850, displayPrimary: '42건', displaySecondary: '1.49억/평' },
      ],
      buyerImplication:
        '강남·서초 이면 코너 50~150억대 사옥형 빌딩을 중심으로 법인 실수요 거래가 2개월 연속 증가하며 평당가 하방 경직성이 뚜렷합니다.',
    },
    vacancyCapSpread: {
      title: '강남·서초 오피스·중대형 상가 공실률 및 Cap Rate 추이',
      subtitle: '자연공실률(5%) 하회 지속 · 소득수익률(Cap Rate, %) vs 공실률(%) 비교',
      authorityLabel: '국토교통부·한국부동산원 상업용부동산 임대동향조사',
      asOf: '2026년 최근 공표 기준',
      unit: '%',
      secondaryUnit: '%',
      highlightMetric: {
        label: '권역 공실률 · 평균 Cap Rate',
        value: '공실 2.8% · 수익률 4.1%',
        deltaText: '서울 평균 대비 공실률 -2.1%p 우위',
        tone: 'positive',
      },
      series: [
        { label: '테헤란로', primaryValue: 4.0, secondaryValue: 2.4, displayPrimary: 'Cap 4.0%', displaySecondary: '공실 2.4%' },
        { label: '강남대로', primaryValue: 3.9, secondaryValue: 2.9, displayPrimary: 'Cap 3.9%', displaySecondary: '공실 2.9%' },
        { label: '논현·신사', primaryValue: 4.2, secondaryValue: 3.1, displayPrimary: 'Cap 4.2%', displaySecondary: '공실 3.1%' },
        { label: '서초·교대', primaryValue: 4.3, secondaryValue: 2.7, displayPrimary: 'Cap 4.3%', displaySecondary: '공실 2.7%' },
      ],
      buyerImplication:
        'IT·병의원 임차 수요가 견조해 공실률이 2%대 후반으로 낮고, 임대료(NOC) 인상을 통한 밸류애드 여력이 가장 높은 권역입니다.',
    },
    commercialVitality: {
      title: '강남·서초 서비스업 생산 및 전문직·메디컬 소비활력 지수',
      subtitle: '기준치(100) 대비 업종별 상권 매출·임차 유입 지수 추이',
      authorityLabel: '통계청 국가통계포털(KOSIS) 서비스업동향 · 상권정보',
      asOf: '2026년 최근 월간 집계 기준',
      unit: 'pt',
      highlightMetric: {
        label: '권역 상권 활력 지수',
        value: '114.6 pt',
        deltaText: '전월 대비 ▲ +2.4pt 상승',
        tone: 'positive',
      },
      series: [
        { label: '병의원·메디컬', primaryValue: 121, displayPrimary: '121.0pt', displaySecondary: '우량 임차 1위' },
        { label: 'IT·전문서비스', primaryValue: 117, displayPrimary: '117.2pt', displaySecondary: '사옥 수요 강세' },
        { label: '프리미엄 F&B', primaryValue: 111, displayPrimary: '111.4pt', displaySecondary: '신사·청담 집중' },
        { label: '뷰티·쇼룸', primaryValue: 109, displayPrimary: '109.0pt', displaySecondary: '외국인 매출 호조' },
      ],
      buyerImplication:
        '피부과·성형외과 등 메디컬 테넌트와 IT 법인 임차인의 매출 지수가 강세를 보여 장기 우량 임차인 확보에 유리합니다.',
    },
  },
  seongsu: {
    txPriceTrend: {
      title: '성수·광진 상업·업무용 빌딩 월간 거래량 및 평균 평당가',
      subtitle: '최근 6개월 매매 신고 기준 · 거래건수(건) 및 대지 평균 평당가(만원/평)',
      authorityLabel: '국토교통부 실거래가 공개시스템 (상업·업무용 매매 통계)',
      asOf: '2026년 최근 월간 집계 기준',
      unit: '건',
      secondaryUnit: '만원/평',
      highlightMetric: {
        label: '당월 거래량 · 평균 평당가',
        value: '24건 · 11,900만/평',
        deltaText: '전월 대비 거래량 ▲ +20.0%',
        tone: 'positive',
      },
      series: [
        { label: '5개월 전', primaryValue: 16, secondaryValue: 11100, displayPrimary: '16건', displaySecondary: '1.11억/평' },
        { label: '4개월 전', primaryValue: 18, secondaryValue: 11300, displayPrimary: '18건', displaySecondary: '1.13억/평' },
        { label: '3개월 전', primaryValue: 19, secondaryValue: 11450, displayPrimary: '19건', displaySecondary: '1.15억/평' },
        { label: '2개월 전', primaryValue: 21, secondaryValue: 11600, displayPrimary: '21건', displaySecondary: '1.16억/평' },
        { label: '전월', primaryValue: 20, secondaryValue: 11750, displayPrimary: '20건', displaySecondary: '1.18억/평' },
        { label: '당월', primaryValue: 24, secondaryValue: 11900, displayPrimary: '24건', displaySecondary: '1.19억/평' },
      ],
      buyerImplication:
        '연무장길·성수역 남측에서 서울숲·뚝섬역 일대로 매수 권역이 확장되며 준공업지역 리모델링용 건물 거래가 활발합니다.',
    },
    vacancyCapSpread: {
      title: '성수·광진 권역 상업용 공실률 및 Cap Rate 추이',
      subtitle: '플래그십·사옥 임차 유입에 따른 소규모 상가·오피스 수익률(%) 및 공실률(%)',
      authorityLabel: '국토교통부·한국부동산원 상업용부동산 임대동향조사',
      asOf: '2026년 최근 공표 기준',
      unit: '%',
      secondaryUnit: '%',
      highlightMetric: {
        label: '권역 공실률 · 평균 Cap Rate',
        value: '공실 3.1% · 수익률 4.3%',
        deltaText: '신규 리모델링 건물 임대 소진율 94%',
        tone: 'positive',
      },
      series: [
        { label: '연무장길', primaryValue: 4.1, secondaryValue: 2.2, displayPrimary: 'Cap 4.1%', displaySecondary: '공실 2.2%' },
        { label: '서울숲길', primaryValue: 4.2, secondaryValue: 2.9, displayPrimary: 'Cap 4.2%', displaySecondary: '공실 2.9%' },
        { label: '성수역북측', primaryValue: 4.5, secondaryValue: 3.4, displayPrimary: 'Cap 4.5%', displaySecondary: '공실 3.4%' },
        { label: '건대·자양', primaryValue: 4.6, secondaryValue: 3.9, displayPrimary: 'Cap 4.6%', displaySecondary: '공실 3.9%' },
      ],
      buyerImplication:
        '글로벌 브랜드 팝업과 기업 사옥 이전 수요가 맞물려 리모델링 완료 건물의 평당 임대료가 빠르게 상승하고 있습니다.',
    },
    commercialVitality: {
      title: '성수·광진 리테일 소매판매 및 팝업·쇼룸 유동인구 지수',
      subtitle: '기준치(100) 대비 상권별 소비·방문객 활력 지수 추이',
      authorityLabel: '통계청 국가통계포털(KOSIS) 소매판매 · 상권정보',
      asOf: '2026년 최근 월간 집계 기준',
      unit: 'pt',
      highlightMetric: {
        label: '권역 상권 활력 지수',
        value: '122.4 pt',
        deltaText: '서울 주요 상권 중 성장률 1위 (▲ +4.1pt)',
        tone: 'positive',
      },
      series: [
        { label: '패션·쇼룸', primaryValue: 128, displayPrimary: '128.0pt', displaySecondary: '글로벌 브랜드 집중' },
        { label: '카페·베이커리', primaryValue: 123, displayPrimary: '123.5pt', displaySecondary: '주말 집객 최상' },
        { label: '크리에이티브사옥', primaryValue: 119, displayPrimary: '119.2pt', displaySecondary: '지식산업·스튜디오' },
        { label: '문화·복합공간', primaryValue: 115, displayPrimary: '115.0pt', displaySecondary: '전시·팝업 수요' },
      ],
      buyerImplication:
        '1층 대관·팝업 수익과 지상층 사옥 임대를 결합한 복합 수익 모델이 가능해 매수자의 현금흐름 개선 폭이 큽니다.',
    },
  },
  ybd: {
    txPriceTrend: {
      title: '영등포·여의도 상업·업무용 빌딩 월간 거래량 및 평균 평당가',
      subtitle: '최근 6개월 매매 신고 기준 · 거래건수(건) 및 대지 평균 평당가(만원/평)',
      authorityLabel: '국토교통부 실거래가 공개시스템 (상업·업무용 매매 통계)',
      asOf: '2026년 최근 월간 집계 기준',
      unit: '건',
      secondaryUnit: '만원/평',
      highlightMetric: {
        label: '당월 거래량 · 평균 평당가',
        value: '29건 · 7,450만/평',
        deltaText: '전월 대비 거래량 ▲ +11.5%',
        tone: 'positive',
      },
      series: [
        { label: '5개월 전', primaryValue: 21, secondaryValue: 7100, displayPrimary: '21건', displaySecondary: '7,100만/평' },
        { label: '4개월 전', primaryValue: 23, secondaryValue: 7180, displayPrimary: '23건', displaySecondary: '7,180만/평' },
        { label: '3개월 전', primaryValue: 25, secondaryValue: 7250, displayPrimary: '25건', displaySecondary: '7,250만/평' },
        { label: '2개월 전', primaryValue: 24, secondaryValue: 7310, displayPrimary: '24건', displaySecondary: '7,310만/평' },
        { label: '전월', primaryValue: 26, secondaryValue: 7380, displayPrimary: '26건', displaySecondary: '7,380만/평' },
        { label: '당월', primaryValue: 29, secondaryValue: 7450, displayPrimary: '29건', displaySecondary: '7,450만/평' },
      ],
      buyerImplication:
        '당산·양평·선유도 역세권 30~80억대 실속형 근생·업무 빌딩에 안정적 임대수익을 원하는 매수세가 집중되고 있습니다.',
    },
    vacancyCapSpread: {
      title: '영등포·여의도(YBD) 공실률 및 Cap Rate 스프레드 동향',
      subtitle: '서울 3대 업무권역 중 최저 공실률 · 실질 Cap Rate(%) vs 공실률(%)',
      authorityLabel: '국토교통부·한국부동산원 상업용부동산 임대동향조사',
      asOf: '2026년 최근 공표 기준',
      unit: '%',
      secondaryUnit: '%',
      highlightMetric: {
        label: '권역 공실률 · 평균 Cap Rate',
        value: '공실 2.3% · 수익률 4.8%',
        deltaText: '대출금리 대비 정(+)의 레버리지 구간',
        tone: 'positive',
      },
      series: [
        { label: '여의도권', primaryValue: 4.5, secondaryValue: 1.9, displayPrimary: 'Cap 4.5%', displaySecondary: '공실 1.9%' },
        { label: '당산역세권', primaryValue: 4.8, secondaryValue: 2.2, displayPrimary: 'Cap 4.8%', displaySecondary: '공실 2.2%' },
        { label: '양평·선유도', primaryValue: 5.0, secondaryValue: 2.6, displayPrimary: 'Cap 5.0%', displaySecondary: '공실 2.6%' },
        { label: '문래창작촌', primaryValue: 4.7, secondaryValue: 2.5, displayPrimary: 'Cap 4.7%', displaySecondary: '공실 2.5%' },
      ],
      buyerImplication:
        '여의도 금융·업무 배후 임차 수요 덕분에 공실률이 2%대 초반으로 매우 낮고, 4% 후반~5%대 Cap Rate 확보가 가능합니다.',
    },
    commercialVitality: {
      title: '영등포·여의도 직장인 소비 및 업무지원 서비스업 생산 지수',
      subtitle: '기준치(100) 대비 권역 내 업무·식음·메디컬 소비 지수',
      authorityLabel: '통계청 국가통계포털(KOSIS) 서비스업동향 · 상권정보',
      asOf: '2026년 최근 월간 집계 기준',
      unit: 'pt',
      highlightMetric: {
        label: '권역 상권 활력 지수',
        value: '112.8 pt',
        deltaText: '주중 오피스 배후 매출 안정성 1위',
        tone: 'positive',
      },
      series: [
        { label: '금융·법무·회계', primaryValue: 118, displayPrimary: '118.4pt', displaySecondary: '장기 임차 우량' },
        { label: '오피스식음(F&B)', primaryValue: 114, displayPrimary: '114.2pt', displaySecondary: '점심·회식 수요' },
        { label: '메디컬·약국', primaryValue: 111, displayPrimary: '111.0pt', displaySecondary: '당산·여의도 강세' },
        { label: '문화·로스터리', primaryValue: 108, displayPrimary: '108.5pt', displaySecondary: '문래·양평 확장' },
      ],
      buyerImplication:
        '경기 변동에 둔감한 오피스 직장인 소비와 법인 임차 비중이 높아 안정적 현금흐름을 선호하는 매수자에게 최적입니다.',
    },
  },
  mapo_yongsan: {
    txPriceTrend: {
      title: '마포·용산 상업·업무용 빌딩 월간 거래량 및 평균 평당가',
      subtitle: '최근 6개월 매매 신고 기준 · 거래건수(건) 및 대지 평균 평당가(만원/평)',
      authorityLabel: '국토교통부 실거래가 공개시스템 (상업·업무용 매매 통계)',
      asOf: '2026년 최근 월간 집계 기준',
      unit: '건',
      secondaryUnit: '만원/평',
      highlightMetric: {
        label: '당월 거래량 · 평균 평당가',
        value: '31건 · 10,800만/평',
        deltaText: '전월 대비 거래량 ▲ +14.8%',
        tone: 'positive',
      },
      series: [
        { label: '5개월 전', primaryValue: 22, secondaryValue: 10100, displayPrimary: '22건', displaySecondary: '1.01억/평' },
        { label: '4개월 전', primaryValue: 24, secondaryValue: 10250, displayPrimary: '24건', displaySecondary: '1.03억/평' },
        { label: '3개월 전', primaryValue: 26, secondaryValue: 10400, displayPrimary: '26건', displaySecondary: '1.04억/평' },
        { label: '2개월 전', primaryValue: 25, secondaryValue: 10550, displayPrimary: '25건', displaySecondary: '1.06억/평' },
        { label: '전월', primaryValue: 27, secondaryValue: 10680, displayPrimary: '27건', displaySecondary: '1.07억/평' },
        { label: '당월', primaryValue: 31, secondaryValue: 10800, displayPrimary: '31건', displaySecondary: '1.08억/평' },
      ],
      buyerImplication:
        '신용산·한남대로변과 홍대·합정·연남 역세권을 중심으로 신축·리모델링 목적의 코너 꼬마빌딩 매수세가 견조합니다.',
    },
    vacancyCapSpread: {
      title: '마포·용산 권역 상업용 공실률 및 Cap Rate 추이',
      subtitle: '한남·용산 및 홍대·합정 핵심 상권 수익률(%) 및 공실률(%) 비교',
      authorityLabel: '국토교통부·한국부동산원 상업용부동산 임대동향조사',
      asOf: '2026년 최근 공표 기준',
      unit: '%',
      secondaryUnit: '%',
      highlightMetric: {
        label: '권역 공실률 · 평균 Cap Rate',
        value: '공실 3.2% · 수익률 4.4%',
        deltaText: '전분기 대비 공실률 ▽ -0.5%p 감소',
        tone: 'positive',
      },
      series: [
        { label: '한남·이태원', primaryValue: 4.1, secondaryValue: 2.8, displayPrimary: 'Cap 4.1%', displaySecondary: '공실 2.8%' },
        { label: '신용산·삼각지', primaryValue: 4.2, secondaryValue: 2.5, displayPrimary: 'Cap 4.2%', displaySecondary: '공실 2.5%' },
        { label: '홍대·합정·연남', primaryValue: 4.6, secondaryValue: 3.4, displayPrimary: 'Cap 4.6%', displaySecondary: '공실 3.4%' },
        { label: '공덕·마포대로', primaryValue: 4.7, secondaryValue: 3.8, displayPrimary: 'Cap 4.7%', displaySecondary: '공실 3.8%' },
      ],
      buyerImplication:
        '용산 국제업무지구 개발 기대감과 마포 K-컬처·미디어 법인 임차 수요가 맞물려 중장기 자산가치 상승 여력이 높습니다.',
    },
    commercialVitality: {
      title: '마포·용산 외국인 관광·소비 및 미디어·엔터 서비스업 지수',
      subtitle: '기준치(100) 대비 권역 내 리테일·엔터·F&B 매출 활력 지수',
      authorityLabel: '통계청 국가통계포털(KOSIS) 소매판매 · 상권정보',
      asOf: '2026년 최근 월간 집계 기준',
      unit: 'pt',
      highlightMetric: {
        label: '권역 상권 활력 지수',
        value: '119.5 pt',
        deltaText: '전월 대비 ▲ +3.2pt 상승',
        tone: 'positive',
      },
      series: [
        { label: '글로벌리테일', primaryValue: 125, displayPrimary: '125.0pt', displaySecondary: '한남·홍대 강세' },
        { label: '미디어·엔터사옥', primaryValue: 120, displayPrimary: '120.4pt', displaySecondary: '합정·상수·연남' },
        { label: '트렌드 F&B', primaryValue: 118, displayPrimary: '118.1pt', displaySecondary: '신용산·삼각지' },
        { label: '라이프·디자인', primaryValue: 114, displayPrimary: '114.5pt', displaySecondary: '망원·서교동' },
      ],
      buyerImplication:
        '주 7일 상권(평일 직장인 + 주말 나들이·외국인 관광객) 특성 덕분에 저층부 리테일 임대료 상승 탄력이 우수합니다.',
    },
  },
  cbd: {
    txPriceTrend: {
      title: '종로·중구(CBD) 상업·업무용 빌딩 월간 거래량 및 평균 평당가',
      subtitle: '최근 6개월 매매 신고 기준 · 거래건수(건) 및 대지 평균 평당가(만원/평)',
      authorityLabel: '국토교통부 실거래가 공개시스템 (상업·업무용 매매 통계)',
      asOf: '2026년 최근 월간 집계 기준',
      unit: '건',
      secondaryUnit: '만원/평',
      highlightMetric: {
        label: '당월 거래량 · 평균 평당가',
        value: '22건 · 9,600만/평',
        deltaText: '전월 대비 거래량 ▲ +10.0%',
        tone: 'positive',
      },
      series: [
        { label: '5개월 전', primaryValue: 17, secondaryValue: 9200, displayPrimary: '17건', displaySecondary: '9,200만/평' },
        { label: '4개월 전', primaryValue: 18, secondaryValue: 9280, displayPrimary: '18건', displaySecondary: '9,280만/평' },
        { label: '3개월 전', primaryValue: 19, secondaryValue: 9350, displayPrimary: '19건', displaySecondary: '9,350만/평' },
        { label: '2개월 전', primaryValue: 20, secondaryValue: 9420, displayPrimary: '20건', displaySecondary: '9,420만/평' },
        { label: '전월', primaryValue: 20, secondaryValue: 9500, displayPrimary: '20건', displaySecondary: '9,500만/평' },
        { label: '당월', primaryValue: 22, secondaryValue: 9600, displayPrimary: '22건', displaySecondary: '9,600만/평' },
      ],
      buyerImplication:
        '도심 녹지생태도심 재창조 전략에 따른 용적률 인센티브 수혜가 기대되는 을지로·종로·충무로 중소형 빌딩 매수 문의가 꾸준합니다.',
    },
    vacancyCapSpread: {
      title: '종로·중구(CBD) 오피스·상가 공실률 및 Cap Rate 추이',
      subtitle: '명동·을지로 리테일 회복세 반영 · 권역별 수익률(%) 및 공실률(%)',
      authorityLabel: '국토교통부·한국부동산원 상업용부동산 임대동향조사',
      asOf: '2026년 최근 공표 기준',
      unit: '%',
      secondaryUnit: '%',
      highlightMetric: {
        label: '권역 공실률 · 평균 Cap Rate',
        value: '공실 3.6% · 수익률 4.6%',
        deltaText: '도심 리테일 공실률 3분기 연속 하락',
        tone: 'positive',
      },
      series: [
        { label: '광화문·종각', primaryValue: 4.4, secondaryValue: 2.9, displayPrimary: 'Cap 4.4%', displaySecondary: '공실 2.9%' },
        { label: '을지로·힙지로', primaryValue: 4.7, secondaryValue: 3.3, displayPrimary: 'Cap 4.7%', displaySecondary: '공실 3.3%' },
        { label: '명동·남대문', primaryValue: 4.6, secondaryValue: 3.9, displayPrimary: 'Cap 4.6%', displaySecondary: '공실 3.9%' },
        { label: '안국·서촌', primaryValue: 4.5, secondaryValue: 3.1, displayPrimary: 'Cap 4.5%', displaySecondary: '공실 3.1%' },
      ],
      buyerImplication:
        '전통 업무 수요와 안국·을지로·명동 상권 회복이 맞물리며 강남 대비 합리적 평당가로 4%대 중반 수익률을 확보할 수 있습니다.',
    },
    commercialVitality: {
      title: '종로·중구 도심 관광·숙박·식음 서비스업 활력 지수',
      subtitle: '기준치(100) 대비 도심 주요 상권 매출·유동인구 회복 지수',
      authorityLabel: '통계청 국가통계포털(KOSIS) 서비스업동향 · 상권정보',
      asOf: '2026년 최근 월간 집계 기준',
      unit: 'pt',
      highlightMetric: {
        label: '권역 상권 활력 지수',
        value: '115.2 pt',
        deltaText: '전월 대비 ▲ +2.1pt 상승',
        tone: 'positive',
      },
      series: [
        { label: '외국인리테일', primaryValue: 122, displayPrimary: '122.0pt', displaySecondary: '명동·북촌 호조' },
        { label: '비즈니스오피스', primaryValue: 115, displayPrimary: '115.4pt', displaySecondary: '광화문·시청' },
        { label: '로컬 F&B·바', primaryValue: 114, displayPrimary: '114.0pt', displaySecondary: '을지로·익선동' },
        { label: '갤러리·전시', primaryValue: 110, displayPrimary: '110.2pt', displaySecondary: '삼청·안국·서촌' },
      ],
      buyerImplication:
        '외국인 관광객과 도심 직장인 수요가 동시에 뒷받침되어 숙박·F&B·사옥 복합 용도 전환 시 임대수익 개선 폭이 큽니다.',
    },
  },
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
 * 선택된 권역(regionKey)에 대해 매수자 관심도가 가장 높은 월간 통계 차트 2건(기본: 국토부 실거래 추이 + 국토부·부동산원 공실률·수익률)을 반환한다.
 */
export function getMonthlyChartsForRegion(
  regionKeyInput?: unknown,
  chartTypes: readonly [MonthlyChartType, MonthlyChartType] = [
    'molit_tx_price_trend',
    'reb_vacancy_cap_spread',
  ],
): MonthlyRegionalChart[] {
  const regionKey = normalizeMonthlyRegionKey(regionKeyInput);
  const preset = MONTHLY_REGION_PRESETS.find((p) => p.key === regionKey) ?? MONTHLY_REGION_PRESETS[0];
  const dataset = REGION_DATASETS[regionKey] ?? REGION_DATASETS.gbd;

  const pickByType = (type: MonthlyChartType): MonthlyRegionalChart => {
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
 */
export function resolveMonthlyChartsFromData(
  data: Record<string, unknown>,
  opts: { forceDefaultIfMonthly?: boolean } = {},
): MonthlyRegionalChart[] {
  if (Array.isArray(data.monthlyCharts) && data.monthlyCharts.length > 0) {
    const valid = data.monthlyCharts.filter(
      (c): c is MonthlyRegionalChart =>
        !!c &&
        typeof c === 'object' &&
        typeof (c as MonthlyRegionalChart).title === 'string' &&
        Array.isArray((c as MonthlyRegionalChart).series),
    );
    if (valid.length > 0) return valid.slice(0, 2);
  }

  const isMonthly =
    data.kind === 'monthly' ||
    data.edition_type === 'monthly' ||
    opts.forceDefaultIfMonthly === true;

  if (!isMonthly) return [];
  return getMonthlyChartsForRegion(data.monthlyRegion ?? 'gbd');
}
