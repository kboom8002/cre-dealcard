'use client';

import React, { useId, useState } from 'react';
import { Mail, MessageCircle, Send, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/modal';
import { formatKrPhoneInput } from '@/lib/magazine/phone-input';
import {
  CHANNEL_LABEL,
  CONSENT_ATTEST_HINT,
  CONSENT_ATTEST_TEXT,
  describeAddResponse,
  networkErrorMessage,
  refreshAddErrors,
  validateAddSubscriber,
  type AddChannel,
  type AddFieldErrors,
  type AddSubscriberInput,
} from './outreach-helpers';

const CHANNELS: Array<{ key: AddChannel; label: string; icon: typeof Mail }> = [
  { key: 'kakao', label: CHANNEL_LABEL.kakao, icon: MessageCircle },
  { key: 'email', label: CHANNEL_LABEL.email, icon: Mail },
  { key: 'both', label: CHANNEL_LABEL.both, icon: Send },
];

type FieldErrors = AddFieldErrors;

interface AddSubscriberFormProps {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
}

const INPUT =
  'min-h-11 w-full rounded-lg border bg-slate-900/60 px-3 text-reader text-white placeholder:text-ink-subtle outline-none focus:border-indigo-500/60';

/** 구독자 수동 추가 — 채널(카카오/이메일/둘 다) + 입력 검증 + 수신 동의 보증(필수). */
export function AddSubscriberForm({ open, onClose, onAdded }: AddSubscriberFormProps) {
  const uid = useId();
  const [form, setForm] = useState<AddSubscriberInput>({ name: '', phone: '', email: '', channel: 'kakao', attested: false });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const needsEmail = form.channel === 'email' || form.channel === 'both';

  function set<K extends keyof AddSubscriberInput>(key: K, value: AddSubscriberInput[K]) {
    const next = { ...form, [key]: value } as AddSubscriberInput;
    setForm(next);
    // 채널·이메일·전화 검증은 서로 의존한다 — 표시 중인 오류를 현재 값 기준으로 함께 재계산/해제
    setErrors((prev) => refreshAddErrors(next, prev));
    setFormError('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    const v = validateAddSubscriber(form);
    if (!v.ok) {
      setErrors(v.errors);
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const res = await fetch('/api/broker/magazine/subscribers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(v.payload),
      });
      let json: unknown = null;
      try {
        json = await res.json();
      } catch {
        json = null;
      }
      const result = describeAddResponse(res.status, json);
      if (result.kind === 'created' || result.kind === 'existing') {
        toast.success(result.message);
        onAdded();
        return;
      }
      setFormError(result.message);
    } catch (err) {
      setFormError(networkErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        if (!o && !saving) onClose();
      }}
      title="새 구독자 추가"
      description="수신 동의를 받은 고객만 추가할 수 있어요."
      size="sm"
      closeOnBackdrop={!saving}
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-3">
        <div className="space-y-1">
          <label htmlFor={`${uid}-name`} className="text-label font-bold text-slate-300">
            이름 <span aria-hidden="true">*</span>
          </label>
          <input
            id={`${uid}-name`}
            type="text"
            autoComplete="off"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? `${uid}-name-err` : undefined}
            className={`${INPUT} ${errors.name ? 'border-rose-500/60' : 'border-slate-700'}`}
          />
          {errors.name ? (
            <p id={`${uid}-name-err`} role="alert" className="text-caption text-rose-300">
              {errors.name}
            </p>
          ) : null}
        </div>

        <div className="space-y-1">
          <label htmlFor={`${uid}-phone`} className="text-label font-bold text-slate-300">
            휴대폰 번호 <span aria-hidden="true">*</span>
          </label>
          <input
            id={`${uid}-phone`}
            type="tel"
            inputMode="numeric"
            autoComplete="off"
            placeholder="숫자만 입력"
            value={form.phone}
            onChange={(e) => set('phone', formatKrPhoneInput(e.target.value))}
            aria-invalid={!!errors.phone}
            aria-describedby={errors.phone ? `${uid}-phone-err` : undefined}
            className={`${INPUT} ${errors.phone ? 'border-rose-500/60' : 'border-slate-700'}`}
          />
          {errors.phone ? (
            <p id={`${uid}-phone-err`} role="alert" className="text-caption text-rose-300">
              {errors.phone}
            </p>
          ) : null}
        </div>

        <fieldset className="space-y-1">
          <legend className="text-label font-bold text-slate-300">수신 채널</legend>
          <div className="flex gap-1.5" role="radiogroup" aria-label="수신 채널">
            {CHANNELS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={form.channel === key}
                onClick={() => set('channel', key)}
                className={`flex min-h-11 flex-1 items-center justify-center gap-1 rounded-lg border text-label font-bold transition-all ${
                  form.channel === key
                    ? 'border-indigo-500/40 bg-indigo-500/20 text-indigo-200'
                    : 'border-slate-700/50 bg-slate-800/50 text-ink-muted hover:text-slate-200'
                }`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {label}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="space-y-1">
          <label htmlFor={`${uid}-email`} className="text-label font-bold text-slate-300">
            이메일 {needsEmail ? <span aria-hidden="true">*</span> : <span className="font-normal text-ink-subtle">(선택)</span>}
          </label>
          <input
            id={`${uid}-email`}
            type="email"
            autoComplete="off"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            aria-required={needsEmail}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? `${uid}-email-err` : undefined}
            className={`${INPUT} ${errors.email ? 'border-rose-500/60' : 'border-slate-700'}`}
          />
          {errors.email ? (
            <p id={`${uid}-email-err`} role="alert" className="text-caption text-rose-300">
              {errors.email}
            </p>
          ) : null}
        </div>

        <div className="rounded-lg border border-slate-700/60 bg-slate-900/40 p-3">
          <label className="flex min-h-11 cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              checked={form.attested}
              onChange={(e) => set('attested', e.target.checked)}
              aria-invalid={!!errors.attested}
              aria-describedby={`${uid}-attest-hint`}
              className="mt-1 h-4 w-4 rounded"
            />
            <span className="text-label font-bold text-slate-200">{CONSENT_ATTEST_TEXT}</span>
          </label>
          <p id={`${uid}-attest-hint`} className="mt-1 text-caption text-ink-muted">
            {CONSENT_ATTEST_HINT}
          </p>
          {errors.attested ? (
            <p role="alert" className="mt-1 text-caption text-rose-300">
              {errors.attested}
            </p>
          ) : null}
        </div>

        {formError ? (
          <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-950/20 px-3 py-2 text-label text-rose-200">
            {formError}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={saving}
          className="flex min-h-12 w-full items-center justify-center gap-1.5 rounded-xl border border-indigo-500/30 bg-indigo-600/30 text-body font-bold text-indigo-100 transition-colors hover:bg-indigo-600/40 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {saving ? '추가 중...' : '구독자 추가'}
        </button>
      </form>
    </Modal>
  );
}
