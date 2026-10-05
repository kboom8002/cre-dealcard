'use client';

import { useId, useState } from 'react';
import {
  ConsentCheckboxes, EMPTY_CONSENT, allConsented, toConsentPayload, type ConsentState,
} from '@/components/magazine/ConsentCheckboxes';
import { TrackingNotice } from '@/components/magazine/TrackingNotice';
import { postSubscribe } from '@/components/magazine/subscribe-api';
import { digitsOnly, formatKrPhoneInput, isPlausiblePhoneDigits } from '@/lib/magazine/phone-input';
import { MAGAZINE_SEND_DAY_LABEL } from '@/lib/magazine/schedule-labels';

type Channel = 'kakao' | 'email' | 'both';

interface SubscribeCardProps {
  /** 정규(canonical) slug */
  brokerId: string;
  source: 'magazine' | 'vibe_card' | 'im';
  accentColor?: string;
}

/** 채널 토글 라벨: '둘 다' 로 통일 (T2-20). 이모지 없는 짧은 CTA. */
const CHANNELS: { key: Channel; label: string }[] = [
  { key: 'kakao', label: '카카오톡' },
  { key: 'email', label: '이메일' },
  { key: 'both', label: '둘 다' },
];

const CTA_TEXT: Record<Channel, string> = {
  kakao: '카카오톡으로 받기',
  email: '이메일로 받기',
  both: '카톡·이메일로 받기',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function SubscribeCard({ brokerId, source, accentColor = '#6366f1' }: SubscribeCardProps) {
  const uid = useId();
  const [channel, setChannel] = useState<Channel>('kakao');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [consent, setConsent] = useState<ConsentState>(EMPTY_CONSENT);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [done, setDone] = useState<{ status: 'pending' | 'confirmed'; message?: string; notice?: string }>({ status: 'pending' });
  const [errorMsg, setErrorMsg] = useState('');

  // Extract referral parameter from URL
  const getRefParam = () => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    return params.get('ref') || params.get('referrer') || null;
  };

  const needPhone = channel === 'kakao' || channel === 'both';
  const needEmail = channel === 'email' || channel === 'both';
  const consentOk = allConsented(consent);

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (needPhone && !isPlausiblePhoneDigits(phone)) {
      setErrorMsg('올바른 전화번호를 입력해주세요.');
      setStatus('error');
      return;
    }
    if (needEmail && !EMAIL_RE.test(email.trim())) {
      setErrorMsg('올바른 이메일을 입력해주세요.');
      setStatus('error');
      return;
    }
    if (!consentOk) {
      setErrorMsg('필수 동의 항목을 모두 체크해주세요.');
      setStatus('error');
      return;
    }

    setStatus('loading');
    const refParam = getRefParam();
    const outcome = await postSubscribe({
      brokerId,
      phone: needPhone ? digitsOnly(phone) : undefined,
      email: needEmail ? email.trim() : undefined,
      name: name.trim() || undefined,
      channel,
      source,
      referrer: refParam || undefined,
      consent: toConsentPayload(consent),
    });

    if (outcome.ok) {
      setDone({ status: outcome.status, message: outcome.message, notice: outcome.notice });
      setStatus('success');
      setPhone('');
      setEmail('');
      setName('');
      setConsent(EMPTY_CONSENT);
    } else {
      setErrorMsg(outcome.message);
      setStatus('error');
    }
  };

  const inputClass =
    'w-full min-h-[44px] bg-white/5 border border-white/15 rounded-xl px-3 py-2 text-reader text-white placeholder:text-ink-subtle outline-none focus:border-white/40 transition-colors';

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-4 text-left">
      <div className="space-y-1">
        <h2 className="text-body font-bold text-white flex items-center gap-1.5">
          <span aria-hidden>📰</span> 주간 매거진 구독하기
        </h2>
        <p className="text-caption leading-relaxed text-ink-muted">
          중개인이 엄선한 최신 꼬마빌딩/CRE 정보 및 리포트를 {MAGAZINE_SEND_DAY_LABEL} 받아보세요.
        </p>
      </div>

      {status === 'success' ? (
        <div role="status" className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 rounded-xl p-3 text-center text-label font-semibold leading-relaxed space-y-1">
          <p>
            {done.status === 'pending'
              ? '구독 신청이 접수되었습니다. 확인 후 발송이 시작됩니다.'
              : '구독이 완료되었습니다.'}{' '}
            {MAGAZINE_SEND_DAY_LABEL} 발송됩니다.
          </p>
          {done.message && <p className="text-caption font-normal text-ink-muted">{done.message}</p>}
          {done.notice && <p className="text-caption font-bold text-amber-200">{done.notice}</p>}
        </div>
      ) : (
        <form onSubmit={handleSubscribe} className="space-y-2.5" noValidate>
          <div role="group" aria-label="수신 채널" className="grid grid-cols-3 gap-1.5 p-1 bg-white/5 border border-white/10 rounded-xl">
            {CHANNELS.map((item) => (
              <button
                key={item.key}
                type="button"
                aria-pressed={channel === item.key}
                onClick={() => { setChannel(item.key); setStatus('idle'); }}
                className={`min-h-[44px] py-1.5 text-caption font-semibold rounded-lg transition-all ${channel === item.key ? 'bg-white/20 text-white shadow-sm' : 'text-ink-muted hover:text-white'}`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div>
            <label htmlFor={`${uid}-name`} className="sr-only">이름 (선택)</label>
            <input id={`${uid}-name`} type="text" autoComplete="name" placeholder="이름 (선택)" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          </div>

          {needPhone && (
            <div>
              <label htmlFor={`${uid}-phone`} className="sr-only">휴대폰 번호</label>
              <input
                id={`${uid}-phone`}
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                placeholder="휴대폰 번호 (010-0000-0000 형식)"
                value={phone}
                onChange={(e) => setPhone(formatKrPhoneInput(e.target.value))}
                required
                className={`${inputClass} font-mono`}
              />
            </div>
          )}

          {needEmail && (
            <div>
              <label htmlFor={`${uid}-email`} className="sr-only">이메일 주소</label>
              <input
                id={`${uid}-email`}
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="이메일 주소"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className={inputClass}
              />
            </div>
          )}

          <ConsentCheckboxes value={consent} onChange={setConsent} idPrefix={`sc-${source}`} />
          <TrackingNotice />

          {status === 'error' && <p role="alert" className="text-caption text-rose-300 font-medium">{errorMsg}</p>}

          <button
            type="submit"
            disabled={status === 'loading' || !consentOk}
            className="w-full min-h-[44px] py-2.5 rounded-xl text-body font-bold text-white transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: accentColor }}
          >
            {status === 'loading' ? '신청 중...' : CTA_TEXT[channel]}
          </button>
        </form>
      )}
    </div>
  );
}
