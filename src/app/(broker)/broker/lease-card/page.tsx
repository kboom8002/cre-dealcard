"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import BrokerBottomNav from "@/components/layout/BrokerBottomNav";
import { sqmToPyeong } from "@/lib/utils/area-conversion";

interface LeaseSpace {
  id: string;
  floor: string | null;
  area_sqm: number | null;
  space_type: string;
  deposit: number | null;
  monthly_rent: number | null;
  maintenance_fee: number | null;
  status: string;
  is_marketplace_listed: boolean;
  created_at: string;
  match_count: number;
  building?: {
    area_signal: string;
  } | null;
}

export default function LeaseSpacesListPage() {
  const router = useRouter();
  const [spaces, setSpaces] = useState<LeaseSpace[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSpaces();
  }, [search]);

  const fetchSpaces = async () => {
    try {
      const url = search ? `/api/broker/lease-card?search=${encodeURIComponent(search)}` : "/api/broker/lease-card";
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "목록 조회 실패");
      setSpaces(json.data || []);
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
            <h1 className="text-xl font-bold text-[#1D1D1F]">임대차 딜카드 관리</h1>
            <p className="text-sm text-[#515154]">보유 중인 비공개 임대 공간 및 조건 목록</p>
          </div>
          <Link
            href="/broker/lease-card/new"
            className="bg-[#0055D4] hover:bg-[#0040DD] text-white font-semibold rounded-xl px-4 py-2 text-sm transition-colors"
          >
            + 새 임대차
          </Link>
        </div>

        {/* Search */}
        <div className="relative">
          <input
            type="text"
            placeholder="공간 유형으로 검색 (예: office, retail)..."
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
        ) : spaces.length > 0 ? (
          <div className="space-y-3">
            {spaces.map((space) => {
              const areaPy = space.area_sqm ? Math.round(sqmToPyeong(space.area_sqm)) : 0;
              const typeLabel = space.space_type === "office" ? "📁 오피스" : space.space_type === "f_and_b" ? "☕ F&B/식음" : "🛍️ 상가/리테일";
              
              return (
                <div
                  key={space.id}
                  onClick={() => router.push(`/broker/lease-card/${space.id}`)}
                  className="ios-glass-card hover:border-[#0055D4]/40 rounded-2xl p-4 transition-all cursor-pointer space-y-2.5 active:scale-[0.99]"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h2 className="text-base font-semibold text-[#1D1D1F]">
                        {space.building?.area_signal || "권역 미확인"}{" "}
                        {space.floor ? `${space.floor}` : "층 미상"}
                      </h2>
                      <p className="text-sm text-[#515154] mt-0.5">{typeLabel}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {space.is_marketplace_listed && (
                        <span className="shrink-0 text-sm bg-blue-50 text-[#1D4ED8] border border-blue-200 rounded-full px-2 py-0.5 font-bold">
                          MARKET
                        </span>
                      )}
                      <span className="text-sm text-[#515154]">
                        {new Date(space.created_at).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm text-[#515154]">
                    <div>
                      <span className="text-[#515154] font-medium">임대 면적:</span> {space.area_sqm ? `${space.area_sqm}㎡ (${areaPy}평)` : "미확인"}
                    </div>
                    <div>
                      <span className="text-[#515154] font-medium">매칭 고객:</span>{" "}
                      <span className={space.match_count > 0 ? "text-[#0055D4] font-bold" : "text-[#515154]"}>
                        🎯 {space.match_count}명
                      </span>
                    </div>
                    <div className="col-span-2 text-[#1D1D1F] font-semibold text-sm mt-1">
                      보증금 {space.deposit || 0}만 / 월 {space.monthly_rent || 0}만
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="ios-glass-card rounded-2xl p-8 text-center text-[#515154] space-y-2">
            <p className="text-sm font-medium text-[#1D1D1F]">등록된 임대차 딜카드가 없습니다.</p>
            <p className="text-sm">새 카톡 메모를 분석하여 첫 임대차 딜카드를 만들어보세요!</p>
          </div>
        )}
      </div>

      <BrokerBottomNav />
    </main>
  );
}
