"use client";

import React, { useState, useMemo } from "react";
import { Calculator, TrendingUp, AlertTriangle } from "lucide-react";

interface RoiCalculatorProps {
  /** 매물 기본 매입가 (원, optional prefill) */
  defaultPrice?: number;
  accentColor?: string;
}

export function RoiCalculator({ defaultPrice, accentColor = "#6366f1" }: RoiCalculatorProps) {
  // ── 입력 슬라이더 상태 ──
  const [purchasePrice, setPurchasePrice] = useState(defaultPrice || 3000000000); // 30억 기본
  const [ltvRatio, setLtvRatio] = useState(60); // 대출비율 %
  const [interestRate, setInterestRate] = useState(4.5); // 금리 %
  const [deposit, setDeposit] = useState(500000000); // 보증금 5억
  const [monthlyRent, setMonthlyRent] = useState(15000000); // 월세 1,500만
  const [vacancyFloors, setVacancyFloors] = useState(0); // 공실 층수
  const [totalFloors, setTotalFloors] = useState(5); // 전체 층수

  // ── 핵심 산출 ──
  const result = useMemo(() => {
    const loanAmount = purchasePrice * (ltvRatio / 100);
    const equity = purchasePrice - loanAmount - deposit;
    const annualRent = monthlyRent * 12;
    const annualInterest = loanAmount * (interestRate / 100);
    const depositReturn = deposit * 0.03; // 보증금 운용이자 (3% 가정)

    // 공실 반영
    const occupancyRate = totalFloors > 0 ? (totalFloors - vacancyFloors) / totalFloors : 1;
    const effectiveRent = annualRent * occupancyRate;
    const effectiveDeposit = deposit * occupancyRate;

    // NOI (순영업소득)
    const managementCost = effectiveRent * 0.1; // 관리비 10% 가정
    const noi = effectiveRent + depositReturn * occupancyRate - managementCost;

    // Cap Rate
    const capRate = purchasePrice > 0 ? (noi / purchasePrice) * 100 : 0;

    // Cash-on-Cash Return (자기자본수익률)
    const netCashFlow = noi - annualInterest;
    const actualEquity = Math.max(purchasePrice - loanAmount - effectiveDeposit, 1);
    const cashOnCash = (netCashFlow / actualEquity) * 100;

    // 월 순현금흐름
    const monthlyCashFlow = netCashFlow / 12;

    return {
      loanAmount,
      equity: actualEquity,
      annualRent: effectiveRent,
      annualInterest,
      noi,
      capRate,
      cashOnCash,
      monthlyCashFlow,
      occupancyRate: occupancyRate * 100,
    };
  }, [purchasePrice, ltvRatio, interestRate, deposit, monthlyRent, vacancyFloors, totalFloors]);

  // ── 포맷 헬퍼 ──
  const fmtBil = (v: number) => `${(v / 100000000).toFixed(1)}억`;
  const fmtMan = (v: number) => `${(v / 10000).toFixed(0)}만`;
  const fmtPct = (v: number) => `${v.toFixed(2)}%`;

  // ── 색상 판정 ──
  const capColor = result.capRate >= 4 ? "#34d399" : result.capRate >= 3 ? "#fbbf24" : "#f87171";
  const cashColor = result.cashOnCash >= 6 ? "#34d399" : result.cashOnCash >= 3 ? "#fbbf24" : "#f87171";
  const flowColor = result.monthlyCashFlow >= 0 ? "#34d399" : "#f87171";

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center gap-2 mb-1">
        <Calculator className="w-4 h-4" style={{ color: accentColor }} />
        <span className="text-[13px] font-extrabold text-white">수지분석 계산기</span>
        <span className="text-[9px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 px-2 py-0.5 rounded-full font-bold ml-auto">
          실시간 시뮬레이션
        </span>
      </div>

      {/* 입력 슬라이더 그리드 */}
      <div className="grid grid-cols-2 gap-3">
        {/* 매입가 */}
        <SliderInput
          label="매입가"
          value={purchasePrice}
          onChange={setPurchasePrice}
          min={500000000}
          max={30000000000}
          step={100000000}
          format={fmtBil}
        />
        {/* 대출비율 */}
        <SliderInput
          label="대출비율 (LTV)"
          value={ltvRatio}
          onChange={setLtvRatio}
          min={0}
          max={80}
          step={5}
          format={(v) => `${v}%`}
        />
        {/* 금리 */}
        <SliderInput
          label="대출금리"
          value={interestRate}
          onChange={setInterestRate}
          min={2}
          max={8}
          step={0.1}
          format={(v) => `${v.toFixed(1)}%`}
        />
        {/* 보증금 */}
        <SliderInput
          label="보증금 합계"
          value={deposit}
          onChange={setDeposit}
          min={0}
          max={5000000000}
          step={50000000}
          format={fmtBil}
        />
        {/* 월세 */}
        <SliderInput
          label="월세 합계"
          value={monthlyRent}
          onChange={setMonthlyRent}
          min={0}
          max={100000000}
          step={500000}
          format={fmtMan}
        />
        {/* 공실 스트레스 */}
        <SliderInput
          label={`공실 (전체 ${totalFloors}층)`}
          value={vacancyFloors}
          onChange={setVacancyFloors}
          min={0}
          max={totalFloors}
          step={1}
          format={(v) => `${v}층 공실`}
          danger={vacancyFloors > 0}
        />
      </div>

      {/* ── 결과 카드 ── */}
      <div className="grid grid-cols-3 gap-2">
        <ResultCard
          label="연 순수익률"
          sublabel="Cap Rate"
          value={fmtPct(result.capRate)}
          color={capColor}
        />
        <ResultCard
          label="자기자본수익률"
          sublabel="Cash-on-Cash"
          value={fmtPct(result.cashOnCash)}
          color={cashColor}
        />
        <ResultCard
          label="월 순현금흐름"
          sublabel="Net Cash Flow"
          value={fmtMan(result.monthlyCashFlow)}
          color={flowColor}
        />
      </div>

      {/* 공실 경고 */}
      {vacancyFloors > 0 && (
        <div className="flex items-start gap-2 bg-red-500/5 border border-red-500/15 rounded-lg p-2.5">
          <AlertTriangle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
          <div className="text-[10px] text-red-300/80 leading-relaxed">
            <span className="font-bold">{vacancyFloors}개 층 공실 시</span> 가동률 {result.occupancyRate.toFixed(0)}%,
            Cap Rate {fmtPct(result.capRate)}로 하락합니다.
            {result.monthlyCashFlow < 0 && (
              <span className="text-red-400 font-bold"> 월 {fmtMan(Math.abs(result.monthlyCashFlow))} 적자 발생!</span>
            )}
          </div>
        </div>
      )}

      {/* 상세 내역 */}
      <details className="group">
        <summary className="text-[10px] text-slate-600 cursor-pointer hover:text-slate-400 transition-colors">
          상세 내역 펼치기 ▾
        </summary>
        <div className="mt-2 space-y-1 text-[10px] text-slate-500">
          <div className="flex justify-between"><span>대출금</span><span>{fmtBil(result.loanAmount)}</span></div>
          <div className="flex justify-between"><span>자기자본</span><span>{fmtBil(result.equity)}</span></div>
          <div className="flex justify-between"><span>연 임대수입 (공실 반영)</span><span>{fmtBil(result.annualRent)}</span></div>
          <div className="flex justify-between"><span>연 대출이자</span><span>{fmtBil(result.annualInterest)}</span></div>
          <div className="flex justify-between"><span>NOI (순영업소득)</span><span className="font-bold text-slate-300">{fmtBil(result.noi)}</span></div>
        </div>
      </details>

      <p className="text-[8px] text-slate-700 text-center">
        ※ 본 시뮬레이션은 참고용이며, 관리비 10%·보증금 운용이자 3% 가정이 적용됩니다.
      </p>
    </div>
  );
}

// ── 슬라이더 입력 컴포넌트 ──
function SliderInput({
  label, value, onChange, min, max, step, format, danger,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  danger?: boolean;
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between">
        <span className="text-[10px] text-slate-500">{label}</span>
        <span className={`text-[10px] font-bold ${danger ? "text-red-400" : "text-white"}`}>
          {format(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1 bg-slate-700 rounded-full appearance-none cursor-pointer
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
          [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-md"
      />
    </div>
  );
}

// ── 결과 카드 ──
function ResultCard({
  label, sublabel, value, color,
}: {
  label: string;
  sublabel: string;
  value: string;
  color: string;
}) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-2.5 text-center space-y-0.5">
      <p className="text-[9px] text-slate-500">{label}</p>
      <p className="text-[16px] font-black" style={{ color }}>{value}</p>
      <p className="text-[8px] text-slate-600">{sublabel}</p>
    </div>
  );
}
