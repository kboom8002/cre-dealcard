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
    const cdnUrl = TESTGUIDE_IMAGE_CDN_MAP[it.filename] || apiBaseUrl;
    return {
      ...it,
      previewUrl: cdnUrl,
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
    title: '미션 C-3. 매거진 뉴스레터(/broker/w/newsletter) 3개 매물 편성 · 순서 이동(▲/▼) · 삭제 확인 모달',
    testerRole: '테스터 A 단독 수행',
    steps: [
      '테스터 A: [③ 뉴스레터 매거진 (/broker/w/newsletter)]으로 이동하여 오늘 만든 매물들을 블록으로 확인/편성합니다.',
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
