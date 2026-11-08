'use client';

/**
 * Pre-Send Confirmation Sheet — 간결한 카카오톡 보내기 확인 창
 *
 * - 자동 저장 완료 및 지번·건물명 보호 점검을 백그라운드에서 수행
 * - 문제가 있을 때만 수정 안내 표시
 * - 주 버튼: [카카오톡으로 보내기] (실제 Kakao SDK 공유 + 클립보드 폴백)
 * - 보조 버튼: [링크 복사] (실제 클립보드 성공 여부 확인)
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  resolveCard4AreaLabel,
  type Card4Data,
} from '@/lib/deal-card/card4-schema';
import { validateBlindPoints } from '@/lib/deal-card/blind-guard';
import { copyText, COPY_FAILED_MESSAGE } from '@/lib/ux/clipboard';
import { getSiteOrigin, shareKakaoFeed } from '@/lib/kakao/share';
import { TERMS } from '@/lib/ux/lexicon';

export interface PreSendConfirmationSheetProps {
  isOpen: boolean;
  onClose: () => void;
  card4: Card4Data;
  dealId: string;
  isSaved: boolean;
  onFlushSave: () => Promise<boolean>;
  onSendToSelf?: () => Promise<void>;
  onSendToClient?: () => void;
  onCopyLink?: () => void;
}

export function PreSendConfirmationSheet({
  isOpen,
  onClose,
  card4,
  dealId,
  isSaved,
  onFlushSave,
  onSendToClient,
  onCopyLink,
}: PreSendConfirmationSheetProps) {
  const [saveStepState, setSaveStepState] = useState<'pending' | 'flushing' | 'done' | 'failed'>(
    isSaved ? 'done' : 'pending',
  );
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<'info' | 'error'>('info');
  const primaryBtnRef = useRef<HTMLButtonElement | null>(null);

  // Validate points + header fields
  const blindResult = validateBlindPoints(
    [...card4.points, card4.region || '', card4.use || '', card4.headline || ''],
    {
      region: card4.region,
      assetType: card4.use,
    },
  );

  const missingRequired: string[] = [];
  if (!card4.region?.trim()) missingRequired.push(TERMS.regionLabel);
  if (!card4.use?.trim()) missingRequired.push(TERMS.useLabel);
  if (!card4.priceBand?.trim()) missingRequired.push(TERMS.priceLabel);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) {
      setSaveStepState('pending');
      setActionFeedback(null);
      return;
    }

    if (isSaved) {
      setSaveStepState('done');
    } else {
      setSaveStepState('flushing');
      onFlushSave()
        .then((ok) => {
          setSaveStepState(ok ? 'done' : 'failed');
        })
        .catch(() => {
          setSaveStepState('failed');
        });
    }
  }, [isOpen, isSaved, onFlushSave]);

  if (!isOpen) return null;

  const origin = getSiteOrigin();
  const publicUrl = `${origin}/dc/${dealId}`;
  const ogImageUrl = `${origin}/api/og/deal/${dealId}/kakao-v2${
    card4.card4_hash ? `?v=${card4.card4_hash}` : ''
  }`;
  const areaDisplay = resolveCard4AreaLabel(card4) || '—';
  const headlineDisplay =
    (card4.headline || '').trim() ||
    [card4.region, card4.use, card4.priceBand].filter(Boolean).join(' · ') ||
    '매물 안내';

  const isAllValid =
    saveStepState === 'done' && blindResult.isValid && missingRequired.length === 0;

  const handleRetrySave = async () => {
    setSaveStepState('flushing');
    const ok = await onFlushSave().catch(() => false);
    setSaveStepState(ok ? 'done' : 'failed');
  };

  const handleCopy = async () => {
    const ok = await copyText(publicUrl);
    if (ok) {
      setFeedbackTone('info');
      setActionFeedback('✓ 링크를 복사했어요. 카카오톡 대화창에 붙여넣어 보내세요.');
      onCopyLink?.();
    } else {
      setFeedbackTone('error');
      setActionFeedback(COPY_FAILED_MESSAGE);
    }
  };

  const handleKakaoSend = async () => {
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
      onSendToClient?.();
    } else if (outcome === 'copied') {
      setFeedbackTone('info');
      setActionFeedback('✓ 링크를 복사했어요. 카카오톡 대화창에 붙여넣어 보내세요.');
      onCopyLink?.();
    } else {
      setFeedbackTone('error');
      setActionFeedback(COPY_FAILED_MESSAGE);
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
      <div className="w-full max-w-lg bg-white rounded-3xl border border-slate-300 shadow-2xl p-6 sm:p-8 space-y-6">
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
            type="button"
            onClick={onClose}
            className="min-h-[48px] min-w-[48px] flex items-center justify-center text-slate-500 hover:text-slate-800 p-2 rounded-xl hover:bg-slate-100 transition"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        {/* Thumbnail Summary Card */}
        <div className="rounded-2xl overflow-hidden border border-slate-300 bg-slate-900 text-white">
          <div className="grid grid-cols-2 border-b border-slate-700">
            <div className="p-3.5 border-r border-slate-700 text-center">
              <p className="text-sm text-slate-400">{TERMS.regionLabel}</p>
              <p className="text-lg font-extrabold text-white mt-0.5 break-keep">
                {card4.region || '—'}
              </p>
            </div>
            <div className="p-3.5 text-center">
              <p className="text-sm text-slate-400">{TERMS.useLabel}</p>
              <p className="text-lg font-extrabold text-sky-300 mt-0.5 break-keep">
                {card4.use || '—'}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2">
            <div className="p-3.5 border-r border-slate-700 text-center">
              <p className="text-sm text-slate-400">{TERMS.areaLabel}</p>
              <p className="text-lg font-extrabold text-slate-100 mt-0.5 break-keep">
                {areaDisplay}
              </p>
            </div>
            <div className="p-3.5 text-center">
              <p className="text-sm text-slate-400">{TERMS.priceLabel}</p>
              <p className="text-lg font-extrabold text-amber-300 mt-0.5 break-keep">
                {card4.priceBand || '—'}
              </p>
            </div>
          </div>
          <div className="bg-white text-slate-900 px-4 py-3 border-t border-slate-200">
            <p className="text-base font-extrabold break-keep">{headlineDisplay}</p>
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

        {!blindResult.isValid && (
          <div
            role="alert"
            className="p-4 rounded-xl border border-red-300 bg-red-50 text-red-900 space-y-1.5"
          >
            <p className="text-base font-bold">
              ⚠ 건물 위치가 드러날 수 있는 표현을 고쳐 주세요
            </p>
            <ul className="space-y-1">
              {blindResult.violations.map((v, i) => (
                <li key={i} className="text-sm text-red-800 font-medium">
                  • {v.reason}
                </li>
              ))}
            </ul>
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
            disabled={!isAllValid}
            className="w-full min-h-[52px] px-5 py-3 rounded-xl bg-yellow-400 hover:bg-yellow-500 text-slate-900 text-base font-black shadow-sm transition active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>카카오톡으로 보내기</span>
          </button>

          <button
            type="button"
            data-testid="presend-copy-btn"
            onClick={handleCopy}
            disabled={!isAllValid}
            className="w-full min-h-[48px] px-4 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 text-base font-semibold transition active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>{TERMS.copyLink}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
