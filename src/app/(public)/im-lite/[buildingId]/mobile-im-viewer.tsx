"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import Script from "next/script";
import type { MobileIMDocument, MobileIMSection } from "@/lib/demo/mobile-im-demo-data";
import { FlatProfileCard } from "@/components/broker/flat-profile-card";
import { HeroCard } from "./hero-card";
import { DCFHeatmap } from "./dcf-heatmap";
import { LeverageChart } from "./leverage-chart";
import { StackingPlanView } from "@/components/im/stacking-plan-view";
import { toast } from "sonner";
import { useDealcardRealtimeSync } from "@/platform/im-pipeline/realtime/use-dealcard-realtime-sync";
import {
  IMInquiryBottomSheet,
  PhotoGallery,
  SectionCard,
  FloatingActionBar,
  ShareButton,
} from "./components";
import { PoweredByBadge } from "@/components/ui/PoweredByBadge";

interface Props {
  document: MobileIMDocument | null;
  buildingId: string;
  ssotData?: Record<string, unknown>;
  docId?: string;
  isBroker?: boolean;
}

export function MobileIMViewer({
  document: doc,
  buildingId,
  ssotData,
  docId,
  isBroker = false,
}: Props) {
  const accentColor = "#60a5fa";

  const [approvalStage, setApprovalStage] = useState<string>(
    (doc as any)?.approval_stage ||
      ((doc as any)?.status === "published" ? "S70_FILE_APPROVAL" : "draft")
  );
  const [pptxFileHash, setPptxFileHash] = useState<string | undefined>(
    (doc as any)?.pptx_file_hash || (doc as any)?.approval_target_hash
  );
  const [pptxDownloadUrl, setPptxDownloadUrl] = useState<string | undefined>(
    (doc as any)?.pptx_download_url || `/api/public/im-lite/${buildingId}/pptx`
  );
  const [verifiedAt, setVerifiedAt] = useState<string | undefined>(
    (doc as any)?.approved_at
  );

  useDealcardRealtimeSync(buildingId, {
    onContentMutated: (payload) => {
      if (payload.targetHash) {
        setPptxFileHash(payload.targetHash);
      }
    },
    onApprovalChanged: (payload) => {
      if (payload.stage) {
        setApprovalStage(payload.stage);
      }
      if (payload.targetHash) {
        setPptxFileHash(payload.targetHash);
      }
      if (payload.fileUrl) {
        setPptxDownloadUrl(payload.fileUrl);
      }
      if (payload.timestamp) {
        setVerifiedAt(payload.timestamp);
      }
    },
  });

  const [openSections, setOpenSections] = useState<Set<string>>(
    new Set(["01_overview"]) // First section open by default
  );
  // [D1] 현재 화면에 보이는 섹션 인덱스
  const [activeSection, setActiveSection] = useState(0);
  // [D4] 언어 전환 (영문 1-Pager)
  const [showInquiry, setShowInquiry] = useState(false);

  const viewedSectionsRef = useRef<Set<string>>(new Set());
  const sectionRefsMap = useRef<Map<string, HTMLDivElement>>(new Map());

  const toggleSection = (sectionId: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  };

  // [D2] PWA Service Worker 등록
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw-im.js").catch((err) => {
        console.warn("[mobile-im-viewer]", err);
      });
    }
  }, []);

  // ── Dwell time and unload tracking ──
  useEffect(() => {
    if (!doc) return;
    const start = Date.now();
    const handleUnload = () => {
      const dwellSeconds = Math.round((Date.now() - start) / 1000);
      const blob = new Blob(
        [
          JSON.stringify({
            dwell_seconds: dwellSeconds,
            blind_name: doc.blindName || doc.fullName,
            referrer: document.referrer,
          }),
        ],
        { type: "application/json" }
      );
      navigator.sendBeacon(`/api/public/im-lite/${buildingId}/view`, blob);
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, [buildingId, doc]);

  // ── View tracking on mount ──────────────────────────────────────────────
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/public/im-lite/${buildingId}/view`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section_viewed: null }),
      signal: controller.signal,
    }).catch((err) => {
      console.warn("[mobile-im-viewer]", err);
    });
    return () => controller.abort();
  }, [buildingId]);

  // ── Section intersection observer — 조회 추적 + [D1] activeSection 갱신
  const setRef = useCallback(
    (sectionId: string) => (el: HTMLDivElement | null) => {
      if (el) sectionRefsMap.current.set(sectionId, el);
      else sectionRefsMap.current.delete(sectionId);
    },
    []
  );

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const sectionId = (entry.target as HTMLElement).dataset.sectionId;
            if (sectionId && !viewedSectionsRef.current.has(sectionId)) {
              viewedSectionsRef.current.add(sectionId);
              fetch(`/api/public/im-lite/${buildingId}/view`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ section_viewed: sectionId }),
              }).catch((err) => {
                console.warn("[mobile-im-viewer]", err);
              });
            }
            // [D1] 현재 화면 상 섹션 인덱스 계산
            const idx =
              doc?.sections.findIndex((s) => s.sectionId === sectionId) ?? -1;
            if (idx >= 0) setActiveSection(idx);
          }
        });
      },
      { threshold: 0.4 }
    );
    sectionRefsMap.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [buildingId, doc?.sections]);

  // Coming-soon state for real buildings
  if (!doc) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-4">📄</div>
          <h1 className="text-xl font-black text-white mb-2">IM Lite 준비 중</h1>
          <p className="text-sm text-neutral-400 leading-relaxed mb-6">
            {(ssotData?.notice as string) ??
              "이 매물의 AI 섹션 생성 기능은 준비 중입니다."}
          </p>
          <Link
            href="/broker/buildings"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-black text-sm font-bold rounded-xl hover:bg-primary/90 transition-colors"
          >
            매물 관리로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  const unlockedCount = doc.sections.filter((s) => !s.locked).length;

  return (
    <div className="min-h-screen bg-neutral-950">
      {/* Omni-Channel Approval Status & Verified PPTX Download Banner */}
      {approvalStage === "S70_FILE_APPROVAL" || doc.status === "published" ? (
        <div className="bg-gradient-to-r from-emerald-950 via-emerald-900/80 to-slate-900 border-b border-emerald-500/50 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 shadow-md">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
              ✓ 공식 승인 완료
            </span>
            {pptxFileHash && (
              <span
                className="text-[11px] font-mono text-emerald-300/80 hidden sm:inline"
                title={pptxFileHash}
              >
                {pptxFileHash.slice(0, 16)}...
              </span>
            )}
            {verifiedAt && (
              <span className="text-[10px] text-neutral-400 hidden xs:inline">
                ({new Date(verifiedAt).toLocaleDateString()} 검증)
              </span>
            )}
          </div>
          <a
            href={pptxDownloadUrl || `/api/public/im-lite/${buildingId}/pptx`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold rounded-lg transition-transform active:scale-95 shadow shrink-0"
          >
            <span>📊</span> 공식 검증 PPTX 다운로드
          </a>
        </div>
      ) : approvalStage === "S60_EDITORIAL_APPROVAL" ? (
        <div className="bg-blue-950/70 border-b border-blue-500/30 px-4 py-2 flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-blue-300 flex items-center gap-1.5">
            <span>📋</span> 슬라이드 편집 승인 완료 (S60) — 바이너리 파일 승인 대기 중
          </span>
          <span className="text-[10px] text-blue-400/80">공식 배포 전 초안</span>
        </div>
      ) : (
        <div className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-2.5 text-center flex items-center justify-center gap-2">
          <p className="text-xs font-bold text-amber-400">
            🔒 미승인 열람용 초안 — 중개인 공식 검수 전 자료이며 워터마크가 적용됩니다.
          </p>
        </div>
      )}

      {/* Grade-based Suppression Banners */}
      {doc.dataQualityBadge?.tier === "draft" && (
        <div className="bg-red-500/10 border-b border-red-500/30 px-4 py-2">
          <p className="text-[11px] text-red-400 text-center">
            🔴 D등급 데이터 — 발행 차단 상태입니다. 핵심 데이터를 보강해 주세요.
          </p>
        </div>
      )}
      {doc.dataQualityBadge?.tier === "reference" && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2">
          <p className="text-[11px] text-amber-400 text-center">
            ⚠️ C등급 데이터 — 총수익률 분석이 제한됩니다. 데이터를 보강하면 더 상세한 분석이 가능합니다.
          </p>
        </div>
      )}
      {doc.dataQualityBadge?.tier === "partial" && !doc.dcf10Year && (
        <div className="bg-blue-500/10 border-b border-blue-500/20 px-4 py-2">
          <p className="text-[11px] text-blue-400 text-center">
            ℹ️ B등급 데이터 — DCF 분석은 A등급 이상에서 제공됩니다. 데이터를 보강해 주세요.
          </p>
        </div>
      )}

      {/* ── Sticky Top Bar ── */}
      <div className="sticky top-0 z-40 bg-neutral-950/90 backdrop-blur-md border-b border-neutral-800/50">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 shrink-0">
            <Link
              href="/broker/buildings?tab=im"
              className="flex items-center gap-1 text-xs text-neutral-400 hover:text-white transition-colors shrink-0"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              IM 보관함
            </Link>
            <Link
              href={`/broker/deal-card/${buildingId}`}
              className="text-xs text-neutral-400 hover:text-white transition-colors hidden xs:inline"
            >
              딜카드
            </Link>
            <Link
              href={`/broker/matching?buildingId=${buildingId}`}
              className="text-xs text-primary/80 hover:text-primary transition-colors font-medium hidden xs:inline"
            >
              매칭
            </Link>
            <Link
              href={`/broker/tenant-intents?buildingId=${buildingId}`}
              className="text-xs text-blue-400/80 hover:text-blue-400 transition-colors font-medium hidden xs:inline"
            >
              임차의향
            </Link>
          </div>

          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded-full text-xs font-bold uppercase tracking-wider shrink-0">
              📄 IM Lite
            </span>
            <span className="text-xs text-neutral-500 truncate hidden sm:block">
              {doc.areaSignal}
            </span>
          </div>

          <ShareButton title={`${doc.blindName} — 모바일 IM Lite`} />
        </div>

        {/* [D1] 섹션 Progress Dots */}
        <div
          className="flex items-center justify-center gap-1.5 py-1.5 overflow-x-auto"
          role="navigation"
          aria-label="IM 섹션 탐색"
        >
          {(doc.sections ?? []).map((section, i) => (
            <button
              key={section.sectionId}
              onClick={() => {
                const el = sectionRefsMap.current.get(section.sectionId);
                el?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className={`transition-all duration-300 rounded-full ${
                i === activeSection
                  ? "w-5 h-1.5 bg-primary"
                  : i < activeSection
                  ? "w-1.5 h-1.5 bg-primary/40"
                  : "w-1.5 h-1.5 bg-neutral-700"
              }`}
              aria-label={`섹션 ${i + 1}`}
              aria-current={i === activeSection ? "step" : undefined}
            />
          ))}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pb-24">
        {/* ── Hero Header ── */}
        <div className="pt-8 pb-6">
          {/* Asset type badge */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="px-3 py-1 bg-neutral-800 border border-neutral-700 rounded-full text-xs font-medium text-neutral-300">
              {doc.assetType}
            </span>
            <span className="px-3 py-1 bg-neutral-800 border border-neutral-700 rounded-full text-xs font-medium text-neutral-300">
              📍 {doc.areaSignal}
            </span>
            <span className="px-3 py-1 bg-neutral-800 border border-neutral-700 rounded-full text-xs font-medium text-neutral-300">
              📏 {doc.sizeSignal}
            </span>
          </div>

          {/* Building blind name */}
          <h1 className="text-2xl sm:text-3xl font-black text-white leading-tight tracking-tight mb-2">
            {doc.blindName}
          </h1>

          {/* Verification & Quality Badges */}
          <div className="flex flex-wrap items-center gap-1.5 mb-3">
            {doc.status === "published" && (
              <>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full text-xs font-bold">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  전문 중개인 검증 완료
                </span>
                {doc.approvedAt && (
                  <span className="text-xs text-neutral-500 font-medium">
                    {new Date(doc.approvedAt).toLocaleDateString("ko-KR")}
                  </span>
                )}
              </>
            )}

            {/* Data Quality Badge */}
            {doc.dataQualityBadge && (
              <span
                className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold border ${
                  doc.dataQualityBadge.tier === "verified"
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    : doc.dataQualityBadge.tier === "partial"
                    ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                    : doc.dataQualityBadge.tier === "reference"
                    ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                    : "bg-red-500/10 text-red-400 border-red-500/20"
                }`}
              >
                {doc.dataQualityBadge.emoji} {doc.dataQualityBadge.label}
              </span>
            )}
          </div>

          {/* Price band */}
          <p className="text-3xl font-black text-primary mb-2">
            {doc.priceBand}
          </p>

          {/* Subtitle — 핵심 투자 하이라이트 헤드카피 */}
          {(doc as any).heroSubtitle && (
            <p className="text-sm font-bold text-emerald-400/90 mb-4 leading-snug">
              {(doc as any).heroSubtitle}
            </p>
          )}

          {/* Generation timestamp */}
          <p className="text-xs text-neutral-600">
            AI 생성: {new Date(doc.generatedAt).toLocaleDateString("ko-KR")} · 크리딜 모바일 IM Lite
          </p>
        </div>

        {/* [C1] Hero Card — 핵심 투자 지표 요약 */}
        {doc.heroCard && <HeroCard data={doc.heroCard} />}

        {/* ── Photo Gallery / Map ── */}
        <PhotoGallery
          photos={doc.photos}
          coordinates={doc.coordinates}
          blindName={doc.blindName}
        />

        {/* ── Section Cards ── */}
        <div className="space-y-3 mb-8">
          {doc.sections
            .filter(
              (s: MobileIMSection) =>
                !(doc as any).hiddenSections?.includes(s.sectionId)
            )
            .map((section: MobileIMSection, index: number) => (
              <div
                key={section.sectionId}
                data-section-id={section.sectionId}
                ref={setRef(section.sectionId)}
              >
                <SectionCard
                  section={section}
                  index={index}
                  isOpen={openSections.has(section.sectionId)}
                  onToggle={() => toggleSection(section.sectionId)}
                />
                {/* 층별 건축 입면 셋백 스태킹 플랜 인터랙티브 뷰 */}
                {(section.sectionId?.includes("lease") ||
                  (section as any).sectionType === "lease_status" ||
                  (section as any).sectionType === "stacking_plan" ||
                  section.sectionId?.includes("stacking")) && (
                  <StackingPlanView
                    stackingPlan={
                      (doc as any).body?.stackingPlan ??
                      (doc as any).stackingPlan
                    }
                    summary={(doc as any).body?.stackingSummary}
                    rawMarkdown={section.content || (section as any).markdown}
                    tables={(section as any).tables}
                    buildingName={doc.blindName || doc.fullName}
                  />
                )}
                {/* [C2][C4] 수익 분석 섹션 다음에 DCF 히트맵 + 레버리지 차트 삽입 */}
                {section.sectionId?.includes("income") && (
                  <>
                    {doc.tier !== "basic" &&
                      doc.dcf10Year &&
                      doc.financials?.waccPct != null && (
                        <div className="mt-3">
                          <DCFHeatmap
                            dcfOutputs={doc.dcf10Year}
                            waccBase={doc.financials.waccPct / 100}
                          />
                        </div>
                      )}
                    {doc.financials &&
                      (doc.financials.equityRequiredBil != null ||
                        doc.financials.totalDepositBil != null ||
                        doc.financials.loanAmountBil != null) && (
                        <div className="mt-3">
                          <LeverageChart
                            equityBil={doc.financials.equityRequiredBil ?? 0}
                            depositBil={doc.financials.totalDepositBil ?? 0}
                            loanBil={doc.financials.loanAmountBil ?? 0}
                            leveragedYieldPct={doc.financials.leveragedYieldPct}
                          />
                        </div>
                      )}
                  </>
                )}

                {/* [P2] 중간 CTA — 3번째 섹션 다음에 삽입 */}
                {index === 2 && (
                  <div className="mt-3 rounded-2xl bg-gradient-to-r from-primary/10 to-blue-500/10 border border-primary/20 p-4">
                    <p className="text-xs font-bold text-primary mb-3">
                      💬 이 매물에 관심이 있으시나요?
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          try {
                            await fetch("/api/public/teaser/event", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                eventType: "intent.interest_tap",
                                buildingId,
                                docId,
                              }),
                            });
                          } catch (err) {
                            console.warn("[mobile-im-viewer]", err);
                          }
                          const btn = document.activeElement as HTMLButtonElement;
                          if (btn) {
                            btn.textContent = "✅ 관심 표시 완료";
                            btn.disabled = true;
                          }
                        }}
                        className="flex-1 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold rounded-xl transition-colors border border-neutral-700"
                      >
                        👍 1-tap 관심
                      </button>
                      <button
                        onClick={() => setShowInquiry(true)}
                        className="flex-1 py-2.5 bg-primary text-black text-xs font-black rounded-xl hover:bg-primary/90 transition-colors"
                      >
                        📄 상세 자료 요청
                      </button>
                    </div>
                  </div>
                )}

                {/* [B4] 프라이빗 IM 신청 CTA — 마지막 섹션 다음 */}
                {index === doc.sections.length - 1 && (
                  <div className="mt-4 space-y-3">
                    <button
                      id="cta-private-im-request"
                      onClick={() => setShowInquiry(true)}
                      className="w-full py-3.5 bg-primary text-black text-sm font-black rounded-2xl hover:bg-primary/90 active:scale-95 transition-all"
                    >
                      📄 프라이빗 투자설명서(IM) 신청
                    </button>

                    {doc.broker.phone && (
                      <a
                        href={`tel:${doc.broker.phone}`}
                        aria-label={`담당 중개인 ${
                          doc.broker.displayName || "브로커"
                        }에게 직통 전화 문의`}
                        className="w-full flex items-center justify-center gap-2 py-3 bg-neutral-900 border border-neutral-700 hover:border-emerald-500/50 text-emerald-400 text-xs font-bold rounded-2xl transition-all"
                      >
                        📞 담당 브로커 직통 전화 문의
                      </a>
                    )}
                  </div>
                )}
              </div>
            ))}
        </div>

        {/* ── 담당 중개인 프로필 카드 ── */}
        {doc.broker.slug !== "cre-dealcard-default" ? (
          <div className="mb-8">
            <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-4 px-1">
              담당 중개인
            </h2>
            <FlatProfileCard
              name={doc.broker.displayName}
              company={doc.broker.company}
              specialty={[
                ...(doc.broker.specialtyRegions ?? []),
                ...(doc.broker.specialtyAssets ?? []),
              ].join(" · ")}
              photoUrl={doc.broker.photoUrl}
              phone={doc.broker.phone}
              email={(doc.broker as any).contactEmail}
              slug={doc.broker.slug}
              dealCount={(doc.broker as any).dealCount ?? 0}
              listingCount={(doc.broker as any).activeCount ?? 0}
              variant="compact"
            />
          </div>
        ) : (
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-5 mb-8">
            <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-4">
              담당 중개인
            </h2>
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-neutral-800 flex items-center justify-center text-2xl">
                👤
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-white text-base">
                  {doc.broker.displayName}
                </p>
                <p className="text-sm text-neutral-400 truncate">
                  {doc.broker.company}
                </p>
              </div>
            </div>
            <a
              href={`tel:${doc.broker.phone}`}
              className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white text-sm font-medium rounded-xl transition-colors"
            >
              📞 전화 상담
            </a>
          </div>
        )}

        {/* ── Inquiry Bottom Sheet ── */}
        {showInquiry && (
          <IMInquiryBottomSheet
            buildingId={buildingId}
            docId={docId}
            brokerUserId={doc.broker.userId}
            brokerName={doc.broker.displayName}
            blindName={doc.blindName}
            onClose={() => setShowInquiry(false)}
          />
        )}

        {/* ── 중개사 허브 바로가기 ── */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4 mb-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-neutral-300 flex items-center gap-1.5">
              <span>⚡</span> 이 매물 중개 허브 바로가기
            </h3>
            <Link
              href={`/broker/deal-card/${buildingId}`}
              className="text-xs text-primary hover:underline font-medium"
            >
              딜카드 보기 →
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Link
              href={`/broker/matching?buildingId=${buildingId}`}
              className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold transition-colors border border-neutral-700/50"
            >
              <span>🎯 AI 매수자 매칭</span>
            </Link>
            <Link
              href={`/broker/tenant-intents?buildingId=${buildingId}`}
              className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold transition-colors border border-neutral-700/50"
            >
              <span>🏢 임차의향서 매칭</span>
            </Link>
          </div>
        </div>

        {/* ── Powered-by Dual Branding Badge ── */}
        <PoweredByBadge variant="full" context="im" buildingId={buildingId} />

        {/* ── Disclaimer ── */}
        <div className="rounded-xl bg-neutral-900/50 border border-neutral-800/50 p-4 mb-4">
          <p className="text-xs text-neutral-600 leading-relaxed">
            <span className="font-bold text-neutral-500">⚠️ 면책 조항 </span>
            {doc.disclaimer}
          </p>
          <p className="text-xs text-neutral-700 mt-2">
            {doc.protectedFieldsRemoved.length > 0 &&
              `보호된 필드: ${doc.protectedFieldsRemoved.join(", ")}`}
          </p>
        </div>
      </div>

      {/* ── Bottom Share Bar ── */}
      <FloatingActionBar
        title={`${doc.blindName} — 모바일 IM Lite`}
        buildingId={buildingId}
        docId={docId}
        tier={doc.tier}
        brokerPhone={doc.broker.phone}
        onInquire={() => setShowInquiry(true)}
        isBroker={isBroker}
        doc={doc}
      />
    </div>
  );
}
