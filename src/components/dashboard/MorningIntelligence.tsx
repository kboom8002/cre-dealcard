"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Sparkles,
  Building2,
  Hammer,
  TrendingUp,
  MapPin,
  Flame,
  DollarSign,
  Zap,
  BookOpen,
  ArrowRight,
  Copy,
  Check,
  RefreshCw,
  Share2,
  Users,
  PhoneCall,
  MessageSquare,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// ── 타입 정의 ──────────────────────────────────────────────────────────────────
interface Transaction {
  title: string;
  desc: string;
  date: string;
  tag: string;
  isMyArea?: boolean;
}

interface Auction {
  title: string;
  desc: string;
  date: string;
  tag: string;
  discountPct?: number;
}

interface RentalMarket {
  type: string;
  deposit: string;
  rent: string;
  vacancy: string;
  source: string;
}

interface MyDealVsMarket {
  dealId: string;
  areaSignal: string;
  assetType: string;
  priceBand: string;
  nearbyTxDesc: string | null;
  action: string | null;
}

interface IntelligenceData {
  briefing: string;
  counselScript: string;
  actionList: string[];
  yesterdayTransactions: Transaction[];
  myDealsVsMarket: MyDealVsMarket[];
  auctions: Auction[];
  rentalMarket: RentalMarket[];
  sentiment: { score: number; status: string; description: string };
  landPriceTrend: { pnu: string; latestYear: number; latestPrice: number; prevPrice: number; changePct: number };
  commercialDistrict: { name: string; salesIndex: number; footfallIndex: number };
  constructionPermits: { text: string; detail: string }[];
  esgValueUp: { grade: string; opportunity: string; benefit: string };
  globalReports: { institution: string; title: string; summary: string; url: string }[];
}

const REGIONS = [
  { id: "seongsu", label: "성수동" },
  { id: "gbd",     label: "강남 GBD" },
  { id: "ybd",     label: "여의도" },
];

export default function MorningIntelligence() {
  const [region, setRegion] = useState("seongsu");
  const [data, setData] = useState<IntelligenceData | null>(null);
  const [sharingUrl, setSharingUrl] = useState<string>("");
  const [myStats, setMyStats] = useState<{ dealCardCount: number; buyerCount: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedScript, setCopiedScript] = useState<"cold" | "hot" | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const fetchIntelligence = useCallback(async (selectedRegion: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/broker/morning-intelligence?region=${selectedRegion}`);
      if (res.ok) {
        const json = await res.json();
        setData(json.data);
        setSharingUrl(json.sharingUrl || "");
        setMyStats(json.myStats || null);
      }
    } catch (err) {
      console.error("Failed to fetch morning intelligence:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIntelligence(region);
  }, [region, fetchIntelligence]);

  const handleCopyScript = async (text: string, type: "cold" | "hot") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedScript(type);
      setTimeout(() => setCopiedScript(null), 2500);
    } catch { /* ignore */ }
  };

  const handleShareLink = async () => {
    const fullUrl = `${window.location.origin}${sharingUrl}`;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2500);
    } catch { /* ignore */ }
  };

  const triggerCrawl = async () => {
    setRefreshing(true);
    try {
      await fetch("/api/public/market-intelligence?action=crawl");
      await fetchIntelligence(region);
    } catch { /* ignore */ } finally {
      setRefreshing(false);
    }
  };

  const now = new Date();
  const timeStr = now.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  const dateStr = now.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" });

  return (
    <div className="w-full space-y-5">
      {/* ── 헤더 ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-card border border-border p-4 rounded-2xl">
        <div>
          <h2 className="text-base font-bold flex items-center gap-1.5 text-foreground">
            <span className="text-lg">🌅</span> 모닝 인텔리전스 허브
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {dateStr} {timeStr} 기준 · 공공 빅데이터 & AI 분석
            {myStats && myStats.dealCardCount > 0 && (
              <span className="ml-2 text-indigo-400 font-bold">
                · 내 매물 {myStats.dealCardCount}건 · 매수자 {myStats.buyerCount}명 반영
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* 공개 링크 공유 버튼 */}
          {sharingUrl && (
            <button
              onClick={handleShareLink}
              className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-xl border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 transition-all duration-300"
              title="공개 브리핑 페이지 링크 복사"
            >
              {linkCopied ? (
                <><Check className="w-3.5 h-3.5 text-emerald-400" /><span className="text-emerald-400">복사됨!</span></>
              ) : (
                <><Share2 className="w-3.5 h-3.5" /><span>공유 링크</span></>
              )}
            </button>
          )}
          {/* 새로고침 */}
          <button
            onClick={triggerCrawl}
            disabled={refreshing || loading}
            className="p-2.5 rounded-xl border border-border bg-muted/30 hover:bg-muted text-muted-foreground hover:text-foreground transition-all duration-300 disabled:opacity-50 shrink-0"
            title="시장 데이터 갱신"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          </button>
          {/* 권역 선택 */}
          <div className="flex bg-muted/60 p-1 rounded-xl border border-border/40">
            {REGIONS.map((p) => (
              <button
                key={p.id}
                onClick={() => setRegion(p.id)}
                className={`text-xs px-3.5 py-1.5 rounded-lg font-bold transition-all duration-300 cursor-pointer ${
                  region === p.id
                    ? "bg-primary text-primary-foreground shadow"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4 animate-pulse">
          <div className="h-52 bg-muted rounded-2xl border border-border/40" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-32 bg-muted rounded-2xl border border-border/40" />
            ))}
          </div>
        </div>
      ) : data ? (
        <div className="space-y-5">

          {/* ── CARD 1: AI 브리핑 + 오늘의 액션 리스트 ──────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative w-full rounded-2xl border border-primary/20 bg-gradient-to-br from-indigo-500/10 via-background to-background p-5 shadow-lg overflow-hidden"
          >
            <div className="absolute -right-20 -top-20 w-44 h-44 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />

            <div className="flex items-center justify-between mb-3.5">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-1.5">
                <Sparkles className="w-3 h-3" /> AI 마켓 에디터 브리핑
              </span>
              <span className="text-[10px] text-muted-foreground">08:00 AM 업데이트</span>
            </div>

            <div className="text-xs text-foreground leading-relaxed whitespace-pre-line bg-muted/20 border border-border/30 p-3.5 rounded-xl font-medium">
              {data.briefing}
            </div>

            {/* 오늘의 액션 리스트 */}
            {data.actionList && data.actionList.length > 0 && (
              <div className="mt-4 pt-4 border-t border-border/60">
                <span className="text-xs font-bold text-emerald-400 flex items-center gap-1 mb-2">
                  <CheckCircle2 className="w-3.5 h-3.5" /> 오늘의 액션 리스트
                </span>
                <div className="space-y-1.5">
                  {data.actionList.map((action, i) => (
                    <div key={i} className="flex items-start gap-2 text-[11px] text-foreground bg-emerald-500/5 border border-emerald-500/10 rounded-lg px-3 py-2">
                      <span className="text-emerald-400 font-bold shrink-0">{i + 1}.</span>
                      <span>{action}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 상담 화법 — 콜드 전화 */}
            <div className="mt-4 pt-4 border-t border-border/60">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-indigo-400 flex items-center gap-1">
                  <PhoneCall className="w-3.5 h-3.5" /> 콜드 팔로업 전화 멘트
                </span>
                <button
                  onClick={() => handleCopyScript(data.counselScript, "cold")}
                  className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground hover:text-indigo-400 border border-border/60 bg-muted/40 px-2 py-1 rounded-lg transition-all duration-300"
                >
                  {copiedScript === "cold" ? (
                    <><Check className="w-3 h-3 text-emerald-400" /><span className="text-emerald-400">복사됨</span></>
                  ) : (
                    <><Copy className="w-3 h-3" /><span>복사</span></>
                  )}
                </button>
              </div>
              <p className="text-xs italic font-medium bg-indigo-500/5 text-indigo-200 border border-indigo-500/10 px-4 py-3 rounded-xl leading-relaxed">
                &ldquo;{data.counselScript}&rdquo;
              </p>
            </div>
          </motion.div>

          {/* ── CARD 2: 내 매물 vs 시장 비교 (개인화 핵심) ──────────────────── */}
          {data.myDealsVsMarket && data.myDealsVsMarket.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="bg-card border border-rose-500/20 bg-gradient-to-br from-rose-500/5 to-background p-4.5 rounded-2xl space-y-3"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-rose-400" />
                  <span>내 매물 vs 최근 실거래 비교</span>
                </h3>
                <span className="text-[9px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20 px-1.5 py-0.5 rounded">
                  🎯 개인화
                </span>
              </div>
              <div className="space-y-2">
                {data.myDealsVsMarket.map((deal, idx) => (
                  <div key={idx} className="bg-muted/30 border border-border/30 rounded-xl p-3 text-[11px]">
                    <div className="flex justify-between items-center font-bold text-foreground mb-1">
                      <span>{deal.areaSignal} {deal.assetType}</span>
                      <span className="text-primary">{deal.priceBand}</span>
                    </div>
                    {deal.nearbyTxDesc ? (
                      <div className="text-[10px] space-y-0.5">
                        <p className="text-muted-foreground">▲ 근처 실거래: {deal.nearbyTxDesc}</p>
                        {deal.action && (
                          <p className="text-amber-400 font-bold flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> {deal.action}
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-[10px] text-muted-foreground">이 권역 최근 실거래 없음</p>
                    )}
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* ── 2×N 그리드 ──────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* 실거래 체결 */}
            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
              className="bg-card border border-border p-4 rounded-2xl space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-bold flex items-center gap-1.5">
                  <span className="text-base">🏠</span> 오늘의 실거래 체결
                </h3>
                <span className="text-[9px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded">실시간</span>
              </div>
              <div className="space-y-2">
                {data.yesterdayTransactions.map((tx, idx) => (
                  <div key={idx} className={`rounded-xl p-3 text-[11px] border ${tx.isMyArea ? "bg-rose-500/5 border-rose-500/20" : "bg-muted/30 border-border/30"}`}>
                    <div className="flex justify-between font-bold text-foreground mb-1">
                      <span className="line-clamp-1">
                        {tx.isMyArea && <span className="text-rose-400 mr-1">🔥</span>}
                        {tx.title}
                      </span>
                      <span className="text-[9px] text-muted-foreground shrink-0">{tx.date}</span>
                    </div>
                    <p className="text-muted-foreground text-[10px]">{tx.desc}</p>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* 경매/공매 */}
            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
              className="bg-card border border-border p-4 rounded-2xl space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-bold flex items-center gap-1.5">
                  <Hammer className="w-3.5 h-3.5 text-amber-400" /> 경매 & 공매 신건
                </h3>
                <span className="text-[9px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded">NPL 소싱</span>
              </div>
              <div className="space-y-2">
                {data.auctions.map((a, idx) => (
                  <div key={idx} className="bg-muted/30 border border-border/30 rounded-xl p-3 text-[11px]">
                    <div className="flex justify-between font-bold text-foreground mb-1">
                      <span className="line-clamp-1">{a.title}</span>
                      {a.discountPct !== undefined && a.discountPct > 0 && (
                        <span className="text-[9px] text-rose-400 font-bold shrink-0 bg-rose-500/10 px-1.5 rounded">-{a.discountPct}%</span>
                      )}
                    </div>
                    <p className="text-muted-foreground text-[10px] mb-1">{a.desc}</p>
                    <p className="text-[9px] text-amber-400">매각 기일: {a.date} · {a.tag}</p>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* 공실률/임대료 */}
            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
              className="bg-card border border-border p-4 rounded-2xl space-y-3">
              <h3 className="text-xs font-bold flex items-center gap-1.5">
                <span className="text-base">📊</span> 권역별 임대 & 공실 현황
              </h3>
              <div className="bg-muted/20 border border-border/30 rounded-xl overflow-hidden text-[10px]">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-muted/60 border-b border-border/40 text-muted-foreground font-bold">
                      <th className="px-3 py-2">용도</th>
                      <th className="px-3 py-2 text-right">보증금/㎡</th>
                      <th className="px-3 py-2 text-right">월세/㎡</th>
                      <th className="px-3 py-2 text-right">공실률</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rentalMarket.map((r, idx) => (
                      <tr key={idx} className="border-b border-border/20 text-foreground font-medium">
                        <td className="px-3 py-2.5 font-bold">{r.type}</td>
                        <td className="px-3 py-2.5 text-right">{r.deposit}</td>
                        <td className="px-3 py-2.5 text-right text-indigo-400 font-bold">{r.rent}</td>
                        <td className="px-3 py-2.5 text-right text-rose-400 font-bold">{r.vacancy}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>

            {/* 투자자 심리 */}
            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
              className="bg-card border border-border p-4 rounded-2xl space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-bold flex items-center gap-1.5">
                  <span className="text-base">🌡️</span> 투자자 심리 지수
                </h3>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                  data.sentiment.score >= 70 ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                    : data.sentiment.score <= 40 ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                    : "bg-slate-500/10 text-slate-400 border-slate-500/20"
                }`}>
                  {data.sentiment.status}
                </span>
              </div>
              <div className="space-y-2 bg-muted/20 border border-border/30 rounded-xl p-3.5">
                <div className="flex justify-between items-center text-xs font-bold text-foreground">
                  <span>Fear & Greed Index</span>
                  <span className="text-sm text-primary">{data.sentiment.score} / 100</span>
                </div>
                <div className="w-full bg-muted h-2 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-blue-500 via-emerald-500 to-rose-500 rounded-full transition-all duration-1000"
                    style={{ width: `${data.sentiment.score}%` }} />
                </div>
                <p className="text-[10px] text-muted-foreground leading-relaxed">{data.sentiment.description}</p>
              </div>
            </motion.div>

            {/* 공시지가 */}
            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
              className="bg-card border border-border p-4 rounded-2xl space-y-3">
              <h3 className="text-xs font-bold flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" /> 대표 지번 공시지가 변동
              </h3>
              <div className="bg-muted/20 border border-border/30 rounded-xl p-3.5 text-[11px] space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground font-bold">권역 대표 필지</span>
                  <span className="font-mono text-foreground text-[10px]">{data.landPriceTrend.pnu}</span>
                </div>
                <div className="flex justify-between items-center border-t border-border/20 pt-2">
                  <div>
                    <span className="block text-[9px] text-muted-foreground">{data.landPriceTrend.latestYear}년 공시지가</span>
                    <span className="text-sm font-extrabold text-foreground">
                      {(data.landPriceTrend.latestPrice / 10000).toLocaleString("ko-KR")}만 원/㎡
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="block text-[9px] text-muted-foreground">전년 대비</span>
                    <span className={`text-sm font-extrabold flex items-center justify-end gap-0.5 ${data.landPriceTrend.changePct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {data.landPriceTrend.changePct >= 0 ? "+" : ""}{data.landPriceTrend.changePct}%
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* 상권 분석 */}
            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
              className="bg-card border border-border p-4 rounded-2xl space-y-3">
              <h3 className="text-xs font-bold flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-rose-400" /> 상권 분석 (F&B 매출/유동인구)
              </h3>
              <div className="bg-muted/20 border border-border/30 rounded-xl p-3.5 space-y-3 text-[11px]">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground font-bold">대상 상권</span>
                  <span className="font-bold text-foreground">{data.commercialDistrict.name}</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-center">
                  <div className="bg-card border border-border/20 p-2.5 rounded-xl space-y-1">
                    <span className="block text-[9px] text-muted-foreground">외식업 매출지수</span>
                    <span className="text-base font-extrabold text-indigo-400">{data.commercialDistrict.salesIndex} / 10</span>
                  </div>
                  <div className="bg-card border border-border/20 p-2.5 rounded-xl space-y-1">
                    <span className="block text-[9px] text-muted-foreground">유동인구 지수</span>
                    <span className="text-base font-extrabold text-emerald-400">{data.commercialDistrict.footfallIndex} / 10</span>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* 신축/리모델링 */}
            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
              className="bg-card border border-border p-4 rounded-2xl space-y-3">
              <h3 className="text-xs font-bold flex items-center gap-1.5">
                <span className="text-base">🏗️</span> 신축 및 리모델링 인허가 동향
              </h3>
              <div className="space-y-2 text-[10px]">
                {data.constructionPermits.map((item, idx) => (
                  <div key={idx} className="bg-muted/30 border border-border/30 rounded-xl p-2.5">
                    <p className="font-bold text-foreground flex items-center gap-1">
                      <ArrowRight className="w-3 h-3 text-primary shrink-0" /> {item.text}
                    </p>
                    <p className="text-muted-foreground mt-0.5 leading-relaxed pl-4">{item.detail}</p>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* ESG/에너지 */}
            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}
              className="bg-card border border-border p-4 rounded-2xl space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-bold flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-400" /> 에너지 등급 & ESG 밸류업
                </h3>
                <span className="text-[9px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded">
                  {data.esgValueUp.grade}
                </span>
              </div>
              <div className="bg-muted/20 border border-border/30 rounded-xl p-3.5 text-[11px] space-y-2">
                <div className="flex items-start gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="block font-bold text-foreground">밸류업 기회</span>
                    <span className="text-[10px] text-muted-foreground">{data.esgValueUp.opportunity}</span>
                  </div>
                </div>
                <div className="border-t border-border/20 pt-2 text-[10px] text-muted-foreground">
                  <strong>ESG 혜택:</strong> {data.esgValueUp.benefit}
                </div>
              </div>
            </motion.div>

            {/* 글로벌 리포트 */}
            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
              className="bg-card border border-border p-4 rounded-2xl space-y-3 md:col-span-2">
              <h3 className="text-xs font-bold flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-indigo-400" /> 글로벌 리서치 리포트 요약
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
                {data.globalReports.map((r, idx) => (
                  <a key={idx} href={r.url} target="_blank" rel="noreferrer"
                    className="flex flex-col justify-between bg-muted/30 border border-border/30 hover:border-primary/40 rounded-xl p-3.5 hover:bg-muted/50 transition-all duration-300 group">
                    <div>
                      <div className="flex justify-between items-center text-[10px] text-indigo-400 font-bold mb-1.5">
                        <span>{r.institution}</span>
                        <BookOpen className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                      <h4 className="font-bold text-foreground group-hover:text-primary text-[11px] mb-1">{r.title}</h4>
                      <p className="text-[10px] text-muted-foreground leading-relaxed">{r.summary}</p>
                    </div>
                  </a>
                ))}
              </div>
            </motion.div>

          </div>
        </div>
      ) : (
        <div className="text-center py-10 bg-card border border-border rounded-2xl text-muted-foreground text-xs">
          데이터가 없습니다. 새로고침을 시도해보세요.
        </div>
      )}
    </div>
  );
}
