"use client";

import React, { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import BrokerBottomNav from "@/components/layout/BrokerBottomNav";
import { sqmToPyeong } from "@/lib/utils/area-conversion";

interface TenantIntent {
  id: string;
  business_type: string;
  preferred_regions: string[];
  area_min: number | null;
  area_max: number | null;
  budget_deposit_max: number | null;
  budget_monthly_max: number | null;
  created_at: string;
  client?: {
    display_name: string;
    company: string | null;
  } | null;
}

function TenantIntentsListContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const buildingId = searchParams?.get("buildingId");
  const [intents, setIntents] = useState<TenantIntent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchIntents();
  }, [search]);

  const fetchIntents = async () => {
    try {
      const url = search ? `/api/broker/tenant-intents?search=${encodeURIComponent(search)}` : "/api/broker/tenant-intents";
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "목록 조회 실패");
      setIntents(json.data || []);
    } catch (err: any) {
      setError(err.message || "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex flex-col items-center min-h-screen bg-[#F5F5F7] text-[#1D1D1F] px-4 py-8 pb-24">
      <div className="w-full max-w-md mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between pt-4">
          <div>
            <h1 className="text-xl font-bold text-[#1D1D1F]">임차인 의향서 관리</h1>
            <p className="text-sm text-[#515154]">등록된 고객들의 임차 조건을 관리합니다</p>
          </div>
          <Link
            href="/broker/tenant-intents/new"
            className="bg-[#0055D4] hover:bg-[#0040DD] text-white font-semibold rounded-xl px-4 py-2 text-sm transition-colors"
          >
            + 새 의향서
          </Link>
        </div>

        {/* Building ID link banner if present */}
        {buildingId && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center justify-between">
            <span className="text-sm text-[#0055D4] font-medium">🏢 매물 연동 임차의향서 매칭</span>
            <Link
              href={`/broker/deal-card/${buildingId}`}
              className="text-sm text-[#0055D4] font-semibold underline hover:text-[#0040DD]"
            >
              ← 딜카드로 이동
            </Link>
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <input
            type="text"
            placeholder="업종으로 의향서 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-3 text-sm text-[#1D1D1F] placeholder:text-[#6E6E73] focus:outline-none focus:border-[#0055D4] transition-all"
          />
          <span className="absolute left-3 top-3.5 text-[#515154] text-sm">🔍</span>
        </div>

        {/* List Content */}
        {loading ? (
          <div className="flex justify-center py-12 text-[#0055D4]">
            <div className="relative w-6 h-6">
              <div className="absolute inset-0 rounded-full border-2 border-[#0055D4]/20 border-t-[#0055D4] animate-spin" />
            </div>
          </div>
        ) : error ? (
          <div className="text-center py-12 text-[#C8102E] text-sm font-medium">⚠️ {error}</div>
        ) : intents.length > 0 ? (
          <div className="space-y-3">
            {intents.map((intent) => {
              const regions = intent.preferred_regions.length > 0 ? intent.preferred_regions.slice(0, 3).join(", ") : "전국";
              return (
                <div
                  key={intent.id}
                  onClick={() => router.push(`/broker/tenant-intents/${intent.id}`)}
                  className="ios-glass-card hover:border-[#0055D4]/40 rounded-2xl p-4 transition-all cursor-pointer space-y-2.5 active:scale-[0.99]"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h2 className="text-base font-semibold text-[#1D1D1F]">
                        {intent.client?.display_name || "익명 임차고객"}
                        {intent.client?.company ? ` (${intent.client.company})` : ""}
                      </h2>
                      <p className="text-sm text-[#0055D4] font-semibold mt-0.5">업종: {intent.business_type}</p>
                    </div>
                    <span className="text-sm text-[#515154]">
                      {new Date(intent.created_at).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm text-[#515154]">
                    <div>
                      <span className="text-[#515154] font-medium">선호 권역:</span> {regions}
                    </div>
                    <div>
                      <span className="text-[#515154] font-medium">희망 면적:</span>{" "}
                      {intent.area_min || intent.area_max
                        ? `${intent.area_min ? `${Math.round(sqmToPyeong(intent.area_min))}평` : ""} ~ ${intent.area_max ? `${Math.round(sqmToPyeong(intent.area_max))}평` : ""}`
                        : "미정"}
                    </div>
                    <div className="col-span-2">
                      <span className="text-[#515154] font-medium">월세 상한:</span>{" "}
                      <span className="text-[#1D1D1F] font-semibold">
                        {intent.budget_monthly_max ? `${intent.budget_monthly_max}만원 이하` : "예산 협의"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="ios-glass-card rounded-2xl p-8 text-center text-[#515154] space-y-2">
            <p className="text-sm font-medium text-[#1D1D1F]">등록된 임차인 의향서 조건이 없습니다.</p>
            <p className="text-sm">새 의향서를 등록해 AI 자동 추천 매칭을 시작해보세요!</p>
          </div>
        )}
      </div>

      <BrokerBottomNav />
    </main>
  );
}

export default function TenantIntentsListPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F5F5F7] flex items-center justify-center text-[#515154] text-sm">로딩 중...</div>}>
      <TenantIntentsListContent />
    </Suspense>
  );
}
