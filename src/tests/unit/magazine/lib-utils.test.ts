import { describe, it, expect } from 'vitest';
import { escapeHtml, decodeEntities, safeTemplateVar, safePersonName, safeHttpUrl, stripTags } from '@/lib/magazine/escape';
import { maskPhone, maskEmail, maskAddress, normalizeKrPhone, toE164Kr, redactPiiInText } from '@/lib/magazine/pii';
import { validateSlug, isUuid, isPlausibleBrokerParam } from '@/lib/magazine/slug';
import { toUserMessage } from '@/lib/magazine/user-message';

describe('escape', () => {
  it('escapeHtml', () => {
    expect(escapeHtml('<script>"a"&\'b\'</script>')).toBe('&lt;script&gt;&quot;a&quot;&amp;&#39;b&#39;&lt;/script&gt;');
    expect(escapeHtml(null)).toBe('');
  });
  it('decodeEntities — 뉴스 제목 &quot; / 이중 인코딩', () => {
    expect(decodeEntities('서울 &quot;급매&quot; 증가')).toBe('서울 "급매" 증가');
    expect(decodeEntities('A &amp;quot;B&amp;quot;')).toBe('A "B"');
    expect(decodeEntities('&#39;x&#39; &#x41;')).toBe("'x' A");
  });
  it('stripTags / CDATA', () => {
    expect(stripTags('<![CDATA[https://x.kr/a]]>')).toBe('https://x.kr/a');
    expect(stripTags('<b>굵게</b> 글')).toBe('굵게 글');
  });
  it('safeTemplateVar — URL/개행 제거, 길이 제한', () => {
    expect(safeTemplateVar('홍길동\n보세요 http://evil.kr/x', { max: 30 })).toBe('홍길동 보세요');
    expect(safeTemplateVar('a'.repeat(100), { max: 10 })).toHaveLength(10);
    expect(safePersonName('김<b>철수</b>')).toBe('김b철수/b'.replace('/', ''));
  });
  it('safeHttpUrl — javascript: 거부', () => {
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull();
    expect(safeHttpUrl('https://credeal.kr/a')).toBe('https://credeal.kr/a');
  });
});

describe('pii', () => {
  it('normalize / mask phone', () => {
    expect(normalizeKrPhone('010-1234-5678')).toBe('01012345678');
    expect(normalizeKrPhone('+82 10 1234 5678')).toBe('01012345678');
    expect(normalizeKrPhone('0101234')).toBeNull();
    expect(toE164Kr('010-1234-5678')).toBe('+821012345678');
    expect(maskPhone('01012345678')).toBe('010-****-5678');
    expect(maskEmail('abc@example.com')).toBe('a***@example.com');
  });
  it('maskAddress — 동 단위까지만', () => {
    expect(maskAddress('서울 강남구 역삼동 123-45')).toBe('서울 강남구 역삼동');
    expect(maskAddress('서울특별시 성동구 성수동2가 273-1 3층')).toBe('서울특별시 성동구 성수동2가');
    expect(maskAddress('경기 성남시 분당구 판교역로 235')).toBe('경기 성남시 분당구 판교역로');
    expect(maskAddress('')).toBe('');
    expect(maskAddress('서울 마포구 서교동 395-114')).not.toMatch(/\d/);
  });
  it('redactPiiInText', () => {
    expect(redactPiiInText('연락 010-1234-5678 / abc@example.com')).toBe('연락 010-****-5678 / a***@example.com');
  });
});

describe('slug', () => {
  it('validateSlug', () => {
    expect(validateSlug('test-broker-kim')).toEqual({ ok: true, slug: 'test-broker-kim' });
    expect(validateSlug('ab').ok).toBe(false);
    expect(validateSlug('../etc').ok).toBe(false);
    expect(validateSlug('a,b)').ok).toBe(false);
    expect(validateSlug('admin')).toMatchObject({ ok: false, code: 'RESERVED' });
    expect(validateSlug('-bad-').ok).toBe(false);
    expect(validateSlug('MyBroker')).toEqual({ ok: true, slug: 'mybroker' });
  });
  it('isUuid / plausible', () => {
    expect(isUuid('00000000-0000-4000-8000-000000000001')).toBe(true);
    expect(isUuid('test-broker-kim')).toBe(false);
    expect(isPlausibleBrokerParam('demo')).toBe(true);
    expect(isPlausibleBrokerParam('x),user_id.eq.(y')).toBe(false);
  });
});

describe('user-message', () => {
  it('내부 오류를 사용자 문구로', () => {
    expect(toUserMessage(new Error('Failed to fetch'))).toContain('인터넷');
    expect(toUserMessage(new Error('Internal Server Error'), 500)).not.toMatch(/Internal/);
  });
});
