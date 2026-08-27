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
    <div className="bg-[#141A21] border border-[#252E39] rounded-lg p-4">
      <div className="text-[#E7ECF2] font-semibold mb-3 flex items-center gap-2">
        <span role="img" aria-label="bank">🏛</span> 규제 스크리닝
      </div>
      
      {landUseZone && (
        <div className="mb-4">
          <span className="text-[#9AA7B5] text-sm">용도지역:</span>
          <span className="text-[#E7ECF2] ml-2 text-sm">{landUseZone}</span>
        </div>
      )}

      {isTransactionPermitArea && (
        <div className="bg-red-900/20 border border-red-500/30 rounded p-2 mb-4">
          <p className="text-red-400 text-sm font-medium">
            ⚠️ 토지거래허가구역 — 실수요 증빙 필요
          </p>
          {permitZoneDetail && (
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              {permitZoneDetail.thresholdSqm != null && (
                <>
                  <span className="text-[#9AA7B5]">기준면적</span>
                  <span className="text-[#E7ECF2]">{permitZoneDetail.thresholdSqm.toLocaleString()}㎡</span>
                </>
              )}
              {permitZoneDetail.designationPeriod && (
                <>
                  <span className="text-[#9AA7B5]">지정기간</span>
                  <span className="text-[#E7ECF2]">{permitZoneDetail.designationPeriod}</span>
                </>
              )}
              {permitZoneDetail.useObligation && (
                <>
                  <span className="text-[#9AA7B5]">이용의무</span>
                  <span className="text-[#E7ECF2]">{permitZoneDetail.useObligation}</span>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {permits.length > 0 && (
        <ul className="space-y-2">
          {permits.map((permit, index) => (
            <li key={index} className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-[#9AA7B5] text-xs">{permit.kind}</span>
                <span className="text-[#E7ECF2] text-sm">{permit.label}</span>
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
