import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod/v4";
import { createServiceClient } from "@/lib/supabase/service";
import { requireBrokerContext, assertOwnsRow, notFoundResponse, jsonError } from "@/lib/magazine/authz";
import { resolveBroker } from "@/lib/magazine/resolve-broker";
import { toKstDate, todayKst } from "@/lib/magazine/kst";
import { GENERIC_ERROR_MESSAGE } from "@/lib/magazine/user-message";
import { normalizeContentForPublish, needsQualityReview } from "@/lib/magazine/edition-save";
import { kindOfEditionType } from "@/lib/magazine/edition-draft";
import { parseEditionContentDraft } from "@/domain/magazine/edition-content.schema";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("api-magazine-editions-publish");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 발행 시점에 함께 반영할 최신 폼 값 (저장 + 발행을 한 번에: 정정 발행은 PATCH 로 본문을 바꿀 수 없으므로 필수) */
const PayloadSchema = z.object({
  title: z.string().max(300).optional(),
  market_temp: z.string().max(30).nullable().optional(),
  cover_keywords: z.array(z.string().max(60)).max(20).optional(),
  cover_image_url: z.string().max(2000).nullable().optional(),
  field_note: z.record(z.string(), z.unknown()).nullable().optional(),
  theme_title: z.string().max(300).nullable().optional(),
  theme_body_md: z.string().max(30000).nullable().optional(),
  featured_deal_ids: z.array(z.string().max(100)).max(100).optional(),
  theme_color: z.string().max(30).nullable().optional(),
  target_segments: z.array(z.enum(["all", "buyer", "seller"])).max(3).optional(),
  content: z.record(z.string(), z.unknown()).optional(),
});

const BodySchema = z.object({
  /** 이미 발행된 호수를 정정 발행한다 (published_at 유지, 공개 행만 갱신) */
  correction: z.boolean().optional(),
  /** 품질 게이트 불합격 콘텐츠를 사람이 검토했음을 확인 */
  acknowledgeQualityGate: z.boolean().optional(),
  payload: PayloadSchema.optional(),
});


interface EditionRow {
  id: string;
  broker_id: string;
  edition_type: string | null;
  edition_label: string | null;
  status: string | null;
  published_at: string | null;
  theme_color: string | null;
  content: unknown;
  [column: string]: unknown;
}

/**
 * POST /api/magazine/editions/[id]/publish
 * 발행의 단일 진입점(원자적 순서):
 *  1) 소유권(타인/없음 404)  2) 콘텐츠 정규화 + EditionContentV1 검증(실패 422)
 *  3) 품질 게이트 불합격이면 확인 필요(409 QUALITY_GATE_REVIEW)
 *  4) magazine_editions 를 published 로 잠그고  5) 공개 행 magazine_issues 를 기록한다.
 *  5)가 실패하면 4)를 되돌려 "발행됨인데 공개 안 됨" 상태를 남기지 않는다.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { ctx, error: authError } = await requireBrokerContext(request, { requireSlug: true });
    if (authError || !ctx || !ctx.slug) return authError ?? jsonError("UNAUTHORIZED", "로그인이 필요합니다.", 401);

    let raw: unknown = {};
    try {
      const text = await request.text();
      raw = text ? JSON.parse(text) : {};
    } catch {
      return jsonError("INVALID_JSON", "요청 형식이 올바르지 않습니다.", 400);
    }
    const parsed = BodySchema.safeParse(raw ?? {});
    if (!parsed.success) return jsonError("INVALID_INPUT", "입력값을 확인해 주세요.", 400);
    const correction = parsed.data.correction === true;
    const acknowledged = parsed.data.acknowledgeQualityGate === true;

    const supabase = createServiceClient();
    const edition = await assertOwnsRow<EditionRow>(supabase, "magazine_editions", id, ctx, { select: "*" });
    if (!edition) return notFoundResponse();

    // 폼 payload: content 는 느슨한 초안 검증, 나머지는 허용 컬럼만 (타 키 무시)
    const { content: payloadContent, ...payloadColumns } = parsed.data.payload ?? {};
    if (payloadContent !== undefined) {
      const draft = parseEditionContentDraft(payloadContent);
      if (!draft.ok) {
        return jsonError("INVALID_CONTENT", `콘텐츠 형식이 올바르지 않습니다: ${draft.issues[0]}`, 400);
      }
    }

    const alreadyPublished = edition.status === "published";
    if (alreadyPublished && !correction) {
      return jsonError("ALREADY_PUBLISHED", "이미 발행된 호수입니다. 수정하려면 정정 발행을 이용해 주세요.", 409);
    }
    if (!alreadyPublished && correction) {
      return jsonError("INVALID_INPUT", "발행 전 호수는 정정 발행 대상이 아닙니다.", 400);
    }

    // 브로커 신원은 항상 서버(프로필)에서 — 클라이언트 값 불신
    const broker = await resolveBroker(supabase, ctx.slug);
    if (!broker) return jsonError("BROKER_NOT_FOUND", "브로커 프로필을 찾을 수 없습니다.", 404);
    let phone = "";
    const { data: prof, error: profErr } = await supabase
      .from("profiles")
      .select("phone")
      .eq("id", ctx.userId)
      .maybeSingle();
    if (profErr) log.warn("profile phone lookup failed", { error: profErr.message });
    else if (prof && typeof (prof as { phone?: unknown }).phone === "string") phone = (prof as { phone: string }).phone;

    const nowIso = new Date().toISOString();
    // 정정 발행은 최초 발행일(KST)의 공개 행을 갱신한다
    const issueDate =
      correction && edition.published_at ? toKstDate(new Date(edition.published_at)) : todayKst();

    const normalized = normalizeContentForPublish({
      content: payloadContent !== undefined ? payloadContent : edition.content,
      broker: {
        name: broker.displayName ?? ctx.displayName ?? "",
        slug: ctx.slug,
        company: broker.company ?? "",
        phone,
        photoUrl: broker.photoUrl,
        tagline: broker.tagline ?? "",
        specialtyRegions: broker.specialtyRegions,
        specialtyAssets: broker.specialtyAssets,
      },
      kind: kindOfEditionType(edition.edition_type ?? "weekly"),
      issueDate,
      weekLabel: edition.edition_label ?? undefined,
      nowIso,
      themeColor: typeof payloadColumns.theme_color === "string" ? payloadColumns.theme_color : edition.theme_color,
    });
    if (!normalized.ok) {
      return NextResponse.json(
        { ok: false, error: { code: normalized.code, message: normalized.issues[0] ?? "발행할 수 없는 콘텐츠입니다." }, issues: normalized.issues },
        { status: 422 },
      );
    }

    if (needsQualityReview(normalized.content, edition.status) && !acknowledged) {
      return jsonError(
        "QUALITY_GATE_REVIEW",
        "자동 품질 점검을 통과하지 못한 콘텐츠입니다. 내용을 확인한 뒤 확인 체크 후 발행해 주세요.",
        409,
      );
    }

    const content = { ...normalized.content, id: edition.id };

    const editionUpdate: Record<string, unknown> = {
      ...payloadColumns,
      status: "published",
      content,
      updated_at: nowIso,
    };
    if (!alreadyPublished) editionUpdate.published_at = nowIso;

    const { data: updated, error: upErr } = await supabase
      .from("magazine_editions")
      .update(editionUpdate)
      .eq("id", edition.id)
      .in("broker_id", ctx.brokerKeys)
      .select()
      .maybeSingle();
    if (upErr || !updated) {
      log.error("[publish] edition update failed", upErr?.message ?? "no row");
      return jsonError("PUBLISH_FAILED", "발행 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.", 500);
    }

    const { error: issueErr } = await supabase
      .from("magazine_issues")
      .upsert({ broker_id: ctx.slug, issue_date: issueDate, content }, { onConflict: "broker_id,issue_date" });
    if (issueErr) {
      log.error("[publish] magazine_issues upsert failed", issueErr.message);
      // 되돌리기: 공개되지 않은 채 '발행됨'으로 남지 않게 한다
      const revert: Record<string, unknown> = {
        status: edition.status ?? "draft",
        published_at: edition.published_at,
        content: edition.content,
        updated_at: new Date().toISOString(),
      };
      for (const key of Object.keys(payloadColumns)) revert[key] = edition[key] ?? null;
      const { error: revertErr } = await supabase
        .from("magazine_editions")
        .update(revert)
        .eq("id", edition.id)
        .in("broker_id", ctx.brokerKeys);
      if (revertErr) log.error("[publish] revert failed", revertErr.message);
      return jsonError("PUBLISH_FAILED", "발행 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.", 500);
    }

    return NextResponse.json({ ok: true, edition: updated, issueDate, correction });
  } catch (err: unknown) {
    log.error("[api/magazine/editions/publish]", err instanceof Error ? err.message : String(err));
    return jsonError("INTERNAL_ERROR", GENERIC_ERROR_MESSAGE, 500);
  }
}
