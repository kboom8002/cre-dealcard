'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import { MessageCircle, ArrowRight, Building2 } from 'lucide-react';
import { useOnboarding } from '@/lib/onboarding/onboarding-state';
import { trackOnboardingEvent } from '@/lib/onboarding/onboarding-tracker';
import { hapticLight } from './HapticFeedback';

interface StageAgoraProps {
  onComplete: () => void;
  onSkip: () => void;
}

const PRESET_QUESTIONS = [
  '우리 건물의 현재 시세는 얼마나 될까요?',
  '매각 타이밍을 어떻게 판단해야 할까요?',
  '양도세를 절약할 수 있는 방법이 있나요?',
  '매각 시 임차인 처리는 어떻게 하나요?',
];

export function StageAgora({ onComplete, onSkip }: StageAgoraProps) {
  const { state } = useOnboarding();
  const { data } = state;

  const [question, setQuestion] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [aiAnswer, setAiAnswer] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSelectPreset = (q: string) => {
    setQuestion(q);
    hapticLight();
  };

  const handleSubmit = async () => {
    if (!question.trim()) return;
    setIsLoading(true);
    hapticLight();

    await trackOnboardingEvent('onboard_radar_start', data.sessionToken, {
      question: question.trim(),
    });

    // Simulate AI answer (real implementation would call /api/agora)
    await new Promise((r) => setTimeout(r, 1500));

    setAiAnswer(
      `좋은 질문입니다. "${question.slice(0, 20)}..."에 대해 전문가가 답변드릴 예정입니다. 빌딩 관련 전문가 5인이 검토 중이며, 보통 24시간 이내에 답변이 등록됩니다. 더 빠른 답변을 위해 건물 정보를 추가로 입력해주시면 좋습니다.`,
    );
    setSubmitted(true);
    setIsLoading(false);
  };

  return (
    <div className="flex min-h-dvh flex-col px-6 py-10">
      <motion.div
        className="mb-6 text-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="mb-3 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 shadow-lg shadow-emerald-500/20">
          <MessageCircle className="h-8 w-8 text-black" />
        </div>
        <h2 className="text-2xl font-black text-white">매각 관련 궁금한 점이<br />있으신가요?</h2>
        <p className="mt-2 text-sm text-neutral-400">
          전문가들이 24시간 내 답변드립니다
        </p>
      </motion.div>

      {!submitted ? (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="space-y-4"
        >
          {/* Preset questions */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
              자주 묻는 질문
            </p>
            {PRESET_QUESTIONS.map((q) => (
              <motion.button
                key={q}
                onClick={() => handleSelectPreset(q)}
                whileTap={{ scale: 0.98 }}
                className={`w-full rounded-xl border p-3.5 text-left text-sm transition-all ${
                  question === q
                    ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400'
                    : 'border-neutral-800 bg-neutral-900/50 text-neutral-300 hover:border-neutral-700'
                }`}
              >
                {q}
              </motion.button>
            ))}
          </div>

          {/* Custom question */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
              직접 입력
            </p>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="궁금한 점을 자유롭게 입력하세요..."
              rows={3}
              className="w-full resize-none rounded-xl border border-neutral-700 bg-neutral-900 p-4 text-sm text-white placeholder-neutral-600 focus:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          <motion.button
            onClick={() => void handleSubmit()}
            disabled={!question.trim() || isLoading}
            whileTap={{ scale: 0.97 }}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-500 py-3.5 text-sm font-black text-black shadow-lg shadow-emerald-500/20 hover:brightness-110 disabled:opacity-50"
          >
            {isLoading ? '전문가 배정 중...' : '질문 올리기'}
            {!isLoading && <ArrowRight className="h-4 w-4" />}
          </motion.button>

          <button
            onClick={onSkip}
            className="w-full py-2 text-center text-sm text-neutral-600 hover:text-neutral-400 transition-colors"
          >
            나중에 하기
          </button>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="space-y-4"
        >
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <div className="mb-3 flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-bold text-emerald-400">AI 1차 분석</span>
            </div>
            <p className="text-sm leading-relaxed text-neutral-300">{aiAnswer}</p>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900/50 p-3">
            <Building2 className="h-8 w-8 shrink-0 text-neutral-600" />
            <div>
              <p className="text-xs font-semibold text-neutral-400">전문가 배정 완료</p>
              <p className="text-xs text-neutral-600">
                변호사 · 세무사 · 중개사 5인이 검토 중
              </p>
            </div>
          </div>

          <motion.button
            onClick={onComplete}
            whileTap={{ scale: 0.97 }}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-500 py-3.5 text-sm font-black text-black shadow-lg shadow-emerald-500/20 hover:brightness-110"
          >
            완료하기
            <ArrowRight className="h-4 w-4" />
          </motion.button>
        </motion.div>
      )}
    </div>
  );
}
