// @vitest-environment jsdom
/**
 * @file src/tests/workspace/wave3-shell-inbox-split.test.tsx
 * @description Wave 3 Agent 2 Verification Suite:
 * - A3-05: WorkspaceShell mobile open-preview, <1280px resize Col-3 no-squeeze, single preview toggle, xl font-scale
 * - A3-04: Directional copy removal & actionable buttons across Inbox, DealCards, Magazine Editor
 * - A3-06 / A4-09 / A5-02 / A5-05 / A5-07: Inbox events/toasts, email fallback, company persistence & lead/sub edit
 * - A3-07 / A3-08 / A3-09: DealCards & Magazine <1280px inline strips, PreSendSheet URL, SendStepPanel URL
 * - A6-03 / A6-06: MagazineShareModal cadence-aware 크리딜 branding & SpecialEditionModal branding
 */

import React, { act } from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { fireEvent } from '@testing-library/react';
import { WorkspaceShell } from '@/components/workspace/WorkspaceShell';
import {
  normalizeServerThread,
  parseRawGateReason,
  type InboxThreadItem,
} from '@/app/(broker)/broker/w/inbox/_components/inbox-types';
import {
  InboxEditClientModal,
  InboxNewClientModal,
  type InboxClientFormValues,
} from '@/app/(broker)/broker/w/inbox/_components/InboxClientModals';
import { InboxEditorColumn } from '@/app/(broker)/broker/w/inbox/_components/InboxEditorColumn';
import { InboxDispatchTimeline } from '@/app/(broker)/broker/w/inbox/_components/InboxDispatchTimeline';
import { DealCardEditorColumn } from '@/app/(broker)/broker/w/dealcards/_components/DealCardEditorColumn';
import { PreSendConfirmationSheet } from '@/components/broker/deal-card/PreSendConfirmationSheet';
import { NewsletterSendStepPanel } from '@/app/(broker)/broker/magazine-editor/_components/NewsletterSendStepPanel';
import { MagazineShareModal } from '@/components/magazine-editor/MagazineShareModal';
import { handleUpsertClientAction } from '@/lib/inbox/inbox-actions-clients';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockReplace = vi.fn();
const mockPush = vi.fn();
let mockSearchParams = new URLSearchParams();
let mockPathname = '/broker/w/dealcards';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    prefetch: vi.fn(),
  }),
  usePathname: () => mockPathname,
  useSearchParams: () => mockSearchParams,
}));

const mockCopyText = vi.fn().mockResolvedValue(true);
vi.mock('@/lib/ux/clipboard', () => ({
  copyText: (...args: unknown[]) => mockCopyText(...args),
  COPY_FAILED_MESSAGE: '복사하지 못했습니다.',
}));

const mockShareKakaoFeed = vi.fn().mockResolvedValue('copied');
vi.mock('@/lib/kakao/share', () => ({
  shareKakaoFeed: (...args: unknown[]) => mockShareKakaoFeed(...args),
  getSiteOrigin: () => 'https://credeal.net',
}));

function makeInboxThread(overrides: Partial<InboxThreadItem> = {}): InboxThreadItem {
  return {
    id: 'gate-1',
    clientName: '김고객',
    clientPhone: '010-1234-5678',
    clientEmail: 'kim@example.com',
    transactionalBasis: 'im_request',
    hasTransactionalBasis: true,
    clientCompany: '한강자산운용',
    clientGrade: 'VIP',
    isVip: true,
    clientRole: 'buyer',
    preferredRegions: ['강남'],
    budgetManwon: 50000,
    freeMemo: '',
    buildingTitle: '테헤란로 프라임 오피스',
    buildingId: 'bld-1',
    latestEvent: 'IM 열람 요청',
    gateStatus: 'none',
    updatedAt: '방금',
    openCount: 0,
    dwellSeconds: 0,
    isRead: true,
    status: 'active',
    shareToken: 'tok-1',
    shareUrl: '/im-lite/bld-1?token=tok-1',
    budget: '50억',
    preferredRegion: '강남',
    events: [],
    dispatchHistory: [],
    ...overrides,
  };
}

describe('Wave 3 Agent 2: WorkspaceShell, Inbox, DealCards & Magazine Split-Screen UX', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    mockReplace.mockClear();
    mockPush.mockClear();
    mockCopyText.mockClear().mockResolvedValue(true);
    mockShareKakaoFeed.mockClear().mockResolvedValue('copied');
    mockSearchParams = new URLSearchParams();
    mockPathname = '/broker/w/dealcards';
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 1100,
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

  it('A3-05: handles workspace:open-preview on mobile (<1024px) & respects includeMobile=false', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 390 });
    await act(async () => {
      root.render(
        <WorkspaceShell
          workspace="inbox"
          listSlot={<div>목록</div>}
          editorSlot={<div>편집</div>}
          previewSlot={<div>미리보기</div>}
          selectedBuildingId="thread-1"
          previewDrawerLabel="자료 전달 · 링크 관리"
        />
      );
    });

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('workspace:open-preview', { detail: { includeMobile: false } })
      );
    });
    expect(mockReplace).not.toHaveBeenCalled();

    await act(async () => {
      window.dispatchEvent(new CustomEvent('workspace:open-preview'));
    });
    expect(mockReplace).toHaveBeenCalledWith(expect.stringContaining('tab=preview'));

    const colPreview = container.querySelector('[data-testid="workspace-col-preview"]');
    expect(colPreview?.className).toContain('flex');

    await act(async () => {
      window.dispatchEvent(new CustomEvent('workspace:focus-editor'));
    });
    expect(mockReplace).toHaveBeenCalledWith(expect.stringContaining('tab=editor'));
  });

  it('A3-05: prevents 1024-1279px 3-col squeeze when mobileView=preview, deduplicates toggle, and defers 4-btn FontScaleToggle to xl', async () => {
    mockSearchParams = new URLSearchParams('tab=preview');
    await act(async () => {
      root.render(
        <WorkspaceShell
          workspace="dealcards"
          listSlot={<div>목록</div>}
          editorSlot={<div>편집</div>}
          previewSlot={<div>미리보기</div>}
          selectedBuildingId="bld-1"
          previewDrawerLabel="카톡 미리보기"
        />
      );
    });

    // No duplicate topbar preview toggle
    expect(container.querySelector('[data-testid="workspace-preview-toggle-btn"]')).toBeNull();
    const editorToggle = container.querySelector(
      '[data-testid="workspace-editor-preview-drawer-btn"]'
    );
    expect(editorToggle).not.toBeNull();
    expect(editorToggle?.textContent).toContain('카톡 미리보기 열기');

    // When drawer is closed while tab=preview, Col 3 hides on lg (1024-1279) and shows on xl+
    const colPreview = container.querySelector('[data-testid="workspace-col-preview"]');
    expect(colPreview?.className).toContain('lg:hidden');
    expect(colPreview?.className).toContain('xl:flex');

    // Clicking editor header drawer button opens overlay drawer (lg:right-0, no lg:hidden)
    await act(async () => {
      fireEvent.click(editorToggle!);
    });
    expect(colPreview?.className).not.toContain('lg:hidden');
    expect(colPreview?.className).toContain('lg:right-0');

    // Font scale switches compact button vs 4-button strip at xl (1280px)
    const mobileScaleBtn = container.querySelector(
      '[data-testid="workspace-mobile-font-scale-btn"]'
    );
    expect(mobileScaleBtn?.className).toContain('xl:hidden');
    const desktopScaleGroup = container.querySelector(
      '[data-testid="workspace-font-scale-toggle"]'
    );
    expect(desktopScaleGroup?.className).toContain('xl:inline-flex');
    expect(desktopScaleGroup?.className).not.toContain('md:inline-flex');
  });

  it('A3-04: InboxEditorColumn & InboxDispatchTimeline eliminate directional copy and trigger open-preview / open-list', async () => {
    const openPreviewSpy = vi.fn();
    const openListSpy = vi.fn();
    window.addEventListener('workspace:open-preview', openPreviewSpy);
    window.addEventListener('workspace:open-list', openListSpy);

    try {
      await act(async () => {
        root.render(
          <InboxEditorColumn
            activeThread={null}
            activeEditorTab="todo"
            inlineActionError={null}
            busyAction={null}
            kakaoHeadline=""
            kakaoBrief=""
            callNote=""
            onSelectEditorTab={vi.fn()}
            onKakaoHeadlineChange={vi.fn()}
            onKakaoBriefChange={vi.fn()}
            onCallNoteChange={vi.fn()}
            onSaveCallNote={vi.fn()}
            onApproveAndSendIm={vi.fn()}
            onRejectRequest={vi.fn()}
            onArchiveThread={vi.fn()}
          />
        );
      });
      expect(container.textContent).not.toMatch(/왼쪽|오른쪽|좌측|우측/);
      const openListBtn = container.querySelector(
        '[data-testid="inbox-empty-open-list-btn"]'
      ) as HTMLButtonElement;
      expect(openListBtn).not.toBeNull();
      fireEvent.click(openListBtn);
      expect(openListSpy).toHaveBeenCalledTimes(1);

      const thread = makeInboxThread({ status: 'active', gateStatus: 'none' });
      await act(async () => {
        root.render(
          <>
            <InboxEditorColumn
              activeThread={thread}
              activeEditorTab="message"
              inlineActionError={null}
              busyAction={null}
              kakaoHeadline="추천 매물"
              kakaoBrief="브리핑"
              callNote=""
              onSelectEditorTab={vi.fn()}
              onKakaoHeadlineChange={vi.fn()}
              onKakaoBriefChange={vi.fn()}
              onCallNoteChange={vi.fn()}
              onSaveCallNote={vi.fn()}
              onApproveAndSendIm={vi.fn()}
              onRejectRequest={vi.fn()}
              onArchiveThread={vi.fn()}
            />
            <InboxDispatchTimeline
              thread={thread}
              callNote=""
              busyAction={null}
              onCallNoteChange={vi.fn()}
              onSaveCallNote={vi.fn()}
            />
          </>
        );
      });

      expect(container.textContent).not.toMatch(/왼쪽|오른쪽|좌측|우측/);
      const previewTipBtn = container.querySelector(
        '[data-testid="inbox-open-preview-from-tip-btn"]'
      ) as HTMLButtonElement;
      const timelinePreviewBtn = container.querySelector(
        '[data-testid="inbox-timeline-open-preview-btn"]'
      ) as HTMLButtonElement;
      expect(previewTipBtn).not.toBeNull();
      expect(timelinePreviewBtn).not.toBeNull();
      fireEvent.click(previewTipBtn);
      fireEvent.click(timelinePreviewBtn);
      expect(openPreviewSpy).toHaveBeenCalledTimes(2);
    } finally {
      window.removeEventListener('workspace:open-preview', openPreviewSpy);
      window.removeEventListener('workspace:open-list', openListSpy);
    }
  });

  it('A3-04: zero remaining directional UI copy or <14px classes across all owned files', () => {
    const ownedFiles = [
      'src/app/(broker)/broker/w/inbox/_components/InboxEditorColumn.tsx',
      'src/app/(broker)/broker/w/inbox/_components/InboxDispatchTimeline.tsx',
      'src/app/(broker)/broker/w/inbox/_components/InboxClientModals.tsx',
      'src/app/(broker)/broker/w/dealcards/page.tsx',
      'src/app/(broker)/broker/w/dealcards/_components/DealCardListColumn.tsx',
      'src/app/(broker)/broker/w/dealcards/_components/DealCardPreviewColumn.tsx',
      'src/app/(broker)/broker/w/dealcards/_components/DealCardEditorColumn.tsx',
      'src/app/(broker)/broker/w/dealcards/_components/dealcards-types.ts',
      'src/app/(broker)/broker/magazine-editor/_components/NewsletterPreviewSlot.tsx',
      'src/app/(broker)/broker/magazine-editor/_components/NewsletterSendStepPanel.tsx',
    ];
    for (const rel of ownedFiles) {
      const text = fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
      expect(text, `${rel} directional copy`).not.toMatch(/좌측|우측|오른쪽|왼쪽/);
      expect(text, `${rel} <14px font`).not.toMatch(/\btext-xs\b|text-\[(?:[0-9]|1[0-3])px\]/);
    }
  });

  it('A5-02: parseRawGateReason & normalizeServerThread extract email/requester_email/requesterEmail cleanly', () => {
    const p1 = parseRawGateReason(JSON.stringify({ name: '박대표', requester_email: 'park@corp.kr' }));
    expect(p1.requesterEmail).toBe('park@corp.kr');

    const p2 = parseRawGateReason(JSON.stringify({ name: '이대표', email: 'lee@fund.kr' }));
    expect(p2.requesterEmail).toBe('lee@fund.kr');

    const p3 = parseRawGateReason(JSON.stringify({ name: '최대표', requesterEmail: 'choi@reits.kr' }));
    expect(p3.requesterEmail).toBe('choi@reits.kr');

    const normalized = normalizeServerThread({
      id: 'gate-mail-1',
      clientName: '박대표',
      gateReason: JSON.stringify({ name: '박대표', requester_email: 'park@corp.kr' }),
    });
    expect(normalized.clientEmail).toBe('park@corp.kr');

    const normalizedDirect = normalizeServerThread({
      id: 'gate-mail-2',
      clientName: '직접필드',
      requesterEmail: 'direct@broker.kr',
    });
    expect(normalizedDirect.clientEmail).toBe('direct@broker.kr');
  });

  it('A5-05 / A5-07: InboxClientModals renders company input and handleUpsertClientAction persists clientCompany', async () => {
    const baseValues: InboxClientFormValues = {
      name: '홍대표',
      phone: '010-2222-3333',
      email: 'hong@asset.kr',
      company: '미래자산운용',
      basis: 'im_request',
      grade: 'VIP',
      role: 'buyer',
      buildingTitle: '',
      budget: '100억',
      region: '강남',
      freeMemo: '직접 메모',
      newsletterOptIn: false,
    };
    const onNewChange = vi.fn();
    const onEditChange = vi.fn();

    await act(async () => {
      root.render(
        <>
          <InboxNewClientModal
            open
            values={baseValues}
            inventory={[]}
            busyAction={null}
            onChange={onNewChange}
            onClose={vi.fn()}
            onSubmit={vi.fn()}
          />
          <InboxEditClientModal
            open
            values={baseValues}
            busyAction={null}
            onChange={onEditChange}
            onClose={vi.fn()}
            onSubmit={vi.fn()}
          />
        </>
      );
    });

    const newCompanyInput = container.querySelector(
      '[data-testid="new-client-company-input"]'
    ) as HTMLInputElement;
    const editCompanyInput = container.querySelector(
      '[data-testid="edit-client-company-input"]'
    ) as HTMLInputElement;
    expect(newCompanyInput?.value).toBe('미래자산운용');
    expect(editCompanyInput?.value).toBe('미래자산운용');

    fireEvent.change(editCompanyInput, { target: { value: '신규파트너스' } });
    expect(onEditChange).toHaveBeenCalledWith({ company: '신규파트너스' });

    const res = await handleUpsertClientAction({
      action: 'upsert_client',
      userId: 'mem-broker-wave3',
      buildingId: '',
      threadId: 'gate-thread-1',
      clientId: '',
      body: {
        clientName: '리드고객',
        clientCompany: '신규파트너스',
        company: '신규파트너스',
        clientPhone: '010-5555-6666',
        clientEmail: 'lead@partners.kr',
        clientGrade: 'VIP',
      },
    });
    const payload = await res.json();
    expect(res.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.client?.clientCompany).toBe('신규파트너스');
  });

  it('A3-06 / A4-09 / A5-07 source invariants in inbox/page.tsx & inbox-query.ts', () => {
    const inboxPageSrc = fs.readFileSync(
      path.join(process.cwd(), 'src/app/(broker)/broker/w/inbox/page.tsx'),
      'utf8'
    );
    const inboxQuerySrc = fs.readFileSync(
      path.join(process.cwd(), 'src/lib/inbox/inbox-query.ts'),
      'utf8'
    );

    // Dead share sheet & bare /api/og/magazine removed
    expect(inboxPageSrc).not.toContain('handleSendMaterial');
    expect(inboxPageSrc).not.toContain('showShareSheet');
    expect(inboxPageSrc).not.toContain('/api/og/magazine');

    // Timeline events appended on reject/lock/unlock
    expect(inboxPageSrc).toContain('ev-reject-');
    expect(inboxPageSrc).toContain('ev-lock-');
    expect(inboxPageSrc).toContain('ev-unlock-');

    // No raw string showUndoToast(...) calls remaining (every call passes { message, variant })
    expect(inboxPageSrc).not.toMatch(/showUndoToast\(\s*[`"']/);

    // Edit CRM works for lead & subscriber threads (not restricted to custom_)
    expect(inboxPageSrc).not.toContain('!activeThread.id.startsWith("custom_")');
    expect(inboxPageSrc).toContain('activeThread.id.startsWith("view_")');

    // inbox-query selects broker_clients.company
    expect(inboxQuerySrc).toContain('email, company, client_type');
  });

  it('A3-07 / A3-08: DealCardEditorColumn inline strip & PreSendConfirmationSheet post-publish URL controls', async () => {
    const onResync = vi.fn();
    const onCopyInline = vi.fn();
    await act(async () => {
      root.render(
        <DealCardEditorColumn
          selectedMemoOnly={null}
          activeItem={{
            id: 'dc-1',
            title: '테헤란로 프라임',
            region: '강남구 역삼동',
            use: '업무/오피스',
            priceBand: '300억대',
            status: 'sent',
            updatedAt: '방금',
            card4: {
              region: '강남구 역삼동',
              use: '업무/오피스',
              area: '연 3,300㎡',
              priceBand: '300억대',
              points: ['역세권 프라임 빌딩', '', ''],
              headline: '강남 역세권 오피스',
              provenance: { points: ['broker', 'broker', 'broker'] },
              card4_version: 1,
            },
          }}
          isSampleCard={false}
          isBlankCard={false}
          isAwaitingMemoGeneration={false}
          activeMemoText=""
          isGeneratingFromMemo={false}
          memoSaveStatus="saved"
          activeGenerationSource="manual"
          memoTextareaRef={{ current: null }}
          editorTargetId="dc-1"
          effectiveCard4={{
            region: '강남구 역삼동',
            use: '업무/오피스',
            area: '연 3,300㎡',
            priceBand: '300억대',
            points: ['역세권 프라임 빌딩', '', ''],
            headline: '강남 역세권 오피스',
            provenance: { points: ['broker', 'broker', 'broker'] },
            card4_version: 1,
          }}
          previewLifecycle="published_dirty"
          liveUrl="/dc/dc-1"
          publishError={{
            code: 'STATUTORY_DISCLOSURE_INCOMPLETE',
            message: '중개업소 법정 정보가 부족합니다.',
          }}
          onResyncPublished={onResync}
          onCopyLiveUrl={onCopyInline}
          onCreateNew={vi.fn()}
          onFillSample={vi.fn()}
          onMemoTextChange={vi.fn()}
          onGenerateFromMemo={vi.fn()}
          onSaveMemoOnly={vi.fn()}
          onSkipMemoManual={vi.fn()}
          onOpenMemoImportModal={vi.fn()}
          onCardChange={vi.fn()}
          onFocusEditorUnit={vi.fn()}
          onOpenImForBuilding={vi.fn()}
        />
      );
    });

    const strip = container.querySelector('[data-testid="dealcard-inline-status-strip"]');
    expect(strip?.className).toContain('xl:hidden');
    const inlineLink = container.querySelector(
      '[data-testid="dealcard-inline-live-link"]'
    ) as HTMLAnchorElement;
    expect(inlineLink?.getAttribute('href')).toBe('/dc/dc-1');
    fireEvent.click(container.querySelector('[data-testid="dealcard-inline-copy-btn"]')!);
    expect(onCopyInline).toHaveBeenCalledWith('/dc/dc-1');
    fireEvent.click(container.querySelector('[data-testid="dealcard-inline-resync-btn"]')!);
    expect(onResync).toHaveBeenCalledTimes(1);
    expect(
      container.querySelector('[data-testid="dealcard-inline-publish-error-profile-link"]')
    ).not.toBeNull();

    await act(async () => {
      root.render(
        <PreSendConfirmationSheet
          isOpen
          onClose={vi.fn()}
          card4={{
            region: '강남구 역삼동',
            use: '업무/오피스',
            area: '연 3,300㎡',
            priceBand: '300억대',
            points: ['역세권 프라임 빌딩', '', ''],
            headline: '강남 역세권 오피스',
            provenance: { points: ['broker', 'broker', 'broker'] },
            card4_version: 1,
          }}
          dealId="11111111-1111-4111-8111-111111111111"
          isSaved
          onFlushSave={vi.fn().mockResolvedValue(true)}
          onCopyLink={vi.fn().mockResolvedValue(true)}
          onSendToClient={vi.fn().mockResolvedValue(true)}
        />
      );
    });

    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="presend-copy-btn"]')!);
    });
    const urlText = container.querySelector('[data-testid="presend-published-url-text"]');
    expect(urlText?.textContent).toContain('/dc/11111111-1111-4111-8111-111111111111');
    const openPublicBtn = container.querySelector(
      '[data-testid="presend-open-public-btn"]'
    ) as HTMLAnchorElement;
    expect(openPublicBtn?.getAttribute('target')).toBe('_blank');
    expect(container.querySelector('[data-testid="presend-re-copy-btn"]')).not.toBeNull();
  });

  it('A3-09 / A6-03 / A6-06: NewsletterSendStepPanel URL display, magazine-editor step transitions, & 크리딜 branding', async () => {
    const onCopyLink = vi.fn();
    await act(async () => {
      root.render(
        <NewsletterSendStepPanel
          headline="11월 강남 오피스 브리핑"
          briefingBody="핵심 매물 요약입니다."
          selectedDealCount={1}
          enabledNewsCount={1}
          briefingEnabled
          dealsEnabled
          newsEnabled
          targetSegment="all"
          onChangeTargetSegment={vi.fn()}
          subscriberCount={5}
          highInterestCount={2}
          sending={false}
          isPublished
          publicUrl="https://credeal.net/magazine/hong/2026-11-23"
          distributeOutcome={{
            tone: 'success',
            title: '발송 완료',
            message: '구독자 5명에게 발송했습니다.',
            sent: 5,
            queued: 0,
            dryRun: false,
            recorded: 0,
            blockedTotal: 0,
            failed: 0,
            blockedReasons: [],
          }}
          onJumpToStep={vi.fn()}
          onNotifyEditorFocus={vi.fn()}
          onBulkSubscribersImported={vi.fn()}
          onKakaoShare={vi.fn()}
          onCopyLink={onCopyLink}
          onBackToContent={vi.fn()}
          onSendSelected={vi.fn()}
        />
      );
    });

    expect(
      container.querySelector('[data-testid="step3-published-open-btn"]')?.getAttribute('href')
    ).toBe('https://credeal.net/magazine/hong/2026-11-23');
    expect(
      container.querySelector('[data-testid="distribute-outcome-open-btn"]')?.getAttribute('href')
    ).toBe('https://credeal.net/magazine/hong/2026-11-23');
    fireEvent.click(container.querySelector('[data-testid="distribute-outcome-copy-btn"]')!);
    expect(onCopyLink).toHaveBeenCalledTimes(1);

    const writeClipboard = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: writeClipboard },
    });

    await act(async () => {
      root.render(
        <MagazineShareModal
          showShareModal
          setShowShareModal={vi.fn()}
          handleMagazineKakaoShare={vi.fn()}
          handleCopyLink={vi.fn()}
          brokerSlug="hong"
          baseUrl="https://credeal.net"
          editionDate="2026-11-23"
          cadence="monthly"
          shareTitle="11월 브리핑"
        />
      );
    });

    const pkgBtn = document.body.querySelector(
      '[data-testid="copy-group-chat-pkg-btn"]'
    ) as HTMLButtonElement;
    expect(pkgBtn).not.toBeNull();
    await act(async () => {
      fireEvent.click(pkgBtn);
    });
    expect(writeClipboard).toHaveBeenCalledWith(
      expect.stringContaining('[크리딜 (CREDEAL) 월간 부동산 소식지]')
    );
    expect(writeClipboard).toHaveBeenCalledWith(expect.stringContaining('매월 발행 알림'));
    const copiedPkgText = String(writeClipboard.mock.calls[0]?.[0] || '');
    expect(copiedPkgText).not.toContain('[CRE DealCard 주간 부동산 소식지]');
    const smsLink = document.body.querySelector(
      '[data-testid="sms-dispatch-link"]'
    ) as HTMLAnchorElement;
    expect(decodeURIComponent(smsLink?.href || '')).toContain('[크리딜 (CREDEAL) 월간 부동산 소식지]');

    const specialModalSrc = fs.readFileSync(
      path.join(process.cwd(), 'src/components/magazine-editor/SpecialEditionModal.tsx'),
      'utf8'
    );
    expect(specialModalSrc).toContain('[크리딜 (CREDEAL) 긴급 매물 속보]');
    expect(specialModalSrc).not.toContain('[CRE DealCard 긴급 매물 속보]');

    const magazinePageSrc = fs.readFileSync(
      path.join(process.cwd(), 'src/app/(broker)/broker/magazine-editor/page.tsx'),
      'utf8'
    );
    expect(magazinePageSrc).toContain('setActiveStep("send")');
    expect(magazinePageSrc).toContain('newsletter-inline-live-bar');
    expect(magazinePageSrc).not.toMatch(/if\s*\(\s*nextStep\s*===\s*["']send["']/);
  });
});
