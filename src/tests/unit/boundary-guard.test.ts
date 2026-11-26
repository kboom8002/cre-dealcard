/**
 * @file src/tests/unit/boundary-guard.test.ts
 * @description 경계 정규화 가드 (quality-strategy §3-③) + Clean-Architecture 영구 경계 게이트 (Wave 3C).
 *
 * 1. PPTX 원시 건축물대장 키 직접 접근 금지:
 *    - STRICT: 대장 수신자(br/reg/register/buildingRegister…)에서 원시 키 직접 접근 금지.
 *    - BASELINE: 동일 키 이름 접근 횟수 스냅샷(신규 파일/증가 금지).
 * 2. Gate A (Zero Self-Imports):
 *    - `src/**\/*.{ts,tsx}` 전체에서 자기 자신을 import/export 하는 파일 0건 보장.
 * 3. Gate B (Domain Layer Isolation Ratchet):
 *    - B-1: `src/domain/**` (비테스트) 파일에서 `@/app/*`, `next/navigation`, `next/headers` import 0건.
 *    - B-2: `src/domain/**` (비테스트) 파일에서 런타임 `next/server` import 0건 (`import type` 만 허용).
 *    - B-3: `src/domain/**` (비테스트) 파일의 `createServiceClient` / `@/lib/supabase/service` 참조에
 *           하향 전용 래칫(<= 현재 파일 수 + 레거시 허용 목록 외 신규 파일 0건) 적용.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const SRC_DIR = path.resolve(__dirname, '..', '..');
const DOMAIN_DIR = path.resolve(SRC_DIR, 'domain');
const PPTX_DIR = path.resolve(DOMAIN_DIR, 'building', 'mobile-im', 'pptx');

const RAW_KEYS = [
  'grndFlrCnt',
  'ugrndFlrCnt',
  'bcrPct',
  'farPct',
  'groundFloors',
  'undergroundFloors',
  'approvalDate',
];

/** 대장 수신자로 쓰이는 변수명 (br = building register) */
const REGISTER_RECEIVERS = ['br', 'reg', 'register', 'buildingRegister', 'rawRegister', 'bldgRegister'];

/**
 * STRICT 허용 파일 (pptx/ 기준 상대경로). 새 파일을 추가하지 말 것 —
 * 대장 키 해석은 spec-resolver.ts 또는 향후 normalize 함수 한 곳에서만 한다.
 * DONE: spec-resolver.ts 의 raw 대장 키는 normalizeBuildingRegister 로 이관되어 이 목록은 비어 있다.
 */
const STRICT_ALLOWLIST = new Set<string>([]);

/**
 * BASELINE: 파일별 허용 횟수 (현재 부채 스냅샷). 줄이는 것은 자유, 늘리거나 새 파일을 추가하면 실패.
 * TODO(register agent): 각 항목이 대장 원시 키인지 감사 → 아니면(정규화 모델 필드) 이름 변경/예외 문서화, 맞으면 normalize 로 이관 후 삭제.
 */
const BASELINE: Record<string, number> = {
  // 2026-10-05 스냅샷 (대장 수신자가 아닌 정규화 모델/ssot/heroCard 필드 접근이 대부분 — 감사 필요)
  'archetypes/a04-asymmetric-7-5.ts': 2, // ssot.bcrPct / ssot.farPct
  'archetypes/a17-pre-completion-marketing.ts': 2, // input.data.bcrPct / farPct
  'binder/core-binders.ts': 8, // core.physical.bcrPct / farPct (im-core 정규화 모델)
  'spec-resolver.ts': 2, // h.bcrPct / h.farPct (heroCard 폴백 — resolver 내부)
  'summary-highlights.ts': 4, // f.farPct (자체 정규화 팩트 객체)
};

function listTs(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === '__tests__') continue;
      out.push(...listTs(p));
    } else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}

/** 주석 줄 제외한 코드 줄만 */
function codeLines(file: string): Array<{ n: number; text: string }> {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  let inBlock = false;
  const res: Array<{ n: number; text: string }> = [];
  lines.forEach((raw, i) => {
    let line = raw;
    if (inBlock) {
      const end = line.indexOf('*/');
      if (end < 0) return;
      line = line.slice(end + 2);
      inBlock = false;
    }
    // 한 줄 안의 /* ... */ 제거, 열린 블록 처리
    line = line.replace(/\/\*.*?\*\//g, '');
    const open = line.indexOf('/*');
    if (open >= 0) {
      line = line.slice(0, open);
      inBlock = true;
    }
    line = line.replace(/\/\/.*$/, '');
    if (line.trim()) res.push({ n: i + 1, text: line });
  });
  return res;
}

const keyAlt = RAW_KEYS.join('|');
const STRICT_RE = new RegExp(
  `\\b(?:${REGISTER_RECEIVERS.join('|')})\\??\\.(?:${keyAlt})\\b|\\b(?:${REGISTER_RECEIVERS.join('|')})\\??\\[\\s*['"](?:${keyAlt})['"]\\s*\\]`,
  'g',
);
const BROAD_RE = new RegExp(
  `\\b[A-Za-z_$][\\w$]*\\??\\.(?:${keyAlt})\\b|\\[\\s*['"](?:${keyAlt})['"]\\s*\\]`,
  'g',
);

interface Scan {
  strict: Array<{ file: string; n: number; text: string }>;
  broad: Record<string, number>;
}

export function scanPptxBoundary(): Scan {
  const strict: Scan['strict'] = [];
  const broad: Record<string, number> = {};
  for (const f of listTs(PPTX_DIR)) {
    const rel = path.relative(PPTX_DIR, f).replace(/\\/g, '/');
    for (const { n, text } of codeLines(f)) {
      if ((text.match(STRICT_RE) ?? []).length) strict.push({ file: rel, n, text: text.trim() });
      const b = (text.match(BROAD_RE) ?? []).length;
      if (b) broad[rel] = (broad[rel] ?? 0) + b;
    }
  }
  return { strict, broad };
}

// ─────────────────────────────────────────────────────────────────────────────
// Clean-Architecture AST Scanners (Wave 3C: Gate A & Gate B)
// ─────────────────────────────────────────────────────────────────────────────

function walkAllSrcTsFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.next') continue;
      walkAllSrcTsFiles(p, out);
    } else if (
      /\.(ts|tsx)$/.test(e.name) &&
      !e.name.endsWith('.d.ts') &&
      e.name !== 'supabase.generated.ts'
    ) {
      out.push(p);
    }
  }
  return out;
}

function isNonTestDomainFile(absFile: string): boolean {
  const rel = path.relative(DOMAIN_DIR, absFile).replace(/\\/g, '/');
  if (/(^|\/)(__tests__|tests?|__mocks__)\//.test(rel)) return false;
  if (/\.(test|spec)\.(ts|tsx)$/.test(rel)) return false;
  return true;
}

function resolveLocalImportCandidates(specifier: string, fromFile: string): string[] {
  let base: string | null = null;
  if (specifier.startsWith('@/')) {
    base = path.join(SRC_DIR, specifier.slice(2));
  } else if (specifier.startsWith('./') || specifier.startsWith('../') || specifier === '.') {
    base = path.resolve(path.dirname(fromFile), specifier);
  }
  if (!base) return [];
  return [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ];
}

interface ParsedModuleEdge {
  specifier: string;
  line: number;
  isTypeOnly: boolean;
  mentionsCreateServiceClient: boolean;
}

function extractModuleEdgesFromSource(absFile: string, src: string): ParsedModuleEdge[] {
  const sf = ts.createSourceFile(
    absFile,
    src,
    ts.ScriptTarget.Latest,
    false,
    absFile.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const lineOf = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const edges: ParsedModuleEdge[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const specifier = node.moduleSpecifier.text;
      const clause = node.importClause;
      let isTypeOnly = false;
      let mentionsCreateServiceClient = false;

      if (clause) {
        if (clause.isTypeOnly) {
          isTypeOnly = true;
        } else if (!clause.name && clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
          const elements = clause.namedBindings.elements;
          isTypeOnly = elements.length > 0 && elements.every((el) => el.isTypeOnly);
        }

        if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
          mentionsCreateServiceClient = clause.namedBindings.elements.some((el) => {
            const imported = el.propertyName ? el.propertyName.text : el.name.text;
            return (
              !el.isTypeOnly &&
              !clause.isTypeOnly &&
              (imported === 'createServiceClient' || imported === 'createTypedServiceClient')
            );
          });
        } else if (
          clause.namedBindings &&
          ts.isNamespaceImport(clause.namedBindings) &&
          !clause.isTypeOnly
        ) {
          mentionsCreateServiceClient = specifier === '@/lib/supabase/service';
        }
      }

      edges.push({
        specifier,
        line: lineOf(node),
        isTypeOnly,
        mentionsCreateServiceClient,
      });
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const specifier = node.moduleSpecifier.text;
      let isTypeOnly = Boolean(node.isTypeOnly);
      if (!isTypeOnly && node.exportClause && ts.isNamedExports(node.exportClause)) {
        const elements = node.exportClause.elements;
        isTypeOnly = elements.length > 0 && elements.every((el) => el.isTypeOnly);
      }
      edges.push({
        specifier,
        line: lineOf(node),
        isTypeOnly,
        mentionsCreateServiceClient: !isTypeOnly && specifier === '@/lib/supabase/service',
      });
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length >= 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      const specifier = node.arguments[0].text;
      edges.push({
        specifier,
        line: lineOf(node),
        isTypeOnly: false,
        mentionsCreateServiceClient: specifier === '@/lib/supabase/service',
      });
    }
    ts.forEachChild(node, visit);
  };

  visit(sf);
  return edges;
}

export function scanSelfImports(): Array<{ file: string; line: number; specifier: string }> {
  const hits: Array<{ file: string; line: number; specifier: string }> = [];
  for (const absFile of walkAllSrcTsFiles(SRC_DIR)) {
    const baseName = path.basename(absFile);
    const stem = baseName.replace(/\.(ts|tsx)$/, '');
    const src = fs.readFileSync(absFile, 'utf8');
    if (!src.includes('import') && !src.includes('export')) continue;
    // Zero-false-negative pre-filter: non-index file `foo.ts(x)` can only be targeted by a specifier containing `foo`.
    if (stem !== 'index' && !src.includes(stem)) continue;

    const normSelf = path.resolve(absFile).toLowerCase();
    for (const edge of extractModuleEdgesFromSource(absFile, src)) {
      const candidates = resolveLocalImportCandidates(edge.specifier, absFile);
      if (candidates.some((c) => path.resolve(c).toLowerCase() === normSelf)) {
        hits.push({
          file: path.relative(SRC_DIR, absFile).replace(/\\/g, '/'),
          line: edge.line,
          specifier: edge.specifier,
        });
      }
    }
  }
  return hits;
}

/**
 * Legacy allowlist for `src/domain/**` files coupled to `createServiceClient` (`@/lib/supabase/service`).
 * Strict downward-only ratchet: shrinking this list is encouraged; adding ANY new domain file fails CI.
 */
const DOMAIN_SERVICE_CLIENT_LEGACY_ALLOWLIST = new Set<string>([
  'analytics/admin-analytics.ts',
  'briefing/deal-briefing-generator.ts',
  'broker-card/broker-stats-aggregator.ts',
  'broker/home-aggregated.ts',
  'building/broker-deal-card.ts',
  'building/building-radar.ts',
  'building/im-core/read-building.ts',
  'building/im-core/version-resolver.ts',
  'building/mobile-im/fewshot-tracker.ts',
  'building/mobile-im/golden-im-manager.ts',
  'building/mobile-im/golden-lifecycle.ts',
  'building/mobile-im/im-context-builder.ts',
  'building/mobile-im/lease-adapter.ts',
  'building/mobile-im/telemetry.ts',
  'building/mobile-im/terminology-normalizer.ts',
  'building/mobile-im/workspace-ai-enhancer.ts',
  'building/mobile-im/writer.ts',
  'building/pptx-studio/studio-service.ts',
  'buyer/buyer-intent.ts',
  'buyer/buyer-memo.ts',
  'distribution/share-link-service.ts',
  'gate/gate-request.ts',
  'graph/deal-semantic-search.ts',
  'graph/im-semantic-search.ts',
  'graph/knowledge-graph.ts',
  'graph/property-network.ts',
  'handoff/handoff.ts',
  'identity/bind.ts',
  'identity/condition-engine.ts',
  'identity/party-service.ts',
  'lease/broker-lease-card.ts',
  'lease/tenant-intent.ts',
  'magazine/im-to-magazine-bridge.ts',
  'magazine/send-gate.ts',
  'market-report/market-report-generator.ts',
  'matching/auto-matcher.ts',
  'matching/lease-auto-matcher.ts',
  'matching/spec-matcher.ts',
  'matching/vacancy-signal-enricher.ts',
  'ontology/market-data-provider.ts',
  'owner/expert-note-request.ts',
  'owner/owner-readiness.ts',
  'pipeline/annual-batch.ts',
  'prediction/buyer-clustering.ts',
  'prediction/deal-conversion-predictor.ts',
  'prediction/deal-feature-extractor.ts',
  'prediction/funding-success-predictor.ts',
  'prediction/price-prediction.ts',
  'scheduling/booking-orchestrator.ts',
  'scheduling/kakao-webhook.ts',
  'team/circle-match-notifier.ts',
  'team/circle-matching-service.ts',
  'team/circle-notification-service.ts',
  'team/circle-service.ts',
  'team/circle-sharing-service.ts',
  'team/co-brokerage-service.ts',
]);

export const DOMAIN_SERVICE_CLIENT_MAX_COUNT = DOMAIN_SERVICE_CLIENT_LEGACY_ALLOWLIST.size;

export interface DomainBoundaryScan {
  appOrNextFrameworkViolations: Array<{ file: string; line: number; specifier: string }>;
  runtimeNextServerViolations: Array<{ file: string; line: number; specifier: string }>;
  serviceClientDomainFiles: string[];
}

export function scanDomainLayerBoundaries(): DomainBoundaryScan {
  const appOrNextFrameworkViolations: DomainBoundaryScan['appOrNextFrameworkViolations'] = [];
  const runtimeNextServerViolations: DomainBoundaryScan['runtimeNextServerViolations'] = [];
  const serviceClientFilesSet = new Set<string>();

  const appDirNorm = path.resolve(SRC_DIR, 'app').toLowerCase();
  const serviceFileNorm = path.resolve(SRC_DIR, 'lib', 'supabase', 'service.ts').toLowerCase();

  for (const absFile of walkAllSrcTsFiles(DOMAIN_DIR).filter(isNonTestDomainFile)) {
    const src = fs.readFileSync(absFile, 'utf8');
    if (!src.includes('import') && !src.includes('export')) continue;
    const relDomain = path.relative(DOMAIN_DIR, absFile).replace(/\\/g, '/');

    for (const edge of extractModuleEdgesFromSource(absFile, src)) {
      const spec = edge.specifier;
      const candidates = resolveLocalImportCandidates(spec, absFile);
      const resolvesIntoApp =
        spec === '@/app' ||
        spec.startsWith('@/app/') ||
        candidates.some((c) => {
          const norm = path.resolve(c).toLowerCase();
          return norm === appDirNorm || norm.startsWith(`${appDirNorm}${path.sep}`);
        });

      if (resolvesIntoApp || spec === 'next/navigation' || spec === 'next/headers') {
        appOrNextFrameworkViolations.push({ file: relDomain, line: edge.line, specifier: spec });
      }

      if ((spec === 'next/server' || spec.startsWith('next/server/')) && !edge.isTypeOnly) {
        runtimeNextServerViolations.push({ file: relDomain, line: edge.line, specifier: spec });
      }

      const resolvesToServiceModule =
        spec === '@/lib/supabase/service' ||
        candidates.some((c) => path.resolve(c).toLowerCase() === serviceFileNorm);

      if (!edge.isTypeOnly && (edge.mentionsCreateServiceClient || resolvesToServiceModule)) {
        serviceClientFilesSet.add(relDomain);
      }
    }
  }

  return {
    appOrNextFrameworkViolations,
    runtimeNextServerViolations,
    serviceClientDomainFiles: [...serviceClientFilesSet].sort(),
  };
}

describe('boundary-guard: pptx 렌더러의 원시 건축물대장 키 직접 접근 금지', () => {
  const scan = scanPptxBoundary();

  it('STRICT: 대장 수신자에서 원시 키(grndFlrCnt/ugrndFlrCnt/bcrPct/farPct/groundFloors/undergroundFloors/approvalDate)를 읽는 코드는 allowlist 파일에만', () => {
    const offenders = scan.strict.filter((o) => !STRICT_ALLOWLIST.has(o.file));
    expect(offenders.map((o) => `${o.file}:${o.n} ${o.text}`)).toEqual([]);
  });

  it('STRICT allowlist 에 더 이상 위반이 없는 항목이 있으면 경고 (register agent 가 이관 완료 시 항목 삭제)', () => {
    const used = new Set(scan.strict.map((o) => o.file));
    const stale = [...STRICT_ALLOWLIST].filter((f) => !used.has(f));
    if (stale.length) {
      console.warn(`[boundary-guard] 정리 가능한 STRICT allowlist 항목: ${stale.join(', ')}`);
    }
    expect(stale.every((item) => STRICT_ALLOWLIST.has(item))).toBe(true);
    expect([...used].every((item) => STRICT_ALLOWLIST.has(item))).toBe(true);
  });

  it('BASELINE: 동일 키 이름의 접근 횟수가 기록된 부채(파일별)를 넘지 않는다 — 신규 파일/증가 금지', () => {
    const regressions: string[] = [];
    for (const [file, count] of Object.entries(scan.broad)) {
      const allowed = BASELINE[file] ?? 0;
      if (count > allowed) regressions.push(`${file}: ${count}회 (허용 ${allowed})`);
    }
    expect(regressions).toEqual([]);
  });
});

describe('Clean-Architecture Gate A & Gate B (Wave 3C)', () => {
  const domainScan = scanDomainLayerBoundaries();

  it(
    'Gate A (Zero Self-Imports): 0 files in src/**/*.{ts,tsx} import or re-export themselves',
    () => {
      const selfImports = scanSelfImports();
      expect(selfImports.map((h) => `${h.file}:${h.line} -> ${h.specifier}`)).toEqual([]);
    },
    60_000,
  );

  it('Gate B-1 (Domain App/Next Isolation): 0 non-test files in src/domain/** import @/app/*, next/navigation, or next/headers', () => {
    expect(
      domainScan.appOrNextFrameworkViolations.map((v) => `${v.file}:${v.line} -> ${v.specifier}`),
    ).toEqual([]);
  });

  it('Gate B-2 (Domain Runtime next/server Isolation): 0 non-test files in src/domain/** import runtime next/server', () => {
    expect(
      domainScan.runtimeNextServerViolations.map((v) => `${v.file}:${v.line} -> ${v.specifier}`),
    ).toEqual([]);
  });

  it('Gate B-3 (Domain Service-Role Downward Ratchet): createServiceClient coupling in src/domain/** never exceeds baseline or spreads to new files', () => {
    const unauthorizedNewFiles = domainScan.serviceClientDomainFiles.filter(
      (f) => !DOMAIN_SERVICE_CLIENT_LEGACY_ALLOWLIST.has(f),
    );
    expect(unauthorizedNewFiles).toEqual([]);
    expect(domainScan.serviceClientDomainFiles.length).toBeLessThanOrEqual(
      DOMAIN_SERVICE_CLIENT_MAX_COUNT,
    );
  });
});

if (process.env.BOUNDARY_GUARD_PRINT === '1') {
  // eslint-disable-next-line no-console
  console.log('BASELINE =', JSON.stringify(scanPptxBoundary().broad, null, 2));
}
