import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';

// ── Shared mock hooks for route tests ──
const mockState = vi.hoisted(() => ({
  serviceClient: null as unknown,
  sentEmails: [] as Array<Record<string, unknown>>,
  sendShouldThrow: false,
  brokerAuth: {
    user: { id: '11111111-1111-4111-8111-111111111111' },
    error: null as unknown,
  },
  brokerContext: {
    userId: '11111111-1111-4111-8111-111111111111',
    slug: 'broker-kim',
    brokerKeys: ['broker-kim', '11111111-1111-4111-8111-111111111111'],
    displayName: '김공인',
    email: 'kim@example.com',
  },
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => mockState.serviceClient,
}));

vi.mock('@/lib/auth-guard', () => ({
  requireBroker: async () => mockState.brokerAuth,
}));

vi.mock('resend', () => ({
  Resend: class MockResend {
    emails = {
      send: async (msg: Record<string, unknown>) => {
        if (mockState.sendShouldThrow) throw new Error('Resend unavailable');
        mockState.sentEmails.push(msg);
        return { data: { id: `mock-msg-${mockState.sentEmails.length}` }, error: null };
      },
    };
  },
}));

vi.mock('@/lib/magazine/authz', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/magazine/authz')>();
  return {
    ...actual,
    requireBrokerContext: async () => ({ ok: true, ctx: mockState.brokerContext }),
  };
});

vi.mock('@/lib/magazine/resolve-broker', () => ({
  resolveBroker: async () => ({
    userId: '11111111-1111-4111-8111-111111111111',
    slug: 'broker-kim',
    displayName: '김공인',
    company: '김공인중개사무소',
    phone: '010-1234-5678',
    tagline: '강남 오피스 전문',
    photoUrl: null,
    specialtyRegions: ['강남/서초'],
    specialtyAssets: ['오피스'],
  }),
}));

vi.mock('@/lib/legal/publish-gate', () => ({
  assertPublishable: async () => ({ ok: true }),
}));

vi.mock('@/lib/im-lite/quick-generate-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/im-lite/quick-generate-store')>();
  return {
    ...actual,
    listAllQuickImRecords: async () => [],
    resolveOrSynthesizeQuickImRecord: async () => null,
  };
});

import { confirmOptIn, recordOptIn } from '@/domain/magazine/consent-service';
import type { ValidatedSubscribeInput } from '@/domain/magazine/subscriber-consent-types';
import { hashEmailForSuppression } from '@/lib/legal/email-suppression';
import { GET as reconfirmCronGet } from '@/app/api/cron/consent-reconfirm-2yr/route';
import {
  GET as retentionPurgeGet,
  PERMANENT_COMPLIANCE_EVENT_TYPES,
} from '@/app/api/cron/retention-purge/route';
import {
  buildApiErrorStatusBanner,
  normalizeEditorSections,
  resolveMagazineQueryAction,
} from '@/app/(broker)/broker/magazine-editor/_components/magazine-workspace-types';
import { enqueueMagazineDispatch, processMagazineDispatchQueueBatch } from '@/domain/magazine/distribute-queue';
import { hashRecipient, normalizeRecipient } from '@/domain/magazine/send-gate';
import { computeVisitorHash } from '@/lib/magazine/visitor-hash';
import { hashIp } from '@/lib/magazine/pii';
import { POST as issuesPost } from '@/app/api/magazine/issues/route';
import { GET as draftGet } from '@/app/api/magazine/editions/draft/route';
import { POST as subscribersPost } from '@/app/api/broker/magazine/subscribers/route';
import { PATCH as preferencesPatch } from '@/app/api/broker/magazine/preferences/route';
import { MagazineView } from '@/app/(magazine)/magazine/[brokerId]/[date]/magazine-view';

type Row = Record<string, unknown>;

function makeInMemoryDb(seed: Record<string, Row[]> = {}, opts?: {
  missingColumnOnTable?: { table: string; column: string };
  failUpdateTables?: Set<string>;
  failUpsertTables?: Set<string>;
}) {
  const tables: Record<string, Row[]> = {
    magazine_subscribers: [],
    email_suppressions: [],
    broker_clients: [],
    broker_profiles: [],
    magazine_cron_runs: [],
    magazine_dispatch_logs: [],
    activity_events: [],
    magazine_editions: [],
    magazine_issues: [],
    party: [],
    buyer_condition: [],
    track_event: [],
    document_objects: [],
    ...seed,
  };
  const calls: Array<{ table: string; op: string; payload?: unknown; filters?: unknown[] }> = [];
  let seq = 1;

  const cloneRows = (list: Row[]) => list.map((r) => ({ ...r }));

  const execQuery = (
    table: string,
    op: string,
    payload: unknown,
    filters: Array<{ kind: string; col?: string; val?: unknown; fn: (r: Row) => boolean }>,
    wantRows: boolean,
    isSingle: boolean,
    selectCols: string,
    ignoreDuplicates: boolean,
    limitCount: number,
  ): { data: unknown; error: { code?: string; message?: string } | null; count?: number } => {
    calls.push({ table, op, payload, filters: filters.map((f) => ({ kind: f.kind, col: f.col, val: f.val })) });
    const rows = (tables[table] ??= []);

    if (
      opts?.missingColumnOnTable?.table === table &&
      ((typeof selectCols === 'string' && selectCols.includes(opts.missingColumnOnTable.column)) ||
        (payload && typeof payload === 'object' && opts.missingColumnOnTable.column in (payload as Row)))
    ) {
      return {
        data: null,
        error: {
          code: '42703',
          message: `column "${opts.missingColumnOnTable.column}" of relation "${table}" does not exist`,
        },
      };
    }

    if (op === 'select') {
      const matched = cloneRows(rows.filter((r) => filters.every((f) => f.fn(r)))).slice(0, limitCount);
      if (isSingle) return { data: matched[0] ?? null, error: null };
      return { data: matched, error: null };
    }

    if (op === 'insert') {
      const items = Array.isArray(payload) ? (payload as Row[]) : [payload as Row];
      for (const item of items) {
        if (table === 'magazine_dispatch_logs' && item.idempotency_key) {
          const dup = rows.some((r) => r.idempotency_key === item.idempotency_key);
          if (dup) return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
        }
        const inserted = {
          id: `00000000-0000-4000-8000-${String(seq++).padStart(12, '0')}`,
          created_at: new Date().toISOString(),
          ...item,
        };
        rows.push(inserted);
      }
      const added = rows.slice(-items.length);
      return { data: isSingle ? added[0] : added, error: null };
    }

    if (op === 'upsert') {
      if (opts?.failUpsertTables?.has(table)) {
        return { data: null, error: { code: '23502', message: `${table} write failed` } };
      }
      const items = Array.isArray(payload) ? (payload as Row[]) : [payload as Row];
      const out: Row[] = [];
      for (const item of items) {
        const existingIdx =
          item.idempotency_key
            ? rows.findIndex((r) => r.idempotency_key === item.idempotency_key)
            : -1;
        if (existingIdx >= 0) {
          if (!ignoreDuplicates) Object.assign(rows[existingIdx], item);
          if (!ignoreDuplicates) out.push({ ...rows[existingIdx] });
        } else {
          const inserted = {
            id: `00000000-0000-4000-8000-${String(seq++).padStart(12, '0')}`,
            created_at: new Date().toISOString(),
            ...item,
          };
          rows.push(inserted);
          out.push({ ...inserted });
        }
      }
      return { data: out, error: null };
    }

    if (op === 'update') {
      if (opts?.failUpdateTables?.has(table)) {
        return { data: null, error: { code: '50000', message: `${table} update failed` } };
      }
      const matched = rows.filter((r) => filters.every((f) => f.fn(r)));
      for (const r of matched) Object.assign(r, payload as Row);
      const out = wantRows ? cloneRows(matched) : null;
      return { data: isSingle ? (matched[0] ?? null) : out, error: null };
    }

    if (op === 'delete') {
      const kept: Row[] = [];
      let deleted = 0;
      for (const r of rows) {
        if (filters.every((f) => f.fn(r))) deleted += 1;
        else kept.push(r);
      }
      tables[table] = kept;
      return { data: null, error: null, count: deleted };
    }

    return { data: null, error: null };
  };

  const makeBuilder = (table: string) => {
    let op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
    let payload: unknown = null;
    let wantRows = false;
    let isSingle = false;
    let selectCols = '*';
    let ignoreDuplicates = false;
    let limitCount = Infinity;
    const filters: Array<{ kind: string; col?: string; val?: unknown; fn: (r: Row) => boolean }> = [];

    const builder: Record<string, unknown> = {
      select(cols = '*') {
        selectCols = cols;
        wantRows = true;
        return builder;
      },
      insert(row: unknown) {
        op = 'insert';
        payload = row;
        return builder;
      },
      upsert(row: unknown, uOpts?: { ignoreDuplicates?: boolean }) {
        op = 'upsert';
        payload = row;
        ignoreDuplicates = Boolean(uOpts?.ignoreDuplicates);
        return builder;
      },
      update(patch: unknown) {
        op = 'update';
        payload = patch;
        return builder;
      },
      delete() {
        op = 'delete';
        return builder;
      },
      eq(col: string, val: unknown) {
        filters.push({ kind: 'eq', col, val, fn: (r) => r[col] === val });
        return builder;
      },
      neq(col: string, val: unknown) {
        filters.push({ kind: 'neq', col, val, fn: (r) => r[col] !== val });
        return builder;
      },
      in(col: string, vals: unknown[]) {
        filters.push({ kind: 'in', col, val: vals, fn: (r) => vals.includes(r[col]) });
        return builder;
      },
      not(col: string, _op: string, _val: unknown) {
        filters.push({ kind: 'not', col, val: _val, fn: () => true });
        return builder;
      },
      is(col: string, val: unknown) {
        filters.push({ kind: 'is', col, val, fn: (r) => (r[col] ?? null) === val });
        return builder;
      },
      or(_expr: string) {
        filters.push({ kind: 'or', col: '_or', val: _expr, fn: () => true });
        return builder;
      },
      lt(col: string, val: string) {
        filters.push({
          kind: 'lt',
          col,
          val,
          fn: (r) => typeof r[col] === 'string' && String(r[col]) < val,
        });
        return builder;
      },
      lte(col: string, val: string) {
        filters.push({
          kind: 'lte',
          col,
          val,
          fn: (r) => typeof r[col] === 'string' && String(r[col]) <= val,
        });
        return builder;
      },
      gt(col: string, val: string) {
        filters.push({
          kind: 'gt',
          col,
          val,
          fn: (r) => typeof r[col] === 'string' && String(r[col]) > val,
        });
        return builder;
      },
      gte(col: string, val: string) {
        filters.push({
          kind: 'gte',
          col,
          val,
          fn: (r) => typeof r[col] === 'string' && String(r[col]) >= val,
        });
        return builder;
      },
      ilike(col: string, pattern: string) {
        const needle = pattern.replace(/\\([\\%_])/g, '$1').toLowerCase();
        filters.push({
          kind: 'ilike',
          col,
          val: needle,
          fn: (r) => typeof r[col] === 'string' && String(r[col]).toLowerCase() === needle,
        });
        return builder;
      },
      order() {
        return builder;
      },
      range(from: number, to: number) {
        limitCount = Math.max(0, to - from + 1);
        return builder;
      },
      limit(n: number) {
        limitCount = n;
        return builder;
      },
      single() {
        isSingle = true;
        return builder;
      },
      maybeSingle() {
        isSingle = true;
        return builder;
      },
      then<T1, T2>(
        onfulfilled?: ((value: unknown) => T1 | PromiseLike<T1>) | null,
        onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
      ) {
        const res = execQuery(table, op, payload, filters, wantRows, isSingle, selectCols, ignoreDuplicates, limitCount);
        return Promise.resolve(res).then(onfulfilled, onrejected);
      },
    };
    return builder;
  };

  return {
    tables,
    calls,
    from: (table: string) => makeBuilder(table),
    rpc: async () => ({ data: 0, error: null }),
  };
}

function makeSubscribeInput(overrides: Partial<ValidatedSubscribeInput> = {}): ValidatedSubscribeInput {
  return {
    brokerParam: 'broker-kim',
    name: '홍길동',
    phone: '01012345678',
    phoneE164: '+821012345678',
    email: 'hong@example.com',
    channel: 'email',
    tags: [],
    referrer: null,
    source: 'magazine',
    consent: { privacy: true, marketing: true, age14: true, night: false },
    ...overrides,
  };
}

describe('WP-7.1B Newsletter P0/P1 Remediation', () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    vi.useRealTimers();
    mockState.sentEmails = [];
    mockState.sendShouldThrow = false;
    process.env.CRON_SECRET = 'test-cron-secret-1234567890';
    process.env.MAGAZINE_SID_SECRET = 'test-sid-secret-1234567890';
    process.env.UNSUBSCRIBE_SECRET = 'test-unsub-secret-1234567890';
    process.env.RESEND_API_KEY = 're_test_123';
    process.env.NEXT_PUBLIC_SITE_URL = 'https://credeal.net';
    process.env.APP_BASE_URL = 'https://credeal.net';
    process.env.MAGAZINE_SEND_ENABLED = 'true';
    process.env.MAGAZINE_SEND_DRY_RUN = 'false';
    delete process.env.MAGAZINE_SEND_ALLOWLIST;
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env = { ...origEnv };
  });

  // ── 1. confirmOptIn() clears broker 'unsubscribe' while preserving 'hard_bounce'/'complaint'/'global' ──
  it('1) confirmOptIn clears broker unsubscribe suppression and sets consent_status=confirmed, preserving bounce/complaint/global', async () => {
    const brokerUuid = '11111111-1111-4111-8111-111111111111';
    const userEmail = 'resub@example.com';
    const otherEmail = 'bounced@example.com';
    const userHash = hashEmailForSuppression(userEmail);
    const otherHash = hashEmailForSuppression(otherEmail);

    const db = makeInMemoryDb({
      email_suppressions: [
        { id: 'sup-unsub', email_hash: userHash, scope: 'broker', broker_id: brokerUuid, reason: 'unsubscribe' },
        { id: 'sup-bounce', email_hash: userHash, scope: 'broker', broker_id: brokerUuid, reason: 'hard_bounce' },
        { id: 'sup-complaint', email_hash: userHash, scope: 'broker', broker_id: brokerUuid, reason: 'complaint' },
        { id: 'sup-global', email_hash: userHash, scope: 'global', broker_id: null, reason: 'unsubscribe' },
        { id: 'sup-other', email_hash: otherHash, scope: 'broker', broker_id: brokerUuid, reason: 'unsubscribe' },
      ],
      magazine_subscribers: [
        {
          id: 'sub-unsub',
          broker_id: 'broker-kim',
          broker_user_id: brokerUuid,
          subscriber_email: userEmail,
          subscriber_phone: '01011112222',
          phone_e164: '+821011112222',
          status: 'unsubscribed',
          unsubscribed_at: '2026-10-01T00:00:00Z',
          confirm_status: 'confirmed',
          consent_status: 'unsubscribed',
        },
      ],
    });

    const optIn = await recordOptIn(db, {
      brokerSlug: 'broker-kim',
      brokerUserId: brokerUuid,
      input: makeSubscribeInput({ email: userEmail, phone: '01011112222', phoneE164: '+821011112222' }),
      ipHash: 'iphash123',
      now: new Date('2026-11-18T02:00:00Z'),
    });
    expect(optIn.ok).toBe(true);
    if (!optIn.ok || !optIn.confirmToken) throw new Error('expected confirmToken');

    const confirmed = await confirmOptIn(db, {
      token: optIn.confirmToken,
      brokerSlug: 'broker-kim',
      now: new Date('2026-11-18T02:05:00Z'),
    });
    expect(confirmed).toEqual({
      ok: true,
      subscriberId: 'sub-unsub',
      reactivated: true,
      alreadyConfirmed: false,
    });

    const subRow = db.tables.magazine_subscribers[0];
    expect(subRow.consent_status).toBe('confirmed');
    expect(subRow.confirm_status).toBe('confirmed');
    expect(subRow.consented_at).toBe('2026-11-18T02:05:00.000Z');
    expect(subRow.status).toBe('active');
    expect(subRow.unsubscribed_at).toBeNull();

    // broker + unsubscribe cleared; hard_bounce, complaint, global, and other subscriber preserved
    const remainingIds = db.tables.email_suppressions.map((r) => r.id);
    expect(remainingIds).not.toContain('sup-unsub');
    expect(remainingIds).toEqual(expect.arrayContaining(['sup-bounce', 'sup-complaint', 'sup-global', 'sup-other']));
  });

  // ── 2. recordOptIn() writes consent_status: 'pending' and handles pre-cutover schema fallback ──
  it('2) recordOptIn explicitly writes consent_status=pending and falls back if pre-cutover column is missing', async () => {
    const db = makeInMemoryDb();
    const res = await recordOptIn(db, {
      brokerSlug: 'broker-kim',
      brokerUserId: '11111111-1111-4111-8111-111111111111',
      input: makeSubscribeInput({ email: 'new@example.com' }),
      ipHash: 'iphash',
      now: new Date('2026-11-18T01:00:00Z'),
    });
    expect(res.ok).toBe(true);
    expect(db.tables.magazine_subscribers[0].consent_status).toBe('pending');
    expect(db.tables.magazine_subscribers[0].confirm_status).toBe('pending');

    // Pre-cutover DB where consent_status column does not exist yet
    const preCutoverDb = makeInMemoryDb(
      {},
      { missingColumnOnTable: { table: 'magazine_subscribers', column: 'consent_status' } },
    );
    const fallbackRes = await recordOptIn(preCutoverDb, {
      brokerSlug: 'broker-kim',
      input: makeSubscribeInput({ email: 'legacy@example.com' }),
      ipHash: 'iphash',
    });
    expect(fallbackRes.ok).toBe(true);
    expect(preCutoverDb.tables.magazine_subscribers).toHaveLength(1);
    expect('consent_status' in preCutoverDb.tables.magazine_subscribers[0]).toBe(false);
  });

  // ── 3. consent-reconfirm-2yr skips bounced/complained/suppressed emails, enforces quiet hours & idempotency ──
  it('3) consent-reconfirm-2yr skips bounced/complained/suppressed emails, enforces KST quiet hours, and dedupes via ledger', async () => {
    const brokerUuid = '11111111-1111-4111-8111-111111111111';
    const oldConsent = '2024-01-01T00:00:00Z';
    const suppressedHash = hashEmailForSuppression('suppressed@example.com');

    const db = makeInMemoryDb({
      email_suppressions: [
        { id: 'sup-1', email_hash: suppressedHash, scope: 'broker', broker_id: brokerUuid, reason: 'complaint' },
      ],
      magazine_subscribers: [
        {
          id: '22222222-2222-4222-8222-222222222221',
          broker_id: 'broker-kim',
          broker_user_id: brokerUuid,
          subscriber_email: 'bounced@example.com',
          subscriber_name: '반송자',
          marketing_consent_at: oldConsent,
          reconfirm_notified_at: null,
          confirm_status: 'confirmed',
          status: 'active',
          unsubscribed_at: null,
          consent_status: 'confirmed',
          email_delivery_status: 'bounced',
        },
        {
          id: '22222222-2222-4222-8222-222222222222',
          broker_id: 'broker-kim',
          broker_user_id: brokerUuid,
          subscriber_email: 'complained@example.com',
          subscriber_name: '신고자',
          marketing_consent_at: oldConsent,
          reconfirm_notified_at: null,
          confirm_status: 'confirmed',
          status: 'active',
          unsubscribed_at: null,
          consent_status: 'confirmed',
          email_delivery_status: 'complained',
        },
        {
          id: '22222222-2222-4222-8222-222222222223',
          broker_id: 'broker-kim',
          broker_user_id: brokerUuid,
          subscriber_email: 'suppressed@example.com',
          subscriber_name: '차단자',
          marketing_consent_at: oldConsent,
          reconfirm_notified_at: null,
          confirm_status: 'confirmed',
          status: 'active',
          unsubscribed_at: null,
          consent_status: 'confirmed',
          email_delivery_status: 'ok',
        },
        {
          id: '22222222-2222-4222-8222-222222222224',
          broker_id: 'broker-kim',
          broker_user_id: brokerUuid,
          subscriber_email: 'eligible@example.com',
          subscriber_name: '대상자',
          marketing_consent_at: oldConsent,
          reconfirm_notified_at: null,
          confirm_status: 'confirmed',
          status: 'active',
          unsubscribed_at: null,
          consent_status: 'confirmed',
          email_delivery_status: 'ok',
        },
      ],
    });
    mockState.serviceClient = db;

    // 3a) Quiet hours: 2026-11-18T14:00:00Z = 23:00 KST -> live send skipped without burning daily slot
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-18T14:00:00Z'));
    const quietRes = await reconfirmCronGet(
      new NextRequest('https://credeal.net/api/cron/consent-reconfirm-2yr', {
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      }),
    );
    const quietJson = await quietRes.json();
    expect(quietJson.skipped).toBe('QUIET_HOURS_KST');
    expect(mockState.sentEmails).toHaveLength(0);

    // 3b) Daytime: 2026-11-18T02:00:00Z = 11:00 KST -> only eligible@example.com receives email
    vi.setSystemTime(new Date('2026-11-18T02:00:00Z'));
    const dayRes = await reconfirmCronGet(
      new NextRequest('https://credeal.net/api/cron/consent-reconfirm-2yr', {
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      }),
    );
    const dayJson = await dayRes.json();
    expect(dayJson.ok).toBe(true);
    expect(dayJson.notified).toBe(1);
    expect(dayJson.skippedSuppressed).toBe(1);
    expect(mockState.sentEmails).toHaveLength(1);
    expect(mockState.sentEmails[0].to).toBe('eligible@example.com');

    // Ledger row persisted with hashed recipient
    const ledger = db.tables.magazine_dispatch_logs;
    expect(ledger).toHaveLength(1);
    expect(ledger[0].status).toBe('sent');
    expect(ledger[0].recipient_hash).toBe(hashRecipient(normalizeRecipient('eligible@example.com')));

    // 3c) Re-run same day -> daily slot blocks duplicate send
    const rerunRes = await reconfirmCronGet(
      new NextRequest('https://credeal.net/api/cron/consent-reconfirm-2yr', {
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      }),
    );
    const rerunJson = await rerunRes.json();
    expect(rerunJson.skipped).toBe('IDEMPOTENCY_SLOT_ALREADY_ACQUIRED');
    expect(mockState.sentEmails).toHaveLength(1);
  });

  // ── 4. field_note persistence, issues 500 error propagation, & retention-purge KST + exemptions ──
  it('4) field_note persists across issues POST & normalizeEditorSections; retention-purge exempts compliance events and uses KST date', async () => {
    const sections = normalizeEditorSections(
      [
        { id: 'field_note', enabled: false },
        { id: 'ai_briefing', enabled: true },
        { id: 'market_data', enabled: false },
      ],
      'monthly',
    );
    const fieldNoteSection = sections?.find((s) => s.id === 'field_note');
    expect(fieldNoteSection?.enabled).toBe(true);

    // Check POST /api/magazine/issues preserves field_note.enabled=true AND fails honestly on magazine_issues upsert error
    const edId = '33333333-3333-4333-8333-333333333333';
    const issuesDb = makeInMemoryDb(
      {
        magazine_editions: [
          {
            id: edId,
            broker_id: 'broker-kim',
            broker_user_id: mockState.brokerContext.userId,
            edition_type: 'monthly',
            edition_number: 11,
            slug: '2026-11',
            status: 'draft',
            published_at: null,
          },
        ],
        broker_profiles: [
          { user_id: mockState.brokerContext.userId, slug: 'broker-kim', display_name: '김공인', company: '김공인중개사무소' },
        ],
        profiles: [
          { id: mockState.brokerContext.userId, display_name: '김공인', phone: '010-1234-5678', company: '김공인중개사무소' },
        ],
      },
      { failUpsertTables: new Set(['magazine_issues']) },
    );
    mockState.serviceClient = issuesDb;

    const failPubRes = await issuesPost(
      new NextRequest('https://credeal.net/api/magazine/issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          editionId: edId,
          editionType: 'monthly',
          headline: '2026년 11월 강남 오피스 리포트',
          briefingBody: '이번 달 강남권 임차 수요가 꾸준히 이어지고 있습니다.',
          sections: [{ id: 'field_note', enabled: true }],
          featuredDealIds: [],
          saveAsDraft: false,
        }),
      }),
    );
    expect(failPubRes.status).toBe(500);
    // Reverted draft status after magazine_issues failure
    expect(issuesDb.tables.magazine_editions[0].status).toBe('draft');

    // Happy path: magazine_issues succeeds -> field_note.enabled persisted as true
    const okDb = makeInMemoryDb({
      magazine_editions: [
        {
          id: edId,
          broker_id: 'broker-kim',
          broker_user_id: mockState.brokerContext.userId,
          edition_type: 'monthly',
          edition_number: 11,
          slug: '2026-11',
          status: 'draft',
          published_at: null,
        },
      ],
      broker_profiles: [
        { user_id: mockState.brokerContext.userId, slug: 'broker-kim', display_name: '김공인', company: '김공인중개사무소' },
      ],
      profiles: [
        { id: mockState.brokerContext.userId, display_name: '김공인', phone: '010-1234-5678', company: '김공인중개사무소' },
      ],
    });
    mockState.serviceClient = okDb;
    const okPubRes = await issuesPost(
      new NextRequest('https://credeal.net/api/magazine/issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          editionId: edId,
          editionType: 'monthly',
          headline: '2026년 11월 강남 오피스 리포트',
          briefingBody: '이번 달 강남권 임차 수요가 꾸준히 이어지고 있습니다.',
          sections: [{ id: 'field_note', enabled: true }],
          featuredDealIds: [],
          saveAsDraft: false,
        }),
      }),
    );
    expect(okPubRes.status).toBe(200);
    const okJson = await okPubRes.json();
    const savedFieldNote = (okJson.content.sections as Array<{ id: string; enabled: boolean }>).find(
      (s) => s.id === 'field_note',
    );
    expect(savedFieldNote?.enabled).toBe(true);

    // Retention purge exemptions + KST cutoff across midnight UTC boundary (2026-11-17T16:30Z == 2026-11-18 KST)
    expect(PERMANENT_COMPLIANCE_EVENT_TYPES).toEqual(
      expect.arrayContaining([
        'email_complained',
        'thread_link_restored',
        'consent_reconfirm_notified',
      ]),
    );
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-17T16:30:00Z'));
    const purgeDb = makeInMemoryDb();
    mockState.serviceClient = purgeDb;
    const purgeRes = await retentionPurgeGet(
      new NextRequest('https://credeal.net/api/cron/retention-purge', {
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      }),
    );
    expect(purgeRes.status).toBe(200);
    const cronRun = purgeDb.tables.magazine_cron_runs[0];
    expect(cronRun.run_id).toBe('cron_slot:retention-purge:2026-11-18');
    const partySelect = purgeDb.calls.find((c) => c.table === 'party' && c.op === 'select');
    expect(partySelect?.filters).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'lt', col: 'retention_until', val: '2026-11-18' })]),
    );
  });

  // ── 5. distribute-queue strips raw PII from payload JSONB + worker hydrates from magazine_subscribers ──
  it('5) distribute-queue stores no raw email/phone/name in payload JSONB and worker hydrates subscriber at send time', async () => {
    const brokerUuid = '11111111-1111-4111-8111-111111111111';
    const subId = '44444444-4444-4444-8444-444444444444';
    const edId = '55555555-5555-4555-8555-555555555555';
    const db = makeInMemoryDb({
      broker_profiles: [{ user_id: brokerUuid, slug: 'broker-kim', contact_email: 'kim@example.com' }],
      profiles: [{ id: brokerUuid, display_name: '김공인', phone: '010-1234-5678' }],
      magazine_subscribers: [
        {
          id: subId,
          broker_id: 'broker-kim',
          broker_user_id: brokerUuid,
          subscriber_name: '김구독',
          subscriber_email: 'vip-reader@example.com',
          subscriber_phone: '01099998888',
          channel: 'email',
          status: 'active',
          confirm_status: 'confirmed',
          unsubscribed_at: null,
          marketing_consent_at: '2026-10-01T00:00:00Z',
          night_consent: false,
          segment: 'all',
        },
      ],
    });

    const qRes = await enqueueMagazineDispatch(
      db as never,
      'broker-kim',
      {
        id: edId,
        title: '11월 주간 뉴스레터',
        headline: '강남 공실률 하락',
        date: '2026-11-18',
        target: 'all',
        editionType: 'weekly',
      },
      { dryRun: true, now: new Date('2026-11-18T02:00:00Z') },
    );
    expect(qRes.ok).toBe(true);
    expect(qRes.queued).toBe(1);

    const queuedRow = db.tables.magazine_dispatch_logs[0];
    const payload = queuedRow.payload as Record<string, unknown>;
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain('vip-reader@example.com');
    expect(serialized).not.toContain('01099998888');
    expect(serialized).not.toContain('김구독');
    expect(payload).not.toHaveProperty('sub');
    expect(payload.subscriberId).toBe(subId);
    expect(payload.issueId).toBe(edId);
    expect(payload.brokerId).toBe('broker-kim');
    expect(payload.channel).toBe('email');

    const expectedRecipientHash = hashRecipient(normalizeRecipient('vip-reader@example.com'));
    expect(queuedRow.idempotency_key).toContain(expectedRecipientHash);

    // Worker hydrates subscriber from magazine_subscribers and executes dryRun sendGate
    const workerRes = await processMagazineDispatchQueueBatch(db as never, {
      now: new Date('2026-11-18T02:01:00Z'),
      gateDeps: { dryRun: true },
    });
    expect(workerRes.fetched).toBe(1);
    expect(workerRes.recorded).toBe(1);
    expect(workerRes.blocked).toBe(0);
  });

  // ── 6. Fail-closed production salts, honest preferences DB 500, and editor helpers ──
  it('6) fail-closed production salts in computeVisitorHash/hashIp, preferences 500 on DB failure, and editor query/422 helpers', async () => {
    delete process.env.MAGAZINE_SID_SECRET;
    delete process.env.CRON_SECRET;

    // Non-prod deterministic within process
    expect(computeVisitorHash('1.2.3.4', 'UA')).toBe(computeVisitorHash('1.2.3.4', 'UA'));
    expect(hashIp('1.2.3.4')).toMatch(/^[0-9a-f]{32}$/);

    // Production fail-closed without MAGAZINE_SID_SECRET
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    delete process.env.CI;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://prod-real.supabase.co';
    delete process.env.NEXT_PHASE;

    expect(() => computeVisitorHash('1.2.3.4', 'UA')).toThrow(/MAGAZINE_SID_SECRET_NOT_CONFIGURED/);
    expect(() => hashIp('1.2.3.4')).toThrow(/MAGAZINE_SID_SECRET_NOT_CONFIGURED/);

    // Preferences PATCH fails honestly with 500 on real DB error
    const failPrefsDb = makeInMemoryDb({}, { failUpdateTables: new Set(['broker_profiles']) });
    mockState.serviceClient = failPrefsDb;
    const prefRes = await preferencesPatch(
      new NextRequest('https://credeal.net/api/broker/magazine/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferredRegions: ['강남/서초'] }),
      }),
    );
    expect(prefRes.status).toBe(500);

    // Editor 422 missingLabels + query action helpers
    const banner = buildApiErrorStatusBanner(
      422,
      {
        error: { code: 'STATUTORY_DISCLOSURE_INCOMPLETE', message: '법정 필수 정보 누락' },
        missingLabels: ['사무소명', '대표 전화번호'],
      },
      'fallback',
    );
    expect(banner.profileCtaHref).toBe('/broker/profile');
    expect(banner.message).toContain('사무소명');
    expect(banner.message).toContain('대표 전화번호');

    expect(resolveMagazineQueryAction({ get: (k) => (k === 'deals' ? 'd1,d2' : null) })).toEqual({
      dealIds: ['d1', 'd2'],
      step: 'content',
    });
    expect(resolveMagazineQueryAction({ get: (k) => (k === 'tab' ? 'analytics' : null) })).toEqual({
      dealIds: [],
      insightsTab: 'analytics',
    });
  });

  // ── 7. Wave 7.2 P0-1: Quiet-hours retry preservation across 12 cron runs + 08:05 KST send ──
  it('7) processMagazineDispatchQueueBatch preserves retryable + attempt_count=0 across 12 quiet-hours runs and sends at 08:05 KST', async () => {
    const brokerUuid = '11111111-1111-4111-8111-111111111111';
    const subId = '44444444-4444-4444-8444-444444444445';
    const edId = '55555555-5555-4555-8555-555555555556';
    const db = makeInMemoryDb({
      broker_profiles: [{ user_id: brokerUuid, slug: 'broker-kim', contact_email: 'kim@example.com' }],
      profiles: [{ id: brokerUuid, display_name: '김공인', phone: '010-1234-5678' }],
      magazine_subscribers: [
        {
          id: subId,
          broker_id: 'broker-kim',
          broker_user_id: brokerUuid,
          subscriber_name: '김야간',
          subscriber_email: 'night-defer@example.com',
          subscriber_phone: '01088887777',
          channel: 'email',
          status: 'active',
          confirm_status: 'confirmed',
          unsubscribed_at: null,
          marketing_consent_at: '2026-10-01T00:00:00Z',
          night_consent: false,
          segment: 'all',
        },
      ],
    });

    const qRes = await enqueueMagazineDispatch(
      db as never,
      'broker-kim',
      {
        id: edId,
        title: '11월 야간 대기열 테스트',
        headline: '강남 공실률 하락',
        date: '2026-11-18',
        target: 'all',
        editionType: 'weekly',
      },
      { dryRun: false, now: new Date('2026-11-18T13:00:00Z') }, // 22:00 KST
    );
    expect(qRes.ok).toBe(true);
    expect(qRes.queued).toBe(1);

    // Run 12 consecutive batches during KST quiet hours (22:00 KST .. 06:15 KST)
    const startQuietUtc = Date.parse('2026-11-18T13:00:00Z');
    for (let i = 0; i < 12; i++) {
      const runNow = new Date(startQuietUtc + i * 45 * 60_000);
      const batch = await processMagazineDispatchQueueBatch(db as never, {
        now: runNow,
        gateDeps: { dryRun: false },
      });
      expect(batch.blocked).toBe(1);
      expect(batch.failed).toBe(0);
      expect(batch.sent).toBe(0);
      const queueRow = db.tables.magazine_dispatch_logs.find((r) => !String(r.idempotency_key).includes(':blocked:'))!;
      expect(queueRow.status).toBe('retryable');
      expect(queueRow.attempt_count).toBe(0);
      expect(queueRow.blocked_reason).toBe('QUIET_HOURS');
    }
    expect(mockState.sentEmails).toHaveLength(0);

    // At 08:05 KST (2026-11-18T23:05:00Z), quiet hours end -> deferred row sends cleanly
    const morningRes = await processMagazineDispatchQueueBatch(db as never, {
      now: new Date('2026-11-18T23:05:00Z'),
      gateDeps: { dryRun: false },
    });
    expect(morningRes.sent).toBe(1);
    expect(morningRes.blocked).toBe(0);
    expect(morningRes.failed).toBe(0);
    expect(mockState.sentEmails).toHaveLength(1);
    expect(mockState.sentEmails[0].to).toBe('night-defer@example.com');
    const sentRow = db.tables.magazine_dispatch_logs.find((r) => !String(r.idempotency_key).includes(':blocked:'))!;
    expect(sentRow.status).toBe('sent');
    expect(sentRow.attempt_count).toBe(1);

    // Pre-cutover schema missing blocked_reason column degrades gracefully on 42703
    const legacyDb = makeInMemoryDb(
      {
        broker_profiles: [{ user_id: brokerUuid, slug: 'broker-kim', contact_email: 'kim@example.com' }],
        profiles: [{ id: brokerUuid, display_name: '김공인', phone: '010-1234-5678' }],
        magazine_subscribers: [
          {
            id: subId,
            broker_id: 'broker-kim',
            broker_user_id: brokerUuid,
            subscriber_name: '김레거시',
            subscriber_email: 'legacy-q@example.com',
            channel: 'email',
            status: 'active',
            confirm_status: 'confirmed',
            marketing_consent_at: '2026-10-01T00:00:00Z',
            night_consent: false,
            segment: 'all',
          },
        ],
        magazine_dispatch_logs: [
          {
            id: 'legacy-row-1',
            idempotency_key: 'broker-kim:2026-11-18:weekly:legacy',
            edition_id: edId,
            broker_id: 'broker-kim',
            broker_user_id: brokerUuid,
            subscriber_id: subId,
            channel: 'email',
            kind: 'weekly',
            status: 'pending_worker',
            attempt_count: 0,
            payload: {
              subscriberId: subId,
              issueId: edId,
              brokerId: 'broker-kim',
              channel: 'email',
              editionKey: 'broker-kim:2026-11-18:weekly',
              editionUrl: 'https://credeal.net/magazine/broker-kim/2026-11-18',
              title: '레거시 호',
              headline: '강남',
              marketTemp: '보합',
              date: '2026-11-18',
              kakaoTemplateId: 'TPL',
            },
          },
        ],
      },
      { missingColumnOnTable: { table: 'magazine_dispatch_logs', column: 'blocked_reason' } },
    );
    const legacyQuiet = await processMagazineDispatchQueueBatch(legacyDb as never, {
      now: new Date('2026-11-18T13:00:00Z'),
      gateDeps: { dryRun: true },
    });
    expect(legacyQuiet.blocked).toBe(1);
    expect(legacyQuiet.failed).toBe(0);
    expect(legacyDb.tables.magazine_dispatch_logs[0].status).toBe('retryable');
    expect(legacyDb.tables.magazine_dispatch_logs[0].attempt_count).toBe(0);
  });

  // ── 8. Wave 7.2 P1: POST /api/magazine/issues returns 409 PUBLISHED_LOCKED when saving published edition as draft ──
  it('8) POST /api/magazine/issues returns HTTP 409 PUBLISHED_LOCKED when saveAsDraft=true targets a published edition', async () => {
    const pubId = '66666666-6666-4666-8666-666666666666';
    const db = makeInMemoryDb({
      magazine_editions: [
        {
          id: pubId,
          broker_id: 'broker-kim',
          broker_user_id: mockState.brokerContext.userId,
          edition_type: 'monthly',
          edition_number: 11,
          slug: '2026-11',
          title: '이미 발행된 호수',
          status: 'published',
          published_at: '2026-11-15T00:00:00Z',
        },
      ],
      broker_profiles: [
        { user_id: mockState.brokerContext.userId, slug: 'broker-kim', display_name: '김공인', company: '김공인중개사무소' },
      ],
      profiles: [
        { id: mockState.brokerContext.userId, display_name: '김공인', phone: '010-1234-5678', company: '김공인중개사무소' },
      ],
    });
    mockState.serviceClient = db;

    const res = await issuesPost(
      new NextRequest('https://credeal.net/api/magazine/issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          editionId: pubId,
          editionType: 'monthly',
          headline: '덮어쓰기 초안 시도',
          briefingBody: '이 내용은 발행본을 덮어쓰면 안 됩니다.',
          saveAsDraft: true,
        }),
      }),
    );
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json).toEqual({
      ok: false,
      code: 'PUBLISHED_LOCKED',
      error: '이미 발행된 뉴스레터는 초안 저장으로 덮어쓸 수 없습니다.',
    });
    expect(db.tables.magazine_editions[0].status).toBe('published');
    expect(db.tables.magazine_issues).toHaveLength(0);
  });

  // ── 9. Wave 7.2 P0-2 & P1-1: Static daylight contrast & font floor scan across all 8 remediated UI components ──
  it('9) all 8 remediated newsletter UI components enforce crisp daylight contrast and >=14px text (zero text-xs or dark-on-light tokens)', () => {
    const root = process.cwd();
    const uiFiles = [
      'src/components/magazine-editor/analytics/SubscriberDetailPanel.tsx',
      'src/components/magazine-editor/analytics/CallBriefingModal.tsx',
      'src/components/magazine-editor/outreach/AddSubscriberForm.tsx',
      'src/components/magazine-editor/outreach/SubscriberDetailModal.tsx',
      'src/components/magazine-editor/SpecialEditionModal.tsx',
      'src/components/magazine-editor/MagazineQrModal.tsx',
      'src/components/magazine-editor/EditorOutreachTab.tsx',
      'src/components/magazine-editor/EditorAnalyticsTab.tsx',
    ];

    const darkBgButtonToken = /bg-(?:slate-900|indigo-[67]00|emerald-[67]00|rose-[67]00)/;
    for (const rel of uiFiles) {
      const src = fs.readFileSync(path.join(root, rel), 'utf8');
      expect(src, rel).not.toMatch(/\btext-(?:xs|label|caption)\b/);
      expect(src, rel).not.toMatch(/\btext-\[(?:[0-9]|1[0-3])px\]/);
      expect(src, rel).not.toMatch(/\btext-(?:slate-100|slate-200|slate-300|ink-muted|ink-subtle)\b/);
      expect(src, rel).not.toMatch(/\btext-(?:amber|indigo|rose|emerald|violet)-(?:100|200|300)\b/);
      expect(src, rel).not.toMatch(/\bbg-(?:slate-950|black\/|indigo-950|rose-950|amber-950|emerald-950|orange-950)/);

      // Every text-white or bg-slate-900/800 occurrence must sit on an explicit dark-button token
      const lines = src.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (/\btext-white\b/.test(lines[i])) {
          const contextWindow = lines.slice(Math.max(0, i - 3), i + 4).join(' ');
          expect(contextWindow, `${rel}:${i + 1} text-white must pair with dark solid button`).toMatch(darkBgButtonToken);
        }
        if (/\bbg-slate-(?:800|900)\b/.test(lines[i])) {
          const contextWindow = lines.slice(Math.max(0, i - 3), i + 4).join(' ');
          expect(contextWindow, `${rel}:${i + 1} dark slate bg only allowed on solid text-white button`).toMatch(/\btext-white\b/);
        }
      }
    }

    const pageSrc = fs.readFileSync(
      path.join(root, 'src/app/(broker)/broker/magazine-editor/page.tsx'),
      'utf8',
    );
    expect(pageSrc).not.toContain('data-theme-lock="dark"');
    expect(pageSrc).not.toContain('sendDisabled={false}');
  });

  // ── 10. Wave 7.2 P1-2 & P2-2 & draft GET: Target section reordering, GET draft flags, and manual subscriber email dup + consent_status ──
  it('10) MagazineView reorders sections for target=buyer, GET /editions/draft returns sendEnabled flag, and POST /subscribers checks email dups & writes consent_status=pending', async () => {
    const viewData = {
      headline: '타깃 순서 테스트',
      briefing: '강남권 매매 수요 동향 요약입니다.',
      topNews: [{ title: '핵심 뉴스', summary: '요약', source: '뉴스', topic: '시장', sentiment: 'neutral' }],
      featured_deals: [{ id: 'd1', assetType: '꼬마빌딩', address: '강남구 역삼동', price: 5_000_000_000 }],
      broker: { name: '김공인', company: '김공인중개사무소', phone: '010-1234-5678' },
    };

    const buyerHtml = renderToStaticMarkup(
      React.createElement(MagazineView, {
        brokerId: 'broker-kim',
        brokerSlug: 'broker-kim',
        date: '2026-11-18',
        target: 'buyer',
        data: viewData,
      }),
    );
    expect(buyerHtml.indexOf('id="section-featured_deals"')).toBeLessThan(
      buyerHtml.indexOf('id="section-news_curation"'),
    );

    const allHtml = renderToStaticMarkup(
      React.createElement(MagazineView, {
        brokerId: 'broker-kim',
        brokerSlug: 'broker-kim',
        date: '2026-11-18',
        target: 'all',
        data: viewData,
      }),
    );
    expect(allHtml.indexOf('id="section-news_curation"')).toBeLessThan(
      allHtml.indexOf('id="section-featured_deals"'),
    );

    // GET /api/magazine/editions/draft reads MAGAZINE_SEND_ENABLED
    process.env.MAGAZINE_SEND_ENABLED = 'false';
    const draftFlagRes = await draftGet(new NextRequest('https://credeal.net/api/magazine/editions/draft'));
    expect(draftFlagRes.status).toBe(200);
    const draftFlagJson = await draftFlagRes.json();
    expect(draftFlagJson.meta.sendEnabled).toBe(false);

    // POST /api/broker/magazine/subscribers catches duplicate unsubscribed email even when phone is new, and sets consent_status=pending on fresh insert
    const subDb = makeInMemoryDb({
      magazine_subscribers: [
        {
          id: 'unsub-email-1',
          broker_id: 'broker-kim',
          subscriber_phone: '01000001111',
          subscriber_email: 'unsub-dup@example.com',
          status: 'unsubscribed',
          unsubscribed_at: '2026-10-01T00:00:00Z',
        },
      ],
    });
    mockState.serviceClient = subDb;

    const dupEmailRes = await subscribersPost(
      new NextRequest('https://credeal.net/api/broker/magazine/subscribers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: '중복이메일',
          phone: '010-7777-8888',
          email: 'UNSUB-DUP@example.com',
          channel: 'both',
          consentAttested: true,
        }),
      }),
    );
    expect(dupEmailRes.status).toBe(409);

    const freshSubRes = await subscribersPost(
      new NextRequest('https://credeal.net/api/broker/magazine/subscribers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: '신규수동',
          phone: '010-5555-9999',
          email: 'fresh-manual@example.com',
          channel: 'both',
          consentAttested: true,
        }),
      }),
    );
    expect(freshSubRes.status).toBe(201);
    const inserted = subDb.tables.magazine_subscribers.find((r) => r.subscriber_email === 'fresh-manual@example.com');
    expect(inserted?.confirm_status).toBe('pending');
    expect(inserted?.consent_status).toBe('pending');
  });
});
