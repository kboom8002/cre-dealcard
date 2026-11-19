'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShieldCheck, ArrowRight } from 'lucide-react';

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
  const pathname = usePathname();

  const isMagazineReader =
    context === 'magazine' ||
    (typeof pathname === 'string' && pathname.startsWith('/magazine'));

  if (isMagazineReader) {
    return (
      <div className={`flex items-center justify-center py-2 ${className}`}>
        <span className="inline-flex min-h-12 items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-1.5 text-sm font-semibold text-emerald-800">
          <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
          <span>CREDEAL 안심 매거진 · 공적장부 교차검증</span>
        </span>
      </div>
    );
  }

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
          className="inline-flex min-h-12 items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 transition-colors group"
        >
          <ShieldCheck className="w-4 h-4 text-emerald-700 group-hover:text-emerald-800 shrink-0" />
          <span>Data Verified by</span>
          <span className="font-semibold text-slate-900 group-hover:text-blue-700">CREDEAL</span>
        </Link>
      </div>
    );
  }

  return (
    <div className={`w-full max-w-[440px] mx-auto pt-4 pb-2 px-3 ${className}`}>
      <Link
        href={href}
        className="block bg-white hover:bg-slate-50 border border-slate-200 hover:border-blue-400 rounded-xl p-3.5 shadow-sm transition-all group"
      >
        <div className="flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4 text-emerald-700" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-sm font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  공적장부 교차검증
                </span>
                <span className="text-sm font-bold text-slate-700">
                  Data Verified by <span className="text-slate-900 font-extrabold">CREDEAL</span>
                </span>
              </div>
              <p className="text-sm text-slate-600 truncate mt-1">
                나도 60초 만에 기관급 딜카드·매거진 만들기
              </p>
            </div>
          </div>
          <div className="w-7 h-7 rounded-full bg-slate-100 group-hover:bg-blue-50 flex items-center justify-center shrink-0 transition-colors">
            <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-blue-700" />
          </div>
        </div>
      </Link>
    </div>
  );
}
