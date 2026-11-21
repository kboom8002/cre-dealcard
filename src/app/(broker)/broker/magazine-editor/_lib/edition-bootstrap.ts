import type { NewsletterTargetSegment } from "@/components/broker/studio/SendListSummaryBar";
import {
  DEFAULT_PREFERRED_CHANNELS,
  DEFAULT_PREFERRED_REGIONS,
  normalizeBrokerPreferences,
} from "@/domain/magazine/broker-preferences";
import {
  clusterArticlesIntoFiveIssues,
  resolveUnitIssuesFromData,
} from "@/domain/magazine/issue-clustering";
import type { MonthlyRegionKey } from "@/domain/magazine/monthly-stats-charts";
import {
  buildDefaultMonthlyGraphicPair,
  type MonthlyChartPairId,
} from "@/domain/magazine/monthly-stats-hydration";
import {
  CURATED_CHANNEL_POOL,
  resolveNewsChannel,
  type NewsChannelId,
  type NewsPoolItem,
  type SpecificNewsChannelId,
} from "@/domain/magazine/news-channels";
import type {
  AxiosUnitIssue,
  MarketTemperature,
  MonthlyRegionalChart,
} from "@/domain/magazine/types";
import { kstParts, toKstDate, todayKst } from "@/lib/magazine/kst";
import {
  deriveCadenceIssueMeta,
  normalizeNewsletterCadence,
  parseCadenceAnchor,
  type NewsletterCadence,
} from "@/lib/magazine/newsletter-cadence";
import {
  readScopedWorkspaceJson,
  removeScopedWorkspaceKey,
  writeScopedWorkspaceJson,
} from "@/lib/workspace/storage-namespace";
import {
  LEGACY_DRAFT_STORAGE_KEY,
  SLOT_DRAFT_PREFIX,
  appendTargetSegmentToUrl,
  buildDefaultEditorSections,
  buildSafePublicUrl,
  isBrokerMismatch,
  isValidIsoDate,
  makeSlotStorageKey,
  normalizeEditorSections,
  normalizeMonthlyPairId,
  normalizeMonthlyRegion,
  normalizeSavedMonthlyCharts,
  normalizeTargetSegment,
  readLastActiveSlotKey,
  resolveNewsletterScopeUid,
  writeLastActiveSlotKey,
  type SavedEditionSummary,
} from "../_components/magazine-workspace-types";

export interface ParsedHydratedDraftResult {
  isExplicitNewSlot: boolean;
  cadence: NewsletterCadence;
  issueYear?: number;
  issueMonth?: number;
  issueDateStr?: string;
  slotSlug: string | null;
  hasSlotSlug: boolean;
  headline?: string;
  summary?: string;
  briefingTitle?: string;
  briefingBody?: string;
  hasMarketTemp: boolean;
  marketTemp: MarketTemperature | null;
  monthlyRegion: MonthlyRegionKey;
  monthlyPairId: MonthlyChartPairId;
  monthlyCharts: MonthlyRegionalChart[];
  sections: { id: string; enabled: boolean }[];
  targetSegment?: NewsletterTargetSegment;
  selectedDealIds?: string[];
  dealComments?: Record<string, string>;
  preferredPrefs?: {
    preferredRegions: string[];
    preferredChannels: SpecificNewsChannelId[];
  };
  unitIssuesUpdate?: {
    issues: AxiosUnitIssue[];
    markRestored: boolean;
  };
  editionIdUpdate?: {
    hasValue: boolean;
    value: string | null;
  };
  syncStatus: "published" | "server_draft" | "local_dirty";
  publishedUrl?: string;
  savedAt?: string;
}

/**
 * 로컬/스토리지 초안 레코드를 에디터 상태로 안전하게 정규화·해석한다.
 */
export function parseHydratedDraftData(
  parsed: Record<string, unknown>,
): ParsedHydratedDraftResult {
  const nextCadence =
    typeof parsed.cadence === "string"
      ? normalizeNewsletterCadence(parsed.cadence)
      : "monthly";
  const parsedPrefs =
    Array.isArray(parsed.preferredRegions) && parsed.preferredRegions.length > 0
      ? normalizeBrokerPreferences({
          preferredRegions: parsed.preferredRegions,
          preferredChannels: parsed.preferredChannels,
        })
      : {
          preferredRegions: [...DEFAULT_PREFERRED_REGIONS],
          preferredChannels: [...DEFAULT_PREFERRED_CHANNELS],
        };

  if (parsed.isExplicitNewSlot === true) {
    return {
      isExplicitNewSlot: true,
      cadence: nextCadence,
      issueYear: typeof parsed.issueYear === "number" ? parsed.issueYear : undefined,
      issueMonth: typeof parsed.issueMonth === "number" ? parsed.issueMonth : undefined,
      issueDateStr: isValidIsoDate(parsed.issueDateStr) ? parsed.issueDateStr : undefined,
      hasSlotSlug: true,
      slotSlug:
        typeof parsed.slotSlug === "string" && parsed.slotSlug.trim()
          ? parsed.slotSlug.trim()
          : null,
      hasMarketTemp: true,
      marketTemp: null,
      monthlyRegion: "gbd",
      monthlyPairId: "molit_bok",
      monthlyCharts: buildDefaultMonthlyGraphicPair("gbd", "molit_bok"),
      sections: buildDefaultEditorSections(nextCadence),
      unitIssuesUpdate: {
        issues: clusterArticlesIntoFiveIssues(CURATED_CHANNEL_POOL, {
          cadence: nextCadence,
          preferredRegions: parsedPrefs.preferredRegions,
          preferredChannels: parsedPrefs.preferredChannels,
        }),
        markRestored: false,
      },
      syncStatus: "server_draft",
    };
  }

  const normMonthly = normalizeMonthlyRegion(parsed.monthlyRegion) ?? "gbd";
  const normPair = normalizeMonthlyPairId(parsed.monthlyPairId);
  const restoredCharts = normalizeSavedMonthlyCharts(parsed.monthlyCharts);
  const normSections = normalizeEditorSections(parsed.sections, nextCadence);
  const effectiveSections = normSections ?? buildDefaultEditorSections(nextCadence);

  let restoredComments: Record<string, string> | undefined;
  if (parsed.dealComments && typeof parsed.dealComments === "object") {
    restoredComments = {};
    for (const [k, v] of Object.entries(parsed.dealComments as Record<string, unknown>)) {
      if (typeof v === "string") restoredComments[k] = v;
    }
  }

  const newsEnabledInDraft = effectiveSections.some(
    (s) => s.id === "news_curation" && s.enabled,
  );
  const hasSavedServerEdition =
    typeof parsed.editionId === "string" && parsed.editionId.trim().length > 0;

  let unitIssuesUpdate: ParsedHydratedDraftResult["unitIssuesUpdate"];
  if (Array.isArray(parsed.unitIssues)) {
    if (parsed.unitIssues.length > 0) {
      const restoredIssues = resolveUnitIssuesFromData(
        { unitIssues: parsed.unitIssues },
        { fallbackFromTopNews: false },
      );
      if (restoredIssues.length > 0) {
        unitIssuesUpdate = { issues: restoredIssues, markRestored: true };
      }
    } else if (!hasSavedServerEdition && newsEnabledInDraft) {
      unitIssuesUpdate = {
        issues: clusterArticlesIntoFiveIssues(CURATED_CHANNEL_POOL, {
          cadence: nextCadence,
          preferredRegions: parsedPrefs.preferredRegions,
          preferredChannels: parsedPrefs.preferredChannels,
        }),
        markRestored: true,
      };
    } else {
      unitIssuesUpdate = { issues: [], markRestored: true };
    }
  }

  let editionIdUpdate: ParsedHydratedDraftResult["editionIdUpdate"];
  if (typeof parsed.editionId === "string" && parsed.editionId) {
    editionIdUpdate = { hasValue: true, value: parsed.editionId };
  } else if (parsed.editionId === null) {
    editionIdUpdate = { hasValue: true, value: null };
  }

  const syncStatus: ParsedHydratedDraftResult["syncStatus"] =
    parsed.serverPublished === true
      ? "published"
      : parsed.serverSavedDraft === true
        ? "server_draft"
        : "local_dirty";

  return {
    isExplicitNewSlot: false,
    cadence: nextCadence,
    issueYear: typeof parsed.issueYear === "number" ? parsed.issueYear : undefined,
    issueMonth: typeof parsed.issueMonth === "number" ? parsed.issueMonth : undefined,
    issueDateStr: isValidIsoDate(parsed.issueDateStr) ? parsed.issueDateStr : undefined,
    hasSlotSlug: true,
    slotSlug:
      typeof parsed.slotSlug === "string" && parsed.slotSlug.trim()
        ? parsed.slotSlug.trim()
        : null,
    headline: typeof parsed.headline === "string" ? parsed.headline : undefined,
    summary: typeof parsed.summary === "string" ? parsed.summary : undefined,
    briefingTitle: typeof parsed.briefingTitle === "string" ? parsed.briefingTitle : undefined,
    briefingBody: typeof parsed.briefingBody === "string" ? parsed.briefingBody : undefined,
    hasMarketTemp: typeof parsed.marketTemp === "string" || parsed.marketTemp === null,
    marketTemp: (parsed.marketTemp as MarketTemperature | null) ?? null,
    monthlyRegion: normMonthly,
    monthlyPairId: normPair,
    monthlyCharts: restoredCharts ?? buildDefaultMonthlyGraphicPair(normMonthly, normPair),
    sections: effectiveSections,
    targetSegment: normalizeTargetSegment(parsed.targetSegment),
    selectedDealIds: Array.isArray(parsed.selectedDealIds)
      ? parsed.selectedDealIds.filter((v): v is string => typeof v === "string")
      : undefined,
    dealComments: restoredComments,
    preferredPrefs:
      Array.isArray(parsed.preferredRegions) && parsed.preferredRegions.length > 0
        ? normalizeBrokerPreferences({
            preferredRegions: parsed.preferredRegions,
            preferredChannels: parsed.preferredChannels,
          })
        : undefined,
    unitIssuesUpdate,
    editionIdUpdate,
    syncStatus,
    publishedUrl:
      typeof parsed.publishedUrl === "string" && parsed.publishedUrl
        ? parsed.publishedUrl
        : undefined,
    savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : undefined,
  };
}

/**
 * URL 파라미터 및 세션 슬롯 키를 기준으로 초기 로컬 초안을 탐색한다.
 */
export function findScopedInitialDraftRecord(params: {
  initialUrlEditionId: string | null;
  initialUrlCadence: string | null;
  targetScopeUid: string | null;
}): { draft: Record<string, unknown> | null; key: string | null } {
  const { initialUrlEditionId, initialUrlCadence, targetScopeUid } = params;
  let draft: Record<string, unknown> | null = null;
  let key: string | null = null;
  if (typeof window === "undefined") return { draft, key };

  if (initialUrlEditionId) {
    const urlSlotKey = `${SLOT_DRAFT_PREFIX}${initialUrlEditionId}`;
    const candUrl = readScopedWorkspaceJson<Record<string, unknown> | null>(
      urlSlotKey,
      targetScopeUid,
      null,
    );
    if (candUrl) {
      draft = candUrl;
      key = urlSlotKey;
    }
  }
  const explicitUrlCadence =
    !initialUrlEditionId &&
    (initialUrlCadence === "daily" ||
      initialUrlCadence === "weekly" ||
      initialUrlCadence === "monthly")
      ? initialUrlCadence
      : null;

  if (!draft) {
    const lastSessionKey = readLastActiveSlotKey(targetScopeUid);
    if (lastSessionKey) {
      const candidateDraft = readScopedWorkspaceJson<Record<string, unknown> | null>(
        lastSessionKey,
        targetScopeUid,
        null,
      );
      if (candidateDraft) {
        const candCadence =
          typeof candidateDraft.cadence === "string"
            ? normalizeNewsletterCadence(candidateDraft.cadence)
            : null;
        if (!explicitUrlCadence || candCadence === explicitUrlCadence) {
          draft = candidateDraft;
          key = lastSessionKey;
        }
      }
    }
  }
  if (!draft && !initialUrlEditionId) {
    const candidateLegacy = readScopedWorkspaceJson<Record<string, unknown> | null>(
      LEGACY_DRAFT_STORAGE_KEY,
      targetScopeUid,
      null,
    );
    if (candidateLegacy) {
      const candCadence =
        typeof candidateLegacy.cadence === "string"
          ? normalizeNewsletterCadence(candidateLegacy.cadence)
          : null;
      if (!explicitUrlCadence || candCadence === explicitUrlCadence) {
        draft = candidateLegacy;
        key = LEGACY_DRAFT_STORAGE_KEY;
      }
    }
  }
  if (!draft && !initialUrlEditionId) {
    const defaultCadence =
      initialUrlCadence === "daily" ||
      initialUrlCadence === "weekly" ||
      initialUrlCadence === "monthly"
        ? initialUrlCadence
        : "monthly";
    const defaultSlug = deriveCadenceIssueMeta(defaultCadence, {
      year: kstParts().year,
      month: kstParts().month,
      dateStr: todayKst(),
    }).slug;
    const defaultSlotKey = makeSlotStorageKey(null, defaultCadence, defaultSlug);
    const candidateDefault = readScopedWorkspaceJson<Record<string, unknown> | null>(
      defaultSlotKey,
      targetScopeUid,
      null,
    );
    if (candidateDefault) {
      draft = candidateDefault;
      key = defaultSlotKey;
    }
  }
  return { draft, key };
}

/**
 * 저장된 회차 요약을 에디터 상태 필드로 변환한다.
 */
export function resolveAppliedEditionFields(
  ed: SavedEditionSummary,
  activeBrokerSlug: string,
) {
  const anchor = parseCadenceAnchor(
    ed.slug,
    ed.cadence === "special" ? "weekly" : ed.cadence,
  );
  const nextRegion: MonthlyRegionKey = ed.monthlyRegion ?? "gbd";
  const nextPair: MonthlyChartPairId = ed.monthlyPairId ?? "molit_bok";
  const resolvedSeg = ed.targetSegment ?? "all";
  const resolvedPubUrl =
    appendTargetSegmentToUrl(ed.publicUrl, resolvedSeg) ||
    buildSafePublicUrl({
      brokerSlug: activeBrokerSlug,
      issueDate:
        ed.issueDate ||
        (ed.publishedAt && !Number.isNaN(new Date(ed.publishedAt).getTime())
          ? toKstDate(new Date(ed.publishedAt))
          : undefined),
      fallbackAnchorDate: anchor.dateStr,
      editionId: ed.id,
      targetSegment: resolvedSeg,
    });
  const publishedFlag = ed.status === "published";

  return {
    anchor,
    issueDateStr: isValidIsoDate(ed.issueDate) ? ed.issueDate : anchor.dateStr,
    headline: ed.title ?? "",
    summary: typeof ed.summary === "string" ? ed.summary : "",
    briefingTitle: typeof ed.briefingTitle === "string" ? ed.briefingTitle : "",
    briefingBody: typeof ed.briefingBody === "string" ? ed.briefingBody : "",
    marketTemp: ed.marketTemp ?? null,
    nextRegion,
    nextPair,
    monthlyCharts:
      ed.monthlyCharts && ed.monthlyCharts.length > 0
        ? [...ed.monthlyCharts]
        : buildDefaultMonthlyGraphicPair(nextRegion, nextPair),
    selectedDealIds: Array.isArray(ed.selectedDealIds) ? ed.selectedDealIds : [],
    dealComments:
      ed.dealComments && typeof ed.dealComments === "object" ? ed.dealComments : {},
    unitIssues: Array.isArray(ed.unitIssues) ? ed.unitIssues : [],
    sections: ed.sections ? [...ed.sections] : buildDefaultEditorSections(anchor.cadence),
    resolvedSeg,
    resolvedPubUrl,
    publishedFlag,
    lastSavedAt: ed.updatedAt ?? ed.publishedAt,
  };
}

/**
 * 새로 작성하기 슬롯 마커를 로컬 스토리지에 기록하고 키를 반환한다.
 */
export function writeExplicitNewSlotMarker(params: {
  brokerId: string | null;
  brokerSlug: string;
  scopeUidHint: string | null;
  nextCadence: NewsletterCadence;
  targetSlotSlug: string;
  year: number;
  month: number;
  dateStr: string;
}): string | null {
  if (typeof window === "undefined") return null;
  const activeScopeUid = resolveNewsletterScopeUid(
    params.brokerId,
    params.brokerSlug,
    params.scopeUidHint,
  );
  const newSlotKey = makeSlotStorageKey(null, params.nextCadence, params.targetSlotSlug);
  removeScopedWorkspaceKey(LEGACY_DRAFT_STORAGE_KEY, activeScopeUid);
  writeScopedWorkspaceJson(newSlotKey, activeScopeUid, {
    ...(activeScopeUid ? { ownerUserId: activeScopeUid } : {}),
    brokerId: params.brokerId || activeScopeUid || undefined,
    brokerSlug: params.brokerSlug || undefined,
    editionId: null,
    slotSlug: params.targetSlotSlug,
    cadence: params.nextCadence,
    issueYear: params.year,
    issueMonth: params.month,
    issueDateStr: params.dateStr,
    isExplicitNewSlot: true,
    savedAt: new Date().toISOString(),
  });
  writeLastActiveSlotKey(activeScopeUid, newSlotKey);
  return newSlotKey;
}

/**
 * 실시간 뉴스 새로고침 결과를 기존 뉴스 풀에 중복 없이 병합한다.
 */
export function mergeIncomingNewsPool(
  prev: readonly NewsPoolItem[],
  incoming: readonly NewsPoolItem[],
  channel: NewsChannelId,
): NewsPoolItem[] {
  const incomingKeys = new Set(
    incoming.map((item) => String(item.id ?? item.title ?? "").trim()),
  );
  if (channel === "all") {
    const retained = prev.filter(
      (item) => !incomingKeys.has(String(item.id ?? item.title ?? "").trim()),
    );
    return [...incoming, ...retained];
  }
  const retainedOtherChannels = prev.filter((item) => {
    const key = String(item.id ?? item.title ?? "").trim();
    if (incomingKeys.has(key)) return false;
    return resolveNewsChannel(item) !== channel;
  });
  return [...incoming, ...retainedOtherChannels];
}

/**
 * 서버 자동저장 동기화 완료 후 해당 슬롯 스토리지의 `serverSavedDraft` 플래그를 갱신한다.
 */
export function markSlotSyncedOnServer(params: {
  brokerId: string | null;
  brokerSlug: string;
  scopeUidHint: string | null;
  editionId: string | null;
  cadence: NewsletterCadence;
  effectiveSlotSlug: string;
  isoStr: string;
}): void {
  if (typeof window === "undefined") return;
  const activeScopeUid = resolveNewsletterScopeUid(
    params.brokerId,
    params.brokerSlug,
    params.scopeUidHint,
  );
  const slotKey = makeSlotStorageKey(
    params.editionId,
    params.cadence,
    params.effectiveSlotSlug,
  );
  const existing = readScopedWorkspaceJson<Record<string, unknown> | null>(
    slotKey,
    activeScopeUid,
    null,
  );
  if (existing) {
    writeScopedWorkspaceJson(slotKey, activeScopeUid, {
      ...existing,
      editionId: params.editionId,
      serverSavedDraft: true,
      savedAt: params.isoStr,
    });
  }
}

/**
 * 계정이 다르거나 만료된 레거시 무네임스페이스 로컬 초안 키를 정리한다.
 */
export function purgeMismatchedLegacyDraftKeys(params: {
  initialDraftKey: string | null;
  currentBrokerId: string;
  currentBrokerSlug: string;
  verifiedScopeUid: string | null;
}): boolean {
  if (typeof window === "undefined") return false;
  const keysToDelete: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (
      k &&
      !k.includes(":u:") &&
      (k === LEGACY_DRAFT_STORAGE_KEY || k.startsWith(SLOT_DRAFT_PREFIX))
    ) {
      const rawItem = window.localStorage.getItem(k);
      if (rawItem) {
        const parsedItem = JSON.parse(rawItem) as Record<string, unknown>;
        if (
          isBrokerMismatch(
            parsedItem,
            params.currentBrokerId,
            params.currentBrokerSlug,
            params.verifiedScopeUid,
          )
        ) {
          keysToDelete.push(k);
        }
      }
    }
  }
  let purgedActiveDraft = false;
  for (const k of keysToDelete) {
    window.localStorage.removeItem(k);
    if (k === params.initialDraftKey) {
      purgedActiveDraft = true;
    }
  }
  return purgedActiveDraft;
}

