"use client";

import Link from "next/link";
import { CRE_DISCLAIMER } from "@/domain/agora/ai-answer-generator";
import ServiceMatchSection from "@/components/vendor/ServiceMatchSection";
import type { ServiceCardData } from "@/components/vendor/ServiceCard";

interface DealCardPreview {
  id: string;
  area_signal: string | null;
  asset_type: string | null;
  price_band: string | null;
}

interface Props {
  aiAnswer: string;
  matchedDeals?: DealCardPreview[];
  matchedServices?: ServiceCardData[];
  marketReportRegion?: string | null;
  relatedThreads?: { id: string; category: string; title: string }[];
}

const REGION_LABELS: Record<string, string> = {
  gbd: "GBD", ybd: "YBD", cbd: "CBD",
  seongsu: "성수", pangyo: "판교",
  mapo: "마포", jongno: "종로", hongdae: "홍대",
};

export default function AgoraAiAnswer({
  aiAnswer,
  matchedDeals = [],
  matchedServices = [],
  marketReportRegion,
  relatedThreads = [],
}: Props) {
  // 면책 조항 분리 (항상 마지막에 붙어 있음)
  const disclaimerStart = aiAnswer.indexOf(CRE_DISCLAIMER);
  const mainContent = disclaimerStart > -1
    ? aiAnswer.slice(0, disclaimerStart).trim()
    : aiAnswer;

  // 마크다운 간단 렌더링
  function renderMarkdown(text: string) {
    return text
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\n/g, "<br />");
  }

  return (
    <div className="space-y-5">
      {/* AI 답변 본문 */}
      <div className="bg-gradient-to-br from-[#0d1829] to-[#0b1220] border border-blue-500/20 rounded-2xl p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-xl">
            🤖
          </div>
          <div>
            <div className="text-sm font-bold text-white flex items-center gap-1.5">
              DealCard AI
              <span className="text-blue-400 text-xs">✓</span>
            </div>
            <div className="text-[10px] text-blue-400 font-bold uppercase tracking-wider">
              AI 큐레이션 답변
            </div>
          </div>
        </div>

        {/* 답변 본문 */}
        <div
          className="text-sm text-slate-300 leading-relaxed space-y-2"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(mainContent) }}
        />

        {/* 면책 조항 (항상 표시) */}
        <div className="mt-5 pt-4 border-t border-blue-500/10">
          <p className="text-[10px] text-slate-600 leading-relaxed">
            {CRE_DISCLAIMER}
          </p>
        </div>
      </div>

      {/* 관련 딜카드 매칭 */}
      {matchedDeals.length > 0 && (
        <div className="bg-[#131b2e] border border-slate-800 rounded-2xl p-5">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">
            🏢 관련 블라인드 딜카드
          </p>
          <div className="grid grid-cols-3 gap-2">
            {matchedDeals.map((deal) => (
              <Link
                key={deal.id}
                href={`/deal/${deal.area_signal ?? "all"}/${deal.id}`}
                className="bg-[#0b0f19] border border-slate-700 rounded-xl p-3 hover:border-blue-500/40 hover:bg-[#0d1424] transition-all group"
              >
                <p className="text-[9px] font-bold text-blue-400 mb-1">
                  {REGION_LABELS[deal.area_signal ?? ""] ?? deal.area_signal ?? "전국"}
                </p>
                <p className="text-[10px] font-semibold text-white line-clamp-1">
                  {deal.asset_type ?? "상업용"}
                </p>
                <p className="text-[9px] text-slate-500 mt-0.5">
                  {deal.price_band ?? "협의"}
                </p>
                <p className="text-[9px] text-blue-500 mt-1.5 group-hover:translate-x-0.5 transition-transform">
                  상세 보기 →
                </p>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* 관련 전문 서비스 (Vendor 서비스 카드) */}
      <ServiceMatchSection serviceCards={matchedServices} />

      {/* 시세 리포트 링크 */}
      {marketReportRegion && (
        <Link
          href={`/market/${marketReportRegion}`}
          className="flex items-center gap-3 bg-[#131b2e] border border-slate-800 rounded-2xl p-4 hover:border-purple-500/30 hover:bg-[#161f33] transition-all group"
        >
          <div className="text-2xl">📊</div>
          <div className="flex-1">
            <p className="text-xs font-bold text-white">
              {REGION_LABELS[marketReportRegion] ?? marketReportRegion} 시세 리포트
            </p>
            <p className="text-[10px] text-slate-500">AI 기반 권역 시장 분석 보기</p>
          </div>
          <span className="text-purple-400 group-hover:translate-x-0.5 transition-transform">→</span>
        </Link>
      )}

      {/* 관련 질문 */}
      {relatedThreads.length > 0 && (
        <div className="bg-[#131b2e] border border-slate-800 rounded-2xl p-5">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">
            💬 관련 질문
          </p>
          <div className="space-y-2">
            {relatedThreads.map((t) => (
              <Link
                key={t.id}
                href={`/agora/${t.category}/${t.id}`}
                className="flex items-center gap-2 text-xs text-slate-400 hover:text-white transition-colors"
              >
                <span className="text-slate-700">•</span>
                <span className="line-clamp-1">{t.title}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
