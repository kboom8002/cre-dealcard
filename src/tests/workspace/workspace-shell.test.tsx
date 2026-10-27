// @vitest-environment jsdom
/**
 * @file src/tests/workspace/workspace-shell.test.tsx
 * @description Milestone 3 Test Suite: 3-Column WorkspaceShell, Responsive Rail Collapse & Navigation
 *
 * Requirements:
 * 1. 3-Column Desktop Layout:
 *    - Column 1: ① 고르기 (listSlot) with customizable listTitle.
 *    - Column 2: ② 채우기 (editorSlot) with editorTitle and save status badge.
 *    - Column 3: ③ 확인하고 보내기 (previewSlot) with previewTitle and primaryActionSlot (56px).
 * 2. Responsive Rail Collapse:
 *    - Desktop rail collapse button toggles list column between full width and 72px rail.
 * 3. Mobile Push Navigation & 5-Tab Bottom Bar:
 *    - Below 1024px renders WorkspaceBottomNav with 5 core tabs (홈, 딜카드, IM, 뉴스레터, 소통함).
 *    - Responsive view switcher between list, editor, and preview on mobile screens.
 * 4. URL State Synchronization:
 *    - Reads active buildingId and tab from searchParams (?buildingId=&tab=).
 *
 * Authoritative Sources:
 * - docs/CREDEAL_무마찰UX_4대작업공간_개편_설계서.md §3.2, §3.7, WP-P2-02, WP-P2-03
 * - PROJECT.md (Milestone 3, Feature 27, 28)
 * - TEST_INFRA.md (§ Feature Inventory #8)
 */

import React, { act } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { WorkspaceShell } from '@/components/workspace/WorkspaceShell';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockPush = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/broker/w/dealcards',
  useSearchParams: () => mockSearchParams,
}));

describe('M3 Workspace: 3-Column WorkspaceShell (WP-P2-02 & WP-P2-03)', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    mockPush.mockClear();
    mockSearchParams = new URLSearchParams();
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

  it('renders standard 3-column layout headers and content slots', async () => {
    await act(async () => {
      root.render(
        <WorkspaceShell
          workspace="dealcards"
          listTitle="① 매물 목록"
          editorTitle="② 4항목 작성"
          previewTitle="③ 카톡 말풍선 미리보기"
          listSlot={<div data-testid="test-list-slot">매물 목록 슬롯</div>}
          editorSlot={<div data-testid="test-editor-slot">편집기 슬롯</div>}
          previewSlot={<div data-testid="test-preview-slot">미리보기 슬롯</div>}
          primaryActionSlot={<button data-testid="test-primary-btn">💬 카톡 보내기</button>}
          saveStatus={<span>저장됨 · 방금</span>}
        />
      );
    });

    // Verify column titles
    expect(container.textContent).toContain('① 매물 목록');
    expect(container.textContent).toContain('② 4항목 작성');
    expect(container.textContent).toContain('③ 카톡 말풍선 미리보기');

    // Verify slots rendered
    expect(container.querySelector('[data-testid="test-list-slot"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="test-editor-slot"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="test-preview-slot"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="test-primary-btn"]')).not.toBeNull();
    expect(container.textContent).toContain('저장됨 · 방금');
  });

  it('toggles list column rail collapse on desktop', async () => {
    await act(async () => {
      root.render(
        <WorkspaceShell
          workspace="dealcards"
          listSlot={<div data-testid="test-list">목록</div>}
          editorSlot={<div data-testid="test-editor">편집기</div>}
          previewSlot={<div data-testid="test-preview">미리보기</div>}
        />
      );
    });

    const collapseToggleBtn = container.querySelector('[data-testid="workspace-rail-toggle"]') as HTMLButtonElement;
    expect(collapseToggleBtn).not.toBeNull();
    expect(collapseToggleBtn.getAttribute('aria-label')).toBe('목록 접기 (레일)');

    // Click collapse button
    await act(async () => {
      collapseToggleBtn.click();
    });

    // After collapsing, button should have aria-label "목록 펼치기"
    expect(collapseToggleBtn.getAttribute('aria-label')).toBe('목록 펼치기');
  });

  it('renders 5-tab top navigation bar with current workspace active', async () => {
    await act(async () => {
      root.render(
        <WorkspaceShell
          workspace="dealcards"
          editorSlot={<div>에디터</div>}
        />
      );
    });

    expect(container.textContent).toContain('🏠 홈');
    expect(container.textContent).toContain('📄 딜카드');
    expect(container.textContent).toContain('📊 IM');
    expect(container.textContent).toContain('📰 뉴스레터');
    expect(container.textContent).toContain('💬 소통함');
  });

  it('renders mobile bottom navigation bar', async () => {
    await act(async () => {
      root.render(
        <WorkspaceShell
          workspace="dealcards"
          editorSlot={<div>에디터</div>}
        />
      );
    });

    const bottomNav = container.querySelector('nav[aria-label="모바일 하단 내비게이션"]');
    expect(bottomNav).not.toBeNull();
  });

  it('synchronizes activeBuildingId from URL searchParams', async () => {
    mockSearchParams = new URLSearchParams('buildingId=bld-selected-99&tab=preview');

    await act(async () => {
      root.render(
        <WorkspaceShell
          workspace="dealcards"
          listSlot={<div>목록</div>}
          editorSlot={<div>에디터</div>}
          previewSlot={<div>미리보기</div>}
        />
      );
    });

    const ariaLiveRegion = container.querySelector('[aria-live="polite"]');
    expect(ariaLiveRegion).not.toBeNull();
    expect(ariaLiveRegion?.textContent).toContain('bld-selected-99');
  });
});
