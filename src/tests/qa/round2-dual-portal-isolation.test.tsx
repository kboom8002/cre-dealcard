// @vitest-environment jsdom
/**
 * @file src/tests/qa/round2-dual-portal-isolation.test.tsx
 * @description R2-WP-05 Regression & Isolation Suite:
 *   1. Dual-key server enforcement (403 FORBIDDEN_QA_ROLE cross-role writes)
 *   2. Forced pin `authorRole` from x-qa-access-key role
 *   3. Round-2 SSoT integrity (28 R1 items + 6 R2 missions + CRE lexicon)
 *   4. Tester portal UI isolation (/qa-tester/showcase & /qa-tester/signoff)
 *   5. Broker portal UI isolation & tester handoff badge (/qa-broker/showcase & /qa-broker/signoff)
 */
import React, { act } from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { NextRequest } from "next/server";

vi.mock("next/navigation", () => ({
  usePathname: () => "/qa-tester/signoff",
  useSearchParams: () => new URLSearchParams("qa=1"),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => {
    throw new Error("Unit test offline client");
  },
}));

vi.mock("@/lib/auth-guard", () => ({
  requireBroker: vi
    .fn()
    .mockResolvedValue({ error: "unauthenticated", user: null }),
}));

import { GET, POST } from "@/app/api/public/qa-workbench/route";
import QaTesterShowcasePage from "@/app/qa-tester/showcase/page";
import QaTesterSignoffPage from "@/app/qa-tester/signoff/page";
import QaBrokerShowcasePage from "@/app/qa-broker/showcase/page";
import QaBrokerSignoffPage from "@/app/qa-broker/signoff/page";
import {
  ROUND1_REMEDIATION_28_ITEMS,
  ROUND2_CORE_MISSIONS_6,
} from "@/lib/qa/round2-verification-data";

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function buildPost(
  body: Record<string, unknown>,
  accessKey?: string
): NextRequest {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (accessKey) {
    headers["x-qa-access-key"] = accessKey;
  }
  return new NextRequest("http://localhost:3000/api/public/qa-workbench", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("Round-2 Dual-Portal Separation & Dual-Key Isolation (R2-WP-01 ~ R2-WP-05)", () => {
  const savedEnv = { ...process.env };
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
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
    for (const k of Object.keys(process.env)) {
      if (!(k in savedEnv)) {
        delete process.env[k];
      }
    }
    Object.assign(process.env, savedEnv);
  });

  it("1. Enforces HTTP 403 cross-role write isolation while allowing same-role and master writes", async () => {
    process.env.QA_ACCESS_KEY = "pm-master-key-2026";
    process.env.QA_TESTER_ACCESS_KEY = "tester-key-2026";
    process.env.QA_BROKER_ACCESS_KEY = "broker-key-2026";

    // Tester key trying to mutate broker sessions -> 403
    const testerToBrokerShowcase = await POST(
      buildPost(
        {
          mode: "sync",
          sessionId: "qa-output-showcase-broker",
          records: { "NL-D1": { status: "PASS" } },
        },
        "tester-key-2026"
      )
    );
    expect(testerToBrokerShowcase.status).toBe(403);
    expect((await testerToBrokerShowcase.json()).code).toBe("FORBIDDEN_QA_ROLE");

    const testerToBrokerSignoff = await POST(
      buildPost(
        {
          mode: "submit",
          sessionId: "qa-signoff-broker",
          records: {},
        },
        "tester-key-2026"
      )
    );
    expect(testerToBrokerSignoff.status).toBe(403);

    // Broker key trying to mutate tester sessions -> 403
    const brokerToTesterShowcase = await POST(
      buildPost(
        {
          mode: "sync",
          sessionId: "qa-output-showcase-tester-r2",
          records: { "DC-06": { status: "PASS" } },
        },
        "broker-key-2026"
      )
    );
    expect(brokerToTesterShowcase.status).toBe(403);
    expect((await brokerToTesterShowcase.json()).code).toBe("FORBIDDEN_QA_ROLE");

    const brokerToTesterSignoff = await POST(
      buildPost(
        {
          mode: "submit",
          sessionId: "qa-signoff-tester-r2",
          records: {},
        },
        "broker-key-2026"
      )
    );
    expect(brokerToTesterSignoff.status).toBe(403);

    // Own-role writes -> 200
    const testerOwn = await POST(
      buildPost(
        {
          mode: "sync",
          sessionId: "qa-output-showcase-tester-r2",
          records: { "DC-06": { status: "PASS" } },
        },
        "tester-key-2026"
      )
    );
    expect(testerOwn.status).toBe(200);

    const brokerOwn = await POST(
      buildPost(
        {
          mode: "sync",
          sessionId: "qa-output-showcase-broker",
          records: { "NL-D1": { status: "PASS" } },
        },
        "broker-key-2026"
      )
    );
    expect(brokerOwn.status).toBe(200);

    // Master key can write to both -> 200
    const masterTester = await POST(
      buildPost(
        {
          mode: "sync",
          sessionId: "qa-signoff-tester-r2",
          records: {},
        },
        "pm-master-key-2026"
      )
    );
    const masterBroker = await POST(
      buildPost(
        {
          mode: "sync",
          sessionId: "qa-signoff-broker",
          records: {},
        },
        "pm-master-key-2026"
      )
    );
    expect(masterTester.status).toBe(200);
    expect(masterBroker.status).toBe(200);
  });

  it("2. Forces pin authorRole from x-qa-access-key role and blocks cross-role pin sessions with 403", async () => {
    process.env.QA_TESTER_ACCESS_KEY = "tester-key-2026";
    process.env.QA_BROKER_ACCESS_KEY = "broker-key-2026";

    // Spoofed body.authorRole="broker" with tester key on tester session -> stored as "tester"
    const testerPinRes = await POST(
      buildPost(
        {
          mode: "pin",
          sessionId: "qa-signoff-tester-r2",
          workspace: "dealcards",
          routePath: "/broker/w/dealcards",
          targetSelector: "#btn",
          targetLabel: "생성",
          note: "테스터 키 강제 역할 검증",
          authorRole: "broker",
        },
        "tester-key-2026"
      )
    );
    expect(testerPinRes.status).toBe(200);
    const testerPinJson = await testerPinRes.json();
    expect(testerPinJson.pin?.authorRole).toBe("tester");

    // Spoofed body.authorRole="tester" with broker key on broker session -> stored as "broker"
    const brokerPinRes = await POST(
      buildPost(
        {
          mode: "pin",
          sessionId: "qa-output-showcase-broker",
          workspace: "newsletter",
          routePath: "/qa-broker/showcase",
          targetSelector: "#nl",
          targetLabel: "NL-M1",
          note: "중개인 키 강제 역할 검증",
          authorRole: "tester",
        },
        "broker-key-2026"
      )
    );
    expect(brokerPinRes.status).toBe(200);
    const brokerPinJson = await brokerPinRes.json();
    expect(brokerPinJson.pin?.authorRole).toBe("broker");

    // Tester key cannot pin into broker session -> 403
    const forbiddenPinRes = await POST(
      buildPost(
        {
          mode: "pin",
          sessionId: "qa-output-showcase-broker",
          workspace: "newsletter",
          routePath: "/qa-broker/showcase",
          targetSelector: "#nl",
          targetLabel: "NL-M1",
          note: "크로스 세션 차단",
        },
        "tester-key-2026"
      )
    );
    expect(forbiddenPinRes.status).toBe(403);

    const listRes = await GET(
      new NextRequest("http://localhost:3000/api/public/qa-workbench?mode=pins")
    );
    const listJson = await listRes.json();
    expect(listJson.pins).toHaveLength(2);
  });

  it("3. Validates Round-2 28 remediation items, 6 core missions, and strict CRE lexicon compliance", () => {
    expect(ROUND1_REMEDIATION_28_ITEMS).toHaveLength(28);
    expect(
      ROUND1_REMEDIATION_28_ITEMS.filter((i) => i.area === "showcase")
    ).toHaveLength(16);
    expect(
      ROUND1_REMEDIATION_28_ITEMS.filter((i) => i.area === "hub_workspace")
    ).toHaveLength(12);
    expect(ROUND2_CORE_MISSIONS_6).toHaveLength(6);

    const serialized = JSON.stringify({
      r1: ROUND1_REMEDIATION_28_ITEMS,
      r2: ROUND2_CORE_MISSIONS_6,
    });
    expect(serialized).not.toContain("임대형수익용");
  });

  it("4. Renders /qa-tester/showcase & /qa-tester/signoff with zero broker verdict or rubric controls", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, pins: [], found: false }),
      })
    );

    await act(async () => {
      root.render(<QaTesterShowcasePage />);
    });

    expect(
      container.querySelector('[data-testid="tester-r1-context-banner"]')
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="tester-tech-checklist-panel"]')
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="tester-case-pass-btn"]')
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="tester-defect-form"]')
    ).not.toBeNull();
    // Must expose ZERO broker verdict UI
    expect(
      container.querySelector('[data-testid="showcase-verdict-pass"]')
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="showcase-verdict-polish"]')
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="showcase-verdict-fail"]')
    ).toBeNull();
    expect(container.textContent).not.toContain("중개인 산출물 판정");
    expect(container.textContent).not.toContain("중개인님이 원하시는 표현");

    await act(async () => {
      root.render(<QaTesterSignoffPage />);
    });

    expect(
      container.querySelector('[data-testid="tester-step-a-r1-28"]')
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="r1-card-R1-01"]')
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="r1-card-R1-28"]')
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="tester-step-b-missions-6"]')
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="r2-mission-card-R2-M1"]')
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="r2-mission-card-R2-M6"]')
    ).not.toBeNull();
    // Must expose ZERO broker rubric UI
    expect(
      container.querySelector('[data-testid="broker-rubric-send_readiness-5"]')
    ).toBeNull();
    expect(container.textContent).not.toContain("전문가 6대 기준");
  });

  it("5. Renders /qa-broker/showcase & /qa-broker/signoff with tester handoff badge and zero tester/dev jargon", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("sessionId=qa-output-showcase-tester-r2")) {
          return {
            ok: true,
            json: async () => ({
              ok: true,
              found: true,
              session: {
                records: {
                  "NL-D1": { status: "PASS" },
                  "DC-06": { status: "ISSUE" },
                },
              },
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({ ok: true, found: false, pins: [] }),
        };
      })
    );

    await act(async () => {
      root.render(<QaBrokerShowcasePage />);
    });

    const verifiedBadge = container.querySelector(
      '[data-testid="broker-tester-verified-badge"]'
    );
    expect(verifiedBadge?.textContent).toContain("테스터 기술검증 완료");
    expect(
      container.querySelector('[data-testid="showcase-verdict-pass"]')
    ).not.toBeNull();
    // Switching to dealcard -> DC-06 shows patch-checking badge
    const dealcardTab = container.querySelector(
      '[data-testid="showcase-tab-dealcard"]'
    ) as HTMLButtonElement;
    await act(async () => {
      dealcardTab.click();
    });
    const dc06Btn = container.querySelector(
      '[data-testid="showcase-case-DC-06"]'
    ) as HTMLButtonElement;
    await act(async () => {
      dc06Btn.click();
    });
    expect(
      container.querySelector('[data-testid="broker-tester-verified-badge"]')
        ?.textContent
    ).toContain("기술 패치 확인 중");

    expect(
      container.querySelector('[data-testid="tester-r1-context-banner"]')
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="tester-defect-form"]')
    ).toBeNull();
    expect(container.textContent).not.toContain("Vitest");
    expect(container.textContent).not.toContain("preflight");
    expect(container.textContent).not.toContain("Blocker");

    await act(async () => {
      root.render(<QaBrokerSignoffPage />);
    });

    expect(
      container.querySelector('[data-testid="broker-verdict-summary-card"]')
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="broker-session-agenda-card"]')
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="broker-rubric-submit-card"]')
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="broker-rubric-send_readiness-5"]')
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="broker-signoff-submit-btn"]')
    ).not.toBeNull();

    // Strict zero tester/dev jargon guard
    expect(container.textContent).not.toContain("R1-01");
    expect(container.textContent).not.toContain("R2-M1");
    expect(container.textContent).not.toContain("일반 테스터 미션");
    expect(container.textContent).not.toContain("Vitest");
    expect(container.textContent).not.toContain("preflight");
    expect(container.textContent).not.toContain("Blocker");
    expect(container.textContent).not.toContain("auto_probe_all");
  });
});
