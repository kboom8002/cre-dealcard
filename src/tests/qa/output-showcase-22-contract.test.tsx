// @vitest-environment jsdom
/**
 * @file src/tests/qa/output-showcase-22-contract.test.tsx
 * @description Gate 1/2 Contract Suite for Output-First 22 MECE Scenarios,
 * TSV Rent-Roll Engine (IM-01/02/06/07), /api/public/qa-workbench showcase routes,
 * and /qa-showcase UI interactive flows.
 */
import React, { act } from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { NextRequest } from "next/server";

vi.mock("next/navigation", () => ({
  usePathname: () => "/qa-showcase",
  useSearchParams: () => new URLSearchParams(""),
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
import QaShowcasePage from "@/app/qa-showcase/page";
import {
  DEALCARD_SHOWCASE_8,
  IM_SHOWCASE_8,
  NEWSLETTER_SHOWCASE_6,
  OUTPUT_SHOWCASE_SCENARIOS,
  QA_OUTPUT_SHOWCASE_WORKBENCH_ID,
  type ShowcaseManifest,
} from "@/lib/qa/output-showcase-scenarios";
import {
  parseTsvRentRoll,
  synthesizeMissingVacantFloors,
} from "@/lib/rent-roll/tsv-parser";

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function setNativeValue(el: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value"
  )?.set;
  if (setter) {
    setter.call(el, value);
  } else {
    el.value = value;
  }
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function buildPostRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/public/qa-workbench", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Output-First 22 MECE Scenarios & /qa-showcase Contract", () => {
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

  it("validates 22 MECE scenario counts, unique IDs/UUIDs, and distinct 2026-10 issueDates", () => {
    expect(NEWSLETTER_SHOWCASE_6).toHaveLength(6);
    expect(DEALCARD_SHOWCASE_8).toHaveLength(8);
    expect(IM_SHOWCASE_8).toHaveLength(8);
    expect(OUTPUT_SHOWCASE_SCENARIOS).toHaveLength(22);

    const uniqueIds = new Set(OUTPUT_SHOWCASE_SCENARIOS.map((s) => s.id));
    expect(uniqueIds.size).toBe(22);

    const buildingIds = [...DEALCARD_SHOWCASE_8, ...IM_SHOWCASE_8].map(
      (s) => s.buildingId
    );
    expect(new Set(buildingIds).size).toBe(16);
    for (const bid of buildingIds) {
      expect(bid).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    }

    const issueDates = NEWSLETTER_SHOWCASE_6.map((n) => n.issueDate);
    expect(new Set(issueDates).size).toBe(6);
    for (const d of issueDates) {
      expect(d).toMatch(/^2026-10-\d{2}$/);
    }
  });

  it("parses IM-01, IM-02, IM-06 (21 rows) and corrects IM-07 units + vacant floor synthesis", () => {
    const im01 = IM_SHOWCASE_8.find((s) => s.id === "IM-01")!;
    const im02 = IM_SHOWCASE_8.find((s) => s.id === "IM-02")!;
    const im06 = IM_SHOWCASE_8.find((s) => s.id === "IM-06")!;
    const im07 = IM_SHOWCASE_8.find((s) => s.id === "IM-07")!;

    const r1 = parseTsvRentRoll(im01.rawTsv!);
    expect(r1.rows).toHaveLength(6);
    expect(r1.rows.some((r) => r.floor === "B2" && r.status === "occupied")).toBe(
      true
    );

    const r2 = parseTsvRentRoll(im02.rawTsv!);
    expect(r2.rows).toHaveLength(17);
    expect(r2.rows.some((r) => r.unit === "201호" && r.status === "vacant")).toBe(
      true
    );

    const r6 = parseTsvRentRoll(im06.rawTsv!);
    expect(r6.rows).toHaveLength(21);

    const r7 = parseTsvRentRoll(im07.rawTsv!);
    const synthesized = synthesizeMissingVacantFloors(r7.rows);
    expect(r7.hasUnitMistakes).toBe(true);
    expect(r7.totalDepositManwon).toBe(15000);
    expect(r7.totalMonthlyRentManwon).toBe(1190);
    expect(synthesized).toHaveLength(6);
    expect(synthesized.find((r) => r.floor === "3F")?.status).toBe("vacant");
    expect(synthesized.find((r) => r.floor === "4F")?.status).toBe("vacant");
  });

  it("handles GET ?mode=showcase gracefully offline and tallies 3-tier verdicts via POST submit", async () => {
    const getRes = await GET(
      new NextRequest("http://localhost:3000/api/public/qa-workbench?mode=showcase")
    );
    expect(getRes.status).toBe(200);
    const getJson = await getRes.json();
    expect(getJson.ok).toBe(true);
    expect(getJson.manifest).toBeNull();
    expect(getJson.buildStamp?.shortSha).toBeTruthy();
    expect(getJson.channelPolicy?.emailLiveAllowed).toBe(true);
    expect(getJson.channelPolicy?.alimtalkLiveAllowed).toBe(false);

    const submitRes = await POST(
      buildPostRequest({
        mode: "submit",
        workbenchId: QA_OUTPUT_SHOWCASE_WORKBENCH_ID,
        sessionId: "showcase-contract-session",
        records: {
          "NL-D1": { status: "PASS" },
          "DC-01": { status: "NEEDS_POLISH" },
          "IM-01": { status: "FAIL" },
        },
      })
    );
    expect(submitRes.status).toBe(200);
    const submitJson = await submitRes.json();
    expect(submitJson.ok).toBe(true);
    expect(submitJson.summary?.completedCount).toBe(3);
    expect(submitJson.summary?.passCount).toBe(1);
    expect(submitJson.summary?.polishCount).toBe(1);
    expect(submitJson.summary?.failCount).toBe(1);
  });

  it("renders QaShowcasePage, switches tabs, pre-fills slide pin target, submits Red-Pen pin & syncs NEEDS_POLISH", async () => {
    const mockManifest: ShowcaseManifest = {
      version: "3.0",
      generatedAt: "2026-11-14T07:30:00.000Z",
      brokerSlug: "leesh",
      brokerName: "이상은",
      totalCount: 22,
      entries: {
        "NL-D1": {
          caseId: "NL-D1",
          category: "newsletter",
          title: "일간 · 표준형",
          subtitle: "테스트 서브타이틀",
          postureOrCadence: "일간",
          edgeFocus: "표준 5단",
          liveUrl: "/magazine/leesh/2026-10-21",
          ogImageUrl: "/api/og/magazine?brokerId=leesh&date=2026-10-21",
          defaultFontScale: "normal",
          inputSummary: "메모",
          goldenChecks: ["5단 정합성"],
          generatedAt: "2026-11-14T07:30:00.000Z",
        },
        "IM-01": {
          caseId: "IM-01",
          category: "im",
          title: "동교동 THE.PARK",
          subtitle: "수익형 표준",
          postureOrCadence: "수익형",
          edgeFocus: "OpenXML 5대 단언",
          liveUrl: "/im-lite/5c0ca5e0-0002-4000-8000-000000000001",
          ogImageUrl: null,
          pptxDownloadUrl:
            "/api/public/im-lite/5c0ca5e0-0002-4000-8000-000000000001/pptx?tier=basic&direct=1",
          pptxSlideUrls: Array.from({ length: 8 }, (_, idx) => {
            const num = String(idx + 1).padStart(2, "0");
            return `https://example.supabase.co/storage/v1/object/public/building_photos/qa-showcase/im-01/slide-${num}.png`;
          }),
          slideCount: 8,
          buildingId: "5c0ca5e0-0002-4000-8000-000000000001",
          inputSummary: "동교동 189-6",
          goldenChecks: ["OpenXML PASS"],
          generatedAt: "2026-11-14T07:30:00.000Z",
        },
      },
    };

    const postBodies: Array<Record<string, unknown>> = [];
    const fetchMock = vi
      .fn()
      .mockImplementation(async (url: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          const parsed = JSON.parse(String(init.body || "{}")) as Record<
            string,
            unknown
          >;
          postBodies.push(parsed);
          return await POST(buildPostRequest(parsed));
        }
        if (url.includes("mode=showcase")) {
          return {
            ok: true,
            json: async () => ({
              ok: true,
              manifest: mockManifest,
              buildStamp: {
                sha: "12345678abcdef",
                shortSha: "12345678",
                builtAt: "2026-11-14T07:30:00.000Z",
                env: "test",
              },
              channelPolicy: {
                emailLiveAllowed: true,
                alimtalkLiveAllowed: false,
                summaryLabel:
                  "실제 사이트 점검: 이메일 발송 허용 · 알림톡 실발송 보류(드라이런)",
              },
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({ ok: true, found: false, session: null }),
        };
      });
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      root.render(<QaShowcasePage />);
    });

    const dealcardTab = container.querySelector(
      '[data-testid="showcase-tab-dealcard"]'
    ) as HTMLButtonElement;
    const imTab = container.querySelector(
      '[data-testid="showcase-tab-im"]'
    ) as HTMLButtonElement;
    expect(dealcardTab).not.toBeNull();
    expect(imTab).not.toBeNull();

    await act(async () => {
      dealcardTab.click();
    });
    expect(
      container.querySelector('[data-testid="showcase-case-DC-01"]')
    ).not.toBeNull();

    await act(async () => {
      imTab.click();
    });

    const slide5PinBtn = container.querySelector(
      '[data-testid="showcase-slide-pin-btn-5"]'
    ) as HTMLButtonElement | null;
    expect(slide5PinBtn).not.toBeNull();

    await act(async () => {
      slide5PinBtn!.click();
    });

    const targetLabelEl = container.querySelector(
      '[data-testid="showcase-pin-target-label"]'
    );
    expect(targetLabelEl?.textContent).toContain("IM-01 · 슬라이드 05");

    const origInput = container.querySelector(
      '[data-testid="showcase-pin-original-input"]'
    ) as HTMLTextAreaElement;
    const suggestedInput = container.querySelector(
      '[data-testid="showcase-pin-suggested-input"]'
    ) as HTMLTextAreaElement;
    const noteInput = container.querySelector(
      '[data-testid="showcase-pin-note-input"]'
    ) as HTMLTextAreaElement;
    const pinSubmitBtn = container.querySelector(
      '[data-testid="showcase-pin-submit-btn"]'
    ) as HTMLButtonElement;

    await act(async () => {
      setNativeValue(origInput, "지적도 필지 경계선 라벨이 다소 작습니다");
      setNativeValue(suggestedInput, "지번·도로폭 숫자를 조금 더 굵게 표기");
      setNativeValue(noteInput, "슬라이드 05 토지 지적도 가독성 보완 요청");
    });

    await act(async () => {
      pinSubmitBtn.click();
    });

    const pinCall = postBodies.find((b) => b.mode === "pin");
    expect(pinCall).toBeDefined();
    expect(pinCall?.authorRole).toBe("broker");
    expect(pinCall?.pinMode).toBe("redpen");
    expect(pinCall?.targetLabel).toBe("IM-01 · 슬라이드 05");

    const polishBtn = container.querySelector(
      '[data-testid="showcase-verdict-polish"]'
    ) as HTMLButtonElement;
    await act(async () => {
      polishBtn.click();
    });

    const syncCall = postBodies.find(
      (b) => b.mode === "sync" && b.workbenchId === QA_OUTPUT_SHOWCASE_WORKBENCH_ID
    );
    expect(syncCall).toBeDefined();
    expect(
      (syncCall?.records as Record<string, { status?: string }>)?.["IM-01"]?.status
    ).toBe("NEEDS_POLISH");
  });
});
