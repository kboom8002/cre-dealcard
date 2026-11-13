// @vitest-environment jsdom
/**
 * @file src/tests/workspace/dealcard-im-36h-audit-remediation.test.tsx
 * @description 36-Hour DealCard & IM Forensic Audit + Tester PDF V-1.0 Remediation Regression Suite.
 *
 * Covers Tracks A, B, C, D (jsdom + API + external helpers):
 *  - Track A: /api/public/qa-workbench dealcard-im-v1 sync/GET recovery, live probe (dealCardCheck + shareLinkCheck),
 *             and /dealcard-im-test UI testids (workbench-sync-badge, run-live-probe-btn, submit-qa-report-btn).
 *  - Track B: sanitizeBrokerPhone email/synthetic rejection, FontScaleToggle storage/sync,
 *             ConfirmDeleteModal Escape & confirm/cancel, MobileIMViewer isBroker owner gating for Studio button.
 *  - Track C: resolveAddressToComponents 동교동(12100) vs 서교동(12000) fallback stem resolution,
 *             and fetchParcelPolygonByBox filtering road parcels (도/천/구).
 *  - Track D: fetchLandPriceHistory getIndvdLandPriceAttr-first with domain= parameter.
 *  (Node-environment PPTX OOXML tests [C-3] & [D-2] reside in src/tests/unit/pptx/a23-a27-36h-audit.test.ts)
 */

import React, { act } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { NextRequest } from "next/server";

// ── Shared Mocks for API Route & Client Components ──
interface MockDbState {
  activity_events: any[];
  building_ssot_lite: any[];
  building_signal_cards: any[];
  document_objects: any[];
  profiles: any[];
  broker_profiles: any[];
  magazine_editions: any[];
}

function createEmptyMockDb(): MockDbState {
  return {
    activity_events: [],
    building_ssot_lite: [],
    building_signal_cards: [],
    document_objects: [],
    profiles: [],
    broker_profiles: [],
    magazine_editions: [],
  };
}

let mockDb: MockDbState = createEmptyMockDb();

function createMockSupabase(db: MockDbState) {
  return {
    from(table: keyof MockDbState) {
      const filters: Array<(row: any) => boolean> = [];
      let orderCol: string | null = null;
      let orderAsc = true;
      let limitNum: number | null = null;
      let insertPayload: any = null;

      const execute = () => {
        if (insertPayload) {
          const rows = Array.isArray(insertPayload) ? insertPayload : [insertPayload];
          const inserted = rows.map((r, i) => ({
            id: r.id || `ev-${db[table].length + i + 1}`,
            created_at: r.created_at || new Date().toISOString(),
            ...r,
          }));
          db[table].push(...inserted);
          return { data: inserted, error: null };
        }
        let rows = [...(db[table] || [])];
        for (const f of filters) rows = rows.filter(f);
        if (orderCol) {
          rows.sort((a, b) => {
            const va = String(a?.[orderCol!] ?? "");
            const vb = String(b?.[orderCol!] ?? "");
            return orderAsc ? va.localeCompare(vb) : vb.localeCompare(va);
          });
        }
        if (limitNum !== null) rows = rows.slice(0, limitNum);
        return { data: rows, error: null };
      };

      const builder: any = {
        select() {
          return builder;
        },
        insert(payload: any) {
          insertPayload = payload;
          return builder;
        },
        eq(col: string, val: unknown) {
          filters.push((r) => r?.[col] === val);
          return builder;
        },
        in(col: string, vals: unknown[]) {
          filters.push((r) => vals.includes(r?.[col]));
          return builder;
        },
        order(col: string, opts?: { ascending?: boolean }) {
          orderCol = col;
          orderAsc = opts?.ascending !== false;
          return builder;
        },
        limit(n: number) {
          limitNum = n;
          return builder;
        },
        async maybeSingle() {
          const res = execute();
          return { data: res.data?.[0] ?? null, error: null };
        },
        then(onFulfilled: any, onRejected?: any) {
          return Promise.resolve(execute()).then(onFulfilled, onRejected);
        },
      };
      return builder;
    },
  };
}

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => createMockSupabase(mockDb)),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => createMockSupabase(mockDb)),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/im-lite/bld-test-36h",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/platform/im-pipeline/realtime/use-dealcard-realtime-sync", () => ({
  useDealcardRealtimeSync: vi.fn(),
}));

class MockIntersectionObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
globalThis.IntersectionObserver = MockIntersectionObserver as any;
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { GET as getQaWorkbench, POST as postQaWorkbench } from "@/app/api/public/qa-workbench/route";
import DealcardImTestPage from "@/app/dealcard-im-test/page";
import { sanitizeBrokerPhone } from "@/lib/deal-card/blind-guard";
import {
  FontScaleToggle,
  FONT_SCALE_STORAGE_KEY,
} from "@/components/workspace/FontScaleToggle";
import { ConfirmDeleteModal } from "@/components/workspace/ConfirmDeleteModal";
import { MobileIMViewer } from "@/app/(public)/im-lite/[buildingId]/mobile-im-viewer";
import { fetchParcelPolygonByBox } from "@/lib/external/vworld-wms-cadastral";
import { fetchLandPriceHistory } from "@/lib/external/land-price-api";
import { resolveAddressToComponents } from "@/domain/verification/address-resolver";
import { buildBasicImDocument } from "@/domain/building/im-core/basic-im-document";
import { extractPureBuildingFacts } from "@/domain/building/im-core/facts";

describe("36-Hour DealCard & IM Forensic Audit Remediation Suite", () => {
  let root: Root;
  let container: HTMLDivElement;
  const origFetch = globalThis.fetch;

  beforeEach(() => {
    mockDb = createEmptyMockDb();
    localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    globalThis.fetch = origFetch;
    vi.restoreAllMocks();
  });

  // ════════════════════════════════════════════════════════════════════════
  // TRACK A: /api/public/qa-workbench + /dealcard-im-test
  // ════════════════════════════════════════════════════════════════════════
  describe("Track A: QA Workbench Sync & Live Probe", () => {
    it("[A-1] dealcard-im-v1 sync/submit round-trips via GET with summary & overallComment", async () => {
      const sessionId = "dcim-session-36h-test";
      const syncRes = await postQaWorkbench(
        new NextRequest("http://localhost/api/public/qa-workbench", {
          method: "POST",
          body: JSON.stringify({
            mode: "sync",
            workbenchId: "dealcard-im-v1",
            sessionId,
            testerName: "김테스터",
            testerOrg: "Mobile QA",
            records: {
              "T1-01": { status: "PASS", note: "" },
              "T2-01": { status: "FAIL", note: "지적도 폴리곤 누락 점검" },
            },
            scratchLinks: {
              dealCardUrl: "https://credeal.net/dc/11111111-1111-4111-8111-111111111111",
              imShareUrl: "https://credeal.net/im-lite/22222222-2222-4222-8222-222222222222",
            },
            overallComment: "전반 흐름 양호",
          }),
        })
      );
      expect(syncRes.status).toBe(200);
      const syncJson = await syncRes.json();
      expect(syncJson.ok).toBe(true);
      expect(syncJson.summary?.passCount).toBe(1);
      expect(syncJson.summary?.failCount).toBe(1);

      const getRes = await getQaWorkbench(
        new NextRequest(
          `http://localhost/api/public/qa-workbench?sessionId=${sessionId}&workbenchId=dealcard-im-v1`
        )
      );
      expect(getRes.status).toBe(200);
      const loaded = await getRes.json();
      expect(loaded.found).toBe(true);
      expect(loaded.session.testerName).toBe("김테스터");
      expect(loaded.session.overallComment).toBe("전반 흐름 양호");
      expect(loaded.session.records["T2-01"].status).toBe("FAIL");
    });

    it("[A-2] probe mode inspects DealCard blind/email leak and IM docExists + hasOfficialLandPrice", async () => {
      const dcId = "11111111-1111-4111-8111-111111111111";
      const imBldId = "22222222-2222-4222-8222-222222222222";
      const ownerId = "99999999-9999-4999-8999-999999999999";

      mockDb.building_ssot_lite.push(
        {
          id: dcId,
          area_signal: "서울시 마포구 동교동 일대",
          asset_type: "근린생활시설",
          price_band: "70~80억",
          owner_id: ownerId,
        },
        {
          id: imBldId,
          official_land_price_per_sqm: 14_200_000,
          layers: { public_data: { officialLandPricePerSqm: 14_200_000 } },
        }
      );
      mockDb.building_signal_cards.push({
        id: "card-1",
        building_id: dcId,
        headline: "홍대입구 3번출구 도보 3분",
        point_1: "연남동 상권",
        point_2: "신축급 외관",
        point_3: "공실 없음",
        region: "마포구 동교동",
      });
      mockDb.profiles.push({
        id: ownerId,
        phone: "broker-synthetic@credeal.local",
      });

      const probeRes = await postQaWorkbench(
        new NextRequest("http://localhost/api/public/qa-workbench", {
          method: "POST",
          body: JSON.stringify({
            mode: "probe",
            dealCardUrl: `https://credeal.net/dc/${dcId}`,
            imShareUrl: `https://credeal.net/im-lite/${imBldId}`,
          }),
        })
      );
      expect(probeRes.status).toBe(200);
      const probeJson = await probeRes.json();
      expect(probeJson.ok).toBe(true);
      expect(probeJson.dealCardCheck.exists).toBe(true);
      expect(probeJson.dealCardCheck.addressBlindPass).toBe(true);
      // Must catch @credeal.local in profiles.phone!
      expect(probeJson.dealCardCheck.brokerPhonePass).toBe(false);

      expect(probeJson.shareLinkCheck.docExists).toBe(true);
      expect(probeJson.shareLinkCheck.hasOfficialLandPrice).toBe(true);
    });

    it("[A-3] /dealcard-im-test renders sync badge, live probe button on Track 1, overall comment & submit button on Signoff", async () => {
      globalThis.fetch = vi.fn(async () =>
        new Response(JSON.stringify({ ok: true, found: false }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      ) as any;

      await act(async () => {
        root.render(<DealcardImTestPage />);
      });

      expect(container.querySelector('[data-testid="workbench-sync-badge"]')).not.toBeNull();

      // Switch to Track 1 and select T1-06 (Live URL Inspector) so run-live-probe-btn renders
      const track1Btn = container.querySelector('[data-testid="nav-track-track1"]') as HTMLButtonElement;
      expect(track1Btn).not.toBeNull();
      await act(async () => {
        track1Btn.click();
      });
      const t106Btn = Array.from(container.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("Step 1-6")
      ) as HTMLButtonElement | undefined;
      expect(t106Btn).toBeTruthy();
      await act(async () => {
        t106Btn!.click();
      });
      expect(container.querySelector('[data-testid="run-live-probe-btn"]')).not.toBeNull();

      // Switch to Signoff track to verify overall comment & submit button
      const signoffBtn = container.querySelector('[data-testid="nav-track-signoff"]') as HTMLButtonElement;
      expect(signoffBtn).not.toBeNull();
      await act(async () => {
        signoffBtn.click();
      });
      expect(container.querySelector("#dcim-overall-comment")).not.toBeNull();
      expect(container.querySelector('[data-testid="submit-qa-report-btn"]')).not.toBeNull();
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // TRACK B: Security, Accessibility, Delete Safety & Studio Ownership
  // ════════════════════════════════════════════════════════════════════════
  describe("Track B: Phone Blind Guard, Font Scale, Delete Modal & Studio Gating", () => {
    it("[B-1] sanitizeBrokerPhone blocks @credeal.local / synthetic emails and short junk while preserving valid phones", () => {
      expect(sanitizeBrokerPhone("credeal-test@credeal.local")).toBe("");
      expect(sanitizeBrokerPhone("user@example.com")).toBe("");
      expect(sanitizeBrokerPhone("12345")).toBe("");
      expect(sanitizeBrokerPhone(null)).toBe("");
      expect(sanitizeBrokerPhone("010-1234-5678")).toBe("010-1234-5678");
      expect(sanitizeBrokerPhone("02-555-7777")).toBe("02-555-7777");
    });

    it("[B-2] FontScaleToggle persists to localStorage and dispatches credeal:font-scale-change", async () => {
      const events: string[] = [];
      const handler = (e: Event) => {
        events.push((e as CustomEvent<string>).detail);
      };
      window.addEventListener("credeal:font-scale-change", handler);

      await act(async () => {
        root.render(<FontScaleToggle />);
      });

      const xlargeBtn = container.querySelector(
        '[data-testid="workspace-font-scale-xlarge"]'
      ) as HTMLButtonElement;
      const compactBtn = container.querySelector(
        '[data-testid="workspace-font-scale-compact"]'
      ) as HTMLButtonElement;
      expect(xlargeBtn).not.toBeNull();
      expect(compactBtn).not.toBeNull();

      await act(async () => {
        xlargeBtn.click();
      });
      expect(localStorage.getItem(FONT_SCALE_STORAGE_KEY)).toBe("xlarge");
      expect(events).toContain("xlarge");

      await act(async () => {
        compactBtn.click();
      });
      expect(localStorage.getItem(FONT_SCALE_STORAGE_KEY)).toBe("compact");
      expect(events).toContain("compact");

      window.removeEventListener("credeal:font-scale-change", handler);
    });

    it("[B-3] ConfirmDeleteModal handles confirm, cancel button, and Escape key", async () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();

      await act(async () => {
        root.render(
          <ConfirmDeleteModal
            isOpen={true}
            title="물건 삭제"
            description="삭제 후 복구 불가"
            onConfirm={onConfirm}
            onCancel={onCancel}
          />
        );
      });

      expect(container.querySelector('[data-testid="confirm-delete-modal"]')).not.toBeNull();

      await act(async () => {
        (
          container.querySelector('[data-testid="confirm-delete-confirm-btn"]') as HTMLButtonElement
        ).click();
      });
      expect(onConfirm).toHaveBeenCalledTimes(1);

      await act(async () => {
        (
          container.querySelector('[data-testid="confirm-delete-cancel-btn"]') as HTMLButtonElement
        ).click();
      });
      expect(onCancel).toHaveBeenCalledTimes(1);

      await act(async () => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      });
      expect(onCancel).toHaveBeenCalledTimes(2);
    });

    it("[B-4] MobileIMViewer hides mobile-im-open-studio-btn when isBroker=false and shows when isBroker=true", async () => {
      const facts = extractPureBuildingFacts({
        title: "동교동 테스트 빌딩",
        address: "서울특별시 마포구 동교동 147-8",
        posture: "core_income",
        asking_price_manwon: 770000,
        total_gross_area_sqm: 410.5,
        land_area_sqm: 137.2,
        monthly_rent_total_manwon: 2000,
        deposit_total_manwon: 26000,
      });
      const basicDoc = buildBasicImDocument(facts);

      // Non-owner / anonymous visitor -> MUST NOT see Studio button
      await act(async () => {
        root.render(
          <MobileIMViewer
            document={{ basicImDocument: basicDoc } as any}
            buildingId="bld-test-36h"
            isBroker={false}
          />
        );
      });
      expect(container.querySelector('[data-testid="mobile-im-open-studio-btn"]')).toBeNull();

      // Owner / Broker -> MUST see Studio button
      await act(async () => {
        root.render(
          <MobileIMViewer
            document={{ basicImDocument: basicDoc } as any}
            buildingId="bld-test-36h"
            isBroker={true}
          />
        );
      });
      expect(container.querySelector('[data-testid="mobile-im-open-studio-btn"]')).not.toBeNull();
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // TRACK C: Slide 05 (A27) Cadastral Self-Healing & 동교동 PNU
  // ════════════════════════════════════════════════════════════════════════
  describe("Track C: 동교동 PNU Fallback & Cadastral Polygon Box Recovery", () => {
    it("[C-1] resolveAddressToComponents resolves 마포구 동교동 147-8 to 12100 and 서교동 395-166 to 12000 via fallback stem logic", async () => {
      // Force external geocoders to fail so deterministic fallback runs without stripping '동' in '동교'
      globalThis.fetch = vi.fn(async () => new Response("{}", { status: 500 })) as any;

      const donggyo = await resolveAddressToComponents("서울특별시 마포구 동교동 147-8");
      expect(donggyo).toEqual({ sigunguCd: "11440", bjdongCd: "12100", bun: "147", ji: "8" });

      const seogyo = await resolveAddressToComponents("서울특별시 마포구 서교동 395-166");
      expect(seogyo).toEqual({ sigunguCd: "11440", bjdongCd: "12000", bun: "395", ji: "166" });
    });

    it("[C-2] fetchParcelPolygonByBox skips road parcel (도) and picks building lot (대)", async () => {
      globalThis.fetch = vi.fn(async () =>
        new Response(
          JSON.stringify({
            response: {
              status: "OK",
              result: {
                featureCollection: {
                  features: [
                    {
                      properties: { pnu: "1144012100101470001", jibun: "147-1도" },
                      geometry: {
                        type: "Polygon",
                        coordinates: [
                          [
                            [126.92508, 37.55682],
                            [126.92509, 37.55682],
                            [126.92509, 37.55683],
                            [126.92508, 37.55682],
                          ],
                        ],
                      },
                    },
                    {
                      properties: { pnu: "1144012100101680004", jibun: "168-4대" },
                      geometry: {
                        type: "Polygon",
                        coordinates: [
                          [
                            [126.92507, 37.55681],
                            [126.92512, 37.55681],
                            [126.92512, 37.55686],
                            [126.92507, 37.55686],
                            [126.92507, 37.55681],
                          ],
                        ],
                      },
                    },
                  ],
                },
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      ) as any;

      const recovered = await fetchParcelPolygonByBox(37.556828, 126.925088, "test-key", 20);
      expect(recovered).not.toBeNull();
      expect(recovered?.resolvedPnu).toBe("1144012100101680004");
      expect(recovered?.rings.length).toBe(1);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // TRACK D: V-World Official Land Price API
  // ════════════════════════════════════════════════════════════════════════
  describe("Track D: V-World Official Land Price Fetch", () => {
    it("[D-1] fetchLandPriceHistory uses getIndvdLandPriceAttr first and passes domain= parameter", async () => {
      process.env.VWORLD_API_KEY = "dummy-vworld-key";
      const requestedUrls: string[] = [];

      globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
        const u = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
        requestedUrls.push(u);
        return new Response(
          JSON.stringify({
            indvdLandPrices: {
              field: [
                { stdrYear: "2021", pblntfPclnd: "11000000" },
                { stdrYear: "2022", pblntfPclnd: "12500000" },
                { stdrYear: "2023", pblntfPclnd: "13000000" },
                { stdrYear: "2024", pblntfPclnd: "14200000" },
              ],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }) as any;

      const hist = await fetchLandPriceHistory("1144012100101680004", 10);
      expect(hist).not.toBeNull();
      expect(hist?.history.length).toBe(4);
      expect(hist?.latestPricePerSqm).toBe(14_200_000);
      expect(hist?.cagrPct).toBeGreaterThan(0);
      expect(requestedUrls[0]).toContain("getIndvdLandPriceAttr");
      expect(requestedUrls[0]).toContain("domain=");
    });
  });
});
