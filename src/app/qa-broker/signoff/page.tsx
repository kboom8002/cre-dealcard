/* eslint-disable @next/next/no-img-element */
"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FontScaleToggle } from "@/components/workspace/FontScaleToggle";
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
  QA_TESTER_SHOWCASE_SESSION_ID,
  QA_TESTER_SIGNOFF_SESSION_ID,
  ROUND1_REMEDIATION_28_ITEMS,
  ROUND2_CORE_MISSIONS_6,
  V6_PHYSICAL_DEVICE_MISSIONS_5,
} from "@/lib/qa/round2-verification-data";
import {
  BROKER_PREREQ_REQUEST_TEMPLATE,
  BROKER_RUBRIC_6,
  BROKER_SESSIONS_4,
  QA_BROKER_SESSION_WORKBENCH_ID,
  type BrokerSessionSpec,
} from "@/lib/testguide/qa-signoff-fasttrack-data";
import { COPY_FAILED_MESSAGE, copyText } from "@/lib/ux/clipboard";

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
  timeAttackCompleted?: boolean;
}

interface TesterHandoffSummary {
  tone: "verified" | "issue" | "pending";
  label: string;
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
    timeAttackCompleted: false,
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
      timeAttackCompleted: Boolean(parsed.timeAttackCompleted),
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
  const [testerHandoff, setTesterHandoff] = useState<TesterHandoffSummary>({
    tone: "pending",
    label: "🔎 사전 기술점검 상태 동기화 대기",
  });
  const [zoomPin, setZoomPin] = useState<BrokerPinRecord | null>(null);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
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
    if (!zoomPin) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoomPin(null);
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [zoomPin]);

  const fetchBoardData = useCallback(async () => {
    const [
      showcaseRes,
      signoffRes,
      pinsRes,
      testerShowcaseRes,
      testerSignoffRes,
    ] = await Promise.all([
      fetch(
        `/api/public/qa-workbench?sessionId=${encodeURIComponent(
          QA_BROKER_SHOWCASE_SESSION_ID
        )}`,
        {
          cache: "no-store",
          headers: {
            ...buildQaAuthHeaders("broker"),
          },
        }
      ),
      fetch(
        `/api/public/qa-workbench?sessionId=${encodeURIComponent(
          QA_BROKER_SIGNOFF_SESSION_ID
        )}`,
        {
          cache: "no-store",
          headers: {
            ...buildQaAuthHeaders("broker"),
          },
        }
      ),
      fetch("/api/public/qa-workbench?mode=pins", {
        cache: "no-store",
        headers: {
          ...buildQaAuthHeaders("broker"),
        },
      }),
      fetch(
        `/api/public/qa-workbench?sessionId=${encodeURIComponent(
          QA_TESTER_SHOWCASE_SESSION_ID
        )}`,
        {
          cache: "no-store",
          headers: {
            ...buildQaAuthHeaders("broker"),
          },
        }
      ),
      fetch(
        `/api/public/qa-workbench?sessionId=${encodeURIComponent(
          QA_TESTER_SIGNOFF_SESSION_ID
        )}`,
        {
          cache: "no-store",
          headers: {
            ...buildQaAuthHeaders("broker"),
          },
        }
      ),
    ]);

    let nextVerdicts: Record<string, ShowcaseVerdictRecord> | null = null;
    if (showcaseRes.ok) {
      const j = (await showcaseRes.json()) as {
        found?: boolean;
        session?: { records?: Record<string, ShowcaseVerdictRecord> };
      };
      if (j?.found && j.session?.records) {
        nextVerdicts = j.session.records;
      }
    }

    let remoteSignoffRecs: Record<string, unknown> | null = null;
    if (signoffRes.ok) {
      const j = (await signoffRes.json()) as {
        found?: boolean;
        session?: { records?: Record<string, unknown> };
      };
      if (j?.found && j.session?.records && typeof j.session.records === "object") {
        remoteSignoffRecs = j.session.records;
      }
    }

    let nextPins: BrokerPinRecord[] | null = null;
    if (pinsRes.ok) {
      const j = (await pinsRes.json()) as {
        ok?: boolean;
        pins?: BrokerPinRecord[];
      };
      if (j?.ok && Array.isArray(j.pins)) {
        nextPins = j.pins.filter((p) => p.authorRole === "broker");
      }
    }

    let passChecks = 0;
    let issueChecks = 0;
    if (testerShowcaseRes.ok) {
      const tj = (await testerShowcaseRes.json()) as {
        found?: boolean;
        session?: { records?: Record<string, { status?: string }> };
      };
      if (tj?.found && tj.session?.records) {
        for (const rec of Object.values(tj.session.records)) {
          if (rec?.status === "PASS") passChecks += 1;
          if (rec?.status === "ISSUE") issueChecks += 1;
        }
      }
    }
    if (testerSignoffRes.ok) {
      const rj = (await testerSignoffRes.json()) as {
        found?: boolean;
        session?: {
          records?: Record<string, unknown> & {
            r1States?: Record<string, { status?: string }>;
            missionStates?: Record<string, { status?: string }>;
            v6States?: Record<string, { status?: string }>;
          };
        };
      };
      const raw = rj?.session?.records;
      if (rj?.found && raw && typeof raw === "object") {
        const nestedR1 =
          raw.r1States && typeof raw.r1States === "object" ? raw.r1States : {};
        for (const item of ROUND1_REMEDIATION_28_ITEMS) {
          const entry = (nestedR1[item.id] ?? raw[item.id]) as
            | { status?: string }
            | undefined;
          if (entry?.status === "pass") passChecks += 1;
          if (entry?.status === "fail") issueChecks += 1;
        }
        const nestedM =
          raw.missionStates && typeof raw.missionStates === "object"
            ? raw.missionStates
            : {};
        for (const m of ROUND2_CORE_MISSIONS_6) {
          const entry = (nestedM[m.id] ?? raw[m.id]) as
            | { status?: string }
            | undefined;
          if (entry?.status === "pass") passChecks += 1;
          if (entry?.status === "blocker" || entry?.status === "fail") {
            issueChecks += 1;
          }
        }
        const nestedV6 =
          raw.v6States && typeof raw.v6States === "object" ? raw.v6States : {};
        for (const m of V6_PHYSICAL_DEVICE_MISSIONS_5) {
          const entry = (nestedV6[m.id] ?? raw[m.id]) as
            | { status?: string }
            | undefined;
          if (entry?.status === "pass") passChecks += 1;
          if (entry?.status === "blocker" || entry?.status === "fail") {
            issueChecks += 1;
          }
        }
      }
    }

    const computedHandoff: TesterHandoffSummary =
      issueChecks > 0
        ? {
            tone: "issue",
            label: `⚠️ 테스터 기술 보완 확인 중 (${issueChecks}건)`,
          }
        : passChecks > 0
        ? {
            tone: "verified",
            label: `🛡️ 테스터 사전 기술검증 완료 (${passChecks}건 확인)`,
          }
        : {
            tone: "pending",
            label: "🔎 사전 기술점검 병행 중",
          };

    return {
      nextVerdicts,
      remoteSignoffRecs,
      nextPins,
      computedHandoff,
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchBoardData()
      .then((res) => {
        if (cancelled) return;
        if (res.nextVerdicts) setShowcaseVerdicts(res.nextVerdicts);
        if (res.remoteSignoffRecs) {
          const recs = res.remoteSignoffRecs;
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
            timeAttackCompleted:
              prev.timeAttackCompleted || Boolean(recs.timeAttackCompleted),
          }));
        }
        if (res.nextPins) setBrokerPins(res.nextPins);
        setTesterHandoff(res.computedHandoff);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [fetchBoardData]);

  const handleManualRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const res = await fetchBoardData();
      if (res.nextVerdicts) setShowcaseVerdicts(res.nextVerdicts);
      if (res.nextPins) setBrokerPins(res.nextPins);
      setTesterHandoff(res.computedHandoff);
      setCopyToast("🔄 쇼룸 판정·의견 및 테스터 검증 상태를 최신으로 불러왔습니다.");
    } catch {
      setCopyToast("동기화 중 일시적인 네트워크 지연이 있었습니다.");
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchBoardData]);

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
      if (next.timeAttackCompleted) {
        flatStatuses.v6_timeattack = {
          status: "pass",
          memo: "5분 실매물 체험 완료",
        };
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
            timeAttackCompleted: Boolean(next.timeAttackCompleted),
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

  const handleToggleTimeAttack = () => {
    const next: BrokerSignoffPersistedState = {
      ...state,
      timeAttackCompleted: !state.timeAttackCompleted,
    };
    persistLocal(next);
    void syncToServer(next, "sync").catch(() => undefined);
  };

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

  const handleCopyKakaoSummary = async () => {
    const lines = [
      `[크리딜 중개인 감수 요약 · ${activeSession.label} (${state.brokerName.trim() || "감수 중개인"})]`,
      `1) 22종 산출물 판정: ${showcaseStats.decided}/${showcaseStats.total}건 (바로사용 ${showcaseStats.pass} · 다듬기 ${showcaseStats.polish} · 보완필요 ${showcaseStats.fail})`,
      `2) 6대 실무 기준: ${rubricStats.label} · 5분 체험 ${state.timeAttackCompleted ? "완료" : "전"} · 추가 요청 ${state.brokerDrafts.length}건 · 화면 코멘트 ${brokerPins.length}건`,
      `3) 총평: ${state.overallComment.trim() || "(별도 총평 없음)"}`,
    ].join("\n");

    const ok = await copyText(lines);
    setCopyToast(
      ok
        ? "📋 카카오톡 전달용 3줄 요약이 복사되었습니다. 채팅창에 바로 붙여넣어 주세요."
        : COPY_FAILED_MESSAGE
    );
  };

  return (
    <div className="min-h-screen max-w-full overflow-x-clip bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200 shadow-2xs">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-1 rounded-lg bg-slate-900 text-white text-sm font-extrabold">
                  중개인 전용 감수 보드
                </span>
                <h1 className="text-lg sm:text-xl font-black text-slate-950">
                  화·목 전문가 감수 미팅 보드
                </h1>
              </div>
              <p className="text-sm text-slate-600">
                실제 매수 고객에게 그대로 보낼 수준인지 표현의 품격·수치 신뢰감·시간 가치를 편하게 평가해 주세요.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 max-w-full">
              <div data-testid="broker-signoff-font-toggle-wrap" className="max-w-full">
                <FontScaleToggle />
              </div>
              <button
                type="button"
                data-testid="broker-signoff-refresh-btn"
                disabled={isRefreshing}
                onClick={() => void handleManualRefresh()}
                className="min-h-[44px] rounded-xl border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-50 px-3 text-sm font-extrabold text-slate-900 cursor-pointer whitespace-nowrap"
              >
                {isRefreshing ? "동기화 중..." : "🔄 동기화"}
              </button>
              <button
                type="button"
                data-testid="broker-key-status-btn"
                onClick={() => setShowKeyDrawer((v) => !v)}
                className="min-h-[44px] rounded-xl border border-slate-300 bg-white hover:bg-slate-100 px-3.5 text-sm font-extrabold text-slate-900 cursor-pointer whitespace-nowrap"
              >
                {keyInput ? "🔑 감수 키 연결됨" : "🔒 감수 키 입력"}
              </button>
              <Link
                href={appendQaParamsToHref("/qa-broker/full-loop", "broker")}
                data-testid="broker-open-full-loop-link"
                className="min-h-[44px] max-w-full inline-flex items-center justify-center rounded-xl bg-emerald-700 hover:bg-emerald-800 px-3.5 py-2 text-sm sm:text-base font-extrabold text-white text-center whitespace-normal sm:whitespace-nowrap"
              >
                🚀 실전 전 과정 검수 (10장 골든 + 내 매물) ↗
              </Link>
              <Link
                href={appendQaParamsToHref("/qa-broker/showcase", "broker")}
                data-testid="broker-open-showcase-link"
                className="min-h-[44px] max-w-full inline-flex items-center justify-center rounded-xl bg-indigo-700 hover:bg-indigo-800 px-3.5 py-2 text-sm sm:text-base font-extrabold text-white text-center whitespace-normal sm:whitespace-nowrap"
              >
                🎯 22종 실물 산출물 쇼룸 열기 ↗
              </Link>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center min-h-[38px] rounded-xl border border-slate-300 bg-slate-100 px-3 text-sm font-bold text-slate-800">
              {formatBuildStampBadge(buildStamp)}
            </span>
            <span className="inline-flex items-center min-h-[38px] rounded-xl border border-sky-300 bg-sky-50 px-3 text-sm font-bold text-sky-900">
              {QA_OUTBOUND_CHANNEL_POLICY.emailLiveAllowed
                ? "무료 카톡 링크복사·이메일 발송 지원 (Pro 알림톡 추후 오픈)"
                : "발송 점검 모드"}
            </span>
            <span
              data-testid="broker-signoff-tester-status-badge"
              className={`inline-flex items-center min-h-[38px] rounded-xl border px-3 text-sm font-extrabold ${
                testerHandoff.tone === "issue"
                  ? "border-amber-300 bg-amber-50 text-amber-950"
                  : testerHandoff.tone === "verified"
                  ? "border-emerald-300 bg-emerald-50 text-emerald-950"
                  : "border-slate-300 bg-slate-100 text-slate-800"
              }`}
            >
              {testerHandoff.label}
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
                aria-label="중개인 전용 감수 키 입력"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="전달받은 중개인 전용 감수 키 입력"
                className="min-h-[44px] flex-1 min-w-[220px] rounded-xl border border-indigo-300 bg-white px-3 text-base"
              />
              <button
                type="submit"
                className="min-h-[44px] rounded-xl bg-indigo-700 px-4 text-sm font-extrabold text-white cursor-pointer"
              >
                저장
              </button>
              {keySavedMsg ? (
                <span className="text-sm font-bold text-emerald-900">
                  {keySavedMsg}
                </span>
              ) : null}
            </form>
          ) : null}

          {copyToast ? (
            <div
              role="status"
              data-testid="broker-copy-toast"
              className="rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-sm font-bold text-emerald-950"
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
              <p className="text-sm text-slate-600">
                쇼룸에서 남기신 ‘바로 사용 가능 / 조금 다듬기 / 보완 필요’ 판정이 자동 집계됩니다.
              </p>
            </div>
            <span className="px-3 py-1 rounded-xl border border-indigo-200 bg-indigo-50 text-base font-extrabold text-indigo-950">
              {showcaseStats.decided} / {showcaseStats.total} 판정 완료
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-center">
              <p className="text-sm font-bold text-emerald-900">바로 발송 가능</p>
              <p className="text-2xl font-black text-emerald-800">{showcaseStats.pass}</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-center">
              <p className="text-sm font-bold text-amber-900">문구·배치 다듬기</p>
              <p className="text-2xl font-black text-amber-800">{showcaseStats.polish}</p>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-center">
              <p className="text-sm font-bold text-rose-900">보완 필요</p>
              <p className="text-2xl font-black text-rose-800">{showcaseStats.fail}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
              <p className="text-sm font-bold text-slate-700">미판정</p>
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
              className="min-h-[44px] inline-flex items-center rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 px-3.5 text-sm font-extrabold text-slate-900"
            >
              뉴스레터 6종 쇼룸 열기 ↗
            </Link>
            <Link
              href={appendQaParamsToHref(
                "/qa-broker/showcase?tab=dealcard",
                "broker"
              )}
              className="min-h-[44px] inline-flex items-center rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 px-3.5 text-sm font-extrabold text-slate-900"
            >
              딜카드 8종 쇼룸 열기 ↗
            </Link>
            <Link
              href={appendQaParamsToHref("/qa-broker/showcase?tab=im", "broker")}
              className="min-h-[44px] inline-flex items-center rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 px-3.5 text-sm font-extrabold text-slate-900"
            >
              모바일·PPTX IM 8종 쇼룸 열기 ↗
            </Link>
          </div>

          {showcaseStats.revisit.length > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 space-y-2">
              <p className="text-sm font-extrabold text-amber-950">
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
                    className="min-h-[44px] inline-flex items-center rounded-lg border border-amber-300 bg-white hover:bg-amber-100 px-3 text-sm font-extrabold text-slate-900"
                  >
                    {item.id} ({item.status === "FAIL" ? "보완 필요" : "다듬기"}) ↗
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        {/* 실습 도우미 바로가기 (3·4회차 직접 조작 대비) */}
        <section
          data-testid="broker-practice-helpers"
          className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="space-y-0.5">
            <h2 className="text-base font-extrabold text-slate-950">
              직접 만들어 보기 도우미 (3·4회차 실습용)
            </h2>
            <p className="text-sm text-slate-700">
              1단계씩 천천히 설명하는 가이드(0.65배속 영상 포함)와 연습용 건물사진 5장·임대현황표·고객명단 묶음을 바로 이용하실 수 있습니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0 max-w-full">
            <Link
              href={appendQaParamsToHref("/broker/tutorial", "broker")}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="broker-open-tutorial-link"
              className="min-h-[44px] max-w-full inline-flex items-center rounded-xl border border-indigo-300 bg-white hover:bg-indigo-100 px-3.5 py-2 text-sm font-extrabold text-indigo-950 whitespace-normal sm:whitespace-nowrap"
            >
              📖 1단계씩 보는 사용법 가이드 ↗
            </Link>
            <a
              href="/api/public/qa-sample-kit"
              download
              data-testid="broker-download-sample-kit-link"
              className="min-h-[44px] max-w-full inline-flex items-center rounded-xl bg-slate-900 hover:bg-slate-800 px-3.5 py-2 text-sm font-extrabold text-white whitespace-normal sm:whitespace-nowrap"
            >
              📦 연습용 건물사진 5장·양식 받기 (.zip)
            </a>
          </div>
        </section>

        {/* v6.0 5분 실매물 직접 발행 체험 안내 */}
        <section
          data-testid="broker-v6-timeattack-card"
          className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-emerald-800 text-white text-sm font-extrabold">
                5분 실매물 체험
              </span>
              <h2 className="text-base font-extrabold text-slate-950 break-keep">
                실제 매물 1건으로 5분 안에 카톡 딜카드·IM·인사말 복사까지 한번에 체험해 보세요
              </h2>
            </div>
            <p className="text-sm text-slate-700 break-keep">
              ① 딜카드 [30초 빠른 시작] → ② IM 상단 [발행 준비도 5/5] 칩 눌러 빈 칸 채우기 → ③ 소통함 [첫 전달 · 미팅 제안 · 방문 안내] 인사말 1초 복사 순서로 보실 수 있습니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0 max-w-full">
            <Link
              href={appendQaParamsToHref("/broker/w/dealcards?qa=1&qaRole=broker&fresh=1", "broker")}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="broker-open-timeattack-link"
              className="min-h-[44px] max-w-full inline-flex items-center justify-center rounded-xl bg-emerald-800 hover:bg-emerald-900 px-4 py-2 text-sm font-extrabold text-white whitespace-normal sm:whitespace-nowrap"
            >
              ⚡ 5분 실습 바로 시작 ↗
            </Link>
            <button
              type="button"
              data-testid="broker-v6-timeattack-done-btn"
              aria-pressed={Boolean(state.timeAttackCompleted)}
              onClick={handleToggleTimeAttack}
              className={`min-h-[44px] max-w-full rounded-xl border px-3.5 py-2 text-sm font-extrabold cursor-pointer whitespace-normal sm:whitespace-nowrap ${
                state.timeAttackCompleted
                  ? "border-emerald-800 bg-white text-emerald-950"
                  : "border-emerald-300 bg-white/90 hover:bg-white text-emerald-950"
              }`}
            >
              {state.timeAttackCompleted
                ? "✅ 5분 체험 완료됨"
                : "✓ 5분 체험 완료 표시"}
            </button>
          </div>
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
              <p className="text-sm text-slate-600">
                회차별 핵심 의사결정 사항과 지난 미팅에서 요청하신 12개 항목의 반영 여부를 확인합니다.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                void copyText(BROKER_PREREQ_REQUEST_TEMPLATE).then((ok) => {
                  setCopyToast(
                    ok
                      ? "📋 사전 매물·인사말 요청 문구를 복사했습니다."
                      : COPY_FAILED_MESSAGE
                  );
                });
              }}
              className="min-h-[44px] rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 px-3.5 text-sm font-bold text-slate-900 cursor-pointer"
            >
              📋 사전 자료 요청 문구 복사
            </button>
          </div>

          <div
            role="group"
            aria-label="감수 회차 선택"
            className="ios-segmented-track grid grid-cols-2 sm:grid-cols-4 gap-1.5 bg-slate-100 border border-slate-200"
          >
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
                  className={`ios-segmented-pill min-h-[44px] px-3 py-2 text-sm font-extrabold transition-colors cursor-pointer ${
                    selected
                      ? "bg-slate-900 text-white shadow-2xs"
                      : "bg-transparent text-slate-800 hover:bg-white/80"
                  }`}
                >
                  {sess.label}
                </button>
              );
            })}
          </div>

          <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 space-y-3">
            <p className="text-sm font-extrabold text-indigo-800">
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
                    <p className="text-base font-extrabold text-slate-950">
                      {task.title}
                    </p>
                    <p className="text-sm text-slate-700">
                      {task.promptQuestion}
                    </p>
                  </div>
                  <Link
                    href={mapBrokerHref(task.targetHref)}
                    className="min-h-[44px] shrink-0 inline-flex items-center rounded-xl bg-slate-900 hover:bg-slate-800 px-3.5 text-sm font-extrabold text-white"
                  >
                    화면 열기 ↗
                  </Link>
                </div>
              ))}
            </div>

            <div className="space-y-1.5 pt-2">
              <p className="text-sm font-extrabold text-slate-900">
                이번 회차 결정 안건
              </p>
              {activeSession.agendaItems.map((agenda, idx) => {
                const checkKey = `${activeSession.id}-agenda-${idx}`;
                const checked = Boolean(state.agendaChecks[checkKey]);
                return (
                  <label
                    key={checkKey}
                    htmlFor={`agenda-check-${checkKey}`}
                    className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-white p-2.5 cursor-pointer"
                  >
                    <input
                      id={`agenda-check-${checkKey}`}
                      type="checkbox"
                      checked={checked}
                      onChange={() => handleToggleAgenda(checkKey)}
                      className="mt-1 h-4 w-4"
                    />
                    <span className="text-sm text-slate-800">{agenda}</span>
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
                        <span className="px-2 py-0.5 rounded-md bg-slate-900 text-white text-sm font-extrabold">
                          {reqItem.id}
                        </span>
                        <span className="text-sm font-bold text-indigo-800">
                          {BROKER_AREA_LABELS[reqItem.area]}
                        </span>
                      </div>
                      <p className="text-base font-bold text-slate-950">
                        {reqItem.title}
                      </p>
                      <p className="text-sm text-slate-700">
                        {reqItem.acceptanceCriteria}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleBrConfirm(reqItem.id)}
                      aria-pressed={confirmed}
                      className={`min-h-[44px] shrink-0 rounded-xl border px-3.5 text-sm font-extrabold cursor-pointer ${
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
              <p className="text-sm text-slate-600">
                현업 중개사의 눈높이에서 1점(개선 필요)~5점(바로 활용)으로 평가해 주세요.
              </p>
            </div>
            <span
              data-testid="broker-rubric-avg-badge"
              className="px-3 py-1 rounded-xl border border-indigo-200 bg-indigo-50 text-base font-extrabold text-indigo-950"
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
                    <span className="text-base font-extrabold text-slate-950">
                      {criterion.label}
                    </span>
                    <span className="text-sm font-semibold text-slate-600">
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
                        className={`min-h-[44px] rounded-lg border text-base font-extrabold cursor-pointer ${
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
                aria-label="어떤 화면이나 상황인지"
                value={draftSituation}
                onChange={(e) => setDraftSituation(e.target.value)}
                placeholder="1) 어떤 화면·상황인가요? (예: 월간 뉴스레터 상단)"
                className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 text-base"
              />
              <input
                type="text"
                aria-label="어떻게 바뀌면 좋겠는지"
                value={draftWant}
                onChange={(e) => setDraftWant(e.target.value)}
                placeholder="2) 어떻게 바뀌면 좋겠나요? (예: 금리 설명을 2줄로)"
                className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 text-base"
              />
              <input
                type="text"
                aria-label="이유 또는 고객 반응"
                value={draftReason}
                onChange={(e) => setDraftReason(e.target.value)}
                placeholder="3) 이유·고객 반응 (예: 70대 매수자가 숫자를 어려워함)"
                className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 text-base"
              />
              <input
                type="text"
                aria-label="원하시는 예시 표현"
                value={draftExample}
                onChange={(e) => setDraftExample(e.target.value)}
                placeholder="4) 원하시는 예시 표현 (예: 은행 이자보다 월세가 높습니다)"
                className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 text-base"
              />
            </div>
            <button
              type="submit"
              className="min-h-[44px] rounded-xl border border-slate-900 bg-white hover:bg-slate-100 px-4 text-sm font-extrabold text-slate-950 cursor-pointer"
            >
              + 새 요청 항목 추가
            </button>

            {state.brokerDrafts.length > 0 ? (
              <div className="space-y-1.5 pt-2">
                {state.brokerDrafts.map((d) => (
                  <div
                    key={d.id}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                  >
                    <strong className="text-indigo-900">[{d.id}]</strong>{" "}
                    {d.situation} → {d.want}
                    {d.example ? ` (예시: ${d.example})` : ""}
                  </div>
                ))}
              </div>
            ) : null}
          </form>

          {/* 중개인 화면 의견 모아보기 + 캡처 썸네일 확대 */}
          {brokerPins.length > 0 ? (
            <div
              data-testid="broker-signoff-pins-section"
              className="space-y-2.5 border-t border-slate-200 pt-4"
            >
              <h3 className="text-base font-extrabold text-slate-950">
                ✏️ 내가 남긴 문구·화면 의견 ({brokerPins.length}건)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {brokerPins.map((pin) => (
                  <div
                    key={pin.id}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2"
                  >
                    <p className="text-sm font-extrabold text-slate-950">
                      {pin.targetLabel}
                    </p>
                    {pin.originalText || pin.suggestedText ? (
                      <p className="text-sm text-indigo-900">
                        “{pin.originalText || "(기존)"}” → “
                        {pin.suggestedText || "(개선안)"}”
                      </p>
                    ) : null}
                    <p className="text-sm text-slate-800">{pin.note}</p>
                    {pin.screenshotDataUrl ? (
                      <button
                        type="button"
                        data-testid={`broker-pin-zoom-${pin.id}`}
                        onClick={() => setZoomPin(pin)}
                        aria-label={`${pin.targetLabel} 캡처 이미지 크게 보기`}
                        className="group block w-full rounded-lg border border-slate-300 bg-white overflow-hidden cursor-zoom-in focus:outline-none focus:ring-2 focus:ring-indigo-600"
                      >
                        <img
                          src={pin.screenshotDataUrl}
                          alt={`${pin.targetLabel} 캡처 미리보기`}
                          className="w-full max-h-32 object-contain bg-white"
                        />
                        <span className="block w-full py-1 text-center text-sm font-bold text-slate-600 bg-slate-100/90 group-hover:text-slate-900">
                          🔍 눌러서 크게 보기
                        </span>
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-slate-200">
            <label htmlFor="broker-signoff-name" className="block space-y-1">
              <span className="text-sm font-bold text-slate-800">
                중개인 성함 / 상호
              </span>
              <input
                id="broker-signoff-name"
                type="text"
                value={state.brokerName}
                onChange={(e) =>
                  persistLocal({ ...state, brokerName: e.target.value })
                }
                className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-base"
              />
            </label>
            <label htmlFor="broker-signoff-comment" className="block space-y-1">
              <span className="text-sm font-bold text-slate-800">
                총평 한마디
              </span>
              <input
                id="broker-signoff-comment"
                type="text"
                value={state.overallComment}
                onChange={(e) =>
                  persistLocal({ ...state, overallComment: e.target.value })
                }
                placeholder="전반적인 만족도나 다음 회차 전 우선 보완 희망 사항"
                className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-base"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              data-testid="broker-signoff-submit-btn"
              disabled={submitting}
              onClick={() => void handleFinalSubmit()}
              className="min-h-[48px] rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 px-5 text-base font-extrabold text-white cursor-pointer"
            >
              {submitting ? "저장 중..." : "☁️ 오늘 회차 의견 제출 완료"}
            </button>
            <button
              type="button"
              data-testid="broker-copy-kakao-summary-btn"
              onClick={() => void handleCopyKakaoSummary()}
              className="min-h-[48px] rounded-xl border border-indigo-300 bg-indigo-50 hover:bg-indigo-100 px-4 text-base font-extrabold text-indigo-950 cursor-pointer"
            >
              📋 카톡 3줄 요약 복사
            </button>
          </div>

          {submitMessage ? (
            <p
              data-testid="broker-submit-feedback"
              className="text-base font-bold text-emerald-800"
            >
              {submitMessage}
            </p>
          ) : null}
        </section>
      </main>

      {zoomPin && zoomPin.screenshotDataUrl ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="중개인 의견 캡처 확대 보기"
          data-testid="broker-pin-zoom-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
        >
          <div className="relative w-full max-w-4xl rounded-2xl border border-slate-700 bg-white p-4 shadow-2xl space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-base font-extrabold text-slate-900">
                🔍 캡처 이미지 확대 ({zoomPin.targetLabel})
              </span>
              <button
                type="button"
                data-testid="broker-pin-zoom-close-btn"
                onClick={() => setZoomPin(null)}
                className="min-h-[44px] px-3.5 rounded-lg bg-slate-900 text-white text-sm font-extrabold cursor-pointer hover:bg-slate-800"
              >
                ✕ 닫기 (ESC)
              </button>
            </div>
            <img
              src={zoomPin.screenshotDataUrl}
              alt={`${zoomPin.targetLabel} 확대 미리보기`}
              className="w-full max-h-[75vh] object-contain rounded-xl border border-slate-200 bg-slate-50"
            />
            {zoomPin.note ? (
              <p className="text-sm font-semibold text-slate-700">
                메모: {zoomPin.note}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function QaBrokerSignoffPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 p-6 text-base font-bold text-slate-800">
          중개인 감수 미팅 보드를 불러오는 중입니다...
        </div>
      }
    >
      <QaBrokerSignoffInner />
    </Suspense>
  );
}
