"use client";

import React, { useState, useMemo, useId } from "react";
import {
  Newspaper,
  ToggleRight,
  ToggleLeft,
  Star,
  Sparkles,
  RefreshCw,
  Search,
  Plus,
  ExternalLink,
  Check,
  X,
} from "lucide-react";
import { motion } from "motion/react";
import { MAX_NEWS_SELECTION } from "@/lib/magazine/edition-save";
import { cleanNewsText, formatNewsSummary, topicLabel } from "@/lib/magazine/editor-labels";
import { EmptyState } from "@/components/ui/empty-state";
import { editorToast } from "./editor-toaster";
import {
  NEWS_CHANNELS,
  NEWS_CHANNEL_MAP,
  CURATED_CHANNEL_POOL,
  resolveNewsChannel,
  recommendBalancedNewsMix,
  type NewsChannelId,
  type SpecificNewsChannelId,
} from "@/domain/magazine/news-channels";

export interface NewsItem {
  id?: string;
  title: string;
  summary?: string;
  importance_score?: number;
  topic?: string;
  source?: string;
  url?: string;
  channel?: string;
  sentiment?: "bullish" | "bearish" | "neutral";
}

interface NewsCurationPanelProps {
  allNews: NewsItem[];
  selectedNewsIds: Set<string>;
  toggleNews: (newsId: string) => void;
  /** 황금배합 일괄 적용 또는 다중 선택 교체 콜백 */
  onReplaceSelection?: (newsIds: string[]) => void;
  /** 실시간 수집/검색/직접 추가된 기사를 부모 후보 풀에 병합 */
  onAppendNews?: (items: NewsItem[], autoSelectIds?: string[]) => void;
  /** 최대 선택 개수 (기본 6, 간단 모드에서는 3) */
  maxSelection?: number;
  /** 간단 모드 내장용 컴팩트 여부 */
  compact?: boolean;
}

export function NewsCurationPanel({
  allNews,
  selectedNewsIds,
  toggleNews,
  onReplaceSelection,
  onAppendNews,
  maxSelection = MAX_NEWS_SELECTION,
  compact = false,
}: NewsCurationPanelProps) {
  const uid = useId();
  const searchInputId = `${uid}-news-search`;
  const customTitleId = `${uid}-custom-title`;
  const customSummaryId = `${uid}-custom-summary`;
  const customSourceId = `${uid}-custom-source`;
  const customUrlId = `${uid}-custom-url`;

  const [activeChannel, setActiveChannel] = useState<NewsChannelId>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [fetchingLive, setFetchingLive] = useState(false);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customTitle, setCustomTitle] = useState("");
  const [customSummary, setCustomSummary] = useState("");
  const [customSource, setCustomSource] = useState("");
  const [customUrl, setCustomUrl] = useState("");
  const [customChannel, setCustomChannel] = useState<SpecificNewsChannelId>("economy_finance");

  // 각 기사에 5대 채널 분류 부여
  const enrichedNews = useMemo(
    () =>
      allNews.map((item) => ({
        ...item,
        resolvedChannel: resolveNewsChannel(item),
      })),
    [allNews],
  );

  // 채널별 기사 수 집계
  const channelCounts = useMemo(() => {
    const counts: Record<NewsChannelId, number> = {
      all: enrichedNews.length,
      real_estate: 0,
      economy_finance: 0,
      tax_wealth: 0,
      culture_lifestyle: 0,
      commercial_trend: 0,
    };
    for (const item of enrichedNews) {
      counts[item.resolvedChannel] = (counts[item.resolvedChannel] ?? 0) + 1;
    }
    return counts;
  }, [enrichedNews]);

  // 선택된 뉴스의 채널별 분포
  const selectedChannelSummary = useMemo(() => {
    const counts: Record<SpecificNewsChannelId, number> = {
      real_estate: 0,
      economy_finance: 0,
      tax_wealth: 0,
      culture_lifestyle: 0,
      commercial_trend: 0,
    };
    for (const item of enrichedNews) {
      const id = item.id ?? item.title;
      if (selectedNewsIds.has(id)) {
        counts[item.resolvedChannel] = (counts[item.resolvedChannel] ?? 0) + 1;
      }
    }
    return counts;
  }, [enrichedNews, selectedNewsIds]);

  // 현재 탭 + 검색어 필터링
  const filteredNews = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return enrichedNews.filter((item) => {
      if (activeChannel !== "all" && item.resolvedChannel !== activeChannel) {
        return false;
      }
      if (q) {
        const hay = `${item.title} ${item.summary ?? ""} ${item.source ?? ""}`.toLowerCase();
        return hay.includes(q);
      }
      return true;
    });
  }, [enrichedNews, activeChannel, searchQuery]);

  const currentChannelMeta = NEWS_CHANNEL_MAP[activeChannel] ?? NEWS_CHANNEL_MAP.all;

  // 황금배합 자동 선별 핸들러
  const handleBalancedMix = () => {
    const pool = allNews.length > 0 ? allNews : [...CURATED_CHANNEL_POOL];
    if (allNews.length === 0 && onAppendNews) {
      onAppendNews([...CURATED_CHANNEL_POOL]);
    }
    const recommendedIds = recommendBalancedNewsMix(pool, maxSelection);
    if (recommendedIds.length === 0) {
      editorToast.warning("추천할 뉴스 후보가 없습니다.");
      return;
    }
    if (onReplaceSelection) {
      onReplaceSelection(recommendedIds);
    } else {
      // 폴백: 기존 선택 해제 후 추천 항목 토글
      for (const curId of Array.from(selectedNewsIds)) {
        if (!recommendedIds.includes(curId)) toggleNews(curId);
      }
      for (const recId of recommendedIds) {
        if (!selectedNewsIds.has(recId)) toggleNews(recId);
      }
    }
    editorToast.success(
      maxSelection <= 3
        ? "✨ 부동산·경제·문화 황금배합 3건이 자동 선택되었습니다."
        : "✨ 부동산·경제·절세·문화·상권 5대 채널 황금배합이 자동 선택되었습니다.",
    );
  };

  // 실시간 채널 뉴스 수집 / 키워드 검색
  const handleFetchLiveChannelNews = async (overrideQuery?: string) => {
    const q = (overrideQuery ?? searchQuery).trim();
    setFetchingLive(true);
    try {
      const params = new URLSearchParams();
      params.set("channel", activeChannel);
      params.set("live", "1");
      if (q) params.set("q", q);

      const res = await fetch(`/api/broker/magazine/news-channels?${params.toString()}`);
      if (res.ok) {
        const json = (await res.json()) as {
          ok?: boolean;
          items?: NewsItem[];
          liveFetchedCount?: number;
        };
        const fetched = Array.isArray(json.items) ? json.items : [];
        if (fetched.length > 0 && onAppendNews) {
          onAppendNews(fetched);
          editorToast.success(
            q
              ? `'${q}' 관련 최신 뉴스 ${fetched.length}건을 불러왔습니다.`
              : `${currentChannelMeta.label} 최신 콘텐츠를 업데이트했습니다.`,
          );
          return;
        }
      }
      // 오프라인/폴백 시 기본 5대 채널 엄선 풀 보충
      if (onAppendNews) {
        onAppendNews([...CURATED_CHANNEL_POOL]);
      }
      editorToast.info(`${currentChannelMeta.label} 추천 브리핑 풀을 불러왔습니다.`);
    } catch {
      if (onAppendNews) {
        onAppendNews([...CURATED_CHANNEL_POOL]);
      }
      editorToast.info("기본 5대 채널 엄선 뉴스 풀을 적용했습니다.");
    } finally {
      setFetchingLive(false);
    }
  };

  // 직접 기사 추가 핸들러
  const handleAddCustomNews = async () => {
    const title = customTitle.trim();
    if (title.length < 4) {
      editorToast.warning("기사 제목을 4자 이상 입력해 주세요.");
      return;
    }
    const chMeta = NEWS_CHANNEL_MAP[customChannel];
    const defaultTopicMap: Record<SpecificNewsChannelId, string> = {
      real_estate: "market_trend",
      economy_finance: "economy",
      tax_wealth: "tax",
      culture_lifestyle: "culture",
      commercial_trend: "commercial_trend",
    };

    const newItem: NewsItem = {
      id: `custom-${Date.now()}`,
      title,
      summary:
        customSummary.trim() ||
        `핵심 팩트: ${title} | 브로커 임플리케이션: ${chMeta.shortLabel} 분야에서 고객님께 추천하는 주요 소식입니다.`,
      source: customSource.trim() || "중개사 추천 브리핑",
      ...(customUrl.trim() ? { url: customUrl.trim() } : {}),
      sentiment: "neutral",
      importance_score: 9,
      topic: defaultTopicMap[customChannel],
      channel: customChannel,
    };

    try {
      const res = await fetch("/api/broker/magazine/news-channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "custom",
          title: newItem.title,
          summary: newItem.summary,
          source: newItem.source,
          url: newItem.url,
          channel: customChannel,
        }),
      });
      if (res.ok) {
        const json = (await res.json()) as { item?: NewsItem };
        if (json.item) {
          Object.assign(newItem, json.item);
        }
      }
    } catch {
      // 로컬 즉시 반영으로 폴백
    }

    const addedId = String(newItem.id ?? newItem.title);
    if (onAppendNews) {
      onAppendNews([newItem], selectedNewsIds.size < maxSelection ? [addedId] : undefined);
    }
    setActiveChannel(customChannel);
    setCustomTitle("");
    setCustomSummary("");
    setCustomSource("");
    setCustomUrl("");
    setShowCustomForm(false);
    editorToast.success(`'${chMeta.shortLabel}' 채널에 추천 기사를 추가했습니다.`);
  };

  return (
    <div className="space-y-3.5" data-testid="news-curation-panel">
      {/* 상단 선택 현황 & 황금배합 추천 헤더 */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <div>
          <p className="text-label font-semibold text-slate-300">
            뉴스 큐레이션 ({selectedNewsIds.size}/{maxSelection} 선택)
          </p>
          <span className="text-caption text-ink-subtle">
            최대 {maxSelection}개까지 선택할 수 있습니다 · 부동산 외 경제·절세·문화 소식을 섞으면 열람률이 높아집니다
          </span>
        </div>
        <button
          type="button"
          data-testid="news-balanced-mix-btn"
          onClick={handleBalancedMix}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-indigo-400/40 bg-indigo-500/20 px-3.5 py-2 text-xs font-extrabold text-indigo-100 hover:bg-indigo-500/30 transition-colors shadow-xs"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-300 shrink-0" aria-hidden="true" />
          <span>✨ 매수자 관심 황금배합 자동 선별</span>
        </button>
      </div>

      {/* 현재 선택된 채널 배합 요약 바 */}
      {selectedNewsIds.size > 0 && (
        <div
          data-testid="selected-channel-mix-bar"
          className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-700/70 bg-slate-900/70 px-3 py-2"
        >
          <span className="text-xs font-bold text-slate-300 mr-1">현재 담긴 분야:</span>
          {(
            [
              "real_estate",
              "economy_finance",
              "tax_wealth",
              "culture_lifestyle",
              "commercial_trend",
            ] as const
          ).map((chKey) => {
            const count = selectedChannelSummary[chKey];
            const meta = NEWS_CHANNEL_MAP[chKey];
            return (
              <span
                key={chKey}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-bold ${
                  count > 0
                    ? meta.badgeClass
                    : "border-slate-800 bg-slate-800/40 text-slate-500"
                }`}
              >
                <span aria-hidden="true">{meta.emoji}</span>
                <span>{meta.shortLabel}</span>
                <span>{count}건</span>
              </span>
            );
          })}
        </div>
      )}

      {/* 5대 매수자 관심 분류 채널 탭 */}
      <div
        role="tablist"
        aria-label="매수자 관심 뉴스 분류 채널"
        data-testid="news-channel-tabs"
        className="grid grid-cols-2 sm:grid-cols-3 gap-1.5"
      >
        {NEWS_CHANNELS.map((ch) => {
          const isActive = activeChannel === ch.id;
          const count = channelCounts[ch.id] ?? 0;
          return (
            <button
              key={ch.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              data-testid={`news-channel-tab-${ch.id}`}
              onClick={() => setActiveChannel(ch.id)}
              className={`flex min-h-11 items-center justify-between gap-1.5 rounded-xl border px-3 py-2 text-left text-xs font-extrabold transition-all ${
                isActive
                  ? "border-indigo-400 bg-indigo-500/25 text-white shadow-xs"
                  : "border-slate-700/70 bg-slate-800/40 text-slate-300 hover:border-slate-600 hover:text-white"
              }`}
            >
              <span className="inline-flex items-center gap-1.5 truncate">
                <span aria-hidden="true">{ch.emoji}</span>
                <span className="truncate">{ch.shortLabel}</span>
              </span>
              <span
                className={`shrink-0 rounded-full px-1.5 py-0.5 text-xs font-bold ${
                  isActive ? "bg-indigo-400/30 text-indigo-100" : "bg-slate-700/70 text-slate-300"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* 선택된 채널 설명 + 추천 검색 키워드 + 실시간 새로고침/직접 추가 */}
      {!compact && (
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-3 space-y-2.5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="space-y-0.5">
              <p className="text-xs font-bold text-indigo-200">
                {currentChannelMeta.emoji} {currentChannelMeta.label} — {currentChannelMeta.description}
              </p>
              <p className="text-xs text-slate-300">{currentChannelMeta.buyerAppeal}</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                data-testid="news-live-refresh-btn"
                disabled={fetchingLive}
                onClick={() => void handleFetchLiveChannelNews()}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-sky-500/35 bg-sky-500/15 px-3 py-1.5 text-xs font-bold text-sky-200 hover:bg-sky-500/25 disabled:opacity-50 transition-colors"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${fetchingLive ? "animate-spin" : ""}`}
                  aria-hidden="true"
                />
                <span>{fetchingLive ? "수집 중..." : "최신 뉴스 불러오기"}</span>
              </button>
              <button
                type="button"
                data-testid="news-custom-toggle-btn"
                aria-expanded={showCustomForm}
                onClick={() => setShowCustomForm((v) => !v)}
                className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-emerald-500/35 bg-emerald-500/15 px-3 py-1.5 text-xs font-bold text-emerald-200 hover:bg-emerald-500/25 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>직접 기사 추가</span>
              </button>
            </div>
          </div>

          {/* 키워드 검색 입력창 & 추천 키워드 칩 */}
          <div className="flex gap-1.5">
            <label htmlFor={searchInputId} className="sr-only">
              뉴스 키워드 검색
            </label>
            <div className="relative flex-1">
              <Search
                className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                id={searchInputId}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleFetchLiveChannelNews(searchQuery);
                  }
                }}
                placeholder="관심 키워드로 필터 또는 실시간 검색 (예: 상속세, 미술품 경매, 한국은행 금리)"
                className="w-full min-h-11 rounded-lg border border-slate-700 bg-[#0f1523] pl-8 pr-8 py-2 text-xs text-white placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  aria-label="검색어 지우기"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
            <button
              type="button"
              data-testid="news-keyword-search-btn"
              disabled={fetchingLive}
              onClick={() => void handleFetchLiveChannelNews(searchQuery)}
              className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg border border-indigo-500/40 bg-indigo-600/30 px-3 py-2 text-xs font-bold text-indigo-100 hover:bg-indigo-600/45 disabled:opacity-50"
            >
              <span>채널 검색</span>
            </button>
          </div>

          {/* 채널별 원클릭 키워드 칩 */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-400">추천 주제:</span>
            {currentChannelMeta.sampleKeywords.map((kw) => (
              <button
                key={kw}
                type="button"
                onClick={() => {
                  setSearchQuery(kw);
                  void handleFetchLiveChannelNews(kw);
                }}
                className="inline-flex min-h-9 items-center rounded-lg border border-slate-700 bg-slate-800/70 px-2.5 py-1 text-xs font-semibold text-slate-200 hover:border-indigo-400/50 hover:bg-indigo-500/15 hover:text-indigo-200 transition-colors"
              >
                # {kw}
              </button>
            ))}
          </div>

          {/* 직접 추천 기사·칼럼 추가 폼 */}
          {showCustomForm && (
            <div
              data-testid="news-custom-add-form"
              className="mt-2 rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3.5 space-y-2.5"
            >
              <p className="text-xs font-extrabold text-emerald-200">
                ➕ 신문·매거진에서 본 좋은 기사나 칼럼을 직접 추가해 보세요
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label htmlFor={customTitleId} className="text-xs font-bold text-slate-200 block mb-1">
                    기사·칼럼 제목 (필수)
                  </label>
                  <input
                    id={customTitleId}
                    type="text"
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    placeholder="예: 하반기 미술품 경매 시장과 빌딩 로비 갤러리 트렌드"
                    className="w-full min-h-11 rounded-lg border border-slate-700 bg-[#0f1523] px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label htmlFor={customSourceId} className="text-xs font-bold text-slate-200 block mb-1">
                    분류 채널 &amp; 출처 매체명
                  </label>
                  <div className="flex gap-1.5">
                    <select
                      aria-label="직접 추가 기사 분류 채널"
                      value={customChannel}
                      onChange={(e) => setCustomChannel(e.target.value as SpecificNewsChannelId)}
                      className="min-h-11 rounded-lg border border-slate-700 bg-[#0f1523] px-2.5 py-2 text-xs font-bold text-white"
                    >
                      {NEWS_CHANNELS.filter((c) => c.id !== "all").map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.emoji} {c.shortLabel}
                        </option>
                      ))}
                    </select>
                    <input
                      id={customSourceId}
                      type="text"
                      value={customSource}
                      onChange={(e) => setCustomSource(e.target.value)}
                      placeholder="출처 (예: 한경 아르떼)"
                      className="flex-1 min-w-0 min-h-11 rounded-lg border border-slate-700 bg-[#0f1523] px-3 py-2 text-xs text-white"
                    />
                  </div>
                </div>
              </div>
              <div>
                <label htmlFor={customSummaryId} className="text-xs font-bold text-slate-200 block mb-1">
                  핵심 내용 또는 중개사 한마디 해설 (선택)
                </label>
                <textarea
                  id={customSummaryId}
                  value={customSummary}
                  onChange={(e) => setCustomSummary(e.target.value)}
                  rows={2}
                  placeholder="비워두셔도 제목을 바탕으로 깔끔한 브리핑 문구가 자동 생성됩니다."
                  className="w-full rounded-lg border border-slate-700 bg-[#0f1523] px-3 py-2 text-xs text-white"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor={customUrlId} className="sr-only">
                  원문 링크 URL
                </label>
                <input
                  id={customUrlId}
                  type="url"
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  placeholder="원문 기사 인터넷 주소 https://... (선택)"
                  className="flex-1 min-w-[200px] min-h-11 rounded-lg border border-slate-700 bg-[#0f1523] px-3 py-2 text-xs text-white"
                />
                <button
                  type="button"
                  data-testid="news-custom-submit-btn"
                  onClick={() => void handleAddCustomNews()}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-xs font-extrabold text-white transition-colors"
                >
                  <Check className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>추가 후 바로 선택</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 기사 목록 */}
      {allNews.length === 0 ? (
        <EmptyState
          icon={<Newspaper className="w-8 h-8 opacity-60" />}
          title="선택할 뉴스가 없습니다"
          description="새 뉴스가 수집되면 이곳에 표시됩니다. [최신 뉴스 불러오기]를 누르면 5대 채널 추천 기사를 즉시 가져옵니다."
        />
      ) : filteredNews.length === 0 ? (
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-6 text-center space-y-2">
          <p className="text-sm font-bold text-slate-200">
            현재 선택한 채널·검색어에 해당하는 기사가 없습니다
          </p>
          <p className="text-xs text-slate-400">
            아래 버튼을 누르시면 {currentChannelMeta.label} 채널의 최신·엄선 기사를 바로 불러옵니다.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery("");
              void handleFetchLiveChannelNews("");
            }}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-indigo-400/40 bg-indigo-500/20 px-4 py-2 text-xs font-bold text-indigo-100 hover:bg-indigo-500/30"
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{currentChannelMeta.label} 기사 불러오기</span>
          </button>
        </div>
      ) : (
        filteredNews.map((news, idx) => {
          const newsId = news.id ?? news.title;
          const isSelected = selectedNewsIds.has(newsId);
          const topic = topicLabel(news.topic);
          const chMeta = NEWS_CHANNEL_MAP[news.resolvedChannel] ?? NEWS_CHANNEL_MAP.real_estate;
          const summaryLines = formatNewsSummary(news.summary);
          return (
            <motion.button
              key={newsId ?? idx}
              type="button"
              aria-pressed={isSelected}
              onClick={() => toggleNews(newsId)}
              whileTap={{ scale: 0.98 }}
              className={`w-full min-h-11 text-left p-3.5 rounded-xl border transition-all duration-200 ${
                isSelected
                  ? "bg-indigo-500/15 border-indigo-400/50 shadow-xs"
                  : "bg-slate-800/30 border-slate-700/50 opacity-85 hover:opacity-100 hover:border-slate-600"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-1 flex-shrink-0" aria-hidden="true">
                  {isSelected ? (
                    <ToggleRight className="w-5 h-5 text-indigo-400" />
                  ) : (
                    <ToggleLeft className="w-5 h-5 text-ink-subtle" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap mb-1">
                    <span
                      className={`inline-flex items-center gap-1 text-caption font-bold border px-2 py-0.5 rounded-full ${chMeta.badgeClass}`}
                    >
                      <span aria-hidden="true">{chMeta.emoji}</span>
                      <span>{chMeta.shortLabel}</span>
                    </span>
                    {topic && (
                      <span className="text-caption font-medium text-indigo-300 bg-indigo-500/12 border border-indigo-500/20 px-1.5 py-0.5 rounded-full">
                        {topic}
                      </span>
                    )}
                    {news.importance_score != null && (
                      <span
                        className="inline-flex items-center gap-0.5 text-caption font-bold text-amber-300 bg-amber-500/12 border border-amber-500/20 px-1.5 py-0.5 rounded-full"
                        title="중요도"
                      >
                        <Star className="w-2.5 h-2.5" aria-hidden="true" />
                        <span className="sr-only">중요도 </span>
                        {news.importance_score}
                      </span>
                    )}
                    {news.sentiment && (
                      <span
                        className={`text-caption font-bold px-1.5 py-0.5 rounded-full ${
                          news.sentiment === "bullish"
                            ? "text-emerald-300 bg-emerald-500/12"
                            : news.sentiment === "bearish"
                              ? "text-rose-300 bg-rose-500/12"
                              : "text-ink-subtle bg-slate-500/12"
                        }`}
                      >
                        {news.sentiment === "bullish"
                          ? "긍정"
                          : news.sentiment === "bearish"
                            ? "부정"
                            : "중립"}
                      </span>
                    )}
                  </div>

                  <p className="text-label font-bold text-white leading-snug line-clamp-2 mb-1">
                    {cleanNewsText(news.title)}
                  </p>

                  {/* AI summary inline — "핵심 팩트: … | 브로커 임플리케이션: …" 파이프 원문을 줄 단위로 */}
                  {summaryLines.length > 0 && (
                    <ul className="text-caption text-ink-muted leading-relaxed mb-1.5 space-y-0.5 list-none">
                      {summaryLines.slice(0, compact ? 1 : 3).map((line, i) => (
                        <li key={i} className="line-clamp-2">
                          {line}
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    {news.source && (
                      <span className="text-caption text-ink-subtle">{news.source}</span>
                    )}
                    {news.url && (
                      <a
                        href={news.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-caption font-semibold text-indigo-300 hover:text-indigo-200 underline underline-offset-2"
                      >
                        <span>원문 확인</span>
                        <ExternalLink className="w-3 h-3" aria-hidden="true" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </motion.button>
          );
        })
      )}
    </div>
  );
}
