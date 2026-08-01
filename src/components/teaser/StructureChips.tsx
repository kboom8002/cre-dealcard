import React from 'react';

interface StructureChipsProps {
  chips: string[];
}

export function StructureChips({ chips }: StructureChipsProps) {
  if (!chips || chips.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((chip, index) => (
        <span 
          key={index} 
          className="inline-flex items-center gap-1 text-[11px] font-medium bg-purple-500/10 text-purple-300 border border-purple-500/20 px-2.5 py-1 rounded-full"
        >
          <span className="text-purple-400">🔹</span> {chip}
        </span>
      ))}
    </div>
  );
}
