"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  Copy,
  FilePlus2,
  Loader2,
  MessageCircle,
  Send,
  Sparkles,
} from "lucide-react";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import { UndoToastProvider } from "@/components/workspace/UndoConfirmToast";
import {
  IssueMetadataForm,
  deriveAutoIssueMeta,
  parseYearMonthFromSlug,
  type AutoIssueMetadata,
} from "@/components/magazine-editor/IssueMetadataForm";
import {
  BlockSelectionGrid,
  DEFAULT_NEWSLETTER_BLOCKS,
} from "@/components/magazine-editor/BlockSelectionGrid";
import {
  DealSlotAssigner,
  type AssignableDealItem,
} from "@/components/magazine-editor/DealSlotAssigner";
import {
  MagazinePublishChecklist,
  getNextPublishHint,
} from "@/components/magazine-editor/MagazinePublishChecklist";
import {
  MagazineQuickDraftCard,
  type MagazineDraftSnapshot,
} from "@/components/broker/studio/MagazineQuickDraftCard";
import {
  SendListSummaryBar,
  type NewsletterTargetSegment,
} from "@/components/broker/studio/SendListSummaryBar";
import { AiCommentRecommendButton } from "@/components/broker/studio/AiCommentRecommendButton";
import {
  getMonthlyChartsForRegion,
  MONTHLY_REGION_PRESETS,
  MONTHLY_STATS_PLACEHOLDER_MESSAGE,
  MONTHLY_STATS_PREPARING_LABEL,
  type MonthlyRegionKey,
} from "@/domain/magazine/monthly-stats-charts";
import {
  SIMPLE_FORMAT_ACTIONS,
  applySimpleTextFormat,
  normalizeReadableBriefingText,
  type SimpleFormatActionId,
} from "@/lib/magazine/simple-format";
import {
  POST_IT_TONE_META,
  clusterArticlesIntoFiveIssues,
  formatAxiosCardTitle,
  formatAxiosTwoLineBrief,
  formatSingleLineTitle,
  resolveUnitIssuesFromData,
} from "@/domain/magazine/issue-clustering";
import {
  BROKER_REGION_PRESETS,
  DEFAULT_PREFERRED_CHANNELS,
  DEFAULT_PREFERRED_REGIONS,
  normalizeBrokerPreferences,
} from "@/domain/magazine/broker-preferences";
import {
  CURATED_CHANNEL_POOL,
  NEWS_CHANNEL_MAP,
  SPECIFIC_NEWS_CHANNELS,
  type NewsChannelId,
  type NewsPoolItem,
  type SpecificNewsChannelId,
} from "@/domain/magazine/news-channels";
import { AxiosIssuesEditorPanel } from "@/components/magazine-editor/AxiosIssuesEditorPanel";
import type { AxiosUnitIssue, EditionType, MarketTemperature } from "@/domain/magazine/types";
import { copyText, COPY_FAILED_MESSAGE } from "@/lib/ux/clipboard";
import { shareKakaoFeed, getSiteOrigin } from "@/lib/kakao/share";
import { MAGAZINE_SEND_DAY_LABEL } from "@/lib/magazine/schedule-labels";
import { formatPriceKo, sanitizeDealAddress } from "@/lib/magazine/view-helpers";
import type { HonestSaveState } from "@/lib/ux/lexicon";

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

const STEP_TABS: readonly {
  key: NewsletterStepKey;
  label: string;
  shortDesc: string;
}[] = [
  { key: "title", label: "① 제목", shortDesc: "연·월 선택 및 표지 제목" },
  { key: "content", label: "② 내용", shortDesc: "시장 브리핑과 추천 매물" },
  { key: "send", label: "③ 보내기", shortDesc: "받을 고객 확인 및 발송" },
] as const;

interface SavedEditionSummary {
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
  selectedDealIds?: string[];
  dealComments?: Record<string, string>;
  unitIssues?: AxiosUnitIssue[];
  issueDate?: string;
  publicUrl?: string;
}

const LOCAL_DRAFT_STORAGE_KEY = "cre-newsletter-local-draft-v2";

function formatDealPriceLabel(rawWon: unknown, priceBand?: unknown): string {
  const n = typeof rawWon === "number" ? rawWon : Number(rawWon);
  if (Number.isFinite(n) && n > 0) return formatPriceKo(n);
  if (typeof priceBand === "string" && priceBand.trim()) return priceBand.trim();
  return "-";
}

export default function MagazineEditorPage() {
  // ── 1. 단계 및 기본 메타 상태 ──
  const [activeStep, setActiveStep] = useState<NewsletterStepKey>("title");
  const [issueYear, setIssueYear] = useState<number>(2026);
  const [issueMonth, setIssueMonth] = useState<number>(11);
  const autoMeta = useMemo(
    () => deriveAutoIssueMeta(issueYear, issueMonth),
    [issueYear, issueMonth],
  );

  // ── 2. 뉴스레터 통합 초안 상태 ──
  const [editionId, setEditionId] = useState<string | null>(null);
  const [brokerSlug, setBrokerSlug] = useState<string>("");
  const [brokerName, setBrokerName] = useState<string>("");
  const [headline, setHeadline] = useState<string>("");
  const [summary, setSummary] = useState<string>("");
  const [briefingTitle, setBriefingTitle] = useState<string>("");
  const [briefingBody, setBriefingBody] = useState<string>("");
  const [regionFocus, setRegionFocus] = useState<string>("강남·서초");
  const [monthlyRegion, setMonthlyRegion] = useState<MonthlyRegionKey>("gbd");
  const [marketTemp, setMarketTemp] = useState<MarketTemperature | null>(null);

  // ── 3. 매물·코너·발송 대상·중개사 개인 설정 상태 ──
  const [preferredRegions, setPreferredRegions] = useState<string[]>(() => [
    ...DEFAULT_PREFERRED_REGIONS,
  ]);
  const [preferredChannels, setPreferredChannels] = useState<SpecificNewsChannelId[]>(() => [
    ...DEFAULT_PREFERRED_CHANNELS,
  ]);
  const [newsPool, setNewsPool] = useState<NewsPoolItem[]>(() => [...CURATED_CHANNEL_POOL]);
  const [unitIssues, setUnitIssues] = useState<AxiosUnitIssue[]>(() =>
    clusterArticlesIntoFiveIssues(CURATED_CHANNEL_POOL, {
      cadence: "monthly",
      preferredRegions: DEFAULT_PREFERRED_REGIONS,
      preferredChannels: DEFAULT_PREFERRED_CHANNELS,
    }),
  );
  const [savingPrefs, setSavingPrefs] = useState<boolean>(false);
  const [isAiClustering, setIsAiClustering] = useState<boolean>(false);
  const [deals, setDeals] = useState<AssignableDealItem[]>([]);
  const [selectedDealIds, setSelectedDealIds] = useState<string[]>([]);
  const [dealComments, setDealComments] = useState<Record<string, string>>({});
  const [sections, setSections] = useState<{ id: string; enabled: boolean }[]>(() =>
    DEFAULT_NEWSLETTER_BLOCKS.map((b) => ({
      id: b.id,
      enabled: b.id !== "market_data",
    })),
  );
  const [targetSegment, setTargetSegment] = useState<NewsletterTargetSegment>("all");
  const [editions, setEditions] = useState<SavedEditionSummary[]>([]);
  const [subscriberCount, setSubscriberCount] = useState<number>(0);
  const [highInterestCount, setHighInterestCount] = useState<number>(0);

  // ── 4. 정직한 저장·발행·발송 상태 (NL-03, NL-04, NL-05) ──
  const [saveState, setSaveState] = useState<HonestSaveState>("idle");
  const [localStorageMode, setLocalStorageMode] = useState<"none" | "local_only">("none");
  const [lastSavedAt, setLastSavedAt] = useState<Date | string | null>(null);
  const [isPublished, setIsPublished] = useState<boolean>(false);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  const [sending, setSending] = useState<boolean>(false);
  const [statusBanner, setStatusBanner] = useState<{
    tone: "success" | "error" | "info";
    message: string;
  } | null>(null);

  const briefingTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const hydratedRef = useRef(false);

  // ── 5. 초기 데이터 및 로컬 초안 복원 (불필요 초기 API 호출 제거) ──
  useEffect(() => {
    let mounted = true;

    try {
      const savedRaw =
        typeof window !== "undefined"
          ? window.localStorage.getItem(LOCAL_DRAFT_STORAGE_KEY)
          : null;
      if (savedRaw) {
        const parsed = JSON.parse(savedRaw) as Record<string, unknown>;
        if (typeof parsed.headline === "string") setHeadline(parsed.headline);
        if (typeof parsed.summary === "string") setSummary(parsed.summary);
        if (typeof parsed.briefingTitle === "string") setBriefingTitle(parsed.briefingTitle);
        if (typeof parsed.briefingBody === "string") setBriefingBody(parsed.briefingBody);
        if (typeof parsed.issueYear === "number") setIssueYear(parsed.issueYear);
        if (typeof parsed.issueMonth === "number") setIssueMonth(parsed.issueMonth);
        if (Array.isArray(parsed.selectedDealIds)) {
          setSelectedDealIds(parsed.selectedDealIds.filter((v): v is string => typeof v === "string"));
        }
        if (parsed.dealComments && typeof parsed.dealComments === "object") {
          const restoredComments: Record<string, string> = {};
          for (const [k, v] of Object.entries(parsed.dealComments as Record<string, unknown>)) {
            if (typeof v === "string") restoredComments[k] = v;
          }
          setDealComments(restoredComments);
        }
        if (Array.isArray(parsed.preferredRegions) && parsed.preferredRegions.length > 0) {
          const normPrefs = normalizeBrokerPreferences({
            preferredRegions: parsed.preferredRegions,
            preferredChannels: parsed.preferredChannels,
          });
          setPreferredRegions(normPrefs.preferredRegions);
          setPreferredChannels(normPrefs.preferredChannels);
          setRegionFocus(normPrefs.preferredRegions.join(", "));
        }
        if (Array.isArray(parsed.unitIssues) && parsed.unitIssues.length > 0) {
          const restoredIssues = resolveUnitIssuesFromData(
            { unitIssues: parsed.unitIssues },
            { fallbackFromTopNews: false },
          );
          if (restoredIssues.length > 0) setUnitIssues(restoredIssues);
        }
        if (parsed.serverPublished === true) {
          if (typeof parsed.editionId === "string" && parsed.editionId) {
            setEditionId(parsed.editionId);
          }
          if (typeof parsed.publishedUrl === "string" && parsed.publishedUrl) {
            setPublishedUrl(parsed.publishedUrl);
          }
          setIsPublished(true);
          setLocalStorageMode("none");
          setSaveState("saved");
          if (typeof parsed.savedAt === "string") setLastSavedAt(parsed.savedAt);
        } else {
          setLocalStorageMode("local_only");
          setSaveState("dirty");
        }
      }
    } catch {
      // localStorage 사용 불가 환경 무시
    }

    async function loadInitialWorkspace() {
      if (typeof fetch === "undefined") return;
      try {
        const [editionsRes, buildingsRes] = await Promise.all([
          fetch("/api/magazine/editions?broker_id=me&type=all").catch(() => null),
          fetch("/api/broker/buildings").catch(() => null),
        ]);

        if (!mounted) return;

        if (editionsRes && editionsRes.ok) {
          const edJson = (await editionsRes.json().catch(() => null)) as Record<string, unknown> | null;
          if (edJson) {
            if (typeof edJson.brokerSlug === "string") setBrokerSlug(edJson.brokerSlug);
            if (typeof edJson.brokerName === "string") setBrokerName(edJson.brokerName);
            if (typeof edJson.subscriberCount === "number") setSubscriberCount(edJson.subscriberCount);
            if (typeof edJson.highInterestCount === "number") setHighInterestCount(edJson.highInterestCount);
            if (edJson.brokerPreferences && typeof edJson.brokerPreferences === "object") {
              const normPrefs = normalizeBrokerPreferences(edJson.brokerPreferences);
              setPreferredRegions(normPrefs.preferredRegions);
              setPreferredChannels(normPrefs.preferredChannels);
              setRegionFocus(normPrefs.preferredRegions.join(", "));
              setUnitIssues((prev) =>
                prev.length > 0
                  ? clusterArticlesIntoFiveIssues(CURATED_CHANNEL_POOL, {
                      cadence: "monthly",
                      preferredRegions: normPrefs.preferredRegions,
                      preferredChannels: normPrefs.preferredChannels,
                    })
                  : prev,
              );
            }

            if (Array.isArray(edJson.editions)) {
              const resolvedBrokerSlug =
                typeof edJson.brokerSlug === "string" ? edJson.brokerSlug.trim() : "";
              const mapped: SavedEditionSummary[] = edJson.editions
                .filter((row): row is Record<string, unknown> => !!row && typeof row === "object")
                .map((row) => {
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
                  const dealIds = rawDealIds
                    .map((d) => String(d ?? "").trim())
                    .filter(Boolean);
                  const rawComments =
                    content.deal_comments && typeof content.deal_comments === "object"
                      ? (content.deal_comments as Record<string, unknown>)
                      : {};
                  const dealCommentsMap: Record<string, string> = {};
                  for (const [k, v] of Object.entries(rawComments)) {
                    if (typeof v === "string") dealCommentsMap[k] = v;
                  }
                  const rawIssueDate =
                    typeof content.issueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(content.issueDate)
                      ? content.issueDate
                      : typeof content.issue_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(content.issue_date)
                      ? content.issue_date
                      : typeof row.published_at === "string" && row.published_at.length >= 10
                      ? row.published_at.slice(0, 10)
                      : typeof row.created_at === "string" && row.created_at.length >= 10
                      ? row.created_at.slice(0, 10)
                      : "";
                  const rowId = String(row.id ?? "");
                  const rowSlug = String(row.edition_label ?? "");
                  const computedPublicUrl =
                    resolvedBrokerSlug && rawIssueDate
                      ? `${getSiteOrigin()}/magazine/${encodeURIComponent(resolvedBrokerSlug)}/${encodeURIComponent(rawIssueDate)}?edition=${encodeURIComponent(rowId)}`
                      : `${getSiteOrigin()}/magazine/${encodeURIComponent(resolvedBrokerSlug || "me")}/${encodeURIComponent(rowSlug || rowId)}?edition=${encodeURIComponent(rowId)}`;
                  const extractedBriefing = String(
                    content.briefing_body_md ?? row.theme_body_md ?? fieldNote.comment ?? content.theme_body_md ?? content.briefing ?? "",
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
                    fallbackFromTopNews: false,
                  });
                  return {
                    id: rowId,
                    slug: rowSlug,
                    title: String(row.title ?? content.headline ?? "").trim(),
                    status: String(row.status ?? "draft"),
                    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
                    publishedAt: typeof row.published_at === "string" ? row.published_at : null,
                    // NL-01 / P1: 실제 개수만 표시 (임의 기본값 금지)
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
                    selectedDealIds: dealIds,
                    dealComments: dealCommentsMap,
                    unitIssues: extractedUnitIssues.length > 0 ? extractedUnitIssues : undefined,
                    issueDate: rawIssueDate || undefined,
                    publicUrl: computedPublicUrl,
                  };
                });
              setEditions(mapped);
            }
          }
        }

        if (buildingsRes && buildingsRes.ok) {
          const bJson = (await buildingsRes.json().catch(() => null)) as Record<string, unknown> | null;
          const list = Array.isArray(bJson?.buildings)
            ? bJson.buildings
            : Array.isArray(bJson?.items)
              ? bJson.items
              : [];
          const mappedDeals: AssignableDealItem[] = list
            .filter((b): b is Record<string, unknown> => !!b && typeof b === "object")
            .map((b, idx) => {
              const address = sanitizeDealAddress(String(b.address ?? b.dong ?? ""));
              const rawName = String(b.building_name ?? b.name ?? b.title ?? "").trim();
              const title = rawName || address || `등록 매물 ${idx + 1}`;
              const yieldNum =
                typeof b.cap_rate === "number"
                  ? b.cap_rate
                  : typeof b.yield === "number"
                    ? b.yield
                    : null;
              return {
                id: String(b.id ?? `deal-${idx}`),
                title,
                address: address || "주소 미입력",
                price: formatDealPriceLabel(b.sale_price ?? b.price, b.price_band),
                yield: yieldNum && yieldNum > 0 ? `${yieldNum.toFixed(1)}%` : "-",
                // P0: 등록된 사진이 없으면 null 유지 (샘플 사진 폴백 금지)
                photoUrl: typeof b.photo_url === "string" && b.photo_url.trim() ? b.photo_url : null,
              };
            });
          setDeals(mappedDeals);
        }
      } catch {
        // 초기 로드 실패 시에도 로컬 작성은 가능하도록 유지
      } finally {
        if (mounted) hydratedRef.current = true;
      }
    }

    void loadInitialWorkspace();
    return () => {
      mounted = false;
    };
  }, []);

  // ── 6. 로컬 초안 자동저장 (서버 저장과 명확히 구분하여 local_only 표시 — NL-05) ──
  const persistLocalDraft = useCallback(
    (nextPatch?: Partial<{
      headline: string;
      summary: string;
      briefingTitle: string;
      briefingBody: string;
      issueYear: number;
      issueMonth: number;
      selectedDealIds: string[];
      dealComments: Record<string, string>;
      preferredRegions: string[];
      preferredChannels: SpecificNewsChannelId[];
      unitIssues: AxiosUnitIssue[];
    }>) => {
      try {
        if (typeof window !== "undefined") {
          const payload = {
            headline: nextPatch?.headline ?? headline,
            summary: nextPatch?.summary ?? summary,
            briefingTitle: nextPatch?.briefingTitle ?? briefingTitle,
            briefingBody: nextPatch?.briefingBody ?? briefingBody,
            issueYear: nextPatch?.issueYear ?? issueYear,
            issueMonth: nextPatch?.issueMonth ?? issueMonth,
            selectedDealIds: nextPatch?.selectedDealIds ?? selectedDealIds,
            dealComments: nextPatch?.dealComments ?? dealComments,
            preferredRegions: nextPatch?.preferredRegions ?? preferredRegions,
            preferredChannels: nextPatch?.preferredChannels ?? preferredChannels,
            unitIssues: nextPatch?.unitIssues ?? unitIssues,
            serverPublished: false,
            savedAt: new Date().toISOString(),
          };
          window.localStorage.setItem(LOCAL_DRAFT_STORAGE_KEY, JSON.stringify(payload));
        }
      } catch {
        // ignore storage quota errors
      }
      setLocalStorageMode("local_only");
      setSaveState("dirty");
    },
    [
      headline,
      summary,
      briefingTitle,
      briefingBody,
      issueYear,
      issueMonth,
      selectedDealIds,
      dealComments,
      preferredRegions,
      preferredChannels,
      unitIssues,
    ],
  );

  // ── 7. 서버 저장 핸들러 ──
  const handleServerSave = useCallback(async (): Promise<{
    ok: boolean;
    publicUrl: string | null;
    savedEditionId: string | null;
  }> => {
    setSaveState("saving");
    const issueSlug = autoMeta.slug;
    const defaultPublicUrl = `${getSiteOrigin()}/magazine/${encodeURIComponent(brokerSlug || "me")}/${encodeURIComponent(issueSlug)}`;

    try {
      const selectedDealSnapshots = selectedDealIds.map((id) => {
        const d = deals.find((item) => item.id === id);
        const comment = dealComments[id]?.trim() || "";
        const yieldNum = d?.yield ? parseFloat(String(d.yield).replace(/[^0-9.]/g, "")) : NaN;
        return {
          id,
          title: d?.title || "추천 매물",
          assetType: d?.title || "상업용 빌딩",
          address: d?.address || "",
          price: d?.price || "가격 문의",
          yield: d?.yield || "-",
          grossYieldNetOfDeposit: Number.isFinite(yieldNum) && yieldNum > 0 ? yieldNum : undefined,
          investmentPoint: comment || undefined,
          point: comment || undefined,
          photoUrl: d?.photoUrl || null,
          imUrl: `/im-lite/${encodeURIComponent(id)}`,
        };
      });

      const res = await fetch("/api/magazine/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          editionId,
          slug: issueSlug,
          issueNumber: autoMeta.issueNumber,
          year: autoMeta.year,
          month: autoMeta.month,
          headline: headline.trim(),
          summary: summary.trim(),
          briefingTitle: briefingTitle.trim(),
          briefingBody: briefingBody.trim(),
          marketTemp,
          featuredDealIds: selectedDealIds,
          featuredDeals: selectedDealSnapshots,
          dealComments,
          unitIssues,
          preferredRegions,
          preferredChannels,
          sections,
          targetSegment,
        }),
      });

      if (res.ok) {
        const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
        const resolvedUrl =
          typeof json?.publicUrl === "string" && json.publicUrl.trim()
            ? json.publicUrl.trim()
            : typeof json?.url === "string" && json.url.trim()
              ? json.url.trim()
              : defaultPublicUrl;
        const nextId =
          typeof json?.id === "string"
            ? json.id
            : typeof json?.editionId === "string"
              ? json.editionId
              : editionId;

        const nowIso = new Date().toISOString();
        const effectiveId = nextId || `ed-${issueSlug}`;
        if (nextId) setEditionId(nextId);
        setEditions((prev) => {
          const nextEntry: SavedEditionSummary = {
            id: effectiveId,
            slug: issueSlug,
            title: headline.trim(),
            status: "published",
            updatedAt: nowIso,
            publishedAt: nowIso,
            dealCount: selectedDealIds.length,
            hasBriefing: Boolean(briefingBody.trim() || summary.trim()),
            summary: summary.trim(),
            briefingTitle: briefingTitle.trim(),
            briefingBody: briefingBody.trim(),
            marketTemp,
            selectedDealIds: [...selectedDealIds],
            dealComments: { ...dealComments },
            unitIssues: [...unitIssues],
            publicUrl: resolvedUrl,
          };
          const exists = prev.some((e) => e.id === effectiveId || e.slug === issueSlug);
          if (exists) {
            return prev.map((e) =>
              e.id === effectiveId || e.slug === issueSlug ? nextEntry : e,
            );
          }
          return [nextEntry, ...prev];
        });
        setPublishedUrl(resolvedUrl);
        setIsPublished(true);
        setLocalStorageMode("none");
        setSaveState("saved");
        setLastSavedAt(new Date());
        try {
          if (typeof window !== "undefined") {
            window.localStorage.setItem(
              LOCAL_DRAFT_STORAGE_KEY,
              JSON.stringify({
                headline: headline.trim(),
                summary: summary.trim(),
                briefingTitle: briefingTitle.trim(),
                briefingBody: briefingBody.trim(),
                issueYear: autoMeta.year,
                issueMonth: autoMeta.month,
                selectedDealIds,
                dealComments,
                preferredRegions,
                preferredChannels,
                unitIssues,
                editionId: effectiveId,
                publishedUrl: resolvedUrl,
                serverPublished: true,
                savedAt: nowIso,
              }),
            );
          }
        } catch {
          // ignore storage quota errors
        }
        return { ok: true, publicUrl: resolvedUrl, savedEditionId: nextId ?? null };
      }

      // 기존 /api/magazine/editions 엔드포인트 폴백 지원
      if (res.status === 404 && editionId) {
        const patchRes = await fetch(`/api/magazine/editions/${encodeURIComponent(editionId)}/publish`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: headline.trim(),
            summary: summary.trim(),
            briefingBody: briefingBody.trim(),
          }),
        });
        if (patchRes.ok) {
          const fallbackUrl = brokerSlug
            ? `${getSiteOrigin()}/magazine/${encodeURIComponent(brokerSlug)}/${encodeURIComponent(issueSlug)}`
            : defaultPublicUrl;
          setPublishedUrl(fallbackUrl);
          setIsPublished(true);
          setSaveState("saved");
          setLastSavedAt(new Date());
          return { ok: true, publicUrl: fallbackUrl, savedEditionId: editionId };
        }
      }

      setSaveState("error");
      return { ok: false, publicUrl: null, savedEditionId: null };
    } catch {
      setSaveState("error");
      return { ok: false, publicUrl: null, savedEditionId: null };
    }
  }, [
    autoMeta,
    editionId,
    headline,
    summary,
    briefingTitle,
    briefingBody,
    marketTemp,
    selectedDealIds,
    deals,
    dealComments,
    unitIssues,
    preferredRegions,
    preferredChannels,
    sections,
    targetSegment,
    brokerSlug,
  ]);

  const handleSelectStep = useCallback((nextStep: NewsletterStepKey) => {
    setActiveStep(nextStep);
    setStatusBanner(null);
    if (nextStep === "send" && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("workspace:open-preview"));
    }
  }, []);

  // ── 8. 빠른 시작: 이번 달 뉴스레터 새로 쓰기 / 이전 호 불러오기 ──
  const handleStartNewThisMonth = () => {
    const now = new Date();
    setEditionId(null);
    setIssueYear(now.getFullYear());
    setIssueMonth(now.getMonth() + 1);
    setHeadline("");
    setSummary("");
    setBriefingTitle("");
    setBriefingBody("");
    setSelectedDealIds([]);
    setDealComments({});
    setIsPublished(false);
    setPublishedUrl(null);
    setActiveStep("title");
    setSaveState("idle");
    setStatusBanner({
      tone: "info",
      message: "이번 달 새 뉴스레터 양식을 열었습니다. 표지 제목부터 작성해 보세요.",
    });
  };

  const handleSelectExistingEdition = (ed: SavedEditionSummary) => {
    setEditionId(ed.id);
    const ym = parseYearMonthFromSlug(ed.slug);
    setIssueYear(ym.year);
    setIssueMonth(ym.month);
    setHeadline(ed.title);
    if (typeof ed.summary === "string") setSummary(ed.summary);
    if (typeof ed.briefingTitle === "string") setBriefingTitle(ed.briefingTitle);
    if (typeof ed.briefingBody === "string") setBriefingBody(ed.briefingBody);
    if (ed.marketTemp !== undefined) setMarketTemp(ed.marketTemp);
    if (Array.isArray(ed.selectedDealIds)) setSelectedDealIds(ed.selectedDealIds);
    if (ed.dealComments && typeof ed.dealComments === "object") setDealComments(ed.dealComments);
    if (Array.isArray(ed.unitIssues) && ed.unitIssues.length > 0) {
      setUnitIssues(ed.unitIssues);
    }
    setIsPublished(ed.status === "published");
    const resolvedPubUrl =
      ed.publicUrl ||
      (brokerSlug && ed.issueDate
        ? `${getSiteOrigin()}/magazine/${encodeURIComponent(brokerSlug)}/${encodeURIComponent(ed.issueDate)}?edition=${encodeURIComponent(ed.id)}`
        : `${getSiteOrigin()}/magazine/${encodeURIComponent(brokerSlug || "me")}/${encodeURIComponent(ed.slug)}?edition=${encodeURIComponent(ed.id)}`);
    setPublishedUrl(ed.status === "published" ? resolvedPubUrl : null);
    setSaveState("saved");
    setLastSavedAt(ed.updatedAt);
    setStatusBanner(null);
  };

  // ── 9. 서식 막대 (소제목 / 강조 / 구분선) ──
  const handleFormatAction = (action: SimpleFormatActionId) => {
    const el = briefingTextareaRef.current;
    const selection = el
      ? { start: el.selectionStart ?? briefingBody.length, end: el.selectionEnd ?? briefingBody.length }
      : undefined;
    const { text: nextText, selectionStart, selectionEnd } = applySimpleTextFormat(
      briefingBody,
      action,
      selection,
    );
    setBriefingBody(nextText);
    persistLocalDraft({ briefingBody: nextText });

    if (el) {
      requestAnimationFrame(() => {
        try {
          el.focus();
          el.setSelectionRange(selectionStart, selectionEnd);
        } catch {
          // ignore selection error in headless test env
        }
      });
    }
  };

  // ── 10. 매물 및 코너 토글 ──
  const handleToggleDeal = (dealId: string) => {
    setSelectedDealIds((prev) => {
      const next = prev.includes(dealId)
        ? prev.filter((id) => id !== dealId)
        : [...prev, dealId];
      persistLocalDraft({ selectedDealIds: next });
      return next;
    });
  };

  const handleChangeDealComment = (dealId: string, comment: string) => {
    setDealComments((prev) => {
      const next = { ...prev, [dealId]: comment };
      persistLocalDraft({ dealComments: next });
      return next;
    });
  };

  const handleToggleSection = (sectionId: string, nextEnabled: boolean) => {
    setSections((prev) => {
      const exists = prev.some((s) => s.id === sectionId);
      if (!exists) return [...prev, { id: sectionId, enabled: nextEnabled }];
      return prev.map((s) => (s.id === sectionId ? { ...s, enabled: nextEnabled } : s));
    });
    persistLocalDraft();
  };

  // ── 10-B. 중개인 개인 설정(주력 권역 · 관심 뉴스 큐레이션 분야) 및 AI 클러스터링 ──
  const handleTogglePreferredRegion = (regionLabel: string) => {
    setPreferredRegions((prev) => {
      const exists = prev.includes(regionLabel);
      const next = exists
        ? prev.length > 1
          ? prev.filter((r) => r !== regionLabel)
          : prev
        : [...prev, regionLabel].slice(0, 5);
      setRegionFocus(next.join(", "));
      const reclustered = clusterArticlesIntoFiveIssues(newsPool, {
        cadence: "monthly",
        preferredRegions: next,
        preferredChannels,
        dealKeywords: deals.filter((d) => selectedDealIds.includes(d.id)).map((d) => d.title),
      });
      setUnitIssues(reclustered);
      persistLocalDraft({ preferredRegions: next, unitIssues: reclustered });
      return next;
    });
  };

  const handleTogglePreferredChannel = (channelId: SpecificNewsChannelId) => {
    setPreferredChannels((prev) => {
      const exists = prev.includes(channelId);
      const next = exists
        ? prev.length > 1
          ? prev.filter((c) => c !== channelId)
          : prev
        : [...prev, channelId];
      const reclustered = clusterArticlesIntoFiveIssues(newsPool, {
        cadence: "monthly",
        preferredRegions,
        preferredChannels: next,
        dealKeywords: deals.filter((d) => selectedDealIds.includes(d.id)).map((d) => d.title),
      });
      setUnitIssues(reclustered);
      persistLocalDraft({ preferredChannels: next, unitIssues: reclustered });
      return next;
    });
  };

  const handleAiClusterIssues = async (
    overrideRegions?: readonly string[],
    overrideChannels?: readonly SpecificNewsChannelId[],
  ) => {
    if (isAiClustering) return;
    setIsAiClustering(true);
    const activeRegions = overrideRegions ?? preferredRegions;
    const activeChannels = overrideChannels ?? preferredChannels;
    const activeDealTitles = deals
      .filter((d) => selectedDealIds.includes(d.id))
      .map((d) => `${d.title} ${d.address}`);

    try {
      const res = await fetch("/api/broker/studio/ai-news-cluster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cadence: "monthly",
          preferredRegions: [...activeRegions],
          preferredChannels: [...activeChannels],
          dealTitles: activeDealTitles,
          articles: newsPool.slice(0, 30),
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok: true; unitIssues: AxiosUnitIssue[] }
        | null;
      if (res.ok && json?.ok && Array.isArray(json.unitIssues) && json.unitIssues.length > 0) {
        setUnitIssues(json.unitIssues);
        persistLocalDraft({ unitIssues: json.unitIssues });
        setStatusBanner({
          tone: "success",
          message: "내 주력 권역과 관심 분야에 맞춰 핵심 이슈 포스트잇 5선을 새로 구성했어요.",
        });
        return;
      }
    } catch {
      // 결정론적 폴백 진행
    } finally {
      setIsAiClustering(false);
    }

    const fallback = clusterArticlesIntoFiveIssues(newsPool, {
      cadence: "monthly",
      preferredRegions: activeRegions,
      preferredChannels: activeChannels,
      dealKeywords: activeDealTitles,
    });
    setUnitIssues(fallback);
    persistLocalDraft({ unitIssues: fallback });
    setStatusBanner({
      tone: "success",
      message: "내 주력 권역과 관심 분야 기반으로 핵심 이슈 5선을 구성했어요.",
    });
  };

  const handleSavePreferencesAndCluster = async () => {
    if (savingPrefs) return;
    setSavingPrefs(true);
    try {
      await fetch("/api/broker/magazine/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferredRegions,
          preferredChannels,
        }),
      }).catch(() => null);
      await handleAiClusterIssues(preferredRegions, preferredChannels);
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleRefreshLiveChannel = async (channel: NewsChannelId) => {
    try {
      const qs = new URLSearchParams({
        channel,
        regions: preferredRegions.join(","),
        channels: preferredChannels.join(","),
      });
      const res = await fetch(`/api/broker/magazine/news-channels?${qs.toString()}`);
      if (!res.ok) return;
      const json = (await res.json().catch(() => null)) as
        | { ok: true; items?: NewsPoolItem[] }
        | null;
      if (json?.ok && Array.isArray(json.items) && json.items.length > 0) {
        setNewsPool(json.items);
      }
    } catch {
      // ignore network error
    }
  };

  // ── 11. 정직한 링크 복사 (NL-04: copyText가 true일 때만 성공 메시지) ──
  const handleCopyLink = async () => {
    let targetUrl = publishedUrl;
    if (!targetUrl) {
      if (!headline.trim()) {
        setActiveStep("title");
        const msg = "표지 제목을 입력하면 바로 보낼 수 있어요";
        setStatusBanner({ tone: "error", message: msg });
        return;
      }
      const saved = await handleServerSave();
      if (!saved.ok || !saved.publicUrl) {
        const msg = "아직 뉴스레터 주소를 만들지 못했어요. 잠시 후 다시 시도해 주세요.";
        setStatusBanner({ tone: "error", message: msg });
        return;
      }
      targetUrl = saved.publicUrl;
    }

    const copied = await copyText(targetUrl);
    if (copied) {
      const msg = "링크를 복사했어요";
      setStatusBanner({ tone: "success", message: msg });
    } else {
      setStatusBanner({ tone: "error", message: COPY_FAILED_MESSAGE });
    }
  };

  // ── 12. 정직한 카카오톡 공유 (NL-03) ──
  const handleKakaoShare = async () => {
    if (!headline.trim()) {
      setActiveStep("title");
      const msg = "표지 제목을 입력하면 바로 보낼 수 있어요";
      setStatusBanner({ tone: "error", message: msg });
      return;
    }

    let targetUrl = publishedUrl;
    if (!targetUrl) {
      const saved = await handleServerSave();
      if (!saved.ok || !saved.publicUrl) {
        const msg = "뉴스레터 저장에 실패해 공유 창을 열지 못했어요. 잠시 후 다시 눌러 주세요.";
        setStatusBanner({ tone: "error", message: msg });
        return;
      }
      targetUrl = saved.publicUrl;
    }

    const shareOutcome = await shareKakaoFeed({
      title: headline.trim(),
      description: summary.trim() || `${autoMeta.yearMonthLabel} 뉴스레터`,
      imageUrl: `${getSiteOrigin()}/og-default.png`,
      url: targetUrl,
      buttonTitle: "뉴스레터 열기",
    });

    if (shareOutcome === "kakao") {
      const msg = "카카오톡 공유 창을 열었어요";
      setStatusBanner({ tone: "success", message: msg });
    } else if (shareOutcome === "copied") {
      const msg = "링크를 복사했어요";
      setStatusBanner({ tone: "success", message: msg });
    } else {
      setStatusBanner({ tone: "error", message: COPY_FAILED_MESSAGE });
    }
  };

  // ── 13. 정직한 통합 발송 핸들러 (`[구독자에게 보내기]`, NL-03, NL-13) ──
  const handleSendSelected = async () => {
    if (sending) return;

    const hint = getNextPublishHint({
      headline,
      briefingBody,
      dealCount: selectedDealIds.length,
    });

    if (hint && !headline.trim()) {
      setActiveStep(hint.targetStep);
      setStatusBanner({ tone: "error", message: hint.message });
      return;
    }

    setSending(true);
    setStatusBanner(null);

    try {
      // 1단계: 실제 발행/저장 요청으로 공개 URL 확보
      const saved = await handleServerSave();
      if (!saved.ok || !saved.publicUrl) {
        const msg = "뉴스레터를 발행하지 못했어요. 잠시 후 다시 시도해 주세요.";
        setStatusBanner({ tone: "error", message: msg });
        return;
      }

      const publicUrl = saved.publicUrl;

      // 2단계: 구독자 발송 액션 호출 시도 (/api/broker/inbox/actions) 및 공유/복사 연결
      let inboxSentOk = false;
      try {
        const actionRes = await fetch("/api/broker/inbox/actions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "send_magazine",
            slug: autoMeta.slug,
            publicUrl,
            targetSegment,
            headline: headline.trim(),
          }),
        });
        if (actionRes.ok) {
          inboxSentOk = true;
        }
      } catch {
        // inbox/actions 미연결 환경에서는 카톡/클립보드 공유로 이어짐
      }

      const shareResult = await shareKakaoFeed({
        title: headline.trim(),
        description: summary.trim() || `${autoMeta.yearMonthLabel} 뉴스레터`,
        imageUrl: `${getSiteOrigin()}/og-default.png`,
        url: publicUrl,
        buttonTitle: "뉴스레터 열기",
      });

      if (inboxSentOk || shareResult === "kakao" || shareResult === "copied") {
        const msg =
          shareResult === "kakao"
            ? "뉴스레터를 발행하고 카카오톡 공유 창을 열었어요"
            : shareResult === "copied"
              ? "뉴스레터를 발행하고 링크를 복사했어요"
              : "구독자에게 뉴스레터를 보냈어요";
        setStatusBanner({ tone: "success", message: msg });
      } else {
        setStatusBanner({
          tone: "error",
          message: COPY_FAILED_MESSAGE,
        });
      }
    } finally {
      setSending(false);
    }
  };

  // ── 파생 데이터 ──
  const selectedDeals = useMemo(
    () => deals.filter((d) => selectedDealIds.includes(d.id)),
    [deals, selectedDealIds],
  );
  const monthlyCharts = useMemo(
    () => getMonthlyChartsForRegion(monthlyRegion),
    [monthlyRegion],
  );
  const isSectionEnabled = useCallback(
    (id: string) => {
      const found = sections.find((s) => s.id === id);
      return found ? found.enabled : true;
    },
    [sections],
  );
  const formattedPreviewBriefing = useMemo(
    () => normalizeReadableBriefingText(briefingBody),
    [briefingBody],
  );

  // ── 중개인 개인 설정 카드 (주력 권역 & 뉴스 큐레이션 분야) ──
  const brokerPreferencesCard = (
    <section
      data-testid="broker-newsletter-preferences-card"
      aria-label="내 주력 권역 및 뉴스 큐레이션 분야 설정"
      className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xs space-y-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-base font-extrabold text-slate-900">
            내 주력 권역 · 뉴스 큐레이션 분야 설정
          </h3>
          <p className="text-sm font-medium text-slate-600">
            선택한 권역과 관심 분야를 바탕으로 AI가 비부동산 가십을 걸러내고 맞춤형 핵심 이슈 5선과 초안을 구성합니다.
          </p>
        </div>

        <button
          type="button"
          data-testid="save-broker-prefs-btn"
          disabled={savingPrefs || isAiClustering}
          onClick={() => void handleSavePreferencesAndCluster()}
          className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-extrabold text-blue-900 hover:bg-blue-100 disabled:opacity-60"
        >
          <Sparkles className="h-4 w-4 text-blue-700" aria-hidden="true" />
          <span>
            {savingPrefs || isAiClustering ? "맞춤 설정 반영 중…" : "내 설정 저장 · 맞춤 이슈 갱신"}
          </span>
        </button>
      </div>

      {/* 1. 주력 권역 칩 선택 */}
      <div className="space-y-2">
        <p className="text-sm font-extrabold text-slate-800">
          ① 주력 상권 · 권역 선택 (복수 선택 가능)
        </p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="주력 권역 선택">
          {BROKER_REGION_PRESETS.map((preset) => {
            const active = preferredRegions.includes(preset.label);
            return (
              <button
                key={preset.id}
                type="button"
                data-testid={`pref-region-chip-${preset.id}`}
                aria-pressed={active}
                onClick={() => handleTogglePreferredRegion(preset.label)}
                className={`min-h-[40px] rounded-xl border px-3.5 py-1.5 text-sm font-extrabold transition ${
                  active
                    ? "border-blue-600 bg-blue-700 text-white shadow-2xs"
                    : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. 뉴스 큐레이션 5대 분야 선택 */}
      <div className="space-y-2">
        <p className="text-sm font-extrabold text-slate-800">
          ② 뉴스 큐레이션 관심 분야 (복수 선택 가능)
        </p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="뉴스 큐레이션 분야 선택">
          {SPECIFIC_NEWS_CHANNELS.map((ch) => {
            const active = preferredChannels.includes(ch.id);
            return (
              <button
                key={ch.id}
                type="button"
                data-testid={`pref-channel-chip-${ch.id}`}
                aria-pressed={active}
                onClick={() => handleTogglePreferredChannel(ch.id)}
                className={`min-h-[40px] rounded-xl border px-3.5 py-1.5 text-sm font-extrabold transition flex items-center gap-1.5 ${
                  active
                    ? "border-slate-900 bg-slate-900 text-white shadow-2xs"
                    : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                }`}
              >
                <span aria-hidden="true">{ch.emoji}</span>
                <span>{ch.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );

  // ════════════════════════════════════════════════════════════════════
  //  1열 (listSlot): 호수 선택 + 빠른 시작 카드 + 단계 요약
  // ════════════════════════════════════════════════════════════════════
  const listSlot = (
    <div
      data-testid="magazine-list-slot"
      className="p-4 space-y-4 text-slate-900"
    >
      {/* <EditionAirtableList /> 호환 슬롯 */}
      {/* 빠른 시작 카드 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
        <div className="space-y-1">
          <p className="text-sm font-bold text-blue-700">빠른 시작</p>
          <h2 className="text-base font-extrabold text-slate-900">
            {autoMeta.yearMonthLabel} 뉴스레터
          </h2>
          <p className="text-sm font-medium text-slate-600">
            제목·내용·보내기 3단계로 이번 달 뉴스레터를 완성하세요.
          </p>
        </div>

        <button
          type="button"
          data-testid="new-newsletter-btn"
          onClick={handleStartNewThisMonth}
          className="w-full min-h-[48px] rounded-xl bg-blue-700 px-4 py-2.5 text-base font-extrabold text-white shadow-xs transition hover:bg-blue-800 flex items-center justify-center gap-2"
        >
          <FilePlus2 className="h-5 w-5" aria-hidden="true" />
          <span>이번 달 뉴스레터 새로 쓰기</span>
        </button>
      </div>

      {/* 이전 호 불러오기 목록 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-extrabold text-slate-800">이전 호 불러오기</h3>
          <span className="text-sm font-bold text-slate-600">{editions.length}건</span>
        </div>

        {editions.length === 0 ? (
          <p className="text-sm font-medium text-slate-600 py-2">
            아직 발행한 이전 호가 없습니다. 이번 달 첫 뉴스레터를 시작해 보세요.
          </p>
        ) : (
          <ul className="space-y-2" role="list">
            {editions.map((ed) => {
              const isCurrent = editionId === ed.id;
              return (
                <li key={ed.id}>
                  <button
                    type="button"
                    data-testid={`magazine-edition-item-${ed.id}`}
                    aria-current={isCurrent ? "true" : undefined}
                    onClick={() => handleSelectExistingEdition(ed)}
                    className={`w-full min-h-[48px] rounded-xl border p-3 text-left transition space-y-1 ${
                      isCurrent
                        ? "border-blue-600 bg-blue-50/70 text-slate-900"
                        : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-extrabold text-slate-900 truncate">
                        {ed.title || `${ed.slug} 뉴스레터`}
                      </span>
                      <span className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-sm font-bold text-slate-700">
                        {ed.status === "published" ? "발행됨" : "작성 중"}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-slate-600">
                      {ed.slug} · 추천 매물 {ed.dealCount}건
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );

  // ════════════════════════════════════════════════════════════════════
  //  2열 (editorSlot): 3단계 통합 편집 (① 제목 · ② 내용 · ③ 보내기)
  // ════════════════════════════════════════════════════════════════════
  const editorSlot = (
    <div
      data-testid="magazine-editor-slot"
      className="p-4 sm:p-6 space-y-5 text-slate-900"
    >
      <div data-testid="magazine-three-column-layout" className="space-y-5">
        {/* 상단 3단계 탭 막대 (NL-12) */}
        <div
          role="tablist"
          aria-label="뉴스레터 작성 3단계"
          className="grid grid-cols-3 gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-2xs"
        >
          {STEP_TABS.map((tab) => {
            const selected = activeStep === tab.key;
            const isDone =
              tab.key === "title"
                ? headline.trim().length > 0
                : tab.key === "content"
                  ? briefingBody.trim().length > 0 || selectedDealIds.length > 0
                  : isPublished;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                id={`newsletter-tab-${tab.key}`}
                aria-selected={selected}
                aria-controls={`newsletter-panel-${tab.key}`}
                data-testid={`step-tab-${tab.key}`}
                onClick={() => handleSelectStep(tab.key)}
                className={`min-h-[48px] rounded-xl px-3 py-2.5 text-base font-extrabold transition flex items-center justify-center gap-2 ${
                  selected
                    ? "bg-blue-700 text-white shadow-xs"
                    : "bg-white text-slate-700 hover:bg-slate-100"
                }`}
              >
                <span>{tab.label}</span>
                {isDone && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-sm font-bold ${
                      selected
                        ? "bg-white/20 text-white"
                        : "bg-emerald-100 text-emerald-900"
                    }`}
                  >
                    완료
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* 상태 알림 배너 */}
        {statusBanner && (
          <div
            role={statusBanner.tone === "error" ? "alert" : "status"}
            data-testid="newsletter-status-banner"
            className={`rounded-xl border px-4 py-3 text-sm font-bold flex items-center gap-2.5 ${
              statusBanner.tone === "error"
                ? "border-rose-200 bg-rose-50 text-rose-900"
                : statusBanner.tone === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-blue-200 bg-blue-50 text-blue-900"
            }`}
          >
            {statusBanner.tone === "success" ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-700 shrink-0" aria-hidden="true" />
            ) : (
              <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
            )}
            <span>{statusBanner.message}</span>
          </div>
        )}

        {/* ━━━ STEP 1: ① 제목 ━━━ */}
        {activeStep === "title" && (
          <div
            id="newsletter-panel-title"
            role="tabpanel"
            aria-labelledby="newsletter-tab-title"
            className="space-y-5"
          >
            {brokerPreferencesCard}

            <MagazineQuickDraftCard
              monthLabel={autoMeta.yearMonthLabel}
              regionFocus={regionFocus}
              onChangeRegionFocus={setRegionFocus}
              preferredRegions={preferredRegions}
              preferredChannels={preferredChannels}
              dealTitles={selectedDeals.map((d) => d.title)}
              newsTitles={unitIssues.map((u) => u.title)}
              currentDraft={{
                headline,
                summary,
                briefingTitle,
                briefingBody,
              }}
              onApplyDraft={(next: MagazineDraftSnapshot) => {
                setHeadline(formatSingleLineTitle(next.headline, 80));
                setSummary(next.summary);
                setBriefingTitle(next.briefingTitle);
                setBriefingBody(next.briefingBody);
                persistLocalDraft({
                  headline: next.headline,
                  summary: next.summary,
                  briefingTitle: next.briefingTitle,
                  briefingBody: next.briefingBody,
                });
              }}
            />

            <IssueMetadataForm
              year={issueYear}
              month={issueMonth}
              onChangeYearMonth={(meta: AutoIssueMetadata) => {
                setIssueYear(meta.year);
                setIssueMonth(meta.month);
                persistLocalDraft({ issueYear: meta.year, issueMonth: meta.month });
              }}
              headline={headline}
              onChangeHeadline={(val) => {
                setHeadline(val);
                persistLocalDraft({ headline: val });
              }}
              summary={summary}
              onChangeSummary={(val) => {
                setSummary(val);
                persistLocalDraft({ summary: val });
              }}
              marketTemp={marketTemp}
              onChangeMarketTemp={setMarketTemp}
            />

            <div className="flex justify-end">
              <button
                type="button"
                data-testid="next-to-content-btn"
                onClick={() => handleSelectStep("content")}
                className="inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-base font-extrabold text-white hover:bg-slate-800"
              >
                <span>다음: ② 내용 작성하기</span>
                <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        {/* ━━━ STEP 2: ② 내용 ━━━ */}
        {activeStep === "content" && (
          <div
            id="newsletter-panel-content"
            role="tabpanel"
            aria-labelledby="newsletter-tab-content"
            className="space-y-5"
          >
            {/* 시장 브리핑 글 + 3버튼 서식 막대 (NL-16) */}
            <section
              data-testid="market-briefing-editor"
              aria-label="시장 브리핑 글 작성"
              className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xs space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-blue-700" aria-hidden="true" />
                  <h3 className="text-base font-extrabold text-slate-900">
                    시장 브리핑 글
                  </h3>
                </div>
                <AiCommentRecommendButton
                  currentValue={briefingBody}
                  fallbackContext={
                    [autoMeta.yearMonthLabel, regionFocus, headline, summary]
                      .filter(Boolean)
                      .join(" · ") || "이번 달 상업용 빌딩 시장 분위기"
                  }
                  onChangeValue={(next) => {
                    setBriefingBody(next);
                    persistLocalDraft({ briefingBody: next });
                  }}
                  label="AI로 추천글 쓰기"
                />
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="newsletter-briefing-title"
                  className="block text-sm font-extrabold text-slate-800"
                >
                  브리핑 소제목
                </label>
                <input
                  id="newsletter-briefing-title"
                  type="text"
                  value={briefingTitle}
                  onChange={(e) => {
                    setBriefingTitle(e.target.value);
                    persistLocalDraft({ briefingTitle: e.target.value });
                  }}
                  placeholder="예: 이달의 강남·서초 빌딩 매수 분위기"
                  className="w-full min-h-[48px] rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-base font-bold text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
                />
              </div>

              {/* 3버튼 서식 막대: [소제목] [강조] [구분선] */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label
                    htmlFor="newsletter-briefing-body"
                    className="block text-sm font-extrabold text-slate-800"
                  >
                    브리핑 본문
                  </label>
                  <div
                    role="toolbar"
                    aria-label="본문 서식 도구"
                    className="flex flex-wrap items-center gap-2"
                  >
                    {SIMPLE_FORMAT_ACTIONS.map((fmtAction) => (
                      <button
                        key={fmtAction.id}
                        type="button"
                        data-testid={`format-btn-${fmtAction.id}`}
                        onClick={() => handleFormatAction(fmtAction.id)}
                        title={fmtAction.description}
                        className="min-h-[48px] rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-sm font-extrabold text-slate-800 hover:bg-slate-100"
                      >
                        {fmtAction.label}
                      </button>
                    ))}
                  </div>
                </div>

                <textarea
                  ref={briefingTextareaRef}
                  id="newsletter-briefing-body"
                  rows={5}
                  value={briefingBody}
                  onChange={(e) => {
                    setBriefingBody(e.target.value);
                    persistLocalDraft({ briefingBody: e.target.value });
                  }}
                  placeholder="현장에서 느끼신 매수·매도 분위기나 독자에게 전하고 싶은 이야기를 편하게 적어 주세요."
                  className="w-full rounded-xl border border-slate-300 bg-white p-4 text-base font-medium leading-relaxed text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none resize-y"
                />
              </div>
            </section>

            {/* 추천 매물 고르기 (DealSlotAssigner + AiCommentRecommendButton) */}
            <DealSlotAssigner
              deals={deals}
              selectedDealIds={selectedDealIds}
              onToggleDeal={handleToggleDeal}
              dealComments={dealComments}
              onChangeDealComment={handleChangeDealComment}
            />

            {/* 포함할 코너 켜기/끄기 (BlockSelectionGrid) */}
            <BlockSelectionGrid
              sections={sections}
              onToggleSection={handleToggleSection}
            />

            {/* 핵심 이슈 포스트잇 5선 (중개인 권역·분야 설정 연동 AXIOS 카드뉴스 편집기) */}
            {isSectionEnabled("news_curation") && (
              <div className="space-y-4">
                {brokerPreferencesCard}
                <AxiosIssuesEditorPanel
                  unitIssues={unitIssues}
                  onChangeUnitIssues={(next) => {
                    setUnitIssues(next);
                    persistLocalDraft({ unitIssues: next });
                  }}
                  newsPool={newsPool}
                  cadenceLabel={autoMeta.yearMonthLabel}
                  preferredRegions={preferredRegions}
                  preferredChannels={preferredChannels}
                  dealTitles={selectedDeals.map((d) => `${d.title} ${d.address}`)}
                  onAiClusterIssues={() => handleAiClusterIssues()}
                  isAiClustering={isAiClustering}
                  onRefreshLiveChannel={handleRefreshLiveChannel}
                />
              </div>
            )}

            {/* 월간 통계 코너 정직한 상태 표시 (NL-01) */}
            {isSectionEnabled("market_data") && (
              <section
                data-testid="monthly-stats-honest-card"
                aria-label="이번 달 통계 데이터 상태"
                className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xs space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-base font-extrabold text-slate-900">
                    권역별 월간 통계 코너
                  </h3>
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-sm font-extrabold text-amber-900">
                    {MONTHLY_STATS_PREPARING_LABEL}
                  </span>
                </div>

                <p className="text-sm font-medium text-slate-700">
                  {MONTHLY_STATS_PLACEHOLDER_MESSAGE}
                </p>

                <div className="flex flex-wrap gap-2">
                  {MONTHLY_REGION_PRESETS.map((preset) => {
                    const selected = monthlyRegion === preset.key;
                    return (
                      <button
                        key={preset.key}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setMonthlyRegion(preset.key)}
                        className={`min-h-[48px] rounded-xl border px-3.5 py-2 text-sm font-extrabold transition ${
                          selected
                            ? "border-blue-600 bg-blue-50 text-blue-950"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        {preset.shortLabel}
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => handleSelectStep("title")}
                className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-base font-bold text-slate-800 hover:bg-slate-50"
              >
                <ArrowLeft className="h-5 w-5" aria-hidden="true" />
                <span>이전: ① 제목</span>
              </button>
              <button
                type="button"
                data-testid="next-to-send-btn"
                onClick={() => handleSelectStep("send")}
                className="inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-base font-extrabold text-white hover:bg-slate-800"
              >
                <span>다음: ③ 보내기</span>
                <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        {/* ━━━ STEP 3: ③ 보내기 ━━━ */}
        {activeStep === "send" && (
          <div
            id="newsletter-panel-send"
            role="tabpanel"
            aria-labelledby="newsletter-tab-send"
            className="space-y-5"
          >
            {/* 미완료 항목이 있을 때만 1줄 안내 */}
            <MagazinePublishChecklist
              headline={headline}
              briefingBody={briefingBody}
              dealCount={selectedDealIds.length}
              onJumpToStep={(step) => setActiveStep(step)}
            />

            {/* 받을 고객 확인 */}
            <SendListSummaryBar
              targetSegment={targetSegment}
              onChangeTargetSegment={setTargetSegment}
              totalSubscriberCount={subscriberCount}
              highInterestCount={highInterestCount}
              sendDayLabel={MAGAZINE_SEND_DAY_LABEL}
            />

            {/* 카카오톡 공유 및 링크 복사 보조 도구 */}
            <section
              aria-label="공유 및 링크 복사"
              className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xs space-y-4"
            >
              <div className="space-y-1">
                <h3 className="text-base font-extrabold text-slate-900">
                  카카오톡 공유 · 링크 복사
                </h3>
                <p className="text-sm font-medium text-slate-600">
                  오른쪽 위 <strong>구독자에게 보내기</strong> 버튼을 누르면 발행과 발송을 한 번에 진행하며, 아래 버튼으로 링크만 먼저 복사하거나 카카오톡으로 공유할 수도 있습니다.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  data-testid="kakao-share-btn"
                  onClick={handleKakaoShare}
                  className="min-h-[48px] rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-base font-extrabold text-amber-950 hover:bg-amber-100 flex items-center justify-center gap-2"
                >
                  <MessageCircle className="h-5 w-5" aria-hidden="true" />
                  <span>카카오톡으로 공유</span>
                </button>

                <button
                  type="button"
                  data-testid="copy-link-btn"
                  onClick={handleCopyLink}
                  className="min-h-[48px] rounded-xl border border-slate-300 bg-white px-4 py-3 text-base font-extrabold text-slate-900 hover:bg-slate-50 flex items-center justify-center gap-2"
                >
                  <Copy className="h-5 w-5" aria-hidden="true" />
                  <span>링크 복사</span>
                </button>
              </div>
            </section>

            <div className="flex justify-start">
              <button
                type="button"
                onClick={() => handleSelectStep("content")}
                className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-base font-bold text-slate-800 hover:bg-slate-50"
              >
                <ArrowLeft className="h-5 w-5" aria-hidden="true" />
                <span>이전: ② 내용 수정하기</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // ════════════════════════════════════════════════════════════════════
  //  3열 (previewSlot): 실시간 뉴스레터 미리보기 + 미완료 1줄 안내
  // ════════════════════════════════════════════════════════════════════
  const previewSlot = (
    <div
      data-testid="magazine-preview-slot"
      className="p-4 sm:p-5 space-y-4 text-slate-900"
    >
      {/* 미완료 항목이 있을 때만 1줄 안내 (NL-17) */}
      <MagazinePublishChecklist
        headline={headline}
        briefingBody={briefingBody}
        dealCount={selectedDealIds.length}
        onJumpToStep={(step) => setActiveStep(step)}
      />

      {/* 실시간 뉴스레터 미리보기 카드 (내부 이중 스크롤 제거 — NL-10) */}
      <article
        aria-label="실시간 뉴스레터 미리보기"
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-5"
      >
        <header className="border-b border-slate-200 pb-4 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-extrabold text-blue-900">
              {autoMeta.yearMonthLabel} 뉴스레터
            </span>
            {marketTemp && (
              <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-sm font-bold text-slate-800">
                시장 분위기: {marketTemp}
              </span>
            )}
          </div>

          <h2
            data-single-line-title="true"
            className="line-clamp-2 break-keep leading-snug text-xl font-extrabold text-slate-900"
          >
            {headline.trim() || "표지 제목을 입력하면 이곳에 바로 표시됩니다"}
          </h2>

          {summary.trim() && (
            <p className="text-base font-medium text-slate-700 leading-relaxed">
              {summary}
            </p>
          )}
          {brokerName && (
            <p className="text-sm font-bold text-slate-600">
              발행인: {brokerName}
            </p>
          )}
        </header>

        {/* 시장 브리핑 미리보기 */}
        {isSectionEnabled("field_note") && (
          <section className="space-y-2">
            <h3 className="text-base font-extrabold text-slate-900">
              {briefingTitle.trim() || "이달의 시장 브리핑"}
            </h3>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-base font-medium text-slate-800 whitespace-pre-line leading-relaxed">
              {formattedPreviewBriefing.trim() ||
                "② 내용 단계에서 시장 브리핑 글을 작성하면 고객에게 보일 모양 그대로 미리 확인할 수 있습니다."}
            </div>
          </section>
        )}

        {/* 핵심 이슈 포스트잇 5선 미리보기 (카드뉴스형 2줄 큰 제목 + 2줄 짧은 부제 해설) */}
        {isSectionEnabled("news_curation") && unitIssues.length > 0 && (
          <section
            data-testid="preview-axios-postit-section"
            className="space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-extrabold text-slate-900">
                핵심 시장 이슈 5선
              </h3>
              <span className="text-sm font-bold text-slate-600">
                {preferredRegions.slice(0, 2).join(" · ")} 맞춤
              </span>
            </div>
            <ul className="space-y-3" role="list">
              {unitIssues.slice(0, 5).map((issue, idx) => {
                const toneMeta =
                  POST_IT_TONE_META[issue.memoTone] ?? POST_IT_TONE_META.amber;
                const chMeta =
                  issue.channel && NEWS_CHANNEL_MAP[issue.channel as NewsChannelId]
                    ? NEWS_CHANNEL_MAP[issue.channel as NewsChannelId]
                    : NEWS_CHANNEL_MAP.real_estate;
                const cardTitle = formatAxiosCardTitle(issue.title, 52) || issue.title;
                const cardBrief = formatAxiosTwoLineBrief(issue.brief, {
                  title: cardTitle,
                  channel: chMeta.id === "all" ? "real_estate" : chMeta.id,
                });
                return (
                  <li
                    key={issue.id || idx}
                    data-testid={`preview-postit-card-${idx}`}
                    style={{
                      backgroundColor: toneMeta.cardBg,
                      borderColor: toneMeta.cardBorder,
                      borderLeftColor: toneMeta.accentBar,
                    }}
                    className="rounded-2xl border-2 border-l-[6px] p-4 shadow-2xs space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <span
                        style={{
                          backgroundColor: toneMeta.badgeBg,
                          color: toneMeta.badgeText,
                        }}
                        className="rounded-md px-2 py-0.5 text-sm font-extrabold"
                      >
                        ISSUE 0{idx + 1}
                      </span>
                      <span className="rounded-md border border-slate-900/15 bg-white/85 px-2 py-0.5 text-sm font-bold text-slate-900">
                        {chMeta.emoji} {chMeta.shortLabel}
                      </span>
                    </div>
                    <h4
                      className="line-clamp-2 break-keep text-lg font-black leading-[1.35] tracking-tight"
                      style={{ color: toneMeta.titleColor }}
                    >
                      {cardTitle}
                    </h4>
                    <p
                      className="line-clamp-2 break-keep text-sm font-semibold leading-[1.55]"
                      style={{ color: toneMeta.bodyColor }}
                    >
                      {cardBrief}
                    </p>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* 추천 매물 미리보기 */}
        {isSectionEnabled("featured_deals") && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-slate-900">
                추천 매물 소개
              </h3>
              <span className="text-sm font-bold text-slate-600">
                {selectedDeals.length}건
              </span>
            </div>

            {selectedDeals.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm font-medium text-slate-600">
                선택된 추천 매물이 아직 없습니다.
              </div>
            ) : (
              <ul className="space-y-2.5" role="list">
                {selectedDeals.map((deal) => (
                  <li
                    key={deal.id}
                    className="rounded-xl border border-slate-200 bg-white p-3.5 flex items-start gap-3"
                  >
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                      {deal.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={deal.photoUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Building2 className="h-6 w-6 text-slate-500" aria-hidden="true" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-base font-extrabold text-slate-900 truncate">
                        {deal.title}
                      </p>
                      <p className="text-sm font-medium text-slate-600">
                        {deal.address} · 매매가 {deal.price}
                      </p>
                      {dealComments[deal.id]?.trim() && (
                        <p className="text-sm font-bold text-blue-900 bg-blue-50 rounded-lg px-2.5 py-1.5">
                          {dealComments[deal.id]}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* 월간 통계 코너 미리보기 (NL-01: 임의 수치 대신 정직한 통계 준비 중 표시) */}
        {isSectionEnabled("market_data") && (
          <section
            data-testid="preview-monthly-stats-section"
            className="space-y-2"
          >
            <h3 className="text-base font-extrabold text-slate-900">
              권역별 월간 통계
            </h3>
            {monthlyCharts.map((chart) => {
              const isPlaceholder =
                chart.isPlaceholder === true || chart.series.length === 0;
              return (
                <div
                  key={chart.id}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-extrabold text-slate-900">
                      {chart.title}
                    </span>
                    <span className="rounded-md bg-amber-100 px-2 py-0.5 text-sm font-bold text-amber-900">
                      {isPlaceholder ? MONTHLY_STATS_PREPARING_LABEL : chart.asOf}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-slate-600">
                    {isPlaceholder
                      ? (chart.placeholderNotice ?? MONTHLY_STATS_PLACEHOLDER_MESSAGE)
                      : chart.buyerImplication}
                  </p>
                </div>
              );
            })}
          </section>
        )}
      </article>
    </div>
  );

  // ════════════════════════════════════════════════════════════════════
  //  단 하나의 주 행동 버튼 (`[구독자에게 보내기]`, NL-13)
  // ════════════════════════════════════════════════════════════════════
  const primaryActionSlot = (
    <button
      type="button"
      data-testid="newsletter-primary-send-btn"
      onClick={handleSendSelected}
      disabled={sending}
      aria-busy={sending}
      className="inline-flex min-h-[56px] items-center justify-center gap-2 rounded-xl bg-blue-700 px-6 py-3 text-base font-extrabold text-white shadow-sm transition hover:bg-blue-800 disabled:opacity-60"
    >
      {sending ? (
        <>
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          <span>보내는 중…</span>
        </>
      ) : (
        <>
          <Send className="h-5 w-5" aria-hidden="true" />
          <span>구독자에게 보내기</span>
        </>
      )}
    </button>
  );

  return (
    <UndoToastProvider>
      <div data-local-draft-mode={localStorageMode}>
        <WorkspaceShell
          workspace="magazine"
          selectedBuildingId={editionId ?? autoMeta.slug}
          selectedLabel={`${autoMeta.yearMonthLabel} 뉴스레터`}
          saveState={saveState}
          lastSavedAt={lastSavedAt}
          onRetrySave={() => {
            void handleServerSave();
          }}
          primaryActionSlot={primaryActionSlot}
          listSlot={listSlot}
          editorSlot={editorSlot}
          previewSlot={previewSlot}
        />
      </div>
    </UndoToastProvider>
  );
}
