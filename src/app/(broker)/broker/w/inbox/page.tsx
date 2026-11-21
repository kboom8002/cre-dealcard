"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback, Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import {
  useEditorPreviewSync,
  type EditorUnitTarget,
} from "@/components/workspace/preview-sync/useEditorPreviewSync";
import { useListViewMode } from "@/components/workspace/list/useListViewMode";
import { UndoToastProvider, useUndoToast } from "@/components/workspace/UndoConfirmToast";
import { ConfirmDeleteModal } from "@/components/workspace/ConfirmDeleteModal";
import { ContactBulkImportModal } from "@/components/workspace/inbox/ContactBulkImportModal";
import {
  extractWorkspaceResponseUserId,
  normalizeWorkspaceUserId,
  purgeWorkspaceClientStorage,
  syncActiveBrokerSessionStorage,
  writeScopedWorkspaceJson,
} from "@/lib/workspace/storage-namespace";
import { copyText } from "@/lib/ux/clipboard";
import { shareKakaoFeed } from "@/lib/kakao/share";
import {
  ALIMTALK_EARLY_ACCESS_NOTICE,
  INBOX_LEGACY_STORAGE_KEYS,
  INBOX_STORAGE_KEY_PREFIX,
  type BrokerInventoryDeal,
  type InboxClientRole,
  type InboxDispatchHistoryItem,
  type InboxEditorTabType,
  type InboxEmailDeliveryStatus,
  type InboxFilterType,
  type InboxThreadItem,
  type InboxTransactionalBasis,
  type InboxWorkspacePageProps,
  type KakaoOutreachPresetKind,
  type RecipientEvent,
  buildKakaoOutreachPreset,
  matchesInboxThreadFilter,
  normalizeServerThread,
  parseBudgetManwonValue,
  parseFilterParam,
  parsePreferredRegionsList,
  sanitizeClientPhone,
} from "./_components/inbox-types";
import { InboxListColumn } from "./_components/InboxListColumn";
import { InboxEditorColumn } from "./_components/InboxEditorColumn";
import {
  InboxPreviewColumn,
  type InboxAlimtalkTemplateId,
} from "./_components/InboxPreviewColumn";
import {
  InboxEditClientModal,
  InboxNewClientModal,
  type InboxClientFormValues,
} from "./_components/InboxClientModals";

export type {
  InboxFilterType,
  InboxEditorTabType,
  InboxClientRole,
  InboxEmailDeliveryStatus,
  InboxDispatchHistoryItem,
  RecipientEvent,
  InboxThreadItem,
  BrokerInventoryDeal,
  InboxWorkspacePageProps,
};
export { normalizeServerThread };

function buildCustomClientIdentityKey(item: {
  id: string;
  clientName: string;
  clientPhone: string;
  clientEmail?: string;
}): string {
  const nameLower = item.clientName.trim().toLowerCase();
  const phoneDigits = item.clientPhone.replace(/\D/g, "");
  const emailNorm = (item.clientEmail || "").trim().toLowerCase();
  const rowId = item.id.replace(/^(?:custom[-_]|cli-)/, "") || item.id;
  return phoneDigits
    ? `${nameLower}::p:${phoneDigits}`
    : emailNorm
      ? `${nameLower}::e:${emailNorm}`
      : `${nameLower}::id:${rowId}`;
}

const INITIAL_CLIENT_FORM: InboxClientFormValues = {
  name: "",
  phone: "",
  email: "",
  basis: "",
  grade: "VIP",
  role: "buyer",
  buildingTitle: "",
  budget: "",
  region: "",
  freeMemo: "",
  newsletterOptIn: false,
};

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
  const [aiReplyLoading, setAiReplyLoading] = useState(false);
  const [aiReplyHistory, setAiReplyHistory] = useState<string[]>([]);

  // Column 3 sheets & inline governance states
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [confirmLockOpen, setConfirmLockOpen] = useState(false);
  const [lockEntireBuilding, setLockEntireBuilding] = useState(false);
  const [correctionNoticeOpen, setCorrectionNoticeOpen] = useState(false);
  const [correctionNoticeText, setCorrectionNoticeText] = useState("");

  // Modals: Bulk Import, New Client, Edit Client, Confirm Delete
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [showNewClientModal, setShowNewClientModal] = useState(false);
  const [newClientForm, setNewClientForm] =
    useState<InboxClientFormValues>(INITIAL_CLIENT_FORM);
  const [editingClientOpen, setEditingClientOpen] = useState(false);
  const [editClientForm, setEditClientForm] = useState<
    Omit<InboxClientFormValues, "newsletterOptIn">
  >(() => {
    const { newsletterOptIn, ...rest } = INITIAL_CLIENT_FORM;
    void newsletterOptIn;
    return rest;
  });
  const [pendingDeleteClient, setPendingDeleteClient] =
    useState<InboxThreadItem | null>(null);

  // Outbound channel tier & message delivery controls
  const [subscriptionTier, setSubscriptionTier] = useState<"free" | "pro" | "premium">(
    "free"
  );
  const [outboundEmail, setOutboundEmail] = useState("");
  const [outboundBasis, setOutboundBasis] = useState<"" | InboxTransactionalBasis>("");
  const [outboundMarketingConsentConfirmed, setOutboundMarketingConsentConfirmed] = useState(false);
  const [outboundAssetKind, setOutboundAssetKind] = useState<
    "im" | "dealcard" | "magazine"
  >("im");
  const [alimtalkTemplateId, setAlimtalkTemplateId] =
    useState<InboxAlimtalkTemplateId>("TPL_INBOX_IM_APPROVED");
  const [showAlimtalkUpgradeSheet, setShowAlimtalkUpgradeSheet] = useState(false);
  const [kakaoPresetKind, setKakaoPresetKind] =
    useState<KakaoOutreachPresetKind>("intro");
  const [copiedBundlePreview, setCopiedBundlePreview] = useState<string | null>(null);
  const [lastBundleShareUrl, setLastBundleShareUrl] = useState<string>("");

  const [currentBrokerId, setCurrentBrokerId] = useState<string>("");
  const [clientOffset, setClientOffset] = useState<number>(0);
  const [hasMoreClients, setHasMoreClients] = useState<boolean>(false);
  const [totalClientsCount, setTotalClientsCount] = useState<number | null>(null);
  const [loadingMoreClients, setLoadingMoreClients] = useState<boolean>(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const busyLockRef = useRef<boolean>(false);
  const lastSyncedQueryKeyRef = useRef<string | null>(null);
  const lastPushedQueryKeyRef = useRef<string | null>(null);
  const lastSyncedFilterParamRef = useRef<string | null>(null);
  const [, setStatusFeedback] = useState<string | null>(null);

  const purgeInboxLocalStorage = useCallback(() => {
    try {
      purgeWorkspaceClientStorage();
      const keysToRemove: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith("credeal-w-inbox-")) {
          keysToRemove.push(k);
        }
      }
      for (const k of [...INBOX_LEGACY_STORAGE_KEYS, ...keysToRemove]) {
        window.localStorage.removeItem(k);
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  const persistThreads = useCallback(
    (next: InboxThreadItem[], brokerIdOverride?: string) => {
      const uid = normalizeWorkspaceUserId(brokerIdOverride ?? currentBrokerId);
      if (!uid) return;
      writeScopedWorkspaceJson(INBOX_STORAGE_KEY_PREFIX, uid, next);
    },
    [currentBrokerId]
  );

  // Explicit thread selection helper — updates selection, locks query sync ref, and updates URL (INBOX-01 / PT-201)
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
      nextParams.set(
        "filter",
        nextFilterOverride === "views" ? "viewing" : nextFilterOverride
      );
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

  const persistThreadsRef = useRef(persistThreads);
  const searchParamsRef = useRef(searchParams);
  const initialThreadsLenRef = useRef(initialThreads.length);
  useEffect(() => {
    persistThreadsRef.current = persistThreads;
    searchParamsRef.current = searchParams;
    initialThreadsLenRef.current = initialThreads.length;
  }, [persistThreads, searchParams, initialThreads.length]);

  const refreshInboxFromServer = useCallback(
    async (opts?: { switchToAllOnImport?: boolean; offset?: number; append?: boolean }) => {
      try {
        const reqOffset = typeof opts?.offset === "number" && opts.offset > 0 ? Math.trunc(opts.offset) : 0;
        const res = await fetch(
          `/api/broker/inbox?workspace=1&clientOffset=${reqOffset}&clientPageSize=50`
        );
        if (res.status === 401 || res.status === 403) {
          purgeInboxLocalStorage();
          setCurrentBrokerId("");
          setThreads([]);
          setSelectedId("");
          setHasMoreClients(false);
          return;
        }
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        if (!data) return;

        if (data.pagination && typeof data.pagination === "object") {
          setHasMoreClients(Boolean(data.pagination.hasMoreClients));
          setClientOffset(reqOffset);
          if (typeof data.pagination.totalClients === "number") {
            setTotalClientsCount(data.pagination.totalClients);
          }
        } else if (!opts?.append) {
          setHasMoreClients(false);
          setClientOffset(0);
        }

        const resolvedUid =
          extractWorkspaceResponseUserId(data) ||
          (typeof data.viewerBrokerId === "string" && data.viewerBrokerId.trim()) ||
          "";
        if (resolvedUid) {
          syncActiveBrokerSessionStorage(resolvedUid);
          setCurrentBrokerId(resolvedUid);
        }

        if (
          data.subscription?.tier === "pro" ||
          data.subscription?.tier === "premium" ||
          data.subscription?.tier === "free"
        ) {
          setSubscriptionTier(data.subscription.tier);
        } else if (data.subscription?.isPaid) {
          setSubscriptionTier("pro");
        }

        if (Array.isArray(data.inventory) && data.inventory.length > 0) {
          setInventory(data.inventory);
        }

        if (Array.isArray(data.threads)) {
          const serverThreads = data.threads.map(normalizeServerThread);
          const initLen = initialThreadsLenRef.current;
          setThreads((prev) => {
            if (serverThreads.length === 0) {
              if (opts?.append || (prev.length > 0 && initLen > 0)) {
                return prev;
              }
              if (resolvedUid) {
                persistThreadsRef.current([], resolvedUid);
              }
              return [];
            }

            const baseList =
              opts?.append || (initLen > 0 && !opts?.switchToAllOnImport)
                ? [...prev, ...serverThreads]
                : serverThreads;
            const byId = new Map<string, InboxThreadItem>();
            const seenCustomClientKeys = new Set<string>();
            for (const item of baseList) {
              if (!item?.id || byId.has(item.id)) continue;
              if (item.id.startsWith("custom_")) {
                const customKey = buildCustomClientIdentityKey(item);
                if (seenCustomClientKeys.has(customKey)) continue;
                seenCustomClientKeys.add(customKey);
              }
              byId.set(item.id, item);
            }
            const merged = Array.from(byId.values());
            if (resolvedUid) {
              persistThreadsRef.current(merged, resolvedUid);
            }

            if (!opts?.append && (initLen === 0 || opts?.switchToAllOnImport) && merged.length > 0) {
              const hasTodoItems = merged.some(
                (t) =>
                  t.status === "pending_gate" ||
                  t.status === "high_interest" ||
                  t.openCount >= 3
              );
              const queryFilter = parseFilterParam(
                searchParamsRef.current.get("filter")
              );
              if (opts?.switchToAllOnImport || (!hasTodoItems && !queryFilter)) {
                setActiveFilter("all");
              }
              setSelectedId((curr) =>
                curr && merged.some((t) => t.id === curr) ? curr : merged[0].id
              );
            }

            return merged;
          });
        }
      } catch {
        // Offline / test environment
      }
    },
    [purgeInboxLocalStorage]
  );

  const handleLoadMoreClients = async () => {
    if (loadingMoreClients || !hasMoreClients) return;
    setLoadingMoreClients(true);
    try {
      await refreshInboxFromServer({
        offset: clientOffset + 50,
        append: true,
      });
    } finally {
      setLoadingMoreClients(false);
    }
  };

  // Clear legacy unscoped storage keys and fetch real server threads once on mount
  useEffect(() => {
    try {
      for (const legacyKey of INBOX_LEGACY_STORAGE_KEYS) {
        window.localStorage.removeItem(legacyKey);
      }
    } catch {
      // ignore
    }
    queueMicrotask(() => {
      void refreshInboxFromServer();
    });
  }, [refreshInboxFromServer]);

  // Close client registration / edit modals on Escape key (IB-26)
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

  // Sync selection & filter from URL query params ONCE per URL change
  useEffect(() => {
    const rawFilter = searchParams.get("filter");
    const parsedFilter = parseFilterParam(rawFilter);
    let nextFilterToSet: InboxFilterType | null = null;
    if (parsedFilter && lastSyncedFilterParamRef.current !== rawFilter) {
      lastSyncedFilterParamRef.current = rawFilter;
      nextFilterToSet = parsedFilter;
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

    let matchedThreadId: string | null = null;
    if (!queryTarget) {
      lastSyncedQueryKeyRef.current = null;
    } else if (
      lastSyncedQueryKeyRef.current !== queryKey &&
      lastPushedQueryKeyRef.current !== queryKey
    ) {
      const match = threads.find(
        (t) => t.id === queryTarget || (Boolean(t.buildingId) && t.buildingId === queryTarget)
      );
      if (match) {
        lastSyncedQueryKeyRef.current = queryKey;
        matchedThreadId = match.id;
        const effectiveFilter = parsedFilter ?? activeFilter;
        if (!matchesInboxThreadFilter(match, effectiveFilter, "")) {
          nextFilterToSet = "all";
        }
      }
    }

    if (nextFilterToSet === null && matchedThreadId === null) {
      return;
    }

    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      if (nextFilterToSet !== null) {
        setActiveFilter(nextFilterToSet);
      }
      if (matchedThreadId !== null) {
        setSelectedId(matchedThreadId);
        setMobileStayOnList(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [searchParams, threads, activeFilter]);

  const pendingThreads = useMemo(
    () => threads.filter((t) => t.status === "pending_gate"),
    [threads]
  );
  const pendingCount = pendingThreads.length;
  const [viewMode, setViewMode] = useListViewMode();

  const filteredThreads = useMemo(
    () => threads.filter((t) => matchesInboxThreadFilter(t, activeFilter, searchQuery)),
    [threads, activeFilter, searchQuery]
  );

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

  const inboxPreviewUnits = useMemo<Record<string, EditorUnitTarget<InboxEditorTabType>>>(
    () => ({
      "ib-unit-todo": {
        unitId: "ib-unit-todo",
        label: "할 일",
        tab: "todo",
        editorSelector: '[data-testid="inbox-tab-panel-todo"]',
        focusSelector: '[data-testid="inbox-tab-panel-todo"]',
      },
      "ib-unit-message": {
        unitId: "ib-unit-message",
        label: "안내 메시지",
        tab: "message",
        editorSelector: '[data-testid="inbox-tab-panel-message"]',
        focusSelector: "#inbox-kakao-headline-input",
      },
      "ib-unit-history": {
        unitId: "ib-unit-history",
        label: "열람 및 상담 기록",
        tab: "history",
        editorSelector: '[data-testid="inbox-tab-panel-history"]',
        focusSelector: "#inbox-call-note-input",
      },
    }),
    []
  );

  const {
    activeUnitId: activeInboxUnitId,
    focusEditorUnit: focusInboxEditorUnit,
    notifyEditorFocus: notifyInboxEditorFocus,
  } = useEditorPreviewSync<InboxEditorTabType>({
    units: inboxPreviewUnits,
    onSelectTab: (tab) => {
      setMobileStayOnList(false);
      setActiveEditorTab(tab);
    },
  });

  const handleSelectInboxEditorTab = (tab: InboxEditorTabType) => {
    setActiveEditorTab(tab);
    if (tab === "todo") notifyInboxEditorFocus("ib-unit-todo");
    else if (tab === "message") notifyInboxEditorFocus("ib-unit-message");
    else notifyInboxEditorFocus("ib-unit-history");
  };

  const activeThreadSnapshotRef = useRef(activeThread);
  useEffect(() => {
    activeThreadSnapshotRef.current = activeThread;
  });
  const activeThreadId = activeThread?.id ?? "";

  // Reset transient drafts, inline confirmations & error banners when switching threads
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const current = activeThreadSnapshotRef.current;
      setConfirmLockOpen(false);
      setLockEntireBuilding(false);
      setShowShareSheet(false);
      setCorrectionNoticeOpen(false);
      setCorrectionNoticeText("");
      setCallNote("");
      setEditingClientOpen(false);
      setInlineActionError(null);
      setAiReplyHistory([]);
      setShowAlimtalkUpgradeSheet(false);
      setCopiedBundlePreview(null);
      if (!current) {
        setOutboundEmail("");
        setOutboundBasis("");
        setOutboundMarketingConsentConfirmed(false);
        return;
      }
      setOutboundEmail(current.clientEmail || "");
      setOutboundBasis(current.transactionalBasis || "");
      setOutboundMarketingConsentConfirmed(false);
      setOutboundAssetKind(
        !current.buildingId
          ? "magazine"
          : current.hasIm === false
          ? "dealcard"
          : "im"
      );
      if (current.status === "pending_gate") {
        setActiveEditorTab("todo");
      }
      setKakaoHeadline(`[${current.buildingTitle}] 상세 자료 안내`);
      setKakaoBrief(
        `${current.clientName}님, 관심 가져주신 [${current.buildingTitle}] 자료와 임대 현황을 보내드립니다. 살펴보시면서 궁금하신 점은 편하게 말씀해 주세요.`
      );
    });
    return () => {
      cancelled = true;
    };
  }, [activeThreadId]);

  // Shared honest mutation helper
  const postJsonHonest = async (
    actionKey: string,
    url: string,
    payload: Record<string, unknown>,
    fallbackError: string
  ): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> => {
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
        data: json && typeof json === "object" ? (json as Record<string, unknown>) : {},
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
    }

    const dispatchEntry: InboxDispatchHistoryItem = {
      id: `disp-send-${Date.now()}`,
      eventType: normalizedKind === "newsletter" ? "newsletter_sent" : "inbox_outbound_copied",
      channel: normalizedKind === "newsletter" ? "newsletter" : "kakao_copy",
      title:
        normalizedKind === "newsletter"
          ? kakaoHeadline || "뉴스레터 브리핑"
          : activeThread.buildingTitle,
      status: "prepared",
      createdAt: new Date().toISOString(),
    };

    setThreads((prev) => {
      const next = prev.map((t) => {
        if (t.id !== activeThread.id) return t;
        const issuedToken =
          typeof json.shareToken === "string" ? json.shareToken : "";
        return {
          ...t,
          ...(normalizedKind === "im" && typeof json.shareUrl === "string" && json.shareUrl
            ? {
                shareUrl: json.shareUrl,
                shareToken: issuedToken || t.shareToken,
              }
            : {}),
          dispatchHistory: [dispatchEntry, ...(t.dispatchHistory || [])],
        };
      });
      persistThreads(next);
      return next;
    });

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

  const handleKakaoPresetChange = (nextKind: KakaoOutreachPresetKind) => {
    setKakaoPresetKind(nextKind);
    if (!activeThread || !copiedBundlePreview) return;
    const effectiveUrl = lastBundleShareUrl || activeThread.shareUrl || "";
    if (!effectiveUrl) return;
    setCopiedBundlePreview(
      buildKakaoOutreachPreset(nextKind, {
        clientName: activeThread.clientName,
        buildingTitle: activeThread.buildingTitle,
        shareUrl: effectiveUrl,
        headline: kakaoHeadline,
      })
    );
  };

  const handlePrepareCopyBundle = async () => {
    if (!activeThread) return;
    setStatusFeedback(null);
    const resolvedAssetKind: "im" | "dealcard" | "magazine" =
      (outboundAssetKind === "im" || outboundAssetKind === "dealcard") &&
      !activeThread.buildingId.trim()
        ? "magazine"
        : outboundAssetKind;

    const apiRes = await postJsonHonest(
      `copy-bundle:${activeThread.id}`,
      "/api/broker/inbox/actions",
      {
        action: "prepare_copy_bundle",
        threadId: activeThread.id,
        clientId: activeThread.id,
        buildingId: activeThread.buildingId,
        buildingTitle: activeThread.buildingTitle,
        clientName: activeThread.clientName,
        assetKind: resolvedAssetKind,
        headline: kakaoHeadline,
        shareUrl: activeThread.shareUrl,
      },
      "안내 문구 준비에 실패했습니다. 잠시 후 다시 시도해 주세요."
    );
    if (!apiRes.ok) return;

    const messageText = String(apiRes.data.messageText || "");
    const nextShareUrl =
      typeof apiRes.data.shareUrl === "string" ? apiRes.data.shareUrl : "";
    const nextShareToken =
      typeof apiRes.data.shareToken === "string" ? apiRes.data.shareToken : "";

    const dispatchEntry: InboxDispatchHistoryItem = {
      id: `disp-copy-${Date.now()}`,
      eventType: "inbox_outbound_copied",
      channel: resolvedAssetKind === "magazine" ? "newsletter" : "kakao_copy",
      title: kakaoHeadline || activeThread.buildingTitle,
      status: "copied",
      createdAt: new Date().toISOString(),
    };

    setThreads((prev) => {
      const next = prev.map((t) =>
        t.id === activeThread.id
          ? {
              ...t,
              ...(resolvedAssetKind === "im" && nextShareUrl
                ? {
                    shareUrl: nextShareUrl,
                    shareToken: nextShareToken || t.shareToken,
                  }
                : {}),
              dispatchHistory: [dispatchEntry, ...(t.dispatchHistory || [])],
            }
          : t
      );
      persistThreads(next);
      return next;
    });

    const effectiveUrl = nextShareUrl || activeThread.shareUrl || "";
    if (effectiveUrl) {
      setLastBundleShareUrl(effectiveUrl);
    }
    const finalMessageText =
      kakaoPresetKind === "intro" && messageText
        ? messageText
        : effectiveUrl
          ? buildKakaoOutreachPreset(kakaoPresetKind, {
              clientName: activeThread.clientName,
              buildingTitle: activeThread.buildingTitle,
              shareUrl: effectiveUrl,
              headline: kakaoHeadline,
            })
          : messageText;

    if (finalMessageText) {
      await copyText(finalMessageText);
      setCopiedBundlePreview(finalMessageText);
    }
    const toastMsg = "안내 문구와 추적 링크를 복사했습니다.";
    setStatusFeedback(toastMsg);
    showUndoToast(toastMsg);
  };

  const handleSendInboxEmail = async () => {
    if (!activeThread) return;
    setStatusFeedback(null);
    const targetEmail = outboundEmail.trim() || (activeThread.clientEmail || "").trim();
    const resolvedBasis = outboundBasis || activeThread.transactionalBasis || "";
    const resolvedAssetKind: "im" | "dealcard" | "magazine" =
      (outboundAssetKind === "im" || outboundAssetKind === "dealcard") &&
      !activeThread.buildingId.trim()
        ? "magazine"
        : outboundAssetKind;

    const apiRes = await postJsonHonest(
      `email:${activeThread.id}`,
      "/api/broker/inbox/actions",
      {
        action: "send_inbox_email",
        threadId: activeThread.id,
        clientId: activeThread.id,
        buildingId: activeThread.buildingId,
        buildingTitle: activeThread.buildingTitle,
        clientName: activeThread.clientName,
        clientEmail: targetEmail,
        assetKind: resolvedAssetKind,
        headline: kakaoHeadline,
        shareUrl: activeThread.shareUrl,
        ...(resolvedBasis ? { transactionalBasis: resolvedBasis } : {}),
        marketingConsentConfirmed: outboundMarketingConsentConfirmed,
      },
      "이메일 발송에 실패했습니다. 이메일 주소를 확인해 주세요."
    );
    if (!apiRes.ok) return;

    const nextShareUrl =
      typeof apiRes.data.shareUrl === "string" ? apiRes.data.shareUrl : "";
    const nextShareToken =
      typeof apiRes.data.shareToken === "string" ? apiRes.data.shareToken : "";

    const dispatchEntry: InboxDispatchHistoryItem = {
      id: `disp-email-${Date.now()}`,
      eventType: "inbox_email_sent",
      channel: "email",
      title: kakaoHeadline || activeThread.buildingTitle,
      status: "sent",
      createdAt: new Date().toISOString(),
    };

    setThreads((prev) => {
      const next = prev.map((t) =>
        t.id === activeThread.id
          ? {
              ...t,
              clientEmail: targetEmail,
              transactionalBasis:
                (resolvedBasis as InboxThreadItem["transactionalBasis"]) ||
                t.transactionalBasis ||
                null,
              hasTransactionalBasis: Boolean(
                resolvedBasis || t.hasTransactionalBasis
              ),
              ...(resolvedAssetKind === "im" && nextShareUrl
                ? {
                    shareUrl: nextShareUrl,
                    shareToken: nextShareToken || t.shareToken,
                  }
                : {}),
              dispatchHistory: [dispatchEntry, ...(t.dispatchHistory || [])],
            }
          : t
      );
      persistThreads(next);
      return next;
    });

    const msg = apiRes.data.simulated
      ? `${targetEmail}로 이메일 발송을 접수했습니다(테스트 시뮬레이션).`
      : `${targetEmail}로 매물 자료 이메일을 발송했습니다.`;
    setStatusFeedback(msg);
    showUndoToast(msg);
  };

  const handleSendInboxAlimtalk = async () => {
    if (!activeThread) return;
    setStatusFeedback(null);
    if (subscriptionTier === "free") {
      setShowAlimtalkUpgradeSheet(true);
      showUndoToast(ALIMTALK_EARLY_ACCESS_NOTICE);
      return;
    }
    if (busyLockRef.current) return;
    busyLockRef.current = true;
    setBusyAction(`alimtalk:${activeThread.id}`);
    setInlineActionError(null);

    try {
      const resolvedBasis = outboundBasis || activeThread.transactionalBasis || "";
      const resolvedAssetKind: "im" | "dealcard" | "magazine" =
        (outboundAssetKind === "im" || outboundAssetKind === "dealcard") &&
        !activeThread.buildingId.trim()
          ? "magazine"
          : outboundAssetKind;

      const res = await fetch("/api/broker/inbox/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send_inbox_alimtalk",
          threadId: activeThread.id,
          clientId: activeThread.id,
          buildingId: activeThread.buildingId,
          buildingTitle: activeThread.buildingTitle,
          clientName: activeThread.clientName,
          clientPhone: activeThread.clientPhone,
          transactionalBasis: resolvedBasis,
          templateId: alimtalkTemplateId,
          assetKind: resolvedAssetKind,
          headline: kakaoHeadline,
          shareUrl: activeThread.shareUrl,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.ok === false) {
        if (json?.code === "PLAN_UPGRADE_REQUIRED") {
          setSubscriptionTier("free");
          setShowAlimtalkUpgradeSheet(true);
          return;
        }
        const errMsg =
          typeof json?.error === "string" && json.error.trim()
            ? json.error.trim()
            : "카카오 알림톡 발송 조건을 확인해 주세요.";
        setStatusFeedback(errMsg);
        setInlineActionError(errMsg);
        showUndoToast(errMsg);
        return;
      }

      if (json?.earlyAccess || json?.dispatched === false) {
        setShowAlimtalkUpgradeSheet(true);
        setStatusFeedback(ALIMTALK_EARLY_ACCESS_NOTICE);
        showUndoToast(ALIMTALK_EARLY_ACCESS_NOTICE);
        return;
      }

      const nextShareUrl = typeof json?.shareUrl === "string" ? json.shareUrl : "";
      const nextShareToken =
        typeof json?.shareToken === "string" ? json.shareToken : "";

      setThreads((prev) => {
        const next = prev.map((t) =>
          t.id === activeThread.id
            ? {
                ...t,
                transactionalBasis:
                  (resolvedBasis as InboxThreadItem["transactionalBasis"]) ||
                  t.transactionalBasis ||
                  null,
                hasTransactionalBasis: Boolean(
                  resolvedBasis || t.hasTransactionalBasis
                ),
                ...(resolvedAssetKind === "im" && nextShareUrl
                  ? {
                      shareUrl: nextShareUrl,
                      shareToken: nextShareToken || t.shareToken,
                    }
                  : {}),
              }
            : t
        );
        persistThreads(next);
        return next;
      });

      const okMsg = json?.simulated
        ? "카카오 정보성 알림톡 발송을 접수했습니다(테스트 시뮬레이션)."
        : "카카오 정보성 알림톡을 발송했습니다.";
      setStatusFeedback(okMsg);
      showUndoToast(okMsg);
    } catch {
      const errMsg = "카카오 알림톡 발송 중 오류가 발생했습니다.";
      setStatusFeedback(errMsg);
      setInlineActionError(errMsg);
      showUndoToast(errMsg);
    } finally {
      busyLockRef.current = false;
      setBusyAction(null);
    }
  };

  // Per-thread link lock by default (scope: "thread"), or building-level when explicitly checked
  const handleConfirmLockLink = async () => {
    if (!activeThread) return;
    const targetThread = activeThread;
    const effectiveScope: "thread" | "building" =
      lockEntireBuilding && Boolean(targetThread.buildingId.trim())
        ? "building"
        : "thread";
    const isGateLikeThread = !/^(custom_|sub_|cli-|view_)/.test(targetThread.id);

    setConfirmLockOpen(false);
    setLockEntireBuilding(false);
    setStatusFeedback(null);

    const apiRes = await postJsonHonest(
      `lock:${targetThread.id}`,
      "/api/broker/share-links/revoke",
      {
        scope: effectiveScope,
        token: targetThread.shareToken || "",
        buildingId: targetThread.buildingId,
        gateRequestId: isGateLikeThread ? targetThread.id : undefined,
        threadId: targetThread.id,
        reason:
          effectiveScope === "building"
            ? "building_locked_by_broker"
            : "broker_locked",
      },
      "열람 링크 잠금 처리에 실패했습니다. 잠시 후 다시 시도해 주세요."
    );
    if (!apiRes.ok) return;

    setThreads((prev) => {
      const next = prev.map((t) => {
        const shouldLock =
          effectiveScope === "building" && Boolean(targetThread.buildingId.trim())
            ? t.buildingId === targetThread.buildingId || t.id === targetThread.id
            : t.id === targetThread.id;
        return shouldLock
          ? {
              ...t,
              status: "revoked" as const,
              latestEvent:
                effectiveScope === "building"
                  ? "이 건물 전체 열람 링크를 잠갔습니다."
                  : "보낸 링크를 잠갔습니다.",
            }
          : t;
      });
      persistThreads(next);
      return next;
    });

    const msg =
      effectiveScope === "building"
        ? `[${targetThread.buildingTitle}] 전체 열람 링크를 잠갔습니다.`
        : `${targetThread.clientName}님에게 보낸 열람 링크를 잠갔습니다.`;
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
        clientEmail: targetThread.clientEmail || undefined,
        buildingId: targetThread.buildingId,
        subscribed: nextSubscribed,
      },
      "뉴스레터 수신 설정 변경에 실패했습니다. 잠시 후 다시 시도해 주세요."
    );
    if (!apiRes.ok) return;

    const json = apiRes.data;
    const optInPending =
      nextSubscribed &&
      (json.optInPending === true || json.newsletterSubscribed === false);
    const effectiveSubscribed = nextSubscribed
      ? Boolean(json.newsletterSubscribed) && !optInPending
      : false;

    setThreads((prev) => {
      const next = prev.map((t) => {
        if (t.id !== targetThread.id) return t;
        const badgeLabel = optInPending
          ? "(수신 확인 대기)"
          : effectiveSubscribed
            ? "(수신 동의 완료)"
            : "(수신 거부)";
        const replaceSubLabel = (txt?: string) =>
          typeof txt === "string" && t.id.startsWith("sub_")
            ? txt.replace(
                /\((?:수신 동의 완료|수신 확인 대기|수신 거부|미구독)\)/g,
                badgeLabel
              )
            : txt;
        return {
          ...t,
          newsletterSubscribed: effectiveSubscribed,
          cleanMessage: replaceSubLabel(t.cleanMessage),
          latestEvent: replaceSubLabel(t.latestEvent) || t.latestEvent,
        };
      });
      persistThreads(next);
      return next;
    });

    const msg = optInPending
      ? "수신동의 확인 요청을 발송했습니다 (고객 확인 후 활성화됩니다)"
      : effectiveSubscribed
        ? `${targetThread.clientName}님의 뉴스레터 수신 동의가 켜졌습니다.`
        : `${targetThread.clientName}님의 뉴스레터 수신이 해제되었습니다.`;
    setStatusFeedback(msg);
    showUndoToast(msg);
  };

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

  // Create Custom Client with structured CRM fields
  const handleCreateCustomClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClientForm.name.trim()) return;

    let canonicalId = `custom_${Date.now()}`;
    const cleanPhone = sanitizeClientPhone(newClientForm.phone);
    const trimmedTitle = newClientForm.buildingTitle.trim();
    const matchedInventory = trimmedTitle
      ? inventory.find((d) => d.title === trimmedTitle || d.buildingId === trimmedTitle)
      : undefined;
    const resolvedBuildingId = matchedInventory?.buildingId || "";
    const resolvedBuildingTitle =
      trimmedTitle || matchedInventory?.title || "관심 매물 미지정";
    const isVip = newClientForm.grade === "VIP";
    const preferredRegions = parsePreferredRegionsList(newClientForm.region);
    const budgetManwon = parseBudgetManwonValue(newClientForm.budget);
    const freeMemo = newClientForm.freeMemo.trim();

    const apiRes = await postJsonHonest(
      "upsert_client",
      "/api/broker/inbox/actions",
      {
        action: "upsert_client",
        clientId: canonicalId,
        clientName: newClientForm.name.trim(),
        clientPhone: cleanPhone,
        clientEmail: newClientForm.email.trim(),
        transactionalBasis: newClientForm.basis || undefined,
        clientGrade: newClientForm.grade,
        isVip,
        clientRole: newClientForm.role,
        budget: newClientForm.budget.trim(),
        budgetManwon,
        preferredRegion: newClientForm.region.trim(),
        preferredRegions,
        freeMemo,
        buildingId: resolvedBuildingId,
        buildingTitle: resolvedBuildingTitle,
        newsletterOptIn: newClientForm.newsletterOptIn,
        newsletterSubscribed: newClientForm.newsletterOptIn,
      },
      "고객 등록 저장에 실패했습니다. 잠시 후 다시 시도해 주세요."
    );
    if (!apiRes.ok) return;

    const json = apiRes.data;
    if (typeof json.clientId === "string" && json.clientId) {
      canonicalId = json.clientId;
    }
    const jsonClient =
      json.client && typeof json.client === "object"
        ? (json.client as Record<string, unknown>)
        : null;
    const optInPending = Boolean(json.optInPending);
    const resolvedNewsletterSubscribed = optInPending
      ? false
      : Boolean(jsonClient?.newsletterSubscribed);

    const resolvedInvItem = resolvedBuildingId
      ? inventory.find((item) => item.buildingId === resolvedBuildingId)
      : undefined;
    const resolvedHasIm = resolvedInvItem?.hasIm ?? true;
    const resolvedHasDealCard = resolvedInvItem?.hasDealCard;

    const created: InboxThreadItem = {
      id: canonicalId,
      clientName: newClientForm.name.trim(),
      clientPhone: cleanPhone,
      clientEmail: newClientForm.email.trim(),
      transactionalBasis: newClientForm.basis || null,
      hasTransactionalBasis: Boolean(newClientForm.basis),
      clientGrade: newClientForm.grade,
      isVip,
      clientRole: newClientForm.role,
      preferredRegions,
      budgetManwon,
      freeMemo,
      emailDeliveryStatus: "ok",
      dispatchHistory: [],
      buildingTitle: resolvedBuildingTitle,
      buildingId: resolvedBuildingId,
      latestEvent: "직접 등록한 고객입니다.",
      cleanMessage: "직접 등록한 고객입니다.",
      updatedAt: new Date().toISOString(),
      openCount: 0,
      dwellSeconds: 0,
      isRead: true,
      status: "active",
      shareToken: "",
      shareUrl: resolvedBuildingId
        ? resolvedHasIm === false
          ? `/dc/${encodeURIComponent(resolvedBuildingId)}`
          : `/im-lite/${encodeURIComponent(resolvedBuildingId)}`
        : "",
      ...(resolvedInvItem?.hasIm !== undefined ? { hasIm: resolvedHasIm } : {}),
      ...(resolvedHasDealCard !== undefined ? { hasDealCard: resolvedHasDealCard } : {}),
      budget: newClientForm.budget.trim(),
      preferredRegion: newClientForm.region.trim(),
      focusedSections: [],
      newsletterSubscribed: resolvedNewsletterSubscribed,
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
      const customKey = buildCustomClientIdentityKey(created);
      const withoutDup = prev.filter((t) => {
        if (t.id === created.id) return false;
        if (t.id.startsWith("custom_")) {
          const existingKey = buildCustomClientIdentityKey(t);
          if (existingKey === customKey) return false;
        }
        return true;
      });
      const next = [created, ...withoutDup];
      persistThreads(next);
      return next;
    });

    setSearchQuery("");
    const shouldSwitchAll = !matchesInboxThreadFilter(created, activeFilter, "");
    if (shouldSwitchAll) {
      setActiveFilter("all");
    }
    selectThread(canonicalId, shouldSwitchAll ? "all" : undefined);

    const registrationToast =
      newClientForm.newsletterOptIn && optInPending
        ? "고객 이메일로 수신동의 확인 안내를 발송했습니다 (확인 완료 후 발송 가능)"
        : `${created.clientName} 고객이 등록되었습니다.`;
    setNewClientForm(INITIAL_CLIENT_FORM);
    setShowNewClientModal(false);
    setStatusFeedback(registrationToast);
    showUndoToast(registrationToast);
  };

  const handleOpenEditCustomClient = () => {
    if (!activeThread || !activeThread.id.startsWith("custom_")) return;
    setEditClientForm({
      name: activeThread.clientName,
      phone: activeThread.clientPhone,
      email: activeThread.clientEmail || "",
      basis: activeThread.transactionalBasis || "",
      grade: activeThread.clientGrade,
      role: activeThread.clientRole || "buyer",
      budget: activeThread.budget,
      region:
        activeThread.preferredRegion ||
        (activeThread.preferredRegions || []).join(", "),
      buildingTitle:
        activeThread.buildingTitle === "관심 매물 미지정"
          ? ""
          : activeThread.buildingTitle,
      freeMemo: activeThread.freeMemo || "",
    });
    setEditingClientOpen(true);
  };

  const handleUpdateCustomClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !activeThread ||
      !activeThread.id.startsWith("custom_") ||
      !editClientForm.name.trim()
    ) {
      return;
    }
    const targetThread = activeThread;
    const cleanPhone = sanitizeClientPhone(editClientForm.phone);
    const trimmedTitle = editClientForm.buildingTitle.trim();
    const matchedInventory = trimmedTitle
      ? inventory.find((d) => d.title === trimmedTitle || d.buildingId === trimmedTitle)
      : undefined;
    const resolvedBuildingId =
      matchedInventory?.buildingId ??
      (trimmedTitle === targetThread.buildingTitle ? targetThread.buildingId : "");
    const resolvedBuildingTitle =
      trimmedTitle || matchedInventory?.title || "관심 매물 미지정";
    const isVip = editClientForm.grade === "VIP";
    const preferredRegions = parsePreferredRegionsList(editClientForm.region);
    const budgetManwon = parseBudgetManwonValue(editClientForm.budget);
    const freeMemo = editClientForm.freeMemo.trim();

    const apiRes = await postJsonHonest(
      `update_client:${targetThread.id}`,
      "/api/broker/inbox/actions",
      {
        action: "update_client",
        clientId: targetThread.id,
        threadId: targetThread.id,
        clientName: editClientForm.name.trim(),
        clientPhone: cleanPhone,
        clientEmail: editClientForm.email.trim(),
        transactionalBasis: editClientForm.basis || undefined,
        clientGrade: editClientForm.grade,
        isVip,
        clientRole: editClientForm.role,
        budget: editClientForm.budget.trim(),
        budgetManwon,
        preferredRegion: editClientForm.region.trim(),
        preferredRegions,
        freeMemo,
        buildingId: resolvedBuildingId,
        buildingTitle: resolvedBuildingTitle,
        newsletterSubscribed: Boolean(targetThread.newsletterSubscribed),
      },
      "고객 정보 수정에 실패했습니다. 잠시 후 다시 시도해 주세요."
    );
    if (!apiRes.ok) return;

    const resolvedInvItem = resolvedBuildingId
      ? inventory.find((item) => item.buildingId === resolvedBuildingId)
      : undefined;
    const resolvedHasIm = resolvedInvItem?.hasIm ?? targetThread.hasIm ?? true;
    const resolvedHasDealCard = resolvedInvItem?.hasDealCard ?? targetThread.hasDealCard;

    setThreads((prev) => {
      const next = prev.map((t) =>
        t.id === targetThread.id
          ? {
              ...t,
              clientName: editClientForm.name.trim(),
              clientPhone: cleanPhone,
              clientEmail: editClientForm.email.trim(),
              transactionalBasis: editClientForm.basis || null,
              hasTransactionalBasis: Boolean(editClientForm.basis),
              clientGrade: editClientForm.grade,
              isVip,
              clientRole: editClientForm.role,
              budget: editClientForm.budget.trim(),
              budgetManwon,
              preferredRegion: editClientForm.region.trim(),
              preferredRegions,
              freeMemo,
              buildingId: resolvedBuildingId,
              buildingTitle: resolvedBuildingTitle,
              shareUrl: resolvedBuildingId
                ? resolvedHasIm === false
                  ? `/dc/${encodeURIComponent(resolvedBuildingId)}`
                  : t.shareToken
                  ? `/im-lite/${encodeURIComponent(resolvedBuildingId)}?token=${encodeURIComponent(t.shareToken)}`
                  : `/im-lite/${encodeURIComponent(resolvedBuildingId)}`
                : "",
              ...(resolvedHasIm !== undefined ? { hasIm: resolvedHasIm } : {}),
              ...(resolvedHasDealCard !== undefined ? { hasDealCard: resolvedHasDealCard } : {}),
            }
          : t
      );
      persistThreads(next);
      return next;
    });
    setOutboundEmail(editClientForm.email.trim());
    setOutboundBasis(editClientForm.basis);
    setEditingClientOpen(false);
    showUndoToast(`${editClientForm.name.trim()} 고객 정보를 수정했습니다.`);
  };

  // Delete custom client after ConfirmDeleteModal confirmation + Undo restore
  const handleConfirmDeleteCustomClient = async () => {
    const target = pendingDeleteClient;
    setPendingDeleteClient(null);
    if (!target || !target.id.startsWith("custom_")) return;
    const deletedSnapshot = { ...target };

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
            clientEmail: deletedSnapshot.clientEmail,
            clientGrade: deletedSnapshot.clientGrade,
            isVip: deletedSnapshot.isVip,
            clientRole: deletedSnapshot.clientRole,
            budget: deletedSnapshot.budget,
            budgetManwon: deletedSnapshot.budgetManwon,
            preferredRegion: deletedSnapshot.preferredRegion,
            preferredRegions: deletedSnapshot.preferredRegions,
            freeMemo: deletedSnapshot.freeMemo,
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

  const handleGenerateAiReply = async (targetThread: InboxThreadItem) => {
    if (aiReplyLoading) return;
    const prevHeadline = kakaoHeadline;
    const prevBrief = kakaoBrief;
    setAiReplyLoading(true);
    setInlineActionError(null);
    try {
      const lastEventText = targetThread.events?.[0]?.description || "";
      const res = await fetch("/api/broker/inbox/ai-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName: targetThread.clientName,
          clientRole: targetThread.clientRole,
          buildingTitle: targetThread.buildingTitle,
          assetKind: outboundAssetKind,
          openCount: targetThread.openCount ?? 0,
          lastEventText,
          callNote: callNote.trim() || undefined,
          hasIm: targetThread.hasIm,
          avoidReplies: aiReplyHistory,
          attemptSeed: aiReplyHistory.length,
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok: true; result?: { headline?: string; brief?: string } }
        | { ok: false; error?: string }
        | null;
      if (!res.ok || !json || !json.ok || !json.result?.headline || !json.result?.brief) {
        const errMsg = (json && !json.ok && json.error) || "AI 맞춤 답장을 작성하지 못했습니다.";
        setInlineActionError(errMsg);
        showUndoToast(errMsg);
        return;
      }
      const nextHeadline = json.result.headline;
      const nextBrief = json.result.brief;
      setKakaoHeadline(nextHeadline);
      setKakaoBrief(nextBrief);
      setAiReplyHistory((prev) =>
        Array.from(new Set([...prev, `${nextHeadline}\n${nextBrief}`])).slice(-5)
      );
      showUndoToast({
        message: "AI가 고객 맞춤 답장을 작성했습니다.",
        undoLabel: "되돌리기",
        undoAction: () => {
          setKakaoHeadline(prevHeadline);
          setKakaoBrief(prevBrief);
        },
      });
    } catch {
      const errMsg = "AI 맞춤 답장 요청 중 오류가 발생했습니다.";
      setInlineActionError(errMsg);
      showUndoToast(errMsg);
    } finally {
      setAiReplyLoading(false);
    }
  };

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
        onClick={() => {
          setShowShareSheet(true);
          if (typeof document !== "undefined") {
            const hub = document.querySelector('[data-testid="inbox-outbound-channel-bar"]');
            if (hub && typeof hub.scrollIntoView === "function") {
              hub.scrollIntoView({ behavior: "smooth", block: "nearest" });
            }
          }
          void handlePrepareCopyBundle();
        }}
        className="min-h-[48px] w-full rounded-xl bg-slate-900 px-4 py-3 text-base font-extrabold text-white shadow-xs transition hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
      >
        카톡으로 자료 보내기
      </button>
    )
  ) : null;

  return (
    <>
      <WorkspaceShell
        workspace="inbox"
        listSlot={
          <InboxListColumn
            threads={threads}
            filteredThreads={filteredThreads}
            pendingCount={pendingCount}
            firstPendingThread={pendingThreads[0]}
            activeThread={activeThread}
            activeFilter={activeFilter}
            searchQuery={searchQuery}
            viewMode={viewMode}
            busyAction={busyAction}
            onFilterChange={handleFilterChange}
            onSearchChange={handleSearchChange}
            onViewModeChange={setViewMode}
            onSelectThread={(id) => selectThread(id)}
            onApproveAndSendIm={handleApproveAndSendIm}
            onOpenNewClientModal={() => setShowNewClientModal(true)}
            onOpenBulkImportModal={() => setBulkImportOpen(true)}
            hasMoreClients={hasMoreClients}
            loadingMoreClients={loadingMoreClients}
            totalClientsCount={totalClientsCount}
            onLoadMoreClients={handleLoadMoreClients}
            onQuickEditClient={(target) => {
              selectThread(target.id);
              setEditClientForm({
                name: target.clientName,
                phone: target.clientPhone,
                email: target.clientEmail || "",
                basis: target.transactionalBasis || "",
                grade: target.clientGrade,
                role: target.clientRole || "buyer",
                budget: target.budget || "",
                region: target.preferredRegion || "",
                freeMemo: target.freeMemo || "",
                buildingTitle: target.buildingTitle || "",
              });
              setEditingClientOpen(true);
            }}
            onQuickDeleteClient={(target) => {
              selectThread(target.id);
              setPendingDeleteClient(target);
            }}
            onQuickArchiveThread={(target) => void handleArchiveThread(target)}
          />
        }
        editorSlot={
          <InboxEditorColumn
            activeThread={activeThread}
            activeEditorTab={activeEditorTab}
            inlineActionError={inlineActionError}
            busyAction={busyAction}
            kakaoHeadline={kakaoHeadline}
            kakaoBrief={kakaoBrief}
            callNote={callNote}
            onSelectEditorTab={handleSelectInboxEditorTab}
            onKakaoHeadlineChange={setKakaoHeadline}
            onKakaoBriefChange={setKakaoBrief}
            onCallNoteChange={setCallNote}
            onSaveCallNote={handleAddCallNote}
            onApproveAndSendIm={handleApproveAndSendIm}
            onRejectRequest={handleRejectRequest}
            onSendMaterial={handleSendMaterial}
            onArchiveThread={handleArchiveThread}
            onGenerateAiReply={handleGenerateAiReply}
            aiReplyLoading={aiReplyLoading}
            aiReplyCount={aiReplyHistory.length}
          />
        }
        previewSlot={
          <InboxPreviewColumn
            activeThread={activeThread}
            activeInboxUnitId={activeInboxUnitId}
            busyAction={busyAction}
            showShareSheet={showShareSheet}
            outboundAssetKind={outboundAssetKind}
            subscriptionTier={subscriptionTier}
            outboundEmail={outboundEmail}
            outboundBasis={outboundBasis}
            marketingConsentConfirmed={outboundMarketingConsentConfirmed}
            alimtalkTemplateId={alimtalkTemplateId}
            kakaoPresetKind={kakaoPresetKind}
            copiedBundlePreview={copiedBundlePreview}
            showAlimtalkUpgradeSheet={showAlimtalkUpgradeSheet}
            confirmLockOpen={confirmLockOpen}
            lockEntireBuilding={lockEntireBuilding}
            correctionNoticeOpen={correctionNoticeOpen}
            correctionNoticeText={correctionNoticeText}
            onFocusEditorUnit={focusInboxEditorUnit}
            onCopyActiveShareLink={handleCopyActiveShareLink}
            onSendMaterial={handleSendMaterial}
            onOutboundAssetKindChange={setOutboundAssetKind}
            onOutboundEmailChange={setOutboundEmail}
            onOutboundBasisChange={setOutboundBasis}
            onMarketingConsentConfirmedChange={setOutboundMarketingConsentConfirmed}
            onAlimtalkTemplateChange={setAlimtalkTemplateId}
            onKakaoPresetChange={handleKakaoPresetChange}
            onPrepareCopyBundle={handlePrepareCopyBundle}
            onSendInboxEmail={handleSendInboxEmail}
            onSendInboxAlimtalk={handleSendInboxAlimtalk}
            onCloseAlimtalkUpgradeSheet={() => setShowAlimtalkUpgradeSheet(false)}
            onToggleNewsletter={handleToggleNewsletter}
            onOpenEditCustomClient={handleOpenEditCustomClient}
            onRequestDeleteCustomClient={() => {
              if (activeThread && activeThread.id.startsWith("custom_")) {
                setPendingDeleteClient(activeThread);
              }
            }}
            onOpenConfirmLock={() => setConfirmLockOpen(true)}
            onCancelConfirmLock={() => {
              setConfirmLockOpen(false);
              setLockEntireBuilding(false);
            }}
            onLockEntireBuildingChange={setLockEntireBuilding}
            onConfirmLockLink={handleConfirmLockLink}
            onUnlockLink={handleUnlockLink}
            onOpenCorrectionNotice={() => setCorrectionNoticeOpen(true)}
            onCancelCorrectionNotice={() => setCorrectionNoticeOpen(false)}
            onCorrectionNoticeTextChange={setCorrectionNoticeText}
            onPublishCorrectionNotice={() => handlePublishCorrectionNotice()}
            onClearCorrectionNotice={() => handleClearCorrectionNotice()}
          />
        }
        primaryActionSlot={primaryActionSlot}
        selectedBuildingId={selectedId || activeThread?.id || null}
        selectedLabel={activeThread?.clientName}
        navBadges={{ inbox: pendingCount }}
        mobileTabLabels={{ editor: "상담", preview: "고객 정보" }}
        mobileStartOnList={mobileStayOnList}
      />

      <ContactBulkImportModal
        open={bulkImportOpen}
        onOpenChange={setBulkImportOpen}
        onImported={async (res) => {
          await refreshInboxFromServer({ switchToAllOnImport: true });
          showUndoToast(
            `명단 ${res.importedCount + res.updatedCount}건을 고객 소통함에 등록했습니다.`
          );
        }}
      />

      <ConfirmDeleteModal
        isOpen={Boolean(pendingDeleteClient)}
        title={
          pendingDeleteClient &&
          (pendingDeleteClient.isVip === true || pendingDeleteClient.clientGrade === "VIP")
            ? `VIP 고객 '${pendingDeleteClient.clientName}' 항목을 삭제할까요?`
            : `'${pendingDeleteClient?.clientName || "고객"}' 항목을 삭제할까요?`
        }
        description={
          pendingDeleteClient &&
          (pendingDeleteClient.isVip === true || pendingDeleteClient.clientGrade === "VIP")
            ? "중요 VIP 고객의 연락처·메모·발송 이력이 목록에서 삭제됩니다. (직후 하단 되돌리기 알림으로 복구 가능)"
            : "삭제한 직후 화면 하단의 [되돌리기] 버튼으로 바로 복구할 수 있습니다."
        }
        confirmLabel="고객 삭제"
        cancelLabel="취소"
        requireMatchText={
          pendingDeleteClient &&
          (pendingDeleteClient.isVip === true || pendingDeleteClient.clientGrade === "VIP")
            ? pendingDeleteClient.clientName
            : undefined
        }
        matchInputLabel="VIP 고객을 삭제하려면 아래 고객 성함을 그대로 입력해 주세요."
        onCancel={() => setPendingDeleteClient(null)}
        onConfirm={handleConfirmDeleteCustomClient}
      />

      <InboxEditClientModal
        open={editingClientOpen && Boolean(activeThread)}
        values={editClientForm}
        busyAction={busyAction}
        onChange={(patch) =>
          setEditClientForm((prev) => ({ ...prev, ...patch }))
        }
        onClose={() => setEditingClientOpen(false)}
        onSubmit={handleUpdateCustomClient}
      />

      <InboxNewClientModal
        open={showNewClientModal}
        values={newClientForm}
        inventory={inventory}
        existingThreads={threads}
        busyAction={busyAction}
        onChange={(patch) =>
          setNewClientForm((prev) => ({ ...prev, ...patch }))
        }
        onClose={() => setShowNewClientModal(false)}
        onSubmit={handleCreateCustomClient}
      />
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
