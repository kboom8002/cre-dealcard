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

  return NextResponse.json({
    jobId,
    status: data.status,
    result: data.result,
    created_at: data.created_at,
    completed_at: data.completed_at,
  });
}
