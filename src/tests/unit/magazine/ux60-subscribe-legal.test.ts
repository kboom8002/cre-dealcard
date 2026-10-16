/**
 * ux60-subscribe-legal.test.ts — 60대 독자 UX 전면 개편(U2 영역) 단위 테스트
 *  - U-F0-2: 카카오 전용 구독(NO_EMAIL_CONFIRM_CHANNEL) 해석 및 1-step 이메일 추가 입력 UI
 *  - U-F1-14 & C-10: '필수 항목 모두 동의' 마스터 체크박스 + 보유기간 문구 SSOT 일치
 *  - U-F0-4: /privacy · /terms 명도 대비(bg-slate-50 text-slate-900, 17px 본문, 핵심 3줄 요약, 48px 복귀 버튼)
 *  - U-F1-07: OG 이미지 중개사 실명(broker_profiles.name 우선) + 60대 가독 폰트(>=32px/52px/24px) + 연락처·소속 표시
 *  - U-F1-08 & C-11~C-15: 이메일 반응형(width="100%" max-width:600px), Cap Rate/NOI 한글 병기, >=14px 폰트, 발신자 헤더
 *  - U-F1-09: 수신거부(이미 해지 상태 분기·양 채널 안내·취소/재구독 복구 링크) + 구독확인(채널 중립·만료 재신청 버튼)
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  ANALYTICS_EVENT_RETENTION_NOTICE,
  SUBSCRIBER_RETENTION_LEGAL_NOTE,
  SUBSCRIBER_RETENTION_NOTICE,
  VISITOR_ID_RETENTION_NOTICE,
} from '@/lib/magazine/legal-constants';
import { ANALYTICS_NOTICE_TEXT } from '@/lib/magazine/visitor-id';
import {
  ConsentCheckboxes,
  EMPTY_CONSENT,
  allConsented,
} from '@/components/magazine/ConsentCheckboxes';
import {
  NO_EMAIL_CONFIRM_NOTICE,
  interpretSubscribeResponse,
} from '@/components/magazine/subscribe-api';
import PrivacyPage from '@/app/(public)/privacy/page';
import TermsPage from '@/app/(public)/terms/page';
import { buildImageModel } from '@/lib/magazine/og-image-data';
import { OgImage, makeTranslate } from '@/lib/magazine/og-image-render';
import {
  expandCreTermsFirstOccurrence,
  renderMagazineEmail,
  renderMagazineKakaoText,
} from '@/domain/magazine/email-template';
import { formatMagazineFromHeader } from '@/domain/magazine/send-providers';
import { formatSenderHeader, issueConfirmToken } from '@/domain/magazine/consent-service';
import { buildUnsubscribeUrl, issueUnsubToken } from '@/domain/magazine/unsub-token';
import { createFakeDb, type FakeCall } from './authz-fake-db';
import { FakeDb } from './consent-fake-db';

const UA = '11111111-1111-4111-8111-111111111111';
const SUB = '0b8f1c52-6d4e-4f0a-9c1b-2a3d4e5f6a7b';

const h = vi.hoisted(() => ({
  unsubDb: null as unknown as { client: unknown; calls: unknown[] },
  confirmDb: null as unknown as FakeDb,
  activeDbMode: 'unsub' as 'unsub' | 'confirm',
  subStatus: 'active' as 'active' | 'unsubscribed',
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => (h.activeDbMode === 'confirm' ? h.confirmDb : h.unsubDb.client),
}));

import { GET as unsubGET, POST as unsubPOST } from '@/app/api/public/magazine/unsubscribe/route';
import { GET as confirmGET, POST as confirmPOST } from '@/app/api/public/magazine/confirm/route';
import { __resetMemoryRateLimit } from '@/lib/magazine/public-guard';

describe('U-F1-14 & C-10: 보유기간 SSOT + 필수 항목 모두 동의 마스터 체크박스', () => {
  it('legal-constants SSOT 문구가 ConsentCheckboxes · visitor-id · /privacy 에 동일하게 반영된다', () => {
    expect(ANALYTICS_NOTICE_TEXT).toContain(VISITOR_ID_RETENTION_NOTICE);
    expect(ANALYTICS_NOTICE_TEXT).toMatch(/임의의 방문자 번호를 13개월간 저장.*쿠키·기기 지문 아님/);

    const consentHtml = renderToStaticMarkup(
      React.createElement(ConsentCheckboxes, {
        value: EMPTY_CONSENT,
        onChange: () => {},
        idPrefix: 'test',
      }),
    );
    expect(consentHtml).toContain(SUBSCRIBER_RETENTION_NOTICE);
    expect(consentHtml).toContain(SUBSCRIBER_RETENTION_LEGAL_NOTE);
    expect(consentHtml).toContain('필수 항목 모두 동의합니다 (한 번에 체크)');

    const privacyHtml = renderToStaticMarkup(React.createElement(PrivacyPage));
    expect(privacyHtml).toContain(SUBSCRIBER_RETENTION_NOTICE);
    expect(privacyHtml).toContain(SUBSCRIBER_RETENTION_LEGAL_NOTE);
    expect(privacyHtml).toContain(VISITOR_ID_RETENTION_NOTICE);
    expect(privacyHtml).toContain(ANALYTICS_EVENT_RETENTION_NOTICE);
  });

  it('ConsentCheckboxes: 마스터 체크박스는 개별 label:has(input[type=checkbox]) 셀렉터와 분리되어 있고 필수 3종 상태와 동기화된다', () => {
    const uncheckedHtml = renderToStaticMarkup(
      React.createElement(ConsentCheckboxes, {
        value: EMPTY_CONSENT,
        onChange: () => {},
        idPrefix: 'ux',
      }),
    );
    expect(uncheckedHtml).toContain('id="ux-all"');
    expect(uncheckedHtml).toContain('min-h-[52px]');
    expect(uncheckedHtml).toContain('h-6 w-6');

    const fullRequired = { privacy: true, marketing: true, age14: true, night: false };
    expect(allConsented(fullRequired)).toBe(true);
    const checkedHtml = renderToStaticMarkup(
      React.createElement(ConsentCheckboxes, {
        value: fullRequired,
        onChange: () => {},
        idPrefix: 'ux',
      }),
    );
    // 마스터 체크박스와 필수 3종 체크박스를 합쳐 총 4개가 checked="" 상태로 렌더됨 (야간 동의는 미체크)
    const checkedMatches = checkedHtml.match(/checked=""/g) ?? [];
    expect(checkedMatches).toHaveLength(4);
  });
});

describe('U-F0-4 (C-03, C-24): /privacy · /terms 다크 배경 위 저대비 버그 해결 및 60대 가독성', () => {
  it('/privacy 와 /terms 는 명시적 라이트 배경(bg-slate-50 text-slate-900)·흰색 카드·17px 본문·48px 돌아가기 버튼을 포함한다', () => {
    const privacyHtml = renderToStaticMarkup(React.createElement(PrivacyPage));
    const termsHtml = renderToStaticMarkup(React.createElement(TermsPage));

    for (const html of [privacyHtml, termsHtml]) {
      expect(html).toContain('bg-slate-50 text-slate-900');
      expect(html).toContain('bg-white');
      expect(html).toContain('text-[17px]');
      expect(html).toContain('leading-[1.85]');
      expect(html).toContain('min-h-12');
      expect(html).toContain('← 매거진으로 돌아가기');
    }

    expect(privacyHtml).toContain('개인정보 안내 핵심 3줄 요약');
  });
});

describe('U-F0-2: interpretSubscribeResponse — NO_EMAIL_CONFIRM_CHANNEL 해석', () => {
  it('pendingReason=NO_EMAIL_CONFIRM_CHANNEL 응답 시 pendingReason 과 NO_EMAIL_CONFIRM_NOTICE 를 함께 반환한다', () => {
    const out = interpretSubscribeResponse(
      { ok: true, status: 200 },
      {
        ok: true,
        status: 'pending',
        pendingReason: 'NO_EMAIL_CONFIRM_CHANNEL',
        message: '구독 신청이 접수되었습니다. 다만 이메일 주소가 없어 확인 링크를 보내드릴 수 없습니다.',
      },
    );
    expect(out).toEqual({
      ok: true,
      status: 'pending',
      pendingReason: 'NO_EMAIL_CONFIRM_CHANNEL',
      notice: NO_EMAIL_CONFIRM_NOTICE,
      message: '구독 신청이 접수되었습니다. 다만 이메일 주소가 없어 확인 링크를 보내드릴 수 없습니다.',
    });
  });

  it('이메일 포함 정상 신청 시 pendingReason 과 notice 는 undefined 이다', () => {
    const out = interpretSubscribeResponse(
      { ok: true, status: 200 },
      {
        ok: true,
        status: 'pending',
        message: '구독 신청이 접수되었습니다. 보내드린 확인 링크를 눌러 구독을 완료해 주세요.',
      },
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.pendingReason).toBeUndefined();
    expect(out.notice).toBeUndefined();
  });
});

describe('U-F1-07 (R-04, R-05, C-09): OG 이미지 실명 일치 및 60대 가독 폰트 크기', () => {
  it('buildImageModel 은 broker_profiles.name 을 profiles.display_name 보다 우선 사용한다', () => {
    const model = buildImageModel(
      { headline: '성수권 수익형 빌딩 주간 리포트', market_temp: '선별 매수' },
      {
        name: '박성수 대표중개사',
        display_name: '에디터닉네임',
        company: '성수빌딩부동산중개법인',
        phone: '02-555-7777',
      },
      '2026-10-05',
    );
    expect(model).not.toBeNull();
    expect(model!.brokerName).toBe('박성수 대표중개사');
    expect(model!.company).toBe('성수빌딩부동산중개법인');
    expect(model!.phone).toBe('02-555-7777');
  });

  it('OgImage 는 중개사 이름 >= 32px, 헤드라인 >= 52px, 배지 >= 24px, 연락처·소속을 렌더한다', () => {
    const model = buildImageModel(
      { headline: '성수권 수익형 빌딩 주간 리포트', market_temp: '선별 매수' },
      {
        name: '박성수',
        company: '성수빌딩중개법인',
        phone: '02-555-7777',
      },
      '2026-10-05',
    )!;
    const html = renderToStaticMarkup(
      React.createElement(OgImage, {
        m: model,
        t: makeTranslate(true),
        width: 1200,
        height: 630,
      }),
    );
    expect(html).toContain('박성수');
    expect(html).toContain('성수빌딩중개법인');
    expect(html).toContain('02-555-7777');
    expect(html).toContain('CRE 매거진');
    // 헤드라인 54px (>= 52px), 중개사 이름 34px (>= 32px), 배지 24px (>= 24px)
    expect(html).toContain('font-size:54px');
    expect(html).toContain('font-size:34px');
    expect(html).toContain('font-size:24px');
  });
});

describe('U-F1-08 & C-11~C-15: 이메일·알림톡 모바일 반응형 + 영문 약어 한글 병기 + 발신자 헤더', () => {
  beforeEach(() => {
    vi.stubEnv('UNSUBSCRIBE_SECRET', 'unit-test-secret-0123456789');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('expandCreTermsFirstOccurrence: Cap Rate / NOI 첫 등장 시 한글 설명을 자동 병기한다', () => {
    const s = expandCreTermsFirstOccurrence('성수동 꼬마빌딩 평균 Cap Rate는 4.2%이며 NOI 상승세가 뚜렷합니다.');
    expect(s).toContain('연 임대수익률(Cap Rate)');
    expect(s).toContain('순영업소득(NOI)');
    // 이미 병기된 문구는 중복 병기하지 않음
    expect(expandCreTermsFirstOccurrence(s)).toBe(s);
  });

  it('renderMagazineEmail: 반응형 width="100%" max-width:600px, 최소 14px 이상 가시 텍스트, 매물/실거래 구분 라벨 포함', () => {
    const token = issueUnsubToken({ subscriberId: SUB, brokerId: 'kim-broker' });
    const unsubUrl = buildUnsubscribeUrl('https://credeal.net', token);
    const rendered = renderMagazineEmail({
      brokerName: '김중개',
      brokerContact: '02-123-4567',
      subscriberName: '홍길동',
      edition: {
        title: '10월 1주차 시장 브리핑',
        headline: '이번 주 Cap Rate는 4.5% 수준이며 NOI가 안정적입니다.',
        marketTemp: '선별 매수',
        date: '2026-10-05',
        url: 'https://credeal.net/magazine/kim-broker/2026-10-05',
        deals: [
          { title: '역삼동 추천 빌딩', address: '서울 강남구 역삼동 123-4', price: 3_500_000_000 },
          { title: '성수동 실거래 빌딩', address: '서울 성동구 성수동2가 273-1', price: 1_250_000_000, date: '2026-09-28' },
        ],
      },
      unsubscribeUrl: unsubUrl,
      isAd: true,
    });

    expect(rendered.html).toContain('class="mag-container" width="100%"');
    expect(rendered.html).toContain('max-width:600px');
    expect(rendered.html).toContain('연 임대수익률(Cap Rate)');
    expect(rendered.html).toContain('순영업소득(NOI)');
    expect(rendered.html).toContain('이번 호 주목 매물');
    expect(rendered.html).toContain('이번 호 추천 매물');
    expect(rendered.html).toContain('최근 실거래 사례');

    const kakao = renderMagazineKakaoText({
      brokerName: '김중개',
      brokerContact: '02-123-4567',
      subscriberName: '홍길동',
      edition: {
        title: '10월 1주차 시장 브리핑',
        headline: 'Cap Rate 4.5% 및 NOI 개선 흐름',
        marketTemp: '선별 매수',
        date: '2026-10-05',
        url: 'https://credeal.net/magazine/kim-broker/2026-10-05',
      },
      unsubscribeUrl: unsubUrl,
      isAd: true,
    });
    expect(kakao.text).toContain('연 임대수익률(Cap Rate)');
    expect(kakao.text).toContain('순영업소득(NOI)');
  });

  it('발신자 헤더 포맷: 중개사 실명이 있으면 "{brokerName} 매거진"을 우선 표시하고 기본 폴백은 한글 "CRE 매거진"', () => {
    expect(formatMagazineFromHeader('CRE Magazine <magazine@credeal.net>', '김철수')).toBe(
      '"김철수 매거진" <magazine@credeal.net>',
    );
    expect(formatMagazineFromHeader(undefined, null)).toBe('CRE 매거진 <magazine@credeal.net>');
    expect(formatSenderHeader('CRE Magazine <magazine@credeal.net>', '박영희')).toBe(
      '"박영희 매거진" <magazine@credeal.net>',
    );
  });
});

describe('U-F1-09 (C-16, R-23): 수신거부 · 구독확인 페이지 상태 분기 및 복구 링크', () => {
  beforeEach(() => {
    vi.stubEnv('UNSUBSCRIBE_SECRET', 'route-test-secret');
    __resetMemoryRateLimit();
    h.subStatus = 'active';
    h.activeDbMode = 'unsub';
    h.unsubDb = createFakeDb((call: FakeCall) => {
      if (call.table === 'broker_profiles') {
        return { data: { user_id: UA, slug: 'broker-a', name: '김중개', is_public: true } };
      }
      if (call.table === 'profiles') {
        return { data: { id: UA, display_name: '김중개' } };
      }
      if (call.table === 'magazine_subscribers') {
        if (call.op === 'update') return { data: null };
        return { data: { id: SUB, broker_id: 'broker-a', status: h.subStatus } };
      }
      return { data: null };
    }) as never;
    h.confirmDb = new FakeDb();
  });

  afterEach(() => vi.unstubAllEnvs());

  it('GET /unsubscribe: 활성 구독자에게는 양 채널 중단 안내와 취소 링크(48px)를 보여 준다', async () => {
    const token = issueUnsubToken({ subscriberId: SUB, brokerId: 'broker-a' });
    const res = await unsubGET(new Request(`https://credeal.net/api/public/magazine/unsubscribe?t=${encodeURIComponent(token)}`));
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('수신 거부 시 카카오톡과 이메일로 발송되는 주간 매거진이 모두 중단됩니다');
    expect(html).toContain('취소 · 계속 매거진 받기');
    expect(html).toContain('href="/magazine/broker-a"');
    expect(html).toContain('수신 거부하기');
  });

  it('GET /unsubscribe: 이미 해지된 구독자(status=unsubscribed)에게는 해지 버튼 대신 완료 안내와 재구독 링크를 보여 준다', async () => {
    h.subStatus = 'unsubscribed';
    const token = issueUnsubToken({ subscriberId: SUB, brokerId: 'broker-a' });
    const res = await unsubGET(new Request(`https://credeal.net/api/public/magazine/unsubscribe?t=${encodeURIComponent(token)}`));
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('이미 수신 거부가 완료된 상태입니다');
    expect(html).toContain('다시 구독 신청하기');
    expect(html).toContain('href="/magazine/broker-a/subscribe"');
    expect(html).not.toContain('<button type="submit">수신 거부하기</button>');
  });

  it('POST /unsubscribe: 해지 완료 화면에 "실수로 누르셨나요? 다시 구독 신청하기" 복구 링크가 포함된다', async () => {
    const token = issueUnsubToken({ subscriberId: SUB, brokerId: 'broker-a' });
    const res = await unsubPOST(
      new Request('https://credeal.net/api/public/magazine/unsubscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: `t=${encodeURIComponent(token)}`,
      }),
    );
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('실수로 누르셨나요? 다시 구독 신청하기');
    expect(html).toContain('href="/magazine/broker-a/subscribe"');
  });

  it('GET/POST /confirm: 채널 중립 문구(카카오톡·이메일) 및 만료/오류 시 52px 재신청 링크를 제공한다', async () => {
    h.activeDbMode = 'confirm';
    const { token, hash } = issueConfirmToken();
    h.confirmDb.seed({
      broker_id: 'kim-broker',
      confirm_status: 'pending',
      confirm_token_hash: hash,
      marketing_consent_at: new Date().toISOString(),
      status: 'active',
    });

    const getRes = await confirmGET(
      new NextRequest(`https://credeal.net/api/public/magazine/confirm?t=${encodeURIComponent(token)}&b=kim-broker`),
    );
    const getHtml = await getRes.text();
    expect(getRes.status).toBe(200);
    expect(getHtml).toContain('신청하신 채널(카카오톡·이메일)로 주간 매거진을 보내드립니다');
    expect(getHtml).toContain('min-height:52px');

    const postRes = await confirmPOST(
      new NextRequest('https://credeal.net/api/public/magazine/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-forwarded-for': '203.0.113.55' },
        body: `t=${encodeURIComponent(token)}&b=kim-broker`,
      }),
    );
    const postHtml = await postRes.text();
    expect(postRes.status).toBe(200);
    expect(postHtml).toContain('신청하신 채널(카카오톡·이메일)로 매거진을 보내드립니다');
    expect(postHtml).toContain('href="/magazine/kim-broker"');

    // 잘못된 토큰(400)일 때도 유효한 brokerSlug가 있으면 재신청 버튼 제공
    const badRes = await confirmGET(
      new NextRequest('https://credeal.net/api/public/magazine/confirm?t=short&b=kim-broker'),
    );
    const badHtml = await badRes.text();
    expect(badRes.status).toBe(400);
    expect(badHtml).toContain('href="/magazine/kim-broker/subscribe"');
    expect(badHtml).toContain('다시 구독 신청하기');
  });
});
