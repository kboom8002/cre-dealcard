import React from 'react';
import { ArchetypeBadge } from '@/components/badges/ArchetypeBadge';

interface TeaserHeroHeaderProps {
  archetype?: string;
  regionLabel: string;
  hookCopy?: string;
  posture?: string;
  postureLabel?: string;
  postureHeroTiles?: Array<{ emoji: string; label: string; value: string }>;
  bandedPrice?: string;
  bandedCapRate?: string;
  bandedArea?: string;
  vacancyLabel?: string;
  dataGrade?: string;
}

export function TeaserHeroHeader({
  archetype,
  regionLabel,
  hookCopy,
  posture,
  postureLabel,
  postureHeroTiles
}: TeaserHeroHeaderProps) {
  return (
    <div className="bg-[#1A2333] border border-[#252E39] rounded-2xl overflow-hidden text-slate-100 p-5 space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {postureLabel && (
          <span className="text-xs font-bold text-slate-900 px-2 py-1 rounded-md" style={{ backgroundColor: '#C4B5FD' }}>
            {postureLabel}
          </span>
        )}
        {archetype && <ArchetypeBadge archetype={archetype} size="md" />}
        <span className="text-xs font-semibold px-2 py-1 bg-slate-800 rounded-md">
          {regionLabel}
        </span>
      </div>

      {hookCopy && (
        <h1 className="text-[19px] font-[700] text-white leading-snug">
          {hookCopy}
        </h1>
      )}

      {postureHeroTiles && postureHeroTiles.length > 0 && (
        <div className="grid grid-cols-2 gap-4 border-t border-[#252E39] pt-4">
          {postureHeroTiles.map((tile, i) => (
            <div key={i}>
              <div className="text-[11px] text-slate-400 mb-1">{tile.emoji} {tile.label}</div>
              <div className={`text-sm font-medium ${i === 0 ? 'text-[#4ADE80] text-base font-bold' : ''}`}>{tile.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

