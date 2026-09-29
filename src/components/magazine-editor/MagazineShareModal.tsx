"use client";

import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { Check, MessageSquare, ExternalLink, Mail, Lock, Sparkles } from "lucide-react";

export interface MagazineDistributionResult {
  sent?: number;
  emailSent?: number;
  kakaoSent?: number;
  kakaoSkipped?: number;
  isPaidTier?: boolean;
  tier?: string;
}

interface MagazineShareModalProps {
  showShareModal: boolean;
  setShowShareModal: (open: boolean) => void;
  handleMagazineKakaoShare: () => void;
  handleCopyLink: () => void;
  distributionResult?: MagazineDistributionResult | null;
  isPaidTier?: boolean;
}

export function MagazineShareModal({
  showShareModal,
  setShowShareModal,
  handleMagazineKakaoShare,
  handleCopyLink,
  distributionResult,
  isPaidTier = false,
}: MagazineShareModalProps) {
  const isPaid = distributionResult?.isPaidTier ?? isPaidTier;
  const emailSent = distributionResult?.emailSent ?? 0;
  const kakaoSent = distributionResult?.kakaoSent ?? 0;
  const kakaoSkipped = distributionResult?.kakaoSkipped ?? 0;

  return (
    <AnimatePresence>
      {showShareModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            className="bg-slate-900 border border-slate-800 p-6 rounded-2xl w-full max-w-md shadow-2xl relative"
          >
            <button
              onClick={() => setShowShareModal(false)}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-300"
            >
              ✕
            </button>

            <div className="text-center mb-5">
              <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-3">
                <Check className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white mb-1">
                매거진 발행 완료!
              </h3>
              <p className="text-[12px] text-slate-400">
                개인화된 링크를 통해 고객에게 매거진을 전달해보세요.
              </p>
            </div>

            {/* 발송 결과 & 티어 안내 */}
            <div className="space-y-3 mb-5">
              {emailSent > 0 ? (
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-semibold">
                  <Mail className="w-4 h-4 text-indigo-400 shrink-0" />
                  <span>이메일 구독자 {emailSent}명에게 발송 완료</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/50 text-slate-300 text-xs">
                  <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>이메일 구독자에게 우선 발송 파이프라인 연동</span>
                </div>
              )}

              {isPaid ? (
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-semibold">
                  <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Pro 멤버십: 카카오 알림톡({kakaoSent}건) 자동 일괄 발송 완료</span>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-left space-y-1">
                  <div className="flex items-center gap-1.5 text-amber-400 font-bold text-xs">
                    <Lock className="w-3.5 h-3.5 shrink-0" />
                    카카오톡 알림톡 자동 일괄 발송은 [Pro 유료 플랜] 전용입니다
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    {kakaoSkipped > 0 ? `알림톡 대기 ${kakaoSkipped}건이 감지되었습니다. ` : ""}
                    현재 무료 플랜에서는 이메일 발송이 우선 지원됩니다. 아래 <strong className="text-slate-300">카카오톡 공유</strong> 또는 <strong className="text-slate-300">링크 복사</strong>로 고객에게 개인화된 매거진을 직접 전달해 보세요!
                  </p>
                </div>
              )}
            </div>

            {/* 수동 공유 및 전달 액션 버튼 */}
            <div className="space-y-2.5">
              <button
                onClick={handleMagazineKakaoShare}
                className="w-full flex items-center justify-center gap-2 bg-[#FEE500] hover:bg-[#FEE500]/90 text-[#3C1E1E] font-bold text-sm py-3.5 rounded-xl transition-all shadow-md shadow-amber-500/10"
              >
                <MessageSquare className="w-4 h-4" />
                카카오톡으로 1:1 수동 공유
              </button>
              <button
                onClick={handleCopyLink}
                className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm py-3 rounded-xl transition-all border border-slate-700"
              >
                <ExternalLink className="w-4 h-4" />
                개인화 매거진 링크 복사하기
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
