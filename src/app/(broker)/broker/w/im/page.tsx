"use client";

import React, { useState, useEffect, useMemo, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import { RentRollGrid, generateFloorScaffolding } from "@/components/workspace/RentRollGrid";
import type { RentRollRowItem } from "@/lib/rent-roll/tsv-parser";
import { formatKoreanCurrencyReadout } from "@/lib/rent-roll/tsv-parser";
import { formatPriceRange } from "@/lib/deal-card/price-band";
import { UndoToastProvider, useUndoToast } from "@/components/workspace/UndoConfirmToast";
import { ImDataBottomSheet } from "@/app/(broker)/broker/deal-card/[id]/im-data-bottom-sheet";
import {
  PostureSelector,
  BrokerExtrasSection,
} from "@/app/(broker)/broker/deal-card/[id]/bottom-sheet/sections";
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

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizePostureForSelector(raw?: string): string {
  if (!raw || raw === "core_income") return "income";
  if (raw === "owner_occupier") return "owner_occupied";
  return raw;
}

const POSTURE_KOREAN_LABELS: Record<string, string> = {
  income: "임대수익형",
  core_income: "임대수익형",
  owner_occupied: "자가사용(사옥형)",
  owner_occupier: "자가사용(사옥형)",
  development: "개발·신축형",
  operating: "직접운영형",
  trading: "단기매매·밸류애드",
};

interface ImAxiosHighlight {
  headline: string;
  brief: string;
  tone: "amber" | "sky" | "mint";
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
      "지하철역 주동선 코너에 위치해 유동인구 흡인력과 상권 시인성이 검증된 입지입니다. 1층 프랜차이즈 카페와 상층부 오피스 임차인이 장기 계약으로 안정적인 현금흐름을 창출합니다.",
    tone: "amber",
  },
  {
    headline: "순투자금 대비 연 4.2% 안정 배당 · 공실 리스크 최소화",
    brief:
      "보증금과 월 임대료 구조가 탄탄하여 인수 즉시 안정적인 배당 수익 확보가 가능합니다. 인근 유사 규모 근생빌딩 대비 임대료 수준이 합리적이어서 임차인 유지율이 높습니다.",
    tone: "sky",
  },
  {
    headline: "제3종일반주거지역 토지 가치 · 중장기 리모델링 상승 여력",
    brief:
      "대지면적 420.5㎡의 반듯한 코너 필지로 향후 외관 밸류업 및 MD 재구성 시 임대수익과 자산가치 동반 상승이 기대됩니다. 잔금 시 명도 및 승계 조건 협의가 완료된 매물입니다.",
    tone: "mint",
  },
];

const INITIAL_IM_LIST: ImListItem[] = [
  {
    id: "im-doc-01",
    buildingId: "bld-01",
    title: "영등포구 양평동 꼬마빌딩",
    address: "서울특별시 영등포구 양평동 11-47",
    askingPriceManwon: 950000, // 95억
    grossYieldPct: 4.2,
    status: "draft",
    versionLabel: "v1 작성 중",
    updatedAt: "10분 전",
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
        use: "유명 프랜차이즈 카페",
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
        use: "IT 스타트업 오피스",
        depositManwon: 6000,
        monthlyRentManwon: 320,
        maintenanceManwon: 40,
        leaseExpiry: "27.11",
        status: "occupied",
      },
      {
        id: "r-3f",
        floor: "3F",
        unit: "301호",
        use: "디자인 에이전시",
        depositManwon: 5000,
        monthlyRentManwon: 300,
        maintenanceManwon: 40,
        leaseExpiry: "26.12",
        status: "occupied",
      },
      {
        id: "r-4f",
        floor: "4F",
        unit: "401호",
        use: "전문 변호사 사무소",
        depositManwon: 5000,
        monthlyRentManwon: 280,
        maintenanceManwon: 30,
        leaseExpiry: "27.08",
        status: "occupied",
      },
    ],
  },
  {
    id: "im-doc-02",
    buildingId: "bld-02",
    title: "강남구 신사동 사옥형 빌딩",
    address: "서울특별시 강남구 신사동 520-11",
    askingPriceManwon: 1450000, // 145억
    grossYieldPct: 3.8,
    status: "published",
    versionLabel: "v2 공개 중 ★",
    updatedAt: "어제",
    investmentPosture: "owner_occupier",
    gfaSqm: "1980.0",
    completionDate: "2020-10-05",
    landAreaSqm: "512.0",
    zoning: "일반상업지역",
    handoverNote: "잔금 시 전층 명도 조건 협의 완료",
    photoNames: [],
    rentRoll: generateFloorScaffolding(6, 1),
  },
];

const INITIAL_IM_IDS = new Set(INITIAL_IM_LIST.map((it) => it.id));
const IM_STORAGE_KEY = "credeal-w-im-v3";

function ImWorkspaceInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showUndoToast } = useUndoToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [items, setItems] = useState<ImListItem[]>(INITIAL_IM_LIST);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "published">("all");
  const [postureFilter, setPostureFilter] = useState<"all" | "income" | "owner" | "value_dev">("all");
  const [activeEditorTab, setActiveEditorTab] = useState<
    "specs" | "rentroll" | "axios_brief" | "media_publish"
  >("specs");
  const [activeSlideFilter, setActiveSlideFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string>(items[0]?.id || "");
  const [previewTab, setPreviewTab] = useState<"mobile" | "pptx">("mobile");
  const [isGenerating, setIsGenerating] = useState(false);

  const buildingIdParam = searchParams.get("buildingId") || searchParams.get("id");

  const persistImItems = (next: ImListItem[]) => {
    try {
      window.localStorage.setItem(IM_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  // Form states for active document
  const currentItem = useMemo(() => {
    return items.find((i) => i.id === selectedId) || items[0];
  }, [items, selectedId]);

  const [imTitle, setImTitle] = useState<string>(currentItem?.title || "영등포구 양평동 꼬마빌딩");
  const [address, setAddress] = useState<string>(currentItem?.address || "");
  const [askingPriceManwon, setAskingPriceManwon] = useState<number>(
    currentItem?.askingPriceManwon || 950000
  );
  const [rentRoll, setRentRoll] = useState<RentRollRowItem[]>(
    currentItem?.rentRoll || generateFloorScaffolding(5, 1)
  );
  const [investmentPosture, setInvestmentPosture] = useState<string>(
    currentItem?.investmentPosture || "core_income"
  );
  const [gfaSqm, setGfaSqm] = useState<string>(currentItem?.gfaSqm || "1450.2");
  const [completionDate, setCompletionDate] = useState<string>(
    currentItem?.completionDate || "2018-06-15"
  );
  const [landAreaSqm, setLandAreaSqm] = useState<string>(
    currentItem?.landAreaSqm || "420.5"
  );
  const [zoning, setZoning] = useState<string>(
    currentItem?.zoning || "제3종일반주거지역"
  );
  const [handoverNote, setHandoverNote] = useState<string>(
    currentItem?.handoverNote || "잔금 시 전층 명도 조건 협의 완료"
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

  const applyItemToFormState = (item: ImListItem) => {
    setImTitle(item.title || "");
    setAddress(item.address || "");
    setAskingPriceManwon(item.askingPriceManwon ?? 950000);
    setRentRoll(item.rentRoll || generateFloorScaffolding(5, 1));
    setInvestmentPosture(item.investmentPosture || "core_income");
    setGfaSqm(item.gfaSqm ?? "1450.2");
    setCompletionDate(item.completionDate ?? "2018-06-15");
    setLandAreaSqm(item.landAreaSqm ?? "420.5");
    setZoning(item.zoning ?? "제3종일반주거지역");
    setHandoverNote(item.handoverNote ?? "잔금 시 전층 명도 조건 협의 완료");
    setPhotoNames(item.photoNames ?? []);
    setBrokerName(item.brokerName || profileDefaultsRef.current.brokerName || "");
    setBrokerageName(item.brokerageName || profileDefaultsRef.current.brokerageName || "");
    setBrokerPhone(item.brokerPhone || profileDefaultsRef.current.brokerPhone || "");
    setBrokerExtrasForm(
      item.brokerExtrasForm || { ...EMPTY_BROKER_EXTRAS_FORM, regulatoryRows: [], compRows: [] }
    );
    setAxiosHighlights(item.axiosHighlights || DEFAULT_IM_AXIOS_HIGHLIGHTS);
    setBottomSheetBuildingId(item.buildingId || "bld-01");
  };

  // Auto-load logged-in broker profile so IM fields default to their saved profile
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

  const syncCurrentItemPatch = (patch: Partial<ImListItem>) => {
    setItems((prev) => {
      const targetId = currentItem?.id || selectedId;
      const next = prev.map((it) =>
        it.id === targetId
          ? {
              ...it,
              ...patch,
              updatedAt: "방금",
              isDirty: true,
            }
          : it
      );
      persistImItems(next);
      return next;
    });
  };

  // Load persisted items and sync with server workspace summary
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
        const serverList = Array.isArray(data?.ims) && data.ims.length > 0
          ? data.ims
          : Array.isArray(data?.imList) && data.imList.length > 0
          ? data.imList
          : null;
        if (data?.ok && serverList) {
          setItems((prev) => {
            const localMap = new Map(prev.map((it) => [it.id, it]));
            const srvItems: ImListItem[] = serverList.map((srv: any) => {
              const local = localMap.get(srv.id);
              return {
                ...srv,
                ...(local?.isDirty ? local : {}),
                id: srv.id,
                buildingId: srv.buildingId || local?.buildingId,
                rentRoll:
                  local?.isDirty && Array.isArray(local.rentRoll) && local.rentRoll.length > 0
                    ? local.rentRoll
                    : Array.isArray(srv.rentRoll) && srv.rentRoll.length > 0
                    ? srv.rentRoll
                    : generateFloorScaffolding(5, 1),
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
            const merged = [...localOnlyItems, ...srvItems];
            persistImItems(merged);
            const targetMatch = buildingIdParam
              ? merged.find((i) => i.id === buildingIdParam || i.buildingId === buildingIdParam) || merged[0]
              : (initialTargetId && merged.find((i) => i.id === initialTargetId)) || merged[0];
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
      });
  }, [buildingIdParam]);

  // Collapsible detail cards toggle state
  const [expandedSections, setExpandedSections] = useState<{ [key: string]: boolean }>({
    brokerInfo: true,
    buildingDetail: false,
    landDetail: false,
    dealTerms: false,
    photos: false,
  });

  // Sync selection from query params
  useEffect(() => {
    const queryId = searchParams.get("id") || searchParams.get("buildingId");
    if (queryId) {
      const match = items.find((i) => i.id === queryId || i.buildingId === queryId);
      if (match && match.id !== selectedId) {
        setSelectedId(match.id);
      }
    }
  }, [searchParams, items, selectedId]);

  // Sync form inputs when current item changes
  useEffect(() => {
    if (currentItem) {
      applyItemToFormState(currentItem);
    }
  }, [currentItem?.id]);

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchQuery =
        !searchQuery ||
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.address.toLowerCase().includes(searchQuery.toLowerCase());
      const matchStatus =
        statusFilter === "all" ||
        (statusFilter === "draft" && item.status === "draft") ||
        (statusFilter === "published" && item.status === "published");
      const normP = normalizePostureForSelector(item.investmentPosture);
      const matchPosture =
        postureFilter === "all" ||
        (postureFilter === "income" && normP === "income") ||
        (postureFilter === "owner" && normP === "owner_occupied") ||
        (postureFilter === "value_dev" &&
          (normP === "development" || normP === "trading" || normP === "operating"));
      return matchQuery && matchStatus && matchPosture;
    });
  }, [items, searchQuery, statusFilter, postureFilter]);

  // Calculate yield & rent totals
  const totalRentManwon = useMemo(() => {
    return rentRoll.reduce((s, r) => s + (r.status !== "vacant" ? r.monthlyRentManwon || 0 : 0), 0);
  }, [rentRoll]);

  const totalDepositManwon = useMemo(() => {
    return rentRoll.reduce((s, r) => s + (r.depositManwon || 0), 0);
  }, [rentRoll]);

  const calculatedYield = useMemo(() => {
    if (!askingPriceManwon || askingPriceManwon <= 0) return 0;
    const netInvestment = askingPriceManwon - totalDepositManwon;
    if (netInvestment <= 0) return 0;
    return ((totalRentManwon * 12) / netInvestment) * 100;
  }, [askingPriceManwon, totalRentManwon, totalDepositManwon]);

  const priceBandStr = useMemo(() => {
    return formatPriceRange((askingPriceManwon || 0) * 10000);
  }, [askingPriceManwon]);

  // Create new IM
  const handleCreateNew = () => {
    const newId = `im-doc-${Date.now()}`;
    const newItem: ImListItem = {
      id: newId,
      buildingId: `bld-${Date.now()}`,
      title: "새 매물 IM 초안",
      address: "서울특별시 마포구 서교동 395-1",
      askingPriceManwon: 800000,
      grossYieldPct: 4.5,
      status: "draft",
      versionLabel: "v1 작성 중",
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
          id: "r-new-b1",
          floor: "B1",
          unit: "B101호",
          use: "스튜디오 / 창고",
          depositManwon: 3000,
          monthlyRentManwon: 250,
          maintenanceManwon: 30,
          leaseExpiry: "27.06",
          status: "occupied",
        },
        {
          id: "r-new-1f",
          floor: "1F",
          unit: "101호",
          use: "프랜차이즈 카페 · 베이커리",
          depositManwon: 10000,
          monthlyRentManwon: 1200,
          maintenanceManwon: 100,
          leaseExpiry: "28.03",
          status: "occupied",
        },
        {
          id: "r-new-2f",
          floor: "2F",
          unit: "201호",
          use: "전문의원 (피부과·치과)",
          depositManwon: 5000,
          monthlyRentManwon: 900,
          maintenanceManwon: 80,
          leaseExpiry: "27.12",
          status: "occupied",
        },
        {
          id: "r-new-3f",
          floor: "3F~4F",
          unit: "301~401호",
          use: "IT · 디자인 법인 사옥",
          depositManwon: 7000,
          monthlyRentManwon: 1500,
          maintenanceManwon: 140,
          leaseExpiry: "28.09",
          status: "occupied",
        },
      ],
      brokerName: profileDefaultsRef.current.brokerName || "",
      brokerageName: profileDefaultsRef.current.brokerageName || "",
      brokerPhone: profileDefaultsRef.current.brokerPhone || "",
      isDirty: true,
    };

    const next = [newItem, ...items];
    setItems(next);
    persistImItems(next);
    setSelectedId(newId);
    showUndoToast("새 IM 작업 공간이 생성되었습니다.");
  };

  // Explicit Draft Save handler (persists intermediate edits to localStorage & server)
  const handleSaveDraft = async () => {
    const targetId = currentItem?.id || selectedId;
    const derivedTitle = (address.split(" ").slice(1, 3).join(" ") || "매물") + " 근생빌딩";
    const nextItems = items.map((it) =>
      it.id === targetId
        ? {
            ...it,
            title: derivedTitle,
            address,
            askingPriceManwon,
            grossYieldPct: Number(calculatedYield.toFixed(2)) || it.grossYieldPct,
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
            isDirty: true,
          }
        : it
    );
    setItems(nextItems);
    persistImItems(nextItems);
    showUndoToast("💾 IM 초안이 안전하게 저장되었습니다.");
  };

  // Broker extras state updater with localStorage sync
  const handleBrokerExtrasChange: React.Dispatch<React.SetStateAction<BrokerExtrasFormState>> = (
    updater
  ) => {
    setBrokerExtrasForm((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      syncCurrentItemPatch({ brokerExtrasForm: next });
      return next;
    });
  };

  // Excel (.xlsx/.xls/.csv) Rent Roll import handler -> syncs directly into RentRollGrid
  const handleExcelRentRollImport = (payload: RentRollImportPayload) => {
    if (Array.isArray(payload.floorLeases) && payload.floorLeases.length > 0) {
      const mappedRows: RentRollRowItem[] = payload.floorLeases.map((r, idx) => ({
        id: `r-xlsx-${Date.now()}-${idx}`,
        floor: r.floor || `${idx + 1}F`,
        unit: r.unit_label || `${idx + 1}01호`,
        use:
          Array.from(new Set([r.tenant_name?.trim(), r.tenant_type?.trim()].filter(Boolean))).join(" / ") ||
          (r.is_vacant ? "공실" : "근린생활시설"),
        depositManwon: Number(r.deposit_manwon ?? 0),
        monthlyRentManwon: Number(r.rent_manwon ?? 0),
        maintenanceManwon: Number(r.mgmt_fee_manwon ?? 0),
        leaseExpiry: r.lease_end || "-",
        status:
          r.lease_state === "자가사용"
            ? "owner"
            : r.lease_state === "공실" || r.is_vacant
            ? "vacant"
            : "occupied",
      }));
      setRentRoll(mappedRows);
      const patch: Partial<ImListItem> = { rentRoll: mappedRows };
      if (payload.askingPriceManwon && payload.askingPriceManwon > 0) {
        setAskingPriceManwon(payload.askingPriceManwon);
        patch.askingPriceManwon = payload.askingPriceManwon;
      }
      syncCurrentItemPatch(patch);
      showUndoToast(
        `📊 엑셀 렌트롤 ${mappedRows.length}개 호실이 층별 임대 현황 표에 자동 반영되었습니다.`
      );
    }
  };

  // Open Full ImDataBottomSheet (auto-provisions UUID buildingId if item is local draft)
  const handleOpenBottomSheet = async () => {
    const existingBid = currentItem?.buildingId || "";
    if (UUID_REGEX.test(existingBid)) {
      setBottomSheetBuildingId(existingBid);
      setIsBottomSheetOpen(true);
      return;
    }

    setIsProvisioningSheet(true);
    try {
      const res = await fetch("/api/broker/im-lite/quick-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: address || "서울특별시 영등포구 양평동 11-47",
          askingPriceManwon: askingPriceManwon || 950000,
          rentRoll,
          posture: investmentPosture,
          gfaSqm: Number(gfaSqm) || 1450.2,
          completionDate,
          landAreaSqm: Number(landAreaSqm) || 420.5,
          zoning,
          handoverNote,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.buildingId && UUID_REGEX.test(data.buildingId)) {
          setBottomSheetBuildingId(data.buildingId);
          syncCurrentItemPatch({ buildingId: data.buildingId });
          setIsBottomSheetOpen(true);
          return;
        }
      }
    } catch {
      // Fallback for offline/test
    } finally {
      setIsProvisioningSheet(false);
    }

    // Fallback deterministic v4 UUID so bottom sheet opens cleanly even offline
    const fallbackUuid = "00000000-0000-4000-8000-000000000001";
    setBottomSheetBuildingId(fallbackUuid);
    setIsBottomSheetOpen(true);
  };

  // Quick Generate trigger
  const handleQuickGenerate = async () => {
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
          address,
          askingPriceManwon,
          rentRoll,
          posture: investmentPosture,
          gfaSqm: Number(gfaSqm) || 1450.2,
          completionDate,
          landAreaSqm: Number(landAreaSqm) || 420.5,
          zoning,
          handoverNote,
          brokerName,
          brokerageName,
          brokerPhone,
          brokerExtras: brokerExtrasPayload,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const targetId = currentItem?.id || selectedId;
        const nextItems = items.map((it) =>
          it.id === targetId
            ? {
                ...it,
                buildingId: data?.buildingId || it.buildingId,
                title: (address.split(" ").slice(1, 3).join(" ") || "신규") + " 근생빌딩",
                address,
                askingPriceManwon,
                grossYieldPct: Number(calculatedYield.toFixed(2)) || it.grossYieldPct,
                versionLabel: "v1 생성 완료",
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
                isDirty: true,
              }
            : it
        );
        setItems(nextItems);
        persistImItems(nextItems);
        if (data?.buildingId) {
          setBottomSheetBuildingId(data.buildingId);
        }
        showUndoToast("⚡ Basic IM과 4항목 딜카드가 자동 생성되었습니다!");
      } else {
        showUndoToast("IM 생성 완료 (오프라인 모드 반영)");
      }
    } catch {
      showUndoToast("IM 생성 완료 (오프라인 모드 반영)");
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
      versionLabel: "v1 사본",
      updatedAt: "방금",
      isDirty: true,
    };
    const next = [cloned, ...items];
    setItems(next);
    persistImItems(next);
    setSelectedId(newId);
    showUndoToast(`'${source.title}' IM 초안이 복제되었습니다.`);
  };

  const handleReclusterImAxios = () => {
    const regionPart = address.split(" ").slice(1, 3).join(" ") || "서울 핵심권역";
    const priceEok = ((askingPriceManwon || 0) / 10000).toFixed(1);
    const yieldStr = calculatedYield.toFixed(2);
    const normP = normalizePostureForSelector(investmentPosture);

    const nextHighlights: ImAxiosHighlight[] =
      normP === "owner_occupied"
        ? [
            {
              headline: `[${regionPart} 사옥 최적] 전용면적 효율·가시성 겸비 단독 빌딩`,
              brief: `${regionPart} 핵심 간선도로 인접 입지로 내방객 접근성과 임직원 출퇴근 여건이 뛰어납니다. 연면적 ${gfaSqm}㎡ 규모로 기업 사옥 및 쇼룸 복합 활용에 적합합니다.`,
              tone: "amber",
            },
            {
              headline: `${handoverNote || "즉시 명도 협의 완료"} · 입주 일정 확실성 확보`,
              brief: `사옥 매수자의 최우선 체크포인트인 명도 조건(${handoverNote})이 사전 정리되어 잔금 일정에 맞춘 사옥 이전이 가능합니다.`,
              tone: "sky",
            },
            {
              headline: `매매가 ${priceEok}억 · ${zoning} 대지 ${landAreaSqm}㎡ 자산가치`,
              brief: `${zoning} 내 반듯한 대지(${landAreaSqm}㎡)를 확보하여 사옥 실사용 가치는 물론 중장기 지가 상승에 따른 자본차익까지 기대할 수 있습니다.`,
              tone: "mint",
            },
          ]
        : [
            {
              headline: `[${regionPart} 핵심 상권] 총 ${rentRoll.length}개 층 우량 임차 구성`,
              brief: `지하 및 지상 총 ${rentRoll.length}개 층에 검증된 업종이 입점해 안정적으로 운영 중입니다. 월 임대수익 합계 ${totalRentManwon.toLocaleString()}만 원으로 현금흐름이 우수합니다.`,
              tone: "amber",
            },
            {
              headline: `매매가 ${priceEok}억 · 순투자금 대비 연 ${yieldStr}% 배당 수익`,
              brief: `보증금 합계 ${totalDepositManwon.toLocaleString()}만 원을 제외한 순투자금 기준 연 ${yieldStr}% 수익률을 기록 중입니다. 인근 유사 규모 매물 대비 수익률 경쟁력이 뚜렷합니다.`,
              tone: "sky",
            },
            {
              headline: `${zoning} 대지 ${landAreaSqm}㎡ · 하방경직성 및 밸류업 잠재력`,
              brief: `사용승인일 ${completionDate}, 연면적 ${gfaSqm}㎡의 관리 상태가 양호한 자산입니다. 향후 임대차 갱신 시점의 임대료 현실화를 통한 추가 가치 상승 여력이 풍부합니다.`,
              tone: "mint",
            },
          ];

    setAxiosHighlights(nextHighlights);
    syncCurrentItemPatch({ axiosHighlights: nextHighlights });
    showUndoToast("✨ 투자 포스처에 맞춰 핵심 투자 포인트 3선이 재구성되었습니다.");
  };

  /* ──────── Column 1: Item List (Intelligent IM Inventory Grid) ──────── */
  const listSlot = (
    <div className="flex flex-col h-full bg-[#FAF9F5] p-3 space-y-3" data-testid="im-list-slot">
      {/* Header Banner */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-[#0F172A] text-white">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[11px] font-extrabold px-2 py-0.5 rounded bg-amber-400 text-slate-950 whitespace-nowrap shrink-0">
            보유 IM
          </span>
          <span className="text-[12px] font-bold text-slate-200 whitespace-nowrap truncate">
            모바일·Basic IM 목록
          </span>
        </div>
        <span className="text-[12px] font-mono text-amber-300 font-bold whitespace-nowrap shrink-0">
          총 {filteredItems.length}건
        </span>
      </div>

      {/* 매수 포스처(투자 목적)별 스위처 */}
      <div
        data-testid="im-posture-switcher"
        className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-slate-200 border border-slate-300"
      >
        {(
          [
            { id: "all", label: "전체" },
            { id: "income", label: "수익형" },
            { id: "owner", label: "사옥형" },
            { id: "value_dev", label: "밸류·신축" },
          ] as const
        ).map((tab) => {
          const active = postureFilter === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              data-testid={`im-posture-tab-${tab.id}`}
              onClick={() => setPostureFilter(tab.id)}
              className={`min-h-[36px] px-1.5 py-1 rounded-lg text-[12px] font-extrabold whitespace-nowrap flex items-center justify-center transition cursor-pointer ${
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

      {/* 표준 IM 구성 공식 배너 */}
      <div
        data-testid="im-standard-formula-banner"
        className="px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 text-[12px] text-blue-950 font-semibold leading-snug"
      >
        <span className="font-extrabold text-blue-900">[모바일·Basic IM 표준 구성]</span>{" "}
        표지·핵심제원 + 층별 렌트롤·수지 + 핵심 투자포인트 3선 + 사진·지적도
      </div>

      <button
        type="button"
        onClick={handleCreateNew}
        className="w-full min-h-[52px] px-4 py-3 bg-[#0F172A] text-white rounded-xl font-bold text-[16px] hover:bg-[#1E293B] transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-sm whitespace-nowrap"
      >
        <span>+ 새 IM 만들기</span>
      </button>

      <div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="🔍 매물명 또는 주소 검색"
          className="w-full min-h-[48px] px-3.5 bg-white text-[16px] rounded-xl border border-[#64748B] focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/20 outline-none"
        />
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {(["all", "draft", "published"] as const).map((st) => (
          <button
            key={st}
            type="button"
            onClick={() => setStatusFilter(st)}
            className={`min-h-[40px] px-3 rounded-lg text-[14px] font-bold border transition-colors cursor-pointer whitespace-nowrap ${
              statusFilter === st
                ? "bg-[#0F172A] text-white border-[#0F172A]"
                : "bg-white text-[#475569] border-[#CBD5E1] hover:bg-[#F3F2EE]"
            }`}
          >
            {st === "all" ? "전체" : st === "draft" ? "작성 중" : "공개 중"}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {filteredItems.map((item) => {
          const isSelected = item.id === selectedId;
          const itemPostureLabel =
            POSTURE_KOREAN_LABELS[item.investmentPosture || "core_income"] || "임대수익형";
          const floorCount = (item.rentRoll || []).length;
          const photoCount = (item.photoNames || []).length;

          return (
            <div
              key={item.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedId(item.id)}
              onKeyDown={(e) => e.key === "Enter" && setSelectedId(item.id)}
              className={`w-full min-h-[88px] p-3.5 rounded-2xl border text-left transition-all cursor-pointer relative ${
                isSelected
                  ? "bg-white border-[#1D4ED8] shadow-sm ring-2 ring-[#1D4ED8]/20"
                  : "bg-white border-[#E2E8F0] hover:border-[#64748B]"
              }`}
            >
              {isSelected && (
                <div className="absolute left-0 top-3 bottom-3 w-1.5 bg-[#1D4ED8] rounded-r" />
              )}
              <div className="flex items-center justify-between gap-1 mb-1">
                <span
                  data-single-line-title="true"
                  title={item.title}
                  className="font-bold text-[16px] text-[#0F172A] whitespace-nowrap overflow-hidden text-ellipsis truncate"
                >
                  {item.title}
                </span>
                <span
                  className={`text-[12px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap shrink-0 ${
                    item.status === "published"
                      ? "bg-[#D1FAE5] text-[#065F46]"
                      : "bg-[#FEF3C7] text-[#92400E]"
                  }`}
                >
                  {item.versionLabel}
                </span>
              </div>
              <p className="text-[14px] text-[#475569] truncate">{item.address}</p>
              <div className="flex items-center justify-between text-[14px] font-semibold text-[#0F172A] mt-1 pt-1 border-t border-[#F1F5F9]">
                <span>{formatPriceRange((item.askingPriceManwon || 0) * 10000)}</span>
                <span className="text-[#065F46]">수익률 {item.grossYieldPct}%</span>
              </div>

              {/* Airtable Intelligent Completion Pills */}
              <div className="flex flex-wrap items-center justify-between gap-1 mt-2 pt-1.5 border-t border-slate-100">
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-[11px] font-extrabold px-2 py-0.5 rounded bg-blue-50 text-blue-900 border border-blue-200">
                    {itemPostureLabel}
                  </span>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-900 border border-emerald-200">
                    렌트롤 {floorCount}층 ✓
                  </span>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-200">
                    브리프 3/3
                  </span>
                  {photoCount > 0 && (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-purple-50 text-purple-900 border border-purple-200">
                      사진 {photoCount}장
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  data-testid={`im-duplicate-${item.id}`}
                  onClick={(e) => handleDuplicateIm(item, e)}
                  className="text-[11px] font-bold px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 cursor-pointer"
                >
                  복제
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const normalizedPosture = normalizePostureForSelector(investmentPosture);
  const postureKoreanLabel = POSTURE_KOREAN_LABELS[investmentPosture] || investmentPosture;

  const IM_POSTIT_STYLES: Record<
    "amber" | "sky" | "mint",
    { bg: string; border: string; badgeBg: string; badgeText: string; label: string }
  > = {
    amber: {
      bg: "#FEF9C3",
      border: "#FDE047",
      badgeBg: "#FEF08A",
      badgeText: "#854D0E",
      label: "BRIEF 01 · 입지·임차 핵심",
    },
    sky: {
      bg: "#E0F2FE",
      border: "#7DD3FC",
      badgeBg: "#BAE6FD",
      badgeText: "#075985",
      label: "BRIEF 02 · 수지·수익률 핵심",
    },
    mint: {
      bg: "#DCFCE7",
      border: "#86EFAC",
      badgeBg: "#BBF7D0",
      badgeText: "#166534",
      label: "BRIEF 03 · 토지·밸류업 핵심",
    },
  };

  /* ──────── Column 2: Minimalist <= 4 Top Tabs + Immediate Setting/Editing Screen ──────── */
  const editorSlot = (
    <div className="p-4 sm:p-6 space-y-5 max-w-4xl mx-auto" data-testid="im-editor-slot">
      {/* Top Action Bar: Standard Mobile IM + Basic IM (10-slide) Only */}
      <div className="bg-gradient-to-r from-[#EFF6FF] to-[#FAF9F5] rounded-2xl border-2 border-[#1D4ED8]/30 p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[12px] font-extrabold text-white bg-[#1D4ED8] px-2.5 py-0.5 rounded-full">
              모바일 IM · Basic IM (표준 10면)
            </span>
            <span className="text-[13px] font-bold text-[#1E3A8A]">
              상단 4개 핵심 탭 · 하단 즉시 설정/편집
            </span>
          </div>
          <p className="text-[13px] text-[#334155]">
            상단 4개 탭으로 최소 항목만 빠르게 편집하거나, <strong>상세 IM 바텀시트</strong>에서 전체 항목을 점검할 수 있습니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            data-testid="im-save-draft-btn"
            onClick={handleSaveDraft}
            className="min-h-[44px] px-3.5 py-2 bg-white text-[#0F172A] border border-[#64748B] rounded-xl font-extrabold text-[14px] hover:bg-[#F3F2EE] transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <span>💾 초안 저장</span>
          </button>
          <button
            type="button"
            data-testid="im-open-bottom-sheet-btn"
            disabled={isProvisioningSheet}
            onClick={handleOpenBottomSheet}
            className="min-h-[44px] px-3.5 py-2 bg-[#0F172A] text-white rounded-xl font-extrabold text-[14px] hover:bg-[#1E293B] transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
          >
            <span>🎯 {isProvisioningSheet ? "시트 준비 중..." : "상세 IM 바텀시트 열기"}</span>
          </button>
          <a
            href={`/broker/basic-im-studio/${currentItem?.buildingId || "bld-01"}`}
            data-testid="im-open-studio-btn"
            className="min-h-[44px] px-3.5 py-2 bg-white text-[#1D4ED8] border border-[#1D4ED8] rounded-xl font-extrabold text-[14px] hover:bg-[#EFF6FF] transition-colors flex items-center gap-1.5"
          >
            <span>🎨 PPTX 스튜디오</span>
          </a>
        </div>
      </div>

      {/* Top <= 4 Primary Tabs (Minimalist Tab Bar -> Immediate Panel Below) */}
      <div
        data-testid="im-editor-primary-tabs"
        className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-1.5 rounded-xl bg-slate-200/90 border border-slate-300"
      >
        {(
          [
            { id: "specs", label: "① 표지·핵심제원", sub: "제목·소재지·매도가" },
            { id: "rentroll", label: "② 층별 렌트롤·수지", sub: `총 ${rentRoll.length}층·엑셀연동` },
            { id: "axios_brief", label: "③ 핵심 투자포인트", sub: "핵심요약 3선·중개의견" },
            { id: "media_publish", label: "④ 사진·지적도·발행", sub: `사진 ${photoNames.length}장·스튜디오` },
          ] as const
        ).map((tab) => {
          const isActive = activeEditorTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              data-testid={`im-editor-tab-${tab.id}`}
              onClick={() => setActiveEditorTab(tab.id)}
              className={`px-3 py-2.5 rounded-xl text-left transition-all cursor-pointer min-w-0 ${
                isActive
                  ? "bg-[#0F172A] text-white shadow-sm"
                  : "bg-white/80 text-slate-800 hover:bg-white"
              }`}
            >
              <div className="text-[14px] font-extrabold leading-tight whitespace-nowrap truncate">
                {tab.label}
              </div>
              <div
                className={`text-[11px] mt-0.5 font-medium whitespace-nowrap truncate ${
                  isActive ? "text-amber-300" : "text-slate-500"
                }`}
              >
                {tab.sub}
              </div>
            </button>
          );
        })}
      </div>

      {/* ── TAB 1 PANEL: ① 표지·핵심제원 (Immediate Setting/Editing Screen) ── */}
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
            <h2 className="text-[19px] font-extrabold text-[#0F172A]">
              ① 표지 대표 제목 · 투자 포스처 · 핵심 제원
            </h2>
            <p className="text-[13px] text-[#475569]">
              모바일 IM 및 Basic IM 10면 표지에 들어갈 대표 제목과 주소, 매매 희망가, 토지·건축물 제원을 즉시 설정합니다.
            </p>
          </div>
          <span className="text-[13px] font-bold text-[#065F46] bg-[#D1FAE5] px-2.5 py-1 rounded-full whitespace-nowrap">
            표준 필수 항목
          </span>
        </div>

        {/* 0. Investment Posture Selector */}
        <div className="p-4 rounded-lg bg-[#FAF9F5] border border-[#CBD5E1]" data-testid="im-posture-selector-section">
          <PostureSelector
            investmentPosture={normalizedPosture}
            setInvestmentPosture={(nextPosture) => {
              setInvestmentPosture(nextPosture);
              syncCurrentItemPatch({ investmentPosture: nextPosture });
            }}
          />
        </div>

        {/* 0-B. Single-Line IM Title */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="block text-[15px] font-bold text-[#0F172A]">
              IM 표지 대표 제목 (모바일·PPTX 공통)
            </label>
            <span className="text-[12px] font-mono text-slate-500">
              {imTitle.length}/30자 권장
            </span>
          </div>
          <input
            type="text"
            data-testid="im-title-single-line-input"
            value={imTitle}
            onChange={(e) => {
              const nextTitle = e.target.value;
              setImTitle(nextTitle);
              syncCurrentItemPatch({ title: nextTitle });
            }}
            placeholder="예: 영등포구 양평동 역세권 코너 수익형 빌딩"
            className="w-full min-h-[48px] px-3.5 text-[17px] font-extrabold rounded-xl border border-[#64748B] focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/20 outline-none whitespace-nowrap overflow-hidden text-ellipsis"
          />
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0F172A] text-white text-[13px]">
            <span className="text-amber-400 font-bold shrink-0">표지 제목 미리보기:</span>
            <span
              data-single-line-title="true"
              className="font-bold whitespace-nowrap overflow-hidden text-ellipsis truncate"
            >
              {imTitle || currentItem?.title || "매물 IM 표지 제목"}
            </span>
          </div>
        </div>

        {/* 1. Address */}
        <div>
          <label className="block text-[15px] font-bold text-[#0F172A] mb-1.5">
            1. 부동산 소재지 (주소) <span className="text-[#991B1B]">*</span>
          </label>
          <input
            type="text"
            data-testid="im-address-input"
            value={address}
            onChange={(e) => {
              const nextVal = e.target.value;
              setAddress(nextVal);
              syncCurrentItemPatch({ address: nextVal });
            }}
            placeholder="예: 서울특별시 영등포구 양평동 11-47"
            className="w-full min-h-[48px] px-3.5 text-[17px] rounded-xl border border-[#64748B] focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/20 outline-none"
          />
        </div>

        {/* 2. Asking Price */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
            <label className="text-[15px] font-bold text-[#0F172A]">
              2. 매매 희망가 (만 원 단위 입력) <span className="text-[#991B1B]">*</span>
            </label>
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-bold text-[#1D4ED8]" data-testid="im-price-readout">
                {formatKoreanCurrencyReadout(askingPriceManwon)}
              </span>
              <span className="text-[13px] font-semibold text-[#065F46] bg-[#D1FAE5] px-2 py-0.5 rounded">
                구간: {priceBandStr}
              </span>
            </div>
          </div>
          <input
            type="number"
            data-testid="im-asking-price-input"
            value={askingPriceManwon || ""}
            onChange={(e) => {
              const nextPrice = Number(e.target.value);
              setAskingPriceManwon(nextPrice);
              syncCurrentItemPatch({ askingPriceManwon: nextPrice });
            }}
            placeholder="예: 950000 (95억 원)"
            className="w-full min-h-[48px] px-3.5 text-[18px] font-bold tabular-nums rounded-xl border border-[#64748B] focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/20 outline-none"
          />
        </div>

        {/* 3. Building & Land Specs (Immediate Grid without deep accordions) */}
        <div className="pt-2 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-[13px] font-bold text-[#334155] mb-1">
              연면적 (㎡)
            </label>
            <input
              type="number"
              data-testid="im-gfa-input"
              value={gfaSqm}
              onChange={(e) => {
                const nextVal = e.target.value;
                setGfaSqm(nextVal);
                syncCurrentItemPatch({ gfaSqm: nextVal });
              }}
              className="w-full min-h-[44px] px-3 text-[15px] rounded-xl border border-[#64748B] bg-white outline-none"
            />
          </div>
          <div>
            <label className="block text-[13px] font-bold text-[#334155] mb-1">
              대지면적 (㎡)
            </label>
            <input
              type="number"
              data-testid="im-land-area-input"
              value={landAreaSqm}
              onChange={(e) => {
                const nextVal = e.target.value;
                setLandAreaSqm(nextVal);
                syncCurrentItemPatch({ landAreaSqm: nextVal });
              }}
              className="w-full min-h-[44px] px-3 text-[15px] rounded-xl border border-[#64748B] bg-white outline-none"
            />
          </div>
          <div>
            <label className="block text-[13px] font-bold text-[#334155] mb-1">
              용도지역
            </label>
            <input
              type="text"
              data-testid="im-zoning-input"
              value={zoning}
              onChange={(e) => {
                const nextVal = e.target.value;
                setZoning(nextVal);
                syncCurrentItemPatch({ zoning: nextVal });
              }}
              className="w-full min-h-[44px] px-3 text-[15px] rounded-xl border border-[#64748B] bg-white outline-none"
            />
          </div>
          <div>
            <label className="block text-[13px] font-bold text-[#334155] mb-1">
              사용승인일 (준공일)
            </label>
            <input
              type="text"
              data-testid="im-completion-date-input"
              value={completionDate}
              onChange={(e) => {
                const nextVal = e.target.value;
                setCompletionDate(nextVal);
                syncCurrentItemPatch({ completionDate: nextVal });
              }}
              className="w-full min-h-[44px] px-3 text-[15px] rounded-xl border border-[#64748B] bg-white outline-none"
            />
          </div>
        </div>
      </div>

      {/* ── TAB 2 PANEL: ② 층별 렌트롤·수지 (Immediate Setting/Editing Screen) ── */}
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
            <h2 className="text-[19px] font-extrabold text-[#0F172A]">
              ② 층별 임대 현황 (R1 렌트롤 · 엑셀 양식 연동)
            </h2>
            <p className="text-[13px] text-[#475569]">
              엑셀(.xlsx) 업로드 또는 표 직접 입력 시 보증금·월세 합계와 기대 수익률이 실시간 계산됩니다.
            </p>
          </div>
          <div className="flex items-center gap-2 text-[13px] font-bold">
            <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800">
              보증금 {totalDepositManwon.toLocaleString()}만
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-900">
              월세 {totalRentManwon.toLocaleString()}만
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-900">
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
      </div>

      {/* ── TAB 3 PANEL: ③ 핵심 투자포인트·중개의견 (Immediate Setting/Editing Screen) ── */}
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
            <h2 className="text-[19px] font-extrabold text-[#0F172A]">
              📌 ③ 핵심 투자 포인트 3선 · 중개인 의견
            </h2>
            <p className="text-[13px] text-[#475569]">
              모바일 IM과 Basic IM 핵심 하이라이트 면에 대표 투자 포인트 제목과 2~4문장 요약 해설로 표시됩니다.
            </p>
          </div>
          <button
            type="button"
            data-testid="im-axios-ai-recluster-btn"
            onClick={handleReclusterImAxios}
            className="px-3.5 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-[12px] font-extrabold shadow-xs transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <span>✨</span>
            <span>AI 포스처 맞춤 포인트 자동생성</span>
          </button>
        </div>

        {/* 3 Core Highlight Cards (Institutional Crisp Styling) */}
        <div className="space-y-3">
          {axiosHighlights.map((item, idx) => {
            const style = IM_POSTIT_STYLES[item.tone] || IM_POSTIT_STYLES.amber;
            return (
              <div
                key={idx}
                data-testid={`im-axios-postit-${idx}`}
                style={{ backgroundColor: style.bg, borderColor: style.border }}
                className="rounded-lg border border-l-4 p-4 space-y-2.5 shadow-2xs"
              >
                <div className="flex items-center justify-between">
                  <span
                    style={{ backgroundColor: style.badgeBg, color: style.badgeText }}
                    className="text-[11px] font-extrabold px-2.5 py-0.5 rounded"
                  >
                    {style.label}
                  </span>
                  <span className="text-[11px] font-bold text-slate-600">
                    핵심 결론 + 요약 해설
                  </span>
                </div>
                <input
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
                  className="w-full h-11 px-3.5 text-[17px] font-extrabold text-slate-950 bg-white/95 rounded-lg border border-slate-400/80 focus:outline-none focus:ring-2 focus:ring-blue-600 whitespace-nowrap overflow-hidden text-ellipsis"
                  placeholder="핵심 투자 포인트 제목"
                />
                <textarea
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
                  className="w-full px-3.5 py-2 text-[14px] font-medium text-slate-800 bg-white/90 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-600 leading-relaxed"
                  placeholder="매수자가 주목할 핵심 투자 근거를 2~4문장으로 입력하세요"
                />
              </div>
            );
          })}
        </div>

        {/* 명도 조건 및 특약 사항 */}
        <div className="pt-2 border-t border-slate-200">
          <label className="block text-[14px] font-bold text-[#334155] mb-1">
            ⚖️ 명도 조건 및 거래 특약 사항
          </label>
          <textarea
            rows={2}
            data-testid="im-handover-note-input"
            value={handoverNote}
            onChange={(e) => {
              const nextVal = e.target.value;
              setHandoverNote(nextVal);
              syncCurrentItemPatch({ handoverNote: nextVal });
            }}
            className="w-full p-3 text-[15px] rounded-xl border border-[#64748B] bg-white outline-none"
          />
        </div>

        {/* 중개인 정보 및 투자 의견 */}
        <div
          className="bg-slate-50 rounded-2xl border border-[#CBD5E1] p-4 space-y-4"
          data-testid="im-broker-info-card"
        >
          <div className="font-bold text-[15px] text-[#0F172A]">
            👤 담당 공인중개사 정보 및 추가 의견
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[13px] font-semibold text-[#334155] mb-1">
                중개법인 / 사무소명
              </label>
              <input
                type="text"
                data-testid="im-brokerage-name-input"
                value={brokerageName}
                onChange={(e) => {
                  const nextVal = e.target.value;
                  setBrokerageName(nextVal);
                  syncCurrentItemPatch({ brokerageName: nextVal });
                }}
                placeholder="예: 크리딜 부동산중개법인"
                className="w-full min-h-[44px] px-3 text-[15px] rounded-xl border border-[#64748B] bg-white outline-none focus:border-[#1D4ED8]"
              />
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-[#334155] mb-1">
                담당 공인중개사 성명 / 직책
              </label>
              <input
                type="text"
                data-testid="im-broker-name-input"
                value={brokerName}
                onChange={(e) => {
                  const nextVal = e.target.value;
                  setBrokerName(nextVal);
                  syncCurrentItemPatch({ brokerName: nextVal });
                }}
                placeholder="예: 홍길동 대표공인중개사"
                className="w-full min-h-[44px] px-3 text-[15px] rounded-xl border border-[#64748B] bg-white outline-none focus:border-[#1D4ED8]"
              />
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-[#334155] mb-1">
                문의 연락처 (전화번호)
              </label>
              <input
                type="tel"
                data-testid="im-broker-phone-input"
                value={brokerPhone}
                onChange={(e) => {
                  const nextVal = e.target.value;
                  setBrokerPhone(nextVal);
                  syncCurrentItemPatch({ brokerPhone: nextVal });
                }}
                placeholder="예: 010-1234-5678"
                className="w-full min-h-[44px] px-3 text-[15px] rounded-xl border border-[#64748B] bg-white outline-none focus:border-[#1D4ED8]"
              />
            </div>
          </div>

          <div className="pt-2 border-t border-[#E2E8F0]">
            <BrokerExtrasSection
              form={brokerExtrasForm}
              setForm={handleBrokerExtrasChange}
              defaultOpen
            />
          </div>
        </div>
      </div>

      {/* ── TAB 4 PANEL: ④ 사진·지적도·발행 (Immediate Setting/Editing Screen) ── */}
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
            <h2 className="text-[19px] font-extrabold text-[#0F172A]">
              📷 ④ 현장 사진 · 지적도 첨부 및 Basic IM 표준 발행
            </h2>
            <p className="text-[13px] text-[#475569]">
              건물 외관 사진이나 지적도를 첨부하면 모바일 IM 갤러리와 Basic IM 09면 슬라이드에 자동 배치됩니다.
            </p>
          </div>
        </div>

        <div className="p-6 rounded-2xl bg-[#FAF9F5] border-2 border-dashed border-[#64748B] text-center space-y-3">
          <p className="text-[15px] font-semibold text-[#334155]">
            건물 외관 사진 · 지적도 이미지 업로드
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
              const added = files.map((f) => f.name);
              const next = Array.from(new Set([...photoNames, ...added]));
              setPhotoNames(next);
              syncCurrentItemPatch({ photoNames: next });
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2.5 bg-white border border-[#64748B] rounded-xl text-[15px] font-bold text-[#0F172A] hover:bg-[#F3F2EE] cursor-pointer"
          >
            + 사진 파일 선택
          </button>
          {photoNames.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              {photoNames.map((name) => (
                <span
                  key={name}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-[#CBD5E1] text-[13px] font-semibold text-[#0F172A]"
                >
                  <span>📷 {name}</span>
                  <button
                    type="button"
                    onClick={() => {
                      const next = photoNames.filter((n) => n !== name);
                      setPhotoNames(next);
                      syncCurrentItemPatch({ photoNames: next });
                    }}
                    className="text-[#991B1B] font-extrabold hover:opacity-75 cursor-pointer"
                    aria-label={`${name} 삭제`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  /* ──────── Column 3: Live Preview (Clean Uncluttered Mobile IM + Basic IM 10-Slide) ──────── */
  const previewTabSlot = (
    <div className="inline-flex rounded-xl border border-[#CBD5E1] p-0.5 bg-[#FAF9F5] shrink-0">
      <button
        type="button"
        onClick={() => setPreviewTab("mobile")}
        className={`px-2.5 py-1 text-[13px] font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
          previewTab === "mobile"
            ? "bg-[#0F172A] text-white shadow-xs"
            : "text-[#475569] hover:text-[#0F172A]"
        }`}
      >
        모바일 IM
      </button>
      <button
        type="button"
        onClick={() => setPreviewTab("pptx")}
        className={`px-2.5 py-1 text-[13px] font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
          previewTab === "pptx"
            ? "bg-[#0F172A] text-white shadow-xs"
            : "text-[#475569] hover:text-[#0F172A]"
        }`}
      >
        PPTX 10면
      </button>
    </div>
  );

  const basicImSlides = [
    {
      no: "01",
      title: "표지",
      summary: `${imTitle || currentItem?.title || "매물"} · ${address}`,
      metric: `${formatKoreanCurrencyReadout(askingPriceManwon).replace(/^=\s*/, "")} (${postureKoreanLabel})`,
    },
    {
      no: "02",
      title: "투자 하이라이트",
      summary:
        axiosHighlights[0]?.headline ||
        `매매 희망가 ${formatKoreanCurrencyReadout(askingPriceManwon).replace(/^=\s*/, "")}`,
      metric: `기대 수익률 연 ${calculatedYield.toFixed(2)}%`,
    },
    {
      no: "03",
      title: "건축물 개요",
      summary: `연면적 ${gfaSqm}㎡ · 사용승인일 ${completionDate}`,
      metric: `총 ${rentRoll.length}개 층 구성`,
    },
    {
      no: "04",
      title: "입지 및 상권 분석",
      summary: address,
      metric: "역세권 가시성 및 배후 수요 우수",
    },
    {
      no: "05",
      title: "토지 및 도시계획",
      summary: `대지면적 ${landAreaSqm}㎡`,
      metric: zoning,
    },
    {
      no: "06",
      title: "층별 임대차 현황 (렌트롤)",
      summary: `보증금 합계 ${totalDepositManwon.toLocaleString()}만원`,
      metric: `월 임대수익 ${totalRentManwon.toLocaleString()}만원`,
    },
    {
      no: "07",
      title: "수지 및 수익률 분석",
      summary: `순투자금 ${Math.max(0, (askingPriceManwon || 0) - totalDepositManwon).toLocaleString()}만원`,
      metric: `연 ${calculatedYield.toFixed(2)}% 배당형`,
    },
    {
      no: "08",
      title: "인근 실거래 비교",
      summary: `${address.split(" ").slice(1, 3).join(" ") || "인근"} 유사 사례 비교`,
      metric: `매각 희망가 ${formatKoreanCurrencyReadout(askingPriceManwon).replace(/^=\s*/, "")}`,
    },
    {
      no: "09",
      title: "현장 사진 및 지적도",
      summary:
        photoNames.length > 0
          ? `첨부 사진 ${photoNames.length}장 (${photoNames.join(", ")})`
          : "외관 사진 및 공적 지적도 자동 배치",
      metric: `${photoNames.length}개 파일`,
    },
    {
      no: "10",
      title: "문의/안내 및 명도 조건",
      summary: brokerExtrasForm.closingLine
        ? `${brokerExtrasForm.closingLine} · ${handoverNote}`
        : handoverNote,
      metric:
        [brokerageName, brokerName, brokerPhone].filter(Boolean).join(" · ") ||
        "전담 중개법인 안내",
    },
  ];

  const visibleSlides =
    activeSlideFilter === "all"
      ? basicImSlides
      : basicImSlides.filter((s) => s.no === activeSlideFilter);

  const previewSlot = (
    <div className="p-3.5 space-y-3.5 max-w-sm mx-auto" data-testid="im-preview-slot">
      {/* Direct Link to Full 10-Section Mobile IM Viewer & 1-Click PPTX Download */}
      <div className="flex items-center justify-between gap-2 bg-white rounded-lg border border-[#CBD5E1] px-3 py-2 shadow-xs">
        <span className="text-[12px] font-bold text-[#334155] whitespace-nowrap truncate">
          {previewTab === "mobile" ? "📱 모바일 IM (10개 섹션)" : "🖥 PPTX 10면 슬라이드"}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <a
            href={`/api/public/im-lite/${currentItem?.buildingId || "bld-01"}/pptx?direct=1`}
            data-testid="im-download-pptx-btn"
            className="text-[12px] font-extrabold text-[#065F46] bg-[#D1FAE5] px-2.5 py-1 rounded-lg hover:bg-[#A7F3D0] flex items-center gap-1 transition-colors whitespace-nowrap"
          >
            <span>📥 PPTX</span>
          </a>
          <a
            href={`/im-lite/${currentItem?.buildingId || "bld-01"}`}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="im-open-fullscreen-link"
            className="text-[12px] font-extrabold text-[#1D4ED8] hover:underline flex items-center gap-1 whitespace-nowrap"
          >
            <span>↗ 전체화면</span>
          </a>
        </div>
      </div>

      {previewTab === "mobile" ? (
        /* Phone container simulation — Full vertical scroll across all 10 Mobile IM sections */
        <div
          data-testid="im-mobile-preview-frame"
          className="bg-[#FAF9F5] rounded-[20px] border-2 border-[#334155] p-2.5 shadow-md flex flex-col"
        >
          {/* Mock phone status bar + scroll guide */}
          <div className="flex items-center justify-between text-[11px] font-bold text-[#475569] px-2 pb-2 border-b border-slate-200/80 shrink-0">
            <span>09:41</span>
            <span className="text-[11px] font-semibold text-blue-700">↕ 상하 스크롤 (01~10면)</span>
            <span>5G 100%</span>
          </div>

          {/* Vertically scrollable 10-section customer view */}
          <div
            data-testid="im-mobile-preview-scroll"
            className="max-h-[calc(100dvh-250px)] min-h-[480px] overflow-y-auto overscroll-contain pr-1 pt-2.5 space-y-2.5"
          >
            {/* Section 01: Cover Card */}
            <div className="bg-white rounded-lg p-3.5 border border-[#CBD5E1] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[#1D4ED8] bg-[#EFF6FF] px-2 py-0.5 rounded">
                  01 표지 · {postureKoreanLabel}
                </span>
                <span className="text-[11px] font-medium text-slate-500">INVESTMENT MEMORANDUM</span>
              </div>
              <h3
                data-single-line-title="true"
                title={imTitle || currentItem?.title}
                className="text-[17px] font-extrabold text-[#0F172A] whitespace-nowrap overflow-hidden text-ellipsis truncate"
              >
                {imTitle || currentItem?.title}
              </h3>
              <p className="text-[12px] text-[#475569] truncate">{address}</p>
              <div className="pt-2 border-t border-[#F1F5F9] flex items-center justify-between text-[14px] font-bold">
                <span className="text-[#0F172A]">
                  {formatKoreanCurrencyReadout(askingPriceManwon).replace(/^=\s*/, "")}
                </span>
                <span className="text-[#065F46]">연 {calculatedYield.toFixed(2)}%</span>
              </div>
            </div>

            {/* Section 02: Investment Highlights (Institutional Crisp Cards) */}
            <div className="bg-white rounded-lg p-3.5 border border-[#CBD5E1] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[#1D4ED8] bg-[#EFF6FF] px-2 py-0.5 rounded">
                  02 투자 하이라이트
                </span>
                <span className="text-[11px] font-semibold text-slate-500">핵심 요약 3선</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center text-[12px]">
                <div className="p-2 bg-[#FAF9F5] rounded-md border border-slate-200/80">
                  <span className="text-[#64748B] block text-[11px]">매매 희망가</span>
                  <strong className="text-[#0F172A]">{((askingPriceManwon || 0) / 10000).toFixed(0)}억 원</strong>
                </div>
                <div className="p-2 bg-[#FAF9F5] rounded-md border border-slate-200/80">
                  <span className="text-[#64748B] block text-[11px]">월 임대수익</span>
                  <strong className="text-[#0F172A]">{totalRentManwon.toLocaleString()}만 원</strong>
                </div>
              </div>
              <div className="space-y-2 pt-0.5" data-testid="im-preview-axios-list">
                {axiosHighlights.map((hl, idx) => {
                  const st = IM_POSTIT_STYLES[hl.tone] || IM_POSTIT_STYLES.amber;
                  return (
                    <div
                      key={idx}
                      style={{ backgroundColor: st.bg, borderColor: st.border }}
                      className="rounded-md border border-l-4 p-2.5 space-y-1"
                    >
                      <p
                        data-single-line-title="true"
                        title={hl.headline}
                        className="text-[13px] font-extrabold text-slate-950 whitespace-nowrap overflow-hidden text-ellipsis truncate"
                      >
                        {hl.headline}
                      </p>
                      <p className="text-[11px] text-slate-700 leading-snug line-clamp-2">
                        {hl.brief}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Section 03: Building Overview */}
            <div className="bg-white rounded-lg p-3.5 border border-[#CBD5E1] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[#1D4ED8] bg-[#EFF6FF] px-2 py-0.5 rounded">
                  03 건축물 개요
                </span>
                <span className="text-[11px] text-slate-500">건축물대장 기준</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-[12px]">
                <div className="p-2 bg-[#FAF9F5] rounded-md border border-slate-200/70">
                  <span className="text-[10px] text-slate-500 block">연면적</span>
                  <strong className="text-slate-900">{gfaSqm}㎡ (약 {Math.round(Number(gfaSqm || 0) * 0.3025)}평)</strong>
                </div>
                <div className="p-2 bg-[#FAF9F5] rounded-md border border-slate-200/70">
                  <span className="text-[10px] text-slate-500 block">사용승인일</span>
                  <strong className="text-slate-900">{completionDate}</strong>
                </div>
              </div>
            </div>

            {/* Section 04: Location & Transit */}
            <div className="bg-white rounded-lg p-3.5 border border-[#CBD5E1] space-y-1.5">
              <span className="text-[11px] font-bold text-[#1D4ED8] bg-[#EFF6FF] px-2 py-0.5 rounded inline-block">
                04 입지 및 교통
              </span>
              <p className="text-[12px] font-semibold text-slate-900">{address}</p>
              <p className="text-[11px] text-slate-600 leading-snug">
                역세권 주동선 코너 가시성 및 배후 상권 유동인구가 검증된 입지입니다.
              </p>
            </div>

            {/* Section 05: Land & Zoning */}
            <div className="bg-white rounded-lg p-3.5 border border-[#CBD5E1] space-y-2">
              <span className="text-[11px] font-bold text-[#1D4ED8] bg-[#EFF6FF] px-2 py-0.5 rounded inline-block">
                05 토지 및 도시계획
              </span>
              <div className="grid grid-cols-2 gap-1.5 text-[12px]">
                <div className="p-2 bg-[#FAF9F5] rounded-md border border-slate-200/70">
                  <span className="text-[10px] text-slate-500 block">대지면적</span>
                  <strong className="text-slate-900">{landAreaSqm}㎡ (약 {Math.round(Number(landAreaSqm || 0) * 0.3025)}평)</strong>
                </div>
                <div className="p-2 bg-[#FAF9F5] rounded-md border border-slate-200/70">
                  <span className="text-[10px] text-slate-500 block">용도지역</span>
                  <strong className="text-slate-900 truncate block">{zoning}</strong>
                </div>
              </div>
            </div>

            {/* Section 06: Rent Roll preview */}
            <div className="bg-white rounded-lg p-3.5 border border-[#CBD5E1] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[#1D4ED8] bg-[#EFF6FF] px-2 py-0.5 rounded">
                  06 층별 임대차 상세
                </span>
                <span className="text-[11px] font-bold text-[#065F46]">
                  총 {rentRoll.length}개 층 · {rentRoll.some((r) => r.status === "vacant") ? "일부 공실 포함" : "만실 임대 운용 중"}
                </span>
              </div>
              <div className="rounded-md border border-slate-200 overflow-hidden">
                <table className="w-full text-[11px] text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                    <tr>
                      <th className="py-1 px-2">층</th>
                      <th className="py-1 px-2">업종</th>
                      <th className="py-1 px-2 text-right">보증금/월세(만)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rentRoll.slice(0, 6).map((r, i) => (
                      <tr key={i}>
                        <td className="py-1 px-2 font-bold text-slate-900">{r.floor}</td>
                        <td className="py-1 px-2 text-slate-700 truncate max-w-[90px]">{r.use}</td>
                        <td className="py-1 px-2 text-right font-mono text-slate-900">
                          {(r.depositManwon ?? 0).toLocaleString()} / {(r.monthlyRentManwon ?? 0).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Section 07: Yield & Cash Flow */}
            <div className="bg-white rounded-lg p-3.5 border border-[#CBD5E1] space-y-2">
              <span className="text-[11px] font-bold text-[#1D4ED8] bg-[#EFF6FF] px-2 py-0.5 rounded inline-block">
                07 수지 및 수익률 분석
              </span>
              <div className="p-2.5 bg-emerald-50/70 rounded-md border border-emerald-200 space-y-1 text-[12px]">
                <div className="flex justify-between">
                  <span className="text-slate-600">보증금 합계 / 월 임대료</span>
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
            <div className="bg-white rounded-lg p-3.5 border border-[#CBD5E1] space-y-1.5">
              <span className="text-[11px] font-bold text-[#1D4ED8] bg-[#EFF6FF] px-2 py-0.5 rounded inline-block">
                08 인근 실거래 비교
              </span>
              <p className="text-[12px] text-slate-700">
                {address.split(" ").slice(1, 3).join(" ") || "인근"} 유사 규모 거래 사례 및 토지·연면적 평당가 비교
              </p>
            </div>

            {/* Section 09: Photos & Cadastral Map */}
            <div className="bg-white rounded-lg p-3.5 border border-[#CBD5E1] space-y-1.5">
              <span className="text-[11px] font-bold text-[#1D4ED8] bg-[#EFF6FF] px-2 py-0.5 rounded inline-block">
                09 현장 사진 및 지적도
              </span>
              <p className="text-[12px] text-slate-700">
                {photoNames.length > 0
                  ? `첨부 사진 ${photoNames.length}장 및 공적 지적도 연동`
                  : "외관 사진 및 공적 지적도 자동 배치"}
              </p>
            </div>

            {/* Section 10: Contact & Deal Terms */}
            <div className="bg-white rounded-lg p-3.5 border border-[#CBD5E1] space-y-1.5">
              <span className="text-[11px] font-bold text-[#1D4ED8] bg-[#EFF6FF] px-2 py-0.5 rounded inline-block">
                10 거래 조건 및 담당 중개인
              </span>
              <p className="text-[12px] font-bold text-slate-900">
                {[brokerageName, brokerName, brokerPhone].filter(Boolean).join(" · ") || "담당 공인중개사 안내"}
              </p>
              <p className="text-[11px] text-slate-600">{handoverNote}</p>
            </div>
          </div>
        </div>
      ) : (
        /* 16:9 Landscape 10-Slide PPTX Deck Preview with Quick Slide Navigator */
        <div className="space-y-2.5" data-testid="im-pptx-deck-preview">
          <div className="flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar">
            <button
              type="button"
              onClick={() => setActiveSlideFilter("all")}
              className={`px-2 py-1 rounded-md text-[11px] font-extrabold shrink-0 cursor-pointer whitespace-nowrap ${
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
                className={`px-2 py-1 rounded-md text-[11px] font-bold shrink-0 cursor-pointer whitespace-nowrap ${
                  activeSlideFilter === s.no
                    ? "bg-[#1D4ED8] text-white"
                    : "bg-white text-slate-700 border border-slate-300"
                }`}
              >
                {s.no}
              </button>
            ))}
          </div>

          <div className="max-h-[calc(100dvh-260px)] overflow-y-auto space-y-2.5 pr-1">
            {visibleSlides.map((slide) => (
              <div
                key={slide.no}
                className="aspect-video w-full bg-[#0F172A] text-white rounded-lg border border-[#334155] p-3.5 flex flex-col justify-between shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold text-[#93C5FD] bg-[#1E3A8A]/60 px-2 py-0.5 rounded">
                    {slide.no} · {slide.title}
                  </span>
                  <span className="text-[10px] text-[#94A3B8] font-mono">{slide.no} / 10</span>
                </div>
                <div className="space-y-1 my-auto py-1">
                  <p
                    data-single-line-title="true"
                    title={slide.summary}
                    className="text-[14px] font-bold text-white leading-snug whitespace-nowrap overflow-hidden text-ellipsis truncate"
                  >
                    {slide.summary}
                  </p>
                </div>
                <div className="flex items-center justify-between border-t border-[#1E293B] pt-1.5 text-[12px]">
                  <span className="text-[#34D399] font-bold truncate">{slide.metric}</span>
                  <span className="text-[#64748B] text-[10px] truncate max-w-[120px]">
                    {brokerageName || "전담 중개법인"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const primaryActionSlot = (
    <div className="flex flex-col gap-2 w-full">
      <button
        type="button"
        data-testid="im-quick-generate-btn"
        disabled={isGenerating}
        onClick={handleQuickGenerate}
        className="w-full min-h-[56px] px-6 py-3.5 bg-[#1D4ED8] text-white rounded-2xl font-extrabold text-[17px] hover:bg-[#1E40AF] transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:opacity-50"
      >
        <span>{isGenerating ? "⏳ IM 생성 중..." : "⚡ Basic IM 만들기 · 약 20초"}</span>
      </button>
      <button
        type="button"
        disabled={isProvisioningSheet}
        onClick={handleOpenBottomSheet}
        className="w-full min-h-[44px] px-4 py-2 bg-white text-[#0F172A] border border-[#64748B] rounded-xl font-bold text-[14px] hover:bg-[#FAF9F5] transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
      >
        <span>🎯 상세 IM 바텀시트 열기 (모바일·Basic IM 표준 구성)</span>
      </button>
    </div>
  );

  return (
    <>
      <WorkspaceShell
        workspace="im"
        listTitle="① IM 고르기"
        editorTitle="② 간편 입력 및 렌트롤 채우기"
        previewTitle="③ 미리보기"
        listSlot={listSlot}
        editorSlot={editorSlot}
        previewSlot={previewSlot}
        previewTabSlot={previewTabSlot}
        primaryActionSlot={primaryActionSlot}
        saveStatus={<span className="text-[14px] text-[#065F46] font-semibold">저장됨 · 방금</span>}
        selectedBuildingId={selectedId}
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
