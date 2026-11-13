// @vitest-environment jsdom
/**
 * 소통함 좌측 목록 개편 회귀 테스트 (간단히 / 자세히 보기)
 *  - 기본 "간단히": 고객명 · 날짜 · 상태 한 줄, 행 안에 버튼 없음
 *  - 한 줄 "지금 할 일 N건" 막대 → 누르면 '할 일' 필터 적용, [자료 보내기] 유지
 *  - 필터 3개(할 일/열람/전체 고객)는 접지 않고 항상 노출
 *  - "자세히" 전환 시 기존 카드(최근 메시지 · 썸네일 글자 타일) 복원
 *  - 새 고객 등록 시 updatedAt 은 ISO 로 저장되어 "방금" 대신 실제 시각 표시
 */
import React, { act } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import InboxWorkspacePage, {
  type InboxThreadItem,
} from '@/app/(broker)/broker/w/inbox/page';
import { LIST_VIEW_STORAGE_KEY } from '@/components/workspace/list/useListViewMode';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/broker/w/inbox',
  useSearchParams: () => new URLSearchParams(),
}));

const NOW_ISO = new Date().toISOString();
const yesterdayNoon = new Date();
yesterdayNoon.setDate(yesterdayNoon.getDate() - 1);
yesterdayNoon.setHours(12, 0, 0, 0);
const YESTERDAY_ISO = yesterdayNoon.toISOString();

const THREADS: InboxThreadItem[] = [
  {
    id: 'thr-pending-1',
    clientName: '박상훈 대표',
    clientPhone: '010-2345-6789',
    clientGrade: 'VIP',
    buildingTitle: '잠원권역 근생빌딩',
    buildingId: 'bld-01',
    latestEvent: 'IM 열람 요청: 상세 자료 부탁드립니다',
    cleanMessage: '상세 IM 자료 부탁드립니다.',
    gateStatus: 'pending',
    updatedAt: NOW_ISO,
    openCount: 1,
    isRead: false,
    status: 'pending_gate',
    shareToken: 'tok-1',
    events: [],
    budget: '80억대',
    preferredRegion: '서초·강남',
  },
  {
    id: 'thr-active-2',
    clientName: '김민지 실장',
    clientPhone: '010-1111-2222',
    clientGrade: '일반',
    buildingTitle: '서교동 꼬마빌딩',
    buildingId: 'bld-02',
    latestEvent: '딜카드를 열람했습니다',
    cleanMessage: '',
    updatedAt: YESTERDAY_ISO,
    openCount: 1,
    isRead: true,
    status: 'active',
    shareToken: 'tok-2',
    events: [],
    budget: '',
    preferredRegion: '',
  },
];

function q<T extends Element = HTMLElement>(container: HTMLElement, testId: string): T | null {
  return container.querySelector(`[data-testid="${testId}"]`) as T | null;
}

function isInsideHidden(el: Element | null): boolean {
  let cur: Element | null = el;
  while (cur) {
    if ((cur as HTMLElement).hidden) return true;
    cur = cur.parentElement;
  }
  return false;
}

describe('Inbox left list — simple / detailed view', () => {
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
      json: async () => ({ ok: true, threads: [] }),
    } as Response);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  async function renderPage() {
    await act(async () => {
      root.render(<InboxWorkspacePage initialThreads={THREADS} />);
    });
  }

  async function click(el: HTMLElement | null) {
    expect(el).not.toBeNull();
    await act(async () => {
      el!.click();
    });
  }

  it('renders a slim one-line todo bar with 자료 보내기 and no explanatory sentences', async () => {
    await renderPage();

    const bar = q(container, 'inbox-todo-summary-card');
    expect(bar).not.toBeNull();
    expect(bar!.textContent).toContain('지금 할 일 1건');
    expect(bar!.textContent).toContain('자료 보내기');
    expect(q(container, 'quick-todo-card-thr-pending-1')).not.toBeNull();
    expect(q(container, 'quick-approve-btn-thr-pending-1')).not.toBeNull();
    expect(bar!.textContent).not.toContain('승인을 기다리는 IM 열람 요청');
    expect(bar!.textContent).not.toMatch(/외 \d+건/);

    // + 고객 직접 등록 is a secondary control outside the todo bar
    const addBtn = q(container, 'open-new-client-modal-btn');
    expect(addBtn).not.toBeNull();
    expect(addBtn!.textContent).toContain('+ 고객 직접 등록');
    expect(bar!.contains(addBtn)).toBe(false);
  });

  it('always shows "지금 할 일 0건" when nothing is pending', async () => {
    await act(async () => {
      root.render(<InboxWorkspacePage initialThreads={[THREADS[1]]} />);
    });
    const bar = q(container, 'inbox-todo-summary-card');
    expect(bar).not.toBeNull();
    expect(bar!.textContent).toContain('지금 할 일 0건');
    expect(bar!.querySelector('[data-testid^="quick-todo-card-"]')).toBeNull();
  });

  it('defaults to 간단히 rows: name · date · status only, no buttons inside rows; filter tabs stay visible', async () => {
    await renderPage();

    // Filter tabs are the primary classification — never folded
    const tabs = q(container, 'inbox-filter-tabs');
    expect(tabs).not.toBeNull();
    expect(isInsideHidden(tabs)).toBe(false);
    expect(tabs!.querySelectorAll('[role="tab"]').length).toBe(3);
    expect(q(container, 'ws-list-filter-toggle')).toBeNull();

    await click(q(container, 'inbox-filter-chip-all'));

    const pendingRow = q(container, 'inbox-thread-row-thr-pending-1');
    const activeRow = q(container, 'inbox-thread-row-thr-active-2');
    expect(pendingRow).not.toBeNull();
    expect(activeRow).not.toBeNull();
    expect(pendingRow!.getAttribute('data-list-row')).toBe('simple');

    expect(pendingRow!.textContent).toContain('박상훈 대표');
    expect(pendingRow!.textContent).toContain('IM 요청 대기');
    expect(pendingRow!.textContent).toContain('잠원권역 근생빌딩');
    expect(q(container, 'inbox-thread-row-thr-pending-1-date')!.textContent).toMatch(
      /^오(전|후) \d{1,2}:\d{2}$/
    );
    expect(activeRow!.textContent).toContain('1회 열람');
    expect(q(container, 'inbox-thread-row-thr-active-2-date')!.textContent).toBe('어제');

    // Rich detail is NOT in simple rows
    expect(pendingRow!.textContent).not.toContain('IM 열람 요청:');
    expect(pendingRow!.querySelectorAll('button').length).toBe(0);
    expect(activeRow!.querySelectorAll('button').length).toBe(0);
    expect(pendingRow!.querySelector('[data-testid="ws-list-thumbnail"]')).toBeNull();

    // Date groups (오늘 / 어제)
    expect(q(container, 'ws-date-group-today')).not.toBeNull();
    expect(q(container, 'ws-date-group-yesterday')).not.toBeNull();

    // Selecting a row keeps aria-current / data-selected semantics
    await click(activeRow);
    const selectedRow = q(container, 'inbox-thread-row-thr-active-2');
    expect(selectedRow!.getAttribute('aria-current')).toBe('true');
    expect(selectedRow!.getAttribute('data-selected')).toBe('true');
    expect(
      q(container, 'inbox-thread-row-thr-pending-1')!.getAttribute('data-selected')
    ).toBe('false');
  });

  it('tapping "지금 할 일" applies the todo filter', async () => {
    await renderPage();
    await click(q(container, 'inbox-filter-chip-all'));
    expect(q(container, 'inbox-filter-chip-all')!.getAttribute('aria-selected')).toBe('true');
    expect(q(container, 'inbox-thread-row-thr-active-2')).not.toBeNull();

    await click(q(container, 'inbox-todo-summary-filter-btn'));

    expect(q(container, 'inbox-filter-chip-todo')!.getAttribute('aria-selected')).toBe('true');
    expect(q(container, 'inbox-thread-row-thr-pending-1')).not.toBeNull();
    expect(q(container, 'inbox-thread-row-thr-active-2')).toBeNull();
  });

  it('switching to 자세히 restores the rich card with a name thumbnail and persists the choice', async () => {
    await renderPage();
    await click(q(container, 'inbox-filter-chip-all'));
    await click(q(container, 'ws-list-view-detailed'));

    expect(window.localStorage.getItem(LIST_VIEW_STORAGE_KEY)).toBe('detailed');
    const row = q(container, 'inbox-thread-row-thr-pending-1');
    expect(row).not.toBeNull();
    expect(row!.getAttribute('data-list-row')).toBeNull();
    expect(row!.textContent).toContain('IM 요청 대기');
    expect(row!.textContent).toContain('IM 열람 요청:');
    const thumb = row!.querySelector('[data-testid="ws-list-thumbnail"]');
    expect(thumb).not.toBeNull();
    expect(thumb!.textContent).toBe('박상');

    // Back to 간단히
    await click(q(container, 'ws-list-view-simple'));
    expect(
      q(container, 'inbox-thread-row-thr-pending-1')!.getAttribute('data-list-row')
    ).toBe('simple');
  });

  it('honors a stored 자세히 preference on first render', async () => {
    window.localStorage.setItem(LIST_VIEW_STORAGE_KEY, 'detailed');
    await renderPage();
    await click(q(container, 'inbox-filter-chip-all'));
    const row = q(container, 'inbox-thread-row-thr-active-2');
    expect(row!.getAttribute('data-list-row')).toBeNull();
    expect(row!.textContent).toContain('딜카드를 열람했습니다');
  });

  it('a newly registered client is stored with a real timestamp (not "방금")', async () => {
    await renderPage();
    await click(q(container, 'inbox-filter-chip-all'));
    await click(q(container, 'open-new-client-modal-btn'));

    const nameInput = container.querySelector('#new-client-name') as HTMLInputElement;
    expect(nameInput).not.toBeNull();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(nameInput, '정태영 부회장');
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
      nameInput.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await click(q(container, 'submit-new-client-btn'));

    const rows = Array.from(
      container.querySelectorAll<HTMLElement>('[data-testid^="inbox-thread-row-"][data-list-row="simple"]')
    );
    const newRow = rows.find((r) => r.textContent?.includes('정태영 부회장'));
    expect(newRow).toBeDefined();
    const dateEl = newRow!.querySelector('[data-testid$="-date"]');
    expect(dateEl!.textContent).not.toBe('방금');
    expect(dateEl!.textContent).toMatch(/^오(전|후) \d{1,2}:\d{2}$/);
  });
});
