"use client";

import React from "react";

interface HospitalitySpecSectionProps {
  assetType?: string;
  roomCount: string;
  setRoomCount: (v: string) => void;
  averageDailyRate: string;
  setAverageDailyRate: (v: string) => void;
  occupancyRate: string;
  setOccupancyRate: (v: string) => void;
  gopMargin: string;
  setGopMargin: (v: string) => void;
}

export function HospitalitySpecSection({
  assetType,
  roomCount, setRoomCount,
  averageDailyRate, setAverageDailyRate,
  occupancyRate, setOccupancyRate,
  gopMargin, setGopMargin,
}: HospitalitySpecSectionProps) {
  const isHospitality = ['hotel', 'resort', 'motel', 'pension', 'guest_house'].some(
    t => assetType?.toLowerCase().includes(t) || assetType?.includes('호텔')
  );

  if (!isHospitality) return null;

  return (
    <div className="col-span-2 mt-3 border-t border-amber-500/30 pt-4 bg-amber-500/5 p-3.5 rounded-xl space-y-3">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-bold text-amber-300">🏨 운영형 (숙박/호텔) 매물 상세 정보</label>
        <span className="text-[10px] text-amber-400/80 font-medium">위젯 자동 시뮬레이션에 활용</span>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className="block text-[11px] font-semibold text-muted-foreground mb-1">총 객실 수</label>
          <input
            type="number"
            placeholder="예: 45"
            value={roomCount}
            onChange={(e) => setRoomCount(e.target.value)}
            className="w-full bg-secondary/50 border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-muted-foreground mb-1">평균 객단가 (ADR)</label>
          <input
            type="number"
            placeholder="예: 12 (만원)"
            value={averageDailyRate}
            onChange={(e) => setAverageDailyRate(e.target.value)}
            className="w-full bg-secondary/50 border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-muted-foreground mb-1">객실 점유율 (OCC)</label>
          <input
            type="number"
            placeholder="예: 75 (%)"
            value={occupancyRate}
            onChange={(e) => setOccupancyRate(e.target.value)}
            className="w-full bg-secondary/50 border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-muted-foreground mb-1">GOP 마진율</label>
          <input
            type="number"
            placeholder="예: 30 (%)"
            value={gopMargin}
            onChange={(e) => setGopMargin(e.target.value)}
            className="w-full bg-secondary/50 border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
          />
        </div>
      </div>
    </div>
  );
}
