/**
 * 스키마 인식 Supabase mock (F-05, D2-24, 함정 #16)
 *
 * 기존 단위테스트는 운영 DB 에 없는 컬럼(`interest_tags`, `email` 등)을 mock 으로 "성공"시켜
 * 스키마 드리프트를 가렸다. 이 mock 은 스키마 스냅샷에 없는 테이블/컬럼이 `.from/.select/.eq/.in/.order/
 * .insert/.update/.upsert/.or/...` 에 오면 **throw** 한다 (실제 PostgREST 의 42P01/42703 에 해당).
 *
 * 스키마 출처 (우선순위):
 *   1) `opts.schema` 직접 주입
 *   2) `supabase/schema-snapshot.json` (A1: scripts/schema-snapshot.ts 산출물)
 *   3) env `MAGAZINE_SCHEMA_DUMP` 가 가리키는 OpenAPI 덤프 JSON (`{tables:{t:{col:{...}}}}`)
 * 모두 없으면 `loadSchema()` 가 명확한 오류를 던진다 (조용히 통과시키지 않음).
 */
import fs from 'fs';
import path from 'path';

export type SchemaMap = Record<string, string[]>;
type Row = Record<string, unknown>;

export class SchemaViolationError extends Error {
  readonly code: '42P01' | '42703' | 'PGRST202';
  constructor(code: SchemaViolationError['code'], message: string) {
    super(`[schema-aware-supabase] ${message}`);
    this.name = 'SchemaViolationError';
    this.code = code;
  }
}

// ─────────────────────────────────────────────────────────────
// 스키마 로딩 / 정규화
// ─────────────────────────────────────────────────────────────

function normalizeColumns(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v
      .map((c) => (typeof c === 'string' ? c : c && typeof c === 'object' ? String((c as { name?: unknown }).name ?? '') : ''))
      .filter(Boolean);
  }
  if (v && typeof v === 'object') return Object.keys(v as object);
  return [];
}

/** 다양한 스냅샷 형태를 {table:[cols]} 로 정규화 */
export function normalizeSchema(raw: unknown): SchemaMap {
  if (!raw || typeof raw !== 'object') throw new Error('schema snapshot must be an object');
  const root = raw as Record<string, unknown>;
  const tables = (root.tables && typeof root.tables === 'object' ? root.tables : root) as Record<string, unknown>;
  const out: SchemaMap = {};
  for (const [name, def] of Object.entries(tables)) {
    if (def && typeof def === 'object' && !Array.isArray(def) && 'columns' in (def as object)) {
      out[name] = normalizeColumns((def as { columns: unknown }).columns);
    } else {
      out[name] = normalizeColumns(def);
    }
  }
  return out;
}

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

export function loadSchema(): SchemaMap {
  const snapshot = path.resolve(process.cwd(), 'supabase', 'schema-snapshot.json');
  if (fs.existsSync(snapshot)) return normalizeSchema(readJson(snapshot));
  const dump = process.env.MAGAZINE_SCHEMA_DUMP;
  if (dump && fs.existsSync(dump)) return normalizeSchema(readJson(dump));
  throw new Error(
    'schema snapshot not found: supabase/schema-snapshot.json (npm run schema:snapshot) 또는 MAGAZINE_SCHEMA_DUMP 필요',
  );
}

export function schemaSnapshotAvailable(): boolean {
  if (fs.existsSync(path.resolve(process.cwd(), 'supabase', 'schema-snapshot.json'))) return true;
  const dump = process.env.MAGAZINE_SCHEMA_DUMP;
  return !!dump && fs.existsSync(dump);
}

// ─────────────────────────────────────────────────────────────
// 컬럼 표현식 파싱
// ─────────────────────────────────────────────────────────────

function splitTopLevel(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** 'alias:col', 'col::text', 'col->key', '"col"' 에서 실제 컬럼명 추출. 임베드 'rel(a,b)'는 null(검증 생략). */
function baseColumn(expr: string): string | null {
  let e = expr.trim();
  if (e === '*' || e === '') return null;
  if (e.includes('(')) return null; // 관계 임베드/집계 — 검증 생략
  const colon = e.indexOf(':');
  if (colon > 0 && e[colon + 1] !== ':') e = e.slice(colon + 1);
  e = e.split('::')[0].split('->')[0];
  return e.replace(/^"|"$/g, '').trim() || null;
}

// ─────────────────────────────────────────────────────────────
// 필터 평가
// ─────────────────────────────────────────────────────────────

type Cond = { col: string; op: string; val: unknown };

function parseFilterValue(op: string, raw: string): unknown {
  if (op === 'in') {
    const inner = raw.replace(/^\(/, '').replace(/\)$/, '');
    return splitTopLevel(inner).map((s) => s.replace(/^"|"$/g, ''));
  }
  if (op === 'is') return raw === 'null' ? null : raw === 'true' ? true : raw === 'false' ? false : raw;
  return raw;
}

function evalCond(row: Row, c: Cond): boolean {
  const v = row[c.col];
  switch (c.op) {
    case 'eq':
      return v === c.val || (v !== null && v !== undefined && c.val !== null && String(v) === String(c.val));
    case 'neq':
      return !evalCond(row, { ...c, op: 'eq' });
    case 'gt':
      return (v as number) > (c.val as number);
    case 'gte':
      return (v as number) >= (c.val as number);
    case 'lt':
      return (v as number) < (c.val as number);
    case 'lte':
      return (v as number) <= (c.val as number);
    case 'is':
      return c.val === null ? v === null || v === undefined : v === c.val;
    case 'in':
      return (c.val as unknown[]).some((x) => x === v || String(x) === String(v));
    case 'like':
    case 'ilike': {
      const re = new RegExp(
        '^' + String(c.val).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.') + '$',
        c.op === 'ilike' ? 'i' : '',
      );
      return re.test(String(v ?? ''));
    }
    default:
      return true;
  }
}

// ─────────────────────────────────────────────────────────────
// mock 팩토리
// ─────────────────────────────────────────────────────────────

export interface SchemaAwareOptions {
  schema?: SchemaMap;
  /** rpc 이름 화이트리스트 (없으면 rpc 검증 생략) */
  rpcs?: Record<string, (args: unknown) => unknown>;
}

export interface SchemaAwareSupabase {
  from(table: string): QueryBuilder;
  rpc(name: string, args?: unknown): Promise<{ data: unknown; error: null }>;
  /** 테스트 단언용: 현재 테이블 상태 */
  __rows(table: string): Row[];
  __calls: { table: string; op: string }[];
  __schema: SchemaMap;
}

type Mode = 'select' | 'insert' | 'update' | 'upsert' | 'delete';

class QueryBuilder implements PromiseLike<{ data: unknown; error: null }> {
  private mode: Mode = 'select';
  private conds: Cond[] = [];
  private orGroups: Cond[][] = [];
  private payload: Row[] = [];
  private patch: Row = {};
  private orderBy: { col: string; asc: boolean }[] = [];
  private limitN: number | null = null;
  private wantsReturn = false;
  private singleMode: 'single' | 'maybe' | null = null;
  private onConflict: string[] | null = null;

  constructor(
    private table: string,
    private cols: Set<string>,
    private store: Record<string, Row[]>,
    private calls: { table: string; op: string }[],
  ) {}

  private assertCol(col: string | null, where: string) {
    if (col === null) return;
    if (!this.cols.has(col)) {
      throw new SchemaViolationError('42703', `column "${this.table}.${col}" does not exist (${where})`);
    }
  }

  private assertRowCols(row: Row, where: string) {
    for (const k of Object.keys(row)) this.assertCol(k, where);
  }

  select(columns = '*') {
    for (const part of splitTopLevel(columns)) this.assertCol(baseColumn(part), 'select');
    if (this.mode !== 'select') this.wantsReturn = true; // insert/update/upsert/delete().select()
    return this;
  }

  insert(rows: Row | Row[]) {
    this.mode = 'insert';
    this.payload = (Array.isArray(rows) ? rows : [rows]).map((r) => ({ ...r }));
    for (const r of this.payload) this.assertRowCols(r, 'insert');
    return this;
  }

  upsert(rows: Row | Row[], opts?: { onConflict?: string }) {
    this.mode = 'upsert';
    this.payload = (Array.isArray(rows) ? rows : [rows]).map((r) => ({ ...r }));
    for (const r of this.payload) this.assertRowCols(r, 'upsert');
    if (opts?.onConflict) {
      this.onConflict = opts.onConflict.split(',').map((s) => s.trim());
      for (const c of this.onConflict) this.assertCol(c, 'upsert.onConflict');
    }
    return this;
  }

  update(patch: Row) {
    this.mode = 'update';
    this.patch = { ...patch };
    this.assertRowCols(this.patch, 'update');
    return this;
  }

  delete() {
    this.mode = 'delete';
    return this;
  }

  private addCond(col: string, op: string, val: unknown) {
    this.assertCol(baseColumn(col), op);
    this.conds.push({ col: baseColumn(col) ?? col, op, val });
    return this;
  }

  eq(col: string, val: unknown) { return this.addCond(col, 'eq', val); }
  neq(col: string, val: unknown) { return this.addCond(col, 'neq', val); }
  gt(col: string, val: unknown) { return this.addCond(col, 'gt', val); }
  gte(col: string, val: unknown) { return this.addCond(col, 'gte', val); }
  lt(col: string, val: unknown) { return this.addCond(col, 'lt', val); }
  lte(col: string, val: unknown) { return this.addCond(col, 'lte', val); }
  like(col: string, val: string) { return this.addCond(col, 'like', val); }
  ilike(col: string, val: string) { return this.addCond(col, 'ilike', val); }
  is(col: string, val: unknown) { return this.addCond(col, 'is', val); }
  in(col: string, vals: unknown[]) { return this.addCond(col, 'in', vals); }
  not(col: string, op: string, val: unknown) {
    this.assertCol(baseColumn(col), 'not');
    const inner: Cond = { col: baseColumn(col) ?? col, op, val };
    this.conds.push({ col: '__not__', op: 'not', val: inner });
    return this;
  }

  or(filters: string) {
    const group: Cond[] = [];
    for (const item of splitTopLevel(filters)) {
      const m = /^([A-Za-z_][\w]*(?:->>?[\w]+)?)\.(not\.)?([a-z]+)\.(.*)$/.exec(item);
      if (!m) continue; // and(...)/or(...) 중첩은 검증 생략
      this.assertCol(baseColumn(m[1]), 'or');
      group.push({ col: baseColumn(m[1]) as string, op: m[3], val: parseFilterValue(m[3], m[4]) });
    }
    this.orGroups.push(group);
    return this;
  }

  order(col: string, opts?: { ascending?: boolean }) {
    this.assertCol(baseColumn(col), 'order');
    this.orderBy.push({ col: baseColumn(col) as string, asc: opts?.ascending !== false });
    return this;
  }

  limit(n: number) { this.limitN = n; return this; }
  range(from: number, to: number) { this.limitN = to - from + 1; return this; }
  maybeSingle() { this.singleMode = 'maybe'; return this; }
  // `.single()` 은 PostgREST 에서 0건이면 에러지만, mock 은 maybeSingle 과 동일하게 data:null 로 단순화한다.
  single() { this.singleMode = 'single'; return this; }

  private matches(row: Row): boolean {
    for (const c of this.conds) {
      if (c.op === 'not') {
        if (evalCond(row, c.val as Cond)) return false;
      } else if (!evalCond(row, c)) return false;
    }
    for (const g of this.orGroups) {
      if (g.length && !g.some((c) => evalCond(row, c))) return false;
    }
    return true;
  }

  private exec(): { data: unknown; error: null } {
    this.calls.push({ table: this.table, op: this.mode });
    const rows = (this.store[this.table] ??= []);
    let result: Row[] = [];

    if (this.mode === 'insert') {
      for (const r of this.payload) rows.push({ ...r });
      result = this.payload.map((r) => ({ ...r }));
    } else if (this.mode === 'upsert') {
      for (const r of this.payload) {
        const keys = this.onConflict ?? ['id'];
        const idx = rows.findIndex((x) => keys.every((k) => x[k] !== undefined && x[k] === r[k]));
        if (idx >= 0) rows[idx] = { ...rows[idx], ...r };
        else rows.push({ ...r });
      }
      result = this.payload.map((r) => ({ ...r }));
    } else if (this.mode === 'update') {
      for (const row of rows) if (this.matches(row)) Object.assign(row, this.patch), result.push({ ...row });
    } else if (this.mode === 'delete') {
      const keep: Row[] = [];
      for (const row of rows) (this.matches(row) ? result : keep).push(row);
      this.store[this.table] = keep;
    } else {
      result = rows.filter((r) => this.matches(r)).map((r) => ({ ...r }));
      for (const o of [...this.orderBy].reverse()) {
        result.sort((a, b) => {
          const av = a[o.col] as number | string;
          const bv = b[o.col] as number | string;
          if (av === bv) return 0;
          return (av > bv ? 1 : -1) * (o.asc ? 1 : -1);
        });
      }
      if (this.limitN !== null) result = result.slice(0, this.limitN);
    }

    if (this.mode !== 'select' && !this.wantsReturn) return { data: null, error: null };
    if (this.singleMode) {
      if (result.length === 0) return { data: null, error: null };
      return { data: result[0], error: null };
    }
    return { data: result, error: null };
  }

  then<T1 = { data: unknown; error: null }, T2 = never>(
    onfulfilled?: ((value: { data: unknown; error: null }) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    try {
      return Promise.resolve(this.exec()).then(onfulfilled, onrejected);
    } catch (e) {
      return Promise.reject(e).then(onfulfilled, onrejected);
    }
  }
}


export function createSchemaAwareSupabase(
  seed: Record<string, Row[]> = {},
  opts: SchemaAwareOptions = {},
): SchemaAwareSupabase {
  const schema = opts.schema ?? loadSchema();
  const store: Record<string, Row[]> = {};
  const calls: { table: string; op: string }[] = [];

  // seed 도 스키마를 지켜야 한다 (없는 컬럼으로 시드를 만들어 테스트를 통과시키는 것 방지)
  for (const [table, rows] of Object.entries(seed)) {
    if (!schema[table]) throw new SchemaViolationError('42P01', `seed table "${table}" does not exist in schema`);
    const cols = new Set(schema[table]);
    for (const row of rows) {
      for (const k of Object.keys(row)) {
        if (!cols.has(k)) throw new SchemaViolationError('42703', `seed column "${table}.${k}" does not exist`);
      }
    }
    store[table] = rows.map((r) => ({ ...r }));
  }

  return {
    from(table: string) {
      if (!schema[table]) throw new SchemaViolationError('42P01', `relation "${table}" does not exist`);
      return new QueryBuilder(table, new Set(schema[table]), store, calls);
    },
    async rpc(name: string, args?: unknown) {
      if (opts.rpcs) {
        const fn = opts.rpcs[name];
        if (!fn) throw new SchemaViolationError('PGRST202', `function "${name}" not found`);
        return { data: fn(args), error: null };
      }
      return { data: null, error: null };
    },
    __rows: (table: string) => (store[table] ?? []).map((r) => ({ ...r })),
    __calls: calls,
    __schema: schema,
  };
}
