"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BROKER_TUTORIAL_MODULES,
  BROKER_FAQ_LIST,
  BROKER_GLOSSARY_LIST,
  type TutorialModule,
} from "@/lib/tutorial/broker-tutorial-data";
import { useSeniorHelp } from "./SeniorHelpContext";

function resolveModuleForPathname(pathname: string, overrideId: string | null): TutorialModule {
  if (overrideId) {
    const found = BROKER_TUTORIAL_MODULES.find((m) => m.id === overrideId);
    if (found) return found;
  }

  if (pathname === "/broker") {
    return BROKER_TUTORIAL_MODULES.find((m) => m.id === "module-01") || BROKER_TUTORIAL_MODULES[0];
  }
  if (pathname.startsWith("/broker/deal-card/new")) {
    return BROKER_TUTORIAL_MODULES.find((m) => m.id === "module-02") || BROKER_TUTORIAL_MODULES[0];
  }
  if (pathname.startsWith("/broker/deal-card/")) {
    return BROKER_TUTORIAL_MODULES.find((m) => m.id === "module-03") || BROKER_TUTORIAL_MODULES[0];
  }
  if (pathname.startsWith("/broker/basic-im-studio") || pathname.includes("/im-lite")) {
    return BROKER_TUTORIAL_MODULES.find((m) => m.id === "module-05") || BROKER_TUTORIAL_MODULES[0];
  }
  if (pathname.startsWith("/broker/buildings")) {
    return BROKER_TUTORIAL_MODULES.find((m) => m.id === "module-06") || BROKER_TUTORIAL_MODULES[0];
  }
  if (pathname.startsWith("/broker/magazine-editor")) {
    return BROKER_TUTORIAL_MODULES.find((m) => m.id === "module-07") || BROKER_TUTORIAL_MODULES[0];
  }
  if (pathname.startsWith("/broker/clients") || pathname.startsWith("/broker/inbox")) {
    return BROKER_TUTORIAL_MODULES.find((m) => m.id === "module-08") || BROKER_TUTORIAL_MODULES[0];
  }
  if (pathname.startsWith("/broker/profile")) {
    return BROKER_TUTORIAL_MODULES.find((m) => m.id === "module-09") || BROKER_TUTORIAL_MODULES[0];
  }

  return BROKER_TUTORIAL_MODULES[0];
}

/**
 * 화면 이동 없이 현재 작업 화면 위에서 바로 열리는 '이 화면 20초 따라하기' 슬라이드 서랍 (Tier 3)
 * - 현재 URL(pathname)을 자동 감지하여 해당 단원의 동영상·빨간번호 캡처·자주 묻는 질문을 표시합니다.
 */
export function ContextualHelpDrawer() {
  const pathname = usePathname();
  const { isDrawerOpen, activeModuleId, closeHelpDrawer } = useSeniorHelp();
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"steps" | "faq" | "glossary">("steps");

  useEffect(() => {
    setSelectedModuleId(null);
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

  const currentModule = resolveModuleForPathname(pathname, selectedModuleId || activeModuleId);

  return (
    <div
      className="fixed inset-0 z-[9998] flex justify-end bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={closeHelpDrawer}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="현재 화면 20초 사용법 도우미"
        data-testid="contextual-help-drawer"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl h-full bg-[#F3F2EE] text-[#0F172A] shadow-2xl border-l-2 border-slate-300 flex flex-col overflow-hidden"
      >
        {/* Top Drawer Header */}
        <div className="px-5 py-4 bg-white border-b border-slate-300 flex items-center justify-between gap-3 shrink-0">
          <div>
            <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-blue-100 text-blue-900 border border-blue-300 text-[13px] font-extrabold">
              🎬 화면 이동 없이 바로 보는 20초 도우미 ({currentModule.moduleNumber})
            </span>
            <h2 className="text-[19px] sm:text-[21px] font-black text-slate-900 mt-1 leading-snug">
              {currentModule.shortTitle}
            </h2>
          </div>
          <button
            type="button"
            onClick={closeHelpDrawer}
            data-testid="close-contextual-help-drawer"
            className="px-4 py-2 min-h-[42px] rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-900 border border-slate-300 text-[15px] font-extrabold shrink-0 cursor-pointer"
          >
            ✕ 닫기
          </button>
        </div>

        {/* Module Switcher Pills & Sub-tabs */}
        <div className="px-5 py-3 bg-white/90 border-b border-slate-200 space-y-2.5 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="drawer-module-select" className="text-[13px] font-extrabold text-slate-700 shrink-0">
              다른 기능 설명 보기:
            </label>
            <select
              id="drawer-module-select"
              value={currentModule.id}
              onChange={(e) => {
                setSelectedModuleId(e.target.value);
                setActiveTab("steps");
              }}
              className="flex-1 rounded-xl border border-slate-300 bg-slate-50 px-3 py-1.5 text-[14px] font-extrabold text-slate-900"
            >
              {BROKER_TUTORIAL_MODULES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.shortTitle} ({m.duration})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setActiveTab("steps")}
              className={`py-2 px-2 rounded-lg text-[14px] font-extrabold transition-colors cursor-pointer ${
                activeTab === "steps"
                  ? "bg-blue-700 text-white shadow-2xs"
                  : "text-slate-700 hover:bg-white"
              }`}
            >
              📸 단계별 사진·영상
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("faq")}
              className={`py-2 px-2 rounded-lg text-[14px] font-extrabold transition-colors cursor-pointer ${
                activeTab === "faq"
                  ? "bg-blue-700 text-white shadow-2xs"
                  : "text-slate-700 hover:bg-white"
              }`}
            >
              ❓ 자주 묻는 질문
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("glossary")}
              className={`py-2 px-2 rounded-lg text-[14px] font-extrabold transition-colors cursor-pointer ${
                activeTab === "glossary"
                  ? "bg-blue-700 text-white shadow-2xs"
                  : "text-slate-700 hover:bg-white"
              }`}
            >
              📖 쉬운 용어사전
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
          {activeTab === "steps" && (
            <>
              {/* Summary Box */}
              <div className="rounded-2xl border-2 border-blue-300 bg-white p-4 space-y-2 shadow-2xs">
                <p className="text-[15px] font-black text-blue-950">
                  📌 이 화면 3줄 핵심 요약 ({currentModule.duration})
                </p>
                <ul className="space-y-1.5 text-[15px] text-slate-800 font-medium leading-relaxed">
                  {currentModule.summaryPoints.map((pt, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-blue-700 font-black">•</span>
                      <span>{pt}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* 20-Sec Follow-Along Video */}
              {currentModule.videoUrl && (
                <div className="rounded-2xl border border-slate-300 bg-white p-4 space-y-2 shadow-2xs">
                  <p className="text-[15px] font-extrabold text-slate-900">
                    {currentModule.videoTitle}
                  </p>
                  <video
                    key={currentModule.videoUrl}
                    src={currentModule.videoUrl}
                    controls
                    playsInline
                    preload="metadata"
                    className="w-full rounded-xl border border-slate-200 bg-slate-950"
                  />
                </div>
              )}

              {/* Step-by-Step Cards */}
              <div className="space-y-4">
                {currentModule.steps.map((step) => (
                  <div
                    key={step.id}
                    className="rounded-2xl border border-slate-300 bg-white p-4 sm:p-5 space-y-3 shadow-2xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="px-3 py-1 rounded-full bg-blue-700 text-white text-[13px] font-black">
                        {step.stepNumber}
                      </span>
                      <h3 className="text-[17px] font-black text-slate-900 leading-snug">
                        {step.title}
                      </h3>
                    </div>

                    {step.imageUrl && (
                      <div className="space-y-1.5">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={step.imageUrl}
                          alt={step.imageCaption}
                          className="w-full rounded-xl border border-slate-300"
                        />
                        <p className="text-[13px] text-slate-600 font-semibold">
                          ▲ {step.imageCaption}
                        </p>
                      </div>
                    )}

                    <div className="space-y-2 text-[15px] leading-relaxed">
                      <div className="rounded-xl bg-blue-50/80 border border-blue-200 p-3">
                        <span className="font-black text-blue-950">👆 어디를 누르나요?: </span>
                        <span className="text-slate-900 font-semibold">{step.whereToClick}</span>
                      </div>
                      <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                        <span className="font-black text-slate-900">✨ 어떻게 바뀌나요?: </span>
                        <span className="text-slate-800">{step.whatChanges}</span>
                      </div>
                      {step.commonMistake && (
                        <div className="rounded-xl bg-amber-50 border border-amber-300 p-3 text-amber-950">
                          <span className="font-black">⚠️ 자주 하는 실수: </span>
                          <span>{step.commonMistake}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {activeTab === "faq" && (
            <div className="space-y-3">
              <p className="text-[15px] font-extrabold text-slate-700">
                대표님들이 현장에서 가장 자주 물어보시는 질문과 10초 해결법입니다.
              </p>
              {BROKER_FAQ_LIST.slice(0, 12).map((faq) => (
                <div
                  key={faq.qNumber}
                  className="rounded-2xl border border-slate-300 bg-white p-4 space-y-2 shadow-2xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-md bg-amber-100 text-amber-950 border border-amber-300 text-[12px] font-black">
                      {faq.qNumber} · {faq.category}
                    </span>
                  </div>
                  <p className="text-[16px] font-black text-slate-900 leading-snug">
                    Q. {faq.question}
                  </p>
                  <p className="text-[15px] text-slate-800 leading-relaxed">{faq.answer}</p>
                  <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-2.5 text-[14px] text-emerald-950 font-bold">
                    👉 바로 해결: {faq.actionTip}
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === "glossary" && (
            <div className="space-y-3">
              <p className="text-[15px] font-extrabold text-slate-700">
                어려운 영어·부동산 용어를 60대 대표님 눈높이에 맞춰 쉽게 풀었습니다.
              </p>
              {BROKER_GLOSSARY_LIST.map((item) => (
                <div
                  key={item.term}
                  className="rounded-2xl border border-slate-300 bg-white p-4 space-y-1.5 shadow-2xs"
                >
                  <p className="text-[16px] font-black text-blue-950">{item.term}</p>
                  <p className="text-[15px] text-slate-900 font-medium leading-relaxed">
                    {item.easyMeaning}
                  </p>
                  <p className="text-[13px] text-slate-600 font-semibold">
                    📍 나오는 곳: {item.whereUsed}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Link to Full Manual */}
        <div className="px-5 py-3.5 bg-white border-t border-slate-300 flex items-center justify-between gap-2 shrink-0">
          <Link
            href="/broker/tutorial"
            onClick={closeHelpDrawer}
            className="text-[14px] font-extrabold text-blue-700 hover:underline"
          >
            📖 전체 큰글씨 설명서 · 인쇄 화면으로 이동 →
          </Link>
          <a
            href="/tutorials/CREDEAL_60대_중개인_큰글씨_매뉴얼.pdf"
            download="CREDEAL_60대_중개인_큰글씨_매뉴얼.pdf"
            className="px-3.5 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-[13px] font-extrabold"
          >
            📥 PDF 매뉴얼 받기
          </a>
        </div>
      </aside>
    </div>
  );
}
