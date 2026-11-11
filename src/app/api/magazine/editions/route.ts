import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod/v4";
import { createServiceClient } from "@/lib/supabase/service";
import { generateWeeklyMagazine } from "@/domain/magazine/weekly-generator";
import {
  requireBrokerContext,
  assertOwnsRow,
  notFoundResponse,
  jsonError,
  type BrokerCtx,
} from "@/lib/magazine/authz";
import { resolveBroker } from "@/lib/magazine/resolve-broker";
import { currentWeekLabel } from "@/lib/magazine/kst";
import { defaultLabelForEditionType } from "@/lib/magazine/edition-draft";
import { GENERIC_ERROR_MESSAGE } from "@/lib/magazine/user-message";
import { parseEditionContentDraft } from "@/domain/magazine/edition-content.schema";
import { loadBrokerNewsletterPreferences } from "@/app/api/broker/magazine/preferences/route";
import { getInboxState } from "@/lib/im-lite/quick-generate-store";

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('route');


export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// 공통
// ---------------------------------------------------------------------------

const TOKEN_RE = /^[a-z][a-z0-9_]{0,29}$/;

/** 공개 응답에 허용하는 컬럼 (published 뷰어가 쓰는 컬럼과 동일 — 내부 필드 비노출). */
const PUBLIC_COLUMNS =
  "id, broker_id, edition_type, edition_label, status, title, market_temp, cover_keywords, cover_image_url, field_note, theme_title, theme_body_md, theme_asset_types, theme_color, content, published_at, created_at";

const GetQuerySchema = z.object({
  broker_id: z.string().min(1).max(100),
  type: z.string().regex(TOKEN_RE).default("weekly"),
  status: z.string().regex(TOKEN_RE).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

/** 로그인한 소유자인지 소프트 판정. 비로그인/불일치는 공개 조회로 취급(fail-closed: published만). */
async function softOwnerContext(request: NextRequest, brokerParam: string): Promise<BrokerCtx | null> {
  const { ctx } = await requireBrokerContext(request);
  if (!ctx) return null;
  return ctx.brokerKeys.includes(brokerParam) ? ctx : null;
}

// ---------------------------------------------------------------------------
// GET /api/magazine/editions
// Query params: broker_id (required), type, status, limit
//  - 공개(비로그인·타 브로커): published만. 그 외 status 요청은 404(존재 비노출).
//  - 소유자(로그인 + 소유 slug/uuid): draft 포함 전체
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const parsed = GetQuerySchema.safeParse({
    broker_id: searchParams.get("broker_id") ?? undefined,
    type: searchParams.get("type") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return jsonError("INVALID_INPUT", "broker_id 파라미터가 필요하며 올바른 형식이어야 합니다.", 400);
  }
  const { broker_id: brokerParam, type: editionType, status, limit } = parsed.data;

  const supabase = createServiceClient();

  if (brokerParam === "me") {
    const { ctx, error: authErr } = await requireBrokerContext(request);
    if (authErr || !ctx) {
      return authErr ?? jsonError("UNAUTHORIZED", "로그인이 필요합니다.", 401);
    }

    let selfQuery = supabase
      .from("magazine_editions")
      .select("*", { count: "exact" })
      .in("broker_id", ctx.brokerKeys)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (editionType && editionType !== "all") {
      selfQuery = selfQuery.eq("edition_type", editionType);
    }
    if (status) {
      selfQuery = selfQuery.eq("status", status);
    }

    const loadBrokerClientsSafely = async () => {
      try {
        const withEmail = await supabase
          .from("broker_clients")
          .select("id, display_name, phone, email, tier, tags")
          .eq("broker_id", ctx.userId);
        if ((withEmail as any)?.error?.code === "42703") {
          return await supabase
            .from("broker_clients")
            .select("id, display_name, phone, tier, tags")
            .eq("broker_id", ctx.userId);
        }
        return withEmail;
      } catch {
        return { data: null };
      }
    };

    const [{ data, count, error }, subRes, brokerPreferences, brokerClientsRes, clientEventsRes] = await Promise.all([
      selfQuery,
      supabase
        .from("magazine_subscribers")
        .select("*", { count: "exact" })
        .in("broker_id", ctx.brokerKeys),
      loadBrokerNewsletterPreferences(supabase, ctx.userId),
      loadBrokerClientsSafely(),
      Promise.resolve(
        supabase
          .from("activity_events")
          .select("id, event_type, metadata, created_at")
          .eq("actor_id", ctx.userId)
          .in("event_type", ["custom_client_upserted", "gate_request_approved", "magazine_unsubscribed"])
          .order("created_at", { ascending: false })
          .limit(100)
      ).catch(() => ({ data: null })),
    ]);

    if (error) {
      log.error("[api/magazine/editions/GET:me]", error.message);
      return jsonError("INTERNAL_ERROR", GENERIC_ERROR_MESSAGE, 500);
    }

    const normalizeSubKey = (
      phone?: unknown,
      email?: unknown,
      name?: unknown,
      fallbackId?: unknown
    ): string => {
      const rawPhone = typeof phone === "string" ? phone.trim() : "";
      let digits = rawPhone.replace(/\D/g, "");
      if (digits.startsWith("82") && digits.length >= 11) {
        digits = "0" + digits.slice(digits.startsWith("820") ? 3 : 2);
      }
      if (digits.length >= 9) {
        return `tel:${digits}`;
      }
      const rawEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
      if (rawEmail) return `email:${rawEmail}`;
      const rawName = typeof name === "string" ? name.trim() : "";
      if (rawName) return `name:${rawName}`;
      const rawId = typeof fallbackId === "string" ? fallbackId.trim() : "";
      return rawId ? `id:${rawId}` : "";
    };

    const subscriberKeys = new Set<string>();
    const highInterestKeys = new Set<string>();
    const dbUnsubscribedAt = new Map<string, number>();
    const eventUnsubscribedKeys = new Set<string>();
    const buyerKeys = new Set<string>();
    const sellerKeys = new Set<string>();

    const recordDbUnsub = (k: string, unsubTs: number) => {
      if (!k) return;
      const prev = dbUnsubscribedAt.get(k);
      if (prev === undefined || unsubTs > prev) {
        dbUnsubscribedAt.set(k, unsubTs);
      }
    };

    const subRows = Array.isArray((subRes as any)?.data) ? (subRes as any).data : [];
    for (const s of subRows) {
      const phoneVal = s?.subscriber_phone ?? s?.phone;
      const emailVal = s?.subscriber_email ?? s?.email;
      const nameVal = s?.subscriber_name ?? s?.name;
      const statusVal = String(s?.status ?? "active").toLowerCase();
      const segVal = String(s?.segment ?? "investor").toLowerCase();
      const k = normalizeSubKey(phoneVal, emailVal, nameVal, s?.id);
      if (statusVal === "unsubscribed" || statusVal === "inactive") {
        const rawTs = Date.parse(String(s?.unsubscribed_at ?? s?.updated_at ?? ""));
        const unsubTs = Number.isFinite(rawTs) ? rawTs : Number.POSITIVE_INFINITY;
        recordDbUnsub(k, unsubTs);
        recordDbUnsub(normalizeSubKey(phoneVal), unsubTs);
        recordDbUnsub(normalizeSubKey(undefined, emailVal), unsubTs);
      } else if (statusVal === "active" && k) {
        subscriberKeys.add(k);
        if (segVal === "seller" || segVal === "owner") {
          sellerKeys.add(k);
        } else if (segVal === "buyer" || segVal === "investor") {
          buyerKeys.add(k);
        }
      }
    }
    if (subRows.length === 0 && typeof subRes?.count === "number" && subRes.count > 0) {
      for (let i = 0; i < subRes.count; i++) {
        subscriberKeys.add(`mag-sub-${i}`);
      }
    }

    const dbClientRows = Array.isArray((brokerClientsRes as any)?.data) ? (brokerClientsRes as any).data : [];
    for (const c of dbClientRows) {
      const tags = Array.isArray(c?.tags) ? c.tags.map((t: unknown) => String(t)) : [];
      const isVip = String(c?.tier || "").toLowerCase() === "vip" || tags.includes("VIP") || tags.includes("high_interest");
      const subscribed =
        isVip ||
        tags.some((t: string) => /뉴스레터|구독|newsletter|subscribe/i.test(t));
      const key = normalizeSubKey(c?.phone, c?.email, c?.display_name, c?.id);
      if (key && subscribed) {
        subscriberKeys.add(key);
        if (tags.some((t: string) => /매도|건물주|seller|owner/i.test(t))) {
          sellerKeys.add(key);
        } else {
          buyerKeys.add(key);
        }
      }
      if (key && isVip) {
        highInterestKeys.add(key);
      }
    }

    const rawEventRows = Array.isArray((clientEventsRes as any)?.data) ? (clientEventsRes as any).data : [];
    const eventRows = [...rawEventRows].sort((a, b) => {
      const ta = typeof a?.created_at === "string" ? Date.parse(a.created_at) : 0;
      const tb = typeof b?.created_at === "string" ? Date.parse(b.created_at) : 0;
      if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return tb - ta;
      return 0;
    });
    const decidedEventKeys = new Set<string>();

    for (const ev of eventRows) {
      const meta = (ev?.metadata && typeof ev.metadata === "object" ? ev.metadata : {}) as Record<string, unknown>;
      const evTs = typeof ev?.created_at === "string" ? Date.parse(ev.created_at) : Number.NaN;
      if (ev?.event_type === "magazine_unsubscribed") {
        const unsubKey = normalizeSubKey(
          meta.subscriber_phone ?? meta.phone,
          meta.subscriber_email ?? meta.email,
          meta.subscriber_name ?? meta.name
        );
        if (unsubKey && !decidedEventKeys.has(unsubKey)) {
          decidedEventKeys.add(unsubKey);
          eventUnsubscribedKeys.add(unsubKey);
        }
      } else if (ev?.event_type === "custom_client_upserted") {
        const key = normalizeSubKey(
          meta.client_phone ?? meta.phone,
          meta.client_email ?? meta.email,
          meta.client_name ?? meta.name,
          meta.client_id ?? ev.id
        );
        if (!key || decidedEventKeys.has(key)) continue;
        decidedEventKeys.add(key);
        const subscribed = meta.newsletter_subscribed !== false;
        const isVip =
          String(meta.client_grade ?? meta.grade ?? meta.tier ?? "").toUpperCase() === "VIP";
        if (subscribed) {
          const prevDbUnsub = dbUnsubscribedAt.get(key);
          if (prevDbUnsub !== undefined && Number.isFinite(evTs) && evTs > prevDbUnsub) {
            dbUnsubscribedAt.delete(key);
          }
          subscriberKeys.add(key);
          buyerKeys.add(key);
        } else {
          eventUnsubscribedKeys.add(key);
        }
        if (isVip && subscribed) {
          highInterestKeys.add(key);
        }
      } else if (ev?.event_type === "gate_request_approved") {
        const key = normalizeSubKey(
          meta.requester_phone,
          meta.requester_email,
          meta.requester_name,
          meta.thread_id || meta.request_id || ev.id
        );
        if (!key || decidedEventKeys.has(key)) continue;
        decidedEventKeys.add(key);
        const prevDbUnsub = dbUnsubscribedAt.get(key);
        if (prevDbUnsub !== undefined && Number.isFinite(evTs) && evTs > prevDbUnsub) {
          dbUnsubscribedAt.delete(key);
        }
        subscriberKeys.add(key);
        highInterestKeys.add(key);
        buyerKeys.add(key);
      }
    }

    const inboxCustomClients = (getInboxState().customClients || []).filter(
      (c) => Boolean(c.ownerId) && c.ownerId === ctx.userId
    );
    for (const c of inboxCustomClients) {
      const key = normalizeSubKey(c.clientPhone, undefined, c.clientName, c.id);
      if (!key || decidedEventKeys.has(key)) continue;
      const cTs = typeof c.createdAt === "string" ? Date.parse(c.createdAt) : Number.NaN;
      if (c.newsletterSubscribed !== false) {
        const prevDbUnsub = dbUnsubscribedAt.get(key);
        if (prevDbUnsub !== undefined && Number.isFinite(cTs) && cTs > prevDbUnsub) {
          dbUnsubscribedAt.delete(key);
        }
        subscriberKeys.add(key);
        buyerKeys.add(key);
      } else {
        eventUnsubscribedKeys.add(key);
      }
      if (c.clientGrade === "VIP" && c.newsletterSubscribed !== false) {
        highInterestKeys.add(key);
      }
    }

    for (const uk of [...dbUnsubscribedAt.keys(), ...eventUnsubscribedKeys]) {
      subscriberKeys.delete(uk);
      highInterestKeys.delete(uk);
      buyerKeys.delete(uk);
      sellerKeys.delete(uk);
    }

    return NextResponse.json({
      editions: data ?? [],
      total: count ?? 0,
      brokerId: ctx.userId,
      brokerSlug: ctx.slug ?? "",
      hasSlug: Boolean(ctx.slug),
      brokerName: ctx.displayName ?? "",
      subscriberCount: subscriberKeys.size,
      highInterestCount: highInterestKeys.size,
      segmentCounts: {
        all: subscriberKeys.size,
        buyer: buyerKeys.size,
        seller: sellerKeys.size,
      },
      brokerPreferences,
    });
  }

  const owner = await softOwnerContext(request, brokerParam);

  let keys: string[];
  let columns: string;
  let effectiveStatus: string | undefined = status;

  if (owner) {
    keys = owner.brokerKeys;
    columns = "*";
  } else {
    if (status && status !== "published") return notFoundResponse();
    effectiveStatus = "published";
    columns = PUBLIC_COLUMNS;
    try {
      const broker = await resolveBroker(supabase, brokerParam);
      if (!broker) return notFoundResponse();
      keys = Array.from(new Set([broker.slug, broker.userId].filter((k): k is string => !!k)));
    } catch (e) {
      log.error("[api/magazine/editions/GET] resolveBroker", e instanceof Error ? e.message : String(e));
      return jsonError("INTERNAL_ERROR", GENERIC_ERROR_MESSAGE, 500);
    }
  }

  let query = supabase
    .from("magazine_editions")
    .select(columns, { count: "exact" })
    .in("broker_id", keys)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (editionType && editionType !== "all") {
    query = query.eq("edition_type", editionType);
  }

  if (effectiveStatus) {
    query = query.eq("status", effectiveStatus);
  }

  const { data, count, error } = await query;

  if (error) {
    log.error("[api/magazine/editions/GET]", error.message);
    return jsonError("INTERNAL_ERROR", GENERIC_ERROR_MESSAGE, 500);
  }

  return NextResponse.json({ editions: data ?? [], total: count ?? 0 });
}

// ---------------------------------------------------------------------------
// POST /api/magazine/editions
// Body: { edition_type?, edition_label? }   ← body.broker_id는 무시(서버가 ctx로 결정, S2-05)
// ---------------------------------------------------------------------------
const PostBodySchema = z.object({
  edition_type: z.string().regex(TOKEN_RE).default("weekly"),
  edition_label: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9가-힣][A-Za-z0-9가-힣 _.\-]{0,39}$/)
    .optional(),
});

export async function POST(request: NextRequest) {
  try {
    const { ctx, error: authError } = await requireBrokerContext(request, { requireSlug: true });
    if (authError || !ctx || !ctx.slug) return authError ?? jsonError("UNAUTHORIZED", "로그인이 필요합니다.", 401);

    let raw: unknown = {};
    try {
      const text = await request.text();
      raw = text ? JSON.parse(text) : {};
    } catch {
      return jsonError("INVALID_JSON", "요청 형식이 올바르지 않습니다.", 400);
    }
    const parsed = PostBodySchema.safeParse(raw ?? {});
    if (!parsed.success) {
      return jsonError("INVALID_INPUT", "입력값을 확인해 주세요.", 400);
    }
    const editionType = parsed.data.edition_type;
    const editionLabel = parsed.data.edition_label ?? defaultLabelForEditionType(editionType);
    const brokerId = ctx.slug; // body.broker_id 무시

    const supabase = createServiceClient();

    // 이미 발행된 동일 호수를 재생성(upsert 덮어쓰기)하지 못하게 차단 — 정정 발행은 Wave 2
    const { data: existing, error: exErr } = await supabase
      .from("magazine_editions")
      .select("id, status")
      .in("broker_id", ctx.brokerKeys)
      .eq("edition_type", editionType)
      .eq("edition_label", editionLabel)
      .limit(5);
    if (exErr) {
      log.error("[api/magazine/editions/POST] existing lookup", exErr.message);
      return jsonError("INTERNAL_ERROR", GENERIC_ERROR_MESSAGE, 500);
    }
    if ((existing ?? []).some((r: { status?: string | null }) => r.status === "published")) {
      return jsonError("PUBLISHED_LOCKED", "이미 발행된 호수입니다. 정정이 필요하면 정정 발행을 이용해 주세요.", 409);
    }

    // Generate magazine content via domain generator
    const edition = await generateWeeklyMagazine({
      supabase,
      brokerId,
      editionType,
      editionLabel,
    });

    return NextResponse.json({ edition }, { status: 201 });
  } catch (err: unknown) {
    log.error("[api/magazine/editions/POST]", err);
    return jsonError("INTERNAL_ERROR", GENERIC_ERROR_MESSAGE, 500);
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/magazine/editions
// Body: { id, ...updates }
//  - 소유권 확인(불일치/없음 404), zod 검증, published 잠금(draft 복귀 금지)
// ---------------------------------------------------------------------------

const PatchBodySchema = z
  .object({
    id: z.string().min(1).max(64),
    title: z.string().max(300).optional(),
    field_note: z.record(z.string(), z.unknown()).nullable().optional(),
    theme_title: z.string().max(300).nullable().optional(),
    theme_body_md: z.string().max(30000).nullable().optional(),
    content: z.record(z.string(), z.unknown()).optional(),
    status: z.enum(["draft", "published"]).optional(),
    market_temp: z.string().max(30).nullable().optional(),
    cover_keywords: z.array(z.string().max(60)).max(20).optional(),
    featured_deal_ids: z.array(z.string().max(100)).max(100).optional(),
    cover_image_url: z.string().max(2000).nullable().optional(),
    theme_color: z.string().max(30).nullable().optional(),
    target_segments: z.array(z.enum(["all", "buyer", "seller"])).max(3).optional(),
    /** 낙관적 동시성: 마지막으로 본 updated_at (null=아직 없음). 생략하면 검사하지 않는다. */
    expected_updated_at: z.string().max(64).nullable().optional(),
  });

const UPDATE_FIELDS = [
  "title",
  "field_note",
  "theme_title",
  "theme_body_md",
  "content",
  "status",
  "market_temp",
  "cover_keywords",
  "featured_deal_ids",
  "cover_image_url",
  "theme_color",
  "target_segments",
] as const;

/** 저장 본문 상한 (남용 방지) */
const MAX_PATCH_BYTES = 600 * 1024;

export async function PATCH(request: NextRequest) {
  try {
    const { ctx, error: authError } = await requireBrokerContext(request);
    if (authError || !ctx) return authError ?? jsonError("UNAUTHORIZED", "로그인이 필요합니다.", 401);

    let raw: unknown;
    try {
      const text = await request.text();
      if (text.length > MAX_PATCH_BYTES) return jsonError("PAYLOAD_TOO_LARGE", "본문이 너무 큽니다.", 413);
      raw = JSON.parse(text);
    } catch {
      return jsonError("INVALID_JSON", "요청 형식이 올바르지 않습니다.", 400);
    }

    const parsed = PatchBodySchema.safeParse(raw);
    if (!parsed.success) {
      const idBad = parsed.error.issues.some((i) => i.path[0] === "id");
      return jsonError("INVALID_INPUT", idBad ? "id 필드가 필요합니다." : "입력값을 확인해 주세요.", 400);
    }
    const { id } = parsed.data;
    const expectedUpdatedAt = parsed.data.expected_updated_at;

    if (parsed.data.status === "published") {
      return NextResponse.json(
        { error: "Direct publish via PATCH is disallowed. Use POST /api/magazine/editions/[id]/publish" },
        { status: 400 },
      );
    }

    if (parsed.data.content !== undefined) {
      const draft = parseEditionContentDraft(parsed.data.content);
      if (!draft.ok) {
        return jsonError("INVALID_CONTENT", `콘텐츠 형식이 올바르지 않습니다: ${draft.issues[0]}`, 400);
      }
    }

    // Pick only allowed fields
    const updates: Record<string, unknown> = {};
    for (const key of UPDATE_FIELDS) {
      if (parsed.data[key] !== undefined) {
        updates[key] = parsed.data[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      return jsonError("INVALID_INPUT", "업데이트할 필드가 없습니다.", 400);
    }

    const supabase = createServiceClient();

    // 소유권 확인 — 타 브로커/없음 모두 404
    const existing = await assertOwnsRow<{ id: string; status: string | null }>(
      supabase,
      "magazine_editions",
      id,
      ctx,
      { select: "id, status" },
    );
    if (!existing) return notFoundResponse();

    // 상태 전이 검증: 발행본은 PATCH로 draft 복귀 불가 (정정 발행은 Wave 2)
    if (existing.status === "published" && updates.status !== undefined && updates.status !== "published") {
      return jsonError(
        "PUBLISHED_LOCKED",
        "이미 발행된 호수는 초안으로 되돌릴 수 없습니다. 정정이 필요하면 정정 발행을 이용해 주세요.",
        409,
      );
    }

    // 발행본의 본문(content)은 PATCH로 바꿀 수 없다 — 정정 발행(/[id]/publish, correction)만 공개 행과 함께 갱신 (E-01)
    if (existing.status === "published" && updates.content !== undefined) {
      return jsonError(
        "PUBLISHED_LOCKED",
        "이미 발행된 호수의 본문은 저장으로 바꿀 수 없습니다. 정정이 필요하면 정정 발행을 이용해 주세요.",
        409,
      );
    }

    updates.updated_at = new Date().toISOString();

    let updateQuery = supabase
      .from("magazine_editions")
      .update(updates)
      .eq("id", id)
      .in("broker_id", ctx.brokerKeys);
    // 낙관적 동시성: 클라이언트가 마지막으로 본 updated_at 과 같을 때만 쓴다 (E-01, 다른 탭 덮어쓰기 방지)
    if (expectedUpdatedAt !== undefined) {
      updateQuery = expectedUpdatedAt === null ? updateQuery.is("updated_at", null) : updateQuery.eq("updated_at", expectedUpdatedAt);
    }
    const { data, error } = await updateQuery.select().maybeSingle();

    if (error) {
      log.error("[api/magazine/editions/PATCH]", error.message);
      return jsonError("INTERNAL_ERROR", GENERIC_ERROR_MESSAGE, 500);
    }
    if (!data) {
      if (expectedUpdatedAt !== undefined) {
        const current = await assertOwnsRow<{ id: string; updated_at: string | null }>(
          supabase,
          "magazine_editions",
          id,
          ctx,
          { select: "id, updated_at" },
        );
        if (current) {
          return NextResponse.json(
            {
              ok: false,
              error: {
                code: "EDIT_CONFLICT",
                message: "다른 탭이나 기기에서 이 매거진이 수정되었습니다. 새로고침한 뒤 다시 편집해 주세요.",
              },
              currentUpdatedAt: current.updated_at,
            },
            { status: 409 },
          );
        }
      }
      return notFoundResponse();
    }

    return NextResponse.json({ edition: data });
  } catch (err: unknown) {
    log.error("[api/magazine/editions/PATCH]", err);
    return jsonError("INTERNAL_ERROR", GENERIC_ERROR_MESSAGE, 500);
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/magazine/editions?id=<uuid> (또는 JSON body { id })
//  - 인증된 브로커 본인의 에디션만 삭제 허용 (타 브로커/미존재 시 404)
// ---------------------------------------------------------------------------
const DeleteSchema = z.object({
  id: z.string().uuid(),
});

export async function DELETE(request: NextRequest) {
  try {
    const { ctx, error: authError } = await requireBrokerContext(request);
    if (authError || !ctx) {
      return authError ?? jsonError("UNAUTHORIZED", "로그인이 필요합니다.", 401);
    }

    let candidateId = request.nextUrl.searchParams.get("id") ?? undefined;
    if (!candidateId) {
      try {
        const text = await request.text();
        const body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
        if (typeof body.id === "string") candidateId = body.id;
      } catch {
        return jsonError("INVALID_JSON", "요청 본문이 올바른 JSON이 아닙니다.", 400);
      }
    }

    const parsed = DeleteSchema.safeParse({ id: candidateId });
    if (!parsed.success) {
      return jsonError("INVALID_INPUT", "삭제할 에디션 ID(UUID)가 필요합니다.", 400);
    }
    const { id } = parsed.data;

    const supabase = createServiceClient();
    const owned = await assertOwnsRow<{ id: string }>(supabase, "magazine_editions", id, ctx);
    if (!owned) return notFoundResponse();

    const { error: deleteErr } = await supabase
      .from("magazine_editions")
      .delete()
      .eq("id", id)
      .in("broker_id", ctx.brokerKeys);

    if (deleteErr) {
      log.error("[api/magazine/editions/DELETE]", deleteErr.message);
      return jsonError("INTERNAL_ERROR", GENERIC_ERROR_MESSAGE, 500);
    }

    return NextResponse.json({ ok: true, id });
  } catch (err: unknown) {
    log.error("[api/magazine/editions/DELETE]", err);
    return jsonError("INTERNAL_ERROR", GENERIC_ERROR_MESSAGE, 500);
  }
}
