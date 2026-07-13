/**
 * POST /api/broker/im-lite/generate-async
 * 
 * IM 생성을 비동기로 시작합니다.
 * 1. 즉시 { jobId } 반환 (< 1초)
 * 2. 백그라운드에서 IM 생성 → DB에 결과 저장
 * 3. 클라이언트는 GET /api/broker/im-lite/job-status?jobId=xxx 로 폴링
 */
import { NextRequest, NextResponse, after } from "next/server";
import { requireBroker } from "@/lib/auth-guard";
import { createServiceClient } from "@/lib/supabase/service";
import type { MobileIMSupplementalInput } from "@/domain/building/mobile-im/types";

export const maxDuration = 60; // 백그라운드 작업이 완료될 시간 확보

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

  // ── Next.js after() — 응답 반환 후 백그라운드에서 IM 생성 ──
  after(async () => {
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
      console.error("[im-generate-async] Background error:", err);
      await supabase.from("im_generation_jobs").update({
        status: "failed",
        result: { error: err?.message ?? "Unknown error" },
        completed_at: new Date().toISOString(),
      }).eq("id", jobId);
    }
  });

  return NextResponse.json({ jobId, status: "processing" });
}
