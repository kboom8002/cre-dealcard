/* eslint-disable @next/next/no-img-element */
"use client";

import React, {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  formatBuildStampBadge,
  getBuildStampInfo,
  QA_OUTBOUND_CHANNEL_POLICY,
  type BuildStampInfo,
} from "@/lib/qa/build-stamp";
import {
  OUTPUT_SHOWCASE_SCENARIOS,
  getShowcaseScenariosByCategory,
  type ShowcaseCategory,
  type ShowcaseFontScale,
  type ShowcaseLiveEntry,
  type ShowcaseManifest,
  type ShowcaseScenarioUnion,
} from "@/lib/qa/output-showcase-scenarios";
import {
  appendQaParamsToHref,
  syncQaKeyFromSearchParams,
  type QaPortalRole,
} from "@/lib/qa/qa-client-auth";

export type ImViewMode = "grid" | "single" | "mobile" | "split";
export type MobileOrOgMode = "mobile" | "og";

export interface ShowcaseScenarioBadge {
  label: string;
  chipClass: string;
}

export interface ShowcaseActiveContext {
  activeCategory: ShowcaseCategory;
  activeScenario: ShowcaseScenarioUnion;
  activeLiveEntry: ShowcaseLiveEntry;
  fontScale: ShowcaseFontScale;
  manifest: ShowcaseManifest | null;
  manifestLoading: boolean;
  buildStamp: BuildStampInfo;
  policySummary: string;
  selectedSlideIdx: number;
}

export interface ShowcaseDeliverableViewerProps {
  portalRole: QaPortalRole;
  eyebrowLabel: string;
  headingTitle: string;
  backHref: string;
  backLabel: string;
  summaryBadgeText: string;
  oracleHeadingLabel?: string;
  slideActionLabel?: string;
  headerRightSlot?: React.ReactNode;
  renderTopBanner?: (ctx: ShowcaseActiveContext) => React.ReactNode;
  getScenarioBadge?: (scenario: ShowcaseScenarioUnion) => ShowcaseScenarioBadge;
  renderScenarioSubBadge?: (scenario: ShowcaseScenarioUnion) => React.ReactNode;
  renderScenarioContextSlot?: (ctx: ShowcaseActiveContext) => React.ReactNode;
  onScenarioChange?: (scenario: ShowcaseScenarioUnion) => void;
  onSlideAction?: (
    slideIndexZeroBased: number,
    scenario: ShowcaseScenarioUnion
  ) => void;
  renderBottomPanel?: (ctx: ShowcaseActiveContext) => React.ReactNode;
}

const CATEGORY_TABS: ReadonlyArray<{
  id: ShowcaseCategory;
  label: string;
  shortLabel: string;
  count: number;
}> = [
  {
    id: "newsletter",
    label: "뉴스레터 6종 (일간·주간·월간)",
    shortLabel: "뉴스레터 6종",
    count: 6,
  },
  {
    id: "dealcard",
    label: "딜카드 8종 (3포스처·블라인드)",
    shortLabel: "딜카드 8종",
    count: 8,
  },
  {
    id: "im",
    label: "모바일·PPTX IM 8종 (전 슬라이드)",
    shortLabel: "모바일·PPTX IM 8종",
    count: 8,
  },
];

const FONT_SCALE_OPTIONS: ReadonlyArray<{
  id: ShowcaseFontScale;
  label: string;
}> = [
  { id: "normal", label: "표준 글씨 (15px)" },
  { id: "large", label: "큰 글씨 (18px)" },
  { id: "xlarge", label: "아주 크게 (21px)" },
];

function isValidCategory(v: string | null): v is ShowcaseCategory {
  return v === "newsletter" || v === "dealcard" || v === "im";
}

export function buildShowcaseFallbackEntry(
  scenario: ShowcaseScenarioUnion,
  brokerSlug?: string | null
): ShowcaseLiveEntry {
  const slug = brokerSlug?.trim() || "";
  if (scenario.category === "dealcard") {
    return {
      caseId: scenario.id,
      category: "dealcard",
      title: scenario.title,
      subtitle: scenario.subtitle,
      postureOrCadence: scenario.card4Posture,
      edgeFocus: scenario.edgeFocus,
      liveUrl: `/dc/${scenario.buildingId}`,
      ogImageUrl: `/api/og/deal/${scenario.buildingId}/kakao-v2`,
      buildingId: scenario.buildingId,
      inputSummary: scenario.inputSummary,
      goldenChecks: [],
      generatedAt: "",
    };
  }
  if (scenario.category === "im") {
    return {
      caseId: scenario.id,
      category: "im",
      title: scenario.title,
      subtitle: scenario.subtitle,
      postureOrCadence: scenario.postureLabel,
      edgeFocus: scenario.edgeFocus,
      liveUrl: `/im-lite/${scenario.buildingId}`,
      ogImageUrl: null,
      pptxDownloadUrl: `/api/public/im-lite/${scenario.buildingId}/pptx?tier=basic&direct=1`,
      pptxSlideUrls: [],
      slideCount: 0,
      buildingId: scenario.buildingId,
      inputSummary: scenario.inputSummary,
      goldenChecks: [],
      generatedAt: "",
    };
  }
  const liveUrl = slug
    ? `/magazine/${encodeURIComponent(slug)}/${encodeURIComponent(scenario.issueDate)}`
    : "/broker/magazine-editor?qa=1";
  const ogImageUrl = slug
    ? `/api/og/magazine?brokerId=${encodeURIComponent(slug)}&date=${encodeURIComponent(
        scenario.issueDate
      )}`
    : null;
  return {
    caseId: scenario.id,
    category: "newsletter",
    title: scenario.title,
    subtitle: scenario.subtitle,
    postureOrCadence: scenario.cadenceLabel,
    edgeFocus: scenario.edgeFocus,
    liveUrl,
    ogImageUrl,
    defaultFontScale: scenario.defaultFontScale,
    inputSummary: scenario.inputSummary,
    goldenChecks: [],
    generatedAt: "",
  };
}

function ShowcaseDeliverableViewerInner({
  portalRole,
  eyebrowLabel,
  headingTitle,
  backHref,
  backLabel,
  summaryBadgeText,
  oracleHeadingLabel = "확인 포인트 (Oracle Checkpoints)",
  slideActionLabel = "✏️ 이 슬라이드 의견",
  headerRightSlot,
  renderTopBanner,
  getScenarioBadge,
  renderScenarioSubBadge,
  renderScenarioContextSlot,
  onScenarioChange,
  onSlideAction,
  renderBottomPanel,
}: ShowcaseDeliverableViewerProps) {
  const searchParams = useSearchParams();
  const initialTabParam = searchParams.get("tab");
  const initialCaseParam = searchParams.get("case");

  useEffect(() => {
    syncQaKeyFromSearchParams(searchParams, portalRole);
  }, [portalRole, searchParams]);

  const resolvedInitialCategory: ShowcaseCategory = useMemo(() => {
    if (initialCaseParam) {
      const matched = OUTPUT_SHOWCASE_SCENARIOS.find(
        (s) => s.id === initialCaseParam
      );
      if (matched) return matched.category;
    }
    return isValidCategory(initialTabParam) ? initialTabParam : "newsletter";
  }, [initialTabParam, initialCaseParam]);

  const resolvedInitialCaseId: string = useMemo(() => {
    if (
      initialCaseParam &&
      OUTPUT_SHOWCASE_SCENARIOS.some((s) => s.id === initialCaseParam)
    ) {
      return initialCaseParam;
    }
    return getShowcaseScenariosByCategory(resolvedInitialCategory)[0].id;
  }, [initialCaseParam, resolvedInitialCategory]);

  const [activeCategory, setActiveCategory] = useState<ShowcaseCategory>(
    resolvedInitialCategory
  );
  const [activeCaseId, setActiveCaseId] = useState<string>(resolvedInitialCaseId);
  const [manifest, setManifest] = useState<ShowcaseManifest | null>(null);
  const [manifestLoading, setManifestLoading] = useState<boolean>(true);
  const [buildStamp, setBuildStamp] = useState<BuildStampInfo>(() =>
    getBuildStampInfo()
  );
  const [policySummary, setPolicySummary] = useState<string>(
    QA_OUTBOUND_CHANNEL_POLICY.summaryLabel
  );

  const [mobileOrOgMode, setMobileOrOgMode] =
    useState<MobileOrOgMode>("mobile");
  const [imViewMode, setImViewMode] = useState<ImViewMode>("grid");
  const [selectedSlideIdx, setSelectedSlideIdx] = useState<number>(0);
  const [lightboxSlideIdx, setLightboxSlideIdx] = useState<number | null>(null);
  const [fontScale, setFontScale] = useState<ShowcaseFontScale>("normal");
  const [pptxDownloading, setPptxDownloading] = useState<boolean>(false);
  const [pptxDownloadStatus, setPptxDownloadStatus] = useState<string>("");
  const [pptxDownloadError, setPptxDownloadError] = useState<boolean>(false);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const categoryScenarios = useMemo(
    () => getShowcaseScenariosByCategory(activeCategory),
    [activeCategory]
  );

  const activeScenario = useMemo<ShowcaseScenarioUnion>(() => {
    return (
      categoryScenarios.find((s) => s.id === activeCaseId) ??
      OUTPUT_SHOWCASE_SCENARIOS.find((s) => s.id === activeCaseId) ??
      categoryScenarios[0]
    );
  }, [categoryScenarios, activeCaseId]);

  const activeLiveEntry = useMemo<ShowcaseLiveEntry>(() => {
    const live = manifest?.entries?.[activeScenario.id];
    if (live) return live;
    return buildShowcaseFallbackEntry(activeScenario, manifest?.brokerSlug);
  }, [manifest, activeScenario]);

  const slideUrls = useMemo(
    () => activeLiveEntry.pptxSlideUrls ?? [],
    [activeLiveEntry]
  );
  const safeSlideIdx =
    slideUrls.length > 0
      ? Math.min(Math.max(selectedSlideIdx, 0), slideUrls.length - 1)
      : 0;

  // Keep parent window text size standard while applying font scale strictly inside preview iframe.
  useEffect(() => {
    try {
      document.documentElement.setAttribute("data-font-scale", "normal");
    } catch {
      // non-blocking
    }
  }, []);

  const applyFontScale = useCallback((scale: ShowcaseFontScale) => {
    setFontScale(scale);
    try {
      const iframeDoc = iframeRef.current?.contentDocument;
      if (iframeDoc?.documentElement) {
        iframeDoc.documentElement.setAttribute("data-font-scale", scale);
      }
      iframeRef.current?.contentWindow?.localStorage?.setItem(
        "cre-font-scale",
        scale
      );
    } catch {
      // ignore cross-origin/sandbox access in test environments
    }
  }, []);

  const handleIframeLoad = useCallback(() => {
    try {
      const iframeDoc = iframeRef.current?.contentDocument;
      if (iframeDoc?.documentElement) {
        iframeDoc.documentElement.setAttribute("data-font-scale", fontScale);
      }
    } catch {
      // ignore
    }
  }, [fontScale]);

  useEffect(() => {
    if (lightboxSlideIdx === null || slideUrls.length === 0) return;
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        setLightboxSlideIdx(null);
      } else if (ev.key === "ArrowLeft") {
        setLightboxSlideIdx((prev) =>
          prev === null ? null : Math.max(0, prev - 1)
        );
      } else if (ev.key === "ArrowRight") {
        setLightboxSlideIdx((prev) =>
          prev === null ? null : Math.min(slideUrls.length - 1, prev + 1)
        );
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightboxSlideIdx, slideUrls.length]);

  useEffect(() => {
    let cancelled = false;
    async function loadManifest() {
      try {
        const res = await fetch("/api/public/qa-workbench?mode=showcase", {
          cache: "no-store",
        });
        if (res.ok) {
          const json = (await res.json()) as {
            ok?: boolean;
            manifest?: ShowcaseManifest | null;
            buildStamp?: BuildStampInfo;
            channelPolicy?: { summaryLabel?: string };
          };
          if (!cancelled && json?.ok) {
            if (json.manifest) setManifest(json.manifest);
            if (json.buildStamp?.shortSha) setBuildStamp(json.buildStamp);
            if (json.channelPolicy?.summaryLabel) {
              setPolicySummary(json.channelPolicy.summaryLabel);
            }
          }
        }
      } catch {
        // Fallback previews remain active
      } finally {
        if (!cancelled) setManifestLoading(false);
      }
    }
    void loadManifest();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleDownloadPptx = useCallback(async () => {
    if (!activeLiveEntry.pptxDownloadUrl || pptxDownloading) return;
    setPptxDownloading(true);
    setPptxDownloadError(false);
    setPptxDownloadStatus(
      "다운로드 중입니다... (.pptx 파일을 생성하고 있습니다. 잠시만 기다려 주세요)"
    );
    try {
      const res = await fetch(activeLiveEntry.pptxDownloadUrl);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const cd = res.headers.get("content-disposition") || "";
      const utfMatch = cd.match(/filename\*=UTF-8''([^;]+)/i);
      const plainMatch = cd.match(/filename="?([^";]+)"?/i);
      const resolvedFilename = utfMatch?.[1]
        ? decodeURIComponent(utfMatch[1])
        : plainMatch?.[1] || `${activeScenario.id}_CREDEAL_IM.pptx`;

      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = resolvedFilename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
      setPptxDownloadStatus(
        `✅ '${resolvedFilename}' 다운로드가 시작되었습니다. 브라우저 다운로드함을 확인해 주세요.`
      );
    } catch {
      setPptxDownloadError(true);
      setPptxDownloadStatus(
        "PPTX 다운로드 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."
      );
    } finally {
      setPptxDownloading(false);
    }
  }, [activeLiveEntry.pptxDownloadUrl, activeScenario.id, pptxDownloading]);

  const handleSelectCategory = useCallback(
    (nextCategory: ShowcaseCategory) => {
      const first = getShowcaseScenariosByCategory(nextCategory)[0];
      setActiveCategory(nextCategory);
      setActiveCaseId(first.id);
      setSelectedSlideIdx(0);
      setLightboxSlideIdx(null);
      setImViewMode("grid");
      setMobileOrOgMode("mobile");
      setPptxDownloadStatus("");
      setPptxDownloadError(false);
      if (first.category === "newsletter") {
        applyFontScale(first.defaultFontScale);
      } else {
        applyFontScale("normal");
      }
      onScenarioChange?.(first);
    },
    [applyFontScale, onScenarioChange]
  );

  const handleSelectScenario = useCallback(
    (scenario: ShowcaseScenarioUnion) => {
      setActiveCategory(scenario.category);
      setActiveCaseId(scenario.id);
      setSelectedSlideIdx(0);
      setLightboxSlideIdx(null);
      setImViewMode("grid");
      setMobileOrOgMode("mobile");
      setPptxDownloadStatus("");
      setPptxDownloadError(false);
      if (scenario.category === "newsletter") {
        applyFontScale(scenario.defaultFontScale);
      }
      onScenarioChange?.(scenario);
    },
    [applyFontScale, onScenarioChange]
  );

  const viewerContext: ShowcaseActiveContext = useMemo(
    () => ({
      activeCategory,
      activeScenario,
      activeLiveEntry,
      fontScale,
      manifest,
      manifestLoading,
      buildStamp,
      policySummary,
      selectedSlideIdx: safeSlideIdx,
    }),
    [
      activeCategory,
      activeScenario,
      activeLiveEntry,
      fontScale,
      manifest,
      manifestLoading,
      buildStamp,
      policySummary,
      safeSlideIdx,
    ]
  );

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-3 sm:px-6 py-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <p className="text-[15px] font-bold text-indigo-700">
                {eyebrowLabel}
              </p>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900">
                {headingTitle}
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {headerRightSlot}
              <Link
                href={appendQaParamsToHref(backHref, portalRole)}
                data-testid="showcase-back-to-signoff"
                className="min-h-[44px] inline-flex items-center justify-center rounded-xl border border-slate-300 bg-slate-100 hover:bg-slate-200 px-4 text-[15px] font-bold text-slate-900 whitespace-nowrap"
              >
                {backLabel}
              </Link>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              data-testid="showcase-build-stamp-badge"
              className="inline-flex items-center min-h-[44px] rounded-xl border border-slate-300 bg-slate-100 px-3 text-[15px] font-bold text-slate-800"
            >
              {formatBuildStampBadge(buildStamp)}
            </span>
            <span
              data-testid="showcase-channel-policy-badge"
              className="inline-flex items-center min-h-[44px] rounded-xl border border-sky-300 bg-sky-50 px-3 text-[15px] font-bold text-sky-900"
            >
              {policySummary}
            </span>
            <span
              data-testid="showcase-summary-badge"
              className="inline-flex items-center min-h-[44px] rounded-xl border border-indigo-300 bg-indigo-50 px-3 text-[15px] font-extrabold text-indigo-900"
            >
              {summaryBadgeText}
            </span>
          </div>

          <nav
            aria-label="산출물 대분류"
            className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1"
          >
            {CATEGORY_TABS.map((tab) => {
              const selected = activeCategory === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  data-testid={`showcase-tab-${tab.id}`}
                  onClick={() => handleSelectCategory(tab.id)}
                  aria-pressed={selected}
                  className={`min-h-[44px] w-full rounded-xl border px-4 py-2 text-left sm:text-center text-[15px] font-extrabold transition-colors cursor-pointer ${
                    selected
                      ? "border-indigo-700 bg-indigo-700 text-white"
                      : "border-slate-300 bg-white text-slate-800 hover:bg-slate-100"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-3 sm:px-6 py-5 space-y-5">
        {renderTopBanner ? renderTopBanner(viewerContext) : null}

        {/* 시나리오 선택 목록 */}
        <section
          aria-label="시나리오 선택"
          className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-extrabold text-slate-900">
              {activeCategory === "newsletter"
                ? "뉴스레터 6종 (표준 3 + 엣지 3)"
                : activeCategory === "dealcard"
                ? "딜카드 8종 (3포스처 + 엣지 5)"
                : "모바일 · PPTX IM 8종 (3포스처 + 엣지 5)"}
            </h2>
            <span className="text-[15px] font-semibold text-slate-600">
              {manifestLoading
                ? "실물 매니페스트 불러오는 중..."
                : manifest
                ? `실물 생성 기준 (${manifest.totalCount}종 연결됨)`
                : "기본 미리보기 모드"}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {categoryScenarios.map((scenario) => {
              const isSelected = scenario.id === activeScenario.id;
              const badge = getScenarioBadge?.(scenario) ?? {
                label: "미확인",
                chipClass: "bg-slate-100 text-slate-700 border-slate-300",
              };
              return (
                <button
                  key={scenario.id}
                  type="button"
                  data-testid={`showcase-case-${scenario.id}`}
                  onClick={() => handleSelectScenario(scenario)}
                  aria-pressed={isSelected}
                  className={`min-h-[44px] w-full rounded-xl border p-3 text-left flex flex-col justify-between gap-2 transition-colors cursor-pointer ${
                    isSelected
                      ? "border-indigo-700 bg-indigo-50 ring-2 ring-indigo-600"
                      : "border-slate-200 bg-slate-50 hover:bg-slate-100"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 w-full">
                    <span className="text-[15px] font-extrabold text-indigo-800">
                      {scenario.id}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-[14px] font-bold ${badge.chipClass}`}
                    >
                      {badge.label}
                    </span>
                  </div>
                  <p className="text-[15px] font-bold text-slate-900 leading-snug">
                    {scenario.title}
                  </p>
                  <p className="text-[15px] text-slate-700 leading-snug">
                    {scenario.edgeFocus}
                  </p>
                  {renderScenarioSubBadge
                    ? renderScenarioSubBadge(scenario)
                    : null}
                </button>
              );
            })}
          </div>
        </section>

        {/* 입력 대조 · 확인 기준 & 글씨 크기 조절 */}
        <section
          data-testid="showcase-oracle-panel"
          className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1 min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center min-h-[44px] rounded-xl bg-slate-900 px-3 text-[15px] font-extrabold text-white">
                  {activeScenario.id}
                </span>
                <span className="text-[15px] font-bold text-indigo-700">
                  {activeLiveEntry.postureOrCadence}
                </span>
              </div>
              <h2 className="text-lg sm:text-xl font-extrabold text-slate-900">
                {activeScenario.title}
              </h2>
              <p className="text-[15px] text-slate-700">
                {activeScenario.subtitle}
              </p>
            </div>

            <a
              href={appendQaParamsToHref(activeLiveEntry.liveUrl, portalRole)}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[44px] inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white hover:bg-slate-100 px-4 text-[15px] font-bold text-slate-900 whitespace-nowrap"
            >
              새 창에서 실화면 열기 ↗
            </a>
          </div>

          {renderScenarioContextSlot
            ? renderScenarioContextSlot(viewerContext)
            : null}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-1.5">
              <h3 className="text-[15px] font-extrabold text-slate-900">
                투입 원재료 (Input)
              </h3>
              <p className="text-[15px] text-slate-800 leading-relaxed">
                {activeScenario.inputSummary}
              </p>
              <p className="text-[15px] font-semibold text-indigo-800">
                핵심 확인 사항: {activeScenario.edgeFocus}
              </p>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 space-y-1.5">
              <h3 className="text-[15px] font-extrabold text-emerald-950">
                {oracleHeadingLabel}
              </h3>
              <ul className="space-y-1 text-[15px] text-emerald-950 list-disc pl-5">
                {activeScenario.oracleCriteria.map((criterion, idx) => (
                  <li key={idx}>{criterion}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-200">
            <span className="text-[15px] font-extrabold text-slate-800 mr-1">
              모바일 글자 크기:
            </span>
            {FONT_SCALE_OPTIONS.map((opt) => {
              const active = fontScale === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  data-testid={`showcase-font-${opt.id}`}
                  onClick={() => applyFontScale(opt.id)}
                  aria-pressed={active}
                  className={`min-h-[44px] rounded-xl border px-3.5 text-[15px] font-bold cursor-pointer ${
                    active
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300 bg-white text-slate-800 hover:bg-slate-100"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* 실물 산출물 뷰어 영역 */}
        {activeCategory !== "im" ? (
          <section
            aria-label="모바일 및 카카오톡 OG 미리보기"
            className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  data-testid="showcase-view-mobile"
                  onClick={() => setMobileOrOgMode("mobile")}
                  aria-pressed={mobileOrOgMode === "mobile"}
                  className={`min-h-[44px] rounded-xl border px-4 text-[15px] font-extrabold cursor-pointer ${
                    mobileOrOgMode === "mobile"
                      ? "border-indigo-700 bg-indigo-700 text-white"
                      : "border-slate-300 bg-white text-slate-800 hover:bg-slate-100"
                  }`}
                >
                  📱 모바일 실화면 (390px)
                </button>
                <button
                  type="button"
                  data-testid="showcase-view-og"
                  onClick={() => setMobileOrOgMode("og")}
                  aria-pressed={mobileOrOgMode === "og"}
                  className={`min-h-[44px] rounded-xl border px-4 text-[15px] font-extrabold cursor-pointer ${
                    mobileOrOgMode === "og"
                      ? "border-indigo-700 bg-indigo-700 text-white"
                      : "border-slate-300 bg-white text-slate-800 hover:bg-slate-100"
                  }`}
                >
                  💬 카톡 공유 OG 카드
                </button>
              </div>
              <span className="text-[15px] text-slate-600 break-all">
                {activeLiveEntry.liveUrl}
              </span>
            </div>

            {mobileOrOgMode === "mobile" ? (
              <div className="w-full sm:w-[398px] max-w-full mx-auto rounded-[28px] border-4 border-slate-800 bg-white overflow-hidden shadow-md">
                <div className="bg-slate-800 text-white px-4 py-2 text-[15px] font-bold flex items-center justify-between">
                  <span>모바일 실화면 390px</span>
                  <span>{fontScale}</span>
                </div>
                <iframe
                  ref={iframeRef}
                  data-testid="showcase-mobile-iframe"
                  src={activeLiveEntry.liveUrl}
                  title={`${activeScenario.id} 모바일 미리보기`}
                  onLoad={handleIframeLoad}
                  className="block w-full h-[760px] border-0 bg-white"
                />
              </div>
            ) : (
              <div className="mx-auto max-w-xl rounded-2xl border border-amber-300 bg-[#BACEE0] p-4 space-y-3">
                <p className="text-[15px] font-extrabold text-slate-900">
                  카카오톡 링크 공유 시 고객 휴대폰에 뜨는 카드 모습
                </p>
                <div className="rounded-2xl overflow-hidden bg-white border border-slate-200 shadow-sm">
                  {activeLiveEntry.ogImageUrl ? (
                    <img
                      data-testid="showcase-og-image"
                      src={activeLiveEntry.ogImageUrl}
                      alt={`${activeScenario.id} 카카오톡 OG 카드 이미지`}
                      className="block w-full aspect-[1200/630] object-cover bg-slate-100"
                    />
                  ) : (
                    <div
                      data-testid="showcase-og-image-empty"
                      className="p-6 text-[15px] font-semibold text-slate-700 bg-slate-100"
                    >
                      OG 이미지를 준비 중이거나 발행 후 확인할 수 있습니다.
                    </div>
                  )}
                  <div className="p-4 space-y-1">
                    <p className="text-[16px] font-extrabold text-slate-900">
                      {activeScenario.title}
                    </p>
                    <p className="text-[15px] text-slate-700">
                      {activeScenario.subtitle}
                    </p>
                    <p className="text-[15px] font-bold text-indigo-700">
                      credeal.net
                    </p>
                  </div>
                </div>
              </div>
            )}
          </section>
        ) : (
          <section
            aria-label="IM 모바일 및 PPTX 전 슬라이드 검수"
            className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  data-testid="showcase-im-mode-grid"
                  onClick={() => setImViewMode("grid")}
                  aria-pressed={imViewMode === "grid"}
                  className={`min-h-[44px] rounded-xl border px-3.5 text-[15px] font-extrabold cursor-pointer ${
                    imViewMode === "grid"
                      ? "border-indigo-700 bg-indigo-700 text-white"
                      : "border-slate-300 bg-white text-slate-800 hover:bg-slate-100"
                  }`}
                >
                  PPTX 전 슬라이드 한눈에
                </button>
                <button
                  type="button"
                  data-testid="showcase-im-mode-single"
                  onClick={() => setImViewMode("single")}
                  aria-pressed={imViewMode === "single"}
                  className={`min-h-[44px] rounded-xl border px-3.5 text-[15px] font-extrabold cursor-pointer ${
                    imViewMode === "single"
                      ? "border-indigo-700 bg-indigo-700 text-white"
                      : "border-slate-300 bg-white text-slate-800 hover:bg-slate-100"
                  }`}
                >
                  PPTX 1장씩 크게
                </button>
                <button
                  type="button"
                  data-testid="showcase-im-mode-mobile"
                  onClick={() => setImViewMode("mobile")}
                  aria-pressed={imViewMode === "mobile"}
                  className={`min-h-[44px] rounded-xl border px-3.5 text-[15px] font-extrabold cursor-pointer ${
                    imViewMode === "mobile"
                      ? "border-indigo-700 bg-indigo-700 text-white"
                      : "border-slate-300 bg-white text-slate-800 hover:bg-slate-100"
                  }`}
                >
                  모바일 IM 390px
                </button>
                <button
                  type="button"
                  data-testid="showcase-im-mode-split"
                  onClick={() => setImViewMode("split")}
                  aria-pressed={imViewMode === "split"}
                  className={`min-h-[44px] rounded-xl border px-3.5 text-[15px] font-extrabold cursor-pointer ${
                    imViewMode === "split"
                      ? "border-indigo-700 bg-indigo-700 text-white"
                      : "border-slate-300 bg-white text-slate-800 hover:bg-slate-100"
                  }`}
                >
                  모바일+PPTX 나란히
                </button>
              </div>

              {activeLiveEntry.pptxDownloadUrl ? (
                <button
                  type="button"
                  data-testid="showcase-pptx-download-btn"
                  disabled={pptxDownloading}
                  onClick={handleDownloadPptx}
                  className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-700 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-70 px-4 text-[15px] font-extrabold text-white cursor-pointer transition active:scale-[0.98]"
                >
                  {pptxDownloading
                    ? "⏳ 다운로드 중입니다..."
                    : "⬇ 실물 .pptx 다운로드"}
                </button>
              ) : null}
            </div>

            {pptxDownloadStatus ? (
              <div
                data-testid="showcase-pptx-download-status"
                role="status"
                aria-live="polite"
                className={`rounded-xl border px-3.5 py-2.5 text-[15px] font-bold ${
                  pptxDownloadError
                    ? "border-rose-300 bg-rose-50 text-rose-900"
                    : "border-emerald-300 bg-emerald-50 text-emerald-950"
                }`}
              >
                {pptxDownloadStatus}
              </div>
            ) : null}

            {imViewMode === "grid" ? (
              slideUrls.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {slideUrls.map((url, idx) => (
                    <article
                      key={`${activeScenario.id}-slide-${idx + 1}`}
                      data-testid={`showcase-slide-card-${idx + 1}`}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2.5 flex flex-col justify-between"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[15px] font-extrabold text-slate-900">
                          슬라이드 {String(idx + 1).padStart(2, "0")}
                        </span>
                        <span className="text-[15px] text-slate-600">
                          클릭하면 크게 보기
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setLightboxSlideIdx(idx)}
                        aria-label={`슬라이드 ${idx + 1} 크게 보기`}
                        className="group relative block w-full cursor-zoom-in rounded-lg overflow-hidden border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
                      >
                        <img
                          data-testid={`showcase-slide-img-${idx + 1}`}
                          src={url}
                          alt={`${activeScenario.id} 슬라이드 ${idx + 1}`}
                          className="block w-full aspect-[16/9] object-contain transition-transform group-hover:scale-[1.01]"
                        />
                        <span className="pointer-events-none absolute bottom-2 right-2 rounded-md bg-slate-900/80 px-2 py-0.5 text-xs font-bold text-white opacity-90 group-hover:opacity-100">
                          🔍 클릭해 확대
                        </span>
                      </button>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setLightboxSlideIdx(idx)}
                          className="min-h-[44px] flex-1 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 px-3 text-[15px] font-bold text-slate-900 cursor-pointer"
                        >
                          크게 보기
                        </button>
                        {onSlideAction ? (
                          <button
                            type="button"
                            data-testid={`showcase-slide-pin-btn-${idx + 1}`}
                            onClick={() => onSlideAction(idx, activeScenario)}
                            className="min-h-[44px] flex-1 rounded-xl border border-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 text-[15px] font-extrabold text-indigo-900 cursor-pointer"
                          >
                            {slideActionLabel}
                          </button>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-[15px] text-amber-950 space-y-2">
                  <p className="font-bold">
                    렌더링된 PPTX 슬라이드 PNG가 아직 매니페스트에 연결되지 않았습니다.
                  </p>
                  <p>
                    상단의 ‘실물 .pptx 다운로드’ 버튼으로 바로 열거나 슬라이드 이미지를 발행한 뒤 확인할 수 있습니다.
                  </p>
                </div>
              )
            ) : null}

            {imViewMode === "single" ? (
              slideUrls.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      data-testid="showcase-slide-prev"
                      disabled={safeSlideIdx <= 0}
                      onClick={() =>
                        setSelectedSlideIdx((i) => Math.max(0, i - 1))
                      }
                      className="min-h-[44px] rounded-xl border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 px-4 text-[15px] font-bold text-slate-900 cursor-pointer"
                    >
                      ← 이전 슬라이드
                    </button>
                    <span className="text-[16px] font-extrabold text-slate-900">
                      슬라이드 {String(safeSlideIdx + 1).padStart(2, "0")} /{" "}
                      {String(slideUrls.length).padStart(2, "0")}
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      {onSlideAction ? (
                        <button
                          type="button"
                          onClick={() =>
                            onSlideAction(safeSlideIdx, activeScenario)
                          }
                          className="min-h-[44px] rounded-xl border border-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-4 text-[15px] font-extrabold text-indigo-900 cursor-pointer"
                        >
                          {slideActionLabel}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        data-testid="showcase-slide-next"
                        disabled={safeSlideIdx >= slideUrls.length - 1}
                        onClick={() =>
                          setSelectedSlideIdx((i) =>
                            Math.min(slideUrls.length - 1, i + 1)
                          )
                        }
                        className="min-h-[44px] rounded-xl border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 px-4 text-[15px] font-bold text-slate-900 cursor-pointer"
                      >
                        다음 슬라이드 →
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLightboxSlideIdx(safeSlideIdx)}
                    aria-label="슬라이드 전체 화면 확대 보기"
                    className="block w-full cursor-zoom-in rounded-xl overflow-hidden border border-slate-300 bg-white"
                  >
                    <img
                      data-testid="showcase-single-slide-img"
                      src={slideUrls[safeSlideIdx]}
                      alt={`${activeScenario.id} 슬라이드 ${safeSlideIdx + 1} 확대`}
                      className="block w-full aspect-[16/9] object-contain"
                    />
                  </button>
                </div>
              ) : (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-[15px] text-amber-950">
                  연결된 슬라이드 PNG가 없습니다.
                </div>
              )
            ) : null}

            {imViewMode === "mobile" ? (
              <div className="w-full sm:w-[398px] max-w-full mx-auto rounded-[28px] border-4 border-slate-800 bg-white overflow-hidden shadow-md">
                <div className="bg-slate-800 text-white px-4 py-2 text-[15px] font-bold flex items-center justify-between">
                  <span>모바일 IM 390px</span>
                  <span>{fontScale}</span>
                </div>
                <iframe
                  ref={iframeRef}
                  data-testid="showcase-mobile-iframe"
                  src={activeLiveEntry.liveUrl}
                  title={`${activeScenario.id} 모바일 IM 미리보기`}
                  onLoad={handleIframeLoad}
                  className="block w-full h-[760px] border-0 bg-white"
                />
              </div>
            ) : null}

            {imViewMode === "split" ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                <div className="w-full sm:w-[398px] max-w-full mx-auto rounded-[28px] border-4 border-slate-800 bg-white overflow-hidden shadow-md">
                  <div className="bg-slate-800 text-white px-4 py-2 text-[15px] font-bold">
                    모바일 IM (390px)
                  </div>
                  <iframe
                    ref={iframeRef}
                    data-testid="showcase-mobile-iframe"
                    src={activeLiveEntry.liveUrl}
                    title={`${activeScenario.id} 모바일 IM 나란히 보기`}
                    onLoad={handleIframeLoad}
                    className="block w-full h-[760px] border-0 bg-white"
                  />
                </div>

                <div className="space-y-3 min-w-0">
                  {slideUrls.length > 0 ? (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[15px] font-extrabold text-slate-900">
                          PPTX 슬라이드{" "}
                          {String(safeSlideIdx + 1).padStart(2, "0")} /{" "}
                          {slideUrls.length}
                        </span>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedSlideIdx((i) => Math.max(0, i - 1))
                            }
                            disabled={safeSlideIdx <= 0}
                            className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 text-[15px] font-bold text-slate-900 disabled:opacity-40 cursor-pointer"
                          >
                            이전
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedSlideIdx((i) =>
                                Math.min(slideUrls.length - 1, i + 1)
                              )
                            }
                            disabled={safeSlideIdx >= slideUrls.length - 1}
                            className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 text-[15px] font-bold text-slate-900 disabled:opacity-40 cursor-pointer"
                          >
                            다음
                          </button>
                          {onSlideAction ? (
                            <button
                              type="button"
                              onClick={() =>
                                onSlideAction(safeSlideIdx, activeScenario)
                              }
                              className="min-h-[44px] rounded-xl border border-indigo-600 bg-indigo-50 px-3 text-[15px] font-extrabold text-indigo-900 cursor-pointer"
                            >
                              ✏️ 의견
                            </button>
                          ) : null}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setLightboxSlideIdx(safeSlideIdx)}
                        aria-label="슬라이드 크게 보기"
                        className="block w-full cursor-zoom-in rounded-xl overflow-hidden border border-slate-300 bg-white"
                      >
                        <img
                          src={slideUrls[safeSlideIdx]}
                          alt={`${activeScenario.id} PPTX 슬라이드 ${safeSlideIdx + 1}`}
                          className="block w-full aspect-[16/9] object-contain"
                        />
                      </button>
                    </>
                  ) : (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-[15px] text-amber-950">
                      연결된 PPTX PNG가 없습니다.
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {/* 슬라이드 클릭 전체 화면 라이트박스 모달 */}
            {lightboxSlideIdx !== null && slideUrls[lightboxSlideIdx] ? (
              <div
                data-testid="showcase-slide-lightbox"
                role="dialog"
                aria-modal="true"
                aria-label={`${activeScenario.id} 슬라이드 ${lightboxSlideIdx + 1} 확대 보기`}
                className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-xs flex flex-col items-center justify-center p-3 sm:p-6"
              >
                <button
                  type="button"
                  aria-label="라이트박스 배경 닫기"
                  onClick={() => setLightboxSlideIdx(null)}
                  className="fixed inset-0 h-full w-full bg-transparent cursor-default"
                />
                <div className="relative z-10 w-full max-w-6xl space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-white">
                    <span className="text-base sm:text-lg font-extrabold">
                      {activeScenario.id} · 슬라이드{" "}
                      {String(lightboxSlideIdx + 1).padStart(2, "0")} /{" "}
                      {String(slideUrls.length).padStart(2, "0")}
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={lightboxSlideIdx <= 0}
                        onClick={() =>
                          setLightboxSlideIdx((prev) =>
                            prev === null ? null : Math.max(0, prev - 1)
                          )
                        }
                        className="min-h-[44px] rounded-xl border border-white/25 bg-white/10 hover:bg-white/20 disabled:opacity-40 px-4 text-[15px] font-bold text-white cursor-pointer"
                      >
                        ← 이전
                      </button>
                      <button
                        type="button"
                        disabled={lightboxSlideIdx >= slideUrls.length - 1}
                        onClick={() =>
                          setLightboxSlideIdx((prev) =>
                            prev === null
                              ? null
                              : Math.min(slideUrls.length - 1, prev + 1)
                          )
                        }
                        className="min-h-[44px] rounded-xl border border-white/25 bg-white/10 hover:bg-white/20 disabled:opacity-40 px-4 text-[15px] font-bold text-white cursor-pointer"
                      >
                        다음 →
                      </button>
                      {onSlideAction ? (
                        <button
                          type="button"
                          onClick={() => {
                            const targetIdx = lightboxSlideIdx;
                            setLightboxSlideIdx(null);
                            onSlideAction(targetIdx, activeScenario);
                          }}
                          className="min-h-[44px] rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 text-[15px] font-extrabold text-white cursor-pointer"
                        >
                          {slideActionLabel} 남기기
                        </button>
                      ) : null}
                      <button
                        type="button"
                        data-testid="showcase-lightbox-close"
                        onClick={() => setLightboxSlideIdx(null)}
                        className="min-h-[44px] rounded-xl bg-white text-slate-900 hover:bg-slate-200 px-4 text-[15px] font-extrabold cursor-pointer"
                      >
                        ✕ 닫기
                      </button>
                    </div>
                  </div>
                  <div className="rounded-xl overflow-hidden bg-white border border-white/20 shadow-2xl">
                    <img
                      src={slideUrls[lightboxSlideIdx]}
                      alt={`${activeScenario.id} 슬라이드 ${lightboxSlideIdx + 1} 전체 화면`}
                      className="block w-full max-h-[78vh] object-contain"
                    />
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        )}

        {renderBottomPanel ? renderBottomPanel(viewerContext) : null}
      </main>
    </div>
  );
}

export function ShowcaseDeliverableViewer(
  props: ShowcaseDeliverableViewerProps
) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 p-6 text-[16px] font-bold text-slate-800">
          최종 산출물 22종 쇼룸을 준비하고 있습니다...
        </div>
      }
    >
      <ShowcaseDeliverableViewerInner {...props} />
    </Suspense>
  );
}
