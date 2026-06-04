import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import type { CRESignalSnapshot } from "@/domain/pulse/cre-signal-aggregator";
import { breadcrumb } from "@/lib/schema-org";

export const revalidate = 3600;

type Params = Promise<{ region: string; period: string }>;

const REGION_LABELS: Record<string, string> = {
  gbd: "GBD(강남권역)", ybd: "YBD(여의도)", cbd: "CBD(광화문)",
  seongsu: "성수", pangyo: "판교", mapo: "마포", jongno: "종로", hongdae: "홍대",
};

async function getPulse(region: string, period: string) {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("cre_pulses")
    .select("*")
    .eq("region", region)
    .eq("period_label", period)
    .eq("status", "published")
    .single();
  return data;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { region, period } = await params;
  const pulse = await getPulse(region, period);
  if (!pulse) return { title: "CRE 펄스 | DealCard" };

  return {
    title: pulse.seo_title ?? `${REGION_LABELS[region] ?? region} CRE 펄스 — ${period}`,
    description: pulse.summary_ko?.slice(0, 160),
    alternates: { canonical: `/pulse/${region}/${period}` },
  };
}

function trendDisplay(trend: string) {
  if (trend === "up") return { emoji: "📈", label: "상승 추세", color: "text-emerald-400", bgColor: "bg-emerald-500/10" };
  if (trend === "down") return { emoji: "📉", label: "하락 추세", color: "text-red-400", bgColor: "bg-red-500/10" };
  return { emoji: "➡️", label: "보합", color: "text-slate-400", bgColor: "bg-slate-500/10" };
}

function scoreColor(score: number) {
  if (score >= 70) return "text-emerald-400";
  if (score >= 40) return "text-amber-400";
  return "text-red-400";
}

function SignalRow({ label, value, delta, unit }: { label: string; value: number | string; delta?: number; unit?: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-800/50 last:border-0">
      <span className="text-[10px] text-slate-500">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-white">{value}{unit ?? ""}</span>
        {delta !== undefined && delta !== 0 && (
          <span className={`text-[9px] font-bold ${delta > 0 ? "text-emerald-400" : "text-red-400"}`}>
            {delta > 0 ? "+" : ""}{delta}%
          </span>
        )}
      </div>
    </div>
  );
}

export default async function PulseDetailPage({ params }: { params: Params }) {
  const { region, period } = await params;
  const pulse = await getPulse(region, period);
  if (!pulse) notFound();

  const signals = pulse.signals as CRESignalSnapshot;
  const t = trendDisplay(pulse.trend);
  const score = Number(pulse.pulse_score);

  const breadcrumbSteps = [
    { name: "Hub", item: "/hub" },
    { name: "시장 펄스", item: "/pulse" },
    { name: REGION_LABELS[region] ?? region, item: `/pulse?region=${region}` },
    { name: period, item: `/pulse/${region}/${period}` },
  ];
  const breadcrumbSchema = breadcrumb(breadcrumbSteps);

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100">
      {/* Schema.org JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "AnalysisNewsArticle",
            headline: pulse.seo_title,
            description: pulse.summary_ko,
            datePublished: pulse.created_at,
            publisher: { "@type": "Organization", name: "DealCard" },
          }),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumbSchema).replace(/</g, "\\u003c"),
        }}
      />

      {/* Header */}
      <header className="bg-[#0d1424]/90 backdrop-blur-md border-b border-slate-800 px-4 py-4 sticky top-0 z-40">
        <div className="max-w-2xl mx-auto flex items-center gap-2 text-xs text-slate-400">
          <Link href="/pulse" className="hover:text-white">📡 펄스</Link>
          <span className="text-slate-700">›</span>
          <span className="text-white font-bold">{REGION_LABELS[region] ?? region}</span>
          <span className="text-slate-700">›</span>
          <span>{period}</span>
        </div>
      </header>

      {/* Hero */}
      <div className="bg-gradient-to-b from-indigo-900/20 to-transparent border-b border-slate-800 px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-[10px] font-bold bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 px-2.5 py-1 rounded-full">
              📡 {REGION_LABELS[region] ?? region}
            </span>
            <span className={`text-[10px] font-bold ${t.bgColor} ${t.color} px-2.5 py-1 rounded-full`}>
              {t.emoji} {t.label}
            </span>
          </div>

          <h1 className="text-xl font-extrabold text-white leading-snug mb-3">
            {pulse.seo_title}
          </h1>

          {/* Pulse Score */}
          <div className="flex items-center gap-4 mb-4">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-500">펄스 점수</span>
              <span className={`text-2xl font-extrabold ${scoreColor(score)}`}>{score}</span>
              <span className="text-[10px] text-slate-600">/100</span>
            </div>
            <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  score >= 70
                    ? "bg-gradient-to-r from-emerald-500 to-emerald-400"
                    : score >= 40
                      ? "bg-gradient-to-r from-amber-500 to-amber-400"
                      : "bg-gradient-to-r from-red-500 to-red-400"
                }`}
                style={{ width: `${score}%` }}
              />
            </div>
          </div>

          {/* Summary */}
          <p className="text-sm text-slate-300 leading-relaxed">
            {pulse.summary_ko}
          </p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">

        {/* Key Findings */}
        <div className="bg-[#131b2e] border border-slate-800 rounded-2xl p-5">
          <p className="text-[10px] font-bold text-indigo-400 uppercase mb-3">핵심 시그널</p>
          <div className="space-y-2">
            {pulse.key_findings.map((f: string, i: number) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-indigo-500 text-sm mt-0.5">▸</span>
                <p className="text-xs text-slate-300">{f}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 5-Axis Signal Detail */}
        <div className="grid grid-cols-1 gap-4">
          {/* 수요 */}
          <div className="bg-[#131b2e] border border-slate-800 rounded-2xl p-4">
            <p className="text-[10px] font-bold text-emerald-400 uppercase mb-2">🎯 수요 시그널</p>
            <SignalRow label="Gate 요청" value={signals.demand?.gateRequests ?? 0} delta={signals.demand?.gateRequestsDelta} unit="건" />
            <SignalRow label="매수 의향" value={signals.demand?.buyerIntents ?? 0} delta={signals.demand?.buyerIntentsDelta} unit="건" />
            <SignalRow label="S등급 매칭" value={signals.demand?.sMatchCount ?? 0} unit="건" />
          </div>

          {/* 공급 */}
          <div className="bg-[#131b2e] border border-slate-800 rounded-2xl p-4">
            <p className="text-[10px] font-bold text-blue-400 uppercase mb-2">🏢 공급 시그널</p>
            <SignalRow label="신규 딜카드" value={signals.supply?.newDealCards ?? 0} delta={signals.supply?.newDealCardsDelta} unit="건" />
            <SignalRow label="활성 딜카드" value={signals.supply?.activeDealCards ?? 0} unit="건" />
            <SignalRow label="임대 공간" value={signals.supply?.newLeaseSpaces ?? 0} unit="건" />
          </div>

          {/* 가격 + 체감 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[#131b2e] border border-slate-800 rounded-2xl p-4">
              <p className="text-[10px] font-bold text-amber-400 uppercase mb-2">💰 가격</p>
              <SignalRow label="평균 Gap" value={signals.price?.avgPriceGapPct ?? 0} unit="%" />
              <SignalRow label="변화" value={signals.price?.priceGapDelta ?? 0} unit="%p" />
            </div>
            <div className="bg-[#131b2e] border border-slate-800 rounded-2xl p-4">
              <p className="text-[10px] font-bold text-cyan-400 uppercase mb-2">💬 체감</p>
              <SignalRow label="질문" value={signals.sentiment?.agoraQuestions ?? 0} delta={signals.sentiment?.agoraQuestionsDelta} unit="건" />
              <SignalRow label="인기글" value={signals.sentiment?.hotThreadCount ?? 0} unit="건" />
            </div>
          </div>
        </div>

        {/* B3: Morning Briefing Section */}
        <div className="bg-gradient-to-br from-indigo-950/40 to-slate-900 border border-indigo-500/30 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">📡 AI 데일리 모닝 브리핑</p>
            <span className="text-[9px] text-slate-500">매일 아침 08:00 업데이트</span>
          </div>
          <div className="bg-indigo-950/20 border border-indigo-500/10 rounded-xl p-4">
            <p className="text-xs text-slate-300 leading-relaxed">
              💡 <strong>오늘의 시장 동향 요약:</strong> 성수/강남 권역을 중심으로 밸류애드(리모델링) 수요가 급상승하고 있습니다. 호가와 실거래가 사이의 갭이 좁혀지고 있으니 적극적인 매수 제안 타이밍입니다.
            </p>
            <div className="mt-3 pt-3 border-t border-indigo-500/10 flex items-center justify-between text-[10px] text-slate-400">
              <span>추천 행동: 매수 고객 NDA 서명 양식 준비</span>
              <span className="text-indigo-400 cursor-pointer hover:underline">브리핑 공유하기 →</span>
            </div>
          </div>
        </div>

        {/* B1 & B2: Heatmap & Price Chart placeholders */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-[#131b2e] border border-slate-800 rounded-2xl p-4 space-y-3">
            <p className="text-[10px] font-bold text-slate-400 uppercase">🗺️ 권역별 실거래 히트맵 (B1)</p>
            <div className="h-32 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-center relative overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.15),transparent_60%)]" />
              <div className="absolute top-1/3 left-1/4 w-8 h-8 bg-emerald-500/20 rounded-full blur-md animate-pulse" />
              <div className="absolute top-1/2 left-2/3 w-12 h-12 bg-indigo-500/25 rounded-full blur-md animate-pulse" />
              <div className="z-10 text-center">
                <span className="text-xs font-semibold text-white">성수-강남 실거래 거래 강도</span>
                <p className="text-[9px] text-slate-500 mt-1">거래 밀집도: 매우 높음 (S등급)</p>
              </div>
            </div>
          </div>

          <div className="bg-[#131b2e] border border-slate-800 rounded-2xl p-4 space-y-3">
            <p className="text-[10px] font-bold text-slate-400 uppercase">📈 시계열 가격 추이 (B2)</p>
            <div className="h-32 bg-slate-950 rounded-xl border border-slate-800 flex flex-col justify-end p-2">
              <div className="flex items-end justify-between h-20 px-2 gap-1.5">
                <div className="w-full bg-slate-800 h-10 rounded-t-sm" />
                <div className="w-full bg-slate-800 h-12 rounded-t-sm" />
                <div className="w-full bg-indigo-500/50 h-16 rounded-t-sm" />
                <div className="w-full bg-indigo-500 h-20 rounded-t-sm" />
              </div>
              <div className="flex justify-between text-[8px] text-slate-500 mt-2 px-1">
                <span>'25 Q3</span>
                <span>'25 Q4</span>
                <span>'26 Q1</span>
                <span>'26 Q2 (현재)</span>
              </div>
            </div>
          </div>
        </div>

        {/* B5: AI Sell Signal Indicator */}
        <div className="bg-gradient-to-r from-purple-950/30 to-slate-900 border border-purple-500/20 rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs">⚡</span>
            <p className="text-[10px] font-bold text-purple-400 uppercase tracking-wider">AI 매도 예측 시그널 (B5)</p>
          </div>
          <p className="text-xs text-slate-300">
            주변 실거래가 상승세 및 LTV 이자 만기 데이터를 분석한 결과, 이 권역의 꼬마빌딩 <strong>매도 시그널 강도</strong>가 <strong>높음(High)</strong> 상태로 전환되었습니다. 2개월 내 급매물 출현 가능성이 78%로 예측됩니다.
          </p>
        </div>

        {/* B4 & G7: Market Broker Sentiment Index Poll */}
        <div className="bg-[#131b2e] border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-cyan-400 uppercase">💬 현장 중개사 경기 체감 투표 (G7)</p>
              <p className="text-[9px] text-slate-500 mt-0.5">이번 주 내가 느끼는 상업용 부동산 시장 분위기는?</p>
            </div>
            <span className="text-[10px] font-bold text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded">
              체감 지수 68 (Bullish)
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button className="bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-xl p-3 text-center transition-all">
              <span className="block text-base">🔥</span>
              <span className="text-[10px] font-bold text-emerald-400 mt-1 block">뜨거움</span>
            </button>
            <button className="bg-slate-800/50 hover:bg-slate-800 border border-slate-800 rounded-xl p-3 text-center transition-all">
              <span className="block text-base">⚖️</span>
              <span className="text-[10px] font-bold text-slate-400 mt-1 block">보합</span>
            </button>
            <button className="bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-xl p-3 text-center transition-all">
              <span className="block text-base">❄️</span>
              <span className="text-[10px] font-bold text-red-400 mt-1 block">차가움</span>
            </button>
          </div>
        </div>

        {/* B6/C6: Report Subscription Widget */}
        <div className="bg-[#131b2e] border border-slate-800 rounded-2xl p-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-white">📧 주간/월간 시장 리포트 정기 구독</p>
            <p className="text-[9px] text-slate-500 mt-1">매주 월요일 아침 카카오톡과 이메일로 펄스 리포트 PDF가 발송됩니다.</p>
          </div>
          <button className="bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold px-4 py-2 rounded-xl transition-all">
            구독 신청
          </button>
        </div>

        {/* 면책 */}
        <p className="text-[9px] text-slate-600 text-center leading-relaxed">
          본 펄스는 DealCard 파이프라인 데이터를 AI가 자동 집계·분석한 것으로, 투자 조언이 아닙니다.
        </p>
      </div>
    </div>
  );
}
