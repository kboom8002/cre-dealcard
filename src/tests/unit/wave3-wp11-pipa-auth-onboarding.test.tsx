// @vitest-environment jsdom
/**
 * @file src/tests/unit/wave3-wp11-pipa-auth-onboarding.test.tsx
 * @description Wave 3 — WP-11 regression & unit suite:
 *   (a) PIPA separated consent validation in signup() & SignupPage UI (never pre-checked, stores consent_version)
 *   (b) login() safe internal redirectTo="/broker/w/im" & open-redirect block ("//evil.com", "/\\evil.com", "https://evil.com") -> "/broker"
 *   (c) logout() preserves WP-04 credeal_purge_storage=1 cookie
 *   (d) /terms & /privacy comprehensive B2B SaaS + 3 data subject groups + PIPA Art. 26/28-8 sub-processors + preserved magazine 3-line summary
 *   (e) /auth/callback PKCE code & OTP recovery exchange, ResetPasswordPage/UpdatePasswordPage PKCE flow, /broker/settings redirect, LandingPageClient 4-Door alignment
 */

import React, { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot, type Root } from 'react-dom/client';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockReplace: vi.fn(),
  mockRedirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  mockCookieSet: vi.fn(),
  mockSignUp: vi.fn(),
  mockSignInWithPassword: vi.fn(),
  mockSignOut: vi.fn(),
  mockExchangeCodeServer: vi.fn(),
  mockVerifyOtpServer: vi.fn(),
  mockResetPasswordForEmail: vi.fn(),
  mockExchangeCodeClient: vi.fn(),
  mockUpdateUserClient: vi.fn(),
  mockServiceUpsert: vi.fn(async () => ({ error: null })),
  searchParamsStr: '',
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: h.mockPush,
    replace: h.mockReplace,
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => '/login',
  useSearchParams: () => new URLSearchParams(h.searchParamsStr),
  redirect: (url: string) => h.mockRedirect(url),
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    set: h.mockCookieSet,
    get: vi.fn(),
    delete: vi.fn(),
    getAll: () => [],
  }),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: {
      signUp: h.mockSignUp,
      signInWithPassword: h.mockSignInWithPassword,
      signOut: h.mockSignOut,
      exchangeCodeForSession: h.mockExchangeCodeServer,
      verifyOtp: h.mockVerifyOtpServer,
    },
  }),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: () => ({
      upsert: h.mockServiceUpsert,
    }),
  }),
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      resetPasswordForEmail: h.mockResetPasswordForEmail,
      exchangeCodeForSession: h.mockExchangeCodeClient,
      updateUser: h.mockUpdateUserClient,
      getUser: async () => ({ data: { user: null }, error: null }),
    },
  }),
}));

import { COMPANY_LEGAL_CONFIG } from '@/config/company-legal';
import { PURGE_STORAGE_COOKIE_NAME } from '@/lib/workspace/storage-namespace';
import {
  ANALYTICS_EVENT_RETENTION_NOTICE,
  CONFIRM_TTL_DAYS_TEXT,
  RECONFIRM_YEARS_TEXT,
  SUBSCRIBER_RETENTION_NOTICE,
  VISITOR_ID_RETENTION_NOTICE,
} from '@/lib/magazine/legal-constants';
import { signup, login, logout } from '@/app/actions/auth';
import SignupPage from '@/app/(auth)/signup/page';
import LoginPage from '@/app/(auth)/login/page';
import ResetPasswordPage from '@/app/(auth)/reset-password/page';
import UpdatePasswordPage from '@/app/(auth)/update-password/page';
import { GET as authCallbackGET } from '@/app/auth/callback/route';
import BrokerSettingsPage from '@/app/(broker)/broker/settings/page';
import TermsPage from '@/app/(public)/terms/page';
import PrivacyPage from '@/app/(public)/privacy/page';
import { LandingPageClient } from '@/components/landing/LandingPageClient';

function buildFormData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) {
    fd.set(k, v);
  }
  return fd;
}

describe('Wave 3 — WP-11: PIPA Consent, Legal Pages, PKCE Auth Recovery & Brand Alignment', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    h.mockPush.mockReset();
    h.mockReplace.mockReset();
    h.mockRedirect.mockClear();
    h.mockCookieSet.mockReset();
    h.mockSignUp.mockReset();
    h.mockSignInWithPassword.mockReset();
    h.mockSignOut.mockReset();
    h.mockExchangeCodeServer.mockReset();
    h.mockVerifyOtpServer.mockReset();
    h.mockResetPasswordForEmail.mockReset();
    h.mockExchangeCodeClient.mockReset();
    h.mockUpdateUserClient.mockReset();
    h.mockServiceUpsert.mockClear();
    h.searchParamsStr = '';

    h.mockSignUp.mockResolvedValue({
      data: { user: { id: 'user-new-broker-1' } },
      error: null,
    });
    h.mockSignInWithPassword.mockResolvedValue({
      data: { user: { id: 'user-broker-1' } },
      error: null,
    });
    h.mockSignOut.mockResolvedValue({ error: null });
    h.mockExchangeCodeServer.mockResolvedValue({ data: { session: {} }, error: null });
    h.mockVerifyOtpServer.mockResolvedValue({ data: { session: {} }, error: null });
    h.mockResetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    h.mockExchangeCodeClient.mockResolvedValue({ data: { session: {} }, error: null });
    h.mockUpdateUserClient.mockResolvedValue({ data: { user: {} }, error: null });

    window.localStorage.clear();
    window.sessionStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllEnvs();
  });

  describe('(a) PIPA Separated Consent in signup() & SignupPage UI', () => {
    it('rejects signup() when agreeTerms or agreePrivacy is missing without calling Supabase signUp', async () => {
      // Missing both required checkboxes
      const resMissingBoth = await signup(
        undefined,
        buildFormData({
          displayName: '김중개',
          email: 'broker@credeal.kr',
          password: 'Password123!',
          agreeMarketing: 'on',
        }),
      );
      expect(h.mockSignUp).not.toHaveBeenCalled();
      expect(resMissingBoth?.errors?.agreeTerms?.[0]).toContain('이용약관');
      expect(resMissingBoth?.errors?.agreePrivacy?.[0]).toContain('개인정보');
      expect(resMissingBoth?.message).toContain('동의');

      // Missing agreePrivacy only
      const resMissingPrivacy = await signup(
        undefined,
        buildFormData({
          displayName: '김중개',
          email: 'broker@credeal.kr',
          password: 'Password123!',
          agreeTerms: 'on',
        }),
      );
      expect(h.mockSignUp).not.toHaveBeenCalled();
      expect(resMissingPrivacy?.errors?.agreeTerms).toBeUndefined();
      expect(resMissingPrivacy?.errors?.agreePrivacy?.[0]).toContain('개인정보');

      // Missing agreeTerms only
      const resMissingTerms = await signup(
        undefined,
        buildFormData({
          displayName: '김중개',
          email: 'broker@credeal.kr',
          password: 'Password123!',
          agreePrivacy: 'on',
        }),
      );
      expect(h.mockSignUp).not.toHaveBeenCalled();
      expect(resMissingTerms?.errors?.agreeTerms?.[0]).toContain('이용약관');
      expect(resMissingTerms?.errors?.agreePrivacy).toBeUndefined();
    });

    it('succeeds when both agreeTerms and agreePrivacy are checked and records consent_version & marketing_opt_in', async () => {
      await expect(
        signup(
          undefined,
          buildFormData({
            displayName: '박대표',
            email: 'park@credeal.kr',
            password: 'Password123!',
            agreeTerms: 'on',
            agreePrivacy: 'on',
          }),
        ),
      ).rejects.toThrow('NEXT_REDIRECT:/broker');

      expect(h.mockSignUp).toHaveBeenCalledTimes(1);
      const callArg = h.mockSignUp.mock.calls[0][0];
      expect(callArg.email).toBe('park@credeal.kr');
      expect(callArg.options.data).toMatchObject({
        display_name: '박대표',
        consent_version: COMPANY_LEGAL_CONFIG.consentVersion,
        marketing_opt_in: false,
      });
      expect(typeof callArg.options.data.terms_agreed_at).toBe('string');
      expect(typeof callArg.options.data.privacy_agreed_at).toBe('string');

      // Also verify marketing_opt_in: true when agreeMarketing === 'on'
      h.mockSignUp.mockClear();
      await expect(
        signup(
          undefined,
          buildFormData({
            displayName: '이대표',
            email: 'lee@credeal.kr',
            password: 'Password123!',
            agreeTerms: 'on',
            agreePrivacy: 'on',
            agreeMarketing: 'on',
          }),
        ),
      ).rejects.toThrow('NEXT_REDIRECT:/broker');

      expect(h.mockSignUp.mock.calls[0][0].options.data).toMatchObject({
        consent_version: 'v2.0',
        marketing_opt_in: true,
      });
    });

    it('renders SignupPage with 크리딜 (CREDEAL) brand, 16px inputs, and 3 separated unchecked PIPA checkboxes', async () => {
      await act(async () => {
        root.render(React.createElement(SignupPage));
      });

      const text = container.textContent || '';
      expect(text).toContain('크리딜 (CREDEAL)');
      expect(text).not.toContain('JS 딜카드');
      expect(text).toContain('[필수] 만 14세 이상이며 서비스 이용약관에 동의합니다');
      expect(text).toContain('[필수] 개인정보 수집·이용에 동의합니다');
      expect(text).toContain('[선택] 서비스 업데이트 및 프로모션 안내 수신에 동의합니다');

      const termsCb = container.querySelector('input[name="agreeTerms"]') as HTMLInputElement;
      const privacyCb = container.querySelector('input[name="agreePrivacy"]') as HTMLInputElement;
      const marketingCb = container.querySelector('input[name="agreeMarketing"]') as HTMLInputElement;
      expect(termsCb).toBeTruthy();
      expect(privacyCb).toBeTruthy();
      expect(marketingCb).toBeTruthy();
      expect(termsCb.checked).toBe(false);
      expect(privacyCb.checked).toBe(false);
      expect(marketingCb.checked).toBe(false);

      const emailInput = container.querySelector('input[name="email"]') as HTMLInputElement;
      expect(emailInput.className).toContain('text-[16px]');
      expect(emailInput.className).toContain('min-h-[48px]');

      const links = Array.from(container.querySelectorAll('a')).map((a) => ({
        href: a.getAttribute('href'),
        target: a.getAttribute('target'),
      }));
      expect(links).toContainEqual({ href: '/terms', target: '_blank' });
      expect(links).toContainEqual({ href: '/privacy', target: '_blank' });
    });
  });

  describe('(b) login() Internal Redirect & Open-Redirect Guard', () => {
    it('honors safe internal redirectTo="/broker/w/im"', async () => {
      await expect(
        login(
          undefined,
          buildFormData({
            email: 'broker@credeal.kr',
            password: 'Password123!',
            redirectTo: '/broker/w/im',
          }),
        ),
      ).rejects.toThrow('NEXT_REDIRECT:/broker/w/im');
    });

    it('blocks open-redirect payloads ("//evil.com", "/\\\\evil.com", "https://evil.com") and falls back to /broker', async () => {
      for (const malicious of ['//evil.com', '/\\evil.com', 'https://evil.com', 'javascript:alert(1)']) {
        await expect(
          login(
            undefined,
            buildFormData({
              email: 'broker@credeal.kr',
              password: 'Password123!',
              redirectTo: malicious,
            }),
          ),
        ).rejects.toThrow('NEXT_REDIRECT:/broker');
      }
    });

    it('passes ?redirectTo= search param into hidden form input on LoginPage with 16px inputs', async () => {
      h.searchParamsStr = 'redirectTo=%2Fbroker%2Fw%2Fdealcards';
      await act(async () => {
        root.render(React.createElement(LoginPage));
      });

      const hiddenRedirect = container.querySelector(
        'input[type="hidden"][name="redirectTo"]',
      ) as HTMLInputElement;
      expect(hiddenRedirect).toBeTruthy();
      expect(hiddenRedirect.value).toBe('/broker/w/dealcards');
      expect(container.textContent).toContain('크리딜 (CREDEAL)');
      expect(container.textContent).not.toContain('JS 딜카드');

      const emailInput = container.querySelector('input[name="email"]') as HTMLInputElement;
      expect(emailInput.className).toContain('text-[16px]');
      expect(emailInput.className).toContain('min-h-[48px]');
    });
  });

  describe('(c) logout() Preserves WP-04 Storage Purge Cookie', () => {
    it('sets credeal_purge_storage=1 cookie and redirects to /login', async () => {
      await expect(logout()).rejects.toThrow('NEXT_REDIRECT:/login');
      expect(h.mockSignOut).toHaveBeenCalledTimes(1);
      expect(h.mockCookieSet).toHaveBeenCalledWith(
        PURGE_STORAGE_COOKIE_NAME,
        '1',
        expect.objectContaining({
          path: '/',
          maxAge: 60,
          httpOnly: false,
          sameSite: 'lax',
        }),
      );
    });
  });

  describe('(d) /terms & /privacy B2B SaaS + PIPA Sub-Processor Disclosures & Magazine SSOT Preservation', () => {
    it('renders comprehensive B2B SaaS articles in /terms while preserving magazine confirmation/reconfirmation clauses', () => {
      const termsHtml = renderToStaticMarkup(React.createElement(TermsPage));

      // B2B SaaS articles
      expect(termsHtml).toContain('통합 서비스 이용약관');
      expect(termsHtml).toContain('공인중개사법');
      expect(termsHtml).toContain('보조적 초안');
      expect(termsHtml).toContain('건축물대장');
      expect(termsHtml).toContain('기밀유지(NDA)');
      expect(termsHtml).toContain('얼리액세스');
      expect(termsHtml).toContain('최소 30일 전');

      // Preserved magazine constants & back navigation
      expect(termsHtml).toContain(CONFIRM_TTL_DAYS_TEXT);
      expect(termsHtml).toContain(RECONFIRM_YEARS_TEXT);
      expect(termsHtml).toContain('← 매거진으로 돌아가기');
    });

    it('renders 3 data subject groups, 4 sub-processors, and privacy officer in /privacy while preserving 핵심 3줄 요약', () => {
      const privacyHtml = renderToStaticMarkup(React.createElement(PrivacyPage));

      // Preserved magazine 3-line summary & retention notices
      expect(privacyHtml).toContain('개인정보 안내 핵심 3줄 요약');
      expect(privacyHtml).toContain(SUBSCRIBER_RETENTION_NOTICE);
      expect(privacyHtml).toContain(VISITOR_ID_RETENTION_NOTICE);
      expect(privacyHtml).toContain(ANALYTICS_EVENT_RETENTION_NOTICE);

      // 3 data subject groups
      expect(privacyHtml).toContain('중개사 회원');
      expect(privacyHtml).toContain('딜카드 / IM 열람·문의 고객');
      expect(privacyHtml).toContain('매거진(뉴스레터) 구독자');

      // 4 required sub-processors (PIPA Art. 26 & 28-8)
      expect(privacyHtml).toContain('Supabase Inc.');
      expect(privacyHtml).toContain('Vercel Inc.');
      expect(privacyHtml).toContain('OpenAI, L.L.C.');
      expect(privacyHtml).toContain('모델 학습 미사용');
      expect(privacyHtml).toContain('Resend, Inc.');

      // Privacy officer & contact
      expect(privacyHtml).toContain(COMPANY_LEGAL_CONFIG.privacyOfficerName);
      expect(privacyHtml).toContain(COMPANY_LEGAL_CONFIG.privacyContactEmail);
    });
  });

  describe('(e) PKCE Password Recovery (/auth/callback, /reset-password, /update-password), /broker/settings & Landing', () => {
    it('exchanges PKCE code in /auth/callback and redirects safely to /update-password while blocking open redirects', async () => {
      const resSafe = await authCallbackGET(
        new NextRequest('https://credeal.net/auth/callback?code=pkce-code-123&next=/update-password'),
      );
      expect(h.mockExchangeCodeServer).toHaveBeenCalledWith('pkce-code-123');
      expect(resSafe.status).toBe(307);
      expect(resSafe.headers.get('location')).toBe('https://credeal.net/update-password');

      // Open-redirect attempt must fall back to /broker
      const resEvil = await authCallbackGET(
        new NextRequest('https://credeal.net/auth/callback?code=pkce-code-456&next=//evil.com'),
      );
      expect(resEvil.headers.get('location')).toBe('https://credeal.net/broker');

      // OTP token_hash + type=recovery support
      const resOtp = await authCallbackGET(
        new NextRequest('https://credeal.net/auth/callback?token_hash=th-999&type=recovery'),
      );
      expect(h.mockVerifyOtpServer).toHaveBeenCalledWith({
        token_hash: 'th-999',
        type: 'recovery',
      });
      expect(resOtp.headers.get('location')).toBe('https://credeal.net/update-password');

      // Expired code on recovery redirects to /update-password?error=expired_link
      h.mockExchangeCodeServer.mockResolvedValueOnce({
        data: { session: null },
        error: { message: 'Flow state expired' },
      });
      const resExpired = await authCallbackGET(
        new NextRequest('https://credeal.net/auth/callback?code=expired&next=/update-password'),
      );
      expect(resExpired.headers.get('location')).toBe(
        'https://credeal.net/update-password?error=expired_link',
      );
    });

    it('uses /auth/callback?next=/update-password in ResetPasswordPage and enforces 8+ chars + expired link guidance in UpdatePasswordPage', async () => {
      await act(async () => {
        root.render(React.createElement(ResetPasswordPage));
      });
      const emailInput = container.querySelector('input#email') as HTMLInputElement;
      const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      await act(async () => {
        proto?.set?.call(emailInput, 'broker@credeal.kr');
        emailInput.dispatchEvent(new Event('input', { bubbles: true }));
        emailInput.dispatchEvent(new Event('change', { bubbles: true }));
      });
      const form = container.querySelector('form')!;
      await act(async () => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });

      expect(h.mockResetPasswordForEmail).toHaveBeenCalledWith(
        'broker@credeal.kr',
        expect.objectContaining({
          redirectTo: `${window.location.origin}/auth/callback?next=/update-password`,
        }),
      );

      // Unmount and mount UpdatePasswordPage with expired_link query
      act(() => {
        root.unmount();
      });
      root = createRoot(container);
      h.searchParamsStr = 'error=expired_link';
      await act(async () => {
        root.render(React.createElement(UpdatePasswordPage));
      });

      expect(container.textContent).toContain('만료되었거나');
      const recoveryLink = container.querySelector('a[href="/reset-password"]');
      expect(recoveryLink).toBeTruthy();
    });

    it('redirects /broker/settings cleanly to /broker/profile and aligns LandingPageClient with 4-Door Workspace', async () => {
      expect(() => BrokerSettingsPage()).toThrow('NEXT_REDIRECT:/broker/profile');

      await act(async () => {
        root.render(React.createElement(LandingPageClient));
      });
      const landingText = container.textContent || '';
      expect(landingText).toContain('크리딜 (CREDEAL)');
      expect(landingText).toContain('매물 딜카드');
      expect(landingText).toContain('10섹션 모바일/PPTX IM');
      expect(landingText).toContain('주간/월간 빌딩 뉴스레터');
      expect(landingText).toContain('고객 소통함');

      const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'));
      expect(hrefs).toContain('/terms');
      expect(hrefs).toContain('/privacy');
      expect(hrefs).not.toContain('/explore');
      expect(hrefs).not.toContain('/pulse');
    });
  });
});
