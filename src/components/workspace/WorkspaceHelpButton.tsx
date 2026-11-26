"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BookOpen, HelpCircle, MessageSquareWarning, PlayCircle } from "lucide-react";
import { useSeniorHelp } from "@/components/help/SeniorHelpContext";

export type HelpWorkspaceKey =
  | "home"
  | "dealcards"
  | "im"
  | "magazine"
  | "inbox"
  | "common";

const WORKSPACE_TUTORIAL_TARGETS: Readonly<
  Record<
    HelpWorkspaceKey,
    { moduleId: string; sectionHash: string; chapterLabel: string }
  >
> = {
  home: {
    moduleId: "module-01",
    sectionHash: "module-01",
    chapterLabel: "크리딜 전체 흐름 안내",
  },
  dealcards: {
    moduleId: "module-02",
    sectionHash: "module-02",
    chapterLabel: "딜카드 3단계 안내",
  },
  im: {
    moduleId: "module-04",
    sectionHash: "module-04",
    chapterLabel: "IM 제안서 3단계 안내",
  },
  magazine: {
    moduleId: "module-07",
    sectionHash: "module-07",
    chapterLabel: "부동산뉴스 3단계 안내",
  },
  inbox: {
    moduleId: "module-08",
    sectionHash: "module-08",
    chapterLabel: "고객 소통 3단계 안내",
  },
  common: {
    moduleId: "module-00",
    sectionHash: "module-00",
    chapterLabel: "핵심 사용 안내 전체 보기",
  },
};

export interface WorkspaceHelpButtonProps {
  workspace?: HelpWorkspaceKey;
  className?: string;
}

/**
 * 상단바 및 홈 헤더 상시 배치 `❓ 사용법` 버튼 (WP 4-A).
 * 클릭 시 20초 사용법 서랍, 10초 불편 제보, 해당 기능 설명서 장 링크를 제공한다.
 */
export function WorkspaceHelpButton({
  workspace = "common",
  className = "",
}: WorkspaceHelpButtonProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { openHelpDrawer } = useSeniorHelp();
  const target = WORKSPACE_TUTORIAL_TARGETS[workspace] ?? WORKSPACE_TUTORIAL_TARGETS.common;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (evt: MouseEvent | TouchEvent) => {
      const node = rootRef.current;
      if (node && !node.contains(evt.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (evt: KeyboardEvent) => {
      if (evt.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`relative inline-block ${className}`}>
      <button
        type="button"
        data-testid="workspace-help-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 min-h-[44px] rounded-xl ios-glass-pill bg-white/88 hover:bg-white border border-slate-900/[0.10] text-sm sm:text-base font-semibold text-[#1D1D1F] transition-colors cursor-pointer whitespace-nowrap shrink-0"
      >
        <HelpCircle className="h-4 w-4 text-[#515154] shrink-0" aria-hidden="true" />
        <span>사용법</span>
      </button>

      {open && (
        <div
          role="menu"
          data-testid="workspace-help-menu"
          aria-label="사용법 및 도움말 메뉴"
          className="absolute right-0 top-full mt-2 w-60 max-w-[calc(100vw-24px)] sm:w-60 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-lg z-50 space-y-0.5 text-[#1D1D1F]"
        >
          <button
            type="button"
            role="menuitem"
            data-testid="workspace-help-20s-btn"
            onClick={() => {
              setOpen(false);
              openHelpDrawer(target.moduleId);
            }}
            className="w-full min-h-[44px] flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-[#1D1D1F] hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <PlayCircle className="h-4 w-4 text-[#1D4ED8] shrink-0" aria-hidden="true" />
            <span>20초 사용법 보기</span>
          </button>

          <button
            type="button"
            role="menuitem"
            data-testid="workspace-help-feedback-btn"
            onClick={() => {
              setOpen(false);
              if (typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("credeal:open-feedback"));
              }
            }}
            className="w-full min-h-[44px] flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-[#1D1D1F] hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <MessageSquareWarning className="h-4 w-4 text-[#515154] shrink-0" aria-hidden="true" />
            <span>불편 · 오류 제보</span>
          </button>

          <Link
            href={`/broker/tutorial#${target.sectionHash}`}
            role="menuitem"
            data-testid="workspace-help-tutorial-link"
            onClick={() => setOpen(false)}
            className="w-full min-h-[44px] flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-[#1D4ED8] hover:bg-slate-100 transition-colors"
          >
            <BookOpen className="h-4 w-4 text-[#1D4ED8] shrink-0" aria-hidden="true" />
            <span>{target.chapterLabel}</span>
          </Link>
        </div>
      )}
    </div>
  );
}
