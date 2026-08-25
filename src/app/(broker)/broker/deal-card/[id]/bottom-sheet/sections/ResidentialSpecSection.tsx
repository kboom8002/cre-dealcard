"use client";

import React from "react";

interface ResidentialSpecSectionProps {
  assetType?: string;
  resTotalUnits: string;
  setResTotalUnits: (v: string) => void;
  resJeonseUnits: string;
  setResJeonseUnits: (v: string) => void;
  resJeonseDepositTotalManwon: string;
  setResJeonseDepositTotalManwon: (v: string) => void;
  resIllegalExtension: boolean;
  setResIllegalExtension: (v: boolean) => void;
}

export function ResidentialSpecSection({
  assetType,
  resTotalUnits, setResTotalUnits,
  resJeonseUnits, setResJeonseUnits,
  resJeonseDepositTotalManwon, setResJeonseDepositTotalManwon,
  resIllegalExtension, setResIllegalExtension,
}: ResidentialSpecSectionProps) {
  const isResidential = ['multi_household', 'multi_family', 'mixed_shop_house'].some(
    t => assetType?.toLowerCase().includes(t) || assetType?.includes('다세대') || assetType?.includes('다가구') || assetType?.includes('상가주택')
  );

  if (!isResidential) return null;

  return (
    <div className="border border-emerald-500/30 rounded-xl p-4 bg-emerald-500/5 space-y-3">
      <div className="flex justify-between items-center border-b border-emerald-500/20 pb-2">
        <span className="text-xs font-bold text-emerald-300">🏠 주거 세대 스펙</span>
        <span className="text-[10px] text-emerald-400 font-medium">전세/월세 보증금</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] text-muted-foreground mb-1">총 세대수</label>
          <input
            type="number"
            placeholder="예: 12"
            value={resTotalUnits}
            onChange={(e) => setResTotalUnits(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
          />
        </div>
        <div>
          <label className="block text-[10px] text-muted-foreground mb-1">전세 세대수</label>
          <input
            type="number"
            placeholder="예: 4"
            value={resJeonseUnits}
            onChange={(e) => setResJeonseUnits(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
          />
        </div>
        <div>
          <label className="block text-[10px] text-muted-foreground mb-1">전세 보증금 합계 (만원)</label>
          <input
            type="number"
            placeholder="예: 80000"
            value={resJeonseDepositTotalManwon}
            onChange={(e) => setResJeonseDepositTotalManwon(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
          />
        </div>
        <div className="flex items-center gap-2 pt-4">
          <input
            type="checkbox"
            id="resIllegalExtension"
            checked={resIllegalExtension}
            onChange={(e) => setResIllegalExtension(e.target.checked)}
            className="rounded border-border text-emerald-500 focus:ring-emerald-500 w-4 h-4 bg-background"
          />
          <label htmlFor="resIllegalExtension" className="text-xs text-muted-foreground cursor-pointer">불법 증축/옥탑 포함</label>
        </div>
        {resIllegalExtension && (
          <div className="col-span-2 text-[10px] text-red-400 bg-red-500/5 border border-red-500/20 rounded-lg p-2 mt-1">
            ⚠️ 위반건축물 대장 등재 시 매수자 주택담보대출이 차단될 수 있습니다. IM 리스크 섹션에 자동 기재됩니다.
          </div>
        )}
      </div>
    </div>
  );
}
