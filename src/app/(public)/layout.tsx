/**
 * Public pages layout
 *
 * Provides default SEO metadata for all public-facing pages under the
 * (public) route group. Wraps children in the premium dark theme.
 */
import type { Metadata, Viewport } from "next";
import { serializeJsonLd, organization, website } from "@/lib/schema-org";
import { PublicBottomNav } from "@/components/layout/PublicBottomNav";
import { ThemeToggle, PublicContentShell } from "@/components/ui/ThemeToggle";
import { getCanonicalSiteUrl } from "@/lib/site-url";

const BASE_URL = getCanonicalSiteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: "크리딜 (CREDEAL) — AI 상업용 부동산 딜 어시스턴트",
    template: "%s | 크리딜 (CREDEAL)",
  },
  description:
    "주소나 매물 메모 하나로 건물 딜카드를 만들어보세요. AI 기반 CRE 딜 어시스턴트가 매칭, 시장 분석, IM 생성을 도와드립니다.",
  keywords: [
    "상업용 부동산",
    "CRE",
    "딜카드",
    "오피스 매매",
    "건물 매매",
    "투자 분석",
    "강남 오피스",
    "여의도 오피스",
    "AI 부동산",
  ],
  authors: [{ name: "크리딜 (CREDEAL)", url: BASE_URL }],
  creator: "크리딜 (CREDEAL)",
  publisher: "크리딜 (CREDEAL)",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: "크리딜 (CREDEAL)",
    title: "크리딜 (CREDEAL) — AI 상업용 부동산 딜 어시스턴트",
    description:
      "주소 하나, 메모 하나로 건물 딜 가능성을 확인하세요. AI 기반 CRE 딜 어시스턴트.",
    images: [
      {
        url: `${BASE_URL}/og-default.png?v=2`,
        width: 1200,
        height: 630,
        alt: "크리딜 (CREDEAL) — AI 상업용 부동산 딜 어시스턴트",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "크리딜 (CREDEAL) — AI 상업용 부동산 딜 어시스턴트",
    description:
      "주소 하나, 메모 하나로 건물 딜 가능성을 확인하세요.",
    images: [`${BASE_URL}/og-default.png?v=2`],
  },
  // P2 (WP-7.3A): no group-wide `alternates.canonical` here — a layout-level canonical
  // pointing at BASE_URL was inherited by every public page and told crawlers that
  // each deal/profile page was a duplicate of the homepage. Pages set their own.
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0b0f19" },
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
  ],
};

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Organization & WebSite JSON-LD — rendered once for the public shell */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(organization()).replace(/</g, "\\u003c"),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(website()).replace(/</g, "\\u003c"),
        }}
      />

      {/* Floating theme toggle — top-right corner, desktop only */}
      <div className="fixed top-4 right-4 z-50 hidden md:block">
        <ThemeToggle size="sm" />
      </div>

      {/* Page content — padding-bottom accounts for mobile bottom nav when visible */}
      <PublicContentShell>
        {children}
      </PublicContentShell>

      {/* Mobile bottom navigation */}
      <PublicBottomNav />
    </div>
  );
}

