'use client';

import { useState, useActionState } from 'react';
import Link from 'next/link';
import { signup } from '@/app/actions/auth';
import { COMPANY_LEGAL_CONFIG } from '@/config/company-legal';
import { Eye, EyeOff, Check, X, ShieldCheck } from 'lucide-react';

export default function SignupPage() {
  const [state, action, pending] = useActionState(signup, undefined);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // PIPA 분리 동의 상태 (초기값은 반드시 미체크 false)
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [agreeMarketing, setAgreeMarketing] = useState(false);

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
        <p className="text-xs font-bold tracking-wider text-primary mb-1.5">
          {COMPANY_LEGAL_CONFIG.serviceName}
        </p>
        <h1 className="text-2xl font-black text-white mb-1">회원가입</h1>
        <p className="text-[15px] text-neutral-400">
          {COMPANY_LEGAL_CONFIG.serviceName} 중개사 계정을 만들어 시작하세요.
        </p>
      </div>

      <form action={action} className="space-y-5">
        {/* Global Error */}
        {state?.message && (
          <div
            role="alert"
            className="p-3.5 bg-red-900/30 border border-red-800/50 rounded-lg text-[15px] text-red-300"
          >
            {state.message}
          </div>
        )}

        {/* Display Name */}
        <div className="space-y-1.5">
          <label htmlFor="displayName" className="block text-[15px] font-semibold text-neutral-200">
            이름 / 표시명
          </label>
          <input
            id="displayName"
            name="displayName"
            type="text"
            autoComplete="name"
            required
            placeholder="홍길동 대표중개사"
            className="w-full min-h-[48px] bg-neutral-950 border border-neutral-700 rounded-lg px-4 py-3 text-[16px] text-white placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-colors"
          />
          {state?.errors?.displayName && (
            <p className="text-sm text-red-400">{state.errors.displayName[0]}</p>
          )}
        </div>

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
            placeholder="you@example.com"
            className="w-full min-h-[48px] bg-neutral-950 border border-neutral-700 rounded-lg px-4 py-3 text-[16px] text-white placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-colors"
          />
          {state?.errors?.email && (
            <p className="text-sm text-red-400">{state.errors.email[0]}</p>
          )}
        </div>

        {/* Password with Strength Indicator */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="block text-[15px] font-semibold text-neutral-200">
              비밀번호
            </label>
            {password.length > 0 && (
              <span className={`text-sm ${strengthConfig.textColor} transition-colors`}>
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
              minLength={8}
              placeholder="8자 이상 입력"
              className="w-full min-h-[48px] bg-neutral-950 border border-neutral-700 rounded-lg pl-4 pr-12 py-3 text-[16px] text-white placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              tabIndex={-1}
              className="absolute right-2 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] flex items-center justify-center text-neutral-400 hover:text-neutral-200 transition-colors"
              aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
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
              <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 pt-1 text-[13px]">
                <div className={`flex items-center gap-1.5 transition-colors ${hasMinLength ? 'text-emerald-400 font-medium' : 'text-neutral-500'}`}>
                  {hasMinLength ? <Check size={14} className="shrink-0" /> : <X size={14} className="shrink-0 opacity-40" />}
                  <span>8자 이상</span>
                </div>
                <div className={`flex items-center gap-1.5 transition-colors ${hasLetter ? 'text-emerald-400 font-medium' : 'text-neutral-500'}`}>
                  {hasLetter ? <Check size={14} className="shrink-0" /> : <X size={14} className="shrink-0 opacity-40" />}
                  <span>영문자 포함</span>
                </div>
                <div className={`flex items-center gap-1.5 transition-colors ${hasNumber ? 'text-emerald-400 font-medium' : 'text-neutral-500'}`}>
                  {hasNumber ? <Check size={14} className="shrink-0" /> : <X size={14} className="shrink-0 opacity-40" />}
                  <span>숫자 포함</span>
                </div>
                <div className={`flex items-center gap-1.5 transition-colors ${hasSpecial ? 'text-emerald-400 font-medium' : 'text-neutral-500'}`}>
                  {hasSpecial ? <Check size={14} className="shrink-0" /> : <X size={14} className="shrink-0 opacity-40" />}
                  <span>특수문자 포함</span>
                </div>
              </div>
            </div>
          )}

          {state?.errors?.password && (
            <p className="text-sm text-red-400">{state.errors.password[0]}</p>
          )}
        </div>

        {/* Hidden Role: Always broker during early access */}
        <input type="hidden" name="role" value="broker" />

        {/* Broker Badge Notice */}
        <div className="flex items-center gap-2.5 p-3.5 bg-neutral-950/80 border border-neutral-800 rounded-lg text-[14px] text-neutral-300">
          <ShieldCheck size={18} className="text-primary shrink-0" />
          <span>
            얼리액세스 기간 동안 모든 신규 계정은 <strong>공인중개사(Broker)</strong> 워크스페이스 권한으로 생성됩니다.
          </span>
        </div>

        {/* Separated PIPA Consents (Never pre-checked, never bundled) */}
        <fieldset className="space-y-2 rounded-xl border border-neutral-800 bg-neutral-950/60 p-4">
          <legend className="px-1 text-[14px] font-bold text-neutral-200">
            약관 및 개인정보 수집·이용 동의
          </legend>

          {/* 1) Required: Age 14+ & Terms of Service */}
          <div className="flex items-center justify-between gap-2 min-h-[48px]">
            <label
              htmlFor="agreeTerms"
              className="flex items-center gap-3 cursor-pointer select-none text-[15px] text-neutral-200 leading-snug py-1"
            >
              <input
                id="agreeTerms"
                name="agreeTerms"
                type="checkbox"
                value="on"
                required
                checked={agreeTerms}
                onChange={(e) => setAgreeTerms(e.target.checked)}
                className="w-5 h-5 shrink-0 rounded border-neutral-600 bg-neutral-950 text-primary focus:ring-primary/50 accent-primary"
              />
              <span>[필수] 만 14세 이상이며 서비스 이용약관에 동의합니다</span>
            </label>
            <Link
              href="/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-[14px] font-semibold text-primary hover:underline px-2 py-1"
            >
              보기
            </Link>
          </div>
          {state?.errors?.agreeTerms && (
            <p className="text-sm text-red-400 pl-8">{state.errors.agreeTerms[0]}</p>
          )}

          {/* 2) Required: Privacy Collection & Use */}
          <div className="flex items-center justify-between gap-2 min-h-[48px] border-t border-neutral-800/70 pt-1">
            <label
              htmlFor="agreePrivacy"
              className="flex items-center gap-3 cursor-pointer select-none text-[15px] text-neutral-200 leading-snug py-1"
            >
              <input
                id="agreePrivacy"
                name="agreePrivacy"
                type="checkbox"
                value="on"
                required
                checked={agreePrivacy}
                onChange={(e) => setAgreePrivacy(e.target.checked)}
                className="w-5 h-5 shrink-0 rounded border-neutral-600 bg-neutral-950 text-primary focus:ring-primary/50 accent-primary"
              />
              <span>[필수] 개인정보 수집·이용에 동의합니다</span>
            </label>
            <Link
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-[14px] font-semibold text-primary hover:underline px-2 py-1"
            >
              보기
            </Link>
          </div>
          {state?.errors?.agreePrivacy && (
            <p className="text-sm text-red-400 pl-8">{state.errors.agreePrivacy[0]}</p>
          )}

          {/* 3) Optional: Marketing & Product Updates */}
          <div className="flex items-center justify-between gap-2 min-h-[48px] border-t border-neutral-800/70 pt-1">
            <label
              htmlFor="agreeMarketing"
              className="flex items-center gap-3 cursor-pointer select-none text-[15px] text-neutral-300 leading-snug py-1"
            >
              <input
                id="agreeMarketing"
                name="agreeMarketing"
                type="checkbox"
                value="on"
                checked={agreeMarketing}
                onChange={(e) => setAgreeMarketing(e.target.checked)}
                className="w-5 h-5 shrink-0 rounded border-neutral-600 bg-neutral-950 text-primary focus:ring-primary/50 accent-primary"
              />
              <span>[선택] 서비스 업데이트 및 프로모션 안내 수신에 동의합니다</span>
            </label>
          </div>
        </fieldset>

        {/* Submit */}
        <button
          type="submit"
          disabled={pending}
          className="w-full min-h-[52px] bg-primary hover:bg-primary/90 text-primary-foreground font-black rounded-lg px-4 py-3 text-[16px] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {pending ? '계정 생성 중...' : '가입하기'}
        </button>
      </form>

      <div className="mt-6 text-center">
        <p className="text-[15px] text-neutral-400">
          이미 계정이 있으신가요?{' '}
          <Link href="/login" className="text-primary hover:underline font-semibold">
            로그인
          </Link>
        </p>
      </div>
    </div>
  );
}
