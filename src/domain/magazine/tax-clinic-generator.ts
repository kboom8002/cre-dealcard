import { callLLM } from '@/ai/llm-client';
import { createModuleLogger } from '@/lib/logger';

const log = createModuleLogger('tax-clinic-generator');

export interface TaxClinicScenario {
  title: string;
  scenario: string;
  comparison: {
    optionA: { name: string; description: string; expectedTaxInfo: string };
    optionB: { name: string; description: string; expectedTaxInfo: string };
  };
  conclusion: string;
  source: string;
}

const TAX_TOPICS = [
  "자녀 증여 후 매각 vs 직접 매각 후 현금 증여",
  "개인 명의 건물, 법인 전환 후 매각이 유리할까?",
  "부담부 증여를 활용한 상업용 부동산 절세 전략",
  "공동명의 분할 시 양도소득세 절세 효과",
  "꼬마빌딩 상속 시 기준시가 vs 감정평가액 선택 가이드"
];

/**
 * AI를 활용하여 세대 전환(상속/증여) 및 절세 시나리오를 자동 생성합니다.
 */
export async function generateTaxClinicScenario(marketContext?: string): Promise<TaxClinicScenario> {
  const randomTopic = TAX_TOPICS[Math.floor(Math.random() * TAX_TOPICS.length)];
  
  try {
    const res = await callLLM({
      systemPrompt: `당신은 상업용 부동산 건물주(50~70대 자산가)를 대상으로 절세 자문을 제공하는 수석 세무사입니다.
이번 주 매거진의 "세대 전환 전략 (세무 클리닉)" 코너에 들어갈 시나리오를 작성해주세요.

다음 주제에 맞춰 시나리오를 구성하되, 실제 건물주가 고민할 법한 구체적인 상황을 가정하고, 두 가지 대안을 비교하여 직관적인 조언을 제공해야 합니다. 결과를 JSON으로 반환하세요.

JSON 스키마:
{
  "title": "시나리오 제목 (예: 50억 건물, 자녀에게 그냥 줄까 팔고 줄까?)",
  "scenario": "상황 설명 (예: 10년 전 20억에 취득한 50억 상당의 상가건물을 보유한 60대 김회장...)",
  "comparison": {
    "optionA": {
      "name": "대안 A 이름 (예: 직접 매각 후 현금 증여)",
      "description": "대안 A의 진행 방식 및 특징",
      "expectedTaxInfo": "대안 A 선택 시 예상 세금 부담 구조 (양도세, 증여세 등)"
    },
    "optionB": {
      "name": "대안 B 이름 (예: 자녀에게 건물 증여 후 매각)",
      "description": "대안 B의 진행 방식 및 특징",
      "expectedTaxInfo": "대안 B 선택 시 예상 세금 부담 구조"
    }
  },
  "conclusion": "전문가(세무사)의 결론 및 핵심 시사점 (어떤 경우에 어떤 대안이 유리한지, 2-3문장)"
}

말투: 정중하고 전문적인 전문가 톤 (합쇼체/해요체 혼용)`,
      userPrompt: `주제: ${randomTopic}\n시장 컨텍스트: ${marketContext || '현재 꼬마빌딩 거래 시장 동향'}`,
      model: 'gpt-5.4',
      temperature: 0.7,
      maxTokens: 1000,
      responseFormat: 'json_object',
    });

    const parsed = JSON.parse(
      res.content
        .trim()
        .replace(/^```(?:json)?\s*/, '')
        .replace(/\s*```$/, '')
    );

    return {
      title: parsed.title || randomTopic,
      scenario: parsed.scenario || "구체적인 시나리오 설명",
      comparison: parsed.comparison || {
        optionA: { name: "대안 A", description: "설명", expectedTaxInfo: "세금 정보" },
        optionB: { name: "대안 B", description: "설명", expectedTaxInfo: "세금 정보" }
      },
      conclusion: parsed.conclusion || "전문가 상담을 통해 최적의 전략을 수립하시기 바랍니다.",
      source: "크리딜 제휴 세무법인 감수"
    };
  } catch (err) {
    log.error('[generateTaxClinicScenario] LLM 호출 실패:', err);
    // Fallback
    return {
      title: "증여 후 매각 vs 직접 매각 후 현금 증여",
      scenario: "최근 자산 가치가 상승한 꼬마빌딩을 자녀에게 물려주려는 건물주분들의 고민이 깊습니다.",
      comparison: {
        optionA: {
          name: "직접 매각 후 현금 증여",
          description: "부모 명의로 매각하여 양도세를 납부한 뒤, 남은 현금을 자녀에게 증여하는 방식입니다.",
          expectedTaxInfo: "양도차익이 클 경우 부모에게 높은 양도세율이 적용되며, 현금 증여 시 추가 증여세가 발생합니다."
        },
        optionB: {
          name: "부담부 증여 후 자녀 매각",
          description: "임대보증금이나 대출 등 채무를 포함하여 건물을 먼저 증여한 후 자녀가 매각하는 방식입니다.",
          expectedTaxInfo: "순수 증여액이 감소하여 증여세가 줄어들 수 있으나, 채무 인수분에 대해 부모에게 양도세가 부과됩니다."
        }
      },
      conclusion: "개별 자산의 취득가액, 보유기간, 그리고 자녀의 소득 상황에 따라 유불리가 달라집니다. 실행 전 반드시 세무 시뮬레이션이 필요합니다.",
      source: "크리딜 제휴 세무법인 감수"
    };
  }
}
