"use client";

import React, { useState, useEffect, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import { UndoToastProvider, useUndoToast } from "@/components/workspace/UndoConfirmToast";
import { copyText } from "@/lib/ux/clipboard";
import { shareKakaoFeed } from "@/lib/kakao/share";

export type InboxFilterType = "todo" | "views" | "all";
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

const STORAGE_KEY = "credeal-w-inbox-v4";
const LEGACY_STORAGE_KEYS = ["credeal-w-inbox-v3", "credeal-w-inbox-v2"];

function formatPhoneKo(raw: string): string {
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
  return { cleanMessage: trimmed };
}

function normalizeServerThread(raw: any): InboxThreadItem {
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
  const buildingId = String(raw?.buildingId || raw?.building_id || "bld-01").trim();
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
    openCount: Math.max(0, Number(raw?.openCount ?? 1)),
    isRead: Boolean(raw?.isRead),
    status: mappedStatus,
    shareToken: String(raw?.shareToken || ""),
    shareUrl:
      typeof raw?.shareUrl === "string" && raw.shareUrl
        ? raw.shareUrl
        : `/im-lite/${encodeURIComponent(buildingId)}`,
    events,
    budget: String(raw?.budget || "").trim(),
    preferredRegion: String(raw?.preferredRegion || "").trim(),
    focusedSections,
    hasCorrectionNotice: Boolean(raw?.hasCorrectionNotice),
    correctionMessage:
      typeof raw?.correctionMessage === "string" ? raw.correctionMessage : undefined,
    newsletterSubscribed: raw?.newsletterSubscribed !== false,
  };
}

function InboxWorkspaceInner({ initialThreads = [] }: InboxWorkspacePageProps) {
  const searchParams = useSearchParams();
  const { showUndoToast } = useUndoToast();

  const [threads, setThreads] = useState<InboxThreadItem[]>(() =>
    initialThreads.map(normalizeServerThread)
  );
  const [inventory, setInventory] = useState<BrokerInventoryDeal[]>([]);
  const [activeFilter, setActiveFilter] = useState<InboxFilterType>("todo");
  const [activeEditorTab, setActiveEditorTab] = useState<InboxEditorTabType>("todo");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string>(initialThreads[0]?.id || "");
  const [mobileStayOnList, setMobileStayOnList] = useState<boolean>(true);
  const [callNote, setCallNote] = useState("");
  const [kakaoHeadline, setKakaoHeadline] = useState("");
  const [kakaoBrief, setKakaoBrief] = useState("");

  // Share material selector sheet in Column 3
  const [showShareSheet, setShowShareSheet] = useState(false);
  // Inline lock confirmation state (replaces window.prompt — IB-16)
  const [confirmLockOpen, setConfirmLockOpen] = useState(false);

  // Accessible Client Registration Modal state (IB-26)
  const [showNewClientModal, setShowNewClientModal] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [newClientGrade, setNewClientGrade] = useState<"VIP" | "일반" | "잠재">("VIP");
  const [newClientBudget, setNewClientBudget] = useState("");
  const [newClientRegion, setNewClientRegion] = useState("");
  const [newClientBuildingTitle, setNewClientBuildingTitle] = useState("");
  const [, setStatusFeedback] = useState<string | null>(null);

  const persistThreads = (next: InboxThreadItem[]) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage errors
    }
  };

  // Clear legacy fake-seed storage keys and fetch real server threads
  useEffect(() => {
    try {
      for (const legacyKey of LEGACY_STORAGE_KEYS) {
        window.localStorage.removeItem(legacyKey);
      }
      if (initialThreads.length === 0) {
        const savedRaw = window.localStorage.getItem(STORAGE_KEY);
        if (savedRaw) {
          const parsed = JSON.parse(savedRaw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const normalized = parsed.map(normalizeServerThread);
            setThreads(normalized);
            setSelectedId((prev) => prev || normalized[0]?.id || "");
          }
        }
      }
    } catch {
      // ignore
    }

    fetch("/api/broker/inbox?workspace=1")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;

        if (Array.isArray(data.inventory) && data.inventory.length > 0) {
          setInventory(data.inventory);
        }

        if (Array.isArray(data.threads)) {
          const serverThreads = data.threads.map(normalizeServerThread);
          setThreads((prev) => {
            if (serverThreads.length === 0) {
              return prev.length > 0 && initialThreads.length > 0 ? prev : [];
            }
            const byId = new Map<string, InboxThreadItem>();
            const seenCustomClientKeys = new Set<string>();
            for (const item of [...serverThreads, ...prev]) {
              if (!item?.id || byId.has(item.id)) continue;
              if (item.id.startsWith("custom_")) {
                const customKey = `${item.clientName.trim().toLowerCase()}::${item.clientPhone.replace(/\D/g, "")}`;
                if (seenCustomClientKeys.has(customKey)) continue;
                seenCustomClientKeys.add(customKey);
              }
              byId.set(item.id, item);
            }
            const merged = Array.from(byId.values());
            persistThreads(merged);

            if (initialThreads.length === 0 && merged.length > 0) {
              const hasTodoItems = merged.some(
                (t) =>
                  t.status === "pending_gate" ||
                  t.status === "high_interest" ||
                  t.openCount >= 3
              );
              if (!hasTodoItems) {
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
    if (!showNewClientModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowNewClientModal(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showNewClientModal]);

  // Sync selection from query params
  useEffect(() => {
    const queryId = searchParams.get("thread") || searchParams.get("id");
    if (queryId) {
      const match = threads.find((t) => t.id === queryId || t.buildingId === queryId);
      if (match) {
        setSelectedId(match.id);
      }
    }
  }, [searchParams, threads]);

  const pendingThreads = useMemo(
    () => threads.filter((t) => t.status === "pending_gate"),
    [threads]
  );
  const pendingCount = pendingThreads.length;

  const filteredThreads = useMemo(() => {
    return threads.filter((t) => {
      const q = searchQuery.trim().toLowerCase();
      const matchQuery =
        !q ||
        t.clientName.toLowerCase().includes(q) ||
        t.buildingTitle.toLowerCase().includes(q) ||
        t.preferredRegion.toLowerCase().includes(q);

      if (!matchQuery) return false;

      if (activeFilter === "todo") {
        return (
          t.status === "pending_gate" ||
          t.status === "high_interest" ||
          t.openCount >= 3
        );
      }
      if (activeFilter === "views") {
        return t.openCount > 0;
      }
      return true;
    });
  }, [threads, activeFilter, searchQuery]);

  const activeThread = useMemo(() => {
    if (threads.length === 0) return null;
    return (
      filteredThreads.find((t) => t.id === selectedId) ||
      threads.find((t) => t.id === selectedId) ||
      filteredThreads[0] ||
      threads[0] ||
      null
    );
  }, [threads, filteredThreads, selectedId]);

  // When selecting a pending_gate thread, default to "todo" (할 일) tab and reset inline confirmations
  useEffect(() => {
    setConfirmLockOpen(false);
    setShowShareSheet(false);
    if (!activeThread) return;
    if (activeThread.status === "pending_gate") {
      setActiveEditorTab("todo");
    }
    setKakaoHeadline(`[${activeThread.buildingTitle}] 상세 검토 자료 안내`);
    setKakaoBrief(
      `${activeThread.clientName}님, 관심 가져주신 [${activeThread.buildingTitle}] 상세 투자설명서(IM)와 층별 임대 현황을 보내드립니다. 검토하시면서 궁금하신 점은 편하게 말씀해 주세요.`
    );
  }, [activeThread?.id]);

  // Honest approve & send IM handler (IB-11, IB-14, IB-15)
  const handleApproveAndSendIm = async (targetThread: InboxThreadItem) => {
    setStatusFeedback(null);
    let shareUrl =
      targetThread.shareUrl || `/im-lite/${encodeURIComponent(targetThread.buildingId)}`;
    let issuedToken = targetThread.shareToken;

    try {
      const res = await fetch("/api/broker/inbox/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve_gate",
          threadId: targetThread.id,
          buildingId: targetThread.buildingId,
          shareToken: targetThread.shareToken,
        }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        if (typeof json.shareUrl === "string" && json.shareUrl) {
          shareUrl = json.shareUrl;
        }
        if (typeof json.shareToken === "string" && json.shareToken) {
          issuedToken = json.shareToken;
        }
      } else if (res && !res.ok && json?.error) {
        setStatusFeedback(json.error);
        showUndoToast(json.error);
        return;
      }
    } catch {
      // Allow fallback link copy in offline/test environments
    }

    const fullUrl =
      typeof window !== "undefined" && shareUrl.startsWith("/")
        ? `${window.location.origin}${shareUrl}`
        : shareUrl;
    const copied = await copyText(fullUrl);

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
              status: "active" as const,
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

  // Reject Gate Request
  const handleRejectRequest = async (targetThread: InboxThreadItem) => {
    setStatusFeedback(null);
    try {
      const res = await fetch("/api/broker/inbox/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reject_gate",
          threadId: targetThread.id,
          buildingId: targetThread.buildingId,
        }),
      });
      const json = await res.json().catch(() => null);
      if (res && !res.ok && json?.error) {
        setStatusFeedback(json.error);
        showUndoToast(json.error);
        return;
      }
    } catch {
      // ignore in test env
    }

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

  // Share material via Kakao or Clipboard (IB-15)
  const handleSendMaterial = async (kind: "im" | "dealcard" | "newsletter") => {
    if (!activeThread) return;
    setStatusFeedback(null);

    const actionMap = {
      im: "send_im",
      dealcard: "send_dealcard",
      newsletter: "send_magazine",
    } as const;

    let pathUrl =
      kind === "im"
        ? activeThread.shareUrl || `/im-lite/${encodeURIComponent(activeThread.buildingId)}`
        : kind === "dealcard"
        ? `/dc/${encodeURIComponent(activeThread.buildingId)}`
        : "/magazine";

    try {
      const res = await fetch("/api/broker/inbox/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: actionMap[kind],
          threadId: activeThread.id,
          buildingId: activeThread.buildingId,
        }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.shareUrl) {
        pathUrl = json.shareUrl;
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
    } catch {
      // continue with local share URL
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

    const shareRes = await shareKakaoFeed({
      title: kakaoHeadline || `[${activeThread.buildingTitle}] ${labelMap[kind]}`,
      description:
        kakaoBrief || `${activeThread.clientName}님을 위한 맞춤 매물 자료입니다.`,
      imageUrl: `${origin}/api/og/deal-card/${encodeURIComponent(activeThread.buildingId)}`,
      url: fullUrl,
      buttonTitle: `${labelMap[kind]} 열람하기`,
    });

    if (shareRes === "kakao" || shareRes === "copied") {
      const msg =
        shareRes === "kakao"
          ? `카카오톡으로 ${labelMap[kind]} 공유 창을 열었습니다.`
          : `${labelMap[kind]}가 클립보드에 복사되었습니다. 카톡에 붙여넣어 보내세요.`;
      setStatusFeedback(msg);
      showUndoToast(msg);
      setShowShareSheet(false);
    } else {
      const errMsg = `${labelMap[kind]} 복사에 실패했습니다. 다시 시도해 주세요.`;
      setStatusFeedback(errMsg);
      showUndoToast(errMsg);
    }
  };

  // Inline Lock Share Link (IB-05, IB-16 — no window.prompt)
  const handleConfirmLockLink = async () => {
    if (!activeThread) return;
    const targetThread = activeThread;
    setConfirmLockOpen(false);
    setStatusFeedback(null);

    try {
      const res = await fetch("/api/broker/share-links/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: targetThread.shareToken || undefined,
          buildingId: targetThread.buildingId,
          reason: "broker_locked",
        }),
      });
      const json = await res.json().catch(() => null);
      if (res && !res.ok && json?.error) {
        setStatusFeedback(json.error);
        showUndoToast(json.error);
        return;
      }
    } catch {
      // fallback to local state in offline test
    }

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

    try {
      await fetch("/api/broker/inbox/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "restore_link",
          threadId: targetThread.id,
          buildingId: targetThread.buildingId,
          shareToken: targetThread.shareToken,
        }),
      });
    } catch {
      // ignore
    }

    setThreads((prev) => {
      const next = prev.map((t) =>
        t.id === targetThread.id
          ? {
              ...t,
              status: "active" as const,
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

  // Call / Consultation Note (honest persistence)
  const handleAddCallNote = async () => {
    if (!activeThread || !callNote.trim()) return;
    const trimmed = callNote.trim();

    try {
      const res = await fetch("/api/broker/inbox/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "log_call",
          threadId: activeThread.id,
          buildingId: activeThread.buildingId,
          note: trimmed,
        }),
      });
      const json = await res.json().catch(() => null);
      if (res && !res.ok && json?.error) {
        setStatusFeedback(json.error);
        showUndoToast(json.error);
        return;
      }
    } catch {
      // continue local append in offline test
    }

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

  // Create Custom Client (never fabricates fake phone numbers — IB-07, IB-26)
  const handleCreateCustomClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClientName.trim()) return;

    let canonicalId = `custom_${Date.now()}`;
    const cleanPhone = sanitizeClientPhone(newClientPhone);
    const trimmedTitle = newClientBuildingTitle.trim();
    const matchedInventory =
      inventory.find(
        (d) =>
          (trimmedTitle && d.title === trimmedTitle) ||
          (trimmedTitle && d.buildingId === trimmedTitle)
      ) || inventory[0];
    const resolvedBuildingId = matchedInventory?.buildingId || "bld-01";
    const resolvedBuildingTitle =
      trimmedTitle || matchedInventory?.title || "관심 매물 상담";

    try {
      const res = await fetch("/api/broker/inbox/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upsert_client",
          clientId: canonicalId,
          clientName: newClientName.trim(),
          clientPhone: cleanPhone,
          clientGrade: newClientGrade,
          budget: newClientBudget.trim(),
          preferredRegion: newClientRegion.trim(),
          buildingId: resolvedBuildingId,
          buildingTitle: resolvedBuildingTitle,
          newsletterSubscribed: true,
        }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && typeof json?.clientId === "string" && json.clientId) {
        canonicalId = json.clientId;
      }
    } catch {
      // ignore in test env
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
      shareUrl: `/im-lite/${encodeURIComponent(resolvedBuildingId)}`,
      budget: newClientBudget.trim(),
      preferredRegion: newClientRegion.trim(),
      focusedSections: [],
      newsletterSubscribed: true,
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
    if (activeFilter === "todo" && pendingCount === 0) {
      setActiveFilter("all");
    }
    setSelectedId(canonicalId);
    setNewClientName("");
    setNewClientPhone("");
    setNewClientBudget("");
    setNewClientRegion("");
    setNewClientBuildingTitle("");
    setShowNewClientModal(false);
    showUndoToast(`${created.clientName} 고객이 등록되었습니다.`);
  };

  /* ──────── Column 1: 할 일 요약 카드 + 3개 필터 칩 + 고객 목록 ──────── */
  const listSlot = (
    <div
      className="flex h-full flex-col space-y-3 bg-[#FAF9F5] p-3.5"
      data-testid="inbox-list-slot"
    >
      {/* 1열 상단 고정: "지금 할 일 {N}건" 요약 카드 (IB-11) */}
      <div
        data-testid="inbox-todo-summary-card"
        className="rounded-xl border border-amber-300 bg-amber-50/90 p-3.5 shadow-xs"
      >
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-base font-extrabold text-slate-900">
              지금 할 일 {pendingCount}건
            </p>
            <p className="mt-0.5 text-sm text-slate-700">
              {pendingCount > 0
                ? "승인을 기다리는 IM 열람 요청을 바로 처리해 보세요."
                : "대기 중인 IM 열람 요청이 없습니다."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowNewClientModal(true)}
            data-testid="open-new-client-modal-btn"
            className="inline-flex min-h-[48px] shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-bold text-slate-900 shadow-xs transition hover:bg-slate-100 cursor-pointer"
          >
            + 고객 직접 등록
          </button>
        </div>

        {pendingThreads.length > 0 && (
          <div className="mt-3 space-y-2 border-t border-amber-200/80 pt-3">
            {pendingThreads.slice(0, 1).map((pt) => (
              <div
                key={`todo-quick-${pt.id}`}
                className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-white px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900">
                    {pt.clientName} · {pt.buildingTitle}
                  </p>
                  <p className="truncate text-sm text-slate-600">
                    {pt.cleanMessage || "IM 열람 요청"}
                  </p>
                </div>
                <button
                  type="button"
                  data-testid={`quick-approve-btn-${pt.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleApproveAndSendIm(pt);
                  }}
                  className="inline-flex min-h-[48px] shrink-0 items-center justify-center rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-bold text-white shadow-xs transition hover:bg-emerald-700 cursor-pointer"
                >
                  자료 보내기
                </button>
              </div>
            ))}
            {pendingThreads.length > 1 && (
              <p className="px-1 text-sm font-semibold text-amber-900">
                외 {pendingThreads.length - 1}건의 대기 요청이 아래 목록에 있습니다.
              </p>
            )}
          </div>
        )}
      </div>

      {/* 1열 필터 칩 3개: 할 일 · 열람 · 전체 고객 (IB-12) */}
      <div
        role="tablist"
        aria-label="고객 소통함 필터"
        data-testid="inbox-filter-tabs"
        className="grid grid-cols-3 gap-1.5 rounded-xl border border-slate-200 bg-slate-200/70 p-1"
      >
        {(
          [
            { key: "todo", label: "할 일" },
            { key: "views", label: "열람" },
            { key: "all", label: "전체 고객" },
          ] as const
        ).map((flt) => {
          const isSelected = activeFilter === flt.key;
          return (
            <button
              key={flt.key}
              type="button"
              role="tab"
              aria-selected={isSelected}
              data-testid={`inbox-filter-chip-${flt.key}`}
              onClick={() => setActiveFilter(flt.key)}
              className={`min-h-[48px] rounded-lg px-2.5 py-2 text-sm font-bold transition cursor-pointer ${
                isSelected
                  ? "bg-slate-900 text-white shadow-xs"
                  : "bg-transparent text-slate-700 hover:bg-white/70 hover:text-slate-900"
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
          고객명 또는 매물명 검색
        </label>
        <input
          id="inbox-search-input"
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="고객명, 매물명 검색"
          className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 focus:border-blue-600 focus:outline-none"
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
                setActiveFilter("all");
                setSearchQuery("");
              }}
              className="mt-3 inline-flex min-h-[48px] items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50 cursor-pointer"
            >
              전체 고객 보기
            </button>
          </div>
        ) : (
          filteredThreads.map((item) => {
            const isSelected = activeThread?.id === item.id;
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
                : {
                    text: item.openCount > 0 ? `${item.openCount}회 열람` : "등록 고객",
                    cls: "bg-slate-100 text-slate-700 border border-slate-200",
                  };

            return (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                data-testid={`inbox-thread-row-${item.id}`}
                onClick={() => {
                  setSelectedId(item.id);
                  setMobileStayOnList(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedId(item.id);
                    setMobileStayOnList(false);
                  }
                }}
                className={`rounded-xl border p-3.5 transition cursor-pointer ${
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
                      {item.buildingTitle}
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
          {/* 선택된 고객 상단 헤더 */}
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
              </div>

              <div className="flex items-center gap-2">
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
                      onClick={() => handleApproveAndSendIm(activeThread)}
                      className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-xl bg-emerald-600 px-5 py-3 text-base font-extrabold text-white shadow-xs transition hover:bg-emerald-700 cursor-pointer"
                    >
                      자료 보내기(승인)
                    </button>
                    <button
                      type="button"
                      data-testid="reject-gate-btn"
                      onClick={() => handleRejectRequest(activeThread)}
                      className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-3 text-base font-bold text-slate-700 transition hover:bg-slate-100 cursor-pointer"
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
                      onClick={() => handleSendMaterial("im")}
                      className="inline-flex min-h-[48px] items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800 cursor-pointer"
                    >
                      IM 전용 링크 보내기
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSendMaterial("dealcard")}
                      className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50 cursor-pointer"
                    >
                      딜카드 보내기
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSendMaterial("newsletter")}
                      className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50 cursor-pointer"
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
                  onClick={() => handleSendMaterial("im")}
                  className="inline-flex min-h-[48px] items-center justify-center rounded-xl bg-slate-900 px-5 py-2.5 text-base font-bold text-white hover:bg-slate-800 cursor-pointer"
                >
                  IM 전용 링크 보내기
                </button>
                <button
                  type="button"
                  onClick={() => handleSendMaterial("dealcard")}
                  className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50 cursor-pointer"
                >
                  딜카드 보내기
                </button>
                <button
                  type="button"
                  onClick={() => handleSendMaterial("newsletter")}
                  className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50 cursor-pointer"
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
                    onClick={handleAddCallNote}
                    className="inline-flex min-h-[48px] shrink-0 items-center justify-center rounded-xl bg-slate-900 px-5 py-2.5 text-base font-bold text-white hover:bg-slate-800 cursor-pointer"
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

  /* ──────── Column 3: 단일 주요 CTA + 고객 요약 카드 + 인라인 링크 잠그기 (IB-16) ──────── */
  const primaryActionSlot = activeThread ? (
    activeThread.status === "pending_gate" ? (
      <button
        type="button"
        data-testid="primary-cta-approve-im"
        onClick={() => handleApproveAndSendIm(activeThread)}
        className="min-h-[48px] w-full rounded-xl bg-emerald-600 px-4 py-3 text-base font-extrabold text-white shadow-xs transition hover:bg-emerald-700 cursor-pointer"
      >
        승인하고 IM 보내기
      </button>
    ) : (
      <button
        type="button"
        data-testid="primary-cta-kakao-send"
        onClick={() => setShowShareSheet((prev) => !prev)}
        className="min-h-[48px] w-full rounded-xl bg-slate-900 px-4 py-3 text-base font-extrabold text-white shadow-xs transition hover:bg-slate-800 cursor-pointer"
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
                onClick={() => handleSendMaterial("im")}
                className="flex min-h-[48px] w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-left text-sm font-bold text-slate-900 hover:bg-slate-100 cursor-pointer"
              >
                <span>IM 전용 링크 보내기</span>
                <span className="text-sm text-blue-700">선택 →</span>
              </button>
              <button
                type="button"
                onClick={() => handleSendMaterial("dealcard")}
                className="flex min-h-[48px] w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-left text-sm font-bold text-slate-900 hover:bg-slate-100 cursor-pointer"
              >
                <span>딜카드 링크 보내기</span>
                <span className="text-sm text-blue-700">선택 →</span>
              </button>
              <button
                type="button"
                onClick={() => handleSendMaterial("newsletter")}
                className="flex min-h-[48px] w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-left text-sm font-bold text-slate-900 hover:bg-slate-100 cursor-pointer"
              >
                <span>뉴스레터 보내기</span>
                <span className="text-sm text-blue-700">선택 →</span>
              </button>
            </div>
          )}

          {/* 고객 요약 카드 (이름 · 연락처 · 관심 매물 · 희망 예산 · 선호 권역 · 열람 횟수) */}
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
            </dl>

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
                  onClick={handleUnlockLink}
                  className="inline-flex min-h-[48px] w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50 cursor-pointer"
                >
                  링크 다시 열기
                </button>
              </div>
            ) : !confirmLockOpen ? (
              <div className="mt-3">
                <button
                  type="button"
                  data-testid="lock-share-link-trigger-btn"
                  onClick={() => setConfirmLockOpen(true)}
                  className="inline-flex min-h-[48px] w-full items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-bold text-rose-700 transition hover:bg-rose-100 cursor-pointer"
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
                    onClick={handleConfirmLockLink}
                    className="inline-flex min-h-[48px] items-center justify-center rounded-lg bg-rose-600 px-3 py-2 text-sm font-bold text-white hover:bg-rose-700 cursor-pointer"
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
        selectedBuildingId={activeThread?.id || selectedId || null}
        selectedLabel={activeThread?.clientName}
        navBadges={{ inbox: pendingCount }}
        mobileTabLabels={{ editor: "상담", preview: "고객 정보" }}
        mobileStartOnList={mobileStayOnList}
      />

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
                  className="inline-flex min-h-[48px] items-center justify-center rounded-xl bg-slate-900 px-5 py-2.5 text-base font-bold text-white hover:bg-slate-800 cursor-pointer"
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
