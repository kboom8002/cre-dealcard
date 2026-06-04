'use client';

import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, Share2, ArrowRight } from 'lucide-react';
import { useOnboarding } from '@/lib/onboarding/onboarding-state';
import { trackOnboardingEvent } from '@/lib/onboarding/onboarding-tracker';
import { hapticCelebrate } from './HapticFeedback';
import { ConfettiEffect } from './ConfettiEffect';
import { useRouter } from 'next/navigation';

interface StageCompleteProps {
  onGoToDashboard: () => void;
}

interface Achievement {
  icon: string;
  label: string;
  done: boolean;
}

export function StageComplete({ onGoToDashboard }: StageCompleteProps) {
  const { state } = useOnboarding();
  const { data } = state;
  const router = useRouter();
  const [showConfetti, setShowConfetti] = useState(false);
  const [shared, setShared] = useState(false);

  const achievements: Achievement[] = [
    { icon: '🎯', label: 'AI Vibe 프로필 명함', done: !!data.vibeResult },
    { icon: '🏢', label: '빌딩 레이더 첫 조회', done: !!data.radarAddress },
    { icon: '📋', label: '블라인드 딜카드 1개', done: !!data.firstDealCardId },
  ].filter((a) => a.done);

  useEffect(() => {
    hapticCelebrate();
    setTimeout(() => setShowConfetti(true), 100);
    void trackOnboardingEvent('onboard_complete', data.sessionToken);
  }, [data.sessionToken]);

  const handleShare = async () => {
    const vtiLabel = data.vibeResult?.vtiResult?.meta?.label_ko ?? '전문가';
    const trust = data.vibeResult
      ? Math.round(data.vibeResult.afterScores.trust * 100)
      : 80;
    const region = data.region
      ? regionLabel(data.region)
      : '서울';

    const shareText = `🏢 DealCard Vibe 명함\n\n${data.userName ?? '홍길동'} | ${vtiLabel}\nTrust Score ${trust} · ${region} 전문\n\n나도 만들기 → dealcard.kr/onboarding`;

    try {
      if (navigator.share) {
        await navigator.share({ text: shareText, url: 'https://dealcard.kr/onboarding' });
      } else {
        await navigator.clipboard.writeText(shareText);
      }
      setShared(true);
      await trackOnboardingEvent('onboard_share_final', data.sessionToken);
    } catch {
      // User cancelled share
    }
  };

  const handleDashboard = () => {
    void trackOnboardingEvent('onboard_complete', data.sessionToken);
    onGoToDashboard();
    router.push('/broker');
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 py-12">
      <ConfettiEffect active={showConfetti} duration={4000} />

      <motion.div
        className="w-full max-w-sm"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        {/* Header */}
        <div className="mb-8 text-center">
          <motion.div
            className="mb-4 inline-flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 shadow-xl shadow-amber-500/30"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200, damping: 12 }}
          >
            <span className="text-4xl">🎉</span>
          </motion.div>

          <motion.h2
            className="text-2xl font-black text-white"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            온보딩 완료!
          </motion.h2>
          <motion.p
            className="mt-2 text-sm text-neutral-400"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            3분 만에 완성한 것들
          </motion.p>
        </div>

        {/* Achievements */}
        {achievements.length > 0 && (
          <motion.div
            className="mb-6 space-y-2"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            {achievements.map((a, i) => (
              <motion.div
                key={a.label}
                className="flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-3"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + i * 0.1 }}
              >
                <span className="text-xl">{a.icon}</span>
                <span className="flex-1 text-sm font-medium text-neutral-200">{a.label}</span>
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* Divider */}
        <motion.div
          className="mb-6 h-px bg-neutral-800"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
        />

        {/* Share CTA */}
        <motion.div
          className="space-y-3"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.75 }}
        >
          <p className="text-center text-sm font-semibold text-white">
            💡 지금 하나만 해보세요
          </p>
          <p className="text-center text-xs text-neutral-500">
            이 명함을 건물주나 동료에게 카톡으로 보내보세요.<br />
            반응이 다릅니다.
          </p>

          {/* Mini Vibe Card preview */}
          <div className="overflow-hidden rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-950/40 to-orange-950/40 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-lg font-black text-black">
                {(data.userName ?? '홍')[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-white">{data.userName ?? '홍길동'}</p>
                <p className="text-xs text-amber-400/80">
                  {data.vibeResult?.vtiResult?.meta?.label_ko ?? '전문가'} ·{' '}
                  {data.region ? regionLabel(data.region) : '서울'}
                </p>
                {data.vibeResult && (
                  <p className="text-xs text-neutral-500">
                    Trust {Math.round(data.vibeResult.afterScores.trust * 100)} ·{' '}
                    {data.firstDealCardId ? '딜카드 1건' : ''}
                  </p>
                )}
              </div>
            </div>
          </div>

          <motion.button
            onClick={() => void handleShare()}
            whileTap={{ scale: 0.97 }}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 py-3.5 text-sm font-black text-black shadow-lg shadow-amber-500/20 hover:brightness-110"
          >
            <Share2 className="h-4 w-4" />
            {shared ? '✓ 공유 완료!' : '📱 카톡으로 공유하기'}
          </motion.button>

          <button
            onClick={handleDashboard}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-neutral-800 py-3 text-sm font-semibold text-neutral-400 hover:border-neutral-700 hover:text-white transition-all"
          >
            대시보드로 이동
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </motion.div>
      </motion.div>
    </div>
  );
}

function regionLabel(r: string): string {
  const map: Record<string, string> = {
    seongsu_seongdong: '성수/성동',
    gangnam_seocho: '강남/서초',
    yeouido_mapo: '여의도/마포',
    cbd: 'CBD',
    pangyo: '판교/분당',
    other: '서울',
  };
  return map[r] ?? r;
}
