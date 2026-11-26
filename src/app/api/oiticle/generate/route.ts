import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireRole, requireBroker } from "@/lib/auth-guard";
import { verifyCronRequest } from "@/lib/security/cron-auth";
import {
  generateOiticle,
  generateMonthlyMarketOiticles,
} from "@/domain/pulse/oiticle-generator";
import type { OiticleTypeCode, OiticleAuthorType } from "@/domain/pulse/oiticle-types";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("oiticle-generate-route");

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const supabase = createServiceClient();

  try {
    const body = (await req.json().catch(() => ({}))) as {
      // AI 자동 생성
      mode?: "auto" | "contribute" | "monthly_batch";
      type?: OiticleTypeCode;
      topic?: string;
      region?: string;
      dataSnapshot?: Record<string, unknown>;

      // 중개인/벤더 기고
      authorType?: OiticleAuthorType;
      authorId?: string;
      authorName?: string;
      title?: string;
      bodyMd?: string;
    };

    const mode = body.mode ?? "auto";

    // 월간 일괄 생성 (CRON)
    if (mode === "monthly_batch") {
      const cronErr = verifyCronRequest(req);
      if (cronErr) return cronErr;

      const results = await generateMonthlyMarketOiticles(supabase);
      return NextResponse.json({
        generated: results.length,
        oiticles: results,
        message: `${results.length}건 월간 상세 분석 오이티클 생성 완료`,
      }, { status: 201 });
    }

    // 중개인/벤더 기고
    if (mode === "contribute") {
      const guard = await requireBroker(req);
      if (guard.error) return guard.error;

      if (!body.type || !body.title || !body.bodyMd || !body.authorId) {
        return NextResponse.json(
          { error: "type, title, bodyMd, authorId는 필수입니다" },
          { status: 400 },
        );
      }

      const result = await generateOiticle(supabase, {
        type: body.type,
        region: body.region,
        authorType: body.authorType ?? "broker",
        authorId: body.authorId,
        authorName: body.authorName ?? "전문가",
        manualTitle: body.title,
        manualBody: body.bodyMd,
      });

      return NextResponse.json({
        oiticle: result,
        message: "기고가 접수되었습니다. 검토 후 게시됩니다.",
      }, { status: 201 });
    }

    // AI 자동 생성 (관리자 전용)
    const guard = await requireRole(req, ["admin"]);
    if (guard.error) return guard.error;

    if (!body.type) {
      return NextResponse.json({ error: "type은 필수입니다" }, { status: 400 });
    }

    const result = await generateOiticle(supabase, {
      type: body.type,
      topic: body.topic,
      region: body.region,
      dataSnapshot: body.dataSnapshot,
    });

    return NextResponse.json({ oiticle: result }, { status: 201 });
  } catch (e: unknown) {
    log.error({ err: e }, "[oiticle/generate] POST error");
    return NextResponse.json(
      { error: "오이티클 생성 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const type = searchParams.get("type");
  const region = searchParams.get("region");
  const tag = searchParams.get("tag");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 50);

  const supabase = createServiceClient();

  let query = supabase
    .from("cre_oiticles")
    .select(`
      id, oiticle_type, title, slug, excerpt,
      cover_image, author_type, author_name,
      regions, tags, views, likes,
      published_at, created_at
    `)
    .eq("status", "published")
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (type)   query = query.eq("oiticle_type", type);
  if (region) query = query.contains("regions", [region]);
  if (tag)    query = query.contains("tags", [tag]);

  const { data, error } = await query;

  if (error) {
    log.error({ err: error }, "[oiticle/generate] GET error");
    return NextResponse.json(
      { error: "오이티클 목록 조회 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }

  return NextResponse.json({ oiticles: data ?? [] });
}
