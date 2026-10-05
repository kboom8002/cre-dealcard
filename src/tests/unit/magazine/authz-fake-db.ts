/**
 * authz 테스트용 Supabase 체인 페이크 (A2).
 * 호출을 기록(`calls`)하고, resolver가 호출별 결과를 돌려준다.
 * assertOwnsRow가 만드는 `.eq('id').in('broker_id', keys)` 필터를 resolver에서 직접 평가해
 * "타 브로커 행은 안 보인다"는 DB 동작을 흉내낸다.
 */
export interface FakeCall {
  table: string;
  op: 'select' | 'insert' | 'update' | 'delete' | 'upsert';
  filters: Array<[string, ...unknown[]]>;
  payload?: unknown;
}

export interface FakeResult {
  data?: unknown;
  error?: { code?: string; message: string } | null;
  count?: number | null;
}

export type FakeResolver = (call: FakeCall) => FakeResult | undefined;

const CHAIN_METHODS = [
  'select', 'eq', 'neq', 'in', 'is', 'not', 'or', 'gte', 'lte', 'lt', 'gt',
  'order', 'limit', 'range', 'ilike', 'like',
] as const;

export function createFakeDb(resolver: FakeResolver) {
  const calls: FakeCall[] = [];
  const client = {
    from(table: string) {
      const call: FakeCall = { table, op: 'select', filters: [] };
      calls.push(call);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: any = {};
      const result = () => {
        const r = resolver(call) ?? { data: null, error: null };
        return { data: r.data ?? null, error: r.error ?? null, count: r.count ?? null };
      };
      for (const m of CHAIN_METHODS) {
        chain[m] = (...args: unknown[]) => {
          call.filters.push([m, ...args]);
          return chain;
        };
      }
      for (const op of ['insert', 'update', 'delete', 'upsert'] as const) {
        chain[op] = (payload?: unknown) => {
          call.op = op;
          call.payload = payload;
          return chain;
        };
      }
      chain.maybeSingle = () => Promise.resolve(result());
      chain.single = () => Promise.resolve(result());
      chain.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(result()).then(res, rej);
      return chain;
    },
  };
  return { client, calls };
}

/** call.filters에서 특정 컬럼의 `.in(col, keys)` 값을 꺼낸다. */
export function inKeys(call: FakeCall, col: string): string[] | undefined {
  const f = call.filters.find((x) => x[0] === 'in' && x[1] === col);
  return f ? (f[2] as string[]) : undefined;
}

/** call.filters에서 특정 컬럼의 `.eq(col, v)` 값을 꺼낸다. */
export function eqValue(call: FakeCall, col: string): unknown {
  const f = call.filters.find((x) => x[0] === 'eq' && x[1] === col);
  return f ? f[2] : undefined;
}

/** 행 목록에서 (id, broker_id ∈ keys) 조건을 평가하는 헬퍼 */
export function rowVisibleTo(rows: Array<Record<string, unknown>>, call: FakeCall, keyColumn = 'broker_id') {
  const id = eqValue(call, 'id');
  const keys = inKeys(call, keyColumn) ?? [];
  return rows.find((r) => r.id === id && keys.includes(String(r[keyColumn])));
}

/** eq/neq/in 필터를 모두 적용해 행을 거른다(목록 쿼리용). */
export function filterRows(rows: Array<Record<string, unknown>>, call: FakeCall) {
  return rows.filter((r) =>
    call.filters.every(([m, col, val]) => {
      if (m === 'eq') return r[col as string] === val;
      if (m === 'neq') return r[col as string] !== val;
      if (m === 'in') return (val as unknown[]).includes(r[col as string]);
      return true;
    }),
  );
}

