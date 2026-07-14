'use client';

import { useState } from 'react';
import Link from 'next/link';
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

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/update-password`,
    });

    if (error) {
      setError('이메일 발송 중 오류가 발생했습니다. 다시 시도해주세요.');
    } else {
      setSent(true);
    }
    setLoading(false);
  };

  if (sent) {
    return (
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8 shadow-2xl">
        <div className="text-center space-y-4">
          <div className="text-4xl">✉️</div>
          <h1 className="text-xl font-bold text-white">이메일을 확인해주세요</h1>
          <p className="text-sm text-neutral-400">
            <span className="text-primary font-semibold">{email}</span>으로 비밀번호 재설정 링크를 보냈습니다.<br/>
            메일함을 확인해주세요.
          </p>
          <Link href="/login" className="inline-block text-sm text-primary hover:underline font-semibold mt-4">
            로그인으로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8 shadow-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-black text-white mb-1">비밀번호 재설정</h1>
        <p className="text-sm text-neutral-400">가입 시 사용한 이메일을 입력하면 재설정 링크를 보내드립니다.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="p-3 bg-red-900/30 border border-red-800/50 rounded-lg text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="space-y-1.5">
          <label htmlFor="email" className="block text-sm font-semibold text-neutral-300">
            이메일 주소
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@example.com"
            className="w-full bg-neutral-950 border border-neutral-700 rounded-lg px-4 py-3 text-sm text-white placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-colors"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-primary hover:bg-primary/90 text-black font-black rounded-lg px-4 py-3 text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? '발송 중...' : '재설정 링크 받기'}
        </button>
      </form>

      <div className="mt-6 text-center">
        <Link href="/login" className="text-sm text-neutral-500 hover:text-primary transition-colors">
          ← 로그인으로 돌아가기
        </Link>
      </div>
    </div>
  );
}
