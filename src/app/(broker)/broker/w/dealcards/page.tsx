"use client";

import React, { useState, useEffect, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import { Card4ConfirmCard } from "@/components/broker/deal-card/Card4ConfirmCard";
import type { Card4Data } from "@/lib/deal-card/card4-schema";
import { UndoToastProvider, useUndoToast } from "@/components/workspace/UndoConfirmToast";

interface BuildingListItem {
  id: string;
  title: string;
  region: string;
  use: string;
  priceBand: string;
  status: "draft" | "sent" | "archived";
  updatedAt: string;
  card4: Card4Data;
}

const INITIAL_BUILDINGS: BuildingListItem[] = [
  {
    id: "bld-01",
    title: "영등포구 양평동 근생빌딩",
    region: "영등포구 양평동",
    use: "근린생활시설",
    priceBand: "90~100억",
    status: "draft",
    updatedAt: "10분 전",
    card4: {
      region: "영등포구 양평동",
      use: "근린생활시설",
      priceBand: "90~100억",
      points: [
        "역세권 도보 3분 코너",
        "우량 프랜차이즈 임대중",
        "연 수익률 4.2% 안정권",
      ],
      provenance: {
        points: ["public", "broker", "ai"],
      },
      card4_version: 1,
    },
  },
  {
    id: "bld-02",
    title: "강남구 신사동 상가주택",
    region: "강남구 신사동",
    use: "상가주택",
    priceBand: "140~150억",
    status: "sent",
    updatedAt: "어제",
    card4: {
      region: "강남구 신사동",
      use: "상가주택",
      priceBand: "140~150억",
      points: [
        "도산대로 이면 가시성",
        "사옥 및 복합 용도 최적",
        "최근 인근 평당 1.8억 거래",
      ],
      provenance: {
        points: ["public", "broker", "ai"],
      },
      card4_version: 1,
    },
  },
  {
    id: "bld-03",
    title: "마포구 서교동 올근생",
    region: "마포구 서교동",
    use: "근린생활시설",
    priceBand: "60~70억",
    status: "draft",
    updatedAt: "3일 전",
    card4: {
      region: "마포구 서교동",
      use: "근린생활시설",
      priceBand: "60~70억",
      points: [
        "홍대 상권 유동인구 풍부",
        "전층 만실 공실 위험 낮음",
        "연 4.5% 배당형 수익",
      ],
      provenance: {
        points: ["public", "broker", "ai"],
      },
      card4_version: 1,
    },
  },
];

function DealCardsWorkspaceInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showUndoToast } = useUndoToast();

  const [items, setItems] = useState<BuildingListItem[]>(INITIAL_BUILDINGS);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "sent">("all");
  const [isSending, setIsSending] = useState(false);

  // Synchronize active building from URL search params
  const buildingIdParam = searchParams.get("buildingId");
  const activeBuildingId = buildingIdParam || items[0]?.id || "";

  const activeItem = useMemo(
    () => items.find((it) => it.id === activeBuildingId) || items[0],
    [items, activeBuildingId]
  );

  const [currentCard4, setCurrentCard4] = useState<Card4Data>(
    activeItem?.card4 || INITIAL_BUILDINGS[0].card4
  );

  useEffect(() => {
    if (activeItem) {
      setCurrentCard4(activeItem.card4);
    }
  }, [activeItem]);

  const handleCardChange = (updated: Card4Data) => {
    setCurrentCard4(updated);
    setItems((prev) =>
      prev.map((it) =>
        it.id === activeBuildingId
          ? {
              ...it,
              region: updated.region,
              use: updated.use,
              priceBand: updated.priceBand,
              card4: updated,
            }
          : it
      )
    );
  };

  const handleCreateNew = () => {
    const newId = `bld-${Date.now().toString().slice(-4)}`;
    const newItem: BuildingListItem = {
      id: newId,
      title: "새 딜카드 (작성 중)",
      region: "강남구 역삼동",
      use: "업무시설",
      priceBand: "100~110억",
      status: "draft",
      updatedAt: "방금",
      card4: {
        region: "강남구 역삼동",
        use: "업무시설",
        priceBand: "100~110억",
        points: [
          "테헤란로 도보 5분",
          "단독 사옥 활용 추천",
          "수익률 4.1% 검토 가능",
        ],
        provenance: {
          points: ["public", "broker", "ai"],
        },
        card4_version: 1,
      },
    };
    setItems((prev) => [newItem, ...prev]);
    router.replace(`/broker/w/dealcards?buildingId=${newId}&tab=editor`);
    showUndoToast({
      message: "새 딜카드가 생성되었습니다.",
      variant: "success",
    });
  };

  const handleSendKakao = () => {
    setIsSending(true);
    setTimeout(() => {
      setIsSending(false);
      showUndoToast({
        message: "카카오톡으로 딜카드가 발송되었습니다.",
        variant: "success",
        undoAction: () => {
          // undo simulation
        },
        undoLabel: "발송 취소",
      });
    }, 400);
  };

  // Filtered list items
  const filteredItems = items.filter((it) => {
    const matchesQuery =
      !searchQuery ||
      it.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      it.region.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus =
      statusFilter === "all" || it.status === statusFilter;
    return matchesQuery && matchesStatus;
  });

  /* ── Column 1: ① 고르기 목록 ── */
  const listSlot = (
    <div className="space-y-3">
      {/* 56px Primary Create Button */}
      <button
        type="button"
        onClick={handleCreateNew}
        data-testid="workspace-new-dealcard-btn"
        className="w-full min-h-[56px] rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-extrabold text-base flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
      >
        <span>＋</span>
        <span>새 딜카드 만들기</span>
      </button>

      {/* 48px Search Input */}
      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="물건명 또는 지역 검색..."
          className="w-full min-h-[48px] px-3.5 pl-10 rounded-xl bg-white border border-[#64748B] text-base text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
        <span className="absolute left-3.5 top-3.5 text-slate-400 text-base">🔍</span>
      </div>

      {/* 40px Filter Chips */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {(["all", "draft", "sent"] as const).map((filter) => (
          <button
            key={filter}
            type="button"
            onClick={() => setStatusFilter(filter)}
            className={`min-h-[40px] px-3 py-1.5 rounded-lg text-sm font-extrabold transition-colors whitespace-nowrap cursor-pointer ${
              statusFilter === filter
                ? "bg-blue-100 text-blue-900 border border-blue-300"
                : "bg-white text-slate-700 border border-slate-300 hover:bg-slate-100"
            }`}
          >
            {filter === "all" ? "전체" : filter === "draft" ? "작성 중" : "발송 완료"}
          </button>
        ))}
      </div>

      {/* Items List (72px min height per row) */}
      <div className="space-y-2 pt-1" role="list">
        {filteredItems.map((item) => {
          const isSelected = item.id === activeBuildingId;
          return (
            <div
              key={item.id}
              role="listitem"
              data-testid={`dealcard-item-${item.id}`}
              onClick={() => {
                router.replace(`/broker/w/dealcards?buildingId=${item.id}&tab=editor`);
              }}
              className={`relative min-h-[72px] p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-center ${
                isSelected
                  ? "bg-white border-blue-600 shadow-sm"
                  : "bg-white/80 border-slate-300 hover:border-slate-400 hover:bg-white"
              }`}
            >
              {/* 4px Blue Left Bar on selection */}
              {isSelected && (
                <div className="absolute left-0 top-2 bottom-2 w-1.5 bg-blue-600 rounded-r-full" />
              )}

              <div className="flex items-center justify-between gap-2 pl-2">
                <h3
                  className={`text-base truncate ${
                    isSelected ? "font-extrabold text-blue-950" : "font-bold text-slate-900"
                  }`}
                >
                  {item.title}
                </h3>
                <span
                  className={`text-sm px-2 py-0.5 rounded-full font-extrabold shrink-0 ${
                    item.status === "draft"
                      ? "bg-amber-100 text-amber-900 border border-amber-300"
                      : "bg-emerald-100 text-emerald-900 border border-emerald-300"
                  }`}
                >
                  {item.status === "draft" ? "작성 중" : "발송 완료"}
                </span>
              </div>

              <div className="flex items-center gap-2 pl-2 mt-1 text-sm text-slate-600 font-medium">
                <span>{item.region}</span>
                <span>·</span>
                <span className="font-bold text-slate-900">{item.priceBand}</span>
                <span>·</span>
                <span className="text-slate-500">{item.updatedAt}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  /* ── Column 2: ② 채우기 (Card4 Editor) ── */
  const editorSlot = (
    <div className="space-y-6">
      <Card4ConfirmCard
        card4={currentCard4}
        onChange={handleCardChange}
        onSave={() => {
          showUndoToast({
            message: "딜카드 내용이 저장되었습니다.",
            variant: "success",
          });
        }}
      />
    </div>
  );

  /* ── Column 3: ③ 확인하고 보내기 (Kakao Preview + Sole Primary Button) ── */
  const previewSlot = (
    <div className="space-y-4">
      {/* Kakao Bubble Live Mock Preview */}
      <div
        data-testid="kakao-bubble-preview"
        className="bg-[#FEE500] p-4 rounded-2xl shadow-sm border border-amber-300/60 max-w-sm mx-auto"
      >
        <div className="bg-white rounded-xl overflow-hidden shadow-md border border-slate-200">
          {/* Card Top Title Banner */}
          <div className="bg-slate-900 text-white p-4">
            <span className="text-sm font-extrabold text-amber-400 block tracking-wider uppercase">
              CRE DEAL CARD
            </span>
            <h4 className="text-xl font-extrabold mt-1 text-white leading-snug">
              {currentCard4.region} {currentCard4.use}
            </h4>
            <div className="text-2xl font-black text-amber-400 mt-2 font-mono tracking-tight">
              {currentCard4.priceBand}
            </div>
          </div>

          {/* 3 Bullet Points */}
          <div className="p-4 bg-slate-50 space-y-2 border-t border-slate-200">
            <span className="text-sm font-bold text-slate-500 block">핵심 투자 포인트</span>
            {currentCard4.points.map((pt, i) => (
              <div key={i} className="flex items-start gap-2 text-base font-bold text-slate-800">
                <span className="text-blue-600 font-bold shrink-0">✓</span>
                <span className="leading-snug">{pt}</span>
              </div>
            ))}
          </div>

          {/* Kakao bubble footer */}
          <div className="p-3 bg-white text-center border-t border-slate-200">
            <span className="text-sm font-extrabold text-blue-700">
              상세 정보 열람하기 ›
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  /* ── 56px Primary Action Button mounted at bottom of Column 3 ── */
  const primaryActionSlot = (
    <button
      type="button"
      onClick={handleSendKakao}
      disabled={isSending}
      data-testid="workspace-primary-send-btn"
      className="w-full min-h-[56px] rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-extrabold text-lg flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer disabled:opacity-50"
    >
      <span>💬</span>
      <span>{isSending ? "발송 준비 중..." : "카카오톡 보내기"}</span>
    </button>
  );

  return (
    <WorkspaceShell
      workspace="dealcards"
      listTitle="① 고르기"
      editorTitle="② 채우기"
      previewTitle="③ 확인하고 보내기"
      listSlot={listSlot}
      editorSlot={editorSlot}
      previewSlot={previewSlot}
      primaryActionSlot={primaryActionSlot}
      saveStatus="저장됨 · 방금"
      selectedBuildingId={activeBuildingId}
    />
  );
}

export default function DealCardsWorkspacePage() {
  return (
    <UndoToastProvider>
      <Suspense
        fallback={
          <div className="flex items-center justify-center h-screen bg-[#F3F2EE] text-slate-700 font-bold text-lg">
            딜카드 작업공간을 불러오는 중...
          </div>
        }
      >
        <DealCardsWorkspaceInner />
      </Suspense>
    </UndoToastProvider>
  );
}
