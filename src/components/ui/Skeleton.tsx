import React from 'react';

// U-01: 장식용 스켈레톤은 스크린리더에서 숨기고, 로딩 영역은 SkeletonGroup(role=status)이 알린다.
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse motion-reduce:animate-none bg-slate-800/60 dark:bg-muted/40 rounded-md ${className}`}
    />
  );
}

/** 텍스트 줄 스켈레톤 (마지막 줄은 짧게) */
export function SkeletonText({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <div aria-hidden="true" className={`space-y-2 ${className}`}>
      {Array.from({ length: Math.max(1, lines) }, (_, i) => (
        <Skeleton key={i} className={`h-4 ${i === lines - 1 && lines > 1 ? 'w-2/3' : 'w-full'}`} />
      ))}
    </div>
  );
}

/** 로딩 영역 래퍼 — 스크린리더에 "불러오는 중"을 알린다. */
export function SkeletonGroup({
  label = '불러오는 중',
  className = '',
  children,
}: {
  label?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className={className}>
      {children}
    </div>
  );
}


export function CardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4 animate-pulse">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-1/3" />
        <Skeleton className="h-4 w-1/6" />
      </div>
      <Skeleton className="h-16 w-full rounded-lg" />
      <div className="flex gap-2">
        <Skeleton className="h-8 w-20 rounded-md" />
        <Skeleton className="h-8 w-20 rounded-md" />
        <Skeleton className="h-8 w-20 rounded-md" />
      </div>
    </div>
  );
}
