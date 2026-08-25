"use client";

import React from "react";

const SELLER_MOTIVES = [
  { value: "", label: "선택" },
  { value: "debt_pressure", label: "채무 상환 압박" },
  { value: "portfolio_rebalance", label: "포트폴리오 재편" },
  { value: "estate_settlement", label: "상속/유산 정리" },
  { value: "business_closure", label: "사업 폐업/청산" },
  { value: "relocation", label: "이전/재배치" },
  { value: "profit_taking", label: "차익 실현" },
  { value: "other", label: "기타" },
] as const;

interface HoldingHistorySectionProps {
  investmentPosture: string;
  acquisitionDate: string;
  setAcquisitionDate: (v: string) => void;
  acquisitionPriceManwon: string;
  setAcquisitionPriceManwon: (v: string) => void;
  holdingMonths: string;
  setHoldingMonths: (v: string) => void;
  transferCountIn10Y: string;
  setTransferCountIn10Y: (v: string) => void;
  sellerMotive: string;
  setSellerMotive: (v: string) => void;
}

export function HoldingHistorySection({
  investmentPosture,
  acquisitionDate, setAcquisitionDate,
  acquisitionPriceManwon, setAcquisitionPriceManwon,
  holdingMonths, setHoldingMonths,
  transferCountIn10Y, setTransferCountIn10Y,
  sellerMotive, setSellerMotive,
}: HoldingHistorySectionProps) {
  if (investmentPosture !== "trading") return null;

  return (
    <div className="border border-orange-500/30 rounded-xl p-4 bg-orange-500/5 space-y-3">
      <div className="flex justify-between items-center border-b border-orange-500/20 pb-2">
        <span className="text-xs font-bold text-orange-300">📈 보유 이력 (단기매매)</span>
        <span className="text-[10px] text-orange-400/80 font-medium">Grade A 승격 필수</span>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className="block text-[10px] text-muted-foreground mb-1">매입일</label>
          <input
            type="date"
            value={acquisitionDate}
            onChange={(e) => setAcquisitionDate(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
          />
        </div>
        <div>
          <label className="block text-[10px] text-muted-foreground mb-1">매입가 (만원)</label>
          <input
            type="number"
            placeholder="예: 350000"
            value={acquisitionPriceManwon}
            onChange={(e) => setAcquisitionPriceManwon(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
          />
        </div>
        <div>
          <label className="block text-[10px] text-muted-foreground mb-1">보유 개월 수</label>
          <input
            type="number"
            placeholder="예: 24"
            value={holdingMonths}
            onChange={(e) => setHoldingMonths(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
          />
        </div>
        <div>
          <label className="block text-[10px] text-muted-foreground mb-1">10년 내 양도 횟수</label>
          <input
            type="number"
            placeholder="예: 1"
            value={transferCountIn10Y}
            onChange={(e) => setTransferCountIn10Y(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-[10px] text-muted-foreground mb-1">매도 사유</label>
          <select
            value={sellerMotive}
            onChange={(e) => setSellerMotive(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
          >
            {SELLER_MOTIVES.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
