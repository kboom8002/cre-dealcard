"use client";

import React, { useMemo, useState } from "react";
import { Plus, Search, Copy, CheckCircle2, FileEdit, Sparkles, BarChart3, Calendar } from "lucide-react";
import type { EditionStatus, EditionType } from "@/domain/magazine/types";

export type CadenceType = "daily" | "weekly" | "monthly";

export interface AirtableEditionItem {
  id: string;
  edition_type: EditionType;
  edition_label: string;
  title: string;
  status: EditionStatus;
  market_temp?: string | null;
  issueCount: number;
  dealCount: number;
  hasBriefing: boolean;
  chartCount: number;
  viewCount?: number;
  updated_at?: string | null;
  published_at?: string | null;
}

export interface EditionAirtableListProps {
  editions: AirtableEditionItem[];
  activeEditionId: string | null;
  activeCadence: EditionType;
  loading?: boolean;
  subscriberCount?: number | null;
  onSelectEdition: (edition: AirtableEditionItem) => void;
  onSwitchOrCreateCadence: (cadence: "daily" | "weekly" | "monthly") => void;
  onDuplicateEdition?: (edition: AirtableEditionItem) => void;
  onOpenOutreach?: () => void;
  onOpenAnalytics?: () => void;
}

const CADENCE_META: Record<
  "daily" | "weekly" | "monthly" | "special",
  {
    label: string;
    shortLabel: string;
    formulaHint: string;
    pillClass: string;
    activeTabClass: string;
  }
> = {
  daily: {
    label: "일간 뉴스레터",
    shortLabel: "일간",
    formulaHint: "헤더 + 제목 + 이슈 5건 + 딜카드",
    pillClass: "bg-sky-50 text-sky-800 border-sky-300",
    activeTabClass: "bg-sky-700 text-white border-sky-700",
  },
  weekly: {
    label: "주간 뉴스레터",
    shortLabel: "주간",
    formulaHint: "헤더 + 제목 + 중개인 브리핑 + 이슈 5건 + 딜카드",
    pillClass: "bg-indigo-50 text-indigo-800 border-indigo-300",
    activeTabClass: "bg-indigo-700 text-white border-indigo-700",
  },
  monthly: {
    label: "월간 뉴스레터",
    shortLabel: "월간",
    formulaHint: "헤더 + 제목 + 권역 통계 2건 + 월간 이슈 5건 + 딜카드",
    pillClass: "bg-emerald-50 text-emerald-800 border-emerald-300",
    activeTabClass: "bg-emerald-700 text-white border-emerald-700",
  },
  special: {
    label: "특별호",
    shortLabel: "특별",
    formulaHint: "긴급 매물 속보",
    pillClass: "bg-amber-50 text-amber-800 border-amber-300",
    activeTabClass: "bg-amber-700 text-white border-amber-700",
  },
};

export function EditionAirtableList({
  editions,
  activeEditionId,
  activeCadence,
  loading = false,
  subscriberCount,
  onSelectEdition,
  onSwitchOrCreateCadence,
  onDuplicateEdition,
  onOpenOutreach,
  onOpenAnalytics,
}: EditionAirtableListProps) {
  const [cadenceFilter, setCadenceFilter] = useState<"all" | "daily" | "weekly" | "monthly">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "published">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredEditions = useMemo(() => {
    return editions.filter((ed) => {
      if (cadenceFilter !== "all" && ed.edition_type !== cadenceFilter) return false;
      if (statusFilter === "published" && ed.status !== "published") return false;
      if (statusFilter === "draft" && ed.status === "published") return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const inTitle = (ed.title || "").toLowerCase().includes(q);
        const inLabel = (ed.edition_label || "").toLowerCase().includes(q);
        if (!inTitle && !inLabel) return false;
      }
      return true;
    });
  }, [editions, cadenceFilter, statusFilter, searchQuery]);

  const counts = useMemo(() => {
    return {
      all: editions.length,
      daily: editions.filter((e) => e.edition_type === "daily").length,
      weekly: editions.filter((e) => e.edition_type === "weekly").length,
      monthly: editions.filter((e) => e.edition_type === "monthly").length,
    };
  }, [editions]);

  const currentCadenceMeta = CADENCE_META[activeCadence] ?? CADENCE_META.weekly;

  return (
    <aside
      data-testid="magazine-list-slot"
      aria-label="뉴스레터 호수 목록 및 주기 선택"
      className="w-full lg:w-[330px] xl:w-[360px] shrink-0 bg-white border-r border-slate-300 flex flex-col h-full overflow-hidden select-none"
    >
      {/* ━━━ 1. 상단 주기별(일간/주간/월간) 즉시 전환·생성 스위치 ━━━ */}
      <div className="p-3 border-b border-slate-200 bg-slate-50/80 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Calendar className="w-4 h-4 text-blue-700 shrink-0" aria-hidden="true" />
            <span className="text-sm font-extrabold text-slate-900 whitespace-nowrap truncate">뉴스레터 주기 · 목록</span>
          </div>
          <span className="rounded-md bg-blue-50 border border-blue-200 px-2 py-0.5 text-xs font-bold text-blue-800 whitespace-nowrap shrink-0">
            발행본 목록
          </span>
        </div>

        {/* 일간 / 주간 / 월간 3대 별도 편집 스위치 */}
        <div
          role="group"
          aria-label="일간·주간·월간 뉴스레터 전환"
          data-testid="cadence-switcher"
          className="grid grid-cols-3 gap-1.5"
        >
          {(["daily", "weekly", "monthly"] as const).map((cad) => {
            const meta = CADENCE_META[cad];
            const isCurrent = activeCadence === cad;
            return (
              <button
                key={cad}
                type="button"
                data-testid={`cadence-btn-${cad}`}
                aria-pressed={isCurrent}
                onClick={() => onSwitchOrCreateCadence(cad)}
                className={`min-h-11 rounded-xl border px-2 py-1.5 text-xs font-extrabold transition-all flex flex-col items-center justify-center gap-0.5 ${
                  isCurrent
                    ? `${meta.activeTabClass} shadow-xs`
                    : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"
                }`}
              >
                <span className="whitespace-nowrap">{meta.shortLabel} 편집</span>
                <span className={`text-[11px] font-medium whitespace-nowrap ${isCurrent ? "text-white/90" : "text-slate-500"}`}>
                  {cad === "daily" ? "이슈5+딜" : cad === "weekly" ? "브리핑+이슈5" : "통계2+이슈5"}
                </span>
              </button>
            );
          })}
        </div>

        {/* 현재 선택된 주기의 공식 안내 */}
        <div
          data-testid="active-cadence-formula"
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 flex items-center justify-between gap-1.5"
        >
          <span className="font-extrabold text-slate-900 shrink-0">[{currentCadenceMeta.shortLabel} 공식]</span>
          <span className="truncate text-right text-slate-600">{currentCadenceMeta.formulaHint}</span>
        </div>
      </div>

      {/* ━━━ 2. 에어테이블형 지능형 필터 · 검색 바 ━━━ */}
      <div className="px-3 py-2 border-b border-slate-200 bg-white space-y-2">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
          {(
            [
              { key: "all", label: `전체 (${counts.all})` },
              { key: "daily", label: `일간 (${counts.daily})` },
              { key: "weekly", label: `주간 (${counts.weekly})` },
              { key: "monthly", label: `월간 (${counts.monthly})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              data-testid={`airtable-filter-${tab.key}`}
              onClick={() => setCadenceFilter(tab.key)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
                cadenceFilter === tab.key
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <div className="relative flex-1 min-w-0">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="호수·제목 검색..."
              aria-label="뉴스레터 호수 또는 제목 검색"
              className="w-full min-h-9 pl-8 pr-2.5 py-1 rounded-lg border border-slate-300 bg-slate-50 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:bg-white"
            />
          </div>
          <div className="flex items-center rounded-lg border border-slate-300 bg-slate-50 p-0.5 shrink-0">
            {(
              [
                { key: "all", label: "전체" },
                { key: "draft", label: "초안" },
                { key: "published", label: "발행" },
              ] as const
            ).map((st) => (
              <button
                key={st.key}
                type="button"
                onClick={() => setStatusFilter(st.key)}
                className={`px-2 py-1 rounded-md text-xs font-bold transition-colors ${
                  statusFilter === st.key ? "bg-white text-blue-700 shadow-2xs" : "text-slate-600"
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ━━━ 3. 에어테이블 컬럼 헤더 ━━━ */}
      <div
        role="row"
        className="grid grid-cols-12 gap-1 px-3 py-1.5 bg-slate-100 border-b border-slate-200 text-xs font-extrabold text-slate-600"
      >
        <div className="col-span-3">주기·호수</div>
        <div className="col-span-6">제목 · 구성 현황</div>
        <div className="col-span-3 text-right">상태·열람</div>
      </div>

      {/* ━━━ 4. 에어테이블 레코드 리스트 ━━━ */}
      <div
        data-testid="airtable-edition-rows"
        className="flex-1 overflow-y-auto divide-y divide-slate-200 bg-white"
      >
        {filteredEditions.length === 0 ? (
          <div className="p-6 text-center space-y-2">
            <p className="text-sm font-bold text-slate-700">조건에 맞는 뉴스레터가 없습니다</p>
            <p className="text-xs text-slate-500">
              상단의 [일간 편집], [주간 편집], [월간 편집] 단추를 눌러 새 호수를 바로 시작하세요.
            </p>
          </div>
        ) : (
          filteredEditions.map((ed) => {
            const meta = CADENCE_META[ed.edition_type] ?? CADENCE_META.weekly;
            const isSelected = ed.id === activeEditionId;
            const isPub = ed.status === "published";

            return (
              <div
                key={ed.id}
                role="button"
                tabIndex={0}
                aria-selected={isSelected}
                data-testid={`airtable-row-${ed.id}`}
                onClick={() => onSelectEdition(ed)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectEdition(ed);
                  }
                }}
                className={`group grid grid-cols-12 gap-1.5 px-3 py-2.5 items-center cursor-pointer transition-colors ${
                  isSelected
                    ? "bg-blue-50/90 border-l-4 border-l-blue-600"
                    : "hover:bg-slate-50 border-l-4 border-l-transparent"
                }`}
              >
                {/* Col 1: 주기 배지 + 호수 라벨 */}
                <div className="col-span-3 min-w-0 space-y-1">
                  <span
                    className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs font-extrabold ${meta.pillClass}`}
                  >
                    {meta.shortLabel}
                  </span>
                  <p className="text-xs font-mono font-bold text-slate-700 truncate">
                    {ed.edition_label}
                  </p>
                </div>

                {/* Col 2: 한 줄 제목 + 구성 완성도 칩 */}
                <div className="col-span-6 min-w-0 space-y-1">
                  <p className="text-sm font-extrabold text-slate-900 truncate">
                    {ed.title?.trim() || `(${meta.shortLabel} 제목 미입력)`}
                  </p>
                  <div className="flex flex-wrap items-center gap-1">
                    {ed.edition_type === "weekly" && (
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs font-bold ${
                          ed.hasBriefing
                            ? "bg-indigo-50 text-indigo-800 border border-indigo-200"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        브리핑 {ed.hasBriefing ? "✓" : "–"}
                      </span>
                    )}
                    {ed.edition_type === "monthly" && (
                      <span className="rounded bg-emerald-50 text-emerald-800 border border-emerald-200 px-1.5 py-0.5 text-xs font-bold">
                        통계 {ed.chartCount || 2}/2
                      </span>
                    )}
                    <span className="rounded bg-amber-50 text-amber-900 border border-amber-200 px-1.5 py-0.5 text-xs font-bold">
                      이슈 {ed.issueCount || 5}/5
                    </span>
                    <span className="rounded bg-slate-100 text-slate-700 px-1.5 py-0.5 text-xs font-bold">
                      딜 {ed.dealCount}건
                    </span>
                  </div>
                </div>

                {/* Col 3: 상태 + 열람수 + 복제 */}
                <div className="col-span-3 flex flex-col items-end justify-between gap-1">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-extrabold ${
                      isPub
                        ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                        : "bg-amber-50 text-amber-800 border-amber-300"
                    }`}
                  >
                    {isPub ? (
                      <>
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" aria-hidden="true" />
                        발행됨
                      </>
                    ) : (
                      <>
                        <FileEdit className="w-3 h-3 text-amber-600" aria-hidden="true" />
                        초안
                      </>
                    )}
                  </span>

                  <div className="flex items-center gap-1.5">
                    {typeof ed.viewCount === "number" && ed.viewCount > 0 && (
                      <span className="text-xs font-bold text-slate-600">
                        👁 {ed.viewCount}
                      </span>
                    )}
                    {onDuplicateEdition && (
                      <button
                        type="button"
                        title="이 호수 복제"
                        aria-label={`${ed.edition_label} 호수 복제`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onDuplicateEdition(ed);
                        }}
                        className="opacity-80 group-hover:opacity-100 inline-flex items-center justify-center rounded-md border border-slate-200 bg-white p-1 text-xs text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                      >
                        <Copy className="w-3 h-3" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ━━━ 5. 하단 빠른 도구 (구독자 관리 · 열람 성과) ━━━ */}
      <div className="p-2.5 border-t border-slate-200 bg-slate-50 flex items-center gap-1.5">
        {onOpenOutreach && (
          <button
            type="button"
            data-testid="airtable-open-outreach"
            onClick={onOpenOutreach}
            className="flex-1 min-h-10 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 px-2.5 py-1.5 text-xs font-extrabold text-slate-800 flex items-center justify-center gap-1 transition-colors"
          >
            <span>👥 구독자 ({subscriberCount ?? 0}명)</span>
          </button>
        )}
        {onOpenAnalytics && (
          <button
            type="button"
            data-testid="airtable-open-analytics"
            onClick={onOpenAnalytics}
            className="flex-1 min-h-10 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 px-2.5 py-1.5 text-xs font-extrabold text-slate-800 flex items-center justify-center gap-1 transition-colors"
          >
            <BarChart3 className="w-3.5 h-3.5 text-blue-700" aria-hidden="true" />
            <span>열람·연락할 고객</span>
          </button>
        )}
      </div>
    </aside>
  );
}
