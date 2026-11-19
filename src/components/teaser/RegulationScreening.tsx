import React from 'react';

export interface Permit {
  kind: string;
  status: 'required' | 'cleared' | 'risk';
  label: string;
  estimatedMonths?: number;
}

export interface RegulationScreeningProps {
  permits: Permit[];
  landUseZone: string;
  isTransactionPermitArea: boolean;
  /** D37 H-7: 토지거래허가 상세 정보 */
  permitZoneDetail?: {
    thresholdSqm?: number;
    designationPeriod?: string;
    useObligation?: string;
  };
}

export const RegulationScreening: React.FC<RegulationScreeningProps> = ({
  permits,
  landUseZone,
  isTransactionPermitArea,
  permitZoneDetail,
}) => {
  if (permits.length === 0 && !isTransactionPermitArea) {
    return null;
  }

  return (
    <div className="bg-white border border-slate-300 rounded-xl p-4 shadow-sm">
      <div className="text-slate-900 font-bold mb-3 flex items-center gap-2 text-base">
        <span role="img" aria-label="bank">🏛</span> 규제 스크리닝
      </div>
      
      {landUseZone && (
        <div className="mb-4">
          <span className="text-slate-600 text-sm">용도지역:</span>
          <span className="text-slate-900 font-semibold ml-2 text-sm">{landUseZone}</span>
        </div>
      )}

      {isTransactionPermitArea && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
          <p className="text-red-800 text-sm font-semibold">
            ⚠️ 토지거래허가구역 — 실수요 증빙 필요
          </p>
          {permitZoneDetail && (
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              {permitZoneDetail.thresholdSqm != null && (
                <>
                  <span className="text-slate-600">기준면적</span>
                  <span className="text-slate-900 font-medium">{permitZoneDetail.thresholdSqm.toLocaleString()}㎡</span>
                </>
              )}
              {permitZoneDetail.designationPeriod && (
                <>
                  <span className="text-slate-600">지정기간</span>
                  <span className="text-slate-900 font-medium">{permitZoneDetail.designationPeriod}</span>
                </>
              )}
              {permitZoneDetail.useObligation && (
                <>
                  <span className="text-slate-600">이용의무</span>
                  <span className="text-slate-900 font-medium">{permitZoneDetail.useObligation}</span>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {permits.length > 0 && (
        <ul className="space-y-2">
          {permits.map((permit, index) => (
            <li key={index} className="flex items-center justify-between gap-2">
              <div className="flex flex-col">
                <span className="text-slate-600 text-sm">{permit.kind}</span>
                <span className="text-slate-900 font-medium text-sm">{permit.label}</span>
              </div>
              <div>
                {permit.status === 'cleared' && <span title="cleared">✅</span>}
                {permit.status === 'required' && <span title="required">⚠️</span>}
                {permit.status === 'risk' && <span title="risk">🔴</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
