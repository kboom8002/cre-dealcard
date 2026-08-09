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
    buyers: buyersContent,
    analytics: analyticsContent,
  };

  return (
    <div className="space-y-4" id="deal-card-tabs-container">
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
              {tab.key === 'buyers' && buyersBadge && buyersBadge.count > 0 && (
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                  buyersBadge.topGrade === 'S' 
                    ? 'bg-purple-600 text-white shadow-sm shadow-purple-500/50' 
                    : buyersBadge.topGrade === 'A'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-muted text-muted-foreground'
                }`}>
                  {buyersBadge.topGrade ? `${buyersBadge.topGrade}·${buyersBadge.count}` : buyersBadge.count}
                </span>
              )}
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
