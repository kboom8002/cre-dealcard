import { NextRequest, NextResponse } from "next/server";
import { callLLM, LLMMockNotAllowedError } from "@/ai/llm-client";
import { getModel } from "@/ai/model-selector";
import { requireBroker } from "@/lib/auth-guard";
import {
  AI_COMMENT_SYSTEM_PROMPT,
  AI_COMMENT_WARNING_INPUT_NOT_IN_CONTEXT,
  aiCommentRequestSchema,
  findNumbersNotInContext,
  type AiCommentResponse,
} from "@/lib/magazine/ai-comment-schema";

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('route');

function fail(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

/**
 * POST /api/broker/studio/ai-comment
 * 요청 { comment } (구 { context } 도 허용) → 응답 { ok:true, result:{ comment }, warnings? }
 * Mock 응답은 공개 콘텐츠 품질 보장을 위해 502로 거부한다 (DC-8).
 */
export async function POST(req: NextRequest) {
  // Auth guard — 미인증 요청 차단
  const auth = await requireBroker(req);
  if (auth.error) return auth.error;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail(400, "BAD_REQUEST", "요청 형식이 올바르지 않습니다.");
  }

  const parsed = aiCommentRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return fail(400, "BAD_REQUEST", parsed.error.issues[0]?.message ?? "코멘트 내용이 필요합니다.");
  }
  const { comment } = parsed.data;

  try {
    const result = await callLLM(
      {
        systemPrompt: AI_COMMENT_SYSTEM_PROMPT,
        userPrompt: `입력 내용: ${JSON.stringify(comment)}`,
        model: getModel("luna"),
        temperature: 0.4,
      },
      { allowMock: false },
    );

    // 방어: llm-client 가 allowMock 을 지원하지 않거나 우회되어도 Mock 응답은 거부
    if ((result as { isMock?: boolean }).isMock) {
      return fail(502, "LLM_UNAVAILABLE", "AI 서비스를 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도해주세요.");
    }

    const text = typeof result.content === "string" ? result.content.trim() : "";
    if (!text) {
      return fail(502, "LLM_EMPTY", "AI가 응답을 생성하지 못했습니다. 다시 시도해주세요.");
    }

    const warnings: string[] = [];
    if (findNumbersNotInContext(text, comment).length > 0) {
      warnings.push(AI_COMMENT_WARNING_INPUT_NOT_IN_CONTEXT);
    }

    const body: AiCommentResponse = {
      ok: true,
      result: { comment: text },
      ...(warnings.length > 0 ? { warnings } : {}),
    };
    return NextResponse.json(body);
  } catch (error: unknown) {
    if (error instanceof LLMMockNotAllowedError) {
      log.warn("[studio/ai-comment] Mock 응답 거부:", error.message);
      return fail(502, "LLM_UNAVAILABLE", "AI 서비스를 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도해주세요.");
    }
    log.error("[studio/ai-comment] Error:", error);
    return fail(500, "SERVER_ERROR", "AI 생성 중 오류가 발생했습니다.");
  }
}
