'use client';

import { useState } from 'react';

type Channel = 'kakao' | 'email' | 'both';

interface SubscribeCardProps {
  brokerId: string;
  source: 'magazine' | 'vibe_card' | 'im';
  accentColor?: string;
}

const CHANNELS: { key: Channel; label: string }[] = [
  { key: 'kakao', label: '카카오톡' },
  { key: 'email', label: '이메일' },
  { key: 'both', label: '둘 다' },
];

const CTA_TEXT: Record<Channel, string> = {
  kakao: '🔔 카카오톡으로 주간 매거진 받아보기',
  email: '📧 이메일로 주간 매거진 받아보기',
  both: '🔔 카카오톡+이메일로 매거진 받아보기',
};

export function SubscribeCard({ brokerId, source, accentColor = '#6366f1' }: SubscribeCardProps) {
  const [channel, setChannel] = useState<Channel>('kakao');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  // Extract referral parameter from URL
  const getRefParam = () => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    return params.get('ref') || params.get('referrer') || null;
  };

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((channel === 'kakao' || channel === 'both') && !phone.trim()) {
      setErrorMsg('전화번호를 입력해주세요.');
      setStatus('error');
      return;
    }
    if ((channel === 'email' || channel === 'both') && !email.trim()) {
      setErrorMsg('이메일을 입력해주세요.');
      setStatus('error');
      return;
    }

    setStatus('loading');
    try {
      const refParam = getRefParam();
      const res = await fetch('/api/public/magazine/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          broker_id: brokerId,
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
          name: name.trim() || undefined,
          channel,
          source,
          referrer: refParam || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        setStatus('success');

        // Record referral if ref param exists
        if (refParam && phone.trim()) {
          fetch('/api/public/magazine/referral', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              brokerId,
              referrerPhone: refParam,
              referredPhone: phone.trim(),
            }),
          }).catch(() => {/* silent */});
        }

        setPhone('');
        setEmail('');
        setName('');
      } else {
        throw new Error(data.error || '구독 신청 중 오류가 발생했습니다.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || '서버 오류가 발생했습니다.');
      setStatus('error');
    }
  };

  const inputClass = 'bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-white/20 transition-colors';

  return (
    <div className="rounded-2xl border border-white/8 p-5 space-y-4 text-left" style={{ background: 'rgba(255, 255, 255, 0.03)' }}>
      <div className="space-y-1">
        <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
          <span>📰</span> 주간 매거진 구독하기
        </h4>
        <p className="text-xs text-slate-400">중개인이 엄선한 최신 꼬마빌딩/CRE 정보 및 리포트를 매주 받아보세요.</p>
      </div>

      {status === 'success' ? (
        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl p-3 text-center text-xs font-semibold">
          🎉 구독 신청이 완료되었습니다! 매주 월요일 발송됩니다.
        </div>
      ) : (
        <form onSubmit={handleSubscribe} className="space-y-2.5">
          <div className="grid grid-cols-3 gap-1.5 p-1 bg-white/5 border border-white/10 rounded-xl">
            {CHANNELS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => { setChannel(item.key); setStatus('idle'); }}
                className={`py-1.5 text-xs font-semibold rounded-lg transition-all ${channel === item.key ? 'bg-white/15 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <input type="text" placeholder="이름 (선택)" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
            <input type="tel" placeholder={channel === 'email' ? '전화번호 (선택)' : '전화번호 (- 제외)'} value={phone} onChange={(e) => setPhone(e.target.value)} required={channel === 'kakao' || channel === 'both'} className={inputClass} />
          </div>

          <input type="email" placeholder={channel === 'kakao' ? '이메일 (선택)' : '이메일 주소'} value={email} onChange={(e) => setEmail(e.target.value)} required={channel === 'email' || channel === 'both'} className={`w-full ${inputClass}`} />

          {status === 'error' && <p className="text-[10px] text-rose-400 font-medium">{errorMsg}</p>}

          <button
            type="submit"
            disabled={status === 'loading'}
            className="w-full py-2.5 rounded-xl text-xs font-bold text-white transition-all active:scale-[0.98] disabled:opacity-50"
            style={{ background: accentColor }}
          >
            {status === 'loading' ? '구독 신청 중...' : CTA_TEXT[channel]}
          </button>
        </form>
      )}
    </div>
  );
}
