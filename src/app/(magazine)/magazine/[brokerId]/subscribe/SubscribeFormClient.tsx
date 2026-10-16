'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2, Bell, ArrowRight, Phone, User, Mail, Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import {
  ConsentCheckboxes, EMPTY_CONSENT, allConsented, toConsentPayload, type ConsentState,
} from '@/components/magazine/ConsentCheckboxes';
import { TrackingNotice } from '@/components/magazine/TrackingNotice';
import { postSubscribe } from '@/components/magazine/subscribe-api';
import { digitsOnly, formatKrPhoneInput, isPlausiblePhoneDigits } from '@/lib/magazine/phone-input';
import { MAGAZINE_SEND_DAY_LABEL } from '@/lib/magazine/schedule-labels';
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

// 입력은 16px(text-base) 이상 — iOS 확대 방지 및 60대 가독성 보장.
const INPUT_CLS =
  'w-full min-h-12 bg-slate-950 border border-slate-500 rounded-xl px-3.5 py-2.5 text-base text-white placeholder:text-slate-300 focus:outline-none focus:border-indigo-400';
const CHIP_BASE = 'min-h-12 text-[15px] px-3.5 py-2.5 rounded-xl border transition-colors';

type FormResult = {
  status: 'pending' | 'confirmed';
  message?: string;
  notice?: string;
  pendingReason?: 'NO_EMAIL_CONFIRM_CHANNEL';
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
    setResult({
      status: outcome.status,
      message: outcome.message,
      notice: outcome.notice,
      pendingReason: outcome.pendingReason,
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
      consent: toConsentPayload(consentOk ? consent : { privacy: true, marketing: true, age14: true }),
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
    return (
      <div role="status" className="bg-slate-900 border border-emerald-500/40 rounded-2xl p-6 text-center space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-7 h-7" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <h2 className="text-[20px] font-bold text-white">
            {pending ? '구독 신청이 접수되었습니다' : '구독이 완료되었습니다'}
          </h2>
          <p className="text-[16px] text-slate-200 leading-relaxed break-keep">
            {pending
              ? '확인 후 발송이 시작됩니다. '
              : ''}
            {brokerName} 중개사의 매거진은 {MAGAZINE_SEND_DAY_LABEL} 발송됩니다.
          </p>
          {/* 서버가 내려준 안내는 가공 없이 그대로 표시 (B2 계약: message / pendingReason) */}
          {result.message && <p className="text-[15px] text-slate-200 leading-relaxed break-keep">{result.message}</p>}
          {result.notice && <p className="text-[15px] font-bold text-amber-200 leading-relaxed break-keep">{result.notice}</p>}
        </div>

        {isNoEmailConfirm && (
          <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-4 text-left text-amber-950 space-y-3">
            <p className="text-[17px] font-bold leading-snug text-amber-950 break-keep">
              ⚠️ 아직 구독 신청이 끝나지 않았어요 — 확인용 이메일을 적어 주세요
            </p>
            <p className="text-[15px] leading-relaxed text-amber-900 break-keep">
              현재 본인 확인 링크는 이메일로 발송됩니다. 아래에 이메일 주소를 적고 버튼을 누르시면 바로 구독 확인이 진행됩니다.
            </p>
            <form onSubmit={handleFollowUpEmailSubmit} className="space-y-2.5" noValidate>
              <div>
                <label htmlFor="sub-followup-email" className="block mb-1.5 text-[15px] font-bold text-amber-950">
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
                  className="w-full min-h-12 rounded-xl border-2 border-amber-400 bg-white px-3.5 py-2.5 text-[16px] text-slate-900 placeholder:text-slate-500 outline-none focus:border-amber-700"
                />
              </div>
              {followUpError && (
                <p role="alert" className="text-[15px] font-bold text-rose-800">
                  {followUpError}
                </p>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[52px] rounded-xl bg-amber-900 px-4 py-3 text-[17px] font-bold text-white shadow-xs transition hover:bg-amber-950 disabled:opacity-60"
              >
                {loading ? '등록 중...' : '📧 이메일 입력하고 구독 완료하기'}
              </button>
            </form>
            <a
              href={phoneCallHref}
              className="flex min-h-12 w-full items-center justify-center rounded-xl border border-amber-700 bg-white px-4 py-2.5 text-center text-[15px] font-bold text-amber-950 transition hover:bg-amber-100"
            >
              📞 이메일이 없으신가요? 중개사에게 전화로 구독 신청하기
            </a>
          </div>
        )}

        {latestDate && (
          <div className="pt-2">
            <Link
              href={`/magazine/${brokerId}/${latestDate}`}
              className="flex items-center justify-center gap-1.5 w-full min-h-12 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-[16px] font-bold transition-all shadow-lg shadow-indigo-900/30"
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
    <form onSubmit={handleSubmit} className="bg-slate-900/95 border border-slate-700 rounded-2xl p-5 shadow-2xl space-y-4">
      {/* 1. 이름 & 전화번호 & 이메일 */}
      <div className="space-y-3.5">
        <div className="space-y-1.5">
          <label htmlFor="sub-name" className="text-[15px] font-semibold text-slate-100 flex items-center gap-1.5">
            <User className="w-4 h-4 text-slate-300" aria-hidden="true" />
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
          <label htmlFor="sub-phone" className="text-[16px] font-bold text-white flex items-center gap-1.5">
            <Phone className="w-4 h-4 text-indigo-300" aria-hidden="true" />
            휴대폰 번호 <span className="text-rose-300" aria-hidden="true">*</span>
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
          <p className="text-[14px] text-slate-200">알림톡 수신용 번호입니다. 숫자만 입력하면 하이픈이 자동으로 들어갑니다.</p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="sub-email" className="text-[15px] font-semibold text-slate-100 flex items-center gap-1.5">
            <Mail className="w-4 h-4 text-amber-300" aria-hidden="true" />
            이메일 (선택 · 확인 링크 수신 권장)
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
          <p className="text-[14px] font-medium text-amber-200 leading-snug break-keep">
            이메일을 입력하면 확인 링크를 받아 바로 매거진 수신을 시작할 수 있어요.
          </p>
        </div>
      </div>

      {/* 2. 관심 권역 선택 */}
      <div className="space-y-2 pt-1" role="group" aria-labelledby="sub-regions-label">
        <p id="sub-regions-label" className="text-[15px] font-semibold text-slate-100">
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
                    ? 'border-indigo-400 bg-indigo-950 text-white font-bold'
                    : 'border-slate-500 bg-slate-900 text-slate-100 hover:border-slate-300'
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
        <p id="sub-assets-label" className="text-[15px] font-semibold text-slate-100">
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
                    ? 'border-indigo-400 bg-indigo-950 text-white font-bold'
                    : 'border-slate-500 bg-slate-900 text-slate-100 hover:border-slate-300'
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
      <TrackingNotice />

      {!consentOk && (
        <p className="text-[15px] font-semibold text-amber-200 text-center leading-snug break-keep">
          ☝️ 위 필수 동의 항목(&apos;필수 항목 모두 동의&apos; 포함)에 체크하시면 신청 버튼이 켜집니다
        </p>
      )}

      {/* 5. 제출 버튼 */}
      <button
        type="submit"
        disabled={loading || !consentOk}
        className="w-full min-h-[52px] py-3.5 rounded-xl bg-gradient-to-r from-amber-500 via-indigo-600 to-purple-600 hover:from-amber-400 hover:to-purple-500 text-white text-[17px] font-black transition-all shadow-lg shadow-indigo-950/50 flex items-center justify-center gap-1.5 disabled:opacity-100 disabled:bg-slate-700 disabled:from-slate-700 disabled:via-slate-700 disabled:to-slate-700 disabled:text-slate-100 disabled:border disabled:border-slate-500 disabled:cursor-not-allowed"
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
        <p className="text-[15px] text-slate-200 text-center">필수 동의 3개를 모두 체크하면 신청할 수 있습니다.</p>
      )}
    </form>
  );
}
