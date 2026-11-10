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
import {
  normalizeReadableBriefingText,
  stripUneditedFormatPlaceholders,
} from "@/lib/magazine/simple-format";
import {
  isUuid,
  listAllQuickImRecords,
  resolveOrSynthesizeQuickImRecord,
} from "@/lib/im-lite/quick-generate-store";
import {
  clusterArticlesIntoFiveIssues,
  resolveUnitIssuesFromData,
} from "@/domain/magazine/issue-clustering";
import {
  normalizePreferredChannels,
  normalizePreferredRegions,
} from "@/domain/magazine/broker-preferences";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("api-magazine-issues");
const FAKE_TEST_IMAGE_PREFIX = "/test-" + "images/";

function isRealPhotoUrl(url: unknown): url is string {
  if (typeof url !== "string") return false;
  const trimmed = url.trim();
  return trimmed.length > 0 && !trimmed.startsWith(FAKE_TEST_IMAGE_PREFIX);
}

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
  unitIssues: z.array(z.record(z.string(), z.unknown())).max(10).optional(),
  preferredRegions: z.array(z.string().max(40)).max(8).optional(),
  preferredChannels: z.array(z.string().max(40)).max(5).optional(),
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

    const cleanedSummary = stripUneditedFormatPlaceholders(data.summary?.trim() || "");
    const cleanedBriefingTitle = stripUneditedFormatPlaceholders(data.briefingTitle?.trim() || "");
    const cleanedBriefingBody = normalizeReadableBriefingText(data.briefingBody?.trim() || "");

    const composedBriefingBody =
      cleanedBriefingTitle &&
      cleanedBriefingBody &&
      !cleanedBriefingBody.startsWith(`■ ${cleanedBriefingTitle}`) &&
      !cleanedBriefingBody.startsWith(cleanedBriefingTitle)
        ? `■ ${cleanedBriefingTitle}\n\n${cleanedBriefingBody}`
        : cleanedBriefingBody || cleanedBriefingTitle;

    const effectiveBriefing =
      composedBriefingBody ||
      cleanedSummary ||
      `${data.headline.trim()} 핵심 내용을 정리해 전해드립니다.`;

    const hasDistinctSummaryAndBody =
      Boolean(cleanedSummary) &&
      Boolean(composedBriefingBody) &&
      cleanedSummary.replace(/\s+/g, " ") !== composedBriefingBody.replace(/\s+/g, " ");

    const primaryBriefingText = hasDistinctSummaryAndBody ? cleanedSummary : effectiveBriefing;
    const secondaryFieldComment = hasDistinctSummaryAndBody ? composedBriefingBody : "";

    const fieldNote = {
      question: "",
      buyerReaction: "",
      sellerReaction: "",
      marketJudgment: "",
      comment: secondaryFieldComment,
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
      const docPhotosByBuildingId = new Map<string, string>();
      const docMetaByBuildingId = new Map<string, Record<string, unknown>>();
      const uuidDealIds = dealIds.filter((id) => isUuid(id));

      if (uuidDealIds.length > 0) {
        try {
          const [bRes, dRes] = await Promise.all([
            supabase
              .from("building_ssot_lite")
              .select("id, address, area_signal, asset_type, price_band, fit_summary, layers")
              .in("id", uuidDealIds),
            supabase
              .from("document_objects")
              .select(
                "id, building_id, title, status, ssot_summary:body->ssot_summary, photos_v2:body->photos_v2, photos:body->photos, photo_urls:body->photo_urls"
              )
              .in("building_id", uuidDealIds)
              .neq("status", "archived")
              .order("created_at", { ascending: false })
              .limit(30),
          ]);
          if (Array.isArray(bRes?.data)) {
            dbBuildings = bRes.data as Array<Record<string, unknown>>;
          }
          if (Array.isArray(dRes?.data)) {
            for (const dRow of dRes.data as Array<Record<string, unknown>>) {
              const bId = String(dRow.building_id || "");
              if (!bId) continue;
              if (!docMetaByBuildingId.has(bId) || dRow.status === "published") {
                docMetaByBuildingId.set(bId, dRow);
              }
              if (!docPhotosByBuildingId.has(bId)) {
                const cand = Array.isArray(dRow.photos_v2) && dRow.photos_v2.length > 0
                  ? dRow.photos_v2
                  : Array.isArray(dRow.photos) && dRow.photos.length > 0
                  ? dRow.photos
                  : Array.isArray(dRow.photo_urls)
                  ? dRow.photo_urls
                  : [];
                for (const p of cand) {
                  const u = typeof p === "string" ? p : String((p as Record<string, unknown>)?.url || "");
                  if (isRealPhotoUrl(u)) {
                    docPhotosByBuildingId.set(bId, u.trim());
                    break;
                  }
                }
              }
            }
          }
        } catch {
          // ignore if non-UUID IDs or mock DB
        }
      }

      for (const dId of dealIds) {
        const snap = clientSnapshots.find((s) => String(s.id ?? "") === dId) || {};
        const dbRow = dbBuildings.find((b) => String(b.id ?? "") === dId);
        const docMeta = docMetaByBuildingId.get(dId);
        const docSsot =
          (docMeta?.ssot_summary && typeof docMeta.ssot_summary === "object"
            ? (docMeta.ssot_summary as Record<string, unknown>)
            : {}) || {};
        let qRec = (await resolveOrSynthesizeQuickImRecord(dId, supabase)) ?? quickRecords.find((r) => r.buildingId === dId);
        const comment = commentsMap[dId]?.trim() || String(snap.investmentPoint ?? snap.point ?? "").trim();

        const layers = (dbRow?.layers && typeof dbRow.layers === "object" ? (dbRow.layers as Record<string, unknown>) : {}) || {};
        const dealTerms = (layers.deal_terms && typeof layers.deal_terms === "object" ? (layers.deal_terms as Record<string, unknown>) : {}) || {};
        const finance = (layers.finance && typeof layers.finance === "object" ? (layers.finance as Record<string, unknown>) : {}) || {};
        const leaseSummary = (layers.lease_summary && typeof layers.lease_summary === "object" ? (layers.lease_summary as Record<string, unknown>) : {}) || {};
        const locationLayer = (layers.location && typeof layers.location === "object" ? (layers.location as Record<string, unknown>) : {}) || {};

        const snapTitle = String(snap.title ?? snap.assetType ?? "").trim();
        const rawTitle =
          (snapTitle && snapTitle !== "추천 매물" ? snapTitle : "") ||
          qRec?.buildingName ||
          String(docMeta?.title ?? docSsot.building_name ?? dbRow?.area_signal ?? dbRow?.asset_type ?? "").trim() ||
          "추천 상업용 빌딩";
        const rawAddr =
          String(snap.address ?? "").trim() ||
          qRec?.address ||
          String(docSsot.address ?? locationLayer.road_address ?? locationLayer.address ?? dbRow?.address ?? dbRow?.area_signal ?? "").trim();
        const safeAddr = sanitizeDealAddress(rawAddr) || "수도권 역세권";

        const askingManwon =
          Number(qRec?.askingPriceManwon || 0) ||
          Number(docSsot.asking_price_manwon || 0) ||
          Number(dealTerms.asking_price_manwon || 0) ||
          Number(finance.asking_price_manwon || 0) ||
          (Number(finance.asking_price_krw || 0) > 0 ? Math.round(Number(finance.asking_price_krw) / 10_000) : 0) ||
          Number(leaseSummary.asking_price_manwon || 0);

        const formattedAskingEok =
          askingManwon > 0
            ? `${Number.isInteger(askingManwon / 10000) ? (askingManwon / 10000).toFixed(0) : (askingManwon / 10000).toFixed(1)}억`
            : null;

        const snapPriceStr = typeof snap.price === "string" ? snap.price.trim() : "";
        const validSnapPrice =
          snapPriceStr && snapPriceStr !== "-" && snapPriceStr !== "가격 문의" && snapPriceStr !== "가격 협의"
            ? snapPriceStr
            : typeof snap.price === "number" && snap.price > 0
            ? snap.price
            : null;

        const priceVal =
          validSnapPrice ??
          formattedAskingEok ??
          qRec?.card4?.priceBand ??
          (typeof dbRow?.price_band === "string" && dbRow.price_band !== "가격 협의" ? dbRow.price_band : null) ??
          "가격 협의";

        const yieldNum =
          typeof snap.grossYieldNetOfDeposit === "number" && snap.grossYieldNetOfDeposit > 0
            ? snap.grossYieldNetOfDeposit
            : Number(qRec?.basicImDoc?.facts?.valuation?.capRatePct || docSsot.cap_rate_pct || dealTerms.cap_rate_pct || finance.noi_yield_pct || 0) || undefined;

        const qRecRealPhoto = Array.isArray(qRec?.fullDocBody?.photos)
          ? qRec.fullDocBody.photos.find((p: any) => isRealPhotoUrl(p?.url))?.url
          : null;
        const resolvedPhotoUrl = isRealPhotoUrl(snap.photoUrl)
          ? snap.photoUrl.trim()
          : docPhotosByBuildingId.get(dId) || qRecRealPhoto || null;

        hydratedDeals.push({
          id: dId,
          title: rawTitle,
          assetType: rawTitle,
          address: safeAddr,
          price: priceVal,
          ...(askingManwon > 0 ? { priceWon: askingManwon * 10_000 } : {}),
          grossYieldNetOfDeposit: yieldNum,
          investmentPoint: comment || String(dbRow?.fit_summary ?? "").trim() || undefined,
          point: comment || String(dbRow?.fit_summary ?? "").trim() || undefined,
          photoUrl: resolvedPhotoUrl,
          imUrl: `/im-lite/${encodeURIComponent(dId)}`,
        });
      }
    }

    const newsExplicitlyEnabled =
      Array.isArray(data.sections) &&
      data.sections.some((s) => s.id === "news_curation" && s.enabled === true);

    const preferredRegions = normalizePreferredRegions(data.preferredRegions);
    const preferredChannels = normalizePreferredChannels(data.preferredChannels);

    const sanitizedExistingContent: Record<string, unknown> = { ...existingContent };
    let resolvedUnitIssues = resolveUnitIssuesFromData(
      {
        unitIssues: Array.isArray(data.unitIssues) && data.unitIssues.length > 0
          ? data.unitIssues
          : existingContent.unitIssues,
      },
      { fallbackFromTopNews: false },
    );

    if (newsExplicitlyEnabled && resolvedUnitIssues.length === 0) {
      resolvedUnitIssues = clusterArticlesIntoFiveIssues([], {
        cadence: "monthly",
        preferredRegions,
        preferredChannels,
        dealKeywords: hydratedDeals.map((d) => `${d.title ?? ""} ${d.address ?? ""}`),
      });
    }

    if (!newsExplicitlyEnabled) {
      delete sanitizedExistingContent.topNews;
      delete sanitizedExistingContent.news_curation;
      delete sanitizedExistingContent.selected_news_ids;
      delete sanitizedExistingContent.unitIssues;
      delete sanitizedExistingContent.unit_issues;
      resolvedUnitIssues = [];
    }

    const rawContentForNormalize: Record<string, unknown> = {
      ...sanitizedExistingContent,
      format: "simple",
      headline: data.headline.trim(),
      summary: cleanedSummary,
      briefing_title: cleanedBriefingTitle,
      briefing: primaryBriefingText,
      ai_briefing: primaryBriefingText,
      market_temp: data.marketTemp ?? null,
      field_note: fieldNote,
      theme_title: "",
      theme_body_md: "",
      featured_deal_ids: dealIds,
      featured_deals: hydratedDeals,
      dealHighlights: hydratedDeals,
      deal_comments: commentsMap,
      ...(newsExplicitlyEnabled && resolvedUnitIssues.length > 0
        ? { unitIssues: resolvedUnitIssues, unit_issues: resolvedUnitIssues }
        : {}),
      broker_preferences: {
        preferredRegions,
        preferredChannels,
      },
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

    // Merge client section toggles (3 items) into the normalized 13-section array without wiping hidden section flags
    const baseSections = Array.isArray(normalized.content.sections)
      ? (normalized.content.sections as Array<{ id: string; enabled: boolean }>)
      : [];
    const clientSectionMap = new Map<string, boolean>();
    if (Array.isArray(data.sections)) {
      for (const s of data.sections) {
        clientSectionMap.set(s.id, s.enabled);
      }
    }
    const briefingToggleEnabled = clientSectionMap.has("field_note")
      ? clientSectionMap.get("field_note")!
      : true;

    const mergedSections = baseSections.map((sec) => {
      if (sec.id === "ai_briefing") {
        return { id: sec.id, enabled: briefingToggleEnabled };
      }
      if (sec.id === "field_note") {
        return { id: sec.id, enabled: briefingToggleEnabled && Boolean(secondaryFieldComment) };
      }
      if (sec.id === "theme_of_week") {
        return { id: sec.id, enabled: false };
      }
      if (sec.id === "news_curation") {
        return { id: sec.id, enabled: newsExplicitlyEnabled };
      }
      if (clientSectionMap.has(sec.id)) {
        return { id: sec.id, enabled: clientSectionMap.get(sec.id)! };
      }
      return sec;
    });

    const finalContent: Record<string, unknown> = {
      ...normalized.content,
      id: editionId,
      summary: cleanedSummary,
      briefing_title: cleanedBriefingTitle,
      briefing_body_md: cleanedBriefingBody,
      featured_deal_ids: dealIds,
      featured_deals: hydratedDeals,
      dealHighlights: hydratedDeals,
      deal_comments: data.dealComments ?? {},
      ...(newsExplicitlyEnabled && resolvedUnitIssues.length > 0
        ? { unitIssues: resolvedUnitIssues, unit_issues: resolvedUnitIssues }
        : { unitIssues: undefined, unit_issues: undefined }),
      broker_preferences: {
        preferredRegions,
        preferredChannels,
      },
      sections: mergedSections,
    };

    const editionUpdate: Record<string, unknown> = {
      title: data.headline.trim(),
      market_temp: data.marketTemp ?? null,
      field_note: fieldNote,
      theme_title: cleanedBriefingTitle || null,
      theme_body_md: cleanedBriefingBody || effectiveBriefing,
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
