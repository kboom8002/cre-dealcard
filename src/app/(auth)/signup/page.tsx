'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { signup } from '@/app/actions/auth';

export default function SignupPage() {
  const [state, action, pending] = useActionState(signup, undefined);

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8 shadow-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-black text-white mb-1">회원가입</h1>
        <p className="text-sm text-neutral-400">JS 딜카드 계정을 만들어 시작하세요.</p>
      </div>

      <form action={action} className="space-y-5">
        {/* Global Error */}
        {state?.message && (
          <div className="p-3 bg-red-900/30 border border-red-800/50 rounded-lg text-sm text-red-300">
            {state.message}
          </div>
        )}

        {/* Display Name */}
        <div className="space-y-1.5">
          <label htmlFor="displayName" className="block text-sm font-semibold text-neutral-300">
            이름 / 닉네임
          </label>
          <input
            id="displayName"
            name="displayName"
            type="text"
            autoComplete="name"
            required
            placeholder="홍길동"
            className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-4 py-3 text-sm text-white placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-colors"
          />
          {state?.errors?.displayName && (
            <p className="text-xs text-red-400">{state.errors.displayName[0]}</p>
          )}
        </div>

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
            autoComplete="new-password"
            required
            placeholder="8자 이상"
            className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-4 py-3 text-sm text-white placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-colors"
          />
          {state?.errors?.password && (
            <p className="text-xs text-red-400">{state.errors.password[0]}</p>
          )}
        </div>

        {/* Role Selection */}
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-neutral-300">계정 유형</label>
          <div className="grid grid-cols-2 gap-3">
            <label className="relative flex cursor-pointer">
              <input
                type="radio"
                name="role"
                value="public_user"
                defaultChecked
                className="peer sr-only"
              />
              <div className="w-full text-center p-3 bg-neutral-950 border border-neutral-700 rounded-lg text-sm font-medium text-neutral-400 peer-checked:border-primary peer-checked:text-primary peer-checked:bg-primary/5 transition-all">
                <span className="block text-xl mb-1">👤</span>
                일반 사용자
              </div>
            </label>
            <label className="relative flex cursor-pointer">
              <input
                type="radio"
                name="role"
                value="broker"
                className="peer sr-only"
              />
              <div className="w-full text-center p-3 bg-neutral-950 border border-neutral-700 rounded-lg text-sm font-medium text-neutral-400 peer-checked:border-primary peer-checked:text-primary peer-checked:bg-primary/5 transition-all">
                <span className="block text-xl mb-1">🏢</span>
                공인중개사
              </div>
            </label>
          </div>
          {state?.errors?.role && (
            <p className="text-xs text-red-400">{state.errors.role[0]}</p>
          )}
        </div>

        {/* Terms Notice */}
        <p className="text-xs text-neutral-600 leading-relaxed">
          회원가입 시 JS 딜카드의 이용약관 및 개인정보처리방침에 동의하게 됩니다.
        </p>

        {/* Submit */}
        <button
          type="submit"
          disabled={pending}
          className="w-full bg-primary hover:bg-primary/90 text-black font-black rounded-lg px-4 py-3 text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {pending ? '계정 생성 중...' : '가입하기'}
        </button>
      </form>

      <div className="mt-6 text-center">
        <p className="text-sm text-neutral-500">
          이미 계정이 있으신가요?{' '}
          <Link href="/login" className="text-primary hover:underline font-semibold">
            로그인
          </Link>
        </p>
      </div>
    </div>
  );
}
