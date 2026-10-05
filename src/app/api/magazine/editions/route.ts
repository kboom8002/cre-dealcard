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
import { GENERIC_ERROR_MESSAGE } from "@/lib/magazine/user-message";
import { parseEditionContentDraft } from "@/domain/magazine/edition-content.schema";

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
    .eq("edition_type", editionType)
    .order("created_at", { ascending: false })
    .limit(limit);

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
    const editionLabel = parsed.data.edition_label ?? currentWeekLabel();
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

    // 최초 발행 전이일 때만 published_at 기록 (이미 발행본의 재저장은 시각 유지)
    if (updates.status === "published" && existing.status !== "published") {
      updates.published_at = new Date().toISOString();
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
