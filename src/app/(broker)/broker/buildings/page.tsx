import type { Metadata } from "next";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { BuildingsListClient } from "./BuildingsListClient";

export const metadata: Metadata = {
  title: "매물 현황 | JS 1분 딜카드",
  description: "등록된 전체 매물의 노출 점수와 딜 파이프라인 현황을 확인하세요.",
};

export default async function BuildingsPage() {
  const supabase = createServiceClient();

  const { data: buildings } = await supabase
    .from("building_ssot_lite")
    .select(
      "id, area_signal, asset_type, price_band, status, matched_buyer_count, promotion_score, vacancy_signal, created_at"
    )
    .order("promotion_score", { ascending: false, nullsFirst: false });

  return (
    <main className="flex flex-col items-center min-h-screen bg-neutral-950 text-neutral-100 px-4 py-8 pb-24">
      <div className="w-full max-w-xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between pt-4">
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">상업용 자산 매물 현황</h1>
            <p className="text-xs text-neutral-400 mt-0.5">
              총 {buildings?.length ?? 0}개의 상용 자산 딜카드가 등록되어 있습니다.
            </p>
          </div>
          <Link
            href="/broker/deal-card/new"
            className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white transition-all hover:scale-[1.02] active:scale-[0.98]"
            id="cta-new-deal-card-from-buildings"
          >
            + 신규 자산 등록
          </Link>
        </div>

        {/* Client Interactive List Wrapper */}
        <BuildingsListClient initialBuildings={buildings ?? []} />
      </div>
    </main>
  );
}
