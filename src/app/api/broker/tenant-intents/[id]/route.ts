/**
 * GET /api/broker/tenant-intents/[id] — 임차인 의향서 상세 및 매칭 결과 조회
 * PUT /api/broker/tenant-intents/[id] — 임차인 의향서 수정
 * DELETE /api/broker/tenant-intents/[id] — 임차인 의향서 삭제
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod/v4";
import { requireBroker } from "@/lib/auth-guard";
import { runTenantAutoMatcher } from "@/domain/matching/lease-auto-matcher";

const UpdateTenantIntentSchema = z.object({
  client_id: z.string().uuid().nullable().optional(),
  business_type: z.string().optional(),
  preferred_regions: z.array(z.string()).optional(),
  area_min: z.number().nullable().optional(),
  area_max: z.number().nullable().optional(),
  budget_deposit_max: z.number().nullable().optional(),
  budget_monthly_max: z.number().nullable().optional(),
  preferred_floors: z.array(z.string()).optional(),
  move_in_target: z.string().nullable().optional(),
  must_have: z.array(z.string()).optional(),
  nice_to_have: z.array(z.string()).optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireBroker(req);
  if (auth.error) return auth.error;

  const { id } = await params;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  // 1. Fetch intent
  const { data: intent, error: intentErr } = await supabase
    .from("tenant_intent")
    .select(`
      *,
      client:client_id (
        id,
        display_name,
        company,
        phone,
        email
      )
    `)
    .eq("id", id)
    .eq("broker_id", auth.user!.id)
    .single();

  if (intentErr || !intent) {
    return NextResponse.json({ error: "임차 요구조건을 찾을 수 없습니다." }, { status: 404 });
  }

  // 2. Fetch matched lease spaces
  const { data: matches } = await supabase
    .from("lease_match_results")
    .select(`
      grade,
      score,
      reasoning,
      space:lease_space_id (
        id,
        floor,
        area_sqm,
        space_type,
        deposit,
        monthly_rent,
        maintenance_fee,
        incentives,
        building:building_id (
          area_signal,
          fit_summary
        )
      )
    `)
    .eq("tenant_intent_id", id)
    .order("score", { ascending: false });

  return NextResponse.json({
    data: {
      intent,
      matches: matches ?? [],
    },
  });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireBroker(req);
  if (auth.error) return auth.error;

  const { id } = await params;
  const json = await req.json();
  const parsed = UpdateTenantIntentSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: updated, error } = await supabase
    .from("tenant_intent")
    .update(parsed.data)
    .eq("id", id)
    .eq("broker_id", auth.user!.id)
    .select("*")
    .single();

  if (error || !updated) {
    return NextResponse.json({ error: "수정에 실패했습니다." }, { status: 500 });
  }

  // Trigger matching in the background
  try {
    await runTenantAutoMatcher(id, auth.user!.id);
  } catch (matchErr) {
    console.error("[TenantIntentPut] Auto-match run failed:", matchErr);
  }

  return NextResponse.json({
    ok: true,
    data: updated,
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireBroker(req);
  if (auth.error) return auth.error;

  const { id } = await params;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { error } = await supabase
    .from("tenant_intent")
    .delete()
    .eq("id", id)
    .eq("broker_id", auth.user!.id);

  if (error) {
    return NextResponse.json({ error: "삭제에 실패했습니다." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
  });
}
