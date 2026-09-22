/**
 * POST /api/broker/ideal-buyer-persona
 *
 * 매물 SSoT Lite를 바탕으로 이상적 매수자 페르소나 3명을 AI가 도출합니다.
 * 브로커가 딜카드 생성 후 "이 매물은 누가 사야 할까?"를 즉시 확인할 수 있습니다.
 */
import { NextRequest, NextResponse, after } from "next/server";
import { runIdealBuyerPersona } from "@/ai/agents/ideal-buyer-persona";
import { z } from "zod/v4";
import { requireBroker } from "@/lib/auth-guard";
import { createServiceClient } from "@/lib/supabase/service";

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('route');


const RequestSchema = z.object({
  dealId: z.string().optional(),
  areaSignal: z.string().default("미확인"),
  assetType: z.string().default("미확인"),
  investmentPosture: z.string().optional(),
  buildingUse: z.string().optional(),
  priceBand: z.string().default("미확인"),
  sizeSignal: z.string().default("미확인"),
  vacancyStatus: z.string().optional(),
  currentUseSignal: z.string().optional(),
  rawInput: z.string().optional(),
  fitSummary: z.string().optional(),
  cautionSummary: z.string().optional(),
  curiosityScore: z.number().optional(),
  completionYear: z.string().optional(),
  keyFeatures: z.string().optional(),
  isAsync: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  // Auth guard — 미인증 요청 차단
  const auth = await requireBroker(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json().catch(() => ({}));

    let input;
    try {
      input = RequestSchema.parse(body);
    } catch (validationError) {
      log.error("[IdealBuyerPersona] Input validation error:", validationError);
      return NextResponse.json(
        { success: false, error: "매물 정보가 부족합니다. 딜카드를 먼저 생성해주세요." },
        { status: 400 },
      );
    }

    if (input.isAsync) {
      const jobId = crypto.randomUUID();
      const supabaseAdmin = createServiceClient();

      await supabaseAdmin.from("ai_runs").insert({
        id: jobId,
        user_id: auth.user!.id,
        run_type: "ideal_buyer_persona_async",
        input_ref: input,
        status: "started",
      });

      after(async () => {
        try {
          let asyncResult;
          try {
            asyncResult = await runIdealBuyerPersona(input);
          } catch (err) {
            console.error('[IdealBuyerPersona] Generation failed:', err);
            return NextResponse.json(
              { ok: false, error: '매수자 페르소나 생성에 실패했습니다.' },
              { status: 500 }
            );
          }

          const asyncPersonas = asyncResult.output?.personas;

          await supabaseAdmin.from("ai_runs").update({
            status: "completed",
            output_ref: {
              ...asyncResult.output,
              personas: asyncPersonas,
            },
          }).eq("id", jobId);
        } catch (asyncErr: any) {
          log.error("[IdealBuyerPersona] Async generation error:", asyncErr);
          await supabaseAdmin.from("ai_runs").update({
            status: "failed",
            error: asyncErr.message || "Unknown error",
          }).eq("id", jobId);
        }
      });

      return NextResponse.json({
        ok: true,
        success: true,
        isAsync: true,
        jobId,
      });
    }

    let result;
    try {
      result = await runIdealBuyerPersona(input);
    } catch (err) {
      console.error('[IdealBuyerPersona] Generation failed:', err);
      return NextResponse.json(
        { ok: false, error: '매수자 페르소나 생성에 실패했습니다.' },
        { status: 500 }
      );
    }

    const personas = result.output?.personas;

    return NextResponse.json({
      ok: true,
      success: true,
      personas,
      data: { ...result.output, personas },
      meta: {
        model: result.model,
        promptVersion: result.promptVersion,
        tokens: result.tokens,
      },
    });
  } catch (error) {
    log.error("[IdealBuyerPersona] Error:", error);

    const message = error instanceof Error ? error.message : "AI 페르소나 생성 중 오류가 발생했습니다.";

    return NextResponse.json(
      { success: false, error: `AI 응답 처리 실패: ${message}` },
      { status: 500 },
    );
  }
}
