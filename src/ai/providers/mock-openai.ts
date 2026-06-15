import type { LLMProvider, LLMChatParams, LLMChatResult } from "./types";

export class MockOpenAIProvider implements LLMProvider {
  readonly name = "openai";

  async chat(params: LLMChatParams): Promise<LLMChatResult> {
    const startTime = Date.now();
    const model = params.model || "gpt-5.4";

    console.warn(`[MockOpenAIProvider]process.env.OPENAI_API_KEY is missing or in test environment. Returning mock JSON response.`);

    // 페르소나 프롬프트 감지: systemPrompt에 "IDEAL BUYER PERSONAS"가 포함된 경우
    const isPersonaPrompt = params.systemPrompt?.includes("IDEAL BUYER PERSONAS");

    if (isPersonaPrompt) {
      return {
        content: JSON.stringify({
          propertySummary: "여의도 지역 근생 건물로, 다양한 용도로 활용 가능한 안정적인 임대 수익 건물입니다.",
          personas: [
            {
              label: "IT 중견기업 사옥 이전형",
              buyerType: "법인",
              budgetRange: "100~200억",
              motivation: "성장 중인 IT 기업이 여의도 입지의 브랜드 가치와 교통 접근성을 활용하여 사옥을 마련하려는 수요",
              coreNeeds: ["역세권 접근성", "주차 공간 확보", "층별 분리 사용 가능"],
              whereToFind: ["테헤란로 IT 기업 네트워크", "벤처캐피탈 포트폴리오사", "한국경영자총협회"],
              approachStrategy: "여의도 금융 중심지 입지에서 기업 브랜드 가치를 높이실 수 있는 사옥 기회입니다. 현재 만실 임대 상태로 입주 전까지 임대수익도 확보 가능합니다.",
              purposeProfile: "사옥",
              fitScore: 82,
            },
            {
              label: "자산가 절세 증여형",
              buyerType: "개인",
              budgetRange: "100~180억",
              motivation: "안정적 임대수익이 검증된 근생 건물을 자녀에게 증여하여 절세 효과를 극대화하려는 자산가",
              coreNeeds: ["만실 운영 실적", "감정가 대비 갭", "관리 용이성"],
              whereToFind: ["PB센터 자산관리팀", "세무사·회계사 네트워크", "강남 부동산 커뮤니티"],
              approachStrategy: "만실 상태의 안정적 근생 빌딩으로, 감정가 대비 매력적인 가격에 증여 목적 매입이 가능합니다. 절세 시뮬레이션을 함께 제공해 드립니다.",
              purposeProfile: "증여",
              fitScore: 75,
            },
            {
              label: "밸류업 투자형 펀드",
              buyerType: "펀드",
              budgetRange: "120~200억",
              motivation: "다양한 용도 변경 가능성과 여의도 입지 프리미엄을 활용한 밸류업 투자 전략",
              coreNeeds: ["용적률 여유 확인", "리모델링 가능성", "Cap Rate 5% 이상"],
              whereToFind: ["부동산 자산운용사", "KOTRA 외국 투자기업 DB", "상업용 부동산 중개 네트워크"],
              approachStrategy: "여의도 핵심 입지에서 용도 변경 및 리모델링을 통한 밸류업 기회가 있는 매물입니다. 현재 NOI 기준 안정적 수익 확보 중입니다.",
              purposeProfile: "투자",
              fitScore: 70,
            },
          ],
          brokerActionPlan: [
            "이번 주 내 강남/여의도 PB센터 3곳에 블라인드 티저 발송",
            "IT 기업 사옥 이전 수요 리스트 확보 후 1:1 연락",
            "세무사 네트워크를 통해 증여 목적 자산가 소개 요청",
          ],
          boundaryNote: "본 분석은 AI 추정치이며 실제 매수자 확보를 보장하지 않습니다. 투자 조언이 아닌 브로커 전략 참고용입니다.",
        }),
        tokens: 800,
        model,
        provider: this.name,
        latencyMs: Date.now() - startTime,
      };
    }

    const mockResult: LLMChatResult = {
      content: JSON.stringify({
        ok: true,
        mocked: true,
        extractedFields: {
          area_signal: "역삼",
          asset_type: "오피스빌딩",
          price_band: "300억",
          size_signal: "3000평"
        },
        // 3-step 에이전트 Zod 검증을 충족하기 위한 mock schema-level output 구조들
        // MemoParserOutput
        extractedFacts: {
          region: "역삼",
          exactAddressCandidate: "역삼동 742-1",
          assetType: "오피스빌딩",
          priceText: "300억",
          sizeText: "3000평",
          currentUse: "오피스",
          currentUseSignal: "근린생활시설",
          leaseSignal: "임대중",
          vacancySignal: "공실없음",
          tenantNames: ["쿠팡", "네이버"],
          unitRentTexts: ["301호: 1500만"],
          sellerMotivationText: "자산 효율화",
          brokerNotes: ["초역세권 매물"]
        },
        detectedSensitiveFields: ["exact_address", "tenant_name"],
        ambiguousFields: [],
        warnings: [],

        areaSignal: "역삼",
        assetType: "오피스빌딩",
        priceBand: "300억",
        sizeSignal: "3000평",
        dealType: "매각",
        
        // BuildingMiniTruthOutput
        buildingName: "역삼 센트럴타워",
        exactAddress: "역삼동 742-1",
        totalFloorArea: 9917.3,
        buildYear: 2015,
        currentUseSignal: "근린생활시설",
        vacancySignal: "공실 없음",
        fitSummary: "초역세권 근생 빌딩으로 시행/사옥 매입에 최적화",
        cautionSummary: "일부 임차인 만기 조율 필요",
        hiddenFields: ["exact_address", "seller_motivation"],
        confidence: {
          areaSignal: "confirmed",
          assetType: "confirmed",
          priceBand: "ai_hypothesis",
          fitSummary: "ai_hypothesis"
        },
        missingData: ["sizeSignal"],
        boundaryNote: "본 자료는 실거래 통계 기반 참고치입니다.",

        // BlindTeaserOutput
        title: "강남 역삼역 초역세권 오피스 사옥용 빌딩 매각",
        shortSummary: "역삼역 도보 5분 거리의 준신축급 대형 오피스빌딩입니다.",
        dealPoints: ["초역세권", "사옥 최적"],
        cautionPoints: ["명도 조율 필요"],
        hiddenInfoNotice: ["보증금 및 지번은 인가 후 확인 가능"],
        gateMessage: "G1 등급 등록이 필요합니다.",
        kakaoText: "강남 역삼역 오피스 빌딩 매각 안내입니다.",

        // LeaseMemoParserOutput
        exactUnitCandidate: "101호",
        floor: "1층",
        areaSqmText: "150㎡",
        spaceType: "office",
        depositText: "5000만",
        monthlyRentText: "400만",
        maintenanceFeeText: "50만",
        availableFromText: "즉시입주",
        leaseTermMonthsText: "24",
        incentivesText: "렌트프리 2개월",
        restrictions: [],
        landlordIdentity: "김성수",
        currentTenant: "스타트업",
        vacancyReason: "이전 확장",
        rentNegotiation: "협의 가능",

        // LeaseMiniTruthOutput
        region: "성수동",
        areaSqm: 150,
        deposit: 5000,
        monthlyRent: 400,
        maintenanceFee: 50,
        availableFrom: "즉시입주",
        leaseTermMonths: 24,
        incentives: {
          rentFreeMonths: 2,
          interiorSupport: "일부 인테리어 지원",
          freeRentDetail: "렌트프리 2개월 지원"
        },
        // LeaseBlindTeaserOutput
        shortSummaryLease: "성수역 도보 5분 거리 1층 리테일 상가 매물입니다."
      }),
      tokens: 150,
      model,
      provider: this.name,
      latencyMs: Date.now() - startTime,
    };
    
    return mockResult;
  }

  async embed(text: string): Promise<number[]> {
    console.warn(`[MockOpenAIProvider] process.env.OPENAI_API_KEY is missing or in test environment. Returning mock embedding.`);
    return new Array(1536).fill(0.1);
  }
}
