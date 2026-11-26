'use client';

import { useState } from 'react';
import Link from 'next/link';
import { COMPANY_LEGAL_CONFIG } from '@/config/company-legal';
import { createClient } from '@/lib/supabase/client';

export default function ResetPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const supabase = createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/update-password`,
      });

      if (resetError) {
        setError('이메일 발송 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
      } else {
        setSent(true);
      }
    } catch {
      setError('이메일 발송 중 네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm text-slate-900">
        <div className="text-center space-y-4">
          <div className="text-4xl" aria-hidden="true">
            ✉️
          </div>
          <h1 className="text-xl font-bold text-slate-900">이메일을 확인해주세요</h1>
          <p className="text-[15px] text-slate-700 leading-relaxed">
            <span className="text-blue-700 font-semibold">{email}</span> 주소로 비밀번호 재설정 링크를 보냈습니다.
            <br />
            메일함(스팸함 포함)에서 링크를 눌러 새 비밀번호를 설정해주세요.
          </p>
          <Link
            href="/login"
            className="inline-flex min-h-[48px] items-center justify-center rounded-lg border border-slate-300 px-5 py-2.5 text-[15px] text-blue-700 hover:bg-slate-50 font-semibold mt-4 transition-colors"
          >
            로그인으로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm text-slate-900">
      <div className="mb-8">
        <p className="text-sm font-bold tracking-wider text-blue-700 mb-1.5">
          {COMPANY_LEGAL_CONFIG.serviceName}
        </p>
        <h1 className="text-2xl font-black text-slate-900 mb-1">비밀번호 재설정</h1>
        <p className="text-[15px] text-slate-600">
          가입 시 사용한 이메일을 입력하면 비밀번호 재설정 링크를 보내드립니다.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div
            role="alert"
            className="p-3.5 bg-red-50 border border-red-200 rounded-lg text-[15px] text-red-800"
          >
            {error}
          </div>
        )}

        <div className="space-y-1.5">
          <label htmlFor="email" className="block text-[15px] font-semibold text-slate-800">
            이메일 주소
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="name@company.co.kr"
            className="w-full min-h-[48px] bg-slate-50 border border-slate-300 rounded-lg px-4 py-3 text-[16px] text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600 transition-colors"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full min-h-[52px] bg-blue-700 hover:bg-blue-800 text-white font-black rounded-lg px-4 py-3 text-[16px] transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
        >
          {loading ? '발송 중...' : '재설정 링크 받기'}
        </button>
      </form>

      <div className="mt-6 text-center">
        <Link
          href="/login"
          className="inline-flex min-h-[44px] items-center text-[15px] text-slate-600 hover:text-blue-700 transition-colors"
        >
          ← 로그인으로 돌아가기
        </Link>
      </div>
    </div>
  );
}
