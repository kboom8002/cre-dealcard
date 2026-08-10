/**
 * AI LLM 응답 파싱 공통 유틸리티
 * 
 * - 마크다운 코드 펜스 자동 제거
 * - BOM 및 trailing comma 제거
 * - Zod safeParse + 부분 복구
 */
import { type ZodSchema, type ZodError } from "zod";

/**
 * LLM 응답에서 JSON 문자열을 안전하게 추출합니다.
 * ```json ... ``` 래핑, BOM, trailing comma 등을 처리합니다.
 */
export function extractJsonString(raw: string): string {
  let s = raw.trim();
  // 마크다운 코드 펜스 제거
  const fenceMatch = s.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/i);
  if (fenceMatch) s = fenceMatch[1].trim();
  // BOM 제거
  if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
  // trailing comma 제거 (JSON 비표준)
  s = s.replace(/,\s*([\]}])/g, "$1");
  return s;
}

export type ParseResult<T> =
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      error: string;
      raw: string;
    };

/**
 * LLM 응답을 안전하게 파싱하고 Zod 스키마로 검증합니다.
 * 
 * @example
 * ```ts
 * const result = safeParseAIResponse(llmOutput, MySchema);
 * if (!result.success) throw new Error(result.error);
 * const data = result.data;
 * ```
 */
export function safeParseAIResponse<T>(
  rawContent: string,
  schema: ZodSchema<T>
): ParseResult<T> {
  // Step 1: JSON 문자열 추출
  const jsonStr = extractJsonString(rawContent);

  // Step 2: JSON 파싱
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (jsonErr) {
    return {
      success: false,
      error: `JSON 파싱 실패: ${(jsonErr as Error).message}`,
      raw: rawContent,
    };
  }

  // Step 3: Zod 검증 (safeParse)
  const zodResult = schema.safeParse(parsed);
  if (zodResult.success) {
    return { success: true, data: zodResult.data };
  }

  // Step 4: 부분 복구 시도
  try {
    const withDefaults = schema.parse(parsed);
    return { success: true, data: withDefaults };
  } catch {
    const issues = (zodResult.error as ZodError).issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    return {
      success: false,
      error: `스키마 검증 실패: ${issues}`,
      raw: rawContent,
    };
  }
}
