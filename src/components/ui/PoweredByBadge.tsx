import React from 'react';
import Link from 'next/link';
import { ShieldCheck, ArrowRight, Sparkles } from 'lucide-react';

export interface PoweredByBadgeProps {
  variant?: 'full' | 'subtle';
  context?: 'dealcard' | 'magazine' | 'im';
  buildingId?: string;
  brokerId?: string;
  className?: string;
}

export function PoweredByBadge({
  variant = 'full',
  context = 'dealcard',
  buildingId,
  brokerId,
  className = '',
}: PoweredByBadgeProps) {
  const queryParams = new URLSearchParams();
  if (context) queryParams.set('ctx', context);
  if (buildingId) queryParams.set('ref', buildingId);
  if (brokerId) queryParams.set('broker', brokerId);

  const href = `/powered-by?${queryParams.toString()}`;

  if (variant === 'subtle') {
    return (
      <div className={`flex items-center justify-center py-2 ${className}`}>
        <Link
          href={href}
          className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-slate-300 transition-colors group"
        >
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500/80 group-hover:text-emerald-400" />
          <span>Data Verified by</span>
          <span className="font-semibold text-slate-400 group-hover:text-white">CREDEAL</span>
        </Link>
      </div>
    );
  }

  return (
    <div className={`w-full max-w-[440px] mx-auto pt-4 pb-2 px-3 ${className}`}>
      <Link
        href={href}
        className="block bg-gradient-to-r from-slate-900/90 via-slate-800/80 to-slate-900/90 hover:from-slate-800 hover:to-slate-800/90 border border-slate-700/60 hover:border-indigo-500/40 rounded-xl p-3 shadow-lg transition-all group backdrop-blur-sm"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">
                  공적장부 교차검증
                </span>
                <span className="text-[11px] font-bold text-slate-200">
                  Data Verified by <span className="text-white font-extrabold">CREDEAL</span>
                </span>
              </div>
              <p className="text-[10px] text-slate-400 truncate mt-0.5">
                나도 60초 만에 기관급 딜카드·매거진 만들기
              </p>
            </div>
          </div>
          <div className="w-6 h-6 rounded-full bg-white/5 group-hover:bg-indigo-500/20 flex items-center justify-center shrink-0 transition-colors">
            <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-300" />
          </div>
        </div>
      </Link>
    </div>
  );
}
