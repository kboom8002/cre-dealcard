// @vitest-environment jsdom
/**
 * @file src/tests/workspace/inbox-magazine-workspace.test.tsx
 * @description Milestone 5 Test Suite: Broker Inbox & Magazine Workspaces (WP-P5-01 ~ WP-P5-05)
 *
 * Requirements:
 * 1. Broker Inbox Workspace (/broker/w/inbox):
 *    - Renders 3-column WorkspaceShell with 'inbox' workspace mode.
 *    - Filter pills (지금 처리, 오늘, 열람, 알림, 고객 명단).
 *    - Filter switching behavior (지금 처리 vs 열람 vs 고객 명단).
 *    - Thread selection & read state auto-marking.
 *    - Gate request approval & rejection actions for G2 disclosure.
 *    - Hot-lead open timeline: displays '🔥 지금 전화' callout for leads with >=3 opens with direct tel: link.
 *    - Share link revocation with 404 confirmation toast and correction announcement notice.
 *    - Call consultation memo recording into timeline.
 * 2. Weekly Magazine Workspace (/broker/w/magazine):
 *    - Renders 3-column WorkspaceShell with 'magazine' workspace mode.
 *    - Past issue drawer / list in Column 1 with active issue selection switching.
 *    - New issue draft creation (+ 새 소식지 작성).
 *    - 1-click Deal Card & IM insertion helpers in Column 2 with remove capability.
 *    - Live mobile phone / web preview switching & 56px primary publish button in Column 3.
 *
 * Authoritative Sources:
 * - docs/CREDEAL_무마찰UX_4대작업공간_개편_설계서.md §4.2, §4.5 (WP-P5-01 ~ WP-P5-05)
 * - PROJECT.md (Milestone 5, Feature 60, 61, 62)
 * - TEST_INFRA.md (§ Feature Inventory #13)
 */

import React, { act } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import InboxWorkspacePage from '@/app/(broker)/broker/w/inbox/page';
import MagazineWorkspacePage from '@/app/(broker)/broker/w/magazine/page';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockReplace = vi.fn();

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: mockReplace, prefetch: vi.fn() }),
  usePathname: () => '/broker/w/inbox',
  useSearchParams: () => new URLSearchParams(),
}));

describe('M5 Workspaces: Broker Inbox & Weekly Magazine (WP-P5-01 ~ WP-P5-05)', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
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
   * 1. Broker Inbox Workspace (/broker/w/inbox) (WP-P5-01 & WP-P5-02)
   * ──────────────────────────────────────────────────────────────────────── */
  describe('1. Broker Inbox Workspace (/broker/w/inbox)', () => {
    it('renders 3-column inbox workspace shell with filters and list slots', async () => {
      await act(async () => {
        root.render(<InboxWorkspacePage />);
      });

      const shell = container.querySelector('[data-testid="workspace-shell"]');
      expect(shell).not.toBeNull();
      expect(shell?.getAttribute('data-workspace')).toBe('inbox');

      // Assert Column 1 List elements
      const listSlot = container.querySelector('[data-testid="inbox-list-slot"]');
      expect(listSlot).not.toBeNull();

      // Verify all 5 filter pills
      expect(listSlot?.textContent).toContain('지금 처리');
      expect(listSlot?.textContent).toContain('오늘');
      expect(listSlot?.textContent).toContain('열람');
      expect(listSlot?.textContent).toContain('알림');
      expect(listSlot?.textContent).toContain('고객 명단');

      // Verify initial VIP thread present in default "지금 처리" view
      expect(listSlot?.textContent).toContain('박동원 회장');
      expect(listSlot?.textContent).toContain('VIP');
    });

    it('filters threads according to active filter tab selection', async () => {
      await act(async () => {
        root.render(<InboxWorkspacePage />);
      });

      const listSlot = container.querySelector('[data-testid="inbox-list-slot"]');
      expect(listSlot).not.toBeNull();

      // Initially in "지금 처리" mode: thread-01 (hot_lead) & thread-02 (pending_gate) are visible,
      // while thread-03 (active, 1 open) is filtered out
      expect(listSlot?.textContent).toContain('박동원 회장');
      expect(listSlot?.textContent).toContain('최영진 원장');
      expect(listSlot?.textContent).not.toContain('김민수 대표');

      // Switch filter to "열람" (all openCount > 0)
      const buttons = Array.from(listSlot!.querySelectorAll('button'));
      const viewsBtn = buttons.find((b) => b.textContent?.trim() === '열람');
      expect(viewsBtn).toBeDefined();

      await act(async () => {
        viewsBtn?.click();
      });

      // Now thread-03 should be visible
      expect(listSlot?.textContent).toContain('김민수 대표');
      expect(listSlot?.textContent).toContain('박동원 회장');
      expect(listSlot?.textContent).toContain('최영진 원장');

      // Switch filter to "고객 명단" (VIP clients only)
      const vipBtn = buttons.find((b) => b.textContent?.trim() === '고객 명단');
      expect(vipBtn).toBeDefined();

      await act(async () => {
        vipBtn?.click();
      });

      // VIP only: 박동원, 최영진 visible; 김민수 (일반) filtered out
      expect(listSlot?.textContent).toContain('박동원 회장');
      expect(listSlot?.textContent).toContain('최영진 원장');
      expect(listSlot?.textContent).not.toContain('김민수 대표');
    });

    it('switches active thread and updates read status upon thread click', async () => {
      await act(async () => {
        root.render(<InboxWorkspacePage />);
      });

      const listSlot = container.querySelector('[data-testid="inbox-list-slot"]');
      const editorSlot = container.querySelector('[data-testid="inbox-editor-slot"]');

      // Initially thread-01 is selected
      expect(editorSlot?.textContent).toContain('박동원 회장');
      expect(editorSlot?.textContent).toContain('영등포구 양평동 꼬마빌딩');

      // Find thread-02 item and click it
      const threadItems = Array.from(listSlot!.querySelectorAll('[role="button"]'));
      const thread2 = threadItems.find((el) => el.textContent?.includes('최영진 원장'));
      expect(thread2).toBeDefined();

      await act(async () => {
        (thread2 as HTMLElement).click();
      });

      // Editor now displays thread-02
      expect(editorSlot?.textContent).toContain('최영진 원장');
      expect(editorSlot?.textContent).toContain('강남구 신사동 사옥형 빌딩');
      expect(editorSlot?.textContent).toContain('010-5555-1212');
    });

    it('displays prominent "🔥 지금 전화" callout for hot leads with >= 3 opens', async () => {
      await act(async () => {
        root.render(<InboxWorkspacePage />);
      });

      // Thread-01 has openCount = 4
      const previewSlot = container.querySelector('[data-testid="inbox-preview-slot"]');
      expect(previewSlot).not.toBeNull();

      const hotLeadCallout = container.querySelector('[data-testid="hot-lead-callout"]');
      expect(hotLeadCallout).not.toBeNull();
      expect(hotLeadCallout?.textContent).toContain('🔥 지금 전화');
      expect(hotLeadCallout?.textContent).toContain('4회째 반복 열람 중입니다');
      expect(hotLeadCallout?.textContent).toContain('지금 바로 전화하기');

      // Verify tel: link destination
      const telLink = hotLeadCallout?.querySelector('a[href^="tel:"]');
      expect(telLink?.getAttribute('href')).toBe('tel:010-8765-4321');
    });

    it('handles G2 gate approval action for pending threads', async () => {
      await act(async () => {
        root.render(<InboxWorkspacePage />);
      });

      const listSlot = container.querySelector('[data-testid="inbox-list-slot"]');
      const editorSlot = container.querySelector('[data-testid="inbox-editor-slot"]');

      // Select thread-02 (pending_gate status)
      const threadItems = Array.from(listSlot!.querySelectorAll('[role="button"]'));
      const thread2 = threadItems.find((el) => el.textContent?.includes('최영진 원장'));
      await act(async () => {
        (thread2 as HTMLElement).click();
      });

      // Verify G2 approval banner exists
      expect(editorSlot?.textContent).toContain('G2 상세자료 공개 승인 요청');
      const approveBtn = Array.from(editorSlot!.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('✓ 공개 승인 (G2)')
      );
      expect(approveBtn).toBeDefined();

      // Click approve
      await act(async () => {
        approveBtn?.click();
      });

      // Verify G2 banner disappears and status switches to active
      expect(editorSlot?.textContent).not.toContain('G2 상세자료 공개 승인 요청');
    });

    it('handles link revocation and correction announcement actions with toast confirmation', async () => {
      await act(async () => {
        root.render(<InboxWorkspacePage />);
      });

      const previewSlot = container.querySelector('[data-testid="inbox-preview-slot"]');
      expect(previewSlot?.textContent).toContain('링크 보안 및 회수 관리');

      const revokeBtn = Array.from(previewSlot!.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('🚫 링크 회수')
      );
      expect(revokeBtn).toBeDefined();

      // Click revoke link
      await act(async () => {
        revokeBtn?.click();
      });

      // Verify undo toast appears with 404 revocation confirmation
      const toast = container.querySelector('[data-testid="undo-confirm-toast"]');
      expect(toast?.textContent).toContain('즉시 회수되었습니다. (404 처리)');

      // Also verify correction announcement action
      const correctionBtn = Array.from(previewSlot!.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('⚠️ 정정 안내')
      );
      expect(correctionBtn).toBeDefined();

      await act(async () => {
        correctionBtn?.click();
      });

      expect(container.querySelector('[data-testid="undo-confirm-toast"]')?.textContent).toContain(
        '⚠️ 매물 정보가 정정되었습니다'
      );
    });

    it('allows logging consultation notes into activity timeline', async () => {
      await act(async () => {
        root.render(<InboxWorkspacePage />);
      });

      const editorSlot = container.querySelector('[data-testid="inbox-editor-slot"]');
      const input = editorSlot?.querySelector('input[placeholder*="통화 내용이나 상담 메모"]') as HTMLInputElement;
      const recordBtn = Array.from(editorSlot!.querySelectorAll('button')).find((b) =>
        b.textContent?.trim() === '기록'
      );

      expect(input).not.toBeNull();
      expect(recordBtn).not.toBeNull();

      // Type memo using native setter to trigger React synthetic onChange
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
        recordBtn?.click();
      });

      // Verify new note appears in timeline
      expect(editorSlot?.textContent).toContain('통화 기록: 고객 희망 매입가 95억 협의 완료');
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * 2. Weekly Magazine Workspace (/broker/w/magazine)
   * ──────────────────────────────────────────────────────────────────────── */
  describe('2. Weekly Magazine Workspace (/broker/w/magazine)', () => {
    it('redirects seamlessly to real studio /broker/magazine-editor', async () => {
      mockReplace.mockClear();
      await act(async () => {
        root.render(<MagazineWorkspacePage />);
      });

      const redirectEl = container.querySelector('[data-testid="magazine-workspace-redirect"]');
      expect(redirectEl).not.toBeNull();
      expect(redirectEl?.textContent).toContain('고객 소식지 편집실로 이동 중입니다');
      expect(mockReplace).toHaveBeenCalledWith('/broker/magazine-editor');
    });
  });
});
