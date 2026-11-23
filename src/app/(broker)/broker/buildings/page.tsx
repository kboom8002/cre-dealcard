import type { Metadata } from "next";
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listWorkspaceItemsForOwner } from "@/lib/workspace/workspace-repository";
import { BuildingsListClient } from "./BuildingsListClient";

export const metadata: Metadata = {
  title: "딜카드 & IM 보관함",
  description: "등록된 전체 매물의 딜카드와 모바일 IM을 확인하세요.",
};

// 새로 생성된 딜카드가 즉시 반영되도록 항상 최신 데이터를 조회
export const dynamic = "force-dynamic";

export default async function BuildingsPage() {
  const supabase = await createServerSupabaseClient();

  // 현재 로그인한 사용자 확인
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return (
      <main className="flex flex-col items-center justify-center gap-4 min-h-screen bg-[#FAF9F5] text-slate-900 px-4">
        <p className="text-base font-bold text-slate-900">로그인이 필요합니다.</p>
        <Link
          href="/login"
          className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-blue-700 hover:bg-blue-800 px-5 py-2.5 text-sm font-bold text-white transition-colors"
        >
          로그인 페이지로 이동
        </Link>
      </main>
    );
  }

  let userRole = "broker";
  try {
    const { data: profileRow } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (profileRow?.role) {
      userRole = String(profileRow.role);
    }
  } catch {
    userRole = "broker";
  }

  const [{ data: buildings }, { data: imDocs }, wsRes] = await Promise.all([
    supabase
      .from("building_ssot_lite")
      .select(
        "id, area_signal, asset_type, price_band, status, matched_buyer_count, promotion_score, vacancy_signal, created_at"
      )
      .eq("owner_id", user.id)
      .neq("status", "archived")
      .order("promotion_score", { ascending: false, nullsFirst: false }),
    // 모바일 IM 문서 목록 조회 — 로그인한 개업공인중개사의 활성 문서만
    supabase
      .from("document_objects")
      .select("id, building_id, status, created_at, updated_at")
      .in("document_type", ["im_lite", "im_lite_draft", "mobile_im", "blind_teaser"])
      .eq("owner_id", user.id)
      .neq("status", "archived")
      .order("created_at", { ascending: false })
      .limit(50),
    listWorkspaceItemsForOwner(supabase, {
      ownerId: user.id,
      isAdmin: userRole === "admin",
    }).catch(() => ({ items: [], tableAvailable: false })),
  ]);

  const mergedBuildings = [...(buildings ?? [])];
  const buildingMap = new Map(mergedBuildings.map((b) => [b.id, b]));

  const imList = (imDocs ?? []).map((doc) => ({
    docId: doc.id,
    buildingId: doc.building_id,
    status: doc.status || "draft",
    createdAt: doc.created_at,
    updatedAt: doc.updated_at,
    areaSignal: buildingMap.get(doc.building_id)?.area_signal || "알 수 없음",
    assetType: buildingMap.get(doc.building_id)?.asset_type || "",
    priceBand: buildingMap.get(doc.building_id)?.price_band || "",
  }));

  if (wsRes.tableAvailable && Array.isArray(wsRes.items)) {
    for (const ws of wsRes.items) {
      if (ws.deletedAt || ws.status === "archived") continue;
      const targetId = ws.buildingId || ws.legacyId || ws.id;
      const draftObj = (ws.draftPayload ?? {}) as Record<string, unknown>;
      const snapObj = (ws.publishedSnapshot ?? {}) as Record<string, unknown>;

      if (ws.kind === "dealcard") {
        const card4 = ((draftObj.card4 || snapObj.card4) ?? {}) as Record<string, unknown>;
        const areaLabel = String(
          ws.title || card4.headline || card4.region || ws.address || "서울 핵심 권역"
        ).trim();
        const assetLabel = String(card4.use || "근린생활시설").trim();
        const priceBandLabel =
          ws.priceBand || (typeof card4.priceBand === "string" ? card4.priceBand : null);
        const mappedStatus =
          ws.status === "sent" || ws.status === "published" ? "active" : ws.status;

        const existingBld = buildingMap.get(targetId);
        if (existingBld) {
          if (!existingBld.area_signal) existingBld.area_signal = areaLabel;
          if (!existingBld.asset_type) existingBld.asset_type = assetLabel;
          if (!existingBld.price_band && priceBandLabel) existingBld.price_band = priceBandLabel;
          if (
            (ws.status === "sent" || ws.status === "published") &&
            (!existingBld.status || existingBld.status === "draft")
          ) {
            existingBld.status = "active";
          }
        } else {
          const standaloneBld = {
            id: targetId,
            area_signal: areaLabel,
            asset_type: assetLabel,
            price_band: priceBandLabel,
            status: mappedStatus,
            matched_buyer_count: 0,
            promotion_score: null,
            vacancy_signal: null,
            created_at: ws.createdAt,
          };
          mergedBuildings.push(standaloneBld);
          buildingMap.set(targetId, standaloneBld);
        }
      } else if (ws.kind === "im") {
        const imPayload = ((draftObj.imItem && typeof draftObj.imItem === "object"
          ? draftObj.imItem
          : draftObj) || snapObj) as Record<string, unknown>;
        const imStatus =
          ws.status === "published" || ws.status === "sent" ? "published" : ws.status;
        const imTitle = String(
          ws.title ||
            imPayload.title ||
            imPayload.buildingName ||
            ws.address ||
            buildingMap.get(targetId)?.area_signal ||
            "서울 핵심 권역"
        ).trim();
        const imAssetType = String(
          imPayload.assetType || buildingMap.get(targetId)?.asset_type || ""
        ).trim();
        const imPriceBand = String(
          ws.priceBand || imPayload.priceBand || buildingMap.get(targetId)?.price_band || ""
        ).trim();

        const existingIm = imList.find(
          (entry) => entry.docId === ws.id || entry.buildingId === targetId
        );
        if (existingIm) {
          if (imStatus === "published") existingIm.status = "published";
          if (!existingIm.areaSignal || existingIm.areaSignal === "알 수 없음") {
            existingIm.areaSignal = imTitle;
          }
          if (!existingIm.assetType && imAssetType) existingIm.assetType = imAssetType;
          if (!existingIm.priceBand && imPriceBand) existingIm.priceBand = imPriceBand;
          if (ws.updatedAt) existingIm.updatedAt = ws.updatedAt;
        } else {
          imList.push({
            docId: ws.id,
            buildingId: targetId,
            status: imStatus,
            createdAt: ws.createdAt,
            updatedAt: ws.updatedAt,
            areaSignal: imTitle,
            assetType: imAssetType,
            priceBand: imPriceBand,
          });
        }
      }
    }
  }

  return (
    <main className="flex flex-col items-center min-h-screen bg-[#FAF9F5] text-slate-900 px-4 py-8 pb-24">
      <div className="w-full max-w-xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 pt-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">딜카드 & IM 보관함</h1>
            <p className="text-sm text-slate-600 mt-0.5">
              딜카드 {mergedBuildings.length}개 · 모바일 IM {imList.length}개
            </p>
          </div>
          <Link
            href="/broker/deal-card/new"
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-blue-700 hover:bg-blue-800 px-4 py-2.5 text-sm font-bold text-white transition-all hover:scale-[1.02] active:scale-[0.98] shrink-0"
            id="cta-new-deal-card-from-buildings"
          >
            + 새 딜카드 만들기
          </Link>
        </div>

        {/* Client Interactive List Wrapper */}
        <BuildingsListClient initialBuildings={mergedBuildings} imList={imList} />
      </div>
    </main>
  );
}
