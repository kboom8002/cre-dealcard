/**
 * 테스트 보조: magazine_subscribers / activity_events 용 인메모리 Supabase 체인 페이크 (vitest 대상 아님)
 * consent-service·subscribe route가 쓰는 체인(select/eq/in/ilike/limit/insert/update/single)만 구현한다.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

export interface FakeError {
  code?: string;
  message?: string;
}

export interface FakeDbOptions {
  /** magazine_subscribers.source CHECK 시뮬레이션(허용 목록 밖이면 23514) */
  sourceCheck?: readonly string[];
  /** 'select' | 'insert' | 'update' 중 하나를 항상 실패시킴 */
  failOn?: Partial<Record<'select' | 'insert' | 'update', FakeError>>;
  /** 첫 insert를 23505(경합)로 실패시키고, 그 사이에 이 행이 다른 요청에 의해 만들어진 것처럼 삽입 */
  raceRow?: Record<string, any>;
}

type Row = Record<string, any>;

export class FakeDb {
  tables: Record<string, Row[]> = { magazine_subscribers: [], activity_events: [] };
  calls: Array<{ table: string; op: string; payload?: unknown }> = [];
  private idSeq = 0;
  private raceUsed = false;

  constructor(public opts: FakeDbOptions = {}) {}

  seed(row: Row): Row {
    const r = { id: `sub-${++this.idSeq}`, status: 'active', ...row };
    this.tables.magazine_subscribers.push(r);
    return r;
  }

  from(table: string) {
    return new FakeQuery(this, table);
  }

  nextId(): string {
    return `sub-${++this.idSeq}`;
  }

  consumeRace(): Row | null {
    if (this.opts.raceRow && !this.raceUsed) {
      this.raceUsed = true;
      return this.opts.raceRow;
    }
    return null;
  }
}

class FakeQuery implements PromiseLike<{ data: any; error: FakeError | null }> {
  private op: 'select' | 'insert' | 'update' = 'select';
  private filters: Array<(r: Row) => boolean> = [];
  private payload: Row | null = null;
  private wantRows = false;
  private isSingle = false;
  private max = Infinity;

  constructor(
    private db: FakeDb,
    private table: string,
  ) {}

  select(_cols?: string) {
    if (this.op === 'select') this.wantRows = true;
    else this.wantRows = true;
    return this;
  }
  insert(row: Row) {
    this.op = 'insert';
    this.payload = row;
    return this;
  }
  update(patch: Row) {
    this.op = 'update';
    this.payload = patch;
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  in(col: string, vals: unknown[]) {
    this.filters.push((r) => vals.includes(r[col]));
    return this;
  }
  ilike(col: string, pattern: string) {
    const needle = pattern.replace(/\\([\\%_])/g, '$1').toLowerCase();
    this.filters.push((r) => typeof r[col] === 'string' && r[col].toLowerCase() === needle);
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }
  single() {
    this.isSingle = true;
    return this;
  }

  then<T1, T2>(
    onfulfilled?: ((value: { data: any; error: FakeError | null }) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    return Promise.resolve(this.exec()).then(onfulfilled, onrejected);
  }

  private exec(): { data: any; error: FakeError | null } {
    const rows = (this.db.tables[this.table] ??= []);
    this.db.calls.push({ table: this.table, op: this.op, payload: this.payload });
    const forced = this.table === 'magazine_subscribers' ? this.db.opts.failOn?.[this.op] : undefined;
    if (forced) return { data: null, error: forced };

    if (this.op === 'select') {
      const data = rows.filter((r) => this.filters.every((f) => f(r))).slice(0, this.max);
      return { data: data.map((r) => ({ ...r })), error: null };
    }

    if (this.op === 'insert') {
      const row = { ...(this.payload as Row) };
      if (this.table === 'magazine_subscribers') {
        const race = this.db.consumeRace();
        if (race) {
          rows.push({ id: this.db.nextId(), status: 'active', ...race });
          return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
        }
        const allowed = this.db.opts.sourceCheck;
        if (allowed && row.source && !allowed.includes(row.source)) {
          return { data: null, error: { code: '23514', message: 'violates check constraint' } };
        }
        const dup = rows.some(
          (r) =>
            r.broker_id === row.broker_id &&
            ((row.phone_e164 && r.phone_e164 === row.phone_e164) ||
              (row.subscriber_email && r.subscriber_email && r.subscriber_email.toLowerCase() === String(row.subscriber_email).toLowerCase())),
        );
        if (dup) return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
        row.id = this.db.nextId();
      }
      rows.push(row);
      return { data: this.isSingle ? { id: row.id } : [{ id: row.id }], error: null };
    }

    // update
    const target = rows.filter((r) => this.filters.every((f) => f(r)));
    for (const r of target) Object.assign(r, this.payload);
    return { data: this.wantRows ? target.map((r) => ({ id: r.id })) : null, error: null };
  }
}
