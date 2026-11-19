'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2, Bell, ArrowRight, Phone, User, Mail, Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import {
  ConsentCheckboxes, EMPTY_CONSENT, PRIVACY_POLICY_HREF, allConsented, toConsentPayload, type ConsentState,
} from '@/components/magazine/ConsentCheckboxes';
import { TrackingNotice } from '@/components/magazine/TrackingNotice';
import { postSubscribe } from '@/components/magazine/subscribe-api';
import { digitsOnly, formatKrPhoneInput, isPlausiblePhoneDigits } from '@/lib/magazine/phone-input';
import { REGION_LABELS, ASSET_LABELS } from '@/lib/magazine/tags';

interface SubscribeFormClientProps {
  /** 정규(canonical) slug — 서버가 해석한 값 */
  brokerId: string;
  brokerName: string;
  brokerPhone?: string | null;
  regions: string[];
  assets: string[];
  initialSource: string;
  referrer: string | null;
  /** 실제 최신 published 발행본 날짜(KST). 없으면 null → 링크 숨김 */
  latestDate: string | null;
}

const REGION_OPTIONS: readonly string[] = REGION_LABELS;
const ASSET_OPTIONS: readonly string[] = ASSET_LABELS;

// 입력은 16px(text-[16px]) 이상 — iOS 확대 방지 및 60대 가독성 보장.
const INPUT_CLS =
  // eslint-disable-next-line cre-magazine/no-restricted-syntax
  'w-full min-h-[48px] bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-[16px] text-slate-900 placeholder:text-slate-500 focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600/20';
const CHIP_BASE = 'min-h-[48px] text-label px-3.5 py-2.5 rounded-xl border transition-colors';

type FormResult = {
  status: 'pending' | 'confirmed';
  message?: string;
  notice?: string;
  pendingReason?: 'NO_EMAIL_CONFIRM_CHANNEL';
  submittedEmail?: string;
  submittedPhone?: string;
};

export function SubscribeFormClient({
  brokerId,
  brokerName,
  brokerPhone,
  initialSource,
  referrer,
  latestDate,
}: SubscribeFormClientProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [followUpEmail, setFollowUpEmail] = useState('');
  const [followUpError, setFollowUpError] = useState('');
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  const [selectedAssets, setSelectedAssets] = useState<string[]>([]);
  const [consent, setConsent] = useState<ConsentState>(EMPTY_CONSENT);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FormResult | null>(null);

  function toggleRegion(r: string) {
    setSelectedRegions(prev => (prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]));
  }

  function toggleAsset(a: string) {
    setSelectedAssets(prev => (prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a]));
  }

  const consentOk = allConsented(consent);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!isPlausiblePhoneDigits(phone)) {
      toast.error('올바른 휴대폰 번호를 입력해주세요.');
      return;
    }
    if (!consentOk) {
      toast.error('필수 동의 항목을 모두 체크해주세요.');
      return;
    }
    const emailTrim = email.trim();
    if (emailTrim && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) {
      toast.error('올바른 이메일 주소를 입력해주세요.');
      return;
    }

    setLoading(true);
    const outcome = await postSubscribe({
      brokerId,
      phone: digitsOnly(phone),
      name: name.trim() || undefined,
      email: emailTrim || undefined,
      channel: emailTrim ? 'both' : 'kakao',
      source: initialSource || 'qr_card',
      tags: [...selectedRegions, ...selectedAssets],
      referrer: referrer || undefined,
      consent: toConsentPayload(consent),
    });
    setLoading(false);

    if (!outcome.ok) {
      toast.error(outcome.message);
      return;
    }
    const submittedEmailTrim = emailTrim || undefined;
    const submittedPhoneRaw = isPlausiblePhoneDigits(phone) ? phone.trim() : undefined;
    setResult({
      status: outcome.status,
      message: outcome.message,
      notice: outcome.notice,
      pendingReason: outcome.pendingReason,
      submittedEmail: submittedEmailTrim,
      submittedPhone: submittedPhoneRaw,
    });
    toast.success('구독 신청이 접수되었습니다.');
  }

  async function handleFollowUpEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedEmail = followUpEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmedEmail)) {
      setFollowUpError('확인 링크를 받을 올바른 이메일 주소를 입력해주세요.');
      toast.error('올바른 이메일 주소를 입력해주세요.');
      return;
    }
    if (!consentOk) {
      setFollowUpError('필수 동의 항목 확인이 필요합니다. 페이지를 새로고침한 뒤 필수 동의에 체크해 주세요.');
      toast.error('필수 동의 항목을 모두 체크해주세요.');
      return;
    }
    setFollowUpError('');
    setLoading(true);
    const outcome = await postSubscribe({
      brokerId,
      phone: isPlausiblePhoneDigits(phone) ? digitsOnly(phone) : undefined,
      name: name.trim() || undefined,
      email: trimmedEmail,
      channel: 'both',
      source: initialSource || 'qr_card',
      tags: [...selectedRegions, ...selectedAssets],
      referrer: referrer || undefined,
      consent: toConsentPayload(consent),
    });
    setLoading(false);

    if (!outcome.ok) {
      setFollowUpError(outcome.message);
      toast.error(outcome.message);
      return;
    }
    setEmail(trimmedEmail);
    setResult({
      status: outcome.status,
      message: outcome.message,
      notice: outcome.notice,
      pendingReason: outcome.pendingReason,
      submittedEmail: trimmedEmail,
      submittedPhone: isPlausiblePhoneDigits(phone) ? phone.trim() : undefined,
    });
    toast.success('확인용 이메일이 등록되었습니다. 이메일함을 확인해 주세요.');
  }

  const cleanBrokerDigits = brokerPhone ? digitsOnly(brokerPhone) : '';
  const phoneCallHref = cleanBrokerDigits
    ? `tel:${cleanBrokerDigits}`
    : `/magazine/${encodeURIComponent(brokerId)}`;

  if (result) {
    const pending = result.status === 'pending';
    const isNoEmailConfirm = result.pendingReason === 'NO_EMAIL_CONFIRM_CHANNEL';
    const targetAddr = result.submittedEmail || result.submittedPhone;
    const messageHasSchedule = Boolean(result.message?.includes('발송'));
    return (
      <div role="status" className="bg-white border border-emerald-300 rounded-2xl p-6 text-center space-y-4 shadow-sm animate-in fade-in zoom-in-95 duration-200">
        <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-7 h-7" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-slate-900">
            {pending ? '구독 신청이 접수되었습니다' : '구독이 완료되었습니다'}
          </h2>
          {targetAddr && (
            <p
              data-testid="subscribe-submitted-address"
              className="text-label font-bold text-emerald-800 break-all"
            >
              수신 주소: {targetAddr}
            </p>
          )}
          <p className="text-body text-slate-700 leading-relaxed break-keep">
            {pending && !result.message?.includes('확인 후')
              ? '확인 후 발송이 시작됩니다. '
              : ''}
            {!messageHasSchedule && `${brokerName} 중개사의 정기 부동산 브리핑은 이메일 인증 완료 후 무료 발송됩니다.`}
          </p>
          {/* 서버가 내려준 안내는 가공 없이 그대로 표시 (B2 계약: message / pendingReason) */}
          {result.message && <p className="text-label text-slate-700 leading-relaxed break-keep">{result.message}</p>}
          {result.notice && <p className="text-label font-bold text-amber-800 leading-relaxed break-keep">{result.notice}</p>}
          <div className="pt-1">
            <button
              type="button"
              data-testid="subscribe-reset-btn"
              onClick={() => setResult(null)}
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-300 bg-slate-100 px-3.5 py-2 text-sm font-bold text-slate-900 hover:bg-slate-200 cursor-pointer"
            >
              메일·연락처 다시 입력하기
            </button>
          </div>
        </div>

        {isNoEmailConfirm && (
          <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-4 text-left text-amber-950 space-y-3">
            <p className="text-body font-bold leading-snug text-amber-950 break-keep">
              ⚠️ 아직 구독 신청이 끝나지 않았어요 — 확인용 이메일을 적어 주세요
            </p>
            <p className="text-label leading-relaxed text-amber-900 break-keep">
              현재 본인 확인 링크는 이메일로 발송됩니다. 아래에 이메일 주소를 적고 버튼을 누르시면 바로 구독 확인이 진행됩니다.
            </p>
            <form onSubmit={handleFollowUpEmailSubmit} className="space-y-2.5" noValidate>
              <div>
                <label htmlFor="sub-followup-email" className="block mb-1.5 text-label font-bold text-amber-950">
                  확인 링크를 받을 이메일 주소
                </label>
                <input
                  id="sub-followup-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="이메일 주소 (예: hong@example.com)"
                  value={followUpEmail}
                  onChange={e => setFollowUpEmail(e.target.value)}
                  required
                  // eslint-disable-next-line cre-magazine/no-restricted-syntax
                  className="w-full min-h-[48px] rounded-xl border-2 border-amber-400 bg-white px-3.5 py-2.5 text-[16px] text-slate-900 placeholder:text-slate-500 outline-none focus:border-amber-700"
                />
              </div>
              {followUpError && (
                <p role="alert" className="text-label font-bold text-rose-800">
                  {followUpError}
                </p>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[52px] rounded-xl bg-amber-900 px-4 py-3 text-body font-bold text-white shadow-xs transition hover:bg-amber-950 disabled:opacity-60"
              >
                {loading ? '등록 중...' : '📧 이메일 입력하고 구독 완료하기'}
              </button>
            </form>
            <a
              href={phoneCallHref}
              className="flex min-h-12 w-full items-center justify-center rounded-xl border border-amber-700 bg-white px-4 py-2.5 text-center text-label font-bold text-amber-950 transition hover:bg-amber-100"
            >
              📞 이메일이 없으신가요? 중개사에게 전화로 구독 신청하기
            </a>
          </div>
        )}

        {latestDate && (
          <div className="pt-2">
            <Link
              href={`/magazine/${brokerId}/${latestDate}`}
              className="flex items-center justify-center gap-1.5 w-full min-h-12 py-3 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white text-body font-bold transition-colors shadow-sm"
            >
              <span>최근 매거진 열람하기</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
          </div>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
      {/* 1. 이름 & 전화번호 & 이메일 */}
      <div className="space-y-3.5">
        <div className="space-y-1.5">
          <label htmlFor="sub-name" className="text-label font-semibold text-slate-900 flex items-center gap-1.5">
            <User className="w-4 h-4 text-slate-600" aria-hidden="true" />
            성함 또는 닉네임 (선택)
          </label>
          <input
            id="sub-name"
            type="text"
            autoComplete="name"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="예: 김대표, 투자자"
            className={INPUT_CLS}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="sub-phone" className="text-body font-bold text-slate-900 flex items-center gap-1.5">
            <Phone className="w-4 h-4 text-indigo-700" aria-hidden="true" />
            휴대폰 번호 <span className="text-rose-700" aria-hidden="true">*</span>
          </label>
          <input
            id="sub-phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            required
            value={phone}
            onChange={e => setPhone(formatKrPhoneInput(e.target.value))}
            placeholder="010-1234-5678"
            className={`${INPUT_CLS} font-mono`}
          />
          <p className="text-sm text-slate-700">구독자 확인 및 중개사 안내용 번호입니다. 숫자만 입력하면 하이픈(-)이 자동으로 들어갑니다.</p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="sub-email" className="text-label font-semibold text-slate-900 flex items-center gap-1.5">
            <Mail className="w-4 h-4 text-amber-700" aria-hidden="true" />
            이메일 (정기 소식지 자동 수신용 · 권장)
          </label>
          <input
            id="sub-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="name@example.com"
            className={INPUT_CLS}
          />
          <p className="text-sm font-medium text-amber-800 leading-snug break-keep">
            이메일 인증 완료 후 정기 부동산 브리핑이 무료로 자동 발송됩니다. 이메일을 입력하시면 확인 링크를 받아 바로 구독이 시작됩니다.
          </p>
        </div>
      </div>

      {/* 2. 관심 권역 선택 */}
      <div className="space-y-2 pt-1" role="group" aria-labelledby="sub-regions-label">
        <p id="sub-regions-label" className="text-label font-semibold text-slate-900">
          관심 권역 (선택 · 맞춤 매물 안내)
        </p>
        <div className="flex flex-wrap gap-2">
          {REGION_OPTIONS.map(r => {
            const isSelected = selectedRegions.includes(r);
            return (
              <button
                type="button"
                key={r}
                aria-pressed={isSelected}
                onClick={() => toggleRegion(r)}
                className={`${CHIP_BASE} ${
                  isSelected
                    ? 'border-indigo-700 bg-indigo-700 text-white font-bold'
                    : 'border-slate-300 bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-50'
                }`}
              >
                {isSelected ? '✓ ' : ''}{r}
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. 관심 자산 유형 선택 */}
      <div className="space-y-2" role="group" aria-labelledby="sub-assets-label">
        <p id="sub-assets-label" className="text-label font-semibold text-slate-900">
          관심 자산 (선택)
        </p>
        <div className="flex flex-wrap gap-2">
          {ASSET_OPTIONS.map(a => {
            const isSelected = selectedAssets.includes(a);
            return (
              <button
                type="button"
                key={a}
                aria-pressed={isSelected}
                onClick={() => toggleAsset(a)}
                className={`${CHIP_BASE} ${
                  isSelected
                    ? 'border-indigo-700 bg-indigo-700 text-white font-bold'
                    : 'border-slate-300 bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-50'
                }`}
              >
                {isSelected ? '✓ ' : ''}{a}
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. 필수 동의 3종 + 추적/개인정보 고지 */}
      <ConsentCheckboxes value={consent} onChange={setConsent} idPrefix="sub-page" />
      <p className="text-sm text-slate-700 leading-snug break-keep">
        수집된 정보의 처리 및 보유 기준은{' '}
        <a
          href={PRIVACY_POLICY_HREF}
          target="_blank"
          rel="noopener noreferrer"
          className="underline text-indigo-700 hover:text-indigo-900 font-semibold"
        >
          개인정보 처리방침 보기 (새 창)
        </a>
        에서 확인하실 수 있습니다.
      </p>
      <TrackingNotice />

      {!consentOk && (
        <p className="text-label font-semibold text-amber-800 text-center leading-snug break-keep">
          ☝️ 위 필수 동의 항목(&apos;필수 항목 모두 동의&apos; 포함)에 체크하시면 신청 버튼이 켜집니다
        </p>
      )}

      {/* 5. 제출 버튼 */}
      <button
        type="submit"
        disabled={loading || !consentOk}
        className="w-full min-h-[52px] py-3.5 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white text-body font-black transition-colors shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-100 disabled:bg-slate-200 disabled:text-slate-700 disabled:border disabled:border-slate-300 disabled:cursor-not-allowed"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            <span>신청 처리 중...</span>
          </>
        ) : (
          <>
            <Bell className="w-4 h-4 fill-current text-amber-300" aria-hidden="true" />
            <span>무료 구독하기</span>
          </>
        )}
      </button>
      {!consentOk && (
        <p className="text-label text-slate-700 text-center">필수 동의 3개를 모두 체크하면 신청할 수 있습니다.</p>
      )}
    </form>
  );
}
