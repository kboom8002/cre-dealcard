/**
 * E-01/E-02 저장 모델 순수 로직 테스트
 *  - 폼 ↔ content 왕복(전 필드 복원), 빈 설문/세무 키 제거, 섹션 on/off, 세그먼트
 *  - 뉴스 6개 상한, 서명 안정성, 발행 정규화(Mock 거부·broker 덮어쓰기), 발송 결과 문구, 저장 실패 분류
 *  - 죽은 버튼 정적 검사 스크립트
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_NEWS_SELECTION,
  buildContentFromForm,
  buildPatchPayload,
  buildPublishSummary,
  classifySaveFailure,
  describeDistributeOutcome,
  formFromEdition,
  formSignature,
  needsQualityReview,
  normalizeContentForPublish,
  toggleNewsSelection,
  type EditorForm,
  type PublishBrokerIdentity,
} from '@/lib/magazine/edition-save';
import { parseEditionContent, parseEditionContentDraft } from '@/domain/magazine/edition-content.schema';
// 순수 JS(.mjs) 스크립트 (allowJs 로 타입 추론됨)
import { findDeadButtons } from '../../../../scripts/check-dead-buttons.mjs';

const baseForm = (over: Partial<EditorForm> = {}): EditorForm => ({
  headline: '이번 주 성수 시장',
  briefing: '거래가 늘었습니다.',
  marketTemp: '선별 매수',
  coverKeywords: ['성수', '금리', ''],
  coverImageUrl: null,
  fieldNote: { question: '요약', buyerReaction: '문의 증가', sellerReaction: '호가 유지', marketJudgment: '선별', comment: '감사합니다' },
  themeTitle: '테마',
  themeBodyMd: '본문',
  themeColor: '#10b981',
  selectedDealIds: ['d1', 'd2'],
  selectedNewsIds: ['n1', 'n2'],
  topNews: [
    { id: 'n1', title: '뉴스1', summary: 's1', source: 'A', sentiment: 'bullish', topic: 't' },
    { id: 'n2', title: '뉴스2', summary: 's2', source: 'B', sentiment: 'neutral', topic: 't' },
  ],
  dealHighlights: [{ id: 'd1', address: '서울' }],
  pollQuestion: '적정가입니까?',
  pollOptions: [{ label: '저평가' }, { label: '적정가', intent: 'seller' }, { label: '' }],
  taxQuestion: '취득세는?',
  taxAnswer: '표준세율 적용',
  taxSource: '지방세법',
  sectionOrder: ['poll', 'ai_briefing'],
  sectionsEnabled: { tax_clinic: false },
  targetSegment: 'seller',
  ...over,
});

const broker: PublishBrokerIdentity = {
  name: '김중개',
  slug: 'kim',
  company: '성수공인',
  phone: '010-0000-0000',
  photoUrl: null,
  tagline: '성수 전문',
  specialtyRegions: ['성수'],
  specialtyAssets: ['꼬마빌딩'],
};

describe('buildContentFromForm', () => {
  it('폼 값이 content 에 반영되고 설문 선택지는 빈 칸이 제거된다', () => {
    const c = buildContentFromForm({}, baseForm());
    expect(c.headline).toBe('이번 주 성수 시장');
    expect(c.cover_keywords).toEqual(['성수', '금리']);
    expect(c.poll).toEqual({
      question: '적정가입니까?',
      choices: ['저평가', '적정가'],
      options: [{ label: '저평가' }, { label: '적정가', intent: 'seller' }],
    });
    expect(c.tax_clinic).toEqual({ question: '취득세는?', answer: '표준세율 적용', source: '지방세법' });
    expect(c.target_segment).toBe('seller');
    expect(c.selected_news_ids).toEqual(['n1', 'n2']);
  });

  it('설문/세무/뉴스를 비우면 키 자체가 제거된다 (뷰어가 섹션을 숨김)', () => {
    const base = { poll: { question: 'q', choices: ['a', 'b'] }, tax_clinic: { question: 'q', answer: 'a' }, topNews: [{ title: 'x' }] };
    const c = buildContentFromForm(
      base,
      baseForm({ pollQuestion: '', pollOptions: [{ label: '' }], taxQuestion: '', taxAnswer: '', topNews: [], selectedNewsIds: [] }),
    );
    expect('poll' in c).toBe(false);
    expect('tax_clinic' in c).toBe(false);
    expect('topNews' in c).toBe(false);
  });

  it('선택지가 2개 미만이면 설문이 게시되지 않는다', () => {
    const c = buildContentFromForm({}, baseForm({ pollOptions: [{ label: '하나' }, { label: '' }] }));
    expect('poll' in c).toBe(false);
  });

  it('생성기 형태 tax_clinic(title 보유)은 에디터가 건드리지 않으면 유지된다', () => {
    const gen = { title: '절세', scenario: 's', comparison: [], conclusion: 'c' };
    const c = buildContentFromForm({ tax_clinic: gen }, baseForm({ taxQuestion: '', taxAnswer: '' }));
    expect(c.tax_clinic).toEqual(gen);
  });

  it('섹션 on/off 는 sections[].enabled 로, 순서는 누락 보충되어 저장된다', () => {
    const c = buildContentFromForm({}, baseForm());
    const sections = c.sections as Array<{ id: string; enabled: boolean }>;
    expect(sections.find((s) => s.id === 'tax_clinic')?.enabled).toBe(false);
    expect(sections.find((s) => s.id === 'poll')?.enabled).toBe(true);
    expect((c.section_order as string[]).slice(0, 2)).toEqual(['poll', 'ai_briefing']);
    expect((c.section_order as string[]).length).toBe(sections.length);
  });

  it('base 의 생성기 필드(broker, generation)는 보존된다', () => {
    const c = buildContentFromForm({ broker: { slug: 'kim' }, generation: { isMock: false } }, baseForm());
    expect(c.broker).toEqual({ slug: 'kim' });
    expect(c.generation).toEqual({ isMock: false });
  });
});

describe('formFromEdition — 새로고침 후 전 필드 복원', () => {
  it('buildPatchPayload → formFromEdition 왕복이 서명(signature)까지 동일하다', () => {
    const form = baseForm();
    const payload = buildPatchPayload({}, form);
    const restored = formFromEdition({
      id: 'e1',
      title: payload.title,
      market_temp: payload.market_temp,
      cover_keywords: payload.cover_keywords,
      cover_image_url: payload.cover_image_url,
      field_note: payload.field_note,
      theme_title: payload.theme_title,
      theme_body_md: payload.theme_body_md,
      theme_color: payload.theme_color,
      featured_deal_ids: payload.featured_deal_ids,
      target_segments: payload.target_segments,
      content: payload.content,
    });
    expect(restored.headline).toBe(form.headline);
    expect(restored.briefing).toBe(form.briefing);
    expect(restored.fieldNote).toEqual(form.fieldNote);
    expect(restored.pollOptions.filter((o) => o.label)).toEqual([{ label: '저평가' }, { label: '적정가', intent: 'seller' }]);
    expect(restored.taxAnswer).toBe('표준세율 적용');
    expect(restored.targetSegment).toBe('seller');
    expect(restored.selectedNewsIds).toEqual(['n1', 'n2']);
    expect(restored.topNews).toHaveLength(2);
    expect(restored.sectionsEnabled.tax_clinic).toBe(false);
    expect(restored.themeColor).toBe('#10b981');
    expect(restored.coverKeywords).toEqual(['성수', '금리', '']);
  });

  it('컬럼이 비어 있으면 content 값으로 복원한다 (필드노트·키워드)', () => {
    const restored = formFromEdition({
      id: 'e2',
      field_note: {},
      cover_keywords: [],
      content: { headline: 'H', briefing: 'B', field_note: { question: 'Q', buyerReaction: '', sellerReaction: '', marketJudgment: '', comment: '' }, cover_keywords: ['k1'] },
    });
    expect(restored.headline).toBe('H');
    expect(restored.fieldNote.question).toBe('Q');
    expect(restored.coverKeywords[0]).toBe('k1');
  });

  it('빈 에디션(초안 직후)도 안전하게 빈 폼으로 복원된다', () => {
    const restored = formFromEdition({ id: 'e3', content: { schemaVersion: 1 } });
    expect(restored.headline).toBe('');
    expect(restored.targetSegment).toBe('all');
    expect(restored.sectionOrder.length).toBeGreaterThan(5);
  });
});

describe('formSignature', () => {
  it('같은 값이면 같고, 의미 있는 변경이면 달라진다', () => {
    expect(formSignature(baseForm())).toBe(formSignature(baseForm()));
    expect(formSignature(baseForm({ headline: '다른 제목' }))).not.toBe(formSignature(baseForm()));
    expect(formSignature(baseForm({ targetSegment: 'buyer' }))).not.toBe(formSignature(baseForm()));
    expect(formSignature(baseForm({ sectionsEnabled: { poll: false } }))).not.toBe(formSignature(baseForm()));
  });
  it('sectionsEnabled 키 순서가 달라도 같다', () => {
    const a = baseForm({ sectionsEnabled: { a: true, b: false } });
    const b = baseForm({ sectionsEnabled: { b: false, a: true } });
    expect(formSignature(a)).toBe(formSignature(b));
  });
});

describe('toggleNewsSelection — 최대 6개', () => {
  it('7번째 선택은 거부된다', () => {
    let cur: string[] = [];
    for (let i = 1; i <= MAX_NEWS_SELECTION; i++) {
      const r = toggleNewsSelection(cur, `n${i}`);
      expect(r.rejected).toBe(false);
      cur = r.next;
    }
    expect(cur).toHaveLength(6);
    const seventh = toggleNewsSelection(cur, 'n7');
    expect(seventh.rejected).toBe(true);
    expect(seventh.next).toEqual(cur);
  });
  it('이미 선택한 항목은 6개일 때도 해제할 수 있다', () => {
    const cur = ['a', 'b', 'c', 'd', 'e', 'f'];
    const r = toggleNewsSelection(cur, 'c');
    expect(r.rejected).toBe(false);
    expect(r.next).toEqual(['a', 'b', 'd', 'e', 'f']);
  });
});

describe('normalizeContentForPublish', () => {
  const now = '2026-10-05T03:00:00.000Z';
  const input = (content: unknown) => ({ content, broker, kind: 'weekly' as const, issueDate: '2026-10-05', weekLabel: 'W41-2026', nowIso: now });

  it('정상 콘텐츠는 EditionContentV1 로 통과하고 broker 는 서버 프로필로 덮인다', () => {
    const content = buildContentFromForm({ broker: { name: '해커', slug: 'evil', phone: '999' } }, baseForm());
    const r = normalizeContentForPublish(input(content));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((r.content.broker as { slug: string }).slug).toBe('kim');
    expect((r.content.broker as { phone: string }).phone).toBe('010-0000-0000');
    expect(r.content.issueDate).toBe('2026-10-05');
    expect(parseEditionContent(r.content).ok).toBe(true);
  });

  it('Mock 생성물은 거부한다', () => {
    const r = normalizeContentForPublish(input({ headline: 'H', briefing: 'B', generation: { isMock: true } }));
    expect(r).toMatchObject({ ok: false, code: 'MOCK_CONTENT' });
  });

  it('헤드라인이 비어 있으면 EMPTY_HEADLINE, 본문이 전혀 없으면 EMPTY_BODY', () => {
    expect(normalizeContentForPublish(input({ headline: '  ', briefing: 'B' }))).toMatchObject({ ok: false, code: 'EMPTY_HEADLINE' });
    expect(normalizeContentForPublish(input({ headline: 'H' }))).toMatchObject({ ok: false, code: 'EMPTY_BODY' });
  });

  it('품질 게이트 불합격이면 needsQualityReview', () => {
    expect(needsQualityReview({ generation: { qualityGate: { passed: false } } }, 'draft')).toBe(true);
    expect(needsQualityReview({ generation: { qualityGate: { passed: true } } }, 'draft')).toBe(false);
    expect(needsQualityReview({}, 'needs_review')).toBe(true);
    expect(needsQualityReview({}, 'draft')).toBe(false);
  });
});

describe('parseEditionContentDraft — 임시저장은 느슨, 발행은 엄격', () => {
  it('빈 초안과 일부 필드만 있는 초안은 통과한다', () => {
    expect(parseEditionContentDraft({ schemaVersion: 1 }).ok).toBe(true);
    expect(parseEditionContentDraft({ headline: 'H', poll: { question: 'q', choices: ['a', 'b'], options: [{ label: 'a', intent: 'seller' }] } }).ok).toBe(true);
  });
  it('형식이 잘못된 값은 거부한다', () => {
    expect(parseEditionContentDraft({ target_segment: 'everyone' }).ok).toBe(false);
  });
});

describe('describeDistributeOutcome — 발송 중지를 정직하게', () => {
  it('SEND_DISABLED 는 "발행은 완료, 발송은 중지" 문구', () => {
    const r = describeDistributeOutcome({ success: false, blocked: 'SEND_DISABLED', sent: 0 });
    expect(r.kind).toBe('blocked');
    expect(r.message).toContain('발행은 완료');
    expect(r.message).toContain('발송은 중지');
    expect(r.message).not.toContain('발송되었');
  });
  it('실패/성공/비정상 응답을 구분한다', () => {
    expect(describeDistributeOutcome({ success: false }).kind).toBe('failed');
    expect(describeDistributeOutcome({ success: true, result: { sentCount: 12 } })).toMatchObject({ kind: 'sent' });
    expect(describeDistributeOutcome({ success: true, result: { sentCount: 12 } }).message).toContain('12');
    expect(describeDistributeOutcome(null).kind).toBe('failed');
  });
});

describe('classifySaveFailure / buildPublishSummary', () => {
  it('상태 코드·에러 코드를 분류한다', () => {
    expect(classifySaveFailure(0, null)).toBe('network');
    expect(classifySaveFailure(409, 'EDIT_CONFLICT')).toBe('conflict');
    expect(classifySaveFailure(409, 'PUBLISHED_LOCKED')).toBe('locked');
    expect(classifySaveFailure(401, null)).toBe('auth');
    expect(classifySaveFailure(400, 'INVALID_CONTENT')).toBe('invalid');
    expect(classifySaveFailure(500, null)).toBe('server');
  });
  it('발행 확인 요약: 날짜·대상·수신자·발송 여부', () => {
    const s = buildPublishSummary({ issueDate: '2026-10-05', targetSegment: 'seller', subscriberCount: 40, sendEnabled: false, correction: false });
    expect(s.dateLabel).toBe('2026-10-05');
    expect(s.segmentLabel).toBe('매도 관심');
    expect(s.recipientText).toContain('40');
    expect(s.sendText).toContain('중지');
    expect(buildPublishSummary({ issueDate: 'x', targetSegment: 'all', subscriberCount: 3, sendEnabled: true, correction: true }).title).toBe('정정 발행 확인');
  });
});

describe('check-dead-buttons', () => {
  it('onClick 없는 button 을 찾고, onClick/submit/spread 는 통과시킨다', () => {
    const src = [
      '<div>',
      '  <button className="a">죽은 버튼</button>',
      '  <button onClick={() => go()} className="b">살아있음</button>',
      '  <motion.button whileTap={{ scale: 0.9 }}\n    className="c">죽은 모션 버튼</motion.button>',
      '  <button type="submit">제출</button>',
      '  <button {...props}>스프레드</button>',
      '  <button onClick={() => a > b} disabled={x > 1}>화살표 > 포함</button>',
      '</div>',
    ].join('\n');
    const hits = findDeadButtons(src) as Array<{ line: number }>;
    expect(hits).toHaveLength(2);
    expect(hits[0].line).toBe(2);
  });
});
