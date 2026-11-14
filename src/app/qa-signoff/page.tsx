"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  FASTTRACK_STEPS,
  QA_SIGNOFF_WORKBENCH_ID,
  type FastTrackRecord,
  type FastTrackStatus,
} from "@/lib/testguide/qa-signoff-fasttrack-data";

interface AutoProbeCheckItem {
  id: string;
  title: string;
  passed: boolean;
  detail: string;
}

interface AutoProbeSummary {
  checkedAt: string;
  authenticated: boolean;
  passedCount: number;
  totalCount: number;
  checks: AutoProbeCheckItem[];
  readyLinks?: {
    dealcards?: string;
    im?: string;
    newsletter?: string;
    inbox?: string;
    liveIm?: string | null;
    liveNewsletter?: string | null;
  };
}

interface QaPinRow {
  id: string;
  sessionId: string;
  workspace: string;
  routePath: string;
  targetSelector: string;
  targetLabel: string;
  note: string;
  severity: "critical" | "major" | "minor";
  viewport?: { width: number; height: number } | null;
  fontScale?: string | null;
  createdAt: string;
  authorEmail?: string | null;
}

const SIGNOFF_SESSION_KEY = "credeal-qa-signoff-session-v1";
const SIGNOFF_STATE_KEY = "credeal-qa-signoff-records-v1";

function createSignoffSessionId(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `signoff-${Date.now()}-${rand}`;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function QaSignoffHubPage() {
  const [sessionId, setSessionId] = useState("signoff-default");
  const [testerName, setTesterName] = useState("");
  const [testerOrg, setTesterOrg] = useState("");
  const [overallComment, setOverallComment] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [records, setRecords] = useState<Record<string, FastTrackRecord>>({});
  const [pins, setPins] = useState<QaPinRow[]>([]);
  const [pinsLoading, setPinsLoading] = useState(false);

  const [probeLoading, setProbeLoading] = useState(false);
  const [probeSummary, setProbeSummary] = useState<AutoProbeSummary | null>(null);
  const [probeError, setProbeError] = useState<string | null>(null);

  const [seedLoading, setSeedLoading] = useState(false);
  const [seedNotice, setSeedNotice] = useState<string | null>(null);

  const [submitLoading, setSubmitLoading] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  const fetchPins = useCallback(async () => {
    setPinsLoading(true);
    try {
      const res = await fetch("/api/public/qa-workbench?mode=pins", {
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok && Array.isArray(json.pins)) {
        setPins(json.pins);
      }
    } catch {
      // ignore fetch error
    } finally {
      setPinsLoading(false);
    }
  }, []);

  useEffect(() => {
    let resolvedId = "signoff-default";
    try {
      const existing = window.localStorage.getItem(SIGNOFF_SESSION_KEY);
      if (existing && existing.trim()) {
        resolvedId = existing.trim();
      } else {
        resolvedId = createSignoffSessionId();
        window.localStorage.setItem(SIGNOFF_SESSION_KEY, resolvedId);
      }
      const savedRaw = window.localStorage.getItem(SIGNOFF_STATE_KEY);
      if (savedRaw) {
        const parsed = JSON.parse(savedRaw);
        if (parsed?.records && typeof parsed.records === "object") {
          setRecords(parsed.records);
        }
        if (typeof parsed?.testerName === "string") setTesterName(parsed.testerName);
        if (typeof parsed?.testerOrg === "string") setTesterOrg(parsed.testerOrg);
        if (typeof parsed?.overallComment === "string") {
          setOverallComment(parsed.overallComment);
        }
      }
    } catch {
      // ignore storage errors
    }
    setSessionId(resolvedId);
    void fetchPins();
  }, [fetchPins]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const persistLocal = useCallback(
    (
      nextRecords: Record<string, FastTrackRecord>,
      nextName = testerName,
      nextOrg = testerOrg,
      nextComment = overallComment
    ) => {
      try {
        window.localStorage.setItem(
          SIGNOFF_STATE_KEY,
          JSON.stringify({
            records: nextRecords,
            testerName: nextName,
            testerOrg: nextOrg,
            overallComment: nextComment,
          })
        );
      } catch {
        // ignore storage errors
      }
    },
    [testerName, testerOrg, overallComment]
  );

  const syncToServer = useCallback(
    async (
      mode: "sync" | "submit",
      nextRecords: Record<string, FastTrackRecord>
    ) => {
      if (mode === "submit") setSubmitLoading(true);
      try {
        const res = await fetch("/api/public/qa-workbench", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode,
            workbenchId: QA_SIGNOFF_WORKBENCH_ID,
            sessionId,
            testerName,
            testerOrg,
            overallComment,
            elapsedSeconds,
            records: nextRecords,
          }),
        });
        const json = await res.json().catch(() => null);
        if (res.ok && json?.ok) {
          setSyncNotice(
            mode === "submit"
              ? "최종 검수 판정을 서버에 저장했습니다."
              : "진행 상황이 자동 동기화되었습니다."
          );
        }
      } catch {
        if (mode === "submit") {
          setSyncNotice("서버 통신에 실패해 브라우저에만 임시 저장되었습니다.");
        }
      } finally {
        if (mode === "submit") setSubmitLoading(false);
      }
    },
    [elapsedSeconds, overallComment, sessionId, testerName, testerOrg]
  );

  const handleSetStatus = (stepId: string, status: FastTrackStatus) => {
    setRecords((prev) => {
      const existing = prev[stepId] || { status: "pending", memo: "" };
      const next: Record<string, FastTrackRecord> = {
        ...prev,
        [stepId]: {
          ...existing,
          status,
          updatedAt: new Date().toISOString(),
        },
      };
      persistLocal(next);
      void syncToServer("sync", next);
      return next;
    });
  };

  const handleSetMemo = (stepId: string, memo: string) => {
    setRecords((prev) => {
      const existing = prev[stepId] || { status: "pending", memo: "" };
      const next: Record<string, FastTrackRecord> = {
        ...prev,
        [stepId]: {
          ...existing,
          memo,
          updatedAt: new Date().toISOString(),
        },
      };
      persistLocal(next);
      return next;
    });
  };

  const handleRunAutoProbeAll = async () => {
    setProbeLoading(true);
    setProbeError(null);
    try {
      const res = await fetch("/api/public/qa-workbench", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "auto_probe_all" }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setProbeError(
          json?.error || "자동 불변식 점검을 실행하지 못했습니다."
        );
        return;
      }
      setProbeSummary(json as AutoProbeSummary);
    } catch {
      setProbeError("네트워크 오류로 자동 점검에 실패했습니다.");
    } finally {
      setProbeLoading(false);
    }
  };

  const handleSeedAxis456 = async () => {
    setSeedLoading(true);
    setSeedNotice(null);
    try {
      const res = await fetch("/api/public/qa-workbench", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "seed_axis456" }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setSeedNotice(
          json?.error || "중개사 계정으로 로그인한 뒤 실행해 주세요."
        );
        return;
      }
      setSeedNotice(json.message || "테스트 고객·구독자 시드를 생성했습니다.");
    } catch {
      setSeedNotice("시드 생성 요청 중 네트워크 오류가 발생했습니다.");
    } finally {
      setSeedLoading(false);
    }
  };

  const handleActivatePinAndOpen = (href: string) => {
    try {
      window.localStorage.setItem("credeal-qa-pin-active", "1");
    } catch {
      // ignore storage errors
    }
    window.open(href, "_blank", "noopener,noreferrer");
  };

  const stats = useMemo(() => {
    let passCount = 0;
    let failCount = 0;
    let s0FailCount = 0;
    for (const step of FASTTRACK_STEPS) {
      const rec = records[step.id];
      if (rec?.status === "pass") passCount += 1;
      else if (rec?.status === "fail") {
        failCount += 1;
        if (step.severityOnFail === "S0") s0FailCount += 1;
      }
    }
    const criticalPins = pins.filter((p) => p.severity === "critical").length;
    const autoAllOk =
      probeSummary !== null &&
      probeSummary.passedCount === probeSummary.totalCount;

    const status =
      failCount > 0 || criticalPins > 0
        ? "NOGO"
        : passCount >= FASTTRACK_STEPS.length && autoAllOk
        ? "GO"
        : "PROGRESS";

    return {
      passCount,
      failCount,
      s0FailCount,
      criticalPins,
      total: FASTTRACK_STEPS.length,
      status,
    };
  }, [pins, probeSummary, records]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200 shadow-2xs">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-1 rounded-lg bg-slate-900 text-white text-[15px] font-extrabold">
                  QA SIGNOFF HUB
                </span>
                <h1 className="text-lg sm:text-xl font-black text-slate-950 break-keep">
                  상용화 20분 고속 검수 · AI-인간 협업 허브
                </h1>
                <span
                  data-testid="signoff-verdict-badge"
                  className={`px-3 py-1 rounded-full text-[15px] font-extrabold border ${
                    stats.status === "GO"
                      ? "bg-emerald-100 text-emerald-950 border-emerald-300"
                      : stats.status === "NOGO"
                      ? "bg-rose-100 text-rose-950 border-rose-300"
                      : "bg-amber-50 text-amber-950 border-amber-300"
                  }`}
                >
                  {stats.status === "GO"
                    ? "🟢 GO · 출시 승인 가능"
                    : stats.status === "NOGO"
                    ? `🔴 NO-GO · 결함 보완 필요 (실패 ${stats.failCount} · 긴급핀 ${stats.criticalPins})`
                    : `🟡 점검 중 (${stats.passCount}/${stats.total} 통과)`}
                </span>
              </div>
              <p className="text-[15px] text-slate-600 break-keep">
                기계적 방역·수식·권한 검사는 AI가 3초 만에 선행 완료하고, 사람은 4개 작업실에서 20분 이내 육안·UX 감수만 진행합니다.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="min-h-[44px] inline-flex items-center px-3 rounded-xl bg-slate-100 border border-slate-300 text-[15px] font-bold text-slate-800 whitespace-nowrap">
                ⏱ {formatDuration(elapsedSeconds)}
              </span>
              <button
                type="button"
                data-testid="run-auto-probe-all-btn"
                disabled={probeLoading}
                onClick={handleRunAutoProbeAll}
                className="min-h-[48px] px-4 rounded-xl bg-[#007AFF] hover:bg-[#0062CC] disabled:opacity-50 text-white text-[15px] sm:text-base font-extrabold shadow-xs cursor-pointer whitespace-nowrap transition"
              >
                {probeLoading
                  ? "AI 불변식 점검 중…"
                  : "⚡ 1클릭 AI 자동 불변식 점검"}
              </button>
              <button
                type="button"
                data-testid="run-seed-axis456-btn"
                disabled={seedLoading}
                onClick={handleSeedAxis456}
                className="min-h-[48px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-[15px] font-extrabold shadow-xs cursor-pointer whitespace-nowrap transition"
              >
                {seedLoading ? "시드 생성 중…" : "🌱 테스트 고객·구독자 시드"}
              </button>
            </div>
          </div>

          <nav
            aria-label="상세 검수 도구 이동"
            className="flex flex-wrap items-center gap-2 pt-1"
          >
            <Link
              href="/dealcard-im-test"
              className="min-h-[44px] inline-flex items-center px-3 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-[15px] font-bold text-slate-900 whitespace-nowrap"
            >
              딜카드·IM 정밀 점검표 ↗
            </Link>
            <Link
              href="/newsletter-inbox-test"
              className="min-h-[44px] inline-flex items-center px-3 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-[15px] font-bold text-slate-900 whitespace-nowrap"
            >
              뉴스레터·소통함 정밀 점검표 ↗
            </Link>
            <Link
              href="/testguide"
              className="min-h-[44px] inline-flex items-center px-3 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-[15px] font-bold text-slate-900 whitespace-nowrap"
            >
              슈도 골든 검수표 v4.0 ↗
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {seedNotice && (
          <div
            role="status"
            data-testid="seed-notice-banner"
            className="rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-[15px] font-bold text-emerald-950"
          >
            {seedNotice}
          </div>
        )}

        {/* 1. AI 자동 불변식 점검 결과 */}
        <section
          aria-labelledby="auto-probe-heading"
          data-testid="auto-probe-results"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2
              id="auto-probe-heading"
              className="text-base sm:text-lg font-extrabold text-slate-950"
            >
              1단계 · AI 자동 불변식 점검 (사람이 숫자·보안 수동 대조 불필요)
            </h2>
            {probeSummary && (
              <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300 text-[15px] font-extrabold">
                {probeSummary.passedCount}/{probeSummary.totalCount} 자동 통과
              </span>
            )}
          </div>

          {probeError && (
            <p className="rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-[15px] font-bold text-rose-900">
              {probeError}
            </p>
          )}

          {!probeSummary ? (
            <p className="text-[15px] sm:text-base text-slate-600 break-keep">
              오른쪽 위 [⚡ 1클릭 AI 자동 불변식 점검] 버튼을 누르면 블라인드 방역·임대차 수식·링크 잠금·노출 차단을 즉시 검증합니다.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {probeSummary.checks.map((chk) => (
                <div
                  key={chk.id}
                  data-testid={`auto-probe-item-${chk.id}`}
                  className={`rounded-xl border p-3.5 space-y-1 ${
                    chk.passed
                      ? "bg-emerald-50/70 border-emerald-300"
                      : "bg-rose-50 border-rose-300"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-base font-extrabold text-slate-950">
                      {chk.passed ? "✅ " : "❌ "}
                      {chk.title}
                    </span>
                    <span className="text-[15px] font-extrabold text-slate-700 shrink-0">
                      {chk.passed ? "통과" : "보완"}
                    </span>
                  </div>
                  <p className="text-[15px] text-slate-700 break-keep">
                    {chk.detail}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 2. 20분 인간 고속 감수 6단계 + 현장 핀(?qa=1) */}
        <section
          aria-labelledby="fasttrack-heading"
          className="space-y-3.5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2
              id="fasttrack-heading"
              className="text-base sm:text-lg font-extrabold text-slate-950"
            >
              2단계 · 인간 테스터 20분 고속 감수 (4개 작업실 + 시니어 UX)
            </h2>
            <span className="text-[15px] font-semibold text-slate-600">
              완료: {stats.passCount} / {stats.total} 단계
            </span>
          </div>

          <div className="space-y-3">
            {FASTTRACK_STEPS.map((step) => {
              const rec = records[step.id] || { status: "pending", memo: "" };
              return (
                <article
                  key={step.id}
                  data-testid={`fasttrack-step-${step.id}`}
                  className={`rounded-2xl border p-5 bg-white shadow-xs space-y-3 ${
                    rec.status === "pass"
                      ? "border-emerald-300"
                      : rec.status === "fail"
                      ? "border-rose-400"
                      : "border-slate-200"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-lg bg-slate-900 text-white text-[15px] font-extrabold">
                          {step.id} · {step.durationMin}분
                        </span>
                        <h3 className="text-base sm:text-lg font-extrabold text-slate-950 break-keep">
                          {step.title}
                        </h3>
                      </div>
                      <p className="text-[15px] font-semibold text-blue-900 break-keep">
                        합격 기준: {step.visualOracle}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleActivatePinAndOpen(step.targetHref)}
                      data-testid={`fasttrack-launch-${step.id}`}
                      className="min-h-[44px] px-3.5 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-[#0040DD] text-[15px] font-extrabold cursor-pointer whitespace-nowrap shrink-0"
                    >
                      {step.workspaceLabel} ↗
                    </button>
                  </div>

                  <ul className="space-y-1.5 rounded-xl bg-slate-50 border border-slate-200 p-3.5 text-[15px] text-slate-800 list-disc pl-6">
                    {step.checklist.map((line, i) => (
                      <li key={i} className="leading-relaxed break-keep">
                        {line}
                      </li>
                    ))}
                  </ul>

                  <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 pt-1">
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        data-testid={`fasttrack-pass-${step.id}`}
                        onClick={() => handleSetStatus(step.id, "pass")}
                        className={`min-h-[44px] px-4 rounded-xl text-[15px] font-extrabold border cursor-pointer transition ${
                          rec.status === "pass"
                            ? "bg-emerald-600 text-white border-emerald-700"
                            : "bg-white text-slate-800 border-slate-300 hover:bg-emerald-50"
                        }`}
                      >
                        ✓ 통과
                      </button>
                      <button
                        type="button"
                        data-testid={`fasttrack-fail-${step.id}`}
                        onClick={() => handleSetStatus(step.id, "fail")}
                        className={`min-h-[44px] px-4 rounded-xl text-[15px] font-extrabold border cursor-pointer transition ${
                          rec.status === "fail"
                            ? "bg-rose-600 text-white border-rose-700"
                            : "bg-white text-slate-800 border-slate-300 hover:bg-rose-50"
                        }`}
                      >
                        ✕ 보완
                      </button>
                    </div>

                    <input
                      type="text"
                      aria-label={`${step.id} 메모`}
                      data-testid={`fasttrack-memo-${step.id}`}
                      value={rec.memo}
                      onChange={(e) => handleSetMemo(step.id, e.target.value)}
                      placeholder="발견 사항이나 의견을 짧게 적어 주세요..."
                      className="min-h-[44px] flex-1 rounded-xl border border-slate-300 bg-white px-3.5 text-base text-slate-900 placeholder:text-slate-500 focus:border-[#007AFF] focus:outline-none"
                    />
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {/* 3. 현장 검수 핀 수집함 */}
        <section
          aria-labelledby="qa-pins-heading"
          data-testid="qa-pins-panel"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-3.5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2
                id="qa-pins-heading"
                className="text-base sm:text-lg font-extrabold text-slate-950"
              >
                📌 현장 검수 핀 수집함 ({pins.length}건)
              </h2>
              <p className="text-[15px] text-slate-600 break-keep">
                작업실(?qa=1)에서 [📌 화면 검수 핀]으로 등록한 UI·문구·오류 메모가 실시간으로 모입니다.
              </p>
            </div>
            <button
              type="button"
              data-testid="refresh-qa-pins-btn"
              disabled={pinsLoading}
              onClick={() => void fetchPins()}
              className="min-h-[44px] px-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-[15px] font-bold text-slate-900 cursor-pointer whitespace-nowrap"
            >
              {pinsLoading ? "불러오는 중…" : "↻ 핀 새로고침"}
            </button>
          </div>

          {pins.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-[15px] text-slate-600 text-center">
              아직 등록된 현장 핀이 없습니다. 작업실을 (?qa=1)로 열어 왼쪽 아래 📌 핀 버튼을 눌러 보세요.
            </p>
          ) : (
            <div className="space-y-2.5">
              {pins.map((pin) => (
                <div
                  key={pin.id}
                  data-testid={`qa-pin-row-${pin.id}`}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-1"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[15px] font-extrabold ${
                          pin.severity === "critical"
                            ? "bg-rose-100 text-rose-900 border border-rose-300"
                            : pin.severity === "minor"
                            ? "bg-slate-200 text-slate-800"
                            : "bg-amber-100 text-amber-900 border border-amber-300"
                        }`}
                      >
                        {pin.severity === "critical"
                          ? "긴급"
                          : pin.severity === "minor"
                          ? "개선"
                          : "중요"}
                      </span>
                      <span className="text-[15px] font-bold text-slate-900">
                        {pin.workspace} · {pin.targetLabel}
                      </span>
                      <span className="text-[15px] text-slate-500">
                        {pin.targetSelector}
                      </span>
                    </div>
                    <span className="text-[15px] text-slate-500">
                      {pin.viewport
                        ? `${pin.viewport.width}×${pin.viewport.height}`
                        : ""}{" "}
                      {pin.fontScale ? `· 글자:${pin.fontScale}` : ""}
                    </span>
                  </div>
                  <p className="text-base font-semibold text-slate-900 break-keep">
                    {pin.note}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 4. 최종 승인 서명 & 제출 */}
        <section
          aria-labelledby="signoff-submit-heading"
          className="rounded-2xl border border-slate-300 bg-white p-5 shadow-xs space-y-4"
        >
          <h2
            id="signoff-submit-heading"
            className="text-base sm:text-lg font-extrabold text-slate-950"
          >
            3단계 · 최종 검수 서명 및 서버 제출
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="signoff-tester-name"
                className="block text-[15px] font-bold text-slate-800 mb-1"
              >
                검수자 성함
              </label>
              <input
                id="signoff-tester-name"
                type="text"
                value={testerName}
                onChange={(e) => {
                  setTesterName(e.target.value);
                  persistLocal(records, e.target.value, testerOrg, overallComment);
                }}
                placeholder="예: 홍길동 팀장"
                className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 text-base text-slate-900"
              />
            </div>
            <div>
              <label
                htmlFor="signoff-tester-org"
                className="block text-[15px] font-bold text-slate-800 mb-1"
              >
                소속
              </label>
              <input
                id="signoff-tester-org"
                type="text"
                value={testerOrg}
                onChange={(e) => {
                  setTesterOrg(e.target.value);
                  persistLocal(records, testerName, e.target.value, overallComment);
                }}
                placeholder="예: 크리딜 QA"
                className="min-h-[44px] w-full rounded-xl border border-slate-300 px-3.5 text-base text-slate-900"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="signoff-overall-comment"
              className="block text-[15px] font-bold text-slate-800 mb-1"
            >
              최종 검수 의견
            </label>
            <textarea
              id="signoff-overall-comment"
              rows={2}
              value={overallComment}
              onChange={(e) => {
                setOverallComment(e.target.value);
                persistLocal(records, testerName, testerOrg, e.target.value);
              }}
              placeholder="상용화 출시 적합 여부와 핵심 소견을 적어 주세요."
              className="w-full rounded-xl border border-slate-300 p-3 text-base text-slate-900"
            />
          </div>

          {syncNotice && (
            <p
              role="status"
              data-testid="signoff-sync-notice"
              className="rounded-xl bg-blue-50 border border-blue-200 px-3.5 py-2.5 text-[15px] font-bold text-blue-950"
            >
              {syncNotice}
            </p>
          )}

          <button
            type="button"
            disabled={submitLoading}
            data-testid="signoff-submit-btn"
            onClick={() => void syncToServer("submit", records)}
            className="w-full min-h-[52px] rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-base font-extrabold cursor-pointer transition"
          >
            {submitLoading ? "제출 중…" : "☁️ 최종 출시 검수 결과 서버 제출"}
          </button>
        </section>
      </main>
    </div>
  );
}
