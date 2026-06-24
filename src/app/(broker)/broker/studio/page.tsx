"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// ── Types ────────────────────────────────────────────
interface DealItem {
  id: string;
  title: string;
  area: string;
  assetType: string;
  priceBand: string;
}

interface LeadItem {
  name: string;
  score: number;
  status: string;
  lastActive: string;
}

interface StudioStats {
  sentCount: number;
  openCount: number;
  gateRequests: number;
  coBrokerDeals: number;
}

// ── Section IDs for accordion ────────────────────────
type SectionId = "newsletter" | "ai-comment" | "whitelabel" | "co-broker" | "stats" | "leads" | "vendor" | "owner-readiness";

// ── Helper: get auth token ───────────────────────────
async function getToken(): Promise<string> {
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? "";
  } catch {
    return "";
  }
}

// ── Component ────────────────────────────────────────
export default function BrokerStudioPage() {
  const router = useRouter();
  // Accordion state — multiple sections can be open on desktop, one at a time on mobile
  const [openSections, setOpenSections] = useState<Set<SectionId>>(new Set(["newsletter", "ai-comment"]));
  const [isMobile, setIsMobile] = useState(false);

  // Data state
  const [deals, setDeals] = useState<DealItem[]>([]);
  const [stats, setStats] = useState<StudioStats>({ sentCount: 0, openCount: 0, gateRequests: 0, coBrokerDeals: 0 });
  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Newsletter state
  const [selectedDeals, setSelectedDeals] = useState<string[]>([]);
  const [selectedNews, setSelectedNews] = useState<string[]>([]);
  const [newsTopic, setNewsTopic] = useState("전체");

  // AI Comment state (F6 — actually works)
  const [customComment, setCustomComment] = useState("");
  const [aiExpandedComment, setAiExpandedComment] = useState("");
  const [isExpanding, setIsExpanding] = useState(false);

  // ── White-label share (F4) ───────────────────────
  const [brokerSubdomain, setBrokerSubdomain] = useState("");
  const [magazineTitle, setMagazineTitle] = useState("");
  const [themeColor, setThemeColor] = useState("#6366f1");
  const [generatedLink, setGeneratedLink] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);

  // Co-brokerage state
  const [commissionSplit, setCommissionSplit] = useState("50:50 공동중개");
  const [coBrokerTarget, setCoBrokerTarget] = useState("전체 브로커 공개 제안");
  const [coBrokerMessage, setCoBrokerMessage] = useState("");

  // Bottom sheet for mobile navigation
  const [showBottomNav, setShowBottomNav] = useState(false);

  // Supabase & Readiness state variables
  const supabase = createClient();
  const [readinessBuildings, setReadinessBuildings] = useState<any[]>([]);
  const [selectedReadinessBuildingId, setSelectedReadinessBuildingId] = useState<string>("");
  const [readinessCheck, setReadinessCheck] = useState<any | null>(null);
  const [readinessComment, setReadinessComment] = useState("");
  const [readinessKakaoReady, setReadinessKakaoReady] = useState(false);
  const [readinessCopied, setReadinessCopied] = useState(false);
  const [readinessLoading, setReadinessLoading] = useState(false);

  // Fetch buildings for Owner Readiness section
  useEffect(() => {
    async function loadReadinessBuildings() {
      const { data } = await supabase
        .from("building_ssot_lite")
        .select("id, area_signal, asset_type, price_band")
        .order("created_at", { ascending: false });
      if (data && data.length > 0) {
        setReadinessBuildings(data);
        setSelectedReadinessBuildingId(data[0].id);
      }
    }
    loadReadinessBuildings();
  }, []);

  // Fetch latest check when building changes
  useEffect(() => {
    if (!selectedReadinessBuildingId) return;
    async function loadLatestCheck() {
      setReadinessLoading(true);
      try {
        const { data, error } = await supabase
          .from("owner_readiness_checks")
          .select("*")
          .eq("building_id", selectedReadinessBuildingId)
          .order("created_at", { ascending: false })
          .limit(1);

        if (data && data.length > 0 && !error) {
          setReadinessCheck(data[0]);
        } else {
          setReadinessCheck(null);
        }
      } catch (err) {
        console.error("Failed to load readiness check:", err);
      } finally {
        setReadinessLoading(false);
      }
    }
    loadLatestCheck();
  }, [selectedReadinessBuildingId]);

  // Load Kakao SDK
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.Kakao) {
      if (!window.Kakao.isInitialized()) {
        const appKey = process.env.NEXT_PUBLIC_KAKAO_APP_KEY;
        if (appKey) window.Kakao.init(appKey);
      }
      setReadinessKakaoReady(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js";
    script.async = true;
    script.onload = () => {
      if (window.Kakao && !window.Kakao.isInitialized()) {
        const appKey = process.env.NEXT_PUBLIC_KAKAO_APP_KEY;
        if (appKey) window.Kakao.init(appKey);
      }
      setReadinessKakaoReady(true);
    };
    document.head.appendChild(script);
  }, []);

  // ── Responsive detection ─────────────────────────
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // ── Fetch real data ──────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      const token = await getToken();
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      // Fetch broker's deals via rank endpoint
      const dealsRes = await fetch("/api/broker/buildings/rank", { headers });
      if (dealsRes.ok) {
        const dealsJson = await dealsRes.json();
        const items = ((dealsJson.buildings || []) as any[]).slice(0, 6).map((b: any) => ({
          id: b.id,
          title: `${b.areaSignal || "서울"} ${b.assetType || "빌딩"} ${b.priceBand || ""}`.trim(),
          area: b.areaSignal || "서울",
          assetType: b.assetType || "빌딩",
          priceBand: b.priceBand || "비공개",
        }));
        setDeals(items);
        // Derive stats from buildings data
        const all = dealsJson.buildings || [];
        const active = all.filter((b: any) => b.currentStage !== "closed");
        const totalMatches = all.reduce((s: number, b: any) => s + (b.matchedBuyerCount ?? 0), 0);
        setStats({
          sentCount: all.length,
          openCount: active.length,
          gateRequests: totalMatches,
          coBrokerDeals: 0,
        });
        // Build lead scores from buildings with matches
        const leadData: LeadItem[] = all
          .filter((b: any) => b.matchedBuyerCount > 0)
          .slice(0, 3)
          .map((b: any, i: number) => ({
            name: `매수 후보 #${i + 1} (${b.areaSignal ?? "서울"})`,
            score: Math.min(99, Math.round((b.vacancyAvgFitScore ?? 0.5) * 100)),
            status: `${b.matchedBuyerCount}명 매칭 · ${b.assetType}`,
            lastActive: "최근",
          }));
        setLeads(leadData);
      } else {
        // Fallback to profile stats
        const statsRes = await fetch("/api/broker/profile/stats", { headers });
        if (statsRes.ok) {
          const statsJson = await statsRes.json();
          const d = statsJson.data || {};
          setStats({
            sentCount: d.totalBuildings ?? 0,
            openCount: d.activeBuildings ?? 0,
            gateRequests: d.matchCount ?? 0,
            coBrokerDeals: d.casepacks ?? 0,
          });
          setBrokerSubdomain(d.broker?.slug || "");
          setMagazineTitle(d.broker?.magazine_title || "");
          if (d.broker?.magazine_theme_color) setThemeColor(d.broker.magazine_theme_color);
        }
      }
    } catch (err) {
      console.error("Studio data fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── AI Comment (F6 — REAL) ───────────────────────
  const handleAiExpand = async () => {
    if (!customComment.trim()) return;
    setIsExpanding(true);
    try {
      const res = await fetch("/api/broker/studio/ai-comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: customComment }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "AI 생성 실패");
      setAiExpandedComment(json.data);
    } catch (err: any) {
      setAiExpandedComment("");
      alert(err.message || "AI 생성 중 오류가 발생했습니다.");
    } finally {
      setIsExpanding(false);
    }
  };

  // ── White-label link generation (F4 — integrated) ──────
  const generateShareLink = async () => {
    const subdomain = brokerSubdomain.trim() || "my-broker";
    
    try {
      // Save the slug, title, theme to the backend
      const res = await fetch("/api/broker/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          slug: subdomain, 
          magazine_title: magazineTitle, 
          magazine_theme_color: themeColor 
        }),
      });
      if (!res.ok) throw new Error("슬러그 저장 실패");
      
      const today = new Date().toISOString().split("T")[0];
      const origin = typeof window !== "undefined" ? window.location.origin : "https://www.credeal.net";
      setGeneratedLink(`${origin}/magazine/${subdomain}/${today}`);
      setLinkCopied(false);
      alert("매거진 고유 주소(슬러그)가 저장되었습니다.");
    } catch (err: any) {
      alert(err.message || "오류가 발생했습니다.");
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(generatedLink);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // Fallback for mobile
      const textarea = document.createElement("textarea");
      textarea.value = generatedLink;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }
  };

  const handleWhitelabelKakaoShare = () => {
    const today = new Date().toISOString().split("T")[0];
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://credeal.net";
    const title = magazineTitle || `📰 [맞춤 매거진] 브로커 추천 자산 소식`;
    const desc = `${brokerSubdomain} 중개사의 화이트라벨 매거진입니다. 엄선된 최신 CRE 자산 및 거래 트렌드 소식을 확인해 보세요.`;
    const ogImageUrl = `${siteUrl}/api/og/magazine?brokerId=${brokerSubdomain || "js-realty"}&date=${today}`;

    if (readinessKakaoReady && window.Kakao?.Share) {
      try {
        window.Kakao.Share.sendDefault({
          objectType: "feed",
          content: {
            title: title,
            description: desc,
            imageUrl: ogImageUrl,
            link: {
              mobileWebUrl: generatedLink,
              webUrl: generatedLink,
            },
          },
          buttons: [
            {
              title: "매거진 보기",
              link: {
                mobileWebUrl: generatedLink,
                webUrl: generatedLink,
              },
            },
          ],
        });
        return;
      } catch (e) {
        console.error(e);
      }
    }

    navigator.clipboard.writeText(generatedLink);
    alert("링크가 복사되었습니다. 카카오톡에 붙여넣기 하세요.");
  };

  const selectedReadinessBuilding = readinessBuildings.find((b) => b.id === selectedReadinessBuildingId);
  const readinessBuildingLabel = selectedReadinessBuilding
    ? `${selectedReadinessBuilding.area_signal || "권역 미상"} ${selectedReadinessBuilding.asset_type || "건물"} (${selectedReadinessBuilding.price_band || "가격 미상"})`
    : "선택된 건물";

  const handleReadinessKakaoShare = () => {
    if (!readinessCheck) return;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://credeal.net";
    const shareUrl = `${siteUrl}/owner-readiness?buildingId=${selectedReadinessBuildingId}&resultId=${readinessCheck.id}`;
    const title = `🏢 [매각준비도] ${readinessBuildingLabel}`;
    
    let desc = `진단 점수: ${readinessCheck.readiness_score}점\n\n`;
    if (readinessComment.trim()) {
      desc += `💬 브로커 코멘트: ${readinessComment}\n\n`;
    }
    desc += `추천 액션: ${readinessCheck.next_recommended_action}`;

    const ogImageUrl = `${siteUrl}/api/og/vibe-card/js-realty`;

    if (readinessKakaoReady && window.Kakao?.Share) {
      try {
        window.Kakao.Share.sendDefault({
          objectType: "feed",
          content: {
            title: title,
            description: desc.slice(0, 120) + (desc.length > 120 ? "..." : ""),
            imageUrl: ogImageUrl,
            link: {
              mobileWebUrl: shareUrl,
              webUrl: shareUrl,
            },
          },
          buttons: [
            {
              title: "리포트 보기",
              link: {
                mobileWebUrl: shareUrl,
                webUrl: shareUrl,
              },
            },
          ],
        });
        return;
      } catch (e) {
        console.error(e);
      }
    }

    handleReadinessCopyLink();
  };

  const handleReadinessCopyLink = () => {
    if (!readinessCheck) return;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://credeal.net";
    const shareUrl = `${siteUrl}/owner-readiness?buildingId=${selectedReadinessBuildingId}&resultId=${readinessCheck.id}`;
    let fullText = `🏢 [매각준비도 진단] ${readinessBuildingLabel}\n진단 점수: ${readinessCheck.readiness_score}점\n`;
    if (readinessComment.trim()) {
      fullText += `💬 브로커 코멘트: ${readinessComment}\n`;
    }
    fullText += `\n🔗 진단 리포트 링크: ${shareUrl}`;
    
    navigator.clipboard.writeText(fullText).then(() => {
      setReadinessCopied(true);
      setTimeout(() => setReadinessCopied(false), 2000);
    }).catch(() => {
      alert(`진단 리포트 링크:\n${shareUrl}`);
    });
  };

  // ── Toggle section ───────────────────────────────
  const toggleSection = (id: SectionId) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (isMobile) next.clear(); // Accordion: one at a time on mobile
        next.add(id);
      }
      return next;
    });
  };

  // ── Scroll to section on mobile bottom nav ──────
  const scrollToSection = (id: SectionId) => {
    setShowBottomNav(false);
    // Open the section
    setOpenSections(new Set([id]));
    // Scroll with delay for render
    setTimeout(() => {
      document.getElementById(`section-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  // ── Completeness for newsletter ──────────────────
  const newsletterReady = selectedDeals.length > 0 || selectedNews.length > 0;

  const [newsItems, setNewsItems] = useState<Array<{ id: string; source: string; title: string; date: string; url?: string; topic?: string }>>([]);

  useEffect(() => {
    async function fetchNews() {
      try {
        const supabase = createClient();
        let query = supabase
          .from("external_news")
          .select("id, title, source, url, created_at, topic");
          
        if (newsTopic !== "전체") {
          query = query.eq("topic", newsTopic);
        }

        const { data } = await query
          .order("importance_score", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false })
          .limit(15);

        if (data) {
          setNewsItems(data.map(n => {
            const diffDays = Math.floor((Date.now() - new Date(n.created_at).getTime()) / 86400000);
            const dateStr = diffDays === 0 ? "오늘" : diffDays === 1 ? "어제" : `${diffDays}일 전`;
            return {
              id: n.id,
              source: n.source,
              title: n.title,
              url: n.url,
              date: dateStr,
              topic: n.topic,
            };
          }));
        }
      } catch {
        // Fallback or empty state
      }
    }
    fetchNews();
  }, [newsTopic]);

  // ── Section Header component ─────────────────────
  const SectionHeader = ({ id, emoji, title, badge, badgeColor }: { id: SectionId; emoji: string; title: string; badge?: string; badgeColor?: string }) => (
    <button
      type="button"
      onClick={() => toggleSection(id)}
      className="w-full flex items-center justify-between p-4 md:p-5 active:bg-white/[0.02] transition-colors"
      id={`section-${id}`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="text-lg flex-shrink-0">{emoji}</span>
        <h2 className="text-sm font-bold text-white truncate">{title}</h2>
        {badge && (
          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${badgeColor || "bg-indigo-500/15 text-indigo-400"}`}>
            {badge}
          </span>
        )}
      </div>
      <svg
        className={`w-4 h-4 text-slate-500 transition-transform flex-shrink-0 ${openSections.has(id) ? "rotate-180" : ""}`}
        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    </button>
  );

  // ── Render ───────────────────────────────────────
  return (
    <main className="min-h-screen bg-[#0b0f19] text-slate-100 font-sans pb-24 md:pb-12">
      {/* Header — compact for mobile */}
      <header className="sticky top-0 z-40 bg-[#0d1424]/95 backdrop-blur-md border-b border-slate-800 px-4 md:px-6 py-3 md:py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="min-w-0">
            <h1 className="text-sm md:text-base font-extrabold text-white flex items-center gap-1.5 truncate">
              🎨 콘텐츠 스튜디오
            </h1>
            <p className="text-[10px] text-slate-500 truncate hidden md:block">
              뉴스레터 큐레이션 · AI 화법 비서 · 화이트라벨 공유 · 공동중개
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Mobile menu trigger */}
            <button
              type="button"
              onClick={() => setShowBottomNav(true)}
              className="md:hidden p-2 rounded-lg bg-slate-800/50 text-slate-400 active:bg-slate-700/50"
              aria-label="메뉴"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <Link href="/broker" className="text-xs text-slate-400 hover:text-white transition-colors">
              ← 홈
            </Link>
          </div>
        </div>
      </header>

      {/* Stats bar — always visible, horizontally scrollable on mobile */}
      <div className="sticky top-[53px] md:top-[61px] z-30 bg-[#0d1424]/95 backdrop-blur-md border-b border-slate-800/50">
        <div className="max-w-4xl mx-auto px-4 py-2.5 flex gap-2 overflow-x-auto scrollbar-hide">
          {[
            { label: "총 딜카드", value: loading ? "–" : `${stats.sentCount}건`, color: "text-white" },
            { label: "활성 딜", value: loading ? "–" : `${stats.openCount}건`, color: "text-emerald-400" },
            { label: "매칭", value: loading ? "–" : `${stats.gateRequests}건`, color: "text-indigo-400" },
            { label: "딜팩", value: loading ? "–" : `${stats.coBrokerDeals}건`, color: "text-amber-400" },
          ].map((s, i) => (
            <div key={i} className="flex-shrink-0 bg-slate-900/60 rounded-lg px-3 py-1.5 text-center min-w-[72px]">
              <p className={`text-sm font-extrabold tabular-nums ${s.color}`}>{s.value}</p>
              <p className="text-[9px] text-slate-500">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Main content — single column on mobile, 2 columns on desktop */}
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-4 space-y-3 md:space-y-4">

        {/* ═══ F1: 뉴스레터 큐레이션 ═══ */}
        <section className="bg-[#131b2e] border border-slate-800 rounded-2xl overflow-hidden">
          <SectionHeader id="newsletter" emoji="📰" title="뉴스레터 큐레이션" badge={`${selectedDeals.length + selectedNews.length}개 선택`} />
          {openSections.has("newsletter") && (
            <div className="px-4 md:px-5 pb-4 md:pb-5 space-y-4">
              {/* Deal selection */}
              <div className="space-y-2">
                <label className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                  <span className="text-indigo-400">①</span> 포함할 딜카드 선택
                </label>
                {deals.length === 0 && !loading && (
                  <p className="text-[11px] text-slate-500 italic py-2">등록된 딜카드가 없습니다.</p>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {deals.map((deal) => (
                    <button
                      key={deal.id}
                      type="button"
                      onClick={() => setSelectedDeals((prev) =>
                        prev.includes(deal.id) ? prev.filter((x) => x !== deal.id) : [...prev, deal.id]
                      )}
                      className={`w-full text-left p-3 rounded-xl border text-xs transition-all active:scale-[0.98] ${
                        selectedDeals.includes(deal.id)
                          ? "bg-indigo-950/30 border-indigo-500/60"
                          : "bg-slate-950/50 border-slate-800 active:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="truncate">🏢 {deal.title}</span>
                        <span className={`text-[9px] ml-2 flex-shrink-0 ${selectedDeals.includes(deal.id) ? "text-indigo-400" : "text-slate-600"}`}>
                          {selectedDeals.includes(deal.id) ? "✓" : "+"}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* News selection */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                    <span className="text-indigo-400">②</span> 포함할 뉴스 큐레이션
                  </label>
                  <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
                    {["전체", "시장동향", "거래", "정책", "경매", "임대"].map(topic => (
                      <button
                        key={topic}
                        onClick={() => setNewsTopic(topic)}
                        className={`px-2 py-0.5 rounded-full text-[9px] font-medium transition-colors whitespace-nowrap ${
                          newsTopic === topic ? "bg-indigo-500/20 text-indigo-400" : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                        }`}
                      >
                        {topic}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1 custom-scrollbar">
                  {newsItems.map((news) => (
                    <button
                      key={news.id}
                      type="button"
                      onClick={() => setSelectedNews((prev) =>
                        prev.includes(news.id) ? prev.filter((x) => x !== news.id) : [...prev, news.id]
                      )}
                      className={`w-full text-left p-2.5 rounded-xl border text-xs flex justify-between items-center transition-all active:scale-[0.98] ${
                        selectedNews.includes(news.id)
                          ? "bg-indigo-950/30 border-indigo-500/60"
                          : "bg-slate-950/50 border-slate-800 active:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center justify-between w-full min-w-0">
                        <div className="flex-1 truncate mr-2 flex items-center gap-1 group">
                          <span>🗞️ <strong className="text-indigo-400">[{news.source}]</strong> {news.title}</span>
                          {news.url && (
                            <a href={news.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-slate-500 hover:text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                              🔗
                            </a>
                          )}
                        </div>
                        <span className={`text-[9px] flex-shrink-0 ${selectedNews.includes(news.id) ? "text-indigo-400" : "text-slate-600"}`}>
                          {selectedNews.includes(news.id) ? "✓ 담김" : "추가"}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Send to magazine editor button */}
              <button
                type="button"
                disabled={!newsletterReady}
                onClick={() => {
                  const query = new URLSearchParams();
                  if (selectedDeals.length > 0) query.set("deals", selectedDeals.join(","));
                  if (selectedNews.length > 0) query.set("news", selectedNews.join(","));
                  if (aiExpandedComment) query.set("comment", aiExpandedComment);
                  router.push(`/broker/magazine-editor?${query.toString()}`);
                }}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold text-xs py-3 rounded-xl transition-all active:scale-[0.98]"
              >
                {newsletterReady
                  ? `📰 매거진 편집으로 이동 (${selectedDeals.length}딜 + ${selectedNews.length}뉴스)`
                  : "딜 또는 뉴스를 선택하세요"}
              </button>
            </div>
          )}
        </section>

        {/* ═══ F6: AI 코멘트 (실제 작동) ═══ */}
        <section className="bg-[#131b2e] border border-slate-800 rounded-2xl overflow-hidden">
          <SectionHeader id="ai-comment" emoji="🤖" title="AI 코멘트 비서" badge="실시간" badgeColor="bg-emerald-500/15 text-emerald-400" />
          {openSections.has("ai-comment") && (
            <div className="px-4 md:px-5 pb-4 md:pb-5 space-y-3">
              <p className="text-[10px] text-slate-400">
                핵심 아이디어를 입력하면 AI가 전문 브로커 화법으로 확장합니다.
              </p>

              {/* Input area — stacked on mobile */}
              <div className="space-y-2">
                <textarea
                  placeholder="예: '성수동 리모델링 매물 강추합니다'"
                  value={customComment}
                  onChange={(e) => setCustomComment(e.target.value)}
                  rows={2}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-colors"
                />
                <button
                  type="button"
                  onClick={handleAiExpand}
                  disabled={isExpanding || !customComment.trim()}
                  className="w-full md:w-auto bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold text-xs px-5 py-2.5 rounded-xl transition-all active:scale-[0.98]"
                >
                  {isExpanding ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      AI 가공 중...
                    </span>
                  ) : "✨ AI 말투 생성"}
                </button>
              </div>

              {/* AI result */}
              {aiExpandedComment && (
                <div className="bg-slate-950 border border-indigo-500/20 rounded-xl p-3.5 text-xs leading-relaxed text-slate-300 relative whitespace-pre-wrap">
                  <div className="absolute top-2 right-2 flex gap-1.5">
                    <span className="text-[8px] bg-indigo-500/20 text-indigo-400 px-1.5 py-0.5 rounded">AI 작성</span>
                    <button
                      type="button"
                      onClick={async () => {
                        await navigator.clipboard.writeText(aiExpandedComment);
                      }}
                      className="text-[8px] bg-slate-700 text-slate-300 hover:bg-slate-600 px-1.5 py-0.5 rounded transition-colors active:scale-95"
                    >
                      복사
                    </button>
                  </div>
                  <div className="pt-4">{aiExpandedComment}</div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* ═══ F4: 화이트라벨 공유 ═══ */}
        <section className="bg-[#131b2e] border border-slate-800 rounded-2xl overflow-hidden">
          <SectionHeader id="whitelabel" emoji="🔗" title="화이트라벨 매거진 주소" badge="연동완료" badgeColor="bg-indigo-500/15 text-indigo-400" />
          {openSections.has("whitelabel") && (
            <div className="px-4 md:px-5 pb-4 md:pb-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-400 block">고유 주소 (Slug)</label>
                  <input
                    type="text"
                    value={brokerSubdomain}
                    onChange={(e) => setBrokerSubdomain(e.target.value)}
                    placeholder="kim-broker"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-400 block">매거진 제목</label>
                  <input
                    type="text"
                    value={magazineTitle}
                    onChange={(e) => setMagazineTitle(e.target.value)}
                    placeholder="김중개의 CRE 데일리"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-[10px] text-slate-400 block">테마 색상</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={themeColor}
                      onChange={(e) => setThemeColor(e.target.value)}
                      className="w-10 h-10 bg-transparent border border-slate-800 rounded-lg cursor-pointer"
                    />
                    <span className="text-[10px] text-slate-500 font-mono">{themeColor}</span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={generateShareLink}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs py-3 rounded-xl transition-all active:scale-[0.98]"
              >
                🔗 내 매거진 링크 생성 및 저장
              </button>

              {generatedLink && (
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2">
                  <p className="text-[10px] text-indigo-400 font-mono break-all select-all">{generatedLink}</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleCopyLink}
                      className={`flex-1 text-[10px] font-bold py-2 rounded-lg transition-all active:scale-[0.98] ${
                        linkCopied
                          ? "bg-emerald-600/20 text-emerald-400 border border-emerald-600/30"
                          : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                      }`}
                    >
                      {linkCopied ? "✓ 복사됨" : "📋 복사"}
                    </button>
                    <button
                      type="button"
                      onClick={handleWhitelabelKakaoShare}
                      className="flex-1 text-[10px] font-bold py-2 rounded-lg bg-[#FEE500] text-[#3C1E1E] active:scale-[0.98]"
                    >
                      💬 카톡 공유
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* ═══ F8: 매각준비도 큐레이션 및 전송 ═══ */}
        <section className="bg-[#131b2e] border border-slate-800 rounded-2xl overflow-hidden">
          <SectionHeader id="owner-readiness" emoji="📋" title="매각준비도 발송" badge={readinessCheck ? "점검완료" : "미점검 자산"} badgeColor={readinessCheck ? "bg-indigo-500/15 text-indigo-400" : "bg-slate-800 text-slate-500"} />
          {openSections.has("owner-readiness") && (
            <div className="px-4 md:px-5 pb-4 md:pb-5 space-y-4">
              <p className="text-[10px] text-slate-400">
                건물 소유주에게 보낼 자산을 선택하고, 맞춤형 의견과 함께 진단 결과를 공유해 보세요.
              </p>

              {/* Building selector */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-slate-400 block">자산 선택</label>
                {readinessBuildings.length > 0 ? (
                  <select
                    value={selectedReadinessBuildingId}
                    onChange={(e) => setSelectedReadinessBuildingId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none"
                  >
                    {readinessBuildings.map((b) => (
                      <option key={b.id} value={b.id}>
                        🏢 {b.area_signal || "권역 미상"} {b.asset_type || "건물"} ({b.price_band || "가격 미상"})
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="text-xs text-slate-500">불러올 수 있는 자산이 없습니다.</div>
                )}
              </div>

              {readinessLoading ? (
                <div className="text-xs text-slate-500 text-center py-4">진단 데이터 불러오는 중...</div>
              ) : readinessCheck ? (
                <div className="space-y-4">
                  {/* Readiness Score Card */}
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-[9px] text-slate-500 uppercase tracking-wider">최근 진단 점수</p>
                      <p className="text-2xl font-black text-white mt-1">
                        {readinessCheck.readiness_score}
                        <span className="text-xs text-slate-500 font-normal"> / 100점</span>
                      </p>
                    </div>
                    <Link
                      href={`/owner-readiness?buildingId=${selectedReadinessBuildingId}&resultId=${readinessCheck.id}`}
                      className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 transition-colors"
                    >
                      상세 분석 리포트 보기 →
                    </Link>
                  </div>

                  {/* Comment Input */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-400 block">소유주 전달용 코멘트 입력</label>
                    <textarea
                      placeholder="예: '임대차 현황 요약표가 준비되어 블라인드 티저 생성이 가능합니다. 추가 자료 보완 시 Full IM 제작도 가능하니 편하신 시간에 말씀해 주세요.'"
                      value={readinessComment}
                      onChange={(e) => setReadinessComment(e.target.value)}
                      rows={3}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                    />
                  </div>

                  {/* Share buttons */}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleReadinessKakaoShare}
                      className="flex-1 text-[10px] font-bold py-2.5 rounded-lg bg-[#FEE500] text-[#3C1E1E] hover:bg-[#FEE500]/90 transition-all active:scale-[0.98]"
                    >
                      💬 카톡으로 전송
                    </button>
                    <button
                      type="button"
                      onClick={handleReadinessCopyLink}
                      className={`flex-1 text-[10px] font-bold py-2.5 rounded-lg transition-all active:scale-[0.98] ${
                        readinessCopied
                          ? "bg-emerald-600/20 text-emerald-400 border border-emerald-600/30"
                          : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                      }`}
                    >
                      {readinessCopied ? "✓ 복사됨" : "📋 링크 복사"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-800 p-6 text-center space-y-3">
                  <p className="text-xs text-slate-500">아직 이 자산의 매각 준비도 진단 이력이 없습니다.</p>
                  <Link
                    href={`/owner-readiness?buildingId=${selectedReadinessBuildingId}`}
                    className="inline-flex items-center justify-center rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 text-xs font-bold transition-all active:scale-[0.98]"
                  >
                    📋 자산 진단 시작하기
                  </Link>
                </div>
              )}
            </div>
          )}
        </section>

        {/* ═══ D1: 공동중개 제안 ═══ */}
        <section className="bg-[#131b2e] border border-slate-800 rounded-2xl overflow-hidden">
          <SectionHeader id="co-broker" emoji="🤝" title="공동중개 제안" badge="데모" badgeColor="bg-amber-500/15 text-amber-400" />
          {openSections.has("co-broker") && (
            <div className="px-4 md:px-5 pb-4 md:pb-5 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-400 block">수수료 분배</label>
                  <select
                    value={commissionSplit}
                    onChange={(e) => setCommissionSplit(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white appearance-none"
                  >
                    <option>50:50 공동중개</option>
                    <option>60:40 (매수우위)</option>
                    <option>40:60 (매도우위)</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-400 block">수신 대상</label>
                  <select
                    value={coBrokerTarget}
                    onChange={(e) => setCoBrokerTarget(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white appearance-none"
                  >
                    <option>전체 브로커 공개 제안</option>
                    <option>같은 권역 파트너 브로커</option>
                    <option>즐겨찾기 브로커만</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] text-slate-400 block">제안 메시지</label>
                <textarea
                  value={coBrokerMessage}
                  onChange={(e) => setCoBrokerMessage(e.target.value)}
                  placeholder="예: '성수동 2가 80억 매수 희망 법인 확보 중입니다. 리모델링 가능한 근생 건물 보유하신 중개사분 매칭 요청드립니다.'"
                  rows={3}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                />
              </div>

              <button
                type="button"
                disabled={!coBrokerMessage.trim()}
                className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold text-xs py-3 rounded-xl transition-all active:scale-[0.98]"
              >
                🤝 공동중개 제안 등록
              </button>
            </div>
          )}
        </section>


        {/* ═══ F3: 리드 스코어링 ═══ */}
        <section className="bg-[#131b2e] border border-slate-800 rounded-2xl overflow-hidden">
          <SectionHeader id="leads" emoji="🔥" title="매수자 관심 점수" badge={leads.length > 0 ? `${leads.length}명` : "매칭 없음"} badgeColor={leads.length > 0 ? "bg-rose-500/15 text-rose-400" : "bg-slate-800 text-slate-500"} />
          {openSections.has("leads") && (
            <div className="px-4 md:px-5 pb-4 md:pb-5 space-y-2">
              {leads.length === 0 ? (
                <p className="text-[11px] text-slate-500 italic py-2">
                  매칭된 매수자가 없습니다. 딜카드를 등록하면 자동 매칭됩니다.
                </p>
              ) : (
                leads.map((lead, idx) => (
                  <div key={idx} className="bg-slate-950/50 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-xs font-semibold text-white block truncate">{lead.name}</span>
                      <span className="text-[9px] text-slate-500">{lead.status}</span>
                    </div>
                    <div className="flex-shrink-0 text-center">
                      <span className={`text-sm font-black tabular-nums block ${
                        lead.score >= 80 ? "text-rose-400" : lead.score >= 60 ? "text-amber-400" : "text-slate-400"
                      }`}>{lead.score}</span>
                      <span className="text-[8px] text-slate-600">점</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </section>

        {/* ═══ D3: 벤더 리뷰 ═══ */}
        <section className="bg-[#131b2e] border border-slate-800 rounded-2xl overflow-hidden">
          <SectionHeader id="vendor" emoji="👷" title="협력 벤더 리뷰" />
          {openSections.has("vendor") && (
            <div className="px-4 md:px-5 pb-4 md:pb-5 space-y-2">
              {[
                { name: "JS 건축설계사무소", spec: "꼬마빌딩 증축 전문", rating: "4.9", review: "기획설계 검토 피드백이 하루 만에 전달되어 미팅 수월했습니다." },
                { name: "바른 법무법인", spec: "CRE 양도세 특화", rating: "4.7", review: "법인 전환 증여 케이스 양도세 계산 피드백이 신속합니다." },
              ].map((vendor, idx) => (
                <div key={idx} className="bg-slate-950/50 border border-slate-800/80 rounded-xl p-3.5 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-white block truncate">{vendor.name}</span>
                      <span className="text-[9px] text-slate-500">{vendor.spec}</span>
                    </div>
                    <span className="text-xs text-amber-400 font-bold flex-shrink-0">⭐️ {vendor.rating}</span>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-relaxed">{vendor.review}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ═══ Mobile Bottom Navigation Sheet ═══ */}
      {showBottomNav && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-50 bg-black/60 md:hidden"
            onClick={() => setShowBottomNav(false)}
          />
          {/* Sheet */}
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#131b2e] border-t border-slate-700 rounded-t-2xl p-5 pb-8 md:hidden animate-slide-up">
            <div className="w-10 h-1 bg-slate-600 rounded-full mx-auto mb-4" />
            <h3 className="text-xs font-bold text-slate-400 mb-3">빠른 이동</h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: "newsletter" as SectionId, emoji: "📰", label: "뉴스레터" },
                { id: "ai-comment" as SectionId, emoji: "🤖", label: "AI 코멘트" },
                { id: "whitelabel" as SectionId, emoji: "🔗", label: "화이트라벨" },
                { id: "owner-readiness" as SectionId, emoji: "📋", label: "매각준비도" },
                { id: "co-broker" as SectionId, emoji: "🤝", label: "공동중개" },
                { id: "leads" as SectionId, emoji: "🔥", label: "리드 점수" },
                { id: "vendor" as SectionId, emoji: "👷", label: "벤더 리뷰" },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => scrollToSection(item.id)}
                  className="flex items-center gap-2 p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white active:bg-slate-800 transition-colors"
                >
                  <span>{item.emoji}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Global mobile animation style */}
      <style>{`
        @keyframes slide-up {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </main>
  );
}
