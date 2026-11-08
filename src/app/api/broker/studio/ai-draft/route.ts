import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { callLLM, LLMMockNotAllowedError } from "@/ai/llm-client";
import { getModel } from "@/ai/model-selector";
import { requireBroker } from "@/lib/auth-guard";
import {
  AI_COMMENT_WARNING_INPUT_NOT_IN_CONTEXT,
  findNumbersNotInContext,
} from "@/lib/magazine/ai-comment-schema";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("route");

export const FORBIDDEN_INVESTMENT_PHRASES = [
  "100% 보장",
  "원금 보장",
  "수익 보장",
  "확정 수익",
  "무조건 상승",
  "반드시 오릅니다",
  "즉시 매수 권유",
] as const;

export function sanitizeInvestmentSolicitation(text: string): string {
  let out = text;
  for (const phrase of FORBIDDEN_INVESTMENT_PHRASES) {
    out = out.split(phrase).join("신중한 검토");
  }
  return out;
}

export const AI_DRAFT_SYSTEM_PROMPT = [
  "당신은 상업용 부동산 전문 공인중개사의 월간 뉴스레터 초안 작성을 돕는 편집 비서입니다.",
  "중개사가 입력한 발행 연·월, 관심 권역, 추천 매물 제목, 기존 메모만을 바탕으로 정중하고 신뢰감 있는 한국어 뉴스레터 초안 JSON을 작성하세요.",
  "절대 규칙:",
  "1) 입력에 없는 구체 숫자(수익률, 매매가, 공실률, 거래건수, 변동률 등)를 임의로 추가하지 마세요.",
  "2) 투자 권유·단정 표현(원금 보장, 확정 수익, 무조건 상승 등)을 사용하지 마세요.",
  "3) 반드시 아래 JSON 키만 포함하여 응답하세요:",
  '   { "headline": "36자 이내 표지 제목", "summary": "80자 이내 한 줄 소개", "briefingTitle": "30자 이내 브리핑 소제목", "briefingBody": "400자 이내 시장 브리핑 본문" }',
].join("\n");

export const aiDraftRequestSchema = z.object({
  monthLabel: z.string().trim().min(1, "발행 연·월 정보가 필요합니다.").max(60),
  regionFocus: z.string().trim().max(120).optional(),
  dealTitles: z.array(z.string().trim().max(200)).max(20).optional(),
  currentHeadline: z.string().trim().max(300).optional(),
  currentBriefing: z.string().trim().max(5000).optional(),
});

export const aiDraftResultSchema = z.object({
  headline: z.string().trim().min(1).max(36),
  summary: z.string().trim().min(1).max(80),
  briefingTitle: z.string().trim().min(1).max(30),
  briefingBody: z.string().trim().min(1).max(400),
});

export const aiDraftResponseSchema = z.object({
  ok: z.literal(true),
  result: aiDraftResultSchema,
  warnings: z.array(z.string()).optional(),
});

export type AiDraftRequest = z.infer<typeof aiDraftRequestSchema>;
export type AiDraftResult = z.infer<typeof aiDraftResultSchema>;
export type AiDraftResponse = z.infer<typeof aiDraftResponseSchema>;

function fail(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

function clampText(raw: unknown, maxLen: number): string {
  if (typeof raw !== "string") return "";
  const cleaned = sanitizeInvestmentSolicitation(raw.replace(/\s+/g, " ").trim());
  return cleaned.length > maxLen ? cleaned.slice(0, maxLen).trim() : cleaned;
}

function clampMultilineText(raw: unknown, maxLen: number): string {
  if (typeof raw !== "string") return "";
  const cleaned = sanitizeInvestmentSolicitation(raw.trim());
  return cleaned.length > maxLen ? cleaned.slice(0, maxLen).trim() : cleaned;
}

function extractJsonObject(rawContent: string): Record<string, unknown> | null {
  const trimmed = rawContent.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  try {
    const parsed = JSON.parse(withoutFence);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    const start = withoutFence.indexOf("{");
    const end = withoutFence.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        const parsed = JSON.parse(withoutFence.slice(start, end + 1));
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : null;
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * POST /api/broker/studio/ai-draft
 * 뉴스레터 전체 초안(표지 제목 · 한 줄 소개 · 브리핑 소제목 · 브리핑 본문) 실제 LLM 생성
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

  const parsedReq = aiDraftRequestSchema.safeParse(raw);
  if (!parsedReq.success) {
    return fail(
      400,
      "BAD_REQUEST",
      parsedReq.error.issues[0]?.message ?? "발행 연·월 정보가 필요합니다.",
    );
  }

  const input = parsedReq.data;
  const contextParts = [
    input.monthLabel,
    input.regionFocus ?? "",
    ...(input.dealTitles ?? []),
    input.currentHeadline ?? "",
    input.currentBriefing ?? "",
  ].filter(Boolean);
  const inputContext = contextParts.join(" ");

  const userPromptLines = [
    `발행 호수/시기: ${input.monthLabel}`,
    input.regionFocus ? `중점 권역: ${input.regionFocus}` : "",
    input.dealTitles && input.dealTitles.length > 0
      ? `포함 매물 목록: ${input.dealTitles.join(", ")}`
      : "",
    input.currentHeadline ? `현재 작성 중인 제목: ${input.currentHeadline}` : "",
    input.currentBriefing ? `현재 작성 중인 메모: ${input.currentBriefing}` : "",
  ].filter(Boolean);

  try {
    const llmResult = await callLLM(
      {
        systemPrompt: AI_DRAFT_SYSTEM_PROMPT,
        userPrompt: userPromptLines.join("\n"),
        model: getModel("luna"),
        temperature: 0.4,
        responseFormat: "json_object",
      },
      { allowMock: false },
    );

    if ((llmResult as { isMock?: boolean }).isMock) {
      return fail(502, "LLM_UNAVAILABLE", "AI가 잠시 쉬고 있어요. 잠시 후 다시 눌러 주세요.");
    }

    const content = typeof llmResult.content === "string" ? llmResult.content.trim() : "";
    if (!content) {
      return fail(502, "LLM_EMPTY", "AI가 초안을 만들지 못했어요. 다시 한 번 눌러 주세요.");
    }

    const jsonObj = extractJsonObject(content);
    if (!jsonObj) {
      return fail(502, "LLM_INVALID_JSON", "AI 응답 형식을 읽지 못했어요. 다시 한 번 눌러 주세요.");
    }

    const normalizedCandidate = {
      headline: clampText(jsonObj.headline, 36),
      summary: clampText(jsonObj.summary, 80),
      briefingTitle: clampText(jsonObj.briefingTitle, 30),
      briefingBody: clampMultilineText(jsonObj.briefingBody, 400),
    };

    const validated = aiDraftResultSchema.safeParse(normalizedCandidate);
    if (!validated.success) {
      return fail(502, "LLM_SCHEMA_MISMATCH", "AI 초안 항목이 부족해요. 다시 한 번 눌러 주세요.");
    }

    const combinedOutput = [
      validated.data.headline,
      validated.data.summary,
      validated.data.briefingTitle,
      validated.data.briefingBody,
    ].join(" ");

    const warnings: string[] = [];
    if (findNumbersNotInContext(combinedOutput, inputContext).length > 0) {
      warnings.push(AI_COMMENT_WARNING_INPUT_NOT_IN_CONTEXT);
    }

    const responseBody: AiDraftResponse = {
      ok: true,
      result: validated.data,
      ...(warnings.length > 0 ? { warnings } : {}),
    };

    return NextResponse.json(responseBody);
  } catch (error: unknown) {
    if (error instanceof LLMMockNotAllowedError) {
      log.warn("[studio/ai-draft] Mock 응답 거부:", error.message);
      return fail(502, "LLM_UNAVAILABLE", "AI가 잠시 쉬고 있어요. 잠시 후 다시 눌러 주세요.");
    }
    log.error("[studio/ai-draft] Error:", error);
    return fail(500, "SERVER_ERROR", "AI 초안 작성 중 문제가 생겼어요. 잠시 후 다시 눌러 주세요.");
  }
}
