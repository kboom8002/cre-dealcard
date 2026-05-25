/**
 * GET /api/broker/tenant-intents — 임차인 의향서 목록 조회
 * POST /api/broker/tenant-intents — 임차인 의향서 수동 등록
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod/v4";
import { requireBroker } from "@/lib/auth-guard";
import { runTenantAutoMatcher } from "@/domain/matching/lease-auto-matcher";

const CreateTenantIntentSchema = z.object({
  client_id: z.string().uuid().nullable().optional(),
  business_type: z.string().min(1, "업종을 입력해주세요"),
  preferred_regions: z.array(z.string()).default([]),
  area_min: z.number().nullable().optional(),
  area_max: z.number().nullable().optional(),
  budget_deposit_max: z.number().nullable().optional(),
  budget_monthly_max: z.number().nullable().optional(),
  preferred_floors: z.array(z.string()).default([]),
  move_in_target: z.string().nullable().optional(),
  must_have: z.array(z.string()).default([]),
  nice_to_have: z.array(z.string()).default([]),
});

export async function GET(req: NextRequest) {
  const auth = await requireBroker(req);
  if (auth.error) return auth.error;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const url = new URL(req.url);
  const search = url.searchParams.get("search");

  let query = supabase
    .from("tenant_intent")
    .select(`
      *,
      client:client_id (
        id,
        display_name,
        company
      )
    `)
    .eq("broker_id", auth.user!.id)
    .order("created_at", { ascending: false });

  if (search) {
    query = query.ilike("business_type", `%${search}%`);
  }

  const { data, error } = await query.limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const auth = await requireBroker(req);
  if (auth.error) return auth.error;

  const json = await req.json();
  const parsed = CreateTenantIntentSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data, error } = await supabase
    .from("tenant_intent")
    .insert({
      broker_id: auth.user!.id,
      ...parsed.data,
    })
    .select("*")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message || "임차 의향서 등록에 실패했습니다." }, { status: 500 });
  }

  // Trigger matching in the background
  try {
    await runTenantAutoMatcher(data.id, auth.user!.id);
  } catch (matchErr) {
    console.error("[TenantIntentPost] Auto-match run failed:", matchErr);
  }

  return NextResponse.json({
    ok: true,
    data,
  }, { status: 201 });
}
