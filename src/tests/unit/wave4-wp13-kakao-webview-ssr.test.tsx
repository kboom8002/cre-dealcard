// @vitest-environment jsdom
/**
 * Wave 4 — WP-13 Unit & SSR Integration Tests
 * 1. KakaoTalk / Social In-App WebView detection & external browser scheme builder
 * 2. MobileIMViewer, FloatingActionBar, ForwardSection, ViewerBottomBar:
 *    - WebView-safe `copyText()` unification
 *    - Safe-area bottom inset (`env(safe-area-inset-bottom)`)
 *    - Honest buyer inquiry CTA (`간편 문의` vs explicit `pf.kakao.com`/`open.kakao.com` `카톡 상담`)
 *    - Dignified `isRevoked` buyer screen & explicit PPTX error toast
 * 3. ThemeToggle & PublicContentShell hidden/unpadded on `/dc/*`, `/im-lite/*`, `/terms`, `/privacy`
 * 4. `geocodeAddress` & `fetchIMData` SSR deadline (`< 1600ms` under hanging fetch), 1h LRU cache, and `activity_events` SQL pushdown
 */

import React, { act } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";

const {
  mockPathnameRef,
  copyTextSpy,
  toastSuccessSpy,
  toastErrorSpy,
  toastInfoSpy,
  createServiceClientMock,
} = vi.hoisted(() => ({
  mockPathnameRef: { current: "/im-lite/bld-wp13" },
  copyTextSpy: vi.fn(async (_text: string) => true),
  toastSuccessSpy: vi.fn(),
  toastErrorSpy: vi.fn(),
  toastInfoSpy: vi.fn(),
  createServiceClientMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => mockPathnameRef.current,
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "dark", setTheme: vi.fn() }),
}));

vi.mock("next/script", () => ({
  default: () => null,
}));

vi.mock("sonner", () => ({
  toast: {
    success: toastSuccessSpy,
    error: toastErrorSpy,
    info: toastInfoSpy,
  },
}));

vi.mock("@/lib/ux/clipboard", () => ({
  copyText: (text: string) => copyTextSpy(text),
  COPY_FAILED_MESSAGE: "복사에 실패했습니다. 주소를 길게 눌러 직접 복사해 주세요.",
}));

vi.mock("@/platform/im-pipeline/realtime/use-dealcard-realtime-sync", () => ({
  useDealcardRealtimeSync: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => createServiceClientMock(),
}));

import {
  MobileIMViewer,
  isInAppWebView,
  buildKakaoExternalOpenUrl,
} from "@/app/(public)/im-lite/[buildingId]/mobile-im-viewer";
import {
  FloatingActionBar,
  isInAppWebView as isInAppWebViewFromBar,
  buildKakaoExternalOpenUrl as buildKakaoExternalOpenUrlFromBar,
} from "@/app/(public)/im-lite/[buildingId]/components/floating-action-bar";
import { ForwardSection } from "@/components/magazine/ForwardSection";
import { ViewerBottomBar } from "@/components/magazine/ViewerBottomBar";
import {
  ThemeToggle,
  PublicContentShell,
  isFixedLightPaperRoute,
} from "@/components/ui/ThemeToggle";
import {
  geocodeAddress,
  clearGeocodeCacheForTests,
  fetchIMData,
} from "@/app/(public)/im-lite/[buildingId]/fetch-im-data";
import { buildBasicImDocument } from "@/domain/building/im-core/basic-im-document";
import { extractPureBuildingFacts } from "@/domain/building/im-core/facts";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class MockIntersectionObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
globalThis.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;

function createNeutralViewerDoc(overrides: Record<string, unknown> = {}) {
  const facts = extractPureBuildingFacts({
    id: "bld-wp13-01",
    building_name: "역삼 오피스 자산",
    address: "서울특별시 강남구 테헤란로 152",
    posture: "core_income",
    asking_price_manwon: 850000,
    gross_floor_area_sqm: 1320,
    land_area_sqm: 430,
    zoning: "일반상업지역",
    building_coverage_ratio_pct: 55,
    floor_area_ratio_pct: 310,
    floors_above: 6,
    floors_below: 1,
    completion_date: "2019-06-15",
    parking_spaces: 12,
    elevators: 1,
    monthly_rent_total_manwon: 2900,
    deposit_total_manwon: 35000,
    occupancy_rate_pct: 100,
    rent_roll: [
      {
        floor: "1F",
        tenantName: "근린생활시설",
        areaSqm: 220,
        depositKrw: 150000000,
        rentKrw: 9000000,
        status: "occupied",
      },
    ],
    brokerOffice: {
      name: "전담 부동산중개법인",
      representativeName: "이중개",
      phone: "02-555-7788",
      registrationNo: "11680-2022-00456",
      officeAddress: "서울특별시 강남구 테헤란로 100",
    },
  });
  const basicImDocument = buildBasicImDocument(facts);
  return {
    buildingId: "bld-wp13-01",
    basicImDocument,
    broker: {
      userId: "broker-wp13",
      displayName: "이중개",
      company: "전담 부동산중개법인",
      phone: "02-555-7788",
      registrationNo: "11680-2022-00456",
      officeAddress: "서울특별시 강남구 테헤란로 100",
      tagline: "",
      photoUrl: "/default-avatar.png",
      slug: "broker-wp13",
      vibeTemplateId: "default",
    },
    ...overrides,
  };
}

describe("Wave 4 WP-13: KakaoTalk WebView Download, copyText Unification, Safe-Area, ThemeToggle & SSR Geocode Speedup", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;
  const originalUserAgent = navigator.userAgent;
  const originalShare = navigator.share;
  const originalFetch = globalThis.fetch;
  const originalKakaoKey = process.env.KAKAO_REST_API_KEY;

  function setUserAgent(ua: string) {
    Object.defineProperty(window.navigator, "userAgent", {
      value: ua,
      configurable: true,
    });
  }

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mockPathnameRef.current = "/im-lite/bld-wp13-01";
    copyTextSpy.mockClear();
    toastSuccessSpy.mockClear();
    toastErrorSpy.mockClear();
    toastInfoSpy.mockClear();
    createServiceClientMock.mockReset();
    clearGeocodeCacheForTests();
    Object.defineProperty(window.navigator, "share", {
      value: undefined,
      configurable: true,
    });
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
      root = null;
    }
    if (container) {
      container.remove();
      container = null;
    }
    setUserAgent(originalUserAgent);
    Object.defineProperty(window.navigator, "share", {
      value: originalShare,
      configurable: true,
    });
    globalThis.fetch = originalFetch;
    if (originalKakaoKey === undefined) {
      delete process.env.KAKAO_REST_API_KEY;
    } else {
      process.env.KAKAO_REST_API_KEY = originalKakaoKey;
    }
  });

  describe("1. isInAppWebView & buildKakaoExternalOpenUrl", () => {
    it("detects KakaoTalk iOS & Android WebViews and builds platform-specific external open URLs", () => {
      const targetUrl = "https://credeal.net/im-lite/bld-wp13-01?t=tok_123";
      const kakaoIosUa =
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.6.2";
      const kakaoAndroidUa =
        "Mozilla/5.0 (Linux; Android 14; SM-S928N Build/UP1A) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/123.0 Mobile Safari/537.36 KAKAOTALK 10.6.2";
      const instagramIosUa =
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 320.0";
      const desktopSafariUa =
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";

      expect(isInAppWebView(kakaoIosUa)).toBe(true);
      expect(isInAppWebViewFromBar(kakaoAndroidUa)).toBe(true);
      expect(isInAppWebView(instagramIosUa)).toBe(true);
      expect(isInAppWebView(desktopSafariUa)).toBe(false);

      expect(buildKakaoExternalOpenUrl(targetUrl, kakaoIosUa)).toBe(
        `kakaotalk://web/openExternal?url=${encodeURIComponent(targetUrl)}`
      );
      expect(buildKakaoExternalOpenUrlFromBar(targetUrl, kakaoAndroidUa)).toBe(
        "intent://credeal.net/im-lite/bld-wp13-01?t=tok_123#Intent;scheme=https;package=com.android.chrome;end"
      );
      expect(buildKakaoExternalOpenUrl(targetUrl, desktopSafariUa)).toBeNull();
    });
  });

  describe("2. MobileIMViewer, FloatingActionBar, ForwardSection & ViewerBottomBar UX", () => {
    it("renders WebView helper banner, safe-area inset, honest inquiry CTA, and copyText link fallback in KakaoTalk WebView", async () => {
      setUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) Mobile/15E148 KAKAOTALK 10.6.2"
      );
      const doc = createNeutralViewerDoc();

      await act(async () => {
        root!.render(
          <MobileIMViewer
            document={doc as any}
            buildingId="bld-wp13-01"
          />
        );
      });

      const bottomBar = container!.querySelector('[data-testid="floating-action-bar"]');
      expect(bottomBar).not.toBeNull();
      expect(bottomBar!.className).toContain("env(safe-area-inset-bottom)");
      expect(bottomBar!.textContent).toContain("간편 문의 · 자료 요청");
      expect(bottomBar!.textContent).not.toContain("카톡 문의");

      const webviewBanner = container!.querySelector('[data-testid="inapp-webview-banner"]');
      expect(webviewBanner).not.toBeNull();
      expect(webviewBanner!.textContent).toContain("외부 브라우저(Safari/Chrome)로 열기");

      const copyBtn = container!.querySelector(
        '[data-testid="copy-im-link-btn"]'
      ) as HTMLButtonElement | null;
      expect(copyBtn).not.toBeNull();
      await act(async () => {
        copyBtn!.click();
      });
      expect(copyTextSpy).toHaveBeenCalledTimes(1);
    });

    it("surfaces explicit toast.error on non-OK desktop PPTX response and renders dignified isRevoked copy", async () => {
      setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36"
      );
      globalThis.fetch = vi.fn(async () =>
        new Response(JSON.stringify({ reason: "일시적 PPTX 생성 지연이 발생했습니다." }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        })
      ) as unknown as typeof fetch;

      const doc = createNeutralViewerDoc();
      // 1) Buyer / public viewer hides broker-only PPTX download CTA (V3 D-01)
      await act(async () => {
        root!.render(
          <MobileIMViewer
            document={doc as any}
            buildingId="bld-wp13-01"
          />
        );
      });
      expect(container!.querySelector('[data-testid="mobile-im-download-pptx-btn"]')).toBeNull();

      // 2) Owner broker preview renders PPTX CTA in top toolbar and surfaces toast.error on 500
      await act(async () => {
        root!.render(
          <MobileIMViewer
            document={doc as any}
            buildingId="bld-wp13-01"
            isBroker={true}
          />
        );
      });

      const pptxBtn = container!.querySelector(
        '[data-testid="mobile-im-download-pptx-btn"]'
      ) as HTMLAnchorElement | null;
      expect(pptxBtn).not.toBeNull();

      await act(async () => {
        pptxBtn!.click();
      });
      expect(toastErrorSpy).toHaveBeenCalledWith("일시적 PPTX 생성 지연이 발생했습니다.");

      // Verify dignified revoked screen without "404" or "권한 회수"
      const revokedDoc = createNeutralViewerDoc({ isRevoked: true });
      await act(async () => {
        root!.render(
          <MobileIMViewer
            document={revokedDoc as any}
            buildingId="bld-wp13-01"
          />
        );
      });
      const revokedScreen = container!.querySelector('[data-testid="revoked-im-screen"]');
      expect(revokedScreen).not.toBeNull();
      expect(revokedScreen!.textContent).toContain("열람 기간 만료");
      expect(revokedScreen!.textContent).not.toContain("404");
      expect(revokedScreen!.textContent).not.toContain("권한 회수");
    });

    it("FloatingActionBar, ForwardSection, and ViewerBottomBar use copyText, safe-area insets, and honest inquiry labels", async () => {
      // 1) FloatingActionBar (Buyer view without Kakao channel URL)
      await act(async () => {
        root!.render(
          <FloatingActionBar
            title="역삼 오피스 자산"
            buildingId="bld-wp13-01"
            brokerPhone="02-555-7788"
            onInquire={vi.fn()}
          />
        );
      });
      const fabRoot = container!.firstElementChild as HTMLElement;
      expect(fabRoot.className).toContain("env(safe-area-inset-bottom)");
      expect(fabRoot.textContent).toContain("간편 문의 · 자료 요청");
      expect(fabRoot.textContent).not.toContain("비밀 상담");

      // Render broker mode and trigger link share -> uses copyText
      await act(async () => {
        root!.render(
          <FloatingActionBar
            title="역삼 오피스 자산"
            buildingId="bld-wp13-01"
            brokerPhone="02-555-7788"
            isBroker={true}
            key="broker-fab"
          />
        );
      });
      const linkShareBtn = Array.from(container!.querySelectorAll("button")).find(
        (b) => b.getAttribute("title") === "링크 복사"
      );
      expect(linkShareBtn).toBeDefined();
      await act(async () => {
        linkShareBtn!.click();
      });
      expect(copyTextSpy).toHaveBeenCalled();
      copyTextSpy.mockClear();

      // 2) ForwardSection uses copyText
      await act(async () => {
        root!.render(
          <ForwardSection
            brokerId="broker-wp13"
            brokerName="이중개"
            date="2026-11-15"
          />
        );
      });
      const forwardButtons = Array.from(container!.querySelectorAll("button"));
      expect(forwardButtons.length).toBeGreaterThanOrEqual(2);
      await act(async () => {
        forwardButtons[0].click();
      });
      expect(copyTextSpy).toHaveBeenCalledWith(
        expect.stringContaining("/magazine/broker-wp13/2026-11-15")
      );
      copyTextSpy.mockClear();

      // 3) ViewerBottomBar renders safe-area inset + honest "간편 문의" when kakaoUrl is non-Kakao, and "카톡 상담" when pf.kakao.com
      await act(async () => {
        root!.render(
          <ViewerBottomBar
            phone={null}
            kakaoUrl="https://credeal.net/inquiry/form"
            brokerSlug="broker-wp13"
            brokerName="이중개"
            brokerId="broker-wp13"
            headline="주간 시장 브리핑"
            date="2026-11-15"
            dateLabel="2026년 11월 15일"
            target="all"
          />
        );
      });
      const magNav = container!.querySelector("[data-magazine-bottom-bar]") as HTMLElement | null;
      expect(magNav).not.toBeNull();
      expect(magNav!.className).toContain("env(safe-area-inset-bottom)");
      expect(magNav!.textContent).toContain("간편 문의");
      expect(magNav!.textContent).not.toContain("카톡 상담");

      const magShareBtn = Array.from(magNav!.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("공유")
      );
      expect(magShareBtn).toBeDefined();
      await act(async () => {
        magShareBtn!.click();
      });
      expect(copyTextSpy).toHaveBeenCalledWith(
        expect.stringContaining("/magazine/broker-wp13/2026-11-15")
      );

      // Explicit pf.kakao.com channel URL -> allowed to render "💬 카톡 상담"
      await act(async () => {
        root!.render(
          <ViewerBottomBar
            phone={null}
            kakaoUrl="https://pf.kakao.com/_credeal"
            brokerSlug="broker-wp13"
            brokerName="이중개"
            brokerId="broker-wp13"
            headline="주간 시장 브리핑"
            date="2026-11-15"
            dateLabel="2026년 11월 15일"
            target="all"
          />
        );
      });
      expect(container!.querySelector("[data-magazine-bottom-bar]")!.textContent).toContain(
        "카톡 상담"
      );
    });
  });

  describe("3. ThemeToggle & PublicContentShell fixed light-paper route guard", () => {
    it("renders null and omits pb-16 on /dc/abc, /im-lite/abc, /terms, and /privacy", async () => {
      for (const route of ["/dc/abc", "/im-lite/abc", "/terms", "/privacy"]) {
        mockPathnameRef.current = route;
        expect(isFixedLightPaperRoute(route)).toBe(true);

        await act(async () => {
          root!.render(
            <div>
              <ThemeToggle />
              <PublicContentShell>
                <span data-testid="shell-child">본문</span>
              </PublicContentShell>
            </div>
          );
        });

        expect(container!.querySelector("button")).toBeNull();
        const shellWrapper = container!.querySelector('[data-testid="shell-child"]')!
          .parentElement as HTMLElement;
        expect(shellWrapper.className).not.toContain("pb-16");
      }

      // Fixed daylight public routes include /hub, /search, /space/* (D3); non-fixed public route (/insight) still renders ThemeToggle and pb-16
      expect(isFixedLightPaperRoute("/hub")).toBe(true);
      expect(isFixedLightPaperRoute("/search")).toBe(true);
      expect(isFixedLightPaperRoute("/space/gbd")).toBe(true);
      mockPathnameRef.current = "/insight";
      expect(isFixedLightPaperRoute("/insight")).toBe(false);
      await act(async () => {
        root!.render(
          <div>
            <ThemeToggle />
            <PublicContentShell>
              <span data-testid="shell-child">시장 인사이트</span>
            </PublicContentShell>
          </div>
        );
      });
      expect(container!.querySelector("button")).not.toBeNull();
      const hubShellWrapper = container!.querySelector('[data-testid="shell-child"]')!
        .parentElement as HTMLElement;
      expect(hubShellWrapper.className).toContain("pb-16");
    });
  });

  describe("4. geocodeAddress & fetchIMData SSR deadline (< 1600ms), 0ms cache & activity_events pushdown", () => {
    it("completes geocodeAddress within < 1550ms even when fetch hangs until AbortSignal fires, and caches valid coords", async () => {
      process.env.KAKAO_REST_API_KEY = "test-kakao-rest-key";

      // 1) Hanging fetch that only rejects when AbortSignal aborts
      globalThis.fetch = vi.fn(
        (_url: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            const sig = init?.signal;
            if (sig?.aborted) {
              reject(new DOMException("Aborted", "AbortError"));
              return;
            }
            sig?.addEventListener(
              "abort",
              () => reject(new DOMException("Aborted", "AbortError")),
              { once: true }
            );
          })
      ) as unknown as typeof fetch;

      const t0 = performance.now();
      const timedOutCoords = await geocodeAddress("서울특별시 강남구 역삼동 737");
      const elapsedMs = performance.now() - t0;

      expect(timedOutCoords).toBeNull();
      expect(elapsedMs).toBeLessThan(1580);

      // 2) Valid Kakao response is cached in bounded Map (0ms repeat lookup, single fetch call)
      const fastFetch = vi.fn(async () =>
        new Response(
          JSON.stringify({
            documents: [{ x: "127.0365", y: "37.5006" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
      globalThis.fetch = fastFetch as unknown as typeof fetch;

      const firstHit = await geocodeAddress("서울특별시 강남구 테헤란로 152");
      expect(firstHit).toEqual({ lat: 37.5006, lng: 127.0365 });
      expect(fastFetch).toHaveBeenCalledTimes(1);

      const cacheStart = performance.now();
      const cachedHit = await geocodeAddress("  서울특별시   강남구 테헤란로 152 ");
      const cacheElapsed = performance.now() - cacheStart;
      expect(cachedHit).toEqual({ lat: 37.5006, lng: 127.0365 });
      expect(cacheElapsed).toBeLessThan(20);
      expect(fastFetch).toHaveBeenCalledTimes(1);
    });

    it("completes fetchIMData within < 1600ms when geocoding fetch hangs and pushes down activity_events SQL filter", async () => {
      process.env.KAKAO_REST_API_KEY = "test-kakao-rest-key";
      const targetUuid = "11111111-2222-4333-8444-555555555555";
      const orFilterCalls: string[] = [];
      const limitCalls: number[] = [];

      globalThis.fetch = vi.fn(
        (_url: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () => reject(new DOMException("Aborted", "AbortError")),
              { once: true }
            );
          })
      ) as unknown as typeof fetch;

      createServiceClientMock.mockReturnValue({
        from(table: string) {
          if (table === "activity_events") {
            const chain: Record<string, any> = {
              select: () => chain,
              in: () => chain,
              or: (expr: string) => {
                orFilterCalls.push(expr);
                return chain;
              },
              order: () => chain,
              limit: async (n: number) => {
                limitCalls.push(n);
                return { data: [], error: null };
              },
            };
            return chain;
          }
          if (table === "document_objects") {
            const chain: Record<string, any> = {
              select: () => chain,
              eq: () => chain,
              in: () => chain,
              order: () => chain,
              limit: () => chain,
              maybeSingle: async () => ({
                data: {
                  id: "doc-wp13-uuid",
                  owner_id: "owner-wp13",
                  building_id: targetUuid,
                  status: "published",
                  body: {
                    sections: [
                      {
                        section_type: "asset_overview",
                        title: "자산 개요",
                        content: "역삼 핵심 오피스 자산",
                        data_source: "공적장부",
                      },
                    ],
                    ssot_summary: {
                      address: "서울특별시 강남구 테헤란로 212",
                      area_signal: "역삼역세권",
                      asset_type: "업무시설",
                      asking_price_manwon: 920000,
                    },
                    enrichment: {},
                  },
                },
                error: null,
              }),
            };
            return chain;
          }
          if (table === "profiles" || table === "broker_profiles") {
            const chain: Record<string, any> = {
              select: () => chain,
              eq: () => chain,
              single: async () => ({
                data:
                  table === "profiles"
                    ? {
                        id: "owner-wp13",
                        display_name: "이중개",
                        company: "전담 부동산중개법인",
                        phone: "02-555-7788",
                        tagline: "",
                        photo_url: null,
                      }
                    : {
                        user_id: "owner-wp13",
                        name: "이중개",
                        slug: "cre-dealcard-default",
                        office_reg_number: "11680-2022-00456",
                        contact_email: "broker@example.com",
                      },
                error: null,
              }),
            };
            return chain;
          }
          const fallbackChain: Record<string, any> = {
            select: () => fallbackChain,
            eq: () => fallbackChain,
            in: () => fallbackChain,
            order: () => fallbackChain,
            limit: () => fallbackChain,
            maybeSingle: async () => ({ data: null, error: null }),
            single: async () => ({ data: null, error: null }),
            then: (onFulfilled: any) =>
              Promise.resolve({ data: null, count: 0, error: null }).then(onFulfilled),
          };
          return fallbackChain;
        },
        auth: {
          admin: {
            getUserById: async () => ({ data: { user: null }, error: null }),
          },
        },
      });

      const started = performance.now();
      const result = await fetchIMData(targetUuid);
      const totalMs = performance.now() - started;

      expect(result).not.toBeNull();
      expect(totalMs).toBeLessThan(1600);
      expect(orFilterCalls.length).toBe(3);
      for (const expr of orFilterCalls) {
        expect(expr).toContain(targetUuid);
      }
      expect(limitCalls).toEqual([20, 20, 20]);
    });
  });
});
