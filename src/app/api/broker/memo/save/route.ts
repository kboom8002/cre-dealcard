import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { escapeIlike } from "@/lib/utils/postgrest-escape";
import { createModuleLogger } from '@/lib/logger';

const log = createModuleLogger('route');

export const dynamic = 'force-dynamic';

const SaveMemoSchema = z.object({
  memoText: z.string().min(1, "Memo text is required").max(10000),
  routingType: z.string().max(50).optional().default('general_note'),
  routingSummary: z.string().max(2000).optional().default(''),
});

const GetMemosQuerySchema = z.object({
  q: z.string().max(200).optional().default(''),
  type: z.string().max(50).optional().default(''),
  pinned: z.enum(['true', 'false', '']).optional().default(''),
  status: z.enum(['saved', 'archived', 'converted', 'all']).optional().default('saved'),
});

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = SaveMemoSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message || "Memo text is required" }, { status: 400 });
    }

    const { memoText, routingType, routingSummary } = parsed.data;

    // Try to insert into broker_memos. If table doesn't exist (migrations pending), fallback to activity_events
    const { data: memoData, error: memoError } = await supabase
      .from("broker_memos")
      .insert({
        user_id: user.id,
        memo_text: memoText,
        routing_type: routingType,
        routing_summary: routingSummary,
        status: 'saved'
      })
      .select('id')
      .single();

    if (memoError) {
      log.warn("broker_memos insert failed:", memoError.code, memoError.message);
      try {
        await supabase.from("activity_events").insert({
          actor_id: user.id,
          event_type: "memo_saved",
          metadata: { memoText, routingType, routingSummary },
        });
        return NextResponse.json({ ok: true, data: { fallback: true } });
      } catch (fallbackErr) {
        log.error("activity_events fallback also failed:", fallbackErr);
      }
      return NextResponse.json({ ok: false, error: memoError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data: { memoId: memoData.id } });

  } catch (error) {
    log.error("Memo save API Error:", error);
    return NextResponse.json(
      { ok: false, error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const parsedQuery = GetMemosQuerySchema.safeParse({
      q: url.searchParams.get("q")?.trim() || "",
      type: url.searchParams.get("type") || "",
      pinned: url.searchParams.get("pinned") || "",
      status: url.searchParams.get("status") || "saved",
    });

    if (!parsedQuery.success) {
      return NextResponse.json({ ok: false, error: "Invalid query parameters" }, { status: 400 });
    }

    const { q, type, pinned, status: statusFilter } = parsedQuery.data;

    // Build query
    let query = supabase
      .from("broker_memos")
      .select("id, user_id, memo_text, routing_type, routing_summary, status, is_pinned, tags, converted_to, updated_at, created_at")
      .eq("user_id", user.id);

    // Status filter (default: saved)
    if (statusFilter === "all") {
      // no filter
    } else {
      query = query.eq("status", statusFilter);
    }

    // Type filter
    if (type) {
      query = query.eq("routing_type", type);
    }

    // Pinned filter
    if (pinned === "true") {
      query = query.eq("is_pinned", true);
    }

    // Text search (ILIKE for simplicity)
    if (q) {
      query = query.ilike("memo_text", `%${escapeIlike(q)}%`);
    }

    // Sort: pinned first, then by created_at desc
    query = query
      .order("is_pinned", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    const { data, error } = await query;

    if (error) {
      log.warn("broker_memos select failed:", error.code, error.message);

      // Check if error is about missing columns (is_pinned etc.)
      if (error.message?.includes("is_pinned") || error.message?.includes("updated_at")) {
        // Fallback: query without new columns
        let fallbackQuery = supabase
          .from("broker_memos")
          .select("id, user_id, memo_text, routing_type, routing_summary, status, created_at")
          .eq("user_id", user.id)
          .eq("status", statusFilter || "saved")
          .order("created_at", { ascending: false });

        if (type) fallbackQuery = fallbackQuery.eq("routing_type", type);
        if (q) fallbackQuery = fallbackQuery.ilike("memo_text", `%${escapeIlike(q)}%`);

        const { data: fbData, error: fbError } = await fallbackQuery;
        if (fbError) {
          return NextResponse.json({ ok: false, error: fbError.message }, { status: 500 });
        }

        // Add default values for new columns
        const enriched = (fbData || []).map((m: any) => ({
          ...m,
          updated_at: m.created_at,
          is_pinned: false,
          tags: [],
          converted_to: null,
        }));

        return NextResponse.json({ ok: true, data: enriched });
      }

      // General fallback to activity_events
      const { data: fallbackData } = await supabase
        .from("activity_events")
        .select("id, actor_id, metadata, created_at")
        .eq("actor_id", user.id)
        .eq("event_type", "memo_saved")
        .order("created_at", { ascending: false });

      const mapped = (fallbackData || []).map((evt: any) => ({
        id: evt.id,
        user_id: evt.actor_id,
        memo_text: evt.metadata?.memoText || '',
        routing_type: evt.metadata?.routingType || 'general_note',
        routing_summary: evt.metadata?.routingSummary || '',
        status: 'saved',
        created_at: evt.created_at,
        updated_at: evt.created_at,
        is_pinned: false,
        tags: [],
        converted_to: null,
      }));
      return NextResponse.json({ ok: true, data: mapped });
    }

    return NextResponse.json({ ok: true, data });

  } catch (error) {
    console.error('[memo/save] Error:', error);
    return NextResponse.json(
      { ok: false, error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
