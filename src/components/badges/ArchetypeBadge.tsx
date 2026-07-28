import React from 'react';

type DealArchetype =
  | 'STABLE_INCOME'
  | 'VALUE_ADD'
  | 'DEVELOPMENT_SITE'
  | 'SAFE_EVICTION_DEV'
  | 'INSTITUTIONAL_LOGI'
  | 'NPL_AUCTION'
  | 'RETAIL_STREET'
  | 'OFFICE_REPOSITIONING'
  | 'MIXED_USE'
  | 'LAND_BANKING';

const ARCHETYPE_CONFIG: Record<DealArchetype, { label: string; icon: string; color: string }> = {
  STABLE_INCOME: { label: '안정 수익형', icon: '💰', color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  VALUE_ADD: { label: '공실 밸류애드', icon: '🔨', color: 'bg-orange-500/15 text-orange-300 border-orange-500/30' },
  DEVELOPMENT_SITE: { label: '개발 사이트', icon: '🏗️', color: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
  SAFE_EVICTION_DEV: { label: '안전 퇴거 개발', icon: '🛡️', color: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30' },
  INSTITUTIONAL_LOGI: { label: '물류 창고', icon: '📦', color: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30' },
  NPL_AUCTION: { label: 'NPL 경매', icon: '⚖️', color: 'bg-red-500/15 text-red-300 border-red-500/30' },
  RETAIL_STREET: { label: '상가 스트릿', icon: '🏬', color: 'bg-pink-500/15 text-pink-300 border-pink-500/30' },
  OFFICE_REPOSITIONING: { label: '오피스 리포지셔닝', icon: '🏢', color: 'bg-violet-500/15 text-violet-300 border-violet-500/30' },
  MIXED_USE: { label: '복합용도', icon: '🏛️', color: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  LAND_BANKING: { label: '토지 뱅킹', icon: '🌾', color: 'bg-lime-500/15 text-lime-300 border-lime-500/30' },
};

interface ArchetypeBadgeProps {
  archetype: string;
  size?: 'sm' | 'md';
}

export function ArchetypeBadge({ archetype, size = 'sm' }: ArchetypeBadgeProps) {
  const config = ARCHETYPE_CONFIG[archetype as DealArchetype];
  if (!config) {
    return (
      <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400 border border-neutral-700">
        {archetype.replace(/_/g, ' ')}
      </span>
    );
  }

  const sizeClasses = size === 'sm' ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2.5 py-1';

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border font-medium ${config.color} ${sizeClasses}`}>
      <span>{config.icon}</span>
      <span>{config.label}</span>
    </span>
  );
}
