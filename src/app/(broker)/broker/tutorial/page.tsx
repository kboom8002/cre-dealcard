"use client";

import React, { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { SOTA_SPRING, StaggerContainer, StaggerItem } from "@/components/motion/sota-motion";
import BrokerBottomNav from "@/components/layout/BrokerBottomNav";
import {
  BROKER_TUTORIAL_MODULES,
  BROKER_FAQ_LIST,
  BROKER_GLOSSARY_LIST,
  POSTURE_GUIDE_ROWS,
  BROKER_MESSAGE_TEMPLATES,
  BROKER_USAGE_CHECKLIST_GROUPS,
  BROKER_FEEDBACK_SCENARIOS,
  BROKER_FEEDBACK_SYSTEM_GUIDE,
} from "@/lib/tutorial/broker-tutorial-data";

const ALL_CHECKLIST_IDS = BROKER_USAGE_CHECKLIST_GROUPS.flatMap((g) => g.items.map((item) => item.id));

function BrokerTutorialInner() {
  const searchParams = useSearchParams();
  const isPrintMode = searchParams.get("print") === "1";

  const [selectedModuleId, setSelectedModuleId] = useState<string>("all");
  const [extraLargeText, setExtraLargeText] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);

  const toggleChecklistItem = (id: string) => {
    setCheckedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleCopyText = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => {
        setCopiedId((prev) => (prev === id ? null : prev));
      }, 2500);
    } catch {
      // ignore clipboard error
    }
  };

  const visibleModules =
    isPrintMode || selectedModuleId === "all"
      ? BROKER_TUTORIAL_MODULES
      : BROKER_TUTORIAL_MODULES.filter((m) => m.id === selectedModuleId);

  const bodyTextClass = extraLargeText
    ? "text-[19px] leading-[1.8]"
    : "text-[17px] leading-[1.7]";

  return (
    <>
      <main
        data-testid="broker-tutorial-page"
        className={`flex flex-col items-center min-h-screen px-4 py-8 pb-28 ${bodyTextClass}`}
      >
        <StaggerContainer className="w-full max-w-5xl mx-auto space-y-8">
          {/* ── 상단 타이틀 & 큰글씨/인쇄/PDF 다운로드 헤더 카드 ── */}
          <StaggerItem>
            <section className="rounded-3xl border-2 border-blue-600/30 bg-white p-6 sm:p-8 shadow-sm space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-100 text-blue-900 border border-blue-300 text-[15px] font-extrabold">
                  📖 60대 대표공인중개사 맞춤형 큰글씨 · 사진 · 동영상 사용 설명서 (SOTA 개정판)
                </span>
                <div className="flex flex-wrap items-center gap-2 print:hidden">
                  <motion.button
                    type="button"
                    whileHover={{ y: -1 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setExtraLargeText((prev) => !prev)}
                    data-testid="tutorial-font-size-toggle"
                    className="px-4 py-2.5 min-h-[44px] rounded-xl border-2 border-amber-400 bg-amber-50 hover:bg-amber-100 text-amber-950 font-extrabold text-[15px] transition-colors"
                  >
                    {extraLargeText ? "🔤 기본 큰글씨(17px)로 보기" : "🔎 글자 더 크게 보기 (특대 19px)"}
                  </motion.button>
                  <a
                    href="/tutorials/CREDEAL_60대_중개인_큰글씨_매뉴얼.pdf"
                    download="CREDEAL_60대_중개인_큰글씨_매뉴얼.pdf"
                    data-testid="tutorial-pdf-download-btn"
                    className="px-4 py-2.5 min-h-[44px] inline-flex items-center gap-1.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-extrabold text-[15px] shadow-sm transition-colors"
                  >
                    <span>📥 큰글씨 PDF 매뉴얼 내려받기</span>
                  </a>
                  <motion.button
                    type="button"
                    whileHover={{ y: -1 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => window.print()}
                    data-testid="tutorial-print-btn"
                    className="px-4 py-2.5 min-h-[44px] inline-flex items-center gap-1.5 rounded-xl border-2 border-slate-300 bg-white hover:bg-slate-100 text-slate-900 font-extrabold text-[15px] transition-colors"
                  >
                    <span>🖨️ 종이로 인쇄하기</span>
                  </motion.button>
                </div>
              </div>

              <div className="space-y-2">
                <h1 className="text-[28px] sm:text-[34px] font-black text-slate-900 leading-tight tracking-tight">
                  크리딜(CRE DealCard) 전 기능 스텝 바이 스텝 완전정복
                </h1>
                <p className="text-[17px] sm:text-[18px] text-slate-700 font-medium leading-relaxed">
                  처음 접속하신 대표님도 <strong>화면 사진에 표시된 빨간 번호(①, ②, ③)</strong>와{" "}
                  <strong>따라하기 동영상</strong>만 보시면서 그대로 누르시면{" "}
                  <strong>1분 딜카드</strong>, <strong>PPTX 투자설명서(기본 IM)</strong>,{" "}
                  <strong>주간 고객 소식지(5분 간단 모드 & 8단계 상세 편집)</strong>까지 막힘없이 완성하실 수 있습니다.
                </p>
              </div>

              {/* 실전 예시 매물 안내 박스 */}
              <div className="rounded-2xl border border-emerald-300 bg-emerald-50/70 p-4 sm:p-5 space-y-2">
                <p className="text-[16px] font-extrabold text-emerald-950">
                  🏢 이 설명서에서 함께 따라 해보는 실전 예시 매물 2선
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[15px] text-slate-800">
                  <div className="rounded-xl bg-white border border-emerald-200 p-3.5">
                    <p className="font-black text-emerald-900">
                      예시 A (다필지 수익형): 영등포구 양평동4가 117, 134, 125-2번지 (더레드빌딩)
                    </p>
                    <p className="text-[14px] text-slate-700 mt-1">
                      매각가 250억 · 3필지 합산 대지 157평(518.7㎡) · 연면적 753.5평(B1~10F) · 1층 스타벅스 입점
                    </p>
                  </div>
                  <div className="rounded-xl bg-white border border-emerald-200 p-3.5">
                    <p className="font-black text-emerald-900">
                      예시 B (일반 수익형·통합계약): 영등포구 당산동5가 11-47 (호산당빌딩)
                    </p>
                    <p className="text-[14px] text-slate-700 mt-1">
                      매각가 115억 · 대지 153.3평 / 연면적 307.9평(B1~5F) · 1층 약국 및 1~2층 내과 통합계약
                    </p>
                  </div>
                </div>
              </div>

              {/* ── 장별 빠른 선택 탭 (SOTA 슬라이딩 세그먼트 필 · 인쇄 시 숨김) ── */}
              <div className="space-y-2.5 pt-2 print:hidden">
                <p className="text-[15px] font-extrabold text-slate-700">
                  👇 원하시는 단원을 눌러 바로 보시거나, [전체 순서대로 보기]로 처음부터 끝까지 읽어보세요
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedModuleId("all")}
                    data-testid="tutorial-tab-all"
                    data-active-pill={selectedModuleId === "all" ? "true" : undefined}
                    className={`relative px-4 py-2.5 min-h-[44px] rounded-xl text-[15px] font-extrabold border transition-colors ${
                      selectedModuleId === "all"
                        ? "text-white border-blue-700"
                        : "bg-slate-100 text-slate-800 border-slate-300 hover:bg-slate-200"
                    }`}
                  >
                    {selectedModuleId === "all" && (
                      <motion.span
                        layoutId="tutorial-chapter-active-pill"
                        transition={SOTA_SPRING}
                        className="absolute inset-0 rounded-xl bg-blue-700 shadow-sm"
                      />
                    )}
                    <span className="relative z-10">📚 전체 순서대로 보기 (제0장~부록 D)</span>
                  </button>
                  {BROKER_TUTORIAL_MODULES.map((mod) => {
                    const isActive = selectedModuleId === mod.id;
                    return (
                      <button
                        key={mod.id}
                        type="button"
                        onClick={() => setSelectedModuleId(mod.id)}
                        data-testid={`tutorial-tab-${mod.id}`}
                        data-active-pill={isActive ? "true" : undefined}
                        className={`relative px-3.5 py-2.5 min-h-[44px] rounded-xl text-[15px] font-bold border transition-colors ${
                          isActive
                            ? "text-white border-blue-700"
                            : "bg-white text-slate-800 border-slate-300 hover:bg-slate-100"
                        }`}
                      >
                        {isActive && (
                          <motion.span
                            layoutId="tutorial-chapter-active-pill"
                            transition={SOTA_SPRING}
                            className="absolute inset-0 rounded-xl bg-blue-700 shadow-sm"
                          />
                        )}
                        <span className="relative z-10">{mod.shortTitle}</span>
                      </button>
                    );
                  })}
                  <a
                    href="#appendix-postures"
                    onClick={() => setSelectedModuleId("all")}
                    className="px-3.5 py-2.5 min-h-[44px] inline-flex items-center rounded-xl text-[15px] font-bold border border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100 transition-all"
                  >
                    📋 부록 A: 5대 투자목적 비교표
                  </a>
                  <a
                    href="#appendix-cheatsheet"
                    onClick={() => setSelectedModuleId("all")}
                    className="px-3.5 py-2.5 min-h-[44px] inline-flex items-center rounded-xl text-[15px] font-bold border border-emerald-300 bg-emerald-50 text-emerald-950 hover:bg-emerald-100 transition-all"
                  >
                    🖨️ 부록 B: A4 1장 책상 요약표
                  </a>
                  <a
                    href="#appendix-templates"
                    onClick={() => setSelectedModuleId("all")}
                    className="px-3.5 py-2.5 min-h-[44px] inline-flex items-center rounded-xl text-[15px] font-bold border border-blue-300 bg-blue-50 text-blue-950 hover:bg-blue-100 transition-all"
                  >
                    💬 부록 C: 카톡 인사말 템플릿 6선
                  </a>
                  <a
                    href="#appendix-checklist-feedback"
                    onClick={() => setSelectedModuleId("all")}
                    data-testid="tutorial-tab-appendix-d"
                    className="px-3.5 py-2.5 min-h-[44px] inline-flex items-center rounded-xl text-[15px] font-bold border border-violet-300 bg-violet-50 text-violet-950 hover:bg-violet-100 transition-all"
                  >
                    ✅ 부록 D: 실전 체크리스트 & 피드백
                  </a>
                </div>
              </div>
            </section>
          </StaggerItem>

          {/* ── 각 모듈(제0장 ~ 제10장) 스텝 바이 스텝 본문 ── */}
          {visibleModules.map((mod, modIdx) => (
            <section
              key={mod.id}
              id={mod.id}
              data-testid={`tutorial-section-${mod.id}`}
              style={
                modIdx > 0
                  ? { contentVisibility: "auto", containIntrinsicSize: "0 900px" }
                  : undefined
              }
              className="rounded-3xl border-2 border-slate-300 bg-white p-6 sm:p-8 shadow-sm space-y-6 break-inside-avoid-page"
            >
              {/* 모듈 헤더 */}
              <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-slate-200 pb-5">
                <div className="space-y-2 flex-1 min-w-[260px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-3.5 py-1 rounded-full bg-blue-700 text-white text-[14px] font-extrabold">
                      {mod.moduleNumber}
                    </span>
                    <span className="px-3 py-1 rounded-full bg-slate-100 border border-slate-300 text-slate-800 text-[14px] font-bold">
                      ⏱️ 소요 시간: {mod.duration}
                    </span>
                  </div>
                  <h2 className="text-[24px] sm:text-[28px] font-black text-slate-900 leading-snug">
                    {mod.title}
                  </h2>
                  <p className="text-[16px] sm:text-[17px] text-slate-700 leading-relaxed">
                    {mod.subtitle}
                  </p>
                </div>

                <Link
                  href={mod.targetHref}
                  className="px-5 py-3 min-h-[48px] inline-flex items-center gap-2 rounded-2xl bg-blue-700 hover:bg-blue-800 text-white font-extrabold text-[16px] shadow-sm shrink-0 print:hidden transition-colors"
                >
                  <span>{mod.targetLabel} ↗</span>
                </Link>
              </div>

              {/* 이 장의 3줄 핵심 요약 */}
              <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-5 space-y-2">
                <p className="text-[16px] font-extrabold text-blue-950">
                  🎯 이 장에서 꼭 기억하실 핵심 포인트
                </p>
                <ul className="space-y-1.5 text-[16px] text-slate-800 list-disc pl-5">
                  {mod.summaryPoints.map((pt, idx) => (
                    <li key={idx} className="leading-relaxed font-medium">
                      {pt}
                    </li>
                  ))}
                </ul>
              </div>

              {/* 따라하기 동영상 플레이어 (인쇄 시 숨김) */}
              {mod.steps.length > 0 && (
                <div className="rounded-2xl border-2 border-slate-300 bg-slate-50 p-4 sm:p-5 space-y-3 print:hidden">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[16px] font-extrabold text-slate-900">
                      {mod.videoTitle}
                    </p>
                    <a
                      href={mod.videoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[14px] font-bold text-blue-700 hover:underline"
                    >
                      새 창에서 크게 틀기 ↗
                    </a>
                  </div>
                  <video
                    controls
                    preload="none"
                    className="w-full max-h-[520px] rounded-xl border border-slate-300 bg-slate-900 shadow-inner"
                    src={mod.videoUrl}
                  >
                    브라우저가 동영상을 지원하지 않습니다.
                  </video>
                </div>
              )}

              {/* 스텝별 상세 카드 목록 */}
              {mod.steps.length > 0 && (
                <div className="space-y-8 pt-2">
                  {mod.steps.map((step) => (
                    <div
                      key={step.id}
                      id={step.id}
                      className="rounded-2xl border-2 border-slate-200 bg-[#F8FAFC] p-5 sm:p-6 space-y-5 break-inside-avoid"
                    >
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="px-3.5 py-1.5 rounded-xl bg-amber-500 text-slate-950 font-black text-[16px]">
                          {step.stepNumber}
                        </span>
                        <h3 className="text-[20px] sm:text-[22px] font-black text-slate-900">
                          {step.title}
                        </h3>
                      </div>

                      {/* 캡처 이미지 */}
                      <figure className="space-y-2">
                        <div className="overflow-hidden rounded-2xl border-2 border-slate-300 bg-white shadow-sm">
                          <img
                            src={step.imageUrl}
                            alt={step.imageCaption}
                            className="w-full h-auto object-contain max-h-[680px] mx-auto"
                            loading="lazy"
                            decoding="async"
                          />
                        </div>
                        <figcaption className="text-[14px] font-bold text-slate-600 text-center px-2">
                          ▲ [화면 안내] {step.imageCaption}
                        </figcaption>
                      </figure>

                      {/* 설명 박스: 어디를 누르나요? / 무엇이 바뀌나요? / 왜 중요한가요? / 자주 하는 실수 / 복사 예시 */}
                      <div className="grid grid-cols-1 gap-3.5">
                        <div className="rounded-xl border border-blue-200 bg-white p-4">
                          <p className="text-[15px] font-extrabold text-blue-800 mb-1">
                            👆 1. 어디를 누르거나 입력하나요?
                          </p>
                          <p className="text-slate-900 font-medium whitespace-pre-line">
                            {step.whereToClick}
                          </p>
                        </div>

                        <div className="rounded-xl border border-emerald-200 bg-white p-4">
                          <p className="text-[15px] font-extrabold text-emerald-800 mb-1">
                            ✅ 2. 화면에서 무엇이 바뀌나요?
                          </p>
                          <p className="text-slate-900 font-medium whitespace-pre-line">
                            {step.whatChanges}
                          </p>
                        </div>

                        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                          <p className="text-[15px] font-extrabold text-amber-900 mb-1">
                            💡 3. 왜 이 기능이 중요한가요? (중개 실무 포인트)
                          </p>
                          <p className="text-slate-900 font-medium whitespace-pre-line">
                            {step.whyItMatters}
                          </p>
                          {step.tip && (
                            <p className="mt-2 pt-2 border-t border-amber-200/80 text-[15px] font-bold text-amber-950">
                              📌 따라하기 꿀팁: {step.tip}
                            </p>
                          )}
                        </div>

                        {step.commonMistake && (
                          <div className="rounded-xl border border-rose-300 bg-rose-50/70 p-4">
                            <p className="text-[15px] font-extrabold text-rose-900 mb-1">
                              ⚠️ 4. 자주 하시는 실수 & 안심 예방법
                            </p>
                            <p className="text-slate-900 font-medium whitespace-pre-line">
                              {step.commonMistake}
                            </p>
                          </div>
                        )}

                        {step.copySample && (
                          <div className="rounded-xl border-2 border-indigo-200 bg-indigo-50/50 p-4 space-y-2.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-[15px] font-extrabold text-indigo-950">
                                📋 바로 복사해서 따라 해보는 실전 문구 예시
                              </p>
                              <button
                                type="button"
                                onClick={() => handleCopyText(step.id, step.copySample!.text)}
                                className="px-3.5 py-2 min-h-[40px] rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-[14px] font-extrabold shadow-xs print:hidden transition-colors"
                              >
                                {copiedId === step.id
                                  ? "✅ 복사 완료! (입력창에 Ctrl+V 하세요)"
                                  : `📋 ${step.copySample.label}`}
                              </button>
                            </div>
                            <pre className="whitespace-pre-wrap rounded-xl border border-indigo-200 bg-white p-3.5 text-[15px] font-semibold text-slate-900 font-sans">
                              {step.copySample.text}
                            </pre>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 제10장일 때: FAQ & 부동산 디지털 용어 사전 렌더링 (개수는 데이터 길이로 자동 표기) */}
              {mod.id === "module-10" && (
                <div id="faq-section" className="space-y-8 pt-2">
                  {/* FAQ */}
                  <div className="space-y-4">
                    <h3 className="text-[22px] font-black text-slate-900">
                      🛠️ 자주 묻는 질문과 즉시 해결법 (FAQ {BROKER_FAQ_LIST.length}선)
                    </h3>
                    <div className="grid grid-cols-1 gap-4">
                      {BROKER_FAQ_LIST.map((faq) => (
                        <div
                          key={faq.qNumber}
                          className="rounded-2xl border-2 border-slate-200 bg-[#F8FAFC] p-5 space-y-2.5 break-inside-avoid"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="px-2.5 py-0.5 rounded-lg bg-blue-700 text-white text-[14px] font-black">
                              {faq.qNumber}
                            </span>
                            <span className="px-2.5 py-0.5 rounded-lg bg-slate-200 text-slate-800 text-[13px] font-bold">
                              {faq.category}
                            </span>
                            <p className="text-[18px] font-black text-slate-900">
                              {faq.question}
                            </p>
                          </div>
                          <p className="text-slate-800 font-medium leading-relaxed pl-1">
                            <strong>해결 방법:</strong> {faq.answer}
                          </p>
                          <p className="text-[14px] font-bold text-blue-800 bg-blue-50 border border-blue-200 rounded-xl px-3.5 py-2">
                            👉 바로 해보기: {faq.actionTip}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 쉬운 용어 사전 */}
                  <div className="space-y-4 pt-4">
                    <h3 className="text-[22px] font-black text-slate-900">
                      📖 60대 중개인을 위한 쉬운 부동산 디지털 용어 사전 ({BROKER_GLOSSARY_LIST.length}선)
                    </h3>
                    <div className="overflow-x-auto rounded-2xl border-2 border-slate-300">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-100 border-b-2 border-slate-300 text-slate-900 text-[16px] font-black">
                            <th className="p-4 w-1/4">화면 용어</th>
                            <th className="p-4 w-1/2">쉬운 우리말 뜻</th>
                            <th className="p-4 w-1/4">어디에 나오나요?</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 text-[16px]">
                          {BROKER_GLOSSARY_LIST.map((g) => (
                            <tr key={g.term} className="bg-white">
                              <td className="p-4 font-black text-blue-900 align-top">
                                {g.term}
                              </td>
                              <td className="p-4 text-slate-800 font-medium align-top leading-relaxed">
                                {g.easyMeaning}
                              </td>
                              <td className="p-4 text-slate-700 font-semibold align-top">
                                {g.whereUsed}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </section>
          ))}

          {/* ── 부록 A: 5대 투자 목적(포스처)별 추가 입력 항목 & 슬라이드 구성 비교표 ── */}
          {(isPrintMode || selectedModuleId === "all") && (
            <section
              id="appendix-postures"
              data-testid="tutorial-appendix-postures"
              className="rounded-3xl border-2 border-amber-400 bg-white p-6 sm:p-8 shadow-sm space-y-5 break-inside-avoid-page"
            >
              <div className="space-y-1.5">
                <span className="px-3.5 py-1 rounded-full bg-amber-500 text-slate-950 text-[14px] font-black">
                  부록 A · 맞춤 제안서 가이드
                </span>
                <h2 className="text-[24px] sm:text-[28px] font-black text-slate-900 pt-1">
                  5대 투자 목적(포스처)별 추천 매물 · 필수 입력값 · 자동 생성 슬라이드 비교표
                </h2>
                <p className="text-[16px] text-slate-700">
                  [⚡ 기본 IM 만들기] 맨 위 ①번 단계에서 투자 목적을 바꾸면 아래 표와 같이 맞춤형 제안서가 만들어집니다.
                </p>
              </div>

              <div className="overflow-x-auto rounded-2xl border-2 border-slate-300">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-amber-50 border-b-2 border-slate-300 text-slate-900 text-[16px] font-black">
                      <th className="p-4 w-1/5">투자 목적</th>
                      <th className="p-4 w-1/4">어떤 매물에 쓰나요?</th>
                      <th className="p-4 w-1/4">주요 입력 항목</th>
                      <th className="p-4">자동 생성되는 PPTX 슬라이드 구성</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-[15px]">
                    {POSTURE_GUIDE_ROWS.map((row) => (
                      <tr key={row.postureName} className="bg-white">
                        <td className="p-4 font-black text-slate-900 align-top">
                          {row.postureName}
                        </td>
                        <td className="p-4 text-slate-800 font-medium align-top">
                          {row.recommendedFor}
                        </td>
                        <td className="p-4 text-slate-800 font-semibold align-top">
                          {row.keyInputs}
                        </td>
                        <td className="p-4 text-slate-700 font-medium align-top">
                          {row.generatedSlides}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* ── 부록 B: 책상 앞에 붙여두는 A4 1장 큰글씨 요약표 (Cheat Sheet) ── */}
          {(isPrintMode || selectedModuleId === "all") && (
            <section
              id="appendix-cheatsheet"
              data-testid="tutorial-appendix-cheatsheet"
              className="rounded-3xl border-4 border-emerald-600 bg-white p-6 sm:p-8 shadow-md space-y-6 break-before-page"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-emerald-200 pb-4">
                <div>
                  <span className="px-3.5 py-1 rounded-full bg-emerald-700 text-white text-[14px] font-black">
                    부록 B · 모니터 옆에 붙여두세요!
                  </span>
                  <h2 className="text-[26px] sm:text-[30px] font-black text-slate-900 mt-1">
                    📋 크리딜(CRE DealCard) A4 1장 큰글씨 핵심 요약표
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-2.5 min-h-[44px] rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-[15px] print:hidden"
                >
                  🖨️ 이 요약표 인쇄하기
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2 rounded-2xl border-2 border-violet-300 p-5 space-y-2 bg-[#F5F3FF]">
                  <p className="text-[19px] font-black text-violet-900">
                    ⓪ IM 전 렌트롤 준비 — AI 챗봇으로 5분 변환 (준비편)
                  </p>
                  <ol className="list-decimal pl-5 space-y-1.5 text-[16px] font-semibold text-slate-800">
                    <li>IM 입력 시트 렌트롤 상자에서 [📥 빈 양식] 내려받기</li>
                    <li>ChatGPT·Claude·Gemini에 매도인 자료(엑셀·PPT·사진 캡처) 올리고 → 준비편 3단계 [변환 지시문] 붙여넣기</li>
                    <li>AI가 준 16열 표 복사 → 빈 양식 &apos;렌트롤&apos; 시트 A13 칸 클릭 후 Ctrl+V → C3·C4·C5·G9(㎡/평)·J3·J4 채우고 저장</li>
                    <li>[엑셀/CSV 업로드] → &apos;v1.5&apos; 표시와 보증금·월세·관리비 합계를 원본과 대조 (주택 임차인 실명·연락처는 미리 지우기)</li>
                  </ol>
                </div>

                <div className="rounded-2xl border-2 border-slate-300 p-5 space-y-2 bg-[#F8FAFC]">
                  <p className="text-[19px] font-black text-blue-900">
                    ① 1분 딜카드 만들기 (소요시간 1분)
                  </p>
                  <ol className="list-decimal pl-5 space-y-1.5 text-[16px] font-semibold text-slate-800">
                    <li>상단 메뉴바 [➕ 새 물건 등록] 클릭</li>
                    <li>카톡 매물 메모 복사(Ctrl+C) 후 입력창에 붙여넣기(Ctrl+V)</li>
                    <li>우측 하단 파란색 [1분 딜카드 만들기] 클릭</li>
                    <li>[✏️ 문구 직접 다듬기]로 제목·강점 확인 후 [카톡 공유] 또는 [링크 복사]</li>
                  </ol>
                </div>

                <div className="rounded-2xl border-2 border-slate-300 p-5 space-y-2 bg-[#F8FAFC]">
                  <p className="text-[19px] font-black text-amber-900">
                    ② PPTX 제안서 · 기본 IM 만들기 (소요시간 3분)
                  </p>
                  <ol className="list-decimal pl-5 space-y-1.5 text-[16px] font-semibold text-slate-800">
                    <li>딜카드 화면 맨 아래 노란색 [⚡ 기본 IM 만들기] 클릭</li>
                    <li>① 투자 목적(임대수익/사옥/신축) 선택 → ② 주소 검색(다필지 자동 합산)</li>
                    <li>③ 매각가(+100억/+10억 버튼)·렌트롤 엑셀 업로드·사진 입력 후 [⚡ IM 생성]</li>
                    <li>완성 화면 [📐 슬라이드 미리보기 · 편집 후 다운로드] → 테마·문구 확인 후 [📥 편집 반영 PPTX 다운로드]</li>
                  </ol>
                </div>

                <div className="rounded-2xl border-2 border-slate-300 p-5 space-y-2 bg-[#F8FAFC]">
                  <p className="text-[19px] font-black text-rose-900">
                    ③ 주간 고객 소식지 5분 발행 (매주 월·화요일 추천)
                  </p>
                  <ol className="list-decimal pl-5 space-y-1.5 text-[16px] font-semibold text-slate-800">
                    <li>상단 메뉴바 [📰 고객 소식지] 클릭 (5분 간단 모드 자동 실행)</li>
                    <li>① 이번 주 한마디: 시작 문장 추천 버튼 클릭 후 1~2문장 작성</li>
                    <li>② 소개할 매물: 이번 주 추천할 내 물건(최대 3건) 클릭해 체크(✓)</li>
                    <li>하단 파란색 [🚀 이번 주 매거진 발행하기] 클릭 후 카톡·이메일 전송</li>
                  </ol>
                </div>

                <div className="rounded-2xl border-2 border-slate-300 p-5 space-y-2 bg-[#F8FAFC]">
                  <p className="text-[19px] font-black text-emerald-900">
                    ④ 평생 써먹는 컴퓨터 단축키 & 안심 조작법 4가지
                  </p>
                  <ul className="list-disc pl-5 space-y-1.5 text-[16px] font-semibold text-slate-800">
                    <li>
                      <strong>글씨 크게 확대</strong>: 키보드 [Ctrl] 누른 채 마우스 휠 위로 굴리기
                    </li>
                    <li>
                      <strong>복사 / 붙여넣기</strong>: [Ctrl + C] (복사) → [Ctrl + V] (붙여넣기)
                    </li>
                    <li>
                      <strong>밝은 화면 전환</strong>: 상단 우측 [☀️ 큰글씨 밝은 화면] 버튼 클릭
                    </li>
                    <li>
                      <strong>길을 잃었을 때</strong>: 언제든 상단 왼쪽 첫 번째 [🏠 홈 화면] 클릭
                    </li>
                  </ul>
                </div>
              </div>
            </section>
          )}

          {/* ── 부록 C: 상황별 카카오톡 발송 멘트 & 인사말 실전 템플릿 6선 ── */}
          {(isPrintMode || selectedModuleId === "all") && (
            <section
              id="appendix-templates"
              data-testid="tutorial-appendix-templates"
              className="rounded-3xl border-2 border-blue-400 bg-white p-6 sm:p-8 shadow-sm space-y-5 break-inside-avoid-page"
            >
              <div className="space-y-1.5">
                <span className="px-3.5 py-1 rounded-full bg-blue-700 text-white text-[14px] font-black">
                  부록 C · 원터치 복사해서 바로 쓰는 실전 영업 멘트
                </span>
                <h2 className="text-[24px] sm:text-[28px] font-black text-slate-900 pt-1">
                  💬 상황별 카카오톡 매물 브리핑 & 주간 소식지 발송 인사말 템플릿 6선
                </h2>
                <p className="text-[16px] text-slate-700">
                  고객에게 딜카드 링크, PPTX 제안서, 또는 주간 소식지를 보내실 때 아래 <strong>[📋 인사말 복사하기]</strong> 버튼을 눌러 카카오톡 대화창에 그대로 붙여넣기(Ctrl+V) 해보세요.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {BROKER_MESSAGE_TEMPLATES.map((tpl) => (
                  <div
                    key={tpl.id}
                    className="rounded-2xl border-2 border-slate-200 bg-[#F8FAFC] p-5 flex flex-col justify-between space-y-3 break-inside-avoid"
                  >
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="px-3 py-1 rounded-lg bg-blue-100 text-blue-900 text-[13px] font-black">
                          {tpl.situation}
                        </span>
                        <span className="text-[13px] font-bold text-slate-600">
                          대상: {tpl.targetAudience}
                        </span>
                      </div>
                      <h3 className="text-[18px] font-black text-slate-900">
                        {tpl.title}
                      </h3>
                      <p className="whitespace-pre-line rounded-xl border border-slate-300 bg-white p-3.5 text-[15px] font-medium text-slate-800 leading-relaxed">
                        {tpl.body}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopyText(tpl.id, tpl.body)}
                      className="w-full py-2.5 min-h-[44px] rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-[15px] font-extrabold shadow-xs print:hidden transition-colors"
                    >
                      {copiedId === tpl.id
                        ? "✅ 복사되었습니다! 카톡방에 붙여넣기(Ctrl+V) 하세요"
                        : "📋 이 인사말 복사하기"}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── 부록 D: 실제 중개인 현장 사용 체크리스트(19항목) & 고객·시스템 피드백 가이드 ── */}
          {(isPrintMode || selectedModuleId === "all") && (
            <section
              id="appendix-checklist-feedback"
              data-testid="tutorial-appendix-checklist-feedback"
              className="rounded-3xl border-4 border-violet-600 bg-white p-6 sm:p-8 shadow-md space-y-8 break-before-page"
            >
              {/* 헤더 & 체크 진행률 컨트롤 */}
              <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-violet-200 pb-5">
                <div className="space-y-1.5">
                  <span className="px-3.5 py-1 rounded-full bg-violet-700 text-white text-[14px] font-black">
                    부록 D · 발송 전 무결점 검수 & 피드백 즉시 대응
                  </span>
                  <h2 className="text-[24px] sm:text-[28px] font-black text-slate-900 pt-1">
                    ✅ 실제 중개인 현장 사용 체크리스트 (19항목) & 피드백 반영 가이드
                  </h2>
                  <p className="text-[16px] text-slate-700">
                    매물을 접수해 딜카드·PPTX 제안서를 만들고 고객의 수정 요청(피드백)에 30초 만에 대응하는 현장 실무 점검표입니다. 각 항목을 마우스로 눌러 직접 체크(✓)해 보세요.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 print:hidden shrink-0">
                  <span
                    data-testid="checklist-progress-badge"
                    className="px-3.5 py-2 rounded-xl bg-violet-100 border border-violet-300 text-violet-950 font-black text-[15px]"
                  >
                    점검 완료: {checkedIds.length} / {ALL_CHECKLIST_IDS.length}개
                  </span>
                  <button
                    type="button"
                    data-testid="checklist-check-all-btn"
                    onClick={() => setCheckedIds(ALL_CHECKLIST_IDS)}
                    className="px-3.5 py-2 min-h-[42px] rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-[14px] transition-colors"
                  >
                    ✅ 전체 체크
                  </button>
                  <button
                    type="button"
                    data-testid="checklist-reset-btn"
                    onClick={() => setCheckedIds([])}
                    className="px-3.5 py-2 min-h-[42px] rounded-xl border border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-800 font-extrabold text-[14px] transition-colors"
                  >
                    🔄 초기화
                  </button>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="px-3.5 py-2 min-h-[42px] rounded-xl bg-violet-700 hover:bg-violet-800 text-white font-extrabold text-[14px] transition-colors"
                  >
                    🖨️ 체크리스트 인쇄
                  </button>
                </div>
              </div>

              {/* 1. 단계별 현장 사용 체크리스트 (4단계 19항목) */}
              <div className="space-y-6">
                {BROKER_USAGE_CHECKLIST_GROUPS.map((group) => (
                  <div
                    key={group.id}
                    className="rounded-2xl border-2 border-slate-300 bg-[#F8FAFC] p-5 sm:p-6 space-y-4 break-inside-avoid"
                  >
                    <div className="space-y-1 border-b border-slate-200 pb-3">
                      <span className="inline-block px-3 py-1 rounded-lg bg-violet-700 text-white text-[13px] font-black">
                        {group.phaseBadge}
                      </span>
                      <h3 className="text-[20px] sm:text-[22px] font-black text-slate-900 pt-1">
                        {group.title}
                      </h3>
                      <p className="text-[15px] text-slate-700 font-medium">
                        {group.subtitle}
                      </p>
                    </div>

                    <div className="space-y-3">
                      {group.items.map((item) => {
                        const isChecked = checkedIds.includes(item.id);
                        return (
                          <div
                            key={item.id}
                            data-testid={`checklist-item-${item.id}`}
                            onClick={() => toggleChecklistItem(item.id)}
                            role="checkbox"
                            aria-checked={isChecked}
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                toggleChecklistItem(item.id);
                              }
                            }}
                            className={`cursor-pointer rounded-xl border-2 p-4 transition-all flex items-start gap-3.5 ${
                              isChecked
                                ? "border-emerald-600 bg-emerald-50/70"
                                : "border-slate-300 bg-white hover:border-violet-400"
                            }`}
                          >
                            <span
                              className={`mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center font-black text-[16px] shrink-0 border-2 ${
                                isChecked
                                  ? "bg-emerald-700 border-emerald-700 text-white"
                                  : "bg-white border-slate-400 text-transparent"
                              }`}
                            >
                              ✓
                            </span>
                            <div className="flex-1 space-y-1.5">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p
                                  className={`text-[17px] font-black ${
                                    isChecked ? "text-emerald-950 line-through" : "text-slate-900"
                                  }`}
                                >
                                  {item.checkLabel}
                                </p>
                                <span className="px-2.5 py-0.5 rounded-lg bg-slate-200 text-slate-800 text-[13px] font-bold">
                                  참고: {item.relatedChapter}
                                </span>
                              </div>
                              <p className="text-[15px] text-slate-800 font-medium leading-relaxed">
                                {item.detail}
                              </p>
                              {item.mistakeToAvoid && (
                                <p className="text-[14px] font-bold text-rose-900 bg-rose-50 border border-rose-200 rounded-lg px-3 py-1.5">
                                  ⚠️ 주의: {item.mistakeToAvoid}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* 2. 매수 고객 · 건물주 피드백 유형별 30초 즉시 처방표 */}
              <div className="space-y-4 pt-4 border-t-2 border-slate-200">
                <div className="space-y-1">
                  <span className="px-3 py-1 rounded-lg bg-amber-500 text-slate-950 text-[13px] font-black">
                    파트 2 · 고객 수정 요청 30초 해결
                  </span>
                  <h3 className="text-[22px] sm:text-[24px] font-black text-slate-900 pt-1">
                    💬 매수 고객 · 건물주 피드백 유형별 30초 즉시 처방표 (6대 실전 사례)
                  </h3>
                  <p className="text-[16px] text-slate-700">
                    제안서를 받아본 고객이나 건물주가 숫자·문구·색상 수정을 요청하셨을 때, 당황하지 않고 <strong>30초 만에 수정본 PPTX를 다시 내려받는 방법</strong>입니다.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  {BROKER_FEEDBACK_SCENARIOS.map((sc) => (
                    <div
                      key={sc.id}
                      className="rounded-2xl border-2 border-slate-200 bg-[#F8FAFC] p-5 space-y-2.5 break-inside-avoid"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="px-3 py-1 rounded-lg bg-blue-700 text-white text-[14px] font-black">
                          {sc.feedbackFrom}
                        </span>
                        <span className="px-3 py-1 rounded-lg bg-emerald-100 border border-emerald-300 text-emerald-950 text-[13px] font-extrabold">
                          ⏱️ 해결 소요 시간: {sc.timeRequired}
                        </span>
                      </div>
                      <p className="text-[17px] font-black text-slate-900 bg-white border border-slate-300 rounded-xl p-3.5">
                        🗣️ {sc.clientQuote}
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-[15px]">
                        <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3">
                          <p className="font-extrabold text-blue-950 text-[14px]">👆 어디서 고치나요?</p>
                          <p className="text-slate-900 font-bold mt-0.5">{sc.whereToFix}</p>
                        </div>
                        <div className="md:col-span-2 rounded-xl border border-emerald-200 bg-white p-3">
                          <p className="font-extrabold text-emerald-900 text-[14px]">✅ 30초 즉시 해결 방법</p>
                          <p className="text-slate-800 font-medium mt-0.5 leading-relaxed">
                            {sc.howToFixIn30Sec}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 3. 크리딜(CRE DealCard) 현장 사용 피드백 & 오류 제보 가이드 */}
              <div className="rounded-2xl border-2 border-indigo-300 bg-indigo-50/60 p-5 sm:p-6 space-y-5 break-inside-avoid">
                <div className="space-y-1.5">
                  <h3 className="text-[22px] font-black text-indigo-950">
                    {BROKER_FEEDBACK_SYSTEM_GUIDE.title}
                  </h3>
                  <p className="text-[16px] text-slate-800 font-medium">
                    {BROKER_FEEDBACK_SYSTEM_GUIDE.subtitle}
                  </p>
                </div>

                <div className="rounded-xl border border-indigo-200 bg-white p-4 space-y-2">
                  <p className="text-[16px] font-extrabold text-indigo-950">
                    📌 오류 제보 · 기능 건의 시 이렇게 보내주시면 가장 빠르게 해결됩니다
                  </p>
                  <ul className="space-y-1.5 text-[15px] text-slate-800 font-medium">
                    {BROKER_FEEDBACK_SYSTEM_GUIDE.howToReportSteps.map((stepStr, idx) => (
                      <li key={idx} className="leading-relaxed">
                        {stepStr}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-xl border border-emerald-200 bg-white p-4 space-y-2.5">
                  <p className="text-[16px] font-extrabold text-emerald-950">
                    🌟 실제 대표님들의 현장 피드백이 크리딜 기능으로 반영된 대표 사례 4선
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[14px]">
                    {BROKER_FEEDBACK_SYSTEM_GUIDE.reflectedExamples.map((ex, idx) => (
                      <div
                        key={idx}
                        className="rounded-xl border border-slate-200 bg-[#F8FAFC] p-3.5 space-y-1.5"
                      >
                        <p className="font-black text-slate-900">{ex.brokerVoice}</p>
                        <p className="font-semibold text-emerald-900 leading-relaxed">
                          {ex.systemSolution}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 원터치 피드백 양식 복사 */}
                <div className="rounded-xl border-2 border-indigo-300 bg-white p-4 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[16px] font-black text-indigo-950">
                      📋 원터치 복사해서 바로 보내는 [시스템 개선 · 오류 제보 양식]
                    </p>
                    <button
                      type="button"
                      data-testid="copy-feedback-template-btn"
                      onClick={() =>
                        handleCopyText(
                          "feedback-report-template",
                          BROKER_FEEDBACK_SYSTEM_GUIDE.copyTemplate.text
                        )
                      }
                      className="px-4 py-2.5 min-h-[44px] rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-[15px] font-extrabold shadow-xs print:hidden transition-colors"
                    >
                      {copiedId === "feedback-report-template"
                        ? "✅ 양식이 복사되었습니다! 카톡·이메일에 붙여넣기(Ctrl+V) 하세요"
                        : `📋 ${BROKER_FEEDBACK_SYSTEM_GUIDE.copyTemplate.label}`}
                    </button>
                  </div>
                  <pre className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-[#F8FAFC] p-3.5 text-[15px] font-semibold text-slate-900 font-sans">
                    {BROKER_FEEDBACK_SYSTEM_GUIDE.copyTemplate.text}
                  </pre>
                </div>
              </div>
            </section>
          )}
        </StaggerContainer>
      </main>
      <div className="print:hidden">
        <BrokerBottomNav />
      </div>
    </>
  );
}

export default function BrokerTutorialPage() {
  return (
    <Suspense
      fallback={
        <main className="flex items-center justify-center min-h-screen p-8 text-[18px] font-bold">
          📖 쉬운 사용 설명서를 불러오고 있습니다...
        </main>
      }
    >
      <BrokerTutorialInner />
    </Suspense>
  );
}
