"use client";

import React, { useState, useMemo } from "react";
import { Check, Sparkles, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import {
  NEWS_CHANNELS,
  NEWS_CHANNEL_MAP,
  CURATED_CHANNEL_POOL,
  resolveNewsChannel,
  recommendBalancedNewsMix,
  type NewsChannelId,
} from "@/domain/magazine/news-channels";
import { SIMPLE_NEWS_LIMIT } from "@/lib/magazine/simple-format";
import { cleanNewsText, formatNewsSummary, topicLabel } from "@/lib/magazine/editor-labels";
import type { NewsItem } from "../NewsCurationPanel";

export interface SimpleNewsPickerProps {
  news?: NewsItem[];
  allNews?: NewsItem[];
  selectedNewsIds: Set<string>;
  onToggleNews?: (newsId: string) => void;
  toggleNews?: (newsId: string) => void;
  onReplaceSelection?: (newsIds: string[]) => void;
  onRefreshLive?: (channel: NewsChannelId) => Promise<void> | void;
  onOpenFullNewsTab?: () => void;
  maxLimit?: number;
}

export function SimpleNewsPicker({
  news,
  allNews,
  selectedNewsIds,
  onToggleNews,
  toggleNews,
  onReplaceSelection,
  onRefreshLive,
  onOpenFullNewsTab,
  maxLimit = SIMPLE_NEWS_LIMIT,
}: SimpleNewsPickerProps) {
  const [activeChannel, setActiveChannel] = useState<NewsChannelId>("all");
  const [expanded, setExpanded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const resolvedToggle = onToggleNews ?? toggleNews ?? (() => {});

  const effectivePool = useMemo(() => {
    const rawList = news ?? allNews ?? [];
    const source = rawList.length > 0 ? rawList : [...CURATED_CHANNEL_POOL];
    return source.map((item) => ({
      ...item,
      resolvedChannel: resolveNewsChannel(item),
    }));
  }, [news, allNews]);

  const selectedList = useMemo(() => {
    const picked = effectivePool.filter((item) => selectedNewsIds.has(item.id ?? item.title));
    return picked.slice(0, maxLimit);
  }, [effectivePool, selectedNewsIds, maxLimit]);

  const filteredPool = useMemo(() => {
    if (activeChannel === "all") return effectivePool;
    return effectivePool.filter((item) => item.resolvedChannel === activeChannel);
  }, [effectivePool, activeChannel]);

  const handleAutoBalancedThree = () => {
    const recommended = recommendBalancedNewsMix(effectivePool, maxLimit);
    if (recommended.length === 0) return;
    if (onReplaceSelection) {
      onReplaceSelection(recommended);
    } else {
      for (const curId of Array.from(selectedNewsIds)) {
        if (!recommended.includes(curId)) resolvedToggle(curId);
      }
      for (const recId of recommended) {
        if (!selectedNewsIds.has(recId)) resolvedToggle(recId);
      }
    }
  };

  const handleRefreshClick = async () => {
    if (!onRefreshLive) return;
    setRefreshing(true);
    try {
      await onRefreshLive(activeChannel);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div data-testid="simple-news-picker" className="space-y-3">
      {/* 상단 요약 바 + 황금배합 1클릭 버튼 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-extrabold text-slate-700 dark:text-slate-200">
          {selectedList.length} / 최대 {maxLimit}건 선택됨 (부동산·경제·절세·문화·상권)
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            data-testid="simple-news-balanced-btn"
            onClick={handleAutoBalancedThree}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-indigo-300 dark:border-indigo-500/40 bg-indigo-50 dark:bg-indigo-500/15 px-3 py-1.5 text-xs font-extrabold text-indigo-900 dark:text-indigo-200 hover:bg-indigo-100 dark:hover:bg-indigo-500/25 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-amber-300" aria-hidden="true" />
            <span>✨ 부동산·경제·문화 황금배합 3선 자동 맞춤</span>
          </button>
          <button
            type="button"
            data-testid="simple-news-expand-btn"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex min-h-[38px] items-center gap-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/70 px-3 py-1.5 text-xs font-extrabold text-slate-800 dark:text-slate-200 hover:bg-slate-200/70 transition-colors"
          >
            <span>{expanded ? "채널별 뉴스 목록 접기" : "5대 채널에서 다른 뉴스 고르기"}</span>
            {expanded ? (
              <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* 현재 선택된 뉴스 3건 미리보기 카드 (항상 노출되어 깜깜이 발행 방지) */}
      {selectedList.length > 0 && !expanded && (
        <div className="space-y-2" data-testid="simple-selected-news-preview">
          {selectedList.map((item, idx) => {
            const id = item.id ?? item.title;
            const chMeta = NEWS_CHANNEL_MAP[item.resolvedChannel] ?? NEWS_CHANNEL_MAP.real_estate;
            return (
              <div
                key={id ?? idx}
                className="flex items-start justify-between gap-2.5 rounded-xl border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50/50 dark:bg-indigo-950/25 px-3.5 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                    <span className="inline-flex items-center gap-1 rounded-full border border-indigo-300 dark:border-indigo-400/40 bg-white dark:bg-indigo-500/20 px-2 py-0.5 text-xs font-extrabold text-indigo-900 dark:text-indigo-200">
                      <span aria-hidden="true">{chMeta.emoji}</span>
                      <span>{chMeta.shortLabel}</span>
                    </span>
                    {item.source && (
                      <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                        {item.source}
                      </span>
                    )}
                  </div>
                  <p className="text-[15px] font-bold text-slate-900 dark:text-white leading-snug line-clamp-1">
                    {cleanNewsText(item.title)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  className="shrink-0 min-h-[36px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100"
                >
                  변경
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* 펼쳤을 때: 5대 채널 탭 + 기사 체크 리스트 */}
      {expanded && (
        <div
          data-testid="simple-news-channel-browser"
          className="rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/70 dark:bg-slate-950/50 p-3.5 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="간단 모드 뉴스 채널 분류">
              {NEWS_CHANNELS.map((ch) => {
                const isActive = activeChannel === ch.id;
                return (
                  <button
                    key={ch.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    data-testid={`simple-news-channel-${ch.id}`}
                    onClick={() => setActiveChannel(ch.id)}
                    className={`inline-flex min-h-[38px] items-center gap-1 rounded-xl border px-3 py-1.5 text-xs font-extrabold transition-colors ${
                      isActive
                        ? "border-blue-600 dark:border-indigo-400 bg-blue-600 dark:bg-indigo-500/30 text-white"
                        : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:bg-slate-100"
                    }`}
                  >
                    <span aria-hidden="true">{ch.emoji}</span>
                    <span>{ch.shortLabel}</span>
                  </button>
                );
              })}
            </div>
            {onRefreshLive && (
              <button
                type="button"
                disabled={refreshing}
                onClick={() => void handleRefreshClick()}
                className="inline-flex min-h-[38px] items-center gap-1 rounded-lg border border-sky-300 dark:border-sky-500/40 bg-sky-50 dark:bg-sky-500/15 px-2.5 py-1 text-xs font-bold text-sky-900 dark:text-sky-200"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
                <span>{refreshing ? "수집 중..." : "최신 뉴스 새로고침"}</span>
              </button>
            )}
          </div>

          <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
            {filteredPool.slice(0, 12).map((item, idx) => {
              const id = item.id ?? item.title;
              const isSelected = selectedNewsIds.has(id);
              const chMeta = NEWS_CHANNEL_MAP[item.resolvedChannel] ?? NEWS_CHANNEL_MAP.real_estate;
              const topic = topicLabel(item.topic);
              const firstLine = formatNewsSummary(item.summary)[0] ?? "";
              return (
                <button
                  key={id ?? idx}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => resolvedToggle(id)}
                  className={`w-full min-h-[54px] text-left rounded-xl border p-3 transition-all flex items-start gap-3 ${
                    isSelected
                      ? "border-2 border-blue-600 dark:border-indigo-400 bg-blue-50/90 dark:bg-indigo-500/20 shadow-xs"
                      : "border border-slate-200 dark:border-slate-700/70 bg-white dark:bg-slate-900/70 hover:border-slate-400"
                  }`}
                >
                  <div
                    className={`mt-0.5 w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border ${
                      isSelected
                        ? "bg-blue-600 dark:bg-indigo-500 border-blue-600 dark:border-indigo-400 text-white"
                        : "bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-transparent"
                    }`}
                    aria-hidden="true"
                  >
                    <Check className="w-4 h-4 stroke-[3]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                      <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-extrabold text-slate-800 dark:text-slate-200">
                        <span aria-hidden="true">{chMeta.emoji}</span>
                        <span>{chMeta.shortLabel}</span>
                      </span>
                      {topic && (
                        <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                          #{topic}
                        </span>
                      )}
                      {item.source && (
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          · {item.source}
                        </span>
                      )}
                    </div>
                    <p className="text-[15px] font-bold text-slate-900 dark:text-white leading-snug line-clamp-2">
                      {cleanNewsText(item.title)}
                    </p>
                    {firstLine && (
                      <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-1 mt-0.5">
                        {firstLine}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {onOpenFullNewsTab && (
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={onOpenFullNewsTab}
                className="text-xs font-extrabold text-blue-700 dark:text-indigo-300 hover:underline underline-offset-2"
              >
                🔍 키워드 검색·직접 기사 추가(최대 6건)는 상세 뉴스 탭 열기 →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
