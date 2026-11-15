import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { recordEvent, MvpEventType, MvpEntityType } from "@/domain/analytics/record-event";
import { checkRateLimit } from "@/lib/rate-limiter";
import { getClientIp } from "@/lib/magazine/public-guard";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("public-events-route");

const MAX_BODY_BYTES = 8 * 1024;
const MAX_METADATA_JSON_LENGTH = 4096;
const MAX_ID_LENGTH = 128;

const PUBLIC_ALLOWED_EVENT_TYPES = new Set([
  "im_section_viewed",
  "im_scroll_depth",
  "im_cta_clicked",
  "im_viewed",
  "teaser_viewed",
  "dealcard_viewed",
]);

const PUBLIC_ALLOWED_ENTITY_TYPES = new Set([
  "building",
  "im",
  "deal_card",
  "teaser",
]);

const SHARE_ALLOWED_EVENT_TYPES = new Set([
  "view",
  "click",
  "scroll",
  "cta_click",
]);

function sanitizeIdentifier(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\u0000-\u001F\u007F]/g, "").trim();
  if (!cleaned || cleaned.length > MAX_ID_LENGTH) return null;
  return cleaned;
}

function sanitizeMetadata(
  raw: unknown,
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  if (raw === undefined || raw === null) {
    return { ok: true, value: {} };
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "유효하지 않은 메타데이터 형식입니다." };
  }
  const safeMetadata: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
    safeMetadata[k] = v;
  }
  let serialized: string;
  try {
    serialized = JSON.stringify(safeMetadata);
  } catch {
    return { ok: false, error: "유효하지 않은 메타데이터 형식입니다." };
  }
  if (serialized.length > MAX_METADATA_JSON_LENGTH) {
    return { ok: false, error: "메타데이터 크기가 허용 한도를 초과했습니다." };
  }
  return { ok: true, value: safeMetadata };
}

/**
 * POST /api/public/events
 * Strictly allowlisted anonymous public read-engagement telemetry only.
 */
export async function POST(request: NextRequest) {
  try {
    const clientIp = getClientIp(request) ?? "unknown";
    const allowed = await checkRateLimit(clientIp, "public_events_post", 60, 60_000);
    if (!allowed) {
      return NextResponse.json(
        { error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
        { status: 429 },
      );
    }

    const declaredLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      return NextResponse.json(
        { error: "요청 크기가 허용 한도를 초과했습니다." },
        { status: 413 },
      );
    }

    const rawText = await request.text();
    if (Buffer.byteLength(rawText, "utf8") > MAX_BODY_BYTES) {
      return NextResponse.json(
        { error: "요청 크기가 허용 한도를 초과했습니다." },
        { status: 413 },
      );
    }

    let body: Record<string, unknown>;
    try {
      const parsed = rawText.length > 0 ? JSON.parse(rawText) : null;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return NextResponse.json(
          { error: "요청 형식이 올바르지 않습니다." },
          { status: 400 },
        );
      }
      body = parsed as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { error: "요청 형식이 올바르지 않습니다." },
        { status: 400 },
      );
    }

    const { type, shareId, eventType, entityType, entityId, metadata } = body;

    const metaCheck = sanitizeMetadata(metadata);
    if (!metaCheck.ok) {
      return NextResponse.json({ error: metaCheck.error }, { status: 400 });
    }
    const safeMetadata = metaCheck.value;

    const supabase = createServiceClient();

    if (type === "share_event") {
      const safeShareId = sanitizeIdentifier(shareId);
      if (!safeShareId || typeof eventType !== "string" || !eventType.trim()) {
        return NextResponse.json(
          { error: "shareId와 eventType이 필요합니다." },
          { status: 400 },
        );
      }
      if (!SHARE_ALLOWED_EVENT_TYPES.has(eventType)) {
        return NextResponse.json(
          { error: "허용되지 않은 이벤트 유형입니다." },
          { status: 400 },
        );
      }

      const { data, error } = await supabase
        .from("content_share_events")
        .insert({
          share_id: safeShareId,
          viewer_id: null,
          event_type: eventType,
          metadata: safeMetadata,
        })
        .select()
        .single();

      if (error) {
        log.error("[api/public/events] share_event insert failed:", error.message);
        return NextResponse.json(
          { error: "이벤트 처리 중 오류가 발생했습니다." },
          { status: 500 },
        );
      }

      return NextResponse.json({ success: true, data });
    }

    if (type !== undefined && type !== "activity_event") {
      return NextResponse.json(
        { error: "허용되지 않은 이벤트 유형입니다." },
        { status: 400 },
      );
    }

    if (typeof eventType !== "string" || !PUBLIC_ALLOWED_EVENT_TYPES.has(eventType)) {
      return NextResponse.json(
        { error: "허용되지 않은 이벤트 유형입니다." },
        { status: 400 },
      );
    }

    if (typeof entityType !== "string" || !PUBLIC_ALLOWED_ENTITY_TYPES.has(entityType)) {
      return NextResponse.json(
        { error: "허용되지 않은 엔티티 유형입니다." },
        { status: 400 },
      );
    }

    const safeEntityId = sanitizeIdentifier(entityId);
    if (!safeEntityId) {
      return NextResponse.json(
        { error: "유효하지 않은 entityId입니다." },
        { status: 400 },
      );
    }

    const result = await recordEvent(supabase, {
      actorId: null,
      actorRole: "anonymous",
      eventType: eventType as MvpEventType,
      entityType: entityType as MvpEntityType,
      entityId: safeEntityId,
      metadata: safeMetadata,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (err: unknown) {
    log.error(
      "[api/public/events] POST Error:",
      err instanceof Error ? err.message : String(err),
    );
    return NextResponse.json(
      { error: "이벤트 처리 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
