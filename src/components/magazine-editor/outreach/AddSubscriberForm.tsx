'use client';

import React, { useId, useState, useMemo } from 'react';
import { Mail, MessageCircle, Send, Loader2, Users, UserPlus, ClipboardPaste } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/modal';
import { formatKrPhoneInput, isPlausiblePhoneDigits } from '@/lib/magazine/phone-input';
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

export interface ParsedBulkItem {
  raw: string;
  name: string;
  phone: string;
  email: string;
  valid: boolean;
  error?: string;
}

export function parseBulkLine(line: string): ParsedBulkItem | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  // Tab, comma, or whitespace delimiters
  const tokens = trimmed.split(/[\t, ]+/).filter(Boolean);
  if (tokens.length === 0) return null;

  let name = '';
  let phone = '';
  let email = '';

  // 1. Separate email tokens
  const nonEmailTokens: string[] = [];
  for (const token of tokens) {
    if (token.includes('@') && !email) {
      email = token.trim();
    } else {
      nonEmailTokens.push(token);
    }
  }

  // 2. Identify phone number
  const remainingTokens: string[] = [];
  for (let i = 0; i < nonEmailTokens.length; i++) {
    const t = nonEmailTokens[i];
    // Case 2a: single token with plausible phone digits (10~11 digits)
    if (!phone && isPlausiblePhoneDigits(t)) {
      phone = formatKrPhoneInput(t);
      continue;
    }
    // Case 2b: 3 consecutive parts forming a 10~11 digit Korean phone (e.g. "010", "1111", "2222")
    if (
      !phone &&
      i + 2 < nonEmailTokens.length &&
      isPlausiblePhoneDigits(t + nonEmailTokens[i + 1] + nonEmailTokens[i + 2]) &&
      /^\d{2,4}$/.test(t) &&
      /^\d{3,4}$/.test(nonEmailTokens[i + 1]) &&
      /^\d{4}$/.test(nonEmailTokens[i + 2])
    ) {
      phone = formatKrPhoneInput(t + nonEmailTokens[i + 1] + nonEmailTokens[i + 2]);
      i += 2;
      continue;
    }
    remainingTokens.push(t);
  }

  // 3. Identify name from remaining tokens
  // Do NOT treat phone-like numbers or digit-only strings as name!
  for (const t of remainingTokens) {
    if (!name && !isPlausiblePhoneDigits(t) && !/^\d+$/.test(t) && !t.includes('@')) {
      name = t;
      break;
    }
  }

  // A valid bulk subscriber requires a name AND at least one contact channel (phone or email)
  const valid = Boolean(name && (phone || email));
  const error = !valid
    ? !name
      ? '고객 이름을 입력해 주세요'
      : '연락처(휴대폰 번호 10~11자리 또는 이메일)를 입력해 주세요'
    : undefined;

  return {
    raw: trimmed,
    name,
    phone,
    email,
    valid,
    error,
  };
}

/** 구독자 추가 — 단건 직접 등록 및 여러 줄 일괄 붙여넣기(Multi-line Bulk Paste) 지원. */
export function AddSubscriberForm({ open, onClose, onAdded }: AddSubscriberFormProps) {
  const uid = useId();
  const [mode, setMode] = useState<'single' | 'bulk'>('single');

  // 단건 입력 상태
  const [form, setForm] = useState<AddSubscriberInput>({ name: '', phone: '', email: '', channel: 'kakao', attested: false });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  // 일괄 붙여넣기 상태
  const [bulkText, setBulkText] = useState('');
  const [bulkAttested, setBulkAttested] = useState(false);

  const parsedBulkItems = useMemo<ParsedBulkItem[]>(() => {
    if (!bulkText.trim()) return [];
    return bulkText
      .split('\n')
      .map(parseBulkLine)
      .filter((item): item is ParsedBulkItem => !!item);
  }, [bulkText]);

  const validBulkCount = parsedBulkItems.filter((i) => i.valid).length;
  const needsEmail = form.channel === 'email' || form.channel === 'both';

  function set<K extends keyof AddSubscriberInput>(key: K, value: AddSubscriberInput[K]) {
    const next = { ...form, [key]: value } as AddSubscriberInput;
    setForm(next);
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

  async function handleBulkSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (!bulkAttested) {
      setFormError('수신 동의 보증에 체크해 주세요.');
      return;
    }
    const validItems = parsedBulkItems.filter((i) => i.valid);
    if (validItems.length === 0) {
      setFormError('등록할 유효한 고객 정보가 없습니다. 여러 줄에 걸쳐 이름과 연락처를 입력해 주세요.');
      return;
    }

    setSaving(true);
    setFormError('');
    let successCount = 0;
    let failCount = 0;

    for (const item of validItems) {
      try {
        const channel: AddChannel = item.email && item.phone ? 'both' : item.email ? 'email' : 'kakao';
        const payload = {
          name: item.name,
          phone: item.phone || '010-0000-0000',
          email: item.email || undefined,
          channel,
          attested: true,
        };
        const res = await fetch('/api/broker/magazine/subscribers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          successCount++;
        } else {
          failCount++;
        }
      } catch {
        failCount++;
      }
    }

    setSaving(false);
    if (successCount > 0) {
      toast.success(`총 ${successCount}명의 구독자가 등록되었습니다.${failCount > 0 ? ` (${failCount}명 실패)` : ''}`);
      onAdded();
    } else {
      setFormError('구독자 일괄 등록에 실패했습니다. 다시 시도해 주세요.');
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
      <div className="space-y-4">
        {/* 등록 방식 탭 토글 */}
        <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-slate-700 bg-slate-900/80 p-1">
          <button
            type="button"
            onClick={() => {
              setMode('single');
              setFormError('');
            }}
            className={`flex min-h-[38px] items-center justify-center gap-1.5 rounded-lg text-xs font-bold transition-all ${
              mode === 'single'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
            단건 직접 등록
          </button>
          <button
            type="button"
            data-testid="bulk-import-tab"
            onClick={() => {
              setMode('bulk');
              setFormError('');
            }}
            className={`flex min-h-[38px] items-center justify-center gap-1.5 rounded-lg text-xs font-bold transition-all ${
              mode === 'bulk'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ClipboardPaste className="h-3.5 w-3.5" aria-hidden="true" />
            여러 명 일괄 붙여넣기
          </button>
        </div>

        {mode === 'single' ? (
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
              {form.channel === 'kakao' && !form.email.trim() ? (
                <p className="text-sm text-indigo-200/90 leading-relaxed pt-1">
                  💡 <strong>이메일</strong>을 함께 입력하시면 매주 발행 시 소식지가 이메일로 <strong>자동 발송</strong>됩니다. (카카오톡 단독 선택 시 카톡 링크 수동 공유 대상 고객으로 즉시 등록됩니다)
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
        ) : (
          /* 여러 줄 일괄 붙여넣기 폼 */
          <form onSubmit={handleBulkSubmit} noValidate className="space-y-3">
            <div className="space-y-1.5">
              <label htmlFor={`${uid}-bulk-text`} className="text-label font-bold text-slate-300 block">
                고객 명단 붙여넣기 (한 줄에 1명씩)
              </label>
              <textarea
                id={`${uid}-bulk-text`}
                data-testid="bulk-subscriber-textarea"
                rows={6}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder={"예시 (엑셀/메모장에서 복사해 바로 붙여넣기):\n홍길동 010-1234-5678 hong@example.com\n김철수 010-9876-5432\n이영희, 010-1111-2222, young@cre.kr"}
                className="w-full rounded-xl border border-slate-700 bg-slate-900/60 p-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-indigo-500 font-mono leading-relaxed resize-none"
              />
              <div className="flex items-center justify-between text-caption text-slate-400">
                <span>공백, 쉼표, 탭 구분자를 자동으로 인식합니다.</span>
                <span className="font-bold text-indigo-300">
                  인식된 고객: {validBulkCount}명
                </span>
              </div>
            </div>

            {parsedBulkItems.length > 0 && (
              <div className="max-h-32 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/60 p-2 space-y-1 text-xs">
                {parsedBulkItems.slice(0, 10).map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between py-0.5 border-b border-slate-800/50 last:border-0">
                    <span className="font-bold text-slate-200">{item.name || '(이름 없음)'}</span>
                    <span className="text-slate-400">{item.phone || item.email || '(연락처 없음)'}</span>
                    <span className={item.valid ? 'text-emerald-400 font-bold' : 'text-rose-400'}>
                      {item.valid ? '✓ 정상' : '⚠️ 확인 필요'}
                    </span>
                  </div>
                ))}
                {parsedBulkItems.length > 10 && (
                  <p className="text-center text-xs text-slate-500 pt-1">
                    ...외 {parsedBulkItems.length - 10}명
                  </p>
                )}
              </div>
            )}

            <div className="rounded-lg border border-slate-700/60 bg-slate-900/40 p-3">
              <label className="flex min-h-11 cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  data-testid="bulk-attest-checkbox"
                  checked={bulkAttested}
                  onChange={(e) => setBulkAttested(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded"
                />
                <span className="text-label font-bold text-slate-200">
                  붙여넣은 명단은 정보통신망법에 따라 수신 동의를 받은 고객임을 보증합니다.
                </span>
              </label>
            </div>

            {formError ? (
              <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-950/20 px-3 py-2 text-label text-rose-200">
                {formError}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={saving || validBulkCount === 0}
              data-testid="bulk-submit-btn"
              className="flex min-h-12 w-full items-center justify-center gap-1.5 rounded-xl border border-indigo-500/30 bg-indigo-600 text-body font-bold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50 cursor-pointer shadow-md"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Users className="h-4 w-4" aria-hidden="true" />}
              {saving ? '일괄 등록 진행 중...' : `총 ${validBulkCount}명 일괄 등록하기`}
            </button>
          </form>
        )}
      </div>
    </Modal>
  );
}
