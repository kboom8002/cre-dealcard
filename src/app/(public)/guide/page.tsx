import type { Metadata } from "next";
import Link from "next/link";
import { faqPage } from "@/lib/schema-org";

export const metadata: Metadata = {
  title: "상업용 부동산 가이드 & FAQ | DealCard Hub",
  description:
    "상업용 부동산 매각·매입·임대의 모든 것. AI 블라인드 딜카드, Gate 시스템, 매칭 엔진까지 전문가 가이드.",
};

const GUIDES = [
  {
    icon: "💰",
    title: "상업용 부동산 매각 가이드",
    items: [
      "매각 준비도 점검으로 건물의 현재 상태를 진단합니다.",
      "블라인드 딜카드를 생성하여 건물 정보를 보호하면서 매수자를 탐색합니다.",
      "3단계 Gate 시스템(G1→G2→G3)으로 진지한 매수자만 선별합니다.",
      "AI 매칭 엔진이 적합한 매수자를 S/A/B/C 등급으로 자동 분류합니다.",
      "NDA 체결 후 Full IM(Information Memorandum)을 통해 상세 정보를 제공합니다.",
    ],
  },
  {
    icon: "🎯",
    title: "상업용 부동산 매입 가이드",
    items: [
      "매수 조건(지역, 자산유형, 예산, 투자 목적)을 등록합니다.",
      "AI가 등록된 블라인드 딜카드 중 적합한 매물을 자동 추천합니다.",
      "블라인드 상태에서 기본 정보(권역, 자산유형, 가격대)를 확인합니다.",
      "Gate 요청을 통해 상세 정보 열람 의사를 표시합니다.",
      "NDA 체결 후 정확한 주소, 재무 정보, 법률 현황을 확인합니다.",
    ],
  },
  {
    icon: "🏢",
    title: "임대 공간 찾기 가이드",
    items: [
      "원하는 용도(오피스, 리테일, F&B, 물류)를 선택합니다.",
      "권역별 임대 가능 공간을 블라인드 검색합니다.",
      "예산(보증금/월차임), 면적, 층수 등 필터로 조건에 맞는 공간을 탐색합니다.",
      "관심 공간에 대해 상세 정보 요청을 합니다.",
      "담당 중개사가 현장 안내 및 계약 조건 조율을 진행합니다.",
    ],
  },
];

const FAQS = [
  { question: "블라인드 딜카드란 무엇인가요?", answer: "블라인드 딜카드는 건물의 정확한 주소, 소유자 정보 없이 권역, 자산유형, 가격대, 투자 포인트만 공개하는 매물 소개 카드입니다. 매도자의 정보를 보호하면서 매수자의 관심을 확인할 수 있는 DealCard의 핵심 기능입니다." },
  { question: "Gate 시스템은 어떻게 작동하나요?", answer: "Gate 시스템은 3단계(G1→G2→G3)로 구성됩니다. G1은 기본 관심 표시, G2는 NDA 체결 후 상세 정보 열람, G3는 실사(Due Diligence) 단계입니다. 각 단계마다 매도자의 승인이 필요하며, 이를 통해 무분별한 정보 유출을 방지합니다." },
  { question: "AI 매칭 엔진은 어떤 기준으로 매칭하나요?", answer: "DealCard의 AI 매칭 엔진은 지역 적합도, 자산유형 적합도, 예산 범위, 투자 목적, 시장 타이밍 등 다양한 요소를 종합적으로 분석하여 S(최적합)/A(우수)/B(양호)/C(참고) 등급으로 매칭 결과를 제공합니다." },
  { question: "매각 준비도 점검은 무료인가요?", answer: "네, AI 기반 매각 준비도 점검은 무료로 제공됩니다. 건물의 기본 정보를 입력하면 18개 항목에 대한 준비 상태를 자동 진단하고, Full IM(Information Memorandum) 작성 가능 여부를 알려드립니다." },
  { question: "상업용 부동산 중개 수수료는 어떻게 되나요?", answer: "상업용 부동산의 법정 중개 수수료는 거래 금액의 0.4~0.9%입니다. DealCard를 통한 거래에서도 동일한 수수료 체계가 적용되며, 수수료율은 매물 규모와 거래 조건에 따라 중개인과 협의합니다." },
  { question: "DealCard에 매물을 등록하려면 어떻게 하나요?", answer: "DealCard는 검증된 상업용 부동산 중개인만 매물을 등록할 수 있습니다. 중개인 계정으로 로그인 후 '딜카드 만들기' 기능으로 건물 정보를 입력하면 AI가 블라인드 딜카드를 자동 생성합니다." },
  { question: "정보 유출 걱정은 없나요?", answer: "DealCard는 Disclosure Guard 기술로 민감 정보를 자동 감지하고 블라인드 처리합니다. 정확한 주소, 소유자 정보, 임차인 상호 등은 NDA 체결 전까지 절대 노출되지 않습니다." },
  { question: "AI 시세 리포트는 정확한가요?", answer: "AI 시세 리포트는 DealCard에 등록된 블라인드 매물 데이터와 매수 의향 데이터를 기반으로 자동 생성됩니다. 참고용 시장 분석 자료이며, 실제 거래 가격이나 감정평가를 대체하지 않습니다." },
  { question: "CasePack이란 무엇인가요?", answer: "CasePack은 딜카드의 투자 분석 데이터를 8개 블록으로 구조화한 패키지입니다. 시장 분석, 재무 분석, 리스크 분석 등을 포함하며, 매수자에게 체계적인 투자 검토 자료를 제공합니다." },
  { question: "해외 투자자도 이용할 수 있나요?", answer: "현재 DealCard는 한국 상업용 부동산 시장에 특화되어 있습니다. 해외 투자자의 경우 한국 내 중개인을 통해 서비스를 이용할 수 있으며, 향후 다국어 지원을 계획하고 있습니다." },
];

export default function GuidePage() {
  const faqSchema = faqPage(FAQS);

  return (
    <main className="min-h-screen bg-[#0b0f19] text-slate-100">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      <header className="sticky top-0 z-40 bg-[#0d1424]/80 backdrop-blur-md border-b border-slate-800 px-4 py-4">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <h1 className="text-base font-extrabold text-white">📖 상업용 부동산 가이드</h1>
          <Link href="/hub" className="text-xs text-slate-400 hover:text-white">← Hub</Link>
        </div>
      </header>

      <div className="max-w-md mx-auto px-4 py-6 space-y-6">
        {/* Guides */}
        {GUIDES.map((guide, gi) => (
          <div key={gi} className="bg-[#131b2e] border border-slate-800 rounded-2xl p-5 space-y-3">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <span className="text-lg">{guide.icon}</span> {guide.title}
            </h2>
            <ol className="space-y-2">
              {guide.items.map((item, i) => (
                <li key={i} className="flex gap-2.5 text-xs text-slate-300 leading-relaxed">
                  <span className="text-blue-400 font-bold shrink-0">{i + 1}.</span>
                  {item}
                </li>
              ))}
            </ol>
          </div>
        ))}

        {/* FAQ */}
        <div className="space-y-3">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-1">
            ❓ 자주 묻는 질문 (FAQ)
          </h2>
          {FAQS.map((faq, i) => (
            <details
              key={i}
              className="bg-[#131b2e] border border-slate-800 rounded-xl group"
            >
              <summary className="px-4 py-3.5 text-xs font-semibold text-white cursor-pointer list-none flex justify-between items-center">
                <span>Q: {faq.question}</span>
                <span className="text-slate-500 group-open:rotate-180 transition-transform">▾</span>
              </summary>
              <div className="px-4 pb-4 text-xs text-slate-400 leading-relaxed border-t border-slate-800 pt-3">
                A: {faq.answer}
              </div>
            </details>
          ))}
        </div>

        {/* CTA */}
        <div className="text-center space-y-3 pt-4">
          <Link
            href="/building-radar"
            className="inline-flex items-center gap-2 bg-white text-slate-900 font-semibold rounded-xl px-6 py-3 text-sm shadow-lg hover:shadow-xl transition-all"
          >
            🔍 무료 AI 딜 검진 시작하기
          </Link>
          <p className="text-[10px] text-slate-500">
            건물 정보를 입력하면 AI가 딜 가능성을 무료로 분석합니다.
          </p>
        </div>
      </div>
    </main>
  );
}
