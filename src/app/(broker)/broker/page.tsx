import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAggregatedBrokerHomeData } from "@/domain/broker/home-aggregated";
import { BrokerHome4Doors } from "./_components/BrokerHome4Doors";

export const metadata: Metadata = {
  title: "JS 1분 딜카드 | 중개 업무 홈",
  description: "중개인 전용 4대 업무 허브 — 딜카드, 기본 IM, 뉴스레터, 고객 소통함을 한눈에.",
};

/**
 * Broker Home 4-Door Hub (WP-P2-04 & WP-P2-05 & WP-P2-08)
 *
 * Refactored from cluttered dashboard into clean 4-button task doors:
 * - 🚪 [딜카드] (30초 생성 / 카카오톡 전송)
 * - 🚪 [기본 IM] (3분 완성 / 10개 섹션 리포트)
 * - 🚪 [뉴스레터] (주간 매물 소식지)
 * - 🚪 [고객 소통함] (열람 고객 / 피드백)
 *
 * Replaces 9 individual queries with a single coordinated aggregated fetch (<= 3 queries).
 * Renders a 1-line prominent "이어서 하기" quick-resume bar and clickable live status badges.
 */
export default async function BrokerPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Aggregated single coordinated fetch conforming to query budget <= 3 (WP-P2-08)
  const homeData = await getAggregatedBrokerHomeData(supabase, user.id);

  return (
    <main className="min-h-[calc(100vh-56px)] bg-[#F3F2EE] text-[#0F172A] py-4">
      <BrokerHome4Doors data={homeData} />
    </main>
  );
}
