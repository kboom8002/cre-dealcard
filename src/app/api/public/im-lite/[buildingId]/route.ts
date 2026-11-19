/**
 * GET /api/public/im-lite/[buildingId]
 *
 * Public Mobile IM Lite viewer endpoint.
 * - Demo buildings: returns hardcoded demo data (no auth required)
 * - Real buildings: queries building_ssot_lite, requires completenessScore ≥ 80
 *   and public disclosure settings (G2-gate, same pattern as snapshot API)
 *
 * No auth required for demo buildings (public demo access).
 */
import { NextRequest, NextResponse } from "next/server";
import { createModuleLogger } from "@/lib/logger";
import { getDemoMobileIM } from "@/lib/demo/mobile-im-demo-data";
import { createServiceClient } from "@/lib/supabase/service";
import { fetchIMData } from "@/app/(public)/im-lite/[buildingId]/fetch-im-data";
import { resolveOrSynthesizeQuickImRecord, getInboxState } from "@/lib/im-lite/quick-generate-store";
import { verifyShareLinkToken, isBuildingShareLinkRevoked } from "@/lib/security/share-link-tokens";
import { getServerViewer } from "@/lib/server-viewer";
import { isOwnerOrAdmin } from "@/domain/public-projection/access";
import { isBuildingStatusPublic, isImDocStatusPublic } from "@/domain/public-projection/visibility";
import {
  allowDealPublicMemoryFallback,
  buildGovernanceUnavailableResponse,
  buildLinkRevokedResponse,
  buildShareTokenRequiredResponse,
  filterHiddenImSections,
  isAllowedPublicDemoIm,
  isDemoSeedDisabledForProd,
  isPreCutoverSchemaError,
  normalizeHiddenSectionSet,
  resolveWorkspaceImGuard,
  type PublicImDenyReason,
} from "@/lib/im-lite/im-public-guard";

const log = createModuleLogger("public-im-lite");

function coarsenCoordinates(
  coords: unknown,
): { lat: number; lng: number } | null {
  if (!coords || typeof coords !== "object") return null;
  const lat = Number((coords as Record<string, unknown>).lat);
  const lng = Number((coords as Record<string, unknown>).lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    lat: Math.round(lat * 200) / 200,
    lng: Math.round(lng * 200) / 200,
  };
}

function applyBlindCoordinateGuard<T extends Record<string, any>>(
  imDoc: T,
  isPrivilegedViewer: boolean,
): T {
  if (isPrivilegedViewer) return imDoc;
  const stripsLot =
    Array.isArray(imDoc.protectedFieldsRemoved) &&
    imDoc.protectedFieldsRemoved.includes("상세 지번");
  const isBlindTeaser = stripsLot && !imDoc.basicImDocument;
  if (!isBlindTeaser) return imDoc;
  const coarsened = coarsenCoordinates(imDoc.coordinates);
  const nextSsot =
    imDoc.ssot_summary &&
    typeof imDoc.ssot_summary === "object" &&
    imDoc.ssot_summary.coordinates
      ? {
          ...imDoc.ssot_summary,
          coordinates: coarsenCoordinates(imDoc.ssot_summary.coordinates),
        }
      : imDoc.ssot_summary;
  return {
    ...imDoc,
    coordinates: coarsened,
    ...(nextSsot !== undefined ? { ssot_summary: nextSsot } : {}),
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ buildingId: string }> },
) {
  try {
    const { buildingId } = await params;
    const docId = req.nextUrl.searchParams.get("doc") || req.nextUrl.searchParams.get("doc_id");
    const token = req.nextUrl.searchParams.get("token")?.trim() || null;

    if (isDemoSeedDisabledForProd(buildingId)) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "매물 정보를 찾을 수 없습니다." } },
        { status: 404 },
      );
    }

    if (token) {
      const tokenCheck = await verifyShareLinkToken({ token, buildingId });
      if (!tokenCheck.valid) {
        if (tokenCheck.reason === "lookup_failed") {
          return buildGovernanceUnavailableResponse();
        }
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: tokenCheck.reason === "revoked" ? "LINK_REVOKED" : "INVALID_TOKEN",
              message: "담당 중개인에 의해 회수되었거나 유효하지 않은 공유 링크입니다.",
            },
          },
          { status: 403 },
        );
      }
    }

    const supabase = createServiceClient();
    const memoryFallbackAllowed = allowDealPublicMemoryFallback();

    // ── 1a. Enforce building-level revocation across all paths (before demo return) ──
    try {
      const safeBld = /^[A-Za-z0-9_.:-]+$/.test(buildingId) ? buildingId : "";
      const isBldUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(safeBld);
      let govEvents: any[] | null = null;
      let govErr: any = null;

      let govQ: any = supabase
        .from("activity_events")
        .select("event_type, entity_id, building_id, metadata, created_at")
        .in("event_type", ["link_revoked", "link_restored"]);
      if (safeBld) {
        if (typeof govQ?.or === "function") {
          govQ = govQ.or(
            isBldUuid
              ? `building_id.eq.${safeBld},entity_id.eq.${safeBld},metadata->>building_id.eq.${safeBld}`
              : `building_id.eq.${safeBld},metadata->>building_id.eq.${safeBld}`,
          );
        } else if (typeof govQ?.eq === "function") {
          govQ = govQ.eq("building_id", safeBld);
        }
      }
      const govRes = await govQ.order("created_at", { ascending: false }).limit(50);
      govEvents = govRes?.data ?? null;
      govErr = govRes?.error ?? null;

      if (
        govErr &&
        (String(govErr.code || "") === "42703" ||
          String(govErr.code || "") === "PGRST204" ||
          /column .* does not exist/i.test(String(govErr.message || "")))
      ) {
        let govFallback: any = supabase
          .from("activity_events")
          .select("event_type, entity_id, metadata, created_at")
          .in("event_type", ["link_revoked", "link_restored"]);
        if (safeBld && typeof govFallback?.or === "function") {
          govFallback = govFallback.or(
            isBldUuid
              ? `entity_id.eq.${safeBld},metadata->>building_id.eq.${safeBld}`
              : `metadata->>building_id.eq.${safeBld}`,
          );
        }
        const fbRes = await govFallback.order("created_at", { ascending: false }).limit(50);
        govEvents = fbRes?.data ?? null;
        // WP-7.3D P2-15: fallback errors other than a known pre-cutover schema gap fail closed.
        if (fbRes?.error && !isPreCutoverSchemaError(fbRes.error)) {
          log.error({ code: fbRes.error.code, message: fbRes.error.message, buildingId }, "revocation fallback lookup failed");
          return buildGovernanceUnavailableResponse();
        }
      } else if (govErr) {
        // WP-7.3D P2-15: previously any non-42703 error was silently treated as "not revoked"
        // (fail open). Only a known pre-cutover schema gap may fall back to legacy behaviour.
        if (!isPreCutoverSchemaError(govErr)) {
          log.error({ code: govErr.code, message: govErr.message, buildingId }, "revocation lookup failed");
          return buildGovernanceUnavailableResponse();
        }
        govEvents = null;
      }

      let dbRevoked: boolean | undefined;
      let dbDecidedAt: string | undefined;
      if (Array.isArray(govEvents)) {
        for (const row of govEvents) {
          const meta =
            row?.metadata && typeof row.metadata === "object"
              ? (row.metadata as Record<string, any>)
              : {};
          const evBldId = String(row?.building_id || meta.building_id || row?.entity_id || "").trim();
          if (evBldId !== buildingId) continue;
          if (row.event_type === "link_revoked") {
            dbRevoked = true;
            dbDecidedAt = String(meta.revoked_at || row.created_at || "");
            break;
          }
          if (row.event_type === "link_restored") {
            dbRevoked = false;
            dbDecidedAt = String(meta.restored_at || row.created_at || "");
            break;
          }
        }
      }

      const inboxRevokedEntry = memoryFallbackAllowed
        ? getInboxState().revokedBuildings?.[buildingId]
        : undefined;
      const localRevoked = memoryFallbackAllowed
        ? Boolean(inboxRevokedEntry?.revoked || isBuildingShareLinkRevoked(buildingId))
        : false;
      const localTs = inboxRevokedEntry?.revokedAt
        ? Date.parse(inboxRevokedEntry.revokedAt)
        : 0;
      const dbTs = dbDecidedAt ? Date.parse(dbDecidedAt) : 0;

      const effectiveRevoked =
        typeof dbRevoked === "boolean" && (!localTs || dbTs >= localTs)
          ? dbRevoked
          : localRevoked || dbRevoked === true;

      if (effectiveRevoked) {
        return buildLinkRevokedResponse(403);
      }
    } catch (govThrown) {
      if (memoryFallbackAllowed) {
        const inboxRevokedEntry = getInboxState().revokedBuildings?.[buildingId];
        if (inboxRevokedEntry?.revoked || isBuildingShareLinkRevoked(buildingId)) {
          return buildLinkRevokedResponse(403);
        }
      }
      // WP-7.3D P2-15: an unexpected failure of the revocation check must deny (fail closed),
      // never silently serve a possibly-revoked IM.
      log.error(govThrown, "revocation check threw");
      return buildGovernanceUnavailableResponse();
    }

    let viewer: any = null;
    try {
      viewer = await getServerViewer();
    } catch {
      viewer = null;
    }

    const wsGuard = await resolveWorkspaceImGuard(supabase, buildingId);
    if (wsGuard.governanceUnavailable) {
      return buildGovernanceUnavailableResponse();
    }
    if (wsGuard.isDeleted) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "매물 정보를 찾을 수 없습니다." } },
        { status: 404 },
      );
    }
    if (wsGuard.itemRevoked && !isOwnerOrAdmin(viewer, wsGuard.ownerId)) {
      return buildLinkRevokedResponse(403);
    }
    if (wsGuard.isDraft && !wsGuard.snapshot && !isOwnerOrAdmin(viewer, wsGuard.ownerId)) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "매물 정보를 찾을 수 없습니다." } },
        { status: 404 },
      );
    }
    if (
      wsGuard.snapshot ||
      (wsGuard.item?.draftPayload && isOwnerOrAdmin(viewer, wsGuard.ownerId))
    ) {
      let wsDenyReason: PublicImDenyReason | undefined;
      const wsIm = await fetchIMData(buildingId, docId || undefined, viewer, {
        token,
        enforceShareToken: true,
        onDeny: (r) => {
          wsDenyReason = r;
        },
      });
      if (!wsIm) {
        if (wsDenyReason === "token_required") return buildShareTokenRequiredResponse();
        if (wsDenyReason === "revoked") return buildLinkRevokedResponse(403);
      } else {
        if ((wsIm as any).isRevoked) return buildLinkRevokedResponse(403);
        return NextResponse.json(
          {
            ok: true,
            data: applyBlindCoordinateGuard(wsIm as any, isOwnerOrAdmin(viewer, wsGuard.ownerId)),
            source: "workspace_items",
          },
          { status: 200 },
        );
      }
    }

    // ── 1b. Check demo data ─────────────────────────────────────
    const demo = isAllowedPublicDemoIm(buildingId) ? getDemoMobileIM(buildingId) : null;
    if (demo) {
      return NextResponse.json(
        { ok: true, data: demo, source: "demo" },
        {
          headers: {
            "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600",
          },
        },
      );
    }

    // Synthetic workspace IDs (bld-*, quick-*): delegate directly to fetchIMData / QuickImStore
    if (buildingId.startsWith("bld-") || buildingId.startsWith("quick-")) {
      let denyReason: PublicImDenyReason | undefined;
      const fallbackIm = await fetchIMData(buildingId, docId || undefined, viewer, {
        token,
        enforceShareToken: true,
        onDeny: (r) => {
          denyReason = r;
        },
      });
      if (fallbackIm) {
        if ((fallbackIm as any).isRevoked) {
          return buildLinkRevokedResponse(403);
        }
        return NextResponse.json(
          {
            ok: true,
            data: applyBlindCoordinateGuard(fallbackIm as any, isOwnerOrAdmin(viewer, null)),
            source: "im_workspace",
          },
          { status: 200 },
        );
      }
      if (denyReason === "token_required") {
        return buildShareTokenRequiredResponse();
      }
      if (denyReason === "revoked") {
        return buildLinkRevokedResponse(403);
      }
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "매물 정보를 찾을 수 없습니다." } },
        { status: 404 },
      );
    }

    const { data: buildingAccess } = await supabase
      .from("building_ssot_lite")
      .select("owner_id, status")
      .eq("id", buildingId)
      .maybeSingle();
    const buildingOwnerId: string | null = buildingAccess?.owner_id ?? wsGuard.ownerId ?? null;
    if (
      buildingAccess &&
      !isBuildingStatusPublic(buildingAccess.status) &&
      !isOwnerOrAdmin(viewer, buildingOwnerId)
    ) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "매물 정보를 찾을 수 없습니다." } },
        { status: 404 },
      );
    }

    // ── 2a. Auto-resolve docId if not provided ──────────────────────
    const SAFE_DOC_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;
    let resolvedDocId = docId && SAFE_DOC_ID_RE.test(docId) ? docId : null;
    if (!resolvedDocId) {
      const allowedStatuses = isOwnerOrAdmin(viewer, buildingOwnerId)
        ? ["published", "broker_reviewed", "draft"]
        : ["published", "broker_reviewed"];
      const { data: latestDoc } = await supabase
        .from('document_objects')
        .select('id')
        .eq('building_id', buildingId)
        .in('document_type', ['mobile_im', 'im_lite', 'im_lite_draft', 'blind_teaser'])
        .in('status', allowedStatuses)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestDoc?.id) {
        resolvedDocId = latestDoc.id;
      }
    }

    const quickRec = memoryFallbackAllowed
      ? await resolveOrSynthesizeQuickImRecord(buildingId, supabase, docId || undefined)
      : null;

    // ── 2. If docId is provided (or auto-resolved), fetch the generated document ────────
    if (resolvedDocId) {
      const { data: document, error: docError } = await supabase
        .from("document_objects")
        .select("body, owner_id, created_at, updated_at, status, document_type")
        .eq("id", resolvedDocId)
        .eq("building_id", buildingId)
        .single();

      // WP-7.3D P2-8: a document without a status is NOT public (was `!document.status ||` →
      // allowed). Only the owner/admin may preview such rows.
      const isAllowedDoc =
        document &&
        (isImDocStatusPublic(document.status) ||
          isOwnerOrAdmin(viewer, buildingOwnerId, document.owner_id));

      if (!docError && isAllowedDoc && document.body?.sections) {
        const dbTime = Date.parse(document.updated_at || document.created_at || "") || 0;
        const qrTime = Date.parse(quickRec?.updatedAt || quickRec?.createdAt || "") || 0;
        if (quickRec && qrTime > dbTime) {
          let qrDenyReason: PublicImDenyReason | undefined;
          const fallbackIm = await fetchIMData(buildingId, docId || undefined, viewer, {
            token,
            enforceShareToken: true,
            onDeny: (r) => {
              qrDenyReason = r;
            },
          });
          if (fallbackIm) {
            if ((fallbackIm as any).isRevoked) {
              return buildLinkRevokedResponse(403);
            }
            return NextResponse.json(
              {
                ok: true,
                data: applyBlindCoordinateGuard(fallbackIm as any, isOwnerOrAdmin(viewer, buildingOwnerId)),
                source: "im_workspace",
              },
              { status: 200 },
            );
          }
          if (qrDenyReason === "token_required") {
            return buildShareTokenRequiredResponse();
          }
          if (qrDenyReason === "revoked") {
            return buildLinkRevokedResponse(403);
          }
        }

        if (document.body?.is_revoked === true) {
          return buildLinkRevokedResponse(403);
        }

        const isPrivilegedDocViewer = isOwnerOrAdmin(viewer, buildingOwnerId, document.owner_id);
        if (!isPrivilegedDocViewer && !token) {
          return buildShareTokenRequiredResponse();
        }
        // Fetch Broker Profile (profiles + broker_profiles)
        const [{ data: brokerProfile }, { data: brokerMeta }] = await Promise.all([
          supabase
            .from("profiles")
            .select("id, display_name, company, phone, tagline, photo_url")
            .eq("id", document.owner_id)
            .maybeSingle(),
          supabase
            .from("broker_profiles")
            .select("slug, vibe_template_id")
            .eq("user_id", document.owner_id)
            .maybeSingle(),
        ]);

        const broker = brokerProfile ? {
          userId: brokerProfile.id,
          displayName: brokerProfile.display_name || "담당 중개인",
          company: brokerProfile.company || "",
          phone: brokerProfile.phone || "",
          tagline: brokerProfile.tagline || "",
          photoUrl: brokerProfile.photo_url || "/default-avatar.png",
          slug: brokerMeta?.slug || "cre-dealcard-default",
          vibeTemplateId: brokerMeta?.vibe_template_id || "default",
        } : {
          userId: "system",
          displayName: "담당 중개인",
          company: "",
          phone: "",
          tagline: "",
          photoUrl: "/default-avatar.png",
          slug: brokerMeta?.slug || "cre-dealcard-default",
          vibeTemplateId: brokerMeta?.vibe_template_id || "default",
        };

        const ssotSummary = document.body.ssot_summary || {};
        const score = document.body.readiness_score ?? 0;

        const rawDocPhotos = Array.isArray(document.body.photos_v2) && document.body.photos_v2.length > 0
          ? document.body.photos_v2
          : Array.isArray(document.body.photos) && document.body.photos.length > 0
          ? document.body.photos
          : Array.isArray(document.body.photo_urls)
          ? document.body.photo_urls.map((url: string) => ({ url, category: "exterior" }))
          : [];
        const docPhotos = rawDocPhotos.filter((p: any) => p && p.excluded !== true && p.url);

        const isBlindDocResponse =
          !isPrivilegedDocViewer &&
          (document.document_type === "blind_teaser" ||
            document.body.is_blind === true ||
            !document.body.basicImDocument);
        const rawDocCoords = document.body.coordinates || ssotSummary.coordinates || null;
        const safeDocCoords = isBlindDocResponse
          ? coarsenCoordinates(rawDocCoords)
          : rawDocCoords;
        const safeSsotSummary =
          isBlindDocResponse && ssotSummary?.coordinates
            ? {
                ...ssotSummary,
                coordinates: coarsenCoordinates(ssotSummary.coordinates),
              }
            : ssotSummary;

        const hiddenSet = normalizeHiddenSectionSet(document.body as Record<string, unknown>);
        const rawDocSections = Array.isArray(document.body.sections)
          ? (document.body.sections as Array<Record<string, unknown>>)
          : [];
        const visibleDocSections = filterHiddenImSections(rawDocSections, hiddenSet);
        const hideRentRoll =
          hiddenSet.has("lease_status") ||
          hiddenSet.has("03_lease") ||
          hiddenSet.has("06_rentroll") ||
          hiddenSet.has("rentroll");
        const rawRentRoll = hideRentRoll
          ? []
          : document.body.rent_roll || document.body.floor_leases || ssotSummary.floor_leases || [];

        const doc = {
          buildingId,
          blindName: document.body.buildingName || `${ssotSummary.area_signal || "핵심 상권"} ${ssotSummary.asset_type || "상업용 자산"}`,
          fullName: document.body.buildingName || `${ssotSummary.area_signal || "핵심 상권"} ${ssotSummary.asset_type || "상업용 자산"}`,
          areaSignal: ssotSummary.area_signal,
          assetType: ssotSummary.asset_type,
          priceBand: ssotSummary.price_band,
          sizeSignal: ssotSummary.size_signal,
          completenessScore: score,
          broker,
          sections: visibleDocSections,
          hiddenSections: Array.from(hiddenSet),
          generatedAt: document.body.generated_at || document.created_at || new Date().toISOString(),
          disclaimer: "본 자료는 매도인 및 제3자(AI 분석 포함)로부터 제공받은 정보에 기반하여 작성되었으며, 참고용으로만 제공됩니다. 크리딜 및 중개법인은 자료의 정확성, 완전성을 보장하지 않으며 법적 책임을 지지 않습니다. 거래 전 반드시 직접 검증하시기 바랍니다.",
          fullImUpgradeCta: {
            enabled: true,
            label: "상세 투자설명서(IM) 요청",
            description: "렌트롤, 캐시플로우, 도면 등이 포함된 30페이지 분량의 Full IM은 중개인 승인 후 열람 가능합니다.",
          },
          protectedFieldsRemoved: ["상세 지번", "소유주명"],
          photos: docPhotos,
          photos_v2: docPhotos,
          coordinates: safeDocCoords,
          ssot_summary: safeSsotSummary,
          heroCard: document.body.heroCard || undefined,
          rent_roll: rawRentRoll,
          floor_leases: rawRentRoll,
          basicImDocument: document.body.basicImDocument || undefined,
          broker_extras: document.body.broker_extras || undefined,
          posture: document.body.investment_posture || document.body.posture || "income",
        };

        return NextResponse.json(
          { ok: true, data: doc, source: "document_objects" },
          { status: 200 }
        );
      }
    }

    const serveWorkspaceImFallback = async (ownerHint: string | null) => {
      let denyReason: PublicImDenyReason | undefined;
      const fallbackIm = await fetchIMData(buildingId, docId || undefined, viewer, {
        token,
        enforceShareToken: true,
        onDeny: (r) => {
          denyReason = r;
        },
      });
      if (fallbackIm) {
        if ((fallbackIm as any).isRevoked) {
          return buildLinkRevokedResponse(403);
        }
        return NextResponse.json(
          {
            ok: true,
            data: applyBlindCoordinateGuard(fallbackIm as any, isOwnerOrAdmin(viewer, ownerHint)),
            source: "im_workspace",
          },
          { status: 200 },
        );
      }
      if (denyReason === "token_required") return buildShareTokenRequiredResponse();
      if (denyReason === "revoked") return buildLinkRevokedResponse(403);
      return null;
    };

    // If quickRec exists in workspace/memory when no document_objects row matched, serve it before bare SSoT stub
    if (quickRec) {
      const quickResp = await serveWorkspaceImFallback(buildingOwnerId);
      if (quickResp) return quickResp;
    }

    // ── 3. Real building lookup (Fallback if no docId or doc not found)
    const { data: ssot, error } = await supabase
      .from("building_ssot_lite")
      .select(
        `id, owner_id, area_signal, asset_type, price_band, size_signal,
         vacancy_signal, lease_summary, fit_summary, caution_summary, completeness_score,
         layers, disclosure, status, confidence`,
      )
      .eq("id", buildingId)
      .single();

    if (error || !ssot) {
      const fallbackResp = await serveWorkspaceImFallback(buildingOwnerId);
      if (fallbackResp) return fallbackResp;
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "매물 정보를 찾을 수 없습니다." } },
        { status: 404 },
      );
    }

    // Fallback #3: Explicitly exclude archived and draft building_ssot_lite rows when no published document_objects exists
    if (
      !isOwnerOrAdmin(viewer, ssot.owner_id) &&
      (ssot.status === "archived" || ssot.status === "draft")
    ) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "매물 정보를 찾을 수 없습니다." } },
        { status: 404 },
      );
    }

    const score = ssot.completeness_score ?? 0;
    if (score < 30) {
      const lowScoreResp = await serveWorkspaceImFallback(ssot.owner_id);
      if (lowScoreResp) return lowScoreResp;
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "COMPLETENESS_INSUFFICIENT",
            message: `IM Lite는 최소한의 정보가 필요합니다. 현재: ${score}점`,
            currentScore: score,
            requiredScore: 30,
          },
        },
        { status: 403 },
      );
    }

    // Fetch Broker Profile (profiles + broker_profiles)
    const [{ data: brokerProfile }, { data: brokerMeta }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, display_name, company, phone, tagline, photo_url")
        .eq("id", ssot.owner_id)
        .maybeSingle(),
      supabase
        .from("broker_profiles")
        .select("slug, vibe_template_id")
        .eq("user_id", ssot.owner_id)
        .maybeSingle(),
    ]);

    const broker = brokerProfile ? {
      userId: brokerProfile.id,
      displayName: brokerProfile.display_name || "담당 중개인",
      company: brokerProfile.company || "",
      phone: brokerProfile.phone || "",
      tagline: brokerProfile.tagline || "",
      photoUrl: brokerProfile.photo_url || "/default-avatar.png",
      slug: brokerMeta?.slug || "cre-dealcard-default",
      vibeTemplateId: brokerMeta?.vibe_template_id || "default",
    } : {
      userId: "system",
      displayName: "담당 중개인",
      company: "",
      phone: "",
      tagline: "",
      photoUrl: "/default-avatar.png",
      slug: brokerMeta?.slug || "cre-dealcard-default",
      vibeTemplateId: brokerMeta?.vibe_template_id || "default",
    };

    const sections = [
      {
        sectionId: "01_overview",
        title: "물건 개요",
        icon: "🏢",
        content: `| 항목 | 내용 |\n|---|---|\n| 매물명 | ${ssot.area_signal} ${ssot.asset_type} |\n| 매매희망가 | **${ssot.price_band}** |\n| 규모 | ${ssot.size_signal} |`,
        dataSource: "SSoT - asset_identity",
        aiRole: "auto" as const,
        locked: false,
      },
      {
        sectionId: "02_location",
        title: "입지·상권 분석",
        icon: "📍",
        content: "AI 입지 분석이 완료되지 않았습니다.",
        dataSource: "AI Location Agent",
        aiRole: "ai_generated" as const,
        locked: true,
        lockedReason: "공공데이터 연동 대기 중",
      },
      {
        sectionId: "03_lease",
        title: "임대 현황",
        icon: "👥",
        content: ssot.lease_summary || ssot.vacancy_signal ? `| 항목 | 내용 |\n|---|---|\n| 공실 | ${ssot.vacancy_signal || '확인 필요'} |\n\n${ssot.lease_summary || '세부 임대차 정보는 중개인에게 문의하세요.'}` : "임대 현황 데이터가 부족합니다.",
        dataSource: "SSoT - rent_roll",
        aiRole: "auto" as const,
        locked: !ssot.lease_summary && !ssot.vacancy_signal,
        lockedReason: "렌트롤 데이터 필요",
      },
      {
        sectionId: "04_finance",
        title: "수익 분석",
        icon: "💰",
        content: "금융/수익 분석 모델링 중입니다.",
        dataSource: "AI Financial Engine",
        aiRole: "ai_generated" as const,
        locked: true,
        lockedReason: "Cash Flow 데이터 필요",
      },
      {
        sectionId: "05_risk",
        title: "확인 필요 사항",
        icon: "⚠️",
        content: ssot.caution_summary || "리스크 엔진 데이터 수집 중입니다.",
        dataSource: "AI Risk Engine",
        aiRole: "ai_generated" as const,
        locked: !ssot.caution_summary,
        lockedReason: "리스크 스캔 대기 중",
      },
      {
        sectionId: "06_thesis",
        title: "투자 포인트",
        icon: "🎯",
        content: ssot.fit_summary || "매수자 적합성 분석 중입니다.",
        dataSource: "AI Matching Engine",
        aiRole: "ai_generated" as const,
        locked: false,
      },
      {
        sectionId: "07_next",
        title: "다음 단계",
        icon: "🚀",
        content: "관심 있으신 경우 아래 '중개인에게 문의하기' 버튼을 눌러 상세 자료(IM) 및 미팅을 요청해 주세요.",
        dataSource: "Static",
        aiRole: "static" as const,
        locked: false,
      }
    ];

    const layers = (ssot.layers as Record<string, any>) || {};
    const isPrivilegedSsotViewer = isOwnerOrAdmin(viewer, ssot.owner_id);
    if (!isPrivilegedSsotViewer) {
      if (!token) {
        return buildShareTokenRequiredResponse();
      }
      const ssotTokenCheck = await verifyShareLinkToken({ token, buildingId });
      if (!ssotTokenCheck.valid) {
        if (ssotTokenCheck.reason === "lookup_failed") {
          return buildGovernanceUnavailableResponse();
        }
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: ssotTokenCheck.reason === "revoked" ? "LINK_REVOKED" : "INVALID_TOKEN",
              message: "담당 중개인에 의해 회수되었거나 유효하지 않은 공유 링크입니다.",
            },
          },
          { status: 403 },
        );
      }
    }
    const protectedFieldsRemoved =
      !isPrivilegedSsotViewer || ssot.disclosure?.guard_checked
        ? ["상세 지번", "소유주명"]
        : [];
    const rawSsotCoords = layers.coordinates || null;
    const safeSsotCoords =
      protectedFieldsRemoved.includes("상세 지번") && !isPrivilegedSsotViewer
        ? coarsenCoordinates(rawSsotCoords)
        : rawSsotCoords;

    const doc = {
      buildingId: ssot.id,
      blindName: `${ssot.area_signal} ${ssot.asset_type}`,
      fullName: `${ssot.area_signal} ${ssot.asset_type}`, // Blinded for now
      areaSignal: ssot.area_signal,
      assetType: ssot.asset_type,
      priceBand: ssot.price_band,
      sizeSignal: ssot.size_signal,
      completenessScore: score,
      broker,
      sections,
      generatedAt: new Date().toISOString(),
      disclaimer: "본 자료는 매도인 및 제3자(AI 분석 포함)로부터 제공받은 정보에 기반하여 작성되었으며, 참고용으로만 제공됩니다. 크리딜 및 중개법인은 자료의 정확성, 완전성을 보장하지 않으며 법적 책임을 지지 않습니다. 거래 전 반드시 직접 검증하시기 바랍니다.",
      fullImUpgradeCta: {
        enabled: true,
        label: "상세 투자설명서(IM) 요청",
        description: "렌트롤, 캐시플로우, 도면 등이 포함된 30페이지 분량의 Full IM은 중개인 승인 후 열람 가능합니다.",
      },
      protectedFieldsRemoved,
      photos: layers.photos || [],
      coordinates: safeSsotCoords,
    };

    return NextResponse.json(
      {
        ok: true,
        data: doc,
        source: "real",
      },
      { status: 200 },
    );
  } catch (error) {
    log.error(error, 'im-lite fetch error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
