'use client';

import React, { useId, useState } from 'react';
import { formatKrPhoneInput } from '@/lib/format/phone';

export interface GateRequestFormProps {
  buildingId: string;
  initialStatus: 'none' | 'pending' | 'approved' | 'rejected' | 'completed';
  userId?: string;
  onSubmitRequest?: (
    buildingId: string,
    payloadReason: string
  ) => Promise<{ success: boolean; error?: string }>;
}

export default function GateRequestForm({
  buildingId,
  initialStatus,
  userId,
  onSubmitRequest,
}: GateRequestFormProps) {
  const uid = useId();
  const nameId = `${uid}-gate-req-name`;
  const contactId = `${uid}-gate-req-contact`;
  const companyId = `${uid}-gate-req-company`;
  const reasonId = `${uid}-gate-req-reason`;
  const consentId = `${uid}-gate-req-privacy`;

  const [status, setStatus] = useState(initialStatus);
  const [reason, setReason] = useState('');
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [company, setCompany] = useState('');
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (status === 'approved' || status === 'completed') {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center">
        <div className="mb-1 text-base font-bold text-emerald-800">
          상세 IM 열람이 승인되었습니다
        </div>
        <p className="mb-4 text-sm text-emerald-700">
          담당 공인중개사가 상세 투자설명서(IM) 열람을 승인했습니다.
        </p>
        <a
          href={`/im-lite/${buildingId}`}
          className="inline-flex min-h-[48px] items-center justify-center rounded-lg bg-emerald-600 px-6 py-3 text-[16px] font-bold text-white shadow-sm transition-colors hover:bg-emerald-700"
        >
          상세 IM 바로 열람하기 →
        </a>
      </div>
    );
  }

  if (status === 'pending') {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-center">
        <div className="mb-1 text-base font-bold text-amber-800">
          담당 공인중개사가 IM 열람 요청을 확인 중입니다
        </div>
        <p className="text-sm text-amber-700">
          승인이 완료되면 입력하신 연락처로 안내 링크를 전달해 드립니다.
        </p>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!userId && (!name.trim() || !contact.trim())) {
      setErrorMsg('성함과 연락처를 입력해 주세요.');
      return;
    }
    if (!userId && !privacyConsent) {
      setErrorMsg('개인정보 수집 및 이용에 동의해 주세요.');
      return;
    }

    setLoading(true);
    try {
      const payloadReason = userId
        ? reason
        : JSON.stringify({
            type: 'anonymous_lead',
            name: name.trim(),
            phone: contact.trim(),
            company: company.trim() || undefined,
            message: reason.trim() || '상세 IM 열람을 요청합니다.',
          });
      if (onSubmitRequest) {
        const res = await onSubmitRequest(buildingId, payloadReason);
        if (res.success) {
          setStatus('pending');
        } else {
          setErrorMsg(res.error || '요청 처리 중 문제가 발생했습니다.');
        }
      } else {
        const res = await fetch('/api/gate-requests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            buildingId,
            building_id: buildingId,
            ...(!userId
              ? {
                  name: name.trim(),
                  phone: contact.trim(),
                  company: company.trim() || undefined,
                  privacyConsent: true,
                }
              : {}),
            reason: payloadReason,
          }),
        });
        const json = await res.json().catch(() => null);
        if (res.ok && json?.error === undefined) {
          setStatus('pending');
        } else {
          const extractedErr =
            typeof json?.error === 'string'
              ? json.error
              : typeof json?.error?.message === 'string'
              ? json.error.message
              : '요청 처리 중 문제가 발생했습니다.';
          setErrorMsg(extractedErr);
        }
      }
    } catch {
      setErrorMsg('일시적인 네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-slate-200 bg-slate-50 p-5"
    >
      <div className="mb-3">
        <h3 className="text-base font-bold text-slate-900">
          상세 투자설명서(IM) 열람 요청
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          층별 임대 현황과 상세 수지분석표는 담당 공인중개사 승인 후 열람하실 수 있습니다.
        </p>
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm font-medium text-rose-700"
        >
          {errorMsg}
        </div>
      )}

      {!userId && (
        <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label
              htmlFor={nameId}
              className="mb-1 block text-sm font-semibold text-slate-700"
            >
              성함 (필수)
            </label>
            <input
              id={nameId}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="성함을 입력해 주세요"
              required
              className="min-h-[48px] w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-[16px] text-slate-900 focus:border-slate-900 focus:outline-none"
            />
          </div>
          <div>
            <label
              htmlFor={contactId}
              className="mb-1 block text-sm font-semibold text-slate-700"
            >
              연락처 (필수)
            </label>
            <input
              id={contactId}
              type="tel"
              value={contact}
              onChange={(e) => setContact(formatKrPhoneInput(e.target.value))}
              placeholder="010-0000-0000"
              required
              className="min-h-[48px] w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-[16px] text-slate-900 focus:border-slate-900 focus:outline-none"
            />
          </div>
          <div className="sm:col-span-2">
            <label
              htmlFor={companyId}
              className="mb-1 block text-sm font-semibold text-slate-700"
            >
              소속 / 법인명 (선택)
            </label>
            <input
              id={companyId}
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="법인명 또는 소속을 입력해 주세요"
              className="min-h-[48px] w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-[16px] text-slate-900 focus:border-slate-900 focus:outline-none"
            />
          </div>
        </div>
      )}

      <div className="mb-3">
        <label
          htmlFor={reasonId}
          className="mb-1 block text-sm font-semibold text-slate-700"
        >
          관심 사유 및 검토 목적 (선택)
        </label>
        <textarea
          id={reasonId}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="예: 사옥 이전 검토 중입니다. 상세 임대 현황과 수지분석표를 확인하고 싶습니다."
          rows={2}
          className="min-h-[48px] w-full rounded-lg border border-slate-300 bg-white p-3 text-[16px] text-slate-900 focus:border-slate-900 focus:outline-none"
        />
      </div>

      {!userId && (
        <div className="mb-3 flex items-start gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2">
          <input
            id={consentId}
            type="checkbox"
            checked={privacyConsent}
            onChange={(e) => setPrivacyConsent(e.target.checked)}
            className="min-h-[48px] w-5 shrink-0 cursor-pointer text-[16px] accent-slate-900"
          />
          <label
            htmlFor={consentId}
            className="flex min-h-[48px] cursor-pointer items-center text-sm text-slate-700 leading-snug"
          >
            <span>
              상세 열람 안내를 위한{' '}
              <a
                href="/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-slate-900 underline"
              >
                개인정보 수집·이용(새 창)
              </a>
              에 동의합니다. (필수)
            </span>
          </label>
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="min-h-[48px] w-full rounded-lg bg-slate-900 px-5 py-3 text-[16px] font-bold text-white shadow-sm transition-colors hover:bg-slate-800 disabled:opacity-50"
      >
        {loading ? '요청 전송 중...' : '상세 IM 열람 요청하기'}
      </button>
    </form>
  );
}
