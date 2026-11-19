"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
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
    chapterLabel: "홈 화면 4대 작업실 안내",
  },
  dealcards: {
    moduleId: "module-02",
    sectionHash: "module-02",
    chapterLabel: "1분 딜카드 작성법",
  },
  im: {
    moduleId: "module-04",
    sectionHash: "module-04",
    chapterLabel: "IM · PPTX 제작법",
  },
  magazine: {
    moduleId: "module-07",
    sectionHash: "module-07",
    chapterLabel: "주간·월간 뉴스레터 발행법",
  },
  inbox: {
    moduleId: "module-08",
    sectionHash: "module-08",
    chapterLabel: "고객 소통함 · 발송법",
  },
  common: {
    moduleId: "module-00",
    sectionHash: "module-00",
    chapterLabel: "전체 사용 설명서",
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
        className="inline-flex items-center justify-center gap-1 px-3 py-1.5 min-h-[44px] rounded-xl ios-glass-pill bg-white/88 hover:bg-white border border-slate-900/[0.12] text-sm sm:text-base font-bold text-[#1D1D1F] shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_1px_2px_rgba(15,23,42,0.06)] transition-all cursor-pointer whitespace-nowrap shrink-0"
      >
        <span aria-hidden="true">❓</span>
        <span>사용법</span>
      </button>

      {open && (
        <div
          role="menu"
          data-testid="workspace-help-menu"
          aria-label="사용법 및 도움말 메뉴"
          className="absolute right-0 top-full mt-2 w-64 rounded-2xl border border-slate-300 bg-white p-2 shadow-xl z-50 space-y-1 text-slate-900"
        >
          <button
            type="button"
            role="menuitem"
            data-testid="workspace-help-20s-btn"
            onClick={() => {
              setOpen(false);
              openHelpDrawer(target.moduleId);
            }}
            className="w-full min-h-[44px] flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-bold text-slate-900 hover:bg-blue-50 hover:text-blue-900 transition-colors cursor-pointer"
          >
            <span aria-hidden="true">🎬</span>
            <span>20초 사용법 바로 보기</span>
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
            className="w-full min-h-[44px] flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-bold text-slate-900 hover:bg-amber-50 hover:text-amber-950 transition-colors cursor-pointer"
          >
            <span aria-hidden="true">🛠️</span>
            <span>10초 불편 · 오류 제보</span>
          </button>

          <Link
            href={`/broker/tutorial#${target.sectionHash}`}
            role="menuitem"
            data-testid="workspace-help-tutorial-link"
            onClick={() => setOpen(false)}
            className="w-full min-h-[44px] flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-bold text-blue-800 hover:bg-blue-50 transition-colors"
          >
            <span aria-hidden="true">📖</span>
            <span>{target.chapterLabel}</span>
          </Link>
        </div>
      )}
    </div>
  );
}
