"use client";

import { useEffect } from "react";
import { generateFloorScaffolding } from "@/components/workspace/RentRollGrid";
import {
  extractWorkspaceResponseUserId,
  normalizeWorkspaceUserId,
  purgeWorkspaceClientStorage,
  readScopedWorkspaceJson,
  resolveBrowserBrokerUserId,
  syncActiveBrokerSessionStorage,
} from "@/lib/workspace/storage-namespace";
import {
  IM_STORAGE_KEY,
  INITIAL_IM_IDS,
  INITIAL_IM_LIST,
  SAMPLE_SEED_IDS,
  UUID_REGEX,
  buildImItemFromDealCardRecord,
  cleanBrokerPlaceholder,
  createBlankImItem,
  formatPhoneHyphen,
  resolveKnownTestAssetUrl,
  type ImListItem,
  type ImPhotoEntry,
} from "../_components/im-workspace-types";

export function tryBuildImItemFromDealCardCache(
  targetId: string,
  userId?: string | null
): ImListItem | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const uid = normalizeWorkspaceUserId(userId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed = readScopedWorkspaceJson<any[]>(
      "credeal-w-dealcards-v5",
      uid,
      []
    );
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const found = parsed.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (dc: any) =>
        dc &&
        !(dc.ownerUserId && uid && dc.ownerUserId !== uid) &&
        (dc.id === targetId || dc.buildingId === targetId)
    );
    if (!found) return null;
    const built = buildImItemFromDealCardRecord(found);
    if (!built) return null;
    return uid ? { ...built, ownerUserId: uid } : built;
  } catch {
    return null;
  }
}

export interface UseImServerHydrationOptions {
  buildingIdParam: string | null;
  isFreshParam?: boolean;
  initialFreshStarterItem?: ImListItem | null;
  initialHydrationDoneRef: React.MutableRefObject<boolean>;
  currentUserIdRef: React.MutableRefObject<string | null>;
  hydratedUserIdRef: React.MutableRefObject<string | null>;
  userInteractedRef: React.MutableRefObject<boolean>;
  selectedIdRef: React.MutableRefObject<string>;
  itemsRef: React.MutableRefObject<ImListItem[]>;
  lastAppliedQueryIdRef: React.MutableRefObject<string | null>;
  pendingUrlBuildingIdRef: React.MutableRefObject<string | null>;
  brokerSectionTouchedRef: React.MutableRefObject<boolean>;
  profileDefaultsRef: React.MutableRefObject<{
    brokerName: string;
    brokerageName: string;
    brokerPhone: string;
  }>;
  setItems: React.Dispatch<React.SetStateAction<ImListItem[]>>;
  setSelectedId: React.Dispatch<React.SetStateAction<string>>;
  setIsHydrated: React.Dispatch<React.SetStateAction<boolean>>;
  setBrokerName: React.Dispatch<React.SetStateAction<string>>;
  setBrokerageName: React.Dispatch<React.SetStateAction<string>>;
  setBrokerPhone: React.Dispatch<React.SetStateAction<string>>;
  setIsBrokerSectionOpen: React.Dispatch<React.SetStateAction<boolean>>;
  applyItemToFormState: (item: ImListItem) => void;
  persistImItems: (next: ImListItem[], explicitUserId?: string | null) => void;
}

export function useImServerHydration({
  buildingIdParam,
  isFreshParam = false,
  initialFreshStarterItem = null,
  initialHydrationDoneRef,
  currentUserIdRef,
  hydratedUserIdRef,
  userInteractedRef,
  selectedIdRef,
  itemsRef,
  lastAppliedQueryIdRef,
  pendingUrlBuildingIdRef,
  brokerSectionTouchedRef,
  profileDefaultsRef,
  setItems,
  setSelectedId,
  setIsHydrated,
  setBrokerName,
  setBrokerageName,
  setBrokerPhone,
  setIsBrokerSectionOpen,
  applyItemToFormState,
  persistImItems,
}: UseImServerHydrationOptions) {
  useEffect(() => {
    fetch("/api/broker/profile")
      .then((res) => {
        if (res.status === 401 || res.status === 403) {
          purgeWorkspaceClientStorage();
          currentUserIdRef.current = null;
          hydratedUserIdRef.current = null;
          return null;
        }
        return res.ok ? res.json() : null;
      })
      .then((json) => {
        const p = json?.data;
        if (!p) return;
        const profileUid = normalizeWorkspaceUserId(
          p.id || p.user_id || p.broker?.user_id || p.broker?.id
        );
        let switchedByProfile = false;
        if (profileUid) {
          const syncRes = syncActiveBrokerSessionStorage(profileUid);
          switchedByProfile =
            syncRes.switched ||
            Boolean(
              hydratedUserIdRef.current &&
                hydratedUserIdRef.current !== profileUid
            );
          currentUserIdRef.current = profileUid;
          hydratedUserIdRef.current = profileUid;
        }
        const pName = cleanBrokerPlaceholder(
          p.display_name || p.broker?.name || ""
        );
        const pCompany = cleanBrokerPlaceholder(p.company || "");
        const pPhone = formatPhoneHyphen(cleanBrokerPlaceholder(p.phone || ""));
        profileDefaultsRef.current = {
          brokerName: pName,
          brokerageName: pCompany,
          brokerPhone: pPhone,
        };
        setBrokerName((prev) => cleanBrokerPlaceholder(prev) || pName);
        setBrokerageName((prev) => cleanBrokerPlaceholder(prev) || pCompany);
        setBrokerPhone((prev) => cleanBrokerPlaceholder(prev) || pPhone);
        if (!brokerSectionTouchedRef.current && (pName.trim() || pPhone.trim())) {
          setIsBrokerSectionOpen(false);
        }
        setItems((prev) => {
          const activeUid = profileUid || currentUserIdRef.current;
          const basePrev =
            switchedByProfile && profileUid
              ? readScopedWorkspaceJson<ImListItem[]>(
                  IM_STORAGE_KEY,
                  profileUid,
                  []
                ).filter(
                  (it) => !(it?.ownerUserId && it.ownerUserId !== profileUid)
                )
              : prev.filter(
                  (it) =>
                    !(it?.ownerUserId && activeUid && it.ownerUserId !== activeUid)
                );
          const rawSourceList = basePrev.length > 0 ? basePrev : INITIAL_IM_LIST;
          const sourceList =
            isFreshParam &&
            initialFreshStarterItem &&
            !rawSourceList.some((it) => it.id === initialFreshStarterItem.id)
              ? [initialFreshStarterItem, ...rawSourceList]
              : rawSourceList;
          const next = sourceList.map((it) => ({
            ...it,
            ...(profileUid ? { ownerUserId: profileUid } : {}),
            brokerName: cleanBrokerPlaceholder(it.brokerName) || pName,
            brokerageName: cleanBrokerPlaceholder(it.brokerageName) || pCompany,
            brokerPhone: cleanBrokerPlaceholder(it.brokerPhone) || pPhone,
          }));
          persistImItems(next, activeUid);
          if (switchedByProfile && next[0] && !userInteractedRef.current) {
            selectedIdRef.current = next[0].id;
            setSelectedId(next[0].id);
            applyItemToFormState(next[0]);
          }
          return next;
        });
      })
      .catch(() => {
        // Non-blocking fallback
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistImItems, applyItemToFormState]);

  useEffect(() => {
    if (initialHydrationDoneRef.current) return;
    initialHydrationDoneRef.current = true;

    const initialUid = currentUserIdRef.current;
    hydratedUserIdRef.current = initialUid;
    const initialQueryId = buildingIdParam;
    let initialTargetId: string | null = null;
    const freshStarterItem: ImListItem | null = isFreshParam
      ? (initialFreshStarterItem ??
          createBlankImItem({
            ownerUserId: initialUid,
            brokerName: profileDefaultsRef.current.brokerName,
            brokerageName: profileDefaultsRef.current.brokerageName,
            brokerPhone: profileDefaultsRef.current.brokerPhone,
          }))
      : null;
    try {
      const rawParsed = readScopedWorkspaceJson<ImListItem[]>(
        IM_STORAGE_KEY,
        initialUid,
        []
      );
      const parsed: ImListItem[] = Array.isArray(rawParsed)
        ? rawParsed.filter(
            (i) => !(i?.ownerUserId && initialUid && i.ownerUserId !== initialUid)
          )
        : [];
      if (freshStarterItem) {
        const workingList = [
          freshStarterItem,
          ...parsed.filter((p) => p.id !== freshStarterItem.id),
        ];
        itemsRef.current = workingList;
        setItems(workingList);
        initialTargetId = freshStarterItem.id;
        selectedIdRef.current = freshStarterItem.id;
        setSelectedId(freshStarterItem.id);
        applyItemToFormState(freshStarterItem);
      } else if (parsed.length > 0) {
        const explicitMatch = initialQueryId
          ? parsed.find(
              (i: ImListItem) =>
                i.id === initialQueryId || i.buildingId === initialQueryId
            )
          : undefined;
        const fromDcCache =
          !explicitMatch && initialQueryId
            ? tryBuildImItemFromDealCardCache(initialQueryId, initialUid)
            : null;
        const workingList = fromDcCache ? [fromDcCache, ...parsed] : parsed;
        itemsRef.current = workingList;
        setItems(workingList);
        const match = fromDcCache || explicitMatch || workingList[0];
        if (match) {
          initialTargetId = match.id;
          if ((explicitMatch || fromDcCache) && initialQueryId) {
            lastAppliedQueryIdRef.current = initialQueryId;
          }
          selectedIdRef.current = match.id;
          setSelectedId(match.id);
          applyItemToFormState(match);
        }
      } else if (initialQueryId) {
        const fromDcCache = tryBuildImItemFromDealCardCache(
          initialQueryId,
          initialUid
        );
        if (fromDcCache) {
          itemsRef.current = [fromDcCache];
          setItems([fromDcCache]);
          initialTargetId = fromDcCache.id;
          lastAppliedQueryIdRef.current = initialQueryId;
          selectedIdRef.current = fromDcCache.id;
          setSelectedId(fromDcCache.id);
          applyItemToFormState(fromDcCache);
        }
      }
    } catch {
      // ignore
    }

    const suffix = initialQueryId
      ? `?buildingId=${encodeURIComponent(initialQueryId)}`
      : "";
    Promise.all([
      resolveBrowserBrokerUserId(),
      fetch(`/api/broker/workspace/summary${suffix}`)
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
          userInteractedRef.current = false;
          itemsRef.current = INITIAL_IM_LIST;
          setItems(INITIAL_IM_LIST);
          if (INITIAL_IM_LIST[0]) {
            selectedIdRef.current = INITIAL_IM_LIST[0].id;
            setSelectedId(INITIAL_IM_LIST[0].id);
            applyItemToFormState(INITIAL_IM_LIST[0]);
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
            Boolean(
              hydratedUserIdRef.current &&
                hydratedUserIdRef.current !== resolvedUid
            );
          currentUserIdRef.current = resolvedUid;
          hydratedUserIdRef.current = resolvedUid;
          if (switchedAccount) {
            userInteractedRef.current = false;
            initialTargetId = null;
          }
        }

        const scopedLocalForResolvedUser =
          switchedAccount || uidChangedSinceHydration
            ? readScopedWorkspaceJson<ImListItem[]>(
                IM_STORAGE_KEY,
                resolvedUid,
                []
              ).filter(
                (it) =>
                  !(it?.ownerUserId && resolvedUid && it.ownerUserId !== resolvedUid)
              )
            : null;

        const hasServerArray =
          Boolean(data?.ok) &&
          (Array.isArray(data?.ims) || Array.isArray(data?.imList));
        const serverList =
          Array.isArray(data?.ims) && data.ims.length > 0
            ? data.ims
            : Array.isArray(data?.imList) && data.imList.length > 0
            ? data.imList
            : null;

        if (
          data?.ok &&
          (serverList ||
            (hasServerArray && (switchedAccount || uidChangedSinceHydration)))
        ) {
          const effectiveServerList: ImListItem[] = serverList || [];
          setItems((prev) => {
            const rawLocalBase =
              scopedLocalForResolvedUser !== null
                ? scopedLocalForResolvedUser
                : prev;
            const safePrev = rawLocalBase.filter(
              (loc) =>
                !(loc.ownerUserId && resolvedUid && loc.ownerUserId !== resolvedUid)
            );
            const localMap = new Map(safePrev.map((it) => [it.id, it]));
            const localBldMap = new Map(safePrev.map((it) => [it.buildingId, it]));
            const srvItems: ImListItem[] = effectiveServerList.map(
              (srv: ImListItem) => {
                const local =
                  localMap.get(srv.id) || localBldMap.get(srv.buildingId);
                const hasLocalEdits = Boolean(
                  local?.isDirty || local?.hasUnpublishedEdits
                );
                const resolvedAxiosHighlights = hasLocalEdits
                  ? local?.axiosHighlights
                  : Array.isArray(srv.axiosHighlights) &&
                    srv.axiosHighlights.length > 0
                  ? srv.axiosHighlights
                  : local?.axiosHighlights;
                const resolvedHandoverNote = hasLocalEdits
                  ? local?.handoverNote
                  : srv.handoverNote || local?.handoverNote;
                const baseRentRoll =
                  hasLocalEdits &&
                  Array.isArray(local?.rentRoll) &&
                  local.rentRoll.length > 0
                    ? local.rentRoll
                    : Array.isArray(srv.rentRoll) && srv.rentRoll.length > 0
                    ? srv.rentRoll
                    : generateFloorScaffolding(3, 1);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const cleanedRentRoll = baseRentRoll.map((r: any, idx: number) => {
                  const srvRow = (
                    Array.isArray(srv.rentRoll) ? srv.rentRoll[idx] : undefined
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  ) as any;
                  let cleanUse = String(r.use || "");
                  const slashParts = cleanUse.split(/\s*\/\s*/).filter(Boolean);
                  if (slashParts.length === 2 && slashParts[0] === slashParts[1]) {
                    cleanUse = slashParts[0];
                  }
                  const rawArea = Number(r.areaSqm ?? r.area_sqm ?? 0);
                  const srvArea = Number(srvRow?.areaSqm ?? srvRow?.area_sqm ?? 0);
                  const nextArea =
                    rawArea > 0 && Math.abs(rawArea - 2.45) > 0.05
                      ? rawArea
                      : srvArea > 0 && Math.abs(srvArea - 2.45) > 0.05
                      ? srvArea
                      : undefined;
                  return {
                    ...r,
                    use: cleanUse,
                    ...(nextArea ? { areaSqm: nextArea } : {}),
                  };
                });
                const mergedPhotos: ImPhotoEntry[] | undefined =
                  local?.photos && local.photos.length > 0
                    ? local.photos.map((lp, idx) => {
                        const srvMatch =
                          srv.photos?.find(
                            (sp) => sp.name && sp.name === lp.name
                          ) || srv.photos?.[idx];
                        const bestUrl =
                          resolveKnownTestAssetUrl(lp.url) ||
                          resolveKnownTestAssetUrl(lp.name) ||
                          (lp.url && !lp.url.startsWith("data:")
                            ? lp.url
                            : undefined) ||
                          srvMatch?.url ||
                          lp.dataUrl;
                        const bestPreview =
                          lp.dataUrl ||
                          bestUrl ||
                          lp.previewUrl ||
                          srvMatch?.previewUrl;
                        return {
                          ...srvMatch,
                          ...lp,
                          ...(bestUrl ? { url: bestUrl } : {}),
                          ...(bestPreview ? { previewUrl: bestPreview } : {}),
                        };
                      })
                    : srv.photos;

                return {
                  ...srv,
                  ...(hasLocalEdits ? local : {}),
                  ...(resolvedUid ? { ownerUserId: resolvedUid } : {}),
                  id: srv.id,
                  buildingId: srv.buildingId || local?.buildingId || srv.id,
                  ...(srv.documentId || local?.documentId
                    ? { documentId: srv.documentId || local?.documentId }
                    : {}),
                  axiosHighlights: resolvedAxiosHighlights,
                  handoverNote: resolvedHandoverNote,
                  brokerExtrasForm:
                    local?.brokerExtrasForm || srv.brokerExtrasForm,
                  photoNames: local?.photoNames?.length
                    ? local.photoNames
                    : srv.photoNames,
                  photos: mergedPhotos,
                  rentRoll: cleanedRentRoll,
                  ...(local?.hasUnpublishedEdits || srv.hasUnpublishedEdits
                    ? { hasUnpublishedEdits: true }
                    : {}),
                };
              }
            );
            const normalizeDedupeKey = (
              it: Pick<ImListItem, "address" | "title">
            ) => {
              const a = (it.address || "")
                .replace(/\s+/g, " ")
                .trim()
                .toLowerCase();
              const t = (it.title || "")
                .replace(/\s+/g, " ")
                .trim()
                .toLowerCase();
              if (!a || !t || t === "새 im") return "";
              return `${a}::${t}`;
            };
            const srvAddressTitleKeys = new Set(
              srvItems.map((s) => normalizeDedupeKey(s)).filter(Boolean)
            );
            const localOnlyItems: ImListItem[] = [];
            for (const loc of safePrev) {
              if (loc.ownerUserId && resolvedUid && loc.ownerUserId !== resolvedUid) {
                continue;
              }
              const isExplicitlyRequested =
                Boolean(initialQueryId) &&
                (loc.id === initialQueryId || loc.buildingId === initialQueryId);
              const isCurrentlySelectedByUser =
                userInteractedRef.current &&
                (loc.id === selectedIdRef.current ||
                  loc.buildingId === selectedIdRef.current);
              const isUserCreatedOrEdited =
                !INITIAL_IM_IDS.has(loc.id) || Boolean(loc.isDirty);
              const locKey = normalizeDedupeKey(loc);
              const hasSameServerDeal =
                Boolean(locKey) &&
                !loc.isDirty &&
                !isExplicitlyRequested &&
                !isCurrentlySelectedByUser &&
                srvAddressTitleKeys.has(locKey);
              if (
                !hasSameServerDeal &&
                (isUserCreatedOrEdited ||
                  isExplicitlyRequested ||
                  isCurrentlySelectedByUser) &&
                !srvItems.some(
                  (s) => s.id === loc.id || s.buildingId === loc.buildingId
                )
              ) {
                localOnlyItems.push(
                  resolvedUid ? { ...loc, ownerUserId: resolvedUid } : loc
                );
              }
            }
            const candidateRank = (it: ImListItem): number => {
              const matchesQuery = Boolean(
                initialQueryId && (it.id === initialQueryId || it.buildingId === initialQueryId)
              );
              const isPublished = it.status === "published";
              const hasUuidBld = Boolean(it.buildingId && UUID_REGEX.test(it.buildingId));
              return (matchesQuery ? 4 : 0) + (isPublished ? 2 : 0) + (hasUuidBld ? 1 : 0);
            };
            const prioritizedCandidates = [...localOnlyItems, ...srvItems].sort(
              (a, b) => candidateRank(b) - candidateRank(a)
            );
            const seenBldIds = new Set<string>();
            const seenAddrTitleKeys = new Set<string>();
            const merged = prioritizedCandidates.filter((it) => {
              const isExplicitTarget = Boolean(
                initialQueryId && (it.id === initialQueryId || it.buildingId === initialQueryId)
              );
              if (it.buildingId && UUID_REGEX.test(it.buildingId)) {
                if (!isExplicitTarget && seenBldIds.has(it.buildingId)) return false;
                seenBldIds.add(it.buildingId);
              }
              const key = normalizeDedupeKey(it);
              if (key && !it.title.includes("(사본)")) {
                if (!isExplicitTarget && seenAddrTitleKeys.has(key)) return false;
                seenAddrTitleKeys.add(key);
              }
              return true;
            });

            const explicitSrvMatch = initialQueryId
              ? merged.find(
                  (i) => i.id === initialQueryId || i.buildingId === initialQueryId
                )
              : undefined;
            const serverDcMatch =
              !explicitSrvMatch && initialQueryId && Array.isArray(data?.dealcards)
                ? data.dealcards.find(
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (dc: any) =>
                      dc &&
                      (dc.id === initialQueryId || dc.buildingId === initialQueryId)
                  )
                : null;
            const builtSrvItem = serverDcMatch
              ? buildImItemFromDealCardRecord(serverDcMatch)
              : null;
            const synthesizedSrvItem = builtSrvItem
              ? resolvedUid
                ? { ...builtSrvItem, ownerUserId: resolvedUid }
                : builtSrvItem
              : null;
            const finalMerged = synthesizedSrvItem
              ? [synthesizedSrvItem, ...merged]
              : merged;
            if (finalMerged.length > 0) {
              persistImItems(finalMerged, resolvedUid);
            }

            const resolvedList =
              finalMerged.length > 0
                ? finalMerged
                : INITIAL_IM_LIST.map((it) => ({
                    ...it,
                    ...(resolvedUid ? { ownerUserId: resolvedUid } : {}),
                    brokerName:
                      cleanBrokerPlaceholder(it.brokerName) ||
                      profileDefaultsRef.current.brokerName,
                    brokerageName:
                      cleanBrokerPlaceholder(it.brokerageName) ||
                      profileDefaultsRef.current.brokerageName,
                    brokerPhone:
                      cleanBrokerPlaceholder(it.brokerPhone) ||
                      profileDefaultsRef.current.brokerPhone,
                  }));
            itemsRef.current = freshStarterItem && !resolvedList.some((r) => r.id === freshStarterItem.id)
              ? [freshStarterItem, ...resolvedList]
              : resolvedList;

            const activeResolvedList = itemsRef.current;
            if (!userInteractedRef.current) {
              const isInitialTargetSample = Boolean(
                initialTargetId && SAMPLE_SEED_IDS.has(initialTargetId)
              );
              const firstServerUserDraft = srvItems.find(
                (i) =>
                  !SAMPLE_SEED_IDS.has(i.id || "") &&
                  !SAMPLE_SEED_IDS.has(i.buildingId || "")
              );
              const initialTargetMatch =
                initialTargetId && (!isInitialTargetSample || !firstServerUserDraft)
                  ? activeResolvedList.find(
                      (i) => i.id === initialTargetId || i.buildingId === initialTargetId
                    )
                  : undefined;
              const targetMatch =
                freshStarterItem ||
                synthesizedSrvItem ||
                explicitSrvMatch ||
                (!initialQueryId && isInitialTargetSample ? firstServerUserDraft : undefined) ||
                initialTargetMatch ||
                (!initialQueryId ? firstServerUserDraft : undefined) ||
                activeResolvedList[0];
              if (targetMatch) {
                if ((synthesizedSrvItem || explicitSrvMatch) && initialQueryId) {
                  lastAppliedQueryIdRef.current = initialQueryId;
                }
                selectedIdRef.current = targetMatch.id;
                setSelectedId(targetMatch.id);
                applyItemToFormState(targetMatch);
              }
            } else if (!activeResolvedList.some((i) => i.id === selectedIdRef.current)) {
              const prevSelectedBldId = safePrev.find(
                (p) => p.id === selectedIdRef.current
              )?.buildingId;
              const remapped =
                (prevSelectedBldId &&
                  resolvedList.find(
                    (i) =>
                      i.id === prevSelectedBldId ||
                      i.buildingId === prevSelectedBldId
                  )) ||
                (pendingUrlBuildingIdRef.current &&
                  resolvedList.find(
                    (i) =>
                      i.id === pendingUrlBuildingIdRef.current ||
                      i.buildingId === pendingUrlBuildingIdRef.current
                  )) ||
                resolvedList[0];
              if (remapped) {
                selectedIdRef.current = remapped.id;
                setSelectedId(remapped.id);
              }
            }
            return activeResolvedList;
          });
        } else if (scopedLocalForResolvedUser !== null) {
          const fromDcCache =
            scopedLocalForResolvedUser.length === 0 && initialQueryId
              ? tryBuildImItemFromDealCardCache(initialQueryId, resolvedUid)
              : null;
          const nextItemsBase = fromDcCache
            ? [fromDcCache]
            : scopedLocalForResolvedUser.length > 0
            ? scopedLocalForResolvedUser
            : INITIAL_IM_LIST;
          const nextItems =
            freshStarterItem && !nextItemsBase.some((i) => i.id === freshStarterItem.id)
              ? [freshStarterItem, ...nextItemsBase]
              : nextItemsBase;
          itemsRef.current = nextItems;
          setItems(nextItems);
          if (scopedLocalForResolvedUser.length > 0 || fromDcCache) {
            persistImItems(nextItems, resolvedUid);
          }
          const nextTarget = freshStarterItem || nextItems[0];
          if (nextTarget && !userInteractedRef.current) {
            selectedIdRef.current = nextTarget.id;
            setSelectedId(nextTarget.id);
            applyItemToFormState(nextTarget);
          }
        }
      })
      .catch(() => {
        // Offline / test fallback
      })
      .finally(() => {
        setIsHydrated(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildingIdParam, applyItemToFormState, persistImItems]);
}
