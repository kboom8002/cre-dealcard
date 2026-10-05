import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  isSellerChoice,
  MIN_POLL_RESULTS,
  parsePollChoice,
  pollOptionCount,
  pollPercent,
  sanitizeVisitorId,
  shouldShowPollResults,
  isMissingRelationError,
  isUniqueViolation,
} from '@/lib/magazine/poll-helpers';
import { digitsOnly, formatKrPhoneInput, isPlausiblePhoneDigits } from '@/lib/magazine/phone-input';
import { buildOgImageUrl } from '@/lib/magazine/view-helpers';
import {
  canonicalBrokerSlug,
  classifyIssueDate,
  maskPublicAddresses,
  mergeEditionContent,
} from '@/lib/magazine/public-page-data';
import {
  buildPreviewBroker,
  extractApiErrorMessage,
  parseEditorIdentity,
} from '@/lib/magazine/editor-helpers';

describe('view-poll-helpers', () => {
  it('parsePollChoice: 0..5 정수만, optionCount 초과 거부', () => {
    expect(parsePollChoice(0)).toBe(0);
    expect(parsePollChoice(5)).toBe(5);
    expect(parsePollChoice(6)).toBeNull();
    expect(parsePollChoice(-1)).toBeNull();
    expect(parsePollChoice(1.2)).toBeNull();
    expect(parsePollChoice('1')).toBeNull();
    expect(parsePollChoice(2, 2)).toBeNull();
    expect(parsePollChoice(1, 2)).toBe(1);
  });

  it('sanitizeVisitorId', () => {
    expect(sanitizeVisitorId('abcd1234')).toBe('abcd1234');
    expect(sanitizeVisitorId('short')).toBeNull();
    expect(sanitizeVisitorId('bad id with spaces!!')).toBeNull();
    expect(sanitizeVisitorId(123)).toBeNull();
  });

  it('결과는 최소 표본(5) 이상일 때만 노출', () => {
    expect(MIN_POLL_RESULTS).toBe(5);
    expect(shouldShowPollResults({ total: 4, counts: { 0: 4 } })).toBe(false);
    expect(shouldShowPollResults(null)).toBe(false);
    expect(shouldShowPollResults({ total: 5, counts: { 0: 5 } })).toBe(true);
    expect(pollPercent({ total: 4, counts: { 0: 4 } }, 0)).toBeNull();
    expect(pollPercent({ total: 10, counts: { 0: 3, 1: 7 } }, 1)).toBe(70);
  });

  it('seller 판정은 options[].intent 메타 기준 — 선택지 순서와 무관', () => {
    const a = { options: [{ label: 'A', intent: 'seller' }, { label: 'B' }] };
    const b = { options: [{ label: 'B' }, { label: 'A', intent: 'seller' }] };
    expect(isSellerChoice(a, 0)).toBe(true);
    expect(isSellerChoice(a, 1)).toBe(false);
    expect(isSellerChoice(b, 0)).toBe(false);
    expect(isSellerChoice(b, 1)).toBe(true);
    // 메타가 없으면 어떤 index 도 seller 가 아니다 (이전의 index===2 하드코딩 제거)
    expect(isSellerChoice({ choices: ['a', 'b', 'c'] }, 2)).toBe(false);
  });

  it('pollOptionCount / 에러 코드 판정', () => {
    expect(pollOptionCount({ choices: ['a', 'b'] })).toBe(2);
    expect(pollOptionCount({ options: [{}, {}, {}] })).toBe(3);
    expect(pollOptionCount(null)).toBe(0);
    expect(isMissingRelationError({ code: '42P01' })).toBe(true);
    expect(isMissingRelationError({ code: 'PGRST205' })).toBe(true);
    expect(isMissingRelationError({ code: '23505' })).toBe(false);
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
  });
});

describe('view-phone-input', () => {
  it('숫자만 추출 / 하이픈 마스크 / 유효 자리수', () => {
    expect(digitsOnly('010-1234-5678')).toBe('01012345678');
    expect(formatKrPhoneInput('01012345678')).toBe('010-1234-5678');
    expect(formatKrPhoneInput('0101234')).toBe('010-1234');
    expect(isPlausiblePhoneDigits('01012345678')).toBe(true);
    expect(isPlausiblePhoneDigits('0101234')).toBe(false);
  });
});

describe('view-og-url', () => {
  it('OG 이미지는 쿼리 형식 (/api/og/magazine/{slug} 경로형 금지)', () => {
    const url = buildOgImageUrl('https://www.credeal.net/', 'my-mag', '2026-01-05');
    expect(url).toBe('https://www.credeal.net/api/og/magazine?brokerId=my-mag&date=2026-01-05');
    expect(url).not.toMatch(/\/api\/og\/magazine\/my-mag/);
  });
});

describe('view-public-page-data', () => {
  it('classifyIssueDate: 미래/형식오류/정상', () => {
    const now = new Date('2026-06-15T03:00:00Z');
    expect(classifyIssueDate('2099-12-31', now).kind).toBe('future');
    expect(classifyIssueDate('not-a-date', now).kind).toBe('invalid');
    expect(classifyIssueDate('2026-02-30', now).kind).toBe('invalid');
    expect(classifyIssueDate('2020-01-01', now)).toEqual({ kind: 'ok', date: '2020-01-01' });
    // KST 기준 오늘은 허용
    expect(classifyIssueDate('2026-06-15', now).kind).toBe('ok');
  });

  it('canonicalBrokerSlug: uuid 접근 + slug 보유 시에만 정규 slug 반환', () => {
    const uuid = '123e4567-e89b-42d3-a456-426614174000';
    expect(canonicalBrokerSlug(uuid, { slug: 'my-mag' })).toBe('my-mag');
    expect(canonicalBrokerSlug('my-mag', { slug: 'my-mag' })).toBeNull();
    expect(canonicalBrokerSlug(uuid, { slug: null })).toBeNull();
    expect(canonicalBrokerSlug(uuid, null)).toBeNull();
  });

  it('mergeEditionContent: content 값 우선, 비어있을 때만 컬럼 사용', () => {
    const merged = mergeEditionContent({
      id: 'e1',
      title: '컬럼 제목',
      market_temp: '관망',
      content: { headline: '본문 헤드라인', market_temp: '적극 매수' },
    });
    expect(merged.headline).toBe('본문 헤드라인');
    expect(merged.market_temp).toBe('적극 매수');
    expect(merged.id).toBe('e1');
    expect(mergeEditionContent({ id: 'e2', title: 'T', content: null }).headline).toBe('T');
  });

  it('maskPublicAddresses: 지번을 동 단위로 마스킹하고 입력을 변경하지 않는다', () => {
    const input = { dealHighlights: [{ address: '서울 강남구 역삼동 123-45', price: '10억' }] };
    const out = maskPublicAddresses(input);
    expect(out.dealHighlights[0].address).not.toMatch(/123-45/);
    expect(out.dealHighlights[0].address).toContain('역삼동');
    expect(input.dealHighlights[0].address).toContain('123-45');
  });
});

describe('editor-identity-helpers', () => {
  it('parseEditorIdentity: data.slug 또는 data.broker.slug, 없으면 null slug', () => {
    expect(
      parseEditorIdentity({ data: { slug: 'a-b-c', display_name: '홍길동', phone: '010', subscription: { isPaid: true } } }),
    ).toMatchObject({ slug: 'a-b-c', displayName: '홍길동', isPaid: true });
    expect(parseEditorIdentity({ data: { broker: { slug: 'x-y-z' } } })?.slug).toBe('x-y-z');
    expect(parseEditorIdentity({ data: {} })?.slug).toBeNull();
    expect(parseEditorIdentity({})).toBeNull();
  });

  it('buildPreviewBroker: 이메일을 phone 슬롯에 넣지 않는다 (T3-PII-1)', () => {
    const ident = parseEditorIdentity({ data: { slug: 'a-b-c', display_name: '홍', phone: '010-1111-2222', email: 'x@y.com' } });
    const b = buildPreviewBroker(ident);
    expect(b?.phone).toBe('010-1111-2222');
    expect(JSON.stringify(b)).not.toContain('x@y.com');
    expect(buildPreviewBroker(null)).toBeNull();
  });

  it('extractApiErrorMessage: 여러 에러 형태 지원', () => {
    expect(extractApiErrorMessage({ error: { code: 'X', message: '중복' } }, 'fb')).toBe('중복');
    expect(extractApiErrorMessage({ error: '문자열 오류' }, 'fb')).toBe('문자열 오류');
    expect(extractApiErrorMessage(null, 'fb')).toBe('fb');
  });
});

describe('view-poison-tokens (뷰어 구성 소스: magazine-view + viewer-sections + 섬 컴포넌트)', () => {
  const VIEWER_SOURCES = [
    'app/(magazine)/magazine/[brokerId]/[date]/magazine-view.tsx',
    'components/magazine/viewer-sections.tsx',
    'components/magazine/viewer-primitives.tsx',
    'components/magazine/SectionCard.tsx',
    'components/magazine/ForwardSection.tsx',
    'components/magazine/BrokerAvatar.tsx',
    'components/magazine/PollSection.tsx',
    'components/magazine/ViewerBottomBar.tsx',
  ];
  const src = VIEWER_SOURCES.map((rel) =>
    fs.readFileSync(path.resolve(__dirname, '../../../', rel), 'utf-8'),
  ).join('\n');
  it.each([
    ['Math.max('],
    ['62/100'],
    ['감수'],
    ['010-0000-0000'],
    ['news.cre-dummy'],
    ['대안 B (추천)'],
  ])('금지 토큰 "%s" 없음', (token) => {
    expect(src).not.toContain(token);
  });

  it('설문 기본값/가짜 선택지 하드코딩이 없다', () => {
    expect(src).not.toMatch(/index\s*===\s*2/);
  });

  it('세무 면책 문구는 12px(text-xs) 이상', () => {
    expect(src).toMatch(/data-testid="tax-disclaimer"/);
    expect(src).not.toMatch(/tax-disclaimer[^>]*text-\[(?:9|10|11)px\]/);
  });

  it('11px 이하 임의 폰트 크기·존재하지 않는 기본 아바타를 쓰지 않는다 (U-05)', () => {
    expect(src).not.toMatch(/text-\[(?:[1-9]|10|11)px\]/);
    expect(src).not.toContain('/default-avatar.png');
  });
});


describe('view-subscribe-sources', () => {
  const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '../../../', rel), 'utf-8');

  it('구독 폼: 동의 기본 false, 거짓 문구/하드코딩 없음', () => {
    const form = read('app/(magazine)/magazine/[brokerId]/subscribe/SubscribeFormClient.tsx');
    expect(form).not.toMatch(/매주 월요일/);
    expect(form).not.toMatch(/broker_id/);
    expect(form).toMatch(/tags:\s*\[/);
  });

  it('레이아웃: 핀치 줌 허용 (maximumScale 제거), viewportFit cover', () => {
    const layout = read('app/layout.tsx');
    expect(layout).not.toMatch(/maximumScale/);
    expect(layout).toMatch(/viewportFit:\s*["']cover["']/);
  });

  it('에디터: "demo" slug 폴백 없음', () => {
    const page = read('app/(broker)/broker/magazine-editor/page.tsx');
    expect(page).not.toMatch(/\|\|\s*"demo"/);
    const preview = read('components/magazine-editor/MagazinePhonePreview.tsx');
    expect(preview).not.toMatch(/"demo"/);
  });
});
