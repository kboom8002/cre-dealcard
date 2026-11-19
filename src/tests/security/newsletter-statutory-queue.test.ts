import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const hoisted = vi.hoisted(() => ({
  serviceClientFactory: vi.fn(),
  requireBrokerContextMock: vi.fn(),
  assertOwnsRowMock: vi.fn(),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => hoisted.serviceClientFactory(),
}));

vi.mock('@/lib/magazine/authz', async () => {
  const actual = await vi.importActual<typeof import('@/lib/magazine/authz')>('@/lib/magazine/authz');
  return {
    ...actual,
    requireBrokerContext: (...args: unknown[]) => hoisted.requireBrokerContextMock(...(args as [])),
    assertOwnsRow: (...args: unknown[]) => hoisted.assertOwnsRowMock(...(args as [])),
  };
});

import { loadBrokerIdentity } from '@/domain/magazine/send-batch';
import { renderMagazineEmail } from '@/domain/magazine/email-template';
import { KAKAO_MAX_LENGTH, renderMagazineKakaoText } from '@/domain/magazine/templates/kakao-text';
import {
  computeNextKst0800Iso,
  processMagazineDispatchQueueBatch,
} from '@/domain/magazine/distribute-queue';
import { handleSendDealcardOrMagazineAction } from '@/lib/inbox/inbox-actions-leads';
import { POST as issuesPOST } from '@/app/api/magazine/issues/route';
import type { MagazineDbClient } from '@/domain/magazine/types';

const BROKER_A_ID = '11111111-4444-4444-8444-111111111101';
const EDITION_FOREIGN = '22222222-4444-4444-8444-222222222202';
const EDITION_MISSING = '33333333-4444-4444-8444-333333333303';
const SUB_OK = '44444444-4444-4444-8444-444444444404';

interface DbChain extends PromiseLike<{ data: unknown; error: null }> {
  select: (cols?: string) => DbChain;
  eq: (col: string, val: unknown) => DbChain;
  in: (col: string, vals: unknown[]) => DbChain;
  or: (expr: string) => DbChain;
  lte: () => DbChain;
  gte: () => DbChain;
  range: () => DbChain;
  order: () => DbChain;
  limit: (n: number) => DbChain;
  update: (patch: Record<string, unknown>) => DbChain;
  maybeSingle: () => Promise<{ data: unknown; error: null }>;
}

describe('PR-2B Newsletter Statutory Disclosure, Queue Fairness & Edition Ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('APP_BASE_URL', 'https://www.credeal.net');
    vi.stubEnv('UNSUBSCRIBE_SECRET', 'pr2b-test-unsub-secret-at-least-32-chars!!');
    vi.stubEnv('MAGAZINE_SEND_ENABLED', 'true');
    vi.stubEnv('MAGAZINE_SEND_DRY_RUN', 'true');
  });

  it('1) loads profiles.company and renders all 5 statutory broker disclosures in email & <=1000 char Kakao text', async () => {
    const fakeSb = {
      from: (table: string) => {
        const res =
          table === 'broker_profiles'
            ? {
                user_id: BROKER_A_ID,
                slug: 'seocho-star',
                contact_email: 'broker@seocho.kr',
                office_address: '서울특별시 서초구 서초대로 200',
                office_reg_number: '11650-2024-00888',
                representative_name: '이서초',
              }
            : {
                display_name: '이서초',
                phone: '02-590-8888',
                company: '서초스타중개법인',
              };
        const chain: DbChain = {
          select: () => chain,
          eq: () => chain,
          in: () => chain,
          or: () => chain,
          lte: () => chain,
          gte: () => chain,
          range: () => chain,
          order: () => chain,
          limit: () => chain,
          update: () => chain,
          maybeSingle: async () => ({ data: res, error: null }),
          then: (onF, onR) => Promise.resolve({ data: res, error: null }).then(onF ?? undefined, onR ?? undefined),
        };
        return chain;
      },
    };

    const identity = await loadBrokerIdentity(fakeSb as unknown as MagazineDbClient, 'seocho-star');
    expect(identity?.officeName).toBe('서초스타중개법인');
    expect(identity?.senderName).toBe('이서초');
    expect(identity?.officeRegNumber).toBe('11650-2024-00888');

    const input = {
      brokerName: identity!.senderName!,
      officeName: identity!.officeName,
      brokerContact: identity!.senderContact ?? undefined,
      senderAddress: identity!.senderAddress ?? undefined,
      senderEmail: identity!.senderEmail ?? undefined,
      officeRegNumber: identity!.officeRegNumber ?? undefined,
      representativeName: identity!.representativeName ?? undefined,
      subscriberName: '박매수',
      edition: {
        title: '서초 권역 주간 브리핑',
        headline: '테헤란로와 서초대로 코너 빌딩 매수 수요 견조',
        marketTemp: '선별 매수',
        date: '2026-11-19',
        url: 'https://www.credeal.net/magazine/seocho-star/2026-11-19',
      },
      unsubscribeUrl: 'https://www.credeal.net/unsubscribe?token=abc',
      isAd: true as const,
    };

    const email = renderMagazineEmail(input);
    for (const token of ['서초스타중개법인', '이서초', '서울특별시 서초구 서초대로 200', '02-590-8888', '11650-2024-00888']) {
      expect(email.html).toContain(token);
      expect(email.text).toContain(token);
    }

    const kakao = renderMagazineKakaoText(input);
    expect(kakao.text.length).toBeLessThanOrEqual(KAKAO_MAX_LENGTH);
    for (const token of ['(광고)', '서초스타중개법인', '이서초', '서초대로 200', '02-590-8888', '11650-2024-00888', '수신거부']) {
      expect(kakao.text).toContain(token);
    }
  });

  it('2) blocks send_magazine action with 422 when broker statutory disclosure is incomplete', async () => {
    const db = {
      from: (table: string) => {
        const data =
          table === 'profiles'
            ? [{ id: BROKER_A_ID, display_name: '이서초', phone: '', company: '' }]
            : table === 'broker_profiles'
              ? [{ user_id: BROKER_A_ID, slug: 'incomplete-broker' }]
              : [];
        const chain: DbChain = {
          select: () => chain,
          eq: () => chain,
          in: () => chain,
          or: () => chain,
          lte: () => chain,
          gte: () => chain,
          range: () => chain,
          order: () => chain,
          limit: () => chain,
          update: () => chain,
          maybeSingle: async () => ({ data: data[0] ?? null, error: null }),
          then: (onF, onR) => Promise.resolve({ data, error: null }).then(onF ?? undefined, onR ?? undefined),
        };
        return chain;
      },
    };
    hoisted.serviceClientFactory.mockReturnValue(db);

    const res = await handleSendDealcardOrMagazineAction({
      action: 'send_magazine',
      userId: BROKER_A_ID,
      buildingId: '',
      threadId: '',
      clientId: '',
      body: {},
    });
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.code).toBe('STATUTORY_DISCLOSURE_INCOMPLETE');
  });

  it('3) sets next_attempt_at to 08:00 KST on QUIET_HOURS and dequeues pending_worker before deferred retryable rows', async () => {
    const quietNow = new Date('2026-11-18T13:30:00Z'); // 22:30 KST
    expect(computeNextKst0800Iso(quietNow)).toBe('2026-11-18T23:00:00.000Z'); // 2026-11-19 08:00 KST
    const earlyMorningNow = new Date('2026-11-18T20:00:00Z'); // 2026-11-19 05:00 KST
    expect(computeNextKst0800Iso(earlyMorningNow)).toBe('2026-11-18T23:00:00.000Z'); // same KST day 08:00

    const subNightYes = {
      id: SUB_OK,
      broker_id: 'seocho-star',
      broker_user_id: BROKER_A_ID,
      subscriber_name: '야간동의',
      subscriber_email: 'night-ok@buyer.kr',
      channel: 'email',
      status: 'active',
      confirm_status: 'confirmed',
      marketing_consent_at: '2026-10-01T00:00:00Z',
      night_consent: true,
      segment: 'all',
    };

    const ledger: Array<Record<string, unknown>> = [
      {
        id: 'row-deferred-1',
        idempotency_key: 'k:deferred',
        edition_id: null,
        broker_id: 'seocho-star',
        broker_user_id: BROKER_A_ID,
        subscriber_id: SUB_OK,
        channel: 'email',
        kind: 'weekly',
        status: 'retryable',
        blocked_reason: 'QUIET_HOURS',
        attempt_count: 0,
        next_attempt_at: '2026-11-18T23:00:00.000Z',
        created_at: '2026-11-18T12:00:00.000Z',
        updated_at: '2026-11-18T12:05:00.000Z',
        payload: {
          subscriberId: SUB_OK,
          issueId: null,
          brokerId: 'seocho-star',
          channel: 'email',
          editionKey: 'seocho:1',
          editionUrl: 'https://www.credeal.net/magazine/seocho-star/2026-11-19',
          title: '야간 지연 호',
          headline: '강남',
          marketTemp: '보합',
          date: '2026-11-19',
          kakaoTemplateId: 'TPL',
        },
      },
      {
        id: 'row-fresh-night-ok',
        idempotency_key: 'k:fresh',
        edition_id: null,
        broker_id: 'seocho-star',
        broker_user_id: BROKER_A_ID,
        subscriber_id: SUB_OK,
        channel: 'email',
        kind: 'weekly',
        status: 'pending_worker',
        blocked_reason: null,
        attempt_count: 0,
        next_attempt_at: null,
        created_at: '2026-11-18T13:20:00.000Z',
        updated_at: '2026-11-18T13:20:00.000Z',
        payload: {
          subscriberId: SUB_OK,
          issueId: null,
          brokerId: 'seocho-star',
          channel: 'email',
          editionKey: 'seocho:2',
          editionUrl: 'https://www.credeal.net/magazine/seocho-star/2026-11-19',
          title: '신규 야간동의 호',
          headline: '서초',
          marketTemp: '보합',
          date: '2026-11-19',
          kakaoTemplateId: 'TPL',
        },
      },
    ];

    const db = {
      from: (table: string) => {
        let eqStatus: string | null = null;
        let eqId: string | null = null;
        let eqAttempt: number | null = null;
        let orExpr = '';
        let limitNum = 100;
        let patchData: Record<string, unknown> | null = null;
        let op: 'select' | 'update' = 'select';

        const run = async () => {
          if (table === 'magazine_dispatch_logs') {
            if (op === 'update' && patchData) {
              const target = ledger.find(
                (r) =>
                  (!eqId || r.id === eqId) &&
                  (!eqStatus || r.status === eqStatus) &&
                  (eqAttempt === null || r.attempt_count === eqAttempt)
              );
              if (target) Object.assign(target, patchData);
              return { data: target ?? null, error: null };
            }
            let out = [...ledger];
            if (eqStatus) out = out.filter((r) => r.status === eqStatus);
            if (orExpr.includes('next_attempt_at.lte.')) {
              const cutoff = orExpr.split('next_attempt_at.lte.')[1] || '';
              out = out.filter((r) => !r.next_attempt_at || String(r.next_attempt_at) <= cutoff);
            }
            out = out.slice(0, limitNum);
            return { data: out, error: null };
          }
          if (table === 'magazine_subscribers') return { data: [subNightYes], error: null };
          if (table === 'broker_profiles') {
            return {
              data: { user_id: BROKER_A_ID, slug: 'seocho-star', contact_email: 'b@seocho.kr' },
              error: null,
            };
          }
          if (table === 'profiles') {
            return { data: { display_name: '이서초', phone: '02-590-8888', company: '서초스타' }, error: null };
          }
          return { data: [], error: null };
        };

        const chain: DbChain = {
          select: () => chain,
          update: (p: Record<string, unknown>) => {
            op = 'update';
            patchData = p;
            return chain;
          },
          eq: (c: string, v: unknown) => {
            if (c === 'status') eqStatus = String(v);
            if (c === 'id') eqId = String(v);
            if (c === 'attempt_count') eqAttempt = Number(v);
            return chain;
          },
          in: () => chain,
          or: (expr: string) => {
            orExpr = expr;
            return chain;
          },
          lte: () => chain,
          gte: () => chain,
          range: () => chain,
          order: () => chain,
          limit: (n: number) => {
            limitNum = n;
            return chain;
          },
          maybeSingle: run,
          then: (onF, onR) => run().then(onF ?? undefined, onR ?? undefined),
        };
        return chain;
      },
    };

    // With batchSize=1, pending_worker must NOT starve behind deferred retryable
    const res = await processMagazineDispatchQueueBatch(db as unknown as MagazineDbClient, {
      batchSize: 1,
      now: quietNow,
      paceMs: 0,
      gateDeps: { dryRun: true },
    });
    expect(res.fetched).toBe(1);
    expect(res.recorded).toBe(1);
    expect(ledger.find((r) => r.id === 'row-fresh-night-ok')?.status).toBe('dry_run');
    expect(ledger.find((r) => r.id === 'row-deferred-1')?.status).toBe('retryable');
  });

  it('4) rejects foreign or nonexistent editionId with 403/404 in POST /api/magazine/issues & preserves cover_image_url in draft sync hook', async () => {
    hoisted.requireBrokerContextMock.mockResolvedValue({
      ctx: { userId: BROKER_A_ID, slug: 'seocho-star', brokerKeys: ['seocho-star'], displayName: '이서초' },
      error: null,
    });
    hoisted.assertOwnsRowMock.mockResolvedValue(null);

    const makeIssueDb = (existingId: string | null) => ({
      from: (table: string) => {
        const res =
          table === 'broker_profiles'
            ? { user_id: BROKER_A_ID, slug: 'seocho-star' }
            : table === 'magazine_editions' && existingId
              ? { id: existingId }
              : null;
        const chain: DbChain = {
          select: () => chain,
          eq: () => chain,
          in: () => chain,
          or: () => chain,
          lte: () => chain,
          gte: () => chain,
          range: () => chain,
          order: () => chain,
          limit: () => chain,
          update: () => chain,
          maybeSingle: async () => ({ data: res, error: null }),
          then: (onF, onR) => Promise.resolve({ data: res, error: null }).then(onF ?? undefined, onR ?? undefined),
        };
        return chain;
      },
    });

    hoisted.serviceClientFactory.mockReturnValue(makeIssueDb(EDITION_FOREIGN));
    const res403 = await issuesPOST(
      new NextRequest('https://www.credeal.net/api/magazine/issues', {
        method: 'POST',
        body: JSON.stringify({ editionId: EDITION_FOREIGN, saveAsDraft: true, headline: 'x' }),
      })
    );
    expect(res403.status).toBe(403);

    hoisted.serviceClientFactory.mockReturnValue(makeIssueDb(null));
    const res404 = await issuesPOST(
      new NextRequest('https://www.credeal.net/api/magazine/issues', {
        method: 'POST',
        body: JSON.stringify({ editionId: EDITION_MISSING, saveAsDraft: true, headline: 'x' }),
      })
    );
    expect(res404.status).toBe(404);

    const hookSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/app/(broker)/broker/magazine-editor/_hooks/useNewsletterServerDraftSync.ts'),
      'utf-8'
    );
    expect(hookSrc).not.toContain('cover_image_url: null');
    expect(hookSrc).toContain('coverImageUrl !== undefined');
  });
});
