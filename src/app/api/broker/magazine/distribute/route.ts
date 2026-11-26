import { NextRequest, NextResponse } from "next/server";
import { requireBrokerContext, assertOwnsRow, jsonError, notFoundResponse } from "@/lib/magazine/authz";
import { createServiceClient } from "@/lib/supabase/service";
import { parseIssueDate, toKstDate, todayKst } from "@/lib/magazine/kst";
import { checkRateLimit } from "@/lib/rate-limiter";
import { distributeMagazine, type DistributeMagazineEditionInput } from "@/domain/magazine/distribute-magazine";
import { computeNextKst0830Iso, enqueueMagazineDispatch } from "@/domain/magazine/distribute-queue";
import { DISPATCH_LEDGER_TABLE, isMissingLedgerColumn } from "@/domain/magazine/send-gate";
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

    const allowed = await checkRateLimit(ctx.userId, "magazine_distribute", 5, 60_000);
    if (!allowed) {
      return jsonError("RATE_LIMITED", "발송 요청이 너무 많습니다. 1분 후 다시 시도해 주세요.", 429);
    }

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return jsonError("BAD_REQUEST", "요청 본문이 올바르지 않습니다.", 400);
    }

    const action = typeof body.action === "string" ? body.action : undefined;
    const editionId = typeof body.editionId === "string" && body.editionId ? body.editionId : undefined;
    const supabase = createServiceClient();

    if (action === "cancel_schedule") {
      if (editionId) {
        const ownRow = await assertOwnsRow<{ id: string }>(supabase, "magazine_editions", editionId, ctx, {
          select: "id",
        });
        if (!ownRow) return notFoundResponse();
      }
      let cancelQ = supabase
        .from(DISPATCH_LEDGER_TABLE)
        .delete()
        .in("broker_id", ctx.brokerKeys)
        .eq("status", "retryable")
        .eq("blocked_reason", "SCHEDULED_0830");
      if (editionId) {
        cancelQ = cancelQ.eq("edition_id", editionId);
      }
      const { data: cancelledRows, error: cancelErr, count: cancelledRawCount } = await cancelQ.select("id");
      if (cancelErr) {
        if (
          isMissingLedgerColumn(cancelErr) ||
          cancelErr.code === "42P01" ||
          cancelErr.code === "PGRST205"
        ) {
          return jsonError("SCHEDULE_UNAVAILABLE", "예약 발송 대기열 스키마가 준비되지 않았습니다.", 503);
        }
        throw new Error(`예약 발송 취소 실패: ${cancelErr.message}`);
      }
      const cancelledCount = Array.isArray(cancelledRows)
        ? cancelledRows.length
        : typeof cancelledRawCount === "number"
          ? cancelledRawCount
          : 0;
      return NextResponse.json({
        ok: true,
        success: true,
        cancelled: cancelledCount,
        message:
          cancelledCount > 0
            ? `오전 08:30 예약 발송 ${cancelledCount}건을 취소했습니다.`
            : "취소할 오전 08:30 예약 발송 건이 없습니다.",
      });
    }

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

    // 소유한 에디션만 대상 (불일치는 404) + 발행 여부 확인 + 정본 발행일(issueDate) 도출
    let published: boolean | null = null;
    if (editionId) {
      let row = await assertOwnsRow<{
        id: string;
        status: string;
        issue_date?: string | null;
        published_at?: string | null;
        content?: Record<string, unknown> | null;
      }>(supabase, "magazine_editions", editionId, ctx, {
        select: "id, status, issue_date, published_at, content",
      });
      if (!row) {
        row = await assertOwnsRow<{
          id: string;
          status: string;
          content?: Record<string, unknown> | null;
        }>(supabase, "magazine_editions", editionId, ctx, {
          select: "id, status, content",
        });
      }
      if (!row) return notFoundResponse();
      published = row.status === "published";
      // P2-2: 발행되지 않은(초안·검토 대기) 에디션은 발송하지 않는다 — 수신자 링크가 빈 페이지/이전 호를 가리키게 된다.
      if (!published) {
        return jsonError("EDITION_NOT_PUBLISHED", "발행되지 않은 에디션은 발송할 수 없습니다. 먼저 발행해 주세요.", 409);
      }
      const rowContent =
        row.content && typeof row.content === "object" && !Array.isArray(row.content)
          ? (row.content as Record<string, unknown>)
          : null;
      const canonicalDbDate =
        (typeof rowContent?.issueDate === "string" && parseIssueDate(rowContent.issueDate)
          ? rowContent.issueDate
          : null) ??
        (typeof rowContent?.issue_date === "string" && parseIssueDate(rowContent.issue_date)
          ? rowContent.issue_date
          : null) ??
        (typeof row.issue_date === "string" && parseIssueDate(row.issue_date)
          ? row.issue_date
          : null) ??
        (typeof row.published_at === "string" && row.published_at
          ? toKstDate(new Date(row.published_at))
          : null);
      if (canonicalDbDate) {
        issueDate = canonicalDbDate;
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

    const scheduleMorning = body.scheduleMorning === true;
    const forceAsync = body.async === true || scheduleMorning;
    const forceSync = body.sync === true && !scheduleMorning;
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
      let promotedScheduledCount = 0;
      if (!scheduleMorning) {
        // M-04: 08:30 예약 상태 행이 있다면 즉시 발송 워커 대상으로 승격한다.
        const nowIso = new Date().toISOString();
        let promoteQ = supabase
          .from(DISPATCH_LEDGER_TABLE)
          .update({
            status: "pending_worker",
            next_attempt_at: nowIso,
            blocked_reason: null,
            updated_at: nowIso,
          })
          .in("broker_id", ctx.brokerKeys)
          .eq("status", "retryable")
          .eq("blocked_reason", "SCHEDULED_0830");
        if (editionId) {
          promoteQ = promoteQ.eq("edition_id", editionId);
        }
        const { data: promotedRows, error: promoteErr } = await promoteQ.select("id");
        if (!promoteErr && Array.isArray(promotedRows)) {
          promotedScheduledCount = promotedRows.length;
        }
      }

      const scheduledForIso = scheduleMorning ? computeNextKst0830Iso() : undefined;
      const queueRes = await enqueueMagazineDispatch(
        supabase,
        ctx.slug,
        edition,
        scheduledForIso ? { scheduledForIso } : undefined,
      );
      if (queueRes.queueUnavailable) {
        if (scheduleMorning) {
          return NextResponse.json(
            {
              success: false,
              blocked: "SCHEDULE_UNAVAILABLE",
              message: queueRes.message,
              published,
              sent: 0,
            },
            { status: 503 },
          );
        }
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

        let alreadyScheduled = false;
        let effectiveQueued = queueRes.queued + promotedScheduledCount;
        if (scheduleMorning && queueRes.queued === 0 && queueRes.total > 0) {
          let existingQ = supabase
            .from(DISPATCH_LEDGER_TABLE)
            .select("id", { count: "exact", head: true })
            .in("broker_id", ctx.brokerKeys)
            .eq("status", "retryable")
            .eq("blocked_reason", "SCHEDULED_0830");
          if (editionId) {
            existingQ = existingQ.eq("edition_id", editionId);
          }
          const { count: existingCount, error: existingErr } = await existingQ;
          if (!existingErr && (existingCount ?? 0) > 0) {
            alreadyScheduled = true;
            effectiveQueued = existingCount ?? 0;
          }
        }

        return NextResponse.json({
          success: true,
          asyncQueued: true,
          ...(alreadyScheduled ? { alreadyScheduled: true } : {}),
          ...(promotedScheduledCount > 0 ? { promoted: promotedScheduledCount } : {}),
          ...(scheduledForIso ? { scheduledForIso } : {}),
          published,
          dryRun: queueRes.dryRun,
          subscriberCount: queueRes.subscriberCount,
          total: queueRes.total,
          queued: effectiveQueued,
          sent: 0,
          failed: 0,
          blocked: queueRes.blocked,
          ...(alreadyScheduled
            ? { message: `이미 오전 08:30 예약 발송이 등록되어 있습니다. (예약 ${effectiveQueued}건)` }
            : {}),
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
