// @vitest-environment jsdom
// @vitest-environment-options { "url": "http://localhost:3000/qa-broker/full-loop?qaKey=broker-secret-token-777" }
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import QaBrokerFullLoopPage from "@/app/qa-broker/full-loop/page";
import { QaFeedbackPinWidget } from "@/components/workspace/QaFeedbackPinWidget";
import {
  QA_ACTIVE_ROLE_STORAGE,
  QA_BROKER_KEY_STORAGE,
} from "@/lib/qa/qa-client-auth";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let mockPathname = "/qa-broker/full-loop";
let mockSearch = "qaKey=broker-secret-token-777";

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useSearchParams: () => new URLSearchParams(mockSearch),
}));

describe("Broker Full-Loop -> Workspace ?qa=1&qaRole=broker auto-propagation", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    mockPathname = "/qa-broker/full-loop";
    mockSearch = "qaKey=broker-secret-token-777";
    window.history.replaceState({}, "", `${mockPathname}?${mockSearch}`);

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("verifyQaKey=1")) {
        const hdrs = new Headers(init?.headers);
        const key = hdrs.get("x-qa-access-key");
        if (key === "broker-secret-token-777") {
          return new Response(JSON.stringify({ ok: true, pins: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ ok: false }), { status: 403 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    document.body.innerHTML = "";
  });

  it("stores qaKey into broker localStorage on /qa-broker/full-loop and attaches qa=1&qaRole=broker to workspace launch links so QaFeedbackPinWidget opens in new tabs", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<QaBrokerFullLoopPage />);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 25));
    });

    expect(window.localStorage.getItem(QA_BROKER_KEY_STORAGE)).toBe(
      "broker-secret-token-777",
    );
    expect(window.localStorage.getItem(QA_ACTIVE_ROLE_STORAGE)).toBe("broker");

    const s2Link = container.querySelector(
      '[data-testid="step-workspace-launch-B1-S2"]',
    ) as HTMLAnchorElement | null;
    expect(s2Link).not.toBeNull();
    const href = s2Link?.getAttribute("href") || "";
    expect(href).toContain("/broker/w/dealcards");
    expect(href).toContain("new=1");
    expect(href).toContain("qa=1");
    expect(href).toContain("qaRole=broker");
    expect(href).not.toContain("broker-secret-token-777");

    // Simulate new tab (`target="_blank" rel="noopener"`): fresh sessionStorage, shared localStorage!
    window.sessionStorage.clear();
    mockPathname = "/broker/w/dealcards";
    mockSearch = "new=1&qa=1&qaRole=broker";
    window.history.replaceState({}, "", `${mockPathname}?${mockSearch}`);

    const prevNodeEnv = process.env.NODE_ENV;
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    try {
      await act(async () => {
        root.render(<QaFeedbackPinWidget workspace="dealcards" />);
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 25));
      });

      const triggerBtn = container.querySelector(
        '[data-testid="qa-pin-fab"]',
      ) as HTMLButtonElement | null;
      expect(triggerBtn).not.toBeNull();
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = prevNodeEnv;
      await act(async () => {
        root.unmount();
      });
    }
  });
});
