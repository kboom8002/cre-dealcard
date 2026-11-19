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
        'flex flex-col items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-5 py-8 text-center text-rose-950',
        className,
      )}
    >
      <p className="text-body font-semibold text-rose-950">{title}</p>
      {description ? <p className="text-body text-rose-800">{description}</p> : null}
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 inline-flex min-h-[44px] items-center justify-center rounded-lg border border-rose-300 bg-white px-4 text-body font-bold text-rose-900 hover:bg-rose-100"
        >
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}
