"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";

interface BrokerDashboardTabsProps {
  overviewContent: React.ReactNode;
  antifragileContent: React.ReactNode;
  weeklyReportContent: React.ReactNode;
  morningIntelligenceContent: React.ReactNode;
}

export default function BrokerDashboardTabs({
  overviewContent,
  antifragileContent,
  weeklyReportContent,
  morningIntelligenceContent,
}: BrokerDashboardTabsProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "intelligence" | "antifragile" | "reports">("overview");

  const tabs = [
    { id: "overview", label: "오늘의 현황" },
    { id: "intelligence", label: "🌅 모닝 정보" },
    { id: "antifragile", label: "🛡️ 안티프래질" },
    { id: "reports", label: "📊 리포트" },
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
            {activeTab === "overview" && overviewContent}
            {activeTab === "intelligence" && morningIntelligenceContent}
            {activeTab === "antifragile" && antifragileContent}
            {activeTab === "reports" && weeklyReportContent}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
