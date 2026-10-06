/**
 * Wave 3 (U-02/U-04/U-05) 순수 로직 테스트
 *  - preview-bridge: postMessage 프로토콜 · same-origin 검증
 *  - use-async-state reducer: idle|loading|error|empty|ready
 *  - editor-toast: 단일 슬롯 + 중복 억제
 *  - editor-progress: 탭 ✓ 완료
 *  - editor-labels: 시장 온도 아이콘 ↔ 구독자 온도 이모지 분리, 뉴스 topic 한글
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PREVIEW_MSG_ACK,
  PREVIEW_MSG_DRAFT,
  PREVIEW_MSG_READY,
  buildAckMessage,
  buildDraftMessage,
  buildPreviewSrc,
  buildReadyMessage,
  isAllowedOrigin,
  isPreviewQuery,
  parsePreviewMessage,
  shouldApplyDraft,
  toTransferableContent,
} from '@/lib/magazine/preview-bridge';
import { asyncReducer, defaultIsEmpty, initialAsyncState, toErrorMessage } from '@/lib/magazine/use-async-state';
import { EDITOR_TOAST_SLOT, createEditorToaster, type ToastKind } from '@/lib/magazine/editor-toast';
import { computeTabCompletion, summarizeCompletion } from '@/lib/magazine/editor-progress';
import { EDITOR_MARKET_TEMP_ICON, marketTempIcon, topicLabel, BUYER_TEMP_EMOJIS, cleanNewsText, formatNewsSummary } from '@/lib/magazine/editor-labels';
import { EMPTY_FIELD_NOTE, type EditorForm } from '@/lib/magazine/edition-save';
import { MAGAZINE_SEND_DAY_LABEL } from '@/lib/magazine/schedule-labels';

describe('preview-bridge (U-02)', () => {
  it('buildPreviewSrc 는 preview=1&edition 쿼리를 만든다', () => {
    expect(buildPreviewSrc('kim', '2026-10-06', 'ed-1')).toBe('/magazine/kim/2026-10-06?preview=1&edition=ed-1');
    expect(buildPreviewSrc('kim', '2026-10-06')).toBe('/magazine/kim/2026-10-06?preview=1');
  });

  it('isPreviewQuery 는 preview/edition 을 읽는다', () => {
    expect(isPreviewQuery('?preview=1&edition=e9')).toEqual({ preview: true, editionId: 'e9' });
    expect(isPreviewQuery('preview=0')).toEqual({ preview: false, editionId: null });
    expect(isPreviewQuery('')).toEqual({ preview: false, editionId: null });
  });

  it('same-origin 만 허용한다', () => {
    expect(isAllowedOrigin('https://www.credeal.net', 'https://www.credeal.net')).toBe(true);
    expect(isAllowedOrigin('https://evil.example', 'https://www.credeal.net')).toBe(false);
    expect(isAllowedOrigin('http://www.credeal.net', 'https://www.credeal.net')).toBe(false);
    expect(isAllowedOrigin('null', 'null')).toBe(false);
    expect(isAllowedOrigin('', 'https://www.credeal.net')).toBe(false);
  });

  it('draft/ready/ack 메시지를 왕복 파싱한다', () => {
    const draft = buildDraftMessage('e1', { headline: 'H' }, 3);
    expect(parsePreviewMessage(JSON.parse(JSON.stringify(draft)))).toEqual({
      type: PREVIEW_MSG_DRAFT,
      editionId: 'e1',
      content: { headline: 'H' },
      seq: 3,
    });
    expect(parsePreviewMessage(buildReadyMessage('e1'))).toEqual({ type: PREVIEW_MSG_READY, editionId: 'e1' });
    expect(parsePreviewMessage(buildAckMessage('e1', 4))).toEqual({ type: PREVIEW_MSG_ACK, editionId: 'e1', seq: 4 });
  });

  it('형식이 틀린 메시지는 null', () => {
    expect(parsePreviewMessage(null)).toBeNull();
    expect(parsePreviewMessage('x')).toBeNull();
    expect(parsePreviewMessage({ type: 'cre-preview:draft', content: {} })).toBeNull(); // editionId 없음
    expect(parsePreviewMessage({ type: 'cre-preview:draft', editionId: 'e', content: [] })).toBeNull();
    expect(parsePreviewMessage({ type: 'other', editionId: 'e' })).toBeNull();
  });

  it('오래된 seq 의 draft 는 적용하지 않는다', () => {
    const msg = buildDraftMessage('e', {}, 2);
    expect(shouldApplyDraft(1, msg)).toBe(true);
    expect(shouldApplyDraft(2, msg)).toBe(false);
    expect(shouldApplyDraft(5, msg)).toBe(false);
  });

  it('toTransferableContent 는 함수/undefined 를 제거하고 순환 참조는 빈 객체', () => {
    expect(toTransferableContent({ a: 1, f: () => 1, u: undefined })).toEqual({ a: 1 });
    const cyc: Record<string, unknown> = {};
    cyc.self = cyc;
    expect(toTransferableContent(cyc)).toEqual({});
    expect(toTransferableContent(null)).toEqual({});
  });
});

describe('asyncReducer (U-04)', () => {
  it('idle → loading → ready', () => {
    let s = initialAsyncState<number[]>();
    expect(s.status).toBe('idle');
    s = asyncReducer(s, { type: 'start' });
    expect(s.status).toBe('loading');
    s = asyncReducer(s, { type: 'success', data: [1], isEmpty: false });
    expect(s).toEqual({ status: 'ready', data: [1], error: null });
  });

  it('빈 응답은 empty (오류와 구분)', () => {
    const s = asyncReducer(initialAsyncState<number[]>(), { type: 'success', data: [], isEmpty: true });
    expect(s.status).toBe('empty');
    expect(s.error).toBeNull();
  });

  it('실패는 error + 메시지, 재시도(start)하면 loading 으로 돌아가며 이전 data 는 유지', () => {
    let s = asyncReducer(initialAsyncState<number[]>(), { type: 'success', data: [7], isEmpty: false });
    s = asyncReducer(s, { type: 'failure', error: '실패' });
    expect(s.status).toBe('error');
    expect(s.error).toBe('실패');
    expect(s.data).toEqual([7]);
    s = asyncReducer(s, { type: 'start' });
    expect(s.status).toBe('loading');
    expect(s.error).toBeNull();
    expect(s.data).toEqual([7]);
    expect(asyncReducer(s, { type: 'reset' })).toEqual(initialAsyncState());
  });

  it('defaultIsEmpty / toErrorMessage', () => {
    expect(defaultIsEmpty(null)).toBe(true);
    expect(defaultIsEmpty([])).toBe(true);
    expect(defaultIsEmpty([1])).toBe(false);
    expect(defaultIsEmpty({})).toBe(false);
    expect(toErrorMessage(new Error('boom'))).toBe('boom');
    expect(toErrorMessage('str')).toBe('str');
    expect(toErrorMessage(42)).toMatch(/다시 시도/);
  });
});

describe('editor toaster (T2-34)', () => {
  function makeSink() {
    const calls: Array<{ kind: ToastKind; message: string; id: string }> = [];
    return {
      calls,
      sink: {
        show(kind: ToastKind, message: string, options: { id: string }) {
          calls.push({ kind, message, id: options.id });
        },
      },
    };
  }

  it('모든 토스트가 같은 슬롯 id 를 써서 겹쳐 쌓이지 않는다', () => {
    const { calls, sink } = makeSink();
    let t = 0;
    const toaster = createEditorToaster(sink, () => t);
    toaster.info('a');
    t += 10;
    toaster.success('b');
    t += 10;
    toaster.error('c');
    expect(calls.map((c) => c.id)).toEqual([EDITOR_TOAST_SLOT, EDITOR_TOAST_SLOT, EDITOR_TOAST_SLOT]);
  });

  it('같은 종류·문구가 짧은 시간 안에 반복되면 무시, 시간이 지나면 다시 표시', () => {
    const { calls, sink } = makeSink();
    let t = 0;
    const toaster = createEditorToaster(sink, () => t, 1000);
    toaster.success('저장되었습니다');
    t = 500;
    toaster.success('저장되었습니다');
    expect(calls).toHaveLength(1);
    t = 1600;
    toaster.success('저장되었습니다');
    expect(calls).toHaveLength(2);
  });

  it('종류가 다르거나 loading 은 중복 억제 대상이 아니다', () => {
    const { calls, sink } = makeSink();
    const toaster = createEditorToaster(sink, () => 0, 1000);
    toaster.success('x');
    toaster.error('x');
    toaster.loading('y');
    toaster.loading('y');
    expect(calls.map((c) => c.kind)).toEqual(['success', 'error', 'loading', 'loading']);
  });
});

function makeForm(over: Partial<EditorForm> = {}): EditorForm {
  return {
    headline: '',
    briefing: '',
    marketTemp: null,
    coverKeywords: ['', '', ''],
    coverImageUrl: null,
    fieldNote: { ...EMPTY_FIELD_NOTE },
    themeTitle: '',
    themeBodyMd: '',
    themeColor: '#6366f1',
    selectedDealIds: [],
    selectedNewsIds: [],
    topNews: [],
    dealHighlights: [],
    pollQuestion: '',
    pollOptions: [{ label: '' }, { label: '' }, { label: '' }],
    taxQuestion: '',
    taxAnswer: '',
    taxSource: '',
    sectionOrder: [],
    sectionsEnabled: {},
    targetSegment: 'all',
    ...over,
  } as EditorForm;
}

describe('computeTabCompletion (T1-UX-2)', () => {
  it('빈 폼은 작성 탭이 모두 todo, 작성 개념 없는 탭은 null', () => {
    const c = computeTabCompletion(makeForm());
    expect(c.cover).toBe('todo');
    expect(c.field_note).toBe('todo');
    expect(c.theme_deals).toBe('todo');
    expect(c.news).toBe('todo');
    expect(c.publish).toBe('todo');
    expect(c.ai_assist).toBeNull();
    expect(c.outreach).toBeNull();
    expect(c.analytics).toBeNull();
    expect(summarizeCompletion(c)).toEqual({ done: 0, total: 5 });
  });

  it('커버는 헤드라인 + 브리핑이 모두 있어야 done', () => {
    expect(computeTabCompletion(makeForm({ headline: 'H' })).cover).toBe('todo');
    expect(computeTabCompletion(makeForm({ headline: 'H', briefing: 'B' })).cover).toBe('done');
    expect(computeTabCompletion(makeForm({ headline: '  ', briefing: 'B' })).cover).toBe('todo');
  });

  it('필드노트/테마·매물/뉴스는 하나라도 채우면 done', () => {
    const c = computeTabCompletion(
      makeForm({
        fieldNote: { ...EMPTY_FIELD_NOTE, comment: '한마디' },
        selectedDealIds: ['d1'],
        selectedNewsIds: ['n1'],
      }),
    );
    expect(c.field_note).toBe('done');
    expect(c.theme_deals).toBe('done');
    expect(c.news).toBe('done');
  });

  it('발행 탭: 설문 질문이 있는데 선택지가 2개 미만이면 todo', () => {
    const base = { headline: 'H' };
    expect(computeTabCompletion(makeForm({ ...base })).publish).toBe('done');
    expect(
      computeTabCompletion(makeForm({ ...base, pollQuestion: 'Q?', pollOptions: [{ label: 'a' }, { label: '' }] })).publish,
    ).toBe('todo');
    expect(
      computeTabCompletion(makeForm({ ...base, pollQuestion: 'Q?', pollOptions: [{ label: 'a' }, { label: 'b' }] })).publish,
    ).toBe('done');
    expect(computeTabCompletion(makeForm(), true).publish).toBe('done');
  });
});

describe('editor labels (U-05)', () => {
  it('시장 온도 5단계는 모두 아이콘이 있고 서로 다르다', () => {
    const keys = ['적극 매수', '선별 매수', '관망', '조정 대기', '위기 경계'];
    const icons = keys.map((k) => marketTempIcon(k));
    expect(new Set(icons).size).toBe(5);
    keys.forEach((k) => expect(EDITOR_MARKET_TEMP_ICON[k]).toBeTruthy());
    expect(marketTempIcon(null)).toBe('⬜');
  });

  it('시장 온도 아이콘은 구독자(매수자) 온도 이모지와 겹치지 않는다', () => {
    const src = readFileSync(join(process.cwd(), 'src/domain/magazine/buyer-temperature.ts'), 'utf8');
    const unionLine = src.split('\n').find((l) => l.includes('export type BuyerTemperature')) ?? '';
    // 소스에서 읽은 구독자 온도 이모지(타입 정의)와 상수 목록이 일치해야 한다 (드리프트 방지)
    for (const e of BUYER_TEMP_EMOJIS) expect(unionLine).toContain(e);
    for (const icon of Object.values(EDITOR_MARKET_TEMP_ICON)) {
      expect(BUYER_TEMP_EMOJIS).not.toContain(icon);
      expect(unionLine).not.toContain(icon);
    }
  });

  it('topicLabel: 영문 키 → 한글, 한글은 그대로, 모르는 키는 기타, 빈 값은 빈 문자열', () => {
    expect(topicLabel('policy')).toBe('정책');
    expect(topicLabel('Interest-Rate')).toBe('금리');
    expect(topicLabel('market')).toBe('시장 동향');
    expect(topicLabel('금리')).toBe('금리');
    expect(topicLabel('some_unknown_key')).toBe('기타');
    expect(topicLabel('')).toBe('');
    expect(topicLabel(undefined)).toBe('');
    expect(/[A-Za-z]/.test(topicLabel('redevelopment'))).toBe(false);
  });

  it('발송 요일 문구는 schedule-labels 단일 출처 (에디터 소스에 요일 하드코딩 없음)', () => {
    expect(MAGAZINE_SEND_DAY_LABEL).toMatch(/요일/);
    const files = [
      'src/app/(broker)/broker/magazine-editor/page.tsx',
      'src/components/magazine-editor/EditorPublishTab.tsx',
      'src/components/magazine-editor/PublishConfirmModal.tsx',
      'src/components/magazine-editor/EditorCoverTab.tsx',
    ];
    for (const f of files) {
      const text = readFileSync(join(process.cwd(), f), 'utf8');
      expect(text, f).not.toMatch(/(월|화|수|목|금)요일/);
    }
  });
});

describe('뉴스 표시 정리 (골든 Part1 결함 ①)', () => {
  it('크롤러 topic 키(rental/market_trend/transaction/finance/regulation/development)는 모두 한글', () => {
    for (const k of ['rental', 'market_trend', 'transaction', 'finance', 'regulation', 'development']) {
      const label = topicLabel(k);
      expect(label, k).not.toBe('기타');
      expect(/[A-Za-z_]/.test(label), k).toBe(false);
    }
    expect(topicLabel('rental')).toBe('임대·공실');
  });

  it('cleanNewsText: &quot; 등 엔티티를 디코딩(이중 인코딩 포함)하고 공백을 정리한다', () => {
    expect(cleanNewsText('[네이버뉴스] &quot;세금 폭탄&quot;…개편')).toBe('[네이버뉴스] "세금 폭탄"…개편');
    expect(cleanNewsText('A &amp;quot;B&amp;quot;  C')).toBe('A "B" C');
    expect(cleanNewsText('x &lt;script&gt;')).toBe('x <script>'); // 텍스트로만 쓰이고 React 가 이스케이프
    expect(cleanNewsText(null)).toBe('');
  });

  it('formatNewsSummary: 파이프/줄바꿈으로 이어진 요약을 항목으로 나누고 엔티티를 디코딩', () => {
    const lines = formatNewsSummary(
      '핵심 팩트: 공실률 9.4%|브로커 임플리케이션: &quot;하방 압력&quot;|추천 액션: 가격 협상',
    );
    expect(lines).toEqual(['핵심 팩트: 공실률 9.4%', '브로커 임플리케이션: "하방 압력"', '추천 액션: 가격 협상']);
    expect(lines.join('')).not.toContain('|');
    expect(formatNewsSummary(undefined)).toEqual([]);
    expect(formatNewsSummary('한 줄\n두 줄')).toEqual(['한 줄', '두 줄']);
  });
});
