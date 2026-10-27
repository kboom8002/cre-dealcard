// @vitest-environment jsdom
/**
 * @file src/tests/workspace/home-v2.test.tsx
 * @description Milestone 3 Test Suite: Broker Home 4-Door Hub & 1-Line Resume Bar
 *
 * Requirements:
 * 1. 4 Task Doors:
 *    - 🚪 [딜카드] (data-testid="home-task-dealcards", alias="quick-action-dealcard")
 *    - 🚪 [기본 IM] (data-testid="home-task-im", alias="quick-action-im")
 *    - 🚪 [뉴스레터] (data-testid="home-task-magazine", alias="quick-action-magazine")
 *    - 🚪 [고객 소통함] (data-testid="home-task-inbox", alias="quick-action-inbox")
 *    - Shortcut keys 1~4 navigate directly to each door.
 * 2. Zero GNB & Distraction-Free Layout:
 *    - No duplicate widgets or hardcoded pipeline numbers (PipelineSnapshot(0), MarketBreakthroughMode removed).
 * 3. Clickable Live Status Badges:
 *    - Sibling link elements with distinct data-testids (home-door-badge-*) linking to recent work queues.
 * 4. 1-Line "이어서 하기" Resume Bar:
 *    - Renders data-testid="home-resume-bar" when recent work exists.
 *    - Displays building title, timeAgo, and direct link to resume editing.
 *
 * Authoritative Sources:
 * - docs/CREDEAL_무마찰UX_4대작업공간_개편_설계서.md §4.1, WP-P2-04, WP-P2-05
 * - PROJECT.md (Milestone 3, Feature 29, 30)
 * - TEST_INFRA.md (§ Feature Inventory #8)
 */

import React, { act } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { BrokerHome4Doors } from '@/app/(broker)/broker/_components/BrokerHome4Doors';
import type { AggregatedBrokerHomeData } from '@/domain/broker/home-aggregated';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

const mockHomeData: AggregatedBrokerHomeData = {
  profile: {
    displayName: '김중개',
    photoUrl: null,
    role: 'broker',
  },
  resumeItem: {
    id: 'bld-recent-01',
    title: '양평동 꼬마빌딩 (올근생 수익형)',
    timeAgo: '방금 전',
    href: '/broker/w/dealcards?buildingId=bld-recent-01',
  },
  doors: {
    dealcards: {
      id: 'dealcards',
      title: '딜카드 만들기',
      subtitle: '30초 생성 · 카카오톡 안심 전송',
      icon: '📄',
      href: '/broker/w/dealcards',
      shortcutNumber: 1,
      badge: {
        count: 2,
        label: '작성 중 2건',
        href: '/broker/w/dealcards?tab=list',
        highlight: true,
      },
    },
    im: {
      id: 'im',
      title: '기본 IM 제안서',
      subtitle: '3분 완성 · 10개 섹션 리포트 & PPTX',
      icon: '📊',
      href: '/broker/w/im',
      shortcutNumber: 2,
      badge: {
        count: 1,
        label: '검토 대기 1건',
        href: '/broker/w/im?tab=list',
        highlight: false,
      },
    },
    magazine: {
      id: 'magazine',
      title: '주간 매물 소식지',
      subtitle: '매물 3종 원클릭 삽입 · VIP 고객 발송',
      icon: '📰',
      href: '/broker/w/magazine',
      shortcutNumber: 3,
      badge: {
        count: 1,
        label: '이번 주 초안',
        href: '/broker/w/magazine?tab=list',
        highlight: false,
      },
    },
    inbox: {
      id: 'inbox',
      title: '고객 소통함',
      subtitle: '열람 고객 확인 · 맞춤 안부 카톡 전송',
      icon: '💬',
      href: '/broker/w/inbox',
      shortcutNumber: 4,
      badge: {
        count: 3,
        label: '열람 3명',
        href: '/broker/w/inbox?filter=viewed',
        highlight: true,
      },
    },
  },
};

describe('M3 Workspace: Broker Home 4-Door Hub (WP-P2-04 & WP-P2-05)', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    mockPush.mockClear();
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

  it('renders all 4 main task doors with correct titles, icons, and testids', async () => {
    await act(async () => {
      root.render(<BrokerHome4Doors data={mockHomeData} />);
    });

    const dealcardsDoor = container.querySelector('[data-testid="home-task-dealcards"]');
    const imDoor = container.querySelector('[data-testid="home-task-im"]');
    const magazineDoor = container.querySelector('[data-testid="home-task-magazine"]');
    const inboxDoor = container.querySelector('[data-testid="home-task-inbox"]');

    expect(dealcardsDoor).not.toBeNull();
    expect(imDoor).not.toBeNull();
    expect(magazineDoor).not.toBeNull();
    expect(inboxDoor).not.toBeNull();

    expect(dealcardsDoor?.textContent).toContain('딜카드 만들기');
    expect(imDoor?.textContent).toContain('기본 IM 제안서');
    expect(magazineDoor?.textContent).toContain('주간 매물 소식지');
    expect(inboxDoor?.textContent).toContain('고객 소통함');

    // Backward-compatible alias testids
    expect(container.querySelector('[data-alias-testid="quick-action-dealcard"]')).not.toBeNull();
    expect(container.querySelector('[data-alias-testid="quick-action-im"]')).not.toBeNull();
    expect(container.querySelector('[data-alias-testid="quick-action-magazine"]')).not.toBeNull();
    expect(container.querySelector('[data-alias-testid="quick-action-inbox"]')).not.toBeNull();
  });

  it('renders clickable live status badges for each door', async () => {
    await act(async () => {
      root.render(<BrokerHome4Doors data={mockHomeData} />);
    });

    const dealcardBadge = container.querySelector('[data-testid="home-door-badge-dealcards"]') as HTMLAnchorElement;
    const imBadge = container.querySelector('[data-testid="home-door-badge-im"]') as HTMLAnchorElement;
    const magazineBadge = container.querySelector('[data-testid="home-door-badge-magazine"]') as HTMLAnchorElement;
    const inboxBadge = container.querySelector('[data-testid="home-door-badge-inbox"]') as HTMLAnchorElement;

    expect(dealcardBadge).not.toBeNull();
    expect(dealcardBadge.textContent).toContain('작성 중 2건');
    expect(dealcardBadge.getAttribute('href')).toBe('/broker/w/dealcards?tab=list');

    expect(imBadge.textContent).toContain('검토 대기 1건');
    expect(magazineBadge.textContent).toContain('이번 주 초안');
    expect(inboxBadge.textContent).toContain('열람 3명');
  });

  it('renders 1-line resume bar when recent work exists', async () => {
    await act(async () => {
      root.render(<BrokerHome4Doors data={mockHomeData} />);
    });

    const resumeBar = container.querySelector('[data-testid="home-resume-bar"]');
    expect(resumeBar).not.toBeNull();
    expect(resumeBar?.textContent).toContain('이어서 하기');
    expect(resumeBar?.textContent).toContain('양평동 꼬마빌딩 (올근생 수익형)');
    expect(resumeBar?.textContent).toContain('방금 전');

    const resumeLink = resumeBar?.querySelector('a') as HTMLAnchorElement;
    expect(resumeLink).not.toBeNull();
    expect(resumeLink.getAttribute('href')).toBe('/broker/w/dealcards?buildingId=bld-recent-01');
  });

  it('hides resume bar when no recent work is present', async () => {
    const dataWithoutResume: AggregatedBrokerHomeData = {
      ...mockHomeData,
      resumeItem: null,
    };

    await act(async () => {
      root.render(<BrokerHome4Doors data={dataWithoutResume} />);
    });

    const resumeBar = container.querySelector('[data-testid="home-resume-bar"]');
    expect(resumeBar).toBeNull();
  });

  it('handles keyboard shortcuts 1~4 to navigate directly to task doors', async () => {
    await act(async () => {
      root.render(<BrokerHome4Doors data={mockHomeData} />);
    });

    // Press '1' -> dealcards
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }));
    });
    expect(mockPush).toHaveBeenCalledWith('/broker/w/dealcards');

    // Press '2' -> im
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '2' }));
    });
    expect(mockPush).toHaveBeenCalledWith('/broker/w/im');

    // Press '3' -> magazine
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '3' }));
    });
    expect(mockPush).toHaveBeenCalledWith('/broker/w/magazine');

    // Press '4' -> inbox
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '4' }));
    });
    expect(mockPush).toHaveBeenCalledWith('/broker/w/inbox');
  });
});
