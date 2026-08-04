import React from 'react';

interface CuriosityLockProps {
  curiositySlot: string;
  candidateCount?: number;
  passed?: boolean;
}

/**
 * Curiosity Lock — posture별 궁금증 유발 문장.
 * CRITICAL: 이 블록은 passed 여부와 관계없이 항상 렌더링됩니다.
 * 공개 정책 안내는 PublicPolicyBlock으로 분리되었습니다.
 */
export function CuriosityLock({ curiositySlot, candidateCount, passed }: CuriosityLockProps) {
  return (
    <div className="bg-[#141A21] border border-[#252E39] rounded-xl p-5 space-y-3">
      {/* Curiosity quote */}
      <div className="flex items-start gap-3">
        <span className="text-[#F59E0B] text-lg mt-0.5 shrink-0">🔒</span>
        <p className="text-[13px] text-[#E7ECF2] font-medium leading-relaxed">
          {curiositySlot}
        </p>
      </div>

      {/* Re-identification gate status */}
      {typeof candidateCount === 'number' && candidateCount > 0 && (
        <div className="flex items-center gap-2 pt-2 border-t border-[#252E39]">
          <span className={`w-1.5 h-1.5 rounded-full ${passed ? 'bg-[#4ADE80]' : 'bg-[#F59E0B]'}`} />
          <p className="text-[10.5px] text-[#6B7987]">
            후보 필지 {candidateCount}개 — 재식별 게이트 {passed ? '통과' : '심사 중'}
          </p>
        </div>
      )}
    </div>
  );
}
