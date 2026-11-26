/**
 * scripts/generate-supabase-types.ts — Deterministic Supabase `<Database>` Type Generator
 *
 * Reads `supabase/schema-snapshot.json` (live PostgREST OpenAPI snapshot) AND overlays
 * pending migrations `supabase/migrations/2026*.sql` (`>= 20261004000001` not yet in
 * `appliedMigrations`), emitting a deterministic `src/types/supabase.generated.ts`.
 *
 * Also inspects column defaults across `supabase/migrations/*.sql` so `TablesInsert<T>`
 * marks defaulted `NOT NULL` columns as optional while keeping truly required columns strict.
 *
 * Usage:
 *   npx tsx scripts/generate-supabase-types.ts
 */
import fs from 'node:fs';
import path from 'node:path';

interface SnapshotTable {
  columns: Record<string, string>;
  required?: string[];
}

interface SnapshotJson {
  generatedAt: string;
  appliedMigrations?: string[];
  tables: Record<string, SnapshotTable>;
  rpcs: Record<string, string[]>;
}

interface ColumnMeta {
  sqlType: string;
  notNull: boolean;
  hasDefault: boolean;
}

interface TableMeta {
  columns: Map<string, ColumnMeta>;
}

interface RpcParamMeta {
  name: string;
  tsType: string;
  optional: boolean;
}

interface RpcMeta {
  params: Map<string, RpcParamMeta>;
  returnTsType: string;
}

const ROOT = process.cwd();
const SNAPSHOT_PATH = path.join(ROOT, 'supabase', 'schema-snapshot.json');
const MIGRATIONS_DIR = path.join(ROOT, 'supabase', 'migrations');
const OUT_PATH = path.join(ROOT, 'src', 'types', 'supabase.generated.ts');
const PENDING_FROM = '20261004000001';

const IDENT_RE = /^"?([a-z_][a-z0-9_]*)"?$/i;
const TABLE_CONSTRAINT_HEAD_RE = /^(constraint|primary|unique|check|foreign|like|exclude)$/i;
const AUTO_OPTIONAL_COLS = new Set(['id', 'created_at', 'updated_at']);

function stripSqlComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
}

function matchParen(s: string, openIdx: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = openIdx; i < s.length; i++) {
    const ch = s[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function splitTopLevel(body: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let cur = '';
  for (const ch of body) {
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
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      if (cur.trim()) out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

export function mapSqlTypeToTs(rawType: string): string {
  const t = rawType.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!t) return 'Json';

  // Array types: text[], uuid[], integer[], _text, etc.
  if (t.endsWith('[]')) {
    const elem = mapSqlTypeToTs(t.slice(0, -2));
    return elem.includes('|') || elem.includes('{') ? `(${elem})[]` : `${elem}[]`;
  }
  if (t.startsWith('_') && t.length > 1) {
    const elem = mapSqlTypeToTs(t.slice(1));
    return elem.includes('|') || elem.includes('{') ? `(${elem})[]` : `${elem}[]`;
  }
  if (/^array\b/.test(t)) {
    return 'Json[]';
  }

  // Strip length/precision modifiers like varchar(2), numeric(10,2), vector(1536)
  const base = t.replace(/\([^)]*\)/g, '').trim();

  if (base === 'boolean' || base === 'bool') return 'boolean';

  if (
    base === 'smallint' ||
    base === 'integer' ||
    base === 'int' ||
    base === 'int2' ||
    base === 'int4' ||
    base === 'int8' ||
    base === 'bigint' ||
    base === 'serial' ||
    base === 'smallserial' ||
    base === 'bigserial' ||
    base === 'numeric' ||
    base === 'decimal' ||
    base === 'real' ||
    base === 'float' ||
    base === 'float4' ||
    base === 'float8' ||
    base === 'double precision' ||
    base === 'number'
  ) {
    return 'number';
  }

  if (base === 'json' || base === 'jsonb' || base === 'object') return 'Json';

  if (
    base === 'uuid' ||
    base === 'text' ||
    base === 'varchar' ||
    base === 'character varying' ||
    base === 'character' ||
    base === 'char' ||
    base === 'bpchar' ||
    base === 'citext' ||
    base === 'date' ||
    base === 'time' ||
    base === 'timetz' ||
    base === 'time with time zone' ||
    base === 'time without time zone' ||
    base === 'timestamp' ||
    base === 'timestamptz' ||
    base === 'timestamp with time zone' ||
    base === 'timestamp without time zone' ||
    base === 'interval' ||
    base === 'inet' ||
    base === 'cidr' ||
    base === 'macaddr' ||
    base === 'bytea' ||
    base === 'tsvector' ||
    base === 'vector' ||
    base === 'string' ||
    base === 'name'
  ) {
    return 'string';
  }

  if (base === 'void') return 'undefined';

  return 'Json';
}

function parseColumnDefinition(defRaw: string): { name: string; meta: ColumnMeta } | null {
  const trimmed = defRaw.trim();
  if (!trimmed) return null;
  const tokens = trimmed.split(/\s+/);
  const first = tokens[0] ?? '';
  if (TABLE_CONSTRAINT_HEAD_RE.test(first)) return null;
  const idMatch = IDENT_RE.exec(first);
  if (!idMatch) return null;

  const colName = idMatch[1];
  const rest = trimmed.slice(first.length).trim();
  if (!rest) return null;

  // Extract SQL type up to first column constraint keyword at depth 0
  const constraintIdx = findConstraintStart(rest);
  const rawType = (constraintIdx >= 0 ? rest.slice(0, constraintIdx) : rest).trim();
  const tail = constraintIdx >= 0 ? rest.slice(constraintIdx) : '';

  const isSerial = /\b(serial|bigserial|smallserial)\b/i.test(rawType);
  const isPrimaryKey = /\bprimary\s+key\b/i.test(tail);
  const notNull = /\bnot\s+null\b/i.test(tail) || isPrimaryKey || isSerial;
  const hasDefault =
    isSerial ||
    /\bdefault\b/i.test(tail) ||
    /\bgenerated\s+(always|by\s+default)\b/i.test(tail) ||
    AUTO_OPTIONAL_COLS.has(colName);

  return {
    name: colName,
    meta: {
      sqlType: rawType || 'text',
      notNull,
      hasDefault,
    },
  };
}

function findConstraintStart(s: string): number {
  let depth = 0;
  let quote: string | null = null;
  const lower = s.toLowerCase();
  const keywords = [
    'not null',
    'null',
    'default',
    'primary key',
    'references',
    'unique',
    'check',
    'constraint',
    'generated',
    'collate',
  ];

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (ch === '(') {
      depth++;
      continue;
    }
    if (ch === ')') {
      depth--;
      continue;
    }
    if (depth === 0 && (i === 0 || /\s/.test(s[i - 1]))) {
      for (const kw of keywords) {
        if (lower.startsWith(kw, i)) {
          const after = lower[i + kw.length];
          if (!after || /[\s,()]/.test(after)) {
            return i;
          }
        }
      }
    }
  }
  return -1;
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

function parseFunctionDefinitions(
  sql: string,
  rpcs: Map<string, RpcMeta>,
  onlyUpdateExisting: boolean,
): void {
  const fnRe =
    /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = fnRe.exec(sql))) {
    const fnName = m[1];
    const open = m.index + m[0].length - 1;
    const close = matchParen(sql, open);
    if (close < 0) continue;

    // Skip trigger functions (`RETURNS trigger`) — they are not PostgREST RPCs
    const afterArgs = sql.slice(close + 1, close + 240);
    const retMatch = /^\s*returns\s+([\s\S]+?)(?:\b(?:language|security|set|as|stable|immutable|volatile)\b)/i.exec(
      afterArgs,
    );
    const retRaw = retMatch ? retMatch[1].trim() : '';
    if (/^trigger\b/i.test(retRaw)) continue;

    if (onlyUpdateExisting && !rpcs.has(fnName)) continue;

    const rawParams = splitTopLevel(sql.slice(open + 1, close));
    const paramMap = new Map<string, RpcParamMeta>();

    for (const rp of rawParams) {
      let p = rp.trim();
      if (!p) continue;
      p = p.replace(/^(?:in|out|inout|variadic)\s+/i, '').trim();
      const hasDefault = /\bdefault\b|=/i.test(p);
      const cleanDef = p.split(/\bdefault\b|=/i)[0].trim();
      const parts = cleanDef.split(/\s+/);
      if (parts.length < 2) continue;
      const pId = IDENT_RE.exec(parts[0]);
      if (!pId) continue;
      const pName = pId[1];
      const pTypeRaw = parts.slice(1).join(' ');
      const baseTs = mapSqlTypeToTs(pTypeRaw);
      paramMap.set(pName, {
        name: pName,
        tsType: hasDefault ? `${baseTs} | null` : baseTs,
        optional: hasDefault,
      });
    }

    let returnTsType = 'Json';
    if (/^void\b/i.test(retRaw)) returnTsType = 'undefined';
    else if (/^boolean\b|^bool\b/i.test(retRaw)) returnTsType = 'boolean';
    else if (/^(?:integer|int|int4|int8|bigint|numeric|real|float|double\s+precision)\b/i.test(retRaw)) {
      returnTsType = 'number';
    } else if (/^(?:uuid|text|varchar|character\s+varying)\b/i.test(retRaw)) {
      returnTsType = 'string';
    } else if (/^table\s*\(/i.test(retRaw)) {
      const tblOpen = afterArgs.indexOf('(');
      const tblClose = tblOpen >= 0 ? matchParen(afterArgs, tblOpen) : -1;
      if (tblOpen >= 0 && tblClose > tblOpen) {
        const cols = splitTopLevel(afterArgs.slice(tblOpen + 1, tblClose));
        const colEntries: string[] = [];
        for (const c of cols) {
          const ct = c.trim().split(/\s+/);
          const cid = IDENT_RE.exec(ct[0] ?? '');
          if (!cid || ct.length < 2) continue;
          colEntries.push(`${cid[1]}: ${mapSqlTypeToTs(ct.slice(1).join(' '))} | null`);
        }
        if (colEntries.length > 0) {
          returnTsType = `Array<{ ${colEntries.join('; ')} }>`;
        }
      }
    }

    rpcs.set(fnName, { params: paramMap, returnTsType });
  }
}

function harvestDefaultsAndTypesFromLegacySql(
  sqlRaw: string,
  defaultsMap: Map<string, Set<string>>,
  rpcs: Map<string, RpcMeta>,
): void {
  const sql = stripSqlComments(sqlRaw);

  const ct = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = ct.exec(sql))) {
    const tbl = m[1].toLowerCase();
    const open = m.index + m[0].length - 1;
    const close = matchParen(sql, open);
    if (close < 0) continue;
    const dset = defaultsMap.get(tbl) ?? new Set<string>();
    for (const item of splitTopLevel(sql.slice(open + 1, close))) {
      const parsed = parseColumnDefinition(item);
      if (parsed && parsed.meta.hasDefault) dset.add(parsed.name);
    }
    defaultsMap.set(tbl, dset);
  }

  for (const stmt of splitSqlStatementsOutsideDollarQuotes(sql)) {
    const am = /alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/i.exec(stmt);
    if (!am) continue;
    const tbl = am[1].toLowerCase();
    const addRe =
      /add\s+column\s+(?:if\s+not\s+exists\s+)?"?([a-z_][a-z0-9_]*)"?\s+([^,;]+)/gi;
    let c: RegExpExecArray | null;
    while ((c = addRe.exec(stmt))) {
      if (/\bdefault\b/i.test(c[2]) || AUTO_OPTIONAL_COLS.has(c[1])) {
        const dset = defaultsMap.get(tbl) ?? new Set<string>();
        dset.add(c[1]);
        defaultsMap.set(tbl, dset);
      }
    }
  }

  parseFunctionDefinitions(sql, rpcs, true);
}

function overlayPendingMigrationSql(
  sqlRaw: string,
  tables: Map<string, TableMeta>,
  views: Set<string>,
  rpcs: Map<string, RpcMeta>,
): void {
  const sql = stripSqlComments(sqlRaw);

  // 1. CREATE TABLE
  const ct = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = ct.exec(sql))) {
    const tbl = m[1];
    const open = m.index + m[0].length - 1;
    const close = matchParen(sql, open);
    if (close < 0) continue;
    const existing = tables.get(tbl) ?? { columns: new Map<string, ColumnMeta>() };
    for (const item of splitTopLevel(sql.slice(open + 1, close))) {
      const parsed = parseColumnDefinition(item);
      if (!parsed) continue;
      if (!existing.columns.has(parsed.name)) {
        existing.columns.set(parsed.name, parsed.meta);
      }
    }
    tables.set(tbl, existing);
  }

  // 2. ALTER TABLE ... ADD COLUMN
  for (const stmt of splitSqlStatementsOutsideDollarQuotes(sql)) {
    const am = /alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/i.exec(stmt);
    if (!am) continue;
    const tbl = am[1];
    // Split top-level comma clauses inside ALTER TABLE
    const afterTable = stmt.slice(am.index + am[0].length);
    for (const clause of splitTopLevel(afterTable)) {
      const cm = /^[\s]*add\s+column\s+(?:if\s+not\s+exists\s+)?([\s\S]+)$/i.exec(clause);
      if (!cm) continue;
      const parsed = parseColumnDefinition(cm[1]);
      if (!parsed) continue;
      const existing = tables.get(tbl) ?? { columns: new Map<string, ColumnMeta>() };
      if (!existing.columns.has(parsed.name)) {
        existing.columns.set(parsed.name, parsed.meta);
      }
      tables.set(tbl, existing);
    }
  }

  // 3. CREATE VIEW
  const cv = /create\s+(?:or\s+replace\s+)?view\s+(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi;
  while ((m = cv.exec(sql))) {
    const viewName = m[1];
    if (!tables.has(viewName)) views.add(viewName);
  }

  // 4. CREATE FUNCTION (RPCs)
  parseFunctionDefinitions(sql, rpcs, false);
}

function listAllSqlMigrations(): string[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

function listPendingMigrations(applied: string[]): string[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{14}_.*\.sql$/.test(f))
    .filter((f) => f.slice(0, 14) >= PENDING_FROM && !applied.includes(f.slice(0, 14)))
    .sort();
}

export function generateSupabaseTypesSource(): {
  source: string;
  tableCount: number;
  viewCount: number;
  rpcCount: number;
  overlayCount: number;
} {
  if (!fs.existsSync(SNAPSHOT_PATH)) {
    throw new Error(`Missing schema snapshot at ${SNAPSHOT_PATH}`);
  }

  const snap = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8')) as SnapshotJson;
  const applied = snap.appliedMigrations ?? [];

  // Initialize RPCs from snapshot first so legacy SQL pass can enrich param types/defaults
  const rpcs = new Map<string, RpcMeta>();
  for (const [fnName, paramNames] of Object.entries(snap.rpcs)) {
    const pmap = new Map<string, RpcParamMeta>();
    for (const p of paramNames) {
      pmap.set(p, { name: p, tsType: 'Json | undefined', optional: true });
    }
    rpcs.set(fnName, { params: pmap, returnTsType: 'Json' });
  }

  // Harvest column defaults & RPC param metadata from existing migrations
  const defaultsMap = new Map<string, Set<string>>();
  for (const file of listAllSqlMigrations()) {
    const sqlRaw = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    harvestDefaultsAndTypesFromLegacySql(sqlRaw, defaultsMap, rpcs);
  }

  // Build base tables from snapshot
  const tables = new Map<string, TableMeta>();
  const views = new Set<string>();

  for (const [tableName, def] of Object.entries(snap.tables)) {
    const reqSet = new Set(def.required ?? []);
    const defSet = defaultsMap.get(tableName.toLowerCase()) ?? new Set<string>();
    const colMap = new Map<string, ColumnMeta>();

    for (const [colName, colType] of Object.entries(def.columns)) {
      colMap.set(colName, {
        sqlType: colType,
        notNull: reqSet.has(colName),
        hasDefault: defSet.has(colName) || AUTO_OPTIONAL_COLS.has(colName),
      });
    }
    tables.set(tableName, { columns: colMap });
  }

  // Overlay pending 2026* migrations (>= 20261004000001)
  const pending = listPendingMigrations(applied);
  for (const file of pending) {
    const sqlRaw = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    overlayPendingMigrationSql(sqlRaw, tables, views, rpcs);
  }

  const sortedTables = [...tables.keys()].sort((a, b) => a.localeCompare(b));
  const sortedViews = [...views].filter((v) => !tables.has(v)).sort((a, b) => a.localeCompare(b));
  const sortedRpcs = [...rpcs.keys()].sort((a, b) => a.localeCompare(b));

  const lines: string[] = [];
  lines.push('/**');
  lines.push(' * AUTO-GENERATED FILE — DO NOT EDIT MANUALLY.');
  lines.push(' * Generated deterministically by `npx tsx scripts/generate-supabase-types.ts`');
  lines.push(` * Snapshot base: supabase/schema-snapshot.json (${snap.generatedAt})`);
  lines.push(` * Overlaid pending migrations (${pending.length}):`);
  for (const p of pending) {
    lines.push(` *   - ${p}`);
  }
  lines.push(' */');
  lines.push('');
  lines.push('export type Json =');
  lines.push('  | string');
  lines.push('  | number');
  lines.push('  | boolean');
  lines.push('  | null');
  lines.push('  | { [key: string]: Json | undefined }');
  lines.push('  | Json[];');
  lines.push('');
  lines.push('export interface Database {');
  lines.push('  public: {');

  // Tables
  lines.push('    Tables: {');
  for (const tbl of sortedTables) {
    const meta = tables.get(tbl)!;
    const cols = [...meta.columns.keys()].sort((a, b) => a.localeCompare(b));
    const safeTblKey = /^[A-Za-z_][A-Za-z0-9_]*$/.test(tbl) ? tbl : JSON.stringify(tbl);
    lines.push(`      ${safeTblKey}: {`);

    // Row
    lines.push('        Row: {');
    for (const c of cols) {
      const cm = meta.columns.get(c)!;
      const tsType = mapSqlTypeToTs(cm.sqlType);
      const safeCol = /^[A-Za-z_][A-Za-z0-9_]*$/.test(c) ? c : JSON.stringify(c);
      lines.push(`          ${safeCol}: ${cm.notNull ? tsType : `${tsType} | null`};`);
    }
    lines.push('        };');

    // Insert
    lines.push('        Insert: {');
    for (const c of cols) {
      const cm = meta.columns.get(c)!;
      const tsType = mapSqlTypeToTs(cm.sqlType);
      const safeCol = /^[A-Za-z_][A-Za-z0-9_]*$/.test(c) ? c : JSON.stringify(c);
      if (cm.notNull && !cm.hasDefault) {
        lines.push(`          ${safeCol}: ${tsType};`);
      } else if (cm.notNull && cm.hasDefault) {
        lines.push(`          ${safeCol}?: ${tsType};`);
      } else {
        lines.push(`          ${safeCol}?: ${tsType} | null;`);
      }
    }
    lines.push('        };');

    // Update
    lines.push('        Update: {');
    for (const c of cols) {
      const cm = meta.columns.get(c)!;
      const tsType = mapSqlTypeToTs(cm.sqlType);
      const safeCol = /^[A-Za-z_][A-Za-z0-9_]*$/.test(c) ? c : JSON.stringify(c);
      lines.push(`          ${safeCol}?: ${cm.notNull ? tsType : `${tsType} | null`};`);
    }
    lines.push('        };');

    lines.push('        Relationships: [];');
    lines.push('      };');
  }
  lines.push('    };');

  // Views
  if (sortedViews.length === 0) {
    lines.push('    Views: Record<string, never>;');
  } else {
    lines.push('    Views: {');
    for (const vw of sortedViews) {
      const safeVw = /^[A-Za-z_][A-Za-z0-9_]*$/.test(vw) ? vw : JSON.stringify(vw);
      lines.push(`      ${safeVw}: {`);
      lines.push('        Row: Record<string, Json | undefined>;');
      lines.push('        Relationships: [];');
      lines.push('      };');
    }
    lines.push('    };');
  }

  // Functions
  lines.push('    Functions: {');
  for (const fn of sortedRpcs) {
    const fmeta = rpcs.get(fn)!;
    const safeFn = /^[A-Za-z_][A-Za-z0-9_]*$/.test(fn) ? fn : JSON.stringify(fn);
    const pNames = [...fmeta.params.keys()].sort((a, b) => a.localeCompare(b));
    lines.push(`      ${safeFn}: {`);
    if (pNames.length === 0) {
      lines.push('        Args: Record<string, never>;');
    } else {
      lines.push('        Args: {');
      for (const pn of pNames) {
        const pm = fmeta.params.get(pn)!;
        const safePn = /^[A-Za-z_][A-Za-z0-9_]*$/.test(pn) ? pn : JSON.stringify(pn);
        lines.push(`          ${safePn}${pm.optional ? '?' : ''}: ${pm.tsType};`);
      }
      lines.push('        };');
    }
    lines.push(`        Returns: ${fmeta.returnTsType};`);
    lines.push('      };');
  }
  lines.push('    };');

  lines.push('    Enums: Record<string, never>;');
  lines.push('    CompositeTypes: Record<string, never>;');
  lines.push('  };');
  lines.push('}');
  lines.push('');
  lines.push("export type PublicSchema = Database['public'];");
  lines.push('');
  lines.push(
    "export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];",
  );
  lines.push(
    "export type TablesInsert<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert'];",
  );
  lines.push(
    "export type TablesUpdate<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update'];",
  );
  lines.push("export type RpcName = keyof Database['public']['Functions'];");
  lines.push('');

  return {
    source: lines.join('\n'),
    tableCount: sortedTables.length,
    viewCount: sortedViews.length,
    rpcCount: sortedRpcs.length,
    overlayCount: pending.length,
  };
}

function main(): void {
  const result = generateSupabaseTypesSource();
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, result.source, 'utf8');
  console.log(
    `generated ${path.relative(ROOT, OUT_PATH)}: tables=${result.tableCount} views=${result.viewCount} rpcs=${result.rpcCount} overlay=${result.overlayCount}`,
  );
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]).toLowerCase() ===
    path.resolve(ROOT, 'scripts', 'generate-supabase-types.ts').toLowerCase();

if (isDirectRun) {
  main();
}
