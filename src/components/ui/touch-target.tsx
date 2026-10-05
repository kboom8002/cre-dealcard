import React, { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface TouchTargetProps {
  /** true 이면 단일 자식 요소에 클래스를 병합해 렌더(래퍼 DOM 없음). */
  asChild?: boolean;
  children: ReactNode;
  className?: string;
}

const TOUCH_CLASS =
  "relative inline-flex min-h-11 min-w-11 items-center justify-center after:absolute after:-inset-2 after:content-['']";

/**
 * TouchTarget — 최소 44×44 터치 영역 보장 래퍼 (U-01, U-03).
 * `after:-inset-2` 가상 요소로 시각 크기를 거의 유지하며 히트 영역을 넓힌다.
 */
export function TouchTarget({ asChild = false, children, className }: TouchTargetProps) {
  if (asChild && isValidElement(children)) {
    const child = children as ReactElement<{ className?: string }>;
    return cloneElement(child, { className: cn(TOUCH_CLASS, child.props.className, className) });
  }
  return <span className={cn(TOUCH_CLASS, className)}>{children}</span>;
}
