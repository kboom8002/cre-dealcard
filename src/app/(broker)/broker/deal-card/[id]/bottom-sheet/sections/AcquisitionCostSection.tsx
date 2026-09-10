"use client";

import React from "react";

interface AcquisitionCostSectionProps {
  acquisitionTaxPct: string;
  setAcquisitionTaxPct: (v: string) => void;
  brokerageFeeManwon: string;
  setBrokerageFeeManwon: (v: string) => void;
  legalFeeManwon: string;
  setLegalFeeManwon: (v: string) => void;
  otherCostManwon: string;
  setOtherCostManwon: (v: string) => void;
  askingPriceManwon?: number | null;
}

export function AcquisitionCostSection({
  acquisitionTaxPct, setAcquisitionTaxPct,
  brokerageFeeManwon, setBrokerageFeeManwon,
  legalFeeManwon, setLegalFeeManwon,
  otherCostManwon, setOtherCostManwon,
  askingPriceManwon,
}: AcquisitionCostSectionProps) {
  const taxPct = parseFloat(acquisitionTaxPct) || 0;
  const brokerage = parseFloat(brokerageFeeManwon) || 0;
  const legal = parseFloat(legalFeeManwon) || 0;
  const other = parseFloat(otherCostManwon) || 0;
  const price = askingPriceManwon ?? 0;

  const taxAmount = price > 0 ? Math.round(price * taxPct / 100) : 0;
  const totalManwon = taxAmount + brokerage + legal + other;
  const totalEok = totalManwon > 0 ? (totalManwon / 10000).toFixed(1) : null;

  const brokerageHint = price > 0 ? `참고: 매매가의 0.9% = ${(price * 0.009 / 10000).toFixed(1)}억` : '';

  return (
    <div className="col-span-2 mt-3 border-t border-emerald-500/30 pt-4 bg-emerald-500/5 p-3.5 rounded-xl space-y-3">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-bold text-emerald-300">💰 취득 비용</label>
        <span className="text-[10px] text-emerald-400/80 font-medium">매입 시 소요되는 부대비용</span>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className="block text-[11px] font-semibold text-muted-foreground mb-1">취득세율 (%)</label>
          <input
            type="number"
            step="0.1"
            placeholder="4.6"
            value={acquisitionTaxPct}
            onChange={(e) => setAcquisitionTaxPct(e.target.value)}
            className="w-full bg-secondary/50 border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
          />
          <p className="text-[10px] text-muted-foreground mt-0.5">개인 4.6% · 법인 12.4%</p>
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-muted-foreground mb-1">중개수수료 (만원)</label>
          <input
            type="number"
            placeholder="0"
            value={brokerageFeeManwon}
            onChange={(e) => setBrokerageFeeManwon(e.target.value)}
            className="w-full bg-secondary/50 border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
          />
          {brokerageHint && <p className="text-[10px] text-muted-foreground mt-0.5">{brokerageHint}</p>}
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-muted-foreground mb-1">법무사비 (만원)</label>
          <input
            type="number"
            placeholder="50"
            value={legalFeeManwon}
            onChange={(e) => setLegalFeeManwon(e.target.value)}
            className="w-full bg-secondary/50 border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-muted-foreground mb-1">기타 취득비용 (만원)</label>
          <input
            type="number"
            placeholder="0"
            value={otherCostManwon}
            onChange={(e) => setOtherCostManwon(e.target.value)}
            className="w-full bg-secondary/50 border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
          />
        </div>
      </div>
      {totalEok && (
        <div className="text-xs text-emerald-300 font-semibold text-right pt-1 border-t border-emerald-500/20">
          총 취득비용: ~{totalEok}억 원
          {taxAmount > 0 && <span className="text-[10px] text-muted-foreground ml-2">(취득세 {(taxAmount / 10000).toFixed(1)}억 포함)</span>}
        </div>
      )}
    </div>
  );
}