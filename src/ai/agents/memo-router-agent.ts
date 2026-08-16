import { z } from "zod";
import { callLLM } from "@/ai/llm-client";
import { MEMO_ROUTER_SYSTEM, MEMO_ROUTER_USER_TEMPLATE } from "@/ai/prompts/memo-router";
import { getModel } from "../model-selector";

export const MemoRouterOutputSchema = z.object({
  type: z.enum(["new_deal", "update_building", "buyer_condition", "general_note", "schedule_event"]),
  confidence: z.number().min(0).max(1),
  summary: z.string(),
  extracted_data: z.object({
    target_region: z.string().optional(),
    target_budget: z.string().optional(),
    inferred_posture: z.string().optional(),
  }).optional()
});

export type MemoRouterOutput = z.infer<typeof MemoRouterOutputSchema>;

/**
 * 한국어 CRE 부동산 특화 키워드 기반 규칙 분석기 (Deterministic Rule-Based Fast Classifier)
 * LLM 실패 시의 안전 Fallback이자, 100% 명확한 패턴에 대한 즉각적 신뢰도 보장.
 */
export function classifyMemoRuleBased(memoText: string): MemoRouterOutput {
  const text = memoText.trim();
  
  // 1. 일정/미팅/임장 패턴 (schedule_event)
  const scheduleRegex = /(?:내일|모레|글피|오늘|월요일|화요일|수요일|목요일|금요일|토요일|일요일|\d{1,2}월\s*\d{1,2}일|\d{1,2}시)\s*(?:에|까지|경)?\s*(?:임장|미팅|방문|답사|상담|약속|계약)/;
  if (scheduleRegex.test(text)) {
    return {
      type: "schedule_event",
      confidence: 0.95,
      summary: text.slice(0, 60),
    };
  }

  // 2. 매수자/임차인 의향 패턴 (buyer_condition)
  // 예: "사옥 찾음", "50억 예산", "매수 의향", "임차 희망", "김대표님 찾으심"
  const buyerKeywords = /(?:매수의향|매수\s*의향|찾으심|찾음|찾고\s*있음|구함|구하고\s*있음|매수희망|임차희망|사옥\s*수요|투자자|손님|대표님.*예산)/;
  const budgetKeywords = /(?:예산|희망가|한도|자금)[\s:]*[\d,.]+\s*(?:억|만|원)/;
  if (buyerKeywords.test(text) || (budgetKeywords.test(text) && !/(?:대지|연면적|준공|층수|보증금|월세|매각)/.test(text))) {
    const regionMatch = text.match(/([가-힣]+(?:구|동|역|권역|대로))/);
    const budgetMatch = text.match(/([\d,.]+\s*(?:억|만|원))/);
    return {
      type: "buyer_condition",
      confidence: 0.9,
      summary: text.slice(0, 60),
      extracted_data: {
        target_region: regionMatch ? regionMatch[1] : undefined,
        target_budget: budgetMatch ? budgetMatch[1] : undefined,
      }
    };
  }

  // 3. 신규 매물 패턴 (new_deal)
  // 매각가, 임대료, 보증금, 대지, 연면적, 층수, 준공, 근생, 오피스 등 매물 고유 속성
  const dealKeywords = /(?:매각|급매|매매|대지|연면적|준공|보증금|월세|월\s*임대료|평당|지상\s*\d+층|지하\s*\d+층|근생|오피스|빌딩\s*매각|단독|사옥용|수익형)/;
  const specMatchCount = [
    /(?:대지|토지)[\s:]*[\d,.]+\s*(?:평|㎡)/.test(text),
    /(?:연면적|전용)[\s:]*[\d,.]+\s*(?:평|㎡)/.test(text),
    /(?:매각|매매|매가|희망가)[\s:]*[\d,.]+\s*억/.test(text),
    /(?:보증금|월세|임대료)/.test(text),
    /(?:준공|완공)[\s:]*\d{4}/.test(text),
    /(?:지상|지하)\s*\d+층/.test(text),
  ].filter(Boolean).length;

  if (dealKeywords.test(text) || specMatchCount >= 2) {
    const regionMatch = text.match(/([가-힣]+(?:시|구|동|역|대로))/);
    const priceMatch = text.match(/([\d,.]+\s*억)/);
    
    // 투자 성격 추론
    let inferred_posture = "income";
    if (/사옥|자가사용|통사옥|본사/.test(text)) inferred_posture = "owner_occupied";
    else if (/신축|개발|재건축|나대지|부지/.test(text)) inferred_posture = "development";
    else if (/호텔|모텔|숙박|운영|매출/.test(text)) inferred_posture = "operating";
    else if (/단기|시세차익|전매/.test(text)) inferred_posture = "trading";

    return {
      type: "new_deal",
      confidence: 0.95,
      summary: text.slice(0, 60),
      extracted_data: {
        target_region: regionMatch ? regionMatch[1] : undefined,
        target_budget: priceMatch ? priceMatch[1] : undefined,
        inferred_posture,
      }
    };
  }

  // 4. 기존 매물 업데이트 (update_building)
  const updateKeywords = /(?:추가\s*확인|정보\s*수정|주차.*확인됨|월세.*올랐|임대료.*변경|건물주.*통화)/;
  if (updateKeywords.test(text)) {
    return {
      type: "update_building",
      confidence: 0.8,
      summary: text.slice(0, 60),
    };
  }

  // 5. 기본 일반 메모
  return {
    type: "general_note",
    confidence: 0.5,
    summary: text.slice(0, 60),
  };
}

export async function routeMemo(memoText: string): Promise<MemoRouterOutput> {
  const model = getModel("luna");
  const userPrompt = MEMO_ROUTER_USER_TEMPLATE.replace("{memo_text}", memoText);

  try {
    const response = await callLLM({
      model,
      systemPrompt: MEMO_ROUTER_SYSTEM,
      userPrompt,
      responseFormat: "json_object",
      temperature: 0.1, // Low temperature for consistent classification
      maxTokens: 500,
    });

    const parsed = JSON.parse(response.content);
    const validated = MemoRouterOutputSchema.parse(parsed);

    // AI가 general_note로 반환했지만 명확한 매물/매수 패턴이 있는 경우 Rule-based로 보정
    if (validated.type === "general_note") {
      const ruleBased = classifyMemoRuleBased(memoText);
      if (ruleBased.type !== "general_note" && ruleBased.confidence > 0.8) {
        return ruleBased;
      }
    }

    return validated;
  } catch (error) {
    console.warn("AI Memo routing failed, using rule-based classifier fallback:", error);
    // Fallback to Rule-based classifier instead of blind general_note
    return classifyMemoRuleBased(memoText);
  }
}
