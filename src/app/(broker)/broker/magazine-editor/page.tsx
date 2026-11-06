"use client";

import React, { useState, useEffect, useCallback, useMemo, Suspense, useRef } from "react";
import { editorToast } from "@/components/magazine-editor/editor-toaster";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import Script from "next/script";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence, MotionConfig } from "motion/react";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";
import { useAsyncState } from "@/lib/magazine/use-async-state";
import { computeTabCompletion, summarizeCompletion } from "@/lib/magazine/editor-progress";
import { cleanNewsText } from "@/lib/magazine/editor-labels";
import type { AiAssistMemory } from "@/components/magazine-editor/EditorAiAssistTab";
import { decodeEntities } from "@/lib/magazine/escape";
import dynamic from "next/dynamic";
import MagazineEditorLoading from "./loading";
import {
  NewsCurationPanel,
  MagazinePhonePreview,
  MagazineShareModal,
  EditionAirtableList,
  AxiosIssuesEditorPanel,
  MonthlyStatsEditorPanel,
  type AirtableEditionItem,
  type CadenceType,
} from "@/components/magazine-editor";
import { SlugSetupGate } from "@/components/magazine-editor/SlugSetupGate";
import { PublishConfirmModal } from "@/components/magazine-editor/PublishConfirmModal";
import { clusterArticlesIntoFiveIssues } from "@/domain/magazine/issue-clustering";
import { getMonthlyChartsForRegion } from "@/domain/magazine/monthly-stats-charts";

const EditorAiAssistTab = dynamic(
  () => import("@/components/magazine-editor/EditorAiAssistTab").then((m) => m.EditorAiAssistTab),
  { ssr: false }
);
const EditorOutreachTab = dynamic(
  () => import("@/components/magazine-editor/EditorOutreachTab").then((m) => m.EditorOutreachTab),
  { ssr: false }
);
const EditorCoverTab = dynamic(
  () => import("@/components/magazine-editor/EditorCoverTab").then((m) => m.EditorCoverTab),
  { ssr: false }
);
const EditorFieldNoteTab = dynamic(
  () => import("@/components/magazine-editor/EditorFieldNoteTab").then((m) => m.EditorFieldNoteTab),
  { ssr: false }
);
const EditorThemeDealsTab = dynamic(
  () => import("@/components/magazine-editor/EditorThemeDealsTab").then((m) => m.EditorThemeDealsTab),
  { ssr: false }
);
const EditorAnalyticsTab = dynamic(
  () => import("@/components/magazine-editor/EditorAnalyticsTab").then((m) => m.EditorAnalyticsTab),
  { ssr: false }
);
const EditorPublishTab = dynamic(
  () => import("@/components/magazine-editor/EditorPublishTab").then((m) => m.EditorPublishTab),
  { ssr: false }
);
import { SaveStatusBadge } from "@/components/magazine-editor/SaveStatusBadge";
import { useEditionAutosave } from "@/components/magazine-editor/useEditionAutosave";
import { buildOgImageUrl } from "@/lib/magazine/view-helpers";
import { todayKst, formatKoreanDate, toKstDate } from "@/lib/magazine/kst";
import { MAGAZINE_SEND_DAY_LABEL } from "@/lib/magazine/schedule-labels";
import {
  DEFAULT_SECTION_ORDER,
  MAX_NEWS_SELECTION,
  buildContentFromForm,
  buildPatchPayload,
  describeDistributeOutcome,
  formFromEdition,
  formSignature,
  toggleNewsSelection,
  type EditionRow,
  type EditorForm,
  type PollOptionForm,
  type TargetSegment,
} from "@/lib/magazine/edition-save";
import {
  extractApiErrorMessage,
  readJsonSafe,
  parseEditorIdentity,
  buildPreviewBroker,
  resolveEditorPublicName,
  type EditorIdentity,
} from "@/lib/magazine/editor-helpers";
import { useEditorMode } from "@/hooks/useEditorMode";
import { SimpleEditor } from "@/components/magazine-editor/simple/SimpleEditor";
import {
  SIMPLE_NOTE_MIN,
  applySimplePreset,
  deriveFallbackHeadline,
  deriveFallbackBriefing,
} from "@/lib/magazine/simple-format";
import {
  adaptBuildingToMagazineDeal,
  resolveDealCoverPhoto,
} from "@/domain/magazine/deal-adapter";
import { WS_TOPBAR_LINKS } from "@/components/workspace/WorkspaceShell";
import { WorkspaceBottomNav } from "@/components/workspace/WorkspaceBottomNav";
import {
  Save,
  Eye,
  ArrowLeft,
  Loader2,
  Info,
  Newspaper,
  Building2,
  Settings,
  Plus,
  Check,
  Send,
  ExternalLink,
  Palette,
  ChevronRight,
  Star,
  ToggleLeft,
  ToggleRight,
  MessageSquare,
  PenLine,
  Target,
  BookOpen,
  Upload,
  X,
  BarChart3,
  Wand2,
  Users,
  Link2,
  Flame,
  Lightbulb,
} from "lucide-react";
import {
  MARKET_TEMP_CONFIG,
  WEEKLY_SECTIONS_MVP,
  getWeekLabel,
  type MarketTemperature,
  type BrokerFieldNote,
  type MagazineEdition,
  type EditionStatus,
  type EditionType,
  type AxiosUnitIssue,
  type MonthlyRegionalChart,
} from "@/domain/magazine/types";
import {
  enrichNewsPoolWithChannels,
  recommendBalancedNewsMix,
  resolveNewsChannel,
  type NewsChannelId,
  type NewsPoolItem,
} from "@/domain/magazine/news-channels";

// ─── 주기별 ≤4개 미니멀 상단 탭 정의 (일간 3탭 / 주간 4탭 / 월간 4탭) ──────────────────────
const TABS = [
  { key: "cover" as const, label: "헤더·제목", icon: Newspaper },
  { key: "field_note" as const, label: "중개인 브리핑", icon: PenLine },
  { key: "monthly_stats" as const, label: "권역 통계 2건", icon: BarChart3 },
  { key: "news" as const, label: "AI 이슈 5선", icon: BookOpen },
  { key: "theme_deals" as const, label: "딜카드·발행", icon: Target },
  { key: "ai_assist" as const, label: "AI비서", icon: Wand2 },
  { key: "outreach" as const, label: "아웃리치", icon: Users },
  { key: "publish" as const, label: "발행설정", icon: Settings },
  { key: "analytics" as const, label: "성과", icon: BarChart3 },
];

type TabKey = (typeof TABS)[number]["key"];

export function getPrimaryTabsForCadence(editionType: EditionType) {
  if (editionType === "daily") {
    return [
      { key: "cover" as const, label: "① 헤더·제목", icon: Newspaper },
      { key: "news" as const, label: "② AI 이슈 5선", icon: BookOpen },
      { key: "theme_deals" as const, label: "③ 딜카드·발행", icon: Target },
    ];
  }
  if (editionType === "monthly") {
    return [
      { key: "cover" as const, label: "① 헤더·제목", icon: Newspaper },
      { key: "monthly_stats" as const, label: "② 권역 통계 2건", icon: BarChart3 },
      { key: "news" as const, label: "③ 월간 이슈 5선", icon: BookOpen },
      { key: "theme_deals" as const, label: "④ 딜카드·발행", icon: Target },
    ];
  }
  // weekly / special 기본 4탭
  return [
    { key: "cover" as const, label: "① 헤더·제목", icon: Newspaper },
    { key: "field_note" as const, label: "② 중개인 브리핑", icon: PenLine },
    { key: "news" as const, label: "③ AI 이슈 5선", icon: BookOpen },
    { key: "theme_deals" as const, label: "④ 딜카드·발행", icon: Target },
  ];
}

const MARKET_TEMPS: MarketTemperature[] = [
  "적극 매수",
  "선별 매수",
  "관망",
  "조정 대기",
  "위기 경계",
];

const EMPTY_FIELD_NOTE: BrokerFieldNote = {
  question: "",
  buyerReaction: "",
  sellerReaction: "",
  marketJudgment: "",
  comment: "",
};

const FIELD_NOTE_FIELDS: {
  key: keyof BrokerFieldNote;
  label: string;
  placeholder: string;
  tooltip: string;
}[] = [
  {
    key: "question",
    label: "주간 시장 요약",
    placeholder: "이번 주 시장을 한 문장으로 요약하면?",
    tooltip: "독자가 가장 먼저 읽는 문장입니다. 핵심을 간결하게 전달하세요.",
  },
  {
    key: "buyerReaction",
    label: "매수자 반응",
    placeholder: "이번 주 매수자들의 반응은? (문의 건수, 주요 관심 유형 등)",
    tooltip: "실제 현장에서 느낀 매수자 분위기를 공유하세요.",
  },
  {
    key: "sellerReaction",
    label: "매도자 반응",
    placeholder: "이번 주 매도자들의 반응은? (호가 변동, 급매 여부 등)",
    tooltip: "매도자 심리와 호가 변화를 전달하세요.",
  },
  {
    key: "marketJudgment",
    label: "시장 판단",
    placeholder: "본인의 시장 판단은? (온도, 방향성, 기회/리스크)",
    tooltip: "중개인으로서의 전문적인 시장 진단을 공유하세요.",
  },
  {
    key: "comment",
    label: "독자에게 한마디",
    placeholder: "독자(투자자)에게 한마디",
    tooltip: "구독자에게 직접 전하는 메시지입니다.",
  },
];

// 설문 선택지 입력칸은 최소 3칸을 보여준다 (비어 있으면 저장 시 제거됨)
function padPollOptions(options: PollOptionForm[]): PollOptionForm[] {
  const next = options.slice(0, 4);
  while (next.length < 3) next.push({ label: "" });
  return next;
}

// ─── 메인 컴포넌트 ──────────────────────────────────────────────────
function MagazineEditorInner() {
  const searchParams = useSearchParams();

  // ── 상태 관리 ──
  const queryMode = searchParams.get("mode");
  const queryTab = searchParams.get("tab");
  const { mode: editorMode, setMode: setEditorMode } = useEditorMode({
    queryMode,
    queryTab,
  });
  const initialTab = (queryTab as TabKey) || "cover";
  const [activeTab, setActiveTab] = useState<TabKey>(TABS.some(t => t.key === initialTab) ? initialTab : "cover");
  const [loading, setLoading] = useState(true);
  const [editionReady, setEditionReady] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [showMobilePreview, setShowMobilePreview] = useState(false);
  const [needsQualityAck, setNeedsQualityAck] = useState(false);
  const [sendAfterPublish, setSendAfterPublish] = useState(true);
  /** 서버 env(MAGAZINE_SEND_ENABLED)는 클라이언트에서 못 읽으므로 draft 응답 meta 로 받는다 (null = 확인 전) */
  const [sendEnabled, setSendEnabled] = useState<boolean | null>(null);
  const [subscriberCount, setSubscriberCount] = useState<number | null>(null);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [editionUpdatedAt, setEditionUpdatedAt] = useState<string | null>(null);
  const [savedTopNews, setSavedTopNews] = useState<Array<Record<string, unknown>>>([]);
  const [savedDealHighlights, setSavedDealHighlights] = useState<Array<Record<string, unknown>>>([]);
  // 최신 값 ref (타이머·핸들러의 stale closure 방지)
  const formRef = useRef({} as EditorForm);
  const baseContentRef = useRef<Record<string, unknown> | null>(null);
  const selectedNewsIdsRef = useRef<string[]>([]);
  const defaultsPendingRef = useRef({ news: false, deals: false });
  const profileSavedRef = useRef({ title: "", color: "" });
  const editorModeRef = useRef(editorMode);
  const brokerPublicNameRef = useRef<string>("");

  // Edition state
  const [editionId, setEditionId] = useState<string | null>(null);
  const [editionLabel, setEditionLabel] = useState(getWeekLabel());
  const [editionType, setEditionType] = useState<EditionType>("weekly");
  const [editionStatus, setEditionStatus] = useState<EditionStatus>("draft");

  // Cover
  const [headline, setHeadline] = useState("");
  const [briefing, setBriefing] = useState("");
  const [marketTemp, setMarketTemp] = useState<MarketTemperature | null>(null);
  const [coverKeywords, setCoverKeywords] = useState<string[]>(["", "", ""]);
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);

  // Field note
  const [fieldNote, setFieldNote] = useState<BrokerFieldNote>(EMPTY_FIELD_NOTE);

  // Theme & Deals
  const [themeTitle, setThemeTitle] = useState("");
  const [themeBodyMd, setThemeBodyMd] = useState("");
  const [selectedDealIds, setSelectedDealIds] = useState<Set<string>>(new Set());
  // allDeals / allNews 는 newsState·dealsState(useAsyncState)에서 파생된다 (아래)

  // News & AXIOS 5-Issue Post-it Cards
  const [selectedNewsIds, setSelectedNewsIds] = useState<Set<string>>(new Set());
  const [extraChannelNews, setExtraChannelNews] = useState<NewsPoolItem[]>([]);
  const [unitIssues, setUnitIssues] = useState<AxiosUnitIssue[]>([]);

  // Monthly Regional Statistics 2-Chart Config
  const [monthlyRegion, setMonthlyRegion] = useState<string>("gbd");
  const [monthlyCharts, setMonthlyCharts] = useState<MonthlyRegionalChart[]>(() =>
    getMonthlyChartsForRegion("gbd")
  );

  // Column 1 Airtable Editions List & Cadence Switcher
  const [editionsList, setEditionsList] = useState<AirtableEditionItem[]>([]);
  const [switchingCadence, setSwitchingCadence] = useState(false);
  const [showInlineAiAssist, setShowInlineAiAssist] = useState(false);
  const editionRowsMapRef = useRef<Map<string, EditionRow>>(new Map());

  // Settings
  const [themeColor, setThemeColor] = useState("#6366f1");
  const [brokerSlug, setBrokerSlug] = useState<string | null>(null);
  const [magazineTitle, setMagazineTitle] = useState("");
  const [showShareModal, setShowShareModal] = useState(false);
  const [distributionResult, setDistributionResult] = useState<any>(null);
  const [isPaidTier, setIsPaidTier] = useState<boolean>(false);
  const [identity, setIdentity] = useState<EditorIdentity | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [magazineData, setMagazineData] = useState<any>(null);
  const [targetSegment, setTargetSegment] = useState<TargetSegment>("all");

  // Poll
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState<PollOptionForm[]>(padPollOptions([]));

  // Tax/Legal Clinic
  const [taxQuestion, setTaxQuestion] = useState("");
  const [taxAnswer, setTaxAnswer] = useState("");
  const [taxSource, setTaxSource] = useState("");

  // Section Order + on/off
  const [sectionOrder, setSectionOrder] = useState<string[]>([...DEFAULT_SECTION_ORDER]);
  const [sectionsEnabled, setSectionsEnabled] = useState<Record<string, boolean>>({});

  // Analytics
  const [topLeads, setTopLeads] = useState<any[]>([]);
  const [editionHistory, setEditionHistory] = useState<any[]>([]);
  const [analyticsData, setAnalyticsData] = useState<{
    subscriberCount: number;
    lastDistribution: { date: string; sentCount: number; failedCount: number; totalCount: number } | null;
    viewStats: { totalViews: number; uniqueVisitors: number; avgDwellSeconds: number; completionRate: number };
  } | null>(null);

  // Tooltip
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

  // AI 비서 입력·결과 (탭 전환으로 사라지지 않게 부모가 보관)
  const [aiMemory, setAiMemory] = useState<AiAssistMemory>({ idea: "", result: "", warnings: [] });

  const today = useMemo(() => todayKst(), []);

  // ── 뉴스 후보 (U-04: loading / error+retry / empty) — 마운트 즉시 병렬 로드 ──
  const newsState = useAsyncState<any[]>(
    async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("external_news")
        .select("id, title, summary, source, sentiment, importance_score, topic, url")
        .order("importance_score", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw new Error("뉴스 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      return ((data ?? []) as any[]).map((n) => ({
        ...n,
        title: cleanNewsText(n.title),
        summary: typeof n.summary === "string" ? decodeEntities(n.summary) : n.summary,
        source: typeof n.source === "string" ? cleanNewsText(n.source) : n.source,
      }));
    },
    [],
    { auto: true }
  );

  // ── 딜카드 후보 + IM 브릿지 추천 매물 — 마운트 즉시 병렬 로드 ──
  const dealsState = useAsyncState<any[]>(
    async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user ?? (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error("로그인이 필요합니다. 다시 로그인해 주세요.");

      const [{ data: dealsData, error }, { data: profileDeals }] = await Promise.all([
        supabase
          .from("building_ssot_lite")
          .select(
            "id, raw_address, area_signal, asset_type, price_band, status, matched_buyer_count, layers"
          )
          .eq("owner_id", user.id)
          .in("status", ["public_signal_ready", "snapshot_draft_ready", "draft"])
          .order("updated_at", { ascending: false })
          .limit(10),
        supabase
          .from("broker_profiles")
          .select("pending_magazine_deals")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);
      if (error) throw new Error("매물 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");

      const candidateBuildingIds = (dealsData || []).map((b: any) => b.id).filter(Boolean);
      const docMap = new Map<string, any>();
      if (candidateBuildingIds.length > 0) {
        try {
          const { data: docData } = await supabase
            .from("document_objects")
            .select("building_id, doc_type, body")
            .in("building_id", candidateBuildingIds)
            .in("doc_type", ["im_lite", "im_lite_draft", "mobile_im"]);
          if (Array.isArray(docData)) {
            for (const doc of docData) {
              if (doc.building_id && !docMap.has(doc.building_id)) {
                docMap.set(doc.building_id, doc);
              }
            }
          }
        } catch {
          // ignore doc loading failure, fallback gracefully
        }
      }

      const mappedDeals = (dealsData || []).map((b: any) => {
        const imDoc = docMap.get(b.id) ?? null;
        const adapted = adaptBuildingToMagazineDeal({ building: b, imDoc });
        return {
          id: b.id,
          address: b.raw_address,
          areaSignal: b.area_signal,
          assetType: b.asset_type,
          price: b.price_band,
          photoUrl: adapted.photoUrl,
          buyerInterestCount: b.matched_buyer_count || 0,
          investmentPoint: adapted.investmentPoint,
          imUrl: adapted.imUrl,
          grossYieldNetOfDeposit: adapted.grossYieldNetOfDeposit,
          noiCapRate: adapted.noiCapRate,
        };
      });

      const pendingDeals = (profileDeals?.pending_magazine_deals || []) as any[];
      pendingDeals.forEach((pd: any) => {
        if (!mappedDeals.some((md) => md.id === pd.buildingId)) {
          mappedDeals.push({
            id: pd.buildingId,
            address: pd.blindName || "미공개 매물",
            areaSignal: pd.blindName || "추천 매물",
            assetType: pd.assetType || "매물",
            price: pd.priceBand || "",
            photoUrl: pd.photoUrl,
            buyerInterestCount: 0,
            investmentPoint: pd.investmentPoint || "",
            imUrl: pd.imUrl || `/im-lite/${pd.buildingId}`,
            grossYieldNetOfDeposit: null,
            noiCapRate: null,
          });
        }
      });

      // Also merge deals from Workspace Summary (/api/broker/workspace/summary) so newly created DealCards/IMs appear immediately
      try {
        const wsRes = await fetch("/api/broker/workspace/summary");
        if (wsRes.ok) {
          const wsData = await wsRes.json();
          const wsDealcards = Array.isArray(wsData?.dealcards) ? wsData.dealcards : [];
          for (const dc of wsDealcards) {
            if (dc?.id && !mappedDeals.some((md) => md.id === dc.id)) {
              const pts = Array.isArray(dc.card4?.points) ? dc.card4.points : [];
              mappedDeals.push({
                id: dc.id,
                address: `${dc.region || ""} ${dc.use || ""}`.trim() || dc.title,
                areaSignal: dc.region || dc.title || "핵심 상권",
                assetType: dc.use || "근린생활시설",
                price: dc.priceBand || "",
                photoUrl: "/test-images/01_exterior.jpg",
                buyerInterestCount: 0,
                investmentPoint: pts.join(" · ") || "핵심 투자 매물",
                imUrl: `/im-lite/${dc.id}`,
                grossYieldNetOfDeposit: null,
                noiCapRate: null,
              });
            }
          }
        }
      } catch {
        // Non-blocking fallback
      }

      return mappedDeals;
    },
    [],
    { auto: true }
  );
  const allNews = useMemo(() => newsState.data ?? [], [newsState.data]);
  const allDeals = useMemo(() => dealsState.data ?? [], [dealsState.data]);

  // ── EditionRow -> Airtable 목록 아이템 변환 ──
  const toAirtableItem = useCallback((ed: EditionRow): AirtableEditionItem => {
    const f = formFromEdition(ed);
    const fn = f.fieldNote;
    const hasBriefing = Boolean(
      f.briefing.trim() ||
        fn.comment.trim() ||
        fn.question.trim() ||
        fn.buyerReaction.trim() ||
        fn.sellerReaction.trim() ||
        fn.marketJudgment.trim()
    );
    const issueCount =
      (f.unitIssues?.filter((u) => u.title.trim() || u.brief.trim()).length ?? 0) ||
      Math.min(5, Math.max(f.selectedNewsIds.length, f.topNews.length));
    const chartCount =
      ed.edition_type === "monthly"
        ? Math.min(2, f.monthlyCharts?.length || 2)
        : f.monthlyCharts?.length ?? 0;
    const dealCount = Math.max(f.selectedDealIds.length, f.dealHighlights.length);
    return {
      id: ed.id,
      edition_type: (ed.edition_type as EditionType) || "weekly",
      edition_label: ed.edition_label || getWeekLabel(),
      status: (ed.status as EditionStatus) || "draft",
      title: f.headline || ed.title || "",
      market_temp: (f.marketTemp as MarketTemperature | null) ?? null,
      updated_at: ed.updated_at ?? null,
      published_at: ed.published_at ?? null,
      hasBriefing,
      issueCount: issueCount > 0 ? issueCount : 5,
      chartCount,
      dealCount,
    };
  }, []);

  // ── 에디션 행을 에디터 폼 상태에 일괄 반영 ──
  const hydrateEditorFromEdition = useCallback(
    (
      ed: EditionRow,
      opts?: { created?: boolean; ident?: EditorIdentity | null; preserveQuerySelection?: boolean }
    ) => {
      editionRowsMapRef.current.set(ed.id, ed);
      const f = formFromEdition(ed);
      const edType = ((ed.edition_type as EditionType) || "weekly") as EditionType;
      const edContent: Record<string, unknown> =
        ed.content && typeof ed.content === "object" ? (ed.content as Record<string, unknown>) : {};

      setEditionId(ed.id);
      if (ed.edition_label) setEditionLabel(ed.edition_label);
      setEditionType(edType);
      setEditionStatus((ed.status as EditionStatus) || "draft");
      setPublishedAt(ed.published_at ?? null);
      setEditionUpdatedAt(ed.updated_at ?? null);
      setMagazineData({
        ...edContent,
        kind: edType === "monthly" ? "monthly" : edType === "daily" ? "daily" : edType === "special" ? "special" : "weekly",
      });
      setHeadline(f.headline);
      setBriefing(f.briefing);
      setMarketTemp((f.marketTemp as MarketTemperature | null) ?? "선별 매수");
      setCoverKeywords(f.coverKeywords);
      setCoverImageUrl(f.coverImageUrl);
      setFieldNote(f.fieldNote);
      setThemeTitle(f.themeTitle);
      setThemeBodyMd(f.themeBodyMd);
      if (opts?.created && opts?.ident?.magazineThemeColor) {
        setThemeColor(opts.ident.magazineThemeColor);
      } else {
        setThemeColor(f.themeColor);
      }
      if (!opts?.preserveQuerySelection || !searchParams.get("deals")) {
        setSelectedDealIds(new Set(f.selectedDealIds));
      }
      if (!opts?.preserveQuerySelection || !searchParams.get("news")) {
        setSelectedNewsIds(new Set(f.selectedNewsIds.slice(0, MAX_NEWS_SELECTION)));
      }
      setSavedTopNews(f.topNews);
      setSavedDealHighlights(f.dealHighlights);
      setPollQuestion(f.pollQuestion);
      setPollOptions(padPollOptions(f.pollOptions));
      setTaxQuestion(f.taxQuestion);
      setTaxAnswer(f.taxAnswer);
      setTaxSource(f.taxSource);
      setSectionOrder(f.sectionOrder);

      // 주기별 구조 공식 자동 정렬:
      // - 일간(daily): 헤더+제목+이슈 5건+딜카드 (브리핑 비활성)
      // - 주간(weekly): 헤더+제목+중개인 브리핑+이슈 5건+딜카드
      // - 월간(monthly): 헤더+제목+권역별 유용한 통계 2건 그래프+월간 이슈 5건+딜카드
      const nextSectionsEnabled = { ...f.sectionsEnabled };
      if (edType === "daily") {
        nextSectionsEnabled.field_note = false;
        nextSectionsEnabled.ai_briefing = false;
        nextSectionsEnabled.news_curation = true;
        nextSectionsEnabled.featured_deals = true;
      } else if (edType === "monthly") {
        nextSectionsEnabled.field_note = false;
        nextSectionsEnabled.ai_briefing = false;
        nextSectionsEnabled.market_data = true;
        nextSectionsEnabled.news_curation = true;
        nextSectionsEnabled.featured_deals = true;
      } else {
        if (nextSectionsEnabled.field_note === undefined) nextSectionsEnabled.field_note = true;
        if (nextSectionsEnabled.ai_briefing === undefined) nextSectionsEnabled.ai_briefing = true;
      }
      setSectionsEnabled(nextSectionsEnabled);
      setTargetSegment(f.targetSegment);

      // 월간 권역 통계 2건 초기화
      const nextRegion = f.monthlyRegion || "gbd";
      setMonthlyRegion(nextRegion);
      if (Array.isArray(f.monthlyCharts) && f.monthlyCharts.length >= 2) {
        setMonthlyCharts(f.monthlyCharts.slice(0, 2));
      } else {
        setMonthlyCharts(getMonthlyChartsForRegion(nextRegion));
      }

      // AXIOS 단위 이슈 5건 초기화
      if (Array.isArray(f.unitIssues) && f.unitIssues.length > 0) {
        setUnitIssues(f.unitIssues);
      } else {
        setUnitIssues([]);
      }

      const isDraftNewOrEmpty = Boolean(opts?.created || ed.status === "draft");
      defaultsPendingRef.current = {
        news:
          isDraftNewOrEmpty &&
          (!Array.isArray(edContent.selected_news_ids) ||
            edContent.selected_news_ids.length === 0 ||
            f.selectedNewsIds.length === 0),
        deals:
          isDraftNewOrEmpty &&
          (!Array.isArray(ed.featured_deal_ids) ||
            ed.featured_deal_ids.length === 0 ||
            f.selectedDealIds.length === 0),
      };

      if (!f.headline) {
        const fallbackName =
          opts?.ident?.magazineTitle ||
          opts?.ident?.brokerName ||
          opts?.ident?.displayName ||
          brokerPublicNameRef.current;
        const cadencePrefix =
          edType === "daily"
            ? "[일간 브리핑] "
            : edType === "monthly"
            ? "[월간 리포트] "
            : "";
        setHeadline(`${cadencePrefix}${deriveFallbackHeadline("", fallbackName)}`.trim());
      }

      // 목록 상태 갱신
      setEditionsList((prev) => {
        const item = toAirtableItem(ed);
        const exists = prev.some((x) => x.id === item.id);
        if (exists) {
          return prev.map((x) => (x.id === item.id ? item : x));
        }
        return [item, ...prev];
      });
    },
    [searchParams, toAirtableItem]
  );

  // ── 데이터 로딩 (프로필 + 이번 호 초안 동시 병렬 요청으로 직렬 워터폴 제거) ──
  useEffect(() => {
    async function loadData() {
      try {
        const initialCadence = (searchParams.get("cadence") as EditionType) || "weekly";
        const requestDraft = (cadence: EditionType = initialCadence) =>
          fetch("/api/magazine/editions/draft", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ edition_type: cadence }),
          });

        const [profileApiRes, initialDraftRes, allEditionsRes] = await Promise.all([
          fetch("/api/broker/profile").catch(() => null),
          requestDraft().catch(() => null),
          fetch("/api/magazine/editions?type=all&limit=40").catch(() => null),
        ]);

        if (profileApiRes?.status === 401) {
          setLoadError("로그인이 필요합니다. 다시 로그인해 주세요.");
          return;
        }

        // 정체성/slug는 서버 프로필 API가 단일 출처 (slug 자동 생성 포함). "demo" 폴백 없음.
        let ident: EditorIdentity | null = null;
        if (profileApiRes && profileApiRes.ok) {
          ident = parseEditorIdentity(await readJsonSafe(profileApiRes));
        }
        if (!ident) {
          setLoadError("프로필을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
          return;
        }

        setIdentity(ident);
        setIsPaidTier(ident.isPaid);
        setMagazineTitle(ident.magazineTitle);
        if (ident.magazineThemeColor) setThemeColor(ident.magazineThemeColor);

        // slug가 없으면 편집 UI를 차단하고 설정 화면(SlugSetupGate)을 보여준다
        if (!ident.slug) return;
        const slug = ident.slug;
        setBrokerSlug(slug);

        // 0. 전체 호수 목록 (에어테이블 그리드용)
        if (allEditionsRes && allEditionsRes.ok) {
          const allJson = (await readJsonSafe(allEditionsRes)) as { editions?: EditionRow[] } | null;
          if (Array.isArray(allJson?.editions)) {
            allJson.editions.forEach((row) => editionRowsMapRef.current.set(row.id, row));
            setEditionsList(allJson.editions.map((row) => toAirtableItem(row)));
          }
        }

        // 1. 이번 호 초안 (초기 병렬 요청이 첫 진입 slug 생성 타이밍으로 실패했을 때만 1회 재시도)
        let draftRes = initialDraftRes;
        if (!draftRes || !draftRes.ok) {
          draftRes = await requestDraft();
        }
        const draftJson = (await readJsonSafe(draftRes)) as {
          edition?: EditionRow;
          created?: boolean;
          meta?: { sendEnabled?: boolean; subscriberCount?: number | null };
        } | null;
        if (!draftRes.ok || !draftJson?.edition) {
          setLoadError(extractApiErrorMessage(draftJson, "이번 호 초안을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."));
          return;
        }
        const ed = draftJson.edition;
        hydrateEditorFromEdition(ed, {
          created: draftJson.created,
          ident,
          preserveQuerySelection: true,
        });

        profileSavedRef.current = { title: ident.magazineTitle, color: ident.magazineThemeColor ?? "" };
        const initialSendEnabled = typeof draftJson.meta?.sendEnabled === "boolean" ? draftJson.meta.sendEnabled : null;
        setSendEnabled(initialSendEnabled);
        if (initialSendEnabled === false) {
          setSendAfterPublish(false);
        }
        setSubscriberCount(
          typeof draftJson.meta?.subscriberCount === "number" ? draftJson.meta.subscriberCount : null
        );
        setEditionReady(true);

        // 5. 매거진 성과 데이터 로드
        try {
          const analyticsRes = await fetch("/api/broker/magazine/analytics");
          if (analyticsRes.ok) {
            const analyticsJson = await analyticsRes.json();
            setAnalyticsData({
              subscriberCount: analyticsJson.subscriberCount,
              lastDistribution: analyticsJson.lastDistribution,
              viewStats: analyticsJson.viewStats,
            });
            setEditionHistory(analyticsJson.editions || []);
          }
        } catch (analyticsErr) {
          console.warn("[magazine-editor] Analytics load failed (non-blocking):", analyticsErr);
        }

        // 6. 구독자 매수 온도 Top 리드 로드
        try {
          const subsRes = await fetch("/api/broker/magazine/subscribers?status=active&limit=50");
          if (subsRes.ok) {
            const subsJson = await subsRes.json();
            const sorted = (subsJson.subscribers || [])
              .filter((s: any) => s.temperatureConfig?.minScore > 0)
              .sort((a: any, b: any) => (b.temperatureConfig?.minScore || 0) - (a.temperatureConfig?.minScore || 0))
              .slice(0, 5);
            setTopLeads(sorted);
          }
        } catch (subsErr) {
          console.warn("[magazine-editor] Subscribers load failed (non-blocking):", subsErr);
        }
      } catch (err) {
        console.error("Failed to load magazine data", err);
        setLoadError("매거진 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      } finally {
        setLoading(false);
      }
    }
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isPublished = editionStatus === "published";
  // 발행본은 최초 발행일(KST)의 공개 주소를 쓴다
  const publishedIssueDate = useMemo(
    () => (publishedAt ? toKstDate(new Date(publishedAt)) : today),
    [publishedAt, today]
  );

  // 저장된 선택(스냅샷) + 실시간 추가 뉴스 + 5대 관심 채널 큐레이션 풀을 합쳐 항상 풍성한 채널 선택지를 제공한다
  const newsPool = useMemo(() => {
    const baseMerged: any[] = [];
    const seen = new Set<string>();
    const pushUnique = (item: any) => {
      const id = String(item?.id ?? item?.title ?? "");
      if (!id || seen.has(id)) return;
      seen.add(id);
      baseMerged.push(item);
    };

    extraChannelNews.forEach(pushUnique);
    allNews.forEach(pushUnique);
    savedTopNews
      .map((n) => ({
        id: String(n.id ?? n.title ?? ""),
        title: typeof n.title === "string" ? cleanNewsText(n.title) : n.title,
        summary: typeof n.summary === "string" ? decodeEntities(n.summary) : n.summary,
        source: typeof n.source === "string" ? cleanNewsText(n.source) : n.source,
        sentiment: n.sentiment,
        topic: n.topic,
        channel: n.channel,
        url: n.url,
      }))
      .forEach(pushUnique);

    return enrichNewsPoolWithChannels(baseMerged) as any[];
  }, [allNews, extraChannelNews, savedTopNews]);

  // ── AXIOS 5대 이슈 자동 클러스터링 초기화 (비어 있을 때 5건 자동 생성) ──
  useEffect(() => {
    if (unitIssues.length > 0) return;
    if (newsPool.length === 0) return;
    const clustered = clusterArticlesIntoFiveIssues(newsPool, {
      preferredIds: Array.from(selectedNewsIds),
      cadence: editionType === "monthly" ? "monthly" : editionType === "daily" ? "daily" : "weekly",
    });
    setUnitIssues(clustered);
  }, [newsPool, selectedNewsIds, editionType, unitIssues.length]);

  const dealPool = useMemo(() => {
    const seen = new Set(allDeals.map((d: any) => String(d.id)));
    const extra = savedDealHighlights.filter((d) => d.id != null && !seen.has(String(d.id)));
    return [...allDeals, ...extra] as any[];
  }, [allDeals, savedDealHighlights]);

  const topNewsSnapshot = useMemo(() => {
    const byId = new Map(newsPool.map((n: any) => [String(n.id ?? n.title), n]));
    return Array.from(selectedNewsIds)
      .map((id) => byId.get(id))
      .filter((n): n is any => !!n)
      .map((n: any) => ({
        id: String(n.id ?? n.title),
        title: n.title,
        summary: n.summary,
        source: n.source,
        sentiment: n.sentiment,
        topic: n.topic,
        channel: resolveNewsChannel(n),
        ...(typeof n.url === "string" && n.url.trim() ? { url: n.url.trim() } : {}),
      }));
  }, [newsPool, selectedNewsIds]);

  const dealSnapshot = useMemo(() => {
    const byId = new Map(dealPool.map((d: any) => [String(d.id), d]));
    return Array.from(selectedDealIds)
      .map((id) => byId.get(id))
      .filter((d): d is any => !!d) as Array<Record<string, unknown>>;
  }, [dealPool, selectedDealIds]);

  // ── 에디터 폼 (저장·미리보기·변경 감지의 단일 출처) ──
  const form: EditorForm = useMemo(
    () => ({
      headline,
      briefing,
      marketTemp,
      coverKeywords,
      coverImageUrl,
      fieldNote,
      themeTitle,
      themeBodyMd,
      themeColor,
      selectedDealIds: Array.from(selectedDealIds),
      selectedNewsIds: Array.from(selectedNewsIds),
      topNews: topNewsSnapshot,
      dealHighlights: dealSnapshot,
      pollQuestion,
      pollOptions,
      taxQuestion,
      taxAnswer,
      taxSource,
      sectionOrder,
      sectionsEnabled,
      targetSegment,
      unitIssues,
      monthlyCharts: editionType === "monthly" ? monthlyCharts : undefined,
      monthlyRegion: editionType === "monthly" ? monthlyRegion : undefined,
    }),
    [
      headline,
      briefing,
      marketTemp,
      coverKeywords,
      coverImageUrl,
      fieldNote,
      themeTitle,
      themeBodyMd,
      themeColor,
      selectedDealIds,
      selectedNewsIds,
      topNewsSnapshot,
      dealSnapshot,
      pollQuestion,
      pollOptions,
      taxQuestion,
      taxAnswer,
      taxSource,
      sectionOrder,
      sectionsEnabled,
      targetSegment,
      unitIssues,
      editionType,
      monthlyCharts,
      monthlyRegion,
    ]
  );
  const signature = useMemo(() => formSignature(form), [form]);

  // 현재 에디션의 실시간 구성 현황을 좌측 에어테이블 목록에도 동기화
  const liveEditionsList = useMemo(() => {
    if (!editionId) return editionsList;
    const fn = fieldNote;
    const hasBriefing = Boolean(
      briefing.trim() ||
        fn.comment.trim() ||
        fn.question.trim() ||
        fn.buyerReaction.trim() ||
        fn.sellerReaction.trim() ||
        fn.marketJudgment.trim()
    );
    const liveIssueCount =
      unitIssues.filter((u) => u.title.trim() || u.brief.trim()).length || 5;
    const liveChartCount = editionType === "monthly" ? Math.min(2, monthlyCharts.length || 2) : 0;
    const liveDealCount = selectedDealIds.size;

    const currentItem: AirtableEditionItem = {
      id: editionId,
      edition_type: editionType,
      edition_label: editionLabel,
      status: editionStatus,
      title: headline,
      market_temp: marketTemp,
      updated_at: editionUpdatedAt,
      published_at: publishedAt,
      hasBriefing,
      issueCount: liveIssueCount,
      chartCount: liveChartCount,
      dealCount: liveDealCount,
    };

    const exists = editionsList.some((x) => x.id === editionId);
    if (!exists) return [currentItem, ...editionsList];
    return editionsList.map((x) => (x.id === editionId ? currentItem : x));
  }, [
    editionId,
    editionsList,
    fieldNote,
    briefing,
    unitIssues,
    editionType,
    monthlyCharts.length,
    selectedDealIds.size,
    editionLabel,
    editionStatus,
    headline,
    marketTemp,
    editionUpdatedAt,
    publishedAt,
  ]);

  // 탭 작성 완료 ✓ (T1-UX-2)
  const completion = useMemo(() => computeTabCompletion(form, isPublished), [form, isPublished]);
  const progress = useMemo(() => summarizeCompletion(completion), [completion]);

  // 타이머/핸들러는 항상 최신 값을 ref 로 읽는다 (stale closure 방지)
  useEffect(() => {
    formRef.current = form;
    baseContentRef.current = magazineData;
    selectedNewsIdsRef.current = Array.from(selectedNewsIds);
    editorModeRef.current = editorMode;
    brokerPublicNameRef.current = resolveEditorPublicName(identity, brokerSlug ?? "");
  });
  const getPayload = useCallback(() => {
    const basePayload = buildPatchPayload(baseContentRef.current, formRef.current);
    if (editorModeRef.current !== "simple") {
      return basePayload;
    }
    const simpleContent = applySimplePreset(basePayload.content, {
      brokerName: brokerPublicNameRef.current,
    });
    const resolvedTitle =
      basePayload.title.trim() ||
      (typeof simpleContent.headline === "string" ? simpleContent.headline : "");
    return {
      ...basePayload,
      title: resolvedTitle,
      content: simpleContent,
    };
  }, []);

  // ── 단일 저장 경로: 3초 debounce + 30초 주기, 변경분만, updated_at 낙관적 동시성 ──
  const autosave = useEditionAutosave({
    editionId,
    ready: editionReady,
    enabled: !isPublished,
    signature,
    getPayload,
    initialUpdatedAt: editionUpdatedAt,
  });
  const { saveNow, syncUpdatedAt } = autosave;

  // ── 주기(일간·주간·월간) 전환 또는 해당 주기 초안 열기/생성 ──
  const handleSwitchOrCreateCadence = useCallback(
    async (targetCadence: CadenceType) => {
      if (switchingCadence) return;
      setSwitchingCadence(true);
      try {
        if (editionReady && !isPublished) {
          await saveNow().catch(() => false);
        }
        const res = await fetch("/api/magazine/editions/draft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ edition_type: targetCadence }),
        });
        const json = (await readJsonSafe(res)) as {
          edition?: EditionRow;
          created?: boolean;
        } | null;
        if (!res.ok || !json?.edition) {
          editorToast.error("해당 주기의 편집 초안을 불러오지 못했습니다.");
          return;
        }
        hydrateEditorFromEdition(json.edition, {
          created: json.created,
          ident: identity,
        });
        syncUpdatedAt(json.edition.updated_at ?? null);
        // 새로 생성되었거나 이슈가 비어 있으면 해당 주기에 맞춰 5건 클러스터링
        const edForm = formFromEdition(json.edition);
        if (!edForm.unitIssues || edForm.unitIssues.length === 0) {
          setUnitIssues(
            clusterArticlesIntoFiveIssues(newsPool, {
              preferredIds: edForm.selectedNewsIds,
              cadence: targetCadence,
            })
          );
        }
        // 현재 탭이 새 주기의 기본 탭에 없으면 첫 번째 탭(또는 주기 특화 탭)으로 자연스럽게 이동
        const nextPrimaryKeys = getPrimaryTabsForCadence(targetCadence).map((t) => t.key);
        if (!nextPrimaryKeys.includes(activeTab as any)) {
          setActiveTab(targetCadence === "monthly" ? "monthly_stats" : "cover");
        }
        const cadenceKo =
          targetCadence === "daily" ? "일간" : targetCadence === "monthly" ? "월간" : "주간";
        editorToast.success(`${cadenceKo} 뉴스레터 편집 화면으로 전환했습니다.`);
      } catch {
        editorToast.error("주기 전환 중 오류가 발생했습니다.");
      } finally {
        setSwitchingCadence(false);
      }
    },
    [
      switchingCadence,
      editionReady,
      isPublished,
      saveNow,
      hydrateEditorFromEdition,
      identity,
      syncUpdatedAt,
      newsPool,
      activeTab,
    ]
  );

  // ── 좌측 에어테이블 목록에서 특정 호수 선택 ──
  const handleSelectEdition = useCallback(
    async (item: AirtableEditionItem) => {
      if (item.id === editionId) return;
      setSwitchingCadence(true);
      try {
        if (editionReady && !isPublished) {
          await saveNow().catch(() => false);
        }
        let row = editionRowsMapRef.current.get(item.id);
        if (!row) {
          const res = await fetch(`/api/magazine/editions/${encodeURIComponent(item.id)}`);
          const json = (await readJsonSafe(res)) as { edition?: EditionRow } | null;
          if (res.ok && json?.edition) {
            row = json.edition;
          }
        }
        if (!row) {
          editorToast.warning("선택한 호수를 불러오지 못했습니다.");
          return;
        }
        hydrateEditorFromEdition(row, { ident: identity });
        syncUpdatedAt(row.updated_at ?? null);
        const nextPrimaryKeys = getPrimaryTabsForCadence(
          (row.edition_type as EditionType) || "weekly"
        ).map((t) => t.key);
        if (!nextPrimaryKeys.includes(activeTab as any)) {
          setActiveTab("cover");
        }
      } catch {
        editorToast.warning("호수 전환 중 오류가 발생했습니다.");
      } finally {
        setSwitchingCadence(false);
      }
    },
    [editionId, editionReady, isPublished, saveNow, hydrateEditorFromEdition, identity, syncUpdatedAt, activeTab]
  );

  // ── 좌측 에어테이블 목록에서 호수 복제 ──
  const handleDuplicateEdition = useCallback(
    async (item: AirtableEditionItem) => {
      const sourceRow = editionRowsMapRef.current.get(item.id);
      const targetCadence: CadenceType =
        item.edition_type === "daily"
          ? "daily"
          : item.edition_type === "monthly"
          ? "monthly"
          : "weekly";
      await handleSwitchOrCreateCadence(targetCadence);
      if (sourceRow) {
        const srcForm = formFromEdition(sourceRow);
        if (srcForm.headline) setHeadline(`${srcForm.headline} (복제본)`);
        if (srcForm.briefing) setBriefing(srcForm.briefing);
        if (srcForm.unitIssues && srcForm.unitIssues.length > 0) setUnitIssues(srcForm.unitIssues);
        if (srcForm.monthlyCharts && srcForm.monthlyCharts.length > 0) setMonthlyCharts(srcForm.monthlyCharts);
        if (srcForm.selectedDealIds.length > 0) setSelectedDealIds(new Set(srcForm.selectedDealIds));
      }
      editorToast.success(`${item.edition_label} 구성을 현재 초안에 복제했습니다.`);
    },
    [handleSwitchOrCreateCadence]
  );

  // 미리보기 = 저장될 content 와 같은 변환 결과 (비어 있는 설문/세무는 섹션 자체가 사라진다)
  const previewData = useMemo<any>(() => {
    const baseContent = buildContentFromForm(magazineData, form);
    const modeContent =
      editorMode === "simple"
        ? applySimplePreset(baseContent, {
            brokerName: resolveEditorPublicName(identity, brokerSlug ?? ""),
          })
        : baseContent;
    const resolvedKind =
      editionType === "monthly"
        ? "monthly"
        : editionType === "daily"
        ? "daily"
        : editionType === "special"
        ? "special"
        : "weekly";
    return {
      ...modeContent,
      kind: resolvedKind,
      themeColor,
      unit_issues: unitIssues,
      ...(editionType === "monthly"
        ? {
            monthly_charts: monthlyCharts,
            monthly_region: monthlyRegion,
          }
        : {}),
    };
  }, [
    magazineData,
    form,
    themeColor,
    editorMode,
    identity,
    brokerSlug,
    editionType,
    unitIssues,
    monthlyCharts,
    monthlyRegion,
  ]);

  // 미리보기 전용: 항상 로그인한 본인 프로필로 표시 (저장되는 content에는 섞지 않는다)
  const previewViewData = useMemo(() => {
    const ownBroker = buildPreviewBroker(identity);
    if (!ownBroker) return previewData;
    return { ...previewData, broker: ownBroker };
  }, [previewData, identity]);

  // ── 드래프트 블록에서 브리핑 데이터 자동 로드 ──
  useEffect(() => {
    if (editionId && previewData?.draft_blocks) {
      const briefingBlock = previewData.draft_blocks.find(
        (b: any) => b.type === 'briefing'
      );
      if (briefingBlock && !briefing) {
        setBriefing(briefingBlock.data.text as string);
      }
    }
  }, [editionId, previewData, briefing]);

  // ── URL 쿼리 파라미터에서 선택 항목 초기화 (뉴스는 최대 6개) ──
  useEffect(() => {
    const dealsParam = searchParams.get("deals");
    const newsParam = searchParams.get("news");

    if (dealsParam) {
      setSelectedDealIds(new Set(dealsParam.split(",").filter(Boolean)));
    }
    if (newsParam) {
      setSelectedNewsIds(new Set(newsParam.split(",").filter(Boolean).slice(0, MAX_NEWS_SELECTION)));
    }
  }, [searchParams]);

  // ── 새 초안일 때만 기본 선택 (저장된 선택을 사용자가 비웠다면 다시 채우지 않는다) ──
  useEffect(() => {
    if (!defaultsPendingRef.current.news) return;
    if (newsState.status === "idle" || newsState.status === "loading") return;
    if (newsPool.length === 0) return;
    defaultsPendingRef.current.news = false;
    if (selectedNewsIds.size === 0 && !searchParams.get("news")) {
      const balanced = recommendBalancedNewsMix(newsPool, 4);
      selectedNewsIdsRef.current = balanced;
      setSelectedNewsIds(new Set(balanced));
    }
  }, [newsPool, newsState.status, searchParams, selectedNewsIds.size]);

  useEffect(() => {
    if (!defaultsPendingRef.current.deals) return;
    if (allDeals.length === 0) return;
    defaultsPendingRef.current.deals = false;
    if (selectedDealIds.size === 0 && !searchParams.get("deals")) {
      setSelectedDealIds(new Set(allDeals.slice(0, 3).map((d: any) => d.id)));
    }
  }, [allDeals, searchParams, selectedDealIds.size]);

  // ── 실시간 미리보기 데이터 ──

  // ── 뉴스 토글 (최대 6개) ──
  const toggleNews = useCallback((newsId: string) => {
    const { next, rejected } = toggleNewsSelection(selectedNewsIdsRef.current, newsId);
    if (rejected) {
      editorToast.warning(`뉴스는 최대 ${MAX_NEWS_SELECTION}개까지 선택할 수 있습니다. 다른 뉴스를 먼저 해제해 주세요.`);
      return;
    }
    selectedNewsIdsRef.current = next;
    setSelectedNewsIds(new Set(next));
  }, []);

  const replaceNewsSelection = useCallback((ids: string[]) => {
    const capped = Array.from(new Set(ids.filter(Boolean))).slice(0, MAX_NEWS_SELECTION);
    selectedNewsIdsRef.current = capped;
    setSelectedNewsIds(new Set(capped));
  }, []);

  const appendChannelNews = useCallback((items: NewsPoolItem[], autoSelectIds?: string[]) => {
    if (!Array.isArray(items) || items.length === 0) return;
    setExtraChannelNews((prev) => {
      const seen = new Set(prev.map((x) => String(x.id ?? x.title)));
      const fresh = items.filter((item) => {
        const key = String(item.id ?? item.title ?? "");
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return [...fresh, ...prev];
    });
    if (Array.isArray(autoSelectIds) && autoSelectIds.length > 0) {
      const merged = Array.from(new Set([...autoSelectIds, ...selectedNewsIdsRef.current])).slice(
        0,
        MAX_NEWS_SELECTION
      );
      selectedNewsIdsRef.current = merged;
      setSelectedNewsIds(new Set(merged));
    }
  }, []);

  const refreshLiveChannelNews = useCallback(
    async (channel: NewsChannelId) => {
      try {
        const res = await fetch("/api/broker/magazine/news-channels", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "refresh", channel }),
        });
        const data = await res.json().catch(() => null);
        if (res.ok && Array.isArray(data?.items)) {
          appendChannelNews(data.items);
          editorToast.success("채널별 최신 뉴스를 불러왔습니다");
        } else {
          editorToast.warning("기본 추천 채널 뉴스를 표시합니다");
        }
      } catch {
        editorToast.warning("네트워크 상태를 확인해 주세요");
      }
    },
    [appendChannelNews]
  );

  // ── 딜카드 토글 ──
  const toggleDeal = useCallback((dealId: string) => {
    setSelectedDealIds((prev) => {
      const next = new Set(prev);
      if (next.has(dealId)) {
        next.delete(dealId);
      } else {
        next.add(dealId);
      }
      return next;
    });
  }, []);

  // ── 필드노트 업데이트 ──
  const updateFieldNote = useCallback((key: keyof BrokerFieldNote, value: string) => {
    setFieldNote((prev) => ({ ...prev, [key]: value }));
  }, []);

  // ── 키워드 업데이트 ──
  const updateKeyword = useCallback((index: number, value: string) => {
    setCoverKeywords((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }, []);

  // ── 단일 저장 경로: 수동 저장 = 자동 저장과 같은 PATCH (E-01) ──
  const handleManualSave = useCallback(async () => {
    if (!editionReady || isPublished) return;
    const ok = await saveNow();
    if (ok) editorToast.success("저장되었습니다");
    else editorToast.error("저장하지 못했습니다. 상단의 저장 상태를 확인해 주세요.");
  }, [editionReady, isPublished, saveNow]);

  // ── 서버가 돌려준 에디션 행을 화면 상태에 반영 (발행 직후) ──
  const applyEditionRow = useCallback(
    (row: EditionRow) => {
      setEditionId(row.id);
      if (row.edition_label) setEditionLabel(row.edition_label);
      if (row.edition_type) setEditionType(row.edition_type as EditionType);
      setEditionStatus((row.status as EditionStatus) || "draft");
      setPublishedAt(row.published_at ?? null);
      setEditionUpdatedAt(row.updated_at ?? null);
      syncUpdatedAt(row.updated_at ?? null);
      if (row.content && typeof row.content === "object") {
        setMagazineData(row.content as Record<string, unknown>);
      }
    },
    [syncUpdatedAt]
  );

  // ── 프로필의 매거진 제목/컬러 (발행 때만 함께 저장, 실패해도 발행은 막지 않음) ──
  const saveProfileSettings = useCallback(async () => {
    const last = profileSavedRef.current;
    if (last.title === magazineTitle && last.color === themeColor) return;
    try {
      const profileRes = await fetch("/api/broker/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ magazine_title: magazineTitle, magazine_theme_color: themeColor }),
      });
      if (profileRes.ok) {
        profileSavedRef.current = { title: magazineTitle, color: themeColor };
      } else {
        editorToast.warning("매거진 제목·컬러를 프로필에 저장하지 못했습니다. 발행은 계속 진행합니다.");
      }
    } catch {
      editorToast.warning("매거진 제목·컬러를 프로필에 저장하지 못했습니다. 발행은 계속 진행합니다.");
    }
  }, [magazineTitle, themeColor]);

  // ── 발행(정정 발행) 버튼: 먼저 저장 → 사전 점검 → 확인 모달 ──
  const handleOpenPublish = useCallback(
    async (ensuredHeadlineArg?: unknown) => {
      if (!editionId || !editionReady) return;
      const argHeadline =
        typeof ensuredHeadlineArg === "string" ? ensuredHeadlineArg.trim() : "";
      let effectiveHeadline = argHeadline || headline.trim();

      if (
        !effectiveHeadline &&
        fieldNote.comment.trim().length >= SIMPLE_NOTE_MIN
      ) {
        effectiveHeadline = deriveFallbackHeadline(
          fieldNote.comment,
          brokerPublicNameRef.current,
        );
        setHeadline(effectiveHeadline);
        formRef.current = { ...formRef.current, headline: effectiveHeadline };
      }

      if (
        editorModeRef.current === "simple" &&
        !briefing.trim() &&
        fieldNote.comment.trim().length >= SIMPLE_NOTE_MIN
      ) {
        const autoBriefing = deriveFallbackBriefing({
          comment: fieldNote.comment,
          dealCount: selectedDealIds.size,
          newsTitles: topNewsSnapshot.map((n) => String(n.title ?? "")),
          marketTemp: marketTemp ?? "선별 매수",
        });
        setBriefing(autoBriefing);
        formRef.current = { ...formRef.current, briefing: autoBriefing };
      }

      if (!effectiveHeadline) {
        editorToast.error("헤드라인을 입력해 주세요.");
        if (editorModeRef.current === "full") {
          setActiveTab("cover");
        }
        return;
      }
      if (!isPublished) {
        const ok = await saveNow();
        if (!ok) {
          editorToast.error("저장하지 못해 발행을 멈췄습니다. 저장 상태를 확인한 뒤 다시 시도해 주세요.");
          return;
        }
      }
      setPublishError(null);
      setNeedsQualityAck(false);
      setShowPublishConfirm(true);
    },
    [
      editionId,
      editionReady,
      headline,
      briefing,
      fieldNote.comment,
      selectedDealIds.size,
      topNewsSnapshot,
      marketTemp,
      isPublished,
      saveNow,
    ]
  );

  // ── 확인 모달의 최종 발행: 서버 원자 발행 → (선택) 발송 요청 → 정직한 결과 안내 ──
  const handleConfirmPublish = useCallback(
    async (opts: { acknowledgeQualityGate: boolean }) => {
      if (!editionId) return;
      const correction = isPublished;
      setPublishing(true);
      setPublishError(null);
      try {
        await saveProfileSettings();

        const res = await fetch(`/api/magazine/editions/${editionId}/publish`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            correction,
            acknowledgeQualityGate: opts.acknowledgeQualityGate,
            payload: getPayload(),
          }),
        });
        const json = (await readJsonSafe(res)) as {
          edition?: EditionRow;
          issueDate?: string;
          error?: { code?: string };
        } | null;

        if (!res.ok || !json?.edition) {
          const code = json?.error?.code;
          if (code === "QUALITY_GATE_REVIEW") {
            setNeedsQualityAck(true);
            editorToast.warning(extractApiErrorMessage(json, "품질 점검을 통과하지 못했습니다. 확인 후 다시 발행해 주세요."));
            return;
          }
          if (code === "EMPTY_HEADLINE" || code === "EMPTY_BODY") {
            setShowPublishConfirm(false);
            setActiveTab("cover");
            editorToast.error(extractApiErrorMessage(json, "발행에 실패했습니다. 잠시 후 다시 시도해 주세요."));
            return;
          }
          const failMsg = extractApiErrorMessage(json, "발행에 실패했습니다. 잠시 후 다시 시도해 주세요.");
          setPublishError(failMsg);
          editorToast.error(failMsg);
          return;
        }

        applyEditionRow(json.edition);
        setPublishError(null);
        setShowPublishConfirm(false);
        const issueDate = json.issueDate || todayKst();

        // 활동 기록 (실패해도 발행에는 영향 없음)
        try {
          const supabase = createClient();
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { error: activityErr } = await supabase.from("activity_events").insert({
              actor_id: user.id,
              actor_role: "broker",
              event_type: "magazine_distributed",
              entity_type: "magazine_edition",
              entity_id: editionId,
              metadata: { date: issueDate, correction },
            });
            if (activityErr) console.warn("[publish] activity insert failed:", activityErr.message);
          }
        } catch (activityErr) {
          console.warn("[publish] activity insert failed:", activityErr);
        }

        if (correction) {
          editorToast.success("정정 발행이 완료되었습니다. 공개 페이지가 갱신되었습니다.");
        } else if (!sendAfterPublish) {
          editorToast.success("발행되었습니다. 발송은 요청하지 않았습니다.");
        } else {
          // 발송 요청 — 발행은 이미 완료. 발송 중지(SEND_DISABLED)도 정직하게 안내한다.
          let distJson: unknown = null;
          try {
            const distRes = await fetch("/api/broker/magazine/distribute", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                editionId,
                title: headline,
                headline,
                market_temp: marketTemp,
                date: issueDate,
                target: targetSegment,
              }),
            });
            distJson = distRes.ok ? await readJsonSafe(distRes) : { success: false };
          } catch (distErr) {
            console.warn("[publish] Distribute call failed:", distErr);
            distJson = { success: false };
          }
          const outcome = describeDistributeOutcome(distJson);
          const resultObj = (distJson as { result?: unknown } | null)?.result;
          if (resultObj && typeof resultObj === "object") setDistributionResult(resultObj);
          if (outcome.kind === "sent") editorToast.success(outcome.message);
          else editorToast.warning(outcome.message);
          if (distJson && typeof distJson === "object" && (distJson as { blocked?: unknown }).blocked === "SEND_DISABLED") {
            setSendEnabled(false);
          }
        }
        setShowShareModal(true);
      } catch (err) {
        console.error(err);
        const failMsg = "발행 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
        setPublishError(failMsg);
        editorToast.error(failMsg);
      } finally {
        setPublishing(false);
      }
    },
    [
      editionId,
      isPublished,
      saveProfileSettings,
      applyEditionRow,
      sendAfterPublish,
      headline,
      marketTemp,
      targetSegment,
    ]
  );

  // ── 카카오 공유 ──
  const handleMagazineKakaoShare = () => {
    if (!brokerSlug) return;

    const baseUrl =
      typeof window !== "undefined" && window.location.hostname.includes("vercel.app")
        ? "https://www.credeal.net"
        : typeof window !== "undefined"
        ? window.location.origin
        : "https://www.credeal.net";

    const magazineUrl = `${baseUrl}/magazine/${brokerSlug}/${publishedIssueDate}`;
    const ogImageUrl = buildOgImageUrl(baseUrl, brokerSlug, publishedIssueDate);

    if (typeof window !== "undefined" && (window as any).Kakao) {
      const Kakao = (window as any).Kakao;
      if (!Kakao.isInitialized()) {
        const appKey = process.env.NEXT_PUBLIC_KAKAO_APP_KEY;
        if (appKey) Kakao.init(appKey);
      }

      if (Kakao.isInitialized()) {
        try {
          Kakao.Share.sendDefault({
            objectType: "feed",
            content: {
              title: magazineTitle || `${today} CRE 위클리 매거진`,
              description: briefing.slice(0, 80) + "...",
              imageUrl: ogImageUrl,
              link: { mobileWebUrl: magazineUrl, webUrl: magazineUrl },
            },
            buttons: [
              {
                title: "매거진 보기",
                link: { mobileWebUrl: magazineUrl, webUrl: magazineUrl },
              },
            ],
          });
          return;
        } catch (e) {
          console.error("Kakao share error", e);
        }
      }
    }

    // fallback
    navigator.clipboard.writeText(magazineUrl);
    editorToast.success("링크가 복사되었습니다. 카카오톡에 붙여넣기 하세요.");
  };

  const handleCopyLink = () => {
    if (!brokerSlug) return;
    const origin =
      typeof window !== "undefined" ? window.location.origin : "https://www.credeal.net";
    const magazineUrl = `${origin}/magazine/${brokerSlug}/${publishedIssueDate}`;
    navigator.clipboard.writeText(magazineUrl);
    editorToast.success("링크가 복사되었습니다.");
  };

  // ── 가격 포맷 ──
  function fmt(price: number): string {
    if (!price) return "-";
    if (price >= 100000000) return `${(price / 100000000).toFixed(1)}억`;
    if (price >= 10000) return `${(price / 10000).toFixed(0)}만`;
    return price.toLocaleString();
  }

  // ── 상태 뱃지 색상 ──
  function statusBadge(status: EditionStatus) {
    const map: Record<EditionStatus, { label: string; cls: string }> = {
      draft: { label: "초안", cls: "text-[#475569] bg-slate-100 border-[#CBD5E1]" },
      editing: { label: "편집중", cls: "text-amber-800 bg-amber-50 border-amber-300" },
      review: { label: "검토", cls: "text-blue-800 bg-blue-50 border-blue-300" },
      needs_review: { label: "검토필요", cls: "text-orange-800 bg-orange-50 border-orange-300" },
      scheduled: { label: "예약", cls: "text-purple-800 bg-purple-50 border-purple-300" },
      published: { label: "발행됨", cls: "text-emerald-800 bg-emerald-50 border-emerald-300" },
      archived: { label: "보관", cls: "text-[#475569] bg-slate-100 border-[#CBD5E1]" },
    };
    const s = map[status] || map.draft;
    return (
      <span
        className={`text-caption font-bold px-2 py-0.5 rounded-full border ${s.cls}`}
      >
        {s.label}
      </span>
    );
  }

  // ── 로딩 ──
  if (loading) {
    return <MagazineEditorLoading />;
  }

  if (loadError) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0B1120] p-6">
        <ErrorState
          className="w-full max-w-sm"
          title="콘텐츠 스튜디오를 불러오지 못했습니다"
          description={loadError}
          onRetry={() => window.location.reload()}
          retryLabel="다시 불러오기"
        />
      </div>
    );
  }

  if (!brokerSlug) {
    return <SlugSetupGate onConfirmed={() => window.location.reload()} />;
  }

  const primaryTabs = getPrimaryTabsForCadence(editionType);
  const cadenceLabelKo =
    editionType === "daily"
      ? "일간"
      : editionType === "monthly"
      ? "월간"
      : editionType === "special"
      ? "스페셜"
      : "주간";

  // ─── 탭 콘텐츠 렌더링 (상단 ≤4개 탭 클릭 시 하단에 즉시 설정/편집 화면 표시) ─────────────────
  const renderTabContent = () => {
    switch (activeTab) {
      // ━━━ ① 헤더·제목 탭 ━━━
      case "cover":
        return (
          <EditorCoverTab
            marketTemp={marketTemp}
            setMarketTemp={setMarketTemp}
            coverKeywords={coverKeywords}
            updateKeyword={updateKeyword}
            headline={headline}
            setHeadline={setHeadline}
            briefing={briefing}
            setBriefing={setBriefing}
            coverImageUrl={coverImageUrl}
            setCoverImageUrl={setCoverImageUrl}
          />
        );

      // ━━━ ② 중개인 브리핑 탭 (주간 전용) + 인라인 AI 다듬기 ━━━
      case "field_note":
        return (
          <div className="space-y-4">
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-extrabold text-indigo-950">
                  ✍️ 주간 뉴스레터 중개인 브리핑
                </p>
                <p className="text-xs font-medium text-indigo-800">
                  현장에서 체감한 매수·매도 분위기와 한 줄 판단을 적어 주세요.
                </p>
              </div>
              <button
                type="button"
                data-testid="toggle-inline-ai-assist"
                onClick={() => setShowInlineAiAssist((v) => !v)}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-xs font-extrabold text-indigo-700 hover:bg-indigo-100 transition-colors"
              >
                <Wand2 className="w-3.5 h-3.5" aria-hidden="true" />
                {showInlineAiAssist ? "AI 문장 도우미 닫기" : "✨ AI 문장 다듬기"}
              </button>
            </div>

            {showInlineAiAssist && (
              <div className="rounded-xl border border-indigo-200 bg-white p-3 shadow-2xs">
                <EditorAiAssistTab
                  memory={aiMemory}
                  onMemoryChange={setAiMemory}
                  onApply={(text) => {
                    updateFieldNote("comment", text);
                    setShowInlineAiAssist(false);
                    editorToast.success("중개인 브리핑 '독자에게 한마디'에 반영했습니다");
                  }}
                />
              </div>
            )}

            <EditorFieldNoteTab
              fieldNote={fieldNote}
              updateFieldNote={updateFieldNote}
              activeTooltip={activeTooltip}
              setActiveTooltip={setActiveTooltip}
            />
          </div>
        );

      // ━━━ ② 권역 통계 2건 탭 (월간 전용: 국토부 실거래·한국부동산원·통계청 KOSIS) ━━━
      case "monthly_stats":
        return (
          <MonthlyStatsEditorPanel
            monthlyRegion={monthlyRegion}
            onChangeRegion={(rk, charts) => {
              setMonthlyRegion(rk);
              setMonthlyCharts(charts);
            }}
            monthlyCharts={monthlyCharts}
            onChangeCharts={setMonthlyCharts}
          />
        );

      // ━━━ AI 클러스터링 AXIOS 와이드 포스트잇 이슈 5선 탭 (일간·주간·월간 공통) ━━━
      case "news":
        return (
          <div className="space-y-4">
            {newsState.status === "error" && (
              <ErrorState
                title="뉴스 목록을 불러오지 못했습니다"
                description={newsState.error ?? undefined}
                onRetry={newsState.retry}
              />
            )}
            {newsState.status === "loading" && newsPool.length === 0 && unitIssues.length === 0 ? (
              <SkeletonGroup label="뉴스 목록을 불러오는 중" className="space-y-2">
                <Skeleton className="h-20 w-full rounded-xl" />
                <Skeleton className="h-20 w-full rounded-xl" />
                <Skeleton className="h-20 w-full rounded-xl" />
              </SkeletonGroup>
            ) : (
              <AxiosIssuesEditorPanel
                unitIssues={unitIssues}
                onChangeUnitIssues={setUnitIssues}
                newsPool={newsPool}
                cadenceLabel={cadenceLabelKo}
                onRefreshLiveChannel={refreshLiveChannelNews}
              />
            )}
          </div>
        );

      // ━━━ 딜카드·발행 탭 ━━━
      case "theme_deals":
        return (
          <div className="space-y-4">
            {dealsState.status === "error" && (
              <ErrorState
                title="매물 목록을 불러오지 못했습니다"
                description={dealsState.error ?? undefined}
                onRetry={dealsState.retry}
              />
            )}
            {dealsState.status === "loading" && dealPool.length === 0 && (
              <SkeletonGroup label="매물 목록을 불러오는 중" className="space-y-2">
                <Skeleton className="h-16 w-full rounded-xl" />
                <Skeleton className="h-16 w-full rounded-xl" />
              </SkeletonGroup>
            )}
            <EditorThemeDealsTab
              themeTitle={themeTitle}
              setThemeTitle={setThemeTitle}
              themeBodyMd={themeBodyMd}
              setThemeBodyMd={setThemeBodyMd}
              allDeals={dealPool}
              selectedDealIds={selectedDealIds}
              toggleDeal={toggleDeal}
              fmt={fmt}
            />

            {/* 발송 대상 빠른 선택 & 보조 설정 바로가기 */}
            <div className="rounded-xl border border-slate-300 bg-white p-4 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-sm font-extrabold text-slate-900">
                  🎯 발송 대상 세그먼트
                </span>
                <span className="text-xs font-semibold text-slate-500">
                  구독자 {subscriberCount ?? 0}명
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="발송 대상 선택">
                {(
                  [
                    { key: "all", label: "전체 구독자" },
                    { key: "buyer", label: "매수 관심" },
                    { key: "seller", label: "매도 관심" },
                  ] as const
                ).map((seg) => {
                  const active = targetSegment === seg.key;
                  return (
                    <button
                      key={seg.key}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setTargetSegment(seg.key)}
                      className={`min-h-10 rounded-lg border px-2.5 py-1.5 text-xs font-extrabold transition-colors ${
                        active
                          ? "border-blue-600 bg-blue-50 text-blue-800"
                          : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      {seg.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setActiveTab("publish")}
                  className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100"
                >
                  <Settings className="w-3.5 h-3.5" aria-hidden="true" />
                  고급 발행설정 (투표·세무·섹션)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("outreach")}
                  className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100"
                >
                  <Users className="w-3.5 h-3.5" aria-hidden="true" />
                  구독자·QR 관리
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("analytics")}
                  className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100"
                >
                  <BarChart3 className="w-3.5 h-3.5" aria-hidden="true" />
                  열람 성과·핫리드
                </button>
              </div>
            </div>
          </div>
        );

      // ━━━ AI 비서 탭 (보조 드로어) ━━━
      case "ai_assist":
        return (
          <EditorAiAssistTab
            memory={aiMemory}
            onMemoryChange={setAiMemory}
            onApply={(text) => {
              updateFieldNote("comment", text);
              setActiveTab("field_note");
              editorToast.success("필드노트 '독자에게 한마디'에 넣었습니다");
            }}
          />
        );

      // ━━━ 아웃리치 탭 (보조 드로어) ━━━
      case "outreach":
        return (
          <EditorOutreachTab
            brokerSlug={brokerSlug}
            brokerName={resolveEditorPublicName(identity, brokerSlug)}
            baseUrl={typeof window !== "undefined" ? window.location.origin : ""}
            sendDayLabel={MAGAZINE_SEND_DAY_LABEL}
            sendDisabled={sendEnabled === false}
            editionDate={isPublished ? publishedIssueDate : today}
            shareTitle={magazineTitle || headline || undefined}
            deals={dealPool.map((d: any) => ({
              id: String(d.id),
              title: String(d.areaSignal || d.address || d.assetType || "매물"),
            }))}
          />
        );

      // ━━━ 발행설정 탭 (보조 드로어) ━━━
      case "publish":
        return (
          <EditorPublishTab
            editionLabel={editionLabel}
            editionTypeLabel={
              editionType === "weekly"
                ? "위클리"
                : editionType === "monthly"
                ? "월간"
                : editionType === "special"
                ? "스페셜"
                : "데일리"
            }
            statusBadge={statusBadge(editionStatus)}
            brokerSlug={brokerSlug}
            isPublished={isPublished}
            issueDate={isPublished ? publishedIssueDate : today}
            themeColor={themeColor}
            setThemeColor={setThemeColor}
            magazineTitle={magazineTitle}
            setMagazineTitle={setMagazineTitle}
            targetSegment={targetSegment}
            setTargetSegment={setTargetSegment}
            pollQuestion={pollQuestion}
            setPollQuestion={setPollQuestion}
            pollOptions={pollOptions}
            setPollOptions={setPollOptions}
            taxQuestion={taxQuestion}
            setTaxQuestion={setTaxQuestion}
            taxAnswer={taxAnswer}
            setTaxAnswer={setTaxAnswer}
            taxSource={taxSource}
            setTaxSource={setTaxSource}
            sectionOrder={sectionOrder}
            setSectionOrder={setSectionOrder}
            sectionsEnabled={sectionsEnabled}
            setSectionsEnabled={setSectionsEnabled}
          />
        );

      // ━━━ 성과 탭 (보조 드로어) ━━━
      case "analytics":
        return (
          <div className="pb-8">
            <EditorAnalyticsTab />
          </div>
        );

      default:
        return null;
    }
  };

  // ─── 렌더링 (3열 워크스페이스: 1열 에어테이블 목록 + 2열 ≤4탭 에디터 + 3열 실시간 미리보기) ───
  return (
    <div
      data-testid="workspace-shell"
      data-workspace="magazine"
      className="flex flex-col h-[100dvh] bg-[#FAF9F5] text-[#0F172A] overflow-hidden font-sans"
    >
      {/* ━━━ 통일 상단 글로벌 워크스페이스 내비게이션 바 (56px, 딜카드·IM·뉴스레터·소통함 100% 동일) ━━━ */}
      <header
        data-testid="workspace-topbar"
        className="h-14 shrink-0 bg-white border-b border-slate-300 px-4 flex items-center justify-between z-30 shadow-2xs"
      >
        <div className="flex items-center gap-2 sm:gap-4 overflow-x-auto no-scrollbar">
          {WS_TOPBAR_LINKS.map((link) => {
            const isActive = link.id === "magazine";
            return (
              <Link
                key={link.id}
                href={link.href}
                data-testid={`workspace-nav-${link.id}`}
                className={`px-3 py-1.5 min-h-[40px] rounded-lg text-sm sm:text-base font-extrabold flex items-center transition-colors whitespace-nowrap ${
                  isActive
                    ? "bg-blue-700 text-white shadow-2xs"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        {/* 모바일 채우기/미리보기 전환 스위치 (<1024px) & 내 프로필 */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="lg:hidden flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-300">
            <button
              type="button"
              onClick={() => setShowMobilePreview(false)}
              className={`px-2.5 py-1 text-sm font-bold rounded-md transition-colors ${
                !showMobilePreview
                  ? "bg-white text-blue-700 shadow-2xs"
                  : "text-slate-600"
              }`}
            >
              ✏️ 채우기
            </button>
            <button
              type="button"
              onClick={() => setShowMobilePreview(true)}
              className={`px-2.5 py-1 text-sm font-bold rounded-md transition-colors ${
                showMobilePreview
                  ? "bg-white text-blue-700 shadow-2xs"
                  : "text-slate-600"
              }`}
            >
              👁 미리보기
            </button>
          </div>
          <Link
            href="/broker/profile"
            data-testid="workspace-nav-profile"
            className="inline-flex items-center gap-1 px-3 py-1.5 min-h-[40px] rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-sm font-extrabold text-slate-800 transition-colors whitespace-nowrap"
          >
            <span>👤 내 프로필</span>
          </Link>
        </div>
      </header>

      {/* ━━━ 3열 레이아웃: [1열 에어테이블 목록] + [2열 ≤4탭 에디터] + [3열 실시간 미리보기] ━━━ */}
      <div
        data-testid="magazine-three-column-layout"
        className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0"
      >
        {/* ━━━ 1열: 에어테이블형 지능형 뉴스레터 목록 (일간·주간·월간 전환 + 구성 공식 체크) ━━━ */}
        <EditionAirtableList
          editions={liveEditionsList}
          activeEditionId={editionId}
          activeCadence={editionType}
          loading={switchingCadence}
          subscriberCount={subscriberCount}
          onSelectEdition={(item) => void handleSelectEdition(item)}
          onSwitchOrCreateCadence={(cadence) => void handleSwitchOrCreateCadence(cadence)}
          onDuplicateEdition={(item) => void handleDuplicateEdition(item)}
          onOpenOutreach={() => setActiveTab("outreach")}
          onOpenAnalytics={() => setActiveTab("analytics")}
        />

        {/* ━━━ 2열: 에디터 (상단 ≤4개 항목 단추/탭 + 하단 즉시 설정/편집 화면) ━━━ */}
        <div
          data-testid="magazine-editor-slot"
          className={`w-full lg:w-[520px] xl:w-[580px] bg-[#FAF9F5] border-r border-[#CBD5E1] ${
            showMobilePreview ? "hidden lg:flex" : "flex"
          } flex-col h-full overflow-hidden shrink-0`}
        >
          {/* 헤더 — 125% 배율 노트북에서도 편집 캔버스 높이를 확보하도록 밀도 최적화 */}
          <div className="px-4 py-2.5 border-b border-[#CBD5E1] flex items-center justify-between gap-2 bg-white/95 backdrop-blur-md z-10 flex-shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <Link
                href="/broker"
                aria-label="대시보드로 돌아가기"
                className="inline-flex min-h-11 min-w-11 items-center justify-center -ml-1.5 rounded-xl hover:bg-slate-100 text-[#475569] hover:text-[#0F172A] transition-colors shrink-0"
              >
                <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              </Link>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h1
                    aria-label="Content Studio"
                    className="text-base font-extrabold text-[#0F172A] tracking-tight"
                  >
                    고객 소식지 편집실
                  </h1>
                  <span className="rounded-md border border-blue-600/30 bg-blue-50 px-2 py-0.5 text-xs font-extrabold text-blue-700">
                    매거진 만들기
                  </span>
                  {brokerSlug && (
                    <div className="flex items-center gap-1" data-testid="my-magazine-badge">
                      <span className="text-caption font-bold text-blue-700">
                        내 매거진: {brokerSlug}
                      </span>
                      <button
                        type="button"
                        aria-label="공개 매거진 주소 복사"
                        onClick={() => {
                          const url = `${window.location.origin}/magazine/${brokerSlug}`;
                          navigator.clipboard.writeText(url).then(
                            () => editorToast.success("공개 주소가 복사되었습니다."),
                            () => editorToast.error("복사하지 못했습니다. 주소를 직접 선택해 주세요.")
                          );
                        }}
                        className="-my-2 inline-flex min-h-11 items-center rounded-lg px-2 text-caption font-semibold text-[#475569] hover:bg-slate-100 hover:text-[#0F172A] transition-colors"
                      >
                        주소 복사
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                  <p className="text-caption font-bold text-[#0F172A]">
                    {editionLabel} · {cadenceLabelKo} 뉴스레터
                  </p>
                  {statusBadge(editionStatus)}
                  <p className="text-caption font-semibold text-[#475569]" data-testid="editor-progress">
                    작성 {progress.done}/{progress.total} 완료
                  </p>
                  {/* 모바일용 일간/주간/월간 빠른 전환 칩 */}
                  <div className="flex lg:hidden items-center gap-1">
                    {(["daily", "weekly", "monthly"] as const).map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => void handleSwitchOrCreateCadence(c)}
                        className={`rounded-md px-2 py-0.5 text-xs font-extrabold border ${
                          editionType === c
                            ? "border-blue-600 bg-blue-600 text-white"
                            : "border-slate-300 bg-white text-slate-700"
                        }`}
                      >
                        {c === "daily" ? "일간" : c === "monthly" ? "월간" : "주간"}
                      </button>
                    ))}
                  </div>
                  {!isPublished && (
                    <SaveStatusBadge
                      status={autosave.status}
                      lastSavedAt={autosave.lastSavedAt}
                      errorMessage={autosave.errorMessage}
                      onRetry={() => void autosave.saveNow()}
                      onOverwrite={() => void autosave.overwrite()}
                      onReload={() => window.location.reload()}
                    />
                  )}
                </div>
              </div>
            </div>
            {!isPublished && (
              <motion.button
                type="button"
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => void handleManualSave()}
                disabled={autosave.status === "saving" || !editionReady}
                className="flex min-h-11 shrink-0 items-center gap-1.5 text-label font-extrabold px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 shadow-sm transition-colors"
              >
                {autosave.status === "saving" ? (
                  <Loader2
                    className="w-3.5 h-3.5 animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                ) : (
                  <Save className="w-3.5 h-3.5" aria-hidden="true" />
                )}
                저장
              </motion.button>
            )}
          </div>

          {/* ━━━ 상단 ≤4개 항목 단추/탭 (일간 3탭 / 주간 4탭 / 월간 4탭) — 클릭 즉시 하단에 설정/편집 화면 표시 ━━━ */}
          <div
            role="tablist"
            aria-label="콘텐츠 편집 단계"
            data-testid="editor-primary-tabs"
            className="flex border-b border-[#CBD5E1] flex-shrink-0 bg-white overflow-x-auto scrollbar-hide px-2 py-1 gap-1"
          >
            {primaryTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              const done =
                tab.key === "monthly_stats"
                  ? monthlyCharts.length >= 2
                  : tab.key === "news"
                  ? unitIssues.length >= 5 || completion.news === "done"
                  : completion[tab.key as keyof typeof completion] === "done";
              return (
                <button
                  key={tab.key}
                  id={`editor-tab-${tab.key}`}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls="editor-tabpanel"
                  aria-label={done ? `${tab.label}, 작성 완료` : tab.label}
                  data-complete={done ? "true" : undefined}
                  onClick={(e) => {
                    if (editorMode !== "full") {
                      setEditorMode("full", { skipRemote: true });
                    }
                    setActiveTab(tab.key);
                    e.currentTarget.scrollIntoView?.({ block: "nearest", inline: "nearest" });
                  }}
                  className={`shrink-0 flex-1 min-h-11 flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs sm:text-sm font-extrabold transition-colors relative rounded-xl ${
                    isActive
                      ? "text-blue-800 bg-blue-50 border border-blue-200 shadow-2xs"
                      : "text-[#475569] hover:text-[#0F172A] hover:bg-slate-50"
                  }`}
                >
                  <Icon className="relative z-10 w-4 h-4 shrink-0" aria-hidden="true" />
                  <span className="relative z-10 inline text-center leading-tight whitespace-nowrap">
                    {tab.label}
                  </span>
                  {done && (
                    <Check
                      className="relative z-10 w-3.5 h-3.5 text-emerald-600 shrink-0"
                      aria-hidden="true"
                      data-testid={`tab-done-${tab.key}`}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* 보조 탭(구독자 관리 / 성과 / 고급 발행설정) 열람 중일 때 상단 복귀 바 */}
          {!primaryTabs.some((t) => t.key === activeTab) && (
            <div className="px-4 py-2 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-extrabold text-slate-700">
                {activeTab === "outreach"
                  ? "👥 구독자 · 아웃리치 관리"
                  : activeTab === "analytics"
                  ? "📊 열람 성과 · 핫리드 분석"
                  : activeTab === "publish"
                  ? "⚙️ 고급 발행 설정"
                  : "✨ AI 문장 비서"}
              </span>
              <button
                type="button"
                onClick={() => setActiveTab("cover")}
                className="text-xs font-extrabold text-blue-700 hover:underline"
              >
                ← 기본 편집 탭으로 돌아가기
              </button>
            </div>
          )}

          {/* 하단 즉시 설정/편집 화면 */}
          <div
            role="tabpanel"
            id="editor-tabpanel"
            aria-labelledby={`editor-tab-${activeTab}`}
            className="flex-1 overflow-y-auto p-4 lg:p-5 space-y-4 bg-[#FAF9F5]"
          >
            {renderTabContent()}
          </div>

          {/* 하단 액션 — 발행 단일 버튼 세트 (저장은 헤더, 발행은 여기 하나) */}
          <div className="p-3 lg:p-3.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-[#CBD5E1] flex flex-wrap items-stretch gap-2 lg:flex-col lg:flex-nowrap flex-shrink-0 bg-white">
            <div className="flex w-full gap-2">
              <Link
                href={`/magazine/${encodeURIComponent(brokerSlug)}/${
                  isPublished ? publishedIssueDate : today
                }${
                  !isPublished && editionId
                    ? `?preview=1&edition=${encodeURIComponent(editionId)}`
                    : ""
                }`}
                target="_blank"
                title={
                  isPublished
                    ? "발행된 이번 호의 공개 주소로 이동합니다"
                    : "이번 호의 공개 주소(발행 전에는 미발행 안내가 표시되며, 편집 화면은 우측 미리보기에서 확인)"
                }
                className="flex-1 min-w-0 flex min-h-11 items-center justify-center gap-1.5 text-label font-bold px-3 py-2 rounded-xl border border-[#CBD5E1] bg-white text-[#0F172A] hover:bg-slate-50 transition-all shadow-2xs"
              >
                <Eye className="hidden lg:inline-block w-3.5 h-3.5 text-[#475569]" aria-hidden="true" />
                📱 실제 화면으로 보기
                <ExternalLink
                  className="hidden lg:inline-block w-3 h-3 ml-1 opacity-60"
                  aria-hidden="true"
                />
              </Link>
              <button
                type="button"
                aria-expanded={showMobilePreview}
                onClick={() => setShowMobilePreview((v) => !v)}
                className="lg:hidden flex min-h-11 items-center justify-center gap-1 rounded-xl border border-blue-600/30 bg-blue-50 px-3 py-2 text-xs font-extrabold text-blue-800 hover:bg-blue-100 transition-all"
              >
                📱 독자 화면 미리보기
              </button>
            </div>
            {isPublished && (
              <p
                className="basis-full order-first lg:order-none text-caption font-semibold leading-relaxed text-amber-800 bg-amber-50 border border-amber-200 p-2 rounded-lg"
                role="note"
              >
                이미 발행된 호수입니다. 내용을 고친 뒤 &quot;정정 발행&quot;을 누르면 공개 페이지가 갱신됩니다. 초안으로 되돌릴 수 없습니다.
              </p>
            )}
            <div className="flex gap-2 flex-1 lg:flex-none w-full">
              <motion.button
                type="button"
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => void handleOpenPublish()}
                disabled={publishing || autosave.status === "saving"}
                className="flex-1 flex min-h-11 items-center justify-center gap-2 text-label font-extrabold px-4 py-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 shadow-sm transition-colors"
              >
                {publishing ? (
                  <Loader2
                    className="w-3.5 h-3.5 animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                ) : (
                  <Send className="w-3.5 h-3.5" aria-hidden="true" />
                )}
                {isPublished ? "정정 발행" : `${cadenceLabelKo} 뉴스레터 발행하기`}
              </motion.button>
            </div>
          </div>
        </div>

        {/* ━━━ 3열: 실시간 미리보기 (모바일은 토글 시 노출, 데스크톱은 상시 노출) ━━━ */}
        <div
          data-testid="magazine-preview-slot"
          className={`${showMobilePreview ? "flex" : "hidden"} lg:flex flex-1 min-w-[320px] h-full overflow-hidden`}
        >
          <MagazinePhonePreview
            previewData={previewViewData}
            brokerSlug={brokerSlug}
            today={today}
            dateLabel={formatKoreanDate(today)}
            editionId={editionId}
          />
        </div>
      </div>

      {/* ── 모바일 5탭 하단 내비게이션 (<1024px) ── */}
      <WorkspaceBottomNav activeTabId="magazine" hideOnDetail={false} />


      {/* ── 발행 확인 모달 ── */}
      <PublishConfirmModal
        open={showPublishConfirm}
        onOpenChange={(open) => {
          setShowPublishConfirm(open);
          if (!open) setPublishError(null);
        }}
        issueDate={isPublished ? publishedIssueDate : today}
        targetSegment={targetSegment}
        subscriberCount={subscriberCount}
        sendEnabled={sendEnabled}
        correction={isPublished}
        busy={publishing}
        needsQualityAck={needsQualityAck}
        sendAfterPublish={sendAfterPublish}
        onSendAfterPublishChange={setSendAfterPublish}
        onConfirm={handleConfirmPublish}
        publishError={publishError}
      />

      {/* ── 공유 모달 ── */}
      <MagazineShareModal
        showShareModal={showShareModal}
        setShowShareModal={setShowShareModal}
        handleMagazineKakaoShare={handleMagazineKakaoShare}
        handleCopyLink={handleCopyLink}
        distributionResult={distributionResult}
        isPaidTier={isPaidTier}
        brokerSlug={brokerSlug}
        baseUrl={typeof window !== "undefined" ? window.location.origin : undefined}
        editionDate={isPublished ? publishedIssueDate : today}
        shareTitle={magazineTitle || headline || undefined}
        shareDescription={briefing ? briefing.slice(0, 80) : undefined}
        sendDisabled={sendEnabled === false}
      />


    </div>
  );
}

// ─── 페이지 export (Suspense로 useSearchParams 감싸기) ────────────────
export default function MagazineEditorPage() {
  return (
    <>
      <Script
        src="https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js"
        strategy="lazyOnload"
        onLoad={() => {
          if (
            typeof window !== "undefined" &&
            (window as any).Kakao &&
            !(window as any).Kakao.isInitialized()
          ) {
            const appKey = process.env.NEXT_PUBLIC_KAKAO_APP_KEY;
            if (appKey) (window as any).Kakao.init(appKey);
          }
        }}
      />
      <MotionConfig reducedMotion="user">
        <Suspense
          fallback={
            <div className="flex h-screen items-center justify-center bg-[#FAF9F5]">
              <Loader2 className="w-8 h-8 animate-spin motion-reduce:animate-none text-blue-600" aria-label="불러오는 중" />
            </div>
          }
        >
          <MagazineEditorInner />
        </Suspense>
      </MotionConfig>
    </>
  );
}
