import type { Metadata } from "next";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { BuildingsListClient } from "./BuildingsListClient";

export const metadata: Metadata = {
  title: "딜카드 & IM 보관함 | CRE DealCard",
  description: "등록된 전체 매물의 딜카드와 모바일 IM을 확인하세요.",
};

// 새로 생성된 딜카드가 즉시 반영되도록 항상 최신 데이터를 조회
export const dynamic = "force-dynamic";

export default async function BuildingsPage() {
  const supabase = createServiceClient();

  const { data: buildings } = await supabase
    .from("building_ssot_lite")
    .select(
      "id, area_signal, asset_type, price_band, status, matched_buyer_count, promotion_score, vacancy_signal, created_at"
    )
    .order("promotion_score", { ascending: false, nullsFirst: false });

  // 모바일 IM 문서 목록 조회
  const { data: imDocs } = await supabase
    .from("document_objects")
    .select("id, building_id, status, created_at, updated_at")
    .in("document_type", ["im_lite_draft", "mobile_im"])
    .order("created_at", { ascending: false });

  // IM 데이터에 빌딩 정보 매핑
  const buildingMap = new Map(
    (buildings ?? []).map((b) => [b.id, b])
  );
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

  return (
    <main className="flex flex-col items-center min-h-screen bg-neutral-950 text-neutral-100 px-4 py-8 pb-24">
      <div className="w-full max-w-xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between pt-4">
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">딜카드 & IM 보관함</h1>
            <p className="text-xs text-neutral-400 mt-0.5">
              딜카드 {buildings?.length ?? 0}개 · 모바일 IM {imList.length}개
            </p>
          </div>
          <Link
            href="/broker/deal-card/new"
            className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white transition-all hover:scale-[1.02] active:scale-[0.98]"
            id="cta-new-deal-card-from-buildings"
          >
            + 새 딜카드 만들기
          </Link>
        </div>

        {/* Client Interactive List Wrapper */}
        <BuildingsListClient initialBuildings={buildings ?? []} imList={imList} />
      </div>
    </main>
  );
}
