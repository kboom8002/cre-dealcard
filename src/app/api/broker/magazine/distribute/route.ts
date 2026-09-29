import { NextRequest, NextResponse } from "next/server";
import { requireBroker } from "@/lib/auth-guard";
import { createServiceClient } from "@/lib/supabase/service";
import { distributeMagazine } from "@/domain/magazine/distribute-magazine";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("api-broker-magazine-distribute");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const guard = await requireBroker(req);
    if (guard.error || !guard.user) {
      return guard.error ?? NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }
    const { user } = guard;

    const body = await req.json();
    const { editionId, title, headline, market_temp, date } = body;

    const supabase = createServiceClient();

    // 1. 브로커 프로필 조회
    const { data: bp, error: bpError } = await supabase
      .from("broker_profiles")
      .select("slug, name")
      .eq("user_id", user.id)
      .maybeSingle();

    if (bpError || !bp?.slug) {
      return NextResponse.json(
        { error: "브로커 프로필을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    const issueDate = date || new Date().toISOString().slice(0, 10);

    // 2. 매거진 배포 실행 (Free는 이메일만, Pro/Premium은 알림톡+이메일)
    const distributionResult = await distributeMagazine(supabase, bp.slug, {
      id: editionId,
      title: title || `${issueDate} 주간 리포트`,
      headline: headline || "이번 주 상업용 부동산 시장 핵심 분석 리포트입니다.",
      market_temp: market_temp || "관망",
      date: issueDate,
    });

    log.info(`[api/broker/magazine/distribute] Completed for broker ${bp.slug}`, distributionResult);

    return NextResponse.json({
      success: true,
      result: distributionResult,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "배포 중 오류가 발생했습니다.";
    log.error("[api/broker/magazine/distribute] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
