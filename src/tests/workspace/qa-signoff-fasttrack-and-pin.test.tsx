// @vitest-environment jsdom
/**
 * @file src/tests/workspace/qa-signoff-fasttrack-and-pin.test.tsx
 * @description Wave 2 verification suite for /qa-signoff 20-minute human fast-track hub,
 * In-App QA Pin overlay (?qa=1), and /api/public/qa-workbench ("auto_probe_all", "pin", "mode=pins").
 */
import React, { act } from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { NextRequest } from "next/server";

vi.mock("next/navigation", () => ({
  usePathname: () => "/broker/w/dealcards",
  useSearchParams: () => new URLSearchParams("qa=1"),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => {
    throw new Error("Unit test offline client");
  },
}));

vi.mock("@/lib/auth-guard", () => ({
  requireBroker: vi.fn().mockResolvedValue({ error: "unauthenticated", user: null }),
}));

import { GET, POST } from "@/app/api/public/qa-workbench/route";
import QaSignoffHubPage from "@/app/qa-signoff/page";
import { QaFeedbackPinWidget } from "@/components/workspace/QaFeedbackPinWidget";
import { FASTTRACK_STEPS } from "@/lib/testguide/qa-signoff-fasttrack-data";

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function buildPostRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/public/qa-workbench", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function setNativeValue(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string
) {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) {
    setter.call(el, value);
  } else {
    el.value = value;
  }
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("Track B / Wave 2: /qa-signoff Hub & In-App QA Pin Widget", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    window.localStorage.clear();
    globalThis.__CRE_QA_WORKBENCH_PINS__ = [];
    globalThis.__CRE_QA_WORKBENCH_SESSIONS__ = new Map();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  it("executes 4/4 deterministic invariants via POST mode=auto_probe_all", async () => {
    const req = buildPostRequest({ mode: "auto_probe_all" });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.totalCount).toBe(4);
    expect(json.passedCount).toBe(4);
    expect(Array.isArray(json.checks)).toBe(true);
    for (const chk of json.checks) {
      expect(chk.passed).toBe(true);
    }
    expect(json.readyLinks?.dealcards).toBe("/broker/w/dealcards?qa=1");
    expect(json.readyLinks?.im).toBe("/broker/w/im?qa=1");
    expect(json.readyLinks?.newsletter).toBe("/broker/w/newsletter?qa=1");
    expect(json.readyLinks?.inbox).toBe("/broker/w/inbox?qa=1");
  });

  it("persists QA feedback pins via POST mode=pin and returns them from GET ?mode=pins", async () => {
    const pinNote = "[E2E검증] 미리보기 카드 하단 버튼 글자 크기를 키워 주세요";
    const postRes = await POST(
      buildPostRequest({
        mode: "pin",
        sessionId: "signoff-test-session-1",
        workspace: "dealcards",
        routePath: "/broker/w/dealcards",
        targetSelector: '[data-testid="kakao-bubble-detail-btn"]',
        targetLabel: "상세보기",
        note: pinNote,
        severity: "critical",
        viewport: { width: 390, height: 844 },
        fontScale: "xlarge",
      })
    );
    expect(postRes.status).toBe(200);
    const postJson = await postRes.json();
    expect(postJson.ok).toBe(true);
    expect(postJson.pin?.note).toBe(pinNote);
    expect(postJson.pin?.severity).toBe("critical");

    const getReq = new NextRequest(
      "http://localhost:3000/api/public/qa-workbench?mode=pins"
    );
    const getRes = await GET(getReq);
    expect(getRes.status).toBe(200);
    const getJson = await getRes.json();
    expect(getJson.ok).toBe(true);
    expect(
      getJson.pins.some(
        (p: { note?: string; severity?: string }) =>
          p.note === pinNote && p.severity === "critical"
      )
    ).toBe(true);
  });

  it("renders QaFeedbackPinWidget on ?qa=1 and submits a pin via the overlay UI", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        pin: { id: "pin-mock-1" },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      root.render(<QaFeedbackPinWidget workspace="dealcards" />);
    });

    const fab = container.querySelector(
      '[data-testid="qa-pin-fab"]'
    ) as HTMLButtonElement | null;
    expect(fab).not.toBeNull();

    await act(async () => {
      fab!.click();
    });

    const critBtn = container.querySelector(
      '[data-testid="qa-pin-severity-critical"]'
    ) as HTMLButtonElement | null;
    const noteInput = container.querySelector(
      '[data-testid="qa-pin-note-input"]'
    ) as HTMLTextAreaElement | null;
    const submitBtn = container.querySelector(
      '[data-testid="qa-pin-submit-btn"]'
    ) as HTMLButtonElement | null;

    expect(critBtn).not.toBeNull();
    expect(noteInput).not.toBeNull();
    expect(submitBtn).not.toBeNull();

    await act(async () => {
      critBtn!.click();
      setNativeValue(noteInput!, "딜카드 4분할 텍스트가 살짝 좁습니다");
    });

    await act(async () => {
      submitBtn!.click();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/public/qa-workbench");
    const sent = JSON.parse(String(init.body));
    expect(sent.mode).toBe("pin");
    expect(sent.workspace).toBe("dealcards");
    expect(sent.severity).toBe("critical");
    expect(sent.note).toBe("딜카드 4분할 텍스트가 살짝 좁습니다");

    const feedback = container.querySelector(
      '[data-testid="qa-pin-feedback"]'
    );
    expect(feedback?.textContent).toContain("검수 허브에 화면 메모를 저장했습니다.");
  });

  it("renders QaSignoffHubPage, runs 1-click Auto-Probe, and transitions Fast-Track verdict states", async () => {
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        const parsed = JSON.parse(String(init.body || "{}"));
        if (parsed.mode === "auto_probe_all") {
          return {
            ok: true,
            json: async () => ({
              ok: true,
              checkedAt: new Date().toISOString(),
              authenticated: true,
              passedCount: 4,
              totalCount: 4,
              checks: [
                {
                  id: "dealcard-blind-guard",
                  title: "딜카드 블라인드 방어",
                  passed: true,
                  detail: "통과",
                },
                {
                  id: "rent-roll-tsv-engine",
                  title: "IM 렌트롤 TSV 엔진",
                  passed: true,
                  detail: "통과",
                },
                {
                  id: "share-token-governance",
                  title: "공유 토큰 검증",
                  passed: true,
                  detail: "통과",
                },
                {
                  id: "public-address-masking",
                  title: "공개 주소 마스킹",
                  passed: true,
                  detail: "통과",
                },
              ],
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({ ok: true }),
        };
      }
      return {
        ok: true,
        json: async () => ({ ok: true, pins: [] }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      root.render(<QaSignoffHubPage />);
    });

    const probeBtn = container.querySelector(
      '[data-testid="run-auto-probe-all-btn"]'
    ) as HTMLButtonElement | null;
    expect(probeBtn).not.toBeNull();

    await act(async () => {
      probeBtn!.click();
    });

    expect(
      container.querySelector('[data-testid="auto-probe-item-dealcard-blind-guard"]')
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="auto-probe-results"]')?.textContent
    ).toContain("4/4 자동 통과");

    for (const step of FASTTRACK_STEPS) {
      const passBtn = container.querySelector(
        `[data-testid="fasttrack-pass-${step.id}"]`
      ) as HTMLButtonElement | null;
      expect(passBtn).not.toBeNull();
      await act(async () => {
        passBtn!.click();
      });
    }

    const badge = container.querySelector('[data-testid="signoff-verdict-badge"]');
    expect(badge?.textContent).toContain("GO · 출시 승인 가능");
  });
});
