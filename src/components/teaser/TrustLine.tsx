import React from 'react';

interface TrustLineProps {
  brokerName: string;
  brokerSlug?: string;
  specialty?: string;
  responseGuaranteeHours?: number;
  closedDeals?: number;
  isLicensed?: boolean;
}

export function TrustLine({
  brokerName,
  brokerSlug,
  specialty,
  responseGuaranteeHours,
  closedDeals,
  isLicensed
}: TrustLineProps) {
  return (
    <div className="bg-[#141A21] border border-[#252E39] rounded-xl p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-white">{brokerName}</span>
          {isLicensed && (
            <span className="text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded-full flex items-center gap-1">
              ✓ 공인중개사
            </span>
          )}
        </div>
        {brokerSlug && (
          <a href={`/vibe-card/${brokerSlug}`} className="text-[10px] text-slate-400 hover:text-white underline underline-offset-2">
            프로필 보기
          </a>
        )}
      </div>
      
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
        {specialty && <span>{specialty} 전문</span>}
        {specialty && <span className="text-slate-600">·</span>}
        {responseGuaranteeHours && <span>응답 보장 {responseGuaranteeHours}시간</span>}
        {responseGuaranteeHours && closedDeals && <span className="text-slate-600">·</span>}
        {closedDeals !== undefined && <span>성사 {closedDeals}건</span>}
      </div>
    </div>
  );
}
