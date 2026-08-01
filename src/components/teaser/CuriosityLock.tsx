import React from 'react';

interface CuriosityLockProps {
  curiositySlot: string;
  candidateCount?: number;
  passed?: boolean;
}

export function CuriosityLock({ curiositySlot, candidateCount, passed }: CuriosityLockProps) {
  if (passed) return null;

  return (
    <div className="bg-[#141A21]/50 border border-dashed border-slate-700 rounded-xl p-5 text-center space-y-2">
      <div className="text-2xl mb-2">🔒</div>
      <p className="text-xs text-slate-300 font-medium">
        {curiositySlot}
      </p>
      {candidateCount && (
        <p className="text-[11px] text-slate-500">
          후보 필지 {candidateCount}개 — 재식별 게이트 통과
        </p>
      )}
    </div>
  );
}
