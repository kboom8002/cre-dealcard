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
  QA_OUTPUT_SHOWCASE_WORKBENCH_ID,
  getShowcaseScenariosByCategory,
  type ShowcaseCategory,
  type ShowcaseFontScale,
  type ShowcaseLiveEntry,
  type ShowcaseManifest,
  type ShowcaseScenarioUnion,
} from "@/lib/qa/output-showcase-scenarios";

type BrokerVerdictStatus = "PASS" | "NEEDS_POLISH" | "FAIL";

interface ShowcaseVerdictRecord {
  status: BrokerVerdictStatus;
  memo?: string;
  updatedAt: string;
}

type ImViewMode = "grid" | "single" | "mobile" | "split";
type MobileOrOgMode = "mobile" | "og";

const SESSION_ID = "qa-output-showcase-broker";
const LOCAL_STORAGE_KEY = "cre_qa_output_showcase_v1";

const CATEGORY_TABS: ReadonlyArray<{
  id: ShowcaseCategory;
  label: string;
  shortLabel: string;
  count: number;
}> = [
  { id: "newsletter", label: "뉴스레터 6종 (일간·주간·월간)", shortLabel: "뉴스레터 6종", count: 6 },
  { id: "dealcard", label: "딜카드 8종 (3포스처·블라인드)", shortLabel: "딜카드 8종", count: 8 },
  { id: "im", label: "모바일·PPTX IM 8종 (전 슬라이드)", shortLabel: "모바일·PPTX IM 8종", count: 8 },
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

function buildFallbackEntry(
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

function verdictBadgeMeta(status?: BrokerVerdictStatus): {
  label: string;
  chipClass: string;
} {
  if (status === "PASS") {
    return {
      label: "적합 (PASS)",
      chipClass: "bg-emerald-100 text-emerald-900 border-emerald-300",
    };
  }
  if (status === "NEEDS_POLISH") {
    return {
      label: "손질 필요",
      chipClass: "bg-amber-100 text-amber-900 border-amber-300",
    };
  }
  if (status === "FAIL") {
    return {
      label: "수정 필수 (FAIL)",
      chipClass: "bg-rose-100 text-rose-900 border-rose-300",
    };
  }
  return {
    label: "미판정",
    chipClass: "bg-slate-100 text-slate-700 border-slate-300",
  };
}

function QaShowcaseInner() {
  const searchParams = useSearchParams();
  const initialTabParam = searchParams.get("tab");
  const initialCaseParam = searchParams.get("case");

  const resolvedInitialCategory: ShowcaseCategory = useMemo(() => {
    if (initialCaseParam) {
      const matched = OUTPUT_SHOWCASE_SCENARIOS.find((s) => s.id === initialCaseParam);
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

  const [activeCategory, setActiveCategory] =
    useState<ShowcaseCategory>(resolvedInitialCategory);
  const [activeCaseId, setActiveCaseId] = useState<string>(resolvedInitialCaseId);
  const [manifest, setManifest] = useState<ShowcaseManifest | null>(null);
  const [manifestLoading, setManifestLoading] = useState<boolean>(true);
  const [buildStamp, setBuildStamp] = useState<BuildStampInfo>(() =>
    getBuildStampInfo()
  );
  const [policySummary, setPolicySummary] = useState<string>(
    QA_OUTBOUND_CHANNEL_POLICY.summaryLabel
  );

  const [mobileOrOgMode, setMobileOrOgMode] = useState<MobileOrOgMode>("mobile");
  const [imViewMode, setImViewMode] = useState<ImViewMode>("grid");
  const [selectedSlideIdx, setSelectedSlideIdx] = useState<number>(0);
  const [fontScale, setFontScale] = useState<ShowcaseFontScale>("normal");

  const [verdicts, setVerdicts] = useState<Record<string, ShowcaseVerdictRecord>>({});
  const [syncMessage, setSyncMessage] = useState<string>("");
  const [submitMessage, setSubmitMessage] = useState<string>("");
  const [submittingAll, setSubmittingAll] = useState<boolean>(false);

  const [pinTargetLabel, setPinTargetLabel] = useState<string>(
    `${resolvedInitialCaseId} · 전체 화면`
  );
  const [originalText, setOriginalText] = useState<string>("");
  const [suggestedText, setSuggestedText] = useState<string>("");
  const [pinNote, setPinNote] = useState<string>("");
  const [pinSubmitting, setPinSubmitting] = useState<boolean>(false);
  const [pinFeedback, setPinFeedback] = useState<string>("");

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const pinNoteInputRef = useRef<HTMLTextAreaElement | null>(null);

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
    return buildFallbackEntry(activeScenario, manifest?.brokerSlug);
  }, [manifest, activeScenario]);

  const slideUrls = useMemo(
    () => activeLiveEntry.pptxSlideUrls ?? [],
    [activeLiveEntry]
  );
  const safeSlideIdx =
    slideUrls.length > 0
      ? Math.min(Math.max(selectedSlideIdx, 0), slideUrls.length - 1)
      : 0;

  const decidedCount = useMemo(
    () =>
      OUTPUT_SHOWCASE_SCENARIOS.filter((s) => Boolean(verdicts[s.id]?.status)).length,
    [verdicts]
  );
  const passCount = useMemo(
    () =>
      OUTPUT_SHOWCASE_SCENARIOS.filter((s) => verdicts[s.id]?.status === "PASS")
        .length,
    [verdicts]
  );
  const polishCount = useMemo(
    () =>
      OUTPUT_SHOWCASE_SCENARIOS.filter(
        (s) => verdicts[s.id]?.status === "NEEDS_POLISH"
      ).length,
    [verdicts]
  );
  const failCount = useMemo(
    () =>
      OUTPUT_SHOWCASE_SCENARIOS.filter((s) => verdicts[s.id]?.status === "FAIL")
        .length,
    [verdicts]
  );

  const applyFontScale = useCallback((scale: ShowcaseFontScale) => {
    setFontScale(scale);
    try {
      window.localStorage.setItem("cre-font-scale", scale);
      document.documentElement.setAttribute("data-font-scale", scale);
    } catch {
      // non-blocking
    }
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
    try {
      const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, ShowcaseVerdictRecord>;
        if (parsed && typeof parsed === "object") {
          setVerdicts(parsed);
        }
      }
    } catch {
      // non-blocking
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadShowcaseData() {
      setManifestLoading(true);
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

      try {
        const sessRes = await fetch(
          `/api/public/qa-workbench?sessionId=${encodeURIComponent(SESSION_ID)}`,
          { cache: "no-store" }
        );
        if (sessRes.ok) {
          const sessJson = (await sessRes.json()) as {
            found?: boolean;
            session?: { records?: Record<string, ShowcaseVerdictRecord> };
          };
          const recs = sessJson?.session?.records;
          if (!cancelled && sessJson?.found && recs && typeof recs === "object") {
            setVerdicts((prev) => ({ ...recs, ...prev }));
          }
        }
      } catch {
        // non-blocking
      }
    }
    loadShowcaseData();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSelectCategory = useCallback((nextCategory: ShowcaseCategory) => {
    const first = getShowcaseScenariosByCategory(nextCategory)[0];
    setActiveCategory(nextCategory);
    setActiveCaseId(first.id);
    setSelectedSlideIdx(0);
    setPinTargetLabel(`${first.id} · 전체 화면`);
    setPinFeedback("");
    if (first.category === "newsletter") {
      applyFontScale(first.defaultFontScale);
    } else {
      applyFontScale("normal");
    }
  }, [applyFontScale]);

  const handleSelectScenario = useCallback(
    (scenario: ShowcaseScenarioUnion) => {
      setActiveCategory(scenario.category);
      setActiveCaseId(scenario.id);
      setSelectedSlideIdx(0);
      setPinTargetLabel(`${scenario.id} · 전체 화면`);
      setPinFeedback("");
      if (scenario.category === "newsletter") {
        applyFontScale(scenario.defaultFontScale);
      }
    },
    [applyFontScale]
  );

  const persistVerdicts = useCallback(
    async (
      nextVerdicts: Record<string, ShowcaseVerdictRecord>,
      mode: "sync" | "submit"
    ) => {
      try {
        window.localStorage.setItem(
          LOCAL_STORAGE_KEY,
          JSON.stringify(nextVerdicts)
        );
      } catch {
        // ignore
      }

      const res = await fetch("/api/public/qa-workbench", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          workbenchId: QA_OUTPUT_SHOWCASE_WORKBENCH_ID,
          sessionId: SESSION_ID,
          testerName: "중개인 쇼룸 검수",
          testerOrg: "output-first-v3",
          records: nextVerdicts,
        }),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      return (await res.json()) as {
        ok?: boolean;
        summary?: { verdictLabel?: string; completedCount?: number };
      };
    },
    []
  );

  const handleSetVerdict = useCallback(
    async (status: BrokerVerdictStatus) => {
      const next: Record<string, ShowcaseVerdictRecord> = {
        ...verdicts,
        [activeScenario.id]: {
          status,
          memo: verdicts[activeScenario.id]?.memo,
          updatedAt: new Date().toISOString(),
        },
      };
      setVerdicts(next);
      const badgeText = verdictBadgeMeta(status).label;
      setSyncMessage(`${activeScenario.id} 판정 '${badgeText}' 저장 중...`);
      try {
        const res = await persistVerdicts(next, "sync");
        setSyncMessage(
          res.summary?.verdictLabel
            ? `저장 완료 · ${res.summary.verdictLabel}`
            : `${activeScenario.id} 판정 '${badgeText}' 서버 동기화 완료`
        );
      } catch {
        setSyncMessage(
          `${activeScenario.id} 판정 '${badgeText}' 브라우저에 임시 저장됨`
        );
      }
    },
    [verdicts, activeScenario.id, persistVerdicts]
  );

  const handleSubmitAllVerdicts = useCallback(async () => {
    setSubmittingAll(true);
    setSubmitMessage("");
    try {
      const res = await persistVerdicts(verdicts, "submit");
      setSubmitMessage(
        res.summary?.verdictLabel
          ? `서버 최종 제출 완료: ${res.summary.verdictLabel}`
          : "현재 22종 판정을 서버에 최종 제출했습니다."
      );
    } catch {
      setSubmitMessage(
        "서버 제출 중 네트워크 오류가 발생했습니다. 브라우저에 임시 보관 중입니다."
      );
    } finally {
      setSubmittingAll(false);
    }
  }, [verdicts, persistVerdicts]);

  const handlePinSlide = useCallback(
    (slideIndexZeroBased: number) => {
      const slideLabel = `${activeScenario.id} · 슬라이드 ${String(
        slideIndexZeroBased + 1
      ).padStart(2, "0")}`;
      setPinTargetLabel(slideLabel);
      setPinFeedback("");
      pinNoteInputRef.current?.focus();
    },
    [activeScenario.id]
  );

  const handleSubmitPin = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmedOrig = originalText.trim();
      const trimmedSuggested = suggestedText.trim();
      const trimmedNote = pinNote.trim();
      const resolvedNote = trimmedNote || trimmedSuggested;

      if (!resolvedNote) {
        setPinFeedback("수정 의견이나 대안 문구를 한 줄 이상 입력해 주세요.");
        return;
      }

      setPinSubmitting(true);
      setPinFeedback("");
      try {
        const workspace =
          activeCategory === "dealcard" ? "dealcards" : activeCategory;
        const isRedPen = Boolean(trimmedOrig || trimmedSuggested);
        const res = await fetch("/api/public/qa-workbench", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "pin",
            sessionId: SESSION_ID,
            authorRole: "broker",
            pinMode: isRedPen ? "redpen" : "issue",
            workspace,
            routePath: activeLiveEntry.liveUrl || "/qa-showcase",
            targetSelector: `[data-showcase-case="${activeScenario.id}"]`,
            targetLabel: pinTargetLabel,
            note: resolvedNote,
            originalText: trimmedOrig || undefined,
            suggestedText: trimmedSuggested || undefined,
            severity: "major",
            fontScale,
            viewport: { width: 390, height: 844 },
          }),
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        setOriginalText("");
        setSuggestedText("");
        setPinNote("");
        setPinFeedback(
          `검수 허브에 '${pinTargetLabel}' 의견을 저장했습니다. (${formatBuildStampBadge(
            buildStamp
          )})`
        );
      } catch {
        setPinFeedback(
          "의견 저장 중 네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."
        );
      } finally {
        setPinSubmitting(false);
      }
    },
    [
      originalText,
      suggestedText,
      pinNote,
      activeCategory,
      activeLiveEntry.liveUrl,
      activeScenario.id,
      pinTargetLabel,
      fontScale,
      buildStamp,
    ]
  );

  const currentVerdict = verdicts[activeScenario.id]?.status;

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-3 sm:px-6 py-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <p className="text-[15px] font-bold text-indigo-700">
                CRE DealCard · v3.0 Output-First 쇼룸
              </p>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900">
                최종 산출물 22종 실물 검수 쇼룸
              </h1>
            </div>
            <Link
              href="/qa-signoff"
              data-testid="showcase-back-to-signoff"
              className="min-h-[44px] inline-flex items-center justify-center rounded-xl border border-slate-300 bg-slate-100 hover:bg-slate-200 px-4 text-[15px] font-bold text-slate-900"
            >
              ← QA 검수 허브(/qa-signoff)로 돌아가기
            </Link>
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
              {decidedCount} / 22 판정 (PASS {passCount} · 손질 {polishCount} · FAIL{" "}
              {failCount})
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
                  className={`min-h-[44px] w-full rounded-xl border px-4 py-2 text-left sm:text-center text-[15px] font-extrabold transition-colors ${
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
                : "기본 미리보기 모드 (E2E 미발행 시 폴백)"}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {categoryScenarios.map((scenario) => {
              const isSelected = scenario.id === activeScenario.id;
              const verdict = verdictBadgeMeta(verdicts[scenario.id]?.status);
              return (
                <button
                  key={scenario.id}
                  type="button"
                  data-testid={`showcase-case-${scenario.id}`}
                  onClick={() => handleSelectScenario(scenario)}
                  aria-pressed={isSelected}
                  className={`min-h-[44px] w-full rounded-xl border p-3 text-left flex flex-col justify-between gap-2 transition-colors ${
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
                      className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-[15px] font-bold ${verdict.chipClass}`}
                    >
                      {verdict.label}
                    </span>
                  </div>
                  <p className="text-[15px] font-bold text-slate-900 leading-snug">
                    {scenario.title}
                  </p>
                  <p className="text-[15px] text-slate-700 leading-snug">
                    {scenario.edgeFocus}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        {/* 입력 대조 · 오라클 기준 & 글씨 크기 조절 */}
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
              <p className="text-[15px] text-slate-700">{activeScenario.subtitle}</p>
            </div>

            <a
              href={activeLiveEntry.liveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[44px] inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white hover:bg-slate-100 px-4 text-[15px] font-bold text-slate-900"
            >
              새 창에서 실화면 열기 ↗
            </a>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-1.5">
              <h3 className="text-[15px] font-extrabold text-slate-900">
                투입 원재료 (Input)
              </h3>
              <p className="text-[15px] text-slate-800 leading-relaxed">
                {activeScenario.inputSummary}
              </p>
              <p className="text-[15px] font-semibold text-indigo-800">
                핵심 검증 포인트: {activeScenario.edgeFocus}
              </p>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 space-y-1.5">
              <h3 className="text-[15px] font-extrabold text-emerald-950">
                중개인 확인 포인트 (Oracle Checkpoints)
              </h3>
              <ul className="space-y-1 text-[15px] text-emerald-950 list-disc pl-5">
                {activeScenario.oracleCriteria.map((criterion, idx) => (
                  <li key={idx}>{criterion}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* 70대 가독성 글자 크기 전환 */}
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
                  className={`min-h-[44px] rounded-xl border px-3.5 text-[15px] font-bold ${
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
                  className={`min-h-[44px] rounded-xl border px-4 text-[15px] font-extrabold ${
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
                  className={`min-h-[44px] rounded-xl border px-4 text-[15px] font-extrabold ${
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
                      OG 이미지를 생성 대기 중이거나 매니페스트 발행 후 확인할 수 있습니다.
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
                  className={`min-h-[44px] rounded-xl border px-3.5 text-[15px] font-extrabold ${
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
                  className={`min-h-[44px] rounded-xl border px-3.5 text-[15px] font-extrabold ${
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
                  className={`min-h-[44px] rounded-xl border px-3.5 text-[15px] font-extrabold ${
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
                  className={`min-h-[44px] rounded-xl border px-3.5 text-[15px] font-extrabold ${
                    imViewMode === "split"
                      ? "border-indigo-700 bg-indigo-700 text-white"
                      : "border-slate-300 bg-white text-slate-800 hover:bg-slate-100"
                  }`}
                >
                  모바일+PPTX 나란히
                </button>
              </div>

              {activeLiveEntry.pptxDownloadUrl ? (
                <a
                  href={activeLiveEntry.pptxDownloadUrl}
                  data-testid="showcase-pptx-download-btn"
                  download
                  className="min-h-[44px] inline-flex items-center justify-center rounded-xl border border-emerald-700 bg-emerald-700 hover:bg-emerald-800 px-4 text-[15px] font-extrabold text-white"
                >
                  ⬇ 실물 .pptx 다운로드
                </a>
              ) : null}
            </div>

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
                          16:9 LibreOffice 렌더
                        </span>
                      </div>
                      <img
                        data-testid={`showcase-slide-img-${idx + 1}`}
                        src={url}
                        alt={`${activeScenario.id} 슬라이드 ${idx + 1}`}
                        className="block w-full aspect-[16/9] object-contain rounded-lg border border-slate-300 bg-white"
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedSlideIdx(idx);
                            setImViewMode("single");
                          }}
                          className="min-h-[44px] flex-1 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 px-3 text-[15px] font-bold text-slate-900"
                        >
                          크게 보기
                        </button>
                        <button
                          type="button"
                          data-testid={`showcase-slide-pin-btn-${idx + 1}`}
                          onClick={() => handlePinSlide(idx)}
                          className="min-h-[44px] flex-1 rounded-xl border border-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 text-[15px] font-extrabold text-indigo-900"
                        >
                          ✏️ 이 슬라이드 의견
                        </button>
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
                    상단의 ‘실물 .pptx 다운로드’ 버튼으로 바로 열거나 Gate 1 골든 E2E를 실행하면 모든 슬라이드 PNG가 자동 탑재됩니다.
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
                      onClick={() => setSelectedSlideIdx((i) => Math.max(0, i - 1))}
                      className="min-h-[44px] rounded-xl border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 px-4 text-[15px] font-bold text-slate-900"
                    >
                      ← 이전 슬라이드
                    </button>
                    <span className="text-[16px] font-extrabold text-slate-900">
                      슬라이드 {String(safeSlideIdx + 1).padStart(2, "0")} /{" "}
                      {String(slideUrls.length).padStart(2, "0")}
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handlePinSlide(safeSlideIdx)}
                        className="min-h-[44px] rounded-xl border border-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-4 text-[15px] font-extrabold text-indigo-900"
                      >
                        ✏️ 이 슬라이드 의견
                      </button>
                      <button
                        type="button"
                        data-testid="showcase-slide-next"
                        disabled={safeSlideIdx >= slideUrls.length - 1}
                        onClick={() =>
                          setSelectedSlideIdx((i) =>
                            Math.min(slideUrls.length - 1, i + 1)
                          )
                        }
                        className="min-h-[44px] rounded-xl border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 px-4 text-[15px] font-bold text-slate-900"
                      >
                        다음 슬라이드 →
                      </button>
                    </div>
                  </div>
                  <img
                    data-testid="showcase-single-slide-img"
                    src={slideUrls[safeSlideIdx]}
                    alt={`${activeScenario.id} 슬라이드 ${safeSlideIdx + 1} 확대`}
                    className="block w-full aspect-[16/9] object-contain rounded-xl border border-slate-300 bg-white"
                  />
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
                          PPTX 슬라이드 {String(safeSlideIdx + 1).padStart(2, "0")} /{" "}
                          {slideUrls.length}
                        </span>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedSlideIdx((i) => Math.max(0, i - 1))
                            }
                            disabled={safeSlideIdx <= 0}
                            className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 text-[15px] font-bold text-slate-900 disabled:opacity-40"
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
                            className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 text-[15px] font-bold text-slate-900 disabled:opacity-40"
                          >
                            다음
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePinSlide(safeSlideIdx)}
                            className="min-h-[44px] rounded-xl border border-indigo-600 bg-indigo-50 px-3 text-[15px] font-extrabold text-indigo-900"
                          >
                            ✏️ 의견
                          </button>
                        </div>
                      </div>
                      <img
                        src={slideUrls[safeSlideIdx]}
                        alt={`${activeScenario.id} PPTX 슬라이드 ${safeSlideIdx + 1}`}
                        className="block w-full aspect-[16/9] object-contain rounded-xl border border-slate-300 bg-white"
                      />
                    </>
                  ) : (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-[15px] text-amber-950">
                      연결된 PPTX PNG가 없습니다.
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </section>
        )}

        {/* 중개인 3단 판정 & Red-Pen 즉시 수정 의견 제출 패널 */}
        <section
          data-testid="showcase-verdict-panel"
          className="rounded-2xl border border-slate-200 bg-white p-4 space-y-5"
        >
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-extrabold text-slate-900">
                중개인 산출물 판정 ({activeScenario.id})
              </h2>
              <button
                type="button"
                data-testid="showcase-submit-all-btn"
                disabled={submittingAll}
                onClick={handleSubmitAllVerdicts}
                className="min-h-[44px] rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 px-4 text-[15px] font-extrabold text-white"
              >
                {submittingAll ? "제출 중..." : "현재 판정 서버 제출"}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <button
                type="button"
                data-testid="showcase-verdict-pass"
                onClick={() => handleSetVerdict("PASS")}
                aria-pressed={currentVerdict === "PASS"}
                className={`min-h-[44px] rounded-xl border px-4 py-2.5 text-[15px] font-extrabold ${
                  currentVerdict === "PASS"
                    ? "border-emerald-700 bg-emerald-700 text-white"
                    : "border-emerald-300 bg-emerald-50 text-emerald-950 hover:bg-emerald-100"
                }`}
              >
                ✅ 고객에게 바로 보내도 됨 (PASS)
              </button>
              <button
                type="button"
                data-testid="showcase-verdict-polish"
                onClick={() => handleSetVerdict("NEEDS_POLISH")}
                aria-pressed={currentVerdict === "NEEDS_POLISH"}
                className={`min-h-[44px] rounded-xl border px-4 py-2.5 text-[15px] font-extrabold ${
                  currentVerdict === "NEEDS_POLISH"
                    ? "border-amber-700 bg-amber-600 text-white"
                    : "border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100"
                }`}
              >
                🛠️ 문구·레이아웃 살짝 다듬기
              </button>
              <button
                type="button"
                data-testid="showcase-verdict-fail"
                onClick={() => handleSetVerdict("FAIL")}
                aria-pressed={currentVerdict === "FAIL"}
                className={`min-h-[44px] rounded-xl border px-4 py-2.5 text-[15px] font-extrabold ${
                  currentVerdict === "FAIL"
                    ? "border-rose-700 bg-rose-700 text-white"
                    : "border-rose-300 bg-rose-50 text-rose-950 hover:bg-rose-100"
                }`}
              >
                🚫 수치·누출·결함 수정 필수 (FAIL)
              </button>
            </div>

            {syncMessage ? (
              <p className="text-[15px] font-semibold text-indigo-800">
                {syncMessage}
              </p>
            ) : null}
            {submitMessage ? (
              <p
                data-testid="showcase-submit-feedback"
                className="text-[15px] font-extrabold text-emerald-800"
              >
                {submitMessage}
              </p>
            ) : null}
          </div>

          <form
            onSubmit={handleSubmitPin}
            className="border-t border-slate-200 pt-4 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[16px] font-extrabold text-slate-900">
                ✏️ Red-Pen 문구 고치기 & 화면 의견 바로 남기기
              </h3>
              <span
                data-testid="showcase-pin-target-label"
                className="inline-flex items-center min-h-[44px] rounded-xl border border-indigo-200 bg-indigo-50 px-3 text-[15px] font-extrabold text-indigo-900"
              >
                대상: {pinTargetLabel}
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <label className="block space-y-1.5">
                <span className="block text-[15px] font-bold text-slate-800">
                  현재 산출물에서 어색한 문구 (선택)
                </span>
                <textarea
                  data-testid="showcase-pin-original-input"
                  value={originalText}
                  onChange={(e) => setOriginalText(e.target.value)}
                  rows={2}
                  placeholder="예: Cap Rate 스프레드가 확대됨"
                  className="w-full min-h-[72px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-[15px] text-slate-900"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="block text-[15px] font-bold text-slate-800">
                  중개인님이 원하시는 표현 (선택)
                </span>
                <textarea
                  data-testid="showcase-pin-suggested-input"
                  value={suggestedText}
                  onChange={(e) => setSuggestedText(e.target.value)}
                  rows={2}
                  placeholder="예: 은행 이자보다 월세 수익률이 조금 더 높습니다"
                  className="w-full min-h-[72px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-[15px] text-slate-900"
                />
              </label>
            </div>

            <label className="block space-y-1.5">
              <span className="block text-[15px] font-bold text-slate-800">
                수정 요청 / 디자인 메모
              </span>
              <textarea
                ref={pinNoteInputRef}
                data-testid="showcase-pin-note-input"
                value={pinNote}
                onChange={(e) => setPinNote(e.target.value)}
                rows={3}
                placeholder="글자 크기, 줄바꿈, 표 정렬, 사진 배치 등 편하게 적어 주세요."
                className="w-full min-h-[84px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-[15px] text-slate-900"
              />
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                data-testid="showcase-pin-submit-btn"
                disabled={pinSubmitting}
                className="min-h-[44px] rounded-xl bg-indigo-700 hover:bg-indigo-800 disabled:opacity-50 px-5 text-[15px] font-extrabold text-white"
              >
                {pinSubmitting ? "저장 중..." : "검수 허브에 의견 저장"}
              </button>
              {pinTargetLabel !== `${activeScenario.id} · 전체 화면` ? (
                <button
                  type="button"
                  onClick={() => setPinTargetLabel(`${activeScenario.id} · 전체 화면`)}
                  className="min-h-[44px] rounded-xl border border-slate-300 bg-white hover:bg-slate-100 px-4 text-[15px] font-bold text-slate-800"
                >
                  대상을 전체 화면으로 되돌리기
                </button>
              ) : null}
            </div>

            {pinFeedback ? (
              <p
                data-testid="showcase-pin-feedback"
                className="text-[15px] font-bold text-emerald-800"
              >
                {pinFeedback}
              </p>
            ) : null}
          </form>
        </section>
      </main>
    </div>
  );
}

export default function QaShowcasePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 p-6 text-[16px] font-bold text-slate-800">
          최종 산출물 22종 쇼룸을 준비하고 있습니다...
        </div>
      }
    >
      <QaShowcaseInner />
    </Suspense>
  );
}
