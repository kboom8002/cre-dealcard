/* eslint-disable @next/next/no-img-element */
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
  appendQaParamsToHref,
  buildQaAuthHeaders,
  getStoredQaAccessKey,
  setStoredQaAccessKey,
  syncQaKeyFromSearchParams,
} from "@/lib/qa/qa-client-auth";
import {
  QA_ROUND2_WORKBENCH_ID,
  QA_TESTER_SIGNOFF_SESSION_ID,
  ROUND1_REMEDIATION_28_ITEMS,
  ROUND2_CORE_MISSIONS_6,
  type Round1Area,
} from "@/lib/qa/round2-verification-data";

type R1Status = "pending" | "pass" | "fail";
type R2MissionStatus = "pending" | "pass" | "blocker";
type R1Filter = "all" | Round1Area | "unresolved";

interface AutoProbeCheck {
  id: string;
  title: string;
  passed: boolean;
  detail: string;
}

interface AutoProbeSummary {
  passedCount: number;
  totalCount: number;
  checks: AutoProbeCheck[];
  probedAt: string;
}

interface QaPinRecord {
  id: string;
  sessionId: string;
  workspace: string;
  routePath: string;
  targetSelector: string;
  targetLabel: string;
  note: string;
  severity: "critical" | "major" | "minor";
  authorRole?: "tester" | "broker";
  pinMode?: "issue" | "redpen";
  screenshotDataUrl?: string | null;
  buildSha?: string;
  createdAt: string;
}

interface TesterSignoffPersistedState {
  r1States: Record<string, { status: R1Status; memo?: string }>;
  r2States: Record<string, { status: R2MissionStatus; memo?: string }>;
  confirmations: {
    versionMatched: boolean;
    mobileKakaoChecked: boolean;
  };
  testerName: string;
  deviceLabel: string;
  finalMemo: string;
}

const LOCAL_STORAGE_KEY = "cre_qa_tester_signoff_r2_v1";

function readInitialState(): TesterSignoffPersistedState {
  const empty: TesterSignoffPersistedState = {
    r1States: {},
    r2States: {},
    confirmations: {
      versionMatched: false,
      mobileKakaoChecked: false,
    },
    testerName: "이상덕 테스터",
    deviceLabel: "PC Chrome + 모바일 카톡 인앱",
    finalMemo: "",
  };
  if (typeof window === "undefined") return empty;
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<TesterSignoffPersistedState>;
    return {
      r1States: parsed.r1States ?? {},
      r2States: parsed.r2States ?? {},
      confirmations: {
        versionMatched: Boolean(parsed.confirmations?.versionMatched),
        mobileKakaoChecked: Boolean(parsed.confirmations?.mobileKakaoChecked),
      },
      testerName: parsed.testerName || empty.testerName,
      deviceLabel: parsed.deviceLabel || empty.deviceLabel,
      finalMemo: parsed.finalMemo || "",
    };
  } catch {
    return empty;
  }
}

function QaTesterSignoffInner() {
  const searchParams = useSearchParams();
  const [state, setState] = useState<TesterSignoffPersistedState>(() =>
    readInitialState()
  );
  const [r1Filter, setR1Filter] = useState<R1Filter>("all");
  const [buildStamp, setBuildStamp] = useState<BuildStampInfo>(() =>
    getBuildStampInfo()
  );
  const [policyLabel, setPolicyLabel] = useState<string>(
    QA_OUTBOUND_CHANNEL_POLICY.summaryLabel
  );

  const [probeSummary, setProbeSummary] = useState<AutoProbeSummary | null>(
    null
  );
  const [probeLoading, setProbeLoading] = useState<boolean>(false);
  const [probeError, setProbeError] = useState<string>("");

  const [showKeyDrawer, setShowKeyDrawer] = useState<boolean>(false);
  const [keyInput, setKeyInput] = useState<string>(() => {
    const urlKey = searchParams?.get("qaKey")?.trim();
    return urlKey || getStoredQaAccessKey("tester");
  });
  const [keyStatusMsg, setKeyStatusMsg] = useState<string>("");

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitMessage, setSubmitMessage] = useState<string>("");
  const [copyToast, setCopyToast] = useState<string>("");

  const [pins, setPins] = useState<QaPinRecord[]>([]);
  const [pinsLoading, setPinsLoading] = useState<boolean>(false);
  const [lightboxPin, setLightboxPin] = useState<QaPinRecord | null>(null);

  useEffect(() => {
    syncQaKeyFromSearchParams(searchParams, "tester");
  }, [searchParams]);

  const fetchPins = useCallback(async () => {
    setPinsLoading(true);
    try {
      const res = await fetch("/api/public/qa-workbench?mode=pins", {
        cache: "no-store",
        headers: {
          ...buildQaAuthHeaders("tester"),
        },
      });
      if (!res.ok) return;
      const json = (await res.json()) as {
        ok?: boolean;
        pins?: QaPinRecord[];
      };
      if (json?.ok && Array.isArray(json.pins)) {
        setPins(json.pins.filter((p) => p.authorRole !== "broker"));
      }
    } catch {
      // non-blocking
    } finally {
      setPinsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      try {
        const res = await fetch(
          `/api/public/qa-workbench?sessionId=${encodeURIComponent(
            QA_TESTER_SIGNOFF_SESSION_ID
          )}`,
          { cache: "no-store" }
        );
        if (res.ok) {
          const json = (await res.json()) as {
            found?: boolean;
            session?: { records?: Record<string, unknown> };
          };
          const recs = json?.session?.records;
          if (!cancelled && json?.found && recs && typeof recs === "object") {
            setState((prev) => {
              const serverR1 =
                (recs.r1States as TesterSignoffPersistedState["r1States"]) ??
                {};
              const serverR2 =
                (recs.r2States as TesterSignoffPersistedState["r2States"]) ??
                {};
              return {
                ...prev,
                r1States: { ...serverR1, ...prev.r1States },
                r2States: { ...serverR2, ...prev.r2States },
              };
            });
          }
        }
      } catch {
        // ignore
      }
      if (!cancelled) {
        await fetchPins();
      }
    }
    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [fetchPins]);

  useEffect(() => {
    if (!lightboxPin) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxPin(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightboxPin]);

  const persistLocal = useCallback((next: TesterSignoffPersistedState) => {
    setState(next);
    try {
      window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }, []);

  const syncToServer = useCallback(
    async (
      next: TesterSignoffPersistedState,
      mode: "sync" | "submit"
    ) => {
      const flatRecords: Record<
        string,
        { status: string; memo?: string }
      > = {};
      for (const item of ROUND1_REMEDIATION_28_ITEMS) {
        const st = next.r1States[item.id]?.status ?? "pending";
        flatRecords[item.id] = {
          status: st === "pass" ? "pass" : st === "fail" ? "fail" : "pending",
          memo: next.r1States[item.id]?.memo,
        };
      }
      for (const mission of ROUND2_CORE_MISSIONS_6) {
        const st = next.r2States[mission.id]?.status ?? "pending";
        flatRecords[mission.id] = {
          status:
            st === "pass" ? "pass" : st === "blocker" ? "fail" : "pending",
          memo: next.r2States[mission.id]?.memo,
        };
      }

      const res = await fetch("/api/public/qa-workbench", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...buildQaAuthHeaders("tester"),
        },
        body: JSON.stringify({
          mode,
          workbenchId: QA_ROUND2_WORKBENCH_ID,
          sessionId: QA_TESTER_SIGNOFF_SESSION_ID,
          testerName: next.testerName,
          testerOrg: next.deviceLabel,
          records: {
            ...flatRecords,
            r1States: next.r1States,
            r2States: next.r2States,
            confirmations: next.confirmations,
            finalMemo: next.finalMemo,
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

  const handleSetR1Status = (id: string, status: R1Status) => {
    const next: TesterSignoffPersistedState = {
      ...state,
      r1States: {
        ...state.r1States,
        [id]: { ...state.r1States[id], status },
      },
    };
    persistLocal(next);
    void syncToServer(next, "sync").catch(() => undefined);
  };

  const handleSetR2Status = (id: string, status: R2MissionStatus) => {
    const next: TesterSignoffPersistedState = {
      ...state,
      r2States: {
        ...state.r2States,
        [id]: { ...state.r2States[id], status },
      },
    };
    persistLocal(next);
    void syncToServer(next, "sync").catch(() => undefined);
  };

  const handleRunAutoProbe = async () => {
    setProbeLoading(true);
    setProbeError("");
    try {
      const res = await fetch("/api/public/qa-workbench", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...buildQaAuthHeaders("tester"),
        },
        body: JSON.stringify({ mode: "auto_probe_all" }),
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        passedCount?: number;
        totalCount?: number;
        checks?: AutoProbeCheck[];
        probedAt?: string;
        buildStamp?: BuildStampInfo;
        channelPolicy?: { summaryLabel?: string };
        error?: string;
      } | null;
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      setProbeSummary({
        passedCount: json.passedCount ?? 0,
        totalCount: json.totalCount ?? 0,
        checks: json.checks ?? [],
        probedAt: json.probedAt ?? new Date().toISOString(),
      });
      if (json.buildStamp?.shortSha) setBuildStamp(json.buildStamp);
      if (json.channelPolicy?.summaryLabel) {
        setPolicyLabel(json.channelPolicy.summaryLabel);
      }
    } catch (err) {
      setProbeError(
        err instanceof Error
          ? err.message
          : "AI 자동 점검 실행 중 오류가 발생했습니다."
      );
    } finally {
      setProbeLoading(false);
    }
  };

  const handleFinalSubmit = async () => {
    setSubmitting(true);
    setSubmitMessage("");
    try {
      await syncToServer(state, "submit");
      setSubmitMessage(
        "☁️ 2차 리허설 결과(28건 재검증 + 6대 미션 + 확인 체크)가 테스터 전용 서버 세션에 제출되었습니다."
      );
    } catch (err) {
      setSubmitMessage(
        err instanceof Error
          ? `제출 실패: ${err.message}`
          : "서버 제출 중 오류가 발생했습니다."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyText = async (text: string, okMsg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyToast(okMsg);
    } catch {
      setCopyToast(okMsg);
    }
    window.setTimeout(() => setCopyToast(""), 3500);
  };

  const r1Stats = useMemo(() => {
    let pass = 0;
    let fail = 0;
    for (const item of ROUND1_REMEDIATION_28_ITEMS) {
      const st = state.r1States[item.id]?.status;
      if (st === "pass") pass += 1;
      else if (st === "fail") fail += 1;
    }
    return { pass, fail, total: ROUND1_REMEDIATION_28_ITEMS.length };
  }, [state.r1States]);

  const r2Stats = useMemo(() => {
    let pass = 0;
    let blocker = 0;
    for (const m of ROUND2_CORE_MISSIONS_6) {
      const st = state.r2States[m.id]?.status;
      if (st === "pass") pass += 1;
      else if (st === "blocker") blocker += 1;
    }
    return { pass, blocker, total: ROUND2_CORE_MISSIONS_6.length };
  }, [state.r2States]);

  const filteredR1Items = useMemo(() => {
    return ROUND1_REMEDIATION_28_ITEMS.filter((item) => {
      if (r1Filter === "all") return true;
      if (r1Filter === "unresolved") {
        const st = state.r1States[item.id]?.status ?? "pending";
        return st !== "pass";
      }
      return item.area === r1Filter;
    });
  }, [r1Filter, state.r1States]);

  const handleCopyKakaoSummary = () => {
    const autoText = probeSummary
      ? `AI ${probeSummary.passedCount}/${probeSummary.totalCount}`
      : "AI 미실행";
    const summary = `[크리딜 2차 테스터 리허설 보고] ${buildStamp.shortSha} (${state.testerName})\n1) 1차 28건 재검증: 해결 ${r1Stats.pass}/28 · 재발 ${r1Stats.fail}건\n2) 2차 6대 실기기 미션: 완료 ${r2Stats.pass}/6 · 막힘 ${r2Stats.blocker}건 (${autoText})\n3) 현장 결함 핀 ${pins.length}건 · 중개인 인계: ${
      r1Stats.fail === 0 && r2Stats.blocker === 0 ? "기술검증 통과 가능" : "보완 필요"
    }`;
    void handleCopyText(summary, "💬 카카오톡 보고용 3줄 요약을 복사했습니다.");
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200 shadow-2xs">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-1 rounded-lg bg-indigo-900 text-white text-[14px] font-extrabold">
                  일반 테스터 포털
                </span>
                <h1 className="text-lg sm:text-xl font-black text-slate-950">
                  테스터 2차 리허설 & 28건 재검증 허브
                </h1>
              </div>
              <p className="text-[14px] text-slate-600">
                1차 지적 28건 재확인 → 2차 6대 실기기 미션 → AI 4종 점검 후 단일 제출로 마감합니다. (중개인 품평 화면과 완전 분리)
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                data-testid="tester-key-status-btn"
                onClick={() => setShowKeyDrawer((v) => !v)}
                className="min-h-[44px] rounded-xl border border-slate-300 bg-white hover:bg-slate-100 px-3 text-[14px] font-extrabold text-slate-900 cursor-pointer whitespace-nowrap"
              >
                {keyInput ? "🔑 테스터 키 연결됨" : "🔒 테스터 키 입력"}
              </button>
              <Link
                href={appendQaParamsToHref("/qa-tester/showcase", "tester")}
                data-testid="tester-open-showcase-link"
                className="min-h-[44px] inline-flex items-center rounded-xl border border-indigo-700 bg-indigo-700 hover:bg-indigo-800 px-4 text-[15px] font-extrabold text-white whitespace-nowrap"
              >
                🎯 테스터 검수 쇼룸 열기 ↗
              </Link>
              <button
                type="button"
                data-testid="tester-run-auto-probe-btn"
                disabled={probeLoading}
                onClick={() => void handleRunAutoProbe()}
                className="min-h-[44px] rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 px-4 text-[15px] font-extrabold text-white cursor-pointer whitespace-nowrap"
              >
                {probeLoading ? "점검 중..." : "⚡ 1클릭 AI 자동 점검"}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              data-testid="tester-build-stamp-badge"
              className="inline-flex items-center min-h-[38px] rounded-xl border border-slate-300 bg-slate-100 px-3 text-[14px] font-bold text-slate-800"
            >
              {formatBuildStampBadge(buildStamp)}
            </span>
            <span
              data-testid="tester-channel-policy-badge"
              className="inline-flex items-center min-h-[38px] rounded-xl border border-sky-300 bg-sky-50 px-3 text-[14px] font-bold text-sky-900"
            >
              {policyLabel}
            </span>
            <span
              data-testid="tester-progress-summary-badge"
              className="inline-flex items-center min-h-[38px] rounded-xl border border-emerald-300 bg-emerald-50 px-3 text-[14px] font-extrabold text-emerald-950"
            >
              1차 재검증 {r1Stats.pass}/28 · 2차 미션 {r2Stats.pass}/6
            </span>
          </div>

          {showKeyDrawer ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setStoredQaAccessKey(keyInput, "tester");
                setKeyStatusMsg("테스터 전용 키가 저장되었습니다.");
              }}
              className="rounded-xl border border-indigo-300 bg-indigo-50 p-3 flex flex-wrap items-center gap-2.5"
            >
              <input
                type="password"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="전달받은 QA_TESTER_ACCESS_KEY 입력"
                className="min-h-[42px] flex-1 min-w-[220px] rounded-xl border border-indigo-300 bg-white px-3 text-[15px]"
              />
              <button
                type="submit"
                className="min-h-[42px] rounded-xl bg-indigo-700 px-4 text-[14px] font-extrabold text-white cursor-pointer"
              >
                저장
              </button>
              {keyStatusMsg ? (
                <span className="text-[14px] font-bold text-emerald-900">
                  {keyStatusMsg}
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

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Step A: 1차 감수 28건 전수 재검증 */}
        <section
          data-testid="tester-step-a-r1-28"
          className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <h2 className="text-lg font-extrabold text-slate-950">
                Step A · 1차 감수 28건 전수 재검증 (R1-01 ~ R1-28)
              </h2>
              <p className="text-[14px] text-slate-600">
                1차에서 지적하신 33슬라이드 · 28건 조치 내역을 원클릭 링크로 바로 열어 해결 여부를 체크합니다.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: "all", label: "전체 28" },
                  { id: "showcase", label: "쇼룸 16" },
                  { id: "hub_workspace", label: "허브·작업실 12" },
                  { id: "unresolved", label: "미확인·재발" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setR1Filter(tab.id)}
                  aria-pressed={r1Filter === tab.id}
                  className={`min-h-[40px] rounded-xl border px-3 text-[14px] font-extrabold cursor-pointer ${
                    r1Filter === tab.id
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300 bg-white text-slate-800 hover:bg-slate-100"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2.5">
            {filteredR1Items.map((item) => {
              const st = state.r1States[item.id]?.status ?? "pending";
              return (
                <article
                  key={item.id}
                  data-testid={`r1-card-${item.id}`}
                  className={`rounded-xl border p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3 ${
                    st === "pass"
                      ? "border-emerald-300 bg-emerald-50/50"
                      : st === "fail"
                      ? "border-rose-300 bg-rose-50"
                      : "border-slate-200 bg-slate-50"
                  }`}
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 rounded-lg bg-slate-900 text-white text-[13px] font-extrabold">
                        {item.id}
                      </span>
                      <span className="text-[13px] font-bold text-indigo-800">
                        {item.slideRef}
                      </span>
                    </div>
                    <p className="text-[15px] font-bold text-slate-950">
                      {item.issueSummary}
                    </p>
                    <p className="text-[14px] font-semibold text-emerald-900">
                      → 조치: {item.fixApplied}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <a
                      href={appendQaParamsToHref(item.verifyHref, "tester")}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[42px] inline-flex items-center rounded-xl border border-slate-300 bg-white hover:bg-slate-100 px-3 text-[14px] font-bold text-slate-900"
                    >
                      확인 화면 열기 ↗
                    </a>
                    <button
                      type="button"
                      data-testid={`r1-pass-${item.id}`}
                      onClick={() => handleSetR1Status(item.id, "pass")}
                      aria-pressed={st === "pass"}
                      className={`min-h-[42px] rounded-xl border px-3 text-[14px] font-extrabold cursor-pointer ${
                        st === "pass"
                          ? "border-emerald-700 bg-emerald-700 text-white"
                          : "border-emerald-300 bg-white text-emerald-950 hover:bg-emerald-50"
                      }`}
                    >
                      ✓ 해결 확인
                    </button>
                    <button
                      type="button"
                      data-testid={`r1-fail-${item.id}`}
                      onClick={() => handleSetR1Status(item.id, "fail")}
                      aria-pressed={st === "fail"}
                      className={`min-h-[42px] rounded-xl border px-3 text-[14px] font-extrabold cursor-pointer ${
                        st === "fail"
                          ? "border-rose-700 bg-rose-700 text-white"
                          : "border-rose-300 bg-white text-rose-950 hover:bg-rose-50"
                      }`}
                    >
                      ✕ 재발
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {/* Step B: 2차 핵심 회귀 · 6대 실기기 미션 */}
        <section
          data-testid="tester-step-b-missions-6"
          className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4"
        >
          <div className="space-y-1">
            <h2 className="text-lg font-extrabold text-slate-950">
              Step B · 2차 핵심 회귀 · 신규 위험 6대 실기기 미션 (R2-M1 ~ R2-M6)
            </h2>
            <p className="text-[14px] text-slate-600">
              새로 보강된 파싱·샘플 키트·전화번호 하이픈·열람 배지·PC→모바일 이어쓰기·스마트폰 카톡 OG를 집중 점검합니다.
            </p>
          </div>

          <div className="space-y-3">
            {ROUND2_CORE_MISSIONS_6.map((mission) => {
              const st = state.r2States[mission.id]?.status ?? "pending";
              return (
                <article
                  key={mission.id}
                  data-testid={`r2-mission-card-${mission.id}`}
                  className={`rounded-xl border p-4 space-y-3 ${
                    st === "pass"
                      ? "border-emerald-300 bg-emerald-50/40"
                      : st === "blocker"
                      ? "border-rose-300 bg-rose-50"
                      : "border-slate-200 bg-slate-50"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-lg bg-indigo-900 text-white text-[13px] font-extrabold">
                          {mission.id}
                        </span>
                        <span className="text-[13px] font-bold text-slate-600">
                          예상 {mission.targetMin}분
                        </span>
                        {mission.mandatoryEveryCycle ? (
                          <span className="px-2 py-0.5 rounded-lg bg-rose-100 text-rose-900 border border-rose-300 text-[13px] font-extrabold">
                            필수 미션
                          </span>
                        ) : null}
                      </div>
                      <h3 className="text-base font-extrabold text-slate-950">
                        {mission.title}
                      </h3>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        data-testid={`r2-mission-pass-${mission.id}`}
                        onClick={() => handleSetR2Status(mission.id, "pass")}
                        aria-pressed={st === "pass"}
                        className={`min-h-[42px] rounded-xl border px-3.5 text-[14px] font-extrabold cursor-pointer ${
                          st === "pass"
                            ? "border-emerald-700 bg-emerald-700 text-white"
                            : "border-emerald-300 bg-white text-emerald-950 hover:bg-emerald-50"
                        }`}
                      >
                        ✓ 완료·이상 없음
                      </button>
                      <button
                        type="button"
                        data-testid={`r2-mission-blocker-${mission.id}`}
                        onClick={() =>
                          handleSetR2Status(mission.id, "blocker")
                        }
                        aria-pressed={st === "blocker"}
                        className={`min-h-[42px] rounded-xl border px-3.5 text-[14px] font-extrabold cursor-pointer ${
                          st === "blocker"
                            ? "border-rose-700 bg-rose-700 text-white"
                            : "border-rose-300 bg-white text-rose-950 hover:bg-rose-50"
                        }`}
                      >
                        ✕ 진행 막힘(Blocker)
                      </button>
                    </div>
                  </div>

                  <p className="text-[15px] text-slate-800 leading-relaxed">
                    {mission.observationPoint}
                  </p>
                  <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[14px] font-bold text-blue-950">
                    합격 기준: {mission.passCriteria}
                  </p>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {mission.sampleMemo ? (
                      <button
                        type="button"
                        data-testid="r2-m1-copy-memo-btn"
                        onClick={() =>
                          void handleCopyText(
                            mission.sampleMemo!,
                            "📋 R2-M1 표준 매물 메모(2,000억 · 4,313평)를 복사했습니다."
                          )
                        }
                        className="min-h-[42px] rounded-xl border border-indigo-300 bg-indigo-50 hover:bg-indigo-100 px-3.5 text-[14px] font-extrabold text-indigo-900 cursor-pointer"
                      >
                        📋 표준 매물 메모 복사
                      </button>
                    ) : null}

                    {mission.sampleKitZipHref ? (
                      <a
                        href={mission.sampleKitZipHref}
                        download
                        data-testid="r2-m2-download-zip-btn"
                        className="min-h-[42px] inline-flex items-center rounded-xl border border-emerald-400 bg-emerald-50 hover:bg-emerald-100 px-3.5 text-[14px] font-extrabold text-emerald-950"
                      >
                        📦 샘플 키트(.zip) 다운로드
                      </a>
                    ) : null}

                    {mission.sampleKitCsvHref ? (
                      <a
                        href={mission.sampleKitCsvHref}
                        download
                        data-testid="r2-m2-download-csv-btn"
                        className="min-h-[42px] inline-flex items-center rounded-xl border border-slate-300 bg-white hover:bg-slate-100 px-3.5 text-[14px] font-extrabold text-slate-900"
                      >
                        📊 샘플 렌트롤(.csv) 다운로드
                      </a>
                    ) : null}

                    <a
                      href={appendQaParamsToHref(mission.targetHref, "tester")}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[42px] inline-flex items-center rounded-xl bg-slate-900 hover:bg-slate-800 px-4 text-[14px] font-extrabold text-white"
                    >
                      🚀 해당 화면 바로 열기 ↗
                    </a>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {/* Step C: AI 4종 점검 · 최종 확인 & 단일 서버 제출 */}
        <section
          data-testid="tester-step-c-submit"
          className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-extrabold text-slate-950">
              Step C · AI 4종 자동 점검 & 테스터 단일 최종 제출
            </h2>
            {probeSummary ? (
              <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300 text-[14px] font-extrabold">
                AI {probeSummary.passedCount}/{probeSummary.totalCount} 자동 통과
              </span>
            ) : null}
          </div>

          {probeError ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-[14px] font-bold text-rose-900">
              {probeError}
            </p>
          ) : null}

          {probeSummary ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {probeSummary.checks.map((chk) => (
                <div
                  key={chk.id}
                  className={`rounded-xl border p-3 ${
                    chk.passed
                      ? "border-emerald-300 bg-emerald-50/70"
                      : "border-rose-300 bg-rose-50"
                  }`}
                >
                  <p className="text-[14px] font-extrabold text-slate-950">
                    {chk.passed ? "✅ " : "❌ "}
                    {chk.title}
                  </p>
                  <p className="text-[13px] text-slate-700 mt-0.5">
                    {chk.detail}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[14px] text-slate-600">
              상단 [⚡ 1클릭 AI 자동 점검]을 누르면 블라인드·임대차 수식·링크 잠금·외부 노출 차단을 즉시 확인합니다.
            </p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-slate-200">
            <label className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={state.confirmations.versionMatched}
                onChange={(e) =>
                  persistLocal({
                    ...state,
                    confirmations: {
                      ...state.confirmations,
                      versionMatched: e.target.checked,
                    },
                  })
                }
                className="mt-1 h-5 w-5"
              />
              <span className="text-[14px] font-bold text-slate-900">
                확인 1 · 화면 상단/하단 빌드 번호({buildStamp.shortSha})가 최신 배포본과 일치함을 확인했습니다.
              </span>
            </label>

            <label className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={state.confirmations.mobileKakaoChecked}
                onChange={(e) =>
                  persistLocal({
                    ...state,
                    confirmations: {
                      ...state.confirmations,
                      mobileKakaoChecked: e.target.checked,
                    },
                  })
                }
                className="mt-1 h-5 w-5"
              />
              <span className="text-[14px] font-bold text-slate-900">
                확인 2 · 스마트폰 카카오톡 인앱 실기기에서 필수 미션(R2-M4, R2-M6)을 직접 확인했습니다.
              </span>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-[14px] font-bold text-slate-800">
                테스터 성함
              </span>
              <input
                type="text"
                value={state.testerName}
                onChange={(e) =>
                  persistLocal({ ...state, testerName: e.target.value })
                }
                className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-[15px]"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[14px] font-bold text-slate-800">
                테스트 기기·브라우저 메모
              </span>
              <input
                type="text"
                value={state.deviceLabel}
                onChange={(e) =>
                  persistLocal({ ...state, deviceLabel: e.target.value })
                }
                className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-[15px]"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              data-testid="tester-r2-submit-btn"
              disabled={submitting}
              onClick={() => void handleFinalSubmit()}
              className="min-h-[46px] rounded-xl bg-indigo-700 hover:bg-indigo-800 disabled:opacity-50 px-5 text-[15px] font-extrabold text-white cursor-pointer"
            >
              {submitting
                ? "제출 중..."
                : "☁️ 2차 리허설 결과 서버 제출 완료"}
            </button>
            <button
              type="button"
              data-testid="tester-copy-kakao-summary-btn"
              onClick={handleCopyKakaoSummary}
              className="min-h-[46px] rounded-xl border border-amber-400 bg-amber-50 hover:bg-amber-100 px-4 text-[15px] font-extrabold text-amber-950 cursor-pointer"
            >
              💬 카카오톡 공유용 3줄 요약 복사
            </button>
          </div>

          {submitMessage ? (
            <p
              data-testid="tester-submit-feedback"
              className="text-[15px] font-bold text-emerald-800"
            >
              {submitMessage}
            </p>
          ) : null}
        </section>

        {/* 테스터 전용 현장 검수 핀 수집함 */}
        <section
          data-testid="tester-pins-list"
          className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-extrabold text-slate-950">
              📌 내가 등록한 테스터 현장 결함 핀 ({pins.length}건)
            </h2>
            <button
              type="button"
              onClick={() => void fetchPins()}
              className="min-h-[40px] rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 px-3 text-[14px] font-bold cursor-pointer"
            >
              {pinsLoading ? "불러오는 중..." : "↻ 새로고침"}
            </button>
          </div>

          {pins.length === 0 ? (
            <p className="text-[14px] text-slate-600">
              등록된 테스터 핀이 없습니다. 작업실 왼쪽 아래 [📌 화면 검수 메모] 또는 쇼룸 하단 결함 보고 폼으로 남기면 여기에 자동 수집됩니다.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {pins.map((pin) => (
                <article
                  key={pin.id}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[14px] font-extrabold text-slate-950">
                      [{pin.workspace}] {pin.targetLabel}
                    </span>
                    <span className="text-[13px] font-bold text-slate-600">
                      {pin.severity}
                    </span>
                  </div>
                  <p className="text-[14px] text-slate-800">{pin.note}</p>
                  {pin.screenshotDataUrl ? (
                    <button
                      type="button"
                      data-testid={`qa-pin-thumb-${pin.id}`}
                      onClick={() => setLightboxPin(pin)}
                      className="block w-full overflow-hidden rounded-lg border border-slate-300 bg-white cursor-zoom-in"
                    >
                      <img
                        src={pin.screenshotDataUrl}
                        alt={`${pin.targetLabel} 캡처 썸네일`}
                        className="block w-full max-h-36 object-cover"
                      />
                    </button>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>

        {lightboxPin && lightboxPin.screenshotDataUrl ? (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${lightboxPin.targetLabel} 확대 캡처`}
            data-testid="qa-pin-screenshot-lightbox"
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4"
          >
            <button
              type="button"
              aria-label="확대 창 닫기"
              onClick={() => setLightboxPin(null)}
              className="fixed inset-0 h-full w-full bg-transparent cursor-default"
            />
            <div className="relative z-10 w-full max-w-3xl rounded-2xl border-2 border-slate-700 bg-white p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-lg font-extrabold text-slate-950">
                  {lightboxPin.workspace} · {lightboxPin.targetLabel}
                </h3>
                <button
                  type="button"
                  onClick={() => setLightboxPin(null)}
                  className="min-h-[40px] rounded-xl bg-slate-900 px-3 text-[14px] font-extrabold text-white cursor-pointer"
                >
                  ✕ 닫기
                </button>
              </div>
              <img
                src={lightboxPin.screenshotDataUrl}
                alt={`${lightboxPin.targetLabel} 확대 캡처`}
                className="w-full max-h-[70vh] object-contain rounded-xl border border-slate-300"
              />
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}

export default function QaTesterSignoffPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 p-6 text-[16px] font-bold text-slate-800">
          테스터 리허설 허브를 불러오는 중입니다...
        </div>
      }
    >
      <QaTesterSignoffInner />
    </Suspense>
  );
}
