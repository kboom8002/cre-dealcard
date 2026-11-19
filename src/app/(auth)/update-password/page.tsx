'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { COMPANY_LEGAL_CONFIG } from '@/config/company-legal';
import { createClient } from '@/lib/supabase/client';

function UpdatePasswordContent() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [linkExpired, setLinkExpired] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  // 직접 ?code= 쿼리 또는 만료 에러 파라미터로 진입한 경우 마운트 시 처리
  useEffect(() => {
    const queryCode =
      searchParams?.get('code') ||
      (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('code') : null);
    const queryError =
      searchParams?.get('error') ||
      (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('error') : null);
    const hashStr = typeof window !== 'undefined' ? window.location.hash : '';

    if (queryError || hashStr.includes('error=')) {
      setLinkExpired(true);
      setError('비밀번호 재설정 링크가 만료되었거나 이미 사용되었습니다. 새 링크를 요청해주세요.');
      return;
    }

    if (!queryCode) return;

    let cancelled = false;
    setVerifyingCode(true);
    const supabase = createClient();

    (async () => {
      try {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(queryCode);
        if (cancelled) return;
        if (exchangeError) {
          setLinkExpired(true);
          setError('비밀번호 재설정 링크가 만료되었거나 유효하지 않습니다. 다시 요청해주세요.');
        } else {
          router.replace('/update-password');
        }
      } catch {
        if (!cancelled) {
          setLinkExpired(true);
          setError('인증 세션 확인 중 오류가 발생했습니다. 재설정 링크를 다시 요청해주세요.');
        }
      } finally {
        if (!cancelled) {
          setVerifyingCode(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError('비밀번호는 8자 이상이어야 합니다.');
      return;
    }
    if (password !== confirm) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }

    setLoading(true);
    setError('');

    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setLinkExpired(true);
      setError('비밀번호를 변경할 수 없습니다. 재설정 링크가 만료되었거나 이미 사용되었을 수 있습니다.');
      setLoading(false);
    } else {
      router.push('/broker');
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm text-slate-900">
      <div className="mb-8">
        <p className="text-sm font-bold tracking-wider text-blue-700 mb-1.5">
          {COMPANY_LEGAL_CONFIG.serviceName}
        </p>
        <h1 className="text-2xl font-black text-slate-900 mb-1">새 비밀번호 설정</h1>
        <p className="text-[15px] text-slate-600">8자 이상의 새로운 비밀번호를 입력해주세요.</p>
      </div>

      {verifyingCode && (
        <div className="mb-5 p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-[15px] text-slate-700">
          재설정 링크의 보안 인증을 확인하고 있습니다...
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mb-5 p-4 bg-red-50 border border-red-200 rounded-xl space-y-3"
        >
          <p className="text-[15px] text-red-800 leading-relaxed">{error}</p>
          {linkExpired && (
            <Link
              href="/reset-password"
              className="inline-flex min-h-[48px] w-full items-center justify-center rounded-lg bg-white hover:bg-slate-50 border border-red-300 px-4 py-2.5 text-[15px] font-bold text-red-800 transition-colors"
            >
              비밀번호 재설정 링크 다시 받기 →
            </Link>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-1.5">
          <label htmlFor="password" className="block text-[15px] font-semibold text-slate-800">
            새 비밀번호
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            placeholder="8자 이상 입력"
            className="w-full min-h-[48px] bg-slate-50 border border-slate-300 rounded-lg px-4 py-3 text-[16px] text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600 transition-colors"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="confirm" className="block text-[15px] font-semibold text-slate-800">
            새 비밀번호 확인
          </label>
          <input
            id="confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
            placeholder="비밀번호 다시 입력"
            className="w-full min-h-[48px] bg-slate-50 border border-slate-300 rounded-lg px-4 py-3 text-[16px] text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600 transition-colors"
          />
        </div>

        <button
          type="submit"
          disabled={loading || verifyingCode}
          className="w-full min-h-[52px] bg-blue-700 hover:bg-blue-800 text-white font-black rounded-lg px-4 py-3 text-[16px] transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
        >
          {loading ? '변경 중...' : '비밀번호 변경'}
        </button>
      </form>

      <div className="mt-6 flex items-center justify-center gap-4 text-sm text-slate-600">
        <Link href="/reset-password" className="inline-flex min-h-[44px] items-center hover:text-blue-700 transition-colors py-1">
          재설정 링크 다시 받기
        </Link>
        <span className="text-slate-300">·</span>
        <Link href="/login" className="inline-flex min-h-[44px] items-center hover:text-blue-700 transition-colors py-1">
          로그인 화면
        </Link>
      </div>
    </div>
  );
}

export default function UpdatePasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm min-h-[360px]" />
      }
    >
      <UpdatePasswordContent />
    </Suspense>
  );
}
