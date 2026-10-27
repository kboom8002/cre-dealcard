"use client";

import React, { useState, useEffect, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
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
  updatedAt: string;
  openCount: number; // View count
  isRead: boolean;
  status: "pending_gate" | "hot_lead" | "active" | "revoked";
  shareToken: string;
  events: RecipientEvent[];
  budget: string;
  preferredRegion: string;
}

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
    budget: "80~100억",
    preferredRegion: "영등포구, 마포구",
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
    shareToken: "tok-sinsa-02",
    budget: "130~150억",
    preferredRegion: "강남구 신사동, 역삼동",
    events: [
      {
        id: "ev-201",
        eventType: "gate_request",
        description: "G2 상세자료 공개 요청 승인 대기 중",
        timestamp: "30분 전",
      },
      {
        id: "ev-202",
        eventType: "open",
        description: "모바일 IM 2회차 열람",
        timestamp: "어제",
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
    preferredRegion: "마포구 서교동, 연남동",
    events: [
      {
        id: "ev-301",
        eventType: "open",
        description: "딜카드 첫 열람",
        timestamp: "2시간 전",
      },
    ],
  },
];

function InboxWorkspaceInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showUndoToast } = useUndoToast();

  const [threads, setThreads] = useState<InboxThreadItem[]>(INITIAL_THREADS);
  const [activeFilter, setActiveFilter] = useState<InboxFilterType>("action");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string>(threads[0]?.id || "");
  const [cursor, setCursor] = useState<number>(3);
  const [callNote, setCallNote] = useState("");

  // Sync selection from query params
  useEffect(() => {
    const queryId = searchParams.get("thread") || searchParams.get("id");
    if (queryId) {
      const match = threads.find((t) => t.id === queryId);
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
      setThreads((prev) =>
        prev.map((t) => (t.id === activeThread.id ? { ...t, isRead: true } : t))
      );
    }
  }, [activeThread?.id]);

  const filteredThreads = useMemo(() => {
    return threads.filter((t) => {
      const matchQuery =
        !searchQuery ||
        t.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.buildingTitle.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchQuery) return false;

      if (activeFilter === "action") {
        return t.status === "pending_gate" || t.openCount >= 3;
      }
      if (activeFilter === "today") {
        return t.updatedAt.includes("분 전") || t.updatedAt.includes("시간 전");
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

  // Gate Request actions
  const handleApproveGate = () => {
    setThreads((prev) =>
      prev.map((t) => (t.id === activeThread.id ? { ...t, status: "active" } : t))
    );
    showUndoToast(`${activeThread.clientName}님의 자료 공개 요청을 승인했습니다.`);
  };

  const handleRejectGate = () => {
    showUndoToast(`${activeThread.clientName}님의 자료 공개 요청을 보류했습니다.`);
  };

  // Link Revocation & Correction
  const handleRevokeLink = () => {
    setThreads((prev) =>
      prev.map((t) => (t.id === activeThread.id ? { ...t, status: "revoked" } : t))
    );
    showUndoToast(`발송된 링크(${activeThread.shareToken})가 즉시 회수되었습니다. (404 처리)`);
  };

  const handleSendCorrection = () => {
    showUndoToast("고객 화면 상단에 '⚠️ 매물 정보가 정정되었습니다' 띠가 적용되었습니다.");
  };

  const handleAddCallNote = () => {
    if (!callNote.trim()) return;
    const newEvent: RecipientEvent = {
      id: `ev-${Date.now()}`,
      eventType: "dwell",
      description: `통화 기록: ${callNote}`,
      timestamp: "방금",
    };
    setThreads((prev) =>
      prev.map((t) =>
        t.id === activeThread.id ? { ...t, events: [newEvent, ...t.events] } : t
      )
    );
    setCallNote("");
    showUndoToast("통화 메모가 저장되었습니다.");
  };

  /* ──────── Column 1: Inbox Filter & List ──────── */
  const listSlot = (
    <div className="flex flex-col h-full bg-[#FAF9F5] p-3 space-y-3" data-testid="inbox-list-slot">
      {/* Search Input */}
      <div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="🔍 고객명, 매물명 검색"
          className="w-full min-h-[48px] px-3.5 bg-white text-[16px] rounded-xl border border-[#64748B] focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/20 outline-none"
        />
      </div>

      {/* Filter Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
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
            className={`min-h-[40px] px-3 rounded-lg text-[14px] font-bold border transition-colors cursor-pointer whitespace-nowrap ${
              activeFilter === flt.key
                ? "bg-[#0F172A] text-white border-[#0F172A]"
                : "bg-white text-[#475569] border-[#CBD5E1] hover:bg-[#F3F2EE]"
            }`}
          >
            {flt.label}
          </button>
        ))}
      </div>

      {/* Thread list with cursor pagination */}
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
        <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-[20px] font-extrabold text-[#0F172A]">
                {activeThread.clientName}
              </h2>
              <span className="text-[13px] font-bold text-[#1D4ED8] bg-[#EFF6FF] px-2 py-0.5 rounded">
                {activeThread.clientGrade} 고객
              </span>
              <span className="text-[14px] text-[#64748B]">{activeThread.clientPhone}</span>
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

  /* ──────── Column 3: Recipient Context, Hot Lead Callout, Share Queue ──────── */
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
            <span className="text-[#1D4ED8] font-mono text-[12px] truncate max-w-[120px]">
              {activeThread.shareToken}
            </span>
          </div>
        </div>
      </div>

      {/* Per-recipient Share Queue & Revocation (WP-P5-02 & WP-P5-04) */}
      <div className="bg-white rounded-2xl border-2 border-[#CBD5E1] p-4 shadow-sm space-y-3">
        <h4 className="text-[16px] font-extrabold text-[#0F172A]">링크 보안 및 회수 관리</h4>
        <p className="text-[13px] text-[#475569]">
          오탈자나 가격 변동이 발생했을 때 보낸 링크를 즉시 회수하거나 정정 안내 띠를 띄울 수 있습니다.
        </p>

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
