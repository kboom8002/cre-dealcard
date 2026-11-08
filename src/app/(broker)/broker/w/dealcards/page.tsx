"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import { Card4ConfirmCard } from "@/components/broker/deal-card/Card4ConfirmCard";
import { KakaoBubblePreview } from "@/components/broker/deal-card/KakaoBubblePreview";
import { PreSendConfirmationSheet } from "@/components/broker/deal-card/PreSendConfirmationSheet";
import { type Card4Data } from "@/lib/deal-card/card4-schema";
import { validateBlindPoints } from "@/lib/deal-card/blind-guard";
import { UndoToastProvider, useUndoToast } from "@/components/workspace/UndoConfirmToast";
import { useWorkspaceAutosave } from "@/lib/hooks/useWorkspaceAutosave";
import { POSTURE_LABELS, TERMS } from "@/lib/ux/lexicon";

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

const SAMPLE_CARD4: Card4Data = {
  headline: "대로변 코너 만실 운영 매물",
  posture: "income",
  region: "영등포구 양평동",
  use: "근린생활시설",
  area: "연면적 439평",
  gfaPyung: 439,
  landAreaPyung: 127,
  priceBand: "90~100억",
  points: [
    "역세권 도보 3분 코너",
    "우량 임차인 전층 만실",
    "안정적인 임대수익 구조",
  ],
  pointTones: ["amber", "sky", "mint"],
  provenance: {
    points: ["public", "broker", "ai"],
  },
  card4_version: 1,
};

const EMPTY_CARD4: Card4Data = {
  headline: "",
  posture: "income",
  region: "",
  use: "",
  area: "",
  priceBand: "",
  points: ["", "", ""],
  pointTones: ["amber", "sky", "mint"],
  provenance: {
    points: ["broker", "broker", "broker"],
  },
  card4_version: 1,
};

const INITIAL_BUILDINGS: BuildingListItem[] = [
  {
    id: "bld-01",
    title: "영등포구 양평동 근린생활시설",
    region: "영등포구 양평동",
    use: "근린생활시설",
    priceBand: "90~100억",
    status: "draft",
    updatedAt: "방금",
    card4: SAMPLE_CARD4,
  },
];

const INITIAL_IDS = new Set(INITIAL_BUILDINGS.map((b) => b.id));
const STORAGE_KEY = "credeal-w-dealcards-v5";

interface BrokerProfileSummary {
  displayName: string;
  company: string;
  phone: string;
  registrationNo: string;
  slug: string;
  photoUrl: string | null;
}

function DealCardsWorkspaceInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showUndoToast } = useUndoToast();

  const [items, setItems] = useState<BuildingListItem[]>(INITIAL_BUILDINGS);
  const [brokerProfile, setBrokerProfile] = useState<BrokerProfileSummary | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [postureFilter, setPostureFilter] = useState<"all" | "income" | "owner_value">("all");
  const [isPreSendOpen, setIsPreSendOpen] = useState(false);
  const hasHandledNewRef = useRef(false);

  const buildingIdParam = searchParams.get("buildingId") || searchParams.get("id");
  const isNewParam = searchParams.get("new") === "true";
  const activeBuildingId = buildingIdParam || items[0]?.id || "";

  const persistItems = useCallback((nextItems: BuildingListItem[]) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextItems));
    } catch {
      // ignore
    }
  }, []);

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
        if (data?.brokerProfile) {
          setBrokerProfile(data.brokerProfile);
        }
        if (data?.ok && Array.isArray(data.dealcards)) {
          setItems((prev) => {
            const localMap = new Map(prev.map((it) => [it.id, it]));
            const merged: BuildingListItem[] = data.dealcards.map((srv: BuildingListItem) => {
              const local = localMap.get(srv.id);
              const effectiveStatus =
                srv.status === "sent" || local?.status === "sent" ? ("sent" as const) : srv.status;
              if (local && (local.card4.card4_version || 1) > (srv.card4.card4_version || 1)) {
                return {
                  ...local,
                  status: effectiveStatus,
                };
              }
              return {
                ...srv,
                status: effectiveStatus,
              };
            });
            for (const loc of prev) {
              if (!INITIAL_IDS.has(loc.id) && loc.id === buildingIdParam && !merged.some((m) => m.id === loc.id)) {
                merged.unshift(loc);
              }
            }
            if (merged.length > 0) {
              persistItems(merged);
              const targetId = buildingIdParam || merged[0]?.id;
              const targetItem = merged.find((m) => m.id === targetId) || merged[0];
              if (targetItem) {
                setCurrentCard4(targetItem.card4);
                setSyncedBuildingId(targetItem.id);
              }
              return merged;
            }
            return prev;
          });
        }
      })
      .catch(() => {
        // Offline or test environment fallback
      })
      .finally(() => {
        setIsHydrated(true);
      });
  }, [buildingIdParam, persistItems]);

  const activeItem = useMemo(
    () => items.find((it) => it.id === activeBuildingId) || items[0],
    [items, activeBuildingId]
  );

  const [currentCard4, setCurrentCard4] = useState<Card4Data>(
    activeItem?.card4 || SAMPLE_CARD4
  );
  const [syncedBuildingId, setSyncedBuildingId] = useState<string>(activeBuildingId);
  const effectiveCard4 =
    activeItem && activeItem.id !== syncedBuildingId ? activeItem.card4 : currentCard4;

  const activeIdRef = useRef(activeBuildingId);
  const currentCard4Ref = useRef(effectiveCard4);
  activeIdRef.current = activeBuildingId;
  currentCard4Ref.current = effectiveCard4;

  const performServerSave = useCallback(
    async ({ id, data: payloadCard4 }: { id: string; data: Card4Data }) => {
      if (!id) throw new Error("Missing buildingId");
      const res = await fetch("/api/broker/workspace/summary", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upsert",
          buildingId: id,
          card4: payloadCard4,
        }),
      });
      if (!res.ok) {
        throw new Error(`Save failed (${res.status})`);
      }
      const data = await res.json().catch(() => null);
      return {
        version: data?.card4?.card4_version ?? payloadCard4.card4_version ?? 1,
      };
    },
    []
  );

  const autosave = useWorkspaceAutosave<Card4Data>({
    id: activeBuildingId || null,
    ready: isHydrated,
    data: effectiveCard4,
    debounceMs: 900,
    onSave: performServerSave,
  });

  useEffect(() => {
    if (activeItem) {
      setCurrentCard4(activeItem.card4);
      setSyncedBuildingId(activeItem.id);
    }
  }, [activeItem?.id]);

  const handleCardChange = (updated: Card4Data) => {
    const nextVersion = (updated.card4_version || 1) + 1;
    const withMeta: Card4Data = {
      ...updated,
      card4_version: nextVersion,
    };
    setCurrentCard4(withMeta);
    setSyncedBuildingId(activeBuildingId);
    currentCard4Ref.current = withMeta;

    setItems((prev) => {
      const next = prev.map((it) =>
        it.id === activeBuildingId
          ? {
              ...it,
              title: `${withMeta.region} ${withMeta.use}`.trim() || "새 딜카드",
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

  const handleFlushSave = useCallback(async (): Promise<boolean> => {
    return autosave.flush();
  }, [autosave]);

  const handleMarkSent = useCallback(() => {
    if (!activeBuildingId) return;
    setItems((prev) => {
      const next = prev.map((it) =>
        it.id === activeBuildingId ? { ...it, status: "sent" as const, updatedAt: "방금" } : it
      );
      persistItems(next);
      return next;
    });
    void fetch("/api/broker/workspace/summary", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "mark_sent",
        buildingId: activeBuildingId,
        card4: currentCard4Ref.current,
      }),
    }).catch(() => {});
  }, [activeBuildingId, persistItems]);

  const handleCreateNew = useCallback(() => {
    const newId = `bld-${Date.now().toString().slice(-4)}`;
    const newItem: BuildingListItem = {
      id: newId,
      title: "새 딜카드",
      region: "",
      use: "",
      priceBand: "",
      status: "draft",
      updatedAt: "방금",
      card4: { ...EMPTY_CARD4 },
    };
    setItems((prev) => {
      const next = [newItem, ...prev];
      persistItems(next);
      return next;
    });
    setCurrentCard4({ ...EMPTY_CARD4 });
    setSyncedBuildingId(newId);
    void fetch("/api/broker/workspace/summary", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "upsert",
        buildingId: newId,
        card4: newItem.card4,
      }),
    }).catch(() => {});
    router.replace(`/broker/w/dealcards?buildingId=${newId}&tab=editor`);
    showUndoToast({
      message: "빈 딜카드를 새로 열었어요. 지역과 용도부터 적어 보세요.",
      variant: "success",
    });
  }, [persistItems, router, showUndoToast]);

  const handleFillSample = () => {
    const prevSnapshot: Card4Data = {
      ...effectiveCard4,
      points: [...effectiveCard4.points] as [string, string, string],
    };
    handleCardChange({ ...SAMPLE_CARD4 });
    showUndoToast({
      message: "예시 내용을 채웠어요",
      undoAction: () => handleCardChange(prevSnapshot),
    });
  };

  useEffect(() => {
    if (isNewParam && !hasHandledNewRef.current) {
      hasHandledNewRef.current = true;
      handleCreateNew();
    }
  }, [isNewParam, handleCreateNew]);

  const handleDuplicateItem = (source: BuildingListItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const newId = `bld-${Date.now().toString().slice(-4)}`;
    const cloned: BuildingListItem = {
      ...source,
      id: newId,
      title: `${source.title} (사본)`,
      status: "draft",
      updatedAt: "방금",
      card4: {
        ...source.card4,
        headline: source.card4.headline ? source.card4.headline.slice(0, 18) : "",
        card4_version: 1,
      },
    };
    setItems((prev) => {
      const next = [cloned, ...prev];
      persistItems(next);
      return next;
    });
    setCurrentCard4(cloned.card4);
    setSyncedBuildingId(newId);
    void fetch("/api/broker/workspace/summary", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "upsert",
        buildingId: newId,
        card4: cloned.card4,
      }),
    }).catch(() => {});
    router.replace(`/broker/w/dealcards?buildingId=${newId}&tab=editor`);
    showUndoToast({
      message: `'${source.title}' 딜카드를 복제했어요`,
      variant: "success",
    });
  };

  const handleDeleteItem = (target: BuildingListItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const prevSnapshot = [...items];
    const remaining = items.filter((it) => it.id !== target.id);
    const nextList = remaining.length > 0 ? remaining : [{ ...INITIAL_BUILDINGS[0], id: `bld-${Date.now().toString().slice(-4)}`, title: "새 딜카드", region: "", use: "", priceBand: "", card4: { ...EMPTY_CARD4 } }];
    setItems(nextList);
    persistItems(nextList);
    void fetch("/api/broker/workspace/summary", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "delete",
        buildingId: target.id,
      }),
    }).catch(() => {});
    if (target.id === activeBuildingId && nextList[0]) {
      router.replace(`/broker/w/dealcards?buildingId=${nextList[0].id}&tab=editor`);
    }
    showUndoToast({
      message: `'${target.title}' 딜카드를 삭제했어요`,
      undoAction: () => {
        setItems(prevSnapshot);
        persistItems(prevSnapshot);
        void fetch("/api/broker/workspace/summary", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "restore",
            buildingId: target.id,
            card4: target.card4,
          }),
        }).catch(() => {});
      },
    });
  };

  const filteredItems = items.filter((it) => {
    const matchesQuery =
      !searchQuery ||
      it.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      it.region.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (it.card4.headline || "").toLowerCase().includes(searchQuery.toLowerCase());
    const itemPosture = it.card4.posture || "income";
    const matchesPosture =
      postureFilter === "all" ||
      (postureFilter === "income" && itemPosture === "income") ||
      (postureFilter === "owner_value" &&
        (itemPosture === "owner_occupied" || itemPosture === "value_add"));
    return matchesQuery && matchesPosture;
  });

  const isBlankCard =
    !effectiveCard4.region?.trim() &&
    !effectiveCard4.use?.trim() &&
    !effectiveCard4.priceBand?.trim();

  /* ── Column 1: ① 고르기 목록 ── */
  const listSlot = (
    <div className="space-y-3" data-testid="dealcard-airtable-list">
      {/* Header Summary */}
      <div
        data-theme-lock="dark"
        className="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-slate-900 text-white"
      >
        <span className="text-sm font-extrabold text-white">
          내 딜카드 목록
        </span>
        <span className="text-sm font-bold text-amber-300">
          총 {filteredItems.length}건
        </span>
      </div>

      {/*Primary Create Button */}
      <button
        type="button"
        onClick={handleCreateNew}
        data-testid="workspace-new-dealcard-btn"
        className="w-full min-h-[52px] rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-extrabold text-base flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
      >
        <span>＋</span>
        <span>새 딜카드 만들기</span>
      </button>

      {/* Search Input */}
      <div className="relative">
        <label htmlFor="dealcard-search-input" className="sr-only">
          딜카드 검색
        </label>
        <input
          id="dealcard-search-input"
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="지역, 용도, 제목으로 찾기..."
          className="w-full min-h-[48px] px-3.5 rounded-xl bg-white border border-slate-400 text-base text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
      </div>

      {/* 매물 유형 필터 (3개) */}
      <div
        role="tablist"
        aria-label="매물 유형별 보기"
        data-testid="dealcard-posture-switcher"
        className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-200 border border-slate-300"
      >
        {(
          [
            { id: "all", label: "전체" },
            { id: "income", label: "임대수익" },
            { id: "owner_value", label: "사옥·개발" },
          ] as const
        ).map((tab) => {
          const active = postureFilter === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`dealcard-posture-tab-${tab.id}`}
              onClick={() => setPostureFilter(tab.id)}
              className={`min-h-[44px] px-2 py-1.5 rounded-lg text-sm font-extrabold flex items-center justify-center transition cursor-pointer ${
                active
                  ? "bg-white text-blue-950 shadow-xs border border-blue-300"
                  : "text-slate-700 hover:text-slate-950"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Items List (2-line Senior-Friendly Cards) */}
      <div className="space-y-2 pt-1" role="list">
        {filteredItems.map((item) => {
          const isSelected = item.id === activeBuildingId;
          const itemPosture = item.card4.posture || "income";
          const postureLabel = POSTURE_LABELS[itemPosture].shortBadge;
          const itemBlind = validateBlindPoints([
            ...item.card4.points,
            item.card4.region || "",
            item.card4.use || "",
            item.card4.headline || "",
          ]);

          return (
            <div
              key={item.id}
              role="button"
              tabIndex={0}
              aria-current={isSelected ? "true" : undefined}
              data-testid={`dealcard-item-${item.id}`}
              onClick={() => {
                router.replace(`/broker/w/dealcards?buildingId=${item.id}&tab=editor`);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  router.replace(`/broker/w/dealcards?buildingId=${item.id}&tab=editor`);
                }
              }}
              className={`relative min-h-[84px] p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-center ${
                isSelected
                  ? "bg-white border-blue-600 shadow-sm"
                  : "bg-white/90 border-slate-300 hover:border-slate-400 hover:bg-white"
              }`}
            >
              {isSelected && (
                <div className="absolute left-0 top-2 bottom-2 w-1.5 bg-blue-600 rounded-r-full" />
              )}

              {/* Line 1: Title + Status Badge */}
              <div className="flex items-center justify-between gap-2 pl-2">
                <h3
                  data-single-line-title="true"
                  title={item.card4.headline || item.title}
                  className={`text-base break-keep ${
                    isSelected ? "font-extrabold text-blue-950" : "font-bold text-slate-900"
                  }`}
                >
                  {item.title || "새 딜카드"}
                </h3>
                <span
                  className={`text-sm px-2.5 py-0.5 rounded-full font-extrabold shrink-0 ${
                    !itemBlind.isValid
                      ? "bg-red-100 text-red-900 border border-red-300"
                      : item.status === "sent"
                      ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
                      : "bg-slate-100 text-slate-800 border border-slate-300"
                  }`}
                >
                  {!itemBlind.isValid
                    ? "⚠ 확인 필요"
                    : item.status === "sent"
                    ? TERMS.statusSent
                    : TERMS.statusDraft}
                </span>
              </div>

              {/* Line 2: Price + Posture + Quick Actions */}
              <div className="flex flex-wrap items-center justify-between gap-2 pl-2 mt-2">
                <div className="flex items-center gap-1.5 text-sm text-slate-600 font-semibold">
                  <span className="font-extrabold text-slate-900">
                    {item.priceBand || "가격 미입력"}
                  </span>
                  <span>·</span>
                  <span>{postureLabel}</span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    data-testid={`dealcard-duplicate-${item.id}`}
                    onClick={(e) => handleDuplicateItem(item, e)}
                    className="min-h-[36px] text-sm font-bold px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 cursor-pointer"
                  >
                    복제
                  </button>
                  <button
                    type="button"
                    data-testid={`dealcard-delete-${item.id}`}
                    onClick={(e) => handleDeleteItem(item, e)}
                    className="min-h-[36px] text-sm font-bold px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-red-50 text-slate-600 hover:text-red-700 border border-slate-300 cursor-pointer"
                  >
                    삭제
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  /* ── Column 2: ② 채우기 (Card4 Editor) ── */
  const editorSlot = (
    <div className="space-y-4">
      {isBlankCard && (
        <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 flex flex-wrap items-center justify-between gap-3">
          <p className="text-base font-bold text-blue-950">
            처음 작성하시나요? 예시를 불러와서 숫자만 고쳐 쓰실 수도 있어요.
          </p>
          <button
            type="button"
            data-testid="dealcard-fill-sample-btn"
            onClick={handleFillSample}
            className="min-h-[48px] px-4 py-2 rounded-xl bg-white hover:bg-blue-100 text-blue-900 border border-blue-300 text-sm font-extrabold transition cursor-pointer"
          >
            예시 채우기
          </button>
        </div>
      )}
      <Card4ConfirmCard card4={effectiveCard4} onChange={handleCardChange} />
    </div>
  );

  /* ── Column 3: ③ 확인하고 보내기 ── */
  const previewSlot = (
    <div className="space-y-4">
      <KakaoBubblePreview
        card4={effectiveCard4}
        dealId={activeBuildingId}
        brokerName={brokerProfile?.displayName}
        brokerSpecialty={brokerProfile?.company}
        brokerPhone={brokerProfile?.phone}
      />
    </div>
  );

  /* ── Primary Action Button mounted at bottom of Column 3 (and mirrored on <1280px) ── */
  const primaryActionSlot = (
    <button
      type="button"
      onClick={() => setIsPreSendOpen(true)}
      data-testid="workspace-primary-send-btn"
      className="w-full min-h-[56px] rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-extrabold text-lg flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
    >
      <span>{TERMS.sendKakao}</span>
    </button>
  );

  return (
    <>
      <WorkspaceShell
        workspace="dealcards"
        listTitle={TERMS.colPick}
        editorTitle={TERMS.colFill}
        previewTitle={TERMS.colPreviewSend}
        listSlot={listSlot}
        editorSlot={editorSlot}
        previewSlot={previewSlot}
        primaryActionSlot={primaryActionSlot}
        saveState={autosave.status}
        lastSavedAt={autosave.lastSavedAt}
        onRetrySave={() => {
          void autosave.flush();
        }}
        selectedBuildingId={activeBuildingId}
        selectedLabel={activeItem?.title || "새 딜카드"}
      />
      <PreSendConfirmationSheet
        isOpen={isPreSendOpen}
        onClose={() => setIsPreSendOpen(false)}
        card4={effectiveCard4}
        dealId={activeBuildingId}
        isSaved={autosave.status === "saved" || autosave.status === "idle"}
        onFlushSave={handleFlushSave}
        onSendToClient={() => {
          handleMarkSent();
        }}
        onCopyLink={() => {
          handleMarkSent();
          showUndoToast({
            message: "링크를 복사했어요. 카카오톡에 붙여넣어 보내세요.",
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
