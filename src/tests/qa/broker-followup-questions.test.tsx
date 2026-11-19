// @vitest-environment jsdom
/**
 * @file src/tests/qa/broker-followup-questions.test.tsx
 * @description 중개인 전달용 확인 질문(8문항) & 추가 질문(6문항) 시각 질문지 계약 테스트:
 *  1) 14문항(확인 8 + 추가 6) SSOT 및 대상 이미지 리졸버 검증
 *  2) /qa-showcase/questions 단독 HTML 라우트 응답 + QA 보안 게이트 검증
 *  3) /qa-showcase 질문지 탭 탑재 + 보기 클릭 즉시 서버 동기화(sync)·제출(submit)·복원(GET) 검증
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

import { GET as getQuestionsHtml } from "@/app/qa-showcase/questions/route";
import { GET as getWorkbench, POST as postWorkbench } from "@/app/api/public/qa-workbench/route";
import QaShowcasePage from "@/app/qa-showcase/page";
import {
  BROKER_FOLLOWUP_QUESTIONS_14,
  QA_BROKER_FOLLOWUP_SESSION_ID,
  QA_BROKER_FOLLOWUP_WORKBENCH_ID,
} from "@/lib/qa/broker-followup-questions";
import type { ShowcaseManifest } from "@/lib/qa/output-showcase-scenarios";

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

describe("Broker Follow-up Visual Questionnaire (14 Questions + Target Images)", () => {
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
    delete process.env.CRE_ENFORCE_QA_GATE;
    delete process.env.QA_BROKER_ACCESS_KEY;
    vi.restoreAllMocks();
  });

  it("defines 8 confirmation questions (Q1~Q8) and 6 additional questions (AQ1~AQ6) with target visuals", () => {
    expect(BROKER_FOLLOWUP_QUESTIONS_14).toHaveLength(14);
    const confirmQs = BROKER_FOLLOWUP_QUESTIONS_14.filter(
      (q) => q.section === "confirm"
    );
    const additionalQs = BROKER_FOLLOWUP_QUESTIONS_14.filter(
      (q) => q.section === "additional"
    );
    expect(confirmQs.map((q) => q.id)).toEqual([
      "Q1",
      "Q2",
      "Q3",
      "Q4",
      "Q5",
      "Q6",
      "Q7",
      "Q8",
    ]);
    expect(additionalQs.map((q) => q.id)).toEqual([
      "AQ1",
      "AQ2",
      "AQ3",
      "AQ4",
      "AQ5",
      "AQ6",
    ]);

    for (const q of BROKER_FOLLOWUP_QUESTIONS_14) {
      expect(q.visuals.length).toBeGreaterThanOrEqual(2);
      expect(q.subQuestions.length).toBeGreaterThanOrEqual(1);
      for (const v of q.visuals) {
        expect(v.fallbackSvgDataUri).toContain("data:image/svg+xml");
      }
    }
  });

  it("serves standalone HTML with target images at /qa-showcase/questions and enforces QA gate when enabled", async () => {
    const openRes = await getQuestionsHtml(
      new NextRequest("http://localhost:3000/qa-showcase/questions")
    );
    expect(openRes.status).toBe(200);
    expect(openRes.headers.get("Content-Type")).toContain("text/html");
    const html = await openRes.text();
    expect(html).toContain("<!DOCTYPE html>");
    for (const q of BROKER_FOLLOWUP_QUESTIONS_14) {
      expect(html).toContain(`data-question-card="${q.id}"`);
    }
    expect(html).toContain("/api/public/qa-workbench");
    expect(html).toContain(QA_BROKER_FOLLOWUP_SESSION_ID);

    process.env.CRE_ENFORCE_QA_GATE = "1";
    process.env.QA_BROKER_ACCESS_KEY = "credeal_broker_secret_test";

    const blockedRes = await getQuestionsHtml(
      new NextRequest("http://localhost:3000/qa-showcase/questions")
    );
    expect(blockedRes.status).toBe(404);

    const authedRes = await getQuestionsHtml(
      new NextRequest(
        "http://localhost:3000/qa-showcase/questions?qa=1&qaKey=credeal_broker_secret_test"
      )
    );
    expect(authedRes.status).toBe(200);
  });

  it("mounts interactive questionnaire on /qa-showcase, binds live slide PNGs, and syncs/submits answers immediately", async () => {
    const mockManifest: ShowcaseManifest = {
      version: "3.0",
      generatedAt: "2026-11-20T08:00:00.000Z",
      brokerSlug: "leesh",
      brokerName: "이상은",
      totalCount: 22,
      entries: {
        "IM-01": {
          caseId: "IM-01",
          category: "im",
          title: "동교동 THE.PARK",
          subtitle: "수익형 표준",
          postureOrCadence: "수익형",
          edgeFocus: "OpenXML",
          liveUrl: "/im-lite/5c0ca5e0-0002-4000-8000-000000000001?token=slk.test",
          ogImageUrl: null,
          pptxSlideUrls: Array.from({ length: 9 }, (_, idx) => {
            const num = String(idx + 1).padStart(2, "0");
            return `https://example.supabase.co/storage/v1/object/public/building_photos/qa-showcase/im-01/slide-${num}.png`;
          }),
          slideCount: 9,
          buildingId: "5c0ca5e0-0002-4000-8000-000000000001",
          inputSummary: "동교동 189-6",
          goldenChecks: [],
          generatedAt: "2026-11-20T08:00:00.000Z",
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
          return await postWorkbench(buildPostRequest(parsed));
        }
        if (url.includes("mode=showcase")) {
          return {
            ok: true,
            json: async () => ({
              ok: true,
              manifest: mockManifest,
            }),
          };
        }
        if (url.includes(`sessionId=${QA_BROKER_FOLLOWUP_SESSION_ID}`)) {
          return await getWorkbench(
            new NextRequest(`http://localhost:3000${url}`)
          );
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

    const questionsTab = container.querySelector(
      '[data-testid="showcase-tab-questions"]'
    ) as HTMLButtonElement;
    expect(questionsTab).not.toBeNull();

    await act(async () => {
      questionsTab.click();
    });

    // Verify all 14 cards & live IM-01 slide 09 / slide 01 PNG binding
    expect(
      container.querySelector('[data-testid="broker-question-card-Q1"]')
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="broker-question-card-AQ6"]')
    ).not.toBeNull();

    const q4ClosingSlideImg = container.querySelector(
      '[data-testid="broker-question-img-Q4-V1"]'
    ) as HTMLImageElement;
    expect(q4ClosingSlideImg?.getAttribute("src")).toContain("slide-09.png");

    // Click option A on Q1_1 and option A on Q7_2 -> immediate server sync
    const optQ1A = container.querySelector(
      '[data-testid="broker-question-opt-Q1_1-A"]'
    ) as HTMLButtonElement;
    const optQ72A = container.querySelector(
      '[data-testid="broker-question-opt-Q7_2-A"]'
    ) as HTMLButtonElement;

    await act(async () => {
      optQ1A.click();
    });
    await act(async () => {
      optQ72A.click();
    });

    const progressEl = container.querySelector(
      '[data-testid="broker-questions-progress-badge"]'
    );
    expect(progressEl?.textContent).toContain("2 / 14 완료");

    // Click final submit button
    const submitBtn = container.querySelector(
      '[data-testid="broker-questions-submit-btn"]'
    ) as HTMLButtonElement;
    await act(async () => {
      submitBtn.click();
    });

    const submitCall = postBodies.find(
      (b) =>
        b.mode === "submit" &&
        b.workbenchId === QA_BROKER_FOLLOWUP_WORKBENCH_ID &&
        b.sessionId === QA_BROKER_FOLLOWUP_SESSION_ID
    );
    expect(submitCall).toBeDefined();

    // Verify server recovery via GET /api/public/qa-workbench?sessionId=qa-broker-questions-v1
    const recoverRes = await getWorkbench(
      new NextRequest(
        `http://localhost:3000/api/public/qa-workbench?sessionId=${QA_BROKER_FOLLOWUP_SESSION_ID}`
      )
    );
    const recoverJson = await recoverRes.json();
    expect(recoverJson.ok).toBe(true);
    expect(recoverJson.found).toBe(true);
    expect(recoverJson.session?.summary?.completedCount).toBe(2);
    expect(recoverJson.session?.records?.Q1?.answers?.Q1_1).toBe("A");
    expect(recoverJson.session?.records?.Q7?.answers?.Q7_2).toBe("A");
  });
});
