"use client";

import React, { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { useUndoToast, type UndoToastInput } from "@/components/workspace/UndoConfirmToast";
import { editorToast } from "@/components/magazine-editor/editor-toaster";
import type { AiDraftResult } from "@/app/api/broker/studio/ai-draft/route";
import type { SpecificNewsChannelId } from "@/domain/magazine/news-channels";

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

export interface MagazineQuickDraftCardProps {
  monthLabel: string;
  /** 발행 주기 (일간·주간·월간) — AI 초안 프롬프트의 기간 표현·분량 기준 */
  cadence?: "daily" | "weekly" | "monthly";
  regionFocus?: string;
  onChangeRegionFocus?: (region: string) => void;
  preferredRegions?: readonly string[];
  preferredChannels?: readonly SpecificNewsChannelId[];
  dealTitles?: string[];
  newsTitles?: string[];
  currentDraft: MagazineDraftSnapshot;
  onApplyDraft: (next: MagazineDraftSnapshot) => void;
}

export function MagazineQuickDraftCard({
  monthLabel,
  cadence,
  regionFocus = "",
  onChangeRegionFocus,
  preferredRegions = [],
  preferredChannels = [],
  dealTitles = [],
  newsTitles = [],
  currentDraft,
  onApplyDraft,
}: MagazineQuickDraftCardProps) {
  const [loading, setLoading] = useState(false);
  const [localRegion, setLocalRegion] = useState(regionFocus);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
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
          currentHeadline: currentDraft.headline.trim() || undefined,
          currentBriefing: currentDraft.briefingBody.trim() || undefined,
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
      className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xs space-y-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-blue-700" aria-hidden="true" />
            <h3 className="text-base font-extrabold text-slate-900">
              {cadence === "daily"
                ? "AI로 오늘 일간 뉴스레터 초안 빠르게 잡기"
                : cadence === "weekly"
                  ? "AI로 이번 주 주간 뉴스레터 초안 빠르게 잡기"
                  : "AI로 이번 달 뉴스레터 초안 빠르게 잡기"}
            </h3>
          </div>
          <p className="text-sm font-medium text-slate-600">
            {cadence === "daily"
              ? "선택한 발행일과 내 주력 권역·관심 분야, 추천 매물 제목을 바탕으로 오늘의 표지 제목·한 줄 소개·요약 초안을 작성합니다."
              : cadence === "weekly"
                ? "선택한 발행 주와 내 주력 권역·관심 분야, 추천 매물 제목을 바탕으로 이번 주 표지 제목·한 줄 소개·시장 브리핑 초안을 작성합니다."
                : "선택한 연·월과 내 주력 권역·관심 분야, 추천 매물 제목을 바탕으로 표지 제목·한 줄 소개·시장 브리핑 초안을 함께 작성합니다."}
          </p>
        </div>

        <button
          type="button"
          data-testid="ai-draft-btn"
          onClick={handleAiDraft}
          disabled={loading}
          aria-busy={loading}
          className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-2.5 text-base font-extrabold text-white shadow-xs transition hover:bg-blue-800 disabled:opacity-60"
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
        <div>
          <label
            htmlFor="quick-draft-region-focus"
            className="block text-sm font-bold text-slate-700 mb-1"
          >
            이번 호 중점 지역·주제 (선택 사항)
          </label>
          <input
            id="quick-draft-region-focus"
            type="text"
            value={effectiveRegion}
            onChange={(e) => handleRegionChange(e.target.value)}
            placeholder="예: 강남·서초 역세권 사옥형 빌딩"
            className="w-full min-h-[48px] rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base font-medium text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm font-medium text-slate-700">
          기존에 적은 글이 있어도 걱정하지 마세요. 실행 후 아래 알림의 <strong>되돌리기</strong>를 누르면 원래 글로 바로 돌아갑니다.
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
