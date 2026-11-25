// @vitest-environment jsdom
/**
 * @file src/tests/workspace/inbox-p0-remediation-step12.test.tsx
 * @description Wave 1 Step 1.2 (Axis 3 + Axis 5 Inbox P0: A3-01, A3-02, A3-03, A5-01, A5-06) Verification Suite
 */
import React, { act } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { NextRequest } from 'next/server';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BROKER_ID = '11111111-1111-4111-8111-111111111111';
const BLD_ID = '22222222-2222-4222-8222-222222222222';
const GATE_ID = '33333333-3333-4333-8333-333333333333';
const SUB_ID = '44444444-4444-4444-8444-444444444444';

const mockDb = {
  broker_profiles: [{ user_id: BROKER_ID, slug: 'step12-broker' }],
  user_subscriptions: [{ user_id: BROKER_ID, tier: 'pro', status: 'active' }],
  workspace_items: [],
  building_ssot_lite: [
    {
      id: BLD_ID,
      owner_id: BROKER_ID,
      status: 'published',
      area_signal: '강남구 역삼동',
      asset_type: '오피스빌딩',
      price_band: '180억',
    },
  ],
  gate_requests: [
    {
      id: GATE_ID,
      building_id: BLD_ID,
      requester_id: null,
      requested_level: 'G2',
      requested_fields: [],
      status: 'approved',
      reason: JSON.stringify({
        name: '이승인 상무',
        phone: '010-7777-1234',
        email: 'approved-buyer@fund.kr',
        company: '그린자산운용',
        message: '상세 렌트롤 및 IM 자료 확인 요청드립니다.',
      }),
      created_at: '2026-11-22T09:00:00.000Z',
    },
  ],
  im_inquiry_requests: [],
  in_app_notifications: [],
  im_share_links: [
    {
      token: 'slk.persisted.tok1',
      building_id: BLD_ID,
      broker_id: BROKER_ID,
      recipient_id: GATE_ID,
      status: 'active',
      created_at: '2026-11-22T09:05:00.000Z',
    },
  ],
  broker_clients: [],
  magazine_subscribers: [
    {
      id: SUB_ID,
      broker_id: 'step12-broker',
      subscriber_name: '이메일전용구독자',
      subscriber_phone: null,
      phone_e164: null,
      subscriber_email: 'email-only@investor.kr',
      status: 'active',
      confirm_status: 'confirmed',
      created_at: '2026-11-22T08:00:00.000Z',
    },
  ],
  activity_events: [
    {
      id: 'ev-gate-approved-1',
      actor_id: BROKER_ID,
      event_type: 'gate_request_approved',
      entity_type: 'building',
      entity_id: BLD_ID,
      metadata: {
        thread_id: GATE_ID,
        request_id: GATE_ID,
        building_id: BLD_ID,
        share_token: 'slk.persisted.tok1',
        decision: 'approved',
      },
      created_at: '2026-11-22T09:06:00.000Z',
    },
  ],
  document_objects: [],
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/broker/w/inbox',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/auth-guard', () => ({
  requireBroker: vi.fn(async () => ({
    user: { id: BROKER_ID, role: 'broker' },
    role: 'broker',
    error: null,
  })),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from(table: string) {
      const filters: Array<(row: Record<string, any>) => boolean> = [];
      let limitVal: number | null = null;
      const run = () => {
        const rows = ((mockDb as Record<string, any[]>)[table] || []).filter((r) =>
          filters.every((fn) => fn(r))
        );
        const sliced = typeof limitVal === 'number' ? rows.slice(0, limitVal) : rows;
        return { data: sliced.map((r) => ({ ...r })), error: null, count: sliced.length };
      };
      const chain: any = {
        select: () => chain,
        eq(col: string, val: unknown) {
          filters.push((r) => String(r[col] ?? '') === String(val ?? ''));
          return chain;
        },
        in(col: string, vals: unknown[]) {
          const set = new Set(vals.map((v) => String(v)));
          filters.push((r) => set.has(String(r[col] ?? '')));
          return chain;
        },
        or: () => chain,
        order: () => chain,
        range: () => chain,
        limit(n: number) {
          limitVal = n;
          return chain;
        },
        maybeSingle: async () => {
          const res = run();
          return { data: res.data[0] ?? null, error: null };
        },
        single: async () => {
          const res = run();
          return { data: res.data[0] ?? null, error: null };
        },
        then: (onFulfilled: any, onRejected?: any) =>
          Promise.resolve(run()).then(onFulfilled, onRejected),
      };
      return chain;
    },
  }),
}));

import { toDispatchHistoryEntry } from '@/lib/inbox/inbox-helpers';
import { handleGetInbox } from '@/lib/inbox/inbox-query';
import {
  getInboxStatusBadge,
  matchesInboxThreadFilter,
  normalizeServerThread,
  type InboxThreadItem,
} from '@/app/(broker)/broker/w/inbox/_components/inbox-types';
import InboxWorkspacePage from '@/app/(broker)/broker/w/inbox/page';

describe('Wave 1 Step 1.2: Inbox P0 (A3-01, A3-02, A3-03, A5-01, A5-06)', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    window.localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  it('A3-01 & A5-06 (Server/Helper): maps gate_request_approved to dispatchHistory, includes it in queryBrokerInbox, and keeps subscriber clientPhone empty when no phone', async () => {
    const mapped = toDispatchHistoryEntry({
      id: 'ev-1',
      event_type: 'gate_request_approved',
      created_at: '2026-11-22T09:06:00.000Z',
      metadata: {
        building_id: BLD_ID,
        share_token: 'slk.tok.abc',
      },
    });
    expect(mapped).toMatchObject({
      id: 'ev-1',
      eventType: 'gate_request_approved',
      channel: 'link',
      status: 'sent',
      title: 'IM 승인 · 전용 링크 발급',
      shareUrl: `/im-lite/${BLD_ID}?token=slk.tok.abc`,
    });

    const res = await handleGetInbox(
      new NextRequest('http://localhost/api/broker/inbox?workspace=1')
    );
    expect(res.status).toBe(200);
    const json = await res.json();

    const approvedThread = (json.threads as Array<Record<string, any>>).find(
      (t) => t.id === GATE_ID
    );
    expect(approvedThread).toBeDefined();
    expect(approvedThread?.dispatchHistory?.some((d: any) => d.eventType === 'gate_request_approved')).toBe(
      true
    );

    const subThread = (json.threads as Array<Record<string, any>>).find(
      (t) => t.id === `sub_${SUB_ID}`
    );
    expect(subThread).toBeDefined();
    expect(subThread?.clientPhone).toBe('');
    expect(subThread?.clientEmail).toBe('email-only@investor.kr');
  });

  it('A3-01 & A5-06 (Types): computes "승인됨 · 미열람" badge, searches by clientEmail, and rescues @ from clientPhone', () => {
    const approvedUnread = normalizeServerThread({
      id: 'thr-app-1',
      clientName: '홍대표',
      clientPhone: 'ceo@alpha.kr',
      buildingId: BLD_ID,
      buildingTitle: '역삼 빌딩',
      gateStatus: 'approved',
      openCount: 0,
      status: 'active',
    });
    expect(approvedUnread.clientPhone).toBe('');
    expect(approvedUnread.clientEmail).toBe('ceo@alpha.kr');
    expect(getInboxStatusBadge(approvedUnread).text).toBe('승인됨 · 미열람');
    expect(matchesInboxThreadFilter(approvedUnread, 'all', 'ceo@alpha.kr')).toBe(true);
  });

  it('A3-01, A3-02, A3-03, A5-01, A5-06 (UI): single approve CTA, persistent issued link card + dispatch preview, email chip, tel guard, and <1280px labels', async () => {
    const pendingThread: InboxThreadItem = {
      id: 'thr-p0-pending',
      clientName: '정승인 부사장',
      clientPhone: 'buyer@corpfund.co.kr',
      clientEmail: 'buyer@corpfund.co.kr',
      clientCompany: '코퍼펀드',
      clientGrade: 'VIP',
      isVip: true,
      buildingTitle: '서초동 프라임빌딩',
      buildingId: BLD_ID,
      latestEvent: 'IM 열람 요청',
      cleanMessage: '투자심의위원회 제출용으로 IM 전문을 요청드립니다.',
      gateStatus: 'pending',
      updatedAt: '방금',
      openCount: 0,
      isRead: false,
      status: 'pending_gate',
      shareToken: '',
      events: [],
      dispatchHistory: [],
      budget: '200억',
      preferredRegion: '서초구',
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/api/broker/inbox/actions') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body || '{}'));
        if (body.action === 'approve_gate') {
          return new Response(
            JSON.stringify({
              ok: true,
              shareToken: 'slk.new.issued99',
              shareUrl: `/im-lite/${BLD_ID}?token=slk.new.issued99`,
            }),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (url.includes('/api/broker/share-links/revoke')) {
        return new Response(JSON.stringify({ ok: true, scope: 'thread' }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true, threads: [] }), { status: 200 });
    });

    await act(async () => {
      root.render(<InboxWorkspacePage initialThreads={[pendingThread]} />);
    });

    // A3-02: Only 1 approve button across entire screen when pending_gate
    expect(container.querySelector('[data-testid="inbox-row-approve-thr-p0-pending"]')).toBeNull();
    expect(container.querySelector('[data-testid="quick-approve-btn-thr-p0-pending"]')).toBeNull();
    expect(container.querySelector('[data-testid="primary-cta-approve-im"]')).toBeNull();
    const approveBtn = container.querySelector(
      '[data-testid="approve-gate-primary-btn"]'
    ) as HTMLButtonElement | null;
    expect(approveBtn).not.toBeNull();
    const quickReviewBtn = container.querySelector(
      '[data-testid="quick-review-btn-thr-p0-pending"]'
    ) as HTMLButtonElement | null;
    expect(quickReviewBtn?.textContent).toContain('확인·승인하기 ›');

    // Click 확인·승인하기 › to focus editor view (exits mobile list view -> shows mobile-tab-preview)
    await act(async () => {
      quickReviewBtn!.click();
    });

    // A3-03: <1280px drawer & mobile tab labels
    expect(
      container.querySelector('[data-testid="workspace-editor-preview-drawer-btn"]')?.textContent
    ).toContain('고객 정보 · 상담 기록 열기');
    expect(container.querySelector('[data-testid="mobile-tab-preview"]')?.textContent).toBe(
      '기록·고객정보'
    );

    // A5-06: Email chip visible + NO tel: link for @ email
    const emailChip = container.querySelector('[data-testid="inbox-editor-email-chip"]');
    expect(emailChip?.textContent).toContain('buyer@corpfund.co.kr');
    expect(
      container.querySelector('[data-testid="inbox-editor-email-mailto"]')?.getAttribute('href')
    ).toBe('mailto:buyer@corpfund.co.kr');
    expect(container.querySelector('a[href^="tel:"]')).toBeNull();

    // Column 3 summary shows clientCompany & buyer initial cleanMessage
    expect(
      container.querySelector('[data-testid="inbox-summary-client-company"]')?.textContent
    ).toContain('코퍼펀드');
    expect(
      container.querySelector('[data-testid="inbox-summary-clean-message"]')?.textContent
    ).toContain('투자심의위원회 제출용으로 IM 전문을 요청드립니다.');

    // A3-01 & A5-01: Approve -> persistent issued link card in Col 2 + dispatchHistory in Col 3 + "승인됨 · 미열람"
    await act(async () => {
      approveBtn!.click();
    });

    expect(
      container.querySelector('[data-testid="inbox-editor-status-badge"]')?.textContent
    ).toBe('승인됨 · 미열람');
    const approvedCard = container.querySelector('[data-testid="inbox-approved-link-card"]');
    expect(approvedCard).not.toBeNull();
    expect(approvedCard?.textContent).toContain('✓ 승인 및 전용 링크 발급 완료');
    expect(
      container.querySelector('[data-testid="inbox-approved-share-url"]')?.textContent
    ).toContain(`/im-lite/${BLD_ID}?token=slk.new.issued99`);
    expect(container.querySelector('[data-testid="inbox-copy-share-link-btn"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="inbox-todo-open-link-btn"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="inbox-copy-bundle-btn"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="lock-share-link-trigger-btn"]')).not.toBeNull();

    expect(container.querySelector('[data-testid="inbox-tab-panel-history"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="inbox-dispatch-history-list"]')?.textContent).toContain(
      'IM 승인 · 전용 링크 발급'
    );

    // Lock inline from Column 3 governance disclosure -> Col 2 revoked card with unlock button
    await act(async () => {
      (container.querySelector('[data-testid="lock-share-link-trigger-btn"]') as HTMLButtonElement).click();
    });
    await act(async () => {
      (container.querySelector('[data-testid="confirm-lock-link-btn"]') as HTMLButtonElement).click();
    });
    expect(container.querySelector('[data-testid="inbox-revoked-card"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="inbox-todo-unlock-link-btn"]')).not.toBeNull();

    await act(async () => {
      (container.querySelector('[data-testid="inbox-todo-unlock-link-btn"]') as HTMLButtonElement).click();
    });
    expect(container.querySelector('[data-testid="inbox-approved-link-card"]')).not.toBeNull();
  });

  it('A5-01: renders rejected notice card with re-approve CTA in 할 일 tab', async () => {
    const rejectedThread: InboxThreadItem = {
      id: 'thr-p0-rejected',
      clientName: '박거절 이사',
      clientPhone: '010-2222-3333',
      clientEmail: 'park@reits.kr',
      clientGrade: '일반',
      buildingTitle: '성수동 빌딩',
      buildingId: BLD_ID,
      latestEvent: 'IM 열람 요청을 거절했습니다.',
      cleanMessage: '검토용 요청',
      gateStatus: 'rejected',
      updatedAt: '방금',
      openCount: 0,
      isRead: true,
      status: 'active',
      shareToken: '',
      events: [],
      dispatchHistory: [],
      budget: '',
      preferredRegion: '',
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true, threads: [] }), { status: 200 })
    );

    await act(async () => {
      root.render(<InboxWorkspacePage initialThreads={[rejectedThread]} />);
    });

    const rejectedCard = container.querySelector('[data-testid="inbox-rejected-card"]');
    expect(rejectedCard).not.toBeNull();
    expect(container.querySelector('[data-testid="inbox-todo-reapprove-btn"]')?.textContent).toContain(
      '다시 승인·발급'
    );
    expect(container.querySelector('a[href="tel:010-2222-3333"]')).not.toBeNull();
  });
});
