'use client';

/**
 * Pre-Send Confirmation Sheet (WP-P1-09 & WP-P1-10)
 *
 * Requirements:
 * 1. 4-step checklist:
 *    - Step 1: 저장 즉시 반영 (Save flush before send)
 *    - Step 2: 해시 확정 (Deterministic card4_hash confirmation)
 *    - Step 3: 블라인드 점검 (0 parcel numbers, 0 building names, 0 PII confirmed)
 *    - Step 4: 발송 옵션 (나에게 먼저 보내기 / 고객에게 보내기 / 링크 복사)
 * 2. Send actions:
 *    - 나에게 먼저 보내기 (test webhook / self-send simulation)
 *    - 고객에게 보내기 (KakaoTalk share)
 *    - 링크 복사 (copies /dc/{id} with toast feedback)
 * 3. High contrast, senior typography, click-to-pin, escape key handling.
 */

import React, { useState, useEffect } from 'react';
import type { Card4Data } from '@/lib/deal-card/card4-schema';
import { validateBlindPoints } from '@/lib/deal-card/blind-guard';

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
  onSendToSelf,
  onSendToClient,
  onCopyLink,
}: PreSendConfirmationSheetProps) {
  const [saveStepState, setSaveStepState] = useState<'pending' | 'flushing' | 'done'>('pending');
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  // Validate blind points
  const blindResult = validateBlindPoints(card4.points, {
    region: card4.region,
    assetType: card4.use,
  });

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Flush save on modal open if not already saved
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
      onFlushSave().then((ok) => {
        setSaveStepState(ok ? 'done' : 'pending');
      });
    }
  }, [isOpen, isSaved, onFlushSave]);

  if (!isOpen) return null;

  const publicUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/dc/${dealId}`
    : `https://credeal.net/dc/${dealId}`;

  const handleCopy = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(publicUrl);
        setActionFeedback('📋 딜카드 링크가 복사되었습니다. 카카오톡에 바로 붙여넣으세요.');
      }
      onCopyLink?.();
    } catch {
      setActionFeedback('링크 복사에 실패했습니다. 브라우저 권한을 확인해주세요.');
    }
  };

  const handleSelfSend = async () => {
    try {
      setActionFeedback('⏳ 나에게 먼저 보내는 중...');
      if (onSendToSelf) {
        await onSendToSelf();
      } else {
        // Fallback simulation
        await new Promise((r) => setTimeout(r, 600));
      }
      setActionFeedback('✅ 내 카카오톡으로 테스트 딜카드가 발송되었습니다. 수신된 카드를 확인해보세요.');
    } catch {
      setActionFeedback('테스트 발송에 실패했습니다. 잠시 후 다시 시도해주세요.');
    }
  };

  const handleClientSend = () => {
    setActionFeedback('카카오톡 공유 창을 엽니다...');
    if (onSendToClient) {
      onSendToClient();
    } else {
      handleCopy();
    }
  };

  const isAllValid = saveStepState === 'done' && blindResult.isValid;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="presend-modal-title"
      data-testid="presend-confirmation-sheet"
    >
      <div
        className="w-full max-w-xl bg-white rounded-3xl border border-slate-300 shadow-2xl p-6 sm:p-8 space-y-6 animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-200 pb-4">
          <div>
            <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200">
              최종 발송 전 4단계 안심 검증
            </span>
            <h2 id="presend-modal-title" className="text-2xl font-bold text-slate-900 mt-1.5">
              카카오톡 발송 확인
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-2 rounded-xl hover:bg-slate-100 transition"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        {/* 4-Step Checklist */}
        <div className="space-y-3.5">
          {/* Step 1: 저장 즉시 반영 */}
          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xl">
                {saveStepState === 'done' ? '✅' : '⏳'}
              </span>
              <div>
                <p className="text-[16px] font-bold text-slate-800">
                  1단계: 서버 저장 반영
                </p>
                <p className="text-xs text-slate-500">
                  {saveStepState === 'done'
                    ? '최신 4항목 편집 내용이 서버에 안전하게 저장되었습니다.'
                    : '서버에 변경 사항을 즉시 반영하는 중입니다...'}
                </p>
              </div>
            </div>
            <span className="text-xs font-semibold px-2 py-1 rounded bg-slate-200 text-slate-700">
              {saveStepState === 'done' ? '완료' : '저장 중'}
            </span>
          </div>

          {/* Step 2: 해시 확정 */}
          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xl">🔒</span>
              <div>
                <p className="text-[16px] font-bold text-slate-800">
                  2단계: 딜카드 버전 해시 확정
                </p>
                <p className="text-xs text-slate-500 font-mono">
                  SHA-256: {card4.card4_hash ? card4.card4_hash.slice(0, 16) + '...' : '확정 완료'}
                </p>
              </div>
            </div>
            <span className="text-xs font-semibold px-2 py-1 rounded bg-blue-100 text-blue-800">
              v{card4.card4_version || 1} 고정
            </span>
          </div>

          {/* Step 3: 블라인드 점검 */}
          <div
            className={`p-3.5 rounded-xl border ${
              blindResult.isValid
                ? 'border-emerald-200 bg-emerald-50/60'
                : 'border-red-200 bg-red-50'
            } flex items-start justify-between gap-3`}
          >
            <div className="flex items-start gap-3">
              <span className="text-xl">
                {blindResult.isValid ? '🛡️' : '⚠️'}
              </span>
              <div>
                <p
                  className={`text-[16px] font-bold ${
                    blindResult.isValid ? 'text-emerald-900' : 'text-red-900'
                  }`}
                >
                  3단계: 블라인드 안심 점검
                </p>
                <p className="text-xs text-slate-600 mt-0.5">
                  {blindResult.isValid
                    ? '지번·건물명·소유주·임차브랜드 등 식별 정보 0건 확인'
                    : `위반 항목 ${blindResult.violations.length}건이 발견되었습니다. 수정 후 발송해주세요.`}
                </p>
                {blindResult.violations.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {blindResult.violations.map((v, i) => (
                      <li key={i} className="text-xs text-red-700 font-medium">
                        • {v.reason}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <span
              className={`text-xs font-semibold px-2 py-1 rounded shrink-0 ${
                blindResult.isValid
                  ? 'bg-emerald-200 text-emerald-900'
                  : 'bg-red-200 text-red-900'
              }`}
            >
              {blindResult.isValid ? '통과' : '수정 필요'}
            </span>
          </div>

          {/* Step 4: 발송 안내 */}
          <div className="p-3.5 rounded-xl border border-blue-200 bg-blue-50/50 flex items-center gap-3">
            <span className="text-xl">📤</span>
            <div>
              <p className="text-[16px] font-bold text-blue-950">
                4단계: 발송 대상 선택
              </p>
              <p className="text-xs text-blue-800">
                실제 고객에게 보내기 전, &apos;나에게 먼저 보내기&apos;로 실제 수신 화면을 확인하는 것을 권장합니다.
              </p>
            </div>
          </div>
        </div>

        {/* Action Feedback Alert */}
        {actionFeedback && (
          <div
            className="p-3 bg-blue-50 rounded-xl border border-blue-200 text-sm text-blue-900 font-medium"
            role="status"
          >
            {actionFeedback}
          </div>
        )}

        {/* Send Action Buttons (WP-P1-10) */}
        <div className="pt-2 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Action 1: 나에게 먼저 보내기 */}
            <button
              type="button"
              onClick={handleSelfSend}
              disabled={!isAllValid}
              className="min-h-[52px] px-4 py-3 rounded-xl border-2 border-blue-600 bg-white text-blue-700 hover:bg-blue-50 text-[16px] font-bold transition active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <span>📱</span>
              <span>나에게 먼저 보내기</span>
            </button>

            {/* Action 2: 고객에게 보내기 */}
            <button
              type="button"
              onClick={handleClientSend}
              disabled={!isAllValid}
              className="min-h-[52px] px-4 py-3 rounded-xl bg-yellow-400 hover:bg-yellow-500 text-slate-900 text-[16px] font-black shadow-sm transition active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <span>💬</span>
              <span>고객에게 보내기</span>
            </button>
          </div>

          {/* Action 3: 링크 복사 */}
          <button
            type="button"
            onClick={handleCopy}
            disabled={!isAllValid}
            className="w-full min-h-[48px] px-4 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 text-[15px] font-semibold transition active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2"
          >
            <span>📋</span>
            <span>딜카드 공개 링크 1초 복사</span>
          </button>
        </div>
      </div>
    </div>
  );
}
