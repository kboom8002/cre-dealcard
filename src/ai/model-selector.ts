/**
 * AI Model Tier Selector
 * 
 * GPT-5.6 계열의 3계층 모델을 중앙에서 관리합니다.
 * - Sol:   복잡 추론, 멀티스텝 파이프라인 핵심 (플래그십)
 * - Terra: 일상 프로덕션 기본 (균형)
 * - Luna:  분류, 파싱, 정규화 등 경량 작업 (비용 최적)
 */

export type ModelTier = "sol" | "terra" | "luna";

/**
 * 지정 계층의 모델 슬러그를 반환합니다.
 * 각 계층은 환경변수로 오버라이드 가능합니다.
 * 
 * @example
 * ```ts
 * import { getModel } from "@/ai/model-selector";
 * const model = getModel("sol");   // "gpt-5.6-sol"
 * const model = getModel("terra"); // "gpt-5.6-terra"
 * const model = getModel("luna");  // "gpt-5.6-luna"
 * ```
 */
export function getModel(tier: ModelTier = "terra"): string {
  switch (tier) {
    case "sol":
      return process.env.AI_MODEL_SOL || "gpt-5.6-sol";
    case "terra":
      return process.env.AI_MODEL_TERRA || process.env.AI_DEFAULT_MODEL || "gpt-5.6-terra";
    case "luna":
      return process.env.AI_MODEL_LUNA || "gpt-5.6-luna";
  }
}
