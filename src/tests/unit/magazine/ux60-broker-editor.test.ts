/**
 * 60대 중개사 UX 전면 개선 (U3: 브로커 에디터 크롬 · AI 글쓰기 비서 · 발행 확인 모달 · 구독자/아웃리치 · QR/공유 · 토스트 · 대시보드 카드)
 * 회귀 단위 테스트.
 */
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/ui/modal', () => ({
  Modal: ({ open, title, description, children }: { open: boolean; title?: string; description?: string; children?: React.ReactNode }) =>
    open
      ? React.createElement(
          'div',
          { role: 'dialog', 'aria-label': title },
          title ? React.createElement('h2', null, title) : null,
          description ? React.createElement('p', null, description) : null,
          children,
        )
      : null,
}));

import { EditorAiAssistTab } from '@/components/magazine-editor/EditorAiAssistTab';
import { EditorCoverTab } from '@/components/magazine-editor/EditorCoverTab';
import { EditorFieldNoteTab } from '@/components/magazine-editor/EditorFieldNoteTab';
import { IssueMetadataForm } from '@/components/magazine-editor/IssueMetadataForm';
import { PublishConfirmModal } from '@/components/magazine-editor/PublishConfirmModal';
import { SaveStatusBadge } from '@/components/magazine-editor/SaveStatusBadge';
import { SlugSetupGate } from '@/components/magazine-editor/SlugSetupGate';
import { MagazineQuickDraftCard } from '@/components/broker/studio/MagazineQuickDraftCard';
import { MagazineInsightCard } from '@/components/dashboard/MagazineInsightCard';
import { ToastProvider } from '@/components/ui/toast-provider';
import { NextRequest } from 'next/server';
import { NewsletterContentStepPanel } from '@/app/(broker)/broker/magazine-editor/_components/NewsletterContentStepPanel';
import { NewsletterSendStepPanel } from '@/app/(broker)/broker/magazine-editor/_components/NewsletterSendStepPanel';
import { NewsletterPrimaryActionButton } from '@/app/(broker)/broker/magazine-editor/_components/NewsletterPreviewSlot';
import { resolveMagazineQueryAction } from '@/app/(broker)/broker/magazine-editor/_components/magazine-workspace-types';
import { buildDefaultMonthlyGraphicPair, hydrateMonthlyChartsFromDbRows } from '@/domain/magazine/monthly-stats-hydration';
import { MagazineView } from '@/app/(magazine)/magazine/[brokerId]/[date]/magazine-view';

const ROOT = path.resolve(__dirname, '../../..');
const readSrc = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('U-F0-5 (B-01, B-26): AI 코멘트 비서 자동 스크롤·인라인 배너·폴백 적용', () => {
  it('결과가 있을 때 생성 버튼 바로 아래에 녹색 인라인 안내 배너가 표시된다', () => {
    const html = renderToStaticMarkup(
      React.createElement(EditorAiAssistTab, {
        memory: {
          idea: '금리 인하 기대감으로 매수 문의가 늘어남',
          result: '최근 금리 인하 기대감에 힘입어 매수 문의가 꾸준히 증가하고 있습니다.',
          warnings: [],
        },
        onApply: () => {},
      }),
    );
    expect(html).toContain('data-testid="ai-assist-ready-banner"');
    expect(html).toContain('AI가 다듬은 문장이 아래에 준비되었습니다. 확인 후 [필드노트에 넣기]를 눌러 주세요');
    expect(html).toContain('필드노트에 넣기');
  });

  it('AI 호출 실패 시 고정 경고 박스와 [📝 입력한 메모 그대로 필드노트에 넣기] 폴백 버튼을 제공한다', () => {
    const html = renderToStaticMarkup(
      React.createElement(EditorAiAssistTab, {
        memory: {
          idea: '역세권 꼬마빌딩 급매 출현',
          result: '',
          warnings: [],
        },
        initialError: '네트워크 오류로 생성하지 못했습니다. 다시 시도해 주세요.',
        onApply: () => {},
      }),
    );
    expect(html).toContain('data-testid="ai-assist-error-box"');
    expect(html).toContain('📝 입력한 메모 그대로 필드노트에 넣기');
    expect(html).toContain('min-h-12');
  });

  it('생성 완료 시 결과창 자동 스크롤/포커스 및 생성 중 예상 소요 시간 안내가 포함되어 있다', () => {
    const src = readSrc('components/magazine-editor/EditorAiAssistTab.tsx');
    expect(src).toContain('scrollIntoView({ behavior: "smooth", block: "center" })');
    expect(src).toContain('AI가 문장을 다듬는 중… (약 5~10초 소요)');
  });
});

describe('U-F1-01 (B-03, B-11): 발행 확인 모달 발송 중지 모순 제거 및 실패 복구', () => {
  it('sendEnabled === false 일 때 최상단 경고 박스 노출 + 발송 체크박스 자동 해제·비활성화 + 정정 발행 안심 안내', () => {
    const html = renderToStaticMarkup(
      React.createElement(PublishConfirmModal, {
        open: true,
        onOpenChange: () => {},
        issueDate: '2026-04-20',
        targetSegment: 'all',
        subscriberCount: 12,
        sendEnabled: false,
        correction: false,
        busy: false,
        sendAfterPublish: true,
        onSendAfterPublishChange: () => {},
        onConfirm: () => {},
      }),
    );
    expect(html).toContain('data-testid="publish-send-disabled-banner"');
    expect(html).toContain('발행만 되고 구독자 발송은 중지 상태입니다(관리자 설정)');
    expect(html).toContain('지금 [발행하기]를 누르시면 웹 매거진만 공개되며, 고객에게 카톡·이메일은 발송되지 않습니다(0건)');
    expect(html).toContain('💡 발행 후 오타를 발견하셔도 언제든 내용을 고친 뒤 [정정 발행] 버튼으로 즉시 수정본을 반영할 수 있습니다');
    // 체크박스가 disabled 되어 있어야 한다
    expect(html).toMatch(/<input type="checkbox"[^>]*disabled=""/);
  });

  it('발행 API 실패 시 모달이 닫히지 않고 내부에 오류 안내와 48px [다시 시도] 버튼을 표시한다', () => {
    const html = renderToStaticMarkup(
      React.createElement(PublishConfirmModal, {
        open: true,
        onOpenChange: () => {},
        issueDate: '2026-04-20',
        targetSegment: 'all',
        subscriberCount: 5,
        sendEnabled: true,
        correction: false,
        busy: false,
        sendAfterPublish: true,
        onSendAfterPublishChange: () => {},
        onConfirm: () => {},
        publishError: '발행에 실패했습니다. 잠시 후 다시 시도해 주세요.',
      }),
    );
    expect(html).toContain('data-testid="publish-modal-error"');
    expect(html).toContain('발행에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    expect(html).toContain('다시 시도');
  });
});

describe('U-F1-03 & U-F1-04 (B-08, B-14, B-16, B-17, B-20): SOTA 3열 스튜디오 · 4단계 탭 · 실시간 인과 미리보기', () => {
  const pageSrc = readSrc('app/(broker)/broker/magazine-editor/page.tsx');

  it('WorkspaceShell 3열(고르기·채우기·확인하고 보내기)과 4단계 탭을 표시한다', () => {
    expect(pageSrc).toContain('<WorkspaceShell');
    expect(pageSrc).toContain('workspace="magazine"');
    expect(pageSrc).toContain('aria-label="뉴스레터 작성 4단계"');
  });

  it('모바일(390px)에서도 4단계 탭 라벨이 숨겨지지 않고(hidden sm:inline 제거) 반응형 4단계 그리드로 표시된다', () => {
    expect(pageSrc).not.toContain('hidden sm:inline');
    expect(pageSrc).toContain('grid-cols-2 sm:grid-cols-4');
    expect(pageSrc).toContain('data-testid={`step-tab-${tab.key}`}');
    expect(pageSrc).toContain('key: "title"');
    expect(pageSrc).toContain('key: "content"');
    expect(pageSrc).toContain('key: "send"');
    expect(pageSrc).toContain('key: "history"');
  });

  it('PreviewCausalityBar를 통해 "공개 독자 화면 보기 ↗" 링크와 발행·미리보기 동기화 상태를 제공한다', () => {
    expect(pageSrc).toContain('<PreviewCausalityBar');
    expect(pageSrc).toContain('공개 독자 화면 보기 ↗');
    expect(pageSrc).toContain('preview-live-reader-link');
  });
});

describe('U-F1-05 (B-07, B-28): 속보(Flash Issue) 진입점 & 대시보드 매거진 카드', () => {
  it('MagazineInsightCard는 구독자 0명·조회수 0회일 때도 숨기지 않고 주간 매거진 & 속보 스튜디오 가이드를 표시한다', () => {
    const html = renderToStaticMarkup(
      React.createElement(MagazineInsightCard, {
        viewCount: 0,
        subscriberCount: 0,
      }),
    );
    expect(html).toContain('주간 매거진 &amp; 속보 스튜디오');
    expect(html).toContain('이번 주 매거진 만들기');
    expect(html).toContain('구독자 관리 · QR 코드');
    expect(html).toContain('⚡ 긴급 매물 속보 만들기');
  });

  it('EditorOutreachTab에 [⚡ 긴급 매물 속보 만들기] 상단 배너와 이메일 미등록 안내 배너, 삭제 후 8초 안내가 포함되어 있다', () => {
    const src = readSrc('components/magazine-editor/EditorOutreachTab.tsx');
    expect(src).toContain('outreach-flash-issue-banner');
    expect(src).toContain('⚡ 긴급 매물 속보 만들기');
    expect(src).toContain('pending-email-confirm-banner');
    expect(src).toContain('구독자 이름을 눌러 이메일을 추가해 주세요');
    expect(src).toContain('subscriber-deleted-notice');
    expect(src).toContain('duration: 8000');
  });
});

describe('U-F1-06 (B-04, B-05, B-09, B-10, B-12, B-15, B-18, B-19, B-21, B-22, B-23): 세부 마찰 제거', () => {
  it('ToastProvider가 bottom-right 및 duration 8000ms로 설정되어 있다 (B-15)', () => {
    const src = readSrc('components/ui/toast-provider.tsx');
    expect(src).toContain('position="bottom-right"');
    expect(src).toContain('duration={8000}');
    const html = renderToStaticMarkup(React.createElement(ToastProvider));
    expect(html).toBeDefined();
  });

  it('SaveStatusBadge 액션 버튼들이 44px 이상(min-h-11) 및 14px(text-sm) 크기를 갖는다 (B-18)', () => {
    const errHtml = renderToStaticMarkup(
      React.createElement(SaveStatusBadge, {
        status: 'error',
        lastSavedAt: null,
        errorMessage: '네트워크 오류',
        onRetry: () => {},
      }),
    );
    expect(errHtml).toContain('min-h-11');
    expect(errHtml).toContain('text-sm font-bold');
    expect(errHtml).toContain('다시 시도');

    const conflictHtml = renderToStaticMarkup(
      React.createElement(SaveStatusBadge, {
        status: 'conflict',
        lastSavedAt: null,
        onReload: () => {},
        onOverwrite: () => {},
      }),
    );
    expect(conflictHtml).toContain('새로고침');
    expect(conflictHtml).toContain('내 변경으로 덮어쓰기');
  });

  it('EditorCoverTab에 브리핑 작성 주체 안내(14px)와 추천 키워드 칩 5개가 표시된다 (B-04, B-05)', () => {
    const html = renderToStaticMarkup(
      React.createElement(EditorCoverTab, {
        marketTemp: '선별 매수',
        setMarketTemp: () => {},
        coverKeywords: ['', '', ''],
        updateKeyword: () => {},
        headline: '',
        setHeadline: () => {},
        briefing: '',
        setBriefing: () => {},
        coverImageUrl: null,
        setCoverImageUrl: () => {},
      }),
    );
    expect(html).toContain('💡 한 줄 브리핑은 중개사님이 직접 적거나 [AI] 탭에서 다듬어 넣을 수 있습니다');
    for (const kw of ['금리 인하', '꼬마빌딩', '공실률', '착한 임대', '역세권']) {
      expect(html).toContain(kw);
    }
  });

  it('EditorFieldNoteTab 입력창이 min-h-[108px] resize-y text-base로 확대되고 글자수·작성 요령 보기가 표시된다 (B-09, B-10)', () => {
    const html = renderToStaticMarkup(
      React.createElement(EditorFieldNoteTab, {
        fieldNote: {
          question: '요약 테스트',
          buyerReaction: '',
          sellerReaction: '',
          marketJudgment: '',
          comment: '',
        },
        updateFieldNote: () => {},
        activeTooltip: null,
        setActiveTooltip: () => {},
      }),
    );
    expect(html).toContain('min-h-[108px]');
    expect(html).toContain('resize-y');
    expect(html).toContain('text-base');
    expect(html).toContain('작성 요령 보기');
    expect(html).toContain('6자 · 권장 2~3문장');
  });

  it('AddSubscriberForm에서 카카오톡 단독 선택 + 이메일 미입력 시 14px 안내 문구를 표시한다 (B-12)', () => {
    const src = readSrc('components/magazine-editor/outreach/AddSubscriberForm.tsx');
    expect(src).toContain('💡 <strong>이메일</strong>을 함께 입력하시면');
    expect(src).toContain('카카오톡 단독 선택 시');
  });

  it('SlugSetupGate가 추천 슬러그 칩 3종과 한글·띄어쓰기 입력 시 구체적 안내 문구를 제공한다 (B-19, B-23)', () => {
    const html = renderToStaticMarkup(
      React.createElement(SlugSetupGate, {
        onConfirmed: () => {},
      }),
    );
    expect(html).toContain('gangnam-building');
    expect(html).toContain('seoul-office-pro');
    expect(html).toContain('prime-realty');

    const src = readSrc('components/magazine-editor/SlugSetupGate.tsx');
    expect(src).toContain(
      '한글·띄어쓰기는 사용할 수 없습니다. 영문 소문자(a~z), 숫자(0~9), 하이픈(-)만 입력해 주세요',
    );
  });

  it('MagazineQrModal 및 MagazineShareModal에서 개발자 환경변수명(APP_BASE_URL)이 사용자 UI에 노출되지 않는다 (B-21, B-22)', () => {
    const qrSrc = readSrc('components/magazine-editor/MagazineQrModal.tsx');
    const shareSrc = readSrc('components/magazine-editor/MagazineShareModal.tsx');
    expect(qrSrc).toContain('width: 210');
    expect(qrSrc).not.toContain('서비스 주소(APP_BASE_URL)');
    expect(shareSrc).not.toContain('공유 주소(APP_BASE_URL)');
  });
});

describe('Track 3B (E-01 ~ E-05) 회귀 검증', () => {
  it('E-01: globals.css 포커스 placeholder 숨김, [×] 입력 지우기 버튼(44px), AI 참고 지역 안내 칩을 제공한다', () => {
    const cssSrc = readSrc('app/globals.css');
    expect(cssSrc).toContain('.broker-paper-theme input:focus::placeholder');
    expect(cssSrc).toContain('.broker-paper-theme textarea:focus::placeholder');
    expect(cssSrc).toContain('opacity: 0 !important');

    const titleHtml = renderToStaticMarkup(
      React.createElement(IssueMetadataForm, {
        year: 2026,
        month: 11,
        headline: '11월 강남 빌딩 시장',
        onChangeHeadline: () => {},
      }),
    );
    expect(titleHtml).toContain('data-testid="clear-headline-btn"');
    expect(titleHtml).toContain('aria-label="입력 지우기"');
    expect(titleHtml).toContain('min-h-[44px] min-w-[44px]');

    const quickHtml = renderToStaticMarkup(
      React.createElement(MagazineQuickDraftCard, {
        monthLabel: '2026년 11월호',
        regionFocus: '강남·서초',
        onChangeRegionFocus: () => {},
        currentDraft: { headline: '', summary: '', briefingTitle: '', briefingBody: '' },
        onApplyDraft: () => {},
      }),
    );
    expect(quickHtml).toContain('🤖 AI 초안 참고 지역·주제 (선택 · 비워두면 기본 권역 사용)');
    expect(quickHtml).toContain('data-testid="clear-region-focus-btn"');

    const contentHtml = renderToStaticMarkup(
      React.createElement(NewsletterContentStepPanel, {
        cadence: 'monthly',
        yearMonthLabel: '2026년 11월호',
        regionFocus: '',
        headline: '제목',
        sections: [{ id: 'field_note', enabled: true }],
        isSectionEnabled: () => true,
        onToggleSection: () => {},
        monthlyRegion: 'gbd',
        monthlyPairId: 'molit_bok',
        monthlyCharts: buildDefaultMonthlyGraphicPair('gbd'),
        monthlyLiveDbAvailable: false,
        onChangeMonthlyRegion: () => {},
        onChangeMonthlyPair: () => {},
        onUpdateMonthlyChartField: () => {},
        onResetMonthlyCharts: () => {},
        briefingBody: '이번 달 브리핑 본문입니다.',
        onChangeBriefingBody: () => {},
        unitIssues: [],
        onChangeUnitIssues: () => {},
        newsPool: [],
        preferredRegions: ['강남·서초'],
        preferredChannels: ['real_estate'],
        deals: [],
        selectedDeals: [],
        selectedDealIds: [],
        onToggleDeal: () => {},
        dealComments: {},
        onChangeDealComment: () => {},
        isAiClustering: false,
        onAiClusterIssues: () => {},
        onRefreshLiveChannel: async () => {},
        canUndoRecluster: false,
        onUndoRecluster: () => {},
        onOpenPreferences: () => {},
        onNotifyEditorFocus: () => {},
        onBackToTitle: () => {},
        onNextToSend: () => {},
      }),
    );
    expect(contentHtml).toContain('data-testid="clear-briefing-btn"');
    expect(contentHtml).toContain('aria-label="입력 지우기"');
  });

  it('E-02 & E-03: ?step=history 해석 및 NewsletterSendStepPanel 3단 번호 구조·발송 방식 선택기를 렌더링한다', () => {
    expect(resolveMagazineQueryAction({ get: (k) => (k === 'step' ? 'history' : null) })).toEqual({
      dealIds: [],
      step: 'history',
    });

    const sendHtml = renderToStaticMarkup(
      React.createElement(NewsletterSendStepPanel, {
        headline: '11월 빌딩 브리핑',
        briefingBody: '강남 역세권 수요 견조',
        selectedDealCount: 1,
        enabledNewsCount: 2,
        briefingEnabled: true,
        dealsEnabled: true,
        newsEnabled: true,
        targetSegment: 'all',
        onChangeTargetSegment: () => {},
        subscriberCount: 3,
        highInterestCount: 1,
        sending: false,
        quietHoursNow: false,
        onJumpToStep: () => {},
        onNotifyEditorFocus: () => {},
        onBulkSubscribersImported: () => {},
        onKakaoShare: () => {},
        onCopyLink: () => {},
        onBackToContent: () => {},
        onSendSelected: () => {},
      }),
    );
    expect(sendHtml).toContain('① 누구에게 보낼까요?');
    expect(sendHtml).toContain('② 어떻게 보낼까요?');
    expect(sendHtml).toContain('③ 발송 실행');
    expect(sendHtml).toContain('지금 바로 발송');
    expect(sendHtml).toContain('오전 08:30 예약 발송');
    expect(sendHtml).toContain('웹 링크만 먼저 발행·복사');
    expect(sendHtml).toContain('④ 발송·수신확인 내역 보기');
  });

  it('E-05: MagazineView 추천 매물 <li> 가 w-full shrink-0 snap-start 로 뉴스·브로커 카드와 좌우 폭이 일치한다', () => {
    const html = renderToStaticMarkup(
      React.createElement(MagazineView, {
        brokerId: 'hong-cre',
        brokerSlug: 'hong-cre',
        date: '2026-11-24',
        dateLabel: '2026년 11월호 · 2026.11.24 발행',
        data: {
          broker: { name: '홍길동', company: '신한중개', phone: '010-1234-5678' },
          headline: '11월 강남 빌딩 브리핑',
          briefing: '브리핑 본문',
          featured_deals: [
            {
              id: '33333333-3333-4333-8333-333333333333',
              areaSignal: '강남구 역삼동',
              assetType: '근린생활시설',
              areaLabel: '연면적 300평',
              priceBand: '100~110억',
              investmentPoint: '역세권 코너 빌딩',
            },
          ],
        },
      }),
    );
    expect(html).toContain('w-full shrink-0 snap-start');
    expect(html).not.toContain('w-[300px] sm:w-[320px]');
  });
});

describe('Track 2 회귀 검증 (P0-1, P0-2, P1-5, P1-9)', () => {
  it('P0-1: analytics GET은 sent_at 미존재 컬럼·교차호수 open 폴백·dry_run·더블 .or() 덮어쓰기를 제거하고 queued/historical 수신자 이름을 정확히 반환한다', async () => {
    const BROKER_ID = '11111111-1111-4111-8111-111111111111';
    const ED_A = '22222222-2222-4222-8222-222222222221';
    const ED_B = '22222222-2222-4222-8222-222222222222';
    const SUB_ACTIVE = '33333333-3333-4333-8333-333333333331';
    const SUB_PENDING_CONFIRM = '33333333-3333-4333-8333-333333333332';
    const SUB_PENDING_CONSENT = '33333333-3333-4333-8333-333333333333';
    const SUB_HIST_UNSUB = '33333333-3333-4333-8333-333333333334';

    const subscribers = [
      {
        id: SUB_ACTIVE,
        broker_id: BROKER_ID,
        status: 'active',
        unsubscribed_at: null,
        confirm_status: 'confirmed',
        consent_status: 'confirmed',
        subscriber_name: '박현직',
        subscriber_email: 'active@cre.kr',
        subscriber_phone: null,
        segment: 'investor',
        channel: 'email',
        interest_profile: {},
        subscribed_at: '2026-10-01T00:00:00Z',
      },
      {
        id: SUB_PENDING_CONFIRM,
        broker_id: BROKER_ID,
        status: 'active',
        unsubscribed_at: null,
        confirm_status: 'pending',
        consent_status: 'confirmed',
        subscriber_name: '미확인A',
        subscriber_email: 'p1@cre.kr',
        subscriber_phone: null,
        segment: 'investor',
        channel: 'email',
        interest_profile: {},
        subscribed_at: '2026-10-02T00:00:00Z',
      },
      {
        id: SUB_PENDING_CONSENT,
        broker_id: BROKER_ID,
        status: 'active',
        unsubscribed_at: null,
        confirm_status: 'confirmed',
        consent_status: 'pending',
        subscriber_name: '미동의B',
        subscriber_email: 'p2@cre.kr',
        subscriber_phone: null,
        segment: 'investor',
        channel: 'email',
        interest_profile: {},
        subscribed_at: '2026-10-03T00:00:00Z',
      },
      {
        id: SUB_HIST_UNSUB,
        broker_id: BROKER_ID,
        status: 'unsubscribed',
        unsubscribed_at: '2026-11-20T00:00:00Z',
        confirm_status: 'confirmed',
        consent_status: 'confirmed',
        subscriber_name: '김과거',
        subscriber_email: 'hist@cre.kr',
        subscriber_phone: null,
        segment: 'investor',
        channel: 'email',
        interest_profile: {},
        subscribed_at: '2026-09-01T00:00:00Z',
      },
    ];

    const editions = [
      {
        id: ED_B,
        broker_id: BROKER_ID,
        edition_type: 'monthly',
        edition_label: '2026년 11월호',
        title: '11월호',
        status: 'published',
        market_temp: 60,
        view_count: 1,
        share_count: 0,
        published_at: '2026-11-24T00:00:00Z',
        created_at: '2026-11-24T00:00:00Z',
        content: {},
      },
      {
        id: ED_A,
        broker_id: BROKER_ID,
        edition_type: 'monthly',
        edition_label: '2026년 10월호',
        title: '10월호',
        status: 'published',
        market_temp: 55,
        view_count: 2,
        share_count: 0,
        published_at: '2026-10-24T00:00:00Z',
        created_at: '2026-10-24T00:00:00Z',
        content: {},
      },
    ];

    const dispatchLogs = [
      { id: 'd-dry', broker_id: BROKER_ID, edition_id: ED_B, subscriber_id: SUB_ACTIVE, channel: 'email', status: 'dry_run', created_at: '2026-11-24T06:00:00Z' },
      { id: 'd-hist', broker_id: BROKER_ID, edition_id: ED_A, subscriber_id: SUB_HIST_UNSUB, channel: 'email', status: 'sent', created_at: '2026-11-24T05:00:00Z' },
      { id: 'd-failed', broker_id: BROKER_ID, edition_id: ED_B, subscriber_id: SUB_ACTIVE, channel: 'email', status: 'bounced', created_at: '2026-11-24T04:00:00Z' },
      { id: 'd-queued', broker_id: BROKER_ID, edition_id: ED_B, subscriber_id: SUB_ACTIVE, channel: 'email', status: 'pending_worker', created_at: '2026-11-24T03:00:00Z' },
      { id: 'd-unopened-b', broker_id: BROKER_ID, edition_id: ED_B, subscriber_id: SUB_ACTIVE, channel: 'email', status: 'delivered', created_at: '2026-11-24T02:00:00Z' },
      { id: 'd-opened-a', broker_id: BROKER_ID, edition_id: ED_A, subscriber_id: SUB_ACTIVE, channel: 'email', status: 'sent', created_at: '2026-11-24T01:00:00Z' },
    ];

    const activityEvents = [
      {
        actor_id: BROKER_ID,
        event_type: 'magazine_view',
        created_at: '2026-11-24T01:30:00Z',
        metadata: { source: 'sid_link', subscriber_id: SUB_ACTIVE, edition_id: ED_A, issue_date: '2026-10-24' },
      },
    ];

    const dispatchSelectCalls: string[] = [];
    const subscriberOrCalls: number[] = [];
    const tables: Record<string, Array<Record<string, unknown>>> = {
      magazine_subscribers: subscribers,
      magazine_editions: editions,
      magazine_dispatch_logs: dispatchLogs,
      activity_events: activityEvents,
      magazine_analytics_events: [],
      magazine_poll_responses: [],
    };

    const makeQuery = (table: string) => {
      const filters: Array<(r: Record<string, unknown>) => boolean> = [];
      let orCount = 0;
      let isCount = false;
      let single = false;
      let limitVal: number | null = null;
      const run = () => {
        if (table === 'magazine_subscribers') subscriberOrCalls.push(orCount);
        let rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
        const count = rows.length;
        if (limitVal !== null) rows = rows.slice(0, limitVal);
        if (single) return { data: rows[0] ?? null, error: null };
        return { data: rows, count: isCount ? count : undefined, error: null };
      };
      const q: Record<string, unknown> = {
        select(cols: string, opts?: { count?: string }) {
          if (table === 'magazine_dispatch_logs') dispatchSelectCalls.push(cols);
          if (opts?.count === 'exact') isCount = true;
          return q;
        },
        eq(col: string, val: unknown) { filters.push((r) => r[col] === val); return q; },
        neq(col: string, val: unknown) { filters.push((r) => r[col] !== val); return q; },
        not(col: string, op: string, val: unknown) {
          if (op === 'eq') filters.push((r) => r[col] !== val);
          return q;
        },
        is(col: string, val: unknown) { filters.push((r) => (r[col] ?? null) === val); return q; },
        in(col: string, vals: unknown[]) { filters.push((r) => vals.includes(r[col])); return q; },
        or() { orCount += 1; return q; },
        like() { return q; },
        gte() { return q; },
        order() { return q; },
        limit(n: number) { limitVal = n; return q; },
        maybeSingle() { single = true; return Promise.resolve(run()); },
        then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
          return Promise.resolve(run()).then(resolve, reject);
        },
      };
      return q;
    };

    vi.resetModules();
    vi.doMock('@/lib/supabase/service', () => ({
      createServiceClient: () => ({ from: makeQuery }),
    }));
    vi.doMock('@/lib/magazine/authz', () => ({
      requireBrokerContext: async () => ({
        ctx: { userId: BROKER_ID, email: 'b@cre.kr', slug: 'hong-cre', displayName: '홍길동', brokerKeys: [BROKER_ID] },
        error: null,
      }),
      assertOwnsRow: () => true,
      notFoundResponse: () => new Response(null, { status: 404 }),
      jsonError: (code: string, message: string, status: number) =>
        Response.json({ ok: false, error: { code, message } }, { status }),
    }));

    try {
      const { GET } = await import('@/app/api/broker/magazine/analytics/route');
      const res = await GET(new NextRequest('http://localhost/api/broker/magazine/analytics?tier=warm'));
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        subscriberCount: number;
        deliveryReceipts: Array<{ id: string; recipientLabel: string; sentAt: string | null; openedAt: string | null; status: string }>;
      };

      expect(body.subscriberCount).toBe(1);
      expect(Math.max(...subscriberOrCalls)).toBe(0);
      expect(dispatchSelectCalls[0]).not.toContain('sent_at');
      expect(dispatchSelectCalls[0]).toContain('created_at');

      const byId = new Map(body.deliveryReceipts.map((r) => [r.id, r]));
      expect(byId.has('d-dry')).toBe(false);
      expect(byId.get('d-opened-a')?.status).toBe('opened');
      expect(byId.get('d-opened-a')?.openedAt).toBe('2026-11-24T01:30:00Z');
      expect(byId.get('d-unopened-b')?.status).toBe('sent');
      expect(byId.get('d-unopened-b')?.openedAt).toBeNull();
      expect(byId.get('d-queued')?.status).toBe('queued');
      expect(byId.get('d-queued')?.sentAt).toBe('2026-11-24T03:00:00Z');
      expect(byId.get('d-failed')?.status).toBe('failed');
      expect(byId.get('d-hist')?.recipientLabel).toBe('김과거 (hist@cre.kr)');
    } finally {
      vi.doUnmock('@/lib/supabase/service');
      vi.doUnmock('@/lib/magazine/authz');
      vi.resetModules();
    }

    const editorSrc = readSrc('app/(broker)/broker/magazine-editor/page.tsx');
    expect(editorSrc).toContain('⏳ 발송 대기');
  });

  it('P0-2: 야간 schedule_0830 가 즉시발송으로 폴스루하지 않고 NewsletterPrimaryActionButton 이 sendMode 별로 분기·라벨링한다', () => {
    const sendPanelSrc = readSrc('app/(broker)/broker/magazine-editor/_components/NewsletterSendStepPanel.tsx');
    expect(sendPanelSrc).toContain('if (sendMode === "schedule_0830" && onPublishWebOnly)');
    expect(sendPanelSrc).not.toContain('sendMode === "schedule_0830" && !isQuietHours');

    const quietHtml = renderToStaticMarkup(
      React.createElement(NewsletterSendStepPanel, {
        headline: '야간 테스트 브리핑',
        briefingBody: '내용',
        selectedDealCount: 1,
        enabledNewsCount: 1,
        briefingEnabled: true,
        dealsEnabled: true,
        newsEnabled: true,
        targetSegment: 'all',
        onChangeTargetSegment: () => {},
        sendMode: 'schedule_0830',
        onChangeSendMode: () => {},
        subscriberCount: 3,
        highInterestCount: 1,
        sending: false,
        quietHoursNow: true,
        onJumpToStep: () => {},
        onNotifyEditorFocus: () => {},
        onBulkSubscribersImported: () => {},
        onKakaoShare: () => {},
        onCopyLink: () => {},
        onBackToContent: () => {},
        onSendSelected: () => {},
      }),
    );
    expect(quietHtml).toContain('야간 발송 제한 시간대입니다 (21:00 ~ 08:00 KST)');
    expect(quietHtml).toContain('오전 08:30 예약 발송 선택됨');

    const onWebOnly = vi.fn();
    const onSend = vi.fn();
    const webBtnEl = NewsletterPrimaryActionButton({
      isPublished: false,
      previewLifecycle: 'live_draft',
      activeStep: 'content',
      sending: false,
      saveState: 'saved',
      sendMode: 'web_only',
      onDraftSaveClick: () => {},
      onSelectSendStep: () => {},
      onSendSelected: onSend,
      onPublishWebOnly: onWebOnly,
    }) as React.ReactElement<{ onClick?: () => void }>;
    webBtnEl.props.onClick?.();
    expect(onWebOnly).toHaveBeenCalledWith();
    expect(onSend).not.toHaveBeenCalled();

    const schedBtnEl = NewsletterPrimaryActionButton({
      isPublished: false,
      previewLifecycle: 'live_draft',
      activeStep: 'send',
      sending: false,
      saveState: 'saved',
      sendMode: 'schedule_0830',
      onDraftSaveClick: () => {},
      onSelectSendStep: () => {},
      onSendSelected: onSend,
      onPublishWebOnly: onWebOnly,
    }) as React.ReactElement<{ onClick?: () => void }>;
    schedBtnEl.props.onClick?.();
    expect(onWebOnly).toHaveBeenCalledWith({ scheduleMorning: true });

    const webLabelHtml = renderToStaticMarkup(webBtnEl);
    const schedLabelHtml = renderToStaticMarkup(schedBtnEl);
    expect(webLabelHtml).toContain('🔗 웹 링크만 먼저 발행·복사');
    expect(schedLabelHtml).toContain('⏰ 오전 08:30 예약 발송 준비');
  });

  it('P1-5: magazine-editor/page.tsx 가 ?step= · regionFocus 영속화 및 Step 4 상단 버튼 중복 억제를 적용한다', () => {
    const editorSrc = readSrc('app/(broker)/broker/magazine-editor/page.tsx');
    expect(editorSrc).toContain('syncUrlParams(saved.savedEditionId ?? editionId, cadence, { nextStep: "send" })');
    expect(editorSrc).toContain('patchEditionRegionFocusRequest');
    expect(editorSrc).toContain('syncServerRegionFocusMap');
    expect(editorSrc).toContain('{activeStep !== "history" && (');
  });

  it('P1-9: hydrateMonthlyChartsFromDbRows JS 폴백도 N >= 3 미만 월의 평당가 중앙값을 표본 부족으로 억제한다', () => {
    const charts = hydrateMonthlyChartsFromDbRows({
      regionKey: 'gbd',
      pair: ['molit_tx_price_trend', 'bok_loan_rate_cap_spread'],
      transactions: [
        { transaction_date: '2026-09-05', transaction_price: 5_000_000_000, building_area: 100 / 0.3025, land_area: 50 / 0.3025, building_type: '업무시설' },
        { transaction_date: '2026-09-12', transaction_price: 6_000_000_000, building_area: 100 / 0.3025, land_area: 50 / 0.3025, building_type: '업무시설' },
        { transaction_date: '2026-10-03', transaction_price: 4_000_000_000, building_area: 100 / 0.3025, land_area: 50 / 0.3025, building_type: '업무시설' },
        { transaction_date: '2026-10-10', transaction_price: 5_000_000_000, building_area: 100 / 0.3025, land_area: 50 / 0.3025, building_type: '업무시설' },
        { transaction_date: '2026-10-18', transaction_price: 6_000_000_000, building_area: 100 / 0.3025, land_area: 50 / 0.3025, building_type: '업무시설' },
      ],
    });
    const txChart = charts.find((c) => c.chartType === 'molit_tx_price_trend');
    expect(txChart).toBeDefined();
    expect(txChart!.series[0].primaryValue).toBe(2);
    expect(txChart!.series[0].secondaryValue).toBeUndefined();
    expect(txChart!.series[0].displaySecondary).toBe('표본 부족');
    expect(txChart!.series[1].primaryValue).toBe(3);
    expect(txChart!.series[1].secondaryValue).toBe(5000);
    expect(txChart!.series[1].displaySecondary).toBe('5,000만');
  });
});
