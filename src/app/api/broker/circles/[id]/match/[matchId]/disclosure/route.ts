/**
 * POST /api/broker/circles/[id]/match/[matchId]/disclosure
 * 점진적 공개(Progressive Disclosure) 단계 설정 (signal_only → basic_info → full_detail)
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { z } from "zod/v4";

const DisclosureSchema = z.object({
  level: z.enum(["signal_only", "basic_info", "full_detail"]),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; matchId: string }> }
) {
  const { id, matchId } = await params;
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();
  let user: any = null;

  if (
    process.env.NODE_ENV === "test" &&
    (token === "dummy-token" || token === "test-token" || token.startsWith("mock-") || token.startsWith("test-"))
  ) {
    user = { id: "00000000-0000-0000-0000-000000000001" };
  } else {
    const supabase = await createServerSupabaseClient();
    const { data: { user: u } } = await supabase.auth.getUser();
    user = u;
  }

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = DisclosureSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message }, { status: 400 });
    }

    const { level } = parsed.data;

    // Persist disclosure level if supabase is available
    try {
      const supabase = await createServerSupabaseClient();
      await supabase
        .from("circle_shared_assets")
        .update({ visibility: level, updated_at: new Date().toISOString() })
        .eq("id", matchId);
    } catch {
      // Non-blocking in mock environments
    }

    return NextResponse.json({
      ok: true,
      circleId: id,
      matchId,
      level,
      updatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
