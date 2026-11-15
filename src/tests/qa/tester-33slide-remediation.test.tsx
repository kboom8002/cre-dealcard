// @vitest-environment jsdom
/**
 * @file src/tests/qa/tester-33slide-remediation.test.tsx
 * @description 33-slide tester review (QA-WP-01 ~ QA-WP-12) regression suite:
 *   1. Comma-formatted memo parsing ("2,000억", "4,313평") & DC-06/DC-08 showcase contracts
 *   2. /api/public/qa-sample-kit ZIP + UTF-8 BOM CSV generation
 *   3. QA_ACCESS_KEY x-qa-access-key authorization & screenshot preservation on GET ?mode=pins
 *   4. /qa-signoff v4.0 UI contracts (no "4개 작업실", M1 copy, M2 sample kit links, examples modal, inline pin thumbs + lightbox, 3-line summary)
 *   5. /qa-showcase fontScale isolation (desktop parent stays 100%, resets to grid on case switch)
 */
import React, { act } from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { NextRequest } from "next/server";
import JSZip from "jszip";

vi.mock("next/navigation", () => ({
  usePathname: () => "/qa-signoff",
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

import { parseMemoFast } from "@/app/api/broker/deal-card/fast-fill/route";
import { parseMemoToObservations } from "@/domain/building/memo-intake/parser";
import { OUTPUT_SHOWCASE_SCENARIOS } from "@/lib/qa/output-showcase-scenarios";
import { GET as getSampleKit } from "@/app/api/public/qa-sample-kit/route";
import { GET as getQaWorkbench, POST as postQaWorkbench } from "@/app/api/public/qa-workbench/route";
import QaSignoffHubPage from "@/app/qa-signoff/page";
import QaShowcasePage from "@/app/qa-showcase/page";
import { formatKrPhoneInput } from "@/lib/format/phone";

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("33-Slide Tester Remediation Regression Suite (QA-WP-01 ~ QA-WP-12)", () => {
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

  it("1. Parses comma-formatted 2,000억 and 4,313평 accurately without truncating at commas", () => {
    const memo = "강남구 삼성동 빌딩 매각가 2,000억, 연면적 4,313평, 대지 520평, 임대수익용";
    const obsSet = parseMemoToObservations(memo);
    const priceObs = obsSet.observations.find((o) => o.candidateType === "asking_price");
    expect(priceObs).toBeDefined();
    expect(Number(priceObs?.candidateValue)).toBe(2000 * 100_000_000);

    const fast = parseMemoFast(memo);
    expect(fast.gfaPyung).toBe(4313);
    expect(fast.landAreaPyung).toBe(520);
    expect(fast.priceBand).toContain("2,000");
    expect(fast.priceBand).not.toBe("10억 미만");

    const dc06 = OUTPUT_SHOWCASE_SCENARIOS.find((s) => s.id === "DC-06");
    const dc08 = OUTPUT_SHOWCASE_SCENARIOS.find((s) => s.id === "DC-08");
    expect(dc06?.title).toContain("2,000억");
    expect(dc06?.inputSummary).toContain("2,000억");
    if (dc06?.category === "dealcard") {
      expect(dc06.fastFillMemo).toContain("4,313평");
    }
    expect(dc08?.category).toBe("dealcard");
    if (dc08?.category === "dealcard") {
      expect(dc08.buildingId).toBe("5c0ca5e0-0001-4000-8000-000000000008");
    }
    expect(dc08?.title).toContain("가격 협의");

    for (const sc of OUTPUT_SHOWCASE_SCENARIOS) {
      expect(JSON.stringify(sc)).not.toContain("임대형수익용");
    }
  });

  it("2. Formats Korean mobile & landline phone numbers cleanly", () => {
    expect(formatKrPhoneInput("01012345678")).toBe("010-1234-5678");
    expect(formatKrPhoneInput("0212345678")).toBe("02-1234-5678");
    expect(formatKrPhoneInput("0319876543")).toBe("031-987-6543");
  });

  it("3. Serves ZIP sample kit and UTF-8 BOM CSV from /api/public/qa-sample-kit", async () => {
    const zipRes = await getSampleKit(
      new NextRequest("http://localhost:3000/api/public/qa-sample-kit")
    );
    expect(zipRes.status).toBe(200);
    expect(zipRes.headers.get("content-type")).toContain("application/zip");
    const buf = await zipRes.arrayBuffer();
    const zip = await JSZip.loadAsync(buf);
    expect(zip.file("README.txt")).not.toBeNull();
    expect(zip.file("rentroll/credeal_sample_rentroll.csv")).not.toBeNull();
    expect(zip.file("memos/01_imdaesuik_lease_memo.txt")).not.toBeNull();
    expect(zip.file("contacts/credeal_sample_contacts_10.csv")).not.toBeNull();

    const csvRes = await getSampleKit(
      new NextRequest("http://localhost:3000/api/public/qa-sample-kit?format=csv")
    );
    expect(csvRes.status).toBe(200);
    const csvBuf = Buffer.from(await csvRes.arrayBuffer());
    expect(csvBuf[0]).toBe(0xef);
    expect(csvBuf[1]).toBe(0xbb);
    expect(csvBuf[2]).toBe(0xbf);
    expect(csvBuf.toString("utf8")).toContain("임차인(상호)");
  });

  it("4. Preserves screenshotDataUrl on GET ?mode=pins with valid QA_ACCESS_KEY while stripping for anonymous viewers in prod", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    delete process.env.CI;
    delete process.env.NEXT_PHASE;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://prod-instance.supabase.co";
    process.env.QA_ACCESS_KEY = "credeal-test-access-key-2026";

    const fakeShot = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/";

    const unauthPost = await postQaWorkbench(
      new NextRequest("http://localhost:3000/api/public/qa-workbench", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "pin",
          workspace: "im",
          routePath: "/broker/w/im",
          targetSelector: "#im-btn",
          targetLabel: "저장",
          note: "미인증 테스트",
          screenshotDataUrl: fakeShot,
        }),
      })
    );
    expect(unauthPost.status).toBe(401);

    const keyPost = await postQaWorkbench(
      new NextRequest("http://localhost:3000/api/public/qa-workbench", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-qa-access-key": "credeal-test-access-key-2026",
        },
        body: JSON.stringify({
          mode: "pin",
          workspace: "im",
          routePath: "/broker/w/im",
          targetSelector: "#im-btn",
          targetLabel: "저장",
          note: "인증키 스크린샷 저장 테스트",
          screenshotDataUrl: fakeShot,
        }),
      })
    );
    expect(keyPost.status).toBe(200);
    const keyPostJson = await keyPost.json();
    expect(keyPostJson.pin?.screenshotDataUrl).toBe(fakeShot);

    const anonGet = await getQaWorkbench(
      new NextRequest("http://localhost:3000/api/public/qa-workbench?mode=pins")
    );
    const anonGetJson = await anonGet.json();
    expect(anonGetJson.pins[0]?.screenshotDataUrl).toBeNull();

    const keyGet = await getQaWorkbench(
      new NextRequest("http://localhost:3000/api/public/qa-workbench?mode=pins", {
        headers: { "x-qa-access-key": "credeal-test-access-key-2026" },
      })
    );
    const keyGetJson = await keyGet.json();
    expect(keyGetJson.pins[0]?.screenshotDataUrl).toBe(fakeShot);
  });

  it("5. Renders v4.0 /qa-signoff without internal jargon, shows inline pin thumbnails, modals, sample kit buttons, and 3-line summary copy", async () => {
    const fakeShot = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        pins: [
          {
            id: "pin-inline-1",
            sessionId: "signoff-1",
            workspace: "dealcards",
            routePath: "/broker/w/dealcards",
            targetSelector: "#dc-btn",
            targetLabel: "생성하기",
            note: "인라인 썸네일 테스트",
            severity: "major",
            screenshotDataUrl: fakeShot,
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      root.render(<QaSignoffHubPage />);
    });

    expect(container.textContent).not.toContain("4개 작업실");
    expect(container.querySelector('[data-testid="qa-key-status-btn"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="copy-kakao-summary-btn"]')).not.toBeNull();

    const thumbBtn = container.querySelector(
      '[data-testid="qa-pin-thumb-pin-inline-1"]'
    ) as HTMLButtonElement | null;
    expect(thumbBtn).not.toBeNull();

    await act(async () => {
      thumbBtn!.click();
    });
    expect(
      container.querySelector('[data-testid="qa-pin-screenshot-lightbox"]')
    ).not.toBeNull();

    const testerTab = container.querySelector(
      '[data-testid="qa-track-tab-tester"]'
    ) as HTMLButtonElement;
    await act(async () => {
      testerTab.click();
    });

    expect(
      container.querySelector('[data-testid="m1-copy-sample-memo-btn"]')
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="m2-download-kit-btn"]')
    ).not.toBeNull();

    const exampleBtn = container.querySelector(
      '[data-testid="mission-example-btn-M1"]'
    ) as HTMLButtonElement;
    await act(async () => {
      exampleBtn.click();
    });
    expect(
      container.querySelector('[data-testid="qa-reference-example-modal"]')
    ).not.toBeNull();
  });

  it("6. Isolates fontScale on /qa-showcase parent page and keeps controls clickable", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      root.render(<QaShowcasePage />);
    });

    const xlargeBtn = container.querySelector(
      '[data-testid="showcase-font-xlarge"]'
    ) as HTMLButtonElement | null;
    expect(xlargeBtn).not.toBeNull();

    await act(async () => {
      xlargeBtn!.click();
    });

    expect(xlargeBtn!.getAttribute("aria-pressed")).toBe("true");
    expect(container.textContent).toContain("xlarge");
    expect(document.documentElement.dataset.fontScale).not.toBe("xlarge");
  });
});
