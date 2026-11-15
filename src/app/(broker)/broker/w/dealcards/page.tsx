"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import {
  useEditorPreviewSync,
  type PreviewLifecycleState,
} from "@/components/workspace/preview-sync/useEditorPreviewSync";
import { PreSendConfirmationSheet } from "@/components/broker/deal-card/PreSendConfirmationSheet";
import { MemoImportModal } from "@/components/broker/deal-card/MemoImportModal";
import type { Card4Data, DealCardGenerationSource } from "@/lib/deal-card/card4-schema";
import {
  classifyDealCardOriginGroup,
  isDealCandidateMemo,
  parseMemoIntoCard4,
  type DealCardOriginGroup,
  type UnconvertedMemoItem,
} from "@/lib/deal-card/memo-pairing";
import { cleanBlindPoints, validateBlindPoints } from "@/lib/deal-card/blind-guard";
import { ConfirmDeleteModal } from "@/components/workspace/ConfirmDeleteModal";
import { useListViewMode } from "@/components/workspace/list/useListViewMode";
import { repairDealCardLine } from "@/lib/deal-card/copy-limits";
import { UndoToastProvider, useUndoToast } from "@/components/workspace/UndoConfirmToast";
import { useWorkspaceAutosave } from "@/lib/hooks/useWorkspaceAutosave";
import { TERMS } from "@/lib/ux/lexicon";
import {
  extractWorkspaceResponseUserId,
  getLastActiveBrokerUserId,
  normalizeWorkspaceUserId,
  purgeWorkspaceClientStorage,
  readScopedWorkspaceJson,
  resolveBrowserBrokerUserId,
  syncActiveBrokerSessionStorage,
  writeScopedWorkspaceJson,
} from "@/lib/workspace/storage-namespace";
import {
  DEALCARDS_STORAGE_KEY,
  DEALCARD_PREVIEW_UNITS,
  EMPTY_CARD4,
  INITIAL_BUILDINGS,
  INITIAL_IDS,
  SAMPLE_CARD4,
  SAMPLE_MEMO_TEXT,
  UNCONVERTED_MEMO_STORAGE_KEY,
  hydrateItem,
  isSampleDealCardItem,
  runHybridMemoGenerationApi,
  type BrokerProfileSummary,
  type BuildingListItem,
  type DealCardPendingDeleteTarget,
  type ScopedUnconvertedMemoItem,
} from "./_components/dealcards-types";
import { DealCardListColumn } from "./_components/DealCardListColumn";
import { DealCardEditorColumn } from "./_components/DealCardEditorColumn";
import { DealCardPreviewColumn } from "./_components/DealCardPreviewColumn";

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
  const [unconvertedMemos, setUnconvertedMemos] = useState<ScopedUnconvertedMemoItem[]>([]);
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
  const [viewMode, setViewMode] = useListViewMode();
  const [collapsedGroups, setCollapsedGroups] = useState<Record<DealCardOriginGroup, boolean>>({
    ai_memo: false,
    unconverted_memo: false,
    manual: false,
  });

  const [isGeneratingFromMemo, setIsGeneratingFromMemo] = useState(false);
  const [memoSaveStatus, setMemoSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [isPreSendOpen, setIsPreSendOpen] = useState(false);
  const [isMemoModalOpen, setIsMemoModalOpen] = useState(false);
  const [dirtySentIds, setDirtySentIds] = useState<Set<string>>(() => new Set());
  const [pendingDeleteModal, setPendingDeleteModal] =
    useState<DealCardPendingDeleteTarget | null>(null);

  const memoTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const memoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasHandledNewRef = useRef(false);
  const initialBuildingIdParamRef = useRef<string | null>(buildingIdParam);
  const initialMemoIdParamRef = useRef<string | null>(memoIdParam);
  const lastSyncedQueryIdRef = useRef<string | null>(null);
  const userInteractedRef = useRef<boolean>(false);
  const userEditedIdsRef = useRef<Set<string>>(new Set());
  const currentUserIdRef = useRef<string | null>(getLastActiveBrokerUserId());
  const hydratedUserIdRef = useRef<string | null>(currentUserIdRef.current);
  const itemsRef = useRef<BuildingListItem[]>(items);
  itemsRef.current = items;

  const persistItems = useCallback(
    (nextItems: BuildingListItem[], explicitUserId?: string | null) => {
      const uid = normalizeWorkspaceUserId(
        explicitUserId !== undefined ? explicitUserId : currentUserIdRef.current
      );
      const stamped = uid
        ? nextItems.map((it) => (it.ownerUserId ? it : { ...it, ownerUserId: uid }))
        : nextItems;
      writeScopedWorkspaceJson(DEALCARDS_STORAGE_KEY, uid, stamped);
    },
    []
  );

  const persistUnconvertedMemos = useCallback(
    (nextMemos: ScopedUnconvertedMemoItem[], explicitUserId?: string | null) => {
      const uid = normalizeWorkspaceUserId(
        explicitUserId !== undefined ? explicitUserId : currentUserIdRef.current
      );
      const stamped = uid
        ? nextMemos.map((m) => (m.ownerUserId ? m : { ...m, ownerUserId: uid }))
        : nextMemos;
      writeScopedWorkspaceJson(UNCONVERTED_MEMO_STORAGE_KEY, uid, stamped);
    },
    []
  );

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

  const selectedMemoOnly = useMemo(() => {
    if (!selectedMemoOnlyId) return null;
    return unconvertedMemos.find((m) => m.id === selectedMemoOnlyId) ?? null;
  }, [unconvertedMemos, selectedMemoOnlyId]);

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

  useEffect(() => {
    const initialUid = currentUserIdRef.current;
    hydratedUserIdRef.current = initialUid;

    try {
      const parsedMemos = readScopedWorkspaceJson<ScopedUnconvertedMemoItem[]>(
        UNCONVERTED_MEMO_STORAGE_KEY,
        initialUid,
        []
      );
      if (Array.isArray(parsedMemos) && parsedMemos.length > 0) {
        const ownedMemos = parsedMemos.filter(
          (m) => !(m?.ownerUserId && initialUid && m.ownerUserId !== initialUid)
        );
        if (ownedMemos.length > 0) {
          setUnconvertedMemos(ownedMemos);
        }
      }
    } catch {
      // ignore
    }

    try {
      const parsed = readScopedWorkspaceJson<BuildingListItem[]>(
        DEALCARDS_STORAGE_KEY,
        initialUid,
        []
      );
      if (Array.isArray(parsed) && parsed.length > 0) {
        const ownedLocal = parsed.filter(
          (it) => !(it?.ownerUserId && initialUid && it.ownerUserId !== initialUid)
        );
        if (ownedLocal.length > 0) {
          const hydratedLocal = ownedLocal.map((it: BuildingListItem) =>
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
    Promise.all([
      resolveBrowserBrokerUserId(),
      fetch(`/api/broker/workspace/summary${querySuffix}`)
        .then(async (res) => {
          if (res.status === 401 || res.status === 403) {
            return { __unauthorized: true } as const;
          }
          return res.ok ? await res.json() : null;
        })
        .catch(() => null),
    ])
      .then(([authUid, data]) => {
        if (data && "__unauthorized" in data && data.__unauthorized) {
          purgeWorkspaceClientStorage();
          currentUserIdRef.current = null;
          hydratedUserIdRef.current = null;
          userEditedIdsRef.current.clear();
          setUnconvertedMemos([]);
          itemsRef.current = INITIAL_BUILDINGS;
          setItems(INITIAL_BUILDINGS);
          if (INITIAL_BUILDINGS[0]) {
            setSelectedId(INITIAL_BUILDINGS[0].id);
            setCurrentCard4(INITIAL_BUILDINGS[0].card4);
            setSyncedBuildingId(INITIAL_BUILDINGS[0].id);
          }
          return;
        }

        const resolvedUid =
          extractWorkspaceResponseUserId(data) ??
          authUid ??
          currentUserIdRef.current;

        let switchedAccount = false;
        const uidChangedSinceHydration = resolvedUid !== initialUid;
        if (resolvedUid) {
          const syncRes = syncActiveBrokerSessionStorage(resolvedUid);
          switchedAccount =
            syncRes.switched ||
            Boolean(hydratedUserIdRef.current && hydratedUserIdRef.current !== resolvedUid);
          currentUserIdRef.current = resolvedUid;
          hydratedUserIdRef.current = resolvedUid;
          if (switchedAccount) {
            userEditedIdsRef.current.clear();
            userInteractedRef.current = false;
          }
        }

        const scopedMemosForResolvedUser =
          switchedAccount || uidChangedSinceHydration
            ? readScopedWorkspaceJson<ScopedUnconvertedMemoItem[]>(
                UNCONVERTED_MEMO_STORAGE_KEY,
                resolvedUid,
                []
              ).filter(
                (m) => !(m?.ownerUserId && resolvedUid && m.ownerUserId !== resolvedUid)
              )
            : null;

        const scopedItemsForResolvedUser =
          switchedAccount || uidChangedSinceHydration
            ? readScopedWorkspaceJson<BuildingListItem[]>(
                DEALCARDS_STORAGE_KEY,
                resolvedUid,
                []
              ).filter(
                (it) => !(it?.ownerUserId && resolvedUid && it.ownerUserId !== resolvedUid)
              )
            : null;

        if (data?.brokerProfile) {
          setBrokerProfile(data.brokerProfile);
        }
        if (data?.ok && Array.isArray(data.unconvertedMemos)) {
          setUnconvertedMemos((prevLocalMemos) => {
            const baseLocalMemos =
              scopedMemosForResolvedUser !== null
                ? scopedMemosForResolvedUser
                : prevLocalMemos;
            const srvMemos: ScopedUnconvertedMemoItem[] = (
              data.unconvertedMemos as UnconvertedMemoItem[]
            ).map((m) => (resolvedUid ? { ...m, ownerUserId: resolvedUid } : m));
            const srvIds = new Set(srvMemos.map((m) => m.id));
            const localOnly = baseLocalMemos.filter(
              (m) =>
                !srvIds.has(m.id) &&
                !(m.ownerUserId && resolvedUid && m.ownerUserId !== resolvedUid)
            );
            const mergedMemos = [...srvMemos, ...localOnly];
            persistUnconvertedMemos(mergedMemos, resolvedUid);
            if (
              initialMemoIdParamRef.current &&
              mergedMemos.some((m) => m.id === initialMemoIdParamRef.current)
            ) {
              setSelectedMemoOnlyId(initialMemoIdParamRef.current);
            }
            return mergedMemos;
          });
        } else if (scopedMemosForResolvedUser !== null) {
          setUnconvertedMemos(scopedMemosForResolvedUser);
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
            const rawLocalBase =
              scopedItemsForResolvedUser !== null
                ? scopedItemsForResolvedUser.map((it) =>
                    it?.card4 ? hydrateItem(it) : it
                  )
                : prev;
            const safePrev = rawLocalBase.filter(
              (loc) => !(loc.ownerUserId && resolvedUid && loc.ownerUserId !== resolvedUid)
            );
            const localMap = new Map(safePrev.map((it) => [it.id, it]));
            const mergedServer: BuildingListItem[] = data.dealcards.map(
              (rawSrv: BuildingListItem) => {
                const srvHydrated = rawSrv?.card4 ? hydrateItem(rawSrv) : rawSrv;
                const srv = resolvedUid
                  ? { ...srvHydrated, ownerUserId: resolvedUid }
                  : srvHydrated;
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
                    ...(resolvedUid ? { ownerUserId: resolvedUid } : {}),
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

            const unsyncedLocals = safePrev.filter(
              (loc) =>
                !(loc.ownerUserId && resolvedUid && loc.ownerUserId !== resolvedUid) &&
                !serverIds.has(loc.id) &&
                (!INITIAL_IDS.has(loc.id) ||
                  userEditedIdsRef.current.has(loc.id) ||
                  (loc.card4.card4_version || 1) > 1)
            );

            const finalMerged = [...unsyncedLocals, ...mergedServer];
            if (finalMerged.length > 0) {
              itemsRef.current = finalMerged;
              persistItems(finalMerged, resolvedUid);
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

            if (
              switchedAccount ||
              prev.some(
                (loc) => Boolean(loc.ownerUserId && resolvedUid && loc.ownerUserId !== resolvedUid)
              )
            ) {
              itemsRef.current = INITIAL_BUILDINGS;
              if (INITIAL_BUILDINGS[0]) {
                setSelectedId(INITIAL_BUILDINGS[0].id);
                setCurrentCard4(INITIAL_BUILDINGS[0].card4);
                setSyncedBuildingId(INITIAL_BUILDINGS[0].id);
              }
              return INITIAL_BUILDINGS;
            }

            return safePrev.length > 0 ? safePrev : INITIAL_BUILDINGS;
          });
        } else if (scopedItemsForResolvedUser !== null) {
          const hydratedScoped = scopedItemsForResolvedUser.map((it) =>
            it?.card4 ? hydrateItem(it) : it
          );
          const nextItems =
            hydratedScoped.length > 0 ? hydratedScoped : INITIAL_BUILDINGS;
          itemsRef.current = nextItems;
          setItems(nextItems);
          if (nextItems[0] && !userInteractedRef.current) {
            setSelectedId(nextItems[0].id);
            setCurrentCard4(nextItems[0].card4);
            setSyncedBuildingId(nextItems[0].id);
          }
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
        const activeUid = currentUserIdRef.current;
        const imParsed = readScopedWorkspaceJson<Record<string, unknown>[]>(
          "credeal-w-im-v4",
          activeUid,
          []
        );
        if (Array.isArray(imParsed) && imParsed.length > 0) {
          const nextIm = imParsed.map((it) =>
            it.buildingId === id || it.id === id ? { ...it, isDirty: false } : it
          );
          writeScopedWorkspaceJson("credeal-w-im-v4", activeUid, nextIm);
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
      if (existingItem?.status === "sent") {
        setDirtySentIds((prev) => {
          if (prev.has(targetId)) return prev;
          const next = new Set(prev);
          next.add(targetId);
          return next;
        });
      }
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
        const activeUid = currentUserIdRef.current;
        const next = prev.map((it) =>
          it.id === targetId
            ? {
                ...it,
                ...(activeUid ? { ownerUserId: activeUid } : {}),
                title: `${withMeta.region} ${withMeta.use}`.trim() || "새 딜카드",
                region: withMeta.region,
                use: withMeta.use,
                priceBand: withMeta.priceBand,
                updatedAt: new Date().toISOString(),
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
        persistItems(next, activeUid);
        return next;
      });

      if (targetId !== resolvedActiveIdRef.current) {
        void performServerSave({ id: targetId, data: withMeta }).catch(() => {});
      }
    },
    [persistItems, performServerSave]
  );

  const handleMemoTextChange = useCallback(
    (nextText: string) => {
      const activeUid = currentUserIdRef.current;
      if (selectedMemoOnly) {
        setUnconvertedMemos((prev) => {
          const next = prev.map((m) =>
            m.id === selectedMemoOnly.id
              ? {
                  ...m,
                  ...(activeUid ? { ownerUserId: activeUid } : {}),
                  memoText: nextText,
                  updatedAt: new Date().toISOString(),
                }
              : m
          );
          persistUnconvertedMemos(next, activeUid);
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
                ...(activeUid ? { ownerUserId: activeUid } : {}),
                memoText: nextText,
                updatedAt: new Date().toISOString(),
              }
            : it
        );
        itemsRef.current = next;
        persistItems(next, activeUid);
        return next;
      });

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

  const handleGenerateFromMemo = useCallback(
    async (explicitMemoOverride?: UnconvertedMemoItem) => {
      const targetMemoOnly = explicitMemoOverride ?? selectedMemoOnly;

      if (targetMemoOnly) {
        const rawText = targetMemoOnly.memoText.trim();
        if (!rawText) return;
        setIsGeneratingFromMemo(true);
        try {
          const generatedCard4 = await runHybridMemoGenerationApi(rawText, EMPTY_CARD4);
          const newId = `bld-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          const cardWithMeta: Card4Data = {
            ...generatedCard4,
            pairedMemoId: targetMemoOnly.id,
            generationSource: "ai_memo",
            card4_version: 1,
          };
          const activeUid = currentUserIdRef.current;
          const newDealCardItem: BuildingListItem = {
            id: newId,
            ...(activeUid ? { ownerUserId: activeUid } : {}),
            title: `${cardWithMeta.region} ${cardWithMeta.use}`.trim() || "새 딜카드",
            region: cardWithMeta.region,
            use: cardWithMeta.use,
            priceBand: cardWithMeta.priceBand,
            status: "draft",
            updatedAt: new Date().toISOString(),
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
        const generatedCard4 = await runHybridMemoGenerationApi(rawText, baseForParse);

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
      selectedMemoOnly,
      showUndoToast,
    ]
  );

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

    const activeUid = currentUserIdRef.current;
    const savedMemoObj: ScopedUnconvertedMemoItem = {
      id: memoId,
      ...(activeUid ? { ownerUserId: activeUid } : {}),
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

  const handleSkipMemoManual = useCallback(() => {
    const activeUid = currentUserIdRef.current;
    if (selectedMemoOnly) {
      const newId = `bld-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const manualItem: BuildingListItem = {
        id: newId,
        ...(activeUid ? { ownerUserId: activeUid } : {}),
        title: "새 딜카드",
        region: "",
        use: "",
        priceBand: "",
        status: "draft",
        updatedAt: new Date().toISOString(),
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
    setDirtySentIds((prev) => {
      if (!prev.has(activeId)) return prev;
      const next = new Set(prev);
      next.delete(activeId);
      return next;
    });
    setItems((prev) => {
      const next = prev.map((it) =>
        it.id === activeId
          ? { ...it, status: "sent" as const, updatedAt: new Date().toISOString() }
          : it
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

  const {
    activeUnitId: activeDealCardUnitId,
    focusEditorUnit: focusDealCardEditorUnit,
    notifyEditorFocus: notifyDealCardEditorFocus,
  } = useEditorPreviewSync({
    units: DEALCARD_PREVIEW_UNITS,
    onSelectTab: () => {
      if (typeof window !== "undefined" && window.innerWidth < 1280 && resolvedActiveIdRef.current) {
        router.replace(
          `/broker/w/dealcards?buildingId=${encodeURIComponent(resolvedActiveIdRef.current)}&tab=editor`
        );
      }
    },
  });

  const handleActivatePreviewUnit = useCallback(
    (unitId: string) => {
      if (unitId === "dc-unit-broker") {
        void handleFlushSave().then(() => {
          router.push("/broker/profile");
        });
        return;
      }
      const awaiting = Boolean(selectedMemoOnly || activeItem?.awaitingMemoGeneration);
      if (awaiting) {
        handleSkipMemoManual();
        setTimeout(() => {
          focusDealCardEditorUnit(unitId);
        }, 40);
        return;
      }
      focusDealCardEditorUnit(unitId);
    },
    [
      activeItem?.awaitingMemoGeneration,
      focusDealCardEditorUnit,
      handleFlushSave,
      handleSkipMemoManual,
      router,
      selectedMemoOnly,
    ]
  );

  const handleResyncSentDealCard = useCallback(async () => {
    const ok = await handleFlushSave();
    handleMarkSent();
    showUndoToast({
      message: ok
        ? "수정한 내용을 고객 링크 화면에도 바로 반영했어요"
        : "저장 후 반영할 내용을 정리했어요",
      variant: "success",
    });
  }, [handleFlushSave, handleMarkSent, showUndoToast]);

  const handleCreateNew = useCallback(() => {
    const activeUid = currentUserIdRef.current;
    const newId = `bld-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newItem: BuildingListItem = {
      id: newId,
      ...(activeUid ? { ownerUserId: activeUid } : {}),
      title: "새 딜카드",
      region: "",
      use: "",
      priceBand: "",
      status: "draft",
      updatedAt: new Date().toISOString(),
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
    const activeUid = currentUserIdRef.current;
    const newId = `bld-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const cloned: BuildingListItem = {
      ...source,
      id: newId,
      ...(activeUid ? { ownerUserId: activeUid } : {}),
      title: `${source.title} (사본)`,
      status: "draft",
      updatedAt: new Date().toISOString(),
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

  const executeDeleteItem = (target: BuildingListItem) => {
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
              updatedAt: new Date().toISOString(),
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

  const handleDeleteItem = (target: BuildingListItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setPendingDeleteModal({ kind: "dealcard", target });
  };

  const executeDeleteUnconvertedMemo = (memo: UnconvertedMemoItem) => {
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

  const handleDeleteUnconvertedMemo = (memo: UnconvertedMemoItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setPendingDeleteModal({ kind: "memo", target: memo });
  };

  const toggleGroupCollapse = (group: DealCardOriginGroup) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [group]: !prev[group],
    }));
  };

  const normalizedQuery = searchQuery.trim().toLowerCase();

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

  const isSampleCard =
    !selectedMemoOnly &&
    !isBlankCard &&
    isSampleDealCardItem(activeItem, syncedServerIds);

  const editorTargetId = resolvedActiveId || "";

  const hasAnyPreviewContent = Boolean(
    effectiveCard4.region?.trim() ||
      effectiveCard4.use?.trim() ||
      effectiveCard4.area?.trim() ||
      effectiveCard4.priceBand?.trim() ||
      effectiveCard4.headline?.trim() ||
      effectiveCard4.points.some((p) => Boolean(p?.trim()))
  );

  const isDealCardPreGeneration = Boolean(
    isAwaitingMemoGeneration && !hasAnyPreviewContent
  );

  const isSentDirty = Boolean(
    resolvedActiveId &&
      activeItem?.status === "sent" &&
      dirtySentIds.has(resolvedActiveId)
  );

  const dealCardPreviewLifecycle: PreviewLifecycleState = isDealCardPreGeneration
    ? "pre_generation"
    : activeItem?.status === "sent"
    ? isSentDirty
      ? "published_dirty"
      : "published_clean"
    : "live_draft";

  const dealCardLiveUrl =
    resolvedActiveId && activeItem?.status === "sent"
      ? `/dc/${encodeURIComponent(resolvedActiveId)}`
      : null;

  const listSlot = (
    <DealCardListColumn
      totalVisibleCount={totalVisibleCount}
      searchQuery={searchQuery}
      viewMode={viewMode}
      originGroupFilter={originGroupFilter}
      postureFilter={postureFilter}
      collapsedGroups={collapsedGroups}
      showOtherMemos={showOtherMemos}
      hiddenNonDealMemoCount={hiddenNonDealMemoCount}
      aiMemoDealCards={aiMemoDealCards}
      manualDealCards={manualDealCards}
      filteredDealCards={filteredDealCards}
      filteredUnconvertedMemos={filteredUnconvertedMemos}
      resolvedActiveId={resolvedActiveId}
      selectedMemoOnly={selectedMemoOnly}
      syncedServerIds={syncedServerIds}
      onCreateNew={handleCreateNew}
      onSearchChange={setSearchQuery}
      onViewModeChange={setViewMode}
      onOriginGroupFilterChange={setOriginGroupFilter}
      onPostureFilterChange={handleDealCardPostureFilterChange}
      onToggleGroupCollapse={toggleGroupCollapse}
      onToggleShowOtherMemos={() => setShowOtherMemos((prev) => !prev)}
      onSelectDealCard={(id) => selectDealCard(id)}
      onSelectUnconvertedMemo={selectUnconvertedMemo}
      onDuplicateItem={handleDuplicateItem}
      onDeleteItem={handleDeleteItem}
      onGenerateFromMemo={(memo) => {
        void handleGenerateFromMemo(memo);
      }}
      onDeleteUnconvertedMemo={handleDeleteUnconvertedMemo}
    />
  );

  const editorSlot = (
    <DealCardEditorColumn
      viewMode={viewMode}
      selectedMemoOnly={selectedMemoOnly}
      activeItem={activeItem}
      isSampleCard={isSampleCard}
      isBlankCard={isBlankCard}
      isAwaitingMemoGeneration={isAwaitingMemoGeneration}
      activeMemoText={activeMemoText}
      isGeneratingFromMemo={isGeneratingFromMemo}
      memoSaveStatus={memoSaveStatus}
      activeGenerationSource={activeGenerationSource}
      memoTextareaRef={memoTextareaRef}
      editorTargetId={editorTargetId}
      effectiveCard4={effectiveCard4}
      onCreateNew={handleCreateNew}
      onFillSample={handleFillSample}
      onMemoTextChange={handleMemoTextChange}
      onGenerateFromMemo={() => {
        void handleGenerateFromMemo();
      }}
      onSaveMemoOnly={() => {
        void handleSaveMemoOnly();
      }}
      onSkipMemoManual={handleSkipMemoManual}
      onOpenMemoImportModal={() => setIsMemoModalOpen(true)}
      onCardChange={(targetId, next) => handleCardChangeFor(targetId, next)}
      onFocusEditorUnit={notifyDealCardEditorFocus}
      onDuplicateItem={handleDuplicateItem}
      onDeleteItem={handleDeleteItem}
      onDeleteUnconvertedMemo={handleDeleteUnconvertedMemo}
      onOpenImForBuilding={(buildingId) => {
        void handleFlushSave();
        router.push(`/broker/w/im?buildingId=${encodeURIComponent(buildingId)}`);
      }}
    />
  );

  const previewSlot = (
    <DealCardPreviewColumn
      lifecycle={dealCardPreviewLifecycle}
      liveUrl={dealCardLiveUrl}
      isPreGeneration={isDealCardPreGeneration}
      effectiveCard4={effectiveCard4}
      dealId={resolvedActiveId || ""}
      brokerProfile={brokerProfile}
      activeUnitId={activeDealCardUnitId}
      selectedMemoOnly={selectedMemoOnly}
      onStartInput={() => memoTextareaRef.current?.focus()}
      onResyncPublished={() => {
        void handleResyncSentDealCard();
      }}
      onSkipMemoManual={handleSkipMemoManual}
      onFillSample={handleFillSample}
      onActivateUnit={handleActivatePreviewUnit}
    />
  );

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
      <ConfirmDeleteModal
        isOpen={pendingDeleteModal !== null}
        title={
          pendingDeleteModal?.kind === "dealcard"
            ? `'${pendingDeleteModal.target.title || "새 딜카드"}'을(를) 삭제할까요?`
            : "이 매물 메모를 삭제할까요?"
        }
        onCancel={() => setPendingDeleteModal(null)}
        onConfirm={() => {
          if (!pendingDeleteModal) return;
          if (pendingDeleteModal.kind === "dealcard") {
            executeDeleteItem(pendingDeleteModal.target);
          } else {
            executeDeleteUnconvertedMemo(pendingDeleteModal.target);
          }
          setPendingDeleteModal(null);
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
