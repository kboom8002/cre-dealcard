"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  WORKBENCH_TRACKS,
  MECE_6_DIMENSIONS,
  TEST_PHOTO_7_PACK,
  CLICK_THROUGH_STEPS,
  SEVERITY_RUBRIC,
  type TrackId,
  type CheckVerdict,
  type DefectSeverity,
  type MeceCheckStep,
  type TestPhotoSlot,
} from "@/lib/testguide/dealcard-im-mece-guide-data";

type ExecTrackId = Exclude<TrackId, "overview" | "signoff">;

interface TrackRuntimeMetrics {
  seconds: number;
  hesitations: number;
  misclicks: number;
}

interface DefectRecord {
  id: string;
  stepId: string;
  trackLabel: string;
  severity: DefectSeverity;
  note: string;
  updatedAt: string;
}

const STORAGE_KEY = "credeal-dealcard-im-mece-workbench-v1";
const WORKBENCH_ID = "dealcard-im-v1";

function createDcImSessionId(): string {
  return `dcim-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

const INITIAL_TRACK_METRICS: Record<ExecTrackId, TrackRuntimeMetrics> = {
  track1: { seconds: 0, hesitations: 0, misclicks: 0 },
  track2: { seconds: 0, hesitations: 0, misclicks: 0 },
  track3: { seconds: 0, hesitations: 0, misclicks: 0 },
  track4: { seconds: 0, hesitations: 0, misclicks: 0 },
  track5: { seconds: 0, hesitations: 0, misclicks: 0 },
};

function formatClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function extractDealIdFromInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const dcMatch = trimmed.match(/\/(?:dc|d)\/([^/?#\s]+)/i);
  if (dcMatch?.[1]) return decodeURIComponent(dcMatch[1]);
  const bldMatch = trimmed.match(/[?&](?:buildingId|id)=([^&#\s]+)/i);
  if (bldMatch?.[1]) return decodeURIComponent(bldMatch[1]);
  if (!trimmed.includes("/") && trimmed.length >= 4) return trimmed;
  return "";
}

function normalizePublicImUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const u = new URL(trimmed);
      if (u.pathname.startsWith("/im-lite/")) {
        return `${u.pathname}${u.search}`;
      }
    } catch {
      return "";
    }
  }
  if (trimmed.startsWith("/im-lite/")) return trimmed;
  if (/^[0-9a-f-]{20,}$/i.test(trimmed)) return `/im-lite/${trimmed}`;
  return "";
}

export default function DealCardImMeceTestPage() {
  const [activeTrack, setActiveTrack] = useState<TrackId>("overview");
  const [viewMode, setViewMode] = useState<"focus" | "all">("focus");
  const [largeFont, setLargeFont] = useState<boolean>(false);
  const [focusedStepId, setFocusedStepId] = useState<string>(
    CLICK_THROUGH_STEPS[0]?.id || "T1-01"
  );

  const [testerName, setTesterName] = useState<string>("현업 중개사 · QA 검수자");
  const [verdicts, setVerdicts] = useState<Record<string, CheckVerdict>>({});
  const [defects, setDefects] = useState<Record<string, DefectRecord>>({});
  const [customDefects, setCustomDefects] = useState<DefectRecord[]>([]);
  const [trackMetrics, setTrackMetrics] =
    useState<Record<ExecTrackId, TrackRuntimeMetrics>>(INITIAL_TRACK_METRICS);

  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);
  const [activeTimerTrack, setActiveTimerTrack] = useState<ExecTrackId>("track1");
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Live URL inspector states (Track 1 /dc/[id] & Track 4 /im-lite/[id])
  const [dcInspectInput, setDcInspectInput] = useState<string>("");
  const [imInspectInput, setImInspectInput] = useState<string>("");
  const [showEmbeddedImFrame, setShowEmbeddedImFrame] = useState<boolean>(false);
  const hydratedRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(true);

  const [sessionId, setSessionId] = useState<string>(() => createDcImSessionId());
  const [overallComment, setOverallComment] = useState<string>("");
  const [serverSyncStatus, setServerSyncStatus] = useState<
    "idle" | "syncing" | "synced" | "submitted" | "error"
  >("idle");
  const [lastServerSyncedAt, setLastServerSyncedAt] = useState<string | null>(null);
  const [probeLoading, setProbeLoading] = useState<boolean>(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [probeResult, setProbeResult] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Hydrate persisted state asynchronously after client mount
  useEffect(() => {
    const rafId = window.requestAnimationFrame(() => {
      let localSessionId = "";
      let hasLocalVerdicts = false;
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (typeof parsed.testerName === "string") setTesterName(parsed.testerName);
          if (typeof parsed.largeFont === "boolean") setLargeFont(parsed.largeFont);
          if (parsed.viewMode === "focus" || parsed.viewMode === "all") {
            setViewMode(parsed.viewMode);
          }
          if (parsed.verdicts && typeof parsed.verdicts === "object") {
            setVerdicts(parsed.verdicts);
            hasLocalVerdicts = Object.keys(parsed.verdicts).length > 0;
          }
          if (parsed.defects && typeof parsed.defects === "object") {
            setDefects(parsed.defects);
          }
          if (Array.isArray(parsed.customDefects)) {
            setCustomDefects(parsed.customDefects);
          }
          if (parsed.trackMetrics && typeof parsed.trackMetrics === "object") {
            setTrackMetrics((prev) => ({ ...prev, ...parsed.trackMetrics }));
          }
          if (typeof parsed.dcInspectInput === "string") {
            setDcInspectInput(parsed.dcInspectInput);
          }
          if (typeof parsed.imInspectInput === "string") {
            setImInspectInput(parsed.imInspectInput);
          }
          if (typeof parsed.sessionId === "string" && parsed.sessionId.trim()) {
            localSessionId = parsed.sessionId.trim();
            setSessionId(localSessionId);
          }
          if (typeof parsed.overallComment === "string") {
            setOverallComment(parsed.overallComment);
          }
        }
      } catch {
        // ignore storage errors
      } finally {
        hydratedRef.current = true;
      }

      const urlSession =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("session")?.trim() || ""
          : "";
      const lookupSessionId = urlSession || localSessionId;
      if (!hasLocalVerdicts && lookupSessionId && typeof fetch === "function") {
        try {
          const p = fetch(
            `/api/public/qa-workbench?workbenchId=${encodeURIComponent(
              WORKBENCH_ID
            )}&sessionId=${encodeURIComponent(lookupSessionId)}`,
            { cache: "no-store" }
          );
          if (p && typeof p.then === "function") {
            p.then((r) => (r.ok ? r.json() : null))
              .then((payload) => {
                if (!isMountedRef.current || !payload?.ok || !payload?.session) return;
                const srv = payload.session;
                if (typeof srv.sessionId === "string" && srv.sessionId) {
                  setSessionId(srv.sessionId);
                }
                if (typeof srv.testerName === "string" && srv.testerName) {
                  setTesterName(srv.testerName);
                }
                if (typeof srv.overallComment === "string") {
                  setOverallComment(srv.overallComment);
                }
                if (srv.scratchLinks && typeof srv.scratchLinks === "object") {
                  if (typeof srv.scratchLinks.dcInspectInput === "string") {
                    setDcInspectInput(srv.scratchLinks.dcInspectInput);
                  }
                  if (typeof srv.scratchLinks.imInspectInput === "string") {
                    setImInspectInput(srv.scratchLinks.imInspectInput);
                  }
                }
                if (srv.records && typeof srv.records === "object") {
                  const recoveredVerdicts: Record<string, CheckVerdict> = {};
                  const recoveredDefects: Record<string, DefectRecord> = {};
                  for (const [stepId, rec] of Object.entries(
                    srv.records as Record<string, { status?: string; note?: string; overrideSeverity?: DefectSeverity }>
                  )) {
                    if (rec?.status === "PASS" || rec?.status === "FAIL" || rec?.status === "PENDING") {
                      recoveredVerdicts[stepId] = rec.status;
                    }
                    if (rec?.status === "FAIL") {
                      const stepMeta = CLICK_THROUGH_STEPS.find((s) => s.id === stepId);
                      recoveredDefects[stepId] = {
                        id: `def-${stepId}`,
                        stepId: stepMeta?.stepNo || stepId,
                        trackLabel: stepMeta?.title || stepId,
                        severity: rec.overrideSeverity || stepMeta?.defaultSeverityIfFail || "S1",
                        note: rec.note || "",
                        updatedAt: "-",
                      };
                    }
                  }
                  if (Object.keys(recoveredVerdicts).length > 0) {
                    setVerdicts(recoveredVerdicts);
                  }
                  if (Object.keys(recoveredDefects).length > 0) {
                    setDefects(recoveredDefects);
                  }
                }
                setServerSyncStatus(srv.mode === "submit" ? "submitted" : "synced");
                if (typeof srv.syncedAt === "string") {
                  setLastServerSyncedAt(srv.syncedAt);
                }
              })
              .catch(() => {});
          }
        } catch {
          // ignore offline/JSDOM errors
        }
      }
    });
    return () => window.cancelAnimationFrame(rafId);
  }, []);

  // Persist state
  useEffect(() => {
    if (!hydratedRef.current) return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          sessionId,
          overallComment,
          testerName,
          largeFont,
          viewMode,
          verdicts,
          defects,
          customDefects,
          trackMetrics,
          dcInspectInput,
          imInspectInput,
        })
      );
    } catch {
      // ignore storage errors
    }
  }, [
    sessionId,
    overallComment,
    testerName,
    largeFont,
    viewMode,
    verdicts,
    defects,
    customDefects,
    trackMetrics,
    dcInspectInput,
    imInspectInput,
  ]);

  const handleSelectTrack = useCallback(
    (nextTrack: TrackId, explicitStepId?: string, nextVerdictsSnapshot?: Record<string, CheckVerdict>) => {
      setActiveTrack(nextTrack);
      if (
        nextTrack === "track1" ||
        nextTrack === "track2" ||
        nextTrack === "track3" ||
        nextTrack === "track4" ||
        nextTrack === "track5"
      ) {
        setActiveTimerTrack(nextTrack);
        if (explicitStepId) {
          setFocusedStepId(explicitStepId);
        } else {
          const stepsInTrack = CLICK_THROUGH_STEPS.filter((s) => s.trackId === nextTrack);
          if (stepsInTrack.length > 0 && !stepsInTrack.some((s) => s.id === focusedStepId)) {
            const vMap = nextVerdictsSnapshot || verdicts;
            const firstPending =
              stepsInTrack.find((s) => (vMap[s.id] || "PENDING") === "PENDING") ||
              stepsInTrack[0];
            setFocusedStepId(firstPending.id);
          }
        }
      }
    },
    [focusedStepId, verdicts]
  );

  // Stopwatch ticker
  useEffect(() => {
    if (!isTimerRunning) return;
    const id = window.setInterval(() => {
      setTrackMetrics((prev) => ({
        ...prev,
        [activeTimerTrack]: {
          ...prev[activeTimerTrack],
          seconds: prev[activeTimerTrack].seconds + 1,
        },
      }));
    }, 1000);
    return () => window.clearInterval(id);
  }, [isTimerRunning, activeTimerTrack]);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    window.setTimeout(() => {
      setToastMsg((cur) => (cur === msg ? null : cur));
    }, 2600);
  }, []);

  const handleCopyText = useCallback(
    async (text: string, label: string, id: string) => {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopiedId(id);
      showToast(`복사 완료: ${label} (Ctrl+V로 바로 붙여넣으세요)`);
      window.setTimeout(() => {
        setCopiedId((cur) => (cur === id ? null : cur));
      }, 1800);
    },
    [showToast]
  );

  const handleDownloadFile = useCallback(
    async (url: string, filename: string, silent = false) => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
        if (!silent) {
          showToast(`다운로드 완료: ${filename}`);
        }
      } catch {
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    },
    [showToast]
  );

  const handleDownloadPhotoPack = useCallback(
    async (count: 6 | 7) => {
      const targetPhotos = TEST_PHOTO_7_PACK.slice(0, count);
      showToast(
        `사진 ${count}장(${count === 7 ? "가로5 + 세로2" : "3×2 그리드용 6장"}) 연속 다운로드를 시작합니다...`
      );
      for (let i = 0; i < targetPhotos.length; i++) {
        await handleDownloadFile(
          targetPhotos[i].downloadUrl,
          targetPhotos[i].filename,
          true
        );
        await new Promise((r) => window.setTimeout(r, 260));
      }
      showToast(`사진 ${count}장 다운로드가 완료되었습니다! 탭 ④ 사진 영역에 끌어다 놓으세요.`);
    },
    [handleDownloadFile, showToast]
  );

  const setStepVerdict = useCallback(
    (step: MeceCheckStep, nextVerdict: CheckVerdict, autoAdvance = false) => {
      setVerdicts((prev) => ({ ...prev, [step.id]: nextVerdict }));

      if (nextVerdict === "FAIL") {
        setDefects((prev) => {
          if (prev[step.id]) return prev;
          return {
            ...prev,
            [step.id]: {
              id: `def-${step.id}`,
              stepId: step.stepNo,
              trackLabel: step.title,
              severity: step.defaultSeverityIfFail,
              note: "",
              updatedAt: new Date().toLocaleTimeString("ko-KR", {
                hour: "2-digit",
                minute: "2-digit",
              }),
            },
          };
        });
      }

      if (autoAdvance && nextVerdict === "PASS") {
        const globalIdx = CLICK_THROUGH_STEPS.findIndex((s) => s.id === step.id);
        const nextStep = CLICK_THROUGH_STEPS[globalIdx + 1];
        if (nextStep) {
          handleSelectTrack(nextStep.trackId, nextStep.id);
          window.scrollTo({ top: 0, behavior: "smooth" });
        } else {
          handleSelectTrack("signoff");
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      }
    },
    [handleSelectTrack]
  );

  const updateStepDefect = useCallback(
    (stepId: string, patch: Partial<Pick<DefectRecord, "severity" | "note">>) => {
      setDefects((prev) => {
        const existing = prev[stepId];
        if (!existing) return prev;
        return {
          ...prev,
          [stepId]: {
            ...existing,
            ...patch,
            updatedAt: new Date().toLocaleTimeString("ko-KR", {
              hour: "2-digit",
              minute: "2-digit",
            }),
          },
        };
      });
    },
    []
  );

  // Computed summary stats
  const stats = useMemo(() => {
    const total = CLICK_THROUGH_STEPS.length;
    let pass = 0;
    let fail = 0;
    for (const s of CLICK_THROUGH_STEPS) {
      const v = verdicts[s.id] || "PENDING";
      if (v === "PASS") pass++;
      else if (v === "FAIL") fail++;
    }
    const pending = total - pass - fail;
    const pct = Math.round(((pass + fail) / total) * 100);

    const activeStepDefects = CLICK_THROUGH_STEPS.filter(
      (s) => verdicts[s.id] === "FAIL"
    ).map(
      (s) =>
        defects[s.id] || {
          id: `def-${s.id}`,
          stepId: s.stepNo,
          trackLabel: s.title,
          severity: s.defaultSeverityIfFail,
          note: "",
          updatedAt: "-",
        }
    );

    const allDefects = [...activeStepDefects, ...customDefects];
    const s0Count = allDefects.filter((d) => d.severity === "S0").length;
    const s1Count = allDefects.filter((d) => d.severity === "S1").length;
    const s2Count = allDefects.filter((d) => d.severity === "S2").length;
    const s3Count = allDefects.filter((d) => d.severity === "S3").length;

    const totalSeconds = Object.values(trackMetrics).reduce(
      (acc, m) => acc + m.seconds,
      0
    );
    const totalHesitations = Object.values(trackMetrics).reduce(
      (acc, m) => acc + m.hesitations,
      0
    );
    const totalMisclicks = Object.values(trackMetrics).reduce(
      (acc, m) => acc + m.misclicks,
      0
    );

    let gateStatus: "GO" | "NOGO" | "IN_PROGRESS" = "IN_PROGRESS";
    if (s0Count > 0 || s1Count > 0) {
      gateStatus = "NOGO";
    } else if (pass === total) {
      gateStatus = "GO";
    }

    return {
      total,
      pass,
      fail,
      pending,
      pct,
      allDefects,
      s0Count,
      s1Count,
      s2Count,
      s3Count,
      totalSeconds,
      totalHesitations,
      totalMisclicks,
      gateStatus,
    };
  }, [verdicts, defects, customDefects, trackMetrics]);

  const recordsPayload = useMemo(() => {
    const out: Record<
      string,
      { status: CheckVerdict; note: string; overrideSeverity?: DefectSeverity }
    > = {};
    for (const step of CLICK_THROUGH_STEPS) {
      const status = verdicts[step.id];
      const def = defects[step.id];
      if (!status && !def) continue;
      out[step.id] = {
        status: status || "PENDING",
        note: def?.note || "",
        overrideSeverity: def?.severity,
      };
    }
    return out;
  }, [verdicts, defects]);

  const totalSecondsRef = useRef<number>(stats.totalSeconds);
  totalSecondsRef.current = stats.totalSeconds;

  const syncToServer = useCallback(
    async (mode: "sync" | "submit") => {
      if (typeof fetch !== "function") {
        if (mode === "submit") {
          showToast("⚠️ 현재 환경에서는 로컬 저장 모드로 동작합니다.");
        }
        return;
      }
      setServerSyncStatus("syncing");
      try {
        const res = await fetch("/api/public/qa-workbench", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode,
            workbenchId: WORKBENCH_ID,
            sessionId,
            testerName,
            elapsedSeconds: totalSecondsRef.current,
            overallComment,
            scratchLinks: {
              dcInspectInput,
              imInspectInput,
            },
            records: recordsPayload,
          }),
        });
        if (!isMountedRef.current) return;
        if (res && res.ok) {
          const data = await res.json().catch(() => null);
          setServerSyncStatus(mode === "submit" ? "submitted" : "synced");
          setLastServerSyncedAt(
            typeof data?.syncedAt === "string"
              ? data.syncedAt
              : new Date().toISOString()
          );
          if (mode === "submit") {
            showToast("☁️ QA 검수 결과가 서버에 최종 제출·저장되었습니다.");
          }
        } else {
          setServerSyncStatus("error");
          if (mode === "submit") {
            showToast("⚠️ 서버 저장 중 오류가 발생했습니다. JSON 파일로도 백업해 주세요.");
          }
        }
      } catch {
        if (!isMountedRef.current) return;
        setServerSyncStatus("error");
        if (mode === "submit") {
          showToast("⚠️ 네트워크 오류로 서버 제출에 실패했습니다.");
        }
      }
    },
    [
      sessionId,
      testerName,
      overallComment,
      dcInspectInput,
      imInspectInput,
      recordsPayload,
      showToast,
    ]
  );

  // Debounced auto-sync (1500ms)
  useEffect(() => {
    if (!hydratedRef.current) return;
    if (
      stats.pass + stats.fail === 0 &&
      overallComment.trim().length === 0 &&
      !dcInspectInput.trim() &&
      !imInspectInput.trim()
    ) {
      return;
    }
    if (typeof fetch !== "function") return;
    const t = window.setTimeout(() => {
      void syncToServer("sync");
    }, 1500);
    return () => window.clearTimeout(t);
  }, [
    stats.pass,
    stats.fail,
    overallComment,
    dcInspectInput,
    imInspectInput,
    recordsPayload,
    syncToServer,
  ]);

  const runLiveProbe = useCallback(async () => {
    if (!dcInspectInput.trim() && !imInspectInput.trim()) {
      showToast("검증할 /dc/... 또는 /im-lite/... 링크를 먼저 입력해 주세요.");
      return;
    }
    if (typeof fetch !== "function") return;
    setProbeLoading(true);
    try {
      const res = await fetch("/api/public/qa-workbench", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "probe",
          dealCardUrl: dcInspectInput.trim() || undefined,
          imShareUrl: imInspectInput.trim() || undefined,
        }),
      });
      if (!isMountedRef.current) return;
      const data = res ? await res.json().catch(() => null) : null;
      if (res && res.ok && data) {
        setProbeResult(data);
        showToast("⚡ 서버 실데이터 검증 결과를 업데이트했습니다.");
      } else {
        showToast("⚠️ 실데이터 검증 조회에 실패했습니다.");
      }
    } catch {
      if (isMountedRef.current) {
        showToast("⚠️ 서버 실데이터 검증 중 네트워크 오류가 발생했습니다.");
      }
    } finally {
      if (isMountedRef.current) setProbeLoading(false);
    }
  }, [dcInspectInput, imInspectInput, showToast]);

  const buildMarkdownReport = useCallback(() => {
    const lines: string[] = [
      `# 딜카드 · IM 상용화 인간 테스터 MECE 검수 리포트`,
      `- 검수자: ${testerName}`,
      `- 일시: ${new Date().toLocaleString("ko-KR")}`,
      `- 최종 판정: **${
        stats.gateStatus === "GO"
          ? "GO (출시 승인)"
          : stats.gateStatus === "NOGO"
          ? "NO-GO (S0/S1 수정 필요)"
          : "점검 진행 중"
      }**`,
      `- 진행 현황: 총 ${stats.total}항목 중 PASS ${stats.pass} / FAIL ${stats.fail} / 미점검 ${stats.pending}`,
      `- 누적 소요 시간: ${formatClock(stats.totalSeconds)} (망설임 ${stats.totalHesitations}회 · 오클릭 ${stats.totalMisclicks}회)`,
      ``,
      `## 1. 트랙별 점검 결과`,
    ];

    for (const tr of ["track1", "track2", "track3", "track4", "track5"] as ExecTrackId[]) {
      const meta = WORKBENCH_TRACKS.find((t) => t.id === tr);
      const tSteps = CLICK_THROUGH_STEPS.filter((s) => s.trackId === tr);
      const m = trackMetrics[tr];
      lines.push(
        `### ${meta?.title} (${formatClock(m.seconds)} · 망설임 ${m.hesitations} · 오클릭 ${m.misclicks})`
      );
      for (const s of tSteps) {
        const v = verdicts[s.id] || "PENDING";
        const defNote =
          v === "FAIL" && defects[s.id]?.note ? ` — 사유: ${defects[s.id].note}` : "";
        lines.push(`- [${v === "PASS" ? "x" : " "}] **${s.stepNo}** (${v}) ${s.title}${defNote}`);
      }
      lines.push("");
    }

    lines.push(`## 2. 발견 결함 목록 (S0: ${stats.s0Count} / S1: ${stats.s1Count} / S2: ${stats.s2Count} / S3: ${stats.s3Count})`);
    if (stats.allDefects.length === 0) {
      lines.push(`- 등록된 결함 없음`);
    } else {
      for (const d of stats.allDefects) {
        lines.push(`- **[${d.severity}] ${d.stepId}** (${d.trackLabel}): ${d.note || "상세 메모 미입력"}`);
      }
    }
    return lines.join("\n");
  }, [testerName, stats, trackMetrics, verdicts, defects]);

  const handleExportJson = useCallback(() => {
    const payload = {
      exportedAt: new Date().toISOString(),
      testerName,
      gateStatus: stats.gateStatus,
      summary: {
        total: stats.total,
        pass: stats.pass,
        fail: stats.fail,
        pending: stats.pending,
        s0Count: stats.s0Count,
        s1Count: stats.s1Count,
        totalSeconds: stats.totalSeconds,
        totalHesitations: stats.totalHesitations,
        totalMisclicks: stats.totalMisclicks,
      },
      trackMetrics,
      verdicts,
      defects: stats.allDefects,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `credeal_dealcard_im_qa_report_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    showToast("JSON 검수 리포트가 저장되었습니다.");
  }, [testerName, stats, trackMetrics, verdicts, showToast]);

  const handleResetAll = useCallback(() => {
    if (!window.confirm("모든 체크 상태와 스톱워치 기록을 초기화하시겠습니까?")) return;
    setIsTimerRunning(false);
    setVerdicts({});
    setDefects({});
    setCustomDefects([]);
    setTrackMetrics(INITIAL_TRACK_METRICS);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    showToast("검수 기록을 초기화했습니다.");
  }, [showToast]);

  const resolvedDealId = extractDealIdFromInput(dcInspectInput);
  const resolvedImPath = normalizePublicImUrl(imInspectInput);

  const currentTrackSteps = useMemo(() => {
    if (
      activeTrack === "track1" ||
      activeTrack === "track2" ||
      activeTrack === "track3" ||
      activeTrack === "track4" ||
      activeTrack === "track5"
    ) {
      return CLICK_THROUGH_STEPS.filter((s) => s.trackId === activeTrack);
    }
    return [];
  }, [activeTrack]);

  const visibleSteps = useMemo(() => {
    if (viewMode === "all") return currentTrackSteps;
    const found = currentTrackSteps.find((s) => s.id === focusedStepId);
    return found ? [found] : currentTrackSteps.slice(0, 1);
  }, [currentTrackSteps, viewMode, focusedStepId]);

  const renderPhotoPackBox = (count: 6 | 7) => {
    const list = TEST_PHOTO_7_PACK.slice(0, count);
    return (
      <div className="rounded-2xl border border-indigo-200 bg-indigo-50/55 p-4 space-y-3 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-extrabold text-slate-900">
              {count === 7
                ? "📸 테스트용 실건물 사진 7장 세트 (가로 5장 + 세로 2장 · JPG/PNG/WebP 혼합)"
                : "📸 테스트용 실건물 사진 6장 세트 (단일 슬라이드 3×2 그리드 검증용)"}
            </p>
            <p className="text-sm text-slate-700 mt-0.5">
              버튼 한 번으로 PC 다운로드 폴더에 저장된 뒤 IM 탭 ④ 사진 영역에 통째로 끌어다 놓으세요.
            </p>
          </div>
          <button
            type="button"
            data-testid={`download-photo-pack-${count}`}
            onClick={() => {
              void handleDownloadPhotoPack(count);
            }}
            className="min-h-[46px] px-4 py-2.5 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white font-extrabold shadow-sm transition cursor-pointer"
          >
            📦 사진 {count}장 일괄 다운로드
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
          {list.map((p: TestPhotoSlot) => (
            <div
              key={p.slot}
              className="rounded-xl bg-white border border-slate-200 p-2 flex flex-col justify-between gap-1.5 shadow-2xs"
            >
              <div className="relative rounded-lg overflow-hidden bg-slate-100 h-20 flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.previewUrl}
                  alt={p.caption}
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
                <span
                  className={`absolute top-1 left-1 px-1.5 py-0.5 rounded text-xs font-extrabold ${
                    p.orientation.startsWith("세로")
                      ? "bg-amber-500 text-slate-950"
                      : "bg-slate-900/80 text-white"
                  }`}
                >
                  {p.orientation.startsWith("세로") ? "세로" : p.format}
                </span>
              </div>
              <p className="text-xs font-bold text-slate-800 truncate" title={p.filename}>
                {p.filename}
              </p>
              <button
                type="button"
                onClick={() => {
                  void handleDownloadFile(p.downloadUrl, p.filename);
                }}
                className="min-h-[32px] text-xs font-bold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 cursor-pointer"
              >
                개별 받기
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderStepCard = (step: MeceCheckStep) => {
    const verdict = verdicts[step.id] || "PENDING";
    const stepDefect = defects[step.id];
    const globalIdx = CLICK_THROUGH_STEPS.findIndex((s) => s.id === step.id);
    const prevStep = globalIdx > 0 ? CLICK_THROUGH_STEPS[globalIdx - 1] : null;
    const nextStep =
      globalIdx < CLICK_THROUGH_STEPS.length - 1
        ? CLICK_THROUGH_STEPS[globalIdx + 1]
        : null;

    return (
      <article
        key={step.id}
        data-testid={`mece-step-card-${step.id}`}
        className={`rounded-3xl bg-white border-2 p-5 sm:p-7 shadow-xs transition-all space-y-5 ${
          verdict === "PASS"
            ? "border-emerald-500/70"
            : verdict === "FAIL"
            ? "border-rose-500/80"
            : "border-slate-200/90"
        }`}
      >
        {/* Top Metadata Header */}
        <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-slate-200">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-3 py-1 rounded-full bg-slate-900 text-white text-xs font-extrabold tracking-wide">
                {step.stepNo}
              </span>
              <span className="px-3 py-1 rounded-full bg-blue-50 text-blue-800 border border-blue-200 text-xs font-bold">
                {step.dimensionTag}
              </span>
              <span
                className={`px-2.5 py-1 rounded-full text-xs font-extrabold border ${
                  step.defaultSeverityIfFail === "S0"
                    ? "bg-rose-50 text-rose-800 border-rose-200"
                    : step.defaultSeverityIfFail === "S1"
                    ? "bg-amber-50 text-amber-900 border-amber-200"
                    : "bg-slate-100 text-slate-700 border-slate-200"
                }`}
              >
                실패 시 {step.defaultSeverityIfFail} 등급
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-950 leading-snug break-keep pt-1">
              {step.title}
            </h2>
            <p className="text-slate-600 leading-relaxed break-keep">
              💡 <strong>점검 의도:</strong> {step.whyItMatters}
            </p>
          </div>

          <span
            className={`px-3.5 py-1.5 rounded-full text-sm font-extrabold shrink-0 border ${
              verdict === "PASS"
                ? "bg-emerald-100 text-emerald-900 border-emerald-300"
                : verdict === "FAIL"
                ? "bg-rose-100 text-rose-900 border-rose-300"
                : "bg-slate-100 text-slate-700 border-slate-300"
            }`}
          >
            {verdict === "PASS"
              ? "✅ 통과 (PASS)"
              : verdict === "FAIL"
              ? "❌ 결함 (FAIL)"
              : "⏳ 점검 대기"}
          </span>
        </div>

        {/* Zone A: Click-Through Action Bar (Deep Links + Copy Presets + File Downloads) */}
        {(step.deepLinks || step.copyPresets || step.downloadPresets) && (
          <div className="rounded-2xl bg-slate-50 border border-slate-200/90 p-4 space-y-3 print:hidden">
            <p className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
              원클릭 실행 도구 (복사 · 다운로드 · 작업공간 열기)
            </p>
            <div className="flex flex-wrap items-center gap-2.5">
              {step.deepLinks?.map((dl) => (
                <a
                  key={dl.id}
                  href={dl.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`min-h-[46px] px-4 py-2.5 rounded-xl font-extrabold text-sm inline-flex items-center gap-2 transition shadow-2xs ${
                    dl.variant === "secondary"
                      ? "bg-white hover:bg-slate-100 text-slate-900 border border-slate-300"
                      : "bg-blue-700 hover:bg-blue-800 text-white"
                  }`}
                >
                  <span>{dl.label}</span>
                  <span aria-hidden="true">↗</span>
                </a>
              ))}

              {step.copyPresets?.map((cp) => {
                const isCopied = copiedId === cp.id;
                return (
                  <button
                    key={cp.id}
                    type="button"
                    data-testid={`copy-preset-${cp.id}`}
                    onClick={() => {
                      void handleCopyText(cp.content, cp.toastLabel, cp.id);
                    }}
                    className={`min-h-[46px] px-4 py-2.5 rounded-xl font-extrabold text-sm inline-flex items-center gap-2 border transition cursor-pointer ${
                      isCopied
                        ? "bg-emerald-600 text-white border-emerald-700"
                        : "bg-white hover:bg-blue-50 text-slate-900 border-slate-300 hover:border-blue-400"
                    }`}
                  >
                    <span>{isCopied ? "✅ 클립보드 복사됨!" : cp.buttonLabel}</span>
                    {cp.badge && !isCopied && (
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-xs font-bold">
                        {cp.badge}
                      </span>
                    )}
                  </button>
                );
              })}

              {step.downloadPresets?.map((dp) => (
                <button
                  key={dp.id}
                  type="button"
                  data-testid={`download-preset-${dp.id}`}
                  onClick={() => {
                    void handleDownloadFile(dp.url, dp.filename);
                  }}
                  className="min-h-[46px] px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-sm inline-flex items-center gap-2 shadow-2xs transition cursor-pointer"
                >
                  <span>{dp.buttonLabel}</span>
                </button>
              ))}
            </div>

            {step.copyPresets && step.copyPresets.length > 0 && (
              <div className="space-y-2 pt-1">
                {step.copyPresets.map((cp) => (
                  <pre
                    key={`${cp.id}-preview`}
                    className="p-3 rounded-xl bg-white border border-slate-200 text-xs sm:text-sm text-slate-800 whitespace-pre-wrap font-mono leading-relaxed overflow-x-auto"
                  >
                    {cp.content}
                  </pre>
                ))}
              </div>
            )}
          </div>
        )}

        {step.enablePhotoPack7 && renderPhotoPackBox(7)}
        {step.enablePhotoPack6 && renderPhotoPackBox(6)}

        {/* Numbered Click-Through Instructions */}
        <div className="space-y-2.5">
          <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wide">
            ① 따라하기 실행 순서 (Click-Through)
          </h3>
          <ol className="space-y-2.5">
            {step.clickSteps.map((instruction, idx) => (
              <li
                key={idx}
                className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-50/85 border border-slate-200/80"
              >
                <span className="w-7 h-7 rounded-full bg-blue-700 text-white font-extrabold text-sm flex items-center justify-center shrink-0 mt-0.5">
                  {idx + 1}
                </span>
                <span className="text-slate-900 font-medium leading-relaxed break-keep">
                  {instruction}
                </span>
              </li>
            ))}
          </ol>
        </div>

        {/* Live URL Inspector for Track 1 (/dc/[id]) & Track 4 (/im-lite/[id]) */}
        {step.enableLiveUrlInspector === "dealcard" && (
          <div className="rounded-2xl border-2 border-blue-200 bg-blue-50/45 p-4 space-y-3 print:hidden">
            <label
              htmlFor="dc-live-url-input"
              className="block font-extrabold text-slate-900"
            >
              🔍 생성된 딜카드 공개 링크(/dc/...) & 카톡 OG 썸네일 즉시 검증기
            </label>
            <div className="flex flex-wrap gap-2">
              <input
                id="dc-live-url-input"
                type="text"
                value={dcInspectInput}
                onChange={(e) => setDcInspectInput(e.target.value)}
                placeholder="복사한 https://www.credeal.net/dc/bld-... 링크를 여기에 붙여넣으세요"
                className="flex-1 min-w-[240px] min-h-[46px] px-3.5 rounded-xl bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-blue-600"
              />
              {resolvedDealId && (
                <a
                  href={`/dc/${encodeURIComponent(resolvedDealId)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[46px] px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-sm inline-flex items-center gap-1.5"
                >
                  <span>고객 딜카드 화면 열기 ↗</span>
                </a>
              )}
              <button
                type="button"
                data-testid="run-live-probe-btn"
                disabled={probeLoading}
                onClick={() => void runLiveProbe()}
                className="min-h-[46px] px-4 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white font-extrabold text-sm cursor-pointer"
              >
                {probeLoading ? "검증 중…" : "⚡ 서버 실데이터 검증"}
              </button>
            </div>
            {probeResult?.dealCardCheck && (
              <div
                data-testid="live-probe-dealcard-result"
                className="p-3 rounded-xl bg-white border border-blue-200 text-sm space-y-1"
              >
                <p className="font-extrabold text-slate-900">
                  서버 판정: {probeResult.dealCardCheck.statusLabel}
                </p>
                <p className="text-slate-700">
                  DB/저장 확인: {probeResult.dealCardCheck.exists ? "✅ 확인" : "⚠️ 미확인"} ·
                  블라인드: {probeResult.dealCardCheck.addressBlindPass ? "✅ 안전" : "❌ 노출 의심"} ·
                  중개사 연락처: {probeResult.dealCardCheck.brokerPhonePass ? "✅ 정상" : "❌ 형식 이상(@ 등)"}
                </p>
              </div>
            )}
            {resolvedDealId && (
              <div className="pt-2 space-y-2">
                <p className="text-sm font-bold text-slate-700">
                  실시간 렌더링된 카카오톡 4분할 OG 이미지 (`/api/og/deal/{resolvedDealId}/kakao-v2`):
                </p>
                <div className="max-w-md rounded-2xl overflow-hidden border-2 border-slate-300 bg-slate-900 shadow-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/og/deal/${encodeURIComponent(resolvedDealId)}/kakao-v2`}
                    alt="카카오톡 딜카드 4분할 OG 썸네일 미리보기"
                    className="w-full h-auto block"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {step.enableLiveUrlInspector === "im" && (
          <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50/45 p-4 space-y-3 print:hidden">
            <label
              htmlFor="im-live-url-input"
              className="block font-extrabold text-slate-900"
            >
              📱 공개 모바일 IM(/im-lite/...) 390px 모바일 뷰 즉시 검증기
            </label>
            <div className="flex flex-wrap gap-2">
              <input
                id="im-live-url-input"
                type="text"
                value={imInspectInput}
                onChange={(e) => setImInspectInput(e.target.value)}
                placeholder="발행된 https://www.credeal.net/im-lite/... 링크 또는 buildingId를 붙여넣으세요"
                className="flex-1 min-w-[240px] min-h-[46px] px-3.5 rounded-xl bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-emerald-600"
              />
              {resolvedImPath && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowEmbeddedImFrame((v) => !v)}
                    className="min-h-[46px] px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-sm cursor-pointer"
                  >
                    {showEmbeddedImFrame ? "모바일 프레임 접기" : "390px 프레임으로 보기"}
                  </button>
                  <a
                    href={resolvedImPath}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[46px] px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-sm inline-flex items-center gap-1.5"
                  >
                    <span>새 탭 열기 ↗</span>
                  </a>
                </>
              )}
              <button
                type="button"
                data-testid="run-live-probe-btn"
                disabled={probeLoading}
                onClick={() => void runLiveProbe()}
                className="min-h-[46px] px-4 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white font-extrabold text-sm cursor-pointer"
              >
                {probeLoading ? "검증 중…" : "⚡ 서버 실데이터 검증"}
              </button>
            </div>
            {probeResult?.shareLinkCheck && (
              <div
                data-testid="live-probe-im-result"
                className="p-3 rounded-xl bg-white border border-emerald-200 text-sm space-y-1"
              >
                <p className="font-extrabold text-slate-900">
                  서버 판정: {probeResult.shareLinkCheck.statusLabel}
                </p>
                <p className="text-slate-700">
                  문서 존재: {probeResult.shareLinkCheck.docExists ? "✅ 확인" : "⚠️ 미확인"} ·
                  공시지가: {probeResult.shareLinkCheck.hasOfficialLandPrice ? "✅ 확인" : "⚠️ 미확인"} ·
                  링크 잠금: {probeResult.shareLinkCheck.isLocked ? "🔒 잠김" : "🔓 열람 가능"}
                </p>
              </div>
            )}
            {resolvedImPath && showEmbeddedImFrame && (
              <div className="pt-2 flex justify-center">
                <iframe
                  title="공개 모바일 IM 390px 미리보기"
                  src={resolvedImPath}
                  className="w-[390px] max-w-full h-[700px] rounded-3xl border-4 border-slate-800 bg-white shadow-lg"
                />
              </div>
            )}
          </div>
        )}

        {/* Zone B: Expected Oracle vs Red Flags */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-2xl bg-emerald-50/70 border border-emerald-200 p-4 space-y-2">
            <h3 className="text-sm font-extrabold text-emerald-950 flex items-center gap-1.5">
              <span>✅</span>
              <span>정답 기준 (Expected Oracle)</span>
            </h3>
            <ul className="space-y-1.5 text-slate-800 leading-relaxed list-disc pl-5 break-keep">
              {step.expectedOracle.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl bg-rose-50/70 border border-rose-200 p-4 space-y-2">
            <h3 className="text-sm font-extrabold text-rose-950 flex items-center gap-1.5">
              <span>🚨</span>
              <span>불합격 함정 신호 (Fail Red Flag)</span>
            </h3>
            <ul className="space-y-1.5 text-slate-800 leading-relaxed list-disc pl-5 break-keep">
              {step.failRedFlags.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          </div>
        </div>

        {/* Inline Defect Editor when FAIL is selected */}
        {verdict === "FAIL" && (
          <div className="rounded-2xl bg-rose-50 border-2 border-rose-300 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label
                htmlFor={`defect-note-${step.id}`}
                className="font-extrabold text-rose-950"
              >
                📝 발견된 결함 현상 기록 (최종 리포트에 자동 집계됨)
              </label>
              <div className="flex items-center gap-2">
                <label
                  htmlFor={`defect-sev-${step.id}`}
                  className="text-sm font-bold text-rose-900"
                >
                  심각도:
                </label>
                <select
                  id={`defect-sev-${step.id}`}
                  value={stepDefect?.severity || step.defaultSeverityIfFail}
                  onChange={(e) =>
                    updateStepDefect(step.id, {
                      severity: e.target.value as DefectSeverity,
                    })
                  }
                  className="min-h-[38px] px-3 rounded-lg bg-white border border-rose-300 font-extrabold text-sm text-rose-950"
                >
                  <option value="S0">S0 · 치명 (출시 차단)</option>
                  <option value="S1">S1 · 중대 (당일 수정)</option>
                  <option value="S2">S2 · 보통 (단기 보완)</option>
                  <option value="S3">S3 · 경미 (개선 제안)</option>
                </select>
              </div>
            </div>
            <textarea
              id={`defect-note-${step.id}`}
              rows={2}
              value={stepDefect?.note || ""}
              onChange={(e) => updateStepDefect(step.id, { note: e.target.value })}
              placeholder="예: 서교동 2필지 조회 시 주차 대수가 빈칸으로 표시됨 / 카톡 미리보기 지연 등"
              className="w-full p-3 rounded-xl bg-white border border-rose-300 text-slate-900 focus:outline-none focus:border-rose-600"
            />
          </div>
        )}

        {/* Zone C: Verdict Action Footer & Focus Stepper Navigation */}
        <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid={`verdict-pass-${step.id}`}
              onClick={() => setStepVerdict(step, "PASS", false)}
              className={`min-h-[48px] px-5 py-2.5 rounded-xl font-extrabold transition cursor-pointer ${
                verdict === "PASS"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300"
              }`}
            >
              ✅ PASS (정상)
            </button>
            <button
              type="button"
              data-testid={`verdict-fail-${step.id}`}
              onClick={() => setStepVerdict(step, "FAIL", false)}
              className={`min-h-[48px] px-5 py-2.5 rounded-xl font-extrabold transition cursor-pointer ${
                verdict === "FAIL"
                  ? "bg-rose-600 text-white shadow-sm"
                  : "bg-rose-50 hover:bg-rose-100 text-rose-900 border border-rose-300"
              }`}
            >
              ❌ FAIL (결함 발견)
            </button>
            {verdict !== "PENDING" && (
              <button
                type="button"
                onClick={() => setStepVerdict(step, "PENDING", false)}
                className="min-h-[48px] px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm cursor-pointer"
              >
                초기화
              </button>
            )}
          </div>

          {viewMode === "focus" && (
            <div className="flex flex-wrap items-center gap-2">
              {prevStep && (
                <button
                  type="button"
                  onClick={() => {
                    handleSelectTrack(prevStep.trackId, prevStep.id);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className="min-h-[48px] px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 font-bold cursor-pointer"
                >
                  ◀ 이전 단계
                </button>
              )}
              <button
                type="button"
                data-testid={`pass-and-next-${step.id}`}
                onClick={() => setStepVerdict(step, "PASS", true)}
                className="min-h-[48px] px-5 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-extrabold shadow-sm cursor-pointer"
              >
                {nextStep
                  ? `✅ PASS 체크 후 다음 (${nextStep.stepNo}) ▶`
                  : "✅ 마지막 항목 PASS & 최종 판정표 이동 ▶"}
              </button>
            </div>
          )}
        </div>
      </article>
    );
  };

  return (
    <div
      className={`min-h-screen bg-[#F4F6FA] text-slate-900 ${
        largeFont ? "text-[18px]" : "text-[16px]"
      }`}
    >
      {/* Floating Copy/Download Toast */}
      {toastMsg && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 max-w-md px-5 py-3.5 rounded-2xl bg-slate-950 text-white font-bold shadow-xl border border-slate-700 print:hidden"
        >
          {toastMsg}
        </div>
      )}

      {/* Top Sticky Command Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-2xs print:static print:shadow-none">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="px-2.5 py-1 rounded-lg bg-blue-700 text-white text-xs font-extrabold tracking-wider">
                CREDEAL QA
              </span>
              <h1 className="text-lg sm:text-xl font-extrabold text-slate-950 break-keep">
                딜카드 · IM 상용화 MECE 클릭 스루 완전 점검 가이드
              </h1>
              <span
                data-testid="workbench-gate-badge"
                className={`px-3 py-1 rounded-full text-xs font-extrabold border ${
                  stats.gateStatus === "GO"
                    ? "bg-emerald-100 text-emerald-900 border-emerald-300"
                    : stats.gateStatus === "NOGO"
                    ? "bg-rose-100 text-rose-900 border-rose-300"
                    : "bg-amber-50 text-amber-900 border-amber-300"
                }`}
              >
                {stats.gateStatus === "GO"
                  ? "🟢 GO · 출시 승인 가능"
                  : stats.gateStatus === "NOGO"
                  ? `🔴 NO-GO · S0(${stats.s0Count})/S1(${stats.s1Count}) 보완 필요`
                  : `🟡 점검 진행 중 (${stats.pass}/${stats.total} 완료)`}
              </span>
              <span
                data-testid="workbench-sync-badge"
                title={lastServerSyncedAt || sessionId}
                className={`px-2.5 py-1 rounded-full text-xs font-bold border ${
                  serverSyncStatus === "submitted"
                    ? "bg-blue-50 text-blue-900 border-blue-200"
                    : serverSyncStatus === "synced"
                    ? "bg-emerald-50 text-emerald-900 border-emerald-200"
                    : serverSyncStatus === "syncing"
                    ? "bg-amber-50 text-amber-900 border-amber-200"
                    : serverSyncStatus === "error"
                    ? "bg-rose-50 text-rose-900 border-rose-200"
                    : "bg-slate-100 text-slate-700 border-slate-200"
                }`}
              >
                {serverSyncStatus === "submitted"
                  ? "☁️ 서버 제출 완료"
                  : serverSyncStatus === "synced"
                  ? "☁️ 자동 동기화됨"
                  : serverSyncStatus === "syncing"
                  ? "⏳ 서버 동기화 중"
                  : serverSyncStatus === "error"
                  ? "⚠️ 로컬 저장만 유지"
                  : "💾 로컬+서버 대기"}
              </span>
            </div>

            {/* Right Controls: Font Size + View Mode + Workspace Launchers */}
            <div className="flex flex-wrap items-center gap-2 print:hidden">
              <a
                href="/qa-signoff"
                data-testid="open-qa-signoff-hub"
                className="min-h-[44px] px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-extrabold shadow-xs transition inline-flex items-center whitespace-nowrap"
              >
                <span>⚡ 20분 고속 검수 허브 ↗</span>
              </a>
              <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200">
                <button
                  type="button"
                  onClick={() => setViewMode("focus")}
                  className={`min-h-[36px] px-3 rounded-lg text-xs font-extrabold transition cursor-pointer ${
                    viewMode === "focus"
                      ? "bg-white text-blue-700 shadow-2xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  🎯 1단계씩 클릭 스루
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("all")}
                  className={`min-h-[36px] px-3 rounded-lg text-xs font-extrabold transition cursor-pointer ${
                    viewMode === "all"
                      ? "bg-white text-blue-700 shadow-2xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  📋 트랙 전체 펼치기
                </button>
              </div>

              <button
                type="button"
                data-testid="toggle-large-font-btn"
                onClick={() => setLargeFont((v) => !v)}
                className={`min-h-[38px] px-3.5 rounded-xl text-xs font-extrabold border transition cursor-pointer ${
                  largeFont
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white hover:bg-slate-100 text-slate-800 border-slate-300"
                }`}
              >
                {largeFont ? "큰글씨 켜짐 (18px)" : "큰글씨 전환"}
              </button>

              <a
                href="/broker/w/dealcards"
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[38px] px-3 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 text-xs font-extrabold inline-flex items-center gap-1"
              >
                <span>📄 딜카드 ↗</span>
              </a>
              <a
                href="/broker/w/im"
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[38px] px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 text-xs font-extrabold inline-flex items-center gap-1"
              >
                <span>📊 IM ↗</span>
              </a>
              <a
                href="/broker/w/inbox"
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[38px] px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-xs font-extrabold inline-flex items-center gap-1"
              >
                <span>💬 소통함 ↗</span>
              </a>
            </div>
          </div>

          {/* Progress Bar + Stopwatch & Friction Counter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1 print:hidden">
            <div className="flex items-center gap-3 flex-1 min-w-[240px]">
              <div className="flex-1 h-2.5 rounded-full bg-slate-200 overflow-hidden">
                <div
                  className="h-full bg-blue-600 transition-all duration-300"
                  style={{ width: `${stats.pct}%` }}
                />
              </div>
              <span className="text-xs font-extrabold text-slate-700 shrink-0">
                진행률 {stats.pct}% (PASS {stats.pass} · FAIL {stats.fail} · 대기 {stats.pending})
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-bold text-slate-600">
                ⏱ {activeTimerTrack.toUpperCase()} 경과:{" "}
                <strong className="font-mono text-sm text-slate-950">
                  {formatClock(trackMetrics[activeTimerTrack].seconds)}
                </strong>
              </span>
              <button
                type="button"
                onClick={() => setIsTimerRunning((r) => !r)}
                className={`min-h-[32px] px-3 rounded-lg font-extrabold cursor-pointer ${
                  isTimerRunning
                    ? "bg-amber-500 text-slate-950"
                    : "bg-slate-900 text-white"
                }`}
              >
                {isTimerRunning ? "⏸ 일시정지" : "▶ 타이머 시작"}
              </button>
              <button
                type="button"
                onClick={() =>
                  setTrackMetrics((prev) => ({
                    ...prev,
                    [activeTimerTrack]: {
                      ...prev[activeTimerTrack],
                      hesitations: prev[activeTimerTrack].hesitations + 1,
                    },
                  }))
                }
                className="min-h-[32px] px-2.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-950 border border-amber-300 font-bold cursor-pointer"
                title="어디를 눌러야 할지 망설였을 때 클릭"
              >
                망설임 +1 ({trackMetrics[activeTimerTrack].hesitations})
              </button>
              <button
                type="button"
                onClick={() =>
                  setTrackMetrics((prev) => ({
                    ...prev,
                    [activeTimerTrack]: {
                      ...prev[activeTimerTrack],
                      misclicks: prev[activeTimerTrack].misclicks + 1,
                    },
                  }))
                }
                className="min-h-[32px] px-2.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-900 border border-rose-300 font-bold cursor-pointer"
                title="다른 버튼을 잘못 눌렀을 때 클릭"
              >
                오클릭 +1 ({trackMetrics[activeTimerTrack].misclicks})
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main 2-Column Workbench Layout */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Track Rail */}
        <aside className="lg:col-span-3 lg:sticky lg:top-28 space-y-2 print:hidden">
          <nav aria-label="점검 트랙 선택" className="space-y-2">
            {WORKBENCH_TRACKS.map((tr) => {
              const isSelected = activeTrack === tr.id;
              const tSteps = CLICK_THROUGH_STEPS.filter((s) => s.trackId === tr.id);
              const doneCnt = tSteps.filter(
                (s) => (verdicts[s.id] || "PENDING") !== "PENDING"
              ).length;
              const failCnt = tSteps.filter((s) => verdicts[s.id] === "FAIL").length;

              return (
                <button
                  key={tr.id}
                  type="button"
                  data-testid={`nav-track-${tr.id}`}
                  onClick={() => {
                    handleSelectTrack(tr.id);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className={`w-full text-left p-3.5 rounded-2xl border transition-all cursor-pointer ${
                    isSelected
                      ? "bg-slate-950 text-white border-slate-950 shadow-md"
                      : "bg-white hover:bg-slate-50 text-slate-900 border-slate-200"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-xs font-extrabold px-2 py-0.5 rounded-md ${
                        isSelected
                          ? "bg-blue-500/25 text-blue-200"
                          : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {tr.shortBadge}
                    </span>
                    {tSteps.length > 0 && (
                      <span
                        className={`text-xs font-extrabold px-2 py-0.5 rounded-full ${
                          failCnt > 0
                            ? "bg-rose-500 text-white"
                            : doneCnt === tSteps.length
                            ? "bg-emerald-500 text-white"
                            : isSelected
                            ? "bg-slate-800 text-slate-300"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {doneCnt}/{tSteps.length}
                      </span>
                    )}
                  </div>
                  <p className="font-extrabold mt-1.5 leading-snug break-keep">
                    {tr.icon} {tr.title}
                  </p>
                  <p
                    className={`text-xs mt-0.5 leading-snug break-keep ${
                      isSelected ? "text-slate-300" : "text-slate-500"
                    }`}
                  >
                    {tr.subtitle}
                  </p>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Main Content Area */}
        <main className="lg:col-span-9 space-y-6">
          {/* TAB 0: OVERVIEW & PRE-FLIGHT ASSETS */}
          {activeTrack === "overview" && (
            <div className="space-y-6">
              <section className="rounded-3xl bg-white border border-slate-200 p-6 sm:p-8 shadow-2xs space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <span className="px-3 py-1 rounded-full bg-blue-50 text-blue-800 border border-blue-200 text-xs font-extrabold">
                      총 65분 · 5개 트랙 · {CLICK_THROUGH_STEPS.length}개 클릭 스루 검증 단계
                    </span>
                    <h2 className="text-2xl font-extrabold text-slate-950 mt-2 break-keep">
                      한 번의 완주로 딜카드·IM 모든 UI/UX, 기능, 산출물을 빈틈없이 점검합니다
                    </h2>
                  </div>
                  <button
                    type="button"
                    data-testid="start-track1-btn"
                    onClick={() => {
                      handleSelectTrack("track1");
                      setIsTimerRunning(true);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    className="min-h-[52px] px-6 py-3 rounded-2xl bg-blue-700 hover:bg-blue-800 text-white font-extrabold shadow-md cursor-pointer"
                  >
                    🚀 Track 1부터 클릭 스루 시작하기 ▶
                  </button>
                </div>

                <p className="text-slate-700 leading-relaxed break-keep">
                  이 페이지는 별도의 테스트 문서를 찾거나 샘플 데이터를 직접 만들 필요 없이,{" "}
                  <strong>화면 왼쪽에 본 가이드를 띄우고 오른쪽에 작업공간 새 탭을 띄운 상태</strong>에서{" "}
                  <strong>[복사] → [붙여넣기] → [PASS/FAIL 판정]</strong>만으로 상용화 최종 승인을 마칠 수 있도록 구성되었습니다.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                    <p className="font-extrabold text-slate-900">① 준비 기기</p>
                    <p className="text-sm text-slate-700 mt-1 break-keep">
                      PC Chrome(중개사 로그인) + 스마트폰 실기기(카카오톡 나에게 보내기 & 시크릿 창)
                    </p>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                    <p className="font-extrabold text-slate-900">② 확인 프로그램</p>
                    <p className="text-sm text-slate-700 mt-1 break-keep">
                      Microsoft PowerPoint (내려받은 단필지 11면 · 다필지 10면 PPTX 실개봉 육안 확인용)
                    </p>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                    <p className="font-extrabold text-slate-900">③ 테스트 파일 내장</p>
                    <p className="text-sm text-slate-700 mt-1 break-keep">
                      가로·세로 혼합 사진 7장과 합계 행이 포함된 비표준 .xlsx 파일을 아래에서 1클릭 제공
                    </p>
                  </div>
                </div>
              </section>

              {/* Quick Asset Kit */}
              <section className="rounded-3xl bg-white border border-slate-200 p-6 sm:p-8 shadow-2xs space-y-4">
                <h3 className="text-xl font-extrabold text-slate-950">
                  📦 테스트 준비 파일 원클릭 키트 (미리 받아 두셔도 되고 각 단계에서 받으셔도 됩니다)
                </h3>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      void handleDownloadFile(
                        "/api/public/dealcard-im-test-assets?kind=xlsx&preset=seogyo_nonstandard",
                        "서교동_2필지_비표준렌트롤_합계행포함.xlsx"
                      );
                    }}
                    className="min-h-[48px] px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-sm cursor-pointer"
                  >
                    ⬇️ 서교동 비표준 .xlsx 다운로드 (합계행·공실·전세·자가사용 포함)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void handleDownloadFile(
                        "/api/public/dealcard-im-test-assets?kind=xlsx&preset=bojeong_standard",
                        "보정동_단필지_표준렌트롤_7개호실.xlsx"
                      );
                    }}
                    className="min-h-[48px] px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-900 border border-slate-300 font-extrabold text-sm cursor-pointer"
                  >
                    ⬇️ 보정동 표준 .xlsx 다운로드 (7개 호실)
                  </button>
                </div>
                {renderPhotoPackBox(7)}
              </section>

              {/* 6 MECE Dimensions Matrix */}
              <section className="rounded-3xl bg-white border border-slate-200 p-6 sm:p-8 shadow-2xs space-y-4">
                <h3 className="text-xl font-extrabold text-slate-950">
                  🧭 6대 MECE 점검 축 매트릭스 (누락 0 · 중복 0 설계)
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b-2 border-slate-200 text-sm text-slate-600">
                        <th className="py-3 pr-3 font-extrabold">축</th>
                        <th className="py-3 px-3 font-extrabold">점검 차원 & 범위</th>
                        <th className="py-3 px-3 font-extrabold">이번 세션 핵심 함정 방어 포인트</th>
                        <th className="py-3 pl-3 font-extrabold">연결 트랙</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-sm">
                      {MECE_6_DIMENSIONS.map((row) => (
                        <tr key={row.code} className="align-top">
                          <td className="py-3.5 pr-3 font-extrabold text-blue-700 whitespace-nowrap">
                            {row.code}
                          </td>
                          <td className="py-3.5 px-3">
                            <p className="font-extrabold text-slate-900">{row.title}</p>
                            <p className="text-slate-600 mt-0.5 break-keep">{row.scope}</p>
                          </td>
                          <td className="py-3.5 px-3 text-slate-800 break-keep">
                            {row.sessionTrapFocus}
                          </td>
                          <td className="py-3.5 pl-3 font-bold text-slate-700 whitespace-nowrap">
                            {row.coveredByTracks}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}

          {/* TRACK 1 ~ TRACK 5 STEPPER CARDS */}
          {currentTrackSteps.length > 0 && (
            <div className="space-y-4">
              {/* Step Pill Bar inside current Track */}
              <div className="rounded-2xl bg-white border border-slate-200 p-3.5 flex flex-wrap items-center justify-between gap-2 print:hidden">
                <div className="flex flex-wrap items-center gap-1.5">
                  {currentTrackSteps.map((st) => {
                    const v = verdicts[st.id] || "PENDING";
                    const isActiveStep = viewMode === "focus" && focusedStepId === st.id;
                    return (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => setFocusedStepId(st.id)}
                        className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-extrabold border transition cursor-pointer ${
                          isActiveStep
                            ? "bg-slate-950 text-white border-slate-950 shadow-2xs"
                            : v === "PASS"
                            ? "bg-emerald-50 text-emerald-900 border-emerald-300"
                            : v === "FAIL"
                            ? "bg-rose-50 text-rose-900 border-rose-300"
                            : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
                        }`}
                      >
                        {v === "PASS" ? "✅ " : v === "FAIL" ? "❌ " : ""}
                        {st.stepNo}
                      </button>
                    );
                  })}
                </div>
                <span className="text-xs font-bold text-slate-500">
                  {viewMode === "focus"
                    ? "단계 번호를 누르거나 하단 [PASS 후 다음]으로 이동하세요"
                    : "전체 펼쳐보기 모드"}
                </span>
              </div>

              <div className="space-y-6">
                {visibleSteps.map((step) => renderStepCard(step))}
              </div>
            </div>
          )}

          {/* TAB 6: FINAL GO / NO-GO SIGN-OFF & EXPORT */}
          {activeTrack === "signoff" && (
            <div className="space-y-6">
              <section className="rounded-3xl bg-white border border-slate-200 p-6 sm:p-8 shadow-2xs space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
                  <div>
                    <h2 className="text-2xl font-extrabold text-slate-950">
                      🏁 상용화 최종 승인(Go / No-Go) 판정 대시보드
                    </h2>
                    <p className="text-slate-600 mt-1">
                      S0(치명)·S1(중대) 결함이 0건이고 전 항목이 PASS이면 상용 출시 승인이 확정됩니다.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 print:hidden">
                    <button
                      type="button"
                      data-testid="submit-qa-report-btn"
                      disabled={serverSyncStatus === "syncing"}
                      onClick={() => void syncToServer("submit")}
                      className="min-h-[46px] px-4 py-2.5 rounded-xl bg-indigo-700 hover:bg-indigo-800 disabled:opacity-50 text-white font-extrabold text-sm cursor-pointer"
                    >
                      {serverSyncStatus === "syncing"
                        ? "제출 중…"
                        : "☁️ 검수 결과 서버 제출"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void handleCopyText(
                          buildMarkdownReport(),
                          "마크다운 검수 리포트",
                          "copy-md-report"
                        );
                      }}
                      className="min-h-[46px] px-4 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-extrabold text-sm cursor-pointer"
                    >
                      📋 마크다운 결과 복사
                    </button>
                    <button
                      type="button"
                      onClick={handleExportJson}
                      className="min-h-[46px] px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-sm cursor-pointer"
                    >
                      ⬇️ JSON 저장
                    </button>
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="min-h-[46px] px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-sm cursor-pointer"
                    >
                      🖨️ 인쇄 / PDF 출력
                    </button>
                    <button
                      type="button"
                      onClick={handleResetAll}
                      className="min-h-[46px] px-3.5 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-900 border border-rose-200 font-bold text-sm cursor-pointer"
                    >
                      초기화
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5 print:hidden">
                  <label
                    htmlFor="dcim-overall-comment"
                    className="block text-sm font-extrabold text-slate-800"
                  >
                    총평 / 추가 검수 의견 (서버 리포트에 함께 저장됩니다)
                  </label>
                  <textarea
                    id="dcim-overall-comment"
                    rows={2}
                    value={overallComment}
                    onChange={(e) => setOverallComment(e.target.value)}
                    placeholder="테스트 중 발견한 UX 개선점이나 출시 승인 의견을 자유롭게 적어주세요."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-sm focus:outline-none focus:border-indigo-600"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200">
                    <p className="text-xs font-bold text-emerald-900">통과 (PASS)</p>
                    <p className="text-2xl font-extrabold text-emerald-950 mt-1">
                      {stats.pass} / {stats.total}
                    </p>
                  </div>
                  <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200">
                    <p className="text-xs font-bold text-rose-900">출시 차단 결함 (S0 / S1)</p>
                    <p className="text-2xl font-extrabold text-rose-950 mt-1">
                      S0 {stats.s0Count}건 · S1 {stats.s1Count}건
                    </p>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                    <p className="text-xs font-bold text-slate-600">누적 소요 시간</p>
                    <p className="text-2xl font-extrabold text-slate-950 mt-1 font-mono">
                      {formatClock(stats.totalSeconds)}
                    </p>
                  </div>
                  <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200">
                    <p className="text-xs font-bold text-amber-900">UX 마찰 지표</p>
                    <p className="text-lg font-extrabold text-amber-950 mt-1">
                      망설임 {stats.totalHesitations} · 오클릭 {stats.totalMisclicks}
                    </p>
                  </div>
                </div>

                <div className="max-w-sm">
                  <label
                    htmlFor="tester-name-input"
                    className="block text-sm font-extrabold text-slate-800 mb-1"
                  >
                    검수자 성명 / 소속
                  </label>
                  <input
                    id="tester-name-input"
                    type="text"
                    value={testerName}
                    onChange={(e) => setTesterName(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-white border border-slate-300 text-slate-900 font-semibold"
                  />
                </div>

                {/* Track Summary Table */}
                <div className="overflow-x-auto pt-2">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b-2 border-slate-200 text-slate-600">
                        <th className="py-2.5 pr-3 font-extrabold">트랙</th>
                        <th className="py-2.5 px-3 font-extrabold">PASS</th>
                        <th className="py-2.5 px-3 font-extrabold">FAIL</th>
                        <th className="py-2.5 px-3 font-extrabold">미점검</th>
                        <th className="py-2.5 px-3 font-extrabold">소요 시간</th>
                        <th className="py-2.5 pl-3 font-extrabold">망설임 / 오클릭</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {(["track1", "track2", "track3", "track4", "track5"] as ExecTrackId[]).map(
                        (tid) => {
                          const meta = WORKBENCH_TRACKS.find((t) => t.id === tid);
                          const tSteps = CLICK_THROUGH_STEPS.filter((s) => s.trackId === tid);
                          const pCnt = tSteps.filter((s) => verdicts[s.id] === "PASS").length;
                          const fCnt = tSteps.filter((s) => verdicts[s.id] === "FAIL").length;
                          const uCnt = tSteps.length - pCnt - fCnt;
                          const m = trackMetrics[tid];
                          return (
                            <tr key={tid}>
                              <td className="py-3 pr-3 font-extrabold text-slate-900">
                                {meta?.title}
                              </td>
                              <td className="py-3 px-3 font-bold text-emerald-700">{pCnt}</td>
                              <td className="py-3 px-3 font-bold text-rose-700">{fCnt}</td>
                              <td className="py-3 px-3 text-slate-600">{uCnt}</td>
                              <td className="py-3 px-3 font-mono font-bold">
                                {formatClock(m.seconds)}
                              </td>
                              <td className="py-3 pl-3 text-slate-700">
                                {m.hesitations}회 / {m.misclicks}회
                              </td>
                            </tr>
                          );
                        }
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Custom & Auto-Captured Defect Log */}
              <section className="rounded-3xl bg-white border border-slate-200 p-6 sm:p-8 shadow-2xs space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-xl font-extrabold text-slate-950">
                    📝 발견 결함 및 UX 개선 기록부 ({stats.allDefects.length}건)
                  </h3>
                  <button
                    type="button"
                    onClick={() =>
                      setCustomDefects((prev) => [
                        ...prev,
                        {
                          id: `custom-${Date.now()}`,
                          stepId: "기타 발견",
                          trackLabel: "자유 기재 항목",
                          severity: "S2",
                          note: "",
                          updatedAt: new Date().toLocaleTimeString("ko-KR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          }),
                        },
                      ])
                    }
                    className="min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-900 border border-slate-300 text-sm font-extrabold cursor-pointer print:hidden"
                  >
                    ＋ 자유 결함/건의 메모 추가
                  </button>
                </div>

                {stats.allDefects.length === 0 ? (
                  <p className="p-5 rounded-2xl bg-slate-50 border border-slate-200 text-slate-600 text-center font-medium">
                    현재 FAIL로 표시되거나 추가된 결함이 없습니다.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {stats.allDefects.map((d) => {
                      const isCustom = d.id.startsWith("custom-");
                      return (
                        <div
                          key={d.id}
                          className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-extrabold text-slate-900">
                              [{d.severity}] {d.stepId} — {d.trackLabel}
                            </span>
                            {isCustom && (
                              <div className="flex items-center gap-2 print:hidden">
                                <select
                                  aria-label="자유 결함 심각도"
                                  value={d.severity}
                                  onChange={(e) =>
                                    setCustomDefects((prev) =>
                                      prev.map((it) =>
                                        it.id === d.id
                                          ? {
                                              ...it,
                                              severity: e.target.value as DefectSeverity,
                                            }
                                          : it
                                      )
                                    )
                                  }
                                  className="min-h-[34px] px-2.5 rounded-lg bg-white border border-slate-300 text-xs font-extrabold"
                                >
                                  <option value="S0">S0 · 치명</option>
                                  <option value="S1">S1 · 중대</option>
                                  <option value="S2">S2 · 보통</option>
                                  <option value="S3">S3 · 경미</option>
                                </select>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setCustomDefects((prev) =>
                                      prev.filter((it) => it.id !== d.id)
                                    )
                                  }
                                  className="min-h-[34px] px-2.5 rounded-lg bg-rose-100 text-rose-900 text-xs font-bold cursor-pointer"
                                >
                                  삭제
                                </button>
                              </div>
                            )}
                          </div>
                          {isCustom ? (
                            <input
                              type="text"
                              aria-label="자유 결함 내용"
                              value={d.note}
                              onChange={(e) =>
                                setCustomDefects((prev) =>
                                  prev.map((it) =>
                                    it.id === d.id ? { ...it, note: e.target.value } : it
                                  )
                                )
                              }
                              placeholder="발견한 현상이나 UX 개선 건의를 적어주세요"
                              className="w-full min-h-[42px] px-3 rounded-xl bg-white border border-slate-300 text-slate-900"
                            />
                          ) : (
                            <p className="text-slate-800">{d.note || "(사유 미기재)"}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* S0 ~ S3 Gate Rubric Reference */}
              <section className="rounded-3xl bg-white border border-slate-200 p-6 sm:p-8 shadow-2xs space-y-4">
                <h3 className="text-xl font-extrabold text-slate-950">
                  ⚖️ S0 ~ S3 심각도 및 출시 승인 기준표
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {SEVERITY_RUBRIC.map((r) => (
                    <div
                      key={r.severity}
                      className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1"
                    >
                      <p className="font-extrabold text-slate-950">{r.badgeLabel}</p>
                      <p className="text-xs font-extrabold text-blue-700">{r.gateRule}</p>
                      <p className="text-sm text-slate-700 break-keep pt-1">{r.examples}</p>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
