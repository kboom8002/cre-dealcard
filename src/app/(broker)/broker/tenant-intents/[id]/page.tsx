"use client";

import React, { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import BrokerBottomNav from "@/components/layout/BrokerBottomNav";

interface TenantIntentDetail {
  intent: {
    id: string;
    business_type: string;
    preferred_regions: string[];
    area_min: number | null;
    area_max: number | null;
    budget_deposit_max: number | null;
    budget_monthly_max: number | null;
    preferred_floors: string[];
    must_have: string[];
    nice_to_have: string[];
    created_at: string;
    client?: {
      id: string;
      display_name: string;
      company: string | null;
      phone: string | null;
      email: string | null;
    } | null;
  };
  matches: Array<{
    grade: string;
    score: number;
    reasoning: string;
    space: {
      id: string;
      floor: string | null;
      area_sqm: number | null;
      space_type: string;
      deposit: number | null;
      monthly_rent: number | null;
      maintenance_fee: number | null;
      building?: {
        area_signal: string;
        fit_summary: string;
      };
    };
  }>;
}

export default function TenantIntentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const { id } = use(params);

  const [data, setData] = useState<TenantIntentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDetail();
  }, [id]);

  const fetchDetail = async () => {
    try {
      const res = await fetch(`/api/broker/tenant-intents/${id}`);
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "상세 정보 조회 실패");
      setData(json.data);
    } catch (err: any) {
      setError(err.message || "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#0b0f19] text-primary">
        <div className="relative w-8 h-8">
          <div className="absolute inset-0 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
        </div>
        <p className="text-xs mt-3 animate-pulse">로딩 중...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#0b0f19] text-slate-300 px-4 text-center">
        <p className="text-sm text-red-400">⚠️ {error || "데이터를 찾을 수 없습니다."}</p>
        <button
          onClick={() => router.push("/broker/tenant-intents")}
          className="mt-4 bg-slate-800 hover:bg-slate-700 text-white rounded-xl px-5 py-2.5 text-xs transition-colors"
        >
          목록으로 돌아가기
        </button>
      </div>
    );
  }

  const { intent, matches } = data;

  return (
    <main className="flex flex-col items-center min-h-screen bg-[#0b0f19] text-slate-200 px-4 py-8 pb-24">
      <div className="w-full max-w-md mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between pt-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push("/broker/tenant-intents")}
              className="text-slate-400 hover:text-white p-1 text-lg transition-colors"
            >
              ←
            </button>
            <h1 className="text-lg font-bold text-white">임차인 의향서 상세</h1>
          </div>
          <button
            onClick={() => {
              if (confirm("임차 의향서를 완전히 삭제하시겠습니까?")) {
                fetch(`/api/broker/tenant-intents/${id}`, { method: "DELETE" }).then(() => router.push("/broker/tenant-intents"));
              }
            }}
            className="text-xs text-red-400 hover:text-red-300 hover:underline"
          >
            🗑️ 삭제
          </button>
        </div>

        {/* Client info widget */}
        <div className="bg-[#151c2c] border border-slate-800 rounded-2xl p-4 space-y-2">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] text-primary font-semibold tracking-wide uppercase">👤 의뢰 고객 CRM</p>
              <h2 className="text-sm font-bold text-white mt-0.5">
                {intent.client?.display_name || "익명 임차고객"}
                {intent.client?.company ? ` (${intent.client.company})` : ""}
              </h2>
            </div>
            {intent.client?.phone && (
              <span className="text-[10px] bg-slate-800 text-slate-300 px-2.5 py-1 rounded-lg">
                📞 {intent.client.phone}
              </span>
            )}
          </div>
        </div>

        {/* Intent requirements */}
        <div className="bg-[#151c2c] border border-slate-800 rounded-2xl p-5 space-y-4 shadow-lg">
          <div className="border-b border-slate-800/80 pb-3">
            <span className="text-[10px] bg-primary/20 text-primary font-semibold rounded-full px-2 py-0.5 border border-primary/30 uppercase tracking-wider">
              임차 요구 조건 (AI 구조화 완료)
            </span>
            <h3 className="text-sm font-bold text-white mt-2">희망 업종: {intent.business_type}</h3>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-[10px] text-slate-500 font-medium">선호 권역</p>
              <p className="font-semibold text-white mt-0.5">
                {intent.preferred_regions.length > 0 ? intent.preferred_regions.join(", ") : "권역 상관없음"}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 font-medium">희망 전용 면적</p>
              <p className="font-semibold text-white mt-0.5">
                {intent.area_min || intent.area_max
                  ? `${intent.area_min ? `${Math.round(intent.area_min / 3.3058)}평` : ""} ~ ${intent.area_max ? `${Math.round(intent.area_max / 3.3058)}평` : ""}`
                  : "면적 상관없음"}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 font-medium">최대 월차임 예산</p>
              <p className="font-semibold text-primary mt-0.5">
                {intent.budget_monthly_max ? `${intent.budget_monthly_max}만원 이하` : "월세 협의 가능"}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 font-medium">최대 보증금 예산</p>
              <p className="font-semibold text-white mt-0.5">
                {intent.budget_deposit_max ? `${intent.budget_deposit_max}만원 이하` : "보증금 제한없음"}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 font-medium">선호 층수</p>
              <p className="font-semibold text-white mt-0.5">
                {intent.preferred_floors.length > 0 ? intent.preferred_floors.join(", ") : "층수 상관없음"}
              </p>
            </div>
          </div>

          {/* Must Have Conditions */}
          {intent.must_have.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] text-red-400 font-bold uppercase tracking-wide">🚨 필수 입점 조건 (Must-Have)</p>
              <div className="flex flex-wrap gap-1.5">
                {intent.must_have.map((val) => (
                  <span
                    key={val}
                    className="text-[10px] bg-red-500/10 text-red-400 border border-red-500/10 rounded-lg px-2.5 py-1"
                  >
                    {val}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Nice to Have Conditions */}
          {intent.nice_to_have.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] text-success font-bold uppercase tracking-wide">✨ 우대 선호 조건 (Nice-to-Have)</p>
              <div className="flex flex-wrap gap-1.5">
                {intent.nice_to_have.map((val) => (
                  <span
                    key={val}
                    className="text-[10px] bg-success/10 text-success border border-success/15 rounded-lg px-2.5 py-1"
                  >
                    {val}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Matched Lease Spaces */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-300">🎯 자동 매칭된 최적의 임대 매물</h2>
            <span className="text-[10px] text-slate-500 font-medium">총 {matches.length}개 추천</span>
          </div>

          {matches.length > 0 ? (
            <div className="space-y-2">
              {matches.map(({ grade, score, reasoning, space }) => {
                const gradeColors: Record<string, string> = {
                  S: "text-grade-s bg-grade-s/10 border-grade-s/30",
                  A: "text-grade-a bg-grade-a/10 border-grade-a/30",
                  B: "text-grade-b bg-grade-b/10 border-grade-b/30",
                };
                const displayGrade = gradeColors[grade] || "text-slate-400 bg-slate-800 border-slate-700";

                return (
                  <div
                    key={space.id}
                    onClick={() => router.push(`/broker/lease-card/${space.id}`)}
                    className="flex items-center gap-3 rounded-xl border border-slate-800 bg-[#121824] px-4 py-3 hover:border-primary/30 transition-all cursor-pointer active:scale-[0.99]"
                  >
                    <span className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold border text-sm shrink-0 ${displayGrade}`}>
                      {grade}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-white truncate">
                        [{space.building?.area_signal || "권역미상"}] {space.floor ? `${space.floor} ` : ""}{space.space_type === "office" ? "오피스" : "상가"}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {space.area_sqm ? `${Math.round(space.area_sqm / 3.3058)}평 ` : ""} · 보증금 {space.deposit || 0}만 / 월 {space.monthly_rent || 0}만
                      </p>
                      <p className="text-[9px] text-primary mt-1 font-medium truncate">{reasoning}</p>
                    </div>
                    <span className="text-xs text-slate-600 shrink-0">→</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-slate-800 bg-card p-5 text-center text-slate-500">
              <p className="text-xs">현재 등록된 임대 딜카드 중 매칭되는 공간이 없습니다.</p>
            </div>
          )}
        </div>
      </div>

      <BrokerBottomNav />
    </main>
  );
}
