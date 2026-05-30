export interface GoldenTestCase {
  id: string;
  memo: string;
  expectedFields: {
    region: string;            // extractedFacts.region
    assetType: string;         // extractedFacts.assetType
    priceText: string;         // extractedFacts.priceText
  };
  tolerances: {
    fieldMatchRate: number;    // 정답 일치 조건율 (예: 0.66 -> 3개 중 2개 이상 일치)
  };
}

export const GOLDEN_TEST_CASES: GoldenTestCase[] = [
  {
    id: "GT-001",
    memo: "역삼역 도보 5분 거리 오피스빌딩 매각합니다. 연면적 3200평에 매가는 650억선 조율 가능합니다.",
    expectedFields: {
      region: "역삼역",
      assetType: "오피스빌딩",
      priceText: "650억",
    },
    tolerances: { fieldMatchRate: 0.66 }
  },
  {
    id: "GT-002",
    memo: "강남대로 변 꼬마빌딩 250억 매매. 준공 2018년으로 수려하고 사옥 최적입니다.",
    expectedFields: {
      region: "강남대로",
      assetType: "꼬마빌딩",
      priceText: "250억",
    },
    tolerances: { fieldMatchRate: 0.66 }
  },
  {
    id: "GT-003",
    memo: "성수동IT밸리 지산 분양. 평당 2500만선 실사용 최적 지식산업센터입니다.",
    expectedFields: {
      region: "성수동",
      assetType: "지식산업센터",
      priceText: "2500만",
    },
    tolerances: { fieldMatchRate: 0.66 }
  },
  {
    id: "GT-004",
    memo: "마포 공덕역 상가 임대차 합니다. 보증금 2억에 월세 1200만원 대형 카페 최적지.",
    expectedFields: {
      region: "공덕역",
      assetType: "상가",
      priceText: "2억",
    },
    tolerances: { fieldMatchRate: 0.66 }
  },
  {
    id: "GT-005",
    memo: "여의도 CBD 중심가 프라임 오피스 임차 구합니다. 연면적 500평 이상 선호.",
    expectedFields: {
      region: "여의도",
      assetType: "오피스",
      priceText: "500평",
    },
    tolerances: { fieldMatchRate: 0.66 }
  },
  {
    id: "GT-006",
    memo: "판교 테크노밸리 사옥 부지 리모델링 및 개발 사업 투자 펀딩 150억 모집 중.",
    expectedFields: {
      region: "판교",
      assetType: "사옥",
      priceText: "150억",
    },
    tolerances: { fieldMatchRate: 0.66 }
  },
  {
    id: "GT-007",
    memo: "을지로 대로변 수익형 메디컬 빌딩 매입 원함. 예산 800억선 확보 완료.",
    expectedFields: {
      region: "을지로",
      assetType: "빌딩",
      priceText: "800억",
    },
    tolerances: { fieldMatchRate: 0.66 }
  },
  {
    id: "GT-008",
    memo: "송파 문정동 물류창고 부지 급매각. 120억에 즉시 거래 가능.",
    expectedFields: {
      region: "문정동",
      assetType: "물류",
      priceText: "120억",
    },
    tolerances: { fieldMatchRate: 0.66 }
  },
  {
    id: "GT-009",
    memo: "선릉역 초역세권 신축 메디컬 상가 65억 분양 완료 예정.",
    expectedFields: {
      region: "선릉역",
      assetType: "상가",
      priceText: "65억",
    },
    tolerances: { fieldMatchRate: 0.66 }
  },
  {
    id: "GT-010",
    memo: "서초동 꼬마빌딩 200억 증여 및 자산 매매 컨설팅 요청.",
    expectedFields: {
      region: "서초동",
      assetType: "꼬마빌딩",
      priceText: "200억",
    },
    tolerances: { fieldMatchRate: 0.66 }
  }
];
