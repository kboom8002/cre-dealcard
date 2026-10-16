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
  brokerPhone?: string | null;
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

export function SubscribeCard({ brokerId, source, accentColor = '#4f46e5', brokerPhone }: SubscribeCardProps) {
  const uid = useId();
  const [channel, setChannel] = useState<Channel>('kakao');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [followUpEmail, setFollowUpEmail] = useState('');
  const [name, setName] = useState('');
  const [consent, setConsent] = useState<ConsentState>(EMPTY_CONSENT);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [done, setDone] = useState<{
    status: 'pending' | 'confirmed';
    message?: string;
    notice?: string;
    pendingReason?: 'NO_EMAIL_CONFIRM_CHANNEL';
  }>({ status: 'pending' });
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
      setDone({
        status: outcome.status,
        message: outcome.message,
        notice: outcome.notice,
        pendingReason: outcome.pendingReason,
      });
      setStatus('success');
      if (outcome.pendingReason !== 'NO_EMAIL_CONFIRM_CHANNEL') {
        setPhone('');
        setEmail('');
        setName('');
        setConsent(EMPTY_CONSENT);
      }
    } else {
      setErrorMsg(outcome.message);
      setStatus('error');
    }
  };

  const handleFollowUpEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = followUpEmail.trim();
    if (!EMAIL_RE.test(trimmedEmail)) {
      setErrorMsg('확인 링크를 받을 올바른 이메일 주소를 입력해주세요.');
      return;
    }
    setErrorMsg('');
    setStatus('loading');
    const refParam = getRefParam();
    const outcome = await postSubscribe({
      brokerId,
      phone: isPlausiblePhoneDigits(phone) ? digitsOnly(phone) : undefined,
      email: trimmedEmail,
      name: name.trim() || undefined,
      channel: 'both',
      source,
      referrer: refParam || undefined,
      consent: toConsentPayload(consentOk ? consent : { privacy: true, marketing: true, age14: true }),
    });

    if (outcome.ok) {
      setDone({
        status: outcome.status,
        message: outcome.message,
        notice: outcome.notice,
        pendingReason: outcome.pendingReason,
      });
      setStatus('success');
      if (outcome.pendingReason !== 'NO_EMAIL_CONFIRM_CHANNEL') {
        setPhone('');
        setEmail('');
        setFollowUpEmail('');
        setName('');
        setConsent(EMPTY_CONSENT);
      }
    } else {
      setErrorMsg(outcome.message);
      setStatus('success'); // keep follow-up card visible with error message
    }
  };

  const cleanBrokerDigits = brokerPhone ? digitsOnly(brokerPhone) : '';
  const phoneCallHref = cleanBrokerDigits
    ? `tel:${cleanBrokerDigits}`
    : `/magazine/${encodeURIComponent(brokerId)}/subscribe`;

  const inputClass =
    'w-full min-h-12 bg-slate-900/90 border border-slate-500 rounded-xl px-3.5 py-2.5 text-[16px] text-white placeholder:text-slate-300 outline-none focus:border-white transition-colors';

  return (
    <div className="rounded-2xl border border-slate-600 bg-slate-900/95 p-5 space-y-4 text-left text-slate-100">
      <div className="space-y-1.5">
        <h2 className="text-[19px] font-bold text-white flex items-center gap-1.5">
          <span aria-hidden>📰</span> 주간 매거진 구독하기
        </h2>
        <p className="text-[15px] leading-relaxed text-slate-200 break-keep">
          중개인이 엄선한 최신 상업용 빌딩·수익형 부동산 정보 및 리포트를 {MAGAZINE_SEND_DAY_LABEL} 받아보세요.
        </p>
      </div>

      {status === 'success' && done.pendingReason === 'NO_EMAIL_CONFIRM_CHANNEL' ? (
        <div
          role="status"
          aria-label="확인용 이메일 추가 입력"
          className="rounded-xl border-2 border-amber-400 bg-amber-50 p-4 text-left text-amber-950 space-y-3"
        >
          <p className="text-[15px] font-semibold text-amber-900 break-keep">
            구독 신청이 접수되었습니다. 확인 후 발송이 시작됩니다.
          </p>
          <p className="text-[17px] font-bold leading-snug text-amber-950 break-keep">
            ⚠️ 아직 구독 신청이 끝나지 않았어요 — 확인용 이메일을 적어 주세요
          </p>
          <p className="text-[15px] leading-relaxed text-amber-900 break-keep">
            현재 본인 확인 링크는 이메일로 발송됩니다. 아래에 이메일 주소를 적고 버튼을 누르시면 바로 구독 확인이 진행됩니다.
          </p>
          {done.notice && (
            <p className="text-[14px] font-semibold text-amber-900 break-keep">{done.notice}</p>
          )}
          <form onSubmit={handleFollowUpEmailSubmit} className="space-y-2.5" noValidate>
            <div>
              <label htmlFor={`${uid}-followup-email`} className="block mb-1.5 text-[15px] font-bold text-amber-950">
                확인 링크를 받을 이메일 주소
              </label>
              <input
                id={`${uid}-followup-email`}
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="이메일 주소 (예: hong@example.com)"
                value={followUpEmail}
                onChange={(e) => setFollowUpEmail(e.target.value)}
                required
                className="w-full min-h-12 rounded-xl border-2 border-amber-400 bg-white px-3.5 py-2.5 text-[16px] text-slate-900 placeholder:text-slate-500 outline-none focus:border-amber-700"
              />
            </div>
            {errorMsg && (
              <p role="alert" className="text-[15px] font-bold text-rose-800">
                {errorMsg}
              </p>
            )}
            <button
              type="submit"
              className="w-full min-h-[52px] rounded-xl bg-amber-900 px-4 py-3 text-[17px] font-bold text-white shadow-xs transition hover:bg-amber-950"
            >
              📧 이메일 입력하고 구독 완료하기
            </button>
          </form>
          <a
            href={phoneCallHref}
            className="flex min-h-12 w-full items-center justify-center rounded-xl border border-amber-700 bg-white px-4 py-2.5 text-center text-[15px] font-bold text-amber-950 transition hover:bg-amber-100"
          >
            📞 이메일이 없으신가요? 중개사에게 전화로 구독 신청하기
          </a>
        </div>
      ) : status === 'success' ? (
        <div role="status" className="bg-emerald-950 border border-emerald-400 text-emerald-100 rounded-xl p-4 text-center text-[16px] font-semibold leading-relaxed space-y-1.5">
          <p>
            {done.status === 'pending'
              ? '구독 신청이 접수되었습니다. 확인 후 발송이 시작됩니다.'
              : '구독이 완료되었습니다.'}{' '}
            {MAGAZINE_SEND_DAY_LABEL} 발송됩니다.
          </p>
          {done.message && <p className="text-[15px] font-normal text-emerald-200">{done.message}</p>}
          {done.notice && <p className="text-[15px] font-bold text-amber-200">{done.notice}</p>}
        </div>
      ) : (
        <form onSubmit={handleSubscribe} className="space-y-3.5" noValidate>
          <div role="group" aria-label="수신 채널" className="grid grid-cols-3 gap-1.5 p-1 bg-slate-800 border border-slate-600 rounded-xl">
            {CHANNELS.map((item) => (
              <button
                key={item.key}
                type="button"
                aria-pressed={channel === item.key}
                onClick={() => { setChannel(item.key); setStatus('idle'); }}
                className={`min-h-12 py-2 text-[16px] font-bold rounded-lg transition-all ${
                  channel === item.key
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-100 hover:bg-slate-700'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div>
            <label htmlFor={`${uid}-name`} className="block mb-1.5 text-[15px] font-semibold text-slate-100">
              성함 (선택)
            </label>
            <input
              id={`${uid}-name`}
              type="text"
              autoComplete="name"
              placeholder="이름 (선택)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
          </div>

          {needPhone && (
            <div>
              <label htmlFor={`${uid}-phone`} className="block mb-1.5 text-[15px] font-semibold text-slate-100">
                휴대폰 번호 (필수 · 숫자만 입력하셔도 됩니다)
              </label>
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
              <label htmlFor={`${uid}-email`} className="block mb-1.5 text-[15px] font-semibold text-slate-100">
                이메일 주소 (필수 · 구독 확인 링크 수신용)
              </label>
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

          {status === 'error' && (
            <p role="alert" className="text-[15px] text-rose-200 font-bold">
              {errorMsg}
            </p>
          )}

          {!consentOk && (
            <p className="text-[15px] font-semibold text-amber-200 leading-snug break-keep">
              ☝️ 위 필수 동의 항목(&apos;필수 항목 모두 동의&apos; 포함)에 체크하시면 신청 버튼이 켜집니다
            </p>
          )}

          <button
            type="submit"
            disabled={status === 'loading' || !consentOk}
            className="w-full min-h-[52px] py-3 rounded-xl text-[17px] font-bold text-white transition-all active:scale-[0.98] disabled:opacity-100 disabled:bg-slate-700 disabled:text-slate-100 disabled:border disabled:border-slate-500 disabled:cursor-not-allowed"
            style={consentOk && status !== 'loading' ? { background: accentColor } : undefined}
          >
            {status === 'loading' ? '신청 중...' : CTA_TEXT[channel]}
          </button>
        </form>
      )}
    </div>
  );
}
