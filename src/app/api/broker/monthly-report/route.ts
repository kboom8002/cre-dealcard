import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireBroker } from "@/lib/auth-guard";

export async function GET(req: NextRequest) {
  try {
    const guard = await requireBroker(req);
    if (guard.error) return guard.error;
    const { user } = guard;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
    
    // Previous month
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();

    // 1. Current month deals (Building SSOT)
    const { count: thisMonthDeals } = await supabase
      .from("building_ssot_lite")
      .select("*", { count: "exact", head: true })
      .eq("owner_id", user!.id)
      .gte("created_at", currentMonthStart)
      .lt("created_at", nextMonthStart);

    const { count: prevMonthDeals } = await supabase
      .from("building_ssot_lite")
      .select("*", { count: "exact", head: true })
      .eq("owner_id", user!.id)
      .gte("created_at", prevMonthStart)
      .lt("created_at", currentMonthStart);

    // 2. Current month meetings (Pipeline: buyer_meeting)
    const { count: thisMonthMeetings } = await supabase
      .from("deal_pipeline_states")
      .select("*", { count: "exact", head: true })
      .eq("broker_id", user!.id)
      .eq("current_stage", "buyer_meeting")
      .gte("entered_at", currentMonthStart)
      .lt("entered_at", nextMonthStart);

    const { count: prevMonthMeetings } = await supabase
      .from("deal_pipeline_states")
      .select("*", { count: "exact", head: true })
      .eq("broker_id", user!.id)
      .eq("current_stage", "buyer_meeting")
      .gte("entered_at", prevMonthStart)
      .lt("entered_at", currentMonthStart);

    // 3. Contracts
    const { count: thisMonthContracts } = await supabase
      .from("deal_pipeline_states")
      .select("*", { count: "exact", head: true })
      .eq("broker_id", user!.id)
      .in("current_stage", ["contract", "closed"])
      .gte("entered_at", currentMonthStart)
      .lt("entered_at", nextMonthStart);

    const { count: prevMonthContracts } = await supabase
      .from("deal_pipeline_states")
      .select("*", { count: "exact", head: true })
      .eq("broker_id", user!.id)
      .in("current_stage", ["contract", "closed"])
      .gte("entered_at", prevMonthStart)
      .lt("entered_at", currentMonthStart);

    // AI Insight generation (Mocked based on data)
    let insight = "이번 달 활동이 지난달과 비슷합니다. 파이프라인 관리에 집중해 보세요.";
    if ((thisMonthDeals || 0) > (prevMonthDeals || 0)) {
      insight = "신규 딜 소싱이 지난달보다 활발합니다. 발굴한 딜카드 발송량을 늘려보세요.";
    }
    if ((thisMonthContracts || 0) > 0) {
      insight = "이번 달 성공적인 계약이 있습니다! 퍼널 최하단에서의 성과가 좋습니다.";
    }

    return NextResponse.json({
      success: true,
      data: {
        month: now.getMonth() + 1,
        thisMonth: {
          deals: thisMonthDeals || 0,
          meetings: thisMonthMeetings || 0,
          contracts: thisMonthContracts || 0,
        },
        prevMonth: {
          deals: prevMonthDeals || 0,
          meetings: prevMonthMeetings || 0,
          contracts: prevMonthContracts || 0,
        },
        insight,
      }
    });
  } catch (err: any) {
    console.error("[GET /api/broker/monthly-report]", err);
    return NextResponse.json({ error: "월간 리포트 생성 실패" }, { status: 500 });
  }
}
