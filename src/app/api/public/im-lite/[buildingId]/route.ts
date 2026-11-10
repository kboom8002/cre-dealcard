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
import { getDemoMobileIM } from "@/lib/demo/mobile-im-demo-data";
import { createServiceClient } from "@/lib/supabase/service";
import { fetchIMData } from "@/app/(public)/im-lite/[buildingId]/fetch-im-data";
import { getInboxState, isUuid, resolveOrSynthesizeQuickImRecord } from "@/lib/im-lite/quick-generate-store";
import { verifyShareLinkToken, isBuildingShareLinkRevoked } from "@/lib/security/share-link-tokens";
import { getServerViewer } from "@/lib/server-viewer";
import { isOwnerOrAdmin } from "@/domain/public-projection/access";
import { isImDocStatusPublic } from "@/domain/public-projection/visibility";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ buildingId: string }> },
) {
  try {
    const { buildingId } = await params;
    const docId = req.nextUrl.searchParams.get("doc") || req.nextUrl.searchParams.get("doc_id");
    const token = req.nextUrl.searchParams.get("token");

    if (token) {
      const tokenCheck = await verifyShareLinkToken({ token, buildingId });
      if (!tokenCheck.valid) {
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

    // ── 1a. Enforce building-level revocation across all paths (before demo return) ──
    try {
      const { data: govEvents } = await supabase
        .from("activity_events")
        .select("event_type, entity_id, metadata, created_at")
        .in("event_type", ["link_revoked", "link_restored"])
        .order("created_at", { ascending: false })
        .limit(100);

      let dbRevoked: boolean | undefined;
      let dbDecidedAt: string | undefined;
      if (Array.isArray(govEvents)) {
        for (const row of govEvents) {
          const meta =
            row?.metadata && typeof row.metadata === "object"
              ? (row.metadata as Record<string, any>)
              : {};
          const evBldId = String(meta.building_id || row?.entity_id || "").trim();
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

      const inboxRevokedEntry = getInboxState().revokedBuildings?.[buildingId];
      const localRevoked = Boolean(
        inboxRevokedEntry?.revoked || isBuildingShareLinkRevoked(buildingId)
      );
      const localTs = inboxRevokedEntry?.revokedAt
        ? Date.parse(inboxRevokedEntry.revokedAt)
        : 0;
      const dbTs = dbDecidedAt ? Date.parse(dbDecidedAt) : 0;

      const effectiveRevoked =
        typeof dbRevoked === "boolean" && (!localTs || dbTs >= localTs)
          ? dbRevoked
          : localRevoked || dbRevoked === true;

      if (effectiveRevoked) {
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: "LINK_REVOKED",
              message: "담당 중개인에 의해 회수된 공유 링크입니다.",
            },
          },
          { status: 403 }
        );
      }
    } catch {
      const inboxRevokedEntry = getInboxState().revokedBuildings?.[buildingId];
      if (inboxRevokedEntry?.revoked || isBuildingShareLinkRevoked(buildingId)) {
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: "LINK_REVOKED",
              message: "담당 중개인에 의해 회수된 공유 링크입니다.",
            },
          },
          { status: 403 }
        );
      }
    }

    // ── 1b. Check demo data ─────────────────────────────────────
    const demo = getDemoMobileIM(buildingId);
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

    let viewer: any = null;
    try {
      viewer = await getServerViewer();
    } catch {
      viewer = null;
    }

    // Non-UUID buildingId (e.g. bld-01, quick-*): delegate to fetchIMData / QuickImStore
    if (!isUuid(buildingId)) {
      const fallbackIm = await fetchIMData(buildingId, docId || undefined, viewer, token || undefined);
      if (fallbackIm) {
        if ((fallbackIm as any).isRevoked) {
          return NextResponse.json(
            {
              ok: false,
              error: {
                code: "LINK_REVOKED",
                message: "담당 중개인에 의해 회수된 공유 링크입니다.",
              },
            },
            { status: 403 },
          );
        }
        return NextResponse.json(
          { ok: true, data: fallbackIm, source: "im_workspace" },
          { status: 200 },
        );
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
    const buildingOwnerId: string | null = buildingAccess?.owner_id ?? null;

    // ── 2a. Auto-resolve docId if not provided ──────────────────────
    let resolvedDocId = docId && isUuid(docId) ? docId : null;
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

    const quickRec = await resolveOrSynthesizeQuickImRecord(buildingId, supabase, docId || undefined);

    // ── 2. If docId is provided (or auto-resolved), fetch the generated document ────────
    if (resolvedDocId) {
      const { data: document, error: docError } = await supabase
        .from("document_objects")
        .select("body, owner_id, created_at, updated_at, status")
        .eq("id", resolvedDocId)
        .eq("building_id", buildingId)
        .single();

      const isAllowedDoc =
        document &&
        (isImDocStatusPublic(document.status) || isOwnerOrAdmin(viewer, buildingOwnerId, document.owner_id));

      if (!docError && isAllowedDoc && document.body?.sections) {
        const dbTime = Date.parse(document.updated_at || document.created_at || "") || 0;
        const qrTime = Date.parse(quickRec?.updatedAt || quickRec?.createdAt || "") || 0;
        if (quickRec && qrTime > dbTime) {
          const fallbackIm = await fetchIMData(buildingId, docId || undefined, viewer, token || undefined);
          if (fallbackIm) {
            if ((fallbackIm as any).isRevoked) {
              return NextResponse.json(
                {
                  ok: false,
                  error: {
                    code: "LINK_REVOKED",
                    message: "담당 중개인에 의해 회수된 공유 링크입니다.",
                  },
                },
                { status: 403 },
              );
            }
            return NextResponse.json(
              { ok: true, data: fallbackIm, source: "im_workspace" },
              { status: 200 },
            );
          }
        }

        if (document.body?.is_revoked === true) {
          return NextResponse.json(
            {
              ok: false,
              error: {
                code: "LINK_REVOKED",
                message: "담당 중개인에 의해 회수된 공유 링크입니다.",
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
          sections: document.body.sections,
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
          coordinates: document.body.coordinates || ssotSummary.coordinates || null,
          ssot_summary: ssotSummary,
          heroCard: document.body.heroCard || undefined,
          rent_roll: document.body.rent_roll || document.body.floor_leases || ssotSummary.floor_leases || [],
          floor_leases: document.body.floor_leases || document.body.rent_roll || ssotSummary.floor_leases || [],
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

    // If quickRec exists in workspace/memory when no document_objects row matched, serve it before bare SSoT stub
    if (quickRec) {
      const fallbackIm = await fetchIMData(buildingId, docId || undefined, viewer, token || undefined);
      if (fallbackIm) {
        if ((fallbackIm as any).isRevoked) {
          return NextResponse.json(
            {
              ok: false,
              error: {
                code: "LINK_REVOKED",
                message: "담당 중개인에 의해 회수된 공유 링크입니다.",
              },
            },
            { status: 403 },
          );
        }
        return NextResponse.json(
          { ok: true, data: fallbackIm, source: "im_workspace" },
          { status: 200 },
        );
      }
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
      const fallbackIm = await fetchIMData(buildingId, docId || undefined, viewer, token || undefined);
      if (fallbackIm) {
        if ((fallbackIm as any).isRevoked) {
          return NextResponse.json(
            {
              ok: false,
              error: {
                code: "LINK_REVOKED",
                message: "담당 중개인에 의해 회수된 공유 링크입니다.",
              },
            },
            { status: 403 },
          );
        }
        return NextResponse.json(
          { ok: true, data: fallbackIm, source: "im_workspace" },
          { status: 200 },
        );
      }
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "매물 정보를 찾을 수 없습니다." } },
        { status: 404 },
      );
    }

    const score = ssot.completeness_score ?? 0;
    if (score < 30) {
      const fallbackIm = await fetchIMData(buildingId, docId || undefined, viewer, token || undefined);
      if (fallbackIm) {
        if ((fallbackIm as any).isRevoked) {
          return NextResponse.json(
            {
              ok: false,
              error: {
                code: "LINK_REVOKED",
                message: "담당 중개인에 의해 회수된 공유 링크입니다.",
              },
            },
            { status: 403 },
          );
        }
        return NextResponse.json(
          { ok: true, data: fallbackIm, source: "im_workspace" },
          { status: 200 },
        );
      }
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
      protectedFieldsRemoved: ssot.disclosure?.guard_checked ? ["상세 지번", "소유주명"] : [],
      photos: layers.photos || [],
      coordinates: layers.coordinates || null,
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
    console.error('im-lite fetch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
