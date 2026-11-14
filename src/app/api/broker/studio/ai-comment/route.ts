import { NextRequest, NextResponse } from "next/server";
import { callLLM, LLMMockNotAllowedError } from "@/ai/llm-client";
import { getModel } from "@/ai/model-selector";
import {
  buildTf8BriefingPolishPrompt,
  buildTf8CommentPrompt,
  repairBriefingPolishOutputBlock,
  repairCommentOutputBlock,
} from "@/ai/prompts/magazine-taskflow";
import { requireBroker } from "@/lib/auth-guard";
import {
  AI_COMMENT_SYSTEM_PROMPT,
  AI_COMMENT_WARNING_INPUT_NOT_IN_CONTEXT,
  aiCommentRequestSchema,
  findNumbersNotInContext,
  type AiCommentResponse,
} from "@/lib/magazine/ai-comment-schema";

import { createModuleLogger } from "@/lib/logger";
const log = createModuleLogger("route");

function fail(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

/**
 * POST /api/broker/studio/ai-comment
 * 요청 { comment } (구 { context } 도 허용) → 응답 { ok:true, result:{ comment }, warnings?, envelope? }
 * Mock 응답은 공개 콘텐츠 품질 보장을 위해 502로 거부한다 (DC-8).
 */
export async function POST(req: NextRequest) {
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
  const { comment, mode, draftText, cadence } = parsed.data;
  const isBriefingMode = mode === "market_briefing";
  const groundingContext = [draftText ?? "", comment].filter(Boolean).join(" ");
  const tf8 = isBriefingMode
    ? buildTf8BriefingPolishPrompt({
        draftText: draftText?.trim() || comment,
        contextText: comment,
        cadence,
      })
    : buildTf8CommentPrompt({ comment });

  try {
    const result = await callLLM(
      {
        systemPrompt: `${AI_COMMENT_SYSTEM_PROMPT}\n\n${tf8.systemPrompt}`,
        userPrompt: tf8.userPrompt,
        model: getModel("luna"),
        temperature: 0.4,
      },
      { allowMock: false },
    );

    if ((result as { isMock?: boolean }).isMock) {
      return fail(502, "LLM_UNAVAILABLE", "AI가 잠시 쉬고 있어요. 잠시 후 다시 눌러 주세요.");
    }

    const text = typeof result.content === "string" ? result.content.trim() : "";
    if (!text) {
      return fail(502, "LLM_EMPTY", "AI가 응답을 만들지 못했어요. 다시 한 번 눌러 주세요.");
    }

    const warnings: string[] = [];
    if (findNumbersNotInContext(text, groundingContext).length > 0) {
      warnings.push(AI_COMMENT_WARNING_INPUT_NOT_IN_CONTEXT);
    }

    const repaired = isBriefingMode
      ? repairBriefingPolishOutputBlock(text, groundingContext)
      : repairCommentOutputBlock(text, comment);

    const body: AiCommentResponse & { envelope?: unknown } = {
      ok: true,
      result: { comment: repaired.comment || text },
      ...(warnings.length > 0 ? { warnings } : {}),
      envelope: repaired.envelope,
    };
    return NextResponse.json(body);
  } catch (error: unknown) {
    if (error instanceof LLMMockNotAllowedError) {
      log.warn("[studio/ai-comment] Mock 응답 거부:", error.message);
      return fail(502, "LLM_UNAVAILABLE", "AI가 잠시 쉬고 있어요. 잠시 후 다시 눌러 주세요.");
    }
    log.error("[studio/ai-comment] Error:", error);
    return fail(500, "SERVER_ERROR", "AI 추천글 작성 중 문제가 생겼어요. 잠시 후 다시 눌러 주세요.");
  }
}
