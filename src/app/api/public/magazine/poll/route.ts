import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createModuleLogger } from '@/lib/logger';
import { parseIssueDate } from "@/lib/magazine/kst";
import { hashIp } from "@/lib/magazine/pii";
import {
  isMissingRelationError,
  isSellerChoice,
  isUniqueViolation,
  parsePollChoice,
  pollOptionCount,
  sanitizeVisitorId,
  shouldShowPollResults,
  type PollResults,
} from "@/lib/magazine/poll-helpers";
import { brokerKeys, findIssueForDate, resolvePublicBroker } from "@/lib/magazine/public-page-data";

const log = createModuleLogger('route');

function fail(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

const UNAVAILABLE = () =>
  fail(503, "POLL_UNAVAILABLE", "설문을 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도해주세요.");

/**
 * POST /api/public/magazine/poll
 * Records a reader's vote on a magazine poll question.
 *  - 서버가 실제로 저장한 경우에만 ok:true (가짜 결과 반환 금지)
 *  - 결과 집계는 total >= MIN_POLL_RESULTS 일 때만 `results`로 돌려준다 (아니면 null)
 *  - 전화번호 등 클라이언트가 보낸 식별정보는 신뢰하지 않는다 (visitor_id 만 sanitize 후 사용)
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return fail(400, "BAD_REQUEST", "요청 형식이 올바르지 않습니다.");
  }

  const brokerParam = typeof body.brokerId === "string" ? body.brokerId : "";
  const editionDate = typeof body.editionDate === "string" ? body.editionDate : "";
  if (!brokerParam || !parseIssueDate(editionDate)) {
    return fail(400, "BAD_REQUEST", "brokerId, editionDate가 필요합니다.");
  }

  // visitor_id: 바디(`visitorId`) 또는 헤더(`x-visitor-id`)에서 sanitize. 없으면 IP 해시.
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const visitorId =
    sanitizeVisitorId(body.visitorId) ??
    sanitizeVisitorId(request.headers.get("x-visitor-id")) ??
    (hashIp(forwarded) ? `ip-${hashIp(forwarded)}` : null);
  if (!visitorId) return fail(400, "BAD_REQUEST", "방문자를 확인할 수 없습니다.");

  try {
    const supabase = createServiceClient();

    const broker = await resolvePublicBroker(supabase, brokerParam, "user_id, slug");
    if (!broker) return fail(404, "NOT_FOUND", "매거진을 찾을 수 없습니다.");

    // 실제 발행본에 설문이 있어야 투표 가능 + 선택지 개수/intent 메타 확인
    const issue = await findIssueForDate(supabase, broker, editionDate);
    const poll = (issue?.poll ?? null) as { choices?: unknown; options?: unknown } | null;
    if (!issue || !poll) return fail(404, "NOT_FOUND", "설문을 찾을 수 없습니다.");

    const choice = parsePollChoice(body.choice, pollOptionCount(poll));
    if (choice === null) return fail(400, "BAD_CHOICE", "선택지가 올바르지 않습니다.");

    const brokerSlugOrId = broker.slug ?? broker.user_id;

    const { error: insertErr } = await supabase.from("magazine_poll_responses").insert({
      broker_id: brokerSlugOrId,
      broker_user_id: broker.user_id,
      edition_id: typeof issue.id === "string" ? issue.id : null,
      edition_date: editionDate,
      visitor_id: visitorId,
      choice,
    });

    if (insertErr) {
      if (isUniqueViolation(insertErr)) {
        const results = await getResults(supabase, brokerKeys(broker), editionDate);
        return NextResponse.json({ ok: true, alreadyVoted: true, results: results.results });
      }
      if (isMissingRelationError(insertErr)) {
        log.warn("[magazine_poll_responses] table/column not available:", insertErr.code);
      } else {
        log.error("[magazine_poll_responses] insert failed:", insertErr.code, insertErr.message);
      }
      return UNAVAILABLE();
    }

    // 선택지 intent 메타가 'seller' 인 경우에만 의미 있는 후속 처리 대상 (구독자 귀속은 sid 도입 후, I-04)
    const intentSeller = isSellerChoice(poll, choice);
    const { results } = await getResults(supabase, brokerKeys(broker), editionDate);
    return NextResponse.json({ ok: true, intentSeller, results });
  } catch (err: unknown) {
    log.error("[api/public/magazine/poll] POST Error:", err);
    return fail(500, "SERVER_ERROR", "서버 오류가 발생했습니다.");
  }
}

/**
 * GET /api/public/magazine/poll?brokerId=xxx&editionDate=yyyy-mm-dd
 * 실제 집계가 최소 표본(MIN_POLL_RESULTS) 이상일 때만 results 를 돌려준다. 아니면 results:null.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const brokerParam = searchParams.get("brokerId") ?? "";
    const editionDate = searchParams.get("editionDate") ?? "";

    if (!brokerParam || !parseIssueDate(editionDate)) {
      return fail(400, "BAD_REQUEST", "brokerId와 editionDate가 필요합니다.");
    }

    const supabase = createServiceClient();
    const broker = await resolvePublicBroker(supabase, brokerParam, "user_id, slug");
    if (!broker) return fail(404, "NOT_FOUND", "매거진을 찾을 수 없습니다.");

    const { results, error } = await getResults(supabase, brokerKeys(broker), editionDate);
    if (error) return UNAVAILABLE();
    return NextResponse.json({ ok: true, results });
  } catch (err: unknown) {
    log.error("[api/public/magazine/poll] GET Error:", err);
    return fail(500, "SERVER_ERROR", "서버 오류가 발생했습니다.");
  }
}

/** 실제 집계. 오류 시 가짜 값 대신 { results:null, error:true }. 표본 부족 시 results:null. */
async function getResults(
  supabase: ReturnType<typeof createServiceClient>,
  brokerIds: string[],
  editionDate: string,
): Promise<{ results: PollResults | null; error: boolean }> {
  const { data: votes, error } = await supabase
    .from("magazine_poll_responses")
    .select("choice")
    .in("broker_id", brokerIds)
    .eq("edition_date", editionDate);

  if (error) {
    log.warn("[magazine_poll_responses] aggregate failed:", error.code);
    return { results: null, error: true };
  }

  const rows = (votes ?? []) as Array<{ choice: number }>;
  const counts: Record<number, number> = {};
  for (const v of rows) counts[v.choice] = (counts[v.choice] ?? 0) + 1;
  const results: PollResults = { total: rows.length, counts };
  return { results: shouldShowPollResults(results) ? results : null, error: false };
}
