/**
 * /api/oiticle/generate — 오이티클 생성 (admin/cron/기고)
 *
 * POST: 오이티클 생성 (AI 자동 또는 중개인/벤더 기고)
 * GET:  오이티클 목록 조회
 */
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  generateOiticle,
  generateMonthlyMarketOiticles,
} from "@/domain/pulse/oiticle-generator";
import type { OiticleTypeCode, OiticleAuthorType } from "@/domain/pulse/oiticle-types";

export async function POST(req: NextRequest) {
  const supabase = createServiceClient();

  const body = await req.json() as {
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

  try {
    // 월간 일괄 생성
    if (mode === "monthly_batch") {
      const cronSecret = process.env.CRON_SECRET;
      const authHeader = req.headers.get("authorization");
      if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const results = await generateMonthlyMarketOiticles(supabase);
      return NextResponse.json({
        generated: results.length,
        oiticles: results,
        message: `${results.length}개 월간 시세 분석 오이티클 생성 완료`,
      }, { status: 201 });
    }

    // 중개인/벤더 기고
    if (mode === "contribute") {
      if (!body.type || !body.title || !body.bodyMd || !body.authorId) {
        return NextResponse.json(
          { error: "type, title, bodyMd, authorId는 필수입니다." },
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

    // AI 자동 생성
    if (!body.type) {
      return NextResponse.json({ error: "type은 필수입니다." }, { status: 400 });
    }

    const result = await generateOiticle(supabase, {
      type: body.type,
      topic: body.topic,
      region: body.region,
      dataSnapshot: body.dataSnapshot,
    });

    return NextResponse.json({ oiticle: result }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ oiticles: data ?? [] });
}

export const runtime = "nodejs";
