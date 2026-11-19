/**
 * @file src/app/qa-showcase/questions/route.ts
 * @description 중개인 전달용 확인 질문(8문항) & 추가 질문(6문항) 단독 HTML 뷰어 라우트.
 * 대상 이미지(실물 PPTX 슬라이드·카톡 공유 카드·개편 비교 시안) 및 즉시 서버 피드백 저장 내장.
 */
import { NextRequest, NextResponse } from "next/server";
import { isRealProductionRuntime } from "@/lib/env";
import {
  isPublicQaFlagEnabled,
  resolveQaKeyFromRequest,
} from "@/lib/security/qa-gate";
import { renderStandaloneBrokerQuestionsHtml } from "@/lib/qa/broker-followup-questions";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const enforceGate =
    isRealProductionRuntime() ||
    process.env.CRE_ENFORCE_QA_GATE === "1" ||
    isPublicQaFlagEnabled();

  const { allowed, queryKey } = resolveQaKeyFromRequest(req);
  if (enforceGate && !allowed) {
    return new NextResponse("Not Found", {
      status: 404,
      headers: { "X-Robots-Tag": "noindex, nofollow" },
    });
  }

  const html = renderStandaloneBrokerQuestionsHtml();
  const res = new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store, max-age=0",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });

  if (queryKey) {
    res.cookies.set("cre_qa_key", queryKey, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 12,
    });
  }

  return res;
}
