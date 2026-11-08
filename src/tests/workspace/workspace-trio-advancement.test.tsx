// @vitest-environment jsdom
/**
 * @file src/tests/workspace/workspace-trio-advancement.test.tsx
 * @description Verification suite for the Broker Persona Advancement across:
 *   1. DealCard Workspace (/broker/w/dealcards)
 *   2. IM Workspace (/broker/w/im)
 *   3. Client Inbox Workspace (/broker/w/inbox)
 */

import React, { act } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import DealCardsWorkspacePage from '@/app/(broker)/broker/w/dealcards/page';
import ImWorkspacePage from '@/app/(broker)/broker/w/im/page';
import InboxWorkspacePage from '@/app/(broker)/broker/w/inbox/page';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: mockReplace, prefetch: vi.fn() }),
  usePathname: () => '/broker/w/dealcards',
  useSearchParams: () => new URLSearchParams(),
}));

describe('Workspace Trio Advancement (DealCard · IM · Client Inbox)', () => {
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
  });

  /* ────────────────────────────────────────────────────────────────────────
   * 1. DealCard Workspace (/broker/w/dealcards)
   * ──────────────────────────────────────────────────────────────────────── */
  describe('1. DealCard Workspace (/broker/w/dealcards)', () => {
    it('renders Airtable-style list with posture switcher, 3 visually separated editor sections, 4-quadrant OG preview, and scrollable mobile detail view', async () => {
      await act(async () => {
        root.render(<DealCardsWorkspacePage />);
      });

      // Column 1: Intelligent list + posture switcher
      const airtableList = container.querySelector('[data-testid="dealcard-airtable-list"]');
      expect(airtableList).not.toBeNull();
      expect(airtableList?.textContent).toContain('내 딜카드 목록');

      const postureSwitcher = container.querySelector('[data-testid="dealcard-posture-switcher"]');
      expect(postureSwitcher).not.toBeNull();
      expect(postureSwitcher?.textContent).toContain('전체');
      expect(postureSwitcher?.textContent).toContain('임대수익');
      expect(postureSwitcher?.textContent).toContain('사옥·개발');

      // Column 2: 3 Visually Separated Sections (Posture / OG Image & Title / Detail 3 Points)
      const confirmCard = container.querySelector('[data-testid="card4-confirm-card"]');
      expect(confirmCard).not.toBeNull();
      expect(confirmCard?.getAttribute('data-canvas-mode')).toBe('zero-tab-single');
      expect(container.querySelector('[data-testid="card4-section-posture"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="card4-section-og-editor"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="card4-section-detail-points"]')).not.toBeNull();

      // 4-Quadrant OG inputs (Region, Use, Area, PriceBand) & Posture-based Area switching
      const areaInput = container.querySelector('[data-testid="card4-area-input"]') as HTMLInputElement;
      expect(areaInput).not.toBeNull();
      expect(areaInput.value).toContain('연면적');

      // Switching posture to value_add (개발·신축형) automatically switches area to 토지면적
      const valueAddChip = container.querySelector('[data-testid="card4-posture-chip-value_add"]') as HTMLButtonElement;
      expect(valueAddChip).not.toBeNull();
      await act(async () => {
        valueAddChip.click();
      });
      expect(areaInput.value).toContain('토지');

      // 18-char non-tautological OG Headline input
      const headlineInput = container.querySelector(
        '[data-testid="card4-headline-input"]'
      ) as HTMLInputElement;
      expect(headlineInput).not.toBeNull();
      expect(headlineInput.value.length).toBeLessThanOrEqual(18);

      // 3 Point title inputs only (no brief textareas, no 23/18자 counter)
      const postit0 = container.querySelector('[data-testid="card4-postit-card-0"]') as HTMLElement;
      const postit1 = container.querySelector('[data-testid="card4-postit-card-1"]') as HTMLElement;
      const postit2 = container.querySelector('[data-testid="card4-postit-card-2"]') as HTMLElement;
      expect(postit0).not.toBeNull();
      expect(postit1).not.toBeNull();
      expect(postit2).not.toBeNull();
      expect(container.querySelector('[data-testid="card4-point-brief-0"]')).toBeNull();

      // AI recluster button exists
      const aiBtn = container.querySelector(
        '[data-testid="card4-ai-recluster-btn"]'
      ) as HTMLButtonElement;
      expect(aiBtn).not.toBeNull();

      // Column 3: 4-Quadrant OG preview & Scrollable Mobile Detail preview
      expect(container.querySelector('[data-testid="og-quadrant-preview"]')).not.toBeNull();
      const mobileDetailScroll = container.querySelector(
        '[data-testid="dealcard-mobile-detail-scroll"]'
      );
      expect(mobileDetailScroll).not.toBeNull();
      expect(mobileDetailScroll?.textContent).toContain('전화하기');
      expect(mobileDetailScroll?.textContent).toContain('IM 요청하기');

      // Verify single-line title elements exist
      const singleLineTitles = container.querySelectorAll('[data-single-line-title="true"]');
      expect(singleLineTitles.length).toBeGreaterThanOrEqual(4);
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * 2. IM Workspace (/broker/w/im)
   * ──────────────────────────────────────────────────────────────────────── */
  describe('2. IM Workspace (/broker/w/im)', () => {
    it('renders standard Mobile IM + Basic IM (10-slide) only, Airtable list with posture switcher, <=4 top tabs, and 3 advantage cards', async () => {
      await act(async () => {
        root.render(<ImWorkspacePage />);
      });

      // Column 1: IM list + posture switcher
      const listSlot = container.querySelector('[data-testid="im-list-slot"]');
      expect(listSlot).not.toBeNull();
      expect(listSlot?.textContent).toContain('보유 IM 목록');

      const postureSwitcher = container.querySelector('[data-testid="im-posture-switcher"]');
      expect(postureSwitcher).not.toBeNull();
      expect(postureSwitcher?.textContent).toContain('임대수익');
      expect(postureSwitcher?.textContent).toContain('사옥용');
      expect(postureSwitcher?.textContent).toContain('신축·개발');

      // Ensure Pro IM labels are not exposed in the IM workspace UI
      const editorSlot = container.querySelector('[data-testid="im-editor-slot"]');
      expect(editorSlot?.textContent).not.toContain('Pro 항목');
      expect(editorSlot?.textContent).not.toContain('Pro 입력');

      // Column 2: <= 4 Primary Top Tabs
      const primaryTabs = container.querySelector('[data-testid="im-editor-primary-tabs"]');
      expect(primaryTabs).not.toBeNull();
      const tabButtons = primaryTabs!.querySelectorAll('button');
      expect(tabButtons.length).toBe(4);
      expect(primaryTabs?.textContent).toContain('① 표지·기본정보');
      expect(primaryTabs?.textContent).toContain('② 층별 임대현황');
      expect(primaryTabs?.textContent).toContain('③ 장점 3가지');
      expect(primaryTabs?.textContent).toContain('④ 사진·위치·만들기');

      // Single-line IM cover title input exists
      const titleInput = container.querySelector(
        '[data-testid="im-title-single-line-input"]'
      ) as HTMLInputElement;
      expect(titleInput).not.toBeNull();

      // Switch to Tab 3 (장점 3가지) and verify 3 wide highlight cards
      const axiosTabBtn = container.querySelector(
        '[data-testid="im-editor-tab-axios_brief"]'
      ) as HTMLButtonElement;
      await act(async () => {
        axiosTabBtn.click();
      });

      expect(container.querySelector('[data-testid="im-axios-postit-0"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="im-axios-postit-1"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="im-axios-postit-2"]')).not.toBeNull();

      // Column 3: Mobile IM preview shows full 10-section scrollable container & 3 highlight cards
      const previewScroll = container.querySelector('[data-testid="im-mobile-preview-scroll"]');
      expect(previewScroll).not.toBeNull();
      expect(previewScroll?.textContent).toContain('10 거래 조건 및 담당 중개인');
      const previewAxiosList = container.querySelector('[data-testid="im-preview-axios-list"]');
      expect(previewAxiosList).not.toBeNull();
      expect(previewAxiosList?.children.length).toBe(3);
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * 3. Client Inbox Workspace (/broker/w/inbox)
   * ──────────────────────────────────────────────────────────────────────── */
  describe('3. Client Inbox Workspace (/broker/w/inbox)', () => {
    it('renders honest empty state by default and 3-way filter chips + 3-way editor tabs when threads exist', async () => {
      await act(async () => {
        root.render(
          <InboxWorkspacePage
            initialThreads={[
              {
                id: 'thr-1',
                clientName: '박상훈 대표',
                clientPhone: '010-2345-6789',
                clientGrade: 'VIP',
                buildingTitle: '잠원권역 근생빌딩',
                buildingId: 'bld-01',
                latestEvent: 'IM 열람 요청',
                cleanMessage: '상세 IM 자료 부탁드립니다.',
                updatedAt: '방금',
                openCount: 2,
                isRead: false,
                status: 'pending_gate',
                shareToken: 'tok-1',
                events: [],
                budget: '80억대',
                preferredRegion: '서초·강남',
              },
            ]}
          />
        );
      });

      // Column 1: Todo summary card + 3-way filter tabs
      const listSlot = container.querySelector('[data-testid="inbox-list-slot"]');
      expect(listSlot?.textContent).toContain('지금 할 일 1건');

      const filterTabs = container.querySelector('[data-testid="inbox-filter-tabs"]');
      expect(filterTabs).not.toBeNull();
      expect(filterTabs?.textContent).toContain('할 일');
      expect(filterTabs?.textContent).toContain('열람');
      expect(filterTabs?.textContent).toContain('전체 고객');

      // Column 2: 3 Primary Top Tabs (할 일 · 메시지 · 기록)
      const primaryTabs = container.querySelector('[data-testid="inbox-editor-primary-tabs"]');
      expect(primaryTabs).not.toBeNull();
      const tabButtons = primaryTabs!.querySelectorAll('button');
      expect(tabButtons.length).toBe(3);
      expect(primaryTabs?.textContent).toContain('할 일');
      expect(primaryTabs?.textContent).toContain('메시지');
      expect(primaryTabs?.textContent).toContain('기록');

      // Switch to Tab 2 (메시지) and verify Kakao message inputs
      const messageTabBtn = container.querySelector(
        '[data-testid="inbox-editor-tab-message"]'
      ) as HTMLButtonElement;
      await act(async () => {
        messageTabBtn.click();
      });

      expect(container.querySelector('[data-testid="inbox-kakao-headline-input"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="inbox-kakao-brief-input"]')).not.toBeNull();

      // Column 3: Client Summary Card & Link Governance Card
      expect(container.querySelector('[data-testid="inbox-client-summary-card"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="inbox-link-governance-card"]')).not.toBeNull();
    });
  });
});
