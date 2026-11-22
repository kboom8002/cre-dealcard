import { NextRequest, NextResponse } from "next/server";
import { requireBroker } from "@/lib/auth-guard";
import { createServiceClient } from "@/lib/supabase/service";
import {
  isDealCardDeleted,
  isRealUploadedPhotoUrl,
  isUuid,
  listAllQuickImRecords,
  resolveKnownTestAssetUrl,
  synthesizeQuickRecordFromImItem,
} from "@/lib/im-lite/quick-generate-store";
import {
  listWorkspaceItemsForOwner,
  type WorkspaceItemRecord,
} from "@/lib/workspace/workspace-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FAKE_TEST_IMAGE_PREFIX = "/test-" + "images/";

function isRealPhotoUrl(url: unknown): url is string {
  if (typeof url !== "string") return false;
  const trimmed = url.trim();
  return trimmed.length > 0 && !trimmed.startsWith(FAKE_TEST_IMAGE_PREFIX);
}

function parsePriceBandToWon(priceBand?: string | null): number | null {
  if (!priceBand) return null;
  const cleaned = String(priceBand).replace(/,/g, "").trim();
  const rangeMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*~\s*(\d+(?:\.\d+)?)\s*억/);
  if (rangeMatch) {
    const low = Number(rangeMatch[1]);
    const high = Number(rangeMatch[2]);
    const mid = (low + high) / 2;
    return Number.isFinite(mid) && mid > 0 ? Math.round(mid * 100_000_000) : null;
  }
  const match = cleaned.match(/(\d+(?:\.\d+)?)\s*억/);
  if (!match) return null;
  const eok = Number(match[1]);
  return Number.isFinite(eok) && eok > 0 ? Math.round(eok * 100_000_000) : null;
}

function formatWonToPriceBand(won: number | null | undefined, fallback?: string | null): string | null {
  if (fallback && fallback.includes("~") && fallback.trim() !== "가격 협의") {
    return fallback.trim();
  }
  if (typeof won === "number" && Number.isFinite(won) && won > 0) {
    const eok = Math.round((won / 100_000_000) * 10) / 10;
    if (eok >= 10_000) {
      const jo = Math.floor(eok / 10_000);
      const remEok = Math.round((eok % 10_000) * 10) / 10;
      if (remEok <= 0) return `${jo.toLocaleString("ko-KR")}조`;
      const remFmt = Number.isInteger(remEok)
        ? remEok.toLocaleString("ko-KR")
        : Number(remEok.toFixed(1)).toLocaleString("ko-KR");
      return `${jo.toLocaleString("ko-KR")}조 ${remFmt}억`;
    }
    if (eok > 0) {
      const fmt = Number.isInteger(eok)
        ? eok.toLocaleString("ko-KR")
        : Number(eok.toFixed(1)).toLocaleString("ko-KR");
      return `${fmt}억`;
    }
  }
  if (fallback && fallback.trim() && fallback.trim() !== "가격 협의") {
    return fallback.trim();
  }
  return fallback || null;
}

function extractPhotoFromImItem(imItem?: Record<string, unknown> | null): string | null {
  if (!imItem) return null;
  const rawPhotos = Array.isArray(imItem.photos) ? imItem.photos : [];
  for (const p of rawPhotos) {
    if (typeof p === "string") {
      const resolved = isRealUploadedPhotoUrl(p) ? p : resolveKnownTestAssetUrl(p) || p;
      if (isRealPhotoUrl(resolved)) return resolved;
    } else if (p && typeof p === "object") {
      const po = p as Record<string, unknown>;
      const rawUrl = String(po.url || po.dataUrl || po.previewUrl || "");
      const resolved = isRealUploadedPhotoUrl(rawUrl)
        ? rawUrl
        : resolveKnownTestAssetUrl(String(po.name || rawUrl)) || rawUrl;
      if (isRealPhotoUrl(resolved)) return resolved;
    }
  }
  const rawNames = Array.isArray(imItem.photoNames) ? imItem.photoNames : [];
  for (const name of rawNames) {
    const resolved = resolveKnownTestAssetUrl(String(name || ""));
    if (isRealPhotoUrl(resolved)) return resolved;
  }
  return null;
}

export async function GET(request: NextRequest) {
  const auth = await requireBroker(request);
  if (auth.error || !auth.user) return auth.error!;
  const userId = auth.user.id;
  const isAdmin = auth.role === "admin";

  const supabase = createServiceClient();

  let bldQuery = supabase
    .from("building_ssot_lite")
    .select("id, owner_id, area_signal, asset_type, price_band, fit_summary, status, updated_at, layers")
    .neq("status", "archived")
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(50);

  if (!isAdmin) {
    bldQuery = bldQuery.eq("owner_id", userId);
  }

  const { data: buildingsData, error } = await bldQuery;
  if (error) {
    return NextResponse.json(
      { ok: false, error: { code: "DB_ERROR", message: "매물 목록을 불러오지 못했습니다." } },
      { status: 500 }
    );
  }

  // 1. Fetch activity_events & broker_profiles.pending_magazine_deals (non-blocking)
  const deletedIds = new Set<string>();
  const activeIds = new Set<string>();
  const activeImIds = new Set<string>();
  const activeDealCardIds = new Set<string>();
  const customImByBuildingId = new Map<string, { item: Record<string, unknown>; updatedAt: string }>();
  const customCard4ByBuildingId = new Map<string, { card4: Record<string, unknown>; updatedAt: string }>();
  let pendingDeals: Array<Record<string, unknown>> = [];

  try {
    const [actRes, bpRes] = await Promise.all([
      supabase
        .from("activity_events")
        .select("id, event_type, entity_id, metadata, created_at")
        .eq("actor_id", userId)
        .in("event_type", [
          "im_upserted",
          "im_deleted",
          "im_restored",
          "dealcard_upserted",
          "dealcard_deleted",
          "dealcard_restored",
        ])
        .order("created_at", { ascending: false })
        .limit(80),
      supabase
        .from("broker_profiles")
        .select("pending_magazine_deals")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    if (bpRes?.data && Array.isArray((bpRes.data as Record<string, unknown>).pending_magazine_deals)) {
      pendingDeals = (bpRes.data as { pending_magazine_deals: Array<Record<string, unknown>> })
        .pending_magazine_deals;
    }

    for (const act of actRes?.data ?? []) {
      const meta = (act.metadata && typeof act.metadata === "object" ? act.metadata : {}) as Record<string, unknown>;
      const bId = String(meta.building_id || (meta.im_item as Record<string, unknown> | undefined)?.buildingId || act.entity_id || "").trim();
      const imKey = String(meta.im_id || (meta.im_item as Record<string, unknown> | undefined)?.id || bId).trim();

      if (act.event_type === "im_deleted" || act.event_type === "dealcard_deleted") {
        if (imKey && !activeIds.has(imKey)) deletedIds.add(imKey);
        if (bId && bId !== userId && !activeIds.has(bId)) deletedIds.add(bId);
        continue;
      }

      if (act.event_type === "im_upserted" || act.event_type === "im_restored") {
        if (imKey && !deletedIds.has(imKey) && (!bId || !deletedIds.has(bId))) {
          activeIds.add(imKey);
          activeImIds.add(imKey);
          if (bId && bId !== userId) {
            activeIds.add(bId);
            activeImIds.add(bId);
          }
          if (meta.im_item && typeof meta.im_item === "object") {
            const imItem = meta.im_item as Record<string, unknown>;
            const targetKey = bId && bId !== userId ? bId : imKey;
            if (targetKey && !customImByBuildingId.has(targetKey)) {
              customImByBuildingId.set(targetKey, {
                item: imItem,
                updatedAt: String(act.created_at || ""),
              });
            }
          }
        }
        continue;
      }

      if (act.event_type === "dealcard_upserted" || act.event_type === "dealcard_restored") {
        if (bId && bId !== userId && !deletedIds.has(bId)) {
          activeIds.add(bId);
          activeDealCardIds.add(bId);
          if (meta.card4 && typeof meta.card4 === "object" && !customCard4ByBuildingId.has(bId)) {
            customCard4ByBuildingId.set(bId, {
              card4: meta.card4 as Record<string, unknown>,
              updatedAt: String(act.created_at || ""),
            });
          }
        }
      }
    }
  } catch {
    // Non-blocking fallback when mocked in unit tests
  }

  const rows = (buildingsData ?? []).filter((b) => !deletedIds.has(String(b.id)));
  const allBuildingUuids = Array.from(
    new Set(
      [
        ...rows.map((r) => String(r.id)),
        ...Array.from(customImByBuildingId.keys()),
        ...pendingDeals.map((p) => String(p.building_id || p.buildingId || p.id || "")),
      ].filter((id) => isUuid(id))
    )
  );

  // 2. Fetch document_objects for real photos, titles, and ssot_summary
  const realPhotoByBuildingId = new Map<string, string>();
  const bestDocByBuildingId = new Map<string, Record<string, unknown>>();

  if (allBuildingUuids.length > 0) {
    try {
      const { data: docRows } = await supabase
        .from("document_objects")
        .select(
          "id, building_id, document_type, title, status, updated_at, created_at, ssot_summary:body->ssot_summary, axios_highlights:body->axios_highlights, photos_v2:body->photos_v2, photos:body->photos, photo_urls:body->photo_urls"
        )
        .in("building_id", allBuildingUuids)
        .neq("status", "archived")
        .order("created_at", { ascending: false })
        .limit(40);

      for (const d of (docRows ?? []) as Array<Record<string, unknown>>) {
        const bId = String(d.building_id || "");
        if (!bId) continue;

        if (!realPhotoByBuildingId.has(bId)) {
          const candList = Array.isArray(d.photos_v2) && d.photos_v2.length > 0
            ? d.photos_v2
            : Array.isArray(d.photos) && d.photos.length > 0
            ? d.photos
            : Array.isArray(d.photo_urls)
            ? d.photo_urls
            : [];
          for (const p of candList) {
            const url = typeof p === "string" ? p : String((p as Record<string, unknown>)?.url || "");
            if (isRealPhotoUrl(url)) {
              realPhotoByBuildingId.set(bId, url.trim());
              break;
            }
          }
        }

        const existingDoc = bestDocByBuildingId.get(bId);
        const isPub = d.status === "published" || d.status === "broker_reviewed";
        const existingIsPub =
          existingDoc?.status === "published" || existingDoc?.status === "broker_reviewed";
        if (!existingDoc || (isPub && !existingIsPub)) {
          bestDocByBuildingId.set(bId, d);
        }
      }
    } catch {
      // Non-blocking fallback
    }
  }

  // Self-heal QuickImStore from activity_events + real photos
  for (const [bId, entry] of customImByBuildingId.entries()) {
    try {
      const realPhoto = realPhotoByBuildingId.get(bId);
      const itemWithPhotos =
        realPhoto && (!Array.isArray(entry.item.photos) || entry.item.photos.length === 0)
          ? { ...entry.item, photos: [{ url: realPhoto }] }
          : entry.item;
      synthesizeQuickRecordFromImItem(
        bId,
        itemWithPhotos as Record<string, any>,
        null,
        undefined,
        userId
      );
    } catch {
      // Ignore synthesis error
    }
  }

  const allQuickRecords = listAllQuickImRecords();
  const seenIds = new Set<string>();

  const buildings = rows.map((b) => {
    const id = String(b.id);
    seenIds.add(id);

    const layers = (b.layers as Record<string, unknown>) || {};
    const dealTerms = (layers.deal_terms as Record<string, unknown>) || {};
    const finance = (layers.finance as Record<string, unknown>) || {};
    const leaseSummary = (layers.lease_summary as Record<string, unknown>) || {};
    const assetIdentity = (layers.asset_identity as Record<string, unknown>) || {};
    const locationLayer = (layers.location as Record<string, unknown>) || {};
    const bldReg = (layers.building_register as Record<string, unknown>) || {};
    const metrics = (layers.metrics as Record<string, unknown>) || {};

    const customIm = customImByBuildingId.get(id)?.item;
    const customCard4 = customCard4ByBuildingId.get(id)?.card4;
    const bestDoc = bestDocByBuildingId.get(id);
    const ssotSummary =
      (bestDoc?.ssot_summary && typeof bestDoc.ssot_summary === "object"
        ? (bestDoc.ssot_summary as Record<string, unknown>)
        : {}) || {};

    const rawAddr = String(
      customIm?.address ||
        ssotSummary.address ||
        assetIdentity.address ||
        locationLayer.road_address ||
        locationLayer.address ||
        b.area_signal ||
        "서울 주요 권역"
    ).trim();
    const region = String(b.area_signal || customCard4?.region || rawAddr || "서울 주요 권역").trim();
    const use = String(customCard4?.use || b.asset_type || "근린생활시설").trim();

    const explicitTitle = String(
      customIm?.title ||
        customIm?.buildingName ||
        bestDoc?.title ||
        ssotSummary.building_name ||
        assetIdentity.building_name ||
        bldReg.building_name ||
        ""
    ).trim();
    const displayTitle = explicitTitle || `${region} ${use}`.trim();

    const askingManwon =
      Number(customIm?.askingPriceManwon || 0) ||
      Number(ssotSummary.asking_price_manwon || 0) ||
      Number(dealTerms.asking_price_manwon || 0) ||
      Number(finance.asking_price_manwon || 0) ||
      (Number(finance.asking_price_krw || 0) > 0
        ? Math.round(Number(finance.asking_price_krw) / 10_000)
        : 0) ||
      Number(leaseSummary.asking_price_manwon || 0);

    const salePriceWon =
      askingManwon > 0
        ? Math.round(askingManwon * 10_000)
        : parsePriceBandToWon(
            (typeof customCard4?.priceBand === "string" ? customCard4.priceBand : null) || b.price_band
          );

    const capRateRaw =
      Number(customIm?.grossYieldPct || 0) ||
      Number(ssotSummary.cap_rate_pct ?? ssotSummary.gross_yield_pct ?? 0) ||
      Number(
        dealTerms.cap_rate_pct ??
          metrics.cap_rate_pct ??
          finance.noi_yield_pct ??
          leaseSummary.cap_rate_pct ??
          0
      );
    const capRate = Number.isFinite(capRateRaw) && capRateRaw > 0 ? capRateRaw : null;

    const photoUrl =
      extractPhotoFromImItem(customIm) ||
      realPhotoByBuildingId.get(id) ||
      null;

    const hasImDoc =
      Boolean(customIm) ||
      Boolean(bestDoc) ||
      activeImIds.has(id) ||
      allQuickRecords.some((r) => r.buildingId === id && Boolean(r.basicImDoc));
    const hasDealCard = Boolean(customCard4) || activeDealCardIds.has(id);

    return {
      id,
      title: displayTitle,
      building_name: displayTitle,
      address: rawAddr,
      dong: region,
      area_signal: region,
      asset_type: use,
      sale_price: salePriceWon,
      price_band: formatWonToPriceBand(
        salePriceWon,
        (typeof customCard4?.priceBand === "string" ? customCard4.priceBand : null) || b.price_band
      ),
      cap_rate: capRate,
      photo_url: photoUrl,
      has_im: hasImDoc,
      has_dealcard: hasDealCard,
      status:
        customIm?.status === "completed" ||
        customIm?.status === "published" ||
        bestDoc?.status === "published"
          ? "published"
          : b.status || "draft",
      updated_at: customImByBuildingId.get(id)?.updatedAt || b.updated_at || null,
    };
  });

  // 2-B. Merge canonical workspace_items (dealcard & im) with safe pre-cutover fallback
  let wsItems: WorkspaceItemRecord[] = [];
  try {
    const wsRes = await listWorkspaceItemsForOwner(supabase, {
      ownerId: userId,
      isAdmin,
    });
    if (wsRes.tableAvailable && Array.isArray(wsRes.items)) {
      wsItems = wsRes.items;
    }
  } catch {
    wsItems = [];
  }

  const wsImIds = new Set<string>();
  const wsDealCardIds = new Set<string>();
  for (const ws of wsItems) {
    if (ws.deletedAt || ws.status === "archived") continue;
    const keys = [ws.buildingId, ws.legacyId, ws.id].filter((x): x is string => Boolean(x));
    if (ws.kind === "im") keys.forEach((k) => wsImIds.add(k));
    else if (ws.kind === "dealcard") keys.forEach((k) => wsDealCardIds.add(k));
  }

  for (const b of buildings) {
    if (!b.has_im && wsImIds.has(b.id)) b.has_im = true;
    if (!b.has_dealcard && wsDealCardIds.has(b.id)) b.has_dealcard = true;
  }

  for (const ws of wsItems) {
    if (ws.deletedAt || ws.status === "archived") continue;
    const wsKey = String(ws.buildingId || ws.legacyId || ws.id).trim();
    if (!wsKey || deletedIds.has(wsKey) || deletedIds.has(ws.id)) continue;

    const draftObj = (ws.draftPayload ?? {}) as Record<string, unknown>;
    const snapObj = (ws.publishedSnapshot ?? {}) as Record<string, unknown>;
    const wsPublished = ws.status === "published" || ws.status === "sent";
    const wsStatus = wsPublished ? "published" : ws.status === "revoked" ? "revoked" : "draft";

    const existingIdx = buildings.findIndex((b) => b.id === wsKey || b.id === ws.id);
    if (existingIdx >= 0) {
      const existing = buildings[existingIdx];
      if (ws.title && ws.title.trim()) {
        existing.title = ws.title.trim();
        existing.building_name = ws.title.trim();
      }
      if (ws.priceBand && !existing.price_band) {
        existing.price_band = ws.priceBand;
      }
      if (ws.kind === "im") existing.has_im = true;
      if (ws.kind === "dealcard") existing.has_dealcard = true;
      if (wsPublished) {
        existing.status = "published";
      }
      if (ws.updatedAt) {
        existing.updated_at = ws.updatedAt;
      }
      seenIds.add(wsKey);
      seenIds.add(ws.id);
      continue;
    }

    seenIds.add(wsKey);
    seenIds.add(ws.id);

    if (ws.kind === "dealcard") {
      const c4 = ((draftObj.card4 || snapObj.card4) ?? {}) as Record<string, unknown>;
      const region = String(c4.region || ws.address || "서울 핵심 권역").trim();
      const use = String(c4.use || "근린생활시설").trim();
      const headline = String(ws.title || c4.headline || "").trim();
      const title = headline || `${region} ${use}`.trim();
      const priceBandStr =
        ws.priceBand || (typeof c4.priceBand === "string" ? c4.priceBand.trim() : null);
      const salePriceWon = parsePriceBandToWon(priceBandStr);

      buildings.push({
        id: wsKey,
        title,
        building_name: `${region} ${use}`.trim(),
        address: ws.address || region,
        dong: region,
        area_signal: region,
        asset_type: use,
        sale_price: salePriceWon,
        price_band: formatWonToPriceBand(salePriceWon, priceBandStr),
        cap_rate: null,
        photo_url: realPhotoByBuildingId.get(wsKey) || null,
        has_im: wsImIds.has(wsKey) || activeImIds.has(wsKey) || Boolean(bestDocByBuildingId.get(wsKey)),
        has_dealcard: true,
        status: wsStatus,
        updated_at: ws.updatedAt || null,
      });
    } else {
      const imPayload = ((draftObj.imItem && typeof draftObj.imItem === "object"
        ? draftObj.imItem
        : draftObj) || snapObj) as Record<string, unknown>;
      const addr = String(ws.address || imPayload.address || "서울 핵심 권역").trim();
      const title = String(
        ws.title || imPayload.title || imPayload.buildingName || addr
      ).trim();
      const askingManwon = Number(imPayload.askingPriceManwon || 0);
      const priceBandStr =
        ws.priceBand || (typeof imPayload.priceBand === "string" ? imPayload.priceBand : null);
      const salePriceWon =
        askingManwon > 0 ? Math.round(askingManwon * 10_000) : parsePriceBandToWon(priceBandStr);
      const capRateRaw = Number(imPayload.grossYieldPct || 0);
      const photoUrl =
        extractPhotoFromImItem(imPayload) || realPhotoByBuildingId.get(wsKey) || null;

      buildings.push({
        id: wsKey,
        title,
        building_name: title,
        address: addr,
        dong: addr,
        area_signal: addr,
        asset_type: String(imPayload.assetType || "상업용 빌딩"),
        sale_price: salePriceWon,
        price_band: formatWonToPriceBand(salePriceWon, priceBandStr),
        cap_rate: Number.isFinite(capRateRaw) && capRateRaw > 0 ? capRateRaw : null,
        photo_url: photoUrl,
        has_im: true,
        has_dealcard: wsDealCardIds.has(wsKey) || activeDealCardIds.has(wsKey),
        status: wsStatus,
        updated_at: ws.updatedAt || null,
      });
    }
  }

  // 3. Merge customImByBuildingId entries that were not in building_ssot_lite rows
  for (const [bId, entry] of customImByBuildingId.entries()) {
    if (seenIds.has(bId) || deletedIds.has(bId)) continue;
    seenIds.add(bId);
    const it = entry.item;
    const addr = String(it.address || "서울 핵심 권역").trim();
    const title = String(it.title || it.buildingName || addr).trim();
    const askingManwon = Number(it.askingPriceManwon || 0);
    const salePriceWon = askingManwon > 0 ? Math.round(askingManwon * 10_000) : null;
    const capRateRaw = Number(it.grossYieldPct || 0);
    const photoUrl = extractPhotoFromImItem(it) || realPhotoByBuildingId.get(bId) || null;

    buildings.push({
      id: bId,
      title,
      building_name: title,
      address: addr,
      dong: addr,
      area_signal: addr,
      asset_type: String(it.assetType || "상업용 빌딩"),
      sale_price: salePriceWon,
      price_band: formatWonToPriceBand(salePriceWon, null),
      cap_rate: Number.isFinite(capRateRaw) && capRateRaw > 0 ? capRateRaw : null,
      photo_url: photoUrl,
      has_im: true,
      has_dealcard: wsDealCardIds.has(bId) || activeDealCardIds.has(bId),
      status: it.status === "completed" || it.status === "published" ? "published" : "draft",
      updated_at: entry.updatedAt || null,
    });
  }

  // 3-B. Merge customCard4ByBuildingId entries (newly created DealCards in /broker/w/dealcards)
  for (const [bId, entry] of customCard4ByBuildingId.entries()) {
    if (seenIds.has(bId) || deletedIds.has(bId)) continue;
    seenIds.add(bId);
    const c4 = entry.card4;
    const region = String(c4.region || "서울 핵심 권역").trim();
    const use = String(c4.use || "근린생활시설").trim();
    const headline = String(c4.headline || "").trim();
    const title = headline || `${region} ${use}`.trim();
    const priceBandStr = typeof c4.priceBand === "string" ? c4.priceBand.trim() : null;
    const salePriceWon = parsePriceBandToWon(priceBandStr);

    buildings.push({
      id: bId,
      title,
      building_name: `${region} ${use}`.trim(),
      address: region,
      dong: region,
      area_signal: region,
      asset_type: use,
      sale_price: salePriceWon,
      price_band: formatWonToPriceBand(salePriceWon, priceBandStr),
      cap_rate: null,
      photo_url: realPhotoByBuildingId.get(bId) || null,
      has_im: false,
      has_dealcard: true,
      status: "draft",
      updated_at: entry.updatedAt || null,
    });
  }

  // 4. Merge pending_magazine_deals from broker_profiles
  for (const pd of pendingDeals) {
    const pId = String(pd.building_id || pd.buildingId || pd.id || "").trim();
    if (!pId || seenIds.has(pId) || deletedIds.has(pId)) continue;
    seenIds.add(pId);
    const addr = String(pd.address || pd.region || "서울 핵심 권역").trim();
    const title = String(pd.title || pd.building_name || addr).trim();
    const rawPrice = pd.sale_price ?? pd.asking_price ?? pd.price;
    const salePriceWon =
      typeof rawPrice === "number" && rawPrice > 0
        ? rawPrice > 10_000_000
          ? Math.round(rawPrice)
          : Math.round(rawPrice * 10_000)
        : parsePriceBandToWon(typeof pd.price_band === "string" ? pd.price_band : String(rawPrice || ""));
    const capRateRaw = Number(pd.cap_rate ?? pd.yield ?? pd.grossYieldPct ?? 0);
    const candPhoto = String(pd.photo_url || pd.photoUrl || (Array.isArray(pd.photos) ? pd.photos[0] : "") || "").trim();
    const photoUrl = isRealPhotoUrl(candPhoto) ? candPhoto : realPhotoByBuildingId.get(pId) || null;

    buildings.push({
      id: pId,
      title,
      building_name: title,
      address: addr,
      dong: addr,
      area_signal: addr,
      asset_type: String(pd.assetType || pd.asset_type || "상업용 빌딩"),
      sale_price: salePriceWon,
      price_band: formatWonToPriceBand(
        salePriceWon,
        typeof pd.price_band === "string" ? pd.price_band : typeof rawPrice === "string" ? rawPrice : null
      ),
      cap_rate: Number.isFinite(capRateRaw) && capRateRaw > 0 ? capRateRaw : null,
      photo_url: photoUrl,
      has_im: true,
      has_dealcard: true,
      status: "published",
      updated_at: typeof pd.updated_at === "string" ? pd.updated_at : null,
    });
  }

  // 5. QuickImStore 레코드 병합 (소유자 일치 항목 우선, 보유 매물 0건일 때만 공용 기본 샘플 허용)
  const ownedQuickRecords = allQuickRecords.filter((rec) => rec.ownerId === userId);
  const appendQuickRecords = (records: typeof allQuickRecords) => {
    for (const rec of records) {
      if (
        seenIds.has(rec.buildingId) ||
        deletedIds.has(rec.buildingId) ||
        isDealCardDeleted(rec.buildingId)
      ) {
        continue;
      }
      seenIds.add(rec.buildingId);
      const region = rec.card4?.region || rec.address || "서울 핵심 권역";
      const use = rec.card4?.use || "근린생활시설";
      const title = rec.buildingName || `${region} ${use}`.trim();
      const salePriceWon =
        rec.askingPriceManwon && rec.askingPriceManwon > 0
          ? Math.round(rec.askingPriceManwon * 10_000)
          : parsePriceBandToWon(rec.card4?.priceBand);
      const capRateRaw = Number(rec.basicImDoc?.facts?.valuation?.capRatePct ?? 0);
      const firstQuickPhoto = Array.isArray(rec.fullDocBody?.photos)
        ? rec.fullDocBody.photos.find((p: any) => isRealPhotoUrl(p?.url))?.url
        : null;

      buildings.push({
        id: rec.buildingId,
        title,
        building_name: title,
        address: rec.address || region,
        dong: region,
        area_signal: region,
        asset_type: use,
        sale_price: salePriceWon,
        price_band: formatWonToPriceBand(salePriceWon, rec.card4?.priceBand || null),
        cap_rate: Number.isFinite(capRateRaw) && capRateRaw > 0 ? capRateRaw : null,
        photo_url: firstQuickPhoto || realPhotoByBuildingId.get(rec.buildingId) || null,
        has_im: Boolean(rec.basicImDoc),
        has_dealcard: true,
        status: "draft",
        updated_at: rec.updatedAt || null,
      });
    }
  };

  appendQuickRecords(ownedQuickRecords);
  if (buildings.length === 0) {
    const seedWorkspaceRecords = allQuickRecords.filter((rec) => !rec.ownerId);
    appendQuickRecords(seedWorkspaceRecords);
  }

  return NextResponse.json({
    ok: true,
    buildings,
    total: buildings.length,
  });
}

