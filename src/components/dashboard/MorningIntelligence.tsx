"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Sparkles, Building2, Hammer, TrendingUp, MapPin, Flame,
  Zap, BookOpen, ArrowRight, Copy, Check, RefreshCw, Share2,
  PhoneCall, AlertTriangle, CheckCircle2, ChevronRight,
  BarChart2, Globe, Eye, Clock, Edit3, Activity, Calendar,
  ClipboardPaste, Wand2, Combine, Send, Loader2, FileText, Trash2,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import Link from "next/link";
import { PulseSignalRadar } from "@/components/pulse/PulseSignalRadar";

// ── 타입 정의 ──────────────────────────────────────────────────────────────────
interface Transaction { title: string; desc: string; date: string; tag: string; isMyArea?: boolean; }
interface Auction { title: string; desc: string; date: string; tag: string; discountPct?: number; }
interface RentalMarket { type: string; deposit: string; rent: string; vacancy: string; source: string; }
interface MyDealVsMarket { dealId: string; areaSignal: string; assetType: string; priceBand: string; nearbyTxDesc: string | null; action: string | null; }
interface IntelligenceData {
  briefing: string; counselScript: string; actionList: string[];
  yesterdayTransactions: Transaction[]; myDealsVsMarket: MyDealVsMarket[];
  auctions: Auction[]; rentalMarket: RentalMarket[];
  sentiment: { score: number; status: string; description: string };
  landPriceTrend: { pnu: string; latestYear: number; latestPrice: number; prevPrice: number; changePct: number };
  commercialDistrict: { name: string; salesIndex: number; footfallIndex: number };
  constructionPermits: { text: string; detail: string }[];
  esgValueUp: { grade: string; opportunity: string; benefit: string };
  globalReports: { institution: string; title: string; summary: string; url: string }[];
}

const REGIONS = [
  { id: "seongsu", label: "성수동", emoji: "🎨" },
  { id: "gbd",     label: "강남 GBD", emoji: "🏙️" },
  { id: "ybd",     label: "여의도", emoji: "🏦" },
];

// ── AI 브리핑 텍스트를 리치 포맷으로 파싱 ─────────────────────────────────────
function RichBriefing({ text }: { text: string }) {
  const paragraphs = text.split(/\n{1,2}/).filter(Boolean);
  return (
    <div className="space-y-3">
      {paragraphs.map((para, i) => {
        // 헤딩 감지 (이모지로 시작하거나 **로 감싼 경우)
        const isHeading = /^[🏢📊⚡🔥💡📍🌐📰🏗️💰🎯]/.test(para) ||
                          /^\*\*.*\*\*$/.test(para.trim());
        // 숫자 목록 감지
        const isList = /^[\d]+\./.test(para.trim()) || /^[•·▶→·-]/.test(para.trim());
        // 핵심 수치 감지
        const hasMetric = /[\d,.]+%(|[억만원])/.test(para);

        const formattedText = para
          .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-bold">$1</strong>')
          .replace(/(\d[\d,.]+%)/g, '<span class="text-indigo-300 font-bold font-mono">$1</span>')
          .replace(/(\d[\d,.]+억)/g, '<span class="text-emerald-300 font-bold">$1</span>');

        if (isHeading) {
          return (
            <div key={i} className="flex items-center gap-2 pt-1">
              <div className="h-px flex-1 bg-gradient-to-r from-indigo-500/30 to-transparent" />
              <p className="text-[13px] font-extrabold text-white tracking-tight"
                 dangerouslySetInnerHTML={{ __html: formattedText }} />
              <div className="h-px flex-1 bg-gradient-to-l from-indigo-500/30 to-transparent" />
            </div>
          );
        }
        if (isList) {
          return (
            <div key={i} className="flex items-start gap-2 pl-2">
              <ChevronRight className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
              <p className="text-[12px] text-slate-200 leading-relaxed"
                 dangerouslySetInnerHTML={{ __html: formattedText }} />
            </div>
          );
        }
        return (
          <p key={i}
             className={`text-[12px] leading-relaxed ${hasMetric ? "text-slate-100" : "text-slate-300"}`}
             dangerouslySetInnerHTML={{ __html: formattedText }} />
        );
      })}
    </div>
  );
}

// ── 원형 게이지 ─────────────────────────────────────────────────────────────────
function CircleGauge({ value, max = 10, color, label }: { value: number; max?: number; color: string; label: string }) {
  const pct = (value / max) * 100;
  const r = 26; const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative w-16 h-16">
        <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
          <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="6"
            strokeDasharray={`${dash} ${c}`} strokeLinecap="round"
            style={{ transition: "stroke-dasharray 1.2s ease" }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[13px] font-extrabold text-white">{value}</span>
        </div>
      </div>
      <span className="text-[10px] text-slate-400 font-medium text-center">{label}</span>
    </div>
  );
}

// ── 미니 바 차트 (임대료 비교) ──────────────────────────────────────────────────
function MiniBar({ label, value, max, color, unit }: { label: string; value: number; max: number; color: string; unit: string }) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="text-slate-400 w-16 shrink-0 font-medium">{label}</span>
      <div className="flex-1 bg-white/5 rounded-full h-1.5 overflow-hidden">
        <motion.div initial={{ width: 0 }} animate={{ width: `${(value / max) * 100}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="h-full rounded-full" style={{ background: color }} />
      </div>
      <span className="text-white font-bold w-20 text-right shrink-0">{value.toLocaleString()}{unit}</span>
    </div>
  );
}

// ── 뱃지 ───────────────────────────────────────────────────────────────────────
function Badge({ children, variant = "default" }: { children: React.ReactNode; variant?: "default" | "red" | "amber" | "emerald" | "indigo" | "rose" }) {
  const styles: Record<string, string> = {
    default:  "bg-white/5 text-slate-300 border-white/10",
    red:      "bg-rose-500/15 text-rose-300 border-rose-500/25",
    amber:    "bg-amber-500/15 text-amber-300 border-amber-500/25",
    emerald:  "bg-emerald-500/15 text-emerald-300 border-emerald-500/25",
    indigo:   "bg-indigo-500/15 text-indigo-300 border-indigo-500/25",
    rose:     "bg-rose-500/15 text-rose-300 border-rose-500/25",
  };
  return (
    <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full border ${styles[variant]}`}>
      {children}
    </span>
  );
}

// ── 카드 래퍼 ──────────────────────────────────────────────────────────────────
function Card({ children, className = "", accent }: { children: React.ReactNode; className?: string; accent?: string }) {
  return (
    <div className={`relative rounded-2xl border border-white/8 bg-white/3 backdrop-blur-sm p-4 overflow-hidden ${className}`}
         style={accent ? { boxShadow: `0 0 40px -12px ${accent}30`, borderColor: `${accent}20` } : {}}>
      {accent && (
        <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full blur-3xl pointer-events-none opacity-20"
             style={{ background: accent }} />
      )}
      {children}
    </div>
  );
}

// ── 섹션 헤딩 ──────────────────────────────────────────────────────────────────
function SectionHead({ icon, title, badge }: { icon: React.ReactNode; title: string; badge?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-[12px] font-bold text-white flex items-center gap-1.5">
        {icon} {title}
      </h3>
      {badge}
    </div>
  );
}

// ── 감성 게이지 색상 ─────────────────────────────────────────────────────────────
function getSentimentGradient(score: number) {
  if (score >= 75) return "from-rose-500 via-orange-400 to-amber-300";
  if (score >= 55) return "from-emerald-500 via-teal-400 to-cyan-300";
  if (score >= 35) return "from-slate-500 via-slate-400 to-slate-300";
  return "from-blue-600 via-blue-400 to-cyan-300";
}

// ── 메인 컴포넌트 ──────────────────────────────────────────────────────────────
export default function MorningIntelligence() {
  const [region, setRegion] = useState("seongsu");
  const [data, setData] = useState<IntelligenceData | null>(null);
  const [sharingUrl, setSharingUrl] = useState<string>("");
  const [myStats, setMyStats] = useState<{ dealCardCount: number; buyerCount: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedScript, setCopiedScript] = useState<"cold" | "hot" | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [brokerProfileSlug, setBrokerProfileSlug] = useState("demo");
  const [briefingExpanded, setBriefingExpanded] = useState(false);
  const [pulseData, setPulseData] = useState<any>(null);

  // ── 3탭 모드 상태 ────────────────────────────────────────────────────────
  const [intelMode, setIntelMode] = useState<"hq" | "my" | "custom">("hq");
  // 마이 인텔리전스
  const [myIntelText, setMyIntelText] = useState("");
  const [myIntelProcessing, setMyIntelProcessing] = useState(false);
  const [myIntelResult, setMyIntelResult] = useState<any>(null);
  const [myIntelHistory, setMyIntelHistory] = useState<any[]>([]);
  // 커스텀 결합
  const [combineProcessing, setCombineProcessing] = useState(false);
  const [combineResult, setCombineResult] = useState<any>(null);
  const [combineEditing, setCombineEditing] = useState(false);
  const [combineEditText, setCombineEditText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const fetchIntelligence = useCallback(async (selectedRegion: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/broker/morning-intelligence?region=${selectedRegion}`);
      if (res.ok) {
        const json = await res.json();
        setData(json.data);
        setSharingUrl(json.sharingUrl || "");
        setBrokerProfileSlug(json.brokerSlug || "demo");
        setMyStats(json.myStats || null);
      }
      
      const pulseRes = await fetch(`/api/pulse/generate?region=${selectedRegion}&limit=1`);
      if (pulseRes.ok) {
        const pulseJson = await pulseRes.json();
        if (pulseJson.success && pulseJson.data && pulseJson.data.length > 0) {
          setPulseData(pulseJson.data[0]);
        } else {
          setPulseData(null);
        }
      }
    } catch (err) {
      console.error("Failed to fetch morning intelligence:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchIntelligence(region); }, [region, fetchIntelligence]);

  const handleCopyScript = async (text: string, type: "cold" | "hot") => {
    try { await navigator.clipboard.writeText(text); setCopiedScript(type); setTimeout(() => setCopiedScript(null), 2500); } catch { }
  };
  const handleShareLink = async () => {
    const today = new Date().toISOString().slice(0, 10);
    const magazineUrl = `${window.location.origin}/magazine/${brokerProfileSlug}/${today}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `CRE 데일리 매거진 | ${today}`,
          text: `꼬마빌딩 시장 AI 브리핑— 오늘 부동산 인텔리전스를 확인하세요.`,
          url: magazineUrl,
        });
        return;
      } catch { /* fallback */ }
    }
    try { await navigator.clipboard.writeText(magazineUrl); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2500); } catch { }
  };
  const triggerCrawl = async () => {
    setRefreshing(true);
    try { await fetch("/api/public/market-intelligence?action=crawl"); await fetchIntelligence(region); } catch { } finally { setRefreshing(false); }
  };

  // ── 마이 인텔리전스: AI 정리 ──────────────────────────────────────────────
  const handleMyIntelProcess = async () => {
    if (!myIntelText.trim()) return;
    setMyIntelProcessing(true);
    try {
      // 줄바꿈/번호 기준으로 자료 분리
      const rawInputs = myIntelText
        .split(/\n(?=\d+[.\)\-]|\[|■|●|▶|━)/)
        .map(s => s.trim())
        .filter(s => s.length > 10);
      const inputs = rawInputs.length > 0 ? rawInputs : [myIntelText.trim()];

      const res = await fetch("/api/broker/morning-intelligence/custom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ region, rawInputs: inputs.slice(0, 10) }),
      });
      if (res.ok) {
        const json = await res.json();
        setMyIntelResult(json.aiSummary);
      }
    } catch (err) {
      console.error("My intel process failed:", err);
    } finally {
      setMyIntelProcessing(false);
    }
  };

  // ── 커스텀 결합: AI 브리핑 생성 ────────────────────────────────────────────
  const handleCombine = async () => {
    setCombineProcessing(true);
    try {
      const hqBriefingText = data?.briefing || "";
      const myItems = myIntelResult?.items?.map((item: any) => ({
        summary: item.summary,
        implication: item.implication,
      })) || [];

      const res = await fetch("/api/broker/morning-intelligence/combine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          region,
          hqBriefingText,
          hqSelectedSections: ["briefing", "transactions", "auctions"],
          myIntelItems: myItems,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        setCombineResult(json);
        setCombineEditText(json.briefing || "");
      }
    } catch (err) {
      console.error("Combine failed:", err);
    } finally {
      setCombineProcessing(false);
    }
  };

  const now = new Date();
  const dateStr = now.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long" });
  const timeStr = now.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  const regionInfo = REGIONS.find(r => r.id === region)!;

  // ── 로딩 스켈레톤 ────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="w-full space-y-5 animate-pulse">
        <div className="h-36 rounded-3xl bg-gradient-to-r from-indigo-900/40 to-violet-900/40 border border-indigo-500/20" />
        <div className="h-64 rounded-2xl bg-white/3 border border-white/8" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-36 rounded-2xl bg-white/3 border border-white/8" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-5">

      {/* ── HERO 헤더 ───────────────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="relative rounded-3xl overflow-hidden border border-indigo-500/25"
        style={{ background: "linear-gradient(135deg, #0f0f2e 0%, #1a0a2e 50%, #0a1a2e 100%)" }}>
        {/* 배경 글로우 */}
        <div className="absolute -top-20 left-1/4 w-72 h-72 rounded-full blur-3xl opacity-20"
             style={{ background: "radial-gradient(circle, #6366f1, transparent)" }} />
        <div className="absolute -bottom-10 right-1/4 w-48 h-48 rounded-full blur-3xl opacity-15"
             style={{ background: "radial-gradient(circle, #8b5cf6, transparent)" }} />

        <div className="relative z-10 p-6">
          {/* 제목 영역 — 항상 전체 너비 사용 */}
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-2xl">🌅</span>
              <h2 className="text-xl font-extrabold text-white tracking-tight whitespace-nowrap">모닝 인텔리전스</h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/30 text-indigo-200 border border-indigo-500/30 flex items-center gap-1 shrink-0">
                <Sparkles className="w-2.5 h-2.5" /> AI 큐레이션
              </span>
            </div>
            <p className="text-sm text-slate-300 font-medium">{dateStr}</p>
            <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
              <Clock className="w-3 h-3 shrink-0" /> {timeStr} 기준 · 공공 빅데이터 + 뉴스 AI 분석
              {myStats && myStats.dealCardCount > 0 && (
                <span className="text-indigo-300 font-bold">
                  · 내 매물 {myStats.dealCardCount}건 · 매수자 {myStats.buyerCount}명 반영
                </span>
              )}
            </p>
          </div>

          {/* 컨트롤 영역 — 제목 아래 배치 */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            {/* 권역 탭 */}
            <div className="flex bg-white/5 backdrop-blur p-1 rounded-2xl border border-white/10 gap-0.5 overflow-x-auto scrollbar-none">
              {REGIONS.map((r) => (
                <button key={r.id} onClick={() => setRegion(r.id)}
                  className={`text-[11px] px-3.5 py-2 rounded-xl font-bold transition-all duration-300 cursor-pointer flex items-center gap-1 whitespace-nowrap shrink-0 ${
                    region === r.id
                      ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/30"
                      : "text-slate-400 hover:text-white hover:bg-white/8"
                  }`}>
                  <span>{r.emoji}</span> {r.label}
                </button>
              ))}
            </div>

            {/* 액션 버튼 */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none sm:ml-auto">
              <Link href={`/broker/schedule`} 
                className="flex items-center gap-1.5 text-[11px] font-bold px-3.5 py-2 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 transition-all duration-300 whitespace-nowrap shrink-0">
                <Calendar className="w-3.5 h-3.5" /><span>오늘의 임장</span>
              </Link>
              <Link href={`/broker/magazine-editor`} 
                className="flex items-center gap-1.5 text-[11px] font-bold px-3.5 py-2 rounded-xl border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 transition-all duration-300 whitespace-nowrap shrink-0">
                <Edit3 className="w-3.5 h-3.5" /><span>매거진 편집</span>
              </Link>
              <Link href={`/magazine/${brokerProfileSlug}/${new Date().toISOString().slice(0, 10)}`} target="_blank"
                className="flex items-center gap-1.5 text-[11px] font-bold px-3.5 py-2 rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 transition-all duration-300 whitespace-nowrap shrink-0">
                <Eye className="w-3.5 h-3.5" /><span>미리보기</span>
              </Link>
              <motion.button whileTap={{ scale: 0.95 }} onClick={handleShareLink}
                className="flex items-center gap-1.5 text-[11px] font-bold px-3.5 py-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 transition-all duration-300 whitespace-nowrap shrink-0">
                {linkCopied
                  ? <><Check className="w-3.5 h-3.5 text-emerald-400" /><span>링크 복사완료!</span></>
                  : <><Share2 className="w-3.5 h-3.5" /><span>공유</span></>}
              </motion.button>
              <motion.button whileTap={{ scale: 0.95 }} onClick={triggerCrawl} disabled={refreshing}
                className="p-2.5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/12 text-slate-400 hover:text-white transition-all duration-300 disabled:opacity-40 shrink-0"
                title="시장 데이터 갱신">
                  <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
                </motion.button>
              </div>
            </div>
          </div>
      </motion.div>

      {/* ── 3탭 모드 전환 ─────────────────────────────────────────────────── */}
      <div className="flex bg-white/5 backdrop-blur p-1 rounded-2xl border border-white/10 gap-0.5">
        {[
          { id: "hq" as const, label: "🏢 HQ 브리핑", desc: "자동 수집" },
          { id: "my" as const, label: "📋 마이 인텔", desc: "자료 복붙" },
          { id: "custom" as const, label: "🔗 커스텀", desc: "결합 편집" },
        ].map((tab) => (
          <button key={tab.id} onClick={() => setIntelMode(tab.id)}
            className={`flex-1 text-center py-2.5 px-2 rounded-xl font-bold transition-all duration-300 cursor-pointer ${
              intelMode === tab.id
                ? "bg-indigo-500/20 text-indigo-200 border border-indigo-500/30"
                : "text-slate-500 hover:text-slate-300 hover:bg-white/5 border border-transparent"
            }`}>
            <div className="text-[12px]">{tab.label}</div>
            <div className="text-[9px] opacity-60 mt-0.5">{tab.desc}</div>
          </button>
        ))}
      </div>

      {/* ── 마이 인텔리전스 패널 ───────────────────────────────────────────── */}
      {intelMode === "my" && (
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <Card accent="#059669" className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[12px] font-bold text-emerald-300">
                <ClipboardPaste className="w-4 h-4" /> 자료 복붙 → AI 정리
              </span>
              <span className="text-[10px] text-slate-500">최대 10건</span>
            </div>

            <textarea
              ref={textareaRef}
              value={myIntelText}
              onChange={(e) => setMyIntelText(e.target.value)}
              placeholder={"뉴스 기사, 시장 정보, 메모 등을 복붙하세요...\n\n예시:\n1. 강남 테헤란로 이면 근생 빌딩 85억 거래 체결\n2. 성수 F&B 공실률 1.8%로 하락, 임대 수요 지속\n3. 한국부동산원 발표: 서울 오피스 공실률 2.3%"}
              className="w-full h-44 bg-white/3 border border-white/10 rounded-xl p-4 text-[12px] text-slate-200 placeholder-slate-600 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/30 transition-all"
            />

            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-500">
                {myIntelText.split(/\n/).filter(l => l.trim().length > 10).length}건 감지됨
              </span>
              <div className="flex gap-2">
                {myIntelText && (
                  <button onClick={() => { setMyIntelText(""); setMyIntelResult(null); }}
                    className="flex items-center gap-1 text-[11px] px-3 py-1.5 rounded-lg bg-white/5 text-slate-400 hover:bg-white/10 transition-all">
                    <Trash2 className="w-3 h-3" /> 초기화
                  </button>
                )}
                <button onClick={handleMyIntelProcess} disabled={myIntelProcessing || !myIntelText.trim()}
                  className="flex items-center gap-1.5 text-[11px] font-bold px-4 py-2 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 transition-all disabled:opacity-40">
                  {myIntelProcessing
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> AI 정리 중...</>
                    : <><Wand2 className="w-3.5 h-3.5" /> AI 정리</>}
                </button>
              </div>
            </div>
          </Card>

          {/* AI 정리 결과 */}
          {myIntelResult && (
            <Card accent="#10b981" className="space-y-4">
              <div className="flex items-center gap-1.5 text-[12px] font-bold text-emerald-300">
                <CheckCircle2 className="w-4 h-4" /> AI 정리 결과
              </div>

              {/* 항목별 카드 */}
              <div className="space-y-2.5">
                {(myIntelResult.items || []).map((item: any, i: number) => (
                  <div key={i} className="bg-white/3 border border-white/8 rounded-xl p-3 space-y-1.5">
                    <div className="flex items-start gap-2">
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded-md font-bold shrink-0">{i + 1}</span>
                      <div>
                        <p className="text-[12px] font-bold text-white">{item.summary}</p>
                        <p className="text-[11px] text-slate-400 mt-1">→ {item.implication}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* 종합 인사이트 */}
              {myIntelResult.overallInsight && (
                <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-xl p-3.5">
                  <p className="text-[11px] font-bold text-emerald-300 mb-1.5">📊 종합 인사이트</p>
                  <p className="text-[12px] text-slate-200 leading-relaxed">{myIntelResult.overallInsight}</p>
                </div>
              )}

              {/* 액션 아이템 */}
              {myIntelResult.actionItems && myIntelResult.actionItems.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-bold text-amber-300">🎯 액션 아이템</p>
                  {myIntelResult.actionItems.map((action: string, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-[11px] text-slate-300">
                      <ChevronRight className="w-3 h-3 text-amber-400 shrink-0" />
                      {action}
                    </div>
                  ))}
                </div>
              )}

              {/* 커스텀 결합으로 이동 */}
              <button onClick={() => setIntelMode("custom")}
                className="w-full flex items-center justify-center gap-2 text-[11px] font-bold py-2.5 rounded-xl bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 hover:bg-indigo-500/20 transition-all">
                <Combine className="w-3.5 h-3.5" /> HQ 브리핑과 결합하기 →
              </button>
            </Card>
          )}
        </motion.div>
      )}

      {/* ── 커스텀 결합 패널 ───────────────────────────────────────────────── */}
      {intelMode === "custom" && (
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <Card accent="#d97706" className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[12px] font-bold text-amber-300">
                <Combine className="w-4 h-4" /> HQ + 마이 인텔 결합
              </span>
            </div>

            {/* 소스 상태 표시 */}
            <div className="grid grid-cols-2 gap-3">
              <div className={`rounded-xl p-3 border ${
                data?.briefing ? "bg-indigo-500/5 border-indigo-500/20" : "bg-white/3 border-white/10"
              }`}>
                <p className="text-[10px] text-indigo-300 font-bold mb-1">🏢 HQ 브리핑</p>
                <p className="text-[11px] text-slate-400">
                  {data?.briefing ? "✅ 준비됨" : "⏳ 로딩 중..."}
                </p>
              </div>
              <div className={`rounded-xl p-3 border ${
                myIntelResult ? "bg-emerald-500/5 border-emerald-500/20" : "bg-white/3 border-white/10"
              }`}>
                <p className="text-[10px] text-emerald-300 font-bold mb-1">📋 마이 인텔</p>
                <p className="text-[11px] text-slate-400">
                  {myIntelResult ? `✅ ${myIntelResult.items?.length || 0}건` : "미작성"}
                </p>
                {!myIntelResult && (
                  <button onClick={() => setIntelMode("my")} className="text-[10px] text-emerald-400 mt-1 hover:underline">
                    → 마이 인텔 작성하기
                  </button>
                )}
              </div>
            </div>

            <button onClick={handleCombine}
              disabled={combineProcessing || (!data?.briefing && !myIntelResult)}
              className="w-full flex items-center justify-center gap-2 text-[12px] font-bold py-3 rounded-xl bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 transition-all disabled:opacity-40">
              {combineProcessing
                ? <><Loader2 className="w-4 h-4 animate-spin" /> AI 결합 브리핑 생성 중...</>
                : <><Wand2 className="w-4 h-4" /> ✨ AI 커스텀 브리핑 생성</>}
            </button>
          </Card>

          {/* 결합 결과 */}
          {combineResult && (
            <Card accent="#f59e0b" className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-extrabold text-white">
                  {combineResult.title || "커스텀 브리핑"}
                </span>
                <button onClick={() => { setCombineEditing(!combineEditing); }}
                  className="flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-lg bg-white/5 text-slate-400 hover:bg-white/10 transition-all">
                  <Edit3 className="w-3 h-3" /> {combineEditing ? "미리보기" : "편집"}
                </button>
              </div>

              {combineEditing ? (
                <textarea
                  value={combineEditText}
                  onChange={(e) => setCombineEditText(e.target.value)}
                  className="w-full h-48 bg-white/3 border border-white/10 rounded-xl p-4 text-[12px] text-slate-200 resize-none focus:outline-none focus:ring-2 focus:ring-amber-500/30 transition-all"
                />
              ) : (
                <div className="bg-white/3 border border-white/8 rounded-xl p-4">
                  <RichBriefing text={combineEditText || combineResult.briefing} />
                </div>
              )}

              {/* 액션 리스트 */}
              {combineResult.actionList && combineResult.actionList.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-bold text-emerald-300">🎯 오늘의 액션</p>
                  {combineResult.actionList.map((action: string, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-[11px] text-slate-300">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                      {action}
                    </div>
                  ))}
                </div>
              )}

              {/* 전화 멘트 */}
              {combineResult.callScript && (
                <div className="bg-indigo-500/5 border border-indigo-500/15 rounded-xl p-3.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold text-indigo-300">📞 전화 멘트</span>
                    <button onClick={() => { navigator.clipboard.writeText(combineResult.callScript); }}
                      className="text-[9px] px-2 py-0.5 rounded bg-white/5 text-slate-400 hover:bg-white/10">
                      복사
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">{combineResult.callScript}</p>
                </div>
              )}

              {/* 공유 버튼 */}
              <div className="flex gap-2">
                <button onClick={() => { navigator.clipboard.writeText(combineEditText || combineResult.briefing); }}
                  className="flex-1 flex items-center justify-center gap-1.5 text-[11px] font-bold py-2.5 rounded-xl bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10 transition-all">
                  <Copy className="w-3.5 h-3.5" /> 브리핑 복사
                </button>
                <button onClick={handleShareLink}
                  className="flex-1 flex items-center justify-center gap-1.5 text-[11px] font-bold py-2.5 rounded-xl bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all">
                  <Share2 className="w-3.5 h-3.5" /> 매거진 발행
                </button>
              </div>
            </Card>
          )}
        </motion.div>
      )}

      {/* ── HQ 브리핑 (기존 콘텐츠) ──────────────────────────────────────────── */}

      {intelMode === "hq" && data ? (
        <div className="space-y-4">

          {/* ── CARD 1: AI 브리핑 (리치 포맷) ────────────────────────────────── */}
          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}>
            <Card accent="#6366f1" className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[11px] font-bold text-indigo-300">
                  <Sparkles className="w-3.5 h-3.5" /> AI 마켓 에디터 브리핑
                </span>
                <Badge variant="indigo"><Eye className="w-2.5 h-2.5" /> 08:00 AM 업데이트</Badge>
              </div>

              {/* 리치 브리핑 텍스트 */}
              <div className={`relative overflow-hidden transition-all duration-700 ${briefingExpanded ? "max-h-none" : "max-h-52"}`}>
                <div className="bg-white/3 border border-white/8 rounded-xl p-4">
                  <RichBriefing text={data.briefing} />
                </div>
                {!briefingExpanded && (
                  <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-[#1a1a2e] to-transparent rounded-b-xl" />
                )}
              </div>
              <button onClick={() => setBriefingExpanded(!briefingExpanded)}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1 transition-colors">
                <ArrowRight className={`w-3.5 h-3.5 transition-transform duration-300 ${briefingExpanded ? "rotate-90" : ""}`} />
                {briefingExpanded ? "접기" : "전체 브리핑 보기"}
              </button>

              {/* 오늘의 액션 리스트 */}
              {data.actionList && data.actionList.length > 0 && (
                <div className="pt-3 border-t border-white/8">
                  <div className="flex items-center gap-1.5 mb-2.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-[11px] font-bold text-emerald-300">오늘의 액션 리스트</span>
                  </div>
                  <div className="space-y-2">
                    {data.actionList.map((action, i) => (
                      <motion.div key={i} initial={{ x: -10, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: 0.1 + i * 0.08 }}
                        className="flex items-start gap-2.5 text-[12px] bg-emerald-500/5 border border-emerald-500/12 rounded-xl px-3.5 py-2.5">
                        <span className="text-emerald-400 font-extrabold shrink-0 text-[11px] mt-0.5 w-5">{i + 1}.</span>
                        <span className="text-slate-200 leading-relaxed">{action}</span>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              {/* 상담 화법 */}
              <div className="pt-3 border-t border-white/8">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-indigo-300 flex items-center gap-1.5">
                    <PhoneCall className="w-3.5 h-3.5" /> 콜드 팔로업 상담 멘트
                  </span>
                  <motion.button whileTap={{ scale: 0.92 }}
                    onClick={() => handleCopyScript(data.counselScript, "cold")}
                    className="flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-indigo-300 border border-white/12 bg-white/5 hover:bg-indigo-500/10 px-2.5 py-1.5 rounded-lg transition-all duration-300">
                    {copiedScript === "cold"
                      ? <><Check className="w-3 h-3 text-emerald-400" /><span className="text-emerald-400">복사됨</span></>
                      : <><Copy className="w-3 h-3" /><span>복사</span></>}
                  </motion.button>
                </div>
                <div className="relative bg-indigo-500/5 border border-indigo-500/15 rounded-xl px-4 py-3">
                  <div className="absolute left-0 top-3 bottom-3 w-0.5 bg-indigo-500/40 rounded-full ml-3" />
                  <p className="text-[12px] italic text-slate-200 leading-relaxed pl-3">
                    &ldquo;{data.counselScript}&rdquo;
                  </p>
                </div>
              </div>
            </Card>
          </motion.div>

          {/* ── 2-COL GRID ────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* CARD 2: 내 매물 vs 실거래 */}
            {data.myDealsVsMarket && data.myDealsVsMarket.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
                <Card accent="#f43f5e">
                  <SectionHead
                    icon={<Building2 className="w-3.5 h-3.5 text-rose-400" />}
                    title="내 매물 vs 최근 실거래"
                    badge={<Badge variant="rose">🎯 개인화</Badge>}
                  />
                  <div className="space-y-2">
                    {data.myDealsVsMarket.map((deal, idx) => (
                      <div key={idx} className="bg-white/3 border border-rose-500/12 rounded-xl p-3 text-[11px]">
                        <div className="flex justify-between items-center font-bold text-white mb-1.5">
                          <span>{deal.areaSignal} {deal.assetType}</span>
                          <span className="text-rose-300 font-mono">{deal.priceBand}</span>
                        </div>
                        {deal.nearbyTxDesc ? (
                          <div className="space-y-1">
                            <p className="text-slate-400 text-[10px] flex items-center gap-1">
                              <BarChart2 className="w-3 h-3 text-slate-500" /> {deal.nearbyTxDesc}
                            </p>
                            {deal.action && (
                              <p className="text-amber-300 font-bold text-[10px] flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" /> {deal.action}
                              </p>
                            )}
                          </div>
                        ) : (
                          <p className="text-slate-500 text-[10px]">이 권역 최근 실거래 없음</p>
                        )}
                      </div>
                    ))}
                  </div>
                </Card>
              </motion.div>
            )}

            {/* CARD 3: 실거래 체결 */}
            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <Card>
                <SectionHead
                  icon={<span className="text-base">🏠</span>}
                  title="오늘의 실거래 체결"
                  badge={<Badge variant="emerald">실시간</Badge>}
                />
                <div className="space-y-2">
                  {data.yesterdayTransactions.map((tx, idx) => (
                    <motion.div key={idx} initial={{ x: 8, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
                      transition={{ delay: 0.15 + idx * 0.06 }}
                      className={`rounded-xl p-3 text-[11px] border transition-all duration-200 hover:scale-[1.01] ${
                        tx.isMyArea
                          ? "bg-rose-500/5 border-rose-500/20"
                          : "bg-white/3 border-white/8"
                      }`}>
                      <div className="flex justify-between font-bold text-white mb-1">
                        <span className="line-clamp-1 flex items-center gap-1">
                          {tx.isMyArea && <Flame className="w-3 h-3 text-rose-400 shrink-0" />}
                          {tx.title}
                        </span>
                        <span className="text-[9px] text-slate-500 shrink-0 ml-2">{tx.date}</span>
                      </div>
                      <p className="text-slate-400 text-[10px] leading-relaxed">{tx.desc}</p>
                      <div className="mt-1.5">
                        <Badge variant={tx.tag === "급매" ? "red" : "default"}>{tx.tag}</Badge>
                      </div>
                    </motion.div>
                  ))}
                  <Link href={`/broker/morning-detail?region=${region}&section=transactions`} className="block mt-2 text-center text-[11px] text-indigo-400 font-bold hover:text-indigo-300 py-2 border border-indigo-500/20 bg-indigo-500/5 rounded-xl hover:bg-indigo-500/10 transition-colors">
                    실거래 상세 보기 &rarr;
                  </Link>
                </div>
              </Card>
            </motion.div>

            {/* CARD 4: 경매 & 공매 */}
            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
              <Card accent="#f59e0b">
                <SectionHead
                  icon={<Hammer className="w-3.5 h-3.5 text-amber-400" />}
                  title="경매 & 공매 신건"
                  badge={<Badge variant="amber">NPL 소싱</Badge>}
                />
                <div className="space-y-2">
                  {data.auctions.map((a, idx) => (
                    <div key={idx} className="bg-white/3 border border-amber-500/12 rounded-xl p-3 text-[11px] hover:bg-amber-500/5 transition-colors">
                      <div className="flex justify-between font-bold text-white mb-1">
                        <span className="line-clamp-1 flex-1 mr-2">{a.title}</span>
                        {a.discountPct !== undefined && a.discountPct > 0 && (
                          <span className="text-[10px] text-rose-300 font-bold shrink-0 bg-rose-500/15 border border-rose-500/25 px-1.5 py-0.5 rounded-lg">
                            -{a.discountPct}%
                          </span>
                        )}
                      </div>
                      <p className="text-slate-400 text-[10px] mb-1.5 leading-relaxed">{a.desc}</p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant="amber">매각기일 {a.date}</Badge>
                        <Badge>{a.tag}</Badge>
                      </div>
                    </div>
                  ))}
                  <Link href={`/broker/morning-detail?region=${region}&section=auctions`} className="block mt-2 text-center text-[11px] text-amber-400 font-bold hover:text-amber-300 py-2 border border-amber-500/20 bg-amber-500/5 rounded-xl hover:bg-amber-500/10 transition-colors">
                    경매 신건 전체 보기 &rarr;
                  </Link>
                </div>
              </Card>
            </motion.div>

            {/* CARD 5: 임대 & 공실 현황 (바 차트) */}
            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <Card>
                <SectionHead
                  icon={<span className="text-base">📊</span>}
                  title={`${regionInfo.emoji} ${regionInfo.label} 임대 & 공실`}
                />
                <div className="space-y-3">
                  {data.rentalMarket.map((r, idx) => {
                    const rent = parseInt(r.rent.replace(/[^0-9]/g, ""), 10) || 0;
                    const vacancy = parseFloat(r.vacancy.replace("%", "")) || 0;
                    return (
                      <div key={idx} className="space-y-2 pb-3 border-b border-white/5 last:border-0 last:pb-0">
                        <div className="flex justify-between items-center">
                          <span className="text-[11px] font-bold text-white">{r.type}</span>
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-bold ${vacancy < 3 ? "text-emerald-400" : vacancy < 6 ? "text-amber-400" : "text-rose-400"}`}>
                              공실 {r.vacancy}
                            </span>
                          </div>
                        </div>
                        <MiniBar label="보증금/㎡" value={parseInt(r.deposit.replace(/[^0-9]/g, ""), 10) || 0}
                          max={2000000} color="#6366f1" unit="원" />
                        <MiniBar label="월세/㎡" value={rent} max={200000} color="#10b981" unit="원" />
                        <p className="text-[9px] text-slate-600 text-right">출처: {r.source}</p>
                      </div>
                    );
                  })}
                  <Link href={`/broker/morning-detail?region=${region}&section=rentals`} className="block mt-3 text-center text-[11px] text-indigo-400 font-bold hover:text-indigo-300 py-2 border border-indigo-500/20 bg-indigo-500/5 rounded-xl hover:bg-indigo-500/10 transition-colors">
                    임대 및 공실 심층 분석 &rarr;
                  </Link>
                </div>
              </Card>
            </motion.div>

            {/* CARD 6: 투자자 심리 지수 */}
            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
              <Card>
                <SectionHead
                  icon={<span className="text-base">🌡️</span>}
                  title="CRE 투자자 심리 지수"
                  badge={<Badge variant={data.sentiment.score >= 70 ? "red" : data.sentiment.score <= 40 ? "indigo" : "default"}>
                    {data.sentiment.status}
                  </Badge>}
                />
                <div className="space-y-3">
                  <div className="bg-white/3 border border-white/8 rounded-xl p-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[11px] text-slate-400 font-medium">Fear & Greed Index</span>
                      <span className="text-2xl font-extrabold text-white">{data.sentiment.score}
                        <span className="text-[13px] text-slate-500 font-normal"> / 100</span>
                      </span>
                    </div>
                    {/* 그라디언트 게이지 바 */}
                    <div className="relative w-full bg-white/5 h-3 rounded-full overflow-hidden mb-3">
                      <motion.div initial={{ width: 0 }} animate={{ width: `${data.sentiment.score}%` }}
                        transition={{ duration: 1.2, ease: "easeOut" }}
                        className={`h-full rounded-full bg-gradient-to-r ${getSentimentGradient(data.sentiment.score)}`} />
                      {/* 마커 */}
                      <motion.div initial={{ left: 0 }} animate={{ left: `calc(${data.sentiment.score}% - 4px)` }}
                        transition={{ duration: 1.2, ease: "easeOut" }}
                        className="absolute top-1/2 -translate-y-1/2 w-2 h-5 bg-white rounded-full shadow-lg shadow-white/40" />
                    </div>
                    <div className="flex justify-between text-[9px] text-slate-600 font-medium">
                      <span>극단적 공포 0</span>
                      <span>중립 50</span>
                      <span>극단적 탐욕 100</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed px-1">{data.sentiment.description}</p>
                </div>
              </Card>
            </motion.div>

            {/* CARD 7: 상권 분석 (원형 게이지) */}
            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
              <Card accent="#f43f5e">
                <SectionHead
                  icon={<MapPin className="w-3.5 h-3.5 text-rose-400" />}
                  title="상권 분석 · 소상공인 빅데이터"
                />
                <div className="bg-white/3 border border-white/8 rounded-xl p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-400 font-medium">대상 상권</span>
                    <span className="text-[12px] font-bold text-white">{data.commercialDistrict.name}</span>
                  </div>
                  <div className="flex justify-center gap-10">
                    <CircleGauge value={data.commercialDistrict.salesIndex} max={10}
                      color="#6366f1" label={"외식업\n매출지수"} />
                    <CircleGauge value={data.commercialDistrict.footfallIndex} max={10}
                      color="#10b981" label={"유동인구\n지수"} />
                  </div>
                </div>
              </Card>
            </motion.div>

            {/* CARD 8: 공시지가 */}
            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
              <Card accent="#10b981">
                <SectionHead
                  icon={<TrendingUp className="w-3.5 h-3.5 text-emerald-400" />}
                  title="대표 필지 공시지가 변동"
                />
                <div className="bg-white/3 border border-white/8 rounded-xl p-4 space-y-3">
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-slate-500 font-medium">PNU</span>
                    <span className="font-mono text-slate-400">{data.landPriceTrend.pnu}</span>
                  </div>
                  <div className="border-t border-white/5 pt-3 flex justify-between items-end">
                    <div>
                      <span className="block text-[10px] text-slate-500 mb-0.5">{data.landPriceTrend.latestYear}년 공시지가</span>
                      <span className="text-2xl font-extrabold text-white">
                        {(data.landPriceTrend.latestPrice / 10000).toLocaleString("ko-KR")}
                        <span className="text-sm font-normal text-slate-400 ml-1">만원/㎡</span>
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="block text-[10px] text-slate-500 mb-0.5">전년 대비</span>
                      <span className={`text-2xl font-extrabold ${data.landPriceTrend.changePct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {data.landPriceTrend.changePct >= 0 ? "+" : ""}{data.landPriceTrend.changePct}%
                      </span>
                    </div>
                  </div>
                  {/* 미니 추세 바 */}
                  <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <motion.div initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, 50 + data.landPriceTrend.changePct * 3)}%` }}
                      transition={{ duration: 1 }}
                      className={`h-full rounded-full ${data.landPriceTrend.changePct >= 0 ? "bg-emerald-500" : "bg-rose-500"}`} />
                  </div>
                </div>
              </Card>
            </motion.div>

            {/* CARD 9: ESG & 에너지 */}
            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
              <Card accent="#f59e0b">
                <SectionHead
                  icon={<Zap className="w-3.5 h-3.5 text-amber-400" />}
                  title="에너지 등급 & ESG 밸류업"
                  badge={<Badge variant="amber">{data.esgValueUp.grade}</Badge>}
                />
                <div className="space-y-3">
                  <div className="bg-amber-500/5 border border-amber-500/12 rounded-xl p-3.5">
                    <div className="flex items-start gap-2.5">
                      <div className="p-1.5 rounded-lg bg-amber-500/15 shrink-0">
                        <Zap className="w-3.5 h-3.5 text-amber-400" />
                      </div>
                      <div>
                        <span className="block text-[11px] font-bold text-white mb-0.5">밸류업 기회</span>
                        <span className="text-[11px] text-slate-300 leading-relaxed">{data.esgValueUp.opportunity}</span>
                      </div>
                    </div>
                  </div>
                  <div className="bg-white/3 border border-white/8 rounded-xl px-3.5 py-3 text-[11px] text-slate-400">
                    <strong className="text-slate-200">ESG 혜택:</strong> {data.esgValueUp.benefit}
                  </div>
                </div>
              </Card>
            </motion.div>

            {/* CARD 10: 신축/리모델링 인허가 */}
            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}>
              <Card>
                <SectionHead icon={<span className="text-base">🏗️</span>} title="신축 & 리모델링 인허가 동향" />
                <div className="space-y-2">
                  {data.constructionPermits.map((item, idx) => (
                    <Link key={idx} href={`/broker/morning-detail?region=${region}&section=permits`} className="block bg-white/3 border border-white/8 rounded-xl p-3 hover:bg-white/5 hover:border-indigo-500/30 transition-colors cursor-pointer group">
                      <p className="text-[12px] font-bold text-white flex items-center gap-1.5 mb-1 group-hover:text-indigo-200 transition-colors">
                        <ArrowRight className="w-3 h-3 text-indigo-400 shrink-0" /> {item.text}
                      </p>
                      <p className="text-[10px] text-slate-400 leading-relaxed pl-4">{item.detail}</p>
                      <span className="text-[10px] text-indigo-400 mt-2 ml-4 flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                        상세 내역 확인 <ArrowRight className="w-2.5 h-2.5" />
                      </span>
                    </Link>
                  ))}
                </div>
              </Card>
            </motion.div>

            {/* CARD 11: 글로벌 리포트 (full-width) */}
            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
              className="md:col-span-2">
              <Card accent="#6366f1">
                <SectionHead
                  icon={<Globe className="w-3.5 h-3.5 text-indigo-400" />}
                  title="글로벌 CRE 리서치 리포트"
                  badge={<Badge variant="indigo"><BookOpen className="w-2.5 h-2.5" /> CBRE · Cushman · 부동산플래닛</Badge>}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {data.globalReports.map((r, idx) => (
                    <a key={idx} href={r.url} target="_blank" rel="noreferrer"
                      className="group flex flex-col bg-white/3 border border-white/8 hover:border-indigo-500/30 rounded-xl p-4 hover:bg-indigo-500/5 transition-all duration-300">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[10px] font-bold text-indigo-400">{r.institution}</span>
                        <BookOpen className="w-3.5 h-3.5 text-slate-600 group-hover:text-indigo-400 transition-colors" />
                      </div>
                      <h4 className="text-[12px] font-bold text-white group-hover:text-indigo-200 transition-colors mb-1.5 leading-snug">
                        {r.title}
                      </h4>
                      <p className="text-[10px] text-slate-400 leading-relaxed flex-1">{r.summary}</p>
                      <div className="mt-2.5 flex items-center gap-1 text-[10px] text-indigo-400 font-bold group-hover:gap-2 transition-all">
                        <span>리포트 보기</span> <ArrowRight className="w-3 h-3" />
                      </div>
                    </a>
                  ))}
                </div>
              </Card>
            </motion.div>

          </div>{/* /grid */}
        </div>
      ) : (
        <div className="text-center py-16 bg-white/3 border border-white/8 rounded-2xl text-slate-500 text-sm">
          데이터가 없습니다. 새로고침을 시도해보세요.
        </div>
      )}
    </div>
  );
}
