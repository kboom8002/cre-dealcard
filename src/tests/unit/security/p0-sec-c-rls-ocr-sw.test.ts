/**
 * P0-SEC part C — SEC-4 / SEC-6 / SEC-7 static + logic regression tests.
 *
 *  - SEC-4: 20261027000001 migration drops every public read / open policy and re-scopes gate_requests.
 *  - SEC-6: lease-photo-ocr has no mock tenant fallback / dummy token; studio pages have no dummy token.
 *  - SEC-7: public/sw-im.js request/response filter (loaded verbatim in a VM sandbox) + scoped registration.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, it, expect } from "vitest";

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const stripSqlComments = (sql: string) => sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");

// ─────────────────────────────────────────────────────────────────────────────
// SEC-4
// ─────────────────────────────────────────────────────────────────────────────
describe("SEC-4 RLS lockdown migration (20261027000001)", () => {
  const MIG = "supabase/migrations/20261027000001_sec4_rls_public_read_lockdown.sql";
  const RB = "supabase/migrations/_rollback/20261027000001_sec4_rls_public_read_lockdown_rollback.sql";
  const raw = read(MIG);
  const sql = stripSqlComments(raw).replace(/\s+/g, " ");

  const mustDrop: Array<[string, string]> = [
    ["Public read assets", "assets"],
    ["Public read deals", "deals"],
    ["Public read lease units", "lease_units"],
    ["Public read deal parties", "deal_parties"],
    ["Public read edit diffs", "im_edit_diffs"],
    ["Service role full access", "im_generation_jobs"],
    ["gate_requests_anon_select_submitted", "gate_requests"],
    ["gate_requests_insert_anon", "gate_requests"],
  ];

  it.each(mustDrop)('drops "%s" on public.%s (idempotent)', (policy, table) => {
    const re = new RegExp(`drop policy if exists "${policy}" on public\\.${table}\\b`, "i");
    expect(sql).toMatch(re);
  });

  it("never re-creates an open (USING/WITH CHECK true) policy or an anon policy", () => {
    const creates = [...sql.matchAll(/create policy ("[^"]+"|\w+) on ([\w."]+)(.*?)(\$p\$|;)/gi)];
    expect(creates.length).toBeGreaterThan(0);
    for (const [, , , body] of creates) {
      expect(body).not.toMatch(/using \( ?true ?\)/i);
      expect(body).not.toMatch(/with check \( ?true ?\)/i);
      expect(body).not.toMatch(/\bto [^u]*\banon\b/i);
      expect(body).toMatch(/\bto authenticated\b/i);
    }
  });

  it("does not re-create the dropped public policies", () => {
    for (const [policy] of mustDrop) {
      expect(sql).not.toMatch(new RegExp(`create policy "${policy}"`, "i"));
    }
  });

  it("scopes gate_requests reads to the building owner / target broker", () => {
    expect(sql).toMatch(/create policy "gate_requests_select_building_owner" on public\.gate_requests for select to authenticated/i);
    expect(sql).toMatch(/b\.owner_id = auth\.uid\(\)/i);
    expect(sql).toMatch(/create policy "gate_requests_insert_own" on public\.gate_requests for insert to authenticated with check \(requester_id = auth\.uid\(\)\)/i);
  });

  it("narrows im_generation_jobs own-read to authenticated", () => {
    expect(sql).toMatch(/create policy "Users can read own jobs" on public\.im_generation_jobs for select to authenticated using \(auth\.uid\(\) = user_id\)/i);
  });

  it("sweeps any remaining true-policies by name-agnostic loop and self-verifies in a transaction", () => {
    expect(sql).toMatch(/^\s*begin;/i);
    expect(sql).toMatch(/commit;\s*$/i);
    expect(sql).toMatch(/roles && array\['public','anon','authenticated'\]::name\[\]/i);
    expect(sql).toMatch(/raise exception '검증 실패/);
  });

  it("documents operator verification (pg_policies before/after) in the header", () => {
    expect(raw).toMatch(/\[적용 전\][\s\S]*from pg_policies/);
    expect(raw).toMatch(/\[적용 후\][\s\S]*from pg_policies/);
    for (const t of ["assets", "deals", "lease_units", "deal_parties", "im_edit_diffs", "im_generation_jobs", "gate_requests"]) {
      expect(raw).toContain(`'${t}'`);
    }
  });

  it("ships a matching rollback script", () => {
    expect(fs.existsSync(path.join(ROOT, RB))).toBe(true);
    const rb = stripSqlComments(read(RB));
    expect(rb).toMatch(/create policy "Public read deals"/i);
    expect(rb).toMatch(/drop policy if exists "gate_requests_select_building_owner"/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SEC-6
// ─────────────────────────────────────────────────────────────────────────────
describe("SEC-6 lease photo OCR — no mock fallback", () => {
  const OCR = "src/app/(broker)/broker/buildings/[id]/studio/lease/components/lease-photo-ocr.tsx";
  const src = read(OCR);
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

  it("contains no hardcoded mock tenants", () => {
    for (const fake of ["스타벅스", "법무법인", "4500000", "50000000"]) {
      expect(code).not.toContain(fake);
    }
    expect(code).not.toMatch(/setTimeout\s*\(/);
    expect(code).not.toMatch(/fallback parser/i);
  });

  it("does not send a dummy token or build an Authorization header", () => {
    expect(code).not.toContain("dummy-token");
    expect(code).not.toMatch(/Authorization/);
  });

  it("calls onImport only with server-returned tenants", () => {
    const calls = [...code.matchAll(/onImport\(([^)]*)\)/g)].map((m) => m[1].trim());
    expect(calls).toEqual(["data.tenants as TenantRow[]"]);
  });

  it("is disabled ('준비 중') while the OCR API route does not exist", () => {
    const routeExists = fs.existsSync(path.join(ROOT, "src/app/api/broker/studio/lease/ocr/route.ts"));
    if (!routeExists) {
      expect(src).toMatch(/export const LEASE_PHOTO_OCR_ENABLED = false;/);
      expect(src).toContain("준비 중");
    }
  });

  it("broker studio pages no longer fall back to 'dummy-token'", () => {
    for (const p of ["briefing", "disclosure", "files", "lease"]) {
      const page = read(`src/app/(broker)/broker/buildings/[id]/studio/${p}/page.tsx`);
      expect(page, p).not.toContain("|| 'dummy-token'");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SEC-7
// ─────────────────────────────────────────────────────────────────────────────
type Classify = (url: string, origin: string, opts?: { method?: string; hasAuthorization?: boolean }) => "im" | "static" | null;
type IsCacheable = (res: unknown, kind: "im" | "static") => boolean;

function loadSw() {
  const listeners: Record<string, unknown> = {};
  const sandbox: Record<string, unknown> = {
    URL,
    self: { addEventListener: (t: string, fn: unknown) => (listeners[t] = fn) },
  };
  vm.createContext(sandbox);
  vm.runInContext(read("public/sw-im.js"), sandbox);
  return {
    classify: sandbox.classifyRequest as Classify,
    shouldCache: sandbox.shouldCache as (u: string, o: string, opts?: object) => boolean,
    isCacheable: sandbox.isCacheableResponse as IsCacheable,
    isLegacyRootScope: sandbox.isLegacyRootScope as (s: string) => boolean,
    cacheName: vm.runInContext("CACHE_NAME", sandbox) as string,
    listeners,
  };
}

const mkRes = (headers: Record<string, string>, extra: Partial<{ ok: boolean; status: number; type: string; redirected: boolean }> = {}) => ({
  ok: true,
  status: 200,
  type: "basic",
  redirected: false,
  ...extra,
  headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
});

describe("SEC-7 sw-im.js fetch filter", () => {
  const O = "https://credeal.kr";
  const sw = loadSw();

  it("loads and registers install/activate/fetch handlers", () => {
    expect(typeof sw.classify).toBe("function");
    expect(Object.keys(sw.listeners).sort()).toEqual(["activate", "fetch", "install"]);
  });

  it("bumps the cache version past v1", () => {
    expect(sw.cacheName).toMatch(/^im-offline-v\d+$/);
    expect(sw.cacheName).not.toBe("im-offline-v1");
  });

  it.each([
    `${O}/api/broker/im-lite/job-status?jobId=1`,
    `${O}/api/public/im-lite/abc`,
    `${O}/api/broker/pptx-studio/projects/1/download`,
    `${O}/broker/im-lite/preview/abc`,
    `${O}/broker/deal-card/abc`,
    `${O}/auth/callback?code=x`,
    `${O}/login`,
    `${O}/admin/gate-requests`,
    `${O}/im-lite/abc/download.pptx`,
    `${O}/im-lite/abc.pdf`,
    `${O}/im-lite/abc?download=1`,
    `${O}/im-lite/abc?token=secret`,
    `https://evil.example/im-lite/abc`,
    `${O}/dc/abc`,
    `${O}/`,
    `${O}/_next/image?url=x`,
  ])("never caches %s", (url) => {
    expect(sw.classify(url, O, { method: "GET" })).toBeNull();
    expect(sw.shouldCache(url, O, { method: "GET" })).toBe(false);
  });

  it("handles IM pages under /im-lite/ (network-first) and hashed static assets (cache-first)", () => {
    expect(sw.classify(`${O}/im-lite/abc`, O)).toBe("im");
    expect(sw.classify(`${O}/im-lite/abc?doc=123`, O)).toBe("im");
    expect(sw.classify(`${O}/_next/static/chunks/app-123.js`, O)).toBe("static");
  });

  it("ignores non-GET and Authorization-bearing requests", () => {
    expect(sw.classify(`${O}/im-lite/abc`, O, { method: "POST" })).toBeNull();
    expect(sw.classify(`${O}/im-lite/abc`, O, { method: "GET", hasAuthorization: true })).toBeNull();
  });

  it("refuses to store private/no-store, attachment, binary, redirected or non-OK responses", () => {
    expect(sw.isCacheable(mkRes({ "content-type": "text/html; charset=utf-8" }), "im")).toBe(true);
    expect(sw.isCacheable(mkRes({ "content-type": "text/html", "cache-control": "private, no-cache, no-store, max-age=0" }), "im")).toBe(false);
    expect(sw.isCacheable(mkRes({ "content-type": "text/html", "content-disposition": "attachment; filename=a.pptx" }), "im")).toBe(false);
    expect(sw.isCacheable(mkRes({ "content-type": "application/vnd.openxmlformats-officedocument.presentationml.presentation" }), "im")).toBe(false);
    expect(sw.isCacheable(mkRes({ "content-type": "application/vnd.openxmlformats-officedocument.presentationml.presentation" }), "static")).toBe(false);
    expect(sw.isCacheable(mkRes({ "content-type": "application/json" }), "im")).toBe(false);
    expect(sw.isCacheable(mkRes({ "content-type": "text/html" }, { ok: false, status: 404 }), "im")).toBe(false);
    expect(sw.isCacheable(mkRes({ "content-type": "text/html" }, { redirected: true }), "im")).toBe(false);
    expect(sw.isCacheable(mkRes({ "content-type": "text/html" }, { type: "opaque" }), "im")).toBe(false);
    expect(sw.isCacheable(mkRes({ "content-type": "application/javascript", "cache-control": "public, max-age=31536000, immutable" }), "static")).toBe(true);
  });

  it("detects legacy root-scope installs so they self-unregister", () => {
    expect(sw.isLegacyRootScope(`${O}/`)).toBe(true);
    expect(sw.isLegacyRootScope(`${O}/im-lite/`)).toBe(false);
  });

  it("is registered with scope '/im-lite/' and cleans up legacy root registrations", () => {
    const viewer = read("src/app/(public)/im-lite/[buildingId]/mobile-im-viewer.tsx");
    expect(viewer).toMatch(/register\("\/sw-im\.js", \{ scope: "\/im-lite\/" \}\)/);
    expect(viewer).not.toMatch(/register\("\/sw-im\.js"\)/);
    expect(viewer).toMatch(/getRegistrations\(\)/);
    expect(viewer).toMatch(/\.unregister\(\)/);
  });
});
