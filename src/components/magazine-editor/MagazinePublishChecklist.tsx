"use client";

import React from "react";
import { AlertCircle } from "lucide-react";

export interface PublishReadinessInput {
  headline: string;
  briefingBody?: string;
  dealCount?: number;
  newsCount?: number;
  briefingEnabled?: boolean;
  dealsEnabled?: boolean;
  newsEnabled?: boolean;
  onJumpToStep?: (step: "title" | "content" | "send") => void;
}

/**
 * NL-17: 5항목 장문 체크리스트 박스를 상시 노출하지 않고,
 * 미완료 항목이 있을 때만 가장 먼저 채워야 할 1줄 안내 문구를 반환한다.
 * 꺼져 있는 코너는 미완료로 취급하지 않으며, 모두 준비되었으면 null을 반환한다.
 */
export function getNextPublishHint(input: PublishReadinessInput): {
  message: string;
  targetStep: "title" | "content";
} | null {
  if (!input.headline || input.headline.trim().length === 0) {
    return {
      message: "표지 제목을 입력하면 바로 보낼 수 있어요",
      targetStep: "title",
    };
  }

  const briefingOn = input.briefingEnabled !== false;
  const dealsOn = input.dealsEnabled !== false;
  const newsOn = input.newsEnabled !== false;

  if (!briefingOn && !dealsOn && !newsOn) {
    return {
      message: "포함할 코너를 1개 이상 켜면 바로 보낼 수 있어요",
      targetStep: "content",
    };
  }

  const hasBriefing = briefingOn && Boolean(input.briefingBody && input.briefingBody.trim().length > 0);
  const hasDeals = dealsOn && (input.dealCount ?? 0) > 0;
  const hasNews = newsOn && (input.newsCount ?? 0) > 0;

  if (!hasBriefing && !hasDeals && !hasNews) {
    if (!briefingOn && dealsOn && !newsOn) {
      return {
        message: "추천 매물을 1건 이상 선택하면 바로 보낼 수 있어요",
        targetStep: "content",
      };
    }
    if (briefingOn && !dealsOn && !newsOn) {
      return {
        message: "시장 브리핑 글을 입력하면 바로 보낼 수 있어요",
        targetStep: "content",
      };
    }
    if (!briefingOn && !dealsOn && newsOn) {
      return {
        message: "핵심 시장 이슈를 1건 이상 채우면 바로 보낼 수 있어요",
        targetStep: "content",
      };
    }
    return {
      message: "시장 브리핑 글이나 추천 매물을 1건 이상 채우면 바로 보낼 수 있어요",
      targetStep: "content",
    };
  }

  return null;
}

export function MagazinePublishChecklist(props: PublishReadinessInput) {
  const hint = getNextPublishHint(props);

  if (!hint) {
    return null;
  }

  return (
    <div
      data-testid="magazine-publish-checklist"
      role="status"
      className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-2xs flex flex-wrap items-center justify-between gap-3"
    >
      <div className="flex items-start gap-2 min-w-0 flex-1">
        <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-sm font-bold text-slate-900 break-keep leading-snug">
          {hint.message}
        </p>
      </div>

      {props.onJumpToStep && (
        <button
          type="button"
          onClick={() => props.onJumpToStep?.(hint.targetStep)}
          className="shrink-0 min-h-[48px] rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-sm font-extrabold text-slate-900 hover:bg-slate-100"
        >
          바로 입력하기
        </button>
      )}
    </div>
  );
}
