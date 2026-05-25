"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import BrokerBottomNav from "@/components/layout/BrokerBottomNav";

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
    <main className="flex flex-col items-center min-h-screen bg-[#0b0f19] text-slate-200 px-4 py-8 pb-24">
      <div className="w-full max-w-md mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between pt-4">
          <div>
            <h1 className="text-xl font-bold text-white">임대차 딜카드 관리</h1>
            <p className="text-xs text-slate-400">보유 중인 비공개 임대 공간 및 조건 목록</p>
          </div>
          <Link
            href="/broker/lease-card/new"
            className="bg-primary hover:bg-primary/95 text-primary-foreground font-semibold rounded-xl px-4 py-2 text-xs transition-colors"
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
            className="w-full bg-[#111726] border border-slate-800 rounded-xl pl-9 pr-4 py-3 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-primary/50 transition-all"
          />
          <span className="absolute left-3 top-3.5 text-slate-600 text-xs">🔍</span>
        </div>

        {/* List Content */}
        {loading ? (
          <div className="flex justify-center py-12 text-primary">
            <div className="relative w-6 h-6">
              <div className="absolute inset-0 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
            </div>
          </div>
        ) : error ? (
          <div className="text-center py-12 text-red-400 text-xs">⚠️ {error}</div>
        ) : spaces.length > 0 ? (
          <div className="space-y-3">
            {spaces.map((space) => {
              const areaPy = space.area_sqm ? Math.round(space.area_sqm / 3.3058) : 0;
              const typeLabel = space.space_type === "office" ? "📁 오피스" : space.space_type === "f_and_b" ? "☕ F&B/식음" : "🛍️ 상가/리테일";
              
              return (
                <div
                  key={space.id}
                  onClick={() => router.push(`/broker/lease-card/${space.id}`)}
                  className="bg-[#151c2c] border border-slate-800 hover:border-primary/30 rounded-2xl p-4 transition-all cursor-pointer space-y-2.5 active:scale-[0.99]"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h2 className="text-sm font-semibold text-white">
                        {space.building?.area_signal || "권역 미확인"}{" "}
                        {space.floor ? `${space.floor}` : "층 미상"}
                      </h2>
                      <p className="text-[10px] text-slate-400 mt-0.5">{typeLabel}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {space.is_marketplace_listed && (
                        <span className="shrink-0 text-[8px] bg-primary/20 text-primary border border-primary/30 rounded-full px-1.5 py-0.5 font-bold">
                          MARKET
                        </span>
                      )}
                      <span className="text-[10px] text-slate-500">
                        {new Date(space.created_at).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400">
                    <div>
                      <span className="text-slate-600 font-medium">임대 면적:</span> {space.area_sqm ? `${space.area_sqm}㎡ (${areaPy}평)` : "미확인"}
                    </div>
                    <div>
                      <span className="text-slate-600 font-medium">매칭 고객:</span>{" "}
                      <span className={space.match_count > 0 ? "text-primary font-bold" : "text-slate-400"}>
                        🎯 {space.match_count}명
                      </span>
                    </div>
                    <div className="col-span-2 text-white font-semibold text-xs mt-1">
                      보증금 {space.deposit || 0}만 / 월 {space.monthly_rent || 0}만
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-[#121824] border border-slate-800 rounded-2xl p-8 text-center text-slate-500 space-y-2">
            <p className="text-xs">등록된 임대차 딜카드가 없습니다.</p>
            <p className="text-[10px]">새 카톡 메모를 분석하여 첫 임대차 딜카드를 만들어보세요!</p>
          </div>
        )}
      </div>

      <BrokerBottomNav />
    </main>
  );
}
