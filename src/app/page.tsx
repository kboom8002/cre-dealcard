import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LandingPageClient } from "@/components/landing/LandingPageClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "DealCard | 중개인을 위한 AI 상업용 부동산 솔루션",
  description: "AI 블라인드 딜카드와 정밀 매칭으로 중개인의 파이프라인을 혁신합니다.",
};

export default async function RootPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  // 로그인 상태인 경우 중개인 대시보드로 이동
  if (user) {
    redirect("/broker");
  }

  // 미로그인 상태인 경우 주요 기능 소개 랜딩 페이지 표시
  return <LandingPageClient />;
}
