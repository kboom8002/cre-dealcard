import React from 'react';

interface TrustLineProps {
  brokerName: string;
  brokerPhone?: string;
  brokerSlug?: string;
  brokerAvatarUrl?: string;
  specialty?: string;
  responseGuaranteeHours?: number;
  closedDeals?: number;
  isLicensed?: boolean;
}

export function TrustLine({
  brokerName,
  brokerPhone,
  brokerSlug,
  brokerAvatarUrl,
  specialty,
  responseGuaranteeHours,
  closedDeals,
  isLicensed = true
}: TrustLineProps) {
  const cleanPhone = brokerPhone?.replace(/[^0-9]/g, "");

  return (
    <div className="bg-[#141A21] border border-[#252E39] rounded-xl p-4 flex flex-col gap-3 shadow-lg">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {/* Broker Avatar */}
          <div className="relative shrink-0">
            {brokerAvatarUrl ? (
              <img
                src={brokerAvatarUrl}
                alt={brokerName}
                className="w-11 h-11 rounded-full object-cover border-2 border-amber-400/40 shadow-sm"
              />
            ) : (
              <div className="w-11 h-11 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 border border-slate-600/70 flex items-center justify-center shadow-inner">
                <svg className="w-6 h-6 text-amber-300/80" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                </svg>
              </div>
            )}
            {isLicensed && (
              <span className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-[#141A21] flex items-center justify-center text-[9px] text-white font-bold" title="공인중개사 인증">
                ✓
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-bold text-white tracking-tight truncate max-w-[140px] sm:max-w-none">
                {brokerName || "담당 중개사"}
              </span>
              {isLicensed && (
                <span className="text-[10px] shrink-0 bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.2 rounded font-semibold">
                  공인중개사
                </span>
              )}
            </div>
            {specialty && <p className="text-[11px] text-slate-400 truncate mt-0.5">{specialty}</p>}
          </div>
        </div>

        {cleanPhone && (
          <a
            href={`tel:${cleanPhone}`}
            className="shrink-0 flex items-center justify-center gap-1 text-xs font-bold text-amber-300 bg-amber-400/10 hover:bg-amber-400/20 active:bg-amber-400/30 border border-amber-400/40 px-3 py-2 rounded-xl transition-all shadow-sm active:scale-95"
            id="cta-trustline-call"
          >
            <span>📞</span>
            <span>바로 통화</span>
          </a>
        )}
      </div>
      
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#9AA7B5] pt-2 border-t border-slate-800/80">
        {responseGuaranteeHours && <span>⚡ {responseGuaranteeHours}시간 내 응답 보장</span>}
        {responseGuaranteeHours && closedDeals && <span className="text-slate-600">·</span>}
        {closedDeals !== undefined && closedDeals > 0 && <span>🏆 누적 성사 {closedDeals}건</span>}
        {!responseGuaranteeHours && !closedDeals && (
          <span className="text-slate-400 flex items-center gap-1">
            <span>🛡️</span> 매도자 보호 정식 등록 검증 완료
          </span>
        )}
      </div>
    </div>
  );
}
