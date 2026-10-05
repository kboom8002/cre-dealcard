/**
 * email-template 렌더 스냅샷 성격 테스트 (G-05): (광고)·수신거부·List-Unsubscribe 데이터·escape·NaN·지번 마스킹·URL 검증
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MagazineRenderError,
  buildMagazineHtml,
  renderMagazineEmail,
  renderMagazineKakaoText,
  type MagazineEmailInput,
} from '@/domain/magazine/email-template';
import { buildListUnsubscribeHeaders, buildUnsubscribeUrl, issueUnsubToken, verifyUnsubToken } from '@/domain/magazine/unsub-token';
import { formatKrwAmount } from '@/domain/magazine/templates/format';
import { assertAbsoluteHttpsUrl } from '@/domain/magazine/templates/url-guard';

let unsubUrl = '';

beforeEach(() => {
  vi.stubEnv('UNSUBSCRIBE_SECRET', 'unit-test-secret-0123456789');
  const token = issueUnsubToken({ subscriberId: '11111111-1111-4111-8111-111111111111', brokerId: 'kim-broker' });
  unsubUrl = buildUnsubscribeUrl('https://credeal.net', token);
});
afterEach(() => vi.unstubAllEnvs());

function input(over: Partial<MagazineEmailInput> = {}, edition: Partial<MagazineEmailInput['edition']> = {}): MagazineEmailInput {
  return {
    brokerName: '김중개',
    brokerContact: '02-123-4567',
    subscriberName: '홍길동',
    edition: {
      title: '10월 1주차 시장 브리핑',
      headline: '금리 동결 기조 속에 성수권 거래가 늘고 있습니다.\n선별 접근이 필요합니다.',
      marketTemp: '선별 매수',
      date: '2026-10-05',
      url: 'https://credeal.net/magazine/kim-broker/2026-10-05',
      deals: [{ title: '성수동 꼬마빌딩', address: '서울 성동구 성수동2가 273-1', price: 1_250_000_000, date: '2026-09-28' }],
      ...edition,
    },
    unsubscribeUrl: unsubUrl,
    senderAddress: '서울 성동구 성수이로 1',
    consentDate: '2026-09-01',
    isAd: true,
    ...over,
  };
}

describe('renderMagazineEmail — 법정 요건(§50, 시행령 §61)', () => {
  it('제목 (광고) 접두 + 본문/텍스트 (광고) 표기 + 해지 링크 + 전송자 footer', () => {
    const r = renderMagazineEmail(input());
    expect(r.subject.startsWith('(광고) ')).toBe(true);
    expect(r.subject).toContain('김중개');
    expect(r.hasAdLabel).toBe(true);
    expect(r.hasUnsubscribeLink).toBe(true);
    expect(r.hasSenderContact).toBe(true);
    // 해지 링크는 HTML·텍스트 양쪽, 수신거부 문구와 함께
    expect(r.html).toContain(`href="${unsubUrl.replace(/&/g, '&amp;')}"`);
    expect(r.text).toContain(`수신거부: ${unsubUrl}`);
    expect(r.html).toContain('수신거부');
    // footer: 전송자 명칭·연락처·주소, 수신동의 안내(일자)
    expect(r.html).toContain('전송자: 김중개 · 연락처 02-123-4567 · 서울 성동구 성수이로 1');
    expect(r.html).toContain('2026년 9월 1일 광고성 정보 수신에 동의');
    expect(r.text.startsWith('(광고)')).toBe(true);
  });

  it('List-Unsubscribe 헤더 데이터: 렌더 링크와 동일 URL + RFC 8058 One-Click', () => {
    const r = renderMagazineEmail(input());
    const h = buildListUnsubscribeHeaders(unsubUrl, 'unsub@credeal.net');
    expect(h['List-Unsubscribe']).toBe(`<${unsubUrl}>, <mailto:unsub@credeal.net>`);
    expect(h['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(r.text).toContain(unsubUrl);
    // 링크의 토큰은 실제로 검증 가능(구독자·브로커 바인딩)
    const token = new URL(unsubUrl).searchParams.get('t')!;
    expect(verifyUnsubToken(token)).toMatchObject({ ok: true, brokerId: 'kim-broker' });
  });

  it('광고 플래그(isAd)가 true가 아니면 렌더 거부', () => {
    expect(() => renderMagazineEmail({ ...input(), isAd: false as unknown as true })).toThrowError(MagazineRenderError);
  });

  it('전송자 명칭이 없으면 렌더 거부(MISSING_SENDER) — slug/담당 중개사 폴백 금지(M2-26)', () => {
    for (const name of ['', '   ', '<>']) {
      try {
        renderMagazineEmail(input({ brokerName: name }));
        throw new Error('should throw');
      } catch (e) {
        expect(e).toBeInstanceOf(MagazineRenderError);
        expect((e as MagazineRenderError).code).toBe('MISSING_SENDER');
      }
    }
  });

  it('연락처가 없으면 hasSenderContact=false (sendGate가 차단할 수 있도록 신호 제공), 전화 CTA 없음', () => {
    const r = renderMagazineEmail(input({ brokerContact: undefined }));
    expect(r.hasSenderContact).toBe(false);
    expect(r.html).not.toContain('href="tel:');
  });
});

describe('renderMagazineEmail — 이스케이프(S2-22/S2-09/M2-10①⑦)', () => {
  const evil = '<script>alert(1)</script>';

  it('구독자명·제목·헤드라인·매물·뉴스·브로커명 <script> 주입 무력화', () => {
    const r = renderMagazineEmail(
      input(
        { subscriberName: evil, brokerName: `김중개${evil}` },
        {
          title: `제목${evil}`,
          headline: `본문 ${evil} 끝`,
          deals: [{ title: `매물${evil}`, address: `서울 강남구 역삼동 ${evil}`, price: 1_000_000_000 }],
          topNews: [{ title: `뉴스${evil}`, source: evil }],
          fieldNote: { question: evil, comment: `코멘트${evil}` },
        },
      ),
    );
    expect(r.html).not.toMatch(/<script/i);
    expect(r.text).not.toMatch(/<script/i);
    expect(r.subject).not.toMatch(/<script/i);
  });

  it('속성 탈출·이벤트 핸들러 주입 시도는 이스케이프된다', () => {
    const r = renderMagazineEmail(input({ brokerName: '김" onmouseover="alert(1)' }, { title: `"><img src=x onerror=alert(1)>` }));
    expect(r.html).not.toContain('<img');
    expect(r.html).not.toMatch(/\sonerror\s*=/i);
    expect(r.html).not.toContain('" onmouseover="alert(1)');
    expect(r.html).toContain('&quot; onmouseover=&quot;alert(1)');
  });

  it('구독자명은 URL·링크를 제거한다(브랜드 피싱 차단, S2-09)', () => {
    const r = renderMagazineEmail(input({ subscriberName: '홍길동 https://evil.example/login 지금 확인' }));
    expect(r.html).not.toContain('evil.example');
    expect(r.text).not.toContain('evil.example');
  });

  it('이중 인코딩 엔티티(&quot;)가 그대로 노출되지 않는다', () => {
    const r = renderMagazineEmail(input({}, { title: '&quot;따옴표&quot; &amp; 기호', headline: '&quot;인용&quot;' }));
    expect(r.html).not.toContain('&amp;quot;');
    expect(r.html).toContain('&quot;따옴표&quot;');
    expect(r.subject).toContain('"따옴표" & 기호'); // 제목은 평문
  });
});

describe('renderMagazineEmail — 표시 데이터', () => {
  it('NaN/undefined/null 금액은 표기하지 않는다 (NaN억 방지)', () => {
    const r = renderMagazineEmail(
      input({}, {
        deals: [
          { title: 'A', price: Number.NaN },
          { title: 'B', price: 'NaN억' },
          { title: 'C', price: 'undefined' },
          { title: 'D', price: Number.POSITIVE_INFINITY },
          { title: 'E', price: -5 },
        ],
      }),
    );
    expect(r.html).not.toMatch(/NaN|undefined|null|Infinity/);
    expect(r.text).not.toMatch(/NaN|undefined|null|Infinity/);
  });

  it('formatKrwAmount 경계', () => {
    expect(formatKrwAmount(1_250_000_000)).toBe('12.5억');
    expect(formatKrwAmount(3_000_000_000)).toBe('30억');
    expect(formatKrwAmount(35_000_000)).toBe('3,500만');
    expect(formatKrwAmount('1250000000')).toBe('12.5억');
    expect(formatKrwAmount('12억 5천만원')).toBe('12억 5천만원');
    expect(formatKrwAmount(0)).toBeNull();
    expect(formatKrwAmount(undefined)).toBeNull();
    expect(formatKrwAmount('N/A')).toBeNull();
  });

  it('공개 지번은 동 단위까지만 — 정확 지번(번지) 미노출 (M2-02)', () => {
    const r = renderMagazineEmail(input());
    expect(r.html).toContain('서울 성동구 성수동2가');
    expect(r.text).toContain('서울 성동구 성수동2가');
    expect(r.html).not.toMatch(/273-1/);
    expect(r.text).not.toMatch(/273-1/);
    expect(r.html).not.toMatch(/\d+-\d+번지|\d+-\d+<\/div>/);
    // 가격 12.5억, 거래일 표시 (U2-21)
    expect(r.html).toContain('12.5억');
    expect(r.html).toContain('거래일 2026.09.28');
  });

  it('지원하지 않는 market_temp 라벨은 숨기고 지원 라벨은 표시', () => {
    expect(renderMagazineEmail(input({}, { marketTemp: '과열 주의(임의)' })).html).not.toContain('시장 상태');
    expect(renderMagazineEmail(input({}, { marketTemp: '관망' })).html).toContain('시장 상태: 관망');
  });

  it('세무 클리닉: 생성기 타입(title/scenario/comparison/conclusion)을 읽어 표시 + 면책, 사칭 문구 없음 (M2-10②, DC-13)', () => {
    const r = renderMagazineEmail(
      input({}, {
        taxClinic: {
          title: '증여 후 매각 vs 직접 매각',
          scenario: '상황 설명입니다.',
          comparison: { optionA: { name: '직접 매각', description: 'd', expectedTaxInfo: 't' }, optionB: { name: '부담부 증여', description: 'd', expectedTaxInfo: 't' } },
          conclusion: '결론 문장입니다.',
        },
      }),
    );
    expect(r.html).toContain('증여 후 매각 vs 직접 매각');
    expect(r.html).toContain('상황 설명입니다.');
    expect(r.html).toContain('결론 문장입니다.');
    expect(r.html).toContain('비교 대안: 직접 매각 / 부담부 증여');
    expect(r.html).toContain('일반 정보이며 세무 자문이 아닙니다');
    expect(r.html).not.toMatch(/감수|추천/);
    // 면책 폰트 12px 이상
    expect(r.html).toMatch(/font-size:12px;[^"]*">일반 정보이며/);
  });

  it('세무 데이터가 비어 있으면 섹션 자체를 렌더하지 않는다(가짜 폴백 금지)', () => {
    expect(renderMagazineEmail(input({}, { taxClinic: {} })).html).not.toContain('세무');
    expect(renderMagazineEmail(input({}, { taxClinic: null })).html).not.toContain('세무');
  });
});

describe('renderMagazineEmail — 레이아웃·호환·접근성', () => {
  it('테이블 레이아웃, 단색 배경, 그라디언트/rgba/CSS 변수 없음, Outlook 조건부 주석, 프리헤더', () => {
    const { html } = renderMagazineEmail(input());
    expect(html).toContain('<table role="presentation"');
    expect(html).toMatch(/bgcolor="#f1f5f9"/);
    expect(html).not.toMatch(/gradient|rgba\(|var\(--/i);
    expect(html).toContain('<!--[if mso]>');
    expect(html).toContain('<![endif]-->');
    expect(html).toContain('name="color-scheme"');
    // 프리헤더: 숨김 텍스트, (광고) 접두
    expect(html).toMatch(/<div style="display:none;[^"]*mso-hide:all;[^"]*">\(광고\) 금리 동결/);
    // 이미지 없음 → 이미지 차단 환경에서도 깨지는 요소 없음
    expect(html).not.toContain('<img');
    expect(html).toContain('lang="ko"');
  });

  it('링크 목적 분리: 매거진 보기 / 전화 상담(tel:) / 수신거부가 서로 다른 href', () => {
    const { html } = renderMagazineEmail(input());
    const hrefs = Array.from(html.matchAll(/href="([^"]+)"/g)).map((m) => m[1]);
    expect(hrefs).toContain('https://credeal.net/magazine/kim-broker/2026-10-05');
    expect(hrefs).toContain('tel:021234567');
    expect(hrefs).toContain(unsubUrl.replace(/&/g, '&amp;'));
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(html).toContain('매거진 전체 보기');
    expect(html).toContain('전화 상담 02-123-4567');
  });

  it('색 대비: 사용 토큰 조합이 모두 WCAG 4.5:1 이상 (U2-21)', () => {
    const lum = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a: string, b: string) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    const pairs: Array<[string, string]> = [
      ['#0f172a', '#ffffff'], ['#475569', '#ffffff'], ['#475569', '#f8fafc'], ['#475569', '#f1f5f9'],
      ['#1d4ed8', '#ffffff'], ['#ffffff', '#1d4ed8'],
      ['#b91c1c', '#ffffff'], ['#b45309', '#ffffff'], ['#1d4ed8', '#ffffff'], ['#991b1b', '#ffffff'],
    ];
    for (const [fg, bg] of pairs) expect(ratio(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    // 본문 HTML이 실제로 이 토큰을 쓰고 있다
    const { html } = renderMagazineEmail(input());
    for (const c of ['#0f172a', '#475569', '#1d4ed8', '#ffffff']) expect(html).toContain(c);
    // 오래된 저대비 토큰 미사용 (#64748b on #131722 등)
    expect(html).not.toMatch(/#64748b|#131722|#0b0d14/);
  });
});

describe('링크 검증 — 상대/localhost/undefined 거부', () => {
  const cases: Array<[string, Partial<MagazineEmailInput>, Partial<MagazineEmailInput['edition']>]> = [
    ['상대 매거진 URL', {}, { url: '/magazine/kim-broker/2026-10-05' }],
    ['localhost 매거진 URL', {}, { url: 'http://localhost:3000/magazine/kim-broker/2026-10-05' }],
    ['https localhost', {}, { url: 'https://localhost/magazine/x' }],
    ['undefined 경로', {}, { url: 'https://credeal.net/magazine/undefined/2026-10-05' }],
    ['http(비 https)', {}, { url: 'http://credeal.net/magazine/x' }],
    ['빈 URL', {}, { url: '' }],
    ['javascript 스킴', {}, { url: 'javascript:alert(1)' }],
    ['상대 해지 URL', { unsubscribeUrl: '/api/public/magazine/unsubscribe?t=abc' }, {}],
    ['localhost 해지 URL', { unsubscribeUrl: 'http://localhost:3000/api/public/magazine/unsubscribe?t=abc' }, {}],
    ['undefined 해지 URL', { unsubscribeUrl: 'undefined/api/public/magazine/unsubscribe' }, {}],
  ];
  for (const [name, top, ed] of cases) {
    it(`이메일: ${name} → throw INVALID_URL`, () => {
      expect(() => renderMagazineEmail(input(top, ed))).toThrowError(MagazineRenderError);
    });
    it(`알림톡: ${name} → throw`, () => {
      expect(() => renderMagazineKakaoText(input(top, ed))).toThrowError(MagazineRenderError);
    });
  }

  it('assertAbsoluteHttpsUrl: 토큰 안의 우연한 null/undefined 부분문자열은 허용', () => {
    expect(() => assertAbsoluteHttpsUrl('https://credeal.net/api/x?t=abc-null-def_undefined_x', 'u')).not.toThrow();
    expect(() => assertAbsoluteHttpsUrl('https://credeal.net/x?t=undefined', 'u')).toThrow();
    expect(() => assertAbsoluteHttpsUrl('https://user:pw@credeal.net/x', 'u')).toThrow();
  });
});

describe('renderMagazineKakaoText — 알림톡 광고 본문', () => {
  it('(광고) 접두 + 발신 + 수신거부 링크 + 길이 한도', () => {
    const k = renderMagazineKakaoText(input());
    expect(k.text.startsWith('(광고) 김중개')).toBe(true);
    expect(k.hasAdLabel).toBe(true);
    expect(k.hasUnsubscribeLink).toBe(true);
    expect(k.text).toContain(`수신거부: ${unsubUrl}`);
    expect(k.text).toContain('발신: 김중개 (02-123-4567)');
    expect(k.text).toContain('▶ 전화 상담: 02-123-4567');
    expect(k.text.length).toBeLessThanOrEqual(1000);
  });

  it('긴 헤드라인은 잘라서 1,000자 이내 유지, 링크는 보존', () => {
    const k = renderMagazineKakaoText(input({}, { headline: '가'.repeat(3000), title: '나'.repeat(300) }));
    expect(k.text.length).toBeLessThanOrEqual(1000);
    expect(k.text).toContain(unsubUrl);
    expect(k.text).toContain('https://credeal.net/magazine/kim-broker/2026-10-05');
  });

  it('주입 문자열 정제(꺾쇠·URL·개행) 및 전송자 없으면 거부', () => {
    const k = renderMagazineKakaoText(input({ subscriberName: '<b>홍</b> https://evil.example' }));
    expect(k.text).not.toContain('evil.example');
    expect(k.text).not.toContain('<b>');
    expect(() => renderMagazineKakaoText(input({ brokerName: '' }))).toThrowError(MagazineRenderError);
    expect(() => renderMagazineKakaoText({ ...input(), isAd: false as unknown as true })).toThrowError(MagazineRenderError);
  });
});

describe('레거시 buildMagazineHtml — fail-closed', () => {
  it('해지 링크 없이는 렌더하지 않는다', () => {
    expect(() =>
      buildMagazineHtml({
        to: 'a@b.com',
        brokerName: '김중개',
        subscriberName: '홍',
        magazineTitle: 't',
        headline: 'h',
        magazineUrl: 'https://credeal.net/m',
        imageUrl: '',
      }),
    ).toThrowError(MagazineRenderError);
  });

  it('해지 링크가 있으면 새 템플릿으로 렌더((광고)·수신거부 포함)', () => {
    const html = buildMagazineHtml({
      to: 'a@b.com',
      brokerName: '김중개',
      brokerContact: '02-123-4567',
      subscriberName: '홍',
      magazineTitle: 't',
      headline: 'h',
      magazineUrl: 'https://credeal.net/m',
      imageUrl: '',
      unsubscribeUrl: unsubUrl,
    });
    expect(html).toContain('(광고)');
    expect(html).toContain('수신거부');
  });
});
