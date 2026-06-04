/**
 * Schema.org JSON-LD helpers for CRE DealCard
 *
 * Each function returns a plain object that should be serialized
 * inside a <script type="application/ld+json"> tag.
 *
 * Usage in a page component:
 *
 *   const jsonLd = realEstateListing(building);
 *   <script
 *     type="application/ld+json"
 *     dangerouslySetInnerHTML={{
 *       __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
 *     }}
 *   />
 */

const BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://dealcard.kr";

/* ── Types ──────────────────────────────────────────────────────── */

export interface BuildingForSchema {
  id: string;
  area_signal?: string | null;
  asset_type?: string | null;
  price_band?: string | null;
  vacancy_signal?: string | null;
  current_use_signal?: string | null;
  fit_summary?: string | null;
  created_at?: string | null;
}

export interface BrokerForSchema {
  id: string;
  display_name?: string | null;
  company?: string | null;
  phone?: string | null;
  specialty_regions?: string[] | null;
  bio?: string | null;
}

export interface FaqItem {
  question: string;
  answer: string;
}

/* ── Region labels ──────────────────────────────────────────────── */

const REGION_LABELS: Record<string, string> = {
  gbd: "강남 GBD",
  ybd: "여의도 YBD",
  cbd: "광화문 CBD",
  seongsu: "성수",
  pangyo: "판교",
  mapo: "마포",
  jongno: "종로",
  hongdae: "홍대",
};

function regionLabel(signal?: string | null): string {
  if (!signal) return "서울";
  return REGION_LABELS[signal.toLowerCase()] ?? signal;
}

/* ── 1. RealEstateListing ───────────────────────────────────────── */

export function realEstateListing(building: BuildingForSchema) {
  const region = regionLabel(building.area_signal);
  const regionSlug =
    building.area_signal?.replace(/\s+/g, "-").toLowerCase() ?? "unknown";

  return {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: `${region} ${building.asset_type ?? "상업용 부동산"} 매물`,
    description:
      building.fit_summary ??
      `${region} 권역 ${building.asset_type ?? "상업용 부동산"} 딜카드. ${building.price_band ? `가격대: ${building.price_band}.` : ""} DealCard에서 확인하세요.`,
    url: `${BASE_URL}/deal/${regionSlug}/${building.id}`,
    image: `${BASE_URL}/api/og/deal/${building.id}`,
    datePosted: building.created_at ?? undefined,
    ...(building.price_band && {
      offers: {
        "@type": "Offer",
        priceCurrency: "KRW",
        description: building.price_band,
      },
    }),
    address: {
      "@type": "PostalAddress",
      addressLocality: region,
      addressRegion: "서울특별시",
      addressCountry: "KR",
    },
    ...(building.vacancy_signal && {
      additionalProperty: {
        "@type": "PropertyValue",
        name: "공실률",
        value: building.vacancy_signal,
      },
    }),
  };
}

/* ── 2. RealEstateAgent ─────────────────────────────────────────── */

export function realEstateAgent(broker: BrokerForSchema) {
  const slug = broker.display_name
    ? broker.display_name.replace(/\s+/g, "-").toLowerCase()
    : broker.id;

  return {
    "@context": "https://schema.org",
    "@type": "RealEstateAgent",
    name: broker.display_name ?? "DealCard 중개사",
    description:
      broker.bio ??
      `${broker.display_name ?? "전문 중개사"}${broker.specialty_regions?.length ? ` — ${broker.specialty_regions.map(regionLabel).join(", ")} 전문` : ""}`,
    url: `${BASE_URL}/broker-profile/${slug}`,
    image: `${BASE_URL}/api/og/broker/${slug}`,
    ...(broker.phone && { telephone: broker.phone }),
    ...(broker.company && {
      worksFor: {
        "@type": "Organization",
        name: broker.company,
      },
    }),
    ...(broker.specialty_regions?.length && {
      areaServed: broker.specialty_regions.map((r) => ({
        "@type": "Place",
        name: regionLabel(r),
      })),
    }),
  };
}

/* ── 3. FAQPage ─────────────────────────────────────────────────── */

export function faqPage(faqs: FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };
}

/* ── 4. Organization ────────────────────────────────────────────── */

export function organization() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "DealCard",
    alternateName: "딜카드",
    url: BASE_URL,
    logo: `${BASE_URL}/favicon.ico`,
    description:
      "AI 기반 상업용 부동산(CRE) 딜 어시스턴트. 건물 딜카드, 매수자 매칭, 시장 분석을 제공합니다.",
    sameAs: [],
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "고객 지원",
      availableLanguage: ["ko", "en"],
    },
    areaServed: {
      "@type": "Country",
      name: "대한민국",
    },
  };
}

/* ── 5. QAPage (아고라 쓰레드용) ─────────────────────────────────── */

export interface QAThread {
  id: string;
  title: string;
  content: string;
  author_name?: string | null;
  ai_answer?: string | null;
  category: string;
  created_at?: string | null;
}

export function qaPage(thread: QAThread) {
  const url = `${BASE_URL}/agora/${thread.category}/${thread.id}`;
  return {
    "@context": "https://schema.org",
    "@type": "QAPage",
    name: thread.title,
    description: thread.content.slice(0, 200),
    url,
    mainEntity: {
      "@type": "Question",
      name: thread.title,
      text: thread.content,
      dateCreated: thread.created_at ?? undefined,
      author: thread.author_name
        ? { "@type": "Person", name: thread.author_name }
        : undefined,
      answerCount: thread.ai_answer ? 1 : 0,
      ...(thread.ai_answer && {
        acceptedAnswer: {
          "@type": "Answer",
          text: thread.ai_answer.slice(0, 500),
          author: {
            "@type": "Organization",
            name: "DealCard AI",
            url: BASE_URL,
          },
          dateCreated: thread.created_at ?? undefined,
        },
      }),
      suggestedAnswer: {
        "@type": "Answer",
        text: "DealCard Hub에서 관련 블라인드 딜카드를 탐색하고 전문 중개인에게 문의하세요.",
        url: `${BASE_URL}/hub`,
      },
    },
  };
}

/* ── 6. ServicePage (서비스 카드 상세용) ──────────────────────── */

export interface ServiceCardSchema {
  id: string;
  title: string;
  description: string;
  service_category: string;
  service_regions?: string[];
  avg_rating?: number | null;
  completion_count?: number;
  vendor_name: string;
  vendor_desc?: string | null;
}

export function servicePage(card: ServiceCardSchema) {
  const url = `${BASE_URL}/services/${card.service_category}/${card.id}`;
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: card.title,
    description: card.description.slice(0, 300),
    url,
    provider: {
      "@type": "Organization",
      name: card.vendor_name,
      ...(card.vendor_desc && { description: card.vendor_desc }),
    },
    areaServed: card.service_regions?.map((r) => ({
      "@type": "Place",
      name: r,
    })),
    ...(card.avg_rating && card.completion_count && {
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: card.avg_rating,
        reviewCount: card.completion_count,
        bestRating: 5,
      },
    }),
  };
}

/* ── 7. PulsePage (주간 시장 펄스용) ──────────────────────────── */

export function pulsePage(opts: {
  region: string;
  period: string;
  seoTitle: string;
  summary: string;
  createdAt: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "AnalysisNewsArticle",
    headline: opts.seoTitle,
    description: opts.summary.slice(0, 300),
    url: `${BASE_URL}/pulse/${opts.region}/${opts.period}`,
    datePublished: opts.createdAt,
    publisher: { "@type": "Organization", name: "DealCard" },
    about: {
      "@type": "Place",
      name: opts.region,
    },
  };
}

/* ── 8. OiticlePage (인사이트 롱폼 콘텐츠용) ─────────────────── */

export function oiticlePage(opts: {
  title: string;
  slug: string;
  excerpt: string;
  authorName: string;
  authorType: string;
  publishedAt: string | null;
  tags?: string[];
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: opts.title,
    description: opts.excerpt.slice(0, 300),
    url: `${BASE_URL}/insight/${opts.slug}`,
    datePublished: opts.publishedAt,
    author: {
      "@type": opts.authorType === "ai" ? "Organization" : "Person",
      name: opts.authorName,
    },
    publisher: { "@type": "Organization", name: "DealCard" },
    ...(opts.tags?.length && { keywords: opts.tags.join(", ") }),
  };
}

/* ── 9. WebSite + SearchAction ──────────────────────────────────── */

export function website() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "DealCard",
    url: BASE_URL,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${BASE_URL}/search?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

/* ── 10. BreadcrumbList ─────────────────────────────────────────── */

export interface BreadcrumbStep {
  name: string;
  item: string;
}

export function breadcrumb(steps: BreadcrumbStep[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: steps.map((step, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      name: step.name,
      item: step.item.startsWith("http")
        ? step.item
        : `${BASE_URL}${step.item.startsWith("/") ? "" : "/"}${step.item}`,
    })),
  };
}

/* ── 11. SearchResultsPage & BrokerItemList ─────────────────────── */

export function searchResultsPage(query: string, totalResults: number) {
  return {
    "@context": "https://schema.org",
    "@type": "SearchResultsPage",
    name: `"${query}" 검색 결과 | DealCard`,
    description: `"${query}"에 대한 상업용 부동산 매물, 임대 공간, 시장 시세 및 전문 중개인 검색 결과 총 ${totalResults}건입니다.`,
    url: `${BASE_URL}/search?q=${encodeURIComponent(query)}`,
  };
}

export function brokerItemList(brokers: BrokerForSchema[]) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "상업용 부동산 전문 중개인 목록",
    numberOfItems: brokers.length,
    itemListElement: brokers.map((b, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      item: {
        "@type": "RealEstateAgent",
        name: b.display_name,
        telephone: b.phone ?? undefined,
        description: b.bio ?? undefined,
        url: `${BASE_URL}/vibe-card/${b.id}`, // b.id should be the slug
      },
    })),
  };
}

