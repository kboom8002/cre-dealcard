"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Sparkles, Loader2, Users, BarChart3, Wrench, Send } from "lucide-react";
import {
  MARKET_TEMP_CONFIG,
  type MarketTemperature,
  type BrokerFieldNote,
} from "@/domain/magazine/types";
import { marketTempIcon } from "@/lib/magazine/editor-labels";
import {
  SIMPLE_NOTE_MIN,
  SIMPLE_NOTE_MAX,
  deriveFallbackHeadline,
  deriveFallbackBriefing,
  countPreservedAdvancedItems,
} from "@/lib/magazine/simple-format";
import { editorToast } from "@/components/magazine-editor/editor-toaster";
import { NoteStarterChips } from "./NoteStarterChips";
import { SimpleDealPicker, type SimpleDealItem } from "./SimpleDealPicker";
import { AutoFilledStrip } from "./AutoFilledStrip";

const MARKET_TEMPS: MarketTemperature[] = [
  "적극 매수",
  "선별 매수",
  "관망",
  "조정 대기",
  "위기 경계",
];

export interface SimpleSummaryApiResult {
  headline: string;
  briefing: string;
  source: "api" | "fallback";
}

export async function requestSimpleSummary(input: {
  editionId?: string | null;
  comment: string;
  brokerName?: string | null;
  dealCount?: number;
  newsTitles?: string[];
  marketTemp?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<SimpleSummaryApiResult> {
  const fallbackHeadline = deriveFallbackHeadline(input.comment, input.brokerName);
  const fallbackBriefing = deriveFallbackBriefing({
    comment: input.comment,
    dealCount: input.dealCount,
    newsTitles: input.newsTitles,
    marketTemp: input.marketTemp ?? "선별 매수",
  });

  const fn = input.fetchImpl ?? (typeof fetch !== "undefined" ? fetch : undefined);
  if (!fn) {
    return { headline: fallbackHeadline, briefing: fallbackBriefing, source: "fallback" };
  }

  // 1차: 전용 simple-summary 엔드포인트 시도
  if (input.editionId) {
    try {
      const res = await fn(
        `/api/magazine/editions/${encodeURIComponent(input.editionId)}/simple-summary`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            comment: input.comment,
            brokerName: input.brokerName,
            dealCount: input.dealCount ?? 0,
            newsTitles: input.newsTitles ?? [],
            marketTemp: input.marketTemp ?? "선별 매수",
          }),
        },
      );
      if (res.ok) {
        const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
        const resultObj =
          json && typeof json.result === "object" && json.result !== null
            ? (json.result as Record<string, unknown>)
            : json;
        const apiHeadline =
          typeof resultObj?.headline === "string" ? resultObj.headline.trim() : "";
        const apiBriefing =
          typeof resultObj?.briefing === "string"
            ? resultObj.briefing.trim()
            : typeof resultObj?.summary === "string"
              ? resultObj.summary.trim()
              : "";
        if (apiHeadline || apiBriefing) {
          return {
            headline: apiHeadline || fallbackHeadline,
            briefing: apiBriefing || fallbackBriefing,
            source: "api",
          };
        }
      }
    } catch {
      // 폴백으로 진행
    }
  }

  // 2차: 기존 ai-comment 엔드포인트 폴백 시도
  try {
    const res = await fn("/api/broker/studio/ai-comment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment: input.comment }),
    });
    if (res.ok) {
      const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      const resultObj =
        json && typeof json.result === "object" && json.result !== null
          ? (json.result as Record<string, unknown>)
          : null;
      const aiComment =
        typeof resultObj?.comment === "string" ? resultObj.comment.trim() : "";
      if (aiComment) {
        return {
          headline: deriveFallbackHeadline(aiComment, input.brokerName),
          briefing: aiComment,
          source: "api",
        };
      }
    }
  } catch {
    // 결정론적 폴백으로 진행
  }

  return { headline: fallbackHeadline, briefing: fallbackBriefing, source: "fallback" };
}

export interface SimpleEditorProps {
  editionId: string | null;
  brokerName?: string | null;
  fieldNote: BrokerFieldNote;
  updateFieldNote: (key: keyof BrokerFieldNote, value: string) => void;
  headline: string;
  setHeadline: (v: string) => void;
  briefing: string;
  setBriefing: (v: string) => void;
  marketTemp: MarketTemperature | null;
  setMarketTemp: (temp: MarketTemperature | null) => void;
  deals: SimpleDealItem[];
  selectedDealIds: Set<string>;
  toggleDeal: (dealId: string) => void;
  fmt?: (price: number) => string;
  newsTitles?: string[];
  themeTitle?: string;
  themeBodyMd?: string;
  pollQuestion?: string;
  taxQuestion?: string;
  taxAnswer?: string;
  isPublished?: boolean;
  publishing?: boolean;
  saving?: boolean;
  onPublish: (ensuredHeadline?: string) => void;
  onOpenTab: (tab: "outreach" | "analytics") => void;
  onSwitchToFullMode: () => void;
}

export function SimpleEditor({
  editionId,
  brokerName,
  fieldNote,
  updateFieldNote,
  headline,
  setHeadline,
  briefing,
  setBriefing,
  marketTemp,
  setMarketTemp,
  deals,
  selectedDealIds,
  toggleDeal,
  fmt,
  newsTitles = [],
  themeTitle,
  themeBodyMd,
  pollQuestion,
  taxQuestion,
  taxAnswer,
  isPublished = false,
  publishing = false,
  saving = false,
  onPublish,
  onOpenTab,
  onSwitchToFullMode,
}: SimpleEditorProps) {
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [summaryStatusText, setSummaryStatusText] = useState<string | null>(null);
  const autoSummaryDoneRef = useRef(false);
  const userEditedHeadlineRef = useRef(false);
  const lastAutoHeadlineRef = useRef("");

  const comment = fieldNote.comment ?? "";
  const trimmedComment = comment.trim();
  const isCommentReady = trimmedComment.length >= SIMPLE_NOTE_MIN;
  const effectiveMarketTemp: MarketTemperature = marketTemp ?? "선별 매수";

  const preservedAdvanced = countPreservedAdvancedItems({
    themeTitle,
    themeBodyMd,
    pollQuestion,
    taxQuestion,
    taxAnswer,
    fieldNote,
  });

  const runSummaryGeneration = useCallback(
    async (isManual: boolean) => {
      if (trimmedComment.length < SIMPLE_NOTE_MIN) {
        if (isManual) {
          editorToast.warning("먼저 '이번 주 한마디'를 10자 이상 입력해 주세요.");
        }
        return;
      }

      setGeneratingSummary(true);
      try {
        const res = await requestSimpleSummary({
          editionId,
          comment: trimmedComment,
          brokerName,
          dealCount: selectedDealIds.size,
          newsTitles,
          marketTemp: effectiveMarketTemp,
        });

        if (isManual || !headline.trim() || !userEditedHeadlineRef.current) {
          setHeadline(res.headline);
          lastAutoHeadlineRef.current = res.headline;
          if (isManual) userEditedHeadlineRef.current = false;
        }
        setBriefing(res.briefing);
        setSummaryStatusText(
          res.source === "api"
            ? "✨ 한마디를 바탕으로 제목과 3줄 요약이 자동 완성되었습니다."
            : "✨ 작성하신 한마디로 제목과 3줄 요약이 정리되었습니다.",
        );
      } finally {
        setGeneratingSummary(false);
      }
    },
    [
      trimmedComment,
      editionId,
      brokerName,
      selectedDealIds.size,
      newsTitles,
      effectiveMarketTemp,
      headline,
      setHeadline,
      setBriefing,
    ],
  );

  // 한마디 입력 시: 10자 이상이면 빈 제목·브리핑 즉시 결정론적 제안 + 1.8초 debounce 후 초안당 1회 자동 요약 생성
  useEffect(() => {
    if (trimmedComment.length < SIMPLE_NOTE_MIN) return;

    const fallbackH = deriveFallbackHeadline(trimmedComment, brokerName);
    if (!headline.trim() || (!userEditedHeadlineRef.current && headline === lastAutoHeadlineRef.current)) {
      if (headline !== fallbackH) {
        lastAutoHeadlineRef.current = fallbackH;
        setHeadline(fallbackH);
      }
    }

    if (!briefing.trim()) {
      setBriefing(
        deriveFallbackBriefing({
          comment: trimmedComment,
          dealCount: selectedDealIds.size,
          newsTitles,
          marketTemp: effectiveMarketTemp,
        }),
      );
    }

    if (autoSummaryDoneRef.current) return;

    const timer = setTimeout(() => {
      autoSummaryDoneRef.current = true;
      void runSummaryGeneration(false);
    }, 1800);

    return () => clearTimeout(timer);
  }, [
    trimmedComment,
    brokerName,
    headline,
    briefing,
    selectedDealIds.size,
    newsTitles,
    effectiveMarketTemp,
    setHeadline,
    setBriefing,
    runSummaryGeneration,
  ]);

  const handleCommentChange = (nextVal: string) => {
    updateFieldNote("comment", nextVal.slice(0, SIMPLE_NOTE_MAX));
  };

  const handleSimplePublishClick = () => {
    if (trimmedComment.length < SIMPLE_NOTE_MIN && !headline.trim()) {
      editorToast.error(
        "① '이번 주 한마디'를 한 문장(10자 이상)만 적어주시면 제목과 요약이 자동으로 채워져 바로 발행됩니다.",
      );
      const el = document.getElementById("simple-field-note-comment");
      el?.focus();
      return;
    }

    let ensuredHeadline = headline.trim();
    if (!ensuredHeadline) {
      ensuredHeadline = deriveFallbackHeadline(trimmedComment, brokerName);
      lastAutoHeadlineRef.current = ensuredHeadline;
      setHeadline(ensuredHeadline);
    }

    if (!briefing.trim() && trimmedComment) {
      setBriefing(
        deriveFallbackBriefing({
          comment: trimmedComment,
          dealCount: selectedDealIds.size,
          newsTitles,
          marketTemp: effectiveMarketTemp,
        }),
      );
    }

    if (!marketTemp) {
      setMarketTemp("선별 매수");
    }

    onPublish(ensuredHeadline);
  };

  return (
    <div className="space-y-5" data-testid="simple-editor-root">
      {/* 상단 안내 배너 */}
      <div
        data-testid="simple-mode-banner"
        className="rounded-xl border border-indigo-500/35 bg-gradient-to-br from-indigo-500/15 via-slate-900/90 to-slate-900 p-3.5 space-y-2"
      >
        <p className="text-[15px] font-bold text-indigo-100 leading-snug">
          ⚡ 5분 간단 모드 — &apos;이번 주 한마디&apos;만 적으시면 제목·요약·뉴스·계산기가 자동으로 완성됩니다
        </p>
        {preservedAdvanced.count > 0 && (
          <p
            data-testid="preserved-advanced-notice"
            className="text-xs font-semibold text-amber-300 bg-amber-500/12 border border-amber-500/25 rounded-lg px-2.5 py-1.5"
          >
            🔒 고급 항목 {preservedAdvanced.count}개({preservedAdvanced.labels.join("·")} 등)도 함께 유지됩니다
          </p>
        )}
      </div>

      {/* Step 1: 이번 주 한마디 */}
      <section
        aria-labelledby="simple-step-1-heading"
        className="rounded-xl border border-slate-700/80 bg-slate-900/60 p-4 space-y-3"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 id="simple-step-1-heading" className="text-[16px] font-extrabold text-white">
            ① 이번 주 한마디 <span className="text-xs font-semibold text-indigo-300">(필수 · 1~3문장)</span>
          </h2>
          <span
            className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              isCommentReady
                ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                : "bg-slate-800 text-slate-300 border border-slate-700"
            }`}
          >
            {isCommentReady ? "작성 완료 ✓" : "10자 이상 입력"}
          </span>
        </div>

        <NoteStarterChips
          currentComment={comment}
          onSelectTemplate={(next) => handleCommentChange(next)}
        />

        <div className="space-y-1.5">
          <label htmlFor="simple-field-note-comment" className="sr-only">
            이번 주 한마디
          </label>
          <textarea
            id="simple-field-note-comment"
            value={comment}
            maxLength={SIMPLE_NOTE_MAX}
            onChange={(e) => handleCommentChange(e.target.value)}
            placeholder="예: 이번 주 강남·역삼 일대는 금리 인하 기대감으로 실수요 사옥 문의가 부쩍 늘었습니다. 수익률 4% 이상 코너 건물을 눈여겨보실 타이밍입니다."
            className="w-full min-h-[140px] rounded-xl border border-slate-600 bg-[#0B1120] px-4 py-3.5 text-[17px] text-white leading-relaxed placeholder:text-slate-500 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/40 transition-all"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
            <span
              data-testid="simple-comment-counter"
              className="text-xs font-semibold text-slate-300"
            >
              {comment.length} / {SIMPLE_NOTE_MAX}자 · 권장 1~3문장
            </span>
            <button
              type="button"
              data-testid="simple-regenerate-summary-btn"
              disabled={generatingSummary || !isCommentReady}
              onClick={() => void runSummaryGeneration(true)}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-indigo-500/40 bg-indigo-500/15 px-3 py-1.5 text-xs font-bold text-indigo-200 hover:bg-indigo-500/25 disabled:opacity-45 transition-all"
            >
              {generatingSummary ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              ✨ 제목·3줄 요약 다시 만들기
            </button>
          </div>
          {summaryStatusText && (
            <p
              data-testid="simple-summary-status"
              className="text-xs font-semibold text-emerald-300 pt-0.5"
            >
              {summaryStatusText}
            </p>
          )}
        </div>
      </section>

      {/* Step 2: 소개할 매물 확인 */}
      <section
        aria-labelledby="simple-step-2-heading"
        className="rounded-xl border border-slate-700/80 bg-slate-900/60 p-4 space-y-3"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 id="simple-step-2-heading" className="text-[16px] font-extrabold text-white">
            ② 소개할 매물 확인 <span className="text-xs font-semibold text-slate-300">(최대 3건)</span>
          </h2>
        </div>

        <SimpleDealPicker
          deals={deals}
          selectedDealIds={selectedDealIds}
          onToggleDeal={toggleDeal}
          fmt={fmt}
          onLimitReached={() =>
            editorToast.warning("간단 모드에서는 추천 매물을 최대 3건까지 선택할 수 있습니다.")
          }
        />
      </section>

      {/* Step 3: 매거진 제목 & 시장 온도 확인 */}
      <section
        aria-labelledby="simple-step-3-heading"
        className="rounded-xl border border-slate-700/80 bg-slate-900/60 p-4 space-y-4"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 id="simple-step-3-heading" className="text-[16px] font-extrabold text-white">
            ③ 매거진 제목 &amp; 시장 온도 확인 <span className="text-xs font-semibold text-slate-300">(자동 제안됨)</span>
          </h2>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor="simple-headline-input"
              className="text-sm font-bold text-slate-200"
            >
              매거진 제목
            </label>
            <button
              type="button"
              data-testid="simple-fill-headline-btn"
              onClick={() => {
                const nextH = deriveFallbackHeadline(trimmedComment, brokerName);
                lastAutoHeadlineRef.current = nextH;
                userEditedHeadlineRef.current = false;
                setHeadline(nextH);
              }}
              className="text-xs font-semibold text-indigo-300 hover:text-indigo-200 underline underline-offset-2"
            >
              한마디 첫 문장으로 자동 채우기
            </button>
          </div>
          <input
            id="simple-headline-input"
            type="text"
            value={headline}
            onChange={(e) => {
              userEditedHeadlineRef.current = true;
              setHeadline(e.target.value);
            }}
            placeholder="매거진 제목을 입력하세요"
            className="w-full min-h-[48px] rounded-xl border border-slate-600 bg-[#0B1120] px-4 py-3 text-[17px] font-bold text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/40 transition-all"
          />
          <p className="text-xs text-slate-400">
            비워두셔도 발행 시 &apos;이번 주 한마디&apos;의 첫 문장으로 자동 완성됩니다.
          </p>
        </div>

        <div className="space-y-2" data-testid="simple-market-temp-group">
          <span className="text-sm font-bold text-slate-200 block">
            이번 주 현장 시장 온도
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {MARKET_TEMPS.map((temp) => {
              const cfg = MARKET_TEMP_CONFIG[temp];
              const isSelected = effectiveMarketTemp === temp;
              return (
                <button
                  key={temp}
                  type="button"
                  aria-pressed={isSelected}
                  data-testid={`simple-temp-${temp}`}
                  onClick={() => setMarketTemp(temp)}
                  className={`flex min-h-[46px] items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-[15px] font-bold transition-all ${
                    isSelected
                      ? "border-white/40 bg-white/12 text-white shadow-md"
                      : "border-slate-700 bg-slate-800/40 text-slate-300 hover:border-slate-500"
                  }`}
                  style={
                    isSelected
                      ? {
                          borderColor: cfg.color + "80",
                          backgroundColor: cfg.color + "22",
                        }
                      : undefined
                  }
                >
                  <span aria-hidden="true">{marketTempIcon(temp)}</span>
                  <span>{temp}</span>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-slate-300 pl-1">
            {MARKET_TEMP_CONFIG[effectiveMarketTemp].description}
          </p>
        </div>
      </section>

      {/* 자동 포함 4종 안심 배지 */}
      <AutoFilledStrip />

      {/* 큰 발행 버튼 */}
      <div className="pt-1">
        <button
          type="button"
          data-testid="simple-publish-button"
          aria-label={
            isPublished
              ? "이번 주 매거진 정정 발행 시작"
              : "이번 주 매거진 발행 시작"
          }
          disabled={publishing || saving}
          onClick={handleSimplePublishClick}
          className="w-full min-h-[56px] rounded-2xl bg-indigo-500 hover:bg-indigo-600 active:scale-[0.99] disabled:opacity-50 text-white text-lg font-extrabold px-5 py-3.5 shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2 transition-all"
        >
          {publishing ? (
            <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="w-5 h-5" aria-hidden="true" />
          )}
          <span>
            {isPublished ? "🚀 이번 주 매거진 정정 발행하기" : "🚀 이번 주 매거진 발행하기"}
          </span>
        </button>
      </div>

      {/* 보조 바로가기 바 */}
      <div
        data-testid="simple-shortcut-bar"
        className="rounded-xl border border-slate-800 bg-slate-900/50 p-3 space-y-2"
      >
        <p className="text-xs font-semibold text-slate-400">
          구독자 관리·성과 확인이나 투표·세무 등 상세 편집이 필요하신가요?
        </p>
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              data-testid="simple-shortcut-outreach"
              onClick={() => onOpenTab("outreach")}
              className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/12 px-3 py-2 text-xs font-bold text-amber-200 hover:bg-amber-500/20 transition-all"
            >
              <Users className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>👥 구독자 관리 · QR 코드</span>
            </button>
            <button
              type="button"
              data-testid="simple-shortcut-analytics"
              onClick={() => onOpenTab("analytics")}
              className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-pink-500/30 bg-pink-500/12 px-3 py-2 text-xs font-bold text-pink-200 hover:bg-pink-500/20 transition-all"
            >
              <BarChart3 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>📈 독자 반응 · 핫리드 보기</span>
            </button>
          </div>
          <button
            type="button"
            data-testid="simple-shortcut-full-mode"
            onClick={onSwitchToFullMode}
            className="w-full flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700/70 transition-all"
          >
            <Wrench className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>🛠️ 상세 편집 모드(투표·세무·테마)로 전환</span>
          </button>
        </div>
      </div>
    </div>
  );
}
