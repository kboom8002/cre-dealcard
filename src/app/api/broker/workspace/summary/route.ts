import { NextRequest, NextResponse } from "next/server";
import { requireBroker } from "@/lib/auth-guard";
import { createServiceClient } from "@/lib/supabase/service";
import { assertBuildingOwner } from "@/lib/authz/assert-owner";
import {
  computeCard4Hash,
  updateDealCard4,
  type Card4Data,
} from "@/lib/deal-card/card4-schema";
import {
  isUuid,
  getQuickImRecord,
  listAllQuickImRecords,
  updateQuickImCard4,
} from "@/lib/im-lite/quick-generate-store";

function formatRelativeTime(isoString?: string | null): string {
  if (!isoString) return "방금";
  const diffMs = Date.now() - new Date(isoString).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 60_000) return "방금";
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

export async function GET(request: NextRequest) {
  const auth = await requireBroker(request);
  if (auth.error || !auth.user) return auth.error!;
  const userId = auth.user.id;
  const isAdmin = auth.role === "admin";

  const supabase = createServiceClient();
  const targetId = request.nextUrl.searchParams.get("buildingId") || request.nextUrl.searchParams.get("id");

  // 1. Fetch broker's buildings from building_ssot_lite
  let bldQuery = supabase
    .from("building_ssot_lite")
    .select("id, owner_id, area_signal, asset_type, price_band, fit_summary, status, updated_at, layers")
    .neq("status", "archived")
    .order("updated_at", { ascending: false })
    .limit(20);

  if (!isAdmin) {
    bldQuery = bldQuery.eq("owner_id", userId);
  }

  const { data: buildingsData } = await bldQuery;
  const buildings = [...(buildingsData || [])];

  // If a specific targetId was requested and not in top 30, fetch it if owned (only when targetId is a valid UUID)
  const quickTargetRec = targetId && !isUuid(targetId) ? getQuickImRecord(targetId) : null;
  if (targetId && isUuid(targetId) && !buildings.some((b) => b.id === targetId)) {
    const check = await assertBuildingOwner(supabase, targetId, userId, {
      allowAdmin: true,
      role: auth.role,
    });
    if (check.ok) {
      const { data: singleBld } = await supabase
        .from("building_ssot_lite")
        .select("id, owner_id, area_signal, asset_type, price_band, fit_summary, status, updated_at, layers")
        .eq("id", targetId)
        .maybeSingle();
      if (singleBld) buildings.unshift(singleBld);
    }
  }

  const buildingIds = buildings.map((b) => b.id);

  // 2. Fetch latest blind_teaser and IM document_objects for these buildings
  // Projection excludes multi-MB base64 images inside full `body` JSONB (e.g. cadastralMapImage)
  let docQuery: any =
    buildingIds.length > 0
      ? supabase
          .from("document_objects")
          .select(
            "id, building_id, document_type, title, status, updated_at, created_at, card4:body->card4, dealPoints:body->dealPoints, ssot_summary:body->ssot_summary, version_no:body->version_no, rent_roll:body->rent_roll"
          )
          .in("building_id", buildingIds)
      : null;
  if (docQuery && typeof docQuery.in === "function") {
    docQuery = docQuery.in("document_type", ["blind_teaser", "mobile_im", "im_lite", "im_lite_draft"]);
  }
  if (docQuery && typeof docQuery.neq === "function") {
    docQuery = docQuery.neq("status", "archived");
  }
  if (docQuery && typeof docQuery.order === "function") {
    docQuery = docQuery.order("created_at", { ascending: false });
  }
  const { data: docsData } = docQuery
    ? await (typeof docQuery.limit === "function" ? docQuery.limit(25) : docQuery)
    : { data: [] as any[] };

  const docs = (docsData || []) as any[];

  const dealcards = buildings.map((b) => {
    const teaserDoc = docs.find(
      (d) => d.building_id === b.id && d.document_type === "blind_teaser"
    );
    const bodyCard4 = (teaserDoc?.card4 ?? teaserDoc?.body?.card4) as Partial<Card4Data> | undefined;
    const teaserDealPoints = teaserDoc?.dealPoints ?? teaserDoc?.body?.dealPoints;
    const region = bodyCard4?.region || b.area_signal || "서울시 핵심 권역";
    const use = bodyCard4?.use || b.asset_type || "근린생활시설";
    const priceBand = bodyCard4?.priceBand || b.price_band || "가격 협의";
    const rawPoints: string[] = Array.isArray(bodyCard4?.points)
      ? bodyCard4!.points
      : Array.isArray(teaserDealPoints)
      ? teaserDealPoints
      : [
          b.fit_summary ? String(b.fit_summary).slice(0, 18) : `${region} 핵심 입지`,
          `${use} 추천 매물`,
          "상세 수익률 및 임대현황 확인 가능",
        ];
    const points: [string, string, string] = [
      rawPoints[0] || `${region} 핵심 입지`,
      rawPoints[1] || `${use} 추천 매물`,
      rawPoints[2] || "안정적 임대수익 기대",
    ];
    const hash = bodyCard4?.card4_hash || computeCard4Hash({ region, use, priceBand, points });

    const card4: Card4Data = {
      region,
      use,
      priceBand,
      points,
      provenance: bodyCard4?.provenance || {
        points: ["public", "broker", "ai"],
      },
      card4_version: bodyCard4?.card4_version || 1,
      card4_hash: hash,
    };

    return {
      id: b.id,
      title: `${region} ${use}`.trim(),
      region,
      use,
      priceBand,
      status: b.status === "published" || teaserDoc?.status === "published" ? "sent" : "draft",
      updatedAt: formatRelativeTime(b.updated_at),
      card4,
    };
  });

  const imDocs = docs.filter((d) =>
    ["mobile_im", "im_lite", "im_lite_draft"].includes(d.document_type)
  );

  const imList = imDocs.map((d, idx) => {
    const ssotSummary = d.ssot_summary || d.body?.ssot_summary || {};
    const bld = buildings.find((b) => b.id === d.building_id);
    const layers = (bld?.layers as Record<string, any>) || {};
    const address =
      ssotSummary.address ||
      layers.asset_identity?.address ||
      bld?.area_signal ||
      "서울시 핵심 상권";
    const askingPriceManwon =
      Number(ssotSummary.asking_price_manwon || layers.deal_terms?.asking_price_manwon) || 950000;
    const versionNo = Number(d.version_no ?? d.body?.version_no ?? 1);
    const isPublished = d.status === "published" || d.status === "broker_reviewed";
    const docRentRoll = d.rent_roll ?? d.body?.rent_roll;

    return {
      id: d.id,
      buildingId: d.building_id,
      title: d.title || `${bld?.area_signal || "매물"} ${bld?.asset_type || "IM"}`.trim(),
      address,
      askingPriceManwon,
      grossYieldPct: Number(ssotSummary.cap_rate_pct || 4.2),
      status: isPublished ? "published" : "draft",
      versionLabel: isPublished ? `v${versionNo} 공개 중 ★` : `v${versionNo} 작성 중`,
      updatedAt: formatRelativeTime(d.updated_at || d.created_at),
      rentRoll: Array.isArray(docRentRoll) && docRentRoll.length > 0 ? docRentRoll : undefined,
      investmentPosture: ssotSummary.investment_posture || d.body?.investment_posture || "core_income",
      gfaSqm: ssotSummary.total_gross_area_sqm ? String(ssotSummary.total_gross_area_sqm) : undefined,
      landAreaSqm: ssotSummary.land_area_sqm ? String(ssotSummary.land_area_sqm) : undefined,
      zoning: ssotSummary.zoning || undefined,
      completionDate: ssotSummary.completion_date || undefined,
      brokerName: d.body?.broker_contact?.brokerName || d.body?.broker_contact?.name || undefined,
      brokerageName: d.body?.broker_contact?.brokerageName || d.body?.broker_contact?.company || undefined,
      brokerPhone: d.body?.broker_contact?.brokerPhone || d.body?.broker_contact?.phone || undefined,
    };
  });

  // Merge QuickImStore records owned by this user (and requested quickTargetRec / default seeds)
  const allQuickRecords = listAllQuickImRecords()
    .filter((rec) => rec.ownerId === userId || !rec.ownerId || (targetId && (rec.buildingId === targetId || rec.documentId === targetId)))
    .sort((a, b) => {
      // User-owned records always come before unowned default seeds
      const aOwned = a.ownerId === userId ? 1 : 0;
      const bOwned = b.ownerId === userId ? 1 : 0;
      if (aOwned !== bOwned) return bOwned - aOwned;
      return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
    });

  if (quickTargetRec && !allQuickRecords.some((r) => r.buildingId === quickTargetRec.buildingId)) {
    allQuickRecords.unshift(quickTargetRec);
  }

  for (const qRec of [...allQuickRecords].reverse()) {
    const existingDcIdx = dealcards.findIndex((dc) => dc.id === qRec.buildingId);
    const mappedDc = {
      id: qRec.buildingId,
      title: `${qRec.card4.region} ${qRec.card4.use}`.trim(),
      region: qRec.card4.region,
      use: qRec.card4.use,
      priceBand: qRec.card4.priceBand,
      status: (qRec.ownerId === userId ? "draft" : "draft") as "draft" | "sent",
      updatedAt: formatRelativeTime(qRec.updatedAt),
      card4: qRec.card4,
    };
    if (existingDcIdx >= 0) {
      if (qRec.ownerId === userId) {
        dealcards[existingDcIdx] = mappedDc;
      }
    } else if (qRec.ownerId === userId || dealcards.length < 3 || (targetId && qRec.buildingId === targetId)) {
      if (qRec.ownerId === userId || (targetId && qRec.buildingId === targetId)) {
        dealcards.unshift(mappedDc);
      } else {
        dealcards.push(mappedDc);
      }
    }

    const existingImIdx = imList.findIndex(
      (im) => im.id === qRec.documentId || im.buildingId === qRec.buildingId
    );
    const mappedIm = {
      id: qRec.documentId,
      buildingId: qRec.buildingId,
      title: qRec.buildingName || `${qRec.card4.region} ${qRec.card4.use}`.trim(),
      address: qRec.address,
      askingPriceManwon: qRec.askingPriceManwon,
      grossYieldPct: Number(qRec.basicImDoc?.facts?.valuation?.grossYieldPct || 4.2),
      status: (qRec.ownerId === userId ? "published" : "draft") as "draft" | "published",
      versionLabel: qRec.ownerId === userId ? "v1 생성 완료" : "v1 작성 중",
      updatedAt: formatRelativeTime(qRec.updatedAt),
      rentRoll: qRec.rentRoll,
      investmentPosture: qRec.posture || "core_income",
      gfaSqm: qRec.specs?.gfaSqm ? String(qRec.specs.gfaSqm) : undefined,
      landAreaSqm: qRec.specs?.landAreaSqm ? String(qRec.specs.landAreaSqm) : undefined,
      zoning: qRec.specs?.zoning || undefined,
      completionDate: qRec.specs?.completionDate || undefined,
      handoverNote: qRec.specs?.handoverNote || undefined,
      brokerName: qRec.brokerProfile?.displayName || qRec.basicImDoc?.facts?.brokerOffice?.representative || undefined,
      brokerageName: qRec.brokerProfile?.company || qRec.basicImDoc?.facts?.brokerOffice?.name || undefined,
      brokerPhone: qRec.brokerProfile?.phone || qRec.basicImDoc?.facts?.brokerOffice?.phone || undefined,
    };
    if (existingImIdx >= 0) {
      if (qRec.ownerId === userId) {
        imList[existingImIdx] = mappedIm;
      }
    } else if (qRec.ownerId === userId || imList.length < 3 || (targetId && (qRec.buildingId === targetId || qRec.documentId === targetId))) {
      if (qRec.ownerId === userId || (targetId && (qRec.buildingId === targetId || qRec.documentId === targetId))) {
        imList.unshift(mappedIm);
      } else {
        imList.push(mappedIm);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    dealcards,
    imList,
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireBroker(request);
  if (auth.error || !auth.user) return auth.error!;

  const body = await request.json().catch(() => null);
  const buildingId = body?.buildingId as string | undefined;
  const card4 = body?.card4 as Card4Data | undefined;

  if (!buildingId || !card4) {
    return NextResponse.json({ error: "buildingId and card4 are required" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Fetch broker profile for attaching to QuickImStore record
  let brokerProfileMeta: {
    displayName?: string;
    company?: string;
    phone?: string;
    registrationNo?: string;
    slug?: string;
    photoUrl?: string;
  } | undefined;
  try {
    if (supabase && typeof supabase.from === "function") {
      const [{ data: pRow }, { data: bpRow }] = await Promise.all([
        supabase
          .from("profiles")
          .select("display_name, company, phone, photo_url")
          .eq("id", auth.user.id)
          .maybeSingle(),
        supabase
          .from("broker_profiles")
          .select("office_reg_number, slug, avatar_url")
          .eq("user_id", auth.user.id)
          .maybeSingle(),
      ]);
      if (pRow || bpRow) {
        brokerProfileMeta = {
          displayName: pRow?.display_name || undefined,
          company: pRow?.company || undefined,
          phone: pRow?.phone || undefined,
          registrationNo: bpRow?.office_reg_number || undefined,
          slug: bpRow?.slug || undefined,
          photoUrl: bpRow?.avatar_url || pRow?.photo_url || undefined,
        };
      }
    }
  } catch {
    // Non-blocking
  }

  // Only enforce DB ownership if buildingId is a real UUID in building_ssot_lite
  if (isUuid(buildingId)) {
    const ownerCheck = await assertBuildingOwner(supabase, buildingId, auth.user.id, {
      allowAdmin: true,
      role: auth.role,
    });
    if (!ownerCheck.ok) {
      return ownerCheck.response;
    }
    const result = await updateDealCard4(supabase, buildingId, {
      card4: {
        region: card4.region,
        use: card4.use,
        priceBand: card4.priceBand,
        points: card4.points,
        provenance: card4.provenance,
      },
      userId: auth.user.id,
    });
    if (!result.success) {
      return NextResponse.json(
        { error: result.error, conflict: result.conflict, currentVersion: result.currentVersion },
        { status: result.conflict ? 409 : 500 }
      );
    }
    if (result.card4 && getQuickImRecord(buildingId)) {
      updateQuickImCard4(buildingId, result.card4, {
        ownerId: auth.user.id,
        brokerProfile: brokerProfileMeta,
      });
    }
    return NextResponse.json({
      ok: true,
      buildingId,
      persisted: true,
      card4: result.card4,
      version: result.version,
      hash: result.hash,
    });
  }

  // Non-UUID local draft ID: compute deterministic hash & increment version, and update QuickImStore
  const nextVersion = (card4.card4_version || 1) + 1;
  const hash = computeCard4Hash(card4);
  const nextCard4: Card4Data = {
    ...card4,
    card4_version: nextVersion,
    card4_hash: hash,
  };
  updateQuickImCard4(buildingId, nextCard4, {
    ownerId: auth.user.id,
    brokerProfile: brokerProfileMeta,
  });
  return NextResponse.json({
    ok: true,
    buildingId,
    persisted: false,
    card4: nextCard4,
    version: nextVersion,
    hash,
  });
}
