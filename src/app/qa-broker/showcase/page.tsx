"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  buildQaAuthHeaders,
  getStoredQaAccessKey,
  setStoredQaAccessKey,
} from "@/lib/qa/qa-client-auth";
import {
  QA_BROKER_SHOWCASE_SESSION_ID,
  QA_TESTER_SHOWCASE_SESSION_ID,
  QA_TESTER_SIGNOFF_SESSION_ID,
  ROUND1_REMEDIATION_28_ITEMS,
} from "@/lib/qa/round2-verification-data";

type BrokerVerdictStatus = "PASS" | "NEEDS_POLISH" | "FAIL";

interface ShowcaseVerdictRecord {
  status: BrokerVerdictStatus;
  memo?: string;
  updatedAt: string;
}

interface TesterTechRecord {
  status?: "PASS" | "ISSUE";
  updatedAt?: string;
}

interface BrokerShowcasePinItem {
  id: string;
  targetLabel: string;
  note: string;
  originalText?: string;
  suggestedText?: string;
  authorRole?: string;
  routePath?: string;
  createdAt: string;
}

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
      label: "바로 사용 가능",
      chipClass: "bg-emerald-100 text-emerald-900 border-emerald-300",
    };
  }
  if (status === "NEEDS_POLISH") {
    return {
      label: "조금 다듬기",
      chipClass: "bg-amber-100 text-amber-900 border-amber-300",
    };
  }
  if (status === "FAIL") {
    return {
      label: "보완 필요",
      chipClass: "bg-rose-100 text-rose-900 border-rose-300",
    };
  }
  return {
    label: "미판정",
    chipClass: "bg-slate-100 text-slate-700 border-slate-300",
  };
}

export default function QaBrokerShowcasePage() {
  const [verdicts, setVerdicts] = useState<
    Record<string, ShowcaseVerdictRecord>
  >(() => readInitialVerdicts());
  const [testerTechRecords, setTesterTechRecords] = useState<
    Record<string, TesterTechRecord>
  >({});
  const [brokerPins, setBrokerPins] = useState<BrokerShowcasePinItem[]>([]);

  const [syncMessage, setSyncMessage] = useState<string>("");
  const [submitMessage, setSubmitMessage] = useState<string>("");
  const [submittingAll, setSubmittingAll] = useState<boolean>(false);

  const [showKeyDrawer, setShowKeyDrawer] = useState<boolean>(false);
  const [keyInput, setKeyInput] = useState<string>(() =>
    getStoredQaAccessKey("broker")
  );
  const [keyStatusMsg, setKeyStatusMsg] = useState<string>("");

  const [pinTargetLabel, setPinTargetLabel] = useState<string>("전체 화면");
  const [originalText, setOriginalText] = useState<string>("");
  const [suggestedText, setSuggestedText] = useState<string>("");
  const [pinNote, setPinNote] = useState<string>("");
  const [pinSubmitting, setPinSubmitting] = useState<boolean>(false);
  const [pinFeedback, setPinFeedback] = useState<string>("");

  const pinNoteInputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadBrokerAndTesterStatus() {
      try {
        const [brokerRes, testerRes, signoffRes, pinsRes] = await Promise.all([
          fetch(
            `/api/public/qa-workbench?sessionId=${encodeURIComponent(
              QA_BROKER_SHOWCASE_SESSION_ID
            )}`,
            { cache: "no-store" }
          ),
          fetch(
            `/api/public/qa-workbench?sessionId=${encodeURIComponent(
              QA_TESTER_SHOWCASE_SESSION_ID
            )}`,
            { cache: "no-store" }
          ),
          fetch(
            `/api/public/qa-workbench?sessionId=${encodeURIComponent(
              QA_TESTER_SIGNOFF_SESSION_ID
            )}`,
            { cache: "no-store" }
          ),
          fetch("/api/public/qa-workbench?mode=pins", {
            cache: "no-store",
            headers: {
              ...buildQaAuthHeaders("broker"),
            },
          }),
        ]);

        if (!cancelled && brokerRes.ok) {
          const json = (await brokerRes.json()) as {
            found?: boolean;
            session?: { records?: Record<string, ShowcaseVerdictRecord> };
          };
          const recs = json?.session?.records;
          if (json?.found && recs && typeof recs === "object") {
            setVerdicts((prev) => ({ ...recs, ...prev }));
          }
        }

        let explicitTesterRecs: Record<string, TesterTechRecord> = {};
        if (!cancelled && testerRes.ok) {
          const json = (await testerRes.json()) as {
            found?: boolean;
            session?: { records?: Record<string, TesterTechRecord> };
          };
          const recs = json?.session?.records;
          if (json?.found && recs && typeof recs === "object") {
            explicitTesterRecs = recs;
          }
        }

        const derivedFromR2Signoff: Record<string, TesterTechRecord> = {};
        if (!cancelled && signoffRes.ok) {
          const signoffJson = (await signoffRes.json()) as {
            found?: boolean;
            session?: {
              records?: Record<string, unknown> & {
                r1States?: Record<
                  string,
                  { status?: string; updatedAt?: string }
                >;
              };
            };
          };
          const rawRecords = signoffJson?.session?.records;
          if (signoffJson?.found && rawRecords && typeof rawRecords === "object") {
            const nestedR1 =
              rawRecords.r1States && typeof rawRecords.r1States === "object"
                ? rawRecords.r1States
                : {};
            for (const item of ROUND1_REMEDIATION_28_ITEMS) {
              if (
                item.area !== "showcase" ||
                !item.relatedScenarioIds?.length
              ) {
                continue;
              }
              const entry = (nestedR1[item.id] ?? rawRecords[item.id]) as
                | { status?: string; updatedAt?: string }
                | undefined;
              const rawStatus = entry?.status;
              if (rawStatus !== "pass" && rawStatus !== "fail") continue;
              const mappedStatus: "PASS" | "ISSUE" =
                rawStatus === "fail" ? "ISSUE" : "PASS";
              for (const scenarioId of item.relatedScenarioIds) {
                if (explicitTesterRecs[scenarioId]?.status) continue;
                const prevStatus = derivedFromR2Signoff[scenarioId]?.status;
                if (prevStatus === "ISSUE") continue;
                derivedFromR2Signoff[scenarioId] = {
                  status: mappedStatus,
                  updatedAt: entry?.updatedAt,
                };
              }
            }
          }
        }

        if (
          !cancelled &&
          (Object.keys(explicitTesterRecs).length > 0 ||
            Object.keys(derivedFromR2Signoff).length > 0)
        ) {
          setTesterTechRecords({
            ...derivedFromR2Signoff,
            ...explicitTesterRecs,
          });
        }

        if (!cancelled && pinsRes.ok) {
          const pinsJson = (await pinsRes.json()) as {
            ok?: boolean;
            pins?: BrokerShowcasePinItem[];
          };
          if (pinsJson?.ok && Array.isArray(pinsJson.pins)) {
            setBrokerPins(
              pinsJson.pins.filter((p) => p.authorRole === "broker")
            );
          }
        }
      } catch {
        // non-blocking
      }
    }
    void loadBrokerAndTesterStatus();
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
          ...buildQaAuthHeaders("broker"),
        },
        body: JSON.stringify({
          mode,
          workbenchId: QA_OUTPUT_SHOWCASE_WORKBENCH_ID,
          sessionId: QA_BROKER_SHOWCASE_SESSION_ID,
          testerName: "중개인 쇼룸 감수",
          testerOrg: "qa-broker-portal-v5",
          records: nextVerdicts,
        }),
      });
      if (!res.ok) {
        const errJson = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(errJson?.error || `HTTP ${res.status}`);
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
        setSyncMessage(
          `${caseId} 판정 '${badgeText}' 브라우저에 임시 저장되었습니다.`
        );
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
        "서버 제출 중 오류가 발생했습니다. 브라우저에 임시 보관 중입니다."
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
    (slideIdxZeroBased: number, scenario: ShowcaseScenarioUnion) => {
      setPinTargetLabel(
        `${scenario.id} · 슬라이드 ${String(slideIdxZeroBased + 1).padStart(
          2,
          "0"
        )}`
      );
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
      const resolvedTargetLabel =
        pinTargetLabel === "전체 화면"
          ? `${ctx.activeScenario.id} · 전체 화면`
          : pinTargetLabel;

      const res = await fetch("/api/public/qa-workbench", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...buildQaAuthHeaders("broker"),
        },
        body: JSON.stringify({
          mode: "pin",
          sessionId: QA_BROKER_SHOWCASE_SESSION_ID,
          authorRole: "broker",
          pinMode: isRedPen ? "redpen" : "issue",
          workspace,
          routePath: "/qa-broker/showcase",
          targetSelector: `[data-testid="showcase-case-${ctx.activeScenario.id}"]`,
          targetLabel: resolvedTargetLabel,
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
        pin?: BrokerShowcasePinItem;
      } | null;
      if (!res.ok || !json?.ok) {
        setPinFeedback(
          json?.error || "의견 저장에 실패했습니다. 키 연결을 확인해 주세요."
        );
        return;
      }
      if (json.pin) {
        setBrokerPins((prev) => [json.pin!, ...prev]);
      }
      setOriginalText("");
      setSuggestedText("");
      setPinNote("");
      setPinFeedback(
        "의견이 중개인 감수 보드에 저장되었습니다. 화·목 미팅 안건에 바로 반영됩니다."
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

  const renderScenarioSubBadge = useCallback(
    (scenario: ShowcaseScenarioUnion) => {
      const tech = testerTechRecords[scenario.id]?.status;
      if (tech === "ISSUE") {
        return (
          <span className="inline-flex items-center self-start rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-[12px] font-extrabold text-amber-900">
            ⚠️ 기술 패치 확인 중
          </span>
        );
      }
      if (tech === "PASS") {
        return (
          <span className="inline-flex items-center self-start rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[12px] font-bold text-emerald-900">
            🛡️ 테스터 기술검증 완료
          </span>
        );
      }
      return (
        <span className="inline-flex items-center self-start rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-[12px] font-semibold text-slate-700">
          🔎 사전 기술점검 대기
        </span>
      );
    },
    [testerTechRecords]
  );

  return (
    <ShowcaseDeliverableViewer
      portalRole="broker"
      eyebrowLabel="CRE DealCard · 중개인 전문가 감수 쇼룸"
      headingTitle="실제 고객 발송 산출물 22종 품격·신뢰감 감수"
      backHref="/qa-broker/signoff"
      backLabel="← 중개인 감수 미팅 보드"
      summaryBadgeText={`${decidedCount} / 22 판정 (바로사용 ${passCount} · 다듬기 ${polishCount} · 보완필요 ${failCount})`}
      oracleHeadingLabel="중개인 확인 포인트 (고객 신뢰·품격 기준)"
      slideActionLabel="✏️ 이 슬라이드 의견"
      headerRightSlot={
        <button
          type="button"
          data-testid="broker-showcase-key-btn"
          onClick={() => setShowKeyDrawer((v) => !v)}
          className="min-h-[44px] rounded-xl border border-slate-300 bg-white hover:bg-slate-100 px-3.5 text-[15px] font-bold text-slate-900 cursor-pointer whitespace-nowrap"
        >
          {keyInput ? "🔑 감수 키 연결됨" : "🔒 감수 키 입력"}
        </button>
      }
      renderTopBanner={() =>
        showKeyDrawer ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setStoredQaAccessKey(keyInput, "broker");
              setKeyStatusMsg("중개인 전용 감수 키가 저장되었습니다.");
            }}
            className="rounded-2xl border border-indigo-300 bg-indigo-50 p-4 flex flex-wrap items-center gap-3"
          >
            <span className="text-[15px] font-extrabold text-indigo-950">
              중개인 전용 감수 키 입력
            </span>
            <input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="전달받은 중개인 감수 키를 입력하세요"
              className="min-h-[44px] flex-1 min-w-[220px] rounded-xl border border-indigo-300 bg-white px-3 text-[15px]"
            />
            <button
              type="submit"
              className="min-h-[44px] rounded-xl bg-indigo-700 px-4 text-[15px] font-extrabold text-white cursor-pointer"
            >
              저장
            </button>
            {keyStatusMsg ? (
              <span className="text-[14px] font-bold text-emerald-900">
                {keyStatusMsg}
              </span>
            ) : null}
          </form>
        ) : null
      }
      getScenarioBadge={getScenarioBadge}
      renderScenarioSubBadge={renderScenarioSubBadge}
      renderScenarioContextSlot={(ctx) => {
        const techStatus = testerTechRecords[ctx.activeScenario.id]?.status;
        const isIssue = techStatus === "ISSUE";
        const isPass = techStatus === "PASS";
        return (
          <div
            data-testid="broker-tester-verified-badge"
            className={`rounded-xl border px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 ${
              isIssue
                ? "border-amber-300 bg-amber-50 text-amber-950"
                : isPass
                ? "border-emerald-300 bg-emerald-50 text-emerald-950"
                : "border-sky-200 bg-sky-50 text-sky-950"
            }`}
          >
            <span className="text-[15px] font-extrabold">
              {isIssue
                ? "⚠️ 기술 패치 확인 중 — 일부 화면 요소가 보완 대기 중입니다"
                : isPass
                ? "🛡️ 테스터 기술검증 완료 — 깨짐·오탈자·숫자 오류 사전 점검 마침"
                : "🔎 사전 기술점검 대기 — 테스터 순차 점검 진행 중"}
            </span>
            <span className="text-[14px] font-semibold">
              중개인님께서는 70대 매수자 이해도와 표현 품격만 편하게 봐 주시면 됩니다.
            </span>
          </div>
        );
      }}
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
                  ✅ 손님께 바로 보내도 됨
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
                  🛠️ 문구·배치 조금 다듬기
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
                  ⛔ 수치·표현 보완 필요
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
                  ✏️ 어색한 문구 고치기 & 화면 의견 바로 남기기
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
                    placeholder="예: 대출 금리 대비 임대수익률 차이가 소폭 확대됨"
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
                  placeholder="글자 크기, 어휘, 표 정렬 등 편하게 적어 주세요."
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
                  {pinSubmitting ? "저장 중..." : "감수 보드에 의견 저장"}
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

            {brokerPins.length > 0 ? (
              <div
                data-testid="broker-showcase-pins-list"
                className="border-t border-slate-200 pt-4 space-y-2.5"
              >
                <h3 className="text-[15px] font-extrabold text-slate-900">
                  ✏️ 내가 남긴 의견 확인 ({brokerPins.length}건)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {brokerPins.slice(0, 6).map((pin) => (
                    <div
                      key={pin.id}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1"
                    >
                      <p className="text-[14px] font-extrabold text-slate-900">
                        {pin.targetLabel}
                      </p>
                      {pin.originalText || pin.suggestedText ? (
                        <p className="text-[13px] font-semibold text-indigo-900">
                          “{pin.originalText || "(기존)"}” → “
                          {pin.suggestedText || "(희망 표현)"}”
                        </p>
                      ) : null}
                      <p className="text-[14px] text-slate-700">{pin.note}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        );
      }}
    />
  );
}
