/**
 * GET /api/broker/im-lite/job-status?jobId=xxx
 *
 * IM 비동기 생성 작업의 상태를 폴링합니다.
 * 
 * 응답:
 * - processing: 아직 생성 중
 * - completed: 완료 → result 에 im_lite_id, url 등 포함
 * - failed: 실패 → result.error 에 에러 메시지
 */
import { NextRequest, NextResponse } from "next/server";
import { requireBroker } from "@/lib/auth-guard";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET(req: NextRequest) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;

  const jobId = req.nextUrl.searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json({ error: "jobId is required" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("im_generation_jobs")
    .select("status, result, created_at, completed_at")
    .eq("id", jobId)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const createdMs = data.created_at ? new Date(data.created_at).getTime() : Date.now();
  const elapsedSeconds = Math.max(0, Math.round((Date.now() - createdMs) / 1000));
  const stageLabel =
    data.status === "completed"
      ? "투자설명서 생성 완료"
      : data.status === "failed"
      ? "생성 실패"
      : elapsedSeconds < 12
      ? "① 건축물대장·토지이용계획·공시지가 조회 중"
      : elapsedSeconds < 28
      ? "② 임대 현황 및 수익률·실거래 시세 계산 중"
      : elapsedSeconds < 55
      ? "③ 9면 투자설명서 해설 문구 작성 중"
      : "④ 도면·차트 배치 및 품질 검수 마무리 중";

  return NextResponse.json({
    jobId,
    status: data.status,
    result: data.result,
    created_at: data.created_at,
    completed_at: data.completed_at,
    elapsed_seconds: elapsedSeconds,
    stage_label: stageLabel,
  });
}
