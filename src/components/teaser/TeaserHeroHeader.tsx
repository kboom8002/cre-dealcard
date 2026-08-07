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
  urgencyTag?: 'urgent' | 'reviewing' | 'flexible';
}

export function TeaserHeroHeader({
  archetype,
  regionLabel,
  hookCopy,
  posture = 'income',
  postureLabel,
  postureHeroTiles,
  urgencyTag
}: TeaserHeroHeaderProps) {
  // Posture별 프리미엄 추상 그라데이션 배경 테마
  const getGradientStyle = () => {
    switch (posture) {
      case 'development':
        return 'from-[#0B1E19] via-[#122E26] to-[#1A2333] border-emerald-500/20';
      case 'owner_occupied':
        return 'from-[#1C182A] via-[#2A1F3D] to-[#1A2333] border-purple-500/20';
      case 'operating':
        return 'from-[#251A18] via-[#38231F] to-[#1A2333] border-amber-500/20';
      case 'trading':
        return 'from-[#17202A] via-[#1F2C3A] to-[#1A2333] border-blue-500/20';
      case 'income':
      default:
        return 'from-[#192231] via-[#232E42] to-[#141A21] border-[#C4A052]/30';
    }
  };

  const renderUrgencyBadge = () => {
    if (!urgencyTag) return null;
    switch (urgencyTag) {
      case 'urgent':
        return (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-ping" /> 🔥 급매물
          </span>
        );
      case 'reviewing':
        return (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
            ⚡ 선순위 검토 진행 중
          </span>
        );
      case 'flexible':
        return (
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            🌱 여유 협상 가능
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className={`relative bg-gradient-to-b ${getGradientStyle()} border rounded-2xl overflow-hidden text-slate-100 p-5 space-y-4 shadow-xl`}>
      {/* Background Abstract Geometric Accent */}
      <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-bl from-[#D4A853]/10 to-transparent rounded-full blur-2xl pointer-events-none" />
      <div className="absolute -bottom-10 -left-10 w-36 h-36 bg-blue-500/5 rounded-full blur-xl pointer-events-none" />

      {/* Top Badges */}
      <div className="relative z-10 flex items-center gap-2 flex-wrap">
        {postureLabel && (
          <span className="text-[11px] font-bold text-slate-900 px-2.5 py-0.5 rounded-md shadow-sm" style={{ backgroundColor: '#D4A853' }}>
            {postureLabel}
          </span>
        )}
        {archetype && <ArchetypeBadge archetype={archetype} size="md" />}
        <span className="text-xs font-semibold px-2.5 py-0.5 bg-slate-800/80 border border-slate-700/60 rounded-md text-slate-200">
          📍 {regionLabel}
        </span>
        {renderUrgencyBadge()}
      </div>

      {/* Hook Copy (High impact headline) */}
      {hookCopy && (
        <h1 className="relative z-10 text-[20px] font-bold text-white leading-snug tracking-tight font-serif drop-shadow-sm">
          {hookCopy}
        </h1>
      )}

      {/* 4-Tile Metrics Grid with Glassmorphism */}
      {postureHeroTiles && postureHeroTiles.length > 0 && (
        <div className="relative z-10 grid grid-cols-2 gap-2.5 pt-2">
          {postureHeroTiles.map((tile, i) => (
            <div 
              key={i}
              className={`p-3 rounded-xl border transition-all ${
                i === 0 
                  ? 'bg-[#182335]/90 border-[#D4A853]/40 shadow-inner' 
                  : 'bg-[#121822]/70 border-[#252E39]/80 backdrop-blur-sm'
              }`}
            >
              <div className="text-[10.5px] text-slate-400 font-medium mb-1 flex items-center gap-1">
                <span>{tile.emoji}</span>
                <span>{tile.label}</span>
              </div>
              <div className={`text-sm font-bold tracking-tight ${i === 0 ? 'text-[#5EEAD4] text-[15px]' : 'text-slate-100'}`}>
                {tile.value}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


