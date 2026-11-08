import { NextRequest, NextResponse } from "next/server";
import { requireBroker } from "@/lib/auth-guard";
import { createServiceClient } from "@/lib/supabase/service";
import { listAllQuickImRecords } from "@/lib/im-lite/quick-generate-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parsePriceBandToWon(priceBand?: string | null): number | null {
  if (!priceBand) return null;
  const cleaned = String(priceBand).replace(/,/g, "").trim();
  const match = cleaned.match(/(\d+(?:\.\d+)?)\s*억/);
  if (!match) return null;
  const eok = Number(match[1]);
  return Number.isFinite(eok) && eok > 0 ? Math.round(eok * 100_000_000) : null;
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
    .order("updated_at", { ascending: false })
    .limit(30);

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

  const rows = buildingsData ?? [];
  const seenIds = new Set<string>();

  const buildings = rows.map((b) => {
    seenIds.add(String(b.id));
    const layers = (b.layers as Record<string, unknown>) || {};
    const dealTerms = (layers.deal_terms as Record<string, unknown>) || {};
    const assetIdentity = (layers.asset_identity as Record<string, unknown>) || {};
    const metrics = (layers.metrics as Record<string, unknown>) || {};

    const region = String(b.area_signal || assetIdentity.address || "서울 주요 권역").trim();
    const use = String(b.asset_type || "근린생활시설").trim();
    const askingManwon = Number(dealTerms.asking_price_manwon || 0);
    const salePriceWon =
      askingManwon > 0
        ? Math.round(askingManwon * 10_000)
        : parsePriceBandToWon(b.price_band);

    const capRateRaw = Number(dealTerms.cap_rate_pct ?? metrics.cap_rate_pct ?? 0);
    const capRate = Number.isFinite(capRateRaw) && capRateRaw > 0 ? capRateRaw : null;

    return {
      id: String(b.id),
      title: `${region} ${use}`.trim(),
      building_name: `${region} ${use}`.trim(),
      address: region,
      dong: region,
      sale_price: salePriceWon,
      price_band: b.price_band || null,
      cap_rate: capRate,
      photo_url: null,
      status: b.status || "draft",
      updated_at: b.updated_at || null,
    };
  });

  // QuickImStore 레코드도 병합 (소유자 일치 항목)
  const quickRecords = listAllQuickImRecords().filter((rec) => rec.ownerId === userId);
  for (const rec of quickRecords) {
    if (seenIds.has(rec.buildingId)) continue;
    seenIds.add(rec.buildingId);
    const region = rec.card4?.region || rec.address || "서울 핵심 권역";
    const use = rec.card4?.use || "근린생활시설";
    const salePriceWon =
      rec.askingPriceManwon && rec.askingPriceManwon > 0
        ? Math.round(rec.askingPriceManwon * 10_000)
        : parsePriceBandToWon(rec.card4?.priceBand);
    buildings.push({
      id: rec.buildingId,
      title: `${region} ${use}`.trim(),
      building_name: `${region} ${use}`.trim(),
      address: region,
      dong: region,
      sale_price: salePriceWon,
      price_band: rec.card4?.priceBand || null,
      cap_rate: null,
      photo_url: null,
      status: "draft",
      updated_at: rec.updatedAt || null,
    });
  }

  return NextResponse.json({
    ok: true,
    buildings,
    total: buildings.length,
  });
}
