/**
 * 에디터 발행설정 UI·저장 상태 배지 정적 렌더 테스트 (jsdom 없이 renderToStaticMarkup)
 *  - 저장 상태 문구("저장됨 · HH:MM", 실패 시 재시도), 세그먼트/세무/설문/섹션 on-off UI
 */
import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SaveStatusBadge, describeSaveStatus, formatSavedTime } from '@/components/magazine-editor/SaveStatusBadge';
import { EditorPublishTab } from '@/components/magazine-editor/EditorPublishTab';
import { DEFAULT_SECTION_ORDER } from '@/lib/magazine/edition-save';

const noop = () => {};

function publishTab(over: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    React.createElement(EditorPublishTab, {
      editionLabel: 'W41-2026',
      editionTypeLabel: '위클리',
      statusBadge: React.createElement('span', null, '초안'),
      brokerSlug: 'kim',
      isPublished: false,
      issueDate: '2026-10-05',
      themeColor: '#6366f1',
      setThemeColor: noop,
      magazineTitle: '',
      setMagazineTitle: noop,
      targetSegment: 'all',
      setTargetSegment: noop,
      pollQuestion: '',
      setPollQuestion: noop,
      pollOptions: [{ label: '' }, { label: '' }, { label: '' }],
      setPollOptions: noop,
      taxQuestion: '',
      setTaxQuestion: noop,
      taxAnswer: '',
      setTaxAnswer: noop,
      taxSource: '',
      setTaxSource: noop,
      sectionOrder: [...DEFAULT_SECTION_ORDER],
      setSectionOrder: noop,
      sectionsEnabled: {},
      setSectionsEnabled: noop,
      ...over,
    } as never),
  );
}

describe('describeSaveStatus / SaveStatusBadge', () => {
  it('저장됨은 시각을 보여준다 ("저장됨 · 12:03")', () => {
    const d = new Date(2026, 9, 5, 12, 3, 0);
    expect(formatSavedTime(d)).toBe('12:03');
    expect(describeSaveStatus('saved', d)).toEqual({ label: '저장됨 · 12:03', tone: 'ok' });
  });

  it('실패는 빨간 배지 + 재시도 버튼 + 사유', () => {
    const html = renderToStaticMarkup(
      React.createElement(SaveStatusBadge, { status: 'error', lastSavedAt: null, errorMessage: '네트워크 연결을 확인해 주세요.', onRetry: noop }),
    );
    expect(html).toContain('저장 실패');
    expect(html).toContain('bg-red-50');
    expect(html).toContain('다시 시도');
    expect(html).toContain('네트워크 연결을 확인해 주세요.');
  });

  it('충돌은 새로고침/덮어쓰기 선택지를 보여준다', () => {
    const html = renderToStaticMarkup(
      React.createElement(SaveStatusBadge, { status: 'conflict', lastSavedAt: null, errorMessage: '충돌', onOverwrite: noop, onReload: noop }),
    );
    expect(html).toContain('다른 곳에서 수정됨');
    expect(html).toContain('내 변경으로 덮어쓰기');
    expect(html).toContain('새로고침');
  });

  it('정상 상태에는 재시도 버튼이 없다', () => {
    const html = renderToStaticMarkup(React.createElement(SaveStatusBadge, { status: 'saving', lastSavedAt: null, onRetry: noop }));
    expect(html).toContain('저장 중');
    expect(html).not.toContain('다시 시도');
  });
});

describe('EditorPublishTab', () => {
  it('저장/발행 버튼은 이 탭에 없다 (하단 단일 세트만 사용)', () => {
    const html = publishTab();
    expect(html).not.toContain('임시저장');
    expect(html).not.toContain('발행 및 공유');
    expect(html).not.toMatch(/<button[^>]*>[^<]*발행하기/);
  });

  it('발송 대상은 전체/매수/매도 3개이며 선택값이 aria-checked 로 표시된다', () => {
    const html = publishTab({ targetSegment: 'seller' });
    expect(html).toContain('전체 구독자');
    expect(html).toContain('매수 관심');
    expect(html).toContain('매도 관심');
    expect(html).toMatch(/aria-checked="true"[^>]*>매도 관심/);
  });

  it('설문 질문이 있으면 선택지와 "판매자 의도" 체크박스가 나타난다 (없으면 숨김)', () => {
    expect(publishTab()).not.toContain('판매자 의도');
    const html = publishTab({ pollQuestion: '적정가입니까?', pollOptions: [{ label: 'a', intent: 'seller' }, { label: 'b' }] });
    expect(html).toContain('판매자 의도');
    expect(html).toContain('선택지 1');
    expect(html).toContain('+ 선택지 추가');
    // 2개일 때는 삭제 불가(최소 2개)
    expect(html).not.toContain('선택지 1 삭제');
  });

  it('선택지가 3개 이상이면 삭제 버튼이 보이고, 4개면 추가 버튼이 사라진다', () => {
    const three = publishTab({ pollQuestion: 'q', pollOptions: [{ label: 'a' }, { label: 'b' }, { label: 'c' }] });
    expect(three).toContain('선택지 3 삭제');
    const four = publishTab({ pollQuestion: 'q', pollOptions: [{ label: 'a' }, { label: 'b' }, { label: 'c' }, { label: 'd' }] });
    expect(four).not.toContain('+ 선택지 추가');
  });

  it('섹션마다 on/off 체크박스가 있고 꺼진 섹션은 취소선으로 보인다', () => {
    const html = publishTab({ sectionsEnabled: { tax_clinic: false } });
    const checkboxes = html.match(/type="checkbox"/g) ?? [];
    expect(checkboxes.length).toBeGreaterThanOrEqual(DEFAULT_SECTION_ORDER.length);
    expect(html).toContain('line-through');
    expect(html).toContain('세무 클리닉');
  });

  it('세무 질문이 비어 있으면 답변/출처 입력이 숨겨진다', () => {
    expect(publishTab()).not.toContain('editor-tax-answer');
    expect(publishTab({ taxQuestion: '질문' })).toContain('editor-tax-answer');
  });

  it('원페이지 이미지는 발행 전에는 비활성', () => {
    const before = publishTab();
    expect(before).toMatch(/disabled=""[^>]*>⬇️ 이미지 다운로드/);
    const after = publishTab({ isPublished: true });
    expect(after).not.toMatch(/disabled=""[^>]*>⬇️ 이미지 다운로드/);
    expect(after).toContain('정정 발행');
  });

  it('slug 는 읽기 전용이다', () => {
    expect(publishTab()).toMatch(/id="editor-slug"[^>]*readOnly=""/);
  });
});
