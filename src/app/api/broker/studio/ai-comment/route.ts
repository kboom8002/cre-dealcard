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
import { humanizeBuyerCopy } from "@/domain/magazine/issue-clustering";
import {
  AI_COMMENT_WARNING_INPUT_NOT_IN_CONTEXT,
  aiCommentRequestSchema,
  findNumbersNotInContext,
  type AiCommentResponse,
} from "@/lib/magazine/ai-comment-schema";

import { createModuleLogger } from "@/lib/logger";
import {
  AI_SERVER_UNAVAILABLE_KO,
  enforceBrokerAiQuota,
  isLLMMockNotAllowedError,
} from "@/lib/ai-quota-guard";
import { toApiError } from "@/lib/api-error";

export const maxDuration = 60;

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

  const quotaErr = await enforceBrokerAiQuota(req, auth.user?.id ?? "", "studio_ai_comment");
  if (quotaErr) return quotaErr;
  const {
    comment,
    mode,
    draftText,
    cadence,
    dealTitle,
    regionFocus,
    posture,
    priceBand,
    area,
    points,
    avoidComments,
    attemptSeed,
  } = parsed.data;
  const avoidList = (avoidComments ?? []).map((item) => item.trim()).filter(Boolean).slice(0, 8);
  const temperature = avoidList.length === 0 ? 0.4 : avoidList.length === 1 ? 0.72 : 0.85;
  const isBriefingMode = mode === "market_briefing";
  const groundingContext = [
    draftText ?? "",
    comment,
    ...(isBriefingMode
      ? []
      : [dealTitle ?? "", regionFocus ?? "", priceBand ?? "", area ?? "", ...(points ?? [])]),
  ]
    .filter(Boolean)
    .join(" ");
  const tf8 = isBriefingMode
    ? buildTf8BriefingPolishPrompt({
        draftText: draftText?.trim() || comment,
        contextText: comment,
        cadence,
        regionFocus,
      })
    : buildTf8CommentPrompt({
        comment,
        dealTitle,
        regionFocus,
        posture,
        priceBand,
        area,
        points,
        attemptSeed,
      });

  const userPromptWithAvoid =
    avoidList.length > 0
      ? `${tf8.userPrompt}\n\n[중복 표현 금지 — 아래 기존 문구와 다른 어휘·문장 구조로 작성하세요]\n${avoidList.map((item, idx) => `${idx + 1}. ${item}`).join("\n")}`
      : tf8.userPrompt;

  try {
    const result = await callLLM(
      {
        systemPrompt: tf8.systemPrompt,
        userPrompt: userPromptWithAvoid,
        model: getModel("terra"),
        temperature,
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
      result: { comment: humanizeBuyerCopy(repaired.comment || text) },
      ...(warnings.length > 0 ? { warnings } : {}),
      envelope: repaired.envelope,
    };
    return NextResponse.json(body);
  } catch (error: unknown) {
    if (error instanceof LLMMockNotAllowedError || isLLMMockNotAllowedError(error)) {
      log.warn("[studio/ai-comment] Mock 응답 거부:", error instanceof Error ? error.message : error);
      return fail(503, "LLM_UNAVAILABLE", AI_SERVER_UNAVAILABLE_KO);
    }
    log.error("[studio/ai-comment] Error:", error);
    return toApiError(error);
  }
}
