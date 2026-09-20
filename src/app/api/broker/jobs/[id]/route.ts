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
    .select("status, output_ref, error")
    .eq("id", params.id)
    .single();

  if (error || !data) {
    return Response.json({ ok: false, message: "Job not found" }, { status: 404 });
  }

  return Response.json({ ok: true, job: data });
}
