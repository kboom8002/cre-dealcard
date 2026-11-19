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
  "client_error_reported",
  "survey_response",
]);

const PUBLIC_ALLOWED_ENTITY_TYPES = new Set([
  "building",
  "im",
  "deal_card",
  "teaser",
  "system",
]);

const SHARE_ALLOWED_EVENT_TYPES = new Set([
  "view",
  "click",
  "scroll",
  "cta_click",
]);

const EMAIL_PII_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_PII_PATTERN =
  /(?<!\d)(?:\+?82[-\s.]?)?0\d{1,2}[-\s.]?\d{3,4}[-\s.]?\d{4}(?!\d)/g;
const RRN_PII_PATTERN = /(?<!\d)\d{6}[-\s]?[1-4]\d{6}(?!\d)/g;

const MAX_METADATA_DEPTH = 4;
const MAX_METADATA_KEYS = 32;
const MAX_METADATA_ARRAY_ITEMS = 32;
const MAX_METADATA_STRING_LEN = 500;
const FORBIDDEN_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function redactPiiText(raw: string, maxLen: number): string {
  const preBounded = raw
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .trim()
    .slice(0, Math.max(maxLen * 2, 1000));
  const redacted = preBounded
    .replace(EMAIL_PII_PATTERN, "[REDACTED]")
    .replace(PHONE_PII_PATTERN, "[REDACTED]")
    .replace(RRN_PII_PATTERN, "[REDACTED]")
    .trim();
  return redacted.slice(0, maxLen);
}

function redactMetadataValueDeep(value: unknown, depth: number): unknown {
  if (value === null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    return redactPiiText(value, MAX_METADATA_STRING_LEN);
  }
  if (depth >= MAX_METADATA_DEPTH) {
    return undefined;
  }
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    for (const item of value.slice(0, MAX_METADATA_ARRAY_ITEMS)) {
      const sanitizedItem = redactMetadataValueDeep(item, depth + 1);
      if (sanitizedItem !== undefined) {
        out.push(sanitizedItem);
      }
    }
    return out;
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    let keyCount = 0;
    for (const [rawKey, rawVal] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_OBJECT_KEYS.has(rawKey)) continue;
      if (keyCount >= MAX_METADATA_KEYS) break;
      const safeKey = redactPiiText(rawKey, 80);
      if (!safeKey || FORBIDDEN_OBJECT_KEYS.has(safeKey)) continue;
      const sanitizedVal = redactMetadataValueDeep(rawVal, depth + 1);
      if (sanitizedVal !== undefined) {
        out[safeKey] = sanitizedVal;
        keyCount += 1;
      }
    }
    return out;
  }
  return undefined;
}

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
  let rawSerialized: string;
  try {
    rawSerialized = JSON.stringify(raw);
  } catch {
    return { ok: false, error: "유효하지 않은 메타데이터 형식입니다." };
  }
  if (rawSerialized.length > MAX_METADATA_JSON_LENGTH) {
    return { ok: false, error: "메타데이터 크기가 허용 한도를 초과했습니다." };
  }
  const safeMetadata = redactMetadataValueDeep(raw, 0) as Record<string, unknown>;
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
 * Strictly allowlists non-PII bounded fields for anonymous `survey_response` telemetry.
 */
function sanitizeSurveyMetadata(raw: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};

  if (typeof raw.survey_id === "string") {
    const id = redactPiiText(raw.survey_id, MAX_ID_LENGTH);
    if (id) clean.survey_id = id;
  }

  const clampNumericScore = (val: unknown): number | null => {
    if (typeof val !== "number" || !Number.isFinite(val)) return null;
    return Math.max(-100, Math.min(100, val));
  };

  const rating = clampNumericScore(raw.rating);
  if (rating !== null) clean.rating = rating;

  const score = clampNumericScore(raw.score);
  if (score !== null) clean.score = score;

  if (typeof raw.choice === "string") {
    const choice = redactPiiText(raw.choice, 120);
    if (choice) clean.choice = choice;
  }
  if (typeof raw.category === "string") {
    const category = redactPiiText(raw.category, 120);
    if (category) clean.category = category;
  }
  if (typeof raw.page === "string") {
    const page = redactPiiText(raw.page, 200);
    if (page) clean.page = page;
  }
  if (typeof raw.trigger === "string") {
    const trigger = redactPiiText(raw.trigger, 200);
    if (trigger) clean.trigger = trigger;
  }
  if (typeof raw.comment === "string") {
    const comment = redactPiiText(raw.comment, 500);
    if (comment) clean.comment = comment;
  }

  // Backward-compatible mapping when SurveyProvider/caller passes `response`
  if (clean.rating === undefined && clean.score === undefined && typeof raw.response === "number") {
    const respRating = clampNumericScore(raw.response);
    if (respRating !== null) clean.rating = respRating;
  } else if (
    clean.comment === undefined &&
    clean.choice === undefined &&
    typeof raw.response === "string"
  ) {
    const respComment = redactPiiText(raw.response, 500);
    if (respComment) clean.comment = respComment;
  }

  return clean;
}

/**
 * POST /api/public/events
 * Strictly allowlisted anonymous public read-engagement & survey telemetry only.
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

    const resolvedEntityType =
      entityType === undefined && eventType === "survey_response" ? "system" : entityType;

    if (
      typeof resolvedEntityType !== "string" ||
      !PUBLIC_ALLOWED_ENTITY_TYPES.has(resolvedEntityType)
    ) {
      return NextResponse.json(
        { error: "허용되지 않은 엔티티 유형입니다." },
        { status: 400 },
      );
    }

    // P1-1 (WP-7.3A): client error & survey telemetry carry no entity row, so `entityId`
    // is optional for `system` events only.
    const isSystemEvent = resolvedEntityType === "system";
    const safeEntityId = sanitizeIdentifier(entityId);
    if (!safeEntityId && !(isSystemEvent && (entityId === undefined || entityId === null))) {
      return NextResponse.json(
        { error: "유효하지 않은 entityId입니다." },
        { status: 400 },
      );
    }

    const finalMetadata =
      eventType === "survey_response"
        ? sanitizeSurveyMetadata(safeMetadata)
        : safeMetadata;

    // `activity_events.entity_id` is uuid — non-uuid identifiers are preserved in
    // metadata.entity_ref by recordEvent() instead of failing the insert (22P02).
    const result = await recordEvent(supabase, {
      actorId: null,
      actorRole: "anonymous",
      eventType: eventType as MvpEventType,
      entityType: resolvedEntityType as MvpEntityType,
      entityId: safeEntityId ?? undefined,
      metadata: finalMetadata,
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
