import { NextRequest, NextResponse } from "next/server";
import { requireBroker } from "@/lib/auth-guard";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * GET /api/broker/deal-card/[id]/personas
 * DB에서 저장된 페르소나 데이터를 로드합니다.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const guard = await requireBroker(req);
    if (guard.error) return guard.error;

    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from("deal_card_personas")
      .select("personas_data, updated_at")
      .eq("building_ssot_lite_id", id)
      .eq("broker_id", guard.user!.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (!data) {
      return NextResponse.json({ success: true, data: null });
    }

    return NextResponse.json({
      success: true,
      data: data.personas_data,
      updatedAt: data.updated_at,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/broker/deal-card/[id]/personas
 * 페르소나 데이터를 DB에 upsert합니다.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const guard = await requireBroker(req);
    if (guard.error) return guard.error;

    const { personasData } = await req.json();

    if (!personasData || !personasData.personas) {
      return NextResponse.json(
        { error: "personasData with personas array is required" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from("deal_card_personas")
      .upsert(
        {
          building_ssot_lite_id: id,
          broker_id: guard.user!.id,
          personas_data: personasData,
        },
        { onConflict: "building_ssot_lite_id,broker_id" }
      )
      .select("id, updated_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, id: data.id, updatedAt: data.updated_at });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * DELETE /api/broker/deal-card/[id]/personas
 * 저장된 페르소나 데이터를 삭제합니다.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const guard = await requireBroker(req);
    if (guard.error) return guard.error;

    const supabase = createServiceClient();

    const { error } = await supabase
      .from("deal_card_personas")
      .delete()
      .eq("building_ssot_lite_id", id)
      .eq("broker_id", guard.user!.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
