'use client';

import React, { useId, useSyncExternalStore, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
  computeViewportRatio,
  isTextEntryElement,
  shouldHideBar,
} from './bottom-bar-logic';
import { useBottomSlot } from './use-bottom-slot';

/** visualViewport / 입력 포커스 변화 구독 → 키보드 열림 여부 */
function subscribeViewport(onChange: () => void) {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  vv?.addEventListener('resize', onChange);
  vv?.addEventListener('scroll', onChange);
  window.addEventListener('resize', onChange);
  document.addEventListener('focusin', onChange);
  document.addEventListener('focusout', onChange);
  return () => {
    vv?.removeEventListener('resize', onChange);
    vv?.removeEventListener('scroll', onChange);
    window.removeEventListener('resize', onChange);
    document.removeEventListener('focusin', onChange);
    document.removeEventListener('focusout', onChange);
  };
}

function readHidden(hideOnInputFocus: boolean): boolean {
  const vv = window.visualViewport;
  const ratio = computeViewportRatio(vv?.height ?? window.innerHeight, window.innerHeight);
  const active = document.activeElement as HTMLElement | null;
  const inputFocused = isTextEntryElement(
    active?.tagName,
    (active as HTMLInputElement | null)?.type,
    active?.isContentEditable ?? false,
  );
  return shouldHideBar({ viewportRatio: ratio, inputFocused, hideOnInputFocus });
}

export interface BottomBarProps {
  /** 키보드가 열리거나 입력에 포커스되면 바를 숨긴다 (기본 true) */
  hideOnInputFocus?: boolean;
  className?: string;
  'aria-label'?: string;
  children: ReactNode;
}

/**
 * BottomBar — 고정 하단 액션 바 (U-01, U2-03, T2-22).
 * `fixed inset-x-0 bottom-0 z-40` + safe-area 패딩, visualViewport 키보드 감지(<0.75),
 * `useBottomSlot()` 으로 중복 하단 바 방지.
 */
function BottomBarRoot({
  hideOnInputFocus = true,
  className,
  'aria-label': ariaLabel = '하단 바로가기',
  children,
}: BottomBarProps) {
  const id = useId();
  const { isOwner } = useBottomSlot(id);
  const hidden = useSyncExternalStore(
    subscribeViewport,
    () => readHidden(hideOnInputFocus),
    () => false,
  );

  if (!isOwner) return null;

  return (
    <nav
      aria-label={ariaLabel}
      aria-hidden={hidden || undefined}
      inert={hidden || undefined}
      data-magazine-bottom-bar=""
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 border-t border-slate-800 bg-slate-950/95 px-4 pt-3 pb-[max(.75rem,env(safe-area-inset-bottom))] backdrop-blur',
        'transition-transform duration-200 motion-reduce:transition-none',
        hidden ? 'pointer-events-none translate-y-full' : 'translate-y-0',
        className,
      )}
    >
      <div className="mx-auto flex w-full max-w-md items-stretch gap-2">{children}</div>
    </nav>
  );
}

interface BarActionProps {
  icon?: ReactNode;
  href?: string;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}

/**
 * 아이콘 위 · 라벨 아래(최대 2줄) 세로 배치 — 360~390px 에서도 라벨이 '…' 로 잘리지 않는다.
 * min-h-12(48px) ≥ 44px 터치 타깃. `min-w-0` 로 flex 자식이 내용 폭 이상으로 밀리지 않게 한다.
 */
const ACTION_BASE =
  'inline-flex min-h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1.5 py-1.5 text-center leading-tight font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300';

/** 라벨: 줄바꿈 허용(whitespace-normal) · 한글은 단어 단위(break-keep) · 최대 2줄 */
const ACTION_LABEL =
  'min-w-0 max-w-full whitespace-normal break-keep text-label leading-tight line-clamp-2';

function BarAction({
  icon,
  href,
  onClick,
  children,
  className,
  variantClass,
}: BarActionProps & { variantClass: string }) {
  const cls = cn(ACTION_BASE, variantClass, className);
  const content = (
    <>
      {icon ? (
        <span className="flex shrink-0 items-center justify-center" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className={ACTION_LABEL}>{children}</span>
    </>
  );
  if (href) {
    return (
      <a href={href} onClick={onClick} className={cls}>
        {content}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {content}
    </button>
  );
}

/** Primary 는 가중(1.4) — 같은 줄의 Secondary(1)보다 넓지만 라벨 공간을 먼저 확보한다 */
function Primary(props: BarActionProps) {
  return (
    <BarAction
      {...props}
      variantClass="flex-[1.4_1_0%] bg-indigo-600 text-white hover:bg-indigo-500"
    />
  );
}

function Secondary(props: BarActionProps) {
  return (
    <BarAction
      {...props}
      variantClass="flex-[1_1_0%] border border-slate-600 bg-slate-800 text-ink-muted hover:bg-slate-700"
    />
  );
}

export const BottomBar = Object.assign(BottomBarRoot, { Primary, Secondary });
