import React from 'react';
import { ArchetypeBadge } from '@/components/badges/ArchetypeBadge';
import { filterValidTiles } from '@/domain/teaser/filter-valid-tiles';

interface TeaserHeroHeaderProps {
  archetype?: string;
  regionLabel: string;
  title?: string;
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
  title,
  hookCopy,
  posture = 'income',
  postureLabel,
  postureHeroTiles,
  bandedPrice,
  bandedCapRate,
  bandedArea,
  vacancyLabel,
  urgencyTag
}: TeaserHeroHeaderProps) {
  // Posture별 밝은 페이퍼 스튜디오 테마 (D3)
  const getGradientStyle = () => {
    switch (posture) {
      case 'development':
        return 'from-emerald-50 via-white to-slate-50 border-emerald-200';
      case 'owner_occupied':
        return 'from-indigo-50 via-white to-slate-50 border-indigo-200';
      case 'operating':
        return 'from-amber-50 via-white to-slate-50 border-amber-200';
      case 'trading':
        return 'from-sky-50 via-white to-slate-50 border-sky-200';
      case 'income':
      default:
        return 'from-amber-50/70 via-white to-slate-50 border-slate-300';
    }
  };

  const renderUrgencyBadge = () => {
    if (!urgencyTag) return null;
    switch (urgencyTag) {
      case 'urgent':
        return (
          <span className="text-sm font-bold px-2.5 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-ping" /> 🔥 급매물
          </span>
        );
      case 'reviewing':
        return (
          <span className="text-sm font-bold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1">
            ⚡ 선순위 검토 진행 중
          </span>
        );
      case 'flexible':
        return (
          <span className="text-sm font-medium px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
            🌱 여유 협상 가능
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div
      data-testid="public-dealcard-hero"
      className={`relative bg-gradient-to-b ${getGradientStyle()} border rounded-2xl overflow-hidden text-slate-900 p-5 space-y-4 shadow-sm`}
    >
      {/* Background Abstract Geometric Accent */}
      <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-bl from-amber-200/30 to-transparent rounded-full blur-2xl pointer-events-none" />
      <div className="absolute -bottom-10 -left-10 w-36 h-36 bg-sky-200/20 rounded-full blur-xl pointer-events-none" />

      {/* Top Badges */}
      <div className="relative z-10 flex items-center gap-2 flex-wrap">
        {postureLabel && (
          <span className="text-sm font-bold text-slate-950 px-2.5 py-0.5 rounded-md shadow-sm bg-amber-300 border border-amber-400">
            {postureLabel}
          </span>
        )}
        {archetype && <ArchetypeBadge archetype={archetype} size="md" />}
        <span className="text-sm font-semibold px-2.5 py-0.5 bg-slate-100 border border-slate-300 rounded-md text-slate-800">
          📍 {regionLabel}
        </span>
        {renderUrgencyBadge()}
      </div>

      {/* Title & Hook Copy (OG Card style: Title main, hookCopy sub — Single-Line Title Guard) */}
      {title ? (
        <div className="relative z-10 space-y-1.5">
          <h1
            data-single-line-title="true"
            title={title}
            className="text-xl sm:text-2xl font-bold text-slate-950 leading-snug tracking-tight font-serif whitespace-nowrap overflow-hidden text-ellipsis truncate"
          >
            {title}
          </h1>
          {hookCopy && (
            <p className="text-sm text-slate-700 leading-relaxed font-medium">
              {hookCopy}
            </p>
          )}
        </div>
      ) : hookCopy ? (
        <h1
          data-single-line-title="true"
          title={hookCopy}
          className="relative z-10 text-xl sm:text-2xl font-bold text-slate-950 leading-snug tracking-tight font-serif whitespace-nowrap overflow-hidden text-ellipsis truncate"
        >
          {hookCopy}
        </h1>
      ) : null}

      {/* 4-Tile Metrics Grid */}
      {(() => {
        let validTiles = postureHeroTiles ? filterValidTiles(postureHeroTiles) : [];
        if (validTiles.length === 0) {
          const fallbackTiles = [];
          if (bandedPrice) fallbackTiles.push({ emoji: "💰", label: "매각가", value: bandedPrice });
          if (bandedCapRate) fallbackTiles.push({ emoji: "📈", label: "수익률", value: bandedCapRate });
          if (bandedArea) fallbackTiles.push({ emoji: "📐", label: "연면적", value: bandedArea });
          if (vacancyLabel) fallbackTiles.push({ emoji: "🏢", label: "공실", value: vacancyLabel });
          validTiles = filterValidTiles(fallbackTiles);
        }
        return validTiles.length > 0 ? (
          <div className="relative z-10 grid grid-cols-2 gap-2.5 pt-2">
            {validTiles.map((tile, i) => (
            <div 
              key={i}
              className={`p-3 rounded-xl border transition-all ${
                i === 0 
                  ? 'bg-amber-50/80 border-amber-300 shadow-sm' 
                  : 'bg-white border-slate-200'
              }`}
            >
              <div className="text-sm text-slate-600 font-semibold mb-1 flex items-center gap-1">
                <span>{tile.emoji}</span>
                <span>{tile.label}</span>
              </div>
              <div className={`text-sm font-extrabold tracking-tight ${i === 0 ? 'text-amber-900 text-[15px]' : 'text-slate-950'}`}>
                {tile.value}
              </div>
            </div>
          ))}
          </div>
        ) : null;
      })()}
    </div>
  );
}


