"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback, Suspense } from "react";
import dynamic from "next/dynamic";
import { useSearchParams, useRouter } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import {
  generateFloorScaffolding,
  rankFloorTopDown,
  type BuildingRegisterFloorItem,
} from "@/components/workspace/RentRollGrid";
import type { RentRollRowItem } from "@/lib/rent-roll/tsv-parser";
import {
  normalizeFloorName,
} from "@/lib/rent-roll/tsv-parser";
import { formatPriceRange } from "@/lib/deal-card/price-band";
import { UndoToastProvider, useUndoToast } from "@/components/workspace/UndoConfirmToast";

const ImDataBottomSheet = dynamic(
  () =>
    import("@/app/(broker)/broker/deal-card/[id]/im-data-bottom-sheet").then(
      (m) => m.ImDataBottomSheet
    ),
  { ssr: false, loading: () => null }
);
import type { RentRollImportPayload } from "@/components/broker/rent-roll-importer";
import type { RentRollMeta } from "@/domain/building/mobile-im/rentroll-meta";
import {
  EMPTY_BROKER_EXTRAS_FORM,
  brokerExtrasFormToInput,
  parseBrokerExtras,
  type BrokerExtrasFormState,
} from "@/domain/building/mobile-im/broker-extras";
import { useWorkspaceAutosave } from "@/lib/hooks/useWorkspaceAutosave";
import { IM_POSTURE_LABELS, TERMS } from "@/lib/ux/lexicon";
import { copyText } from "@/lib/ux/clipboard";
import { ConfirmDeleteModal } from "@/components/workspace/ConfirmDeleteModal";
import { useListViewMode } from "@/components/workspace/list/useListViewMode";
import {
  useEditorPreviewSync,
  type PreviewLifecycleState,
  type EditorUnitTarget,
} from "@/components/workspace/preview-sync";
import {
  getLastActiveBrokerUserId,
  normalizeWorkspaceUserId,
  readScopedWorkspaceJson,
  writeScopedWorkspaceJson,
} from "@/lib/workspace/storage-namespace";
import { toListTime } from "@/lib/workspace/list-date";

import {
  BLANK_IM_HIGHLIGHTS,
  DEFAULT_IM_AXIOS_HIGHLIGHTS,
  IM_STORAGE_KEY,
  INITIAL_IM_LIST,
  SAMPLE_SEED_IDS,
  isSampleSeedImItem,
  sortImWorkspaceItems,
  UUID_REGEX,
  applyUploadedPhotoBatchResult,
  buildAddedPhotoEntries,
  buildBasicImSlides,
  buildFallbackImHighlights,
  buildImSyncUnits,
  buildPhotosPayloadFromEntries,
  cleanBrokerPlaceholder,
  createBlankImItem,
  inferPhotoCategoryFromFilename,
  isHeicLikeFile,
  isRealUploadedPhotoUrl,
  isSafeInlineImageDataUrl,
  mapRentRollImportPayloadToRows,
  normalizePostureForSelector,
  parseKrwInputToManwon,
  processAndUploadPhotoFile,
  reorderPhotoEntryList,
  resolveKnownTestAssetUrl,
  sanitizePhotosForSync,
  type ImAxiosHighlight,
  type ImEditorTabKey,
  type ImListItem,
  type ImPhotoEntry,
  type ImPostureFilterKey,
  type UploadedPhotoBatchItem,
} from "./_components/im-workspace-types";
import { ImListSidebar } from "./_components/ImListSidebar";
import { ImEditorPanels } from "./_components/ImEditorPanels";
import { ImPreviewPane, ImPreviewTabSwitcher, type ImPostitStyle } from "./_components/ImPreviewPane";
import { ImSlideVisualCard } from "./_components/ImSlideVisualCard";
import { ImBottomActionBar } from "./_components/ImBottomActionBar";
import { ImFullscreenModal } from "./_components/ImFullscreenModal";
import { useImServerHydration } from "./_hooks/useImServerHydration";

export {
  isHeicLikeFile,
  isSafeInlineImageDataUrl,
  sanitizePhotosForSync,
  parseKrwInputToManwon,
};

export function mintUniqueFreshImIds(): {
  id: string;
  buildingId: string;
  suffix: string;
} {
  const suffix =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return {
    id: `im-doc-fresh-${suffix}`,
    buildingId: `bld-fresh-${suffix}`,
    suffix,
  };
}

export function mintDuplicateImIds(sourceBuildingId?: string | null): {
  id: string;
  buildingId: string;
  suffix: string;
} {
  const suffix =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const rawBid = String(sourceBuildingId || "").trim();
  const isSharedOrFresh =
    SAMPLE_SEED_IDS.has(rawBid) ||
    rawBid.startsWith("bld-fresh-") ||
    rawBid.startsWith("im-doc-fresh-");
  return {
    id: `im-doc-${suffix}`,
    buildingId: isSharedOrFresh || !rawBid ? `bld-dup-${suffix}` : `bld-dup-${suffix}`,
    suffix,
  };
}

function ImWorkspaceInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showUndoToast } = useUndoToast();

  const buildingIdParam = searchParams.get("buildingId") || searchParams.get("id");
  const isFreshParam =
    searchParams.get("fresh") === "1" || searchParams.get("new") === "1";
  const currentUserIdRef = useRef<string | null>(getLastActiveBrokerUserId());
  const hydratedUserIdRef = useRef<string | null>(currentUserIdRef.current);
  // Deterministic SSR/CSR initial state: fresh draft creation runs post-mount in useImServerHydration
  // to avoid SSR/CSR UUID mismatch (#418) and keep hardcoded draft IDs out of bundle/tests.
  const initialFreshItem = null as ImListItem | null;

  const [items, setItems] = useState<ImListItem[]>(() =>
    initialFreshItem ? [initialFreshItem, ...INITIAL_IM_LIST] : INITIAL_IM_LIST
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [postureFilter, setPostureFilter] = useState<ImPostureFilterKey>("all");
  const [viewMode, setViewMode] = useListViewMode();
  const [fullscreenModalUrl, setFullscreenModalUrl] = useState<string | null>(null);
  const [activeEditorTab, setActiveEditorTab] = useState<ImEditorTabKey>("specs");
  const [activeSlideFilter, setActiveSlideFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string>(
    () => initialFreshItem?.id || items[0]?.id || ""
  );
  const selectedIdRef = useRef<string>(selectedId);
  selectedIdRef.current = selectedId;
  const itemsRef = useRef<ImListItem[]>(items);
  itemsRef.current = items;
  const userInteractedRef = useRef<boolean>(false);
  const lastAppliedQueryIdRef = useRef<string | null>(null);
  const pendingUrlBuildingIdRef = useRef<string | null>(null);
  const inFlightSelfUrlIdsRef = useRef<Set<string>>(new Set());
  const initialHydrationDoneRef = useRef<boolean>(false);
  const storageQuotaNotifiedRef = useRef<boolean>(false);

  const [previewTab, setPreviewTab] = useState<"mobile" | "pptx">("mobile");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDownloadingPptx, setIsDownloadingPptx] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [isShareLinkCopied, setIsShareLinkCopied] = useState(false);
  const [pendingDeleteIm, setPendingDeleteIm] = useState<ImListItem | null>(null);
  const [isAiPointsBusy, setIsAiPointsBusy] = useState(false);
  const [isLookingUpAddress, setIsLookingUpAddress] = useState(false);
  const [actionAlert, setActionAlert] = useState<string | null>(null);
  const [actionAlertCode, setActionAlertCode] = useState<string | null>(null);
  const [photoEntries, setPhotoEntries] = useState<ImPhotoEntry[]>([]);
  const latestPhotoEntriesRef = useRef<ImPhotoEntry[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pendingPhotoCompressionsRef = useRef<Set<Promise<any>>>(new Set());
  const [isCompressingPhotos, setIsCompressingPhotos] = useState(false);
  const [isDraggingPhotos, setIsDraggingPhotos] = useState(false);
  const [wonInputFocused, setWonInputFocused] = useState(false);
  const [wonDraft, setWonDraft] = useState("");
  const [isPriceCalcOpen, setIsPriceCalcOpen] = useState(false);
  const [isRentRollImportOpen, setIsRentRollImportOpen] = useState(false);
  const initialBrokerItem = initialFreshItem || INITIAL_IM_LIST[0];
  const [isBrokerSectionOpen, setIsBrokerSectionOpen] = useState<boolean>(
    () =>
      !Boolean(
        cleanBrokerPlaceholder(initialBrokerItem?.brokerName) ||
          cleanBrokerPlaceholder(initialBrokerItem?.brokerPhone)
      )
  );
  const brokerSectionTouchedRef = useRef<boolean>(false);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    latestPhotoEntriesRef.current = photoEntries;
  }, [photoEntries]);

  const waitForPendingPhotoCompressions = useCallback(async () => {
    if (pendingPhotoCompressionsRef.current.size > 0) {
      await Promise.allSettled(Array.from(pendingPhotoCompressionsRef.current));
    }
  }, []);

  const persistImItems = useCallback(
    (next: ImListItem[], explicitUserId?: string | null) => {
      if (typeof window === "undefined" || !window.localStorage) return;
      const uid = normalizeWorkspaceUserId(
        explicitUserId !== undefined ? explicitUserId : currentUserIdRef.current
      );
      const stamped = uid
        ? next.map((it) => (it.ownerUserId ? it : { ...it, ownerUserId: uid }))
        : next;
      try {
        writeScopedWorkspaceJson(IM_STORAGE_KEY, uid, stamped, {
          rethrowQuotaError: true,
        });
      } catch {
        const stripDataUrls = (list: ImListItem[], keepActiveId?: string): ImListItem[] =>
          list.map((it) => {
            if (keepActiveId && it.id === keepActiveId) return it;
            if (!Array.isArray(it.photos) || it.photos.length === 0) return it;
            return {
              ...it,
              photos: it.photos.map((pe) => {
                const directRealUrl =
                  pe.url && isRealUploadedPhotoUrl(pe.url) && !pe.url.startsWith("data:")
                    ? pe.url
                    : undefined;
                const fallbackUrl =
                  directRealUrl ||
                  (pe.url && !pe.url.startsWith("data:")
                    ? resolveKnownTestAssetUrl(pe.url) || pe.url
                    : resolveKnownTestAssetUrl(pe.name));
                const directRealPreview =
                  pe.previewUrl &&
                  isRealUploadedPhotoUrl(pe.previewUrl) &&
                  !pe.previewUrl.startsWith("data:")
                    ? pe.previewUrl
                    : undefined;
                const fallbackPreview =
                  directRealPreview ||
                  (pe.previewUrl && !pe.previewUrl.startsWith("data:")
                    ? resolveKnownTestAssetUrl(pe.previewUrl) || pe.previewUrl
                    : fallbackUrl);
                return {
                  ...(pe.id ? { id: pe.id } : {}),
                  name: pe.name,
                  category: pe.category,
                  caption: pe.caption,
                  ...(fallbackUrl ? { url: fallbackUrl } : {}),
                  ...(fallbackPreview ? { previewUrl: fallbackPreview } : {}),
                };
              }),
            };
          });
        try {
          writeScopedWorkspaceJson(
            IM_STORAGE_KEY,
            uid,
            stripDataUrls(stamped, selectedIdRef.current),
            { rethrowQuotaError: true }
          );
        } catch {
          try {
            writeScopedWorkspaceJson(IM_STORAGE_KEY, uid, stripDataUrls(stamped), {
              rethrowQuotaError: true,
            });
            if (!storageQuotaNotifiedRef.current) {
              storageQuotaNotifiedRef.current = true;
              setActionAlert(
                "브라우저 저장 용량이 가득 차 사진 원본은 현재 화면과 서버 저장본으로 유지하고 텍스트·임대현황을 우선 저장했어요."
              );
            }
          } catch {
            // Final safe fallback
          }
        }
      }
    },
    []
  );

  const selectImItem = useCallback(
    (nextId: string, options?: { syncUrl?: boolean; listSnapshot?: ImListItem[] }) => {
      if (!nextId) return;
      userInteractedRef.current = true;
      const sourceList = options?.listSnapshot || itemsRef.current;
      const matched = sourceList.find((i) => i.id === nextId || i.buildingId === nextId);
      const resolvedId = matched ? matched.id : nextId;
      const urlTargetId = matched?.buildingId || resolvedId;

      selectedIdRef.current = resolvedId;
      setSelectedId(resolvedId);

      const currentQueryId = searchParams.get("buildingId") || searchParams.get("id");
      if (currentQueryId) {
        inFlightSelfUrlIdsRef.current.add(currentQueryId);
      }
      inFlightSelfUrlIdsRef.current.add(urlTargetId);
      lastAppliedQueryIdRef.current = urlTargetId;
      pendingUrlBuildingIdRef.current = urlTargetId;

      if (options?.syncUrl !== false) {
        try {
          const baseSearch =
            typeof window !== "undefined"
              ? window.location.search
              : searchParams.toString();
          const nextParams = new URLSearchParams(baseSearch);
          nextParams.set("buildingId", urlTargetId);
          nextParams.delete("id");
          nextParams.delete("fresh");
          if (nextParams.get("tab") === "list") {
            nextParams.set("tab", "editor");
          }
          router?.replace?.(`/broker/w/im?${nextParams.toString()}`, {
            scroll: false,
          });
        } catch {
          // Safe no-op
        }
      }
    },
    [router, searchParams]
  );

  const currentItem = useMemo(() => {
    return items.find((i) => i.id === selectedId) || items[0];
  }, [items, selectedId]);

  const [imTitle, setImTitle] = useState<string>(currentItem?.title || "");
  const [address, setAddress] = useState<string>(currentItem?.address || "");
  const [askingPriceManwon, setAskingPriceManwon] = useState<number>(
    currentItem?.askingPriceManwon ?? 0
  );
  const [rentRoll, setRentRoll] = useState<RentRollRowItem[]>(
    currentItem?.rentRoll || generateFloorScaffolding(3, 1)
  );
  const latestRentRollRef = useRef<RentRollRowItem[]>(rentRoll);
  useEffect(() => {
    latestRentRollRef.current = rentRoll;
  }, [rentRoll]);
  const [expectedRentRoll, setExpectedRentRoll] = useState<RentRollRowItem[]>(
    currentItem?.expectedRentRoll || []
  );
  const [rentRollMeta, setRentRollMeta] = useState<RentRollMeta | undefined>(
    currentItem?.rentRollMeta
  );
  const [expectedRentRollMeta, setExpectedRentRollMeta] = useState<RentRollMeta | undefined>(
    currentItem?.expectedRentRollMeta
  );
  const [investmentPosture, setInvestmentPosture] = useState<string>(
    currentItem?.investmentPosture || "core_income"
  );
  const [gfaSqm, setGfaSqm] = useState<string>(currentItem?.gfaSqm || "");
  const [completionDate, setCompletionDate] = useState<string>(
    currentItem?.completionDate || ""
  );
  const [landAreaSqm, setLandAreaSqm] = useState<string>(
    currentItem?.landAreaSqm || ""
  );
  const [zoning, setZoning] = useState<string>(currentItem?.zoning || "");
  const [handoverNote, setHandoverNote] = useState<string>(
    currentItem?.handoverNote || ""
  );
  const [bcrPct, setBcrPct] = useState<number | undefined>(currentItem?.bcrPct);
  const [farPct, setFarPct] = useState<number | undefined>(currentItem?.farPct);
  const [parkingTotal, setParkingTotal] = useState<number | undefined>(
    currentItem?.parkingTotal
  );
  const [elevatorCount, setElevatorCount] = useState<number | undefined>(
    currentItem?.elevatorCount
  );
  const [officialLandPricePerSqm, setOfficialLandPricePerSqm] = useState<
    number | undefined
  >(currentItem?.officialLandPricePerSqm);
  const [buildingRegisterFloors, setBuildingRegisterFloors] = useState<
    BuildingRegisterFloorItem[] | undefined
  >(undefined);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [parcels, setParcels] = useState<any[] | undefined>(currentItem?.parcels);
  const [photoNames, setPhotoNames] = useState<string[]>(
    currentItem?.photoNames || []
  );
  const [brokerName, setBrokerName] = useState<string>(
    currentItem?.brokerName || ""
  );
  const [brokerageName, setBrokerageName] = useState<string>(
    currentItem?.brokerageName || ""
  );
  const [brokerPhone, setBrokerPhone] = useState<string>(
    currentItem?.brokerPhone || ""
  );
  const [brokerExtrasForm, setBrokerExtrasForm] = useState<BrokerExtrasFormState>(
    currentItem?.brokerExtrasForm || {
      ...EMPTY_BROKER_EXTRAS_FORM,
      regulatoryRows: [],
      compRows: [],
    }
  );
  const [axiosHighlights, setAxiosHighlights] = useState<ImAxiosHighlight[]>(
    currentItem?.axiosHighlights ||
      (currentItem?.id === "im-1" || currentItem?.id === "im-doc-01"
        ? DEFAULT_IM_AXIOS_HIGHLIGHTS
        : BLANK_IM_HIGHLIGHTS.map((h) => ({ ...h, bullets: [...(h.bullets || [])] })))
  );
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false);
  const [bottomSheetBuildingId, setBottomSheetBuildingId] = useState<string>(
    currentItem?.buildingId || "bld-01"
  );
  const [isProvisioningSheet, setIsProvisioningSheet] = useState(false);
  const profileDefaultsRef = useRef({
    brokerName: "",
    brokerageName: "",
    brokerPhone: "",
  });

  const applyItemToFormState = useCallback((item: ImListItem) => {
    setImTitle(item.title || "");
    setAddress(item.address || "");
    setAskingPriceManwon(item.askingPriceManwon ?? 0);
    setWonInputFocused(false);
    setWonDraft(
      item.askingPriceManwon && item.askingPriceManwon > 0
        ? (item.askingPriceManwon * 10000).toLocaleString("ko-KR")
        : ""
    );
    const nextRentRoll = item.rentRoll || generateFloorScaffolding(3, 1);
    latestRentRollRef.current = nextRentRoll;
    setRentRoll(nextRentRoll);
    setExpectedRentRoll(item.expectedRentRoll || []);
    setRentRollMeta(item.rentRollMeta);
    setExpectedRentRollMeta(item.expectedRentRollMeta);
    setInvestmentPosture(item.investmentPosture || "core_income");
    setGfaSqm(item.gfaSqm ?? "");
    setCompletionDate(item.completionDate ?? "");
    setLandAreaSqm(item.landAreaSqm ?? "");
    setZoning(item.zoning ?? "");
    setHandoverNote(item.handoverNote ?? "");
    setBcrPct(item.bcrPct);
    setFarPct(item.farPct);
    setParkingTotal(item.parkingTotal);
    setElevatorCount(item.elevatorCount);
    setOfficialLandPricePerSqm(item.officialLandPricePerSqm);
    setBuildingRegisterFloors(undefined);
    setParcels(item.parcels);
    if (Array.isArray(item.photos) && item.photos.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hydratedEntries: ImPhotoEntry[] = item.photos.map((p: any, idx: number) => {
        const name = p.name || p.caption || `현장 사진 ${idx + 1}`;
        const directRealUrl = isRealUploadedPhotoUrl(p.url)
          ? p.url
          : isRealUploadedPhotoUrl(p.previewUrl)
          ? p.previewUrl
          : undefined;
        const healedKnownUrl = directRealUrl
          ? undefined
          : resolveKnownTestAssetUrl(p.url) ||
            resolveKnownTestAssetUrl(p.previewUrl) ||
            resolveKnownTestAssetUrl(name);
        const persistentUrl =
          directRealUrl ||
          healedKnownUrl ||
          (p.url && !String(p.url).startsWith("data:") ? p.url : undefined) ||
          p.dataUrl;
        const resolvedPreview = p.dataUrl || directRealUrl || healedKnownUrl || p.previewUrl || p.url;
        return {
          id: p.id || `photo-item-${item.id}-${idx}-${name}`,
          name,
          url: persistentUrl || resolvedPreview,
          previewUrl: resolvedPreview,
          dataUrl: p.dataUrl,
          category: p.category || (idx === 0 ? "exterior" : "interior"),
          caption: p.caption || `현장 사진 ${idx + 1}`,
        };
      });
      setPhotoEntries(hydratedEntries);
      latestPhotoEntriesRef.current = hydratedEntries;
      setPhotoNames(
        item.photoNames && item.photoNames.length > 0
          ? item.photoNames
          : hydratedEntries.map((p) => p.name)
      );
    } else if (Array.isArray(item.photoNames) && item.photoNames.length > 0) {
      const hydratedEntries: ImPhotoEntry[] = item.photoNames
        .map((name, idx) => {
          const inferred = inferPhotoCategoryFromFilename(name, idx);
          const resolvedUrl = resolveKnownTestAssetUrl(name);
          if (!resolvedUrl) return null;
          return {
            id: `photo-item-${item.id}-${idx}-${name}`,
            name,
            url: resolvedUrl,
            previewUrl: resolvedUrl,
            category: inferred.category,
            caption: inferred.caption,
          } as ImPhotoEntry;
        })
        .filter((pe): pe is ImPhotoEntry => Boolean(pe));
      setPhotoNames(hydratedEntries.map((pe) => pe.name));
      setPhotoEntries(hydratedEntries);
      latestPhotoEntriesRef.current = hydratedEntries;
    } else {
      setPhotoNames([]);
      setPhotoEntries([]);
      latestPhotoEntriesRef.current = [];
    }
    const resolvedBrokerName =
      cleanBrokerPlaceholder(item.brokerName) ||
      profileDefaultsRef.current.brokerName ||
      "";
    const resolvedBrokerageName =
      cleanBrokerPlaceholder(item.brokerageName) ||
      profileDefaultsRef.current.brokerageName ||
      "";
    const resolvedBrokerPhone =
      cleanBrokerPlaceholder(item.brokerPhone) ||
      profileDefaultsRef.current.brokerPhone ||
      "";
    setBrokerName(resolvedBrokerName);
    setBrokerageName(resolvedBrokerageName);
    setBrokerPhone(resolvedBrokerPhone);
    brokerSectionTouchedRef.current = false;
    setIsBrokerSectionOpen(!Boolean(resolvedBrokerName.trim() || resolvedBrokerPhone.trim()));
    setBrokerExtrasForm((prev) => ({
      ...prev,
      ...EMPTY_BROKER_EXTRAS_FORM,
      ...(item.brokerExtrasForm || item.brokerExtras || {}),
      closingLine:
        item.closingLine ??
        item.brokerExtras?.closingLine ??
        item.brokerExtrasForm?.closingLine ??
        "",
    }));
    setAxiosHighlights(
      item.axiosHighlights ||
        (item.id === "im-1"
          ? DEFAULT_IM_AXIOS_HIGHLIGHTS
          : BLANK_IM_HIGHLIGHTS.map((h) => ({ ...h, bullets: [...(h.bullets || [])] })))
    );
    setBottomSheetBuildingId(item.buildingId || "bld-01");
  }, []);

  useImServerHydration({
    buildingIdParam,
    isFreshParam,
    initialFreshStarterItem: initialFreshItem,
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
    onFreshDraftCreated: (freshBldId) => {
      try {
        const baseSearch =
          typeof window !== "undefined"
            ? window.location.search
            : searchParams.toString();
        const nextParams = new URLSearchParams(baseSearch);
        nextParams.set("buildingId", freshBldId);
        nextParams.delete("id");
        nextParams.delete("fresh");
        inFlightSelfUrlIdsRef.current.add(freshBldId);
        lastAppliedQueryIdRef.current = freshBldId;
        pendingUrlBuildingIdRef.current = freshBldId;
        router?.replace?.(`/broker/w/im?${nextParams.toString()}`, {
          scroll: false,
        });
      } catch {
        // Safe no-op
      }
    },
  });

  const totalRentManwon = useMemo(
    () =>
      Math.round(
        rentRoll.reduce(
          (s, r) =>
            s +
            (r.status !== "vacant" && r.status !== "owner"
              ? Number(
                  r.monthlyRentManwon ??
                    (r as unknown as Record<string, unknown>).rent_manwon ??
                    0
                )
              : 0),
          0
        ) * 10
      ) / 10,
    [rentRoll]
  );

  const totalDepositManwon = useMemo(
    () =>
      Math.round(
        rentRoll.reduce(
          (s, r) =>
            s +
            (r.status !== "vacant" && r.status !== "owner"
              ? Number(
                  r.depositManwon ??
                    (r as unknown as Record<string, unknown>).deposit_manwon ??
                    0
                )
              : 0),
          0
        ) * 10
      ) / 10,
    [rentRoll]
  );

  const expectedRentManwon = useMemo(
    () =>
      Math.round(
        expectedRentRoll.reduce(
          (s, r) =>
            s +
            (r.status !== "vacant" && r.status !== "owner"
              ? Number(
                  r.monthlyRentManwon ??
                    (r as unknown as Record<string, unknown>).rent_manwon ??
                    0
                )
              : 0),
          0
        ) * 10
      ) / 10,
    [expectedRentRoll]
  );

  const expectedDepositManwon = useMemo(
    () =>
      Math.round(
        expectedRentRoll.reduce(
          (s, r) =>
            s +
            (r.status !== "vacant" && r.status !== "owner"
              ? Number(
                  r.depositManwon ??
                    (r as unknown as Record<string, unknown>).deposit_manwon ??
                    0
                )
              : 0),
          0
        ) * 10
      ) / 10,
    [expectedRentRoll]
  );

  const expectedYieldPct = useMemo(() => {
    if (!askingPriceManwon || askingPriceManwon <= 0 || expectedRentRoll.length === 0) {
      return 0;
    }
    const netInv = askingPriceManwon - expectedDepositManwon;
    if (netInv <= 0 || expectedRentManwon <= 0) return 0;
    return ((expectedRentManwon * 12) / netInv) * 100;
  }, [askingPriceManwon, expectedDepositManwon, expectedRentManwon, expectedRentRoll.length]);

  const calculatedYield = useMemo(() => {
    if (!askingPriceManwon || askingPriceManwon <= 0) return 0;
    const netInvestment = askingPriceManwon - totalDepositManwon;
    if (netInvestment <= 0) return 0;
    const rawYield = ((totalRentManwon * 12) / netInvestment) * 100;
    if (rawYield > 0) return rawYield;
    if (rentRoll.length > 0) return 0;
    const normP = normalizePostureForSelector(investmentPosture);
    if (
      normP !== "owner_occupied" &&
      normP !== "development" &&
      currentItem?.grossYieldPct &&
      currentItem.grossYieldPct > 0 &&
      !currentItem.isDirty &&
      !currentItem.hasUnpublishedEdits
    ) {
      return currentItem.grossYieldPct;
    }
    return 0;
  }, [askingPriceManwon, totalRentManwon, totalDepositManwon, rentRoll.length, investmentPosture, currentItem]);

  const autosave = useWorkspaceAutosave<ImListItem | undefined>({
    id: selectedId || null,
    ready: isHydrated,
    data: currentItem,
    debounceMs: 900,
    onSave: async ({ data: draftItem }) => {
      if (!draftItem) return;
      const hasMeaningfulTitle = Boolean(
        draftItem.title?.trim() && draftItem.title.trim() !== "새 IM"
      );
      const hasMeaningfulHighlights = Boolean(
        draftItem.axiosHighlights?.some(
          (h) => Boolean(h?.headline?.trim() || h?.brief?.trim())
        )
      );
      const hasMeaningfulPhotos = Boolean(
        Array.isArray(draftItem.photos) && draftItem.photos.length > 0
      );
      const hasMeaningfulRentRoll = Boolean(
        Array.isArray(draftItem.rentRoll) &&
          draftItem.rentRoll.some((r) =>
            Boolean(
              r?.tenantName?.trim() ||
                (r?.depositManwon ?? 0) > 0 ||
                (r?.monthlyRentManwon ?? 0) > 0 ||
                (r?.areaSqm ?? 0) > 0
            )
          )
      );
      if (
        !draftItem.address?.trim() &&
        !((draftItem.askingPriceManwon ?? 0) > 0) &&
        !hasMeaningfulTitle &&
        !draftItem.handoverNote?.trim() &&
        !hasMeaningfulHighlights &&
        !hasMeaningfulPhotos &&
        !hasMeaningfulRentRoll &&
        draftItem.status !== "published"
      ) {
        return;
      }
      const targetBid = draftItem.buildingId || draftItem.id;
      const sanitizedDraft: ImListItem = {
        ...draftItem,
        ...(Array.isArray(draftItem.photos)
          ? {
              photos: sanitizePhotosForSync(draftItem.photos),
              photoNames: sanitizePhotosForSync(draftItem.photos).map((p) => p.name),
            }
          : {}),
      };
      const imPayloadForSync =
        sanitizedDraft.hasUnpublishedEdits === true
          ? { ...sanitizedDraft, status: "draft" as const }
          : sanitizedDraft;
      const res = await fetch("/api/broker/workspace/summary", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upsert_im",
          buildingId: targetBid,
          imId: draftItem.id,
          imItem: imPayloadForSync,
        }),
      });
      if (!res.ok) {
        throw new Error("IM save failed");
      }
      try {
        const activeUid = currentUserIdRef.current;
        const imParsed = readScopedWorkspaceJson<ImListItem[]>(IM_STORAGE_KEY, activeUid, []);
        if (Array.isArray(imParsed) && imParsed.length > 0) {
          const cleanedIm = imParsed
            .filter(
              (it: ImListItem) =>
                !(it?.ownerUserId && activeUid && it.ownerUserId !== activeUid)
            )
            .map((it: ImListItem) =>
              it.id === draftItem.id
                ? {
                    ...it,
                    ...(activeUid ? { ownerUserId: activeUid } : {}),
                    isDirty: false,
                    ...(it.hasUnpublishedEdits || draftItem.hasUnpublishedEdits
                      ? { hasUnpublishedEdits: true }
                      : {}),
                  }
                : it
            );
          persistImItems(cleanedIm, activeUid);
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dcParsed = readScopedWorkspaceJson<any[]>("credeal-w-dealcards-v5", activeUid, []);
        if (Array.isArray(dcParsed) && dcParsed.length > 0) {
          const nextBand =
            draftItem.askingPriceManwon && draftItem.askingPriceManwon > 0
              ? formatPriceRange(draftItem.askingPriceManwon * 10000)
              : undefined;
          const nextDc = dcParsed
            .filter(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (dc: any) => !(dc?.ownerUserId && activeUid && dc.ownerUserId !== activeUid)
            )
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map((dc: any) => {
              if (dc.id !== targetBid) return dc;
              return {
                ...dc,
                ...(activeUid ? { ownerUserId: activeUid } : {}),
                ...(nextBand
                  ? {
                      priceBand: nextBand,
                      card4: dc.card4 ? { ...dc.card4, priceBand: nextBand } : dc.card4,
                    }
                  : {}),
                isDirty: false,
              };
            });
          writeScopedWorkspaceJson("credeal-w-dealcards-v5", activeUid, nextDc);
        }
      } catch {
        // ignore storage errors
      }
    },
  });

  const syncCurrentItemPatch = (patch: Partial<ImListItem>, explicitTargetId?: string) => {
    if (!explicitTargetId || explicitTargetId === selectedIdRef.current) {
      userInteractedRef.current = true;
    }
    setItems((prev) => {
      const targetId = explicitTargetId || currentItem?.id || selectedIdRef.current;
      const next = prev.map((it) => {
        if (it.id !== targetId) return it;
        const nextPrice = patch.askingPriceManwon ?? it.askingPriceManwon ?? 0;
        const nextRentRoll = patch.rentRoll ?? it.rentRoll ?? [];
        const depSum =
          Math.round(
            nextRentRoll.reduce(
              (s, r) =>
                s + (r.status !== "vacant" && r.status !== "owner" ? Number(r.depositManwon || 0) : 0),
              0
            ) * 10
          ) / 10;
        const rentSum =
          Math.round(
            nextRentRoll.reduce(
              (s, r) =>
                s +
                (r.status !== "vacant" && r.status !== "owner" ? Number(r.monthlyRentManwon || 0) : 0),
              0
            ) * 10
          ) / 10;
        const netInv = nextPrice - depSum;
        const nextYield =
          netInv > 0 && rentSum > 0
            ? Number((((rentSum * 12) / netInv) * 100).toFixed(2))
            : patch.grossYieldPct !== undefined
            ? patch.grossYieldPct
            : patch.rentRoll !== undefined
            ? 0
            : it.grossYieldPct ?? 0;
        const nextHasUnpublishedEdits =
          patch.hasUnpublishedEdits !== undefined
            ? patch.hasUnpublishedEdits
            : it.status === "published"
            ? true
            : it.hasUnpublishedEdits;
        return {
          ...it,
          ...patch,
          ...(currentUserIdRef.current ? { ownerUserId: currentUserIdRef.current } : {}),
          grossYieldPct: nextYield,
          updatedAt: new Date().toISOString(),
          isDirty: patch.isDirty ?? true,
          ...(nextHasUnpublishedEdits !== undefined
            ? { hasUnpublishedEdits: nextHasUnpublishedEdits }
            : {}),
        };
      });
      persistImItems(next);
      return next;
    });
  };

  useEffect(() => {
    const queryId = searchParams.get("buildingId") || searchParams.get("id");
    if (!queryId) return;
    if (queryId === pendingUrlBuildingIdRef.current) {
      lastAppliedQueryIdRef.current = queryId;
      pendingUrlBuildingIdRef.current = null;
      inFlightSelfUrlIdsRef.current.clear();
      return;
    }
    if (
      queryId === lastAppliedQueryIdRef.current ||
      (pendingUrlBuildingIdRef.current !== null &&
        inFlightSelfUrlIdsRef.current.has(queryId))
    ) {
      return;
    }
    const match = items.find((i) => i.id === queryId || i.buildingId === queryId);
    if (match) {
      lastAppliedQueryIdRef.current = queryId;
      if (match.id !== selectedIdRef.current) {
        selectedIdRef.current = match.id;
        setSelectedId(match.id);
      }
    }
  }, [searchParams, items]);

  useEffect(() => {
    if (currentItem) {
      applyItemToFormState(currentItem);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentItem?.id, applyItemToFormState]);

  const matchesImPostureTab = useCallback(
    (item: ImListItem, tab: ImPostureFilterKey) => {
      const normP = normalizePostureForSelector(item.investmentPosture);
      return (
        tab === "all" ||
        (tab === "income" && normP === "income") ||
        (tab === "owner" && normP === "owner_occupied") ||
        (tab === "value_dev" &&
          (normP === "development" || normP === "trading" || normP === "operating"))
      );
    },
    []
  );

  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const manualSyncBusyRef = useRef(false);
  const lastAutoSyncPullAtRef = useRef(0);
  const autosaveRef = useRef(autosave);
  useEffect(() => {
    autosaveRef.current = autosave;
  });

  const handleManualSync = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (manualSyncBusyRef.current) return;
      manualSyncBusyRef.current = true;
      if (!opts?.silent) setIsManualSyncing(true);
      try {
        if (autosaveRef.current.dirty) {
          await autosaveRef.current.flush();
        }
        const res = await fetch("/api/broker/workspace/summary", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        if (!data?.ok) return;
        const serverList =
          Array.isArray(data.ims) && data.ims.length > 0
            ? (data.ims as ImListItem[])
            : Array.isArray(data.imList) && data.imList.length > 0
            ? (data.imList as ImListItem[])
            : [];
        if (serverList.length === 0) return;

        const uid = currentUserIdRef.current;
        const serverIds = new Set(serverList.map((s) => s.id));
        const serverBuildingIds = new Set(
          serverList.map((s) => s.buildingId).filter(Boolean)
        );
        const baseLocal = itemsRef.current;
        const localById = new Map(baseLocal.map((l) => [l.id, l]));
        const localByBuildingId = new Map(
          baseLocal
            .filter((l) => Boolean(l.buildingId))
            .map((l) => [l.buildingId, l])
        );
        const matchedLocalIds = new Set<string>();
        const nextList: ImListItem[] = [];
        for (const srv of serverList) {
          const loc =
            localById.get(srv.id) ||
            (srv.buildingId ? localByBuildingId.get(srv.buildingId) : undefined);
          if (loc) {
            matchedLocalIds.add(loc.id);
          }
          const srvTime =
            Date.parse((srv as { updatedAtIso?: string }).updatedAtIso || "") ||
            (toListTime(srv.updatedAt || "") ?? 0);
          const locTime =
            Date.parse(
              (loc as { updatedAtIso?: string } | undefined)?.updatedAtIso || ""
            ) || (toListTime(loc?.updatedAt || "") ?? 0);
          const keepLocal = Boolean(
            loc &&
              (loc.isDirty ||
                loc.hasUnpublishedEdits ||
                (srvTime > 0 && locTime > srvTime))
          );
          if (
            !keepLocal &&
            loc &&
            loc.id === selectedIdRef.current &&
            srv.id !== loc.id
          ) {
            selectedIdRef.current = srv.id;
            setSelectedId(srv.id);
          }
          nextList.push(
            keepLocal ? loc! : { ...srv, ...(uid ? { ownerUserId: uid } : {}) }
          );
        }
        for (const loc of baseLocal) {
          const alreadyMatched =
            matchedLocalIds.has(loc.id) ||
            serverIds.has(loc.id) ||
            Boolean(loc.buildingId && serverBuildingIds.has(loc.buildingId));
          if (
            !alreadyMatched &&
            !SAMPLE_SEED_IDS.has(loc.id) &&
            !SAMPLE_SEED_IDS.has(loc.buildingId || "")
          ) {
            nextList.push(loc);
          }
        }
        const sortedNext = sortImWorkspaceItems(nextList);
        itemsRef.current = sortedNext;
        setItems(sortedNext);
        persistImItems(sortedNext, uid);
        if (!autosaveRef.current.dirty) {
          const updatedSelected = sortedNext.find(
            (it) => it.id === selectedIdRef.current
          );
          if (updatedSelected && !updatedSelected.isDirty) {
            applyItemToFormState(updatedSelected);
          }
        }
      } catch {
        // ignore manual sync network fallback
      } finally {
        manualSyncBusyRef.current = false;
        setIsManualSyncing(false);
      }
    },
    [applyItemToFormState, persistImItems]
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    if (/jsdom/i.test(navigator.userAgent || "")) return;
    const pullIfIdle = () => {
      if (document.visibilityState === "hidden") return;
      if (autosaveRef.current.dirty) return;
      const nowMs = Date.now();
      if (nowMs - lastAutoSyncPullAtRef.current < 2500) return;
      lastAutoSyncPullAtRef.current = nowMs;
      void handleManualSync({ silent: true });
    };
    const handleStorage = (ev: StorageEvent) => {
      if (!ev.key || !ev.key.startsWith(IM_STORAGE_KEY)) return;
      void handleManualSync({ silent: true });
    };
    document.addEventListener("visibilitychange", pullIfIdle);
    window.addEventListener("focus", pullIfIdle);
    window.addEventListener("storage", handleStorage);
    return () => {
      document.removeEventListener("visibilitychange", pullIfIdle);
      window.removeEventListener("focus", pullIfIdle);
      window.removeEventListener("storage", handleStorage);
    };
  }, [handleManualSync]);

  const filteredItems = useMemo(() => {
    return sortImWorkspaceItems(
      items.filter((item) => {
        const displayTitle = item.title || "새 IM";
        const matchQuery =
          !searchQuery ||
          displayTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (item.address || "").toLowerCase().includes(searchQuery.toLowerCase());
        return matchQuery && matchesImPostureTab(item, postureFilter);
      })
    );
  }, [items, searchQuery, postureFilter, matchesImPostureTab]);

  const handleImPostureFilterChange = useCallback(
    (nextTab: ImPostureFilterKey) => {
      setPostureFilter(nextTab);
      if (nextTab === "all") return;
      const nextMatches = itemsRef.current.filter((item) => {
        const displayTitle = item.title || "새 IM";
        const matchQuery =
          !searchQuery ||
          displayTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (item.address || "").toLowerCase().includes(searchQuery.toLowerCase());
        return matchQuery && matchesImPostureTab(item, nextTab);
      });
      if (
        nextMatches.length > 0 &&
        !nextMatches.some((it) => it.id === (currentItem?.id || selectedIdRef.current))
      ) {
        selectImItem(nextMatches[0].id, { listSnapshot: itemsRef.current });
        applyItemToFormState(nextMatches[0]);
      }
    },
    [currentItem?.id, matchesImPostureTab, searchQuery, selectImItem, applyItemToFormState]
  );

  const priceBandStr = useMemo(
    () => formatPriceRange((askingPriceManwon || 0) * 10000),
    [askingPriceManwon]
  );

  const priceEokPart = Math.floor((askingPriceManwon || 0) / 10000);
  const priceManwonRemainder = (askingPriceManwon || 0) % 10000;
  const formattedWonDisplay = wonInputFocused
    ? wonDraft
    : askingPriceManwon > 0
    ? (askingPriceManwon * 10000).toLocaleString("ko-KR")
    : "";

  const handleWonPriceChange = (rawText: string) => {
    const trimmed = rawText.trim();
    if (!trimmed) {
      setWonDraft("");
      setAskingPriceManwon(0);
      syncCurrentItemPatch({ askingPriceManwon: 0 });
      return;
    }
    if (/[억천백만]/.test(trimmed)) {
      setWonDraft(rawText);
    } else {
      const digits = trimmed.replace(/\D/g, "");
      if (!digits) {
        setWonDraft("");
        setAskingPriceManwon(0);
        syncCurrentItemPatch({ askingPriceManwon: 0 });
        return;
      }
      const krwNum = Number(digits);
      setWonDraft(
        Number.isFinite(krwNum) && krwNum > 0 ? krwNum.toLocaleString("ko-KR") : ""
      );
    }
    const nextManwon = parseKrwInputToManwon(trimmed);
    setAskingPriceManwon(nextManwon);
    syncCurrentItemPatch({ askingPriceManwon: nextManwon });
  };

  const handleSplitPriceChange = (nextEok: number, nextMan: number) => {
    const safeEok = Number.isFinite(nextEok) && nextEok >= 0 ? Math.floor(nextEok) : 0;
    const safeMan = Number.isFinite(nextMan) && nextMan >= 0 ? Math.floor(nextMan) : 0;
    if (safeEok >= 100_000_000 && safeMan === 0) {
      const man = Math.round(safeEok / 10000);
      setAskingPriceManwon(man);
      setWonDraft((man * 10000).toLocaleString("ko-KR"));
      syncCurrentItemPatch({ askingPriceManwon: man });
      return;
    }
    if (safeEok >= 100000 && safeMan === 0) {
      setAskingPriceManwon(safeEok);
      setWonDraft((safeEok * 10000).toLocaleString("ko-KR"));
      syncCurrentItemPatch({ askingPriceManwon: safeEok });
      return;
    }
    const combinedManwon = safeEok * 10000 + safeMan;
    setAskingPriceManwon(combinedManwon);
    setWonDraft(
      combinedManwon > 0 ? (combinedManwon * 10000).toLocaleString("ko-KR") : ""
    );
    syncCurrentItemPatch({ askingPriceManwon: combinedManwon });
  };

  const handleLookupAddress = async (overrideAddress?: string) => {
    const reqAddress = (
      typeof overrideAddress === "string" ? overrideAddress : address
    ).trim();
    if (!reqAddress) {
      setActionAlert("주소를 먼저 입력해 주세요.");
      return;
    }
    const targetId = currentItem?.id || selectedIdRef.current;
    const originItem = currentItem;
    const originTitle = imTitle;
    const originGfa = gfaSqm;
    const originLand = landAreaSqm;
    const originZoning = zoning;
    const originCompletion = completionDate;
    const originPrice = askingPriceManwon;
    const originRentRoll = [...rentRoll];
    const originHandover = handoverNote;
    const originPhotoEntries = [...photoEntries];
    const originPhotoNames = [...photoNames];

    setIsLookingUpAddress(true);
    setActionAlert(null);
    try {
      const res = await fetch(
        `/api/buildings/lookup?address=${encodeURIComponent(reqAddress)}`
      );
      const data = await res.json().catch(() => null);
      if (res.ok && data) {
        const isStillSelected = selectedIdRef.current === targetId;
        const nextGfa = data.grossFloorAreaSqm || data.gfaSqm || originGfa;
        const nextLand = data.landAreaSqm || originLand;
        const nextZoning = data.zoning || originZoning;
        const nextCompletion = data.completionDate || data.useAprDay || originCompletion;
        const nextPnu =
          typeof data.pnu === "string" && data.pnu.trim()
            ? data.pnu.trim()
            : originItem?.pnu;
        const nextLat =
          data.lat != null && data.lat !== "" && Number.isFinite(Number(data.lat))
            ? Number(data.lat)
            : originItem?.lat;
        const nextLng =
          data.lng != null && data.lng !== "" && Number.isFinite(Number(data.lng))
            ? Number(data.lng)
            : originItem?.lng;
        const rawFloorsAbove = Number(data.floorsAbove ?? data.grndFlrCnt);
        const rawFloorsBelow = Number(data.floorsBelow ?? data.ugrndFlrCnt);
        const nextFloorsAbove =
          Number.isFinite(rawFloorsAbove) && rawFloorsAbove > 0
            ? rawFloorsAbove
            : originItem?.floorsAbove;
        const nextFloorsBelow =
          Number.isFinite(rawFloorsBelow) && rawFloorsBelow >= 0
            ? rawFloorsBelow
            : originItem?.floorsBelow;
        const rawMainPurpose = data.mainPurpose ?? data.mainPurpsCdNm;
        const nextMainPurpose =
          typeof rawMainPurpose === "string" && rawMainPurpose.trim()
            ? rawMainPurpose.trim()
            : originItem?.mainPurpose;
        const nextBuildingName =
          typeof (data.buildingName ?? data.bldNm) === "string"
            ? String(data.buildingName ?? data.bldNm).trim()
            : "";
        const rawBcr = Number(data.bcrPct ?? data.bcRat);
        const nextBcrPct =
          Number.isFinite(rawBcr) && rawBcr > 0 ? rawBcr : originItem?.bcrPct;
        const rawFar = Number(data.farPct ?? data.vlRat);
        const nextFarPct =
          Number.isFinite(rawFar) && rawFar > 0 ? rawFar : originItem?.farPct;
        const rawParking = Number(data.parkingSpaces ?? data.parkingTotal ?? data.totPkngCnt);
        const nextParkingTotal =
          Number.isFinite(rawParking) && rawParking >= 0
            ? rawParking
            : originItem?.parkingTotal;
        const rawElevators = Number(
          data.elevators ?? data.elevatorCount ?? data.rideUseElvtCnt
        );
        const nextElevatorCount =
          Number.isFinite(rawElevators) && rawElevators >= 0
            ? rawElevators
            : originItem?.elevatorCount;
        const rawOfficialPrice = Number(
          data.officialLandPricePerSqm ??
            data.landPricePerSqm ??
            data.officialLandPriceWonSqm
        );
        const nextOfficialLandPricePerSqm =
          Number.isFinite(rawOfficialPrice) && rawOfficialPrice > 0
            ? rawOfficialPrice
            : originItem?.officialLandPricePerSqm;
        const nextParcels =
          Array.isArray(data.parcels) && data.parcels.length > 0
            ? data.parcels
            : undefined;
        const expandedMultiAddress =
          (data.attachedLotsAutoDiscovered || /\s*외\s*\d*/.test(reqAddress)) &&
          typeof data.canonicalMultiParcelAddress === "string" &&
          data.canonicalMultiParcelAddress.trim()
            ? data.canonicalMultiParcelAddress.trim()
            : undefined;

        if (isStillSelected) {
          if (expandedMultiAddress) setAddress(expandedMultiAddress);
          if (nextGfa) setGfaSqm(String(nextGfa));
          if (nextLand) setLandAreaSqm(String(nextLand));
          if (nextZoning) setZoning(String(nextZoning));
          if (nextCompletion) setCompletionDate(String(nextCompletion));
          if (nextBcrPct !== undefined) setBcrPct(nextBcrPct);
          if (nextFarPct !== undefined) setFarPct(nextFarPct);
          if (nextParkingTotal !== undefined) setParkingTotal(nextParkingTotal);
          if (nextElevatorCount !== undefined) setElevatorCount(nextElevatorCount);
          if (nextOfficialLandPricePerSqm !== undefined) {
            setOfficialLandPricePerSqm(nextOfficialLandPricePerSqm);
          }
          if (Array.isArray(data.floors) && data.floors.length > 0) {
            setBuildingRegisterFloors(data.floors);
          }
          setParcels(nextParcels);
        }

        const isSampleOrigin =
          SAMPLE_SEED_IDS.has(originItem?.id || "") ||
          SAMPLE_SEED_IDS.has(originItem?.buildingId || "");
        const isDifferentFromSample =
          !reqAddress.includes("서교동") && !reqAddress.includes("양평동");
        const patch: Partial<ImListItem> = {
          ...(expandedMultiAddress ? { address: expandedMultiAddress } : {}),
          gfaSqm: nextGfa ? String(nextGfa) : originGfa,
          landAreaSqm: nextLand ? String(nextLand) : originLand,
          zoning: nextZoning ? String(nextZoning) : originZoning,
          completionDate: nextCompletion ? String(nextCompletion) : originCompletion,
          ...(nextPnu !== undefined ? { pnu: nextPnu } : {}),
          ...(nextLat !== undefined ? { lat: nextLat } : {}),
          ...(nextLng !== undefined ? { lng: nextLng } : {}),
          ...(nextFloorsAbove !== undefined ? { floorsAbove: nextFloorsAbove } : {}),
          ...(nextFloorsBelow !== undefined ? { floorsBelow: nextFloorsBelow } : {}),
          ...(nextMainPurpose !== undefined ? { mainPurpose: nextMainPurpose } : {}),
          ...(nextBcrPct !== undefined ? { bcrPct: nextBcrPct } : {}),
          ...(nextFarPct !== undefined ? { farPct: nextFarPct } : {}),
          ...(nextParkingTotal !== undefined ? { parkingTotal: nextParkingTotal } : {}),
          ...(nextElevatorCount !== undefined ? { elevatorCount: nextElevatorCount } : {}),
          ...(nextOfficialLandPricePerSqm !== undefined
            ? { officialLandPricePerSqm: nextOfficialLandPricePerSqm }
            : {}),
          parcels: nextParcels,
          ...(isDifferentFromSample ? { isSample: false } : {}),
        };

        if (
          nextBuildingName &&
          (!originTitle.trim() ||
            originTitle === "마포구 서교동 꼬마빌딩" ||
            originTitle === "영등포구 양평동 꼬마빌딩" ||
            originTitle === "새 IM")
        ) {
          if (isStillSelected) setImTitle(nextBuildingName);
          patch.title = nextBuildingName;
        } else if (
          isSampleOrigin &&
          isDifferentFromSample &&
          (originTitle === "마포구 서교동 꼬마빌딩" ||
            originTitle === "영등포구 양평동 꼬마빌딩")
        ) {
          if (isStillSelected) setImTitle(nextBuildingName);
          patch.title = nextBuildingName;
        }

        const liveRentRoll = isStillSelected
          ? latestRentRollRef.current
          : itemsRef.current.find((it) => it.id === targetId)?.rentRoll || originRentRoll;

        if (isSampleOrigin && isDifferentFromSample) {
          if (originPrice === 950000) {
            if (isStillSelected) {
              setAskingPriceManwon(0);
              setWonDraft("");
            }
            patch.askingPriceManwon = 0;
          }
          if (liveRentRoll.some((r) => r.id === "r-b1")) {
            const freshRows = generateFloorScaffolding(
              Number(data.floorsAbove) || 3,
              Number(data.floorsBelow) || 1,
              Array.isArray(data.floors) ? data.floors : undefined
            );
            if (isStillSelected) {
              latestRentRollRef.current = freshRows;
              setRentRoll(freshRows);
            }
            patch.rentRoll = freshRows;
          }
          if (originHandover === "잔금 시 전층 명도 조건 협의 완료") {
            if (isStillSelected) setHandoverNote("");
            patch.handoverNote = "";
          }
          if (
            originPhotoEntries.length > 0 &&
            originPhotoEntries.every((pe) => !pe.dataUrl) &&
            originPhotoNames.includes("exterior_front.jpg")
          ) {
            if (isStillSelected) {
              setPhotoNames([]);
              setPhotoEntries([]);
              latestPhotoEntriesRef.current = [];
            }
            patch.photoNames = [];
            patch.photos = [];
          }
        } else if (
          liveRentRoll.every(
            (r) => r.id.startsWith("scaffold-") && !r.depositManwon && !r.monthlyRentManwon
          ) &&
          (Number(data.floorsAbove) > 0 || Number(data.floorsBelow) > 0 || (Array.isArray(data.floors) && data.floors.length > 0))
        ) {
          const freshRows = generateFloorScaffolding(
            Number(data.floorsAbove) || 3,
            Number(data.floorsBelow) || 1,
            Array.isArray(data.floors) ? data.floors : undefined
          );
          if (isStillSelected) {
            latestRentRollRef.current = freshRows;
            setRentRoll(freshRows);
          }
          patch.rentRoll = freshRows;
        }
        syncCurrentItemPatch(patch, targetId);
        showUndoToast({
          message: "공적장부에서 건물 면적·용도지역 정보를 불러왔어요",
          variant: "success",
        });
      } else if (selectedIdRef.current === targetId) {
        setActionAlert(
          "공적장부 자동 조회 결과가 없어요. 아래 칸에 면적과 용도지역을 직접 적어 주세요."
        );
      }
    } catch {
      if (selectedIdRef.current === targetId) {
        setActionAlert("공적장부 조회에 연결하지 못했어요. 아래 칸에 직접 입력해 주세요.");
      }
    } finally {
      setIsLookingUpAddress(false);
    }
  };

  const handleCreateNew = () => {
    const freshIds = mintUniqueFreshImIds();
    const newItem = createBlankImItem({
      id: freshIds.id,
      buildingId: freshIds.buildingId,
      ownerUserId: currentUserIdRef.current,
      brokerName: profileDefaultsRef.current.brokerName,
      brokerageName: profileDefaultsRef.current.brokerageName,
      brokerPhone: profileDefaultsRef.current.brokerPhone,
    });
    const next = [newItem, ...items];
    itemsRef.current = next;
    setItems(next);
    persistImItems(next);
    setActionAlert(null);
    setActiveEditorTab("specs");
    selectImItem(newItem.id, { listSnapshot: next });
    applyItemToFormState(newItem);
    showUndoToast({
      message: "빈 IM을 새로 열었어요. 건물 주소와 희망 매매가부터 적어 보세요.",
      variant: "success",
    });
  };

  const handleExcelRentRollImport = (payload: RentRollImportPayload) => {
    const finalRows = mapRentRollImportPayloadToRows(payload);
    if (finalRows.length === 0) return;
    const targetId = currentItem?.id || selectedIdRef.current;
    const prevRows = [...rentRoll];
    const prevMeta = rentRollMeta;
    const prevPrice = askingPriceManwon;
    let didUpdatePrice = false;
    latestRentRollRef.current = finalRows;
    setRentRoll(finalRows);
    setRentRollMeta(payload.meta);
    const patch: Partial<ImListItem> = {
      rentRoll: finalRows,
      rentRollMeta: payload.meta,
    };
    const incomingPrice = Number(
      payload.askingPriceManwon ??
        (payload as unknown as { askingPrice?: number }).askingPrice
    );
    if (
      Number.isFinite(incomingPrice) &&
      incomingPrice > 0 &&
      (!askingPriceManwon ||
        askingPriceManwon <= 0 ||
        String(askingPriceManwon) === "68000")
    ) {
      didUpdatePrice = true;
      setAskingPriceManwon(incomingPrice);
      setWonDraft((incomingPrice * 10000).toLocaleString("ko-KR"));
      patch.askingPriceManwon = incomingPrice;
    }
    syncCurrentItemPatch(patch, targetId);
    showUndoToast({
      message: `엑셀 임대 현황 ${finalRows.length}개 층을 반영했어요`,
      undoAction: () => {
        const undoPatch: Partial<ImListItem> = {
          rentRoll: prevRows,
          rentRollMeta: prevMeta,
          ...(didUpdatePrice ? { askingPriceManwon: prevPrice } : {}),
        };
        if (selectedIdRef.current === targetId) {
          setRentRoll(prevRows);
          setRentRollMeta(prevMeta);
          if (didUpdatePrice) {
            setAskingPriceManwon(prevPrice);
            setWonDraft(
              prevPrice > 0 ? (prevPrice * 10000).toLocaleString("ko-KR") : ""
            );
          }
        }
        syncCurrentItemPatch(undoPatch, targetId);
      },
    });
  };

  const handleExpectedExcelRentRollImport = (payload: RentRollImportPayload) => {
    const finalRows = mapRentRollImportPayloadToRows(payload);
    if (finalRows.length === 0) return;
    const targetId = currentItem?.id || selectedIdRef.current;
    const prevExpected = [...expectedRentRoll];
    const prevExpectedMeta = expectedRentRollMeta;
    setExpectedRentRoll(finalRows);
    setExpectedRentRollMeta(payload.meta);
    syncCurrentItemPatch(
      { expectedRentRoll: finalRows, expectedRentRollMeta: payload.meta },
      targetId
    );
    showUndoToast({
      message: `기대수익률 임대 현황 ${finalRows.length}개 호실을 엑셀에서 반영했어요`,
      undoAction: () => {
        if (selectedIdRef.current === targetId) {
          setExpectedRentRoll(prevExpected);
          setExpectedRentRollMeta(prevExpectedMeta);
        }
        syncCurrentItemPatch(
          { expectedRentRoll: prevExpected, expectedRentRollMeta: prevExpectedMeta },
          targetId
        );
      },
    });
  };

  const handlePhotoFilesSelected = (
    files: File[],
    forcedCategory?: "exterior" | "interior"
  ) => {
    if (files.length === 0) return;
    const targetId = currentItem?.id || selectedIdRef.current;
    const baseEntries = latestPhotoEntriesRef.current;
    const addedEntries = buildAddedPhotoEntries(files, baseEntries, forcedCategory);
    const mergedEntries = [...baseEntries, ...addedEntries];
    const nextNames = mergedEntries.map((p) => p.name);
    latestPhotoEntriesRef.current = mergedEntries;
    setPhotoEntries(mergedEntries);
    setPhotoNames(nextNames);
    const syncedInitial = sanitizePhotosForSync(mergedEntries);
    syncCurrentItemPatch(
      {
        photoNames: syncedInitial.map((p) => p.name),
        photos: syncedInitial,
      },
      targetId
    );
    const buildingFolderHint = currentItem?.buildingId || targetId;
    const compressionPromise = (async () => {
      const resolvedList: UploadedPhotoBatchItem[] = [];
      const BATCH_SIZE = 3;
      for (let bStart = 0; bStart < files.length; bStart += BATCH_SIZE) {
        const slice = files.slice(bStart, bStart + BATCH_SIZE);
        const batchOut = await Promise.all(
          slice.map(async (f, localIdx) => {
            const idx = bStart + localIdx;
            const out = await processAndUploadPhotoFile(f, buildingFolderHint);
            return { id: addedEntries[idx]?.id, name: f.name, ...out };
          })
        );
        resolvedList.push(...batchOut);
      }
      return resolvedList;
    })()
      .then((resolvedList) => {
        if (selectedIdRef.current === targetId) {
          const { entries: next, failedNames } = applyUploadedPhotoBatchResult(
            latestPhotoEntriesRef.current,
            resolvedList
          );
          latestPhotoEntriesRef.current = next;
          setPhotoEntries(next);
          const synced = sanitizePhotosForSync(next);
          setPhotoNames(next.map((p) => p.name));
          syncCurrentItemPatch({ photoNames: synced.map((p) => p.name), photos: synced }, targetId);
          if (failedNames.length > 0) {
            setActionAlert(
              `사진 변환·업로드에 실패한 파일 ${failedNames.length}개(${failedNames.slice(0, 2).join(", ")})를 제외했습니다.`
            );
          }
        } else {
          setItems((prev) => {
            const next = prev.map((it) => {
              if (it.id !== targetId) return it;
              const existingPhotos =
                Array.isArray(it.photos) && it.photos.length > 0 ? it.photos : mergedEntries;
              const updatedPhotos = sanitizePhotosForSync(
                applyUploadedPhotoBatchResult(existingPhotos, resolvedList).entries
              );
              return {
                ...it,
                photoNames: updatedPhotos.map((p) => p.name),
                photos: updatedPhotos,
                isDirty: true,
                ...(it.status === "published" ? { hasUnpublishedEdits: true } : {}),
              };
            });
            persistImItems(next);
            return next;
          });
        }
      })
      .finally(() => {
        pendingPhotoCompressionsRef.current.delete(compressionPromise);
        setIsCompressingPhotos(pendingPhotoCompressionsRef.current.size > 0);
      });
    pendingPhotoCompressionsRef.current.add(compressionPromise);
    setIsCompressingPhotos(true);
  };

  const handleUpdatePhotoMeta = (
    idx: number,
    patch: { caption?: string; category?: "exterior" | "interior" }
  ) => {
    const targetId = currentItem?.id || selectedIdRef.current;
    const baseList =
      latestPhotoEntriesRef.current.length > 0 ? latestPhotoEntriesRef.current : photoEntries;
    const nextEntries = baseList.map((pe, i) => (i === idx ? { ...pe, ...patch } : pe));
    latestPhotoEntriesRef.current = nextEntries;
    setPhotoEntries(nextEntries);
    syncCurrentItemPatch(
      { photoNames: nextEntries.map((pe) => pe.name), photos: sanitizePhotosForSync(nextEntries) },
      targetId
    );
  };

  const handleReorderPhoto = (fromIdx: number, toIdx: number) => {
    const targetId = currentItem?.id || selectedIdRef.current;
    const baseList =
      latestPhotoEntriesRef.current.length > 0 ? latestPhotoEntriesRef.current : photoEntries;
    const nextEntries = reorderPhotoEntryList(baseList, fromIdx, toIdx);
    if (!nextEntries) return;
    latestPhotoEntriesRef.current = nextEntries;
    setPhotoEntries(nextEntries);
    setPhotoNames(nextEntries.map((pe) => pe.name));
    syncCurrentItemPatch(
      { photoNames: nextEntries.map((pe) => pe.name), photos: sanitizePhotosForSync(nextEntries) },
      targetId
    );
  };

  const handleRemovePhotoAtIndex = (entry: ImPhotoEntry, idx: number) => {
    const targetId = currentItem?.id || selectedIdRef.current;
    const nextEntries =
      photoEntries.length > 0
        ? photoEntries.filter((pe, i) =>
            entry.id && pe.id ? pe.id !== entry.id : i !== idx
          )
        : [];
    const nextNames =
      photoEntries.length > 0
        ? nextEntries.map((pe) => pe.name)
        : photoNames.filter((_, i) => i !== idx);
    latestPhotoEntriesRef.current = nextEntries;
    setPhotoNames(nextNames);
    setPhotoEntries(nextEntries);
    syncCurrentItemPatch(
      {
        photoNames: nextNames,
        photos: sanitizePhotosForSync(nextEntries),
      },
      targetId
    );
  };

  const buildPhotosPayloadForRequest = () =>
    buildPhotosPayloadFromEntries(
      latestPhotoEntriesRef.current.length > 0
        ? latestPhotoEntriesRef.current
        : photoEntries
    );

  const resolveProvisionBuildingIds = (originItem?: ImListItem) => {
    const originBid = originItem?.buildingId || "";
    const buildingId = UUID_REGEX.test(originBid) ? originBid : undefined;
    const legacyBuildingId =
      originBid && !UUID_REGEX.test(originBid) && !SAMPLE_SEED_IDS.has(originBid)
        ? originBid
        : !originBid &&
            buildingIdParam &&
            !UUID_REGEX.test(buildingIdParam) &&
            !SAMPLE_SEED_IDS.has(buildingIdParam)
          ? buildingIdParam
          : undefined;
    return { buildingId, legacyBuildingId };
  };

  const serializeRentRollRowsForRequest = (rows: RentRollRowItem[]) =>
    rows.map((r) => ({
      ...r,
      ...(r.contractGroup ? { contract_group: r.contractGroup } : {}),
      ...(r.areaSqmIsProxy ? { area_sqm_is_proxy: r.areaSqmIsProxy } : {}),
      ...(r.legalBasis ? { legal_basis: r.legalBasis } : {}),
      ...(r.firstContractDate ? { first_contract_date: r.firstContractDate } : {}),
    }));

  const buildCurrentRequestPayload = (originItem?: ImListItem, cleanTitle?: string) => ({
    address: address.trim(),
    askingPriceManwon,
    title: cleanTitle || undefined,
    investmentPoints: axiosHighlights.map((h) => h.headline).filter(Boolean),
    axiosHighlights,
    rentRoll: serializeRentRollRowsForRequest(rentRoll),
    ...(rentRollMeta ? { rent_roll_meta: rentRollMeta, rentRollMeta } : {}),
    ...(expectedRentRoll.length > 0
      ? { expectedRentRoll: serializeRentRollRowsForRequest(expectedRentRoll) }
      : {}),
    ...(expectedRentRoll.length > 0 && expectedRentRollMeta
      ? {
          expected_rent_roll_meta: expectedRentRollMeta,
          expectedRentRollMeta,
        }
      : {}),
    posture: investmentPosture,
    gfaSqm: Number(String(gfaSqm || "").replace(/,/g, "")) || undefined,
    completionDate: completionDate || undefined,
    landAreaSqm: Number(String(landAreaSqm || "").replace(/,/g, "")) || undefined,
    zoning: zoning || undefined,
    handoverNote: handoverNote || undefined,
    pnu: originItem?.pnu,
    lat: originItem?.lat,
    lng: originItem?.lng,
    floorsAbove: originItem?.floorsAbove,
    floorsBelow: originItem?.floorsBelow,
    bcrPct: bcrPct ?? originItem?.bcrPct,
    farPct: farPct ?? originItem?.farPct,
    parkingSpaces: parkingTotal ?? originItem?.parkingTotal,
    elevators: elevatorCount ?? originItem?.elevatorCount,
    officialLandPricePerSqm:
      officialLandPricePerSqm ?? originItem?.officialLandPricePerSqm,
    parcels: parcels ?? originItem?.parcels,
    closingLine: brokerExtrasForm.closingLine,
    mainPurpose: originItem?.mainPurpose,
    brokerName,
    brokerageName,
    brokerPhone,
  });

  const handleOpenBottomSheet = async () => {
    const targetId = currentItem?.id || selectedIdRef.current;
    const originItem = currentItem;
    await waitForPendingPhotoCompressions();
    const existingBid = originItem?.buildingId || "";
    if (UUID_REGEX.test(existingBid)) {
      if (selectedIdRef.current === targetId) {
        setBottomSheetBuildingId(existingBid);
        setIsBottomSheetOpen(true);
      }
      return;
    }
    if (!address.trim() || !askingPriceManwon || askingPriceManwon <= 0) {
      setActionAlert("상세 편집 창을 열려면 주소와 희망 매매가를 먼저 입력해 주세요.");
      return;
    }
    const cleanSheetTitle = imTitle.trim() === "새 IM" ? "" : imTitle.trim();
    const { buildingId: resolvedBid, legacyBuildingId } =
      resolveProvisionBuildingIds(originItem);
    const reqPayload = {
      ...(resolvedBid ? { buildingId: resolvedBid } : {}),
      ...(legacyBuildingId ? { legacyBuildingId } : {}),
      ...buildCurrentRequestPayload(originItem, cleanSheetTitle),
    };
    const parsedExtras = parseBrokerExtras(brokerExtrasFormToInput(brokerExtrasForm));
    const brokerExtrasPayload = parsedExtras.ok ? parsedExtras.value : brokerExtrasForm;
    const photosPayload = buildPhotosPayloadForRequest();

    setIsProvisioningSheet(true);
    setActionAlert(null);
    try {
      const res = await fetch("/api/broker/im-lite/quick-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...reqPayload,
          brokerExtras: brokerExtrasPayload,
          photos: photosPayload,
          publishStatus: "draft",
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.buildingId && UUID_REGEX.test(data.buildingId)) {
        syncCurrentItemPatch(
          {
            buildingId: data.buildingId,
            ...(data.documentId ? { documentId: data.documentId } : {}),
            isDirty: false,
          },
          targetId
        );
        if (selectedIdRef.current === targetId) {
          setBottomSheetBuildingId(data.buildingId);
          setIsBottomSheetOpen(true);
        }
      } else if (selectedIdRef.current === targetId) {
        setActionAlert(
          res.status === 413
            ? "첨부 사진 용량이 전송 한도를 초과했습니다. 사진을 다시 선택하면 자동으로 압축·변환하여 업로드합니다."
            : data?.error || "상세 편집 창을 준비하지 못했어요. 잠시 후 다시 시도해 주세요."
        );
      }
    } catch {
      if (selectedIdRef.current === targetId) {
        setActionAlert("네트워크 연결을 확인한 뒤 다시 눌러 주세요.");
      }
    } finally {
      setIsProvisioningSheet(false);
    }
  };

  const ensureProvisionedImTarget = async (
    actionLabel: string
  ): Promise<{ buildingId: string; documentId?: string } | null> => {
    const targetId = currentItem?.id || selectedIdRef.current;
    const originItem = currentItem;
    await waitForPendingPhotoCompressions();
    await autosave.flush();
    const existingBid = originItem?.buildingId || "";
    const existingDocId = originItem?.documentId;
    const reqAddress = address.trim();
    const reqPrice = askingPriceManwon;

    if (!reqAddress || !reqPrice || reqPrice <= 0) {
      if (UUID_REGEX.test(existingBid)) {
        return { buildingId: existingBid, documentId: existingDocId };
      }
      setActiveEditorTab("specs");
      setActionAlert(`${actionLabel} 기능을 쓰려면 주소와 희망 매매가를 먼저 입력해 주세요.`);
      return null;
    }

    const cleanProvisionTitle = imTitle.trim() === "새 IM" ? "" : imTitle.trim();
    const { buildingId: resolvedBid, legacyBuildingId: legacyBidForProvision } =
      resolveProvisionBuildingIds(originItem);
    const reqPayload = {
      buildingId: resolvedBid,
      ...(legacyBidForProvision ? { legacyBuildingId: legacyBidForProvision } : {}),
      ...buildCurrentRequestPayload(originItem, cleanProvisionTitle),
    };
    const parsedExtras = parseBrokerExtras(brokerExtrasFormToInput(brokerExtrasForm));
    const brokerExtrasPayload = parsedExtras.ok ? parsedExtras.value : brokerExtrasForm;
    const photosPayload = buildPhotosPayloadForRequest();

    setIsProvisioningSheet(true);
    setActionAlert(null);
    setActionAlertCode(null);
    try {
      const res = await fetch("/api/broker/im-lite/quick-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...reqPayload,
          brokerExtras: brokerExtrasPayload,
          photos: photosPayload,
          publishStatus: originItem?.status === "published" ? "published" : "draft",
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.buildingId) {
        const targetBid: string = data.buildingId;
        const targetDocId: string | undefined =
          typeof data.documentId === "string" && data.documentId
            ? data.documentId
            : existingDocId;
        const persistedAsDraft = data?.publishStatus === "draft";
        syncCurrentItemPatch(
          {
            buildingId: targetBid,
            ...(targetDocId ? { documentId: targetDocId } : {}),
            isDirty: false,
            ...(originItem?.status === "published" && !persistedAsDraft
              ? { hasUnpublishedEdits: false }
              : {}),
          },
          targetId
        );
        return { buildingId: targetBid, documentId: targetDocId };
      }
      if (res.status === 422 && (data?.code === "STATUTORY_DISCLOSURE_INCOMPLETE" || data?.missingLabels)) {
        if (selectedIdRef.current === targetId) {
          const missingStr =
            Array.isArray(data?.missingLabels) && data.missingLabels.length > 0
              ? ` (누락: ${data.missingLabels.join(", ")})`
              : "";
          setActionAlertCode("STATUTORY_DISCLOSURE_INCOMPLETE");
          setActionAlert(
            `${data?.error || "공인중개사법 표시·광고 법정 정보가 누락되어 발행할 수 없습니다."}${missingStr}`
          );
        }
        return null;
      }
      if (UUID_REGEX.test(existingBid)) {
        return { buildingId: existingBid, documentId: existingDocId };
      }
      if (selectedIdRef.current === targetId) {
        setActionAlertCode(null);
        setActionAlert(
          res.status === 413
            ? "첨부 사진 용량이 전송 한도를 초과했습니다. 사진을 다시 선택하면 자동으로 압축·변환하여 업로드합니다."
            : data?.error || `${actionLabel} 준비 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.`
        );
      }
      return null;
    } catch {
      if (UUID_REGEX.test(existingBid)) {
        return { buildingId: existingBid, documentId: existingDocId };
      }
      if (selectedIdRef.current === targetId) {
        setActionAlert("네트워크 연결을 확인한 뒤 다시 눌러 주세요.");
      }
      return null;
    } finally {
      setIsProvisioningSheet(false);
    }
  };

  const handleOpenStudio = async (e: React.MouseEvent<HTMLElement>) => {
    e.preventDefault();
    if (isProvisioningSheet) return;
    const target = await ensureProvisionedImTarget("10면 슬라이드 편집");
    if (target) {
      router.push("/broker/basic-im-studio/" + target.buildingId);
    }
  };

  const handleDownloadPptx = async (e?: React.MouseEvent<HTMLElement>) => {
    e?.preventDefault();
    if (isProvisioningSheet || isDownloadingPptx) return;
    const existingBid = currentItem?.buildingId || "";
    let targetBuildingId = existingBid;
    let targetDocId = currentItem?.documentId;

    if (
      !UUID_REGEX.test(existingBid) ||
      currentItem?.isDirty ||
      currentItem?.hasUnpublishedEdits
    ) {
      const target = await ensureProvisionedImTarget("PPTX 내려받기");
      if (!target) return;
      targetBuildingId = target.buildingId;
      targetDocId = target.documentId;
    }
    if (!targetBuildingId) return;

    const docQs = targetDocId
      ? `&doc=${encodeURIComponent(targetDocId)}&doc_id=${encodeURIComponent(targetDocId)}`
      : "";
    const url = `/api/public/im-lite/${encodeURIComponent(targetBuildingId)}/pptx?direct=1${docQs}`;

    setIsDownloadingPptx(true);
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        setActionAlert("PPTX 파일을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }
      const blob = await res.blob();
      if (typeof document !== "undefined") {
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        const safeName = (imTitle || currentItem?.title || "투자설명서")
          .replace(/[\\/:*?"<>|]/g, "_")
          .trim();
        a.download = `${safeName || "IM"}_투자설명서.pptx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 3000);
      }
      showUndoToast({
        message: "📊 PPTX 투자설명서 다운로드를 완료했습니다.",
        variant: "success",
      });
    } catch {
      setActionAlert("네트워크 오류로 PPTX 다운로드에 실패했습니다.");
    } finally {
      setIsDownloadingPptx(false);
    }
  };

  const handleDownloadPdf = async (e?: React.MouseEvent<HTMLElement>) => {
    e?.preventDefault();
    if (isProvisioningSheet || isDownloadingPdf || isDownloadingPptx) return;
    const existingBid = currentItem?.buildingId || "";
    let targetBuildingId = existingBid;
    let targetDocId = currentItem?.documentId;

    if (
      !UUID_REGEX.test(existingBid) ||
      currentItem?.isDirty ||
      currentItem?.hasUnpublishedEdits
    ) {
      const target = await ensureProvisionedImTarget("PDF 저장");
      if (!target) return;
      targetBuildingId = target.buildingId;
      targetDocId = target.documentId;
    }
    if (!targetBuildingId) return;

    setIsDownloadingPdf(true);
    try {
      const { exportSlidesToLandscapePdf } = await import(
        "@/lib/im-lite/slides-pdf-exporter"
      );
      const res = await exportSlidesToLandscapePdf({
        buildingId: targetBuildingId,
        docId: targetDocId,
        filename: imTitle || currentItem?.title || "투자설명서",
      });
      if (res.ok) {
        showUndoToast({
          message: `📄 16:9 가로형 PDF(${res.pageCount}면) 저장을 완료했습니다.`,
          variant: "success",
        });
      }
    } catch {
      setActionAlert("PDF 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handleCopyImShareLink = async () => {
    if (isProvisioningSheet || isGenerating) return;
    let targetBuildingId = currentItem?.buildingId || "";
    if (!UUID_REGEX.test(targetBuildingId) || currentItem?.isDirty || currentItem?.hasUnpublishedEdits) {
      const target = await ensureProvisionedImTarget("IM 링크 복사");
      if (!target) return;
      targetBuildingId = target.buildingId;
    }
    if (!targetBuildingId) return;
    const origin = typeof window !== "undefined" ? window.location.origin : "https://www.credeal.net";
    const shareUrl = `${origin}/im-lite/${encodeURIComponent(targetBuildingId)}`;
    const copied = await copyText(shareUrl);
    if (copied) {
      setIsShareLinkCopied(true);
      if (typeof window !== "undefined") {
        window.setTimeout(() => setIsShareLinkCopied(false), 2400);
      }
      showUndoToast({
        message: "🔗 모바일 IM 링크를 복사했어요! 카톡이나 대화창에 바로 붙여넣으세요.",
        variant: "success",
      });
    } else {
      setActionAlert(`직접 복사해 주세요: ${shareUrl}`);
    }
  };

  const handleOpenFullscreen = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    if (isProvisioningSheet) return;
    const existingBid = currentItem?.buildingId || "";
    const existingDocQs = currentItem?.documentId
      ? `?doc=${encodeURIComponent(currentItem.documentId)}`
      : "";
    if (
      UUID_REGEX.test(existingBid) &&
      !currentItem?.isDirty &&
      !currentItem?.hasUnpublishedEdits
    ) {
      setFullscreenModalUrl(`/im-lite/${encodeURIComponent(existingBid)}${existingDocQs}`);
      return;
    }
    const target = await ensureProvisionedImTarget("전체화면 미리보기");
    if (!target) {
      if (previewTab === "pptx") {
        setFullscreenModalUrl(
          `/im-lite/${encodeURIComponent(existingBid || "bld-01")}${existingDocQs}`
        );
      }
      return;
    }
    const docQs = target.documentId ? `?doc=${encodeURIComponent(target.documentId)}` : "";
    setFullscreenModalUrl(`/im-lite/${encodeURIComponent(target.buildingId)}${docQs}`);
  };

  const handleQuickGenerate = async () => {
    const targetId = currentItem?.id || selectedIdRef.current;
    const originItem = currentItem;
    await waitForPendingPhotoCompressions();
    setActionAlert(null);
    if (!address.trim()) {
      setActiveEditorTab("specs");
      setActionAlert("건물 주소를 입력하면 바로 IM을 만들 수 있어요.");
      return;
    }
    if (!askingPriceManwon || askingPriceManwon <= 0) {
      setActiveEditorTab("specs");
      setActionAlert("희망 매매가를 입력하면 바로 IM을 만들 수 있어요.");
      return;
    }

    const reqTitle = imTitle;
    const cleanReqTitle = reqTitle.trim() === "새 IM" ? "" : reqTitle.trim();
    const reqAddress = address.trim();
    const reqPrice = askingPriceManwon;
    const reqYield = Number(calculatedYield.toFixed(2));
    const reqRentRoll = [...rentRoll];
    const reqPosture = investmentPosture;
    const reqGfa = gfaSqm;
    const reqCompletion = completionDate;
    const reqLand = landAreaSqm;
    const reqZoning = zoning;
    const reqHandover = handoverNote;
    const reqBrokerName = brokerName;
    const reqBrokerageName = brokerageName;
    const reqBrokerPhone = brokerPhone;
    const reqExtrasForm = { ...brokerExtrasForm };
    const reqHighlights = axiosHighlights.map((h) => ({ ...h }));
    const latestPhotos =
      latestPhotoEntriesRef.current.length > 0
        ? [...latestPhotoEntriesRef.current]
        : [...photoEntries];

    setIsGenerating(true);
    try {
      const parsedExtras = parseBrokerExtras(brokerExtrasFormToInput(reqExtrasForm));
      const brokerExtrasPayload = parsedExtras.ok ? parsedExtras.value : reqExtrasForm;
      const photosPayload = buildPhotosPayloadForRequest();

      const { buildingId: resolvedBid, legacyBuildingId: legacyBidCandidate } =
        resolveProvisionBuildingIds(originItem);
      const res = await fetch("/api/broker/im-lite/quick-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buildingId: resolvedBid,
          ...(legacyBidCandidate ? { legacyBuildingId: legacyBidCandidate } : {}),
          ...buildCurrentRequestPayload(originItem, cleanReqTitle),
          brokerExtras: brokerExtrasPayload,
          photos: photosPayload,
          publishStatus: "published",
        }),
      });

      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        const resolvedTitle =
          cleanReqTitle ||
          (reqAddress.split(" ").slice(1, 3).join(" ") || "매물") + " 근생빌딩";
        const nextResolvedId =
          typeof data?.documentId === "string" && data.documentId
            ? data.documentId
            : targetId;
        const nextPublishStatus: "published" | "draft" =
          data?.publishStatus === "draft" ? "draft" : "published";
        const syncedPhotos = sanitizePhotosForSync(latestPhotos);
        setItems((prev) => {
          const nextItems = prev.map((it) =>
            it.id === targetId
              ? {
                  ...it,
                  id: nextResolvedId || it.id,
                  buildingId: data?.buildingId || it.buildingId,
                  ...(data?.documentId ? { documentId: data.documentId } : {}),
                  title: resolvedTitle,
                  address: reqAddress,
                  askingPriceManwon: reqPrice,
                  grossYieldPct: reqYield || it.grossYieldPct,
                  status: nextPublishStatus,
                  versionLabel: nextPublishStatus === "published" ? "발행됨" : "임시저장",
                  updatedAt: new Date().toISOString(),
                  rentRoll: reqRentRoll,
                  expectedRentRoll: [...expectedRentRoll],
                  ...(rentRollMeta ? { rentRollMeta } : {}),
                  ...(expectedRentRollMeta ? { expectedRentRollMeta } : {}),
                  investmentPosture: reqPosture,
                  gfaSqm: reqGfa,
                  completionDate: reqCompletion,
                  landAreaSqm: reqLand,
                  zoning: reqZoning,
                  handoverNote: reqHandover,
                  parcels: parcels ?? it.parcels,
                  photoNames: syncedPhotos.map((p) => p.name),
                  photos: syncedPhotos,
                  brokerName: reqBrokerName,
                  brokerageName: reqBrokerageName,
                  brokerPhone: reqBrokerPhone,
                  brokerExtrasForm: reqExtrasForm,
                  axiosHighlights: reqHighlights,
                  isDirty: false,
                  hasUnpublishedEdits: nextPublishStatus === "draft" && it.status === "published",
                  isSample: false,
                }
              : it
          );
          itemsRef.current = nextItems;
          persistImItems(nextItems);
          return nextItems;
        });
        if (
          originItem?.id &&
          originItem.buildingId &&
          !UUID_REGEX.test(originItem.buildingId) &&
          data?.buildingId &&
          originItem.buildingId !== data.buildingId
        ) {
          await fetch("/api/broker/workspace/summary", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "delete_im",
              buildingId: originItem.buildingId,
              imId: originItem.id,
            }),
          }).catch(() => {});
        }
        if (selectedIdRef.current === targetId) {
          if (!cleanReqTitle) {
            setImTitle(resolvedTitle);
          }
          if (nextResolvedId && nextResolvedId !== targetId) {
            selectedIdRef.current = nextResolvedId;
            setSelectedId(nextResolvedId);
          }
          if (data?.buildingId) {
            setBottomSheetBuildingId(data.buildingId);
          }
          const nextUrlBldId =
            String(data?.buildingId || "").trim() || originItem?.buildingId;
          if (typeof window !== "undefined" && nextUrlBldId) {
            try {
              const nextParams = new URLSearchParams(window.location.search);
              nextParams.set("buildingId", nextUrlBldId);
              nextParams.delete("id");
              nextParams.delete("fresh");
              if (nextParams.get("tab") === "list") {
                nextParams.set("tab", "editor");
              }
              inFlightSelfUrlIdsRef.current.add(nextUrlBldId);
              lastAppliedQueryIdRef.current = nextUrlBldId;
              pendingUrlBuildingIdRef.current = nextUrlBldId;
              router?.replace?.(`/broker/w/im?${nextParams.toString()}`, {
                scroll: false,
              });
            } catch {
              // Safe no-op
            }
          }
          autosave.markClean();
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("workspace:open-preview"));
          }
        }
        showUndoToast({
          message: "IM과 딜카드를 만들었어요! 미리보기 화면에서 확인하거나 내려받을 수 있습니다.",
          variant: "success",
        });
      } else if (selectedIdRef.current === targetId) {
        if (
          res.status === 422 &&
          (data?.code === "STATUTORY_DISCLOSURE_INCOMPLETE" || data?.missingLabels)
        ) {
          const missingStr =
            Array.isArray(data?.missingLabels) && data.missingLabels.length > 0
              ? ` (누락: ${data.missingLabels.join(", ")})`
              : "";
          setActionAlertCode("STATUTORY_DISCLOSURE_INCOMPLETE");
          setActionAlert(
            `${data?.error || "공인중개사법 표시·광고 법정 정보가 누락되어 발행할 수 없습니다."}${missingStr}`
          );
        } else {
          setActionAlertCode(null);
          setActionAlert(
            res.status === 413
              ? "첨부 사진 용량이 전송 한도를 초과했습니다. 사진을 다시 선택하면 자동으로 압축·변환하여 업로드합니다."
              : data?.error ||
                "IM을 만드는 중 문제가 생겼어요. 입력 내용을 확인하고 다시 눌러 주세요."
          );
        }
      }
    } catch {
      if (selectedIdRef.current === targetId) {
        setActionAlert("네트워크 연결을 확인한 뒤 다시 눌러 주세요.");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDuplicateIm = (source: ImListItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const dupIds = mintDuplicateImIds(source.buildingId);
    const newId = dupIds.id;
    const sourceLabel = source.title?.trim() || "새 IM";
    const cloned: ImListItem = {
      ...source,
      id: newId,
      buildingId: dupIds.buildingId,
      ...(currentUserIdRef.current ? { ownerUserId: currentUserIdRef.current } : {}),
      documentId: undefined,
      title: `${sourceLabel} (사본)`,
      status: "draft",
      versionLabel: "작성 중",
      updatedAt: new Date().toISOString(),
      isDirty: true,
      hasUnpublishedEdits: false,
      isSample: false,
    };
    const next = [cloned, ...items];
    itemsRef.current = next;
    setItems(next);
    persistImItems(next);
    selectImItem(newId, { listSnapshot: next });
    applyItemToFormState(cloned);
    showUndoToast({
      message: `'${sourceLabel}' IM을 복제했어요`,
      variant: "success",
    });
  };

  const executeDeleteIm = (target: ImListItem) => {
    const prevItems = [...items];
    const prevSelectedId = selectedId;
    const remaining = items.filter((it) => it.id !== target.id);
    const fallbackFreshIds = remaining.length === 0 ? mintUniqueFreshImIds() : null;
    const next =
      remaining.length > 0
        ? remaining
        : [
            createBlankImItem({
              id: fallbackFreshIds?.id,
              buildingId: fallbackFreshIds?.buildingId,
              ownerUserId: currentUserIdRef.current,
              brokerName: profileDefaultsRef.current.brokerName,
              brokerageName: profileDefaultsRef.current.brokerageName,
              brokerPhone: profileDefaultsRef.current.brokerPhone,
            }),
          ];
    itemsRef.current = next;
    setItems(next);
    persistImItems(next);
    if ((selectedId === target.id || remaining.length === 0) && next[0]) {
      selectImItem(next[0].id, { listSnapshot: next });
      applyItemToFormState(next[0]);
    }
    void fetch("/api/broker/workspace/summary", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "delete_im",
        buildingId: target.buildingId || target.id,
        imId: target.id,
      }),
    }).catch(() => {});

    showUndoToast({
      message: `'${target.title || "새 IM"}' IM을 삭제했습니다`,
      undoAction: () => {
        itemsRef.current = prevItems;
        setItems(prevItems);
        persistImItems(prevItems);
        selectImItem(prevSelectedId, { listSnapshot: prevItems });
        const restored = prevItems.find((i) => i.id === prevSelectedId);
        if (restored) applyItemToFormState(restored);
        void fetch("/api/broker/workspace/summary", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "restore_im",
            buildingId: target.buildingId || target.id,
            imId: target.id,
            imItem: target,
          }),
        }).catch(() => {});
      },
    });
  };

  const handleDeleteIm = (target: ImListItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setPendingDeleteIm(target);
  };

  const handleReclusterImAxios = async () => {
    const targetId = currentItem?.id || selectedIdRef.current;
    const prevHighlights = axiosHighlights.map((h) => ({
      ...h,
      ...(h.bullets ? { bullets: [...h.bullets] } : {}),
    }));
    const reqAddress = address;
    const reqTitle = imTitle;
    const reqPosture = investmentPosture;
    const reqPrice = askingPriceManwon;
    const reqGfa = gfaSqm;
    const reqLand = landAreaSqm;
    const reqZoning = zoning;
    const reqCompletion = completionDate;
    const reqHandover = handoverNote;
    const reqRentRoll = [...rentRoll];
    const reqTotalRent = totalRentManwon;
    const reqTotalDep = totalDepositManwon;
    const reqYield = calculatedYield;

    const commitGeneratedHighlights = (
      nextHighlights: ImAxiosHighlight[],
      message: string
    ) => {
      if (selectedIdRef.current === targetId) {
        setAxiosHighlights(nextHighlights);
      }
      syncCurrentItemPatch({ axiosHighlights: nextHighlights }, targetId);
      showUndoToast({
        message,
        variant: "success",
        undoAction: () => {
          if (selectedIdRef.current === targetId) {
            setAxiosHighlights(prevHighlights);
          }
          syncCurrentItemPatch({ axiosHighlights: prevHighlights }, targetId);
        },
      });
    };

    setIsAiPointsBusy(true);
    setActionAlert(null);

    try {
      const rentSummary = reqRentRoll
        .map(
          (r) =>
            `${r.floor} ${r.tenantName ? `${r.tenantName}(${r.use})` : r.use} 보증금 ${
              r.depositManwon || 0
            }만/월세 ${r.monthlyRentManwon || 0}만${
              r.status === "vacant"
                ? " [공실]"
                : r.status === "owner"
                ? " [자가사용]"
                : ""
            }`
        )
        .join(", ")
        .slice(0, 1150);
      const reqTenantNames = Array.from(
        new Set(
          reqRentRoll
            .map((r) => String(r.tenantName || r.use || "").trim())
            .filter((n) => n.length >= 2 && n !== "공실" && n !== "자가사용")
        )
      ).slice(0, 30);
      const reqVacantCount = reqRentRoll.filter((r) => r.status === "vacant").length;
      const reqOwnerCount = reqRentRoll.filter((r) => r.status === "owner").length;
      const res = await fetch("/api/broker/im/ai-points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: reqAddress,
          title: reqTitle,
          posture: reqPosture,
          askingPriceManwon: reqPrice,
          gfaSqm: reqGfa,
          landAreaSqm: reqLand,
          zoning: reqZoning,
          completionDate: reqCompletion,
          rentRollSummary: rentSummary,
          totalDepositManwon: reqTotalDep,
          totalRentManwon: reqTotalRent,
          calculatedYieldPct:
            Number.isFinite(reqYield) && reqYield > 0
              ? Number(reqYield.toFixed(2))
              : undefined,
          ...(reqHandover ? { handoverNote: reqHandover } : {}),
          ...(typeof bcrPct === "number" && bcrPct > 0 ? { bcrPct } : {}),
          ...(typeof farPct === "number" && farPct > 0 ? { farPct } : {}),
          ...(typeof parkingTotal === "number" && parkingTotal >= 0
            ? { parkingSpaces: parkingTotal }
            : {}),
          ...(typeof elevatorCount === "number" && elevatorCount >= 0
            ? { elevators: elevatorCount }
            : {}),
          ...(typeof officialLandPricePerSqm === "number" && officialLandPricePerSqm > 0
            ? { officialLandPriceWonSqm: officialLandPricePerSqm }
            : {}),
          ...(Array.isArray(parcels) && parcels.length >= 2
            ? { parcelsCount: parcels.length }
            : {}),
          ...(reqTenantNames.length > 0 ? { tenantNames: reqTenantNames } : {}),
          vacantCount: reqVacantCount,
          ownerUseCount: reqOwnerCount,
        }),
      });
      const data = await res.json().catch(() => null);
      if (
        res.ok &&
        data?.ok &&
        Array.isArray(data.result?.points) &&
        data.result.points.length === 3
      ) {
        const tones: Array<"amber" | "sky" | "mint"> = ["amber", "sky", "mint"];
        const nextHighlights: ImAxiosHighlight[] = data.result.points
          .slice(0, 3)
          .map((p: { title: string; body: string }, idx: number) => ({
            headline: p.title,
            brief: p.body,
            tone: tones[idx] || "amber",
          }));
        commitGeneratedHighlights(nextHighlights, "AI가 장점 3가지를 작성했어요");
        return;
      }
    } catch {
      // Fallback below
    } finally {
      setIsAiPointsBusy(false);
    }

    const fallbackHighlights = buildFallbackImHighlights({
      address: reqAddress,
      askingPriceManwon: reqPrice,
      calculatedYield: reqYield,
      investmentPosture: reqPosture,
      gfaSqm: reqGfa,
      handoverNote: reqHandover,
      zoning: reqZoning,
      rentRollLength: reqRentRoll.length,
      totalRentManwon: reqTotalRent,
      totalDepositManwon: reqTotalDep,
    });
    commitGeneratedHighlights(
      fallbackHighlights,
      "매물 정보에 맞춰 장점 3가지를 채웠어요"
    );
  };

  const normalizedPosture = normalizePostureForSelector(investmentPosture);
  const postureKoreanLabel = IM_POSTURE_LABELS[investmentPosture] || "임대수익용";

  const hasMeaningfulImInput = Boolean(
    address.trim() ||
      (askingPriceManwon ?? 0) > 0 ||
      (imTitle.trim() && imTitle.trim() !== "새 IM") ||
      gfaSqm.trim() ||
      landAreaSqm.trim() ||
      zoning.trim() ||
      completionDate.trim() ||
      handoverNote.trim() ||
      axiosHighlights.some((h) => h.headline.trim() || h.brief.trim()) ||
      photoEntries.length > 0 ||
      photoNames.length > 0 ||
      rentRoll.some(
        (r) =>
          (r.depositManwon || 0) > 0 ||
          (r.monthlyRentManwon || 0) > 0 ||
          (r.maintenanceManwon || 0) > 0 ||
          Boolean(r.tenantName?.trim()) ||
          (Boolean(r.leaseExpiry?.trim()) && r.leaseExpiry !== "-")
      )
  );

  const previewLifecycle: PreviewLifecycleState =
    currentItem?.status === "published"
      ? currentItem.hasUnpublishedEdits || currentItem.isDirty
        ? "published_dirty"
        : "published_clean"
      : hasMeaningfulImInput
      ? "live_draft"
      : "pre_generation";

  const generateButtonLabel = isGenerating
    ? "IM 만드는 중…"
    : previewLifecycle === "published_dirty"
    ? "변경사항 IM에 다시 반영하기"
    : previewLifecycle === "published_clean"
    ? `✓ ${TERMS.createIm} 완료 (다시 반영하기)`
    : TERMS.createIm;

  const imSyncUnits = buildImSyncUnits({
    askingPriceManwon,
    onOpenBrokerSection: () => {
      brokerSectionTouchedRef.current = true;
      setIsBrokerSectionOpen(true);
    },
  });

  const sync = useEditorPreviewSync({
    units: imSyncUnits,
    onSelectTab: (tab) => {
      setActionAlert(null);
      setActiveEditorTab(tab);
    },
  });

  const highlight2CategoryLabel =
    normalizedPosture === "owner_occupied"
      ? "장점 02 · 사옥 활용·입주"
      : normalizedPosture === "development" ||
        normalizedPosture === "trading" ||
        normalizedPosture === "operating"
      ? "장점 02 · 개발·토지 가치"
      : "장점 02 · 수익률";

  const postitStyles: Record<"amber" | "sky" | "mint", ImPostitStyle> = {
    amber: {
      bg: "rgba(255, 149, 0, 0.085)",
      border: "rgba(255, 149, 0, 0.28)",
      badgeBg: "rgba(255, 149, 0, 0.14)",
      badgeText: "#8A4B00",
      label: "장점 01 · 입지·임차",
    },
    sky: {
      bg: "rgba(0, 122, 255, 0.08)",
      border: "rgba(0, 122, 255, 0.25)",
      badgeBg: "rgba(0, 122, 255, 0.14)",
      badgeText: "#0040DD",
      label: highlight2CategoryLabel,
    },
    mint: {
      bg: "rgba(40, 205, 65, 0.085)",
      border: "rgba(40, 205, 65, 0.28)",
      badgeBg: "rgba(40, 205, 65, 0.14)",
      badgeText: "#116B22",
      label: "장점 03 · 건물·토지 가치",
    },
  };

  const cleanCoverTitle =
    (imTitle.trim() && imTitle.trim() !== "새 IM" ? imTitle.trim() : "") ||
    (currentItem?.title && currentItem.title !== "새 IM"
      ? currentItem.title.trim()
      : "");

  const basicImSlides = buildBasicImSlides({
    cleanCoverTitle,
    address,
    askingPriceManwon,
    postureKoreanLabel,
    axiosHighlights,
    calculatedYield,
    expectedYieldPct,
    expectedRentRollLength: expectedRentRoll.length,
    compCount: (brokerExtrasForm.compRows || []).length,
    gfaSqm,
    completionDate,
    rentRollLength: rentRoll.length,
    landAreaSqm,
    zoning,
    totalDepositManwon,
    totalRentManwon,
    photoEntries,
    closingLine: brokerExtrasForm.closingLine,
    handoverNote,
    brokerageName,
    brokerName,
    brokerPhone,
  });

  const renderSlideVisualCard = (slide: (typeof basicImSlides)[number]) => (
    <ImSlideVisualCard
      slide={slide}
      totalSlides={basicImSlides.length}
      activeUnitId={sync.activeUnitId}
      onFocusUnit={sync.focusEditorUnit}
      onCloseFullscreenIfOpen={
        fullscreenModalUrl ? () => setFullscreenModalUrl(null) : undefined
      }
      postureKoreanLabel={postureKoreanLabel}
      axiosHighlights={axiosHighlights}
      rentRoll={rentRoll}
      photoEntries={photoEntries}
      zoning={zoning}
      gfaSqm={gfaSqm}
      totalRentManwon={totalRentManwon}
      brokerageName={brokerageName}
    />
  );

  const selectedItemActionsNode = null;

  return (
    <>
      <WorkspaceShell
        workspace="im"
        listTitle="매물 선택"
        editorTitle="내용 입력"
        previewTitle="미리보기 · 발행"
        listSlot={
          <ImListSidebar
            filteredItems={filteredItems}
            selectedItemId={currentItem?.id || selectedId}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            postureFilter={postureFilter}
            onPostureFilterChange={handleImPostureFilterChange}
            onCreateNew={handleCreateNew}
            onSelectItem={(id) => selectImItem(id)}
            onDuplicateItem={handleDuplicateIm}
            onDeleteItem={handleDeleteIm}
          />
        }
        editorSlot={
          <ImEditorPanels
            currentItem={currentItem}
            selectedId={selectedId}
            activeEditorTab={activeEditorTab}
            onChangeEditorTab={setActiveEditorTab}
            selectedItemActionsNode={selectedItemActionsNode}
            isProvisioningSheet={isProvisioningSheet}
            onOpenBottomSheet={handleOpenBottomSheet}
            isDownloadingPptx={isDownloadingPptx}
            actionAlert={actionAlert}
            actionAlertCode={actionAlertCode}
            onClearActionAlert={() => {
              setActionAlert(null);
              setActionAlertCode(null);
            }}
            onNotifyEditorFocus={sync.notifyEditorFocus}
            onCreateNew={handleCreateNew}
            normalizedPosture={normalizedPosture}
            onChangePosture={(id) => {
              setInvestmentPosture(id);
              syncCurrentItemPatch({ investmentPosture: id });
            }}
            imTitle={imTitle}
            onChangeTitle={(next) => {
              setImTitle(next);
              syncCurrentItemPatch({ title: next });
            }}
            address={address}
            onChangeAddress={(nextVal) => {
              const didChangeAddr = nextVal.trim() !== address.trim();
              setAddress(nextVal);
              if (didChangeAddr) {
                setParcels(undefined);
                setOfficialLandPricePerSqm(undefined);
                syncCurrentItemPatch({
                  address: nextVal,
                  pnu: undefined,
                  lat: undefined,
                  lng: undefined,
                  officialLandPricePerSqm: undefined,
                  parcels: undefined,
                  isSample: false,
                });
              } else {
                syncCurrentItemPatch({ address: nextVal });
              }
            }}
            isLookingUpAddress={isLookingUpAddress}
            onLookupAddress={handleLookupAddress}
            pnu={currentItem?.pnu}
            buildingFloors={buildingRegisterFloors}
            parcels={parcels}
            askingPriceManwon={askingPriceManwon}
            priceBandStr={priceBandStr}
            formattedWonDisplay={formattedWonDisplay}
            onWonFocus={() => {
              setWonInputFocused(true);
              setWonDraft(
                askingPriceManwon > 0
                  ? (askingPriceManwon * 10000).toLocaleString("ko-KR")
                  : ""
              );
            }}
            onWonBlur={() => {
              setWonInputFocused(false);
              setWonDraft(
                askingPriceManwon > 0
                  ? (askingPriceManwon * 10000).toLocaleString("ko-KR")
                  : ""
              );
            }}
            onWonPriceChange={handleWonPriceChange}
            isPriceCalcOpen={isPriceCalcOpen}
            onTogglePriceCalc={() => setIsPriceCalcOpen((prev) => !prev)}
            onSetDirectAskingPriceManwon={(nextPrice) => {
              setAskingPriceManwon(nextPrice);
              setWonDraft(
                nextPrice > 0 ? (nextPrice * 10000).toLocaleString("ko-KR") : ""
              );
              syncCurrentItemPatch({ askingPriceManwon: nextPrice });
            }}
            priceEokPart={priceEokPart}
            priceManwonRemainder={priceManwonRemainder}
            onSplitPriceChange={handleSplitPriceChange}
            gfaSqm={gfaSqm}
            onChangeGfaSqm={(next) => {
              setGfaSqm(next);
              syncCurrentItemPatch({ gfaSqm: next });
            }}
            landAreaSqm={landAreaSqm}
            onChangeLandAreaSqm={(next) => {
              setLandAreaSqm(next);
              syncCurrentItemPatch({ landAreaSqm: next });
            }}
            onSwapGfaAndLand={() => {
              const prevGfa = gfaSqm;
              const prevLand = landAreaSqm;
              setGfaSqm(prevLand);
              setLandAreaSqm(prevGfa);
              syncCurrentItemPatch({ gfaSqm: prevLand, landAreaSqm: prevGfa });
            }}
            zoning={zoning}
            onChangeZoning={(next) => {
              setZoning(next);
              syncCurrentItemPatch({ zoning: next });
            }}
            completionDate={completionDate}
            onChangeCompletionDate={(next) => {
              setCompletionDate(next);
              syncCurrentItemPatch({ completionDate: next });
            }}
            rentRoll={rentRoll}
            onChangeRentRoll={(nextRows) => {
              latestRentRollRef.current = nextRows;
              setRentRoll(nextRows);
              syncCurrentItemPatch({ rentRoll: nextRows });
            }}
            expectedRentRoll={expectedRentRoll}
            onChangeExpectedRentRoll={(nextRows) => {
              setExpectedRentRoll(nextRows);
              syncCurrentItemPatch({ expectedRentRoll: nextRows });
            }}
            onCopyActualToExpectedRentRoll={() => {
              const cloned = rentRoll.map((r) => ({
                ...r,
                status: r.status === "vacant" ? ("occupied" as const) : r.status,
              }));
              setExpectedRentRoll(cloned);
              syncCurrentItemPatch({ expectedRentRoll: cloned });
            }}
            totalDepositManwon={totalDepositManwon}
            totalRentManwon={totalRentManwon}
            calculatedYield={calculatedYield}
            expectedDepositManwon={expectedDepositManwon}
            expectedRentManwon={expectedRentManwon}
            expectedYieldPct={expectedYieldPct}
            isRentRollImportOpen={isRentRollImportOpen}
            onToggleRentRollImport={() => setIsRentRollImportOpen((prev) => !prev)}
            onExcelRentRollImport={handleExcelRentRollImport}
            onExpectedExcelRentRollImport={handleExpectedExcelRentRollImport}
            compRows={brokerExtrasForm.compRows || []}
            onChangeCompRows={(nextCompRows) => {
              const nextForm = { ...brokerExtrasForm, compRows: nextCompRows };
              setBrokerExtrasForm(nextForm);
              syncCurrentItemPatch({ brokerExtrasForm: nextForm });
            }}
            axiosHighlights={axiosHighlights}
            onChangeAxiosHighlights={(next) => {
              setAxiosHighlights(next);
              syncCurrentItemPatch({ axiosHighlights: next });
            }}
            postitStyles={postitStyles}
            isAiPointsBusy={isAiPointsBusy}
            onReclusterImAxios={handleReclusterImAxios}
            isBrokerSectionOpen={isBrokerSectionOpen}
            onToggleBrokerSection={() => setIsBrokerSectionOpen((prev) => !prev)}
            onMarkBrokerSectionTouched={() => {
              brokerSectionTouchedRef.current = true;
            }}
            handoverNote={handoverNote}
            onChangeHandoverNote={(next) => {
              setHandoverNote(next);
              syncCurrentItemPatch({ handoverNote: next });
            }}
            brokerageName={brokerageName}
            onChangeBrokerageName={(next) => {
              setBrokerageName(next);
              syncCurrentItemPatch({ brokerageName: next });
            }}
            brokerName={brokerName}
            onChangeBrokerName={(next) => {
              setBrokerName(next);
              syncCurrentItemPatch({ brokerName: next });
            }}
            brokerPhone={brokerPhone}
            onChangeBrokerPhone={(next) => {
              setBrokerPhone(next);
              syncCurrentItemPatch({ brokerPhone: next });
            }}
            photoEntries={photoEntries}
            photoNames={photoNames}
            isDraggingPhotos={isDraggingPhotos}
            onSetDraggingPhotos={setIsDraggingPhotos}
            isCompressingPhotos={isCompressingPhotos}
            onFilesSelected={handlePhotoFilesSelected}
            onUpdatePhotoMeta={handleUpdatePhotoMeta}
            onReorderPhoto={handleReorderPhoto}
            onRemovePhotoAtIndex={handleRemovePhotoAtIndex}
            isGenerating={isGenerating}
            isShareLinkCopied={isShareLinkCopied}
            generateButtonLabel={generateButtonLabel}
            onQuickGenerate={handleQuickGenerate}
            onCopyShareLink={handleCopyImShareLink}
          />
        }
        previewSlot={
          <ImPreviewPane
            currentItem={currentItem}
            previewLifecycle={previewLifecycle}
            previewTab={previewTab}
            isGenerating={isGenerating}
            isProvisioningSheet={isProvisioningSheet}
            activeUnitId={sync.activeUnitId}
            onFocusEditorUnit={sync.focusEditorUnit}
            onQuickGenerate={handleQuickGenerate}
            onOpenFullscreen={handleOpenFullscreen}
            cleanCoverTitle={cleanCoverTitle}
            address={address}
            askingPriceManwon={askingPriceManwon}
            calculatedYield={calculatedYield}
            postureKoreanLabel={postureKoreanLabel}
            photoEntries={photoEntries}
            axiosHighlights={axiosHighlights}
            postitStyles={postitStyles}
            gfaSqm={gfaSqm}
            completionDate={completionDate}
            landAreaSqm={landAreaSqm}
            zoning={zoning}
            rentRoll={rentRoll}
            expectedRentRoll={expectedRentRoll}
            totalDepositManwon={totalDepositManwon}
            totalRentManwon={totalRentManwon}
            expectedDepositManwon={expectedDepositManwon}
            expectedRentManwon={expectedRentManwon}
            expectedYieldPct={expectedYieldPct}
            compRows={brokerExtrasForm.compRows || []}
            lat={currentItem?.lat}
            lng={currentItem?.lng}
            cadastralImageUrl={
              (currentItem?.brokerExtras?.enrichment?.cadastralMapImage as string | undefined) ||
              undefined
            }
            brokerageName={brokerageName}
            brokerName={brokerName}
            brokerPhone={brokerPhone}
            handoverNote={handoverNote}
            activeSlideFilter={activeSlideFilter}
            onChangeSlideFilter={setActiveSlideFilter}
            basicImSlides={basicImSlides}
            renderSlideCard={renderSlideVisualCard}
          />
        }
        previewTabSlot={
          <ImPreviewTabSwitcher
            previewTab={previewTab}
            onChangePreviewTab={setPreviewTab}
            slideCount={basicImSlides.length}
          />
        }
        primaryActionSlot={
          <ImBottomActionBar
            isGenerating={isGenerating}
            isProvisioningSheet={isProvisioningSheet}
            isDownloadingPptx={isDownloadingPptx}
            isDownloadingPdf={isDownloadingPdf}
            isShareLinkCopied={isShareLinkCopied}
            previewLifecycle={previewLifecycle}
            generateButtonLabel={generateButtonLabel}
            onQuickGenerate={handleQuickGenerate}
            onCopyShareLink={handleCopyImShareLink}
            onDownloadPptx={handleDownloadPptx}
            onDownloadPdf={handleDownloadPdf}
            onOpenStudio={handleOpenStudio}
          />
        }
        saveState={autosave.status}
        lastSavedAt={autosave.lastSavedAt}
        onRetrySave={() => {
          void autosave.flush();
        }}
        onManualSync={() => {
          void handleManualSync();
        }}
        isSyncing={isManualSyncing}
        selectedBuildingId={selectedId}
        selectedLabel={imTitle || currentItem?.title || "새 IM"}
        onBuildingSelect={(id) => selectImItem(id)}
      />

      <ImDataBottomSheet
        key={bottomSheetBuildingId}
        buildingId={bottomSheetBuildingId}
        isOpen={isBottomSheetOpen}
        onClose={() => setIsBottomSheetOpen(false)}
        initialAddress={address}
        prefillAskingPrice={askingPriceManwon}
        prefillTotalDeposit={totalDepositManwon}
        prefillMonthlyRent={totalRentManwon}
        initialInvestmentPosture={normalizedPosture}
      />

      <ConfirmDeleteModal
        isOpen={pendingDeleteIm !== null}
        title={`'${pendingDeleteIm?.title || "새 IM"}'을(를) 삭제할까요?`}
        description={
          pendingDeleteIm?.status === "published"
            ? "이미 발행된 IM 자료입니다. 삭제하더라도 하단 되돌리기 버튼으로 잠시 복구할 수 있습니다."
            : "삭제한 IM은 하단 되돌리기 버튼으로 잠시 복구할 수 있습니다."
        }
        requireMatchText={
          pendingDeleteIm &&
          pendingDeleteIm.status === "published" &&
          !isSampleSeedImItem(pendingDeleteIm) &&
          pendingDeleteIm.title?.trim() &&
          pendingDeleteIm.title.trim() !== "새 IM"
            ? pendingDeleteIm.title.trim()
            : undefined
        }
        matchInputLabel="삭제를 확정하려면 위 IM 제목을 그대로 입력해 주세요."
        onCancel={() => setPendingDeleteIm(null)}
        onConfirm={() => {
          if (pendingDeleteIm) {
            executeDeleteIm(pendingDeleteIm);
          }
          setPendingDeleteIm(null);
        }}
      />

      <ImFullscreenModal
        fullscreenModalUrl={fullscreenModalUrl}
        title={imTitle || currentItem?.title || "IM 전체화면 미리보기"}
        previewTab={previewTab}
        onChangePreviewTab={setPreviewTab}
        onClose={() => setFullscreenModalUrl(null)}
        basicImSlides={basicImSlides}
        renderSlideCard={renderSlideVisualCard}
      />
    </>
  );
}

export default function ImWorkspacePage() {
  return (
    <UndoToastProvider>
      <Suspense fallback={<div className="p-8 text-center text-[#475569]">IM 작업 공간 로딩 중...</div>}>
        <ImWorkspaceInner />
      </Suspense>
    </UndoToastProvider>
  );
}
