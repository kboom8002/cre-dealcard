'use client';

import { useState, useActionState } from 'react';
import Link from 'next/link';
import { signup } from '@/app/actions/auth';
import { Eye, EyeOff, Check, X, ShieldCheck } from 'lucide-react';

export default function SignupPage() {
  const [state, action, pending] = useActionState(signup, undefined);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // ── Password Strength Calculation ─────────────────────────────────────────
  const hasMinLength = password.length >= 8;
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>_\-+=~`[\]\\/]/.test(password);

  const passedRules = [hasMinLength, hasLetter, hasNumber, hasSpecial].filter(Boolean).length;
  
  let strengthScore = 0;
  if (password.length > 0) {
    if (!hasMinLength) {
      strengthScore = 1;
    } else {
      strengthScore = passedRules; // 2, 3, or 4
    }
  }

  const strengthConfig = [
    { label: '', color: 'bg-neutral-800', textColor: 'text-neutral-500' },
    { label: '취약 (8자 이상 필요)', color: 'bg-red-500', textColor: 'text-red-400' },
    { label: '보통 (영문/숫자 조합 권장)', color: 'bg-amber-500', textColor: 'text-amber-400' },
    { label: '안전', color: 'bg-emerald-500', textColor: 'text-emerald-400' },
    { label: '매우 강력', color: 'bg-primary', textColor: 'text-primary font-bold' },
  ][strengthScore];

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

        {/* Password with Strength Indicator */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="block text-sm font-semibold text-neutral-300">
              비밀번호
            </label>
            {password.length > 0 && (
              <span className={`text-xs ${strengthConfig.textColor} transition-colors`}>
                {strengthConfig.label}
              </span>
            )}
          </div>

          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              placeholder="8자 이상 입력"
              className="w-full bg-neutral-950 border border-neutral-700 rounded-lg pl-4 pr-11 py-3 text-sm text-white placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              tabIndex={-1}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300 transition-colors p-1"
              aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {/* Password Strength Meter (4 Bars) */}
          {password.length > 0 && (
            <div className="space-y-2 pt-1">
              <div className="grid grid-cols-4 gap-1.5 h-1.5">
                {[1, 2, 3, 4].map((step) => (
                  <div
                    key={step}
                    className={`h-full rounded-full transition-all duration-300 ${
                      step <= strengthScore ? strengthConfig.color : 'bg-neutral-800'
                    }`}
                  />
                ))}
              </div>

              {/* Real-time Requirement Checklist */}
              <div className="grid grid-cols-2 gap-x-2 gap-y-1 pt-1 text-[11px]">
                <div className={`flex items-center gap-1.5 transition-colors ${hasMinLength ? 'text-emerald-400 font-medium' : 'text-neutral-500'}`}>
                  {hasMinLength ? <Check size={12} className="shrink-0" /> : <X size={12} className="shrink-0 opacity-40" />}
                  <span>8자 이상</span>
                </div>
                <div className={`flex items-center gap-1.5 transition-colors ${hasLetter ? 'text-emerald-400 font-medium' : 'text-neutral-500'}`}>
                  {hasLetter ? <Check size={12} className="shrink-0" /> : <X size={12} className="shrink-0 opacity-40" />}
                  <span>영문자 포함</span>
                </div>
                <div className={`flex items-center gap-1.5 transition-colors ${hasNumber ? 'text-emerald-400 font-medium' : 'text-neutral-500'}`}>
                  {hasNumber ? <Check size={12} className="shrink-0" /> : <X size={12} className="shrink-0 opacity-40" />}
                  <span>숫자 포함</span>
                </div>
                <div className={`flex items-center gap-1.5 transition-colors ${hasSpecial ? 'text-emerald-400 font-medium' : 'text-neutral-500'}`}>
                  {hasSpecial ? <Check size={12} className="shrink-0" /> : <X size={12} className="shrink-0 opacity-40" />}
                  <span>특수문자 포함</span>
                </div>
              </div>
            </div>
          )}

          {state?.errors?.password && (
            <p className="text-xs text-red-400">{state.errors.password[0]}</p>
          )}
        </div>

        {/* Hidden Role: Always broker during test period */}
        <input type="hidden" name="role" value="broker" />

        {/* Broker Badge Notice */}
        <div className="flex items-center gap-2 p-3 bg-neutral-950/80 border border-neutral-800 rounded-lg text-xs text-neutral-400">
          <ShieldCheck size={16} className="text-primary shrink-0" />
          <span>테스트 기간 동안 모든 신규 계정은 <strong>공인중개사(Broker)</strong> 권한으로 자동 생성됩니다.</span>
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
