import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { memoText, routingType, routingSummary } = await req.json();

    if (!memoText) {
      return NextResponse.json({ ok: false, error: "Memo text is required" }, { status: 400 });
    }

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
      if (memoError.code === '42P01') { // table does not exist
         await supabase.from("activity_events").insert({
           actor_id: user.id,
           event_type: "memo_saved",
           metadata: { memoText, routingType, routingSummary },
         });
         return NextResponse.json({ ok: true, data: { fallback: true } });
      }
      console.error("broker_memos insert error:", memoError);
      return NextResponse.json({ ok: false, error: memoError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data: { memoId: memoData.id } });

  } catch (error) {
    console.error("Memo save API Error:", error);
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

    const { data, error } = await supabase
      .from("broker_memos")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "saved")
      .order("created_at", { ascending: false });

    if (error) {
      if (error.code === '42P01') {
         // Fallback query from activity_events
         const { data: fallbackData } = await supabase
            .from("activity_events")
            .select("*")
            .eq("actor_id", user.id)
            .eq("event_type", "memo_saved")
            .order("created_at", { ascending: false });
         
         const mapped = (fallbackData || []).map(evt => ({
            id: evt.id,
            user_id: evt.actor_id,
            memo_text: evt.metadata.memoText,
            routing_type: evt.metadata.routingType,
            routing_summary: evt.metadata.routingSummary,
            created_at: evt.created_at
         }));
         return NextResponse.json({ ok: true, data: mapped });
      }
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data });

  } catch (error) {
    return NextResponse.json(
      { ok: false, error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
