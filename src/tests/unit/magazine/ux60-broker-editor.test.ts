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
import { PublishConfirmModal } from '@/components/magazine-editor/PublishConfirmModal';
import { SaveStatusBadge } from '@/components/magazine-editor/SaveStatusBadge';
import { SlugSetupGate } from '@/components/magazine-editor/SlugSetupGate';
import { MagazineInsightCard } from '@/components/dashboard/MagazineInsightCard';
import { ToastProvider } from '@/components/ui/toast-provider';

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

describe('U-F1-03 & U-F1-04 (B-08, B-14, B-16, B-17, B-20): 에디터 헤더·모바일 탭·미리보기 링크', () => {
  const pageSrc = readSrc('app/(broker)/broker/magazine-editor/page.tsx');

  it('Content Studio h1을 유지하면서 한글 부제 [매거진 만들기]를 함께 표시한다', () => {
    expect(pageSrc).toContain('aria-label="Content Studio"');
    expect(pageSrc).toContain('고객 소식지 편집실');
    expect(pageSrc).toContain('매거진 만들기');
  });

  it('모바일(390px)에서도 8개 탭 한글 라벨이 숨겨지지 않고(hidden sm:inline 제거) 가로 스크롤된다', () => {
    expect(pageSrc).not.toContain('hidden sm:inline');
    expect(pageSrc).toContain('overflow-x-auto scrollbar-hide');
    expect(pageSrc).toContain('📱 독자 화면 미리보기');
  });

  it('미발행 초안일 때 "📱 실제 화면으로 보기" 링크와 모바일용 "📱 독자 화면 미리보기" 토글을 제공한다', () => {
    expect(pageSrc).toContain('📱 실제 화면으로 보기');
    expect(pageSrc).toContain('미발행 안내가 표시되며, 편집 화면은 우측 미리보기에서 확인');
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
