'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronRight, User, Lock, Phone, MapPin } from 'lucide-react';
import { useOnboarding } from '@/lib/onboarding/onboarding-state';
import type { ExpertSpecialty, Region } from '@/lib/onboarding/onboarding-types';
import { SPECIALTY_LABELS, REGION_LABELS } from '@/lib/onboarding/onboarding-types';
import { trackOnboardingEvent } from '@/lib/onboarding/onboarding-tracker';
import { hapticMedium, hapticLight } from './HapticFeedback';

interface StageLoginProps {
  onComplete: () => void;
  onSkip?: () => void;
}

type LoginPhase = 'info' | 'specialty' | 'region' | 'submitting';

const SPECIALTIES: ExpertSpecialty[] = [
  'small_building',
  'office_lease',
  'retail',
  'industrial',
  'attorney',
  'tax_accountant',
  'legal_scrivener',
  'other',
];

const REGIONS: Region[] = [
  'seongsu_seongdong',
  'gangnam_seocho',
  'yeouido_mapo',
  'cbd',
  'pangyo',
  'other',
];

export function StageLogin({ onComplete, onSkip }: StageLoginProps) {
  const { state, setUserName, setUserPhone, setSpecialty, setRegion, setStage, setSessionToken } =
    useOnboarding();
  const { data } = state;

  const [phase, setPhase] = useState<LoginPhase>('info');
  const [name, setName] = useState(data.userName ?? '');
  const [phone, setPhone] = useState(data.userPhone ?? '');
  const [selectedSpecialty, setSelectedSpecialty] = useState<ExpertSpecialty | null>(
    data.specialty,
  );
  const [selectedRegion, setSelectedRegion] = useState<Region | null>(data.region);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleInfoNext = () => {
    if (!name.trim()) {
      setError('이름을 입력해주세요.');
      return;
    }
    setError('');
    setUserName(name.trim());
    if (phone.trim()) setUserPhone(phone.trim());
    hapticLight();
    setPhase('specialty');
    trackOnboardingEvent('onboard_login_start', data.sessionToken);
  };

  const handleSpecialtySelect = (s: ExpertSpecialty) => {
    setSelectedSpecialty(s);
    setSpecialty(s);
    hapticLight();
    setTimeout(() => setPhase('region'), 200);
  };

  const handleRegionSelect = async (r: Region) => {
    setSelectedRegion(r);
    setRegion(r);
    hapticMedium();
    await handleSubmit(r);
  };

  const handleSubmit = async (regionOverride?: Region) => {
    const finalSpecialty = selectedSpecialty;
    const finalRegion = regionOverride ?? selectedRegion;
    if (!finalSpecialty || !finalRegion) return;

    setIsSubmitting(true);
    setPhase('submitting');

    try {
      // Save profile via API
      const res = await fetch('/api/onboarding/save-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_token: data.sessionToken,
          specialty: finalSpecialty,
          region: finalRegion,
          role: data.role ?? 'expert',
          user_name: name.trim() || undefined,
          user_phone: phone.trim() || undefined,
        }),
      });

      if (res.ok) {
        await trackOnboardingEvent('onboard_profile_done', data.sessionToken, {
          specialty: finalSpecialty,
          region: finalRegion,
        });
        setStage('radar');
        onComplete();
      } else {
        // Even if save fails, continue (non-blocking)
        setStage('radar');
        onComplete();
      }
    } catch {
      // Network error — still continue
      setStage('radar');
      onComplete();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 py-12">
      <AnimatePresence mode="wait">
        {/* Phase: info */}
        {phase === 'info' && (
          <motion.div
            key="info"
            className="w-full max-w-sm"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -24 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          >
            <div className="mb-8 text-center">
              <div className="mb-3 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-amber-500/20">
                <User className="h-8 w-8 text-black" />
              </div>
              <h2 className="text-2xl font-black text-white">명함을 완성해요</h2>
              <p className="mt-2 text-sm text-neutral-400">이름만 추가하면 Vibe 명함이 완성됩니다</p>
            </div>

            <div className="space-y-4">
              {/* Name */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-neutral-300">
                  이름 <span className="text-amber-400">*</span>
                </label>
                <div className="relative">
                  <User
                    className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500"
                  />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => { setName(e.target.value); setError(''); }}
                    placeholder="홍길동"
                    autoFocus
                    className="w-full rounded-xl border border-neutral-700 bg-neutral-900 py-3.5 pl-10 pr-4 text-sm text-white placeholder-neutral-600 focus:border-amber-500/50 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  />
                </div>
                {error && <p className="text-xs text-red-400">{error}</p>}
              </div>

              {/* Phone (optional) */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-neutral-300">
                  연락처 <span className="text-neutral-600">(선택)</span>
                </label>
                <div className="relative">
                  <Phone
                    className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500"
                  />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="010-1234-5678"
                    className="w-full rounded-xl border border-neutral-700 bg-neutral-900 py-3.5 pl-10 pr-4 text-sm text-white placeholder-neutral-600 focus:border-amber-500/50 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  />
                </div>
              </div>

              <motion.button
                onClick={handleInfoNext}
                whileTap={{ scale: 0.97 }}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 py-3.5 text-sm font-black text-black shadow-lg shadow-amber-500/20 transition-all hover:brightness-110"
              >
                전문 분야 선택
                <ChevronRight className="h-4 w-4" />
              </motion.button>

              {onSkip && (
                <button
                  onClick={onSkip}
                  className="w-full py-2 text-center text-sm text-neutral-600 hover:text-neutral-400 transition-colors"
                >
                  나중에 하기
                </button>
              )}
            </div>

            {/* Privacy note */}
            <div className="mt-6 flex items-start gap-2 rounded-xl border border-neutral-800 bg-neutral-900/50 p-3">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-600" />
              <p className="text-[11px] leading-relaxed text-neutral-600">
                입력하신 정보는 프로필 생성에만 사용되며, 제3자에게 제공되지 않습니다.
              </p>
            </div>
          </motion.div>
        )}

        {/* Phase: specialty */}
        {phase === 'specialty' && (
          <motion.div
            key="specialty"
            className="w-full max-w-sm"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            <div className="mb-6 text-center">
              <h2 className="text-xl font-black text-white">전문 분야를 선택해요</h2>
              <p className="mt-1.5 text-sm text-neutral-400">탭 한 번으로 선택됩니다</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {SPECIALTIES.map((s) => (
                <motion.button
                  key={s}
                  onClick={() => handleSpecialtySelect(s)}
                  whileTap={{ scale: 0.95 }}
                  className={`rounded-xl border p-4 text-left transition-all ${
                    selectedSpecialty === s
                      ? 'border-amber-500/60 bg-amber-500/10 text-amber-400'
                      : 'border-neutral-700 bg-neutral-900 text-neutral-300 hover:border-neutral-600'
                  }`}
                >
                  <span className="text-sm font-semibold">{SPECIALTY_LABELS[s]}</span>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}

        {/* Phase: region */}
        {phase === 'region' && (
          <motion.div
            key="region"
            className="w-full max-w-sm"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            <div className="mb-6 text-center">
              <h2 className="text-xl font-black text-white">주 활동 권역은요?</h2>
              <p className="mt-1.5 text-sm text-neutral-400">선택하면 바로 명함이 완성됩니다</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {REGIONS.map((r) => (
                <motion.button
                  key={r}
                  onClick={() => handleRegionSelect(r)}
                  whileTap={{ scale: 0.95 }}
                  className={`rounded-xl border p-4 text-left transition-all ${
                    selectedRegion === r
                      ? 'border-amber-500/60 bg-amber-500/10 text-amber-400'
                      : 'border-neutral-700 bg-neutral-900 text-neutral-300 hover:border-neutral-600'
                  }`}
                >
                  <MapPin className="mb-1.5 h-4 w-4 opacity-60" />
                  <span className="text-sm font-semibold">{REGION_LABELS[r]}</span>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}

        {/* Phase: submitting */}
        {phase === 'submitting' && (
          <motion.div
            key="submitting"
            className="flex flex-col items-center gap-4"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
          >
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-neutral-700 border-t-amber-400" />
            <p className="text-sm text-neutral-400">명함을 완성하는 중...</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
