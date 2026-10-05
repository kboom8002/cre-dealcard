/**
 * 테스트 전용 schema-aware 가짜 Supabase (send-* 테스트 공용).
 * - 운영 스키마(2026-10 스냅샷 + 마이그레이션 000005/000006 적용 후)에 없는 컬럼을 select/filter/insert 하면
 *   PostgREST와 같이 42703 에러를 돌려준다 → 존재하지 않는 컬럼(email, interest_tags 등)을 mock으로 통과시키던 구 테스트의 결함(D2-24)을 막는다.
 * - 원장(magazine_dispatch_logs)은 idempotency_key unique, 테이블 미존재 시뮬레이션(ledgerMissing) 지원.
 */

export const TEST_SCHEMA: Record<string, readonly string[]> = {
  magazine_subscribers: [
    'id', 'broker_id', 'subscriber_phone', 'subscriber_email', 'subscriber_name', 'channel', 'status', 'source',
    'subscribed_at', 'unsubscribed_at', 'metadata', 'created_at', 'client_id', 'segment', 'interest_profile',
    // 마이그레이션 20261004000006 적용 후
    'broker_user_id', 'privacy_consent_at', 'marketing_consent_at', 'consent_version', 'consent_channel', 'night_consent',
    'consent_ip_hash', 'confirm_status', 'confirm_token_hash', 'reconfirm_due_at', 'phone_e164', 'age_confirmed',
  ],
  broker_profiles: ['id', 'user_id', 'slug', 'name', 'contact_email', 'specialty_regions', 'specialty_assets'],
  profiles: ['id', 'role', 'display_name', 'phone', 'company'],
  user_subscriptions: ['id', 'user_id', 'tier', 'status'],
  activity_events: ['id', 'actor_id', 'actor_role', 'event_type', 'entity_type', 'metadata', 'created_at'],
  magazine_dispatch_logs: [
    'id', 'idempotency_key', 'edition_id', 'broker_id', 'broker_user_id', 'subscriber_id', 'channel', 'kind', 'status',
    'blocked_reason', 'provider_msg_id', 'error', 'recipient_hash', 'created_at',
  ],
  magazine_editions: ['id', 'broker_id', 'edition_type', 'edition_label', 'status', 'title', 'content'],
  magazine_cron_runs: ['id', 'run_id', 'broker_id', 'broker_user_id', 'issue_date', 'kind', 'status', 'reason', 'duration_ms', 'created_at'],
};

type Row = Record<string, unknown>;
type DbError = { code: string; message: string } | null;

interface State {
  op: 'select' | 'insert' | 'upsert' | 'update' | null;
  row?: Row;
  patch?: Row;
  opts?: { onConflict?: string; ignoreDuplicates?: boolean };
  selectCols?: string;
  count?: boolean;
  head?: boolean;
  filters: Array<{ col: string; test: (v: unknown) => boolean }>;
  limit?: number;
}

export class FakeDb {
  tables: Record<string, Row[]> = {};
  clock: Date = new Date();
  ledgerMissing = false;
  /** from(table) 호출 기록 */
  fromCalls: string[] = [];
  private seq = 0;

  constructor(seed: Record<string, Row[]> = {}) {
    for (const [t, rows] of Object.entries(seed)) this.tables[t] = rows.map((r) => ({ ...r }));
  }

  rows(table: string): Row[] {
    return (this.tables[table] ??= []);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(table: string): any {
    this.fromCalls.push(table);
    const state: State = { op: null, filters: [] };
    const db = this;
    const q: Record<string, unknown> = {
      insert(row: Row) { state.op = 'insert'; state.row = row; return q; },
      upsert(row: Row, opts?: State['opts']) { state.op = 'upsert'; state.row = row; state.opts = opts; return q; },
      update(patch: Row) { state.op = 'update'; state.patch = patch; return q; },
      select(cols?: string, opts?: { count?: string; head?: boolean }) {
        if (!state.op) state.op = 'select';
        state.selectCols = cols;
        state.count = opts?.count === 'exact';
        state.head = opts?.head;
        return q;
      },
      eq(col: string, v: unknown) { state.filters.push({ col, test: (x) => x === v }); return q; },
      in(col: string, vs: unknown[]) { state.filters.push({ col, test: (x) => vs.includes(x) }); return q; },
      gte(col: string, v: string) { state.filters.push({ col, test: (x) => new Date(String(x)).getTime() >= new Date(v).getTime() }); return q; },
      limit(n: number) { state.limit = n; return q; },
      single() { return Promise.resolve(db.exec(table, state, 'single')); },
      maybeSingle() { return Promise.resolve(db.exec(table, state, 'maybe')); },
      then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
        return Promise.resolve(db.exec(table, state, 'many')).then(resolve, reject);
      },
    };
    return q;
  }

  private exec(table: string, s: State, mode: 'single' | 'maybe' | 'many') {
    const err = (code: string, message: string) => ({ data: null, error: { code, message } as DbError, count: null });
    if (table === 'magazine_dispatch_logs' && this.ledgerMissing) {
      return err('42P01', 'relation "public.magazine_dispatch_logs" does not exist');
    }
    const schema = TEST_SCHEMA[table];
    if (!schema) return err('42P01', `relation "${table}" does not exist`);
    const bad = (cols: string[]) => cols.find((c) => c !== '*' && !schema.includes(c));

    if (s.selectCols) {
      const b = bad(s.selectCols.split(',').map((c) => c.trim()).filter(Boolean));
      if (b) return err('42703', `column ${table}.${b} does not exist`);
    }
    const bf = bad(s.filters.map((f) => f.col));
    if (bf) return err('42703', `column ${table}.${bf} does not exist`);
    for (const r of [s.row, s.patch]) {
      const bk = r ? bad(Object.keys(r)) : undefined;
      if (bk) return err('42703', `column ${table}.${bk} does not exist`);
    }

    const rows = this.rows(table);
    const match = (r: Row) => s.filters.every((f) => f.test(r[f.col]));
    const finish = (list: Row[]) => {
      if (mode === 'many') return { data: list, error: null, count: list.length };
      if (list.length === 0) {
        return mode === 'single' ? err('PGRST116', 'no rows') : { data: null, error: null, count: 0 };
      }
      return { data: list[0], error: null, count: list.length };
    };
    const project = (r: Row): Row => {
      if (!s.selectCols || s.selectCols.trim() === '*') return { ...r };
      const out: Row = {};
      for (const c of s.selectCols.split(',').map((x) => x.trim()).filter(Boolean)) out[c] = r[c];
      return out;
    };

    if (s.op === 'insert' || s.op === 'upsert') {
      const row = s.row as Row;
      if (table === 'magazine_dispatch_logs' && rows.some((r) => r.idempotency_key === row.idempotency_key)) {
        if (s.op === 'upsert' && s.opts?.ignoreDuplicates) return { data: [], error: null, count: 0 };
        return err('23505', 'duplicate key value violates unique constraint "magazine_dispatch_logs_idempotency_key_key"');
      }
      const stored: Row = { id: `row-${++this.seq}`, created_at: this.clock.toISOString(), ...row };
      rows.push(stored);
      if (!s.selectCols) return { data: null, error: null, count: 1 };
      return finish([project(stored)]);
    }
    if (s.op === 'update') {
      const hit = rows.filter(match);
      for (const r of hit) Object.assign(r, s.patch);
      if (!s.selectCols) return { data: null, error: null, count: hit.length };
      return finish(hit.map(project));
    }
    // select
    const list = rows.filter(match);
    const limited = s.limit ? list.slice(0, s.limit) : list;
    if (s.head) return { data: null, error: null, count: list.length };
    const res = finish(limited.map(project));
    return s.count ? { ...res, count: list.length } : res;
  }
}

export const SUB_ID = '11111111-1111-4111-8111-111111111111';
export const SUB_ID_2 = '22222222-2222-4222-8222-222222222222';
export const BROKER_USER_ID = '99999999-9999-4999-8999-999999999999';

/** 동의·확인이 끝난 정상 구독자 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function consentedSubscriber(over: Row = {}): any {
  return {
    id: SUB_ID,
    broker_id: 'kim-broker',
    subscriber_name: '홍길동',
    subscriber_phone: '010-1234-5678',
    subscriber_email: 'hong@example.com',
    channel: 'both',
    segment: 'investor',
    status: 'active',
    interest_profile: { tags: { regions: ['강남'], assetTypes: ['꼬마빌딩'] } },
    marketing_consent_at: '2026-09-01T00:00:00.000Z',
    confirm_status: 'confirmed',
    night_consent: false,
    unsubscribed_at: null,
    client_id: null,
    ...over,
  };
}

/** 10:00 KST 화요일(주간 발송 가능 시각) / 22:00 KST(야간 금지) */
export const DAYTIME = new Date('2026-10-06T01:00:00.000Z');
export const NIGHT = new Date('2026-10-06T13:00:00.000Z');
