"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { SOTA_SPRING, StaggerContainer, StaggerItem } from "@/components/motion/sota-motion";
import BrokerBottomNav from "@/components/layout/BrokerBottomNav";
import { SeniorTermTooltip } from "@/components/help/SeniorTermTooltip";
import { FieldCoachBanner } from "@/components/help/FieldCoachBanner";

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

interface IMDocument {
  docId: string;
  buildingId: string;
  status: string;
  createdAt: string;
  updatedAt: string | null;
  areaSignal: string;
  assetType: string;
  priceBand: string;
}

interface BuildingsListClientProps {
  initialBuildings: Building[];
  imList?: IMDocument[];
}

export function BuildingsListClient({ initialBuildings, imList = [] }: BuildingsListClientProps) {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") === "im" ? "im" : "dealcard";
  const [activeTab, setActiveTab] = useState<"dealcard" | "im">(initialTab);
  const [buildings, setBuildings] = useState<Building[]>(initialBuildings);
  const [imListState, setImListState] = useState<IMDocument[]>(imList);
  const [filterType, setFilterType] = useState<"all" | "office" | "retail">("all");
  const [sortBy, setSortBy] = useState<"score-desc" | "score-asc" | "created-desc">("score-desc");
  const [searchQuery, setSearchQuery] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingImId, setDeletingImId] = useState<string | null>(null);
  const router = useRouter();

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/broker/deal-card/${id}/delete`, { method: "DELETE" });
      const d = await res.json().catch((err) => { console.warn('[BuildingsListClient]', err); return {}; });
      if (!res.ok) {
        throw new Error(d.error ?? "삭제 실패");
      }
      setBuildings((prev) => prev.filter((b) => b.id !== id));
      setImListState((prev) => prev.filter((d) => d.buildingId !== id));
      toast.success("딜카드가 삭제되었습니다.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "삭제 실패";
      toast.error(`삭제 중 오류: ${msg}`);
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  }

  const handleDeleteIM = async (docId: string) => {
    try {
      const res = await fetch(`/api/broker/im-lite/${docId}`, { method: 'DELETE' });
      const d = await res.json().catch((err) => { console.warn('[BuildingsListClient]', err); return {}; });
      if (!res.ok) throw new Error(d.error ?? '삭제 실패');
      setImListState(prev => prev.filter(d => d.docId !== docId));
      setDeletingImId(null);
      toast.success("IM이 삭제되었습니다.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '삭제에 실패했습니다.';
      toast.error(`삭제 중 오류: ${msg}`);
    }
  };

  const PIPELINE_STAGES: { key: string; label: string; emoji: string }[] = [
    { key: "draft", label: "입력 완료", emoji: "📋" },
    { key: "active", label: "매수자 매칭", emoji: "🎯" },
    { key: "im_ready", label: "IM 준비", emoji: "📄" },
    { key: "negotiating", label: "협상 중", emoji: "🤝" },
    { key: "closed", label: "계약 완료", emoji: "✅" },
  ];

  const [stageFilter, setStageFilter] = useState<string | null>(null);

  // Filter and Sort buildings
  const filteredAndSortedBuildings = useMemo(() => {
    let result = [...buildings];

    // Filter by stage
    if (stageFilter) {
      result = result.filter((b) => b.status === stageFilter);
    }

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
  }, [buildings, filterType, sortBy, searchQuery, stageFilter]);

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

  // Update totalBuildings count based on current (non-deleted) buildings
  const totalCount = buildings.length;

  return (
    <StaggerContainer className="space-y-6">
    {/* Tab Navigation — SOTA 슬라이딩 세그먼트 필 */}
    <StaggerItem className="grid grid-cols-2 gap-1.5 p-1.5 bg-slate-100 rounded-2xl border border-slate-200 shadow-inner">
      <button
        type="button"
        onClick={() => setActiveTab("dealcard")}
        data-active-pill={activeTab === "dealcard" ? "true" : undefined}
        className={`relative min-h-[44px] flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-extrabold transition-colors cursor-pointer ${
          activeTab === "dealcard"
            ? "text-white"
            : "text-slate-600 hover:text-slate-900"
        }`}
      >
        {activeTab === "dealcard" && (
          <motion.span
            layoutId="buildings-tab-active-pill"
            transition={SOTA_SPRING}
            className="absolute inset-0 rounded-xl bg-blue-700 shadow-sm"
          />
        )}
        <span className="relative z-10 flex items-center gap-1.5">
          <span>📄 딜카드 ({buildings.length})</span>
          <SeniorTermTooltip termKey="딜카드" buttonLabel="도움말" />
        </span>
      </button>
      <button
        type="button"
        onClick={() => setActiveTab("im")}
        data-active-pill={activeTab === "im" ? "true" : undefined}
        className={`relative min-h-[44px] flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-extrabold transition-colors cursor-pointer ${
          activeTab === "im"
            ? "text-white"
            : "text-slate-600 hover:text-slate-900"
        }`}
      >
        {activeTab === "im" && (
          <motion.span
            layoutId="buildings-tab-active-pill"
            transition={SOTA_SPRING}
            className="absolute inset-0 rounded-xl bg-indigo-700 shadow-sm"
          />
        )}
        <span className="relative z-10 flex items-center gap-1.5">
          <span>📊 투자설명서 IM ({imListState.length})</span>
          <SeniorTermTooltip termKey="모바일 IM" buttonLabel="도움말" />
        </span>
      </button>
    </StaggerItem>

    {/* Dynamic Coaching Banner for Active Tab */}
    <StaggerItem>
      {activeTab === "dealcard" ? (
        <FieldCoachBanner
          headline="⚡ 1분 딜카드 보관함 (블라인드 티저 보호)"
          guidance="상세 지번과 건물명을 가린 첫 접촉용 딜카드입니다. 카카오톡 첫 상담 시 매물 보안을 지키며 매수자의 매수 의향과 자금력을 신속하게 검증할 수 있습니다."
          sampleButtonLabel="📋 딜카드 카톡 전송 팁 복사"
          sampleText={`[딜카드 첫 상담 카톡 요령]
대표님, 요청하신 강남 역세권 빌딩 요약 딜카드 보내드립니다.
보안상 상세 지번은 가려져 있으며, 기본 조건 검토 후 관심 있으시면 정식 투자설명서(IM)와 함께 지번을 안내해 드리겠습니다.`}
          copySample
          copyToastMessage="✅ 딜카드 카톡 전송 요령이 복사되었습니다!"
          mistakeWarning="첫 상담에서 건물 실명이나 지번을 먼저 공개하시면 다른 중개업소나 매수인이 직거래를 시도할 수 있습니다. 지번이 안전하게 가려진 딜카드를 먼저 전송하세요."
          variant="amber"
        />
      ) : (
        <FieldCoachBanner
          headline="📊 정식 모바일 IM & PPTX 제안서 보관함"
          guidance="지적도, 층별 렌트롤, 10년 공시지가, 주변 시세 비교가 집약된 12면 정식 투자설명서입니다. 검토 후 PPTX 파일로 다운로드하거나 모바일 링크로 발송할 수 있습니다."
          sampleButtonLabel="📋 정식 IM 발송 안내문 복사"
          sampleText={`[정식 IM 제안서 발송 안내]
대표님, 검토 요청하신 물건의 정식 투자설명서(IM)입니다.
지적도, 층별 렌트롤, 10개년 공시지가 및 수익률 분석이 포함되어 있습니다. PC 파워포인트(PPTX) 또는 모바일 링크로 확인하실 수 있습니다.`}
          copySample
          copyToastMessage="✅ 정식 IM 발송 안내문이 복사되었습니다!"
          variant="blue"
        />
      )}
    </StaggerItem>

    {/* IM Tab Content */}
    {activeTab === "im" && (
      <div className="space-y-3">
        {imListState.length === 0 ? (
          <div className="text-center py-16 space-y-3 bg-white rounded-2xl border border-slate-200 p-6">
            <div className="text-4xl">📱</div>
            <p className="text-base font-bold text-slate-900">아직 생성된 투자설명서(IM)가 없습니다</p>
            <p className="text-sm text-slate-600">딜카드에서 &apos;기본 IM 만들기&apos; 버튼을 눌러 생성하세요</p>
          </div>
        ) : (
          imListState.map((doc) => (
            <Link
              key={doc.docId}
              href={`/im-lite/${doc.buildingId}?doc=${doc.docId}`}
              className="block rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 hover:-translate-y-0.5 p-4 transition-all group shadow-xs"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-sm font-extrabold ${
                      doc.status === "approved"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : doc.status === "published"
                        ? "bg-blue-50 text-blue-700 border border-blue-200"
                        : "bg-amber-50 text-amber-800 border border-amber-200"
                    }`}>
                      {doc.status === "approved" ? "승인됨" : doc.status === "published" ? "공개" : "초안"}
                    </span>
                    <span className="text-sm text-slate-500">
                      {new Date(doc.createdAt).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}
                    </span>
                  </div>
                  <p className="text-base font-extrabold text-slate-900 truncate">
                    {doc.areaSignal} {doc.assetType}
                  </p>
                  {doc.priceBand && (
                    <p className="text-sm font-semibold text-slate-600 mt-0.5">{doc.priceBand}</p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push(`/broker/im-approval/${doc.docId}`); }}
                    className="min-h-[44px] text-sm font-bold px-3 py-2 rounded-lg bg-slate-100 border border-slate-200 text-slate-800 hover:bg-slate-200 cursor-pointer"
                  >
                    ✏️ 검토·PPTX
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeletingImId(doc.docId); }}
                    aria-label="IM 삭제"
                    className="min-w-[44px] min-h-[44px] px-2.5 py-2 rounded-lg bg-slate-100 border border-slate-200 text-red-700 hover:bg-red-50 hover:border-red-200 flex items-center justify-center text-sm font-bold cursor-pointer"
                  >
                    🗑
                  </button>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    )}

    {/* Deal Card Tab Content */}
    {activeTab === "dealcard" && (
    <div className="space-y-6">
      {/* Top Professional KPI Board */}
      <div className="grid grid-cols-2 gap-3.5">
        {/* Average Promotion Score Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2 flex flex-col justify-between shadow-xs">
          <div>
            <span className="flex items-center gap-1.5 text-sm font-extrabold text-slate-600 tracking-tight">
              <span>평균 홍보 완성도 점수</span>
              <SeniorTermTooltip termKey="완성도 점수" buttonLabel="도움말" />
            </span>
            <p className="text-3xl font-black text-blue-700 mt-1 tabular-nums">
              {metrics.avgScore} <span className="text-sm font-bold text-slate-600">점</span>
            </p>
          </div>
          <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
            <div
              className="bg-blue-700 h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, metrics.avgScore)}%` }}
            ></div>
          </div>
        </div>

        {/* Active Deals Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-1 flex flex-col justify-between shadow-xs">
          <div>
            <span className="block text-sm font-extrabold text-slate-600 tracking-tight">
              진행 중인 매물 현황
            </span>
            <p className="text-3xl font-black text-emerald-700 mt-1 tabular-nums">
              {metrics.activePipelineCount}{" "}
              <span className="text-sm font-bold text-slate-600">건 진행</span>
            </p>
          </div>
          <span className="text-sm font-medium text-slate-600 leading-relaxed">
            전체 매물 {metrics.total}건 중 홍보 중인 실시간 매물
          </span>
        </div>
      </div>

      {/* P1-3: Deal Pipeline Stage Counts */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-extrabold text-slate-900 tracking-tight flex flex-wrap items-center gap-2">
            <span>🔄 단계별 매물 진행 현황</span>
            <SeniorTermTooltip termKey="매물 진행 단계" buttonLabel="도움말" />
            {stageFilter && (
              <button
                type="button"
                onClick={() => setStageFilter(null)}
                className="min-h-[44px] px-2 text-sm text-amber-700 hover:underline font-bold cursor-pointer"
              >
                ✕ 필터 해제
              </button>
            )}
          </h3>
          <span className="px-2.5 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-sm text-slate-600 font-bold">
            실시간 집계
          </span>
        </div>
        <div className="flex items-center gap-0 overflow-x-auto pb-1 scrollbar-thin">
          {PIPELINE_STAGES.map((stage, idx) => {
            const count = metrics.stageCounts[stage.key] ?? 0;
            const isLast = idx === PIPELINE_STAGES.length - 1;
            const isSelected = stageFilter === stage.key;
            return (
              <div key={stage.key} className="flex items-center shrink-0">
                <button
                  type="button"
                  onClick={() => setStageFilter(isSelected ? null : stage.key)}
                  className={`min-h-[44px] flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all cursor-pointer ${
                    isSelected
                      ? "bg-blue-50 border border-blue-200 text-blue-700 font-bold"
                      : "hover:bg-slate-100 text-slate-700"
                  }`}
                >
                  <span className="text-lg">{stage.emoji}</span>
                  <span
                    className={`text-sm font-black ${
                      count > 0 ? "text-blue-700 scale-110" : "text-slate-500"
                    }`}
                  >
                    {count}
                  </span>
                  <span className="text-sm font-medium whitespace-nowrap">
                    {stage.label}
                  </span>
                </button>
                {!isLast && (
                  <span className="text-slate-400 text-sm shrink-0 font-bold px-0.5">
                    →
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Search and Filters panel */}
      <div className="space-y-3.5 bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
        {/* Search */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="📍 권역, 유형, 가격대 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full min-h-[44px] bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600/30 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="검색어 지우기"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] flex items-center justify-center text-sm text-slate-500 hover:text-slate-900 font-semibold cursor-pointer"
              >
                ×
              </button>
            )}
          </div>
          <SeniorTermTooltip termKey="권역/유형/가격 검색 팁" buttonLabel="검색 팁" />
        </div>

        {/* Filter buttons & Sort Select */}
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          {/* Asset Type Filter Group */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setFilterType("all")}
              className={`min-h-[44px] px-3.5 py-2 rounded-lg text-sm font-bold transition-all cursor-pointer ${
                filterType === "all"
                  ? "bg-slate-900 text-white border border-slate-900"
                  : "text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200"
              }`}
            >
              전체 자산 ({totalCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterType("office")}
              className={`min-h-[44px] px-3.5 py-2 rounded-lg text-sm font-bold transition-all cursor-pointer ${
                filterType === "office"
                  ? "bg-slate-900 text-white border border-slate-900"
                  : "text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200"
              }`}
            >
              오피스
            </button>
            <button
              type="button"
              onClick={() => setFilterType("retail")}
              className={`min-h-[44px] px-3.5 py-2 rounded-lg text-sm font-bold transition-all cursor-pointer ${
                filterType === "retail"
                  ? "bg-slate-900 text-white border border-slate-900"
                  : "text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200"
              }`}
            >
              리테일/상가
            </button>
          </div>

          {/* Sort selection */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "score-desc" | "score-asc" | "created-desc")}
            className="min-h-[44px] bg-white border border-slate-300 rounded-xl px-3 py-2 text-base text-slate-900 focus:outline-none focus:border-blue-600 cursor-pointer transition-colors"
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
          <div className="flex items-center justify-between text-slate-600 px-1 text-sm font-semibold">
            <span>자산명 & 기본 필터</span>
            <span>종합점수</span>
          </div>

          {filteredAndSortedBuildings.map((b) => {
            const score = Math.round(b.promotion_score ?? 0);
            const scoreColor =
              score >= 70
                ? "text-emerald-700 bg-emerald-50 border border-emerald-200"
                : score >= 40
                ? "text-amber-700 bg-amber-50 border border-amber-200"
                : "text-slate-700 bg-slate-100 border border-slate-200";
            const matchCount = b.matched_buyer_count ?? 0;
            const hasVacancy = b.vacancy_signal === "있음" || b.vacancy_signal === "부분";

            return (
              <div key={b.id} className="relative group">
                <Link
                  href={`/broker/deal-card/${b.id}`}
                  className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-4 pr-14 hover:border-slate-300 active:scale-[0.99] transition-all hover:scale-[1.01] shadow-xs"
                  id={`building-item-${b.id}`}
                >
                  {/* Information content */}
                  <div className="flex-1 min-w-0 pr-4 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base font-bold text-slate-900 tracking-tight truncate">
                        {b.area_signal ?? "권역 미상"} {b.asset_type ?? ""}
                      </h3>
                      {hasVacancy && (
                        <span className="shrink-0 inline-flex items-center rounded-full bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-0.5 text-sm font-bold">
                          공실 신호
                        </span>
                      )}
                      {b.status && (
                        <span className="shrink-0 inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 text-sm font-extrabold">
                          {b.status === "public_signal_ready"
                            ? "공개 홍보 중"
                            : PIPELINE_STAGES.find((s) => s.key === b.status)?.label ?? "등록 완료"}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-slate-600 font-semibold">{b.price_band ?? "가격 미확정"}</span>
                      {matchCount > 0 && (
                        <span className="text-blue-700 font-bold flex items-center gap-0.5">
                          🎯 {matchCount}명 매칭
                        </span>
                      )}
                    </div>
                  </div>

                  {/* score badge */}
                  <div className="flex items-center gap-3 shrink-0">
                    <div className={`w-14 h-14 rounded-xl flex flex-col items-center justify-center ${scoreColor}`}>
                      <span className="text-lg font-black leading-none">{score || "-"}</span>
                      <span className="text-sm font-semibold opacity-80 mt-0.5">점</span>
                    </div>
                    <span className="text-slate-400 text-sm font-bold">→</span>
                  </div>
                </Link>

                {/* Delete button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmDeleteId(b.id);
                  }}
                  className="absolute top-2 right-2 min-w-[44px] min-h-[44px] rounded-lg bg-slate-100 border border-slate-200 text-slate-600 hover:text-rose-700 hover:border-rose-300 hover:bg-rose-50 flex items-center justify-center transition-all cursor-pointer"
                  title="딜카드 삭제"
                  aria-label="딜카드 삭제"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14H6L5 6" />
                    <path d="M10 11v6M14 11v6" />
                    <path d="M9 6V4h6v2" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center space-y-4 shadow-xs">
          <p className="text-4xl">🔍</p>
          <p className="text-base font-bold text-slate-900">일치하는 딜카드가 없습니다.</p>
          <p className="text-sm text-slate-600 leading-relaxed">
            필터 조건을 변경하거나 다른 검색어를 입력해보세요.
          </p>
        </div>
      )}
    </div>
    )}

    {/* IM 삭제 확인 모달 */}
    {deletingImId && (
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setDeletingImId(null)}>
        <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()}>
          <h3 className="text-lg font-bold text-slate-900 mb-2">IM 삭제</h3>
          <p className="text-sm text-slate-600 mb-3">이 투자설명서를 삭제하시겠습니까? 삭제된 IM은 복구할 수 없습니다.</p>
          <div className="mb-5">
            <SeniorTermTooltip termKey="안전한 삭제 규칙" buttonLabel="💡 안전한 삭제 안내" />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={() => setDeletingImId(null)} className="flex-1 min-h-[44px] py-2.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 text-sm font-medium rounded-xl cursor-pointer">취소</button>
            <button type="button" onClick={() => handleDeleteIM(deletingImId)} className="flex-1 min-h-[44px] py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-xl cursor-pointer">삭제</button>
          </div>
        </div>
      </div>
    )}

    {/* 삭제 확인 모달 (전역) */}
    {confirmDeleteId && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
        <div className="bg-white w-full max-w-sm rounded-2xl p-6 space-y-4 shadow-2xl border border-slate-200">
          <div className="space-y-1.5">
            <h3 className="text-base font-bold text-slate-900">딜카드를 삭제하시겠습니까?</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              이 딜카드와 관련된 <strong className="text-slate-900">투자설명서, 딜 신호 카드</strong>도 함께 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
            </p>
            <div className="pt-1">
              <SeniorTermTooltip termKey="안전한 삭제 규칙" buttonLabel="💡 안전한 삭제 안내" />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => setConfirmDeleteId(null)}
              disabled={!!deletingId}
              className="flex-1 min-h-[44px] py-2.5 text-sm font-medium rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50 cursor-pointer"
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => handleDelete(confirmDeleteId)}
              disabled={!!deletingId}
              className="flex-1 min-h-[44px] py-2.5 text-sm font-bold rounded-xl bg-rose-600 text-white hover:bg-rose-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {deletingId === confirmDeleteId ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  삭제 중...
                </>
              ) : "삭제"}
            </button>
          </div>
        </div>
      </div>
    )}
    <BrokerBottomNav />
  </StaggerContainer>
  );
}