"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  MECE_AXES,
  MECE_36_STEPS,
  WINDOW_SETUP_CARDS,
  RED_FLAG_ORACLES,
  SIGN_OFF_GATES,
  type MeceAxisId,
  type MeceSeverity,
  type MeceStepItem,
} from "@/lib/testguide/newsletter-inbox-mece-data";

type CheckStatus = "PENDING" | "PASS" | "FAIL";
type ViewMode = "walkthrough" | "matrix" | "report";
type StepFilter = "all" | "pending" | "fail" | "s0";

interface StepRecord {
  status: CheckStatus;
  note: string;
  overrideSeverity?: MeceSeverity;
  checkedAt?: string;
}

interface SavedScratchLinks {
  newsletterUrl: string;
  dealcardUrl: string;
  imTokenUrl: string;
  testClientContact: string;
}

type ServerSyncState = "idle" | "syncing" | "synced" | "submitted";

interface LiveProbeResponse {
  ok: boolean;
  checkedAt?: string;
  newsletterCheck?: {
    validUrl: boolean;
    brokerSlug?: string;
    issueDate?: string;
    editionId?: string | null;
    existsAndPublished: boolean;
    addressBlindPass: boolean;
    offendingAddresses: string[];
    brokerPhonePass: boolean;
    noRawUuidPass: boolean;
    offendingUuidTitles: string[];
    dealCount?: number;
    error?: string;
  } | null;
  shareLinkCheck?: {
    validUrl: boolean;
    buildingId: string;
    hasToken: boolean;
    tokenReason?: string | null;
    docRevoked?: boolean;
    isLocked: boolean;
    statusLabel: string;
    error?: string;
  } | null;
  subscriberCheck?: {
    foundInMagazineSubscribers: boolean;
    status?: string | null;
    confirmStatus: string | null;
    foundInBrokerClients: boolean;
    brokerAuthenticated?: boolean;
  } | null;
}

interface SeedAxis456Result {
  seededInquiryId: string | null;
  seededBuildingId: string | null;
  seededSubscriberContact: string;
  message: string;
}

const STORAGE_KEY = "credeal-nl-inbox-mece-workbench-v1";
const WORKBENCH_ID = "newsletter-inbox-mece-v1";
const TARGET_TOTAL_SECONDS = 40 * 60; // 40분 기준

function createQaSessionId(): string {
  return `qa-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function getSyncStatusLabel(syncState: ServerSyncState): string {
  switch (syncState) {
    case "syncing":
      return "서버 자동저장 중...";
    case "synced":
      return "서버 동기화됨 ✓";
    case "submitted":
      return "서버 제출 완료 ✓";
    default:
      return "로컬 대기";
  }
}

function formatDuration(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, "0")}분 ${String(secs).padStart(2, "0")}초`;
}

function getWindowBadgeStyle(windowMode: MeceStepItem["windowMode"]): string {
  if (windowMode.includes("↔")) {
    return "bg-violet-100 text-violet-900 border-violet-300";
  }
  if (windowMode.startsWith("창 B")) {
    return "bg-amber-100 text-amber-950 border-amber-300";
  }
  if (windowMode.includes("모바일")) {
    return "bg-teal-100 text-teal-950 border-teal-300";
  }
  return "bg-blue-100 text-blue-900 border-blue-300";
}

function getLinkButtonClass(variant: "primary" | "indigo" | "emerald" | "slate" = "primary"): string {
  switch (variant) {
    case "indigo":
      return "bg-[#4338CA] hover:bg-[#3730A3] text-white";
    case "emerald":
      return "bg-[#059669] hover:bg-[#047857] text-white";
    case "slate":
      return "bg-[#334155] hover:bg-[#1E293B] text-white";
    default:
      return "bg-[#1D4ED8] hover:bg-[#1E40AF] text-white";
  }
}

export default function NewsletterInboxTestPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("walkthrough");
  const [activeStepIdx, setActiveStepIdx] = useState<number>(0);
  const [stepFilter, setStepFilter] = useState<StepFilter>("all");
  const [matrixSearch, setMatrixSearch] = useState<string>("");

  const [showSetupGuide, setShowSetupGuide] = useState<boolean>(true);
  const [showLinkVault, setShowLinkVault] = useState<boolean>(false);

  const [sessionId, setSessionId] = useState<string>(() => createQaSessionId());
  const [records, setRecords] = useState<Record<string, StepRecord>>({});
  const [testerName, setTesterName] = useState<string>("상용화 총괄 검수자");
  const [testerOrg, setTesterOrg] = useState<string>("");
  const [overallComment, setOverallComment] = useState<string>("");
  const [scratchLinks, setScratchLinks] = useState<SavedScratchLinks>({
    newsletterUrl: "",
    dealcardUrl: "",
    imTokenUrl: "",
    testClientContact: "",
  });

  const [serverSyncStatus, setServerSyncStatus] = useState<ServerSyncState>("idle");
  const [isSubmittingServer, setIsSubmittingServer] = useState<boolean>(false);
  const [isProbing, setIsProbing] = useState<boolean>(false);
  const [probeResult, setProbeResult] = useState<LiveProbeResponse | null>(null);
  const [isSeedingAxis456, setIsSeedingAxis456] = useState<boolean>(false);
  const [seedResult, setSeedResult] = useState<SeedAxis456Result | null>(null);

  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [resetArmed, setResetArmed] = useState<boolean>(false);
  const [hydrated, setHydrated] = useState<boolean>(false);

  const stepCardTopRef = useRef<HTMLDivElement | null>(null);
  const noteInputRef = useRef<HTMLTextAreaElement | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const elapsedSecondsRef = useRef<number>(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    elapsedSecondsRef.current = elapsedSeconds;
  }, [elapsedSeconds]);

  // Hydrate persisted state from localStorage (and optional ?sessionId= cross-device recovery)
  useEffect(() => {
    let querySessionId = "";
    try {
      if (typeof window !== "undefined" && window.location.search) {
        const sp = new URLSearchParams(window.location.search);
        querySessionId = (sp.get("sessionId") || "").trim();
      }
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (querySessionId && querySessionId.length >= 6) {
          setSessionId(querySessionId);
        } else if (typeof parsed.sessionId === "string" && parsed.sessionId.length >= 6) {
          setSessionId(parsed.sessionId);
        }
        if (parsed.records && typeof parsed.records === "object") {
          setRecords(parsed.records);
        }
        if (typeof parsed.activeStepIdx === "number" && parsed.activeStepIdx >= 0 && parsed.activeStepIdx < MECE_36_STEPS.length) {
          setActiveStepIdx(parsed.activeStepIdx);
        }
        if (typeof parsed.testerName === "string") {
          setTesterName(parsed.testerName);
        }
        if (typeof parsed.testerOrg === "string") {
          setTesterOrg(parsed.testerOrg);
        }
        if (typeof parsed.overallComment === "string") {
          setOverallComment(parsed.overallComment);
        }
        if (parsed.scratchLinks && typeof parsed.scratchLinks === "object") {
          setScratchLinks((prev) => ({ ...prev, ...parsed.scratchLinks }));
        }
        if (typeof parsed.elapsedSeconds === "number") {
          setElapsedSeconds(parsed.elapsedSeconds);
        }
        if (typeof parsed.showSetupGuide === "boolean") {
          setShowSetupGuide(parsed.showSetupGuide);
        }
      } else if (querySessionId && querySessionId.length >= 6) {
        setSessionId(querySessionId);
      }
    } catch {
      // Ignore storage read errors
    } finally {
      setHydrated(true);
    }

    // Recover session from server ONLY when ?sessionId= is explicitly present in URL
    if (querySessionId && querySessionId.length >= 6 && typeof fetch === "function") {
      try {
        const req = fetch(
          `/api/public/qa-workbench?sessionId=${encodeURIComponent(querySessionId)}`
        );
        if (req && typeof req.then === "function") {
          req
            .then((r) => (r && r.ok ? r.json() : null))
            .then((payload) => {
              if (!isMountedRef.current || !payload?.found || !payload.session) return;
              const s = payload.session;
              if (s.records && typeof s.records === "object") setRecords(s.records);
              if (typeof s.testerName === "string" && s.testerName) setTesterName(s.testerName);
              if (typeof s.testerOrg === "string") setTesterOrg(s.testerOrg);
              if (typeof s.overallComment === "string") setOverallComment(s.overallComment);
              if (s.scratchLinks && typeof s.scratchLinks === "object") {
                setScratchLinks((prev) => ({ ...prev, ...s.scratchLinks }));
              }
              if (typeof s.elapsedSeconds === "number") setElapsedSeconds(s.elapsedSeconds);
              setServerSyncStatus(s.mode === "submit" ? "submitted" : "synced");
            })
            .catch(() => {});
        }
      } catch {
        // Ignore network degradation
      }
    }
  }, []);

  // Persist state on change
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          sessionId,
          records,
          activeStepIdx,
          testerName,
          testerOrg,
          overallComment,
          scratchLinks,
          elapsedSeconds,
          showSetupGuide,
        })
      );
    } catch {
      // Ignore storage quota errors
    }
  }, [
    hydrated,
    sessionId,
    records,
    activeStepIdx,
    testerName,
    testerOrg,
    overallComment,
    scratchLinks,
    elapsedSeconds,
    showSetupGuide,
  ]);

  // Stopwatch interval
  useEffect(() => {
    if (!isTimerRunning) return;
    const id = window.setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [isTimerRunning]);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => {
      setToastMessage((curr) => (curr === msg ? null : curr));
    }, 2400);
  }, []);

  const handleCopy = useCallback(
    async (text: string, label: string, keyId: string) => {
      if (!text.trim()) {
        showToast(`⚠️ [${label}] 복사할 내용이 아직 비어 있습니다.`);
        return;
      }
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
      setCopiedId(keyId);
      showToast(`✅ [${label}] 복사 완료! 대상 화면에서 Ctrl+V로 붙여넣으세요.`);
      window.setTimeout(() => {
        setCopiedId((curr) => (curr === keyId ? null : curr));
      }, 1800);
    },
    [showToast]
  );

  const activeStep: MeceStepItem = MECE_36_STEPS[activeStepIdx] ?? MECE_36_STEPS[0];
  const activeAxis = useMemo(
    () => MECE_AXES.find((ax) => ax.id === activeStep.axisId) ?? MECE_AXES[0],
    [activeStep.axisId]
  );
  const activeRecord: StepRecord = records[activeStep.code] ?? {
    status: "PENDING",
    note: "",
  };

  // Summary statistics
  const stats = useMemo(() => {
    let passCount = 0;
    let failCount = 0;
    let s0FailCount = 0;
    let s1FailCount = 0;
    let s2FailCount = 0;

    for (const step of MECE_36_STEPS) {
      const rec = records[step.code];
      if (!rec || rec.status === "PENDING") continue;
      if (rec.status === "PASS") {
        passCount += 1;
      } else if (rec.status === "FAIL") {
        failCount += 1;
        const effectiveSev = rec.overrideSeverity ?? step.severity;
        if (effectiveSev === "S0") s0FailCount += 1;
        else if (effectiveSev === "S1") s1FailCount += 1;
        else s2FailCount += 1;
      }
    }

    const total = MECE_36_STEPS.length;
    const completed = passCount + failCount;
    const pendingCount = total - completed;
    const progressPct = Math.round((completed / total) * 100);

    let gateStatus: "GO" | "STOP_S0" | "HOLD_S1" | "GO_WITH_S2" | "IN_PROGRESS" = "IN_PROGRESS";
    if (s0FailCount > 0) {
      gateStatus = "STOP_S0";
    } else if (s1FailCount > 0) {
      gateStatus = "HOLD_S1";
    } else if (pendingCount === 0 && s2FailCount > 0) {
      gateStatus = "GO_WITH_S2";
    } else if (pendingCount === 0 && passCount === total) {
      gateStatus = "GO";
    }

    return {
      total,
      completed,
      passCount,
      failCount,
      pendingCount,
      s0FailCount,
      s1FailCount,
      s2FailCount,
      progressPct,
      gateStatus,
    };
  }, [records]);

  const axisProgressMap = useMemo(() => {
    const map: Record<
      MeceAxisId,
      { total: number; pass: number; fail: number; pending: number; firstStepIdx: number }
    > = {
      "axis-1": { total: 0, pass: 0, fail: 0, pending: 0, firstStepIdx: 0 },
      "axis-2": { total: 0, pass: 0, fail: 0, pending: 0, firstStepIdx: 0 },
      "axis-3": { total: 0, pass: 0, fail: 0, pending: 0, firstStepIdx: 0 },
      "axis-4": { total: 0, pass: 0, fail: 0, pending: 0, firstStepIdx: 0 },
      "axis-5": { total: 0, pass: 0, fail: 0, pending: 0, firstStepIdx: 0 },
      "axis-6": { total: 0, pass: 0, fail: 0, pending: 0, firstStepIdx: 0 },
    };

    MECE_36_STEPS.forEach((step, idx) => {
      const bucket = map[step.axisId];
      if (bucket.total === 0) bucket.firstStepIdx = idx;
      bucket.total += 1;
      const st = records[step.code]?.status ?? "PENDING";
      if (st === "PASS") bucket.pass += 1;
      else if (st === "FAIL") bucket.fail += 1;
      else bucket.pending += 1;
    });

    return map;
  }, [records]);

  const scrollStepIntoView = useCallback(() => {
    if (stepCardTopRef.current && typeof stepCardTopRef.current.scrollIntoView === "function") {
      stepCardTopRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  const goToStep = useCallback(
    (idx: number) => {
      const clamped = Math.max(0, Math.min(MECE_36_STEPS.length - 1, idx));
      setActiveStepIdx(clamped);
      setViewMode("walkthrough");
      window.requestAnimationFrame(() => scrollStepIntoView());
    },
    [scrollStepIntoView]
  );

  const updateStepStatus = useCallback(
    (code: string, status: CheckStatus) => {
      setRecords((prev) => {
        const existing = prev[code] ?? { status: "PENDING", note: "" };
        return {
          ...prev,
          [code]: {
            ...existing,
            status,
            checkedAt: status === "PENDING" ? undefined : new Date().toISOString(),
          },
        };
      });
    },
    []
  );

  const updateStepNote = useCallback((code: string, note: string) => {
    setRecords((prev) => {
      const existing = prev[code] ?? { status: "PENDING", note: "" };
      return {
        ...prev,
        [code]: {
          ...existing,
          note,
        },
      };
    });
  }, []);

  const updateStepSeverity = useCallback((code: string, severity: MeceSeverity) => {
    setRecords((prev) => {
      const existing = prev[code] ?? { status: "FAIL", note: "" };
      return {
        ...prev,
        [code]: {
          ...existing,
          overrideSeverity: severity,
        },
      };
    });
  }, []);

  const handlePassAndNext = useCallback(() => {
    updateStepStatus(activeStep.code, "PASS");
    if (activeStepIdx < MECE_36_STEPS.length - 1) {
      setActiveStepIdx(activeStepIdx + 1);
      window.requestAnimationFrame(() => scrollStepIntoView());
      showToast(`✅ [${activeStep.code}] PASS 완료 → 다음 문항(${MECE_36_STEPS[activeStepIdx + 1].code})으로 이동했습니다.`);
    } else {
      setViewMode("report");
      showToast(`🎉 36번 마지막 문항까지 점검 완료! 최종 판정 리포트를 확인하세요.`);
    }
  }, [activeStep.code, activeStepIdx, scrollStepIntoView, showToast, updateStepStatus]);

  const handleMarkFail = useCallback(() => {
    updateStepStatus(activeStep.code, "FAIL");
    showToast(`❌ [${activeStep.code}] 결함(FAIL)으로 표시되었습니다. 아래 메모란에 증상을 기록해 주세요.`);
    window.setTimeout(() => {
      noteInputRef.current?.focus();
    }, 60);
  }, [activeStep.code, showToast, updateStepStatus]);

  const handleMarkAxisAllPass = useCallback(
    (axisId: MeceAxisId, axisTitle: string) => {
      const now = new Date().toISOString();
      setRecords((prev) => {
        const next = { ...prev };
        for (const step of MECE_36_STEPS) {
          if (step.axisId === axisId) {
            const existing = next[step.code] ?? { status: "PENDING", note: "" };
            next[step.code] = { ...existing, status: "PASS", checkedAt: now };
          }
        }
        return next;
      });
      showToast(`✅ [${axisTitle}] 전체 문항이 PASS로 체크되었습니다.`);
    },
    [showToast]
  );

  const handleResetAll = useCallback(() => {
    if (!resetArmed) {
      setResetArmed(true);
      showToast(`⚠️ 한 번 더 [초기화 확정]을 누르면 모든 체크 기록과 타이머가 초기화됩니다.`);
      window.setTimeout(() => setResetArmed(false), 4000);
      return;
    }
    setRecords({});
    setElapsedSeconds(0);
    setIsTimerRunning(false);
    setActiveStepIdx(0);
    setOverallComment("");
    setProbeResult(null);
    setSeedResult(null);
    setServerSyncStatus("idle");
    setSessionId(createQaSessionId());
    setResetArmed(false);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    showToast(`↺ 전체 점검 기록과 타이머가 초기화되었습니다.`);
  }, [resetArmed, showToast]);

  // Debounced auto-sync to server after user interaction (1500ms, JSDOM-safe)
  useEffect(() => {
    if (!hydrated) return;
    if (stats.completed === 0 && overallComment.trim().length === 0) return;
    if (typeof fetch !== "function") return;

    const timerId = window.setTimeout(() => {
      if (!isMountedRef.current || typeof fetch !== "function") return;
      setServerSyncStatus("syncing");
      try {
        const reqPromise = fetch("/api/public/qa-workbench", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "sync",
            workbenchId: WORKBENCH_ID,
            sessionId,
            testerName,
            testerOrg,
            records,
            scratchLinks,
            overallComment,
            elapsedSeconds: elapsedSecondsRef.current,
          }),
        });
        if (!reqPromise || typeof reqPromise.then !== "function") {
          if (isMountedRef.current) setServerSyncStatus("idle");
          return;
        }
        reqPromise
          .then((res) => {
            if (!isMountedRef.current) return;
            setServerSyncStatus(res && res.ok ? "synced" : "idle");
          })
          .catch(() => {
            if (isMountedRef.current) setServerSyncStatus("idle");
          });
      } catch {
        if (isMountedRef.current) setServerSyncStatus("idle");
      }
    }, 1500);

    return () => window.clearTimeout(timerId);
  }, [
    hydrated,
    stats.completed,
    records,
    overallComment,
    testerName,
    testerOrg,
    scratchLinks,
    sessionId,
  ]);

  const handleSubmitToServer = useCallback(async () => {
    if (typeof fetch !== "function") {
      showToast("⚠️ 현재 환경에서는 로컬 저장 모드로 동작합니다.");
      return;
    }
    setIsSubmittingServer(true);
    setServerSyncStatus("syncing");
    try {
      const reqPromise = fetch("/api/public/qa-workbench", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "submit",
          workbenchId: WORKBENCH_ID,
          sessionId,
          testerName,
          testerOrg,
          records,
          scratchLinks,
          overallComment,
          elapsedSeconds: elapsedSecondsRef.current,
        }),
      });
      if (!reqPromise || typeof reqPromise.then !== "function") {
        if (isMountedRef.current) setServerSyncStatus("idle");
        return;
      }
      const res = await reqPromise;
      if (!isMountedRef.current) return;
      if (res && res.ok) {
        setServerSyncStatus("submitted");
        showToast(`☁️ 서버에 검수결과가 제출되었습니다! (세션: ${sessionId})`);
      } else {
        setServerSyncStatus("idle");
        showToast("⚠️ 서버 제출 중 응답 오류가 발생했습니다. 로컬 기록은 유지됩니다.");
      }
    } catch {
      if (isMountedRef.current) {
        setServerSyncStatus("idle");
        showToast("⚠️ 네트워크 오류로 서버 제출에 실패했습니다. 로컬 기록은 유지됩니다.");
      }
    } finally {
      if (isMountedRef.current) {
        setIsSubmittingServer(false);
      }
    }
  }, [overallComment, records, scratchLinks, sessionId, showToast, testerName, testerOrg]);

  const handleRunLiveProbe = useCallback(async () => {
    if (typeof fetch !== "function") {
      showToast("⚠️ 현재 환경에서는 실시간 서버 검증을 호출할 수 없습니다.");
      return;
    }
    setIsProbing(true);
    try {
      const reqPromise = fetch("/api/public/qa-workbench", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "probe",
          publicNewsletterUrl: scratchLinks.newsletterUrl,
          imShareUrl: scratchLinks.imTokenUrl,
          testClientContact: scratchLinks.testClientContact,
        }),
      });
      if (!reqPromise || typeof reqPromise.then !== "function") {
        return;
      }
      const res = await reqPromise;
      if (!isMountedRef.current) return;
      if (!res || !res.ok) {
        showToast("⚠️ 자동 검증 요청 처리 중 오류가 발생했습니다.");
        return;
      }
      const data = (await res.json()) as LiveProbeResponse;
      if (!isMountedRef.current) return;
      setProbeResult(data);
      if (!data.newsletterCheck && !data.shareLinkCheck && !data.subscriberCheck) {
        showToast("💡 보관함에 공개 뉴스레터 URL·전용 IM 링크·구독 연락처 중 1개 이상을 입력한 뒤 다시 눌러 주세요.");
      } else {
        showToast("🔍 공개 URL · 잠금 상태 · 구독 DB 실시간 자동 검증이 완료되었습니다.");
      }
    } catch {
      if (isMountedRef.current) {
        showToast("⚠️ 자동 검증 호출 중 네트워크 오류가 발생했습니다.");
      }
    } finally {
      if (isMountedRef.current) {
        setIsProbing(false);
      }
    }
  }, [scratchLinks, showToast]);

  const handleSeedAxis456 = useCallback(async () => {
    if (typeof fetch !== "function") {
      showToast("⚠️ 현재 환경에서는 테스트 시드 API를 호출할 수 없습니다.");
      return;
    }
    setIsSeedingAxis456(true);
    try {
      const reqPromise = fetch("/api/public/qa-workbench", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "seed_axis456" }),
      });
      if (!reqPromise || typeof reqPromise.then !== "function") {
        return;
      }
      const res = await reqPromise;
      if (!isMountedRef.current) return;
      if (res.status === 401 || res.status === 403) {
        showToast("🔐 먼저 창 A에서 중개사 계정으로 로그인한 뒤 [원클릭 생성]을 눌러 주세요.");
        return;
      }
      const data = await res.json().catch(() => null);
      if (!isMountedRef.current) return;
      if (res.ok && data?.ok) {
        const seededContact = String(data.seededSubscriberContact || "010-7777-6666");
        setSeedResult({
          seededInquiryId: data.seededInquiryId || null,
          seededBuildingId: data.seededBuildingId || null,
          seededSubscriberContact: seededContact,
          message:
            data.message ||
            "테스트 문의 및 구독 시드가 생성되었습니다. 소통관리함(/broker/w/inbox)에서 바로 확인하세요!",
        });
        setScratchLinks((prev) =>
          prev.testClientContact.trim()
            ? prev
            : { ...prev, testClientContact: seededContact }
        );
        showToast("⚡ Axis 4~6 테스트 문의·구독 원클릭 시드가 생성되었습니다!");
      } else {
        showToast(`⚠️ 시드 생성 실패: ${data?.error || "잠시 후 다시 시도해 주세요."}`);
      }
    } catch {
      if (isMountedRef.current) {
        showToast("⚠️ 시드 생성 요청 중 네트워크 오류가 발생했습니다.");
      }
    } finally {
      if (isMountedRef.current) {
        setIsSeedingAxis456(false);
      }
    }
  }, [showToast]);

  // Keyboard shortcuts in walkthrough mode (when not typing inside input/textarea/select)
  useEffect(() => {
    if (viewMode !== "walkthrough") return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        handlePassAndNext();
      } else if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        handleMarkFail();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (activeStepIdx < MECE_36_STEPS.length - 1) {
          setActiveStepIdx((prev) => prev + 1);
        }
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (activeStepIdx > 0) {
          setActiveStepIdx((prev) => prev - 1);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [viewMode, activeStepIdx, handlePassAndNext, handleMarkFail]);

  const filteredSidebarSteps = useMemo(() => {
    return MECE_36_STEPS.map((step, idx) => ({ step, idx })).filter(({ step }) => {
      const st = records[step.code]?.status ?? "PENDING";
      if (stepFilter === "pending") return st === "PENDING";
      if (stepFilter === "fail") return st === "FAIL";
      if (stepFilter === "s0") return step.severity === "S0";
      return true;
    });
  }, [records, stepFilter]);

  const filteredMatrixAxes = useMemo(() => {
    const q = matrixSearch.trim().toLowerCase();
    return MECE_AXES.map((axis) => {
      const items = MECE_36_STEPS.map((step, idx) => ({ step, idx })).filter(({ step }) => {
        if (step.axisId !== axis.id) return false;
        const st = records[step.code]?.status ?? "PENDING";
        if (stepFilter === "pending" && st !== "PENDING") return false;
        if (stepFilter === "fail" && st !== "FAIL") return false;
        if (stepFilter === "s0" && step.severity !== "S0") return false;
        if (!q) return true;
        return (
          step.code.toLowerCase().includes(q) ||
          step.title.toLowerCase().includes(q) ||
          step.bugContext.toLowerCase().includes(q) ||
          step.actionSteps.some((a) => a.toLowerCase().includes(q))
        );
      });
      return { axis, items };
    }).filter((group) => group.items.length > 0);
  }, [matrixSearch, records, stepFilter]);

  const generateReportMarkdown = useCallback((): string => {
    const verdictLabel =
      stats.gateStatus === "GO"
        ? "🟢 상용화 최종 승인 (GO — 36/36 전 문항 PASS)"
        : stats.gateStatus === "GO_WITH_S2"
          ? "🟢 조건부 상용화 승인 (S2 경미 의견 백로그 편입)"
          : stats.gateStatus === "STOP_S0"
            ? `🔴 즉시 출시 중단 (S0 Blocker 결함 ${stats.s0FailCount}건 발견)`
            : stats.gateStatus === "HOLD_S1"
              ? `🟠 당일 핫픽스 후 재승인 필요 (S1 Critical 결함 ${stats.s1FailCount}건)`
              : `⏳ 점검 진행 중 (완료 ${stats.completed}/${stats.total} · 미점검 ${stats.pendingCount}건)`;

    const lines: string[] = [
      `# 뉴스레터 · 소통관리함 상용화 MECE 완전 점검 결과서`,
      ``,
      `- **검수자**: ${testerName || "-"}`,
      `- **검수 일시**: ${new Date().toLocaleString("ko-KR")}`,
      `- **소요 시간**: ${formatDuration(elapsedSeconds)} (기준 40분)`,
      `- **최종 판정**: **${verdictLabel}**`,
      `- **집계 요약**: 총 ${stats.total}문항 중 ✅ PASS ${stats.passCount}건 / ❌ FAIL ${stats.failCount}건 (S0: ${stats.s0FailCount}, S1: ${stats.s1FailCount}, S2: ${stats.s2FailCount}) / ⏳ 미점검 ${stats.pendingCount}건`,
      ``,
      `## 1. 6대 MECE 축별 달성 현황`,
      `| 축 | 영역 | 통과 / 전체 | FAIL | 미점검 |`,
      `|:---|:---|:---:|:---:|:---:|`,
    ];

    for (const axis of MECE_AXES) {
      const p = axisProgressMap[axis.id];
      lines.push(
        `| 축 ${axis.axisNumber}. ${axis.shortTitle} | ${axis.domainBadge} | ${p.pass} / ${p.total} | ${p.fail}건 | ${p.pending}건 |`
      );
    }

    const failOrNoted = MECE_36_STEPS.filter((s) => {
      const r = records[s.code];
      return r && (r.status === "FAIL" || r.note.trim().length > 0);
    });

    lines.push(``, `## 2. 결함(FAIL) 및 주요 관찰 메모 (${failOrNoted.length}건)`);
    if (failOrNoted.length === 0) {
      lines.push(`- 특이 결함 및 관찰 메모 없음.`);
    } else {
      for (const s of failOrNoted) {
        const r = records[s.code]!;
        const sev = r.overrideSeverity ?? s.severity;
        lines.push(
          `- **[${s.code}] (${r.status} · ${sev}) ${s.title}**: ${r.note.trim() || "(상세 메모 미기재)"}`
        );
      }
    }

    if (overallComment.trim()) {
      lines.push(``, `## 3. 검수자 총평`, overallComment.trim());
    }

    lines.push(``, `## 4. 36문항 전수 상세 기록`);
    for (const s of MECE_36_STEPS) {
      const st = records[s.code]?.status ?? "PENDING";
      const mark = st === "PASS" ? "✅ PASS" : st === "FAIL" ? "❌ FAIL" : "⬜ PENDING";
      const memo = records[s.code]?.note?.trim();
      lines.push(`- ${mark} | **[${s.code}]** ${s.title}${memo ? ` — _${memo}_` : ""}`);
    }

    return lines.join("\n");
  }, [axisProgressMap, elapsedSeconds, overallComment, records, stats, testerName]);

  const handleDownloadReportMd = useCallback(() => {
    const md = generateReportMarkdown();
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `credeal-newsletter-inbox-mece-signoff-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(() => URL.revokeObjectURL(url), 2500);
    showToast(`⬇️ 점검 결과서(.md) 다운로드가 완료되었습니다.`);
  }, [generateReportMarkdown, showToast]);

  const renderVerdictBadge = () => {
    if (stats.gateStatus === "GO") {
      return (
        <span
          data-testid="verdict-badge"
          className="px-3 py-1 rounded-full bg-emerald-600 text-white text-xs sm:text-sm font-extrabold"
        >
          🟢 상용화 승인 가능 (36/36 GO)
        </span>
      );
    }
    if (stats.gateStatus === "GO_WITH_S2") {
      return (
        <span
          data-testid="verdict-badge"
          className="px-3 py-1 rounded-full bg-emerald-600 text-white text-xs sm:text-sm font-extrabold"
        >
          🟢 승인 가능 (S2 경미 {stats.s2FailCount}건)
        </span>
      );
    }
    if (stats.gateStatus === "STOP_S0") {
      return (
        <span
          data-testid="verdict-badge"
          className="px-3 py-1 rounded-full bg-rose-600 text-white text-xs sm:text-sm font-extrabold"
        >
          🔴 출시 중단 (S0 치명 {stats.s0FailCount}건)
        </span>
      );
    }
    if (stats.gateStatus === "HOLD_S1") {
      return (
        <span
          data-testid="verdict-badge"
          className="px-3 py-1 rounded-full bg-amber-500 text-slate-950 text-xs sm:text-sm font-extrabold"
        >
          🟠 당일 핫픽스 필요 (S1 {stats.s1FailCount}건)
        </span>
      );
    }
    return (
      <span
        data-testid="verdict-badge"
        className="px-3 py-1 rounded-full bg-slate-800 text-white text-xs sm:text-sm font-extrabold"
      >
        🔵 점검 진행 중 ({stats.completed}/{stats.total})
      </span>
    );
  };

  const renderSyncBadgePill = (testId?: string) => {
    const label = getSyncStatusLabel(serverSyncStatus);
    const toneClass =
      serverSyncStatus === "submitted"
        ? "bg-indigo-600 text-white border-indigo-700"
        : serverSyncStatus === "synced"
          ? "bg-emerald-50 text-emerald-900 border-emerald-300"
          : serverSyncStatus === "syncing"
            ? "bg-blue-50 text-blue-900 border-blue-300"
            : "bg-slate-100 text-slate-700 border-slate-300";

    return (
      <span
        {...(testId ? { "data-testid": testId } : {})}
        className={`px-2.5 py-1 rounded-xl border text-xs font-extrabold inline-flex items-center gap-1 ${toneClass}`}
      >
        <span>☁️</span>
        <span>{label}</span>
      </span>
    );
  };

  const renderLiveAutoVerifierPanel = (primaryTestIds: boolean) => {
    const nl = probeResult?.newsletterCheck;
    const sl = probeResult?.shareLinkCheck;
    const sub = probeResult?.subscriberCheck;

    const renderBadge = (state: "PASS" | "FAIL" | "WARN" | "IDLE", text: string) => {
      if (state === "PASS") {
        return (
          <span className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-xs font-extrabold shrink-0">
            ✅ {text}
          </span>
        );
      }
      if (state === "FAIL") {
        return (
          <span className="px-2.5 py-1 rounded-lg bg-rose-600 text-white text-xs font-extrabold shrink-0">
            ❌ {text}
          </span>
        );
      }
      if (state === "WARN") {
        return (
          <span className="px-2.5 py-1 rounded-lg bg-amber-500 text-slate-950 text-xs font-extrabold shrink-0">
            🔒 {text}
          </span>
        );
      }
      return (
        <span className="px-2.5 py-1 rounded-lg bg-slate-200 text-slate-700 text-xs font-extrabold shrink-0">
          ⏳ {text}
        </span>
      );
    };

    return (
      <div className="p-4 rounded-2xl bg-slate-50 border-2 border-indigo-200 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div>
            <h3 className="text-sm sm:text-base font-black text-slate-900">
              🔍 공개 URL · 잠금 상태 · 구독 DB 실시간 자동 검증기 (Live Auto-Verifier)
            </h3>
            <p className="text-xs text-slate-600 font-medium">
              보관함에 입력된 공개 뉴스레터 URL·전용 IM 링크·구독 연락처를 서버 DB 및 마스킹 산출물 기준으로 즉시 자동 진단합니다.
            </p>
          </div>
          <button
            type="button"
            data-testid={primaryTestIds ? "btn-run-live-probe" : "btn-run-live-probe-vault"}
            disabled={isProbing}
            onClick={() => void handleRunLiveProbe()}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-[#4338CA] hover:bg-[#3730A3] disabled:opacity-60 text-white text-xs sm:text-sm font-extrabold cursor-pointer shadow-xs transition"
          >
            {isProbing
              ? "🔍 실시간 검증 중..."
              : "🔍 공개 URL · 잠금 상태 자동 검증"}
          </button>
        </div>

        <div
          data-testid={primaryTestIds ? "live-probe-results" : "live-probe-results-vault"}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-2.5"
        >
          {/* 1. Address Blind Check */}
          <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-1.5 flex flex-col justify-between">
            <div className="text-xs font-black text-slate-900">
              뉴스레터 지번·도로명 번지 블라인드 (NL-302 / SEC-603)
            </div>
            <div className="space-y-1">
              {!nl
                ? renderBadge("IDLE", "URL 입력 대기")
                : !nl.validUrl || !nl.existsAndPublished
                  ? renderBadge("FAIL", nl.error || "미발행·경로 오류")
                  : nl.addressBlindPass
                    ? renderBadge("PASS", "PASS (번지 마스킹 정상)")
                    : renderBadge("FAIL", "FAIL (번지 노출 감지)")}
              {nl && nl.offendingAddresses?.length > 0 && (
                <div className="text-[11px] font-bold text-rose-700 break-all">
                  노출 문자열: {nl.offendingAddresses.join(", ")}
                </div>
              )}
            </div>
          </div>

          {/* 2. Broker Phone Format Check */}
          <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-1.5 flex flex-col justify-between">
            <div className="text-xs font-black text-slate-900">
              중개사 전화번호(tel:) 포맷 무결성
            </div>
            <div>
              {!nl
                ? renderBadge("IDLE", "URL 입력 대기")
                : !nl.validUrl || !nl.existsAndPublished
                  ? renderBadge("FAIL", "발행본 미확인")
                  : nl.brokerPhonePass
                    ? renderBadge("PASS", "PASS (@ 혼입 없음)")
                    : renderBadge("FAIL", "FAIL (이메일 @ 혼입)")}
            </div>
          </div>

          {/* 3. Raw UUID Non-Exposure Check */}
          <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-1.5 flex flex-col justify-between">
            <div className="text-xs font-black text-slate-900">
              UUID 폴백 비노출 (NL-305)
            </div>
            <div className="space-y-1">
              {!nl
                ? renderBadge("IDLE", "URL 입력 대기")
                : !nl.validUrl || !nl.existsAndPublished
                  ? renderBadge("FAIL", "발행본 미확인")
                  : nl.noRawUuidPass
                    ? renderBadge("PASS", "PASS (UUID 노출 0건)")
                    : renderBadge("FAIL", "FAIL (생 UUID 노출)")}
              {nl && nl.offendingUuidTitles?.length > 0 && (
                <div className="text-[11px] font-bold text-rose-700 break-all">
                  검출: {nl.offendingUuidTitles.join(", ")}
                </div>
              )}
            </div>
          </div>

          {/* 4. IM Share Link Open/Lock Status */}
          <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-1.5 flex flex-col justify-between">
            <div className="text-xs font-black text-slate-900">
              IM 공유 링크 열람/잠금 상태 (IB-505 / SEC-601)
            </div>
            <div className="space-y-1">
              {!sl
                ? renderBadge("IDLE", "IM 링크 입력 대기")
                : !sl.validUrl
                  ? renderBadge("FAIL", sl.error || "URL 오류")
                  : sl.isLocked
                    ? renderBadge("WARN", sl.statusLabel)
                    : renderBadge("PASS", sl.statusLabel)}
              {sl && sl.validUrl && (
                <div className="text-[11px] font-semibold text-slate-600">
                  매물: {sl.buildingId} · {sl.hasToken ? "전용 토큰 포함" : "일반 공개 경로"}
                </div>
              )}
            </div>
          </div>

          {/* 5. Public Subscriber DB Inflow Check */}
          <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-1.5 flex flex-col justify-between">
            <div className="text-xs font-black text-slate-900">
              공개 구독자 DB 유입 상태 (NL-304 / IB-403)
            </div>
            <div className="space-y-1">
              {!sub
                ? renderBadge("IDLE", "연락처 입력 대기")
                : sub.foundInMagazineSubscribers
                  ? renderBadge(
                      "PASS",
                      `PASS (${sub.confirmStatus || "유입 확인"})`
                    )
                  : renderBadge("FAIL", "미검출 (구독 DB 없음)")}
              {sub && (
                <div className="text-[11px] font-semibold text-slate-600">
                  고객목록 연동: {sub.foundInBrokerClients ? "확인됨 ✓" : "미연동/비로그인"}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      data-testid="newsletter-inbox-test-workbench"
      className="min-h-screen bg-[#F1F5F9] text-[#0F172A] pb-28 font-sans antialiased selection:bg-blue-200 selection:text-slate-950"
    >
      {/* Floating Toast Notification */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 max-w-md bg-[#0F172A] text-white px-4 py-3.5 rounded-2xl shadow-2xl border border-slate-700 text-sm sm:text-base font-bold flex items-center gap-2.5 print:hidden"
        >
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ──────── STICKY TOP COMMAND HEADER ──────── */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-xs print:static print:shadow-none">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 space-y-2.5">
          {/* Top Row: Title + Quick Workspace Launchers */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-[#1D4ED8] text-white font-black text-lg shadow-xs shrink-0">
                ✓
              </span>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-base sm:text-xl font-black text-slate-900 tracking-tight">
                    뉴스레터 · 소통관리함 상용화 완전 점검 가이드 (MECE)
                  </h1>
                  <span className="px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-950 text-xs font-extrabold border border-indigo-200">
                    6대 축 · 36문항 클릭 스루
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-600 font-medium">
                  단 한 번의 40분 실행 동선으로 시인성·주기 전환·문장 완결성·링크 잠금·PIPA·계정 격리까지 100% 검증합니다.
                </p>
              </div>
            </div>

            {/* Direct Target Workspace Launchers */}
            <div className="flex flex-wrap items-center gap-1.5 print:hidden">
              <a
                href="/broker/w/newsletter"
                target="_blank"
                rel="noopener noreferrer"
                data-testid="header-launch-newsletter"
                className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[#4338CA] hover:bg-[#3730A3] text-white text-xs sm:text-sm font-extrabold transition inline-flex items-center gap-1.5 shadow-2xs"
              >
                <span>📰 뉴스레터 에디터 ↗</span>
              </a>
              <a
                href="/broker/w/inbox"
                target="_blank"
                rel="noopener noreferrer"
                data-testid="header-launch-inbox"
                className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[#059669] hover:bg-[#047857] text-white text-xs sm:text-sm font-extrabold transition inline-flex items-center gap-1.5 shadow-2xs"
              >
                <span>💬 소통관리함 ↗</span>
              </a>
              <a
                href="/broker/w/dealcards"
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[40px] px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-900 border border-slate-300 text-xs sm:text-sm font-bold transition inline-flex items-center"
              >
                <span>🃏 딜카드 ↗</span>
              </a>
              <a
                href="/broker/w/im"
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[40px] px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-900 border border-slate-300 text-xs sm:text-sm font-bold transition inline-flex items-center"
              >
                <span>📊 IM 스튜디오 ↗</span>
              </a>
              <a
                href="/qa-signoff"
                data-testid="open-qa-signoff-hub"
                className="min-h-[44px] px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-extrabold shadow-xs transition inline-flex items-center whitespace-nowrap"
              >
                <span>⚡ 20분 고속 검수 허브 ↗</span>
              </a>
            </div>
          </div>

          {/* Second Row: Progress Bar + Verdict + Stopwatch + Server Sync + View Mode Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1 border-t border-slate-100 print:hidden">
            {/* Progress & Counters */}
            <div className="flex flex-wrap items-center gap-2">
              {renderVerdictBadge()}
              <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 text-xs sm:text-sm font-bold text-slate-800">
                <span>진행률 {stats.progressPct}%</span>
                <div className="w-20 sm:w-24 h-2.5 bg-slate-300 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#1D4ED8] transition-all duration-300"
                    style={{ width: `${stats.progressPct}%` }}
                  />
                </div>
                <span className="text-emerald-700 font-extrabold" data-testid="header-pass-count">
                  PASS {stats.passCount}
                </span>
                <span className="text-slate-300">|</span>
                <span className="text-rose-700 font-extrabold" data-testid="header-fail-count">
                  FAIL {stats.failCount}
                </span>
                <span className="text-slate-300">|</span>
                <span className="text-slate-600">미점검 {stats.pendingCount}</span>
              </div>

              {/* 40m Stopwatch */}
              <div className="flex items-center gap-1.5 bg-[#0F172A] text-white px-3 py-1.5 rounded-xl text-xs sm:text-sm">
                <span className="font-bold text-amber-300">⏱️</span>
                <span className="font-mono font-extrabold text-emerald-400">
                  {formatDuration(elapsedSeconds)}
                </span>
                <span className="text-slate-400 text-xs hidden sm:inline">
                  / {Math.floor(TARGET_TOTAL_SECONDS / 60)}분
                </span>
                <button
                  type="button"
                  onClick={() => setIsTimerRunning((p) => !p)}
                  className={`ml-1 px-2.5 py-0.5 rounded-lg text-xs font-extrabold cursor-pointer transition ${
                    isTimerRunning
                      ? "bg-amber-400 text-slate-950 hover:bg-amber-300"
                      : "bg-emerald-600 text-white hover:bg-emerald-500"
                  }`}
                >
                  {isTimerRunning ? "⏸ 정지" : "▶ 시작"}
                </button>
              </div>

              {/* Server Sync Status & Direct Submit */}
              {renderSyncBadgePill("qa-server-sync-status")}
              <button
                type="button"
                data-testid="btn-submit-qa-server"
                disabled={isSubmittingServer}
                onClick={() => void handleSubmitToServer()}
                className="min-h-[36px] px-3 py-1 rounded-xl bg-indigo-700 hover:bg-indigo-800 disabled:opacity-60 text-white text-xs font-extrabold cursor-pointer shadow-2xs transition"
              >
                {isSubmittingServer ? "☁️ 제출 중..." : "☁️ 서버에 검수결과 제출"}
              </button>
            </div>

            {/* 3 View Mode Tabs */}
            <div
              role="tablist"
              aria-label="점검 화면 보기 모드"
              className="inline-flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 gap-1"
            >
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === "walkthrough"}
                data-testid="mode-tab-walkthrough"
                onClick={() => setViewMode("walkthrough")}
                className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs sm:text-sm font-extrabold cursor-pointer transition ${
                  viewMode === "walkthrough"
                    ? "bg-[#1D4ED8] text-white shadow-2xs"
                    : "bg-transparent text-slate-700 hover:bg-white"
                }`}
              >
                🎯 클릭 스루 실행
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === "matrix"}
                data-testid="mode-tab-matrix"
                onClick={() => setViewMode("matrix")}
                className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs sm:text-sm font-extrabold cursor-pointer transition ${
                  viewMode === "matrix"
                    ? "bg-[#1D4ED8] text-white shadow-2xs"
                    : "bg-transparent text-slate-700 hover:bg-white"
                }`}
              >
                📋 6대 축 전체 시트
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === "report"}
                data-testid="mode-tab-report"
                onClick={() => setViewMode("report")}
                className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs sm:text-sm font-extrabold cursor-pointer transition ${
                  viewMode === "report"
                    ? "bg-[#1D4ED8] text-white shadow-2xs"
                    : "bg-transparent text-slate-700 hover:bg-white"
                }`}
              >
                📄 최종 판정 리포트
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ──────── MAIN CONTAINER ──────── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-5 space-y-5">
        {/* Utility Toggle Strip: 2-Window Setup & Link Vault */}
        <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="toggle-setup-guide-btn"
              onClick={() => setShowSetupGuide((p) => !p)}
              className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-900 border border-slate-300 text-xs sm:text-sm font-extrabold cursor-pointer inline-flex items-center gap-1.5 shadow-2xs"
            >
              <span>🧭 사전 2창 셋업 & 6대 즉시 탈락 기준 {showSetupGuide ? "접기 ▲" : "펼치기 ▼"}</span>
            </button>
            <button
              type="button"
              data-testid="toggle-link-vault-btn"
              onClick={() => setShowLinkVault((p) => !p)}
              className={`min-h-[40px] px-3.5 py-1.5 rounded-xl border text-xs sm:text-sm font-extrabold cursor-pointer inline-flex items-center gap-1.5 shadow-2xs transition ${
                showLinkVault
                  ? "bg-[#0F172A] text-white border-slate-900"
                  : "bg-white hover:bg-slate-50 text-slate-900 border-slate-300"
              }`}
            >
              <span>🔗 내 테스트 링크 보관함 · 자동 검증기 {showLinkVault ? "접기 ▲" : "열기 ▼"}</span>
            </button>
          </div>

          <a
            href="/testguide"
            className="text-xs sm:text-sm font-bold text-slate-600 hover:text-blue-700 underline underline-offset-4"
          >
            기존 통합 IM 검수 워크벤치(/testguide) 보기 →
          </a>
        </div>

        {/* Collapsible Scratch Link Vault + 1-Click Axis 4~6 Seeder + Live Auto-Verifier */}
        {showLinkVault && (
          <section
            data-testid="scratch-link-vault"
            className="bg-white rounded-2xl border-2 border-slate-800 p-5 shadow-sm space-y-4 print:hidden"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
                  🔗 내 테스트 링크 임시 보관함 & 실시간 자동 검증기 (자동 저장됨)
                </h2>
                <p className="text-xs sm:text-sm text-slate-600">
                  점검 도중 함정 문구를 복사하느라 클립보드 URL이 덮어써지지 않도록 보관하고, 원클릭 시드 생성 및 실시간 DB·블라인드 검증을 실행하세요.
                </p>
              </div>
              <button
                type="button"
                data-testid="btn-seed-axis456"
                disabled={isSeedingAxis456}
                onClick={() => void handleSeedAxis456()}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-[#059669] hover:bg-[#047857] disabled:opacity-60 text-white text-xs sm:text-sm font-extrabold cursor-pointer shadow-xs transition"
              >
                {isSeedingAxis456
                  ? "⚡ 테스트 시드 생성 중..."
                  : "⚡ Axis 4~6 테스트 문의·구독 원클릭 생성"}
              </button>
            </div>

            {seedResult && (
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-300 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs sm:text-sm font-bold text-emerald-950">
                  {seedResult.message}
                </div>
                <a
                  href="/broker/w/inbox"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-extrabold inline-flex items-center gap-1.5 shrink-0"
                >
                  <span>💬 소통관리함(/broker/w/inbox) 바로 열기 ↗</span>
                </a>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
              {[
                {
                  key: "newsletterUrl" as const,
                  label: "① 공개 뉴스레터 URL (NL-303~306, SEC-601)",
                  placeholder: "https://www.credeal.net/magazine/...",
                  inputType: "url" as const,
                },
                {
                  key: "dealcardUrl" as const,
                  label: "② 공개 딜카드 URL (NL-305, IB-401)",
                  placeholder: "https://www.credeal.net/dc/...",
                  inputType: "url" as const,
                },
                {
                  key: "imTokenUrl" as const,
                  label: "③ 승인된 전용 IM 링크 (IB-501~504)",
                  placeholder: "https://www.credeal.net/im-lite/...?token=slk...",
                  inputType: "url" as const,
                },
                {
                  key: "testClientContact" as const,
                  label: "④ 테스트 구독·문의 연락처 (NL-304, IB-403)",
                  placeholder: "010-7777-6666 또는 qa-sub@credeal.test",
                  inputType: "text" as const,
                },
              ].map((slot) => (
                <div
                  key={slot.key}
                  className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2"
                >
                  <label className="block text-xs sm:text-sm font-extrabold text-slate-800">
                    {slot.label}
                  </label>
                  <input
                    type={slot.inputType}
                    value={scratchLinks[slot.key]}
                    onChange={(e) =>
                      setScratchLinks((prev) => ({ ...prev, [slot.key]: e.target.value }))
                    }
                    placeholder={slot.placeholder}
                    className="w-full px-3 py-2 rounded-lg bg-white text-slate-900 border border-slate-300 text-sm font-mono focus:border-blue-600 focus:outline-none"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        handleCopy(scratchLinks[slot.key], slot.label, `vault-${slot.key}`)
                      }
                      className="flex-1 min-h-[38px] px-3 py-1.5 rounded-lg bg-[#0F172A] hover:bg-slate-800 text-white text-xs font-extrabold cursor-pointer"
                    >
                      {copiedId === `vault-${slot.key}` ? "✅ 복사됨!" : "📋 복사"}
                    </button>
                    {(scratchLinks[slot.key].trim().startsWith("http") ||
                      scratchLinks[slot.key].trim().startsWith("/")) && (
                      <a
                        href={scratchLinks[slot.key].trim()}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-h-[38px] px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold inline-flex items-center"
                      >
                        열기 ↗
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {renderLiveAutoVerifierPanel(viewMode !== "report")}
          </section>
        )}

        {/* Collapsible Section 1: 3-Minute 2-Window Setup & 6 Red Flag Oracles */}
        {showSetupGuide && (
          <section
            data-testid="setup-and-oracles-panel"
            className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3.5">
              <div>
                <span className="inline-block px-2.5 py-0.5 rounded-md bg-blue-50 text-blue-900 border border-blue-200 text-xs font-extrabold mb-1">
                  STEP 0 · 사전 준비 (3분 셋업)
                </span>
                <h2 className="text-lg sm:text-xl font-black text-slate-900">
                  1인 테스터 기준 2창 셋업 & 어느 화면에서든 즉시 탈락(FAIL)시키는 6대 공통 기준
                </h2>
              </div>
              <button
                type="button"
                onClick={() =>
                  handleCopy("https://www.credeal.net", "운영 사이트 주소", "copy-prod-url")
                }
                className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-[#0F172A] hover:bg-slate-800 text-white text-xs sm:text-sm font-extrabold cursor-pointer print:hidden"
              >
                {copiedId === "copy-prod-url"
                  ? "✅ 주소 복사됨!"
                  : "📋 credeal.net 주소 복사 (시크릿 창 붙여넣기용)"}
              </button>
            </div>

            {/* 2-Window Setup Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {WINDOW_SETUP_CARDS.map((w, idx) => (
                <div
                  key={w.id}
                  className={`p-4 rounded-xl border-2 space-y-1.5 ${
                    idx === 0
                      ? "bg-blue-50/50 border-blue-200"
                      : "bg-amber-50/50 border-amber-200"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span
                      className={`px-2.5 py-0.5 rounded-md text-xs font-extrabold ${
                        idx === 0
                          ? "bg-blue-700 text-white"
                          : "bg-amber-800 text-white"
                      }`}
                    >
                      {w.badge}
                    </span>
                    <span className="text-xs font-bold text-slate-600">{w.viewport}</span>
                  </div>
                  <div className="text-base font-extrabold text-slate-900">{w.role}</div>
                  <p className="text-sm text-slate-700 leading-relaxed">{w.instruction}</p>
                </div>
              ))}
            </div>

            {/* 6 Red Flag Common Oracles */}
            <div className="space-y-2.5">
              <div className="text-sm sm:text-base font-extrabold text-rose-900 flex items-center gap-1.5">
                <span>🚨</span>
                <span>어느 화면에서든 발견 즉시 FAIL 처리하는 6대 공통 오라클</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {RED_FLAG_ORACLES.map((rf) => (
                  <div
                    key={rf.id}
                    className="p-3.5 rounded-xl bg-rose-50/45 border border-rose-200 space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-black text-slate-900">
                        {rf.number}. {rf.title}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-900 text-[11px] font-extrabold">
                        {rf.badge}
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
                      {rf.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ──────── 6-AXIS INTERACTIVE FLOW MAP (Always visible in Walkthrough & Matrix) ──────── */}
        {viewMode !== "report" && (
          <section aria-label="MECE 6대 점검 축 진행 현황" className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
            {MECE_AXES.map((axis) => {
              const prog = axisProgressMap[axis.id];
              const isCurrentAxis = viewMode === "walkthrough" && activeAxis.id === axis.id;
              const isAllDone = prog.pass === prog.total && prog.total > 0;
              const hasFail = prog.fail > 0;

              return (
                <button
                  key={axis.id}
                  type="button"
                  data-testid={`axis-pill-${axis.axisNumber}`}
                  onClick={() => goToStep(prog.firstStepIdx)}
                  className={`text-left p-3.5 rounded-2xl border-2 transition cursor-pointer flex flex-col justify-between gap-2 ${
                    isCurrentAxis
                      ? "bg-white border-[#1D4ED8] ring-2 ring-blue-500/20 shadow-sm"
                      : hasFail
                        ? "bg-rose-50/70 border-rose-300 hover:bg-white"
                        : isAllDone
                          ? "bg-emerald-50/70 border-emerald-300 hover:bg-white"
                          : "bg-white border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-black text-blue-800">
                        축 {axis.axisNumber} · {axis.durationMinutes}분
                      </span>
                      <span
                        className={`text-xs font-extrabold px-1.5 py-0.5 rounded ${
                          hasFail
                            ? "bg-rose-600 text-white"
                            : isAllDone
                              ? "bg-emerald-600 text-white"
                              : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {prog.pass}/{prog.total}
                      </span>
                    </div>
                    <div className="text-xs sm:text-sm font-extrabold text-slate-900 leading-snug line-clamp-2">
                      {axis.shortTitle}
                    </div>
                  </div>
                  <div className="text-[11px] font-bold text-slate-500">{axis.domainBadge}</div>
                </button>
              );
            })}
          </section>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            VIEW MODE 1: STEP-BY-STEP CLICK-THROUGH RUNNER (클릭 스루 실행 모드)
           ════════════════════════════════════════════════════════════════════ */}
        {viewMode === "walkthrough" && (
          <div
            ref={stepCardTopRef}
            className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start scroll-mt-36"
          >
            {/* Left Step Navigator Rail (4 cols on desktop) */}
            <aside className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3 lg:sticky lg:top-36">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm sm:text-base font-black text-slate-900">
                  점검 문항 네비게이터 (36)
                </h2>
                <span className="text-xs font-bold text-slate-500">클릭 시 즉시 이동</span>
              </div>

              {/* Filter Chips */}
              <div className="grid grid-cols-4 gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                {[
                  { id: "all" as const, label: `전체 ${stats.total}` },
                  { id: "pending" as const, label: `미점검 ${stats.pendingCount}` },
                  { id: "fail" as const, label: `FAIL ${stats.failCount}` },
                  { id: "s0" as const, label: `S0 필수` },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setStepFilter(f.id)}
                    className={`min-h-[34px] px-1.5 py-1 rounded-lg text-xs font-extrabold cursor-pointer transition ${
                      stepFilter === f.id
                        ? "bg-[#0F172A] text-white"
                        : "bg-transparent text-slate-700 hover:bg-white"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Scrollable Step List */}
              <div className="max-h-[340px] lg:max-h-[580px] overflow-y-auto pr-1 space-y-1.5">
                {filteredSidebarSteps.length === 0 ? (
                  <div className="p-6 text-center text-sm font-bold text-slate-500">
                    해당 필터 조건에 맞는 문항이 없습니다.
                  </div>
                ) : (
                  filteredSidebarSteps.map(({ step, idx }) => {
                    const st = records[step.code]?.status ?? "PENDING";
                    const isSelected = idx === activeStepIdx;
                    return (
                      <button
                        key={step.code}
                        type="button"
                        data-testid={`nav-step-${step.code}`}
                        onClick={() => goToStep(idx)}
                        className={`w-full text-left px-3 py-2.5 rounded-xl border transition cursor-pointer flex items-start gap-2.5 ${
                          isSelected
                            ? "bg-blue-50 border-[#1D4ED8] ring-2 ring-blue-500/20"
                            : st === "PASS"
                              ? "bg-emerald-50/40 border-emerald-200 hover:bg-emerald-50"
                              : st === "FAIL"
                                ? "bg-rose-50/60 border-rose-300 hover:bg-rose-50"
                                : "bg-white border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        <span className="text-sm mt-0.5 shrink-0" aria-hidden="true">
                          {st === "PASS" ? "✅" : st === "FAIL" ? "❌" : isSelected ? "👉" : "⬜"}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono text-xs font-black text-slate-800">
                              {String(step.stepNumber).padStart(2, "0")} · {step.code}
                            </span>
                            {step.severity === "S0" && (
                              <span className="px-1.5 py-0.2 rounded bg-rose-100 text-rose-900 text-[10px] font-extrabold">
                                S0
                              </span>
                            )}
                          </div>
                          <div className="text-xs sm:text-sm font-bold text-slate-900 leading-snug line-clamp-1 mt-0.5">
                            {step.title}
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </aside>

            {/* Main Active Step Click-Through Stage (8 cols on desktop) */}
            <article
              data-testid="active-step-card"
              className="lg:col-span-8 bg-white rounded-2xl border-2 border-slate-300 shadow-sm overflow-hidden"
            >
              {/* Axis Context Top Strip */}
              <div className="px-5 sm:px-7 py-3.5 bg-[#0F172A] text-white flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-md bg-blue-600 text-white text-xs font-extrabold">
                    STEP {String(activeStep.stepNumber).padStart(2, "0")} / {MECE_36_STEPS.length}
                  </span>
                  <span className="text-xs sm:text-sm font-bold text-slate-200">
                    {activeAxis.fullTitle}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {(activeAxis.id === "axis-4" || activeAxis.id === "axis-5") && (
                    <button
                      type="button"
                      data-testid={!showLinkVault ? "btn-seed-axis456" : "btn-seed-axis456-walkthrough"}
                      disabled={isSeedingAxis456}
                      onClick={() => void handleSeedAxis456()}
                      className="min-h-[34px] px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-extrabold cursor-pointer transition"
                    >
                      {isSeedingAxis456
                        ? "⚡ 시드 생성 중..."
                        : "⚡ Axis 4~6 테스트 문의·구독 원클릭 생성"}
                    </button>
                  )}
                  <span className="text-xs font-bold text-amber-300">
                    권장 소요 약 {activeStep.estimatedMinutes}분
                  </span>
                </div>
              </div>

              {(activeAxis.id === "axis-4" || activeAxis.id === "axis-5") && seedResult && (
                <div className="px-5 sm:px-7 py-3 bg-emerald-50 border-b border-emerald-200 flex flex-wrap items-center justify-between gap-2.5">
                  <span className="text-xs sm:text-sm font-bold text-emerald-950">
                    {seedResult.message}
                  </span>
                  <a
                    href="/broker/w/inbox"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[36px] px-3 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-extrabold inline-flex items-center gap-1 shrink-0"
                  >
                    <span>💬 소통관리함(/broker/w/inbox) 바로 열기 ↗</span>
                  </a>
                </div>
              )}

              <div className="p-5 sm:p-7 space-y-6">
                {/* Badges & Step Title */}
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        data-testid="active-step-code"
                        className="font-mono px-3 py-1 rounded-lg bg-slate-900 text-white text-sm font-black"
                      >
                        [{activeStep.code}]
                      </span>
                      <span
                        className={`px-2.5 py-1 rounded-lg border text-xs sm:text-sm font-extrabold ${
                          activeStep.severity === "S0"
                            ? "bg-rose-100 text-rose-950 border-rose-300"
                            : "bg-amber-100 text-amber-950 border-amber-300"
                        }`}
                      >
                        {activeStep.severity === "S0"
                          ? "S0 Blocker (출시 필수 게이트)"
                          : "S1 Critical (핵심 품질 게이트)"}
                      </span>
                      <span
                        className={`px-2.5 py-1 rounded-lg border text-xs sm:text-sm font-extrabold ${getWindowBadgeStyle(
                          activeStep.windowMode
                        )}`}
                      >
                        🪟 {activeStep.windowMode}
                      </span>
                    </div>

                    {/* Current Status Indicator */}
                    <span
                      data-testid="active-step-status"
                      className={`px-3 py-1 rounded-full text-xs sm:text-sm font-extrabold ${
                        activeRecord.status === "PASS"
                          ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
                          : activeRecord.status === "FAIL"
                            ? "bg-rose-100 text-rose-900 border border-rose-300"
                            : "bg-slate-100 text-slate-700 border border-slate-300"
                      }`}
                    >
                      {activeRecord.status === "PASS"
                        ? "✅ PASS 판정됨"
                        : activeRecord.status === "FAIL"
                          ? "❌ FAIL 기록됨"
                          : "⏳ 미점검 상태"}
                    </span>
                  </div>

                  <h2
                    data-testid="active-step-title"
                    className="text-xl sm:text-2xl font-black text-slate-900 leading-snug break-keep"
                  >
                    {activeStep.title}
                  </h2>

                  {/* Why We Test This (Session Defect Context) */}
                  <div className="p-4 rounded-xl bg-indigo-50/75 border border-indigo-200 text-sm sm:text-base text-slate-800 leading-relaxed">
                    <span className="font-extrabold text-indigo-950 mr-1.5">
                      💡 실전 방어 포인트:
                    </span>
                    {activeStep.bugContext}
                  </div>
                </div>

                {/* 1-Click Route Launchers (when applicable) */}
                {activeStep.quickLinks.length > 0 && (
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                    <div className="text-xs sm:text-sm font-extrabold text-slate-700">
                      🚀 1클릭 점검 화면 바로 열기
                    </div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      {activeStep.quickLinks.map((link) => (
                        <a
                          key={link.href + link.label}
                          href={link.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`min-h-[44px] px-4 py-2 rounded-xl text-sm sm:text-base font-extrabold transition inline-flex items-center gap-1.5 shadow-xs ${getLinkButtonClass(
                            link.variant
                          )}`}
                        >
                          <span>{link.label}</span>
                          <span>↗</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* 1-Click Copy Trap / Input Snippets (when applicable) */}
                {activeStep.copySnippets && activeStep.copySnippets.length > 0 && (
                  <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-200 space-y-3">
                    <div className="text-xs sm:text-sm font-extrabold text-blue-950">
                      📋 1클릭 테스트 입력값 · 함정 문구 복사 (직접 타이핑하지 말고 복사해 붙여넣으세요)
                    </div>
                    <div className="space-y-2.5">
                      {activeStep.copySnippets.map((snip) => {
                        const isCopied = copiedId === snip.id;
                        return (
                          <div
                            key={snip.id}
                            className="p-3.5 rounded-xl bg-white border border-blue-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                          >
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-950 text-xs font-extrabold">
                                  {snip.label}
                                </span>
                                <span className="text-xs font-semibold text-slate-600">
                                  {snip.targetHint}
                                </span>
                              </div>
                              <div className="text-sm sm:text-base font-bold text-slate-900 select-all break-all">
                                {snip.value}
                              </div>
                            </div>
                            <button
                              type="button"
                              data-testid={`copy-snippet-${snip.id}`}
                              onClick={() => handleCopy(snip.value, snip.label, snip.id)}
                              className={`shrink-0 min-h-[42px] px-4 py-2 rounded-xl text-xs sm:text-sm font-extrabold cursor-pointer transition ${
                                isCopied
                                  ? "bg-emerald-600 text-white"
                                  : "bg-[#0F172A] hover:bg-slate-800 text-white"
                              }`}
                            >
                              {isCopied ? "✅ 복사됨!" : "📋 클릭 복사"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Numbered Action Steps */}
                <div className="space-y-3">
                  <h3 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
                    <span>👣</span>
                    <span>따라하기 조작 순서</span>
                  </h3>
                  <ol className="space-y-2.5">
                    {activeStep.actionSteps.map((act, i) => (
                      <li
                        key={i}
                        className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-3"
                      >
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#1D4ED8] text-white text-sm font-black shrink-0 mt-0.5">
                          {i + 1}
                        </span>
                        <span className="text-base sm:text-[17px] font-semibold text-slate-900 leading-[1.7] break-keep">
                          {act}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>

                {/* Pass Criteria Box */}
                <div className="p-4 sm:p-5 rounded-2xl bg-emerald-50/75 border-2 border-emerald-300 space-y-2.5">
                  <h3 className="text-base sm:text-lg font-black text-emerald-950 flex items-center gap-2">
                    <span>✅</span>
                    <span>합격 기준 (모두 충족 시 PASS)</span>
                  </h3>
                  <ul className="space-y-2">
                    {activeStep.passCriteria.map((crit, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2.5 text-base sm:text-[17px] font-bold text-slate-900 leading-[1.65] break-keep"
                      >
                        <span className="text-emerald-700 font-black mt-0.5 shrink-0">✓</span>
                        <span>{crit}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Immediate Fail Trap Box */}
                <div className="p-4 rounded-xl bg-rose-50/85 border border-rose-300 flex items-start gap-2.5">
                  <span className="text-lg shrink-0">🚨</span>
                  <div className="text-sm sm:text-base font-bold text-rose-950 leading-relaxed break-keep">
                    <span className="font-black underline underline-offset-2 mr-1.5">
                      즉시 FAIL 조건:
                    </span>
                    {activeStep.failTrap}
                  </div>
                </div>

                {/* Per-Step Observation / Defect Note */}
                <div className="space-y-2 pt-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label
                      htmlFor="step-observation-note"
                      className="text-sm sm:text-base font-extrabold text-slate-800"
                    >
                      📝 이 문항 관찰 메모 / 결함 상세 기록 (자동 저장 · 리포트 반영)
                    </label>
                    {activeRecord.status === "FAIL" && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-extrabold text-rose-800">결함 등급:</span>
                        <select
                          aria-label="결함 심각도 등급"
                          value={activeRecord.overrideSeverity ?? activeStep.severity}
                          onChange={(e) =>
                            updateStepSeverity(activeStep.code, e.target.value as MeceSeverity)
                          }
                          className="px-2.5 py-1 rounded-lg bg-white text-slate-900 border border-rose-300 text-xs sm:text-sm font-extrabold"
                        >
                          <option value="S0">S0 (Blocker · 출시 중단)</option>
                          <option value="S1">S1 (Critical · 당일 핫픽스)</option>
                          <option value="S2">S2 (Minor · 경미 개선)</option>
                        </select>
                      </div>
                    )}
                  </div>
                  <textarea
                    id="step-observation-note"
                    ref={noteInputRef}
                    rows={2}
                    value={activeRecord.note}
                    onChange={(e) => updateStepNote(activeStep.code, e.target.value)}
                    placeholder="발견된 이상 현상, 어색한 문구, 또는 확인 메모가 있으면 적어주세요."
                    className="w-full p-3.5 rounded-xl bg-white text-slate-900 border border-slate-300 text-sm sm:text-base font-medium focus:border-blue-600 focus:outline-none"
                  />
                </div>

                {/* ──────── PRIMARY CLICK-THROUGH ACTION FOOTER ──────── */}
                <div className="pt-4 border-t border-slate-200 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                    <button
                      type="button"
                      disabled={activeStepIdx === 0}
                      onClick={() => goToStep(activeStepIdx - 1)}
                      className="sm:col-span-2 min-h-[52px] px-3 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-900 text-sm sm:text-base font-extrabold cursor-pointer disabled:cursor-not-allowed transition"
                    >
                      ← 이전
                    </button>

                    <button
                      type="button"
                      data-testid="btn-pass-and-next"
                      onClick={handlePassAndNext}
                      className="sm:col-span-5 min-h-[52px] px-4 py-2.5 rounded-xl bg-[#059669] hover:bg-[#047857] text-white text-base sm:text-lg font-black cursor-pointer shadow-sm transition"
                    >
                      {activeStepIdx < MECE_36_STEPS.length - 1
                        ? "✅ PASS 판정 & 다음 문항 →"
                        : "✅ PASS & 최종 리포트 보기 →"}
                    </button>

                    <button
                      type="button"
                      data-testid="btn-mark-fail"
                      onClick={handleMarkFail}
                      className="sm:col-span-3 min-h-[52px] px-4 py-2.5 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white text-base font-black cursor-pointer shadow-sm transition"
                    >
                      ❌ FAIL 결함 기록
                    </button>

                    <button
                      type="button"
                      disabled={activeStepIdx === MECE_36_STEPS.length - 1}
                      onClick={() => goToStep(activeStepIdx + 1)}
                      className="sm:col-span-2 min-h-[52px] px-3 py-2.5 rounded-xl bg-[#0F172A] hover:bg-slate-800 disabled:opacity-40 text-white text-sm sm:text-base font-extrabold cursor-pointer disabled:cursor-not-allowed transition"
                    >
                      다음 →
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm text-slate-500 font-medium">
                    <span>
                      ⌨️ 키보드 단축키: <strong className="text-slate-800">[P]</strong> PASS 후 다음 ·{" "}
                      <strong className="text-slate-800">[F]</strong> FAIL 기록 ·{" "}
                      <strong className="text-slate-800">[← / →]</strong> 이전·다음 문항
                    </span>
                    {activeRecord.status !== "PENDING" && (
                      <button
                        type="button"
                        onClick={() => updateStepStatus(activeStep.code, "PENDING")}
                        className="text-xs font-extrabold text-slate-600 hover:text-slate-900 underline cursor-pointer"
                      >
                        ↺ 이 문항 미점검으로 되돌리기
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </article>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            VIEW MODE 2: FULL 6-AXIS MATRIX SHEET (6대 축 전체 시트 모드)
           ════════════════════════════════════════════════════════════════════ */}
        {viewMode === "matrix" && (
          <div data-testid="matrix-sheet-view" className="space-y-6">
            {/* Search & Filter Bar */}
            <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { id: "all" as const, label: `전체 (${stats.total})` },
                  { id: "pending" as const, label: `미점검 (${stats.pendingCount})` },
                  { id: "fail" as const, label: `FAIL (${stats.failCount})` },
                  { id: "s0" as const, label: `S0 Blocker만` },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setStepFilter(f.id)}
                    className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-extrabold cursor-pointer transition ${
                      stepFilter === f.id
                        ? "bg-[#0F172A] text-white"
                        : "bg-slate-100 text-slate-800 hover:bg-slate-200"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <div className="flex-1 max-w-md">
                <input
                  type="search"
                  value={matrixSearch}
                  onChange={(e) => setMatrixSearch(e.target.value)}
                  placeholder="문항 코드 또는 키워드 검색 (예: NL-202, 통계, 잠금, +82)"
                  className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-white text-slate-900 border border-slate-300 text-sm font-semibold focus:border-blue-600 focus:outline-none"
                />
              </div>
            </section>

            {filteredMatrixAxes.map(({ axis, items }) => {
              const prog = axisProgressMap[axis.id];
              return (
                <section
                  key={axis.id}
                  className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden"
                >
                  <div className="px-5 py-4 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2.5 py-0.5 rounded bg-blue-600 text-white text-xs font-extrabold">
                          {axis.domainBadge} · {axis.durationMinutes}분
                        </span>
                        <span className="text-xs font-bold text-emerald-300">
                          통과 {prog.pass} / {prog.total}
                        </span>
                      </div>
                      <h2 className="text-base sm:text-lg font-black">{axis.fullTitle}</h2>
                      <p className="text-xs sm:text-sm text-slate-300">
                        방어 결함: {axis.defendedBugs}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0 print:hidden">
                      {(axis.id === "axis-4" || axis.id === "axis-5") && (
                        <button
                          type="button"
                          data-testid={
                            !showLinkVault && axis.id === "axis-4"
                              ? "btn-seed-axis456"
                              : `btn-seed-axis456-${axis.id}`
                          }
                          disabled={isSeedingAxis456}
                          onClick={() => void handleSeedAxis456()}
                          className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-60 text-white text-xs sm:text-sm font-extrabold cursor-pointer"
                        >
                          {isSeedingAxis456
                            ? "⚡ 시드 생성 중..."
                            : "⚡ Axis 4~6 테스트 문의·구독 원클릭 생성"}
                        </button>
                      )}
                      {(axis.id === "axis-4" || axis.id === "axis-5") && seedResult && (
                        <a
                          href="/broker/w/inbox"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-h-[40px] px-3 py-1.5 rounded-xl bg-white text-emerald-900 text-xs font-extrabold inline-flex items-center"
                        >
                          💬 소통관리함 열기 ↗
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => handleMarkAxisAllPass(axis.id, axis.shortTitle)}
                        className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-extrabold cursor-pointer"
                      >
                        ✅ 축 {axis.axisNumber} 전체 PASS
                      </button>
                    </div>
                  </div>

                  <div className="divide-y divide-slate-200">
                    {items.map(({ step, idx }) => {
                      const rec = records[step.code] ?? { status: "PENDING", note: "" };
                      return (
                        <div
                          key={step.code}
                          className={`p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
                            rec.status === "PASS"
                              ? "bg-emerald-50/25"
                              : rec.status === "FAIL"
                                ? "bg-rose-50/45"
                                : "bg-white"
                          }`}
                        >
                          <div className="space-y-1.5 flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono px-2.5 py-0.5 rounded bg-slate-900 text-white text-xs font-black">
                                {step.code}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded text-xs font-extrabold ${
                                  step.severity === "S0"
                                    ? "bg-rose-100 text-rose-950"
                                    : "bg-amber-100 text-amber-950"
                                }`}
                              >
                                {step.severity}
                              </span>
                              <span className="text-xs font-bold text-slate-600">
                                {step.windowMode}
                              </span>
                              <span className="text-sm sm:text-base font-extrabold text-slate-900">
                                {step.title}
                              </span>
                            </div>
                            <p className="text-sm text-slate-700 leading-relaxed">
                              <strong className="text-slate-900">조작:</strong>{" "}
                              {step.actionSteps.join(" → ")}
                            </p>
                            <p className="text-sm text-emerald-900 font-semibold leading-relaxed">
                              <strong>합격 기준:</strong> {step.passCriteria.join(" / ")}
                            </p>
                            {rec.note && (
                              <p className="text-xs sm:text-sm font-bold text-rose-800 bg-rose-50 px-3 py-1.5 rounded-lg border border-rose-200">
                                📝 메모: {rec.note}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-2 shrink-0 print:hidden">
                            <button
                              type="button"
                              onClick={() => updateStepStatus(step.code, "PASS")}
                              className={`min-h-[42px] px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-extrabold cursor-pointer transition ${
                                rec.status === "PASS"
                                  ? "bg-emerald-600 text-white"
                                  : "bg-slate-100 hover:bg-emerald-50 text-slate-800 border border-slate-300"
                              }`}
                            >
                              ✅ PASS
                            </button>
                            <button
                              type="button"
                              onClick={() => updateStepStatus(step.code, "FAIL")}
                              className={`min-h-[42px] px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-extrabold cursor-pointer transition ${
                                rec.status === "FAIL"
                                  ? "bg-rose-600 text-white"
                                  : "bg-slate-100 hover:bg-rose-50 text-slate-800 border border-slate-300"
                              }`}
                            >
                              ❌ FAIL
                            </button>
                            <button
                              type="button"
                              onClick={() => goToStep(idx)}
                              className="min-h-[42px] px-3.5 py-1.5 rounded-xl bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-xs sm:text-sm font-extrabold cursor-pointer"
                            >
                              🎯 상세 열기
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            VIEW MODE 3: FINAL SIGN-OFF GATE & REPORT EXPORT (최종 판정 리포트)
           ════════════════════════════════════════════════════════════════════ */}
        {viewMode === "report" && (
          <div data-testid="signoff-report-view" className="space-y-6">
            <section className="bg-white rounded-2xl border-2 border-slate-900 p-5 sm:p-7 shadow-sm space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-block px-2.5 py-0.5 rounded bg-slate-900 text-white text-xs font-extrabold">
                      상용화 최종 판정 (Sign-Off Gate)
                    </span>
                    {renderSyncBadgePill()}
                    <button
                      type="button"
                      onClick={() =>
                        handleCopy(sessionId, "검수 세션 ID", "copy-qa-session-id")
                      }
                      className="px-2.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 text-xs font-mono font-bold cursor-pointer"
                    >
                      세션: {sessionId} 📋
                    </button>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black text-slate-900">
                    뉴스레터 · 소통관리함 36문항 MECE 검수 결과서
                  </h2>
                </div>

                <div className="flex flex-wrap items-center gap-2 print:hidden">
                  <button
                    type="button"
                    disabled={isSubmittingServer}
                    onClick={() => void handleSubmitToServer()}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-indigo-700 hover:bg-indigo-800 disabled:opacity-60 text-white text-xs sm:text-sm font-extrabold cursor-pointer shadow-xs"
                  >
                    {isSubmittingServer
                      ? "☁️ 서버 제출 중..."
                      : "☁️ 서버에 검수결과 제출"}
                  </button>
                  <button
                    type="button"
                    data-testid="copy-report-md-btn"
                    onClick={() =>
                      handleCopy(
                        generateReportMarkdown(),
                        "상용화 MECE 검수 결과서",
                        "copy-full-report"
                      )
                    }
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-xs sm:text-sm font-extrabold cursor-pointer shadow-xs"
                  >
                    {copiedId === "copy-full-report"
                      ? "✅ 결과서 복사됨!"
                      : "📋 마크다운 결과서 전체 복사"}
                  </button>
                  <button
                    type="button"
                    data-testid="download-report-md-btn"
                    onClick={handleDownloadReportMd}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-[#059669] hover:bg-[#047857] text-white text-xs sm:text-sm font-extrabold cursor-pointer shadow-xs"
                  >
                    ⬇️ 결과서(.md) 다운로드
                  </button>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs sm:text-sm font-extrabold cursor-pointer"
                  >
                    🖨️ 인쇄 / PDF
                  </button>
                  <button
                    type="button"
                    data-testid="reset-all-btn"
                    onClick={handleResetAll}
                    className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs sm:text-sm font-extrabold cursor-pointer transition ${
                      resetArmed
                        ? "bg-rose-600 text-white"
                        : "bg-slate-100 hover:bg-rose-50 text-rose-700 border border-rose-200"
                    }`}
                  >
                    {resetArmed ? "⚠️ 한 번 더 눌러 초기화 확정" : "🗑️ 기록 초기화"}
                  </button>
                </div>
              </div>

              {/* KPI Cards */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-xs font-bold text-slate-600">전체 문항</div>
                  <div className="text-2xl font-black text-slate-900 mt-1">{stats.total}문항</div>
                </div>
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
                  <div className="text-xs font-bold text-emerald-800">PASS 통과</div>
                  <div className="text-2xl font-black text-emerald-700 mt-1">
                    {stats.passCount}건
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-rose-50 border border-rose-200">
                  <div className="text-xs font-bold text-rose-800">S0 Blocker 결함</div>
                  <div className="text-2xl font-black text-rose-700 mt-1">
                    {stats.s0FailCount}건
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
                  <div className="text-xs font-bold text-amber-900">S1 Critical 결함</div>
                  <div className="text-2xl font-black text-amber-800 mt-1">
                    {stats.s1FailCount}건
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-xs font-bold text-slate-600">미점검 잔여</div>
                  <div className="text-2xl font-black text-slate-800 mt-1">
                    {stats.pendingCount}건
                  </div>
                </div>
              </div>

              {/* Tester Metadata Inputs */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs sm:text-sm font-extrabold text-slate-800 mb-1.5">
                    검수자 성명 / 직함
                  </label>
                  <input
                    type="text"
                    value={testerName}
                    onChange={(e) => setTesterName(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-white text-slate-900 border border-slate-300 text-sm sm:text-base font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-extrabold text-slate-800 mb-1.5">
                    소속 법인 / 팀명 (선택)
                  </label>
                  <input
                    type="text"
                    value={testerOrg}
                    onChange={(e) => setTesterOrg(e.target.value)}
                    placeholder="예: 상용화 QA팀 / 대표중개인"
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-white text-slate-900 border border-slate-300 text-sm sm:text-base font-medium"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs sm:text-sm font-extrabold text-slate-800 mb-1.5">
                    검수자 최종 총평 / 조건부 승인 의견
                  </label>
                  <input
                    type="text"
                    value={overallComment}
                    onChange={(e) => setOverallComment(e.target.value)}
                    placeholder="예: 월간 통계 2선 + 이슈 5선 구성 및 소통함 링크 잠금·수신거부 차감 정상 작동 확인 완료"
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-white text-slate-900 border border-slate-300 text-sm sm:text-base font-medium"
                  />
                </div>
              </div>

              {/* Live Auto-Verifier Panel inside Report Tab */}
              {renderLiveAutoVerifierPanel(true)}

              {/* Sign-Off Gate Reference Table */}
              <div className="space-y-2">
                <h3 className="text-sm sm:text-base font-black text-slate-900">
                  상용화 최종 판정(Sign-Off) 게이트 기준표
                </h3>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead className="bg-slate-100 text-slate-900 font-extrabold">
                      <tr>
                        <th className="p-3 border-b border-slate-200 w-44">등급</th>
                        <th className="p-3 border-b border-slate-200">판정 기준</th>
                        <th className="p-3 border-b border-slate-200 w-56">출시 가능 여부</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {SIGN_OFF_GATES.map((g) => (
                        <tr key={g.grade}>
                          <td className="p-3 font-extrabold text-slate-900">{g.label}</td>
                          <td className="p-3 text-slate-700 leading-relaxed">{g.criteria}</td>
                          <td className="p-3 font-extrabold text-slate-900">{g.verdict}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Live Markdown Preview */}
              <div className="space-y-2">
                <div className="text-xs sm:text-sm font-extrabold text-slate-700">
                  📄 자동 생성된 마크다운 리포트 미리보기 (복사하여 채팅창·이슈 트래커에 바로 붙여넣기 가능)
                </div>
                <pre
                  data-testid="report-markdown-preview"
                  className="p-4 sm:p-5 rounded-xl bg-[#0F172A] text-slate-100 text-xs sm:text-sm font-mono whitespace-pre-wrap max-h-96 overflow-y-auto select-all border border-slate-700 leading-relaxed"
                >
                  {generateReportMarkdown()}
                </pre>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
