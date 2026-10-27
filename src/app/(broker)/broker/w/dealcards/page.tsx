"use client";

import React, { useState, useEffect, useMemo, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import { Card4ConfirmCard } from "@/components/broker/deal-card/Card4ConfirmCard";
import { KakaoBubblePreview } from "@/components/broker/deal-card/KakaoBubblePreview";
import { PreSendConfirmationSheet } from "@/components/broker/deal-card/PreSendConfirmationSheet";
import { computeCard4Hash, type Card4Data } from "@/lib/deal-card/card4-schema";
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

const INITIAL_IDS = new Set(INITIAL_BUILDINGS.map((b) => b.id));
const STORAGE_KEY = "credeal-w-dealcards-v3";

function DealCardsWorkspaceInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showUndoToast } = useUndoToast();

  const [items, setItems] = useState<BuildingListItem[]>(INITIAL_BUILDINGS);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "sent">("all");
  const [isPreSendOpen, setIsPreSendOpen] = useState(false);
  const [isSaved, setIsSaved] = useState(true);
  const [saveStatusText, setSaveStatusText] = useState("저장됨 · 방금");
  const hasHandledNewRef = useRef(false);

  // Synchronize active building from URL search params (?buildingId= or ?id=)
  const buildingIdParam = searchParams.get("buildingId") || searchParams.get("id");
  const isNewParam = searchParams.get("new") === "true";
  const activeBuildingId = buildingIdParam || items[0]?.id || "";

  // Load persisted local state + real server buildings on mount
  useEffect(() => {
    try {
      const savedRaw = window.localStorage.getItem(STORAGE_KEY);
      if (savedRaw) {
        const parsed = JSON.parse(savedRaw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setItems(parsed);
        }
      }
    } catch {
      // ignore storage error
    }

    const querySuffix = buildingIdParam ? `?buildingId=${encodeURIComponent(buildingIdParam)}` : "";
    fetch(`/api/broker/workspace/summary${querySuffix}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.ok && Array.isArray(data.dealcards) && data.dealcards.length > 0) {
          setItems((prev) => {
            // Merge server buildings while preserving any local unsynced edits by ID
            const localMap = new Map(prev.map((it) => [it.id, it]));
            const merged: BuildingListItem[] = data.dealcards.map((srv: BuildingListItem) => {
              const local = localMap.get(srv.id);
              if (local && (local.card4.card4_version || 1) > (srv.card4.card4_version || 1)) {
                return local;
              }
              return srv;
            });
            for (const loc of prev) {
              const isUntouchedDemo =
                INITIAL_IDS.has(loc.id) &&
                (loc.card4.card4_version || 1) <= 1 &&
                loc.id !== buildingIdParam;
              if (!isUntouchedDemo && !merged.some((m) => m.id === loc.id)) {
                merged.push(loc);
              }
            }
            try {
              window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
            } catch {
              // ignore
            }
            return merged;
          });
        }
      })
      .catch(() => {
        // Offline or unauthenticated test environment fallback
      });
  }, [buildingIdParam]);

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

  const persistItems = (nextItems: BuildingListItem[]) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextItems));
    } catch {
      // ignore
    }
  };

  const handleCardChange = (updated: Card4Data) => {
    const nextVersion = (updated.card4_version || 1) + 1;
    const withMeta: Card4Data = {
      ...updated,
      card4_version: nextVersion,
    };
    setCurrentCard4(withMeta);
    setIsSaved(false);
    setSaveStatusText("자동저장 중...");

    setItems((prev) => {
      const next = prev.map((it) =>
        it.id === activeBuildingId
          ? {
              ...it,
              title: `${withMeta.region} ${withMeta.use}`.trim(),
              region: withMeta.region,
              use: withMeta.use,
              priceBand: withMeta.priceBand,
              updatedAt: "방금",
              card4: withMeta,
            }
          : it
      );
      persistItems(next);
      return next;
    });
  };

  const handleFlushSave = async (): Promise<boolean> => {
    setSaveStatusText("저장 중...");
    try {
      const res = await fetch("/api/broker/workspace/summary", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buildingId: activeBuildingId,
          card4: currentCard4,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.card4) {
          setCurrentCard4(data.card4);
          setItems((prev) => {
            const next = prev.map((it) =>
              it.id === activeBuildingId ? { ...it, card4: data.card4, updatedAt: "방금" } : it
            );
            persistItems(next);
            return next;
          });
        }
      }
    } catch {
      // Local storage already persisted
    }
    setIsSaved(true);
    setSaveStatusText("저장됨 · 방금");
    return true;
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
          "역세권 도보 5분 코너",
          "단독 사옥 활용 추천",
          "수익률 4.1% 검토 가능",
        ],
        provenance: {
          points: ["public", "broker", "ai"],
        },
        card4_version: 1,
      },
    };
    setItems((prev) => {
      const next = [newItem, ...prev];
      persistItems(next);
      return next;
    });
    router.replace(`/broker/w/dealcards?id=${newId}`);
    showUndoToast({
      message: "새 딜카드가 생성되었습니다.",
      variant: "success",
    });
  };

  useEffect(() => {
    if (isNewParam && !hasHandledNewRef.current) {
      hasHandledNewRef.current = true;
      handleCreateNew();
    }
  }, [isNewParam]);

  const handleOpenPreSend = () => {
    setIsPreSendOpen(true);
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
        onSave={async () => {
          await handleFlushSave();
          showUndoToast({
            message: "딜카드 내용이 서버에 저장되었습니다.",
            variant: "success",
          });
        }}
      />
    </div>
  );

  /* ── Column 3: ③ 확인하고 보내기 (KakaoBubblePreview 1:1 & 255px Toggle) ── */
  const previewSlot = (
    <div className="space-y-4">
      <KakaoBubblePreview card4={currentCard4} dealId={activeBuildingId} />
    </div>
  );

  /* ── 56px Primary Action Button mounted at bottom of Column 3 ── */
  const primaryActionSlot = (
    <button
      type="button"
      onClick={handleOpenPreSend}
      data-testid="workspace-primary-send-btn"
      className="w-full min-h-[56px] rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-extrabold text-lg flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
    >
      <span>💬</span>
      <span>카카오톡 보내기</span>
    </button>
  );

  return (
    <>
      <WorkspaceShell
        workspace="dealcards"
        listTitle="① 고르기"
        editorTitle="② 채우기"
        previewTitle="③ 확인하고 보내기"
        listSlot={listSlot}
        editorSlot={editorSlot}
        previewSlot={previewSlot}
        primaryActionSlot={primaryActionSlot}
        saveStatus={saveStatusText}
        selectedBuildingId={activeBuildingId}
      />
      <PreSendConfirmationSheet
        isOpen={isPreSendOpen}
        onClose={() => setIsPreSendOpen(false)}
        card4={currentCard4}
        dealId={activeBuildingId}
        isSaved={isSaved}
        onFlushSave={handleFlushSave}
        onCopyLink={() => {
          showUndoToast({
            message: "딜카드 공개 링크가 복사되었습니다.",
            variant: "success",
          });
        }}
      />
    </>
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
