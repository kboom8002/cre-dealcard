// @vitest-environment jsdom
/**
 * @file src/tests/workspace/inbox-magazine-workspace.test.tsx
 * @description Broker Inbox & Magazine Workspaces Verification Suite (WP-P5-01 ~ WP-P5-05, IB-01 ~ IB-28)
 */

import React, { act } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import InboxWorkspacePage, {
  type InboxThreadItem,
} from '@/app/(broker)/broker/w/inbox/page';
import MagazineWorkspacePage from '@/app/(broker)/broker/w/magazine/page';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockReplace = vi.fn();

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: mockReplace, prefetch: vi.fn() }),
  usePathname: () => '/broker/w/inbox',
  useSearchParams: () => new URLSearchParams(),
}));

const SAMPLE_THREADS: InboxThreadItem[] = [
  {
    id: 'thread-01',
    clientName: '박동원 회장',
    clientPhone: '010-8765-4321',
    clientGrade: 'VIP',
    buildingTitle: '영등포구 양평동 꼬마빌딩',
    buildingId: 'bld-01',
    latestEvent: '4회 반복 열람',
    cleanMessage: '수익률 및 명도 조건 검토 중',
    updatedAt: '방금',
    openCount: 4,
    isRead: false,
    status: 'high_interest',
    shareToken: 'tok-01',
    events: [
      {
        id: 'ev-01',
        eventType: 'dwell',
        description: '06 렌트롤 집중 열람',
        timestamp: '방금',
        sectionName: '06 렌트롤',
      },
    ],
    budget: '100억',
    preferredRegion: '영등포구 양평동',
    focusedSections: ['06 렌트롤', '04 수익률'],
  },
  {
    id: 'thread-02',
    clientName: '최영진 원장',
    clientPhone: '010-5555-1212',
    clientGrade: 'VIP',
    buildingTitle: '강남구 신사동 사옥형 빌딩',
    buildingId: 'bld-02',
    latestEvent: 'IM 열람 요청',
    cleanMessage: '병원 이전 부지 검토를 위해 IM 요청드립니다.',
    gateStatus: 'pending',
    updatedAt: '5분 전',
    openCount: 2,
    isRead: false,
    status: 'pending_gate',
    shareToken: 'tok-02',
    events: [
      {
        id: 'ev-02',
        eventType: 'gate_request',
        description: 'IM 열람 요청',
        timestamp: '5분 전',
      },
    ],
    budget: '150억',
    preferredRegion: '강남구 신사동',
  },
  {
    id: 'thread-03',
    clientName: '김민수 대표',
    clientPhone: '010-3333-4444',
    clientGrade: '일반',
    buildingTitle: '마포구 서교동 근생빌딩',
    buildingId: 'bld-03',
    latestEvent: '1회 열람',
    cleanMessage: '상세 자료를 열람했습니다.',
    updatedAt: '1시간 전',
    openCount: 1,
    isRead: true,
    status: 'active',
    shareToken: 'tok-03',
    events: [
      {
        id: 'ev-03',
        eventType: 'open',
        description: '상세 자료를 열람했습니다.',
        timestamp: '1시간 전',
      },
    ],
    budget: '70억',
    preferredRegion: '마포구 서교동',
  },
];

describe('M5 Workspaces: Broker Inbox & Weekly Magazine (WP-P5-01 ~ WP-P5-05)', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    window.localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        threads: SAMPLE_THREADS,
        inventory: [
          {
            buildingId: 'bld-alt-01',
            title: '영등포구 당산동 코너 근생빌딩',
            region: '영등포구 당산동',
            priceBand: '95억',
            askingPriceManwon: 950000,
            capRatePct: 4.5,
          },
        ],
      }),
    } as Response);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  describe('1. Broker Inbox Workspace (/broker/w/inbox)', () => {
    it('renders 3-column inbox workspace shell with filters and list slots', async () => {
      await act(async () => {
        root.render(<InboxWorkspacePage initialThreads={SAMPLE_THREADS} />);
      });

      const shell = container.querySelector('[data-testid="workspace-shell"]');
      expect(shell).not.toBeNull();
      expect(shell?.getAttribute('data-workspace')).toBe('inbox');

      const listSlot = container.querySelector('[data-testid="inbox-list-slot"]');
      expect(listSlot).not.toBeNull();

      expect(listSlot?.textContent).toContain('할 일');
      expect(listSlot?.textContent).toContain('열람');
      expect(listSlot?.textContent).toContain('전체 고객');

      expect(listSlot?.textContent).toContain('박동원 회장');
      const summaryCard = container.querySelector('[data-testid="inbox-client-summary-card"]');
      expect(summaryCard?.textContent).toContain('VIP');
    });

    it('filters threads according to active filter tab selection', async () => {
      await act(async () => {
        root.render(<InboxWorkspacePage initialThreads={SAMPLE_THREADS} />);
      });

      const listSlot = container.querySelector('[data-testid="inbox-list-slot"]');
      expect(listSlot).not.toBeNull();

      // Initially in "할 일" mode: thread-01 (openCount=4 >= 3) & thread-02 (pending_gate) are visible,
      // while thread-03 (active, 1 open) is filtered out
      expect(listSlot?.textContent).toContain('박동원 회장');
      expect(listSlot?.textContent).toContain('최영진 원장');
      expect(listSlot?.textContent).not.toContain('김민수 대표');

      const viewsTab = container.querySelector(
        '[data-testid="inbox-filter-chip-views"]'
      ) as HTMLButtonElement;
      expect(viewsTab).not.toBeNull();

      await act(async () => {
        viewsTab.click();
      });

      expect(listSlot?.textContent).toContain('김민수 대표');
      expect(listSlot?.textContent).toContain('박동원 회장');
      expect(listSlot?.textContent).toContain('최영진 원장');
    });

    it('switches active thread and updates read status upon thread click', async () => {
      await act(async () => {
        root.render(<InboxWorkspacePage initialThreads={SAMPLE_THREADS} />);
      });

      const editorSlot = container.querySelector('[data-testid="inbox-editor-slot"]');
      expect(editorSlot?.textContent).toContain('박동원 회장');
      expect(editorSlot?.textContent).toContain('영등포구 양평동 꼬마빌딩');

      const thread2 = container.querySelector(
        '[data-testid="inbox-thread-row-thread-02"]'
      ) as HTMLElement;
      expect(thread2).not.toBeNull();

      await act(async () => {
        thread2.click();
      });

      expect(editorSlot?.textContent).toContain('최영진 원장');
      expect(editorSlot?.textContent).toContain('강남구 신사동 사옥형 빌딩');
      expect(editorSlot?.textContent).toContain('010-5555-1212');
    });

    it('displays prominent high-interest callout for leads with >= 3 opens', async () => {
      await act(async () => {
        root.render(<InboxWorkspacePage initialThreads={SAMPLE_THREADS} />);
      });

      const editorSlot = container.querySelector('[data-testid="inbox-editor-slot"]');
      expect(editorSlot?.textContent).toContain('관심 높음');

      const summaryCard = container.querySelector('[data-testid="inbox-client-summary-card"]');
      expect(summaryCard?.textContent).toContain('4회');

      const telLink = container.querySelector('[data-testid="preview-call-link"]');
      expect(telLink?.getAttribute('href')).toBe('tel:010-8765-4321');
    });

    it('handles G2 gate approval action for pending threads', async () => {
      await act(async () => {
        root.render(<InboxWorkspacePage initialThreads={SAMPLE_THREADS} />);
      });

      const thread2 = container.querySelector(
        '[data-testid="inbox-thread-row-thread-02"]'
      ) as HTMLElement;
      await act(async () => {
        thread2.click();
      });

      const pendingCard = container.querySelector('[data-testid="inbox-pending-gate-card"]');
      expect(pendingCard).not.toBeNull();

      const approveBtn = container.querySelector(
        '[data-testid="approve-gate-primary-btn"]'
      ) as HTMLButtonElement;
      expect(approveBtn).not.toBeNull();

      await act(async () => {
        approveBtn.click();
      });

      expect(container.querySelector('[data-testid="inbox-pending-gate-card"]')).toBeNull();
    });

    it('handles inline link lock and correction announcement actions with toast confirmation', async () => {
      await act(async () => {
        root.render(<InboxWorkspacePage initialThreads={SAMPLE_THREADS} />);
      });

      const lockBtn = container.querySelector(
        '[data-testid="lock-share-link-trigger-btn"]'
      ) as HTMLButtonElement;
      expect(lockBtn).not.toBeNull();

      await act(async () => {
        lockBtn.click();
      });

      const confirmLockBtn = container.querySelector(
        '[data-testid="confirm-lock-link-btn"]'
      ) as HTMLButtonElement;
      expect(confirmLockBtn).not.toBeNull();

      await act(async () => {
        confirmLockBtn.click();
      });

      expect(container.textContent).toContain('링크 잠김');

      const openCorrBtn = container.querySelector(
        '[data-testid="open-correction-notice-btn"]'
      ) as HTMLButtonElement;
      expect(openCorrBtn).not.toBeNull();

      await act(async () => {
        openCorrBtn.click();
      });

      const submitCorrBtn = container.querySelector(
        '[data-testid="submit-correction-notice-btn"]'
      ) as HTMLButtonElement;
      await act(async () => {
        submitCorrBtn.click();
      });

      expect(container.querySelector('[data-testid="undo-confirm-toast"]')?.textContent).toContain(
        '매물 정보가 정정되었습니다'
      );
    });

    it('allows logging consultation notes into activity timeline', async () => {
      await act(async () => {
        root.render(<InboxWorkspacePage initialThreads={SAMPLE_THREADS} />);
      });

      const historyTab = container.querySelector(
        '[data-testid="inbox-editor-tab-history"]'
      ) as HTMLButtonElement;
      await act(async () => {
        historyTab.click();
      });

      const input = container.querySelector(
        '[data-testid="inbox-call-note-input"]'
      ) as HTMLInputElement;
      const recordBtn = container.querySelector(
        '[data-testid="save-call-note-btn"]'
      ) as HTMLButtonElement;

      expect(input).not.toBeNull();
      expect(recordBtn).not.toBeNull();

      await act(async () => {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          'value'
        )?.set;
        nativeSetter?.call(input, '고객 희망 매입가 95억 협의 완료');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });

      await act(async () => {
        recordBtn.click();
      });

      expect(container.textContent).toContain('통화 기록: 고객 희망 매입가 95억 협의 완료');
    });

    it('renders section dwell badges and client summary metadata', async () => {
      await act(async () => {
        root.render(<InboxWorkspacePage initialThreads={SAMPLE_THREADS} />);
      });

      const todoPanel = container.querySelector('[data-testid="inbox-tab-panel-todo"]');
      expect(todoPanel).not.toBeNull();
      expect(todoPanel?.textContent).toContain('집중 열람 항목: 06 렌트롤 · 04 수익률');

      const summaryCard = container.querySelector('[data-testid="inbox-client-summary-card"]');
      expect(summaryCard).not.toBeNull();
      expect(summaryCard?.textContent).toContain('100억');
      expect(summaryCard?.textContent).toContain('영등포구 양평동');
    });

    it('supports accessible VIP client registration modal', async () => {
      await act(async () => {
        root.render(<InboxWorkspacePage initialThreads={SAMPLE_THREADS} />);
      });

      const openBtn = container.querySelector(
        '[data-testid="open-new-client-modal-btn"]'
      ) as HTMLButtonElement;
      expect(openBtn).not.toBeNull();

      await act(async () => {
        openBtn.click();
      });

      const nameInput = container.querySelector('#new-client-name') as HTMLInputElement;
      const submitBtn = container.querySelector(
        '[data-testid="submit-new-client-btn"]'
      ) as HTMLButtonElement;

      await act(async () => {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          'value'
        )?.set;
        nativeSetter?.call(nameInput, '정태영 부회장');
        nameInput.dispatchEvent(new Event('input', { bubbles: true }));
        nameInput.dispatchEvent(new Event('change', { bubbles: true }));
      });

      await act(async () => {
        submitBtn.click();
      });

      expect(container.textContent).toContain('정태영 부회장');
    });
  });

  describe('2. Weekly Magazine Workspace (/broker/w/magazine)', () => {
    it('redirects seamlessly to real studio /broker/magazine-editor', async () => {
      mockReplace.mockClear();
      await act(async () => {
        root.render(<MagazineWorkspacePage />);
      });

      const redirectEl = container.querySelector('[data-testid="magazine-workspace-redirect"]');
      expect(redirectEl).not.toBeNull();
      expect(redirectEl?.textContent).toContain('뉴스레터 편집실로 이동 중입니다');
      expect(mockReplace).toHaveBeenCalledWith('/broker/magazine-editor');
    });
  });
});
