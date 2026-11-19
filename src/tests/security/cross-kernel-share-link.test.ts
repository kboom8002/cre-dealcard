import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
  serviceClientFactory: vi.fn(),
  workspaceItemByAnyId: vi.fn(),
  publicWorkspaceProjection: vi.fn(),
  updateWorkspaceItemState: vi.fn(),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => hoisted.serviceClientFactory(),
}));

vi.mock('@/lib/workspace/workspace-repository', async () => {
  const actual = await vi.importActual<typeof import('@/lib/workspace/workspace-repository')>(
    '@/lib/workspace/workspace-repository'
  );
  return {
    ...actual,
    getWorkspaceItemByAnyId: (...args: unknown[]) => hoisted.workspaceItemByAnyId(...args),
    getPublicWorkspaceProjection: (...args: unknown[]) => hoisted.publicWorkspaceProjection(...args),
    updateWorkspaceItemState: (...args: unknown[]) => hoisted.updateWorkspaceItemState(...args),
  };
});

import {
  isBuildingShareLinkRevoked,
  issueShareLinkToken,
  resetShareLinkTokenStoreForTests,
  restoreShareLinkToken,
  revokeShareLinkToken,
  verifyShareLinkToken,
} from '@/lib/security/share-link-tokens';
import {
  isPreCutoverSchemaError,
  resolveWorkspaceImGuard,
  verifyPublicImShareToken,
} from '@/lib/im-lite/im-public-guard';
import { handleLinkRevokeAction } from '@/lib/inbox/inbox-actions-governance';
import { handleOutboundChannelAction } from '@/lib/inbox/inbox-actions-outbound';

const BROKER_ID = 'aaaaaaaa-1111-4111-8111-111111111111';
const BLD_ID = 'bbbbbbbb-2222-4222-8222-222222222222';
const THREAD_ID = 'cccccccc-3333-4333-8333-333333333333';

function makeQueryMock(
  resolveResult: (table: string, op: string, filters: Record<string, unknown>) => { data?: unknown; error?: unknown } | Promise<{ data?: unknown; error?: unknown }>
) {
  return {
    from: (table: string) => {
      let op = 'select';
      const filters: Record<string, unknown> = {};
      const run = () => Promise.resolve(resolveResult(table, op, filters));
      const chain: any = {
        select: () => chain,
        insert: () => {
          op = 'insert';
          return chain;
        },
        update: () => {
          op = 'update';
          return chain;
        },
        upsert: () => {
          op = 'upsert';
          return chain;
        },
        eq: (k: string, v: unknown) => {
          filters[k] = v;
          return chain;
        },
        in: (k: string, v: unknown) => {
          filters[k] = v;
          return chain;
        },
        or: (v: unknown) => {
          filters.or = v;
          return chain;
        },
        order: () => chain,
        limit: () => chain,
        maybeSingle: run,
        single: run,
        then: (onFulfilled: any, onRejected?: any) => run().then(onFulfilled, onRejected),
      };
      return chain;
    },
  };
}

describe('Kernel K1: Cross-Subsystem Share-Link Fail-Closed & Thread/Building Scope Orthogonal Isolation', () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    resetShareLinkTokenStoreForTests();
    process.env.SHARE_LINK_SECRET = 'k1-cross-kernel-share-link-secret-32chars!';
    hoisted.workspaceItemByAnyId.mockResolvedValue(null);
    hoisted.publicWorkspaceProjection.mockResolvedValue({
      found: false,
      deleted: false,
      revoked: false,
      projection: null,
    });
    hoisted.updateWorkspaceItemState.mockResolvedValue(null);
    hoisted.serviceClientFactory.mockReturnValue(makeQueryMock(() => ({ data: null, error: null })));
  });

  afterEach(() => {
    for (const k of Object.keys(process.env)) {
      if (!(k in savedEnv)) delete process.env[k];
    }
    Object.assign(process.env, savedEnv);
  });

  it('1) fails closed with lookup_failed (NEVER HMAC fall-through) on signed slk.* when DB query errors or times out', async () => {
    const issued = await issueShareLinkToken({
      buildingId: BLD_ID,
      brokerId: BROKER_ID,
      recipientId: THREAD_ID,
      kind: 'im',
    });

    // 1a. im_share_links DB connection error -> lookup_failed
    hoisted.serviceClientFactory.mockReturnValue(
      makeQueryMock((table) =>
        table === 'im_share_links'
          ? { data: null, error: { code: '57014', message: 'statement timeout' } }
          : { data: [], error: null }
      )
    );
    const res1 = await verifyShareLinkToken({ token: issued.token, buildingId: BLD_ID });
    expect(res1.valid).toBe(false);
    expect(res1.reason).toBe('lookup_failed');

    // 1b. activity_events thrown exception -> lookup_failed
    hoisted.serviceClientFactory.mockReturnValue(
      makeQueryMock((table) => {
        if (table === 'activity_events') throw new Error('socket hang up');
        return { data: null, error: null };
      })
    );
    const res2 = await verifyShareLinkToken({ token: issued.token, buildingId: BLD_ID });
    expect(res2.valid).toBe(false);
    expect(res2.reason).toBe('lookup_failed');

    // 1c. verifyPublicImShareToken converts lookup_failed -> 503
    const publicCheck = await verifyPublicImShareToken({
      token: issued.token,
      buildingId: BLD_ID,
      requireToken: true,
      isPrivileged: false,
    });
    expect(publicCheck).toEqual({
      allowed: false,
      reason: 'lookup_failed',
      status: 503,
    });
  });

  it('2) keeps building-wide IM lock intact when Inbox executes thread-scoped restore_link', async () => {
    const issuedA = await issueShareLinkToken({
      buildingId: BLD_ID,
      brokerId: BROKER_ID,
      recipientId: THREAD_ID,
    });
    const issuedB = await issueShareLinkToken({
      buildingId: BLD_ID,
      brokerId: BROKER_ID,
      recipientId: 'dddddddd-4444-4444-8444-444444444444',
    });

    const events: Array<Record<string, unknown>> = [];
    const customMock = {
      from: (table: string) => {
        const chain: any = {
          select: () => chain,
          update: () => chain,
          upsert: async () => ({ error: null }),
          insert: (payload: any) => {
            if (table === 'activity_events') {
              events.unshift({
                ...payload,
                created_at: new Date().toISOString(),
              });
            }
            return Promise.resolve({ error: null });
          },
          eq: () => chain,
          in: () => chain,
          or: () => chain,
          order: () => chain,
          limit: () => chain,
          maybeSingle: async () => ({ data: null, error: null }),
          single: async () => ({ data: null, error: null }),
          then: (onF: any, onR?: any) =>
            Promise.resolve({ data: table === 'activity_events' ? events : [], error: null }).then(onF, onR),
        };
        return chain;
      },
    };
    hoisted.serviceClientFactory.mockReturnValue(customMock);

    // Building lock (IM / DealCard global revoke)
    const lockRes = await revokeShareLinkToken({
      buildingId: BLD_ID,
      brokerId: BROKER_ID,
      scope: 'building',
      reason: 'building_under_negotiation',
    });
    expect(lockRes.ok).toBe(true);
    expect(isBuildingShareLinkRevoked(BLD_ID)).toBe(true);
    hoisted.updateWorkspaceItemState.mockClear();

    // Inbox calls restore_link with shareToken (thread scope only)
    const govRes = await handleLinkRevokeAction({
      action: 'restore_link',
      userId: BROKER_ID,
      isAdmin: false,
      threadId: THREAD_ID,
      shareToken: issuedA.token,
      buildingId: BLD_ID,
      body: {},
    });
    expect(govRes.status).toBe(200);

    // Building lock MUST STILL be active and workspace_items must NOT be flipped to published!
    expect(isBuildingShareLinkRevoked(BLD_ID)).toBe(true);
    expect(hoisted.updateWorkspaceItemState).not.toHaveBeenCalled();

    // Neither token A nor sibling token B can bypass building lock
    const checkA = await verifyShareLinkToken({ token: issuedA.token, buildingId: BLD_ID });
    const checkB = await verifyShareLinkToken({ token: issuedB.token, buildingId: BLD_ID });
    expect(checkA.valid).toBe(false);
    expect(checkA.reason).toBe('revoked');
    expect(checkB.valid).toBe(false);
    expect(checkB.reason).toBe('revoked');
  });

  it('3) thread-only restoreShareLinkToken recovers thread token when building is NOT locked', async () => {
    const issued = await issueShareLinkToken({
      buildingId: BLD_ID,
      brokerId: BROKER_ID,
      recipientId: THREAD_ID,
    });

    await revokeShareLinkToken({
      token: issued.token,
      buildingId: BLD_ID,
      brokerId: BROKER_ID,
      threadId: THREAD_ID,
      scope: 'thread',
      reason: 'pause_thread',
    });
    expect((await verifyShareLinkToken({ token: issued.token, buildingId: BLD_ID })).valid).toBe(false);

    const restored = await restoreShareLinkToken({
      token: issued.token,
      buildingId: BLD_ID,
      brokerId: BROKER_ID,
      threadId: THREAD_ID,
      scope: 'thread',
    });
    expect(restored.ok).toBe(true);
    expect(isBuildingShareLinkRevoked(BLD_ID)).toBe(false);

    const after = await verifyShareLinkToken({ token: issued.token, buildingId: BLD_ID });
    expect(after.valid).toBe(true);
  });

  it('4) blocks outbound link reissue (409 LINK_REVOKED_LOCKED) when thread is revoked', async () => {
    hoisted.serviceClientFactory.mockReturnValue(
      makeQueryMock((table) => {
        if (table === 'broker_profiles') {
          return {
            data: {
              company: '정석공인중개사사무소',
              office_address: '서울특별시 강남구 테헤란로 123',
              office_reg_number: '11680-2024-04567',
              representative_name: '김정석',
              contact_email: 'broker@jeongseok-re.kr',
              slug: 'jeongseok-re',
            },
            error: null,
          };
        }
        if (table === 'profiles') {
          return { data: { company: '정석공인중개사사무소', phone: '02-555-8282', display_name: '김정석' }, error: null };
        }
        if (table === 'gate_requests') {
          return { data: { status: 'revoked' }, error: null };
        }
        return { data: null, error: null };
      })
    );

    const res = await handleOutboundChannelAction({
      action: 'prepare_copy_bundle',
      userId: BROKER_ID,
      buildingId: BLD_ID,
      threadId: THREAD_ID,
      clientId: '',
      shareToken: '',
      origin: 'https://www.credeal.net',
      body: { assetKind: 'im', clientName: '김매수', buildingTitle: '역삼빌딩' },
    });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.code).toBe('LINK_REVOKED_LOCKED');
  });

  it('5) strictly identifies pre-cutover schema errors without empty-object false positives and propagates governanceUnavailable', async () => {
    expect(isPreCutoverSchemaError({})).toBe(false);
    expect(isPreCutoverSchemaError({ code: '', message: '' })).toBe(false);
    expect(isPreCutoverSchemaError(null)).toBe(false);
    expect(isPreCutoverSchemaError({ code: '42P01', message: 'relation missing' })).toBe(true);
    expect(isPreCutoverSchemaError({ code: 'PGRST204', message: 'schema cache' })).toBe(true);

    hoisted.workspaceItemByAnyId.mockRejectedValue(new Error('DB connection refused'));
    hoisted.publicWorkspaceProjection.mockResolvedValue({
      found: false,
      deleted: false,
      revoked: false,
      projection: null,
    });

    const guard = await resolveWorkspaceImGuard({ from: () => ({}) }, BLD_ID);
    expect(guard.governanceUnavailable).toBe(true);
  });
});
