'use client';

import { Suspense, useActionState, useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { login } from '@/app/actions/auth';
import { COMPANY_LEGAL_CONFIG } from '@/config/company-legal';
import { consumeLogoutPurgeSignal } from '@/lib/workspace/storage-namespace';

const REMEMBER_EMAIL_KEY = 'credeal_remembered_email';

function LoginFormContent() {
  const searchParams = useSearchParams();
  const [state, action, pending] = useActionState(login, undefined);
  const [rememberEmail, setRememberEmail] = useState(false);
  const [savedEmail, setSavedEmail] = useState('');
  const formRef = useRef<HTMLFormElement>(null);

  const redirectToParam =
    searchParams?.get('redirectTo') ||
    searchParams?.get('next') ||
    (typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('redirectTo') ||
        new URLSearchParams(window.location.search).get('next') ||
        ''
      : '');

  const callbackError = searchParams?.get('error');

  // 마운트 시 로그아웃 퍼지 쿠키 처리 및 저장된 이메일 복원
  useEffect(() => {
    consumeLogoutPurgeSignal();
    const stored = localStorage.getItem(REMEMBER_EMAIL_KEY);
    if (stored) {
      setSavedEmail(stored);
      setRememberEmail(true);
    }
  }, []);

  // form 제출 시 이메일 기억 처리 (server action 전 실행)
  const handleSubmit = () => {
    const emailInput = formRef.current?.querySelector<HTMLInputElement>('input[name="email"]');
    const email = emailInput?.value || '';
    if (rememberEmail && email) {
      localStorage.setItem(REMEMBER_EMAIL_KEY, email);
    } else {
      localStorage.removeItem(REMEMBER_EMAIL_KEY);
    }
  };

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8 shadow-2xl">
      <div className="mb-8">
        <p className="text-xs font-bold tracking-wider text-primary mb-1.5">
          {COMPANY_LEGAL_CONFIG.serviceName}
        </p>
        <h1 className="text-2xl font-black text-white mb-1">로그인</h1>
        <p className="text-[15px] text-neutral-400">
          {COMPANY_LEGAL_CONFIG.serviceName} 계정으로 워크스페이스에 접속하세요.
        </p>
      </div>

      <form ref={formRef} action={action} onSubmit={handleSubmit} className="space-y-5">
        <input type="hidden" name="redirectTo" value={redirectToParam} />

        {/* Callback Error */}
        {!state?.message && callbackError === 'auth_callback_failed' && (
          <div
            role="alert"
            className="p-3.5 bg-amber-900/30 border border-amber-700/50 rounded-lg text-[15px] text-amber-200"
          >
            인증 링크가 만료되었거나 유효하지 않습니다. 다시 로그인하거나 비밀번호 재설정을 요청해주세요.
          </div>
        )}

        {/* Global Error */}
        {state?.message && (
          <div
            role="alert"
            className="p-3.5 bg-red-900/30 border border-red-800/50 rounded-lg text-[15px] text-red-300"
          >
            {state.message}
          </div>
        )}

        {/* Email */}
        <div className="space-y-1.5">
          <label htmlFor="email" className="block text-[15px] font-semibold text-neutral-200">
            이메일
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            defaultValue={savedEmail}
            placeholder="you@example.com"
            className="w-full min-h-[48px] bg-neutral-950 border border-neutral-700 rounded-lg px-4 py-3 text-[16px] text-white placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-colors"
          />
          {state?.errors?.email && (
            <p className="text-sm text-red-400">{state.errors.email[0]}</p>
          )}
        </div>

        {/* Password */}
        <div className="space-y-1.5">
          <label htmlFor="password" className="block text-[15px] font-semibold text-neutral-200">
            비밀번호
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            placeholder="••••••••"
            className="w-full min-h-[48px] bg-neutral-950 border border-neutral-700 rounded-lg px-4 py-3 text-[16px] text-white placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-colors"
          />
          {state?.errors?.password && (
            <p className="text-sm text-red-400">{state.errors.password[0]}</p>
          )}
        </div>

        {/* Remember Email & Forgot Password */}
        <div className="flex items-center justify-between -mt-1 min-h-[44px]">
          <label htmlFor="remember-email" className="flex items-center gap-2.5 cursor-pointer select-none py-1">
            <input
              id="remember-email"
              type="checkbox"
              checked={rememberEmail}
              onChange={(e) => setRememberEmail(e.target.checked)}
              className="w-4 h-4 rounded border-neutral-600 bg-neutral-950 text-primary focus:ring-primary/50 accent-primary"
            />
            <span className="text-[14px] text-neutral-400">이메일 기억하기</span>
          </label>
          <Link href="/reset-password" className="text-[14px] text-neutral-400 hover:text-primary transition-colors py-1">
            비밀번호를 잊으셨나요?
          </Link>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={pending}
          className="w-full min-h-[52px] bg-primary hover:bg-primary/90 text-primary-foreground font-black rounded-lg px-4 py-3 text-[16px] transition-colors disabled:opacity-60 disabled:cursor-not-allowed mt-2"
        >
          {pending ? '로그인 중...' : '로그인'}
        </button>
      </form>

      <div className="mt-6 text-center space-y-3">
        <p className="text-[15px] text-neutral-400">
          아직 계정이 없으신가요?{' '}
          <Link href="/signup" className="text-primary hover:underline font-semibold">
            회원가입
          </Link>
        </p>
        <p className="text-xs text-neutral-500">
          <Link href="/terms" className="hover:text-neutral-300 underline underline-offset-4">
            서비스 이용약관
          </Link>
          {' · '}
          <Link href="/privacy" className="font-semibold hover:text-neutral-300 underline underline-offset-4">
            개인정보처리방침
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8 shadow-2xl min-h-[380px]" />
      }
    >
      <LoginFormContent />
    </Suspense>
  );
}
