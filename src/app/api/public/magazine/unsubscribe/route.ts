import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyUnsubToken, type UnsubVerifyFailure } from "@/domain/magazine/unsub-token";
import { resolveBroker } from "@/lib/magazine/resolve-broker";
import { escapeHtml } from "@/lib/magazine/escape";
import { isMissingColumnError } from "@/lib/magazine/subscriber-view";
import { isUuid } from "@/lib/magazine/slug";

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
  .card { background: #ffffff; padding: 24px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); text-align: center; max-width: 400px; width: 100%; border: 1px solid #e5e7eb; }
  .brand { margin: 0 0 8px; font-size: 13px; font-weight: 600; color: #4b5563; }
  h1 { margin: 0 0 12px; color: #111827; font-size: 18px; line-height: 1.4; }
  p { color: #374151; font-size: 14px; margin: 0 0 24px; line-height: 1.6; }
  button { background-color: #dc2626; color: #ffffff; border: 0; padding: 12px 20px; min-height: 44px; min-width: 44px; font-size: 15px; font-weight: 600; border-radius: 8px; cursor: pointer; }
  button:hover { background-color: #b91c1c; }
  button:focus-visible { outline: 3px solid #111827; outline-offset: 2px; }
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

/** 토큰의 broker가 구독자 행의 broker와 같은지 확인 (slug ↔ uuid 혼재 과도기 허용). */
async function brokerMatches(
  supabase: ReturnType<typeof createServiceClient>,
  tokenBrokerId: string,
  subBrokerId: string | null,
): Promise<{ matches: boolean; brokerUserId: string | null; displayName: string | null }> {
  const broker = await resolveBroker(supabase, tokenBrokerId);
  const keys = new Set<string>([tokenBrokerId]);
  if (broker) {
    keys.add(broker.userId);
    if (broker.slug) keys.add(broker.slug);
  }
  return {
    matches: !!subBrokerId && keys.has(subBrokerId),
    brokerUserId: broker?.userId ?? (isUuid(tokenBrokerId) ? tokenBrokerId : null),
    displayName: broker?.displayName ?? null,
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

  // 중개인 표시명(가능하면). 실패해도 확인 화면은 보여 준다.
  let brandHtml = "";
  try {
    const broker = await resolveBroker(createServiceClient(), verified.brokerId);
    if (broker?.displayName) brandHtml = `<p class="brand">${escapeHtml(broker.displayName)} 매거진</p>`;
  } catch (err) {
    log.warn("[Unsubscribe GET] broker lookup failed", { error: err instanceof Error ? err.message : String(err) });
  }

  return page(
    "매거진 수신 거부",
    `${brandHtml}
      <h1>매거진 수신 거부</h1>
      <p>더 이상 이 중개사의 매거진을 받지 않으시겠습니까?<br>아래 버튼을 누르면 즉시 수신 거부가 처리됩니다.</p>
      <form method="POST" action="/api/public/magazine/unsubscribe">
        <input type="hidden" name="t" value="${escapeHtml(token)}">
        <button type="submit">수신 거부하기</button>
      </form>`,
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

    // 구독자 조회 + broker 바인딩 확인
    const { data: sub, error: subErr } = await supabase
      .from("magazine_subscribers")
      .select("id, broker_id, status")
      .eq("id", subscriberId)
      .maybeSingle();
    if (subErr) {
      log.error("[Unsubscribe POST] subscriber lookup error:", subErr.message);
      return failureResponse("NO_SECRET", asJson); // 503: 일시 오류 문구
    }
    if (!sub) return failureResponse("NOT_FOUND", asJson);

    const match = await brokerMatches(supabase, brokerId, (sub as { broker_id: string | null }).broker_id);
    if (!match.matches) {
      log.warn("[Unsubscribe POST] broker binding mismatch", { subscriberId });
      return failureResponse("BINDING_MISMATCH", asJson);
    }

    // 해지 처리 (이미 해지된 구독자는 멱등 처리)
    if ((sub as { status: string | null }).status !== "unsubscribed") {
      const nowIso = new Date().toISOString();
      let upd = await supabase
        .from("magazine_subscribers")
        .update({ status: "unsubscribed", unsubscribed_at: nowIso })
        .eq("id", subscriberId);
      if (upd.error && isMissingColumnError(upd.error)) {
        // unsubscribed_at 컬럼이 없는 DB — status만 갱신
        upd = await supabase.from("magazine_subscribers").update({ status: "unsubscribed" }).eq("id", subscriberId);
      }
      if (upd.error) {
        log.error("[Unsubscribe POST] Database update error:", upd.error.message);
        return failureResponse("NO_SECRET", asJson);
      }

      // 시스템 이벤트 적재 (analytics 목적) — PII 미포함, actor_id는 uuid(broker user id)만
      if (match.brokerUserId && isUuid(match.brokerUserId)) {
        const { error: evErr } = await supabase.from("activity_events").insert({
          actor_id: match.brokerUserId,
          actor_role: "system",
          event_type: "magazine_unsubscribed",
          entity_type: "magazine_subscribers",
          entity_id: subscriberId,
          metadata: { subscriber_id: subscriberId },
        });
        if (evErr) log.warn("[Unsubscribe POST] activity_events insert failed", { error: evErr.message });
      }
    }

    if (asJson) return NextResponse.json({ ok: true });

    const brand = match.displayName ? `<p class="brand">${escapeHtml(match.displayName)} 매거진</p>` : "";
    return page(
      "수신 거부 완료",
      `${brand}
        <h1>수신 거부가 완료되었습니다</h1>
        <p>더 이상 매거진을 발송하지 않습니다.<br>언제든 중개인 명함의 구독 링크로 다시 구독하실 수 있습니다.</p>`,
    );
  } catch (err) {
    log.error("[Unsubscribe POST] Unexpected error:", err instanceof Error ? err.message : String(err));
    return failureResponse("NO_SECRET", asJson);
  }
}
