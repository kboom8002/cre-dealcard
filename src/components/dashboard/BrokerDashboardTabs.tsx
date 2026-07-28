"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";

interface BrokerDashboardTabsProps {
  actionQueueContent?: React.ReactNode;
  overviewContent: React.ReactNode;
  breakthroughContent: React.ReactNode;
  weeklyReportContent: React.ReactNode;
  morningIntelligenceContent: React.ReactNode;
}

export default function BrokerDashboardTabs({
  actionQueueContent,
  overviewContent,
  breakthroughContent,
  weeklyReportContent,
  morningIntelligenceContent,
}: BrokerDashboardTabsProps) {
  const [activeTab, setActiveTab] = useState<"actionQueue" | "overview" | "intelligence">("actionQueue");

  const tabs = [
    { id: "actionQueue", label: "⚡ 지금 처리" },
    { id: "overview", label: "📊 현황" },
    { id: "intelligence", label: "📈 인텔리전스" },
  ] as const;

  return (
    <div className="w-full space-y-4">
      {/* Tab Navigation Row */}
      <div className="flex border-b border-border bg-card/45 backdrop-blur-md rounded-xl p-1 w-full justify-between items-center relative overflow-hidden">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex-1 text-center py-2 text-xs font-bold transition-colors duration-300 cursor-pointer ${
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="activeTabUnderline"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Panel Content with smooth AnimatePresence transition */}
      <div className="w-full min-h-[400px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="w-full"
          >
            {activeTab === "actionQueue" && actionQueueContent}
            {activeTab === "overview" && overviewContent}
            {activeTab === "intelligence" && (
              <div className="space-y-6">
                {morningIntelligenceContent}
                {breakthroughContent}
                {weeklyReportContent}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
