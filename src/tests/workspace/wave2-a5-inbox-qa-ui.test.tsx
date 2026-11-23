/**
 * @vitest-environment jsdom
 */
/**
 * Wave 2 Track B UI Verification:
 * - InboxPreviewColumn: DOI pending newsletter badge ("인증 대기") and [정보 수정] button on lead/subscriber threads while restricting [고객 삭제] to custom_/cli-
 * - QaFullLoopWorkbenchClient: 소통함/고객 목록 probe badge rendering for inboxCheck + broker_clients
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InboxPreviewColumn } from '@/app/(broker)/broker/w/inbox/_components/InboxPreviewColumn';
import type { InboxThreadItem } from '@/app/(broker)/broker/w/inbox/_components/inbox-types';
import { QaFullLoopWorkbenchClient } from '@/app/qa-full-loop/_components/QaFullLoopWorkbenchClient';
import {
  FULL_LOOP_CASES,
  FULL_LOOP_WINDOW_ROLES,
  QA_FULL_LOOP_WORKBENCH_ID,
} from '@/lib/testguide/full-loop-2cases-data';

describe('Wave 2 Track B UI: InboxPreviewColumn & QaFullLoopWorkbenchClient', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
      root = null;
    }
    container?.remove();
    container = null;
    vi.restoreAllMocks();
  });

  function basePreviewProps(thread: InboxThreadItem) {
    return {
      activeThread: thread,
      activeInboxUnitId: null,
      busyAction: null,
      subscriptionTier: 'pro' as const,
      outboundEmail: thread.clientEmail || '',
      outboundBasis: 'im_request' as const,
      marketingConsentConfirmed: false,
      alimtalkTemplateId: 'TPL_INBOX_IM_APPROVED' as const,
      copiedBundlePreview: null,
      showAlimtalkUpgradeSheet: false,
      confirmLockOpen: false,
      lockEntireBuilding: false,
      correctionNoticeOpen: false,
      correctionNoticeText: '',
      onFocusEditorUnit: vi.fn(),
      onCopyActiveShareLink: vi.fn(),
      onSendMaterial: vi.fn(),
      onOutboundEmailChange: vi.fn(),
      onOutboundBasisChange: vi.fn(),
      onAlimtalkTemplateChange: vi.fn(),
      onPrepareCopyBundle: vi.fn(),
      onSendInboxEmail: vi.fn(),
      onSendInboxAlimtalk: vi.fn(),
      onCloseAlimtalkUpgradeSheet: vi.fn(),
      onToggleNewsletter: vi.fn(),
      onOpenEditCustomClient: vi.fn(),
      onRequestDeleteCustomClient: vi.fn(),
      onOpenConfirmLock: vi.fn(),
      onCancelConfirmLock: vi.fn(),
      onLockEntireBuildingChange: vi.fn(),
      onConfirmLockLink: vi.fn(),
      onUnlockLink: vi.fn(),
      onOpenCorrectionNotice: vi.fn(),
      onCancelCorrectionNotice: vi.fn(),
      onCorrectionNoticeTextChange: vi.fn(),
      onPublishCorrectionNotice: vi.fn(),
      onClearCorrectionNotice: vi.fn(),
    };
  }

  it('shows "인증 대기" and exposes [정보 수정] (without [고객 삭제]) for DOI-pending lead threads in InboxPreviewColumn', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    const leadThread: InboxThreadItem = {
      id: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
      clientName: '강민수',
      clientPhone: '010-6193-4470',
      clientEmail: 'ms.kang@example.kr',
      clientGrade: 'VIP',
      isVip: true,
      clientRole: 'buyer',
      buildingTitle: '강남 빌딩',
      buildingId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      latestEvent: 'IM 열람 요청',
      gateStatus: 'pending',
      updatedAt: '방금',
      openCount: 0,
      isRead: false,
      status: 'pending_gate',
      shareToken: '',
      events: [],
      budget: '200억',
      preferredRegion: '강남구',
      newsletterSubscribed: false,
      newsletterStatus: 'pending',
    };

    const props = basePreviewProps(leadThread);
    await act(async () => {
      root!.render(<InboxPreviewColumn {...props} />);
    });

    const nlBtn = container.querySelector('[data-testid="toggle-newsletter-btn"]');
    expect(nlBtn?.textContent?.trim()).toBe('인증 대기');

    const editBtn = container.querySelector(
      '[data-testid="edit-custom-client-btn"]'
    ) as HTMLButtonElement | null;
    expect(editBtn).not.toBeNull();
    expect(editBtn?.textContent?.trim()).toBe('정보 수정');

    const deleteBtn = container.querySelector('[data-testid="delete-custom-client-btn"]');
    expect(deleteBtn).toBeNull();

    await act(async () => {
      editBtn?.click();
    });
    expect(props.onOpenEditCustomClient).toHaveBeenCalledTimes(1);
  });

  it('renders 소통함/고객 목록 probe badge cleanly when inboxCheck.foundInInbox is true in QaFullLoopWorkbenchClient', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    const fetchMock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const bodyStr = typeof init?.body === 'string' ? init.body : '';
      if (bodyStr.includes('"mode":"probe"')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            checkedAt: new Date().toISOString(),
            subscriberCheck: {
              checked: true,
              foundInMagazineSubscribers: true,
              foundInBrokerClients: false,
              inboxCheck: {
                checked: true,
                foundInInbox: true,
                gateStatus: 'approved',
                hasEmail: true,
              },
            },
            inboxCheck: {
              checked: true,
              foundInInbox: true,
              gateStatus: 'approved',
              hasEmail: true,
            },
          }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, results: {}, telemetry: {} }),
      } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      root!.render(
        <QaFullLoopWorkbenchClient
          config={{
            workbenchId: QA_FULL_LOOP_WORKBENCH_ID,
            localStorageKey: 'test-qa-probe-ui-key',
            sessionPrefix: 'tp',
            badgeCode: 'TEST',
            pageTitle: 'QA Test',
            pageSubtitle: 'QA Test Subtitle',
            reportTitle: 'Report',
            reportFilePrefix: 'Report',
            crossEditionLink: { href: '/qa', label: 'QA' },
            cases: FULL_LOOP_CASES,
            windowRoles: FULL_LOOP_WINDOW_ROLES,
            defaultSubscribers: {
              loop1: '010-6193-4470',
              loop2: '010-2849-7105',
            },
            secondaryBuyerPlaceholder: 'https://www.credeal.net/im-lite/...?t=...',
          }}
        />
      );
    });

    const probeBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('입력한 링크·면적 자동 점검 실행')
    );
    expect(probeBtn).toBeDefined();

    await act(async () => {
      probeBtn!.click();
    });

    expect(container.textContent).toContain('소통함/고객 목록: 등록됨 (소통함 · approved)');
  });
});
