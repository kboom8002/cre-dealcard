/**
 * 매거진 라우트 그룹 레이아웃 (E-03 U-07) — URL 은 그대로 `/magazine/[brokerId]…`.
 *
 * `(public)` 레이아웃/템플릿과 분리한 이유:
 *  - PublicBottomNav: 뷰어 하단 고정 바(ViewerBottomBar)와 겹침 → 이 그룹에서는 렌더하지 않는다.
 *  - ThemeToggle: 뷰어는 다크 고정 디자인 → 토글 제외, `color-scheme: dark` 적용.
 *  - PageTransition(`(public)/template.tsx`): transform 이 `position: fixed` 하단 바의 기준을 깨뜨림 → 적용하지 않는다.
 * 메타데이터는 (public) 에서 상속되지 않으므로 여기서 기본값(metadataBase·title 템플릿·robots·openGraph)을 제공한다.
 * canonical 은 페이지별로 지정한다(이전에는 (public) 의 홈 canonical 이 전 페이지에 상속되던 문제도 함께 해소).
 * 스킵 링크 + scroll-padding 은 접근성(U-05) 요건.
 */
import type { Metadata, Viewport } from "next";
import React from "react";
import { MagazineRouteEffects } from "@/components/magazine/MagazineRouteEffects";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://credeal.net";

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: "CRE 매거진 | DealCard",
    template: "%s | DealCard",
  },
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
    siteName: "DealCard",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#0b0f19",
};

export default function MagazineGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#050510] text-slate-100" style={{ colorScheme: "dark" }}>
      <MagazineRouteEffects />
      <a
        href="#magazine-main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2.5 focus:text-label focus:font-bold focus:text-slate-900"
      >
        본문으로 건너뛰기
      </a>
      {children}
    </div>
  );
}
