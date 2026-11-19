// @vitest-environment jsdom
/**
 * @file src/tests/workspace/wave4-ux-routes-and-help.test.tsx
 * @description Wave 4 (WP 4-A ~ 4-D) verification suite:
 *  1. WorkspaceHelpButton header menu (20s help, feedback event, chapter link)
 *  2. InAppBrowserBanner (KakaoTalk WebView vs desktop UA + copyText fallback)
 *  3. proxy() dormant 404s, fail-closed QA gate (404/noindex/cookie), & 307 newsletter redirects
 *  4. D3 daylight / canonical nav hygiene in BrokerMoreMenu & BrokerSeniorLayout
 */

import fs from "node:fs";
import path from "node:path";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextRequest } from "next/server";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const openHelpDrawerSpy = vi.fn();
const copyTextSpy = vi.fn(async () => true);

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/help/SeniorHelpContext", () => ({
  useSeniorHelp: () => ({
    openHelpDrawer: openHelpDrawerSpy,
  }),
}));

vi.mock("@/lib/ux/clipboard", () => ({
  copyText: (...args: Parameters<typeof copyTextSpy>) => copyTextSpy(...args),
  COPY_FAILED_MESSAGE: "복사에 실패했습니다.",
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
    },
  }),
}));

vi.mock("@/lib/env", () => ({
  env: {
    NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
  },
}));

import { WorkspaceHelpButton } from "@/components/workspace/WorkspaceHelpButton";
import { InAppBrowserBanner } from "@/components/public/InAppBrowserBanner";
import { proxy } from "@/proxy";

describe("Wave 4 · Help Entry, In-App WebView Banner, & Route Governance", () => {
  let root: Root;
  let container: HTMLDivElement;
  const originalUaDesc = Object.getOwnPropertyDescriptor(
    window.navigator,
    "userAgent"
  );
  const envBackup = {
    CRE_ENFORCE_QA_GATE: process.env.CRE_ENFORCE_QA_GATE,
    QA_ACCESS_KEY: process.env.QA_ACCESS_KEY,
    QA_TESTER_ACCESS_KEY: process.env.QA_TESTER_ACCESS_KEY,
    QA_BROKER_ACCESS_KEY: process.env.QA_BROKER_ACCESS_KEY,
  };

  function setUa(ua: string) {
    Object.defineProperty(window.navigator, "userAgent", {
      value: ua,
      configurable: true,
    });
  }

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    openHelpDrawerSpy.mockReset();
    copyTextSpy.mockClear();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    if (originalUaDesc) {
      Object.defineProperty(window.navigator, "userAgent", originalUaDesc);
    }
    if (envBackup.CRE_ENFORCE_QA_GATE === undefined) {
      delete process.env.CRE_ENFORCE_QA_GATE;
    } else {
      process.env.CRE_ENFORCE_QA_GATE = envBackup.CRE_ENFORCE_QA_GATE;
    }
    if (envBackup.QA_ACCESS_KEY === undefined) {
      delete process.env.QA_ACCESS_KEY;
    } else {
      process.env.QA_ACCESS_KEY = envBackup.QA_ACCESS_KEY;
    }
    if (envBackup.QA_TESTER_ACCESS_KEY === undefined) {
      delete process.env.QA_TESTER_ACCESS_KEY;
    } else {
      process.env.QA_TESTER_ACCESS_KEY = envBackup.QA_TESTER_ACCESS_KEY;
    }
    if (envBackup.QA_BROKER_ACCESS_KEY === undefined) {
      delete process.env.QA_BROKER_ACCESS_KEY;
    } else {
      process.env.QA_BROKER_ACCESS_KEY = envBackup.QA_BROKER_ACCESS_KEY;
    }
  });

  it("1. WorkspaceHelpButton renders ❓ 사용법 and triggers 20s drawer, feedback event, and tutorial link", async () => {
    const feedbackSpy = vi.fn();
    window.addEventListener("credeal:open-feedback", feedbackSpy);

    try {
      await act(async () => {
        root.render(<WorkspaceHelpButton workspace="dealcards" />);
      });

      const trigger = container.querySelector(
        '[data-testid="workspace-help-trigger"]'
      ) as HTMLButtonElement | null;
      expect(trigger).not.toBeNull();
      expect(trigger!.textContent).toContain("사용법");
      expect(trigger!.className).toContain("min-h-[44px]");

      await act(async () => {
        trigger!.click();
      });

      const menu = container.querySelector('[data-testid="workspace-help-menu"]');
      expect(menu).not.toBeNull();

      const tutorialLink = container.querySelector(
        '[data-testid="workspace-help-tutorial-link"]'
      ) as HTMLAnchorElement | null;
      expect(tutorialLink?.getAttribute("href")).toBe("/broker/tutorial#module-02");

      const btn20s = container.querySelector(
        '[data-testid="workspace-help-20s-btn"]'
      ) as HTMLButtonElement | null;
      expect(btn20s).not.toBeNull();
      await act(async () => {
        btn20s!.click();
      });
      expect(openHelpDrawerSpy).toHaveBeenCalledWith("module-02");

      // Re-open menu and trigger 10s feedback custom event
      await act(async () => {
        trigger!.click();
      });
      const feedbackBtn = container.querySelector(
        '[data-testid="workspace-help-feedback-btn"]'
      ) as HTMLButtonElement | null;
      await act(async () => {
        feedbackBtn!.click();
      });
      expect(feedbackSpy).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener("credeal:open-feedback", feedbackSpy);
    }
  });

  it("2. InAppBrowserBanner stays hidden on desktop UA and renders Kakao WebView escape controls on KAKAOTALK UA", async () => {
    setUa(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36"
    );
    await act(async () => {
      root.render(<InAppBrowserBanner />);
    });
    expect(container.querySelector('[data-testid="inapp-webview-banner"]')).toBeNull();

    setUa(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) Mobile/15E148 KAKAOTALK 10.6.2"
    );
    await act(async () => {
      root.render(<InAppBrowserBanner />);
    });

    const banner = container.querySelector('[data-testid="inapp-webview-banner"]');
    expect(banner).not.toBeNull();
    expect(banner!.textContent).toContain("외부 브라우저(Safari/Chrome)로 열기");

    const copyBtn = container.querySelector(
      '[data-testid="copy-inapp-link-btn"]'
    ) as HTMLButtonElement | null;
    expect(copyBtn).not.toBeNull();
    await act(async () => {
      copyBtn!.click();
    });
    expect(copyTextSpy).toHaveBeenCalledTimes(1);
  });

  it("3. proxy() returns 404 for dormant routes, gates QA routes fail-closed with noindex, and 307-redirects legacy newsletter routes", async () => {
    for (const dormantPath of ["/agora", "/services", "/building-radar/gangnam"]) {
      const res = await proxy(new NextRequest(`https://credeal.net${dormantPath}`));
      expect(res.status).toBe(404);
      expect(res.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    }

    process.env.CRE_ENFORCE_QA_GATE = "1";
    process.env.QA_ACCESS_KEY = "master-key-2026";
    process.env.QA_TESTER_ACCESS_KEY = "tester-key-2026";
    process.env.QA_BROKER_ACCESS_KEY = "broker-key-2026";

    for (const qaPath of [
      "/qa-signoff",
      "/testguide",
      "/qa-tester/signoff",
      "/qa-broker/signoff",
      "/qa-showcase",
      "/newsletter-inbox-test",
      "/dealcard-im-test",
    ]) {
      const unauthRes = await proxy(new NextRequest(`https://credeal.net${qaPath}`));
      expect(unauthRes.status).toBe(404);
      expect(unauthRes.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");

      const wrongRes = await proxy(
        new NextRequest(`https://credeal.net${qaPath}?qaKey=invalid-key`)
      );
      expect(wrongRes.status).toBe(404);

      const queryRes = await proxy(
        new NextRequest(`https://credeal.net${qaPath}?qaKey=master-key-2026`)
      );
      expect(queryRes.status).toBe(200);
      expect(queryRes.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
      expect(queryRes.cookies.get("cre_qa_key")?.value).toBe("master-key-2026");

      const headerRes = await proxy(
        new NextRequest(`https://credeal.net${qaPath}`, {
          headers: { "x-qa-access-key": "tester-key-2026" },
        })
      );
      expect(headerRes.status).toBe(200);
      expect(headerRes.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    }

    // Unauthenticated access to protected legacy newsletter route redirects to /login first
    const unauthMag = await proxy(
      new NextRequest("https://credeal.net/broker/magazine-editor?mode=simple")
    );
    expect(unauthMag.status).toBe(307);
    expect(unauthMag.headers.get("location")).toContain("/login");

    // Authenticated/E2E access to /broker/w/magazine & /broker/magazine-editor 308-redirects to /broker/w/newsletter
    const magRedirect1 = await proxy(
      new NextRequest("https://credeal.net/broker/w/magazine?edition=ed-1&step=send", {
        headers: { "x-playwright-test": "true" },
      })
    );
    expect(magRedirect1.status).toBe(308);
    expect(magRedirect1.headers.get("location")).toBe(
      "https://credeal.net/broker/w/newsletter?edition=ed-1&step=send"
    );

    const magRedirect2 = await proxy(
      new NextRequest("https://credeal.net/broker/magazine-editor?mode=simple", {
        headers: { "x-playwright-test": "true" },
      })
    );
    expect(magRedirect2.status).toBe(308);
    expect(magRedirect2.headers.get("location")).toBe(
      "https://credeal.net/broker/w/newsletter?mode=simple"
    );
  });

  it("4. D3 Daylight & canonical links guard: BrokerMoreMenu & BrokerSeniorLayout omit dark surfaces and legacy hrefs", () => {
    const moreMenuSrc = fs.readFileSync(
      path.resolve(process.cwd(), "src/components/layout/BrokerMoreMenu.tsx"),
      "utf-8"
    );
    expect(moreMenuSrc).toContain('"/broker/w/newsletter"');
    expect(moreMenuSrc).toContain('"/broker/w/inbox"');
    expect(moreMenuSrc).not.toContain('href: "/broker/magazine-editor');
    expect(moreMenuSrc).not.toContain("#0e1424");

    const seniorLayoutSrc = fs.readFileSync(
      path.resolve(process.cwd(), "src/components/layout/BrokerSeniorLayout.tsx"),
      "utf-8"
    );
    expect(seniorLayoutSrc).not.toContain("broker-theme-toggle-btn");
  });
});
