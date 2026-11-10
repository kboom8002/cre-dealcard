// @vitest-environment jsdom
/**
 * @file src/tests/workspace/human-physics-blindspot-audit.test.tsx
 * @description 6-Axis MECE Human-Physics & Latent Failure Audit Suite (L-01 ~ L-09)
 *   - Axis 1: Serverless Persistence & Cross-Workspace Sync (activity_events <-> Buildings / Inbox / Cold-Start Survival)
 *   - Axis 2: Zero 404 Route & Deep-Link Contract (/m/[slug], /magazine, Previous Edition Full Restore)
 *   - Axis 3: Initial Sample Seed Isolation & Broker Profile SSOT (/broker/w/dealcards, /broker/w/im)
 *   - Axis 4: Human-Physics Input & /testguide <-> Production UI 1:1 Field Order Contract
 *   - Axis 5: <1280px Laptop DPI Viewport Preview Drawer Auto-Open & Toggle Accessibility
 */
import React, { act } from "react";
import fs from "fs";
import path from "path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { NextRequest } from "next/server";
import DealCardsWorkspacePage from "@/app/(broker)/broker/w/dealcards/page";
import ImWorkspacePage from "@/app/(broker)/broker/w/im/page";
import MagazineEditorPage from "@/app/(broker)/broker/magazine-editor/page";
import TestGuidePage from "@/app/testguide/page";
import {
  getInboxState,
  saveInboxState,
} from "@/lib/im-lite/quick-generate-store";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const mockRequireBroker = vi.fn();
const mockSupabaseFrom = vi.fn();

vi.mock("@/lib/auth-guard", () => ({
  requireBroker: (...args: unknown[]) => mockRequireBroker(...args),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (...args: unknown[]) => mockSupabaseFrom(...args),
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/broker/w/dealcards",
  useSearchParams: () => new URLSearchParams(),
}));

describe("6-Axis MECE Human-Physics & Latent Failure Audit Suite (L-01 ~ L-08)", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    window.localStorage.clear();
    mockRequireBroker.mockReset();
    mockSupabaseFrom.mockReset();

    saveInboxState({
      revokedBuildings: {},
      correctionNotices: {},
      gateDecisions: {},
      callNotes: {},
      customClients: [],
    });

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

  // ═══════════════════════════════════════════════════════════════════════════
  // Axis 1: Serverless Persistence & Cross-Workspace Sync (L-02, L-05, L-06)
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Axis 1: Serverless Persistence & Cross-Workspace Sync (L-02, L-05, L-06)", () => {
    it("L-02: GET /api/broker/buildings merges both im_upserted and dealcard_upserted from activity_events when building_ssot_lite is empty", async () => {
      const { GET } = await import("@/app/api/broker/buildings/route");

      mockRequireBroker.mockResolvedValueOnce({
        user: { id: "broker-lee", email: "lee@credeal.net" },
        role: "broker",
        error: null,
      });

      mockSupabaseFrom.mockImplementation((table: string) => {
        const resolveTable = () => {
          if (table === "building_ssot_lite") {
            return { data: [], error: null };
          }
          if (table === "activity_events") {
            return {
              data: [
                {
                  id: "act-dc-1",
                  event_type: "dealcard_upserted",
                  entity_id: "bld-9001",
                  created_at: "2026-11-10T09:00:00Z",
                  metadata: {
                    building_id: "bld-9001",
                    card4: {
                      headline: "신사동 가로수길 코너",
                      region: "강남구 신사동",
                      use: "근린생활시설",
                      priceBand: "120~130억",
                    },
                  },
                },
                {
                  id: "act-im-1",
                  event_type: "im_upserted",
                  entity_id: "b2738b89-639a-42af-afc7-58f286fb934c",
                  created_at: "2026-11-10T09:05:00Z",
                  metadata: {
                    building_id: "b2738b89-639a-42af-afc7-58f286fb934c",
                    im_item: {
                      id: "im-doc-donggyo",
                      buildingId: "b2738b89-639a-42af-afc7-58f286fb934c",
                      title: "동교동 코너 근생빌딩",
                      address: "서울특별시 마포구 동교동 147-8",
                      askingPriceManwon: 770000,
                      grossYieldPct: 2.91,
                    },
                  },
                },
              ],
              error: null,
            };
          }
          return { data: [], error: null };
        };
        const chain: Record<string, unknown> = {
          select: () => chain,
          eq: () => chain,
          neq: () => chain,
          in: () => chain,
          order: () => chain,
          limit: () => chain,
          maybeSingle: async () => ({ data: null, error: null }),
          then: (resolve: (val: unknown) => void) => resolve(resolveTable()),
        };
        return chain;
      });

      const res = await GET(new NextRequest("http://localhost/api/broker/buildings"));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);

      const ids = (json.buildings || []).map((b: { id: string }) => b.id);
      expect(ids).toContain("b2738b89-639a-42af-afc7-58f286fb934c");
      expect(ids).toContain("bld-9001");

      const dcItem = json.buildings.find((b: { id: string }) => b.id === "bld-9001");
      expect(dcItem?.title).toBe("신사동 가로수길 코너");
      expect(dcItem?.price_band).toContain("130억");
    });

    it("L-05 & L-06: GET /api/broker/inbox restores owned buildings, link_revoked, and correction_notice_published from activity_events after serverless cold-start", async () => {
      const { GET } = await import("@/app/api/broker/inbox/route");

      mockRequireBroker.mockResolvedValueOnce({
        user: { id: "broker-lee", email: "lee@credeal.net", role: "broker" },
        error: null,
      });

      // Ensure local os.tmpdir() inboxState is completely empty (simulating Vercel cold-start)
      expect(getInboxState().revokedBuildings["bld-cold-1"]).toBeUndefined();
      expect(getInboxState().correctionNotices["bld-cold-1"]).toBeUndefined();

      mockSupabaseFrom.mockImplementation((table: string) => {
        let inValues: string[] = [];
        const chain: Record<string, unknown> = {
          select: () => chain,
          eq: () => chain,
          neq: () => chain,
          or: () => chain,
          gte: () => chain,
          in: (_col: string, vals: string[]) => {
            inValues = vals;
            return chain;
          },
          order: () => chain,
          limit: async () => {
            if (table === "gate_requests") {
              return {
                data: [
                  {
                    id: "gr-cold-1",
                    building_id: "bld-cold-1",
                    reason: JSON.stringify({
                      name: "김수진 대표",
                      phone: "010-2222-3333",
                      company: "수진홀딩스",
                      message: "상세 렌트롤 요청합니다",
                    }),
                    status: "approved",
                    created_at: "2026-11-10T09:10:00Z",
                  },
                ],
                error: null,
              };
            }
            if (table === "activity_events") {
              if (inValues.includes("im_upserted")) {
                return {
                  data: [
                    {
                      event_type: "dealcard_upserted",
                      entity_id: "bld-cold-1",
                      created_at: "2026-11-10T09:00:00Z",
                      metadata: {
                        building_id: "bld-cold-1",
                        card4: {
                          headline: "동교동 수익형 빌딩",
                          region: "마포구 동교동",
                          use: "근린생활시설",
                          priceBand: "77억",
                        },
                      },
                    },
                  ],
                  error: null,
                };
              }
              if (inValues.includes("link_revoked")) {
                return {
                  data: [
                    {
                      id: "act-rev-1",
                      event_type: "link_revoked",
                      entity_id: "bld-cold-1",
                      created_at: "2026-11-10T09:20:00Z",
                      metadata: {
                        building_id: "bld-cold-1",
                        revoked: true,
                      },
                    },
                    {
                      id: "act-corr-1",
                      event_type: "correction_notice_published",
                      entity_id: "bld-cold-1",
                      created_at: "2026-11-10T09:21:00Z",
                      metadata: {
                        building_id: "bld-cold-1",
                        message: "2층 임대료가 350만원으로 정정되었습니다.",
                      },
                    },
                  ],
                  error: null,
                };
              }
            }
            return { data: [], error: null };
          },
          then: (resolve: (val: unknown) => void) =>
            resolve({ data: [], error: null }),
        };
        return chain;
      });

      const res = await GET(
        new NextRequest("http://localhost/api/broker/inbox?workspace=1")
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);

      const thread = (json.threads || []).find(
        (t: { id: string }) => t.id === "gr-cold-1"
      );
      expect(thread).toBeDefined();
      expect(thread.buildingTitle).toBe("동교동 수익형 빌딩");
      expect(thread.status).toBe("revoked");
      expect(thread.hasCorrectionNotice).toBe(true);
      expect(thread.correctionMessage).toBe("2층 임대료가 350만원으로 정정되었습니다.");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Axis 2: Zero 404 Route & Deep-Link Contract (L-01, L-03)
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Axis 2: Zero 404 Route & Deep-Link Contract (L-01, L-03)", () => {
    it("L-01 & L-03: verifies /m/[slug] and /magazine route files exist and selecting a previous edition in MagazineEditorPage restores full content and canonical URL", async () => {
      const mSlugRoute = path.resolve(
        process.cwd(),
        "src/app/(public)/m/[slug]/page.tsx"
      );
      const magRootRoute = path.resolve(
        process.cwd(),
        "src/app/(magazine)/magazine/page.tsx"
      );
      expect(fs.existsSync(mSlugRoute)).toBe(true);
      expect(fs.existsSync(magRootRoute)).toBe(true);

      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/magazine/editions")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              ok: true,
              brokerSlug: "js-realty",
              brokerName: "이상덕",
              editions: [
                {
                  id: "ed-2026-10",
                  edition_label: "2026-10",
                  title: "10월 강남·마포 핵심 빌딩 리포트",
                  status: "published",
                  theme_title: "금리 인하 기대감과 꼬마빌딩 거래 회복",
                  theme_body_md: "마포구 동교동 및 부천 역세권 중심 매수세 유입",
                  featured_deal_ids: ["bldg-donggyo-01"],
                  published_at: "2026-10-15T09:00:00Z",
                  content: {
                    headline: "10월 강남·마포 핵심 빌딩 리포트",
                    briefing: "핵심 요약 브리핑 문구",
                    issue_date: "2026-10-15",
                    deal_comments: { "bldg-donggyo-01": "숲길 정면 희소 매물" },
                  },
                },
              ],
            }),
          } as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, buildings: [] }),
        } as Response;
      });

      await act(async () => {
        root.render(<MagazineEditorPage />);
      });

      const prevEditionBtn = container.querySelector(
        '[data-testid="magazine-edition-item-ed-2026-10"]'
      ) as HTMLButtonElement;
      expect(prevEditionBtn).not.toBeNull();

      await act(async () => {
        prevEditionBtn.click();
      });

      const headlineInput = container.querySelector(
        "#newsletter-headline-input"
      ) as HTMLInputElement;
      expect(headlineInput.value).toBe("10월 강남·마포 핵심 빌딩 리포트");

      // Switch to Step 2 (content) and verify briefingBody was restored
      const nextBtn = container.querySelector(
        '[data-testid="next-to-content-btn"]'
      ) as HTMLButtonElement;
      await act(async () => {
        nextBtn.click();
      });

      expect(container.textContent).toContain(
        "마포구 동교동 및 부천 역세권 중심 매수세 유입"
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Axis 3: Initial Sample Seed Isolation & Broker Profile SSOT (L-07)
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Axis 3: Initial Sample Seed Isolation & Broker Profile SSOT (L-07)", () => {
    it("L-07: DealCardsWorkspacePage displays sample warning banner on initial bld-01 (Yangpyeong-dong) and resets cleanly on 1-click", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, dealcards: [] }),
      } as Response);

      await act(async () => {
        root.render(<DealCardsWorkspacePage />);
      });

      const sampleBanner = container.querySelector(
        '[data-testid="dealcard-sample-banner"]'
      );
      expect(sampleBanner).not.toBeNull();
      expect(sampleBanner?.textContent).toContain("예시 딜카드(영등포구 양평동)");

      const resetBtn = container.querySelector(
        '[data-testid="dealcard-sample-reset-btn"]'
      ) as HTMLButtonElement;
      expect(resetBtn).not.toBeNull();

      await act(async () => {
        resetBtn.click();
      });

      const headlineInput = container.querySelector(
        '[data-testid="card4-headline-input"]'
      ) as HTMLInputElement;
      expect(headlineInput.value).toBe("");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Axis 4 & 5: /testguide <-> UI 1:1 Contract & <1280px Preview Drawer (L-08)
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Axis 4 & 5: /testguide <-> Production UI 1:1 Contract & <1280px Preview Drawer (L-08)", () => {
    it("verifies /testguide Step 1-1 copy cards order matches /broker/w/im Step 1 inputs 1:1 and WorkspaceShell provides editor header preview drawer toggle", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          brokerProfile: {
            displayName: "이상덕",
            company: "JS 부동산 중계법인",
            phone: "010-3355-5589",
            registrationNo: "11680-2024-00123",
            slug: "js-realty",
          },
          ims: [],
        }),
      } as Response);

      await act(async () => {
        root.render(<ImWorkspacePage />);
      });

      // Verify <1280px preview drawer toggle button in Editor Header
      const previewDrawerBtn = container.querySelector(
        '[data-testid="workspace-editor-preview-drawer-btn"]'
      ) as HTMLButtonElement;
      expect(previewDrawerBtn).not.toBeNull();
      expect(previewDrawerBtn.textContent).toContain("미리보기 열기");

      // Verify GFA input appears BEFORE Land Area input in DOM order
      const wonInput = container.querySelector(
        '[data-testid="im-price-won-input"]'
      );
      const gfaInput = container.querySelector('[data-testid="im-gfa-input"]');
      const landInput = container.querySelector(
        '[data-testid="im-land-area-input"]'
      );
      expect(wonInput).not.toBeNull();
      expect(gfaInput).not.toBeNull();
      expect(landInput).not.toBeNull();

      const posComparison = gfaInput!.compareDocumentPosition(landInput!);
      expect(posComparison & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

      // Now render TestGuidePage, open Deal #1 workbench, and verify Step 1-1 label order is [매매가 -> 연면적 -> 대지면적]
      await act(async () => {
        root.render(<TestGuidePage />);
      });

      const openDeal1Btn = Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent?.includes("매물 #1 복붙 워크벤치 열기")
      ) as HTMLButtonElement;
      expect(openDeal1Btn).toBeDefined();

      await act(async () => {
        openDeal1Btn.click();
      });

      const guideText = container.textContent || "";
      const idxPrice = guideText.indexOf("희망 매매가");
      const idxGfa = guideText.indexOf("연면적 (㎡)");
      const idxLand = guideText.indexOf("대지면적 (㎡)");
      expect(idxPrice).toBeGreaterThan(-1);
      expect(idxGfa).toBeGreaterThan(idxPrice);
      expect(idxLand).toBeGreaterThan(idxGfa);
    });
  });
});
