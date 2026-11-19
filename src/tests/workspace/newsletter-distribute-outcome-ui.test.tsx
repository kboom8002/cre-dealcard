// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NewsletterSendStepPanel } from '@/app/(broker)/broker/magazine-editor/_components/NewsletterSendStepPanel';
import type { DistributeOutcomeCardData } from '@/app/(broker)/broker/magazine-editor/_components/distribute-result-helper';

vi.mock('@/components/workspace/inbox/ContactBulkImportModal', () => ({
  ContactBulkImportModal: () => null,
}));

describe('NewsletterSendStepPanel (WP 3-D Outcome Card & Quiet Hours Banner)', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    container?.remove();
    container = null;
    root = null;
  });

  function renderPanel(props: Partial<React.ComponentProps<typeof NewsletterSendStepPanel>>) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root!.render(
        <NewsletterSendStepPanel
          headline="11월 강남 빌딩 리포트"
          briefingBody="역세권 중소형 통건물 수요 견조"
          selectedDealCount={2}
          enabledNewsCount={3}
          briefingEnabled={true}
          dealsEnabled={true}
          newsEnabled={true}
          targetSegment="all"
          onChangeTargetSegment={vi.fn()}
          subscriberCount={120}
          highInterestCount={12}
          sending={false}
          quietHoursNow={false}
          distributeOutcome={null}
          onJumpToStep={vi.fn()}
          onNotifyEditorFocus={vi.fn()}
          onBulkSubscribersImported={vi.fn()}
          onKakaoShare={vi.fn()}
          onCopyLink={vi.fn()}
          onBackToContent={vi.fn()}
          onSendSelected={vi.fn()}
          {...props}
        />,
      );
    });
    return container;
  }

  it('renders quiet-hours warning with schedule confirmation toggle when KST night hours apply', () => {
    const el = renderPanel({ quietHoursNow: true });
    const warning = el.querySelector('[data-testid="quiet-hours-warning"]');
    expect(warning).not.toBeNull();
    expect(warning?.textContent).toContain('21:00 ~ 08:00 KST');

    const btn = el.querySelector('[data-testid="quiet-hours-schedule-btn"]') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    act(() => {
      btn.click();
    });
    expect(warning?.textContent).toContain('오전 08:00 이후');
  });

  it('renders honest distribute outcome card with blocked reason breakdown', () => {
    const outcome: DistributeOutcomeCardData = {
      tone: 'warning',
      title: '웹 발행 완료 · 자동 발송 0건(차단/미발송)',
      message: '야간 시간대 차단으로 발송되지 않았습니다.',
      sent: 0,
      queued: 0,
      recorded: 0,
      failed: 0,
      blockedTotal: 8,
      blockedReasons: [{ code: 'QUIET_HOURS', label: '야간 발송 제한 시간(21:00~08:00 KST)', count: 8 }],
      dryRun: false,
    };
    const el = renderPanel({ distributeOutcome: outcome });
    const card = el.querySelector('[data-testid="distribute-outcome-card"]');
    expect(card).not.toBeNull();
    expect(card?.textContent).toContain('웹 발행 완료 · 자동 발송 0건');
    expect(card?.textContent).toContain('차단 8건');
    expect(card?.textContent).toContain('야간 발송 제한 시간(21:00~08:00 KST) (8건)');
  });
});
