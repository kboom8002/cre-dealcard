'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { SOTA_SPRING } from '@/components/motion/sota-motion';

type TabKey = 'overview' | 'im' | 'buyers' | 'analytics';

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'overview', label: '딜카드 개요', icon: '🏠' },
  { key: 'im', label: '투자설명서 (IM)', icon: '📊' },
  /* DORMANT: ux60-focus — 복원 시 docs/rollback/2026-10-18-dormant-features.md 참조
  { key: 'buyers', label: '매수자', icon: '🎯' },
  { key: 'analytics', label: '분석', icon: '📊' },
  */
];

interface DealCardTabsProps {
  overviewContent: React.ReactNode;
  imContent: React.ReactNode;
  buyersContent?: React.ReactNode;
  analyticsContent?: React.ReactNode;
  buyersBadge?: { count: number; topGrade?: string };
}

export function DealCardTabs({
  overviewContent,
  imContent,
  buyersContent,
  analyticsContent,
  buyersBadge,
}: DealCardTabsProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  React.useEffect(() => {
    const handleSwitchTab = (e: Event) => {
      const customEvent = e as CustomEvent<TabKey>;
      if (customEvent.detail && ['overview', 'im', 'buyers', 'analytics'].includes(customEvent.detail)) {
        setActiveTab(customEvent.detail);
      }
    };
    window.addEventListener('switch-deal-tab', handleSwitchTab);
    return () => window.removeEventListener('switch-deal-tab', handleSwitchTab);
  }, []);

  const contentMap: Record<TabKey, React.ReactNode> = {
    overview: overviewContent,
    im: imContent,
    buyers: buyersContent ?? null,
    analytics: analyticsContent ?? null,
  };

  return (
    <div className="space-y-4" id="deal-card-tabs-container">
      <div className="grid grid-cols-2 gap-1.5 rounded-2xl border border-border bg-secondary/70 p-1.5 sticky top-14 z-20 backdrop-blur-md shadow-xs">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`relative py-3 px-4 rounded-xl text-center text-[15px] font-extrabold transition-colors ${
                isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="deal-tab-indicator"
                  transition={SOTA_SPRING}
                  className="absolute inset-0 rounded-xl bg-card border border-primary/30 shadow-sm"
                />
              )}
              <span className="relative z-10 flex items-center justify-center gap-1.5">
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
                {tab.key === 'buyers' && buyersBadge && buyersBadge.count > 0 && (
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[11px] font-extrabold ${
                    buyersBadge.topGrade === 'S'
                      ? 'bg-grade-s text-white shadow-sm shadow-purple-500/40'
                      : buyersBadge.topGrade === 'A'
                      ? 'bg-grade-a text-white shadow-sm'
                      : 'bg-muted text-muted-foreground'
                  }`}>
                    {buyersBadge.topGrade ? `${buyersBadge.topGrade}·${buyersBadge.count}` : buyersBadge.count}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={SOTA_SPRING}
        >
          {contentMap[activeTab]}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

