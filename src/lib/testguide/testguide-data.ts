/**
 * @file src/lib/testguide/testguide-data.ts
 * @description SSOT data for https://credeal.net/testguide interactive Golden Test Workbench
 * (3 real-world IM deals: Dongkyo THE.PARK, Bucheon Donga, Yeoksam Yeosam + CSVs + 12 Image Assets).
 */

export interface TestGuideHighlight {
  tone: 'amber' | 'sky' | 'mint';
  toneLabel: string;
  headline: string;
  brief: string;
}

export interface TestGuideImageAsset {
  filename: string;
  format: 'JPG' | 'PNG' | 'WEBP';
  roleLabel: string;
  caption: string;
  previewUrl: string;
  downloadUrl: string;
}

export interface TestGuideCheckItem {
  id: string;
  title: string;
  expected: string;
  failCondition: string;
  trapCode?: string;
}

export interface TestGuideDeal {
  id: 'deal1' | 'deal2' | 'deal3';
  number: number;
  code: string;
  badge: string;
  name: string;
  shortName: string;
  jibunAddress: string;
  roadAddress: string;
  pnu: string;
  askingPriceEok: string;
  askingPriceManwon: string;
  waveAPostureLabel: string;
  waveAPostureCode: string;
  waveBPriceEok: string;
  waveBPriceManwon: string;
  waveBPostureLabel: string;
  waveBPostureCode: string;
  waveBMutationSummary: string;
  manualOverrideSample?: string;
  specs: {
    zoning: string;
    landAreaSqm: string;
    landAreaPyeong: string;
    gfaSqm: string;
    gfaPyeong: string;
    bcrPct: string;
    farPct: string;
    floors: string;
    completionDate: string;
    parking: string;
    elevators: string;
    officialLandPrice: string;
  };
  rentSummary: {
    totalDepositManwon: string;
    totalDepositReadout: string;
    totalMonthlyRentManwon: string;
    totalMonthlyCamManwon: string;
    occupancyPct: string;
    capRateNote: string;
  };
  brokerInfo: {
    brokerageName: string;
    brokerName: string;
    brokerPhone: string;
    handoverNote: string;
  };
  traps: Array<{
    code: string;
    title: string;
    description: string;
  }>;
  brokerMemoText: string;
  waveAHighlights: TestGuideHighlight[];
  waveBHighlights: TestGuideHighlight[];
  csvFilename: string;
  csvDownloadUrl: string;
  csvContent: string;
  tsvContent: string;
  imageFolder: string;
  images: TestGuideImageAsset[];
  waveAChecks: TestGuideCheckItem[];
  waveBChecks: TestGuideCheckItem[];
}

const CSV_01 = [
  '층,호수,용도,임차인,면적(㎡),면적(평),보증금(만원),월임대료(만원),월관리비(만원),만기일,임대상태,비고',
  '4F,401호,2종근생,돌디 스튜디오,57.67,17.45,3000,190,17.5,2026-12-01,임대중,공원기준 5F',
  '3F,301호,2종근생,연을담다 미용실,57.67,17.45,2000,231,10,2027-10-05,임대중,공원기준 4F',
  '2F,201호,1종근생,마음쉼표 정신건강의학과,78.96,23.89,3000,309,23,2027-01-19,임대중,공원기준 3F',
  '1F,101호,2종근생,그랑핸드,65.96,19.95,3000,315,23,2026-08-08,임대중,공원기준 2F',
  'B1F,B101호,1종근생,그랑핸드 (B1~B2 통합),77.24,23.36,11000,772,50,2027-01-19,임대중,공원기준 1F (B1·B2 금액합산)',
  'B2F,B201호,1종근생,그랑핸드 (B1 통합포함),88.61,26.80,0,0,0,2027-01-19,임대중,공원기준 B1 (B1에 금액합산)',
].join('\n');

const CSV_02 = [
  '층,호수,용도,임차인,보증금(만원),월임대료(만원),월관리비(만원),만기일,임대상태,비고',
  'B1F,B101호,유흥/노래방,쉘브르노래방,2000,120,27.2,2027-08-31,임대중,2025-08-20~2027-08-31',
  'B1F,B102호,유흥/단란주점,엘브론7080,1000,100,22.6,2027-08-31,임대중,2025-08-20~2027-08-31',
  '1F,101호,음식점,미미마라탕,1500,100,9.3,2027-03-09,임대중,2025-03-10~2027-03-09',
  '1F,102호,음식점,국수집,2000,130,15.0,2027-09-29,임대중,2025-09-30~2027-09-29',
  '1F,103호,음식점,피자스쿨,5000,170,12.0,2027-05-31,임대중,2025-05-27~2027-05-31',
  '2F,201호,의원/치과,한마음치과,5000,290,42.0,-,공실,Wave A 공실 / Wave B 임대중 전환(보5000/월290/관42)',
  '2F,202호,업무시설,보험사사무실,3000,140,24.9,-,임대중,2019-03-01~ 장기임차',
  '3F,301호,고시원,아이비하우스(고시원),11000,360,76.8,-,임대중,2017-02-28~ 장기임차',
  '4F,401호,근생/창고,아이엠박스 (무인창고),3000,180,30.6,-,임대중,무인창고 계약협의중',
  '4F,402호,근생/창고,아이엠박스 (무인창고),1000,95,13.2,-,임대중,무인창고 계약협의중',
  '4F,403호,업무시설,렌터카,1000,55,6.0,2026-04-30,임대중,2014-04-30~2026-04-30',
  '4F,404호,근생/창고,아이엠박스 (무인창고),1000,70,7.8,-,임대중,무인창고 계약협의중',
  '5F,501호,교육/강의실,강의실 (리스백조건),7000,380,76.8,-,임대중,매도자 리스백조건',
  '6F,601호,업무시설,엔텔레콤,4000,150,40.3,-,임대중,2015-07-26~ 장기임차',
  '6F,602호,업무시설,엔텔레콤,2000,100,20.0,-,임대중,2013-07-11~ 장기임차',
  '7F,701호,근생/파티룸,하이브파티룸,1000,80,21.0,2027-08-31,임대중,2025-09-01~2027-08-31',
  '주차타워,기계식22대,부대수익,월고정주차 (대당 9만원),0,0,198.0,-,임대중,기계식 주차타워 22대 고정주차 수익',
].join('\n');

const CSV_03 = [
  '층,호수,용도,임차인,면적(㎡),면적(평),보증금(만원),월임대료(만원),월관리비(만원),만기일,임대상태,비고',
  'B1F,전층,업무시설,(주)스파크플러스,1712.40,518.00,20936,2221.1,1703.6,2031-02-28,임대중,마스터리스',
  '1F,101호,금융업소,농협은행 역삼금융센터,683.80,206.85,130000,7128.5,1155.1,2027-09-30,임대중,1F+202호 합산반영',
  '2F,202호,금융업소,농협은행 역삼금융센터 (1F 합산반영),439.67,133.00,0,0,0,2027-09-30,임대중,1F에 금액합산',
  '2F,201호,업무시설,리온홀딩스(유),439.67,133.00,15000,1064.0,518.7,2026-02-15,임대중,임대중',
  '3F,301호,업무시설,서우회계법인 (12층 합산반영),626.18,189.42,0,0,0,2027-04-30,임대중,12F에 금액합산',
  '3F,302호,업무시설,(주)인바이트커뮤니케이션,112.40,34.00,0,104.8,95.2,2026-03-31,임대중,무보증 월세',
  '3F,303호,업무시설,(주)여삼 (자가사용),107.70,32.58,0,0,0,-,자가사용,소유자 자가점유',
  '4F,전층,업무시설,(주)스파크플러스,846.28,256.00,22784,2417.2,841.9,2031-02-28,임대중,마스터리스',
  '5F,전층,업무시설,(주)스파크플러스,846.28,256.00,22784,2417.2,841.9,2031-02-28,임대중,마스터리스',
  '6F,전층,업무시설,(주)스파크플러스,846.28,256.00,22784,2417.2,841.9,2031-02-28,임대중,마스터리스',
  '7F,전층,업무시설,(주)스파크플러스,846.28,256.00,22784,2417.2,841.9,2031-02-28,임대중,마스터리스',
  '8F,전층,업무시설,(주)스파크플러스,846.28,256.00,22784,2417.2,841.9,2031-02-28,임대중,마스터리스',
  '9F,전층,업무시설,(주)스파크플러스,846.28,256.00,22784,2417.2,841.9,2031-02-28,임대중,마스터리스',
  '10F,전층,업무시설,(주)스파크플러스,846.28,256.00,22784,2417.2,841.9,2031-02-28,임대중,마스터리스',
  '11F,전층,업무시설,(주)스파크플러스,846.28,256.00,22784,2417.2,841.9,2031-02-28,임대중,마스터리스',
  '12F,전층,업무시설,서우회계법인 (301·12F·1301 합산),878.85,265.85,51000,4773.5,2273.1,2027-04-30,임대중,301·12F·1301 금액합산',
  '13F,1301호,업무시설,서우회계법인 (12F 합산반영),373.56,113.00,0,0,0,2027-04-30,임대중,12F에 금액합산',
  '13F,1302호,업무시설,서우회계법인,252.66,76.43,10000,611.5,305.7,2027-04-30,임대중,임대중',
  '13F,1303호,업무시설,서우회계법인,252.66,76.43,10000,611.5,305.7,2027-04-30,임대중,임대중',
  '14F,전층,업무시설,(주)스파크플러스,846.28,256.00,22784,2417.2,841.9,2031-02-28,임대중,마스터리스',
  '15F,전층,업무시설,(주)스파크플러스,846.28,256.00,22784,2417.2,841.9,2031-02-28,임대중,마스터리스',
].join('\n');

function csvToTsv(csv: string): string {
  return csv
    .split('\n')
    .map((line) => line.split(',').join('\t'))
    .join('\n');
}

export const TESTGUIDE_IMAGE_CDN_MAP: Record<string, string> = {
  '01_동교동_THEPARK_전면외관.jpg':
    'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide/deal1/01_exterior.jpg',
  '02_동교동_THEPARK_1층출입구.jpg':
    'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide/deal1/02_entrance.jpg',
  '03_동교동_THEPARK_내부실내.png':
    'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide/deal1/03_interior.png',
  '04_동교동_THEPARK_루프탑테라스.webp':
    'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide/deal1/04_rooftop.webp',
  '01_부천_동아빌딩_전면외관.jpg':
    'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide/deal2/01_exterior.jpg',
  '02_부천_동아빌딩_1층로비출입구.jpg':
    'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide/deal2/02_lobby.jpg',
  '03_부천_동아빌딩_기준층내부실내.png':
    'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide/deal2/03_interior.png',
  '04_부천_동아빌딩_주차장설비.webp':
    'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide/deal2/04_parking.webp',
  '01_역삼동_여삼빌딩_전면외관.jpg':
    'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide/deal3/01_exterior.jpg',
  '02_역삼동_여삼빌딩_메인로비.jpg':
    'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide/deal3/02_lobby.jpg',
  '03_역삼동_여삼빌딩_오피스내부.png':
    'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide/deal3/03_interior.png',
  '04_역삼동_여삼빌딩_지하주차장.webp':
    'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide/deal3/04_parking.webp',
};

function buildImageList(
  folder: string,
  items: Array<{ filename: string; format: 'JPG' | 'PNG' | 'WEBP'; roleLabel: string; caption: string }>
): TestGuideImageAsset[] {
  return items.map((it) => {
    const apiBaseUrl = `/api/public/testguide-assets/images/${encodeURIComponent(folder)}/${encodeURIComponent(it.filename)}`;
    return {
      ...it,
      previewUrl: apiBaseUrl,
      downloadUrl: `${apiBaseUrl}?download=1`,
    };
  });
}

export const TESTGUIDE_DEALS: TestGuideDeal[] = [
  {
    id: 'deal1',
    number: 1,
    code: 'DEAL-01',
    badge: '77억 꼬마/리테일 · 경의선숲길',
    name: 'THE.PARK Building (더파크빌딩)',
    shortName: '동교동 THE.PARK빌딩',
    jibunAddress: '서울특별시 마포구 동교동 189-6',
    roadAddress: '서울특별시 마포구 와우산로37길 9',
    pnu: '1144012100101890006',
    askingPriceEok: '77',
    askingPriceManwon: '770000',
    waveAPostureLabel: '임대수익 (안정 배당 / 일반 매각)',
    waveAPostureCode: 'core_income',
    waveBPriceEok: '72',
    waveBPriceManwon: '720000',
    waveBPostureLabel: '시세차익·밸류애드 (Value-Add)',
    waveBPostureCode: 'value_add',
    waveBMutationSummary: '매매가를 77억(770,000만원) → 72억(720,000만원)으로 5억 인하하고, 투자 목적을 밸류애드(시세차익)로 변경',
    specs: {
      zoning: '제2종일반주거지역',
      landAreaSqm: '137.2',
      landAreaPyeong: '41.50',
      gfaSqm: '426.11',
      gfaPyeong: '128.90',
      bcrPct: '59.81%',
      farPct: '189.69% (공원레벨 실질 310.58%)',
      floors: '지하 2층 ~ 지상 4층 (공원기준 B1~5F)',
      completionDate: '2019-05-30',
      parking: '옥외 자주식 3대',
      elevators: '없음 (승용 0대)',
      officialLandPrice: '11,670,000원/㎡ (2025.01 기준)',
    },
    rentSummary: {
      totalDepositManwon: '22,000만원',
      totalDepositReadout: '2억 2,000만원',
      totalMonthlyRentManwon: '1,817만원',
      totalMonthlyCamManwon: '123.5만원 (약 124만원)',
      occupancyPct: '100.0% (전층 만실 · 공실 0)',
      capRateNote: 'Wave A(77억): Gross 2.83% / 보증금차감 2.91% / 순관리비포함 3.09% → Wave B(72억): Gross 3.03% / 보증금차감 3.12%',
    },
    brokerInfo: {
      brokerageName: '제이에스부동산중개(주)',
      brokerName: '김중개 대표공인중개사',
      brokerPhone: '02-553-2009',
      handoverNote: '전층 우량 임차인(그랑핸드 등) 만실 임대차 승계 조건',
    },
    traps: [
      {
        code: 'TRAP-1A',
        title: '통합계약(B1+B2 그랑핸드) 0원 행 공실 오판 함정',
        description:
          '유명 향수 브랜드 그랑핸드가 B1과 B2를 통합 계약(보 1.1억 / 월 772만)하여 B2 행의 금액을 0원으로 입력했을 때, 시스템이 B2를 공실로 착각하지 않고 점유율 100.0%를 유지하는지 확인합니다.',
      },
      {
        code: 'TRAP-1B',
        title: '승강기 0대 명시 표기 함정',
        description:
          '승강기가 없는 건물일 때 하이픈(-)이나 "정보 없음"으로 숨기지 않고 Slide 3 건축물 개요에 "승용 0대"로 명확히 표기하는지 확인합니다.',
      },
      {
        code: 'TRAP-1C',
        title: '경사지 레벨차 실질 사업용적률(310.58%) 맥락 보존',
        description:
          '공부상 용적률(189.69%)과 경의선 숲길 공원 레벨 기준 실질 사업용적률(310.58%)이 투자 하이라이트에 함께 설명되는지 확인합니다.',
      },
    ],
    brokerMemoText: `[매물명] THE.PARK Building (더파크빌딩)
[소재지] 서울시 마포구 동교동 189-6 (도로명: 서울시 마포구 와우산로37길 9)
[용도지역] 제2종 일반주거지역
[대지면적] 137.20㎡ (41.50평) / [건축면적] 82.06㎡ (24.82평) / [연면적] 426.11㎡ (128.90평)
[건폐율/용적률] 건폐율 59.81% / 공부상 용적률 189.69% (경의선 숲길 공원 레벨 기준 실질 사업용적률 310.58%)
[규모/주용도] 지하 2층 ~ 지상 4층 (공원 기준 지하 1층 ~ 지상 5층) / 근린생활시설(리테일)
[사용승인일] 2019.05.30 / [주차] 옥외 자주식 3대 / [승강기] 없음 (0대)
[공시지가] 2025년 1월 기준 1,167만원/㎡
[매매금액] 77억원 (대지 평당 1.86억원 / 연면적 평당 5,974만원)
[임대현황 요약] 전층 100% 만실 (공실 없음). 총 보증금 2억 2,000만원 / 월 임대료 1,817만원 / 월 관리비 수입 124만원 (월 청소비 14만원만 지출되어 순임대관리수익 월 1,927만원, 기대수익률 3.09%).
[핵심 투자포인트]
1. 홍대 경의선 숲길 공원을 정면으로 접한 전층 근린생활시설 디자인 랜드마크 빌딩
2. 공부상 지하1~2층이 경의선 숲길 공원 레벨에서는 지상 1층·지하 1층으로 직접 진·출입되어 사업용적률 310.58% 효과 시현
3. B1~1F 유명 향수 브랜드 '그랑핸드(GRANHAND)' 플래그십 입점 등 우량 임차인 100% 만실 운영 중`,
    waveAHighlights: [
      {
        tone: 'amber',
        toneLabel: '핵심 장점 1 (입지)',
        headline: '홍대 경의선 숲길 공원을 정면으로 접한 전층 근생 디자인 랜드마크',
        brief: '연트럴파크 산책로 코너 접면으로 가시성과 유동인구 흡입력이 탁월합니다.',
      },
      {
        tone: 'sky',
        toneLabel: '핵심 장점 2 (용적률)',
        headline: '공원 레벨 기준 실질 사업용적률 310.58% 효과 시현 (공부상 189.69%)',
        brief: '공부상 지하1~2층이 공원 레벨에서는 지상 1층·지하 1층으로 직접 진출입됩니다.',
      },
      {
        tone: 'mint',
        toneLabel: '핵심 장점 3 (수익)',
        headline: '유명 향수 브랜드 그랑핸드(GRANHAND) 등 전층 100% 만실 운영',
        brief: '보증금 2.2억 / 월임대료 1,817만원 / 순관리수익 포함 월 1,926.5만원 안정적 현금흐름.',
      },
    ],
    waveBHighlights: [
      {
        tone: 'amber',
        toneLabel: 'Wave B 장점 1 (가격 인하 반영)',
        headline: '매매가 72억 조정(평당 1.73억)으로 순투자 수익률 3.12% 확보',
        brief: '매매 희망가 72억 조정으로 진입 Cap Rate 메리트가 대폭 강화되었습니다.',
      },
      {
        tone: 'sky',
        toneLabel: 'Wave B 장점 2',
        headline: '공원 레벨 기준 실질 사업용적률 310.58% 효과 시현',
        brief: '공부상 지하1~2층이 공원 레벨에서는 지상 1층·지하 1층으로 직접 진출입됩니다.',
      },
      {
        tone: 'mint',
        toneLabel: 'Wave B 장점 3',
        headline: '유명 향수 브랜드 그랑핸드(GRANHAND) 등 전층 100% 만실 운영',
        brief: '보증금 2.2억 / 월임대료 1,817만원 안정적 현금흐름.',
      },
    ],
    csvFilename: 'rentroll_01_dongkyo_thepark.csv',
    csvDownloadUrl: '/api/public/testguide-assets/csv/rentroll_01_dongkyo_thepark.csv',
    csvContent: CSV_01,
    tsvContent: csvToTsv(CSV_01),
    imageFolder: '01_동교동_THEPARK',
    images: buildImageList('01_동교동_THEPARK', [
      {
        filename: '01_동교동_THEPARK_전면외관.jpg',
        format: 'JPG',
        roleLabel: '표지 대표 · 건물 외관',
        caption: '마포구 동교동 THE.PARK 빌딩 전면 외관 (원본 PDF 추출)',
      },
      {
        filename: '02_동교동_THEPARK_1층출입구.jpg',
        format: 'JPG',
        roleLabel: '주 출입구 · 1층 전면',
        caption: '경의선숲길 공원 접면 1층 출입구 및 테라스 동선',
      },
      {
        filename: '03_동교동_THEPARK_내부실내.png',
        format: 'PNG',
        roleLabel: '실내 공간 · PNG 포맷검증',
        caption: '지상층 근린생활시설 내부 전용 공간 (PNG 호환 검증)',
      },
      {
        filename: '04_동교동_THEPARK_루프탑테라스.webp',
        format: 'WEBP',
        roleLabel: '옥상/테라스 · WebP 포맷검증',
        caption: '4층 및 루프탑 테라스 조망 (WebP 자동변환 검증)',
      },
    ]),
    waveAChecks: [
      {
        id: 'A1-1',
        title: '대지면적 / 연면적 일치',
        expected: '대지 137.20㎡ (41.50평) / 연면적 426.11㎡ (128.90평)',
        failCondition: '면적이 0이거나 평수 환산이 틀린 경우',
      },
      {
        id: 'A1-2',
        title: '보증금 / 월세 합계 일치',
        expected: '보증금 2억 2,000만원 (22,000만원) / 월임대료 1,817만원',
        failCondition: 'B2 금액이 중복 더해진 경우',
      },
      {
        id: 'A1-3',
        trapCode: 'TRAP-1A',
        title: '통합계약(B2 0원) 점유율 100% 유지',
        expected: '점유율 100.0% (공실률 0.0%, 전층 만실)',
        failCondition: 'B2층 월세가 0원이라고 공실로 오판해 점유율이 79~83%로 깎인 경우',
      },
      {
        id: 'A1-4',
        title: '수익률 (Cap Rate) 정확성',
        expected: 'Gross 2.83% / 보증금 차감 2.91% / 순관리비 포함 3.09%',
        failCondition: '엉뚱한 수익률이 나오는 경우',
      },
      {
        id: 'A1-5',
        trapCode: 'TRAP-1B',
        title: '승강기 0대 명시 표기',
        expected: 'Slide 3 건축물 개요에 "승용 0대" 또는 "0대" 표시',
        failCondition: '하이픈(-)으로 숨기거나 "정보 없음", "NaN대"로 나오는 경우',
      },
      {
        id: 'A1-6',
        title: '사진 4장(JPG·PNG·WebP) 반영',
        expected: '표지(1면)와 현장 사진 갤러리(9면)에 4장이 깨짐 없이 삽입됨',
        failCondition: 'WebP/PNG 이미지가 깨지거나 누락된 경우',
      },
    ],
    waveBChecks: [
      {
        id: 'B1-1',
        title: '77억 → 72억 수익률 즉시 상승',
        expected: 'Gross 2.83% → 3.03% (보증금 차감 2.91% → 3.12%)',
        failCondition: '매매가를 낮췄는데도 옛날 수익률(2.83%)에 머물러 있는 경우',
      },
      {
        id: 'B1-2',
        title: 'PPTX 내 구 매매가(77억) 잔상 제거',
        expected: '새로 받은 PPTX 전 슬라이드에 77억이 0건이고 모두 72억으로 변경됨',
        failCondition: '표지나 본문에 옛날 가격 77억이 남아 있는 경우',
      },
    ],
  },
  {
    id: 'deal2',
    number: 2,
    code: 'DEAL-02',
    badge: '58억 비서울 코너 근생/메디컬 · 25년 올수리',
    name: '동아빌딩',
    shortName: '부천 심곡동 동아빌딩',
    jibunAddress: '경기도 부천시 원미구 심곡동 349-10',
    roadAddress: '경기도 부천시 원미구 부천로39번길 8',
    pnu: '4119210200103490010',
    askingPriceEok: '58',
    askingPriceManwon: '580000',
    waveAPostureLabel: '임대수익 (LP 안정 배당형)',
    waveAPostureCode: 'core_income',
    waveBPriceEok: '58',
    waveBPriceManwon: '580000',
    waveBPostureLabel: '시세차익·밸류애드 (201호 치과 공실 → 임대중 전환)',
    waveBPostureCode: 'value_add',
    waveBMutationSummary:
      '렌트롤 6번째 줄 [2F 201호 한마음치과 (보 5,000 / 월 290)] 상태를 공실 → 임대중으로 전환하고, 핵심 장점 1번에 수동편집 잠금 문구를 입력',
    manualOverrideSample:
      '[실전검증-수동편집] 2025년 9월 전관 리모델링 완료 및 부천역 도보 3분 코너 메디컬 빌딩',
    specs: {
      zoning: '일반상업지역',
      landAreaSqm: '535.6',
      landAreaPyeong: '162.02',
      gfaSqm: '2758.21',
      gfaPyeong: '834.36',
      bcrPct: '79.24%',
      farPct: '445.24%',
      floors: '지하 1층 ~ 지상 7층 (2025년 9월 전관 리모델링 완료)',
      completionDate: '1998-11-17',
      parking: '총 28대 (기계식 주차타워 22대 + 자주식 6대)',
      elevators: '승강기 2대 (승용 1대, 화물 1대)',
      officialLandPrice: '4,680,000원/㎡ (평당 1,592만원)',
    },
    rentSummary: {
      totalDepositManwon: 'Wave A(201호 공실): 45,500만원 → Wave B(만실): 50,500만원',
      totalDepositReadout: '4억 5,500만원 → 만실 시 5억 500만원',
      totalMonthlyRentManwon: 'Wave A: 2,230만원 → Wave B(만실): 2,520만원',
      totalMonthlyCamManwon: 'Wave A: 601.5만원 → Wave B(만실): 643.5만원 (주차타워 월 198만 포함)',
      occupancyPct: 'Wave A: 94.1% (1개 공실) → Wave B: 100.0% (전층 만실)',
      capRateNote:
        'Wave A(201호 공실): Gross 4.61% / 보증금차감 5.01% → Wave B(만실 전환): Gross 5.21% / 보증금차감 5.71% (관리비포함 최대 7.17%)',
    },
    brokerInfo: {
      brokerageName: '제이에스부동산중개(주)',
      brokerName: '정순근 위원',
      brokerPhone: '02-553-2009',
      handoverNote: '2025년 9월 전관 올수리 완료 · 501호 매도자 리스백 및 임대차 승계',
    },
    traps: [
      {
        code: 'TRAP-2A',
        title: '비서울(경기도 부천시 원미구) 시군구코드 행정구역 개편 극복',
        description:
          '부천시 구제 개편(41192 원미구 ↔ 41195 ↔ 41190) 코드에서도 건축물대장 면적(대지 535.6㎡, 연면적 2,758.21㎡)이 100% 자동으로 채워지는지 확인합니다.',
      },
      {
        code: 'TRAP-2B',
        title: '기계식 주차타워(22대, 월 198만원) 부대수익 입력 시 연면적 비왜곡',
        description:
          '주차타워 월 고정주차 수익(198만원) 행을 넣었을 때 건물 연면적 합계가 왜곡되지 않고 부대수익/관리비만 정확히 합산되는지 확인합니다.',
      },
      {
        code: 'TRAP-2C',
        title: '17개 다중 분할 호실 PPTX 자동 페이지 분할 (표 잘림 0건)',
        description:
          '호실이 17개 행일 때 PPTX 렌트롤 슬라이드가 자동으로 2장(렌트롤 1/2, 2/2)으로 나뉘어 하단 표 잘림이 없는지 확인합니다.',
      },
    ],
    brokerMemoText: `[매물명] 부천 심곡동 동아빌딩 (부천역 도보 3분 대학로길 메인 코너)
[소재지] 경기도 부천시 원미구 심곡동 349-10 (도로명: 경기도 부천시 원미구 부천로39번길 8)
[용도지역] 일반상업지역
[대지면적] 535.60㎡ (162.30평) / [건축면적] 425.12㎡ (128.60평, 건폐율 79.24%)
[연면적] 2,758.21㎡ (834.35평, 용적률 445.24% / 지하1층 373.5㎡ + 지상1~7층 2,384.7㎡)
[규모/주용도] 지하 1층 ~ 지상 7층 / 근린생활시설
[준공연도/리모델링] 1998.11.17 준공 → 2025년 7월~9월 내외부·승강기·기계식주차기·상하수도·소방 설비 전체 리모델링 완료!
[승강기/주차] 승강기 2대 (승용 1대, 화물 1대) / 주차 총 28대 (기계식 주차타워 22대 + 자주식 6대)
[위반건축물] 없음 (N)
[공시지가] 평당 1,592만원 (4,680,000원/㎡, 공시지가 합계 25억 8,381만원)
[매매금액] 58억원 (토지 평당 3,573만원 / 인근 감정가·밸류맵 90~106억 대비 급매가 / 현재 대출 20.5억)
[임대수익 요약]
- 현황(201호 한마음치과 공실 제외): 보증금 4억 5,500만원 / 월 임대료 2,230만원 / 관리비 601.5만원
- 만실 기준(201호 치과 + 주차타워 월고정주차 22대 포함): 보증금 5억 500만원 / 월 임대료 2,520만원 / 관리비 643.5만원 (만실 기대수익률 7.17%)
[핵심 투자포인트]
1. 1호선 부천역 북부광장 도보 3분(200m), 일일 유동인구 20만명 대학로 먹자상권 사거리 코너 빌딩
2. 2025년 9월 전관 리모델링 완료로 추가 자본적 지출(CapEx) 부담 제로
3. 기계식 주차타워 22대 유료 고정주차 운영(대당 월 9만원, 월 198만원 부대수익)으로 수익률 극대화`,
    waveAHighlights: [
      {
        tone: 'amber',
        toneLabel: '핵심 장점 1 (입지)',
        headline: '1호선 부천역 북부광장 도보 3분 대학로 먹자상권 메인 사거리 코너',
        brief: '일일 유동인구 20만명 배후의 핵심 상업지 코너 빌딩입니다.',
      },
      {
        tone: 'sky',
        toneLabel: '핵심 장점 2 (리모델링)',
        headline: '2025년 9월 내외부·승강기·주차타워·배관·소방 전관 리모델링 완료',
        brief: '매수 후 추가 자본적 지출(CapEx) 부담이 전혀 없는 신축급 컨디션입니다.',
      },
      {
        tone: 'mint',
        toneLabel: '핵심 장점 3 (수익)',
        headline: '기계식 주차타워 22대 유료 고정주차(월 198만원) 및 고수익 현금흐름',
        brief: '현재 보증금 4.55억 / 월임대료 2,230만원, 201호 임대 완료 시 월 2,520만원.',
      },
    ],
    waveBHighlights: [
      {
        tone: 'amber',
        toneLabel: 'Wave B 장점 1 (수동편집 잠금 검증용)',
        headline: '[실전검증-수동편집] 2025년 9월 전관 리모델링 완료 및 부천역 도보 3분 코너 메디컬 빌딩',
        brief: '수동 편집 잠금(Override Lock) 검증 문구 및 201호 임대 완료 시 전층 100% 만실.',
      },
      {
        tone: 'sky',
        toneLabel: 'Wave B 장점 2',
        headline: '2025년 9월 내외부·승강기·주차타워·배관·소방 전관 리모델링 완료',
        brief: '매수 후 추가 자본적 지출(CapEx) 부담이 전혀 없는 신축급 컨디션입니다.',
      },
      {
        tone: 'mint',
        toneLabel: 'Wave B 장점 3',
        headline: '만실 전환 시 보증금 5억 500만 / 월임대료 2,520만 (관리비 포함 월 3,163.4만)',
        brief: '201호 한마음치과 임대 완료로 순투자금 기준 수익률 5.71% 달성.',
      },
    ],
    csvFilename: 'rentroll_02_bucheon_donga.csv',
    csvDownloadUrl: '/api/public/testguide-assets/csv/rentroll_02_bucheon_donga.csv',
    csvContent: CSV_02,
    tsvContent: csvToTsv(CSV_02),
    imageFolder: '02_부천_동아빌딩',
    images: buildImageList('02_부천_동아빌딩', [
      {
        filename: '01_부천_동아빌딩_전면외관.jpg',
        format: 'JPG',
        roleLabel: '표지 대표 · 코너 외관',
        caption: '부천역 도보 3분 대학로 사거리 코너 동아빌딩 전면 외관',
      },
      {
        filename: '02_부천_동아빌딩_1층로비출입구.jpg',
        format: 'JPG',
        roleLabel: '1층 로비 · 승강기 2대',
        caption: '1층 주출입구 및 신형 승강기 2대 리모델링 로비',
      },
      {
        filename: '03_부천_동아빌딩_기준층내부실내.png',
        format: 'PNG',
        roleLabel: '실내 공간 · PNG 포맷검증',
        caption: '기준층 메디컬·학원 임대 전용 공간 (PNG 호환 검증)',
      },
      {
        filename: '04_부천_동아빌딩_주차장설비.webp',
        format: 'WEBP',
        roleLabel: '주차장/설비 · WebP 포맷검증',
        caption: '기계식 22대 + 자주식 6대 총 28대 주차 설비 (WebP 자동변환 검증)',
      },
    ]),
    waveAChecks: [
      {
        id: 'A2-1',
        trapCode: 'TRAP-2A',
        title: '경기도 부천시 원미구 공부 자동 채움',
        expected: '대지 535.60㎡ / 연면적 2,758.21㎡ / 건폐율 79.24% / 용적률 445.24%',
        failCondition: '경기도 부천시 주소에서 대장 조회가 실패하거나 면적이 0으로 뜨는 경우',
      },
      {
        id: 'A2-2',
        title: 'Wave A (201호 공실) 보증금·월세 합계',
        expected: '201호 공실 제외 합계: 보증금 45,500만원 / 월세 2,230만원',
        failCondition: '공실로 표시된 201호(5,000/290)가 현황 임대료에 잘못 합산된 경우',
      },
      {
        id: 'A2-3',
        trapCode: 'TRAP-2B',
        title: '주차타워 부대수익(월 198만) 연면적 비왜곡',
        expected: '주차타워 행이 추가되어도 건물 연면적(2,758.21㎡)이 변하지 않음',
        failCondition: '주차대수 22가 면적에 더해져 연면적이 틀어지는 경우',
      },
      {
        id: 'A2-4',
        trapCode: 'TRAP-2C',
        title: '17개 호실 PPTX 자동 분할 (표 잘림 0건)',
        expected: 'PPTX에서 렌트롤 (1/2), (2/2)로 자동 분할되어 6~7층이 잘리지 않음',
        failCondition: '표가 슬라이드 하단 밖으로 뚫고 나가 잘리는 경우',
      },
      {
        id: 'A2-5',
        title: '사진 4장(JPG·PNG·WebP) 반영',
        expected: '표지(1면)와 현장 사진 갤러리(9면)에 4장이 깨짐 없이 삽입됨',
        failCondition: '이미지가 깨지거나 누락된 경우',
      },
    ],
    waveBChecks: [
      {
        id: 'B2-1',
        title: '201호 치과 공실 → 임대중 전환 시 합계 즉시 점프',
        expected: '보증금 45,500만 → 50,500만 / 월임대료 2,230만 → 2,520만 / 점유율 100%',
        failCondition: '상태를 임대중으로 바꿨는데 합계나 수익률이 그대로인 경우',
      },
      {
        id: 'B2-2',
        title: '수동 편집 문구([실전검증-수동편집]...) 보존 확인',
        expected: 'PPTX Slide 2(투자 하이라이트)에 [실전검증-수동편집] 문구가 그대로 반영됨',
        failCondition: '수동으로 입력한 장점 문구가 기본 템플릿 문구로 덮어써진 경우',
      },
    ],
  },
  {
    id: 'deal3',
    number: 3,
    code: 'DEAL-03',
    badge: '2,000억 테헤란로 코어 오피스 · 3필지 합산',
    name: '여삼빌딩',
    shortName: '역삼동 여삼빌딩',
    jibunAddress: '서울특별시 강남구 역삼동 648-23',
    roadAddress: '서울특별시 강남구 테헤란로 123',
    pnu: '1168010100106480023',
    askingPriceEok: '2000',
    askingPriceManwon: '20000000',
    waveAPostureLabel: '임대수익 (선순위 대주단 / 코어 오피스)',
    waveAPostureCode: 'core_income',
    waveBPriceEok: '1900',
    waveBPriceManwon: '19000000',
    waveBPostureLabel: '신축·리모델링 개발 (Developer)',
    waveBPostureCode: 'development',
    waveBMutationSummary:
      '매매가를 2,000억(20,000,000만원) → 1,900억(19,000,000만원)으로 조정하고, 포스처를 신축·재건축 개발로 변경한 뒤 F5 새로고침 생존 확인',
    specs: {
      zoning: '일반상업지역',
      landAreaSqm: '1452.2',
      landAreaPyeong: '439.29',
      gfaSqm: '14256.64',
      gfaPyeong: '4312.63',
      bcrPct: '47.78%',
      farPct: '719.66%',
      floors: '지하 3층 ~ 지상 15층',
      completionDate: '1985-06-13',
      parking: '총 55대 (옥내자주식 37대 + 옥외자주식 18대)',
      elevators: '승용 승강기 3대',
      officialLandPrice: '65,340,000원/㎡ (2025년 기준, 평당 2.16억원)',
    },
    rentSummary: {
      totalDepositManwon: '464,776만원',
      totalDepositReadout: '46억 4,776만원',
      totalMonthlyRentManwon: '40,686.9만원 (약 4억 686만원)',
      totalMonthlyCamManwon: '14,776.1만원 (약 1억 4,776만원)',
      occupancyPct: '100.0% (전층 만실 · 공실 0, 자가사용 1개 호실 포함)',
      capRateNote:
        'Wave A(2,000억): 보증금차감 2.50% (Gross 2.44%) / 토지 평당가 4억 5,528만원 → Wave B(1,900억): 보증금차감 2.63% (Gross 2.57%) / 토지 평당가 4억 3,252만원',
    },
    brokerInfo: {
      brokerageName: '제이에스부동산중개(주)',
      brokerName: '노창희 전무',
      brokerPhone: '02-553-2009',
      handoverNote: 'NH농협은행·서우회계법인·스파크플러스 마스터리스 승계 또는 개발 명도 협의',
    },
    traps: [
      {
        code: 'TRAP-3A',
        title: '다필지(역삼동 648-23 외 2필지) 3필지 합산 대지면적(1,452.20㎡) 함정',
        description:
          '대표지번(648-23)만 조회했을 때 단일 필지(555.7㎡)가 아닌 3필지 합산 대지면적 1,452.20㎡(439.29평)가 자동 채워져 토지 평당가가 4억 5,528만원/평으로 정확히 산출되는지 확인합니다.',
      },
      {
        code: 'TRAP-3B',
        title: '다층 합산 계약(농협은행·서우회계법인) & 자가사용(303호 (주)여삼) 공실 오판 방지',
        description:
          '1층에 금액이 합산된 202호(0원), 12층에 금액이 합산된 301·1301호(0원), 소유주 자가사용인 303호(0원)가 모두 공실이 아닌 점유 상태로 인식되어 점유율 100.0%가 유지되는지 확인합니다.',
      },
      {
        code: 'TRAP-3C',
        title: '가짜 지번(123-45) 금지 & 실제 도로명주소(테헤란로 123) 정상 허용',
        description:
          '여삼빌딩의 실제 도로명주소인 "서울특별시 강남구 테헤란로 123"이 오탐 없이 표시되고, 매각사례에 123-45 같은 가짜 지번이 0건인지 확인합니다.',
      },
    ],
    brokerMemoText: `[매물명] 여삼빌딩 (테헤란로 8차선 대로변 프라임 오피스)
[소재지] 서울시 강남구 역삼동 648-23 외 2필지 (648-23: 555.7㎡, 648-24: 446.1㎡, 648-25: 450.4㎡) / 도로명: 서울시 강남구 테헤란로 123
[입지여건] 2호선·신분당선 강남역 도보 3분, 2호선 역삼역 도보 5분 거리 테헤란로 왕복 8차선 접면
[용도지역] 일반상업지역, 중심지미관지구, 지구단위계획구역(테헤란로제2지구)
[대지면적] 3필지 합계 1,452.20㎡ (439.29평)
[건축면적/연면적] 건축면적 693.87㎡ (209.89평) / 연면적 14,256.64㎡ (4,312.61평, 용적률 산정용 10,450.96㎡)
[건폐율/용적률] 건폐율 47.78% / 용적률 719.66%
[규모/구조/주용도] 지하 3층 ~ 지상 15층 (옥탑 100.20㎡ 별도) / 철근콘크리트구조 / 업무시설, 근린생활시설
[준공연도] 1985.06.13 (위반건축물 해당없음)
[주차/승강기] 총 55대 (옥내자주식 37대 + 옥외자주식 18대) / 승용 승강기 3대
[공시지가] 2025년 기준 6,534만원/㎡ (평당 2억 1,600만원, 공시지가 합계 948억 8,675만원)
[매매금액] 2,000억원 (토지 평당 4억 5,528만원 / 연면적 평당 4,638만원)
[임대현황 요약] 2025.12.01 기준 100% 만실. 총 보증금 46억 4,776만원 (464,776만원) / 월 임대료 4억 686만원 (40,686만원) / 월 관리비 1억 4,776만원 (14,776만원) / 수익률 2.50%.
[핵심 투자포인트]
1. 강남역~역삼역 사이 테헤란로 메인 대로변(왕복 8차선) 코어 오피스 자산
2. 1~2층 NH농협은행 역삼금융센터, 3·12·13층 서우회계법인, B1 및 4~11층·14~15층 (주)스파크플러스 장기 마스터리스(~2031.02)로 안정적 현금흐름 확보
3. 1985년 준공(건령 40년) 및 테헤란로제2지구 지구단위계획구역 내 위치하여 향후 프라임 신축/리모델링 개발 잠재력 보유 (인근 역삼동 679-4 평당 8.27억, 역삼동 736-1 평당 6.27억 매각사례 대비 가격 메리트)`,
    waveAHighlights: [
      {
        tone: 'amber',
        toneLabel: '핵심 장점 1 (입지/대지)',
        headline: '강남역~역삼역 테헤란로 왕복 8차선 메인 대로변 3필지 합산(439.29평) 프라임 오피스',
        brief: '역삼동 648-23 외 2필지(총 1,452.2㎡) 대형 토지 및 연면적 4,312.61평 규모의 코어 빌딩.',
      },
      {
        tone: 'sky',
        toneLabel: '핵심 장점 2 (임차인)',
        headline: 'NH농협은행·서우회계법인·스파크플러스 장기 마스터리스(~2031.02) 100% 만실',
        brief: '보증금 46억 4,776만원 / 월임대료 4억 686만원 / 월관리비 1억 4,776만원 안정적 배당.',
      },
      {
        tone: 'mint',
        toneLabel: '핵심 장점 3 (개발가치)',
        headline: '테헤란로제2지구 지구단위계획구역 내 향후 프라임 신축·리모델링 개발 잠재력',
        brief: '인근 역삼동 679-4(평당 8.27억), 736-1(평당 6.27억) 매각사례 대비 뛰어난 가격 메리트(평당 4.55억).',
      },
    ],
    waveBHighlights: [
      {
        tone: 'amber',
        toneLabel: 'Wave B 장점 1 (1,900억 조정)',
        headline: '매매가 1,900억(토지 평당 4억 3,252만원) 조정으로 테헤란로 개발 원가 경쟁력 확보',
        brief: '역삼동 648-23 외 2필지(1,452.2㎡ / 439.29평) 통합 개발 부지.',
      },
      {
        tone: 'sky',
        toneLabel: 'Wave B 장점 2',
        headline: 'NH농협은행·서우회계법인·스파크플러스 100% 만실로 인허가 기간 중 연 48.8억 캐시플로우',
        brief: '순투자금 대비 수익률 2.63% (Gross 2.57%)로 개발 준비 기간 금융비용 충당 가능.',
      },
      {
        tone: 'mint',
        toneLabel: 'Wave B 장점 3',
        headline: '테헤란로제2지구 지구단위계획구역 내 프라임 신축·리모델링 최적 입지',
        brief: '강남역 도보 3분·역삼역 도보 5분 더블역세권 코어 입지.',
      },
    ],
    csvFilename: 'rentroll_03_yeoksam_yeosam.csv',
    csvDownloadUrl: '/api/public/testguide-assets/csv/rentroll_03_yeoksam_yeosam.csv',
    csvContent: CSV_03,
    tsvContent: csvToTsv(CSV_03),
    imageFolder: '03_역삼동_여삼빌딩',
    images: buildImageList('03_역삼동_여삼빌딩', [
      {
        filename: '01_역삼동_여삼빌딩_전면외관.jpg',
        format: 'JPG',
        roleLabel: '표지 대표 · 오피스 외관',
        caption: '테헤란로 왕복 8차선 대로변 여삼빌딩 외관 (원본 PPT 추출)',
      },
      {
        filename: '02_역삼동_여삼빌딩_메인로비.jpg',
        format: 'JPG',
        roleLabel: '1층 로비 · 승강기 3대',
        caption: '1층 NH농협은행 및 오피스 메인 로비·승강기 홀 (원본 PPT 추출)',
      },
      {
        filename: '03_역삼동_여삼빌딩_오피스내부.png',
        format: 'PNG',
        roleLabel: '실내 공간 · PNG 포맷검증',
        caption: '기준층(256평) 프라임 오피스 전용 내부 공간 (PNG 호환 검증)',
      },
      {
        filename: '04_역삼동_여삼빌딩_지하주차장.webp',
        format: 'WEBP',
        roleLabel: '주차장/설비 · WebP 포맷검증',
        caption: '지하 1~3층 자주식 총 55대 주차장 설비 (WebP 자동변환 검증)',
      },
    ]),
    waveAChecks: [
      {
        id: 'A3-1',
        trapCode: 'TRAP-3A',
        title: '3필지 합산 대지면적(1,452.20㎡ / 439.29평) 반영',
        expected: '대지 1,452.20㎡ (439.29평) / 토지 평당가 4억 5,528만원 / 건폐율 47.78%',
        failCondition: '단일필지(555.7㎡)로 계산되어 토지 평당가가 11.89억으로 뻥튀기된 경우',
      },
      {
        id: 'A3-2',
        title: '보증금 / 월임대료 / 관리비 합계',
        expected: '보증금 464,776만원 / 월세 40,686.9만원 / 관리비 14,776.1만원',
        failCondition: '소수점 합산이 틀리거나 누락된 경우',
      },
      {
        id: 'A3-3',
        trapCode: 'TRAP-3B',
        title: '합산 호실(202·301·1301호) 및 자가사용(303호) 점유율 100%',
        expected: '점유율 100.0% (공실 0건, 자가사용 1건 정상 분류)',
        failCondition: '금액이 0원인 4개 호실을 공실로 오판해 점유율이 89%로 깎인 경우',
      },
      {
        id: 'A3-4',
        title: '수익률 (Cap Rate) 정확성',
        expected: '보증금 차감 시 2.50% / 단순 Gross 시 2.44%',
        failCondition: '수익률이 0%이거나 엉뚱한 값으로 나오는 경우',
      },
      {
        id: 'A3-5',
        trapCode: 'TRAP-3C',
        title: '매각사례 지번 진본성 및 테헤란로 123 정상 표시',
        expected: '실제 도로명주소(테헤란로 123) 정상 표시 및 가짜 지번(123-45) 0건',
        failCondition: '123-45, 000-0 같은 가짜 지번이 찍힌 경우',
      },
      {
        id: 'A3-6',
        title: '사진 4장(JPG·PNG·WebP) 반영',
        expected: '표지(1면)와 현장 사진 갤러리(9면)에 4장이 깨짐 없이 삽입됨',
        failCondition: '이미지가 깨지거나 누락된 경우',
      },
    ],
    waveBChecks: [
      {
        id: 'B3-1',
        title: '2,000억 → 1,900억 평당가 및 수익률 재계산',
        expected: '토지 평당가 4억 5,528만 → 4억 3,252만원 / 수익률 2.50% → 2.63%',
        failCondition: '가격을 바꿨는데 평당가나 수익률이 변하지 않는 경우',
      },
      {
        id: 'B3-2',
        title: 'F5 새로고침 후 21줄 렌트롤 및 1,900억 100% 생존',
        expected: '브라우저 F5 새로고침 후에도 1,900억, 1,452.2㎡, 21줄 렌트롤이 그대로 유지됨',
        failCondition: '새로고침 시 입력한 데이터가 날아가거나 초기값으로 리셋되는 경우',
      },
    ],
  },
];

export const WAVE_C_MISSIONS = [
  {
    id: 'C-1',
    title: '미션 C-1. 딜카드 쇼케이스(/d/[id]) 발송 → 비로그인 블라인드(Gate) → 인박스 실시간 승인',
    testerRole: '테스터 A(발신) ↔ 테스터 B(시크릿 창 수신)',
    steps: [
      '테스터 A: 상단 메뉴 [① 딜카드 쇼케이스 (/broker/w/dealcards)]에서 매물의 공유 링크(/d/[id] 또는 /dc/[id])를 복사하여 테스터 B에게 전달합니다.',
      '테스터 B: 반드시 시크릿 창(Ctrl+Shift+N, 비로그인)에서 링크를 열고 상세 민감 정보가 잠금(Gate) 상태인지 확인합니다.',
      '테스터 B: [상세 정보 / IM 열람 요청하기] 버튼을 눌러 이름(테스터B_매수자), 연락처(010-9999-8888), 메모(골든테스트 매수검토)를 입력해 제출합니다.',
      '테스터 A: [④ 고객 인박스 (/broker/w/inbox)]에서 도착한 열람 요청을 확인하고 [승인(Approve)]을 클릭합니다.',
      '테스터 B: 시크릿 창을 새로고침(F5)하여 잠금이 해제되고 상세 정보 열람이 활성화되는지 확인합니다.',
    ],
  },
  {
    id: 'C-2',
    title: '미션 C-2. 웹 IM-Lite(/im-lite/[buildingId]) 열람 및 V1/V2 수익률 시뮬레이션 조작',
    testerRole: '테스터 A(링크 전달) → 테스터 B(시크릿 창 조작)',
    steps: [
      '테스터 A: [② IM 스튜디오 (/broker/w/im)] 우측 미리보기 상단의 [전체화면] 링크(/im-lite/[buildingId])를 복사해 테스터 B에게 전달합니다.',
      '테스터 B: 시크릿 창에서 웹 IM-Lite를 열고 상단 매매가·면적·수익률이 최신 수정값과 일치하는지 확인합니다.',
      '테스터 B: [수익률 시뮬레이션 / 밸류애드 분석] 모달을 열어 슬라이더/입력값을 조작할 때 NaN%, Infinity% 없이 수익률이 부드럽게 계산되는지 확인합니다.',
    ],
  },
  {
    id: 'C-3',
    title: '미션 C-3. 매거진 뉴스레터(/broker/magazine-editor) 3개 매물 편성 · 순서 이동(▲/▼) · 삭제 확인 모달',
    testerRole: '테스터 A 단독 수행',
    steps: [
      '테스터 A: [③ 뉴스레터 스튜디오 (/broker/magazine-editor)]로 이동하여 오늘 만든 매물들을 블록으로 확인/편성합니다.',
      '블록 우측 상단의 ▲(위로) / ▼(아래로) 버튼을 눌러 카드 순서가 즉시 이동하는지 확인합니다.',
      '블록 우측 상단의 ✕(삭제) 버튼을 눌렀을 때 즉시 삭제되지 않고 "삭제하시겠습니까?" 확인 모달(또는 되돌리기 안전장치)이 뜨는지 확인합니다.',
    ],
  },
  {
    id: 'C-4',
    title: '미션 C-4. 스마트폰 모바일(390×844) 실기 터치 & ‹ 목록 → ② 채우기 탭 자동 전환',
    testerRole: '테스터 B (스마트폰 또는 Chrome F12 모바일 뷰 390×844)',
    steps: [
      '스마트폰 또는 PC Chrome F12(Ctrl+Shift+M → iPhone 12 Pro 390×844)로 /broker/w/im에 접속합니다.',
      '좌측 상단 [‹ 목록] 버튼을 탭하여 매물 목록을 연 뒤, 다른 매물 카드를 탭합니다.',
      '탭하는 즉시 목록이 닫히고 자동으로 에디터(내용 채우기) 화면으로 전환되는지, 가로 스크롤 깨짐이 없는지 확인합니다.',
    ],
  },
  {
    id: 'C-5',
    title: '미션 C-5. 멀티테넌트 보안(RLS) 격리 & 가짜 URL 한국어 안내 방어',
    testerRole: '테스터 B (중개사 계정 #2 로그인)',
    steps: [
      '테스터 B: 테스터 A와 다른 [중개사 계정 #2]로 로그인하여 /broker/w/im 목록에 테스터 A의 비공개 매물이 보이지 않는지 확인합니다.',
      '브라우저 주소창에 존재하지 않는 https://credeal.net/im-lite/invalid-building-99999 를 입력했을 때 영문 서버 에러 대신 깔끔한 한국어 안내 화면이 뜨는지 확인합니다.',
    ],
  },
];

export const PPTX_10_AUDIT_ITEMS = [
  { no: 1, title: '슬라이드 장수 완결성', method: '왼쪽 슬라이드 썸네일 총 장수 확인', criteria: 'Basic IM 표준 9~10장 완결' },
  { no: 2, title: '프로그램 오류어 (Poison Token)', method: 'Ctrl+F로 NaN, undefined, null, Infinity 검색', criteria: '전 슬라이드 0건' },
  { no: 3, title: 'AI 회피 문구 (Evasion)', method: 'Ctrl+F로 추정 불가, 산출 불가, 데이터 부족 검색', criteria: '전 슬라이드 0건' },
  { no: 4, title: '가짜 지번 (Mock Parcel)', method: '매각사례 슬라이드 주소 지번 확인', criteria: '123-45, 000-0 등 가짜 지번 0건' },
  { no: 5, title: '대지면적·연면적 일관성', method: '표지(1면), 건축물개요(3면), 토지(5면) 면적 비교', criteria: '오라클 정답과 ±0.1㎡ 이내 일치' },
  { no: 6, title: '보증금·임대료 합계 일치', method: '렌트롤 표 합계 행과 수익률 분석 표 비교', criteria: '단 1만원 오차 없이 일치' },
  { no: 7, title: '점유율·수익률 정확성', method: '통합계약/자가사용 공실 오판 여부 및 Cap Rate 확인', criteria: '정답 점유율(100%) 및 수익률 일치' },
  { no: 8, title: '층별 스태킹 차트 일치', method: '렌트롤 좌측 층별 스태킹 바 확인', criteria: 'B2~4F / B1~7F / B3~15F 층수 일치' },
  { no: 9, title: '지적도·위치도·첨부사진 4장 품질', method: '표지(1면), 입지/토지(4~5면), 현장사진(9면) 확인', criteria: '첨부한 JPG·PNG·WebP 4장 및 지적도 선명' },
  { no: 10, title: '한글 폰트·표 넘침(Overflow)', method: '글자 네모(□□□) 깨짐 및 표 하단 침범 확인', criteria: '폰트 깨짐 0건, 표 잘림 0건' },
];

// ───────────────────────────────────────────────────────────────────────────
// 📰 뉴스레터 스튜디오 & 💬 소통 관리함 30문항 상용화 골든테스트 SSOT 데이터
// ───────────────────────────────────────────────────────────────────────────

export interface CopyPresetItem {
  id: string;
  label: string;
  targetField: string;
  value: string;
  note?: string;
}

export const NEWSLETTER_COPY_PRESETS: CopyPresetItem[] = [
  {
    id: 'nl-headline',
    label: '① 표지 제목 (Headline)',
    targetField: '뉴스레터 [① 표지 제목] 입력칸',
    value: '2026년 11월 강남·마포·수도권 상업용 빌딩 시장 브리핑 & 핵심 추천 매물 3선',
    note: 'NL-G01 / NL-G02 검증용 표지 제목',
  },
  {
    id: 'nl-summary',
    label: '① 표지 한 줄 요약 (Summary)',
    targetField: '뉴스레터 [① 표지 제목 → 한 줄 요약] 입력칸',
    value: '금리 인하 기대감 속 역세권 꼬마빌딩·안정형 근생·강남 프라임 오피스 실거래 동향과 검증된 알짜 매물 3선을 전해드립니다.',
    note: '카톡 공유 설명 및 상단 인트로에 반영',
  },
  {
    id: 'nl-briefing-title',
    label: '② 시장 이야기 제목',
    targetField: '뉴스레터 [② 이번 달 시장 이야기 → 소제목] 입력칸',
    value: '11월 상업용 빌딩 매수 심리 회복세 — 역세권 대수선·만실 수익형 양극화 뚜렷',
    note: 'NL-G03 검증용 브리핑 제목',
  },
  {
    id: 'nl-briefing-body',
    label: '② 시장 이야기 본문 원문 (서식 포함)',
    targetField: '뉴스레터 [② 이번 달 시장 이야기 → 본문] 입력칸',
    value: `## 강남·마포 역세권 거래량 반등\n최근 기준금리 인하 기조와 함께 **마포·연남 상권 밸류애드 매물**과 **수도권 7%대 고수익 근생빌딩**을 중심으로 법인 및 자산가 매수 문의가 빠르게 늘고 있습니다.\n\n---\n\n## 이번 달 추천 매물 핵심 포인트\n- **마포구 동교동 코너빌딩 (77억)**: 홍대입구역 도보 4분, 신축·리모델링 밸류애드 최적 입지\n- **부천 원미구 상동 동아빌딩 (58억)**: 전 층 우량 임차인 만실 운영, 연 수익률 7.5% 안정적 현금흐름\n- **강남구 역삼동 테헤란로 프라임 오피스 (2,000억)**: 테헤란로 대로변 랜드마크, 글로벌 IT·금융사 사옥 및 코어 자산`,
    note: 'NL-G03 서식 도구(소제목/강조/구분선) 적용 원문',
  },
  {
    id: 'nl-deal-comment-1',
    label: '③ 매물 #1 추천 코멘트 (동교동 77억)',
    targetField: '뉴스레터 [③ 추천 매물 넣기] → 매물 #1 한 줄 코멘트',
    value: '홍대입구역 도보 4분 코너 필지, 리모델링 후 임대료 40% 상승 기대 밸류애드 매물',
    note: 'NL-G04 매물 #1 큐레이션 코멘트',
  },
  {
    id: 'nl-deal-comment-2',
    label: '③ 매물 #2 추천 코멘트 (부천 동아빌딩 58억)',
    targetField: '뉴스레터 [③ 추천 매물 넣기] → 매물 #2 한 줄 코멘트',
    value: '우량 학원·메디컬 전 층 만실 성업 중, 대출 활용 시 자기자본 수익률 11% 상회',
    note: 'NL-G04 매물 #2 큐레이션 코멘트',
  },
  {
    id: 'nl-deal-comment-3',
    label: '③ 매물 #3 추천 코멘트 (역삼동 2,000억)',
    targetField: '뉴스레터 [③ 추천 매물 넣기] → 매물 #3 한 줄 코멘트',
    value: '테헤란로 초역세권 가시성 최상급 프라임 오피스, 법인 사옥 및 장기 코어 투자 최적',
    note: 'NL-G04 매물 #3 큐레이션 코멘트',
  },
];

export const INBOX_COPY_PRESETS: CopyPresetItem[] = [
  {
    id: 'ib-buyer-name',
    label: '[테스터 B] 열람 신청 성함',
    targetField: '딜카드 [IM 요청하기] 모달 → 이름 (필수)',
    value: '박매수 상무',
    note: 'IB-G01 시크릿 창 매수자 열람 신청용',
  },
  {
    id: 'ib-buyer-phone',
    label: '[테스터 B] 열람 신청 연락처',
    targetField: '딜카드 [IM 요청하기] 모달 → 연락처 (필수)',
    value: '010-8888-7777',
    note: 'IB-G01 시크릿 창 매수자 연락처',
  },
  {
    id: 'ib-buyer-company',
    label: '[테스터 B] 열람 신청 소속·기관명',
    targetField: '딜카드 [IM 요청하기] 모달 → 소속 · 기관명',
    value: '케이리츠자산운용',
    note: 'IB-G01 / IB-G02 소속 파싱 검증용',
  },
  {
    id: 'ib-buyer-message',
    label: '[테스터 B] 열람 신청 문의 내용',
    targetField: '딜카드 [IM 요청하기] 모달 → 문의 내용',
    value: '투심위 상정용 렌트롤 및 상세 IM 요청드립니다',
    note: 'IB-G01 / IB-G02 JSON 파싱 무결성 검증용',
  },
  {
    id: 'ib-kakao-headline',
    label: '[테스터 A] 카톡 메시지 한 줄 제목',
    targetField: '소통함 [메시지] 탭 → 카톡 한 줄 제목',
    value: '[케이리츠자산운용 박매수 상무님 전용] 요청하신 상세 IM 및 층별 임대 현황 보내드립니다',
    note: 'IB-G06 맞춤 카톡 메시지 발송용',
  },
  {
    id: 'ib-kakao-brief',
    label: '[테스터 A] 카톡 메시지 핵심 설명',
    targetField: '소통함 [메시지] 탭 → 카톡 핵심 설명',
    value: '투심위 검토에 필요한 층별 보증금·임대료 현황과 수익률 시뮬레이션이 포함된 검증본입니다.',
    note: 'IB-G06 맞춤 카톡 메시지 설명',
  },
  {
    id: 'ib-call-note',
    label: '[테스터 A] 통화 및 상담 메모 샘플',
    targetField: '소통함 [기록] 탭 → 통화 및 상담 메모 입력칸',
    value: '금일 14시 박매수 상무 통화 완료 — 다음 주 화요일 오전 11시 현장 투어 확정, 1층 카페 명도 조건 추가 확인 요청',
    note: 'IB-G09 타임라인 영속성 검증용',
  },
  {
    id: 'ib-correction-notice',
    label: '[테스터 A] 수치 정정 안내 문구',
    targetField: '소통함 우측 [수치 정정 안내 배너] → 정정 문구 입력칸',
    value: '3층 임대료가 450만원→480만원으로 정정되었습니다.',
    note: 'IB-G11 / IB-G12 수신자 뷰어 상단 정정 배너 연동용',
  },
  {
    id: 'ib-vip-name',
    label: '[테스터 A] 신규 VIP 고객 성함',
    targetField: '소통함 [+ 고객 직접 등록] 모달 → 고객 성함',
    value: '최대표',
    note: 'IB-G16 신규 고객 등록용',
  },
  {
    id: 'ib-vip-phone',
    label: '[테스터 A] 신규 VIP 고객 연락처',
    targetField: '소통함 [+ 고객 직접 등록] 모달 → 연락처',
    value: '010-5555-4444',
    note: 'IB-G16 신규 고객 연락처',
  },
  {
    id: 'ib-vip-budget',
    label: '[테스터 A] 신규 VIP 고객 희망 예산',
    targetField: '소통함 [+ 고객 직접 등록] 모달 → 희망 예산',
    value: '60억',
    note: 'IB-G16 우측 매칭 매물 자동 추천 검증용',
  },
  {
    id: 'ib-vip-region',
    label: '[테스터 A] 신규 VIP 고객 선호 권역',
    targetField: '소통함 [+ 고객 직접 등록] 모달 → 선호 권역',
    value: '부천·수도권 역세권',
    note: 'IB-G16 선호 권역 저장 검증용',
  },
  {
    id: 'ib-vip-building',
    label: '[테스터 A] 신규 VIP 고객 관심 매물명',
    targetField: '소통함 [+ 고객 직접 등록] 모달 → 관심 매물명',
    value: '부천 동아빌딩',
    note: 'IB-G16 관심 매물 연동 검증용',
  },
];

export interface Golden30ScenarioItem {
  id: string;
  wave: 'Wave 1 · 뉴스레터 (8문항)' | 'Wave 2 · 소통 관리함 (16문항)' | 'Wave 3 · 보안 격리 & 모바일 (6문항)';
  actor:
    | '테스터 A (중개사 #1)'
    | '테스터 B (시크릿 창 매수자)'
    | '테스터 B (중개사 #2)'
    | '테스터 A·B 합동'
    | '테스터 B → A'
    | '테스터 A → B';
  title: string;
  action: string;
  expected: string;
  invariantCode: string;
}

export const NL_INBOX_GOLDEN_30_ITEMS: Golden30ScenarioItem[] = [
  // Wave 1: Newsletter (NL-G01 ~ NL-G08)
  {
    id: 'NL-G01',
    wave: 'Wave 1 · 뉴스레터 (8문항)',
    actor: '테스터 A (중개사 #1)',
    title: '새 호수 초기화 및 빈 제목 발송 방어',
    action: '/broker/magazine-editor 진입 → [이번 달 새로 쓰기] 클릭 → 표지 제목을 비운 채 [뉴스레터 발행하고 보내기] 클릭',
    expected: '발행이 차단되고 ① 표지 제목 단계로 자동 포커스 이동 및 친절한 한국어 안내 배너 노출',
    invariantCode: 'NL-03',
  },
  {
    id: 'NL-G02',
    wave: 'Wave 1 · 뉴스레터 (8문항)',
    actor: '테스터 A (중개사 #1)',
    title: '표지 제목·요약 입력 및 로컬 초안 배지 구분',
    action: '발행 연월(2026년 11월호) 선택, 표지 제목 및 한 줄 요약 입력 후 상단 저장 상태 배지 확인',
    expected: '우측 미리보기에 즉시 반영되며, 서버 발행 전에는 [이 기기에만 임시저장됨] 배지가 명확히 구분 표시됨',
    invariantCode: 'NL-05',
  },
  {
    id: 'NL-G03',
    wave: 'Wave 1 · 뉴스레터 (8문항)',
    actor: '테스터 A (중개사 #1)',
    title: '이번 달 시장 이야기 작성 및 3종 서식 막대 작동',
    action: '② 이번 달 시장 이야기 단계에서 [예시 문구 넣기] 또는 샘플 원문 붙여넣기 후 [소제목], [강조], [구분선] 서식 버튼 클릭',
    expected: '본문과 우측 미리보기에 마크다운 깨짐이나 raw 기호 노출 없이 깔끔한 타이포그래피로 렌더링됨',
    invariantCode: 'NL-11',
  },
  {
    id: 'NL-G04',
    wave: 'Wave 1 · 뉴스레터 (8문항)',
    actor: '테스터 A (중개사 #1)',
    title: '보유 매물 3건 큐레이션 및 가짜 샘플 사진 0건 검증',
    action: '③ 추천 매물 넣기 단계에서 보유 매물 3건(동교동 77억·부천 58억·역삼동 2,000억) 체크 및 각 매물 한 줄 추천 코멘트 입력',
    expected: '우측 미리보기에 3개 매물 카드와 코멘트가 표시되며, 사진 미등록 매물에 가짜 샘플 빌딩 사진이 절대 노출되지 않음',
    invariantCode: 'NL-02',
  },
  {
    id: 'NL-G05',
    wave: 'Wave 1 · 뉴스레터 (8문항)',
    actor: '테스터 A (중개사 #1)',
    title: '서버 정식 발행 및 공개 URL 클립보드 복사',
    action: '④ 확인하고 보내기 단계에서 발송 대상(전체 구독자) 선택 후 [뉴스레터 발행하고 보내기] 또는 [링크 복사] 클릭',
    expected: 'POST /api/magazine/issues 200 OK 응답 후 상단 배지가 [발행됨]으로 전환되고 실제 공개 URL이 클립보드에 복사됨',
    invariantCode: 'NL-04 · NL-13',
  },
  {
    id: 'NL-G06',
    wave: 'Wave 1 · 뉴스레터 (8문항)',
    actor: '테스터 B (시크릿 창 매수자)',
    title: '비로그인 시크릿 창에서 발행된 공개 뉴스레터 열람',
    action: '테스터 A가 복사한 공개 URL(/magazine/[brokerSlug]/[issueDate]?edition=...)을 시크릿 창에서 접속',
    expected: '로그인 없이 표지 제목, 시장 브리핑, 큐레이션한 매물 3건 및 추천 코멘트가 깨짐 없이 100% 일치 렌더링됨',
    invariantCode: 'NL-08',
  },
  {
    id: 'NL-G07',
    wave: 'Wave 1 · 뉴스레터 (8문항)',
    actor: '테스터 B (시크릿 창 매수자)',
    title: '뉴스레터 내 매물 카드 → 딜카드/IM 상세 페이지 이동',
    action: '공개 뉴스레터 뷰어 내 추천 매물 카드의 [모바일 IM 열람] 클릭',
    expected: '해당 매물의 공개 딜카드(/dc/[id]) 또는 IM 페이지로 깨짐 없이 정상 이동함',
    invariantCode: 'NL-07',
  },
  {
    id: 'NL-G08',
    wave: 'Wave 1 · 뉴스레터 (8문항)',
    actor: '테스터 A (중개사 #1)',
    title: '발행한 호수의 좌측 목록 실측 매물 수(3건) 및 F5 보존',
    action: '/broker/magazine-editor 좌측 [① 고르기] 목록 확인 및 브라우저 F5 새로고침',
    expected: '방금 발행한 호수의 매물 수가 가짜 기본값(2건)이 아닌 실제 선택한 3건으로 정확히 표시되고 새로고침 후에도 유지됨',
    invariantCode: 'NL-01',
  },

  // Wave 2: Inbox & CRM (IB-G01 ~ IB-G16)
  {
    id: 'IB-G01',
    wave: 'Wave 2 · 소통 관리함 (16문항)',
    actor: '테스터 B (시크릿 창 매수자)',
    title: '딜카드에서 상세 IM 열람 신청 제출 (박매수 상무)',
    action: '매물 딜카드(/dc/[id]) 하단 [IM 요청하기] 클릭 → 박매수 상무 / 010-8888-7777 / 케이리츠자산운용 / 투심위 상정용 렌트롤 및 상세 IM 요청드립니다 입력 후 제출',
    expected: '신청 접수 완료 안내 모달이 표시되고 서버 gate_requests 레코드가 정상 생성됨',
    invariantCode: 'IB-09',
  },
  {
    id: 'IB-G02',
    wave: 'Wave 2 · 소통 관리함 (16문항)',
    actor: '테스터 A (중개사 #1)',
    title: '소통함 [할 일] 탭 수신 및 JSON 날것 노출 0건 검증',
    action: '/broker/w/inbox 접속 또는 새로고침 → [할 일] 탭 및 상단 요약 카드 확인',
    expected: '박매수 상무 (케이리츠자산운용) 스레드가 최상단에 표시되며 {"type":"anonymous_lead"...} 날것의 JSON 문자열이 절대 노출되지 않음',
    invariantCode: 'IB-09 · IB-11',
  },
  {
    id: 'IB-G03',
    wave: 'Wave 2 · 소통 관리함 (16문항)',
    actor: '테스터 A (중개사 #1)',
    title: '1클릭 [자료 보내기 (승인)] 및 전용 토큰 링크 자동 복사',
    action: '박매수 상무 스레드 선택 → 중앙 [할 일] 탭에서 [자료 보내기 (승인)] 버튼 클릭',
    expected: '승인 완료 피드백과 함께 전용 토큰 링크(/im-lite/[id]?token=slk...)가 클립보드에 자동 복사되고 상태가 열람 가능으로 전환됨',
    invariantCode: 'IB-13',
  },
  {
    id: 'IB-G04',
    wave: 'Wave 2 · 소통 관리함 (16문항)',
    actor: '테스터 B (시크릿 창 매수자)',
    title: '승인된 전용 토큰 링크로 10개 섹션 상세 IM 열람',
    action: '테스터 A에게 전달받은 전용 토큰 링크(/im-lite/[id]?token=slk...)를 시크릿 창에서 열람하고 임대 현황·수익률 섹션 스크롤',
    expected: '블라인드 없이 매물 10개 섹션 전체 데이터와 층별 임대 현황이 정상 표시됨',
    invariantCode: 'IB-04',
  },
  {
    id: 'IB-G05',
    wave: 'Wave 2 · 소통 관리함 (16문항)',
    actor: '테스터 B → A',
    title: '3회 이상 반복 열람 시 🔥 반복 열람 배지 및 지금 전화 콜아웃',
    action: '테스터 B가 전용 링크를 3회 이상 새로고침/열람한 뒤 테스터 A가 /broker/w/inbox 확인',
    expected: '열람 횟수(N회) 증가, [🔥 반복 열람] 배지 및 우측 패널 상단에 [🔥 지금 전화] 콜아웃이 활성화됨',
    invariantCode: 'IB-07',
  },
  {
    id: 'IB-G06',
    wave: 'Wave 2 · 소통 관리함 (16문항)',
    actor: '테스터 A (중개사 #1)',
    title: '[메시지] 탭에서 맞춤 카톡 문구 작성 및 딜카드 보내기',
    action: '중앙 [메시지] 탭 클릭 → 카톡 한 줄 제목과 핵심 설명 수정 후 [카톡으로 딜카드 보내기] 클릭',
    expected: '맞춤 제목·설명이 반영된 공유 링크가 복사(또는 카톡 공유창 오픈)되고 타임라인에 발송 이력이 기록됨',
    invariantCode: 'IB-12',
  },
  {
    id: 'IB-G07',
    wave: 'Wave 2 · 소통 관리함 (16문항)',
    actor: '테스터 A (중개사 #1)',
    title: '[메시지] 탭에서 이번 달 뉴스레터 1클릭 보내기',
    action: '중앙 [메시지] 탭에서 [이번 달 뉴스레터 보내기] 클릭',
    expected: '발행된 뉴스레터 링크가 복사/공유되고 활동 타임라인에 뉴스레터 발송 이력이 즉시 추가됨',
    invariantCode: 'IB-12',
  },
  {
    id: 'IB-G08',
    wave: 'Wave 2 · 소통 관리함 (16문항)',
    actor: '테스터 A (중개사 #1)',
    title: '우측 패널 [보유 매물 다른 딜카드 추천]에서 대체 매물 발송',
    action: '우측 패널 [보유 매물 자료 보내기] 클릭 → 보유 중인 다른 매물(예: 부천 동아빌딩) 선택 후 [딜카드] 클릭',
    expected: '선택한 대체 매물의 전용 링크가 즉시 복사되고 타임라인에 추천 발송 기록이 남음',
    invariantCode: 'IB-17',
  },
  {
    id: 'IB-G09',
    wave: 'Wave 2 · 소통 관리함 (16문항)',
    actor: '테스터 A (중개사 #1)',
    title: '[기록] 탭 통화·상담 메모 저장 및 타임라인 최상단 반영',
    action: '중앙 [기록] 탭 클릭 → 통화 메모 샘플 입력 후 [기록 남기기] 클릭',
    expected: '입력창이 비워지고 활동 타임라인 최상단에 방금 입력한 통화 기록이 즉시 추가됨',
    invariantCode: 'IB-04',
  },
  {
    id: 'IB-G10',
    wave: 'Wave 2 · 소통 관리함 (16문항)',
    actor: '테스터 A (중개사 #1)',
    title: '브라우저 F5 새로고침 후 승인 상태 및 통화 기록 영속성',
    action: '/broker/w/inbox 브라우저 F5 새로고침 후 박매수 상무 스레드 재확인',
    expected: '승인 완료 상태(approved)와 방금 남긴 통화 메모가 휘발되지 않고 그대로 유지됨',
    invariantCode: 'IB-04',
  },
  {
    id: 'IB-G11',
    wave: 'Wave 2 · 소통 관리함 (16문항)',
    actor: '테스터 A (중개사 #1)',
    title: '우측 패널 [⚠️ 수치 정정 안내 띄우기] 배너 게시',
    action: '우측 패널 [전용 링크 열람 권한] 카드 하단의 [⚠️ 수치 정정 안내 띄우기] 클릭 → 정정 문구 입력 후 [정정 안내 게시] 클릭',
    expected: '상태가 [표시 중]으로 바뀌고 타임라인에 매물 정정 안내 게시 이력이 기록됨',
    invariantCode: 'IB-16',
  },
  {
    id: 'IB-G12',
    wave: 'Wave 2 · 소통 관리함 (16문항)',
    actor: '테스터 B → A',
    title: '수신자 IM 뷰어 상단 정정 배너 노출 및 [정정 안내 내리기] 해제',
    action: '테스터 B가 전용 링크(/im-lite/[id]?token=...) 새로고침하여 상단 노란색 정정 배너 확인 → 테스터 A가 [정정 안내 내리기] 클릭 후 테스터 B 재확인',
    expected: '테스터 B 화면 상단에 정정 문구가 즉시 노출되었다가, 내리기 클릭 후 새로고침 시 깔끔하게 사라짐',
    invariantCode: 'IB-16',
  },
  {
    id: 'IB-G13',
    wave: 'Wave 2 · 소통 관리함 (16문항)',
    actor: '테스터 A (중개사 #1)',
    title: 'window.prompt 없는 인라인 확인 UI로 [보낸 링크 잠그기]',
    action: '우측 패널에서 [보낸 링크 잠그기] 클릭 → 인라인 확인창("이 고객의 열람 링크를 잠글까요?")에서 [잠그기] 클릭',
    expected: '브라우저 기본 prompt 창 없이 인라인 UI로 확인되며, 스레드 상태가 [링크 잠김]으로 즉시 변경됨',
    invariantCode: 'IB-16',
  },
  {
    id: 'IB-G14',
    wave: 'Wave 2 · 소통 관리함 (16문항)',
    actor: '테스터 B (시크릿 창 매수자)',
    title: '잠긴 전용 토큰 링크 접속 시 매물 데이터 100% 차단',
    action: '테스터 B가 시크릿 창에서 기존 전용 링크(/im-lite/[id]?token=...) 새로고침',
    expected: '매물 상세 수치와 임대 현황이 100% 차단되고 "열람 권한이 회수되었거나 만료된 링크입니다" 안내 화면이 표시됨',
    invariantCode: 'IB-04',
  },
  {
    id: 'IB-G15',
    wave: 'Wave 2 · 소통 관리함 (16문항)',
    actor: '테스터 A → B',
    title: '[링크 다시 열기] 복구 후 수신자 IM 재열람 정상 작동',
    action: '테스터 A가 우측 패널에서 [링크 다시 열기] 클릭 → 테스터 B가 시크릿 창 새로고침',
    expected: '스레드 상태가 [열람 가능]으로 복원되고 테스터 B 화면에서 다시 상세 IM 열람이 정상 작동함',
    invariantCode: 'IB-04',
  },
  {
    id: 'IB-G16',
    wave: 'Wave 2 · 소통 관리함 (16문항)',
    actor: '테스터 A (중개사 #1)',
    title: '[+ 고객 직접 등록] 모달로 VIP 고객 등록 및 가짜 전화번호 0건',
    action: '좌측 상단 [+ 고객 직접 등록] 클릭 → 최대표 / 010-5555-4444 / VIP / 예산 60억 / 부천·수도권 역세권 / 부천 동아빌딩 입력 후 등록 → ESC 닫기 및 F5 확인',
    expected: '[전체 고객] 목록에 최대표(VIP)가 생성되고 우측 요약 카드에 희망 예산(60억)·선호 권역이 표시되며 010-0000-0000 가짜 번호가 절대 생성되지 않음',
    invariantCode: 'IB-20 · IB-26',
  },

  // Wave 3: Security & Mobile (SEC-G01 ~ SEC-G06)
  {
    id: 'SEC-G01',
    wave: 'Wave 3 · 보안 격리 & 모바일 (6문항)',
    actor: '테스터 B (시크릿 창 매수자)',
    title: '비로그인 상태에서 중개사 전용 페이지/API 접근 차단 (401)',
    action: '비로그인 시크릿 창에서 /broker/w/inbox, /broker/magazine-editor 또는 GET /api/broker/inbox?workspace=1 직접 호출',
    expected: '로그인 페이지로 리다이렉트되거나 API가 401 Unauthorized를 반환하여 비인가 접근을 100% 차단함',
    invariantCode: 'IB-01 · NL-09',
  },
  {
    id: 'SEC-G02',
    wave: 'Wave 3 · 보안 격리 & 모바일 (6문항)',
    actor: '테스터 B (시크릿 창 매수자)',
    title: '비로그인 상태에서 배지 카운트 API 호출 시 200 { count: 0 } 무소음 처리',
    action: '비로그인 시크릿 창에서 GET /api/broker/inbox/pending-count 호출 및 콘솔 확인',
    expected: '콘솔 401 에러 로그 없이 200 OK { "ok": true, "count": 0 }을 반환함',
    invariantCode: 'IB-28',
  },
  {
    id: 'SEC-G03',
    wave: 'Wave 3 · 보안 격리 & 모바일 (6문항)',
    actor: '테스터 B (중개사 #2)',
    title: '타 중개사 계정(#2) 로그인 시 테스터 A의 고객·호수 노출 0건 격리',
    action: '타 중개사 계정(#2)으로 로그인 후 /broker/w/inbox 및 /broker/magazine-editor 진입',
    expected: '테스터 A의 고객(박매수 상무, 최대표) 및 테스터 A의 뉴스레터 호수가 단 1건도 노출되지 않음',
    invariantCode: 'IB-02 · NL-09',
  },
  {
    id: 'SEC-G04',
    wave: 'Wave 3 · 보안 격리 & 모바일 (6문항)',
    actor: '테스터 B (중개사 #2)',
    title: '타 중개사 계정(#2)에서 테스터 A의 매물/스레드 위변조 요청 시 403 차단',
    action: '타 중개사 계정(#2) 세션에서 테스터 A의 buildingId로 POST /api/broker/inbox/actions (approve_gate 또는 revoke_link) 호출',
    expected: '403 Forbidden ("본인 소유 매물의 요청만 처리할 수 있습니다.")으로 즉시 차단됨',
    invariantCode: 'IB-03 · NL-09',
  },
  {
    id: 'SEC-G05',
    wave: 'Wave 3 · 보안 격리 & 모바일 (6문항)',
    actor: '테스터 A·B 합동',
    title: '모바일 뷰포트(375×812) 뉴스레터 에디터 가로 스크롤 0px 및 탭 전환',
    action: 'Chrome 개발자도구 모바일 뷰(375×812)에서 /broker/magazine-editor 진입 → [① 고르기] · [② 채우기] · [③ 확인·보내기] 하단/상단 탭 전환',
    expected: '가로 스크롤(scrollWidth > clientWidth) 0px이며, 모든 버튼 터치 타겟이 48px 이상으로 쾌적하게 작동함',
    invariantCode: 'NL-11',
  },
  {
    id: 'SEC-G06',
    wave: 'Wave 3 · 보안 격리 & 모바일 (6문항)',
    actor: '테스터 A·B 합동',
    title: '모바일 뷰포트(375×812) 소통 관리함 리스트↔상세 푸시 이동 및 가로 스크롤 0px',
    action: '모바일 뷰(375×812)에서 /broker/w/inbox 진입 → 고객 스레드 탭하여 상세 진입 → 상단 [← 고객 목록으로] 탭하여 복귀',
    expected: '초기 진입 시 고객 목록이 먼저 보이고, 스레드 탭 시 상세 화면으로 전환되며 가로 스크롤 0px 유지',
    invariantCode: 'IB-19',
  },
];

export interface PseudoGoldenDatasetItem {
  id: string;
  category: string;
  title: string;
  address: string;
  askingPriceWon: string;
  askingPriceReadout: string;
  rentRollVariant: string;
  sampleTsv: string;
  photoVariant: string;
  aiOracleAssertion: string;
  targetBlindspot: string;
}

export const PSEUDO_GOLDEN_12_DATASETS: PseudoGoldenDatasetItem[] = [
  {
    id: 'PG-01',
    category: '실전 Ground-Truth #1',
    title: '마포구 동교동 189-6 (THE.PARK 빌딩 · 리테일 만실)',
    address: '서울특별시 마포구 동교동 189-6',
    askingPriceWon: '7,700,000,000',
    askingPriceReadout: '77억 원 (770,000만 원)',
    rentRollVariant: 'CSV_01 원본 (B2~4F 6개 행, 그랑핸드 B1·B2 통합임차)',
    sampleTsv: CSV_01.replace(/,/g, '\t'),
    photoVariant: '동교동 4장 (JPG 2 + PNG 1 + WebP 1)',
    aiOracleAssertion: '보증금 22,000만 / 월세 1,817만 / 관리비 123.5만 · B2F 0원 행 공실 오분류 0건 · 멀티포맷 사진 4장 100% 임베딩',
    targetBlindspot: '경사지 레벨차 및 통합 호실 0원 행 공실 오판 방지',
  },
  {
    id: 'PG-02',
    category: '실전 Ground-Truth #2',
    title: '부천시 심곡동 349-10 (동아빌딩 · 다호실 + 2F 공실)',
    address: '경기도 부천시 원미구 심곡동 349-10',
    askingPriceWon: '5,800,000,000',
    askingPriceReadout: '58억 원 (580,000만 원)',
    rentRollVariant: 'CSV_02 원본 (17개 호실 · 201호 한마음치과 공실 + 기계식주차 부대수익)',
    sampleTsv: CSV_02.replace(/,/g, '\t'),
    photoVariant: '부천 동아빌딩 4장 (JPG 2 + PNG 1 + WebP 1)',
    aiOracleAssertion: '현행 점유 16개 호실 보증금 45,500만 / 월세 2,230만 / 관리비 601.5만 · 201호 공실 잠재임대료(290만) 분리 정합성',
    targetBlindspot: '공실 호실(201호) 현행 임대료 중복 합산 방지',
  },
  {
    id: 'PG-03',
    category: '실전 Ground-Truth #3',
    title: '강남구 역삼동 648-23 (여삼빌딩 · 프라임 21개 호실)',
    address: '서울특별시 강남구 역삼동 648-23',
    askingPriceWon: '200,000,000,000',
    askingPriceReadout: '2,000억 원 (20,000,000만 원)',
    rentRollVariant: 'CSV_03 원본 (B1~15F 21개 호실 · 303호 자가사용 + 스파크플러스 마스터리스)',
    sampleTsv: CSV_03.replace(/,/g, '\t'),
    photoVariant: '역삼동 여삼빌딩 4장 (JPG 2 + PNG 1 + WebP 1)',
    aiOracleAssertion: '21개 대형 오피스 테이블 오버플로우 0건 · 303호 자가사용(owner) 분류 · 2,000억 숫자 말줄임(…) 0건',
    targetBlindspot: '프라임 대형 빌딩 다호실 표 넘침 및 자가사용 분류 검증',
  },
  {
    id: 'PG-04',
    category: '현장 실측 변이 #1 (보정동 RCA)',
    title: '용인시 기흥구 보정동 1208-4 (무렌트롤·비파괴 주소 역변환)',
    address: '경기도 용인시 기흥구 보정동 1208-4',
    askingPriceWon: '7,700,000,000',
    askingPriceReadout: '77억 원 (770,000만 원)',
    rentRollVariant: '0행 (렌트롤 미입력 초기 상태 + 주소 자동 조회)',
    sampleTsv: '층\t호수\t업종\t보증금\t월세\t관리비\t만기일\t상태\n1F\t101호\t브런치카페\t5000\t380\t35\t2028.05\t임대중',
    photoVariant: '무사진 (0장 → 카카오 실사 스태틱맵·VWorld 지적도 폴백)',
    aiOracleAssertion: '제목·매매가 선입력 후 [주소로 건물 정보 자동 채우기] 클릭 시 기존 제목·매매가 100% 보존 + 지도·지적도 실사 이미지 200 OK',
    targetBlindspot: '보정동 중개사 장애 RCA (E-02 주소 조회 시 입력값 휘발 및 지도 누락 방어)',
  },
  {
    id: 'PG-05',
    category: '현장 실측 변이 #2 (비정형 층·누락층)',
    title: '영등포구 당산동5가 11-47 (음수 층 -1, 1, 2, 5 → 3F·4F 공실 자동 합성)',
    address: '서울특별시 영등포구 당산동5가 11-47',
    askingPriceWon: '9,500,000,000',
    askingPriceReadout: '95억 원 (950,000만 원)',
    rentRollVariant: '비정형 층 표기 (-1, 1, 2, 5) 및 중간 3F·4F 누락 TSV',
    sampleTsv: [
      '층\t호수\t업종\t보증금\t월세\t관리비\t만기일\t상태',
      '-1\tB101호\t구내식당\t3000\t220\t25\t2027.08\t임대중',
      '1\t101호\t편의점\t5000\t420\t40\t2028.04\t임대중',
      '2\t201호\t내과의원\t4000\t310\t35\t2027.11\t임대중',
      '5\t501호\t세무법인\t3000\t240\t30\t2028.02\t임대중',
    ].join('\n'),
    photoVariant: '동교동 외관 JPG 1장',
    aiOracleAssertion: '-1→B1, 1→1F, 2→2F, 5→5F 정규화 및 누락된 3F·4F를 자동으로 공실(vacant) 행으로 합성 (총 6개 층 연속 스태킹)',
    targetBlindspot: '테스터 A 지적 (GB-04 층 표기 정규화 및 누락 공실층 자동 보정)',
  },
  {
    id: 'PG-06',
    category: '교차 합성 #1 (원 단위 오타 방어)',
    title: '동교동 189-6 × 원 단위(50,000,000원) 렌트롤 오타 교차 합성',
    address: '서울특별시 마포구 동교동 189-6',
    askingPriceWon: '7,700,000,000',
    askingPriceReadout: '77억 원 (770,000만 원)',
    rentRollVariant: '보증금 50,000,000 / 월세 4,800,000 원 단위 입력 오타 TSV',
    sampleTsv: [
      '층\t호수\t업종\t보증금\t월세\t관리비\t만기일\t상태',
      '1층\t101호\t플래그십카페\t50000000\t4800000\t450000\t2028.03\t임대중',
      '2층\t201호\t디자인스튜디오\t30000000\t2800000\t300000\t2027.09\t임대중',
    ].join('\n'),
    photoVariant: '동교동 PNG + WebP 2장',
    aiOracleAssertion: 'hasUnitMistakes=true 감지 → 보증금 8,000만 / 월세 760만 / 관리비 75만으로 1/10,000 자동 보정 및 안내 토스트 노출',
    targetBlindspot: '원 단위 입력으로 인한 수익률 10,000배 왜곡(Cap Rate 30,000%) 원천 차단',
  },
  {
    id: 'PG-07',
    category: '교차 합성 #2 (100% 전층 공실)',
    title: '부천 심곡동 349-10 × 전층 공실(0% 점유) 밸류애드 합성',
    address: '경기도 부천시 원미구 심곡동 349-10',
    askingPriceWon: '5,200,000,000',
    askingPriceReadout: '52억 원 (520,000만 원)',
    rentRollVariant: '1F~3F 전층 공실 (보증금 0 / 월세 0)',
    sampleTsv: [
      '층\t호수\t업종\t보증금\t월세\t관리비\t만기일\t상태',
      '1층\t101호\t공실\t0\t0\t0\t-\t공실',
      '2층\t201호\t공실\t0\t0\t0\t-\t공실',
      '3층\t301호\t공실\t0\t0\t0\t-\t공실',
    ].join('\n'),
    photoVariant: '부천 외관·실내 2장',
    aiOracleAssertion: 'Zero-Division(NaN / Infinity%) 0건 · 현행 임대수익 0원 표시 및 만실 가정(Stabilized) 수익률 분리 표기',
    targetBlindspot: '전층 공실 매물에서 0 나누기 오류(NaN%) 방어',
  },
  {
    id: 'PG-08',
    category: '교차 합성 #3 (100% 사옥직영)',
    title: '역삼동 648-23 × 전층 사옥직영(owner_occupied) 합성',
    address: '서울특별시 강남구 역삼동 648-23',
    askingPriceWon: '200,000,000,000',
    askingPriceReadout: '2,000억 원 (20,000,000만 원)',
    rentRollVariant: '전층 본사 사옥직영 (status=owner)',
    sampleTsv: [
      '층\t호수\t업종\t보증금\t월세\t관리비\t만기일\t상태',
      '1층\t101호\t본사 플래그십 쇼룸\t0\t0\t150\t-\t자가사용',
      '2층\t201호\t본사 R&D 센터\t0\t0\t150\t-\t사옥직영',
    ].join('\n'),
    photoVariant: '역삼동 4장 전체',
    aiOracleAssertion: '사옥용(owner_occupied) 포스처 선택 시 임대수익률 대신 사옥 가용면적·주차·접근성 중심 서사로 자동 전환',
    targetBlindspot: '포스처 격리(Rule 26~30) 및 자가사옥 매물 임대료 0원 정상 처리',
  },
  {
    id: 'PG-09',
    category: '교차 합성 #4 (대량 사진 10장 연속 첨부)',
    title: '보정동 1208-4 × 멀티포맷 사진 10장(JPG·PNG·WebP) 2회 분할 드롭',
    address: '경기도 용인시 기흥구 보정동 1208-4',
    askingPriceWon: '7,700,000,000',
    askingPriceReadout: '77억 원 (770,000만 원)',
    rentRollVariant: 'CSV_01 (동교동 6개 층 교차 결합)',
    sampleTsv: CSV_01.replace(/,/g, '\t'),
    photoVariant: '1차 6장 업로드 후 2차 4장 추가 업로드 (총 10장)',
    aiOracleAssertion: '기존 사진 덮어쓰기 없이 10장 비파괴 순차 축적(GB-06) + 800px 리사이즈 DataURL 영속화(GB-01)',
    targetBlindspot: '테스터 A 지적 (GB-06 다중 사진 첨부 시 이전 사진 증발 방지)',
  },
  {
    id: 'PG-10',
    category: '교차 합성 #5 (500자 장문 오버플로우 방어)',
    title: '동교동 189-6 × AI 핵심 장점 500자 초장문 입력 하드 캡',
    address: '서울특별시 마포구 동교동 189-6',
    askingPriceWon: '7,700,000,000',
    askingPriceReadout: '77억 원 (770,000만 원)',
    rentRollVariant: 'CSV_01 원본',
    sampleTsv: CSV_01.replace(/,/g, '\t'),
    photoVariant: '동교동 4장',
    aiOracleAssertion: 'Tab ③ 장점 설명란 maxLength=300자 하드 캡 작동 및 실시간 300/300자 카운터 표시로 PPTX 카드 침범 원천 차단(GB-08)',
    targetBlindspot: '테스터 A 지적 (GB-08 장문 텍스트 입력 시 PPTX 하단 박스 침범 방어)',
  },
  {
    id: 'PG-11',
    category: '교차 합성 #6 (세션 만료 & 무버튼 즉시 열람)',
    title: '부천 심곡동 349-10 × [IM 완성하기] 생략 즉시 열람 및 401 폼 보존',
    address: '경기도 부천시 원미구 심곡동 349-10',
    askingPriceWon: '5,800,000,000',
    askingPriceReadout: '58억 원 (580,000만 원)',
    rentRollVariant: 'CSV_02 원본',
    sampleTsv: CSV_02.replace(/,/g, '\t'),
    photoVariant: '부천 4장',
    aiOracleAssertion: '[IM 완성하기] 클릭 전 우측 [모바일 IM 열기]/[PPTX 받기] 클릭 시 activity_events 자동 합성(E-01)으로 최신 입력값 100% 반영',
    targetBlindspot: '테스터 A 최다 실패 원인 (E-01 [IM 완성하기] 생략 시 빈 화면/양평동 노출 방어)',
  },
  {
    id: 'PG-12',
    category: '교차 합성 #7 (중개사 프로필 SSOT & 모바일 375px)',
    title: '역삼동 648-23 × 중개사 프로필 SSOT 자동 주입 & 모바일 375px',
    address: '서울특별시 강남구 역삼동 648-23',
    askingPriceWon: '200,000,000,000',
    askingPriceReadout: '2,000억 원 (20,000,000만 원)',
    rentRollVariant: 'CSV_03 원본',
    sampleTsv: CSV_03.replace(/,/g, '\t'),
    photoVariant: '역삼동 4장',
    aiOracleAssertion: 'Tab ③ 중개법인·성명·연락처에 로그인 프로필 SSOT 자동 주입("담당 공인중개사" 더미 문구 0건, GA-08) 및 375px 가로 스크롤 0px',
    targetBlindspot: '테스터 A 지적 (GA-08 중개사 이름 미표시 및 L-07 양평동 샘플 잔류 방어)',
  },
];

export interface HumanFastTrackCheckItem {
  id: string;
  mission: 'Mission H-1 · 3분 무막힘 작성' | 'Mission H-2 · 즉흥 변경 반응성' | 'Mission H-3 · VIP 발송 품격 승인';
  title: string;
  guide: string;
  passCriteria: string;
}

export const HUMAN_2ND_FASTTRACK_9_CHECKS: HumanFastTrackCheckItem[] = [
  {
    id: 'H1-01',
    mission: 'Mission H-1 · 3분 무막힘 작성',
    title: '[빈 양식으로 새로 입력] 및 주소 역변환 직관성',
    guide: 'IM 스튜디오 상단 [🔄 빈 양식으로 새로 입력] 클릭 후, 제목·주소·매매가(원 단위)를 넣고 [주소로 건물 정보 자동 채우기]를 누릅니다.',
    passCriteria: '먼저 입력한 제목과 매매가가 지워지지 않고 그대로 유지되며, 연면적(왼쪽)·대지면적(오른쪽)·용도지역이 1초 내에 채워진다.',
  },
  {
    id: 'H1-02',
    mission: 'Mission H-1 · 3분 무막힘 작성',
    title: '렌트롤 TSV 1초 복붙(또는 CSV 드롭) 및 층별 자동 정렬',
    guide: '② 층별 임대 현황 탭에서 [엑셀 붙여넣기]로 렌트롤을 붙여넣거나 CSV 파일을 드롭합니다.',
    passCriteria: '원 단위 오타나 비정형 층(-1, 1, 2, 5)이 있어도 B1, 1F~5F 및 공실층으로 즉시 정리되고 상단 보증금·월세 합계가 즉시 계산된다.',
  },
  {
    id: 'H1-03',
    mission: 'Mission H-1 · 3분 무막힘 작성',
    title: 'AI 장점 3가지 1클릭 자동 생성 및 다중 사진 드래그앤드롭',
    guide: '③ 탭에서 [✨ AI로 3가지 장점 자동 채우기]를 누르고, ④ 탭에서 사진 4장(JPG·PNG·WebP)을 한 번에 끌어다 놓습니다.',
    passCriteria: '매물 특성에 맞는 3가지 장점이 300자 이내로 깔끔하게 채워지고, 중개사 프로필이 자동 기입되며, 사진 4장이 누락 없이 썸네일로 표시된다.',
  },
  {
    id: 'H2-01',
    mission: 'Mission H-2 · 즉흥 변경 반응성',
    title: '희망 매매가 즉흥 변경 시 실시간 평당가·수익률 연동',
    guide: '① 탭에서 매매가를 낮추거나(예: 77억 → 72억) 높여봅니다.',
    passCriteria: '입력 즉시 한글 금액 독음(= 72억 원)과 우측 미리보기의 매매가·연환산 수익률(Cap Rate)이 딜레이 없이 갱신된다.',
  },
  {
    id: 'H2-02',
    mission: 'Mission H-2 · 즉흥 변경 반응성',
    title: '[IM 완성하기] 버튼을 누르지 않고 우측 [모바일 IM 열기]·[PPTX 받기] 즉시 클릭',
    guide: '값을 수정한 직후 하단 [IM 완성하기] 버튼을 건너뛰고, 바로 우측(또는 상단) [모바일 IM 열기]와 [PPTX 받기]를 눌러봅니다.',
    passCriteria: '빈 화면이나 초기 샘플(양평동)이 뜨지 않고, 방금 수정한 최신 가격·렌트롤·사진이 모바일 웹과 PPTX에 100% 반영되어 열린다.',
  },
  {
    id: 'H2-03',
    mission: 'Mission H-2 · 즉흥 변경 반응성',
    title: '브라우저 F5 새로고침 후 작업 상태 100% 보존',
    guide: '작업 도중 브라우저 F5(새로고침)를 눌러봅니다.',
    passCriteria: '입력했던 제목, 주소, 매매가, 렌트롤, AI 장점, 첨부 사진이 날아가지 않고 그대로 복원된다.',
  },
  {
    id: 'H3-01',
    mission: 'Mission H-3 · VIP 발송 품격 승인',
    title: '10면 PPTX 표지 실사진 및 위치·지적도(Slide 3·4) 시각 품격',
    guide: '다운로드된 10면 PPTX를 열어 표지(Slide 1), 입지 분석(Slide 3), 지적도·토지(Slide 4)를 확인합니다.',
    passCriteria: '첨부한 외관 실사진이 표지에 선명하게 들어가고, 실사 지도와 지적도가 빈 박스 없이 정교하게 배치되어 있다.',
  },
  {
    id: 'H3-02',
    mission: 'Mission H-3 · VIP 발송 품격 승인',
    title: '10면 PPTX 층별 스태킹 차트·임대 현황표 및 텍스트 레이아웃 완결성',
    guide: 'PPTX의 층별 임대차(Slide 6~7)와 핵심 투자 포인트(Slide 2·8)의 글씨 겹침 여부를 확인합니다.',
    passCriteria: '층별 현황표와 하단 요약 박스가 서로 겹치지 않으며, 어색한 기계 번역투나 더미 문구("담당 공인중개사", "NaN")가 단 한 곳도 없다.',
  },
  {
    id: 'H3-03',
    mission: 'Mission H-3 · VIP 발송 품격 승인',
    title: '모바일 IM 웹뷰(스마트폰 화면) 고객 전달 만족도 최종 판정',
    guide: '[모바일 IM 열기]로 열린 화면을 스마트폰 폭으로 살펴보고 VIP 매수자에게 카톡으로 바로 보낼 수 있을지 판정합니다.',
    passCriteria: '핵심 제원·수익률·층별 현황·사진·담당 중개사 연락처가 한눈에 들어오며 현업 발송 품격 기준을 충족한다.',
  },
];


