/**
 * Wave 5 Track 5B — Static API Surface Zero-Trust Gate, Vercel Contract & CI Governance Suite
 *
 * Fast (<2s), deterministic repository-wide governance test suite scanning:
 *   - All `src/app/api/**\/route.ts` route handlers (254+ routes)
 *   - `src/proxy.ts` edge boundary header-stripping & dormant/experimental 404 gates
 *   - `vercel.json` cron routes & serverless `maxDuration` contracts
 *   - `supabase/migrations/*.sql` & `scripts/policy-scan.mjs` strict RLS invariants
 *   - `scripts/schema-drift-baseline.json` zero-drift contract
 *   - `.github/workflows/ci.yml` & `vitest.config.ts` ratchet & coverage hygiene
 */

import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import {
  DORMANT_PUBLIC_PREFIXES,
  EXPERIMENTAL_VERTICAL_PREFIXES,
  config as proxyConfig,
  isDormantPublicPath,
  isExperimentalVerticalPath,
  proxy,
} from "@/proxy";
import {
  NEW_FROM,
  STRICT_RLS_FROM,
  scanFile,
  stripComments as stripSqlComments,
} from "../../../scripts/policy-scan.mjs";

const REPO_ROOT = process.cwd();

function normalizeRelPath(absPath: string): string {
  return path.relative(REPO_ROOT, absPath).split(path.sep).join("/");
}

function collectRouteFiles(relDir: string): string[] {
  const absRoot = path.resolve(REPO_ROOT, relDir);
  if (!fs.existsSync(absRoot)) return [];
  const results: string[] = [];

  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name === "route.ts") {
        results.push(normalizeRelPath(full));
      }
    }
  };

  walk(absRoot);
  return results.sort();
}

function stripTsComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

function routeFileToApiPathname(relRoutePath: string): string {
  // e.g. src/app/api/broker/inbox/route.ts -> /api/broker/inbox
  return relRoutePath.replace(/^src\/app/, "").replace(/\/route\.ts$/, "");
}

function extractExportedHttpMethods(cleanSource: string): string[] {
  const methods = new Set<string>();
  const fnRe = /\bexport\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g;
  const constRe = /\bexport\s+const\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g;
  const namedRe = /\bexport\s*\{([^}]+)\}/g;

  for (const m of cleanSource.matchAll(fnRe)) {
    methods.add(m[1]);
  }
  for (const m of cleanSource.matchAll(constRe)) {
    methods.add(m[1]);
  }
  for (const m of cleanSource.matchAll(namedRe)) {
    for (const part of m[1].split(",")) {
      const tokens = part.trim().split(/\s+as\s+/);
      const exportedName = (tokens[1] ?? tokens[0] ?? "").trim();
      if (/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(exportedName)) {
        methods.add(exportedName);
      }
    }
  }
  return Array.from(methods).sort();
}

const DIRECT_ZERO_TRUST_GUARD_TOKENS = [
  "requireBroker",
  "requireBrokerContext",
  "requireAdmin",
  "withBrokerTenantContext",
  "verifyAuth",
  "verifyInterServiceRequest",
  "validateInterServiceRequest",
  "resolveBrokerId",
] as const;

const REQUIRE_ROLE_BROKER_OR_ADMIN_RE =
  /\brequireRole\s*\([^)]*\[\s*["'](?:broker|admin)["']/;

function hasRecognizedZeroTrustGuard(cleanSource: string): boolean {
  if (DIRECT_ZERO_TRUST_GUARD_TOKENS.some((tok) => new RegExp(`\\b${tok}\\s*\\(`).test(cleanSource))) {
    return true;
  }
  if (REQUIRE_ROLE_BROKER_OR_ADMIN_RE.test(cleanSource)) {
    return true;
  }
  // Session-bound server Supabase client paired with explicit auth.getUser() verification
  if (
    /\b(?:createServerSupabaseClient|createTypedServerSupabaseClient)\s*\(/.test(cleanSource) &&
    /\bauth\.getUser\s*\(/.test(cleanSource)
  ) {
    return true;
  }
  return false;
}

function resolveImportedModulePath(fromRelFile: string, specifier: string): string | null {
  let candidateBase: string;
  if (specifier.startsWith("@/")) {
    candidateBase = path.resolve(REPO_ROOT, "src", specifier.slice(2));
  } else if (specifier.startsWith(".")) {
    candidateBase = path.resolve(REPO_ROOT, path.dirname(fromRelFile), specifier);
  } else {
    return null;
  }

  const candidates = [
    candidateBase,
    `${candidateBase}.ts`,
    `${candidateBase}.tsx`,
    path.join(candidateBase, "index.ts"),
    path.join(candidateBase, "index.tsx"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) {
      return c;
    }
  }
  return null;
}

function delegatesToAuthenticatedHandler(relRouteFile: string, cleanSource: string): boolean {
  // Match `import { handleXxx ... } from '...'` where the route delegates HTTP execution to handleXxx
  const importRe = /import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g;
  for (const m of cleanSource.matchAll(importRe)) {
    const importedNames = m[1]
      .split(",")
      .map((s) => s.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop()?.trim() ?? "")
      .filter(Boolean);
    const specifier = m[2];
    const handlerNames = importedNames.filter((name) => /^handle[A-Z]/.test(name) || /^(GET|POST|PUT|PATCH|DELETE)$/.test(name));
    if (handlerNames.length === 0) continue;

    const invoked = handlerNames.some((fnName) => new RegExp(`\\b${fnName}\\s*\\(`).test(cleanSource));
    if (!invoked) continue;

    const targetAbs = resolveImportedModulePath(relRouteFile, specifier);
    if (!targetAbs) continue;
    const targetClean = stripTsComments(fs.readFileSync(targetAbs, "utf8"));
    if (hasRecognizedZeroTrustGuard(targetClean)) {
      return true;
    }
  }
  return false;
}

/**
 * Pure GET-only static asset redirect routes that carry zero DB/service/env access.
 */
const STATIC_PUBLIC_ASSET_REDIRECT_ALLOWLIST = new Set([
  "src/app/api/broker/excel-template/route.ts",
]);

function isVerifiedStaticPublicAssetRedirect(relRouteFile: string, cleanSource: string): boolean {
  if (!STATIC_PUBLIC_ASSET_REDIRECT_ALLOWLIST.has(relRouteFile)) return false;
  const methods = extractExportedHttpMethods(cleanSource);
  if (methods.length !== 1 || methods[0] !== "GET") return false;
  // Must never touch Supabase, filesystem, or environment secrets
  if (/supabase|createServiceClient|process\.env|node:fs|from\s+["']fs["']/.test(cleanSource)) {
    return false;
  }
  const redirectMatch = cleanSource.match(/NextResponse\.redirect\(\s*new\s+URL\(\s*["'](\/[^"']+)["']/);
  if (!redirectMatch) return false;
  const publicAssetAbs = path.resolve(REPO_ROOT, "public", redirectMatch[1].slice(1));
  return fs.existsSync(publicAssetAbs);
}

describe("Wave 5B — Static API Surface Zero-Trust Gate, Vercel Contract & CI Governance", () => {
  const allApiRoutes = collectRouteFiles("src/app/api");

  it("scans the complete repository API route tree (250+ route.ts handlers)", () => {
    expect(allApiRoutes.length).toBeGreaterThanOrEqual(250);
  });

  describe("1. 100% Cron Route Auth Gate (src/app/api/cron/**/route.ts)", () => {
    it("enforces verifyCronRequest() across 100% of cron route handlers with zero raw string comparisons", () => {
      const cronRoutes = collectRouteFiles("src/app/api/cron");
      expect(cronRoutes.length).toBeGreaterThanOrEqual(11);

      const violations: string[] = [];
      for (const relPath of cronRoutes) {
        const raw = fs.readFileSync(path.resolve(REPO_ROOT, relPath), "utf8");
        const clean = stripTsComments(raw);
        if (!/\bverifyCronRequest\s*\(/.test(clean)) {
          violations.push(`${relPath}: missing verifyCronRequest(...) invocation`);
        }
        if (/authHeader\s*!==/.test(clean)) {
          violations.push(`${relPath}: uses non-constant-time authHeader !== comparison`);
        }
      }

      expect(violations).toEqual([]);
    });
  });

  describe("2. 100% Admin Route Auth Gate (src/app/api/admin/**/route.ts)", () => {
    it("enforces requireAdmin or requireRole(req, ['admin']) across 100% of admin route handlers", () => {
      const adminRoutes = collectRouteFiles("src/app/api/admin");
      expect(adminRoutes.length).toBeGreaterThanOrEqual(16);

      const violations: string[] = [];
      for (const relPath of adminRoutes) {
        const raw = fs.readFileSync(path.resolve(REPO_ROOT, relPath), "utf8");
        const clean = stripTsComments(raw);

        const importsAuthGuard = /from\s+["']@\/lib\/auth-guard["']/.test(clean);
        const callsRequireAdmin = /\brequireAdmin\s*\(/.test(clean);
        const callsRequireRoleAdmin = /\brequireRole\s*\([^)]*\[\s*["']admin["']\s*\]/.test(clean);

        if (!importsAuthGuard || (!callsRequireAdmin && !callsRequireRoleAdmin)) {
          violations.push(
            `${relPath}: must import @/lib/auth-guard and enforce requireAdmin(...) or requireRole(..., ['admin'])`,
          );
        }
      }

      expect(violations).toEqual([]);
    });
  });

  describe("3. 100% Broker, Identity, Funding & Full-IM-Handoffs Zero-Trust Gate", () => {
    it("enforces recognized auth guards, verified handler delegation, or proxy 404 block across all 146+ sensitive routes", () => {
      const targetRoutes = [
        ...collectRouteFiles("src/app/api/broker"),
        ...collectRouteFiles("src/app/api/identity"),
        ...collectRouteFiles("src/app/api/funding"),
        ...collectRouteFiles("src/app/api/full-im-handoffs"),
      ];
      expect(targetRoutes.length).toBeGreaterThanOrEqual(145);

      const violations: string[] = [];

      for (const relPath of targetRoutes) {
        const raw = fs.readFileSync(path.resolve(REPO_ROOT, relPath), "utf8");
        const clean = stripTsComments(raw);
        const apiPath = routeFileToApiPathname(relPath);

        const hasDirectGuard = hasRecognizedZeroTrustGuard(clean);
        const hasDelegatedGuard = !hasDirectGuard && delegatesToAuthenticatedHandler(relPath, clean);
        const isDormantBlockedInProxy = isDormantPublicPath(apiPath);
        const isStaticAssetRedirect =
          !hasDirectGuard &&
          !hasDelegatedGuard &&
          isVerifiedStaticPublicAssetRedirect(relPath, clean);

        if (!hasDirectGuard && !hasDelegatedGuard && !isDormantBlockedInProxy && !isStaticAssetRedirect) {
          violations.push(`${relPath} (${apiPath}): missing zero-trust auth guard`);
        }

        // Defense-in-depth: even experimental vertical routes blocked 404 by default in proxy.ts
        // (/api/funding/*, /api/broker/circles/*, /api/broker/schedule/*) MUST also enforce real
        // handler-level auth when CRE_ENABLE_EXPERIMENTAL_VERTICALS=1.
        if (isExperimentalVerticalPath(apiPath) && !hasDirectGuard && !hasDelegatedGuard) {
          violations.push(
            `${relPath} (${apiPath}): experimental vertical route lacks handler-level auth guard when enabled`,
          );
        }
      }

      expect(violations).toEqual([]);
      expect(DORMANT_PUBLIC_PREFIXES).toContain("/api/agora");
      expect(DORMANT_PUBLIC_PREFIXES).toContain("/api/vendor");
      expect(DORMANT_PUBLIC_PREFIXES).toContain("/api/public/building-radar");
      expect(EXPERIMENTAL_VERTICAL_PREFIXES).toContain("/api/funding");
      expect(EXPERIMENTAL_VERTICAL_PREFIXES).toContain("/api/broker/circles");
      expect(EXPERIMENTAL_VERTICAL_PREFIXES).toContain("/api/broker/schedule");
      expect(EXPERIMENTAL_VERTICAL_PREFIXES).toContain("/api/onboarding");
    });
  });

  describe("4. Public Unauthenticated Write Guard & Edge Proxy Spoofed-Header Stripping", () => {
    it("prohibits POST/PUT/PATCH/DELETE exports on /api/public/transactions and strips internal headers across /api/*", async () => {
      const txRelPath = "src/app/api/public/transactions/route.ts";
      const txClean = stripTsComments(
        fs.readFileSync(path.resolve(REPO_ROOT, txRelPath), "utf8"),
      );
      const exportedMethods = extractExportedHttpMethods(txClean);
      expect(exportedMethods).toEqual(["GET"]);
      expect(exportedMethods).not.toContain("POST");
      expect(txClean).not.toMatch(/\bexport\s+.*\b(POST|PUT|PATCH|DELETE)\b/);

      // Static & behavioral verification of src/proxy.ts header stripping across /api/*
      const proxySrc = stripTsComments(
        fs.readFileSync(path.resolve(REPO_ROOT, "src/proxy.ts"), "utf8"),
      );
      for (const forbiddenHeader of [
        "x-cre-proxy-secret",
        "x-cre-verified-user",
        "x-qa-gate-verified",
      ]) {
        expect(proxySrc).toContain(`request.headers.delete('${forbiddenHeader}')`);
        expect(proxySrc).toContain(`requestHeaders.delete('${forbiddenHeader}')`);
      }
      expect(proxyConfig.matcher).toEqual([
        "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
      ]);

      const spoofedReq = new NextRequest("https://www.credeal.net/api/public/transactions", {
        headers: {
          "x-cre-proxy-secret": "attacker-forged-secret",
          "x-cre-verified-user": "%7B%22id%22%3A%22admin%22%7D",
          "x-qa-gate-verified": "1",
          "x-request-id": "req-wave5b-check",
        },
      });
      const res = await proxy(spoofedReq);
      expect(res.status).toBe(200);
      expect(spoofedReq.headers.get("x-cre-proxy-secret")).toBeNull();
      expect(spoofedReq.headers.get("x-cre-verified-user")).toBeNull();
      expect(spoofedReq.headers.get("x-qa-gate-verified")).toBeNull();
      expect(res.headers.get("x-middleware-request-x-cre-proxy-secret")).toBeNull();
      expect(res.headers.get("x-middleware-request-x-cre-verified-user")).toBeNull();
      expect(res.headers.get("x-middleware-request-x-qa-gate-verified")).toBeNull();
      expect(res.headers.get("x-middleware-request-x-request-id")).toBe("req-wave5b-check");
    });
  });

  describe("5. Vercel Cron & Function Timeout Contract (vercel.json)", () => {
    it("maps every crons[].path to an existing GET route with verifyCronRequest and bounds functions[*].maxDuration to 10..300", () => {
      const vercelJson = JSON.parse(
        fs.readFileSync(path.resolve(REPO_ROOT, "vercel.json"), "utf8"),
      ) as {
        functions: Record<string, { maxDuration?: unknown }>;
        crons: Array<{ path: string; schedule: string }>;
      };

      expect(vercelJson.crons.length).toBeGreaterThanOrEqual(12);
      for (const cronEntry of vercelJson.crons) {
        expect(cronEntry.path.startsWith("/api/")).toBe(true);
        expect(cronEntry.schedule.trim().split(/\s+/)).toHaveLength(5);

        const relRoute = `src/app${cronEntry.path}/route.ts`;
        const absRoute = path.resolve(REPO_ROOT, relRoute);
        expect(fs.existsSync(absRoute), `Missing route for cron ${cronEntry.path}: ${relRoute}`).toBe(
          true,
        );

        const clean = stripTsComments(fs.readFileSync(absRoute, "utf8"));
        const methods = extractExportedHttpMethods(clean);
        expect(methods, `${relRoute} must export GET for Vercel Cron`).toContain("GET");
        expect(
          /\bverifyCronRequest\s*\(/.test(clean),
          `${relRoute} scheduled in vercel.json crons must enforce verifyCronRequest`,
        ).toBe(true);
      }

      const fnEntries = Object.entries(vercelJson.functions);
      expect(fnEntries.length).toBeGreaterThanOrEqual(20);
      for (const [fnPattern, fnCfg] of fnEntries) {
        const absFnPath = path.resolve(REPO_ROOT, fnPattern);
        expect(fs.existsSync(absFnPath), `vercel.json function file missing: ${fnPattern}`).toBe(
          true,
        );
        expect(typeof fnCfg.maxDuration).toBe("number");
        const dur = fnCfg.maxDuration as number;
        expect(Number.isInteger(dur), `${fnPattern} maxDuration must be an integer`).toBe(true);
        expect(dur, `${fnPattern} maxDuration (${dur}) must be >= 10`).toBeGreaterThanOrEqual(10);
        expect(dur, `${fnPattern} maxDuration (${dur}) must be <= 300`).toBeLessThanOrEqual(300);
      }
    });
  });

  describe("6. Zero Schema Drift Baseline & Strict RLS Policy Gate", () => {
    it("maintains total === 0 and magazineTotal === 0 in scripts/schema-drift-baseline.json", () => {
      const baseline = JSON.parse(
        fs.readFileSync(path.resolve(REPO_ROOT, "scripts/schema-drift-baseline.json"), "utf8"),
      ) as {
        total: number;
        magazineTotal: number;
        counts: Record<string, number>;
      };

      expect(baseline.total).toBe(0);
      expect(baseline.magazineTotal).toBe(0);
      expect(Object.keys(baseline.counts)).toHaveLength(0);
    });

    it("passes scripts/policy-scan.mjs with 0 ERRORs and enforces ENABLE ROW LEVEL SECURITY on every CREATE TABLE >= 20261126000001", () => {
      const migrationsDir = path.resolve(REPO_ROOT, "supabase/migrations");
      const allSqlFiles = fs
        .readdirSync(migrationsDir)
        .filter((f) => f.endsWith(".sql") && /^\d{14}_/.test(f))
        .sort();

      const newMigrations = allSqlFiles.filter((f) => f.slice(0, 14) >= NEW_FROM);
      expect(newMigrations.length).toBeGreaterThanOrEqual(40);

      const findings = newMigrations.flatMap((file) =>
        scanFile(file) as Array<{
          file: string;
          policy: string;
          table: string;
          cmd: string;
          level: string;
          reason: string;
        }>,
      );
      const errors = findings.filter((f) => f.level === "ERROR");
      expect(errors).toEqual([]);

      const strictMigrations = allSqlFiles.filter((f) => f.slice(0, 14) >= STRICT_RLS_FROM);
      expect(strictMigrations.length).toBeGreaterThanOrEqual(4);

      const missingRlsTables: string[] = [];
      const createTableRe =
        /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?(?:"?public"?\.)?"?([a-zA-Z_][\w]*)"?\s*(?:\(|partition\s+by\b)/gi;

      for (const file of strictMigrations) {
        const rawSql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
        const cleanSql = stripSqlComments(rawSql) as string;
        let match: RegExpExecArray | null;
        createTableRe.lastIndex = 0;
        while ((match = createTableRe.exec(cleanSql)) !== null) {
          const tableName = match[1].toLowerCase();
          const escaped = tableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const enableRlsRe = new RegExp(
            `\\balter\\s+table\\s+(?:if\\s+exists\\s+)?(?:only\\s+)?(?:"?public"?\\.)?"?${escaped}"?\\s+enable\\s+row\\s+level\\s+security\\b`,
            "i",
          );
          if (!enableRlsRe.test(cleanSql)) {
            missingRlsTables.push(`${file} -> ${tableName}`);
          }
        }
      }

      expect(missingRlsTables).toEqual([]);
    });
  });

  describe("7. CI Ratchet, Policy Scan, Dual Typecheck & Vitest Coverage Hygiene", () => {
    it("locks tightened ESLint ratchet, policy-scan, tsconfig.test.json typecheck, and wave0c PGlite gate in .github/workflows/ci.yml", () => {
      const ciYaml = fs.readFileSync(
        path.resolve(REPO_ROOT, ".github/workflows/ci.yml"),
        "utf8",
      );

      const ratchetMatch = ciYaml.match(/if\(errs\s*>\s*(\d+)\)/);
      expect(ratchetMatch).not.toBeNull();
      const ceiling = Number(ratchetMatch![1]);
      expect(ceiling).toBeLessThanOrEqual(3450);
      expect(ceiling).toBeGreaterThan(0);

      expect(ciYaml).toContain("node scripts/policy-scan.mjs");
      expect(ciYaml).toContain("npx tsc --noEmit");
      expect(ciYaml).toContain("npx tsc --noEmit -p tsconfig.test.json");
      expect(ciYaml).toContain("src/tests/security/wave0c-rls-rpc-lockdown.pglite.test.ts");
    });

    it("includes src/proxy.ts and src/ai/** in vitest.config.ts coverage and excludes *.test.{ts,tsx} and src/types/**", () => {
      const vitestCfg = fs.readFileSync(path.resolve(REPO_ROOT, "vitest.config.ts"), "utf8");
      expect(vitestCfg).toContain('"src/proxy.ts"');
      expect(vitestCfg).toContain('"src/ai/**"');
      expect(vitestCfg).toContain('"src/**/*.test.{ts,tsx}"');
      expect(vitestCfg).toContain('"src/types/**"');
    });
  });
});
