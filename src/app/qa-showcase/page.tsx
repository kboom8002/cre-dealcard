"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ShowcaseDeliverableViewer,
  type ShowcaseActiveContext,
  type ShowcaseScenarioBadge,
} from "@/components/qa-showcase/ShowcaseDeliverableViewer";
import {
  OUTPUT_SHOWCASE_SCENARIOS,
  QA_OUTPUT_SHOWCASE_WORKBENCH_ID,
  type ShowcaseScenarioUnion,
} from "@/lib/qa/output-showcase-scenarios";
import {
  appendQaParamsToHref,
  buildQaAuthHeaders,
} from "@/lib/qa/qa-client-auth";

type BrokerVerdictStatus = "PASS" | "NEEDS_POLISH" | "FAIL";

interface ShowcaseVerdictRecord {
  status: BrokerVerdictStatus;
  memo?: string;
  updatedAt: string;
}

const SESSION_ID = "qa-output-showcase-broker";
const LOCAL_STORAGE_KEY = "cre_qa_output_showcase_v1";

function readInitialVerdicts(): Record<string, ShowcaseVerdictRecord> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, ShowcaseVerdictRecord>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function verdictBadgeMeta(status?: BrokerVerdictStatus): ShowcaseScenarioBadge {
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

export default function QaShowcasePage() {
  const [verdicts, setVerdicts] = useState<
    Record<string, ShowcaseVerdictRecord>
  >(() => readInitialVerdicts());
  const [syncMessage, setSyncMessage] = useState<string>("");
  const [submitMessage, setSubmitMessage] = useState<string>("");
  const [submittingAll, setSubmittingAll] = useState<boolean>(false);

  const [pinTargetLabel, setPinTargetLabel] = useState<string>("전체 화면");
  const [originalText, setOriginalText] = useState<string>("");
  const [suggestedText, setSuggestedText] = useState<string>("");
  const [pinNote, setPinNote] = useState<string>("");
  const [pinSubmitting, setPinSubmitting] = useState<boolean>(false);
  const [pinFeedback, setPinFeedback] = useState<string>("");

  const pinNoteInputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadSession() {
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
    void loadSession();
    return () => {
      cancelled = true;
    };
  }, []);

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
        headers: {
          "Content-Type": "application/json",
          ...buildQaAuthHeaders(),
        },
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
    async (caseId: string, status: BrokerVerdictStatus) => {
      const next: Record<string, ShowcaseVerdictRecord> = {
        ...verdicts,
        [caseId]: {
          status,
          memo: verdicts[caseId]?.memo,
          updatedAt: new Date().toISOString(),
        },
      };
      setVerdicts(next);
      const badgeText = verdictBadgeMeta(status).label;
      setSyncMessage(`${caseId} 판정 '${badgeText}' 저장 중...`);
      try {
        const res = await persistVerdicts(next, "sync");
        setSyncMessage(
          res.summary?.verdictLabel
            ? `저장 완료 · ${res.summary.verdictLabel}`
            : `${caseId} 판정 '${badgeText}' 서버 동기화 완료`
        );
      } catch {
        setSyncMessage(`${caseId} 판정 '${badgeText}' 브라우저에 임시 저장됨`);
      }
    },
    [verdicts, persistVerdicts]
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

  const handleScenarioChange = useCallback((scenario: ShowcaseScenarioUnion) => {
    setPinTargetLabel(`${scenario.id} · 전체 화면`);
    setPinFeedback("");
  }, []);

  const handleSlideAction = useCallback(
    (slideIndexZeroBased: number, scenario: ShowcaseScenarioUnion) => {
      const slideLabel = `${scenario.id} · 슬라이드 ${String(
        slideIndexZeroBased + 1
      ).padStart(2, "0")}`;
      setPinTargetLabel(slideLabel);
      setPinFeedback("");
      pinNoteInputRef.current?.focus();
    },
    []
  );

  const handleSubmitPin = async (
    e: React.FormEvent,
    ctx: ShowcaseActiveContext
  ) => {
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
        ctx.activeCategory === "dealcard" ? "dealcards" : ctx.activeCategory;
      const isRedPen = Boolean(trimmedOrig || trimmedSuggested);
      const activePinTarget =
        pinTargetLabel === "전체 화면"
          ? `${ctx.activeScenario.id} · 전체 화면`
          : pinTargetLabel;

      const res = await fetch("/api/public/qa-workbench", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...buildQaAuthHeaders(),
        },
        body: JSON.stringify({
          mode: "pin",
          sessionId: SESSION_ID,
          authorRole: "broker",
          pinMode: isRedPen ? "redpen" : "issue",
          workspace,
          routePath: "/qa-showcase",
          targetSelector: `[data-testid="showcase-case-${ctx.activeScenario.id}"]`,
          targetLabel: activePinTarget,
          note: resolvedNote,
          severity: "major",
          fontScale: ctx.fontScale,
          buildSha: ctx.buildStamp.shortSha,
          builtAt: ctx.buildStamp.builtAt,
          originalText: trimmedOrig || undefined,
          suggestedText: trimmedSuggested || undefined,
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
      if (!res.ok || !json?.ok) {
        setPinFeedback(
          json?.error || "의견 저장 중 오류가 발생했습니다. 다시 시도해 주세요."
        );
        return;
      }

      setOriginalText("");
      setSuggestedText("");
      setPinNote("");
      setPinFeedback(
        "의견이 검수 허브(/qa-signoff)에 저장되었습니다. 미팅 보드에서 바로 확인됩니다."
      );
    } catch {
      setPinFeedback("네트워크 오류로 의견을 저장하지 못했습니다.");
    } finally {
      setPinSubmitting(false);
    }
  };

  const decidedCount = useMemo(
    () =>
      OUTPUT_SHOWCASE_SCENARIOS.filter((s) => Boolean(verdicts[s.id]?.status))
        .length,
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

  const getScenarioBadge = useCallback(
    (scenario: ShowcaseScenarioUnion) =>
      verdictBadgeMeta(verdicts[scenario.id]?.status),
    [verdicts]
  );

  return (
    <ShowcaseDeliverableViewer
      portalRole="master"
      eyebrowLabel="CRE DealCard · v3.0 Output-First 쇼룸"
      headingTitle="최종 산출물 22종 실물 검수 쇼룸"
      backHref="/qa-signoff"
      backLabel="← QA 검수 허브(/qa-signoff)로 돌아가기"
      summaryBadgeText={`${decidedCount} / 22 판정 (PASS ${passCount} · 손질 ${polishCount} · FAIL ${failCount})`}
      oracleHeadingLabel="중개인 확인 포인트 (Oracle Checkpoints)"
      slideActionLabel="✏️ 이 슬라이드 의견"
      renderTopBanner={() => (
        <section
          data-testid="showcase-role-portal-banner"
          className="rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3.5 flex flex-wrap items-center justify-between gap-3"
        >
          <div className="space-y-0.5">
            <p className="text-[15px] font-extrabold text-indigo-950">
              v5.0 역할별 전용 포털이 오픈되었습니다
            </p>
            <p className="text-[14px] text-indigo-900">
              일반 테스터(기술·28건 재확인)와 중개인(품격·판정) 화면이 서로 섞이지 않도록 분리되었습니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={appendQaParamsToHref("/qa-tester/showcase", "master")}
              className="min-h-[42px] inline-flex items-center rounded-xl border border-indigo-400 bg-white hover:bg-indigo-100 px-3.5 text-[14px] font-extrabold text-indigo-950"
            >
              🧪 테스터 전용 쇼룸 →
            </Link>
            <Link
              href={appendQaParamsToHref("/qa-broker/showcase", "master")}
              className="min-h-[42px] inline-flex items-center rounded-xl bg-slate-900 hover:bg-slate-800 px-3.5 text-[14px] font-extrabold text-white"
            >
              👔 중개인 전용 쇼룸 →
            </Link>
          </div>
        </section>
      )}
      getScenarioBadge={getScenarioBadge}
      onScenarioChange={handleScenarioChange}
      onSlideAction={handleSlideAction}
      renderBottomPanel={(ctx) => {
        const currentVerdict = verdicts[ctx.activeScenario.id]?.status;
        const activePinTarget =
          pinTargetLabel === "전체 화면"
            ? `${ctx.activeScenario.id} · 전체 화면`
            : pinTargetLabel;

        return (
          <section
            data-testid="showcase-verdict-panel"
            className="rounded-2xl border border-slate-200 bg-white p-4 space-y-5"
          >
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-extrabold text-slate-900">
                  중개인 산출물 판정 ({ctx.activeScenario.id})
                </h2>
                <button
                  type="button"
                  data-testid="showcase-submit-all-btn"
                  disabled={submittingAll}
                  onClick={() => void handleSubmitAllVerdicts()}
                  className="min-h-[44px] rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 px-4 text-[15px] font-extrabold text-white cursor-pointer"
                >
                  {submittingAll ? "제출 중..." : "현재 판정 서버 제출"}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <button
                  type="button"
                  data-testid="showcase-verdict-pass"
                  onClick={() =>
                    void handleSetVerdict(ctx.activeScenario.id, "PASS")
                  }
                  aria-pressed={currentVerdict === "PASS"}
                  className={`min-h-[44px] rounded-xl border px-4 py-2.5 text-[15px] font-extrabold cursor-pointer ${
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
                  onClick={() =>
                    void handleSetVerdict(
                      ctx.activeScenario.id,
                      "NEEDS_POLISH"
                    )
                  }
                  aria-pressed={currentVerdict === "NEEDS_POLISH"}
                  className={`min-h-[44px] rounded-xl border px-4 py-2.5 text-[15px] font-extrabold cursor-pointer ${
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
                  onClick={() =>
                    void handleSetVerdict(ctx.activeScenario.id, "FAIL")
                  }
                  aria-pressed={currentVerdict === "FAIL"}
                  className={`min-h-[44px] rounded-xl border px-4 py-2.5 text-[15px] font-extrabold cursor-pointer ${
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
              onSubmit={(e) => void handleSubmitPin(e, ctx)}
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
                  대상: {activePinTarget}
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
                  className="min-h-[44px] rounded-xl bg-indigo-700 hover:bg-indigo-800 disabled:opacity-50 px-5 text-[15px] font-extrabold text-white cursor-pointer"
                >
                  {pinSubmitting ? "저장 중..." : "검수 허브에 의견 저장"}
                </button>
                {activePinTarget !== `${ctx.activeScenario.id} · 전체 화면` ? (
                  <button
                    type="button"
                    onClick={() =>
                      setPinTargetLabel(`${ctx.activeScenario.id} · 전체 화면`)
                    }
                    className="min-h-[44px] rounded-xl border border-slate-300 bg-white hover:bg-slate-100 px-4 text-[15px] font-bold text-slate-800 cursor-pointer"
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
        );
      }}
    />
  );
}
