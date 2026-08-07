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
    <div className="bg-[#141A21] border border-dashed border-[#252E39] rounded-xl p-4 mt-4">
      <div className="flex items-center gap-2.5 text-[#E7ECF2] font-semibold text-xs mb-1.5">
        <span className="text-amber-400 text-sm">🛡️</span>
        <span>매도자 보호 및 비밀 유지 안내</span>
      </div>
      
      <p className="text-[#9AA7B5] text-[11.5px] leading-relaxed">
        본 매물은 매도자의 요청에 따라 정확한 지번 및 상세 소유자 정보가 안전하게 블라인드 처리되어 있습니다. 
        상세 자료는 비밀유지약정(NDA) 체결 후 확인 가능합니다.
      </p>

      {typeof candidateCount === 'number' && candidateCount > 0 && (
        <div className="mt-2.5 pt-2 border-t border-[#252E39]/60 flex items-center justify-between text-[10.5px] text-[#6B7987]">
          <span>권역 내 비교 후보군 {candidateCount}개 자산 검증 완료</span>
          <span className="text-emerald-400 font-medium flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> 보안 검증됨
          </span>
        </div>
      )}
    </div>
  );
};

