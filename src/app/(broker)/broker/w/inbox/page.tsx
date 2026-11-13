"use client";

import React, { useState, useEffect, useMemo, useRef, Suspense } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import { UndoToastProvider, useUndoToast } from "@/components/workspace/UndoConfirmToast";
import { copyText } from "@/lib/ux/clipboard";
import { shareKakaoFeed } from "@/lib/kakao/share";

export type InboxFilterType = "todo" | "views" | "vip" | "clients" | "all";
export type InboxEditorTabType = "todo" | "message" | "history";

export interface RecipientEvent {
  id: string;
  eventType: "open" | "dwell" | "gate_request" | "share";
  description: string;
  timestamp: string;
  sectionName?: string;
}

export interface InboxThreadItem {
  id: string;
  clientName: string;
  clientPhone: string;
  clientCompany?: string;
  clientGrade: "VIP" | "일반" | "잠재";
  buildingTitle: string;
  buildingId: string;
  latestEvent: string;
  detail?: string;
  cleanMessage?: string;
  gateStatus?: "pending" | "approved" | "rejected" | "none";
  memo?: string;
  updatedAt: string;
  openCount: number;
  isRead: boolean;
  status: "pending_gate" | "high_interest" | "active" | "revoked";
  shareToken: string;
  shareUrl?: string;
  events: RecipientEvent[];
  budget: string;
  preferredRegion: string;
  focusedSections?: string[];
  hasCorrectionNotice?: boolean;
  correctionMessage?: string;
  newsletterSubscribed?: boolean;
}

export interface BrokerInventoryDeal {
  buildingId: string;
  title: string;
  region: string;
  priceBand: string;
  askingPriceManwon: number;
  capRatePct: number;
}

export interface InboxWorkspacePageProps {
  initialThreads?: InboxThreadItem[];
}

const STORAGE_KEY_PREFIX = "credeal-w-inbox-v5";
const LEGACY_STORAGE_KEYS = [
  "credeal-w-inbox-v4",
  "credeal-w-inbox-v3",
  "credeal-w-inbox-v2",
];

function formatPhoneKo(raw: string): string {
  if (raw.includes("@")) return raw;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("01")) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    if (digits.startsWith("02")) {
      return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
    }
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 9 && digits.startsWith("02")) {
    return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
  }
  return raw;
}

function sanitizeClientPhone(raw: unknown): string {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed || trimmed === "010-0000-0000" || trimmed === "01000000000") return "";
  return formatPhoneKo(trimmed);
}

function parseRawGateReason(raw: unknown): {
  requesterName?: string;
  requesterPhone?: string;
  requesterCompany?: string;
  cleanMessage?: string;
} {
  if (typeof raw !== "string" || !raw.trim()) return {};
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      return {
        requesterName:
          typeof parsed.name === "string"
            ? parsed.name.trim()
            : typeof parsed.requesterName === "string"
            ? parsed.requesterName.trim()
            : undefined,
        requesterPhone: sanitizeClientPhone(
          parsed.phone || parsed.contact || parsed.requesterPhone
        ),
        requesterCompany:
          typeof parsed.company === "string"
            ? parsed.company.trim()
            : typeof parsed.organization === "string"
            ? parsed.organization.trim()
            : undefined,
        cleanMessage:
          typeof parsed.message === "string"
            ? parsed.message.trim()
            : typeof parsed.reason === "string"
            ? parsed.reason.trim()
            : undefined,
      };
    } catch {
      return { cleanMessage: trimmed };
    }
  }
  const bracketMatch = trimmed.match(
    /^\[신청자:\s*([^/\]\n]+?)(?:\s*\/\s*연락처:\s*([^\]\n]+?))?\]\s*(.*)$/
  );
  if (bracketMatch) {
    return {
      requesterName: bracketMatch[1]?.trim() || undefined,
      requesterPhone: sanitizeClientPhone(bracketMatch[2]),
      cleanMessage: bracketMatch[3]?.trim() || "IM 열람을 요청했습니다.",
    };
  }
  const marketMatch = trimmed.match(
    /성함\/기업명:\s*([^,\n]+?)(?:,\s*연락처:\s*([^\n]+))?$/
  );
  if (marketMatch) {
    return {
      requesterName: marketMatch[1]?.trim() || undefined,
      requesterPhone: sanitizeClientPhone(marketMatch[2]),
      cleanMessage: "IM 열람을 요청했습니다.",
    };
  }
  return { cleanMessage: trimmed };
}

function parseFilterParam(raw: string | null): InboxFilterType | null {
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase();
  if (normalized === "todo") return "todo";
  if (normalized === "viewing" || normalized === "views") return "views";
  if (normalized === "vip") return "vip";
  if (normalized === "clients" || normalized === "subscribers") return "clients";
  if (normalized === "all") return "all";
  return null;
}

function matchesInboxThreadFilter(
  thread: InboxThreadItem,
  filter: InboxFilterType,
  rawQuery: string
): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (q) {
    const qDigits = q.replace(/\D/g, "");
    const isPhoneLikeQuery = /^[\d\s\-+()]+$/.test(q) && qDigits.length >= 2;
    const phoneDigits = thread.clientPhone.replace(/\D/g, "");
    const callNotesText = [
      thread.memo || "",
      thread.cleanMessage || "",
      thread.latestEvent || "",
      ...thread.events.map((ev) => ev.description || ""),
    ]
      .join(" ")
      .toLowerCase();

    const matched =
      thread.clientName.toLowerCase().includes(q) ||
      thread.clientPhone.toLowerCase().includes(q) ||
      ((isPhoneLikeQuery || qDigits.length >= 4) &&
        qDigits.length > 0 &&
        phoneDigits.includes(qDigits)) ||
      (thread.clientCompany || "").toLowerCase().includes(q) ||
      thread.buildingTitle.toLowerCase().includes(q) ||
      thread.preferredRegion.toLowerCase().includes(q) ||
      callNotesText.includes(q);

    if (!matched) return false;
  }

  if (filter === "todo") {
    return (
      thread.status === "pending_gate" ||
      thread.status === "high_interest" ||
      thread.openCount >= 3
    );
  }
  if (filter === "views") {
    return thread.openCount > 0;
  }
  if (filter === "vip") {
    return thread.clientGrade === "VIP";
  }
  if (filter === "clients") {
    return (
      thread.id.startsWith("custom_") ||
      thread.id.startsWith("cli-") ||
      thread.id.startsWith("sub_")
    );
  }
  return true;
}

export function normalizeServerThread(raw: any): InboxThreadItem {
  const parsedReason = parseRawGateReason(raw?.detail || raw?.reason || raw?.cleanMessage);
  const rawStatus = String(raw?.status || "active");
  const mappedStatus: InboxThreadItem["status"] =
    rawStatus === "pending_gate"
      ? "pending_gate"
      : rawStatus === "revoked"
      ? "revoked"
      : rawStatus === "hot_lead" || rawStatus === "high_interest" || Number(raw?.openCount) >= 3
      ? "high_interest"
      : "active";

  const phone = sanitizeClientPhone(
    raw?.clientPhone || raw?.requesterPhone || parsedReason.requesterPhone
  );
  const clientName =
    String(
      raw?.clientName ||
        raw?.requesterName ||
        parsedReason.requesterName ||
        "이름 미입력 고객"
    ).trim() || "이름 미입력 고객";
  const buildingTitle =
    String(raw?.buildingTitle || raw?.building_label || "관심 매물").trim() || "관심 매물";
  const buildingId = String(raw?.buildingId || raw?.building_id || "").trim();
  const cleanMessage =
    String(
      raw?.cleanMessage ||
        parsedReason.cleanMessage ||
        raw?.latestEvent ||
        "상세 자료를 열람했습니다."
    ).trim() || "상세 자료를 열람했습니다.";

  const focusedSections = Array.isArray(raw?.focusedSections)
    ? raw.focusedSections.filter((s: unknown) => typeof s === "string" && s.trim().length > 0)
    : [];

  const events: RecipientEvent[] =
    Array.isArray(raw?.events) && raw.events.length > 0
      ? raw.events.map((ev: any, idx: number) => ({
          id: String(ev?.id || `ev-${raw?.id || idx}-${idx}`),
          eventType:
            ev?.eventType === "gate_request" ||
            ev?.eventType === "dwell" ||
            ev?.eventType === "share"
              ? ev.eventType
              : "open",
          description:
            parseRawGateReason(ev?.description).cleanMessage ||
            String(ev?.description || "상세 자료를 열람했습니다."),
          timestamp: String(ev?.timestamp || "방금"),
          sectionName: typeof ev?.sectionName === "string" ? ev.sectionName : undefined,
        }))
      : [
          {
            id: `ev-${raw?.id || Date.now()}`,
            eventType: mappedStatus === "pending_gate" ? "gate_request" : "open",
            description:
              mappedStatus === "pending_gate"
                ? `IM 열람 요청: ${cleanMessage}`
                : "상세 자료를 열람했습니다",
            timestamp: String(raw?.updatedAt || "방금"),
          },
        ];

  const shareToken = String(raw?.shareToken || "").trim();
  const shareUrl =
    typeof raw?.shareUrl === "string" && raw.shareUrl
      ? raw.shareUrl
      : buildingId
      ? shareToken
        ? `/im-lite/${encodeURIComponent(buildingId)}?token=${encodeURIComponent(shareToken)}`
        : `/im-lite/${encodeURIComponent(buildingId)}`
      : "";

  return {
    id: String(raw?.id || `thread-${Date.now()}`),
    clientName,
    clientPhone: phone,
    clientCompany:
      raw?.clientCompany || raw?.requesterCompany || parsedReason.requesterCompany || undefined,
    clientGrade:
      raw?.clientGrade === "VIP" || raw?.clientGrade === "잠재" ? raw.clientGrade : "일반",
    buildingTitle,
    buildingId,
    latestEvent:
      mappedStatus === "pending_gate"
        ? `IM 열람 요청: ${cleanMessage}`
        : cleanMessage,
    detail: cleanMessage,
    cleanMessage,
    gateStatus:
      raw?.gateStatus === "pending" || mappedStatus === "pending_gate"
        ? "pending"
        : raw?.gateStatus === "approved"
        ? "approved"
        : raw?.gateStatus === "rejected"
        ? "rejected"
        : "none",
    memo: typeof raw?.memo === "string" ? raw.memo : undefined,
    updatedAt: String(raw?.updatedAt || "방금"),
    openCount: Math.max(0, Number(raw?.openCount ?? 0)),
    isRead: Boolean(raw?.isRead),
    status: mappedStatus,
    shareToken,
    shareUrl,
    events,
    budget: String(raw?.budget || "").trim(),
    preferredRegion: String(raw?.preferredRegion || "").trim(),
    focusedSections,
    hasCorrectionNotice: Boolean(raw?.hasCorrectionNotice),
    correctionMessage:
      typeof raw?.correctionMessage === "string" ? raw.correctionMessage : undefined,
    newsletterSubscribed: Boolean(raw?.newsletterSubscribed),
  };
}

function InboxWorkspaceInner({ initialThreads = [] }: InboxWorkspacePageProps) {
  const router = useRouter();
  const pathname = usePathname() || "/broker/w/inbox";
  const searchParams = useSearchParams();
  const { showUndoToast } = useUndoToast();

  const [threads, setThreads] = useState<InboxThreadItem[]>(() =>
    initialThreads.map(normalizeServerThread)
  );
  const [inventory, setInventory] = useState<BrokerInventoryDeal[]>([]);
  const [activeFilter, setActiveFilter] = useState<InboxFilterType>(() => {
    const fromQuery = parseFilterParam(searchParams.get("filter"));
    if (fromQuery) return fromQuery;
    if (initialThreads.length > 0) {
      const normalized = initialThreads.map(normalizeServerThread);
      const hasTodo = normalized.some(
        (t) =>
          t.status === "pending_gate" ||
          t.status === "high_interest" ||
          t.openCount >= 3
      );
      return hasTodo ? "todo" : "all";
    }
    return "todo";
  });
  const [activeEditorTab, setActiveEditorTab] = useState<InboxEditorTabType>("todo");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string>(initialThreads[0]?.id || "");
  const [mobileStayOnList, setMobileStayOnList] = useState<boolean>(true);
  const [callNote, setCallNote] = useState("");
  const [kakaoHeadline, setKakaoHeadline] = useState("");
  const [kakaoBrief, setKakaoBrief] = useState("");
  const [inlineActionError, setInlineActionError] = useState<string | null>(null);

  // Share material selector sheet in Column 3
  const [showShareSheet, setShowShareSheet] = useState(false);
  // Inline lock confirmation state (replaces window.prompt — IB-16)
  const [confirmLockOpen, setConfirmLockOpen] = useState(false);
  // Inline correction notice state (IB-G11, IB-G12 — A-S0-04: never prefill fabricated numbers)
  const [correctionNoticeOpen, setCorrectionNoticeOpen] = useState(false);
  const [correctionNoticeText, setCorrectionNoticeText] = useState("");

  // Accessible Client Registration Modal state (IB-26)
  const [showNewClientModal, setShowNewClientModal] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [newClientGrade, setNewClientGrade] = useState<"VIP" | "일반" | "잠재">("VIP");
  const [newClientBudget, setNewClientBudget] = useState("");
  const [newClientRegion, setNewClientRegion] = useState("");
  const [newClientBuildingTitle, setNewClientBuildingTitle] = useState("");
  const [newClientNewsletterOptIn, setNewClientNewsletterOptIn] = useState(false);

  // Custom client inline edit state (INBOX-12)
  const [editingClientOpen, setEditingClientOpen] = useState(false);
  const [editClientName, setEditClientName] = useState("");
  const [editClientPhone, setEditClientPhone] = useState("");
  const [editClientGrade, setEditClientGrade] = useState<"VIP" | "일반" | "잠재">("VIP");
  const [editClientBudget, setEditClientBudget] = useState("");
  const [editClientRegion, setEditClientRegion] = useState("");
  const [editClientBuildingTitle, setEditClientBuildingTitle] = useState("");

  const [currentBrokerId, setCurrentBrokerId] = useState<string>("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const busyLockRef = useRef<boolean>(false);
  const lastSyncedQueryKeyRef = useRef<string | null>(null);
  const lastPushedQueryKeyRef = useRef<string | null>(null);
  const lastSyncedFilterParamRef = useRef<string | null>(null);
  const [, setStatusFeedback] = useState<string | null>(null);

  const purgeInboxLocalStorage = () => {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith("credeal-w-inbox-")) {
          keysToRemove.push(k);
        }
      }
      for (const k of [...LEGACY_STORAGE_KEYS, ...keysToRemove]) {
        window.localStorage.removeItem(k);
      }
    } catch {
      // ignore storage errors
    }
  };

  const persistThreads = (next: InboxThreadItem[], brokerIdOverride?: string) => {
    const uid = (brokerIdOverride ?? currentBrokerId).trim();
    if (!uid) return;
    try {
      window.localStorage.setItem(`${STORAGE_KEY_PREFIX}:${uid}`, JSON.stringify(next));
    } catch {
      // ignore storage errors
    }
  };

  // Explicit thread selection helper — updates selection, locks query sync ref, and updates URL (INBOX-01)
  const selectThread = (nextId: string, nextFilterOverride?: InboxFilterType) => {
    if (!nextId) return;
    const currentRawTarget =
      searchParams.get("thread") ||
      searchParams.get("threadId") ||
      searchParams.get("id") ||
      searchParams.get("clientId") ||
      searchParams.get("buildingId") ||
      "";
    const currentRawFilter = searchParams.get("filter") || "";
    const currentKey = `${currentRawTarget}::${currentRawFilter}`;

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("thread", nextId);
    nextParams.delete("id");
    nextParams.delete("threadId");
    nextParams.delete("buildingId");
    nextParams.delete("clientId");
    if (nextFilterOverride) {
      nextParams.set("filter", nextFilterOverride === "views" ? "viewing" : nextFilterOverride);
    }

    const nextKey = `${nextId}::${nextParams.get("filter") || ""}`;
    lastSyncedQueryKeyRef.current = currentKey;
    lastPushedQueryKeyRef.current = nextKey;

    setSelectedId(nextId);
    setMobileStayOnList(false);

    const qs = nextParams.toString();
    const targetHref = qs ? `${pathname}?${qs}` : pathname;
    try {
      router?.replace?.(targetHref, { scroll: false });
    } catch {
      // ignore router errors in isolated test harnesses
    }
  };

  const handleSearchChange = (nextQuery: string) => {
    setSearchQuery(nextQuery);
    const nextFiltered = threads.filter((t) =>
      matchesInboxThreadFilter(t, activeFilter, nextQuery)
    );
    if (!nextFiltered.some((t) => t.id === selectedId)) {
      setSelectedId(nextFiltered[0]?.id || "");
    }
  };

  const handleFilterChange = (nextFilter: InboxFilterType) => {
    setActiveFilter(nextFilter);
    const nextFiltered = threads.filter((t) =>
      matchesInboxThreadFilter(t, nextFilter, searchQuery)
    );
    if (!nextFiltered.some((t) => t.id === selectedId)) {
      setSelectedId(nextFiltered[0]?.id || "");
    }
  };

  // Clear legacy unscoped storage keys and fetch real server threads (A-S0-03 & INBOX-03: per-broker isolation)
  useEffect(() => {
    try {
      for (const legacyKey of LEGACY_STORAGE_KEYS) {
        window.localStorage.removeItem(legacyKey);
      }
    } catch {
      // ignore
    }

    fetch("/api/broker/inbox?workspace=1")
      .then((res) => {
        if (res.status === 401 || res.status === 403) {
          purgeInboxLocalStorage();
          setCurrentBrokerId("");
          setThreads([]);
          setSelectedId("");
          return null;
        }
        return res.ok ? res.json().catch(() => null) : null;
      })
      .then((data) => {
        if (!data) return;

        const resolvedUid =
          (typeof data.userId === "string" && data.userId.trim()) ||
          (typeof data.viewerBrokerId === "string" && data.viewerBrokerId.trim()) ||
          "";
        if (resolvedUid) {
          setCurrentBrokerId(resolvedUid);
        }

        if (Array.isArray(data.inventory) && data.inventory.length > 0) {
          setInventory(data.inventory);
        }

        if (Array.isArray(data.threads)) {
          const serverThreads = data.threads.map(normalizeServerThread);
          setThreads((prev) => {
            if (serverThreads.length === 0) {
              if (prev.length > 0 && initialThreads.length > 0) {
                return prev;
              }
              if (resolvedUid) {
                persistThreads([], resolvedUid);
              }
              return [];
            }

            const baseList =
              initialThreads.length > 0 ? [...prev, ...serverThreads] : serverThreads;
            const byId = new Map<string, InboxThreadItem>();
            const seenCustomClientKeys = new Set<string>();
            for (const item of baseList) {
              if (!item?.id || byId.has(item.id)) continue;
              if (item.id.startsWith("custom_")) {
                const customKey = `${item.clientName.trim().toLowerCase()}::${item.clientPhone.replace(/\D/g, "")}`;
                if (seenCustomClientKeys.has(customKey)) continue;
                seenCustomClientKeys.add(customKey);
              }
              byId.set(item.id, item);
            }
            const merged = Array.from(byId.values());
            if (resolvedUid) {
              persistThreads(merged, resolvedUid);
            }

            if (initialThreads.length === 0 && merged.length > 0) {
              const hasTodoItems = merged.some(
                (t) =>
                  t.status === "pending_gate" ||
                  t.status === "high_interest" ||
                  t.openCount >= 3
              );
              const queryFilter = parseFilterParam(searchParams.get("filter"));
              if (!hasTodoItems && !queryFilter) {
                setActiveFilter("all");
              }
              setSelectedId((curr) =>
                curr && merged.some((t) => t.id === curr) ? curr : merged[0].id
              );
            }

            return merged;
          });
        }
      })
      .catch(() => {
        // Offline / test environment
      });
  }, []);

  // Close client registration modal on Escape key (IB-26)
  useEffect(() => {
    if (!showNewClientModal && !editingClientOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowNewClientModal(false);
        setEditingClientOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showNewClientModal, editingClientOpen]);

  // Sync selection & filter from URL query params ONCE per URL change (INBOX-01 & A-S1-01: never snap back on thread mutation)
  useEffect(() => {
    const rawFilter = searchParams.get("filter");
    const parsedFilter = parseFilterParam(rawFilter);
    if (parsedFilter && lastSyncedFilterParamRef.current !== rawFilter) {
      lastSyncedFilterParamRef.current = rawFilter;
      setActiveFilter(parsedFilter);
    } else if (!rawFilter) {
      lastSyncedFilterParamRef.current = null;
    }

    const queryTarget =
      searchParams.get("thread") ||
      searchParams.get("threadId") ||
      searchParams.get("id") ||
      searchParams.get("clientId") ||
      searchParams.get("buildingId") ||
      "";
    const queryKey = `${queryTarget}::${rawFilter || ""}`;

    if (!queryTarget) {
      lastSyncedQueryKeyRef.current = null;
      return;
    }
    if (
      lastSyncedQueryKeyRef.current === queryKey ||
      lastPushedQueryKeyRef.current === queryKey
    ) {
      return;
    }

    const match = threads.find(
      (t) => t.id === queryTarget || (Boolean(t.buildingId) && t.buildingId === queryTarget)
    );
    if (match) {
      lastSyncedQueryKeyRef.current = queryKey;
      setSelectedId(match.id);
      setMobileStayOnList(false);

      const effectiveFilter = parsedFilter ?? activeFilter;
      if (!matchesInboxThreadFilter(match, effectiveFilter, "")) {
        setActiveFilter("all");
      }
    }
  }, [searchParams, threads, activeFilter]);

  const pendingThreads = useMemo(
    () => threads.filter((t) => t.status === "pending_gate"),
    [threads]
  );
  const pendingCount = pendingThreads.length;

  const filteredThreads = useMemo(() => {
    return threads.filter((t) =>
      matchesInboxThreadFilter(t, activeFilter, searchQuery)
    );
  }, [threads, activeFilter, searchQuery]);

  const activeThread = useMemo(() => {
    if (threads.length === 0) return null;
    if (selectedId) {
      return (
        filteredThreads.find((t) => t.id === selectedId) ||
        threads.find((t) => t.id === selectedId) ||
        filteredThreads[0] ||
        null
      );
    }
    return filteredThreads[0] || null;
  }, [threads, filteredThreads, selectedId]);

  // Reset transient drafts, inline confirmations & error banners when switching threads (INBOX-02 & A-S1-02)
  useEffect(() => {
    setConfirmLockOpen(false);
    setShowShareSheet(false);
    setCorrectionNoticeOpen(false);
    setCorrectionNoticeText("");
    setCallNote("");
    setEditingClientOpen(false);
    setInlineActionError(null);
    if (!activeThread) return;
    if (activeThread.status === "pending_gate") {
      setActiveEditorTab("todo");
    }
    setKakaoHeadline(`[${activeThread.buildingTitle}] 상세 검토 자료 안내`);
    setKakaoBrief(
      `${activeThread.clientName}님, 관심 가져주신 [${activeThread.buildingTitle}] 상세 투자설명서(IM)와 층별 임대 현황을 보내드립니다. 검토하시면서 궁금하신 점은 편하게 말씀해 주세요.`
    );
  }, [activeThread?.id]);

  // Shared honest mutation helper — aborts on HTTP error, json.ok === false, non-JSON 5xx, or network failure (A-S0-01, A-S1-03, INBOX-11)
  const postJsonHonest = async (
    actionKey: string,
    url: string,
    payload: Record<string, unknown>,
    fallbackError: string
  ): Promise<{ ok: true; data: Record<string, any> } | { ok: false; error: string }> => {
    if (busyLockRef.current) {
      return { ok: false, error: "이전 요청을 처리 중입니다." };
    }
    busyLockRef.current = true;
    setBusyAction(actionKey);
    setInlineActionError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.ok === false) {
        const errMsg =
          typeof json?.error === "string" && json.error.trim()
            ? json.error.trim()
            : typeof json?.error?.message === "string" && json.error.message.trim()
            ? json.error.message.trim()
            : `${fallbackError} (HTTP ${res.status})`;
        setStatusFeedback(errMsg);
        setInlineActionError(errMsg);
        showUndoToast(errMsg);
        return { ok: false, error: errMsg };
      }
      return {
        ok: true,
        data: json && typeof json === "object" ? (json as Record<string, any>) : {},
      };
    } catch {
      setStatusFeedback(fallbackError);
      setInlineActionError(fallbackError);
      showUndoToast(fallbackError);
      return { ok: false, error: fallbackError };
    } finally {
      busyLockRef.current = false;
      setBusyAction(null);
    }
  };

  // Direct clipboard copy for active IM share link (INBOX-04)
  const handleCopyActiveShareLink = async () => {
    if (!activeThread?.shareUrl || activeThread.status === "revoked") return;
    const origin =
      typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : "https://credeal.net";
    const fullUrl = activeThread.shareUrl.startsWith("/")
      ? `${origin}${activeThread.shareUrl}`
      : activeThread.shareUrl;
    const copied = await copyText(fullUrl);
    const msg = copied
      ? `${activeThread.clientName}님 전용 링크가 클립보드에 복사되었습니다.`
      : "링크 복사에 실패했습니다. 다시 시도해 주세요.";
    setStatusFeedback(msg);
    showUndoToast(msg);
  };

  // Honest approve & send IM handler (IB-11, IB-14, IB-15, A-S0-01)
  const handleApproveAndSendIm = async (targetThread: InboxThreadItem) => {
    setStatusFeedback(null);
    let apiRes = await postJsonHonest(
      `approve:${targetThread.id}`,
      "/api/broker/inbox/actions",
      {
        action: "approve_gate",
        threadId: targetThread.id,
        buildingId: targetThread.buildingId,
        shareToken: targetThread.shareToken,
      },
      "IM 열람 승인 처리에 실패했습니다. 잠시 후 다시 시도해 주세요."
    );

    // Legacy / long-pending gate requests (e.g. 117 days old with DB status='expired'):
    // automatically run reset_gate -> approve_gate so the broker's 1-click approval succeeds cleanly.
    if (!apiRes.ok && apiRes.error.includes("만료된 열람 요청")) {
      const resetRes = await postJsonHonest(
        `reset:${targetThread.id}`,
        "/api/broker/inbox/actions",
        {
          action: "reset_gate",
          threadId: targetThread.id,
          buildingId: targetThread.buildingId,
        },
        "만료된 열람 요청 초기화에 실패했습니다. 잠시 후 다시 시도해 주세요."
      );
      if (!resetRes.ok) return;

      apiRes = await postJsonHonest(
        `approve:${targetThread.id}`,
        "/api/broker/inbox/actions",
        {
          action: "approve_gate",
          threadId: targetThread.id,
          buildingId: targetThread.buildingId,
          shareToken: targetThread.shareToken,
        },
        "IM 열람 승인 처리에 실패했습니다. 잠시 후 다시 시도해 주세요."
      );
    }

    if (!apiRes.ok) {
      if (apiRes.error.includes("연결된 매물이 없습니다")) {
        setSelectedId(targetThread.id);
        setActiveEditorTab("todo");
      }
      return;
    }

    const json = apiRes.data;
    const shareUrl =
      typeof json.shareUrl === "string" && json.shareUrl
        ? json.shareUrl
        : targetThread.shareUrl ||
          (targetThread.buildingId
            ? `/im-lite/${encodeURIComponent(targetThread.buildingId)}`
            : "");
    const issuedToken =
      typeof json.shareToken === "string" && json.shareToken
        ? json.shareToken
        : targetThread.shareToken;

    const fullUrl =
      typeof window !== "undefined" && shareUrl.startsWith("/")
        ? `${window.location.origin}${shareUrl}`
        : shareUrl;
    const copied = fullUrl ? await copyText(fullUrl) : false;

    const approvalEvent: RecipientEvent = {
      id: `ev-approve-${Date.now()}`,
      eventType: "gate_request",
      description: "IM 열람 요청을 승인하고 전용 링크를 발급했습니다.",
      timestamp: "방금",
    };

    setThreads((prev) => {
      const next = prev.map((t) =>
        t.id === targetThread.id
          ? {
              ...t,
              status: (t.openCount >= 3 ? "high_interest" : "active") as InboxThreadItem["status"],
              gateStatus: "approved" as const,
              shareToken: issuedToken,
              shareUrl,
              detail: "IM 열람 요청이 승인되었습니다.",
              latestEvent: "IM 열람 요청을 승인하고 전용 링크를 전달했습니다.",
              events: [approvalEvent, ...t.events],
            }
          : t
      );
      persistThreads(next);
      return next;
    });

    const msg = copied
      ? `${targetThread.clientName}님에게 보낼 IM 전용 링크가 복사되었습니다.`
      : `${targetThread.clientName}님의 IM 열람 요청을 승인했습니다.`;
    setStatusFeedback(msg);
    showUndoToast(msg);
  };

  // Reject Gate Request (A-S0-01)
  const handleRejectRequest = async (targetThread: InboxThreadItem) => {
    setStatusFeedback(null);
    const apiRes = await postJsonHonest(
      `reject:${targetThread.id}`,
      "/api/broker/inbox/actions",
      {
        action: "reject_gate",
        threadId: targetThread.id,
        buildingId: targetThread.buildingId,
      },
      "IM 열람 거절 처리에 실패했습니다. 잠시 후 다시 시도해 주세요."
    );
    if (!apiRes.ok) return;

    setThreads((prev) => {
      const next = prev.map((t) =>
        t.id === targetThread.id
          ? {
              ...t,
              status: "active" as const,
              gateStatus: "rejected" as const,
              detail: "IM 열람 요청을 거절했습니다.",
              latestEvent: "IM 열람 요청을 거절했습니다.",
            }
          : t
      );
      persistThreads(next);
      return next;
    });

    const msg = `${targetThread.clientName}님의 IM 열람 요청을 거절했습니다.`;
    setStatusFeedback(msg);
    showUndoToast(msg);
  };

  // Share material via Kakao or Clipboard — preserves thread IM shareUrl when sending DealCard/Newsletter (INBOX-05, A-S0-01, A-S0-02)
  const handleSendMaterial = async (
    kind: "im" | "dealcard" | "newsletter" | "magazine"
  ) => {
    if (!activeThread) return;
    setStatusFeedback(null);

    const normalizedKind: "im" | "dealcard" | "newsletter" =
      kind === "magazine" ? "newsletter" : kind;

    if (normalizedKind === "im" && activeThread.status === "revoked") {
      const msg = "잠긴 전용 링크입니다. 먼저 '링크 다시 열기'로 잠금을 해제해 주세요.";
      setStatusFeedback(msg);
      showUndoToast(msg);
      return;
    }

    const cleanBuildingId = activeThread.buildingId.trim();
    if ((normalizedKind === "im" || normalizedKind === "dealcard") && !cleanBuildingId) {
      const msg = "연결된 매물이 없습니다. 매물을 먼저 지정해 주세요.";
      setStatusFeedback(msg);
      showUndoToast(msg);
      return;
    }

    const actionMap = {
      im: "send_im",
      dealcard: "send_dealcard",
      newsletter: "send_magazine",
    } as const;

    let pathUrl =
      normalizedKind === "im"
        ? activeThread.shareUrl || `/im-lite/${encodeURIComponent(cleanBuildingId)}`
        : normalizedKind === "dealcard"
        ? `/dc/${encodeURIComponent(cleanBuildingId)}`
        : "/magazine";

    const apiRes = await postJsonHonest(
      `send:${normalizedKind}:${activeThread.id}`,
      "/api/broker/inbox/actions",
      {
        action: actionMap[normalizedKind],
        threadId: activeThread.id,
        buildingId: cleanBuildingId,
      },
      "자료 링크 준비 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."
    );
    if (!apiRes.ok) return;

    const json = apiRes.data;
    if (typeof json.shareUrl === "string" && json.shareUrl) {
      pathUrl = json.shareUrl;
      // INBOX-05: Only update thread.shareUrl / shareToken when sending IM link; never clobber IM link with DealCard/Newsletter URL!
      if (normalizedKind === "im") {
        const issuedToken =
          typeof json.shareToken === "string" ? json.shareToken : "";
        setThreads((prev) => {
          const next = prev.map((t) =>
            t.id === activeThread.id
              ? {
                  ...t,
                  shareUrl: json.shareUrl,
                  shareToken: issuedToken || t.shareToken,
                }
              : t
          );
          persistThreads(next);
          return next;
        });
      }
    }

    const origin =
      typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : "https://credeal.net";
    const fullUrl = pathUrl.startsWith("/") ? `${origin}${pathUrl}` : pathUrl;

    const labelMap = {
      im: "IM 전용 링크",
      dealcard: "딜카드 링크",
      newsletter: "뉴스레터 링크",
    } as const;

    const thumbnailImageUrl =
      normalizedKind !== "newsletter" && cleanBuildingId
        ? `${origin}/api/og/deal/${encodeURIComponent(cleanBuildingId)}/kakao-v2`
        : `${origin}/api/og/magazine`;

    const shareRes = await shareKakaoFeed({
      title: kakaoHeadline || `[${activeThread.buildingTitle}] ${labelMap[normalizedKind]}`,
      description:
        kakaoBrief || `${activeThread.clientName}님을 위한 맞춤 매물 자료입니다.`,
      imageUrl: thumbnailImageUrl,
      url: fullUrl,
      buttonTitle: `${labelMap[normalizedKind]} 열람하기`,
    });

    if (shareRes === "kakao" || shareRes === "copied") {
      const msg =
        shareRes === "kakao"
          ? `카카오톡으로 ${labelMap[normalizedKind]} 공유 창을 열었습니다.`
          : `${labelMap[normalizedKind]}가 클립보드에 복사되었습니다. 카톡에 붙여넣어 보내세요.`;
      setStatusFeedback(msg);
      showUndoToast(msg);
      setShowShareSheet(false);
    } else {
      const errMsg = `${labelMap[normalizedKind]} 복사에 실패했습니다. 다시 시도해 주세요.`;
      setStatusFeedback(errMsg);
      showUndoToast(errMsg);
    }
  };

  // Inline Lock Share Link (IB-05, IB-16, A-S0-01, INBOX-07 — no window.prompt)
  const handleConfirmLockLink = async () => {
    if (!activeThread) return;
    const targetThread = activeThread;
    setConfirmLockOpen(false);
    setStatusFeedback(null);

    const apiRes = await postJsonHonest(
      `lock:${targetThread.id}`,
      "/api/broker/share-links/revoke",
      {
        token: targetThread.shareToken || undefined,
        buildingId: targetThread.buildingId,
        threadId: targetThread.id,
        reason: "broker_locked",
      },
      "열람 링크 잠금 처리에 실패했습니다. 잠시 후 다시 시도해 주세요."
    );
    if (!apiRes.ok) return;

    setThreads((prev) => {
      const next = prev.map((t) =>
        t.id === targetThread.id
          ? {
              ...t,
              status: "revoked" as const,
              latestEvent: "보낸 링크를 잠갔습니다.",
            }
          : t
      );
      persistThreads(next);
      return next;
    });

    const msg = `${targetThread.clientName}님에게 보낸 열람 링크를 잠갔습니다.`;
    setStatusFeedback(msg);
    showUndoToast(msg);
  };

  const handleUnlockLink = async () => {
    if (!activeThread) return;
    const targetThread = activeThread;
    setStatusFeedback(null);

    const apiRes = await postJsonHonest(
      `unlock:${targetThread.id}`,
      "/api/broker/inbox/actions",
      {
        action: "restore_link",
        threadId: targetThread.id,
        buildingId: targetThread.buildingId,
        shareToken: targetThread.shareToken,
      },
      "열람 링크 잠금 해제에 실패했습니다. 잠시 후 다시 시도해 주세요."
    );
    if (!apiRes.ok) return;

    setThreads((prev) => {
      const next = prev.map((t) =>
        t.id === targetThread.id
          ? {
              ...t,
              status: (t.openCount >= 3 ? "high_interest" : "active") as InboxThreadItem["status"],
              latestEvent: "잠근 열람 링크를 다시 열었습니다.",
            }
          : t
      );
      persistThreads(next);
      return next;
    });

    const msg = `${targetThread.clientName}님의 전용 링크를 다시 열었습니다.`;
    setStatusFeedback(msg);
    showUndoToast(msg);
  };

  // Toggle newsletter subscription with honest server persistence & busy guard (INBOX-06, INBOX-11)
  const handleToggleNewsletter = async () => {
    if (!activeThread) return;
    const targetThread = activeThread;
    const nextSubscribed = !Boolean(targetThread.newsletterSubscribed);

    const apiRes = await postJsonHonest(
      `newsletter:${targetThread.id}`,
      "/api/broker/inbox/actions",
      {
        action: "toggle_newsletter",
        threadId: targetThread.id,
        clientId: targetThread.id,
        clientName: targetThread.clientName,
        clientPhone: targetThread.clientPhone,
        buildingId: targetThread.buildingId,
        subscribed: nextSubscribed,
      },
      "뉴스레터 수신 설정 변경에 실패했습니다. 잠시 후 다시 시도해 주세요."
    );
    if (!apiRes.ok) return;

    setThreads((prev) => {
      const next = prev.map((t) => {
        if (t.id !== targetThread.id) return t;
        const replaceSubLabel = (txt?: string) =>
          typeof txt === "string" && t.id.startsWith("sub_")
            ? txt.replace(
                /\((?:수신 동의 완료|수신 확인 대기|수신 거부|미구독)\)/g,
                nextSubscribed ? "(수신 동의 완료)" : "(수신 거부)"
              )
            : txt;
        return {
          ...t,
          newsletterSubscribed: nextSubscribed,
          cleanMessage: replaceSubLabel(t.cleanMessage),
          latestEvent: replaceSubLabel(t.latestEvent) || t.latestEvent,
        };
      });
      persistThreads(next);
      return next;
    });

    const msg = nextSubscribed
      ? `${targetThread.clientName}님의 뉴스레터 수신 동의가 켜졌습니다.`
      : `${targetThread.clientName}님의 뉴스레터 수신이 해제되었습니다.`;
    setStatusFeedback(msg);
    showUndoToast(msg);
  };

  // Correction Notice publish & clear (IB-G11, IB-G12, A-S0-01)
  const handlePublishCorrectionNotice = async (thread?: InboxThreadItem) => {
    const targetThread = thread ?? activeThread;
    if (!targetThread) return;
    const msgText =
      correctionNoticeText.trim() ||
      `${targetThread.buildingTitle} 매물 제원 및 임대 현황이 최신 기준으로 업데이트되었습니다.`;

    const apiRes = await postJsonHonest(
      `corr:${targetThread.id}`,
      "/api/broker/inbox/actions",
      {
        action: "correction_notice",
        threadId: targetThread.id,
        buildingId: targetThread.buildingId,
        message: msgText,
      },
      "수치 정정 안내 게시에 실패했습니다. 잠시 후 다시 시도해 주세요."
    );
    if (!apiRes.ok) return;

    const newEvent: RecipientEvent = {
      id: `ev-corr-${Date.now()}`,
      eventType: "share",
      description: `⚠️ 매물 정정 안내 게시: ${msgText}`,
      timestamp: "방금",
    };

    setThreads((prev) => {
      const next = prev.map((t) =>
        (Boolean(targetThread.buildingId) && t.buildingId === targetThread.buildingId) ||
        t.id === targetThread.id
          ? {
              ...t,
              hasCorrectionNotice: true,
              correctionMessage: msgText,
              latestEvent: `정정 안내 게시: ${msgText}`,
              events: [newEvent, ...t.events],
            }
          : t
      );
      persistThreads(next);
      return next;
    });

    setCorrectionNoticeOpen(false);
    const toastMsg = `⚠️ 매물 정보가 정정되었습니다: ${msgText}`;
    setStatusFeedback(toastMsg);
    showUndoToast(toastMsg);
  };

  const handleClearCorrectionNotice = async (thread?: InboxThreadItem) => {
    const targetThread = thread ?? activeThread;
    if (!targetThread) return;

    const apiRes = await postJsonHonest(
      `corr-clear:${targetThread.id}`,
      "/api/broker/inbox/actions",
      {
        action: "clear_correction_notice",
        threadId: targetThread.id,
        buildingId: targetThread.buildingId,
      },
      "수치 정정 안내 해제에 실패했습니다. 잠시 후 다시 시도해 주세요."
    );
    if (!apiRes.ok) return;

    const newEvent: RecipientEvent = {
      id: `ev-corr-clear-${Date.now()}`,
      eventType: "share",
      description: "수치 정정 안내 배너를 내렸습니다.",
      timestamp: "방금",
    };

    setThreads((prev) => {
      const next = prev.map((t) =>
        (Boolean(targetThread.buildingId) && t.buildingId === targetThread.buildingId) ||
        t.id === targetThread.id
          ? {
              ...t,
              hasCorrectionNotice: false,
              correctionMessage: undefined,
              latestEvent: "수치 정정 안내 배너를 내렸습니다.",
              events: [newEvent, ...t.events],
            }
          : t
      );
      persistThreads(next);
      return next;
    });

    const toastMsg = "수치 정정 안내 배너를 내렸습니다.";
    setStatusFeedback(toastMsg);
    showUndoToast(toastMsg);
  };

  // Call / Consultation Note (honest persistence — A-S0-01, INBOX-11)
  const handleAddCallNote = async () => {
    if (!activeThread || !callNote.trim()) return;
    const trimmed = callNote.trim();

    const apiRes = await postJsonHonest(
      `note:${activeThread.id}`,
      "/api/broker/inbox/actions",
      {
        action: "log_call",
        threadId: activeThread.id,
        buildingId: activeThread.buildingId,
        note: trimmed,
      },
      "통화 및 상담 기록 저장에 실패했습니다. 잠시 후 다시 시도해 주세요."
    );
    if (!apiRes.ok) return;

    const newEvent: RecipientEvent = {
      id: `ev-note-${Date.now()}`,
      eventType: "dwell",
      description: `통화 기록: ${trimmed}`,
      timestamp: "방금",
    };

    setThreads((prev) => {
      const next = prev.map((t) =>
        t.id === activeThread.id
          ? {
              ...t,
              memo: trimmed,
              latestEvent: `통화 기록: ${trimmed}`,
              events: [newEvent, ...t.events],
            }
          : t
      );
      persistThreads(next);
      return next;
    });
    setCallNote("");
    setStatusFeedback("통화 및 상담 기록을 저장했습니다.");
    showUndoToast("통화 및 상담 기록을 저장했습니다.");
  };

  // Create Custom Client (IB-07, IB-26, A-S0-01, A-S0-05, INBOX-14)
  const handleCreateCustomClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClientName.trim()) return;

    let canonicalId = `custom_${Date.now()}`;
    const cleanPhone = sanitizeClientPhone(newClientPhone);
    const trimmedTitle = newClientBuildingTitle.trim();
    const matchedInventory = trimmedTitle
      ? inventory.find(
          (d) => d.title === trimmedTitle || d.buildingId === trimmedTitle
        )
      : undefined;
    const resolvedBuildingId = matchedInventory?.buildingId || "";
    const resolvedBuildingTitle =
      trimmedTitle || matchedInventory?.title || "관심 매물 미지정";

    const apiRes = await postJsonHonest(
      "upsert_client",
      "/api/broker/inbox/actions",
      {
        action: "upsert_client",
        clientId: canonicalId,
        clientName: newClientName.trim(),
        clientPhone: cleanPhone,
        clientGrade: newClientGrade,
        budget: newClientBudget.trim(),
        preferredRegion: newClientRegion.trim(),
        buildingId: resolvedBuildingId,
        buildingTitle: resolvedBuildingTitle,
        newsletterSubscribed: newClientNewsletterOptIn,
      },
      "고객 등록 저장에 실패했습니다. 잠시 후 다시 시도해 주세요."
    );
    if (!apiRes.ok) return;

    const json = apiRes.data;
    if (typeof json?.clientId === "string" && json.clientId) {
      canonicalId = json.clientId;
    }

    const created: InboxThreadItem = {
      id: canonicalId,
      clientName: newClientName.trim(),
      clientPhone: cleanPhone,
      clientGrade: newClientGrade,
      buildingTitle: resolvedBuildingTitle,
      buildingId: resolvedBuildingId,
      latestEvent: "직접 등록한 고객입니다.",
      cleanMessage: "직접 등록한 고객입니다.",
      updatedAt: "방금",
      openCount: 0,
      isRead: true,
      status: "active",
      shareToken: "",
      shareUrl: resolvedBuildingId
        ? `/im-lite/${encodeURIComponent(resolvedBuildingId)}`
        : "",
      budget: newClientBudget.trim(),
      preferredRegion: newClientRegion.trim(),
      focusedSections: [],
      newsletterSubscribed: newClientNewsletterOptIn,
      events: [
        {
          id: `ev-${canonicalId}`,
          eventType: "share",
          description: "고객 직접 등록 완료",
          timestamp: "방금",
        },
      ],
    };

    setThreads((prev) => {
      const customKey = `${created.clientName.toLowerCase()}::${created.clientPhone.replace(/\D/g, "")}`;
      const withoutDup = prev.filter((t) => {
        if (t.id === created.id) return false;
        if (t.id.startsWith("custom_")) {
          const existingKey = `${t.clientName.trim().toLowerCase()}::${t.clientPhone.replace(/\D/g, "")}`;
          if (existingKey === customKey) return false;
        }
        return true;
      });
      const next = [created, ...withoutDup];
      persistThreads(next);
      return next;
    });

    setSearchQuery("");
    const shouldSwitchAll =
      activeFilter === "todo" ||
      activeFilter === "views" ||
      (activeFilter === "vip" && created.clientGrade !== "VIP");
    if (shouldSwitchAll) {
      setActiveFilter("all");
    }
    selectThread(canonicalId, shouldSwitchAll ? "all" : undefined);

    setNewClientName("");
    setNewClientPhone("");
    setNewClientBudget("");
    setNewClientRegion("");
    setNewClientBuildingTitle("");
    setNewClientNewsletterOptIn(false);
    setShowNewClientModal(false);
    showUndoToast(`${created.clientName} 고객이 등록되었습니다.`);
  };

  // Open custom client edit form (INBOX-12)
  const handleOpenEditCustomClient = () => {
    if (!activeThread || !activeThread.id.startsWith("custom_")) return;
    setEditClientName(activeThread.clientName);
    setEditClientPhone(activeThread.clientPhone);
    setEditClientGrade(activeThread.clientGrade);
    setEditClientBudget(activeThread.budget);
    setEditClientRegion(activeThread.preferredRegion);
    setEditClientBuildingTitle(
      activeThread.buildingTitle === "관심 매물 미지정"
        ? ""
        : activeThread.buildingTitle
    );
    setEditingClientOpen(true);
  };

  // Update custom client (INBOX-12)
  const handleUpdateCustomClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeThread || !activeThread.id.startsWith("custom_") || !editClientName.trim()) {
      return;
    }
    const targetThread = activeThread;
    const cleanPhone = sanitizeClientPhone(editClientPhone);
    const trimmedTitle = editClientBuildingTitle.trim();
    const matchedInventory = trimmedTitle
      ? inventory.find((d) => d.title === trimmedTitle || d.buildingId === trimmedTitle)
      : undefined;
    const resolvedBuildingId =
      matchedInventory?.buildingId ??
      (trimmedTitle === targetThread.buildingTitle ? targetThread.buildingId : "");
    const resolvedBuildingTitle =
      trimmedTitle || matchedInventory?.title || "관심 매물 미지정";

    const apiRes = await postJsonHonest(
      `update_client:${targetThread.id}`,
      "/api/broker/inbox/actions",
      {
        action: "update_client",
        clientId: targetThread.id,
        threadId: targetThread.id,
        clientName: editClientName.trim(),
        clientPhone: cleanPhone,
        clientGrade: editClientGrade,
        budget: editClientBudget.trim(),
        preferredRegion: editClientRegion.trim(),
        buildingId: resolvedBuildingId,
        buildingTitle: resolvedBuildingTitle,
        newsletterSubscribed: Boolean(targetThread.newsletterSubscribed),
      },
      "고객 정보 수정에 실패했습니다. 잠시 후 다시 시도해 주세요."
    );
    if (!apiRes.ok) return;

    setThreads((prev) => {
      const next = prev.map((t) =>
        t.id === targetThread.id
          ? {
              ...t,
              clientName: editClientName.trim(),
              clientPhone: cleanPhone,
              clientGrade: editClientGrade,
              budget: editClientBudget.trim(),
              preferredRegion: editClientRegion.trim(),
              buildingId: resolvedBuildingId,
              buildingTitle: resolvedBuildingTitle,
              shareUrl: resolvedBuildingId
                ? t.shareToken
                  ? `/im-lite/${encodeURIComponent(resolvedBuildingId)}?token=${encodeURIComponent(t.shareToken)}`
                  : `/im-lite/${encodeURIComponent(resolvedBuildingId)}`
                : "",
            }
          : t
      );
      persistThreads(next);
      return next;
    });
    setEditingClientOpen(false);
    showUndoToast(`${editClientName.trim()} 고객 정보를 수정했습니다.`);
  };

  // Delete custom client with UndoConfirmToast restore (INBOX-12)
  const handleDeleteCustomClient = async () => {
    if (!activeThread || !activeThread.id.startsWith("custom_")) return;
    const deletedSnapshot = { ...activeThread };

    const apiRes = await postJsonHonest(
      `delete_client:${deletedSnapshot.id}`,
      "/api/broker/inbox/actions",
      {
        action: "delete_client",
        clientId: deletedSnapshot.id,
        threadId: deletedSnapshot.id,
      },
      "고객 삭제 처리에 실패했습니다. 잠시 후 다시 시도해 주세요."
    );
    if (!apiRes.ok) return;

    const remaining = threads.filter((t) => t.id !== deletedSnapshot.id);
    setThreads(remaining);
    persistThreads(remaining);
    setSelectedId(remaining[0]?.id || "");

    showUndoToast({
      message: `${deletedSnapshot.clientName} 고객을 목록에서 삭제했습니다.`,
      undoLabel: "되돌리기",
      undoAction: async () => {
        const restoreRes = await postJsonHonest(
          `restore_client:${deletedSnapshot.id}`,
          "/api/broker/inbox/actions",
          {
            action: "upsert_client",
            clientId: deletedSnapshot.id,
            clientName: deletedSnapshot.clientName,
            clientPhone: deletedSnapshot.clientPhone,
            clientGrade: deletedSnapshot.clientGrade,
            budget: deletedSnapshot.budget,
            preferredRegion: deletedSnapshot.preferredRegion,
            buildingId: deletedSnapshot.buildingId,
            buildingTitle: deletedSnapshot.buildingTitle,
            newsletterSubscribed: Boolean(deletedSnapshot.newsletterSubscribed),
          },
          "고객 복구에 실패했습니다. 잠시 후 다시 시도해 주세요."
        );
        if (!restoreRes.ok) return;
        setThreads((prev) => {
          if (prev.some((t) => t.id === deletedSnapshot.id)) return prev;
          const next = [deletedSnapshot, ...prev];
          persistThreads(next);
          return next;
        });
        selectThread(deletedSnapshot.id);
      },
    });
  };

  // Archive / Dismiss non-custom-client thread (C-3)
  const handleArchiveThread = async (targetThread: InboxThreadItem) => {
    setStatusFeedback(null);
    const apiRes = await postJsonHonest(
      `archive:${targetThread.id}`,
      "/api/broker/inbox/actions",
      {
        action: "archive_thread",
        threadId: targetThread.id,
        buildingId: targetThread.buildingId,
      },
      "보관 처리에 실패했습니다. 잠시 후 다시 시도해 주세요."
    );
    if (!apiRes.ok) return;

    const remaining = threads.filter((t) => t.id !== targetThread.id);
    setThreads(remaining);
    persistThreads(remaining);
    const nextVisible = remaining.filter((t) =>
      matchesInboxThreadFilter(t, activeFilter, searchQuery)
    );
    setSelectedId(nextVisible[0]?.id || remaining[0]?.id || "");
    const msg = "소통 목록에서 보관(숨김) 처리했습니다.";
    setStatusFeedback(msg);
    showUndoToast(msg);
  };

  /* ──────── Column 1: 할 일 요약 카드 + 3개 필터 칩 + 고객 목록 (Apple iOS Frosted Rail) ──────── */
  const listSlot = (
    <div
      className="flex h-full flex-col space-y-3 bg-transparent p-3.5"
      data-testid="inbox-list-slot"
    >
      {/* 1열 상단 고정: "지금 할 일 {N}건" 요약 카드 (IB-11 — Spatial Tinted Glass) */}
      <div
        data-testid="inbox-todo-summary-card"
        className="rounded-2xl border border-[#FF9500]/24 bg-[#FF9500]/[0.08] backdrop-blur-xl p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_4px_14px_rgba(255,149,0,0.08)]"
      >
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-base font-bold text-[#1D1D1F]">
              지금 할 일 {pendingCount}건
            </p>
            <p className="mt-0.5 text-sm text-[#3A3A3C]">
              {pendingCount > 0
                ? "승인을 기다리는 IM 열람 요청을 바로 처리해 보세요."
                : "대기 중인 IM 열람 요청이 없습니다."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowNewClientModal(true)}
            data-testid="open-new-client-modal-btn"
            className="inline-flex min-h-[48px] shrink-0 items-center justify-center rounded-xl ios-glass-pill border border-slate-900/[0.08] bg-white/88 px-3.5 py-2 text-sm font-semibold text-[#1D1D1F] shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_2px_rgba(15,23,42,0.04)] transition-all hover:bg-white cursor-pointer"
          >
            + 고객 직접 등록
          </button>
        </div>

        {pendingThreads.length > 0 && (
          <div className="mt-3 space-y-2 border-t border-[#FF9500]/20 pt-3">
            {pendingThreads.slice(0, 1).map((pt) => (
              <div
                key={`todo-quick-${pt.id}`}
                role="button"
                tabIndex={0}
                data-testid={`quick-todo-card-${pt.id}`}
                onClick={() => selectThread(pt.id)}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    selectThread(pt.id);
                  }
                }}
                className="flex items-center justify-between gap-2 rounded-xl border border-[#FF9500]/22 bg-white/90 px-3 py-2 shadow-2xs transition hover:bg-white cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF]"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-[#1D1D1F]">
                    {pt.clientName} · {pt.buildingTitle}
                  </p>
                  <p className="truncate text-sm text-[#515154]">
                    {pt.cleanMessage || "IM 열람 요청"}
                  </p>
                </div>
                <button
                  type="button"
                  data-testid={`quick-approve-btn-${pt.id}`}
                  disabled={Boolean(busyAction)}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleApproveAndSendIm(pt);
                  }}
                  className="inline-flex min-h-[48px] shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-[#24B63E] to-[#188C2C] px-3.5 py-2 text-sm font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_2px_6px_rgba(29,158,52,0.22)] transition hover:brightness-105 disabled:opacity-50 cursor-pointer"
                >
                  자료 보내기
                </button>
              </div>
            ))}
            {pendingThreads.length > 1 && (
              <p className="px-1 text-sm font-semibold text-[#8A4B00]">
                외 {pendingThreads.length - 1}건의 대기 요청이 아래 목록에 있습니다.
              </p>
            )}
          </div>
        )}
      </div>

      {/* 1열 필터 칩 3개: 할 일 · 열람 · 전체 고객 (IB-12 — iOS Segmented Control) */}
      <div
        role="tablist"
        aria-label="고객 소통함 필터"
        data-testid="inbox-filter-tabs"
        className="grid grid-cols-3 gap-1 rounded-2xl border border-white/60 ios-segmented-track bg-[#767680]/[0.11] p-1"
      >
        {(
          [
            { key: "todo", label: "할 일" },
            { key: "views", label: "열람" },
            { key: "all", label: "전체 고객" },
          ] as const
        ).map((flt) => {
          const isSelected =
            activeFilter === flt.key ||
            (flt.key === "all" && (activeFilter === "vip" || activeFilter === "clients"));
          return (
            <button
              key={flt.key}
              type="button"
              role="tab"
              aria-selected={isSelected}
              data-testid={`inbox-filter-chip-${flt.key}`}
              onClick={() => handleFilterChange(flt.key)}
              className={`min-h-[44px] rounded-xl px-2.5 py-2 text-sm font-semibold transition-all cursor-pointer ${
                isSelected
                  ? "ios-segmented-pill bg-white text-[#007AFF]"
                  : "bg-transparent text-[#3A3A3C] hover:text-[#1D1D1F]"
              }`}
            >
              {flt.label}
            </button>
          );
        })}
      </div>

      {/* 검색창 */}
      <div>
        <label htmlFor="inbox-search-input" className="sr-only">
          고객명, 연락처, 회사명, 매물명 또는 상담 메모 검색
        </label>
        <input
          id="inbox-search-input"
          type="search"
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="고객명, 연락처, 회사명, 매물 검색"
          className="min-h-[48px] w-full rounded-2xl border border-slate-900/[0.12] bg-white/92 px-3.5 py-2.5 text-base text-[#1D1D1F] focus:border-[#007AFF] focus:ring-4 focus:ring-[#007AFF]/18 focus:outline-none transition-all"
        />
      </div>

      {/* 스레드 목록 또는 친절한 빈 상태 (IB-06) */}
      <div className="flex-1 space-y-2 overflow-y-auto pr-0.5">
        {threads.length === 0 ? (
          <div
            data-testid="inbox-empty-state"
            className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center"
          >
            <p className="text-base font-bold text-slate-900">
              아직 도착한 요청이 없어요. 딜카드를 보내면 고객의 IM 요청이 여기에 모입니다.
            </p>
            <p className="mt-1.5 text-sm text-slate-600">
              관심 고객을 직접 등록해 두고 딜카드나 IM 전용 링크를 카톡으로 발송할 수도 있습니다.
            </p>
            <button
              type="button"
              onClick={() => setShowNewClientModal(true)}
              data-testid="empty-state-add-client-btn"
              className="mt-4 inline-flex min-h-[48px] items-center justify-center rounded-xl bg-slate-900 px-5 py-3 text-base font-bold text-white shadow-xs transition hover:bg-slate-800 cursor-pointer"
            >
              + 고객 직접 등록
            </button>
          </div>
        ) : filteredThreads.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-5 text-center">
            <p className="text-base font-semibold text-slate-800">
              {activeFilter === "todo"
                ? "현재 대기 중인 할 일이 없습니다."
                : "선택한 조건에 맞는 고객이 없습니다."}
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                handleFilterChange("all");
              }}
              className="mt-3 inline-flex min-h-[48px] items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50 cursor-pointer"
            >
              전체 고객 보기
            </button>
          </div>
        ) : (
          filteredThreads.map((item) => {
            const isSelected = activeThread?.id === item.id;
            const isSubPendingConfirm =
              item.id.startsWith("sub_") &&
              !item.newsletterSubscribed &&
              (item.cleanMessage || "").includes("수신 확인 대기");
            const statusBadge =
              item.status === "pending_gate"
                ? {
                    text: "IM 요청 대기",
                    cls: "bg-amber-100 text-amber-900 border border-amber-300",
                  }
                : item.status === "revoked"
                ? {
                    text: "링크 잠김",
                    cls: "bg-rose-100 text-rose-800 border border-rose-200",
                  }
                : item.gateStatus === "rejected"
                ? {
                    text: "요청 거절됨",
                    cls: "bg-slate-200 text-slate-700 border border-slate-300",
                  }
                : item.status === "high_interest" || item.openCount >= 3
                ? {
                    text: "관심 높음",
                    cls: "bg-blue-100 text-blue-900 border border-blue-200",
                  }
                : item.id.startsWith("sub_")
                ? isSubPendingConfirm
                  ? {
                      text: "수신 확인 대기",
                      cls: "bg-amber-100 text-amber-900 border border-amber-300",
                    }
                  : item.newsletterSubscribed
                  ? {
                      text: "수신 동의 완료",
                      cls: "bg-emerald-100 text-emerald-900 border border-emerald-200",
                    }
                  : {
                      text: "수신 거부",
                      cls: "bg-slate-100 text-slate-700 border border-slate-200",
                    }
                : {
                    text: item.openCount > 0 ? `${item.openCount}회 열람` : "등록 고객",
                    cls: "bg-slate-100 text-slate-700 border border-slate-200",
                  };

            return (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                aria-current={isSelected ? "true" : undefined}
                data-selected={isSelected ? "true" : "false"}
                data-testid={`inbox-thread-row-${item.id}`}
                onClick={() => selectThread(item.id)}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    selectThread(item.id);
                  }
                }}
                className={`rounded-xl border p-3.5 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF] ${
                  isSelected
                    ? "border-blue-600 bg-blue-50/50 shadow-xs"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-sm font-bold ${statusBadge.cls}`}
                      >
                        {statusBadge.text}
                      </span>
                      <span className="truncate text-base font-bold text-slate-900">
                        {item.clientName}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-sm font-semibold text-slate-700">
                      {item.id.startsWith("sub_") && item.clientPhone
                        ? `${formatPhoneKo(item.clientPhone)} · ${item.buildingTitle}`
                        : item.buildingTitle}
                    </p>
                    <p className="mt-0.5 line-clamp-1 text-sm text-slate-600">
                      {item.latestEvent}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm text-slate-500">
                    {item.updatedAt}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  /* ──────── Column 2: 3개 탭 (할 일 · 메시지 · 기록) (IB-13, IB-14) ──────── */
  const editorSlot = (
    <div
      className="mx-auto max-w-3xl space-y-5 p-4 md:p-6"
      data-testid="inbox-editor-slot"
    >
      {!activeThread ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-xs">
          <h2 className="text-lg font-bold text-slate-900">
            선택된 고객이 없습니다
          </h2>
          <p className="mt-2 text-base text-slate-600">
            왼쪽 목록에서 고객을 선택하거나 상단의 [+ 고객 직접 등록] 버튼을 눌러 새 고객을 추가해 보세요.
          </p>
        </div>
      ) : (
        <>
          {inlineActionError && (
            <div
              role="alert"
              data-testid="inbox-action-error-banner"
              className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900"
            >
              {inlineActionError}
            </div>
          )}

          {/* 선택된 고객 상단 헤더 + 딜카드/IM 편집 딥링크 (INBOX-04) */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-md px-2.5 py-1 text-sm font-bold ${
                      activeThread.status === "pending_gate"
                        ? "border border-amber-300 bg-amber-100 text-amber-900"
                        : activeThread.status === "revoked"
                        ? "border border-rose-200 bg-rose-100 text-rose-800"
                        : activeThread.gateStatus === "rejected"
                        ? "border border-slate-300 bg-slate-200 text-slate-700"
                        : activeThread.status === "high_interest" ||
                          activeThread.openCount >= 3
                        ? "border border-blue-200 bg-blue-100 text-blue-900"
                        : "border border-slate-200 bg-slate-100 text-slate-700"
                    }`}
                  >
                    {activeThread.status === "pending_gate"
                      ? "IM 요청 대기"
                      : activeThread.status === "revoked"
                      ? "링크 잠김"
                      : activeThread.gateStatus === "rejected"
                      ? "요청 거절됨"
                      : activeThread.status === "high_interest" ||
                        activeThread.openCount >= 3
                      ? "관심 높음"
                      : activeThread.openCount > 0
                      ? "열람 고객"
                      : "등록 고객"}
                  </span>
                  <h2 className="text-lg font-extrabold text-slate-900">
                    {activeThread.clientName}
                  </h2>
                  {activeThread.clientCompany && (
                    <span className="text-sm font-semibold text-slate-600">
                      · {activeThread.clientCompany}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-base font-semibold text-slate-800">
                  관심 매물: {activeThread.buildingTitle}
                </p>

                {activeThread.buildingId.trim().length > 0 &&
                  !activeThread.buildingTitle.includes("삭제된 매물") && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      <Link
                        href={`/broker/w/dealcards?buildingId=${encodeURIComponent(
                          activeThread.buildingId.trim()
                        )}`}
                        data-testid="inbox-open-dealcard-link"
                        className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-sm font-bold text-slate-800 transition hover:bg-slate-100"
                      >
                        📄 딜카드 편집 →
                      </Link>
                      <Link
                        href={`/broker/w/im?buildingId=${encodeURIComponent(
                          activeThread.buildingId.trim()
                        )}`}
                        data-testid="inbox-open-im-link"
                        className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-sm font-bold text-slate-800 transition hover:bg-slate-100"
                      >
                        📊 IM 편집 →
                      </Link>
                    </div>
                  )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {!activeThread.id.startsWith("custom_") &&
                  !activeThread.id.startsWith("cli-") &&
                  !activeThread.id.startsWith("sub_") && (
                    <button
                      type="button"
                      data-testid="inbox-archive-thread-btn"
                      disabled={Boolean(busyAction)}
                      onClick={() => handleArchiveThread(activeThread)}
                      className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50 cursor-pointer"
                    >
                      보관(숨김)
                    </button>
                  )}
                {activeThread.clientPhone ? (
                  <a
                    href={`tel:${activeThread.clientPhone}`}
                    className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-900 hover:bg-slate-50"
                  >
                    전화 걸기 ({formatPhoneKo(activeThread.clientPhone)})
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="inline-flex min-h-[48px] cursor-not-allowed items-center justify-center rounded-xl border border-slate-200 bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-400"
                  >
                    전화번호 없음
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 2열 상단 탭 3개: 할 일 · 메시지 · 기록 (IB-13) */}
          <div
            role="tablist"
            aria-label="고객 상담 및 관리 탭"
            data-testid="inbox-editor-primary-tabs"
            className="grid grid-cols-3 gap-2 rounded-xl border border-slate-200 bg-slate-200/70 p-1.5"
          >
            {(
              [
                { id: "todo", label: "할 일" },
                { id: "message", label: "메시지" },
                { id: "history", label: "기록" },
              ] as const
            ).map((tab) => {
              const isSelected = activeEditorTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  data-testid={`inbox-editor-tab-${tab.id}`}
                  onClick={() => setActiveEditorTab(tab.id)}
                  className={`min-h-[48px] rounded-lg px-3 py-2.5 text-base font-bold transition cursor-pointer ${
                    isSelected
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-700 hover:bg-white/60 hover:text-slate-900"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* 탭 1: 할 일 (대기 요청 시 요청 사유 + [자료 보내기(승인)] / [거절] 첫 화면 노출 — IB-14) */}
          {activeEditorTab === "todo" && (
            <div className="space-y-4" data-testid="inbox-tab-panel-todo">
              {activeThread.status === "pending_gate" ? (
                <div
                  data-testid="inbox-pending-gate-card"
                  className="rounded-2xl border-2 border-amber-300 bg-amber-50/70 p-5 shadow-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center rounded-md bg-amber-200 px-2.5 py-1 text-sm font-extrabold text-amber-950">
                      IM 열람 요청
                    </span>
                    <span className="text-sm font-semibold text-amber-900">
                      {activeThread.updatedAt}
                    </span>
                  </div>
                  <h3 className="mt-3 text-base font-bold text-slate-900">
                    요청 사유 및 메시지
                  </h3>
                  <p className="mt-1.5 rounded-xl border border-amber-200 bg-white p-3.5 text-base text-slate-800">
                    {activeThread.cleanMessage ||
                      activeThread.detail ||
                      "상세 투자설명서(IM) 열람을 요청했습니다."}
                  </p>

                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      data-testid="approve-gate-primary-btn"
                      disabled={Boolean(busyAction)}
                      onClick={() => handleApproveAndSendIm(activeThread)}
                      className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-xl bg-emerald-600 px-5 py-3 text-base font-extrabold text-white shadow-xs transition hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
                    >
                      자료 보내기(승인)
                    </button>
                    <button
                      type="button"
                      data-testid="reject-gate-btn"
                      disabled={Boolean(busyAction)}
                      onClick={() => handleRejectRequest(activeThread)}
                      className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-3 text-base font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50 cursor-pointer"
                    >
                      거절
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                  <h3 className="text-base font-bold text-slate-900">
                    현재 열람 및 진행 상태
                  </h3>
                  <p className="mt-1.5 text-base text-slate-700">
                    {activeThread.gateStatus === "rejected"
                      ? "IM 열람 요청을 거절했습니다. 다시 자료를 보내시려면 아래 버튼을 눌러 주세요."
                      : activeThread.focusedSections &&
                        activeThread.focusedSections.length > 0
                      ? `집중 열람 항목: ${activeThread.focusedSections.join(" · ")}`
                      : activeThread.openCount > 0
                      ? `발송한 자료를 총 ${activeThread.openCount}회 열람했습니다.`
                      : "아직 자료를 열람하지 않았습니다. 아래 버튼으로 맞춤 매물 자료를 보내 보세요."}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2.5">
                    <button
                      type="button"
                      disabled={activeThread.status === "revoked" || Boolean(busyAction)}
                      onClick={() => handleSendMaterial("im")}
                      className={`inline-flex min-h-[48px] items-center justify-center rounded-xl px-4 py-2.5 text-sm font-bold ${
                        activeThread.status === "revoked"
                          ? "cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400"
                          : "bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
                      }`}
                    >
                      {activeThread.status === "revoked"
                        ? "IM 전용 링크 (잠김)"
                        : "IM 전용 링크 보내기"}
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(busyAction)}
                      onClick={() => handleSendMaterial("dealcard")}
                      className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                    >
                      딜카드 보내기
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(busyAction)}
                      onClick={() => handleSendMaterial("newsletter")}
                      className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                    >
                      뉴스레터 보내기
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 탭 2: 메시지 (카톡 안내 문구 편집 및 발송) */}
          {activeEditorTab === "message" && (
            <div
              className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs"
              data-testid="inbox-tab-panel-message"
            >
              <h3 className="text-base font-bold text-slate-900">
                카카오톡 자료 발송 메시지
              </h3>
              <div>
                <label
                  htmlFor="inbox-kakao-headline-input"
                  className="mb-1 block text-sm font-bold text-slate-700"
                >
                  안내 제목
                </label>
                <input
                  id="inbox-kakao-headline-input"
                  data-testid="inbox-kakao-headline-input"
                  type="text"
                  value={kakaoHeadline}
                  onChange={(e) => setKakaoHeadline(e.target.value)}
                  className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor="inbox-kakao-brief-input"
                  className="mb-1 block text-sm font-bold text-slate-700"
                >
                  안내 본문
                </label>
                <textarea
                  id="inbox-kakao-brief-input"
                  data-testid="inbox-kakao-brief-input"
                  rows={3}
                  value={kakaoBrief}
                  onChange={(e) => setKakaoBrief(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white p-3.5 text-base text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div className="flex flex-wrap gap-2.5">
                <button
                  type="button"
                  data-testid="send-im-link-btn"
                  disabled={activeThread.status === "revoked" || Boolean(busyAction)}
                  onClick={() => handleSendMaterial("im")}
                  className={`inline-flex min-h-[48px] items-center justify-center rounded-xl px-5 py-2.5 text-base font-bold ${
                    activeThread.status === "revoked"
                      ? "cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400"
                      : "bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
                  }`}
                >
                  {activeThread.status === "revoked"
                    ? "IM 전용 링크 (잠김)"
                    : "IM 전용 링크 보내기"}
                </button>
                <button
                  type="button"
                  disabled={Boolean(busyAction)}
                  onClick={() => handleSendMaterial("dealcard")}
                  className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                >
                  딜카드 보내기
                </button>
                <button
                  type="button"
                  disabled={Boolean(busyAction)}
                  onClick={() => handleSendMaterial("newsletter")}
                  className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                >
                  뉴스레터 보내기
                </button>
              </div>
            </div>
          )}

          {/* 탭 3: 기록 (통화 메모 및 실제 열람 타임라인 — IB-08) */}
          {activeEditorTab === "history" && (
            <div
              className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs"
              data-testid="inbox-tab-panel-history"
            >
              <div>
                <label
                  htmlFor="inbox-call-note-input"
                  className="mb-1.5 block text-sm font-bold text-slate-800"
                >
                  통화 및 상담 메모 남기기
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    id="inbox-call-note-input"
                    data-testid="inbox-call-note-input"
                    type="text"
                    value={callNote}
                    onChange={(e) => setCallNote(e.target.value)}
                    placeholder="예: 금주 금요일 오후 현장 답사 희망"
                    className="min-h-[48px] flex-1 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                  <button
                    type="button"
                    data-testid="save-call-note-btn"
                    disabled={Boolean(busyAction)}
                    onClick={handleAddCallNote}
                    className="inline-flex min-h-[48px] shrink-0 items-center justify-center rounded-xl bg-slate-900 px-5 py-2.5 text-base font-bold text-white hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
                  >
                    메모 저장
                  </button>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-4">
                <h3 className="text-base font-bold text-slate-900">
                  열람 및 상담 기록
                </h3>
                <ul className="mt-3 space-y-2.5">
                  {activeThread.events.length === 0 ? (
                    <li className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm text-slate-600">
                      상세 자료를 열람했습니다
                    </li>
                  ) : (
                    activeThread.events.map((ev) => (
                      <li
                        key={ev.id}
                        className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5"
                      >
                        <div className="space-y-0.5">
                          <p className="text-base font-medium text-slate-900">
                            {ev.description}
                          </p>
                          {ev.sectionName && (
                            <p className="text-sm text-slate-600">
                              열람 섹션: {ev.sectionName}
                            </p>
                          )}
                        </div>
                        <span className="shrink-0 text-sm text-slate-500">
                          {ev.timestamp}
                        </span>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );

  /* ──────── Column 3: 단일 주요 CTA + 직접 링크 복사 + 고객 요약 카드 + 인라인 링크 잠그기 ──────── */
  const primaryActionSlot = activeThread ? (
    activeThread.status === "pending_gate" ? (
      <button
        type="button"
        data-testid="primary-cta-approve-im"
        disabled={Boolean(busyAction)}
        onClick={() => handleApproveAndSendIm(activeThread)}
        className="min-h-[48px] w-full rounded-xl bg-emerald-600 px-4 py-3 text-base font-extrabold text-white shadow-xs transition hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
      >
        승인하고 IM 보내기
      </button>
    ) : (
      <button
        type="button"
        data-testid="primary-cta-kakao-send"
        disabled={Boolean(busyAction)}
        onClick={() => setShowShareSheet((prev) => !prev)}
        className="min-h-[48px] w-full rounded-xl bg-slate-900 px-4 py-3 text-base font-extrabold text-white shadow-xs transition hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
      >
        카톡으로 자료 보내기
      </button>
    )
  ) : null;

  const previewSlot = (
    <div className="space-y-4" data-testid="inbox-preview-slot">
      {!activeThread ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 text-center">
          <p className="text-base font-semibold text-slate-700">
            고객을 선택하거나 새로 등록하면 요약 정보와 링크 관리 메뉴가 표시됩니다.
          </p>
        </div>
      ) : (
        <>
          {/* 전용 링크 즉시 복사 버튼 — 카톡 공유 옆 상시 노출 (INBOX-04) */}
          {Boolean(activeThread.shareUrl) && activeThread.status !== "revoked" && (
            <button
              type="button"
              data-testid="inbox-copy-share-link-btn"
              onClick={handleCopyActiveShareLink}
              className="inline-flex min-h-[48px] w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-900 shadow-2xs transition hover:bg-slate-50 cursor-pointer"
            >
              🔗 링크 복사
            </button>
          )}

          {/* 카톡으로 자료 보내기 선택 시트 */}
          {showShareSheet && (
            <div
              data-testid="inbox-share-option-sheet"
              className="space-y-2 rounded-2xl border-2 border-slate-900 bg-white p-4 shadow-sm"
            >
              <p className="text-sm font-bold text-slate-900">
                보낼 자료를 선택하세요
              </p>
              <button
                type="button"
                disabled={activeThread.status === "revoked" || Boolean(busyAction)}
                onClick={() => handleSendMaterial("im")}
                className={`flex min-h-[48px] w-full items-center justify-between rounded-xl border px-3.5 py-2.5 text-left text-sm font-bold ${
                  activeThread.status === "revoked"
                    ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                    : "border-slate-200 bg-slate-50 text-slate-900 hover:bg-slate-100 disabled:opacity-50 cursor-pointer"
                }`}
              >
                <span>IM 전용 링크 보내기</span>
                <span className="text-sm text-blue-700">
                  {activeThread.status === "revoked" ? "잠김" : "선택 →"}
                </span>
              </button>
              <button
                type="button"
                disabled={Boolean(busyAction)}
                onClick={() => handleSendMaterial("dealcard")}
                className="flex min-h-[48px] w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-left text-sm font-bold text-slate-900 hover:bg-slate-100 disabled:opacity-50 cursor-pointer"
              >
                <span>딜카드 링크 보내기</span>
                <span className="text-sm text-blue-700">선택 →</span>
              </button>
              <button
                type="button"
                disabled={Boolean(busyAction)}
                onClick={() => handleSendMaterial("newsletter")}
                className="flex min-h-[48px] w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-left text-sm font-bold text-slate-900 hover:bg-slate-100 disabled:opacity-50 cursor-pointer"
              >
                <span>뉴스레터 보내기</span>
                <span className="text-sm text-blue-700">선택 →</span>
              </button>
            </div>
          )}

          {/* 고객 요약 카드 (이름 · 연락처 · 관심 매물 · 희망 예산 · 선호 권역 · 열람 횟수 · 뉴스레터 · 직접등록 수정/삭제) */}
          <div
            data-testid="inbox-client-summary-card"
            className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-extrabold text-slate-900">
                고객 요약
              </h3>
              <span className="rounded-md bg-slate-100 px-2.5 py-1 text-sm font-bold text-slate-800">
                {activeThread.clientGrade}
              </span>
            </div>

            <dl className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <dt className="font-semibold text-slate-500">고객명</dt>
                <dd className="font-bold text-slate-900">
                  {activeThread.clientName}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="font-semibold text-slate-500">연락처</dt>
                <dd className="font-bold text-slate-900">
                  {activeThread.clientPhone
                    ? formatPhoneKo(activeThread.clientPhone)
                    : "전화번호 없음"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="font-semibold text-slate-500">관심 매물</dt>
                <dd className="truncate font-bold text-slate-900">
                  {activeThread.buildingTitle}
                </dd>
              </div>
              {activeThread.budget && (
                <div className="flex items-center justify-between gap-2">
                  <dt className="font-semibold text-slate-500">희망 예산</dt>
                  <dd className="truncate font-bold text-slate-900">
                    {activeThread.budget}
                  </dd>
                </div>
              )}
              {activeThread.preferredRegion && (
                <div className="flex items-center justify-between gap-2">
                  <dt className="font-semibold text-slate-500">선호 권역</dt>
                  <dd className="truncate font-bold text-slate-900">
                    {activeThread.preferredRegion}
                  </dd>
                </div>
              )}
              <div className="flex items-center justify-between gap-2">
                <dt className="font-semibold text-slate-500">열람 횟수</dt>
                <dd className="font-bold text-slate-900">
                  {activeThread.openCount}회
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2 pt-1">
                <dt className="font-semibold text-slate-500">뉴스레터</dt>
                <dd>
                  <button
                    type="button"
                    data-testid="toggle-newsletter-btn"
                    disabled={Boolean(busyAction)}
                    onClick={handleToggleNewsletter}
                    className={`inline-flex min-h-[44px] items-center justify-center rounded-lg border px-3 py-1.5 text-sm font-bold transition disabled:opacity-50 cursor-pointer ${
                      activeThread.newsletterSubscribed
                        ? "border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100"
                        : activeThread.id.startsWith("sub_") &&
                          (activeThread.cleanMessage || "").includes("수신 확인 대기")
                        ? "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {activeThread.newsletterSubscribed
                      ? "수신 동의"
                      : activeThread.id.startsWith("sub_") &&
                        (activeThread.cleanMessage || "").includes("수신 확인 대기")
                      ? "수신 확인 대기"
                      : "미구독"}
                  </button>
                </dd>
              </div>
            </dl>

            {/* 직접 등록 고객 수정 / 삭제 버튼 (INBOX-12) */}
            {activeThread.id.startsWith("custom_") && (
              <div className="grid grid-cols-2 gap-2 border-t border-slate-200 pt-3">
                <button
                  type="button"
                  data-testid="edit-custom-client-btn"
                  disabled={Boolean(busyAction)}
                  onClick={handleOpenEditCustomClient}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                >
                  정보 수정
                </button>
                <button
                  type="button"
                  data-testid="delete-custom-client-btn"
                  disabled={Boolean(busyAction)}
                  onClick={handleDeleteCustomClient}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50 cursor-pointer"
                >
                  고객 삭제
                </button>
              </div>
            )}

            {/* 전화 걸기 버튼 (번호 있을 때만 활성 — IB-07) */}
            <div className="pt-2">
              {activeThread.clientPhone ? (
                <a
                  href={`tel:${activeThread.clientPhone}`}
                  data-testid="preview-call-link"
                  className="inline-flex min-h-[48px] w-full items-center justify-center rounded-xl border border-slate-300 bg-slate-50 px-4 py-2.5 text-base font-bold text-slate-900 transition hover:bg-slate-100"
                >
                  전화 걸기 ({formatPhoneKo(activeThread.clientPhone)})
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  data-testid="preview-call-disabled"
                  className="inline-flex min-h-[48px] w-full cursor-not-allowed items-center justify-center rounded-xl border border-slate-200 bg-slate-100 px-4 py-2.5 text-base font-semibold text-slate-400"
                >
                  전화번호 없음
                </button>
              )}
            </div>
          </div>

          {/* 하단: 보낸 링크 잠그기 (인라인 확인, window.prompt 제거 — IB-16) */}
          <div
            data-testid="inbox-link-governance-card"
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold text-slate-900">
                전용 링크 열람 권한
              </span>
              <span
                className={`inline-flex items-center rounded-md px-2 py-0.5 text-sm font-bold ${
                  activeThread.status === "revoked"
                    ? "bg-rose-100 text-rose-800"
                    : "bg-emerald-100 text-emerald-900"
                }`}
              >
                {activeThread.status === "revoked" ? "링크 잠김" : "열람 가능"}
              </span>
            </div>

            {activeThread.status === "revoked" ? (
              <div className="mt-3 space-y-2">
                <p className="text-sm text-rose-700">
                  이 고객에게 보낸 전용 링크는 현재 잠겨 있어 열람이 차단됩니다.
                </p>
                <button
                  type="button"
                  data-testid="unlock-share-link-btn"
                  disabled={Boolean(busyAction)}
                  onClick={handleUnlockLink}
                  className="inline-flex min-h-[48px] w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                >
                  링크 다시 열기
                </button>
              </div>
            ) : !confirmLockOpen ? (
              <div className="mt-3">
                <button
                  type="button"
                  data-testid="lock-share-link-trigger-btn"
                  disabled={Boolean(busyAction)}
                  onClick={() => setConfirmLockOpen(true)}
                  className="inline-flex min-h-[48px] w-full items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-bold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50 cursor-pointer"
                >
                  보낸 링크 잠그기
                </button>
              </div>
            ) : (
              <div
                data-testid="lock-share-link-inline-confirm"
                className="mt-3 space-y-3 rounded-xl border border-rose-300 bg-rose-50/80 p-3.5"
              >
                <p className="text-sm font-bold text-rose-900">
                  이 고객의 열람 링크를 잠글까요?
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    data-testid="confirm-lock-link-btn"
                    disabled={Boolean(busyAction)}
                    onClick={handleConfirmLockLink}
                    className="inline-flex min-h-[48px] items-center justify-center rounded-lg bg-rose-600 px-3 py-2 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-50 cursor-pointer"
                  >
                    잠그기
                  </button>
                  <button
                    type="button"
                    data-testid="cancel-lock-link-btn"
                    onClick={() => setConfirmLockOpen(false)}
                    className="inline-flex min-h-[48px] items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
                  >
                    취소
                  </button>
                </div>
              </div>
            )}

            {/* 수치 정정 안내 제어 (IB-G11, IB-G12, INBOX-02) */}
            <div
              data-testid="inbox-correction-notice-section"
              className="mt-4 border-t border-slate-200 pt-3.5 space-y-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-slate-900">
                  수치 정정 안내 배너
                </span>
                <span
                  className={`inline-flex items-center rounded-md px-2 py-0.5 text-sm font-bold ${
                    activeThread.hasCorrectionNotice
                      ? "bg-amber-100 text-amber-900"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {activeThread.hasCorrectionNotice ? "표시 중" : "꺼짐"}
                </span>
              </div>

              {activeThread.hasCorrectionNotice ? (
                <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3">
                  <p className="text-sm font-semibold text-amber-900 leading-snug">
                    ⚠️{" "}
                    {activeThread.correctionMessage ||
                      "매물 제원이 최신 기준으로 정정되었습니다."}
                  </p>
                  <button
                    type="button"
                    data-testid="clear-correction-notice-btn"
                    disabled={Boolean(busyAction)}
                    onClick={() => handleClearCorrectionNotice()}
                    className="inline-flex min-h-[48px] w-full items-center justify-center rounded-xl border border-amber-400 bg-white px-4 py-2 text-sm font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-50 cursor-pointer"
                  >
                    정정 안내 내리기
                  </button>
                </div>
              ) : !correctionNoticeOpen ? (
                <button
                  type="button"
                  data-testid="open-correction-notice-btn"
                  disabled={Boolean(busyAction)}
                  onClick={() => setCorrectionNoticeOpen(true)}
                  className="inline-flex min-h-[48px] w-full items-center justify-center rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-bold text-amber-900 transition hover:bg-amber-100 disabled:opacity-50 cursor-pointer"
                >
                  ⚠️ 수치 정정 안내 띄우기
                </button>
              ) : (
                <div
                  data-testid="correction-notice-inline-box"
                  className="space-y-2.5 rounded-xl border border-amber-300 bg-amber-50/80 p-3.5"
                >
                  <label
                    htmlFor="correction-notice-input"
                    className="block text-sm font-bold text-amber-950"
                  >
                    수신자 화면 상단에 띄울 정정 문구
                  </label>
                  <input
                    id="correction-notice-input"
                    data-testid="correction-notice-input"
                    type="text"
                    value={correctionNoticeText}
                    onChange={(e) => setCorrectionNoticeText(e.target.value)}
                    placeholder="예: 3층 임대료 조건이 정정되었습니다."
                    className="w-full min-h-[48px] rounded-lg border border-amber-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-amber-600 focus:outline-none"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      data-testid="submit-correction-notice-btn"
                      disabled={Boolean(busyAction)}
                      onClick={() => handlePublishCorrectionNotice()}
                      className="inline-flex min-h-[48px] items-center justify-center rounded-lg bg-amber-500 px-3 py-2 text-sm font-extrabold text-slate-950 hover:bg-amber-600 disabled:opacity-50 cursor-pointer"
                    >
                      정정 안내 게시
                    </button>
                    <button
                      type="button"
                      data-testid="cancel-correction-notice-btn"
                      onClick={() => setCorrectionNoticeOpen(false)}
                      className="inline-flex min-h-[48px] items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
                    >
                      취소
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );

  return (
    <>
      <WorkspaceShell
        workspace="inbox"
        listSlot={listSlot}
        editorSlot={editorSlot}
        previewSlot={previewSlot}
        primaryActionSlot={primaryActionSlot}
        selectedBuildingId={selectedId || activeThread?.id || null}
        selectedLabel={activeThread?.clientName}
        navBadges={{ inbox: pendingCount }}
        mobileTabLabels={{ editor: "상담", preview: "고객 정보" }}
        mobileStartOnList={mobileStayOnList}
      />

      {/* 직접 등록 고객 수정 모달 (INBOX-12) */}
      {editingClientOpen && activeThread && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          onClick={() => setEditingClientOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="inbox-edit-client-dialog-title"
            data-testid="inbox-edit-client-dialog"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
          >
            <div className="flex items-center justify-between gap-2">
              <h2
                id="inbox-edit-client-dialog-title"
                className="text-lg font-extrabold text-slate-900"
              >
                고객 정보 수정
              </h2>
              <button
                type="button"
                onClick={() => setEditingClientOpen(false)}
                className="inline-flex min-h-[48px] items-center justify-center rounded-lg px-3 text-sm font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                닫기
              </button>
            </div>

            <form onSubmit={handleUpdateCustomClient} className="mt-4 space-y-3.5">
              <div>
                <label
                  htmlFor="edit-client-name"
                  className="mb-1 block text-sm font-bold text-slate-800"
                >
                  고객 성함 (필수)
                </label>
                <input
                  id="edit-client-name"
                  data-testid="edit-client-name-input"
                  type="text"
                  required
                  value={editClientName}
                  onChange={(e) => setEditClientName(e.target.value)}
                  className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="edit-client-phone"
                  className="mb-1 block text-sm font-bold text-slate-800"
                >
                  연락처
                </label>
                <input
                  id="edit-client-phone"
                  data-testid="edit-client-phone-input"
                  type="tel"
                  value={editClientPhone}
                  onChange={(e) => setEditClientPhone(e.target.value)}
                  className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="edit-client-grade"
                  className="mb-1 block text-sm font-bold text-slate-800"
                >
                  고객 구분
                </label>
                <select
                  id="edit-client-grade"
                  value={editClientGrade}
                  onChange={(e) =>
                    setEditClientGrade(e.target.value as "VIP" | "일반" | "잠재")
                  }
                  className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 focus:border-blue-600 focus:outline-none"
                >
                  <option value="VIP">VIP</option>
                  <option value="일반">일반</option>
                  <option value="잠재">잠재</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="edit-client-building"
                  className="mb-1 block text-sm font-bold text-slate-800"
                >
                  관심 매물명
                </label>
                <input
                  id="edit-client-building"
                  list="inbox-inventory-buildings"
                  type="text"
                  value={editClientBuildingTitle}
                  onChange={(e) => setEditClientBuildingTitle(e.target.value)}
                  className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="edit-client-budget"
                    className="mb-1 block text-sm font-bold text-slate-800"
                  >
                    희망 예산
                  </label>
                  <input
                    id="edit-client-budget"
                    type="text"
                    value={editClientBudget}
                    onChange={(e) => setEditClientBudget(e.target.value)}
                    className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label
                    htmlFor="edit-client-region"
                    className="mb-1 block text-sm font-bold text-slate-800"
                  >
                    선호 권역
                  </label>
                  <input
                    id="edit-client-region"
                    type="text"
                    value={editClientRegion}
                    onChange={(e) => setEditClientRegion(e.target.value)}
                    className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingClientOpen(false)}
                  className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-base font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="submit"
                  data-testid="submit-edit-client-btn"
                  disabled={Boolean(busyAction)}
                  className="inline-flex min-h-[48px] items-center justify-center rounded-xl bg-slate-900 px-5 py-2.5 text-base font-bold text-white hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
                >
                  저장하기
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 고객 직접 등록 모달 (role="dialog", aria-modal="true", Escape 닫기, htmlFor/id 연결 — IB-26) */}
      {showNewClientModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          onClick={() => setShowNewClientModal(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="inbox-new-client-dialog-title"
            data-testid="inbox-new-client-dialog"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
          >
            <div className="flex items-center justify-between gap-2">
              <h2
                id="inbox-new-client-dialog-title"
                className="text-lg font-extrabold text-slate-900"
              >
                고객 직접 등록
              </h2>
              <button
                type="button"
                onClick={() => setShowNewClientModal(false)}
                className="inline-flex min-h-[48px] items-center justify-center rounded-lg px-3 text-sm font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                닫기
              </button>
            </div>

            <form onSubmit={handleCreateCustomClient} className="mt-4 space-y-3.5">
              <div>
                <label
                  htmlFor="new-client-name"
                  className="mb-1 block text-sm font-bold text-slate-800"
                >
                  고객 성함 (필수)
                </label>
                <input
                  id="new-client-name"
                  data-testid="new-client-name-input"
                  type="text"
                  required
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  placeholder="예: 홍길동 대표"
                  className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="new-client-phone"
                  className="mb-1 block text-sm font-bold text-slate-800"
                >
                  연락처 (선택)
                </label>
                <input
                  id="new-client-phone"
                  data-testid="new-client-phone-input"
                  type="tel"
                  value={newClientPhone}
                  onChange={(e) => setNewClientPhone(e.target.value)}
                  placeholder="예: 010-1234-5678"
                  className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="new-client-grade"
                  className="mb-1 block text-sm font-bold text-slate-800"
                >
                  고객 구분
                </label>
                <select
                  id="new-client-grade"
                  value={newClientGrade}
                  onChange={(e) =>
                    setNewClientGrade(e.target.value as "VIP" | "일반" | "잠재")
                  }
                  className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 focus:border-blue-600 focus:outline-none"
                >
                  <option value="VIP">VIP</option>
                  <option value="일반">일반</option>
                  <option value="잠재">잠재</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="new-client-building"
                  className="mb-1 block text-sm font-bold text-slate-800"
                >
                  관심 매물명 (선택)
                </label>
                <input
                  id="new-client-building"
                  list="inbox-inventory-buildings"
                  type="text"
                  value={newClientBuildingTitle}
                  onChange={(e) => setNewClientBuildingTitle(e.target.value)}
                  placeholder="예: 역삼동 코너 근생빌딩"
                  className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 focus:border-blue-600 focus:outline-none"
                />
                {inventory.length > 0 && (
                  <datalist id="inbox-inventory-buildings">
                    {inventory.map((deal) => (
                      <option key={deal.buildingId} value={deal.title} />
                    ))}
                  </datalist>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="new-client-budget"
                    className="mb-1 block text-sm font-bold text-slate-800"
                  >
                    희망 예산 (선택)
                  </label>
                  <input
                    id="new-client-budget"
                    type="text"
                    value={newClientBudget}
                    onChange={(e) => setNewClientBudget(e.target.value)}
                    placeholder="예: 100~130억"
                    className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label
                    htmlFor="new-client-region"
                    className="mb-1 block text-sm font-bold text-slate-800"
                  >
                    선호 권역 (선택)
                  </label>
                  <input
                    id="new-client-region"
                    type="text"
                    value={newClientRegion}
                    onChange={(e) => setNewClientRegion(e.target.value)}
                    placeholder="예: 강남구, 영등포구"
                    className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3">
                <input
                  id="new-client-newsletter"
                  data-testid="new-client-newsletter-checkbox"
                  type="checkbox"
                  checked={newClientNewsletterOptIn}
                  onChange={(e) => setNewClientNewsletterOptIn(e.target.checked)}
                  className="h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <label
                  htmlFor="new-client-newsletter"
                  className="text-sm font-semibold text-slate-800 cursor-pointer"
                >
                  시장 브리핑 뉴스레터 수신에 동의한 고객입니다 (선택)
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewClientModal(false)}
                  className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-base font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="submit"
                  data-testid="submit-new-client-btn"
                  disabled={Boolean(busyAction)}
                  className="inline-flex min-h-[48px] items-center justify-center rounded-xl bg-slate-900 px-5 py-2.5 text-base font-bold text-white hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
                >
                  고객 등록하기
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export default function InboxWorkspacePage(props: InboxWorkspacePageProps = {}) {
  return (
    <UndoToastProvider>
      <Suspense
        fallback={
          <div className="p-8 text-center text-base text-slate-500">
            고객 소통함을 불러오는 중...
          </div>
        }
      >
        <InboxWorkspaceInner {...props} />
      </Suspense>
    </UndoToastProvider>
  );
}
