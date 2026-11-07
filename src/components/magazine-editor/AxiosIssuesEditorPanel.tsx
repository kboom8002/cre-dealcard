"use client";

import React, { useState } from "react";
import { Sparkles, ArrowUp, ArrowDown, RefreshCw, Palette, Newspaper } from "lucide-react";
import type { AxiosUnitIssue, PostItTone } from "@/domain/magazine/types";
import {
  ISSUE_CARD_COUNT,
  POST_IT_TONES,
  POST_IT_TONE_META,
  clusterArticlesIntoFiveIssues,
  formatAxiosBrief,
  formatSingleLineTitle,
} from "@/domain/magazine/issue-clustering";
import {
  NEWS_CHANNELS,
  NEWS_CHANNEL_MAP,
  resolveNewsChannel,
  type NewsChannelId,
  type NewsPoolItem,
} from "@/domain/magazine/news-channels";
import { editorToast } from "@/components/magazine-editor/editor-toaster";

export interface AxiosIssuesEditorPanelProps {
  unitIssues: AxiosUnitIssue[];
  onChangeUnitIssues: (next: AxiosUnitIssue[]) => void;
  newsPool: NewsPoolItem[];
  cadenceLabel?: string;
  onRefreshLiveChannel?: (channel: NewsChannelId) => void;
}

export function AxiosIssuesEditorPanel({
  unitIssues,
  onChangeUnitIssues,
  newsPool,
  cadenceLabel = "이번 호",
  onRefreshLiveChannel,
}: AxiosIssuesEditorPanelProps) {
  const [swappingIndex, setSwappingIndex] = useState<number | null>(null);
  const [channelFilter, setChannelFilter] = useState<NewsChannelId>("all");

  // 항상 5건 유지 보장
  const issues: AxiosUnitIssue[] =
    unitIssues.length >= ISSUE_CARD_COUNT
      ? unitIssues.slice(0, ISSUE_CARD_COUNT)
      : (() => {
          const fallback = clusterArticlesIntoFiveIssues(newsPool);
          const merged = [...unitIssues];
          for (const f of fallback) {
            if (merged.length >= ISSUE_CARD_COUNT) break;
            if (!merged.some((m) => m.id === f.id)) merged.push(f);
          }
          return merged.slice(0, ISSUE_CARD_COUNT);
        })();

  const handleUpdateIssue = (idx: number, patch: Partial<AxiosUnitIssue>) => {
    const next = issues.map((item, i) => (i === idx ? { ...item, ...patch } : item));
    onChangeUnitIssues(next);
  };

  const handleMoveIssue = (idx: number, dir: -1 | 1) => {
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= issues.length) return;
    const next = [...issues];
    const temp = next[idx];
    next[idx] = next[targetIdx];
    next[targetIdx] = temp;
    onChangeUnitIssues(next);
  };

  const handleReclusterAll = () => {
    const reclustered = clusterArticlesIntoFiveIssues(newsPool);
    onChangeUnitIssues(reclustered);
    editorToast.success("AI가 연관 기사를 분석하여 핵심 시장 이슈 5선을 재구성했습니다.");
  };

  const handleReplaceSingleIssue = (idx: number, item: NewsPoolItem) => {
    const ch = resolveNewsChannel(item);
    const currentTone = issues[idx]?.memoTone ?? POST_IT_TONES[idx % POST_IT_TONES.length];
    const replacement: AxiosUnitIssue = {
      id: String(item.id ?? `issue-${idx + 1}-${Date.now()}`),
      title: formatSingleLineTitle(item.title, 38),
      brief: formatAxiosBrief(item.summary, { title: item.title, channel: ch }),
      memoTone: currentTone,
      channel: ch,
      topic: item.topic || ch,
      sentiment:
        item.sentiment === "bullish" || item.sentiment === "bearish" ? item.sentiment : "neutral",
      sources: item.source ? [item.source] : [NEWS_CHANNEL_MAP[ch]?.shortLabel ?? "시장 브리핑"],
      ...(item.url ? { url: item.url } : {}),
      articleCount: 1,
    };
    const next = issues.map((iss, i) => (i === idx ? replacement : iss));
    onChangeUnitIssues(next);
    setSwappingIndex(null);
    editorToast.success(`${idx + 1}번 핵심 이슈를 교체했습니다.`);
  };

  const candidatePool = newsPool.filter((n) => {
    if (channelFilter === "all") return true;
    return resolveNewsChannel(n) === channelFilter;
  });

  return (
    <div data-testid="axios-issues-editor-panel" className="space-y-4">
      {/* 상단 설명 & 1-Click AI 재구성 바 */}
      <div className="rounded-lg border border-slate-300 bg-white p-4 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5">
              <Newspaper className="w-4 h-4 text-blue-700" aria-hidden="true" />
              <h2 className="text-base font-extrabold text-slate-900">
                {cadenceLabel} 핵심 시장 이슈 5선
              </h2>
              <span className="rounded-full bg-blue-50 border border-blue-200 px-2.5 py-0.5 text-xs font-extrabold text-blue-800 whitespace-nowrap">
                5건 고정
              </span>
            </div>
            <p className="mt-1 text-xs font-medium text-slate-600">
              기사를 클러스터링 AI로 요약하여 <strong>핵심 제목 + 2~4문장 요약 브리프</strong> 카드로 구성합니다.
            </p>
          </div>

          <button
            type="button"
            data-testid="recluster-five-issues-btn"
            onClick={handleReclusterAll}
            className="min-h-11 inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 px-3.5 py-2 text-xs font-extrabold text-white shadow-xs transition-colors whitespace-nowrap shrink-0"
          >
            <Sparkles className="w-4 h-4" aria-hidden="true" />
            <span>AI 핵심 이슈 5선 자동 재구성</span>
          </button>
        </div>
      </div>

      {/* 5개의 핵심 이슈 카드 편집 리스트 */}
      <div className="space-y-3.5">
        {issues.map((issue, idx) => {
          const toneMeta = POST_IT_TONE_META[issue.memoTone] ?? POST_IT_TONE_META.amber;
          const chMeta =
            issue.channel && NEWS_CHANNEL_MAP[issue.channel as NewsChannelId]
              ? NEWS_CHANNEL_MAP[issue.channel as NewsChannelId]
              : NEWS_CHANNEL_MAP.real_estate;
          const isSwapping = swappingIndex === idx;

          return (
            <div
              key={`${issue.id}-${idx}`}
              data-testid={`axios-issue-card-editor-${idx}`}
              style={{
                backgroundColor: toneMeta.cardBg,
                borderColor: toneMeta.cardBorder,
              }}
              className="rounded-lg border border-l-4 p-4 shadow-2xs transition-all space-y-3"
            >
              {/* 카드 상단 메타 바: 번호 + 채널 배지 + 강조색 5톤 선택 + 순서/교체 */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span
                    style={{
                      backgroundColor: toneMeta.badgeBg,
                      color: toneMeta.badgeText,
                    }}
                    className="rounded px-2.5 py-1 text-xs font-extrabold"
                  >
                    ISSUE 0{idx + 1}
                  </span>
                  <span className="rounded bg-white/80 border border-slate-300/80 px-2 py-0.5 text-xs font-bold text-slate-800">
                    {chMeta.emoji} {chMeta.shortLabel}
                  </span>
                  {issue.articleCount && issue.articleCount > 1 && (
                    <span className="rounded bg-white/70 px-2 py-0.5 text-xs font-semibold text-slate-700">
                      연관 기사 {issue.articleCount}건 클러스터
                    </span>
                  )}
                </div>

                {/* 우측 컨트롤: 강조 색상 5종 + 위/아래 + 다른 기사 교체 */}
                <div className="flex items-center gap-1.5">
                  <div
                    role="group"
                    aria-label={`이슈 ${idx + 1} 카드 강조색 선택`}
                    className="flex items-center gap-1 rounded-lg bg-white/80 border border-slate-300/70 px-1.5 py-1"
                  >
                    <Palette className="w-3.5 h-3.5 text-slate-500 mr-0.5" aria-hidden="true" />
                    {POST_IT_TONES.map((t) => {
                      const m = POST_IT_TONE_META[t];
                      const selected = issue.memoTone === t;
                      return (
                        <button
                          key={t}
                          type="button"
                          title={m.label}
                          aria-label={m.label}
                          aria-pressed={selected}
                          onClick={() => handleUpdateIssue(idx, { memoTone: t as PostItTone })}
                          style={{
                            backgroundColor: m.cardBg,
                            borderColor: selected ? m.accentBar : m.cardBorder,
                          }}
                          className={`w-5 h-5 rounded-full border-2 transition-transform ${
                            selected ? "scale-110 ring-2 ring-slate-900/20" : "opacity-80 hover:opacity-100"
                          }`}
                        />
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    disabled={idx === 0}
                    aria-label={`이슈 ${idx + 1} 위로 이동`}
                    onClick={() => handleMoveIssue(idx, -1)}
                    className="min-h-9 min-w-9 inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white/80 text-slate-700 hover:bg-white disabled:opacity-40"
                  >
                    <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    disabled={idx === issues.length - 1}
                    aria-label={`이슈 ${idx + 1} 아래로 이동`}
                    onClick={() => handleMoveIssue(idx, 1)}
                    className="min-h-9 min-w-9 inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white/80 text-slate-700 hover:bg-white disabled:opacity-40"
                  >
                    <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setSwappingIndex(isSwapping ? null : idx)}
                    className="min-h-9 inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white/90 hover:bg-white px-2.5 py-1 text-xs font-extrabold text-slate-800"
                  >
                    <RefreshCw className="w-3 h-3" aria-hidden="true" />
                    <span>{isSwapping ? "닫기" : "교체"}</span>
                  </button>
                </div>
              </div>

              {/* 핵심 제목 입력 */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor={`axios-issue-title-${idx}`}
                    className="text-xs font-extrabold text-slate-800"
                  >
                    핵심 이슈 제목 (한 줄 표시)
                  </label>
                  <span className="text-xs font-semibold text-slate-600">
                    {issue.title.length}/38자
                  </span>
                </div>
                <input
                  id={`axios-issue-title-${idx}`}
                  type="text"
                  maxLength={44}
                  value={issue.title}
                  onChange={(e) =>
                    handleUpdateIssue(idx, {
                      title: e.target.value.replace(/[\r\n]+/g, " "),
                    })
                  }
                  placeholder="핵심 결론을 담은 제목을 입력하세요"
                  className="w-full min-h-11 rounded-lg border border-slate-300/90 bg-white/95 px-3.5 py-2 text-base font-extrabold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
                />
              </div>

              {/* 2~4문장 요약 브리프 입력 */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor={`axios-issue-brief-${idx}`}
                    className="text-xs font-extrabold text-slate-800"
                  >
                    요약 브리프 해설 (2~4문장)
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const refined = formatAxiosBrief(issue.brief, {
                        title: issue.title,
                        channel: resolveNewsChannel({
                          title: issue.title,
                          summary: issue.brief,
                          channel: issue.channel,
                        }),
                      });
                      handleUpdateIssue(idx, { brief: refined });
                      editorToast.success("2~4문장 요약 브리프 형식으로 정돈했습니다.");
                    }}
                    className="text-xs font-bold text-blue-800 hover:underline"
                  >
                    ✨ 2~4문장 자동 정돈
                  </button>
                </div>
                <textarea
                  id={`axios-issue-brief-${idx}`}
                  rows={3}
                  value={issue.brief}
                  onChange={(e) => handleUpdateIssue(idx, { brief: e.target.value })}
                  placeholder="핵심 팩트와 매수자 시사점을 2~4문장으로 간결하게 정리하세요"
                  className="w-full rounded-lg border border-slate-300/90 bg-white/95 p-3 text-sm font-medium leading-relaxed text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 resize-y"
                />
              </div>

              {/* 기사 교체 드로어 */}
              {isSwapping && (
                <div className="rounded-lg border border-slate-300 bg-white p-3 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <span className="text-xs font-extrabold text-slate-900">
                      다른 뉴스 기사로 이 이슈 교체
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {NEWS_CHANNELS.map((ch) => (
                        <button
                          key={ch.id}
                          type="button"
                          onClick={() => {
                            setChannelFilter(ch.id);
                            if (ch.id !== "all" && onRefreshLiveChannel) {
                              onRefreshLiveChannel(ch.id);
                            }
                          }}
                          className={`px-2 py-0.5 rounded-md text-xs font-bold ${
                            channelFilter === ch.id
                              ? "bg-blue-700 text-white"
                              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                          }`}
                        >
                          {ch.emoji} {ch.shortLabel}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="max-h-48 overflow-y-auto divide-y divide-slate-100">
                    {candidatePool.slice(0, 10).map((cand, cIdx) => (
                      <button
                        key={String(cand.id ?? cIdx)}
                        type="button"
                        onClick={() => handleReplaceSingleIssue(idx, cand)}
                        className="w-full text-left py-2 px-2 hover:bg-blue-50 rounded-lg transition-colors flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-slate-900 truncate">{cand.title}</p>
                          {cand.source && (
                            <p className="text-xs text-slate-500 truncate">{cand.source}</p>
                          )}
                        </div>
                        <span className="shrink-0 rounded-md bg-blue-50 border border-blue-200 px-2 py-1 text-xs font-extrabold text-blue-700">
                          선택
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
