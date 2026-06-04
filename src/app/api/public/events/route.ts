import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { recordEvent, MvpEventType, MvpEntityType } from "@/domain/analytics/record-event";

/**
 * POST /api/public/events
 * Handles tracking of content share events (viewer interactions) AND general activity events
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, shareId, viewerId, eventType, entityType, entityId, metadata } = body;

    const supabase = createServiceClient();

    if (type === "share_event") {
      // Content Curation view/scroll/click events
      if (!shareId || !eventType) {
        return NextResponse.json(
          { error: "shareId와 eventType이 필요합니다." },
          { status: 400 }
        );
      }

      const { data, error } = await supabase
        .from("content_share_events")
        .insert({
          share_id: shareId,
          viewer_id: viewerId || null,
          event_type: eventType,
          metadata: metadata || {}
        })
        .select()
        .single();

      if (error) throw error;

      return NextResponse.json({ success: true, data });
    } else {
      // General telemetry activity event G2
      if (!eventType) {
        return NextResponse.json(
          { error: "eventType이 필요합니다." },
          { status: 400 }
        );
      }

      const result = await recordEvent(supabase, {
        actorId: viewerId || null,
        eventType: eventType as MvpEventType,
        entityType: entityType as MvpEntityType,
        entityId: entityId,
        metadata: metadata || {}
      });

      return NextResponse.json({ success: true, data: result });
    }
  } catch (err: unknown) {
    console.error("[api/public/events] POST Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "서버 오류" },
      { status: 500 }
    );
  }
}
