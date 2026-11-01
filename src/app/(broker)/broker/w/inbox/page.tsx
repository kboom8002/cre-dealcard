"use client";

import React, { useState, useEffect, useMemo, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import { KakaoTemplatePicker } from "@/components/help/KakaoTemplatePicker";
import { UndoToastProvider, useUndoToast } from "@/components/workspace/UndoConfirmToast";

export type InboxFilterType = "action" | "today" | "views" | "notifications" | "clients";

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
  clientGrade: "VIP" | "일반" | "잠재";
  buildingTitle: string;
  buildingId: string;
  latestEvent: string;
  detail?: string;
  gateStatus?: "pending" | "approved" | "none";
  memo?: string;
  updatedAt: string;
  openCount: number; // View count
  isRead: boolean;
  status: "pending_gate" | "hot_lead" | "active" | "revoked";
  shareToken: string;
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
  posture?: string;
}

const DEFAULT_INVENTORY: BrokerInventoryDeal[] = [
  {
    buildingId: "p1-dangsan",
    title: "당산역 초역세권 코너 근생빌딩",
    region: "영등포구 당산동 · 양평동",
    priceBand: "100~120억",
    askingPriceManwon: 1150000,
    capRatePct: 3.46,
    posture: "income",
  },
  {
    buildingId: "p2-seocho",
    title: "서초역 도보 3분 법인 사옥용 빌딩",
    region: "서초구 서초동 · 강남권",
    priceBand: "220~240억",
    askingPriceManwon: 2300000,
    capRatePct: 2.38,
    posture: "owner_occupied",
  },
  {
    buildingId: "p3-sinsa",
    title: "도산대로 코너 플래그십 신축용 빌딩",
    region: "강남구 신사동 · 도산대로",
    priceBand: "750~780억",
    askingPriceManwon: 7600000,
    capRatePct: 2.66,
    posture: "trading",
  },
  {
    buildingId: "bld-01",
    title: "영등포구 양평동 근생빌딩",
    region: "영등포구 양평동",
    priceBand: "90~100억",
    askingPriceManwon: 955000,
    capRatePct: 4.2,
    posture: "core_income",
  },
  {
    buildingId: "bld-02",
    title: "강남구 신사동 상가주택",
    region: "강남구 신사동",
    priceBand: "140~150억",
    askingPriceManwon: 1450000,
    capRatePct: 3.8,
    posture: "value_add",
  },
  {
    buildingId: "bld-03",
    title: "마포구 서교동 올근생",
    region: "마포구 서교동",
    priceBand: "60~70억",
    askingPriceManwon: 650000,
    capRatePct: 4.5,
    posture: "core_income",
  },
];

const INITIAL_THREADS: InboxThreadItem[] = [
  {
    id: "thread-01",
    clientName: "박동원 회장",
    clientPhone: "010-8765-4321",
    clientGrade: "VIP",
    buildingTitle: "영등포구 양평동 꼬마빌딩",
    buildingId: "bld-01",
    latestEvent: "모바일 IM 06 렌트롤 섹션을 2분간 집중 열람했습니다.",
    updatedAt: "10분 전",
    openCount: 4, // >= 3 opens -> HOT LEAD!
    isRead: false,
    status: "hot_lead",
    shareToken: "tok-vip-yangpyeong-01",
    budget: "80~120억",
    preferredRegion: "영등포구, 마포구",
    focusedSections: ["06 렌트롤 (2분 15초)", "07 수익률·수지 분석 (1분 10초)"],
    newsletterSubscribed: true,
    events: [
      {
        id: "ev-1",
        eventType: "open",
        description: "모바일 IM 4회차 열람 (06 렌트롤 체류 2분)",
        timestamp: "10분 전",
        sectionName: "06 렌트롤",
      },
      {
        id: "ev-2",
        eventType: "open",
        description: "모바일 IM 3회차 열람 (07 수지 분석 확인)",
        timestamp: "1시간 전",
        sectionName: "07 수지 분석",
      },
      {
        id: "ev-3",
        eventType: "open",
        description: "모바일 IM 2회차 열람 (01 표지, 02 하이라이트)",
        timestamp: "어제 16:30",
        sectionName: "02 하이라이트",
      },
      {
        id: "ev-4",
        eventType: "share",
        description: "카카오톡 딜카드 발송",
        timestamp: "어제 14:00",
      },
    ],
  },
  {
    id: "thread-02",
    clientName: "최영진 원장",
    clientPhone: "010-5555-1212",
    clientGrade: "VIP",
    buildingTitle: "강남구 신사동 사옥형 빌딩",
    buildingId: "bld-02",
    latestEvent: "G2 상세자료 (토지이용계획 및 임대차원장) 열람을 요청했습니다.",
    updatedAt: "30분 전",
    openCount: 2,
    isRead: false,
    status: "pending_gate",
    gateStatus: "pending",
    shareToken: "tok-sinsa-02",
    budget: "130~150억",
    preferredRegion: "강남구 신사동, 서초동",
    focusedSections: ["05 토지·공시지가 (1분 45초)", "06 렌트롤 (상세 요청)"],
    newsletterSubscribed: true,
    events: [
      {
        id: "ev-201",
        eventType: "gate_request",
        description: "G2 상세자료 공개 요청 승인 대기 중",
        timestamp: "30분 전",
        sectionName: "06 렌트롤",
      },
      {
        id: "ev-202",
        eventType: "open",
        description: "모바일 IM 2회차 열람",
        timestamp: "어제",
        sectionName: "05 토지 정보",
      },
    ],
  },
  {
    id: "thread-03",
    clientName: "김민수 대표",
    clientPhone: "010-2345-6789",
    clientGrade: "일반",
    buildingTitle: "마포구 서교동 올근생",
    buildingId: "bld-03",
    latestEvent: "딜카드 링크를 열람했습니다.",
    updatedAt: "2시간 전",
    openCount: 1,
    isRead: true,
    status: "active",
    shareToken: "tok-seogyo-03",
    budget: "60~70억",
    preferredRegion: "마포구 서교동, 영등포구",
    focusedSections: ["02 투자 하이라이트 (50초)"],
    newsletterSubscribed: false,
    events: [
      {
        id: "ev-301",
        eventType: "open",
        description: "딜카드 첫 열람",
        timestamp: "2시간 전",
        sectionName: "02 하이라이트",
      },
    ],
  },
];

const STORAGE_KEY = "credeal-w-inbox-v3";

function parseBudgetRangeEok(budgetStr: string): [number, number] | null {
  const nums = (budgetStr.match(/\d+/g) || []).map(Number).filter((n) => n > 0);
  if (nums.length >= 2) return [Math.min(...nums), Math.max(...nums)];
  if (nums.length === 1) return [nums[0] * 0.75, nums[0] * 1.35];
  return null;
}

function InboxWorkspaceInner() {
  const searchParams = useSearchParams();
  const { showUndoToast } = useUndoToast();

  const [threads, setThreads] = useState<InboxThreadItem[]>(INITIAL_THREADS);
  const [inventory, setInventory] = useState<BrokerInventoryDeal[]>(DEFAULT_INVENTORY);
  const [activeFilter, setActiveFilter] = useState<InboxFilterType>("action");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string>(INITIAL_THREADS[0]?.id || "");
  const [callNote, setCallNote] = useState("");
  const [correctionInput, setCorrectionInput] = useState(
    "임대차 조건 및 매매 희망가 세부 수치가 최신 기준으로 업데이트되었습니다."
  );
  const [showNewClientForm, setShowNewClientForm] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [newClientGrade, setNewClientGrade] = useState<"VIP" | "일반" | "잠재">("VIP");
  const [newClientBudget, setNewClientBudget] = useState("100~130억");
  const [newClientRegion, setNewClientRegion] = useState("영등포구, 강남구");
  const [newClientBuildingTitle, setNewClientBuildingTitle] = useState("당산역 초역세권 코너 근생빌딩");

  const persistThreads = (next: InboxThreadItem[]) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const postInboxAction = (payload: Record<string, any>) => {
    try {
      fetch("/api/broker/inbox/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => {});
    } catch {
      // ignore in offline / test environment
    }
  };

  // Load saved threads from localStorage and hydrate with /api/broker/inbox?workspace=1 on mount
  useEffect(() => {
    try {
      const savedRaw = window.localStorage.getItem(STORAGE_KEY);
      if (savedRaw) {
        const parsed = JSON.parse(savedRaw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setThreads(parsed);
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
          setInventory((prev) => {
            const byId = new Map<string, BrokerInventoryDeal>();
            for (const item of [...data.inventory, ...prev]) {
              if (item?.buildingId && !byId.has(item.buildingId)) {
                byId.set(item.buildingId, item);
              }
            }
            return Array.from(byId.values());
          });
        }

        const srvState = data.inboxState || {};
        const revokedBuildings = srvState.revokedBuildings || {};
        const correctionNotices = srvState.correctionNotices || {};
        const gateDecisions = srvState.gateDecisions || {};
        const callNotes = srvState.callNotes || {};
        const customClients = Array.isArray(srvState.customClients) ? srvState.customClients : [];

        setThreads((prev) => {
          // 1. Apply server governance state (revocation, correction, gate approval, call notes) to existing threads
          const updatedPrev = prev.map((t) => {
            const rev = revokedBuildings[t.buildingId];
            const corr = correctionNotices[t.buildingId];
            const gateDec = gateDecisions[t.id] || gateDecisions[t.buildingId];
            const notes = callNotes[t.id] || [];

            let nextStatus = t.status;
            let nextGateStatus = t.gateStatus;
            if (rev?.revoked) {
              nextStatus = "revoked";
            } else if (gateDec?.status === "approved" && t.status === "pending_gate") {
              nextStatus = "active";
              nextGateStatus = "approved";
            }

            const existingEventIds = new Set(t.events.map((e) => e.id));
            const mergedEvents = [
              ...notes
                .filter((n: any) => n?.id && !existingEventIds.has(n.id))
                .map((n: any) => ({
                  id: n.id,
                  eventType: "dwell" as const,
                  description: n.description,
                  timestamp: n.timestamp || "방금",
                })),
              ...t.events,
            ];

            return {
              ...t,
              status: nextStatus,
              gateStatus: nextGateStatus,
              hasCorrectionNotice: Boolean(corr?.message),
              correctionMessage: corr?.message || t.correctionMessage,
              events: mergedEvents,
            };
          });

          const existingIds = new Set(updatedPrev.map((t) => t.id));
          const appended: InboxThreadItem[] = [];

          // 2. Append custom registered clients from server inbox state
          for (const cli of customClients) {
            if (!cli?.id || existingIds.has(cli.id)) continue;
            existingIds.add(cli.id);
            appended.push({
              id: cli.id,
              clientName: cli.clientName,
              clientPhone: cli.clientPhone || "010-7777-8888",
              clientGrade: cli.clientGrade || "VIP",
              buildingTitle: cli.buildingTitle || "관심 매물 상담",
              buildingId: cli.buildingId || "p1-dangsan",
              latestEvent: "신규 매수 고객 등록 및 소식지 구독 연동 완료",
              updatedAt: "방금",
              openCount: 1,
              isRead: false,
              status: "active",
              shareToken: `tok-${String(cli.id).slice(-6)}`,
              budget: cli.budget || "100~130억",
              preferredRegion: cli.preferredRegion || "서울 주요 역세권",
              focusedSections: ["02 투자 하이라이트"],
              newsletterSubscribed: cli.newsletterSubscribed !== false,
              events: [
                {
                  id: `ev-${cli.id}`,
                  eventType: "share",
                  description: "고객 명단 등록 및 맞춤 매물 알림 설정",
                  timestamp: "방금",
                },
              ],
            });
          }

          // 3. Append server items (gate_requests, im_inquiry_requests, views) with real client enrichment
          const dbClients = Array.isArray(data.clients) ? data.clients : [];
          if (Array.isArray(data.items)) {
            for (const srv of data.items) {
              if (!srv?.id || existingIds.has(String(srv.id))) continue;
              existingIds.add(String(srv.id));
              const isGate = srv.type === "gate_request";
              const clientName = srv.requester_name || srv.viewer_info || "관심 매수 고객";
              const matchedClient = dbClients.find(
                (c: any) =>
                  (c?.display_name && c.display_name === clientName) ||
                  (c?.phone && srv.requester_phone && c.phone === srv.requester_phone)
              );
              const resolvedPhone =
                srv.requester_phone ||
                matchedClient?.phone ||
                "010-3456-7890";
              const resolvedGrade: "VIP" | "일반" | "잠재" =
                matchedClient?.tier === "vip" || isGate
                  ? "VIP"
                  : matchedClient?.tier === "potential"
                  ? "잠재"
                  : "일반";
              const tags: string[] = Array.isArray(matchedClient?.tags) ? matchedClient.tags : [];
              const resolvedBudget = tags.find((t) => t.includes("억")) || "100~150억";
              const resolvedRegion =
                tags.find((t) => !t.includes("억") && !t.includes("소식지")) || "서울 역세권 주요 상권";

              const buildingTitle = srv.building_label || srv.sub_label || srv.label || "관심 매물";
              const latestEvent = isGate
                ? `${srv.requested_level || "G2"} 상세자료 열람 요청 (${srv.reason || "상세 렌트롤 검토"})`
                : `${srv.label || "모바일 IM 열람"} · ${srv.sub_label || ""}`.trim();

              appended.push({
                id: String(srv.id),
                clientName,
                clientPhone: resolvedPhone,
                clientGrade: resolvedGrade,
                buildingTitle,
                buildingId: srv.building_id || "p1-dangsan",
                latestEvent,
                detail: latestEvent,
                gateStatus: isGate && srv.status === "submitted" ? "pending" : "none",
                updatedAt: "방금",
                openCount: isGate ? 2 : 1,
                isRead: !srv.is_unread,
                status: isGate && srv.status === "submitted" ? "pending_gate" : "active",
                shareToken: `tok-${String(srv.id).slice(0, 8)}`,
                budget: resolvedBudget,
                preferredRegion: resolvedRegion,
                focusedSections: isGate
                  ? ["06 렌트롤 (상세 요청)", "05 토지·용도지역"]
                  : ["02 투자 하이라이트", "07 수익률·민감도"],
                newsletterSubscribed: true,
                events: [
                  {
                    id: `ev-${srv.id}`,
                    eventType: isGate ? "gate_request" : "open",
                    description: latestEvent,
                    timestamp: "방금",
                  },
                ],
              });
            }
          }

          const next = [...appended, ...updatedPrev];
          persistThreads(next);
          return next;
        });
      })
      .catch(() => {
        // Offline / JSDOM fallback preserves INITIAL_THREADS
      });
  }, []);

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

  const activeThread = useMemo(() => {
    return threads.find((t) => t.id === selectedId) || threads[0];
  }, [threads, selectedId]);

  // Mark thread as read when selected
  useEffect(() => {
    if (activeThread && !activeThread.isRead) {
      setThreads((prev) => {
        const next = prev.map((t) =>
          t.id === activeThread.id ? { ...t, isRead: true } : t
        );
        persistThreads(next);
        return next;
      });
    }
  }, [activeThread?.id]);

  const filteredThreads = useMemo(() => {
    return threads.filter((t) => {
      const matchQuery =
        !searchQuery ||
        t.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.buildingTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.preferredRegion.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchQuery) return false;

      if (activeFilter === "action") {
        return t.status === "pending_gate" || t.openCount >= 3;
      }
      if (activeFilter === "today") {
        return (
          t.updatedAt.includes("방금") ||
          t.updatedAt.includes("분 전") ||
          t.updatedAt.includes("시간 전")
        );
      }
      if (activeFilter === "views") {
        return t.openCount > 0;
      }
      if (activeFilter === "clients") {
        return t.clientGrade === "VIP";
      }
      return true;
    });
  }, [threads, activeFilter, searchQuery]);

  // [M6] Auto-Matched Alternative Deals from Broker Inventory
  const matchedAlternativeDeals = useMemo(() => {
    if (!activeThread) return [];
    const budgetRange = parseBudgetRangeEok(activeThread.budget);
    const regionKeywords = activeThread.preferredRegion
      .split(/[,·/\s]+/)
      .map((s) => s.replace(/구$|동$|권역$/, "").trim())
      .filter((s) => s.length >= 2);

    const candidates = inventory.filter(
      (deal) =>
        deal.buildingId !== activeThread.buildingId &&
        deal.title !== activeThread.buildingTitle
    );

    const scored = candidates.map((deal) => {
      let score = 0;
      const reasons: string[] = [];
      const dealEok = deal.askingPriceManwon / 10000;

      if (budgetRange) {
        const [minEok, maxEok] = budgetRange;
        if (dealEok >= minEok * 0.7 && dealEok <= maxEok * 1.35) {
          score += 3;
          reasons.push("예산 부합");
        }
      }
      if (
        regionKeywords.some(
          (kw) => deal.region.includes(kw) || deal.title.includes(kw)
        )
      ) {
        score += 3;
        reasons.push("선호 권역");
      }
      if (deal.capRatePct >= 3.4) {
        score += 1;
        reasons.push(`수익률 ${deal.capRatePct.toFixed(1)}%`);
      }
      if (reasons.length === 0) {
        reasons.push("비교 추천 매물");
      }
      return { deal, score, reasonLabel: reasons.slice(0, 2).join(" · ") };
    });

    return scored.sort((a, b) => b.score - a.score).slice(0, 2);
  }, [activeThread, inventory]);

  // [M2] Gate Request actions (Server-persisted + Unlocked Link Copy)
  const handleApproveGate = () => {
    const rawId = activeThread.id.replace(/^srv-/, "");
    fetch(`/api/gate-requests/${rawId}/review`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "approved" }),
    }).catch(() => {});

    postInboxAction({
      action: "approve_gate",
      threadId: activeThread.id,
      buildingId: activeThread.buildingId,
      shareToken: activeThread.shareToken,
    });

    const approvalEvent: RecipientEvent = {
      id: `ev-gate-ok-${Date.now()}`,
      eventType: "gate_request",
      description: `G2 상세자료 공개 승인 완료 (보안 토큰: ${activeThread.shareToken})`,
      timestamp: "방금",
    };

    setThreads((prev) => {
      const next = prev.map((t) =>
        t.id === activeThread.id
          ? {
              ...t,
              status: "active" as const,
              gateStatus: "approved" as const,
              detail: "자료 열람 요청이 승인되었습니다.",
              latestEvent: "자료 열람 요청이 승인되었습니다.",
              events: [approvalEvent, ...t.events],
            }
          : t
      );
      persistThreads(next);
      return next;
    });
    showUndoToast(`${activeThread.clientName}님의 자료 공개 요청을 승인했습니다.`);
  };

  const handleRejectGate = () => {
    const rawId = activeThread.id.replace(/^srv-/, "");
    fetch(`/api/gate-requests/${rawId}/review`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "rejected" }),
    }).catch(() => {});

    postInboxAction({
      action: "reject_gate",
      threadId: activeThread.id,
      buildingId: activeThread.buildingId,
      shareToken: activeThread.shareToken,
    });

    setThreads((prev) => {
      const next = prev.map((t) =>
        t.id === activeThread.id
          ? {
              ...t,
              status: "active" as const,
              gateStatus: "none" as const,
              detail: "자료 열람 요청이 반려되었습니다.",
              latestEvent: "자료 열람 요청이 반려되었습니다.",
            }
          : t
      );
      persistThreads(next);
      return next;
    });
    showUndoToast(`${activeThread.clientName}님의 자료 공개 요청을 보류했습니다.`);
  };

  // [M2] Link Revocation & Restoration (Server-persisted + Real 404 on Public Viewer)
  const handleRevokeLink = () => {
    const targetThreadId = activeThread.id;
    const targetBuildingId = activeThread.buildingId;
    const targetToken = activeThread.shareToken;
    const previousStatus = activeThread.status;

    postInboxAction({
      action: "revoke_link",
      threadId: targetThreadId,
      buildingId: targetBuildingId,
      shareToken: targetToken,
    });

    setThreads((prev) => {
      const next = prev.map((t) =>
        t.id === targetThreadId
          ? {
              ...t,
              status: "revoked" as const,
              latestEvent: `공유 링크(${targetToken})가 보안 회수(404) 처리되었습니다.`,
            }
          : t
      );
      persistThreads(next);
      return next;
    });

    showUndoToast({
      message: `발송된 링크(${targetToken})가 즉시 회수되었습니다. (404 처리)`,
      undoAction: () => {
        postInboxAction({
          action: "restore_link",
          threadId: targetThreadId,
          buildingId: targetBuildingId,
          shareToken: targetToken,
        });
        setThreads((prev) => {
          const next = prev.map((t) =>
            t.id === targetThreadId
              ? {
                  ...t,
                  status: previousStatus === "revoked" ? ("active" as const) : previousStatus,
                  latestEvent: "회수된 공유 링크가 정상 복구되었습니다.",
                }
              : t
          );
          persistThreads(next);
          return next;
        });
      },
    });
  };

  const handleRestoreLink = () => {
    postInboxAction({
      action: "restore_link",
      threadId: activeThread.id,
      buildingId: activeThread.buildingId,
      shareToken: activeThread.shareToken,
    });
    setThreads((prev) => {
      const next = prev.map((t) =>
        t.id === activeThread.id
          ? {
              ...t,
              status: "active" as const,
              latestEvent: "회수된 공유 링크가 정상 복구되었습니다.",
            }
          : t
      );
      persistThreads(next);
      return next;
    });
    showUndoToast(`발송된 링크(${activeThread.shareToken})가 다시 활성화되었습니다.`);
  };

  // [M2] Correction Notice Banner (Server-persisted + Live Amber Banner on Mobile IM)
  const handleSendCorrection = () => {
    const targetThreadId = activeThread.id;
    const targetBuildingId = activeThread.buildingId;
    const msg =
      correctionInput.trim() ||
      "매물 임대 조건 및 주요 수치가 최신 기준으로 정정되었습니다. 최신 내용을 확인해 주세요.";

    postInboxAction({
      action: "correction_notice",
      threadId: targetThreadId,
      buildingId: targetBuildingId,
      message: msg,
    });

    setThreads((prev) => {
      const next = prev.map((t) =>
        t.id === targetThreadId
          ? {
              ...t,
              hasCorrectionNotice: true,
              correctionMessage: msg,
              latestEvent: `정정 안내 띠 적용: ${msg}`,
            }
          : t
      );
      persistThreads(next);
      return next;
    });

    showUndoToast({
      message: "고객 화면 상단에 '⚠️ 매물 정보가 정정되었습니다' 띠가 적용되었습니다.",
      undoAction: () => {
        postInboxAction({
          action: "clear_correction_notice",
          threadId: targetThreadId,
          buildingId: targetBuildingId,
        });
        setThreads((prev) => {
          const next = prev.map((t) =>
            t.id === targetThreadId ? { ...t, hasCorrectionNotice: false } : t
          );
          persistThreads(next);
          return next;
        });
      },
    });
  };

  // [M2] Call / Consultation Note (Server-persisted)
  const handleAddCallNote = () => {
    if (!callNote.trim()) return;
    const trimmed = callNote.trim();
    const newEvent: RecipientEvent = {
      id: `ev-${Date.now()}`,
      eventType: "dwell",
      description: `통화 기록: ${trimmed}`,
      timestamp: "방금",
    };

    postInboxAction({
      action: "add_call_note",
      threadId: activeThread.id,
      buildingId: activeThread.buildingId,
      note: trimmed,
    });

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
    showUndoToast("통화 메모가 저장되었습니다.");
  };

  // [M5] Toggle Weekly Newsletter Subscription for Client
  const handleToggleNewsletterSubscription = () => {
    const nextState = !activeThread.newsletterSubscribed;
    setThreads((prev) => {
      const next = prev.map((t) =>
        t.id === activeThread.id ? { ...t, newsletterSubscribed: nextState } : t
      );
      persistThreads(next);
      return next;
    });
    showUndoToast(
      nextState
        ? `${activeThread.clientName}님이 주간 뉴스레터 정기 발송 명단에 추가되었습니다.`
        : `${activeThread.clientName}님의 주간 뉴스레터 정기 발송이 해제되었습니다.`
    );
  };

  // [M6] Copy Alternative Deal Recommendation Message
  const handleCopyAlternativeDeal = (deal: BrokerInventoryDeal) => {
    const shareUrl = `${typeof window !== "undefined" ? window.location.origin : "https://credeal.net"}/im-lite/${deal.buildingId}`;
    const text = `${activeThread.clientName}님 안녕하세요. 검토 중이신 [${activeThread.buildingTitle}] 매물과 함께 비교 검토해 보실 만한 [${deal.title} (${deal.priceBand}, 기대수익률 ${deal.capRatePct.toFixed(1)}%)] 투자설명서도 함께 공유드립니다.\n\n▶ 모바일 IM 바로보기: ${shareUrl}`;
    try {
      navigator.clipboard?.writeText(text);
    } catch {
      // ignore in JSDOM
    }
    showUndoToast(`[${deal.title}] 맞춤 추천 문구와 IM 링크가 복사되었습니다.`);
  };

  // [M2] Copy Unlocked G2 Link Message
  const handleCopyG2ApprovedLink = () => {
    const shareUrl = `${typeof window !== "undefined" ? window.location.origin : "https://credeal.net"}/im-lite/${activeThread.buildingId}?token=${encodeURIComponent(activeThread.shareToken)}`;
    const text = `${activeThread.clientName}님, 요청하신 [${activeThread.buildingTitle}] G2 상세자료(층별 렌트롤 및 토지이용계획) 열람 승인이 완료되었습니다. 아래 전용 보안 링크에서 바로 확인하실 수 있습니다.\n\n▶ G2 승인 보안 링크: ${shareUrl}`;
    try {
      navigator.clipboard?.writeText(text);
    } catch {
      // ignore in JSDOM
    }
    showUndoToast("G2 승인 안내 문구와 전용 보안 링크가 복사되었습니다.");
  };

  // [M3] Quick Client Registration in Inbox
  const handleCreateQuickClient = () => {
    if (!newClientName.trim()) return;
    const id = `cli-${Date.now()}`;
    const created: InboxThreadItem = {
      id,
      clientName: newClientName.trim(),
      clientPhone: newClientPhone.trim() || "010-7777-8888",
      clientGrade: newClientGrade,
      buildingTitle: newClientBuildingTitle.trim() || "당산역 초역세권 코너 근생빌딩",
      buildingId: "p1-dangsan",
      latestEvent: "고객 명단 신규 등록 및 주간 소식지 구독 연동 완료",
      updatedAt: "방금",
      openCount: 1,
      isRead: false,
      status: "active",
      shareToken: `tok-${id.slice(-6)}`,
      budget: newClientBudget.trim() || "100~130억",
      preferredRegion: newClientRegion.trim() || "서울 주요 역세권",
      focusedSections: ["02 투자 하이라이트"],
      newsletterSubscribed: true,
      events: [
        {
          id: `ev-${id}`,
          eventType: "share",
          description: "신규 매수 고객 등록 및 맞춤 매물 매칭 시작",
          timestamp: "방금",
        },
      ],
    };

    postInboxAction({
      action: "upsert_client",
      clientId: id,
      clientName: created.clientName,
      clientPhone: created.clientPhone,
      clientGrade: created.clientGrade,
      budget: created.budget,
      preferredRegion: created.preferredRegion,
      buildingId: created.buildingId,
      buildingTitle: created.buildingTitle,
      newsletterSubscribed: true,
    });

    setThreads((prev) => {
      const next = [created, ...prev];
      persistThreads(next);
      return next;
    });
    setSelectedId(id);
    setNewClientName("");
    setNewClientPhone("");
    setShowNewClientForm(false);
    showUndoToast(`${created.clientName} (${created.clientGrade}) 고객이 명단에 등록되었습니다.`);
  };

  /* ──────── Column 1: Inbox Filter & List ──────── */
  const listSlot = (
    <div className="flex flex-col h-full bg-[#FAF9F5] p-3 space-y-2.5" data-testid="inbox-list-slot">
      {/* Search Input */}
      <div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="🔍 고객명, 매물명 검색"
          className="w-full min-h-[44px] px-3.5 bg-white text-[15px] rounded-xl border border-[#64748B] focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/20 outline-none"
        />
      </div>

      {/* Filter Pills (Wrapped cleanly for 280px Column 1 width) */}
      <div className="flex flex-wrap items-center gap-1.5">
        {(
          [
            { key: "action", label: "지금 처리" },
            { key: "today", label: "오늘" },
            { key: "views", label: "열람" },
            { key: "notifications", label: "알림" },
            { key: "clients", label: "고객 명단" },
          ] as const
        ).map((flt) => (
          <button
            key={flt.key}
            type="button"
            onClick={() => setActiveFilter(flt.key)}
            className={`min-h-[36px] px-2.5 py-1 rounded-lg text-[13px] font-bold border transition-colors cursor-pointer whitespace-nowrap ${
              activeFilter === flt.key
                ? "bg-[#0F172A] text-white border-[#0F172A]"
                : "bg-white text-[#475569] border-[#CBD5E1] hover:bg-[#F3F2EE]"
            }`}
          >
            {flt.label}
          </button>
        ))}
      </div>

      {/* Quick Client Add Trigger Button */}
      <button
        type="button"
        onClick={() => setShowNewClientForm((v) => !v)}
        className="w-full min-h-[40px] px-3 bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE] font-extrabold text-[13px] rounded-xl hover:bg-[#DBEAFE] cursor-pointer flex items-center justify-center gap-1"
        data-testid="toggle-new-client-btn"
      >
        <span>👥</span>
        <span>{showNewClientForm ? "신규 고객 등록 닫기" : "+ 신규 매수 고객 빠른 등록"}</span>
      </button>

      {/* Inline Quick Client Registration Form (M3) */}
      {showNewClientForm && (
        <div
          className="bg-white rounded-2xl border-2 border-[#1D4ED8] p-3.5 space-y-2.5 shadow-sm"
          data-testid="quick-client-register"
        >
          <div className="flex items-center justify-between">
            <span className="text-[14px] font-extrabold text-[#0F172A]">
              👥 신규 매수 고객 빠른 등록
            </span>
            <button
              type="button"
              onClick={() => setShowNewClientForm(false)}
              className="text-[12px] text-[#64748B] font-bold cursor-pointer"
            >
              닫기
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={newClientName}
              onChange={(e) => setNewClientName(e.target.value)}
              placeholder="고객 성함 (예: 정태영 부회장)"
              className="min-h-[40px] px-2.5 text-[13px] rounded-lg border border-[#CBD5E1]"
              data-testid="new-client-name-input"
            />
            <input
              type="text"
              value={newClientPhone}
              onChange={(e) => setNewClientPhone(e.target.value)}
              placeholder="연락처 (010-...)"
              className="min-h-[40px] px-2.5 text-[13px] rounded-lg border border-[#CBD5E1]"
              data-testid="new-client-phone-input"
            />
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {(["VIP", "일반", "잠재"] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setNewClientGrade(g)}
                className={`min-h-[36px] rounded-lg text-[12px] font-bold border cursor-pointer ${
                  newClientGrade === g
                    ? "bg-[#1D4ED8] text-white border-[#1D4ED8]"
                    : "bg-[#FAF9F5] text-[#475569] border-[#CBD5E1]"
                }`}
              >
                {g} 등급
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={newClientBudget}
              onChange={(e) => setNewClientBudget(e.target.value)}
              placeholder="예산 (예: 100~130억)"
              className="min-h-[38px] px-2.5 text-[13px] rounded-lg border border-[#CBD5E1]"
            />
            <input
              type="text"
              value={newClientRegion}
              onChange={(e) => setNewClientRegion(e.target.value)}
              placeholder="선호 권역 (예: 강남구)"
              className="min-h-[38px] px-2.5 text-[13px] rounded-lg border border-[#CBD5E1]"
            />
          </div>
          <input
            type="text"
            value={newClientBuildingTitle}
            onChange={(e) => setNewClientBuildingTitle(e.target.value)}
            placeholder="관심 매물명"
            className="w-full min-h-[38px] px-2.5 text-[13px] rounded-lg border border-[#CBD5E1]"
          />
          <button
            type="button"
            onClick={handleCreateQuickClient}
            className="w-full min-h-[42px] bg-[#0F172A] text-white font-bold text-[14px] rounded-xl hover:bg-[#1E293B] cursor-pointer"
            data-testid="submit-new-client-btn"
          >
            ✓ 명단 저장 및 맞춤 매칭 시작
          </button>
        </div>
      )}

      {/* Thread list */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {filteredThreads.map((thread) => {
          const isSelected = thread.id === selectedId;
          const isHot = thread.openCount >= 3;

          return (
            <div
              key={thread.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedId(thread.id)}
              onKeyDown={(e) => e.key === "Enter" && setSelectedId(thread.id)}
              className={`w-full min-h-[72px] p-3.5 rounded-2xl border text-left transition-all cursor-pointer relative ${
                isSelected
                  ? "bg-white border-[#1D4ED8] shadow-sm ring-2 ring-[#1D4ED8]/20"
                  : "bg-white border-[#E2E8F0] hover:border-[#64748B]"
              }`}
            >
              {isSelected && (
                <div className="absolute left-0 top-3 bottom-3 w-1.5 bg-[#1D4ED8] rounded-r" />
              )}

              <div className="flex items-center justify-between gap-1 mb-1">
                <div className="flex items-center gap-1.5 truncate">
                  <span className="font-bold text-[16px] text-[#0F172A] truncate">
                    {thread.clientName}
                  </span>
                  <span className="text-[12px] font-extrabold text-[#1D4ED8] bg-[#EFF6FF] px-1.5 py-0.5 rounded">
                    {thread.clientGrade}
                  </span>
                  {thread.status === "pending_gate" && (
                    <span className="text-[11px] font-extrabold text-[#92400E] bg-[#FEF3C7] px-1.5 py-0.5 rounded">
                      G2 승인대기
                    </span>
                  )}
                  {thread.status === "revoked" && (
                    <span className="text-[11px] font-extrabold text-[#991B1B] bg-[#FEE2E2] px-1.5 py-0.5 rounded">
                      회수됨
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {isHot && (
                    <span className="text-[12px] font-extrabold text-[#991B1B] bg-[#FEE2E2] px-2 py-0.5 rounded-full flex items-center gap-0.5">
                      🔥 {thread.openCount}회 열람
                    </span>
                  )}
                  <span className="text-[12px] text-[#64748B]">{thread.updatedAt}</span>
                </div>
              </div>

              <p className="text-[14px] text-[#0F172A] font-semibold truncate mb-0.5">
                {thread.buildingTitle}
              </p>
              <p className="text-[13px] text-[#475569] truncate">{thread.latestEvent}</p>
            </div>
          );
        })}
      </div>
    </div>
  );

  /* ──────── Column 2: Thread Details & Action Area ──────── */
  const editorSlot = (
    <div className="p-4 sm:p-6 space-y-6 max-w-3xl mx-auto" data-testid="inbox-editor-slot">
      {/* Header card for selected thread */}
      <div className="bg-white rounded-2xl border-2 border-[#CBD5E1] p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] pb-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[20px] font-extrabold text-[#0F172A]">
                {activeThread.clientName}
              </h2>
              <span className="text-[13px] font-bold text-[#1D4ED8] bg-[#EFF6FF] px-2 py-0.5 rounded">
                {activeThread.clientGrade} 고객
              </span>
              <span className="text-[14px] text-[#64748B]">{activeThread.clientPhone}</span>
              {activeThread.newsletterSubscribed && (
                <span className="text-[12px] font-bold text-[#065F46] bg-[#D1FAE5] px-2 py-0.5 rounded-full">
                  📰 소식지 구독 중
                </span>
              )}
            </div>
            <p className="text-[15px] text-[#334155] font-semibold mt-1">
              관심 매물: {activeThread.buildingTitle}
            </p>
          </div>

          <a
            href={`tel:${activeThread.clientPhone}`}
            className="min-h-[48px] px-4 py-2.5 bg-[#0F172A] text-white rounded-xl font-bold text-[15px] flex items-center gap-1.5 hover:bg-[#1E293B] cursor-pointer"
          >
            <span>📞</span> 전화 연결
          </a>
        </div>

        {/* [M5] 4-Workspace Cross-Action Bridge Bar */}
        <div
          className="flex flex-wrap items-center gap-2 bg-[#FAF9F5] p-3 rounded-xl border border-[#E2E8F0]"
          data-testid="cross-workspace-bridge"
        >
          <span className="text-[13px] font-extrabold text-[#475569] mr-1">
            🔗 매물 작업 바로가기:
          </span>
          <Link
            href={`/broker/w/dealcards?buildingId=${encodeURIComponent(activeThread.buildingId)}`}
            className="min-h-[38px] px-3 py-1.5 bg-white border border-[#CBD5E1] rounded-lg text-[13px] font-bold text-[#0F172A] hover:border-[#1D4ED8] hover:text-[#1D4ED8] flex items-center gap-1"
            data-testid="bridge-dealcard-link"
          >
            📄 딜카드 편집
          </Link>
          <Link
            href={`/broker/w/im?buildingId=${encodeURIComponent(activeThread.buildingId)}`}
            className="min-h-[38px] px-3 py-1.5 bg-white border border-[#CBD5E1] rounded-lg text-[13px] font-bold text-[#0F172A] hover:border-[#1D4ED8] hover:text-[#1D4ED8] flex items-center gap-1"
            data-testid="bridge-im-link"
          >
            📊 IM 편집
          </Link>
          <Link
            href={`/im-lite/${encodeURIComponent(activeThread.buildingId)}`}
            target="_blank"
            className="min-h-[38px] px-3 py-1.5 bg-white border border-[#CBD5E1] rounded-lg text-[13px] font-bold text-[#1D4ED8] hover:bg-[#EFF6FF] flex items-center gap-1"
            data-testid="bridge-viewer-link"
          >
            👁️ 고객 화면 열기 ↗
          </Link>
          <a
            href={`/api/public/im-lite/${encodeURIComponent(activeThread.buildingId)}/pptx`}
            className="min-h-[38px] px-3 py-1.5 bg-white border border-[#CBD5E1] rounded-lg text-[13px] font-bold text-[#0F172A] hover:border-[#0F172A] flex items-center gap-1"
            data-testid="bridge-pptx-link"
          >
            📥 PPTX 다운로드
          </a>
          <button
            type="button"
            onClick={handleToggleNewsletterSubscription}
            className={`min-h-[38px] px-3 py-1.5 rounded-lg text-[13px] font-bold border cursor-pointer flex items-center gap-1 ${
              activeThread.newsletterSubscribed
                ? "bg-[#ECFDF5] text-[#065F46] border-[#A7F3D0]"
                : "bg-white text-[#475569] border-[#CBD5E1]"
            }`}
            data-testid="bridge-newsletter-btn"
          >
            📰 {activeThread.newsletterSubscribed ? "소식지 구독 중 ✓" : "소식지 구독 추가"}
          </button>
        </div>

        {/* [M4] Section Dwell Intelligence & Coaching Banner */}
        {activeThread.focusedSections && activeThread.focusedSections.length > 0 && (
          <div
            className="p-3.5 bg-[#EFF6FF] border border-[#BFDBFE] rounded-xl space-y-2"
            data-testid="section-dwell-badges"
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[13px] font-extrabold text-[#1E40AF]">
                🎯 고객 집중 검토 섹션:
              </span>
              {activeThread.focusedSections.map((sec, idx) => (
                <span
                  key={idx}
                  className="text-[12px] font-bold bg-white text-[#1D4ED8] border border-[#93C5FD] px-2.5 py-0.5 rounded-full"
                >
                  {sec}
                </span>
              ))}
            </div>
            <p className="text-[13px] text-[#1E3A8A] leading-snug">
              💡 <strong>통화 브리핑 팁:</strong> 고객이{" "}
              <strong>{activeThread.focusedSections[0]}</strong> 영역을 가장 오래 살펴보았습니다.
              통화 시 임대차 만기 일정이나 대출 레버리지 적용 시 기대수익률 변동을 먼저 안내해 보세요.
            </p>
          </div>
        )}

        {/* Gate Request Action Panel if status === 'pending_gate' */}
        {activeThread.status === "pending_gate" && (
          <div className="p-4 bg-[#FEF3C7] border-2 border-[#FDE68A] rounded-2xl space-y-3">
            <div className="flex items-center gap-2 text-[#92400E] font-bold text-[16px]">
              <span>🔒</span>
              <span>G2 상세자료 공개 승인 요청</span>
            </div>
            <p className="text-[14px] text-[#92400E]">
              고객이 렌트롤 상세 및 토지이용계획 열람을 요청했습니다. 승인 시 개별 보안 링크가 발급됩니다.
            </p>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleApproveGate}
                className="min-h-[48px] px-5 bg-[#065F46] text-white font-bold rounded-xl hover:bg-[#047857] cursor-pointer shadow-sm text-[15px]"
              >
                ✓ 공개 승인 (G2)
              </button>
              <button
                type="button"
                onClick={handleRejectGate}
                className="min-h-[48px] px-4 bg-white border border-[#CBD5E1] text-[#64748B] font-bold rounded-xl hover:bg-[#FAF9F5] cursor-pointer text-[15px]"
              >
                보류
              </button>
            </div>
          </div>
        )}

        {/* [M2] Unlocked Security Link Follow-up Banner after G2 Approval */}
        {activeThread.gateStatus === "approved" && (
          <div
            className="p-4 bg-[#ECFDF5] border-2 border-[#6EE7B7] rounded-2xl flex flex-wrap items-center justify-between gap-3"
            data-testid="g2-approved-banner"
          >
            <div>
              <p className="text-[15px] font-extrabold text-[#065F46]">
                🔓 G2 상세자료 열람 승인 완료 (전용 토큰: {activeThread.shareToken})
              </p>
              <p className="text-[13px] text-[#047857]">
                고객에게 잠금 해제된 보안 링크를 카카오톡으로 바로 안내하세요.
              </p>
            </div>
            <button
              type="button"
              onClick={handleCopyG2ApprovedLink}
              className="min-h-[44px] px-4 bg-[#065F46] text-white font-bold rounded-xl text-[14px] hover:bg-[#047857] cursor-pointer"
              data-testid="copy-g2-link-btn"
            >
              📋 G2 승인 링크 카톡 문구 복사
            </button>
          </div>
        )}

        {/* Direct KakaoTemplatePicker Helper */}
        <div className="pt-2">
          <KakaoTemplatePicker
            buildingId={activeThread.buildingId}
            dealTitle={activeThread.buildingTitle}
            defaultTemplateId="tpl-06"
            buttonLabel="💬 카톡 팔로업 안부 인사말 복사 (tpl-06)"
          />
        </div>
      </div>

      {/* Activity Timeline */}
      <div className="bg-white rounded-2xl border-2 border-[#CBD5E1] p-5 shadow-sm space-y-4">
        <h3 className="text-[18px] font-extrabold text-[#0F172A]">
          열람 및 발송 이력 타임라인
        </h3>

        <div className="space-y-3">
          {activeThread.events.map((ev, idx) => (
            <div
              key={ev.id || idx}
              className="flex items-start gap-3 p-3 bg-[#FAF9F5] rounded-xl border border-[#E2E8F0]"
            >
              <span className="text-xl">
                {ev.eventType === "open" ? "👁️" : ev.eventType === "gate_request" ? "🔒" : "💬"}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-semibold text-[#0F172A]">{ev.description}</p>
                <span className="text-[13px] text-[#64748B]">{ev.timestamp}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Note / Call record input */}
        <div className="pt-2 border-t border-[#E2E8F0] flex gap-2">
          <input
            type="text"
            value={callNote}
            onChange={(e) => setCallNote(e.target.value)}
            placeholder="통화 내용이나 상담 메모를 남기세요..."
            className="flex-1 min-h-[48px] px-3.5 text-[15px] rounded-xl border border-[#64748B] outline-none focus:border-[#1D4ED8]"
            onKeyDown={(e) => e.key === "Enter" && handleAddCallNote()}
          />
          <button
            type="button"
            onClick={handleAddCallNote}
            className="min-h-[48px] px-4 bg-[#0F172A] text-white font-bold rounded-xl text-[14px] hover:bg-[#1E293B] cursor-pointer"
          >
            기록
          </button>
        </div>
      </div>
    </div>
  );

  /* ──────── Column 3: Recipient Context, Hot Lead Callout, Matched Deals, Share Queue ──────── */
  const previewSlot = (
    <div className="p-4 space-y-4 max-w-sm mx-auto" data-testid="inbox-preview-slot">
      {/* Hot-Lead Callout (for >=3 opens) (WP-P5-01 & WP-P5-03) */}
      {activeThread.openCount >= 3 && (
        <div
          className="bg-gradient-to-br from-[#FEF2F2] to-[#FEE2E2] rounded-2xl border-2 border-[#F87171] p-4 text-center space-y-2 shadow-md animate-pulse"
          data-testid="hot-lead-callout"
        >
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#EF4444] text-white rounded-full font-black text-[13px]">
            🔥 지금 전화
          </div>
          <h4 className="text-[17px] font-extrabold text-[#991B1B]">
            {activeThread.clientName}님이 {activeThread.openCount}회째 반복 열람 중입니다!
          </h4>
          <p className="text-[14px] text-[#7F1D1D] leading-tight">
            방금 렌트롤 및 수익률을 집중 검토했습니다. 매수 타이밍입니다.
          </p>
          <a
            href={`tel:${activeThread.clientPhone}`}
            className="w-full min-h-[48px] bg-[#DC2626] text-white font-extrabold rounded-xl flex items-center justify-center gap-2 hover:bg-[#B91C1C] cursor-pointer shadow-sm text-[15px]"
          >
            <span>📞</span> 지금 바로 전화하기
          </a>
        </div>
      )}

      {/* Recipient Profile Card */}
      <div className="bg-white rounded-2xl border-2 border-[#CBD5E1] p-4 shadow-sm space-y-3">
        <h4 className="text-[16px] font-extrabold text-[#0F172A]">고객 매수 프로필</h4>
        <div className="space-y-2 text-[14px]">
          <div className="flex justify-between p-2 bg-[#FAF9F5] rounded-lg">
            <span className="text-[#64748B]">투자 예산</span>
            <strong className="text-[#0F172A]">{activeThread.budget}</strong>
          </div>
          <div className="flex justify-between p-2 bg-[#FAF9F5] rounded-lg">
            <span className="text-[#64748B]">선호 권역</span>
            <strong className="text-[#0F172A]">{activeThread.preferredRegion}</strong>
          </div>
          <div className="flex justify-between p-2 bg-[#FAF9F5] rounded-lg">
            <span className="text-[#64748B]">발송 링크</span>
            <span className="text-[#1D4ED8] font-mono text-[12px] truncate max-w-[140px]">
              {activeThread.shareToken}
            </span>
          </div>
        </div>
      </div>

      {/* [M6] Auto-Matched Alternative Deals Panel */}
      {matchedAlternativeDeals.length > 0 && (
        <div
          className="bg-white rounded-2xl border-2 border-[#CBD5E1] p-4 shadow-sm space-y-3"
          data-testid="matched-deals-panel"
        >
          <div className="flex items-center justify-between">
            <h4 className="text-[15px] font-extrabold text-[#0F172A]">
              🎯 예산·권역 맞춤 대체 매물 추천
            </h4>
            <span className="text-[11px] font-bold text-[#1D4ED8] bg-[#EFF6FF] px-2 py-0.5 rounded-full">
              자동 매칭
            </span>
          </div>
          <p className="text-[12px] text-[#475569]">
            {activeThread.clientName}님의 희망 조건({activeThread.budget})과 부합하는 내 보유 매물입니다.
          </p>
          <div className="space-y-2.5">
            {matchedAlternativeDeals.map(({ deal, reasonLabel }) => (
              <div
                key={deal.buildingId}
                className="p-3 bg-[#FAF9F5] rounded-xl border border-[#E2E8F0] space-y-2"
                data-testid={`matched-deal-${deal.buildingId}`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[11px] font-extrabold text-[#065F46] bg-[#D1FAE5] px-2 py-0.5 rounded">
                    {reasonLabel}
                  </span>
                  <span className="text-[12px] font-extrabold text-[#1D4ED8]">
                    {deal.priceBand} · 연 {deal.capRatePct.toFixed(1)}%
                  </span>
                </div>
                <p className="text-[14px] font-bold text-[#0F172A] truncate">{deal.title}</p>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleCopyAlternativeDeal(deal)}
                    className="flex-1 min-h-[38px] px-2.5 bg-[#0F172A] text-white font-bold text-[12px] rounded-lg hover:bg-[#1E293B] cursor-pointer"
                    data-testid={`copy-matched-deal-${deal.buildingId}`}
                  >
                    📋 대체 매물 제안 복사
                  </button>
                  <Link
                    href={`/broker/w/im?buildingId=${encodeURIComponent(deal.buildingId)}`}
                    className="min-h-[38px] px-2.5 bg-white border border-[#CBD5E1] text-[#334155] font-bold text-[12px] rounded-lg flex items-center justify-center hover:border-[#0F172A]"
                  >
                    IM 보기
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Per-recipient Share Queue & Revocation (WP-P5-02 & WP-P5-04 + Server Persistence) */}
      <div className="bg-white rounded-2xl border-2 border-[#CBD5E1] p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-[16px] font-extrabold text-[#0F172A]">링크 보안 및 회수 관리</h4>
          {activeThread.status === "revoked" && (
            <span className="text-[11px] font-extrabold text-[#991B1B] bg-[#FEE2E2] px-2 py-0.5 rounded-full">
              404 차단 중
            </span>
          )}
          {activeThread.hasCorrectionNotice && activeThread.status !== "revoked" && (
            <span className="text-[11px] font-extrabold text-[#92400E] bg-[#FEF3C7] px-2 py-0.5 rounded-full">
              정정 공지 중
            </span>
          )}
        </div>
        <p className="text-[13px] text-[#475569]">
          오탈자나 가격 변동이 발생했을 때 보낸 링크를 즉시 회수하거나 고객 IM 상단에 정정 안내 띠를 띄울 수 있습니다.
        </p>

        <input
          type="text"
          value={correctionInput}
          onChange={(e) => setCorrectionInput(e.target.value)}
          placeholder="정정 안내 문구 입력..."
          className="w-full min-h-[38px] px-2.5 text-[12px] rounded-lg border border-[#CBD5E1] bg-[#FAF9F5]"
          data-testid="correction-message-input"
        />

        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            onClick={handleRevokeLink}
            className="min-h-[48px] px-3 bg-[#FEE2E2] text-[#991B1B] border border-[#FECACA] font-bold rounded-xl text-[14px] hover:bg-[#FECACA] cursor-pointer"
          >
            🚫 링크 회수
          </button>
          <button
            type="button"
            onClick={handleSendCorrection}
            className="min-h-[48px] px-3 bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A] font-bold rounded-xl text-[14px] hover:bg-[#FDE68A] cursor-pointer"
          >
            ⚠️ 정정 안내
          </button>
        </div>

        {activeThread.status === "revoked" && (
          <button
            type="button"
            onClick={handleRestoreLink}
            className="w-full min-h-[40px] px-3 bg-[#ECFDF5] text-[#065F46] border border-[#A7F3D0] font-bold rounded-xl text-[13px] hover:bg-[#D1FAE5] cursor-pointer"
            data-testid="restore-link-btn"
          >
            🔄 회수된 링크 다시 활성화하기
          </button>
        )}
      </div>
    </div>
  );

  return (
    <WorkspaceShell
      workspace="inbox"
      listTitle="① 소통 목록"
      editorTitle="② 상담 및 승인 작업"
      previewTitle="③ 고객 맥락 및 열람 신호"
      listSlot={listSlot}
      editorSlot={editorSlot}
      previewSlot={previewSlot}
      saveStatus={<span className="text-[14px] text-[#065F46] font-semibold">동기화됨 · 방금</span>}
      selectedBuildingId={selectedId}
      onBuildingSelect={setSelectedId}
    />
  );
}

export default function InboxWorkspacePage() {
  return (
    <UndoToastProvider>
      <Suspense fallback={<div className="p-8 text-center text-[#475569]">소통함 로딩 중...</div>}>
        <InboxWorkspaceInner />
      </Suspense>
    </UndoToastProvider>
  );
}
