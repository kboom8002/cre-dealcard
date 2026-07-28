'use client';

import React from 'react';

interface StageCount {
  stage: string;
  label: string;
  count: number;
  stagnant: number;
}

interface PipelineSnapshotProps {
  stages: StageCount[];
}

const STAGE_COLORS: Record<string, string> = {
  memo_input: 'bg-neutral-600',
  deal_card_created: 'bg-blue-500',
  gate_requested: 'bg-purple-500',
  im_created: 'bg-emerald-500',
  buyer_meeting: 'bg-amber-500',
  loi: 'bg-orange-500',
  contract: 'bg-red-500',
  closed: 'bg-primary',
};

export function PipelineSnapshot({ stages }: PipelineSnapshotProps) {
  const total = stages.reduce((acc, s) => acc + s.count, 0);
  const totalStagnant = stages.reduce((acc, s) => acc + s.stagnant, 0);

  return (
    <div className="bg-neutral-900/40 border border-neutral-800/50 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <span>📈</span> 파이프라인 ({total}건)
        </h3>
        {totalStagnant > 0 && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-300">
            🔴 {totalStagnant}건 정체
          </span>
        )}
      </div>

      {/* Progress Bar */}
      <div className="flex h-2 rounded-full overflow-hidden bg-neutral-800 mb-3">
        {stages.filter(s => s.count > 0).map(stage => (
          <div
            key={stage.stage}
            className={`${STAGE_COLORS[stage.stage] || 'bg-neutral-600'} transition-all`}
            style={{ width: `${(stage.count / Math.max(total, 1)) * 100}%` }}
          />
        ))}
      </div>

      {/* Stage Labels */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {stages.map(stage => (
          <div key={stage.stage} className="flex items-center gap-1.5 text-xs">
            <span className={`w-2 h-2 rounded-full ${STAGE_COLORS[stage.stage] || 'bg-neutral-600'}`} />
            <span className="text-neutral-400">{stage.label}</span>
            <span className="font-bold text-white">{stage.count}</span>
            {stage.stagnant > 0 && (
              <span className="text-[10px] text-red-400">(🔴{stage.stagnant})</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
