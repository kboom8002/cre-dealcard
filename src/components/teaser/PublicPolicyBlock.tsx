import React from 'react';

export interface PublicPolicyBlockProps {
  candidateCount: number;
  kThreshold: number;
  passed: boolean;
}

export const PublicPolicyBlock: React.FC<PublicPolicyBlockProps> = ({
  candidateCount,
  kThreshold,
  passed,
}) => {
  return (
    <div className="bg-white border border-dashed border-slate-300 rounded-xl p-4 mt-4 shadow-sm">
      <div className="flex items-center gap-2.5 text-slate-900 font-bold text-sm mb-1.5">
        <span className="text-amber-600 text-base">🛡️</span>
        <span>매도자 보호 및 비밀 유지 안내</span>
      </div>
      
      <p className="text-slate-700 text-sm leading-relaxed">
        본 매물은 매도자의 요청에 따라 정확한 지번 및 상세 소유자 정보가 안전하게 블라인드 처리되어 있습니다. 
        상세 자료는 비밀유지약정(NDA) 체결 후 확인 가능합니다.
      </p>

      {typeof candidateCount === 'number' && candidateCount > 0 && (
        <div className="mt-2.5 pt-2 border-t border-slate-200 flex flex-col gap-1.5 text-sm text-slate-600">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span>권역 내 비교 후보군 {candidateCount}개 자산 검증 완료 (요구기준 k={kThreshold})</span>
            {passed ? (
              <span className="text-emerald-700 font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" /> 보안 검증됨
              </span>
            ) : (
              <span className="text-red-700 font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-red-600" /> 식별 위험
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

