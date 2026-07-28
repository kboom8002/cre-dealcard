'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { recordTacitLabel, COMMON_REASON_CODES } from '@/domain/building/tacit-label-service';

interface TacitLabelModalProps {
  isOpen: boolean;
  onClose: () => void;
  dealId: string;
  brokerId: string;
  buyerId?: string;
  category: 'deal_fallout' | 'buyer_rejection' | 'price_mismatch' | 'eviction_issue';
}

const REASON_CHIPS = [
  { code: 'price_too_high', label: '가격 불일치', icon: '💸' },
  { code: 'loan_rejected', label: '대출 거절', icon: '🏦' },
  { code: 'parking_shortage', label: '주차 부족', icon: '🏎️' },
  { code: 'location_dissatisfaction', label: '입지 불만', icon: '📍' },
  { code: 'eviction_issue', label: '퇴거 이슈', icon: '⚠️' },
];

export function TacitLabelModal({ isOpen, onClose, dealId, brokerId, buyerId, category }: TacitLabelModalProps) {
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!selectedReason) return;
    setSaving(true);
    try {
      await recordTacitLabel({
        brokerId,
        dealId,
        category,
        reasonCode: selectedReason,
        memo: memo || undefined,
      });
      onClose();
    } catch (err) {
      console.error('Tacit label failed:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm px-4 pb-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl p-5 space-y-4"
          >
            <div className="text-center">
              <span className="text-3xl">🏷️</span>
              <h2 className="text-lg font-bold text-white mt-2">딜 종료 사유</h2>
              <p className="text-xs text-neutral-400 mt-1">1-tap으로 빠르게 기록해 주세요</p>
            </div>

            {/* Reason Chips */}
            <div className="flex flex-wrap gap-2 justify-center">
              {REASON_CHIPS.map(chip => (
                <button
                  key={chip.code}
                  onClick={() => setSelectedReason(chip.code)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs transition-all ${
                    selectedReason === chip.code
                      ? 'bg-primary/20 text-primary border border-primary/30 scale-105'
                      : 'bg-neutral-800 text-neutral-300 border border-neutral-700 hover:border-neutral-600'
                  }`}
                >
                  <span>{chip.icon}</span> {chip.label}
                </button>
              ))}
            </div>

            {/* Optional Memo */}
            <textarea
              value={memo}
              onChange={e => setMemo(e.target.value)}
              placeholder="추가 메모 (선택)"
              className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-primary resize-none h-16"
            />

            {/* Actions */}
            <div className="flex gap-2">
              <button onClick={onClose}
                className="flex-1 py-2.5 bg-neutral-800 text-neutral-300 text-sm rounded-xl hover:bg-neutral-700 transition-colors">
                건너뛰기
              </button>
              <button onClick={handleSubmit}
                disabled={!selectedReason || saving}
                className="flex-1 py-2.5 bg-primary text-black text-sm font-bold rounded-xl disabled:opacity-40 hover:bg-primary/90 transition-colors">
                {saving ? '저장 중...' : '태깅 완료'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
