'use client';

/**
 * Pre-Send Confirmation Sheet — 간결한 카카오톡 보내기 확인 창
 *
 * - 자동 저장 완료 및 지번·건물명 보호 점검을 백그라운드에서 수행
 * - 문제가 있을 때만 수정 안내 표시
 * - 주 버튼: [카카오톡으로 보내기] (실제 Kakao SDK 공유 + 클립보드 폴백)
 * - 보조 버튼: [링크 복사] (실제 클립보드 성공 여부 확인)
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  generateAiOgHeadline,
  resolveCard4AreaLabel,
  type Card4Data,
} from '@/lib/deal-card/card4-schema';
import { validateBlindPoints } from '@/lib/deal-card/blind-guard';
import { validateBlindPriceBand } from '@/lib/deal-card/price-band';
import { repairDealCardLine } from '@/lib/deal-card/copy-limits';
import { DealCardLineText } from '@/components/broker/deal-card/DealCardLineText';
import { copyText, COPY_FAILED_MESSAGE } from '@/lib/ux/clipboard';
import { getSiteOrigin, shareKakaoFeed } from '@/lib/kakao/share';
import { TERMS } from '@/lib/ux/lexicon';

export interface PreSendPublishError {
  message: string;
  code?: string;
}

export interface PreSendConfirmationSheetProps {
  isOpen: boolean;
  onClose: () => void;
  card4: Card4Data;
  dealId: string;
  isSaved: boolean;
  onFlushSave: () => Promise<boolean>;
  onAutoMask?: () => void;
  onSendToSelf?: () => Promise<void>;
  onSendToClient?: () => void | boolean | Promise<boolean | void>;
  onCopyLink?: () => void | boolean | Promise<boolean | void>;
  onAfterCopy?: () => void;
  publishError?: PreSendPublishError | null;
  onClearPublishError?: () => void;
}

export function PreSendConfirmationSheet({
  isOpen,
  onClose,
  card4,
  dealId,
  isSaved,
  onFlushSave,
  onAutoMask,
  onSendToClient,
  onCopyLink,
  onAfterCopy,
  publishError,
  onClearPublishError,
}: PreSendConfirmationSheetProps) {
  const [flushResult, setFlushResult] = useState<{
    target: Card4Data;
    status: 'done' | 'failed';
  } | null>(null);
  const [manualFlushing, setManualFlushing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<'info' | 'error'>('info');
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const primaryBtnRef = useRef<HTMLButtonElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const handleClose = useCallback(() => {
    setActionFeedback(null);
    setIsSubmitting(false);
    setManualFlushing(false);
    setFlushResult(null);
    onClose();
  }, [onClose]);

  // Validate points + header fields
  const blindResult = validateBlindPoints(
    [
      ...card4.points,
      card4.region || '',
      card4.use || '',
      card4.area || '',
      card4.priceBand || '',
      ...(card4.headline ? [card4.headline] : []),
    ],
    {
      region: card4.region,
      assetType: card4.use,
    },
  );
  const sensitiveWarnings = blindResult.violations;

  const missingRequired: string[] = [];
  if (!card4.region?.trim()) missingRequired.push(TERMS.regionLabel);
  if (!card4.use?.trim()) missingRequired.push(TERMS.useLabel);
  if (!card4.priceBand?.trim()) missingRequired.push(TERMS.priceLabel);

  useEffect(() => {
    if (!isOpen) return;
    previousFocusRef.current =
      typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const focusInitial = () => {
      if (primaryBtnRef.current && !primaryBtnRef.current.disabled) {
        primaryBtnRef.current.focus();
      } else {
        closeBtnRef.current?.focus();
      }
    };
    const raf = window.requestAnimationFrame(focusInitial);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
        return;
      }
      if (e.key === 'Tab' && dialogRef.current) {
        const focusables = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('keydown', handleKeyDown);
      previousFocusRef.current?.focus?.();
    };
  }, [isOpen, handleClose]);

  const onFlushSaveRef = useRef(onFlushSave);
  useEffect(() => {
    onFlushSaveRef.current = onFlushSave;
  }, [onFlushSave]);

  useEffect(() => {
    if (!isOpen || isSaved) {
      return;
    }

    let cancelled = false;
    onFlushSaveRef
      .current()
      .then((ok) => {
        if (!cancelled) {
          setFlushResult({ target: card4, status: ok ? 'done' : 'failed' });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFlushResult({ target: card4, status: 'failed' });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, isSaved, card4]);

  if (!isOpen) return null;

  const saveStepState: 'pending' | 'flushing' | 'done' | 'failed' = manualFlushing
    ? 'flushing'
    : isSaved
    ? 'done'
    : flushResult && flushResult.target === card4
    ? flushResult.status
    : 'flushing';

  const origin = getSiteOrigin();
  const publicUrl = `${origin}/dc/${dealId}`;
  const ogImageUrl = `${origin}/api/og/deal/${dealId}/kakao-v2${
    card4.card4_hash ? `?v=${card4.card4_hash}` : ''
  }`;
  const resolvedArea =
    card4.area !== undefined ? card4.area.trim() : resolveCard4AreaLabel(card4);
  const headlineDisplay =
    repairDealCardLine(card4.headline) ||
    generateAiOgHeadline(card4);

  const priceBandCheck = card4.priceBand?.trim()
    ? validateBlindPriceBand(card4.priceBand)
    : { valid: true };

  const isAllValid =
    Boolean(dealId) &&
    saveStepState === 'done' &&
    blindResult.isValid &&
    priceBandCheck.valid &&
    missingRequired.length === 0;

  const handleRetrySave = async () => {
    setManualFlushing(true);
    const ok = await onFlushSave().catch(() => false);
    setManualFlushing(false);
    setFlushResult({ target: card4, status: ok ? 'done' : 'failed' });
  };

  const handleCopy = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setActionFeedback(null);
    onClearPublishError?.();
    try {
      const published = onCopyLink ? (await Promise.resolve(onCopyLink())) !== false : true;
      if (!published) {
        setFeedbackTone('error');
        setActionFeedback('링크를 발행할 수 없어 복사하지 않았습니다. 아래 안내를 먼저 확인해 주세요.');
        return;
      }
      const ok = await copyText(publicUrl);
      if (ok) {
        setFeedbackTone('info');
        setActionFeedback('✓ 링크를 복사했어요. 카카오톡 대화창에 붙여넣어 보내세요.');
        onAfterCopy?.();
      } else {
        setFeedbackTone('error');
        setActionFeedback(COPY_FAILED_MESSAGE);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKakaoSend = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setActionFeedback(null);
    onClearPublishError?.();
    try {
      const sendHandler = onSendToClient ?? onCopyLink;
      const published = sendHandler ? (await Promise.resolve(sendHandler())) !== false : true;
      if (!published) {
        setFeedbackTone('error');
        setActionFeedback('발행 조건을 먼저 확인한 뒤 다시 보내 주세요.');
        return;
      }
      const outcome = await shareKakaoFeed({
        title: headlineDisplay,
        imageUrl: ogImageUrl,
        url: publicUrl,
        buttonTitle: '자세히 보기',
        fallbackText: `${headlineDisplay}\n${publicUrl}`,
      });

      if (outcome === 'kakao') {
        setFeedbackTone('info');
        setActionFeedback('✓ 카카오톡 공유 창을 열었어요.');
      } else if (outcome === 'copied') {
        setFeedbackTone('info');
        setActionFeedback('✓ 링크를 복사했어요. 카카오톡 대화창에 붙여넣어 보내세요.');
        onAfterCopy?.();
      } else {
        setFeedbackTone('error');
        setActionFeedback(COPY_FAILED_MESSAGE);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="presend-modal-title"
      data-testid="presend-confirmation-sheet"
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label="배경 눌러 닫기"
        data-modal-backdrop="true"
        style={{ backgroundColor: 'rgba(15, 23, 42, 0.55)' }}
        onClick={handleClose}
        className="fixed inset-0 min-h-[44px] w-full h-full border-0 p-0 cursor-default"
      />
      <div
        ref={dialogRef}
        className="relative z-10 w-full max-w-lg max-h-[90dvh] overflow-y-auto bg-white rounded-3xl border border-slate-300 shadow-2xl p-6 sm:p-8 space-y-6"
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-200 pb-4">
          <div>
            <h2 id="presend-modal-title" className="text-2xl font-bold text-slate-900">
              카톡으로 보낼까요?
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              보내기 전에 썸네일과 한 줄 제목을 한 번 더 확인해 주세요
            </p>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            data-testid="presend-close-btn"
            onClick={handleClose}
            className="min-h-[48px] min-w-[48px] flex items-center justify-center text-slate-500 hover:text-slate-800 p-2 rounded-xl hover:bg-slate-100 transition cursor-pointer"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        {/* Thumbnail Summary Card */}
        <div
          className="rounded-2xl overflow-hidden border border-slate-300 bg-slate-50 text-slate-900"
        >
          <div className="grid grid-cols-2 border-b border-slate-200">
            <div className="p-3.5 border-r border-slate-200 text-center">
              <p className="text-sm font-semibold text-slate-700">{TERMS.regionLabel}</p>
              <p className="text-lg font-extrabold text-slate-900 mt-0.5 break-keep">
                {card4.region || '—'}
              </p>
            </div>
            <div className="p-3.5 text-center">
              <p className="text-sm font-semibold text-slate-700">{TERMS.useLabel}</p>
              <p className="text-lg font-extrabold text-sky-900 mt-0.5 break-keep">
                {card4.use || '—'}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2">
            {resolvedArea ? (
              <div
                data-testid="presend-area-chip"
                className="p-3.5 border-r border-slate-200 text-center"
              >
                <p className="text-sm font-semibold text-slate-700">{TERMS.areaLabel}</p>
                <p className="text-lg font-extrabold text-slate-900 mt-0.5 break-keep">
                  {resolvedArea}
                </p>
              </div>
            ) : null}
            <div className={`p-3.5 text-center ${resolvedArea ? '' : 'col-span-2'}`}>
              <p className="text-sm font-semibold text-slate-700">{TERMS.priceLabel}</p>
              <p className="text-lg font-extrabold text-amber-900 mt-0.5 break-keep">
                {card4.priceBand || '—'}
              </p>
            </div>
          </div>
          <div className="bg-white text-slate-900 px-4 py-3 border-t border-slate-200">
            <DealCardLineText
              text={headlineDisplay}
              preRepaired
              className="text-base font-extrabold"
            />
          </div>
        </div>

        {/* Validation / Save Alerts (only shown when something needs attention) */}
        {missingRequired.length > 0 && (
          <div
            role="alert"
            className="p-4 rounded-xl border border-amber-300 bg-amber-50 text-amber-950 text-sm font-semibold"
          >
            ⚠ {missingRequired.join(', ')} 항목을 먼저 입력해 주세요.
          </div>
        )}

        {(sensitiveWarnings.length > 0 || !blindResult.isValid) && (
          <div
            role="alert"
            data-testid="presend-blind-alert"
            className="p-4 rounded-xl border border-red-300 bg-red-50 text-red-900 space-y-2.5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <p className="text-base font-bold">
                ⚠ 건물 위치가 드러날 수 있는 표현을 고쳐 주세요
              </p>
              {onAutoMask && (
                <button
                  type="button"
                  data-testid="presend-auto-mask-btn"
                  onClick={onAutoMask}
                  className="min-h-[48px] px-3.5 py-2 rounded-xl bg-red-700 hover:bg-red-800 text-white text-sm font-extrabold transition cursor-pointer shrink-0"
                >
                  민감정보 자동으로 가리기
                </button>
              )}
            </div>
            <ul className="space-y-1">
              {sensitiveWarnings.map((v, i) => (
                <li key={i} className="text-sm text-red-800 font-medium">
                  • {v.reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {!priceBandCheck.valid && (
          <div
            role="alert"
            data-testid="presend-priceband-alert"
            className="p-4 rounded-xl border border-red-300 bg-red-50 text-red-900 space-y-1"
          >
            <p className="text-base font-bold">⚠ 블라인드 가격 구간을 확인해 주세요</p>
            <p className="text-sm text-red-800 font-medium">
              {priceBandCheck.reason || '정확한 매매가를 직접 노출하지 않고 5% 이상 구간으로 입력해 주세요.'}
            </p>
          </div>
        )}

        {publishError && (
          <div
            role="alert"
            data-testid="presend-publish-error"
            className="p-4 rounded-xl border border-red-300 bg-red-50 text-red-900 space-y-2.5"
          >
            <p className="text-sm font-bold leading-relaxed">⚠ {publishError.message}</p>
            {publishError.code === 'STATUTORY_DISCLOSURE_INCOMPLETE' && (
              <Link
                href="/broker/profile"
                data-testid="presend-profile-link"
                onClick={handleClose}
                className="inline-flex min-h-[48px] items-center justify-center rounded-xl bg-red-700 hover:bg-red-800 px-4 py-2 text-sm font-extrabold text-white transition"
              >
                중개사 프로필 완성하기 →
              </Link>
            )}
          </div>
        )}

        {saveStepState === 'flushing' && (
          <p className="text-sm font-semibold text-slate-600" role="status">
            변경 내용을 저장하고 있어요…
          </p>
        )}

        {saveStepState === 'failed' && (
          <div
            role="alert"
            className="p-3.5 rounded-xl border border-red-300 bg-red-50 flex items-center justify-between gap-3"
          >
            <span className="text-sm font-bold text-red-900">
              ⚠ 저장이 완료되지 않았어요.
            </span>
            <button
              type="button"
              onClick={handleRetrySave}
              className="min-h-[48px] px-4 py-2 rounded-lg bg-red-700 text-white text-sm font-bold hover:bg-red-800 transition"
            >
              다시 저장
            </button>
          </div>
        )}

        {actionFeedback && (
          <div
            className={`p-3.5 rounded-xl border text-sm font-semibold ${
              feedbackTone === 'error'
                ? 'bg-red-50 border-red-300 text-red-900'
                : 'bg-blue-50 border-blue-200 text-blue-900'
            }`}
            role="status"
          >
            {actionFeedback}
          </div>
        )}

        {/* Primary & Secondary Actions */}
        <div className="pt-1 space-y-3">
          <button
            ref={primaryBtnRef}
            type="button"
            data-testid="presend-kakao-btn"
            onClick={handleKakaoSend}
            disabled={!isAllValid || isSubmitting}
            className="w-full min-h-[52px] px-5 py-3 rounded-xl bg-yellow-400 hover:bg-yellow-500 text-slate-900 text-base font-black shadow-sm transition active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>{isSubmitting ? '발행 확인 중…' : '카카오톡으로 보내기'}</span>
          </button>

          <button
            type="button"
            data-testid="presend-copy-btn"
            onClick={handleCopy}
            disabled={!isAllValid || isSubmitting}
            className="w-full min-h-[48px] px-4 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 text-base font-semibold transition active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>{TERMS.copyLink}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
