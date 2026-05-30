"use client";

import { useState } from "react";

// ── Types (mirrored from domain for client use) ─────────────────────
export interface BrokerCardContent {
  type: string;
  title: string;
  subtitle: string;
  stats: Array<{ label: string; value: string; icon: string }>;
  highlights: string[];
  ctas: Array<{ label: string; href: string; icon: string }>;
  kakaoText: string;
}

// ── Gradient Map ────────────────────────────────────────────────────
const GRADIENTS: Record<string, string> = {
  seller:  "from-blue-600 to-blue-400",
  buyer:   "from-purple-600 to-purple-400",
  tenant:  "from-emerald-600 to-emerald-400",
  network: "from-amber-600 to-amber-400",
  owner:   "from-slate-600 to-slate-400",
};

const TYPE_LABELS: Record<string, string> = {
  seller:  "매도 전문",
  buyer:   "매수 매칭",
  tenant:  "임대 전문",
  network: "네트워크",
  owner:   "자산 관리",
};

// ── Main Card Template ──────────────────────────────────────────────
export function BrokerCardTemplate({
  card,
  brokerName,
  type,
}: {
  card: BrokerCardContent;
  brokerName: string;
  type: string;
}) {
  const gradient = GRADIENTS[type] || GRADIENTS.seller;
  const typeLabel = TYPE_LABELS[type] || type;

  return (
    <div
      className="w-full max-w-sm mx-auto rounded-2xl overflow-hidden shadow-2xl border border-slate-200/10 bg-white"
      id={`broker-card-${type}`}
    >
      {/* ── Gradient Header ── */}
      <div className={`bg-gradient-to-r ${gradient} px-6 py-6 text-white`}>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-xl font-bold">
            {brokerName.charAt(0)}
          </div>
          <div>
            <h3 className="text-lg font-bold leading-tight">{brokerName}</h3>
            <span className="text-xs font-medium bg-white/20 px-2 py-0.5 rounded-full">
              {typeLabel}
            </span>
          </div>
        </div>
        <p className="text-sm text-white/90 leading-relaxed">{card.subtitle}</p>
      </div>

      {/* ── Stats Grid ── */}
      <div className="grid grid-cols-2 gap-3 px-6 py-5 bg-slate-50">
        {card.stats.map((stat, i) => (
          <div
            key={i}
            className="bg-white rounded-xl p-3 border border-slate-100 shadow-sm text-center"
          >
            <span className="text-lg">{stat.icon}</span>
            <p className="text-lg font-bold text-slate-800 mt-1">{stat.value}</p>
            <p className="text-[10px] text-slate-500 font-medium">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* ── Highlights ── */}
      <div className="px-6 py-4 space-y-2 border-t border-slate-100">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">핵심 강점</p>
        {card.highlights.map((h, i) => (
          <p key={i} className="text-xs text-slate-600 flex items-start gap-2 leading-relaxed">
            <span className="text-green-500 shrink-0">✓</span>
            {h}
          </p>
        ))}
      </div>

      {/* ── CTA Buttons ── */}
      <div className="px-6 pb-6 space-y-2">
        {card.ctas.map((cta, i) => (
          <a
            key={i}
            href={cta.href}
            className={`flex items-center justify-center gap-2 w-full rounded-xl py-3 text-sm font-semibold transition-all active:scale-[0.98] ${
              i === 0
                ? `bg-gradient-to-r ${gradient} text-white shadow-lg`
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            <span>{cta.icon}</span>
            {cta.label}
          </a>
        ))}
      </div>

      {/* ── Footer Badge ── */}
      <div className="bg-slate-50 border-t border-slate-100 px-6 py-3 text-center">
        <p className="text-[10px] text-slate-400 font-medium">
          Powered by <span className="font-bold text-slate-500">DealCard</span> · 데이터 기반 검증
        </p>
      </div>
    </div>
  );
}

// ── Kakao Copy Button ───────────────────────────────────────────────
export function BrokerCardKakaoCopy({ kakaoText }: { kakaoText: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(kakaoText);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = kakaoText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="w-full flex items-center justify-center gap-2 bg-yellow-400 hover:bg-yellow-500 text-yellow-900 font-semibold rounded-xl py-3 text-sm transition-colors active:scale-[0.98]"
      id="cta-copy-broker-kakao"
    >
      {copied ? "✅ 복사됨!" : "💬 카카오톡 문구 복사"}
    </button>
  );
}
