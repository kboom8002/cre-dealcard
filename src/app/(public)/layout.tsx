/**
 * Public pages layout
 *
 * Provides default SEO metadata for all public-facing pages under the
 * (public) route group. Wraps children in the premium dark theme.
 */
import type { Metadata, Viewport } from "next";
import { organization, website } from "@/lib/schema-org";
import { PublicBottomNav } from "@/components/layout/PublicBottomNav";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

const BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://credeal.net";

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: "DealCard — AI 상업용 부동산 딜 어시스턴트",
    template: "%s | DealCard",
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
  authors: [{ name: "DealCard", url: BASE_URL }],
  creator: "DealCard",
  publisher: "DealCard",
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
    url: BASE_URL,
    siteName: "DealCard",
    title: "DealCard — AI 상업용 부동산 딜 어시스턴트",
    description:
      "주소 하나, 메모 하나로 건물 딜 가능성을 확인하세요. AI 기반 CRE 딜 어시스턴트.",
    images: [
      {
        url: `${BASE_URL}/api/og/deal/default`,
        width: 1200,
        height: 630,
        alt: "DealCard — AI CRE 딜 어시스턴트",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "DealCard — AI 상업용 부동산 딜 어시스턴트",
    description:
      "주소 하나, 메모 하나로 건물 딜 가능성을 확인하세요.",
    images: [`${BASE_URL}/api/og/deal/default`],
  },
  alternates: {
    canonical: BASE_URL,
  },
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
          __html: JSON.stringify(organization()).replace(/</g, "\\u003c"),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(website()).replace(/</g, "\\u003c"),
        }}
      />

      {/* Floating theme toggle — top-right corner, desktop only */}
      <div className="fixed top-4 right-4 z-50 hidden md:block">
        <ThemeToggle size="sm" />
      </div>

      {/* Page content — padding-bottom accounts for mobile bottom nav */}
      <div className="pb-16 md:pb-0">
        {children}
      </div>

      {/* Mobile bottom navigation */}
      <PublicBottomNav />
    </div>
  );
}

