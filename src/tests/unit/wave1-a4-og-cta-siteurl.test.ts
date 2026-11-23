// @vitest-environment node
/**
 * Wave 1 Step 1.3 (Axis 4 P0: A4-01 ~ A4-06) Server/OG/Site-URL Verification Suite
 */
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetWorkspaceRepositoryCacheForTests } from "@/lib/workspace/workspace-repository";
import { clearQuickImStoreForTest } from "@/lib/im-lite/quick-generate-store";
import { getCanonicalSiteUrl } from "@/lib/site-url";

const h = vi.hoisted(() => ({
  viewer: { userId: null as string | null, isAdmin: false },
  imData: null as Record<string, unknown> | null,
  imDenyReason: undefined as "token_required" | "revoked" | "not_found" | undefined,
  workspaceItems: [] as Array<Record<string, unknown>>,
  documentObjects: [] as Array<Record<string, unknown>>,
  ssotMeta: null as Record<string, unknown> | null,
  signalCard: null as Record<string, unknown> | null,
  buildingData: null as Record<string, unknown> | null,
}));

vi.mock("@/lib/server-viewer", () => ({
  getServerViewer: vi.fn(async () => h.viewer),
}));

vi.mock("@/app/(public)/im-lite/[buildingId]/fetch-im-data", () => ({
  fetchIMData: vi.fn(
    async (
      _buildingId: string,
      _docId?: string,
      _viewer?: unknown,
      opts?: { onDeny?: (reason: "token_required" | "revoked" | "not_found") => void }
    ) => {
      if (!h.imData && h.imDenyReason) {
        opts?.onDeny?.(h.imDenyReason);
      }
      return h.imData;
    }
  ),
}));

vi.mock("@/domain/building/im-core/read-building", () => ({
  readBuilding: vi.fn(async () => h.buildingData),
  readBuildingPure: vi.fn(async () => h.buildingData),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      const filters: Array<(row: Record<string, unknown>) => boolean> = [];
      let limitCount: number | null = null;

      const evalOrPart = (row: Record<string, unknown>, part: string): boolean => {
        const m = part.trim().match(/^([a-zA-Z0-9_]+)\.eq\.(.+)$/);
        if (!m) return false;
        return String(row[m[1]] ?? "") === m[2];
      };

      const run = () => {
        let rows: Array<Record<string, unknown>> = [];
        if (table === "workspace_items") rows = h.workspaceItems;
        else if (table === "document_objects") rows = h.documentObjects;
        else if (table === "building_ssot_lite") rows = h.ssotMeta ? [h.ssotMeta] : [];
        else if (table === "building_signal_cards") rows = h.signalCard ? [h.signalCard] : [];

        let matched = rows.filter((r) => filters.every((fn) => fn(r)));
        if (limitCount !== null) matched = matched.slice(0, limitCount);
        return { data: matched, error: null };
      };

      const chain: any = {
        select: () => chain,
        eq: (col: string, val: unknown) => {
          filters.push((r) => r[col] === val);
          return chain;
        },
        neq: (col: string, val: unknown) => {
          filters.push((r) => r[col] !== val);
          return chain;
        },
        in: (col: string, vals: unknown[]) => {
          filters.push((r) => vals.includes(r[col]));
          return chain;
        },
        is: (col: string, val: unknown) => {
          filters.push((r) =>
            val === null ? r[col] === null || r[col] === undefined : r[col] === val
          );
          return chain;
        },
        or: (expr: string) => {
          const parts = expr.split(",");
          filters.push((r) => parts.some((p) => evalOrPart(r, p)));
          return chain;
        },
        order: () => chain,
        limit: (n: number) => {
          limitCount = n;
          return chain;
        },
        maybeSingle: async () => {
          const res = run();
          return { data: res.data[0] ?? null, error: null };
        },
        then: (resolve: (v: unknown) => void) => resolve(run()),
      };
      return chain;
    }),
  })),
}));

import { GET as getDealOg } from "@/app/api/og/deal/[id]/route";
import { generateMetadata as generateImMetadata } from "@/app/(public)/im-lite/[buildingId]/page";
import DealCardShortPage from "@/app/(public)/dc/[id]/page";
import { metadata as publicLayoutMetadata } from "@/app/(public)/layout";
import robots from "@/app/robots";

function readPngDimensions(bytes: ArrayBuffer): { width: number; height: number } {
  const buf = Buffer.from(bytes);
  expect(
    buf
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ).toBe(true);
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  };
}

function findCtaLadderProps(node: unknown): Record<string, unknown> | null {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findCtaLadderProps(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof node === "object" && "props" in (node as Record<string, unknown>)) {
    const el = node as { type?: { name?: string }; props?: Record<string, unknown> };
    if (el.type?.name === "CTALadder") {
      return el.props ?? {};
    }
    if (el.props?.children) {
      return findCtaLadderProps(el.props.children);
    }
  }
  return null;
}

describe("Wave 1 Step 1.3 (Axis 4 P0: A4-01..A4-06) OG, Metadata, Site URL & hasImDoc", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    resetWorkspaceRepositoryCacheForTests();
    clearQuickImStoreForTest();
    h.viewer = { userId: null, isAdmin: false };
    h.imData = null;
    h.imDenyReason = undefined;
    h.workspaceItems = [];
    h.documentObjects = [];
    h.ssotMeta = null;
    h.signalCard = null;
    h.buildingData = null;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetWorkspaceRepositoryCacheForTests();
    clearQuickImStoreForTest();
  });

  describe("A4-06: getCanonicalSiteUrl SSOT & apex removal", () => {
    it("respects precedence NEXT_PUBLIC_SITE_URL > NEXT_PUBLIC_APP_BASE_URL > APP_BASE_URL > https://www.credeal.net", () => {
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
      vi.stubEnv("NEXT_PUBLIC_APP_BASE_URL", "");
      vi.stubEnv("APP_BASE_URL", "");
      expect(getCanonicalSiteUrl()).toBe("https://www.credeal.net");

      vi.stubEnv("APP_BASE_URL", "  https://app-only.credeal.net/// \n ");
      expect(getCanonicalSiteUrl()).toBe("https://app-only.credeal.net");

      vi.stubEnv("NEXT_PUBLIC_APP_BASE_URL", "https://public-app.credeal.net/");
      expect(getCanonicalSiteUrl()).toBe("https://public-app.credeal.net");

      vi.stubEnv("NEXT_PUBLIC_SITE_URL", "  https://custom.credeal.net/  ");
      expect(getCanonicalSiteUrl()).toBe("https://custom.credeal.net");

      vi.stubEnv("NEXT_PUBLIC_SITE_URL", "   \n\t  ");
      expect(getCanonicalSiteUrl()).toBe("https://public-app.credeal.net");

      vi.stubEnv("NEXT_PUBLIC_APP_BASE_URL", "not-a-valid-url");
      expect(getCanonicalSiteUrl()).toBe("https://app-only.credeal.net");
    });

    it("removes hardcoded apex https://credeal.net from all 13 target files", () => {
      const files = [
        "src/app/layout.tsx",
        "src/app/(public)/layout.tsx",
        "src/app/(magazine)/layout.tsx",
        "src/app/(public)/dc/[id]/page.tsx",
        "src/app/(public)/im-lite/[buildingId]/page.tsx",
        "src/app/(public)/im-lite/[buildingId]/components/floating-action-bar.tsx",
        "src/app/(magazine)/magazine/[brokerId]/[date]/page.tsx",
        "src/app/(broker)/broker/deal-card/[id]/kakao-share-button.tsx",
        "src/lib/kakao/share.ts",
        "src/app/robots.ts",
        "src/app/sitemap.ts",
        "src/lib/magazine/og-fonts.ts",
        "src/app/(public)/owner-readiness/page.tsx",
      ];
      for (const rel of files) {
        const content = fs.readFileSync(path.resolve(process.cwd(), rel), "utf8");
        expect(content, `${rel} still contains hardcoded https://credeal.net`).not.toContain(
          "https://credeal.net"
        );
        expect(content, `${rel} should use getCanonicalSiteUrl`).toContain(
          "getCanonicalSiteUrl"
        );
      }

      vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.credeal.net/");
      const robotsRes = robots();
      expect(robotsRes.sitemap).toBe("https://www.credeal.net/sitemap.xml");
      expect(robotsRes.host).toBe("https://www.credeal.net");
    });
  });

  describe("A4-02 & A4-07: Public layout & owner-readiness branding/OG fixes", () => {
    it("uses 크리딜 (CREDEAL) branding, /og-default.png?v=2, and omits openGraph.url in (public)/layout.tsx", () => {
      const titleObj = publicLayoutMetadata.title as { default: string; template: string };
      expect(titleObj.default).toContain("크리딜 (CREDEAL)");
      expect(titleObj.default).not.toContain("DealCard");
      expect(titleObj.template).toBe("%s | 크리딜 (CREDEAL)");
      expect(publicLayoutMetadata.creator).toBe("크리딜 (CREDEAL)");
      expect(publicLayoutMetadata.publisher).toBe("크리딜 (CREDEAL)");
      expect(publicLayoutMetadata.openGraph?.siteName).toBe("크리딜 (CREDEAL)");
      expect((publicLayoutMetadata.openGraph as Record<string, unknown>)?.url).toBeUndefined();

      const ogImages = publicLayoutMetadata.openGraph?.images as Array<{ url: string }>;
      expect(ogImages[0]?.url).toMatch(/\/og-default\.png\?v=2$/);
      expect(publicLayoutMetadata.twitter?.images).toEqual([ogImages[0]?.url]);

      const ownerSrc = fs.readFileSync(
        path.resolve(process.cwd(), "src/app/(public)/owner-readiness/page.tsx"),
        "utf8"
      );
      expect(ownerSrc).not.toContain("/api/og/deal/default");
      expect(ownerSrc).toContain("/og-default.png?v=2");
    });
  });

  describe("A4-02 & A4-03: /api/og/deal/[id] default + ?type=im support", () => {
    it("GET /api/og/deal/default returns HTTP 200 1200x630 PNG", async () => {
      const req = new Request("https://www.credeal.net/api/og/deal/default");
      const res = await getDealOg(req, { params: Promise.resolve({ id: "default" }) });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("image/png");
      const bytes = await res.arrayBuffer();
      expect(readPngDimensions(bytes)).toEqual({ width: 1200, height: 630 });
    }, 30_000);

    it("GET /api/og/deal/[id]?type=im renders 200 PNG for published IM-only workspace_items even when dealcard is draft", async () => {
      const bldId = "1111aaaa-2222-4333-8444-555566667777";
      h.workspaceItems = [
        {
          id: "dc-draft-1",
          owner_id: "owner-1",
          kind: "dealcard",
          building_id: bldId,
          legacy_id: bldId,
          status: "draft",
          title: "초안 딜카드",
          address: "서울시 강남구 역삼동",
          draft_payload: { headline: "초안 비공개 제목" },
          published_snapshot: null,
          deleted_at: null,
          revoked_at: null,
          created_at: "2026-11-23T00:00:00.000Z",
          updated_at: "2026-11-23T00:00:00.000Z",
        },
        {
          id: "im-pub-1",
          owner_id: "owner-1",
          kind: "im",
          building_id: bldId,
          legacy_id: bldId,
          status: "published",
          title: "역삼역 프라임 투자설명서",
          address: "서울시 강남구 역삼동 823-10",
          price_band: "120~140억",
          draft_payload: {},
          published_snapshot: {
            blindName: "역삼역 프라임 사옥",
            ogTitle: "역삼역 프라임 사옥 투자설명서",
            ogDescription: "강남구 역삼동 업무시설 핵심 투자 검토 자료",
            areaSignal: "강남구 역삼동",
            assetType: "업무시설",
            priceBand: "120~140억",
            investmentPosture: "income",
          },
          deleted_at: null,
          revoked_at: null,
          created_at: "2026-11-23T00:00:00.000Z",
          updated_at: "2026-11-23T00:00:00.000Z",
        },
      ];

      // Without ?type=im, dealcard is still draft -> 404
      const dealRes = await getDealOg(
        new Request(`https://www.credeal.net/api/og/deal/${bldId}`),
        { params: Promise.resolve({ id: bldId }) }
      );
      expect(dealRes.status).toBe(404);

      // With ?type=im, published workspace IM renders 200 1200x630 PNG
      const imRes = await getDealOg(
        new Request(`https://www.credeal.net/api/og/deal/${bldId}?type=im`),
        { params: Promise.resolve({ id: bldId }) }
      );
      expect(imRes.status).toBe(200);
      expect(imRes.headers.get("content-type")).toContain("image/png");
      const bytes = await imRes.arrayBuffer();
      expect(readPngDimensions(bytes)).toEqual({ width: 1200, height: 630 });
    }, 30_000);

    it("GET /api/og/deal/[id]?type=im accepts sent/active IM statuses and blocks revoked/draft IMs with 404", async () => {
      const bldId = "2222bbbb-2222-4333-8444-555566667777";
      h.workspaceItems = [
        {
          id: "im-active-1",
          owner_id: "owner-1",
          kind: "im",
          building_id: bldId,
          legacy_id: bldId,
          status: "active",
          title: "성수동 사옥 IM",
          address: "서울시 성동구 성수동",
          price_band: "90~100억",
          draft_payload: {},
          published_snapshot: {
            blindName: "성수역 사옥 투자설명서",
            areaSignal: "성동구 성수동",
            assetType: "업무시설",
            priceBand: "90~100억",
          },
          deleted_at: null,
          revoked_at: null,
          created_at: "2026-11-23T00:00:00.000Z",
          updated_at: "2026-11-23T00:00:00.000Z",
        },
      ];
      const activeRes = await getDealOg(
        new Request(`https://www.credeal.net/api/og/deal/${bldId}?type=im`),
        { params: Promise.resolve({ id: bldId }) }
      );
      expect(activeRes.status).toBe(200);

      // Revoked IM must fail closed 404
      h.workspaceItems[0].status = "revoked";
      h.workspaceItems[0].revoked_at = "2026-11-23T01:00:00.000Z";
      const revokedRes = await getDealOg(
        new Request(`https://www.credeal.net/api/og/deal/${bldId}?type=im`),
        { params: Promise.resolve({ id: bldId }) }
      );
      expect(revokedRes.status).toBe(404);
    }, 30_000);
  });

  describe("A4-01: /im-lite/[buildingId] generateMetadata", () => {
    it("sets absolute title, CREDEAL siteName, canonical url, and twitter images when data is valid", async () => {
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.credeal.net");
      h.imData = {
        blindName: "역삼역 프라임 빌딩",
        priceBand: "100~120억",
        areaSignal: "강남구 역삼동",
        assetType: "업무시설",
        ogTitle: "역삼역 코너 사옥 IM",
        ogDescription: "강남 핵심 권역 우량 임차 사옥",
      };

      const meta = await generateImMetadata({
        params: Promise.resolve({ buildingId: "bld-im-1" }),
        searchParams: Promise.resolve({ token: "valid-tok" }),
      });

      expect(meta.title).toEqual({ absolute: "역삼역 코너 사옥 IM | 크리딜" });
      expect(meta.openGraph?.siteName).toBe("크리딜 (CREDEAL)");
      expect((meta.openGraph as Record<string, unknown>)?.url).toBe(
        "https://www.credeal.net/im-lite/bld-im-1"
      );
      expect(meta.openGraph?.images).toEqual([
        {
          url: "https://www.credeal.net/api/og/deal/bld-im-1?type=im",
          width: 1200,
          height: 630,
          alt: "역삼역 코너 사옥 IM",
        },
      ]);
      expect(meta.twitter?.images).toEqual([
        "https://www.credeal.net/api/og/deal/bld-im-1?type=im",
      ]);
    });

    it("emits blind-safe openGraph & twitter metadata on token_required fallback and /og-default.png?v=2 on not_found", async () => {
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.credeal.net");
      h.imData = null;
      h.imDenyReason = "token_required";

      const tokenDeniedMeta = await generateImMetadata({
        params: Promise.resolve({ buildingId: "bld-im-locked" }),
        searchParams: Promise.resolve({}),
      });
      expect(tokenDeniedMeta.openGraph).toBeDefined();
      expect(tokenDeniedMeta.twitter).toBeDefined();
      expect(tokenDeniedMeta.openGraph?.siteName).toBe("크리딜 (CREDEAL)");
      expect(tokenDeniedMeta.description).toContain(
        "승인 전용 모바일 투자설명서 (IM) — 담당 중개사 승인 후 열람하실 수 있습니다."
      );
      expect(tokenDeniedMeta.openGraph?.images).toEqual([
        {
          url: "https://www.credeal.net/api/og/deal/bld-im-locked?type=im",
          width: 1200,
          height: 630,
          alt: "모바일 투자설명서 (IM) | 크리딜",
        },
      ]);
      expect(tokenDeniedMeta.twitter?.images).toEqual([
        "https://www.credeal.net/api/og/deal/bld-im-locked?type=im",
      ]);

      h.imDenyReason = "not_found";
      const notFoundMeta = await generateImMetadata({
        params: Promise.resolve({ buildingId: "bld-im-missing" }),
        searchParams: Promise.resolve({}),
      });
      expect(notFoundMeta.openGraph?.images).toEqual([
        {
          url: "https://www.credeal.net/og-default.png?v=2",
          width: 1200,
          height: 630,
          alt: "모바일 투자설명서 (IM) | 크리딜",
        },
      ]);
      expect(notFoundMeta.twitter?.images).toEqual([
        "https://www.credeal.net/og-default.png?v=2",
      ]);
    });
  });

  describe("A4-04 & A4-05: /dc/[id] hasImDoc actual published IM existence", () => {
    it("computes hasImDoc=true for published workspace IM even when dealcard snapshot omits hasImDoc, and false when only im_lite_draft exists", async () => {
      const bldUuid = "3333cccc-2222-4333-8444-555566667777";
      h.workspaceItems = [
        {
          id: bldUuid,
          owner_id: "owner-1",
          kind: "dealcard",
          building_id: bldUuid,
          legacy_id: bldUuid,
          status: "sent",
          title: "역삼역 코너 근생",
          address: "강남구 역삼동",
          price_band: "80~90억",
          draft_payload: {},
          published_snapshot: {
            card4: {
              headline: "역삼역 코너 근생",
              region: "강남구 역삼동",
              use: "근린생활시설",
              priceBand: "80~90억",
              area: "연면적 300평",
              points: ["역 도보 3분", "코너 각지", "전층 만실"],
            },
          },
          deleted_at: null,
          revoked_at: null,
          created_at: "2026-11-23T00:00:00.000Z",
          updated_at: "2026-11-23T00:00:00.000Z",
        },
        {
          id: "im-ws-pub",
          owner_id: "owner-1",
          kind: "im",
          building_id: bldUuid,
          legacy_id: bldUuid,
          status: "published",
          title: "역삼역 코너 근생 IM",
          address: "강남구 역삼동",
          price_band: "80~90억",
          draft_payload: {},
          published_snapshot: { blindName: "역삼역 코너 근생" },
          deleted_at: null,
          revoked_at: null,
          created_at: "2026-11-23T00:00:00.000Z",
          updated_at: "2026-11-23T00:00:00.000Z",
        },
      ];

      const elWithPubIm = await DealCardShortPage({
        params: Promise.resolve({ id: bldUuid }),
        searchParams: Promise.resolve({}),
      });
      expect(findCtaLadderProps(elWithPubIm)?.hasImDoc).toBe(true);

      // Now remove published IM and add only im_lite_draft in document_objects
      h.workspaceItems = [h.workspaceItems[0]];
      h.documentObjects = [
        {
          id: "doc-draft-only",
          building_id: bldUuid,
          document_type: "im_lite_draft",
          status: "published",
          visibility: "public",
          body: {},
        },
      ];
      const elWithDraftOnly = await DealCardShortPage({
        params: Promise.resolve({ id: bldUuid }),
        searchParams: Promise.resolve({}),
      });
      expect(findCtaLadderProps(elWithDraftOnly)?.hasImDoc).toBe(false);
    });
  });
});
