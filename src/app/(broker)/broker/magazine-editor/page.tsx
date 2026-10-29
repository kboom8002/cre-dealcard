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
} from "@/components/magazine-editor";
import { SlugSetupGate } from "@/components/magazine-editor/SlugSetupGate";
import { PublishConfirmModal } from "@/components/magazine-editor/PublishConfirmModal";

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
} from "@/domain/magazine/types";
import {
  enrichNewsPoolWithChannels,
  recommendBalancedNewsMix,
  resolveNewsChannel,
  type NewsChannelId,
  type NewsPoolItem,
} from "@/domain/magazine/news-channels";

// ─── 탭 정의 ──────────────────────────────────────────────────────
const TABS = [
  { key: "cover" as const, label: "커버", icon: Newspaper },
  { key: "field_note" as const, label: "필드노트", icon: PenLine },
  { key: "theme_deals" as const, label: "테마&매물", icon: Target },
  { key: "news" as const, label: "뉴스", icon: BookOpen },
  { key: "ai_assist" as const, label: "AI비서", icon: Wand2 },
  { key: "outreach" as const, label: "아웃리치", icon: Users },
  { key: "publish" as const, label: "발행설정", icon: Settings },
  { key: "analytics" as const, label: "성과", icon: BarChart3 },
];

type TabKey = (typeof TABS)[number]["key"];

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

  // News
  const [selectedNewsIds, setSelectedNewsIds] = useState<Set<string>>(new Set());
  const [extraChannelNews, setExtraChannelNews] = useState<NewsPoolItem[]>([]);

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
      return mappedDeals;
    },
    [],
    { auto: true }
  );
  const allNews = useMemo(() => newsState.data ?? [], [newsState.data]);
  const allDeals = useMemo(() => dealsState.data ?? [], [dealsState.data]);

  // ── 데이터 로딩 (프로필 + 이번 호 초안 동시 병렬 요청으로 직렬 워터폴 제거) ──
  useEffect(() => {
    async function loadData() {
      try {
        const requestDraft = () =>
          fetch("/api/magazine/editions/draft", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ edition_type: "weekly" }),
          });

        const [profileApiRes, initialDraftRes] = await Promise.all([
          fetch("/api/broker/profile").catch(() => null),
          requestDraft().catch(() => null),
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
        const f = formFromEdition(ed);
        const edContent: Record<string, unknown> =
          ed.content && typeof ed.content === "object" ? (ed.content as Record<string, unknown>) : {};

        setEditionId(ed.id);
        if (ed.edition_label) setEditionLabel(ed.edition_label);
        if (ed.edition_type) setEditionType(ed.edition_type as EditionType);
        setEditionStatus((ed.status as EditionStatus) || "draft");
        setPublishedAt(ed.published_at ?? null);
        setEditionUpdatedAt(ed.updated_at ?? null);
        setMagazineData(edContent);
        setHeadline(f.headline);
        setBriefing(f.briefing);
        setMarketTemp(f.marketTemp as MarketTemperature | null);
        setCoverKeywords(f.coverKeywords);
        setCoverImageUrl(f.coverImageUrl);
        setFieldNote(f.fieldNote);
        setThemeTitle(f.themeTitle);
        setThemeBodyMd(f.themeBodyMd);
        setThemeColor(draftJson.created && ident.magazineThemeColor ? ident.magazineThemeColor : f.themeColor);
        // URL ?deals= / ?news= 로 들어온 선택이 있으면 그것을 우선
        if (!searchParams.get("deals")) setSelectedDealIds(new Set(f.selectedDealIds));
        if (!searchParams.get("news")) setSelectedNewsIds(new Set(f.selectedNewsIds.slice(0, MAX_NEWS_SELECTION)));
        setSavedTopNews(f.topNews);
        setSavedDealHighlights(f.dealHighlights);
        setPollQuestion(f.pollQuestion);
        setPollOptions(padPollOptions(f.pollOptions));
        setTaxQuestion(f.taxQuestion);
        setTaxAnswer(f.taxAnswer);
        setTaxSource(f.taxSource);
        setSectionOrder(f.sectionOrder);
        setSectionsEnabled(f.sectionsEnabled);
        setTargetSegment(f.targetSegment);
        // 저장된 적 없는 새 초안일 때 기본 선택(매물 상위 3건 + 뉴스 3건)을 채운다
        const isDraftNewOrEmpty = Boolean(
          draftJson.created ||
          ed.status === "draft"
        );
        defaultsPendingRef.current = {
          news: isDraftNewOrEmpty && (!Array.isArray(edContent.selected_news_ids) || edContent.selected_news_ids.length === 0 || f.selectedNewsIds.length === 0),
          deals: isDraftNewOrEmpty && (!Array.isArray(ed.featured_deal_ids) || ed.featured_deal_ids.length === 0 || f.selectedDealIds.length === 0),
        };
        if (draftJson.created && !f.headline) {
          const defaultH = deriveFallbackHeadline("", ident.magazineTitle || ident.brokerName || ident.displayName);
          setHeadline(defaultH);
        }
        if (draftJson.created && !f.marketTemp) {
          setMarketTemp("선별 매수");
        }
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

        // 3·4. 뉴스·매물 목록은 useAsyncState(newsState/dealsState)가 에디션 준비 후 따로 불러온다
        //      (실패해도 에디터는 열리고, 해당 탭에서 오류 안내 + 다시 시도를 보여준다)

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
    ]
  );
  const signature = useMemo(() => formSignature(form), [form]);

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

  // 미리보기 = 저장될 content 와 같은 변환 결과 (비어 있는 설문/세무는 섹션 자체가 사라진다)
  const previewData = useMemo<any>(() => {
    const baseContent = buildContentFromForm(magazineData, form);
    const modeContent =
      editorMode === "simple"
        ? applySimplePreset(baseContent, {
            brokerName: resolveEditorPublicName(identity, brokerSlug ?? ""),
          })
        : baseContent;
    return { ...modeContent, themeColor };
  }, [magazineData, form, themeColor, editorMode, identity, brokerSlug]);

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

  // ─── 탭 콘텐츠 렌더링 ───────────────────────────────────────────────
  const renderTabContent = () => {
    switch (activeTab) {
      // ━━━ 커버 탭 ━━━
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

      // ━━━ 필드노트 탭 ━━━
      case "field_note":
        return (
          <EditorFieldNoteTab
            fieldNote={fieldNote}
            updateFieldNote={updateFieldNote}
            activeTooltip={activeTooltip}
            setActiveTooltip={setActiveTooltip}
          />
        );

      // ━━━ 테마&매물 탭 ━━━
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
          </div>
        );


      // ━━━ 뉴스큐레이션 탭 ━━━
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
            {newsState.status === "loading" && newsPool.length === 0 ? (
              <SkeletonGroup label="뉴스 목록을 불러오는 중" className="space-y-2">
                <Skeleton className="h-20 w-full rounded-xl" />
                <Skeleton className="h-20 w-full rounded-xl" />
                <Skeleton className="h-20 w-full rounded-xl" />
              </SkeletonGroup>
            ) : newsState.status === "error" && newsPool.length === 0 ? null : (
              <NewsCurationPanel
                allNews={newsPool}
                selectedNewsIds={selectedNewsIds}
                toggleNews={toggleNews}
                onReplaceSelection={replaceNewsSelection}
                onAppendNews={appendChannelNews}
              />
            )}
          </div>
        );
        
      // ━━━ AI 비서 탭 ━━━
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
        
      // ━━━ 아웃리치 탭 ━━━
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

      // ━━━ 발행설정 탭 ━━━
      case "publish":
        return (
          <EditorPublishTab
            editionLabel={editionLabel}
            editionTypeLabel={editionType === "weekly" ? "위클리" : editionType === "special" ? "스페셜" : "데일리"}
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

      // ━━━ 성과 탭 ━━━
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

  // ─── 렌더링 ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#FAF9F5] text-[#0F172A] flex flex-col lg:flex-row font-sans">
      {/* ━━━ 왼쪽 패널: 에디터 (시니어 가독성을 위해 폭 580~640px 확장) ━━━ */}
      <div className="w-full lg:w-[580px] xl:w-[640px] bg-[#FAF9F5] border-r border-[#CBD5E1] flex flex-col h-[100dvh] lg:h-screen sticky top-0 overflow-hidden shrink-0">
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
                <h1 aria-label="Content Studio" className="text-base font-extrabold text-[#0F172A] tracking-tight">고객 소식지 편집실</h1>
                <span className="rounded-md border border-blue-600/30 bg-blue-50 px-2 py-0.5 text-xs font-extrabold text-blue-700">
                  매거진 만들기
                </span>
                {brokerSlug && (
                  <div className="flex items-center gap-1" data-testid="my-magazine-badge">
                    <span className="text-caption font-bold text-blue-700">내 매거진: {brokerSlug}</span>
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
                <p className="text-caption font-medium text-[#475569]">
                  {editionLabel} · {editionType === "weekly" ? "위클리" : editionType === "special" ? "스페셜" : "데일리"}
                </p>
                {statusBadge(editionStatus)}
                <p className="text-caption font-semibold text-[#475569]" data-testid="editor-progress">
                  작성 {progress.done}/{progress.total} 완료
                </p>
                {editorMode === "simple" && (
                  <span
                    data-testid="editor-simple-mode-badge"
                    className="text-caption font-extrabold px-2 py-0.5 rounded-full border border-blue-600/30 bg-blue-50 text-blue-700"
                  >
                    ⚡ 간단 모드
                  </span>
                )}
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
                <Loader2 className="w-3.5 h-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              ) : (
                <Save className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              저장
            </motion.button>
          )}
        </div>

        {/* 탭 네비게이션 — 간단 모드에서는 숨김, 상세 편집 모드에서는 모바일(390px)에서도 8개 한글 탭명이 항상 표시되고 가로 스크롤 가능 */}
        {editorMode === "full" && (
          <div
            role="tablist"
            aria-label="콘텐츠 편집 단계"
            className="flex border-b border-[#CBD5E1] flex-shrink-0 bg-white overflow-x-auto scrollbar-hide px-2"
          >
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = editorMode === "full" && activeTab === tab.key;
              const done = completion[tab.key] === "done";
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
                  className={`shrink-0 lg:flex-1 min-h-12 flex flex-col items-center justify-center gap-0.5 px-2.5 lg:px-1.5 py-1.5 text-caption font-bold transition-colors relative ${
                    isActive ? "text-blue-700 font-extrabold" : "text-[#475569] hover:text-[#0F172A]"
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="activeTabPill"
                      transition={{ type: "spring", stiffness: 380, damping: 32, mass: 0.8 }}
                      className="absolute inset-x-1 inset-y-1 rounded-lg bg-blue-50/80 border border-blue-200 pointer-events-none"
                    />
                  )}
                  <Icon className="relative z-10 w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span className="relative z-10 inline text-center leading-tight whitespace-nowrap">
                    {tab.label}
                  </span>
                  {done && (
                    <Check
                      className="absolute top-1 right-1 z-10 w-3 h-3 text-emerald-600"
                      aria-hidden="true"
                      data-testid={`tab-done-${tab.key}`}
                    />
                  )}
                  {isActive && (
                    <motion.div
                      layoutId="activeTab"
                      transition={{ type: "spring", stiffness: 380, damping: 32, mass: 0.8 }}
                      className="absolute bottom-0 left-2 right-2 h-0.5 bg-blue-600 rounded-full"
                    />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* 탭 콘텐츠 */}
        <div
          role="tabpanel"
          id="editor-tabpanel"
          aria-labelledby={editorMode === "full" ? `editor-tab-${activeTab}` : "editor-mode-bar"}
          className="flex-1 overflow-y-auto p-4 lg:p-5 space-y-4 bg-[#FAF9F5]"
        >
          {/* SOTA 슬라이딩 세그먼트 모드 전환 컨트롤 (Sticky) */}
          <div
            data-testid="editor-mode-bar"
            className="sticky top-0 z-20 grid grid-cols-2 gap-1.5 rounded-2xl border border-[#CBD5E1] bg-white/95 backdrop-blur-md p-1.5 shadow-xs"
          >
            <button
              type="button"
              data-testid={editorMode === "full" ? "editor-mode-toggle" : "editor-mode-simple"}
              data-mode-switch="simple"
              aria-pressed={editorMode === "simple"}
              onClick={() => {
                if (editorMode !== "simple") setEditorMode("simple");
              }}
              className={`relative flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs sm:text-sm font-extrabold transition-colors ${
                editorMode === "simple"
                  ? "text-blue-900 bg-blue-50 border border-blue-600/30 shadow-xs"
                  : "text-[#64748B] hover:text-[#0F172A] hover:bg-slate-50"
              }`}
            >
              {editorMode === "simple" && (
                <motion.div
                  layoutId="editor-mode-active-pill"
                  transition={{ type: "spring", stiffness: 380, damping: 32, mass: 0.8 }}
                  className="absolute inset-0 rounded-xl bg-blue-50 border border-blue-600/30 shadow-xs"
                />
              )}
              <span className="relative z-10">
                ⚡ 3분 완성 간단 모드 {editorMode === "simple" ? "✓" : ""}
              </span>
            </button>

            <button
              type="button"
              data-testid={editorMode === "simple" ? "editor-mode-toggle" : "editor-mode-full"}
              data-mode-switch="full"
              aria-pressed={editorMode === "full"}
              onClick={() => {
                if (editorMode !== "full") setEditorMode("full");
              }}
              className={`relative flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs sm:text-sm font-extrabold transition-colors ${
                editorMode === "full"
                  ? "text-blue-900 bg-blue-50 border border-blue-600/30 shadow-xs"
                  : "text-[#64748B] hover:text-[#0F172A] hover:bg-slate-50"
              }`}
            >
              {editorMode === "full" && (
                <motion.div
                  layoutId="editor-mode-active-pill"
                  transition={{ type: "spring", stiffness: 380, damping: 32, mass: 0.8 }}
                  className="absolute inset-0 rounded-xl bg-blue-50 border border-blue-600/30 shadow-xs"
                />
              )}
              <span className="relative z-10">
                🛠️ 전문가 상세 편집 {editorMode === "full" ? "✓" : ""}
              </span>
            </button>
          </div>

          {/* 간단 모드 바로가기: 구독자 관리 & 성과 빠른 열기 */}
          {editorMode === "simple" && (
            <div className="flex items-center gap-2 pt-0.5">
              <button
                type="button"
                data-testid="simple-quick-outreach"
                onClick={() => {
                  setEditorMode("full", { skipRemote: true });
                  setActiveTab("outreach");
                }}
                className="flex-1 flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50/80 px-3 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-100 transition-colors shadow-2xs"
              >
                <Users className="w-3.5 h-3.5 text-amber-700" aria-hidden="true" />
                <span>👥 구독자 관리 ({subscriberCount ?? 0}명)</span>
              </button>
              <button
                type="button"
                data-testid="simple-quick-analytics"
                onClick={() => {
                  setEditorMode("full", { skipRemote: true });
                  setActiveTab("analytics");
                }}
                className="flex-1 flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50/80 px-3 py-1.5 text-xs font-bold text-rose-900 hover:bg-rose-100 transition-colors shadow-2xs"
              >
                <BarChart3 className="w-3.5 h-3.5 text-rose-700" aria-hidden="true" />
                <span>📊 열람 성과 / 핫리드</span>
              </button>
            </div>
          )}

          <AnimatePresence mode="wait" initial={false}>
            {editorMode === "simple" ? (
              <motion.div
                key="mode-simple"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ type: "spring", stiffness: 380, damping: 32, mass: 0.8 }}
              >
                <SimpleEditor
                  editionId={editionId}
                  brokerName={resolveEditorPublicName(identity, brokerSlug)}
                  fieldNote={fieldNote}
                  updateFieldNote={updateFieldNote}
                  headline={headline}
                  setHeadline={setHeadline}
                  briefing={briefing}
                  setBriefing={setBriefing}
                  marketTemp={marketTemp}
                  setMarketTemp={setMarketTemp}
                  deals={dealPool}
                  selectedDealIds={selectedDealIds}
                  toggleDeal={toggleDeal}
                  fmt={fmt}
                  newsTitles={topNewsSnapshot.map((n) => String(n.title ?? ""))}
                  allNews={newsPool}
                  selectedNewsIds={selectedNewsIds}
                  toggleNews={toggleNews}
                  onReplaceNewsSelection={replaceNewsSelection}
                  onRefreshLiveNews={refreshLiveChannelNews}
                  themeTitle={themeTitle}
                  themeBodyMd={themeBodyMd}
                  pollQuestion={pollQuestion}
                  taxQuestion={taxQuestion}
                  taxAnswer={taxAnswer}
                  isPublished={isPublished}
                  publishing={publishing}
                  saving={autosave.status === "saving"}
                  onPublish={(ensuredHeadline) => void handleOpenPublish(ensuredHeadline)}
                  onOpenTab={(tabKey) => {
                    setEditorMode("full", { skipRemote: true });
                    setActiveTab(tabKey);
                  }}
                  onSwitchToFullMode={() => setEditorMode("full")}
                />
              </motion.div>
            ) : (
              <motion.div
                key={`mode-full-${activeTab}`}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ type: "spring", stiffness: 380, damping: 32, mass: 0.8 }}
              >
                {renderTabContent()}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* 하단 액션 — 발행 단일 버튼 세트 (저장은 헤더, 발행은 여기 하나) */}
        <div className="p-3 lg:p-3.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-[#CBD5E1] flex flex-wrap items-stretch gap-2 lg:flex-col lg:flex-nowrap flex-shrink-0 bg-white">
          <div className="flex w-full gap-2">
            <Link
              href={`/magazine/${encodeURIComponent(brokerSlug)}/${isPublished ? publishedIssueDate : today}${!isPublished && editionId ? `?preview=1&edition=${encodeURIComponent(editionId)}` : ""}`}
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
              <ExternalLink className="hidden lg:inline-block w-3 h-3 ml-1 opacity-60" aria-hidden="true" />
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
            <p className="basis-full order-first lg:order-none text-caption font-semibold leading-relaxed text-amber-800 bg-amber-50 border border-amber-200 p-2 rounded-lg" role="note">
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
                <Loader2 className="w-3.5 h-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              ) : (
                <Send className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              {isPublished ? "정정 발행" : "발행하기"}
            </motion.button>
          </div>
        </div>
      </div>

      {/* ━━━ 우측 패널: 미리보기 (모바일은 토글 시 노출, 데스크톱은 상시 노출) ━━━ */}
      <div className={`${showMobilePreview ? "flex" : "hidden"} lg:flex flex-1`}>
        <MagazinePhonePreview
          previewData={previewViewData}
          brokerSlug={brokerSlug}
          today={today}
          dateLabel={formatKoreanDate(today)}
          editionId={editionId}
        />
      </div>


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
