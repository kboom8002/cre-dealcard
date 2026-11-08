// @vitest-environment jsdom
import React, { act } from 'react';
import fs from 'fs';
import path from 'path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { NextRequest, NextResponse } from 'next/server';
import InboxWorkspacePage, {
  type InboxThreadItem,
} from '@/app/(broker)/broker/w/inbox/page';
import { parseGateRequestReason } from '@/app/api/broker/inbox/route';
import {
  getInboxState,
  saveInboxState,
  saveQuickImRecord,
  getQuickImRecord,
} from '@/lib/im-lite/quick-generate-store';
import { resetShareLinkTokenStoreForTests } from '@/lib/security/share-link-tokens';
import { BANNED_UI_TERMS } from '@/lib/ux/lexicon';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const mockRequireBroker = vi.fn();

vi.mock('@/lib/auth-guard', () => ({
  requireBroker: (...args: unknown[]) => mockRequireBroker(...args),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/broker/w/inbox',
  useSearchParams: () => new URLSearchParams(),
}));

describe('Client Inbox Security & UX Overhaul (IB-01 ~ IB-28)', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    window.localStorage.clear();
    resetShareLinkTokenStoreForTests();
    mockRequireBroker.mockReset();

    saveInboxState({
      revokedBuildings: {},
      correctionNotices: {},
      gateDecisions: {},
      callNotes: {},
      customClients: [],
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  /* ────────────────────────────────────────────────────────────────────────
   * 1. W0 API Security & Data Integrity (IB-01 ~ IB-05, IB-09, IB-28)
   * ──────────────────────────────────────────────────────────────────────── */
  describe('1. W0 API Security & Data Integrity', () => {
    it('GET /api/broker/inbox?workspace=1 returns 401 when unauthenticated and isolates customClients by userId (IB-01, IB-02)', async () => {
      const { GET } = await import('@/app/api/broker/inbox/route');

      // 1. Unauthenticated -> 401 even with ?workspace=1
      mockRequireBroker.mockResolvedValueOnce({
        user: null,
        error: NextResponse.json({ ok: false, error: '인증이 필요합니다.' }, { status: 401 }),
      });

      const unauthReq = new NextRequest(
        'http://localhost/api/broker/inbox?workspace=1'
      );
      const unauthRes = await GET(unauthReq);
      expect(unauthRes.status).toBe(401);

      // 2. Seed customClients for two different brokers
      const state = getInboxState();
      state.customClients = [
        {
          id: 'custom_broker_a',
          ownerId: 'broker-a',
          clientName: 'A중개인 전용고객',
          clientGrade: 'VIP',
          clientPhone: '010-1111-2222',
          budget: '100억',
          preferredRegion: '강남구',
          buildingId: 'bld-01',
          buildingTitle: '양평동 빌딩',
          createdAt: new Date().toISOString(),
        },
        {
          id: 'custom_broker_b',
          ownerId: 'broker-b',
          clientName: 'B중개인 비밀고객',
          clientGrade: 'VIP',
          clientPhone: '010-9999-8888',
          budget: '200억',
          preferredRegion: '서초구',
          buildingId: 'bld-02',
          buildingTitle: '신사동 빌딩',
          createdAt: new Date().toISOString(),
        },
      ];
      saveInboxState(state);

      mockRequireBroker.mockResolvedValueOnce({
        user: { id: 'broker-a', email: 'a@example.com', role: 'broker' },
        error: null,
      });

      const authReq = new NextRequest('http://localhost/api/broker/inbox?workspace=1');
      const authRes = await GET(authReq);
      expect(authRes.status).toBe(200);
      const json = await authRes.json();

      expect(json.ok).toBe(true);
      const customNames = (json.inboxState?.customClients || []).map(
        (c: any) => c.clientName
      );
      expect(customNames).toContain('A중개인 전용고객');
      expect(customNames).not.toContain('B중개인 비밀고객');
    });

    it('parseGateRequestReason parses anonymous lead JSON cleanly without leaking raw JSON (IB-09)', () => {
      const rawJson = JSON.stringify({
        type: 'anonymous_lead',
        name: '한지수 대표',
        phone: '010-9876-5432',
        company: '한솔메디컬',
        message: '전층 임대 조건과 렌트롤을 확인하고 싶습니다.',
      });

      const parsed = parseGateRequestReason(
        rawJson,
        { name: '역삼동 메디컬빌딩', address: '서울 강남구 역삼동 123' },
        'bld-yeoksam'
      );

      expect(parsed.requesterName).toBe('한지수 대표');
      expect(parsed.requesterPhone).toBe('010-9876-5432');
      expect(parsed.requesterCompany).toBe('한솔메디컬');
      expect(parsed.cleanMessage).toBe('전층 임대 조건과 렌트롤을 확인하고 싶습니다.');
      expect(parsed.buildingTitle).toContain('역삼동');
    });

    it('POST /api/broker/inbox/actions enforces ownership on non-UUID buildingId (403) and supports custom_ client actions (IB-03, IB-04)', async () => {
      const { POST } = await import('@/app/api/broker/inbox/actions/route');

      // Mark non-UUID building 'bld-02' as owned by 'broker-other'
      const rec = getQuickImRecord('bld-02');
      if (rec) {
        saveQuickImRecord({ ...rec, ownerId: 'broker-other' });
      }

      mockRequireBroker.mockResolvedValueOnce({
        user: { id: 'broker-me', email: 'me@example.com', role: 'broker' },
        error: null,
      });

      const forbiddenReq = new NextRequest('http://localhost/api/broker/inbox/actions', {
        method: 'POST',
        body: JSON.stringify({
          action: 'approve_gate',
          threadId: 'req-non-uuid',
          buildingId: 'bld-02',
        }),
      });
      const forbiddenRes = await POST(forbiddenReq);
      expect(forbiddenRes.status).toBe(403);

      // Reset ownerId on bld-02
      if (rec) {
        saveQuickImRecord({ ...rec, ownerId: undefined });
      }

      // Custom client thread send_im & log_call by owning broker
      mockRequireBroker.mockResolvedValue({
        user: { id: 'broker-me', email: 'me@example.com', role: 'broker' },
        error: null,
      });

      const sendImReq = new NextRequest('http://localhost/api/broker/inbox/actions', {
        method: 'POST',
        body: JSON.stringify({
          action: 'send_im',
          threadId: 'custom_101',
          buildingId: 'bld-01',
        }),
      });
      const sendImRes = await POST(sendImReq);
      expect(sendImRes.status).toBe(200);
      const sendImJson = await sendImRes.json();
      expect(sendImJson.ok).toBe(true);
      expect(sendImJson.shareToken).toMatch(/^slk\./);
      expect(sendImJson.shareUrl).toContain('/im-lite/bld-01?token=');

      const logCallReq = new NextRequest('http://localhost/api/broker/inbox/actions', {
        method: 'POST',
        body: JSON.stringify({
          action: 'log_call',
          threadId: 'custom_101',
          buildingId: 'bld-01',
          note: '금요일 14시 현장 미팅 확정',
        }),
      });
      const logCallRes = await POST(logCallReq);
      expect(logCallRes.status).toBe(200);
      const logCallJson = await logCallRes.json();
      expect(logCallJson.ok).toBe(true);
      expect(logCallJson.persisted).toBe(true);
    });

    it('GET /api/broker/inbox/pending-count returns { ok: true, count: 0 } when unauthenticated (IB-28)', async () => {
      const { GET } = await import('@/app/api/broker/inbox/pending-count/route');

      mockRequireBroker.mockResolvedValueOnce({
        user: null,
        error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      });

      const req = new NextRequest('http://localhost/api/broker/inbox/pending-count');
      const res = await GET(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({ ok: true, count: 0 });
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * 2. W2/W3/W4 Inbox UI Flow, Lexicon & Accessibility (IB-06 ~ IB-27)
   * ──────────────────────────────────────────────────────────────────────── */
  describe('2. W2/W3/W4 Client Inbox UI & Accessibility', () => {
    it('renders friendly empty state without fake seeds when there are no threads (IB-06)', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, threads: [], items: [] }),
      } as Response);

      await act(async () => {
        root.render(<InboxWorkspacePage />);
      });

      const emptyState = container.querySelector('[data-testid="inbox-empty-state"]');
      expect(emptyState).not.toBeNull();
      expect(emptyState?.textContent).toContain(
        '아직 도착한 요청이 없어요. 딜카드를 보내면 고객의 IM 요청이 여기에 모입니다.'
      );
      expect(emptyState?.textContent).toContain('+ 고객 직접 등록');

      // Ensure fake seeds are NOT rendered
      expect(container.textContent).not.toContain('김태호 대표');
      expect(container.textContent).not.toContain('박현우 이사');
      expect(container.textContent).not.toContain('이서연 실장');
      expect(container.textContent).not.toContain('박동원 회장');
    });

    it('renders todo summary card, 3 filter chips, 3 editor tabs, disabled call button when phone is empty, and inline link lock confirmation without window.prompt (IB-07, IB-11 ~ IB-16)', async () => {
      const sampleThreads: InboxThreadItem[] = [
        {
          id: 'req-pending-1',
          clientName: '정우성 원장',
          clientPhone: '', // empty phone -> must not become 010-0000-0000
          clientCompany: '정우메디컬',
          clientGrade: 'VIP',
          buildingTitle: '강남구 신사동 코너빌딩',
          buildingId: 'bld-02',
          latestEvent: 'IM 열람 요청: 병원 이전 부지 검토',
          cleanMessage: '병원 이전 부지 검토를 위해 층별 임대 현황을 요청합니다.',
          gateStatus: 'pending',
          updatedAt: '방금',
          openCount: 2,
          isRead: false,
          status: 'pending_gate',
          shareToken: 'slk-test-token',
          events: [
            {
              id: 'ev-1',
              eventType: 'gate_request',
              description: 'IM 열람 요청: 병원 이전 부지 검토',
              timestamp: '방금',
            },
          ],
          budget: '150억',
          preferredRegion: '강남구 신사동',
        },
      ];

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          shareToken: 'slk.issued.token',
          shareUrl: '/im-lite/bld-02?token=slk.issued.token',
        }),
      } as Response);

      await act(async () => {
        root.render(<InboxWorkspacePage initialThreads={sampleThreads} />);
      });

      // Column 1: "지금 할 일 1건" summary card with 1-click [자료 보내기]
      const todoSummary = container.querySelector(
        '[data-testid="inbox-todo-summary-card"]'
      );
      expect(todoSummary).not.toBeNull();
      expect(todoSummary?.textContent).toContain('지금 할 일 1건');
      expect(todoSummary?.textContent).toContain('자료 보내기');

      // Column 1: 3 filter chips (할 일 · 열람 · 전체 고객)
      const filterTabs = container.querySelector('[data-testid="inbox-filter-tabs"]');
      expect(filterTabs?.getAttribute('role')).toBe('tablist');
      const filterButtons = filterTabs?.querySelectorAll('[role="tab"]');
      expect(filterButtons?.length).toBe(3);
      expect(filterTabs?.textContent).toContain('할 일');
      expect(filterTabs?.textContent).toContain('열람');
      expect(filterTabs?.textContent).toContain('전체 고객');

      // Column 2: 3 editor tabs (할 일 · 메시지 · 기록)
      const editorTabs = container.querySelector(
        '[data-testid="inbox-editor-primary-tabs"]'
      );
      expect(editorTabs?.getAttribute('role')).toBe('tablist');
      const editorTabButtons = editorTabs?.querySelectorAll('[role="tab"]');
      expect(editorTabButtons?.length).toBe(3);
      expect(editorTabs?.textContent).toContain('할 일');
      expect(editorTabs?.textContent).toContain('메시지');
      expect(editorTabs?.textContent).toContain('기록');

      // Pending request defaults to "할 일" tab showing reason + [자료 보내기(승인)] + [거절]
      const pendingCard = container.querySelector(
        '[data-testid="inbox-pending-gate-card"]'
      );
      expect(pendingCard).not.toBeNull();
      expect(pendingCard?.textContent).toContain(
        '병원 이전 부지 검토를 위해 층별 임대 현황을 요청합니다.'
      );
      expect(
        container.querySelector('[data-testid="approve-gate-primary-btn"]')
      ).not.toBeNull();
      expect(container.querySelector('[data-testid="reject-gate-btn"]')).not.toBeNull();

      // Empty phone number disables call button with "전화번호 없음" and never shows 010-0000-0000
      const disabledCallBtn = container.querySelector(
        '[data-testid="preview-call-disabled"]'
      ) as HTMLButtonElement;
      expect(disabledCallBtn).not.toBeNull();
      expect(disabledCallBtn.disabled).toBe(true);
      expect(disabledCallBtn.textContent).toContain('전화번호 없음');
      expect(container.textContent).not.toContain('010-0000-0000');

      // Inline "보낸 링크 잠그기" confirmation without window.prompt
      const promptSpy = vi.spyOn(window, 'prompt');
      const lockTriggerBtn = container.querySelector(
        '[data-testid="lock-share-link-trigger-btn"]'
      ) as HTMLButtonElement;
      expect(lockTriggerBtn).not.toBeNull();

      await act(async () => {
        lockTriggerBtn.click();
      });

      const inlineConfirm = container.querySelector(
        '[data-testid="lock-share-link-inline-confirm"]'
      );
      expect(inlineConfirm).not.toBeNull();
      expect(inlineConfirm?.textContent).toContain('이 고객의 열람 링크를 잠글까요?');
      expect(promptSpy).not.toHaveBeenCalled();

      const confirmLockBtn = container.querySelector(
        '[data-testid="confirm-lock-link-btn"]'
      ) as HTMLButtonElement;
      await act(async () => {
        confirmLockBtn.click();
      });

      expect(container.textContent).toContain('링크 잠김');
    });

    it('opens accessible client registration modal with role="dialog", aria-modal="true", label-input htmlFor/id, and closes on Escape (IB-26)', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, threads: [] }),
      } as Response);

      await act(async () => {
        root.render(<InboxWorkspacePage />);
      });

      const openBtn = container.querySelector(
        '[data-testid="open-new-client-modal-btn"]'
      ) as HTMLButtonElement;
      await act(async () => {
        openBtn.click();
      });

      const dialog = container.querySelector(
        '[data-testid="inbox-new-client-dialog"]'
      );
      expect(dialog).not.toBeNull();
      expect(dialog?.getAttribute('role')).toBe('dialog');
      expect(dialog?.getAttribute('aria-modal')).toBe('true');

      const nameLabel = dialog?.querySelector('label[for="new-client-name"]');
      const nameInput = dialog?.querySelector('#new-client-name');
      expect(nameLabel).not.toBeNull();
      expect(nameInput).not.toBeNull();

      // Press Escape to close
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      });
      expect(
        container.querySelector('[data-testid="inbox-new-client-dialog"]')
      ).toBeNull();
    });

    it('enforces zero <14px font classes and zero banned lexicon terms across owned Inbox files (W3, W4)', () => {
      const filesToCheck = [
        'src/app/(broker)/broker/w/inbox/page.tsx',
        'src/components/broker/GateRequestForm.tsx',
        'src/components/broker/GateRequestsInbox.tsx',
      ];
      const sub14Regex = /\btext-(?:xs|\[(?:9|10|11|12|13)px\])\b/g;

      for (const rel of filesToCheck) {
        const abs = path.resolve(process.cwd(), rel);
        const content = fs.readFileSync(abs, 'utf-8');
        const sub14Matches = content.match(sub14Regex) || [];
        expect(sub14Matches, `${rel} contains <14px classes`).toEqual([]);

        const banned = BANNED_UI_TERMS.filter((b) => b.term.test(content)).map(
          (b) => b.term.source
        );
        expect(banned, `${rel} contains banned lexicon terms`).toEqual([]);
        expect(content).not.toContain('소식지');
      }
    });
  });
});
