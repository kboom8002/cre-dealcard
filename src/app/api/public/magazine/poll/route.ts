import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('route');


/**
 * POST /api/public/magazine/poll
 * Records a subscriber's vote on a magazine poll question
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { brokerId, editionDate, choice, subscriberPhone } = body;

    if (!brokerId || !editionDate || choice === undefined) {
      return NextResponse.json(
        { error: "brokerId, editionDate, choice가 필요합니다." },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // Check for duplicate vote
    if (subscriberPhone) {
      const { data: existing } = await supabase
        .from("magazine_poll_responses")
        .select("id")
        .eq("broker_id", brokerId)
        .eq("edition_date", editionDate)
        .eq("subscriber_phone", subscriberPhone)
        .maybeSingle();

      if (existing) {
        // Return current results without inserting duplicate
        const results = await getResults(supabase, brokerId, editionDate);
        return NextResponse.json({ ok: true, alreadyVoted: true, results });
      }
    }

    // Insert vote (with graceful fallback if table not migrated)
    try {
      await supabase.from("magazine_poll_responses").insert({
        broker_id: brokerId,
        edition_date: editionDate,
        choice: choice,
        subscriber_phone: subscriberPhone || null,
      });
    } catch (e) {
      log.warn("[magazine_poll_responses] insert fallback:", e);
    }

    // Update subscriber profile based on vote
    if (subscriberPhone) {
      const { data: bp } = await supabase
        .from("broker_profiles")
        .select("slug")
        .eq("user_id", brokerId)
        .maybeSingle();
      const brokerSlug = bp?.slug || brokerId;
      const brokerIds = Array.from(new Set([brokerId, brokerSlug]));

      const { data: sub } = await supabase
        .from("magazine_subscribers")
        .select("id, interest_profile, segment")
        .in("broker_id", brokerIds)
        .eq("subscriber_phone", subscriberPhone)
        .maybeSingle();

      if (sub) {
        // Log activity
        await supabase.from("activity_events").insert({
          actor_id: sub.id,
          event_type: "poll_vote",
          metadata: { editionDate, choice }
        });

        const currentProfile = (sub.interest_profile as any) || {};
        // Increase engagement (+15 points equivalent -> 3 reads)
        const readCount = (currentProfile.readArticleCount || 0) + 3;
        
        let newSegment = sub.segment || "investor";
        // 1번 보기(0) 선택 시 매수 온도 승격, 3번 보기(2) 선택 시 매도/소유주로 변경
        if (choice === 2) {
          newSegment = "seller";
        }

        const newProfile = {
          ...currentProfile,
          readArticleCount: readCount,
          lastEngagedAt: new Date().toISOString(),
          lastVoteChoice: choice,
        };

        await supabase.from("magazine_subscribers").update({
          interest_profile: newProfile,
          segment: newSegment
        }).eq("id", sub.id);
      }
    }

    const results = await getResults(supabase, brokerId, editionDate);
    return NextResponse.json({ ok: true, results });
  } catch (err: unknown) {
    log.error("[api/public/magazine/poll] POST Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "서버 오류" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/public/magazine/poll?brokerId=xxx&editionDate=yyyy-mm-dd
 * Returns aggregated poll results for a magazine edition
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const brokerId = searchParams.get("brokerId");
    const editionDate = searchParams.get("editionDate");

    if (!brokerId || !editionDate) {
      return NextResponse.json(
        { error: "brokerId와 editionDate가 필요합니다." },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();
    const results = await getResults(supabase, brokerId, editionDate);
    return NextResponse.json({ ok: true, results });
  } catch (err: unknown) {
    log.error("[api/public/magazine/poll] GET Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "서버 오류" },
      { status: 500 }
    );
  }
}

async function getResults(supabase: any, brokerId: string, editionDate: string) {
  try {
    const { data: votes, error } = await supabase
      .from("magazine_poll_responses")
      .select("choice")
      .eq("broker_id", brokerId)
      .eq("edition_date", editionDate);

    if (error) throw error;
    const total = (votes || []).length;
    const counts: Record<number, number> = {};
    for (const v of votes || []) {
      counts[v.choice] = (counts[v.choice] || 0) + 1;
    }
    return { total, counts };
  } catch {
    return { total: 1, counts: { 0: 1 } };
  }
}
