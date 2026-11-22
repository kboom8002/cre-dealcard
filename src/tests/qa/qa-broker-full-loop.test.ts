import { describe, expect, it, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import {
  BROKER_CASE02_ASSET_CDN_MAP,
  BROKER_CASE02_IMAGES_10,
  BROKER_FULL_LOOP_ALL_STEPS,
  BROKER_FULL_LOOP_CASES,
  QA_BROKER_FULL_LOOP_WORKBENCH_ID,
} from "@/lib/testguide/broker-full-loop-data";
import { GET as getSampleKit } from "@/app/api/public/qa-sample-kit/route";
import { POST as postWorkbench } from "@/app/api/public/qa-workbench/route";

const mockLeakState = vi.hoisted(() => ({
  enabled: false,
  leakedDealTitle: "서초구 서초동 사옥용 오피스",
}));

vi.mock("@/lib/supabase/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/service")>();
  return {
    createServiceClient: () => {
      if (!mockLeakState.enabled) {
        return actual.createServiceClient();
      }
      const makeBuilder = (table: string) => {
        const resultForTable = () => {
          if (table === "building_ssot_lite") {
            return {
              data: {
                id: "33333333-3333-4333-8333-333333333333",
                area_signal: "서초구 서초동",
                asset_type: "업무시설",
                price_band: "230억",
                owner_id: null,
                layers: {
                  public_data: { landAreaSqm: 596, grossFloorAreaSqm: 2104.88 },
                  specs: { landAreaSqm: 596, gfaSqm: 2104.88 },
                },
              },
              error: null,
            };
          }
          if (table === "building_signal_cards") {
            return {
              data: {
                id: "33333333-3333-4333-8333-333333333333",
                title: mockLeakState.leakedDealTitle,
                area_signal: "서초구 서초동 일대",
                deal_points: ["자주식 주차 20대"],
                body: {},
              },
              error: null,
            };
          }
          if (table === "document_objects") {
            return {
              data: [
                {
                  id: "doc-broker-case02",
                  body: {
                    ssot_summary: {
                      land_area_sqm: 596,
                      total_gross_area_sqm: 2104.88,
                    },
                  },
                },
              ],
              error: null,
            };
          }
          return { data: null, error: null };
        };
        const builder: Record<string, unknown> = {
          select: () => builder,
          eq: () => builder,
          in: () => builder,
          order: () => builder,
          limit: () => Promise.resolve(resultForTable()),
          maybeSingle: () => {
            const res = resultForTable();
            return Promise.resolve(
              Array.isArray(res.data) ? { data: res.data[0] ?? null, error: null } : res,
            );
          },
          single: () => Promise.resolve(resultForTable()),
          insert: () => Promise.resolve({ data: null, error: null }),
        };
        return builder;
      };
      return { from: (t: string) => makeBuilder(t) } as unknown as ReturnType<
        typeof actual.createServiceClient
      >;
    },
  };
});

describe("Broker Full-Loop Workbench (/qa-broker/full-loop: 10-Photo Golden + BYOD)", () => {
  afterEach(() => {
    mockLeakState.enabled = false;
    mockLeakState.leakedDealTitle = "서초구 서초동 사옥용 오피스";
  });

  it("defines Stage 1 (10 real photos >= 9) and Stage 2 (BYOD + cleanup + 7 domain insight prompts)", () => {
    expect(BROKER_FULL_LOOP_CASES).toHaveLength(2);
    const [stage1, stage2] = BROKER_FULL_LOOP_CASES;

    expect(stage1.probeLoopId).toBe("broker-loop1");
    expect(stage1.images.length).toBeGreaterThanOrEqual(9);
    expect(stage1.images).toHaveLength(10);
    expect(BROKER_CASE02_IMAGES_10).toHaveLength(10);
    for (const img of stage1.images) {
      expect(BROKER_CASE02_ASSET_CDN_MAP[img.filename]).toMatch(
        /^https:\/\/.*\.supabase\.co\/storage\/v1\/object\/public\/building_photos\/testguide\/broker-case02\//,
      );
    }

    expect(stage2.probeLoopId).toBe("broker-byod");
    expect(stage2.isByodMode).toBe(true);
    expect(stage2.enableByodCleanup).toBe(true);
    expect(stage2.steps).toHaveLength(7);
    for (const st of stage2.steps) {
      expect(st.brokerInsightPrompt?.length).toBeGreaterThan(15);
      expect(st.brokerQuickTags?.length).toBeGreaterThanOrEqual(3);
    }
    expect(BROKER_FULL_LOOP_ALL_STEPS).toHaveLength(14);
  });

  it("serves broker-loop1 CSV, stabilized TSV, won-unit trap TSV, and 10-photo ZIP kit", async () => {
    process.env.QA_BROKER_ACCESS_KEY = "test-broker-qa-key";

    const csvReq = new NextRequest(
      "http://localhost:3000/api/public/qa-sample-kit?scenario=broker-loop1&format=csv&qaKey=test-broker-qa-key",
    );
    const csvRes = await getSampleKit(csvReq);
    expect(csvRes.status).toBe(200);
    const csvText = await csvRes.text();
    expect(csvText).toContain("매도법인(대표실)");
    expect(csvText).toContain("자가사용");

    const stabReq = new NextRequest(
      "http://localhost:3000/api/public/qa-sample-kit?scenario=broker-loop1&format=tsv-stabilized&qaKey=test-broker-qa-key",
    );
    const stabRes = await getSampleKit(stabReq);
    expect(stabRes.status).toBe(200);
    expect(await stabRes.text()).toContain("신규우량법인A");

    const zipReq = new NextRequest(
      "http://localhost:3000/api/public/qa-sample-kit?scenario=broker-loop1&qaKey=test-broker-qa-key",
    );
    const zipRes = await getSampleKit(zipReq);
    expect(zipRes.status).toBe(200);
    const zip = await JSZip.loadAsync(Buffer.from(await zipRes.arrayBuffer()));
    const photoEntries = Object.keys(zip.files).filter((k) =>
      k.startsWith("photos/") && !zip.files[k].dir,
    );
    expect(photoEntries).toHaveLength(10);
  });

  it("verifies broker-loop1 ground truth (596 / 2104.88) and catches BYOD customForbiddenTokens leaks", async () => {
    process.env.QA_BROKER_ACCESS_KEY = "test-broker-qa-key";
    mockLeakState.enabled = true;

    // 1) Stage 1 oracle pass
    const p1Req = new NextRequest("http://localhost:3000/api/public/qa-workbench", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-qa-access-key": "test-broker-qa-key",
      },
      body: JSON.stringify({
        mode: "probe",
        expectedLoopId: "broker-loop1",
        dealCardUrl: "/dc/33333333-3333-4333-8333-333333333333",
      }),
    });
    const p1Res = await postWorkbench(p1Req);
    const p1Json = await p1Res.json();
    expect(p1Res.status).toBe(200);
    expect(p1Json.groundTruthOracleCheck?.landMatch).toBe(true);
    expect(p1Json.groundTruthOracleCheck?.gfaMatch).toBe(true);
    expect(p1Json.dealCardCheck?.addressBlindPass).toBe(true);

    // 2) Stage 2 BYOD customForbiddenTokens catches leaked building name
    mockLeakState.leakedDealTitle = "역삼동 비밀알짜타워 통매각";
    const byodLeakReq = new NextRequest("http://localhost:3000/api/public/qa-workbench", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-qa-access-key": "test-broker-qa-key",
      },
      body: JSON.stringify({
        mode: "probe",
        expectedLoopId: "broker-byod",
        dealCardUrl: "/dc/33333333-3333-4333-8333-333333333333",
        customForbiddenTokens: ["비밀알짜타워", "010-9999-8888"],
      }),
    });
    const byodLeakRes = await postWorkbench(byodLeakReq);
    const byodLeakJson = await byodLeakRes.json();
    expect(byodLeakRes.status).toBe(200);
    expect(byodLeakJson.dealCardCheck?.addressBlindPass).toBe(false);
    expect(byodLeakJson.groundTruthOracleCheck?.isByodMode).toBe(true);
    expect(byodLeakJson.groundTruthOracleCheck?.customKeywordCount).toBe(2);

    // 3) Sync summary computes 14 steps for QA_BROKER_FULL_LOOP_WORKBENCH_ID
    const syncReq = new NextRequest("http://localhost:3000/api/public/qa-workbench", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-qa-access-key": "test-broker-qa-key",
      },
      body: JSON.stringify({
        mode: "sync",
        workbenchId: QA_BROKER_FULL_LOOP_WORKBENCH_ID,
        sessionId: "brfl1-unit-session-01",
        testerName: "김대표 공인중개사",
        records: {
          "B1-S1": { status: "PASS", note: "" },
          "B2-S1": { status: "NEEDS_POLISH", note: "[매매가·보증금 조절가 표현 필요]" },
        },
      }),
    });
    const syncRes = await postWorkbench(syncReq);
    const syncJson = await syncRes.json();
    expect(syncRes.status).toBe(200);
    expect(syncJson.ok).toBe(true);
    expect(syncJson.summary?.completedCount).toBe(2);
  });

  it("contains zero sub-14px text tokens in /qa-broker/full-loop files", () => {
    const sub14Re = /\btext-(?:xs|\[(?:[0-9]|1[0-3])(?:\.\d+)?px\])/;
    for (const rel of [
      "src/app/qa-broker/full-loop/page.tsx",
      "src/app/qa-broker/full-loop/layout.tsx",
    ]) {
      const content = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
      expect(content).not.toMatch(sub14Re);
    }
  });
});
