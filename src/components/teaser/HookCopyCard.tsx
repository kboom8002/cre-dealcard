import React from 'react';

interface HookCopyCardProps {
  hookCopy: string;
  archetype?: string;
}

export function HookCopyCard({ hookCopy, archetype }: HookCopyCardProps) {
  return (
    <div className="bg-[#141A21] border border-amber-500/30 rounded-xl p-4 shadow-[0_0_15px_rgba(245,158,11,0.05)]">
      <div className="flex items-start gap-3">
        <span className="text-amber-500 text-lg mt-0.5">✨</span>
        <p className="text-sm font-bold text-white leading-relaxed">
          {hookCopy}
        </p>
      </div>
    </div>
  );
}
