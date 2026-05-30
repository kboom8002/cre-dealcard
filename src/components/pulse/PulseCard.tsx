"use client";

import Link from "next/link";

interface Props {
  id: string;
  region: string;
  periodLabel: string;
  pulseScore: number;
  trend: "up" | "flat" | "down";
  summaryKo: string;
  keyFindings: string[];
  seoSlug: string | null;
}

const REGION_LABELS: Record<string, string> = {
  gbd: "GBD", ybd: "YBD", cbd: "CBD",
  seongsu: "성수", pangyo: "판교", mapo: "마포", jongno: "종로", hongdae: "홍대",
};

function trendDisplay(trend: string) {
  if (trend === "up") return { emoji: "📈", label: "상승", color: "text-emerald-400" };
  if (trend === "down") return { emoji: "📉", label: "하락", color: "text-red-400" };
  return { emoji: "➡️", label: "보합", color: "text-slate-400" };
}

function scoreColor(score: number) {
  if (score >= 70) return "text-emerald-400";
  if (score >= 40) return "text-amber-400";
  return "text-red-400";
}

export default function PulseCard({
  id, region, periodLabel, pulseScore, trend, summaryKo, keyFindings, seoSlug,
}: Props) {
  const t = trendDisplay(trend);
  const href = seoSlug ? `/pulse/${region}/${periodLabel}` : `/pulse/${region}/${periodLabel}`;

  return (
    <Link
      href={href}
      className="block bg-[#131b2e] border border-slate-800 rounded-2xl p-4 hover:border-indigo-500/30 hover:bg-[#161f33] transition-all group"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 px-2.5 py-0.5 rounded-full">
            📡 {REGION_LABELS[region] ?? region}
          </span>
          <span className="text-[9px] text-slate-600">{periodLabel}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`text-xs font-bold ${scoreColor(pulseScore)}`}>
            {pulseScore}
          </span>
          <span className={`text-[10px] ${t.color}`}>
            {t.emoji} {t.label}
          </span>
        </div>
      </div>

      {/* Pulse Score Bar */}
      <div className="w-full h-1.5 bg-slate-800 rounded-full mb-3 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            pulseScore >= 70
              ? "bg-gradient-to-r from-emerald-500 to-emerald-400"
              : pulseScore >= 40
                ? "bg-gradient-to-r from-amber-500 to-amber-400"
                : "bg-gradient-to-r from-red-500 to-red-400"
          }`}
          style={{ width: `${pulseScore}%` }}
        />
      </div>

      {/* Summary */}
      <p className="text-[11px] text-slate-300 line-clamp-2 mb-2 leading-relaxed">
        {summaryKo}
      </p>

      {/* Key Findings */}
      {keyFindings.length > 0 && (
        <div className="space-y-1 mb-2">
          {keyFindings.slice(0, 2).map((f, i) => (
            <p key={i} className="text-[9px] text-slate-500 flex items-start gap-1">
              <span className="text-indigo-500 mt-0.5">•</span>
              <span className="line-clamp-1">{f}</span>
            </p>
          ))}
        </div>
      )}

      <p className="text-[9px] text-indigo-500 group-hover:translate-x-0.5 transition-transform">
        상세 펄스 보기 →
      </p>
    </Link>
  );
}
