/**
 * GET /api/broker/lease-card/[id] — 임대 공간 상세 및 블라인드 티저 조회
 * PUT /api/broker/lease-card/[id] — 임대 조건 수정 및 마켓플레이스 게재 전환
 * DELETE /api/broker/lease-card/[id] — 임대 공간 삭제
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod/v4";
import { requireBroker } from "@/lib/auth-guard";
import { runLeaseAutoMatcher } from "@/domain/matching/lease-auto-matcher";

const UpdateLeaseSpaceSchema = z.object({
  floor: z.string().optional(),
  area_sqm: z.number().optional(),
  space_type: z.enum(["office", "retail", "f_and_b", "warehouse", "other"]).optional(),
  deposit: z.number().optional(),
  monthly_rent: z.number().optional(),
  maintenance_fee: z.number().optional(),
  available_from: z.string().nullable().optional(),
  lease_term_months: z.number().optional(),
  incentives: z.object({
    rentFreeMonths: z.number().optional(),
    interiorSupport: z.string().nullable().optional(),
    freeRentDetail: z.string().nullable().optional(),
  }).optional(),
  restrictions: z.array(z.string()).optional(),
  status: z.enum(["active", "inactive", "contracted"]).optional(),
  is_marketplace_listed: z.boolean().optional(),
  hidden_fields: z.array(z.string()).optional(),
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

  // 1. Fetch lease space
  const { data: space, error: spaceErr } = await supabase
    .from("lease_spaces")
    .select(`
      *,
      building:building_id (
        area_signal,
        fit_summary,
        caution_summary
      )
    `)
    .eq("id", id)
    .eq("broker_id", auth.user!.id)
    .single();

  if (spaceErr || !space) {
    return NextResponse.json({ error: "임대 정보를 찾을 수 없습니다." }, { status: 404 });
  }

  // 2. Fetch linked blind teaser document
  const { data: teaser } = await supabase
    .from("document_objects")
    .select("*")
    .eq("document_type", "blind_teaser")
    .eq("source_id", id)
    .single();

  // 3. Fetch matched tenant intents
  const { data: matches } = await supabase
    .from("lease_match_results")
    .select(`
      grade,
      score,
      reasoning,
      intent:tenant_intent_id (
        id,
        business_type,
        area_min,
        area_max,
        budget_deposit_max,
        budget_monthly_max,
        client:client_id (
          id,
          display_name,
          company
        )
      )
    `)
    .eq("lease_space_id", id)
    .order("score", { ascending: false });

  return NextResponse.json({
    data: {
      space,
      teaser: teaser ?? null,
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
  const parsed = UpdateLeaseSpaceSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: updated, error } = await supabase
    .from("lease_spaces")
    .update(parsed.data)
    .eq("id", id)
    .eq("broker_id", auth.user!.id)
    .select("*")
    .single();

  if (error || !updated) {
    return NextResponse.json({ error: "수정에 실패했습니다." }, { status: 500 });
  }

  // Trigger matching update in the background
  try {
    await runLeaseAutoMatcher(id, auth.user!.id);
  } catch (err) {
    console.error("[LeaseCardPut] Auto-match run failed:", err);
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
    .from("lease_spaces")
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
