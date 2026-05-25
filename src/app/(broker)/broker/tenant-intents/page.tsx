"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import BrokerBottomNav from "@/components/layout/BrokerBottomNav";

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

export default function TenantIntentsListPage() {
  const router = useRouter();
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
    <main className="flex flex-col items-center min-h-screen bg-[#0b0f19] text-slate-200 px-4 py-8 pb-24">
      <div className="w-full max-w-md mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between pt-4">
          <div>
            <h1 className="text-xl font-bold text-white">임차인 의향서 관리</h1>
            <p className="text-xs text-slate-400">등록된 고객들의 임차 조건을 관리합니다</p>
          </div>
          <Link
            href="/broker/tenant-intents/new"
            className="bg-primary hover:bg-primary/95 text-primary-foreground font-semibold rounded-xl px-4 py-2 text-xs transition-colors"
          >
            + 새 의향서
          </Link>
        </div>

        {/* Search */}
        <div className="relative">
          <input
            type="text"
            placeholder="업종으로 의향서 검색..."
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
        ) : intents.length > 0 ? (
          <div className="space-y-3">
            {intents.map((intent) => {
              const regions = intent.preferred_regions.length > 0 ? intent.preferred_regions.slice(0, 3).join(", ") : "전국";
              return (
                <div
                  key={intent.id}
                  onClick={() => router.push(`/broker/tenant-intents/${intent.id}`)}
                  className="bg-[#151c2c] border border-slate-800 hover:border-primary/30 rounded-2xl p-4 transition-all cursor-pointer space-y-2.5 active:scale-[0.99]"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h2 className="text-sm font-semibold text-white">
                        {intent.client?.display_name || "익명 임차고객"}
                        {intent.client?.company ? ` (${intent.client.company})` : ""}
                      </h2>
                      <p className="text-[10px] text-primary font-semibold mt-0.5">업종: {intent.business_type}</p>
                    </div>
                    <span className="text-[10px] text-slate-500">
                      {new Date(intent.created_at).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400">
                    <div>
                      <span className="text-slate-600 font-medium">선호 권역:</span> {regions}
                    </div>
                    <div>
                      <span className="text-slate-600 font-medium">희망 면적:</span>{" "}
                      {intent.area_min || intent.area_max
                        ? `${intent.area_min ? `${Math.round(intent.area_min / 3.3058)}평` : ""} ~ ${intent.area_max ? `${Math.round(intent.area_max / 3.3058)}평` : ""}`
                        : "미정"}
                    </div>
                    <div className="col-span-2">
                      <span className="text-slate-600 font-medium">월세 상한:</span>{" "}
                      <span className="text-white font-semibold">
                        {intent.budget_monthly_max ? `${intent.budget_monthly_max}만원 이하` : "예산 협의"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-[#121824] border border-slate-800 rounded-2xl p-8 text-center text-slate-500 space-y-2">
            <p className="text-xs">등록된 임차인 의향서 조건이 없습니다.</p>
            <p className="text-[10px]">새 의향서를 등록해 AI 자동 추천 매칭을 시작해보세요!</p>
          </div>
        )}
      </div>

      <BrokerBottomNav />
    </main>
  );
}
