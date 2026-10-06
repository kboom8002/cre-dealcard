"use client";

import React, { useMemo, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { formatManwonInt, formatPriceKo, formatSignedManwon } from "@/lib/magazine/view-helpers";
import { GlossaryTerm } from "@/components/magazine/GlossaryTerm";
import {
  ROI_ASSUMPTIONS,
  ROI_DEFAULTS,
  TOTAL_FLOORS_MAX,
  TOTAL_FLOORS_MIN,
  clampInput,
  computeRoi,
  type RoiInputs,
} from "@/components/magazine/roi-calc";

interface RoiCalculatorProps {
  /** 매물 기본 매입가 (원, optional prefill) */
  defaultPrice?: number;
  accentColor?: string;
  /** 사용자가 입력 필드를 처음 조작할 때(필드별 1회) 호출 — 분석 trackClick 연결용 */
  onInteract?: (field: string) => void;
}

const pct = (v: number) => `${v.toFixed(2)}%`;
const mgmtPct = Math.round(ROI_ASSUMPTIONS.managementCostRate * 100);
const depositPct = Math.round(ROI_ASSUMPTIONS.depositReturnRate * 100);

export function RoiCalculator({ defaultPrice, accentColor = "#6366f1", onInteract }: RoiCalculatorProps) {
  const [inputs, setInputs] = useState<RoiInputs>({
    ...ROI_DEFAULTS,
    purchasePrice: defaultPrice || ROI_DEFAULTS.purchasePrice,
  });
  const touched = useRef<Set<string>>(new Set());

  // 이벤트 핸들러에서만 호출된다(렌더 중 호출 금지 — react-hooks/refs). 계산 결과 불변.
  const update = <K extends keyof RoiInputs>(key: K, v: number) => {
    if (!touched.current.has(key)) {
      touched.current.add(key);
      onInteract?.(key);
    }
    setInputs((prev) => ({ ...prev, [key]: v }));
  };

  const setTotalFloors = (v: number) => {
    const total = Math.round(v);
    if (!touched.current.has("totalFloors")) {
      touched.current.add("totalFloors");
      onInteract?.("totalFloors");
    }
    setInputs((prev) => ({ ...prev, totalFloors: total, vacancyFloors: Math.min(prev.vacancyFloors, total) }));
  };

  // 계산 엔진은 roi-calc.ts(순수 함수) — 식 변경 금지
  const result = useMemo(() => computeRoi(inputs), [inputs]);
  const { vacancyFloors, totalFloors } = inputs;

  // 색은 보조 — 모든 지표는 숫자/부호/라벨 텍스트로도 구분된다
  const capTone = result.capRate >= 4 ? { c: "#34d399", t: "양호" } : result.capRate >= 3 ? { c: "#fbbf24", t: "보통" } : { c: "#f87171", t: "낮음" };
  const cashTone = result.cashOnCash >= 6 ? { c: "#34d399", t: "양호" } : result.cashOnCash >= 3 ? { c: "#fbbf24", t: "보통" } : { c: "#f87171", t: "낮음" };
  const flowTone = result.monthlyCashFlow >= 0 ? { c: "#34d399", t: "흑자" } : { c: "#f87171", t: "적자" };

  return (
    <div className="space-y-4">
      {/* 헤더: 제목은 바깥 SectionCard 가 이미 표시하므로(중복 방지) 시뮬레이션 배지만 둔다 */}
      <div className="flex items-center justify-end">
        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-caption font-bold text-emerald-300">
          실시간 시뮬레이션
        </span>
      </div>

      {/* 총 층수 직접 입력 (T3-46) */}
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="roi-total-floors" className="text-caption text-ink-muted">
          전체 층수
        </label>
        <span className="flex items-center gap-1">
          <input
            id="roi-total-floors"
            type="number"
            inputMode="numeric"
            min={TOTAL_FLOORS_MIN}
            max={TOTAL_FLOORS_MAX}
            step={1}
            value={totalFloors}
            onChange={(e) => {
              const c = clampInput(Number(e.target.value), TOTAL_FLOORS_MIN, TOTAL_FLOORS_MAX);
              if (c !== null) setTotalFloors(c);
            }}
            className="min-h-11 w-20 rounded-lg border border-white/15 bg-white/5 px-2 text-right text-reader font-bold text-white"
          />
          <span className="text-caption text-ink-muted">층</span>
        </span>
      </div>

      {/* 입력 슬라이더 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <SliderInput
          id="roi-price"
          label="매입가"
          value={inputs.purchasePrice}
          onChange={(v) => update("purchasePrice", v)}
          min={500_000_000}
          max={30_000_000_000}
          step={100_000_000}
          scale={100_000_000}
          unit="억"
          format={formatPriceKo}
          accent={accentColor}
        />
        <SliderInput
          id="roi-ltv"
          label="대출비율 (LTV)"
          value={inputs.ltvRatio}
          onChange={(v) => update("ltvRatio", v)}
          min={0}
          max={80}
          step={5}
          scale={1}
          unit="%"
          format={(v) => `${v}%`}
          accent={accentColor}
        />
        <SliderInput
          id="roi-rate"
          label="대출금리"
          value={inputs.interestRate}
          onChange={(v) => update("interestRate", v)}
          min={2}
          max={8}
          step={0.1}
          scale={1}
          decimals={1}
          unit="%"
          format={(v) => `${v.toFixed(1)}%`}
          accent={accentColor}
        />
        <SliderInput
          id="roi-deposit"
          label="보증금 합계"
          value={inputs.deposit}
          onChange={(v) => update("deposit", v)}
          min={0}
          max={5_000_000_000}
          step={50_000_000}
          scale={100_000_000}
          unit="억"
          format={(v) => (v === 0 ? "0원" : formatPriceKo(v))}
          accent={accentColor}
        />
        <SliderInput
          id="roi-rent"
          label="월세 합계"
          value={inputs.monthlyRent}
          onChange={(v) => update("monthlyRent", v)}
          min={0}
          max={100_000_000}
          step={500_000}
          scale={10_000}
          unit="만원"
          format={(v) => formatManwonInt(v)}
          accent={accentColor}
        />
        <SliderInput
          id="roi-vacancy"
          label={`공실 (전체 ${totalFloors}층)`}
          value={vacancyFloors}
          onChange={(v) => update("vacancyFloors", v)}
          min={0}
          max={totalFloors}
          step={1}
          scale={1}
          unit="층"
          format={(v) => `${v}층 공실`}
          danger={vacancyFloors > 0}
          accent={accentColor}
        />
      </div>

      {/* 결과 카드 */}
      <div className="grid grid-cols-3 gap-2" aria-live="polite">
        <ResultCard label="연 순수익률" sub="Cap Rate" value={pct(result.capRate)} tone={capTone} />
        <ResultCard label="자기자본수익률" sub="Cash-on-Cash" value={pct(result.cashOnCash)} tone={cashTone} />
        <ResultCard
          label="월 순현금흐름"
          sub="Net Cash Flow"
          value={formatSignedManwon(result.monthlyCashFlow)}
          tone={flowTone}
        />
      </div>

      {/* 용어 설명 (탭하면 펼침) */}
      <p className="text-caption leading-relaxed text-ink-muted">
        용어: <GlossaryTerm term="Cap Rate" /> · <GlossaryTerm term="Cash-on-Cash" /> · <GlossaryTerm term="NOI" />
      </p>

      {/* 공실 경고 (아이콘 + 텍스트) */}
      {vacancyFloors > 0 && (
        <div role="status" className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-300" aria-hidden="true" />
          <p className="text-caption leading-relaxed text-red-200">
            <span className="font-bold">{vacancyFloors}개 층 공실 시</span> 가동률 {result.occupancyRate.toFixed(0)}%,
            Cap Rate {pct(result.capRate)}로 하락합니다.
            {result.monthlyCashFlow < 0 && (
              <span className="font-bold"> 월 {formatManwonInt(Math.abs(result.monthlyCashFlow))} 적자가 발생합니다.</span>
            )}
          </p>
        </div>
      )}

      {/* 상세 내역 */}
      <details className="group">
        <summary className="flex min-h-11 cursor-pointer items-center text-caption text-ink-muted hover:text-white">
          상세 내역 펼치기 ▾
        </summary>
        <dl className="mt-1 space-y-1.5 text-caption text-ink-muted">
          <Row dt="대출금" dd={formatPriceKo(result.loanAmount)} />
          <Row dt="자기자본" dd={formatPriceKo(result.equity)} />
          <Row dt="연 임대수입 (공실 반영)" dd={formatPriceKo(result.annualRent)} />
          <Row dt="연 대출이자" dd={formatPriceKo(result.annualInterest)} />
          <Row
            dt="NOI (순영업소득)"
            dd={<span className="font-bold text-white">{formatManwonInt(result.noi)}</span>}
          />
        </dl>
      </details>

      {/* 면책 + 핵심 가정 (12px · 대비 4.5:1 이상, T3-27) */}
      <p className="text-caption leading-relaxed text-ink-muted" data-testid="roi-disclaimer">
        ※ 참고용 시뮬레이션이며 투자 자문이 아닙니다. 핵심 가정: 관리비는 임대수입의 {mgmtPct}%, 보증금 운용이자는 연{" "}
        {depositPct}%로 계산하며, 취득세·양도세 등 세금과 원금 상환은 포함하지 않습니다.
      </p>
    </div>
  );
}

function Row({ dt, dd }: { dt: React.ReactNode; dd: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt>{dt}</dt>
      <dd>{dd}</dd>
    </div>
  );
}

// ── 슬라이더 + 직접 입력 ──
function SliderInput({
  id, label, value, onChange, min, max, step, scale, unit, decimals = 0, format, danger, accent,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  /** 표시 단위당 실제 값 (예: 억 → 100,000,000) */
  scale: number;
  unit: string;
  decimals?: number;
  format: (v: number) => string;
  danger?: boolean;
  accent: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(Number((value / scale).toFixed(decimals === 0 && scale > 1 ? 1 : decimals)));
  const fill = max > min ? Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100)) : 0;

  const commit = () => {
    if (draft === null) return;
    const n = Number(draft.replace(/,/g, ""));
    const c = clampInput(n * scale, min, max);
    if (c !== null) onChange(c);
    setDraft(null);
  };

  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={`${id}-range`} className="text-caption text-ink-muted">
          {label}
        </label>
        <span className="flex items-center gap-1">
          <input
            id={`${id}-num`}
            type="text"
            inputMode="decimal"
            aria-label={`${label} 직접 입력 (${unit})`}
            value={shown}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
            }}
            className={`min-h-11 w-20 rounded-lg border bg-white/5 px-2 text-right text-reader font-bold ${
              danger ? "border-red-400/50 text-red-200" : "border-white/15 text-white"
            }`}
          />
          <span className="text-caption text-ink-muted">{unit}</span>
        </span>
      </div>
      {/* 44px 터치 트랙: 투명 h-11 input + 24px thumb, 시각적 바는 별도 레이어 */}
      <div className="relative flex h-11 items-center">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-slate-600">
          <div className="h-full rounded-full" style={{ width: `${fill}%`, background: danger ? "#f87171" : accent }} />
        </div>
        <input
          id={`${id}-range`}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={label}
          aria-valuetext={format(value)}
          onChange={(e) => onChange(Number(e.target.value))}
          className="relative z-10 h-11 w-full cursor-pointer appearance-none bg-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white"
        />
      </div>
    </div>
  );
}

// ── 결과 카드 ──
function ResultCard({
  label, sub, value, tone,
}: {
  label: string;
  sub: React.ReactNode;
  value: string;
  tone: { c: string; t: string };
}) {
  return (
    <div className="space-y-0.5 rounded-xl border border-white/10 bg-white/[0.03] p-2.5 text-center">
      <p className="text-caption text-ink-muted">{label}</p>
      <p className="text-title font-black" style={{ color: tone.c }}>
        {value}
      </p>
      <p className="text-caption font-bold text-ink-muted">{tone.t}</p>
      <p className="text-caption text-ink-subtle">{sub}</p>
    </div>
  );
}
