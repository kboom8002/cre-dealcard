"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  formatBuildStampBadge,
  getBuildStampInfo,
  QA_OUTBOUND_CHANNEL_POLICY,
  type BuildStampInfo,
} from "@/lib/qa/build-stamp";
import {
  BROKER_AREA_LABELS,
  BROKER_REQUIREMENTS_REGISTRY,
} from "@/lib/qa/broker-requirements-registry";
import { OUTPUT_SHOWCASE_SCENARIOS } from "@/lib/qa/output-showcase-scenarios";
import {
  appendQaParamsToHref,
  buildQaAuthHeaders,
  getStoredQaAccessKey,
  setStoredQaAccessKey,
  syncQaKeyFromSearchParams,
} from "@/lib/qa/qa-client-auth";
import {
  QA_BROKER_SHOWCASE_SESSION_ID,
  QA_BROKER_SIGNOFF_SESSION_ID,
} from "@/lib/qa/round2-verification-data";
import {
  BROKER_PREREQ_REQUEST_TEMPLATE,
  BROKER_RUBRIC_6,
  BROKER_SESSIONS_4,
  QA_BROKER_SESSION_WORKBENCH_ID,
  type BrokerSessionSpec,
} from "@/lib/testguide/qa-signoff-fasttrack-data";

type BrokerVerdictStatus = "PASS" | "NEEDS_POLISH" | "FAIL";

interface ShowcaseVerdictRecord {
  status: BrokerVerdictStatus;
  memo?: string;
  updatedAt?: string;
}

interface BrokerDraftRequest {
  id: string;
  situation: string;
  want: string;
  reason: string;
  example: string;
  createdAt: string;
}

interface BrokerPinRecord {
  id: string;
  workspace: string;
  targetLabel: string;
  note: string;
  originalText?: string;
  suggestedText?: string;
  authorRole?: "tester" | "broker";
  screenshotDataUrl?: string | null;
  createdAt: string;
}

interface BrokerSignoffPersistedState {
  selectedSessionId: BrokerSessionSpec["id"];
  rubricScores: Record<string, number>;
  brConfirmations: Record<string, boolean>;
  agendaChecks: Record<string, boolean>;
  brokerDrafts: BrokerDraftRequest[];
  brokerName: string;
  overallComment: string;
}

const LOCAL_STORAGE_KEY = "cre_qa_broker_signoff_v5";

function readInitialBrokerState(): BrokerSignoffPersistedState {
  const empty: BrokerSignoffPersistedState = {
    selectedSessionId: "S1",
    rubricScores: {},
    brConfirmations: {},
    agendaChecks: {},
    brokerDrafts: [],
    brokerName: "감수 중개인",
    overallComment: "",
  };
  if (typeof window === "undefined") return empty;
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<BrokerSignoffPersistedState>;
    return {
      selectedSessionId: parsed.selectedSessionId ?? "S1",
      rubricScores: parsed.rubricScores ?? {},
      brConfirmations: parsed.brConfirmations ?? {},
      agendaChecks: parsed.agendaChecks ?? {},
      brokerDrafts: Array.isArray(parsed.brokerDrafts)
        ? parsed.brokerDrafts
        : [],
      brokerName: parsed.brokerName || empty.brokerName,
      overallComment: parsed.overallComment || "",
    };
  } catch {
    return empty;
  }
}

function mapBrokerHref(rawHref: string): string {
  const rewritten = rawHref
    .replace("/qa-showcase", "/qa-broker/showcase")
    .replace("/qa-signoff", "/qa-broker/signoff");
  return appendQaParamsToHref(rewritten, "broker");
}

function QaBrokerSignoffInner() {
  const searchParams = useSearchParams();
  const [state, setState] = useState<BrokerSignoffPersistedState>(() =>
    readInitialBrokerState()
  );
  const [showcaseVerdicts, setShowcaseVerdicts] = useState<
    Record<string, ShowcaseVerdictRecord>
  >({});
  const [brokerPins, setBrokerPins] = useState<BrokerPinRecord[]>([]);
  const [buildStamp] = useState<BuildStampInfo>(() => getBuildStampInfo());

  const [showKeyDrawer, setShowKeyDrawer] = useState<boolean>(false);
  const [keyInput, setKeyInput] = useState<string>(() => {
    const urlKey = searchParams?.get("qaKey")?.trim();
    return urlKey || getStoredQaAccessKey("broker");
  });
  const [keySavedMsg, setKeySavedMsg] = useState<string>("");

  const [draftSituation, setDraftSituation] = useState<string>("");
  const [draftWant, setDraftWant] = useState<string>("");
  const [draftReason, setDraftReason] = useState<string>("");
  const [draftExample, setDraftExample] = useState<string>("");

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitMessage, setSubmitMessage] = useState<string>("");
  const [copyToast, setCopyToast] = useState<string>("");

  useEffect(() => {
    syncQaKeyFromSearchParams(searchParams, "broker");
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    async function hydrateBrokerBoard() {
      try {
        const [showcaseRes, signoffRes, pinsRes] = await Promise.all([
          fetch(
            `/api/public/qa-workbench?sessionId=${encodeURIComponent(
              QA_BROKER_SHOWCASE_SESSION_ID
            )}`,
            { cache: "no-store" }
          ),
          fetch(
            `/api/public/qa-workbench?sessionId=${encodeURIComponent(
              QA_BROKER_SIGNOFF_SESSION_ID
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

        if (!cancelled && showcaseRes.ok) {
          const j = (await showcaseRes.json()) as {
            found?: boolean;
            session?: { records?: Record<string, ShowcaseVerdictRecord> };
          };
          if (j?.found && j.session?.records) {
            setShowcaseVerdicts(j.session.records);
          }
        }

        if (!cancelled && signoffRes.ok) {
          const j = (await signoffRes.json()) as {
            found?: boolean;
            session?: { records?: Record<string, unknown> };
          };
          const recs = j?.session?.records;
          if (j?.found && recs && typeof recs === "object") {
            setState((prev) => ({
              ...prev,
              rubricScores: {
                ...((recs.rubricScores as Record<string, number>) ?? {}),
                ...prev.rubricScores,
              },
              brConfirmations: {
                ...((recs.brConfirmations as Record<string, boolean>) ?? {}),
                ...prev.brConfirmations,
              },
              agendaChecks: {
                ...((recs.agendaChecks as Record<string, boolean>) ?? {}),
                ...prev.agendaChecks,
              },
            }));
          }
        }

        if (!cancelled && pinsRes.ok) {
          const j = (await pinsRes.json()) as {
            ok?: boolean;
            pins?: BrokerPinRecord[];
          };
          if (j?.ok && Array.isArray(j.pins)) {
            setBrokerPins(j.pins.filter((p) => p.authorRole === "broker"));
          }
        }
      } catch {
        // non-blocking
      }
    }
    void hydrateBrokerBoard();
    return () => {
      cancelled = true;
    };
  }, []);

  const persistLocal = useCallback((next: BrokerSignoffPersistedState) => {
    setState(next);
    try {
      window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }, []);

  const syncToServer = useCallback(
    async (next: BrokerSignoffPersistedState, mode: "sync" | "submit") => {
      const flatStatuses: Record<string, { status: string; memo?: string }> =
        {};
      for (const item of BROKER_RUBRIC_6) {
        const sc = next.rubricScores[item.id];
        if (typeof sc === "number") {
          flatStatuses[`rubric_${item.id}`] = {
            status: sc >= 3 ? "pass" : "fail",
            memo: `${sc}/5`,
          };
        }
      }

      const res = await fetch("/api/public/qa-workbench", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...buildQaAuthHeaders("broker"),
        },
        body: JSON.stringify({
          mode,
          workbenchId: QA_BROKER_SESSION_WORKBENCH_ID,
          sessionId: QA_BROKER_SIGNOFF_SESSION_ID,
          testerName: next.brokerName,
          testerOrg: "broker-meeting-board-v5",
          records: {
            ...flatStatuses,
            selectedSessionId: next.selectedSessionId,
            rubricScores: next.rubricScores,
            brConfirmations: next.brConfirmations,
            agendaChecks: next.agendaChecks,
            brokerDrafts: next.brokerDrafts,
            overallComment: next.overallComment,
          },
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      return json;
    },
    []
  );

  const handleSetRubric = (criterionId: string, score: number) => {
    const next: BrokerSignoffPersistedState = {
      ...state,
      rubricScores: { ...state.rubricScores, [criterionId]: score },
    };
    persistLocal(next);
    void syncToServer(next, "sync").catch(() => undefined);
  };

  const handleToggleBrConfirm = (brId: string) => {
    const next: BrokerSignoffPersistedState = {
      ...state,
      brConfirmations: {
        ...state.brConfirmations,
        [brId]: !state.brConfirmations[brId],
      },
    };
    persistLocal(next);
    void syncToServer(next, "sync").catch(() => undefined);
  };

  const handleToggleAgenda = (key: string) => {
    const next: BrokerSignoffPersistedState = {
      ...state,
      agendaChecks: {
        ...state.agendaChecks,
        [key]: !state.agendaChecks[key],
      },
    };
    persistLocal(next);
  };

  const handleAddDraftRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftSituation.trim() && !draftWant.trim()) return;
    const item: BrokerDraftRequest = {
      id: `BR-NEW-${state.brokerDrafts.length + 1}`,
      situation: draftSituation.trim(),
      want: draftWant.trim(),
      reason: draftReason.trim(),
      example: draftExample.trim(),
      createdAt: new Date().toISOString(),
    };
    const next: BrokerSignoffPersistedState = {
      ...state,
      brokerDrafts: [item, ...state.brokerDrafts],
    };
    persistLocal(next);
    setDraftSituation("");
    setDraftWant("");
    setDraftReason("");
    setDraftExample("");
    void syncToServer(next, "sync").catch(() => undefined);
  };

  const handleFinalSubmit = async () => {
    setSubmitting(true);
    setSubmitMessage("");
    try {
      await syncToServer(state, "submit");
      setSubmitMessage(
        "☁️ 오늘 회차 중개인 감수 의견 및 6대 기준 채점이 서버에 안전하게 저장되었습니다."
      );
    } catch (err) {
      setSubmitMessage(
        err instanceof Error
          ? `제출 실패: ${err.message}`
          : "저장 중 오류가 발생했습니다."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const showcaseStats = useMemo(() => {
    let pass = 0;
    let polish = 0;
    let fail = 0;
    const revisit: Array<{ id: string; title: string; status: BrokerVerdictStatus }> = [];

    for (const s of OUTPUT_SHOWCASE_SCENARIOS) {
      const st = showcaseVerdicts[s.id]?.status;
      if (st === "PASS") pass += 1;
      else if (st === "NEEDS_POLISH") {
        polish += 1;
        revisit.push({ id: s.id, title: s.title, status: st });
      } else if (st === "FAIL") {
        fail += 1;
        revisit.push({ id: s.id, title: s.title, status: st });
      }
    }
    return {
      pass,
      polish,
      fail,
      decided: pass + polish + fail,
      total: OUTPUT_SHOWCASE_SCENARIOS.length,
      revisit,
    };
  }, [showcaseVerdicts]);

  const rubricStats = useMemo(() => {
    const vals = BROKER_RUBRIC_6.map((c) => state.rubricScores[c.id]).filter(
      (v): v is number => typeof v === "number" && v >= 1 && v <= 5
    );
    if (vals.length === 0) return { count: 0, label: "미채점" };
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    return {
      count: vals.length,
      label: `${avg.toFixed(1)} / 5.0 (${vals.length}/${BROKER_RUBRIC_6.length} 채점)`,
    };
  }, [state.rubricScores]);

  const activeSession = useMemo(
    () =>
      BROKER_SESSIONS_4.find((s) => s.id === state.selectedSessionId) ??
      BROKER_SESSIONS_4[0],
    [state.selectedSessionId]
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200 shadow-2xs">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-1 rounded-lg bg-slate-900 text-white text-[14px] font-extrabold">
                  중개인 전용 감수 보드
                </span>
                <h1 className="text-lg sm:text-xl font-black text-slate-950">
                  화·목 전문가 감수 미팅 보드
                </h1>
              </div>
              <p className="text-[14px] text-slate-600">
                실제 매수 고객에게 그대로 보낼 수준인지 표현의 품격·수치 신뢰감·시간 가치를 편하게 평가해 주세요.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                data-testid="broker-key-status-btn"
                onClick={() => setShowKeyDrawer((v) => !v)}
                className="min-h-[44px] rounded-xl border border-slate-300 bg-white hover:bg-slate-100 px-3.5 text-[14px] font-extrabold text-slate-900 cursor-pointer whitespace-nowrap"
              >
                {keyInput ? "🔑 감수 키 연결됨" : "🔒 감수 키 입력"}
              </button>
              <Link
                href={appendQaParamsToHref("/qa-broker/showcase", "broker")}
                data-testid="broker-open-showcase-link"
                className="min-h-[44px] inline-flex items-center rounded-xl bg-indigo-700 hover:bg-indigo-800 px-4 text-[15px] font-extrabold text-white whitespace-nowrap"
              >
                🎯 22종 실물 산출물 쇼룸 열기 ↗
              </Link>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center min-h-[38px] rounded-xl border border-slate-300 bg-slate-100 px-3 text-[14px] font-bold text-slate-800">
              {formatBuildStampBadge(buildStamp)}
            </span>
            <span className="inline-flex items-center min-h-[38px] rounded-xl border border-sky-300 bg-sky-50 px-3 text-[14px] font-bold text-sky-900">
              {QA_OUTBOUND_CHANNEL_POLICY.summaryLabel}
            </span>
            <span className="inline-flex items-center min-h-[38px] rounded-xl border border-emerald-300 bg-emerald-50 px-3 text-[14px] font-extrabold text-emerald-950">
              🛡️ 사전 기술점검 완료본 기준
            </span>
          </div>

          {showKeyDrawer ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setStoredQaAccessKey(keyInput, "broker");
                setKeySavedMsg("중개인 전용 감수 키가 저장되었습니다.");
              }}
              className="rounded-xl border border-indigo-300 bg-indigo-50 p-3 flex flex-wrap items-center gap-2.5"
            >
              <input
                type="password"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="전달받은 중개인 전용 감수 키 입력"
                className="min-h-[42px] flex-1 min-w-[220px] rounded-xl border border-indigo-300 bg-white px-3 text-[15px]"
              />
              <button
                type="submit"
                className="min-h-[42px] rounded-xl bg-indigo-700 px-4 text-[14px] font-extrabold text-white cursor-pointer"
              >
                저장
              </button>
              {keySavedMsg ? (
                <span className="text-[14px] font-bold text-emerald-900">
                  {keySavedMsg}
                </span>
              ) : null}
            </form>
          ) : null}

          {copyToast ? (
            <div
              role="status"
              className="rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-[14px] font-bold text-emerald-950"
            >
              {copyToast}
            </div>
          ) : null}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* 카드 1: 내 22종 판정 요약판 */}
        <section
          data-testid="broker-verdict-summary-card"
          className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-extrabold text-slate-950">
                1. 내 22종 실물 산출물 판정 요약
              </h2>
              <p className="text-[14px] text-slate-600">
                쇼룸에서 남기신 ‘적합 / 손질 필요 / 수정 필수’ 판정이 자동 집계됩니다.
              </p>
            </div>
            <span className="px-3 py-1 rounded-xl border border-indigo-200 bg-indigo-50 text-[15px] font-extrabold text-indigo-950">
              {showcaseStats.decided} / {showcaseStats.total} 판정 완료
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-center">
              <p className="text-[13px] font-bold text-emerald-900">바로 발송(PASS)</p>
              <p className="text-2xl font-black text-emerald-800">{showcaseStats.pass}</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-center">
              <p className="text-[13px] font-bold text-amber-900">문구 다듬기</p>
              <p className="text-2xl font-black text-amber-800">{showcaseStats.polish}</p>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-center">
              <p className="text-[13px] font-bold text-rose-900">수정 필수(FAIL)</p>
              <p className="text-2xl font-black text-rose-800">{showcaseStats.fail}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
              <p className="text-[13px] font-bold text-slate-700">미판정</p>
              <p className="text-2xl font-black text-slate-900">
                {showcaseStats.total - showcaseStats.decided}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={appendQaParamsToHref(
                "/qa-broker/showcase?tab=newsletter",
                "broker"
              )}
              className="min-h-[42px] inline-flex items-center rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 px-3.5 text-[14px] font-extrabold text-slate-900"
            >
              뉴스레터 6종 쇼룸 열기 ↗
            </Link>
            <Link
              href={appendQaParamsToHref(
                "/qa-broker/showcase?tab=dealcard",
                "broker"
              )}
              className="min-h-[42px] inline-flex items-center rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 px-3.5 text-[14px] font-extrabold text-slate-900"
            >
              딜카드 8종 쇼룸 열기 ↗
            </Link>
            <Link
              href={appendQaParamsToHref("/qa-broker/showcase?tab=im", "broker")}
              className="min-h-[42px] inline-flex items-center rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 px-3.5 text-[14px] font-extrabold text-slate-900"
            >
              모바일·PPTX IM 8종 쇼룸 열기 ↗
            </Link>
          </div>

          {showcaseStats.revisit.length > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 space-y-2">
              <p className="text-[14px] font-extrabold text-amber-950">
                재확인·손질 대상 사례 바로가기 ({showcaseStats.revisit.length}건)
              </p>
              <div className="flex flex-wrap gap-2">
                {showcaseStats.revisit.map((item) => (
                  <Link
                    key={item.id}
                    href={appendQaParamsToHref(
                      `/qa-broker/showcase?case=${item.id}`,
                      "broker"
                    )}
                    className="min-h-[38px] inline-flex items-center rounded-lg border border-amber-300 bg-white hover:bg-amber-100 px-3 text-[13px] font-extrabold text-slate-900"
                  >
                    {item.id} ({item.status === "FAIL" ? "수정 필수" : "다듬기"}) ↗
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        {/* 카드 2: 화·목 1~4회차 안건 & 기요청 12건 반영 확인표 */}
        <section
          data-testid="broker-session-agenda-card"
          className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-extrabold text-slate-950">
                2. 화·목 1~4회차 감수 안건 & 기요청 12건 확인
              </h2>
              <p className="text-[14px] text-slate-600">
                회차별 핵심 의사결정 사항과 지난 미팅에서 요청하신 12개 항목의 반영 여부를 확인합니다.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard
                  ?.writeText(BROKER_PREREQ_REQUEST_TEMPLATE)
                  .catch(() => undefined);
                setCopyToast("📋 사전 매물·인사말 요청 문구를 복사했습니다.");
              }}
              className="min-h-[42px] rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 px-3.5 text-[14px] font-bold text-slate-900 cursor-pointer"
            >
              📋 사전 자료 요청 문구 복사
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {BROKER_SESSIONS_4.map((sess) => {
              const selected = sess.id === activeSession.id;
              return (
                <button
                  key={sess.id}
                  type="button"
                  data-testid={`broker-session-tab-${sess.id}`}
                  onClick={() =>
                    persistLocal({ ...state, selectedSessionId: sess.id })
                  }
                  aria-pressed={selected}
                  className={`min-h-[44px] rounded-xl border px-3 py-2 text-[14px] font-extrabold cursor-pointer ${
                    selected
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300 bg-white text-slate-800 hover:bg-slate-100"
                  }`}
                >
                  {sess.label}
                </button>
              );
            })}
          </div>

          <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 space-y-3">
            <p className="text-[13px] font-extrabold text-indigo-800">
              {activeSession.cycleNote}
            </p>
            <h3 className="text-base font-extrabold text-slate-950">
              {activeSession.focusTitle}
            </h3>
            <div className="space-y-2.5">
              {activeSession.tasks.map((task) => (
                <div
                  key={task.id}
                  className="rounded-xl border border-slate-200 bg-white p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <p className="text-[15px] font-extrabold text-slate-950">
                      {task.title}
                    </p>
                    <p className="text-[14px] text-slate-700">
                      {task.promptQuestion}
                    </p>
                  </div>
                  <Link
                    href={mapBrokerHref(task.targetHref)}
                    className="min-h-[42px] shrink-0 inline-flex items-center rounded-xl bg-slate-900 hover:bg-slate-800 px-3.5 text-[14px] font-extrabold text-white"
                  >
                    화면 열기 ↗
                  </Link>
                </div>
              ))}
            </div>

            <div className="space-y-1.5 pt-2">
              <p className="text-[14px] font-extrabold text-slate-900">
                이번 회차 결정 안건
              </p>
              {activeSession.agendaItems.map((agenda, idx) => {
                const checkKey = `${activeSession.id}-agenda-${idx}`;
                const checked = Boolean(state.agendaChecks[checkKey]);
                return (
                  <label
                    key={checkKey}
                    className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-white p-2.5 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => handleToggleAgenda(checkKey)}
                      className="mt-1 h-4 w-4"
                    />
                    <span className="text-[14px] text-slate-800">{agenda}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* 기요청 12건 반영 확인표 (기술 파일명 비노출) */}
          <div className="space-y-2.5 pt-2 border-t border-slate-200">
            <h3 className="text-base font-extrabold text-slate-950">
              기요청 12건 반영 확인표 (중개인 최종 확인)
            </h3>
            <div className="space-y-2">
              {BROKER_REQUIREMENTS_REGISTRY.map((reqItem) => {
                const confirmed = Boolean(state.brConfirmations[reqItem.id]);
                return (
                  <div
                    key={reqItem.id}
                    data-testid={`broker-br-row-${reqItem.id}`}
                    className={`rounded-xl border p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      confirmed
                        ? "border-emerald-300 bg-emerald-50/50"
                        : "border-slate-200 bg-slate-50"
                    }`}
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md bg-slate-900 text-white text-[12px] font-extrabold">
                          {reqItem.id}
                        </span>
                        <span className="text-[12px] font-bold text-indigo-800">
                          {BROKER_AREA_LABELS[reqItem.area]}
                        </span>
                      </div>
                      <p className="text-[15px] font-bold text-slate-950">
                        {reqItem.title}
                      </p>
                      <p className="text-[14px] text-slate-700">
                        {reqItem.acceptanceCriteria}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleBrConfirm(reqItem.id)}
                      aria-pressed={confirmed}
                      className={`min-h-[42px] shrink-0 rounded-xl border px-3.5 text-[14px] font-extrabold cursor-pointer ${
                        confirmed
                          ? "border-emerald-700 bg-emerald-700 text-white"
                          : "border-slate-300 bg-white text-slate-800 hover:bg-slate-100"
                      }`}
                    >
                      {confirmed ? "✓ 중개인 확인 완료" : "확인 체크"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* 카드 3: 전문가 6대 기준 & 4칸 새 요청 & 제출 */}
        <section
          data-testid="broker-rubric-submit-card"
          className="rounded-2xl border border-slate-200 bg-white p-5 space-y-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-extrabold text-slate-950">
                3. 전문가 6대 기준 채점 (1~5점) & 새 요청 남기기
              </h2>
              <p className="text-[14px] text-slate-600">
                현업 중개사의 눈높이에서 1점(개선 필요)~5점(바로 활용)으로 평가해 주세요.
              </p>
            </div>
            <span
              data-testid="broker-rubric-avg-badge"
              className="px-3 py-1 rounded-xl border border-indigo-200 bg-indigo-50 text-[15px] font-extrabold text-indigo-950"
            >
              {rubricStats.label}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {BROKER_RUBRIC_6.map((criterion) => {
              const currentScore = state.rubricScores[criterion.id];
              return (
                <div
                  key={criterion.id}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[15px] font-extrabold text-slate-950">
                      {criterion.label}
                    </span>
                    <span className="text-[13px] font-semibold text-slate-600">
                      {criterion.lowAnchor} ↔ {criterion.highAnchor}
                    </span>
                  </div>
                  <div className="grid grid-cols-5 gap-1.5">
                    {[1, 2, 3, 4, 5].map((score) => (
                      <button
                        key={score}
                        type="button"
                        data-testid={`broker-rubric-${criterion.id}-${score}`}
                        onClick={() => handleSetRubric(criterion.id, score)}
                        aria-pressed={currentScore === score}
                        className={`min-h-[42px] rounded-lg border text-[15px] font-extrabold cursor-pointer ${
                          currentScore === score
                            ? "border-indigo-700 bg-indigo-700 text-white"
                            : "border-slate-300 bg-white text-slate-800 hover:bg-slate-100"
                        }`}
                      >
                        {score}점
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 4칸 신규 요청 폼 */}
          <form
            onSubmit={handleAddDraftRequest}
            className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3"
          >
            <h3 className="text-base font-extrabold text-slate-950">
              새로 고쳤으면 하는 점 남기기 (4칸 간단 기록)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                type="text"
                value={draftSituation}
                onChange={(e) => setDraftSituation(e.target.value)}
                placeholder="1) 어떤 화면·상황인가요? (예: 월간 뉴스레터 상단)"
                className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 text-[15px]"
              />
              <input
                type="text"
                value={draftWant}
                onChange={(e) => setDraftWant(e.target.value)}
                placeholder="2) 어떻게 바뀌면 좋겠나요? (예: 금리 설명을 2줄로)"
                className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 text-[15px]"
              />
              <input
                type="text"
                value={draftReason}
                onChange={(e) => setDraftReason(e.target.value)}
                placeholder="3) 이유·고객 반응 (예: 70대 매수자가 숫자를 어려워함)"
                className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 text-[15px]"
              />
              <input
                type="text"
                value={draftExample}
                onChange={(e) => setDraftExample(e.target.value)}
                placeholder="4) 원하시는 예시 표현 (예: 은행 이자보다 월세가 높습니다)"
                className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 text-[15px]"
              />
            </div>
            <button
              type="submit"
              className="min-h-[44px] rounded-xl border border-slate-900 bg-white hover:bg-slate-100 px-4 text-[14px] font-extrabold text-slate-950 cursor-pointer"
            >
              + 새 요청 항목 추가
            </button>

            {state.brokerDrafts.length > 0 ? (
              <div className="space-y-1.5 pt-2">
                {state.brokerDrafts.map((d) => (
                  <div
                    key={d.id}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[14px] text-slate-800"
                  >
                    <strong className="text-indigo-900">[{d.id}]</strong>{" "}
                    {d.situation} → {d.want}
                    {d.example ? ` (예시: ${d.example})` : ""}
                  </div>
                ))}
              </div>
            ) : null}
          </form>

          {/* 중개인 Red-Pen 의견 모아보기 */}
          {brokerPins.length > 0 ? (
            <div className="space-y-2 border-t border-slate-200 pt-4">
              <h3 className="text-base font-extrabold text-slate-950">
                ✏️ 내가 남긴 문구·화면 의견 ({brokerPins.length}건)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {brokerPins.map((pin) => (
                  <div
                    key={pin.id}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1"
                  >
                    <p className="text-[14px] font-extrabold text-slate-950">
                      {pin.targetLabel}
                    </p>
                    {pin.originalText || pin.suggestedText ? (
                      <p className="text-[13px] text-indigo-900">
                        “{pin.originalText || "(기존)"}” → “
                        {pin.suggestedText || "(개선안)"}”
                      </p>
                    ) : null}
                    <p className="text-[14px] text-slate-800">{pin.note}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-slate-200">
            <label className="block space-y-1">
              <span className="text-[14px] font-bold text-slate-800">
                중개인 성함 / 상호
              </span>
              <input
                type="text"
                value={state.brokerName}
                onChange={(e) =>
                  persistLocal({ ...state, brokerName: e.target.value })
                }
                className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-[15px]"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[14px] font-bold text-slate-800">
                총평 한마디
              </span>
              <input
                type="text"
                value={state.overallComment}
                onChange={(e) =>
                  persistLocal({ ...state, overallComment: e.target.value })
                }
                placeholder="전반적인 만족도나 다음 회차 전 우선 보완 희망 사항"
                className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-[15px]"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              data-testid="broker-signoff-submit-btn"
              disabled={submitting}
              onClick={() => void handleFinalSubmit()}
              className="min-h-[46px] rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 px-5 text-[15px] font-extrabold text-white cursor-pointer"
            >
              {submitting ? "저장 중..." : "☁️ 오늘 회차 의견 제출 완료"}
            </button>
          </div>

          {submitMessage ? (
            <p
              data-testid="broker-submit-feedback"
              className="text-[15px] font-bold text-emerald-800"
            >
              {submitMessage}
            </p>
          ) : null}
        </section>
      </main>
    </div>
  );
}

export default function QaBrokerSignoffPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 p-6 text-[16px] font-bold text-slate-800">
          중개인 감수 미팅 보드를 불러오는 중입니다...
        </div>
      }
    >
      <QaBrokerSignoffInner />
    </Suspense>
  );
}
