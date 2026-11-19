import { generateFloorScaffolding } from "@/components/workspace/RentRollGrid";
import { toListTime } from "@/lib/workspace/list-date";
import type { RentRollRowItem } from "@/lib/rent-roll/tsv-parser";
import {
  formatKoreanCurrencyReadout,
  parseManwonAmount,
} from "@/lib/rent-roll/tsv-parser";
import { pyeongToM2 } from "@/domain/building/im-core/facts/area";
import type { BrokerExtrasFormState } from "@/domain/building/mobile-im/broker-extras";

export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ImEditorTabKey =
  | "specs"
  | "rentroll"
  | "axios_brief"
  | "media_publish";

export type ImPostureFilterKey = "all" | "income" | "owner" | "value_dev";

export interface ImAxiosHighlight {
  headline: string;
  brief: string;
  tone: "amber" | "sky" | "mint";
  bullets?: string[];
}

export interface ImPhotoEntry {
  id?: string;
  name: string;
  url?: string;
  previewUrl?: string;
  dataUrl?: string;
  category?: string;
  caption?: string;
}

export interface ImListItem {
  id: string;
  buildingId: string;
  documentId?: string;
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parcels?: any[];
  closingLine?: string;
  mainPurpose?: string;
  photoNames?: string[];
  photos?: ImPhotoEntry[];
  brokerName?: string;
  brokerageName?: string;
  brokerPhone?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  brokerExtras?: Record<string, any>;
  brokerExtrasForm?: BrokerExtrasFormState;
  axiosHighlights?: ImAxiosHighlight[];
  isDirty?: boolean;
  hasUnpublishedEdits?: boolean;
  ownerUserId?: string;
  isSample?: boolean;
}

export interface BasicImSlideSummary {
  no: string;
  title: string;
  summary: string;
  metric: string;
}

export const IM_POSTURE_FILTER_TABS = [
  { id: "all", label: "전체" },
  { id: "income", label: "임대수익" },
  { id: "owner", label: "사옥용" },
  { id: "value_dev", label: "신축·개발" },
] as const;

export const DEFAULT_IM_AXIOS_HIGHLIGHTS: ImAxiosHighlight[] = [
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

export const BLANK_IM_HIGHLIGHTS: ImAxiosHighlight[] = [
  { headline: "", brief: "", tone: "amber", bullets: [] },
  { headline: "", brief: "", tone: "sky", bullets: [] },
  { headline: "", brief: "", tone: "mint", bullets: [] },
];

export const INITIAL_IM_LIST: ImListItem[] = [
  {
    id: "im-doc-01",
    buildingId: "bld-01",
    title: "마포구 서교동 꼬마빌딩",
    address: "서울특별시 마포구 서교동 395-166",
    pnu: "1144012000103950166",
    lat: 37.5503,
    lng: 126.9158,
    askingPriceManwon: 950000,
    grossYieldPct: 4.2,
    status: "draft",
    versionLabel: "작성 중",
    updatedAt: "2026-11-01T09:00:00.000Z",
    investmentPosture: "core_income",
    gfaSqm: "1450.2",
    completionDate: "2018-06-15",
    landAreaSqm: "420.5",
    zoning: "제3종일반주거지역",
    handoverNote: "잔금 시 전층 명도 조건 협의 완료",
    axiosHighlights: DEFAULT_IM_AXIOS_HIGHLIGHTS,
    photoNames: [],
    isSample: true,
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

export const INITIAL_IM_IDS = new Set(INITIAL_IM_LIST.map((it) => it.id));
export const SAMPLE_SEED_IDS = new Set([
  "im-doc-01",
  "im-doc-02",
  "im-doc-03",
  "bld-01",
  "bld-02",
  "bld-03",
]);
export const IM_STORAGE_KEY = "credeal-w-im-v4";

export function isSampleSeedImItem(
  item?: Pick<ImListItem, "id" | "buildingId" | "address" | "isSample"> | null
): boolean {
  if (!item) return false;
  if (item.isSample === true) return true;
  if (item.isSample === false) return false;
  const matchesId =
    SAMPLE_SEED_IDS.has(item.id || "") ||
    SAMPLE_SEED_IDS.has(item.buildingId || "");
  if (!matchesId) return false;
  const addr = item.address || "";
  return addr.includes("서교동") || addr.includes("양평동");
}

function getImSortTier(item: ImListItem): number {
  if (isSampleSeedImItem(item)) return 2;
  const isDraftOrUnpublished =
    item.status !== "published" ||
    Boolean(item.hasUnpublishedEdits) ||
    Boolean(item.isDirty);
  return isDraftOrUnpublished ? 0 : 1;
}

/**
 * Sorts IM workspace items deterministically:
 *  Tier 0: User drafts & unpublished edits (newest first)
 *  Tier 1: User clean published IMs (newest first)
 *  Tier 2: Sample seeds (always at bottom)
 */
export function sortImWorkspaceItems(items: ImListItem[]): ImListItem[] {
  return items
    .map((item, idx) => ({ item, idx }))
    .sort((a, b) => {
      const tierDiff = getImSortTier(a.item) - getImSortTier(b.item);
      if (tierDiff !== 0) return tierDiff;
      const tb = toListTime(b.item.updatedAt) ?? 0;
      const ta = toListTime(a.item.updatedAt) ?? 0;
      if (tb !== ta) return tb - ta;
      return a.idx - b.idx;
    })
    .map(({ item }) => item);
}

export function createBlankImItem(options?: {
  id?: string;
  buildingId?: string;
  updatedAt?: string;
  ownerUserId?: string | null;
  brokerName?: string;
  brokerageName?: string;
  brokerPhone?: string;
}): ImListItem {
  const stamp = Date.now();
  const newId = options?.id || `im-doc-${stamp}`;
  return {
    id: newId,
    buildingId: options?.buildingId || `bld-${stamp}`,
    ...(options?.ownerUserId ? { ownerUserId: options.ownerUserId } : {}),
    title: "",
    address: "",
    askingPriceManwon: 0,
    grossYieldPct: 0,
    status: "draft",
    versionLabel: "작성 중",
    updatedAt: options?.updatedAt ?? new Date().toISOString(),
    investmentPosture: "core_income",
    gfaSqm: "",
    completionDate: "",
    landAreaSqm: "",
    zoning: "",
    handoverNote: "",
    photoNames: [],
    rentRoll: generateFloorScaffolding(3, 1),
    axiosHighlights: BLANK_IM_HIGHLIGHTS.map((h) => ({ ...h })),
    brokerName: options?.brokerName || "",
    brokerageName: options?.brokerageName || "",
    brokerPhone: options?.brokerPhone || "",
    isDirty: false,
    hasUnpublishedEdits: false,
    isSample: false,
  };
}

export function normalizePostureForSelector(raw?: string): string {
  if (!raw || raw === "core_income") return "income";
  if (raw === "owner_occupier") return "owner_occupied";
  return raw;
}

export function parseAskingManwonFromPriceBand(band?: string): number {
  if (!band || typeof band !== "string") return 0;
  const nums = band.match(/\d+(?:\.\d+)?/g);
  if (!nums || nums.length === 0) return 0;
  const parsed = nums.map(Number).filter((n) => Number.isFinite(n) && n > 0);
  if (parsed.length === 0) return 0;
  const avg = parsed.length >= 2 ? (parsed[0] + parsed[1]) / 2 : parsed[0];
  return band.includes("억") ? Math.round(avg * 10000) : Math.round(avg);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildImItemFromDealCardRecord(dc: any): ImListItem | null {
  if (!dc || typeof dc !== "object") return null;
  const targetBid = String(dc.id || dc.buildingId || "").trim();
  if (!targetBid) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c4 = (dc.card4 && typeof dc.card4 === "object" ? dc.card4 : {}) as Record<
    string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any
  >;
  const gfaPyung = Number(c4.gfaPyung || 0);
  const landPyung = Number(c4.landAreaPyung || 0);
  const postureRaw = String(c4.posture || "");
  const posture =
    postureRaw === "owner_occupied"
      ? "owner_occupier"
      : postureRaw === "value_add"
      ? "development"
      : "core_income";
  return {
    id: `im-${targetBid}`,
    buildingId: targetBid,
    title: String(dc.title || c4.headline || c4.region || "새 IM"),
    address: String(dc.address || c4.region || dc.region || ""),
    askingPriceManwon: parseAskingManwonFromPriceBand(
      String(c4.priceBand || dc.priceBand || "")
    ),
    grossYieldPct: 0,
    status: dc.status === "sent" || dc.status === "published" ? "published" : "draft",
    versionLabel: dc.status === "sent" || dc.status === "published" ? "v1 공개 중 ★" : "작성 중",
    updatedAt: new Date().toISOString(),
    investmentPosture: posture,
    gfaSqm: gfaPyung > 0 ? String(Math.round(pyeongToM2(gfaPyung) * 10) / 10) : "",
    completionDate: "",
    landAreaSqm:
      landPyung > 0 ? String(Math.round(pyeongToM2(landPyung) * 10) / 10) : "",
    zoning: "",
    handoverNote: "",
    axiosHighlights: BLANK_IM_HIGHLIGHTS,
    photoNames: [],
    rentRoll: generateFloorScaffolding(3, 1),
    isSample: false,
  };
}

const buildTestguideAssetUrl = (folder: string, filename: string): string =>
  `/api/public/testguide-assets/images/${encodeURIComponent(folder)}/${encodeURIComponent(filename)}`;

const KNOWN_TEST_ASSET_URLS: Record<string, string> = {
  "01_동교동_THEPARK_전면외관.jpg": buildTestguideAssetUrl("01_동교동_THEPARK", "01_동교동_THEPARK_전면외관.jpg"),
  "02_동교동_THEPARK_1층출입구.jpg": buildTestguideAssetUrl("01_동교동_THEPARK", "02_동교동_THEPARK_1층출입구.jpg"),
  "03_동교동_THEPARK_내부실내.png": buildTestguideAssetUrl("01_동교동_THEPARK", "03_동교동_THEPARK_내부실내.png"),
  "04_동교동_THEPARK_루프탑테라스.webp": buildTestguideAssetUrl("01_동교동_THEPARK", "04_동교동_THEPARK_루프탑테라스.webp"),
  "01_부천_동아빌딩_전면외관.jpg": buildTestguideAssetUrl("02_부천_동아빌딩", "01_부천_동아빌딩_전면외관.jpg"),
  "02_부천_동아빌딩_1층로비출입구.jpg": buildTestguideAssetUrl("02_부천_동아빌딩", "02_부천_동아빌딩_1층로비출입구.jpg"),
  "03_부천_동아빌딩_기준층내부실내.png": buildTestguideAssetUrl("02_부천_동아빌딩", "03_부천_동아빌딩_기준층내부실내.png"),
  "04_부천_동아빌딩_주차장설비.webp": buildTestguideAssetUrl("02_부천_동아빌딩", "04_부천_동아빌딩_주차장설비.webp"),
  "01_역삼동_여삼빌딩_전면외관.jpg": buildTestguideAssetUrl("03_역삼동_여삼빌딩", "01_역삼동_여삼빌딩_전면외관.jpg"),
  "02_역삼동_여삼빌딩_메인로비.jpg": buildTestguideAssetUrl("03_역삼동_여삼빌딩", "02_역삼동_여삼빌딩_메인로비.jpg"),
  "03_역삼동_여삼빌딩_오피스내부.png": buildTestguideAssetUrl("03_역삼동_여삼빌딩", "03_역삼동_여삼빌딩_오피스내부.png"),
  "04_역삼동_여삼빌딩_지하주차장.webp": buildTestguideAssetUrl("03_역삼동_여삼빌딩", "04_역삼동_여삼빌딩_지하주차장.webp"),
  "testguide/deal1/01_exterior.jpg": buildTestguideAssetUrl("01_동교동_THEPARK", "01_동교동_THEPARK_전면외관.jpg"),
  "testguide/deal1/02_entrance.jpg": buildTestguideAssetUrl("01_동교동_THEPARK", "02_동교동_THEPARK_1층출입구.jpg"),
  "testguide/deal1/03_interior.png": buildTestguideAssetUrl("01_동교동_THEPARK", "03_동교동_THEPARK_내부실내.png"),
  "testguide/deal1/04_rooftop.webp": buildTestguideAssetUrl("01_동교동_THEPARK", "04_동교동_THEPARK_루프탑테라스.webp"),
  "testguide/deal2/01_exterior.jpg": buildTestguideAssetUrl("02_부천_동아빌딩", "01_부천_동아빌딩_전면외관.jpg"),
  "testguide/deal2/02_lobby.jpg": buildTestguideAssetUrl("02_부천_동아빌딩", "02_부천_동아빌딩_1층로비출입구.jpg"),
  "testguide/deal2/03_interior.png": buildTestguideAssetUrl("02_부천_동아빌딩", "03_부천_동아빌딩_기준층내부실내.png"),
  "testguide/deal2/04_parking.webp": buildTestguideAssetUrl("02_부천_동아빌딩", "04_부천_동아빌딩_주차장설비.webp"),
  "testguide/deal3/01_exterior.jpg": buildTestguideAssetUrl("03_역삼동_여삼빌딩", "01_역삼동_여삼빌딩_전면외관.jpg"),
  "testguide/deal3/02_lobby.jpg": buildTestguideAssetUrl("03_역삼동_여삼빌딩", "02_역삼동_여삼빌딩_메인로비.jpg"),
  "testguide/deal3/03_interior.png": buildTestguideAssetUrl("03_역삼동_여삼빌딩", "03_역삼동_여삼빌딩_오피스내부.png"),
  "testguide/deal3/04_parking.webp": buildTestguideAssetUrl("03_역삼동_여삼빌딩", "04_역삼동_여삼빌딩_지하주차장.webp"),
};

function stripDuplicateBrowserSuffix(filename: string): string {
  return filename.replace(/\s*\(\d+\)(?=\.[^.]+$)/, "").trim();
}

export function resolveKnownTestAssetUrl(nameOrUrl?: string | null): string | undefined {
  if (!nameOrUrl || typeof nameOrUrl !== "string") return undefined;
  const trimmed = nameOrUrl.trim();
  if (KNOWN_TEST_ASSET_URLS[trimmed]) return KNOWN_TEST_ASSET_URLS[trimmed];
  const legacyMatch = trimmed.match(/testguide\/deal[123]\/[^?#\s]+/);
  if (legacyMatch && KNOWN_TEST_ASSET_URLS[legacyMatch[0]]) {
    return KNOWN_TEST_ASSET_URLS[legacyMatch[0]];
  }
  const rawBase = trimmed.split(/[\\/]/).pop() || "";
  let decodedBase = rawBase;
  try {
    decodedBase = decodeURIComponent(rawBase);
  } catch {
    // ignore malformed URI sequence
  }
  for (const candidate of [
    rawBase,
    stripDuplicateBrowserSuffix(rawBase),
    decodedBase,
    stripDuplicateBrowserSuffix(decodedBase),
  ]) {
    if (candidate && KNOWN_TEST_ASSET_URLS[candidate]) {
      return KNOWN_TEST_ASSET_URLS[candidate];
    }
  }
  return undefined;
}

export function resolveRenderablePhotoSrc(pe?: Partial<ImPhotoEntry> | null): string | undefined {
  if (!pe) return undefined;
  if (pe.dataUrl && pe.dataUrl.startsWith("data:")) return pe.dataUrl;
  const healedKnown =
    resolveKnownTestAssetUrl(pe.url) ||
    resolveKnownTestAssetUrl(pe.previewUrl) ||
    resolveKnownTestAssetUrl(pe.name);
  if (healedKnown) return healedKnown;
  return pe.previewUrl || pe.url || undefined;
}

const BROKER_PLACEHOLDERS = new Set([
  "",
  "-",
  "—",
  "담당 공인중개사",
  "담당 중개법인 (확인 중)",
  "담당 중개법인",
  "전담 중개사무소",
  "미등록",
]);

export function cleanBrokerPlaceholder(val?: string | null): string {
  if (!val || typeof val !== "string") return "";
  const t = val.trim();
  return BROKER_PLACEHOLDERS.has(t) ? "" : t;
}

export function formatPhoneHyphen(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return raw;
  if (digits.startsWith("02")) {
    if (digits.length <= 2) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
    if (digits.length <= 9) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
    return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 10)}`;
  }
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (digits.length <= 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
}

export function inferPhotoCategoryFromFilename(
  filename: string,
  idx: number
): { category: string; caption: string } {
  const base = filename
    .replace(/\.[^.]+$/, "")
    .replace(/^[0-9]+[_-\s]*/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (/외관|전경|파사드|exterior|facade|front/i.test(filename)) {
    return { category: "exterior", caption: base || "건물 전면 외관" };
  }
  if (/로비|승강기홀|lobby/i.test(filename)) {
    return { category: "lobby", caption: base || "1층 메인 로비" };
  }
  if (/출입구|입구|entrance/i.test(filename)) {
    return { category: "entrance", caption: base || "1층 주출입구" };
  }
  if (/주차|설비|기계식|parking/i.test(filename)) {
    return { category: "parking", caption: base || "주차장 및 설비 현황" };
  }
  if (/옥상|루프탑|테라스|rooftop|terrace/i.test(filename)) {
    return { category: "rooftop", caption: base || "옥상 및 루프탑 테라스" };
  }
  if (/도면|평면도|floor.*plan/i.test(filename)) {
    return { category: "floor_plan", caption: base || "층별 건축 평면도" };
  }
  if (/내부|실내|오피스|기준층|interior|office/i.test(filename)) {
    return { category: "interior", caption: base || "기준층 실내 전용 공간" };
  }
  return {
    category: "general",
    caption: base || "",
  };
}

export const MAX_SINGLE_INLINE_DATA_URL_CHARS = 350_000;
export const MAX_TOTAL_INLINE_DATA_URL_CHARS = 1_600_000;
const MULTIPART_DIRECT_CEILING_BYTES = 3_800_000;

export function isHeicLikeFile(file: Pick<File, "name" | "type">): boolean {
  const mime = (file.type || "").toLowerCase().trim();
  if (
    mime === "image/heic" ||
    mime === "image/heif" ||
    mime === "image/heic-sequence" ||
    mime === "image/heif-sequence"
  ) {
    return true;
  }
  return /\.(heic|heif)$/i.test(file.name || "");
}

export function isSafeInlineImageDataUrl(u?: string | null): u is string {
  if (!u || typeof u !== "string") return false;
  if (u.length > MAX_SINGLE_INLINE_DATA_URL_CHARS) return false;
  return /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(u);
}

function readAndCompressPhotoFile(
  file: File,
  maxDim = 1280,
  quality = 0.8
): Promise<string> {
  return new Promise((resolve) => {
    if (typeof FileReader === "undefined") {
      resolve("");
      return;
    }
    const isJsdomEnv =
      typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent || "");
    if (!isJsdomEnv && isHeicLikeFile(file)) {
      resolve("");
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => resolve("");
    reader.onload = () => {
      const rawDataUrl = typeof reader.result === "string" ? reader.result : "";
      if (
        !rawDataUrl ||
        typeof window === "undefined" ||
        typeof document === "undefined" ||
        isJsdomEnv
      ) {
        resolve(isSafeInlineImageDataUrl(rawDataUrl) ? rawDataUrl : "");
        return;
      }
      let settled = false;
      const done = (val: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(fallbackTimer);
        resolve(isSafeInlineImageDataUrl(val) ? val : "");
      };
      const fallbackTimer = setTimeout(() => done(rawDataUrl), 10000);
      const img = new window.Image();
      img.onerror = () => done("");
      img.onload = () => {
        try {
          const w = img.naturalWidth || img.width || 1280;
          const h = img.naturalHeight || img.height || 853;
          const scale = Math.min(1, maxDim / Math.max(1, w, h));
          const targetW = Math.max(1, Math.round(w * scale));
          const targetH = Math.max(1, Math.round(h * scale));
          const canvas = document.createElement("canvas");
          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            done(rawDataUrl);
            return;
          }
          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(0, 0, targetW, targetH);
          ctx.drawImage(img, 0, 0, targetW, targetH);
          let compressed = canvas.toDataURL("image/jpeg", quality);
          if (compressed.length > MAX_SINGLE_INLINE_DATA_URL_CHARS) {
            compressed = canvas.toDataURL("image/jpeg", 0.62);
          }
          done(
            compressed && compressed.startsWith("data:image/")
              ? compressed
              : rawDataUrl
          );
        } catch {
          done(rawDataUrl);
        }
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  });
}

async function uploadCompressedPhotoIfPossible(
  dataUrl: string,
  name: string,
  buildingId?: string
): Promise<string | null> {
  if (
    !dataUrl ||
    !dataUrl.startsWith("data:image/") ||
    typeof window === "undefined" ||
    typeof fetch !== "function" ||
    (typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent || ""))
  ) {
    return null;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch("/api/broker/im/upload-photo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataUrl, name, buildingId }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as {
      ok?: boolean;
      url?: string;
    } | null;
    if (
      json?.ok &&
      typeof json.url === "string" &&
      /^https?:\/\//i.test(json.url)
    ) {
      return json.url;
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function uploadRawPhotoFileToServer(
  file: File,
  buildingId?: string
): Promise<{ url: string | null; errorMessage?: string }> {
  if (
    typeof window === "undefined" ||
    typeof fetch !== "function" ||
    (typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent || ""))
  ) {
    return { url: null };
  }

  if (file.size > MULTIPART_DIRECT_CEILING_BYTES) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 35000);
    try {
      const signRes = await fetch("/api/broker/im/upload-photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_signed_upload",
          name: file.name,
          buildingId,
          byteLength: file.size,
        }),
        signal: controller.signal,
      });
      const signJson = (await signRes.json().catch(() => null)) as {
        ok?: boolean;
        signedUrl?: string;
        tempPath?: string;
        message?: string;
      } | null;
      if (signRes.ok && signJson?.ok && signJson.signedUrl && signJson.tempPath) {
        const putRes = await fetch(signJson.signedUrl, {
          method: "PUT",
          headers: {
            "Content-Type": file.type || "application/octet-stream",
          },
          body: file,
          signal: controller.signal,
        });
        if (putRes.ok) {
          const finRes = await fetch("/api/broker/im/upload-photo", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "finalize_uploaded_raw",
              tempPath: signJson.tempPath,
              name: file.name,
              buildingId,
            }),
            signal: controller.signal,
          });
          const finJson = (await finRes.json().catch(() => null)) as {
            ok?: boolean;
            url?: string;
            message?: string;
          } | null;
          if (finRes.ok && finJson?.ok && typeof finJson.url === "string") {
            return { url: finJson.url };
          }
          return { url: null, errorMessage: finJson?.message };
        }
      } else if (signRes.status === 413) {
        return {
          url: null,
          errorMessage: signJson?.message || "파일 용량이 25MB 제한을 초과했습니다.",
        };
      }
    } catch {
      // Fall through to multipart attempt
    } finally {
      clearTimeout(timer);
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const fd = new FormData();
    fd.append("file", file, file.name);
    fd.append("name", file.name);
    if (buildingId) fd.append("buildingId", buildingId);
    const res = await fetch("/api/broker/im/upload-photo", {
      method: "POST",
      body: fd,
      signal: controller.signal,
    });
    const json = (await res.json().catch(() => null)) as {
      ok?: boolean;
      url?: string;
      message?: string;
    } | null;
    if (
      res.ok &&
      json?.ok &&
      typeof json.url === "string" &&
      /^https?:\/\//i.test(json.url)
    ) {
      return { url: json.url };
    }
    return {
      url: null,
      errorMessage:
        res.status === 413
          ? "사진 파일 용량이 너무 커서 업로드하지 못했습니다."
          : json?.message,
    };
  } catch {
    return { url: null };
  } finally {
    clearTimeout(timer);
  }
}

export async function processAndUploadPhotoFile(
  file: File,
  buildingId?: string
): Promise<{ dataUrl: string; remoteUrl: string | null; errorMessage?: string }> {
  const dataUrl = await readAndCompressPhotoFile(file);
  if (dataUrl) {
    const remoteUrl = await uploadCompressedPhotoIfPossible(
      dataUrl,
      file.name,
      buildingId
    );
    if (remoteUrl) {
      return { dataUrl, remoteUrl };
    }
    const rawUp = await uploadRawPhotoFileToServer(file, buildingId);
    return { dataUrl, remoteUrl: rawUp.url, errorMessage: rawUp.errorMessage };
  }
  const rawUp = await uploadRawPhotoFileToServer(file, buildingId);
  return { dataUrl: "", remoteUrl: rawUp.url, errorMessage: rawUp.errorMessage };
}

export function isPersistablePhotoUrl(u?: string | null): u is string {
  if (!u || typeof u !== "string" || u.startsWith("blob:")) return false;
  if (u.startsWith("data:")) return isSafeInlineImageDataUrl(u);
  return true;
}

export function sanitizePhotosForSync(entries: ImPhotoEntry[]): ImPhotoEntry[] {
  let inlineBudgetUsed = 0;
  return entries
    .map((pe) => {
      const nonDataPersistentUrl =
        (pe.url && !pe.url.startsWith("data:") && !pe.url.startsWith("blob:")
          ? resolveKnownTestAssetUrl(pe.url) || pe.url
          : undefined) || resolveKnownTestAssetUrl(pe.name);
      const safeInlineDataUrl =
        !nonDataPersistentUrl &&
        isSafeInlineImageDataUrl(pe.dataUrl) &&
        inlineBudgetUsed + pe.dataUrl.length <= MAX_TOTAL_INLINE_DATA_URL_CHARS
          ? pe.dataUrl
          : !nonDataPersistentUrl &&
            isSafeInlineImageDataUrl(pe.url) &&
            inlineBudgetUsed + pe.url.length <= MAX_TOTAL_INLINE_DATA_URL_CHARS
          ? pe.url
          : undefined;
      if (safeInlineDataUrl) {
        inlineBudgetUsed += safeInlineDataUrl.length;
      }
      const rawUrl = nonDataPersistentUrl || safeInlineDataUrl;
      const rawPreview =
        nonDataPersistentUrl ||
        safeInlineDataUrl ||
        (isPersistablePhotoUrl(pe.previewUrl)
          ? resolveKnownTestAssetUrl(pe.previewUrl) || pe.previewUrl
          : undefined);
      const safeUrl = isPersistablePhotoUrl(rawUrl)
        ? rawUrl
        : resolveKnownTestAssetUrl(pe.name);
      const safePreview =
        nonDataPersistentUrl ||
        (isPersistablePhotoUrl(rawPreview) && !rawPreview?.startsWith("data:"))
          ? rawPreview
          : undefined;
      return {
        ...(pe.id ? { id: pe.id } : {}),
        name: pe.name,
        ...(safeUrl ? { url: safeUrl } : {}),
        ...(safePreview && safePreview !== safeUrl ? { previewUrl: safePreview } : {}),
        ...(safeInlineDataUrl ? { dataUrl: safeInlineDataUrl } : {}),
        category: pe.category,
        caption: pe.caption,
      };
    })
    .filter((pe) => Boolean(pe.dataUrl || pe.url || pe.previewUrl));
}

export function buildPhotosPayloadFromEntries(sourceEntries: ImPhotoEntry[]) {
  let inlineBudgetUsed = 0;
  const valid = sourceEntries
    .map((pe, idx) => {
      const nonDataUrl =
        pe.url && !pe.url.startsWith("data:") && !pe.url.startsWith("blob:")
          ? resolveKnownTestAssetUrl(pe.url) || pe.url
          : undefined;
      const rawCandidate =
        nonDataUrl ||
        pe.dataUrl ||
        (isPersistablePhotoUrl(pe.previewUrl) ? pe.previewUrl : undefined) ||
        (isPersistablePhotoUrl(pe.url) ? pe.url : undefined) ||
        resolveKnownTestAssetUrl(pe.name);
      if (!isPersistablePhotoUrl(rawCandidate)) return null;
      if (rawCandidate.startsWith("data:")) {
        if (inlineBudgetUsed + rawCandidate.length > MAX_TOTAL_INLINE_DATA_URL_CHARS) {
          return null;
        }
        inlineBudgetUsed += rawCandidate.length;
      }
      return {
        url: rawCandidate,
        name: pe.name,
        caption: pe.caption,
        category: pe.category || (idx === 0 ? "exterior" : "interior"),
        role: idx === 0 ? "cover" : undefined,
        isHero: idx === 0,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  return valid.length > 0 ? valid : undefined;
}

export function parseKrwInputToManwon(raw: string): number {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return 0;

  if (/[억천백만]/.test(trimmed)) {
    const normalized = trimmed.replace(/([\d.]+)\s*백\s*만?/g, (_, n) => {
      const v = parseFloat(n);
      return Number.isFinite(v) ? `${v * 100}만` : "";
    });
    return Math.round(parseManwonAmount(normalized).manwon);
  }

  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return 0;
  const krw = Number(digits);
  if (!Number.isFinite(krw) || krw <= 0) return 0;
  return Math.round(krw / 10_000);
}

export function buildBasicImSlides(params: {
  cleanCoverTitle: string;
  address: string;
  askingPriceManwon: number;
  postureKoreanLabel: string;
  axiosHighlights: ImAxiosHighlight[];
  calculatedYield: number;
  gfaSqm: string;
  completionDate: string;
  rentRollLength: number;
  landAreaSqm: string;
  zoning: string;
  totalDepositManwon: number;
  totalRentManwon: number;
  photoEntries: ImPhotoEntry[];
  closingLine?: string;
  handoverNote: string;
  brokerageName: string;
  brokerName: string;
  brokerPhone: string;
}): BasicImSlideSummary[] {
  const {
    cleanCoverTitle,
    address,
    askingPriceManwon,
    postureKoreanLabel,
    axiosHighlights,
    calculatedYield,
    gfaSqm,
    completionDate,
    rentRollLength,
    landAreaSqm,
    zoning,
    totalDepositManwon,
    totalRentManwon,
    photoEntries,
    closingLine,
    handoverNote,
    brokerageName,
    brokerName,
    brokerPhone,
  } = params;

  return [
    {
      no: "01",
      title: "표지",
      summary: `${cleanCoverTitle || "매물"} · ${address || "주소 미입력"}`,
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
      metric: `총 ${rentRollLength}개 층 구성`,
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
      summary: `보증금 합계 ${
        formatKoreanCurrencyReadout(totalDepositManwon).replace(/^=\s*/, "") || "0원"
      }`,
      metric: `월 임대수익 ${
        formatKoreanCurrencyReadout(totalRentManwon).replace(/^=\s*/, "") || "0원"
      }`,
    },
    {
      no: "07",
      title: "수지 및 수익률 분석",
      summary: `보증금 차감 매입가 ${
        formatKoreanCurrencyReadout(
          Math.max(0, (askingPriceManwon || 0) - totalDepositManwon)
        ).replace(/^=\s*/, "") || "0원"
      }`,
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
        photoEntries.length > 0
          ? `첨부 사진 ${photoEntries.length}장 (${photoEntries.map((p) => p.name).join(", ")})`
          : "외관 사진 및 지적도",
      metric: `${photoEntries.length}개 파일`,
    },
    {
      no: "10",
      title: "문의/안내 및 명도 조건",
      summary: closingLine
        ? `${closingLine} · ${handoverNote}`
        : handoverNote || "명도 일정 협의 가능",
      metric:
        [brokerageName, brokerName, brokerPhone].filter(Boolean).join(" · ") ||
        "담당 공인중개사 안내",
    },
  ];
}

export function buildFallbackImHighlights(params: {
  address: string;
  askingPriceManwon: number;
  calculatedYield: number;
  investmentPosture: string;
  gfaSqm: string;
  handoverNote: string;
  zoning: string;
  rentRollLength: number;
  totalRentManwon: number;
  totalDepositManwon: number;
}): ImAxiosHighlight[] {
  const regionPart = params.address.split(" ").slice(1, 3).join(" ") || "핵심 지역";
  const priceEok = ((params.askingPriceManwon || 0) / 10000).toFixed(1);
  const yieldStr = params.calculatedYield.toFixed(2);
  const normP = normalizePostureForSelector(params.investmentPosture);

  if (normP === "owner_occupied") {
    return [
      {
        headline: `${regionPart} 사옥 추천 · 가시성 우수한 단독 건물`,
        brief: `${regionPart} 주요 도로 인접 입지로 방문객 접근성과 출퇴근 여건이 뛰어납니다.${
          params.gfaSqm ? ` 연면적 ${params.gfaSqm}㎡ 규모로 사옥 활용에 적합합니다.` : ""
        }`,
        tone: "amber",
      },
      {
        headline: `${params.handoverNote || "입주 일정 협의 가능"} · 사옥 이전 용이`,
        brief: `명도 및 입주 일정 협의가 가능하여 계획적인 사옥 이전이 가능합니다.`,
        tone: "sky",
      },
      {
        headline: `${priceEok !== "0.0" ? `매매가 ${priceEok}억 · ` : ""}${
          params.zoning || "우수 용도지역"
        } 토지 가치`,
        brief: `반듯한 대지 여건을 갖추어 실사용 가치는 물론 중장기 자산가치 보존에 유리합니다.`,
        tone: "mint",
      },
    ];
  }

  return [
    {
      headline: `${regionPart} 상권 · 총 ${params.rentRollLength}개 층 임차 운영`,
      brief: `총 ${params.rentRollLength}개 층에 안정적인 업종이 입점해 운영 중입니다.${
        params.totalRentManwon > 0
          ? ` 월 임대료 합계 ${params.totalRentManwon.toLocaleString()}만 원입니다.`
          : ""
      }`,
      tone: "amber",
    },
    {
      headline:
        params.calculatedYield > 0
          ? `순투자금 대비 연 ${yieldStr}% 임대 수익`
          : `안정적인 보증금·임대료 수익 구조`,
      brief:
        params.calculatedYield > 0
          ? `보증금 합계 ${params.totalDepositManwon.toLocaleString()}만 원을 제외한 순투자금 기준 연 ${yieldStr}% 수익률입니다.`
          : `임대차 구조가 안정적이어서 꾸준한 배당 수익을 기대할 수 있습니다.`,
      tone: "sky",
    },
    {
      headline: `${params.zoning || "핵심 상권"} 토지 가치 및 가치 상승 여력`,
      brief: `향후 임대차 갱신 및 건물 관리 개선을 통한 추가 가치 상승 여력이 있습니다.`,
      tone: "mint",
    },
  ];
}
