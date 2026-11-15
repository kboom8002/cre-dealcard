import React from 'react';
import {
  extractSanitizedStatutoryItems,
  sanitizeStatutoryField,
} from '@/lib/legal/broker-statutory-disclosure';

export interface TrustLineProps {
  brokerName: string;
  brokerPhone?: string | null;
  brokerSlug?: string | null;
  brokerAvatarUrl?: string | null;
  specialty?: string | null;
  officeName?: string | null;
  officeAddress?: string | null;
  officeRegNumber?: string | null;
  representativeName?: string | null;
  responseGuaranteeHours?: number | null;
  closedDeals?: number | null;
  isLicensed?: boolean;
}

function TrustLineBase({
  brokerName,
  brokerPhone,
  brokerAvatarUrl,
  specialty,
  officeName,
  officeAddress,
  officeRegNumber,
  representativeName,
  responseGuaranteeHours,
  closedDeals,
  isLicensed = false,
}: TrustLineProps) {
  const safeBrokerName = sanitizeStatutoryField(brokerName, 'name') || '담당 중개사';
  const hasExplicitStatutoryTrigger = Boolean(
    sanitizeStatutoryField(officeName, 'officeName') ||
      sanitizeStatutoryField(officeAddress, 'address') ||
      sanitizeStatutoryField(officeRegNumber, 'regNo') ||
      sanitizeStatutoryField(representativeName, 'name') ||
      sanitizeStatutoryField(brokerPhone, 'phone'),
  );

  const statutory = extractSanitizedStatutoryItems({
    officeName,
    officeAddress,
    officeRegNumber,
    representativeName,
    displayName: hasExplicitStatutoryTrigger ? brokerName : undefined,
    phone: brokerPhone,
  });

  const hasVerifiedStats =
    (typeof responseGuaranteeHours === 'number' && responseGuaranteeHours > 0) ||
    (typeof closedDeals === 'number' && closedDeals > 0);

  return (
    <div
      data-testid="public-dealcard-trustline"
      className="bg-[#141A21] border border-[#252E39] rounded-2xl p-4 flex flex-col gap-3 shadow-lg"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {/* Broker Avatar */}
          <div className="relative shrink-0">
            {brokerAvatarUrl ? (
              <img
                src={brokerAvatarUrl}
                alt={safeBrokerName}
                className="w-12 h-12 rounded-full object-cover border-2 border-amber-400/40 shadow-sm"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 border border-slate-600/70 flex items-center justify-center shadow-inner">
                <svg
                  className="w-6 h-6 text-amber-300/80"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                </svg>
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-base font-extrabold text-white tracking-tight break-keep">
                {safeBrokerName}
              </span>
              {isLicensed && (
                <span className="text-sm shrink-0 bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-md font-bold">
                  공인중개사
                </span>
              )}
            </div>
            {specialty && (
              <p className="text-sm text-slate-300 mt-0.5 break-keep">{specialty}</p>
            )}
          </div>
        </div>
      </div>

      {hasVerifiedStats && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-300 pt-2 border-t border-slate-800/80">
          {typeof responseGuaranteeHours === 'number' && responseGuaranteeHours > 0 && (
            <span>평균 {responseGuaranteeHours}시간 내 답변</span>
          )}
          {typeof responseGuaranteeHours === 'number' &&
            responseGuaranteeHours > 0 &&
            typeof closedDeals === 'number' &&
            closedDeals > 0 && <span className="text-slate-600">·</span>}
          {typeof closedDeals === 'number' && closedDeals > 0 && (
            <span>누적 거래 {closedDeals}건</span>
          )}
        </div>
      )}

      {hasExplicitStatutoryTrigger && statutory.hasAny && (
        <dl
          data-testid="broker-statutory-disclosure"
          className="pt-2.5 border-t border-slate-800/80 space-y-1 text-xs text-slate-300"
        >
          {statutory.items.map((item) => (
            <div key={item.key} className="flex items-baseline gap-2 break-keep">
              <dt className="shrink-0 font-semibold text-slate-400">{item.label}</dt>
              <dd className="text-slate-200">{item.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

export const TrustLine = React.memo(TrustLineBase);
