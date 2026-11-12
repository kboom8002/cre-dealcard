"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import { Card4ConfirmCard } from "@/components/broker/deal-card/Card4ConfirmCard";
import { PairedMemoTopCard } from "@/components/broker/deal-card/PairedMemoTopCard";
import { KakaoBubblePreview } from "@/components/broker/deal-card/KakaoBubblePreview";
import { PreSendConfirmationSheet } from "@/components/broker/deal-card/PreSendConfirmationSheet";
import { MemoImportModal } from "@/components/broker/deal-card/MemoImportModal";
import {
  resolveCard4AreaLabel,
  type Card4Data,
  type DealCardGenerationSource,
} from "@/lib/deal-card/card4-schema";
import {
  classifyDealCardOriginGroup,
  extractMemoStructuredFacts,
  isDealCandidateMemo,
  parseMemoIntoCard4,
  summarizeMemoOneLine,
  type DealCardOriginGroup,
  type UnconvertedMemoItem,
} from "@/lib/deal-card/memo-pairing";
import { cleanBlindPoints, validateBlindPoints } from "@/lib/deal-card/blind-guard";
import {
  deriveDealCardHeadline,
  isCompleteDealCardLine,
  normalizeDealCardCopy,
  repairDealCardLine,
  repairDealCardPoints,
  stripChipRepetition,
  stripUngroundedNumbers,
} from "@/lib/deal-card/copy-limits";
import { UndoToastProvider, useUndoToast } from "@/components/workspace/UndoConfirmToast";
import { useWorkspaceAutosave } from "@/lib/hooks/useWorkspaceAutosave";
import { POSTURE_LABELS, TERMS } from "@/lib/ux/lexicon";

/**
 * 서버/로컬에서 불러온 카드의 문구를 18자 SSOT 로 맞춘다.
 * - 장점 3줄: 어절 경계 교정 (하드 절단 금지)
 * - 한 줄 제목이 비어 있고 카드 내용이 있으면, 미리보기/OG 가 쓰던 파생 제목을 같은 입력 필드에 채운다.
 * - 면적(area)이 아직 초기화되지 않은(undefined) 경우에만 스펙에서 초기 라벨을 채운다 (사용자가 "" 로 비운 값은 보존).
 */
function hydrateCard4(card4: Card4Data): Card4Data {
  const normalized = normalizeDealCardCopy(card4, { fillHeadline: true });
  if (normalized.area === undefined) {
    const initialArea = resolveCard4AreaLabel(normalized);
    if (initialArea) {
      return { ...normalized, area: initialArea };
    }
  }
  return normalized;
}

function hydrateItem<T extends { card4: Card4Data }>(item: T): T {
  const card4 = hydrateCard4(item.card4);
  return card4 === item.card4 ? item : { ...item, card4 };
}

interface BuildingListItem {
  id: string;
  title: string;
  region: string;
  use: string;
  priceBand: string;
  status: "draft" | "sent" | "archived";
  updatedAt: string;
  card4: Card4Data;
  /** 중개사 전용 비공개 원본 메모 — 고객 카톡·공유 링크(/dc/[id])·썸네일에는 절대 노출되지 않음 */
  memoText?: string;
  pairedMemoId?: string;
  generationSource?: DealCardGenerationSource;
  /** 신규 생성 직후 아직 메모에서 딜카드 생성을 실행하기 전인 1단계 상태 */
  awaitingMemoGeneration?: boolean;
}

const SAMPLE_MEMO_TEXT =
  "영등포구 양평동4가 대로변 코너 근생빌딩, 대지 127평 / 연면적 439평, 매매 희망가 95억, 역세권 도보 3분 코너 입지, 전층 우량 임차인 만실 운영 중";

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
  generationSource: "ai_memo",
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
    memoText: SAMPLE_MEMO_TEXT,
    generationSource: "ai_memo",
    awaitingMemoGeneration: false,
  },
];

const INITIAL_IDS = new Set(INITIAL_BUILDINGS.map((b) => b.id));
const STORAGE_KEY = "credeal-w-dealcards-v5";
const UNCONVERTED_MEMO_STORAGE_KEY = "credeal-w-dealcards-memos-v1";

interface BrokerProfileSummary {
  displayName: string;
  company: string;
  phone: string;
  registrationNo: string;
  slug: string;
  photoUrl: string | null;
}

const ROUTING_TYPE_BADGE: Record<string, string> = {
  new_deal: "매물 메모",
  update_building: "매물 보강",
  general_note: "일반 메모",
  buyer_condition: "매수 조건",
  schedule_event: "일정 메모",
};

function DealCardsWorkspaceInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showUndoToast } = useUndoToast();

  const rawBuildingIdParam = searchParams.get("buildingId") || searchParams.get("id");
  const buildingIdParam = rawBuildingIdParam ? rawBuildingIdParam.trim() || null : null;
  const rawMemoIdParam = searchParams.get("memoId");
  const memoIdParam = rawMemoIdParam ? rawMemoIdParam.trim() || null : null;
  const isNewParam = searchParams.get("new") === "true";

  const [items, setItems] = useState<BuildingListItem[]>(INITIAL_BUILDINGS);
  const [unconvertedMemos, setUnconvertedMemos] = useState<UnconvertedMemoItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(
    () => buildingIdParam || INITIAL_BUILDINGS[0]?.id || null
  );
  const [selectedMemoOnlyId, setSelectedMemoOnlyId] = useState<string | null>(
    () => memoIdParam || null
  );
  const [syncedServerIds, setSyncedServerIds] = useState<Set<string>>(() => new Set());
  const [brokerProfile, setBrokerProfile] = useState<BrokerProfileSummary | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [originGroupFilter, setOriginGroupFilter] = useState<"all" | DealCardOriginGroup>("all");
  const [postureFilter, setPostureFilter] = useState<"all" | "income" | "owner_value">("all");
  const [showOtherMemos, setShowOtherMemos] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<DealCardOriginGroup, boolean>>({
    ai_memo: false,
    unconverted_memo: false,
    manual: false,
  });

  const [isGeneratingFromMemo, setIsGeneratingFromMemo] = useState(false);
  const [memoSaveStatus, setMemoSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [isPreSendOpen, setIsPreSendOpen] = useState(false);
  const [isMemoModalOpen, setIsMemoModalOpen] = useState(false);

  const memoTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const memoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasHandledNewRef = useRef(false);
  const initialBuildingIdParamRef = useRef<string | null>(buildingIdParam);
  const initialMemoIdParamRef = useRef<string | null>(memoIdParam);
  const lastSyncedQueryIdRef = useRef<string | null>(null);
  const userInteractedRef = useRef<boolean>(false);
  const userEditedIdsRef = useRef<Set<string>>(new Set());
  const itemsRef = useRef<BuildingListItem[]>(items);
  itemsRef.current = items;

  const persistItems = useCallback((nextItems: BuildingListItem[]) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextItems));
    } catch {
      // ignore
    }
  }, []);

  const persistUnconvertedMemos = useCallback((nextMemos: UnconvertedMemoItem[]) => {
    try {
      window.localStorage.setItem(UNCONVERTED_MEMO_STORAGE_KEY, JSON.stringify(nextMemos));
    } catch {
      // ignore
    }
  }, []);

  const markServerSynced = useCallback((id: string) => {
    if (!id) return;
    setSyncedServerIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const unmarkServerSynced = useCallback((id: string) => {
    if (!id) return;
    setSyncedServerIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  // 선택된 미생성 메모 (좌측 '📝 딜카드 미생성 메모' 클릭 시 활성화)
  const selectedMemoOnly = useMemo(() => {
    if (!selectedMemoOnlyId) return null;
    return unconvertedMemos.find((m) => m.id === selectedMemoOnlyId) ?? null;
  }, [unconvertedMemos, selectedMemoOnlyId]);

  // SSOT activeItem & resolvedActiveId — 유령 buildingId 로 인한 입력 동결 및 0-하이라이트 원천 차단 (DC-01)
  const activeItem = useMemo(() => {
    if (selectedMemoOnly) return null;
    if (selectedId) {
      const bySelected = items.find((it) => it.id === selectedId);
      if (bySelected) return bySelected;
    }
    if (buildingIdParam) {
      const byQuery = items.find((it) => it.id === buildingIdParam);
      if (byQuery) return byQuery;
    }
    return items[0] ?? null;
  }, [items, selectedId, buildingIdParam, selectedMemoOnly]);

  const resolvedActiveId = activeItem?.id ?? null;

  const [currentCard4, setCurrentCard4] = useState<Card4Data>(
    () => activeItem?.card4 || SAMPLE_CARD4
  );
  const [syncedBuildingId, setSyncedBuildingId] = useState<string>(
    () => activeItem?.id || ""
  );
  const effectiveCard4 = selectedMemoOnly
    ? EMPTY_CARD4
    : activeItem && activeItem.id !== syncedBuildingId
    ? activeItem.card4
    : currentCard4;

  const resolvedActiveIdRef = useRef<string | null>(resolvedActiveId);
  const currentCard4Ref = useRef<Card4Data>(effectiveCard4);
  resolvedActiveIdRef.current = resolvedActiveId;
  currentCard4Ref.current = effectiveCard4;

  const selectDealCard = useCallback(
    (nextId: string, options?: { syncUrl?: boolean }) => {
      if (!nextId) return;
      userInteractedRef.current = true;
      setSelectedMemoOnlyId(null);
      setSelectedId(nextId);
      setMemoSaveStatus("idle");
      if (options?.syncUrl ?? true) {
        router.replace(`/broker/w/dealcards?buildingId=${encodeURIComponent(nextId)}&tab=editor`);
      }
    },
    [router]
  );

  const selectUnconvertedMemo = useCallback(
    (memo: UnconvertedMemoItem) => {
      userInteractedRef.current = true;
      setSelectedMemoOnlyId(memo.id);
      setMemoSaveStatus("idle");
      router.replace(`/broker/w/dealcards?memoId=${encodeURIComponent(memo.id)}&tab=editor`);
      setTimeout(() => {
        memoTextareaRef.current?.focus();
      }, 30);
    },
    [router]
  );

  // 마운트 시 1회만 서버 요약 조회 + 미동기화 로컬 초안/인메모리 편집 보존 병합 (DC-02)
  useEffect(() => {
    try {
      const savedMemosRaw = window.localStorage.getItem(UNCONVERTED_MEMO_STORAGE_KEY);
      if (savedMemosRaw) {
        const parsedMemos = JSON.parse(savedMemosRaw);
        if (Array.isArray(parsedMemos)) {
          setUnconvertedMemos(parsedMemos);
        }
      }
    } catch {
      // ignore
    }

    try {
      const savedRaw = window.localStorage.getItem(STORAGE_KEY);
      if (savedRaw) {
        const parsed = JSON.parse(savedRaw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const hydratedLocal = parsed.map((it: BuildingListItem) =>
            it?.card4 ? hydrateItem(it) : it
          );
          itemsRef.current = hydratedLocal;
          setItems(hydratedLocal);
          const initTargetId = initialBuildingIdParamRef.current;
          const initMatch =
            (initTargetId && hydratedLocal.find((it) => it.id === initTargetId)) ||
            hydratedLocal[0];
          if (initMatch && !userInteractedRef.current && !initialMemoIdParamRef.current) {
            setSelectedId(initMatch.id);
            setCurrentCard4(initMatch.card4);
            setSyncedBuildingId(initMatch.id);
          }
        }
      }
    } catch {
      // ignore storage error
    }

    const initQueryId = initialBuildingIdParamRef.current;
    const querySuffix = initQueryId ? `?buildingId=${encodeURIComponent(initQueryId)}` : "";
    fetch(`/api/broker/workspace/summary${querySuffix}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.brokerProfile) {
          setBrokerProfile(data.brokerProfile);
        }
        if (data?.ok && Array.isArray(data.unconvertedMemos)) {
          setUnconvertedMemos((prevLocalMemos) => {
            const srvIds = new Set(
              (data.unconvertedMemos as UnconvertedMemoItem[]).map((m) => m.id)
            );
            const localOnly = prevLocalMemos.filter((m) => !srvIds.has(m.id));
            const mergedMemos = [...(data.unconvertedMemos as UnconvertedMemoItem[]), ...localOnly];
            persistUnconvertedMemos(mergedMemos);
            if (
              initialMemoIdParamRef.current &&
              mergedMemos.some((m) => m.id === initialMemoIdParamRef.current)
            ) {
              setSelectedMemoOnlyId(initialMemoIdParamRef.current);
            }
            return mergedMemos;
          });
        }
        if (data?.ok && Array.isArray(data.dealcards)) {
          const serverIds = new Set<string>();
          for (const rawSrv of data.dealcards as BuildingListItem[]) {
            if (rawSrv?.id) serverIds.add(rawSrv.id);
          }
          if (serverIds.size > 0) {
            setSyncedServerIds((prev) => {
              const next = new Set(prev);
              for (const id of serverIds) next.add(id);
              return next;
            });
          }

          setItems((prev) => {
            const localMap = new Map(prev.map((it) => [it.id, it]));
            const mergedServer: BuildingListItem[] = data.dealcards.map(
              (rawSrv: BuildingListItem) => {
                const srv = rawSrv?.card4 ? hydrateItem(rawSrv) : rawSrv;
                const local = localMap.get(srv.id);
                const effectiveStatus =
                  srv.status === "sent" || local?.status === "sent"
                    ? ("sent" as const)
                    : srv.status;
                if (
                  local &&
                  (userEditedIdsRef.current.has(srv.id) ||
                    (local.card4.card4_version || 1) > (srv.card4.card4_version || 1))
                ) {
                  return {
                    ...srv,
                    ...local,
                    memoText: local.memoText ?? srv.memoText,
                    pairedMemoId: local.pairedMemoId ?? srv.pairedMemoId,
                    generationSource:
                      local.generationSource ??
                      srv.generationSource ??
                      classifyDealCardOriginGroup(srv),
                    status: effectiveStatus,
                  };
                }
                return {
                  ...srv,
                  memoText: srv.memoText ?? local?.memoText,
                  pairedMemoId: srv.pairedMemoId ?? local?.pairedMemoId,
                  generationSource:
                    srv.generationSource ??
                    local?.generationSource ??
                    classifyDealCardOriginGroup(srv),
                  awaitingMemoGeneration: false,
                  status: effectiveStatus,
                };
              }
            );

            const unsyncedLocals = prev.filter(
              (loc) =>
                !serverIds.has(loc.id) &&
                (!INITIAL_IDS.has(loc.id) ||
                  userEditedIdsRef.current.has(loc.id) ||
                  (loc.card4.card4_version || 1) > 1)
            );

            const finalMerged = [...unsyncedLocals, ...mergedServer];
            if (finalMerged.length > 0) {
              itemsRef.current = finalMerged;
              persistItems(finalMerged);
              if (!initialMemoIdParamRef.current) {
                const preferredId = userInteractedRef.current
                  ? resolvedActiveIdRef.current
                  : (initQueryId && finalMerged.some((m) => m.id === initQueryId)
                      ? initQueryId
                      : finalMerged[0]?.id) ?? null;
                const targetItem =
                  (preferredId && finalMerged.find((m) => m.id === preferredId)) ||
                  finalMerged[0];
                if (targetItem) {
                  if (!userInteractedRef.current) {
                    setSelectedId(targetItem.id);
                  }
                  if (!userEditedIdsRef.current.has(targetItem.id)) {
                    setCurrentCard4(targetItem.card4);
                    setSyncedBuildingId(targetItem.id);
                  }
                }
              }
              return finalMerged;
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
  }, [persistItems, persistUnconvertedMemos]);

  // 외부 URL 쿼리(?buildingId=) 변경 동기화 및 존재하지 않는 ID 정규화 (DC-01)
  useEffect(() => {
    if (selectedMemoOnly) return;
    if (!buildingIdParam) {
      lastSyncedQueryIdRef.current = null;
      return;
    }
    if (buildingIdParam === lastSyncedQueryIdRef.current) {
      return;
    }
    const matched = items.find((it) => it.id === buildingIdParam);
    if (matched) {
      lastSyncedQueryIdRef.current = buildingIdParam;
      setSelectedId(matched.id);
      return;
    }
    if (isHydrated) {
      lastSyncedQueryIdRef.current = buildingIdParam;
      const fallback = (userInteractedRef.current ? activeItem : null) ?? items[0];
      if (fallback) {
        setSelectedId(fallback.id);
        router.replace(
          `/broker/w/dealcards?buildingId=${encodeURIComponent(fallback.id)}&tab=editor`
        );
      }
    }
  }, [buildingIdParam, items, activeItem, isHydrated, router, selectedMemoOnly]);

  const performServerSave = useCallback(
    async ({ id, data: payloadCard4 }: { id: string; data: Card4Data }) => {
      if (!id) throw new Error("Missing buildingId");
      const matchedItem = itemsRef.current.find((it) => it.id === id);
      // 아직 메모에서 딜카드 생성을 실행하지 않은 빈 초안은 서버 upsert 생략
      if (
        matchedItem?.awaitingMemoGeneration &&
        !payloadCard4.region?.trim() &&
        !payloadCard4.use?.trim() &&
        !payloadCard4.priceBand?.trim()
      ) {
        return { version: payloadCard4.card4_version ?? 1 };
      }

      const res = await fetch("/api/broker/workspace/summary", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upsert",
          buildingId: id,
          card4: payloadCard4,
          ...(matchedItem?.memoText !== undefined ? { memoText: matchedItem.memoText } : {}),
          ...(matchedItem?.pairedMemoId ? { pairedMemoId: matchedItem.pairedMemoId } : {}),
          ...(matchedItem?.generationSource
            ? { generationSource: matchedItem.generationSource }
            : {}),
        }),
      });
      if (!res.ok) {
        throw new Error(`Save failed (${res.status})`);
      }
      const data = await res.json().catch(() => null);
      markServerSynced(id);
      try {
        const imRaw = window.localStorage.getItem("credeal-w-im-v4");
        if (imRaw) {
          const imParsed = JSON.parse(imRaw);
          if (Array.isArray(imParsed)) {
            const nextIm = imParsed.map((it: Record<string, unknown>) =>
              it.buildingId === id || it.id === id ? { ...it, isDirty: false } : it
            );
            window.localStorage.setItem("credeal-w-im-v4", JSON.stringify(nextIm));
          }
        }
      } catch {
        // ignore storage errors
      }
      return {
        version: data?.card4?.card4_version ?? payloadCard4.card4_version ?? 1,
      };
    },
    [markServerSynced]
  );

  const autosave = useWorkspaceAutosave<Card4Data>({
    id: selectedMemoOnly ? null : resolvedActiveId,
    ready: isHydrated && !activeItem?.awaitingMemoGeneration,
    data: effectiveCard4,
    debounceMs: 900,
    onSave: performServerSave,
  });
  const autosaveRef = useRef(autosave);
  useEffect(() => {
    autosaveRef.current = autosave;
  });

  useEffect(() => {
    if (!resolvedActiveId) return;
    if (syncedBuildingId !== resolvedActiveId) {
      const latest = itemsRef.current.find((it) => it.id === resolvedActiveId);
      if (latest) {
        setCurrentCard4(latest.card4);
        setSyncedBuildingId(latest.id);
      }
    }
  }, [resolvedActiveId, syncedBuildingId]);

  useEffect(() => {
    return () => {
      if (memoSaveTimerRef.current) {
        clearTimeout(memoSaveTimerRef.current);
      }
    };
  }, []);

  // 카드 ID 별 격리된 업데이트 핸들러 — 비동기 AI / 실행 취소 시 타 카드 오염 원천 차단 (DC-03)
  const handleCardChangeFor = useCallback(
    (
      targetId: string,
      updated: Card4Data,
      pairingOverride?: {
        memoText?: string;
        pairedMemoId?: string;
        generationSource?: DealCardGenerationSource;
        awaitingMemoGeneration?: boolean;
      }
    ) => {
      if (!targetId) return;
      userEditedIdsRef.current.add(targetId);
      const existingItem = itemsRef.current.find((it) => it.id === targetId);
      const effectiveGenSource =
        pairingOverride?.generationSource !== undefined
          ? pairingOverride.generationSource
          : existingItem?.generationSource ?? existingItem?.card4?.generationSource;
      const effectivePairedMemoId =
        pairingOverride?.pairedMemoId !== undefined
          ? pairingOverride.pairedMemoId
          : existingItem?.pairedMemoId ?? existingItem?.card4?.pairedMemoId;

      const nextVersion = (updated.card4_version || 1) + 1;
      const withMeta: Card4Data = {
        ...updated,
        generationSource: effectiveGenSource,
        ...(effectivePairedMemoId ? { pairedMemoId: effectivePairedMemoId } : {}),
        card4_version: nextVersion,
      };
      if (!effectiveGenSource) {
        delete withMeta.generationSource;
      }

      if (targetId === resolvedActiveIdRef.current) {
        setCurrentCard4(withMeta);
        setSyncedBuildingId(targetId);
        currentCard4Ref.current = withMeta;
      }

      setItems((prev) => {
        const next = prev.map((it) =>
          it.id === targetId
            ? {
                ...it,
                title: `${withMeta.region} ${withMeta.use}`.trim() || "새 딜카드",
                region: withMeta.region,
                use: withMeta.use,
                priceBand: withMeta.priceBand,
                updatedAt: "방금",
                card4: withMeta,
                ...(pairingOverride?.memoText !== undefined
                  ? { memoText: pairingOverride.memoText }
                  : {}),
                ...(pairingOverride?.pairedMemoId !== undefined
                  ? { pairedMemoId: pairingOverride.pairedMemoId }
                  : {}),
                ...(pairingOverride?.generationSource !== undefined
                  ? { generationSource: pairingOverride.generationSource }
                  : {}),
                awaitingMemoGeneration:
                  pairingOverride?.awaitingMemoGeneration !== undefined
                    ? pairingOverride.awaitingMemoGeneration
                    : false,
              }
            : it
        );
        itemsRef.current = next;
        persistItems(next);
        return next;
      });

      if (targetId !== resolvedActiveIdRef.current) {
        void performServerSave({ id: targetId, data: withMeta }).catch(() => {});
      }
    },
    [persistItems, performServerSave]
  );

  // 최상단 원본 메모 텍스트 변경 — 기존 딜카드의 제목/장점 3줄은 절대 덮어쓰지 않고 메모만 독립 자동저장
  const handleMemoTextChange = useCallback(
    (nextText: string) => {
      if (selectedMemoOnly) {
        setUnconvertedMemos((prev) => {
          const next = prev.map((m) =>
            m.id === selectedMemoOnly.id
              ? { ...m, memoText: nextText, updatedAt: new Date().toISOString() }
              : m
          );
          persistUnconvertedMemos(next);
          return next;
        });
        return;
      }

      const targetId = resolvedActiveIdRef.current;
      if (!targetId) return;
      userEditedIdsRef.current.add(targetId);

      const targetItem = itemsRef.current.find((it) => it.id === targetId);
      const isAwaiting = Boolean(targetItem?.awaitingMemoGeneration);

      setItems((prev) => {
        const next = prev.map((it) =>
          it.id === targetId
            ? {
                ...it,
                memoText: nextText,
                updatedAt: "방금",
              }
            : it
        );
        persistItems(next);
        return next;
      });

      // Stage 2(이미 생성된 딜카드)에서는 메모만 독립 자동저장 (딜카드 문구 덮어쓰기 없음)
      if (!isAwaiting) {
        setMemoSaveStatus("saving");
        if (memoSaveTimerRef.current) {
          clearTimeout(memoSaveTimerRef.current);
        }
        memoSaveTimerRef.current = setTimeout(() => {
          const latestItem = itemsRef.current.find((it) => it.id === targetId);
          void fetch("/api/broker/workspace/summary", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "update_memo_only",
              buildingId: targetId,
              memoText: nextText,
              pairedMemoId: latestItem?.pairedMemoId,
              generationSource: latestItem?.generationSource,
            }),
          })
            .then((res) => (res.ok ? res.json() : null))
            .then((json) => {
              if (json?.pairedMemoId) {
                setItems((prev) => {
                  const next = prev.map((it) =>
                    it.id === targetId ? { ...it, pairedMemoId: String(json.pairedMemoId) } : it
                  );
                  persistItems(next);
                  return next;
                });
              }
              setMemoSaveStatus("saved");
            })
            .catch(() => {
              setMemoSaveStatus("idle");
            });
        }, 700);
      }
    },
    [persistItems, persistUnconvertedMemos, selectedMemoOnly]
  );

  /**
   * 고속 하이브리드 메모→딜카드 생성 엔진:
   * 1) 결정론 슬롯 매퍼(parseMemoIntoCard4)로 권역·용도·면적·가격·초안 3줄 즉시 추출 + 민감정보 마스킹
   * 2) /api/broker/deal-card/ai-copy 로 18자 이내 한 줄 제목 + 장점 3줄 정밀 정제 (실패/오프라인 시 1단계 결과 유지)
   */
  const runHybridMemoGeneration = useCallback(
    async (rawMemoText: string, baseCard4: Card4Data): Promise<Card4Data> => {
      const slotMapped = parseMemoIntoCard4(rawMemoText, baseCard4);
      const structuredFacts = extractMemoStructuredFacts(rawMemoText);

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);
        const res = await fetch("/api/broker/deal-card/ai-copy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            mode: "both",
            posture: slotMapped.posture || "income",
            region: slotMapped.region,
            use: slotMapped.use,
            area: slotMapped.area || "",
            priceBand: slotMapped.priceBand,
            currentHeadline: slotMapped.headline || "",
            currentPoints: slotMapped.points,
            facts: structuredFacts,
          }),
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const aiJson = await res.json().catch(() => null);
          if (aiJson?.ok && aiJson?.result) {
            const factContext = [
              slotMapped.region,
              slotMapped.use,
              slotMapped.area,
              slotMapped.priceBand,
              structuredFacts.memoSummary,
              ...slotMapped.points,
            ]
              .filter(Boolean)
              .join(" ");

            let nextPoints = slotMapped.points;
            if (Array.isArray(aiJson.result.points) && aiJson.result.points.length >= 3) {
              const sanitizedAiPts = aiJson.result.points.slice(0, 3).map((pt: string) => {
                const grounded = stripUngroundedNumbers(String(pt || ""), factContext).cleaned;
                const masked = cleanBlindPoints([grounded])[0] || "";
                return repairDealCardLine(masked);
              });
              nextPoints = repairDealCardPoints(sanitizedAiPts, {
                fillEmpty: true,
                fallbacks: slotMapped.points,
              });
            }

            let nextHeadline = slotMapped.headline;
            if (typeof aiJson.result.headline === "string" && aiJson.result.headline.trim()) {
              const groundedH = stripUngroundedNumbers(
                aiJson.result.headline,
                factContext
              ).cleaned;
              const maskedH = cleanBlindPoints([groundedH])[0] || "";
              const noChipH = stripChipRepetition(maskedH, {
                region: slotMapped.region,
                use: slotMapped.use,
              });
              const repairedH = repairDealCardLine(noChipH);
              if (isCompleteDealCardLine(repairedH)) {
                nextHeadline = repairedH;
              }
            }

            return {
              ...slotMapped,
              headline:
                nextHeadline ||
                deriveDealCardHeadline({
                  posture: slotMapped.posture || "income",
                  points: nextPoints,
                }),
              points: nextPoints,
              generationSource: "ai_memo",
              provenance: {
                points: ["ai", "ai", "ai"],
              },
            };
          }
        }
      } catch {
        // 네트워크/모킹 환경에서는 결정론 슬롯 매퍼 결과를 무중단 그대로 사용
      }

      return slotMapped;
    },
    []
  );

  // [✨ 메모로 딜카드 생성하기] 또는 [↻ 메모 내용으로 딜카드 다시 채우기]
  const handleGenerateFromMemo = useCallback(
    async (explicitMemoOverride?: UnconvertedMemoItem) => {
      const targetMemoOnly = explicitMemoOverride ?? selectedMemoOnly;

      if (targetMemoOnly) {
        const rawText = targetMemoOnly.memoText.trim();
        if (!rawText) return;
        setIsGeneratingFromMemo(true);
        try {
          const generatedCard4 = await runHybridMemoGeneration(rawText, EMPTY_CARD4);
          const newId = `bld-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          const cardWithMeta: Card4Data = {
            ...generatedCard4,
            pairedMemoId: targetMemoOnly.id,
            generationSource: "ai_memo",
            card4_version: 1,
          };
          const newDealCardItem: BuildingListItem = {
            id: newId,
            title: `${cardWithMeta.region} ${cardWithMeta.use}`.trim() || "새 딜카드",
            region: cardWithMeta.region,
            use: cardWithMeta.use,
            priceBand: cardWithMeta.priceBand,
            status: "draft",
            updatedAt: "방금",
            card4: cardWithMeta,
            memoText: rawText,
            pairedMemoId: targetMemoOnly.id,
            generationSource: "ai_memo",
            awaitingMemoGeneration: false,
          };

          userInteractedRef.current = true;
          userEditedIdsRef.current.add(newId);

          setUnconvertedMemos((prev) => {
            const remaining = prev.filter((m) => m.id !== targetMemoOnly.id);
            persistUnconvertedMemos(remaining);
            return remaining;
          });
          setItems((prev) => {
            const next = [newDealCardItem, ...prev];
            persistItems(next);
            return next;
          });
          setSelectedMemoOnlyId(null);
          setSelectedId(newId);
          setCurrentCard4(cardWithMeta);
          setSyncedBuildingId(newId);
          if (originGroupFilter === "unconverted_memo") {
            setOriginGroupFilter("all");
          }

          void fetch("/api/broker/workspace/summary", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "upsert",
              buildingId: newId,
              card4: cardWithMeta,
              memoText: rawText,
              pairedMemoId: targetMemoOnly.id,
              generationSource: "ai_memo",
            }),
          })
            .then((res) => {
              if (res.ok) {
                markServerSynced(newId);
                if (resolvedActiveIdRef.current === newId) {
                  autosaveRef.current.markClean();
                }
              }
            })
            .catch(() => {});

          router.replace(`/broker/w/dealcards?buildingId=${encodeURIComponent(newId)}&tab=editor`);
          showUndoToast({
            message: "메모에서 딜카드를 생성했어요! 아래 항목을 확인하고 다듬어 보세요.",
            variant: "success",
          });
        } finally {
          setIsGeneratingFromMemo(false);
        }
        return;
      }

      const targetId = resolvedActiveIdRef.current;
      if (!targetId) return;
      const targetItem = itemsRef.current.find((it) => it.id === targetId);
      const rawText = (targetItem?.memoText || "").trim();
      if (!rawText) return;

      const wasAwaiting = Boolean(targetItem?.awaitingMemoGeneration);
      const prevCard4Snapshot: Card4Data = {
        ...currentCard4Ref.current,
        points: [...currentCard4Ref.current.points] as [string, string, string],
      };
      const prevGenSource = targetItem?.generationSource;

      setIsGeneratingFromMemo(true);
      try {
        const baseForParse = wasAwaiting ? EMPTY_CARD4 : currentCard4Ref.current;
        const generatedCard4 = await runHybridMemoGeneration(rawText, baseForParse);

        handleCardChangeFor(targetId, generatedCard4, {
          memoText: rawText,
          pairedMemoId: targetItem?.pairedMemoId,
          generationSource: "ai_memo",
          awaitingMemoGeneration: false,
        });
        autosaveRef.current.cancelPending(targetId);

        const syncedCardPayload =
          itemsRef.current.find((it) => it.id === targetId)?.card4 ?? {
            ...generatedCard4,
            generationSource: "ai_memo" as const,
            ...(targetItem?.pairedMemoId ? { pairedMemoId: targetItem.pairedMemoId } : {}),
            card4_version: (prevCard4Snapshot.card4_version || 1) + 1,
          };

        void fetch("/api/broker/workspace/summary", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "upsert",
            buildingId: targetId,
            card4: syncedCardPayload,
            memoText: rawText,
            pairedMemoId: targetItem?.pairedMemoId,
            generationSource: "ai_memo",
          }),
        })
          .then((res) => (res.ok ? res.json() : null))
          .then((json) => {
            if (!json) {
              autosaveRef.current.markDirty(targetId);
              return;
            }
            markServerSynced(targetId);
            if (resolvedActiveIdRef.current === targetId) {
              autosaveRef.current.markClean();
            }
            if (json?.pairedMemoId) {
              setItems((prev) => {
                const next = prev.map((it) =>
                  it.id === targetId ? { ...it, pairedMemoId: String(json.pairedMemoId) } : it
                );
                persistItems(next);
                return next;
              });
            }
          })
          .catch(() => {
            autosaveRef.current.markDirty(targetId);
          });

        if (wasAwaiting) {
          showUndoToast({
            message: "메모에서 딜카드를 생성했어요! 아래 항목을 확인하고 다듬어 보세요.",
            variant: "success",
          });
        } else {
          showUndoToast({
            message: "메모 내용으로 딜카드 항목을 다시 채웠어요",
            variant: "success",
            undoAction: () => {
              handleCardChangeFor(targetId, prevCard4Snapshot, {
                memoText: rawText,
                generationSource: prevGenSource || "ai_memo",
                awaitingMemoGeneration: false,
              });
            },
          });
        }
      } finally {
        setIsGeneratingFromMemo(false);
      }
    },
    [
      handleCardChangeFor,
      markServerSynced,
      originGroupFilter,
      persistItems,
      persistUnconvertedMemos,
      router,
      runHybridMemoGeneration,
      selectedMemoOnly,
      showUndoToast,
    ]
  );

  // [📝 메모만 저장해두기] — 딜카드 생성 없이 '딜카드 미생성 메모' 그룹에 보관
  const handleSaveMemoOnly = useCallback(async () => {
    const rawText = selectedMemoOnly
      ? selectedMemoOnly.memoText.trim()
      : (activeItem?.memoText || "").trim();
    if (!rawText) return;

    const nowIso = new Date().toISOString();
    let memoId =
      selectedMemoOnly?.id || `memo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    try {
      const res = await fetch("/api/broker/workspace/summary", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_memo_only",
          ...(selectedMemoOnly?.id ? { memoId: selectedMemoOnly.id } : {}),
          memoText: rawText,
          routingType: selectedMemoOnly?.routingType || "new_deal",
        }),
      });
      const json = await res.json().catch(() => null);
      if (json?.memo?.id) {
        memoId = String(json.memo.id);
      }
    } catch {
      // 오프라인/로컬 폴백
    }

    const savedMemoObj: UnconvertedMemoItem = {
      id: memoId,
      memoText: rawText,
      routingType: selectedMemoOnly?.routingType || "new_deal",
      createdAt: selectedMemoOnly?.createdAt || nowIso,
      updatedAt: nowIso,
    };

    setUnconvertedMemos((prev) => {
      const exists = prev.some((m) => m.id === memoId);
      const next = exists
        ? prev.map((m) => (m.id === memoId ? savedMemoObj : m))
        : [savedMemoObj, ...prev];
      persistUnconvertedMemos(next);
      return next;
    });

    // 임시로 열려 있던 빈 awaitingMemoGeneration 딜카드 껍데기는 정리
    if (!selectedMemoOnly && activeItem?.awaitingMemoGeneration && itemsRef.current.length > 1) {
      const draftId = activeItem.id;
      setItems((prev) => {
        const remaining = prev.filter((it) => it.id !== draftId);
        persistItems(remaining);
        return remaining;
      });
    }

    setSelectedMemoOnlyId(memoId);
    router.replace(`/broker/w/dealcards?memoId=${encodeURIComponent(memoId)}&tab=editor`);
    showUndoToast({
      message: "메모를 '딜카드 미생성 메모' 그룹에 저장했어요. 언제든 눌러서 생성할 수 있습니다.",
      variant: "success",
    });
  }, [activeItem, persistItems, persistUnconvertedMemos, router, selectedMemoOnly, showUndoToast]);

  // [메모 없이 직접 입력하기] — 빈 Card4 편집 폼 즉시 펼침 (직접 작성 그룹으로 분류)
  const handleSkipMemoManual = useCallback(() => {
    if (selectedMemoOnly) {
      const newId = `bld-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const manualItem: BuildingListItem = {
        id: newId,
        title: "새 딜카드",
        region: "",
        use: "",
        priceBand: "",
        status: "draft",
        updatedAt: "방금",
        card4: { ...EMPTY_CARD4, generationSource: "manual" },
        memoText: selectedMemoOnly.memoText,
        generationSource: "manual",
        awaitingMemoGeneration: false,
      };
      setItems((prev) => {
        const next = [manualItem, ...prev];
        persistItems(next);
        return next;
      });
      setSelectedMemoOnlyId(null);
      setSelectedId(newId);
      setCurrentCard4(manualItem.card4);
      setSyncedBuildingId(newId);
      return;
    }

    const targetId = resolvedActiveIdRef.current;
    if (!targetId) return;
    handleCardChangeFor(
      targetId,
      { ...currentCard4Ref.current, generationSource: "manual" },
      { generationSource: "manual", awaitingMemoGeneration: false }
    );
  }, [handleCardChangeFor, persistItems, selectedMemoOnly]);

  const handleFlushSave = useCallback(async (): Promise<boolean> => {
    const activeId = resolvedActiveIdRef.current;
    if (!activeId) return false;
    const isAlreadySaved =
      syncedServerIds.has(activeId) &&
      !autosave.dirty &&
      autosave.status === "saved";
    if (isAlreadySaved) return true;

    const flushed = await autosave.flush();
    if (flushed) return true;

    try {
      await performServerSave({ id: activeId, data: currentCard4Ref.current });
      return true;
    } catch {
      return false;
    }
  }, [autosave, performServerSave, syncedServerIds]);

  const handleMarkSent = useCallback(() => {
    const activeId = resolvedActiveIdRef.current;
    if (!activeId) return;
    setItems((prev) => {
      const next = prev.map((it) =>
        it.id === activeId ? { ...it, status: "sent" as const, updatedAt: "방금" } : it
      );
      persistItems(next);
      return next;
    });
    void fetch("/api/broker/workspace/summary", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "mark_sent",
        buildingId: activeId,
        card4: currentCard4Ref.current,
      }),
    })
      .then((res) => {
        if (res.ok) markServerSynced(activeId);
      })
      .catch(() => {});
  }, [markServerSynced, persistItems]);

  const handleCreateNew = useCallback(() => {
    const newId = `bld-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newItem: BuildingListItem = {
      id: newId,
      title: "새 딜카드",
      region: "",
      use: "",
      priceBand: "",
      status: "draft",
      updatedAt: "방금",
      card4: { ...EMPTY_CARD4, generationSource: "ai_memo" },
      memoText: "",
      generationSource: "ai_memo",
      awaitingMemoGeneration: true,
    };
    userInteractedRef.current = true;
    setSelectedMemoOnlyId(null);
    setMemoSaveStatus("idle");
    setItems((prev) => {
      const next = [newItem, ...prev];
      persistItems(next);
      return next;
    });
    setSelectedId(newId);
    setCurrentCard4({ ...EMPTY_CARD4, generationSource: "ai_memo" });
    setSyncedBuildingId(newId);
    router.replace(`/broker/w/dealcards?buildingId=${encodeURIComponent(newId)}&tab=editor`);
    setTimeout(() => {
      memoTextareaRef.current?.focus();
    }, 30);
    showUndoToast({
      message: "새 딜카드 메모창을 열었어요. 메모를 적고 [메모로 딜카드 생성하기]를 눌러 보세요.",
      variant: "success",
    });
  }, [persistItems, router, showUndoToast]);

  const handleFillSample = () => {
    const targetId = resolvedActiveId;
    if (!targetId) return;
    const prevSnapshot: Card4Data = {
      ...effectiveCard4,
      points: [...effectiveCard4.points] as [string, string, string],
    };
    const prevMemo = activeItem?.memoText || "";
    const prevAwaiting = Boolean(activeItem?.awaitingMemoGeneration);
    handleCardChangeFor(
      targetId,
      { ...SAMPLE_CARD4 },
      {
        memoText: SAMPLE_MEMO_TEXT,
        generationSource: "ai_memo",
        awaitingMemoGeneration: false,
      }
    );
    showUndoToast({
      message: "예시 메모와 딜카드 내용을 채웠어요",
      undoAction: () =>
        handleCardChangeFor(targetId, prevSnapshot, {
          memoText: prevMemo,
          awaitingMemoGeneration: prevAwaiting,
        }),
    });
  };

  const handleAutoMaskActiveCard = useCallback(() => {
    const targetId = resolvedActiveIdRef.current;
    if (!targetId) return;
    const base = currentCard4Ref.current;
    const prevSnapshot: Card4Data = {
      ...base,
      points: [...base.points] as [string, string, string],
    };
    const cleanedPts = cleanBlindPoints(base.points).map((p) =>
      repairDealCardLine(p)
    ) as [string, string, string];
    const cleanedHeadline = base.headline
      ? repairDealCardLine(cleanBlindPoints([base.headline])[0] ?? "")
      : base.headline;
    let cleanedRegion = cleanBlindPoints([base.region])[0] || base.region;
    const cleanedUse = cleanBlindPoints([base.use])[0] || base.use;
    const cleanedArea = base.area ? cleanBlindPoints([base.area])[0] : base.area;
    const cleanedPriceBand = base.priceBand
      ? cleanBlindPoints([base.priceBand])[0]
      : base.priceBand;

    const recheck = validateBlindPoints(cleanedPts, {
      region: cleanedRegion,
      assetType: cleanedUse,
    });
    if (recheck.requiresDongToGuFallback && recheck.suggestedRegion) {
      cleanedRegion = recheck.suggestedRegion;
    }

    handleCardChangeFor(targetId, {
      ...base,
      region: cleanedRegion,
      use: cleanedUse,
      area: cleanedArea,
      priceBand: cleanedPriceBand,
      ...(cleanedHeadline !== undefined ? { headline: cleanedHeadline } : {}),
      points: cleanedPts,
    });

    showUndoToast({
      message: "위치가 드러나는 표현을 자동으로 가렸어요",
      undoAction: () => handleCardChangeFor(targetId, prevSnapshot),
    });
  }, [handleCardChangeFor, showUndoToast]);

  const handleSelectMemo = useCallback(
    (memoText: string) => {
      const trimmed = memoText.trim();
      if (!trimmed) return;
      if (selectedMemoOnly) {
        handleMemoTextChange(trimmed);
        return;
      }
      const targetId = resolvedActiveIdRef.current;
      if (!targetId) return;
      const targetItem = itemsRef.current.find((it) => it.id === targetId);
      const base = currentCard4Ref.current;
      const prevSnapshot: Card4Data = {
        ...base,
        points: [...base.points] as [string, string, string],
      };
      const prevMemo = targetItem?.memoText || "";
      const prevAwaiting = Boolean(targetItem?.awaitingMemoGeneration);

      const parsedCard4 = parseMemoIntoCard4(trimmed, base);
      handleCardChangeFor(targetId, parsedCard4, {
        memoText: trimmed,
        generationSource: "ai_memo",
        awaitingMemoGeneration: false,
      });
      showUndoToast({
        message: "불러온 메모로 딜카드 항목을 채우고 원본 메모를 연결했어요",
        variant: "success",
        undoAction: () =>
          handleCardChangeFor(targetId, prevSnapshot, {
            memoText: prevMemo,
            awaitingMemoGeneration: prevAwaiting,
          }),
      });
    },
    [handleCardChangeFor, handleMemoTextChange, selectedMemoOnly, showUndoToast]
  );

  useEffect(() => {
    if (isNewParam && !hasHandledNewRef.current) {
      hasHandledNewRef.current = true;
      handleCreateNew();
    }
  }, [isNewParam, handleCreateNew]);

  const handleDuplicateItem = (source: BuildingListItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const newId = `bld-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const cloned: BuildingListItem = {
      ...source,
      id: newId,
      title: `${source.title} (사본)`,
      status: "draft",
      updatedAt: "방금",
      pairedMemoId: undefined,
      awaitingMemoGeneration: false,
      card4: {
        ...source.card4,
        pairedMemoId: undefined,
        headline: source.card4.headline ? repairDealCardLine(source.card4.headline) : "",
        card4_version: 1,
      },
    };
    userInteractedRef.current = true;
    setSelectedMemoOnlyId(null);
    setItems((prev) => {
      const next = [cloned, ...prev];
      persistItems(next);
      return next;
    });
    setSelectedId(newId);
    setCurrentCard4(cloned.card4);
    setSyncedBuildingId(newId);
    void fetch("/api/broker/workspace/summary", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "upsert",
        buildingId: newId,
        card4: cloned.card4,
        memoText: cloned.memoText,
        generationSource: cloned.generationSource,
      }),
    })
      .then((res) => {
        if (res.ok) markServerSynced(newId);
      })
      .catch(() => {});
    router.replace(`/broker/w/dealcards?buildingId=${encodeURIComponent(newId)}&tab=editor`);
    showUndoToast({
      message: `'${source.title}' 딜카드를 복제했어요`,
      variant: "success",
    });
  };

  const handleDeleteItem = (target: BuildingListItem, e: React.MouseEvent) => {
    e.stopPropagation();
    (autosave as { cancelPending?: (k?: string) => void }).cancelPending?.(target.id);
    unmarkServerSynced(target.id);

    const prevSnapshot = [...items];
    const remaining = items.filter((it) => it.id !== target.id);
    const nextList: BuildingListItem[] =
      remaining.length > 0
        ? remaining
        : [
            {
              id: `bld-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              title: "새 딜카드",
              region: "",
              use: "",
              priceBand: "",
              status: "draft",
              updatedAt: "방금",
              card4: { ...EMPTY_CARD4, generationSource: "ai_memo" },
              memoText: "",
              generationSource: "ai_memo",
              awaitingMemoGeneration: true,
            },
          ];
    userInteractedRef.current = true;
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

    if (target.id === resolvedActiveId && nextList[0]) {
      const nextActive = nextList[0];
      setSelectedId(nextActive.id);
      setCurrentCard4(nextActive.card4);
      setSyncedBuildingId(nextActive.id);
      router.replace(
        `/broker/w/dealcards?buildingId=${encodeURIComponent(nextActive.id)}&tab=editor`
      );
    }

    showUndoToast({
      message: `'${target.title}' 딜카드를 삭제했어요`,
      undoAction: () => {
        userInteractedRef.current = true;
        setItems(prevSnapshot);
        persistItems(prevSnapshot);
        setSelectedMemoOnlyId(null);
        setSelectedId(target.id);
        setCurrentCard4(target.card4);
        setSyncedBuildingId(target.id);
        router.replace(
          `/broker/w/dealcards?buildingId=${encodeURIComponent(target.id)}&tab=editor`
        );
        void fetch("/api/broker/workspace/summary", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "restore",
            buildingId: target.id,
            card4: target.card4,
          }),
        })
          .then((res) => {
            if (res.ok) markServerSynced(target.id);
          })
          .catch(() => {});
      },
    });
  };

  const handleDeleteUnconvertedMemo = (memo: UnconvertedMemoItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const prevSnapshot = [...unconvertedMemos];
    const remaining = unconvertedMemos.filter((m) => m.id !== memo.id);
    setUnconvertedMemos(remaining);
    persistUnconvertedMemos(remaining);
    if (selectedMemoOnlyId === memo.id) {
      setSelectedMemoOnlyId(null);
    }

    void fetch("/api/broker/workspace/summary", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "delete_memo",
        memoId: memo.id,
      }),
    }).catch(() => {});

    showUndoToast({
      message: "미생성 메모를 목록에서 숨겼어요",
      undoAction: () => {
        setUnconvertedMemos(prevSnapshot);
        persistUnconvertedMemos(prevSnapshot);
        setSelectedMemoOnlyId(memo.id);
        void fetch("/api/broker/workspace/summary", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "restore_memo",
            memoId: memo.id,
            memoText: memo.memoText,
            routingType: memo.routingType,
          }),
        }).catch(() => {});
      },
    });
  };

  const toggleGroupCollapse = (group: DealCardOriginGroup) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [group]: !prev[group],
    }));
  };

  const normalizedQuery = searchQuery.trim().toLowerCase();

  // 딜카드 필터링 (공개 필드 + 페어링된 비공개 원본 메모 통합 검색!)
  const matchesDealCardPostureTab = useCallback(
    (it: BuildingListItem, filter: "all" | "income" | "owner_value") => {
      const itemPosture = it.card4.posture || "income";
      return (
        filter === "all" ||
        (filter === "income" && itemPosture === "income") ||
        (filter === "owner_value" &&
          (itemPosture === "owner_occupied" || itemPosture === "value_add"))
      );
    },
    []
  );

  const filteredDealCards = items.filter((it) => {
    const searchable = [
      it.title,
      it.region,
      it.use,
      it.priceBand,
      it.card4.region || "",
      it.card4.use || "",
      it.card4.priceBand || "",
      it.card4.headline || "",
      it.card4.points.join(" "),
      it.memoText || "",
    ]
      .join(" ")
      .toLowerCase();
    const matchesQuery = !normalizedQuery || searchable.includes(normalizedQuery);
    return matchesQuery && matchesDealCardPostureTab(it, postureFilter);
  });

  const handleDealCardPostureFilterChange = (
    nextFilter: "all" | "income" | "owner_value"
  ) => {
    setPostureFilter(nextFilter);
    if (nextFilter === "all") return;
    const nextMatches = items.filter((it) => {
      const searchable = [
        it.title,
        it.region,
        it.use,
        it.priceBand,
        it.card4.region || "",
        it.card4.use || "",
        it.card4.priceBand || "",
        it.card4.headline || "",
        it.card4.points.join(" "),
        it.memoText || "",
      ]
        .join(" ")
        .toLowerCase();
      const matchesQuery = !normalizedQuery || searchable.includes(normalizedQuery);
      return matchesQuery && matchesDealCardPostureTab(it, nextFilter);
    });
    if (
      nextMatches.length > 0 &&
      (selectedMemoOnly || !nextMatches.some((it) => it.id === resolvedActiveId))
    ) {
      selectDealCard(nextMatches[0].id);
    }
  };

  const aiMemoDealCards = filteredDealCards.filter(
    (it) => classifyDealCardOriginGroup(it) === "ai_memo"
  );
  const manualDealCards = filteredDealCards.filter(
    (it) => classifyDealCardOriginGroup(it) === "manual"
  );

  // 미생성 메모 필터링 (매수조건/일정은 기본적으로 숨기고 토글 시 표시)
  const hiddenNonDealMemoCount = unconvertedMemos.filter(
    (m) => !isDealCandidateMemo(m.routingType, false)
  ).length;

  const filteredUnconvertedMemos = unconvertedMemos.filter((m) => {
    if (!isDealCandidateMemo(m.routingType, showOtherMemos)) return false;
    if (!normalizedQuery) return true;
    const searchable = `${m.memoText} ${m.routingSummary || ""}`.toLowerCase();
    return searchable.includes(normalizedQuery);
  });

  const totalVisibleCount =
    originGroupFilter === "ai_memo"
      ? aiMemoDealCards.length
      : originGroupFilter === "unconverted_memo"
      ? filteredUnconvertedMemos.length
      : originGroupFilter === "manual"
      ? manualDealCards.length
      : postureFilter !== "all"
      ? filteredDealCards.length
      : filteredDealCards.length + filteredUnconvertedMemos.length;

  const isBlankCard =
    !effectiveCard4.region?.trim() &&
    !effectiveCard4.use?.trim() &&
    !effectiveCard4.priceBand?.trim();

  const isAwaitingMemoGeneration = Boolean(
    selectedMemoOnly || activeItem?.awaitingMemoGeneration
  );

  const activeMemoText = selectedMemoOnly
    ? selectedMemoOnly.memoText
    : activeItem?.memoText || "";

  const activeGenerationSource: DealCardGenerationSource = selectedMemoOnly
    ? "ai_memo"
    : classifyDealCardOriginGroup(activeItem || {});

  const renderDealCardRow = (item: BuildingListItem) => {
    const isSelected = !selectedMemoOnly && item.id === resolvedActiveId;
    const itemPosture = item.card4.posture || "income";
    const postureLabel = POSTURE_LABELS[itemPosture].shortBadge;
    const originGroup = classifyDealCardOriginGroup(item);
    const memoPreview = summarizeMemoOneLine(item.memoText, 34);
    const itemBlind = item.awaitingMemoGeneration
      ? { isValid: true }
      : validateBlindPoints([
          ...item.card4.points,
          item.card4.region || "",
          item.card4.use || "",
          item.card4.area || "",
          item.card4.priceBand || "",
          item.card4.headline || "",
        ]);
    const isCardReady =
      !item.awaitingMemoGeneration &&
      itemBlind.isValid &&
      Boolean(item.card4.region?.trim()) &&
      Boolean(item.card4.use?.trim()) &&
      Boolean(item.card4.area?.trim()) &&
      Boolean(item.card4.priceBand?.trim()) &&
      item.card4.points.some((p) => Boolean(p?.trim()));

    return (
      <div
        key={item.id}
        role="button"
        tabIndex={0}
        aria-current={isSelected ? "true" : undefined}
        data-selected={isSelected ? "true" : "false"}
        data-origin-group={originGroup}
        data-testid={`dealcard-item-${item.id}`}
        onClick={() => {
          selectDealCard(item.id);
        }}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            selectDealCard(item.id);
          }
        }}
        className={`relative min-h-[88px] p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-center ios-glass-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF] ${
          isSelected
            ? "ios-glass-card-active bg-white/95 border-[#007AFF] shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_8px_20px_-4px_rgba(0,122,255,0.14)] ring-2 ring-[#007AFF]/20"
            : "bg-white/82 border-slate-900/[0.075] hover:bg-white/95"
        }`}
      >
        {isSelected && (
          <div className="absolute left-0 top-2.5 bottom-2.5 w-1.5 bg-[#007AFF] rounded-r-full" />
        )}

        {/* Line 1: Title + Status Badge */}
        <div className="flex items-center justify-between gap-2 pl-2">
          <h3
            data-single-line-title="true"
            title={item.card4.headline || item.title}
            className={`text-base break-keep ${
              isSelected ? "font-bold text-[#0040DD]" : "font-bold text-[#1D1D1F]"
            }`}
          >
            {item.awaitingMemoGeneration && !item.region
              ? "새 메모 · 딜카드 작성 중"
              : item.title || "새 딜카드"}
          </h3>
          <span
            data-testid={`dealcard-status-badge-${item.id}`}
            title={
              !itemBlind.isValid
                ? "지번·건물명 등 비공개 식별 정보를 확인해 주세요"
                : item.status === "sent"
                ? "고객에게 카톡·링크로 발송된 딜카드입니다"
                : isCardReady
                ? "필수 항목 입력 완료 — 오른쪽에서 카톡으로 보내면 '보냄'으로 전환됩니다"
                : "권역·용도·면적·가격대와 장점 1개 이상을 입력하면 '준비 완료'가 됩니다"
            }
            className={`text-sm px-2.5 py-0.5 rounded-full font-semibold shrink-0 border ${
              !itemBlind.isValid
                ? "bg-[#FF2D55]/12 text-[#C8102E] border-[#FF2D55]/25"
                : item.status === "sent"
                ? "bg-[#28CD41]/12 text-[#116B22] border-[#28CD41]/25"
                : isCardReady
                ? "bg-[#007AFF]/12 text-[#0040DD] border-[#007AFF]/25"
                : "bg-[#767680]/10 text-[#3A3A3C] border-slate-900/[0.08]"
            }`}
          >
            {!itemBlind.isValid
              ? "⚠ 확인 필요"
              : item.status === "sent"
              ? TERMS.statusSent
              : isCardReady
              ? "준비 완료"
              : TERMS.statusDraft}
          </span>
        </div>

        {/* Paired Private Memo 1-Line Preview */}
        {memoPreview && (
          <p
            data-testid={`dealcard-paired-memo-preview-${item.id}`}
            className="pl-2 mt-1.5 text-sm text-[#515154] bg-slate-100/85 px-2.5 py-1 rounded-lg border border-slate-200/80 break-keep"
          >
            📝 {memoPreview}
          </p>
        )}

        {/* Line 2: Price + Posture + Quick Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 pl-2 mt-2">
          <div className="flex items-center gap-1.5 text-sm text-[#515154] font-medium">
            <span className="font-bold text-[#1D1D1F]">
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
  };

  const renderUnconvertedMemoRow = (memo: UnconvertedMemoItem) => {
    const isSelected = selectedMemoOnly?.id === memo.id;
    const preview = summarizeMemoOneLine(memo.memoText, 46);
    const badgeLabel = ROUTING_TYPE_BADGE[memo.routingType] || "매물 메모";

    return (
      <div
        key={memo.id}
        role="button"
        tabIndex={0}
        aria-current={isSelected ? "true" : undefined}
        data-selected={isSelected ? "true" : "false"}
        data-origin-group="unconverted_memo"
        data-testid={`unconverted-memo-item-${memo.id}`}
        onClick={() => selectUnconvertedMemo(memo)}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            selectUnconvertedMemo(memo);
          }
        }}
        className={`relative min-h-[88px] p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-center ios-glass-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF] ${
          isSelected
            ? "ios-glass-card-active bg-white/95 border-[#007AFF] shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_8px_20px_-4px_rgba(0,122,255,0.14)] ring-2 ring-[#007AFF]/20"
            : "bg-amber-50/45 border-amber-300/70 hover:bg-white/95"
        }`}
      >
        {isSelected && (
          <div className="absolute left-0 top-2.5 bottom-2.5 w-1.5 bg-[#007AFF] rounded-r-full" />
        )}

        <div className="flex items-start justify-between gap-2 pl-2">
          <p className="text-sm font-bold text-[#1D1D1F] break-keep leading-snug">
            📝 {preview || "빈 메모"}
          </p>
          <span className="text-sm px-2 py-0.5 rounded-full font-semibold shrink-0 bg-amber-100 text-amber-900 border border-amber-300">
            미생성
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pl-2 mt-2.5">
          <span className="text-sm text-[#515154] font-medium">{badgeLabel}</span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              data-testid={`unconverted-memo-generate-${memo.id}`}
              onClick={(e) => {
                e.stopPropagation();
                void handleGenerateFromMemo(memo);
              }}
              className="min-h-[36px] text-sm font-bold px-2.5 py-1 rounded-lg bg-[#007AFF] hover:bg-[#0062CC] text-white cursor-pointer"
            >
              ✨ 딜카드 생성
            </button>
            <button
              type="button"
              data-testid={`unconverted-memo-delete-${memo.id}`}
              onClick={(e) => handleDeleteUnconvertedMemo(memo, e)}
              className="min-h-[36px] text-sm font-bold px-2.5 py-1 rounded-lg bg-white hover:bg-red-50 text-slate-600 hover:text-red-700 border border-slate-300 cursor-pointer"
            >
              삭제
            </button>
          </div>
        </div>
      </div>
    );
  };

  /* ── Column 1: ① 고르기 목록 (3대 생성·페어링 그룹핑) ── */
  const listSlot = (
    <div className="space-y-3" data-testid="dealcard-airtable-list">
      {/* Header Summary */}
      <div
        data-theme-lock="dark"
        className="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-2xl bg-[#1D1D1F] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_4px_12px_rgba(15,23,42,0.12)]"
      >
        <span className="text-sm font-semibold text-white">내 딜카드 목록</span>
        <span className="text-sm font-semibold text-[#FFAA00]">
          총 {totalVisibleCount}건
        </span>
      </div>

      {/* Primary Create Button */}
      <button
        type="button"
        onClick={handleCreateNew}
        data-testid="workspace-new-dealcard-btn"
        className="w-full min-h-[52px] rounded-2xl bg-gradient-to-b from-[#1A88FF] to-[#007AFF] hover:brightness-105 text-white font-semibold text-base flex items-center justify-center gap-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_4px_14px_rgba(0,122,255,0.28)] transition-all cursor-pointer"
      >
        <span>＋</span>
        <span>새 딜카드 만들기</span>
      </button>

      {/* Unified Search Input (DealCard + Private Paired Memo) */}
      <div className="relative">
        <label htmlFor="dealcard-search-input" className="sr-only">
          딜카드 및 원본 메모 검색
        </label>
        <input
          id="dealcard-search-input"
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="지역, 용도, 번지·원본 메모로 찾기..."
          className="w-full min-h-[48px] px-3.5 rounded-2xl bg-white/92 border border-slate-900/[0.12] text-base text-[#1D1D1F] placeholder:text-[#6E6E73] focus:outline-none focus:border-[#007AFF] focus:ring-4 focus:ring-[#007AFF]/18 transition-all"
        />
      </div>

      {/* 생성·페어링 그룹 스위처 (전체 / AI생성 / 미생성 메모 / 직접작성) */}
      <div
        role="tablist"
        aria-label="생성 방식 및 메모 그룹별 보기"
        data-testid="dealcard-group-switcher"
        className="grid grid-cols-4 gap-1 p-1 rounded-2xl ios-segmented-track bg-[#767680]/[0.11] border border-white/60"
      >
        {(
          [
            { id: "all", label: "전체" },
            { id: "ai_memo", label: "✨AI생성" },
            { id: "unconverted_memo", label: "📝미생성" },
            { id: "manual", label: "✍️직접" },
          ] as const
        ).map((tab) => {
          const active = originGroupFilter === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`dealcard-group-tab-${tab.id}`}
              onClick={() => setOriginGroupFilter(tab.id)}
              className={`min-h-[42px] px-1.5 py-1 rounded-xl text-sm font-semibold flex items-center justify-center transition-all cursor-pointer ${
                active
                  ? "ios-segmented-pill bg-white text-[#007AFF]"
                  : "text-[#3A3A3C] hover:text-[#1D1D1F]"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* 매물 유형 필터 (iOS Segmented Control — 기존 계약 호환 유지) */}
      <div
        role="tablist"
        aria-label="매물 유형별 보기"
        data-testid="dealcard-posture-switcher"
        className="grid grid-cols-3 gap-1 p-1 rounded-2xl ios-segmented-track bg-[#767680]/[0.11] border border-white/60"
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
              onClick={() => handleDealCardPostureFilterChange(tab.id)}
              className={`min-h-[42px] px-2 py-1 rounded-xl text-sm font-semibold flex items-center justify-center transition-all cursor-pointer ${
                active
                  ? "ios-segmented-pill bg-white text-[#007AFF]"
                  : "text-[#3A3A3C] hover:text-[#1D1D1F]"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Grouped Items List */}
      <div className="space-y-3 pt-1" role="list">
        {totalVisibleCount === 0 && searchQuery.trim() ? (
          <div
            data-testid="dealcard-empty-search"
            className="p-5 rounded-2xl bg-white/92 border border-slate-200 text-center space-y-3"
          >
            <p className="text-sm font-bold text-[#1D1D1F] break-keep">
              &lsquo;{searchQuery.trim()}&rsquo; 검색 결과와 일치하는 메모·딜카드가 없습니다.
            </p>
            <button
              type="button"
              data-testid="dealcard-clear-search-btn"
              onClick={() => setSearchQuery("")}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-sm font-bold transition cursor-pointer"
            >
              검색어 지우기
            </button>
          </div>
        ) : totalVisibleCount === 0 && postureFilter !== "all" ? (
          <div
            data-testid="dealcard-empty-filter"
            className="p-5 rounded-2xl bg-white/92 border border-slate-200 text-center space-y-3"
          >
            <p className="text-sm font-bold text-[#1D1D1F] break-keep">
              선택한 유형의 딜카드가 아직 없습니다.
            </p>
            <button
              type="button"
              onClick={() => setPostureFilter("all")}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-sm font-bold transition cursor-pointer"
            >
              전체 보기
            </button>
          </div>
        ) : (
          <>
            {/* 그룹 1: ✨ AI 메모 생성 딜카드 */}
            {(originGroupFilter === "all" || originGroupFilter === "ai_memo") && (
              <div
                data-testid="dealcard-group-section-ai_memo"
                className="space-y-2"
              >
                <button
                  type="button"
                  onClick={() => toggleGroupCollapse("ai_memo")}
                  aria-expanded={!collapsedGroups.ai_memo}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-blue-50/80 hover:bg-blue-100/70 text-[#0040DD] text-sm font-bold transition cursor-pointer"
                >
                  <span>✨ AI 메모 생성 딜카드 ({aiMemoDealCards.length}건)</span>
                  <span>{collapsedGroups.ai_memo ? "▸" : "▾"}</span>
                </button>
                {!collapsedGroups.ai_memo &&
                  (aiMemoDealCards.length > 0 ? (
                    <div className="space-y-2.5">
                      {aiMemoDealCards.map((item) => renderDealCardRow(item))}
                    </div>
                  ) : (
                    originGroupFilter === "ai_memo" && (
                      <p className="px-3 py-4 rounded-2xl bg-white/80 border border-slate-200 text-sm text-[#515154] text-center break-keep">
                        상단 메모창에 매물 메모를 적고 [✨ 메모로 딜카드 생성하기]를 누르면 이곳에 표시됩니다.
                      </p>
                    )
                  ))}
              </div>
            )}

            {/* 그룹 2: 📝 딜카드 미생성 메모 */}
            {(originGroupFilter === "all" || originGroupFilter === "unconverted_memo") && (
              <div
                data-testid="dealcard-group-section-unconverted_memo"
                className="space-y-2"
              >
                <button
                  type="button"
                  onClick={() => toggleGroupCollapse("unconverted_memo")}
                  aria-expanded={!collapsedGroups.unconverted_memo}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100/70 text-amber-950 text-sm font-bold transition cursor-pointer"
                >
                  <span>📝 딜카드 미생성 메모 ({filteredUnconvertedMemos.length}건)</span>
                  <span>{collapsedGroups.unconverted_memo ? "▸" : "▾"}</span>
                </button>
                {!collapsedGroups.unconverted_memo && (
                  <div className="space-y-2">
                    {filteredUnconvertedMemos.length > 0 ? (
                      filteredUnconvertedMemos.map((memo) => renderUnconvertedMemoRow(memo))
                    ) : (
                      <p className="px-3 py-3 rounded-2xl bg-white/75 border border-slate-200/80 text-sm text-[#515154] text-center break-keep">
                        아직 딜카드로 변환하지 않고 보관 중인 매물 메모가 없습니다.
                      </p>
                    )}

                    {hiddenNonDealMemoCount > 0 && (
                      <button
                        type="button"
                        data-testid="toggle-other-memos-btn"
                        onClick={() => setShowOtherMemos((prev) => !prev)}
                        className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold transition cursor-pointer"
                      >
                        {showOtherMemos
                          ? "매수 조건·일정 메모 숨기기"
                          : `매수 조건·일정 메모 ${hiddenNonDealMemoCount}건 함께 보기`}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 그룹 3: ✍️ 직접 작성 딜카드 */}
            {(originGroupFilter === "all" || originGroupFilter === "manual") &&
              (originGroupFilter === "manual" || manualDealCards.length > 0) && (
                <div
                  data-testid="dealcard-group-section-manual"
                  className="space-y-2"
                >
                  <button
                    type="button"
                    onClick={() => toggleGroupCollapse("manual")}
                    aria-expanded={!collapsedGroups.manual}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200/80 text-[#1D1D1F] text-sm font-bold transition cursor-pointer"
                  >
                    <span>✍️ 직접 작성 딜카드 ({manualDealCards.length}건)</span>
                    <span>{collapsedGroups.manual ? "▸" : "▾"}</span>
                  </button>
                  {!collapsedGroups.manual &&
                    (manualDealCards.length > 0 ? (
                      <div className="space-y-2.5">
                        {manualDealCards.map((item) => renderDealCardRow(item))}
                      </div>
                    ) : (
                      <p className="px-3 py-4 rounded-2xl bg-white/80 border border-slate-200 text-sm text-[#515154] text-center break-keep">
                        메모 없이 직접 입력한 딜카드가 아직 없습니다.
                      </p>
                    ))}
                </div>
              )}
          </>
        )}
      </div>
    </div>
  );

  /* ── Column 2: ② 채우기 (최상단 메모 우선 + 점진적 노출 에디터) ── */
  const isSampleCard =
    !selectedMemoOnly &&
    resolvedActiveId === "bld-01" &&
    !isBlankCard &&
    (effectiveCard4.region?.includes("양평동") || activeItem?.title?.includes("양평동"));

  const editorTargetId = resolvedActiveId || "";

  const editorSlot = (
    <div className="space-y-4">
      {isSampleCard && (
        <div
          data-testid="dealcard-sample-banner"
          className="p-3.5 rounded-2xl bg-amber-50 border border-amber-300 flex flex-wrap items-center justify-between gap-3"
        >
          <p className="text-sm font-bold text-amber-950">
            💡 현재 예시 딜카드(영등포구 양평동)가 열려 있습니다. 새 매물을 작성하려면 오른쪽 버튼을 눌러 메모부터 시작하세요.
          </p>
          <button
            type="button"
            data-testid="dealcard-sample-reset-btn"
            data-theme-lock="dark"
            onClick={handleCreateNew}
            className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-amber-900 hover:bg-amber-950 text-white text-sm font-extrabold transition cursor-pointer shrink-0"
          >
            새 빈 딜카드로 시작하기
          </button>
        </div>
      )}

      {/* 최상단 고정: 원본 매물 메모 입력 & 1:1 상시 페어링 패널 */}
      <PairedMemoTopCard
        mode={isAwaitingMemoGeneration ? "capture" : "paired"}
        memoText={activeMemoText}
        onMemoTextChange={handleMemoTextChange}
        onGenerateFromMemo={() => {
          void handleGenerateFromMemo();
        }}
        onSaveMemoOnly={() => {
          void handleSaveMemoOnly();
        }}
        onSkipMemoManual={handleSkipMemoManual}
        onOpenMemoImportModal={() => setIsMemoModalOpen(true)}
        isGenerating={isGeneratingFromMemo}
        memoSaveStatus={memoSaveStatus}
        generationSource={activeGenerationSource}
        textareaRef={memoTextareaRef}
      />

      {/* Stage 1 대기 안내 카드 (메모 입력 후 [메모로 딜카드 생성하기] 전까지 표시) */}
      {isAwaitingMemoGeneration ? (
        <div
          data-testid="dealcard-awaiting-memo-guide"
          className="p-5 rounded-2xl bg-white/92 border border-dashed border-slate-300 flex flex-wrap items-center justify-between gap-3"
        >
          <div className="space-y-1">
            <p className="text-base font-extrabold text-[#1D1D1F] break-keep">
              위 메모창에 매물 메모를 적고 [✨ 메모로 딜카드 생성하기]를 눌러 주세요
            </p>
            <p className="text-sm text-[#515154] break-keep">
              번지·상호는 자동으로 가려지고 ① 매물 유형 · ② 카톡 썸네일 · ③ 장점 3줄이 채워져 아래에 열립니다.
            </p>
          </div>
          {!selectedMemoOnly && (
            <button
              type="button"
              data-testid="dealcard-fill-sample-btn"
              onClick={handleFillSample}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 text-sm font-extrabold transition cursor-pointer shrink-0"
            >
              예시 채우기
            </button>
          )}
        </div>
      ) : (
        /* Stage 2 보조 액션 바: IM 편집 연동 & 빈 양식일 때 예시 채우기 */
        <div
          data-testid="dealcard-editor-toolbar"
          className="px-3.5 py-2.5 rounded-2xl bg-white border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-2.5"
        >
          <span className="text-sm font-bold text-[#3A3A3C]">
            아래 블라인드 딜카드 항목을 확인하고 다듬어 주세요
          </span>

          <div className="flex flex-wrap items-center gap-2">
            {isBlankCard && (
              <button
                type="button"
                data-testid="dealcard-fill-sample-btn"
                onClick={handleFillSample}
                className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-sm font-bold transition cursor-pointer"
              >
                예시 채우기
              </button>
            )}

            {activeItem && (
              <a
                href={`/broker/w/im?buildingId=${encodeURIComponent(activeItem.id)}`}
                data-testid="dealcard-open-im-link"
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
                    return;
                  }
                  e.preventDefault();
                  void handleFlushSave();
                  router.push(`/broker/w/im?buildingId=${encodeURIComponent(activeItem.id)}`);
                }}
                className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 text-sm font-extrabold transition cursor-pointer inline-flex items-center gap-1.5"
              >
                <span>📊 이 매물로 IM 편집 →</span>
              </a>
            )}
          </div>
        </div>
      )}

      {/* Stage 2: 파싱·생성 완료 후(또는 직접 입력 선택 시) 펼쳐지는 세부 편집 폼 */}
      <div
        data-testid="dealcard-card4-stage"
        data-collapsed={isAwaitingMemoGeneration ? "true" : "false"}
        aria-hidden={isAwaitingMemoGeneration ? "true" : undefined}
        className={isAwaitingMemoGeneration ? "hidden" : "space-y-4"}
      >
        <Card4ConfirmCard
          key={editorTargetId || "memo-only"}
          card4={effectiveCard4}
          onChange={(next) => handleCardChangeFor(editorTargetId, next)}
        />
      </div>
    </div>
  );

  /* ── Column 3: ③ 확인하고 보내기 (원본 메모는 절대 노출되지 않는 고객 화면 미리보기) ── */
  const previewSlot = (
    <div className="space-y-4">
      <KakaoBubblePreview
        card4={effectiveCard4}
        dealId={resolvedActiveId || ""}
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
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        if (selectedMemoOnly) {
          showUndoToast({
            message: "먼저 [✨ 메모로 딜카드 생성하기]를 눌러 딜카드를 생성해 주세요.",
          });
          return;
        }
        setIsPreSendOpen(true);
      }}
      data-testid="workspace-primary-send-btn"
      className="w-full min-h-[56px] rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-extrabold text-lg flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
    >
      <span>{TERMS.sendKakao}</span>
    </button>
  );

  const isActiveSavedOnServer = Boolean(
    resolvedActiveId &&
      syncedServerIds.has(resolvedActiveId) &&
      !autosave.dirty &&
      autosave.status === "saved"
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
          void handleFlushSave();
        }}
        selectedBuildingId={resolvedActiveId || ""}
        selectedLabel={
          selectedMemoOnly
            ? "미생성 매물 메모"
            : activeItem?.title || "새 딜카드"
        }
      />
      <PreSendConfirmationSheet
        isOpen={isPreSendOpen}
        onClose={() => setIsPreSendOpen(false)}
        card4={effectiveCard4}
        dealId={resolvedActiveId || ""}
        isSaved={isActiveSavedOnServer}
        onFlushSave={handleFlushSave}
        onAutoMask={handleAutoMaskActiveCard}
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
      <MemoImportModal
        isOpen={isMemoModalOpen}
        onClose={() => setIsMemoModalOpen(false)}
        onSelectMemo={handleSelectMemo}
      />
    </>
  );
}

export default function DealCardsWorkspacePage() {
  return (
    <UndoToastProvider>
      <Suspense
        fallback={
          <div className="flex items-center justify-center h-screen bg-[#F5F5F7] text-[#3A3A3C] font-semibold text-lg">
            딜카드 작업공간을 불러오는 중...
          </div>
        }
      >
        <DealCardsWorkspaceInner />
      </Suspense>
    </UndoToastProvider>
  );
}
