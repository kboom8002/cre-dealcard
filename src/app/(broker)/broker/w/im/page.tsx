"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import { RentRollGrid, generateFloorScaffolding } from "@/components/workspace/RentRollGrid";
import type { RentRollRowItem } from "@/lib/rent-roll/tsv-parser";
import { formatKoreanCurrencyReadout } from "@/lib/rent-roll/tsv-parser";
import { formatPriceRange } from "@/lib/deal-card/price-band";
import { UndoToastProvider, useUndoToast } from "@/components/workspace/UndoConfirmToast";
import { ImDataBottomSheet } from "@/app/(broker)/broker/deal-card/[id]/im-data-bottom-sheet";
import {
  RentRollImporter,
  type RentRollImportPayload,
} from "@/components/broker/rent-roll-importer";
import {
  EMPTY_BROKER_EXTRAS_FORM,
  brokerExtrasFormToInput,
  parseBrokerExtras,
  type BrokerExtrasFormState,
} from "@/domain/building/mobile-im/broker-extras";
import { useWorkspaceAutosave } from "@/lib/hooks/useWorkspaceAutosave";
import { IM_POSTURE_LABELS, TERMS } from "@/lib/ux/lexicon";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizePostureForSelector(raw?: string): string {
  if (!raw || raw === "core_income") return "income";
  if (raw === "owner_occupier") return "owner_occupied";
  return raw;
}

interface ImAxiosHighlight {
  headline: string;
  brief: string;
  tone: "amber" | "sky" | "mint";
}

interface ImPhotoEntry {
  name: string;
  previewUrl?: string;
}

interface ImListItem {
  id: string;
  buildingId: string;
  title: string;
  address: string;
  askingPriceManwon?: number;
  grossYieldPct: number;
  status: "draft" | "review" | "approved" | "published";
  versionLabel: string;
  updatedAt: string;
  rentRoll?: RentRollRowItem[];
  investmentPosture?: string;
  gfaSqm?: string;
  completionDate?: string;
  landAreaSqm?: string;
  zoning?: string;
  handoverNote?: string;
  photoNames?: string[];
  brokerName?: string;
  brokerageName?: string;
  brokerPhone?: string;
  brokerExtrasForm?: BrokerExtrasFormState;
  axiosHighlights?: ImAxiosHighlight[];
  isDirty?: boolean;
}

const DEFAULT_IM_AXIOS_HIGHLIGHTS: ImAxiosHighlight[] = [
  {
    headline: "역세권 도보 3분 코너 · 전 층 우량 임차인 만실 운영",
    brief:
      "지하철역 주동선 코너에 위치해 유동인구 흡인력과 상권 가시성이 검증된 입지입니다. 1층 카페와 상층부 오피스 임차인이 장기 계약으로 안정적인 현금흐름을 창출합니다.",
    tone: "amber",
  },
  {
    headline: "순투자금 대비 연 4.2% 안정 배당 · 공실 위험 낮음",
    brief:
      "보증금과 월 임대료 구조가 탄탄하여 인수 즉시 안정적인 배당 수익 확보가 가능합니다. 인근 유사 규모 근생빌딩 대비 임대료 수준이 합리적이어서 임차인 유지율이 높습니다.",
    tone: "sky",
  },
  {
    headline: "제3종일반주거지역 토지 가치 · 중장기 리모델링 여력",
    brief:
      "대지면적 420.5㎡의 반듯한 코너 토지로 향후 외관 개선 및 업종 재구성 시 임대수익과 자산가치 동반 상승이 기대됩니다.",
    tone: "mint",
  },
];

const BLANK_IM_HIGHLIGHTS: ImAxiosHighlight[] = [
  { headline: "", brief: "", tone: "amber" },
  { headline: "", brief: "", tone: "sky" },
  { headline: "", brief: "", tone: "mint" },
];

const INITIAL_IM_LIST: ImListItem[] = [
  {
    id: "im-doc-01",
    buildingId: "bld-01",
    title: "영등포구 양평동 꼬마빌딩",
    address: "서울특별시 영등포구 양평동 11-47",
    askingPriceManwon: 950000,
    grossYieldPct: 4.2,
    status: "draft",
    versionLabel: "작성 중",
    updatedAt: "방금",
    investmentPosture: "core_income",
    gfaSqm: "1450.2",
    completionDate: "2018-06-15",
    landAreaSqm: "420.5",
    zoning: "제3종일반주거지역",
    handoverNote: "잔금 시 전층 명도 조건 협의 완료",
    photoNames: [],
    rentRoll: [
      {
        id: "r-b1",
        floor: "B1",
        unit: "B101호",
        use: "스튜디오/창고",
        depositManwon: 5000,
        monthlyRentManwon: 250,
        maintenanceManwon: 30,
        leaseExpiry: "27.05",
        status: "occupied",
      },
      {
        id: "r-1f",
        floor: "1F",
        unit: "101호",
        use: "프랜차이즈 카페",
        depositManwon: 15000,
        monthlyRentManwon: 750,
        maintenanceManwon: 50,
        leaseExpiry: "28.03",
        status: "occupied",
      },
      {
        id: "r-2f",
        floor: "2F",
        unit: "201호",
        use: "IT 오피스",
        depositManwon: 6000,
        monthlyRentManwon: 320,
        maintenanceManwon: 40,
        leaseExpiry: "27.11",
        status: "occupied",
      },
    ],
  },
];

const INITIAL_IM_IDS = new Set(INITIAL_IM_LIST.map((it) => it.id));
const IM_STORAGE_KEY = "credeal-w-im-v4";

function ImWorkspaceInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showUndoToast } = useUndoToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [items, setItems] = useState<ImListItem[]>(INITIAL_IM_LIST);
  const [searchQuery, setSearchQuery] = useState("");
  const [postureFilter, setPostureFilter] = useState<"all" | "income" | "owner" | "value_dev">("all");
  const [activeEditorTab, setActiveEditorTab] = useState<
    "specs" | "rentroll" | "axios_brief" | "media_publish"
  >("specs");
  const [activeSlideFilter, setActiveSlideFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string>(items[0]?.id || "");
  const [previewTab, setPreviewTab] = useState<"mobile" | "pptx">("mobile");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAiPointsBusy, setIsAiPointsBusy] = useState(false);
  const [isLookingUpAddress, setIsLookingUpAddress] = useState(false);
  const [actionAlert, setActionAlert] = useState<string | null>(null);
  const [photoEntries, setPhotoEntries] = useState<ImPhotoEntry[]>([]);

  const buildingIdParam = searchParams.get("buildingId") || searchParams.get("id");

  const persistImItems = useCallback((next: ImListItem[]) => {
    try {
      window.localStorage.setItem(IM_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }, []);

  const currentItem = useMemo(() => {
    return items.find((i) => i.id === selectedId) || items[0];
  }, [items, selectedId]);

  const [imTitle, setImTitle] = useState<string>(currentItem?.title || "");
  const [address, setAddress] = useState<string>(currentItem?.address || "");
  const [askingPriceManwon, setAskingPriceManwon] = useState<number>(
    currentItem?.askingPriceManwon ?? 950000
  );
  const [rentRoll, setRentRoll] = useState<RentRollRowItem[]>(
    currentItem?.rentRoll || generateFloorScaffolding(3, 1)
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
    currentItem?.brokerExtrasForm || { ...EMPTY_BROKER_EXTRAS_FORM, regulatoryRows: [], compRows: [] }
  );
  const [axiosHighlights, setAxiosHighlights] = useState<ImAxiosHighlight[]>(
    currentItem?.axiosHighlights || DEFAULT_IM_AXIOS_HIGHLIGHTS
  );
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false);
  const [bottomSheetBuildingId, setBottomSheetBuildingId] = useState<string>(
    currentItem?.buildingId || "bld-01"
  );
  const [isProvisioningSheet, setIsProvisioningSheet] = useState(false);
  const profileDefaultsRef = useRef<{
    brokerName: string;
    brokerageName: string;
    brokerPhone: string;
  }>({
    brokerName: "",
    brokerageName: "",
    brokerPhone: "",
  });

  const applyItemToFormState = useCallback((item: ImListItem) => {
    setImTitle(item.title || "");
    setAddress(item.address || "");
    setAskingPriceManwon(item.askingPriceManwon ?? 0);
    setRentRoll(item.rentRoll || generateFloorScaffolding(3, 1));
    setInvestmentPosture(item.investmentPosture || "core_income");
    setGfaSqm(item.gfaSqm ?? "");
    setCompletionDate(item.completionDate ?? "");
    setLandAreaSqm(item.landAreaSqm ?? "");
    setZoning(item.zoning ?? "");
    setHandoverNote(item.handoverNote ?? "");
    setPhotoNames(item.photoNames ?? []);
    setBrokerName(item.brokerName || profileDefaultsRef.current.brokerName || "");
    setBrokerageName(item.brokerageName || profileDefaultsRef.current.brokerageName || "");
    setBrokerPhone(item.brokerPhone || profileDefaultsRef.current.brokerPhone || "");
    setBrokerExtrasForm(
      item.brokerExtrasForm || { ...EMPTY_BROKER_EXTRAS_FORM, regulatoryRows: [], compRows: [] }
    );
    setAxiosHighlights(item.axiosHighlights || DEFAULT_IM_AXIOS_HIGHLIGHTS);
    setBottomSheetBuildingId(item.buildingId || "bld-01");
  }, []);

  useEffect(() => {
    fetch("/api/broker/profile")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        const p = json?.data;
        if (!p) return;
        const pName = p.display_name || p.broker?.name || "";
        const pCompany = p.company || "";
        const pPhone = p.phone || "";
        profileDefaultsRef.current = {
          brokerName: pName,
          brokerageName: pCompany,
          brokerPhone: pPhone,
        };
        setBrokerName((prev) => prev || pName);
        setBrokerageName((prev) => prev || pCompany);
        setBrokerPhone((prev) => prev || pPhone);
      })
      .catch(() => {
        // Non-blocking fallback
      });
  }, []);

  // Calculate yield & rent totals
  const totalRentManwon = useMemo(() => {
    return (
      Math.round(
        rentRoll.reduce(
          (s, r) =>
            s +
            (r.status !== "vacant"
              ? Number(r.monthlyRentManwon ?? (r as unknown as Record<string, unknown>).rent_manwon ?? 0)
              : 0),
          0
        ) * 10
      ) / 10
    );
  }, [rentRoll]);

  const totalDepositManwon = useMemo(() => {
    return (
      Math.round(
        rentRoll.reduce(
          (s, r) =>
            s +
            (r.status !== "vacant"
              ? Number(r.depositManwon ?? (r as unknown as Record<string, unknown>).deposit_manwon ?? 0)
              : 0),
          0
        ) * 10
      ) / 10
    );
  }, [rentRoll]);

  const calculatedYield = useMemo(() => {
    if (!askingPriceManwon || askingPriceManwon <= 0) return 0;
    const netInvestment = askingPriceManwon - totalDepositManwon;
    if (netInvestment <= 0) return 0;
    const rawYield = ((totalRentManwon * 12) / netInvestment) * 100;
    if (rawYield > 0) return rawYield;
    const normP = normalizePostureForSelector(investmentPosture);
    if (
      normP !== "owner_occupied" &&
      normP !== "development" &&
      currentItem?.grossYieldPct &&
      currentItem.grossYieldPct > 0 &&
      !currentItem.isDirty
    ) {
      return currentItem.grossYieldPct;
    }
    return 0;
  }, [askingPriceManwon, totalRentManwon, totalDepositManwon, investmentPosture, currentItem]);

  const [isHydrated, setIsHydrated] = useState(false);

  const autosave = useWorkspaceAutosave<ImListItem | undefined>({
    id: selectedId || null,
    ready: isHydrated,
    data: currentItem,
    debounceMs: 900,
    onSave: async ({ data: draftItem }) => {
      if (!draftItem) return;
      const targetBid = draftItem.buildingId || draftItem.id;
      const res = await fetch("/api/broker/workspace/summary", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upsert_im",
          buildingId: targetBid,
          imId: draftItem.id,
          imItem: draftItem,
        }),
      });
      if (!res.ok) {
        throw new Error("IM save failed");
      }
      try {
        const imRaw = window.localStorage.getItem(IM_STORAGE_KEY);
        if (imRaw) {
          const imParsed = JSON.parse(imRaw);
          if (Array.isArray(imParsed)) {
            const cleanedIm = imParsed.map((it: any) =>
              it.id === draftItem.id ? { ...it, isDirty: false } : it
            );
            window.localStorage.setItem(IM_STORAGE_KEY, JSON.stringify(cleanedIm));
          }
        }
        const dcRaw = window.localStorage.getItem("credeal-w-dealcards-v5");
        if (dcRaw) {
          const dcParsed = JSON.parse(dcRaw);
          if (Array.isArray(dcParsed)) {
            const nextBand =
              draftItem.askingPriceManwon && draftItem.askingPriceManwon > 0
                ? formatPriceRange(draftItem.askingPriceManwon * 10000)
                : undefined;
            const nextDc = dcParsed.map((dc: any) => {
              if (dc.id !== targetBid) return dc;
              return {
                ...dc,
                ...(nextBand
                  ? {
                      priceBand: nextBand,
                      card4: dc.card4 ? { ...dc.card4, priceBand: nextBand } : dc.card4,
                    }
                  : {}),
                isDirty: false,
              };
            });
            window.localStorage.setItem("credeal-w-dealcards-v5", JSON.stringify(nextDc));
          }
        }
      } catch {
        // ignore storage errors
      }
    },
  });

  const syncCurrentItemPatch = (patch: Partial<ImListItem>) => {
    setItems((prev) => {
      const targetId = currentItem?.id || selectedId;
      const next = prev.map((it) => {
        if (it.id !== targetId) return it;
        const nextPrice = patch.askingPriceManwon ?? it.askingPriceManwon ?? 0;
        const nextRentRoll = patch.rentRoll ?? it.rentRoll ?? [];
        const depSum =
          Math.round(
            nextRentRoll.reduce(
              (s, r) => s + (r.status !== "vacant" ? Number(r.depositManwon || 0) : 0),
              0
            ) * 10
          ) / 10;
        const rentSum =
          Math.round(
            nextRentRoll.reduce(
              (s, r) => s + (r.status !== "vacant" ? Number(r.monthlyRentManwon || 0) : 0),
              0
            ) * 10
          ) / 10;
        const netInv = nextPrice - depSum;
        const nextYield =
          netInv > 0 && rentSum > 0
            ? Number((((rentSum * 12) / netInv) * 100).toFixed(2))
            : patch.grossYieldPct ?? it.grossYieldPct ?? 0;
        return {
          ...it,
          ...patch,
          grossYieldPct: nextYield,
          updatedAt: "방금",
          isDirty: true,
        };
      });
      persistImItems(next);
      return next;
    });
  };

  useEffect(() => {
    let initialTargetId: string | null = null;
    try {
      const savedRaw = window.localStorage.getItem(IM_STORAGE_KEY);
      if (savedRaw) {
        const parsed = JSON.parse(savedRaw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setItems(parsed);
          const match = buildingIdParam
            ? parsed.find(
                (i: ImListItem) => i.id === buildingIdParam || i.buildingId === buildingIdParam
              ) || parsed[0]
            : parsed[0];
          if (match) {
            initialTargetId = match.id;
            setSelectedId(match.id);
            applyItemToFormState(match);
          }
        }
      }
    } catch {
      // ignore
    }

    const suffix = buildingIdParam ? `?buildingId=${encodeURIComponent(buildingIdParam)}` : "";
    fetch(`/api/broker/workspace/summary${suffix}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const serverList =
          Array.isArray(data?.ims) && data.ims.length > 0
            ? data.ims
            : Array.isArray(data?.imList) && data.imList.length > 0
            ? data.imList
            : null;
        if (data?.ok && serverList) {
          setItems((prev) => {
            const localMap = new Map(prev.map((it) => [it.id, it]));
            const localBldMap = new Map(prev.map((it) => [it.buildingId, it]));
            const srvItems: ImListItem[] = serverList.map((srv: ImListItem) => {
              const local = localMap.get(srv.id) || localBldMap.get(srv.buildingId);
              const resolvedAxiosHighlights = local?.isDirty
                ? local.axiosHighlights
                : Array.isArray(srv.axiosHighlights) && srv.axiosHighlights.length > 0
                ? srv.axiosHighlights
                : local?.axiosHighlights;
              const resolvedHandoverNote = local?.isDirty
                ? local.handoverNote
                : srv.handoverNote || local?.handoverNote;
              return {
                ...srv,
                ...(local?.isDirty ? local : {}),
                id: srv.id,
                buildingId: srv.buildingId || local?.buildingId || srv.id,
                axiosHighlights: resolvedAxiosHighlights,
                handoverNote: resolvedHandoverNote,
                brokerExtrasForm: local?.brokerExtrasForm || srv.brokerExtrasForm,
                photoNames: local?.photoNames || srv.photoNames,
                rentRoll:
                  local?.isDirty && Array.isArray(local.rentRoll) && local.rentRoll.length > 0
                    ? local.rentRoll
                    : Array.isArray(srv.rentRoll) && srv.rentRoll.length > 0
                    ? srv.rentRoll
                    : generateFloorScaffolding(3, 1),
              };
            });
            const localOnlyItems: ImListItem[] = [];
            for (const loc of prev) {
              const isExplicitlyRequested =
                Boolean(buildingIdParam) &&
                (loc.id === buildingIdParam || loc.buildingId === buildingIdParam);
              const isUserCreatedOrEdited = !INITIAL_IM_IDS.has(loc.id) || Boolean(loc.isDirty);
              if (
                (isUserCreatedOrEdited || isExplicitlyRequested) &&
                !srvItems.some((s) => s.id === loc.id || s.buildingId === loc.buildingId)
              ) {
                localOnlyItems.push(loc);
              }
            }
            const seenBldIds = new Set<string>();
            const merged = [...localOnlyItems, ...srvItems].filter((it) => {
              if (it.buildingId && UUID_REGEX.test(it.buildingId)) {
                if (seenBldIds.has(it.buildingId)) return false;
                seenBldIds.add(it.buildingId);
              }
              return true;
            });
            persistImItems(merged);
            const targetMatch = buildingIdParam
              ? merged.find((i) => i.id === buildingIdParam || i.buildingId === buildingIdParam) ||
                merged[0]
              : (initialTargetId && merged.find((i) => i.id === initialTargetId || i.buildingId === initialTargetId)) || merged[0];
            if (targetMatch) {
              setSelectedId(targetMatch.id);
              applyItemToFormState(targetMatch);
            }
            return merged;
          });
        }
      })
      .catch(() => {
        // Offline / test fallback
      })
      .finally(() => {
        setIsHydrated(true);
      });
  }, [buildingIdParam, applyItemToFormState, persistImItems]);

  useEffect(() => {
    const queryId = searchParams.get("id") || searchParams.get("buildingId");
    if (queryId) {
      const match = items.find((i) => i.id === queryId || i.buildingId === queryId);
      if (match && match.id !== selectedId) {
        setSelectedId(match.id);
      }
    }
  }, [searchParams, items, selectedId]);

  useEffect(() => {
    if (currentItem) {
      applyItemToFormState(currentItem);
    }
  }, [currentItem?.id, applyItemToFormState]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchQuery =
        !searchQuery ||
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.address.toLowerCase().includes(searchQuery.toLowerCase());
      const normP = normalizePostureForSelector(item.investmentPosture);
      const matchPosture =
        postureFilter === "all" ||
        (postureFilter === "income" && normP === "income") ||
        (postureFilter === "owner" && normP === "owner_occupied") ||
        (postureFilter === "value_dev" &&
          (normP === "development" || normP === "trading" || normP === "operating"));
      return matchQuery && matchPosture;
    });
  }, [items, searchQuery, postureFilter]);

  const priceBandStr = useMemo(() => {
    return formatPriceRange((askingPriceManwon || 0) * 10000);
  }, [askingPriceManwon]);

  // Split Price (억 / 만원) helpers for senior-friendly input
  const priceEokPart = Math.floor((askingPriceManwon || 0) / 10000);
  const priceManwonRemainder = (askingPriceManwon || 0) % 10000;

  const handleSplitPriceChange = (nextEok: number, nextMan: number) => {
    const safeEok = Number.isFinite(nextEok) && nextEok >= 0 ? Math.floor(nextEok) : 0;
    const safeMan = Number.isFinite(nextMan) && nextMan >= 0 ? Math.floor(nextMan) : 0;
    const combinedManwon = safeEok * 10000 + safeMan;
    setAskingPriceManwon(combinedManwon);
    syncCurrentItemPatch({ askingPriceManwon: combinedManwon });
  };

  // Auto-fill building register by address
  const handleLookupAddress = async () => {
    if (!address.trim()) {
      setActionAlert("주소를 먼저 입력해 주세요.");
      return;
    }
    setIsLookingUpAddress(true);
    setActionAlert(null);
    try {
      const res = await fetch(
        `/api/buildings/lookup?address=${encodeURIComponent(address.trim())}`
      );
      const data = await res.json().catch(() => null);
      if (res.ok && data) {
        const nextGfa = data.grossFloorAreaSqm || data.gfaSqm || gfaSqm;
        const nextLand = data.landAreaSqm || landAreaSqm;
        const nextZoning = data.zoning || zoning;
        const nextCompletion = data.completionDate || data.useAprDay || completionDate;
        if (nextGfa) setGfaSqm(String(nextGfa));
        if (nextLand) setLandAreaSqm(String(nextLand));
        if (nextZoning) setZoning(String(nextZoning));
        if (nextCompletion) setCompletionDate(String(nextCompletion));
        syncCurrentItemPatch({
          gfaSqm: nextGfa ? String(nextGfa) : gfaSqm,
          landAreaSqm: nextLand ? String(nextLand) : landAreaSqm,
          zoning: nextZoning ? String(nextZoning) : zoning,
          completionDate: nextCompletion ? String(nextCompletion) : completionDate,
        });
        showUndoToast({
          message: "공적장부에서 건물 면적·용도지역 정보를 불러왔어요",
          variant: "success",
        });
      } else {
        setActionAlert(
          "공적장부 자동 조회 결과가 없어요. 아래 칸에 면적과 용도지역을 직접 적어 주세요."
        );
      }
    } catch {
      setActionAlert(
        "공적장부 조회에 연결하지 못했어요. 아래 칸에 직접 입력해 주세요."
      );
    } finally {
      setIsLookingUpAddress(false);
    }
  };

  // Create new blank IM
  const handleCreateNew = () => {
    const newId = `im-doc-${Date.now()}`;
    const newItem: ImListItem = {
      id: newId,
      buildingId: `bld-${Date.now()}`,
      title: "새 IM",
      address: "",
      askingPriceManwon: 0,
      grossYieldPct: 0,
      status: "draft",
      versionLabel: "작성 중",
      updatedAt: "방금",
      investmentPosture: "core_income",
      gfaSqm: "",
      completionDate: "",
      landAreaSqm: "",
      zoning: "",
      handoverNote: "",
      photoNames: [],
      rentRoll: generateFloorScaffolding(3, 1),
      axiosHighlights: BLANK_IM_HIGHLIGHTS.map((h) => ({ ...h })),
      brokerName: profileDefaultsRef.current.brokerName || "",
      brokerageName: profileDefaultsRef.current.brokerageName || "",
      brokerPhone: profileDefaultsRef.current.brokerPhone || "",
      isDirty: true,
    };

    const next = [newItem, ...items];
    setItems(next);
    persistImItems(next);
    setSelectedId(newId);
    applyItemToFormState(newItem);
    showUndoToast({
      message: "빈 IM을 새로 열었어요. 건물 주소와 희망 매매가부터 적어 보세요.",
      variant: "success",
    });
  };

  const handleExcelRentRollImport = (payload: RentRollImportPayload) => {
    if (Array.isArray(payload.floorLeases) && payload.floorLeases.length > 0) {
      const mappedRows: RentRollRowItem[] = payload.floorLeases.map((r, idx) => {
        let dep = Number(r.deposit_manwon ?? 0);
        let rent = Number(r.rent_manwon ?? 0);
        let mgmt = Number(r.mgmt_fee_manwon ?? 0);
        if ((r.is_vacant || r.lease_state === "공실") && dep === 0 && rent === 0 && r.note) {
          const depM = r.note.match(/보증금\s*([\d,.]+)/);
          const rentM = r.note.match(/월세\s*([\d,.]+)/);
          const mgmtM = r.note.match(/관리비\s*([\d,.]+)/);
          if (depM) dep = parseFloat(depM[1].replace(/,/g, "")) || 0;
          if (rentM) rent = parseFloat(rentM[1].replace(/,/g, "")) || 0;
          if (mgmtM) mgmt = parseFloat(mgmtM[1].replace(/,/g, "")) || 0;
        }
        return {
          id: `r-xlsx-${Date.now()}-${idx}`,
          floor: r.floor || `${idx + 1}F`,
          unit: r.unit_label || `${idx + 1}01호`,
          use:
            Array.from(
              new Set([r.tenant_name?.trim(), r.tenant_type?.trim()].filter(Boolean))
            ).join(" / ") || (r.is_vacant ? "공실" : "근린생활시설"),
          areaSqm: r.area_sqm ?? r.exclusive_area_sqm,
          depositManwon: dep,
          monthlyRentManwon: rent,
          maintenanceManwon: mgmt,
          leaseExpiry: r.lease_end || "-",
          status:
            r.lease_state === "자가사용"
              ? "owner"
              : r.lease_state === "공실" || r.is_vacant
              ? "vacant"
              : "occupied",
        };
      });
      const prevRows = [...rentRoll];
      setRentRoll(mappedRows);
      const patch: Partial<ImListItem> = { rentRoll: mappedRows };
      if (payload.askingPriceManwon && payload.askingPriceManwon > 0) {
        setAskingPriceManwon(payload.askingPriceManwon);
        patch.askingPriceManwon = payload.askingPriceManwon;
      }
      syncCurrentItemPatch(patch);
      showUndoToast({
        message: `엑셀 임대 현황 ${mappedRows.length}개 층을 반영했어요`,
        undoAction: () => {
          setRentRoll(prevRows);
          syncCurrentItemPatch({ rentRoll: prevRows });
        },
      });
    }
  };

  // Open Detail Sheet without publishing draft
  const handleOpenBottomSheet = async () => {
    const existingBid = currentItem?.buildingId || "";
    if (UUID_REGEX.test(existingBid)) {
      setBottomSheetBuildingId(existingBid);
      setIsBottomSheetOpen(true);
      return;
    }

    if (!address.trim() || !askingPriceManwon || askingPriceManwon <= 0) {
      setActionAlert("상세 편집 창을 열려면 주소와 희망 매매가를 먼저 입력해 주세요.");
      return;
    }

    setIsProvisioningSheet(true);
    setActionAlert(null);
    try {
      const res = await fetch("/api/broker/im-lite/quick-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: address.trim(),
          askingPriceManwon,
          title: imTitle.trim() || undefined,
          investmentPoints: axiosHighlights.map((h) => h.headline).filter(Boolean),
          axiosHighlights,
          rentRoll,
          posture: investmentPosture,
          gfaSqm: Number(gfaSqm) || undefined,
          completionDate: completionDate || undefined,
          landAreaSqm: Number(landAreaSqm) || undefined,
          zoning: zoning || undefined,
          handoverNote: handoverNote || undefined,
          publishStatus: "draft",
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.buildingId && UUID_REGEX.test(data.buildingId)) {
        setBottomSheetBuildingId(data.buildingId);
        syncCurrentItemPatch({ buildingId: data.buildingId });
        setIsBottomSheetOpen(true);
      } else {
        setActionAlert(data?.error || "상세 편집 창을 준비하지 못했어요. 잠시 후 다시 시도해 주세요.");
      }
    } catch {
      setActionAlert("네트워크 연결을 확인한 뒤 다시 눌러 주세요.");
    } finally {
      setIsProvisioningSheet(false);
    }
  };

  // Open 10-Slide PPTX Studio (provisions DB record first if current buildingId is a non-UUID seed)
  const handleOpenStudio = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    const existingBid = currentItem?.buildingId || "";
    if (UUID_REGEX.test(existingBid)) {
      return; // Let native anchor navigation proceed
    }
    e.preventDefault();

    if (!address.trim() || !askingPriceManwon || askingPriceManwon <= 0) {
      setActiveEditorTab("specs");
      setActionAlert("10면 슬라이드 편집을 열려면 주소와 희망 매매가를 먼저 입력해 주세요.");
      return;
    }

    setIsProvisioningSheet(true);
    setActionAlert(null);
    try {
      const res = await fetch("/api/broker/im-lite/quick-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: address.trim(),
          askingPriceManwon,
          title: imTitle.trim() || undefined,
          investmentPoints: axiosHighlights.map((h) => h.headline).filter(Boolean),
          axiosHighlights,
          rentRoll,
          posture: investmentPosture,
          gfaSqm: Number(gfaSqm) || undefined,
          completionDate: completionDate || undefined,
          landAreaSqm: Number(landAreaSqm) || undefined,
          zoning: zoning || undefined,
          handoverNote: handoverNote || undefined,
          brokerName,
          brokerageName,
          brokerPhone,
          publishStatus: "draft",
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.buildingId) {
        syncCurrentItemPatch({ buildingId: data.buildingId });
        window.location.href = `/broker/basic-im-studio/${data.buildingId}`;
      } else {
        setActionAlert(data?.error || "슬라이드 스튜디오를 준비하지 못했어요. 잠시 후 다시 시도해 주세요.");
      }
    } catch {
      setActionAlert("네트워크 연결을 확인한 뒤 다시 눌러 주세요.");
    } finally {
      setIsProvisioningSheet(false);
    }
  };

  // Primary Action: IM 만들기
  const handleQuickGenerate = async () => {
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

    setIsGenerating(true);
    try {
      const parsedExtras = parseBrokerExtras(brokerExtrasFormToInput(brokerExtrasForm));
      const brokerExtrasPayload = parsedExtras.ok ? parsedExtras.value : undefined;

      const res = await fetch("/api/broker/im-lite/quick-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buildingId: UUID_REGEX.test(currentItem?.buildingId || "")
            ? currentItem?.buildingId
            : undefined,
          title: imTitle.trim() || undefined,
          address: address.trim(),
          askingPriceManwon,
          investmentPoints: axiosHighlights.map((h) => h.headline).filter(Boolean),
          axiosHighlights,
          rentRoll,
          posture: investmentPosture,
          gfaSqm: Number(gfaSqm) || undefined,
          completionDate: completionDate || undefined,
          landAreaSqm: Number(landAreaSqm) || undefined,
          zoning: zoning || undefined,
          handoverNote: handoverNote || undefined,
          brokerName,
          brokerageName,
          brokerPhone,
          brokerExtras: brokerExtrasPayload,
          publishStatus: "published",
        }),
      });

      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        const targetId = currentItem?.id || selectedId;
        const resolvedTitle =
          imTitle.trim() ||
          (address.split(" ").slice(1, 3).join(" ") || "매물") + " 근생빌딩";
        const nextItems = items.map((it) =>
          it.id === targetId
            ? {
                ...it,
                buildingId: data?.buildingId || it.buildingId,
                title: resolvedTitle,
                address,
                askingPriceManwon,
                grossYieldPct: Number(calculatedYield.toFixed(2)) || it.grossYieldPct,
                status: "published" as const,
                versionLabel: "발행됨",
                updatedAt: "방금",
                rentRoll,
                investmentPosture,
                gfaSqm,
                completionDate,
                landAreaSqm,
                zoning,
                handoverNote,
                photoNames,
                brokerName,
                brokerageName,
                brokerPhone,
                brokerExtrasForm,
                axiosHighlights,
                isDirty: false,
              }
            : it
        );
        setItems(nextItems);
        persistImItems(nextItems);
        if (data?.buildingId) {
          setBottomSheetBuildingId(data.buildingId);
        }
        autosave.markClean();
        showUndoToast({
          message: "IM과 딜카드를 만들었어요! 오른쪽에서 미리보거나 내려받을 수 있습니다.",
          variant: "success",
        });
      } else {
        setActionAlert(
          data?.error || "IM을 만드는 중 문제가 생겼어요. 입력 내용을 확인하고 다시 눌러 주세요."
        );
      }
    } catch {
      setActionAlert("네트워크 연결을 확인한 뒤 다시 눌러 주세요.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDuplicateIm = (source: ImListItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const newId = `im-doc-${Date.now().toString().slice(-4)}`;
    const cloned: ImListItem = {
      ...source,
      id: newId,
      buildingId: `bld-${Date.now().toString().slice(-4)}`,
      title: `${source.title} (사본)`,
      status: "draft",
      versionLabel: "작성 중",
      updatedAt: "방금",
      isDirty: true,
    };
    const next = [cloned, ...items];
    setItems(next);
    persistImItems(next);
    setSelectedId(newId);
    showUndoToast({
      message: `'${source.title}' IM을 복제했어요`,
      variant: "success",
    });
  };

  const handleDeleteIm = (target: ImListItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (items.length <= 1) {
      setActionAlert("최소 1개의 IM은 남겨 두어야 합니다.");
      return;
    }
    const prevItems = [...items];
    const prevSelectedId = selectedId;
    const next = items.filter((it) => it.id !== target.id);
    setItems(next);
    persistImItems(next);
    if (selectedId === target.id && next[0]) {
      setSelectedId(next[0].id);
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
        setItems(prevItems);
        persistImItems(prevItems);
        setSelectedId(prevSelectedId);
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

  const handleReclusterImAxios = async () => {
    const prevHighlights = axiosHighlights.map((h) => ({ ...h }));
    setIsAiPointsBusy(true);
    setActionAlert(null);

    try {
      const rentSummary = rentRoll
        .map(
          (r) =>
            `${r.floor} ${r.use} 보증금 ${r.depositManwon || 0}만/월세 ${r.monthlyRentManwon || 0}만`
        )
        .join(", ");
      const res = await fetch("/api/broker/im/ai-points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address,
          title: imTitle,
          posture: investmentPosture,
          askingPriceManwon,
          gfaSqm,
          landAreaSqm,
          zoning,
          completionDate,
          rentRollSummary: rentSummary,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok && Array.isArray(data.result?.points) && data.result.points.length === 3) {
        const tones: Array<"amber" | "sky" | "mint"> = ["amber", "sky", "mint"];
        const nextHighlights: ImAxiosHighlight[] = data.result.points.slice(0, 3).map(
          (p: { title: string; body: string }, idx: number) => ({
            headline: p.title,
            brief: p.body,
            tone: tones[idx] || "amber",
          })
        );
        setAxiosHighlights(nextHighlights);
        syncCurrentItemPatch({ axiosHighlights: nextHighlights });
        showUndoToast({
          message: "AI가 장점 3가지를 작성했어요",
          undoAction: () => {
            setAxiosHighlights(prevHighlights);
            syncCurrentItemPatch({ axiosHighlights: prevHighlights });
          },
        });
        return;
      }
    } catch {
      // Fallback below for offline/unit test environment
    } finally {
      setIsAiPointsBusy(false);
    }

    const regionPart = address.split(" ").slice(1, 3).join(" ") || "핵심 지역";
    const priceEok = ((askingPriceManwon || 0) / 10000).toFixed(1);
    const yieldStr = calculatedYield.toFixed(2);
    const normP = normalizePostureForSelector(investmentPosture);

    const fallbackHighlights: ImAxiosHighlight[] =
      normP === "owner_occupied"
        ? [
            {
              headline: `${regionPart} 사옥 추천 · 가시성 우수한 단독 건물`,
              brief: `${regionPart} 주요 도로 인접 입지로 방문객 접근성과 출퇴근 여건이 뛰어납니다.${
                gfaSqm ? ` 연면적 ${gfaSqm}㎡ 규모로 사옥 활용에 적합합니다.` : ""
              }`,
              tone: "amber",
            },
            {
              headline: `${handoverNote || "입주 일정 협의 가능"} · 사옥 이전 용이`,
              brief: `명도 및 입주 일정 협의가 가능하여 계획적인 사옥 이전이 가능합니다.`,
              tone: "sky",
            },
            {
              headline: `${priceEok !== "0.0" ? `매매가 ${priceEok}억 · ` : ""}${
                zoning || "우수 용도지역"
              } 토지 가치`,
              brief: `반듯한 대지 여건을 갖추어 실사용 가치는 물론 중장기 자산가치 보존에 유리합니다.`,
              tone: "mint",
            },
          ]
        : [
            {
              headline: `${regionPart} 상권 · 총 ${rentRoll.length}개 층 임차 운영`,
              brief: `총 ${rentRoll.length}개 층에 안정적인 업종이 입점해 운영 중입니다.${
                totalRentManwon > 0
                  ? ` 월 임대료 합계 ${totalRentManwon.toLocaleString()}만 원입니다.`
                  : ""
              }`,
              tone: "amber",
            },
            {
              headline:
                calculatedYield > 0
                  ? `순투자금 대비 연 ${yieldStr}% 임대 수익`
                  : `안정적인 보증금·임대료 수익 구조`,
              brief:
                calculatedYield > 0
                  ? `보증금 합계 ${totalDepositManwon.toLocaleString()}만 원을 제외한 순투자금 기준 연 ${yieldStr}% 수익률입니다.`
                  : `임대차 구조가 안정적이어서 꾸준한 배당 수익을 기대할 수 있습니다.`,
              tone: "sky",
            },
            {
              headline: `${zoning || "핵심 상권"} 토지 가치 및 가치 상승 여력`,
              brief: `향후 임대차 갱신 및 건물 관리 개선을 통한 추가 가치 상승 여력이 있습니다.`,
              tone: "mint",
            },
          ];

    setAxiosHighlights(fallbackHighlights);
    syncCurrentItemPatch({ axiosHighlights: fallbackHighlights });
    showUndoToast({
      message: "매물 정보에 맞춰 장점 3가지를 채웠어요",
      undoAction: () => {
        setAxiosHighlights(prevHighlights);
        syncCurrentItemPatch({ axiosHighlights: prevHighlights });
      },
    });
  };

  /* ──────── Column 1: Item List ──────── */
  const listSlot = (
    <div className="flex flex-col h-full bg-[#FAF9F5] p-3 space-y-3" data-testid="im-list-slot">
      {/* Header Banner */}
      <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-[#0F172A] text-white">
        <span className="text-sm font-extrabold text-white">
          보유 IM 목록
        </span>
        <span className="text-sm font-bold text-amber-300">
          총 {filteredItems.length}건
        </span>
      </div>

      {/* Create New Button */}
      <button
        type="button"
        data-testid="im-create-new-btn"
        onClick={handleCreateNew}
        className="w-full min-h-[52px] px-4 py-3 bg-[#0F172A] text-white rounded-xl font-bold text-base hover:bg-[#1E293B] transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-sm"
      >
        <span>+ 새 IM 만들기</span>
      </button>

      {/* Search Input */}
      <div>
        <label htmlFor="im-search-input" className="sr-only">
          IM 검색
        </label>
        <input
          id="im-search-input"
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="매물 이름 또는 주소로 찾기..."
          className="w-full min-h-[48px] px-3.5 bg-white text-base rounded-xl border border-[#64748B] focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/20 outline-none"
        />
      </div>

      {/* 매물 유형 필터 */}
      <div
        role="tablist"
        aria-label="매물 유형별 IM 보기"
        data-testid="im-posture-switcher"
        className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-slate-200 border border-slate-300"
      >
        {(
          [
            { id: "all", label: "전체" },
            { id: "income", label: "임대수익" },
            { id: "owner", label: "사옥용" },
            { id: "value_dev", label: "신축·개발" },
          ] as const
        ).map((tab) => {
          const active = postureFilter === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`im-posture-tab-${tab.id}`}
              onClick={() => setPostureFilter(tab.id)}
              className={`min-h-[48px] px-1.5 py-1 rounded-lg text-sm font-extrabold flex items-center justify-center transition cursor-pointer ${
                active
                  ? "bg-white text-[#0F172A] shadow-xs border border-blue-300"
                  : "text-slate-700 hover:text-slate-950"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div
        data-testid="im-standard-formula-banner"
        className="px-3.5 py-2.5 rounded-xl bg-blue-50 border border-blue-200 text-sm text-blue-950 font-semibold leading-snug"
      >
        <span className="font-extrabold text-blue-900">[모바일·Basic IM 표준 구성]</span>{" "}
        건물 정보 + 층별 임대 현황 + 핵심 장점 3가지 + 사진·지적도
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1" role="list">
        {filteredItems.map((item) => {
          const isSelected = item.id === selectedId;
          const itemPostureLabel =
            IM_POSTURE_LABELS[item.investmentPosture || "core_income"] || "임대수익용";

          return (
            <div
              key={item.id}
              role="button"
              tabIndex={0}
              data-testid={`im-item-${item.id}`}
              aria-current={isSelected ? "true" : undefined}
              onClick={() => setSelectedId(item.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelectedId(item.id);
                }
              }}
              className={`w-full min-h-[88px] p-3.5 rounded-2xl border text-left transition-all cursor-pointer relative ${
                isSelected
                  ? "bg-white border-[#1D4ED8] shadow-sm ring-2 ring-[#1D4ED8]/20"
                  : "bg-white border-[#E2E8F0] hover:border-[#64748B]"
              }`}
            >
              {isSelected && (
                <div className="absolute left-0 top-3 bottom-3 w-1.5 bg-[#1D4ED8] rounded-r" />
              )}
              <div className="flex items-center justify-between gap-2 mb-1 pl-2">
                <span
                  data-single-line-title="true"
                  title={item.title}
                  className="font-bold text-base text-[#0F172A] break-keep"
                >
                  {item.title || "새 IM"}
                </span>
                <span
                  className={`text-sm font-bold px-2.5 py-0.5 rounded-full shrink-0 ${
                    item.status === "published"
                      ? "bg-[#D1FAE5] text-[#065F46]"
                      : "bg-[#FEF3C7] text-[#92400E]"
                  }`}
                >
                  {item.status === "published" ? TERMS.statusPublished : TERMS.statusDraft}
                </span>
              </div>
              <p className="text-sm text-[#475569] pl-2 break-keep">
                {item.address || "주소 미입력"}
              </p>
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold text-[#0F172A] mt-2 pt-2 border-t border-[#F1F5F9] pl-2">
                <div className="flex items-center gap-2">
                  <span>
                    {item.askingPriceManwon && item.askingPriceManwon > 0
                      ? formatPriceRange(item.askingPriceManwon * 10000)
                      : "가격 미입력"}
                  </span>
                  <span>·</span>
                  <span className="text-[#065F46]">
                    {item.grossYieldPct > 0 ? `수익률 ${item.grossYieldPct}%` : itemPostureLabel}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    data-testid={`im-duplicate-${item.id}`}
                    onClick={(e) => handleDuplicateIm(item, e)}
                    className="min-h-[36px] text-sm font-bold px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 cursor-pointer"
                  >
                    복제
                  </button>
                  <button
                    type="button"
                    data-testid={`im-delete-${item.id}`}
                    onClick={(e) => handleDeleteIm(item, e)}
                    className="min-h-[36px] text-sm font-bold px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 cursor-pointer"
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

  const normalizedPosture = normalizePostureForSelector(investmentPosture);
  const postureKoreanLabel = IM_POSTURE_LABELS[investmentPosture] || "임대수익용";

  const IM_POSTIT_STYLES: Record<
    "amber" | "sky" | "mint",
    { bg: string; border: string; badgeBg: string; badgeText: string; label: string }
  > = {
    amber: {
      bg: "#FEF9C3",
      border: "#FDE047",
      badgeBg: "#FEF08A",
      badgeText: "#854D0E",
      label: "장점 01 · 입지·임차",
    },
    sky: {
      bg: "#E0F2FE",
      border: "#7DD3FC",
      badgeBg: "#BAE6FD",
      badgeText: "#075985",
      label: "장점 02 · 수익률",
    },
    mint: {
      bg: "#DCFCE7",
      border: "#86EFAC",
      badgeBg: "#BBF7D0",
      badgeText: "#166534",
      label: "장점 03 · 건물·토지 가치",
    },
  };

  /* ──────── Column 2: 4 Top Tabs + Editor Panels ──────── */
  const editorSlot = (
    <div className="p-4 sm:p-6 space-y-5 max-w-4xl mx-auto" data-testid="im-editor-slot">
      {/* Top Action Bar */}
      <div className="bg-gradient-to-r from-[#EFF6FF] to-[#FAF9F5] rounded-2xl border border-[#1D4ED8]/30 p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-base font-extrabold text-[#0F172A]">
            건물 주소와 가격만 적어도 모바일 IM과 10장 발표자료(PPTX)가 함께 만들어집니다
          </p>
          <p className="text-sm text-[#334155]">
            더 자세한 항목은 필요할 때만 오른쪽 버튼으로 열어 입력하실 수 있어요.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            data-testid="im-open-bottom-sheet-btn"
            disabled={isProvisioningSheet}
            onClick={handleOpenBottomSheet}
            className="min-h-[48px] px-4 py-2 bg-white text-[#0F172A] border border-slate-400 rounded-xl font-bold text-sm hover:bg-slate-100 transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
          >
            <span>{isProvisioningSheet ? "열고 있어요…" : "상세 입력 창 열기"}</span>
          </button>
          <a
            href={`/broker/basic-im-studio/${currentItem?.buildingId || "bld-01"}`}
            data-testid="im-open-studio-btn"
            onClick={handleOpenStudio}
            className="min-h-[48px] px-4 py-2 bg-white text-[#1D4ED8] border border-[#1D4ED8] rounded-xl font-bold text-sm hover:bg-[#EFF6FF] transition-colors flex items-center gap-1.5"
          >
            <span>10면 슬라이드 편집</span>
          </a>
        </div>
      </div>

      {actionAlert && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-base font-bold"
        >
          ⚠ {actionAlert}
        </div>
      )}

      {/* Top 4 Primary Tabs (Sticky + Completion Check Badges) */}
      <div
        role="tablist"
        aria-label="IM 작성 단계"
        data-testid="im-editor-primary-tabs"
        className="sticky top-0 z-10 grid grid-cols-2 sm:grid-cols-4 gap-2 p-1.5 rounded-xl bg-slate-200/95 backdrop-blur-xs border border-slate-300 shadow-xs"
      >
        {(
          [
            {
              id: "specs",
              label: "① 표지·기본정보",
              sub: "제목·주소·희망가",
              done: Boolean(address.trim() && askingPriceManwon > 0),
            },
            {
              id: "rentroll",
              label: "② 층별 임대현황",
              sub: `총 ${rentRoll.length}층·엑셀 불러오기`,
              done: rentRoll.some(
                (r) =>
                  (r.depositManwon || 0) > 0 ||
                  (r.monthlyRentManwon || 0) > 0 ||
                  r.status === "owner"
              ),
            },
            {
              id: "axios_brief",
              label: "③ 장점 3가지",
              sub: "장점 3가지·중개의견",
              done: axiosHighlights.filter((h) => h.headline.trim().length > 0).length >= 3,
            },
            {
              id: "media_publish",
              label: "④ 사진·위치·만들기",
              sub: `사진 ${photoNames.length}장`,
              done: photoNames.length > 0 || currentItem?.status === "published",
            },
          ] as const
        ).map((tab) => {
          const isActive = activeEditorTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              data-testid={`im-editor-tab-${tab.id}`}
              onClick={() => {
                setActionAlert(null);
                setActiveEditorTab(tab.id);
              }}
              className={`min-h-[56px] px-3 py-2.5 rounded-xl text-left transition-all cursor-pointer min-w-0 ${
                isActive
                  ? "bg-[#0F172A] text-white shadow-sm"
                  : "bg-white/90 text-slate-800 hover:bg-white"
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-sm font-extrabold leading-tight break-keep">
                  {tab.label}
                </span>
                {tab.done && (
                  <span
                    className={`text-sm font-extrabold px-2 py-0.5 rounded-full shrink-0 ${
                      isActive
                        ? "bg-emerald-700 text-white"
                        : "bg-emerald-100 text-emerald-800"
                    }`}
                  >
                    ✓ 완료
                  </span>
                )}
              </div>
              <div
                className={`text-sm mt-0.5 font-medium break-keep ${
                  isActive ? "text-amber-300" : "text-slate-600"
                }`}
              >
                {tab.sub}
              </div>
            </button>
          );
        })}
      </div>

      {/* ── TAB 1 PANEL: ① 표지·핵심제원 ── */}
      <div
        data-testid="im-tab-panel-specs"
        className={
          activeEditorTab === "specs"
            ? "bg-white rounded-xl border border-[#CBD5E1] p-5 sm:p-6 shadow-sm space-y-5 block"
            : "hidden"
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] pb-3">
          <div>
            <h2 className="text-xl font-extrabold text-[#0F172A]">
              ① 건물 기본 정보
            </h2>
            <p className="text-sm text-[#475569] mt-0.5">
              표지 제목과 주소, 매매 희망가, 건물·토지 면적을 입력합니다.
            </p>
          </div>
        </div>

        {/* 0. 어떤 매물인가요? */}
        <div
          className="p-4 rounded-xl bg-[#FAF9F5] border border-[#CBD5E1] space-y-2.5"
          data-testid="im-posture-selector-section"
        >
          <span className="block text-base font-extrabold text-[#0F172A]">
            {TERMS.postureSectionTitle}
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5" role="group" aria-label={TERMS.postureSectionTitle}>
            {(
              [
                { id: "core_income", norm: "income", title: "임대수익용", desc: "안정적인 월세 수익" },
                { id: "owner_occupier", norm: "owner_occupied", title: "사옥용", desc: "직접 입주·주차·접근성" },
                { id: "development", norm: "development", title: "신축·개발용", desc: "리모델링·신축·토지 활용" },
              ] as const
            ).map((opt) => {
              const active = normalizedPosture === opt.norm;
              return (
                <button
                  key={opt.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setInvestmentPosture(opt.id);
                    syncCurrentItemPatch({ investmentPosture: opt.id });
                  }}
                  className={`min-h-[56px] px-4 py-3 rounded-xl border-2 text-left transition cursor-pointer ${
                    active
                      ? "bg-blue-700 text-white border-blue-700 shadow-xs"
                      : "bg-white text-slate-900 border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <div className="text-base font-extrabold">{opt.title}</div>
                  <div className={`text-sm mt-0.5 ${active ? "text-blue-100" : "text-slate-600"}`}>
                    {opt.desc}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 0-B. Single-Line IM Title */}
        <div className="space-y-1.5">
          <label
            htmlFor="im-title-single-line-input"
            className="block text-base font-bold text-[#0F172A]"
          >
            표지 제목
          </label>
          <input
            id="im-title-single-line-input"
            type="text"
            data-testid="im-title-single-line-input"
            value={imTitle}
            onChange={(e) => {
              const nextTitle = e.target.value;
              setImTitle(nextTitle);
              syncCurrentItemPatch({ title: nextTitle });
            }}
            placeholder="예: 영등포구 양평동 역세권 코너 빌딩"
            className="w-full min-h-[48px] px-3.5 text-lg font-extrabold rounded-xl border border-[#64748B] focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/20 outline-none"
          />
        </div>

        {/* 1. Address + Auto Lookup */}
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="im-address-input" className="block text-base font-bold text-[#0F172A]">
              1. 건물 주소 <span className="text-[#991B1B]">*</span>
            </label>
            <button
              type="button"
              data-testid="im-address-lookup-btn"
              disabled={isLookingUpAddress}
              onClick={handleLookupAddress}
              className="min-h-[44px] px-3.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-300 text-sm font-extrabold transition cursor-pointer"
            >
              {isLookingUpAddress ? "불러오는 중…" : "주소로 건물 정보 자동 채우기"}
            </button>
          </div>
          <input
            id="im-address-input"
            type="text"
            data-testid="im-address-input"
            value={address}
            onChange={(e) => {
              const nextVal = e.target.value;
              setAddress(nextVal);
              syncCurrentItemPatch({ address: nextVal });
            }}
            placeholder="예: 서울특별시 영등포구 양평동 11-47"
            className="w-full min-h-[48px] px-3.5 text-lg rounded-xl border border-[#64748B] focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/20 outline-none"
          />
        </div>

        {/* 2. Asking Price: Easy [억] + [만원] split input */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="im-price-eok-input" className="text-base font-bold text-[#0F172A]">
              2. 희망 매매가 <span className="text-[#991B1B]">*</span>
            </label>
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-[#1D4ED8]" data-testid="im-price-readout">
                {formatKoreanCurrencyReadout(askingPriceManwon)}
              </span>
              <span className="text-sm font-semibold text-[#065F46] bg-[#D1FAE5] px-2.5 py-0.5 rounded">
                구간: {priceBandStr}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex items-center gap-2">
              <label htmlFor="im-price-eok-input" className="sr-only">
                억 단위
              </label>
              <input
                id="im-price-eok-input"
                type="number"
                min={0}
                data-testid="im-price-eok-input"
                value={priceEokPart || ""}
                onChange={(e) =>
                  handleSplitPriceChange(Number(e.target.value), priceManwonRemainder)
                }
                placeholder="예: 95"
                className="w-full min-h-[48px] px-3.5 text-lg font-bold tabular-nums rounded-xl border border-[#64748B] focus:border-[#1D4ED8] outline-none"
              />
              <span className="text-base font-extrabold text-slate-800 shrink-0">억</span>
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="im-price-man-input" className="sr-only">
                만원 단위
              </label>
              <input
                id="im-price-man-input"
                type="number"
                min={0}
                max={9999}
                data-testid="im-price-man-input"
                value={priceManwonRemainder || ""}
                onChange={(e) => handleSplitPriceChange(priceEokPart, Number(e.target.value))}
                placeholder="0"
                className="w-full min-h-[48px] px-3.5 text-lg font-bold tabular-nums rounded-xl border border-[#64748B] focus:border-[#1D4ED8] outline-none"
              />
              <span className="text-base font-extrabold text-slate-800 shrink-0">만원</span>
            </div>

            <div className="sr-only">
              <input
                id="im-asking-price-input"
                type="number"
                data-testid="im-asking-price-input"
                value={askingPriceManwon || ""}
                onChange={(e) => {
                  const nextPrice = Number(e.target.value);
                  setAskingPriceManwon(nextPrice);
                  syncCurrentItemPatch({ askingPriceManwon: nextPrice });
                }}
                placeholder="총액(만원): 950000"
                aria-label="희망 매매가 총액(만원 단위)"
              />
            </div>
          </div>
        </div>

        {/* 3. Building & Land Specs */}
        <div className="pt-2 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="im-gfa-input" className="text-sm font-bold text-[#334155]">
                연면적 (㎡)
              </label>
              {Number(gfaSqm) > 0 && (
                <span
                  data-testid="im-gfa-pyeong-badge"
                  className="text-sm font-extrabold text-[#1D4ED8] bg-blue-50 px-2 py-0.5 rounded"
                >
                  약 {Math.round(Number(gfaSqm) * 0.3025).toLocaleString()}평
                </span>
              )}
            </div>
            <input
              id="im-gfa-input"
              type="number"
              data-testid="im-gfa-input"
              value={gfaSqm}
              onChange={(e) => {
                const nextVal = e.target.value;
                setGfaSqm(nextVal);
                syncCurrentItemPatch({ gfaSqm: nextVal });
              }}
              placeholder="예: 1450.2"
              className="w-full min-h-[48px] px-3 text-base rounded-xl border border-[#64748B] bg-white outline-none"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="im-land-area-input" className="text-sm font-bold text-[#334155]">
                대지면적 (㎡)
              </label>
              {Number(landAreaSqm) > 0 && (
                <span
                  data-testid="im-land-pyeong-badge"
                  className="text-sm font-extrabold text-[#1D4ED8] bg-blue-50 px-2 py-0.5 rounded"
                >
                  약 {Math.round(Number(landAreaSqm) * 0.3025).toLocaleString()}평
                </span>
              )}
            </div>
            <input
              id="im-land-area-input"
              type="number"
              data-testid="im-land-area-input"
              value={landAreaSqm}
              onChange={(e) => {
                const nextVal = e.target.value;
                setLandAreaSqm(nextVal);
                syncCurrentItemPatch({ landAreaSqm: nextVal });
              }}
              placeholder="예: 420.5"
              className="w-full min-h-[48px] px-3 text-base rounded-xl border border-[#64748B] bg-white outline-none"
            />
          </div>
          <div>
            <label
              htmlFor="im-zoning-input"
              className="block text-sm font-bold text-[#334155] mb-1"
            >
              용도지역
            </label>
            <input
              id="im-zoning-input"
              type="text"
              data-testid="im-zoning-input"
              value={zoning}
              onChange={(e) => {
                const nextVal = e.target.value;
                setZoning(nextVal);
                syncCurrentItemPatch({ zoning: nextVal });
              }}
              placeholder="예: 제3종일반주거지역"
              className="w-full min-h-[48px] px-3 text-base rounded-xl border border-[#64748B] bg-white outline-none"
            />
          </div>
          <div>
            <label
              htmlFor="im-completion-date-input"
              className="block text-sm font-bold text-[#334155] mb-1"
            >
              준공일 (사용승인일)
            </label>
            <input
              id="im-completion-date-input"
              type="text"
              data-testid="im-completion-date-input"
              value={completionDate}
              onChange={(e) => {
                const nextVal = e.target.value;
                setCompletionDate(nextVal);
                syncCurrentItemPatch({ completionDate: nextVal });
              }}
              placeholder="예: 2018-06-15"
              className="w-full min-h-[48px] px-3 text-base rounded-xl border border-[#64748B] bg-white outline-none"
            />
          </div>
        </div>

        {/* Next Step Button (Tab 1 -> Tab 2) */}
        <div className="pt-3 border-t border-slate-200 flex justify-end">
          <button
            type="button"
            data-testid="im-next-to-rentroll-btn"
            onClick={() => {
              setActionAlert(null);
              setActiveEditorTab("rentroll");
            }}
            className="min-h-[48px] px-5 py-2.5 rounded-xl bg-[#0F172A] hover:bg-[#1E293B] text-white text-base font-extrabold transition cursor-pointer"
          >
            다음 단계 (② 층별 임대현황) →
          </button>
        </div>
      </div>

      {/* ── TAB 2 PANEL: ② 층별 임대 현황 ── */}
      <div
        data-testid="im-tab-panel-rentroll"
        className={
          activeEditorTab === "rentroll"
            ? "bg-white rounded-2xl border-2 border-[#CBD5E1] p-5 sm:p-6 shadow-sm space-y-4 block"
            : "hidden"
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] pb-3">
          <div>
            <h2 className="text-xl font-extrabold text-[#0F172A]">
              ② 층별 임대 현황
            </h2>
            <p className="text-sm text-[#475569] mt-0.5">
              엑셀 파일을 올리거나 표에 직접 적으면 보증금·월세 합계와 수익률이 바로 계산됩니다.
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm font-bold">
            <span className="px-3 py-1 rounded-lg bg-slate-100 text-slate-800">
              보증금 {totalDepositManwon.toLocaleString()}만
            </span>
            <span className="px-3 py-1 rounded-lg bg-blue-50 text-blue-900">
              월세 {totalRentManwon.toLocaleString()}만
            </span>
            <span className="px-3 py-1 rounded-lg bg-emerald-100 text-emerald-900">
              연 {calculatedYield.toFixed(2)}%
            </span>
          </div>
        </div>

        <div
          className="p-3.5 rounded-xl bg-[#FAF9F5] border border-[#CBD5E1]"
          data-testid="im-rentroll-xlsx-importer"
        >
          <RentRollImporter
            hasExistingData={rentRoll.some(
              (r) => (r.depositManwon || 0) > 0 || (r.monthlyRentManwon || 0) > 0
            )}
            onImport={handleExcelRentRollImport}
          />
        </div>

        <RentRollGrid
          rows={rentRoll}
          onChange={(nextRows) => {
            setRentRoll(nextRows);
            syncCurrentItemPatch({ rentRoll: nextRows });
          }}
          askingPriceManwon={askingPriceManwon}
        />

        {/* Next Step Button (Tab 2 -> Tab 3) */}
        <div className="pt-3 border-t border-slate-200 flex justify-end">
          <button
            type="button"
            data-testid="im-next-to-axios-btn"
            onClick={() => {
              setActionAlert(null);
              setActiveEditorTab("axios_brief");
            }}
            className="min-h-[48px] px-5 py-2.5 rounded-xl bg-[#0F172A] hover:bg-[#1E293B] text-white text-base font-extrabold transition cursor-pointer"
          >
            다음 단계 (③ 장점 3가지) →
          </button>
        </div>
      </div>

      {/* ── TAB 3 PANEL: ③ 핵심 장점·중개의견 ── */}
      <div
        data-testid="im-tab-panel-axios-brief"
        className={
          activeEditorTab === "axios_brief"
            ? "bg-white rounded-xl border border-[#CBD5E1] p-5 sm:p-6 shadow-sm space-y-5 block"
            : "hidden"
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] pb-3">
          <div>
            <h2 className="text-xl font-extrabold text-[#0F172A]">
              ③ 핵심 장점 3가지 · 담당 중개사 안내
            </h2>
            <p className="text-sm text-[#475569] mt-0.5">
              매수자에게 강조할 핵심 장점 3가지와 담당 중개사 연락처를 입력합니다.
            </p>
          </div>
          <button
            type="button"
            data-testid="im-axios-ai-recluster-btn"
            disabled={isAiPointsBusy}
            aria-busy={isAiPointsBusy}
            onClick={handleReclusterImAxios}
            className="min-h-[48px] px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 disabled:opacity-60 text-white text-sm font-extrabold shadow-xs transition cursor-pointer flex items-center gap-1.5 shrink-0"
          >
            <span>{isAiPointsBusy ? TERMS.aiWriting : TERMS.aiWriteButton}</span>
          </button>
        </div>

        {/* 3 Core Highlight Cards */}
        <div className="space-y-3">
          {axiosHighlights.map((item, idx) => {
            const style = IM_POSTIT_STYLES[item.tone] || IM_POSTIT_STYLES.amber;
            return (
              <div
                key={idx}
                data-testid={`im-axios-postit-${idx}`}
                style={{ backgroundColor: style.bg, borderColor: style.border }}
                className="rounded-xl border border-l-4 p-4 space-y-2.5 shadow-2xs"
              >
                <div className="flex items-center justify-between">
                  <label
                    htmlFor={`im-axios-point-title-${idx}`}
                    style={{ backgroundColor: style.badgeBg, color: style.badgeText }}
                    className="text-sm font-extrabold px-2.5 py-0.5 rounded"
                  >
                    {style.label}
                  </label>
                </div>
                <input
                  id={`im-axios-point-title-${idx}`}
                  type="text"
                  data-testid={`im-axios-point-title-${idx}`}
                  value={item.headline}
                  onChange={(e) => {
                    const next = axiosHighlights.map((h, i) =>
                      i === idx ? { ...h, headline: e.target.value } : h
                    );
                    setAxiosHighlights(next);
                    syncCurrentItemPatch({ axiosHighlights: next });
                  }}
                  className="w-full min-h-[48px] px-3.5 text-lg font-extrabold text-slate-950 bg-white/95 rounded-lg border border-slate-400/80 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  placeholder="핵심 장점 소제목"
                />
                <label htmlFor={`im-axios-point-brief-${idx}`} className="sr-only">
                  장점 {idx + 1} 상세 설명
                </label>
                <textarea
                  id={`im-axios-point-brief-${idx}`}
                  rows={2}
                  data-testid={`im-axios-point-brief-${idx}`}
                  value={item.brief}
                  onChange={(e) => {
                    const next = axiosHighlights.map((h, i) =>
                      i === idx ? { ...h, brief: e.target.value } : h
                    );
                    setAxiosHighlights(next);
                    syncCurrentItemPatch({ axiosHighlights: next });
                  }}
                  className="w-full px-3.5 py-2 text-base font-medium text-slate-800 bg-white/90 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600 leading-relaxed"
                  placeholder="매수자가 주목할 근거를 2~3문장으로 적어 주세요"
                />
              </div>
            );
          })}
        </div>

        {/* 명도 조건 및 특약 사항 */}
        <div className="pt-2 border-t border-slate-200">
          <label
            htmlFor="im-handover-note-input"
            className="block text-base font-bold text-[#334155] mb-1.5"
          >
            명도 및 인도 조건
          </label>
          <textarea
            id="im-handover-note-input"
            rows={2}
            data-testid="im-handover-note-input"
            value={handoverNote}
            onChange={(e) => {
              const nextVal = e.target.value;
              setHandoverNote(nextVal);
              syncCurrentItemPatch({ handoverNote: nextVal });
            }}
            placeholder="예: 현 임대차 승계 또는 잔금 시 명도 협의 가능"
            className="w-full p-3 text-base rounded-xl border border-[#64748B] bg-white outline-none"
          />
        </div>

        {/* 중개인 정보 */}
        <div
          className="bg-slate-50 rounded-2xl border border-[#CBD5E1] p-4 space-y-4"
          data-testid="im-broker-info-card"
        >
          <div className="font-bold text-base text-[#0F172A]">
            담당 공인중개사 정보
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label
                htmlFor="im-brokerage-name-input"
                className="block text-sm font-semibold text-[#334155] mb-1"
              >
                중개법인 / 사무소명
              </label>
              <input
                id="im-brokerage-name-input"
                type="text"
                data-testid="im-brokerage-name-input"
                value={brokerageName}
                onChange={(e) => {
                  const nextVal = e.target.value;
                  setBrokerageName(nextVal);
                  syncCurrentItemPatch({ brokerageName: nextVal });
                }}
                placeholder="예: 크리딜 부동산중개법인"
                className="w-full min-h-[48px] px-3 text-base rounded-xl border border-[#64748B] bg-white outline-none focus:border-[#1D4ED8]"
              />
            </div>
            <div>
              <label
                htmlFor="im-broker-name-input"
                className="block text-sm font-semibold text-[#334155] mb-1"
              >
                담당 공인중개사 성명
              </label>
              <input
                id="im-broker-name-input"
                type="text"
                data-testid="im-broker-name-input"
                value={brokerName}
                onChange={(e) => {
                  const nextVal = e.target.value;
                  setBrokerName(nextVal);
                  syncCurrentItemPatch({ brokerName: nextVal });
                }}
                placeholder="예: 홍길동 대표공인중개사"
                className="w-full min-h-[48px] px-3 text-base rounded-xl border border-[#64748B] bg-white outline-none focus:border-[#1D4ED8]"
              />
            </div>
            <div>
              <label
                htmlFor="im-broker-phone-input"
                className="block text-sm font-semibold text-[#334155] mb-1"
              >
                문의 연락처
              </label>
              <input
                id="im-broker-phone-input"
                type="tel"
                data-testid="im-broker-phone-input"
                value={brokerPhone}
                onChange={(e) => {
                  const nextVal = e.target.value;
                  setBrokerPhone(nextVal);
                  syncCurrentItemPatch({ brokerPhone: nextVal });
                }}
                placeholder="예: 010-1234-5678"
                className="w-full min-h-[48px] px-3 text-base rounded-xl border border-[#64748B] bg-white outline-none focus:border-[#1D4ED8]"
              />
            </div>
          </div>
        </div>

        {/* Next Step Button (Tab 3 -> Tab 4) */}
        <div className="pt-3 border-t border-slate-200 flex justify-end">
          <button
            type="button"
            data-testid="im-next-to-media-btn"
            onClick={() => {
              setActionAlert(null);
              setActiveEditorTab("media_publish");
            }}
            className="min-h-[48px] px-5 py-2.5 rounded-xl bg-[#0F172A] hover:bg-[#1E293B] text-white text-base font-extrabold transition cursor-pointer"
          >
            다음 단계 (④ 사진·위치·만들기) →
          </button>
        </div>
      </div>

      {/* ── TAB 4 PANEL: ④ 사진·지적도·발행 ── */}
      <div
        data-testid="im-tab-panel-media-publish"
        className={
          activeEditorTab === "media_publish"
            ? "bg-white rounded-2xl border-2 border-[#CBD5E1] p-5 sm:p-6 shadow-sm space-y-5 block"
            : "hidden"
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] pb-3">
          <div>
            <h2 className="text-xl font-extrabold text-[#0F172A]">
              ④ 건물 사진 첨부
            </h2>
            <p className="text-sm text-[#475569] mt-0.5">
              건물 외관이나 내부 사진을 올리면 모바일 IM과 10면 발표자료에 함께 들어갑니다.
            </p>
          </div>
        </div>

        <div className="p-6 rounded-2xl bg-[#FAF9F5] border-2 border-dashed border-[#64748B] text-center space-y-4">
          <p className="text-base font-semibold text-[#334155]">
            건물 외관 사진 · 지적도 이미지 올리기
          </p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              if (files.length === 0) return;
              const addedNames = files.map((f) => f.name);
              const addedEntries: ImPhotoEntry[] = files.map((f) => ({
                name: f.name,
                previewUrl:
                  typeof URL !== "undefined" && typeof URL.createObjectURL === "function"
                    ? URL.createObjectURL(f)
                    : undefined,
              }));
              const nextNames = Array.from(new Set([...photoNames, ...addedNames]));
              setPhotoNames(nextNames);
              setPhotoEntries((prev) => [...prev, ...addedEntries]);
              syncCurrentItemPatch({ photoNames: nextNames });
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="min-h-[48px] px-5 py-2.5 bg-white border border-[#64748B] rounded-xl text-base font-bold text-[#0F172A] hover:bg-[#F3F2EE] cursor-pointer"
          >
            + 사진 파일 선택
          </button>

          {photoNames.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-left">
              {photoNames.map((name) => {
                const entry = photoEntries.find((pe) => pe.name === name);
                return (
                  <div
                    key={name}
                    className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white border border-[#CBD5E1]"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {entry?.previewUrl ? (
                        <img
                          src={entry.previewUrl}
                          alt={name}
                          className="w-12 h-12 rounded-lg object-cover border border-slate-200 shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center text-sm font-bold text-slate-600 shrink-0">
                          사진
                        </div>
                      )}
                      <span className="text-sm font-semibold text-[#0F172A] truncate">
                        {name}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const next = photoNames.filter((n) => n !== name);
                        setPhotoNames(next);
                        setPhotoEntries((prev) => prev.filter((pe) => pe.name !== name));
                        syncCurrentItemPatch({ photoNames: next });
                      }}
                      className="min-h-[40px] px-3 text-sm text-[#991B1B] font-extrabold hover:bg-red-50 rounded-lg cursor-pointer"
                      aria-label={`${name} 삭제`}
                    >
                      삭제
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  /* ──────── Column 3: Live Preview ──────── */
  const previewTabSlot = (
    <div
      role="tablist"
      aria-label="IM 미리보기 방식"
      className="inline-flex rounded-xl border border-[#CBD5E1] p-1 bg-[#FAF9F5] shrink-0"
    >
      <button
        type="button"
        role="tab"
        aria-selected={previewTab === "mobile"}
        onClick={() => setPreviewTab("mobile")}
        className={`min-h-[40px] px-3 py-1 text-sm font-bold rounded-lg transition-colors cursor-pointer shrink-0 ${
          previewTab === "mobile"
            ? "bg-[#0F172A] text-white shadow-xs"
            : "text-[#475569] hover:text-[#0F172A]"
        }`}
      >
        모바일 IM
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={previewTab === "pptx"}
        onClick={() => setPreviewTab("pptx")}
        className={`min-h-[40px] px-3 py-1 text-sm font-bold rounded-lg transition-colors cursor-pointer shrink-0 ${
          previewTab === "pptx"
            ? "bg-[#0F172A] text-white shadow-xs"
            : "text-[#475569] hover:text-[#0F172A]"
        }`}
      >
        발표자료 10면
      </button>
    </div>
  );

  const basicImSlides = [
    {
      no: "01",
      title: "표지",
      summary: `${imTitle || currentItem?.title || "매물"} · ${address || "주소 미입력"}`,
      metric: `${formatKoreanCurrencyReadout(askingPriceManwon).replace(/^=\s*/, "")} (${postureKoreanLabel})`,
    },
    {
      no: "02",
      title: "투자 하이라이트",
      summary:
        axiosHighlights[0]?.headline ||
        `희망 매매가 ${formatKoreanCurrencyReadout(askingPriceManwon).replace(/^=\s*/, "")}`,
      metric: `기대 수익률 연 ${calculatedYield.toFixed(2)}%`,
    },
    {
      no: "03",
      title: "건축물 개요",
      summary: `연면적 ${gfaSqm || "—"}㎡ · 사용승인일 ${completionDate || "—"}`,
      metric: `총 ${rentRoll.length}개 층 구성`,
    },
    {
      no: "04",
      title: "입지 및 상권 분석",
      summary: address || "주소 미입력",
      metric: "교통 접근성 및 배후 상권",
    },
    {
      no: "05",
      title: "토지 및 도시계획",
      summary: `대지면적 ${landAreaSqm || "—"}㎡`,
      metric: zoning || "용도지역 미입력",
    },
    {
      no: "06",
      title: "층별 임대차 현황",
      summary: `보증금 합계 ${totalDepositManwon.toLocaleString()}만원`,
      metric: `월 임대수익 ${totalRentManwon.toLocaleString()}만원`,
    },
    {
      no: "07",
      title: "수지 및 수익률 분석",
      summary: `순투자금 ${Math.max(0, (askingPriceManwon || 0) - totalDepositManwon).toLocaleString()}만원`,
      metric: `연 ${calculatedYield.toFixed(2)}%`,
    },
    {
      no: "08",
      title: "인근 실거래 비교",
      summary: `${address.split(" ").slice(1, 3).join(" ") || "인근"} 유사 사례 비교`,
      metric: `희망 매매가 ${formatKoreanCurrencyReadout(askingPriceManwon).replace(/^=\s*/, "")}`,
    },
    {
      no: "09",
      title: "현장 사진 및 지적도",
      summary:
        photoNames.length > 0
          ? `첨부 사진 ${photoNames.length}장 (${photoNames.join(", ")})`
          : "외관 사진 및 지적도",
      metric: `${photoNames.length}개 파일`,
    },
    {
      no: "10",
      title: "문의/안내 및 명도 조건",
      summary: brokerExtrasForm.closingLine
        ? `${brokerExtrasForm.closingLine} · ${handoverNote}`
        : handoverNote || "명도 일정 협의 가능",
      metric:
        [brokerageName, brokerName, brokerPhone].filter(Boolean).join(" · ") ||
        "담당 공인중개사 안내",
    },
  ];

  const visibleSlides =
    activeSlideFilter === "all"
      ? basicImSlides
      : basicImSlides.filter((s) => s.no === activeSlideFilter);

  const previewSlot = (
    <div className="p-3.5 space-y-3.5 max-w-sm mx-auto" data-testid="im-preview-slot">
      {/* Direct Link to Full 10-Section Mobile IM Viewer & PPTX Download */}
      <div className="flex items-center justify-between gap-2 bg-white rounded-xl border border-[#CBD5E1] px-3.5 py-2.5 shadow-xs">
        <span className="text-sm font-bold text-[#334155]">
          {previewTab === "mobile" ? "모바일 IM (10개 섹션)" : "발표자료 10면"}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <a
            href={`/api/public/im-lite/${currentItem?.buildingId || "bld-01"}/pptx?direct=1`}
            data-testid="im-download-pptx-btn"
            className="min-h-[40px] text-sm font-extrabold text-[#065F46] bg-[#D1FAE5] px-3 py-1.5 rounded-lg hover:bg-[#A7F3D0] flex items-center gap-1 transition-colors"
          >
            <span>PPTX 내려받기</span>
          </a>
          <a
            href={`/im-lite/${currentItem?.buildingId || "bld-01"}`}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="im-open-fullscreen-link"
            className="min-h-[40px] text-sm font-extrabold text-[#1D4ED8] hover:underline flex items-center gap-1 px-2"
          >
            <span>전체화면</span>
          </a>
        </div>
      </div>

      {previewTab === "mobile" ? (
        /* Single-scroll Mobile IM Preview (no inner scroll trap) */
        <div
          data-testid="im-mobile-preview-frame"
          className="bg-[#FAF9F5] rounded-[20px] border-2 border-[#334155] p-3 shadow-md flex flex-col"
        >
          <div
            data-testid="im-mobile-preview-scroll"
            className="space-y-3"
          >
            {/* Section 01: Cover Card */}
            <div className="bg-white rounded-xl p-3.5 border border-[#CBD5E1] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-[#1D4ED8] bg-[#EFF6FF] px-2.5 py-0.5 rounded">
                  01 표지 · {postureKoreanLabel}
                </span>
              </div>
              <h3
                data-single-line-title="true"
                title={imTitle || currentItem?.title}
                className="text-lg font-extrabold text-[#0F172A] break-keep"
              >
                {imTitle || currentItem?.title || "표지 제목을 입력해 주세요"}
              </h3>
              <p className="text-sm text-[#475569] break-keep">{address || "주소 미입력"}</p>
              <div className="pt-2 border-t border-[#F1F5F9] flex items-center justify-between text-base font-bold">
                <span className="text-[#0F172A]">
                  {askingPriceManwon > 0
                    ? formatKoreanCurrencyReadout(askingPriceManwon).replace(/^=\s*/, "")
                    : "가격 미입력"}
                </span>
                <span className="text-[#065F46]">
                  {calculatedYield > 0 ? `연 ${calculatedYield.toFixed(2)}%` : "—"}
                </span>
              </div>
            </div>

            {/* Section 02: Investment Highlights */}
            <div className="bg-white rounded-xl p-3.5 border border-[#CBD5E1] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-[#1D4ED8] bg-[#EFF6FF] px-2.5 py-0.5 rounded">
                  02 핵심 장점
                </span>
              </div>
              <div className="space-y-2 pt-0.5" data-testid="im-preview-axios-list">
                {axiosHighlights.map((hl, idx) => {
                  const st = IM_POSTIT_STYLES[hl.tone] || IM_POSTIT_STYLES.amber;
                  return (
                    <div
                      key={idx}
                      style={{ backgroundColor: st.bg, borderColor: st.border }}
                      className="rounded-lg border border-l-4 p-3 space-y-1"
                    >
                      <p
                        data-single-line-title="true"
                        title={hl.headline}
                        className="text-base font-extrabold text-slate-950 break-keep"
                      >
                        {hl.headline || `핵심 장점 ${idx + 1}`}
                      </p>
                      <p className="text-sm text-slate-700 leading-snug break-keep">
                        {hl.brief || "설명을 입력해 주세요"}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Section 03: Building Overview */}
            <div className="bg-white rounded-xl p-3.5 border border-[#CBD5E1] space-y-2">
              <span className="text-sm font-bold text-[#1D4ED8] bg-[#EFF6FF] px-2.5 py-0.5 rounded inline-block">
                03 건축물 개요
              </span>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="p-2.5 bg-[#FAF9F5] rounded-lg border border-slate-200/70">
                  <span className="text-sm text-slate-500 block">연면적</span>
                  <strong className="text-slate-900">
                    {gfaSqm
                      ? `${gfaSqm}㎡ (약 ${Math.round(Number(gfaSqm) * 0.3025)}평)`
                      : "—"}
                  </strong>
                </div>
                <div className="p-2.5 bg-[#FAF9F5] rounded-lg border border-slate-200/70">
                  <span className="text-sm text-slate-500 block">사용승인일</span>
                  <strong className="text-slate-900">{completionDate || "—"}</strong>
                </div>
              </div>
            </div>

            {/* Section 04: Location & Transit */}
            <div className="bg-white rounded-xl p-3.5 border border-[#CBD5E1] space-y-1.5">
              <span className="text-sm font-bold text-[#1D4ED8] bg-[#EFF6FF] px-2.5 py-0.5 rounded inline-block">
                04 입지 및 교통
              </span>
              <p className="text-sm font-semibold text-slate-900 break-keep">
                {address || "주소 미입력"}
              </p>
            </div>

            {/* Section 05: Land & Zoning */}
            <div className="bg-white rounded-xl p-3.5 border border-[#CBD5E1] space-y-2">
              <span className="text-sm font-bold text-[#1D4ED8] bg-[#EFF6FF] px-2.5 py-0.5 rounded inline-block">
                05 토지 및 도시계획
              </span>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="p-2.5 bg-[#FAF9F5] rounded-lg border border-slate-200/70">
                  <span className="text-sm text-slate-500 block">대지면적</span>
                  <strong className="text-slate-900">
                    {landAreaSqm
                      ? `${landAreaSqm}㎡ (약 ${Math.round(Number(landAreaSqm) * 0.3025)}평)`
                      : "—"}
                  </strong>
                </div>
                <div className="p-2.5 bg-[#FAF9F5] rounded-lg border border-slate-200/70">
                  <span className="text-sm text-slate-500 block">용도지역</span>
                  <strong className="text-slate-900 block break-keep">{zoning || "—"}</strong>
                </div>
              </div>
            </div>

            {/* Section 06: Rent Roll preview */}
            <div className="bg-white rounded-xl p-3.5 border border-[#CBD5E1] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-[#1D4ED8] bg-[#EFF6FF] px-2.5 py-0.5 rounded">
                  06 층별 임대차 상세
                </span>
                <span className="text-sm font-bold text-[#065F46]">
                  총 {rentRoll.length}개 층
                </span>
              </div>
              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold">
                    <tr>
                      <th className="py-1.5 px-2">층</th>
                      <th className="py-1.5 px-2">업종</th>
                      <th className="py-1.5 px-2 text-right">보증금/월세(만)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rentRoll.slice(0, 6).map((r, i) => (
                      <tr key={i}>
                        <td className="py-1.5 px-2 font-bold text-slate-900">{r.floor}</td>
                        <td className="py-1.5 px-2 text-slate-700">{r.use || "—"}</td>
                        <td className="py-1.5 px-2 text-right font-mono text-slate-900">
                          {(r.depositManwon ?? 0).toLocaleString()} /{" "}
                          {(r.monthlyRentManwon ?? 0).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Section 07: Yield & Cash Flow */}
            <div className="bg-white rounded-xl p-3.5 border border-[#CBD5E1] space-y-2">
              <span className="text-sm font-bold text-[#1D4ED8] bg-[#EFF6FF] px-2.5 py-0.5 rounded inline-block">
                07 수지 및 수익률 분석
              </span>
              <div className="p-3 bg-emerald-50/70 rounded-lg border border-emerald-200 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-700">보증금 합계 / 월 임대료</span>
                  <strong className="text-slate-900">
                    {totalDepositManwon.toLocaleString()}만 / {totalRentManwon.toLocaleString()}만
                  </strong>
                </div>
                <div className="flex justify-between font-extrabold text-[#065F46] pt-1 border-t border-emerald-200/80">
                  <span>예상 연 수익률</span>
                  <span>{calculatedYield.toFixed(2)}%</span>
                </div>
              </div>
            </div>

            {/* Section 08: Comparable Transactions */}
            <div className="bg-white rounded-xl p-3.5 border border-[#CBD5E1] space-y-1.5">
              <span className="text-sm font-bold text-[#1D4ED8] bg-[#EFF6FF] px-2.5 py-0.5 rounded inline-block">
                08 인근 실거래 비교
              </span>
              <p className="text-sm text-slate-700">
                {address.split(" ").slice(1, 3).join(" ") || "인근"} 유사 규모 거래 사례 비교
              </p>
            </div>

            {/* Section 09: Photos & Cadastral Map */}
            <div className="bg-white rounded-xl p-3.5 border border-[#CBD5E1] space-y-1.5">
              <span className="text-sm font-bold text-[#1D4ED8] bg-[#EFF6FF] px-2.5 py-0.5 rounded inline-block">
                09 현장 사진 및 지적도
              </span>
              <p className="text-sm text-slate-700">
                {photoNames.length > 0
                  ? `첨부 사진 ${photoNames.length}장 및 지적도`
                  : "외관 사진 및 지적도 자동 배치"}
              </p>
            </div>

            {/* Section 10: Contact & Deal Terms */}
            <div className="bg-white rounded-xl p-3.5 border border-[#CBD5E1] space-y-1.5">
              <span className="text-sm font-bold text-[#1D4ED8] bg-[#EFF6FF] px-2.5 py-0.5 rounded inline-block">
                10 거래 조건 및 담당 중개인
              </span>
              <p className="text-sm font-bold text-slate-900 break-keep">
                {[brokerageName, brokerName, brokerPhone].filter(Boolean).join(" · ") ||
                  "담당 공인중개사 안내"}
              </p>
              <p className="text-sm text-slate-600 break-keep">
                {handoverNote || "명도 일정 협의 가능"}
              </p>
            </div>
          </div>
        </div>
      ) : (
        /* 16:9 Landscape 10-Slide PPTX Deck Preview */
        <div className="space-y-2.5" data-testid="im-pptx-deck-preview">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            <button
              type="button"
              onClick={() => setActiveSlideFilter("all")}
              className={`min-h-[38px] px-3 py-1 rounded-lg text-sm font-extrabold shrink-0 cursor-pointer ${
                activeSlideFilter === "all"
                  ? "bg-[#0F172A] text-white"
                  : "bg-white text-slate-700 border border-slate-300"
              }`}
            >
              전체 10면
            </button>
            {basicImSlides.map((s) => (
              <button
                key={s.no}
                type="button"
                onClick={() => setActiveSlideFilter(s.no)}
                className={`min-h-[38px] px-2.5 py-1 rounded-lg text-sm font-bold shrink-0 cursor-pointer ${
                  activeSlideFilter === s.no
                    ? "bg-[#1D4ED8] text-white"
                    : "bg-white text-slate-700 border border-slate-300"
                }`}
              >
                {s.no}
              </button>
            ))}
          </div>

          <div className="space-y-2.5" data-theme-lock="dark">
            {visibleSlides.map((slide) => (
              <div
                key={slide.no}
                data-testid={`im-slide-preview-${slide.no}`}
                className="aspect-video w-full bg-[#0F172A] text-white rounded-xl border border-[#334155] p-4 flex flex-col justify-between shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-extrabold text-[#93C5FD] bg-[#1E3A8A]/60 px-2.5 py-0.5 rounded">
                    {slide.no} · {slide.title}
                  </span>
                  <span className="text-sm text-[#94A3B8] font-mono">{slide.no} / 10</span>
                </div>
                <div className="space-y-1 my-auto py-1">
                  <p
                    data-single-line-title="true"
                    title={slide.summary}
                    className="text-base font-bold text-white leading-snug break-keep"
                  >
                    {slide.summary}
                  </p>
                </div>
                <div className="flex items-center justify-between border-t border-[#1E293B] pt-2 text-sm">
                  <span className="text-[#34D399] font-bold truncate">{slide.metric}</span>
                  <span className="text-slate-300 text-sm truncate max-w-[140px]">
                    {brokerageName || "담당 중개법인"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  /* ── Single Primary CTA in primaryActionSlot ── */
  const primaryActionSlot = (
    <button
      type="button"
      data-testid="im-quick-generate-btn"
      disabled={isGenerating}
      aria-busy={isGenerating}
      onClick={handleQuickGenerate}
      className="w-full min-h-[56px] px-6 py-3.5 bg-[#1D4ED8] text-white rounded-2xl font-extrabold text-lg hover:bg-[#1E40AF] transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:opacity-50"
    >
      <span>{isGenerating ? "IM 만드는 중…" : TERMS.createIm}</span>
    </button>
  );

  return (
    <>
      <WorkspaceShell
        workspace="im"
        listTitle={TERMS.colPick}
        editorTitle={TERMS.colFill}
        previewTitle={TERMS.colPreviewSend}
        listSlot={listSlot}
        editorSlot={editorSlot}
        previewSlot={previewSlot}
        previewTabSlot={previewTabSlot}
        primaryActionSlot={primaryActionSlot}
        saveState={autosave.status}
        lastSavedAt={autosave.lastSavedAt}
        onRetrySave={() => {
          void autosave.flush();
        }}
        selectedBuildingId={selectedId}
        selectedLabel={imTitle || currentItem?.title || "새 IM"}
        onBuildingSelect={setSelectedId}
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
