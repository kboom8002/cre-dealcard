"use client";

import React, { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { MagazineView } from "@/app/(public)/magazine/[brokerId]/[date]/magazine-view";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import Script from "next/script";
import { motion, AnimatePresence } from "motion/react";
import { useSearchParams } from "next/navigation";
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

// ─── 탭 정의 ──────────────────────────────────────────────────────
const TABS = [
  { key: "cover" as const, label: "커버", icon: Newspaper },
  { key: "field_note" as const, label: "필드노트", icon: PenLine },
  { key: "theme_deals" as const, label: "테마&매물", icon: Target },
  { key: "news" as const, label: "뉴스큐레이션", icon: BookOpen },
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

// ─── 메인 컴포넌트 ──────────────────────────────────────────────────
function MagazineEditorInner() {
  const searchParams = useSearchParams();

  // ── 상태 관리 ──
  const initialTab = (searchParams.get("tab") as TabKey) || "cover";
  const [activeTab, setActiveTab] = useState<TabKey>(TABS.some(t => t.key === initialTab) ? initialTab : "cover");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
  const [allDeals, setAllDeals] = useState<any[]>([]);

  // News
  const [selectedNewsIds, setSelectedNewsIds] = useState<Set<string>>(new Set());
  const [allNews, setAllNews] = useState<any[]>([]);

  // Settings
  const [themeColor, setThemeColor] = useState("#6366f1");
  const [brokerSlug, setBrokerSlug] = useState<string | null>(null);
  const [magazineTitle, setMagazineTitle] = useState("");
  const [showShareModal, setShowShareModal] = useState(false);
  const [magazineData, setMagazineData] = useState<any>(null);

  // Analytics
  const [editionHistory, setEditionHistory] = useState<any[]>([]);
  const [analyticsData, setAnalyticsData] = useState<{
    subscriberCount: number;
    lastDistribution: { date: string; sentCount: number; failedCount: number; totalCount: number } | null;
    viewStats: { totalViews: number; uniqueVisitors: number; avgDwellSeconds: number; completionRate: number };
  } | null>(null);

  // Tooltip
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // ── 데이터 로딩 ──
  useEffect(() => {
    async function loadData() {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const { data: profile } = await supabase
          .from("broker_profiles")
          .select("slug, magazine_title, magazine_theme_color")
          .eq("user_id", user.id)
          .single();

        const slug = profile?.slug || "demo";
        setBrokerSlug(slug);
        setMagazineTitle(profile?.magazine_title || "");
        if (profile?.magazine_theme_color) setThemeColor(profile.magazine_theme_color);

        // 1. 최신 에디션 가져오기
        const edRes = await fetch(
          `/api/magazine/editions?broker_id=${slug}&type=weekly&limit=1`
        );
        if (edRes.ok) {
          const edJson = await edRes.json();
          if (edJson.editions && edJson.editions.length > 0) {
            const ed: MagazineEdition = edJson.editions[0];
            setEditionId(ed.id);
            setEditionLabel(ed.edition_label);
            setEditionType(ed.edition_type);
            setEditionStatus(ed.status);
            setHeadline(ed.title || "");
            setMarketTemp(ed.market_temp);
            setCoverKeywords(
              ed.cover_keywords?.length
                ? [...ed.cover_keywords, "", "", ""].slice(0, 3)
                : ["", "", ""]
            );
            setCoverImageUrl(ed.cover_image_url);
            if (ed.field_note && Object.keys(ed.field_note).length > 0) {
              setFieldNote(ed.field_note as BrokerFieldNote);
            }
            setThemeTitle(ed.theme_title || "");
            setThemeBodyMd(ed.theme_body_md || "");
            if (ed.featured_deal_ids?.length) {
              setSelectedDealIds(new Set(ed.featured_deal_ids));
            }
            if (ed.theme_color) setThemeColor(ed.theme_color);
            // Store content for preview
            if (ed.content) {
              setMagazineData({ ...ed.content, themeColor: ed.theme_color });
              if ((ed.content as any).briefing) setBriefing((ed.content as any).briefing);
            }
          }
        }

        // 2. 기존 매거진 데이터도 불러오기 (backward compat)
        const res = await fetch(`/api/magazine/${slug}`);
        if (res.ok) {
          const json = await res.json();
          if (json.data) {
            if (!magazineData) setMagazineData(json.data);
            if (!headline && json.data.headline) setHeadline(json.data.headline);
            if (!briefing && json.data.briefing) setBriefing(json.data.briefing);
          }
        }

        // 3. 뉴스 목록
        const { data: externalNews } = await supabase
          .from("external_news")
          .select("id, title, summary, source, sentiment, importance_score, topic")
          .order("importance_score", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(20);

        if (externalNews && externalNews.length > 0) {
          setAllNews(externalNews);
        }

        // 4. 딜카드 목록
        const { data: deals } = await supabase
          .from("building_ssot_lite")
          .select(
            "id, address, area_signal, asset_type, price, status, photo_urls, buyer_interest_count"
          )
          .eq("owner_id", user.id)
          .in("status", ["public_signal_ready", "active"])
          .order("updated_at", { ascending: false })
          .limit(10);

        // 4.5. IM 브릿지 추천 매물 조회
        const { data: profileDeals } = await supabase
          .from("broker_profiles")
          .select("pending_magazine_deals")
          .eq("user_id", user.id)
          .maybeSingle();

        const pendingDeals = (profileDeals?.pending_magazine_deals || []) as any[];

        const mappedDeals = (deals || []).map((d: any) => ({
          id: d.id,
          address: d.address,
          areaSignal: d.area_signal,
          assetType: d.asset_type,
          price: d.price,
          photoUrl: (d.photo_urls as string[] | null)?.[0] ?? null,
          buyerInterestCount: d.buyer_interest_count ?? 0,
        }));

        // pendingDeals를 mappedDeals에 병합 (중복 제거)
        pendingDeals.forEach((pd: any) => {
          if (!mappedDeals.some(md => md.id === pd.buildingId)) {
            mappedDeals.push({
              id: pd.buildingId,
              address: pd.blindName || "미공개 매물",
              areaSignal: pd.blindName || "추천 매물",
              assetType: pd.assetType || "매물",
              price: pd.priceBand || "",
              photoUrl: pd.photoUrl,
              buyerInterestCount: 0,
            });
          }
        });

        if (mappedDeals.length > 0) {
          setAllDeals(mappedDeals);
        }

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
      } catch (err) {
        console.error("Failed to load magazine data", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── sessionStorage에서 브리핑 데이터 복원 ──
  useEffect(() => {
    const saved = sessionStorage.getItem("magazine_briefing_data");
    if (saved) {
      try {
        const data = JSON.parse(saved);
        if (data.title) setHeadline(data.title);
        if (data.briefing) setBriefing(data.briefing);
        sessionStorage.removeItem("magazine_briefing_data");
      } catch (e) {
        /* ignore */
      }
    }
  }, []);

  // ── URL 쿼리 파라미터에서 선택 항목 초기화 ──
  useEffect(() => {
    const dealsParam = searchParams.get("deals");
    const newsParam = searchParams.get("news");

    if (dealsParam) {
      setSelectedDealIds(new Set(dealsParam.split(",")));
    }
    if (newsParam) {
      setSelectedNewsIds(new Set(newsParam.split(",")));
    }
  }, [searchParams]);

  // ── 선택된 뉴스/딜이 없으면 기본 선택 ──
  useEffect(() => {
    if (allNews.length > 0 && selectedNewsIds.size === 0 && !searchParams.get("news")) {
      setSelectedNewsIds(new Set(allNews.slice(0, 4).map((n: any) => n.id ?? n.title)));
    }
  }, [allNews, searchParams, selectedNewsIds.size]);

  useEffect(() => {
    if (allDeals.length > 0 && selectedDealIds.size === 0 && !searchParams.get("deals")) {
      setSelectedDealIds(new Set(allDeals.slice(0, 3).map((d: any) => d.id)));
    }
  }, [allDeals, searchParams, selectedDealIds.size]);

  // ── 실시간 미리보기 데이터 ──
  const previewData = useMemo(() => {
    const base = magazineData || {};

    const filteredNews = allNews.filter((n: any) =>
      selectedNewsIds.has(n.id ?? n.title)
    );
    const filteredDeals = allDeals.filter((d: any) =>
      selectedDealIds.has(d.id)
    );

    return {
      ...base,
      headline,
      briefing,
      themeColor,
      market_temp: marketTemp,
      cover_keywords: coverKeywords.filter(Boolean),
      cover_image_url: coverImageUrl,
      field_note: fieldNote,
      theme_title: themeTitle,
      theme_body_md: themeBodyMd,
      featured_deal_ids: Array.from(selectedDealIds),
      topNews: filteredNews.map((n: any) => ({
        title: n.title,
        summary: n.summary,
        source: n.source,
        sentiment: n.sentiment,
        topic: n.topic,
      })),
      dealHighlights: filteredDeals,
    };
  }, [
    magazineData,
    headline,
    briefing,
    themeColor,
    marketTemp,
    coverKeywords,
    coverImageUrl,
    fieldNote,
    themeTitle,
    themeBodyMd,
    allNews,
    allDeals,
    selectedNewsIds,
    selectedDealIds,
  ]);

  // ── 뉴스 토글 ──
  const toggleNews = useCallback((newsId: string) => {
    setSelectedNewsIds((prev) => {
      const next = new Set(prev);
      if (next.has(newsId)) {
        next.delete(newsId);
      } else {
        next.add(newsId);
      }
      return next;
    });
  }, []);

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

  // ── 저장 및 공유 모달 열기 ──
  const handlePublishAndShare = useCallback(async () => {
    if (!brokerSlug || !previewData) return;
    setSaving(true);
    try {
      // 1. 에디션 PATCH (editions API)
      if (editionId) {
        const patchRes = await fetch("/api/magazine/editions", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editionId,
            title: headline,
            market_temp: marketTemp,
            cover_keywords: coverKeywords.filter(Boolean),
            cover_image_url: coverImageUrl,
            field_note: fieldNote,
            theme_title: themeTitle,
            theme_body_md: themeBodyMd,
            featured_deal_ids: Array.from(selectedDealIds),
            theme_color: themeColor,
            content: previewData,
            status: "published",
          }),
        });
        if (!patchRes.ok) {
          const err = await patchRes.json();
          console.error("Edition PATCH failed", err);
        }
      }

      // 2. 기존 daily API에도 저장 (backward compat)
      const res = await fetch(`/api/magazine/${brokerSlug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(previewData),
      });

      // 3. 프로필 저장
      const profileRes = await fetch("/api/broker/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: brokerSlug,
          magazine_title: magazineTitle,
          magazine_theme_color: themeColor,
        }),
      });

      if (res.ok && profileRes.ok) {
        setMagazineData(previewData);
        setEditionStatus("published");
        setShowShareModal(true);
      } else {
        alert("저장에 실패했습니다.");
      }
    } catch (err) {
      console.error(err);
      alert("오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }, [
    brokerSlug,
    previewData,
    magazineTitle,
    themeColor,
    editionId,
    headline,
    marketTemp,
    coverKeywords,
    coverImageUrl,
    fieldNote,
    themeTitle,
    themeBodyMd,
    selectedDealIds,
  ]);

  // ── 카카오 공유 ──
  const handleMagazineKakaoShare = () => {
    if (!brokerSlug) return;

    const baseUrl =
      typeof window !== "undefined" && window.location.hostname.includes("vercel.app")
        ? "https://www.credeal.net"
        : typeof window !== "undefined"
        ? window.location.origin
        : "https://www.credeal.net";

    const magazineUrl = `${baseUrl}/magazine/${brokerSlug}/${today}`;
    const ogImageUrl = `${baseUrl}/api/og/magazine?brokerId=${brokerSlug}&date=${today}`;

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
    alert("링크가 복사되었습니다. 카카오톡에 붙여넣기 하세요.");
  };

  const handleCopyLink = () => {
    if (!brokerSlug) return;
    const origin =
      typeof window !== "undefined" ? window.location.origin : "https://www.credeal.net";
    const magazineUrl = `${origin}/magazine/${brokerSlug}/${today}`;
    navigator.clipboard.writeText(magazineUrl);
    alert("링크가 복사되었습니다.");
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
      draft: { label: "초안", cls: "text-slate-400 bg-slate-500/12 border-slate-500/20" },
      editing: { label: "편집중", cls: "text-amber-300 bg-amber-500/12 border-amber-500/20" },
      review: { label: "검토", cls: "text-blue-300 bg-blue-500/12 border-blue-500/20" },
      needs_review: { label: "검토필요", cls: "text-orange-300 bg-orange-500/12 border-orange-500/20" },
      scheduled: { label: "예약", cls: "text-purple-300 bg-purple-500/12 border-purple-500/20" },
      published: { label: "발행됨", cls: "text-emerald-300 bg-emerald-500/12 border-emerald-500/20" },
      archived: { label: "보관", cls: "text-slate-500 bg-slate-600/12 border-slate-600/20" },
    };
    const s = map[status] || map.draft;
    return (
      <span
        className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${s.cls}`}
      >
        {s.label}
      </span>
    );
  }

  // ── 로딩 ──
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0B1120]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  // ─── 탭 콘텐츠 렌더링 ───────────────────────────────────────────────
  const renderTabContent = () => {
    switch (activeTab) {
      // ━━━ 커버 탭 ━━━
      case "cover":
        return (
          <div className="space-y-5">
            {/* 안내 */}
            <div className="flex items-start gap-2 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
              <Info className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-indigo-200/80 leading-relaxed">
                매거진 커버를 구성합니다. 시장 온도, 키워드, AI 브리핑을 설정하세요.
                변경사항은 실시간으로 우측 미리보기에 반영됩니다.
              </p>
            </div>

            {/* 시장 온도 */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300">
                시장 온도
              </label>
              <div className="flex flex-wrap gap-2">
                {MARKET_TEMPS.map((temp) => {
                  const cfg = MARKET_TEMP_CONFIG[temp];
                  const isActive = marketTemp === temp;
                  return (
                    <motion.button
                      key={temp}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setMarketTemp(isActive ? null : temp)}
                      className={`flex items-center gap-1.5 text-[11px] font-bold px-3 py-2 rounded-xl border transition-all ${
                        isActive
                          ? "border-white/30 bg-white/10 text-white shadow-lg"
                          : "border-slate-700 bg-slate-800/30 text-slate-400 hover:border-slate-600"
                      }`}
                      style={isActive ? { borderColor: cfg.color + "60", backgroundColor: cfg.color + "18" } : {}}
                    >
                      <span className="text-sm">{cfg.emoji}</span>
                      {temp}
                    </motion.button>
                  );
                })}
              </div>
              {marketTemp && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-[10px] text-slate-500 leading-relaxed pl-1"
                >
                  {MARKET_TEMP_CONFIG[marketTemp].description}
                </motion.p>
              )}
            </div>

            {/* 키워드 뱃지 */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300">
                키워드 뱃지 (최대 3개)
              </label>
              <div className="flex gap-2">
                {coverKeywords.map((kw, idx) => (
                  <input
                    key={idx}
                    value={kw}
                    onChange={(e) => updateKeyword(idx, e.target.value)}
                    maxLength={12}
                    className="flex-1 bg-[#0f1523] border border-slate-700 rounded-lg px-3 py-2 text-[12px] text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all placeholder:text-slate-600"
                    placeholder={`키워드 ${idx + 1}`}
                  />
                ))}
              </div>
            </div>

            {/* 헤드라인 */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300">헤드라인</label>
              <input
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                className="w-full bg-[#0f1523] border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all placeholder:text-slate-600"
                placeholder="매거진 제목을 입력하세요"
              />
            </div>

            {/* AI 브리핑 */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300">AI 브리핑</label>
              <textarea
                value={briefing}
                onChange={(e) => setBriefing(e.target.value)}
                className="w-full h-40 bg-[#0f1523] border border-slate-700 rounded-xl px-4 py-3 text-[13px] text-slate-300 leading-relaxed focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all resize-none placeholder:text-slate-600"
                placeholder="고객에게 전달할 핵심 메시지를 입력하세요"
              />
            </div>

            {/* 커버 이미지 */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300">
                커버 배경 이미지
              </label>
              <div className="flex items-center gap-3">
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    const url = prompt("이미지 URL을 입력하세요:");
                    if (url) setCoverImageUrl(url);
                  }}
                  className="flex items-center gap-1.5 text-[11px] font-bold px-3.5 py-2 rounded-lg border border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 transition-all"
                >
                  <Upload className="w-3.5 h-3.5" />
                  이미지 URL 설정
                </motion.button>
                {coverImageUrl && (
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-[10px] text-indigo-300 truncate flex-1">
                      {coverImageUrl}
                    </span>
                    <button
                      onClick={() => setCoverImageUrl(null)}
                      className="text-slate-500 hover:text-slate-300 flex-shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );

      // ━━━ 필드노트 탭 ━━━
      case "field_note":
        return (
          <div className="space-y-4">
            <div className="flex items-start gap-2 p-3 bg-amber-500/8 border border-amber-500/15 rounded-xl">
              <PenLine className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-200/80 leading-relaxed">
                현장 전문가로서 이번 주 시장에 대한 직접 분석을 작성하세요.
                독자들이 가장 신뢰하는 섹션입니다.
              </p>
            </div>

            {FIELD_NOTE_FIELDS.map((field) => (
              <div key={field.key} className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-slate-300">
                    {field.label}
                  </label>
                  <button
                    onClick={() =>
                      setActiveTooltip(
                        activeTooltip === field.key ? null : field.key
                      )
                    }
                    className="text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    <Info className="w-3 h-3" />
                  </button>
                </div>
                <AnimatePresence>
                  {activeTooltip === field.key && (
                    <motion.p
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="text-[10px] text-slate-500 leading-relaxed pl-1 overflow-hidden"
                    >
                      {field.tooltip}
                    </motion.p>
                  )}
                </AnimatePresence>
                <textarea
                  value={fieldNote[field.key]}
                  onChange={(e) => updateFieldNote(field.key, e.target.value)}
                  className="w-full h-20 bg-[#0f1523] border border-slate-700 rounded-xl px-4 py-3 text-[12px] text-slate-300 leading-relaxed focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all resize-none placeholder:text-slate-600"
                  placeholder={field.placeholder}
                />
              </div>
            ))}
          </div>
        );

      // ━━━ 테마&매물 탭 ━━━
      case "theme_deals":
        return (
          <div className="space-y-5">
            {/* 테마 섹션 */}
            <div className="space-y-3 p-4 bg-slate-800/30 border border-slate-700/50 rounded-xl">
              <div className="flex items-center gap-2">
                <Target className="w-3.5 h-3.5 text-indigo-400" />
                <span className="text-xs font-bold text-slate-200">금주의 테마</span>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-semibold text-slate-400">
                  테마 제목
                </label>
                <input
                  value={themeTitle}
                  onChange={(e) => setThemeTitle(e.target.value)}
                  className="w-full bg-[#0f1523] border border-slate-700 rounded-lg px-3 py-2.5 text-[12px] text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all placeholder:text-slate-600"
                  placeholder="예: 강남 오피스 공실률 반전의 신호"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-semibold text-slate-400">
                  테마 본문 (마크다운)
                </label>
                <textarea
                  value={themeBodyMd}
                  onChange={(e) => setThemeBodyMd(e.target.value)}
                  className="w-full h-32 bg-[#0f1523] border border-slate-700 rounded-lg px-3 py-2.5 text-[12px] text-slate-300 leading-relaxed focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all resize-none placeholder:text-slate-600 font-mono"
                  placeholder="테마에 대한 심층 분석을 작성하세요...&#10;&#10;마크다운 형식을 지원합니다."
                />
              </div>
            </div>

            {/* 매물 선택 */}
            <div className="space-y-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold text-slate-300">
                  주목 매물 ({selectedDealIds.size}/{allDeals.length})
                </p>
                <span className="text-[10px] text-slate-500">
                  테마와 연계할 매물을 선택하세요
                </span>
              </div>

              {allDeals.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                  <Building2 className="w-8 h-8 mb-2 opacity-40" />
                  <p className="text-xs">등록된 매물이 없습니다.</p>
                </div>
              ) : (
                allDeals.map((deal: any, idx: number) => {
                  const dealId = deal.id;
                  const isSelected = selectedDealIds.has(dealId);
                  return (
                    <motion.button
                      key={dealId ?? idx}
                      onClick={() => toggleDeal(dealId)}
                      whileTap={{ scale: 0.98 }}
                      className={`w-full text-left p-3 rounded-xl border transition-all duration-200 ${
                        isSelected
                          ? "bg-rose-500/8 border-rose-500/25"
                          : "bg-slate-800/20 border-slate-700/40 opacity-60"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex-shrink-0">
                          {isSelected ? (
                            <Check className="w-4 h-4 text-rose-400 bg-rose-500/20 rounded-md p-0.5" />
                          ) : (
                            <div className="w-4 h-4 border border-slate-600 rounded-md" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-bold text-white mb-0.5 line-clamp-1">
                            {deal.assetType || deal.asset_type || "매물"}
                          </p>
                          <p className="text-[10px] text-slate-500 line-clamp-1 mb-1.5">
                            {deal.address}
                          </p>
                          <div className="flex items-center gap-2 flex-wrap">
                            {(deal.areaSignal || deal.area_signal) && (
                              <span className="text-[9px] font-medium text-slate-300 bg-slate-700/60 px-1.5 py-0.5 rounded">
                                {deal.areaSignal || deal.area_signal}
                              </span>
                            )}
                            {deal.price > 0 && (
                              <span className="text-[10px] font-extrabold text-indigo-300">
                                {fmt(deal.price)}
                              </span>
                            )}
                            {deal.buyerInterestCount > 0 && (
                              <span className="text-[9px] text-rose-300 bg-rose-500/12 px-1.5 py-0.5 rounded-full">
                                관심 {deal.buyerInterestCount}명
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </motion.button>
                  );
                })
              )}
            </div>
          </div>
        );

      // ━━━ 뉴스큐레이션 탭 ━━━
      case "news":
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-slate-300">
                뉴스 큐레이션 ({selectedNewsIds.size}/{allNews.length})
              </p>
              <span className="text-[10px] text-slate-500">
                토글하여 매거진에 포함할 뉴스를 선택하세요
              </span>
            </div>

            {allNews.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                <Newspaper className="w-8 h-8 mb-2 opacity-40" />
                <p className="text-xs">뉴스를 불러오는 중이거나 뉴스가 없습니다.</p>
              </div>
            ) : (
              allNews.map((news: any, idx: number) => {
                const newsId = news.id ?? news.title;
                const isSelected = selectedNewsIds.has(newsId);
                return (
                  <motion.button
                    key={newsId ?? idx}
                    onClick={() => toggleNews(newsId)}
                    whileTap={{ scale: 0.98 }}
                    className={`w-full text-left p-3 rounded-xl border transition-all duration-200 ${
                      isSelected
                        ? "bg-indigo-500/10 border-indigo-500/30"
                        : "bg-slate-800/20 border-slate-700/40 opacity-60"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-1 flex-shrink-0">
                        {isSelected ? (
                          <ToggleRight className="w-5 h-5 text-indigo-400" />
                        ) : (
                          <ToggleLeft className="w-5 h-5 text-slate-600" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-bold text-white leading-snug line-clamp-2 mb-1">
                          {news.title}
                        </p>
                        {/* AI summary inline */}
                        {news.summary && (
                          <p className="text-[10px] text-slate-400 leading-relaxed mb-1.5 line-clamp-3">
                            {news.summary}
                          </p>
                        )}
                        <div className="flex items-center gap-2 flex-wrap">
                          {news.importance_score != null && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-amber-300 bg-amber-500/12 border border-amber-500/20 px-1.5 py-0.5 rounded-full">
                              <Star className="w-2.5 h-2.5" />
                              {news.importance_score}
                            </span>
                          )}
                          {news.topic && (
                            <span className="text-[9px] font-medium text-indigo-300 bg-indigo-500/12 border border-indigo-500/20 px-1.5 py-0.5 rounded-full">
                              {news.topic}
                            </span>
                          )}
                          {news.source && (
                            <span className="text-[9px] text-slate-500">
                              {news.source}
                            </span>
                          )}
                          {news.sentiment && (
                            <span
                              className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                                news.sentiment === "bullish"
                                  ? "text-emerald-300 bg-emerald-500/12"
                                  : news.sentiment === "bearish"
                                  ? "text-rose-300 bg-rose-500/12"
                                  : "text-slate-400 bg-slate-500/12"
                              }`}
                            >
                              {news.sentiment === "bullish"
                                ? "긍정"
                                : news.sentiment === "bearish"
                                ? "부정"
                                : "중립"}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.button>
                );
              })
            )}
          </div>
        );

      // ━━━ 발행설정 탭 ━━━
      case "publish":
        return (
          <div className="space-y-5">
            {/* 에디션 정보 */}
            <div className="space-y-3 p-4 bg-slate-800/30 border border-slate-700/50 rounded-xl">
              <div className="flex items-center gap-2">
                <Info className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-xs font-bold text-slate-200">에디션 정보</span>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-500">에디션 타입</span>
                  <div className="flex gap-1.5">
                    {(["daily", "weekly"] as EditionType[]).map((t) => (
                      <button
                        key={t}
                        onClick={() => setEditionType(t)}
                        className={`text-[10px] font-bold px-2.5 py-1 rounded-lg transition-all ${
                          editionType === t
                            ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                            : "bg-slate-800 text-slate-500 border border-slate-700 hover:text-slate-300"
                        }`}
                      >
                        {t === "daily" ? "데일리" : "위클리"}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-500">에디션 라벨</span>
                  <span className="text-[11px] text-white font-mono bg-slate-800 px-2 py-0.5 rounded">
                    {editionLabel}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-500">상태</span>
                  <div className="flex items-center gap-2">
                    {statusBadge(editionStatus)}
                    <select
                      value={editionStatus}
                      onChange={(e) => setEditionStatus(e.target.value as EditionStatus)}
                      className="text-[10px] bg-slate-800 border border-slate-700 text-slate-300 rounded-lg px-2 py-1 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="draft">초안</option>
                      <option value="editing">편집중</option>
                      <option value="review">검토</option>
                      <option value="published">발행</option>
                      <option value="needs_review">검토 필요</option>
                      <option value="archived">보관</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* 테마 컬러 */}
            <div className="space-y-3 p-4 bg-slate-800/30 border border-slate-700/50 rounded-xl">
              <div className="flex items-center gap-2">
                <Palette className="w-3.5 h-3.5 text-indigo-400" />
                <span className="text-xs font-bold text-slate-200">테마 컬러</span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={themeColor}
                  onChange={(e) => setThemeColor(e.target.value)}
                  className="w-10 h-10 rounded-lg border border-slate-600 cursor-pointer bg-transparent"
                />
                <div>
                  <p className="text-[11px] text-white font-mono">{themeColor}</p>
                  <p className="text-[10px] text-slate-500">
                    매거진 강조 컬러를 설정합니다
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                {["#6366f1", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444"].map(
                  (color) => (
                    <button
                      key={color}
                      onClick={() => setThemeColor(color)}
                      className={`w-7 h-7 rounded-full border-2 transition-all ${
                        themeColor === color
                          ? "border-white scale-110"
                          : "border-transparent hover:border-slate-500"
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  )
                )}
              </div>
            </div>

            {/* 브로커 정보 */}
            <div className="space-y-3 p-4 bg-slate-800/30 border border-slate-700/50 rounded-xl">
              <div className="flex items-center gap-2">
                <Info className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-xs font-bold text-slate-200">중개인 정보</span>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-500">슬러그</span>
                  <span className="text-[11px] text-white font-mono bg-slate-800 px-2 py-0.5 rounded">
                    {brokerSlug || "-"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-500">발행일</span>
                  <span className="text-[11px] text-white">{today}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-500">선택된 뉴스</span>
                  <span className="text-[11px] text-indigo-300 font-bold">
                    {selectedNewsIds.size}건
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-500">선택된 매물</span>
                  <span className="text-[11px] text-rose-300 font-bold">
                    {selectedDealIds.size}건
                  </span>
                </div>
              </div>
            </div>

            {/* 에디션 아카이브 링크 */}
            {brokerSlug && (
              <Link
                href={`/magazine/${brokerSlug}`}
                className="flex items-center justify-center gap-2 text-[11px] font-semibold px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 transition-all"
              >
                <BookOpen className="w-3.5 h-3.5" />
                지난 에디션 보기
                <ChevronRight className="w-3 h-3 opacity-50" />
              </Link>
            )}

            {/* 매거진 발행 */}
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={handlePublishAndShare}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 text-sm font-bold px-4 py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 transition-all shadow-lg shadow-indigo-500/25"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              매거진 발행 및 공유
            </motion.button>
          </div>
        );

      // ━━━ 성과 탭 ━━━
      case "analytics":
        return (
          <div className="space-y-4 pb-6">
            {/* ── 배포 성과 서머리 ── */}
            <div className="rounded-xl border border-orange-500/20 bg-gradient-to-br from-orange-950/30 to-amber-950/20 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-orange-400" />
                <span className="text-xs font-bold text-orange-300">매거진 배포 현황</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-black/20 border border-white/5 rounded-lg p-3 text-center">
                  <p className="text-lg font-black text-white">{analyticsData?.subscriberCount ?? 0}</p>
                  <p className="text-[10px] text-orange-200/60">활성 구독자</p>
                </div>
                <div className="bg-black/20 border border-white/5 rounded-lg p-3 text-center">
                  <p className="text-lg font-black text-white">{analyticsData?.lastDistribution?.sentCount ?? 0}</p>
                  <p className="text-[10px] text-orange-200/60">발송 성공</p>
                </div>
                <div className="bg-black/20 border border-white/5 rounded-lg p-3 text-center">
                  <p className="text-lg font-black text-white">
                    {analyticsData?.lastDistribution
                      ? `${Math.round((analyticsData.lastDistribution.sentCount / Math.max(analyticsData.lastDistribution.totalCount, 1)) * 100)}%`
                      : "—"}
                  </p>
                  <p className="text-[10px] text-orange-200/60">발송률</p>
                </div>
              </div>
              {analyticsData?.lastDistribution?.date && (
                <p className="text-[10px] text-orange-200/40 text-center">
                  📅 최근 배포: {analyticsData.lastDistribution.date}
                </p>
              )}
            </div>

            {/* ── 열람 통계 ── */}
            <div className="rounded-xl border border-indigo-500/20 bg-gradient-to-br from-indigo-950/30 to-purple-950/20 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-indigo-400" />
                <span className="text-xs font-bold text-indigo-300">최근 30일 열람 통계</span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                <div className="bg-black/20 border border-white/5 rounded-lg p-2.5 text-center">
                  <p className="text-base font-black text-white">{analyticsData?.viewStats.totalViews ?? 0}</p>
                  <p className="text-[9px] text-indigo-200/60">총 열람</p>
                </div>
                <div className="bg-black/20 border border-white/5 rounded-lg p-2.5 text-center">
                  <p className="text-base font-black text-white">{analyticsData?.viewStats.uniqueVisitors ?? 0}</p>
                  <p className="text-[9px] text-indigo-200/60">방문자</p>
                </div>
                <div className="bg-black/20 border border-white/5 rounded-lg p-2.5 text-center">
                  <p className="text-base font-black text-white">{analyticsData?.viewStats.avgDwellSeconds ?? 0}<span className="text-[9px] font-normal">초</span></p>
                  <p className="text-[9px] text-indigo-200/60">평균 체류</p>
                </div>
                <div className="bg-black/20 border border-white/5 rounded-lg p-2.5 text-center">
                  <p className="text-base font-black text-white">{analyticsData?.viewStats.completionRate ?? 0}<span className="text-[9px] font-normal">%</span></p>
                  <p className="text-[9px] text-indigo-200/60">완독률</p>
                </div>
              </div>
            </div>

            {/* ── 발행 이력 ── */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <Newspaper className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-xs font-bold text-slate-200">발행 이력</span>
                <span className="text-[10px] text-slate-500 ml-auto">{editionHistory.length}건</span>
              </div>
              {editionHistory.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/50 p-6 text-center">
                  <Newspaper className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                  <p className="text-xs text-slate-500">아직 발행된 매거진이 없습니다</p>
                  <p className="text-[10px] text-slate-600 mt-1">커버 탭에서 첫 매거진을 만들어보세요!</p>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-[400px] overflow-y-auto scrollbar-none">
                  {editionHistory.map((ed: any) => {
                    const statusColors: Record<string, string> = {
                      published: "bg-emerald-500/10 text-emerald-400",
                      draft: "bg-slate-500/10 text-slate-400",
                      editing: "bg-blue-500/10 text-blue-400",
                      review: "bg-amber-500/10 text-amber-400",
                      needs_review: "bg-rose-500/10 text-rose-400",
                      archived: "bg-zinc-500/10 text-zinc-400",
                    };
                    const statusLabels: Record<string, string> = {
                      published: "발행됨",
                      draft: "초안",
                      editing: "편집중",
                      review: "검토중",
                      needs_review: "검토필요",
                      archived: "보관",
                    };
                    const tempEmoji: Record<string, string> = {
                      "적극 매수": "🔥",
                      "선별 매수": "📈",
                      "관망": "⏸️",
                      "조정 대기": "📉",
                      "위기 경계": "🚨",
                    };
                    return (
                      <a
                        key={ed.id}
                        href={`/magazine/${ed.broker_id}/${(ed.published_at || ed.created_at)?.slice(0, 10)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/50 px-3 py-2.5 hover:border-indigo-500/30 hover:bg-slate-800/50 transition-all group"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-slate-500">
                              📅 {(ed.published_at || ed.created_at)?.slice(0, 10)}
                            </span>
                            <span className="text-[10px] text-slate-600">{ed.edition_label}</span>
                          </div>
                          <p className="text-xs font-semibold text-white truncate mt-0.5">
                            {ed.title || "제목 없음"}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {ed.market_temp && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-300">
                              {tempEmoji[ed.market_temp] || "🌡️"} {ed.market_temp}
                            </span>
                          )}
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${statusColors[ed.status] || statusColors.draft}`}>
                            {statusLabels[ed.status] || ed.status}
                          </span>
                          {(ed.view_count ?? 0) > 0 && (
                            <span className="text-[10px] text-slate-500">👁️ {ed.view_count}</span>
                          )}
                        </div>
                        <ExternalLink className="w-3 h-3 text-slate-600 group-hover:text-indigo-400 transition-colors shrink-0" />
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  // ─── 렌더링 ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0B1120] flex flex-col lg:flex-row font-sans">
      {/* ━━━ 왼쪽 패널: 에디터 ━━━ */}
      <div className="w-full lg:w-[460px] bg-[#111827] border-r border-slate-800 flex flex-col h-[55vh] lg:h-screen sticky top-0 overflow-hidden">
        {/* 헤더 */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-[#111827]/90 backdrop-blur-md z-10 flex-shrink-0">
          <div className="flex items-center gap-3">
            <Link
              href="/broker"
              className="p-2 -ml-2 rounded-lg hover:bg-slate-800 text-slate-400 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <h1 className="text-sm font-bold text-slate-200">Content Studio</h1>
              <div className="flex items-center gap-2">
                <p className="text-[10px] text-slate-500">
                  {editionLabel} · {editionType === "weekly" ? "위클리" : "데일리"}
                </p>
                {statusBadge(editionStatus)}
              </div>
            </div>
          </div>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handlePublishAndShare}
            disabled={saving}
            className="flex items-center gap-1.5 text-[11px] font-bold px-4 py-2 rounded-xl bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-50 transition-colors"
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            저장
          </motion.button>
        </div>

        {/* 탭 네비게이션 */}
        <div className="flex border-b border-slate-800 flex-shrink-0 bg-[#111827]">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-[11px] font-semibold transition-all relative ${
                  isActive ? "text-indigo-400" : "text-slate-500 hover:text-slate-300"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{tab.label}</span>
                {isActive && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute bottom-0 left-2 right-2 h-0.5 bg-indigo-500 rounded-full"
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* 탭 콘텐츠 */}
        <div className="flex-1 overflow-y-auto p-4">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.15 }}
            >
              {renderTabContent()}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* 하단 액션 */}
        <div className="p-4 border-t border-slate-800 space-y-2 flex-shrink-0 bg-[#111827]">
          <Link
            href={`/magazine/${brokerSlug}/${today}`}
            target="_blank"
            className="w-full flex items-center justify-center gap-2 text-[11px] font-semibold px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 transition-all"
          >
            <Eye className="w-3.5 h-3.5" />
            📱 실제 화면으로 보기
            <ExternalLink className="w-3 h-3 ml-1 opacity-50" />
          </Link>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handlePublishAndShare}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 text-[11px] font-bold px-4 py-2.5 rounded-xl bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-50 transition-colors"
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            매거진 발행 및 공유
          </motion.button>
        </div>
      </div>

      {/* ━━━ 우측 패널: 미리보기 ━━━ */}
      <div className="flex-1 bg-slate-950 flex items-center justify-center p-4 lg:p-10 overflow-y-auto">
        <div className="flex flex-col items-center gap-4">
          {/* 미리보기 라벨 */}
          <div className="flex items-center gap-2 text-slate-500">
            <Eye className="w-3.5 h-3.5" />
            <span className="text-[11px] font-medium">실시간 미리보기</span>
            <ChevronRight className="w-3 h-3" />
            <span className="text-[10px] text-slate-600">
              iPhone 14 Pro (375×812)
            </span>
          </div>

          {/* 폰 목업 */}
          <div className="w-[375px] h-[812px] bg-[#0B1120] border-[8px] border-slate-900 rounded-[3rem] overflow-hidden shadow-2xl relative flex flex-col shrink-0">
            {/* 노치 */}
            <div className="absolute top-0 inset-x-0 h-6 bg-slate-900 rounded-b-xl z-20 mx-auto w-40" />

            {/* 매거진 뷰 */}
            <div className="flex-1 overflow-y-auto w-full no-scrollbar relative">
              {previewData && (
                <MagazineView
                  data={previewData}
                  brokerId={brokerSlug || "demo"}
                  date={today}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── 공유 모달 ── */}
      <AnimatePresence>
        {showShareModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="bg-slate-900 border border-slate-800 p-6 rounded-2xl w-full max-w-sm shadow-2xl relative"
            >
              <button
                onClick={() => setShowShareModal(false)}
                className="absolute top-4 right-4 text-slate-500 hover:text-slate-300"
              >
                ✕
              </button>

              <div className="text-center mb-6">
                <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Check className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-white mb-1">
                  매거진 발행 완료!
                </h3>
                <p className="text-[12px] text-slate-400">
                  고객들에게 이번 주 매거진을 공유해보세요.
                </p>
              </div>

              <div className="space-y-3">
                <button
                  onClick={handleMagazineKakaoShare}
                  className="w-full flex items-center justify-center gap-2 bg-[#FEE500] hover:bg-[#FEE500]/90 text-[#3C1E1E] font-bold text-sm py-3.5 rounded-xl transition-all"
                >
                  <MessageSquare className="w-4 h-4" />
                  카카오톡으로 공유
                </button>
                <button
                  onClick={handleCopyLink}
                  className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm py-3.5 rounded-xl transition-all border border-slate-700"
                >
                  <ExternalLink className="w-4 h-4" />
                  링크 복사하기
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
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
      <Suspense
        fallback={
          <div className="flex h-screen items-center justify-center bg-[#0B1120]">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          </div>
        }
      >
        <MagazineEditorInner />
      </Suspense>
    </>
  );
}
