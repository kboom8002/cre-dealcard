'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { OnboardingProvider, useOnboarding } from '@/lib/onboarding/onboarding-state';
import { trackOnboardingEvent } from '@/lib/onboarding/onboarding-tracker';
import type { VibeAnalysisResult } from '@/lib/onboarding/onboarding-types';

import { OnboardingProgress } from './OnboardingProgress';
import { StageRoleSelect } from './StageRoleSelect';
import { StagePhotoUpload } from './StagePhotoUpload';
import { StageAnalysis } from './StageAnalysis';
import { StageReveal } from './StageReveal';
import { StageLogin } from './StageLogin';
import { StageRadar } from './StageRadar';
import { StageDealCard } from './StageDealCard';
import { StageAgora } from './StageAgora';
import { StageComplete } from './StageComplete';

// ── Inner orchestrator (needs context) ────────────────────────────────────────

function OrchestratorInner() {
  const {
    state,
    setStage,
    setRole,
    setPhotoFile,
    setVibeResult,
    setSessionToken,
  } = useOnboarding();

  const { stage, data } = state;

  // Track if Gemini API call has returned
  const [isApiComplete, setIsApiComplete] = useState(false);
  const apiCalledRef = useRef(false);

  // ── Reset persisted state if user lands on onboarding fresh ──────────────
  // If stage is 'complete', reset to start a new flow
  useEffect(() => {
    if (stage === 'complete') {
      // Already completed — stay on complete page until redirect
    }
    // Track start
    void trackOnboardingEvent('onboard_start', data.sessionToken);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Photo uploaded: kick off Gemini API call immediately ─────────────────
  useEffect(() => {
    if (stage !== 'analyzing' || !data.photoPreviewUrl || apiCalledRef.current) return;
    apiCalledRef.current = true;

    void (async () => {
      try {
        // If we have a File, upload and analyze
        if (data.photoFile) {
          const formData = new FormData();
          formData.append('photo', data.photoFile);

          await trackOnboardingEvent('onboard_analysis_start', data.sessionToken);

          const res = await fetch('/api/onboarding/analyze-photo', {
            method: 'POST',
            body: formData,
          });

          if (res.ok) {
            const json = await res.json() as {
              ok: boolean;
              data: {
                session_token: string;
                photo_url: string;
                vibe_vector: VibeAnalysisResult['photoVibe'];
                complement: VibeAnalysisResult['complementVibe'];
                vti: {
                  type: string;
                  label_ko: string;
                  label_en: string;
                  emoji: string;
                  color: string;
                  confidence: number;
                };
                template: { id: string };
                before_scores: { trust: number; valence: number };
                after_scores: { trust: number; valence: number; coherence: number; vad: { valence: number; arousal: number; dominance: number } };
                description: string;
              };
            };

            if (json.ok && json.data) {
              const d = json.data;
              setSessionToken(d.session_token);

              const vibeResult: VibeAnalysisResult = {
                photoVibe: d.vibe_vector,
                complementVibe: d.complement,
                vtiResult: {
                  meta: {
                    type: d.vti.type as VibeAnalysisResult['vtiResult']['meta']['type'],
                    label_ko: d.vti.label_ko,
                    label_en: d.vti.label_en,
                    emoji: d.vti.emoji,
                    color: d.vti.color,
                    description: '',
                  },
                  confidence: d.vti.confidence,
                },
                matchedTemplateId: d.template.id,
                beforeScores: d.before_scores,
                afterScores: d.after_scores,
                description: d.description,
              };

              setVibeResult(vibeResult);
              await trackOnboardingEvent('onboard_analysis_done', d.session_token);
            }
          } else {
            // API failed — use mock vibe result
            setVibeResult(getMockVibeResult());
          }
        } else {
          // No file (resumed session) — use mock or existing
          if (!data.vibeResult) {
            setVibeResult(getMockVibeResult());
          }
        }
      } catch {
        // Fallback to mock
        setVibeResult(getMockVibeResult());
      } finally {
        setIsApiComplete(true);
      }
    })();
  }, [stage, data.photoPreviewUrl, data.photoFile, data.sessionToken, data.vibeResult, setVibeResult, setSessionToken]);

  // ── Stage-specific radar address for deal card pre-fill ───────────────────
  const [radarBuildingAddress, setRadarBuildingAddress] = useState<string | undefined>();

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleRoleSelect = useCallback((role: 'expert' | 'owner') => {
    setRole(role);
    void trackOnboardingEvent('onboard_role_select', data.sessionToken, { role });
    setStage('photo_upload');
  }, [setRole, setStage, data.sessionToken]);

  const handlePhotoSelected = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    setPhotoFile(file, url);
    void trackOnboardingEvent('onboard_photo_upload', data.sessionToken);
    // Reset api flag for new photo
    apiCalledRef.current = false;
    setIsApiComplete(false);
    setStage('analyzing');
  }, [setPhotoFile, setStage, data.sessionToken]);

  const handleAnalysisDone = useCallback(() => {
    setStage('reveal');
  }, [setStage]);

  const handleRevealContinue = useCallback(() => {
    void trackOnboardingEvent('onboard_reveal_view', data.sessionToken);
    setStage('login');
  }, [setStage, data.sessionToken]);

  const handleShareBeforeLogin = useCallback(() => {
    void trackOnboardingEvent('onboard_share_pre_login', data.sessionToken);
    const vibeResult = data.vibeResult;
    if (!vibeResult) return;
    const shareText = `🏢 DealCard Vibe 분석\n${vibeResult.vtiResult.meta.label_ko} 타입\nTrust ${Math.round(vibeResult.afterScores.trust * 100)}\n\n나도 해보기 → credeal.net/onboarding`;
    if (navigator.share) {
      void navigator.share({ text: shareText, url: 'https://credeal.net/onboarding' }).catch(() => {});
    } else {
      void navigator.clipboard.writeText(shareText).catch(() => {});
    }
  }, [data.sessionToken, data.vibeResult]);

  const handleLoginComplete = useCallback(() => {
    void trackOnboardingEvent('onboard_login_done', data.sessionToken);
    // 빌딩분석(radar)/딜카드(dealcard) 단계를 건너뛰고 바로 완료로 이동
    setStage('complete');
  }, [setStage, data.sessionToken]);

  const handleRadarContinue = useCallback((address: string) => {
    setRadarBuildingAddress(address);
    setStage(data.role === 'owner' ? 'agora' : 'dealcard');
  }, [setStage, data.role]);

  const handleRadarSkip = useCallback(() => {
    setStage(data.role === 'owner' ? 'agora' : 'dealcard');
  }, [setStage, data.role]);

  const handleDealCardComplete = useCallback(() => {
    void trackOnboardingEvent('onboard_dealcard_done', data.sessionToken);
    setStage('complete');
  }, [setStage, data.sessionToken]);

  const handleAgoraComplete = useCallback(() => {
    setStage('complete');
  }, [setStage]);

  const handleGoToDashboard = useCallback(() => {
    // Router push handled inside StageComplete
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="relative min-h-dvh overflow-hidden bg-neutral-950">
      {/* Fixed progress bar */}
      <OnboardingProgress currentStage={stage} role={data.role} />

      {/* Stage content */}
      <AnimatePresence mode="wait">
        {stage === 'role_select' && (
          <PageWrapper key="role_select">
            <StageRoleSelect onSelect={handleRoleSelect} />
          </PageWrapper>
        )}

        {stage === 'photo_upload' && (
          <PageWrapper key="photo_upload">
            <StagePhotoUpload onPhotoSelected={handlePhotoSelected} />
          </PageWrapper>
        )}

        {stage === 'analyzing' && data.photoPreviewUrl && (
          <PageWrapper key="analyzing">
            <StageAnalysis
              photoPreviewUrl={data.photoPreviewUrl}
              onAnalysisDone={handleAnalysisDone}
              isApiComplete={isApiComplete}
            />
          </PageWrapper>
        )}

        {stage === 'reveal' && data.vibeResult && data.photoPreviewUrl && (
          <PageWrapper key="reveal">
            <StageReveal
              vibeResult={data.vibeResult}
              photoUrl={data.photoPreviewUrl}
              onContinue={handleRevealContinue}
              onShareBeforeLogin={handleShareBeforeLogin}
            />
          </PageWrapper>
        )}

        {/* If somehow we're at reveal but missing vibe result, go to login */}
        {stage === 'reveal' && !data.vibeResult && (
          <PageWrapper key="reveal_fallback">
            <StageLogin onComplete={handleLoginComplete} onSkip={handleLoginComplete} />
          </PageWrapper>
        )}

        {stage === 'login' && (
          <PageWrapper key="login">
            <StageLogin onComplete={handleLoginComplete} onSkip={handleLoginComplete} />
          </PageWrapper>
        )}

        {stage === 'profile_complete' && (
          <PageWrapper key="profile_complete">
            <StageLogin onComplete={handleLoginComplete} onSkip={handleLoginComplete} />
          </PageWrapper>
        )}

        {stage === 'radar' && (
          <PageWrapper key="radar">
            <StageRadar
              onContinue={handleRadarContinue}
              onSkip={handleRadarSkip}
            />
          </PageWrapper>
        )}

        {stage === 'dealcard' && (
          <PageWrapper key="dealcard">
            <StageDealCard
              prefillAddress={radarBuildingAddress}
              onComplete={handleDealCardComplete}
              onSkip={handleDealCardComplete}
            />
          </PageWrapper>
        )}

        {stage === 'agora' && (
          <PageWrapper key="agora">
            <StageAgora
              onComplete={handleAgoraComplete}
              onSkip={handleAgoraComplete}
            />
          </PageWrapper>
        )}

        {stage === 'complete' && (
          <PageWrapper key="complete">
            <StageComplete onGoToDashboard={handleGoToDashboard} />
          </PageWrapper>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Page transition wrapper ────────────────────────────────────────────────────

function PageWrapper({ children, key: _key }: { children: React.ReactNode; key: string }) {
  return (
    <motion.div
      className="min-h-dvh"
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
    >
      {children}
    </motion.div>
  );
}

// ── Mock vibe result for fallback ─────────────────────────────────────────────

function getMockVibeResult(): VibeAnalysisResult {
  return {
    photoVibe: {
      warmth: 0.72,
      energy: 0.35,
      polish: 0.76,
      authentic: 0.88,
      heritage: 0.81,
      futuristic: 0.28,
      playful: 0.45,
    },
    complementVibe: {
      warmth: 0.55,
      energy: 0.75,
      polish: 0.60,
      authentic: 0.55,
      heritage: 0.50,
      futuristic: 0.85,
      playful: 0.60,
    },
    vtiResult: {
      meta: {
        type: 'Heritage-Trust',
        label_ko: '전통 신뢰',
        label_en: 'Heritage Trust',
        emoji: '🏛️',
        color: '#d4a28a',
        description: '오랜 경험에서 우러나는 깊은 신뢰',
      },
      confidence: 0.87,
    },
    matchedTemplateId: 'HT-01',
    beforeScores: { trust: 0.47, valence: 0.38 },
    afterScores: {
      trust: 0.82,
      valence: 0.71,
      coherence: 0.68,
      vad: { valence: 0.71, arousal: 0.35, dominance: 0.68 },
    },
    description:
      '따뜻하고 신뢰감 있는 인상에 전통적 전문성이 돋보입니다. 활력과 혁신성을 보강하면 더욱 균형 잡힌 프로필이 됩니다.',
  };
}

// ── Public export (with Provider) ─────────────────────────────────────────────

export function OnboardingOrchestrator() {
  return (
    <OnboardingProvider>
      <OrchestratorInner />
    </OnboardingProvider>
  );
}
