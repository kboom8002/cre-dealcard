import OpenAI from "openai";
import type { LLMProvider, LLMChatParams, LLMChatResult } from "./types";

export class OpenAIProvider implements LLMProvider {
  readonly name = "openai";
  private openai: OpenAI | null = null;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey && apiKey !== "mock_key") {
      this.openai = new OpenAI({ apiKey });
    }
  }

  async chat(params: LLMChatParams): Promise<LLMChatResult> {
    const startTime = Date.now();
    const model = params.model || "gpt-4o";

    // API Key가 없거나 모의 환경일 때 테스트용 모의 응답
    if (!this.openai || process.env.NODE_ENV === "test") {
      console.warn(`[OpenAIProvider] process.env.OPENAI_API_KEY is missing or in test environment. Returning mock JSON response.`);
      
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
          hiddenFields: ["priceBand", "exactAddress"],
          
          // BlindTeaserOutput
          title: "강남 역삼역 초역세권 오피스 사옥용 빌딩 매각",
          description: "역삼역 도보 5분 거리의 준신축급 대형 오피스빌딩입니다.",
          dealHighlights: ["초역세권", "사옥 최적"],
          teaserSpecs: {
            area: "강남 역삼동",
            approxPyung: "약 3,000평",
            priceRange: "300억대"
          }
        }),
        tokens: 150,
        model,
        provider: this.name,
        latencyMs: Date.now() - startTime,
      };
      
      return mockResult;
    }

    try {
      const response = await this.openai.chat.completions.create({
        model,
        messages: [
          { role: "system", content: params.systemPrompt },
          { role: "user", content: params.userPrompt },
        ],
        response_format: params.responseFormat === "json_object" ? { type: "json_object" } : undefined,
        temperature: params.temperature ?? 0.7,
        max_tokens: params.maxTokens ?? 4096,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("OpenAI returned an empty response");
      }

      return {
        content,
        tokens: response.usage?.total_tokens ?? 0,
        model: response.model || model,
        provider: this.name,
        latencyMs: Date.now() - startTime,
      };
    } catch (error: any) {
      console.error("[OpenAIProvider] Chat completion error:", error);
      throw error;
    }
  }
}
