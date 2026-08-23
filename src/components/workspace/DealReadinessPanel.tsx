'use client';

import React from 'react';
import {
  calculate7AxisReadiness,
  DealReadinessInput,
  DealReadinessReport,
  ReadinessState,
} from '@/domain/workspace/deal-readiness-7axis';

interface DealReadinessPanelProps {
  input?: DealReadinessInput;
  report?: DealReadinessReport;
  dataGrade?: 'A' | 'B' | 'C' | 'D'; // 자료등급 (A~D) - 분리 표기
  onActionClick?: (axisKey: string) => void;
}

const STATE_BADGE_STYLE: Record<ReadinessState, { bg: string; text: string; border: string; icon: string }> = {
  준비완료: {
    bg: 'bg-emerald-950/60',
    text: 'text-emerald-400',
    border: 'border-emerald-700/60',
    icon: '🟢',
  },
  보완필요: {
    bg: 'bg-amber-950/60',
    text: 'text-amber-400',
    border: 'border-amber-700/60',
    icon: '🟡',
  },
  위험: {
    bg: 'bg-rose-950/60',
    text: 'text-rose-400',
    border: 'border-rose-700/60',
    icon: '🔴',
  },
  정체: {
    bg: 'bg-neutral-900',
    text: 'text-neutral-400',
    border: 'border-neutral-700',
    icon: '⚪',
  },
};

export function DealReadinessPanel({
  input,
  report: externalReport,
  dataGrade = 'B',
  onActionClick,
}: DealReadinessPanelProps) {
  const report = externalReport ?? calculate7AxisReadiness(input ?? {});
  const badge = STATE_BADGE_STYLE[report.state];

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 text-neutral-100 shadow-xl">
      {/* ── 1. 헤더: 자료등급 vs 딜 준비도 분리 ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-neutral-800">
        <div>
          <h2 className="text-lg font-bold text-neutral-100 flex items-center gap-2">
            📊 딜 성사 준비도 (7축 분석)
          </h2>
          <p className="text-xs text-neutral-400 mt-1">{report.summary}</p>
        </div>

        <div className="flex items-center gap-3">
          {/* 자료등급 (A~D) - IM 발행 가능성 */}
          <div className="px-3 py-1.5 rounded-lg bg-neutral-800 border border-neutral-700 text-center">
            <span className="text-[11px] text-neutral-400 block leading-tight">자료 등급</span>
            <span className="text-sm font-extrabold text-sky-400 leading-tight">
              {dataGrade}등급
            </span>
          </div>

          {/* 딜 준비도 (상태어) - 거래 성사 가능성 */}
          <div
            className={`px-3.5 py-1.5 rounded-lg border ${badge.bg} ${badge.border} text-center flex items-center gap-2`}
          >
            <div>
              <span className="text-[11px] text-neutral-400 block leading-tight">딜 준비도</span>
              <span className={`text-sm font-extrabold ${badge.text} leading-tight`}>
                {badge.icon} {report.state} ({report.totalScore}점)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── 2. 7축 점수 바 그리드 ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-6">
        {report.axes.map((axis) => {
          const pct = Math.round((axis.score / axis.maxScore) * 100);
          const barColor =
            axis.status === 'good'
              ? 'bg-emerald-500'
              : axis.status === 'warn'
              ? 'bg-amber-500'
              : 'bg-rose-500';

          return (
            <div
              key={axis.key}
              className="p-3.5 bg-neutral-950/60 rounded-xl border border-neutral-800/80 hover:border-neutral-700 transition-colors"
            >
              <div className="flex justify-between items-center mb-1.5 text-xs">
                <span className="font-semibold text-neutral-200">{axis.label}</span>
                <span className="font-mono text-neutral-400">
                  <span className="text-neutral-100 font-bold">{axis.score}</span> / {axis.maxScore}점
                </span>
              </div>

              {/* 게이지 바 */}
              <div className="w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden mb-2">
                <div
                  className={`h-full ${barColor} transition-all duration-300 rounded-full`}
                  style={{ width: `${pct}%` }}
                />
              </div>

              <p className="text-[11px] text-neutral-400 line-clamp-1">{axis.reasoning}</p>
            </div>
          );
        })}
      </div>

      {/* ── 3. Next Best Actions (점수 상승 추천 액션 3가지) ── */}
      {report.nextBestActions.length > 0 && (
        <div className="mt-5 pt-5 border-t border-neutral-800">
          <h3 className="text-xs font-bold text-neutral-300 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            ⚡ 점수 상승 최우선 추천 행동 (Top 3)
          </h3>

          <div className="space-y-2.5">
            {report.nextBestActions.map((action, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-3 bg-neutral-950/80 border border-neutral-800 rounded-xl hover:border-amber-500/50 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-amber-500/10 text-amber-400 text-xs font-bold shrink-0 mt-0.5">
                    {idx + 1}
                  </span>
                  <div>
                    <div className="text-xs font-bold text-neutral-200">{action.title}</div>
                    <div className="text-[11px] text-neutral-400 mt-0.5">{action.description}</div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 ml-3">
                  <span className="text-xs font-semibold text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/40">
                    +{action.potentialPointGain}점
                  </span>
                  {onActionClick && (
                    <button
                      onClick={() => onActionClick(action.axisKey)}
                      className="text-xs px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg transition-colors"
                    >
                      실행
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
