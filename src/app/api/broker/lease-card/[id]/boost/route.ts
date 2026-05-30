/**
 * POST /api/broker/lease-card/[id]/boost
 * lease_spaces → spaces 변환 + 양방향 FK 연결
 * → redirect 할 spaceId 반환
 */
import { NextRequest, NextResponse } from "next/server";
import { requireBroker } from "@/lib/auth-guard";
import { createServiceClient } from "@/lib/supabase/service";
import { toApiError } from "@/lib/api-error";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;
  const { user } = guard;

  try {
    const { id: leaseSpaceId } = await params;
    const supabase = createServiceClient();

    // 1. lease_spaces 조회
    const { data: ls, error: lsErr } = await supabase
      .from("lease_spaces")
      .select("*, building:building_id(id, area_signal, asset_type)")
      .eq("id", leaseSpaceId)
      .eq("broker_id", user!.id)
      .single();

    if (lsErr || !ls) {
      return NextResponse.json({ error: "임대 카드를 찾을 수 없습니다." }, { status: 404 });
    }

    // 2. 이미 연결된 경우 기존 space_id 반환
    if (ls.aipage_space_id) {
      return NextResponse.json({
        ok: true,
        already_linked: true,
        spaceId: ls.aipage_space_id,
        redirect: `/broker/leasing/${ls.aipage_space_id}`,
      });
    }

    // 3. lease_spaces 데이터를 spaces 형식으로 변환
    const building = ls.building as { id?: string; area_signal?: string; asset_type?: string } | null;
    const areaPy = ls.area_sqm ? Math.round(ls.area_sqm / 3.3058 * 10) / 10 : null;

    const spaceTypeMap: Record<string, string> = {
      office: "오피스",
      retail: "상가",
      f_and_b: "F&B",
      warehouse: "창고",
      other: "기타",
    };

    const { data: space, error: spaceErr } = await supabase
      .from("spaces")
      .insert({
        building_ssot_lite_id: ls.building_id ?? null,
        created_by: user!.id,
        status: "intake",
        display_name: building?.area_signal
          ? `${building.area_signal} ${ls.floor ?? ""} ${spaceTypeMap[ls.space_type] ?? ls.space_type}`
          : `${ls.floor ?? ""} ${spaceTypeMap[ls.space_type] ?? ls.space_type}`,
        blind_name: building?.area_signal
          ? `${building.area_signal} ${ls.floor ?? ""}`
          : `${ls.floor ?? ""} 임대공간`,
        floor: ls.floor,
        space_type: ls.space_type,
        area_private_py: areaPy,
        deposit_krw: ls.deposit ? ls.deposit * 10000 : null,
        monthly_rent_krw: ls.monthly_rent ? ls.monthly_rent * 10000 : null,
        maintenance_fee_krw: ls.maintenance_fee ? ls.maintenance_fee * 10000 : null,
        available_from: ls.available_from ?? null,
        lease_terms: {
          lease_term_months: ls.lease_term_months,
          incentives: ls.incentives,
          restrictions: ls.restrictions,
          deal_type: ls.deal_type,
        },
        tenant_constraints: {
          restrictions: ls.restrictions,
        },
        identity: {
          area_signal: building?.area_signal ?? null,
          asset_type: building?.asset_type ?? ls.space_type,
        },
        source_app: "js-mvp",
        source_object_id: leaseSpaceId,
        confidence: "memo_based",
      })
      .select("id")
      .single();

    if (spaceErr || !space) {
      return NextResponse.json(
        { error: "AI 리싱 공간 생성에 실패했습니다.", detail: spaceErr?.message },
        { status: 500 },
      );
    }

    // 4. 양방향 FK 설정
    await supabase
      .from("lease_spaces")
      .update({ aipage_space_id: space.id })
      .eq("id", leaseSpaceId);

    return NextResponse.json({
      ok: true,
      spaceId: space.id,
      leaseSpaceId,
      redirect: `/broker/leasing/${space.id}`,
    });
  } catch (error) {
    console.error("[boost] Error:", error);
    return toApiError(error);
  }
}
