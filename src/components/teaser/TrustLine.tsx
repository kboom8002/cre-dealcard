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
    <div className="bg-[#141A21] border border-[#252E39] rounded-xl p-4 flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-white">{brokerName}</span>
          {isLicensed && (
            <span className="text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
              ✓ 공인중개사
            </span>
          )}
        </div>
        {brokerSlug && (
          <span className="text-[10px] text-[#8A99AD] font-medium bg-[#1F2733] px-2 py-0.5 rounded">
            검증된 전담 중개사
          </span>
        )}
      </div>
      
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#9AA7B5]">
        {specialty && <span className="text-slate-300 font-medium">{specialty} 전문</span>}
        {specialty && <span className="text-slate-600">·</span>}
        {responseGuaranteeHours && <span>⚡ {responseGuaranteeHours}시간 내 응답 보장</span>}
        {responseGuaranteeHours && closedDeals && <span className="text-slate-600">·</span>}
        {closedDeals !== undefined && <span>🏆 누적 성사 {closedDeals}건</span>}
      </div>
    </div>
  );
}

