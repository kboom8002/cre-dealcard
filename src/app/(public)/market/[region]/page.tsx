import type { Metadata } from "next";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { faqPage } from "@/lib/schema-org";

const REGION_MAP: Record<string, string> = {
  gbd: "GBD (강남권역)", ybd: "YBD (여의도권역)", cbd: "CBD (종로/을지로)",
  seongsu: "성수", pangyo: "판교", mapo: "마포/홍대", jongno: "종로", hongdae: "홍대",
  all: "전체 시장",
};

interface PageProps { params: Promise<{ region: string }> }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { region } = await params;
  const label = REGION_MAP[region] || region;
  const now = new Date();
  const period = `${now.getFullYear()}년 ${now.getMonth() + 1}월`;
  return {
    title: `${label} 상업용 부동산 시세 리포트 ${period} | DealCard`,
    description: `${label} 권역의 ${period} 시세 리포트. 오피스·리테일 평균 가격, 거래 건수, 매수 수요 동향.`,
    openGraph: { title: `${label} 시세 리포트 — DealCard Hub` },
  };
}

export const revalidate = 86400; // daily

export default async function MarketReportPage({ params }: PageProps) {
  const { region } = await params;
  const label = REGION_MAP[region] || region;
  const supabase = createServiceClient();
  const now = new Date();
  const period = `${now.getFullYear()}년 ${now.getMonth() + 1}월`;

  // Aggregate data
  let query = supabase
    .from("building_ssot_lite")
    .select("id, area_signal, asset_type, price_band, status");

  if (region !== "all") {
    query = query.ilike("area_signal", `%${region}%`);
  }

  const { data: buildings } = await query;
  const items = buildings ?? [];
  const activeCount = items.filter((b) => b.status === "active").length;

  // Match demand
  const { count: matchDemand } = await supabase
    .from("buyer_intent_lite")
    .select("*", { count: "exact", head: true });

  // FAQ for AEO
  const faqs = [
    {
      question: `${label} 오피스 빌딩 시세는 얼마인가요?`,
      answer: `${period} 기준 ${label} 권역에는 ${items.length}건의 매물이 등록되어 있으며, 블라인드 딜카드를 통해 실제 거래 가격대를 확인할 수 있습니다.`,
    },
    {
      question: `${label}에서 상업용 부동산을 매각하려면 어떻게 해야 하나요?`,
      answer: `DealCard의 '매각 준비도 점검' 기능으로 무료 진단을 받은 후, 블라인드 딜카드를 생성하여 매수자 풀에 자동 매칭할 수 있습니다. 건물 주소, 소유자 정보는 3단계 Gate 시스템으로 보호됩니다.`,
    },
    {
      question: `${label} 상업용 부동산 매수 수요는 어떤가요?`,
      answer: `현재 DealCard에 등록된 매수 의향은 ${matchDemand ?? 0}건이며, AI 매칭 엔진이 매물-매수자 적합도를 S/A/B/C 등급으로 자동 분류합니다.`,
    },
  ];

  const faqSchema = faqPage(faqs);

  return (
    <main className="min-h-screen bg-[#0b0f19] text-slate-100">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      <header className="sticky top-0 z-40 bg-[#0d1424]/80 backdrop-blur-md border-b border-slate-800 px-4 py-4">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-base font-extrabold text-white">📊 {label} 시세 리포트</h1>
            <p className="text-[10px] text-slate-400">{period} 기준</p>
          </div>
          <Link href="/hub" className="text-xs text-slate-400 hover:text-white">← Hub</Link>
        </div>
      </header>

      <div className="max-w-md mx-auto px-4 py-6 space-y-5">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "등록 매물", value: `${items.length}건`, icon: "📋", color: "text-blue-400" },
            { label: "활성 딜", value: `${activeCount}건`, icon: "🔥", color: "text-green-400" },
            { label: "매수 수요", value: `${matchDemand ?? 0}건`, icon: "🎯", color: "text-purple-400" },
            { label: "데이터 기준", value: period, icon: "📅", color: "text-slate-400" },
          ].map((s, i) => (
            <div key={i} className="bg-[#131b2e] border border-slate-800 rounded-xl p-4 text-center">
              <span className="text-lg">{s.icon}</span>
              <p className={`text-lg font-bold ${s.color} mt-1`}>{s.value}</p>
              <p className="text-[10px] text-slate-500 font-medium">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Highlights */}
        <div className="bg-[#131b2e] border border-slate-800 rounded-2xl p-5 space-y-3">
          <h2 className="text-sm font-bold text-white flex items-center gap-1.5">💡 주요 동향</h2>
          <ul className="space-y-2 text-xs text-slate-300">
            <li className="flex items-start gap-2">
              <span className="text-blue-400 shrink-0">▸</span>
              {label} 권역에 {items.length}건의 블라인드 매물이 등록되어 있습니다.
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-400 shrink-0">▸</span>
              매수 의향 {matchDemand ?? 0}건으로, {activeCount > 0 ? "매도자 우위" : "균형"} 시장으로 판단됩니다.
            </li>
            <li className="flex items-start gap-2">
              <span className="text-purple-400 shrink-0">▸</span>
              AI 매칭 시스템으로 S/A 등급 매칭률을 높이고 있습니다.
            </li>
          </ul>
        </div>

        {/* FAQ (AEO Optimized) */}
        <div className="bg-[#131b2e] border border-slate-800 rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-bold text-white flex items-center gap-1.5">❓ 자주 묻는 질문</h2>
          {faqs.map((faq, i) => (
            <div key={i} className="space-y-1.5">
              <h3 className="text-xs font-semibold text-white">Q: {faq.question}</h3>
              <p className="text-xs text-slate-400 leading-relaxed">A: {faq.answer}</p>
              {i < faqs.length - 1 && <hr className="border-slate-800 mt-3" />}
            </div>
          ))}
        </div>

        {/* Disclaimer */}
        <div className="bg-[#121824] border border-slate-800 rounded-xl p-3.5">
          <p className="text-[10px] text-slate-500 leading-relaxed">
            이 리포트는 DealCard에 등록된 블라인드 매물 데이터를 기반으로 자동 생성되었습니다.
            실제 거래 가격, 수익률, 법률/세무 사항을 확정하지 않습니다.
          </p>
        </div>

        <div className="text-center">
          <Link href={`/deal/${region}`} className="text-xs text-primary hover:underline">
            📋 {label} 매물 목록 보기 →
          </Link>
        </div>
      </div>
    </main>
  );
}
