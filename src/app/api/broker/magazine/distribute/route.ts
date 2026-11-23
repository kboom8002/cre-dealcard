import { NextRequest, NextResponse } from "next/server";
import { requireBrokerContext, assertOwnsRow, jsonError, notFoundResponse } from "@/lib/magazine/authz";
import { createServiceClient } from "@/lib/supabase/service";
import { parseIssueDate, todayKst } from "@/lib/magazine/kst";
import { distributeMagazine, type DistributeMagazineEditionInput } from "@/domain/magazine/distribute-magazine";
import { enqueueMagazineDispatch } from "@/domain/magazine/distribute-queue";
import { assertPublishable } from "@/lib/legal/publish-gate";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("api-broker-magazine-distribute");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const TARGETS = ["all", "buyer", "seller"] as const;

/**
 * POST /api/broker/magazine/distribute
 * 에디션 발송(이메일/알림톡). 모든 발송은 sendGate를 경유하며,
 * `MAGAZINE_SEND_ENABLED=false`(기본)이면 발행은 유지하고 발송만 중지된 결과(200, blocked:'SEND_DISABLED')를 돌려준다.
 * 같은 (브로커, 발행일, kind)로 두 번째 호출하면 수신자 전원이 DUPLICATE로 차단된다(멱등 원장).
 */
export async function POST(req: NextRequest) {
  try {
    const { ctx, error } = await requireBrokerContext(req, { requireSlug: true });
    if (error || !ctx || !ctx.slug) return error ?? jsonError("UNAUTHORIZED", "로그인이 필요합니다.", 401);

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return jsonError("BAD_REQUEST", "요청 본문이 올바르지 않습니다.", 400);
    }
    const editionId = typeof body.editionId === "string" && body.editionId ? body.editionId : undefined;
    const title = typeof body.title === "string" ? body.title : "";
    const headline = typeof body.headline === "string" ? body.headline : undefined;
    const marketTemp = typeof body.market_temp === "string" ? body.market_temp : undefined;

    let issueDate = todayKst();
    if (typeof body.date === "string" && body.date) {
      if (!parseIssueDate(body.date)) return jsonError("BAD_REQUEST", "날짜 형식이 올바르지 않습니다.", 400);
      issueDate = body.date;
    }

    const target = TARGETS.find((t) => t === body.target) ?? "all";
    if (body.target !== undefined && target !== body.target) {
      return jsonError("BAD_REQUEST", "target은 all, buyer, seller 중 하나여야 합니다.", 400);
    }

    const supabase = createServiceClient();

    // 소유한 에디션만 대상 (불일치는 404) + 발행 여부 확인
    let published: boolean | null = null;
    if (editionId) {
      const row = await assertOwnsRow<{ id: string; status: string }>(supabase, "magazine_editions", editionId, ctx, {
        select: "id, status",
      });
      if (!row) return notFoundResponse();
      published = row.status === "published";
      // P2-2: 발행되지 않은(초안·검토 대기) 에디션은 발송하지 않는다 — 수신자 링크가 빈 페이지/이전 호를 가리키게 된다.
      if (!published) {
        return jsonError("EDITION_NOT_PUBLISHED", "발행되지 않은 에디션은 발송할 수 없습니다. 먼저 발행해 주세요.", 409);
      }
    }

    const statutoryGate = await assertPublishable({
      supabase,
      userId: ctx.userId,
      kind: "magazine",
    });
    if (!statutoryGate.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: { code: statutoryGate.code, message: statutoryGate.message },
          missingFields: statutoryGate.missingFields,
          missingLabels: statutoryGate.missingLabels,
        },
        { status: 422 },
      );
    }

    const rawEditionType =
      typeof body.editionType === "string" ? body.editionType : undefined;
    const cadenceTitleLabel =
      rawEditionType === "daily"
        ? "일간 리포트"
        : rawEditionType === "weekly"
          ? "주간 리포트"
          : rawEditionType === "monthly"
            ? "월간 리포트"
            : "부동산 소식지";

    const edition: DistributeMagazineEditionInput = {
      id: editionId,
      editionType: rawEditionType,
      title: title || `${issueDate} ${cadenceTitleLabel}`,
      headline,
      market_temp: marketTemp,
      date: issueDate,
      target,
    };

    const forceAsync = body.async === true;
    const forceSync = body.sync === true;
    let useAsyncQueue = forceAsync;
    if (!forceAsync && !forceSync) {
      const { count: activeSubCount } = await supabase
        .from("magazine_subscribers")
        .select("id", { count: "exact", head: true })
        .in("broker_id", ctx.brokerKeys)
        .eq("status", "active");
      if ((activeSubCount ?? 0) > 50) {
        useAsyncQueue = true;
      }
    }

    if (useAsyncQueue) {
      const queueRes = await enqueueMagazineDispatch(supabase, ctx.slug, edition);
      if (queueRes.queueUnavailable) {
        // D2 사전 컷오버: 대기열 스키마(000003) 미적용 → 기존 동기 발송 경로로 폴백(아래로 진행)
        log.warn(`[api/broker/magazine/distribute] queue unavailable — falling back to sync send for ${ctx.slug}`);
      } else {
        if (!queueRes.ok && queueRes.blockedReason) {
          return NextResponse.json({
            success: false,
            blocked: queueRes.blockedReason,
            message: queueRes.message,
            published,
            sent: 0,
            result: queueRes,
          });
        }
        return NextResponse.json({
          success: true,
          asyncQueued: true,
          published,
          dryRun: queueRes.dryRun,
          subscriberCount: queueRes.subscriberCount,
          total: queueRes.total,
          queued: queueRes.queued,
          sent: 0,
          failed: 0,
          blocked: queueRes.blocked,
          result: queueRes,
        });
      }
    }

    const result = await distributeMagazine(supabase, ctx.slug, edition);

    if (!result.ok && result.blockedReason === "SEND_DISABLED") {
      // 발행은 별도로 완료되었을 수 있으므로 200 + 중지 사유로 전달(에디터가 안내 문구 표시)
      return NextResponse.json({
        success: false,
        blocked: "SEND_DISABLED",
        message: result.message,
        published,
        sent: 0,
        result,
      });
    }

    log.info(`[api/broker/magazine/distribute] Completed for broker ${ctx.slug}`, {
      sent: result.sent,
      recorded: result.recorded,
      failed: result.failed,
      blocked: result.blocked,
      dryRun: result.dryRun,
    });

    return NextResponse.json({
      success: true,
      published,
      dryRun: result.dryRun,
      sent: result.sent,
      failed: result.failed,
      blocked: result.blocked,
      result,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("[api/broker/magazine/distribute] Error:", message);
    return jsonError("INTERNAL_ERROR", "발송 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.", 500);
  }
}
