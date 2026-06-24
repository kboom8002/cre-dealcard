"use client";

import React, { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { MagazineView } from "@/app/(public)/magazine/[brokerId]/[date]/magazine-view";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
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
  Sparkles,
  Plus,
  Check,
  Pencil,
  Send,
  ExternalLink,
  Palette,
  ChevronRight,
  Star,
  ToggleLeft,
  ToggleRight,
  MessageSquare,
} from "lucide-react";

// ─── 탭 정의 ──────────────────────────────────────────────────────
const TABS = [
  { key: "edit" as const, label: "편집", icon: Pencil },
  { key: "news" as const, label: "뉴스 📰", icon: Newspaper },
  { key: "deals" as const, label: "딜카드 🏢", icon: Building2 },
  { key: "settings" as const, label: "설정 ⚙️", icon: Settings },
];

type TabKey = (typeof TABS)[number]["key"];

// ─── 메인 컴포넌트 ──────────────────────────────────────────────────
function MagazineEditorInner() {
  const searchParams = useSearchParams();

  // ── 상태 관리 ──
  const [activeTab, setActiveTab] = useState<TabKey>("edit");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  const [magazineData, setMagazineData] = useState<any>(null);
  const [headline, setHeadline] = useState("");
  const [briefing, setBriefing] = useState("");
  const [brokerComment, setBrokerComment] = useState("");
  const [aiExpandedComment, setAiExpandedComment] = useState("");
  const [selectedNewsIds, setSelectedNewsIds] = useState<Set<string>>(new Set());
  const [selectedDealIds, setSelectedDealIds] = useState<Set<string>>(new Set());
  const [allNews, setAllNews] = useState<any[]>([]);
  const [allDeals, setAllDeals] = useState<any[]>([]);
  const [themeColor, setThemeColor] = useState("#6366f1");
  const [brokerSlug, setBrokerSlug] = useState<string | null>(null);
  const [magazineTitle, setMagazineTitle] = useState("");
  const [showShareModal, setShowShareModal] = useState(false);
  const [kakaoReady, setKakaoReady] = useState(false);

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

        // 매거진 데이터 가져오기
        const res = await fetch(`/api/magazine/${slug}`);
        if (res.ok) {
          const json = await res.json();
          if (json.data) {
            setMagazineData(json.data);
            setHeadline(json.data.headline || "");
            setBriefing(json.data.briefing || "");

            // 딜카드 (dealHighlights)
            if (Array.isArray(json.data.dealHighlights)) {
              setAllDeals(json.data.dealHighlights);
            }

            // 뉴스 (topNews)
            if (Array.isArray(json.data.topNews)) {
              setAllNews(json.data.topNews);
            }
          }
        }

        // 뉴스 전체 목록을 외부 테이블에서 가져오기
        const { data: externalNews } = await supabase
          .from("external_news")
          .select("id, title, summary, source, sentiment, importance_score, topic")
          .order("importance_score", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(20);

        if (externalNews && externalNews.length > 0) {
          setAllNews(externalNews);
        }

        // 딜카드 전체 목록
        const { data: deals } = await supabase
          .from("building_ssot_lite")
          .select(
            "id, address, area_signal, asset_type, price, status, photo_urls, buyer_interest_count"
          )
          .eq("owner_id", user.id)
          .in("status", ["public_signal_ready", "active"])
          .order("updated_at", { ascending: false })
          .limit(10);

        if (deals && deals.length > 0) {
          setAllDeals(
            deals.map((d: any) => ({
              id: d.id,
              address: d.address,
              areaSignal: d.area_signal,
              assetType: d.asset_type,
              price: d.price,
              photoUrl: (d.photo_urls as string[] | null)?.[0] ?? null,
              buyerInterestCount: d.buyer_interest_count ?? 0,
            }))
          );
        }
      } catch (err) {
        console.error("Failed to load magazine data", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // ── Kakao SDK 로딩 ──
  useEffect(() => {
    if (typeof window !== "undefined" && !window.Kakao) {
      const script = document.createElement("script");
      script.src = "https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js";
      script.async = true;
      script.onload = () => {
        if (window.Kakao && !window.Kakao.isInitialized() && process.env.NEXT_PUBLIC_KAKAO_APP_KEY) {
          window.Kakao.init(process.env.NEXT_PUBLIC_KAKAO_APP_KEY);
          setKakaoReady(true);
        }
      };
      document.head.appendChild(script);
    } else if (typeof window !== "undefined" && window.Kakao) {
      setKakaoReady(true);
    }
  }, []);

  // ── URL 쿼리 파라미터에서 선택 항목 초기화 ──
  useEffect(() => {
    const dealsParam = searchParams.get("deals");
    const newsParam = searchParams.get("news");
    const commentParam = searchParams.get("comment");

    if (dealsParam) {
      setSelectedDealIds(new Set(dealsParam.split(",")));
    }
    if (newsParam) {
      setSelectedNewsIds(new Set(newsParam.split(",")));
    }
    if (commentParam) {
      setBrokerComment(commentParam);
      setAiExpandedComment(commentParam);
    }
  }, [searchParams]);

  // ── 선택된 뉴스/딜이 없으면 전부 선택 ──
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
    if (!magazineData) return null;

    const filteredNews = allNews.filter((n: any) =>
      selectedNewsIds.has(n.id ?? n.title)
    );
    const filteredDeals = allDeals.filter((d: any) =>
      selectedDealIds.has(d.id)
    );

    return {
      ...magazineData,
      headline,
      briefing,
      brokerComment: aiExpandedComment || (brokerComment.trim() ? brokerComment : null),
      themeColor,
      topNews: filteredNews.map((n: any) => ({
        title: n.title,
        summary: n.summary,
        source: n.source,
        sentiment: n.sentiment,
        topic: n.topic,
      })),
      dealHighlights: filteredDeals,
    };
  }, [magazineData, headline, briefing, brokerComment, aiExpandedComment, themeColor, allNews, allDeals, selectedNewsIds, selectedDealIds]);

  // ── AI 코멘트 확장 ──
  const handleAiExpand = useCallback(async () => {
    if (!brokerComment.trim()) return;
    setAiLoading(true);
    try {
      const res = await fetch("/api/broker/studio/ai-comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: brokerComment }),
      });
      const json = await res.json();
      if (json.ok && json.data) {
        setAiExpandedComment(json.data);
      }
    } catch (err) {
      console.error("AI expand failed", err);
    } finally {
      setAiLoading(false);
    }
  }, [brokerComment]);

  // ── 브리핑에 삽입 ──
  const insertCommentToBriefing = useCallback(() => {
    if (!aiExpandedComment) return;
    setBriefing((prev) => prev + "\n\n💬 브로커 코멘트\n" + aiExpandedComment);
    setAiExpandedComment("");
    setBrokerComment("");
  }, [aiExpandedComment]);

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

  // ── 저장 및 공유 모달 열기 ──
  const handlePublishAndShare = useCallback(async () => {
    if (!brokerSlug || !previewData) return;
    setSaving(true);
    try {
      // 1. 매거진 데이터 저장
      const res = await fetch(`/api/magazine/${brokerSlug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(previewData),
      });
      // 2. 제목/테마/슬러그 저장
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
  }, [brokerSlug, previewData, magazineTitle, themeColor]);

  const handleMagazineKakaoShare = () => {
    if (!brokerSlug) return;
    const origin = typeof window !== "undefined" ? window.location.origin : "https://www.credeal.net";
    const magazineUrl = `${origin}/magazine/${brokerSlug}/${today}`;
    const ogImageUrl = `${origin}/api/og/magazine?brokerId=${brokerSlug}&date=${today}`;
    
    if (kakaoReady && window.Kakao?.Share) {
      try {
        window.Kakao.Share.sendDefault({
          objectType: "feed",
          content: {
            title: magazineTitle || `${today} CRE 데일리 매거진`,
            description: briefing.slice(0, 80) + "...",
            imageUrl: ogImageUrl,
            link: { mobileWebUrl: magazineUrl, webUrl: magazineUrl },
          },
          buttons: [
            { title: "매거진 보기", link: { mobileWebUrl: magazineUrl, webUrl: magazineUrl } },
          ],
        });
        return;
      } catch (e) {
        console.error("Kakao share error", e);
      }
    }
    
    // fallback
    navigator.clipboard.writeText(magazineUrl);
    alert("링크가 복사되었습니다. 카카오톡에 붙여넣기 하세요.");
  };

  const handleCopyLink = () => {
    if (!brokerSlug) return;
    const origin = typeof window !== "undefined" ? window.location.origin : "https://www.credeal.net";
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

  // ── 로딩 ──
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0B1120]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (!magazineData) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-[#0B1120] text-slate-300">
        <p>오늘의 매거진 데이터를 불러오지 못했습니다.</p>
        <Link href="/broker" className="mt-4 text-indigo-400 hover:underline">
          브로커 홈으로 돌아가기
        </Link>
      </div>
    );
  }

  // ─── 탭 콘텐츠 렌더링 ───────────────────────────────────────────────
  const renderTabContent = () => {
    switch (activeTab) {
      // ━━━ 편집 탭 ━━━
      case "edit":
        return (
          <div className="space-y-5">
            {/* 안내 */}
            <div className="flex items-start gap-2 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
              <Info className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-indigo-200/80 leading-relaxed">
                AI가 작성한 초안을 고객의 성향에 맞게 직접 다듬을 수 있습니다. 변경사항은 실시간으로
                우측 미리보기에 반영됩니다.
              </p>
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

            {/* 브로커 코멘트 */}
            <div className="space-y-3 p-4 bg-slate-800/30 border border-slate-700/50 rounded-xl">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-xs font-bold text-slate-200">💬 브로커 코멘트</span>
              </div>

              <textarea
                value={brokerComment}
                onChange={(e) => setBrokerComment(e.target.value)}
                className="w-full h-20 bg-[#0f1523] border border-slate-700 rounded-lg px-3 py-2.5 text-[12px] text-slate-300 leading-relaxed focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all resize-none placeholder:text-slate-600"
                placeholder="간단한 코멘트를 입력하세요"
              />

              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={handleAiExpand}
                disabled={aiLoading || !brokerComment.trim()}
                className="flex items-center gap-1.5 text-[11px] font-bold px-3.5 py-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-500 hover:to-purple-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {aiLoading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Sparkles className="w-3 h-3" />
                )}
                ✨ AI 확장
              </motion.button>

              {/* AI 확장 결과 */}
              <AnimatePresence>
                {aiExpandedComment && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="p-3 bg-indigo-500/8 border border-indigo-500/20 rounded-lg space-y-2">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Sparkles className="w-3 h-3 text-indigo-400" />
                        <span className="text-[10px] font-bold text-indigo-300">
                          AI 확장 결과
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-300 leading-relaxed whitespace-pre-wrap">
                        {aiExpandedComment}
                      </p>
                      <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={insertCommentToBriefing}
                        className="flex items-center gap-1.5 text-[10px] font-bold px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/30 transition-all"
                      >
                        <Plus className="w-3 h-3" />
                        브리핑에 삽입
                      </motion.button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        );

      // ━━━ 뉴스 탭 ━━━
      case "news":
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-slate-300">
                뉴스 선택 ({selectedNewsIds.size}/{allNews.length})
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
                        <p className="text-[10px] text-slate-500 line-clamp-1 mb-1.5">
                          {news.summary}
                        </p>
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

      // ━━━ 딜카드 탭 ━━━
      case "deals":
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-slate-300">
                딜카드 선택 ({selectedDealIds.size}/{allDeals.length})
              </p>
              <span className="text-[10px] text-slate-500">매거진에 포함할 매물</span>
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
        );

      // ━━━ 설정 탭 ━━━
      case "settings":
        return (
          <div className="space-y-5">
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
                <span className="text-xs font-bold text-slate-200">브로커 정보</span>
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
                  <span className="text-[11px] text-slate-500">선택된 딜카드</span>
                  <span className="text-[11px] text-rose-300 font-bold">
                    {selectedDealIds.size}건
                  </span>
                </div>
              </div>
            </div>

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
              <p className="text-[10px] text-slate-500">{today} 발행본</p>
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
            <span className="text-[10px] text-slate-600">iPhone 14 Pro (375×812)</span>
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
                <h3 className="text-lg font-bold text-white mb-1">매거진 발행 완료!</h3>
                <p className="text-[12px] text-slate-400">고객들에게 오늘의 매거진을 공유해보세요.</p>
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
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-[#0B1120]">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        </div>
      }
    >
      <MagazineEditorInner />
    </Suspense>
  );
}
