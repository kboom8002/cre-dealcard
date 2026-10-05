'use client';

import React, {
  useCallback,
  useEffect,
  useId,
  useRef,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'motion/react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  FOCUSABLE_SELECTOR,
  createLockCounter,
  createModalStack,
  getFocusableTrapTarget,
  getModalKeyAction,
  modalSizeClass,
  setSiblingsInert,
  shouldCloseOnBackdropClick,
} from './modal-logic';

export interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  size?: 'sm' | 'md' | 'lg';
  side?: 'center' | 'right' | 'bottom';
  children: ReactNode;
  /** 열릴 때 처음 포커스할 요소. 없으면 본문의 첫 포커스 가능 요소 → 닫기 버튼 순. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** 배경 클릭으로 닫기 (기본 true) */
  closeOnBackdrop?: boolean;
  /** Esc 로 닫기 (기본 true) */
  closeOnEscape?: boolean;
  className?: string;
}

// 모듈 단위 공유 상태 (모달 중첩 시 scroll lock·Esc 처리를 조율)
const scrollLock = createLockCounter();
const modalStack = createModalStack();
let savedBodyOverflow = '';
let savedBodyPaddingRight = '';

function lockBodyScroll() {
  if (!scrollLock.acquire()) return;
  const body = document.body;
  savedBodyOverflow = body.style.overflow;
  savedBodyPaddingRight = body.style.paddingRight;
  const scrollbar = window.innerWidth - document.documentElement.clientWidth;
  body.style.overflow = 'hidden';
  if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
}

function unlockBodyScroll() {
  if (!scrollLock.release()) return;
  const body = document.body;
  body.style.overflow = savedBodyOverflow;
  body.style.paddingRight = savedBodyPaddingRight;
}

const noopSubscribe = () => () => {};

/**
 * Modal — 접근성 모달 (U-01, U2-02).
 * createPortal(body) · 첫 포커스 이동 · Tab 트랩 · Esc · 트리거 복귀 · scroll lock · 배경 inert ·
 * role=dialog aria-modal aria-labelledby/describedby · 닫기 44×44 · bottom 시트 safe-area ·
 * prefers-reduced-motion 존중.
 */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  size = 'md',
  side = 'center',
  children,
  initialFocusRef,
  closeOnBackdrop = true,
  closeOnEscape = true,
  className,
}: ModalProps) {
  // SSR/hydration 안전한 mounted 플래그 (effect 내 setState 회피)
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const reduceMotion = useReducedMotion();

  const uid = useId();
  const titleId = `${uid}-title`;
  const descId = `${uid}-desc`;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const onOpenChangeRef = useRef(onOpenChange);
  const closeOnEscapeRef = useRef(closeOnEscape);

  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
    closeOnEscapeRef.current = closeOnEscape;
  });

  const requestClose = useCallback(() => onOpenChangeRef.current(false), []);

  useEffect(() => {
    if (!open || !mounted) return;

    const trigger = document.activeElement as HTMLElement | null;
    modalStack.push(uid);
    lockBodyScroll();

    // 배경 inert (스크립트/스타일 노드 제외)
    const root = rootRef.current;
    const restoreInert = root
      ? setSiblingsInert(
          Array.from(document.body.children).filter(
            (el) => !['SCRIPT', 'STYLE', 'LINK', 'NOSCRIPT'].includes(el.tagName),
          ),
          root,
        )
      : () => {};

    // 첫 포커스 이동
    const focusFirst = () => {
      const explicit = initialFocusRef?.current;
      if (explicit) {
        explicit.focus();
        return;
      }
      const inBody = bodyRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      if (inBody) {
        inBody.focus();
        return;
      }
      if (closeBtnRef.current) {
        closeBtnRef.current.focus();
        return;
      }
      panelRef.current?.focus();
    };
    const raf = window.requestAnimationFrame(focusFirst);

    const onKeyDown = (e: KeyboardEvent) => {
      if (!modalStack.isTop(uid)) return;
      const action = getModalKeyAction(e.key, { closeOnEscape: closeOnEscapeRef.current });
      if (action === 'close') {
        e.preventDefault();
        e.stopPropagation();
        requestClose();
        return;
      }
      if (action !== 'trap') return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      const activeIndex = focusables.indexOf(document.activeElement as HTMLElement);
      const target = getFocusableTrapTarget({
        count: focusables.length,
        activeIndex,
        shiftKey: e.shiftKey,
      });
      if (target === null) return;
      e.preventDefault();
      if (target === 'container') panel.focus();
      else focusables[target]?.focus();
    };
    document.addEventListener('keydown', onKeyDown, true);

    return () => {
      window.cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKeyDown, true);
      restoreInert();
      unlockBodyScroll();
      modalStack.remove(uid);
      // 트리거로 포커스 복귀 (DOM 에서 사라졌으면 생략)
      if (trigger && trigger.isConnected && typeof trigger.focus === 'function') {
        trigger.focus();
      }
    };
    // initialFocusRef 는 ref 객체라 의존성에서 제외 (열릴 때 1회만 읽는다)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mounted, uid, requestClose]);

  if (!mounted || !open) return null;

  const isRight = side === 'right';
  const isBottom = side === 'bottom';
  const duration = reduceMotion ? 0 : 0.18;

  const initial = reduceMotion
    ? { opacity: 1 }
    : isRight
      ? { opacity: 0, x: 32 }
      : isBottom
        ? { opacity: 0, y: 32 }
        : { opacity: 0, scale: 0.97 };
  const animate = reduceMotion ? { opacity: 1 } : { opacity: 1, x: 0, y: 0, scale: 1 };

  return createPortal(
    <div
      ref={rootRef}
      data-magazine-modal=""
      className={cn(
        'fixed inset-0 z-[60] flex',
        isRight ? 'justify-end' : 'justify-center',
        isBottom ? 'items-end' : isRight ? 'items-stretch' : 'items-center p-4',
      )}
    >
      {/* 배경 */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onMouseDown={(e) => {
          if (
            shouldCloseOnBackdropClick({
              enabled: closeOnBackdrop,
              targetIsBackdrop: e.target === e.currentTarget,
            })
          ) {
            requestClose();
          }
        }}
      />

      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        initial={initial}
        animate={animate}
        transition={{ duration }}
        className={cn(
          'relative flex w-full flex-col overflow-hidden border border-slate-700 bg-slate-900 text-slate-200 shadow-2xl outline-none',
          isRight
            ? 'h-full max-w-md rounded-none border-y-0 border-r-0'
            : isBottom
              ? 'max-h-[90dvh] max-w-none rounded-t-2xl border-b-0 pb-[max(1rem,env(safe-area-inset-bottom))]'
              : cn('max-h-[90dvh] rounded-2xl', modalSizeClass(size)),
          className,
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 px-5 py-4">
          <div className="min-w-0 space-y-1">
            <h2 id={titleId} className="text-title font-bold text-white">
              {title}
            </h2>
            {description ? (
              <p id={descId} className="text-label text-ink-muted">
                {description}
              </p>
            ) : null}
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            aria-label="닫기"
            onClick={requestClose}
            className="-mr-2 -mt-1 inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-slate-800 hover:text-white focus-visible:outline-2 focus-visible:outline-indigo-400"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {children}
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
