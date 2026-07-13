/**
 * POST /api/broker/im-lite/generate-async
 * 
 * IM 생성을 시작합니다.
 * - maxDuration=60으로 설정하여 Hobby 플랜 10초 제한 초과 허용 시도
 * - 작업 완료 후 결과를 DB에 저장하고 응답 반환
 * - 클라이언트는 폴링으로 결과를 확인
 * 
 * 전략: 응답을 빠르게 보내고 after()로 백그라운드 실행을 시도하되,
 * after()가 지원되지 않으면 동기 실행 후 응답
 */
import { NextRequest, NextResponse } from "next/server";
import { requireBroker } from "@/lib/auth-guard";
import { createServiceClient } from "@/lib/supabase/service";
import type { MobileIMSupplementalInput } from "@/domain/building/mobile-im/types";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;
  const { user } = guard;

  let buildingId: string;
  let supplemental: MobileIMSupplementalInput;
  let skipApproval = false;
  let directData: Record<string, unknown> | null = null;

  try {
    const body = await req.json();
    buildingId = body.building_id;
    skipApproval = body.skip_approval === true;
    directData = body.direct_data ?? null;
    supplemental = {
      monthly_rent_total_krw: body.monthly_rent_total_krw,
      vacancy_status: body.vacancy_status,
      vacancy_pct: body.vacancy_pct,
      resolved_address: body.resolved_address,
      resolved_pnu: body.resolved_pnu,
      photo_urls: body.photo_urls,
      photo_captions: body.photo_captions,
      broker_highlight: body.broker_highlight,
      estimated_yield_pct: body.estimated_yield_pct,
      total_deposit_manwon: body.total_deposit_manwon,
      mgmt_fee_total_manwon: body.mgmt_fee_total_manwon,
      loan_amount_manwon: body.loan_amount_manwon,
      asking_price_manwon: body.asking_price_manwon,
      floor_leases: body.floor_leases,
      logistics: body.logistics,
    };

    if (!buildingId) {
      return NextResponse.json({ error: "building_id is required" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // ── 작업 ID 생성 + DB 레코드 삽입 ──
  const jobId = `im_${buildingId}_${Date.now()}`;
  const supabase = createServiceClient();

  await supabase.from("im_generation_jobs").upsert({
    id: jobId,
    building_id: buildingId,
    user_id: user!.id,
    status: "processing",
    input_payload: { supplemental, skipApproval, directData },
    created_at: new Date().toISOString(),
  });

  // ── IM 생성 실행 (동기) ──
  // Vercel Hobby에서는 after()가 작동하지 않으므로 동기 실행
  // maxDuration=60으로 충분한 시간 확보
  try {
    const { generateMobileIMHandler } = await import("../generate/handler");
    const result = await generateMobileIMHandler({
      buildingId,
      userId: user!.id,
      supplemental,
      skipApproval,
      directData,
    });

    if (result.ok) {
      await supabase.from("im_generation_jobs").update({
        status: "completed",
        result: {
          im_lite_id: result.im_lite_id,
          url: result.url,
          readiness_score: result.readiness_score,
          ai_used: result.ai_used,
          sections_count: result.sections_count,
          external_data_loaded: result.external_data_loaded,
          message: result.message,
        },
        completed_at: new Date().toISOString(),
      }).eq("id", jobId);
    } else {
      await supabase.from("im_generation_jobs").update({
        status: "failed",
        result: {
          error: result.error,
          score: result.score,
          threshold: result.threshold,
          missing: result.missing,
        },
        completed_at: new Date().toISOString(),
      }).eq("id", jobId);
    }
  } catch (err: any) {
    console.error("[im-generate-async] Error:", err);
    await supabase.from("im_generation_jobs").update({
      status: "failed",
      result: { error: err?.message ?? "Unknown error" },
      completed_at: new Date().toISOString(),
    }).eq("id", jobId);
  }

  // 완료 후 최종 상태 조회하여 반환
  const { data: finalJob } = await supabase
    .from("im_generation_jobs")
    .select("status, result")
    .eq("id", jobId)
    .single();

  return NextResponse.json({
    jobId,
    status: finalJob?.status ?? "completed",
    result: finalJob?.result ?? null,
  });
}
