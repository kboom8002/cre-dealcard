/**
 * src/lib/chat/ai-ambassador.ts
 * 
 * Mobile IM과 연동되는 AI 앰배서더 / 코치 챗봇 엔진 아키텍처.
 * 투자자가 Mobile IM 페이지를 열람하는 동안 궁금한 점을 질문하면,
 * 해당 건물(IM)의 데이터(RAG)와 사전에 훈련된 도메인 지식을 바탕으로 즉각적인 답변을 제공.
 * 
 * \aihompyhub 에 구현된 AI 챗봇 시스템 구조 참조 (Graph RAG / Semantic Caching).
 */

import { callLLM } from "@/ai/llm-client";
import { searchSimilarIMs } from "@/domain/building/mobile-im/cre-rag-service";
import { createClient } from "@/lib/supabase/client";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface AmbassadorContext {
  buildingId: string;
  assetType: string;
  imSectionsData: Record<string, any>;
}

const AMBASSADOR_SYSTEM_PROMPT = `당신은 이 상업용 부동산 매물의 AI 앰배서더(중개 대리인)입니다.
사용자는 잠재적 투자자입니다. 제공된 매물 정보(Mobile IM 데이터)에 기반하여 전문적이고 신뢰감 있게 질문에 답변하세요.
절대 제공되지 않은 사실을 지어내거나 추측하지 마시고, 불확실한 경우 "담당 중개인에게 확인 후 안내해 드리겠습니다"라고 정중히 답변하세요.
투자 수익률을 보장하거나 위험을 축소하는 발언은 엄격히 금지됩니다.`;

export async function askAiAmbassador(
  messages: ChatMessage[],
  context: AmbassadorContext
): Promise<string> {
  // 1. RAG Context 추출 (건물과 관련된 최근 거래 사례, 시세 등)
  // 여기서는 최신 메시지를 쿼리로 사용하여 검색
  const userMessage = messages.filter(m => m.role === 'user').pop()?.content || "";
  const supabase = createClient();
  const docs = await searchSimilarIMs(supabase as any, userMessage, { topK: 2, filterByAssetType: context.assetType });
  const ragContext = docs.map((d, i) => `[유사사례 ${i+1}] ${d.content}`).join("\n\n");

  // 2. 시스템 프롬프트 구성 (IM 데이터 포함)
  const systemMessage: ChatMessage = {
    role: "system",
    content: `${AMBASSADOR_SYSTEM_PROMPT}
    
[현재 매물 (Mobile IM) 핵심 데이터]
${JSON.stringify(context.imSectionsData, null, 2)}

[관련 시장/유사 사례 (RAG 데이터)]
${ragContext || "관련 데이터 없음"}
    `
  };

  // 3. LLM 호출
  const result = await callLLM({
    model: "gpt-4o", // 혹은 claude-sonnet-4-5
    systemPrompt: systemMessage.content,
    userPrompt: messages.map(m => `${m.role}: ${m.content}`).join('\n') + '\nassistant:',
    maxTokens: 1000,
    temperature: 0.3 // 정밀하고 신뢰성 있는 톤
  });

  return result.content;
}
