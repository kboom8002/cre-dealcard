import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireBroker } from "@/lib/auth-guard";

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("ai_runs")
    .select("status, output_ref, error, user_id")
    .eq("id", params.id)
    .single();

  if (error || !data) {
    return Response.json({ ok: false, message: "Job not found" }, { status: 404 });
  }

  // P0-SEC SEC-1: ai_runs.user_id 소유자만 조회 가능 (admin 예외). 불일치도 404 로 응답해 존재 여부를 숨긴다.
  const isAdmin = guard.role === "admin";
  if (!isAdmin && (!data.user_id || data.user_id !== guard.user?.id)) {
    return Response.json({ ok: false, message: "Job not found" }, { status: 404 });
  }

  const { user_id: _owner, ...job } = data;
  return Response.json({ ok: true, job });
}
