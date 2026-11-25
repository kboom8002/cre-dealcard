'use client';

import { Suspense, useActionState, useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { login } from '@/app/actions/auth';
import { COMPANY_LEGAL_CONFIG } from '@/config/company-legal';
import { consumeLogoutPurgeSignal } from '@/lib/workspace/storage-namespace';

const REMEMBER_EMAIL_KEY = 'credeal_remembered_email';

function LoginFormContent() {
  const searchParams = useSearchParams();
  const [state, action, pending] = useActionState(login, undefined);
  const [rememberEmail, setRememberEmail] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [loggedOutNotice, setLoggedOutNotice] = useState(false);

  const redirectToParam =
    searchParams?.get('redirectTo') ||
    searchParams?.get('next') ||
    (typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('redirectTo') ||
        new URLSearchParams(window.location.search).get('next') ||
        ''
      : '');

  const callbackError = searchParams?.get('error');
  const resetSuccess = searchParams?.get('reset') === 'success';
  const emailVerified = searchParams?.get('verified') === '1';

  // 마운트 시 로그아웃 퍼지 쿠키 처리 및 저장된 이메일 복원
  useEffect(() => {
    const purged = consumeLogoutPurgeSignal();
    if (purged) {
      setLoggedOutNotice(true);
    }
    try {
      const stored = localStorage.getItem(REMEMBER_EMAIL_KEY);
      if (stored) {
        setEmail(stored);
        setRememberEmail(true);
      }
    } catch {
      // Ignore storage read failures
    }
  }, []);

  // form 제출 시 이메일 기억 처리 (server action 전 실행)
  const handleSubmit = () => {
    const trimmed = email.trim();
    try {
      if (rememberEmail && trimmed) {
        localStorage.setItem(REMEMBER_EMAIL_KEY, trimmed);
      } else {
        localStorage.removeItem(REMEMBER_EMAIL_KEY);
      }
    } catch {
      // Ignore storage write failures
    }
  };

  const handlePasswordKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    setCapsLockOn(Boolean(e.getModifierState?.('CapsLock')));
  };

  const signupHref = redirectToParam
    ? `/signup?redirectTo=${encodeURIComponent(redirectToParam)}`
    : '/signup';

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm text-slate-900">
      <div className="mb-8">
        <p className="text-sm font-bold tracking-wider text-blue-700 mb-1.5">
          {COMPANY_LEGAL_CONFIG.serviceName}
        </p>
        <h1 className="text-2xl font-black text-slate-900 mb-1">로그인</h1>
        <p className="text-[15px] text-slate-600">
          공인중개사 계정으로 4대 핵심 작업공간에 접속하세요.
        </p>
      </div>

      <form action={action} onSubmit={handleSubmit} className="space-y-5">
        <input type="hidden" name="redirectTo" value={redirectToParam} />

        {/* Status Notices */}
        {!state?.message && loggedOutNotice && (
          <div
            role="status"
            data-testid="login-logged-out-banner"
            className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg text-[15px] text-emerald-900"
          >
            안전하게 로그아웃되었으며 공용 PC 보호를 위해 임시 작업 기록을 비웠습니다.
          </div>
        )}

        {!state?.message && resetSuccess && (
          <div
            role="status"
            className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg text-[15px] text-emerald-900"
          >
            새 비밀번호가 설정되었습니다. 변경된 비밀번호로 로그인해 주세요.
          </div>
        )}

        {!state?.message && emailVerified && (
          <div
            role="status"
            className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg text-[15px] text-emerald-900"
          >
            이메일 인증이 완료되었습니다. 이제 로그인하여 바로 시작하실 수 있습니다.
          </div>
        )}

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
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.co.kr"
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
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handlePasswordKey}
              onKeyUp={handlePasswordKey}
              onBlur={() => setCapsLockOn(false)}
              autoComplete="current-password"
              required
              placeholder="••••••••"
              className="w-full min-h-[48px] bg-slate-50 border border-slate-300 rounded-lg pl-4 pr-12 py-3 text-[16px] text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600 transition-colors"
            />
            <button
              type="button"
              data-testid="login-password-toggle"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
              aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
            >
              {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
            </button>
          </div>
          {capsLockOn && (
            <p
              data-testid="login-capslock-warning"
              className="text-sm font-semibold text-amber-800"
            >
              Caps Lock이 켜져 있습니다. 영문 대소문자를 확인해 주세요.
            </p>
          )}
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
          <Link href={signupHref} className="inline-flex min-h-[44px] items-center text-blue-700 hover:underline font-semibold">
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
