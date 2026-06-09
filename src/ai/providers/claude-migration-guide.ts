/**
 * Phase 2: Claude Sonnet 전환 가이드
 *
 * 이 파일은 GPT-4o → Claude 전환 시 추가할 provider 코드입니다.
 * 전환 완료 후 이 파일을 src/ai/providers/claude.ts 위치에 저장하고
 * llm-client.ts의 provider 등록 로직에 추가하면 됩니다.
 *
 * 전환 체크리스트:
 * 1. npm install @anthropic-ai/sdk
 * 2. .env.local 에 ANTHROPIC_API_KEY 추가
 * 3. 이 파일을 src/ai/providers/claude.ts 로 복사
 * 4. src/ai/llm-client.ts 의 provider 등록에 ClaudeProvider 추가
 * 5. .env.local 에 AI_IM_MODEL=claude-sonnet-4-5 추가
 * 6. narrative-prompt.ts 의 MOBILE_IM_NARRATIVE_SYSTEM을
 *    아래 주석처럼 XML 태그 구조로 변경
 */

// ─── 1. Claude Provider 구현 ─────────────────────────────────────────────────
//
// import Anthropic from "@anthropic-ai/sdk";
// import type { LLMProvider, LLMChatParams, LLMChatResult } from "./types";
//
// export class ClaudeProvider implements LLMProvider {
//   readonly name = "claude";
//   private client: Anthropic;
//
//   constructor() {
//     const apiKey = process.env.ANTHROPIC_API_KEY;
//     if (!apiKey) throw new Error("[ClaudeProvider] ANTHROPIC_API_KEY is not defined");
//     this.client = new Anthropic({ apiKey });
//   }
//
//   async chat(params: LLMChatParams): Promise<LLMChatResult> {
//     const startTime = Date.now();
//     const model = params.model || "claude-sonnet-4-5";
//
//     const response = await this.client.messages.create({
//       model,
//       max_tokens: params.maxTokens ?? 4096,
//       temperature: params.temperature ?? 0.7,
//       system: params.systemPrompt,
//       messages: [{ role: "user", content: params.userPrompt }],
//     });
//
//     const content = response.content[0];
//     if (content.type !== "text") throw new Error("Claude returned non-text content");
//
//     return {
//       content: content.text,
//       tokens: response.usage.input_tokens + response.usage.output_tokens,
//       model: response.model,
//       provider: this.name,
//       latencyMs: Date.now() - startTime,
//     };
//   }
//
//   async embed(_text: string): Promise<number[]> {
//     throw new Error("Claude does not support embeddings — use OpenAI for embeddings");
//   }
// }

// ─── 2. llm-client.ts 수정 포인트 ────────────────────────────────────────────
//
// providers 배열에 ClaudeProvider 추가:
//
// import { ClaudeProvider } from "./providers/claude";
//
// const PROVIDERS: LLMProvider[] = [
//   new OpenAIProvider(),
//   new ClaudeProvider(),      // ← 이 줄 추가
//   new MockProvider(),
// ];
//
// Provider 선택 로직 (모델 이름 기반):
// const modelToProvider = (model: string): string => {
//   if (model.startsWith("claude")) return "claude";
//   return "openai";
// };

// ─── 3. narrative-prompt.ts Claude 최적화 ────────────────────────────────────
//
// Claude는 XML 태그 구조를 더 잘 이해합니다.
// MOBILE_IM_NARRATIVE_SYSTEM 을 아래처럼 교체:
//
// export const MOBILE_IM_NARRATIVE_SYSTEM = `
// <role>당신은 한국 상업용 부동산 전문 라이터이자 투자 전략가입니다.</role>
//
// <task>투자자가 "왜 이 건물인가?"를 직관적이고 빠르게 이해할 수 있도록
// 모바일 화면에 최적화된 매력적인 투자 서사를 작성해 주세요.</task>
//
// <writing_rules>
//   <rule>각 섹션은 2~4문장의 자연스러운 서사(줄글)로 작성합니다.</rule>
//   <rule>매우 전문적이고 객관적이되, 자산의 가치를 강조하는 어조를 유지하세요.</rule>
//   <rule>임의로 수치를 창작하지 말고, 제공된 데이터에 정확히 기초하세요.</rule>
//   <rule>투자를 유도하거나 수익률을 확정 보장하는 어휘를 사용하지 마세요.</rule>
//   <rule>핵심 키워드는 **두껍게** 표시하세요.</rule>
//   <rule>반드시 한국어로 작성하세요.</rule>
// </writing_rules>`;

// ─── 4. 환경변수 추가 ────────────────────────────────────────────────────────
//
// .env.local:
// ANTHROPIC_API_KEY=sk-ant-api03-xxxx
// AI_IM_MODEL=claude-sonnet-4-5
//
// 이렇게 하면 writer.ts의 다음 코드가 자동으로 Claude를 선택:
// const IM_AI_MODEL = process.env.AI_IM_MODEL || process.env.AI_DEFAULT_MODEL || "gpt-4o";

export {}; // TypeScript 모듈화
