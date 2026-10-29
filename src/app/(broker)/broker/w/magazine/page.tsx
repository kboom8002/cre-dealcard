"use client";

import React, { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export interface FeaturedDealItem {
  id: string;
  type: "dealcard" | "im";
  title: string;
  region: string;
  use: string;
  priceBand: string;
  points: string[];
}

export interface MagazineIssueItem {
  id: string;
  issueNo: number;
  title: string;
  date: string;
  publishedAt?: string;
  dealCount?: number;
  status: "published" | "draft";
  recipientCount: number;
  openRatePct: number;
  intro: string;
  commentary: string;
  featuredDeals: FeaturedDealItem[];
}

function MagazineWorkspaceRedirectInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const qs = searchParams?.toString();
    const search = qs
      ? `?${qs}`
      : typeof window !== "undefined" && window.location.search
        ? window.location.search
        : "";
    router.replace(`/broker/magazine-editor${search}`);
  }, [router, searchParams]);

  return (
    <div
      data-testid="magazine-workspace-redirect"
      className="flex min-h-screen items-center justify-center bg-[#FAF9F5] text-[#0F172A] font-sans"
    >
      <div className="text-center space-y-3 p-8 rounded-2xl bg-white border border-[#CBD5E1] shadow-sm max-w-sm mx-auto">
        <div className="w-9 h-9 mx-auto border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <h2 className="text-base font-extrabold text-[#0F172A]">고객 소식지 편집실로 이동 중입니다</h2>
        <p className="text-sm text-[#64748B]">실시간 매거진 스튜디오로 안전하게 연결합니다.</p>
      </div>
    </div>
  );
}

export default function MagazineWorkspacePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#FAF9F5] text-[#475569]">
          뉴스레터 편집실 연결 중...
        </div>
      }
    >
      <MagazineWorkspaceRedirectInner />
    </Suspense>
  );
}
