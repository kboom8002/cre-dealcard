"use client";

import React, { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { useUndoToast, type UndoToastInput } from "@/components/workspace/UndoConfirmToast";
import { editorToast } from "@/components/magazine-editor/editor-toaster";
import type { AiDraftResult } from "@/app/api/broker/studio/ai-draft/route";
import {
  TONE_STANCE_META,
  type NewsletterToneStance,
  type SpecificNewsChannelId,
} from "@/domain/magazine/news-channels";

function useSafeShowUndoToast(): (input: UndoToastInput) => void {
  try {
    const ctx = useUndoToast();
    return ctx.showUndoToast;
  } catch {
    return (input: UndoToastInput) => {
      const msg = typeof input === "string" ? input : input.message;
      editorToast.success(msg);
    };
  }
}

export interface MagazineDraftSnapshot {
  headline: string;
  summary: string;
  briefingTitle: string;
  briefingBody: string;
}

export type NewsletterVoicePresetUi = "calm_advisor" | "field_broker" | "yield_focused";

const VOICE_PRESET_OPTIONS: ReadonlyArray<{
  id: NewsletterVoicePresetUi;
  label: string;
}> = [
  { id: "calm_advisor", label: "담백·신뢰형" },
  { id: "field_broker", label: "현장 밀착형" },
  { id: "yield_focused", label: "실속·수익형" },
];

const TONE_STANCE_OPTIONS: ReadonlyArray<{
  id: NewsletterToneStance;
  badge: string;
  label: string;
}> = [
  { id: "positive", badge: "🟢", label: TONE_STANCE_META.positive.label },
  { id: "neutral", badge: "⚖️", label: TONE_STANCE_META.neutral.label },
  { id: "negative", badge: "🟠", label: TONE_STANCE_META.negative.label },
];

export interface MagazineQuickDraftCardProps {
  monthLabel: string;
  /** 발행 주기 (일간·주간·월간) — AI 초안 프롬프트의 기간 표현·분량 기준 */
  cadence?: "daily" | "weekly" | "monthly";
  regionFocus?: string;
  onChangeRegionFocus?: (region: string) => void;
  /** 거래 온도 프리셋 (기본값: 'positive' 긍정적) */
  toneStance?: NewsletterToneStance;
  onChangeToneStance?: (next: NewsletterToneStance) => void;
  /** 선택한 거래 온도에 맞춰 이슈 5선도 즉시 재선별하는 콜백 */
  onReclusterWithTone?: (next: NewsletterToneStance) => void;
  isReclustering?: boolean;
  preferredRegions?: readonly string[];
  preferredChannels?: readonly SpecificNewsChannelId[];
  dealTitles?: string[];
  newsTitles?: string[];
  dealSummaries?: string[];
  newsEvidence?: string[];
  monthlyStatsSummary?: string;
  currentDraft: MagazineDraftSnapshot;
  onApplyDraft: (next: MagazineDraftSnapshot) => void;
}

export function MagazineQuickDraftCard({
  monthLabel,
  cadence,
  regionFocus = "",
  onChangeRegionFocus,
  toneStance,
  onChangeToneStance,
  onReclusterWithTone,
  isReclustering = false,
  preferredRegions = [],
  preferredChannels = [],
  dealTitles = [],
  newsTitles = [],
  dealSummaries = [],
  newsEvidence = [],
  monthlyStatsSummary,
  currentDraft,
  onApplyDraft,
}: MagazineQuickDraftCardProps) {
  const [loading, setLoading] = useState(false);
  const [localRegion, setLocalRegion] = useState(regionFocus);
  const [localTone, setLocalTone] = useState<NewsletterToneStance>("positive");
  const [voicePreset, setVoicePreset] = useState<NewsletterVoicePresetUi>("calm_advisor");
  const effectiveToneStance: NewsletterToneStance = onChangeToneStance
    ? (toneStance ?? "positive")
    : (toneStance ?? localTone);

  const handleToneStanceChange = (next: NewsletterToneStance) => {
    if (onChangeToneStance) {
      onChangeToneStance(next);
    } else {
      setLocalTone(next);
    }
  };
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [recentHeadlines, setRecentHeadlines] = useState<string[]>([]);
  const [attemptSeed, setAttemptSeed] = useState(0);
  const showUndoToast = useSafeShowUndoToast();

  const effectiveRegion = onChangeRegionFocus ? regionFocus : localRegion;

  const handleRegionChange = (value: string) => {
    if (onChangeRegionFocus) {
      onChangeRegionFocus(value);
    } else {
      setLocalRegion(value);
    }
  };

  const handleAiDraft = async () => {
    if (loading) return;
    setLoading(true);
    setErrorMessage(null);

    const previousSnapshot: MagazineDraftSnapshot = {
      headline: currentDraft.headline,
      summary: currentDraft.summary,
      briefingTitle: currentDraft.briefingTitle,
      briefingBody: currentDraft.briefingBody,
    };

    try {
      const res = await fetch("/api/broker/studio/ai-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monthLabel: monthLabel.trim() || "이번 달 뉴스레터",
          ...(cadence ? { cadence } : {}),
          regionFocus: effectiveRegion.trim() || undefined,
          preferredRegions: preferredRegions.length > 0 ? [...preferredRegions] : undefined,
          preferredChannels: preferredChannels.length > 0 ? [...preferredChannels] : undefined,
          dealTitles: dealTitles.filter(Boolean),
          newsTitles: newsTitles.filter(Boolean),
          ...(dealSummaries.length > 0 ? { dealSummaries: dealSummaries.filter(Boolean).slice(0, 6) } : {}),
          ...(newsEvidence.length > 0 ? { newsEvidence: newsEvidence.filter(Boolean).slice(0, 6) } : {}),
          ...(monthlyStatsSummary?.trim() ? { monthlyStatsSummary: monthlyStatsSummary.trim() } : {}),
          voicePreset,
          toneStance: effectiveToneStance,
          currentHeadline: currentDraft.headline.trim() || undefined,
          currentBriefing: currentDraft.briefingBody.trim() || undefined,
          ...(recentHeadlines.length > 0 ? { avoidHeadlines: recentHeadlines, attemptSeed } : {}),
        }),
      });

      const json = (await res.json().catch(() => null)) as
        | { ok: true; result: AiDraftResult; warnings?: string[] }
        | { ok: false; error?: { code?: string; message?: string } }
        | null;

      if (!res.ok || !json || !json.ok || !json.result) {
        const msg =
          (json && !json.ok && json.error?.message) ||
          "AI가 잠시 쉬고 있어요. 잠시 후 다시 눌러 주세요.";
        setErrorMessage(msg);
        editorToast.error(msg);
        return;
      }

      const nextSnapshot: MagazineDraftSnapshot = {
        headline: json.result.headline,
        summary: json.result.summary,
        briefingTitle: json.result.briefingTitle,
        briefingBody: json.result.briefingBody,
      };

      onApplyDraft(nextSnapshot);
      setRecentHeadlines((prev) =>
        Array.from(new Set([...prev, nextSnapshot.headline.trim()].filter(Boolean))).slice(-5),
      );
      setAttemptSeed((prev) => prev + 1);

      showUndoToast({
        message: "AI가 초안을 작성했어요",
        undoAction: () => {
          onApplyDraft(previousSnapshot);
        },
      });
    } catch {
      const msg = "AI가 잠시 쉬고 있어요. 잠시 후 다시 눌러 주세요.";
      setErrorMessage(msg);
      editorToast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section
      data-testid="magazine-quick-draft-card"
      aria-label="AI로 뉴스레터 초안 쓰기"
      className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xs space-y-3.5"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1 min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-blue-700 shrink-0" aria-hidden="true" />
            <h3 className="text-base font-extrabold text-slate-900 break-keep">
              {cadence === "daily"
                ? "오늘 일간 뉴스레터 AI 초안 도우미"
                : cadence === "weekly"
                  ? "이번 주 주간 뉴스레터 AI 초안 도우미"
                  : "이번 달 뉴스레터 AI 초안 도우미"}
            </h3>
          </div>
          <p className="text-sm font-medium text-slate-600 break-keep">
            {cadence === "daily"
              ? "오늘 내 권역·매물에 맞춰 제목·소개 초안을 한 번에 채우며, 실행 후 언제든 되돌릴 수 있습니다."
              : cadence === "weekly"
                ? "이번 주 내 권역·매물에 맞춰 제목·브리핑 초안을 한 번에 채우며, 실행 후 언제든 되돌릴 수 있습니다."
                : "이번 달 내 권역·매물에 맞춰 제목·브리핑 초안을 한 번에 채우며, 실행 후 언제든 되돌릴 수 있습니다."}
          </p>
        </div>

        <button
          type="button"
          data-testid="ai-draft-btn"
          onClick={handleAiDraft}
          disabled={loading}
          aria-busy={loading}
          className="w-full sm:w-auto inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border-2 border-blue-300 bg-blue-50 px-5 py-2.5 text-base font-extrabold text-blue-800 shadow-2xs transition hover:bg-blue-100 disabled:opacity-60 cursor-pointer shrink-0"
        >
          {loading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              <span>AI가 쓰는 중…</span>
            </>
          ) : (
            <>
              <Sparkles className="h-5 w-5" aria-hidden="true" />
              <span>AI로 초안 쓰기</span>
            </>
          )}
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label
            htmlFor="quick-draft-region-focus"
            className="text-sm font-bold text-slate-800"
          >
            이번 호 중점 지역·주제 (선택 사항)
          </label>
          <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-sm font-semibold text-blue-900">
            🤖 AI 초안 참고 지역·주제 (선택 · 비워두면 기본 권역 사용)
          </span>
        </div>
        <div className="relative">
          <input
            id="quick-draft-region-focus"
            type="text"
            value={effectiveRegion}
            onChange={(e) => handleRegionChange(e.target.value)}
            placeholder="예: 강남·서초 역세권 사옥형 빌딩"
            className="w-full min-h-[48px] rounded-xl border border-slate-300 bg-white pl-3.5 pr-12 py-2.5 text-base font-medium text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
          {effectiveRegion.length > 0 && (
            <button
              type="button"
              data-testid="clear-region-focus-btn"
              aria-label="입력 지우기"
              title="입력 지우기"
              onClick={() => handleRegionChange("")}
              className="absolute right-1 top-1/2 -translate-y-1/2 z-10 inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
            >
              <span aria-hidden="true" className="text-lg font-bold leading-none">
                ×
              </span>
            </button>
          )}
        </div>

        <div className="pt-1.5 space-y-2 border-t border-slate-200/80">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="거래 온도 선택">
              <span className="text-sm font-bold text-slate-700 mr-1">거래 온도:</span>
              {TONE_STANCE_OPTIONS.map((opt) => {
                const active = effectiveToneStance === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    data-testid={`ai-draft-tone-${opt.id}`}
                    aria-pressed={active}
                    onClick={() => handleToneStanceChange(opt.id)}
                    className={`min-h-[44px] rounded-xl border px-3 py-1.5 text-sm font-extrabold transition cursor-pointer ${
                      active
                        ? "border-blue-600 bg-blue-50 text-blue-950 shadow-2xs"
                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <span aria-hidden="true" className="mr-1">
                      {opt.badge}
                    </span>
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
            {onReclusterWithTone && (
              <button
                type="button"
                data-testid="ai-recluster-by-tone-btn"
                disabled={isReclustering}
                onClick={() => onReclusterWithTone(effectiveToneStance)}
                className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-extrabold text-slate-800 hover:bg-slate-100 disabled:opacity-60 transition cursor-pointer"
              >
                {isReclustering ? "이슈 재구성 중…" : "이 온도로 이슈 5선 맞추기"}
              </button>
            )}
          </div>
          <p className="text-sm font-medium text-slate-600">
            {TONE_STANCE_META[effectiveToneStance].description}
          </p>
        </div>

        <div className="pt-1 flex flex-wrap items-center gap-1.5" role="group" aria-label="브리핑 말투 선택">
          <span className="text-sm font-bold text-slate-700 mr-1">말투:</span>
          {VOICE_PRESET_OPTIONS.map((opt) => {
            const active = voicePreset === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                data-testid={`ai-draft-voice-${opt.id}`}
                aria-pressed={active}
                onClick={() => setVoicePreset(opt.id)}
                className={`min-h-[44px] rounded-xl border px-3 py-1.5 text-sm font-bold transition cursor-pointer ${
                  active
                    ? "border-blue-600 bg-blue-50 text-blue-950"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {errorMessage && (
        <p role="alert" className="text-sm font-bold text-rose-700">
          {errorMessage}
        </p>
      )}
    </section>
  );
}
