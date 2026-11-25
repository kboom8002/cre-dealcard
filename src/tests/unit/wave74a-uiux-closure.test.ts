import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const navState = vi.hoisted(() => ({
  pathname: "/hub",
  searchParams: "",
  notFoundMock: vi.fn((): never => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  permanentRedirectMock: vi.fn((target: string): never => {
    throw new Error(`NEXT_PERMANENT_REDIRECT:${target}`);
  }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navState.pathname,
  useSearchParams: () => new URLSearchParams(navState.searchParams),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  notFound: () => navState.notFoundMock(),
  permanentRedirect: (target: string) => navState.permanentRedirectMock(target),
  redirect: (target: string) => {
    throw new Error(`NEXT_REDIRECT:${target}`);
  },
}));

import { BrokerResultCard, type BrokerCardData } from "@/components/search/BrokerResultCard";
import { brokerItemList, hubFeaturedBrokersItemList } from "@/lib/schema-org";
import { PublicMoreMenu, PUBLIC_MORE_MENU_SECTIONS } from "@/components/layout/PublicMoreMenu";
import { PoweredByBadge } from "@/components/ui/PoweredByBadge";
import {
  PublicContentShell,
  doesPublicBottomNavSuppressOnRoute,
  isFixedLightPaperRoute,
} from "@/components/ui/ThemeToggle";
import { getAggregatedBrokerHomeData } from "@/domain/broker/home-aggregated";
import { resolveScreenNameFromPathname } from "@/components/help/QuickFeedbackReportModal";
import { FieldCoachBanner } from "@/components/help/FieldCoachBanner";
import { SeniorHelpProvider } from "@/components/help/SeniorHelpContext";
import SignupPage from "@/app/(auth)/signup/page";

const SUB14_CLASS_RE =
  /(?:^|\s)(?:(?:[a-z0-9-]+|\[[^\]\s]*\]):)*!?text-(?:xs|\[(?:[0-9]|1[0-3])(?:\.\d+)?px\])!?(?=$|\s|\/)/;

function readRepoFile(relPath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relPath), "utf8");
}

describe("Wave 7.4A — Global UI/UX & Public Link Hygiene Closure", () => {
  beforeEach(() => {
    navState.pathname = "/hub";
    navState.searchParams = "";
    navState.notFoundMock.mockClear();
    navState.permanentRedirectMock.mockClear();
  });

  describe("1. BrokerResultCard & Schema.org /broker-profile/ canonicalization", () => {
    const sampleBroker: BrokerCardData = {
      id: "11111111-1111-4111-8111-111111111111",
      displayName: "박성훈",
      company: "한강부동산중개법인",
      photoUrl: null,
      tagline: "강남·성수 중소형 빌딩 매입매각 전문",
      slug: "han-river-cre",
      specialtyRegions: ["서울 강남구", "서울 성동구", "서울 영등포구"],
      specialtyAssets: ["중소형빌딩", "근린생활시설", "오피스"],
      bio: "상업용 부동산 15년 경력",
      vibeVti: null,
      vibeTrust: 0.94,
      vibeValence: 0.8,
      totalDealCount: 28,
      isVerified: true,
      seoSummary: null,
    };

    it("renders BrokerResultCard linking to /broker-profile/<encoded-slug> with Daylight tokens, >=14px text, and min-h-[44px] CTA", () => {
      const html = renderToStaticMarkup(
        React.createElement(BrokerResultCard, { broker: sampleBroker }),
      );

      expect(html).toContain('href="/broker-profile/han-river-cre"');
      expect(html).not.toContain("/vibe-card");
      expect(html).toContain("bg-white");
      expect(html).toContain("border-slate-200");
      expect(html).toContain("text-slate-900");
      expect(html).toContain("min-h-[44px]");
      expect(SUB14_CLASS_RE.test(html)).toBe(false);

      // URL-encodes slugs containing non-ASCII or space characters
      const encodedHtml = renderToStaticMarkup(
        React.createElement(BrokerResultCard, {
          broker: { ...sampleBroker, slug: "박성훈 대표" },
        }),
      );
      expect(encodedHtml).toContain(
        `href="/broker-profile/${encodeURIComponent("박성훈 대표")}"`,
      );

      const src = readRepoFile("src/components/search/BrokerResultCard.tsx");
      expect(src).not.toContain("/vibe-card");
      expect(src).not.toMatch(/text-\[(?:9|10|11|12|13)px\]/);
      expect(src).not.toMatch(/\btext-xs\b/);
      expect(src).not.toContain("border-white/10");
      expect(src).not.toContain("bg-white/5");
    });

    it("emits /broker-profile/<encoded-slug> in hubFeaturedBrokersItemList & brokerItemList with backward compatibility", () => {
      const jsonLd = hubFeaturedBrokersItemList([
        {
          id: "uuid-broker-1",
          slug: "gangnam-pro",
          display_name: "박성훈",
          company: "한강부동산중개법인",
          bio: "GBD 전문",
        },
        {
          id: "fallback-id-only",
          display_name: "이수진",
        },
      ]);

      expect(jsonLd["@type"]).toBe("ItemList");
      expect(jsonLd.numberOfItems).toBe(2);
      expect(jsonLd.itemListElement[0].item.url).toMatch(
        /\/broker-profile\/gangnam-pro$/,
      );
      expect(jsonLd.itemListElement[1].item.url).toMatch(
        /\/broker-profile\/fallback-id-only$/,
      );
      expect(JSON.stringify(jsonLd)).not.toContain("/vibe-card");

      const legacyCompat = brokerItemList([
        { id: "legacy-slug", display_name: "레거시 호환" },
      ]);
      expect(legacyCompat.itemListElement[0].item.url).toMatch(
        /\/broker-profile\/legacy-slug$/,
      );

      const smokeSrc = readRepoFile("e2e/public-ux-smoke.spec.ts");
      expect(smokeSrc).toContain("'/vibe-card'");
    });
  });

  describe("2. Public outbound deal & dormant route hygiene", () => {
    it("excludes /owner-readiness from PublicMoreMenu config and rendered sheet", () => {
      const allHrefs = PUBLIC_MORE_MENU_SECTIONS.flatMap((section) =>
        section.items.map((item) => item.href),
      );
      expect(allHrefs).not.toContain("/owner-readiness");
      expect(allHrefs).toContain("/guide");

      const html = renderToStaticMarkup(
        React.createElement(PublicMoreMenu, { open: true, onClose: () => {} }),
      );
      expect(html).not.toContain("/owner-readiness");
      expect(html).not.toContain("매각 준비도 체크");
      expect(html).toContain('href="/guide"');
    });

    it("points /broker-profile/[slug], /hub, /deal/[region]/[id], and /expert-note/request away from dead or unguarded routes", () => {
      const brokerProfileSrc = readRepoFile(
        "src/app/(public)/broker-profile/[slug]/page.tsx",
      );
      expect(brokerProfileSrc).toContain("/dc/${encodeURIComponent(d.id)}");
      expect(brokerProfileSrc).not.toContain("/deal/${");
      expect(brokerProfileSrc).not.toContain("/building-radar");
      expect(brokerProfileSrc).toContain(
        "/expert-note/request?broker=${encodeURIComponent(",
      );

      const hubSrc = readRepoFile("src/app/(public)/hub/page.tsx");
      expect(hubSrc).toContain("hubFeaturedBrokersItemList");
      expect(hubSrc).toContain("/dc/${encodeURIComponent(deal.id)}");
      expect(hubSrc).not.toContain("/deal/");

      const legacyDealSrc = readRepoFile(
        "src/app/(public)/deal/[region]/[id]/page.tsx",
      );
      expect(legacyDealSrc).toContain("resolvePublicDealWorkspaceGuard");
      expect(legacyDealSrc).toContain("isBuildingShareLinkRevoked");
      expect(legacyDealSrc).toContain("evaluateDealCardPublicVisibility");
      expect(legacyDealSrc).toContain("permanentRedirect(`/dc/${encodeURIComponent(id)}`)");
      expect(legacyDealSrc).not.toContain("/building-radar");
      expect(legacyDealSrc).not.toContain("#0b0f19");

      const expertNoteSrc = readRepoFile(
        "src/app/(public)/expert-note/request/page.tsx",
      );
      expect(expertNoteSrc).not.toContain("/building-radar");
      expect(expertNoteSrc).toContain('href="/hub"');
      expect(expertNoteSrc).toContain('searchParams.get("broker")');
      expect(expertNoteSrc).not.toMatch(/\btext-xs\b/);
    });
  });

  describe("3. Broker Home Door #3, QuickFeedbackReportModal /broker/w/* mappings & Signup redirectTo", () => {
    it("sets Home Door #3 (뉴스레터) href and badge.href to canonical /broker/w/newsletter", async () => {
      const emptyChain = {
        select: () => emptyChain,
        neq: () => emptyChain,
        eq: () => emptyChain,
        or: () => emptyChain,
        in: () => emptyChain,
        order: () => emptyChain,
        limit: async () => ({ data: [], error: null }),
        maybeSingle: async () => ({
          data: { display_name: "박성훈", photo_url: null, role: "broker" },
          error: null,
        }),
      };
      const fakeSupabase = {
        from: () => emptyChain,
      } as unknown as SupabaseClient;

      const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      try {
        const homeData = await getAggregatedBrokerHomeData(
          fakeSupabase,
          "22222222-2222-4222-8222-222222222222",
        );
        expect(homeData.doors.magazine.href).toBe("/broker/w/newsletter");
        expect(homeData.doors.magazine.badge.href).toBe("/broker/w/newsletter");
        expect(homeData.doors.dealcards.href).toBe("/broker/w/dealcards");
        expect(homeData.doors.im.href).toBe("/broker/w/im");
        expect(homeData.doors.inbox.href).toBe("/broker/w/inbox");
      } finally {
        if (prevUrl !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
        if (prevKey !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
      }
    });

    it("maps all 4 /broker/w/* workspace routes in resolveScreenNameFromPathname before legacy fallbacks", () => {
      const dealcardsLabel = resolveScreenNameFromPathname("/broker/w/dealcards");
      const imLabel = resolveScreenNameFromPathname("/broker/w/im");
      const newsletterLabel = resolveScreenNameFromPathname("/broker/w/newsletter");
      const inboxLabel = resolveScreenNameFromPathname("/broker/w/inbox");

      expect(dealcardsLabel).not.toBe("기타 화면");
      expect(dealcardsLabel).toContain("딜카드");

      expect(imLabel).not.toBe("기타 화면");
      expect(imLabel).toContain("기본 IM");

      expect(newsletterLabel).not.toBe("기타 화면");
      expect(newsletterLabel).toContain("뉴스레터");

      expect(inboxLabel).not.toBe("기타 화면");
      expect(inboxLabel).toContain("고객 소통함");

      // Subpath / legacy compatibility preserved
      expect(resolveScreenNameFromPathname("/broker/w/dealcards/sub")).toBe(dealcardsLabel);
      expect(resolveScreenNameFromPathname("/broker/deal-card/new")).toContain(
        "1분 딜카드 신규 등록",
      );
      expect(resolveScreenNameFromPathname("/broker/magazine-editor")).toContain(
        "주간 고객 소식지",
      );
    });

    it("preserves redirectTo hidden input and realistic displayName placeholder on SignupPage", () => {
      navState.pathname = "/signup";
      navState.searchParams = "redirectTo=%2Fbroker%2Fw%2Fnewsletter";

      const html = renderToStaticMarkup(React.createElement(SignupPage));
      expect(html).toContain(
        '<input type="hidden" name="redirectTo" value="/broker/w/newsletter"/>',
      );
      expect(html).toContain('placeholder="예: 박성훈"');
      expect(html).not.toContain('placeholder="예: 박성훈 (한강부동산중개법인)"');
      expect(html).not.toContain("김대표 (크리딜중개법인)");
    });
  });

  describe("4. Shared shell clearance, PoweredByBadge contrast, Survey telemetry & >=44px help touch targets", () => {
    it("renders high-contrast daylight PoweredByBadge on /magazine without text-emerald-200", () => {
      navState.pathname = "/magazine/ed-1";
      const html = renderToStaticMarkup(
        React.createElement(PoweredByBadge, { context: "magazine" }),
      );
      expect(html).toContain("text-emerald-800");
      expect(html).toContain("bg-emerald-50");
      expect(html).toContain("border-emerald-200");
      expect(html).not.toContain("text-emerald-200");
    });

    it("keeps pb-16 md:pb-0 on fixed-light routes where PublicBottomNav renders while omitting it on recipient/legal/auth routes", () => {
      for (const navRoute of [
        "/",
        "/hub",
        "/guide",
        "/powered-by",
        "/broker-profile/han-river-cre",
        "/magazine",
      ]) {
        expect(isFixedLightPaperRoute(navRoute)).toBe(true);
        expect(doesPublicBottomNavSuppressOnRoute(navRoute)).toBe(false);
        navState.pathname = navRoute;
        const html = renderToStaticMarkup(
          React.createElement(
            PublicContentShell,
            null,
            React.createElement("span", null, "본문"),
          ),
        );
        expect(html, `${navRoute} must keep pb-16 md:pb-0`).toContain("pb-16 md:pb-0");
      }

      for (const suppressedRoute of [
        "/dc/abc",
        "/im-lite/abc",
        "/terms",
        "/privacy",
        "/login",
        "/signup",
      ]) {
        expect(doesPublicBottomNavSuppressOnRoute(suppressedRoute)).toBe(true);
        navState.pathname = suppressedRoute;
        const html = renderToStaticMarkup(
          React.createElement(
            PublicContentShell,
            null,
            React.createElement("span", null, "본문"),
          ),
        );
        expect(html, `${suppressedRoute} must omit pb-16`).not.toContain("pb-16");
      }
    });

    it("routes SurveyProvider submissions through /api/public/events with daylight card styling and upgrades help buttons to >=44px", () => {
      const surveySrc = readRepoFile("src/components/feedback/SurveyProvider.tsx");
      expect(surveySrc).toContain('fetch("/api/public/events"');
      expect(surveySrc).not.toContain('@/lib/supabase/client');
      expect(surveySrc).not.toContain('.from("activity_events")');
      expect(surveySrc).toContain("bg-white text-slate-900 border border-slate-200");

      const bannerHtml = renderToStaticMarkup(
        React.createElement(
          SeniorHelpProvider,
          null,
          React.createElement(FieldCoachBanner, {
            headline: "메모 코칭",
            sampleText: "샘플 메모",
            mistakeWarning: "주의사항",
          }),
        ),
      );
      expect(bannerHtml).toContain("min-h-[44px]");
      expect(bannerHtml).not.toContain("min-h-[40px]");

      for (const helpRelPath of [
        "src/components/help/FieldCoachBanner.tsx",
        "src/components/help/QuickRemedyPopover.tsx",
        "src/components/help/RentRollAiHelperModal.tsx",
      ]) {
        const src = readRepoFile(helpRelPath);
        expect(src, `${helpRelPath} must not contain min-h-[40px]`).not.toContain(
          "min-h-[40px]",
        );
        expect(src, `${helpRelPath} must enforce min-h-[44px]`).toContain(
          "min-h-[44px]",
        );
      }
    });
  });
});
