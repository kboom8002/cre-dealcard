// @vitest-environment jsdom
/**
 * 2026-11 Cross-Workspace Parity Upgrade Regression Suite
 * Covers:
 *  - I-01: Empty events honest state & /dc/ fallback shareUrl
 *  - N-02 / I-05: 404 zero-tolerance (DealInquirySheet /dc/ routing, InboxPreviewColumn notice, 409 IM_NOT_GENERATED)
 *  - N-04: 2x2 blind deal card grid in NewsletterPreviewCard + formatDealPriceLabel
 *  - N-07: Live news refresh trigger & source freshness badge
 *  - N-08: Decision 1-B delete safety (published requires title match, draft single-confirm)
 *  - I-07: Decision 4-A non-repeating /api/broker/inbox/ai-reply + InboxEditorColumn AI reply button
 *  - I-08: InboxNewClientModal duplicate phone/email warning + inventory select dropdown
 */
import React from "react";
import { NextRequest } from "next/server";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/auth-guard", () => ({
  requireBroker: vi.fn(async () => ({
    user: { id: "broker-parity-1" },
    role: "broker",
    error: null,
  })),
}));

vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi.fn(async () => true),
}));

vi.mock("@/ai/llm-client", () => ({
  callLLM: vi.fn(async () => {
    throw new Error("Mock offline LLM to exercise deterministic Korean pool");
  }),
  LLMMockNotAllowedError: class extends Error {},
}));

vi.mock("@/lib/workspace/workspace-repository", () => ({
  listWorkspaceItemsForOwner: vi.fn(async () => ({
    tableAvailable: true,
    items: [
      {
        id: "ws-dc-only",
        buildingId: "dc-only-bld",
        legacyId: "dc-only-bld",
        kind: "dealcard",
        status: "draft",
        deletedAt: null,
      },
    ],
  })),
}));

vi.mock("@/lib/legal/publish-gate", () => ({
  assertPublishable: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/lib/inbox/inbox-ownership", () => ({
  isBuildingShareLinkRevokedAsync: vi.fn(async () => false),
  verifyBrokerOwnership: vi.fn(async () => ({ ok: true })),
  inspectShareTokenOwnership: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: (table: string) => {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        is: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => {
          if (table === "broker_profiles") {
            return {
              data: {
                display_name: "김공인",
                slug: "kim-broker",
                office_name: "김공인중개사무소",
                phone: "010-1234-5678",
              },
              error: null,
            };
          }
          return { data: null, error: null };
        },
        then: (resolve: (v: unknown) => void) =>
          Promise.resolve({ data: null, error: null }).then(resolve),
      };
      return chain;
    },
  })),
}));

import { InboxDispatchTimeline } from "@/app/(broker)/broker/w/inbox/_components/InboxDispatchTimeline";
import { InboxEditorColumn } from "@/app/(broker)/broker/w/inbox/_components/InboxEditorColumn";
import { InboxPreviewColumn } from "@/app/(broker)/broker/w/inbox/_components/InboxPreviewColumn";
import { InboxNewClientModal } from "@/app/(broker)/broker/w/inbox/_components/InboxClientModals";
import {
  normalizeServerThread,
  type InboxThreadItem,
} from "@/app/(broker)/broker/w/inbox/_components/inbox-types";
import { EditionDeleteModal } from "@/app/(broker)/broker/magazine-editor/_components/EditionDeleteModal";
import { NewsletterPreviewCard } from "@/app/(broker)/broker/magazine-editor/_components/NewsletterPreviewCard";
import {
  formatDealPriceLabel,
  type SavedEditionSummary,
} from "@/app/(broker)/broker/magazine-editor/_components/magazine-workspace-types";
import { AxiosIssuesEditorPanel } from "@/components/magazine-editor/AxiosIssuesEditorPanel";
import { DealInquirySheet } from "@/components/magazine/DealInquirySheet";
import { clusterArticlesIntoFiveIssues } from "@/domain/magazine/issue-clustering";
import { CURATED_CHANNEL_POOL } from "@/domain/magazine/news-channels";
import { handleOutboundChannelAction } from "@/lib/inbox/inbox-actions-outbound";
import { POST as aiReplyPost } from "@/app/api/broker/inbox/ai-reply/route";

function makeSampleThread(overrides: Partial<InboxThreadItem> = {}): InboxThreadItem {
  return {
    id: "thread-parity-1",
    clientName: "박매수 대표",
    clientPhone: "010-2222-3333",
    clientEmail: "buyer@example.co.kr",
    clientGrade: "일반",
    isVip: false,
    clientRole: "buyer",
    buildingId: "dc-only-bld",
    buildingTitle: "강남 역삼동 코너 근생",
    latestEvent: "",
    shareToken: "tok-1",
    shareUrl: "/dc/dc-only-bld?token=tok-1",
    status: "active",
    openCount: 0,
    isRead: true,
    budget: "",
    preferredRegion: "강남구",
    updatedAt: "2026-11-21T10:00:00Z",
    hasIm: false,
    hasDealCard: true,
    events: [],
    dispatchHistory: [],
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Cross-workspace parity upgrade (I-01, N-02/I-05, N-04, N-07, N-08, I-07, I-08)", () => {
  it("I-01: 빈 기록 상태에 거짓 열람 문구를 지어내지 않고 정직한 빈 상태 안내와 /dc/ 기본 URL을 유지한다", () => {
    const emptyThread = makeSampleThread({ events: [], dispatchHistory: [] });
    const normalized = normalizeServerThread({
      ...emptyThread,
      shareUrl: undefined,
      hasIm: false,
    });
    expect(normalized.events).toEqual([]);
    expect(normalized.shareUrl).toContain("/dc/dc-only-bld");
    expect(normalized.shareUrl).not.toContain("/im-lite/");

    render(
      <InboxDispatchTimeline
        thread={normalized}
        callNote=""
        busyAction={null}
        onCallNoteChange={vi.fn()}
        onSaveCallNote={vi.fn()}
      />,
    );

    const emptyBox = screen.getByTestId("inbox-events-empty");
    expect(emptyBox.textContent).toContain("아직 열람 및 상담 기록이 없습니다.");
    expect(document.body.textContent).not.toContain("상세 자료를 열람했습니다");
  });

  it("N-02 / I-05: IM 미생성 매물은 /dc/[id]로 안전 유도하고 IM 발송 시도 시 409 IM_NOT_GENERATED를 반환한다", async () => {
    const uuidDealNoIm = "11111111-1111-4111-8111-111111111111";
    const uuidDealWithIm = "22222222-2222-4222-8222-222222222222";

    render(
      <div>
        <button
          type="button"
          data-testid="trigger-no-im"
          data-deal-inquiry="1"
          data-deal-id={uuidDealNoIm}
          data-deal-asset="꼬마빌딩"
          data-deal-address="서울 강남구 역삼동"
          data-deal-signal="강남 역삼권역"
          data-deal-price="50억대 빌딩"
          data-deal-has-im="false"
        >
          딜카드 매물 보기
        </button>
        <button
          type="button"
          data-testid="trigger-with-im"
          data-deal-inquiry="1"
          data-deal-id={uuidDealWithIm}
          data-deal-asset="사옥 빌딩"
          data-deal-address="서울 서초구 서초동"
          data-deal-signal="서초권역"
          data-deal-price="120억대 빌딩"
          data-deal-has-im="true"
        >
          IM 매물 보기
        </button>
        <DealInquirySheet
          brokerName="김공인"
          brokerPhone="010-1234-5678"
          brokerSlug="kim-broker"
        />
      </div>,
    );

    fireEvent.click(screen.getByTestId("trigger-no-im"));
    await waitFor(() => expect(screen.getByText("딜카드 먼저 보기")).toBeTruthy());
    const dcLink = document.body.querySelector(
      `a[href="/dc/${uuidDealNoIm}"]`,
    ) as HTMLAnchorElement | null;
    expect(dcLink).not.toBeNull();
    expect(document.body.querySelector(`a[href="/im-lite/${uuidDealNoIm}"]`)).toBeNull();

    fireEvent.click(screen.getByTestId("trigger-with-im"));
    await waitFor(() => expect(screen.getByText("상세 제안서(IM) 보기")).toBeTruthy());
    const imLink = document.body.querySelector(
      `a[href="/im-lite/${uuidDealWithIm}"]`,
    ) as HTMLAnchorElement | null;
    expect(imLink).not.toBeNull();

    cleanup();

    const dcOnlyThread = makeSampleThread({ hasIm: false, hasDealCard: true });
    render(
      <InboxPreviewColumn
        activeThread={dcOnlyThread}
        activeInboxUnitId={null}
        busyAction={null}
        outboundAssetKind="im"
        subscriptionTier="free"
        outboundEmail="buyer@example.co.kr"
        outboundBasis="im_request"
        alimtalkTemplateId="TPL_INBOX_IM_APPROVED"
        copiedBundlePreview={null}
        showAlimtalkUpgradeSheet={false}
        confirmLockOpen={false}
        lockEntireBuilding={false}
        correctionNoticeOpen={false}
        correctionNoticeText=""
        onFocusEditorUnit={vi.fn()}
        onCopyActiveShareLink={vi.fn()}
        onSendMaterial={vi.fn()}
        onOutboundEmailChange={vi.fn()}
        onOutboundBasisChange={vi.fn()}
        onAlimtalkTemplateChange={vi.fn()}
        onPrepareCopyBundle={vi.fn()}
        onSendInboxEmail={vi.fn()}
        onSendInboxAlimtalk={vi.fn()}
        onCloseAlimtalkUpgradeSheet={vi.fn()}
        onToggleNewsletter={vi.fn()}
        onOpenEditCustomClient={vi.fn()}
        onRequestDeleteCustomClient={vi.fn()}
        onOpenConfirmLock={vi.fn()}
        onCancelConfirmLock={vi.fn()}
        onLockEntireBuildingChange={vi.fn()}
        onConfirmLockLink={vi.fn()}
        onUnlockLink={vi.fn()}
        onOpenCorrectionNotice={vi.fn()}
        onCancelCorrectionNotice={vi.fn()}
        onCorrectionNoticeTextChange={vi.fn()}
        onPublishCorrectionNotice={vi.fn()}
        onClearCorrectionNotice={vi.fn()}
      />,
    );

    expect(screen.getByTestId("inbox-outbound-asset-tabs")).toBeTruthy();
    const notice = screen.getByTestId("inbox-im-not-generated-notice");
    expect(notice.textContent).toContain("IM");
    expect(screen.getByTestId("inbox-alimtalk-disclosure")).toBeTruthy();
    expect(screen.getByTestId("preview-call-link").getAttribute("href")).toContain("tel:");

    const apiRes = await handleOutboundChannelAction({
      action: "prepare_copy_bundle",
      userId: "broker-parity-1",
      buildingId: "dc-only-bld",
      threadId: "thread-parity-1",
      clientId: "",
      shareToken: "",
      origin: "http://localhost:3000",
      body: {
        assetKind: "im",
        clientName: "박매수 대표",
        buildingTitle: "강남 역삼동 코너 근생",
      },
    });
    expect(apiRes.status).toBe(409);
    const json = (await apiRes.json()) as { ok: boolean; code?: string };
    expect(json.ok).toBe(false);
    expect(json.code).toBe("IM_NOT_GENERATED");
  });

  it("N-04: NewsletterPreviewCard가 2x2 다크 블라인드 매물 요약 그리드와 블라인드 가격대를 렌더한다", () => {
    const band = formatDealPriceLabel(5_200_000_000);
    expect(band).toBe("50~60억");
    expect(band).not.toBe("52억");

    render(
      <NewsletterPreviewCard
        previewLifecycle="live_draft"
        activeUnitId={null}
        onFocusEditorUnit={vi.fn()}
        yearMonthLabel="2026년 11월호"
        marketTemp="선별 매수"
        headline="11월 강남권 수익형 빌딩 핵심 소식"
        brokerName="김공인"
        brokerOffice="김공인중개사무소"
        brokerPhone="010-1234-5678"
        cadence="monthly"
        monthlyRegion="gbd"
        monthlyCharts={[]}
        formattedPreviewBriefing="역세권 신축 위주로 매수 문의가 꾸준합니다."
        unitIssues={[]}
        selectedDeals={[
          {
            id: "deal-1",
            title: "역삼역 코너 빌딩",
            address: "서울 강남구 역삼동 123-4",
            price: band,
            priceBand: band,
            areaLabel: "연면적 300평대",
            assetType: "꼬마빌딩",
            yield: "4.2%",
            photoUrl: null,
            hasIm: false,
          },
        ]}
        dealComments={{ "deal-1": "임차 구성이 안정적인 코너 매물입니다." }}
        isSectionEnabled={() => true}
      />,
    );

    const blindGrid = screen.getByTestId("preview-deal-blind-grid-deal-1");
    expect(blindGrid.textContent).toContain("연면적 300평대");
    expect(blindGrid.textContent).toContain(band);
  });

  it("N-07: AxiosIssuesEditorPanel이 실시간 뉴스 새로고침 버튼과 정직한 출처 신선도 배지를 표시한다", () => {
    const curatedFive = clusterArticlesIntoFiveIssues(CURATED_CHANNEL_POOL, {
      cadence: "weekly",
    });

    const onRefreshLive = vi.fn();
    const { rerender } = render(
      <AxiosIssuesEditorPanel
        unitIssues={curatedFive}
        onChangeUnitIssues={vi.fn()}
        newsPool={[]}
        onRefreshLiveChannel={onRefreshLive}
      />,
    );

    const refreshBtn = screen.getByTestId("refresh-live-news-btn");
    fireEvent.click(refreshBtn);
    expect(onRefreshLive).toHaveBeenCalledWith("all");
    expect(screen.getByTestId("axios-source-freshness-badge").textContent).toBe("참고 예시");

    rerender(
      <AxiosIssuesEditorPanel
        unitIssues={[
          {
            id: "live-news-1",
            title: "역세권 꼬마빌딩 공실 감소세 뚜렷",
            brief: "유동인구 회복으로 핵심 상권 월세가 안정 흐름을 보이고 있습니다.",
            memoTone: "amber",
            channel: "real_estate",
            sentiment: "bullish",
          },
        ]}
        onChangeUnitIssues={vi.fn()}
        newsPool={[]}
        onRefreshLiveChannel={onRefreshLive}
      />,
    );

    expect(screen.getByTestId("axios-source-freshness-badge").textContent).toBe(
      "실시간 기사 반영",
    );
  });

  it("N-08: EditionDeleteModal은 발행 완료 호에만 제목 재입력 확인을 요구하고 초안은 단일 확인으로 처리한다", () => {
    const publishedEdition: SavedEditionSummary = {
      id: "ed-pub-1",
      slug: "2026-11",
      title: "11월 강남권 빌딩 리포트",
      status: "published",
      updatedAt: "2026-11-20T09:00:00Z",
      publishedAt: "2026-11-20T09:00:00Z",
      dealCount: 1,
      hasBriefing: true,
    };
    const draftEdition: SavedEditionSummary = {
      ...publishedEdition,
      id: "ed-draft-1",
      title: "작성 중 초안",
      status: "draft",
      publishedAt: null,
    };

    const { rerender } = render(
      <EditionDeleteModal
        targetEdition={publishedEdition}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByTestId("confirm-delete-match-input")).toBeTruthy();

    rerender(
      <EditionDeleteModal
        targetEdition={draftEdition}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("confirm-delete-match-input")).toBeNull();
  });

  it("I-07: /api/broker/inbox/ai-reply가 순화된 비중복 답장을 생성하고 InboxEditorColumn에 AI 맞춤 답장 버튼을 노출한다", async () => {
    const req1 = new NextRequest("http://localhost:3000/api/broker/inbox/ai-reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientName: "박매수 대표",
        buildingTitle: "강남 역삼동 코너 근생",
        assetKind: "dealcard",
        hasIm: false,
        attemptSeed: 0,
      }),
    });
    const res1 = await aiReplyPost(req1);
    expect(res1.status).toBe(200);
    const json1 = (await res1.json()) as {
      ok: boolean;
      result: { headline: string; brief: string };
    };
    expect(json1.ok).toBe(true);
    expect(json1.result.headline.length).toBeGreaterThan(4);
    expect(json1.result.brief).not.toMatch(/캡레이트|밸류업|60대|70대/);

    const req2 = new NextRequest("http://localhost:3000/api/broker/inbox/ai-reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientName: "박매수 대표",
        buildingTitle: "강남 역삼동 코너 근생",
        assetKind: "dealcard",
        hasIm: false,
        avoidReplies: [`${json1.result.headline} ${json1.result.brief}`],
        attemptSeed: 1,
      }),
    });
    const res2 = await aiReplyPost(req2);
    expect(res2.status).toBe(200);
    const json2 = (await res2.json()) as {
      ok: boolean;
      result: { headline: string; brief: string };
    };
    expect(json2.ok).toBe(true);
    expect(json2.result.headline).not.toBe(json1.result.headline);

    const onGenerateAi = vi.fn();
    render(
      <InboxEditorColumn
        activeThread={makeSampleThread()}
        activeEditorTab="message"
        inlineActionError={null}
        busyAction={null}
        kakaoHeadline="기존 제목"
        kakaoBrief="기존 본문"
        callNote=""
        onSelectEditorTab={vi.fn()}
        onKakaoHeadlineChange={vi.fn()}
        onKakaoBriefChange={vi.fn()}
        onCallNoteChange={vi.fn()}
        onSaveCallNote={vi.fn()}
        onApproveAndSendIm={vi.fn()}
        onRejectRequest={vi.fn()}
        onArchiveThread={vi.fn()}
        onGenerateAiReply={onGenerateAi}
      />,
    );

    const aiBtn = screen.getByTestId("inbox-ai-reply-btn");
    fireEvent.click(aiBtn);
    expect(onGenerateAi).toHaveBeenCalledTimes(1);
  });

  it("I-08: InboxNewClientModal이 중복 연락처/이메일 경고와 보유 매물 select 드롭다운을 함께 제공한다", () => {
    const existing = makeSampleThread({
      clientName: "기존 김대표",
      clientPhone: "010-9999-8888",
      clientEmail: "dup@company.co.kr",
    });

    const onChange = vi.fn();
    render(
      <InboxNewClientModal
        open={true}
        values={{
          name: "신규 고객",
          phone: "010-9999-8888",
          email: "",
          basis: "",
          grade: "일반",
          role: "buyer",
          buildingTitle: "",
          budget: "",
          region: "",
          freeMemo: "",
          newsletterOptIn: true,
        }}
        inventory={[
          {
            buildingId: "bld-1",
            title: "논현동 신축 근생빌딩",
            region: "강남구",
            priceBand: "60억대",
            askingPriceManwon: 600000,
            capRatePct: 4.1,
          },
        ]}
        existingThreads={[existing]}
        busyAction={null}
        onChange={onChange}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    const warning = screen.getByTestId("new-client-duplicate-warning");
    expect(warning.textContent).toContain("기존 김대표");

    const buildingSelect = screen.getByTestId("new-client-building-select") as HTMLSelectElement;
    fireEvent.change(buildingSelect, { target: { value: "논현동 신축 근생빌딩" } });
    expect(onChange).toHaveBeenCalledWith({ buildingTitle: "논현동 신축 근생빌딩" });
  });
});
