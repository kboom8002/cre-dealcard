/**
 * scripts/check-schema-drift.ts — 코드↔운영 스키마 드리프트 체커 (F-01)
 *
 * `src/**` (테스트·자동생성 타입 제외)의 Supabase 체인 참조를 TypeScript compiler API 로 추출해
 * `supabase/schema-snapshot.json` (운영 OpenAPI 스냅샷)과 대조한다.
 *   - `.from('t')` + `.select('a,b')` / `.insert({..})` / `.update({..})` / `.upsert(.., {onConflict})`
 *     / `.eq|neq|gt|gte|lt|lte|like|ilike|is|in|contains|order|not|filter|match('c')` / `.or('c.eq.x,..')`
 *   - `.rpc('fn')`
 *   - 동일 파일 및 로컬 import(`@/...`, `./...`, `../...`) 문자열 상수(`DISPATCH_LEDGER_TABLE` 등) 정적 해석
 *   - 임베디드 조인 관계 필터(`.eq('foreign_table.col', ...)`) 베이스 테이블 오탐 제거 및 외래 테이블 검증
 * 검출 종류: TABLE-MISSING(테이블 없음) · COL-MISSING(컬럼 없음) · RPC-MISSING(함수 없음)
 *
 * 미적용 마이그레이션 오버레이: `supabase/migrations/` 의 아직 운영에 적용되지 않은 파일(20261004000001 이상,
 * 스냅샷 `appliedMigrations` 에 없는 것)의 create table / add column / create function 을 파싱해 "적용 예정 스키마"로 취급한다.
 * (코드가 마이그레이션을 전제로 작성돼도 적용 전 CI 가 깨지지 않게 하기 위함. `--no-overlay` 로 끌 수 있다.)
 *
 * 판정: baseline(`scripts/schema-drift-baseline.json`, 위반 키별 건수 — 줄번호 제외) 대비 **증가분**이 있으면 exit 1.
 *       매거진 경로(파일 경로에 magazine 포함 · magazine_* 테이블 · im-to-magazine) 신규 위반도 같은 규칙으로 별도 표기.
 *       `--strict-magazine` 은 매거진 위반이 0건이어야 통과(목표: 매거진 baseline 0).
 *
 * 사용:
 *   npx tsx scripts/check-schema-drift.ts                         # 검사 (CI)
 *   npx tsx scripts/check-schema-drift.ts --update-baseline        # baseline 재기록(위반이 줄었을 때만 사용)
 *   npx tsx scripts/check-schema-drift.ts --write-magazine-report  # db-snapshots/magazine_drift_current.md 갱신
 *   npx tsx scripts/check-schema-drift.ts --strict-magazine --no-overlay
 * 종료코드: 0 PASS · 1 FAIL(증가분) · 2 환경 오류
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export type Kind = 'TABLE-MISSING' | 'COL-MISSING' | 'RPC-MISSING';
export interface Ref {
  file: string;
  line: number;
  table: string | null;
  col: string | null;
  op: string;
  note?: string;
  isForeignFilter?: boolean;
}
export interface Violation extends Ref { kind: Kind }
interface SnapshotJson {
  generatedAt: string;
  appliedMigrations?: string[];
  tables: Record<string, { columns: Record<string, string> }>;
  rpcs: Record<string, string[]>;
}
/** columns === null → 컬럼 목록 미상(뷰 등): 컬럼 검사 생략 */
export interface Schema { tables: Map<string, Set<string> | null>; rpcs: Set<string> }

const ROOT = process.cwd();
const SNAPSHOT_PATH = path.join(ROOT, 'supabase', 'schema-snapshot.json');
const BASELINE_PATH = path.join(ROOT, 'scripts', 'schema-drift-baseline.json');
const MIGRATIONS_DIR = path.join(ROOT, 'supabase', 'migrations');
const MAG_REPORT_PATH = path.join(ROOT, 'docs', 'magazine', 'audit-2026-10-04', 'db-snapshots', 'magazine_drift_current.md');
const PENDING_FROM = '20261004000001';

const args = new Set(process.argv.slice(2));
const UPDATE_BASELINE = args.has('--update-baseline');
const STRICT_MAGAZINE = args.has('--strict-magazine');
const WRITE_REPORT = args.has('--write-magazine-report');
const NO_OVERLAY = args.has('--no-overlay');
const AS_JSON = args.has('--json');
const VERBOSE = args.has('--verbose');

// ── 1. 스키마 로드 ────────────────────────────────────────────────────────────
export function loadSnapshot(): { schema: Schema; snap: SnapshotJson } {
  if (!fs.existsSync(SNAPSHOT_PATH)) {
    console.error(`ERROR: ${path.relative(ROOT, SNAPSHOT_PATH)} 가 없습니다. 먼저 scripts/schema-snapshot.ts 를 실행하세요.`);
    process.exit(2);
  }
  const snap = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8')) as SnapshotJson;
  const tables = new Map<string, Set<string> | null>();
  for (const [t, def] of Object.entries(snap.tables)) tables.set(t, new Set(Object.keys(def.columns)));
  return { schema: { tables, rpcs: new Set(Object.keys(snap.rpcs)) }, snap };
}

// ── 2. 미적용 마이그레이션 오버레이 (정규식 기반 미니 파서) ───────────────────
function stripSqlComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
}
function matchParen(s: string, openIdx: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = openIdx; i < s.length; i++) {
    const ch = s[i];
    if (quote) { if (ch === quote) quote = null; continue; }
    if (ch === "'" || ch === '"') { quote = ch; continue; }
    if (ch === '(') depth++;
    else if (ch === ')') { depth--; if (depth === 0) return i; }
  }
  return -1;
}
function splitTopLevel(body: string): string[] {
  const out: string[] = [];
  let depth = 0; let quote: string | null = null; let cur = '';
  for (const ch of body) {
    if (quote) { cur += ch; if (ch === quote) quote = null; continue; }
    if (ch === "'" || ch === '"') { quote = ch; cur += ch; continue; }
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}
function splitSqlStatementsOutsideDollarQuotes(sql: string): string[] {
  const stmts: string[] = [];
  let cur = '';
  let quote: string | null = null;
  let dollarTag: string | null = null;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (dollarTag) {
      if (sql.startsWith(dollarTag, i)) {
        cur += dollarTag;
        i += dollarTag.length - 1;
        dollarTag = null;
        continue;
      }
      cur += ch;
      continue;
    }
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === '$') {
      const m = /^\$([a-zA-Z0-9_]*)\$/.exec(sql.slice(i));
      if (m) {
        dollarTag = m[0];
        cur += dollarTag;
        i += dollarTag.length - 1;
        continue;
      }
    }
    if (ch === ';') {
      if (cur.trim()) stmts.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) stmts.push(cur);
  return stmts;
}
const IDENT = /^"?([a-z_][a-z0-9_]*)"?$/i;
export function applyMigrationSql(sqlRaw: string, schema: Schema): void {
  const sql = stripSqlComments(sqlRaw);
  // create table
  const ct = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = ct.exec(sql))) {
    const open = m.index + m[0].length - 1;
    const close = matchParen(sql, open);
    if (close < 0) continue;
    const cols = schema.tables.get(m[1]) ?? new Set<string>();
    for (const item of splitTopLevel(sql.slice(open + 1, close))) {
      const first = item.trim().split(/\s+/)[0] ?? '';
      if (/^(constraint|primary|unique|check|foreign|like|exclude)$/i.test(first)) continue;
      const idm = IDENT.exec(first);
      if (idm) cols.add(idm[1]);
    }
    schema.tables.set(m[1], cols);
  }
  // alter table ... add column (dollar-quote safe statement splitting)
  for (const stmt of splitSqlStatementsOutsideDollarQuotes(sql)) {
    const am = /alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/i.exec(stmt);
    if (!am) continue;
    const re = /add\s+column\s+(?:if\s+not\s+exists\s+)?"?([a-z_][a-z0-9_]*)"?/gi;
    let c: RegExpExecArray | null;
    while ((c = re.exec(stmt))) {
      const existing = schema.tables.get(am[1]);
      if (existing === null) continue;
      (existing ?? schema.tables.set(am[1], new Set<string>()).get(am[1])!).add(c[1]);
    }
  }
  // create view → 컬럼 목록 미상
  const cv = /create\s+(?:or\s+replace\s+)?view\s+(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi;
  while ((m = cv.exec(sql))) if (!schema.tables.has(m[1])) schema.tables.set(m[1], null);
  // create function → rpc
  const cf = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s*\(/gi;
  while ((m = cf.exec(sql))) schema.rpcs.add(m[1]);
}
export function pendingMigrations(applied: string[]): string[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{14}_.*\.sql$/.test(f))
    .filter((f) => f.slice(0, 14) >= PENDING_FROM && !applied.includes(f.slice(0, 14)))
    .sort();
}
export function cloneSchema(s: Schema): Schema {
  return {
    tables: new Map([...s.tables].map(([k, v]) => [k, v === null ? null : new Set(v)] as [string, Set<string> | null])),
    rpcs: new Set(s.rpcs),
  };
}

// ── 3. 소스 참조 추출 (TypeScript compiler API + 모듈 상수 해석) ──────────────
function walk(dir: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!/^(node_modules|\.next)$/.test(e.name)) walk(p, acc);
    } else if (/\.(ts|tsx)$/.test(e.name) && !/\.d\.ts$/.test(e.name) && e.name !== 'supabase.generated.ts') {
      acc.push(p);
    }
  }
  return acc;
}
function isTestFile(rel: string): boolean {
  return /(^|\/)(tests?|__tests__|__mocks__)\//.test(rel) || /\.(test|spec)\.tsx?$/.test(rel);
}
const COL_METHODS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in', 'contains', 'containedBy', 'order', 'not', 'filter', 'textSearch', 'overlaps', 'rangeGt', 'rangeLt']);
const WRITE = new Set(['insert', 'update', 'upsert']);
const COL_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

const sfCache = new Map<string, ts.SourceFile | null>();

function loadSourceFileCached(absPath: string): ts.SourceFile | null {
  const norm = path.resolve(absPath);
  if (sfCache.has(norm)) return sfCache.get(norm)!;
  if (!fs.existsSync(norm) || !fs.statSync(norm).isFile()) {
    sfCache.set(norm, null);
    return null;
  }
  const src = fs.readFileSync(norm, 'utf8');
  const sf = ts.createSourceFile(
    norm,
    src,
    ts.ScriptTarget.Latest,
    true,
    norm.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  sfCache.set(norm, sf);
  return sf;
}

function resolveLocalModulePath(specifier: string, fromFilePath: string): string | null {
  let base: string | null = null;
  if (specifier.startsWith('@/')) {
    base = path.join(ROOT, 'src', specifier.slice(2));
  } else if (specifier.startsWith('./') || specifier.startsWith('../')) {
    base = path.resolve(path.dirname(fromFilePath), specifier);
  } else {
    return null;
  }

  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return path.resolve(c);
  }
  return null;
}

function unwrapExpr(n: ts.Node): ts.Node {
  let cur = n;
  while (
    ts.isParenthesizedExpression(cur) ||
    ts.isAsExpression(cur) ||
    ts.isSatisfiesExpression(cur) ||
    ts.isTypeAssertionExpression(cur) ||
    ts.isNonNullExpression(cur)
  ) {
    cur = cur.expression;
  }
  return cur;
}

function findConstInitializerInFile(sf: ts.SourceFile, identName: string, requireExport = false): ts.Expression | null {
  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    const isExported = Boolean(stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword));
    if (requireExport && !isExported) continue;
    const isConst = Boolean(stmt.declarationList.flags & ts.NodeFlags.Const);
    if (!isConst) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && decl.name.text === identName && decl.initializer) {
        return decl.initializer;
      }
    }
  }
  if (!requireExport) {
    let found: ts.Expression | null = null;
    const visit = (node: ts.Node): void => {
      if (found) return;
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.name.text === identName &&
        node.initializer &&
        node.parent &&
        ts.isVariableDeclarationList(node.parent) &&
        Boolean(node.parent.flags & ts.NodeFlags.Const)
      ) {
        found = node.initializer;
        return;
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    return found;
  }
  return null;
}

function resolveExportedConstString(targetFile: string, exportName: string, depth: number): string | null {
  if (depth > 6) return null;
  const targetSf = loadSourceFileCached(targetFile);
  if (!targetSf) return null;

  const directInit = findConstInitializerInFile(targetSf, exportName, true);
  if (directInit) {
    return strOf(directInit, targetSf, targetFile, depth + 1);
  }

  // Follow re-exports: `export { X } from './foo'` or `export * from './foo'`
  for (const stmt of targetSf.statements) {
    if (!ts.isExportDeclaration(stmt) || !stmt.moduleSpecifier || !ts.isStringLiteral(stmt.moduleSpecifier)) continue;
    const nextFile = resolveLocalModulePath(stmt.moduleSpecifier.text, targetFile);
    if (!nextFile) continue;

    if (!stmt.exportClause) {
      const val = resolveExportedConstString(nextFile, exportName, depth + 1);
      if (val != null) return val;
    } else if (ts.isNamedExports(stmt.exportClause)) {
      for (const el of stmt.exportClause.elements) {
        if (el.name.text === exportName) {
          const orig = el.propertyName ? el.propertyName.text : el.name.text;
          return resolveExportedConstString(nextFile, orig, depth + 1);
        }
      }
    }
  }
  return null;
}

export function strOf(
  rawNode: ts.Node | undefined,
  sf?: ts.SourceFile,
  filePath?: string,
  depth = 0,
): string | null {
  if (!rawNode || depth > 6) return null;
  const n = unwrapExpr(rawNode);

  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;

  if (ts.isTemplateExpression(n)) {
    let out = n.head.text;
    for (const span of n.templateSpans) {
      const sub = strOf(span.expression, sf, filePath, depth + 1);
      out += (sub != null ? sub : '${}') + span.literal.text;
    }
    return out;
  }

  if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const l = strOf(n.left, sf, filePath, depth + 1);
    const r = strOf(n.right, sf, filePath, depth + 1);
    if (l != null && r != null) return l + r;
    return null;
  }

  // Support `['col_a', 'col_b'].join(', ')`
  if (
    ts.isCallExpression(n) &&
    ts.isPropertyAccessExpression(n.expression) &&
    n.expression.name.text === 'join'
  ) {
    const recv = unwrapExpr(n.expression.expression);
    if (ts.isArrayLiteralExpression(recv)) {
      const sep = n.arguments.length > 0 ? strOf(n.arguments[0], sf, filePath, depth + 1) : ',';
      if (sep == null) return null;
      const items: string[] = [];
      for (const el of recv.elements) {
        const s = strOf(el, sf, filePath, depth + 1);
        if (s == null) return null;
        items.push(s);
      }
      return items.join(sep);
    }
  }

  if (ts.isIdentifier(n) && sf) {
    const localInit = findConstInitializerInFile(sf, n.text, false);
    if (localInit) {
      return strOf(localInit, sf, filePath, depth + 1);
    }
    if (filePath) {
      for (const stmt of sf.statements) {
        if (!ts.isImportDeclaration(stmt) || !stmt.importClause || !ts.isStringLiteral(stmt.moduleSpecifier)) continue;
        const bindings = stmt.importClause.namedBindings;
        if (bindings && ts.isNamedImports(bindings)) {
          for (const el of bindings.elements) {
            if (el.name.text === n.text) {
              const targetFile = resolveLocalModulePath(stmt.moduleSpecifier.text, filePath);
              if (!targetFile) return null;
              const exportedName = el.propertyName ? el.propertyName.text : el.name.text;
              return resolveExportedConstString(targetFile, exportedName, depth + 1);
            }
          }
        }
      }
    }
  }

  return null;
}

function parseSelect(s: string): { cols: string[]; relAliases: Map<string, string> } {
  const parts: Array<{ raw: string; rel: boolean }> = [];
  let depth = 0; let cur = '';
  for (const ch of s) {
    if (ch === '(') { depth++; if (depth === 1) { parts.push({ raw: cur.trim(), rel: true }); cur = ''; continue; } }
    if (ch === ')') { depth--; continue; }
    if (depth > 0) continue;
    if (ch === ',') { if (cur.trim()) parts.push({ raw: cur.trim(), rel: false }); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) parts.push({ raw: cur.trim(), rel: false });

  const out: string[] = [];
  const relAliases = new Map<string, string>();

  for (const c of parts) {
    if (c.rel) {
      // e.g. `broker_profiles!inner`, `building:building_id!inner`, `party!inner`
      const cleaned = c.raw.replace(/\s+/g, '');
      const noHint = cleaned.split('!')[0] ?? '';
      if (noHint.includes(':')) {
        const [alias, target] = noHint.split(':');
        if (alias && target) relAliases.set(alias, target);
      } else if (noHint) {
        relAliases.set(noHint, noHint);
      }
      continue; // 임베디드 관계는 베이스 테이블 컬럼이 아님
    }
    let r = c.raw.replace(/\s+/g, '');
    if (!r) continue;
    r = r.split('::')[0];
    if (r.includes(':')) r = r.split(':').pop() as string;
    r = r.split('->')[0];
    if (r.includes('!')) continue; // 관계 힌트
    if (r === '*' || /^count/.test(r)) continue;
    if (COL_RE.test(r)) out.push(r);
  }
  return { cols: out, relAliases };
}

function objKeys(n: ts.Node | undefined, sf: ts.SourceFile, filePath?: string): string[] | null {
  if (!n) return null;
  if (ts.isArrayLiteralExpression(n)) {
    const ks = new Set<string>(); let ok = false;
    for (const e of n.elements) { const k = objKeys(e, sf, filePath); if (k) { ok = true; k.forEach((x) => ks.add(x)); } }
    return ok ? [...ks] : null;
  }
  if (ts.isObjectLiteralExpression(n)) {
    const ks: string[] = [];
    for (const p of n.properties) {
      if ((ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) && p.name) {
        const nm = ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : p.name.getText(sf).replace(/['"]/g, '');
        ks.push(nm);
      } else if (ts.isSpreadAssignment(p)) ks.push('...');
    }
    return ks;
  }
  if (ts.isIdentifier(n)) {
    let found: ts.Expression | null = null;
    const visit = (x: ts.Node): void => {
      if (found) return;
      if (ts.isVariableDeclaration(x) && x.name.getText(sf) === n.text && x.initializer) { found = x.initializer; return; }
      ts.forEachChild(x, visit);
    };
    visit(sf);
    if (found) {
      const init = unwrapExpr(found);
      const k = objKeys(init, sf, filePath);
      if (k) {
        const extra: string[] = [];
        const v2 = (x: ts.Node): void => {
          if (ts.isBinaryExpression(x) && x.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
            if (ts.isPropertyAccessExpression(x.left) && x.left.expression.getText(sf) === n.text) extra.push(x.left.name.text);
            else if (ts.isElementAccessExpression(x.left) && x.left.expression.getText(sf) === n.text) {
              const s = strOf(x.left.argumentExpression, sf, filePath);
              if (s) extra.push(s);
            }
          }
          ts.forEachChild(x, v2);
        };
        v2(sf);
        return [...k, ...extra];
      }
    }
  }
  return null;
}

function parseOr(s: string): string[] {
  const cols: string[] = [];
  const re = /(?:^|[,(])\s*([a-zA-Z_][a-zA-Z0-9_]*)(?:->>?[a-zA-Z0-9_']+)*\.(eq|neq|gt|gte|lt|lte|like|ilike|is|in|cs|cd|ov|fts|not)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) if (!['and', 'or', 'not'].includes(m[1])) cols.push(m[1]);
  return cols;
}

export function extractRefs(rootDir = path.join(ROOT, 'src')): { refs: Ref[]; files: number; unresolved: number } {
  const refs: Ref[] = [];
  let unresolved = 0;
  const all = walk(rootDir);
  let scanned = 0;
  for (const f of all) {
    const rel = path.relative(ROOT, f).replace(/\\/g, '/');
    if (isTestFile(rel)) continue;
    const src = fs.readFileSync(f, 'utf8');
    if (!src.includes('.from(') && !src.includes('.rpc(')) continue;
    scanned++;
    const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    sfCache.set(path.resolve(f), sf);
    const lineOf = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;
    const visit = (n: ts.Node): void => {
      if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
        const m = n.expression.name.text;
        if (m === 'rpc') {
          const fn = strOf(n.arguments[0], sf, f);
          if (fn && COL_RE.test(fn)) refs.push({ file: rel, line: lineOf(n), table: null, col: fn, op: 'rpc' });
          else unresolved++;
        }
        if (m === 'from' && n.arguments.length === 1) {
          const objTxt = n.expression.expression.getText(sf);
          if (/storage/.test(objTxt) || /^(Array|Buffer|Object|Uint8Array|Set|Map|Observable)$/.test(objTxt)) { ts.forEachChild(n, visit); return; }
          const table = strOf(n.arguments[0], sf, f);
          if (!table || !COL_RE.test(table)) { unresolved++; ts.forEachChild(n, visit); return; }
          const push = (op: string, col: string | null, line: number, note?: string, overrideTable?: string, isForeignFilter?: boolean) =>
            refs.push({ file: rel, line, table: overrideTable ?? table, col, op, note, isForeignFilter });
          push('from', null, lineOf(n));
          const chainRelAliases = new Map<string, string>();

          let cur: ts.Node = n;
          // Walk through chained calls (also unwrapping intermediate `as ...` casts like `(supabase.from(T) as X).select(...)`)
          while (true) {
            let parent: ts.Node | undefined = cur.parent;
            while (parent && (ts.isAsExpression(parent) || ts.isParenthesizedExpression(parent) || ts.isSatisfiesExpression(parent))) {
              parent = parent.parent;
            }
            if (!parent || !ts.isPropertyAccessExpression(parent) || !parent.parent || !ts.isCallExpression(parent.parent)) {
              break;
            }
            const call: ts.CallExpression = parent.parent;
            const meth = parent.name.text;
            const l = lineOf(call);
            const a0 = call.arguments[0];
            if (meth === 'select') {
              const s = strOf(a0, sf, f);
              if (s != null) {
                const parsed = parseSelect(s);
                for (const [al, tg] of parsed.relAliases) chainRelAliases.set(al, tg);
                for (const c of parsed.cols) push('select', c, l);
              } else if (a0) unresolved++;
            } else if (WRITE.has(meth)) {
              const ks = objKeys(a0, sf, f);
              if (ks) for (const k of ks) { if (k !== '...' && COL_RE.test(k)) push(meth, k, l); }
              else unresolved++;
              const opt = call.arguments[1];
              if (opt && ts.isObjectLiteralExpression(opt)) {
                for (const p of opt.properties) {
                  if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === 'onConflict') {
                    const s = strOf(p.initializer, sf, f);
                    if (s) s.split(',').map((x) => x.trim()).filter((x) => COL_RE.test(x)).forEach((c) => push('onConflict', c, l));
                  }
                }
              }
            } else if (COL_METHODS.has(meth)) {
              const s = strOf(a0, sf, f);
              if (s != null) {
                const jsonStripped = s.split('->')[0];
                if (jsonStripped.includes('.')) {
                  // Embedded foreign relation dot-filter: `foreign_table_or_alias.column`
                  // Prefix before `.` is NOT a column on the base table!
                  const dotParts = jsonStripped.split('.');
                  if (dotParts.length === 2) {
                    const [relPrefix, relCol] = dotParts;
                    const mappedTarget = chainRelAliases.get(relPrefix) ?? relPrefix;
                    if (COL_RE.test(mappedTarget) && COL_RE.test(relCol)) {
                      push(meth, relCol, l, s, mappedTarget, true);
                    }
                  }
                } else if (COL_RE.test(jsonStripped)) {
                  push(meth, jsonStripped, l);
                }
              }
            } else if (meth === 'match') {
              (objKeys(a0, sf, f) ?? []).filter((k) => COL_RE.test(k)).forEach((k) => push('match', k, l));
            } else if (meth === 'or') {
              const s = strOf(a0, sf, f);
              if (s) for (const c of parseOr(s)) push('or', c, l, s.slice(0, 80));
              else if (a0) unresolved++;
            }
            cur = call;
          }
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return { refs, files: scanned, unresolved };
}

// ── 4. 평가 ──────────────────────────────────────────────────────────────────
export function evaluate(refs: Ref[], schema: Schema): Violation[] {
  const out: Violation[] = [];
  for (const r of refs) {
    if (r.op === 'rpc') {
      if (!schema.rpcs.has(r.col as string)) out.push({ ...r, kind: 'RPC-MISSING' });
      continue;
    }
    const table = r.table as string;
    if (!schema.tables.has(table)) {
      // If `r.isForeignFilter` was an FK column alias (e.g. `building:building_id!inner(area_signal)`),
      // `building_id` is a column name rather than a table name; skip false TABLE-MISSING on aliases.
      if (r.isForeignFilter) continue;
      out.push({ ...r, kind: 'TABLE-MISSING' });
      continue;
    }
    const cols = schema.tables.get(table);
    if (r.col != null && cols && !cols.has(r.col)) out.push({ ...r, kind: 'COL-MISSING' });
  }
  return out;
}
const isMagazine = (v: Ref): boolean => /magazine/i.test(v.file) || /^magazine_/.test(v.table ?? '') || /^magazine_/.test(v.op === 'rpc' ? (v.col ?? '') : '');
const keyOf = (v: Violation): string => `${v.file}|${v.table ?? ''}|${v.col ?? ''}|${v.op}|${v.kind}`;

function toCounts(vs: Violation[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const v of vs) counts[keyOf(v)] = (counts[keyOf(v)] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function writeMagazineReport(live: Violation[], afterPending: Violation[], pending: string[], snapAt: string): void {
  const magLive = live.filter(isMagazine);
  const magAfter = afterPending.filter(isMagazine);
  const afterKeys = new Set(magAfter.map((v) => `${v.file}:${v.line}|${v.table}|${v.col}|${v.op}|${v.kind}`));
  const fmt = (v: Violation) => `| \`${v.file}:${v.line}\` | \`${v.table ?? '(rpc)'}.${v.col ?? ''}\` | ${v.op} | ${v.kind} |`;
  const lines: string[] = [];
  lines.push('# 매거진 경로 스키마 드리프트 현황 (자동 생성)');
  lines.push('');
  lines.push(`- 생성: \`npx tsx scripts/check-schema-drift.ts --write-magazine-report\` (${new Date().toISOString()})`);
  lines.push(`- 스냅샷: \`supabase/schema-snapshot.json\` (generatedAt ${snapAt})`);
  lines.push(`- 미적용 마이그레이션 오버레이: ${pending.length ? pending.map((p) => `\`${p}\``).join(', ') : '(없음)'}`);
  lines.push(`- 매거진 범위: 파일 경로에 \`magazine\` 포함 · \`magazine_*\` 테이블/RPC · \`im-to-magazine\``);
  lines.push('');
  lines.push(`## 요약`);
  lines.push('');
  lines.push(`| 구분 | 건수 |`);
  lines.push(`|:--|--:|`);
  lines.push(`| 운영 스키마 기준 매거진 위반(오버레이 미적용) | ${magLive.length} |`);
  lines.push(`| 미적용 마이그레이션 적용 후 잔존 위반 (**코드 수정 필요**) | ${magAfter.length} |`);
  lines.push(`| 마이그레이션 적용으로 해소 예정 | ${magLive.length - magAfter.length} |`);
  lines.push('');
  lines.push('## A. 마이그레이션 적용 후에도 남는 위반 (코드 수정 대상, 목표 0)');
  lines.push('');
  if (magAfter.length === 0) lines.push('없음 ✅');
  else { lines.push('| 위치 | 참조 | 연산 | 종류 |'); lines.push('|:--|:--|:--|:--|'); magAfter.forEach((v) => lines.push(fmt(v))); }
  lines.push('');
  lines.push('## B. 운영 스키마 기준 전체 위반 (마이그레이션 의존분 포함)');
  lines.push('');
  if (magLive.length === 0) lines.push('없음 ✅');
  else {
    lines.push('| 위치 | 참조 | 연산 | 종류 | 해소 |'); lines.push('|:--|:--|:--|:--|:--|');
    magLive.forEach((v) => {
      const k = `${v.file}:${v.line}|${v.table}|${v.col}|${v.op}|${v.kind}`;
      lines.push(fmt(v).replace(/ \|$/, '') + ` | ${afterKeys.has(k) ? '코드 수정' : '마이그레이션 적용 시'} |`);
    });
  }
  lines.push('');
  fs.mkdirSync(path.dirname(MAG_REPORT_PATH), { recursive: true });
  fs.writeFileSync(MAG_REPORT_PATH, lines.join('\n'), 'utf8');
}

// ── 5. main ──────────────────────────────────────────────────────────────────
function main(): void {
  const { schema: liveSchema, snap } = loadSnapshot();
  const pending = NO_OVERLAY ? [] : pendingMigrations(snap.appliedMigrations ?? []);
  const withPending = cloneSchema(liveSchema);
  for (const f of pending) applyMigrationSql(fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8'), withPending);

  const { refs, files, unresolved } = extractRefs();
  const live = evaluate(refs, liveSchema);
  const current = evaluate(refs, withPending);
  const counts = toCounts(current);
  const magCurrent = current.filter(isMagazine);

  if (WRITE_REPORT) writeMagazineReport(live, evaluate(refs, withPending), pending, snap.generatedAt);

  if (UPDATE_BASELINE) {
    const baseline = {
      $comment: '스키마 드리프트 baseline(F-01). 키 = file|table|col|op|kind, 값 = 건수(줄번호 제외). 위반이 줄었을 때만 --update-baseline 으로 갱신.',
      generatedAt: new Date().toISOString(),
      snapshotGeneratedAt: snap.generatedAt,
      overlayMigrations: pending,
      total: current.length,
      magazineTotal: magCurrent.length,
      counts,
    };
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 1) + '\n', 'utf8');
    console.log(`baseline 기록: total=${current.length} magazine=${magCurrent.length} → ${path.relative(ROOT, BASELINE_PATH)}`);
    return;
  }

  let baselineCounts: Record<string, number> = {};
  let baselineTotal = 0;
  if (fs.existsSync(BASELINE_PATH)) {
    const b = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')) as { counts: Record<string, number>; total: number };
    baselineCounts = b.counts; baselineTotal = b.total;
  } else {
    console.warn('WARN: baseline 이 없습니다. --update-baseline 으로 먼저 생성하세요. (모든 위반을 신규로 간주)');
  }

  // 키별 증가분 → 신규 위반 목록
  const seen: Record<string, number> = {};
  const added: Violation[] = [];
  for (const v of current) {
    const k = keyOf(v);
    seen[k] = (seen[k] ?? 0) + 1;
    if (seen[k] > (baselineCounts[k] ?? 0)) added.push(v);
  }
  const addedMag = added.filter(isMagazine);
  const fixedKeys = Object.keys(baselineCounts).filter((k) => (counts[k] ?? 0) < baselineCounts[k]).length;

  const fail = added.length > 0 || (STRICT_MAGAZINE && magCurrent.length > 0);
  if (AS_JSON) {
    console.log(JSON.stringify({ filesScanned: files, refs: refs.length, unresolved, overlay: pending, total: current.length, baselineTotal, magazine: magCurrent.length, current, added, pass: !fail }, null, 2));
  } else {
    console.log(`schema drift: files=${files} refs=${refs.length} unresolved(dynamic)=${unresolved} overlay=${pending.length}개 마이그레이션`);
    console.log(`  위반 total=${current.length} (baseline ${baselineTotal}), 매거진=${magCurrent.length}, 신규(증가분)=${added.length} (매거진 ${addedMag.length}), 개선된 키=${fixedKeys}`);
    for (const v of added.slice(0, 60)) console.log(`  NEW ${isMagazine(v) ? '[magazine] ' : ''}${v.file}:${v.line}  ${v.table ?? '(rpc)'}.${v.col ?? ''}  ${v.op}  ${v.kind}`);
    if (added.length > 60) console.log(`  … 외 ${added.length - 60}건`);
    if (STRICT_MAGAZINE && magCurrent.length > 0) for (const v of magCurrent.slice(0, 40)) console.log(`  STRICT ${v.file}:${v.line}  ${v.table ?? '(rpc)'}.${v.col ?? ''}  ${v.op}  ${v.kind}`);
    if (VERBOSE && current.length > 0) {
      for (const v of current) console.log(`  VIOL ${v.file}:${v.line}  ${v.table ?? '(rpc)'}.${v.col ?? ''}  ${v.op}  ${v.kind}`);
    }
    if (fixedKeys > 0 && added.length === 0) console.log('  (위반이 줄었습니다 → --update-baseline 으로 baseline 을 낮추세요)');
    console.log(fail ? 'RESULT: FAIL' : 'RESULT: PASS');
  }
  process.exit(fail ? 1 : 0);
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();

if (isDirectRun) {
  main();
}
