"use client";

import React, { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import BrokerBottomNav from "@/components/layout/BrokerBottomNav";

interface LeaseSpaceDetail {
  space: {
    id: string;
    floor: string | null;
    area_sqm: number | null;
    space_type: string;
    deposit: number | null;
    monthly_rent: number | null;
    maintenance_fee: number | null;
    available_from: string | null;
    lease_term_months: number | null;
    restrictions: string[];
    incentives?: {
      rentFreeMonths?: number;
      interiorSupport?: string | null;
      freeRentDetail?: string | null;
    } | null;
    is_marketplace_listed: boolean;
    hidden_fields: string[];
    created_at: string;
    building?: {
      area_signal: string;
      fit_summary: string;
      caution_summary: string;
    };
  };
  teaser: {
    title: string;
    body: {
      shortSummary: string;
      dealPoints: string[];
      cautionPoints: string[];
      hiddenInfoNotice: string[];
      gateMessage: string;
      boundaryNote: string;
    };
    markdown: string;
  } | null;
  matches: Array<{
    grade: string;
    score: number;
    reasoning: string;
    intent: {
      id: string;
      business_type: string;
      area_min: number | null;
      area_max: number | null;
      budget_monthly_max: number | null;
      client?: {
        id: string;
        display_name: string;
        company: string | null;
      };
    };
  }>;
}

export default function LeaseCardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const { id } = use(params);

  const [data, setData] = useState<LeaseSpaceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDetail();
  }, [id]);

  const fetchDetail = async () => {
    try {
      const res = await fetch(`/api/broker/lease-card/${id}`);
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "상세 정보 조회 실패");
      setData(json.data);
    } catch (err: any) {
      setError(err.message || "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!data?.teaser?.markdown) return;
    try {
      await navigator.clipboard.writeText(data.teaser.markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("클립보드 복사 실패", err);
    }
  };

  const handleMarketplaceToggle = async () => {
    if (!data || toggling) return;
    setToggling(true);
    const nextState = !data.space.is_marketplace_listed;

    try {
      const res = await fetch(`/api/broker/lease-card/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_marketplace_listed: nextState }),
      });

      if (!res.ok) throw new Error("마켓플레이스 게재 상태 수정 실패");
      
      setData({
        ...data,
        space: {
          ...data.space,
          is_marketplace_listed: nextState,
        },
      });
    } catch (err: any) {
      alert(err.message);
    } finally {
      setToggling(false);
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
          onClick={() => router.push("/broker")}
          className="mt-4 bg-slate-800 hover:bg-slate-700 text-white rounded-xl px-5 py-2.5 text-xs transition-colors"
        >
          대시보드로 돌아가기
        </button>
      </div>
    );
  }

  const { space, teaser, matches } = data;

  return (
    <main className="flex flex-col items-center min-h-screen bg-[#0b0f19] text-slate-200 px-4 py-8 pb-24">
      <div className="w-full max-w-md mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between pt-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push("/broker")}
              className="text-slate-400 hover:text-white p-1 text-lg transition-colors"
            >
              ←
            </button>
            <h1 className="text-lg font-bold text-white">임대차 딜카드 상세</h1>
          </div>
          <button
            onClick={() => {
              if (confirm("임대 카드를 완전히 삭제하시겠습니까?")) {
                fetch(`/api/broker/lease-card/${id}`, { method: "DELETE" }).then(() => router.push("/broker"));
              }
            }}
            className="text-xs text-red-400 hover:text-red-300 hover:underline"
          >
            🗑️ 삭제
          </button>
        </div>

        {/* Marketplace Listed Toggle widget */}
        <div className="bg-[#131b2e] border border-slate-800/80 rounded-2xl p-4 flex justify-between items-center shadow-md">
          <div className="space-y-1">
            <h2 className="text-xs font-semibold text-slate-100 flex items-center gap-1.5">
              🌐 공개 마켓플레이스 게재
              {space.is_marketplace_listed ? (
                <span className="inline-flex items-center rounded-full bg-success/15 px-1.5 py-0.5 text-[9px] font-medium text-success border border-success/30">
                  게재중
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-slate-800 px-1.5 py-0.5 text-[9px] font-medium text-slate-400 border border-slate-700">
                  비공개
                </span>
              )}
            </h2>
            <p className="text-[10px] text-slate-400">
              {space.is_marketplace_listed
                ? "비인증 일반 임차고객이 검색 포털에서 이 블라인드 매물을 볼 수 있습니다."
                : "중개인 전용 대시보드 내에서만 관리 및 수동 매칭합니다."}
            </p>
          </div>
          <button
            onClick={handleMarketplaceToggle}
            disabled={toggling}
            className={`w-12 h-6 rounded-full p-1 transition-all duration-300 ${
              space.is_marketplace_listed ? "bg-primary" : "bg-slate-700"
            } flex items-center relative cursor-pointer`}
          >
            <div
              className={`w-4 h-4 rounded-full bg-white transition-all shadow ${
                space.is_marketplace_listed ? "translate-x-6" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        {/* Derived representation (Blind Teaser UI) */}
        {teaser && (
          <div className="bg-[#151c2c] border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            {/* Teaser Header */}
            <div className="bg-primary/10 border-b border-slate-800 px-5 py-4">
              <span className="text-[10px] bg-primary/20 text-primary font-semibold rounded-full px-2 py-0.5 border border-primary/30 uppercase tracking-wider">
                Blind Leasing Card
              </span>
              <h2 className="text-base font-bold text-white mt-1.5">{teaser.title}</h2>
              <p className="text-xs text-slate-400 mt-1">{teaser.body.shortSummary}</p>
            </div>

            {/* Teaser Facts */}
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3 bg-[#111726]/80 rounded-xl p-3 border border-slate-800/60 text-xs">
                <div>
                  <p className="text-[10px] text-slate-500 font-medium">임대료 조건</p>
                  <p className="font-semibold text-white mt-0.5">
                    보증금 {space.deposit || "비공개"}만 / 월 {space.monthly_rent || "비공개"}만
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 font-medium">전용 면적</p>
                  <p className="font-semibold text-white mt-0.5">
                    {space.area_sqm ? `${space.area_sqm}㎡ (${Math.round(space.area_sqm / 3.3058)}평)` : "비공개"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 font-medium">공간 유형 및 층</p>
                  <p className="font-semibold text-white mt-0.5 capitalize">
                    {space.floor ? `${space.floor} / ` : ""}{space.space_type === "office" ? "오피스" : "상가 (리테일/F&B)"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 font-medium">렌트프리 지원</p>
                  <p className="font-semibold text-primary mt-0.5">
                    {space.incentives?.rentFreeMonths ? `${space.incentives.rentFreeMonths}개월 협의` : "협의 중"}
                  </p>
                </div>
              </div>

              {/* Deal points (USP) */}
              <div className="space-y-1.5">
                <p className="text-[11px] text-success font-semibold tracking-wide uppercase">✨ 임대 강점 (AI 분석)</p>
                <ul className="space-y-1 text-xs text-slate-300">
                  {teaser.body.dealPoints.map((point, index) => (
                    <li key={index} className="flex items-start gap-1.5 leading-relaxed">
                      <span className="text-success select-none">✔</span> {point}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Caution points */}
              <div className="space-y-1.5">
                <p className="text-[11px] text-warning font-semibold tracking-wide uppercase">⚠️ 입점 주의사항</p>
                <ul className="space-y-1 text-xs text-slate-300">
                  {teaser.body.cautionPoints.map((point, index) => (
                    <li key={index} className="flex items-start gap-1.5 leading-relaxed">
                      <span className="text-warning select-none">•</span> {point}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Disclosure policy guard warning */}
              <div className="bg-[#121824] rounded-xl px-4 py-3 border border-slate-800/80 space-y-1.5">
                <p className="text-[10px] text-slate-500 font-semibold flex items-center gap-1">
                  🔒 보안 게이트 제어 필드 ({space.hidden_fields.length}개)
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {space.hidden_fields.map((field) => (
                    <span
                      key={field}
                      className="text-[9px] bg-slate-800 text-slate-400 rounded-md px-1.5 py-0.5 font-sans font-medium"
                    >
                      {field === "exact_address"
                        ? "정확한 주소"
                        : field === "exact_unit"
                          ? "정확한 호실"
                          : field === "landlord_identity"
                            ? "임대인 정보"
                            : field === "current_tenant"
                              ? "현 임차인명"
                              : field === "vacancy_reason"
                                ? "공실 사유"
                                : field === "rent_negotiation"
                                  ? "렌트 협의 상세"
                                  : field === "incentive_detail"
                                    ? "무상 임대 조건"
                                    : field}
                    </span>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                  임차인이 상세 자료 요청(G2/G3 Gate)을 수행하고 중개인이 수락하기 전까지는 위 정보가 엄격히 차단됩니다.
                </p>
              </div>

              {/* Action: Copy Kakao text */}
              <button
                onClick={handleCopy}
                className={`w-full py-3 rounded-xl font-semibold text-xs transition-all flex items-center justify-center gap-1.5 ${
                  copied
                    ? "bg-success text-success-foreground"
                    : "bg-slate-800 hover:bg-slate-700 text-slate-200"
                }`}
              >
                <span>💬</span>
                {copied ? "카톡 전송 문구 복사 완료!" : "카톡용 블라인드 문구 복사"}
              </button>
            </div>
          </div>
        )}

        {/* Matchboard integration */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-300">🎯 자동 매칭된 임차인 의향서</h2>
            <span className="text-[10px] text-slate-500 font-medium">총 {matches.length}명</span>
          </div>

          {matches.length > 0 ? (
            <div className="space-y-2">
              {matches.map(({ grade, score, reasoning, intent }) => {
                const gradeColors: Record<string, string> = {
                  S: "text-grade-s bg-grade-s/10 border-grade-s/30",
                  A: "text-grade-a bg-grade-a/10 border-grade-a/30",
                  B: "text-grade-b bg-grade-b/10 border-grade-b/30",
                };
                const displayGrade = gradeColors[grade] || "text-slate-400 bg-slate-800 border-slate-700";

                return (
                  <div
                    key={intent.id}
                    onClick={() => router.push(`/broker/tenant-intents/${intent.id}`)}
                    className="flex items-center gap-3 rounded-xl border border-slate-800 bg-[#121824] px-4 py-3 hover:border-primary/30 transition-all cursor-pointer"
                  >
                    <span className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold border text-sm ${displayGrade}`}>
                      {grade}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-white">
                        {intent.client?.display_name || "익명 임차고객"} (업종: {intent.business_type})
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5 truncate">{reasoning}</p>
                    </div>
                    <span className="text-xs text-slate-600 shrink-0">→</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-slate-800 bg-card p-5 text-center">
              <p className="text-xs text-slate-500 leading-relaxed">
                현재 이 임대 조건에 부합하는 임차인 의향서(예산, 면적, 권역 등)가 존재하지 않습니다.
              </p>
              <button
                onClick={() => router.push("/broker/tenant-intents/new")}
                className="mt-3 bg-slate-800 hover:bg-slate-700 text-white rounded-lg px-4 py-2 text-[10px] font-semibold transition-colors"
              >
                신규 임차 조건 등록
              </button>
            </div>
          )}
        </div>
      </div>

      <BrokerBottomNav />
    </main>
  );
}
