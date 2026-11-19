import type { AssignableDealItem } from "@/components/magazine-editor/DealSlotAssigner";
import { DEFAULT_NEWSLETTER_BLOCKS } from "@/components/magazine-editor/BlockSelectionGrid";
import type { NewsletterTargetSegment } from "@/components/broker/studio/SendListSummaryBar";
import {
  MONTHLY_REGION_PRESETS,
  type MonthlyRegionKey,
} from "@/domain/magazine/monthly-stats-charts";
import type { MonthlyChartPairId } from "@/domain/magazine/monthly-stats-hydration";
import { resolveUnitIssuesFromData } from "@/domain/magazine/issue-clustering";
import type { SpecificNewsChannelId } from "@/domain/magazine/news-channels";
import type {
  AxiosUnitIssue,
  EditionType,
  MarketTemperature,
  MonthlyRegionalChart,
} from "@/domain/magazine/types";
import { getSiteOrigin } from "@/lib/kakao/share";
import { toKstDate, todayKst } from "@/lib/magazine/kst";
import { resolvePublicBaseUrl } from "@/lib/magazine/share-urls";
import {
  getDefaultSectionsForCadence,
  parseCadenceAnchor,
  type NewsletterCadence,
} from "@/lib/magazine/newsletter-cadence";
import { formatPriceKo, sanitizeDealAddress } from "@/lib/magazine/view-helpers";
import {
  getLastActiveBrokerUserId,
  normalizeWorkspaceUserId,
  scopedWorkspaceStorageKey,
} from "@/lib/workspace/storage-namespace";

export type EditorPrimaryTabKey =
  | "cover"
  | "field_note"
  | "monthly_stats"
  | "news"
  | "theme_deals";

export interface EditorPrimaryTabDef {
  key: EditorPrimaryTabKey;
  label: string;
}

/**
 * 하위 호환용: 기존 테스트(newsletter-v2-advancement)에서 import 하는 주기별 탭 헬퍼 유지
 */
export function getPrimaryTabsForCadence(cadence: EditionType): EditorPrimaryTabDef[] {
  if (cadence === "daily") {
    return [
      { key: "cover", label: "① 제목" },
      { key: "news", label: "② 내용" },
      { key: "theme_deals", label: "③ 보내기" },
    ];
  }
  if (cadence === "monthly") {
    return [
      { key: "cover", label: "① 제목" },
      { key: "monthly_stats", label: "② 통계" },
      { key: "news", label: "③ 내용" },
      { key: "theme_deals", label: "④ 보내기" },
    ];
  }
  return [
    { key: "cover", label: "① 제목" },
    { key: "field_note", label: "② 브리핑" },
    { key: "news", label: "③ 내용" },
    { key: "theme_deals", label: "④ 보내기" },
  ];
}

export type NewsletterStepKey = "title" | "content" | "send";

export interface SavedEditionSummary {
  id: string;
  slug: string;
  title: string;
  status: string;
  updatedAt: string | null;
  publishedAt: string | null;
  dealCount: number;
  hasBriefing: boolean;
  summary?: string;
  briefingTitle?: string;
  briefingBody?: string;
  marketTemp?: MarketTemperature | null;
  monthlyRegion?: MonthlyRegionKey;
  monthlyPairId?: MonthlyChartPairId;
  monthlyCharts?: MonthlyRegionalChart[];
  selectedDealIds?: string[];
  dealComments?: Record<string, string>;
  unitIssues?: AxiosUnitIssue[];
  sections?: { id: string; enabled: boolean }[];
  targetSegment?: NewsletterTargetSegment;
  issueDate?: string;
  publicUrl?: string;
  cadence?: NewsletterCadence | "special";
}

export interface LocalNewsletterDraft {
  ownerUserId?: string;
  brokerId?: string;
  brokerSlug?: string;
  editionId?: string | null;
  slotSlug?: string;
  headline: string;
  summary: string;
  briefingTitle: string;
  briefingBody: string;
  issueYear: number;
  issueMonth: number;
  cadence: NewsletterCadence;
  issueDateStr: string;
  marketTemp: MarketTemperature | null;
  monthlyRegion: MonthlyRegionKey;
  monthlyPairId?: MonthlyChartPairId;
  monthlyCharts?: MonthlyRegionalChart[];
  selectedDealIds: string[];
  dealComments: Record<string, string>;
  preferredRegions: string[];
  preferredChannels: SpecificNewsChannelId[];
  unitIssues: AxiosUnitIssue[];
  sections: { id: string; enabled: boolean }[];
  targetSegment: NewsletterTargetSegment;
  publishedUrl?: string | null;
  serverPublished?: boolean;
  serverSavedDraft?: boolean;
  isExplicitNewSlot?: boolean;
  savedAt: string;
}

export interface StatusBannerState {
  tone: "success" | "error" | "info" | "warning";
  message: string;
  fallbackUrl?: string;
  profileCtaHref?: string;
  missingLabels?: string[];
}

/**
 * API 에러 응답(특히 422 STATUTORY_DISCLOSURE_INCOMPLETE)에서 사용자 안내 배너 상태를 생성한다.
 */
export function buildApiErrorStatusBanner(
  status: number,
  json: unknown,
  fallbackMessage: string,
): StatusBannerState {
  const rec = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const errObj =
    rec.error && typeof rec.error === "object" ? (rec.error as Record<string, unknown>) : null;
  const code = typeof errObj?.code === "string" ? errObj.code : typeof rec.code === "string" ? rec.code : "";
  const rawMessage =
    typeof errObj?.message === "string"
      ? errObj.message
      : typeof rec.message === "string"
        ? rec.message
        : fallbackMessage;
  const rawMissing = Array.isArray(rec.missingLabels)
    ? rec.missingLabels
    : Array.isArray(errObj?.missingLabels)
      ? errObj.missingLabels
      : [];
  const missingLabels = rawMissing
    .filter((label): label is string => typeof label === "string" && label.trim().length > 0)
    .map((label) => label.trim());

  if (status === 422 && (code === "STATUTORY_DISCLOSURE_INCOMPLETE" || missingLabels.length > 0)) {
    const missingSuffix = missingLabels.length > 0 ? ` (미입력 항목: ${missingLabels.join(", ")})` : "";
    return {
      tone: "error",
      message: `${rawMessage || "법정 필수 중개사무소 정보가 미입력되어 발행을 완료할 수 없습니다."}${missingSuffix}`,
      profileCtaHref: "/broker/profile",
      missingLabels,
    };
  }

  return {
    tone: "error",
    message: rawMessage || fallbackMessage,
  };
}

export interface MagazineQueryAction {
  dealIds: string[];
  step?: NewsletterStepKey;
  insightsTab?: "subscribers" | "analytics";
}

/**
 * ?deals= / ?tab= / ?step= URL 쿼리 파라미터에서 초기 에디터 진입 액션을 해석한다.
 */
export function resolveMagazineQueryAction(
  searchParams: { get?: (key: string) => string | null } | null | undefined,
): MagazineQueryAction {
  const dealsParam = searchParams?.get?.("deals") || "";
  const tabParam = searchParams?.get?.("tab") || "";
  const stepParam = searchParams?.get?.("step") || "";
  const dealIds = dealsParam.split(",").map((s) => s.trim()).filter(Boolean);

  if (tabParam === "outreach" || tabParam === "subscribers") {
    return { dealIds, insightsTab: "subscribers" };
  }
  if (tabParam === "analytics") {
    return { dealIds, insightsTab: "analytics" };
  }
  if (tabParam === "theme_deals" || tabParam === "content" || stepParam === "deals" || stepParam === "content") {
    return { dealIds, step: "content" };
  }
  if (tabParam === "send" || tabParam === "publish" || stepParam === "publish" || stepParam === "send") {
    return { dealIds, step: "send" };
  }
  if (tabParam === "ai_assist" || tabParam === "cover" || tabParam === "title" || stepParam === "title") {
    return { dealIds, step: "title" };
  }
  return { dealIds, step: dealIds.length > 0 ? "content" : undefined };
}

export function buildSafePublicUrl(params: {
  brokerSlug: string;
  issueDate?: string | null;
  fallbackAnchorDate?: string | null;
  editionId?: string | null;
  targetSegment?: NewsletterTargetSegment;
}): string | null {
  const cleanSlug = params.brokerSlug.trim();
  if (!cleanSlug || cleanSlug === "me" || isUuidLike(cleanSlug)) {
    return null;
  }
  const isoDate = isValidIsoDate(params.issueDate)
    ? params.issueDate.trim()
    : isValidIsoDate(params.fallbackAnchorDate)
      ? params.fallbackAnchorDate.trim()
      : todayKst();
  const qs = new URLSearchParams();
  if (params.editionId && params.editionId.trim()) {
    qs.set("edition", params.editionId.trim());
  }
  if (params.targetSegment && params.targetSegment !== "all") {
    qs.set("target", params.targetSegment);
  }
  const query = qs.toString();
  const baseOrigin = resolvePublicBaseUrl() ?? getSiteOrigin();
  return `${baseOrigin}/magazine/${encodeURIComponent(cleanSlug)}/${encodeURIComponent(isoDate)}${query ? `?${query}` : ""}`;
}

export const LEGACY_DRAFT_STORAGE_KEY = "cre-newsletter-local-draft-v2";
export const SLOT_DRAFT_PREFIX = "cre-newsletter-draft-v3:";
export const LAST_ACTIVE_SLOT_SESSION_KEY = "cre-newsletter-last-slot-v3";

export function isValidIsoDate(val: unknown): val is string {
  return typeof val === "string" && /^\d{4}-\d{2}-\d{2}$/.test(val.trim());
}

export function isoTimestampToKstDate(val: unknown): string | undefined {
  if (typeof val !== "string" || !val.trim()) return undefined;
  if (isValidIsoDate(val)) return val.trim();
  const parsed = new Date(val);
  return Number.isNaN(parsed.getTime()) ? undefined : toKstDate(parsed);
}

export function isUuidLike(val: string | null | undefined): boolean {
  if (!val) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val.trim());
}

export function buildDefaultEditorSections(
  cadenceVal: NewsletterCadence = "monthly",
): { id: string; enabled: boolean }[] {
  const cadenceDefaults = getDefaultSectionsForCadence(cadenceVal);
  const defaultMap = new Map(cadenceDefaults.map((item) => [item.id, item.enabled]));
  return DEFAULT_NEWSLETTER_BLOCKS.map((b) => ({
    id: b.id,
    enabled: defaultMap.has(b.id) ? Boolean(defaultMap.get(b.id)) : b.id !== "market_data",
  }));
}

export function normalizeEditorSections(
  rawSections: unknown,
  cadenceVal: NewsletterCadence = "monthly",
): { id: string; enabled: boolean }[] | undefined {
  if (!Array.isArray(rawSections) || rawSections.length === 0) return undefined;
  const map = new Map<string, boolean>();
  for (const item of rawSections) {
    if (item && typeof item === "object") {
      const rec = item as Record<string, unknown>;
      if (typeof rec.id === "string" && typeof rec.enabled === "boolean") {
        map.set(rec.id, rec.enabled);
      }
    }
  }
  if (map.size === 0) return undefined;
  const fallbackMap = new Map(
    buildDefaultEditorSections(cadenceVal).map((item) => [item.id, item.enabled]),
  );
  return DEFAULT_NEWSLETTER_BLOCKS.map((b) => {
    if (b.id === "field_note") {
      if (map.has("field_note") || map.has("ai_briefing")) {
        return {
          id: b.id,
          enabled: Boolean(map.get("field_note")) || Boolean(map.get("ai_briefing")),
        };
      }
      return {
        id: b.id,
        enabled: Boolean(fallbackMap.get(b.id)),
      };
    }
    return {
      id: b.id,
      enabled: map.has(b.id) ? Boolean(map.get(b.id)) : Boolean(fallbackMap.get(b.id)),
    };
  });
}

export function normalizeTargetSegment(raw: unknown): NewsletterTargetSegment | undefined {
  if (raw === "all" || raw === "buyer" || raw === "seller") return raw;
  if (Array.isArray(raw) && raw.length > 0) {
    const first = raw[0];
    if (first === "all" || first === "buyer" || first === "seller") return first;
  }
  return undefined;
}

export function normalizeMonthlyRegion(raw: unknown): MonthlyRegionKey | undefined {
  if (typeof raw !== "string") return undefined;
  const found = MONTHLY_REGION_PRESETS.find((p) => p.key === raw.trim());
  return found ? found.key : undefined;
}

export function normalizeMonthlyPairId(raw: unknown): MonthlyChartPairId {
  if (
    raw === "molit_bok" ||
    raw === "molit_band" ||
    raw === "reb_molit" ||
    raw === "molit_kosis" ||
    raw === "reb_kosis"
  ) {
    return raw;
  }
  return "molit_bok";
}

export function normalizeSavedMonthlyCharts(
  raw: unknown,
): MonthlyRegionalChart[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const valid = raw.filter(
    (c): c is MonthlyRegionalChart =>
      Boolean(c) &&
      typeof c === "object" &&
      typeof (c as MonthlyRegionalChart).title === "string" &&
      Array.isArray((c as MonthlyRegionalChart).series) &&
      (c as MonthlyRegionalChart).series.length > 0 &&
      (c as MonthlyRegionalChart).isPlaceholder !== true,
  );
  return valid.length > 0 ? valid.slice(0, 2) : undefined;
}

export function makeSlotStorageKey(
  editionIdVal: string | null | undefined,
  cadenceVal: NewsletterCadence | "special",
  slotSlug: string,
): string {
  if (editionIdVal && editionIdVal.trim()) {
    return `${SLOT_DRAFT_PREFIX}${editionIdVal.trim()}`;
  }
  return `${SLOT_DRAFT_PREFIX}${cadenceVal}:${slotSlug}`;
}

export function appendTargetSegmentToUrl(
  rawUrl: string | null | undefined,
  segment: NewsletterTargetSegment,
): string | null {
  if (!rawUrl || !rawUrl.trim()) return null;
  const trimmed = rawUrl.trim();
  try {
    const isAbsolute = /^https?:\/\//i.test(trimmed);
    const parsed = new URL(trimmed, isAbsolute ? undefined : getSiteOrigin());
    if (segment !== "all") {
      parsed.searchParams.set("target", segment);
    } else if (parsed.searchParams.get("target") === "all") {
      parsed.searchParams.delete("target");
    }
    return isAbsolute ? parsed.toString() : `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    if (segment === "all") return trimmed;
    const sep = trimmed.includes("?") ? "&" : "?";
    return `${trimmed}${sep}target=${encodeURIComponent(segment)}`;
  }
}

export function formatDealPriceLabel(rawWon: unknown, priceBand?: unknown): string {
  if (typeof priceBand === "string" && priceBand.includes("~") && priceBand.trim()) {
    return priceBand.trim();
  }
  const n = typeof rawWon === "number" ? rawWon : Number(rawWon);
  if (Number.isFinite(n) && n > 0) return formatPriceKo(n);
  if (typeof priceBand === "string" && priceBand.trim()) return priceBand.trim();
  return "-";
}

export function resolveNewsletterScopeUid(
  brokerIdVal?: string | null,
  brokerSlugVal?: string | null,
  fallbackUid?: string | null,
): string | null {
  return (
    normalizeWorkspaceUserId(brokerIdVal) ??
    normalizeWorkspaceUserId(fallbackUid) ??
    normalizeWorkspaceUserId(brokerSlugVal)
  );
}

export function readLastActiveSlotKey(scopeUid: string | null | undefined): string | null {
  if (typeof window === "undefined") return null;
  try {
    const uid = normalizeWorkspaceUserId(scopeUid);
    const scopedSessionKey = scopedWorkspaceStorageKey(
      LAST_ACTIVE_SLOT_SESSION_KEY,
      uid,
    );
    const scopedVal = window.sessionStorage.getItem(scopedSessionKey);
    if (scopedVal) return scopedVal;
    if (!uid) {
      return window.sessionStorage.getItem(LAST_ACTIVE_SLOT_SESSION_KEY);
    }
    return null;
  } catch {
    return null;
  }
}

export function writeLastActiveSlotKey(
  scopeUid: string | null | undefined,
  slotBaseKey: string,
): void {
  if (typeof window === "undefined") return;
  try {
    const uid = normalizeWorkspaceUserId(scopeUid);
    const scopedSessionKey = scopedWorkspaceStorageKey(
      LAST_ACTIVE_SLOT_SESSION_KEY,
      uid,
    );
    window.sessionStorage.setItem(scopedSessionKey, slotBaseKey);
    if (uid) {
      window.sessionStorage.removeItem(LAST_ACTIVE_SLOT_SESSION_KEY);
    } else if (!getLastActiveBrokerUserId()) {
      window.sessionStorage.setItem(LAST_ACTIVE_SLOT_SESSION_KEY, slotBaseKey);
    }
  } catch {
    // ignore sessionStorage errors
  }
}

export function clearLastActiveSlotKey(scopeUid: string | null | undefined): void {
  if (typeof window === "undefined") return;
  try {
    const uid = normalizeWorkspaceUserId(scopeUid);
    window.sessionStorage.removeItem(
      scopedWorkspaceStorageKey(LAST_ACTIVE_SLOT_SESSION_KEY, uid),
    );
    window.sessionStorage.removeItem(LAST_ACTIVE_SLOT_SESSION_KEY);
  } catch {
    // ignore sessionStorage errors
  }
}

export function isBrokerMismatch(
  draft: Record<string, unknown>,
  currentBrokerId: string,
  currentBrokerSlug: string,
  currentScopeUid?: string | null,
): boolean {
  const draftOwnerUid =
    typeof draft.ownerUserId === "string" ? draft.ownerUserId.trim() : "";
  const draftBrokerId = typeof draft.brokerId === "string" ? draft.brokerId.trim() : "";
  const draftBrokerSlug = typeof draft.brokerSlug === "string" ? draft.brokerSlug.trim() : "";
  const effectiveCurrentId = (currentBrokerId || currentScopeUid || "").trim();
  if (
    draftOwnerUid &&
    effectiveCurrentId &&
    draftOwnerUid !== effectiveCurrentId &&
    draftOwnerUid !== currentBrokerSlug
  ) {
    return true;
  }
  const idMismatch =
    Boolean(draftBrokerId && effectiveCurrentId) &&
    draftBrokerId !== effectiveCurrentId &&
    draftBrokerId !== currentBrokerSlug;
  const slugMismatch =
    Boolean(!draftBrokerId && draftBrokerSlug && currentBrokerSlug) &&
    draftBrokerSlug !== currentBrokerSlug &&
    draftBrokerSlug !== effectiveCurrentId;
  return idMismatch || slugMismatch;
}

export function mapServerEditionRowToSummary(
  row: Record<string, unknown>,
  currentBrokerSlug: string,
  buildPublicUrl: (params: {
    brokerSlug: string;
    issueDate?: string | null;
    fallbackAnchorDate?: string | null;
    editionId?: string | null;
    targetSegment?: NewsletterTargetSegment;
  }) => string | null,
): SavedEditionSummary {
  const content =
    row.content && typeof row.content === "object"
      ? (row.content as Record<string, unknown>)
      : {};
  const fieldNote =
    row.field_note && typeof row.field_note === "object"
      ? (row.field_note as Record<string, unknown>)
      : {};
  const rawDealIds = Array.isArray(row.featured_deal_ids)
    ? row.featured_deal_ids
    : Array.isArray(content.featured_deal_ids)
      ? content.featured_deal_ids
      : [];
  const dealIds = rawDealIds.map((d) => String(d ?? "").trim()).filter(Boolean);
  const rawComments =
    content.deal_comments && typeof content.deal_comments === "object"
      ? (content.deal_comments as Record<string, unknown>)
      : {};
  const dealCommentsMap: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawComments)) {
    if (typeof v === "string") dealCommentsMap[k] = v;
  }
  const rawIssueDate = isValidIsoDate(content.issueDate)
    ? content.issueDate.trim()
    : isValidIsoDate(content.issue_date)
      ? content.issue_date.trim()
      : isoTimestampToKstDate(row.published_at) ??
        isoTimestampToKstDate(row.created_at) ??
        "";
  const rowId = String(row.id ?? "");
  const rowSlug = String(row.edition_label ?? "");
  const parsedCadence =
    row.edition_type === "special"
      ? "special"
      : parseCadenceAnchor(
          rowSlug,
          typeof row.edition_type === "string" ? row.edition_type : null,
        ).cadence;
  const extractedTargetSegment =
    normalizeTargetSegment(
      row.target_segments ?? content.target_segment ?? content.targetSegment,
    ) ?? "all";
  const extractedSections = normalizeEditorSections(
    content.sections,
    parsedCadence === "special" ? "weekly" : parsedCadence,
  );
  const extractedMonthlyRegion = normalizeMonthlyRegion(
    content.monthlyRegion ?? content.monthly_region,
  );
  const extractedMonthlyPairId = normalizeMonthlyPairId(
    content.monthlyPairId ?? content.monthly_pair_id,
  );
  const extractedMonthlyCharts = normalizeSavedMonthlyCharts(
    content.monthlyCharts ?? content.monthly_charts,
  );
  const computedPublicUrl =
    buildPublicUrl({
      brokerSlug: currentBrokerSlug,
      issueDate: rawIssueDate,
      editionId: rowId,
      targetSegment: extractedTargetSegment,
    }) ?? undefined;

  const extractedBriefing = String(
    content.briefing_body_md ??
      row.theme_body_md ??
      fieldNote.comment ??
      content.theme_body_md ??
      content.briefing ??
      "",
  ).trim();
  const rawSummaryCandidate = String(
    content.summary ?? content.briefing ?? content.ai_briefing ?? "",
  ).trim();
  const extractedSummary =
    rawSummaryCandidate && rawSummaryCandidate !== extractedBriefing
      ? rawSummaryCandidate
      : "";
  const extractedThemeTitle = String(
    row.theme_title ?? content.briefing_title ?? content.theme_title ?? "",
  ).trim();
  const extractedUnitIssues = resolveUnitIssuesFromData(content, {
    fallbackFromTopNews: true,
  });

  return {
    id: rowId,
    slug: rowSlug,
    title: String(row.title ?? content.headline ?? "").trim(),
    status: String(row.status ?? "draft"),
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
    publishedAt: typeof row.published_at === "string" ? row.published_at : null,
    dealCount: dealIds.length,
    hasBriefing: Boolean(extractedBriefing || extractedSummary),
    summary: extractedSummary,
    briefingTitle: extractedThemeTitle,
    briefingBody: extractedBriefing,
    marketTemp:
      typeof row.market_temp === "string"
        ? (row.market_temp as MarketTemperature)
        : typeof content.market_temp === "string"
          ? (content.market_temp as MarketTemperature)
          : null,
    monthlyRegion: extractedMonthlyRegion,
    monthlyPairId: extractedMonthlyPairId,
    monthlyCharts: extractedMonthlyCharts,
    selectedDealIds: dealIds,
    dealComments: dealCommentsMap,
    unitIssues: extractedUnitIssues,
    sections: extractedSections,
    targetSegment: extractedTargetSegment,
    issueDate: rawIssueDate || undefined,
    publicUrl: computedPublicUrl,
    cadence: parsedCadence,
  };
}

export function mapBuildingRowsToAssignableDeals(
  rawList: unknown[],
): AssignableDealItem[] {
  return rawList
    .filter((b): b is Record<string, unknown> => !!b && typeof b === "object")
    .map((b, idx) => {
      const address = sanitizeDealAddress(String(b.address ?? b.dong ?? ""));
      const rawName = String(
        b.building_name ?? b.buildingName ?? b.name ?? b.title ?? "",
      ).trim();
      const title = rawName || address || `등록 매물 ${idx + 1}`;
      const yieldNum =
        typeof b.cap_rate === "number"
          ? b.cap_rate
          : typeof b.capRatePct === "number"
            ? b.capRatePct
            : typeof b.yield === "number"
              ? b.yield
              : null;
      return {
        id: String(b.id ?? `deal-${idx}`),
        title,
        address: address || "주소 미입력",
        price: formatDealPriceLabel(
          b.sale_price ?? b.askingPriceWon ?? b.price,
          b.price_band,
        ),
        yield: yieldNum && yieldNum > 0 ? `${yieldNum.toFixed(1)}%` : "-",
        photoUrl:
          typeof b.photo_url === "string" && b.photo_url.trim() ? b.photo_url : null,
      };
    });
}
