import { NextRequest, NextResponse } from "next/server";
import { requireBroker } from "@/lib/auth-guard";
import { checkRateLimit } from "@/lib/rate-limiter";
import { getClientIp } from "@/lib/magazine/public-guard";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("route");

export async function GET(request: NextRequest) {
  const guard = await requireBroker(request);
  if (guard.error) return guard.error;
  const user = guard.user!;

  const ip = getClientIp(request) ?? user.id;
  const allowed = await checkRateLimit(ip, "funding_list_fallback", 30, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { ok: false, error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
      { status: 429 },
    );
  }

  try {
    const supabase = await createServerSupabaseClient();
    const { data: projects, error } = await supabase
      .from("funding_projects")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      data: projects || [],
    });
  } catch (error: unknown) {
    log.error("[GET /api/funding/project/list-fallback]", error);
    return NextResponse.json(
      { ok: false, error: "펀딩 프로젝트 목록 조회에 실패했습니다." },
      { status: 500 },
    );
  }
}
