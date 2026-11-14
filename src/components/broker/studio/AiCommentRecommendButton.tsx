"use client";

import React, { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { useUndoToast, type UndoToastInput } from "@/components/workspace/UndoConfirmToast";
import { editorToast } from "@/components/magazine-editor/editor-toaster";
import { AI_COMMENT_WARNING_INPUT_NOT_IN_CONTEXT } from "@/lib/magazine/ai-comment-schema";

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

export interface AiCommentRecommendButtonProps {
  /** 현재 작성된 추천글/코멘트 또는 초안 */
  currentValue: string;
  /** 매물 정보 또는 보조 맥락 텍스트 (비어 있거나 다듬기 참고용일 때 활용) */
  fallbackContext?: string;
  /** 생성된 추천글 반영 콜백 */
  onChangeValue: (nextValue: string) => void;
  /** 생성 모드 (deal_comment: 매물 한줄평 / market_briefing: 5줄·500자 시장 브리핑 윤문) */
  mode?: "deal_comment" | "market_briefing";
  /** 발행 주기 (market_briefing 윤문 시 기간 표현 일관성 유지) */
  cadence?: "daily" | "weekly" | "monthly";
  /** 버튼 라벨 (기본: "AI로 추천글 쓰기") */
  label?: string;
  /** 접근성 구분 라벨 */
  ariaLabel?: string;
  /** 테스트 식별자 (기본: "ai-comment-recommend-btn") */
  testId?: string;
}

export function AiCommentRecommendButton({
  currentValue,
  fallbackContext = "",
  onChangeValue,
  mode = "deal_comment",
  cadence,
  label = "AI로 추천글 쓰기",
  ariaLabel,
  testId = "ai-comment-recommend-btn",
}: AiCommentRecommendButtonProps) {
  const [loading, setLoading] = useState(false);
  const showUndoToast = useSafeShowUndoToast();

  const handleRecommend = async () => {
    if (loading) return;
    const trimmedDraft = currentValue.trim();
    const trimmedFallback = fallbackContext.trim();
    const seed =
      mode === "market_briefing"
        ? [trimmedDraft, trimmedFallback].filter(Boolean).join("\n")
        : trimmedDraft || trimmedFallback;
    if (!seed) {
      editorToast.error(
        mode === "market_briefing"
          ? "먼저 1~3줄 정도 짧은 시장 생각을 적거나 제목·이슈를 채워 주세요."
          : "먼저 매물을 선택하거나 짧은 메모를 한 줄 적어 주세요.",
      );
      return;
    }

    const previousValue = currentValue;
    setLoading(true);

    try {
      const res = await fetch("/api/broker/studio/ai-comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          comment: seed,
          mode,
          ...(mode === "market_briefing" && trimmedDraft ? { draftText: trimmedDraft } : {}),
          ...(cadence ? { cadence } : {}),
        }),
      });

      const json = (await res.json().catch(() => null)) as
        | { ok: true; result?: { comment?: string }; warnings?: string[] }
        | { ok: false; error?: { message?: string } }
        | null;

      if (!res.ok || !json || !json.ok || !json.result?.comment) {
        const msg =
          (json && !json.ok && json.error?.message) ||
          "AI가 잠시 쉬고 있어요. 잠시 후 다시 눌러 주세요.";
        editorToast.error(msg);
        return;
      }

      const nextText = json.result.comment.trim();
      onChangeValue(nextText);

      if (
        Array.isArray(json.warnings) &&
        json.warnings.includes(AI_COMMENT_WARNING_INPUT_NOT_IN_CONTEXT)
      ) {
        editorToast.info("입력에 없던 숫자가 포함되었는지 발행 전에 한 번 확인해 주세요.");
      }

      showUndoToast({
        message: mode === "market_briefing" ? "AI가 시장 브리핑을 다듬었어요" : "AI가 추천글을 작성했어요",
        undoAction: () => {
          onChangeValue(previousValue);
        },
      });
    } catch {
      editorToast.error("AI가 잠시 쉬고 있어요. 잠시 후 다시 눌러 주세요.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      data-testid={testId}
      onClick={handleRecommend}
      disabled={loading}
      aria-busy={loading}
      aria-label={ariaLabel ?? label}
      className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-extrabold text-blue-900 transition hover:bg-blue-100 disabled:opacity-60"
    >
      {loading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          <span>AI가 쓰는 중…</span>
        </>
      ) : (
        <>
          <Sparkles className="h-4 w-4 text-blue-700" aria-hidden="true" />
          <span>{label}</span>
        </>
      )}
    </button>
  );
}
