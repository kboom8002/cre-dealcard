"use client";

import React, { useState, useEffect } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  ChevronDown,
  FileText,
  MessageSquare,
  Newspaper,
  Printer,
  ShieldCheck,
  Sparkles,
  UserCircle2,
} from "lucide-react";
import {
  MINIMAL_ESSENTIAL_FAQS,
  MINIMAL_SPACE_GUIDES,
  type MinimalSpaceGuide,
} from "@/lib/tutorial/minimal-guide-data";

function SpaceIcon({ id, color }: { id: MinimalSpaceGuide["id"]; color: string }) {
  const props = { className: "h-5 w-5 shrink-0", style: { color }, "aria-hidden": true as const };
  switch (id) {
    case "magazine":
      return <Newspaper {...props} />;
    case "dealcards":
      return <FileText {...props} />;
    case "im":
      return <Building2 {...props} />;
    case "inbox":
      return <MessageSquare {...props} />;
  }
}

export default function BrokerTutorialClient({ isPrintMode }: { isPrintMode: boolean }) {
  const [isPrintingNow, setIsPrintingNow] = useState(false);
  const expandAllForPrint = isPrintMode || isPrintingNow;

  useEffect(() => {
    const onBeforePrint = () => {
      flushSync(() => setIsPrintingNow(true));
    };
    const onAfterPrint = () => setIsPrintingNow(false);
    window.addEventListener("beforeprint", onBeforePrint);
    window.addEventListener("afterprint", onAfterPrint);
    return () => {
      window.removeEventListener("beforeprint", onBeforePrint);
      window.removeEventListener("afterprint", onAfterPrint);
    };
  }, []);

  const triggerFullPrint = () => {
    flushSync(() => setIsPrintingNow(true));
    window.print();
  };

  return (
      <main
        data-testid="broker-tutorial-page"
        className="w-full min-h-screen bg-[#F5F5F7] text-[#1D1D1F] px-4 py-8 pb-28 text-base leading-relaxed"
      >
        <div className="w-full max-w-4xl mx-auto space-y-8">
          {/* ── 헤더: 1페이지 미니멀 타이틀 + 종이로 인쇄 버튼 ── */}
          <header
            id="module-00"
            className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-2xs space-y-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2 max-w-2xl">
                <p className="text-sm font-bold text-[#1D4ED8]">
                  크리딜 핵심 사용 안내 · 3분 완성
                </p>
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#1D1D1F] leading-snug">
                  4개 공간의 흐름과 3열 규칙만 알면 끝납니다
                </h1>
                <p className="text-base font-medium text-[#515154] leading-relaxed break-keep">
                  버튼 위치를 외울 필요 없습니다. 크리딜은{" "}
                  <strong className="font-bold text-[#1D1D1F]">
                    뉴스 → 딜카드 → IM → 고객 소통
                  </strong>
                  의 영업 순서와{" "}
                  <strong className="font-bold text-[#1D1D1F]">
                    왼쪽(선택) · 가운데(입력) · 오른쪽(미리보기·보내기)
                  </strong>{" "}
                  공통 구조 하나로 움직입니다.
                </p>
              </div>
              <button
                type="button"
                onClick={triggerFullPrint}
                data-testid="tutorial-print-btn"
                className="print:hidden min-h-[44px] inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-4 py-2 text-sm font-bold text-[#1D1D1F] transition-colors cursor-pointer shrink-0"
              >
                <Printer className="h-4 w-4 text-[#515154]" aria-hidden="true" />
                <span>종이로 인쇄</span>
              </button>
            </div>
          </header>

          {/* ── 섹션 1: 크리딜 영업 순환 (정신 모델) ── */}
          <section
            id="module-01"
            aria-labelledby="tutorial-mental-model-heading"
            className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-7 shadow-2xs space-y-5"
          >
            <div className="space-y-1">
              <p className="text-sm font-bold text-[#515154]">1. 전체 그림 (정신 모델)</p>
              <h2
                id="tutorial-mental-model-heading"
                className="text-xl font-extrabold text-[#1D1D1F]"
              >
                상단 4개 색상 탭이 곧 중개 영업의 순서입니다
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {MINIMAL_SPACE_GUIDES.map((space) => (
                <a
                  key={space.id}
                  href={`#${space.anchorId}`}
                  className="group rounded-2xl border border-slate-200 bg-slate-50/60 hover:bg-white hover:border-slate-300 p-4 flex flex-col justify-between gap-3 transition-colors"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm font-bold"
                        style={{ backgroundColor: space.pillBg, color: space.pillText }}
                      >
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: space.accentHex }}
                          aria-hidden="true"
                        />
                        {space.name}
                      </span>
                      <span className="text-sm font-bold text-[#515154]">{space.roleTag}</span>
                    </div>
                    <p className="text-sm font-medium text-[#3A3A3C] leading-relaxed break-keep">
                      {space.oneLiner}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 text-sm font-bold text-[#1D4ED8] group-hover:underline">
                    <span>3단계 보기</span>
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </span>
                </a>
              ))}
            </div>
          </section>

          {/* ── 섹션 2: 공통 3열 UI/UX 규칙 ── */}
          <section
            aria-labelledby="tutorial-3col-heading"
            className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-7 shadow-2xs space-y-5"
          >
            <div className="space-y-1">
              <p className="text-sm font-bold text-[#515154]">2. 공통 화면 규칙</p>
              <h2 id="tutorial-3col-heading" className="text-xl font-extrabold text-[#1D1D1F]">
                어느 공간에 들어가도 왼쪽 · 가운데 · 오른쪽 역할이 같습니다
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              <div className="rounded-2xl border border-slate-200 bg-[#F5F5F7]/70 p-4 space-y-2">
                <span className="inline-block rounded-lg bg-white border border-slate-200 px-2.5 py-1 text-sm font-extrabold text-[#1D1D1F]">
                  왼쪽 열 · 선택
                </span>
                <p className="text-base font-bold text-[#1D1D1F]">목록 고르기 · 새로 만들기</p>
                <p className="text-sm font-medium text-[#515154] leading-relaxed break-keep">
                  작업할 매물·뉴스·고객을 선택하거나 파란색{" "}
                  <strong className="text-[#1D1D1F]">[+ 새로 만들기]</strong> 버튼으로 새 작업을
                  시작합니다.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-[#F5F5F7]/70 p-4 space-y-2">
                <span className="inline-block rounded-lg bg-white border border-slate-200 px-2.5 py-1 text-sm font-extrabold text-[#1D1D1F]">
                  가운데 열 · 입력
                </span>
                <p className="text-base font-bold text-[#1D1D1F]">메모 넣기 · AI 다듬기</p>
                <p className="text-sm font-medium text-[#515154] leading-relaxed break-keep">
                  거친 현장 메모나 주소만 입력하고{" "}
                  <strong className="text-[#1D1D1F]">[AI 다듬기]</strong>를 누르면 초안이
                  채워집니다. 입력 내용은 자동 저장됩니다.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-[#F5F5F7]/70 p-4 space-y-2">
                <span className="inline-block rounded-lg bg-white border border-slate-200 px-2.5 py-1 text-sm font-extrabold text-[#1D1D1F]">
                  오른쪽 열 · 보내기
                </span>
                <p className="text-base font-bold text-[#1D1D1F]">실시간 미리보기 · 공유</p>
                <p className="text-sm font-medium text-[#515154] leading-relaxed break-keep">
                  고객 휴대폰에 보일 화면을 그대로 확인한 뒤{" "}
                  <strong className="text-[#1D1D1F]">노란색 카톡 버튼</strong>이나{" "}
                  <strong className="text-[#1D1D1F]">파란색 실행 버튼</strong>으로 바로 전달합니다.
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3.5 flex items-start gap-2.5 text-sm font-semibold text-amber-950">
              <Sparkles className="h-5 w-5 text-[#B45309] shrink-0 mt-0.5" aria-hidden="true" />
              <p className="leading-relaxed break-keep">
                <strong>안심 규칙:</strong> 이미 보낸 자료를 수정하면 오른쪽 위에 주황색{" "}
                <strong>[변경 내용 반영]</strong> 알림이 뜹니다. 다 고친 뒤 이 버튼을 한 번 눌러야
                고객 링크가 최신 내용으로 바뀝니다.
              </p>
            </div>
          </section>

          {/* ── 섹션 3: 4대 공간별 딱 3단계 핵심 사용법 ── */}
          <section aria-labelledby="tutorial-spaces-heading" className="space-y-4">
            <div className="px-1 space-y-1">
              <p className="text-sm font-bold text-[#515154]">3. 공간별 핵심 3단계</p>
              <h2 id="tutorial-spaces-heading" className="text-xl font-extrabold text-[#1D1D1F]">
                필요한 공간의 3단계만 보고 바로 시작하세요
              </h2>
            </div>

            <div className="space-y-4">
              {MINIMAL_SPACE_GUIDES.map((space) => (
                <article
                  key={space.id}
                  id={space.anchorId}
                  className="scroll-mt-20 rounded-3xl border border-slate-200 bg-white p-6 shadow-2xs space-y-4"
                  style={{ borderLeftWidth: "5px", borderLeftColor: space.accentHex }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <SpaceIcon id={space.id} color={space.accentHex} />
                      <h3 className="text-lg sm:text-xl font-extrabold text-[#1D1D1F]">
                        {space.name}
                      </h3>
                      <span
                        className="rounded-full px-2.5 py-0.5 text-sm font-bold"
                        style={{ backgroundColor: space.pillBg, color: space.pillText }}
                      >
                        {space.roleTag}
                      </span>
                    </div>

                    <Link
                      href={space.href}
                      className="print:hidden min-h-[44px] inline-flex items-center gap-1.5 rounded-xl bg-[#1D4ED8] hover:bg-[#1E40AF] px-4 py-2 text-sm font-bold text-white transition-colors whitespace-nowrap"
                    >
                      <span>{space.ctaLabel}</span>
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </div>

                  <p className="text-base font-medium text-[#3A3A3C] break-keep">
                    {space.oneLiner}
                  </p>

                  <ol className="space-y-2.5">
                    {space.steps.map((stepText, idx) => (
                      <li
                        key={idx}
                        className="flex items-start gap-3 rounded-xl bg-slate-50 border border-slate-200/80 px-4 py-3 text-base font-medium text-[#1D1D1F]"
                      >
                        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#1D1D1F] text-sm font-bold text-white mt-0.5">
                          {idx + 1}
                        </span>
                        <span className="break-keep leading-relaxed">{stepText}</span>
                      </li>
                    ))}
                  </ol>

                  <p className="flex items-start gap-2 text-sm font-semibold text-[#515154]">
                    <CheckCircle2
                      className="h-4 w-4 shrink-0 mt-0.5"
                      style={{ color: space.accentHex }}
                      aria-hidden="true"
                    />
                    <span className="break-keep">{space.keyTip}</span>
                  </p>
                </article>
              ))}
            </div>
          </section>

          {/* ── 섹션 4: 시작 전 1분 설정 & 핵심 FAQ 5선 ── */}
          <section
            id="faq-section"
            aria-labelledby="tutorial-setup-faq-heading"
            className="scroll-mt-20 rounded-3xl border border-slate-200 bg-white p-6 sm:p-7 shadow-2xs space-y-6"
          >
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-start gap-3 max-w-2xl">
                <UserCircle2
                  className="h-6 w-6 text-[#1D4ED8] shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <div className="space-y-1">
                  <h2
                    id="tutorial-setup-faq-heading"
                    className="text-base sm:text-lg font-extrabold text-[#1D1D1F]"
                  >
                    시작 전 딱 한 번만 확인하세요: 내 프로필(중개사무소 정보)
                  </h2>
                  <p className="text-sm font-medium text-[#515154] leading-relaxed break-keep">
                    상호·대표자 성명·중개등록번호·연락처를 한 번만 저장해 두면 모든 딜카드·IM·부동산뉴스
                    하단에 법정 중개사 표시가 자동으로 들어갑니다.
                  </p>
                </div>
              </div>
              <Link
                href="/broker/profile"
                className="print:hidden min-h-[44px] inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 px-4 py-2 text-sm font-bold text-[#1D1D1F] transition-colors whitespace-nowrap"
              >
                <span>내 프로필 확인</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-[#1D1D1F]" aria-hidden="true" />
                <h3 className="text-lg font-extrabold text-[#1D1D1F]">자주 묻는 질문 5선</h3>
              </div>

              <div className="divide-y divide-slate-200 rounded-2xl border border-slate-200 overflow-hidden">
                {MINIMAL_ESSENTIAL_FAQS.map((faq, idx) => (
                  <details
                    key={idx}
                    open={expandAllForPrint ? true : idx === 0}
                    className="group bg-white"
                  >
                    <summary className="min-h-[52px] px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3 cursor-pointer list-none font-bold text-base text-[#1D1D1F] hover:bg-slate-50 transition-colors">
                      <span className="break-keep">
                        Q{idx + 1}. {faq.q}
                      </span>
                      <ChevronDown
                        className="h-5 w-5 text-[#515154] shrink-0 transition-transform group-open:rotate-180 print:hidden"
                        aria-hidden="true"
                      />
                    </summary>
                    <div className="px-4 sm:px-5 pb-4 pt-1 text-base font-medium text-[#3A3A3C] leading-relaxed break-keep bg-slate-50/50">
                      {faq.a}
                    </div>
                  </details>
                ))}
              </div>
            </div>
          </section>
        </div>
      </main>
  );
}
