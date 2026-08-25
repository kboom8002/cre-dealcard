"use client";

import React from "react";

interface OwnerOccupiedSpecSectionProps {
  investmentPosture: string;
  occHeadcount: string;
  setOccHeadcount: (v: string) => void;
  occAreaPerHeadPyung: string;
  setOccAreaPerHeadPyung: (v: string) => void;
  occDesiredFloors: string;
  setOccDesiredFloors: (v: string) => void;
  occCurrentRentManwon: string;
  setOccCurrentRentManwon: (v: string) => void;
}

export function OwnerOccupiedSpecSection({
  investmentPosture,
  occHeadcount, setOccHeadcount,
  occAreaPerHeadPyung, setOccAreaPerHeadPyung,
  occDesiredFloors, setOccDesiredFloors,
  occCurrentRentManwon, setOccCurrentRentManwon,
}: OwnerOccupiedSpecSectionProps) {
  if (investmentPosture !== 'owner_occupied') return null;

  return (
    <div className="border border-blue-500/30 rounded-xl p-4 bg-blue-500/5 space-y-3">
      <div className="flex justify-between items-center border-b border-blue-500/20 pb-2">
        <span className="text-xs font-bold text-blue-300">🏢 사옥 입주 및 자가사용 계획</span>
        <span className="text-[10px] text-blue-400 font-medium">자가사용 위젯 시뮬레이션</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] text-muted-foreground mb-1">예상 입주 인원 (명)</label>
          <input
            type="number"
            placeholder="예: 100"
            value={occHeadcount}
            onChange={(e) => setOccHeadcount(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
          />
        </div>
        <div>
          <label className="block text-[10px] text-muted-foreground mb-1">1인당 필요 면적 (평)</label>
          <input
            type="number"
            step="0.1"
            placeholder="예: 3.3"
            value={occAreaPerHeadPyung}
            onChange={(e) => setOccAreaPerHeadPyung(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
          />
        </div>
        <div>
          <label className="block text-[10px] text-muted-foreground mb-1">희망 사용 층</label>
          <input
            type="text"
            placeholder="예: 지상 2~5층"
            value={occDesiredFloors}
            onChange={(e) => setOccDesiredFloors(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
          />
        </div>
        <div>
          <label className="block text-[10px] text-muted-foreground mb-1">현재 사옥 월 임차료 (만원)</label>
          <input
            type="number"
            placeholder="예: 3000 (매입 비교용)"
            value={occCurrentRentManwon}
            onChange={(e) => setOccCurrentRentManwon(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
          />
        </div>
      </div>
    </div>
  );
}
