/**
 * @file src/lib/qa/output-showcase-scenarios.ts
 * @description v3.0 산출물 우선(Output-First) 22종 MECE 최종 산출물 SSOT 정의.
 *
 * 구성 (총 22종):
 *  - 뉴스레터 6종 (NL-D1, NL-D2, NL-W1, NL-W2, NL-M1, NL-M2)
 *  - 딜카드   8종 (DC-01 ~ DC-08)
 *  - 모바일+PPTX IM 8종 (IM-01 ~ IM-08)
 *
 * 순수 TypeScript 모듈 (Node/DB 전용 import 금지 — 클라이언트·서버·E2E 공용).
 */

export const QA_OUTPUT_SHOWCASE_WORKBENCH_ID = "qa-output-showcase-v1" as const;

export type ShowcaseCategory = "newsletter" | "dealcard" | "im";
export type ShowcaseFontScale = "normal" | "large" | "xlarge";

export interface ShowcaseRentRollRowInput {
  floor: string;
  unit?: string;
  use: string;
  area_sqm?: number;
  depositManwon: number;
  monthlyRentManwon: number;
  maintenanceManwon?: number;
  leaseExpiry?: string;
  status: "occupied" | "vacant" | "owner";
}

export interface ShowcasePhotoInput {
  url: string;
  caption: string;
  role?: string;
  category?: string;
}

export interface ShowcaseNewsletterIssueInput {
  id: string;
  channel: "real_estate" | "rate_finance" | "tax_legal" | "policy" | "retail_trend";
  topic: string;
  title: string;
  brief: string;
  memoTone: "amber" | "sky" | "mint" | "lavender" | "peach";
  sentiment?: "bullish" | "bearish" | "neutral";
}

export interface ShowcaseNewsletterScenario {
  id: "NL-D1" | "NL-D2" | "NL-W1" | "NL-W2" | "NL-M1" | "NL-M2";
  category: "newsletter";
  title: string;
  subtitle: string;
  edgeFocus: string;
  editionType: "daily" | "weekly" | "monthly";
  cadenceLabel: string;
  editionLabel: string;
  issueDate: string;
  marketTemp: "적극 매수" | "선별 매수" | "관망" | "조정 대기" | "위기 경계";
  headlineTemplate: string;
  useBrokerNamePreset?: boolean;
  rawBrokerMemo: string;
  plainBriefingFallback: string;
  unitIssues: ShowcaseNewsletterIssueInput[];
  dealRefs: Array<"DC-01" | "DC-02" | "DC-03" | "DC-04" | "DC-05" | "DC-06" | "DC-07" | "DC-08">;
  monthlyRegion?: "gbd" | "seongsu" | "ybd" | "mapo_yongsan" | "cbd";
  monthlyPair?: "molit_bok" | "molit_band";
  defaultFontScale: ShowcaseFontScale;
  inputSummary: string;
  oracleCriteria: string[];
  ogDescription?: string;
}

export interface ShowcaseDealCardScenario {
  id: "DC-01" | "DC-02" | "DC-03" | "DC-04" | "DC-05" | "DC-06" | "DC-07" | "DC-08";
  category: "dealcard";
  buildingId: string;
  title: string;
  subtitle: string;
  deliverableTitle?: string;
  ogDescription?: string;
  edgeFocus: string;
  posture: "income_producing" | "owner_occupier" | "development";
  card4Posture: "income" | "owner_occupied" | "value_add";
  address: string;
  askingPriceManwon: number;
  askingPriceReadout: string;
  landAreaSqm?: number;
  gfaSqm?: number;
  zoning?: string;
  completionDate?: string;
  fastFillMemo: string;
  handoverNote: string;
  rentRoll: ShowcaseRentRollRowInput[];
  photos: ShowcasePhotoInput[];
  forbiddenPublicTokens: string[];
  inputSummary: string;
  oracleCriteria: string[];
}

export interface ShowcaseImScenario {
  id: "IM-01" | "IM-02" | "IM-03" | "IM-04" | "IM-05" | "IM-06" | "IM-07" | "IM-08";
  category: "im";
  buildingId: string;
  title: string;
  subtitle: string;
  deliverableTitle?: string;
  edgeFocus: string;
  posture: "income_producing" | "owner_occupier" | "development";
  postureLabel: string;
  address: string;
  askingPriceManwon: number;
  askingPriceReadout: string;
  landAreaSqm?: number;
  gfaSqm?: number;
  zoning?: string;
  completionDate?: string;
  handoverNote: string;
  rawTsv?: string;
  synthesizeVacantFloors?: boolean;
  directRentRoll?: ShowcaseRentRollRowInput[];
  photos: ShowcasePhotoInput[];
  brokerExtras?: {
    investment_points?: Array<{ headline: string; brief: string }>;
    closing_line?: string;
    location_note?: string;
    post_acquisition_plan?: string;
  };
  exemptDummyPhraseForOfficialAddress?: "테헤란로 123";
  inputSummary: string;
  oracleCriteria: string[];
}

export type ShowcaseScenarioUnion =
  | ShowcaseNewsletterScenario
  | ShowcaseDealCardScenario
  | ShowcaseImScenario;

export interface ShowcaseLiveEntry {
  caseId: string;
  category: ShowcaseCategory;
  title: string;
  subtitle: string;
  deliverableTitle?: string;
  ogTitle?: string;
  ogDescription?: string;
  postureOrCadence: string;
  edgeFocus: string;
  liveUrl: string;
  ogImageUrl: string | null;
  pptxDownloadUrl?: string | null;
  pdfDownloadUrl?: string | null;
  pptxSlideUrls?: string[];
  slideCount?: number;
  buildingId?: string;
  docId?: string;
  editionId?: string;
  defaultFontScale?: ShowcaseFontScale;
  inputSummary: string;
  goldenChecks: string[];
  generatedAt: string;
}

export interface ShowcaseManifest {
  version: "3.0";
  generatedAt: string;
  brokerSlug: string;
  brokerName: string;
  totalCount: number;
  entries: Record<string, ShowcaseLiveEntry>;
}

const SUPABASE_CDN_BASE =
  "https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide";

export const SHOWCASE_PHOTO_SETS = {
  donggyo4: [
    {
      url: `${SUPABASE_CDN_BASE}/deal1/01_exterior.jpg`,
      caption: "전면 코너 외관",
      role: "cover",
      category: "exterior",
    },
    {
      url: `${SUPABASE_CDN_BASE}/deal1/02_entrance.jpg`,
      caption: "1층 리테일 출입구",
      role: "entrance",
      category: "entrance",
    },
    {
      url: `${SUPABASE_CDN_BASE}/deal1/03_interior.png`,
      caption: "기준층 실내 마감",
      role: "interior",
      category: "interior",
    },
    {
      url: `${SUPABASE_CDN_BASE}/deal1/04_rooftop.webp`,
      caption: "루프탑 테라스 조망",
      role: "rooftop",
      category: "rooftop",
    },
  ],
  bucheon4: [
    {
      url: `${SUPABASE_CDN_BASE}/deal2/01_exterior.jpg`,
      caption: "대로변 전면 외관",
      role: "cover",
      category: "exterior",
    },
    {
      url: `${SUPABASE_CDN_BASE}/deal2/02_lobby.jpg`,
      caption: "1층 로비·승강기 홀",
      role: "lobby",
      category: "lobby",
    },
    {
      url: `${SUPABASE_CDN_BASE}/deal2/03_interior.png`,
      caption: "기준층 오피스 실내",
      role: "interior",
      category: "interior",
    },
    {
      url: `${SUPABASE_CDN_BASE}/deal2/04_parking.webp`,
      caption: "기계식 주차타워 설비",
      role: "parking",
      category: "parking",
    },
  ],
  yeoksam4: [
    {
      url: `${SUPABASE_CDN_BASE}/deal3/01_exterior.jpg`,
      caption: "테헤란로 프라임 외관",
      role: "cover",
      category: "exterior",
    },
    {
      url: `${SUPABASE_CDN_BASE}/deal3/02_lobby.jpg`,
      caption: "메인 로비 라운지",
      role: "lobby",
      category: "lobby",
    },
    {
      url: `${SUPABASE_CDN_BASE}/deal3/03_interior.png`,
      caption: "전층 오피스 인테리어",
      role: "interior",
      category: "interior",
    },
    {
      url: `${SUPABASE_CDN_BASE}/deal3/04_parking.webp`,
      caption: "지하 자주식 주차장",
      role: "parking",
      category: "parking",
    },
  ],
  seocho4: [
    {
      url: `${SUPABASE_CDN_BASE}/broker-case02/01_exterior_corner_main.jpeg`,
      caption: "서초동 사옥 코너 전면 외관",
      role: "cover",
      category: "exterior",
    },
    {
      url: `${SUPABASE_CDN_BASE}/broker-case02/02_exterior_front_facade.jpeg`,
      caption: "사옥 정면 파사드 및 출입구",
      role: "entrance",
      category: "exterior",
    },
    {
      url: `${SUPABASE_CDN_BASE}/broker-case02/06_interior_6f_hq_hall.jpeg`,
      caption: "본사 업무홀 및 회의 공간",
      role: "interior",
      category: "interior",
    },
    {
      url: `${SUPABASE_CDN_BASE}/broker-case02/03_exterior_side_parking.jpeg`,
      caption: "측면 자주식 주차 공간",
      role: "parking",
      category: "parking",
    },
  ],
} satisfies Record<string, ShowcasePhotoInput[]>;

const CSV_01_TSV = [
  "층\t호수\t용도\t임차인\t면적(㎡)\t면적(평)\t보증금(만원)\t월임대료(만원)\t월관리비(만원)\t만기일\t임대상태\t비고",
  "4F\t401호\t2종근생\t돌디 스튜디오\t57.67\t17.45\t3000\t190\t17.5\t2026-12-01\t임대중\t공원기준 5F",
  "3F\t301호\t2종근생\t연을담다 미용실\t57.67\t17.45\t2000\t231\t10\t2027-10-05\t임대중\t공원기준 4F",
  "2F\t201호\t1종근생\t마음쉼표 정신건강의학과\t78.96\t23.89\t3000\t309\t23\t2027-01-19\t임대중\t공원기준 3F",
  "1F\t101호\t2종근생\t그랑핸드\t65.96\t19.95\t3000\t315\t23\t2026-08-08\t임대중\t공원기준 2F",
  "B1F\tB101호\t1종근생\t그랑핸드 (B1~B2 통합)\t77.24\t23.36\t11000\t772\t50\t2027-01-19\t임대중\t공원기준 1F",
  "B2F\tB201호\t1종근생\t그랑핸드 (B1 통합포함)\t88.61\t26.80\t0\t0\t0\t2027-01-19\t임대중\tB1 금액합산",
].join("\n");

const CSV_02_TSV = [
  "층\t호수\t용도\t임차인\t보증금(만원)\t월임대료(만원)\t월관리비(만원)\t만기일\t임대상태\t비고",
  "B1F\tB101호\t유흥/노래방\t쉘브르노래방\t2000\t120\t27.2\t2027-08-31\t임대중\t장기임차",
  "B1F\tB102호\t유흥/단란주점\t엘브론7080\t1000\t100\t22.6\t2027-08-31\t임대중\t장기임차",
  "1F\t101호\t음식점\t미미마라탕\t1500\t100\t9.3\t2027-03-09\t임대중\t-",
  "1F\t102호\t음식점\t국수집\t2000\t130\t15.0\t2027-09-29\t임대중\t-",
  "1F\t103호\t음식점\t피자스쿨\t5000\t170\t12.0\t2027-05-31\t임대중\t-",
  "2F\t201호\t의원/치과\t공실(구 한마음치과)\t0\t0\t0\t-\t공실\t예상임대 보5000/월290",
  "2F\t202호\t업무시설\t보험사사무실\t3000\t140\t24.9\t-\t임대중\t장기임차",
  "3F\t301호\t고시원\t아이비하우스\t11000\t360\t76.8\t-\t임대중\t장기임차",
  "4F\t401호\t근생/창고\t아이엠박스\t3000\t180\t30.6\t-\t임대중\t계약협의중",
  "4F\t402호\t근생/창고\t아이엠박스\t1000\t95\t13.2\t-\t임대중\t-",
  "4F\t403호\t업무시설\t렌터카\t1000\t55\t6.0\t2026-04-30\t임대중\t-",
  "4F\t404호\t근생/창고\t아이엠박스\t1000\t70\t7.8\t-\t임대중\t-",
  "5F\t501호\t교육/강의실\t강의실 (리스백조건)\t7000\t380\t76.8\t-\t임대중\t매도자 리스백",
  "6F\t601호\t업무시설\t엔텔레콤\t4000\t150\t40.3\t-\t임대중\t장기임차",
  "6F\t602호\t업무시설\t엔텔레콤\t2000\t100\t20.0\t-\t임대중\t장기임차",
  "7F\t701호\t근생/파티룸\t하이브파티룸\t1000\t80\t21.0\t2027-08-31\t임대중\t-",
  "주차타워\t기계식22대\t부대수익\t월고정주차\t0\t0\t198.0\t-\t임대중\t대당 9만원 고정",
].join("\n");

const CSV_03_TSV = [
  "층\t호수\t용도\t임차인\t면적(㎡)\t면적(평)\t보증금(만원)\t월임대료(만원)\t월관리비(만원)\t만기일\t임대상태\t비고",
  "B1F\t전층\t업무시설\t(주)스파크플러스\t1712.40\t518.00\t20936\t2221.1\t1703.6\t2031-02-28\t임대중\t마스터리스",
  "1F\t101호\t금융업소\t농협은행 역삼금융센터\t683.80\t206.85\t130000\t7128.5\t1155.1\t2027-09-30\t임대중\t1F+202호 합산반영",
  "2F\t202호\t금융업소\t농협은행 역삼금융센터 (1F 합산)\t439.67\t133.00\t0\t0\t0\t2027-09-30\t임대중\t1F 금액합산",
  "2F\t201호\t업무시설\t리온홀딩스(유)\t439.67\t133.00\t15000\t1064.0\t518.7\t2026-02-15\t임대중\t임대중",
  "3F\t301호\t업무시설\t서우회계법인 (12층 합산)\t626.18\t189.42\t0\t0\t0\t2027-04-30\t임대중\t12F 금액합산",
  "3F\t302호\t업무시설\t(주)인바이트커뮤니케이션\t112.40\t34.00\t0\t104.8\t95.2\t2026-03-31\t임대중\t무보증 월세",
  "3F\t303호\t업무시설\t(주)여삼 (자가사용)\t107.70\t32.58\t0\t0\t0\t-\t자가사용\t소유자 자가점유",
  "4F\t전층\t업무시설\t(주)스파크플러스\t846.28\t256.00\t22784\t2417.2\t841.9\t2031-02-28\t임대중\t마스터리스",
  "5F\t전층\t업무시설\t(주)스파크플러스\t846.28\t256.00\t22784\t2417.2\t841.9\t2031-02-28\t임대중\t마스터리스",
  "6F\t전층\t업무시설\t(주)스파크플러스\t846.28\t256.00\t22784\t2417.2\t841.9\t2031-02-28\t임대중\t마스터리스",
  "7F\t전층\t업무시설\t(주)스파크플러스\t846.28\t256.00\t22784\t2417.2\t841.9\t2031-02-28\t임대중\t마스터리스",
  "8F\t전층\t업무시설\t(주)스파크플러스\t846.28\t256.00\t22784\t2417.2\t841.9\t2031-02-28\t임대중\t마스터리스",
  "9F\t전층\t업무시설\t(주)스파크플러스\t846.28\t256.00\t22784\t2417.2\t841.9\t2031-02-28\t임대중\t마스터리스",
  "10F\t전층\t업무시설\t(주)스파크플러스\t846.28\t256.00\t22784\t2417.2\t841.9\t2031-02-28\t임대중\t마스터리스",
  "11F\t전층\t업무시설\t(주)스파크플러스\t846.28\t256.00\t22784\t2417.2\t841.9\t2031-02-28\t임대중\t마스터리스",
  "12F\t전층\t업무시설\t서우회계법인\t878.85\t265.85\t51000\t4773.5\t2273.1\t2027-04-30\t임대중\t301·12F·1301 합산",
  "13F\t1301호\t업무시설\t서우회계법인 (12F 합산)\t373.56\t113.00\t0\t0\t0\t2027-04-30\t임대중\t12F 금액합산",
  "13F\t1302호\t업무시설\t서우회계법인\t252.66\t76.43\t10000\t611.5\t305.7\t2027-04-30\t임대중\t임대중",
  "13F\t1303호\t업무시설\t서우회계법인\t252.66\t76.43\t10000\t611.5\t305.7\t2027-04-30\t임대중\t임대중",
  "14F\t전층\t업무시설\t(주)스파크플러스\t846.28\t256.00\t22784\t2417.2\t841.9\t2031-02-28\t임대중\t마스터리스",
  "15F\t전층\t업무시설\t(주)스파크플러스\t846.28\t256.00\t22784\t2417.2\t841.9\t2031-02-28\t임대중\t마스터리스",
].join("\n");

const IM07_MUTATED_TSV = [
  "층\t호수\t업종\t보증금\t월세\t관리비\t만기일\t상태",
  "-1\tB101호\t구내식당\t30000000\t2200000\t250000\t2027.08\t임대중",
  "1\t101호\t편의점\t50000000\t4200000\t400000\t2028.04\t임대중",
  "2\t201호\t내과의원\t40000000\t3100000\t350000\t2027.11\t임대중",
  "5\t501호\t세무법인\t30000000\t2400000\t300000\t2028.02\t임대중",
].join("\n");

// ── 1. 뉴스레터 6종 ────────────────────────────────────────────────────────

export const NEWSLETTER_SHOWCASE_6: readonly ShowcaseNewsletterScenario[] = [
  {
    id: "NL-D1",
    category: "newsletter",
    title: "일간 · 표준형 (강남·서초 핵심 시황 + 추천 매물 2건)",
    subtitle: "3줄 명사형 시황 요약 + 핵심 이슈 3선 + 옵트인 단독 푸터",
    ogDescription: "강남·마포 코너 꼬마빌딩 시황 브리핑과 추천 매물 2건을 정리해 보내드립니다.",
    edgeFocus: "일간 표준 5단(제목-브리핑-이슈-매물-연락처+구독) 정합성",
    editionType: "daily",
    cadenceLabel: "일간 뉴스레터 · 표준",
    editionLabel: "qa-nl-d1-2026-10-21",
    issueDate: "2026-10-21",
    marketTemp: "선별 매수",
    headlineTemplate: "오늘 서울 핵심 상권, 우량 꼬마빌딩 문의가 늘고 있습니다",
    rawBrokerMemo:
      "강남과 마포 코너 건물 위주로 매수 문의가 다시 늘고 있습니다. 공실이 적고 1층 임차인이 탄탄한 물건은 매수자가 가격을 크게 깎으려 하지 않는 분위기입니다.",
    plainBriefingFallback:
      "• 시중은행 상가담보 금리 연 4.1%대 안착, 우량 코너 매수 상담 증가\n• 강남·홍대 대로변 1층 만실 근생빌딩, 호가 조정 없는 실거래세 유지\n• 이면 노후 공실 건물은 선별 관망세, 임대 안정된 70억~200억대 강세",
    unitIssues: [
      {
        id: "nl-d1-issue-1",
        channel: "rate_finance",
        topic: "대출·금리",
        title: "시중은행 상가담보 대출금리 4%초반 안착, 이자 부담이 덜해졌습니다",
        brief:
          "작년보다 빌딩 살 때 내는 대출 이자가 0.6%포인트 가까이 내려왔습니다. 100억 건물을 절반 대출받아 사시면 연간 이자가 약 3천만원 줄어 월세로 이자 감당이 한결 수월해집니다.",
        memoTone: "sky",
        sentiment: "bullish",
      },
      {
        id: "nl-d1-issue-2",
        channel: "real_estate",
        topic: "상업부동산",
        title: "홍대·연남 코너 근생빌딩, 1층 유명 브랜드 임차 시 매도 호가 유지",
        brief:
          "유동인구가 많은 대로·공원 접면 1층에 검증된 브랜드가 들어찬 건물은 금리 변동과 무관하게 제값을 받고 거래됩니다. 반면 외진 이면도로 노후 건물은 임대료 협상이 길어지는 양극화가 뚜렷합니다.",
        memoTone: "amber",
        sentiment: "neutral",
      },
      {
        id: "nl-d1-issue-3",
        channel: "tax_legal",
        topic: "상속·세무",
        title: "자녀에게 꼬마빌딩 증여 전, 최근 6개월 공시·감정평가 기준 먼저 보세요",
        brief:
          "국세청이 비주거용 건물 증여 시 시가 대비 낮은 기준시가 평가를 꼼꼼히 들여다보고 있습니다. 연내 가족 증여나 법인 이전을 검토 중이시라면 감정가액과 취득세 비용을 미리 비교해 보셔야 손해를 줄입니다.",
        memoTone: "mint",
        sentiment: "neutral",
      },
    ],
    dealRefs: ["DC-01", "DC-04"],
    defaultFontScale: "normal",
    inputSummary: "강남·마포 3줄 핵심 요약 + 이슈 3건 + 딜카드 2건(DC-01, DC-04)",
    oracleCriteria: [
      "별도 '브리핑 소제목' 미노출 및 3줄 명사형 핵심 요약 유지",
      "이슈 카드에 '이슈 1' 번호 없이 분야 배지(대출·금리 등)만 깔끔히 표시",
      "하단 유틸리티 메뉴 없이 뉴스레터 신청 옵트인만 노출",
    ],
  },
  {
    id: "NL-D2",
    category: "newsletter",
    title: "일간 · 엣지 (매물 0건 순수 브리핑 + 3줄 핵심 요약)",
    subtitle: "추천 매물 0건일 때 빈 박스 제거 + 3줄 명사형 시황 요약·이슈 2선",
    ogDescription: "오늘의 금리·상가 공실 동향과 건물 관리 체크포인트를 정리해 보내드립니다.",
    edgeFocus: "매물 0건 조건부 미노출 & 3줄 핵심 요약·이슈 텍스트 예산 경계",
    editionType: "daily",
    cadenceLabel: "일간 뉴스레터 · 엣지",
    editionLabel: "qa-nl-d2-2026-10-22",
    issueDate: "2026-10-22",
    marketTemp: "관망",
    headlineTemplate: "매물 대신 꼭 챙겨 보실 오늘의 금리·공실 핵심 동향입니다",
    rawBrokerMemo:
      "오늘은 특별히 급하게 추천할 매물은 빼고, 서울 시내 상가 공실률 변화와 올해 말 재산세·임대소득 점검 포인트만 고객님들께 조용히 정리해서 전해드리려 합니다.",
    plainBriefingFallback:
      "• 서울 중대형 상가 공실률 8.6% 보합, 대로변 병의원·약국 임차 강세\n• 연말 담보대출 만기 2개월 전 타행 대환 비교 시 연 0.3%p 절감\n• 4분기 부가세·재산세 신고 전 무상임대 약정 및 관리비 내역 대조 필수",
    unitIssues: [
      {
        id: "nl-d2-issue-1",
        channel: "policy",
        topic: "정책·규제",
        title: "내년부터 상업용 건물 관리비 세부 내역 투명 공개 권고, 미리 정비하세요",
        brief:
          "공용 전기료와 청소비, 수선충당금을 한꺼번에 받던 관행을 항목별로 나눠 고지하도록 가이드라인이 강화됩니다. 지금 미리 관리비 부과 내역을 정리해 두시면 향후 매각 시 매수인 실사 과정에서 신뢰가 크게 높아집니다.",
        memoTone: "lavender",
        sentiment: "neutral",
      },
      {
        id: "nl-d2-issue-2",
        channel: "retail_trend",
        topic: "상권·임차",
        title: "1층 무인매장보다 병·의원과 학원, 생활밀착 약국이 건물 가치를 지킵니다",
        brief:
          "단기 유행 업종이 빠져나간 자리에 치과·한의원이나 검증된 생활 학원이 5년 이상 장기 계약으로 들어오면 건물 매각 평가 금액이 올라갑니다. 임대료를 조금 낮추더라도 신용도 높은 장기 임차인을 들이는 편이 유리합니다.",
        memoTone: "peach",
        sentiment: "bullish",
      },
    ],
    dealRefs: [],
    defaultFontScale: "normal",
    inputSummary: "3줄 명사형 시황 요약 + 이슈 2건 + 추천 매물 0건([])",
    oracleCriteria: [
      "매물 0건일 때 빈 회색 추천 매물 박스 미노출",
      "3줄 명사형 시황 요약 및 이슈 카드 줄바꿈 정상 유지",
      "모바일 390px 가로 넘침 0px",
    ],
  },
  {
    id: "NL-W1",
    category: "newsletter",
    title: "주간 · 표준형 (5대 관심 채널 황금배합 + 매물 3건)",
    subtitle: "성수·마포·부천 다권역 3줄 핵심 요약 + 분야별 이슈 4선 + 추천 매물 3건",
    ogDescription: "금주 주요 상권 매수 흐름과 리모델링·수익형 추천 매물 3건을 안내드립니다.",
    edgeFocus: "표준 주간호 캐러셀(3매물) + 5대 분야 배지 + 지번 마스킹",
    editionType: "weekly",
    cadenceLabel: "주간 뉴스레터 · 표준",
    editionLabel: "qa-nl-w1-2026-10-14",
    issueDate: "2026-10-14",
    marketTemp: "적극 매수",
    headlineTemplate: "이번 주 건물주·매수자가 가장 많이 찾은 3개 권역 핵심 흐름",
    rawBrokerMemo:
      "이번 주에는 마포 동교동과 부천 심곡동 밸류애드 빌딩 문의가 동시에 많았습니다. 실수요 사옥과 수익형 리모델링 매물 3건을 엄선했습니다.",
    plainBriefingFallback:
      "• 서울 중소형 빌딩 거래 중 70억~100억대 비중 48%로 매수세 집중\n• 마포 만실 근생 연 4.1%대, 부천 역세권 리모델링 연 5.2%대 형성\n• 금융권 임대수입 심사 강화로 연체 없는 우량 임차 건물 담보한도 우위",
    unitIssues: [
      {
        id: "nl-w1-issue-1",
        channel: "real_estate",
        topic: "상업부동산",
        title: "70억~100억대 중소형 근생빌딩 거래 비중, 서울 전체 거래의 절반 육박",
        brief:
          "초대형 빌딩은 대기업과 펀드 중심으로 움직이지만, 실제 개인과 가족 법인 매수세는 70억~100억 구간에 몰려 있습니다. 환금성이 좋아 매각 시에도 다음 매수자를 찾기 가장 수월한 가격대입니다.",
        memoTone: "amber",
        sentiment: "bullish",
      },
      {
        id: "nl-w1-issue-2",
        channel: "rate_finance",
        topic: "대출·금리",
        title: "감정가 대비 임대수익이 받쳐주면 담보인정비율 65% 내외 조달 원활",
        brief:
          "은행 심사역들이 최근 건물 외관보다 실제 통장에 찍히는 월세 입금 내역(임대차계좌)을 더 중요하게 봅니다. 연체 없는 우량 임차인이 많을수록 같은 건물이라도 대출 한도가 5~10% 더 나옵니다.",
        memoTone: "sky",
        sentiment: "bullish",
      },
      {
        id: "nl-w1-issue-3",
        channel: "tax_legal",
        topic: "세무·법률",
        title: "신축·대수선 리모델링 비용 영수증 누락 시 향후 양도세 수천만원 손해",
        brief:
          "노후 빌딩을 매수해 엘리베이터를 신설하거나 외관을 고칠 때 세금계산서와 공사 계약서를 꼭 보관하셔야 합니다. 추후 건물을 파실 때 필요경비로 인정받아 양도소득세 부담을 크게 덜 수 있습니다.",
        memoTone: "mint",
        sentiment: "neutral",
      },
      {
        id: "nl-w1-issue-4",
        channel: "retail_trend",
        topic: "상권·임차",
        title: "연남·대흥 생활밀착 상권, 주말뿐 아니라 평일 직장인 점심 수요로 안정화",
        brief:
          "과거 주말 방문객에만 의존하던 서북권 골목 상권에 중소형 사옥이 늘면서 평일 소비가 탄탄해졌습니다. 주 7일 꾸준한 매출이 나와 1층 임차인들의 재계약 비율도 높아지는 흐름입니다.",
        memoTone: "peach",
        sentiment: "bullish",
      },
    ],
    dealRefs: ["DC-01", "DC-02", "DC-05"],
    defaultFontScale: "normal",
    inputSummary: "주간 3줄 핵심 요약 + 4개 분야 이슈 + 매물 3건(DC-01, DC-02, DC-05)",
    oracleCriteria: [
      "3건 매물 캐러셀(1/3 카운터 + 좌우 스크롤 + 모바일 IM 열람 CTA)",
      "모든 매물 지번(189-6, 395-166, 12-41) 일대/인근으로 마스킹",
      "가짜 브로커 이메일형 연락처 미노출",
    ],
  },
  {
    id: "NL-W2",
    category: "newsletter",
    title: "주간 · 엣지 (중개인명 결합 제목 프리셋 + 단일 급매 1건)",
    subtitle: "제목 짓기 부담 해소 프리셋 '[중개인명]의 이번 주 빌딩 시장 브리핑' + 3줄 요약 + 매물 1건",
    ogDescription: "서교동 역세권 급매물 1건과 만실 기준 수익성 검토 포인트를 전해드립니다.",
    edgeFocus: "중개인명 자동 결합 제목 프리셋 & 1건 매물 카드(카운터 미노출)",
    editionType: "weekly",
    cadenceLabel: "주간 뉴스레터 · 엣지",
    editionLabel: "qa-nl-w2-2026-10-15",
    issueDate: "2026-10-15",
    marketTemp: "조정 대기",
    headlineTemplate: "이번 주 빌딩 시장 브리핑",
    useBrokerNamePreset: true,
    rawBrokerMemo:
      "제목 고민 없이 매주 드리는 현장 브리핑입니다. 서교동 대로 이면 2층 공실 1칸만 채우면 바로 수익률이 뛰는 매물 1건만 콕 집어 드립니다.",
    plainBriefingFallback:
      "• 마포 서교동 역세권 60억대 급매 희소, 대지·건물 동시 확보 적기\n• 2층 공실 1개 층 신규 임차 시 만실 기대수익률 연 4.3% 확보\n• 매도인 연내 잔금 일정 협의 가능, 답사 및 임대 재구성 검토 우위",
    unitIssues: [
      {
        id: "nl-w2-issue-1",
        channel: "real_estate",
        topic: "상업부동산",
        title: "공실 있는 건물은 '현재 월세' 말고 '만실 기준 예상 임대료'로 가격 따지세요",
        brief:
          "명도가 끝난 빈 층이 있으면 당장 월세가 깎여 보이지만, 오히려 내 취향에 맞는 우량 임차인을 새로 들일 수 있는 장점도 있습니다. 인근 시세의 80% 수준만 보수적으로 잡아도 수익률이 맞는지 계산해 보셔야 합니다.",
        memoTone: "amber",
        sentiment: "bullish",
      },
      {
        id: "nl-w2-issue-2",
        channel: "policy",
        topic: "정책·규제",
        title: "오래된 근린생활시설, 내진·주차장 대수 기준 변동 여부를 계약 전 확인하세요",
        brief:
          "1990년대 준공 건물은 용도를 바꾸거나 1층 업종을 변경할 때 부설주차장 기준이 발목을 잡는 경우가 종종 있습니다. 계약서 도장을 찍기 전에 건축물대장상 위법건축물 표시와 주차 대수를 반드시 확인해야 합니다.",
        memoTone: "lavender",
        sentiment: "neutral",
      },
    ],
    dealRefs: ["DC-02"],
    defaultFontScale: "normal",
    inputSummary: "중개인명 프리셋 제목 + 3줄 핵심 요약 + 단일 급매 1건(DC-02)",
    oracleCriteria: [
      "헤드라인에 브로커 성함 포함('[중개인명]의 이번 주 빌딩 시장 브리핑')",
      "단일 매물(1건)일 때 '1 / 1' 캐러셀 카운터 불필요 노출 없음",
    ],
  },
  {
    id: "NL-M1",
    category: "newsletter",
    title: "월간 · 표준형 옵션 A (강남·서초 실거래 + 한은 대출금리 비교 그래프 2선)",
    subtitle: "월간 최상단 공공 통계 그래픽 2선(국토부 실거래 + 한국은행 금리) + 3줄 핵심 요약",
    ogDescription: "강남·서초 통건물 실거래 흐름과 상업대출 금리 비교 리포트를 보내드립니다.",
    edgeFocus: "월간 옵션 A(molit_bok) 상단 그래프 2건 + 출처 투명성 표기 검증",
    editionType: "monthly",
    cadenceLabel: "월간 뉴스레터 · 옵션 A",
    editionLabel: "qa-nl-m1-2026-10-01",
    issueDate: "2026-10-01",
    marketTemp: "선별 매수",
    headlineTemplate: "2026년 10월 월간 리포트: 강남·서초 실거래와 금리 격차가 말해주는 매수 타이밍",
    rawBrokerMemo:
      "이번 달 월간호는 국토부 통건물 실거래 추이와 한국은행 상업대출 금리를 한눈에 비교해 드립니다. 강남·서초 사옥 수요와 동교동 리테일 매물을 함께 짚었습니다.",
    plainBriefingFallback:
      "• 강남·서초 통건물 실거래 전월 대비 14% 증가, 법인 매수세 견조\n• 한은 상업담보 금리 연 4.2%대 안정, 보유 이자 부담 점진 완화\n• 즉시 입주 사옥용 200억대·만실 근생 70억대 우량 매물 거래 집중",
    unitIssues: [
      {
        id: "nl-m1-issue-1",
        channel: "rate_finance",
        topic: "대출·금리",
        title: "대출금리 4%대 안착, 임대수익률 3% 후반대 우량 빌딩의 실질 이자 부담 완화",
        brief:
          "지난 2년간 건물 매수를 미루셨던 가장 큰 이유인 고금리 부담이 정점을 지났습니다. 입지가 좋은 강남·마포 빌딩은 임대료 상승 여력까지 고려하면 3년 보유 기준 현금흐름이 뚜렷하게 개선됩니다.",
        memoTone: "sky",
        sentiment: "bullish",
      },
      {
        id: "nl-m1-issue-2",
        channel: "real_estate",
        topic: "상업부동산",
        title: "서초·역삼 법인 사옥 매수세, '임차 리스크 없는 전층 명도' 매물에 프리미엄",
        brief:
          "사옥 이전 목적의 중견기업과 병·의원은 매수 후 즉시 인테리어 공사를 시작할 수 있는 전층 명도 조건을 최우선으로 꼽습니다. 명도 완료 조건이 갖춰진 사옥형 빌딩은 가격 방어력이 높습니다.",
        memoTone: "amber",
        sentiment: "bullish",
      },
      {
        id: "nl-m1-issue-3",
        channel: "tax_legal",
        topic: "세무·법률",
        title: "법인 명의 사옥 매수 시 대도시권 취득세 중과 예외 요건 사전 점검 필수",
        brief:
          "서울 과밀억제권역 안에서 신설·휴면 법인이 5년 이내에 부동산을 취득하면 취득세가 중과될 수 있습니다. 본점 이전 요건이나 임대사업 비율에 따라 세금 차이가 수억원에 달하므로 계약 전 세무 검토가 필수입니다.",
        memoTone: "mint",
        sentiment: "neutral",
      },
    ],
    dealRefs: ["DC-01", "DC-04", "DC-06"],
    monthlyRegion: "gbd",
    monthlyPair: "molit_bok",
    defaultFontScale: "normal",
    inputSummary: "월간 옵션 A(gbd · molit_bok) 상단 그래프 2건 + 3줄 요약 + 매물 3건(DC-01, DC-04, DC-06)",
    oracleCriteria: [
      "월간 상단 통계 그래픽 2선(실거래 추이 + 대출금리·수익률 비교) 정상 렌더링",
      "각 그래프 출처(국토교통부/한국은행 또는 시장 기준 참고치) 투명 표기",
      "대형 프라임 2,000억(DC-06) 가격 표기 말줄임·오버플로우 없음",
    ],
  },
  {
    id: "NL-M2",
    category: "newsletter",
    title: "월간 · 엣지 (영등포·여의도 옵션 B 금액대 그래프 + 초고령 21px 모드)",
    subtitle: "비강남(YBD) 금액대별 거래 비중 + 3줄 핵심 요약 + 아주 크게(21px) 줄바꿈",
    ogDescription: "여의도·영등포 권역 금액대별 거래 비중과 핵심 추천 매물을 확인해 보세요.",
    edgeFocus: "옵션 B(molit_band) 그래프 + 70대 아주 크게(xlarge) 모드 레이아웃 무결성",
    editionType: "monthly",
    cadenceLabel: "월간 뉴스레터 · 엣지(21px)",
    editionLabel: "qa-nl-m2-2026-10-02",
    issueDate: "2026-10-02",
    marketTemp: "선별 매수",
    headlineTemplate: "여의도·영등포 권역 금액대별 거래 흐름과 큰글씨 매수 체크포인트",
    rawBrokerMemo:
      "강남 외 권역인 영등포·여의도와 용인 보정동 일대를 보시는 시니어 건물주분들을 위해 글씨를 크게 보셔도 시원한 구성과 금액대별 거래 비중 그래프를 담았습니다.",
    plainBriefingFallback:
      "• 영등포·당산 빌딩 거래 중 80억~150억대 비중 52%로 거래 최다\n• 2·9호선 환승권 공실률 3.4% 유지, 여의도 배후 임차 수요 탄탄\n• 대단지 배후 역세권 병의원·학원 장기임차 근생빌딩 가격 방어 우위",
    unitIssues: [
      {
        id: "nl-m2-issue-1",
        channel: "real_estate",
        topic: "상업부동산",
        title: "100억원대 전후 꼬마빌딩, 영등포·당산 더블역세권 중심으로 손바뀜 활발",
        brief:
          "지하철 2·9호선이 만나는 당산역 일대는 여의도 금융권 직장인 배후 수요 덕분에 소형 오피스와 상가 공실이 매우 적습니다. 같은 예산으로 강남보다 1.5~2배 넓은 대지를 확보할 수 있어 실속파 매수자가 선호합니다.",
        memoTone: "amber",
        sentiment: "bullish",
      },
      {
        id: "nl-m2-issue-2",
        channel: "retail_trend",
        topic: "상권·임차",
        title: "대형 아파트 단지 배후 근생빌딩, 병원·학원 장기 임차로 경기 불황에 강합니다",
        brief:
          "유흥·단기 유행 상권보다 세대수가 많은 배후 주거지 앞 근린생활시설은 경기 부침이 훨씬 덜합니다. 특히 소아과·내과·약국이나 초중등 학원이 1~3층에 자리 잡은 건물은 10년 이상 안정적 월세 수취가 가능합니다.",
        memoTone: "mint",
        sentiment: "bullish",
      },
    ],
    dealRefs: ["DC-07", "DC-08"],
    monthlyRegion: "ybd",
    monthlyPair: "molit_band",
    defaultFontScale: "xlarge",
    inputSummary: "월간 옵션 B(ybd · molit_band) + 3줄 핵심 요약 + 아주 크게(xlarge) 21px + 다필지(DC-07)·가격협의(DC-08)",
    oracleCriteria: [
      "옵션 B '금액대별 거래 비중' 막대 그래프 2선 정상 표시",
      "아주 크게(xlarge 21px) 상태에서 버튼·그래프·카드 겹침 및 가로 스크롤 0px",
      "다필지(72-1) 지번 비노출 & 가격협의(DC-08) 폴백 정상 표시",
    ],
  },
];

// ── 2. 딜카드 8종 ──────────────────────────────────────────────────────────

export const DEALCARD_SHOWCASE_8: readonly ShowcaseDealCardScenario[] = [
  {
    id: "DC-01",
    category: "dealcard",
    buildingId: "5c0ca5e0-0001-4000-8000-000000000001",
    title: "수익형 표준 · 동교동 경의선숲길 코너 근생 (77억)",
    subtitle: "만실 리테일 빌딩 + 실사진 4장 + 지번 블라인드 방어",
    deliverableTitle: "동교동 경의선숲길 코너 근생 (70~80억대)",
    ogDescription: "마포구 동교동 만실 수익형 근린생활시설 매물 요약",
    edgeFocus: "수익형 표준 4분할(지역·용도·면적·가격대) & 지번 '189-6' 블라인드 차단",
    posture: "income_producing",
    card4Posture: "income",
    address: "서울특별시 마포구 동교동 189-6",
    askingPriceManwon: 770000,
    askingPriceReadout: "77억 원 (70~80억대)",
    landAreaSqm: 137.2,
    gfaSqm: 426.11,
    zoning: "제2종일반주거지역",
    completionDate: "2019-05-30",
    fastFillMemo:
      "마포구 동교동 경의선숲길 전면 코너 근린생활시설, 77억대, 대지 41평 연 129평, 유명 향수 플래그십 등 전층 만실 월세 1817만원",
    handoverNote: "전층 우량 리테일 임차인 100% 만실 임대차 승계",
    rentRoll: [
      { floor: "B1F", unit: "B101호", use: "리테일 플래그십", area_sqm: 77.24, depositManwon: 11000, monthlyRentManwon: 772, maintenanceManwon: 50, status: "occupied" },
      { floor: "1F", unit: "101호", use: "근린생활시설", area_sqm: 65.96, depositManwon: 3000, monthlyRentManwon: 315, maintenanceManwon: 23, status: "occupied" },
      { floor: "2F", unit: "201호", use: "의원", area_sqm: 78.96, depositManwon: 3000, monthlyRentManwon: 309, maintenanceManwon: 23, status: "occupied" },
      { floor: "3F", unit: "301호", use: "뷰티샵", area_sqm: 57.67, depositManwon: 2000, monthlyRentManwon: 231, maintenanceManwon: 10, status: "occupied" },
      { floor: "4F", unit: "401호", use: "스튜디오", area_sqm: 57.67, depositManwon: 3000, monthlyRentManwon: 190, maintenanceManwon: 17.5, status: "occupied" },
    ],
    photos: SHOWCASE_PHOTO_SETS.donggyo4,
    forbiddenPublicTokens: ["189-6", "그랑핸드", "GRANHAND"],
    inputSummary: "동교동 189-6 · 77억 · 전층 만실 5개 층 · 실사진 4장",
    oracleCriteria: [
      "공개 딜카드(/dc) & 카카오 OG 이미지에서 상세 지번(189-6)·브랜드명 완전 마스킹",
      "수익형 4분할(마포구 동교동 / 근린생활시설 / 연 129평 / 70억대) 깔끔 표기",
      "모바일 390px 가로 넘침 0px",
    ],
  },
  {
    id: "DC-02",
    category: "dealcard",
    buildingId: "5c0ca5e0-0001-4000-8000-000000000002",
    title: "수익형 부분 공실 · 서교동 합정역세권 밸류애드 (68억)",
    subtitle: "1층 만실 + 2층 공실 리스업 밸류애드 기회",
    deliverableTitle: "서교동 합정역세권 리모델링 근생 (60~70억대)",
    ogDescription: "마포구 서교동 합정역 도보권 근린생활시설 · 2층 공실 임대 재구성 가능",
    edgeFocus: "부분 공실 상태의 수익·밸류애드 포인트 정직 표기",
    posture: "income_producing",
    card4Posture: "value_add",
    address: "서울특별시 마포구 서교동 395-166",
    askingPriceManwon: 680000,
    askingPriceReadout: "68억 원 (60~70억대)",
    landAreaSqm: 215.4,
    gfaSqm: 580.2,
    zoning: "제2종일반주거지역",
    completionDate: "2015-08-20",
    fastFillMemo:
      "마포구 서교동 합정역 도보권 근생빌딩, 68억대, 대지 65평 연 175평, 2층 공실 즉시 리뉴얼 가능 밸류애드 매물",
    handoverNote: "2층 현 공실 상태, 신규 임차 맞추거나 자가 오피스 활용 가능",
    rentRoll: [
      { floor: "1F", unit: "101호", use: "카페·베이커리", area_sqm: 140, depositManwon: 10000, monthlyRentManwon: 750, maintenanceManwon: 40, status: "occupied" },
      { floor: "2F", unit: "201호", use: "공실 (예정 오피스)", area_sqm: 140, depositManwon: 0, monthlyRentManwon: 0, maintenanceManwon: 0, status: "vacant" },
      { floor: "3F", unit: "301호", use: "디자인사무소", area_sqm: 140, depositManwon: 4000, monthlyRentManwon: 320, maintenanceManwon: 25, status: "occupied" },
    ],
    photos: SHOWCASE_PHOTO_SETS.bucheon4.slice(0, 3),
    forbiddenPublicTokens: ["395-166"],
    inputSummary: "서교동 395-166 · 68억 · 2F 공실 포함 밸류애드 · 실사진 3장",
    oracleCriteria: [
      "지번(395-166) 미노출 및 마포구 서교동 일대 마스킹",
      "공실·밸류애드 맥락이 포스처에 맞게 정직하게 노출",
    ],
  },
  {
    id: "DC-03",
    category: "dealcard",
    buildingId: "5c0ca5e0-0001-4000-8000-000000000003",
    title: "100% 전층 공실 · 부천 명도완료 밸류애드 (52억 · 0나누기 방어)",
    subtitle: "전층 명도 완료 (보증금 0 · 월세 0) Zero-Division 방어 검증",
    deliverableTitle: "부천 심곡동 역세권 명도완료 빌딩 (50억대)",
    ogDescription: "전층 명도 완료 · 매수 후 즉시 리모델링 또는 통사옥 입주 가능",
    edgeFocus: "월세 0원 · 점유율 0% 상태에서 NaN / Infinity 미발생 방어",
    posture: "income_producing",
    card4Posture: "value_add",
    address: "경기도 부천시 원미구 심곡동 385",
    askingPriceManwon: 520000,
    askingPriceReadout: "52억 원 (50억대)",
    landAreaSqm: 380.0,
    gfaSqm: 1120.5,
    zoning: "일반상업지역",
    completionDate: "2002-04-15",
    fastFillMemo:
      "부천시 원미구 심곡동 역세권 상업빌딩, 52억, 연 339평, 전층 명도 완료 리모델링 또는 통사옥 즉시 입주 가능",
    handoverNote: "전층 명도 완료 상태(현행 임대차 없음), 매수 즉시 리모델링 착공 가능",
    rentRoll: [
      { floor: "1F", unit: "101호", use: "공실 (명도완료)", area_sqm: 280, depositManwon: 0, monthlyRentManwon: 0, maintenanceManwon: 0, status: "vacant" },
      { floor: "2F", unit: "201호", use: "공실 (명도완료)", area_sqm: 280, depositManwon: 0, monthlyRentManwon: 0, maintenanceManwon: 0, status: "vacant" },
      { floor: "3F", unit: "301호", use: "공실 (명도완료)", area_sqm: 280, depositManwon: 0, monthlyRentManwon: 0, maintenanceManwon: 0, status: "vacant" },
    ],
    photos: SHOWCASE_PHOTO_SETS.bucheon4.slice(0, 2),
    forbiddenPublicTokens: ["385"],
    inputSummary: "부천 심곡동 385 · 52억 · 전층 100% 공실(보증금0/월세0)",
    oracleCriteria: [
      "NaN·Infinity·undefined·허위 수익률 문구 0건",
      "보증금·월세 0원 조건에서도 공실 밸류애드·임대차 재구성 관점으로 깔끔히 안내",
    ],
  },
  {
    id: "DC-04",
    category: "dealcard",
    buildingId: "5c0ca5e0-0001-4000-8000-000000000004",
    title: "사옥형 자가사용 · 서초동 법인 사옥 즉시 입주 (230억)",
    subtitle: "owner_occupier 포스처 · 임대료 대신 사옥 활용·주차·접근성 부각",
    deliverableTitle: "서초동 즉시 입주 가능 법인 사옥 (200억대)",
    ogDescription: "서초구 서초동 자가 사옥 적합 빌딩 · 전층 즉시 입주 및 주차 14대",
    edgeFocus: "사옥형 포스처 격리(수익형 문구 혼입 차단)",
    posture: "owner_occupier",
    card4Posture: "owner_occupied",
    address: "서울특별시 서초구 서초동 1364-28",
    askingPriceManwon: 2300000,
    askingPriceReadout: "230억 원 (200억대)",
    landAreaSqm: 512.0,
    gfaSqm: 1850.0,
    zoning: "제3종일반주거지역",
    completionDate: "2018-11-12",
    fastFillMemo:
      "서초구 서초동 양재·강남역 접근성 우수한 사옥용 빌딩, 230억대, 대지 155평 연 560평, 전층 즉시 자가사옥 입주 가능, 자주식 주차 14대",
    handoverNote: "기존 소유법인 이전 예정으로 잔금 시 전층 공실 사옥 인도 가능",
    rentRoll: [
      { floor: "1F", unit: "1층", use: "사옥 리셉션·쇼룸", area_sqm: 310, depositManwon: 0, monthlyRentManwon: 0, maintenanceManwon: 0, status: "owner" },
      { floor: "2F", unit: "2층", use: "임원실·회의실", area_sqm: 310, depositManwon: 0, monthlyRentManwon: 0, maintenanceManwon: 0, status: "owner" },
      { floor: "3F", unit: "3층", use: "본사 업무공간", area_sqm: 310, depositManwon: 0, monthlyRentManwon: 0, maintenanceManwon: 0, status: "owner" },
      { floor: "4F", unit: "4층", use: "본사 R&D·라운지", area_sqm: 310, depositManwon: 0, monthlyRentManwon: 0, maintenanceManwon: 0, status: "owner" },
    ],
    photos: SHOWCASE_PHOTO_SETS.seocho4,
    forbiddenPublicTokens: ["1364-28"],
    inputSummary: "서초동 1364-28 · 230억 · 사옥형 자가사용(owner_occupier) · 실사진 4장",
    oracleCriteria: [
      "사옥형 포스처('사옥 입주' 맥락) 유지 및 상세 지번(1364-28) 마스킹",
      "230억(200억대) 가격대 및 연면적(560평) 정확한 표기",
    ],
  },
  {
    id: "DC-05",
    category: "dealcard",
    buildingId: "5c0ca5e0-0001-4000-8000-000000000005",
    title: "개발형 신축부지 · 마포 대흥동 대지 중심 매각 (78억)",
    subtitle: "development 포스처 · 대지면적·용적률·신축 잠재력 중심 표기",
    deliverableTitle: "마포 대흥동 역세권 코너 신축부지 (70~80억대)",
    ogDescription: "대흥역 도보 3분 대지 110평 정방형 코너 · 단기 임대 후 신축 가능",
    edgeFocus: "개발형 매물에서 연면적 대신 대지면적 우선 노출",
    posture: "development",
    card4Posture: "value_add",
    address: "서울특별시 마포구 대흥동 12-41",
    askingPriceManwon: 780000,
    askingPriceReadout: "78억 원 (70~80억대)",
    landAreaSqm: 363.6,
    gfaSqm: 410.0,
    zoning: "제2종일반주거지역",
    completionDate: "1991-03-10",
    fastFillMemo:
      "마포구 대흥동 대흥역 도보 3분 신축 부지, 78억대, 대지 110평 정방형 코너, 단기 임대 후 신축 가능",
    handoverNote: "현 건물 노후로 신축 부지 매각 기준, 임차인 전원 6개월 내 명도 특약 협의",
    rentRoll: [
      { floor: "1F", unit: "101호", use: "단기상가 (명도특약)", area_sqm: 180, depositManwon: 3000, monthlyRentManwon: 260, maintenanceManwon: 0, status: "occupied" },
      { floor: "2F", unit: "201호", use: "단기사무소", area_sqm: 180, depositManwon: 2000, monthlyRentManwon: 180, maintenanceManwon: 0, status: "occupied" },
    ],
    photos: SHOWCASE_PHOTO_SETS.donggyo4.slice(0, 3),
    forbiddenPublicTokens: ["12-41"],
    inputSummary: "마포 대흥동 12-41 · 78억 · 개발형(대지 110평) · 실사진 3장",
    oracleCriteria: [
      "지번(12-41) 마스킹 및 마포구 대흥동 일대 표시",
      "대지 110평·신축 개발 포스처 문구 깔끔 노출",
    ],
  },
  {
    id: "DC-06",
    category: "dealcard",
    buildingId: "5c0ca5e0-0001-4000-8000-000000000006",
    title: "초고가 프라임 대형 · 강남 역삼동 오피스 빌딩 (2,000억)",
    subtitle: "초대형 2,000억대 숫자 말줄임(…) & 레이아웃 겹침 방어",
    deliverableTitle: "강남 역삼동 테헤란로 코어 오피스 빌딩 (2,000억대)",
    ogDescription: "연면적 4,313평 대형 오피스 빌딩 · 금융·우량 법인 임대 안정 운영",
    edgeFocus: "4자리 억 단위(2,000억대) UI 말줄임·오버플로우 방어",
    posture: "income_producing",
    card4Posture: "income",
    address: "서울특별시 강남구 역삼동 648-23",
    askingPriceManwon: 20000000,
    askingPriceReadout: "2,000억 원 (2,000억대)",
    landAreaSqm: 1452.2,
    gfaSqm: 14256.64,
    zoning: "일반상업지역",
    completionDate: "1985-06-13",
    fastFillMemo:
      "강남구 역삼동 테헤란로 코어 대형 오피스 빌딩, 2,000억대, 대지 439평 연 4,313평, 금융기관 및 공유오피스 마스터리스 입점",
    handoverNote: "기관급 프라임 오피스 빌딩으로 현 임대차 포괄 승계",
    rentRoll: [
      { floor: "1F", unit: "101호", use: "금융지점", area_sqm: 683.8, depositManwon: 130000, monthlyRentManwon: 7128.5, maintenanceManwon: 1155.1, status: "occupied" },
      { floor: "4F", unit: "전층", use: "공유오피스", area_sqm: 846.28, depositManwon: 22784, monthlyRentManwon: 2417.2, maintenanceManwon: 841.9, status: "occupied" },
      { floor: "12F", unit: "전층", use: "회계법인", area_sqm: 878.85, depositManwon: 51000, monthlyRentManwon: 4773.5, maintenanceManwon: 2273.1, status: "occupied" },
    ],
    photos: SHOWCASE_PHOTO_SETS.yeoksam4,
    forbiddenPublicTokens: ["648-23", "농협은행", "스파크플러스", "서우회계"],
    inputSummary: "역삼동 648-23 · 2,000억 · 프라임 오피스 · 천단위 콤마 파싱",
    oracleCriteria: [
      "금액대에 '2,000~2,050억'이 정확히 표시되고 439평·연 4,313평 숫자가 잘리지 않음",
      "지번(648-23) 및 개별 임차인 상호(농협/스파크플러스/서우회계) 비노출",
    ],
  },
  {
    id: "DC-07",
    category: "dealcard",
    buildingId: "5c0ca5e0-0001-4000-8000-000000000007",
    title: "다필지 & 블라인드 경계 · 영등포 당산동 코너 (115억)",
    subtitle: "메모 속 지번(72-1)·브랜드(스타벅스)·연락처(010-9999-8888) 자동 방역",
    deliverableTitle: "영등포 당산동 코너 근생·업무 빌딩 (110~120억대)",
    ogDescription: "당산권역 다필지 통합 코너 건물 · 연면적 499평 대형 카페·의원 입점",
    edgeFocus: "오염 메모 투입 → fast-fill 블라인드 가드 실작동 검증",
    posture: "income_producing",
    card4Posture: "income",
    address: "서울특별시 영등포구 당산동1가 72-1",
    askingPriceManwon: 1150000,
    askingPriceReadout: "115억 원 (110~120억대)",
    landAreaSqm: 412.5,
    gfaSqm: 1649.5,
    zoning: "준공업지역",
    completionDate: "2019-09-20",
    fastFillMemo:
      "서울특별시 영등포구 당산동1가 72-1 외 2필지, 115억, 연 499평, 1층 스타벅스 입점 협의 중, 현장 안내 010-9999-8888",
    handoverNote: "외 2필지 통합 코너 건물, 브로커 직통 연락처는 공개 티저에서 마스킹",
    rentRoll: [
      { floor: "1F", unit: "101호", use: "대형카페", area_sqm: 330, depositManwon: 20000, monthlyRentManwon: 1500, maintenanceManwon: 120, status: "occupied" },
      { floor: "2F", unit: "201호", use: "의원", area_sqm: 330, depositManwon: 10000, monthlyRentManwon: 900, maintenanceManwon: 80, status: "occupied" },
      { floor: "3F", unit: "301호", use: "오피스", area_sqm: 330, depositManwon: 8000, monthlyRentManwon: 750, maintenanceManwon: 70, status: "occupied" },
    ],
    photos: SHOWCASE_PHOTO_SETS.bucheon4.slice(0, 3),
    forbiddenPublicTokens: ["72-1", "스타벅스", "010-9999-8888"],
    inputSummary: "당산동1가 72-1 외 2필지 · 오염 메모(지번+스타벅스+휴대폰번호) 투입",
    oracleCriteria: [
      "공개 딜카드(/dc) 및 OG 이미지에 '72-1', '스타벅스', '010-9999-8888' 완전 차단",
      "외 2필지 대규모 코너 장점과 110억대 가격대는 매수 매력 유지",
    ],
  },
  {
    id: "DC-08",
    category: "dealcard",
    buildingId: "5c0ca5e0-0001-4000-8000-000000000008",
    title: "가격 협의 · 초단문(1줄) 메모 폴백 · 용인 보정동 역세권 빌딩",
    subtitle: "매매가 미입력('가격 협의') + 1줄 초단문 메모일 때도 깔끔한 블라인드 폴백 카드",
    deliverableTitle: "용인 보정동 역세권 근생 빌딩 (가격 협의)",
    ogDescription: "보정역 도보권 근린생활시설 · 장기 우량 임차 운영 중인 비공개 매물",
    edgeFocus: "매매가 미기재('가격 협의') 및 초단문 1줄 입력 상태 웹뷰 + 카카오 OG 정상 렌더링",
    posture: "income_producing",
    card4Posture: "income",
    address: "경기도 용인시 기흥구 보정동 1263",
    askingPriceManwon: 0,
    askingPriceReadout: "가격 협의 (매도인 비공개 · 초단문 메모 폴백)",
    landAreaSqm: 495.8,
    gfaSqm: 1983.4,
    zoning: "준주거지역",
    completionDate: "2017-05-11",
    fastFillMemo:
      "용인 보정동 보정역 도보권 근생빌딩, 가격 협의(비공개 매각), 장기 우량 임차",
    handoverNote: "긴급 접수 매물로 실사진 촬영 전 텍스트·입지 우선 선공개",
    rentRoll: [
      { floor: "1F", unit: "101호", use: "베이커리/카페", area_sqm: 450, depositManwon: 20000, monthlyRentManwon: 1350, maintenanceManwon: 90, status: "occupied" },
      { floor: "2F", unit: "201호", use: "레스토랑", area_sqm: 450, depositManwon: 15000, monthlyRentManwon: 980, maintenanceManwon: 70, status: "occupied" },
      { floor: "3F", unit: "301호", use: "클리닉", area_sqm: 450, depositManwon: 12000, monthlyRentManwon: 780, maintenanceManwon: 60, status: "occupied" },
    ],
    photos: [],
    forbiddenPublicTokens: ["1263"],
    inputSummary: "보정동 1263 · 가격 미기재(가격 협의) · 1줄 초단문 메모 폴백",
    oracleCriteria: [
      "희망가 미입력 시 '가격 협의'가 정확히 노출되고 깨진 레이아웃·NaN 0건",
      "지번(1263) 비노출 · 블라인드 무사진 카드 및 카카오 OG 정상 표시",
    ],
  },
];

// ── 3. IM 8종 (모바일 IM + 실제 PPTX 지면 1:1 쌍) ──────────────────────────

export const IM_SHOWCASE_8: readonly ShowcaseImScenario[] = [
  {
    id: "IM-01",
    category: "im",
    buildingId: "5c0ca5e0-0002-4000-8000-000000000001",
    title: "수익형 표준 · 동교동 THE.PARK (77억 · 통합임차 0원행 방어)",
    subtitle: "B1~B2 통합임차 0원 행 공실 오판 방지 & 멀티포맷 실사진 4장(JPG·PNG·WebP)",
    deliverableTitle: "동교동 THE PARK 빌딩 (근생, 77억)",
    edgeFocus: "CSV_01 B2F 0원 행 '임대중' 보존 + 승강기 0대 명시 + OpenXML 5대 단언",
    posture: "income_producing",
    postureLabel: "수익형 (표준)",
    address: "서울특별시 마포구 동교동 189-6",
    askingPriceManwon: 770000,
    askingPriceReadout: "77억 원 (770,000만 원)",
    landAreaSqm: 137.2,
    gfaSqm: 426.11,
    zoning: "제2종일반주거지역",
    completionDate: "2019-05-30",
    handoverNote: "전층 우량 임차인(B1~B2 통합임차 포함) 100% 만실 임대차 승계 조건",
    rawTsv: CSV_01_TSV,
    photos: SHOWCASE_PHOTO_SETS.donggyo4,
    brokerExtras: {
      investment_points: [
        {
          headline: "경의선숲길 공원 직면 리테일 랜드마크 코너 입지",
          brief: "공부상 지하1~2층이 공원 레벨 기준 지상 1층으로 진출입되어 실질 영업면적이 넓습니다.",
        },
        {
          headline: "B1~B2 통합 플래그십 등 전층 100% 만실 안정 현금흐름",
          brief: "총 보증금 2.2억 / 월 임대료 1,817만 / 관리비 123.5만원 구조로 공실 위험이 낮습니다.",
        },
      ],
      location_note: "홍대입구역·경의선숲길 연남 방면 산책로 최요지 접면",
      post_acquisition_plan: "현 만실 임대차 그대로 승계하며 차기 재계약 시 공원접면 상가 시세 반영 가능",
      closing_line: "방문 답사 및 임대차계약서 열람은 사전 예약을 통해 즉시 안내해 드립니다.",
    },
    inputSummary: "동교동 189-6 · 77억 · CSV_01(6행 · B2 0원 통합행) · 사진 4종",
    oracleCriteria: [
      "OpenXML 5대 단언 통과 (7~11매 · Poison 0 · Dummy 0 · 회피문구 0 · 가격밴드 차단 · 77억 반영)",
      "PPTX 전 슬라이드 PNG 실사 변환 및 갤러리 사진 4장 선명 임베딩",
      "모바일 IM(390px) 가로 넘침 0px",
    ],
  },
  {
    id: "IM-02",
    category: "im",
    buildingId: "5c0ca5e0-0002-4000-8000-000000000002",
    title: "수익형 부분공실 · 부천 동아빌딩 (58억 · 17호실 + 201호 공실)",
    subtitle: "현행 임대 vs 만실 가정(Stabilized) 분리 + 기계식 주차 부대수익",
    deliverableTitle: "심곡동 동아빌딩 (근생, 58억)",
    edgeFocus: "CSV_02 201호 공실 잠재임대료 분리 & 부대수익 반영",
    posture: "income_producing",
    postureLabel: "수익형 (부분공실)",
    address: "경기도 부천시 원미구 심곡동 382-2",
    askingPriceManwon: 580000,
    askingPriceReadout: "58억 원 (580,000만 원)",
    landAreaSqm: 535.6,
    gfaSqm: 2758.21,
    zoning: "일반상업지역",
    completionDate: "1998-11-17",
    handoverNote: "2층 201호 현 공실(예상 보 5,000/월 290만), 기계식 주차타워 22대 고정수익 월 198만원 별도",
    rawTsv: CSV_02_TSV,
    photos: SHOWCASE_PHOTO_SETS.bucheon4,
    brokerExtras: {
      investment_points: [
        {
          headline: "현행 16개 호실 안정 임대 + 201호 공실 해소 시 추가 수익 상승",
          brief: "2층 공실 201호 임대 완료 시 월 임대수입 추가 확보로 수익률 개선 여력이 명확합니다.",
        },
        {
          headline: "일반상업지역 대지 162평 · 연면적 834평 역세권 대형 근생",
          brief: "부천역 도보권 상업지역 내 희소한 자주·기계식 주차 28대 확보 건물입니다.",
        },
      ],
      post_acquisition_plan: "2층 공실 201호 병·의원 또는 사무실 임대 완료 후 장기 보유 권장",
    },
    inputSummary: "부천 심곡동 382-2 · 58억 · CSV_02(17호실 · 201호 공실 + 주차수익)",
    oracleCriteria: [
      "OpenXML 5대 단언 통과 & 58억 반영",
      "공실 201호와 임차 호실이 스태킹·렌트롤에서 명확히 구분 표시",
    ],
  },
  {
    id: "IM-03",
    category: "im",
    buildingId: "5c0ca5e0-0002-4000-8000-000000000003",
    title: "100% 전층 공실 · 심곡동 명도완료 빌딩 (52억 · Zero-Division)",
    subtitle: "B1~4F 전층 공실 상태 — 보증금 0 · 월세 0일 때 수익률 슬라이드 방어",
    deliverableTitle: "심곡동 근생 빌딩 (근생, 52억)",
    edgeFocus: "점유율 0% · 월세 0원 조건에서도 NaN / Infinity% 0건 방어",
    posture: "income_producing",
    postureLabel: "수익형 (전층공실)",
    address: "경기도 부천시 원미구 심곡동 385",
    askingPriceManwon: 520000,
    askingPriceReadout: "52억 원 (520,000만 원)",
    landAreaSqm: 380.0,
    gfaSqm: 1120.5,
    zoning: "일반상업지역",
    completionDate: "2002-04-15",
    handoverNote: "전층 명도 완료(현행 임대차 없음), 매수 직후 리모델링 또는 통임대 착수 가능",
    directRentRoll: [
      { floor: "B1F", unit: "B101호", use: "공실 (명도완료)", area_sqm: 220, depositManwon: 0, monthlyRentManwon: 0, maintenanceManwon: 0, status: "vacant" },
      { floor: "1F", unit: "101호", use: "공실 (명도완료)", area_sqm: 225, depositManwon: 0, monthlyRentManwon: 0, maintenanceManwon: 0, status: "vacant" },
      { floor: "2F", unit: "201호", use: "공실 (명도완료)", area_sqm: 225, depositManwon: 0, monthlyRentManwon: 0, maintenanceManwon: 0, status: "vacant" },
      { floor: "3F", unit: "301호", use: "공실 (명도완료)", area_sqm: 225, depositManwon: 0, monthlyRentManwon: 0, maintenanceManwon: 0, status: "vacant" },
      { floor: "4F", unit: "401호", use: "공실 (명도완료)", area_sqm: 225, depositManwon: 0, monthlyRentManwon: 0, maintenanceManwon: 0, status: "vacant" },
    ],
    photos: SHOWCASE_PHOTO_SETS.bucheon4.slice(0, 2),
    inputSummary: "부천 심곡동 385 · 52억 · B1~4F 전층 공실(0/0)",
    oracleCriteria: [
      "OpenXML 전 슬라이드 내 NaN, Infinity, undefined 0건",
      "52억 매매가 반영 및 전층 공실 상태 정직 표기",
    ],
  },
  {
    id: "IM-04",
    category: "im",
    buildingId: "5c0ca5e0-0002-4000-8000-000000000004",
    title: "사옥형 자가사용 · 서초동 법인 사옥 (230억 · 포스처 격리)",
    subtitle: "owner_occupier 전용 7~10면 구조 — 임대수익률 대신 사옥 스펙 중심",
    deliverableTitle: "서초동 법인 사옥 빌딩 (업무, 230억)",
    edgeFocus: "사옥형 포스처 격리(Rule 26~30) & 230억 정확 반영",
    posture: "owner_occupier",
    postureLabel: "사옥형 (자가사용)",
    address: "서울특별시 서초구 서초동 1364-28",
    askingPriceManwon: 2300000,
    askingPriceReadout: "230억 원 (2,300,000만 원)",
    landAreaSqm: 512.0,
    gfaSqm: 1850.0,
    zoning: "제3종일반주거지역",
    completionDate: "2018-11-12",
    handoverNote: "잔금 동시 전층 사옥 즉시 입주 가능 (임차 명도 조건 완료)",
    directRentRoll: [
      { floor: "1F", unit: "1층", use: "사옥 로비·쇼룸", area_sqm: 310, depositManwon: 0, monthlyRentManwon: 0, maintenanceManwon: 0, status: "owner" },
      { floor: "2F", unit: "2층", use: "경영지원·회의실", area_sqm: 310, depositManwon: 0, monthlyRentManwon: 0, maintenanceManwon: 0, status: "owner" },
      { floor: "3F", unit: "3층", use: "사업부 오피스", area_sqm: 310, depositManwon: 0, monthlyRentManwon: 0, maintenanceManwon: 0, status: "owner" },
      { floor: "4F", unit: "4층", use: "임원실·라운지", area_sqm: 310, depositManwon: 0, monthlyRentManwon: 0, maintenanceManwon: 0, status: "owner" },
    ],
    photos: SHOWCASE_PHOTO_SETS.seocho4,
    inputSummary: "서초동 1364-28 · 230억 · posture=owner_occupier · 자가 4개 층",
    oracleCriteria: [
      "OpenXML 5대 단언 통과 & 230억 정확 표기",
      "사옥용/자가점유 맥락 중심으로 구성 (수익형 맹목 표기 차단)",
    ],
  },
  {
    id: "IM-05",
    category: "im",
    buildingId: "5c0ca5e0-0002-4000-8000-000000000005",
    title: "개발형 신축부지 · 마포 대흥동 토지 중심 (78억 · 지적도)",
    subtitle: "development 전용 구조 — 대지면적 · 지적도 · 법정 건폐율/용적률 중심",
    deliverableTitle: "대흥동 신축부지 (토지, 78억)",
    edgeFocus: "개발형 포스처(Rule 26~30) & 토지·지적도 슬라이드 품질",
    posture: "development",
    postureLabel: "개발형 (신축부지)",
    address: "서울특별시 마포구 대흥동 12-41",
    askingPriceManwon: 780000,
    askingPriceReadout: "78억 원 (780,000만 원)",
    landAreaSqm: 363.6,
    gfaSqm: 410.0,
    zoning: "제2종일반주거지역",
    completionDate: "1991-03-10",
    handoverNote: "신축 개발 목적 매각 — 잔금 후 6개월 내 명도 조건 협의 완료",
    directRentRoll: [
      { floor: "1F", unit: "101호", use: "근생 (단기명도특약)", area_sqm: 180, depositManwon: 3000, monthlyRentManwon: 260, maintenanceManwon: 0, status: "occupied" },
      { floor: "2F", unit: "201호", use: "사무실 (단기명도특약)", area_sqm: 180, depositManwon: 2000, monthlyRentManwon: 180, maintenanceManwon: 0, status: "occupied" },
    ],
    photos: SHOWCASE_PHOTO_SETS.donggyo4.slice(0, 3),
    inputSummary: "마포 대흥동 12-41 · 78억 · posture=development · 대지 110평",
    oracleCriteria: [
      "OpenXML 5대 단언 통과 & 78억 반영",
      "Slide 05 지적도·토지 분석 슬라이드 정상 생성",
    ],
  },
  {
    id: "IM-06",
    category: "im",
    buildingId: "5c0ca5e0-0002-4000-8000-000000000006",
    title: "프라임 21호실 대형 · 역삼동 여삼빌딩 (2,000억 · 표 넘침 방어)",
    subtitle: "CSV_03 B1~15F 21개 호실 + 303호 자가사용 + 마스터리스 합산 처리",
    deliverableTitle: "역삼동 여삼빌딩 (오피스, 2,000억)",
    edgeFocus: "21행 대용량 렌트롤 PPTX 표/스태킹 오버플로우 0건 & 2,000억",
    posture: "income_producing",
    postureLabel: "수익형 (대형 21호실)",
    address: "서울특별시 강남구 역삼동 648-23",
    askingPriceManwon: 20000000,
    askingPriceReadout: "2,000억 원 (20,000,000만 원)",
    landAreaSqm: 1452.2,
    gfaSqm: 14256.64,
    zoning: "일반상업지역",
    completionDate: "1985-06-13",
    handoverNote: "테헤란로 프라임 대형 오피스 (303호 자가사용분 외 전층 우량 법인 임차 중)",
    rawTsv: CSV_03_TSV,
    photos: SHOWCASE_PHOTO_SETS.yeoksam4,
    exemptDummyPhraseForOfficialAddress: "테헤란로 123",
    inputSummary: "역삼동 648-23 · 2,000억 · CSV_03(21개 호실 · 303호 자가) · 사진 4장",
    oracleCriteria: [
      "21개 호실 PPTX 렌트롤 슬라이드 겹침/이탈 없음",
      "2,000억 매각가 정확 표기 & 가격 밴드 차단",
    ],
  },
  {
    id: "IM-07",
    category: "im",
    buildingId: "5c0ca5e0-0002-4000-8000-000000000007",
    title: "현장 변이 A · 당산동5가 비정형층·원단위 오타 보정 (95억)",
    subtitle: "'-1, 1, 2, 5' 입력 → 3F·4F 공실 자동 합성 + 원단위(50,000,000) 1/10,000 보정",
    deliverableTitle: "당산동5가 근생 빌딩 (근생, 95억)",
    edgeFocus: "parseTsvRentRoll 원→만원 보정 + synthesizeMissingVacantFloors 공실 보간",
    posture: "income_producing",
    postureLabel: "수익형 (TSV 자동 보정)",
    address: "서울특별시 영등포구 당산동5가 11-47",
    askingPriceManwon: 950000,
    askingPriceReadout: "95억 원 (950,000만 원)",
    landAreaSqm: 298.5,
    gfaSqm: 1210.4,
    zoning: "준공업지역",
    completionDate: "2016-07-22",
    handoverNote: "당산역 더블역세권 — 원 단위 입력 TSV와 누락층(3F·4F) 공실 자동 보간 검증 매물",
    rawTsv: IM07_MUTATED_TSV,
    synthesizeVacantFloors: true,
    photos: SHOWCASE_PHOTO_SETS.bucheon4.slice(0, 3),
    inputSummary: "당산동5가 11-47 · 95억 · 원 단위 숫자 TSV(-1,1,2,5층) → 3F·4F 공실 합성",
    oracleCriteria: [
      "parseTsvRentRoll hasUnitMistakes=true → 보증금 15,000만 / 월세 1,190만 정확 보정",
      "누락된 3F, 4F 공실(vacant) 행 자동 합성 후 PPTX 반영",
    ],
  },
  {
    id: "IM-08",
    category: "im",
    buildingId: "5c0ca5e0-0002-4000-8000-000000000008",
    title: "현장 변이 B · 보정동 무사진(0장) & 장문 특기사항 방어 (77억)",
    subtitle: "실사진 0장일 때 지도·지적도 폴백 + 280자 장문 인수인계 노트 레이아웃 방어",
    deliverableTitle: "보정동 근생 빌딩 (근생, 77억)",
    edgeFocus: "무사진(0장) 갤러리/표지 폴백 무결성 + 장문 노트 박스 침범 방지",
    posture: "income_producing",
    postureLabel: "수익형 (무사진·장문)",
    address: "경기도 용인시 기흥구 보정동 1208-4",
    askingPriceManwon: 770000,
    askingPriceReadout: "77억 원 (770,000만 원)",
    landAreaSqm: 342.1,
    gfaSqm: 1088.6,
    zoning: "제1종지구단위계획구역",
    completionDate: "2020-02-14",
    handoverNote:
      "수인분당선 보정역 도보권 생활밀착 코너 상가빌딩입니다. 1층 유명 브런치카페가 5년 장기 임대 중이며, 2~3층은 소아과·치과 등 병의원 입점이 적합해 권리금 없는 안정 운영이 가능합니다. 옥외 자주식 주차 6대와 승강기 1대가 구비되어 있으며 매도자 법인 이전에 따라 잔금 일정 조율도 유연합니다.",
    directRentRoll: [
      { floor: "1F", unit: "101호", use: "브런치카페", area_sqm: 260, depositManwon: 5000, monthlyRentManwon: 380, maintenanceManwon: 35, status: "occupied" },
      { floor: "2F", unit: "201호", use: "소아청소년과의원", area_sqm: 260, depositManwon: 4000, monthlyRentManwon: 290, maintenanceManwon: 30, status: "occupied" },
      { floor: "3F", unit: "301호", use: "치과의원", area_sqm: 260, depositManwon: 4000, monthlyRentManwon: 270, maintenanceManwon: 30, status: "occupied" },
    ],
    photos: [],
    inputSummary: "용인 보정동 1208-4 · 77억 · 사진 0장([]) + 210자 장문 특기사항",
    oracleCriteria: [
      "사진 0장일 때도 PPTX 표지·개요·위치·지적도 정상 렌더 (OpenXML 5대 단언 통과)",
      "모바일 IM(390px)에서 깨진 이미지 아이콘 0건 & 가로 넘침 0px",
    ],
  },
];

export const OUTPUT_SHOWCASE_SCENARIOS: readonly ShowcaseScenarioUnion[] = [
  ...NEWSLETTER_SHOWCASE_6,
  ...DEALCARD_SHOWCASE_8,
  ...IM_SHOWCASE_8,
];

export function getShowcaseScenariosByCategory(
  category: ShowcaseCategory,
): ShowcaseScenarioUnion[] {
  if (category === "newsletter") return [...NEWSLETTER_SHOWCASE_6];
  if (category === "dealcard") return [...DEALCARD_SHOWCASE_8];
  return [...IM_SHOWCASE_8];
}

export function getShowcaseScenarioById(
  caseId: string,
): ShowcaseScenarioUnion | undefined {
  return OUTPUT_SHOWCASE_SCENARIOS.find((s) => s.id === caseId);
}

export interface BrokerFacingScenarioMeta {
  title: string;
  subtitle: string;
  postureOrCadenceBadge: string;
  inputSummary: string;
  edgeFocus: string;
  checkpoints: string[];
}

const BROKER_FACING_SCENARIO_META_MAP: Readonly<
  Record<ShowcaseScenarioUnion["id"], BrokerFacingScenarioMeta>
> = {
  "NL-D1": {
    title: "일간 부동산뉴스 · 강남·마포 핵심 시황 + 추천 매물 2건",
    subtitle: "3줄 명사형 시황 요약 · 주요 이슈 3선 · 추천 매물 2건 구성",
    postureOrCadenceBadge: "일간 부동산뉴스 · 기본형",
    inputSummary:
      "강남·마포 현장 메모 2줄 + 주요 이슈 3건 + 추천 매물 2건(동교동·서초동)",
    edgeFocus:
      "바쁜 건물주 고객이 카톡에서 10초 만에 읽는 3줄 핵심 요약과 매물 연결 동선",
    checkpoints: [
      "상단 시황 요약이 장황한 인사말 없이 3줄 핵심 수치·흐름으로 한눈에 들어오는지 확인",
      "이슈 카드에 불필요한 번호표 없이 분야 태그와 언론·기관 출처만 깔끔히 보이는지 확인",
      "하단에 중개사 성함·바로 전화걸기 버튼과 뉴스 구독 신청란이 단정하게 배치되었는지 확인",
    ],
  },
  "NL-D2": {
    title: "일간 부동산뉴스 · 추천 매물 없이 보내는 순수 시황 브리핑",
    subtitle: "매물 소개 없이 금리·공실·세무 점검 포인트만 전하는 안부형 소식지",
    postureOrCadenceBadge: "일간 부동산뉴스 · 시황 전용",
    inputSummary: "4분기 금리·공실·관리비 점검 메모 + 주요 이슈 2건 + 추천 매물 없음",
    edgeFocus:
      "추천 매물을 넣지 않은 날에도 빈 칸 없이 자연스러운 시황 소식지로 완성",
    checkpoints: [
      "추천 매물이 없을 때 빈 회색 상자가 남지 않고 기사에서 중개사 연락처로 자연스럽게 이어지는지 확인",
      "보유 건물주께 드리는 금리·관리비 점검 문구가 부담스럽지 않고 품격 있는지 확인",
      "휴대폰 작은 화면에서도 글자 잘림이나 가로 밀림 없이 편안하게 읽히는지 확인",
    ],
  },
  "NL-W1": {
    title: "주간 부동산뉴스 · 주요 상권 주간 흐름 + 추천 매물 3건",
    subtitle: "마포·부천 등 다권역 주간 시황 3줄 요약 · 분야별 이슈 4선 · 매물 3건",
    postureOrCadenceBadge: "주간 부동산뉴스 · 기본형",
    inputSummary:
      "주간 시황 메모 + 4개 분야 핵심 이슈 + 추천 매물 3건(임대수익용·신축·개발용)",
    edgeFocus:
      "추천 매물 3건을 좌우로 넘겨 보며 상세 안내서로 연결하는 주간 브리핑 구성",
    checkpoints: [
      "추천 매물 3건 카드에 상세 지번 없이 동 단위 위치와 핵심 제원만 안전하게 표시되는지 확인",
      "금리·세무·상권 등 다양한 분야 소식이 한쪽으로 치우치지 않고 균형 있게 읽히는지 확인",
      "각 매물 카드를 눌렀을 때 딜카드 상세 화면으로 자연스럽게 연결되는지 확인",
    ],
  },
  "NL-W2": {
    title: "주간 부동산뉴스 · 중개사 성함 자동 제목 + 급매물 1건 집중 소개",
    subtitle:
      "제목 작성 부담을 덜어주는 '[중개사명]의 이번 주 빌딩 시장 브리핑' + 단일 매물",
    postureOrCadenceBadge: "주간 부동산뉴스 · 단일 매물 집중",
    inputSummary:
      "중개사 성함 결합 기본 제목 + 서교동 역세권 급매물 1건 집중 브리핑",
    edgeFocus:
      "매주 제목 고민 없이 바로 쓸 수 있는 성함 결합 제목과 단일 급매물 강조 구성",
    checkpoints: [
      "상단 제목에 중개사 성함이 자연스럽게 결합되어 단골 고객에게 친근감과 신뢰를 주는지 확인",
      "추천 매물이 1건일 때 불필요한 '1 / 1' 페이지 표시 없이 깔끔하게 단독 카드로 보이는지 확인",
      "부분 공실 건물의 만실 전환 시 기대수익률 포인트가 설득력 있게 전달되는지 확인",
    ],
  },
  "NL-M1": {
    title: "월간 부동산뉴스 · 강남·서초 실거래 추이 & 대출금리 비교 리포트",
    subtitle:
      "국토교통부 실거래 통계 · 한국은행 금리 비교 그래프 2선 + 추천 매물 3건",
    postureOrCadenceBadge: "월간 리포트 · 실거래·금리 차트",
    inputSummary:
      "강남·서초 월간 실거래·금리 통계 차트 2종 + 추천 매물 3건(임대수익용·사옥용)",
    edgeFocus:
      "한 달에 한 번 자산가 고객께 보내는 공공 통계 기반 심층 시장 리포트",
    checkpoints: [
      "최상단 실거래 추이와 대출금리 비교 그래프 2종이 숫자 겹침 없이 선명하게 읽히는지 확인",
      "그래프 하단에 국토교통부·한국은행 등 공공 통계 출처가 투명하게 표기되었는지 확인",
      "2,000억대 대형 오피스 매물 가격 표기가 줄바꿈 깨짐 없이 단정하게 나오는지도 함께 확인",
    ],
  },
  "NL-M2": {
    title: "월간 부동산뉴스 · 여의도·영등포 금액대별 거래 비중 & 큰 글씨(21px)",
    subtitle:
      "비강남 핵심 권역 금액대별 거래 비중 차트 + 시니어 고객용 아주 큰 글씨 화면",
    postureOrCadenceBadge: "월간 리포트 · 금액대 차트 · 큰글씨",
    inputSummary:
      "영등포·여의도 금액대별 거래 비중 차트 + 아주 크게(21px) 글자 설정 + 추천 매물 2건",
    edgeFocus:
      "고연령 건물주 고객이 '아주 크게(21px)'로 보셔도 표와 카드가 겹치지 않는 가독성",
    checkpoints: [
      "어느 금액대 건물이 가장 활발히 거래되는지 막대그래프로 한눈에 파악되는지 확인",
      "글자 크기를 '아주 크게(21px)'로 키웠을 때도 제목·그래프·매물 카드가 깨지지 않는지 확인",
      "다필지 건물 지번 숨김과 '가격 협의' 매물 표기가 자연스럽게 처리되었는지 확인",
    ],
  },
  "DC-01": {
    title: "임대수익용 · 마포 동교동 경의선숲길 코너 근생 (77억)",
    subtitle: "전층 만실 우량 근생빌딩 + 현장 사진 4장 + 상세 지번·상호 자동 숨김",
    postureOrCadenceBadge: "임대수익용 · 만실 운영",
    inputSummary:
      "마포구 동교동 코너 근생 · 매매가 77억 · 전층 만실(5개 층) · 현장 사진 4장",
    edgeFocus:
      "타 중개사 물건 추적은 막으면서 진성 매수자 문의를 이끄는 블라인드 요약 구성",
    checkpoints: [
      "상세 지번과 유명 점포 상호명이 완전히 가려지고 '마포구 동교동 일대'로 안전하게 표시되는지 확인",
      "카톡 공유 화면에 핵심 4가지(지역 · 용도 · 연면적 · 70억대)가 한눈에 들어오는지 확인",
      "장점 3줄에 단순 면적 반복 없이 코너 가시성과 만실 임대 매력만 간결히 담겼는지 확인",
    ],
  },
  "DC-02": {
    title: "임대수익용(부분 공실) · 마포 서교동 합정역세권 근생 (68억)",
    subtitle: "1·3층 임대 중 + 2층 공실 신규 임차 또는 직접 사용 가능 매물",
    postureOrCadenceBadge: "임대수익용 · 임대 재구성",
    inputSummary:
      "마포구 서교동 역세권 근생 · 매매가 68억 · 2층 공실 포함 3개 층 · 현장 사진 3장",
    edgeFocus:
      "일부 공실이 있는 매물을 숨기지 않고 신규 임차·수익 개선 기회로 솔직하게 안내",
    checkpoints: [
      "상세 지번 노출 없이 '마포구 서교동' 역세권 입지와 60~70억대 금액대가 깔끔히 표시되는지 확인",
      "2층 공실 현황과 신규 임차 세팅 시 기대 포인트가 과장 없이 신뢰감 있게 적혔는지 확인",
      "저층 근생 건물 성격에 맞는 외관·실내 사진 3장이 자연스럽게 배치되었는지 확인",
    ],
  },
  "DC-03": {
    title: "임대수익용(전층 명도) · 부천 심곡동 역세권 빌딩 (52억)",
    subtitle:
      "전층 명도 완료(보증금 0 · 월세 0) 상태에서도 즉시 입주·통임대 강점으로 안내",
    postureOrCadenceBadge: "임대수익용 · 전층 명도 완료",
    inputSummary:
      "부천시 심곡동 역세권 상업빌딩 · 매매가 52억 · 전층 명도 완료(현행 임대차 없음)",
    edgeFocus:
      "현재 월세가 0원인 명도 완료 건물도 어색한 0% 표기 없이 매수 장점으로 깔끔히 소개",
    checkpoints: [
      "보증금·월세가 0원인 전층 공실 상태에서도 숫자 표시 오류 없이 깔끔하게 안내되는지 확인",
      "명도 부담 없이 매수 즉시 리모델링이나 통임대를 진행할 수 있는 실무 장점이 잘 드러나는지 확인",
    ],
  },
  "DC-04": {
    title: "사옥용 · 서초구 서초동 즉시 입주 법인 사옥 (230억)",
    subtitle:
      "전층 직접 사용 사옥 기준 — 임대료 대신 실사용 면적·자주식 주차·접근성 강조",
    postureOrCadenceBadge: "사옥용 · 즉시 입주",
    inputSummary:
      "서초구 서초동 사옥 빌딩 · 매매가 230억 · 연면적 560평 · 자주식 주차 14대 · 사진 4장",
    edgeFocus:
      "사옥 매수 법인이 가장 먼저 보는 가용 면적·주차 대수·즉시 입주 조건 중심 요약",
    checkpoints: [
      "불필요한 임대수익률 강조 대신 전층 사옥 입주 가능 면적(연면적 560평)과 주차 14대가 부각되는지 확인",
      "서초동 법인 사옥 외관·업무홀·자주식 주차장 현장 사진이 매물 성격과 잘 어울리는지 확인",
    ],
  },
  "DC-05": {
    title: "신축·개발용 · 마포 대흥동 역세권 코너 신축부지 (78억)",
    subtitle:
      "노후 건물 철거·신축 목적 — 노후 연면적 대신 대지면적(110평)·용도지역 중심 표기",
    postureOrCadenceBadge: "신축·개발용 · 신축부지",
    inputSummary:
      "마포구 대흥동 코너 부지 · 매매가 78억 · 대지 110평(제2종일반주거) · 단기 명도 협의",
    edgeFocus:
      "신축·개발용 매물에서 낡은 건물 연면적 대신 대지 평수와 코너 토지 가치를 최우선 표시",
    checkpoints: [
      "대표 면적 칸에 기존 건물 연면적 대신 '토지(대지) 110평'이 우선 표시되는지 확인",
      "상세 지번 숨김 유지 및 단기 임대 후 신축 가능 조건이 명확히 전달되는지 확인",
    ],
  },
  "DC-06": {
    title: "임대수익용(대형 오피스) · 강남 역삼동 테헤란로 빌딩 (2,000억)",
    subtitle:
      "연면적 4,313평 프라임 대형 빌딩 — 큰 금액·넓은 면적 숫자 줄바꿈 안정성",
    postureOrCadenceBadge: "임대수익용 · 대형 오피스",
    inputSummary:
      "강남구 역삼동 테헤란로 대형 오피스 · 매매가 2,000억 · 대지 439평 · 연면적 4,313평",
    edgeFocus:
      "천억 단위 대형 매물에서도 금액과 평수 숫자가 잘리거나 칸을 넘치지 않는 단정한 표기",
    checkpoints: [
      "'2,000억대' 금액과 '연면적 4,313평' 숫자가 말줄임 없이 한눈에 읽히는지 확인",
      "상세 지번과 금융기관·입주 법인 실명이 공개 티저에서 안전하게 가려졌는지 확인",
    ],
  },
  "DC-07": {
    title: "임대수익용(다필지·블라인드 보호) · 영등포 당산동 코너 빌딩 (115억)",
    subtitle:
      "메모에 섞인 상세 지번·프랜차이즈 상호·직통 번호를 자동으로 가려주는 안전장치",
    postureOrCadenceBadge: "임대수익용 · 블라인드 보호",
    inputSummary:
      "영등포구 당산동 외 2필지 코너 · 115억 · 지번·유명 카페 상호·전화번호가 섞인 현장 메모",
    edgeFocus:
      "급히 붙여넣은 현장 메모 속 민감 정보(지번·상호·연락처) 자동 숨김 작동 확인",
    checkpoints: [
      "원본 메모에 적힌 상세 지번, 유명 프랜차이즈 상호, 현장 전화번호가 공개 카드에서 모두 제거되었는지 확인",
      "다필지 코너 입지 장점과 110~120억대 규모감은 매수자에게 매력적으로 전달되는지 확인",
    ],
  },
  "DC-08": {
    title: "임대수익용(가격 협의·무사진) · 용인 보정동 역세권 근생 (비공개 매각)",
    subtitle:
      "매도인 요청으로 가격 비공개('가격 협의') 및 사진 촬영 전 긴급 발송용 딜카드",
    postureOrCadenceBadge: "임대수익용 · 가격 협의",
    inputSummary:
      "용인시 보정동 역세권 근생 · 매매가 비공개(가격 협의) · 1줄 간단 메모 · 현장 사진 없음",
    edgeFocus:
      "가격 비공개 매물이나 사진 확보 전 긴급 접수 물건도 품격 있게 첫 안내 가능",
    checkpoints: [
      "매매가를 비워 두었을 때 0원 대신 '가격 협의'로 자연스럽게 표시되는지 확인",
      "현장 사진이 아직 없는 상태에서도 카톡 공유 카드와 상세 제원표가 어색함 없이 정돈되어 보이는지 확인",
    ],
  },
  "IM-01": {
    title: "임대수익용 표준 · 마포 동교동 THE PARK 빌딩 (77억)",
    subtitle:
      "전층 만실 근생 · 복수층(B1~B2) 통합 임차 표기 및 현장 사진 4장 수록",
    postureOrCadenceBadge: "임대수익용 · 만실 근생",
    inputSummary:
      "마포구 동교동 189-6 · 매매가 77억 · 6개 층 전층 만실(B1~B2 통합 계약 포함) · 사진 4장",
    edgeFocus:
      "한 임차인이 두 개 층을 묶어 쓰는 통합 계약도 공실로 오해하지 않고 정확히 표기",
    checkpoints: [
      "표지 제목, 물건 개요, 층별 임대 현황(지상 최고층→지하 순서), 수익률·지가 차트까지 9장 흐름이 자연스러운지 확인",
      "B1~B2 통합 임차 중 금액이 합산된 B2층이 '공실'이 아닌 '임대중(B1 합산)' 맥락으로 정확히 보이는지 확인",
      "외관·출입구·실내·루프탑 현장 사진 4장이 깨짐 없이 선명하게 배치되었는지 확인",
    ],
  },
  "IM-02": {
    title: "임대수익용(부분 공실) · 부천 심곡동 동아빌딩 (58억)",
    subtitle:
      "16개 호실 임대 중 + 2층 공실 1실 기대수익 분리 및 주차타워 고정수익 반영",
    postureOrCadenceBadge: "임대수익용 · 부분 공실",
    inputSummary:
      "부천시 심곡동 382-2 · 매매가 58억 · 총 17개 호실(201호 공실) + 월 고정 주차수익 198만원",
    edgeFocus:
      "현재 나오는 임대수익과 공실 1칸을 채웠을 때의 만실 기대수익을 한눈에 비교",
    checkpoints: [
      "임대 현황표에서 현재 임대 중인 호실과 2층 공실(201호), 주차장 부대수익이 명확히 구분되는지 확인",
      "현행 수익률과 공실 해소 시 기대수익률이 함께 제시되어 매수 설득력이 충분한지 확인",
    ],
  },
  "IM-03": {
    title: "임대수익용(전층 공실) · 부천 심곡동 명도완료 빌딩 (52억)",
    subtitle:
      "지하1층~지상4층 전층 명도 완료 — 즉시 리모델링·통임대 착수 가능 매물",
    postureOrCadenceBadge: "임대수익용 · 전층 명도 완료",
    inputSummary:
      "부천시 심곡동 385 · 매매가 52억 · B1~4F 전층 공실(보증금 0 · 월세 0)",
    edgeFocus:
      "전층 공실(보증금 0 · 월세 0) 상태에서도 오류 없이 예상 임대료 기준 기대수익률과 즉시 입주 강점으로 안내",
    checkpoints: [
      "현재 임대료가 0원인 건물에서도 전 페이지 숫자·수익률 표기가 깨지거나 어색하지 않은지 확인",
      "명도 협의 부담 없이 매수 직후 리모델링이나 신규 우량 임차인 세팅이 가능하다는 점이 잘 전달되는지 확인",
    ],
  },
  "IM-04": {
    title: "사옥용 · 서초구 서초동 법인 사옥 빌딩 (230억)",
    subtitle:
      "잔금 즉시 전층 입주 가능한 본사 사옥 — 층별 활용 계획·주차·접근성 중심 구성",
    postureOrCadenceBadge: "사옥용 · 전층 직접 사용",
    inputSummary:
      "서초구 서초동 1364-28 · 매매가 230억 · 대지 155평 · 연면적 560평 · 전층 사옥 명도 완료",
    edgeFocus:
      "사옥 매수 기업 대표님께 맞춘 실사용 면적·자주식 주차·강남권 접근성 중심 제안서",
    checkpoints: [
      "임대수익용 문구 대신 법인 본사 입주 시 층별 공간 구성과 교통·주차 여건이 중심으로 다뤄지는지 확인",
      "서초동 사옥 외관과 업무홀·주차 공간 사진이 230억대 사옥 품격에 맞게 수록되었는지 확인",
    ],
  },
  "IM-05": {
    title: "신축·개발용 · 마포 대흥동 역세권 코너 신축부지 (78억)",
    subtitle:
      "대지 110평 정방형 코너 — 토지 제원·지적도·법정 건폐율 및 용적률 중심 제안서",
    postureOrCadenceBadge: "신축·개발용 · 신축부지",
    inputSummary:
      "마포구 대흥동 12-41 · 매매가 78억 · 대지 110평(제2종일반주거) · 잔금 후 6개월 명도 협의",
    edgeFocus:
      "철거·신축 검토 고객이 가장 중요하게 보는 대지 평당가·용도지역·지적도 중심 구성",
    checkpoints: [
      "노후 현 건물 수익률 대신 대지 면적(110평), 법정 건폐율·용적률, 토지·지적도 페이지가 선명하게 구성되었는지 확인",
      "기존 단기 임차인 6개월 내 명도 협의 조건이 인수 안내란에 명확히 기재되었는지 확인",
    ],
  },
  "IM-06": {
    title: "임대수익용(대형 21호실) · 강남 역삼동 여삼빌딩 (2,000억)",
    subtitle:
      "지하1층~15층 21개 호실 대형 오피스 — 다층 임대 현황표 가독성 및 합산 계약 표기",
    postureOrCadenceBadge: "임대수익용 · 대형 21호실",
    inputSummary:
      "강남구 역삼동 648-23 · 매매가 2,000억 · 총 21개 호실(금융기관·회계법인·공유오피스 등)",
    edgeFocus:
      "임차 호실이 20개가 넘는 대형 빌딩도 임대 현황표가 글자 겹침 없이 깔끔하게 정렬",
    checkpoints: [
      "21개 호실 임대 현황표가 슬라이드 밖으로 넘치거나 글씨가 겹치지 않고 단정하게 분할·정렬되었는지 확인",
      "2,000억 매매가와 복수층 통합 임차·소유자 직접 사용 호실(303호) 구분이 정확한지 확인",
    ],
  },
  "IM-07": {
    title: "임대수익용(입력 자동 보정) · 영등포 당산동5가 근생 빌딩 (95억)",
    subtitle:
      "엑셀 원 단위 오입력 자동 보정 및 빠진 공실 층(3·4층) 자동 채움 실무 편의 검증",
    postureOrCadenceBadge: "임대수익용 · 임대장부 자동 정돈",
    inputSummary:
      "영등포구 당산동5가 11-47 · 매매가 95억 · 원 단위로 적힌 임대 내역 및 3·4층 누락 장부",
    edgeFocus:
      "엑셀에서 원 단위로 잘못 입력된 보증금·임대료를 만원 단위로 자동 보정하고 빈 층도 정돈",
    checkpoints: [
      "엑셀 복사 시 흔히 발생하는 원 단위 숫자(예: 50,000,000)가 5,000만원으로 정확히 자동 변환되었는지 확인",
      "임대장부에서 빠져 있던 3층·4층이 누락되지 않고 '공실' 행으로 자연스럽게 채워져 층 순서가 맞는지 확인",
    ],
  },
  "IM-08": {
    title: "임대수익용(무사진·상세 메모) · 용인 보정동 역세권 근생 (77억)",
    subtitle:
      "실사진 0장인 긴급 접수 매물도 위치도·지적도와 상세 특기사항 중심으로 깔끔히 완성",
    postureOrCadenceBadge: "임대수익용 · 무사진 긴급 브리핑",
    inputSummary:
      "용인시 보정동 1208-4 · 매매가 77억 · 현장 사진 촬영 전(0장) + 280자 상세 인수 특기사항",
    edgeFocus:
      "실사진 0장인 긴급 접수 매물도 위성·지적 위치도와 제원표 중심으로 어색함 없이 완성",
    checkpoints: [
      "현장 사진이 아직 0장일 때도 깨진 이미지 표시 없이 표지·물건 개요·위치도·지적도가 깔끔히 구성되는지 확인",
      "중개사님이 길게 작성한 특기사항(임차 구성·주차·잔금 협의 조건)이 표 테두리를 침범하지 않고 정돈되는지 확인",
    ],
  },
};

export function getBrokerFacingScenarioMeta(
  scenario: ShowcaseScenarioUnion,
): BrokerFacingScenarioMeta {
  return BROKER_FACING_SCENARIO_META_MAP[scenario.id];
}
