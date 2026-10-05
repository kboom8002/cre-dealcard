/**
 * 아웃리치 탭 순수 로직 (E2): 오류 해석, 태그 편집, 구독자 추가 검증(동의 보증), 응답 해석, 열람 이력, 필터.
 */
import { describe, expect, it } from 'vitest';
import {
  addTag,
  buildTagsPatch,
  describeAddResponse,
  describeIntentResult,
  emptyTagRecord,
  eventLabel,
  extractApiError,
  filterSubscribers,
  isUnsubscribedLike,
  parseSubscriberHistory,
  pendingReasonInfo,
  readSubscriberTags,
  removeTag,
  stripWeekly,
  tagRecordsEqual,
  validateAddSubscriber,
  withWeekly,
  CONSENT_ATTEST_TEXT,
} from '@/components/magazine-editor/outreach/outreach-helpers';
import { MAX_TAGS } from '@/lib/magazine/tags';

describe('extractApiError', () => {
  it('jsonError 형태 {error:{code,message}} 의 한글 문구를 그대로 사용', () => {
    expect(extractApiError({ ok: false, error: { code: 'NOT_FOUND', message: '구독자를 찾을 수 없습니다.' } }, 404)).toEqual({
      code: 'NOT_FOUND',
      message: '구독자를 찾을 수 없습니다.',
    });
  });
  it('{error:"문자열", code} 형태도 수용', () => {
    expect(extractApiError({ success: false, code: 'X', error: '매수 의향서를 만들 수 없어요.' }, 400)).toEqual({ code: 'X', message: '매수 의향서를 만들 수 없어요.' });
  });
  it('영문/내부 오류 문구는 노출하지 않고 일반 문구로 대체', () => {
    const r = extractApiError({ error: 'relation "magazine_subscribers" does not exist' }, 500);
    expect(r.message).not.toMatch(/relation|magazine_subscribers/);
    expect(r.message.length).toBeGreaterThan(0);
    expect(extractApiError(null, 500).message.length).toBeGreaterThan(0);
  });
});

describe('태그 편집 (interest_profile.tags)', () => {
  it('interest_profile.tags 우선, 없으면 레거시 interest_tags 폴백', () => {
    expect(readSubscriberTags({ interest_profile: { tags: { regions: ['강남'] } }, interest_tags: { regions: ['마포'] } }).regions).toEqual(['강남']);
    expect(readSubscriberTags({ interest_profile: {}, interest_tags: { assetTypes: ['사옥'] } }).assetTypes).toEqual(['사옥']);
    expect(readSubscriberTags({})).toEqual(emptyTagRecord());
  });

  it('사전 태그는 권역/자산으로, 사전에 없는 자유 입력은 topics 로 분류', () => {
    const a = addTag(emptyTagRecord(), '강남');
    expect(a).toMatchObject({ added: true, group: 'regions' });
    const b = addTag(a.record, '꼬마빌딩');
    expect(b).toMatchObject({ added: true, group: 'assetTypes' });
    const c = addTag(b.record, '경매 특강');
    expect(c).toMatchObject({ added: true, group: 'topics' });
    expect(c.record.topics).toEqual(['경매 특강']);
  });

  it('그룹을 지정하면 그 그룹에 넣고, 중복·빈 값·과다 입력은 사유와 함께 거절', () => {
    const a = addTag(emptyTagRecord(), '골프', 'hobbies');
    expect(a.record.hobbies).toEqual(['골프']);
    expect(addTag(a.record, '골프', 'hobbies')).toMatchObject({ added: false, reason: expect.stringContaining('이미') });
    expect(addTag(a.record, '   ')).toMatchObject({ added: false });
    expect(addTag(a.record, 'x'.repeat(200))).toMatchObject({ added: false });
    let rec = emptyTagRecord();
    for (let i = 0; i < MAX_TAGS; i++) rec = addTag(rec, `토픽${i}`, 'topics').record;
    expect(addTag(rec, '하나더', 'topics').added).toBe(false);
  });

  it('removeTag / tagRecordsEqual / buildTagsPatch(interest_profile.tags 로만 전송)', () => {
    const rec = addTag(addTag(emptyTagRecord(), '강남').record, '꼬마빌딩').record;
    const removed = removeTag(rec, 'regions', rec.regions[0]);
    expect(removed.regions).toEqual([]);
    expect(tagRecordsEqual(rec, rec)).toBe(true);
    expect(tagRecordsEqual(rec, removed)).toBe(false);
    const patch = buildTagsPatch(rec);
    expect(Object.keys(patch)).toEqual(['interest_profile']);
    expect(patch.interest_profile.tags.assetTypes).toEqual(rec.assetTypes);
    expect(JSON.stringify(patch)).not.toContain('interest_tags');
  });
});

describe('구독자 추가 검증 — 수신 동의 보증 필수', () => {
  const ok = { name: ' 홍길동 ', phone: '010-1234-5678', email: '', channel: 'kakao' as const, attested: true };

  it('동의 보증 문구가 요구 사양과 같다', () => {
    expect(CONSENT_ATTEST_TEXT).toBe('고객이 수신에 동의했음을 확인합니다');
  });

  it('보증 체크가 없으면 거절', () => {
    const r = validateAddSubscriber({ ...ok, attested: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.attested).toBeTruthy();
  });

  it('정상 입력: 이름 trim, 전화 숫자만, consentAttested:true 포함', () => {
    const r = validateAddSubscriber(ok);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload).toEqual({ name: '홍길동', phone: '01012345678', channel: 'kakao', consentAttested: true });
  });

  it('이메일/둘 다 채널은 이메일 필수, 형식 오류 거절, 이메일은 소문자 정규화', () => {
    const noEmail = validateAddSubscriber({ ...ok, channel: 'both' });
    expect(noEmail.ok).toBe(false);
    const bad = validateAddSubscriber({ ...ok, channel: 'email', email: 'abc' });
    expect(bad.ok).toBe(false);
    const good = validateAddSubscriber({ ...ok, channel: 'email', email: 'Kim@Example.COM' });
    expect(good.ok && good.payload.email).toBe('kim@example.com');
  });

  it('이름 없음·전화 형식 오류는 필드별 오류', () => {
    const r = validateAddSubscriber({ ...ok, name: ' ', phone: '123' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['name', 'phone']);
  });
});

describe('describeAddResponse / describeIntentResult', () => {
  it('201 생성, 기존 구독자, 동의 기록 미저장 안내', () => {
    expect(describeAddResponse(201, { success: true, existing: false, consentRecorded: true }).kind).toBe('created');
    expect(describeAddResponse(200, { success: true, existing: true }).kind).toBe('existing');
    const m = describeAddResponse(201, { success: true, existing: false, consentRecorded: false });
    expect(m.kind).toBe('created');
    expect(m.message).toContain('동의 이력은 남지 않았어요');
  });
  it('409 UNSUBSCRIBED 는 본인 재구독 안내(재활성화 없음)', () => {
    const r = describeAddResponse(409, { ok: false, error: { code: 'UNSUBSCRIBED', message: '수신거부한 구독자입니다.' } });
    expect(r.kind).toBe('unsubscribed');
    expect(r.message).toContain('직접 다시 구독');
  });
  it('기타 오류는 error + 사용자 문구', () => {
    expect(describeAddResponse(400, { ok: false, error: { code: 'CONSENT_REQUIRED', message: '고객이 수신에 동의했음을 확인해야 합니다.' } })).toMatchObject({ kind: 'error' });
  });

  it('AutoIntent 는 created 가 아닌 count 를 읽는다', () => {
    expect(describeIntentResult(true, 200, { count: 2 })).toMatchObject({ tone: 'success', message: expect.stringContaining('2건') });
    expect(describeIntentResult(true, 200, { created: 5 }).tone).toBe('info'); // created 키는 무시
    expect(describeIntentResult(true, 200, { count: 0, reason: 'NO_EVIDENCE' }).message).toContain('정보가 부족');
    expect(describeIntentResult(true, 200, { count: 0, skippedDuplicates: 3 }).message).toContain('3건');
    expect(describeIntentResult(false, 404, { error: { code: 'NOT_FOUND', message: '구독자를 찾을 수 없습니다.' } }).tone).toBe('error');
  });
});

describe('열람 이력 / 상태 / 필터 / 발송 요일', () => {
  it('parseSubscriberHistory: analytics 응답을 방어적으로 파싱', () => {
    const h = parseSubscriberHistory({
      analytics: {
        totalViews: 3,
        avgDwellSeconds: 42,
        lastActivityAt: '2026-10-05T01:00:00Z',
        viewedSections: ['hero', 7, 'market'],
        recentEvents: [{ event_type: 'page_view', created_at: '2026-10-05T01:00:00Z' }, null, { type: 'cta_click', sectionId: 'cta', dwellSeconds: 3 }],
      },
    });
    expect(h).toMatchObject({ totalViews: 3, avgDwellSeconds: 42, sections: ['hero', 'market'] });
    expect(h?.events.map((e) => e.type)).toEqual(['page_view', 'cta_click']);
    expect(parseSubscriberHistory({})).toBeNull();
    expect(parseSubscriberHistory('x')).toBeNull();
    expect(parseSubscriberHistory({ analytics: { totalViews: 'a' } })?.totalViews).toBe(0);
    expect(eventLabel('page_view')).toBe('매거진 열람');
    expect(eventLabel('weird')).toBe('weird');
  });

  it('수신거부/삭제 구독자 판별, 확인 채널 없음(pending) 안내', () => {
    expect(isUnsubscribedLike({ status: 'unsubscribed' })).toBe(true);
    expect(isUnsubscribedLike({ status: 'active', unsubscribed_at: '2026-01-01' })).toBe(true);
    expect(isUnsubscribedLike({ status: 'active' })).toBe(false);
    expect(pendingReasonInfo('NO_EMAIL_CONFIRM_CHANNEL')?.badge).toBe('확인 채널 없음');
    expect(pendingReasonInfo('NO_EMAIL_CONFIRM_CHANNEL')?.notice).toContain('확인 전에는 발송되지 않아요');
    expect(pendingReasonInfo(null)).toBeNull();
    expect(pendingReasonInfo(undefined)).toBeNull();
  });

  it('filterSubscribers: 이름/이메일/전화(숫자만) 검색 + 온도', () => {
    const subs = [
      { subscriber_name: '김철수', subscriber_phone: '010-1111-2222', subscriber_email: null, buyerTemperature: '🔥 적극검토' },
      { subscriber_name: '이영희', subscriber_phone: '01033334444', subscriber_email: 'lee@x.com', buyerTemperature: '⚪ 미확인' },
    ];
    expect(filterSubscribers(subs, '철수', null)).toHaveLength(1);
    expect(filterSubscribers(subs, '1111', null)[0].subscriber_name).toBe('김철수');
    expect(filterSubscribers(subs, 'LEE@', null)[0].subscriber_name).toBe('이영희');
    expect(filterSubscribers(subs, '', '⚪ 미확인')).toHaveLength(1);
    expect(filterSubscribers(subs, '', null)).toHaveLength(2);
  });

  it('withWeekly/stripWeekly: "매주 매주" 중복 방지', () => {
    expect(withWeekly('화요일')).toBe('매주 화요일');
    expect(withWeekly('매주 화요일')).toBe('매주 화요일');
    expect(stripWeekly('매주 화요일')).toBe('화요일');
    expect(withWeekly('')).toBe('');
  });
});
