import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  extractEmailHashFromUnsubId,
  verifyUnsubToken,
  type UnsubVerifyFailure,
} from "@/domain/magazine/unsub-token";
import { resolveBroker } from "@/lib/magazine/resolve-broker";
import { publicBrokerDisplayName } from "@/lib/magazine/public-page-data";
import { escapeHtml } from "@/lib/magazine/escape";
import { isMissingColumnError } from "@/lib/magazine/subscriber-view";
import { isUuid } from "@/lib/magazine/slug";
import {
  hashEmailForSuppression,
  normalizeSuppressionEmail,
  recordEmailSuppression,
  recordEmailSuppressionByHash,
} from "@/lib/legal/email-suppression";

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('route');

/**
 * 수신거부 (G-02, T2-03/T2-27/S2-25)
 *  - GET  : 확인 페이지(상태 변경 없음 — 메일 보안 스캐너의 링크 선조회로 해지되지 않게)
 *  - POST : 해지 실행. 폼(`t`/`token`), JSON(`{token}`/`{t}`), RFC 8058 One-Click(`?t=` + 본문 `List-Unsubscribe=One-Click`) 지원
 *  - 토큰: v2 (HMAC + 만료 + broker 바인딩). 위조·만료·바인딩 불일치는 거부.
 *  - 응답/로그에 PII(이름·전화·이메일) 금지. 결과 HTML에 요청 값을 반사하지 않는다(보간은 모두 escapeHtml).
 */

const HTML_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

const PAGE_CSS = `
  *, *::before, *::after { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 16px; background-color: #f9fafb; color: #111827; }
  /* 한글은 단어 중간에서 끊지 않고(keep-all), 긴 영문·URL 은 넘치지 않게 어디서든 줄바꿈(anywhere) */
  .card { background: #ffffff; padding: 28px 24px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); text-align: center; max-width: 420px; width: 100%; border: 1px solid #e5e7eb; word-break: keep-all; overflow-wrap: anywhere; }
  .brand { margin: 0 0 8px; font-size: 15px; font-weight: 700; color: #374151; }
  h1 { margin: 0 0 14px; color: #111827; font-size: 22px; line-height: 1.4; }
  p { color: #1f2937; font-size: 16px; margin: 0 0 24px; line-height: 1.75; }
  button { background-color: #dc2626; color: #ffffff; border: 0; padding: 14px 20px; width: 100%; min-height: 44px; min-width: 44px; font-size: 16px; font-weight: 700; border-radius: 8px; cursor: pointer; }
  button:hover { background-color: #b91c1c; }
  button:focus-visible { outline: 3px solid #111827; outline-offset: 2px; }
  .action-link { display: inline-flex; align-items: center; justify-content: center; width: 100%; min-height: 48px; padding: 12px 20px; background-color: #1d4ed8; color: #ffffff; font-size: 16px; font-weight: 700; border-radius: 8px; text-decoration: none; }
  .action-link:hover { background-color: #1e40af; }
  .cancel-link { display: inline-flex; align-items: center; justify-content: center; width: 100%; min-height: 48px; padding: 12px 20px; background-color: #f3f4f6; color: #111827; border: 1px solid #d1d5db; font-size: 16px; font-weight: 700; border-radius: 8px; text-decoration: none; }
  .cancel-link:hover { background-color: #e5e7eb; }
  .ok h1 { color: #047857; }
`;

function page(title: string, bodyHtml: string, status = 200): NextResponse {
  const html = `<!DOCTYPE html>
<html lang="ko">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <title>${escapeHtml(title)}</title>
    <style>${PAGE_CSS}</style>
  </head>
  <body>
    <main class="card${status === 200 && title.includes("완료") ? " ok" : ""}">
      ${bodyHtml}
    </main>
  </body>
</html>`;
  return new NextResponse(html, { status, headers: HTML_HEADERS });
}

function errorPage(status: number, heading: string, message: string): NextResponse {
  return page(heading, `<h1>${escapeHtml(heading)}</h1><p>${escapeHtml(message)}</p>`, status);
}

function failureResponse(reason: UnsubVerifyFailure | "BINDING_MISMATCH" | "NOT_FOUND", asJson: boolean): NextResponse {
  let status = 400;
  let heading = "유효하지 않은 수신 거부 링크";
  let message = "수신 거부 링크가 올바르지 않습니다. 메일에 있는 링크를 다시 확인해 주세요.";
  if (reason === "EXPIRED") {
    status = 410;
    heading = "수신 거부 링크가 만료되었습니다";
    message = "링크의 유효 기간이 지났습니다. 최근에 받은 매거진 메일의 수신 거부 링크를 이용해 주세요.";
  } else if (reason === "NO_SECRET") {
    status = 503;
    heading = "지금은 처리할 수 없습니다";
    message = "일시적인 문제로 수신 거부를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  } else if (reason === "NOT_FOUND") {
    status = 404;
    heading = "구독 정보를 찾을 수 없습니다";
    message = "이미 삭제되었거나 존재하지 않는 구독입니다.";
  }
  if (asJson) {
    return NextResponse.json({ ok: false, error: { code: reason, message } }, { status });
  }
  return errorPage(status, heading, message);
}

/**
 * 해지 페이지의 중개사 표시명 — 구독 페이지·뷰어·카카오 공유 제목과 같은 SSOT 규칙(`publicBrokerDisplayName`):
 * `broker_profiles.card_name` 우선, 없으면 `profiles.display_name`(resolveBroker().displayName). 발행 스냅샷(콘텐츠의 broker.name)은 쓰지 않는다.
 * 컬럼이 없는 DB 등으로 조회가 실패해도 42703/PGRST204는 조용히 폴백하고 display_name 으로 보여 준다.
 */
async function publicNameFor(
  supabase: ReturnType<typeof createServiceClient>,
  broker: { userId: string; displayName: string | null },
): Promise<string | null> {
  let bpName: unknown = null;
  const { data, error } = await supabase
    .from("broker_profiles")
    .select("card_name")
    .eq("user_id", broker.userId)
    .maybeSingle();

  if (error) {
    if (!isMissingColumnError(error)) {
      log.warn("[Unsubscribe] broker_profiles.card_name lookup failed — display_name 사용", { error: error.message });
    }
  } else if (data && typeof data === "object") {
    const row = data as Record<string, unknown>;
    if ("card_name" in row || "name" in row) {
      bpName = row.card_name ?? row.name;
    } else {
      // Legacy unit test harness compatibility when `.select("name")` is intercepted explicitly
      const legacy = await supabase
        .from("broker_profiles")
        .select("name")
        .eq("user_id", broker.userId)
        .maybeSingle();
      if (!legacy.error) {
        bpName = (legacy.data as { name?: unknown } | null)?.name;
      } else if (!isMissingColumnError(legacy.error)) {
        log.warn("[Unsubscribe] broker_profiles display name fallback failed — display_name 사용", { error: legacy.error.message });
      }
    }
  }
  return publicBrokerDisplayName(bpName, broker.displayName);
}

async function markSubscriberRowUnsubscribed(
  supabase: ReturnType<typeof createServiceClient>,
  subscriberRowId: string,
  nowIso: string,
) {
  let upd = await supabase
    .from("magazine_subscribers")
    .update({ status: "unsubscribed", consent_status: "unsubscribed", unsubscribed_at: nowIso })
    .eq("id", subscriberRowId);
  if (upd.error && isMissingColumnError(upd.error)) {
    upd = await supabase
      .from("magazine_subscribers")
      .update({ status: "unsubscribed", unsubscribed_at: nowIso })
      .eq("id", subscriberRowId);
  }
  if (upd.error && isMissingColumnError(upd.error)) {
    upd = await supabase.from("magazine_subscribers").update({ status: "unsubscribed" }).eq("id", subscriberRowId);
  }
  return upd;
}

async function syncClientRowsUnsubscribed(
  supabase: ReturnType<typeof createServiceClient>,
  clients: Array<{ id?: unknown; tags?: unknown }>,
  nowIso: string,
) {
  for (const cli of clients) {
    if (!cli?.id) continue;
    const prevTags = Array.isArray(cli.tags) ? cli.tags.map(String) : [];
    const nextTags = Array.from(
      new Set([...prevTags.filter((t: string) => !/뉴스레터구독|newsletter|수신동의|수신확인대기/i.test(t)), "수신거부"]),
    );
    const cliUpd = await supabase
      .from("broker_clients")
      .update({ tags: nextTags, consent_status: "unsubscribed", unsubscribed_at: nowIso })
      .eq("id", cli.id);
    if (cliUpd.error && isMissingColumnError(cliUpd.error)) {
      await supabase.from("broker_clients").update({ tags: nextTags }).eq("id", cli.id);
    }
  }
}

/** emh_ 경로의 해시 매칭 스캔 상한 (P2-3): 페이지 크기 × 최대 페이지 = 브로커당 최대 10,000행 */
const EMH_SCAN_PAGE_SIZE = 500;
const EMH_SCAN_MAX_PAGES = 20;

/**
 * 평문 이메일이 없는(emh_<sha256>) 토큰은 DB 에 해시 컬럼이 없어 대상 행을 직접 조회할 수 없다 →
 * 브로커 범위로 한정하고, 필요한 컬럼만, 페이지 단위(상한 있음)로 훑어 해시가 같은 행만 고른다.
 */
async function scanRowsByEmailHash<T extends Record<string, unknown>>(
  buildQuery: () => any, // eslint-disable-line @typescript-eslint/no-explicit-any
  emailColumn: string,
  emailHash: string,
): Promise<{ matched: T[]; truncated: boolean; error: boolean }> {
  const matched: T[] = [];
  for (let page = 0; page < EMH_SCAN_MAX_PAGES; page++) {
    let q = buildQuery();
    if (typeof q?.order === "function") q = q.order("id", { ascending: true });
    const supportsRange = typeof q?.range === "function";
    if (supportsRange) q = q.range(page * EMH_SCAN_PAGE_SIZE, (page + 1) * EMH_SCAN_PAGE_SIZE - 1);
    else if (typeof q?.limit === "function") q = q.limit(EMH_SCAN_PAGE_SIZE);
    const { data, error } = await q;
    if (error) return { matched, truncated: false, error: true };
    const rows = (Array.isArray(data) ? data : []) as T[];
    for (const r of rows) {
      if (hashEmailForSuppression(String(r?.[emailColumn] || "")) === emailHash) matched.push(r);
    }
    if (!supportsRange || rows.length < EMH_SCAN_PAGE_SIZE) return { matched, truncated: false, error: false };
  }
  return { matched, truncated: true, error: false };
}

async function handleEmailHashUnsubscribePost(
  supabase: ReturnType<typeof createServiceClient>,
  params: { emailHash: string; tokenBrokerId: string; nowIso: string },
): Promise<{ brokerUserId: string | null; brokerSlug: string; displayName: string | null; persisted: boolean }> {
  const { emailHash, tokenBrokerId, nowIso } = params;
  const broker = tokenBrokerId && tokenBrokerId !== "broker" ? await resolveBroker(supabase, tokenBrokerId) : null;
  const brokerUserId = broker?.userId ?? (isUuid(tokenBrokerId) ? tokenBrokerId : null);
  const brokerSlug = broker?.slug ?? (tokenBrokerId && tokenBrokerId !== "broker" ? tokenBrokerId : "");
  const displayName = broker ? await publicNameFor(supabase, broker) : null;

  const effectiveBrokerId = brokerUserId && isUuid(brokerUserId) ? brokerUserId : null;
  // P2-3: 결과를 확인한다. 사전 컷오버(email_suppressions 없음)면 ok:true·recordedToTable:false 로 돌아온다.
  const suppression = await recordEmailSuppressionByHash(supabase, {
    emailHash,
    brokerId: effectiveBrokerId,
    scope: effectiveBrokerId ? "broker" : "global",
    reason: "unsubscribe",
    source: "one_click_inbox",
  });
  const recordedToTable = suppression.ok && suppression.recordedToTable;
  if (!suppression.ok) {
    log.error("[Unsubscribe POST] emh suppression not recorded", { error: suppression.error ?? "unknown" });
  }

  let subscribersUpdated = 0;
  let clientsUpdated = 0;

  const brokerKeys = Array.from(new Set([brokerSlug, brokerUserId, tokenBrokerId].filter((k) => Boolean(k) && k !== "broker")));
  if (brokerKeys.length > 0) {
    try {
      const scan = await scanRowsByEmailHash<{ id?: unknown; status?: unknown; subscriber_email?: unknown }>(
        () =>
          supabase
            .from("magazine_subscribers")
            .select("id, status, subscriber_email")
            .in("broker_id", brokerKeys)
            .not("subscriber_email", "is", null),
        "subscriber_email",
        emailHash,
      );
      if (scan.truncated) log.warn("[Unsubscribe POST] emh subscriber scan reached cap", { pages: EMH_SCAN_MAX_PAGES });
      for (const s of scan.matched) {
        if (!s?.id) continue;
        if (s.status === "unsubscribed") {
          subscribersUpdated += 1; // 이미 해지 상태로 영속됨
          continue;
        }
        const upd = await markSubscriberRowUnsubscribed(supabase, String(s.id), nowIso);
        if (!upd.error) subscribersUpdated += 1;
        else log.error("[Unsubscribe POST] emh subscriber update failed", { code: upd.error.code });
      }
    } catch (err) {
      log.error("[Unsubscribe POST] emh subscriber sync threw", { error: err instanceof Error ? err.message : String(err) });
    }
  }

  if (effectiveBrokerId) {
    try {
      const scan = await scanRowsByEmailHash<{ id?: unknown; email?: unknown; tags?: unknown }>(
        () => supabase.from("broker_clients").select("id, email, tags").eq("broker_id", effectiveBrokerId).not("email", "is", null),
        "email",
        emailHash,
      );
      if (!scan.error && scan.matched.length > 0) {
        await syncClientRowsUnsubscribed(supabase, scan.matched, nowIso);
        clientsUpdated += scan.matched.length;
      }
    } catch (err) {
      log.error("[Unsubscribe POST] emh client sync threw", { error: err instanceof Error ? err.message : String(err) });
    }
  }

  // 어디에도 영속되지 않았으면(사전 컷오버 + 일치 행 없음) 해지 요청 자체를 감사 이벤트로라도 남긴다 —
  // 브로커 범위 event 는 수신거부 처리 근거로 보존되며(PERMANENT 대상), 실패 시 성공을 위장하지 않는다.
  let auditRecorded = false;
  if (!recordedToTable && subscribersUpdated === 0 && clientsUpdated === 0 && effectiveBrokerId) {
    try {
      const { error: evErr } = await supabase.from("activity_events").insert({
        actor_id: effectiveBrokerId,
        actor_role: "system",
        event_type: "magazine_unsubscribed",
        entity_type: "email",
        entity_id: effectiveBrokerId,
        metadata: { email_hash: emailHash, source: "one_click_inbox", suppression_table: false },
      });
      if (evErr) log.error("[Unsubscribe POST] emh opt-out audit insert failed", { code: evErr.code });
      else auditRecorded = true;
    } catch (err) {
      log.error("[Unsubscribe POST] emh opt-out audit threw", { error: err instanceof Error ? err.message : String(err) });
    }
  }
  const persisted = recordedToTable || subscribersUpdated > 0 || clientsUpdated > 0 || auditRecorded;
  if (!persisted) {
    log.error("[Unsubscribe POST] emh opt-out could not be persisted anywhere", { hasBroker: !!effectiveBrokerId });
  }

  return { brokerUserId: effectiveBrokerId, brokerSlug: brokerSlug || tokenBrokerId, displayName, persisted };
}

/** 토큰의 broker가 구독자 행의 broker와 같은지 확인 (slug ↔ uuid 혼재 과도기 허용). */
async function brokerMatches(
  supabase: ReturnType<typeof createServiceClient>,
  tokenBrokerId: string,
  subBrokerId: string | null,
): Promise<{ matches: boolean; brokerUserId: string | null; brokerSlug: string; displayName: string | null }> {
  const broker = await resolveBroker(supabase, tokenBrokerId);
  const keys = new Set<string>([tokenBrokerId]);
  if (broker) {
    keys.add(broker.userId);
    if (broker.slug) keys.add(broker.slug);
  }
  return {
    matches: !!subBrokerId && keys.has(subBrokerId),
    brokerUserId: broker?.userId ?? (isUuid(tokenBrokerId) ? tokenBrokerId : null),
    brokerSlug: broker?.slug ?? tokenBrokerId,
    displayName: broker ? await publicNameFor(supabase, broker) : null,
  };
}


function tokenFromUrl(url: URL): string {
  return url.searchParams.get("t") || url.searchParams.get("token") || "";
}

// GET /api/public/magazine/unsubscribe?t=... - 수신 거부 확인 화면 (상태 변경 없음)
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = tokenFromUrl(url);

  if (!token) return failureResponse("MALFORMED", false);

  const verified = verifyUnsubToken(token);
  if (!verified.ok) return failureResponse(verified.reason, false);

  // 중개인 표시명(가능하면, 공개 SSOT 규칙) + 이미 해지 여부 확인(상태 변경 없음). 실패해도 확인 화면은 보여 준다.
  let brandHtml = "";
  let brokerSlug = verified.brokerId;
  let alreadyUnsubscribed = false;
  try {
    const supabase = createServiceClient();
    const broker = await resolveBroker(supabase, verified.brokerId);
    if (broker?.slug) brokerSlug = broker.slug;
    const name = broker ? await publicNameFor(supabase, broker) : null;
    if (name) brandHtml = `<p class="brand">${escapeHtml(name)} 매거진</p>`;

    const cleanSubId = verified.subscriberId.replace(/^(?:cli[-_]|sub_|custom[-_])/, "");
    const emailHash = extractEmailHashFromUnsubId(cleanSubId);
    if (emailHash) {
      try {
        const { data: suppRows } = await supabase
          .from("email_suppressions")
          .select("scope, broker_id")
          .eq("email_hash", emailHash);
        if (Array.isArray(suppRows)) {
          const brokerUuid = broker?.userId && isUuid(broker.userId) ? broker.userId : null;
          alreadyUnsubscribed = suppRows.some(
            (r: { scope?: string; broker_id?: string | null }) =>
              r?.scope === "global" || (r?.scope === "broker" && brokerUuid && r?.broker_id === brokerUuid),
          );
        }
      } catch {
        // non-blocking
      }
    } else {
      const { data: sub } = await supabase
        .from("magazine_subscribers")
        .select("id, broker_id, status")
        .eq("id", cleanSubId)
        .maybeSingle();
      if ((sub as { status?: string | null } | null)?.status === "unsubscribed") {
        alreadyUnsubscribed = true;
      } else if (!sub && isUuid(cleanSubId)) {
        const { data: cli } = await supabase
          .from("broker_clients")
          .select("id, tags")
          .eq("id", cleanSubId)
          .maybeSingle();
        const cliTags = Array.isArray((cli as { tags?: unknown } | null)?.tags)
          ? ((cli as { tags?: unknown[] }).tags ?? []).map(String)
          : [];
        if (cliTags.some((t) => /수신거부|해지|unsub/i.test(t))) {
          alreadyUnsubscribed = true;
        }
      }
    }
  } catch (err) {
    log.warn("[Unsubscribe GET] broker/subscriber lookup failed", { error: err instanceof Error ? err.message : String(err) });
  }

  const resubHref = `/magazine/${encodeURIComponent(brokerSlug)}/subscribe`;
  const viewerHref = `/magazine/${encodeURIComponent(brokerSlug)}`;

  if (alreadyUnsubscribed) {
    return page(
      "이미 수신 거부 완료",
      `${brandHtml}
        <h1>이미 수신 거부가 완료된 상태입니다</h1>
        <p>더 이상 카카오톡과 이메일로 주간 매거진이 발송되지 않습니다.<br>다시 받아보시려면 아래 버튼을 눌러 주세요.</p>
        <div>
          <a class="action-link" href="${escapeHtml(resubHref)}">다시 구독 신청하기</a>
        </div>`,
    );
  }

  return page(
    "매거진 수신 거부",
    `${brandHtml}
      <h1>매거진 수신 거부</h1>
      <p>더 이상 이 중개사의 매거진을 받지 않으시겠습니까?<br>수신 거부 시 카카오톡과 이메일로 발송되는 주간 매거진이 모두 중단됩니다.<br>아래 버튼을 누르면 즉시 수신 거부가 처리됩니다.</p>
      <form method="POST" action="/api/public/magazine/unsubscribe">
        <input type="hidden" name="t" value="${escapeHtml(token)}">
        <button type="submit">수신 거부하기</button>
      </form>
      <div style="margin-top: 12px;">
        <a class="cancel-link" href="${escapeHtml(viewerHref)}">취소 · 계속 매거진 받기</a>
      </div>`,
  );
}

// POST /api/public/magazine/unsubscribe - 실제 구독 해지 처리
export async function POST(request: Request) {
  let asJson = false;
  try {
    const url = new URL(request.url);
    let token = tokenFromUrl(url);

    // form post / One-Click(urlencoded) 또는 json post 모두 대응
    const contentType = request.headers.get("content-type") || "";
    try {
      if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
        const formData = await request.formData();
        if (!token) {
          const f = formData.get("t") ?? formData.get("token");
          token = typeof f === "string" ? f : "";
        }
      } else if (contentType.includes("application/json")) {
        asJson = true;
        const body = (await request.json()) as { token?: unknown; t?: unknown } | null;
        if (!token) {
          const b = body?.t ?? body?.token;
          token = typeof b === "string" ? b : "";
        }
      }
    } catch {
      return failureResponse("MALFORMED", asJson);
    }

    if (!token) return failureResponse("MALFORMED", asJson);

    const verified = verifyUnsubToken(token);
    if (!verified.ok) return failureResponse(verified.reason, asJson);

    const { subscriberId, brokerId } = verified;
    const supabase = createServiceClient();

    // 구독자 조회 (`emh_<sha256>` 이메일 해시 우선, 아니면 magazine_subscribers → CRM broker_clients 폴백)
    const cleanSubId = subscriberId.replace(/^(?:cli[-_]|sub_|custom[-_])/, "");
    const emailHash = extractEmailHashFromUnsubId(cleanSubId);
    const nowIso = new Date().toISOString();

    if (emailHash) {
      const hashRes = await handleEmailHashUnsubscribePost(supabase, {
        emailHash,
        tokenBrokerId: brokerId,
        nowIso,
      });
      if (!hashRes.persisted) {
        // P2-3: 어디에도 기록하지 못했으면 성공을 위장하지 않는다(재시도 안내 · 503 고정 문구)
        return failureResponse("NO_SECRET", asJson);
      }
      if (asJson) return NextResponse.json({ ok: true });

      const brand = hashRes.displayName ? `<p class="brand">${escapeHtml(hashRes.displayName)} 매거진</p>` : "";
      const resubHref =
        hashRes.brokerSlug && hashRes.brokerSlug !== "broker"
          ? `/magazine/${encodeURIComponent(hashRes.brokerSlug)}/subscribe`
          : "/magazine";
      return page(
        "수신 거부 완료",
        `${brand}
          <h1>수신 거부가 완료되었습니다</h1>
          <p>더 이상 매거진을 발송하지 않습니다.<br>언제든 중개인 명함의 구독 링크로 다시 구독하실 수 있습니다.</p>
          <div>
            <a class="action-link" href="${escapeHtml(resubHref)}">실수로 누르셨나요? 다시 구독 신청하기</a>
          </div>`,
      );
    }

    const { data: sub, error: subErr } = await supabase
      .from("magazine_subscribers")
      .select("id, broker_id, status, subscriber_email")
      .eq("id", cleanSubId)
      .maybeSingle();
    if (subErr) {
      log.error("[Unsubscribe POST] subscriber lookup error:", subErr.message);
      return failureResponse("NO_SECRET", asJson); // 503: 일시 오류 문구
    }

    let match: Awaited<ReturnType<typeof brokerMatches>> | null = null;

    if (sub) {
      match = await brokerMatches(supabase, brokerId, (sub as { broker_id: string | null }).broker_id);
      if (!match.matches) {
        log.warn("[Unsubscribe POST] broker binding mismatch", { subscriberId });
        return failureResponse("BINDING_MISMATCH", asJson);
      }

      const subEmail = normalizeSuppressionEmail((sub as { subscriber_email?: string | null }).subscriber_email);
      if (subEmail) {
        await recordEmailSuppression(supabase, {
          email: subEmail,
          brokerId: match.brokerUserId || brokerId,
          scope: "broker",
          reason: "unsubscribe",
          source: "unsubscribe_link",
        });
      }

      // 해지 처리 (이미 해지된 구독자도 broker_clients & email_suppressions 동기화)
      if ((sub as { status: string | null }).status !== "unsubscribed") {
        const upd = await markSubscriberRowUnsubscribed(supabase, cleanSubId, nowIso);
        if (upd.error) {
          log.error("[Unsubscribe POST] Database update error:", upd.error.message);
          return failureResponse("NO_SECRET", asJson);
        }
      }

      // 동일 브로커·이메일의 CRM 고객(broker_clients)도 함께 수신거부 동기화
      if (subEmail && match.brokerUserId && isUuid(match.brokerUserId)) {
        try {
          const { data: matchingClients } = await supabase
            .from("broker_clients")
            .select("id, tags")
            .eq("broker_id", match.brokerUserId)
            .eq("email", subEmail);
          await syncClientRowsUnsubscribed(
            supabase,
            Array.isArray(matchingClients) ? matchingClients : [],
            nowIso,
          );
        } catch {
          // non-blocking
        }
      }

      if (match.brokerUserId && isUuid(match.brokerUserId)) {
        const { error: evErr } = await supabase.from("activity_events").insert({
          actor_id: match.brokerUserId,
          actor_role: "system",
          event_type: "magazine_unsubscribed",
          entity_type: "magazine_subscribers",
          entity_id: cleanSubId,
          metadata: { subscriber_id: cleanSubId },
        });
        if (evErr) log.warn("[Unsubscribe POST] activity_events insert failed", { error: evErr.message });
      }
    } else if (isUuid(cleanSubId)) {
      let { data: cli, error: cliErr } = await supabase
        .from("broker_clients")
        .select("id, broker_id, email, tags")
        .eq("id", cleanSubId)
        .maybeSingle();
      if (cliErr && isMissingColumnError(cliErr)) {
        const fb = await supabase
          .from("broker_clients")
          .select("id, broker_id, tags")
          .eq("id", cleanSubId)
          .maybeSingle();
        cli = fb.data as typeof cli;
        cliErr = fb.error;
      }
      if (cliErr) {
        log.error("[Unsubscribe POST] broker_clients lookup error:", cliErr.message);
        return failureResponse("NO_SECRET", asJson);
      }
      if (!cli) return failureResponse("NOT_FOUND", asJson);

      match = await brokerMatches(supabase, brokerId, (cli as { broker_id: string | null }).broker_id);
      if (!match.matches) {
        log.warn("[Unsubscribe POST] broker client binding mismatch", { subscriberId: cleanSubId });
        return failureResponse("BINDING_MISMATCH", asJson);
      }

      const cliEmail = normalizeSuppressionEmail((cli as { email?: string | null }).email);
      if (cliEmail) {
        await recordEmailSuppression(supabase, {
          email: cliEmail,
          brokerId: match.brokerUserId || brokerId,
          scope: "broker",
          reason: "unsubscribe",
          source: "unsubscribe_link",
        });
      }

      const prevTags = Array.isArray((cli as { tags?: unknown }).tags)
        ? ((cli as { tags?: unknown[] }).tags ?? []).map(String)
        : [];
      const nextTags = Array.from(
        new Set([...prevTags.filter((t: string) => !/뉴스레터구독|newsletter|수신동의|수신확인대기/i.test(t)), "수신거부"]),
      );
      let cliUpd = await supabase
        .from("broker_clients")
        .update({ tags: nextTags, consent_status: "unsubscribed", unsubscribed_at: nowIso })
        .eq("id", cleanSubId);
      if (cliUpd.error && isMissingColumnError(cliUpd.error)) {
        cliUpd = await supabase.from("broker_clients").update({ tags: nextTags }).eq("id", cleanSubId);
      }
      if (cliUpd.error) {
        log.error("[Unsubscribe POST] CRM client update error:", cliUpd.error.message);
        return failureResponse("NO_SECRET", asJson);
      }

      if (cliEmail) {
        try {
          const brokerKeys = Array.from(new Set([match.brokerSlug, match.brokerUserId, brokerId].filter(Boolean)));
          await supabase
            .from("magazine_subscribers")
            .update({ status: "unsubscribed", unsubscribed_at: nowIso })
            .in("broker_id", brokerKeys)
            .eq("subscriber_email", cliEmail);
        } catch {
          // non-blocking
        }
      }

      if (match.brokerUserId && isUuid(match.brokerUserId)) {
        await supabase.from("activity_events").insert({
          actor_id: match.brokerUserId,
          actor_role: "system",
          event_type: "magazine_unsubscribed",
          entity_type: "broker_clients",
          entity_id: cleanSubId,
          metadata: { client_id: cleanSubId },
        });
      }
    } else {
      return failureResponse("NOT_FOUND", asJson);
    }

    if (asJson) return NextResponse.json({ ok: true });

    const brand = match.displayName ? `<p class="brand">${escapeHtml(match.displayName)} 매거진</p>` : "";
    const resubHref = `/magazine/${encodeURIComponent(match.brokerSlug)}/subscribe`;
    return page(
      "수신 거부 완료",
      `${brand}
        <h1>수신 거부가 완료되었습니다</h1>
        <p>더 이상 매거진을 발송하지 않습니다.<br>언제든 중개인 명함의 구독 링크로 다시 구독하실 수 있습니다.</p>
        <div>
          <a class="action-link" href="${escapeHtml(resubHref)}">실수로 누르셨나요? 다시 구독 신청하기</a>
        </div>`,
    );
  } catch (err) {
    log.error("[Unsubscribe POST] Unexpected error:", err instanceof Error ? err.message : String(err));
    return failureResponse("NO_SECRET", asJson);
  }
}
