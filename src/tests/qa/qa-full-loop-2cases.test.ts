import { describe, expect, it, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import JSZip from "jszip";

const probeMockState = vi.hoisted(() => ({
  enabled: false,
  selectCalls: [] as Array<{ table: string; columns: string }>,
}));

vi.mock("@/lib/supabase/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/service")>();
  return {
    createServiceClient: () => {
      if (!probeMockState.enabled) {
        return actual.createServiceClient();
      }
      const makeBuilder = (table: string) => {
        const resultForTable = () => {
          if (table === "building_ssot_lite") {
            return {
              data: {
                id: "11111111-1111-4111-8111-111111111111",
                layers: {
                  public_data: { land_area_sqm: 1452.2, total_floor_area_sqm: 22990.3 },
                  specs: { landAreaSqm: 1452.2, gfaSqm: 22990.3 },
                },
              },
              error: null,
            };
          }
          if (table === "im_documents") {
            return {
              data: {
                id: "im-doc-loop2",
                building_id: "11111111-1111-4111-8111-111111111111",
                doc_body: {
                  ssot_summary: { landAreaSqm: 1452.2, gfaSqm: 22990.3 },
                  hiddenSections: ["lease_detail"],
                },
                hidden_sections: ["lease_detail"],
                is_published: true,
              },
              error: null,
            };
          }
          if (table === "deal_cards") {
            return {
              data: {
                id: "11111111-1111-4111-8111-111111111111",
                title: "강남구 역삼동 업무용 빌딩",
                headline: "역삼역 도보권 대형 오피스",
                is_published: true,
              },
              error: null,
            };
          }
          if (table === "document_objects") {
            return {
              data: {
                id: "doc-loop2",
                body: {
                  basicImDocument: {
                    facts: {
                      land: { land_area_sqm: 1452.2 },
                      building: { gross_floor_area_sqm: 22990.3 },
                    },
                    hiddenSections: ["lease_detail"],
                  },
                  ssot_summary: { landAreaSqm: 1452.2, gfaSqm: 22990.3 },
                  hidden_sections: ["lease_detail"],
                },
                updated_at: new Date().toISOString(),
                created_at: new Date().toISOString(),
              },
              error: null,
            };
          }
          if (table === "building_signal_cards") {
            return {
              data: {
                id: "11111111-1111-4111-8111-111111111111",
                title: "강남구 역삼동 업무용 빌딩",
                area_signal: "강남구 역삼동 일대",
                deal_points: ["대형 오피스 권역"],
                body: {},
              },
              error: null,
            };
          }
          return { data: null, error: null };
        };
        const builder: Record<string, unknown> = {
          select: (columns = "*") => {
            probeMockState.selectCalls.push({ table, columns: String(columns) });
            return builder;
          },
          eq: () => builder,
          ilike: () => builder,
          in: () => builder,
          is: () => builder,
          order: () => builder,
          limit: () => builder,
          upsert: async () => ({ data: null, error: null }),
          insert: async () => ({ data: null, error: null }),
          update: () => builder,
          single: async () => resultForTable(),
          maybeSingle: async () => resultForTable(),
          then: (onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) => {
            const payload = resultForTable();
            const rows = payload.data ? [payload.data] : [];
            return Promise.resolve({ data: rows, error: null }).then(onFulfilled, onRejected);
          },
        };
        return builder;
      };
      return {
        from: (table: string) => makeBuilder(table),
      };
    },
  };
});

import {
  FULL_LOOP_ALL_STEPS,
  FULL_LOOP_CASES,
  FULL_LOOP_WINDOW_ROLES,
  QA_FULL_LOOP_WORKBENCH_ID,
} from "@/lib/testguide/full-loop-2cases-data";
import { validateBlindPoints } from "@/lib/deal-card/blind-guard";
import { parseTsvRentRoll } from "@/lib/rent-roll/tsv-parser";
import { isQaGatedPath, proxy } from "@/proxy";
import { GET as getSampleKit } from "@/app/api/public/qa-sample-kit/route";
import { POST as postWorkbench } from "@/app/api/public/qa-workbench/route";

describe("Full-Loop 2-Case Golden Human Click-Through Suite (/qa-full-loop)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defines exactly 2 orthogonal real-property golden cases × 7 steps = 14 MECE steps", () => {
    expect(FULL_LOOP_CASES).toHaveLength(2);
    expect(FULL_LOOP_WINDOW_ROLES).toHaveLength(3);
    expect(FULL_LOOP_ALL_STEPS).toHaveLength(14);

    const [loop1, loop2] = FULL_LOOP_CASES;
    expect(loop1.id).toBe("loop1");
    expect(loop2.id).toBe("loop2");
    expect(loop1.steps).toHaveLength(7);
    expect(loop2.steps).toHaveLength(7);

    // Total target duration fits within a single 35~40 minute human QA session
    const totalMinutes = loop1.targetMinutes + loop2.targetMinutes;
    expect(totalMinutes).toBeGreaterThanOrEqual(30);
    expect(totalMinutes).toBeLessThanOrEqual(40);

    // Covers all 4 core subsystems across both loops
    const subsystems = new Set(FULL_LOOP_ALL_STEPS.map((s) => s.subsystem));
    expect(subsystems.has("프로필·법정표기")).toBe(true);
    expect(subsystems.has("딜카드")).toBe(true);
    expect(subsystems.has("IM·발표자료")).toBe(true);
    expect(subsystems.has("뉴스레터")).toBe(true);
    expect(subsystems.has("매수자 열람·문의")).toBe(true);
    expect(subsystems.has("고객 소통(승인·회수)")).toBe(true);
    expect(subsystems.has("오라클·보안마감")).toBe(true);

    // Ground-truth areas match verified real properties (Bucheon 535.6㎡ & Yeoksam 3-parcel 1,452.2㎡)
    expect(loop1.groundTruth.expectedLandAreaSqm).toBeCloseTo(535.6, 1);
    expect(loop1.groundTruth.expectedGfaSqm).toBeCloseTo(2758.21, 1);
    expect(loop2.groundTruth.expectedLandAreaSqm).toBeCloseTo(1452.2, 1);
    expect(loop2.groundTruth.singleParcelTrapSqm).toBeCloseTo(555.7, 1);
  });

  it("ensures every public-facing copy snippet is 100% blind-safe (zero lot number / building name leak)", () => {
    for (const loopCase of FULL_LOOP_CASES) {
      const publicSnippets = loopCase.steps.flatMap((s) =>
        s.copySnippets.filter((sn) => sn.isPublicFacing)
      );
      expect(publicSnippets.length).toBeGreaterThanOrEqual(3);

      for (const sn of publicSnippets) {
        const check = validateBlindPoints([sn.value]);
        expect(check.isValid, `Blind violation in ${sn.id}: ${sn.value}`).toBe(true);
        for (const forbidden of loopCase.groundTruth.forbiddenPublicTokens) {
          expect(sn.value.includes(forbidden)).toBe(false);
        }
      }
    }
  });

  it("parses both Loop 1 (17-row Bucheon) and Loop 2 (21-row Yeoksam) TSV snippets cleanly via parseTsvRentRoll", () => {
    const l1Tsv = FULL_LOOP_CASES[0].steps
      .flatMap((s) => s.copySnippets)
      .find((sn) => sn.id === "l1-im-tsv")?.value;
    const l2Tsv = FULL_LOOP_CASES[1].steps
      .flatMap((s) => s.copySnippets)
      .find((sn) => sn.id === "l2-im-tsv")?.value;

    expect(l1Tsv).toBeTruthy();
    expect(l2Tsv).toBeTruthy();

    const parsed1 = parseTsvRentRoll(l1Tsv!);
    const parsed2 = parseTsvRentRoll(l2Tsv!);

    expect(parsed1.rows.length).toBeGreaterThanOrEqual(16);
    expect(parsed2.rows.length).toBe(21);
  });

  it("protects /qa-full-loop behind the fail-closed QA gate in proxy.ts", async () => {
    expect(isQaGatedPath("/qa-full-loop")).toBe(true);
    expect(isQaGatedPath("/qa-full-loop/sub")).toBe(true);

    vi.stubEnv("CRE_ENFORCE_QA_GATE", "1");
    vi.stubEnv("QA_ACCESS_KEY", "secret-full-loop-key");

    const deniedRes = await proxy(new NextRequest("https://credeal.net/qa-full-loop"));
    expect(deniedRes.status).toBe(404);

    const allowedRes = await proxy(
      new NextRequest("https://credeal.net/qa-full-loop?qaKey=secret-full-loop-key")
    );
    expect(allowedRes.status).toBe(200);
  });

  it("serves complete scenario ZIP kits for ?scenario=loop1 and ?scenario=loop2", async () => {
    for (const scenario of ["loop1", "loop2"] as const) {
      const req = new NextRequest(
        `http://localhost:3000/api/public/qa-sample-kit?scenario=${scenario}`
      );
      const res = await getSampleKit(req);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("application/zip");

      const zipBuf = await res.arrayBuffer();
      const zip = await JSZip.loadAsync(zipBuf);
      const fileNames = Object.keys(zip.files);

      expect(fileNames).toContain("00_README_풀루프_실행안내.txt");
      expect(fileNames).toContain("01_현장메모_원문.txt");
      expect(fileNames).toContain("03_임대현황_붙여넣기용.tsv");
      expect(fileNames).toContain("04_뉴스레터_브리핑_초안.txt");
      expect(fileNames).toContain("05_고객연락처_샘플10명.csv");

      const photoFiles = fileNames.filter(
        (f) => f.startsWith("photos/") && !zip.files[f].dir
      );
      expect(photoFiles).toHaveLength(4);
    }
  }, 20000);

  it("computes accurate 14-step summary verdicts in /api/public/qa-workbench for QA_FULL_LOOP_WORKBENCH_ID", async () => {
    const allPassRecords = Object.fromEntries(
      FULL_LOOP_ALL_STEPS.map((s) => [s.id, { status: "PASS", note: "정상" }])
    );

    const req = new NextRequest("http://localhost:3000/api/public/qa-workbench", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "sync",
        workbenchId: QA_FULL_LOOP_WORKBENCH_ID,
        sessionId: "fl2-unit-test-session",
        testerName: "테스트중개사",
        records: allPassRecords,
      }),
    });

    const res = await postWorkbench(req);
    // In unauthenticated test runtime without broker session, write auth returns 401 unless QA key is configured
    if (res.status === 401) {
      vi.stubEnv("QA_ACCESS_KEY", "unit-qa-key");
      const authedReq = new NextRequest(
        "http://localhost:3000/api/public/qa-workbench",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-qa-access-key": "unit-qa-key",
          },
          body: JSON.stringify({
            mode: "sync",
            workbenchId: QA_FULL_LOOP_WORKBENCH_ID,
            sessionId: "fl2-unit-test-session",
            testerName: "테스트중개사",
            records: allPassRecords,
          }),
        }
      );
      const authedRes = await postWorkbench(authedReq);
      expect(authedRes.status).toBe(200);
      const json = await authedRes.json();
      expect(json.ok).toBe(true);
      expect(json.summary.completedCount).toBe(14);
      expect(json.summary.passCount).toBe(14);
      expect(json.summary.failCount).toBe(0);
      expect(json.summary.verdictLabel).toContain("14/14 PASS");
    } else {
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.summary.completedCount).toBe(14);
      expect(json.summary.passCount).toBe(14);
    }
  });

  it("provides compact tabLabel, 억-unit price chips, and 1:1 split buyer form chips for Loop 1 & Loop 2", () => {
    expect(FULL_LOOP_CASES[0].tabLabel).toBe("Loop 1 · 부천 58억");
    expect(FULL_LOOP_CASES[1].tabLabel).toBe("Loop 2 · 역삼 2,000억");

    const loop1Snippets = FULL_LOOP_CASES[0].steps.flatMap((s) => s.copySnippets);
    const loop2Snippets = FULL_LOOP_CASES[1].steps.flatMap((s) => s.copySnippets);

    const byId = (arr: typeof loop1Snippets, id: string) =>
      arr.find((sn) => sn.id === id);

    expect(byId(loop1Snippets, "l1-im-price-eok")?.value).toBe("58");
    expect(byId(loop1Snippets, "l1-buyer-name")?.value).toBeTruthy();
    expect(byId(loop1Snippets, "l1-buyer-phone")?.value).toBeTruthy();
    expect(byId(loop1Snippets, "l1-buyer-email")?.value).toBe("sb.jung@example.kr");
    expect(byId(loop1Snippets, "l1-buyer-msg")?.value).toBeTruthy();

    expect(byId(loop2Snippets, "l2-im-trillion-eok")?.value).toBe("10500");
    expect(byId(loop2Snippets, "l2-im-2000-eok")?.value).toBe("2000");
    expect(byId(loop2Snippets, "l2-im-1900-eok")?.value).toBe("1900");

    for (const id of [
      "l2-b1-name",
      "l2-b1-phone",
      "l2-b1-msg",
      "l2-b2-name",
      "l2-b2-phone",
      "l2-b2-msg",
    ]) {
      expect(byId(loop2Snippets, id)?.value).toBeTruthy();
    }
  });

  it("runs /api/public/qa-workbench mode=probe with expectedLoopId=loop2 & secondaryImShareUrl without building_ssot_lite column errors", async () => {
    vi.stubEnv("QA_ACCESS_KEY", "unit-qa-key");
    probeMockState.enabled = true;
    probeMockState.selectCalls = [];

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/dc/")) {
        return new Response("<html><body>강남구 역삼동 업무용 빌딩</body></html>", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
      return new Response("<html><body>역삼 여삼빌딩 1,900억</body></html>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    });

    try {
      const req = new NextRequest("http://localhost:3000/api/public/qa-workbench", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-qa-access-key": "unit-qa-key",
        },
        body: JSON.stringify({
          mode: "probe",
          workbenchId: QA_FULL_LOOP_WORKBENCH_ID,
          expectedLoopId: "loop2",
          dealCardUrl: "http://localhost:3000/dc/11111111-1111-4111-8111-111111111111",
          imShareUrl: "http://localhost:3000/im-lite/11111111-1111-4111-8111-111111111111?t=mock-1",
          secondaryImShareUrl: "http://localhost:3000/im-lite/11111111-1111-4111-8111-111111111111?t=mock-2",
        }),
      });

      const res = await postWorkbench(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.secondaryShareLinkCheck).toBeDefined();
      expect(json.secondaryShareLinkCheck.validUrl).toBe(true);
      expect(json.secondaryShareLinkCheck.isLocked).toBe(false);
      expect(json.groundTruthOracleCheck).toBeDefined();

      const ssotSelects = probeMockState.selectCalls.filter(
        (c) => c.table === "building_ssot_lite"
      );
      expect(ssotSelects.some((c) => c.columns.includes("layers"))).toBe(true);
      for (const call of ssotSelects) {
        expect(call.columns).not.toContain("land_area_sqm");
        expect(call.columns).not.toContain("gross_floor_area_sqm");
      }
    } finally {
      probeMockState.enabled = false;
      fetchSpy.mockRestore();
    }
  });
});
