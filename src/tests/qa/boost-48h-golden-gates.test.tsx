// @vitest-environment jsdom
/**
 * @file src/tests/qa/boost-48h-golden-gates.test.tsx
 * @description Permanent Commercial AI Golden Gates covering the 48h Deep Audit P0/P1/P2 findings:
 *   - P0-4: IM [IM 링크 복사] token minting & unauthenticated buyer verifyShareLinkToken roundtrip + copyTextFromPromise
 *   - P0-1: Newsletter analytics Step 4 receipts (no sent_at, dry_run exclusion, queued status, no cross-edition open bleed)
 *   - P0-2: Newsletter sendMode (schedule_0830 during quiet hours + web_only via Col-3 CTA never fall through to immediate send)
 *   - P0-3: broker_clients uses migrated consented_at column (zero consent_updated_at)
 *   - P1-1: list-date.ts bare YY-MM-DD for day-level relative strings + IM/Inbox ISO timestamp priority
 *   - P1-2: RentRollGrid disableAutoScaffold skips empty scaffolding for Expected RentRoll
 *   - P1-3: SimpleListRow & InboxListColumn eliminate WCAG nested <button> inside [role="button"]
 *   - P1-4: healCorruptedRegionLabel repairs "양평동가" -> "양평동4가" across /dc/[id] and all 4 OG routes (incl. kakao-v2)
 *   - P1-7: WorkspaceBottomNav hides at sm:hidden matching topbar hidden sm:flex (zero dual navbars at 640px-1023px)
 *   - P1-9: hydrateMonthlyChartsFromDbRows suppresses median when sample N < 3 ("표본 부족")
 *   - P1-6: inbox-lead-threads never fabricates tokenless /im-lite/<id> shareUrl for unapproved IM threads
 *   - P2: isSensitiveWorkspaceStorageKey covers dealcard_onboarding and MECE workbench keys
 */

import fs from "node:fs";
import path from "node:path";
import React, { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/broker/magazine-editor",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/workspace/inbox/ContactBulkImportModal", () => ({
  ContactBulkImportModal: () => null,
}));

import {
  issueShareLinkToken,
  resetShareLinkTokenStoreForTests,
  verifyShareLinkToken,
} from "@/lib/security/share-link-tokens";
import { NewsletterSendStepPanel } from "@/app/(broker)/broker/magazine-editor/_components/NewsletterSendStepPanel";
import { NewsletterPrimaryActionButton } from "@/app/(broker)/broker/magazine-editor/_components/NewsletterPreviewSlot";
import { formatListDate } from "@/lib/workspace/list-date";
import { RentRollGrid } from "@/components/workspace/RentRollGrid";
import { RowIconActionButton, SimpleListRow } from "@/components/workspace/list/WorkspaceList";
import { InboxListColumn } from "@/app/(broker)/broker/w/inbox/_components/InboxListColumn";
import type { InboxThreadItem } from "@/app/(broker)/broker/w/inbox/_components/inbox-types";
import { healCorruptedRegionLabel } from "@/domain/building/dealcard-publication/banding-engine";
import { WorkspaceBottomNav } from "@/components/workspace/WorkspaceBottomNav";
import { hydrateMonthlyChartsFromDbRows } from "@/domain/magazine/monthly-stats-hydration";
import { isSensitiveWorkspaceStorageKey } from "@/lib/workspace/storage-namespace";

function readWorkspaceFile(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), "utf8");
}

describe("48h Deep Audit Permanent AI Golden Gates (P0-1..P0-4, P1-1..P1-9, P2)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    resetShareLinkTokenStoreForTests();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    resetShareLinkTokenStoreForTests();
    vi.restoreAllMocks();
  });

  it("P0-4: IM handleCopyImShareLink mints signed buyer share token via /api/broker/share-link + copyTextFromPromise and passes verifyShareLinkToken", async () => {
    const buildingId = "11111111-2222-4333-8444-555555555555";
    const issued = await issueShareLinkToken({
      buildingId,
      brokerId: "broker-golden-gate",
      recipientId: null,
      kind: "im",
      channel: "copy",
      ttlDays: 30,
    });
    expect(issued.token).toMatch(/^slk\./);

    const verification = await verifyShareLinkToken({
      token: issued.token,
      buildingId,
    });
    expect(verification.valid).toBe(true);

    const imPageSrc = readWorkspaceFile("src/app/(broker)/broker/w/im/page.tsx");
    expect(imPageSrc).toContain("copyTextFromPromise");
    expect(imPageSrc).toContain("/api/broker/share-link");
    // Fail-closed: never fall back to returning an untokened /im-lite/<id> URL
    expect(imPageSrc).toContain("tokenizedUrl");
    expect(imPageSrc).toContain("공유 링크를 발급하지 못했습니다");
  });

  it("P0-1 & P0-3: Newsletter analytics removes nonexistent sent_at / dry_run / cross-edition open bleed & Inbox writes consented_at", () => {
    const analyticsSrc = readWorkspaceFile("src/app/api/broker/magazine/analytics/route.ts");
    expect(analyticsSrc).not.toContain("sent_at");
    expect(analyticsSrc).toContain("dry_run");
    expect(analyticsSrc).toContain('"queued"');
    expect(analyticsSrc).not.toContain("openBySub.get(");

    const upsertSrc = readWorkspaceFile("src/lib/inbox/upsert-broker-client.ts");
    expect(upsertSrc).toContain("consented_at");
    expect(upsertSrc).not.toContain("consent_updated_at");
  });

  it("P0-2: Newsletter schedule_0830 in quiet hours and web_only via Col-3 NewsletterPrimaryActionButton never fall through to immediate send", async () => {
    const onPublishWebOnly = vi.fn();
    const onSendSelected = vi.fn();

    await act(async () => {
      root.render(
        <NewsletterSendStepPanel
          headline="영등포구 양평동4가 주간 브리핑"
          briefingBody="금주 주요 매물 분석입니다."
          selectedDealCount={1}
          enabledNewsCount={1}
          briefingEnabled={true}
          dealsEnabled={true}
          newsEnabled={true}
          targetSegment="all"
          onChangeTargetSegment={vi.fn()}
          subscriberCount={5}
          highInterestCount={2}
          sending={false}
          quietHoursNow={true}
          sendMode="schedule_0830"
          onChangeSendMode={vi.fn()}
          onJumpToStep={vi.fn()}
          onNotifyEditorFocus={vi.fn()}
          onBulkSubscribersImported={vi.fn()}
          onKakaoShare={vi.fn()}
          onCopyLink={vi.fn()}
          onPublishWebOnly={onPublishWebOnly}
          onBackToContent={vi.fn()}
          onSendSelected={onSendSelected}
        />,
      );
    });

    const step3Btn = container.querySelector(
      '[data-testid="newsletter-step3-send-btn"]',
    ) as HTMLButtonElement | null;
    expect(step3Btn).not.toBeNull();
    await act(async () => {
      step3Btn!.click();
    });
    expect(onPublishWebOnly).toHaveBeenCalledWith({ scheduleMorning: true });
    expect(onSendSelected).not.toHaveBeenCalled();

    onPublishWebOnly.mockClear();
    await act(async () => {
      root.render(
        <NewsletterPrimaryActionButton
          isPublished={false}
          previewLifecycle="live_draft"
          activeStep="send"
          sending={false}
          saveState="saved"
          sendMode="web_only"
          onDraftSaveClick={vi.fn()}
          onSelectSendStep={vi.fn()}
          onSendSelected={onSendSelected}
          onPublishWebOnly={onPublishWebOnly}
        />,
      );
    });

    const primaryBtn = container.querySelector(
      '[data-testid="newsletter-primary-send-btn"]',
    ) as HTMLButtonElement | null;
    expect(primaryBtn).not.toBeNull();
    await act(async () => {
      primaryBtn!.click();
    });
    expect(onPublishWebOnly).toHaveBeenCalledTimes(1);
    expect(onSendSelected).not.toHaveBeenCalled();
  });

  it("P1-1, P1-2, P1-3 & P1-7: static day dates, disabled expected auto-scaffold, zero nested interactives, and sm:hidden bottom nav", async () => {
    const fixedNow = new Date(2026, 10, 24, 15, 30, 0);
    // Day-level relative dates never fabricate ticking HH:mm:ss
    expect(formatListDate("어제", fixedNow)).toBe("26-11-23");
    expect(formatListDate("2일 전", fixedNow)).toBe("26-11-22");
    // Exact/sub-hour markers preserve exact format
    expect(formatListDate("방금", fixedNow)).toBe("26-11-24 15:30:00");

    // P1-2: RentRollGrid with disableAutoScaffold skips empty row generation on mount
    const onChangeExpected = vi.fn();
    await act(async () => {
      root.render(
        <RentRollGrid
          rows={[]}
          onChange={onChangeExpected}
          floorsAbove={5}
          floorsBelow={1}
          disableAutoScaffold={true}
        />,
      );
    });
    expect(onChangeExpected).not.toHaveBeenCalled();

    // P1-3 + P1-7: zero nested buttons inside [role="button"] & sm:hidden on WorkspaceBottomNav
    const sampleThread: InboxThreadItem = {
      id: "thr-golden-a11y",
      clientName: "최재원 상무",
      clientPhone: "010-1234-5678",
      clientCompany: "코람코자산신탁",
      clientGrade: "VIP",
      buildingTitle: "양평동4가 빌딩",
      buildingId: "11111111-2222-4333-8444-555555555555",
      latestEvent: "열람 요청",
      gateStatus: "pending",
      updatedAt: "방금",
      lastActivityAt: "2026-11-24T10:00:00+09:00",
      openCount: 1,
      isRead: false,
      status: "pending_gate",
      shareToken: "tok-a11y",
      events: [],
      budget: "250억",
      preferredRegion: "영등포구",
    };

    await act(async () => {
      root.render(
        <>
          <SimpleListRow
            testId="row-a11y"
            title="양평동4가"
            date="2026-11-24T10:00:00+09:00"
            selected={true}
            onSelect={vi.fn()}
            actions={
              <RowIconActionButton
                testId="row-a11y-dup"
                label="복제"
                icon={<span>📄</span>}
                onClick={vi.fn()}
              />
            }
          />
          <InboxListColumn
            threads={[sampleThread]}
            filteredThreads={[sampleThread]}
            pendingCount={1}
            firstPendingThread={sampleThread}
            activeThread={sampleThread}
            activeFilter="todo"
            searchQuery=""
            viewMode="simple"
            busyAction={null}
            onFilterChange={vi.fn()}
            onSearchChange={vi.fn()}
            onViewModeChange={vi.fn()}
            onSelectThread={vi.fn()}
            onOpenNewClientModal={vi.fn()}
            onOpenBulkImportModal={vi.fn()}
          />
          <WorkspaceBottomNav />
        </>,
      );
    });

    expect(container.querySelectorAll('[role="button"] button')).toHaveLength(0);
    const navEl = container.querySelector('[data-testid="workspace-bottom-nav"]');
    expect(navEl?.className).toContain("sm:hidden");
    expect(navEl?.className).not.toContain("lg:hidden");
  });

  it("P1-4, P1-6, P1-9 & P2: read-path region healing across OG/DC, tokenless IM link guard, N<3 median suppression, and logout storage keys", () => {
    // P1-4
    expect(
      healCorruptedRegionLabel("영등포구 양평동가", ["영등포구 양평동4가 업무시설"]),
    ).toBe("영등포구 양평동4가");
    expect(healCorruptedRegionLabel("영등포구 상가", [])).toBe("영등포구 상가");
    for (const rel of [
      "src/app/(public)/dc/[id]/page.tsx",
      "src/app/api/og/deal/[id]/route.tsx",
      "src/app/api/og/deal/[id]/kakao-v2/route.tsx",
      "src/app/api/og/deal/[id]/kakao/route.tsx",
      "src/app/api/og/deal/[id]/card/route.tsx",
    ]) {
      expect(readWorkspaceFile(rel)).toContain("healCorruptedRegionLabel");
    }

    // P1-6
    const leadThreadsSrc = readWorkspaceFile("src/lib/inbox/inbox-lead-threads.ts");
    expect(leadThreadsSrc).toContain("resolvedHasIm === false || Boolean(resolvedShareToken)");

    // P1-9
    const charts = hydrateMonthlyChartsFromDbRows({
      regionKey: "ybd",
      pair: ["molit_tx_price_trend", "bok_loan_rate_cap_spread"],
      transactions: [
        { transaction_date: "2026-09-10", transaction_price: 10_000_000_000, building_area: 661.16, building_type: "일반" },
        { transaction_date: "2026-10-10", transaction_price: 12_000_000_000, building_area: 661.16, building_type: "일반" },
      ],
    });
    const txChart = charts[0];
    expect(txChart.series[0].secondaryValue).toBeUndefined();
    expect(txChart.series[0].displaySecondary).toBe("표본 부족");

    // P2 sensitive storage purge keys
    expect(isSensitiveWorkspaceStorageKey("dealcard_onboarding")).toBe(true);
    expect(isSensitiveWorkspaceStorageKey("credeal-dealcard-im-mece-workbench-v1")).toBe(true);
    expect(isSensitiveWorkspaceStorageKey("credeal-nl-inbox-mece-workbench-v1")).toBe(true);
  });
});
