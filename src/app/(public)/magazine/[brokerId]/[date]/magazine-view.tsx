"use client";

import React, { useState, useRef } from "react";
import { motion, useInView } from "motion/react";
import {
  Phone,
  Share2,
  Check,
  Building2,
  Hammer,
  Globe,
  BookOpen,
  ArrowRight,
  Sparkles,
  Newspaper,
} from "lucide-react";

interface MagazineViewProps {
  data: Record<string, any>;
  brokerId: string;
  date: string;
}

function fmt(price: number): string {
  if (!price) return "-";
  if (price >= 100000000) return `${(price / 100000000).toFixed(1)}\uC5B5`;
  if (price >= 10000) return `${(price / 10000).toFixed(0)}\uB9CC`;
  return price.toLocaleString();
}

function Section({
  children,
  delay = 0,
}: {
  children: React.ReactNode;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

function RichBriefing({ text }: { text: string }) {
  const paras = text.split(/\n{1,2}/).filter(Boolean);
  return (
    <div className="space-y-3">
      {paras.map((para, i) => {
        const isHeading =
          /^[\u1F300-\u1FFFF\u2600-\u27FF]/.test(para) ||
          /^\*\*.*\*\*$/.test(para.trim());
        const html = para
          .replace(
            /\*\*(.*?)\*\*/g,
            '<strong class="text-white font-bold">$1</strong>'
          )
          .replace(
            /(\d[\d,.]+%)/g,
            '<span class="text-indigo-300 font-bold font-mono">$1</span>'
          )
          .replace(
            /(\d[\d,.]+\uC5B5)/g,
            '<span class="text-emerald-300 font-bold">$1</span>'
          );

        if (isHeading)
          return (
            <p
              key={i}
              className="text-[14px] font-extrabold text-white leading-snug pt-1"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          );
        return (
          <p
            key={i}
            className="text-[12px] text-slate-300 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      })}
    </div>
  );
}

function sentimentColor(score: number) {
  if (score >= 70)
    return { bar: "from-orange-500 to-rose-500", text: "text-rose-400" };
  if (score >= 50)
    return { bar: "from-emerald-500 to-teal-400", text: "text-emerald-400" };
  return { bar: "from-blue-600 to-cyan-400", text: "text-blue-400" };
}

export function MagazineView({ data, brokerId, date }: MagazineViewProps) {
  const [copied, setCopied] = useState(false);
  const broker = (data.broker as Record<string, any>) ?? {};
  const [y, m, d] = date.split("-");
  const dateLabel = `${y}\uB144 ${m}\uC6D4 ${d}\uC77C`;
  const weekdays = [
    "\uC77C",
    "\uC6D4",
    "\uD654",
    "\uC218",
    "\uBAA9",
    "\uAE08",
    "\uD1A0",
  ];
  const weekday = weekdays[new Date(date).getDay()];
  const sentiment = (data.sentiment as any) ?? {
    score: 62,
    status: "\ud0d0\uc695 \uc6b0\uc138",
  };
  const sc = sentimentColor(sentiment.score);

  const handleShare = async () => {
    const shareUrl =
      typeof window !== "undefined"
        ? `${window.location.href}`
        : `/magazine/${brokerId}/${date}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: `[${broker.name}] CRE \ub370\uc77c\ub9ac \ub9e4\uac70\uc9c4 ${dateLabel}`,
          text:
            (data.headline as string | undefined) ??
            "\uc624\ub298\uc758 \uaf2c\ub9c8\ube4c\ub529 \uc2dc\uc7a5 AI \uc778\ud154\ub9ac\uc804\uc2a4",
          url: shareUrl,
        });
        return;
      } catch { /* fallback */ }
    }
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleCallBroker = () => {
    if (broker.phone)
      window.location.href = `tel:${String(broker.phone).replace(/[^0-9]/g, "")}`;
  };

  return (
    <div
      className="min-h-screen w-full"
      style={{
        background:
          "linear-gradient(180deg, #050510 0%, #0a0a1a 40%, #080814 100%)",
      }}
    >
      <div className="max-w-[440px] mx-auto px-4 pb-28">
        {/* ── HERO ─────────────────────────────────────────────────────────── */}
        <div
          className="relative pt-10 pb-8 px-1"
          style={{
            background:
              "linear-gradient(160deg, rgba(99,102,241,0.12) 0%, transparent 55%)",
          }}
        >
          <div
            className="absolute top-0 right-0 w-48 h-48 rounded-full blur-3xl opacity-20 pointer-events-none"
            style={{
              background: "radial-gradient(circle, #6366f1, transparent)",
            }}
          />

          {/* 브로커 뱃지 */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2.5 mb-6"
          >
            <div
              className="w-10 h-10 rounded-full border-2 border-indigo-500/40 flex items-center justify-center shrink-0"
              style={{
                background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
              }}
            >
              <span className="text-white font-extrabold text-base">
                {String(broker.name ?? "B").charAt(0)}
              </span>
            </div>
            <div>
              <p className="text-[13px] font-bold text-white">{broker.name}</p>
              <p className="text-[10px] text-slate-500">{broker.company}</p>
            </div>
            <div className="ml-auto flex items-center gap-1 bg-indigo-500/15 border border-indigo-500/25 px-2.5 py-1 rounded-full">
              <Sparkles className="w-2.5 h-2.5 text-indigo-400" />
              <span className="text-[9px] font-bold text-indigo-300">
                AI \uAC1C\uC778\uD654
              </span>
            </div>
          </motion.div>

          {/* 날짜 + 타이틀 */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
          >
            <p className="text-[12px] text-slate-500 mb-1.5">
              {dateLabel} {weekday}\uC694\uC77C
            </p>
            <h1 className="text-[26px] font-extrabold text-white leading-tight tracking-tight mb-2">
              CRE \uB370\uC77C\uB9AC \uB9E4\uAC70\uC9C4
            </h1>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {((broker.specialtyRegions as string[] | undefined) ?? []).map(
                (r: string, i: number) => (
                  <span
                    key={i}
                    className="text-[10px] font-bold text-indigo-300 bg-indigo-500/12 border border-indigo-500/20 px-2.5 py-0.5 rounded-full"
                  >
                    {r}
                  </span>
                )
              )}
            </div>
          </motion.div>

          {/* 핵심 수치 */}
          {data.keyStats && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.15 }}
              className="mt-5 grid grid-cols-3 gap-2"
            >
              {(data.keyStats as any[]).map((stat, i) => {
                const cls: Record<string, string> = {
                  emerald:
                    "text-emerald-400 border-emerald-500/20 bg-emerald-500/8",
                  indigo: "text-indigo-400 border-indigo-500/20 bg-indigo-500/8",
                  rose: "text-rose-400 border-rose-500/20 bg-rose-500/8",
                  amber: "text-amber-400 border-amber-500/20 bg-amber-500/8",
                  slate: "text-slate-400 border-slate-500/20 bg-slate-500/8",
                };
                const c = cls[stat.accent] ?? "text-slate-400 border-white/10 bg-white/4";
                return (
                  <div
                    key={i}
                    className={`border rounded-xl p-2.5 text-center ${c}`}
                  >
                    <div className="text-[15px] font-extrabold leading-none mb-1">
                      {stat.value}
                    </div>
                    <div className="text-[9px] opacity-70">{stat.label}</div>
                  </div>
                );
              })}
            </motion.div>
          )}
        </div>

        {/* ── 섹션들 ────────────────────────────────────────────────────────── */}
        <div className="space-y-5">
          {/* AI 브리핑 */}
          <Section delay={0.05}>
            <div
              className="rounded-2xl border border-indigo-500/15 overflow-hidden"
              style={{
                background:
                  "linear-gradient(135deg, rgba(99,102,241,0.07) 0%, rgba(15,15,35,0.8) 100%)",
              }}
            >
              <div className="px-4 py-3 border-b border-white/5 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                <span className="text-[11px] font-bold text-indigo-300">
                  AI \uB9C8\uCF13 \uC5D0\uB514\uD130 \uBE0C\uB9AC\uD551
                </span>
              </div>
              {data.headline && (
                <div className="px-4 pt-4">
                  <h2 className="text-[16px] font-extrabold text-white leading-snug">
                    {data.headline as string}
                  </h2>
                </div>
              )}
              <div className="p-4">
                <RichBriefing text={(data.briefing as string | undefined) ?? ""} />
              </div>
            </div>
          </Section>

          {/* 딜카드 하이라이트 */}
          {Array.isArray(data.dealHighlights) &&
            data.dealHighlights.length > 0 && (
              <Section delay={0.1}>
                <div className="space-y-3">
                  <div className="flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-rose-400" />
                    <h3 className="text-[12px] font-bold text-white">
                      \uAD00\uB9AC \uB9E4\uBB3C \uD558\uC774\uB77C\uC774\uD2B8
                    </h3>
                    <span className="ml-auto text-[10px] font-bold text-rose-300 bg-rose-500/12 border border-rose-500/20 px-2 py-0.5 rounded-full">
                      \uD65C\uC131 {data.dealHighlights.length}\uAC74
                    </span>
                  </div>
                  <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory">
                    {(data.dealHighlights as any[]).map((deal, i) => (
                      <div
                        key={i}
                        className="shrink-0 w-[200px] snap-start rounded-2xl border border-white/8 overflow-hidden"
                        style={{ background: "rgba(255,255,255,0.03)" }}
                      >
                        <div
                          className="w-full h-[110px] relative"
                          style={{
                            background: deal.photoUrl
                              ? `url('${deal.photoUrl}') center/cover`
                              : "linear-gradient(135deg, #1e1b4b, #312e81)",
                          }}
                        >
                          {!deal.photoUrl && (
                            <div className="w-full h-full flex items-center justify-center">
                              <Building2 className="w-8 h-8 text-indigo-400/40" />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                          <div className="absolute bottom-2 left-2.5 right-2.5 flex justify-between items-end">
                            <span className="text-[10px] font-bold text-white/80 bg-black/40 px-1.5 py-0.5 rounded-lg">
                              {deal.areaSignal}
                            </span>
                            {deal.buyerInterestCount > 0 && (
                              <span className="text-[9px] font-bold text-rose-300 bg-rose-500/25 border border-rose-500/30 px-1.5 py-0.5 rounded-lg">
                                \uAD00\uC2EC {deal.buyerInterestCount}\uBA85
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="p-2.5">
                          <p className="text-[11px] font-bold text-white line-clamp-1 mb-0.5">
                            {deal.assetType}
                          </p>
                          <p className="text-[10px] text-slate-500 line-clamp-1 mb-1.5">
                            {deal.address}
                          </p>
                          <p className="text-[13px] font-extrabold text-indigo-300">
                            {fmt(deal.price)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Section>
            )}

          {/* 투자자 심리 */}
          <Section delay={0.15}>
            <div
              className="rounded-2xl border border-white/8 p-4"
              style={{ background: "rgba(255,255,255,0.025)" }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-base">🌡️</span>
                  <h3 className="text-[12px] font-bold text-white">
                    CRE \uD22C\uC790\uC790 \uC2EC\uB9AC \uC9C0\uC218
                  </h3>
                </div>
                <span className={`text-[11px] font-bold ${sc.text}`}>
                  {sentiment.status}
                </span>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-[11px] text-slate-400">
                    Fear &amp; Greed
                  </span>
                  <span className="text-[18px] font-extrabold text-white">
                    {sentiment.score}
                    <span className="text-[12px] font-normal text-slate-500">
                      /100
                    </span>
                  </span>
                </div>
                <div className="relative h-2.5 bg-white/5 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${sentiment.score}%` }}
                    transition={{ duration: 1.2, ease: "easeOut" }}
                    className={`h-full rounded-full bg-gradient-to-r ${sc.bar}`}
                  />
                  <motion.div
                    initial={{ left: 0 }}
                    animate={{ left: `calc(${sentiment.score}% - 4px)` }}
                    transition={{ duration: 1.2, ease: "easeOut" }}
                    className="absolute top-1/2 -translate-y-1/2 w-2 h-4 bg-white rounded-full shadow-lg shadow-white/30"
                  />
                </div>
                <div className="flex justify-between text-[9px] text-slate-600">
                  <span>\uADF9\uB2E8 \uACF5\uD3EC</span>
                  <span>\uC911\uB9BD 50</span>
                  <span>\uADF9\uB2E8 \uD0D0\uC695</span>
                </div>
              </div>
            </div>
          </Section>

          {/* 뉴스 피드 */}
          {Array.isArray(data.topNews) && data.topNews.length > 0 && (
            <Section delay={0.2}>
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 mb-3">
                  <Newspaper className="w-3.5 h-3.5 text-slate-400" />
                  <h3 className="text-[12px] font-bold text-white">
                    \uC624\uB298\uC758 CRE \uB274\uC2A4
                  </h3>
                </div>
                {(data.topNews as any[]).slice(0, 4).map((n, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 p-3 rounded-xl border border-white/6"
                    style={{ background: "rgba(255,255,255,0.025)" }}
                  >
                    <div
                      className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${
                        n.sentiment === "bullish"
                          ? "bg-emerald-400"
                          : n.sentiment === "bearish"
                          ? "bg-rose-400"
                          : "bg-slate-400"
                      }`}
                    />
                    <div>
                      <p className="text-[11px] font-bold text-white leading-snug mb-0.5 line-clamp-2">
                        {String(n.title ?? "").replace(/^\[.*?\]\s*/, "")}
                      </p>
                      <p className="text-[10px] text-slate-500 line-clamp-1">
                        {n.summary}
                      </p>
                      <p className="text-[9px] text-slate-600 mt-0.5">
                        {n.source}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* 경매 픽 */}
          {Array.isArray(data.auctionPicks) && data.auctionPicks.length > 0 && (
            <Section delay={0.25}>
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 mb-3">
                  <Hammer className="w-3.5 h-3.5 text-amber-400" />
                  <h3 className="text-[12px] font-bold text-white">
                    \uC774 \uC8FC\uC758 \uACBD\uB9E4 \uD53D
                  </h3>
                  <span className="ml-auto text-[9px] font-bold text-amber-300 bg-amber-500/12 border border-amber-500/20 px-2 py-0.5 rounded-full">
                    NPL \uC18C\uC2F1
                  </span>
                </div>
                {(data.auctionPicks as any[]).map((a, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-amber-500/12 p-3.5"
                    style={{ background: "rgba(245,158,11,0.04)" }}
                  >
                    <div className="flex justify-between items-start mb-1.5">
                      <p className="text-[12px] font-bold text-white flex-1 mr-2 leading-snug">
                        {a.address}
                      </p>
                      {a.discountPct > 0 && (
                        <span className="text-[10px] font-extrabold text-rose-300 bg-rose-500/15 border border-rose-500/25 px-2 py-0.5 rounded-lg shrink-0">
                          -{a.discountPct}%
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-slate-400 flex-wrap">
                      <span>
                        \uCD5C\uC800\uC785\uCC30\uAC00 {fmt(a.minimumBid)}
                      </span>
                      <span>·</span>
                      <span className="text-amber-400 font-bold">
                        {a.auctionDate}
                      </span>
                      <span>·</span>
                      <span>{a.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* 바이브카드 미니 */}
          <Section delay={0.3}>
            <div
              className="rounded-2xl overflow-hidden border border-white/8"
              style={{
                background:
                  "linear-gradient(135deg, rgba(99,102,241,0.09), rgba(15,15,35,0.9))",
              }}
            >
              <div className="p-4">
                <p className="text-[10px] font-bold text-indigo-400 mb-3 tracking-wider">
                  BROKER PROFILE
                </p>
                <div className="flex items-start gap-3 mb-4">
                  <div
                    className="w-12 h-12 rounded-full border-2 border-indigo-500/30 flex items-center justify-center shrink-0"
                    style={{
                      background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                    }}
                  >
                    <span className="text-white font-extrabold text-lg">
                      {String(broker.name ?? "B").charAt(0)}
                    </span>
                  </div>
                  <div>
                    <p className="text-[14px] font-extrabold text-white">
                      {broker.name}
                    </p>
                    <p className="text-[11px] text-slate-400">{broker.company}</p>
                    {broker.tagline && (
                      <p className="text-[11px] text-slate-500 mt-0.5 italic">
                        &ldquo;{broker.tagline}&rdquo;
                      </p>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {[
                    {
                      label: "\uB204\uC801 \uAC70\uB798",
                      value: `${broker.totalDeals}\uAC74`,
                      color: "text-indigo-300",
                    },
                    {
                      label: "\uD65C\uC131 \uB9E4\uBB3C",
                      value: `${broker.activeDeals}\uAC74`,
                      color: "text-emerald-300",
                    },
                    {
                      label: "\uC804\uBB38 \uC790\uC0B0",
                      value:
                        (broker.specialtyAssets as string[] | undefined)?.[0] ??
                        "\uAF2C\uB9C8\uBE4C\uB529",
                      color: "text-amber-300",
                    },
                  ].map((s, i) => (
                    <div
                      key={i}
                      className="text-center bg-white/4 border border-white/8 rounded-xl py-2"
                    >
                      <p
                        className={`text-[14px] font-extrabold ${s.color}`}
                      >
                        {s.value}
                      </p>
                      <p className="text-[9px] text-slate-500 mt-0.5">
                        {s.label}
                      </p>
                    </div>
                  ))}
                </div>
                {broker.phone && (
                  <button
                    onClick={handleCallBroker}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-[13px] text-white transition-all duration-300 active:scale-95"
                    style={{
                      background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                    }}
                  >
                    <Phone className="w-4 h-4" />
                    {broker.phone} \uC0C1\uB2F4\uD558\uAE30
                  </button>
                )}
              </div>
            </div>
          </Section>

          {/* 글로벌 리포트 */}
          {Array.isArray(data.reports) && data.reports.length > 0 && (
            <Section delay={0.35}>
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 mb-3">
                  <Globe className="w-3.5 h-3.5 text-indigo-400" />
                  <h3 className="text-[12px] font-bold text-white">
                    \uC804\uBB38 \uB9AC\uC11C\uCE58 \uB9AC\uD3EC\uD2B8
                  </h3>
                </div>
                {(data.reports as any[]).map((r, i) => (
                  <a
                    key={i}
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="group flex items-start gap-3 p-3.5 rounded-xl border border-white/6 hover:border-indigo-500/25 transition-all duration-300"
                    style={{ background: "rgba(255,255,255,0.02)" }}
                  >
                    <BookOpen className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold text-indigo-400 mb-0.5">
                        {r.institution}
                      </p>
                      <p className="text-[11px] font-bold text-white line-clamp-1">
                        {r.title}
                      </p>
                      <p className="text-[10px] text-slate-500 line-clamp-2 mt-0.5 leading-relaxed">
                        {r.summary}
                      </p>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-indigo-400 transition-colors shrink-0 mt-0.5" />
                  </a>
                ))}
              </div>
            </Section>
          )}
        </div>
      </div>

      {/* ── 고정 하단 바 ─────────────────────────────────────────────────────── */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 px-4 py-3"
        style={{
          background:
            "linear-gradient(to top, rgba(8,8,20,0.98) 0%, rgba(8,8,20,0.9) 70%, transparent 100%)",
          backdropFilter: "blur(12px)",
        }}
      >
        <div className="max-w-[440px] mx-auto flex gap-3">
          {broker.phone && (
            <button
              onClick={handleCallBroker}
              className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-[13px] text-white transition-all duration-300 active:scale-95"
              style={{
                background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                boxShadow: "0 4px 20px rgba(99,102,241,0.4)",
              }}
            >
              <Phone className="w-4 h-4" />
              {broker.phone} \uC0C1\uB2F4
            </button>
          )}
          <button
            onClick={handleShare}
            className="flex items-center justify-center gap-1.5 px-5 py-3.5 rounded-2xl border border-white/15 font-bold text-[12px] text-white transition-all duration-300 active:scale-95"
            style={{ background: "rgba(255,255,255,0.06)" }}
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                <span className="text-emerald-400">
                  \uBCF5\uC0AC\uB428
                </span>
              </>
            ) : (
              <>
                <Share2 className="w-4 h-4" />
                <span>\uACF5\uC720</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
