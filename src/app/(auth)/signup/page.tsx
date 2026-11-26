'use client';

import { Suspense, useState, useActionState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { signup } from '@/app/actions/auth';
import { COMPANY_LEGAL_CONFIG } from '@/config/company-legal';
import { Eye, EyeOff, Check, X, ShieldCheck, MailCheck } from 'lucide-react';

function SignupFormContent() {
  const searchParams = useSearchParams();
  const [state, action, pending] = useActionState(signup, undefined);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [windowRedirectTo, setWindowRedirectTo] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    setWindowRedirectTo(params.get('redirectTo') || params.get('next') || '');
  }, []);

  const redirectTo =
    searchParams?.get('redirectTo') ||
    searchParams?.get('next') ||
    windowRedirectTo;

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
    { label: '', color: 'bg-slate-200', textColor: 'text-slate-600' },
    { label: '취약 (8자 이상 필요)', color: 'bg-red-600', textColor: 'text-red-700' },
    { label: '보통 (영문/숫자 조합 권장)', color: 'bg-amber-600', textColor: 'text-amber-800' },
    { label: '안전', color: 'bg-emerald-600', textColor: 'text-emerald-700' },
    { label: '매우 강력', color: 'bg-blue-700', textColor: 'text-blue-700 font-bold' },
  ][strengthScore];

  const loginHref = redirectTo ? `/login?redirectTo=${encodeURIComponent(redirectTo)}` : '/login';

  if (state?.needsEmailConfirmation) {
    return (
      <div
        data-testid="signup-email-confirm-card"
        className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm text-slate-900 space-y-5 text-center"
      >
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
          <MailCheck size={28} aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <p className="text-sm font-bold tracking-wider text-blue-700">
            {COMPANY_LEGAL_CONFIG.serviceName}
          </p>
          <h1 className="text-2xl font-black text-slate-900">인증 메일을 보냈습니다</h1>
          <p className="text-[15px] text-slate-700 leading-relaxed">
            <strong className="text-blue-700">{state.confirmedEmail}</strong> 주소로 확인 메일을 발송했습니다.
            <br />
            메일함(또는 스팸함)에서 인증 링크를 누르신 뒤 바로 로그인해 주세요.
          </p>
        </div>
        <Link
          href={loginHref}
          className="inline-flex w-full min-h-[48px] items-center justify-center rounded-lg bg-blue-700 hover:bg-blue-800 px-4 py-3 text-[16px] font-black text-white transition-colors"
        >
          로그인 화면으로 이동
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm text-slate-900">
      <div className="mb-8">
        <p className="text-sm font-bold tracking-wider text-blue-700 mb-1.5">
          {COMPANY_LEGAL_CONFIG.serviceName}
        </p>
        <h1 className="text-2xl font-black text-slate-900 mb-1">회원가입</h1>
        <p className="text-[15px] text-slate-600">
          {COMPANY_LEGAL_CONFIG.serviceName} 중개사 계정을 만들어 4대 핵심 업무를 시작하세요.
        </p>
      </div>

      <form action={action} className="space-y-5">
        <input type="hidden" name="redirectTo" value={redirectTo} />

        {/* Global Error */}
        {state?.message && (
          <div
            role="alert"
            className="p-3.5 bg-red-50 border border-red-200 rounded-lg text-[15px] text-red-800"
          >
            {state.message}
          </div>
        )}

        {/* Display Name */}
        <div className="space-y-1.5">
          <label htmlFor="displayName" className="block text-[15px] font-semibold text-slate-800">
            담당자 성함
          </label>
          <input
            id="displayName"
            name="displayName"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            autoComplete="name"
            required
            placeholder="예: 박성훈"
            className="w-full min-h-[48px] bg-slate-50 border border-slate-300 rounded-lg px-4 py-3 text-[16px] text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600 transition-colors"
          />
          <p className="text-sm text-slate-600">
            성함만 입력해 주세요. 중개사무소 상호·등록번호는 가입 직후 60초 만에 입력합니다.
          </p>
          {state?.errors?.displayName && (
            <p className="text-sm text-red-700">{state.errors.displayName[0]}</p>
          )}
        </div>

        {/* Email */}
        <div className="space-y-1.5">
          <label htmlFor="email" className="block text-[15px] font-semibold text-slate-800">
            이메일
          </label>
          <input
            id="email"
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            placeholder="name@company.co.kr"
            className="w-full min-h-[48px] bg-slate-50 border border-slate-300 rounded-lg px-4 py-3 text-[16px] text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600 transition-colors"
          />
          {state?.errors?.email && (
            <p className="text-sm text-red-700">{state.errors.email[0]}</p>
          )}
        </div>

        {/* Password with Strength Indicator */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="block text-[15px] font-semibold text-slate-800">
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
              className="w-full min-h-[48px] bg-slate-50 border border-slate-300 rounded-lg pl-4 pr-12 py-3 text-[16px] text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600 transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              tabIndex={-1}
              className="absolute right-2 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
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
                      step <= strengthScore ? strengthConfig.color : 'bg-slate-200'
                    }`}
                  />
                ))}
              </div>

              {/* Real-time Requirement Checklist */}
              <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 pt-1 text-sm">
                <div className={`flex items-center gap-1.5 transition-colors ${hasMinLength ? 'text-emerald-700 font-medium' : 'text-slate-500'}`}>
                  {hasMinLength ? <Check size={14} className="shrink-0" /> : <X size={14} className="shrink-0 opacity-40" />}
                  <span>8자 이상</span>
                </div>
                <div className={`flex items-center gap-1.5 transition-colors ${hasLetter ? 'text-emerald-700 font-medium' : 'text-slate-500'}`}>
                  {hasLetter ? <Check size={14} className="shrink-0" /> : <X size={14} className="shrink-0 opacity-40" />}
                  <span>영문자 포함</span>
                </div>
                <div className={`flex items-center gap-1.5 transition-colors ${hasNumber ? 'text-emerald-700 font-medium' : 'text-slate-500'}`}>
                  {hasNumber ? <Check size={14} className="shrink-0" /> : <X size={14} className="shrink-0 opacity-40" />}
                  <span>숫자 포함</span>
                </div>
                <div className={`flex items-center gap-1.5 transition-colors ${hasSpecial ? 'text-emerald-700 font-medium' : 'text-slate-500'}`}>
                  {hasSpecial ? <Check size={14} className="shrink-0" /> : <X size={14} className="shrink-0 opacity-40" />}
                  <span>특수문자 포함</span>
                </div>
              </div>
            </div>
          )}

          {state?.errors?.password && (
            <p className="text-sm text-red-700">{state.errors.password[0]}</p>
          )}
        </div>

        {/* Hidden Role: Always broker during early access */}
        <input type="hidden" name="role" value="broker" />

        {/* Broker Badge Notice */}
        <div className="flex items-center gap-2.5 p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700">
          <ShieldCheck size={18} className="text-blue-700 shrink-0" />
          <span>
            베타 기간 동안 모든 신규 계정은 <strong>공인중개사 전용 4대 작업공간</strong>(부동산뉴스·딜카드·IM·고객 소통)으로 즉시 시작됩니다.
          </span>
        </div>

        {/* Separated PIPA Consents (Never pre-checked, never bundled) */}
        <fieldset className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <legend className="px-1 text-sm font-bold text-slate-900">
            약관 및 개인정보 수집·이용 동의
          </legend>

          {/* 1) Required: Age 14+ & Terms of Service */}
          <div className="flex items-center justify-between gap-2 min-h-[48px]">
            <label
              htmlFor="agreeTerms"
              className="flex items-center gap-3 cursor-pointer select-none text-[15px] text-slate-800 leading-snug py-1"
            >
              <input
                id="agreeTerms"
                name="agreeTerms"
                type="checkbox"
                value="on"
                required
                checked={agreeTerms}
                onChange={(e) => setAgreeTerms(e.target.checked)}
                className="w-5 h-5 shrink-0 rounded border-slate-400 bg-white text-blue-700 focus:ring-blue-600/40 accent-blue-700"
              />
              <span>[필수] 만 14세 이상이며 서비스 이용약관에 동의합니다</span>
            </label>
            <Link
              href="/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 inline-flex min-h-[44px] items-center text-sm font-semibold text-blue-700 hover:underline px-2 py-1"
            >
              보기
            </Link>
          </div>
          {state?.errors?.agreeTerms && (
            <p className="text-sm text-red-700 pl-8">{state.errors.agreeTerms[0]}</p>
          )}

          {/* 2) Required: Privacy Collection & Use */}
          <div className="flex items-center justify-between gap-2 min-h-[48px] border-t border-slate-200 pt-1">
            <label
              htmlFor="agreePrivacy"
              className="flex items-center gap-3 cursor-pointer select-none text-[15px] text-slate-800 leading-snug py-1"
            >
              <input
                id="agreePrivacy"
                name="agreePrivacy"
                type="checkbox"
                value="on"
                required
                checked={agreePrivacy}
                onChange={(e) => setAgreePrivacy(e.target.checked)}
                className="w-5 h-5 shrink-0 rounded border-slate-400 bg-white text-blue-700 focus:ring-blue-600/40 accent-blue-700"
              />
              <span>[필수] 개인정보 수집·이용에 동의합니다</span>
            </label>
            <Link
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 inline-flex min-h-[44px] items-center text-sm font-semibold text-blue-700 hover:underline px-2 py-1"
            >
              보기
            </Link>
          </div>
          {state?.errors?.agreePrivacy && (
            <p className="text-sm text-red-700 pl-8">{state.errors.agreePrivacy[0]}</p>
          )}

          {/* 3) Optional: Marketing & Product Updates */}
          <div className="flex items-center justify-between gap-2 min-h-[48px] border-t border-slate-200 pt-1">
            <label
              htmlFor="agreeMarketing"
              className="flex items-center gap-3 cursor-pointer select-none text-[15px] text-slate-700 leading-snug py-1"
            >
              <input
                id="agreeMarketing"
                name="agreeMarketing"
                type="checkbox"
                value="on"
                checked={agreeMarketing}
                onChange={(e) => setAgreeMarketing(e.target.checked)}
                className="w-5 h-5 shrink-0 rounded border-slate-400 bg-white text-blue-700 focus:ring-blue-600/40 accent-blue-700"
              />
              <span>[선택] 서비스 업데이트 및 프로모션 안내 수신에 동의합니다</span>
            </label>
          </div>
        </fieldset>

        {/* Submit */}
        <button
          type="submit"
          disabled={pending}
          className="w-full min-h-[52px] bg-blue-700 hover:bg-blue-800 text-white font-black rounded-lg px-4 py-3 text-[16px] transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
        >
          {pending ? '계정 생성 중...' : '가입하기'}
        </button>
      </form>

      <div className="mt-6 text-center">
        <p className="text-[15px] text-slate-600">
          이미 계정이 있으신가요?{' '}
          <Link
            href={redirectTo ? `/login?redirectTo=${encodeURIComponent(redirectTo)}` : '/login'}
            className="inline-flex min-h-[44px] items-center text-blue-700 hover:underline font-semibold"
          >
            로그인
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm min-h-[380px]" />
      }
    >
      <SignupFormContent />
    </Suspense>
  );
}
