"use client";

import React, { useState, useRef } from "react";
import { motion, useInView } from "motion/react";
import {
  Phone, Share2, Check, Building2, Hammer, Globe, BookOpen, ArrowRight,
  Sparkles, Newspaper, ChevronDown, MessageSquare, TrendingUp, BarChart3,
  Copy,
} from "lucide-react";

interface MagazineViewProps {
  data: Record<string, any>;
  brokerId: string;
  date: string;
}

export type MagazineData = Record<string, any>;

function fmt(price: number): string {
  if (!price) return "-";
  if (price >= 100000000) return `${(price / 100000000).toFixed(1)}억`;
  if (price >= 10000) return `${(price / 10000).toFixed(0)}만`;
  return price.toLocaleString();
}

function Section({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <motion.div ref={ref} initial={{ opacity: 0, y: 20 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </motion.div>
  );
}

function RichBriefing({ text }: { text: string }) {
  const paras = text.split(/\n{1,2}/).filter(Boolean);
  return (
    <div className="space-y-3">
      {paras.map((para, i) => {
        const isHeading = /^[\u{1F300}-\u{1FFFF}\u{2600}-\u{27FF}]/u.test(para) || /^\*\*.*\*\*$/.test(para.trim());
        const html = para
          .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-bold">$1</strong>')
          .replace(/(\d[\d,.]+%)/g, '<span class="text-indigo-300 font-bold font-mono">$1</span>')
          .replace(/(\d[\d,.]+억)/g, '<span class="text-emerald-300 font-bold">$1</span>');
        if (isHeading) return <p key={i} className="text-[14px] font-extrabold text-white leading-snug pt-1" dangerouslySetInnerHTML={{ __html: html }} />;
        return <p key={i} className="text-[12px] text-slate-300 leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />;
      })}
    </div>
  );
}

function DataBadge({ type }: { type: "ai" | "public" | "realtime" }) {
  const config = {
    ai: { label: "🟣 AI 분석", cls: "text-violet-400 bg-violet-500/10 border-violet-500/20" },
    public: { label: "🔵 공공데이터", cls: "text-sky-400 bg-sky-500/10 border-sky-500/20" },
    realtime: { label: "🟢 실시간", cls: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
  };
  const c = config[type];
  return <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-md border ${c.cls}`}>{c.label}</span>;
}

function SectionCard({ title, icon, badge, children, defaultOpen = false }: {
  title: string; icon: React.ReactNode; badge?: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className={`rounded-2xl border overflow-hidden transition-all duration-300 ${isOpen ? "border-white/12 bg-white/[0.03]" : "border-white/6 bg-white/[0.02]"}`}>
      <button type="button" onClick={() => setIsOpen(!isOpen)} className="w-full flex items-center gap-2 px-4 py-3 text-left">
        {icon}
        <span className="text-[12px] font-bold text-white flex-1">{title}</span>
        {badge}
        <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
      </button>
      {isOpen && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  );
}

function sentimentColor(score: number) {
  if (score >= 70) return { bar: "from-orange-500 to-rose-500", text: "text-rose-400" };
  if (score >= 50) return { bar: "from-emerald-500 to-teal-400", text: "text-emerald-400" };
  return { bar: "from-blue-600 to-cyan-400", text: "text-blue-400" };
}

export function MagazineView({ data, brokerId, date }: MagazineViewProps) {
  const [copied, setCopied] = useState(false);
  const broker = (data.broker as Record<string, any>) ?? {};
  const [y, m, d] = date.split("-");
  const dateLabel = `${y}년 ${m}월 ${d}일`;
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  const weekday = weekdays[new Date(date).getDay()];
  const sentiment = (data.sentiment as any) ?? { score: 62, status: "탐욕 우세" };
  const sc = sentimentColor(sentiment.score);
  const accent = (data.themeColor as string | undefined) || "#6366f1";

  const handleShare = async () => {
    const shareUrl = typeof window !== "undefined" ? window.location.href : `/magazine/${brokerId}/${date}`;
    if (navigator.share) {
      try { await navigator.share({ title: `[${broker.name}] CRE 데일리 매거진 ${dateLabel}`, text: (data.headline as string) ?? "오늘의 꼬마빌딩 시장 AI 인텔리전스", url: shareUrl }); return; } catch { /* fallback */ }
    }
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleCallBroker = () => { if (broker.phone) window.location.href = `tel:${String(broker.phone).replace(/[^0-9]/g, "")}`; };

  const recentTxs = Array.isArray(data.recentTransactions) ? data.recentTransactions : [];
  const rentalTrend = data.rentalTrend as any;
  const commercialDistrict = data.commercialDistrict as any;
  const brokerComment = data.brokerComment as string | null | undefined;
  const hasMarketData = recentTxs.length > 0 || rentalTrend || commercialDistrict;

  return (
    <div className="min-h-screen w-full" style={{ background: "linear-gradient(180deg, #050510 0%, #0a0a1a 40%, #080814 100%)", "--accent": accent } as React.CSSProperties}>
      <div className="max-w-[440px] mx-auto px-4 pb-28">

        {/* ── HERO ─────────────────────────────────────────── */}
        <div className="relative pt-10 pb-8 px-1" style={{ background: `linear-gradient(160deg, ${accent}18 0%, transparent 55%)` }}>
          <div className="absolute top-0 right-0 w-48 h-48 rounded-full blur-3xl opacity-20 pointer-events-none" style={{ background: `radial-gradient(circle, ${accent}, transparent)` }} />

          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2.5 mb-6">
            <div className="w-10 h-10 rounded-full border-2 flex items-center justify-center shrink-0" style={{ borderColor: `${accent}66`, background: `linear-gradient(135deg, ${accent}, #8b5cf6)` }}>
              <span className="text-white font-extrabold text-base">{String(broker.name ?? "B").charAt(0)}</span>
            </div>
            <div>
              <p className="text-[13px] font-bold text-white">{broker.name}</p>
              <p className="text-[10px] text-slate-500">{broker.company}</p>
            </div>
            <div className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded-full" style={{ background: `${accent}18`, border: `1px solid ${accent}33` }}>
              <Sparkles className="w-2.5 h-2.5" style={{ color: accent }} />
              <span className="text-[9px] font-bold" style={{ color: accent }}>AI 개인화</span>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
            <p className="text-[12px] text-slate-500 mb-1.5">{dateLabel} {weekday}요일</p>
            <h1 className="text-[26px] font-extrabold text-white leading-tight tracking-tight mb-2">CRE 데일리 매거진</h1>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {((broker.specialtyRegions as string[]) ?? []).map((r: string, i: number) => (
                <span key={i} className="text-[10px] font-bold px-2.5 py-0.5 rounded-full" style={{ color: accent, background: `${accent}15`, border: `1px solid ${accent}30` }}>{r}</span>
              ))}
            </div>
          </motion.div>

          {data.keyStats && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} className="mt-5 grid grid-cols-3 gap-2">
              {(data.keyStats as any[]).map((stat, i) => {
                const cls: Record<string, string> = { emerald: "text-emerald-400 border-emerald-500/20 bg-emerald-500/8", indigo: "text-indigo-400 border-indigo-500/20 bg-indigo-500/8", rose: "text-rose-400 border-rose-500/20 bg-rose-500/8", amber: "text-amber-400 border-amber-500/20 bg-amber-500/8", slate: "text-slate-400 border-slate-500/20 bg-slate-500/8" };
                const c = cls[stat.accent] ?? "text-slate-400 border-white/10 bg-white/4";
                return (<div key={i} className={`border rounded-xl p-2.5 text-center ${c}`}><div className="text-[15px] font-extrabold leading-none mb-1">{stat.value}</div><div className="text-[9px] opacity-70">{stat.label}</div></div>);
              })}
            </motion.div>
          )}
        </div>

        {/* ── 섹션들 ────────────────────────────────────────── */}
        <div className="space-y-5">

          {/* AI 브리핑 */}
          <Section delay={0.05}>
            <div className="rounded-2xl border border-indigo-500/15 overflow-hidden" style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.07) 0%, rgba(15,15,35,0.8) 100%)" }}>
              <div className="px-4 py-3 border-b border-white/5 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                <span className="text-[11px] font-bold text-indigo-300">AI 마켓 에디터 브리핑</span>
                <div className="ml-auto"><DataBadge type="ai" /></div>
              </div>
              {data.headline && (
                <div className="px-4 pt-4">
                  <h2 className="text-[16px] font-extrabold text-white leading-snug">{data.headline as string}</h2>
                </div>
              )}
              <div className="p-4">
                <RichBriefing text={(data.briefing as string) ?? ""} />
              </div>
            </div>
          </Section>

          {/* 💬 브로커 코멘트 */}
          {brokerComment && (
            <Section delay={0.08}>
              <div className="rounded-2xl border border-violet-500/20 overflow-hidden" style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.08), rgba(15,15,35,0.9))" }}>
                <div className="px-4 py-3 border-b border-violet-500/10 flex items-center gap-2">
                  <MessageSquare className="w-3.5 h-3.5 text-violet-400" />
                  <span className="text-[11px] font-bold text-violet-300">{broker.name}의 브로커 인사이트</span>
                  <div className="ml-auto"><DataBadge type="ai" /></div>
                </div>
                <div className="p-4">
                  <p className="text-[12px] text-slate-300 leading-relaxed whitespace-pre-wrap">{brokerComment}</p>
                </div>
              </div>
            </Section>
          )}

          {/* 📊 시장 데이터 카드 */}
          {hasMarketData && (
            <Section delay={0.1}>
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <BarChart3 className="w-3.5 h-3.5 text-sky-400" />
                  <h3 className="text-[12px] font-bold text-white">시장 데이터</h3>
                  <div className="ml-auto"><DataBadge type="public" /></div>
                </div>

                {recentTxs.length > 0 && (
                  <SectionCard title="최근 실거래" icon={<TrendingUp className="w-3.5 h-3.5 text-emerald-400" />} badge={<span className="text-[9px] text-emerald-300 bg-emerald-500/12 px-1.5 py-0.5 rounded-full">{recentTxs.length}건</span>} defaultOpen>
                    <div className="overflow-x-auto">
                      <table className="w-full text-[10px]">
                        <thead>
                          <tr className="text-slate-500 border-b border-white/5">
                            <th className="text-left py-1.5 font-medium">주소</th>
                            <th className="text-right py-1.5 font-medium">거래가</th>
                            <th className="text-right py-1.5 font-medium">날짜</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recentTxs.slice(0, 5).map((tx: any, i: number) => (
                            <tr key={i} className="border-b border-white/3">
                              <td className="py-1.5 text-slate-300 max-w-[140px] truncate">{tx.dong || tx.address}</td>
                              <td className="py-1.5 text-right text-emerald-300 font-bold">{fmt(tx.transaction_price)}</td>
                              <td className="py-1.5 text-right text-slate-500">{tx.transaction_date}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </SectionCard>
                )}

                {rentalTrend && (
                  <SectionCard title="임대 동향" icon={<BarChart3 className="w-3.5 h-3.5 text-sky-400" />}>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-white/4 border border-white/8 rounded-xl p-3 text-center">
                        <p className="text-[18px] font-extrabold text-sky-300">{rentalTrend.vacancy_rate}%</p>
                        <p className="text-[9px] text-slate-500 mt-1">공실률</p>
                      </div>
                      <div className="bg-white/4 border border-white/8 rounded-xl p-3 text-center">
                        <p className="text-[18px] font-extrabold text-indigo-300">{rentalTrend.rental_index}</p>
                        <p className="text-[9px] text-slate-500 mt-1">렌탈 인덱스</p>
                      </div>
                    </div>
                    <p className="text-[9px] text-slate-600">{rentalTrend.region} · {rentalTrend.quarter}</p>
                  </SectionCard>
                )}

                {commercialDistrict && (
                  <SectionCard title="상권 분석" icon={<Building2 className="w-3.5 h-3.5 text-amber-400" />}>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-white/4 border border-white/8 rounded-xl p-3 text-center">
                        <p className="text-[18px] font-extrabold text-amber-300">{commercialDistrict.sales_volume_index}</p>
                        <p className="text-[9px] text-slate-500 mt-1">매출 지수</p>
                      </div>
                      <div className="bg-white/4 border border-white/8 rounded-xl p-3 text-center">
                        <p className="text-[18px] font-extrabold text-rose-300">{commercialDistrict.footfall_index}</p>
                        <p className="text-[9px] text-slate-500 mt-1">유동인구 지수</p>
                      </div>
                    </div>
                    <p className="text-[9px] text-slate-600">{commercialDistrict.district_name}</p>
                  </SectionCard>
                )}
              </div>
            </Section>
          )}

          {/* 딜카드 하이라이트 */}
          {Array.isArray(data.dealHighlights) && data.dealHighlights.length > 0 && (
            <Section delay={0.15}>
              <div className="space-y-3">
                <div className="flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-rose-400" />
                  <h3 className="text-[12px] font-bold text-white">관리 매물 하이라이트</h3>
                  <span className="ml-auto text-[10px] font-bold text-rose-300 bg-rose-500/12 border border-rose-500/20 px-2 py-0.5 rounded-full">활성 {data.dealHighlights.length}건</span>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory">
                  {(data.dealHighlights as any[]).map((deal, i) => (
                    <div key={i} className="shrink-0 w-[260px] snap-start rounded-2xl border border-white/8 overflow-hidden" style={{ background: "rgba(255,255,255,0.03)" }}>
                      <div className="w-full h-[130px] relative" style={{ background: deal.photoUrl ? `url('${deal.photoUrl}') center/cover` : "linear-gradient(135deg, #1e1b4b, #312e81)" }}>
                        {!deal.photoUrl && <div className="w-full h-full flex items-center justify-center"><Building2 className="w-8 h-8 text-indigo-400/40" /></div>}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                        <div className="absolute bottom-2 left-2.5 right-2.5 flex justify-between items-end">
                          <span className="text-[10px] font-bold text-white/80 bg-black/40 px-1.5 py-0.5 rounded-lg">{deal.areaSignal}</span>
                          {deal.buyerInterestCount > 0 && <span className="text-[9px] font-bold text-rose-300 bg-rose-500/25 border border-rose-500/30 px-1.5 py-0.5 rounded-lg">관심 {deal.buyerInterestCount}명</span>}
                        </div>
                      </div>
                      <div className="p-3">
                        <p className="text-[12px] font-bold text-white line-clamp-1 mb-0.5">{deal.assetType}</p>
                        <p className="text-[10px] text-slate-500 line-clamp-1 mb-2">{deal.address}</p>
                        <p className="text-[15px] font-extrabold" style={{ color: accent }}>{fmt(deal.price)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Section>
          )}

          {/* 투자자 심리 */}
          <Section delay={0.2}>
            <div className="rounded-2xl border border-white/8 p-4" style={{ background: "rgba(255,255,255,0.025)" }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-base">🌡️</span>
                  <h3 className="text-[12px] font-bold text-white">CRE 투자자 심리 지수</h3>
                </div>
                <span className={`text-[11px] font-bold ${sc.text}`}>{sentiment.status}</span>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-[11px] text-slate-400">Fear &amp; Greed</span>
                  <span className="text-[18px] font-extrabold text-white">{sentiment.score}<span className="text-[12px] font-normal text-slate-500">/100</span></span>
                </div>
                <div className="relative h-2.5 bg-white/5 rounded-full overflow-hidden">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${sentiment.score}%` }} transition={{ duration: 1.2, ease: "easeOut" }} className={`h-full rounded-full bg-gradient-to-r ${sc.bar}`} />
                  <motion.div initial={{ left: 0 }} animate={{ left: `calc(${sentiment.score}% - 4px)` }} transition={{ duration: 1.2, ease: "easeOut" }} className="absolute top-1/2 -translate-y-1/2 w-2 h-4 bg-white rounded-full shadow-lg shadow-white/30" />
                </div>
                <div className="flex justify-between text-[9px] text-slate-600">
                  <span>극단 공포</span><span>중립 50</span><span>극단 탐욕</span>
                </div>
              </div>
            </div>
          </Section>

          {/* 뉴스 피드 */}
          {Array.isArray(data.topNews) && data.topNews.length > 0 && (
            <Section delay={0.25}>
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 mb-3">
                  <Newspaper className="w-3.5 h-3.5 text-slate-400" />
                  <h3 className="text-[12px] font-bold text-white">오늘의 CRE 뉴스</h3>
                  <div className="ml-auto"><DataBadge type="realtime" /></div>
                </div>
                {(data.topNews as any[]).slice(0, 6).map((n, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-xl border border-white/6" style={{ background: "rgba(255,255,255,0.025)" }}>
                    <div className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${n.sentiment === "bullish" ? "bg-emerald-400" : n.sentiment === "bearish" ? "bg-rose-400" : "bg-slate-400"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-bold text-white leading-snug mb-0.5 line-clamp-2">{String(n.title ?? "").replace(/^\[.*?\]\s*/, "")}</p>
                      <p className="text-[10px] text-slate-500 line-clamp-1">{n.summary}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-[9px] text-slate-600">{n.source}</p>
                        {n.topic && <span className="text-[8px] text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded">{n.topic}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* 경매 픽 */}
          {Array.isArray(data.auctionPicks) && data.auctionPicks.length > 0 && (
            <Section delay={0.3}>
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 mb-3">
                  <Hammer className="w-3.5 h-3.5 text-amber-400" />
                  <h3 className="text-[12px] font-bold text-white">이 주의 경매 픽</h3>
                  <span className="ml-auto text-[9px] font-bold text-amber-300 bg-amber-500/12 border border-amber-500/20 px-2 py-0.5 rounded-full">NPL 소싱</span>
                </div>
                {(data.auctionPicks as any[]).map((a, i) => (
                  <div key={i} className="rounded-xl border border-amber-500/12 p-3.5" style={{ background: "rgba(245,158,11,0.04)" }}>
                    <div className="flex justify-between items-start mb-2">
                      <p className="text-[12px] font-bold text-white flex-1 mr-2 leading-snug">{a.address}</p>
                      {a.discountPct > 0 && <span className="text-[10px] font-extrabold text-rose-300 bg-rose-500/15 border border-rose-500/25 px-2 py-0.5 rounded-lg shrink-0">-{a.discountPct}%</span>}
                    </div>
                    {/* 할인율 프로그레스 바 */}
                    {a.discountPct > 0 && (
                      <div className="mb-2">
                        <div className="flex justify-between text-[9px] text-slate-500 mb-1">
                          <span>최저입찰가 {fmt(a.minimumBid)}</span>
                          <span>감정가 {fmt(a.appraisedValue)}</span>
                        </div>
                        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-amber-500 to-rose-500 rounded-full" style={{ width: `${100 - a.discountPct}%` }} />
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-3 text-[10px] text-slate-400">
                      <span className="text-amber-400 font-bold">{a.auctionDate}</span>
                      <span>·</span>
                      <span>{a.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* 브로커 프로필 */}
          <Section delay={0.35}>
            <div className="rounded-2xl overflow-hidden border border-white/8" style={{ background: `linear-gradient(135deg, ${accent}12, rgba(15,15,35,0.9))` }}>
              <div className="p-4">
                <p className="text-[10px] font-bold tracking-wider mb-3" style={{ color: accent }}>BROKER PROFILE</p>
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full border-2 flex items-center justify-center shrink-0" style={{ borderColor: `${accent}44`, background: `linear-gradient(135deg, ${accent}, #8b5cf6)` }}>
                    <span className="text-white font-extrabold text-lg">{String(broker.name ?? "B").charAt(0)}</span>
                  </div>
                  <div>
                    <p className="text-[14px] font-extrabold text-white">{broker.name}</p>
                    <p className="text-[11px] text-slate-400">{broker.company}</p>
                    {broker.tagline && <p className="text-[11px] text-slate-500 mt-0.5 italic">&ldquo;{broker.tagline}&rdquo;</p>}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {[{ label: "누적 거래", value: `${broker.totalDeals}건`, color: "text-indigo-300" }, { label: "활성 매물", value: `${broker.activeDeals}건`, color: "text-emerald-300" }, { label: "전문 자산", value: (broker.specialtyAssets as string[])?.[0] ?? "꼬마빌딩", color: "text-amber-300" }].map((s, i) => (
                    <div key={i} className="text-center bg-white/4 border border-white/8 rounded-xl py-2">
                      <p className={`text-[14px] font-extrabold ${s.color}`}>{s.value}</p>
                      <p className="text-[9px] text-slate-500 mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>
                {broker.phone && (
                  <button onClick={handleCallBroker} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-[13px] text-white transition-all duration-300 active:scale-95" style={{ background: `linear-gradient(135deg, ${accent}, #8b5cf6)` }}>
                    <Phone className="w-4 h-4" />{broker.phone} 상담하기
                  </button>
                )}
              </div>
            </div>
          </Section>

          {/* 리포트 */}
          {Array.isArray(data.reports) && data.reports.length > 0 && (
            <Section delay={0.4}>
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 mb-3">
                  <Globe className="w-3.5 h-3.5 text-indigo-400" />
                  <h3 className="text-[12px] font-bold text-white">전문 리서치 리포트</h3>
                </div>
                {(data.reports as any[]).map((r, i) => (
                  <a key={i} href={r.url} target="_blank" rel="noreferrer" className="group flex items-start gap-3 p-3.5 rounded-xl border border-white/6 hover:border-indigo-500/25 transition-all duration-300" style={{ background: "rgba(255,255,255,0.02)" }}>
                    <BookOpen className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold text-indigo-400 mb-0.5">{r.institution}</p>
                      <p className="text-[11px] font-bold text-white line-clamp-1">{r.title}</p>
                      <p className="text-[10px] text-slate-500 line-clamp-2 mt-0.5 leading-relaxed">{r.summary}</p>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-indigo-400 transition-colors shrink-0 mt-0.5" />
                  </a>
                ))}
              </div>
            </Section>
          )}
        </div>
      </div>

      {/* ── 고정 하단 바 ──────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-50 px-4 py-3" style={{ background: "linear-gradient(to top, rgba(8,8,20,0.98) 0%, rgba(8,8,20,0.9) 70%, transparent 100%)", backdropFilter: "blur(12px)" }}>
        <div className="max-w-[440px] mx-auto flex gap-2">
          {broker.phone && (
            <button onClick={handleCallBroker} className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-[13px] text-white transition-all duration-300 active:scale-95" style={{ background: `linear-gradient(135deg, ${accent}, #8b5cf6)`, boxShadow: `0 4px 20px ${accent}66` }}>
              <Phone className="w-4 h-4" />{broker.phone} 상담
            </button>
          )}
          <button onClick={handleShare} className="flex items-center justify-center gap-1.5 px-4 py-3.5 rounded-2xl border border-white/15 font-bold text-[12px] text-white transition-all duration-300 active:scale-95" style={{ background: "rgba(255,255,255,0.06)" }}>
            {copied ? (<><Check className="w-4 h-4 text-emerald-400" /><span className="text-emerald-400">복사됨</span></>) : (<><Share2 className="w-4 h-4" /><span>공유</span></>)}
          </button>
        </div>
      </div>
    </div>
  );
}
