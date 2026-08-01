import React from 'react';
import { ArchetypeBadge } from '@/components/badges/ArchetypeBadge';

interface TeaserHeroHeaderProps {
  archetype?: string;
  dataGrade?: string;
  regionLabel: string;
  bandedPrice: string;
  bandedCapRate: string;
  bandedArea: string;
  vacancyLabel?: string;
  hookCopy?: string;
}

export function TeaserHeroHeader({
  archetype,
  dataGrade,
  regionLabel,
  bandedPrice,
  bandedCapRate,
  bandedArea,
  vacancyLabel,
  hookCopy
}: TeaserHeroHeaderProps) {
  return (
    <div className="bg-[#141A21] border border-[#252E39] rounded-2xl overflow-hidden text-slate-100 p-5 space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {archetype && <ArchetypeBadge archetype={archetype} size="md" />}
        <span className="text-xs font-semibold px-2 py-1 bg-slate-800 rounded-md">
          {regionLabel}
        </span>
        {dataGrade && (
          <span className="text-xs font-bold text-amber-400 bg-amber-400/10 px-2 py-1 rounded-md">
            [{dataGrade}등급]
          </span>
        )}
      </div>

      {hookCopy && (
        <h1 className="text-lg font-bold text-white leading-snug">
          {hookCopy}
        </h1>
      )}

      <div className="grid grid-cols-2 gap-4 border-t border-[#252E39] pt-4">
        <div>
          <div className="text-[11px] text-slate-400 mb-1">💰 매각가</div>
          <div className="text-base font-bold text-emerald-400">{bandedPrice}</div>
        </div>
        <div>
          <div className="text-[11px] text-slate-400 mb-1">📊 예상 수익률</div>
          <div className="text-base font-bold">{bandedCapRate}</div>
        </div>
        <div>
          <div className="text-[11px] text-slate-400 mb-1">📐 규모</div>
          <div className="text-sm font-medium">{bandedArea}</div>
        </div>
        <div>
          <div className="text-[11px] text-slate-400 mb-1">🏠 명도/공실</div>
          <div className="text-sm font-medium">{vacancyLabel || '정보 없음'}</div>
        </div>
      </div>
    </div>
  );
}
