import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";

const llm: { result: { content: string; isMock?: boolean } | Error } = {
  result: { content: "" },
};

vi.mock("@/lib/auth-guard", () => ({
  requireBroker: async () => ({ error: null, user: { id: "u1" } }),
}));
vi.mock("@/ai/model-selector", () => ({ getModel: () => "test-model" }));
vi.mock("@/lib/logger", () => ({
  createModuleLogger: () => ({ warn() {}, error() {}, info() {}, debug() {} }),
}));
vi.mock("@/ai/llm-client", () => {
  class LLMMockNotAllowedError extends Error {}
  return {
    LLMMockNotAllowedError,
    callLLM: async () => {
      if (llm.result instanceof Error) throw llm.result;
      return llm.result;
    },
  };
});

import { POST as postAiComment } from "@/app/api/broker/studio/ai-comment/route";
import {
  POST as postAiDraft,
  AI_DRAFT_SYSTEM_PROMPT,
  aiDraftRequestSchema,
  aiDraftResultSchema,
  sanitizeInvestmentSolicitation,
} from "@/app/api/broker/studio/ai-draft/route";
import {
  AI_COMMENT_SYSTEM_PROMPT,
  AI_COMMENT_WARNING_INPUT_NOT_IN_CONTEXT,
  aiCommentRequestSchema,
  aiCommentResponseSchema,
  findNumbersNotInContext,
} from "@/lib/magazine/ai-comment-schema";

function makeCommentReq(body: unknown) {
  return new NextRequest("http://localhost/api/broker/studio/ai-comment", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function makeDraftReq(body: unknown) {
  return new NextRequest("http://localhost/api/broker/studio/ai-draft", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("ai-comment 스키마 및 라우트 계약", () => {
  it("{comment} 와 구 {context} 별칭을 모두 받는다", () => {
    expect(aiCommentRequestSchema.safeParse({ comment: " 안녕 " })).toMatchObject({
      success: true,
      data: { comment: "안녕" },
    });
    expect(aiCommentRequestSchema.safeParse({ context: "별칭" })).toMatchObject({
      success: true,
      data: { comment: "별칭" },
    });
    expect(aiCommentRequestSchema.safeParse({ comment: "   " }).success).toBe(false);
  });

  it("응답 스키마: result.comment 필수 및 시스템 프롬프트 안전성", () => {
    expect(
      aiCommentResponseSchema.safeParse({ ok: true, result: { comment: "x" } }).success,
    ).toBe(true);
    expect(AI_COMMENT_SYSTEM_PROMPT).not.toContain("지어내");
    const commentSrc = fs.readFileSync(
      path.resolve(process.cwd(), "src/app/api/broker/studio/ai-comment/route.ts"),
      "utf-8",
    );
    expect(commentSrc).not.toContain("지어내");
  });

  it("입력에 없는 숫자를 찾고 warnings 로 반환하며 Mock 응답은 502로 거부한다", async () => {
    expect(findNumbersNotInContext("매수 문의가 30% 늘었습니다", "매수 문의가 늘어남")).toEqual([
      "30",
    ]);

    llm.result = { content: "모의 응답", isMock: true };
    const mockRes = await postAiComment(makeCommentReq({ comment: "금리 인하 기대" }));
    expect(mockRes.status).toBe(502);

    llm.result = { content: "최근 매수 문의가 40% 늘었습니다." };
    const okRes = await postAiComment(makeCommentReq({ comment: "매수 문의가 늘어남" }));
    expect(okRes.status).toBe(200);
    const json = await okRes.json();
    expect(json.ok).toBe(true);
    expect(json.warnings).toEqual([AI_COMMENT_WARNING_INPUT_NOT_IN_CONTEXT]);
  });
});

describe("ai-draft 스키마 및 라우트 계약 (NL-02, 요구사항 4)", () => {
  it("입력 스키마(monthLabel 필수) 및 출력 스키마(headline<=36, summary<=80, briefingTitle<=30, briefingBody<=400)를 검증한다", () => {
    expect(
      aiDraftRequestSchema.safeParse({
        monthLabel: "2026년 11월호",
        regionFocus: "강남·서초",
        dealTitles: ["역삼동 코너 빌딩"],
      }).success,
    ).toBe(true);
    expect(aiDraftRequestSchema.safeParse({ monthLabel: "   " }).success).toBe(false);

    expect(
      aiDraftResultSchema.safeParse({
        headline: "11월 강남권 중소형 빌딩 매수 흐름",
        summary: "이번 달 강남·서초 권역의 법인 사옥 수요와 추천 매물을 정리했습니다.",
        briefingTitle: "이달의 강남권 시장 브리핑",
        briefingBody: "강남·서초 권역을 중심으로 실수요 법인의 사옥 매입 문의가 꾸준히 이어지고 있습니다.",
      }).success,
    ).toBe(true);

    expect(AI_DRAFT_SYSTEM_PROMPT).not.toContain("지어내");
  });

  it("Mock 응답은 502 LLM_UNAVAILABLE 로 거부한다", async () => {
    llm.result = {
      content: JSON.stringify({
        headline: "11월 강남권 빌딩 브리핑",
        summary: "요약입니다.",
        briefingTitle: "시장 브리핑",
        briefingBody: "본문입니다.",
      }),
      isMock: true,
    };
    const res = await postAiDraft(makeDraftReq({ monthLabel: "2026년 11월호" }));
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("LLM_UNAVAILABLE");
  });

  it("정상 JSON 응답을 파싱하고, 투자 권유 단정 표현을 정화하며, 입력에 없는 숫자를 warnings 로 감지한다", async () => {
    expect(sanitizeInvestmentSolicitation("원금 보장 및 무조건 상승 매물")).not.toContain(
      "원금 보장",
    );
    expect(sanitizeInvestmentSolicitation("원금 보장 및 무조건 상승 매물")).not.toContain(
      "무조건 상승",
    );

    llm.result = {
      content: JSON.stringify({
        headline: "11월 강남·서초 중소형 빌딩 시장 동향",
        summary: "역삼동 사옥 수요와 이번 달 추천 매물을 한눈에 정리해 드립니다.",
        briefingTitle: "이달의 현장 브리핑",
        briefingBody:
          "강남·서초 권역에서 수익률 7.5% 매물에 대한 원금 보장 문의가 이어지고 있습니다.",
      }),
    };

    const res = await postAiDraft(
      makeDraftReq({
        monthLabel: "2026년 11월호",
        regionFocus: "강남·서초",
        dealTitles: ["역삼동 코너 빌딩"],
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.result.headline.length).toBeLessThanOrEqual(36);
    expect(json.result.summary.length).toBeLessThanOrEqual(80);
    expect(json.result.briefingTitle.length).toBeLessThanOrEqual(30);
    expect(json.result.briefingBody.length).toBeLessThanOrEqual(400);
    expect(json.result.briefingBody).not.toContain("원금 보장");
    // 7.5%는 입력 컨텍스트에 없었으므로 경고 포함
    expect(json.warnings).toEqual([AI_COMMENT_WARNING_INPUT_NOT_IN_CONTEXT]);
  });
});
