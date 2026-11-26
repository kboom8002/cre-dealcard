/**
 * @file src/tests/unit/wave4a-bundle-diet-and-dc-query-batching.test.ts
 * @description Wave 4 Track 4A Verification Suite:
 *  1. Zero static top-level `xlsx` imports in `rent-roll-importer.tsx` & `lease-file-import.tsx` (AST + source check) + `next/dynamic` chunk isolation for `MagazineQrModal` & `ContactBulkImportModal`
 *  2. `src/app/layout.tsx` sets `preload: false` on legacy `.woff` `localFont` while preserving disk fonts for `/api/og/**`
 *  3. All 4 V2 broker workspace `loading.tsx` shells render accessible skeletons (`role="status"`, `aria-busy="true"`) with zero sub-14px typography tokens and zero banned lexicon terms
 *  4. `tsconfig.json` excludes `src/tests` & `e2e` for fast production builds while `tsconfig.test.json` + `package.json` `typecheck` cover 100% of app + test + script files
 *  5. `/dc/[id]/page.tsx` batches multi-UUID `document_objects` checks into a single `.in("building_id", ...)` query and runs `fetchPublicBrokerProfile` + `hasPublishedImExistence` concurrently
 */

import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BANNED_UI_TERMS } from "@/lib/ux/lexicon";

const dcHoisted = vi.hoisted(() => ({
  guardResult: {
    blocked: false,
    ownerId: "11111111-1111-4111-8111-111111111111",
    workspaceItemStatus: "published",
    item: {
      id: "22222222-2222-4222-8222-222222222222",
      buildingId: "33333333-3333-4333-8333-333333333333",
      legacyId: "bld-legacy-99",
      title: "역삼역 도보 3분 코너 수익형 빌딩",
      address: "서울특별시 강남구 역삼동",
      priceBand: "90~100억",
      correctionNotice: null,
    },
    projection: {
      snapshot: {
        card4: {
          headline: "역삼역 도보 3분 코너 수익형 빌딩",
          region: "강남구 역삼동",
          use: "근린생활시설",
          priceBand: "90~100억",
          area: "연면적 310평",
          points: ["역삼역 도보 3분", "전층 우량 임차인", "코너 가시성 우수"],
          posture: "income",
        },
      },
    },
  } as Record<string, unknown>,
  workspaceLookupSpy: vi.fn(async (_supabase: unknown, _cid: string) => null),
  docObjectsInCalls: [] as Array<{ col: string; vals: unknown[] }>,
  docObjectsEqCalls: [] as Array<{ col: string; val: unknown }>,
  activeOperations: 0,
  maxConcurrentOperations: 0,
}));

vi.mock("@/lib/server-viewer", () => ({
  getServerViewer: vi.fn(async () => ({ userId: null, isAdmin: false })),
}));

vi.mock("@/lib/og/deal-public-guard", () => ({
  allowDealPublicMemoryFallback: () => false,
  resolvePublicDealWorkspaceGuard: vi.fn(async () => dcHoisted.guardResult),
}));

vi.mock("@/lib/workspace/workspace-repository", () => ({
  getWorkspaceItemByAnyId: (...args: [unknown, string]) =>
    dcHoisted.workspaceLookupSpy(args[0], args[1]),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      const executeTracked = async <T>(value: T): Promise<T> => {
        dcHoisted.activeOperations += 1;
        dcHoisted.maxConcurrentOperations = Math.max(
          dcHoisted.maxConcurrentOperations,
          dcHoisted.activeOperations,
        );
        await new Promise((r) => setTimeout(r, 12));
        dcHoisted.activeOperations -= 1;
        return value;
      };

      const chain: Record<string, unknown> = {};
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn((col: string, val: unknown) => {
        if (table === "document_objects") {
          dcHoisted.docObjectsEqCalls.push({ col, val });
        }
        return chain;
      });
      chain.neq = vi.fn(() => chain);
      chain.in = vi.fn((col: string, vals: unknown[]) => {
        if (table === "document_objects") {
          dcHoisted.docObjectsInCalls.push({ col, vals });
        }
        return chain;
      });
      chain.order = vi.fn(() => chain);
      chain.limit = vi.fn(() => chain);
      chain.maybeSingle = vi.fn(async () => {
        if (table === "broker_profiles") {
          return executeTracked({
            data: {
              user_id: "11111111-1111-4111-8111-111111111111",
              slug: "gangnam-prime",
              card_name: "김대표 중개사",
              office_reg_number: "11680-2024-00001",
            },
            error: null,
          });
        }
        if (table === "profiles") {
          return executeTracked({
            data: {
              display_name: "김대표 중개사",
              phone: "010-1234-5678",
              company: "강남프라임공인중개사사무소",
              role: "broker",
            },
            error: null,
          });
        }
        return executeTracked({ data: null, error: null });
      });
      chain.then = (onFulfilled: (val: unknown) => unknown, onRejected?: (err: unknown) => unknown) => {
        const resultPromise =
          table === "document_objects"
            ? executeTracked({
                data: [
                  {
                    id: "doc-im-published-1",
                    status: "published",
                    document_type: "mobile_im",
                    visibility: "public",
                    body: {},
                  },
                ],
                error: null,
              })
            : executeTracked({ data: [], error: null });
        return resultPromise.then(onFulfilled, onRejected);
      };
      return chain;
    }),
  })),
}));

import DealCardsWorkspaceLoading from "@/app/(broker)/broker/w/dealcards/loading";
import ImWorkspaceLoading from "@/app/(broker)/broker/w/im/loading";
import InboxWorkspaceLoading from "@/app/(broker)/broker/w/inbox/loading";
import NewsletterWorkspaceLoading from "@/app/(broker)/broker/w/newsletter/loading";
import DealCardShortPage from "@/app/(public)/dc/[id]/page";

function readRepoFile(relPath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relPath), "utf8").replace(/^\uFEFF/, "");
}

function collectStaticImportSpecifiers(relPath: string): string[] {
  const src = readRepoFile(relPath);
  const sf = ts.createSourceFile(
    relPath,
    src,
    ts.ScriptTarget.Latest,
    true,
    relPath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const specs: string[] = [];
  sf.forEachChild((node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      specs.push(node.moduleSpecifier.text);
    }
    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specs.push(node.moduleSpecifier.text);
    }
  });
  return specs;
}

describe("Wave 4 Track 4A — Bundle Diet, TS Build Isolation, Font Preload, Workspace Skeletons & /dc/[id] Query Batching", () => {
  beforeEach(() => {
    dcHoisted.docObjectsInCalls = [];
    dcHoisted.docObjectsEqCalls = [];
    dcHoisted.activeOperations = 0;
    dcHoisted.maxConcurrentOperations = 0;
    dcHoisted.workspaceLookupSpy.mockClear();
  });

  it("[4A-01] evicts static top-level xlsx imports from client importers while preserving dynamic import('xlsx') and Wave 2C safety flags", () => {
    const xlsxImporterFiles = [
      "src/components/broker/rent-roll-importer.tsx",
      "src/app/(broker)/broker/buildings/[id]/studio/lease/components/lease-file-import.tsx",
    ];

    for (const relPath of xlsxImporterFiles) {
      const staticImports = collectStaticImportSpecifiers(relPath);
      expect(staticImports, `${relPath} must not statically import xlsx`).not.toContain("xlsx");

      const src = readRepoFile(relPath);
      expect(src).not.toMatch(/^\s*import\s+.*from\s+["']xlsx["']/m);
      expect(src).toMatch(/await\s+import\(\s*["']xlsx["']\s*\)/);
      expect(src).toContain("sheetRows: 2000");
      expect(src).toContain("cellFormula: false");
      expect(src).toContain("cellHTML: false");
      expect(src).toContain("bookVBA: false");
    }

    // Verify qrcode modal & inbox bulk modal are lazy-loaded via next/dynamic
    const outreachStaticImports = collectStaticImportSpecifiers(
      "src/components/magazine-editor/EditorOutreachTab.tsx",
    );
    expect(outreachStaticImports).toContain("next/dynamic");
    expect(outreachStaticImports).not.toContain("./MagazineQrModal");

    const inboxStaticImports = collectStaticImportSpecifiers(
      "src/app/(broker)/broker/w/inbox/page.tsx",
    );
    expect(inboxStaticImports).toContain("next/dynamic");
    expect(inboxStaticImports).not.toContain(
      "@/components/workspace/inbox/ContactBulkImportModal",
    );

    const addSubStaticImports = collectStaticImportSpecifiers(
      "src/components/magazine-editor/outreach/AddSubscriberForm.tsx",
    );
    expect(addSubStaticImports).toContain("next/dynamic");
    expect(addSubStaticImports).not.toContain(
      "@/components/workspace/inbox/ContactBulkImportModal",
    );
  });

  it("[4A-02] disables 1.68 MB blocking .woff font preload in layout.tsx while keeping disk fonts intact for OG routes", () => {
    const layoutSrc = readRepoFile("src/app/layout.tsx");
    const localFontBlockMatch = layoutSrc.match(/const\s+notoKr\s*=\s*localFont\(\{[\s\S]*?\}\);/);
    expect(localFontBlockMatch).not.toBeNull();
    const block = localFontBlockMatch![0];

    expect(block).toContain('display: "swap"');
    expect(block).toContain("preload: false");
    expect(block).not.toContain("preload: true");

    // /api/og/** routes read NotoSansKR-*.woff from public/fonts on disk
    expect(
      fs.existsSync(path.resolve(process.cwd(), "public/fonts/NotoSansKR-Regular.woff")),
    ).toBe(true);
    expect(
      fs.existsSync(path.resolve(process.cwd(), "public/fonts/NotoSansKR-Bold.woff")),
    ).toBe(true);
  });

  it("[4A-03] renders accessible, senior-readable (>=14px, zero text-xs) loading.tsx skeletons for all 4 V2 broker workspaces", () => {
    const loadingSpecs = [
      {
        relPath: "src/app/(broker)/broker/w/dealcards/loading.tsx",
        Component: DealCardsWorkspaceLoading,
        expectedBadge: "딜카드",
      },
      {
        relPath: "src/app/(broker)/broker/w/im/loading.tsx",
        Component: ImWorkspaceLoading,
        expectedBadge: "IM",
      },
      {
        relPath: "src/app/(broker)/broker/w/inbox/loading.tsx",
        Component: InboxWorkspaceLoading,
        expectedBadge: "고객 소통",
      },
      {
        relPath: "src/app/(broker)/broker/w/newsletter/loading.tsx",
        Component: NewsletterWorkspaceLoading,
        expectedBadge: "부동산뉴스",
      },
    ];

    const sub14Re = /\btext-(?:xs|\[(?:9|10|11|12|13)px\])\b/g;

    for (const { relPath, Component, expectedBadge } of loadingSpecs) {
      const src = readRepoFile(relPath);
      expect(src.match(sub14Re) ?? [], `${relPath} has sub-14px classes`).toEqual([]);

      for (const { term, use } of BANNED_UI_TERMS) {
        expect(src.match(term), `${relPath} uses banned term (${use})`).toBeNull();
      }

      const html = renderToStaticMarkup(React.createElement(Component));
      expect(html).toContain('role="status"');
      expect(html).toContain('aria-busy="true"');
      expect(html).toContain("aria-label=");
      expect(html).toContain(expectedBadge);
      expect(html.match(sub14Re) ?? []).toEqual([]);
    }
  });

  it("[4A-04] isolates production TypeScript build graph in tsconfig.json while tsconfig.test.json + npm run typecheck cover all tests and scripts", () => {
    const tsconfig = JSON.parse(readRepoFile("tsconfig.json")) as {
      exclude?: string[];
    };
    const tsconfigTest = JSON.parse(readRepoFile("tsconfig.test.json")) as {
      extends?: string;
      include?: string[];
      exclude?: string[];
    };
    const pkg = JSON.parse(readRepoFile("package.json")) as {
      scripts?: Record<string, string>;
    };

    expect(tsconfig.exclude).toEqual(
      expect.arrayContaining([
        "node_modules",
        ".next",
        ".vercel",
        ".worktrees",
        "src/tests",
        "tests",
        "e2e",
        "scripts",
      ]),
    );

    expect(tsconfigTest.extends).toBe("./tsconfig.json");
    expect(tsconfigTest.include).toEqual(
      expect.arrayContaining([
        "next-env.d.ts",
        "src/**/*.ts",
        "src/**/*.tsx",
        "e2e/**/*.ts",
        "scripts/**/*.ts",
      ]),
    );
    expect(tsconfigTest.exclude).not.toContain("src/tests");
    expect(tsconfigTest.exclude).not.toContain("e2e");
    expect(tsconfigTest.exclude).not.toContain("scripts");

    expect(pkg.scripts?.typecheck).toBe(
      "tsc --noEmit && tsc --noEmit -p tsconfig.test.json",
    );
  });

  it("[4A-05] batches multi-UUID document_objects check into a single .in('building_id', ...) query and runs profile + IM checks concurrently in /dc/[id]", async () => {
    const distinctRequestUuid = "44444444-4444-4444-8444-444444444444";
    const el = await DealCardShortPage({
      params: Promise.resolve({ id: distinctRequestUuid }),
      searchParams: Promise.resolve({}),
    });
    expect(el).toBeTruthy();

    // Workspace IM lookup ran for all 3 unique candidate IDs (buildingId, legacyId, id)
    expect(dcHoisted.workspaceLookupSpy).toHaveBeenCalledTimes(3);

    // Multi-UUID document_objects check MUST use ONE batched .in("building_id", [...]) query and ZERO .eq("building_id", ...) loops
    const buildingInCalls = dcHoisted.docObjectsInCalls.filter(
      (c) => c.col === "building_id",
    );
    expect(buildingInCalls).toHaveLength(1);
    expect(buildingInCalls[0].vals).toEqual([
      "33333333-3333-4333-8333-333333333333",
      distinctRequestUuid,
    ]);
    expect(
      dcHoisted.docObjectsEqCalls.filter((c) => c.col === "building_id"),
    ).toEqual([]);

    // fetchPublicBrokerProfile (broker_profiles + profiles) and hasPublishedImExistence ran concurrently
    expect(dcHoisted.maxConcurrentOperations).toBeGreaterThanOrEqual(3);
  });
});
