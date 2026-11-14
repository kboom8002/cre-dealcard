"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  FASTTRACK_STEPS,
  TESTER_MISSIONS_8,
  BROKER_READINESS_GATE_6,
  BROKER_SESSIONS_4,
  BROKER_RUBRIC_6,
  BROKER_PREREQ_REQUEST_TEMPLATE,
  QA_SIGNOFF_WORKBENCH_ID,
  QA_TESTER_MISSIONS_WORKBENCH_ID,
  QA_BROKER_SESSION_WORKBENCH_ID,
  type FastTrackRecord,
  type FastTrackStatus,
} from "@/lib/testguide/qa-signoff-fasttrack-data";
import {
  BROKER_REQUIREMENTS_REGISTRY,
  BROKER_AREA_LABELS,
  type BrokerRequirementBiasTag,
} from "@/lib/qa/broker-requirements-registry";
import {
  formatBuildStampBadge,
  getBuildStampInfo,
  parseCompactDeviceLabel,
  QA_OUTBOUND_CHANNEL_POLICY,
} from "@/lib/qa/build-stamp";

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
  buildSha?: string | null;
  builtAt?: string | null;
  userAgent?: string | null;
  authorRole?: "tester" | "broker";
  pinMode?: "issue" | "redpen";
  originalText?: string | null;
  suggestedText?: string | null;
  screenshotDataUrl?: string | null;
}

type ActiveQaTrack = "fasttrack" | "tester" | "broker";
type MissionVerdict = "pending" | "pass" | "blocker";
type BrokerTaskVerdict = "pending" | "send_as_is" | "minor_edit" | "cannot_send";
type BrokerBrVerdict = "pending" | "pass" | "fail";

interface TesterMissionState {
  status: MissionVerdict;
  seqScore: number | null;
  memo: string;
}

interface BrokerDraftRequirement {
  id: string;
  situation: string;
  want: string;
  reason: string;
  example: string;
  biasTag: BrokerRequirementBiasTag;
  createdAt: string;
}

const SIGNOFF_SESSION_KEY = "credeal-qa-signoff-session-v1";
const SIGNOFF_STATE_KEY = "credeal-qa-signoff-records-v1";
const TESTER_TRACK_STATE_KEY = "credeal-qa-tester-track-v2";
const BROKER_TRACK_STATE_KEY = "credeal-qa-broker-track-v2";

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
  const buildStamp = useMemo(() => getBuildStampInfo(), []);
  const buildBadgeLabel = useMemo(
    () => formatBuildStampBadge(buildStamp),
    [buildStamp]
  );

  // 기본 활성 탭은 기존 20분 고속 검수 유지 (기존 E2E·테스트 계약 보존)
  const [activeTrack, setActiveTrack] = useState<ActiveQaTrack>("fasttrack");

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

  // Track 2: 테스터 미션 8종 & 준비 완료 게이트 6조건
  const [gateChecks, setGateChecks] = useState<Record<string, boolean>>({});
  const [missionStates, setMissionStates] = useState<
    Record<string, TesterMissionState>
  >({});
  const [testerSaving, setTesterSaving] = useState(false);
  const [testerNotice, setTesterNotice] = useState<string | null>(null);

  // Track 3: 중개인 1인 회차 패키지 (화 · 목)
  const [selectedSessionId, setSelectedSessionId] = useState<
    "S1" | "S2" | "S3" | "S4"
  >("S1");
  const [brVerdicts, setBrVerdicts] = useState<Record<string, BrokerBrVerdict>>(
    {}
  );
  const [taskVerdicts, setTaskVerdicts] = useState<
    Record<string, BrokerTaskVerdict>
  >({});
  const [rubricScores, setRubricScores] = useState<Record<string, number>>({});
  const [draftSituation, setDraftSituation] = useState("");
  const [draftWant, setDraftWant] = useState("");
  const [draftReason, setDraftReason] = useState("");
  const [draftExample, setDraftExample] = useState("");
  const [draftBiasTag, setDraftBiasTag] =
    useState<BrokerRequirementBiasTag>("공통");
  const [brokerDrafts, setBrokerDrafts] = useState<BrokerDraftRequirement[]>([]);
  const [prereqCopied, setPrereqCopied] = useState(false);
  const [brokerSaving, setBrokerSaving] = useState(false);
  const [brokerNotice, setBrokerNotice] = useState<string | null>(null);

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

      const testerRaw = window.localStorage.getItem(TESTER_TRACK_STATE_KEY);
      if (testerRaw) {
        const parsed = JSON.parse(testerRaw);
        if (parsed?.gateChecks && typeof parsed.gateChecks === "object") {
          setGateChecks(parsed.gateChecks);
        }
        if (parsed?.missionStates && typeof parsed.missionStates === "object") {
          setMissionStates(parsed.missionStates);
        }
      }

      const brokerRaw = window.localStorage.getItem(BROKER_TRACK_STATE_KEY);
      if (brokerRaw) {
        const parsed = JSON.parse(brokerRaw);
        if (
          parsed?.selectedSessionId &&
          ["S1", "S2", "S3", "S4"].includes(parsed.selectedSessionId)
        ) {
          setSelectedSessionId(parsed.selectedSessionId);
        }
        if (parsed?.brVerdicts && typeof parsed.brVerdicts === "object") {
          setBrVerdicts(parsed.brVerdicts);
        }
        if (parsed?.taskVerdicts && typeof parsed.taskVerdicts === "object") {
          setTaskVerdicts(parsed.taskVerdicts);
        }
        if (parsed?.rubricScores && typeof parsed.rubricScores === "object") {
          setRubricScores(parsed.rubricScores);
        }
        if (Array.isArray(parsed?.brokerDrafts)) {
          setBrokerDrafts(parsed.brokerDrafts);
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

  const persistTesterTrack = useCallback(
    (
      nextGateChecks: Record<string, boolean>,
      nextMissionStates: Record<string, TesterMissionState>
    ) => {
      try {
        window.localStorage.setItem(
          TESTER_TRACK_STATE_KEY,
          JSON.stringify({
            gateChecks: nextGateChecks,
            missionStates: nextMissionStates,
          })
        );
      } catch {
        // ignore storage errors
      }
    },
    []
  );

  const persistBrokerTrack = useCallback(
    (next: {
      selectedSessionId?: "S1" | "S2" | "S3" | "S4";
      brVerdicts?: Record<string, BrokerBrVerdict>;
      taskVerdicts?: Record<string, BrokerTaskVerdict>;
      rubricScores?: Record<string, number>;
      brokerDrafts?: BrokerDraftRequirement[];
    }) => {
      try {
        window.localStorage.setItem(
          BROKER_TRACK_STATE_KEY,
          JSON.stringify({
            selectedSessionId: next.selectedSessionId ?? selectedSessionId,
            brVerdicts: next.brVerdicts ?? brVerdicts,
            taskVerdicts: next.taskVerdicts ?? taskVerdicts,
            rubricScores: next.rubricScores ?? rubricScores,
            brokerDrafts: next.brokerDrafts ?? brokerDrafts,
          })
        );
      } catch {
        // ignore storage errors
      }
    },
    [brVerdicts, brokerDrafts, rubricScores, selectedSessionId, taskVerdicts]
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

  const handleActivatePinAndOpen = (href: string, role?: "tester" | "broker") => {
    try {
      window.localStorage.setItem("credeal-qa-pin-active", "1");
      if (role) {
        window.localStorage.setItem("credeal-qa-pin-role", role);
      }
    } catch {
      // ignore storage errors
    }
    window.open(href, "_blank", "noopener,noreferrer");
  };

  const handleSaveTesterTrack = async () => {
    setTesterSaving(true);
    setTesterNotice(null);
    const serverRecords: Record<string, { status: string; memo: string }> = {};
    for (const m of TESTER_MISSIONS_8) {
      const st = missionStates[m.id];
      serverRecords[m.id] = {
        status:
          st?.status === "pass"
            ? "pass"
            : st?.status === "blocker"
            ? "fail"
            : "pending",
        memo: `SEQ=${st?.seqScore ?? "-"} | ${st?.memo || ""}`.trim(),
      };
    }
    try {
      const res = await fetch("/api/public/qa-workbench", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "submit",
          workbenchId: QA_TESTER_MISSIONS_WORKBENCH_ID,
          sessionId: `${sessionId}-tester`,
          testerName,
          testerOrg,
          overallComment: JSON.stringify({ gateChecks }),
          elapsedSeconds,
          records: serverRecords,
        }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        setTesterNotice("테스터 미션·리허설 검증 기록을 서버에 저장했습니다.");
      } else {
        setTesterNotice("브라우저에 임시 저장되었습니다.");
      }
    } catch {
      setTesterNotice("네트워크 오류로 브라우저에만 임시 저장되었습니다.");
    } finally {
      setTesterSaving(false);
    }
  };

  const handleSaveBrokerTrack = async () => {
    setBrokerSaving(true);
    setBrokerNotice(null);
    const serverRecords: Record<string, { status: string; memo: string }> = {};
    for (const br of BROKER_REQUIREMENTS_REGISTRY) {
      const v = brVerdicts[br.id] || "pending";
      serverRecords[br.id] = {
        status: v === "pass" ? "pass" : v === "fail" ? "fail" : "pending",
        memo: br.title,
      };
    }
    const currentSession =
      BROKER_SESSIONS_4.find((s) => s.id === selectedSessionId) ||
      BROKER_SESSIONS_4[0];
    for (const task of currentSession.tasks) {
      const v = taskVerdicts[task.id] || "pending";
      serverRecords[task.id] = {
        status:
          v === "send_as_is" || v === "minor_edit"
            ? "pass"
            : v === "cannot_send"
            ? "fail"
            : "pending",
        memo: v,
      };
    }
    try {
      const res = await fetch("/api/public/qa-workbench", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "submit",
          workbenchId: QA_BROKER_SESSION_WORKBENCH_ID,
          sessionId: `${sessionId}-${selectedSessionId}`,
          testerName: testerName || "중개인 패널 1인",
          testerOrg,
          overallComment: JSON.stringify({
            sessionId: selectedSessionId,
            rubricScores,
            brokerDrafts,
          }),
          elapsedSeconds,
          records: serverRecords,
        }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        setBrokerNotice(
          `${currentSession.label} 판정·루브릭·요구사항 기록을 서버에 저장했습니다.`
        );
      } else {
        setBrokerNotice("브라우저에 임시 저장되었습니다.");
      }
    } catch {
      setBrokerNotice("네트워크 오류로 브라우저에만 임시 저장되었습니다.");
    } finally {
      setBrokerSaving(false);
    }
  };

  const handleCopyPrereqTemplate = async () => {
    try {
      await navigator.clipboard.writeText(BROKER_PREREQ_REQUEST_TEMPLATE);
      setPrereqCopied(true);
      window.setTimeout(() => setPrereqCopied(false), 3000);
    } catch {
      setPrereqCopied(true);
    }
  };

  const handleAddBrokerDraft = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftWant.trim() || !draftSituation.trim()) {
      setBrokerNotice("상황과 원하는 것을 먼저 적어 주세요.");
      return;
    }
    const nextItem: BrokerDraftRequirement = {
      id: `BR-NEW-${brokerDrafts.length + 1}`,
      situation: draftSituation.trim(),
      want: draftWant.trim(),
      reason: draftReason.trim(),
      example: draftExample.trim(),
      biasTag: draftBiasTag,
      createdAt: new Date().toISOString(),
    };
    const nextDrafts = [nextItem, ...brokerDrafts];
    setBrokerDrafts(nextDrafts);
    persistBrokerTrack({ brokerDrafts: nextDrafts });
    setDraftSituation("");
    setDraftWant("");
    setDraftReason("");
    setDraftExample("");
    setBrokerNotice(`새 요구사항 초안(${nextItem.id})을 추가했습니다.`);
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

  const testerGateStats = useMemo(() => {
    const checkedCount = BROKER_READINESS_GATE_6.filter(
      (g) => Boolean(gateChecks[g.id])
    ).length;
    const blockerCount = TESTER_MISSIONS_8.filter(
      (m) => missionStates[m.id]?.status === "blocker"
    ).length;
    const passCount = TESTER_MISSIONS_8.filter(
      (m) => missionStates[m.id]?.status === "pass"
    ).length;
    const ready =
      checkedCount === BROKER_READINESS_GATE_6.length && blockerCount === 0;
    return {
      checkedCount,
      totalGates: BROKER_READINESS_GATE_6.length,
      blockerCount,
      passCount,
      ready,
    };
  }, [gateChecks, missionStates]);

  const rubricStats = useMemo(() => {
    const values = Object.values(rubricScores).filter(
      (v) => typeof v === "number" && v >= 1 && v <= 5
    );
    if (values.length === 0) return { ratedCount: 0, avgLabel: "미채점" };
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    return {
      ratedCount: values.length,
      avgLabel: `${avg.toFixed(1)} / 5.0`,
    };
  }, [rubricScores]);

  const activeBrokerSession = useMemo(
    () =>
      BROKER_SESSIONS_4.find((s) => s.id === selectedSessionId) ||
      BROKER_SESSIONS_4[0],
    [selectedSessionId]
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200 shadow-2xs">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-1 rounded-lg bg-slate-900 text-white text-[15px] font-extrabold">
                  QA SIGNOFF HUB
                </span>
                <h1 className="text-lg sm:text-xl font-black text-slate-950 break-keep">
                  상용화 20분 고속 검수 · AI-테스터-중개인 협업 허브
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

              <div className="flex flex-wrap items-center gap-2">
                <span
                  data-testid="hub-build-stamp-badge"
                  className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-300 text-[15px] font-bold text-slate-800"
                >
                  {buildBadgeLabel}
                </span>
                <span
                  data-testid="hub-channel-policy-badge"
                  className="px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200 text-[15px] font-bold text-blue-950"
                >
                  {QA_OUTBOUND_CHANNEL_POLICY.summaryLabel}
                </span>
              </div>

              <p className="text-[15px] text-slate-600 break-keep">
                1단계 AI 자동 점검 → 2단계 테스터 실기기 검증·리허설 → 3단계 중개인(화·목) 전문가 판정 순으로 진행합니다.
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
                className="min-h-[48px] px-4 rounded-xl bg-[#007AFF] hover:bg-[#0062CC] disabled:opacity-50 text-white text-[15px] sm:text-base font-extrabold shadow-xs cursor-pointer whitespace-normal sm:whitespace-nowrap transition"
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
                className="min-h-[48px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-[15px] font-extrabold shadow-xs cursor-pointer whitespace-normal sm:whitespace-nowrap transition"
              >
                {seedLoading ? "시드 생성 중…" : "🌱 테스트 고객·구독자 시드"}
              </button>
            </div>
          </div>

          <div
            role="tablist"
            aria-label="검수 역할 트랙 선택"
            data-testid="qa-role-switcher"
            className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1"
          >
            {(
              [
                { id: "fasttrack", label: "⚡ 20분 고속 검수" },
                { id: "tester", label: "🧪 테스터 검증·리허설 (M1~M8)" },
                { id: "broker", label: "👔 중개인 회차 패키지 (화·목)" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTrack === tab.id}
                data-testid={`qa-track-tab-${tab.id}`}
                onClick={() => setActiveTrack(tab.id)}
                className={`min-h-[48px] px-4 py-2 rounded-xl border text-[15px] sm:text-base font-extrabold text-center cursor-pointer transition whitespace-normal ${
                  activeTrack === tab.id
                    ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                    : "bg-slate-100 text-slate-900 border-slate-300 hover:bg-slate-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <nav
            aria-label="상세 검수 도구 이동"
            className="flex flex-wrap items-center gap-2 pt-1"
          >
            <Link
              href="/qa-showcase"
              data-testid="open-qa-showcase-btn"
              className="min-h-[44px] inline-flex items-center px-3.5 rounded-xl bg-indigo-700 hover:bg-indigo-800 border border-indigo-700 text-[15px] font-extrabold text-white whitespace-normal sm:whitespace-nowrap"
            >
              🎯 최종 산출물 22종 쇼룸 열기 (/qa-showcase) ↗
            </Link>
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

        {/* TRACK 1: 기존 20분 인간 고속 감수 */}
        {activeTrack === "fasttrack" && (
          <section aria-labelledby="fasttrack-heading" className="space-y-3.5">
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
                        onClick={() => handleActivatePinAndOpen(step.targetHref, "tester")}
                        data-testid={`fasttrack-launch-${step.id}`}
                        className="min-h-[44px] px-3.5 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-[#0040DD] text-[15px] font-extrabold cursor-pointer whitespace-normal sm:whitespace-nowrap shrink-0"
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
        )}

        {/* TRACK 2: 일반 테스터 검증 · 중개인 패키지 리허설 (M1~M8 + Gate 6) */}
        {activeTrack === "tester" && (
          <section
            data-testid="qa-tester-track-panel"
            className="space-y-6"
          >
            {/* 중개인 준비 완료 게이트 6조건 */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base sm:text-lg font-extrabold text-slate-950">
                    중개인 전달 전 · 준비 완료 게이트 (6조건)
                  </h2>
                  <p className="text-[15px] text-slate-600 break-keep">
                    화요일·목요일 세션 24시간 전에 아래 6개 조건을 모두 통과해야 중개인에게 패키지를 전달합니다.
                  </p>
                </div>
                <span
                  data-testid="tester-readiness-gate-badge"
                  className={`px-3 py-1 rounded-full text-[15px] font-extrabold border ${
                    testerGateStats.ready
                      ? "bg-emerald-100 text-emerald-950 border-emerald-300"
                      : "bg-amber-50 text-amber-950 border-amber-300"
                  }`}
                >
                  {testerGateStats.ready
                    ? "🟢 중개인 전달 가능"
                    : `🟡 준비 점검 중 (${testerGateStats.checkedCount}/${testerGateStats.totalGates} · 막힘 ${testerGateStats.blockerCount}건)`}
                </span>
              </div>

              <div className="space-y-2">
                {BROKER_READINESS_GATE_6.map((g) => {
                  const checked = Boolean(gateChecks[g.id]);
                  return (
                    <button
                      key={g.id}
                      type="button"
                      data-testid={`readiness-gate-btn-${g.id}`}
                      onClick={() => {
                        const next = { ...gateChecks, [g.id]: !checked };
                        setGateChecks(next);
                        persistTesterTrack(next, missionStates);
                      }}
                      className={`w-full min-h-[48px] px-4 py-2.5 rounded-xl border text-left text-[15px] font-bold flex flex-wrap items-center justify-between gap-2 cursor-pointer transition whitespace-normal ${
                        checked
                          ? "bg-emerald-50 border-emerald-300 text-emerald-950"
                          : "bg-slate-50 border-slate-300 text-slate-900 hover:bg-slate-100"
                      }`}
                    >
                      <span className="break-keep">
                        {checked ? "✅ " : "⬜ "}
                        [{g.id}] {g.label}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-md bg-white border border-slate-300 text-[15px] font-extrabold text-slate-700 shrink-0">
                        담당: {g.ownerLabel}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 초심자 · 실기기 · 리허설 미션 8종 */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base sm:text-lg font-extrabold text-slate-950">
                  초심자 미션 8종 · 무도움 성공률 & 쉬움 점수(SEQ)
                </h2>
                <span className="text-[15px] font-bold text-slate-700">
                  성공 {testerGateStats.passCount} / {TESTER_MISSIONS_8.length}
                </span>
              </div>

              {TESTER_MISSIONS_8.map((m) => {
                const st: TesterMissionState = missionStates[m.id] || {
                  status: "pending",
                  seqScore: null,
                  memo: "",
                };
                return (
                  <article
                    key={m.id}
                    data-testid={`tester-mission-card-${m.id}`}
                    className={`rounded-2xl border p-5 bg-white shadow-xs space-y-3 ${
                      st.status === "pass"
                        ? "border-emerald-300"
                        : st.status === "blocker"
                        ? "border-rose-400"
                        : "border-slate-200"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2.5 py-0.5 rounded-lg bg-slate-900 text-white text-[15px] font-extrabold">
                            {m.id} · 목표 {m.targetMin}분
                          </span>
                          {m.mandatoryEveryCycle && (
                            <span className="px-2.5 py-0.5 rounded-lg bg-blue-100 text-blue-950 text-[15px] font-extrabold">
                              매 회차 필수
                            </span>
                          )}
                          <h3 className="text-base sm:text-lg font-extrabold text-slate-950 break-keep">
                            {m.title}
                          </h3>
                        </div>
                        <p className="text-[15px] text-slate-700 break-keep">
                          관찰 포인트: {m.observationPoint}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleActivatePinAndOpen(m.targetHref, "tester")}
                        className="min-h-[44px] px-3.5 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-[#0040DD] text-[15px] font-extrabold cursor-pointer whitespace-normal sm:whitespace-nowrap shrink-0"
                      >
                        화면 열기 (?qa=1) ↗
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        data-testid={`tester-mission-pass-${m.id}`}
                        onClick={() => {
                          const next = {
                            ...missionStates,
                            [m.id]: { ...st, status: "pass" as const },
                          };
                          setMissionStates(next);
                          persistTesterTrack(gateChecks, next);
                        }}
                        className={`min-h-[44px] px-4 rounded-xl text-[15px] font-extrabold border cursor-pointer ${
                          st.status === "pass"
                            ? "bg-emerald-600 text-white border-emerald-700"
                            : "bg-white text-slate-900 border-slate-300 hover:bg-emerald-50"
                        }`}
                      >
                        ✓ 도움 없이 성공
                      </button>
                      <button
                        type="button"
                        data-testid={`tester-mission-blocker-${m.id}`}
                        onClick={() => {
                          const next = {
                            ...missionStates,
                            [m.id]: { ...st, status: "blocker" as const },
                          };
                          setMissionStates(next);
                          persistTesterTrack(gateChecks, next);
                        }}
                        className={`min-h-[44px] px-4 rounded-xl text-[15px] font-extrabold border cursor-pointer ${
                          st.status === "blocker"
                            ? "bg-rose-600 text-white border-rose-700"
                            : "bg-white text-slate-900 border-slate-300 hover:bg-rose-50"
                        }`}
                      >
                        ✕ 막힘(Blocker)
                      </button>
                    </div>

                    <div className="space-y-1.5">
                      <p className="text-[15px] font-bold text-slate-800">
                        미션 쉬움 점수 (SEQ: 1 매우 어려움 ~ 7 매우 쉬움)
                      </p>
                      <div className="grid grid-cols-7 gap-1.5 max-w-md">
                        {[1, 2, 3, 4, 5, 6, 7].map((score) => (
                          <button
                            key={score}
                            type="button"
                            data-testid={`tester-mission-seq-${m.id}-${score}`}
                            onClick={() => {
                              const next = {
                                ...missionStates,
                                [m.id]: { ...st, seqScore: score },
                              };
                              setMissionStates(next);
                              persistTesterTrack(gateChecks, next);
                            }}
                            className={`min-h-[44px] rounded-xl text-[15px] font-extrabold border cursor-pointer ${
                              st.seqScore === score
                                ? "bg-slate-900 text-white border-slate-900"
                                : "bg-slate-50 text-slate-800 border-slate-300 hover:bg-slate-100"
                            }`}
                          >
                            {score}
                          </button>
                        ))}
                      </div>
                    </div>

                    <input
                      type="text"
                      aria-label={`${m.id} 관찰 메모`}
                      value={st.memo}
                      onChange={(e) => {
                        const next = {
                          ...missionStates,
                          [m.id]: { ...st, memo: e.target.value },
                        };
                        setMissionStates(next);
                        persistTesterTrack(gateChecks, next);
                      }}
                      placeholder="걸린 시간, 사용한 기기(예: iPhone Safari), 막힌 지점을 적어 주세요"
                      className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3.5 text-base text-slate-900"
                    />
                  </article>
                );
              })}

              {testerNotice && (
                <p
                  role="status"
                  className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 text-[15px] font-bold text-blue-950"
                >
                  {testerNotice}
                </p>
              )}

              <button
                type="button"
                disabled={testerSaving}
                data-testid="save-tester-track-btn"
                onClick={() => void handleSaveTesterTrack()}
                className="w-full min-h-[52px] rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-base font-extrabold cursor-pointer transition"
              >
                {testerSaving
                  ? "저장 중…"
                  : "☁️ 테스터 검증·리허설 기록 서버 저장"}
              </button>
            </div>
          </section>
        )}

        {/* TRACK 3: 중개인 1인 회차 패키지 (화 · 목) */}
        {activeTrack === "broker" && (
          <section
            data-testid="qa-broker-track-panel"
            className="space-y-6"
          >
            {/* 0주차 사전 자료 요청 카드 */}
            <div
              data-testid="broker-prereq-request-card"
              className="rounded-2xl border border-blue-200 bg-blue-50/60 p-5 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base sm:text-lg font-extrabold text-slate-950">
                  📩 0주차 · 중개인 사전 자료 요청 안내문 (화요일 1회차 전 발송)
                </h2>
                <button
                  type="button"
                  data-testid="copy-broker-prereq-btn"
                  onClick={() => void handleCopyPrereqTemplate()}
                  className="min-h-[48px] px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-[15px] font-extrabold cursor-pointer whitespace-nowrap"
                >
                  {prereqCopied
                    ? "✓ 요청문 복사 완료"
                    : "📋 사전 자료 요청문 복사"}
                </button>
              </div>
              <pre className="rounded-xl bg-white border border-blue-200 p-4 text-[15px] leading-relaxed text-slate-900 whitespace-pre-wrap font-sans">
                {BROKER_PREREQ_REQUEST_TEMPLATE}
              </pre>
            </div>

            {/* 화 · 목 회차 선택 */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base sm:text-lg font-extrabold text-slate-950">
                  화·목 회차 패키지 선택
                </h2>
                <span className="text-[15px] font-bold text-slate-600">
                  주 2회 · 테스트 1시간 + 미팅 1시간
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                {BROKER_SESSIONS_4.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    data-testid={`broker-session-tab-${s.id}`}
                    onClick={() => {
                      setSelectedSessionId(s.id);
                      persistBrokerTrack({ selectedSessionId: s.id });
                    }}
                    className={`min-h-[52px] px-3.5 py-2.5 rounded-xl border text-left text-[15px] font-extrabold cursor-pointer transition whitespace-normal ${
                      selectedSessionId === s.id
                        ? "bg-slate-900 text-white border-slate-900"
                        : "bg-slate-50 text-slate-900 border-slate-300 hover:bg-slate-100"
                    }`}
                  >
                    <div>{s.label}</div>
                    <div
                      className={`text-[15px] font-semibold mt-0.5 ${
                        selectedSessionId === s.id
                          ? "text-slate-200"
                          : "text-slate-600"
                      }`}
                    >
                      {s.focusTitle}
                    </div>
                  </button>
                ))}
              </div>

              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 space-y-1">
                <p className="text-[15px] font-extrabold text-slate-900">
                  {activeBrokerSession.label} · {activeBrokerSession.cycleNote}
                </p>
                <p className="text-[15px] text-slate-700 break-keep">
                  핵심 점검: {activeBrokerSession.focusTitle}
                </p>
              </div>
            </div>

            {/* ① 반영 결과 1장 (BR-001 ~ BR-012) */}
            <div
              data-testid="broker-br-summary-card"
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4"
            >
              <div>
                <h2 className="text-base sm:text-lg font-extrabold text-slate-950">
                  ① 반영 결과 1장 · 지난 요구사항 목록 (BR-001~BR-012)
                </h2>
                <p className="text-[15px] text-slate-600 break-keep">
                  기존에 요청하신 사항이 자동 테스트와 1:1로 연결된 상태입니다. 확인 완료 또는 재수정을 표시해 주세요.
                </p>
              </div>

              <div className="space-y-2.5">
                {BROKER_REQUIREMENTS_REGISTRY.map((br) => {
                  const verdict = brVerdicts[br.id] || "pending";
                  return (
                    <div
                      key={br.id}
                      data-testid={`broker-br-row-${br.id}`}
                      className={`rounded-xl border p-4 space-y-2 ${
                        verdict === "pass"
                          ? "bg-emerald-50/70 border-emerald-300"
                          : verdict === "fail"
                          ? "bg-rose-50 border-rose-300"
                          : "bg-slate-50 border-slate-200"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2.5 py-0.5 rounded-lg bg-slate-900 text-white text-[15px] font-extrabold">
                            {br.id}
                          </span>
                          <span className="px-2.5 py-0.5 rounded-lg bg-white border border-slate-300 text-[15px] font-bold text-slate-800">
                            {BROKER_AREA_LABELS[br.area]}
                          </span>
                          <span
                            className={`px-2.5 py-0.5 rounded-lg text-[15px] font-extrabold ${
                              br.biasTag === "취향"
                                ? "bg-purple-100 text-purple-950"
                                : br.biasTag === "확인필요"
                                ? "bg-amber-100 text-amber-950"
                                : "bg-blue-100 text-blue-950"
                            }`}
                          >
                            {br.biasTag}
                          </span>
                          <span className="text-base font-extrabold text-slate-950 break-keep">
                            {br.title}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            data-testid={`broker-br-pass-${br.id}`}
                            onClick={() => {
                              const next = { ...brVerdicts, [br.id]: "pass" as const };
                              setBrVerdicts(next);
                              persistBrokerTrack({ brVerdicts: next });
                            }}
                            className={`min-h-[44px] px-3.5 rounded-xl text-[15px] font-extrabold border cursor-pointer ${
                              verdict === "pass"
                                ? "bg-emerald-600 text-white border-emerald-700"
                                : "bg-white text-slate-900 border-slate-300 hover:bg-emerald-50"
                            }`}
                          >
                            ✓ 확인 완료
                          </button>
                          <button
                            type="button"
                            data-testid={`broker-br-fail-${br.id}`}
                            onClick={() => {
                              const next = { ...brVerdicts, [br.id]: "fail" as const };
                              setBrVerdicts(next);
                              persistBrokerTrack({ brVerdicts: next });
                            }}
                            className={`min-h-[44px] px-3.5 rounded-xl text-[15px] font-extrabold border cursor-pointer ${
                              verdict === "fail"
                                ? "bg-rose-600 text-white border-rose-700"
                                : "bg-white text-slate-900 border-slate-300 hover:bg-rose-50"
                            }`}
                          >
                            ✕ 재수정 필요
                          </button>
                        </div>
                      </div>

                      <p className="text-[15px] text-slate-800 break-keep">
                        합격 기준: {br.acceptanceCriteria}
                      </p>
                      {br.defaultPolicyNote && (
                        <p className="text-[15px] font-semibold text-purple-900 break-keep">
                          기본값 정책: {br.defaultPolicyNote}
                        </p>
                      )}
                      <p className="text-[15px] text-slate-600 break-all">
                        연결 테스트: {br.linkedTestFiles.join(", ")}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ② 전문가 판단 과제 & 닫힌 판정 질문지 */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
              <h2 className="text-base sm:text-lg font-extrabold text-slate-950">
                ② {activeBrokerSession.label} · 전문가 판단 과제 & 미팅 안건
              </h2>

              <div className="space-y-3">
                {activeBrokerSession.tasks.map((task) => {
                  const tv = taskVerdicts[task.id] || "pending";
                  return (
                    <div
                      key={task.id}
                      data-testid={`broker-task-card-${task.id}`}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="space-y-1">
                          <h3 className="text-base font-extrabold text-slate-950 break-keep">
                            [{task.id}] {task.title}
                          </h3>
                          <p className="text-[15px] text-slate-800 break-keep">
                            {task.promptQuestion}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            handleActivatePinAndOpen(task.targetHref, "broker")
                          }
                          className="min-h-[44px] px-3.5 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-[#0040DD] text-[15px] font-extrabold cursor-pointer whitespace-normal sm:whitespace-nowrap"
                        >
                          화면 열기(빨간펜 ?qa=1) ↗
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {(
                          [
                            { id: "send_as_is", label: "✅ 이대로 고객 발송 가능" },
                            { id: "minor_edit", label: "✏️ 조금 고치면 발송 가능" },
                            { id: "cannot_send", label: "❌ 수정 전 발송 불가" },
                          ] as const
                        ).map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            data-testid={`broker-task-verdict-${task.id}-${opt.id}`}
                            onClick={() => {
                              const next = { ...taskVerdicts, [task.id]: opt.id };
                              setTaskVerdicts(next);
                              persistBrokerTrack({ taskVerdicts: next });
                            }}
                            className={`min-h-[44px] px-3 rounded-xl border text-[15px] font-bold cursor-pointer whitespace-normal ${
                              tv === opt.id
                                ? "bg-slate-900 text-white border-slate-900"
                                : "bg-white text-slate-900 border-slate-300 hover:bg-slate-100"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 space-y-1.5">
                <p className="text-[15px] font-extrabold text-blue-950">
                  이번 회차 1시간 요구사항 미팅 안건
                </p>
                <ul className="list-disc pl-6 space-y-1 text-[15px] text-slate-900">
                  {activeBrokerSession.agendaItems.map((ag, idx) => (
                    <li key={idx} className="break-keep">
                      {ag}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* ③ 6항목 루브릭 채점표 */}
            <div
              data-testid="broker-rubric-card"
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base sm:text-lg font-extrabold text-slate-950">
                  ③ 전문가 6항목 루브릭 평가 (1점~5점)
                </h2>
                <span
                  data-testid="broker-rubric-avg-badge"
                  className="px-3 py-1 rounded-full bg-slate-900 text-white text-[15px] font-extrabold"
                >
                  평균: {rubricStats.avgLabel} ({rubricStats.ratedCount}/6 채점)
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {BROKER_RUBRIC_6.map((item) => {
                  const val = rubricScores[item.id] || 0;
                  return (
                    <div
                      key={item.id}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-base font-extrabold text-slate-950">
                          {item.label}
                        </span>
                        <span className="text-[15px] text-slate-600">
                          {item.lowAnchor} ↔ {item.highAnchor}
                        </span>
                      </div>
                      <div className="grid grid-cols-5 gap-1.5">
                        {[1, 2, 3, 4, 5].map((num) => (
                          <button
                            key={num}
                            type="button"
                            data-testid={`broker-rubric-${item.id}-${num}`}
                            onClick={() => {
                              const next = { ...rubricScores, [item.id]: num };
                              setRubricScores(next);
                              persistBrokerTrack({ rubricScores: next });
                            }}
                            className={`min-h-[44px] rounded-xl border text-[15px] font-extrabold cursor-pointer ${
                              val === num
                                ? "bg-[#007AFF] text-white border-[#005FCC]"
                                : "bg-white text-slate-900 border-slate-300 hover:bg-slate-100"
                            }`}
                          >
                            {num}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ④ 1시간 미팅 새 요구사항 4칸 입력기 */}
            <form
              onSubmit={handleAddBrokerDraft}
              data-testid="broker-new-br-form"
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4"
            >
              <h2 className="text-base sm:text-lg font-extrabold text-slate-950">
                ④ 요구사항 미팅 4칸 기록기 (당일 BR 목록으로 등록)
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="br-draft-situation"
                    className="block text-[15px] font-bold text-slate-800 mb-1"
                  >
                    1) 어떤 상황에서
                  </label>
                  <input
                    id="br-draft-situation"
                    type="text"
                    value={draftSituation}
                    onChange={(e) => setDraftSituation(e.target.value)}
                    placeholder="예: 월간 뉴스레터를 카톡으로 보낼 때"
                    className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3.5 text-base text-slate-900"
                  />
                </div>
                <div>
                  <label
                    htmlFor="br-draft-want"
                    className="block text-[15px] font-bold text-slate-800 mb-1"
                  >
                    2) 무엇을 원하는지
                  </label>
                  <input
                    id="br-draft-want"
                    type="text"
                    value={draftWant}
                    onChange={(e) => setDraftWant(e.target.value)}
                    placeholder="예: 제목에 내 이름이 자동으로 들어갔으면"
                    className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3.5 text-base text-slate-900"
                  />
                </div>
                <div>
                  <label
                    htmlFor="br-draft-reason"
                    className="block text-[15px] font-bold text-slate-800 mb-1"
                  >
                    3) 왜 필요한지
                  </label>
                  <input
                    id="br-draft-reason"
                    type="text"
                    value={draftReason}
                    onChange={(e) => setDraftReason(e.target.value)}
                    placeholder="예: 고객이 누가 보낸 자료인지 바로 알아봐야 해서"
                    className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3.5 text-base text-slate-900"
                  />
                </div>
                <div>
                  <label
                    htmlFor="br-draft-example"
                    className="block text-[15px] font-bold text-slate-800 mb-1"
                  >
                    4) 실제 문구·화면 예시
                  </label>
                  <input
                    id="br-draft-example"
                    type="text"
                    value={draftExample}
                    onChange={(e) => setDraftExample(e.target.value)}
                    placeholder="예: [홍길동 중개인] 11월 강남 빌딩 시장 리포트"
                    className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3.5 text-base text-slate-900"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[15px] font-bold text-slate-800">
                    분류 태그:
                  </span>
                  {(["공통", "취향", "확인필요"] as const).map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setDraftBiasTag(tag)}
                      className={`min-h-[44px] px-3.5 rounded-xl border text-[15px] font-bold cursor-pointer ${
                        draftBiasTag === tag
                          ? "bg-slate-900 text-white border-slate-900"
                          : "bg-slate-50 text-slate-800 border-slate-300"
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>

                <button
                  type="submit"
                  data-testid="add-broker-br-draft-btn"
                  className="min-h-[44px] px-4 rounded-xl bg-[#007AFF] hover:bg-[#0062CC] text-white text-[15px] font-extrabold cursor-pointer"
                >
                  + 새 요구사항 초안 추가
                </button>
              </div>

              {brokerDrafts.length > 0 && (
                <div className="space-y-2 pt-2">
                  {brokerDrafts.map((d) => (
                    <div
                      key={d.id}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[15px] space-y-1"
                    >
                      <div className="flex flex-wrap items-center gap-2 font-extrabold text-slate-900">
                        <span>{d.id}</span>
                        <span className="px-2 py-0.5 rounded-md bg-white border border-slate-300">
                          {d.biasTag}
                        </span>
                        <span>{d.want}</span>
                      </div>
                      <p className="text-slate-700 break-keep">
                        상황: {d.situation} {d.reason ? `· 이유: ${d.reason}` : ""}{" "}
                        {d.example ? `· 예시: ${d.example}` : ""}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </form>

            {brokerNotice && (
              <p
                role="status"
                className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 text-[15px] font-bold text-blue-950"
              >
                {brokerNotice}
              </p>
            )}

            <button
              type="button"
              disabled={brokerSaving}
              data-testid="save-broker-track-btn"
              onClick={() => void handleSaveBrokerTrack()}
              className="w-full min-h-[52px] rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-base font-extrabold cursor-pointer transition"
            >
              {brokerSaving
                ? "저장 중…"
                : `☁️ ${activeBrokerSession.label} 판정·미팅 기록 서버 저장`}
            </button>
          </section>
        )}

        {/* 3. 현장 검수 핀 수집함 (전체 트랙 공용) */}
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
                작업실 및 공개 산출물(?qa=1)에서 등록한 오류·빨간펜 교정·스크린샷이 빌드 번호와 함께 모입니다.
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
              아직 등록된 현장 핀이 없습니다. 작업실이나 공개 링크에 (?qa=1)을 붙여 왼쪽 아래 📌 핀 버튼을 눌러 보세요.
            </p>
          ) : (
            <div className="space-y-2.5">
              {pins.map((pin) => (
                <div
                  key={pin.id}
                  data-testid={`qa-pin-row-${pin.id}`}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-2"
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
                      <span className="px-2 py-0.5 rounded-md bg-white border border-slate-300 text-[15px] font-bold text-slate-800">
                        {pin.authorRole === "broker" ? "👔 중개인" : "🧪 테스터"}
                      </span>
                      {pin.pinMode === "redpen" && (
                        <span className="px-2 py-0.5 rounded-md bg-rose-50 border border-rose-200 text-[15px] font-extrabold text-rose-900">
                          ✏️ 빨간펜
                        </span>
                      )}
                      {pin.buildSha && (
                        <span className="px-2 py-0.5 rounded-md bg-slate-900 text-white text-[15px] font-bold">
                          #{pin.buildSha}
                        </span>
                      )}
                      <span className="text-[15px] font-bold text-slate-900">
                        {pin.workspace} · {pin.targetLabel}
                      </span>
                      <span className="text-[15px] text-slate-500">
                        {pin.targetSelector}
                      </span>
                    </div>
                    <span className="text-[15px] text-slate-600">
                      {parseCompactDeviceLabel(pin.userAgent)}
                      {pin.viewport
                        ? ` · ${pin.viewport.width}×${pin.viewport.height}`
                        : ""}
                      {pin.fontScale ? ` · 글자:${pin.fontScale}` : ""}
                    </span>
                  </div>

                  {pin.pinMode === "redpen" &&
                    (pin.originalText || pin.suggestedText) && (
                      <div className="rounded-lg border border-rose-200 bg-rose-50/70 p-2.5 text-[15px] space-y-1">
                        {pin.originalText && (
                          <p className="text-slate-700 line-through break-keep">
                            원래: {pin.originalText}
                          </p>
                        )}
                        {pin.suggestedText && (
                          <p className="font-extrabold text-rose-950 break-keep">
                            교정: {pin.suggestedText}
                          </p>
                        )}
                      </div>
                    )}

                  <p className="text-base font-semibold text-slate-900 break-keep">
                    {pin.note}
                  </p>

                  {pin.screenshotDataUrl && (
                    <details className="rounded-lg border border-slate-200 bg-white p-2">
                      <summary className="text-[15px] font-bold text-slate-800 cursor-pointer py-1">
                        📷 첨부 스크린샷 보기
                      </summary>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={pin.screenshotDataUrl}
                        alt={`${pin.targetLabel} 현장 캡처`}
                        className="mt-2 max-h-64 rounded-lg border border-slate-200 object-contain"
                      />
                    </details>
                  )}
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
