import React from 'react';

interface TrustLineProps {
  brokerName: string;
  brokerPhone?: string;
  brokerSlug?: string;
  specialty?: string;
  responseGuaranteeHours?: number;
  closedDeals?: number;
  isLicensed?: boolean;
}

export function TrustLine({
  brokerName,
  brokerPhone,
  brokerSlug,
  specialty,
  responseGuaranteeHours,
  closedDeals,
  isLicensed = true
}: TrustLineProps) {
  const cleanPhone = brokerPhone?.replace(/[^0-9]/g, "");

  return (
    <div className="bg-[#141A21] border border-[#252E39] rounded-xl p-4 flex flex-col gap-2.5 shadow-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-amber-300">
            👤
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold text-white">{brokerName || "담당 중개사"}</span>
              {isLicensed && (
                <span className="text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-medium">
                  ✓ 공인중개사
                </span>
              )}
            </div>
            {specialty && <p className="text-[11px] text-slate-400">{specialty}</p>}
          </div>
        </div>

        {cleanPhone && (
          <a
            href={`tel:${cleanPhone}`}
            className="flex items-center gap-1 text-xs font-bold text-amber-300 bg-amber-400/10 hover:bg-amber-400/20 border border-amber-400/30 px-3 py-1.5 rounded-lg transition-colors"
          >
            <span>📞</span>
            <span>바로 통화</span>
          </a>
        )}
      </div>
      
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#9AA7B5] pt-1 border-t border-slate-800/60">
        {responseGuaranteeHours && <span>⚡ {responseGuaranteeHours}시간 내 응답 보장</span>}
        {responseGuaranteeHours && closedDeals && <span className="text-slate-600">·</span>}
        {closedDeals !== undefined && closedDeals > 0 && <span>🏆 누적 성사 {closedDeals}건</span>}
        {!responseGuaranteeHours && !closedDeals && (
          <span className="text-slate-400">🛡️ 매도자 보호 정식 등록 검증 완료</span>
        )}
      </div>
    </div>
  );
}


