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
    it('renders Airtable-style list with posture switcher, Zero-Tab single canvas editor, 1-line title, and AXIOS Post-it 3 points', async () => {
      await act(async () => {
        root.render(<DealCardsWorkspacePage />);
      });

      // Column 1: Airtable intelligent list + posture switcher
      const airtableList = container.querySelector('[data-testid="dealcard-airtable-list"]');
      expect(airtableList).not.toBeNull();
      expect(airtableList?.textContent).toContain('AIRTABLE GRID');
      expect(airtableList?.textContent).toContain('[매매 딜카드 공식]');

      const postureSwitcher = container.querySelector('[data-testid="dealcard-posture-switcher"]');
      expect(postureSwitcher).not.toBeNull();
      expect(postureSwitcher?.textContent).toContain('전체 매물');
      expect(postureSwitcher?.textContent).toContain('수익형(임대)');
      expect(postureSwitcher?.textContent).toContain('사옥·밸류애드');

      // Column 2: Zero-Tab Single Canvas Editor (no top tabs for DealCard)
      const confirmCard = container.querySelector('[data-testid="card4-confirm-card"]');
      expect(confirmCard).not.toBeNull();
      expect(confirmCard?.getAttribute('data-canvas-mode')).toBe('zero-tab-single');
      expect(confirmCard?.textContent).toContain('탭 없는 한 화면 즉시 편집');

      // 1-Line Headline input & Single-Line Title Guard
      const headlineInput = container.querySelector(
        '[data-testid="card4-headline-input"]'
      ) as HTMLInputElement;
      expect(headlineInput).not.toBeNull();
      expect(headlineInput.value).toContain('양평동');

      // 3 AXIOS Wide Pastel Post-it Cards (#FEF9C3, #E0F2FE, #DCFCE7)
      const postit0 = container.querySelector('[data-testid="card4-postit-card-0"]') as HTMLElement;
      const postit1 = container.querySelector('[data-testid="card4-postit-card-1"]') as HTMLElement;
      const postit2 = container.querySelector('[data-testid="card4-postit-card-2"]') as HTMLElement;
      expect(postit0).not.toBeNull();
      expect(postit1).not.toBeNull();
      expect(postit2).not.toBeNull();

      // Brief textareas exist for all 3 points
      expect(container.querySelector('[data-testid="card4-point-brief-0"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="card4-point-brief-1"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="card4-point-brief-2"]')).not.toBeNull();

      // AI recluster button works
      const aiBtn = container.querySelector(
        '[data-testid="card4-ai-recluster-btn"]'
      ) as HTMLButtonElement;
      expect(aiBtn).not.toBeNull();
      await act(async () => {
        aiBtn.click();
      });

      // Column 3: Kakao bubble & AXIOS Post-it detail preview
      const postitPreviewList = container.querySelector(
        '[data-testid="dealcard-postit-preview-list"]'
      );
      expect(postitPreviewList).not.toBeNull();
      expect(postitPreviewList?.textContent).toContain('POINT 01');
      expect(postitPreviewList?.textContent).toContain('POINT 02');
      expect(postitPreviewList?.textContent).toContain('POINT 03');

      // Verify single-line title elements exist
      const singleLineTitles = container.querySelectorAll('[data-single-line-title="true"]');
      expect(singleLineTitles.length).toBeGreaterThanOrEqual(4);
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * 2. IM Workspace (/broker/w/im)
   * ──────────────────────────────────────────────────────────────────────── */
  describe('2. IM Workspace (/broker/w/im)', () => {
    it('renders standard Mobile IM + Basic IM (10-slide) only, Airtable list with posture switcher, <=4 top tabs, and AXIOS Post-it highlights', async () => {
      await act(async () => {
        root.render(<ImWorkspacePage />);
      });

      // Column 1: Airtable IM list + posture switcher + standard formula banner
      const listSlot = container.querySelector('[data-testid="im-list-slot"]');
      expect(listSlot).not.toBeNull();
      expect(listSlot?.textContent).toContain('AIRTABLE IM');

      const postureSwitcher = container.querySelector('[data-testid="im-posture-switcher"]');
      expect(postureSwitcher).not.toBeNull();
      expect(postureSwitcher?.textContent).toContain('수익형');
      expect(postureSwitcher?.textContent).toContain('사옥형');
      expect(postureSwitcher?.textContent).toContain('밸류·신축');

      const formulaBanner = container.querySelector('[data-testid="im-standard-formula-banner"]');
      expect(formulaBanner?.textContent).toContain('[모바일·Basic IM 표준 구성]');

      // Ensure Pro IM labels are not exposed in the IM workspace UI
      const editorSlot = container.querySelector('[data-testid="im-editor-slot"]');
      expect(editorSlot?.textContent).not.toContain('Pro 항목');
      expect(editorSlot?.textContent).not.toContain('Pro 입력');

      // Column 2: <= 4 Primary Top Tabs
      const primaryTabs = container.querySelector('[data-testid="im-editor-primary-tabs"]');
      expect(primaryTabs).not.toBeNull();
      const tabButtons = primaryTabs!.querySelectorAll('button');
      expect(tabButtons.length).toBe(4);
      expect(primaryTabs?.textContent).toContain('① 표지·핵심제원');
      expect(primaryTabs?.textContent).toContain('② 층별 렌트롤·수지');
      expect(primaryTabs?.textContent).toContain('③ AXIOS 투자브리프');
      expect(primaryTabs?.textContent).toContain('④ 사진·지적도·발행');

      // Single-line IM cover title input exists
      const titleInput = container.querySelector(
        '[data-testid="im-title-single-line-input"]'
      ) as HTMLInputElement;
      expect(titleInput).not.toBeNull();

      // Switch to Tab 3 (AXIOS 투자브리프) and verify 3 wide Post-it highlight cards
      const axiosTabBtn = container.querySelector(
        '[data-testid="im-editor-tab-axios_brief"]'
      ) as HTMLButtonElement;
      await act(async () => {
        axiosTabBtn.click();
      });

      expect(container.querySelector('[data-testid="im-axios-postit-0"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="im-axios-postit-1"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="im-axios-postit-2"]')).not.toBeNull();

      // Column 3: Mobile IM preview shows AXIOS Post-it highlights & single-line cover title
      const previewAxiosList = container.querySelector('[data-testid="im-preview-axios-list"]');
      expect(previewAxiosList).not.toBeNull();
      expect(previewAxiosList?.children.length).toBe(3);
    });
  });

  /* ────────────────────────────────────────────────────────────────────────
   * 3. Client Inbox Workspace (/broker/w/inbox)
   * ──────────────────────────────────────────────────────────────────────── */
  describe('3. Client Inbox Workspace (/broker/w/inbox)', () => {
    it('renders Airtable CRM list with 3-way focus switcher, <=4 top tabs, and AXIOS Post-it diagnosis & Kakao proposal cards', async () => {
      await act(async () => {
        root.render(<InboxWorkspacePage />);
      });

      // Column 1: Airtable CRM header + 3-way focus switcher + formula banner
      const listSlot = container.querySelector('[data-testid="inbox-list-slot"]');
      expect(listSlot?.textContent).toContain('AIRTABLE CRM');

      const focusSwitcher = container.querySelector('[data-testid="inbox-focus-switcher"]');
      expect(focusSwitcher).not.toBeNull();
      expect(focusSwitcher?.textContent).toContain('핫리드·열람');
      expect(focusSwitcher?.textContent).toContain('G2 승인요청');
      expect(focusSwitcher?.textContent).toContain('VIP·구독명단');

      // Column 2: <= 4 Primary Top Tabs
      const primaryTabs = container.querySelector('[data-testid="inbox-editor-primary-tabs"]');
      expect(primaryTabs).not.toBeNull();
      const tabButtons = primaryTabs!.querySelectorAll('button');
      expect(tabButtons.length).toBe(4);
      expect(primaryTabs?.textContent).toContain('① 열람진단·G2승인');
      expect(primaryTabs?.textContent).toContain('② 카톡 제안·안부');
      expect(primaryTabs?.textContent).toContain('③ 맞춤 대체매물');
      expect(primaryTabs?.textContent).toContain('④ 통화메모·이력');

      // Switch to Tab 2 (카톡 제안·안부) and verify AXIOS Post-it Kakao proposal card
      const kakaoTabBtn = container.querySelector(
        '[data-testid="inbox-editor-tab-kakao_proposal"]'
      ) as HTMLButtonElement;
      await act(async () => {
        kakaoTabBtn.click();
      });

      const kakaoPostit = container.querySelector('[data-testid="inbox-axios-kakao-postit"]');
      expect(kakaoPostit).not.toBeNull();
      expect(container.querySelector('[data-testid="inbox-kakao-headline-input"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="inbox-kakao-brief-input"]')).not.toBeNull();

      // Column 3: Live AXIOS Kakao Post-it Preview card
      const previewKakaoCard = container.querySelector('[data-testid="inbox-preview-kakao-card"]');
      expect(previewKakaoCard).not.toBeNull();
    });
  });
});
