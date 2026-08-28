import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * POST /api/public/magazine/referral
 * Records a referral when someone subscribes via a referral link
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { brokerId, referrerPhone, referredPhone } = body;

    if (!brokerId || !referrerPhone || !referredPhone) {
      return NextResponse.json(
        { error: "brokerId, referrerPhone, referredPhone가 필요합니다." },
        { status: 400 }
      );
    }

    if (referrerPhone === referredPhone) {
      return NextResponse.json(
        { error: "자기 자신을 추천할 수 없습니다." },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // Insert referral (unique constraint prevents duplicates)
    const { error: insertErr } = await supabase
      .from("magazine_referrals")
      .insert({
        broker_id: brokerId,
        referrer_phone: referrerPhone,
        referred_phone: referredPhone,
      });

    if (insertErr && insertErr.code !== "23505") {
      // 23505 = unique violation (already referred)
      throw insertErr;
    }

    // Count total referrals for this referrer
    const { count } = await supabase
      .from("magazine_referrals")
      .select("id", { count: "exact", head: true })
      .eq("broker_id", brokerId)
      .eq("referrer_phone", referrerPhone);

    const totalReferrals = count || 0;

    // Determine milestone
    const milestones = [
      { count: 1, reward: "비공개 시장 분석 리포트" },
      { count: 3, reward: "엑셀 수지분석기 다운로드" },
      { count: 5, reward: "비공개 딜 시트 열람권" },
      { count: 10, reward: "브로커 1:1 전화 자문 30분" },
    ];

    const currentMilestone = milestones.filter(m => totalReferrals >= m.count).pop();
    const nextMilestone = milestones.find(m => totalReferrals < m.count);

    return NextResponse.json({
      ok: true,
      totalReferrals,
      currentMilestone: currentMilestone || null,
      nextMilestone: nextMilestone || null,
    });
  } catch (err: unknown) {
    console.error("[api/public/magazine/referral] POST Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "서버 오류" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/public/magazine/referral?brokerId=xxx&phone=yyy
 * Returns referral stats for a subscriber
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const brokerId = searchParams.get("brokerId");
    const phone = searchParams.get("phone");

    if (!brokerId || !phone) {
      return NextResponse.json(
        { error: "brokerId와 phone이 필요합니다." },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    const { count } = await supabase
      .from("magazine_referrals")
      .select("id", { count: "exact", head: true })
      .eq("broker_id", brokerId)
      .eq("referrer_phone", phone);

    const totalReferrals = count || 0;

    const milestones = [
      { count: 1, reward: "비공개 시장 분석 리포트", emoji: "📊" },
      { count: 3, reward: "엑셀 수지분석기 다운로드", emoji: "📈" },
      { count: 5, reward: "비공개 딜 시트 열람권", emoji: "🏢" },
      { count: 10, reward: "브로커 1:1 전화 자문 30분", emoji: "📞" },
    ];

    return NextResponse.json({
      ok: true,
      totalReferrals,
      milestones,
      currentMilestoneIdx: milestones.filter(m => totalReferrals >= m.count).length - 1,
    });
  } catch (err: unknown) {
    console.error("[api/public/magazine/referral] GET Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "서버 오류" },
      { status: 500 }
    );
  }
}
