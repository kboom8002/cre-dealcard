/**
 * E3 뷰어 순수 로직 테스트: ROI 회귀 고정, 설문 intent 분류, 섹션 순서/타깃, 하단 바, 용어집, 뉴스, 아카이브, 구독 응답, 공유.
 */
import { describe, it, expect, vi } from 'vitest';
import { computeRoi, ROI_ASSUMPTIONS, clampInput } from '@/components/magazine/roi-calc';
import {
  buildBottomBarActions,
  buildMagazineTitle,
  formatManwonInt,
  formatPriceKo,
  formatSignedManwon,
  isSectionEnabled,
  parseViewerTarget,
  pickTopNews,
  resolveSectionOrder,
  safeTrackClick,
  splitGlossary,
  taxVisibleForTarget,
  toTelHref,
  hasAnyViewerContent,
} from '@/lib/magazine/view-helpers';
import { isSellerChoice, normalizePoll, parseStoredPollChoice, pollStorageKey } from '@/lib/magazine/poll-helpers';
import { buildArchiveEntries } from '@/lib/magazine/public-page-data';
import {
  interpretSubscribeResponse,
  postSubscribe,
  NO_EMAIL_CONFIRM_NOTICE,
} from '@/components/magazine/subscribe-api';
import { shareMagazine } from '@/components/magazine/share-magazine';

describe('ROI 계산 엔진 회귀 고정 (U-04: 계산식 불변)', () => {
  const base = { totalFloors: 5 };
  it('양호 시나리오: Cap 5.70% / CoC 8.63% / 월 +1,438만', () => {
    const r = computeRoi({
      ...base,
      purchasePrice: 5_000_000_000,
      ltvRatio: 50,
      interestRate: 4.5,
      deposit: 500_000_000,
      monthlyRent: 25_000_000,
      vacancyFloors: 0,
    });
    expect(r.capRate.toFixed(2)).toBe('5.70');
    expect(r.cashOnCash.toFixed(2)).toBe('8.63');
    expect(formatSignedManwon(r.monthlyCashFlow)).toBe('+1,438만');
  });

  it('위험 시나리오: Cap 1.34% / CoC -10.06% / 월 −1,190만', () => {
    const r = computeRoi({
      ...base,
      purchasePrice: 5_000_000_000,
      ltvRatio: 70,
      interestRate: 6.0,
      deposit: 200_000_000,
      monthlyRent: 15_000_000,
      vacancyFloors: 3,
    });
    expect(r.capRate.toFixed(2)).toBe('1.34');
    expect(r.cashOnCash.toFixed(2)).toBe('-10.06');
    expect(formatSignedManwon(r.monthlyCashFlow)).toBe('−1,190만');
  });

  it('가정 상수는 관리비 10%, 보증금 운용 3%', () => {
    expect(ROI_ASSUMPTIONS.managementCostRate).toBe(0.1);
    expect(ROI_ASSUMPTIONS.depositReturnRate).toBe(0.03);
  });

  it('NOI 는 정수 만원으로 표기, clampInput 은 범위 보정', () => {
    expect(formatManwonInt(285_000_000)).toBe('28,500만원');
    expect(formatManwonInt(-11_900_000)).toBe('-1,190만원');
    expect(clampInput(99, 1, 60)).toBe(60);
    expect(clampInput(0, 1, 60)).toBe(1);
    expect(clampInput(Number.NaN, 1, 60)).toBeNull();
  });
});

describe('금액 표기 (65억)', () => {
  it('정수 억은 소수점 없이, 소수는 한 자리', () => {
    expect(formatPriceKo(6_500_000_000)).toBe('65억');
    expect(formatPriceKo(6_550_000_000)).toBe('65.5억');
    expect(formatPriceKo(45_000_000)).toBe('4,500만');
    expect(formatPriceKo(0)).toBe('-');
    expect(formatPriceKo('10억')).toBe('10억');
  });
});

describe('설문 intent 분류 (T1-19)', () => {
  const poll = {
    question: '지금 시장에서 가장 큰 고민은?',
    options: [
      { label: '매수 타이밍', intent: 'buyer' },
      { label: '매도 시점', intent: 'seller' },
      { label: '관망' },
    ],
  };
  it('seller 판정은 intent 메타로 — 순서를 바꿔도 불변', () => {
    expect(isSellerChoice(poll, 1)).toBe(true);
    expect(isSellerChoice(poll, 0)).toBe(false);
    const reordered = { ...poll, options: [poll.options[1], poll.options[0], poll.options[2]] };
    expect(isSellerChoice(reordered, 0)).toBe(true); // 매도 선택지가 앞으로 와도 intent 를 따라간다
    expect(isSellerChoice(reordered, 1)).toBe(false);
  });

  it('메타가 없으면 어떤 index 도 seller 로 추정하지 않는다', () => {
    const noMeta = { options: [{ label: 'a' }, { label: 'b' }, { label: 'c' }] };
    expect([0, 1, 2].some((i) => isSellerChoice(noMeta, i))).toBe(false);
    expect(isSellerChoice({ choices: ['a', 'b', 'c'] }, 2)).toBe(false);
  });

  it('normalizePoll: 질문 없음/선택지 2개 미만이면 null, 최대 6개, intent 보존', () => {
    expect(normalizePoll(null)).toBeNull();
    expect(normalizePoll({ question: '', options: ['a', 'b'] })).toBeNull();
    expect(normalizePoll({ question: 'q', options: ['a'] })).toBeNull();
    const many = normalizePoll({ question: 'q', choices: ['1', '2', '3', '4', '5', '6', '7', '8'] });
    expect(many?.options).toHaveLength(6);
    const v = normalizePoll(poll);
    expect(v?.options.map((o) => o.intent)).toEqual(['buyer', 'seller', null]);
  });

  it('parseStoredPollChoice: 범위 밖/비정수는 무시, -1(이미 응답)은 허용', () => {
    expect(parseStoredPollChoice('1', 3)).toBe(1);
    expect(parseStoredPollChoice('3', 3)).toBeNull();
    expect(parseStoredPollChoice('x', 3)).toBeNull();
    expect(parseStoredPollChoice('1.5', 3)).toBeNull();
    expect(parseStoredPollChoice(null, 3)).toBeNull();
    expect(parseStoredPollChoice('-1', 3)).toBe(-1);
    expect(pollStorageKey('a-b-c', '2026-09-20')).toBe('cre_poll_a-b-c_2026-09-20');
  });
});

describe('타깃·섹션 순서·on/off (DC-9, DC-10)', () => {
  it('parseViewerTarget: 알 수 없는 값은 all, owner → seller, 배열 첫 값', () => {
    expect(parseViewerTarget(undefined)).toBe('all');
    expect(parseViewerTarget('buyer')).toBe('buyer');
    expect(parseViewerTarget('owner')).toBe('seller');
    expect(parseViewerTarget(['seller', 'buyer'])).toBe('seller');
    expect(parseViewerTarget('<script>')).toBe('all');
  });

  it('seller: 시장 데이터가 매물보다 앞, buyer: 매물이 테마보다 앞', () => {
    const seller = resolveSectionOrder('seller');
    expect(seller.indexOf('market_data')).toBeLessThan(seller.indexOf('featured_deals'));
    const buyer = resolveSectionOrder('buyer');
    expect(buyer.indexOf('featured_deals')).toBeLessThan(buyer.indexOf('theme_of_week'));
  });

  it('레퍼럴·세무는 항상 후미(강등), 구독·프로필은 본문 뒤', () => {
    for (const t of ['all', 'buyer', 'seller'] as const) {
      const o = resolveSectionOrder(t);
      expect(o.indexOf('referral')).toBe(o.length - 1);
      expect(o.indexOf('tax_clinic')).toBeGreaterThan(o.indexOf('subscribe_cta'));
    }
  });

  it('custom section_order 는 존중하고 구독·프로필을 뒤에 붙인다', () => {
    expect(resolveSectionOrder('all', ['poll', 'ai_briefing', 'poll'])).toEqual([
      'poll', 'ai_briefing', 'subscribe_cta', 'broker_profile',
    ]);
  });

  it('isSectionEnabled: enabled:false 만 끈다', () => {
    const sections = [{ id: 'poll', enabled: false }, { id: 'reports', enabled: true }];
    expect(isSectionEnabled(sections, 'poll')).toBe(false);
    expect(isSectionEnabled(sections, 'reports')).toBe(true);
    expect(isSectionEnabled(sections, 'news_curation')).toBe(true);
    expect(isSectionEnabled(undefined, 'poll')).toBe(true);
  });

  it('세무는 buyer 타깃에게 숨김', () => {
    expect(taxVisibleForTarget('buyer')).toBe(false);
    expect(taxVisibleForTarget('seller')).toBe(true);
    expect(taxVisibleForTarget('all')).toBe(true);
  });
});

describe('표지 제목 (T1-16)', () => {
  it('헤드라인이 있으면 그대로, 없으면 이름 기반 — 고정 문구로 폴백하지 않는다', () => {
    expect(buildMagazineTitle('  강남 오피스 거래 회복  ', '김중개')).toBe('강남 오피스 거래 회복');
    expect(buildMagazineTitle('', '김중개')).toBe('김중개의 CRE 매거진');
    expect(buildMagazineTitle(null, null)).not.toContain('위클리');
  });
});

describe('하단 바 액션 (CTA 위계)', () => {
  it('전화 있음: 전화(주) + IM + 공유', () => {
    const a = buildBottomBarActions({ phone: '010-1234-5678', brokerSlug: 'a-b-c' });
    expect(a.map((x) => x.kind)).toEqual(['call', 'im', 'share']);
    expect(a[0]).toMatchObject({ href: 'tel:01012345678' });
  });
  it('전화 없음 + 카톡 URL: 카톡 문의가 주 CTA', () => {
    const a = buildBottomBarActions({ brokerSlug: 'a-b-c', kakaoUrl: 'https://open.kakao.com/o/abc' });
    expect(a[0]).toMatchObject({ kind: 'contact', target: 'bottom_kakao' });
  });
  it('전화·카톡 없음 + slug: 프로필 문의가 대체 CTA', () => {
    const a = buildBottomBarActions({ brokerSlug: 'a-b-c' });
    expect(a[0]).toMatchObject({ kind: 'contact', target: 'bottom_contact' });
  });
  it('slug 도 없으면 공유만 남는다 (깨진 링크 CTA 없음)', () => {
    expect(buildBottomBarActions({}).map((x) => x.kind)).toEqual(['share']);
  });
  it('toTelHref: 비정상 번호는 null', () => {
    expect(toTelHref('123')).toBeNull();
    expect(toTelHref(undefined)).toBeNull();
  });
  it('safeTrackClick: 함수가 없어도·던져도 UI 를 막지 않는다', () => {
    expect(() => safeTrackClick({}, 'x')).not.toThrow();
    expect(() => safeTrackClick({ trackClick: () => { throw new Error('x'); } }, 'x')).not.toThrow();
    const fn = vi.fn();
    safeTrackClick({ trackClick: fn }, 'phone_click', { a: 1 });
    expect(fn).toHaveBeenCalledWith('phone_click', { a: 1 });
  });
});

describe('용어집 (첫 등장만)', () => {
  it('같은 용어는 첫 등장만 용어 조각으로 표시한다', () => {
    const seen = new Set<string>();
    const first = splitGlossary('Cap Rate 와 NOI, 다시 Cap Rate', seen);
    const terms = first.filter((s) => s.term).map((s) => s.term);
    expect(terms).toEqual(['Cap Rate', 'NOI']);
    const second = splitGlossary('NOI 는 다시 나오지만', seen);
    expect(second.some((s) => s.term)).toBe(false);
  });
  it('영문자에 붙은 부분 일치는 용어가 아니다', () => {
    expect(splitGlossary('NOIR').some((s) => s.term)).toBe(false);
  });
});

describe('뉴스 최대 6건 / 제목 접두 제거', () => {
  it('최대 6건, [출처] 접두 제거, 제목 없는 항목 제외', () => {
    const topNews = Array.from({ length: 9 }, (_, i) => ({ title: `[속보] 뉴스 ${i}`, summary: 's', source: 'x' }));
    topNews.push({ title: '', summary: 'x', source: 'y' });
    const out = pickTopNews({ topNews });
    expect(out).toHaveLength(6);
    expect(out[0].title).toBe('뉴스 0');
  });
});

describe('빈 데이터 판정', () => {
  it('표지 외 본문이 없으면 false', () => {
    expect(hasAnyViewerContent({ broker: { name: 'x' } })).toBe(false);
    expect(hasAnyViewerContent({ briefing: '요약' })).toBe(true);
  });
});

describe('아카이브 항목 (T2-16)', () => {
  const NOW = new Date('2026-09-21T03:00:00Z'); // KST 2026-09-21 12:00
  it('같은 날짜는 최신 1건, 미래 제외, 최신순, label 이 날짜면 label 우선', () => {
    const rows = [
      { id: 'a', edition_label: '2026-09-14', title: '지난주', published_at: '2026-09-14T00:00:00Z' },
      { id: 'b', edition_label: '2026-09-20', title: '이번주 초안본', published_at: '2026-09-20T01:00:00Z' },
      { id: 'c', edition_label: '2026-09-20', title: '이번주 재발행', published_at: '2026-09-20T05:00:00Z' },
      { id: 'd', edition_label: '2026-10-05', title: '미래', published_at: '2026-10-05T00:00:00Z' },
      { id: 'e', edition_label: '주간 38호', title: '라벨 문자열', published_at: '2026-09-07T20:00:00Z' }, // KST 09-08
    ];
    const out = buildArchiveEntries(rows, NOW);
    expect(out.map((e) => e.date)).toEqual(['2026-09-20', '2026-09-14', '2026-09-08']);
    expect(out[0].id).toBe('c');
    expect(out.some((e) => e.id === 'd')).toBe(false);
  });
  it('조회수 필드가 항목에 존재하지 않는다 (독자 비노출 U2-30)', () => {
    const [e] = buildArchiveEntries([{ id: 'a', edition_label: '2026-09-14', published_at: '2026-09-14T00:00:00Z', view_count: 99 }], NOW);
    expect(JSON.stringify(e)).not.toMatch(/view/i);
  });
});

describe('구독 응답 해석 (B2 계약: message/pendingReason)', () => {
  it('pendingReason=NO_EMAIL_CONFIRM_CHANNEL 이면 이메일 안내를 붙인다', () => {
    const o = interpretSubscribeResponse(
      { ok: true, status: 200 },
      { ok: true, status: 'pending', message: '확인 후 발송이 시작됩니다.', pendingReason: 'NO_EMAIL_CONFIRM_CHANNEL' },
    );
    expect(o).toMatchObject({ ok: true, status: 'pending', notice: NO_EMAIL_CONFIRM_NOTICE });
    expect(NO_EMAIL_CONFIRM_NOTICE).toContain('이메일을 입력하지 않으면 확인 링크를 보낼 수 없어 수신이 시작되지 않습니다');
  });
  it('실패 시 원시 영문 오류를 노출하지 않는다', () => {
    const o = interpretSubscribeResponse({ ok: false, status: 500 }, { error: 'duplicate key value violates unique constraint' });
    expect(o.ok).toBe(false);
    if (!o.ok) expect(o.message).not.toMatch(/duplicate key|constraint/);
  });
  it('서버가 준 한글 오류 문구는 그대로 사용', () => {
    const o = interpretSubscribeResponse({ ok: false, status: 400 }, { error: { message: '이미 구독 중입니다.' } });
    expect(o).toEqual({ ok: false, message: '이미 구독 중입니다.' });
  });
  it('postSubscribe: 네트워크 예외도 일반 메시지로', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNRESET 10.0.0.1'));
    const o = await postSubscribe(
      { brokerId: 'a-b-c', channel: 'kakao', source: 'x', consent: { privacy: true, marketing: true, age14: true, night: true } },
      fetchImpl as unknown as typeof fetch,
    );
    expect(o.ok).toBe(false);
    if (!o.ok) expect(o.message).not.toContain('ECONNRESET');
  });
});

describe('공유 오케스트레이션 (U2-26)', () => {
  const input = {
    title: 't', description: 'd', imageUrl: 'https://x/y.png', link: 'https://x/z', buttonTitle: 'b', shareText: 's',
  };
  it('기기 공유 성공 → native', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    expect(await shareMagazine(input, { share })).toBe('native');
  });
  it('공유 시트 취소(AbortError) → cancelled (실패 아님)', async () => {
    const share = vi.fn().mockRejectedValue(Object.assign(new Error('x'), { name: 'AbortError' }));
    expect(await shareMagazine(input, { share })).toBe('cancelled');
  });
  it('공유 시트 실패 → 클립보드 복사 copied', async () => {
    const share = vi.fn().mockRejectedValue(new Error('boom'));
    const writeClipboard = vi.fn().mockResolvedValue(undefined);
    expect(await shareMagazine(input, { share, writeClipboard })).toBe('copied');
    expect(writeClipboard).toHaveBeenCalledWith('https://x/z');
  });
  it('모든 수단 실패 → failed (성공으로 위장 금지)', async () => {
    expect(await shareMagazine(input, {})).toBe('failed');
  });
});
