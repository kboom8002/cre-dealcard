import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod/v4";
import { requireBroker } from "@/lib/auth-guard";
import { getWeekLabel } from "@/domain/pulse/cre-signal-aggregator";

const VoteSchema = z.object({
  region: z.enum(["gbd", "ybd", "cbd", "seongsu", "pangyo", "mapo", "jongno", "hongdae"]),
  q_transaction: z.number().min(1).max(5),
  q_lease: z.number().min(1).max(5),
  q_outlook: z.number().min(1).max(5),
  comment: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;
  const { user } = guard;

  try {
    const json = await req.json();
    const parsed = VoteSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { region, q_transaction, q_lease, q_outlook, comment } = parsed.data;
    const periodLabel = getWeekLabel();

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    // Upsert vote for user_id + region + period_label
    const { data, error } = await supabase
      .from("broker_sentiment_votes")
      .upsert({
        user_id: user!.id,
        region,
        period_label: periodLabel,
        q_transaction,
        q_lease,
        q_outlook,
        comment: comment || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id, region, period_label" })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
