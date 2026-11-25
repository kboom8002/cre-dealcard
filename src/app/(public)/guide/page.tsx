import type { Metadata } from "next";
import Link from "next/link";
import { serializeJsonLd, faqPage } from "@/lib/schema-org";
import { getCanonicalSiteUrl } from "@/lib/site-url";

const SITE_URL = getCanonicalSiteUrl();
const DEFAULT_OG_IMAGE = `${SITE_URL}/og-default.png?v=2`;

export const metadata: Metadata = {
  title: "크리딜 사용 안내 · 4대 작업공간",
  description:
    "부동산뉴스·딜카드·IM·고객 소통 4대 작업공간과 3단계 업무 흐름으로 상업용 부동산 중개 영업을 한눈에 확인하세요.",
  openGraph: {
    title: "크리딜 사용 안내 · 4대 작업공간 | 크리딜 (CREDEAL)",
    description:
      "부동산뉴스·딜카드·IM·고객 소통 4대 작업공간과 3단계 업무 흐름으로 상업용 부동산 중개 영업을 한눈에 확인하세요.",
    siteName: "크리딜 (CREDEAL)",
    images: [{ url: DEFAULT_OG_IMAGE, width: 1200, height: 630, alt: "크리딜 사용 안내" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "크리딜 사용 안내 · 4대 작업공간 | 크리딜 (CREDEAL)",
    description:
      "부동산뉴스·딜카드·IM·고객 소통 4대 작업공간과 3단계 업무 흐름으로 상업용 부동산 중개 영업을 한눈에 확인하세요.",
    images: [DEFAULT_OG_IMAGE],
  },
};

const WORKSPACES = [
  {
    order: "01",
    name: "부동산뉴스",
    role: "접점 유지",
    accentHex: "#059669",
    pillBg: "#ECFDF5",
    pillText: "#065F46",
    summary:
      "매수자·건물주에게 일간·주간·월간 시장 브리핑과 출처가 붙은 핵심 이슈 5선, 추천 매물을 보내 안부를 잇습니다.",
  },
  {
    order: "02",
    name: "딜카드",
    role: "관심 유도",
    accentHex: "#B45309",
    pillBg: "#FFFBEB",
    pillText: "#92400E",
    summary:
      "거친 현장 메모를 붙여넣어 정확한 지번은 가린 1장 블라인드 매물 요약을 만들고 카카오톡으로 바로 공유합니다.",
  },
  {
    order: "03",
    name: "IM",
    role: "신뢰 설득",
    accentHex: "#1D4ED8",
    pillBg: "#EFF6FF",
    pillText: "#1E40AF",
    summary:
      "건축물·토지 공적장부와 층별 임대현황(렌트롤), 기대수익률 분석이 담긴 상세 제안서(웹 링크·PPTX·PDF)를 완성합니다.",
  },
  {
    order: "04",
    name: "고객 소통",
    role: "반응 회수",
    accentHex: "#BE185D",
    pillBg: "#FDF2F8",
    pillText: "#9D174D",
    summary:
      "내가 보낸 딜카드·IM·부동산뉴스를 누가 몇 번 열어봤는지 전용 열람 링크로 확인하고 맞춤 후속 안내를 보냅니다.",
  },
] as const;

const THREE_STEPS = [
  {
    step: "1단계",
    title: "왼쪽에서 선택",
    description:
      "작업할 매물·뉴스·고객을 목록에서 고르거나 [새로 만들기]로 새 작업을 시작합니다.",
  },
  {
    step: "2단계",
    title: "가운데에서 입력 · AI 정리",
    description:
      "현장 메모나 주소, 임대현황을 넣으면 공적장부와 AI 초안이 자동으로 채워집니다.",
  },
  {
    step: "3단계",
    title: "오른쪽에서 확인 · 전달",
    description:
      "고객 휴대폰 화면과 미리보기를 확인한 뒤 카카오톡·전용 열람 링크·PPTX로 바로 보냅니다.",
  },
] as const;

const FAQS = [
  {
    question: "딜카드를 보내면 정확한 건물 주소가 노출되지 않나요?",
    answer:
      "네. 딜카드는 권역·용도·규모·가격대와 핵심 장점만 담는 블라인드 매물 요약입니다. 정확한 번지와 상세 임대내역은 진성 매수 의사가 확인된 고객에게만 IM으로 전달해 중개권을 안전하게 지킬 수 있습니다.",
  },
  {
    question: "IM 제안서 작성에 필요한 공적장부와 수익 분석은 어떻게 채우나요?",
    answer:
      "1단계에서 지번이나 도로명 주소를 입력하면 건축물대장·토지대장 정보를 자동으로 불러옵니다. 2단계 층별 임대현황에 엑셀 렌트롤을 올리거나 입력하면 현행 수익률과 기대수익률이 자동 계산됩니다.",
  },
  {
    question: "고객이 내가 보낸 자료를 열어봤는지 알 수 있나요?",
    answer:
      "네. 딜카드·IM·부동산뉴스는 고객별 전용 열람 링크로 전달할 수 있어, [고객 소통] 화면에서 누가 어떤 자료를 몇 번 열람했는지 확인하고 바로 후속 연락을 이어갈 수 있습니다.",
  },
  {
    question: "상업용 부동산 중개보수 기준은 어떻게 되나요?",
    answer:
      "상업용 부동산(주택 외 중개대상물)의 법정 중개보수는 공인중개사법 시행규칙 제20조 제4항에 따라 거래금액의 0.9%(1천분의 9) 이내에서 중개의뢰인과 개업공인중개사가 협의하여 결정합니다.",
  },
];

export default function GuidePage() {
  const faqSchema = faqPage(FAQS);

  return (
    <main className="min-h-screen bg-[#F5F5F7] text-[#1D1D1F]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(faqSchema) }}
      />

      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 py-3.5">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <Link
            href="/"
            className="inline-flex min-h-[44px] items-center gap-2 text-base font-extrabold text-[#1D1D1F]"
          >
            <span>크리딜 사용 안내</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/broker/tutorial"
              className="inline-flex min-h-[44px] items-center rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-3.5 py-2 text-sm font-bold text-[#1D1D1F] transition-colors"
            >
              회원용 상세 사용법
            </Link>
            <Link
              href="/login"
              className="inline-flex min-h-[44px] items-center rounded-xl bg-[#1D4ED8] hover:bg-[#1E40AF] px-4 py-2 text-sm font-bold text-white transition-colors"
            >
              시작하기
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
        {/* Hero */}
        <section className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-2xs space-y-4">
          <p className="text-sm font-bold text-[#1D4ED8]">상업용 부동산 중개 업무 안내</p>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#1D1D1F] leading-snug break-keep">
            4개 공간과 3단계 흐름으로
            <br className="hidden sm:inline" /> 영업 준비를 한 번에 끝냅니다
          </h1>
          <p className="text-base font-medium text-[#515154] leading-relaxed break-keep">
            크리딜은{" "}
            <strong className="font-bold text-[#1D1D1F]">
              부동산뉴스 → 딜카드 → IM → 고객 소통
            </strong>
            의 실제 영업 순서에 맞춘 4대 작업공간으로 구성되어 있습니다.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Link
              href="/login"
              className="inline-flex min-h-[48px] items-center justify-center rounded-xl bg-[#1D4ED8] hover:bg-[#1E40AF] px-6 py-3 text-base font-bold text-white shadow-xs transition-colors"
            >
              시작하기
            </Link>
            <Link
              href="/broker/tutorial"
              className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-5 py-3 text-base font-bold text-[#1D1D1F] transition-colors"
            >
              회원용 상세 사용법 보기
            </Link>
          </div>
        </section>

        {/* 4 Workspaces */}
        <section aria-labelledby="guide-workspaces-heading" className="space-y-4">
          <div className="px-1 space-y-1">
            <p className="text-sm font-bold text-[#515154]">1. 4대 작업공간</p>
            <h2 id="guide-workspaces-heading" className="text-xl font-extrabold text-[#1D1D1F]">
              영업 흐름 그대로 연결되는 4개 공간
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {WORKSPACES.map((space) => (
              <article
                key={space.order}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-2.5"
                style={{ borderLeftWidth: "5px", borderLeftColor: space.accentHex }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-extrabold text-[#515154]">{space.order}</span>
                    <h3 className="text-lg font-extrabold text-[#1D1D1F]">{space.name}</h3>
                  </div>
                  <span
                    className="rounded-full px-2.5 py-0.5 text-sm font-bold"
                    style={{ backgroundColor: space.pillBg, color: space.pillText }}
                  >
                    {space.role}
                  </span>
                </div>
                <p className="text-sm sm:text-base font-medium text-[#3A3A3C] leading-relaxed break-keep">
                  {space.summary}
                </p>
              </article>
            ))}
          </div>
        </section>

        {/* 3-Step Workflow */}
        <section
          aria-labelledby="guide-workflow-heading"
          className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-7 shadow-2xs space-y-4"
        >
          <div className="space-y-1">
            <p className="text-sm font-bold text-[#515154]">2. 공통 3단계 흐름</p>
            <h2 id="guide-workflow-heading" className="text-xl font-extrabold text-[#1D1D1F]">
              어느 공간에 들어가도 같은 3단계로 작업합니다
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {THREE_STEPS.map((item) => (
              <div
                key={item.step}
                className="rounded-2xl border border-slate-200 bg-[#F5F5F7]/70 p-4 space-y-2"
              >
                <span className="inline-block rounded-lg bg-white border border-slate-200 px-2.5 py-1 text-sm font-extrabold text-[#1D4ED8]">
                  {item.step}
                </span>
                <p className="text-base font-extrabold text-[#1D1D1F]">{item.title}</p>
                <p className="text-sm font-medium text-[#3A3A3C] leading-relaxed break-keep">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section aria-labelledby="guide-faq-heading" className="space-y-3">
          <div className="px-1 space-y-1">
            <p className="text-sm font-bold text-[#515154]">3. 자주 묻는 질문</p>
            <h2 id="guide-faq-heading" className="text-xl font-extrabold text-[#1D1D1F]">
              핵심 궁금증 안내
            </h2>
          </div>

          <div className="space-y-2.5">
            {FAQS.map((faq, i) => (
              <details
                key={i}
                className="bg-white border border-slate-200 rounded-2xl group shadow-2xs"
              >
                <summary className="px-5 py-3.5 text-base font-bold text-[#1D1D1F] cursor-pointer list-none flex justify-between items-center min-h-[52px]">
                  <span className="break-keep">
                    Q{i + 1}. {faq.question}
                  </span>
                  <span className="text-[#515154] group-open:rotate-180 transition-transform ml-3 shrink-0">
                    ▾
                  </span>
                </summary>
                <div className="px-5 pb-4 text-sm sm:text-base text-[#3A3A3C] font-medium leading-relaxed border-t border-slate-200 pt-3 break-keep">
                  {faq.answer}
                </div>
              </details>
            ))}
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="rounded-3xl border border-slate-200 bg-white p-6 text-center space-y-4 shadow-2xs">
          <h2 className="text-xl font-extrabold text-[#1D1D1F]">
            지금 바로 크리딜을 시작해 보세요
          </h2>
          <p className="text-sm sm:text-base text-[#515154] font-medium break-keep">
            회원용 상세 사용법에서 각 공간의 화면 예시와 3단계 순서를 먼저 살펴보실 수도 있습니다.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/broker/tutorial"
              className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-5 py-3 text-base font-bold text-[#1D1D1F] transition-colors"
            >
              회원용 상세 사용법
            </Link>
            <Link
              href="/login"
              className="inline-flex min-h-[48px] items-center justify-center rounded-xl bg-[#1D4ED8] hover:bg-[#1E40AF] px-6 py-3 text-base font-bold text-white shadow-xs transition-colors"
            >
              시작하기
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
