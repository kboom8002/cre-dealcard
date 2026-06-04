import { OnboardingOrchestrator } from '@/components/onboarding/OnboardingOrchestrator';

/**
 * /onboarding — Shock & Awe 온보딩 v2
 *
 * Server component wrapper — the actual interactive logic lives inside
 * OnboardingOrchestrator which is 'use client'.
 */
export default function OnboardingPage() {
  return <OnboardingOrchestrator />;
}

export const metadata = {
  title: '내 Vibe 명함 만들기 | DealCard',
  description: '사진 한 장으로 AI가 분석하는 나만의 부동산 전문가 프로필을 만들어보세요.',
};
