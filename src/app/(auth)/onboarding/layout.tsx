import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'JS 딜카드 — 내 바이브 찾기',
  description: '나만의 CRE 바이브 카드를 만들어보세요.',
};

/**
 * Onboarding layout — full-screen, no navbar, no sidebar.
 * Wraps the entire onboarding flow in a dark neutral shell.
 */
export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-neutral-950 text-white">
      {children}
    </div>
  );
}
