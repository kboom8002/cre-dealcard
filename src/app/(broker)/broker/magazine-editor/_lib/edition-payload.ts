import type { AssignableDealItem } from "@/components/magazine-editor/DealSlotAssigner";
import type { NewsletterTargetSegment } from "@/components/broker/studio/SendListSummaryBar";
import type { MonthlyRegionKey } from "@/domain/magazine/monthly-stats-charts";
import {
  buildDefaultMonthlyGraphicPair,
  type MonthlyChartPairId,
} from "@/domain/magazine/monthly-stats-hydration";
import type { NewsletterToneStance, SpecificNewsChannelId } from "@/domain/magazine/news-channels";
import type {
  AxiosUnitIssue,
  MarketTemperature,
  MonthlyRegionalChart,
} from "@/domain/magazine/types";
import { todayKst } from "@/lib/magazine/kst";
import type { deriveCadenceIssueMeta, NewsletterCadence } from "@/lib/magazine/newsletter-cadence";

export type CadenceIssueMeta = ReturnType<typeof deriveCadenceIssueMeta>;
import { sanitizeDealAddress } from "@/lib/magazine/view-helpers";
import {
  resolveCanonicalAreaLabel,
  resolveCanonicalDealHeadline,
} from "@/lib/deal-card/canonical-summary";
import {
  removeScopedWorkspaceKey,
  writeScopedWorkspaceJson,
} from "@/lib/workspace/storage-namespace";
import {
  LEGACY_DRAFT_STORAGE_KEY,
  appendTargetSegmentToUrl,
  buildSafePublicUrl,
  isUuidLike,
  isValidIsoDate,
  makeSlotStorageKey,
  resolveNewsletterScopeUid,
  writeLastActiveSlotKey,
  type AssignableDealWithMetrics,
  type LocalNewsletterDraft,
  type SavedEditionSummary,
} from "../_components/magazine-workspace-types";

export interface SelectedDealSnapshot {
  id: string;
  title: string;
  assetType: string;
  posture?: string;
  areaSignal?: string;
  areaLabel?: string;
  address: string;
  price: string;
  priceBand?: string;
  yield: string;
  grossYieldNetOfDeposit?: number;
  grossFloorAreaPyeong?: number;
  landAreaPyeong?: number;
  grossFloorAreaM2?: number;
  landAreaM2?: number;
  investmentPoint?: string;
  point?: string;
  photoUrl: string | null;
  hasIm?: boolean;
  dealCardUrl: string;
  imUrl?: string;
}

/**
 * 선택된 매물 목록을 뉴스레터 저장·공개 스냅샷(블라인드 입지/가격/IM 유무 분기 포함)으로 변환한다.
 */
export function buildSelectedDealSnapshots(
  selectedDealIds: readonly string[],
  deals: readonly (AssignableDealItem | AssignableDealWithMetrics)[],
  dealComments: Readonly<Record<string, string>>,
): SelectedDealSnapshot[] {
  return selectedDealIds.map((id) => {
    const d = deals.find((item) => item.id === id) as AssignableDealWithMetrics | undefined;
    const comment = dealComments[id]?.trim() || "";
    const yieldNum = d?.yield
      ? parseFloat(String(d.yield).replace(/[^0-9.]/g, ""))
      : NaN;
    const resolvedHasIm = d?.hasIm === true && isUuidLike(id);
    const safeAreaSignal = d?.areaSignal || sanitizeDealAddress(d?.address || "");
    const safeTitle = resolveCanonicalDealHeadline({
      brokerHeadline: d?.title,
      region: safeAreaSignal,
      assetType: d?.assetType,
    });
    const canonicalAreaLabel =
      resolveCanonicalAreaLabel({
        posture: d?.posture,
        explicitAreaLabel: d?.areaLabel,
        gfaSqm: d?.grossFloorAreaM2,
        landSqm: d?.landAreaM2,
        gfaPyeong: d?.grossFloorAreaPyeong,
        landPyeong: d?.landAreaPyeong,
      }) || undefined;
    return {
      id,
      title: safeTitle,
      assetType: d?.assetType || "상업용 빌딩",
      ...(d?.posture ? { posture: d.posture } : {}),
      areaSignal: safeAreaSignal || undefined,
      areaLabel: canonicalAreaLabel,
      address: d?.address || "",
      price: d?.priceBand || d?.price || "가격 문의",
      priceBand: d?.priceBand || d?.price || undefined,
      yield: d?.yield || "-",
      grossYieldNetOfDeposit:
        Number.isFinite(yieldNum) && yieldNum > 0 ? yieldNum : undefined,
      ...(typeof d?.grossFloorAreaPyeong === "number" && d.grossFloorAreaPyeong > 0
        ? { grossFloorAreaPyeong: d.grossFloorAreaPyeong }
        : {}),
      ...(typeof d?.landAreaPyeong === "number" && d.landAreaPyeong > 0
        ? { landAreaPyeong: d.landAreaPyeong }
        : {}),
      ...(typeof d?.grossFloorAreaM2 === "number" && d.grossFloorAreaM2 > 0
        ? { grossFloorAreaM2: d.grossFloorAreaM2 }
        : {}),
      ...(typeof d?.landAreaM2 === "number" && d.landAreaM2 > 0
        ? { landAreaM2: d.landAreaM2 }
        : {}),
      investmentPoint: comment || undefined,
      point: comment || undefined,
      photoUrl: d?.photoUrl || null,
      hasIm: d?.hasIm === true ? resolvedHasIm : d?.hasIm,
      dealCardUrl: `/dc/${encodeURIComponent(id)}`,
      ...(resolvedHasIm ? { imUrl: `/im-lite/${encodeURIComponent(id)}` } : {}),
    };
  });
}

/**
 * 월간(monthly) 및 시장 통계 섹션 활성 여부에 맞춰 유효한 월간 통계 차트만 추린다.
 */
export function resolvePopulatedMonthlyCharts(
  cadence: NewsletterCadence,
  sections: ReadonlyArray<{ id: string; enabled: boolean }>,
  monthlyCharts: readonly MonthlyRegionalChart[],
  monthlyRegion: MonthlyRegionKey,
  monthlyPairId: MonthlyChartPairId,
): MonthlyRegionalChart[] {
  const marketDataEnabled =
    sections.find((s) => s.id === "market_data")?.enabled !== false;
  const candidateCharts =
    monthlyCharts.length > 0
      ? monthlyCharts
      : buildDefaultMonthlyGraphicPair(monthlyRegion, monthlyPairId);
  return cadence === "monthly" && marketDataEnabled
    ? candidateCharts.filter(
        (c) =>
          c.isPlaceholder !== true &&
          Array.isArray(c.series) &&
          c.series.length > 0,
      )
    : [];
}

export interface LocalDraftRecordInput {
  brokerId: string | null;
  brokerSlug: string;
  editionId: string | null;
  slotSlug: string;
  headline: string;
  summary: string;
  briefingTitle: string;
  briefingBody: string;
  issueYear: number;
  issueMonth: number;
  cadence: NewsletterCadence;
  issueDateStr: string;
  marketTemp: MarketTemperature | null;
  toneStance?: NewsletterToneStance;
  showMarketTempBadge?: boolean;
  monthlyRegion: MonthlyRegionKey;
  monthlyPairId: MonthlyChartPairId;
  monthlyCharts: MonthlyRegionalChart[];
  selectedDealIds: string[];
  dealComments: Record<string, string>;
  preferredRegions: string[];
  preferredChannels: SpecificNewsChannelId[];
  unitIssues: AxiosUnitIssue[];
  sections: { id: string; enabled: boolean }[];
  targetSegment: NewsletterTargetSegment;
  publishedUrl: string | null;
  serverPublished: boolean;
  serverSavedDraft: boolean;
  savedAt?: string;
}

/**
 * 에디터 상태를 로컬 슬롯 스토리지(LocalNewsletterDraft) 페이로드로 직렬화한다.
 */
export function buildLocalDraftStorageRecord(
  input: LocalDraftRecordInput,
  scopeUidHint: string | null,
): { payload: LocalNewsletterDraft; activeScopeUid: string | null } {
  const activeScopeUid = resolveNewsletterScopeUid(
    input.brokerId,
    input.brokerSlug,
    scopeUidHint,
  );
  const payload: LocalNewsletterDraft = {
    ...(activeScopeUid ? { ownerUserId: activeScopeUid } : {}),
    brokerId: input.brokerId || activeScopeUid || undefined,
    brokerSlug: input.brokerSlug || undefined,
    editionId: input.editionId,
    slotSlug: input.slotSlug,
    headline: input.headline,
    summary: input.summary,
    briefingTitle: input.briefingTitle,
    briefingBody: input.briefingBody,
    issueYear: input.issueYear,
    issueMonth: input.issueMonth,
    cadence: input.cadence,
    issueDateStr: input.issueDateStr,
    marketTemp: input.marketTemp,
    toneStance: input.toneStance ?? "positive",
    showMarketTempBadge: input.showMarketTempBadge === true,
    monthlyRegion: input.monthlyRegion,
    monthlyPairId: input.monthlyPairId,
    monthlyCharts: input.monthlyCharts,
    selectedDealIds: input.selectedDealIds,
    dealComments: input.dealComments,
    preferredRegions: input.preferredRegions,
    preferredChannels: input.preferredChannels,
    unitIssues: input.unitIssues,
    sections: input.sections,
    targetSegment: input.targetSegment,
    publishedUrl: input.publishedUrl,
    serverPublished: input.serverPublished,
    serverSavedDraft: input.serverSavedDraft,
    isExplicitNewSlot: false,
    savedAt: input.savedAt ?? new Date().toISOString(),
  };
  return { payload, activeScopeUid };
}

/**
 * 슬롯 스토리지에 안전하게 기록하고 필요 시 임시 슬롯 키를 정리하며 마지막 활성 슬롯 키를 갱신한다.
 */
export function saveDraftRecordToSlots(params: {
  slotKey: string;
  removeSlotKey?: string | null;
  writeLegacyKey?: boolean;
  updateLastActive?: boolean;
  activeScopeUid: string | null;
  payload: LocalNewsletterDraft;
}): void {
  if (typeof window === "undefined") return;
  if (params.removeSlotKey && params.removeSlotKey !== params.slotKey) {
    removeScopedWorkspaceKey(params.removeSlotKey, params.activeScopeUid);
  }
  writeScopedWorkspaceJson(params.slotKey, params.activeScopeUid, params.payload);
  if (params.writeLegacyKey) {
    writeScopedWorkspaceJson(LEGACY_DRAFT_STORAGE_KEY, params.activeScopeUid, params.payload);
  }
  if (params.updateLastActive !== false) {
    writeLastActiveSlotKey(params.activeScopeUid, params.slotKey);
  }
}

export interface ServerSavePayloadInput {
  editionId: string | null;
  cadence: NewsletterCadence;
  autoMeta: CadenceIssueMeta;
  fallbackIsoDate: string;
  issueSlug: string;
  shouldSaveAsDraft: boolean;
  createDistinctIfPublished: boolean;
  headline: string;
  summary: string;
  briefingTitle: string;
  briefingBody: string;
  marketTemp: MarketTemperature | null;
  toneStance?: NewsletterToneStance;
  showMarketTempBadge?: boolean;
  monthlyRegion: MonthlyRegionKey;
  monthlyPairId: MonthlyChartPairId;
  populatedMonthlyCharts: MonthlyRegionalChart[];
  selectedDealIds: string[];
  selectedDealSnapshots: SelectedDealSnapshot[];
  dealComments: Record<string, string>;
  unitIssues: AxiosUnitIssue[];
  preferredRegions: string[];
  preferredChannels: SpecificNewsChannelId[];
  sections: { id: string; enabled: boolean }[];
  targetSegment: NewsletterTargetSegment;
}

/**
 * POST /api/magazine/issues 요청 본문을 구성한다.
 */
export function buildIssueRequestBody(input: ServerSavePayloadInput): Record<string, unknown> {
  return {
    editionId: input.editionId,
    editionType: input.cadence,
    issueAnchorDate: input.autoMeta.dateStr,
    issueDate: input.fallbackIsoDate,
    slug: input.issueSlug,
    issueNumber: input.autoMeta.issueNumber,
    year: input.autoMeta.year,
    month: input.autoMeta.month,
    saveAsDraft: input.shouldSaveAsDraft,
    status: input.shouldSaveAsDraft ? "draft" : "published",
    createDistinctIfPublished: input.createDistinctIfPublished,
    headline: input.headline.trim(),
    summary: input.summary.trim(),
    briefingTitle: input.briefingTitle.trim(),
    briefingBody: input.briefingBody.trim(),
    marketTemp: input.marketTemp,
    toneStance: input.toneStance ?? "positive",
    showMarketTempBadge: input.showMarketTempBadge === true,
    monthlyRegion: input.monthlyRegion,
    monthlyPairId: input.monthlyPairId,
    monthlyCharts: input.populatedMonthlyCharts,
    featuredDealIds: input.selectedDealIds,
    featuredDeals: input.selectedDealSnapshots,
    dealComments: input.dealComments,
    unitIssues: input.unitIssues,
    preferredRegions: input.preferredRegions,
    preferredChannels: input.preferredChannels,
    sections: input.sections,
    targetSegment: input.targetSegment,
  };
}

/**
 * 404 발행 패치(/api/magazine/editions/[id]/publish) 폴백 요청 본문을 구성한다.
 */
export function buildPublishPatchBody(
  input: Omit<
    ServerSavePayloadInput,
    | "editionId"
    | "cadence"
    | "autoMeta"
    | "issueSlug"
    | "shouldSaveAsDraft"
    | "createDistinctIfPublished"
    | "selectedDealSnapshots"
    | "preferredRegions"
    | "preferredChannels"
  > & { isPublished: boolean },
): Record<string, unknown> {
  return {
    correction: input.isPublished,
    issueDate: input.fallbackIsoDate,
    payload: {
      title: input.headline.trim(),
      market_temp: input.marketTemp,
      featured_deal_ids: input.selectedDealIds,
      target_segments: [input.targetSegment],
      theme_title: input.briefingTitle.trim() || null,
      theme_body_md: input.briefingBody.trim() || null,
      field_note: { comment: input.briefingBody.trim() },
      content: {
        headline: input.headline.trim(),
        summary: input.summary.trim(),
        briefing_title: input.briefingTitle.trim(),
        briefing_body_md: input.briefingBody.trim(),
        tone_stance: input.toneStance ?? "positive",
        show_market_temp_badge: input.showMarketTempBadge === true,
        deal_comments: input.dealComments,
        unitIssues: input.unitIssues,
        monthlyRegion: input.monthlyRegion,
        monthlyPairId: input.monthlyPairId,
        monthlyCharts: input.populatedMonthlyCharts,
        sections: input.sections,
        target_segment: input.targetSegment,
      },
    },
  };
}

/**
 * 서버 저장 응답 JSON으로부터 다음 호수 메타, 공개 URL, 목록 엔트리, 로컬 저장 페이로드를 파생한다.
 */
export function parseServerSaveSuccess(params: {
  json: Record<string, unknown> | null;
  brokerId: string | null;
  brokerSlug: string;
  scopeUidHint: string | null;
  editionId: string | null;
  issueSlug: string;
  fallbackIsoDate: string;
  shouldSaveAsDraft: boolean;
  cadence: NewsletterCadence;
  autoMeta: CadenceIssueMeta;
  headline: string;
  summary: string;
  briefingTitle: string;
  briefingBody: string;
  marketTemp: MarketTemperature | null;
  toneStance?: NewsletterToneStance;
  showMarketTempBadge?: boolean;
  monthlyRegion: MonthlyRegionKey;
  monthlyPairId: MonthlyChartPairId;
  populatedMonthlyCharts: MonthlyRegionalChart[];
  selectedDealIds: string[];
  dealComments: Record<string, string>;
  preferredRegions: string[];
  preferredChannels: SpecificNewsChannelId[];
  unitIssues: AxiosUnitIssue[];
  sections: { id: string; enabled: boolean }[];
  targetSegment: NewsletterTargetSegment;
}) {
  const { json } = params;
  const returnedSlug =
    typeof json?.brokerSlug === "string" && !isUuidLike(json.brokerSlug)
      ? json.brokerSlug.trim()
      : "";
  const effectiveBrokerSlug = returnedSlug || params.brokerSlug;
  const nextId =
    typeof json?.id === "string" && json.id
      ? json.id
      : typeof json?.editionId === "string" && json.editionId
        ? json.editionId
        : params.editionId;
  const savedEditionLabel =
    typeof json?.editionLabel === "string" && json.editionLabel.trim()
      ? json.editionLabel.trim()
      : params.issueSlug;
  const savedIssueDate = isValidIsoDate(json?.issueDate)
    ? json.issueDate
    : params.fallbackIsoDate;
  const effectiveId = nextId || `ed-${savedEditionLabel}`;

  const rawServerUrl =
    typeof json?.publicUrl === "string" && json.publicUrl.trim()
      ? json.publicUrl.trim()
      : typeof json?.url === "string" && json.url.trim()
        ? json.url.trim()
        : null;
  const resolvedUrl = params.shouldSaveAsDraft
    ? null
    : appendTargetSegmentToUrl(rawServerUrl, params.targetSegment) ||
      buildSafePublicUrl({
        brokerSlug: effectiveBrokerSlug,
        issueDate: savedIssueDate,
        fallbackAnchorDate: params.autoMeta.dateStr,
        editionId: effectiveId,
        targetSegment: params.targetSegment,
      });

  const nowIso = new Date().toISOString();
  const finalStatus: "draft" | "published" = params.shouldSaveAsDraft
    ? "draft"
    : "published";

  const nextEntry: SavedEditionSummary = {
    id: effectiveId,
    slug: savedEditionLabel,
    title: params.headline.trim() || `${params.autoMeta.yearMonthLabel} 뉴스레터`,
    status: finalStatus,
    updatedAt: nowIso,
    publishedAt: params.shouldSaveAsDraft ? null : nowIso,
    dealCount: params.selectedDealIds.length,
    hasBriefing: Boolean(params.briefingBody.trim() || params.summary.trim()),
    summary: params.summary.trim(),
    briefingTitle: params.briefingTitle.trim(),
    briefingBody: params.briefingBody.trim(),
    marketTemp: params.marketTemp,
    toneStance: params.toneStance ?? "positive",
    showMarketTempBadge: params.showMarketTempBadge === true,
    monthlyRegion: params.monthlyRegion,
    monthlyPairId: params.monthlyPairId,
    monthlyCharts: [...params.populatedMonthlyCharts],
    selectedDealIds: [...params.selectedDealIds],
    dealComments: { ...params.dealComments },
    unitIssues: [...params.unitIssues],
    sections: [...params.sections],
    targetSegment: params.targetSegment,
    issueDate: savedIssueDate,
    publicUrl: resolvedUrl ?? undefined,
    cadence: params.cadence,
  };

  const { payload: savedDraftPayload, activeScopeUid } =
    buildLocalDraftStorageRecord(
      {
        brokerId: params.brokerId,
        brokerSlug: effectiveBrokerSlug,
        editionId: effectiveId,
        slotSlug: savedEditionLabel,
        headline: params.headline.trim(),
        summary: params.summary.trim(),
        briefingTitle: params.briefingTitle.trim(),
        briefingBody: params.briefingBody.trim(),
        issueYear: params.autoMeta.year,
        issueMonth: params.autoMeta.month,
        cadence: params.cadence,
        issueDateStr: savedIssueDate,
        marketTemp: params.marketTemp,
        toneStance: params.toneStance ?? "positive",
        showMarketTempBadge: params.showMarketTempBadge === true,
        monthlyRegion: params.monthlyRegion,
        monthlyPairId: params.monthlyPairId,
        monthlyCharts: params.populatedMonthlyCharts,
        selectedDealIds: params.selectedDealIds,
        dealComments: params.dealComments,
        preferredRegions: params.preferredRegions,
        preferredChannels: params.preferredChannels,
        unitIssues: params.unitIssues,
        sections: params.sections,
        targetSegment: params.targetSegment,
        publishedUrl: resolvedUrl,
        serverPublished: !params.shouldSaveAsDraft,
        serverSavedDraft: params.shouldSaveAsDraft,
        savedAt: nowIso,
      },
      params.scopeUidHint,
    );

  const prevTempSlotKey = makeSlotStorageKey(null, params.cadence, params.issueSlug);
  const finalSlotKey = makeSlotStorageKey(effectiveId, params.cadence, savedEditionLabel);

  return {
    returnedSlug,
    nextId,
    effectiveId,
    savedEditionLabel,
    savedIssueDate,
    resolvedUrl,
    nowIso,
    nextEntry,
    activeScopeUid,
    savedDraftPayload,
    prevTempSlotKey,
    finalSlotKey,
  };
}

/**
 * 호수 요약 목록에 저장된 엔트리를 id 또는 (slug + cadence) 기준으로 업서트한다.
 */
export function upsertSavedEditionSummary(
  prev: readonly SavedEditionSummary[],
  nextEntry: SavedEditionSummary,
): SavedEditionSummary[] {
  const cadence = nextEntry.cadence ?? "monthly";
  const exists = prev.some(
    (e) =>
      e.id === nextEntry.id ||
      (e.slug === nextEntry.slug && (e.cadence ?? "monthly") === cadence),
  );
  if (exists) {
    return prev.map((e) =>
      e.id === nextEntry.id ||
      (e.slug === nextEntry.slug && (e.cadence ?? "monthly") === cadence)
        ? nextEntry
        : e,
    );
  }
  return [nextEntry, ...prev];
}

/**
 * 404 폴백 발행 응답에서 안전한 공개 URL을 추출한다.
 */
export function resolvePublishPatchSuccessUrl(params: {
  patchJson: Record<string, unknown> | null;
  brokerSlug: string;
  fallbackIsoDate: string;
  fallbackAnchorDate: string;
  editionId: string;
  targetSegment: NewsletterTargetSegment;
}): string | null {
  const { patchJson } = params;
  const serverFallbackUrl =
    typeof patchJson?.publicUrl === "string" && patchJson.publicUrl.trim()
      ? patchJson.publicUrl.trim()
      : typeof patchJson?.url === "string" && patchJson.url.trim()
        ? patchJson.url.trim()
        : null;
  return (
    appendTargetSegmentToUrl(serverFallbackUrl, params.targetSegment) ||
    buildSafePublicUrl({
      brokerSlug: params.brokerSlug,
      issueDate: params.fallbackIsoDate,
      fallbackAnchorDate: params.fallbackAnchorDate,
      editionId: params.editionId,
      targetSegment: params.targetSegment,
    })
  );
}

/**
 * 안전 기준 발행일(YYYY-MM-DD KST)을 반환한다.
 */
export function resolveFallbackIssueIsoDate(
  issueDateStr: string,
  autoDateStr: string,
): string {
  return isValidIsoDate(issueDateStr)
    ? issueDateStr
    : isValidIsoDate(autoDateStr)
      ? autoDateStr
      : todayKst();
}

/**
 * 서버 임시저장 부트스트랩 직후 SavedEditionSummary 목록에 업서트한다.
 */
export function upsertBootstrappedDraftSummary(
  prev: readonly SavedEditionSummary[],
  params: {
    editionId: string;
    editionLabel: string;
    nowIso: string;
    headline: string;
    yearMonthLabel: string;
    summary: string;
    briefingTitle: string;
    briefingBody: string;
    marketTemp: MarketTemperature | null;
    toneStance?: NewsletterToneStance;
    showMarketTempBadge?: boolean;
    monthlyRegion: MonthlyRegionKey;
    monthlyPairId: MonthlyChartPairId;
    monthlyCharts: MonthlyRegionalChart[];
    selectedDealIds: string[];
    dealComments: Record<string, string>;
    unitIssues: AxiosUnitIssue[];
    sections: { id: string; enabled: boolean }[];
    targetSegment: NewsletterTargetSegment;
    issueDateStr: string;
    cadence: NewsletterCadence;
  },
): SavedEditionSummary[] {
  const nextEntry: SavedEditionSummary = {
    id: params.editionId,
    slug: params.editionLabel,
    title: params.headline.trim() || `${params.yearMonthLabel} 뉴스레터`,
    status: "draft",
    updatedAt: params.nowIso,
    publishedAt: null,
    dealCount: params.selectedDealIds.length,
    hasBriefing: Boolean(params.briefingBody.trim() || params.summary.trim()),
    summary: params.summary.trim(),
    briefingTitle: params.briefingTitle.trim(),
    briefingBody: params.briefingBody.trim(),
    marketTemp: params.marketTemp,
    toneStance: params.toneStance ?? "positive",
    showMarketTempBadge: params.showMarketTempBadge === true,
    monthlyRegion: params.monthlyRegion,
    monthlyPairId: params.monthlyPairId,
    monthlyCharts: [...params.monthlyCharts],
    selectedDealIds: [...params.selectedDealIds],
    dealComments: { ...params.dealComments },
    unitIssues: [...params.unitIssues],
    sections: [...params.sections],
    targetSegment: params.targetSegment,
    issueDate: params.issueDateStr,
    cadence: params.cadence,
  };
  const exists = prev.some((e) => e.id === params.editionId);
  return exists
    ? prev.map((e) => (e.id === params.editionId ? nextEntry : e))
    : [nextEntry, ...prev];
}

/**
 * 디바운스 자동저장 동기화 후 현재 회차 요약 항목을 최신화한다.
 */
export function applyServerDraftSyncedUpdate(
  prev: readonly SavedEditionSummary[],
  params: {
    editionId: string;
    isoStr: string;
    headline: string;
    summary: string;
    briefingTitle: string;
    briefingBody: string;
    marketTemp: MarketTemperature | null;
    toneStance?: NewsletterToneStance;
    showMarketTempBadge?: boolean;
    selectedDealIds: string[];
    dealComments: Record<string, string>;
    unitIssues: AxiosUnitIssue[];
    sections: { id: string; enabled: boolean }[];
    targetSegment: NewsletterTargetSegment;
  },
): SavedEditionSummary[] {
  return prev.map((e) =>
    e.id === params.editionId
      ? {
          ...e,
          title: params.headline.trim() || e.title,
          updatedAt: params.isoStr,
          dealCount: params.selectedDealIds.length,
          hasBriefing: Boolean(params.briefingBody.trim() || params.summary.trim()),
          summary: params.summary.trim(),
          briefingTitle: params.briefingTitle.trim(),
          briefingBody: params.briefingBody.trim(),
          marketTemp: params.marketTemp,
          ...(params.toneStance ? { toneStance: params.toneStance } : {}),
          ...(params.showMarketTempBadge !== undefined
            ? { showMarketTempBadge: params.showMarketTempBadge }
            : {}),
          selectedDealIds: [...params.selectedDealIds],
          dealComments: { ...params.dealComments },
          unitIssues: [...params.unitIssues],
          sections: [...params.sections],
          targetSegment: params.targetSegment,
        }
      : e,
  );
}

