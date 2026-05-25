import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { BuyerMemoSection } from "./buyer-memo-section";
import { BuyerIntentDetailContainer } from "./buyer-intent-detail-container";

export const metadata: Metadata = {
  title: "매수자 요건 정밀 분석 및 매칭 | JS 1분 딜카드",
  description: "AI가 실시간 매칭 접합도를 연산하고 분석한 매수자 의향서 상세 정보 페이지입니다.",
};

interface BuyerIntentResultPageProps {
  params: Promise<{ id: string }>;
}

export default async function BuyerIntentResultPage({
  params,
}: BuyerIntentResultPageProps) {
  const { id } = await params;
  const supabase = createServiceClient();

  // Fetch buyer intent
  const { data: intent } = await supabase
    .from("buyer_intent_lite")
    .select(
      "id, buyer_type, budget_display, preferred_regions, asset_types, purchase_purpose, must_have, nice_to_have, risk_tolerance, financing_note, normalized, created_at",
    )
    .eq("id", id)
    .single();

  if (!intent) return notFound();

  // Fetch available buildings for buyer memo generation
  const { data: buildings } = await supabase
    .from("building_ssot_lite")
    .select("id, area_signal, asset_type, price_band")
    .order("created_at", { ascending: false })
    .limit(10);

  // Fetch existing buyer memo for this intent
  const { data: existingMemo } = await supabase
    .from("document_objects")
    .select("id, title, body, status, markdown, created_at")
    .eq("source_id", id)
    .eq("document_type", "buyer_fit_memo")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  // Fetch match history
  const { data: matchHistory } = await supabase
    .from("match_results")
    .select(
      `id, grade, score, reasoning, created_at,
       building_ssot_lite_id,
       building_ssot_lite (id, area_signal, asset_type, price_band)`
    )
    .eq("buyer_intent_lite_id", id)
    .order("score", { ascending: false })
    .limit(10);

  const buyerMemoSectionComponent = (
    <BuyerMemoSection
      buyerIntentId={id}
      buildings={buildings || []}
      existingMemo={existingMemo}
      intentNormalized={intent.normalized}
    />
  );

  return (
    <main className="flex flex-col items-center min-h-screen bg-[#09090b] text-[#fafafa] px-4 py-12 pb-32 overflow-x-hidden">
      <BuyerIntentDetailContainer
        intent={intent}
        matchHistory={matchHistory as any}
        buyerMemoSectionComponent={buyerMemoSectionComponent}
      />
    </main>
  );
}
