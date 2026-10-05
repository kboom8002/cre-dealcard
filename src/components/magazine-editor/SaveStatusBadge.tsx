'use client';

import type { AutosaveStatus } from './useEditionAutosave';

export function formatSavedTime(d: Date): string {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** 저장 상태를 한 줄로 표현 (순수 함수 — 테스트 가능). */
export function describeSaveStatus(
  status: AutosaveStatus,
  lastSavedAt: Date | null,
): { label: string; tone: 'neutral' | 'ok' | 'busy' | 'error' } {
  switch (status) {
    case 'saving':
      return { label: '저장 중…', tone: 'busy' };
    case 'saved':
      return { label: lastSavedAt ? `저장됨 · ${formatSavedTime(lastSavedAt)}` : '저장됨', tone: 'ok' };
    case 'dirty':
      return { label: '변경사항 있음', tone: 'neutral' };
    case 'error':
      return { label: '저장 실패', tone: 'error' };
    case 'conflict':
      return { label: '다른 곳에서 수정됨', tone: 'error' };
    case 'locked':
      return { label: '발행됨 · 수정 잠금', tone: 'neutral' };
    default:
      return { label: lastSavedAt ? `저장됨 · ${formatSavedTime(lastSavedAt)}` : '자동 저장 켜짐', tone: 'neutral' };
  }
}

const TONE_CLASS: Record<'neutral' | 'ok' | 'busy' | 'error', string> = {
  neutral: 'bg-slate-100 text-slate-600 border-slate-200',
  ok: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  busy: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  error: 'bg-red-50 text-red-700 border-red-300',
};

interface SaveStatusBadgeProps {
  status: AutosaveStatus;
  lastSavedAt: Date | null;
  errorMessage?: string | null;
  onRetry?: () => void;
  onOverwrite?: () => void;
  onReload?: () => void;
}

export function SaveStatusBadge({ status, lastSavedAt, errorMessage, onRetry, onOverwrite, onReload }: SaveStatusBadgeProps) {
  const { label, tone } = describeSaveStatus(status, lastSavedAt);
  return (
    <div className="flex flex-wrap items-center gap-2" role="status" aria-live="polite">
      <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold ${TONE_CLASS[tone]}`}>
        {label}
      </span>
      {status === 'error' && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg border border-red-300 bg-white px-2.5 py-1 text-xs font-bold text-red-700 hover:bg-red-50"
        >
          다시 시도
        </button>
      )}
      {status === 'conflict' && (
        <>
          {onReload && (
            <button
              type="button"
              onClick={onReload}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              새로고침
            </button>
          )}
          {onOverwrite && (
            <button
              type="button"
              onClick={onOverwrite}
              className="rounded-lg border border-red-300 bg-white px-2.5 py-1 text-xs font-bold text-red-700 hover:bg-red-50"
            >
              내 변경으로 덮어쓰기
            </button>
          )}
        </>
      )}
      {(status === 'error' || status === 'conflict') && errorMessage && (
        <span className="text-xs text-red-600">{errorMessage}</span>
      )}
    </div>
  );
}
