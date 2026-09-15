"use client";

import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { Check, MessageSquare, ExternalLink } from "lucide-react";

interface MagazineShareModalProps {
  showShareModal: boolean;
  setShowShareModal: (open: boolean) => void;
  handleMagazineKakaoShare: () => void;
  handleCopyLink: () => void;
}

export function MagazineShareModal({
  showShareModal,
  setShowShareModal,
  handleMagazineKakaoShare,
  handleCopyLink,
}: MagazineShareModalProps) {
  return (
    <AnimatePresence>
      {showShareModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            className="bg-slate-900 border border-slate-800 p-6 rounded-2xl w-full max-w-sm shadow-2xl relative"
          >
            <button
              onClick={() => setShowShareModal(false)}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-300"
            >
              ✕
            </button>

            <div className="text-center mb-6">
              <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-3">
                <Check className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white mb-1">
                매거진 발행 완료!
              </h3>
              <p className="text-[12px] text-slate-400">
                고객들에게 이번 주 매거진을 공유해보세요.
              </p>
            </div>

            <div className="space-y-3">
              <button
                onClick={handleMagazineKakaoShare}
                className="w-full flex items-center justify-center gap-2 bg-[#FEE500] hover:bg-[#FEE500]/90 text-[#3C1E1E] font-bold text-sm py-3.5 rounded-xl transition-all"
              >
                <MessageSquare className="w-4 h-4" />
                카카오톡으로 공유
              </button>
              <button
                onClick={handleCopyLink}
                className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm py-3.5 rounded-xl transition-all border border-slate-700"
              >
                <ExternalLink className="w-4 h-4" />
                링크 복사하기
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
