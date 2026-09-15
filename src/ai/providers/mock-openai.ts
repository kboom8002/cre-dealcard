import type { LLMProvider, LLMChatParams, LLMChatResult } from "./types";

interface MockRegistryEntry {
  name: string;
  match: (sys: string, usr: string) => boolean;
  respond: (params: LLMChatParams, startTime: number, model: string) => LLMChatResult;
}

function extractHeuristics(params: LLMChatParams) {
  const promptText = (params.userPrompt || "") + " " + (params.systemPrompt || "");
  const addrMatch = promptText.match(/([가-힣]+(?:구|시)\s*[가-힣\d]+(?:동|로|가)\s*[\d-]+|[가-힣\d]+(?:동|로|가)\s*[\d-]+)/);
  const priceMatch = promptText.match(/(\d+억(?:\s*\d+만)?|\d+,\d+만)/);
  const sizeMatch = promptText.match(/(\d+(?:\.\d+)?평)/);
  const dongMatch = promptText.match(/([가-힣]+동)/);
  const bldgNameMatch = promptText.match(/\(([가-힣\d\s]+빌딩)\)/);

  return {
    promptText,
    extractedAddr: addrMatch ? addrMatch[1].trim() : "역삼동 742-1",
    extractedRegion: dongMatch ? dongMatch[1].replace(/동$/, "") : "역삼",
    extractedPrice: priceMatch ? priceMatch[1] : "135억",
    extractedSize: sizeMatch ? sizeMatch[1] : "580평",
    extractedBldgName: bldgNameMatch ? bldgNameMatch[1] : (dongMatch ? dongMatch[1].replace(/동$/, "") + "빌딩" : "역삼빌딩"),
    assetType: promptText.includes("오피스") ? "오피스빌딩" : "근생빌딩",
  };
}

export const MOCK_DISPATCH_REGISTRY: MockRegistryEntry[] = [
  {
    name: 'quality_gate',
    match: (s, u) => s.includes("quality_gate") || s.includes("품질 게이트"),
    respond: (params, startTime, model) => ({
      content: JSON.stringify({
        passed: true,
        score: 95,
        risk: "low",
        violations: [],
        feedback: "품질 게이트 통과"
      }),
      tokens: 100,
      model,
      provider: "openai",
      latencyMs: Date.now() - startTime,
    })
  },
  {
    name: 'judge',
    match: (s, u) => s.includes("LLM-as-Judge") || s.includes("품질 평가") || s.includes("품질 심사위원"),
    respond: (params, startTime, model) => ({
      content: JSON.stringify({
        factual_accuracy: 4.8,
        financial_soundness: 4.8,
        regulatory_compliance: 4.8,
        investor_value: 4.8,
        data_grounding: 4.8,
        overall: 4.8,
        feedback: "Mock judge evaluation passed with high scores.",
        citation_check: [],
      }),
      tokens: 150,
      model,
      provider: "openai",
      latencyMs: Date.now() - startTime,
    })
  },
  {
    name: 'persona',
    match: (s, u) => s.includes("IDEAL BUYER PERSONAS"),
    respond: (params, startTime, model) => ({
      content: JSON.stringify({
        propertySummary: "여의도 지역 근생 건물로, 다양한 용도로 활용 가능한 안정적인 임대 수익 건물입니다.",
        personas: [
          {
            label: "IT 중견기업 사옥 이전형",
            buyerType: "법인",
            budgetRange: "150억",
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
            budgetRange: "130억",
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
            budgetRange: "160억",
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
      provider: "openai",
      latencyMs: Date.now() - startTime,
    })
  },
  {
    name: 'rent_roll',
    match: (s, u) => s.includes("렌트롤") || s.includes("floorLeases"),
    respond: (params, startTime, model) => ({
      content: JSON.stringify({
        floorLeases: [
          { floor: "6F", tenant_type: "사무실", deposit_manwon: 0, rent_manwon: 1050, mgmt_fee_manwon: 0, is_vacant: false },
          { floor: "5F", tenant_type: "공실", deposit_manwon: 0, rent_manwon: 0, mgmt_fee_manwon: 0, is_vacant: true },
          { floor: "4F", tenant_type: "공실", deposit_manwon: 0, rent_manwon: 0, mgmt_fee_manwon: 0, is_vacant: true },
          { floor: "3F", tenant_type: "사무실", deposit_manwon: 10000, rent_manwon: 750, mgmt_fee_manwon: 0, is_vacant: false },
          { floor: "2F", tenant_type: "공실", deposit_manwon: 0, rent_manwon: 0, mgmt_fee_manwon: 0, is_vacant: true },
          { floor: "1F", tenant_type: "식당", deposit_manwon: 13000, rent_manwon: 830, mgmt_fee_manwon: 0, is_vacant: false },
          { floor: "B1", tenant_type: "파티룸", deposit_manwon: 6000, rent_manwon: 510, mgmt_fee_manwon: 0, is_vacant: false }
        ],
        monthlyRent: 3140,
        totalDeposit: 29000,
        mgmtFeeTotal: 0,
        vacancyPct: 42
      }),
      tokens: 300,
      model,
      provider: "openai",
      latencyMs: Date.now() - startTime,
    })
  },
  {
    name: 'section_narrative',
    match: (s, u) => (s.includes("CRE IM") || s.includes("섹션") || s.includes("작성 지침") || s.includes("투자설명서") || u.includes("MobileIMSectionType") || u.includes("IM 섹션")) && !u.includes("JSON") && !s.includes("JSON"),
    respond: (params, startTime, model) => {
      const h = extractHeuristics(params);
      const narrativeContent = `### 핵심 투자 포인트 및 자산 개요
본 자산은 ${h.extractedRegion} 권역 중심에 위치한 우량 ${h.assetType}입니다.

1. **입지 가치 및 접근성**: 대중교통 및 주요 간선도로와의 우수한 연계성을 갖추고 있어 풍부한 유동인구와 배후 임대 수요를 확보하고 있습니다.
2. **안정적인 자산 가치**: ${h.extractedPrice} 수준의 합리적인 매각가와 ${h.extractedSize} 규모의 건물 물리 스펙을 기반으로 안정적인 운영이 가능합니다.
3. **향후 밸류애드 잠재력**: 체계적인 임대 관리 및 자산 효율화를 통해 향후 중장기적인 자산 가치 상승을 기대할 수 있습니다.`;
      return {
        content: narrativeContent,
        tokens: 300,
        model,
        provider: "openai",
        latencyMs: Date.now() - startTime,
      };
    }
  }
];

export class MockOpenAIProvider implements LLMProvider {
  readonly name = "openai";

  async chat(params: LLMChatParams): Promise<LLMChatResult> {
    const startTime = Date.now();
    const model = params.model || "gpt-5.6-terra";

    console.warn(`[MockOpenAIProvider]process.env.OPENAI_API_KEY is missing or in test environment. Returning mock JSON response.`);

    const sys = params.systemPrompt || "";
    const usr = params.userPrompt || "";

    for (const entry of MOCK_DISPATCH_REGISTRY) {
      if (entry.match(sys, usr)) {
        return entry.respond(params, startTime, model);
      }
    }

    const h = extractHeuristics(params);
    const mockResult: LLMChatResult = {
      content: JSON.stringify({
        ok: true,
        mocked: true,
        extractedFields: {
          area_signal: h.extractedRegion,
          asset_type: h.assetType,
          price_band: h.extractedPrice,
          size_signal: h.extractedSize
        },
        // 3-step 에이전트 Zod 검증을 충족하기 위한 mock schema-level output 구조들
        // MemoParserOutput
        extractedFacts: {
          region: h.extractedRegion,
          exactAddressCandidate: h.extractedAddr,
          assetType: h.assetType,
          priceText: h.extractedPrice,
          sizeText: h.extractedSize,
          currentUse: h.promptText.includes("오피스") ? "오피스" : "근린생활시설",
          currentUseSignal: "근린생활시설",
          leaseSignal: h.promptText.includes("전층 공실") || h.promptText.includes("공실") ? "공실" : "임대중",
          vacancySignal: h.promptText.includes("공실") ? "공실 발생" : "공실없음",
          tenantNames: [],
          unitRentTexts: [],
          sellerMotivationText: "자산 효율화",
          brokerNotes: ["역세권 매물"]
        },
        detectedSensitiveFields: ["exact_address"],
        ambiguousFields: [],
        warnings: [],

        areaSignal: h.extractedRegion,
        assetType: h.assetType,
        priceBand: h.extractedPrice,
        sizeSignal: h.extractedSize,
        dealType: "매각",
        
        // BuildingMiniTruthOutput
        buildingName: h.extractedBldgName,
        exactAddress: h.extractedAddr,
        totalFloorArea: h.extractedSize ? parseFloat(h.extractedSize) * 3.3058 : 9917.3,
        buildYear: 2015,
        currentUseSignal: "근린생활시설",
        vacancySignal: h.promptText.includes("공실") ? "공실 발생" : "공실 없음",
        fitSummary: `${h.extractedRegion} 권역 입지의 ${h.assetType} 매각 물건`,
        cautionSummary: "권리관계 및 현장 실사 확인 필요",
        hiddenFields: ["exact_address", "seller_motivation"],
        confidence: {
          areaSignal: "confirmed",
          assetType: "confirmed",
          priceBand: "confirmed",
          fitSummary: "ai_hypothesis"
        },
        missingData: [],
        boundaryNote: "본 자료는 실거래 통계 기반 참고치입니다.",

        // BuyerIntentLiteOutput
        buyerType: "법인 사옥형",
        budgetRange: { min: 70, max: 70, display: `${h.extractedPrice}` },
        preferredRegions: ["강남", "성수"],
        assetTypes: ["꼬마빌딩", "사옥용"],
        purchasePurpose: "사옥용 매입",
        mustHave: ["초역세권", "주차"],
        niceToHave: ["테라스", "루프탑"],
        riskTolerance: "medium",
        financingNote: "자본금 50% 준비",
        missingQuestions: ["구체적인 입주 시기가 언제인가요?", "선호하는 수익률이 있나요?"],
        privacyNotes: ["연락처 비공개"],
        
        // BuyerMemoOutput
        fitReasons: [`매수자 예산(${h.extractedPrice})에 부합하는 매물입니다.`, "요청하신 성수/강남 권역에 해당합니다."],
        cautionReasons: ["요청한 용도와 달리 명도 협의가 다소 필요합니다."],
        recommendedNextAction: "현장 답사 제안",
        kakaoMessage: "안녕하세요! 요청하신 조건에 부합하는 추천 매물이 있어 안내해 드립니다. 확인해보시고 피드백 부탁드립니다.",


        // BlindTeaserOutput
        title: `${h.extractedRegion} 초역세권 ${h.assetType} 매각`,
        shortSummary: `${h.extractedRegion}역 도보 거리의 우량 ${h.assetType} 매물입니다.`,
        dealPoints: ["초역세권", "개발 및 사옥 최적"],
        cautionPoints: ["권리관계 확인 필요"],
        hiddenInfoNotice: ["보증금 및 지번은 인가 후 확인 가능"],
        gateMessage: "G1 등급 등록이 필요합니다.",
        kakaoText: `${h.extractedRegion} ${h.assetType} 매각 안내입니다.`,

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
