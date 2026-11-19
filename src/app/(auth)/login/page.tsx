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
    <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm text-slate-900">
      <div className="mb-8">
        <p className="text-sm font-bold tracking-wider text-blue-700 mb-1.5">
          {COMPANY_LEGAL_CONFIG.serviceName}
        </p>
        <h1 className="text-2xl font-black text-slate-900 mb-1">로그인</h1>
        <p className="text-[15px] text-slate-600">
          {COMPANY_LEGAL_CONFIG.serviceName} 계정으로 워크스페이스에 접속하세요.
        </p>
      </div>

      <form ref={formRef} action={action} onSubmit={handleSubmit} className="space-y-5">
        <input type="hidden" name="redirectTo" value={redirectToParam} />

        {/* Callback Error */}
        {!state?.message && callbackError === 'auth_callback_failed' && (
          <div
            role="alert"
            className="p-3.5 bg-amber-50 border border-amber-300 rounded-lg text-[15px] text-amber-950"
          >
            인증 링크가 만료되었거나 유효하지 않습니다. 다시 로그인하거나 비밀번호 재설정을 요청해주세요.
          </div>
        )}

        {/* Global Error */}
        {state?.message && (
          <div
            role="alert"
            className="p-3.5 bg-red-50 border border-red-200 rounded-lg text-[15px] text-red-800"
          >
            {state.message}
          </div>
        )}

        {/* Email */}
        <div className="space-y-1.5">
          <label htmlFor="email" className="block text-[15px] font-semibold text-slate-800">
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
            className="w-full min-h-[48px] bg-slate-50 border border-slate-300 rounded-lg px-4 py-3 text-[16px] text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600 transition-colors"
          />
          {state?.errors?.email && (
            <p className="text-sm text-red-700">{state.errors.email[0]}</p>
          )}
        </div>

        {/* Password */}
        <div className="space-y-1.5">
          <label htmlFor="password" className="block text-[15px] font-semibold text-slate-800">
            비밀번호
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            placeholder="••••••••"
            className="w-full min-h-[48px] bg-slate-50 border border-slate-300 rounded-lg px-4 py-3 text-[16px] text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600 transition-colors"
          />
          {state?.errors?.password && (
            <p className="text-sm text-red-700">{state.errors.password[0]}</p>
          )}
        </div>

        {/* Remember Email & Forgot Password */}
        <div className="flex items-center justify-between -mt-1 min-h-[44px]">
          <label htmlFor="remember-email" className="flex items-center gap-2.5 cursor-pointer select-none py-1 min-h-[44px]">
            <input
              id="remember-email"
              type="checkbox"
              checked={rememberEmail}
              onChange={(e) => setRememberEmail(e.target.checked)}
              className="w-4 h-4 rounded border-slate-400 bg-white text-blue-700 focus:ring-blue-600/40 accent-blue-700"
            />
            <span className="text-sm text-slate-700">이메일 기억하기</span>
          </label>
          <Link href="/reset-password" className="inline-flex min-h-[44px] items-center text-sm text-slate-700 hover:text-blue-700 transition-colors py-1">
            비밀번호를 잊으셨나요?
          </Link>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={pending}
          className="w-full min-h-[52px] bg-blue-700 hover:bg-blue-800 text-white font-black rounded-lg px-4 py-3 text-[16px] transition-colors disabled:opacity-60 disabled:cursor-not-allowed mt-2 cursor-pointer"
        >
          {pending ? '로그인 중...' : '로그인'}
        </button>
      </form>

      <div className="mt-6 text-center space-y-3">
        <p className="text-[15px] text-slate-600">
          아직 계정이 없으신가요?{' '}
          <Link href="/signup" className="inline-flex min-h-[44px] items-center text-blue-700 hover:underline font-semibold">
            회원가입
          </Link>
        </p>
        <p className="text-sm text-slate-600">
          <Link href="/terms" className="inline-flex min-h-[44px] items-center hover:text-slate-900 underline underline-offset-4 px-1">
            서비스 이용약관
          </Link>
          {' · '}
          <Link href="/privacy" className="inline-flex min-h-[44px] items-center font-semibold hover:text-slate-900 underline underline-offset-4 px-1">
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
        <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm min-h-[380px]" />
      }
    >
      <LoginFormContent />
    </Suspense>
  );
}
