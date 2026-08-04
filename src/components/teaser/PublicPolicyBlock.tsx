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
    <div className="bg-[#141A21] border border-dashed border-[#252E39] rounded-lg p-4 mt-4">
      <div className="flex items-center gap-2 text-[#E7ECF2] font-medium mb-2">
        <span role="img" aria-label="lock">🔒</span>
        <span>정밀 호가·지번·층별 조건은 상세 요청 후 공개됩니다</span>
      </div>
      
      <div className="text-[#9AA7B5] text-sm mb-3">
        후보 필지 {candidateCount}개 — 재식별 게이트 {passed ? '통과' : '미통과'}
      </div>

      {!passed && (
        <div className="bg-red-900/20 border border-red-500/30 rounded p-2">
          <p className="text-red-400 text-sm font-medium">
            재식별 위험으로 공개 제한 — 밴드 확대 후 재시도
          </p>
        </div>
      )}
    </div>
  );
};
