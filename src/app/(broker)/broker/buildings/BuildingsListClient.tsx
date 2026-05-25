"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

interface Building {
  id: string;
  area_signal: string | null;
  asset_type: string | null;
  price_band: string | null;
  status: string | null;
  matched_buyer_count: number | null;
  promotion_score: number | null;
  vacancy_signal: string | null;
  created_at: string;
}

interface BuildingsListClientProps {
  initialBuildings: Building[];
}

export function BuildingsListClient({ initialBuildings }: BuildingsListClientProps) {
  const [filterType, setFilterType] = useState<"all" | "office" | "retail">("all");
  const [sortBy, setSortBy] = useState<"score-desc" | "score-asc" | "created-desc">("score-desc");
  const [searchQuery, setSearchQuery] = useState("");

  const PIPELINE_STAGES: { key: string; label: string; emoji: string }[] = [
    { key: "draft", label: "입력 완료", emoji: "📋" },
    { key: "active", label: "매수자 매칭", emoji: "🎯" },
    { key: "im_ready", label: "IM 준비", emoji: "📄" },
    { key: "negotiating", label: "협상 중", emoji: "🤝" },
    { key: "closed", label: "계약 완료", emoji: "✅" },
  ];

  // Filter and Sort buildings
  const filteredAndSortedBuildings = useMemo(() => {
    let result = [...initialBuildings];

    // Filter by asset type
    if (filterType === "office") {
      result = result.filter((b) => b.asset_type?.toLowerCase().includes("오피스") || b.asset_type?.toLowerCase().includes("office"));
    } else if (filterType === "retail") {
      result = result.filter((b) => b.asset_type?.toLowerCase().includes("리테일") || b.asset_type?.toLowerCase().includes("retail") || b.asset_type?.toLowerCase().includes("상가"));
    }

    // Filter by search query (area)
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (b) =>
          b.area_signal?.toLowerCase().includes(q) ||
          b.asset_type?.toLowerCase().includes(q) ||
          b.price_band?.toLowerCase().includes(q)
      );
    }

    // Sort
    if (sortBy === "score-desc") {
      result.sort((a, b) => (b.promotion_score ?? 0) - (a.promotion_score ?? 0));
    } else if (sortBy === "score-asc") {
      result.sort((a, b) => (a.promotion_score ?? 0) - (b.promotion_score ?? 0));
    } else if (sortBy === "created-desc") {
      result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    return result;
  }, [initialBuildings, filterType, sortBy, searchQuery]);

  // Aggregate Metrics dynamically for active list
  const metrics = useMemo(() => {
    const total = filteredAndSortedBuildings.length;
    const scores = filteredAndSortedBuildings.map((b) => b.promotion_score ?? 0).filter(Boolean);
    const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    
    // Count per pipeline stages
    const stageCounts = PIPELINE_STAGES.reduce((acc, s) => {
      acc[s.key] = filteredAndSortedBuildings.filter((b) => b.status === s.key).length;
      return acc;
    }, {} as Record<string, number>);

    const activePipelineCount = filteredAndSortedBuildings.filter(
      (b) => b.status && b.status !== "draft" && b.status !== "closed"
    ).length;

    return {
      total,
      avgScore,
      stageCounts,
      activePipelineCount,
    };
  }, [filteredAndSortedBuildings]);

  return (
    <div className="space-y-6">
      {/* Top Professional KPI Board */}
      <div className="grid grid-cols-2 gap-3.5">
        {/* Average Promotion Score Card */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4 space-y-2 flex flex-col justify-between">
          <div>
            <span className="block text-[11px] font-bold text-neutral-400 uppercase tracking-widest">
              AVG Promotion Score
            </span>
            <p className="text-3xl font-black text-primary mt-1">
              {metrics.avgScore} <span className="text-xs font-normal text-neutral-400">점</span>
            </p>
          </div>
          <div className="w-full bg-neutral-800 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-primary h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, metrics.avgScore)}%` }}
            ></div>
          </div>
        </div>

        {/* Active Deals Card */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4 space-y-1 flex flex-col justify-between">
          <div>
            <span className="block text-[11px] font-bold text-neutral-400 uppercase tracking-widest">
              Active Pipeline
            </span>
            <p className="text-3xl font-black text-emerald-400 mt-1">
              {metrics.activePipelineCount}{" "}
              <span className="text-xs font-normal text-neutral-400">건 진행</span>
            </p>
          </div>
          <span className="text-[10px] text-neutral-500 leading-relaxed">
            전체 매물 {metrics.total}건 중 임대 홍보 중인 실시간 자산
          </span>
        </div>
      </div>

      {/* P1-3: Deal Pipeline Stage Counts */}
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-neutral-300 uppercase tracking-wider">
            🔄 단계별 매물 파이프라인
          </h3>
          <span className="px-2 py-0.5 rounded bg-neutral-800 text-[10px] text-neutral-400 font-mono">
            LIVE STATS
          </span>
        </div>
        <div className="flex items-center gap-0 overflow-x-auto pb-1 scrollbar-thin">
          {PIPELINE_STAGES.map((stage, idx) => {
            const count = metrics.stageCounts[stage.key] ?? 0;
            const isLast = idx === PIPELINE_STAGES.length - 1;
            return (
              <div key={stage.key} className="flex items-center shrink-0">
                <div className="flex flex-col items-center gap-1 px-3">
                  <span className="text-lg">{stage.emoji}</span>
                  <span
                    className={`text-sm font-black ${
                      count > 0 ? "text-primary scale-110" : "text-neutral-500"
                    }`}
                  >
                    {count}
                  </span>
                  <span className="text-[10.5px] text-neutral-400 font-medium whitespace-nowrap">
                    {stage.label}
                  </span>
                </div>
                {!isLast && (
                  <span className="text-neutral-700 text-xs shrink-0 font-bold px-1">
                    →
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Search and Filters panel */}
      <div className="space-y-3.5 bg-neutral-900 border border-neutral-800 rounded-2xl p-4">
        {/* Search */}
        <div className="relative">
          <input
            type="text"
            placeholder="📍 권역, 유형, 가격대 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-2.5 text-xs text-neutral-500 hover:text-neutral-300 font-semibold"
            >
              ×
            </button>
          )}
        </div>

        {/* Filter buttons & Sort Select */}
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          {/* Asset Type Filter Group */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setFilterType("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                filterType === "all"
                  ? "bg-neutral-800 text-white border border-neutral-700"
                  : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/40"
              }`}
            >
              전체 자산 ({initialBuildings.length})
            </button>
            <button
              onClick={() => setFilterType("office")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                filterType === "office"
                  ? "bg-neutral-800 text-white border border-neutral-700"
                  : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/40"
              }`}
            >
              오피스
            </button>
            <button
              onClick={() => setFilterType("retail")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                filterType === "retail"
                  ? "bg-neutral-800 text-white border border-neutral-700"
                  : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/40"
              }`}
            >
              리테일/상가
            </button>
          </div>

          {/* Sort selection */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-neutral-300 focus:outline-none cursor-pointer hover:border-neutral-750 transition-colors"
          >
            <option value="score-desc">🔥 노출 점수 높은 순</option>
            <option value="score-asc">❄️ 노출 점수 낮은 순</option>
            <option value="created-desc">📅 최근 등록 순</option>
          </select>
        </div>
      </div>

      {/* Buildings List Output */}
      {filteredAndSortedBuildings.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-neutral-450 px-1 text-[11px] font-semibold">
            <span>자산명 & 기본 필터</span>
            <span>종합점수</span>
          </div>

          {filteredAndSortedBuildings.map((b) => {
            const score = Math.round(b.promotion_score ?? 0);
            const scoreColor =
              score >= 70
                ? "text-emerald-450 bg-emerald-500/10 border border-emerald-550/20"
                : score >= 40
                ? "text-amber-450 bg-amber-500/10 border border-amber-550/20"
                : "text-neutral-450 bg-neutral-800/50 border border-neutral-750/30";
            const matchCount = b.matched_buyer_count ?? 0;
            const hasVacancy = b.vacancy_signal === "있음" || b.vacancy_signal === "부분";

            return (
              <Link
                key={b.id}
                href={`/broker/deal-card/${b.id}`}
                className="flex items-center justify-between rounded-2xl border border-neutral-800 bg-neutral-900 px-4 py-4.5 hover:border-neutral-700/80 active:scale-[0.99] transition-all hover:scale-[1.01] shadow-sm"
                id={`building-item-${b.id}`}
              >
                {/* Information content */}
                <div className="flex-1 min-w-0 pr-4 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-bold text-white tracking-tight truncate">
                      {b.area_signal ?? "권역 미상"} {b.asset_type ?? ""}
                    </h3>
                    {hasVacancy && (
                      <span className="shrink-0 inline-flex items-center rounded-full bg-amber-500/10 text-amber-400 border border-amber-550/20 px-2 py-0.5 text-[10px] font-bold">
                        공실 신호
                      </span>
                    )}
                    {b.status && (
                      <span className="shrink-0 inline-flex items-center rounded-full bg-neutral-800 text-neutral-450 border border-neutral-700 px-2 py-0.5 text-[9.5px] font-bold uppercase">
                        {PIPELINE_STAGES.find((s) => s.key === b.status)?.label ?? b.status}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-neutral-400 font-semibold">{b.price_band ?? "가격 미확정"}</span>
                    {matchCount > 0 && (
                      <span className="text-primary font-bold flex items-center gap-0.5">
                        🎯 {matchCount}명 매칭
                      </span>
                    )}
                  </div>
                </div>

                {/* score badge */}
                <div className="flex items-center gap-3 shrink-0">
                  <div className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center ${scoreColor}`}>
                    <span className="text-lg font-black leading-none">{score || "-"}</span>
                    <span className="text-[9px] font-semibold opacity-70 mt-0.5">점</span>
                  </div>
                  <span className="text-neutral-600 text-sm font-bold">→</span>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-8 text-center space-y-4">
          <p className="text-4xl">🔍</p>
          <p className="text-sm font-bold text-neutral-300">일치하는 등록 매물이 없습니다.</p>
          <p className="text-xs text-neutral-400 leading-relaxed">
            필터 조건을 변경하거나 새로운 상업용 자산을 등록해 매수자 AI 매칭을 시작해보세요.
          </p>
          <Link
            href="/broker/deal-card/new"
            className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-xs font-bold text-white transition-all hover:scale-[1.02] active:scale-[0.98]"
            id="cta-first-building"
          >
            + 첫 자산 딜카드 등록
          </Link>
        </div>
      )}
    </div>
  );
}
