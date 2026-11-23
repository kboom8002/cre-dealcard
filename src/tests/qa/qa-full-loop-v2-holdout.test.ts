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
                id: "22222222-2222-4222-8222-222222222222",
                layers: {
                  public_data: { land_area_sqm: 506.8, total_floor_area_sqm: 1441.15 },
                  specs: { landAreaSqm: 506.8, gfaSqm: 1441.15 },
                },
              },
              error: null,
            };
          }
          if (table === "im_documents") {
            return {
              data: {
                id: "im-doc-v2-loop1",
                building_id: "22222222-2222-4222-8222-222222222222",
                doc_body: {
                  ssot_summary: { landAreaSqm: 506.8, gfaSqm: 1441.15 },
                },
                hidden_sections: [],
                is_published: true,
              },
              error: null,
            };
          }
          if (table === "deal_cards") {
            return {
              data: {
                id: "22222222-2222-4222-8222-222222222222",
                title: "영등포구 당산동 메디컬 근생빌딩",
                headline: "당산역 도보 4분 코너 근생",
                is_published: true,
              },
              error: null,
            };
          }
          if (table === "document_objects") {
            return {
              data: {
                id: "doc-v2-loop1",
                body: {
                  basicImDocument: {
                    facts: {
                      land: { land_area_sqm: 506.8 },
                      building: { gross_floor_area_sqm: 1441.15 },
                    },
                  },
                  ssot_summary: { landAreaSqm: 506.8, gfaSqm: 1441.15 },
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
                id: "22222222-2222-4222-8222-222222222222",
                title: "영등포구 당산동 메디컬 근생빌딩",
                area_signal: "영등포구 당산동 일대",
                deal_points: ["더블역세권 코너"],
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
          then: (
            onFulfilled?: (value: unknown) => unknown,
            onRejected?: (reason: unknown) => unknown,
          ) => {
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
  QA_FULL_LOOP_WORKBENCH_ID,
} from "@/lib/testguide/full-loop-2cases-data";
import {
  FULL_LOOP_V2_ALL_STEPS,
  FULL_LOOP_V2_CASES,
  FULL_LOOP_V2_WINDOW_ROLES,
  HOLDOUT_V2_CASE03_ASIS_TSV,
  HOLDOUT_V2_CASE03_STABILIZED_TSV,
  HOLDOUT_V2_CASE04_STABILIZED_TSV,
  QA_FULL_LOOP_V2_WORKBENCH_ID,
} from "@/lib/testguide/full-loop-v2-holdout-data";
import { validateBlindPoints } from "@/lib/deal-card/blind-guard";
import { parseTsvRentRoll } from "@/lib/rent-roll/tsv-parser";
import { isQaGatedPath, proxy } from "@/proxy";
import { GET as getSampleKit } from "@/app/api/public/qa-sample-kit/route";
import { POST as postWorkbench } from "@/app/api/public/qa-workbench/route";

describe("Hold-out V2 Complementary Golden Human Click-Through Suite (/qa-full-loop-v2)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defines 2 complementary Hold-out cases × 7 unique steps completely disjoint from V1", () => {
    expect(QA_FULL_LOOP_V2_WORKBENCH_ID).not.toBe(QA_FULL_LOOP_WORKBENCH_ID);
    expect(FULL_LOOP_V2_CASES).toHaveLength(2);
    expect(FULL_LOOP_V2_WINDOW_ROLES).toHaveLength(3);
    expect(FULL_LOOP_V2_ALL_STEPS).toHaveLength(14);

    const v1StepIds = new Set(FULL_LOOP_ALL_STEPS.map((s) => s.id));
    const v2StepIds = new Set(FULL_LOOP_V2_ALL_STEPS.map((s) => s.id));
    expect(v2StepIds.size).toBe(14);
    for (const id of v2StepIds) {
      expect(v1StepIds.has(id)).toBe(false);
    }

    const [dangsan, jamwon] = FULL_LOOP_V2_CASES;
    expect(dangsan.probeLoopId).toBe("v2-loop1");
    expect(jamwon.probeLoopId).toBe("v2-loop2");
    expect(dangsan.images).toHaveLength(6);
    expect(jamwon.images).toHaveLength(5);

    expect(dangsan.groundTruth.expectedLandAreaSqm).toBeCloseTo(506.8, 1);
    expect(dangsan.groundTruth.expectedGfaSqm).toBeCloseTo(1441.15, 1);
    expect(jamwon.groundTruth.expectedLandAreaSqm).toBeCloseTo(616.1, 1);
    expect(jamwon.groundTruth.expectedGfaSqm).toBeCloseTo(2032.59, 1);
  });

  it("ensures every V2 public-facing copy snippet passes blind-guard & zero forbidden leaks", () => {
    for (const loopCase of FULL_LOOP_V2_CASES) {
      const publicSnippets = loopCase.steps.flatMap((s) =>
        s.copySnippets.filter((sn) => sn.isPublicFacing),
      );
      expect(publicSnippets.length).toBeGreaterThanOrEqual(4);

      for (const sn of publicSnippets) {
        const check = validateBlindPoints([sn.value]);
        expect(check.isValid, `Blind violation in ${sn.id}: ${sn.value}`).toBe(true);
        for (const forbidden of loopCase.groundTruth.forbiddenPublicTokens) {
          expect(sn.value.includes(forbidden), `Leak "${forbidden}" in ${sn.id}`).toBe(false);
        }
        if (sn.id.endsWith("dc-headline")) {
          expect(
            Array.from(sn.value).length,
            `${sn.id} must fit within DealCard 18-char headline limit`,
          ).toBeLessThanOrEqual(18);
        }
      }
    }
  });

  it("parses Dangsan stabilized (14 rows) & Jamwon as-is/stabilized (6 rows each) TSVs cleanly", () => {
    const dangsanStab = parseTsvRentRoll(HOLDOUT_V2_CASE04_STABILIZED_TSV);
    const jamwonAsIs = parseTsvRentRoll(HOLDOUT_V2_CASE03_ASIS_TSV);
    const jamwonStab = parseTsvRentRoll(HOLDOUT_V2_CASE03_STABILIZED_TSV);

    expect(dangsanStab.rows).toHaveLength(14);
    expect(jamwonAsIs.rows).toHaveLength(6);
    expect(jamwonStab.rows).toHaveLength(6);
  });

  it("protects /qa-full-loop-v2 behind the fail-closed QA gate in proxy.ts", async () => {
    expect(isQaGatedPath("/qa-full-loop-v2")).toBe(true);
    expect(isQaGatedPath("/qa-full-loop-v2/sub")).toBe(true);

    vi.stubEnv("CRE_ENFORCE_QA_GATE", "1");
    vi.stubEnv("QA_ACCESS_KEY", "secret-v2-holdout-key");

    const deniedRes = await proxy(new NextRequest("https://credeal.net/qa-full-loop-v2"));
    expect(deniedRes.status).toBe(404);

    const allowedRes = await proxy(
      new NextRequest("https://credeal.net/qa-full-loop-v2?qaKey=secret-v2-holdout-key"),
    );
    expect(allowedRes.status).toBe(200);
  });

  it("serves V2 Hold-out ZIP kits and standalone XLSX v1.5 files for v2-loop1 & v2-loop2", async () => {
    vi.stubEnv("CRE_ENFORCE_QA_GATE", "1");
    vi.stubEnv("QA_ACCESS_KEY", "secret-v2-holdout-key");

    // 1. Standalone XLSX downloads
    for (const fmt of ["xlsx", "xlsx-stabilized"] as const) {
      const xlsxReq = new NextRequest(
        `http://localhost:3000/api/public/qa-sample-kit?scenario=v2-loop1&format=${fmt}`,
        { headers: { "x-qa-access-key": "secret-v2-holdout-key" } },
      );
      const xlsxRes = await getSampleKit(xlsxReq);
      expect(xlsxRes.status).toBe(200);
      expect(xlsxRes.headers.get("content-type")).toBe(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      const bytes = new Uint8Array(await xlsxRes.arrayBuffer());
      expect(bytes.byteLength).toBeGreaterThan(5000);
      expect(bytes[0]).toBe(0x50); // 'P'
      expect(bytes[1]).toBe(0x4b); // 'K'
    }

    // 2. Full Hold-out Loop 1 ZIP (Dangsan XLSX + TSV + 6 real photos)
    const zip1Res = await getSampleKit(
      new NextRequest("http://localhost:3000/api/public/qa-sample-kit?scenario=v2-loop1", {
        headers: { "x-qa-access-key": "secret-v2-holdout-key" },
      }),
    );
    expect(zip1Res.status).toBe(200);
    const zip1 = await JSZip.loadAsync(await zip1Res.arrayBuffer());
    const zip1Names = Object.keys(zip1.files);
    expect(zip1Names).toContain("00_대장면적_및_수익률_기준값_대조표.txt");
    expect(zip1Names).toContain("02_현황_렌트롤_v1.5_sqm.xlsx");
    expect(zip1Names).toContain("03_안정화_렌트롤_v1.5_sqm.xlsx");
    expect(zip1Names).toContain("04_기대수익률_복사붙여넣기용_표.txt");
    const ref1Text = await zip1.files["00_대장면적_및_수익률_기준값_대조표.txt"].async("string");
    expect(ref1Text).toContain("506.80");
    expect(ref1Text).toContain("1,441.15");
    expect(zip1Names.filter((n) => n.startsWith("photos/") && !zip1.files[n].dir)).toHaveLength(6);

    // 3. Full Hold-out Loop 2 ZIP (Jamwon reference table + pasteable txt + CSV + 5 real photos)
    const zip2Res = await getSampleKit(
      new NextRequest("http://localhost:3000/api/public/qa-sample-kit?scenario=v2-loop2", {
        headers: { "x-qa-access-key": "secret-v2-holdout-key" },
      }),
    );
    expect(zip2Res.status).toBe(200);
    const zip2 = await JSZip.loadAsync(await zip2Res.arrayBuffer());
    const zip2Names = Object.keys(zip2.files);
    expect(zip2Names).toContain("00_대장면적_및_수익률_기준값_대조표.txt");
    expect(zip2Names).toContain("02_현행_임대현황_복사용_표.txt");
    expect(zip2Names).toContain("03_기대수익률_임대현황_복사용_표.txt");
    expect(zip2Names).toContain("04_임대현황_업로드용.csv");
    const ref2Text = await zip2.files["00_대장면적_및_수익률_기준값_대조표.txt"].async("string");
    expect(ref2Text).toContain("616.10");
    expect(ref2Text).toContain("2,032.59");
    expect(zip2Names.filter((n) => n.startsWith("photos/") && !zip2.files[n].dir)).toHaveLength(5);
  }, 25000);

  it("computes accurate 14-step summary & runs mode=probe for QA_FULL_LOOP_V2_WORKBENCH_ID / v2-loop1", async () => {
    vi.stubEnv("QA_ACCESS_KEY", "unit-v2-key");
    const allPassRecords = Object.fromEntries(
      FULL_LOOP_V2_ALL_STEPS.map((s) => [s.id, { status: "PASS", note: "Hold-out 통과" }]),
    );

    const syncReq = new NextRequest("http://localhost:3000/api/public/qa-workbench", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-qa-access-key": "unit-v2-key",
      },
      body: JSON.stringify({
        mode: "sync",
        workbenchId: QA_FULL_LOOP_V2_WORKBENCH_ID,
        sessionId: "fl2v2-unit-test-session",
        testerName: "테스트중개사V2",
        records: allPassRecords,
      }),
    });
    const syncRes = await postWorkbench(syncReq);
    expect(syncRes.status).toBe(200);
    const syncJson = await syncRes.json();
    expect(syncJson.summary.completedCount).toBe(14);
    expect(syncJson.summary.passCount).toBe(14);
    expect(syncJson.summary.verdictLabel).toContain("14/14 PASS");

    // mode=probe for v2-loop1 (Dangsan Ground-Truth 506.8 / 1441.15)
    probeMockState.enabled = true;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/dc/")) {
        return new Response("<html><body>영등포구 당산동 메디컬 근생</body></html>", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
      return new Response("<html><body>당산 근생빌딩 115억</body></html>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    });

    try {
      const probeReq = new NextRequest("http://localhost:3000/api/public/qa-workbench", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-qa-access-key": "unit-v2-key",
        },
        body: JSON.stringify({
          mode: "probe",
          workbenchId: QA_FULL_LOOP_V2_WORKBENCH_ID,
          expectedLoopId: "v2-loop1",
          dealCardUrl: "http://localhost:3000/dc/22222222-2222-4222-8222-222222222222",
          imShareUrl: "http://localhost:3000/im-lite/22222222-2222-4222-8222-222222222222?t=mock-v2",
        }),
      });
      const probeRes = await postWorkbench(probeReq);
      expect(probeRes.status).toBe(200);
      const probeJson = await probeRes.json();
      expect(probeJson.ok).toBe(true);
      expect(probeJson.groundTruthOracleCheck?.landMatch).toBe(true);
      expect(probeJson.groundTruthOracleCheck?.gfaMatch).toBe(true);

      const probe2Req = new NextRequest("http://localhost:3000/api/public/qa-workbench", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-qa-access-key": "unit-v2-key",
        },
        body: JSON.stringify({
          mode: "probe",
          workbenchId: QA_FULL_LOOP_V2_WORKBENCH_ID,
          expectedLoopId: "v2-loop2",
          dealCardUrl: "http://localhost:3000/dc/22222222-2222-4222-8222-222222222222",
          imShareUrl: "http://localhost:3000/im-lite/22222222-2222-4222-8222-222222222222?t=mock-v2-b1",
          secondaryImShareUrl: "http://localhost:3000/im-lite/22222222-2222-4222-8222-222222222222?t=mock-v2-b2",
        }),
      });
      const probe2Res = await postWorkbench(probe2Req);
      expect(probe2Res.status).toBe(200);
      const probe2Json = await probe2Res.json();
      expect(probe2Json.ok).toBe(true);
      expect(probe2Json.groundTruthOracleCheck?.expectedLandAreaSqm).toBeCloseTo(616.1, 1);
      expect(probe2Json.secondaryShareLinkCheck?.validUrl).toBe(true);
    } finally {
      probeMockState.enabled = false;
      fetchSpy.mockRestore();
    }
  });
});
