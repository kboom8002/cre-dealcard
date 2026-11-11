"use client";

import React, { useState } from "react";
import { Sparkles, ArrowUp, ArrowDown, RefreshCw, Palette, Newspaper } from "lucide-react";
import type { AxiosUnitIssue, PostItTone } from "@/domain/magazine/types";
import {
  AXIOS_BRIEF_MAX_CHARS,
  AXIOS_TITLE_MAX_CHARS,
  ISSUE_CARD_COUNT,
  charLength,
  POST_IT_TONES,
  POST_IT_TONE_META,
  clusterArticlesIntoFiveIssues,
  formatAxiosCardTitle,
  formatAxiosTwoLineBrief,
} from "@/domain/magazine/issue-clustering";
import {
  NEWS_CHANNELS,
  NEWS_CHANNEL_MAP,
  isCreRelevantArticle,
  resolveNewsChannel,
  type NewsChannelId,
  type NewsPoolItem,
  type SpecificNewsChannelId,
} from "@/domain/magazine/news-channels";
import { editorToast } from "@/components/magazine-editor/editor-toaster";

export interface AxiosIssuesEditorPanelProps {
  unitIssues: AxiosUnitIssue[];
  onChangeUnitIssues: (next: AxiosUnitIssue[]) => void;
  newsPool: NewsPoolItem[];
  cadenceLabel?: string;
  preferredRegions?: readonly string[];
  preferredChannels?: readonly SpecificNewsChannelId[];
  dealTitles?: readonly string[];
  onAiClusterIssues?: () => Promise<void> | void;
  isAiClustering?: boolean;
  onRefreshLiveChannel?: (channel: NewsChannelId) => void;
  canUndoRecluster?: boolean;
  onUndoRecluster?: () => void;
}

export function AxiosIssuesEditorPanel({
  unitIssues,
  onChangeUnitIssues,
  newsPool,
  cadenceLabel = "이번 호",
  preferredRegions,
  preferredChannels,
  dealTitles,
  onAiClusterIssues,
  isAiClustering = false,
  onRefreshLiveChannel,
  canUndoRecluster = false,
  onUndoRecluster,
}: AxiosIssuesEditorPanelProps) {
  const [swappingIndex, setSwappingIndex] = useState<number | null>(null);
  const [channelFilter, setChannelFilter] = useState<NewsChannelId>("all");

  // 실제 상태(unitIssues)와 화면 표시를 1:1 일치시켜 미저장 유령 카드 발생을 원천 차단한다
  const issues: AxiosUnitIssue[] = unitIssues.slice(0, ISSUE_CARD_COUNT);

  const handleSeedInitialIssues = () => {
    const clustered = clusterArticlesIntoFiveIssues(newsPool, {
      preferredRegions,
      preferredChannels,
      dealKeywords: dealTitles,
    });
    onChangeUnitIssues(clustered);
    editorToast.success("핵심 시장 이슈 5선을 채웠습니다.");
  };

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

  const handleReclusterAll = async () => {
    if (onAiClusterIssues) {
      await onAiClusterIssues();
      return;
    }
    const reclustered = clusterArticlesIntoFiveIssues(newsPool, {
      preferredRegions,
      preferredChannels,
      dealKeywords: dealTitles,
    });
    onChangeUnitIssues(reclustered);
    editorToast.success("AI가 내 권역·관심 분야 기반으로 핵심 시장 이슈 5선을 재구성했습니다.");
  };

  const handleReplaceSingleIssue = (idx: number, item: NewsPoolItem) => {
    const ch = resolveNewsChannel(item);
    const currentTone = issues[idx]?.memoTone ?? POST_IT_TONES[idx % POST_IT_TONES.length];
    const replacement: AxiosUnitIssue = {
      id: String(item.id ?? `issue-${idx + 1}-${Date.now()}`),
      title: formatAxiosCardTitle(item.cardTitle || item.title),
      brief: formatAxiosTwoLineBrief(item.cardBrief || item.summary, {
        title: formatAxiosCardTitle(item.cardTitle || item.title),
        channel: ch,
      }),
      memoTone: currentTone,
      channel: ch,
      topic: item.topic || ch,
      sentiment:
        item.sentiment === "bullish" || item.sentiment === "bearish" ? item.sentiment : "neutral",
      sources: item.source ? [item.source] : [NEWS_CHANNEL_MAP[ch]?.shortLabel ?? "시장 브리핑"],
      ...(item.url ? { url: item.url } : {}),
      articleCount: 1,
    };
    const next =
      issues.length > idx
        ? issues.map((iss, i) => (i === idx ? replacement : iss))
        : [...issues, replacement];
    onChangeUnitIssues(next);
    setSwappingIndex(null);
    editorToast.success(`${idx + 1}번 핵심 이슈를 교체했습니다.`);
  };

  const candidatePool = newsPool.filter((n) => {
    if (!isCreRelevantArticle(n)) return false;
    if (channelFilter === "all") return true;
    return resolveNewsChannel(n) === channelFilter;
  });

  return (
    <div data-testid="axios-issues-editor-panel" className="space-y-4">
      {/* 상단 설명 & 1-Click AI 재구성 바 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Newspaper className="w-4 h-4 text-blue-700" aria-hidden="true" />
              <h2 className="text-base font-extrabold text-slate-900">
                {cadenceLabel} 핵심 시장 이슈 포스트잇 5선
              </h2>
              <span className="rounded-full bg-blue-50 border border-blue-200 px-2.5 py-0.5 text-sm font-extrabold text-blue-800 whitespace-nowrap">
                {issues.length > 0 ? `${issues.length}건 구성됨` : "미작성"}
              </span>
            </div>
            <p className="mt-1 text-sm font-medium text-slate-600">
              내 주력 권역과 관심 분야 기사를 클러스터링하여 <strong>카드뉴스형 제목(36자 이내) + 짧은 해설(48자 이내, AXIOS 스타일)</strong> 글래스 카드로 구성합니다. 글자 수 안에서 쓰면 고객 화면에서 잘리지 않습니다.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {canUndoRecluster && onUndoRecluster && (
              <button
                type="button"
                data-testid="undo-recluster-issues-btn"
                onClick={onUndoRecluster}
                className="min-h-11 inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 px-3 py-2 text-sm font-extrabold text-amber-900 transition-colors whitespace-nowrap"
              >
                <span>이전 이슈 복원</span>
              </button>
            )}
            <button
              type="button"
              data-testid="recluster-five-issues-btn"
              disabled={isAiClustering}
              onClick={() => void handleReclusterAll()}
              className="min-h-11 inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 px-3.5 py-2 text-sm font-extrabold text-white shadow-xs transition-colors whitespace-nowrap"
            >
              <Sparkles className="w-4 h-4" aria-hidden="true" />
              <span>
                {isAiClustering ? "AI 맞춤 이슈 생성 중..." : "AI 핵심 이슈 5선 자동 재구성"}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* 핵심 이슈 카드 편집 리스트 또는 빈 상태 안내 */}
      {issues.length === 0 ? (
        <div
          data-testid="axios-issues-empty-state"
          className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/80 p-6 text-center space-y-3"
        >
          <p className="text-base font-extrabold text-slate-900">
            아직 등록된 핵심 시장 이슈가 없습니다
          </p>
          <p className="text-sm font-medium text-slate-600">
            아래 버튼을 누르면 내 권역·관심 분야 기사를 바탕으로 핵심 이슈 5선을 바로 채워 넣습니다.
          </p>
          <button
            type="button"
            data-testid="seed-five-issues-empty-btn"
            onClick={handleSeedInitialIssues}
            style={{ backgroundColor: "#1D4ED8", borderColor: "#1E40AF", color: "#FFFFFF" }}
            className="min-h-11 inline-flex items-center gap-1.5 rounded-xl border border-blue-700 bg-blue-700 hover:bg-blue-800 px-4 py-2.5 text-sm font-extrabold text-white shadow-xs transition-colors"
          >
            <Sparkles className="w-4 h-4" aria-hidden="true" />
            <span style={{ color: "#FFFFFF" }}>핵심 이슈 5선 자동 채우기</span>
          </button>
        </div>
      ) : (
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
                borderLeftColor: toneMeta.accentBar,
              }}
              className="rounded-2xl border-2 border-l-[6px] p-4 shadow-2xs transition-all space-y-3"
            >
              {/* 카드 상단 메타 바: 번호 + 채널 배지 + 강조색 5톤 선택 + 순서/교체 */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span
                    style={{
                      backgroundColor: toneMeta.badgeBg,
                      color: toneMeta.badgeText,
                    }}
                    className="rounded px-2.5 py-1 text-sm font-extrabold"
                  >
                    ISSUE 0{idx + 1}
                  </span>
                  <span className="rounded bg-white/85 border border-slate-300/80 px-2 py-0.5 text-sm font-bold text-slate-800">
                    {chMeta.emoji} {chMeta.shortLabel}
                  </span>
                  {issue.articleCount && issue.articleCount > 1 && (
                    <span className="rounded bg-white/75 px-2 py-0.5 text-sm font-semibold text-slate-700">
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
                            background: m.glassBackground,
                            borderColor: selected ? m.glassAccent : "rgba(15,23,42,0.25)",
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
                    className="min-h-9 inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white/90 hover:bg-white px-2.5 py-1 text-sm font-extrabold text-slate-800"
                  >
                    <RefreshCw className="w-3 h-3" aria-hidden="true" />
                    <span>{isSwapping ? "닫기" : "교체"}</span>
                  </button>
                </div>
              </div>

              {/* 카드뉴스 제목 입력 (36자 예산 · 실시간 카운터 · 초과 시 경고 + 1-클릭 압축) */}
              {(() => {
                const titleLen = charLength(issue.title);
                const briefLen = charLength(issue.brief);
                const titleOver = titleLen > AXIOS_TITLE_MAX_CHARS;
                const briefOver = briefLen > AXIOS_BRIEF_MAX_CHARS;
                const channelForIssue = resolveNewsChannel({
                  title: issue.title,
                  summary: issue.brief,
                  channel: issue.channel,
                });
                return (
                  <>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label
                          htmlFor={`axios-issue-title-${idx}`}
                          className="text-sm font-extrabold text-slate-800"
                        >
                          카드뉴스 제목 (36자 이내)
                        </label>
                        <span
                          data-testid={`axios-issue-title-count-${idx}`}
                          className={`text-sm font-bold ${titleOver ? "text-rose-700" : "text-slate-600"}`}
                        >
                          {titleLen}/{AXIOS_TITLE_MAX_CHARS}자
                        </span>
                      </div>
                      <input
                        id={`axios-issue-title-${idx}`}
                        type="text"
                        value={issue.title}
                        aria-invalid={titleOver}
                        onChange={(e) =>
                          handleUpdateIssue(idx, {
                            title: e.target.value.replace(/[\r\n]+/g, " "),
                          })
                        }
                        onBlur={() => {
                          if (titleOver) {
                            handleUpdateIssue(idx, { title: formatAxiosCardTitle(issue.title) });
                            editorToast.success(`${idx + 1}번 제목을 36자 이내 완결된 문장으로 다듬었습니다.`);
                          }
                        }}
                        placeholder="고객 시선을 끄는 핵심 제목 (36자 이내)"
                        className={`w-full min-h-11 rounded-lg border bg-white/95 px-3.5 py-2 text-base font-extrabold text-slate-900 placeholder:text-slate-400 focus:outline-none ${
                          titleOver ? "border-rose-500 focus:border-rose-600" : "border-slate-300/90 focus:border-blue-600"
                        }`}
                      />
                      {titleOver && (
                        <p role="status" className="text-sm font-bold text-rose-700">
                          36자를 넘으면 고객 화면에서 길어져요. 입력칸을 벗어나면 자동으로 다듬어 드려요.
                        </p>
                      )}
                    </div>

                    {/* 짧은 해설 입력 (48자 예산) */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <label
                          htmlFor={`axios-issue-brief-${idx}`}
                          className="text-sm font-extrabold text-slate-800"
                        >
                          짧은 해설 (48자 이내 · 1~2문장)
                        </label>
                        <div className="flex items-center gap-2">
                          <span
                            data-testid={`axios-issue-brief-count-${idx}`}
                            className={`text-sm font-bold ${briefOver ? "text-rose-700" : "text-slate-600"}`}
                          >
                            {briefLen}/{AXIOS_BRIEF_MAX_CHARS}자
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              const refined = formatAxiosTwoLineBrief(issue.brief, {
                                title: issue.title,
                                channel: channelForIssue,
                              });
                              handleUpdateIssue(idx, { brief: refined });
                              editorToast.success("48자 이내 완결된 해설로 짧고 명확하게 정돈했습니다.");
                            }}
                            className="text-sm font-bold text-blue-800 hover:underline"
                          >
                            ✨ 48자 자동 압축
                          </button>
                        </div>
                      </div>
                      <textarea
                        id={`axios-issue-brief-${idx}`}
                        rows={2}
                        value={issue.brief}
                        aria-invalid={briefOver}
                        onChange={(e) => handleUpdateIssue(idx, { brief: e.target.value })}
                        onBlur={() => {
                          if (briefOver) {
                            handleUpdateIssue(idx, {
                              brief: formatAxiosTwoLineBrief(issue.brief, {
                                title: issue.title,
                                channel: channelForIssue,
                              }),
                            });
                          }
                        }}
                        placeholder="핵심 팩트나 시사점을 48자 이내 1~2문장으로 짧게 입력하세요"
                        className={`w-full rounded-lg border bg-white/95 p-3 text-sm font-medium leading-relaxed text-slate-800 placeholder:text-slate-400 focus:outline-none resize-y ${
                          briefOver ? "border-rose-500 focus:border-rose-600" : "border-slate-300/90 focus:border-blue-600"
                        }`}
                      />
                    </div>
                  </>
                );
              })()}
              {/* 기사 교체 드로어 */}
              {isSwapping && (
                <div className="rounded-lg border border-slate-300 bg-white p-3 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <span className="text-sm font-extrabold text-slate-900">
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
                          className={`px-2.5 py-1 rounded-md text-sm font-bold ${
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
                          <p className="text-sm font-bold text-slate-900 truncate">{cand.title}</p>
                          {cand.source && (
                            <p className="text-sm text-slate-500 truncate">{cand.source}</p>
                          )}
                        </div>
                        <span className="shrink-0 rounded-md bg-blue-50 border border-blue-200 px-2.5 py-1 text-sm font-extrabold text-blue-700">
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
      )}
    </div>
  );
}
