import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const hoisted = vi.hoisted(() => ({
  serviceClientFactory: vi.fn(),
  publicWorkspaceProjection: vi.fn(),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => hoisted.serviceClientFactory(),
}));

vi.mock('@/lib/security/cron-auth', () => ({
  verifyCronRequest: () => null,
  acquireCronIdempotencySlot: async () => ({ acquired: true, slotKey: 'test-slot' }),
}));

vi.mock('@/lib/workspace/workspace-repository', async () => {
  const actual = await vi.importActual<typeof import('@/lib/workspace/workspace-repository')>(
    '@/lib/workspace/workspace-repository'
  );
  return {
    ...actual,
    getPublicWorkspaceProjection: (...args: unknown[]) => hoisted.publicWorkspaceProjection(...args),
  };
});

import { POST as retentionPurgePOST } from '@/app/api/cron/retention-purge/route';
import { POST as reverseOnboardingPOST } from '@/app/api/public/reverse-onboarding/route';
import { handleToggleNewsletterAction, purgeDeletedBrokerClientArtifacts } from '@/lib/inbox/inbox-actions-clients';
import { hashEmailForSuppression } from '@/lib/legal/email-suppression';
import { isRealProductionRuntime } from '@/lib/env';
import { isValidQaGateRequest } from '@/proxy';
import { GET as qaWorkbenchGET } from '@/app/api/public/qa-workbench/route';
import { isSensitiveWorkspaceStorageKey, purgeWorkspaceClientStorage } from '@/lib/workspace/storage-namespace';

type MockQueryResult = { data: unknown; error: { code?: string; message?: string } | null; count?: number };
interface MockChain extends PromiseLike<MockQueryResult> {
  select: () => MockChain;
  insert: (payload: unknown) => MockChain;
  update: (payload: unknown) => MockChain;
  delete: () => MockChain;
  eq: (col: string, val: unknown) => MockChain;
  not: () => MockChain;
  in: () => MockChain;
  ilike: () => MockChain;
  lt: () => MockChain;
  is: () => MockChain;
  order: () => MockChain;
  limit: () => MockChain;
  range: (from: number, to: number) => MockChain;
  maybeSingle: () => Promise<MockQueryResult>;
  single: () => Promise<MockQueryResult>;
}

const BROKER_ID = '11111111-4444-4444-8444-111111111101';
const BLD_ID = '22222222-4444-4444-8444-222222222202';

describe('Kernel K3 & K4: Retention Pagination/Abort, PII Hash Anonymization, Runtime/QA & Storage Isolation', () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.publicWorkspaceProjection.mockResolvedValue({
      found: false,
      revoked: false,
      deleted: false,
      status: null,
      ownerId: null,
      projection: null,
    });
  });

  afterEach(() => {
    for (const k of Object.keys(process.env)) {
      if (!(k in savedEnv)) delete process.env[k];
    }
    Object.assign(process.env, savedEnv);
  });

  it('1) retention-purge paginates >500 unsubscribed rows via .range() and aborts magazine_purge_unsubscribed RPC if backfill fails', async () => {
    const rows = Array.from({ length: 620 }, (_, idx) => ({
      id: `sub-${String(idx).padStart(4, '0')}`,
      broker_id: BROKER_ID,
      broker_user_id: BROKER_ID,
      subscriber_email: `unsub${idx}@buyer.kr`,
      status: 'unsubscribed',
      unsubscribed_at: '2026-09-01T00:00:00.000Z',
    }));
    const recordedHashes: string[] = [];
    const rpcCalls: string[] = [];
    let rangeQueries = 0;

    const createPaginationMock = (failOnRead = false) => ({
      rpc: vi.fn(async (fn: string) => {
        rpcCalls.push(fn);
        return { data: 0, error: null };
      }),
      from: (table: string) => {
        let rangeFrom = 0;
        let rangeTo = 999;
        let op: 'select' | 'insert' | 'update' | 'delete' = 'select';
        let insertPayload: unknown = null;
        let eqStatus: string | null = null;
        const run = async (): Promise<MockQueryResult> => {
          if (table === 'magazine_subscribers' && op === 'select') {
            if (failOnRead) {
              return { data: null, error: { code: '57014', message: 'statement timeout during scan' } };
            }
            const filtered = eqStatus ? rows.filter((r) => r.status === eqStatus) : rows;
            return { data: filtered.slice(rangeFrom, rangeTo + 1), error: null };
          }
          if (table === 'email_suppressions' && op === 'select') {
            return { data: null, error: null };
          }
          if (table === 'email_suppressions' && op === 'insert') {
            const list = (Array.isArray(insertPayload) ? insertPayload : [insertPayload]) as Array<{ email_hash?: string }>;
            for (const item of list) {
              if (item?.email_hash) recordedHashes.push(String(item.email_hash));
            }
            return { data: list, error: null };
          }
          return { data: [], error: null, count: 0 };
        };
        const chain: MockChain = {
          select: () => chain,
          insert: (p: unknown) => {
            op = 'insert';
            insertPayload = p;
            return chain;
          },
          update: () => {
            op = 'update';
            return chain;
          },
          delete: () => {
            op = 'delete';
            return chain;
          },
          eq: (col: string, val: unknown) => {
            if (col === 'status') eqStatus = String(val);
            return chain;
          },
          not: () => chain,
          in: () => chain,
          ilike: () => chain,
          lt: () => chain,
          is: () => chain,
          order: () => chain,
          limit: () => chain,
          range: (a: number, b: number) => {
            rangeQueries += 1;
            rangeFrom = a;
            rangeTo = b;
            return chain;
          },
          maybeSingle: run,
          single: run,
          then: (onF, onR) => run().then(onF ?? undefined, onR ?? undefined),
        };
        return chain;
      },
    });

    // 1a. 620 unsubscribed subscribers -> 2 .range() batches (500 + 120), 620 hashes saved, RPC runs
    hoisted.serviceClientFactory.mockReturnValue(createPaginationMock(false));
    const okRes = await retentionPurgePOST(new NextRequest('https://www.credeal.net/api/cron/retention-purge', { method: 'POST' }));
    expect(okRes.status).toBe(200);
    const okJson = await okRes.json();
    expect(rangeQueries).toBe(2);
    expect(recordedHashes).toHaveLength(620);
    expect(okJson.magazine.suppressionBackfill).toEqual({ ok: true, result: 620 });
    expect(rpcCalls).toContain('magazine_purge_unsubscribed');

    // 1b. Read failure during suppression backfill -> NEVER calls magazine_purge_unsubscribed RPC!
    rpcCalls.length = 0;
    hoisted.serviceClientFactory.mockReturnValue(createPaginationMock(true));
    const abortRes = await retentionPurgePOST(new NextRequest('https://www.credeal.net/api/cron/retention-purge', { method: 'POST' }));
    expect(abortRes.status).toBe(200);
    const abortJson = await abortRes.json();
    expect(abortJson.magazine.suppressionBackfill.ok).toBe(false);
    expect(abortJson.magazine.unsubscribed.ok).toBe(false);
    expect(rpcCalls).not.toContain('magazine_purge_unsubscribed');
  });

  it('2) stores email_hash instead of plaintext PII on newsletter_subscription_toggled and scrubs legacy PII on client deletion', async () => {
    interface StoredEvent {
      id: string;
      actor_id?: string;
      event_type?: string;
      metadata: Record<string, unknown>;
    }
    const events: StoredEvent[] = [];
    const mockDb = {
      from: (table: string) => {
        let op = 'select';
        let insertData: Record<string, unknown> = {};
        let updateData: Record<string, unknown> = {};
        let filterId = '';
        const run = async (): Promise<MockQueryResult> => {
          if (table === 'activity_events') {
            if (op === 'insert') {
              const ev: StoredEvent = {
                id: `ev-${events.length + 1}`,
                metadata: (insertData.metadata as Record<string, unknown>) || {},
                actor_id: insertData.actor_id as string | undefined,
                event_type: insertData.event_type as string | undefined,
              };
              events.push(ev);
              return { data: ev, error: null };
            }
            if (op === 'update') {
              const target = events.find((e) => e.id === filterId);
              if (target && updateData.metadata && typeof updateData.metadata === 'object') {
                target.metadata = updateData.metadata as Record<string, unknown>;
              }
              return { data: target ? [target] : [], error: null };
            }
            return { data: events, error: null };
          }
          if (table === 'broker_clients') {
            return {
              data: { id: '33333333-4444-4444-8444-333333333303', email: 'privacy@buyer.kr', consent_status: 'unsubscribed' },
              error: null,
            };
          }
          return { data: null, error: null };
        };
        const chain: MockChain = {
          select: () => chain,
          insert: (d: unknown) => {
            op = 'insert';
            insertData = (d && typeof d === 'object' ? d : {}) as Record<string, unknown>;
            return chain;
          },
          update: (d: unknown) => {
            op = 'update';
            updateData = (d && typeof d === 'object' ? d : {}) as Record<string, unknown>;
            return chain;
          },
          delete: () => {
            op = 'delete';
            return chain;
          },
          eq: (c: string, v: unknown) => {
            if (c === 'id') filterId = String(v);
            return chain;
          },
          not: () => chain,
          in: () => chain,
          ilike: () => chain,
          lt: () => chain,
          is: () => chain,
          order: () => chain,
          limit: () => chain,
          range: () => chain,
          maybeSingle: run,
          single: run,
          then: (onF, onR) => run().then(onF ?? undefined, onR ?? undefined),
        };
        return chain;
      },
    };
    hoisted.serviceClientFactory.mockReturnValue(mockDb);

    await handleToggleNewsletterAction({
      action: 'toggle_newsletter',
      userId: BROKER_ID,
      buildingId: '',
      threadId: 'custom_cli_p1',
      clientId: 'custom_cli_p1',
      body: {
        subscribed: false,
        clientName: '김프라이버시',
        clientPhone: '010-9999-8888',
        clientEmail: 'privacy@buyer.kr',
      },
    });

    const toggleEv = events.find((e) => e.event_type === 'newsletter_subscription_toggled')!;
    expect(toggleEv).toBeDefined();
    expect(toggleEv.metadata.client_email).toBeUndefined();
    expect(toggleEv.metadata.client_phone).toBeUndefined();
    expect(toggleEv.metadata.client_name).toBeUndefined();
    expect(toggleEv.metadata.email_hash).toBe(hashEmailForSuppression('privacy@buyer.kr'));

    // Seed a legacy pre-patch toggle event with plaintext PII -> delete_client scrubs plaintext while keeping hash
    events.push({
      id: 'ev-legacy-toggle',
      actor_id: BROKER_ID,
      event_type: 'newsletter_subscription_toggled',
      metadata: {
        client_id: 'custom_cli_p1',
        raw_client_id: 'cli_p1',
        client_name: '구평문고객',
        client_phone: '010-1111-2222',
        client_email: 'legacy@buyer.kr',
        consent_status: 'unsubscribed',
      },
    });

    const purged = await purgeDeletedBrokerClientArtifacts(
      mockDb as unknown as Parameters<typeof purgeDeletedBrokerClientArtifacts>[0],
      {
        userId: BROKER_ID,
        targetKey: 'custom_cli_p1',
        rawClientId: 'cli_p1',
      }
    );
    expect(purged.piiScrubbed).toBe(true);
    const scrubbedLegacy = events.find((e) => e.id === 'ev-legacy-toggle')!;
    expect(scrubbedLegacy.metadata.client_email).toBeUndefined();
    expect(scrubbedLegacy.metadata.client_phone).toBeUndefined();
    expect(scrubbedLegacy.metadata.client_name).toBeUndefined();
    expect(scrubbedLegacy.metadata.email_hash).toBe(hashEmailForSuppression('legacy@buyer.kr'));
  });

  it('3) forces isRealProductionRuntime=true on VERCEL_ENV=production even with CI=1, unifies QA passcode gate, hardens reverse-onboarding, and clears extra storage keys', async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    process.env.VERCEL_ENV = 'production';
    process.env.CI = '1';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://prod.supabase.co';
    delete process.env.NEXT_PHASE;
    expect(isRealProductionRuntime()).toBe(true);

    // proxy & qa-workbench recognize QA_PORTAL_PASSCODE identically
    delete process.env.QA_ACCESS_KEY;
    delete process.env.QA_TESTER_ACCESS_KEY;
    delete process.env.QA_BROKER_ACCESS_KEY;
    process.env.QA_PORTAL_PASSCODE = 'shared-passcode-secret-123';
    process.env.CREDEAL_ENABLE_PUBLIC_QA = 'true';

    const qaReq = new NextRequest('https://www.credeal.net/qa-showcase?mode=pins', {
      headers: { 'x-qa-passcode': 'shared-passcode-secret-123' },
    });
    expect(isValidQaGateRequest(qaReq).allowed).toBe(true);
    const qaApiRes = await qaWorkbenchGET(qaReq);
    expect(qaApiRes.status).toBe(200);

    // reverse-onboarding rejects non-UUID (400) & draft workspace item (404)
    const badIdRes = await reverseOnboardingPOST(
      new NextRequest('https://www.credeal.net/api/public/reverse-onboarding', {
        method: 'POST',
        body: JSON.stringify({ buildingId: 'not-a-uuid', name: '김', phone: '01012345678', budget: '100억' }),
      })
    );
    expect(badIdRes.status).toBe(400);

    hoisted.publicWorkspaceProjection.mockResolvedValue({
      found: true,
      revoked: false,
      deleted: false,
      status: 'draft',
      ownerId: BROKER_ID,
      projection: null,
    });
    hoisted.serviceClientFactory.mockReturnValue({
      from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { owner_id: BROKER_ID, status: 'draft' }, error: null }) }) }) }),
    });
    const draftRes = await reverseOnboardingPOST(
      new NextRequest('https://www.credeal.net/api/public/reverse-onboarding', {
        method: 'POST',
        body: JSON.stringify({ buildingId: BLD_ID, name: '김', phone: '01012345678', budget: '100억' }),
      })
    );
    expect(draftRes.status).toBe(404);

    // Storage namespace clears memo_transfer, kakao_text_*, cre_qa_*
    expect(isSensitiveWorkspaceStorageKey('memo_transfer')).toBe(true);
    expect(isSensitiveWorkspaceStorageKey('kakao_text_bld1')).toBe(true);
    expect(isSensitiveWorkspaceStorageKey('cre_qa_pin_state')).toBe(true);
    const mockStorageData = new Map<string, string>([
      ['memo_transfer', 'secret'],
      ['kakao_text_123', 'copy'],
      ['cre_qa_mode', 'tester'],
      ['credeal-workspace-font-scale-v1', 'large'],
    ]);
    const fakeStorage = {
      get length() {
        return mockStorageData.size;
      },
      key: (i: number) => Array.from(mockStorageData.keys())[i] ?? null,
      getItem: (k: string) => mockStorageData.get(k) ?? null,
      setItem: (k: string, v: string) => void mockStorageData.set(k, v),
      removeItem: (k: string) => void mockStorageData.delete(k),
      clear: () => mockStorageData.clear(),
    } as unknown as Storage;
    purgeWorkspaceClientStorage(fakeStorage);
    expect(mockStorageData.has('memo_transfer')).toBe(false);
    expect(mockStorageData.has('kakao_text_123')).toBe(false);
    expect(mockStorageData.has('cre_qa_mode')).toBe(false);
    expect(mockStorageData.get('credeal-workspace-font-scale-v1')).toBe('large');
  });
});
