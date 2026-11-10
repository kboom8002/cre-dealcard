import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod/v4";
import { createServiceClient } from "@/lib/supabase/service";
import { requireBrokerContext, assertOwnsRow, jsonError } from "@/lib/magazine/authz";
import { resolveBroker } from "@/lib/magazine/resolve-broker";
import { todayKst } from "@/lib/magazine/kst";
import { GENERIC_ERROR_MESSAGE } from "@/lib/magazine/user-message";
import { normalizeContentForPublish, DEFAULT_THEME_COLOR } from "@/lib/magazine/edition-save";
import { getOrCreateDraftEdition, defaultLabelForEditionType } from "@/lib/magazine/edition-draft";
import { sanitizeDealAddress } from "@/lib/magazine/view-helpers";
import { listAllQuickImRecords } from "@/lib/im-lite/quick-generate-store";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("api-magazine-issues");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IssueBodySchema = z.object({
  editionId: z.string().max(100).nullable().optional(),
  slug: z.string().max(60).optional(),
  issueNumber: z.number().int().optional(),
  year: z.number().int().min(2020).max(2100).optional(),
  month: z.number().int().min(1).max(12).optional(),
  headline: z.string().trim().min(1).max(300),
  summary: z.string().max(1000).optional(),
  briefingTitle: z.string().max(300).optional(),
  briefingBody: z.string().max(30000).optional(),
  marketTemp: z.string().max(30).nullable().optional(),
  featuredDealIds: z.array(z.string().max(100)).max(50).optional(),
  featuredDeals: z.array(z.record(z.string(), z.unknown())).max(50).optional(),
  dealComments: z.record(z.string(), z.string().max(1000)).optional(),
  sections: z
    .array(
      z.object({
        id: z.string().max(60),
        enabled: z.boolean(),
      })
    )
    .max(30)
    .optional(),
  targetSegment: z.enum(["all", "buyer", "seller"]).optional(),
});

async function ensureBrokerSlug(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  existingSlug: string | null,
  displayName: string | null
): Promise<string> {
  if (existingSlug && existingSlug.trim()) {
    return existingSlug.trim();
  }
  const fallbackSlug = `broker-${userId.replace(/[^a-z0-9]/gi, "").slice(0, 10).toLowerCase()}`;
  try {
    const { data: existingProfile } = await supabase
      .from("broker_profiles")
      .select("user_id, slug")
      .eq("user_id", userId)
      .maybeSingle();

    if (existingProfile) {
      const rowSlug = (existingProfile as { slug?: string | null }).slug;
      if (rowSlug && rowSlug.trim()) return rowSlug.trim();
      await supabase
        .from("broker_profiles")
        .update({ slug: fallbackSlug, is_public: true })
        .eq("user_id", userId);
      return fallbackSlug;
    }

    await supabase.from("broker_profiles").insert({
      user_id: userId,
      slug: fallbackSlug,
      name: displayName || "공인중개사",
      is_public: true,
    });
  } catch (err) {
    log.warn("ensureBrokerSlug fallback warning", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return fallbackSlug;
}

export async function POST(request: NextRequest) {
  try {
    const { ctx, error: authError } = await requireBrokerContext(request);
    if (authError || !ctx) {
      return authError ?? jsonError("UNAUTHORIZED", "로그인이 필요합니다.", 401);
    }

    let raw: unknown = {};
    try {
      const text = await request.text();
      raw = text ? JSON.parse(text) : {};
    } catch {
      return jsonError("INVALID_JSON", "요청 형식이 올바르지 않습니다.", 400);
    }

    const parsed = IssueBodySchema.safeParse(raw);
    if (!parsed.success) {
      return jsonError("INVALID_INPUT", "표지 제목 등 필수 입력값을 확인해 주세요.", 400);
    }

    const data = parsed.data;
    const supabase = createServiceClient();

    const brokerSlug = await ensureBrokerSlug(
      supabase,
      ctx.userId,
      ctx.slug,
      ctx.displayName
    );
    const brokerKeys = Array.from(new Set([brokerSlug, ...ctx.brokerKeys]));

    const rawLabel =
      data.slug?.trim() ||
      (data.year && data.month
        ? `${data.year}-${String(data.month).padStart(2, "0")}`
        : defaultLabelForEditionType("monthly"));
    const safeLabel = /^[A-Za-z0-9가-힣][A-Za-z0-9가-힣 _.\-]{0,39}$/.test(rawLabel)
      ? rawLabel
      : defaultLabelForEditionType("monthly");

    // 1. 기존 에디션 확인 또는 월간 초안 생성
    let targetEdition: Record<string, unknown> | null = null;
    if (data.editionId) {
      targetEdition = await assertOwnsRow<Record<string, unknown>>(
        supabase,
        "magazine_editions",
        data.editionId,
        { ...ctx, slug: brokerSlug, brokerKeys },
        { select: "*" }
      );
    }

    if (!targetEdition) {
      const { edition } = await getOrCreateDraftEdition(
        supabase,
        { slug: brokerSlug, brokerKeys },
        {
          editionType: "monthly",
          editionLabel: safeLabel,
          format: "simple",
        }
      );
      targetEdition = edition;
    }

    const editionId = String(targetEdition.id);
    const nowIso = new Date().toISOString();
    const issueDate = todayKst();

    // 2. 브로커 공개 프로필 조회
    const resolvedBroker = await resolveBroker(supabase, brokerSlug).catch(() => null);
    let phone = "";
    const { data: prof } = await supabase
      .from("profiles")
      .select("phone, display_name, company")
      .eq("id", ctx.userId)
      .maybeSingle();
    if (prof && typeof (prof as { phone?: unknown }).phone === "string") {
      phone = (prof as { phone: string }).phone;
    }

    const effectiveBriefing =
      data.briefingBody?.trim() ||
      data.summary?.trim() ||
      `${data.headline.trim()} 핵심 내용을 정리해 전해드립니다.`;

    const fieldNote = {
      question: "",
      buyerReaction: "",
      sellerReaction: "",
      marketJudgment: "",
      comment: effectiveBriefing,
    };

    const existingContent =
      targetEdition.content && typeof targetEdition.content === "object"
        ? (targetEdition.content as Record<string, unknown>)
        : {};

    // 2-B. 선택된 매물(featuredDealIds) 스냅샷 하이드레이션 (NL-G04, NL-G06, NL-G07)
    const dealIds = data.featuredDealIds ?? [];
    const commentsMap = data.dealComments ?? {};
    const clientSnapshots = Array.isArray(data.featuredDeals) ? data.featuredDeals : [];
    const hydratedDeals: Array<Record<string, unknown>> = [];

    if (dealIds.length > 0) {
      const quickRecords = listAllQuickImRecords();
      let dbBuildings: Array<Record<string, unknown>> = [];
      try {
        const { data: bRows } = await supabase
          .from("building_ssot_lite")
          .select("id, address, area_signal, asset_type, price_band, fit_summary")
          .in("id", dealIds);
        if (Array.isArray(bRows)) {
          dbBuildings = bRows as Array<Record<string, unknown>>;
        }
      } catch {
        // ignore if non-UUID IDs in dealIds
      }

      for (const dId of dealIds) {
        const snap = clientSnapshots.find((s) => String(s.id ?? "") === dId) || {};
        const dbRow = dbBuildings.find((b) => String(b.id ?? "") === dId);
        const qRec = quickRecords.find((r) => r.buildingId === dId);
        const comment = commentsMap[dId]?.trim() || String(snap.investmentPoint ?? snap.point ?? "").trim();

        const rawTitle =
          String(snap.title ?? snap.assetType ?? "").trim() ||
          qRec?.buildingName ||
          String(dbRow?.area_signal ?? dbRow?.asset_type ?? "").trim() ||
          "추천 상업용 빌딩";
        const rawAddr =
          String(snap.address ?? "").trim() ||
          qRec?.address ||
          String(dbRow?.address ?? dbRow?.area_signal ?? "").trim();
        const safeAddr = sanitizeDealAddress(rawAddr) || "수도권 역세권";
        const priceVal =
          snap.price ??
          qRec?.card4?.priceBand ??
          dbRow?.price_band ??
          (qRec?.askingPriceManwon ? `${(qRec.askingPriceManwon / 10000).toFixed(0)}억` : "가격 협의");
        const yieldNum =
          typeof snap.grossYieldNetOfDeposit === "number"
            ? snap.grossYieldNetOfDeposit
            : qRec?.basicImDoc?.facts?.valuation?.capRatePct ?? undefined;

        hydratedDeals.push({
          id: dId,
          title: rawTitle,
          assetType: rawTitle,
          address: safeAddr,
          price: priceVal,
          grossYieldNetOfDeposit: yieldNum,
          investmentPoint: comment || String(dbRow?.fit_summary ?? "").trim() || undefined,
          point: comment || String(dbRow?.fit_summary ?? "").trim() || undefined,
          photoUrl: typeof snap.photoUrl === "string" && snap.photoUrl.trim() ? snap.photoUrl : null,
          imUrl: `/dc/${encodeURIComponent(dId)}`,
        });
      }
    }

    const rawContentForNormalize: Record<string, unknown> = {
      ...existingContent,
      format: "simple",
      headline: data.headline.trim(),
      briefing: data.summary?.trim() || effectiveBriefing,
      ai_briefing: data.summary?.trim() || effectiveBriefing,
      market_temp: data.marketTemp ?? null,
      field_note: fieldNote,
      theme_title: data.briefingTitle?.trim() || "",
      theme_body_md: effectiveBriefing,
      featured_deal_ids: dealIds,
      featured_deals: hydratedDeals,
      dealHighlights: hydratedDeals,
      deal_comments: commentsMap,
      sections: data.sections,
      target_segment: data.targetSegment ?? "all",
    };

    const normalized = normalizeContentForPublish({
      content: rawContentForNormalize,
      broker: {
        name:
          resolvedBroker?.displayName ??
          (prof as { display_name?: string | null } | null)?.display_name ??
          ctx.displayName ??
          "공인중개사",
        slug: brokerSlug,
        company:
          resolvedBroker?.company ??
          (prof as { company?: string | null } | null)?.company ??
          "",
        phone,
        photoUrl: resolvedBroker?.photoUrl ?? null,
        tagline: resolvedBroker?.tagline ?? "",
        specialtyRegions: resolvedBroker?.specialtyRegions ?? [],
        specialtyAssets: resolvedBroker?.specialtyAssets ?? [],
      },
      kind: "monthly",
      issueDate,
      weekLabel: safeLabel,
      nowIso,
      themeColor: DEFAULT_THEME_COLOR,
    });

    if (!normalized.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: normalized.code,
            message: normalized.issues[0] ?? "발행할 수 없는 콘텐츠입니다.",
          },
          issues: normalized.issues,
        },
        { status: 422 }
      );
    }

    const finalContent: Record<string, unknown> = {
      ...normalized.content,
      id: editionId,
      featured_deal_ids: dealIds,
      featured_deals: hydratedDeals,
      dealHighlights: hydratedDeals,
      deal_comments: data.dealComments ?? {},
      ...(Array.isArray(data.sections) && data.sections.length > 0
        ? { sections: data.sections }
        : {}),
    };

    const editionUpdate: Record<string, unknown> = {
      title: data.headline.trim(),
      market_temp: data.marketTemp ?? null,
      field_note: fieldNote,
      theme_title: data.briefingTitle?.trim() || null,
      theme_body_md: effectiveBriefing,
      featured_deal_ids: data.featuredDealIds ?? [],
      target_segments: [data.targetSegment ?? "all"],
      status: "published",
      published_at:
        typeof targetEdition.published_at === "string" && targetEdition.published_at
          ? targetEdition.published_at
          : nowIso,
      content: finalContent,
      updated_at: nowIso,
    };

    const { data: updated, error: upErr } = await supabase
      .from("magazine_editions")
      .update(editionUpdate)
      .eq("id", editionId)
      .in("broker_id", brokerKeys)
      .select()
      .maybeSingle();

    if (upErr || !updated) {
      log.error("[api/magazine/issues] edition update failed", upErr?.message ?? "no row");
      return jsonError("PUBLISH_FAILED", "뉴스레터 발행 저장에 실패했습니다.", 500);
    }

    // 3. 공개 뷰어 테이블(magazine_issues) 동기화
    const { error: issueErr } = await supabase
      .from("magazine_issues")
      .upsert(
        {
          broker_id: brokerSlug,
          issue_date: issueDate,
          content: finalContent,
        },
        { onConflict: "broker_id,issue_date" }
      );

    if (issueErr) {
      log.warn("[api/magazine/issues] magazine_issues upsert warning", {
        error: issueErr.message,
      });
    }

    const origin = request.nextUrl.origin || "https://credeal.net";
    const publicUrl = `${origin}/magazine/${encodeURIComponent(brokerSlug)}/${encodeURIComponent(issueDate)}?edition=${encodeURIComponent(editionId)}`;

    return NextResponse.json({
      ok: true,
      id: editionId,
      editionId,
      brokerSlug,
      issueDate,
      publicUrl,
      url: publicUrl,
    });
  } catch (err: unknown) {
    log.error("[api/magazine/issues]", err instanceof Error ? err.message : String(err));
    return jsonError("INTERNAL_ERROR", GENERIC_ERROR_MESSAGE, 500);
  }
}
