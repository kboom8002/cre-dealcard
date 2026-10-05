import React from 'react';
import { cn } from '@/lib/utils';

export interface ErrorStateProps {
  title: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

/**
 * ErrorState — `!res.ok` / throw 시 필수 (U-01). `role="alert"`.
 * 내부 에러 메시지를 그대로 넘기지 말고 `toUserMessage()` 결과를 description 에 넣는다.
 */
export function ErrorState({
  title,
  description,
  onRetry,
  retryLabel = '다시 시도',
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-xl border border-rose-500/30 bg-rose-950/20 px-5 py-8 text-center',
        className,
      )}
    >
      <p className="text-body font-semibold text-rose-200">{title}</p>
      {description ? <p className="text-body text-ink-muted">{description}</p> : null}
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 inline-flex min-h-11 items-center justify-center rounded-lg bg-rose-600 px-4 text-body font-bold text-white hover:bg-rose-500"
        >
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}
