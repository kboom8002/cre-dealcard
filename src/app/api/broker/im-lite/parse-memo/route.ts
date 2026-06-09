/**
 * POST /api/broker/im-lite/parse-memo
 *
 * 브로커가 자유 형식으로 작성한 투자 메모를 AI로 파싱하여
 * SSoT Lite 필드를 자동 추출합니다.
 *
 * broker-deal-card 에이전트의 MemoParser Step을 재활용합니다.
 * 최소 입력: 10자 이상의 투자 메모 텍스트
 *
 * 응답: { ok: true, data: { asset_type, area_signal, price_band, ... } }
 */
import { type NextRequest, NextResponse } from "next/server";
import { requireBroker } from "@/lib/auth-guard";
import { callLLM } from "@/ai/llm-client";
import { sanitizeMemo, desanitizeOutput } from "@/ai/sanitizer/memo-sanitizer";
import { MemoParserOutputSchema } from "@/ai/schemas/broker-deal-card";
import {
  MEMO_PARSER_SYSTEM,
  MEMO_PARSER_USER_TEMPLATE,
  MEMO_PARSER_PROMPT_ID,
} from "@/ai/prompts/broker-deal-card";

export async function POST(req: NextRequest) {
  // ─── 인증 확인 ─────────────────────────────────────────────────────────────
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;

  // ─── 요청 파싱 ─────────────────────────────────────────────────────────────
  let body: { memo_text?: unknown };
  try {
    body = (await req.json()) as { memo_text?: unknown };
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "INVALID_JSON", message: "요청 본문이 유효한 JSON이 아닙니다." },
      },
      { status: 400 }
    );
  }

  const { memo_text } = body;
  if (
    !memo_text ||
    typeof memo_text !== "string" ||
    memo_text.trim().length < 10
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "INVALID_INPUT", message: "memo_text는 10자 이상 필요합니다." },
      },
      { status: 400 }
    );
  }

  const model = process.env.AI_DEFAULT_MODEL || "gpt-4o";

  try {
    // ─── Step 1: PII 마스킹 ────────────────────────────────────────────────
    const sanitizationMap = sanitizeMemo(memo_text);
    const { sanitizedText } = sanitizationMap;

    // ─── Step 2: MemoParser AI 호출 ──────────────────────────────────────
    const memoPrompt = MEMO_PARSER_USER_TEMPLATE.replace("{memo}", sanitizedText);

    const result = await callLLM({
      model,
      systemPrompt: MEMO_PARSER_SYSTEM,
      userPrompt: memoPrompt,
      responseFormat: "json_object",
      temperature: 0.3,
      maxTokens: 1500,
    });

    // ─── Step 3: PII 복원 + Zod 검증 ──────────────────────────────────────
    const restoredContent = desanitizeOutput(result.content, sanitizationMap);
    const parsedMemo = MemoParserOutputSchema.parse(
      JSON.parse(restoredContent)
    );

    const { extractedFacts, detectedSensitiveFields, ambiguousFields, warnings } =
      parsedMemo;

    // ─── Step 4: SSoT Lite 필드 매핑 ──────────────────────────────────────
    return NextResponse.json({
      ok: true,
      data: {
        // SSoT Lite 핵심 필드
        asset_type:         extractedFacts.assetType,
        area_signal:        extractedFacts.region,
        price_band:         extractedFacts.priceText,
        size_signal:        extractedFacts.sizeText,
        vacancy_signal:     extractedFacts.vacancySignal,
        current_use_signal: extractedFacts.currentUse,
        lease_signal:       extractedFacts.leaseSignal,
        // 민감 정보 리포트 (UI에서 브로커에게 안내용)
        detected_sensitive_fields: detectedSensitiveFields,
        ambiguous_fields:          ambiguousFields,
        warnings,
        // 메타데이터
        prompt_version: MEMO_PARSER_PROMPT_ID,
        model,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    console.error("[parse-memo] Error:", message);

    if (message.toLowerCase().includes("zod") || message.includes("parse")) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "PARSE_FAILED",
            message:
              "AI 응답 파싱에 실패했습니다. 메모를 더 구체적으로 작성해 주세요.",
          },
        },
        { status: 422 }
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error: { code: "AI_ERROR", message: "AI 처리 중 오류가 발생했습니다." },
      },
      { status: 500 }
    );
  }
}
