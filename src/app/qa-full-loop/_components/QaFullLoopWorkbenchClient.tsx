"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  QA_SIGNOFF_SESSION_STORAGE_KEY,
  appendQaParamsToHref,
  getStoredQaAccessKey,
  resolveBrokerCohortSessionIds,
  resolveQaBrokerCohort,
  resolveQaPortalRole,
  setStoredQaAccessKey,
  type QaPortalRole,
} from "@/lib/qa/qa-client-auth";
import type {
  FullLoopCaseDefinition,
  FullLoopCaseId,
  FullLoopSeverity,
  FullLoopStepItem,
  FullLoopVerdict,
  FullLoopWindowRoleCard,
} from "@/lib/testguide/full-loop-2cases-data";

type ActiveTab = FullLoopCaseId | "report";
type StepViewMode = "focus" | "all";
type SyncStatus = "idle" | "syncing" | "synced" | "submitted" | "error";

interface StepExecutionRecord {
  status: FullLoopVerdict;
  note: string;
  overrideSeverity?: FullLoopSeverity;
  updatedAt?: string;
}

interface LoopTelemetry {
  seconds: number;
  hesitations: number;
  misclicks: number;
}

interface LoopScratchUrls {
  dealCardUrl: string;
  imShareUrl: string;
  secondaryImShareUrl: string;
  newsletterUrl: string;
  subscriberContact: string;
  byodForbiddenKeywords?: string;
}

function extractEntityIdFromUrl(
  raw: string,
  prefixPattern: RegExp,
  queryKeys: readonly string[] = ["buildingId", "id"],
): string {
  const trimmed = (raw || "").trim();
  if (!trimmed) return "";
  const m = trimmed.match(prefixPattern);
  if (m && m[1]) return decodeURIComponent(m[1]);
  try {
    const u = trimmed.startsWith("http")
      ? new URL(trimmed)
      : new URL(trimmed, "https://www.credeal.net");
    for (const k of queryKeys) {
      const qv = (u.searchParams.get(k) || "").trim();
      if (qv) return qv;
    }
  } catch {
    // ignore malformed URL
  }
  return "";
}

interface StorageHygieneResult {
  checkedAt: string;
  clean: boolean;
  foundKeys: string[];
}

export interface QaFullLoopEditionConfig {
  workbenchId: string;
  localStorageKey: string;
  sessionPrefix: string;
  badgeCode: string;
  pageTitle: string;
  pageSubtitle: string;
  reportTitle: string;
  reportFilePrefix: string;
  crossEditionLink: {
    href: string;
    label: string;
  };
  cases: ReadonlyArray<FullLoopCaseDefinition>;
  windowRoles: ReadonlyArray<FullLoopWindowRoleCard>;
  defaultSubscribers: Record<FullLoopCaseId, string>;
  secondaryBuyerPlaceholder: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ProbeApiResult = Record<string, any>;

const DEFAULT_TELEMETRY: Record<FullLoopCaseId, LoopTelemetry> = {
  loop1: { seconds: 0, hesitations: 0, misclicks: 0 },
  loop2: { seconds: 0, hesitations: 0, misclicks: 0 },
};

function createSessionId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function formatDuration(sec: number): string {
  const mins = Math.floor(sec / 60);
  const secs = sec % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function getWindowBadgeClass(badge: FullLoopStepItem["windowBadge"]): string {
  if (badge.includes("↔")) {
    return "bg-violet-100 text-violet-900 border-violet-300";
  }
  if (badge.startsWith("창 B")) {
    return "bg-emerald-100 text-emerald-950 border-emerald-300";
  }
  if (badge.startsWith("창 C")) {
    return "bg-amber-100 text-amber-950 border-amber-300";
  }
  return "bg-blue-100 text-blue-900 border-blue-300";
}

function formatSubsystemLabel(subsystem: FullLoopStepItem["subsystem"]): string {
  if (subsystem === "오라클·보안마감") {
    return "최종 링크·비공개 점검";
  }
  return subsystem;
}

function isRedPenLaunchableUrl(raw?: string): boolean {
  const trimmed = (raw || "").trim();
  return trimmed.startsWith("/") || /^https?:\/\//i.test(trimmed);
}

export function QaFullLoopWorkbenchClient({
  config,
}: {
  config: QaFullLoopEditionConfig;
}) {
  const allSteps = useMemo(
    () => config.cases.flatMap((c) => c.steps),
    [config.cases],
  );
  const defaultScratch = useMemo<Record<FullLoopCaseId, LoopScratchUrls>>(
    () => ({
      loop1: {
        dealCardUrl: "",
        imShareUrl: "",
        secondaryImShareUrl: "",
        newsletterUrl: "",
        subscriberContact: config.defaultSubscribers.loop1,
        byodForbiddenKeywords: "",
      },
      loop2: {
        dealCardUrl: "",
        imShareUrl: "",
        secondaryImShareUrl: "",
        newsletterUrl: "",
        subscriberContact: config.defaultSubscribers.loop2,
        byodForbiddenKeywords: "",
      },
    }),
    [config.defaultSubscribers.loop1, config.defaultSubscribers.loop2],
  );

  const [activeTab, setActiveTab] = useState<ActiveTab>("loop1");
  const [viewMode, setViewMode] = useState<StepViewMode>("all");
  const [focusedStepByLoop, setFocusedStepByLoop] = useState<
    Record<FullLoopCaseId, string>
  >({
    loop1: config.cases[0]?.steps[0]?.id || "L1-S1",
    loop2: config.cases[1]?.steps[0]?.id || "L2-S1",
  });
  const [showAssetsDrawer, setShowAssetsDrawer] = useState<boolean>(false);

  const [sessionId, setSessionId] = useState<string>("");
  const [testerName, setTesterName] = useState<string>("현업 중개사 · 총괄 검수자");
  const [testerOrg, setTesterOrg] = useState<string>("");
  const [overallComment, setOverallComment] = useState<string>("");

  const [records, setRecords] = useState<Record<string, StepExecutionRecord>>({});
  const [telemetry, setTelemetry] =
    useState<Record<FullLoopCaseId, LoopTelemetry>>(DEFAULT_TELEMETRY);
  const [scratchByLoop, setScratchByLoop] =
    useState<Record<FullLoopCaseId, LoopScratchUrls>>(defaultScratch);

  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);
  const [timerLoopId, setTimerLoopId] = useState<FullLoopCaseId>("loop1");

  const [qaQueryKey, setQaQueryKey] = useState<string>("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const [probeLoading, setProbeLoading] = useState<boolean>(false);
  const [probeResults, setProbeResults] = useState<
    Record<FullLoopCaseId, ProbeApiResult | null>
  >({
    loop1: null,
    loop2: null,
  });
  const [hygieneResult, setHygieneResult] =
    useState<StorageHygieneResult | null>(null);
  const [confirmingByodCleanup, setConfirmingByodCleanup] =
    useState<boolean>(false);
  const [saveAnonymizedByodStats, setSaveAnonymizedByodStats] =
    useState<boolean>(true);
  const [activeCohort, setActiveCohort] = useState<string>("beta-1");
  const [cleanupLoading, setCleanupLoading] = useState<boolean>(false);
  const [cleanupReceipt, setCleanupReceipt] = useState<string[] | null>(null);

  const hydratedRef = useRef<boolean>(false);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const t = window.setTimeout(() => setToastMessage(null), 2600);
    return () => window.clearTimeout(t);
  }, [toastMessage]);

  const inferredPortalRole = useMemo<QaPortalRole>(() => {
    const wb = config.workbenchId.toLowerCase();
    if (wb.includes("broker")) return "broker";
    if (wb.includes("tester")) return "tester";
    return resolveQaPortalRole();
  }, [config.workbenchId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const sp = new URLSearchParams(window.location.search);
        const qk = (
          sp.get("qaKey") ||
          sp.get("key") ||
          sp.get("passcode") ||
          ""
        ).trim();
        if (qk) {
          setStoredQaAccessKey(qk, inferredPortalRole);
          setQaQueryKey(qk);
        } else {
          const stored = getStoredQaAccessKey(inferredPortalRole);
          if (stored) setQaQueryKey(stored);
        }

        if (inferredPortalRole === "broker") {
          const cohort = resolveQaBrokerCohort(sp);
          const cohortIds = resolveBrokerCohortSessionIds(cohort);
          setActiveCohort(cohortIds.cohort);
          try {
            const explicitCohort = (sp.get("cohort") || "").trim();
            const existingSignoffSession = (
              window.sessionStorage.getItem(QA_SIGNOFF_SESSION_STORAGE_KEY) ||
              window.localStorage.getItem(QA_SIGNOFF_SESSION_STORAGE_KEY) ||
              ""
            ).trim();
            if (
              explicitCohort ||
              !existingSignoffSession ||
              !existingSignoffSession.startsWith("qa-signoff-broker-")
            ) {
              window.sessionStorage.setItem(
                QA_SIGNOFF_SESSION_STORAGE_KEY,
                cohortIds.signoffSessionId,
              );
              window.localStorage.setItem(
                QA_SIGNOFF_SESSION_STORAGE_KEY,
                cohortIds.signoffSessionId,
              );
            }
          } catch {
            // ignore storage errors
          }
        }

        const raw = window.localStorage.getItem(config.localStorageKey);
        let restoredSessionId = "";
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === "object") {
            if (typeof parsed.sessionId === "string" && parsed.sessionId) {
              restoredSessionId = parsed.sessionId;
              setSessionId(parsed.sessionId);
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
            if (parsed.records && typeof parsed.records === "object") {
              setRecords(parsed.records);
            }
            if (parsed.telemetry && typeof parsed.telemetry === "object") {
              setTelemetry((prev) => ({ ...prev, ...parsed.telemetry }));
            }
            if (
              parsed.scratchByLoop &&
              typeof parsed.scratchByLoop === "object"
            ) {
              setScratchByLoop((prev) => ({
                loop1: { ...prev.loop1, ...(parsed.scratchByLoop.loop1 || {}) },
                loop2: { ...prev.loop2, ...(parsed.scratchByLoop.loop2 || {}) },
              }));
            }
          }
        }
        if (!restoredSessionId) {
          setSessionId(createSessionId(config.sessionPrefix));
        }
      } catch {
        setSessionId((prev) => prev || createSessionId(config.sessionPrefix));
      } finally {
        hydratedRef.current = true;
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [config.localStorageKey, config.sessionPrefix, inferredPortalRole]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    try {
      window.localStorage.setItem(
        config.localStorageKey,
        JSON.stringify({
          sessionId,
          testerName,
          testerOrg,
          overallComment,
          records,
          telemetry,
          scratchByLoop,
        }),
      );
    } catch {
      // ignore quota errors
    }
  }, [
    config.localStorageKey,
    sessionId,
    testerName,
    testerOrg,
    overallComment,
    records,
    telemetry,
    scratchByLoop,
  ]);

  useEffect(() => {
    if (!isTimerRunning) return;
    const id = window.setInterval(() => {
      setTelemetry((prev) => ({
        ...prev,
        [timerLoopId]: {
          ...prev[timerLoopId],
          seconds: prev[timerLoopId].seconds + 1,
        },
      }));
    }, 1000);
    return () => window.clearInterval(id);
  }, [isTimerRunning, timerLoopId]);

  const currentLoopId: FullLoopCaseId =
    activeTab === "loop2" ? "loop2" : "loop1";

  const currentLoop: FullLoopCaseDefinition = useMemo(
    () =>
      config.cases.find((c) => c.id === currentLoopId) || config.cases[0],
    [config.cases, currentLoopId],
  );

  const appendQaKeyIfPresent = useCallback(
    (baseUrl: string) => {
      if (!qaQueryKey) return baseUrl;
      const sep = baseUrl.includes("?") ? "&" : "?";
      return `${baseUrl}${sep}qaKey=${encodeURIComponent(qaQueryKey)}`;
    },
    [qaQueryKey],
  );

  const buildQaWorkspaceHref = useCallback(
    (rawHref: string): string => {
      if (!rawHref) return rawHref;
      const withQa = appendQaParamsToHref(rawHref, inferredPortalRole);
      try {
        const isAbsolute = /^https?:\/\//i.test(withQa);
        const parsed = new URL(withQa, "http://placeholder.local");
        if (!parsed.searchParams.has("qa")) {
          parsed.searchParams.set("qa", "1");
        }
        if (
          (inferredPortalRole === "broker" || inferredPortalRole === "tester") &&
          !parsed.pathname.startsWith("/qa-broker") &&
          !parsed.pathname.startsWith("/qa-tester") &&
          !parsed.searchParams.has("qaRole")
        ) {
          parsed.searchParams.set("qaRole", inferredPortalRole);
        }
        parsed.searchParams.delete("qaKey");
        parsed.searchParams.delete("key");
        return isAbsolute
          ? parsed.toString()
          : `${parsed.pathname}${parsed.search}${parsed.hash}`;
      } catch {
        return withQa;
      }
    },
    [inferredPortalRole],
  );

  const buildQaHeaders = useCallback((): Record<string, string> => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (qaQueryKey) {
      headers["x-qa-access-key"] = qaQueryKey;
    }
    return headers;
  }, [qaQueryKey]);

  const syncToServer = useCallback(
    async (mode: "sync" | "submit") => {
      setSyncStatus("syncing");
      try {
        const totalElapsed =
          telemetry.loop1.seconds + telemetry.loop2.seconds;
        const flatScratch: Record<string, string> = {
          loop1_dealcard: scratchByLoop.loop1.dealCardUrl,
          loop1_im: scratchByLoop.loop1.imShareUrl,
          loop1_newsletter: scratchByLoop.loop1.newsletterUrl,
          loop1_contact: scratchByLoop.loop1.subscriberContact,
          loop2_dealcard: scratchByLoop.loop2.dealCardUrl,
          loop2_im1: scratchByLoop.loop2.imShareUrl,
          loop2_im2: scratchByLoop.loop2.secondaryImShareUrl,
          loop2_newsletter: scratchByLoop.loop2.newsletterUrl,
          loop2_contact: scratchByLoop.loop2.subscriberContact,
          loop2_forbidden_keywords:
            scratchByLoop.loop2.byodForbiddenKeywords || "",
        };
        const res = await fetch("/api/public/qa-workbench", {
          method: "POST",
          headers: buildQaHeaders(),
          body: JSON.stringify({
            mode,
            workbenchId: config.workbenchId,
            sessionId,
            testerName,
            testerOrg,
            overallComment,
            elapsedSeconds: totalElapsed,
            scratchLinks: flatScratch,
            records,
          }),
        });
        if (!res.ok) {
          setSyncStatus("error");
          if (mode === "submit") {
            showToast("서버 제출 중 권한 또는 네트워크 확인이 필요합니다 (로컬에는 저장됨).");
          }
          return;
        }
        setSyncStatus(mode === "submit" ? "submitted" : "synced");
        setLastSyncedAt(new Date().toLocaleTimeString("ko-KR"));
        if (mode === "submit") {
          showToast("☁️ 2건 풀루프 검수 결과가 서버에 최종 제출되었습니다!");
        }
      } catch {
        setSyncStatus("error");
      }
    },
    [
      telemetry,
      scratchByLoop,
      buildQaHeaders,
      config.workbenchId,
      sessionId,
      testerName,
      testerOrg,
      overallComment,
      records,
      showToast,
    ],
  );

  useEffect(() => {
    if (!hydratedRef.current) return;
    if (Object.keys(records).length === 0) return;
    const timer = window.setTimeout(() => {
      void syncToServer("sync");
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [records, overallComment, syncToServer]);

  const handleCopy = useCallback(
    async (value: string, label: string, id: string) => {
      try {
        await navigator.clipboard.writeText(value);
        setCopiedId(id);
        showToast(`📋 [${label}] 복사 완료`);
        window.setTimeout(() => {
          setCopiedId((prev) => (prev === id ? null : prev));
        }, 1600);
      } catch {
        showToast("복사에 실패했습니다. 텍스트를 직접 선택해 복사해 주세요.");
      }
    },
    [showToast],
  );

  const handleSetVerdict = useCallback(
    (stepId: string, status: FullLoopVerdict) => {
      setRecords((prev) => {
        const existing = prev[stepId] || { status: "PENDING", note: "" };
        return {
          ...prev,
          [stepId]: {
            ...existing,
            status,
            updatedAt: new Date().toISOString(),
          },
        };
      });
    },
    [],
  );

  const handleSetNote = useCallback((stepId: string, note: string) => {
    setRecords((prev) => {
      const existing = prev[stepId] || { status: "PENDING", note: "" };
      return {
        ...prev,
        [stepId]: {
          ...existing,
          note,
          updatedAt: new Date().toISOString(),
        },
      };
    });
  }, []);

  const handleSetSeverity = useCallback(
    (stepId: string, sev: FullLoopSeverity) => {
      setRecords((prev) => {
        const existing = prev[stepId] || { status: "FAIL", note: "" };
        return {
          ...prev,
          [stepId]: {
            ...existing,
            overrideSeverity: sev,
            updatedAt: new Date().toISOString(),
          },
        };
      });
    },
    [],
  );

  const handleUpdateScratch = useCallback(
    (loopId: FullLoopCaseId, field: keyof LoopScratchUrls, val: string) => {
      setScratchByLoop((prev) => ({
        ...prev,
        [loopId]: {
          ...prev[loopId],
          [field]: val,
        },
      }));
    },
    [],
  );

  const handleToggleQuickTag = useCallback((stepId: string, tag: string) => {
    const token = `[${tag}]`;
    setRecords((prev) => {
      const existing = prev[stepId] || { status: "PENDING", note: "" };
      const curNote = existing.note || "";
      const nextNote = curNote.includes(token)
        ? curNote.replace(token, "").replace(/\s{2,}/g, " ").trim()
        : `${curNote ? `${curNote} ` : ""}${token}`.trim();
      return {
        ...prev,
        [stepId]: {
          ...existing,
          note: nextNote,
          updatedAt: new Date().toISOString(),
        },
      };
    });
  }, []);

  const runLiveProbe = useCallback(
    async (loopId: FullLoopCaseId) => {
      const urls = scratchByLoop[loopId];
      const targetLoop = config.cases.find((c) => c.id === loopId);
      const expectedLoopId = targetLoop?.probeLoopId || loopId;
      const customForbiddenTokens = (urls.byodForbiddenKeywords || "")
        .split(/[,;\n]+/)
        .map((t) => t.trim())
        .filter(Boolean);
      setProbeLoading(true);
      try {
        const res = await fetch("/api/public/qa-workbench", {
          method: "POST",
          headers: buildQaHeaders(),
          body: JSON.stringify({
            mode: "probe",
            expectedLoopId,
            dealCardUrl: urls.dealCardUrl,
            imShareUrl: urls.imShareUrl,
            secondaryImShareUrl: urls.secondaryImShareUrl,
            publicNewsletterUrl: urls.newsletterUrl,
            testClientContact: urls.subscriberContact,
            customForbiddenTokens,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data?.ok) {
          showToast(data?.error || "프로브 실행 권한 또는 입력 링크를 확인해 주세요.");
          return;
        }
        setProbeResults((prev) => ({ ...prev, [loopId]: data }));
        showToast("🔍 링크·면적·비공개 점검이 완료되었습니다.");
      } catch {
        showToast("네트워크 오류로 자동 점검 요청에 실패했습니다.");
      } finally {
        setProbeLoading(false);
      }
    },
    [scratchByLoop, config.cases, buildQaHeaders, showToast],
  );

  const handleRunByodCleanup = useCallback(async () => {
    const urls = scratchByLoop[currentLoopId];
    const dcId = extractEntityIdFromUrl(urls.dealCardUrl, /\/(?:dc|d)\/([^/?#]+)/i);
    const imId1 = extractEntityIdFromUrl(
      urls.imShareUrl,
      /\/(?:im-lite|im-pro)\/([^/?#]+)/i,
    );
    const imId2 = extractEntityIdFromUrl(
      urls.secondaryImShareUrl,
      /\/(?:im-lite|im-pro)\/([^/?#]+)/i,
    );
    const uniqueImIds = Array.from(new Set([imId1, imId2].filter(Boolean)));
    if (!dcId && uniqueImIds.length === 0) {
      showToast(
        "삭제할 대상이 없습니다. 오른쪽 ① 딜카드 링크 또는 ② IM 링크를 먼저 붙여넣어 주세요.",
      );
      setConfirmingByodCleanup(false);
      return;
    }

    setCleanupLoading(true);
    const logs: string[] = [];
    try {
      if (saveAnonymizedByodStats) {
        const byodLoop =
          config.cases.find((c) => c.isByodMode) ||
          config.cases.find((c) => c.id === "loop2") ||
          currentLoop;
        let stepPassCount = 0;
        let stepPolishCount = 0;
        let stepFailCount = 0;
        const matchedTags = new Set<string>();
        for (const st of byodLoop.steps) {
          const rec = records[st.id];
          if (rec?.status === "PASS") stepPassCount += 1;
          else if (rec?.status === "NEEDS_POLISH") stepPolishCount += 1;
          else if (rec?.status === "FAIL") stepFailCount += 1;
          const noteText = rec?.note || "";
          if (noteText && Array.isArray(st.brokerQuickTags)) {
            for (const tag of st.brokerQuickTags) {
              if (noteText.includes(`[${tag}]`)) {
                matchedTags.add(tag);
              }
            }
          }
        }
        void fetch("/api/public/qa-workbench", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(qaQueryKey ? { "x-qa-access-key": qaQueryKey } : {}),
          },
          body: JSON.stringify({
            mode: "byod_anonymized_snapshot",
            sessionId,
            cohort: activeCohort || "beta-1",
            stepPassCount,
            stepPolishCount,
            stepFailCount,
            elapsedSeconds: telemetry.loop2.seconds,
            hesitations: telemetry.loop2.hesitations,
            selectedQuickTags: Array.from(matchedTags),
          }),
        }).catch(() => null);
      }

      for (const imTargetId of uniqueImIds) {
        try {
          const listRes = await fetch(
            `/api/broker/im-lite/${encodeURIComponent(imTargetId)}`,
          );
          if (listRes.ok) {
            const listJson = await listRes.json().catch(() => null);
            const docs = Array.isArray(listJson?.documents)
              ? listJson.documents
              : [];
            for (const doc of docs) {
              if (doc?.id) {
                const delDoc = await fetch(
                  `/api/broker/im-lite/${encodeURIComponent(String(doc.id))}`,
                  { method: "DELETE" },
                );
                if (delDoc.ok) {
                  logs.push(`✓ IM 문서(${String(doc.id).slice(0, 8)}…) 삭제 완료`);
                }
              }
            }
          }
          const delImDirect = await fetch(
            `/api/broker/im-lite/${encodeURIComponent(imTargetId)}`,
            { method: "DELETE" },
          );
          if (delImDirect.ok) {
            logs.push(`✓ IM 링크(${imTargetId.slice(0, 8)}…) 비활성화 완료`);
          }
        } catch {
          logs.push(`⚠️ IM(${imTargetId.slice(0, 8)}…) 정리 중 네트워크 확인 필요`);
        }
      }

      const buildingIdsToDelete = Array.from(
        new Set([dcId, ...uniqueImIds].filter(Boolean)),
      );
      for (const bId of buildingIdsToDelete) {
        try {
          const delDc = await fetch(
            `/api/broker/deal-card/${encodeURIComponent(bId)}/delete`,
            { method: "DELETE" },
          );
          if (delDc.ok) {
            logs.push(`✓ 딜카드·연관 매물(${bId.slice(0, 8)}…) 서버 폐기 완료`);
          } else if (delDc.status === 401 || delDc.status === 403) {
            logs.push(
              "⚠️ 창 A에 본인 중개사 계정이 로그인되어 있는지 확인해 주세요.",
            );
          }
        } catch {
          logs.push(`⚠️ 딜카드(${bId.slice(0, 8)}…) 삭제 요청 실패`);
        }
      }

      if (logs.length === 0) {
        logs.push(
          "이미 삭제되었거나 창 A 로그인 세션을 확인해 주세요 (작업실 목록에서 직접 삭제도 가능합니다).",
        );
      }
      setCleanupReceipt(logs);
      setConfirmingByodCleanup(false);
      showToast("🧹 내 테스트 매물·딜카드·IM 정리 요청을 완료했습니다.");
    } finally {
      setCleanupLoading(false);
    }
  }, [
    scratchByLoop,
    currentLoopId,
    showToast,
    saveAnonymizedByodStats,
    config.cases,
    currentLoop,
    records,
    qaQueryKey,
    sessionId,
    activeCohort,
    telemetry.loop2.seconds,
    telemetry.loop2.hesitations,
  ]);

  const runStorageHygieneCheck = useCallback(() => {
    const found: string[] = [];
    const suspiciousPrefixes = ["memo_transfer", "kakao_text_"];
    try {
      for (const store of [window.localStorage, window.sessionStorage]) {
        for (let i = 0; i < store.length; i += 1) {
          const key = store.key(i) || "";
          if (suspiciousPrefixes.some((p) => key.includes(p))) {
            found.push(key);
          }
        }
      }
    } catch {
      // ignore storage read error
    }
    const result: StorageHygieneResult = {
      checkedAt: new Date().toLocaleTimeString("ko-KR"),
      clean: found.length === 0,
      foundKeys: found,
    };
    setHygieneResult(result);
    showToast(
      result.clean
        ? "🧹 공용 PC 민감 임시 키 잔류 0건 확인!"
        : `⚠️ 잔여 키 ${found.length}건 감지 — 로그아웃 소거를 확인하세요.`,
    );
  }, [showToast]);

  const summaryStats = useMemo(() => {
    let pass = 0;
    let polish = 0;
    let fail = 0;
    let s0Fail = 0;
    for (const step of allSteps) {
      const r = records[step.id];
      if (!r || r.status === "PENDING") continue;
      if (r.status === "PASS") pass += 1;
      else if (r.status === "NEEDS_POLISH") polish += 1;
      else if (r.status === "FAIL") {
        fail += 1;
        const sev = r.overrideSeverity || step.severityOnFail;
        if (sev === "S0") s0Fail += 1;
      }
    }
    const total = allSteps.length;
    const done = pass + polish + fail;
    return { total, done, pass, polish, fail, s0Fail };
  }, [allSteps, records]);

  const buildReportMarkdown = useCallback(() => {
    const verdictHeadline =
      summaryStats.s0Fail > 0
        ? `출시 보류 (S0 치명 결함 ${summaryStats.s0Fail}건)`
        : summaryStats.fail > 0
        ? `수정 후 재검증 필요 (결함 ${summaryStats.fail}건)`
        : summaryStats.done === summaryStats.total && summaryStats.polish === 0
        ? `상용화 최종 승인 (GO — ${summaryStats.total}/${summaryStats.total} 통과)`
        : `검수 진행 (${summaryStats.done}/${summaryStats.total} 완료 · 손질 요청 ${summaryStats.polish}건)`;

    const loop1Label = config.cases[0]?.shortLabel || "Loop 1";
    const loop2Label = config.cases[1]?.shortLabel || "Loop 2";

    const lines: string[] = [
      `# ${config.reportTitle}`,
      "",
      `- **검수자**: ${testerName}${testerOrg ? ` (${testerOrg})` : ""}`,
      `- **세션 ID**: \`${sessionId}\``,
      `- **작성 시각**: ${new Date().toLocaleString("ko-KR")}`,
      `- **종합 판정**: **${verdictHeadline}**`,
      `- **${loop1Label}**: 소요 ${formatDuration(telemetry.loop1.seconds)} · 멈칫함 ${telemetry.loop1.hesitations}회 · 오클릭 ${telemetry.loop1.misclicks}회`,
      `- **${loop2Label}**: 소요 ${formatDuration(telemetry.loop2.seconds)} · 멈칫함 ${telemetry.loop2.hesitations}회 · 오클릭 ${telemetry.loop2.misclicks}회`,
      "",
      `## 1. ${allSteps.length}개 핵심 스텝 판정 요약표`,
      "| 코드 | 시나리오 | 영역 | 수행 창 | 스텝 제목 | 판정 | 메모 |",
      "|:---:|:---:|:---:|:---:|:---|:---:|:---|",
    ];

    for (const step of allSteps) {
      const rec = records[step.id];
      const st = rec?.status || "PENDING";
      const note = (rec?.note || "-").replace(/\|/g, "/").replace(/\n/g, " ");
      lines.push(
        `| **${step.id}** | ${step.loopId.toUpperCase()} | ${step.subsystem} | ${step.windowBadge} | ${step.title} | **${st}** | ${note} |`,
      );
    }

    lines.push(
      "",
      "## 2. 검증된 실물 산출물 링크 기록",
      `- Loop 1 딜카드: ${scratchByLoop.loop1.dealCardUrl || "-"}`,
      `- Loop 1 IM 열람 링크: ${scratchByLoop.loop1.imShareUrl || "-"}`,
      `- Loop 1 뉴스레터: ${scratchByLoop.loop1.newsletterUrl || "-"}`,
      `- Loop 2 딜카드: ${scratchByLoop.loop2.dealCardUrl || "-"}`,
      `- Loop 2 매수자 1 IM 링크: ${scratchByLoop.loop2.imShareUrl || "-"}`,
      `- Loop 2 매수자 2 IM 링크: ${scratchByLoop.loop2.secondaryImShareUrl || "-"}`,
      `- Loop 2 뉴스레터: ${scratchByLoop.loop2.newsletterUrl || "-"}`,
      "",
      "## 3. 검수자 종합 의견",
      overallComment.trim() || "(종합 의견 없음)",
    );

    return lines.join("\n");
  }, [
    summaryStats,
    config.reportTitle,
    config.cases,
    testerName,
    testerOrg,
    sessionId,
    telemetry,
    allSteps,
    records,
    scratchByLoop,
    overallComment,
  ]);

  const handleDownloadMarkdown = useCallback(() => {
    const md = buildReportMarkdown();
    const blob = new Blob(["\uFEFF" + md], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${config.reportFilePrefix}_${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("💾 마크다운(.md) 검수 리포트를 내려받았습니다.");
  }, [buildReportMarkdown, config.reportFilePrefix, showToast]);

  const visibleSteps = useMemo(() => {
    if (viewMode === "all") return currentLoop.steps;
    const focusedId = focusedStepByLoop[currentLoopId];
    const matched = currentLoop.steps.find((s) => s.id === focusedId);
    return matched ? [matched] : [currentLoop.steps[0]];
  }, [viewMode, currentLoop, focusedStepByLoop, currentLoopId]);

  const activeScratch = scratchByLoop[currentLoopId];
  const activeProbe = probeResults[currentLoopId];
  const activeTelemetry = telemetry[currentLoopId];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-24">
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-xl border border-slate-700">
          {toastMessage}
        </div>
      )}

      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-5 py-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-slate-900 text-amber-400 font-extrabold text-base shrink-0">
              {config.badgeCode}
            </span>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base sm:text-lg font-extrabold text-slate-900">
                  {config.pageTitle}
                </h1>
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 text-sm font-bold">
                  진행 {summaryStats.done}/{summaryStats.total}
                </span>
                <span className="text-sm text-slate-500 font-medium">
                  {syncStatus === "syncing"
                    ? "서버 저장 중…"
                    : syncStatus === "submitted"
                    ? "최종 제출 완료 ✓"
                    : syncStatus === "synced"
                    ? `자동 저장됨 (${lastSyncedAt || ""})`
                    : "로컬 자동 보관"}
                </span>
              </div>
              <p className="text-sm text-slate-600">{config.pageSubtitle}</p>
            </div>
          </div>

          {activeTab !== "report" && (
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() =>
                  setViewMode((m) => (m === "all" ? "focus" : "all"))
                }
                className="min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-bold cursor-pointer"
              >
                {viewMode === "all"
                  ? "🎯 한 단계씩 집중 보기"
                  : "📑 7단계 전체 펼쳐 보기"}
              </button>
              {inferredPortalRole === "broker" && (
                <a
                  href={appendQaKeyIfPresent(
                    appendQaParamsToHref("/qa-broker/showcase", "broker"),
                  )}
                  data-testid="broker-full-loop-open-showcase-pill"
                  className="min-h-[40px] inline-flex items-center px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-950 border border-indigo-300 text-sm font-bold"
                >
                  [📊 22종 산출물 쇼룸 ↗]
                </a>
              )}
              <a
                href={appendQaKeyIfPresent(config.crossEditionLink.href)}
                className="min-h-[40px] inline-flex items-center px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-950 border border-amber-300 text-sm font-bold"
              >
                {config.crossEditionLink.label}
              </a>
            </div>
          )}
        </div>
      </header>

      <nav
        aria-label="시나리오 및 계측 제어바"
        className="md:sticky md:top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200 shadow-xs"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-5 py-1.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {config.cases.map((c) => {
              const isSelected = activeTab === c.id;
              const loopDone = c.steps.filter(
                (s) => records[s.id] && records[s.id].status !== "PENDING",
              ).length;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(c.id);
                    setTimerLoopId(c.id);
                  }}
                  title={c.shortLabel}
                  className={`min-h-[44px] px-3 py-1.5 rounded-xl text-sm font-extrabold transition cursor-pointer border whitespace-nowrap ${
                    isSelected
                      ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                      : "bg-white hover:bg-slate-100 text-slate-800 border-slate-300"
                  }`}
                >
                  {c.tabLabel} ({loopDone}/{c.steps.length})
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => setActiveTab("report")}
              className={`min-h-[44px] px-3 py-1.5 rounded-xl text-sm font-extrabold transition cursor-pointer border whitespace-nowrap ${
                activeTab === "report"
                  ? "bg-emerald-700 text-white border-emerald-700 shadow-xs"
                  : "bg-emerald-50 hover:bg-emerald-100 text-emerald-950 border-emerald-300"
              }`}
            >
              📋 Sign-off ({summaryStats.done}/{summaryStats.total})
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <div className="flex items-center gap-2 rounded-xl bg-slate-100 pl-3 pr-1 py-0.5 border border-slate-200">
              <span className="text-sm font-bold text-slate-700 whitespace-nowrap">
                {currentLoopId === "loop1" ? "L1" : "L2"}
              </span>
              <span className="font-mono text-base font-extrabold text-slate-900">
                {formatDuration(activeTelemetry.seconds)}
              </span>
              <button
                type="button"
                onClick={() => {
                  setTimerLoopId(currentLoopId);
                  setIsTimerRunning((v) => !v);
                }}
                className="min-h-[44px] px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold cursor-pointer whitespace-nowrap"
              >
                {isTimerRunning && timerLoopId === currentLoopId
                  ? "⏸ 정지"
                  : "▶ 시작"}
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setTelemetry((prev) => ({
                  ...prev,
                  [currentLoopId]: {
                    ...prev[currentLoopId],
                    hesitations: prev[currentLoopId].hesitations + 1,
                  },
                }));
                showToast("🤔 5초 멈칫함 +1 기록됨");
              }}
              className="min-h-[44px] px-2.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-950 border border-amber-300 text-sm font-extrabold cursor-pointer whitespace-nowrap"
            >
              🤔 멈칫 ({activeTelemetry.hesitations})
            </button>

            <button
              type="button"
              onClick={() => {
                setTelemetry((prev) => ({
                  ...prev,
                  [currentLoopId]: {
                    ...prev[currentLoopId],
                    misclicks: prev[currentLoopId].misclicks + 1,
                  },
                }));
                showToast("❌ 오클릭 +1 기록됨");
              }}
              className="min-h-[44px] px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-900 border border-rose-300 text-sm font-extrabold cursor-pointer whitespace-nowrap"
            >
              ❌ 오클릭 ({activeTelemetry.misclicks})
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-5 pt-3 space-y-3.5">
        <details className="group rounded-2xl bg-white border border-slate-200 px-4 py-2.5 shadow-xs">
          <summary className="flex flex-wrap items-center justify-between gap-2 cursor-pointer list-none">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-extrabold text-slate-900">
                🖥️ 시작 전 창 분리 안내
              </span>
              <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-900 font-bold">
                창 A: PC 크롬(중개사 로그인)
              </span>
              <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-950 font-bold">
                창 B: 스마트폰 카톡(매수자 1)
              </span>
              <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-950 font-bold">
                창 C: PC 시크릿 창(매수자 2)
              </span>
            </div>
            <span className="text-sm font-bold text-blue-700">
              상세 역할 보기 ▾
            </span>
          </summary>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-3 mt-2.5 border-t border-slate-100">
            {config.windowRoles.map((w) => (
              <div
                key={w.id}
                className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-extrabold text-slate-900">
                    {w.title}
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-slate-200 text-slate-800 text-sm font-bold">
                    {w.badge}
                  </span>
                </div>
                <p className="text-sm font-semibold text-blue-900">{w.device}</p>
                <p className="text-sm text-slate-600">{w.purpose}</p>
              </div>
            ))}
          </div>
        </details>

        {activeTab === "report" ? (
          <section className="rounded-2xl bg-white border border-slate-200 p-6 shadow-xs space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <h2 className="text-xl font-extrabold text-slate-900">
                  2선 풀루프 통합 Sign-off 리포트
                </h2>
                <p className="text-sm text-slate-600 mt-1">
                  총 {summaryStats.total}개 스텝 중 통과 {summaryStats.pass}건 · 손질 필요{" "}
                  {summaryStats.polish}건 · 결함 {summaryStats.fail}건 (치명 S0{" "}
                  {summaryStats.s0Fail}건)
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    handleCopy(
                      buildReportMarkdown(),
                      "통합 검수 마크다운",
                      "report-md",
                    )
                  }
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-900 text-sm font-extrabold cursor-pointer"
                >
                  📋 마크다운 복사
                </button>
                <button
                  type="button"
                  onClick={handleDownloadMarkdown}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-extrabold cursor-pointer"
                >
                  💾 .md 리포트 다운로드
                </button>
                <button
                  type="button"
                  onClick={() => void syncToServer("submit")}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-extrabold cursor-pointer"
                >
                  ☁️ 서버 최종 제출
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="fl-tester-name"
                  className="block text-sm font-bold text-slate-800 mb-1"
                >
                  검수자 성명 / 직책
                </label>
                <input
                  id="fl-tester-name"
                  type="text"
                  value={testerName}
                  onChange={(e) => setTesterName(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3.5 py-2 text-base"
                  placeholder="예: 김크리 대표공인중개사"
                />
              </div>
              <div>
                <label
                  htmlFor="fl-tester-org"
                  className="block text-sm font-bold text-slate-800 mb-1"
                >
                  소속 중개법인 / 팀
                </label>
                <input
                  id="fl-tester-org"
                  type="text"
                  value={testerOrg}
                  onChange={(e) => setTesterOrg(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 px-3.5 py-2 text-base"
                  placeholder="예: 제이에스부동산중개법인"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="fl-overall-comment"
                className="block text-sm font-bold text-slate-800 mb-1"
              >
                현업 체감 종합 코멘트 (5초 이상 망설인 구간 · 문구 개선 의견 · 발송 품격 총평)
              </label>
              <textarea
                id="fl-overall-comment"
                rows={4}
                value={overallComment}
                onChange={(e) => setOverallComment(e.target.value)}
                className="w-full rounded-xl border border-slate-300 p-3.5 text-base"
                placeholder="실제 고객에게 카톡·이메일로 발송한다고 가정했을 때 개선이 필요한 지점을 자유롭게 남겨 주세요."
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-100 text-slate-800">
                    <th className="p-3 font-extrabold">코드</th>
                    <th className="p-3 font-extrabold">영역</th>
                    <th className="p-3 font-extrabold">수행 창</th>
                    <th className="p-3 font-extrabold">스텝 제목</th>
                    <th className="p-3 font-extrabold">판정</th>
                    <th className="p-3 font-extrabold">메모</th>
                  </tr>
                </thead>
                <tbody>
                  {allSteps.map((st) => {
                    const rec = records[st.id];
                    const status = rec?.status || "PENDING";
                    return (
                      <tr
                        key={st.id}
                        className="border-b border-slate-100 hover:bg-slate-50"
                      >
                        <td className="p-3 font-mono font-bold">{st.id}</td>
                        <td className="p-3 font-semibold">{st.subsystem}</td>
                        <td className="p-3">{st.windowBadge}</td>
                        <td className="p-3 font-medium">{st.title}</td>
                        <td className="p-3 font-extrabold">
                          {status === "PASS"
                            ? "✅ 통과"
                            : status === "NEEDS_POLISH"
                            ? "✨ 손질 필요"
                            : status === "FAIL"
                            ? `🚨 결함 (${rec?.overrideSeverity || st.severityOnFail})`
                            : "⏳ 대기"}
                        </td>
                        <td className="p-3 text-slate-600">
                          {rec?.note || "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            <div className="lg:col-span-8 space-y-3.5">
              <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-xs space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-0.5 rounded-md bg-slate-900 text-amber-300 text-sm font-extrabold">
                        {currentLoop.code} · {currentLoop.dealCode}
                      </span>
                      <span className="text-sm font-bold text-blue-800">
                        권장 {currentLoop.targetMinutes}분 ·{" "}
                        {currentLoop.deviceSetup}
                      </span>
                    </div>
                    <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
                      {currentLoop.title}
                    </h2>
                    <p className="text-sm text-slate-600">
                      {currentLoop.subtitle}
                    </p>
                  </div>

                  {(currentLoop.sampleKitZipUrl ||
                    currentLoop.csvDownloadUrl ||
                    currentLoop.secondarySheetDownloadUrl) && (
                    <div className="flex flex-wrap items-center gap-2">
                      {currentLoop.sampleKitZipUrl && (
                        <a
                          href={appendQaKeyIfPresent(currentLoop.sampleKitZipUrl)}
                          className="min-h-[42px] inline-flex items-center px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-extrabold shadow-xs"
                        >
                          📦 전체 테스트 자료 ZIP 받기
                        </a>
                      )}
                      {currentLoop.csvDownloadUrl && (
                        <a
                          href={appendQaKeyIfPresent(currentLoop.csvDownloadUrl)}
                          className="min-h-[42px] inline-flex items-center px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-900 text-sm font-bold border border-slate-300"
                        >
                          {currentLoop.primarySheetLabel || "📊 임대 현황 CSV"}
                        </a>
                      )}
                      {currentLoop.secondarySheetDownloadUrl && (
                        <a
                          href={appendQaKeyIfPresent(currentLoop.secondarySheetDownloadUrl)}
                          className="min-h-[42px] inline-flex items-center px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-950 text-sm font-bold border border-amber-300"
                        >
                          {currentLoop.secondarySheetLabel || "📊 안정화 시트"}
                        </a>
                      )}
                    </div>
                  )}
                </div>

                {currentLoop.byodSafetyNotice && (
                  <div
                    data-testid="byod-safety-notice-banner"
                    className="rounded-xl bg-emerald-50 border border-emerald-300 p-3 text-sm font-bold text-emerald-950 leading-relaxed"
                  >
                    🛡️ {currentLoop.byodSafetyNotice}
                  </div>
                )}

                <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-sm">
                  <div>
                    <span className="font-bold text-slate-700">대상 실매물: </span>
                    <span className="font-extrabold text-slate-900">
                      {currentLoop.propertyName} ({currentLoop.askingPriceReadout})
                    </span>
                  </div>
                  <div>
                    <span className="font-bold text-slate-700">대장 기준 면적: </span>
                    <span className="font-mono font-bold text-slate-900">
                      {currentLoop.isByodMode
                        ? "대장 자동 연동 면적 ↔ 현장 실면적 일치 여부 확인"
                        : `대지 ${currentLoop.groundTruth.expectedLandAreaSqm}㎡ (약 ${currentLoop.groundTruth.expectedLandAreaPyeong.toFixed(1)}평) / 연면적 ${currentLoop.groundTruth.expectedGfaSqm}㎡ (약 ${currentLoop.groundTruth.expectedGfaPyeong.toFixed(1)}평)`}
                    </span>
                  </div>
                  <div>
                    <span className="font-bold text-slate-700">보증금·월세: </span>
                    <span className="text-slate-800">
                      {currentLoop.groundTruth.expectedDepositSummary}
                    </span>
                  </div>
                  <div>
                    <span className="font-bold text-slate-700">점유·수익률: </span>
                    <span className="text-slate-800">
                      {currentLoop.groundTruth.expectedYieldSummary}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-0.5">
                  <span className="text-sm text-slate-500">
                    {currentLoop.images.length > 0
                      ? `ZIP을 받지 않아도 아래에서 현장 사진 ${currentLoop.images.length}장을 개별 저장할 수 있습니다.`
                      : "검수 시 눈여겨볼 현업 핵심 포인트를 확인해 보세요."}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowAssetsDrawer((v) => !v)}
                    className="min-h-[38px] px-3 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-bold border border-slate-300 cursor-pointer shrink-0"
                  >
                    {showAssetsDrawer
                      ? "📸 사진·확인 포인트 접기 ▴"
                      : currentLoop.images.length > 0
                      ? `📸 현장 사진 ${currentLoop.images.length}장 미리보기 · 개별 받기 ▾`
                      : "🎯 현업 집중 포인트 3가지 보기 ▾"}
                  </button>
                </div>

                {showAssetsDrawer && (
                  <div className="space-y-3 pt-2.5 border-t border-slate-200">
                    {currentLoop.images.length > 0 && (
                      <div>
                        <h3 className="text-sm font-extrabold text-slate-900 mb-2">
                          현장 사진 {currentLoop.images.length}장 미리보기 (ZIP 일괄 또는 개별 저장)
                        </h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                          {currentLoop.images.map((img) => (
                            <div
                              key={img.filename}
                              className="rounded-xl border border-slate-200 p-2 bg-slate-50 flex flex-col justify-between gap-2"
                            >
                              <div className="flex items-start gap-2">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={appendQaKeyIfPresent(img.previewUrl)}
                                  alt={img.caption}
                                  className="w-12 h-12 rounded-lg object-cover border border-slate-200 bg-white shrink-0"
                                />
                                <div className="min-w-0">
                                  <p className="text-sm font-bold text-slate-900 truncate">
                                    {img.roleLabel}
                                  </p>
                                  <p className="text-sm text-slate-600 line-clamp-2">
                                    {img.caption}
                                  </p>
                                </div>
                              </div>
                              <a
                                href={appendQaKeyIfPresent(img.downloadUrl)}
                                className="min-h-[36px] inline-flex items-center justify-center rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-sm font-bold text-slate-800"
                              >
                                ⬇️ 사진 파일 저장
                              </a>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <h3 className="text-sm font-extrabold text-slate-900 mb-2">
                        이번 매물 핵심 확인 포인트 ({currentLoop.domainTraps.length}가지)
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                        {currentLoop.domainTraps.map((tr) => (
                          <div
                            key={tr.code}
                            className="rounded-xl bg-amber-50/70 border border-amber-200 p-2.5 space-y-1"
                          >
                            <div className="text-sm font-extrabold text-amber-950">
                              [{tr.code}] {tr.title}
                            </div>
                            <p className="text-sm text-slate-700">{tr.detail}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {viewMode === "focus" && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {currentLoop.steps.map((s) => {
                    const isFocused = focusedStepByLoop[currentLoopId] === s.id;
                    const st = records[s.id]?.status || "PENDING";
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() =>
                          setFocusedStepByLoop((prev) => ({
                            ...prev,
                            [currentLoopId]: s.id,
                          }))
                        }
                        className={`min-h-[40px] px-3 py-1.5 rounded-xl text-sm font-bold border cursor-pointer ${
                          isFocused
                            ? "bg-slate-900 text-white border-slate-900"
                            : "bg-white text-slate-800 border-slate-300 hover:bg-slate-100"
                        }`}
                      >
                        {st === "PASS"
                          ? "✅ "
                          : st === "FAIL"
                          ? "🚨 "
                          : st === "NEEDS_POLISH"
                          ? "✨ "
                          : ""}
                        Step {s.stepNumber}. {formatSubsystemLabel(s.subsystem)}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="space-y-3">
                {visibleSteps.map((step) => {
                  const rec = records[step.id] || {
                    status: "PENDING" as FullLoopVerdict,
                    note: "",
                  };
                  return (
                    <article
                      key={step.id}
                      className={`rounded-2xl bg-white border p-4 shadow-xs space-y-3 transition ${
                        rec.status === "PASS"
                          ? "border-emerald-300"
                          : rec.status === "FAIL"
                          ? "border-rose-400"
                          : rec.status === "NEEDS_POLISH"
                          ? "border-amber-300"
                          : "border-slate-200"
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-2.5 py-0.5 rounded-md bg-slate-900 text-white font-mono text-sm font-extrabold">
                              {step.id}
                            </span>
                            <span className="px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-800 text-sm font-bold">
                              {formatSubsystemLabel(step.subsystem)}
                            </span>
                            <span
                              className={`px-2.5 py-0.5 rounded-md border text-sm font-extrabold ${getWindowBadgeClass(
                                step.windowBadge,
                              )}`}
                            >
                              {step.windowBadge}
                            </span>
                            <span className="text-sm text-slate-500 font-semibold">
                              목표 {step.targetMinutes}분 · 실패 시 기본{" "}
                              {step.severityOnFail}
                            </span>
                          </div>
                          <h3 className="text-base sm:text-lg font-extrabold text-slate-900">
                            Step {step.stepNumber}. {step.title}
                          </h3>
                        </div>

                        {step.workspaceHref && (
                          <a
                            href={buildQaWorkspaceHref(step.workspaceHref)}
                            target="_blank"
                            rel="noopener noreferrer"
                            data-testid={`step-workspace-launch-${step.id}`}
                            className="min-h-[42px] shrink-0 inline-flex items-center px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-extrabold shadow-xs"
                          >
                            🚀 {step.workspaceLabel || "작업 화면 새 탭 열기"}
                          </a>
                        )}
                      </div>

                      {step.copySnippets.length > 0 && (
                        <div className="rounded-xl bg-blue-50/60 border border-blue-200 p-3.5 space-y-2">
                          <div className="text-sm font-extrabold text-blue-950">
                            1-Click 입력값 복사 (타자 치지 말고 눌러서 붙여넣으세요)
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {step.copySnippets.map((sn) => {
                              const isCopied = copiedId === sn.id;
                              return (
                                <button
                                  key={sn.id}
                                  type="button"
                                  onClick={() =>
                                    void handleCopy(sn.value, sn.label, sn.id)
                                  }
                                  className={`min-h-[44px] text-left p-2.5 rounded-xl border transition cursor-pointer flex items-center justify-between gap-2 ${
                                    isCopied
                                      ? "bg-emerald-600 text-white border-emerald-700"
                                      : "bg-white hover:bg-blue-50 text-slate-900 border-blue-200"
                                  }`}
                                >
                                  <div className="min-w-0">
                                    <div className="text-sm font-extrabold truncate">
                                      {isCopied ? `✓ ${sn.label} 복사됨` : `📋 ${sn.label}`}
                                    </div>
                                    <div
                                      className={`text-sm truncate ${
                                        isCopied
                                          ? "text-emerald-100"
                                          : "text-slate-500"
                                      }`}
                                    >
                                      {sn.targetHint}
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <ol className="space-y-1.5 list-decimal list-inside text-base text-slate-800 leading-relaxed">
                        {step.actionChecklist.map((act, idx) => (
                          <li key={idx} className="pl-1">
                            {act}
                          </li>
                        ))}
                      </ol>

                      {step.inlineScratchFields &&
                        step.inlineScratchFields.length > 0 && (
                          <div
                            data-testid={`step-inline-scratch-${step.id}`}
                            className="rounded-xl bg-emerald-50/70 border border-emerald-300 p-3 space-y-2.5"
                          >
                            {step.inlineScratchFields.map((spec) => (
                              <div key={`${step.id}-${spec.field}`} className="space-y-1">
                                <label
                                  htmlFor={`inline-${step.id}-${spec.field}`}
                                  className="block text-sm font-extrabold text-emerald-950"
                                >
                                  {spec.label}
                                </label>
                                {spec.helperText && (
                                  <p className="text-sm text-emerald-900">
                                    {spec.helperText}
                                  </p>
                                )}
                                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                                  <input
                                    id={`inline-${step.id}-${spec.field}`}
                                    type="text"
                                    value={activeScratch[spec.field] || ""}
                                    onChange={(e) =>
                                      handleUpdateScratch(
                                        currentLoopId,
                                        spec.field,
                                        e.target.value,
                                      )
                                    }
                                    placeholder={spec.placeholder}
                                    className="flex-1 min-h-[42px] rounded-xl border border-emerald-400 bg-white px-3 py-1.5 text-sm font-medium text-slate-900"
                                  />
                                  {spec.field !== "byodForbiddenKeywords" &&
                                    spec.field !== "subscriberContact" &&
                                    isRedPenLaunchableUrl(
                                      activeScratch[spec.field],
                                    ) && (
                                      <a
                                        href={buildQaWorkspaceHref(
                                          (activeScratch[spec.field] || "").trim(),
                                        )}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        data-testid={`open-redpen-${spec.field}`}
                                        className="min-h-[40px] px-3 py-1.5 inline-flex items-center justify-center rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-900 border border-rose-300 text-sm font-extrabold whitespace-nowrap shrink-0"
                                      >
                                        [✏️ 빨간펜 켜고 열기 ↗]
                                      </a>
                                    )}
                                  <button
                                    type="button"
                                    disabled={probeLoading}
                                    onClick={() => void runLiveProbe(currentLoopId)}
                                    className="min-h-[42px] px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-sm font-extrabold cursor-pointer shrink-0"
                                  >
                                    {probeLoading ? "점검 중…" : "🔍 이 링크 바로 점검"}
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                      {currentLoop.enableByodCleanup &&
                        step.stepNumber === currentLoop.steps.length && (
                          <div
                            data-testid="step-inline-byod-cleanup"
                            className="rounded-xl bg-emerald-50/80 border border-emerald-300 p-3.5 space-y-2.5"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <div className="text-sm font-extrabold text-emerald-950">
                                  🛡️ 내 매물 비공개 확인 & 테스트 매물 즉시 삭제 (스크롤 없이 바로 실행)
                                </div>
                                <p className="text-sm text-emerald-900 mt-0.5">
                                  1) 먼저 비공개 확인을 실행한 뒤, 2) 서버에 테스트 데이터를 남기지 않으려면 아래 초록색 삭제 버튼을 누르세요.
                                </p>
                              </div>
                              <button
                                type="button"
                                disabled={probeLoading}
                                onClick={() => void runLiveProbe(currentLoopId)}
                                className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-sm font-extrabold cursor-pointer shrink-0"
                              >
                                {probeLoading ? "점검 중…" : "🔍 내 매물 비공개 0건 확인"}
                              </button>
                            </div>

                            {!confirmingByodCleanup ? (
                              <button
                                type="button"
                                onClick={() => setConfirmingByodCleanup(true)}
                                className="w-full min-h-[42px] rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-extrabold cursor-pointer"
                              >
                                🧹 내 테스트 매물·딜카드·IM 즉시 삭제
                              </button>
                            ) : (
                              <div className="rounded-xl bg-rose-50 border border-rose-300 p-3 space-y-2.5">
                                <p className="text-sm font-bold text-rose-950">
                                  입력해 두신 테스트 딜카드와 IM을 지금 바로 서버에서 폐기할까요?
                                </p>
                                <label className="flex items-start gap-2 rounded-lg bg-white/90 border border-rose-200 p-2.5 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    data-testid="step-inline-byod-anonymized-snapshot-checkbox"
                                    checked={saveAnonymizedByodStats}
                                    onChange={(e) =>
                                      setSaveAnonymizedByodStats(e.target.checked)
                                    }
                                    className="mt-1 h-4 w-4 shrink-0"
                                  />
                                  <span className="text-sm font-semibold text-slate-800 leading-snug">
                                    📊 매물 원문·번지·연락처는 100% 영구 삭제하되, 비식별 통계(완주 시간·단계별 판정·빠른 태그 선택)만 서비스 개선용으로 남기기 (권장)
                                  </span>
                                </label>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    disabled={cleanupLoading}
                                    onClick={() => void handleRunByodCleanup()}
                                    className="flex-1 min-h-[40px] rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-sm font-extrabold cursor-pointer"
                                  >
                                    {cleanupLoading ? "삭제 중…" : "네, 지금 삭제"}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={cleanupLoading}
                                    onClick={() => setConfirmingByodCleanup(false)}
                                    className="min-h-[40px] px-3 rounded-xl bg-white border border-slate-300 text-slate-800 text-sm font-bold cursor-pointer"
                                  >
                                    취소
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-sm">
                        <div className="rounded-xl bg-amber-50/70 border border-amber-200 p-2.5">
                          <div className="font-extrabold text-amber-950 mb-0.5">
                            👀 눈으로 확인할 포인트
                          </div>
                          <p className="text-slate-800">{step.humanFocus}</p>
                        </div>
                        <div className="rounded-xl bg-slate-100 border border-slate-200 p-2.5">
                          <div className="font-extrabold text-slate-900 mb-0.5">
                            🤖 자동 점검기가 확인하는 항목
                          </div>
                          <p className="text-slate-700">{step.autoProbeFocus}</p>
                        </div>
                      </div>

                      {step.brokerInsightPrompt && (
                        <div className="rounded-xl bg-indigo-50/70 border border-indigo-200 p-3.5 space-y-2.5">
                          <div className="text-sm font-extrabold text-indigo-950">
                            💬 현업 중개사 특화 의견 — {step.brokerInsightPrompt}
                          </div>
                          {step.brokerQuickTags &&
                            step.brokerQuickTags.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {step.brokerQuickTags.map((tag) => {
                                  const selected = (rec.note || "").includes(
                                    `[${tag}]`,
                                  );
                                  return (
                                    <button
                                      key={tag}
                                      type="button"
                                      onClick={() =>
                                        handleToggleQuickTag(step.id, tag)
                                      }
                                      className={`min-h-[38px] px-3 py-1 rounded-lg border text-sm font-bold transition cursor-pointer ${
                                        selected
                                          ? "bg-indigo-700 text-white border-indigo-800"
                                          : "bg-white hover:bg-indigo-50 text-slate-800 border-indigo-200"
                                      }`}
                                    >
                                      {selected ? `✓ ${tag}` : `+ ${tag}`}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                        </div>
                      )}

                      <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleSetVerdict(step.id, "PASS")}
                            className={`min-h-[42px] px-3.5 py-1.5 rounded-xl text-sm font-extrabold border cursor-pointer ${
                              rec.status === "PASS"
                                ? "bg-emerald-600 text-white border-emerald-700"
                                : "bg-white hover:bg-emerald-50 text-slate-800 border-slate-300"
                            }`}
                          >
                            ✅ 통과
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleSetVerdict(step.id, "NEEDS_POLISH")
                            }
                            className={`min-h-[42px] px-3.5 py-1.5 rounded-xl text-sm font-extrabold border cursor-pointer ${
                              rec.status === "NEEDS_POLISH"
                                ? "bg-amber-500 text-white border-amber-600"
                                : "bg-white hover:bg-amber-50 text-slate-800 border-slate-300"
                            }`}
                          >
                            ✨ 손질 필요
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSetVerdict(step.id, "FAIL")}
                            className={`min-h-[42px] px-3.5 py-1.5 rounded-xl text-sm font-extrabold border cursor-pointer ${
                              rec.status === "FAIL"
                                ? "bg-rose-600 text-white border-rose-700"
                                : "bg-white hover:bg-rose-50 text-slate-800 border-slate-300"
                            }`}
                          >
                            🚨 결함
                          </button>

                          {rec.status === "FAIL" && (
                            <select
                              aria-label={`${step.id} 결함 등급`}
                              value={rec.overrideSeverity || step.severityOnFail}
                              onChange={(e) =>
                                handleSetSeverity(
                                  step.id,
                                  e.target.value as FullLoopSeverity,
                                )
                              }
                              className="min-h-[42px] rounded-xl border border-rose-300 bg-rose-50 px-2.5 text-sm font-bold text-rose-950"
                            >
                              <option value="S0">S0 (출시 차단)</option>
                              <option value="S1">S1 (당일 수정)</option>
                              <option value="S2">S2 (경미 개선)</option>
                            </select>
                          )}
                        </div>

                        <input
                          type="text"
                          value={rec.note}
                          onChange={(e) =>
                            handleSetNote(step.id, e.target.value)
                          }
                          placeholder="멈칫한 지점이나 개선 메모를 한 줄로 적어 주세요"
                          className="flex-1 min-h-[42px] rounded-xl border border-slate-300 px-3 py-1.5 text-sm"
                        />
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>

            <aside className="lg:col-span-4 lg:sticky lg:top-16 space-y-3.5">
              <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-xs space-y-3.5">
                <div>
                  <span className="inline-block px-2.5 py-0.5 rounded-md bg-emerald-100 text-emerald-900 text-sm font-extrabold">
                    자동 점검 도우미
                  </span>
                  <h3 className="text-base sm:text-lg font-extrabold text-slate-900 mt-1">
                    {currentLoop.code} 실시간 링크·면적 자동 점검기
                  </h3>
                  <p className="text-sm text-slate-600 mt-0.5">
                    각 단계 안의 입력칸에 붙여넣은 주소가 여기에 자동 연동됩니다. 아래 파란색 버튼을 누르면 면적·비공개·잠금 상태를 1초 만에 판정합니다.
                  </p>
                </div>

                <div className="space-y-3">
                  <div>
                    <label
                      htmlFor="fl-dc-url"
                      className="block text-sm font-bold text-slate-800 mb-1"
                    >
                      ① 공개 딜카드 링크 (/dc/…)
                    </label>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <input
                        id="fl-dc-url"
                        type="text"
                        value={activeScratch.dealCardUrl}
                        onChange={(e) =>
                          handleUpdateScratch(
                            currentLoopId,
                            "dealCardUrl",
                            e.target.value,
                          )
                        }
                        placeholder="https://www.credeal.net/dc/..."
                        className="flex-1 min-w-[180px] min-h-[42px] rounded-xl border border-slate-300 px-3 py-1.5 text-sm"
                      />
                      {isRedPenLaunchableUrl(activeScratch.dealCardUrl) && (
                        <a
                          href={buildQaWorkspaceHref(
                            activeScratch.dealCardUrl.trim(),
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          data-testid="open-redpen-dealCardUrl"
                          className="min-h-[40px] px-3 py-1.5 inline-flex items-center justify-center rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-900 border border-rose-300 text-sm font-extrabold whitespace-nowrap"
                        >
                          [✏️ 빨간펜 켜고 열기 ↗]
                        </a>
                      )}
                    </div>
                  </div>

                  {currentLoop.isByodMode && (
                    <div>
                      <label
                        htmlFor="fl-byod-forbidden"
                        className="block text-sm font-bold text-indigo-950 mb-1"
                      >
                        🔒 내 매물 비공개 확인 키워드 (노출 0건 검증용)
                      </label>
                      <input
                        id="fl-byod-forbidden"
                        data-testid="byod-forbidden-keywords-input"
                        type="text"
                        value={activeScratch.byodForbiddenKeywords || ""}
                        onChange={(e) =>
                          handleUpdateScratch(
                            currentLoopId,
                            "byodForbiddenKeywords",
                            e.target.value,
                          )
                        }
                        placeholder="예: 1364-28, 한빛빌딩, 010-1234-5678 (쉼표 구분)"
                        className="w-full min-h-[42px] rounded-xl border border-indigo-300 bg-indigo-50/40 px-3 py-1.5 text-sm"
                      />
                    </div>
                  )}

                  <div>
                    <label
                      htmlFor="fl-im1-url"
                      className="block text-sm font-bold text-slate-800 mb-1"
                    >
                      ② 매수자 1 IM 열람 링크 (/im-lite/…?)
                    </label>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <input
                        id="fl-im1-url"
                        type="text"
                        value={activeScratch.imShareUrl}
                        onChange={(e) =>
                          handleUpdateScratch(
                            currentLoopId,
                            "imShareUrl",
                            e.target.value,
                          )
                        }
                        placeholder="/im-lite/...?"
                        className="flex-1 min-w-[180px] min-h-[42px] rounded-xl border border-slate-300 px-3 py-1.5 text-sm"
                      />
                      {isRedPenLaunchableUrl(activeScratch.imShareUrl) && (
                        <a
                          href={buildQaWorkspaceHref(
                            activeScratch.imShareUrl.trim(),
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          data-testid="open-redpen-imShareUrl"
                          className="min-h-[40px] px-3 py-1.5 inline-flex items-center justify-center rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-900 border border-rose-300 text-sm font-extrabold whitespace-nowrap"
                        >
                          [✏️ 빨간펜 켜고 열기 ↗]
                        </a>
                      )}
                    </div>
                  </div>

                  {currentLoopId === "loop2" && (
                    <div>
                      <label
                        htmlFor="fl-im2-url"
                        className="block text-sm font-bold text-amber-950 mb-1"
                      >
                        ③ 매수자 2 IM 열람 링크 (창 C 직교 분리 비교용)
                      </label>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <input
                          id="fl-im2-url"
                          type="text"
                          value={activeScratch.secondaryImShareUrl}
                          onChange={(e) =>
                            handleUpdateScratch(
                              "loop2",
                              "secondaryImShareUrl",
                              e.target.value,
                            )
                          }
                          placeholder={config.secondaryBuyerPlaceholder}
                          className="flex-1 min-w-[180px] min-h-[42px] rounded-xl border border-amber-300 bg-amber-50/40 px-3 py-1.5 text-sm"
                        />
                        {isRedPenLaunchableUrl(
                          activeScratch.secondaryImShareUrl,
                        ) && (
                          <a
                            href={buildQaWorkspaceHref(
                              activeScratch.secondaryImShareUrl.trim(),
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            data-testid="open-redpen-secondaryImShareUrl"
                            className="min-h-[40px] px-3 py-1.5 inline-flex items-center justify-center rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-900 border border-rose-300 text-sm font-extrabold whitespace-nowrap"
                          >
                            [✏️ 빨간펜 켜고 열기 ↗]
                          </a>
                        )}
                      </div>
                    </div>
                  )}

                  <div>
                    <label
                      htmlFor="fl-nl-url"
                      className="block text-sm font-bold text-slate-800 mb-1"
                    >
                      ④ 발행된 공개 뉴스레터 링크 (/magazine/…)
                    </label>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <input
                        id="fl-nl-url"
                        type="text"
                        value={activeScratch.newsletterUrl}
                        onChange={(e) =>
                          handleUpdateScratch(
                            currentLoopId,
                            "newsletterUrl",
                            e.target.value,
                          )
                        }
                        placeholder="/magazine/.../2026-11-..."
                        className="flex-1 min-w-[180px] min-h-[42px] rounded-xl border border-slate-300 px-3 py-1.5 text-sm"
                      />
                      {isRedPenLaunchableUrl(activeScratch.newsletterUrl) && (
                        <a
                          href={buildQaWorkspaceHref(
                            activeScratch.newsletterUrl.trim(),
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          data-testid="open-redpen-newsletterUrl"
                          className="min-h-[40px] px-3 py-1.5 inline-flex items-center justify-center rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-900 border border-rose-300 text-sm font-extrabold whitespace-nowrap"
                        >
                          [✏️ 빨간펜 켜고 열기 ↗]
                        </a>
                      )}
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="fl-sub-contact"
                      className="block text-sm font-bold text-slate-800 mb-1"
                    >
                      ⑤ 매수자·구독자 연락처 또는 이메일
                    </label>
                    <input
                      id="fl-sub-contact"
                      type="text"
                      value={activeScratch.subscriberContact}
                      onChange={(e) =>
                        handleUpdateScratch(
                          currentLoopId,
                          "subscriberContact",
                          e.target.value,
                        )
                      }
                      placeholder={config.defaultSubscribers.loop1}
                      className="w-full min-h-[42px] rounded-xl border border-slate-300 px-3 py-1.5 text-sm"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  disabled={probeLoading}
                  onClick={() => void runLiveProbe(currentLoopId)}
                  className="w-full min-h-[46px] rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-extrabold cursor-pointer shadow-xs"
                >
                  {probeLoading
                    ? "점검 중…"
                    : "🔍 입력한 링크·면적 자동 점검 실행"}
                </button>

                {activeProbe && (
                  <div className="space-y-2.5 pt-2 border-t border-slate-200 text-sm">
                    {activeProbe.groundTruthOracleCheck && (
                      <div
                        className={`rounded-xl p-3 border ${
                          activeProbe.groundTruthOracleCheck
                            .singleParcelTrapTriggered
                            ? "bg-rose-50 border-rose-300 text-rose-950"
                            : activeProbe.groundTruthOracleCheck.landMatch &&
                              activeProbe.groundTruthOracleCheck.gfaMatch
                            ? "bg-emerald-50 border-emerald-300 text-emerald-950"
                            : "bg-slate-50 border-slate-300 text-slate-800"
                        }`}
                      >
                        <div className="font-extrabold">
                          📐 공적장부 면적 일치 점검
                        </div>
                        <p className="mt-0.5">
                          {activeProbe.groundTruthOracleCheck.statusLabel}
                        </p>
                        {activeProbe.groundTruthOracleCheck.hiddenSectionCount >
                          0 && (
                          <p className="mt-0.5 font-semibold">
                            숨김 처리된 섹션:{" "}
                            {
                              activeProbe.groundTruthOracleCheck
                                .hiddenSectionCount
                            }
                            개 감지됨
                          </p>
                        )}
                      </div>
                    )}

                    {activeProbe.dealCardCheck && (
                      <div
                        className={`rounded-xl p-3 border ${
                          activeProbe.dealCardCheck.exists &&
                          activeProbe.dealCardCheck.addressBlindPass &&
                          activeProbe.dealCardCheck.brokerPhonePass
                            ? "bg-emerald-50 border-emerald-300 text-emerald-950"
                            : "bg-rose-50 border-rose-300 text-rose-950"
                        }`}
                      >
                        <div className="font-extrabold">🃏 딜카드 블라인드</div>
                        <p className="mt-0.5">
                          {activeProbe.dealCardCheck.statusLabel}
                        </p>
                      </div>
                    )}

                    {activeProbe.shareLinkCheck && (
                      <div
                        className={`rounded-xl p-3 border ${
                          activeProbe.shareLinkCheck.isLocked
                            ? "bg-amber-50 border-amber-300 text-amber-950"
                            : "bg-emerald-50 border-emerald-300 text-emerald-950"
                        }`}
                      >
                        <div className="font-extrabold">
                          🔗 매수자 1 열람 링크 상태
                        </div>
                        <p className="mt-0.5">
                          {activeProbe.shareLinkCheck.statusLabel}
                        </p>
                      </div>
                    )}

                    {activeProbe.secondaryShareLinkCheck && (
                      <div
                        className={`rounded-xl p-3 border ${
                          activeProbe.secondaryShareLinkCheck.isLocked
                            ? "bg-amber-50 border-amber-300 text-amber-950"
                            : "bg-emerald-50 border-emerald-300 text-emerald-950"
                        }`}
                      >
                        <div className="font-extrabold">
                          🔗 매수자 2 열람 링크 비교
                        </div>
                        <p className="mt-0.5">
                          {activeProbe.secondaryShareLinkCheck.statusLabel}
                        </p>
                      </div>
                    )}

                    {activeProbe.newsletterCheck && (
                      <div
                        className={`rounded-xl p-3 border ${
                          activeProbe.newsletterCheck.existsAndPublished &&
                          activeProbe.newsletterCheck.addressBlindPass &&
                          activeProbe.newsletterCheck.noRawUuidPass
                            ? "bg-emerald-50 border-emerald-300 text-emerald-950"
                            : "bg-rose-50 border-rose-300 text-rose-950"
                        }`}
                      >
                        <div className="font-extrabold">
                          📰 공개 뉴스레터 무결성
                        </div>
                        <p className="mt-0.5">
                          {activeProbe.newsletterCheck.existsAndPublished
                            ? `발행 확인 · 지번 비노출 ${
                                activeProbe.newsletterCheck.addressBlindPass
                                  ? "통과"
                                  : "위반"
                              } · 연결 매물 ${
                                activeProbe.newsletterCheck.dealCount ?? 0
                              }건`
                            : activeProbe.newsletterCheck.error ||
                              "미발행 또는 경로 확인 필요"}
                        </p>
                      </div>
                    )}

                    {(activeProbe.subscriberCheck || activeProbe.inboxCheck) && (() => {
                      const subCheck = activeProbe.subscriberCheck;
                      const inboxChk = activeProbe.inboxCheck ?? subCheck?.inboxCheck;
                      const foundInClientOrInbox = Boolean(
                        subCheck?.foundInBrokerClients || inboxChk?.foundInInbox,
                      );
                      return (
                        <div className="rounded-xl p-3 border bg-slate-50 border-slate-300 text-slate-900">
                          <div className="font-extrabold">
                            💬 고객 소통 · 구독자 인입
                          </div>
                          <p className="mt-0.5">
                            {subCheck?.checked === false
                              ? "중개사 로그인 상태에서 재실행하면 인입 여부를 확인합니다."
                              : `구독 명단: ${
                                  subCheck?.foundInMagazineSubscribers
                                    ? "등록됨"
                                    : "미확인"
                                } · 소통함/고객 목록: ${
                                  foundInClientOrInbox
                                    ? inboxChk?.foundInInbox && subCheck?.foundInBrokerClients
                                      ? "등록됨 (소통함+CRM)"
                                      : inboxChk?.foundInInbox
                                        ? `등록됨 (소통함${inboxChk.gateStatus ? ` · ${inboxChk.gateStatus}` : ""})`
                                        : "등록됨 (CRM)"
                                    : "미확인"
                                }`}
                          </p>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              {currentLoop.enableByodCleanup && (
                <div
                  data-testid="byod-cleanup-card"
                  className="rounded-2xl bg-white border-2 border-emerald-300 p-5 shadow-xs space-y-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-md bg-emerald-100 text-emerald-950 text-sm font-extrabold">
                      비밀보호 안심 장치
                    </span>
                    <h3 className="text-base font-extrabold text-slate-900">
                      내 테스트 매물 원클릭 완전 삭제
                    </h3>
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed">
                    검수를 마친 뒤 위 ①·②번에 입력된 내 매물 딜카드·IM·공유 링크를 서버에서 즉시 폐기합니다 (창 A 본인 로그인 계정 소유분만 안전하게 삭제됩니다).
                  </p>

                  {!confirmingByodCleanup ? (
                    <button
                      type="button"
                      data-testid="byod-cleanup-trigger-btn"
                      onClick={() => setConfirmingByodCleanup(true)}
                      className="w-full min-h-[44px] rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-extrabold cursor-pointer"
                    >
                      🧹 내 테스트 매물·딜카드·IM 즉시 삭제
                    </button>
                  ) : (
                    <div className="rounded-xl bg-rose-50 border border-rose-300 p-3 space-y-2.5">
                      <p className="text-sm font-bold text-rose-950">
                        위 ①·②번 링크에 해당하는 테스트 딜카드와 IM을 지금 바로 폐기할까요?
                      </p>
                      <label className="flex items-start gap-2 rounded-lg bg-white/90 border border-rose-200 p-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          data-testid="byod-anonymized-snapshot-checkbox"
                          checked={saveAnonymizedByodStats}
                          onChange={(e) =>
                            setSaveAnonymizedByodStats(e.target.checked)
                          }
                          className="mt-1 h-4 w-4 shrink-0"
                        />
                        <span className="text-sm font-semibold text-slate-800 leading-snug">
                          📊 매물 원문·번지·연락처는 100% 영구 삭제하되, 비식별 통계(완주 시간·단계별 판정·빠른 태그 선택)만 서비스 개선용으로 남기기 (권장)
                        </span>
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          data-testid="byod-cleanup-confirm-btn"
                          disabled={cleanupLoading}
                          onClick={() => void handleRunByodCleanup()}
                          className="flex-1 min-h-[42px] rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-sm font-extrabold cursor-pointer"
                        >
                          {cleanupLoading ? "삭제 중…" : "네, 지금 삭제"}
                        </button>
                        <button
                          type="button"
                          disabled={cleanupLoading}
                          onClick={() => setConfirmingByodCleanup(false)}
                          className="min-h-[42px] px-3.5 rounded-xl bg-white border border-slate-300 text-slate-800 text-sm font-bold cursor-pointer"
                        >
                          취소
                        </button>
                      </div>
                    </div>
                  )}

                  {cleanupReceipt && cleanupReceipt.length > 0 && (
                    <div
                      data-testid="byod-cleanup-receipt"
                      className="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-1 text-sm font-semibold text-slate-800"
                    >
                      {cleanupReceipt.map((line, i) => (
                        <div key={i}>{line}</div>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 pt-1">
                    <a
                      href={buildQaWorkspaceHref("/broker/w/dealcards")}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[38px] inline-flex items-center px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-bold"
                    >
                      딜카드 목록 직접 확인 ↗
                    </a>
                    <a
                      href={buildQaWorkspaceHref("/broker/w/im")}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[38px] inline-flex items-center px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-bold"
                    >
                      IM 목록 직접 확인 ↗
                    </a>
                  </div>
                </div>
              )}

              <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-xs space-y-3">
                <h3 className="text-base font-extrabold text-slate-900">
                  공용 PC 로그아웃 잔여 데이터 점검 (Loop 2 마감용)
                </h3>
                <p className="text-sm text-slate-600">
                  로그아웃 직후 이 버튼을 눌러 브라우저 저장소에 이전 매물 메모나 카톡 문구가 남지 않았는지 확인합니다.
                </p>
                <button
                  type="button"
                  onClick={runStorageHygieneCheck}
                  className="w-full min-h-[44px] rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-900 border border-slate-300 text-sm font-extrabold cursor-pointer"
                >
                  🧹 공용 PC 브라우저 잔여 키 점검
                </button>
                {hygieneResult && (
                  <div
                    className={`rounded-xl p-3 border text-sm font-bold ${
                      hygieneResult.clean
                        ? "bg-emerald-50 border-emerald-300 text-emerald-950"
                        : "bg-rose-50 border-rose-300 text-rose-950"
                    }`}
                  >
                    {hygieneResult.clean
                      ? `✓ 점검 완료 (${hygieneResult.checkedAt}) — 민감 임시 키 0건`
                      : `⚠️ 잔여 키 감지: ${hygieneResult.foundKeys.join(", ")}`}
                  </div>
                )}
              </div>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
