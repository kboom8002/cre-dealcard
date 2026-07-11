'use client';

import { useState } from 'react';

interface SubscribeCardProps {
  brokerId: string;
  source: 'magazine' | 'vibe_card' | 'im';
  accentColor?: string;
}

export function SubscribeCard({ brokerId, source, accentColor = '#6366f1' }: SubscribeCardProps) {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) {
      setErrorMsg('전화번호를 입력해주세요.');
      setStatus('error');
      return;
    }

    setStatus('loading');
    try {
      const res = await fetch('/api/public/magazine/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          broker_id: brokerId,
          phone: phone.trim(),
          name: name.trim() || undefined,
          source,
        }),
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        setStatus('success');
        setPhone('');
        setName('');
      } else {
        throw new Error(data.error || '구독 신청 중 오류가 발생했습니다.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || '서버 오류가 발생했습니다.');
      setStatus('error');
    }
  };

  return (
    <div
      className="rounded-2xl border border-white/8 p-5 space-y-4 text-left"
      style={{ background: 'rgba(255, 255, 255, 0.03)' }}
    >
      <div className="space-y-1">
        <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
          <span>📰</span> 주간 매거진 구독하기
        </h4>
        <p className="text-xs text-slate-400">
          브로커가 엄선한 최신 꼬마빌딩/CRE 정보 및 리포트를 매주 카카오톡으로 받아보세요.
        </p>
      </div>

      {status === 'success' ? (
        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl p-3 text-center text-xs font-semibold">
          🎉 구독 신청이 완료되었습니다! 매주 월요일 발송됩니다.
        </div>
      ) : (
        <form onSubmit={handleSubscribe} className="space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              placeholder="이름 (선택)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-white/20 transition-colors"
            />
            <input
              type="tel"
              placeholder="전화번호 (- 제외)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-white/20 transition-colors"
            />
          </div>

          {status === 'error' && (
            <p className="text-[10px] text-rose-400 font-medium">{errorMsg}</p>
          )}

          <button
            type="submit"
            disabled={status === 'loading'}
            className="w-full py-2.5 rounded-xl text-xs font-bold text-white transition-all active:scale-[0.98] disabled:opacity-50"
            style={{ background: accentColor }}
          >
            {status === 'loading' ? '구독 신청 중...' : '🔔 카카오톡으로 주간 매거진 받아보기'}
          </button>
        </form>
      )}
    </div>
  );
}
