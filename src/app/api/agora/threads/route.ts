/**
 * GET  /api/agora/threads — 아고라 쓰레드 목록 조회 (카테고리/권역 필터)
 * POST /api/agora/threads — 질문 작성 (세션 인증 필수, author_id 강제 바인딩)
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { generateAIAnswer } from "@/domain/agora/ai-answer-generator";
import { extractCREEntities } from "@/domain/agora/deal-matcher";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("agora-threads-route");

async function authenticateSessionUser(): Promise<{ id: string; email?: string } | null> {
  try {
    const authClient = await createServerSupabaseClient();
    const { data, error } = await authClient.auth.getUser();
    if (error || !data?.user?.id) return null;
    return { id: data.user.id, email: data.user.email };
  } catch {
    return null;
  }
}

/* ── GET: 목록 조회 ─────────────────────────────────────────────── */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const category = searchParams.get("category") ?? undefined;
    const region = searchParams.get("region") ?? undefined;
    const parsedLimit = Number.parseInt(searchParams.get("limit") ?? "20", 10);
    const parsedOffset = Number.parseInt(searchParams.get("offset") ?? "0", 10);
    const limit = Math.min(Math.max(Number.isFinite(parsedLimit) ? parsedLimit : 20, 1), 50);
    const offset = Math.max(Number.isFinite(parsedOffset) ? parsedOffset : 0, 0);

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
    if (region) {
      const safeRegion = region.replace(/[,()"\\]/g, "");
      if (safeRegion) {
        query = query.or(`region.eq.${safeRegion},region.is.null`);
      }
    }

    const { data, error } = await query;

    if (error) {
      log.error("[agora-threads] GET error:", error.message);
      return NextResponse.json(
        { error: "질문 목록을 불러오지 못했습니다." },
        { status: 500 },
      );
    }

    return NextResponse.json({ threads: data ?? [], total: data?.length ?? 0 });
  } catch (err) {
    log.error(
      "[agora-threads] GET unexpected error:",
      err instanceof Error ? err.message : String(err),
    );
    return NextResponse.json(
      { error: "질문 목록을 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}

/* ── POST: 질문 작성 (인증 필수) ────────────────────────────────── */
const postSchema = z.object({
  title: z.string().trim().min(1, "제목은 필수입니다.").max(200),
  content: z.string().trim().min(1, "내용은 필수입니다.").max(5000),
  category: z.string().min(1, "카테고리는 필수입니다.").max(64),
  region: z.string().max(64).optional(),
  tags: z.array(z.string().max(40)).max(15).optional(),
  authorId: z.string().optional(),
  authorName: z.string().trim().max(50).optional(),
});

export async function POST(req: NextRequest) {
  const user = await authenticateSessionUser();
  if (!user) {
    return NextResponse.json(
      { error: "질문 작성은 로그인 후 이용 가능합니다." },
      { status: 401 },
    );
  }

  let body: z.infer<typeof postSchema>;
  try {
    const raw = await req.json();
    body = postSchema.parse(raw);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: "제목, 내용, 카테고리는 필수입니다." },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  try {
    const supabase = createServiceClient();

    // 엔티티 추출 → 딜카드 매칭
    const entities = extractCREEntities(`${body.title} ${body.content}`);
    const detectedRegion = entities.regions[0] ?? body.region ?? null;

    // AI 답변 생성
    const aiResult = generateAIAnswer({
      questionTitle: body.title,
      questionContent: body.content,
      category: body.category as Parameters<typeof generateAIAnswer>[0]["category"],
      region: detectedRegion as Parameters<typeof generateAIAnswer>[0]["region"],
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
        title: body.title,
        content: body.content,
        category: body.category,
        region: detectedRegion,
        author_id: user.id, // 세션 사용자 ID 강제 귀속 (body.authorId 불신)
        author_name: body.authorName || "익명",
        is_seed: false,
        tags: body.tags ?? [],
        ai_answer: `${aiResult.content}\n\n${aiResult.disclaimer}`,
        matched_deal_ids: matchedDealIds,
        market_report_region: aiResult.marketReportRegion,
        status: "published",
      })
      .select("id")
      .single();

    if (error || !data) {
      log.error("[agora-threads] insert error:", error?.message ?? "no row returned");
      return NextResponse.json(
        { error: "질문 등록에 실패했습니다." },
        { status: 500 },
      );
    }

    return NextResponse.json({ threadId: data.id }, { status: 201 });
  } catch (err) {
    log.error(
      "[agora-threads] POST unexpected error:",
      err instanceof Error ? err.message : String(err),
    );
    return NextResponse.json(
      { error: "질문 등록에 실패했습니다." },
      { status: 500 },
    );
  }
}

/* ── Runtime ─────────────────────────────────────────────────────── */
export const runtime = "nodejs";
export const revalidate = 0;
