import React, { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  className?: string;
}

/**
 * EmptyState — "정상 응답(200)인데 데이터가 비어 있을 때"에만 사용한다 (U-01).
 * 오류에는 ErrorState 를 쓴다 (위장 빈 상태 금지, RC2). `role="status"`, 본문은 --text-body 이상.
 */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      role="status"
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-700 px-5 py-8 text-center',
        className,
      )}
    >
      {icon ? (
        <div className="text-ink-subtle" aria-hidden="true">
          {icon}
        </div>
      ) : null}
      <p className="text-body font-semibold text-white">{title}</p>
      {description ? <p className="text-body text-ink-muted">{description}</p> : null}
      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-2 inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-600 bg-slate-800 px-4 text-body font-bold text-ink-muted hover:bg-slate-700"
        >
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
