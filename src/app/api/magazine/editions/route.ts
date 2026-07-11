import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { generateWeeklyMagazine } from "@/domain/magazine/weekly-generator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** ISO week label, e.g. "W28-2026" */
function currentWeekLabel(): string {
  const now = new Date();
  const jan1 = new Date(now.getFullYear(), 0, 1);
  const dayOfYear =
    Math.floor((now.getTime() - jan1.getTime()) / 86_400_000) + 1;
  const weekNum = Math.ceil(dayOfYear / 7);
  return `W${String(weekNum).padStart(2, "0")}-${now.getFullYear()}`;
}

// ---------------------------------------------------------------------------
// GET /api/magazine/editions
// Query params: broker_id (required), type, status, limit
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const brokerId = searchParams.get("broker_id");

  if (!brokerId) {
    return NextResponse.json(
      { error: "broker_id 파라미터가 필요합니다." },
      { status: 400 },
    );
  }

  const editionType = searchParams.get("type") ?? "weekly";
  const status = searchParams.get("status");
  const limit = Math.min(Number(searchParams.get("limit") ?? 10), 50);

  const supabase = createServiceClient();

  let query = supabase
    .from("magazine_editions")
    .select("*", { count: "exact" })
    .eq("broker_id", brokerId)
    .eq("edition_type", editionType)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status) {
    query = query.eq("status", status);
  }

  const { data, count, error } = await query;

  if (error) {
    console.error("[api/magazine/editions/GET]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ editions: data ?? [], total: count ?? 0 });
}

// ---------------------------------------------------------------------------
// POST /api/magazine/editions
// Body: { edition_type, edition_label?, broker_id? }
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    // Auth check
    const supabaseAuth = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "로그인이 필요합니다." },
        { status: 401 },
      );
    }

    const body = await request.json();
    const editionType: string = body.edition_type ?? "weekly";
    const editionLabel: string = body.edition_label ?? currentWeekLabel();
    const brokerId: string = body.broker_id ?? user.id;

    const supabase = createServiceClient();

    // Generate magazine content via domain generator
    const edition = await generateWeeklyMagazine({
      supabase,
      brokerId,
      editionType,
      editionLabel,
    });

    return NextResponse.json({ edition }, { status: 201 });
  } catch (err: unknown) {
    console.error("[api/magazine/editions/POST]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "서버 오류" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/magazine/editions
// Body: { id, ...updates }
// ---------------------------------------------------------------------------

const ALLOWED_UPDATE_FIELDS = [
  "title",
  "field_note",
  "theme_title",
  "theme_body_md",
  "content",
  "status",
  "market_temp",
  "cover_keywords",
  "featured_deal_ids",
  "cover_image_url",
  "theme_color",
] as const;

export async function PATCH(request: NextRequest) {
  try {
    // Auth check
    const supabaseAuth = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "로그인이 필요합니다." },
        { status: 401 },
      );
    }

    const body = await request.json();
    const { id, ...rest } = body as Record<string, unknown>;

    if (!id || typeof id !== "string") {
      return NextResponse.json(
        { error: "id 필드가 필요합니다." },
        { status: 400 },
      );
    }

    // Pick only allowed fields
    const updates: Record<string, unknown> = {};
    for (const key of ALLOWED_UPDATE_FIELDS) {
      if (key in rest) {
        updates[key] = rest[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "업데이트할 필드가 없습니다." },
        { status: 400 },
      );
    }

    // Auto-set published_at when status changes to "published"
    if (updates.status === "published") {
      updates.published_at = new Date().toISOString();
    }

    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from("magazine_editions")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("[api/magazine/editions/PATCH]", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ edition: data });
  } catch (err: unknown) {
    console.error("[api/magazine/editions/PATCH]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "서버 오류" },
      { status: 500 },
    );
  }
}
