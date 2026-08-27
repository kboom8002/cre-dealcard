"use client";

import React from "react";
import type { ActionCard, Scenario, ScenarioType } from "@/domain/building/im-core";

/**
 * D37 M-3: ActionCard 3시나리오 렌더링 컴포넌트
 *
 * Base/Upside/Downside 시나리오를 시각적 카드로 표시합니다.
 * 07 §7.5 Value-add 시나리오 시각화.
 */

const SCENARIO_CONFIG: Record<ScenarioType, { label: string; color: string; border: string; icon: string }> = {
  base:     { label: '기본(Base)',     color: 'text-blue-400',    border: 'border-blue-500/30',    icon: '📊' },
  upside:   { label: '상향(Upside)',   color: 'text-emerald-400', border: 'border-emerald-500/30', icon: '📈' },
  downside: { label: '하향(Downside)', color: 'text-red-400',     border: 'border-red-500/30',     icon: '📉' },
};

function formatKrw(value: number): string {
  if (value >= 1_0000_0000) return `${(value / 1_0000_0000).toFixed(1)}억`;
  if (value >= 1_0000) return `${(value / 1_0000).toFixed(0)}만`;
  return value.toLocaleString();
}

function ScenarioCard({ scenario }: { scenario: Scenario }) {
  const cfg = SCENARIO_CONFIG[scenario.type] ?? SCENARIO_CONFIG.base;

  return (
    <div className={`bg-neutral-900/60 border ${cfg.border} rounded-xl p-4 space-y-3`}>
      <div className="flex items-center gap-2">
        <span>{cfg.icon}</span>
        <h4 className={`text-sm font-bold ${cfg.color}`}>{cfg.label}</h4>
      </div>
      <p className="text-xs text-neutral-300 font-medium">{scenario.title}</p>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-neutral-800/50 rounded-lg p-2">
          <span className="text-neutral-500 block">월 임대료</span>
          <span className="text-neutral-200 font-bold">{formatKrw(scenario.stabilizedMonthlyRent)}</span>
        </div>
        <div className="bg-neutral-800/50 rounded-lg p-2">
          <span className="text-neutral-500 block">연 NOI</span>
          <span className="text-neutral-200 font-bold">{formatKrw(scenario.stabilizedNOI)}</span>
        </div>
        <div className="bg-neutral-800/50 rounded-lg p-2">
          <span className="text-neutral-500 block">Cap Rate</span>
          <span className={`font-bold ${cfg.color}`}>{scenario.stabilizedCapRate.toFixed(1)}%</span>
        </div>
        <div className="bg-neutral-800/50 rounded-lg p-2">
          <span className="text-neutral-500 block">총 수익률</span>
          <span className={`font-bold ${cfg.color}`}>{scenario.totalReturn.toFixed(1)}%</span>
        </div>
      </div>

      <div className="bg-neutral-800/30 rounded-lg p-2 text-center">
        <span className="text-neutral-500 text-[10px] block">예상 가치</span>
        <span className={`text-base font-black ${cfg.color}`}>{formatKrw(scenario.estimatedValue)}</span>
      </div>

      {scenario.actions.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">실행 항목</span>
          {scenario.actions.map((action, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <span className="text-neutral-600 mt-0.5">•</span>
              <div className="flex-1">
                <span className="text-neutral-300">{action.description}</span>
                {action.estimatedCostKrw && (
                  <span className="text-neutral-500 ml-1">({formatKrw(action.estimatedCostKrw)})</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export interface ActionCardViewProps {
  actionCard: ActionCard;
}

export function ActionCardView({ actionCard }: ActionCardViewProps) {
  const sorted = [...actionCard.scenarios].sort((a, b) => {
    const order: Record<ScenarioType, number> = { downside: 0, base: 1, upside: 2 };
    return (order[a.type] ?? 1) - (order[b.type] ?? 1);
  });

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          🎯 Value-Add 시나리오
          {actionCard.involvesTenantRelocation && (
            <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded-full">
              임차인 이전 포함
            </span>
          )}
        </h3>
        <p className="text-xs text-neutral-400 mt-1">{actionCard.currentStateSummary}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {sorted.map((scenario) => (
          <ScenarioCard key={scenario.type} scenario={scenario} />
        ))}
      </div>
    </div>
  );
}
