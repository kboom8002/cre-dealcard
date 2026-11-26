import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireBroker } from "@/lib/auth-guard";
import { checkRateLimit } from "@/lib/rate-limiter";
import { enforceBrokerAiQuota } from "@/lib/ai-quota-guard";
import { createServiceClient } from "@/lib/supabase/service";
import { routeMemo } from "@/ai/agents/memo-router-agent";
import { createModuleLogger } from '@/lib/logger';

export const maxDuration = 60;

const log = createModuleLogger('route');

const RouteMemoSchema = z.object({
  memo: z.string().trim().min(1, "Memo is required").max(10_000, "Memo cannot exceed 10,000 characters"),
});

export async function POST(req: NextRequest) {
  try {
    const guard = await requireBroker(req);
    if (guard.error) return guard.error;
    const user = guard.user;
    if (!user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const allowed = await checkRateLimit(user.id, "broker_memo_post", 20, 60_000);
    if (!allowed) {
      return NextResponse.json(
        { ok: false, error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
        { status: 429 },
      );
    }

    const quotaErr = await enforceBrokerAiQuota(req, user.id, "broker_memo_route", {
      perMinute: 20,
    });
    if (quotaErr) return quotaErr;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = RouteMemoSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message || "Memo is required" }, { status: 400 });
    }

    const { memo } = parsed.data;

    // AI 라우팅 실행
    const routingResult = await routeMemo(memo);

    // 모든 메모를 broker_memos 또는 activity_events 에 저장
    const supabase = createServiceClient();
    let memoId = null;
    const { data: memoData, error: memoError } = await supabase
      .from("broker_memos")
      .insert({
        user_id: user.id,
        memo_text: memo,
        routing_type: routingResult.type,
        routing_summary: routingResult.summary,
        status: 'saved'
      })
      .select('id')
      .single();

    if (memoError) {
      // P-C5: broker_memos 테이블 미존재 시 graceful fallback
      const isTableMissing = memoError.code === 'PGRST205' || memoError.code === '42P01' || memoError.message?.includes('does not exist');
      if (isTableMissing) {
        log.warn("[P-C5] broker_memos 테이블 미존재 — activity_events 폴백 사용. Supabase 대시보드에서 테이블 생성 필요.");
      } else {
        log.warn("broker_memos insert 실패:", memoError.code, memoError.message);
      }
      try {
        const { data: fallbackData } = await supabase.from("activity_events").insert({
          actor_id: user.id,
          event_type: "memo_saved",
          metadata: { memoText: memo, routingType: routingResult.type, routingSummary: routingResult.summary },
        }).select('id').single();
        if (fallbackData) memoId = fallbackData.id;
      } catch (fallbackErr) {
        log.error("activity_events fallback also failed:", fallbackErr);
      }
    } else if (memoData) {
      memoId = memoData.id;
    }

    return NextResponse.json({
      ok: true,
      data: {
        originalMemo: memo,
        routing: routingResult,
        memoId
      }
    });

  } catch (error) {
    log.error("Memo API Error:", error);
    return NextResponse.json(
      { ok: false, error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
