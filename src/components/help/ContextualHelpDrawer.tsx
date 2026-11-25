"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BROKER_GLOSSARY_LIST } from "@/lib/tutorial/broker-tutorial-data";
import {
  MINIMAL_ESSENTIAL_FAQS,
  MINIMAL_SPACE_GUIDES,
  resolveMinimalSpaceGuide,
} from "@/lib/tutorial/minimal-guide-data";
import { useSeniorHelp } from "./SeniorHelpContext";

export function ContextualHelpDrawer() {
  const pathname = usePathname();
  const { isDrawerOpen, activeModuleId, closeHelpDrawer } = useSeniorHelp();
  const [selectedGuideId, setSelectedGuideId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"steps" | "faq" | "glossary">("steps");

  useEffect(() => {
    setSelectedGuideId(null);
    setActiveTab("steps");
  }, [pathname, activeModuleId]);

  useEffect(() => {
    if (!isDrawerOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeHelpDrawer();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [isDrawerOpen, closeHelpDrawer]);

  if (!isDrawerOpen) return null;

  const currentGuide = resolveMinimalSpaceGuide(
    pathname,
    selectedGuideId || activeModuleId,
  );

  return (
    <div
      className="fixed inset-0 z-[9998] flex justify-end bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={closeHelpDrawer}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="현재 화면 빠른 안내 서랍"
        data-testid="contextual-help-drawer"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl h-full bg-[#F5F5F7] text-[#1D1D1F] shadow-2xl border-l border-slate-200 flex flex-col overflow-hidden"
      >
        {/* Top Drawer Header */}
        <div className="px-5 py-4 bg-white border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <div>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-slate-100 text-[#515154] border border-slate-200 text-sm font-bold">
              빠른 안내 · {currentGuide.roleTag}
            </span>
            <h2 className="text-lg sm:text-xl font-extrabold text-[#1D1D1F] mt-1 leading-snug">
              {currentGuide.name} 3단계 사용법
            </h2>
          </div>
          <button
            type="button"
            onClick={closeHelpDrawer}
            data-testid="close-contextual-help-drawer"
            className="px-4 py-2 min-h-[44px] rounded-xl bg-slate-100 hover:bg-slate-200 text-[#1D1D1F] border border-slate-200 text-base font-bold shrink-0 cursor-pointer"
          >
            ✕ 닫기
          </button>
        </div>

        {/* Space Switcher & Sub-tabs */}
        <div className="px-5 py-3 bg-white border-b border-slate-200 space-y-2.5 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="drawer-module-select" className="text-sm font-bold text-[#515154] shrink-0">
              공간 선택
            </label>
            <select
              id="drawer-module-select"
              value={currentGuide.anchorId}
              onChange={(e) => {
                setSelectedGuideId(e.target.value);
                setActiveTab("steps");
              }}
              className="flex-1 rounded-xl border border-slate-300 bg-slate-50 px-3 py-1.5 min-h-[44px] text-[max(16px,1rem)] font-bold text-[#1D1D1F]"
            >
              {MINIMAL_SPACE_GUIDES.map((g) => (
                <option key={g.id} value={g.anchorId}>
                  {g.order}. {g.name} ({g.roleTag})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setActiveTab("steps")}
              className={`py-2 px-2 min-h-[44px] rounded-lg text-sm font-bold transition-colors cursor-pointer ${
                activeTab === "steps"
                  ? "bg-[#1D4ED8] text-white shadow-2xs"
                  : "text-[#3A3A3C] hover:bg-white"
              }`}
            >
              핵심 3단계
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("faq")}
              className={`py-2 px-2 min-h-[44px] rounded-lg text-sm font-bold transition-colors cursor-pointer ${
                activeTab === "faq"
                  ? "bg-[#1D4ED8] text-white shadow-2xs"
                  : "text-[#3A3A3C] hover:bg-white"
              }`}
            >
              자주 묻는 질문
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("glossary")}
              className={`py-2 px-2 min-h-[44px] rounded-lg text-sm font-bold transition-colors cursor-pointer ${
                activeTab === "glossary"
                  ? "bg-[#1D4ED8] text-white shadow-2xs"
                  : "text-[#3A3A3C] hover:bg-white"
              }`}
            >
              용어 안내
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {activeTab === "steps" && (
            <>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2 shadow-2xs">
                <p className="text-base font-extrabold text-[#1D1D1F]">
                  {currentGuide.name}의 역할
                </p>
                <p className="text-base font-medium text-[#3A3A3C] leading-relaxed break-keep">
                  {currentGuide.oneLiner}
                </p>
              </div>

              <div className="space-y-3">
                {currentGuide.steps.map((stepText, idx) => (
                  <div
                    key={idx}
                    className="rounded-2xl border border-slate-200 bg-white p-4 flex items-start gap-3 shadow-2xs"
                  >
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#1D1D1F] text-white text-sm font-bold shrink-0">
                      {idx + 1}
                    </span>
                    <p className="text-base font-medium text-[#1D1D1F] leading-relaxed break-keep">
                      {stepText}
                    </p>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-[#515154] leading-relaxed break-keep">
                핵심 팁: {currentGuide.keyTip}
              </div>
            </>
          )}

          {activeTab === "faq" && (
            <div className="space-y-3">
              <p className="text-sm font-bold text-[#515154]">
                자주 묻는 핵심 질문 5선입니다.
              </p>
              {MINIMAL_ESSENTIAL_FAQS.map((faq, idx) => (
                <div
                  key={idx}
                  className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2 shadow-2xs"
                >
                  <p className="text-base font-extrabold text-[#1D1D1F] leading-snug break-keep">
                    Q{idx + 1}. {faq.q}
                  </p>
                  <p className="text-base text-[#3A3A3C] leading-relaxed break-keep">{faq.a}</p>
                </div>
              ))}
            </div>
          )}

          {activeTab === "glossary" && (
            <div className="space-y-3">
              <p className="text-sm font-bold text-[#515154]">
                어려운 영어·부동산 용어를 쉽게 풀었습니다.
              </p>
              {BROKER_GLOSSARY_LIST.map((item) => (
                <div
                  key={item.term}
                  className="rounded-2xl border border-slate-200 bg-white p-4 space-y-1.5 shadow-2xs"
                >
                  <p className="text-base font-extrabold text-[#1D1D1F]">{item.term}</p>
                  <p className="text-base text-[#3A3A3C] font-medium leading-relaxed">
                    {item.easyMeaning}
                  </p>
                  <p className="text-sm text-[#515154] font-semibold">
                    나오는 곳: {item.whereUsed}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Link to Full Manual */}
        <div className="px-5 py-3.5 bg-white border-t border-slate-200 flex items-center justify-end gap-2 shrink-0">
          <Link
            href="/broker/tutorial"
            onClick={closeHelpDrawer}
            className="inline-flex min-h-[44px] items-center rounded-xl bg-[#1D4ED8] hover:bg-[#1E40AF] px-4 py-2 text-sm font-bold text-white transition-colors"
          >
            핵심 사용 안내 전체 보기 →
          </Link>
        </div>
      </aside>
    </div>
  );
}
