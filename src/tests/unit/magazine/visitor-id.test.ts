/**
 * 방문자 식별 (E-04 · T3-04 / S2-28 / T1-13)
 */
import { describe, expect, it } from 'vitest';
import {
  VISITOR_ID_STORAGE_KEY,
  VISITOR_ID_TTL_MS,
  buildClickPayload,
  isPreviewContext,
  isValidVisitorId,
  parseStoredVisitorId,
  readSubscriberSid,
  resolveVisitorId,
  sanitizeClickMeta,
  type KeyValueStorage,
} from '@/lib/magazine/visitor-id';

function memStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

let seq = 0;
const gen = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
const NOW = Date.parse('2026-10-06T00:00:00Z');

describe('resolveVisitorId', () => {
  it('브라우저(저장소) 2개 → 서로 다른 visitor 2개 (같은 UA·화면이어도 충돌 없음)', () => {
    const a = resolveVisitorId(memStorage(), NOW, gen);
    const b = resolveVisitorId(memStorage(), NOW, gen);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a).not.toBe(b);
    expect(isValidVisitorId(a)).toBe(true);
  });

  it('같은 저장소에서는 재방문해도 같은 ID (영속)', () => {
    const s = memStorage();
    const first = resolveVisitorId(s, NOW, gen);
    const second = resolveVisitorId(s, NOW + 86_400_000, gen);
    expect(second).toBe(first);
    expect(JSON.parse(s.data.get(VISITOR_ID_STORAGE_KEY)!).createdAt).toBe(NOW);
  });

  it('13개월(395일) 경과 → 새 ID 로 교체', () => {
    const s = memStorage();
    const first = resolveVisitorId(s, NOW, gen)!;
    expect(resolveVisitorId(s, NOW + VISITOR_ID_TTL_MS - 1000, gen)).toBe(first);
    const renewed = resolveVisitorId(s, NOW + VISITOR_ID_TTL_MS, gen)!;
    expect(renewed).not.toBe(first);
  });

  it('손상된 저장값·잘못된 ID 는 무시하고 새로 발급', () => {
    const s = memStorage();
    s.data.set(VISITOR_ID_STORAGE_KEY, 'not-json');
    expect(resolveVisitorId(s, NOW, gen)).not.toBeNull();
    s.data.set(VISITOR_ID_STORAGE_KEY, JSON.stringify({ id: 'abc', createdAt: NOW }));
    const id = resolveVisitorId(s, NOW, gen)!;
    expect(isValidVisitorId(id)).toBe(true);
  });

  it('난수 생성기가 없으면 null — 지문 폴백으로 추적하지 않는다', () => {
    expect(resolveVisitorId(memStorage(), NOW, () => null)).toBeNull();
  });

  it('저장소 쓰기가 막혀도(사생활 보호 모드) 이번 로드용 ID 를 돌려준다', () => {
    const broken: KeyValueStorage = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
    };
    expect(isValidVisitorId(resolveVisitorId(broken, NOW, gen))).toBe(true);
  });

  it('parseStoredVisitorId: 미래 시각(시계 조작)은 거부', () => {
    const raw = JSON.stringify({ id: gen(), createdAt: NOW + 3_600_000 });
    expect(parseStoredVisitorId(raw, NOW)).toBeNull();
  });
});

describe('isPreviewContext (T1-13)', () => {
  it('iframe 이면 미리보기', () => expect(isPreviewContext('', true)).toBe(true));
  it('?preview=1 / true 이면 미리보기', () => {
    expect(isPreviewContext('?preview=1', false)).toBe(true);
    expect(isPreviewContext('preview=true', false)).toBe(true);
  });
  it('일반 열람은 미리보기 아님', () => {
    expect(isPreviewContext('', false)).toBe(false);
    expect(isPreviewContext('?preview=0&x=1', false)).toBe(false);
  });
});

describe('readSubscriberSid', () => {
  const tok = `${'a'.repeat(40)}.${'b'.repeat(43)}`;
  it('서명 토큰 형식만 통과', () => {
    expect(readSubscriberSid(`?sid=${tok}`)).toBe(tok);
    expect(readSubscriberSid('?sid=1234')).toBeNull();
    expect(readSubscriberSid('?sid=<script>')).toBeNull();
    expect(readSubscriberSid('')).toBeNull();
  });
});

describe('buildClickPayload', () => {
  it('신규 형식 (target, meta): url 은 target_url 로 분리, 메타는 정제', () => {
    const p = buildClickPayload('listing_click', { url: 'https://x.kr/a', id: 'b1', nested: { a: 1 }, fn: () => 1 });
    expect(p).toEqual({ target_param: 'listing_click', target_url: 'https://x.kr/a', meta: { id: 'b1' } });
  });

  it('레거시 (url, param) 형식 호환', () => {
    expect(buildClickPayload('https://x.kr/a', 'phone_click')).toEqual({
      target_url: 'https://x.kr/a',
      target_param: 'phone_click',
    });
  });

  it('tel: 문자열은 target_param 토큰이 아니라 URL 로 분류 (전화번호가 param 으로 저장되지 않음)', () => {
    const p = buildClickPayload('tel:01012345678');
    expect(p).toEqual({ target_url: 'tel:01012345678' });
    expect(p!.target_param).toBeUndefined();
  });

  it('형식 불가 target → null (전송 안 함)', () => {
    expect(buildClickPayload('')).toBeNull();
    expect(buildClickPayload('Bad Token With Space')).toBeNull();
    expect(buildClickPayload(123 as unknown as string)).toBeNull();
  });

  it('sanitizeClickMeta: 최대 8개, 문자열 100자', () => {
    const big: Record<string, unknown> = {};
    for (let i = 0; i < 12; i++) big[`k${i}`] = i;
    expect(Object.keys(sanitizeClickMeta(big))).toHaveLength(8);
    expect((sanitizeClickMeta({ s: 'x'.repeat(500) }).s as string).length).toBe(100);
    expect(sanitizeClickMeta({ 'bad key!': 1, n: NaN })).toEqual({});
  });
});
