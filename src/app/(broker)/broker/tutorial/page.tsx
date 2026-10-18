"use client";

import React, { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import BrokerBottomNav from "@/components/layout/BrokerBottomNav";
import {
  BROKER_TUTORIAL_MODULES,
  BROKER_FAQ_LIST,
  BROKER_GLOSSARY_LIST,
  POSTURE_GUIDE_ROWS,
} from "@/lib/tutorial/broker-tutorial-data";

function BrokerTutorialInner() {
  const searchParams = useSearchParams();
  const isPrintMode = searchParams.get("print") === "1";

  const [selectedModuleId, setSelectedModuleId] = useState<string>("all");
  const [extraLargeText, setExtraLargeText] = useState<boolean>(false);

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
        <div className="w-full max-w-5xl mx-auto space-y-8">
          {/* ── 상단 타이틀 & 큰글씨/인쇄/PDF 다운로드 헤더 카드 ── */}
          <section className="rounded-3xl border-2 border-blue-600/30 bg-white p-6 sm:p-8 shadow-sm space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-100 text-blue-900 border border-blue-300 text-[15px] font-extrabold">
                📖 60대 대표공인중개사 맞춤형 큰글씨 · 사진 · 동영상 사용 설명서
              </span>
              <div className="flex flex-wrap items-center gap-2 print:hidden">
                <button
                  type="button"
                  onClick={() => setExtraLargeText((prev) => !prev)}
                  data-testid="tutorial-font-size-toggle"
                  className="px-4 py-2.5 min-h-[44px] rounded-xl border-2 border-amber-400 bg-amber-50 hover:bg-amber-100 text-amber-950 font-extrabold text-[15px] transition-colors"
                >
                  {extraLargeText ? "🔤 기본 큰글씨(17px)로 보기" : "🔎 글자 더 크게 보기 (특대 19px)"}
                </button>
                <a
                  href="/tutorials/CREDEAL_60대_중개인_큰글씨_매뉴얼.pdf"
                  download="CREDEAL_60대_중개인_큰글씨_매뉴얼.pdf"
                  data-testid="tutorial-pdf-download-btn"
                  className="px-4 py-2.5 min-h-[44px] inline-flex items-center gap-1.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-extrabold text-[15px] shadow-sm transition-colors"
                >
                  <span>📥 큰글씨 PDF 매뉴얼 내려받기</span>
                </a>
                <button
                  type="button"
                  onClick={() => window.print()}
                  data-testid="tutorial-print-btn"
                  className="px-4 py-2.5 min-h-[44px] inline-flex items-center gap-1.5 rounded-xl border-2 border-slate-300 bg-white hover:bg-slate-100 text-slate-900 font-extrabold text-[15px] transition-colors"
                >
                  <span>🖨️ 종이로 인쇄하기</span>
                </button>
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
                <strong>주간 고객 소식지</strong>까지 막힘없이 완성하실 수 있습니다.
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

            {/* ── 장별 빠른 선택 탭 (인쇄 시 숨김) ── */}
            <div className="space-y-2.5 pt-2 print:hidden">
              <p className="text-[15px] font-extrabold text-slate-700">
                👇 원하시는 단원을 눌러 바로 보시거나, [전체 순서대로 보기]로 처음부터 끝까지 읽어보세요
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedModuleId("all")}
                  data-testid="tutorial-tab-all"
                  className={`px-4 py-2.5 min-h-[44px] rounded-xl text-[15px] font-extrabold border transition-all ${
                    selectedModuleId === "all"
                      ? "bg-blue-700 text-white border-blue-700 shadow-sm"
                      : "bg-slate-100 text-slate-800 border-slate-300 hover:bg-slate-200"
                  }`}
                >
                  📚 전체 순서대로 보기 (제0장~부록)
                </button>
                {BROKER_TUTORIAL_MODULES.map((mod) => (
                  <button
                    key={mod.id}
                    type="button"
                    onClick={() => setSelectedModuleId(mod.id)}
                    data-testid={`tutorial-tab-${mod.id}`}
                    className={`px-3.5 py-2.5 min-h-[44px] rounded-xl text-[15px] font-bold border transition-all ${
                      selectedModuleId === mod.id
                        ? "bg-blue-700 text-white border-blue-700 shadow-sm"
                        : "bg-white text-slate-800 border-slate-300 hover:bg-slate-100"
                    }`}
                  >
                    {mod.shortTitle}
                  </button>
                ))}
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
              </div>
            </div>
          </section>

          {/* ── 각 모듈(제0장 ~ 제9장) 스텝 바이 스텝 본문 ── */}
          {visibleModules.map((mod) => (
            <section
              key={mod.id}
              id={mod.id}
              data-testid={`tutorial-section-${mod.id}`}
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
                    preload="metadata"
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
                          />
                        </div>
                        <figcaption className="text-[14px] font-bold text-slate-600 text-center px-2">
                          ▲ [화면 안내] {step.imageCaption}
                        </figcaption>
                      </figure>

                      {/* 3단 설명 박스: 어디를 누르나요? / 무엇이 바뀌나요? / 왜 중요한가요? */}
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
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 제10장일 때: FAQ 15선 & 부동산 디지털 용어 사전 렌더링 */}
              {mod.id === "module-10" && (
                <div id="faq-section" className="space-y-8 pt-2">
                  {/* FAQ 15선 */}
                  <div className="space-y-4">
                    <h3 className="text-[22px] font-black text-slate-900">
                      🛠️ 자주 묻는 질문과 즉시 해결법 (FAQ 15선)
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
                      📖 60대 중개인을 위한 쉬운 부동산 디지털 용어 사전
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
                    <li>③ 매각가(+100억/+10억 버튼)·층별 임대료·사진 입력 후 [⚡ IM 생성]</li>
                    <li>완성 화면에서 4대 점검(✅) 확인 후 [📥 PPTX 제안서 파일 받기] 클릭</li>
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
        </div>
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
