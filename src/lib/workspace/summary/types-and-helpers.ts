import { createServiceClient } from "@/lib/supabase/service";
import { cleanBlindPoints, validateBlindPoints } from "@/lib/deal-card/blind-guard";
import { formatPriceRange } from "@/lib/deal-card/price-band";
import {
  repairDealCardLine,
  repairDealCardPoints,
} from "@/lib/deal-card/copy-limits";
import {
  type Card4Data,
  type DealCardGenerationSource,
  type DealCardPosture,
} from "@/lib/deal-card/card4-schema";
import { type UnconvertedMemoItem } from "@/lib/deal-card/memo-pairing";
import { isUuid } from "@/lib/im-lite/quick-generate-store";
import { isRealProductionRuntime } from "@/lib/env";

export interface BrokerProfileMeta {
  displayName?: string;
  company?: string;
  phone?: string;
  registrationNo?: string;
  officeRegNumber?: string;
  office_reg_number?: string;
  officeAddress?: string;
  office_address?: string;
  representativeName?: string;
  representative_name?: string;
  slug?: string;
  photoUrl?: string;
  is_licensed?: boolean;
  specialty?: string;
}

export interface PrivateMemoPairingRecord {
  memoText: string;
  pairedMemoId?: string;
  generationSource?: DealCardGenerationSource;
  updatedAt: string;
}

export interface RecentDealCardUpsertEntry {
  signature: string;
  atMs: number;
  card4?: Card4Data;
  version?: number;
  hash?: string;
  pairedMemoId?: string;
}

export interface WorkspaceMemoMemoryState {
  unconvertedByUser: Map<string, Map<string, UnconvertedMemoItem>>;
  deletedMemoIdsByUser: Map<string, Set<string>>;
  convertedMemoToBuildingByUser: Map<string, Map<string, string>>;
  pairingByUserBuilding: Map<string, Map<string, PrivateMemoPairingRecord>>;
  recentUpsertByUserBuilding: Map<string, Map<string, RecentDealCardUpsertEntry>>;
}

export interface SummaryDealCardItem {
  id: string;
  canonicalId?: string;
  legacyId?: string | null;
  title: string;
  region: string;
  use: string;
  priceBand: string;
  status: "draft" | "sent" | "published";
  updatedAt: string;
  updatedAtIso?: string;
  hasUnpublishedEdits?: boolean;
  card4: Card4Data;
  memoText?: string;
  pairedMemoId?: string;
  generationSource?: DealCardGenerationSource;
}

export interface ImSummaryItem {
  id: string;
  documentId?: string;
  canonicalId?: string;
  legacyId?: string | null;
  buildingId: string;
  title: string;
  address: string;
  askingPriceManwon: number;
  grossYieldPct: number;
  status: "draft" | "published";
  versionLabel: string;
  updatedAt: string;
  updatedAtIso?: string;
  hasUnpublishedEdits?: boolean;
  rentRoll?: any[];
  photos?: any[];
  investmentPosture?: string;
  gfaSqm?: string;
  landAreaSqm?: string;
  zoning?: string;
  completionDate?: string;
  handoverNote?: string;
  axiosHighlights?: any[];
  brokerName?: string;
  brokerageName?: string;
  brokerPhone?: string;
  pnu?: string;
  lat?: number;
  lng?: number;
  floorsAbove?: number;
  floorsBelow?: number;
  bcrPct?: number;
  farPct?: number;
  parkingTotal?: number;
  elevatorCount?: number;
  officialLandPricePerSqm?: number;
  parcels?: any[];
  mainPurpose?: string;
  closingLine?: string;
  correctionNotice?: { message: string; updatedAt: string } | null;
}

export type SummaryImItem = ImSummaryItem;

export function isWorkspaceMemoryEnabled(): boolean {
  if (isRealProductionRuntime()) return false;
  if (process.env.DISABLE_MEMORY_STORE === "1") return false;
  return Boolean(process.env.VITEST);
}

function createEmptyMemoryState(): WorkspaceMemoMemoryState {
  return {
    unconvertedByUser: new Map(),
    deletedMemoIdsByUser: new Map(),
    convertedMemoToBuildingByUser: new Map(),
    pairingByUserBuilding: new Map(),
    recentUpsertByUserBuilding: new Map(),
  };
}

export function getWorkspaceMemoMemory(): WorkspaceMemoMemoryState {
  if (!isWorkspaceMemoryEnabled()) {
    return createEmptyMemoryState();
  }
  const g = globalThis as unknown as {
    __creWorkspaceMemoMemory?: WorkspaceMemoMemoryState;
  };
  if (!g.__creWorkspaceMemoMemory) {
    g.__creWorkspaceMemoMemory = createEmptyMemoryState();
  }
  if (!g.__creWorkspaceMemoMemory.recentUpsertByUserBuilding) {
    g.__creWorkspaceMemoMemory.recentUpsertByUserBuilding = new Map();
  }
  return g.__creWorkspaceMemoMemory;
}

export function getUserMap<V>(outer: Map<string, Map<string, V>>, userId: string): Map<string, V> {
  let inner = outer.get(userId);
  if (!inner) {
    inner = new Map();
    outer.set(userId, inner);
  }
  return inner;
}

export function getUserSet(outer: Map<string, Set<string>>, userId: string): Set<string> {
  let inner = outer.get(userId);
  if (!inner) {
    inner = new Set();
    outer.set(userId, inner);
  }
  return inner;
}

function strField(obj: Record<string, unknown> | null | undefined, key: string): string | undefined {
  const v = obj?.[key];
  return typeof v === "string" && v ? v : undefined;
}

export function buildBrokerProfileMeta(
  pRow: Record<string, unknown> | null | undefined,
  bpRow: Record<string, unknown> | null | undefined,
  bodyOverride?: Record<string, unknown> | null | undefined
): BrokerProfileMeta | null {
  if (!pRow && !bpRow && !bodyOverride) return null;
  const regNo =
    strField(bpRow, "office_reg_number") ||
    strField(bodyOverride, "officeRegNumber") ||
    strField(bodyOverride, "office_reg_number") ||
    strField(bodyOverride, "registrationNo") ||
    strField(bodyOverride, "registration_no");
  const officeAddr =
    strField(bpRow, "office_address") ||
    strField(pRow, "office_address") ||
    strField(bodyOverride, "officeAddress") ||
    strField(bodyOverride, "office_address");
  const repName =
    strField(bpRow, "representative_name") ||
    strField(pRow, "display_name") ||
    strField(bpRow, "name") ||
    strField(bodyOverride, "representativeName") ||
    strField(bodyOverride, "representative_name") ||
    strField(bodyOverride, "displayName") ||
    strField(bodyOverride, "display_name");
  const companyName =
    strField(pRow, "company") ||
    strField(bpRow, "company") ||
    strField(bpRow, "office_name") ||
    strField(bodyOverride, "company") ||
    strField(bodyOverride, "officeName") ||
    strField(bodyOverride, "office_name");
  const licenseNo = strField(bpRow, "license_number") || strField(bodyOverride, "license_number");
  const cleanRegNo = regNo && regNo.trim() !== "-" && !/미입력|미등록/.test(regNo) ? regNo.trim() : undefined;
  const isLicensed = Boolean(
    cleanRegNo || licenseNo || bpRow?.is_licensed === true || bodyOverride?.is_licensed === true
  );
  const specialty =
    strField(bpRow, "specialty") ||
    strField(bodyOverride, "specialty") ||
    companyName ||
    (isLicensed ? "검증 공인중개사" : undefined);
  return {
    displayName:
      strField(pRow, "display_name") ||
      strField(bpRow, "name") ||
      strField(bpRow, "card_name") ||
      strField(bodyOverride, "displayName") ||
      strField(bodyOverride, "display_name"),
    company: companyName,
    phone: strField(pRow, "phone") || strField(bpRow, "phone") || strField(bodyOverride, "phone"),
    registrationNo: regNo,
    officeRegNumber: regNo,
    office_reg_number: regNo,
    officeAddress: officeAddr,
    office_address: officeAddr,
    representativeName: repName,
    representative_name: repName,
    slug: strField(bpRow, "slug") || strField(bodyOverride, "slug"),
    photoUrl:
      strField(bpRow, "avatar_url") ||
      strField(bpRow, "photo_url") ||
      strField(pRow, "photo_url") ||
      strField(bodyOverride, "photoUrl"),
    is_licensed: isLicensed,
    ...(specialty ? { specialty } : {}),
  };
}

export async function syncPairedMemoRow(
  supabase: ReturnType<typeof createServiceClient>,
  params: {
    userId: string;
    buildingId: string;
    memoText?: string;
    pairedMemoId?: string;
  }
): Promise<string | undefined> {
  const { userId, buildingId, memoText, pairedMemoId } = params;
  const trimmedMemo = typeof memoText === "string" ? memoText.trim() : undefined;
  const pairedTag = `paired:${buildingId}`;
  let resolvedMemoId = pairedMemoId || undefined;

  try {
    if (!supabase || typeof supabase.from !== "function") {
      return resolvedMemoId;
    }

    if (resolvedMemoId && isUuid(resolvedMemoId)) {
      const { data: existingMemo } = await supabase
        .from("broker_memos")
        .select("id, user_id, tags")
        .eq("id", resolvedMemoId)
        .maybeSingle();

      if (existingMemo && existingMemo.user_id === userId) {
        const prevTags = Array.isArray((existingMemo as any).tags)
          ? ((existingMemo as any).tags as string[]).filter(
              (t) => typeof t === "string" && !t.startsWith("paired:")
            )
          : [];
        const nextTags = isUuid(buildingId) ? prevTags : [...prevTags, pairedTag];
        const updates: Record<string, unknown> = {
          status: "saved",
          converted_to: isUuid(buildingId) ? buildingId : null,
          tags: nextTags,
        };
        if (memoText !== undefined && trimmedMemo && trimmedMemo.length > 0) {
          updates.memo_text = memoText;
        }
        await supabase.from("broker_memos").update(updates).eq("id", resolvedMemoId);
        return resolvedMemoId;
      }
    }

    if (trimmedMemo && trimmedMemo.length > 0) {
      const insertPayload: Record<string, unknown> = {
        user_id: userId,
        memo_text: memoText,
        routing_type: "new_deal",
        status: "saved",
        converted_to: isUuid(buildingId) ? buildingId : null,
        tags: isUuid(buildingId) ? [] : [pairedTag],
      };
      const insQuery: any = supabase.from("broker_memos").insert(insertPayload);
      const { data: inserted } =
        typeof insQuery?.select === "function"
          ? await insQuery.select("id").maybeSingle()
          : { data: null };
      if (inserted?.id) {
        resolvedMemoId = String(inserted.id);
      }
    }
  } catch {
    // Non-blocking if broker_memos table or mock unavailable
  }

  return resolvedMemoId;
}

export function cleanBrokerField(val: unknown, fallback?: string): string | undefined {
  if (typeof val !== "string") return fallback;
  const t = val.trim();
  if (
    !t ||
    t === "-" ||
    t === "담당 공인중개사" ||
    t.includes("확인 중") ||
    t === "크리딜 파트너 중개법인" ||
    t === "전담 부동산중개법인"
  ) {
    return fallback;
  }
  return t;
}

export function formatRelativeTime(isoString?: string | null): string {
  if (!isoString) return "방금";
  const diffMs = Date.now() - new Date(isoString).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 60_000) return "방금";
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

export function formatBlindPriceBandFromManwon(askingManwon: number): string | undefined {
  if (!Number.isFinite(askingManwon) || askingManwon <= 0) return undefined;
  return formatPriceRange(askingManwon * 10_000);
}

export function normalizeSummaryPhotoList(rawPhotos: unknown): Array<Record<string, any>> | undefined {
  if (!Array.isArray(rawPhotos) || rawPhotos.length === 0) return undefined;
  const valid = rawPhotos
    .filter(
      (p: any) =>
        p &&
        typeof p.url === "string" &&
        p.url.trim().length > 0 &&
        !p.url.startsWith("/test-images/") &&
        !p.url.startsWith("blob:")
    )
    .map((p: any, idx: number) => ({
      ...(p.name ? { name: String(p.name) } : {}),
      url: String(p.url),
      ...(p.caption || p.label ? { caption: String(p.caption || p.label) } : {}),
      category: String(p.category || p.type || (idx === 0 && p.isHero ? "exterior" : "general")),
      ...(p.role ? { role: p.role } : idx === 0 && p.isHero ? { role: "cover" } : {}),
      isHero: Boolean(p.isHero ?? idx === 0),
    }));
  return valid.length > 0 ? valid : undefined;
}

export function synthesizeBlindSafeImPoints(params: {
  imDoc: Record<string, unknown> | undefined;
  layersObj: Record<string, unknown>;
  fitSummary: unknown;
  region: string;
  use: string;
  posture: DealCardPosture;
}): string[] {
  const { imDoc, layersObj, fitSummary, region, use, posture } = params;
  const fallback: string[] = [
    fitSummary ? String(fitSummary) : `${region} 핵심 입지`,
    `${use} 추천 매물`,
    "상세 수익률 및 임대현황 확인 가능",
  ];
  if (!imDoc) return fallback;

  const imBody =
    imDoc.body && typeof imDoc.body === "object"
      ? (imDoc.body as Record<string, unknown>)
      : {};
  const imSsot =
    imDoc.ssot_summary && typeof imDoc.ssot_summary === "object"
      ? (imDoc.ssot_summary as Record<string, unknown>)
      : imBody.ssot_summary && typeof imBody.ssot_summary === "object"
      ? (imBody.ssot_summary as Record<string, unknown>)
      : {};
  const imLocation =
    imBody.location && typeof imBody.location === "object"
      ? (imBody.location as Record<string, unknown>)
      : {};
  const imHero =
    imBody.heroCard && typeof imBody.heroCard === "object"
      ? (imBody.heroCard as Record<string, unknown>)
      : {};
  const layerTransit =
    layersObj.transit && typeof layersObj.transit === "object"
      ? (layersObj.transit as Record<string, unknown>)
      : {};
  const layerBldReg =
    layersObj.building_register && typeof layersObj.building_register === "object"
      ? (layersObj.building_register as Record<string, unknown>)
      : {};
  const layerZoning =
    layersObj.zoning && typeof layersObj.zoning === "object"
      ? (layersObj.zoning as Record<string, unknown>)
      : {};

  const forbiddenTitle = String(
    imDoc.title || imBody.heroTitle || imBody.building_name || ""
  ).trim();

  const isSafeCandidate = (rawLine: string): string | null => {
    const cleaned = cleanBlindPoints([rawLine])[0] || "";
    const repaired = repairDealCardLine(cleaned);
    if (!repaired || repaired.length < 5) return null;
    if (
      forbiddenTitle.length >= 2 &&
      repaired.toLowerCase().includes(forbiddenTitle.toLowerCase())
    ) {
      return null;
    }
    const check = validateBlindPoints([repaired], { region, assetType: use });
    return check.isValid ? repaired : null;
  };

  const picked: string[] = [];
  const pushCandidate = (raw: string | undefined) => {
    if (!raw || picked.length >= 3) return;
    const safe = isSafeCandidate(raw);
    if (safe && !picked.includes(safe)) {
      picked.push(safe);
    }
  };

  const rawStation = String(
    imSsot.nearest_station ||
      imBody.nearest_station ||
      imLocation.nearestStation ||
      layerTransit.nearest_subway_name ||
      ""
  )
    .replace(/\s+/g, " ")
    .trim();
  const walkMin = Number(
    imSsot.walk_minutes ??
      imLocation.walkMinutes ??
      layerTransit.walk_minutes ??
      0
  );
  if (rawStation) {
    const stationLabel = rawStation.endsWith("역") ? rawStation : `${rawStation}역`;
    if (walkMin > 0 && walkMin <= 20) {
      pushCandidate(`${stationLabel} 도보 ${Math.round(walkMin)}분 역세권`);
    } else {
      pushCandidate(`${stationLabel} 인접 역세권 입지`);
    }
  }

  const capPct = Number(
    imSsot.cap_rate_pct ?? imHero.capRateBase ?? imSsot.gross_yield_pct ?? 0
  );
  const monthlyRentManwon = Number(imSsot.monthly_rent_total_manwon ?? 0);
  const vacancyPct = imSsot.vacancy_pct ?? imSsot.vacancy_rate_pct;

  if (posture === "owner_occupied") {
    pushCandidate("사옥·직영 즉시 입주 적합");
  } else if (posture === "value_add") {
    pushCandidate("리모델링·밸류애드 가치 우수");
  } else if (capPct >= 2 && capPct <= 15) {
    pushCandidate(`연 수익률 ${capPct.toFixed(1)}% 안정 운영`);
  } else if (monthlyRentManwon >= 100) {
    pushCandidate(`월임대료 ${Math.round(monthlyRentManwon).toLocaleString()}만 현금흐름`);
  } else if (vacancyPct === 0 && monthlyRentManwon > 0) {
    pushCandidate("우량 임차인 전층 만실 운영");
  }

  const floorsAbove = Number(
    imSsot.floors_above ?? layerBldReg.grnd_flr_cnt ?? 0
  );
  const floorsBelow = Number(
    imSsot.floors_below ?? layerBldReg.ugrnd_flr_cnt ?? 0
  );
  const elevatorCount = Number(
    imSsot.elevator_count ?? imHero.elevatorCount ?? 0
  );
  const zoning = String(imSsot.zoning ?? layerZoning.zone_type ?? "").trim();

  if (floorsAbove >= 2) {
    pushCandidate(
      floorsBelow > 0
        ? `지하${floorsBelow}층·지상${floorsAbove}층 규모`
        : `지상 ${floorsAbove}층 규모 우량 빌딩`
    );
  } else if (elevatorCount > 0) {
    pushCandidate("승강기 완비 쾌적한 건물 컨디션");
  } else if (zoning.includes("상업")) {
    pushCandidate("상업지역 고밀도 활용 가치");
  }

  const rawHighlights: unknown[] = Array.isArray(imBody.axios_highlights)
    ? imBody.axios_highlights
    : Array.isArray(imHero.keyPoints)
    ? imHero.keyPoints
    : [];
  for (const item of rawHighlights) {
    if (picked.length >= 3) break;
    if (typeof item === "string") {
      pushCandidate(item);
    } else if (item && typeof item === "object") {
      const rec = item as Record<string, unknown>;
      if (typeof rec.claim === "string") pushCandidate(rec.claim);
    }
  }

  for (const fb of fallback) {
    if (picked.length >= 3) break;
    const repairedFb = repairDealCardLine(fb);
    if (repairedFb && !picked.includes(repairedFb)) {
      picked.push(repairedFb);
    }
  }

  return picked.slice(0, 3);
}
