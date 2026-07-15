'use client';

import { useActionState, useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { login } from '@/app/actions/auth';

const REMEMBER_EMAIL_KEY = 'credeal_remembered_email';

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, undefined);
  const [rememberEmail, setRememberEmail] = useState(false);
  const [savedEmail, setSavedEmail] = useState('');
  const formRef = useRef<HTMLFormElement>(null);

  // 마운트 시 저장된 이메일 복원
  useEffect(() => {
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
        <h1 className="text-2xl font-black text-white mb-1">로그인</h1>
        <p className="text-sm text-neutral-400">계속하려면 계정으로 로그인하세요.</p>
      </div>

      <form ref={formRef} action={action} onSubmit={handleSubmit} className="space-y-5">
        {/* Global Error */}
        {state?.message && (
          <div className="p-3 bg-red-900/30 border border-red-800/50 rounded-lg text-sm text-red-300">
            {state.message}
          </div>
        )}

        {/* Email */}
        <div className="space-y-1.5">
          <label htmlFor="email" className="block text-sm font-semibold text-neutral-300">
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
            className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-4 py-3 text-sm text-white placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-colors"
          />
          {state?.errors?.email && (
            <p className="text-xs text-red-400">{state.errors.email[0]}</p>
          )}
        </div>

        {/* Password */}
        <div className="space-y-1.5">
          <label htmlFor="password" className="block text-sm font-semibold text-neutral-300">
            비밀번호
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            placeholder="••••••••"
            className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-4 py-3 text-sm text-white placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-colors"
          />
          {state?.errors?.password && (
            <p className="text-xs text-red-400">{state.errors.password[0]}</p>
          )}
        </div>

        {/* Remember Email & Forgot Password */}
        <div className="flex items-center justify-between -mt-2">
          <label htmlFor="remember-email" className="flex items-center gap-2 cursor-pointer select-none">
            <input
              id="remember-email"
              type="checkbox"
              checked={rememberEmail}
              onChange={(e) => setRememberEmail(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-neutral-600 bg-neutral-950 text-primary focus:ring-primary/50 accent-primary"
            />
            <span className="text-xs text-neutral-500">이메일 기억하기</span>
          </label>
          <Link href="/reset-password" className="text-xs text-neutral-500 hover:text-primary transition-colors">
            비밀번호를 잊으셨나요?
          </Link>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={pending}
          className="w-full bg-primary hover:bg-primary/90 text-black font-black rounded-lg px-4 py-3 text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed mt-2"
        >
          {pending ? '로그인 중...' : '로그인'}
        </button>
      </form>

      <div className="mt-6 text-center">
        <p className="text-sm text-neutral-500">
          아직 계정이 없으신가요?{' '}
          <Link href="/signup" className="text-primary hover:underline font-semibold">
            회원가입
          </Link>
        </p>
      </div>
    </div>
  );
}
