/**
 * GET /api/agora/threads
 * 아고라 쓰레드 목록 조회 (카테고리/권역 필터)
 *
 * Query params:
 *   category: AgoraCategory (선택)
 *   region:   CRERegion     (선택)
 *   limit:    number        (기본 20)
 *   offset:   number        (기본 0)
 */
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { generateSeedQuestions } from "@/domain/agora/qis-seed-generator";
import { generateAIAnswer } from "@/domain/agora/ai-answer-generator";
import { extractCREEntities } from "@/domain/agora/deal-matcher";

/* ── GET: 목록 조회 ─────────────────────────────────────────────── */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const category = searchParams.get("category") ?? undefined;
  const region   = searchParams.get("region")   ?? undefined;
  const limit    = Math.min(parseInt(searchParams.get("limit")  ?? "20"), 50);
  const offset   = parseInt(searchParams.get("offset") ?? "0");

  const supabase = createServiceClient();

  let query = supabase
    .from("agora_threads")
    .select(`
      id, category, region, title, content,
      author_name, is_seed, tags,
      views, reply_count, is_hot,
      ai_answer, matched_deal_ids,
      market_report_region,
      status, created_at
    `)
    .eq("status", "published")
    .order("is_hot", { ascending: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (category) query = query.eq("category", category);
  if (region)   query = query.or(`region.eq.${region},region.is.null`);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ threads: data ?? [], total: data?.length ?? 0 });
}

/* ── POST: 질문 작성 (인증 필수) ────────────────────────────────── */
export async function POST(req: NextRequest) {
  const supabase = createServiceClient();

  // 인증 검증
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return NextResponse.json(
      { error: "질문 작성은 로그인 후 이용 가능합니다." },
      { status: 401 }
    );
  }

  const body = await req.json() as {
    title: string;
    content: string;
    category: string;
    region?: string;
    tags?: string[];
    authorId?: string;
    authorName?: string;
  };

  if (!body.title?.trim() || !body.content?.trim() || !body.category) {
    return NextResponse.json({ error: "제목, 내용, 카테고리는 필수입니다." }, { status: 400 });
  }

  // 엔티티 추출 → 딜카드 매칭
  const entities = extractCREEntities(`${body.title} ${body.content}`);
  const detectedRegion = entities.regions[0] ?? body.region ?? null;

  // AI 답변 생성
  const aiResult = generateAIAnswer({
    questionTitle:   body.title,
    questionContent: body.content,
    category:        body.category as any,
    region:          detectedRegion as any,
  });

  // Supabase에서 관련 딜카드 조회
  let matchedDealIds: string[] = [];
  if (detectedRegion) {
    const { data: deals } = await supabase
      .from("building_ssot_lite")
      .select("id")
      .ilike("area_signal", `%${detectedRegion}%`)
      .eq("status", "active")
      .limit(3);
    matchedDealIds = (deals ?? []).map((d: { id: string }) => d.id);
  }

  const { data, error } = await supabase
    .from("agora_threads")
    .insert({
      title:                body.title,
      content:              body.content,
      category:             body.category,
      region:               detectedRegion,
      author_id:            body.authorId ?? null,
      author_name:          body.authorName ?? "익명",
      is_seed:              false,
      tags:                 body.tags ?? [],
      ai_answer:            `${aiResult.content}\n\n${aiResult.disclaimer}`,
      matched_deal_ids:     matchedDealIds,
      market_report_region: aiResult.marketReportRegion,
      status:               "published",
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ threadId: data.id }, { status: 201 });
}

/* ── Runtime ─────────────────────────────────────────────────────── */
export const runtime = "nodejs";
export const revalidate = 0;
