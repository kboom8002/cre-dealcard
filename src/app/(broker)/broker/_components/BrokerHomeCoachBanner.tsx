"use client";

import React from "react";
import { FieldCoachBanner } from "@/components/help/FieldCoachBanner";

export function BrokerHomeCoachBanner() {
  return (
    <FieldCoachBanner
      headline="⚡ 60대 대표님을 위한 초간편 3대 산출물 (1분 딜카드 · 3분 기본 IM · 5분 주간 소식지)"
      guidance={
        <div className="space-y-1 text-[14px] sm:text-[15px]">
          <p>• <strong className="text-amber-950 font-black">1분 딜카드</strong>: 첫 카톡 접촉용 블라인드 티저 (상세 지번 보호, 1분 완성)</p>
          <p>• <strong className="text-amber-950 font-black">3분 기본 IM</strong>: 매수 결정용 12면 정식 투자설명서 (지적도·렌트롤·수익률 분석)</p>
          <p>• <strong className="text-amber-950 font-black">5분 주간 소식지</strong>: 매주 월요일 안부와 추천 매물을 전하는 모바일 매거진</p>
        </div>
      }
      sampleButtonLabel="📋 3대 산출물 활용 팁 복사"
      sampleText={`[크리딜 3대 산출물 1초 활용 요령]
1. 첫 고객 접촉: 지번이 보호된 '1분 딜카드'로 보안 유지
2. 진성 매수자: 지적도와 렌트롤이 완비된 '3분 기본 IM' 발송
3. 단골 관리: 매주 월요일 '5분 주간 소식지'로 안부 전달`}
      copySample
      copyToastMessage="✅ 3대 산출물 활용 팁이 복사되었습니다!"
      mistakeWarning="첫 상담에서 상세 지번이 적힌 전체 제안서를 바로 보내시면 매물이 유출될 위험이 있습니다. 첫 카톡에는 반드시 지번이 안전하게 가려진 [1분 딜카드]를 먼저 보내세요."
      variant="amber"
      className="my-2"
    />
  );
}
