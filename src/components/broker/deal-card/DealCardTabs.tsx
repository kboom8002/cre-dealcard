'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';

type TabKey = 'overview' | 'im' | 'buyers' | 'analytics';

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'overview', label: '개요', icon: '🏠' },
  { key: 'im', label: 'IM', icon: '📱' },
  { key: 'buyers', label: '매수자', icon: '🎯' },
  { key: 'analytics', label: '분석', icon: '📊' },
];

interface DealCardTabsProps {
  overviewContent: React.ReactNode;
  imContent: React.ReactNode;
  buyersContent: React.ReactNode;
  analyticsContent: React.ReactNode;
}

export function DealCardTabs({
  overviewContent,
  imContent,
  buyersContent,
  analyticsContent,
}: DealCardTabsProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  const contentMap: Record<TabKey, React.ReactNode> = {
    overview: overviewContent,
    im: imContent,
    buyers: buyersContent,
    analytics: analyticsContent,
  };

  return (
    <div className="space-y-4">
      <div className="flex border-b border-border sticky top-0 z-20 bg-background/95 backdrop-blur-md">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-3 text-center text-xs sm:text-sm font-bold relative transition-colors ${
              activeTab === tab.key ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="flex items-center justify-center gap-1.5">
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </span>
            {activeTab === tab.key && (
              <motion.div
                layoutId="deal-tab-indicator"
                className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-full"
              />
            )}
          </button>
        ))}
      </div>
      <div className="animate-fadeIn">{contentMap[activeTab]}</div>
    </div>
  );
}
