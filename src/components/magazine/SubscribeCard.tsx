'use client';

import React, { useEffect, useId, useState } from 'react';
import { PhoneActionButton } from '@/components/common/PhoneActionButton';
import {
  ConsentCheckboxes, EMPTY_CONSENT, PRIVACY_POLICY_HREF, allConsented, toConsentPayload, type ConsentState,
} from '@/components/magazine/ConsentCheckboxes';
import { TrackingNotice } from '@/components/magazine/TrackingNotice';
import { postSubscribe } from '@/components/magazine/subscribe-api';
import { hasLocalBrokerSubscribed, markBrokerSubscribed } from '@/lib/magazine/subscriber-local-state';
import { digitsOnly, formatKrPhoneInput, isPlausiblePhoneDigits } from '@/lib/magazine/phone-input';
import { MAGAZINE_SEND_DAY_LABEL } from '@/lib/magazine/schedule-labels';

type Channel = 'kakao' | 'email' | 'both';

interface SubscribeCardProps {
  /** 정규(canonical) slug */
  brokerId: string;
  source: 'magazine' | 'vibe_card' | 'im';
  accentColor?: string;
  brokerPhone?: string | null;
  /** 'minimal': 모바일 뉴스레터 하단 간단 옵트인 (기본), 'full': 전체 3채널 폼 */
  variant?: 'full' | 'minimal';
  /** 발행 주기 (없으면 중립 '부동산 소식지' / '이번 호' 문구 사용) */
  cadence?: 'daily' | 'weekly' | 'monthly';
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

function resolveAccessibleButtonBg(rawColor: string): string {
  const hex = rawColor.trim();
  const match = hex.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return '#1D4ED8';
  const raw = match[1];
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const lum = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const contrastWithWhite = 1.05 / (lum + 0.05);
  return contrastWithWhite >= 4.6 ? `#${full}` : '#1D4ED8';
}

export function SubscribeCard({
  brokerId,
  source,
  accentColor = '#1D4ED8',
  brokerPhone,
  variant,
  cadence,
}: SubscribeCardProps) {
  const safeButtonBg = resolveAccessibleButtonBg(accentColor);
  const effectiveVariant = variant ?? (source === 'magazine' ? 'minimal' : 'full');
  const uid = useId();
  const [channel, setChannel] = useState<Channel>('email');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [followUpEmail, setFollowUpEmail] = useState('');
  const [name, setName] = useState('');
  const [consent, setConsent] = useState<ConsentState>(EMPTY_CONSENT);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [alreadySubscribedLocally, setAlreadySubscribedLocally] = useState(false);

  useEffect(() => {
    if (effectiveVariant === 'minimal' && hasLocalBrokerSubscribed(brokerId)) {
      setAlreadySubscribedLocally(true);
    }
  }, [brokerId, effectiveVariant]);
  const [done, setDone] = useState<{
    status: 'pending' | 'confirmed';
    message?: string;
    notice?: string;
    pendingReason?: 'NO_EMAIL_CONFIRM_CHANNEL';
    submittedEmail?: string;
    submittedPhone?: string;
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
    const trimmedEmail = email.trim();
    const hasOptionalEmailInMinimalKakao =
      effectiveVariant === 'minimal' && channel === 'kakao' && trimmedEmail.length > 0;
    const effectiveChannel: Channel = hasOptionalEmailInMinimalKakao ? 'both' : channel;
    const sendPhone = effectiveChannel === 'kakao' || effectiveChannel === 'both';
    const sendEmail = effectiveChannel === 'email' || effectiveChannel === 'both';

    if (sendPhone && !isPlausiblePhoneDigits(phone)) {
      setErrorMsg('올바른 전화번호를 입력해주세요.');
      setStatus('error');
      return;
    }
    if (sendEmail && !EMAIL_RE.test(trimmedEmail)) {
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
      phone: sendPhone ? digitsOnly(phone) : undefined,
      email: sendEmail ? trimmedEmail : undefined,
      name: name.trim() || undefined,
      channel: effectiveChannel,
      source,
      referrer: refParam || undefined,
      consent: toConsentPayload(consent),
    });

    const submittedEmailVal = sendEmail ? trimmedEmail || undefined : undefined;
    const submittedPhoneVal = sendPhone ? phone.trim() || undefined : undefined;
    if (outcome.ok) {
      markBrokerSubscribed(brokerId);
      setDone({
        status: outcome.status,
        message: outcome.message,
        notice: outcome.notice,
        pendingReason: outcome.pendingReason,
        submittedEmail: submittedEmailVal,
        submittedPhone: submittedPhoneVal,
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
    if (!consentOk) {
      setErrorMsg('필수 동의 항목 확인이 필요합니다. 처음 화면에서 동의 후 다시 신청해 주세요.');
      return;
    }
    setErrorMsg('');
    setStatus('loading');
    const refParam = getRefParam();
    const submittedPhoneVal = isPlausiblePhoneDigits(phone) ? phone.trim() : undefined;
    const outcome = await postSubscribe({
      brokerId,
      phone: isPlausiblePhoneDigits(phone) ? digitsOnly(phone) : undefined,
      email: trimmedEmail,
      name: name.trim() || undefined,
      channel: 'both',
      source,
      referrer: refParam || undefined,
      consent: toConsentPayload(consent),
    });

    if (outcome.ok) {
      markBrokerSubscribed(brokerId);
      setDone({
        status: outcome.status,
        message: outcome.message,
        notice: outcome.notice,
        pendingReason: outcome.pendingReason,
        submittedEmail: trimmedEmail,
        submittedPhone: submittedPhoneVal,
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

  const inputClass =
    'w-full min-h-[48px] bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-[16px] text-slate-900 placeholder:text-slate-500 outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20 transition-colors';

  const cadenceLabel =
    cadence === 'daily'
      ? '일간'
      : cadence === 'weekly'
        ? '주간'
        : cadence === 'monthly'
          ? '월간'
          : null;
  const cadenceAdv =
    cadence === 'daily'
      ? '매일 '
      : cadence === 'weekly'
        ? '매주 '
        : cadence === 'monthly'
          ? '매월 '
          : '';
  const publicationTitle = cadenceLabel ? `${cadenceLabel} 매거진` : '부동산 소식지';
  const sendScheduleLabel =
    cadence === 'daily'
      ? '매일 아침'
      : cadence === 'weekly'
        ? MAGAZINE_SEND_DAY_LABEL
        : cadence === 'monthly'
          ? '매월 정기적으로'
          : '새 호 발행 시마다';

  const channelHelperText =
    channel === 'email'
      ? `이메일로 신청하시면 확인 링크 클릭 즉시 ${cadenceAdv}자동 발송됩니다.`
      : channel === 'kakao'
        ? '휴대폰 번호 신청 시 담당 중개사가 확인 후 안내해 드리며, 이메일을 함께 등록하시면 즉시 자동 구독됩니다.'
        : `이메일로 신청하시면 확인 링크 클릭 즉시 ${cadenceAdv}자동 발송되며, 휴대폰 안내도 함께 등록됩니다.`;

  if (effectiveVariant === 'minimal') {
    if (alreadySubscribedLocally && status === 'idle') {
      return null;
    }
    const submittedSummary = [done.submittedPhone, done.submittedEmail]
      .filter(Boolean)
      .join(' · ');
    return (
      <div
        data-testid="minimal-subscribe-optin"
        className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 text-left text-slate-900 shadow-sm space-y-3"
      >
        <div className="space-y-2">
          <div>
            <h2 className="text-[17px] font-bold text-slate-900">뉴스레터 신청</h2>
            <p className="text-[15px] text-slate-700">
              새 호가 발행되면 편하게 받아보실 수 있습니다.
            </p>
          </div>
          {status !== 'success' && (
            <>
              <div
                role="group"
                aria-label="뉴스레터 수신 방법"
                data-testid="minimal-subscribe-channel-group"
                className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 border border-slate-200 rounded-xl"
              >
                {(
                  [
                    { key: 'email', label: '이메일로 받기' },
                    { key: 'kakao', label: '휴대폰으로 받기' },
                    { key: 'both', label: '둘 다 받기' },
                  ] as const
                ).map((item) => {
                  const active = channel === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        setChannel(item.key);
                        setStatus('idle');
                        setErrorMsg('');
                      }}
                      className={`min-h-[44px] rounded-lg px-2 py-1.5 text-[14px] font-bold transition-all cursor-pointer break-keep ${
                        active
                          ? 'bg-slate-900 text-white shadow-sm'
                          : 'text-slate-800 hover:bg-slate-200'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
              <p
                data-testid="subscribe-channel-helper"
                className="text-[14px] text-slate-700 leading-snug break-keep"
              >
                {channelHelperText}
              </p>
            </>
          )}
        </div>

        {status === 'success' ? (
          <div
            role="status"
            data-testid="minimal-subscribe-success"
            className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-[15px] font-semibold text-emerald-950 leading-relaxed space-y-2.5"
          >
            {submittedSummary && (
              <p data-testid="subscribe-submitted-address" className="text-emerald-900 font-bold break-all">
                {submittedSummary} 로 신청이 접수되었습니다.
              </p>
            )}
            {!submittedSummary && (
              <p>
                {done.status === 'pending'
                  ? '뉴스레터 신청이 접수되었습니다. 확인 후 발송됩니다.'
                  : '뉴스레터 신청이 완료되었습니다.'}
              </p>
            )}
            {done.message && <p className="text-emerald-900">{done.message}</p>}
            {done.pendingReason === 'NO_EMAIL_CONFIRM_CHANNEL' && (
              <form
                onSubmit={handleFollowUpEmailSubmit}
                data-testid="minimal-followup-email-form"
                className="space-y-2 pt-1 border-t border-emerald-200"
                noValidate
              >
                <label
                  htmlFor={`${uid}-min-followup-email`}
                  className="block text-[14px] font-bold text-slate-900"
                >
                  이메일 주소 추가 등록 (즉시 자동 구독용)
                </label>
                <input
                  id={`${uid}-min-followup-email`}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="이메일 주소 (예: hong@company.co.kr)"
                  value={followUpEmail}
                  onChange={(e) => setFollowUpEmail(e.target.value)}
                  required
                  className={inputClass}
                />
                {errorMsg && (
                  <p role="alert" className="text-[14px] font-bold text-rose-700">
                    {errorMsg}
                  </p>
                )}
                <button
                  type="submit"
                  className="w-full min-h-[48px] rounded-xl bg-emerald-700 hover:bg-emerald-800 px-3 py-2 text-[15px] font-bold text-white cursor-pointer"
                >
                  이메일 함께 등록하고 자동 발송 받기
                </button>
              </form>
            )}
            <button
              type="button"
              data-testid="subscribe-reset-btn"
              onClick={() => setStatus('idle')}
              className="mt-1 inline-flex min-h-12 items-center justify-center rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-[14px] font-bold text-emerald-900 hover:bg-emerald-100 cursor-pointer"
            >
              메일·연락처 다시 입력하기
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubscribe} className="space-y-3" noValidate>
            <div>
              <label htmlFor={`${uid}-min-name`} className="sr-only">
                이름 (선택)
              </label>
              <input
                id={`${uid}-min-name`}
                data-testid="minimal-optional-name-input"
                type="text"
                maxLength={50}
                autoComplete="name"
                aria-label="이름 (선택)"
                placeholder="성함 또는 닉네임 (선택)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
              />
            </div>
            {channel === 'email' && (
              <div>
                <label htmlFor={`${uid}-min-email`} className="sr-only">
                  이메일 주소
                </label>
                <input
                  id={`${uid}-min-email`}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  aria-label="이메일 주소"
                  placeholder="이메일 주소를 입력하세요"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className={inputClass}
                />
              </div>
            )}

            {channel === 'kakao' && (
              <div className="space-y-2.5">
                <div>
                  <label htmlFor={`${uid}-min-phone`} className="sr-only">
                    휴대폰 번호
                  </label>
                  <input
                    id={`${uid}-min-phone`}
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    aria-label="휴대폰 번호"
                    placeholder="휴대폰 번호 (예: 010-1234-5678)"
                    value={phone}
                    onChange={(e) => setPhone(formatKrPhoneInput(e.target.value))}
                    required
                    className={`${inputClass} font-mono`}
                  />
                </div>
                <div>
                  <label htmlFor={`${uid}-min-optional-email`} className="sr-only">
                    이메일 주소 (선택)
                  </label>
                  <input
                    id={`${uid}-min-optional-email`}
                    data-testid="minimal-optional-email-input"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    aria-label="이메일 주소 (선택)"
                    placeholder="이메일 주소 (선택 · 함께 입력 시 즉시 자동 구독)"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>
            )}

            {channel === 'both' && (
              <div className="space-y-2.5">
                <div>
                  <label htmlFor={`${uid}-min-phone`} className="sr-only">
                    휴대폰 번호
                  </label>
                  <input
                    id={`${uid}-min-phone`}
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    aria-label="휴대폰 번호"
                    placeholder="휴대폰 번호 (필수 · 예: 010-1234-5678)"
                    value={phone}
                    onChange={(e) => setPhone(formatKrPhoneInput(e.target.value))}
                    required
                    className={`${inputClass} font-mono`}
                  />
                </div>
                <div>
                  <label htmlFor={`${uid}-min-email`} className="sr-only">
                    이메일 주소
                  </label>
                  <input
                    id={`${uid}-min-email`}
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    aria-label="이메일 주소"
                    placeholder="이메일 주소 (필수 · 확인 링크 수신용)"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className={inputClass}
                  />
                </div>
              </div>
            )}

            <fieldset className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1.5">
              <legend className="sr-only">뉴스레터 구독 필수 동의</legend>

              <label
                htmlFor={`${uid}-min-consent-all`}
                className="flex min-h-12 items-center gap-2.5 rounded-lg border border-indigo-300 bg-white px-3 py-2 cursor-pointer text-[15px] font-bold text-slate-900 select-none"
              >
                <input
                  id={`${uid}-min-consent-all`}
                  type="checkbox"
                  data-testid="minimal-subscribe-consent"
                  checked={consentOk}
                  onChange={(e) => {
                    const agreed = e.target.checked;
                    setConsent({ privacy: agreed, marketing: agreed, age14: agreed });
                  }}
                  className="h-5 w-5 rounded border-slate-400 accent-indigo-700 shrink-0"
                />
                <span className="break-keep">필수 항목 모두 동의</span>
              </label>

              <div className="flex min-h-12 items-start gap-2.5 px-1 py-1.5 text-[14px] text-slate-800">
                <input
                  id={`${uid}-min-consent-privacy`}
                  type="checkbox"
                  data-testid="minimal-consent-privacy"
                  checked={consent.privacy}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setConsent((prev) => ({ ...prev, privacy: checked }));
                  }}
                  className="mt-0.5 h-5 w-5 rounded border-slate-400 accent-indigo-700 shrink-0 cursor-pointer"
                />
                <div className="leading-snug break-keep">
                  <label htmlFor={`${uid}-min-consent-privacy`} className="cursor-pointer select-none">
                    <b className="text-slate-900">[필수]</b> 개인정보 수집·이용 동의
                  </label>{' '}
                  <a
                    href={PRIVACY_POLICY_HREF}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline text-indigo-700 hover:text-indigo-900 font-semibold ml-1"
                  >
                    개인정보 처리방침 보기 (새 창)
                  </a>
                </div>
              </div>

              <label
                htmlFor={`${uid}-min-consent-marketing`}
                className="flex min-h-12 items-center gap-2.5 px-1 py-1 text-[14px] text-slate-800 cursor-pointer select-none"
              >
                <input
                  id={`${uid}-min-consent-marketing`}
                  type="checkbox"
                  data-testid="minimal-consent-marketing"
                  checked={consent.marketing}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setConsent((prev) => ({ ...prev, marketing: checked }));
                  }}
                  className="h-5 w-5 rounded border-slate-400 accent-indigo-700 shrink-0 cursor-pointer"
                />
                <span className="leading-snug break-keep">
                  <b className="text-slate-900">[필수]</b> 뉴스레터(광고성 정보) 수신 동의
                </span>
              </label>

              <label
                htmlFor={`${uid}-min-consent-age14`}
                className="flex min-h-12 items-center gap-2.5 px-1 py-1 text-[14px] text-slate-800 cursor-pointer select-none"
              >
                <input
                  id={`${uid}-min-consent-age14`}
                  type="checkbox"
                  data-testid="minimal-consent-age14"
                  checked={consent.age14}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setConsent((prev) => ({ ...prev, age14: checked }));
                  }}
                  className="h-5 w-5 rounded border-slate-400 accent-indigo-700 shrink-0 cursor-pointer"
                />
                <span className="leading-snug break-keep">
                  <b className="text-slate-900">[필수]</b> 만 14세 이상 확인
                </span>
              </label>
            </fieldset>

            <TrackingNotice />

            {status === 'error' && (
              <p role="alert" className="text-[15px] text-rose-700 font-bold">
                {errorMsg}
              </p>
            )}

            <button
              type="submit"
              data-testid="minimal-subscribe-submit"
              disabled={status === 'loading' || !consentOk}
              className="w-full min-h-[48px] py-2.5 rounded-xl text-[16px] font-bold text-white transition-all active:scale-[0.98] disabled:opacity-100 disabled:bg-slate-200 disabled:text-slate-700 disabled:border disabled:border-slate-300 disabled:cursor-not-allowed"
              style={consentOk && status !== 'loading' ? { background: safeButtonBg } : undefined}
            >
              {status === 'loading' ? '신청 중...' : '뉴스레터 신청하기'}
            </button>
          </form>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 text-left text-slate-900 shadow-sm">
      <div className="space-y-1.5">
        <h2 className="text-[19px] font-bold text-slate-900 flex items-center gap-1.5">
          <span aria-hidden>📰</span> {publicationTitle} 구독하기
        </h2>
        <p className="text-[15px] leading-relaxed text-slate-700 break-keep">
          중개인이 엄선한 최신 상업용 빌딩·수익형 부동산 정보 및 리포트를 {sendScheduleLabel} 받아보세요.
        </p>
      </div>

      {status === 'success' && done.pendingReason === 'NO_EMAIL_CONFIRM_CHANNEL' ? (
        <div
          role="status"
          aria-label="구독 접수 완료"
          className="rounded-2xl border border-emerald-300 bg-emerald-50 p-5 text-left text-emerald-950 space-y-4 shadow-sm"
        >
          <div className="space-y-1.5">
            <h3 className="text-[18px] sm:text-[19px] font-extrabold text-slate-900 leading-snug break-keep">
              🎉 구독 신청이 접수되었습니다! (이메일을 함께 남겨주시면 {cadenceAdv}발행 즉시 자동 발송됩니다)
            </h3>
            <p className="text-[15px] leading-relaxed text-emerald-900 break-keep">
              전화번호로 신청이 안전하게 완료되었습니다. 이메일 주소를 함께 남겨주시면 {cadenceAdv}발행 즉시 기다림 없이 자동으로 전달됩니다.
            </p>
          </div>
          {done.notice && (
            <p className="text-[14px] font-semibold text-emerald-800 break-keep">{done.notice}</p>
          )}
          <form onSubmit={handleFollowUpEmailSubmit} className="space-y-2.5 pt-1" noValidate>
            <div>
              <label htmlFor={`${uid}-followup-email`} className="block mb-1.5 text-[15px] font-bold text-slate-900">
                이메일 주소 추가 등록 (선택)
              </label>
              <input
                id={`${uid}-followup-email`}
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="이메일 주소 (예: hong@company.co.kr)"
                value={followUpEmail}
                onChange={(e) => setFollowUpEmail(e.target.value)}
                required
                className="w-full min-h-[48px] rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-[16px] text-slate-900 placeholder:text-slate-500 outline-none focus:border-emerald-700 transition-colors"
              />
            </div>
            {errorMsg && (
              <p role="alert" className="text-[15px] font-bold text-rose-700">
                {errorMsg}
              </p>
            )}
            <button
              type="submit"
              className="w-full min-h-[52px] rounded-xl bg-emerald-700 hover:bg-emerald-800 px-4 py-3 text-[17px] font-bold text-white shadow-sm transition-colors"
            >
              📧 이메일 함께 등록하고 자동 발송 받기
            </button>
          </form>
          <PhoneActionButton
            phone={brokerPhone}
            variant="inline"
            callLabel="📞 중개사에게 전화로 직접 문의하기"
            callClassName="flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-center text-[15px] font-semibold text-slate-900 transition hover:bg-slate-50"
          />
        </div>
      ) : status === 'success' ? (
        <div role="status" className="bg-emerald-50 border border-emerald-300 text-emerald-950 rounded-xl p-4 text-center text-[16px] font-semibold leading-relaxed space-y-2">
          {(done.submittedPhone || done.submittedEmail) && (
            <p data-testid="subscribe-submitted-address" className="text-[15px] font-bold text-emerald-900 break-all">
              {[done.submittedPhone, done.submittedEmail].filter(Boolean).join(' · ')} 로 신청이 접수되었습니다.
            </p>
          )}
          <p>
            {done.status === 'pending' && !done.message?.includes('확인 후')
              ? '구독 신청이 접수되었습니다. 확인 후 발송이 시작됩니다. '
              : done.status === 'confirmed' && !done.message?.includes('완료')
              ? '구독이 완료되었습니다. '
              : ''}
            {!done.message?.includes('발송') && `${MAGAZINE_SEND_DAY_LABEL} 발송됩니다.`}
          </p>
          {done.message && <p className="text-[15px] font-normal text-emerald-900">{done.message}</p>}
          {done.notice && <p className="text-[15px] font-bold text-amber-800">{done.notice}</p>}
          <div className="pt-1">
            <button
              type="button"
              data-testid="subscribe-reset-btn"
              onClick={() => setStatus('idle')}
              className="inline-flex min-h-12 items-center justify-center rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-sm font-bold text-emerald-900 hover:bg-emerald-100 cursor-pointer"
            >
              메일·연락처 다시 입력하기
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubscribe} className="space-y-3.5" noValidate>
          <div role="group" aria-label="수신 채널" className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 border border-slate-200 rounded-xl">
            {CHANNELS.map((item) => (
              <button
                key={item.key}
                type="button"
                aria-pressed={channel === item.key}
                onClick={() => { setChannel(item.key); setStatus('idle'); }}
                className={`min-h-[48px] py-2 text-[16px] font-bold rounded-lg transition-all ${
                  channel === item.key
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-800 hover:bg-slate-200'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <p
            data-testid="subscribe-channel-helper"
            className="text-[14px] text-slate-700 leading-snug break-keep"
          >
            {channelHelperText}
          </p>

          <div>
            <label htmlFor={`${uid}-name`} className="block mb-1.5 text-[15px] font-semibold text-slate-900">
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
              <label htmlFor={`${uid}-phone`} className="block mb-1.5 text-[15px] font-semibold text-slate-900">
                휴대폰 번호 (필수 · 숫자만 입력하셔도 됩니다)
              </label>
              <input
                id={`${uid}-phone`}
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                placeholder="휴대폰 번호 (예: 010-1234-5678)"
                value={phone}
                onChange={(e) => setPhone(formatKrPhoneInput(e.target.value))}
                required
                className={`${inputClass} font-mono`}
              />
            </div>
          )}

          {needEmail && (
            <div>
              <label htmlFor={`${uid}-email`} className="block mb-1.5 text-[15px] font-semibold text-slate-900">
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
          <p className="text-[14px] text-slate-700 leading-snug break-keep">
            개인정보 처리 및 보유 기준은{' '}
            <a
              href={PRIVACY_POLICY_HREF}
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-indigo-700 hover:text-indigo-900 font-semibold"
            >
              개인정보 처리방침 보기 (새 창)
            </a>
            에서 언제든 확인하실 수 있습니다.
          </p>
          <TrackingNotice />

          {status === 'error' && (
            <p role="alert" className="text-[15px] text-rose-700 font-bold">
              {errorMsg}
            </p>
          )}

          {!consentOk && (
            <p className="text-[15px] font-semibold text-amber-800 leading-snug break-keep">
              ☝️ 위 필수 동의 항목(&apos;필수 항목 모두 동의&apos; 포함)에 체크하시면 신청 버튼이 켜집니다
            </p>
          )}

          <button
            type="submit"
            disabled={status === 'loading' || !consentOk}
            className="w-full min-h-[52px] py-3 rounded-xl text-[17px] font-bold text-white transition-all active:scale-[0.98] disabled:opacity-100 disabled:bg-slate-200 disabled:text-slate-700 disabled:border disabled:border-slate-300 disabled:cursor-not-allowed"
            style={consentOk && status !== 'loading' ? { background: safeButtonBg } : undefined}
          >
            {status === 'loading' ? '신청 중...' : CTA_TEXT[channel]}
          </button>
        </form>
      )}
    </div>
  );
}
