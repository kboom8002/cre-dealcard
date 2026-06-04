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
  RefreshCw
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface Transaction {
  title: string;
  desc: string;
  date: string;
  tag: string;
}

interface Auction {
  title: string;
  desc: string;
  date: string;
  tag: string;
}

interface RentalMarket {
  type: string;
  deposit: string;
  rent: string;
  vacancy: string;
  source: string;
}

interface IntelligenceData {
  briefing: string;
  counselScript: string;
  yesterdayTransactions: Transaction[];
  auctions: Auction[];
  rentalMarket: RentalMarket[];
  sentiment: {
    score: number;
    status: string;
    description: string;
  };
  landPriceTrend: {
    pnu: string;
    latestYear: number;
    latestPrice: number;
    prevPrice: number;
    changePct: number;
  };
  commercialDistrict: {
    name: string;
    salesIndex: number;
    footfallIndex: number;
  };
  constructionPermits: { text: string; detail: string }[];
  esgValueUp: {
    grade: string;
    opportunity: string;
    benefit: string;
  };
  globalReports: {
    institution: string;
    title: string;
    summary: string;
    url: string;
  }[];
}

export default function MorningIntelligence() {
  const [region, setRegion] = useState("seongsu");
  const [data, setData] = useState<IntelligenceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchIntelligence = useCallback(async (selectedRegion: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/broker/morning-intelligence?region=${selectedRegion}`);
      if (res.ok) {
        const json = await res.json();
        setData(json.data);
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

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy text:", err);
    }
  };

  const triggerCrawl = async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/public/market-intelligence?action=crawl");
      if (res.ok) {
        await fetchIntelligence(region);
      }
    } catch (err) {
      console.error("Failed to trigger crawl:", err);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="w-full space-y-6">
      {/* Region selector & Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-card border border-border p-4 rounded-2xl">
        <div>
          <h2 className="text-base font-bold flex items-center gap-1.5 text-foreground">
            <span className="text-lg">🌅</span> 모닝 인텔리전스 허브
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            매일 아침 8시, 공공 빅데이터와 크롤링 기반 시장 동향 보고서
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Refresh/Crawl trigger */}
          <button
            onClick={triggerCrawl}
            disabled={refreshing || loading}
            className="p-2.5 rounded-xl border border-border bg-muted/30 hover:bg-muted text-muted-foreground hover:text-foreground transition-all duration-300 disabled:opacity-50 shrink-0"
            title="시장 데이터 새로고침 (웹 크롤러 및 API 강제 작동)"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          </button>

          {/* Region pills */}
          <div className="flex bg-muted/60 p-1 rounded-xl border border-border/40 w-full justify-between">
            {[
              { id: "seongsu", label: "성수동" },
              { id: "gbd", label: "강남 GBD" },
              { id: "ybd", label: "여의도" },
            ].map((p) => (
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
        // Premium Skeleton Loader
        <div className="space-y-4 animate-pulse">
          <div className="h-44 bg-muted rounded-2xl border border-border/40" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="h-32 bg-muted rounded-2xl border border-border/40" />
            <div className="h-32 bg-muted rounded-2xl border border-border/40" />
            <div className="h-32 bg-muted rounded-2xl border border-border/40" />
            <div className="h-32 bg-muted rounded-2xl border border-border/40" />
          </div>
        </div>
      ) : data ? (
        <div className="space-y-5">
          {/* CARD 3 & CARD 3 PLUS: AI News Briefing & Counsel Speech Script */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative w-full rounded-2xl border border-primary/20 bg-gradient-to-br from-indigo-500/10 via-background to-background p-5 shadow-lg overflow-hidden"
          >
            {/* Glow backdrop decorative */}
            <div className="absolute -right-20 -top-20 w-44 h-44 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />

            <div className="flex items-center justify-between mb-3.5">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-indigo-400" /> AI 마켓 에디터 브리핑
              </span>
              <span className="text-[10px] text-muted-foreground">08:00 AM 업데이트</span>
            </div>

            <div className="text-xs text-foreground leading-relaxed whitespace-pre-line bg-muted/20 border border-border/30 p-3.5 rounded-xl font-medium">
              {data.briefing}
            </div>

            {/* Counsel Speech Section */}
            <div className="mt-4 pt-4 border-t border-border/60">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-indigo-400 flex items-center gap-1">
                  💬 오늘의 권장 상담 화법 (Client Pitch Script)
                </span>
                <button
                  onClick={() => handleCopy(data.counselScript)}
                  className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground hover:text-indigo-400 border border-border/60 bg-muted/40 hover:bg-indigo-500/10 px-2 py-1 rounded-lg transition-all duration-300"
                >
                  {copied ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-400">복사 완료</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>대사 복사</span>
                    </>
                  )}
                </button>
              </div>
              <p className="text-xs italic font-medium bg-indigo-500/5 text-indigo-200 border border-indigo-500/10 px-4 py-3 rounded-xl leading-relaxed">
                &ldquo;{data.counselScript}&rdquo;
              </p>
            </div>
          </motion.div>

          {/* GRID FOR OTHER 9 FEEDS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Idea 1: 오늘의 실거래 체결 알림 */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="bg-card border border-border p-4.5 rounded-2xl space-y-3"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-bold flex items-center gap-1.5">
                  <span className="text-base">🏠</span> 오늘의 실거래 체결 알림
                </h3>
                <span className="text-[9px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded">
                  실시간
                </span>
              </div>
              <div className="space-y-2">
                {data.yesterdayTransactions.map((tx, idx) => (
                  <div key={idx} className="bg-muted/30 border border-border/30 rounded-xl p-3 text-[11px] leading-relaxed">
                    <div className="flex justify-between font-bold text-foreground mb-1">
                      <span className="line-clamp-1">{tx.title}</span>
                      <span className="text-[9px] text-muted-foreground shrink-0">{tx.date}</span>
                    </div>
                    <p className="text-muted-foreground text-[10px]">{tx.desc}</p>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Idea 2: 법원 경매 & 캠코 공매 신건 알림 */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-card border border-border p-4.5 rounded-2xl space-y-3"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-bold flex items-center gap-1.5">
                  <span className="text-base">🔨</span> 경매 & 공매 신건 알림
                </h3>
                <span className="text-[9px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded">
                  NPL 소싱
                </span>
              </div>
              <div className="space-y-2">
                {data.auctions.map((a, idx) => (
                  <div key={idx} className="bg-muted/30 border border-border/30 rounded-xl p-3 text-[11px] leading-relaxed">
                    <div className="flex justify-between font-bold text-foreground mb-1">
                      <span className="line-clamp-1">{a.title}</span>
                      <span className="text-[9px] text-amber-400 font-bold shrink-0">{a.tag}</span>
                    </div>
                    <p className="text-muted-foreground text-[10px] mb-1">{a.desc}</p>
                    <p className="text-[9px] text-muted-foreground">매각 기일: {a.date}</p>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Idea 4: 권역별 공실률 & 임대료 트렌드 */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="bg-card border border-border p-4.5 rounded-2xl space-y-3"
            >
              <h3 className="text-xs font-bold flex items-center gap-1.5">
                <span className="text-base">📊</span> 권역별 임대 및 공실 현황
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

            {/* Idea 5: 투자자 심리 지수 (Fear & Greed Index) */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-card border border-border p-4.5 rounded-2xl space-y-3"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-bold flex items-center gap-1.5">
                  <span className="text-base">🌡️</span> 투자자 감성 & 심리 지수
                </h3>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                  data.sentiment.score >= 70
                    ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                    : data.sentiment.score <= 40
                      ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
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
                
                {/* Visual Gauge Bar */}
                <div className="w-full bg-muted h-2 rounded-full overflow-hidden relative">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 via-emerald-500 to-rose-500 rounded-full transition-all duration-1000"
                    style={{ width: `${data.sentiment.score}%` }}
                  />
                </div>

                <p className="text-[10px] text-muted-foreground leading-relaxed mt-1">
                  {data.sentiment.description}
                </p>
              </div>
            </motion.div>

            {/* Idea 6: 공시지가 변동 알림 */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="bg-card border border-border p-4.5 rounded-2xl space-y-3"
            >
              <h3 className="text-xs font-bold flex items-center gap-1.5">
                <span className="text-base">📈</span> 대표 지번 공시지가 변동률
              </h3>
              <div className="bg-muted/20 border border-border/30 rounded-xl p-3.5 text-[11px] space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground font-bold">권역 대표 필지 PNU</span>
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
                    <span className="block text-[9px] text-muted-foreground">직전 연도 대비 변동</span>
                    <span className="text-sm font-extrabold text-emerald-400 flex items-center justify-end gap-0.5">
                      +{data.landPriceTrend.changePct}% <TrendingUp className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Idea 7: 상권 분석 리포트 (F&B 매출/유동인구) */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-card border border-border p-4.5 rounded-2xl space-y-3"
            >
              <h3 className="text-xs font-bold flex items-center gap-1.5">
                <span className="text-base">🗺️</span> 상권 분석 인덱스 (F&B 매출/유동인구)
              </h3>
              <div className="bg-muted/20 border border-border/30 rounded-xl p-3.5 space-y-3 text-[11px]">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground font-bold">대상 상권</span>
                  <span className="font-bold text-foreground flex items-center gap-0.5">
                    <MapPin className="w-3 h-3 text-rose-500" /> {data.commercialDistrict.name}
                  </span>
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

            {/* Idea 8: 건축물대장 신축/리모델링 동향 */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
              className="bg-card border border-border p-4.5 rounded-2xl space-y-3"
            >
              <h3 className="text-xs font-bold flex items-center gap-1.5">
                <span className="text-base">🏗️</span> 신축 및 리모델링 인허가 동향
              </h3>
              <div className="space-y-2 text-[10px]">
                {data.constructionPermits.map((item, idx) => (
                  <div key={idx} className="bg-muted/30 border border-border/30 rounded-xl p-2.5">
                    <p className="font-bold text-foreground text-[10.5px] flex items-center gap-1">
                      <ArrowRight className="w-3 h-3 text-primary shrink-0" /> {item.text}
                    </p>
                    <p className="text-muted-foreground mt-0.5 leading-relaxed pl-4">{item.detail}</p>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Idea 9: 에너지 효율 등급 및 ESG 가치 분석 */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="bg-card border border-border p-4.5 rounded-2xl space-y-3"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-bold flex items-center gap-1.5">
                  <span className="text-base">⚡</span> 에너지 등급 & ESG 가치 투자
                </h3>
                <span className="text-[9px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded">
                  {data.esgValueUp.grade}
                </span>
              </div>
              <div className="bg-muted/20 border border-border/30 rounded-xl p-3.5 text-[11px] space-y-2">
                <div className="flex items-start gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="block font-bold text-foreground">밸류업 분석 기회</span>
                    <span className="text-[10px] text-muted-foreground leading-relaxed">
                      {data.esgValueUp.opportunity}
                    </span>
                  </div>
                </div>
                <div className="border-t border-border/20 pt-2 text-[10px] text-muted-foreground leading-relaxed">
                  <strong>ESG 리모델링 혜택:</strong> {data.esgValueUp.benefit}
                </div>
              </div>
            </motion.div>

            {/* Idea 10: 글로벌 리서치 리포트 요약 */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45 }}
              className="bg-card border border-border p-4.5 rounded-2xl space-y-3 md:col-span-2"
            >
              <h3 className="text-xs font-bold flex items-center gap-1.5">
                <span className="text-base">🌐</span> 글로벌 부동산 컨설팅 리포트 요약
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
                {data.globalReports.map((r, idx) => (
                  <a
                    key={idx}
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex flex-col justify-between bg-muted/30 border border-border/30 hover:border-primary/40 rounded-xl p-3.5 hover:bg-muted/50 transition-all duration-300 group"
                  >
                    <div>
                      <div className="flex justify-between items-center text-[10px] text-indigo-400 font-bold mb-1.5">
                        <span>{r.institution}</span>
                        <BookOpen className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                      <h4 className="font-bold text-foreground group-hover:text-primary transition-colors text-[11px] mb-1">
                        {r.title}
                      </h4>
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
          데이터가 없습니다.
        </div>
      )}
    </div>
  );
}
