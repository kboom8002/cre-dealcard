/**
 * @file src/tests/preventive/l11-runtime-friction-zero-jsdom-rag.test.ts
 * @description L11 Preventive Suite — Production Runtime Friction & 500/PGRST202 Zero-Regression Guard
 *
 * Covers the 5 production anomalies identified in the 16h/24h forensic audit:
 *  1. Zero `isomorphic-dompurify` / `jsdom` imports across production `src/` + `sanitizeHtmlAllowlist` XSS defense
 *  2. `cre-rag-service` & `im-embedding-indexer` `PGRST202`/`PGRST205` circuit breaker + `document_objects` hybrid fallback
 *  3. `workspace/summary` IM-backed blind-safe DealCard synthesis + rapid duplicate `PATCH` deduplication
 *  4. `dealcard-im-test-assets` `cache: "no-store"` upstream fetch (prevents Next.js >2MB Data Cache warning)
 *  5. `public/og-default.png` valid 1200x630 PNG asset presence (prevents Kakao OG 404)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import type { createClient, SupabaseClient } from "@supabase/supabase-js";
import { sanitizeHtmlAllowlist } from "@/lib/security/sanitize-html-isomorphic";
import {
  generateRAGContext,
  resetRagRpcCircuitBreakerForTest,
  searchSimilarIMs,
} from "@/domain/building/mobile-im/cre-rag-service";
import {
  indexIMSections,
  resetImEmbeddingCircuitBreakerForTest,
} from "@/domain/building/mobile-im/im-embedding-indexer";
import {
  GET as summaryGET,
  PATCH as summaryPATCH,
} from "@/app/api/broker/workspace/summary/route";

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

function walkSourceFiles(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "tests") continue;
      walkSourceFiles(full, out);
    } else if (/\.(ts|tsx|js|mjs)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe("L11 Preventive — Production Runtime Friction & Zero-JSDOM/RAG Hardening", () => {
  const originalFetch = global.fetch;
  const originalOpenAiKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    resetRagRpcCircuitBreakerForTest();
    resetImEmbeddingCircuitBreakerForTest();
    (
      globalThis as unknown as { __creWorkspaceMemoMemory?: unknown }
    ).__creWorkspaceMemoMemory = undefined;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalOpenAiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalOpenAiKey;
    }
  });

  it("[L11-01] forbids isomorphic-dompurify and jsdom imports across all production src/ modules", () => {
    const prodRoots = [
      path.join(process.cwd(), "src", "app"),
      path.join(process.cwd(), "src", "components"),
      path.join(process.cwd(), "src", "domain"),
      path.join(process.cwd(), "src", "lib"),
    ];
    const forbiddenImportRe =
      /(?:from\s+["'](?:isomorphic-dompurify|dompurify|jsdom)["']|require\(\s*["'](?:isomorphic-dompurify|dompurify|jsdom)["']\s*\))/;

    const offenders = prodRoots
      .flatMap((r) => walkSourceFiles(r))
      .filter((filePath) => forbiddenImportRe.test(fs.readFileSync(filePath, "utf8")))
      .map((filePath) => path.relative(process.cwd(), filePath));

    expect(offenders).toEqual([]);
  });

  it("[L11-02] sanitizeHtmlAllowlist neutralizes XSS vectors while preserving allowlisted IM/Agora markup", () => {
    const dirty = [
      '<p class="lead">핵심 <strong>수익률 4.8%</strong> 분석</p>',
      '<script>window.__pwn = 1;</script>',
      '<img src="https://cdn.credeal.net/photo.jpg" alt="외관" onerror="alert(1)" data-secret="leak" />',
      '<a href="&#106;avascript:alert(2)" onclick="evil()">위험링크</a>',
      '<a href="https://www.credeal.net/im-lite/123" target="_blank">안전링크</a>',
      '<svg onload="alert(3)"><circle cx="1" cy="1" r="1"/></svg>',
      '<span style="color: #fff; background: url(javascript:alert(4))">스타일검증</span>',
    ].join("");

    const clean = sanitizeHtmlAllowlist(dirty);

    expect(clean).not.toMatch(/<script|<svg|onerror|onclick|javascript:|data-secret/i);
    expect(clean).toContain('<p class="lead">핵심 <strong>수익률 4.8%</strong> 분석</p>');
    expect(clean).toContain('<img src="https://cdn.credeal.net/photo.jpg" alt="외관" />');
    expect(clean).toContain('<a>위험링크</a>');
    expect(clean).toContain(
      '<a href="https://www.credeal.net/im-lite/123" target="_blank" rel="noopener noreferrer">안전링크</a>'
    );
    expect(clean).toContain("<span>스타일검증</span>");
  });

  it("[L11-03] cre-rag-service trips PGRST202 circuit breaker, falls back to published document_objects, and skips redundant embedding calls", async () => {
    process.env.OPENAI_API_KEY = "sk-test-dummy-key";
    const embeddingFetchSpy = vi.fn(async () => {
      return new Response(
        JSON.stringify({ data: [{ embedding: [0.01, 0.02, 0.03] }] }),
        { status: 200 }
      );
    });
    global.fetch = embeddingFetchSpy as unknown as typeof fetch;

    const rpcSpy = vi.fn(async () => ({
      data: null,
      error: {
        code: "PGRST202",
        message: "Could not find the function public.match_im_documents in the schema cache",
      },
    }));

    const publishedRows = [
      {
        id: "doc-im-1",
        building_id: "bld-ref-1",
        title: "동교동 코너 수익형 빌딩",
        updated_at: "2026-11-11T10:50:00Z",
        body: {
          resolved_address: "서울특별시 마포구 동교동",
          investment_posture: "income",
          ssot_summary: {
            address: "서울특별시 마포구 동교동",
            main_usage: "근린생활시설",
            investment_posture: "income",
          },
          axios_highlights: [
            { claim: "홍대입구역 도보 3분 역세권", detail: "연 수익률 4.6% 전층 만실" },
          ],
          sections: [
            {
              title: "투자 요약",
              markdown: "마포구 동교동 핵심 상권에 위치한 우량 근린생활시설 투자 사례입니다.",
            },
          ],
        },
      },
    ];

    const fakeSupabase = {
      rpc: rpcSpy,
      from: vi.fn(() => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              order: () => ({
                limit: async () => ({ data: publishedRows, error: null }),
              }),
            }),
          }),
        }),
      })),
    } as unknown as ReturnType<typeof createClient>;

    // 1st call: hits PGRST202 once, trips circuit breaker, and returns document_objects fallback
    const firstDocs = await searchSimilarIMs(fakeSupabase, "마포구 동교동 근린생활시설 수익형", {
      filterByAssetType: "근린생활시설",
      filterByRegion: "마포구 동교동",
      filterByPosture: "income",
    });
    expect(firstDocs).toHaveLength(1);
    expect(firstDocs[0].metadata.source).toBe("document_objects_fallback");
    expect(firstDocs[0].content).toContain("홍대입구역 도보 3분 역세권");
    expect(embeddingFetchSpy).toHaveBeenCalledTimes(1);
    expect(rpcSpy).toHaveBeenCalledTimes(1);

    // 2nd call within 10m cooldown: skips BOTH OpenAI embedding fetch and RPC call!
    const ctx = await generateRAGContext(
      fakeSupabase,
      "근린생활시설",
      "서울특별시 마포구 동교동",
      "신규 대상 빌딩",
      "income"
    );
    expect(ctx).toContain("[유사사례 1]");
    expect(embeddingFetchSpy).toHaveBeenCalledTimes(1);
    expect(rpcSpy).toHaveBeenCalledTimes(1);
  });

  it("[L11-04] im-embedding-indexer skips OpenAI embedding call when im_documents table is absent (PGRST205)", async () => {
    process.env.OPENAI_API_KEY = "sk-test-dummy-key";
    const embeddingFetchSpy = vi.fn();
    global.fetch = embeddingFetchSpy as unknown as typeof fetch;

    const fakeSupabase = {
      from: vi.fn(() => ({
        select: () => ({
          limit: async () => ({
            data: null,
            error: {
              code: "PGRST205",
              message: "Could not find the table 'public.im_documents' in the schema cache",
            },
          }),
        }),
      })),
    } as unknown as SupabaseClient;

    await indexIMSections(
      fakeSupabase,
      "bld-123",
      [
        {
          section_type: "property_overview",
          section_order: 1,
          title: "요약",
          markdown: "테스트 본문",
          confidence: "confirmed",
          boundary_note: "",
        },
      ],
      { status: "published", brokerApproved: true }
    );

    expect(embeddingFetchSpy).not.toHaveBeenCalled();
  });

  it("[L11-05] workspace/summary synthesizes blind-safe IM-backed DealCard copy and deduplicates rapid identical PATCH upserts", async () => {
    const brokerId = "ba89ab53-0000-4000-8000-000000000001";
    const bldUuid = "b50e9937-b3ab-4445-953d-a2efb727b86e";
    mockRequireBroker.mockResolvedValue({
      ok: true,
      user: { id: brokerId },
      role: "broker",
    });

    const insertedEvents: Array<Record<string, unknown>> = [];
    const makeChain = (rows: unknown[]) => {
      const chain: Record<string, unknown> = {};
      for (const method of ["select", "eq", "neq", "in", "order", "or", "is", "limit"]) {
        chain[method] = () => chain;
      }
      chain.maybeSingle = async () => ({ data: rows[0] ?? null, error: null });
      chain.then = (resolve: (val: unknown) => unknown) =>
        Promise.resolve({ data: rows, error: null }).then(resolve);
      return chain;
    };

    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === "building_ssot_lite") {
        const rows = [
          {
            id: bldUuid,
            owner_id: brokerId,
            area_signal: "마포구 동교동",
            asset_type: "근린생활시설",
            price_band: null,
            fit_summary: null,
            status: "draft",
            updated_at: new Date().toISOString(),
            created_by: brokerId,
            layers: {
              building_register: {
                gross_floor_area_sqm: 991.74,
                land_area_sqm: 330.58,
              },
            },
          },
        ];
        return makeChain(rows);
      }
      if (table === "document_objects") {
        const docs = [
          {
            id: "im-doc-1",
            building_id: bldUuid,
            document_type: "mobile_im",
            status: "published",
            title: "THE.PARK Building",
            updated_at: new Date().toISOString(),
            body: {
              heroTitle: "THE.PARK Building",
              investment_posture: "income",
              ssot_summary: {
                asking_price_manwon: 780000,
                nearest_station: "홍대입구역",
                walk_minutes: 4,
                cap_rate_pct: 4.5,
                floors_below: 1,
                floors_above: 6,
                investment_posture: "income",
              },
              axios_highlights: [
                { claim: "동교동 165-8 THE.PARK Building 스타벅스 입점" },
              ],
            },
          },
        ];
        return makeChain(docs);
      }
      if (table === "activity_events") {
        const actChain = makeChain([]);
        actChain.insert = async (payload: Record<string, unknown>) => {
          insertedEvents.push(payload);
          return { data: null, error: null };
        };
        return actChain;
      }
      const defaultChain = makeChain([]);
      defaultChain.insert = async () => ({ data: null, error: null });
      defaultChain.update = () => makeChain([]);
      return defaultChain;
    });

    // 1) Verify GET synthesizes blind-safe IM metrics instead of generic placeholders
    const getRes = await summaryGET(
      new NextRequest("http://localhost:3000/api/broker/workspace/summary")
    );
    expect(getRes.status).toBe(200);
    const summaryJson = await getRes.json();
    expect(summaryJson.dealcards).toHaveLength(1);
    const synthesized = summaryJson.dealcards[0];
    expect(synthesized.priceBand).toBe("75~80억");
    expect(synthesized.card4.points[0]).toBe("홍대입구역 도보 4분 역세권");
    expect(synthesized.card4.points[1]).toBe("연 수익률 4.5% 안정 운영");
    expect(synthesized.card4.points[2]).toBe("지하1층·지상6층 규모");
    // Blind-guard check: never leaks building name, lot number, or tenant brand
    const joinedCopy = [synthesized.card4.headline, ...synthesized.card4.points].join(" ");
    expect(joinedCopy).not.toContain("THE.PARK");
    expect(joinedCopy).not.toContain("165-8");
    expect(joinedCopy).not.toContain("스타벅스");
    expect(joinedCopy).not.toContain("상세 수익률 및 임대현황");

    // 2) Verify rapid duplicate PATCH (explicit save + 900ms autosave race) emits events only ONCE
    const draftPayload = {
      action: "upsert",
      buildingId: "bld-local-race-1",
      pairedMemoId: "memo-race-1",
      memoText: "마포구 서교동 코너 근생 매매 85억",
      generationSource: "ai_memo",
      card4: {
        headline: "홍대입구역 도보 3분 코너",
        posture: "income",
        region: "마포구 서교동",
        use: "근린생활시설",
        area: "연면적 280평",
        priceBand: "85~90억",
        points: [
          "홍대입구역 도보 3분 역세권",
          "우량 임차인 전층 만실 운영",
          "대로변 코너 가시성 우수",
        ],
        provenance: { points: ["ai", "ai", "ai"] },
        card4_version: 1,
      },
    };

    const patch1 = await summaryPATCH(
      new NextRequest("http://localhost:3000/api/broker/workspace/summary", {
        method: "PATCH",
        body: JSON.stringify(draftPayload),
      })
    );
    const patch2 = await summaryPATCH(
      new NextRequest("http://localhost:3000/api/broker/workspace/summary", {
        method: "PATCH",
        body: JSON.stringify(draftPayload),
      })
    );

    expect(patch1.status).toBe(200);
    expect(patch2.status).toBe(200);
    const patch2Json = await patch2.json();
    expect(patch2Json.deduplicated).toBe(true);

    const convertedEvents = insertedEvents.filter(
      (e) => e.event_type === "unconverted_memo_converted"
    );
    const upsertedEvents = insertedEvents.filter(
      (e) => e.event_type === "dealcard_upserted"
    );
    expect(convertedEvents).toHaveLength(1);
    expect(upsertedEvents).toHaveLength(1);
  });

  it("[L11-06] verifies >2MB cache bypass, 6-arg RAG SQL migration, and valid public/og-default.png", () => {
    const testAssetsRoute = fs.readFileSync(
      path.join(process.cwd(), "src/app/api/public/dealcard-im-test-assets/route.ts"),
      "utf8"
    );
    expect(testAssetsRoute).toContain('cache: "no-store"');
    expect(testAssetsRoute).not.toContain("revalidate: 86400");

    const migrationSql = fs.readFileSync(
      path.join(
        process.cwd(),
        "supabase/migrations/20261112000001_im_documents_hybrid_rag_v2.sql"
      ),
      "utf8"
    );
    expect(migrationSql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migrationSql).toContain("filter_posture TEXT DEFAULT NULL");

    const ogPngPath = path.join(process.cwd(), "public/og-default.png");
    expect(fs.existsSync(ogPngPath)).toBe(true);
    const ogBuf = fs.readFileSync(ogPngPath);
    // PNG magic header: 89 50 4E 47 0D 0A 1A 0A
    expect(ogBuf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(
      true
    );
    // IHDR width/height at bytes 16..24 (big-endian 1200 x 630)
    expect(ogBuf.readUInt32BE(16)).toBe(1200);
    expect(ogBuf.readUInt32BE(20)).toBe(630);
    expect(ogBuf.byteLength).toBeLessThan(200_000);
  });
});
