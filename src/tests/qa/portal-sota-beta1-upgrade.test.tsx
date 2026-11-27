// @vitest-environment jsdom
/**
 * @file src/tests/qa/portal-sota-beta1-upgrade.test.tsx
 * @description Comprehensive SOTA contract verification for Waves 1–4 across:
 *   - Wave 1: Cohort session isolation (`beta-1` vs legacy `서교석`), multi-session pin isolation,
 *             `.pptx` & PDF share-token injection in `mode=showcase`, zero-PII `byod_anonymized_snapshot`
 *   - Wave 2: `/qa-broker/full-loop` V2 workspace label parity, public deliverable red-pen launcher,
 *             and `/qa-broker/signoff` clean handoff badge
 *   - Wave 3: `/qa-broker/showcase` zero-jargon broker copy, 3-bullet newsletter scenarios,
 *             iframe font-scale isolation, and 8 Beta-1 commercial decision questions (`B1_Q1..B1_Q8`)
 *   - Wave 4: `/testguide` v6.0 role-based entry hub, canonical V2 `/broker/w/*?qa=1` links,
 *             `qaKey` preservation on `/qa-signoff`, and zero `배당` stock jargon
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let mockPathname = "/qa-broker/showcase";
let mockSearch = "";

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useSearchParams: () => new URLSearchParams(mockSearch),
}));

const mockDbEvents: Array<{
  id: string;
  entity_type: string;
  event_type: string;
  metadata: Record<string, unknown>;
  created_at: string;
}> = [];

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => {
    const buildQuery = (table: string) => {
      const filters: Array<{ col: string; val: unknown }> = [];
      let inFilter: { col: string; vals: unknown[] } | null = null;
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (col: string, val: unknown) => {
          filters.push({ col, val });
          return chain;
        },
        in: (col: string, vals: unknown[]) => {
          inFilter = { col, vals };
          return chain;
        },
        gt: () => chain,
        order: () => chain,
        limit: () => {
          if (table === "im_share_links") {
            return Promise.resolve({ data: [], error: null });
          }
          let rows = [...mockDbEvents];
          for (const f of filters) {
            if (f.col === "entity_type") {
              rows = rows.filter((r) => r.entity_type === f.val);
            } else if (f.col === "event_type") {
              rows = rows.filter((r) => r.event_type === f.val);
            } else if (f.col === "metadata->>session_id") {
              rows = rows.filter((r) => r.metadata?.session_id === f.val);
            }
          }
          if (inFilter && inFilter.col === "event_type") {
            rows = rows.filter((r) => inFilter!.vals.includes(r.event_type));
          }
          return Promise.resolve({ data: rows, error: null });
        },
        insert: (payload: Record<string, unknown>) => {
          mockDbEvents.unshift({
            id: `ev-${mockDbEvents.length + 1}`,
            entity_type: String(payload.entity_type || ""),
            event_type: String(payload.event_type || ""),
            metadata: (payload.metadata as Record<string, unknown>) || {},
            created_at: new Date().toISOString(),
          });
          return Promise.resolve({ data: null, error: null });
        },
      };
      return chain;
    };
    return {
      from: (t: string) => buildQuery(t),
    };
  },
}));

vi.mock("@/lib/auth-guard", () => ({
  requireBroker: vi.fn().mockResolvedValue({ error: "unauthenticated", user: null }),
}));

import { GET, POST } from "@/app/api/public/qa-workbench/route";
import QaBrokerShowcasePage from "@/app/qa-broker/showcase/page";
import QaBrokerSignoffPage from "@/app/qa-broker/signoff/page";
import QaBrokerFullLoopPage from "@/app/qa-broker/full-loop/page";
import TestGuidePage from "@/app/testguide/page";
import {
  resolveBrokerCohortSessionIds,
  resolveQaBrokerCohort,
} from "@/lib/qa/qa-client-auth";
import {
  BROKER_BETA1_QUESTIONS_8,
  BROKER_FOLLOWUP_QUESTIONS_14,
  renderStandaloneBrokerQuestionsHtml,
} from "@/lib/qa/broker-followup-questions";
import {
  NEWSLETTER_SHOWCASE_6,
  OUTPUT_SHOWCASE_SCENARIOS,
  getBrokerFacingScenarioMeta,
} from "@/lib/qa/output-showcase-scenarios";
import { BROKER_FULL_LOOP_CASES } from "@/lib/testguide/broker-full-loop-data";
import { TESTGUIDE_DEALS } from "@/lib/testguide/testguide-data";
import { scanUxWriting } from "@/lib/qa/ux-writing-and-content-oracle";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

describe("3-Portal SOTA Beta-1 Upgrade Suite (Waves 1–4)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    mockDbEvents.length = 0;
    globalThis.__CRE_QA_WORKBENCH_PINS__ = [];
    globalThis.__CRE_QA_WORKBENCH_SESSIONS__ = new Map();
    mockPathname = "/qa-broker/showcase";
    mockSearch = "";
    window.history.replaceState({}, "", "/qa-broker/showcase");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  it("Wave 1: isolates beta-1 cohort sessions/pins from legacy advisor records and injects share tokens onto .pptx & PDF URLs", async () => {
    // Seed legacy Nov 17/20 advisor records ("서교석") and legacy pin in DB
    mockDbEvents.push(
      {
        id: "legacy-q-1",
        entity_type: "qa_workbench",
        event_type: "qa_workbench_submitted",
        created_at: "2026-11-20T01:11:49Z",
        metadata: {
          session_id: "qa-broker-questions-v1",
          tester_name: "서교석",
          records: { Q1: { status: "PASS", answers: { Q1_1: "A" } } },
        },
      },
      {
        id: "legacy-sc-1",
        entity_type: "qa_workbench",
        event_type: "qa_workbench_synced",
        created_at: "2026-11-17T11:39:41Z",
        metadata: {
          session_id: "qa-output-showcase-broker",
          tester_name: "중개인 쇼룸 감수",
          records: { "IM-01": { status: "PASS" } },
        },
      },
      {
        id: "legacy-pin-1",
        entity_type: "qa_pin",
        event_type: "qa_pin_created",
        created_at: "2026-11-17T12:01:35Z",
        metadata: {
          id: "legacy-pin-1",
          sessionId: "qa-output-showcase-broker",
          authorRole: "broker",
          targetLabel: "IM-01 · 슬라이드 01",
          note: "서교석 기존 코멘트",
        },
      },
      {
        id: "manifest-1",
        entity_type: "qa_showcase_manifest",
        event_type: "qa_showcase_published",
        created_at: "2026-11-27T01:00:00Z",
        metadata: {
          manifest: {
            version: "3.0",
            generatedAt: "2026-11-27T01:00:00Z",
            brokerSlug: "test-broker-kim",
            brokerName: "김중개",
            totalCount: 22,
            entries: {
              "IM-01": {
                caseId: "IM-01",
                category: "im",
                buildingId: "5c0ca5e0-0002-4000-8000-000000000001",
                liveUrl: "/im-lite/5c0ca5e0-0002-4000-8000-000000000001",
                pptxDownloadUrl:
                  "/api/public/im-lite/5c0ca5e0-0002-4000-8000-000000000001/pptx?tier=basic&direct=1&doc_id=1dc8a18e-6b44-42e8-b85b-f8e378aee23e",
              },
            },
          },
        },
      }
    );

    const cohort = resolveQaBrokerCohort();
    expect(cohort).toBe("beta-1");
    const ids = resolveBrokerCohortSessionIds(cohort);
    expect(ids.showcaseSessionId).toBe("qa-output-showcase-broker-beta-1");
    expect(ids.questionsSessionId).toBe("qa-broker-questions-beta-1");
    expect(ids.signoffSessionId).toBe("qa-signoff-broker-beta-1");

    // 1. Cohort session lookup returns found: false (does NOT leak 서교석!)
    const betaQuestionsRes = await GET(
      new NextRequest(
        `http://localhost:3000/api/public/qa-workbench?sessionId=${ids.questionsSessionId}`
      )
    );
    const betaQuestionsJson = await betaQuestionsRes.json();
    expect(betaQuestionsJson.found).toBe(false);

    // 2. Multi-session pin lookup isolates beta-1 from legacy-pin-1
    const betaPinsRes = await GET(
      new NextRequest(
        `http://localhost:3000/api/public/qa-workbench?mode=pins&sessionIds=${encodeURIComponent(
          `${ids.showcaseSessionId},${ids.signoffSessionId}`
        )}`
      )
    );
    const betaPinsJson = await betaPinsRes.json();
    expect(betaPinsJson.ok).toBe(true);
    expect(betaPinsJson.pins).toHaveLength(0);

    // 3. Showcase manifest attaches valid slk.* token to liveUrl, pptxDownloadUrl, AND pdfDownloadUrl!
    const showcaseRes = await GET(
      new NextRequest("http://localhost:3000/api/public/qa-workbench?mode=showcase")
    );
    const showcaseJson = await showcaseRes.json();
    const im01 = showcaseJson.manifest?.entries?.["IM-01"];
    expect(im01?.liveUrl).toContain("token=slk.");
    expect(im01?.pptxDownloadUrl).toContain("token=slk.");
    expect(im01?.pdfDownloadUrl).toContain("token=slk.");

    // 4. Zero-PII BYOD anonymized snapshot strips unsafe tags and ignores raw URLs/notes
    const anonRes = await POST(
      new NextRequest("http://localhost:3000/api/public/qa-workbench", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "byod_anonymized_snapshot",
          sessionId: "brfl1-beta1-test",
          cohort: "beta-1",
          posture: "사옥용",
          photoCount: 10,
          heroChanged: true,
          stepPassCount: 6,
          stepPolishCount: 1,
          stepFailCount: 0,
          elapsedSeconds: 420,
          hesitations: 1,
          dealCardUrl: "https://credeal.net/dc/secret-uuid-999",
          byodForbiddenKeywords: "서초동 1364-28, 010-3344-8899",
          selectedQuickTags: [
            "평소 메모 그대로 잘 인식됨",
            "서초동 1364-28 노출위험",
            "010-3344-8899 전화번호",
          ],
        }),
      })
    );
    const anonJson = await anonRes.json();
    expect(anonRes.status).toBe(200);
    expect(anonJson.ok).toBe(true);
    const serializedSaved = JSON.stringify(anonJson.snapshot);
    expect(serializedSaved).toContain("평소 메모 그대로 잘 인식됨");
    expect(serializedSaved).not.toContain("1364-28");
    expect(serializedSaved).not.toContain("010-3344-8899");
    expect(serializedSaved).not.toContain("secret-uuid-999");
  });

  it("Wave 3: purifies all 22 broker-facing scenario texts, updates 6 newsletters to 3-bullet format, and mounts 8 Beta-1 questions on /qa-broker/showcase", async () => {
    expect(BROKER_FOLLOWUP_QUESTIONS_14).toHaveLength(14);
    expect(BROKER_BETA1_QUESTIONS_8).toHaveLength(8);

    // Every broker-facing scenario meta must have zero internal engineering jargon
    const forbiddenDevTerms = [
      "OpenXML",
      "Poison",
      "Dummy",
      "parseTsvRentRoll",
      "hasUnitMistakes",
      "synthesizeMissingVacantFloors",
      "Zero-Division",
      "0나누기",
      "NaN",
      "Infinity",
      "CSV_01",
      "CSV_02",
      "CSV_03",
      "molit_bok",
      "molit_band",
      "폴백",
      "매니페스트",
      "3포스처",
      "밸류애드",
    ];
    for (const sc of OUTPUT_SHOWCASE_SCENARIOS) {
      const meta = getBrokerFacingScenarioMeta(sc);
      const blob = [
        meta.title,
        meta.subtitle,
        meta.postureOrCadenceBadge,
        meta.inputSummary,
        meta.edgeFocus,
        ...meta.checkpoints,
      ].join(" ");
      for (const bad of forbiddenDevTerms) {
        expect(blob, `${sc.id} broker meta leaked '${bad}'`).not.toContain(bad);
      }
    }

    // All 6 newsletter scenarios use 3-bullet (`• `) briefings and pass UX writing scan
    for (const nl of NEWSLETTER_SHOWCASE_6) {
      const bulletLines = nl.plainBriefingFallback
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.startsWith("•"));
      expect(bulletLines.length, `${nl.id} bullet count`).toBe(3);
      const scan = scanUxWriting(nl.plainBriefingFallback);
      expect(scan.bannedTermCount, `${nl.id} banned UX terms`).toBe(0);
      expect(scan.clean, `${nl.id} UX writing clean`).toBe(true);
      expect(nl.plainBriefingFallback).not.toContain("배당");
    }

    // Standalone HTML in beta1 mode contains 8 B1_Q* cards and never leaks qaKey in hrefs
    const betaHtml = renderStandaloneBrokerQuestionsHtml({ edition: "beta1" });
    expect(betaHtml).toContain('data-question-card="B1_Q1"');
    expect(betaHtml).toContain('data-question-card="B1_Q8"');
    expect(betaHtml).not.toContain("qaKey=\" + encodeURIComponent");

    // Mount /qa-broker/showcase and verify 8 Beta-1 questions + iframe font-scale isolation
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, found: false, manifest: null, pins: [] }),
      })
    );

    await act(async () => {
      root.render(<QaBrokerShowcasePage />);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(container.textContent).not.toContain("OpenXML");
    expect(container.textContent).not.toContain("서교석");

    // Clicking xlarge font preview in showcase must NOT pollute window.localStorage["cre-font-scale"]
    const xlargeBtn = container.querySelector(
      '[data-testid="showcase-font-xlarge"]'
    ) as HTMLButtonElement | null;
    if (xlargeBtn) {
      await act(async () => {
        xlargeBtn.click();
      });
      expect(window.localStorage.getItem("cre-font-scale")).toBeNull();
    }

    const questionsTab = container.querySelector(
      '[data-testid="showcase-tab-questions"]'
    ) as HTMLButtonElement;
    expect(questionsTab).not.toBeNull();
    await act(async () => {
      questionsTab.click();
    });

    expect(
      container.querySelector('[data-testid="broker-question-card-B1_Q1"]')
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="broker-question-card-B1_Q8"]')
    ).not.toBeNull();
  });

  it("Wave 2 & Wave 4: syncs /qa-broker/full-loop, /qa-broker/signoff, and /testguide v6.0 to current V2 UI & canonical routes", async () => {
    // 1. /qa-broker/full-loop V2 step copy checks
    const [stage1, stage2] = BROKER_FULL_LOOP_CASES;
    const b1s2Text = stage1.steps.find((s) => s.id === "B1-S2")!.actionChecklist.join(" ");
    expect(b1s2Text).not.toContain("[아주 크게]");
    expect(b1s2Text).toContain("큰글씨");

    const b1s6Text = stage1.steps.find((s) => s.id === "B1-S6")!.actionChecklist.join(" ");
    expect(b1s6Text).toContain("전용 링크 잠금 · 수치 정정");
    expect(b1s6Text).toContain("보낸 링크 잠그기");

    const b2s6Text = stage2.steps.find((s) => s.id === "B2-S6")!.actionChecklist.join(" ");
    expect(b2s6Text).toContain("전용 링크 잠금 · 수치 정정");

    // 2. /qa-broker/signoff ignores stale Nov 15 r1States fail when v6States has no fail
    mockPathname = "/qa-broker/signoff";
    window.history.replaceState({}, "", "/qa-broker/signoff");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("sessionId=qa-signoff-tester-r2")) {
          return {
            ok: true,
            json: async () => ({
              ok: true,
              found: true,
              session: {
                records: {
                  r1States: { "R1-25": { status: "fail" }, "R1-27": { status: "fail" } },
                  v6States: { "V6-P1": { status: "pass" } },
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
      root.render(<QaBrokerSignoffPage />);
    });
    expect(
      container.querySelector('[data-testid="broker-signoff-tester-status-badge"]')
        ?.textContent
    ).toContain("테스터 사전 기술검증 완료");

    // 3. /testguide v6.0 preserves qaKey on /qa-signoff, uses /broker/w/newsletter?qa=1, and removes '배당'
    for (const d of TESTGUIDE_DEALS) {
      expect(d.waveAPostureLabel).not.toContain("배당");
    }
    mockPathname = "/testguide";
    mockSearch = "qaKey=master-secret-key-999";
    window.history.replaceState({}, "", "/testguide?qaKey=master-secret-key-999");

    await act(async () => {
      root.render(<TestGuidePage />);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 25));
    });

    expect(
      container.querySelector('[data-testid="testguide-role-entry-hub"]')
    ).not.toBeNull();

    const signoffHubLink = container.querySelector(
      '[data-testid="open-qa-signoff-hub"]'
    ) as HTMLAnchorElement | null;
    expect(signoffHubLink?.getAttribute("href")).toContain(
      "qaKey=master-secret-key-999"
    );

    const nlStudioLink = container.querySelector(
      '[data-testid="launcher-newsletter-studio"]'
    ) as HTMLAnchorElement | null;
    expect(nlStudioLink?.getAttribute("href")).toContain("/broker/w/newsletter");
    expect(nlStudioLink?.getAttribute("href")).toContain("qa=1");

    // Render /qa-broker/full-loop and check showcase shortcut
    mockPathname = "/qa-broker/full-loop";
    window.history.replaceState({}, "", "/qa-broker/full-loop?qaKey=broker-key-1");
    await act(async () => {
      root.render(<QaBrokerFullLoopPage />);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 25));
    });
    expect(container.textContent).toContain("22종");
  });
});
