import { describe, expect, it, vi, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import JSZip from "jszip";
import * as XLSX from "xlsx";

const probeMockState = vi.hoisted(() => ({
  enabled: false,
  landSqm: 518.7,
  gfaSqm: 2490.88,
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
          const { landSqm, gfaSqm } = probeMockState;
          if (table === "building_ssot_lite") {
            return {
              data: {
                id: "33333333-3333-4333-8333-333333333333",
                layers: {
                  public_data: { land_area_sqm: landSqm, total_floor_area_sqm: gfaSqm },
                  specs: { landAreaSqm: landSqm, gfaSqm },
                },
              },
              error: null,
            };
          }
          if (table === "im_documents") {
            return {
              data: {
                id: "im-doc-v3-loop1",
                building_id: "33333333-3333-4333-8333-333333333333",
                doc_body: {
                  ssot_summary: { landAreaSqm: landSqm, gfaSqm },
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
                id: "33333333-3333-4333-8333-333333333333",
                title: "영등포구 양평동 프라임 코너 오피스",
                headline: "선유도역 3분 코너 10층 신축급",
                is_published: true,
              },
              error: null,
            };
          }
          if (table === "document_objects") {
            return {
              data: {
                id: "doc-v3-loop1",
                body: {
                  basicImDocument: {
                    facts: {
                      land: { land_area_sqm: landSqm },
                      building: { gross_floor_area_sqm: gfaSqm },
                    },
                  },
                  ssot_summary: { landAreaSqm: landSqm, gfaSqm },
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
                id: "33333333-3333-4333-8333-333333333333",
                title: "영등포구 양평동 프라임 오피스",
                area_signal: "영등포구 양평동 일대",
                deal_points: ["9호선 급행 선유도역 도보 3분"],
                body: {},
              },
              error: null,
            };
          }
          return { data: null, error: null };
        };
        const builder: Record<string, unknown> = {
          select: () => builder,
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
  QA_FULL_LOOP_V2_WORKBENCH_ID,
} from "@/lib/testguide/full-loop-v2-holdout-data";
import {
  FULL_LOOP_V3_ALL_STEPS,
  FULL_LOOP_V3_CASES,
  FULL_LOOP_V3_WINDOW_ROLES,
  HOLDOUT_V3_CASE03_ASIS_TABLE,
  HOLDOUT_V3_CASE03_STABILIZED_TABLE,
  HOLDOUT_V3_CASE05_STABILIZED_TABLE,
  QA_FULL_LOOP_V3_WORKBENCH_ID,
} from "@/lib/testguide/full-loop-v3-holdout-data";
import { validateBlindPoints } from "@/lib/deal-card/blind-guard";
import { parseTsvRentRoll } from "@/lib/rent-roll/tsv-parser";
import { parseRentRollWorkbook } from "@/lib/rentroll/parse-rentroll-workbook";
import { isQaGatedPath, proxy } from "@/proxy";
import { GET as getSampleKit } from "@/app/api/public/qa-sample-kit/route";
import { GET as getTestGuideAsset } from "@/app/api/public/testguide-assets/[...slug]/route";
import { POST as postWorkbench } from "@/app/api/public/qa-workbench/route";

describe("Hold-out V3 Orthogonal Human Click-Through Suite (/qa-full-loop-v3)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defines 2 V3 Hold-out cases × 7 unique steps completely disjoint from V1 & V2", () => {
    expect(QA_FULL_LOOP_V3_WORKBENCH_ID).not.toBe(QA_FULL_LOOP_WORKBENCH_ID);
    expect(QA_FULL_LOOP_V3_WORKBENCH_ID).not.toBe(QA_FULL_LOOP_V2_WORKBENCH_ID);
    expect(FULL_LOOP_V3_CASES).toHaveLength(2);
    expect(FULL_LOOP_V3_WINDOW_ROLES).toHaveLength(3);
    expect(FULL_LOOP_V3_ALL_STEPS).toHaveLength(14);

    const priorIds = new Set([
      ...FULL_LOOP_ALL_STEPS.map((s) => s.id),
      ...FULL_LOOP_V2_ALL_STEPS.map((s) => s.id),
    ]);
    const v3Ids = new Set(FULL_LOOP_V3_ALL_STEPS.map((s) => s.id));
    expect(v3Ids.size).toBe(14);
    for (const id of v3Ids) {
      expect(priorIds.has(id)).toBe(false);
    }

    const [yangpyeong, jamwon] = FULL_LOOP_V3_CASES;
    expect(yangpyeong.probeLoopId).toBe("v3-loop1");
    expect(jamwon.probeLoopId).toBe("v3-loop2");
    expect(yangpyeong.images).toHaveLength(4);
    expect(jamwon.images).toHaveLength(5);

    expect(yangpyeong.groundTruth.expectedLandAreaSqm).toBeCloseTo(518.7, 1);
    expect(yangpyeong.groundTruth.expectedGfaSqm).toBeCloseTo(2490.88, 1);
    expect(jamwon.groundTruth.expectedLandAreaSqm).toBeCloseTo(616.1, 1);
    expect(jamwon.groundTruth.expectedGfaSqm).toBeCloseTo(2032.59, 1);
  });

  it("uses uncontaminated V3 buyer personas and passes blind-guard & 18-char headline limit", () => {
    const staleV2Phones = ["010-6193-4470", "010-7782-1940", "010-3917-6620"];
    const allSnippetValues = FULL_LOOP_V3_ALL_STEPS.flatMap((s) =>
      s.copySnippets.map((c) => c.value),
    ).join(" ");
    for (const oldPhone of staleV2Phones) {
      expect(allSnippetValues).not.toContain(oldPhone);
    }
    expect(allSnippetValues).toContain("010-5842-7390");
    expect(allSnippetValues).toContain("코람코자산신탁");
    expect(allSnippetValues).toContain("신사메디컬개발");
    expect(allSnippetValues).toContain("더블유성형외과의원");

    for (const loopCase of FULL_LOOP_V3_CASES) {
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
          expect(Array.from(sn.value).length).toBeLessThanOrEqual(18);
        }
      }
    }
  });

  it("protects /qa-full-loop-v3 behind the fail-closed QA gate in proxy.ts", async () => {
    expect(isQaGatedPath("/qa-full-loop-v3")).toBe(true);
    expect(isQaGatedPath("/qa-full-loop-v3/sub")).toBe(true);

    vi.stubEnv("CRE_ENFORCE_QA_GATE", "1");
    vi.stubEnv("QA_ACCESS_KEY", "secret-v3-holdout-key");

    const deniedRes = await proxy(new NextRequest("https://credeal.net/qa-full-loop-v3"));
    expect(deniedRes.status).toBe(404);

    const allowedRes = await proxy(
      new NextRequest("https://credeal.net/qa-full-loop-v3?qaKey=secret-v3-holdout-key"),
    );
    expect(allowedRes.status).toBe(200);
  });

  it("serves V3_ prefixed ZIP kits, pyeong XLSX v1.5 workbooks, V12 unit-mismatch trap, and Portrait photos", async () => {
    vi.stubEnv("CRE_ENFORCE_QA_GATE", "1");
    vi.stubEnv("QA_ACCESS_KEY", "secret-v3-holdout-key");

    // 1. Standalone XLSX downloads + real production parser verification
    const asIsRes = await getSampleKit(
      new NextRequest("http://localhost:3000/api/public/qa-sample-kit?scenario=v3-loop1&format=xlsx", {
        headers: { "x-qa-access-key": "secret-v3-holdout-key" },
      }),
    );
    expect(asIsRes.status).toBe(200);
    expect(asIsRes.headers.get("content-disposition")).toContain("V3_02_");
    const asIsWb = XLSX.read(new Uint8Array(await asIsRes.arrayBuffer()), { type: "array" });
    const asIsParsed = parseRentRollWorkbook(asIsWb);
    expect(asIsParsed.version).toBe("1.5");
    expect(asIsParsed.meta.area_input_unit).toBe("pyeong");
    expect(asIsParsed.parsedRows).toHaveLength(11);
    expect(asIsParsed.issues.filter((i) => i.level === "blocking")).toHaveLength(0);
    expect(
      asIsParsed.parsedRows.reduce((s, r) => s + (r.deposit_manwon || 0), 0),
    ).toBe(68000);
    expect(
      asIsParsed.parsedRows.reduce((s, r) => s + (r.rent_manwon || 0), 0),
    ).toBe(5150);

    const stabRes = await getSampleKit(
      new NextRequest(
        "http://localhost:3000/api/public/qa-sample-kit?scenario=v3-loop1&format=xlsx-stabilized",
        { headers: { "x-qa-access-key": "secret-v3-holdout-key" } },
      ),
    );
    expect(stabRes.status).toBe(200);
    const stabWb = XLSX.read(new Uint8Array(await stabRes.arrayBuffer()), { type: "array" });
    const stabParsed = parseRentRollWorkbook(stabWb);
    expect(stabParsed.parsedRows).toHaveLength(11);
    expect(stabParsed.issues.filter((i) => i.level === "blocking")).toHaveLength(0);
    expect(
      stabParsed.parsedRows.reduce((s, r) => s + (r.deposit_manwon || 0), 0),
    ).toBe(88000);
    expect(
      stabParsed.parsedRows.reduce((s, r) => s + (r.rent_manwon || 0), 0),
    ).toBe(6800);

    const trapRes = await getSampleKit(
      new NextRequest(
        "http://localhost:3000/api/public/qa-sample-kit?scenario=v3-loop1&format=xlsx-v12-trap",
        { headers: { "x-qa-access-key": "secret-v3-holdout-key" } },
      ),
    );
    expect(trapRes.status).toBe(200);
    const trapWb = XLSX.read(new Uint8Array(await trapRes.arrayBuffer()), { type: "array" });
    const trapParsed = parseRentRollWorkbook(trapWb);
    expect(trapParsed.issues.some((i) => i.level === "blocking")).toBe(true);

    // 2. Full V3 Loop 1 & Loop 2 ZIP kits — every file prefixed with V3_
    const zip1Res = await getSampleKit(
      new NextRequest("http://localhost:3000/api/public/qa-sample-kit?scenario=v3-loop1", {
        headers: { "x-qa-access-key": "secret-v3-holdout-key" },
      }),
    );
    expect(zip1Res.status).toBe(200);
    const zip1 = await JSZip.loadAsync(await zip1Res.arrayBuffer());
    const zip1Files = Object.keys(zip1.files).filter((n) => !zip1.files[n].dir);
    expect(zip1Files).toContain("V3_02_양평동_현황_렌트롤_v1.5_pyeong.xlsx");
    expect(zip1Files).toContain("V3_03_양평동_기대수익률_렌트롤_v1.5_pyeong.xlsx");
    expect(zip1Files).toContain("V3_99_선택체험_단위혼동_차단확인용.xlsx");
    expect(zip1Files.filter((n) => n.startsWith("photos/V3_"))).toHaveLength(4);
    for (const f of zip1Files) {
      const base = path.posix.basename(f);
      expect(base.startsWith("V3_"), `${f} must start with V3_`).toBe(true);
    }

    const zip2Res = await getSampleKit(
      new NextRequest("http://localhost:3000/api/public/qa-sample-kit?scenario=v3-loop2", {
        headers: { "x-qa-access-key": "secret-v3-holdout-key" },
      }),
    );
    expect(zip2Res.status).toBe(200);
    const zip2 = await JSZip.loadAsync(await zip2Res.arrayBuffer());
    const zip2Files = Object.keys(zip2.files).filter((n) => !zip2.files[n].dir);
    expect(zip2Files.filter((n) => n.startsWith("photos/V3_"))).toHaveLength(5);

    // 3. Portrait photo preview endpoint for v3-case05
    const imgRes = await getTestGuideAsset(
      new NextRequest(
        "http://localhost:3000/api/public/testguide-assets/images/v3-case05/01_%EC%99%B8%EA%B4%80_10%EC%B8%B5%EC%BD%94%EB%84%88%EC%A0%84%EB%A9%B4_%EC%84%B8%EB%A1%9C%ED%98%95.jpg",
        { headers: { "x-qa-access-key": "secret-v3-holdout-key" } },
      ),
      { params: Promise.resolve({ slug: ["images", "v3-case05", "01_외관_10층코너전면_세로형.jpg"] }) },
    );
    expect(imgRes.status).toBe(200);
    expect(imgRes.headers.get("content-type")).toBe("image/jpeg");

    // 4. TSV table paste verification
    expect(parseTsvRentRoll(HOLDOUT_V3_CASE05_STABILIZED_TABLE).rows).toHaveLength(11);
    expect(parseTsvRentRoll(HOLDOUT_V3_CASE03_ASIS_TABLE).rows).toHaveLength(6);
    expect(parseTsvRentRoll(HOLDOUT_V3_CASE03_STABILIZED_TABLE).rows).toHaveLength(6);
  }, 25000);

  it("computes accurate 14-step summary & runs mode=probe for QA_FULL_LOOP_V3_WORKBENCH_ID (v3-loop1 & v3-loop2)", async () => {
    vi.stubEnv("QA_ACCESS_KEY", "unit-v3-key");
    const allPassRecords = Object.fromEntries(
      FULL_LOOP_V3_ALL_STEPS.map((s) => [s.id, { status: "PASS", note: "V3 통과" }]),
    );

    const syncRes = await postWorkbench(
      new NextRequest("http://localhost:3000/api/public/qa-workbench", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-qa-access-key": "unit-v3-key" },
        body: JSON.stringify({
          mode: "sync",
          workbenchId: QA_FULL_LOOP_V3_WORKBENCH_ID,
          sessionId: "fl3v3-unit-test-session",
          testerName: "이상덕",
          records: allPassRecords,
        }),
      }),
    );
    expect(syncRes.status).toBe(200);
    const syncJson = await syncRes.json();
    expect(syncJson.summary.completedCount).toBe(14);
    expect(syncJson.summary.passCount).toBe(14);
    expect(syncJson.summary.verdictLabel).toContain("14/14 PASS");

    probeMockState.enabled = true;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response("<html><body>영등포구 양평동 프라임 코너 오피스 240~260억</body></html>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    });

    try {
      probeMockState.landSqm = 518.7;
      probeMockState.gfaSqm = 2490.88;
      const probe1Res = await postWorkbench(
        new NextRequest("http://localhost:3000/api/public/qa-workbench", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-qa-access-key": "unit-v3-key" },
          body: JSON.stringify({
            mode: "probe",
            workbenchId: QA_FULL_LOOP_V3_WORKBENCH_ID,
            expectedLoopId: "v3-loop1",
            dealCardUrl: "http://localhost:3000/dc/33333333-3333-4333-8333-333333333333",
            imShareUrl: "http://localhost:3000/im-lite/33333333-3333-4333-8333-333333333333?t=mock-v3",
          }),
        }),
      );
      const probe1Json = await probe1Res.json();
      expect(probe1Json.ok).toBe(true);
      expect(probe1Json.groundTruthOracleCheck?.landMatch).toBe(true);
      expect(probe1Json.groundTruthOracleCheck?.gfaMatch).toBe(true);

      probeMockState.landSqm = 616.1;
      probeMockState.gfaSqm = 2032.59;
      const probe2Res = await postWorkbench(
        new NextRequest("http://localhost:3000/api/public/qa-workbench", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-qa-access-key": "unit-v3-key" },
          body: JSON.stringify({
            mode: "probe",
            workbenchId: QA_FULL_LOOP_V3_WORKBENCH_ID,
            expectedLoopId: "v3-loop2",
            dealCardUrl: "http://localhost:3000/dc/33333333-3333-4333-8333-333333333333",
            imShareUrl: "http://localhost:3000/im-lite/33333333-3333-4333-8333-333333333333?t=mock-v3-b1",
            secondaryImShareUrl: "http://localhost:3000/im-lite/33333333-3333-4333-8333-333333333333?t=mock-v3-b2",
          }),
        }),
      );
      const probe2Json = await probe2Res.json();
      expect(probe2Json.ok).toBe(true);
      expect(probe2Json.groundTruthOracleCheck?.landMatch).toBe(true);
      expect(probe2Json.groundTruthOracleCheck?.gfaMatch).toBe(true);
    } finally {
      probeMockState.enabled = false;
      fetchSpy.mockRestore();
    }
  });

  it("keeps V3 TS data, MD, and HTML guides synced with exact split-screen UI button labels", () => {
    const mdGuide = fs.readFileSync(
      path.join(process.cwd(), "docs/finaltest/FULL_LOOP_V3_HOLDOUT_HUMAN_TEST_GUIDE.md"),
      "utf8",
    );
    const htmlGuide = fs.readFileSync(
      path.join(process.cwd(), "docs/finaltest/FULL_LOOP_V3_HOLDOUT_HUMAN_TEST_GUIDE.html"),
      "utf8",
    );
    for (const doc of [mdGuide, htmlGuide]) {
      expect(doc).toContain("V3_02_양평동_현황_렌트롤_v1.5_pyeong.xlsx");
      expect(doc).toContain("🔗 IM 링크 복사");
      expect(doc).toContain("둘 다 받기");
      expect(doc).toContain("자료 보내기(승인)");
      expect(doc).toContain("🔗 전용 링크 복사");
      expect(doc).toContain("🔒 보낸 링크 잠그기");
      expect(doc).toContain("🔓 링크 다시 열기");
      expect(doc).toContain("자료 전달·관리");
      expect(doc).toContain("정보 수정");
      expect(doc).toContain("토지 186평");
      expect(doc).toContain("제이에스부동산중개(주)");
      expect(doc).toContain("코람코자산신탁");
    }
  });
});
