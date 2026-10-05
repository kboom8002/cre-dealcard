import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { randomUUID, timingSafeEqual } from "crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { generateWeeklyMagazine } from "@/domain/magazine/weekly-generator";
import { isMagazineCronGenerateEnabled } from "@/lib/magazine/send-flags";
import { isoWeekLabel, todayKst } from "@/lib/magazine/kst";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("cron-weekly-magazine");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CONCURRENCY = 3;
/** maxDuration(300s) 안에서 마무리·기록할 시간을 남긴다 */
const TIME_BUDGET_MS = 270_000;
const PAID_TIERS = ["pro", "premium"];

type RunStatus = "ok" | "skipped" | "failed";

interface BrokerRun {
  broker_id: string;
  broker_user_id: string | null;
  status: RunStatus;
  reason: string | null;
  duration_ms: number;
}

/** CRON_SECRET timing-safe 비교 (S2-25). secret 없으면 항상 거부 */
function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(given);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

function isTableMissing(err: { code?: string; message?: string } | null): boolean {
  return !!err && (err.code === "42P01" || err.code === "PGRST205" || /does not exist|schema cache/i.test(err.message ?? ""));
}

/**
 * GET /api/cron/weekly-magazine
 * Vercel Cron: 매주 **월요일 10:00 KST** (`0 1 * * 1` UTC). 구독 중인(유료) 브로커의 주간 매거진을 **생성만** 한다.
 *
 *  - 발송은 하지 않는다(T1-04b). 생성물은 `needs_review` draft로 남고 브로커가 검토·발행·발송한다.
 *  - 생성은 발송 시간 제약(야간 금지, 정보통신망법 §50③)과 무관하므로 월 10:00 KST에 둔다. (구 일요일 UTC 22:00 = 월 07:00 KST)
 *  - `MAGAZINE_CRON_GENERATE_ENABLED`가 true가 아니면 `{ ok:true, skipped:'DISABLED' }`.
 *  - 멱등: 같은 (broker, edition_type=weekly, edition_label) 에디션이 이미 있으면 덮어쓰지 않고 skip.
 *  - 브로커별 try/catch 격리, 동시성 3, 결과는 `magazine_cron_runs`에 기록(테이블 없으면 로그만).
 */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isMagazineCronGenerateEnabled()) {
    return NextResponse.json({ ok: true, skipped: "DISABLED" });
  }

  const supabase = createServiceClient();
  const startedAt = Date.now();
  const runId = randomUUID();
  const issueDate = todayKst();
  const editionLabel = isoWeekLabel(issueDate);

  // ── 구독 중인 브로커: user_subscriptions(active, 유료 티어) → broker_profiles(slug) ──
  const { data: subs, error: subsError } = await supabase
    .from("user_subscriptions")
    .select("user_id")
    .eq("status", "active")
    .in("tier", PAID_TIERS);
  if (subsError) {
    log.error("[cron/weekly-magazine] user_subscriptions 조회 실패", subsError.message);
    return NextResponse.json(
      { ok: false, error: "SUBSCRIPTION_LOOKUP_FAILED", detail: subsError.message },
      { status: 500 },
    );
  }
  const userIds = Array.from(new Set((subs ?? []).map((s: { user_id: string }) => s.user_id)));
  if (userIds.length === 0) {
    return NextResponse.json({
      ok: true,
      message: "활성 구독 브로커가 없습니다.",
      edition_label: editionLabel,
      generated: 0,
      skipped: 0,
      failed: 0,
      elapsed_ms: Date.now() - startedAt,
    });
  }

  const { data: brokers, error: brokersError } = await supabase
    .from("broker_profiles")
    .select("user_id, slug")
    .in("user_id", userIds);
  if (brokersError) {
    log.error("[cron/weekly-magazine] broker_profiles 조회 실패", brokersError.message);
    return NextResponse.json(
      { ok: false, error: "BROKER_LOOKUP_FAILED", detail: brokersError.message },
      { status: 500 },
    );
  }

  const runs: BrokerRun[] = [];
  const queue = [...((brokers ?? []) as Array<{ user_id: string; slug: string | null }>)];

  async function processBroker(broker: { user_id: string; slug: string | null }): Promise<void> {
    const t0 = Date.now();
    const done = (status: RunStatus, reason: string | null): void => {
      runs.push({
        broker_id: broker.slug ?? "",
        broker_user_id: broker.user_id,
        status,
        reason,
        duration_ms: Date.now() - t0,
      });
    };

    if (!broker.slug) return done("skipped", "NO_SLUG");
    if (Date.now() - startedAt > TIME_BUDGET_MS) return done("skipped", "TIME_BUDGET");

    try {
      // 멱등: 이미 있으면 덮어쓰지 않는다 (broker + kind(edition_type) + label)
      const { data: existing, error: exErr } = await supabase
        .from("magazine_editions")
        .select("id")
        .eq("broker_id", broker.slug)
        .eq("edition_type", "weekly")
        .eq("edition_label", editionLabel)
        .limit(1);
      if (exErr) throw new Error(`기존 에디션 조회 실패: ${exErr.message}`);
      if (existing && existing.length > 0) return done("skipped", "ALREADY_EXISTS");

      const edition = await generateWeeklyMagazine({
        supabase,
        brokerId: broker.slug,
        editionType: "weekly",
        editionLabel,
      });

      // 생성만: 브로커 검토 전에는 draft가 아니라 needs_review로 둔다(발행·발송은 브로커 수동)
      if (edition.status === "draft") {
        const { error: updErr } = await supabase
          .from("magazine_editions")
          .update({ status: "needs_review" })
          .eq("id", edition.id)
          .eq("status", "draft");
        if (updErr) log.warn(`[cron] needs_review 전환 실패: ${broker.slug}`, updErr.message);
      }
      done("ok", edition.status === "needs_review" ? "QG_NEEDS_REVIEW" : null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "알 수 없는 오류";
      // Mock/LLM 불가로 생성기가 거부한 경우는 실패가 아니라 skip 기록
      if (/mock/i.test(message)) {
        log.warn(`[cron/weekly-magazine] ${broker.slug} Mock 응답 거부 — 저장하지 않음`, message);
        return done("skipped", "LLM_MOCK_REJECTED");
      }
      log.error(`[cron/weekly-magazine] 브로커 ${broker.slug} 실패`, message);
      done("failed", message.slice(0, 300));
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    for (let b = queue.shift(); b; b = queue.shift()) await processBroker(b);
  });
  await Promise.all(workers);

  // ── 실행 결과 기록 (테이블 미존재 시 로그만, 기능은 계속) ──
  let runsRecorded = false;
  if (runs.length > 0) {
    const { error: recErr } = await supabase.from("magazine_cron_runs").insert(
      runs.map((r) => ({
        run_id: runId,
        broker_id: r.broker_id || null,
        broker_user_id: r.broker_user_id,
        issue_date: issueDate,
        kind: "weekly",
        status: r.status,
        reason: r.reason,
        duration_ms: r.duration_ms,
      })),
    );
    if (recErr) {
      if (isTableMissing(recErr)) log.warn("[cron/weekly-magazine] magazine_cron_runs 미존재 — 마이그레이션 20261004000012 적용 필요(로그만 기록)");
      else log.error("[cron/weekly-magazine] magazine_cron_runs 기록 실패", recErr.message);
    } else {
      runsRecorded = true;
    }
  }

  const generated = runs.filter((r) => r.status === "ok").length;
  const skipped = runs.filter((r) => r.status === "skipped").length;
  const failed = runs.filter((r) => r.status === "failed").length;
  if (failed > 0) {
    // 관리자 알림 채널이 생기기 전까지 error 로그(런타임 알림 연동 대상)로 남긴다
    log.error(`[cron/weekly-magazine] 실패 ${failed}건 (run_id=${runId})`, runs.filter((r) => r.status === "failed").map((r) => `${r.broker_id}: ${r.reason}`));
  }

  return NextResponse.json({
    ok: failed === 0,
    message: `주간 매거진 생성: ${generated}건 생성, ${skipped}건 skip, ${failed}건 실패 (발송 없음)`,
    run_id: runId,
    issue_date: issueDate,
    edition_label: editionLabel,
    generated,
    skipped,
    failed,
    runs_recorded: runsRecorded,
    details: runs,
    elapsed_ms: Date.now() - startedAt,
  });
}
