import type { LLMProvider, LLMChatParams, LLMChatResult } from "./types";

export class MockOpenAIProvider implements LLMProvider {
  readonly name = "openai";

  async chat(params: LLMChatParams): Promise<LLMChatResult> {
    const startTime = Date.now();
    const model = params.model || "gpt-4o";

    console.warn(`[MockOpenAIProvider]process.env.OPENAI_API_KEY is missing or in test environment. Returning mock JSON response.`);
    
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
