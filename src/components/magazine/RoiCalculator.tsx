"use client";

import React, { useId, useMemo, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { GLOSSARY, formatManwonInt, formatPriceKo, formatSignedManwon } from "@/lib/magazine/view-helpers";
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

/**
 * 한국어 금액 입력 파서 (U-F1-12: 억 단위 숫자 반환).
 * - '50' → 50
 * - '25억', '25.5억' → 25, 25.5
 * - '1억 5천', '1억 5천만', '1억 5,000만원' → 1.5
 * - '3,200,000,000' (1억 이상 원 단위 숫자) → 32
 * - '3,500만원' → 0.35
 */
export function parseKoreanEokInput(raw: unknown): number | null {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw < 0) return null;
    if (raw >= 100_000_000) return Math.round((raw / 100_000_000) * 100) / 100;
    if (raw >= 10_000) return Math.round((raw / 100_000_000) * 100) / 100;
    return raw;
  }
  if (typeof raw !== "string") return null;
  const cleaned = raw.replace(/,/g, "").replace(/원/g, "").trim();
  if (!cleaned) return null;

  // '1억 5천', '25억', '25.5억', '1억 5000만' 등
  if (cleaned.includes("억")) {
    const m = cleaned.match(/^(\d+(?:\.\d+)?)\s*억(?:\s*(\d+(?:\.\d+)?)\s*(천만|천|백만|백|만)?)?$/);
    if (!m) return null;
    let eok = Number(m[1]);
    if (!Number.isFinite(eok)) return null;
    if (m[2] !== undefined) {
      const sub = Number(m[2]);
      const unit = m[3] || "";
      if (Number.isFinite(sub)) {
        if (unit === "천" || unit === "천만") eok += sub * 0.1;
        else if (unit === "백" || unit === "백만") eok += sub * 0.01;
        else if (unit === "만" || sub >= 100) eok += sub / 10_000;
        else eok += sub * 0.1;
      }
    }
    return Math.round(eok * 100) / 100;
  }

  // '5천만', '5천' (억 없이 천만 단위)
  const cheonMatch = cleaned.match(/^(\d+(?:\.\d+)?)\s*천만?$/);
  if (cheonMatch) {
    return Math.round(Number(cheonMatch[1]) * 0.1 * 100) / 100;
  }

  // '3500만' (억 없이 만 단위)
  const manMatch = cleaned.match(/^(\d+(?:\.\d+)?)\s*만$/);
  if (manMatch) {
    return Math.round((Number(manMatch[1]) / 10_000) * 100) / 100;
  }

  // 순수 숫자 ('50', '25.5', '3200000000')
  const num = Number(cleaned);
  if (!Number.isFinite(num) || num < 0) return null;
  if (num >= 100_000_000) {
    return Math.round((num / 100_000_000) * 100) / 100;
  }
  if (num >= 10_000) {
    return Math.round((num / 100_000_000) * 100) / 100;
  }
  return Math.round(num * 100) / 100;
}

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
        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-caption font-bold text-emerald-300">
          실시간 시뮬레이션
        </span>
      </div>

      {/* 총 층수 직접 입력 (T3-46) */}
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="roi-total-floors" className="inline-flex min-h-12 min-w-12 items-center text-label font-semibold text-ink-muted">
          전체 층수
        </label>
        <span className="flex items-center gap-1.5">
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
            className="min-h-12 w-20 rounded-lg border border-white/15 bg-white/5 px-2.5 text-right text-reader font-bold text-white"
          />
          <span className="text-caption text-ink-muted">층</span>
        </span>
      </div>

      {/* 입력 슬라이더 */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
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
          useKoreanEokParser
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
          useKoreanEokParser
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

      {/* 결과 카드 — 자식 순서 고정: [label p] → [값 p] → [tone p] → [<p>sub</p>] → [한글 보조 span] */}
      <div className="grid grid-cols-3 gap-2" aria-live="polite">
        <ResultCard label="연 순수익률" sub="Cap Rate" helperKo="(연 임대수익률)" value={pct(result.capRate)} tone={capTone} />
        <ResultCard label="자기자본수익률" sub="Cash-on-Cash" helperKo="(실투자금 대비)" value={pct(result.cashOnCash)} tone={cashTone} />
        <ResultCard
          label="월 순현금흐름"
          sub="Net Cash Flow"
          helperKo="(이자 공제 후)"
          value={formatSignedManwon(result.monthlyCashFlow)}
          tone={flowTone}
        />
      </div>

      {/* 용어 설명 (탭하면 펼침 — 48px 높이, keep-all) */}
      <div className="space-y-2">
        <span className="block text-caption font-semibold text-ink-muted">용어 설명 (누르면 뜻이 펼쳐집니다):</span>
        <div className="flex flex-wrap items-start gap-2">
          <RoiGlossaryButton term="Cap Rate" />
          <RoiGlossaryButton term="Cash-on-Cash" />
          <RoiGlossaryButton term="NOI" />
        </div>
      </div>

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
        <summary className="flex min-h-12 cursor-pointer items-center text-label font-semibold text-ink-muted hover:text-white">
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

      {/* 면책 + 핵심 가정 (14px 이상 · 대비 4.5:1 이상, T3-27) */}
      <p className="text-sm leading-relaxed text-slate-300" data-testid="roi-disclaimer">
        ※ 참고용 시뮬레이션이며 투자 자문이 아닙니다. 핵심 가정: 관리비는 임대수입의 {mgmtPct}%, 보증금 운용이자는 연{" "}
        {depositPct}%로 계산하며, 취득세·양도세 등 세금과 원금 상환은 포함하지 않습니다.
      </p>
    </div>
  );
}

function RoiGlossaryButton({ term }: { term: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const description = GLOSSARY[term];
  if (!description) return null;

  return (
    <div className="inline-block">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`${term} 설명 ${open ? "닫기" : "보기"}`}
        onClick={() => setOpen((v) => !v)}
        style={{ wordBreak: "keep-all" }}
        className="inline-flex min-h-12 cursor-pointer items-center justify-center rounded-xl border border-white/15 bg-white/[0.04] px-3.5 py-2.5 text-[15px] font-semibold whitespace-nowrap text-indigo-200 underline decoration-dotted decoration-indigo-300/60 underline-offset-4 hover:bg-white/[0.08] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300"
      >
        {term}
      </button>
      <span
        id={id}
        role="note"
        hidden={!open}
        className="mt-1.5 block rounded-xl border border-white/15 bg-slate-900 px-3.5 py-2.5 text-caption font-normal leading-relaxed text-ink-muted"
      >
        <strong className="text-white">{term}</strong> — {description}
      </span>
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

// ── 슬라이더 + 직접 입력 + 48×48 미세조절 스테퍼 ──
function SliderInput({
  id, label, value, onChange, min, max, step, scale, unit, decimals = 0, format, danger, accent, useKoreanEokParser = false,
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
  useKoreanEokParser?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const shown = draft ?? String(Number((value / scale).toFixed(decimals === 0 && scale > 1 ? 1 : decimals)));
  const fill = max > min ? Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100)) : 0;

  const commit = () => {
    if (draft === null) return;
    const rawTrimmed = draft.trim();
    if (!rawTrimmed) {
      setDraft(null);
      return;
    }

    if (useKoreanEokParser) {
      const parsedEok = parseKoreanEokInput(rawTrimmed);
      if (parsedEok === null) {
        setNotice("숫자 또는 '25억' 형식으로 입력해 주세요");
        setDraft(null);
        return;
      }
      const rawNum = Number(rawTrimmed.replace(/,/g, "").replace(/원/g, "").trim());
      const wasWonScale = Number.isFinite(rawNum) && rawNum >= 100_000_000;
      const targetWon = parsedEok * scale;
      const clamped = clampInput(targetWon, min, max);
      if (clamped !== null) {
        onChange(clamped);
        const minEok = min / scale;
        const maxEok = max / scale;
        if (targetWon < min) {
          setNotice(`입력하신 금액을 최소 기준인 ${minEok}억 원으로 맞추었습니다`);
        } else if (targetWon > max) {
          setNotice(`입력하신 금액을 최대 기준인 ${maxEok}억 원으로 맞추었습니다`);
        } else if (wasWonScale) {
          setNotice(`원 단위 입력(${parsedEok}억 원)으로 자동 변환했습니다`);
        } else {
          setNotice(null);
        }
      }
      setDraft(null);
      return;
    }

    const cleaned = rawTrimmed.replace(/,/g, "").replace(/만원|만|원|%|층/g, "").trim();
    const n = Number(cleaned);
    if (!Number.isFinite(n)) {
      setDraft(null);
      return;
    }
    const rawScaled = unit === "만원" && n >= 100_000 ? n : n * scale;
    const c = clampInput(rawScaled, min, max);
    if (c !== null) {
      onChange(c);
      setNotice(null);
    }
    setDraft(null);
  };

  const stepBy = (delta: number) => {
    setDraft(null);
    setNotice(null);
    const nextRaw = value + delta;
    const rounded = decimals > 0 ? Number(nextRaw.toFixed(decimals)) : Math.round(nextRaw);
    const c = clampInput(rounded, min, max);
    if (c !== null) onChange(c);
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={`${id}-range`} className="inline-flex min-h-12 min-w-12 items-center text-label font-semibold text-ink-muted">
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
            className={`min-h-12 w-20 rounded-lg border bg-white/5 px-2 text-right text-reader font-bold ${
              danger ? "border-red-400/50 text-red-200" : "border-white/15 text-white"
            }`}
          />
          <span className="text-caption text-ink-muted">{unit}</span>
        </span>
      </div>
      {notice && (
        <p role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[15px] font-medium leading-snug text-amber-200">
          {notice}
        </p>
      )}
      {/* 48px 터치 트랙 + 좌우 48×48px [−] [+] 미세조절 스테퍼 */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`${label} 감소`}
          onClick={() => stepBy(-step)}
          className="inline-flex h-12 min-h-12 w-12 min-w-12 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/[0.05] text-title font-bold text-slate-200 hover:bg-white/10 active:scale-95"
        >
          −
        </button>
        <div className="relative flex h-12 flex-1 items-center">
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-slate-600">
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
            onChange={(e) => {
              setDraft(null);
              setNotice(null);
              onChange(Number(e.target.value));
            }}
            className="relative z-10 h-12 w-full cursor-pointer appearance-none bg-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white"
          />
        </div>
        <button
          type="button"
          aria-label={`${label} 증가`}
          onClick={() => stepBy(step)}
          className="inline-flex h-12 min-h-12 w-12 min-w-12 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/[0.05] text-title font-bold text-slate-200 hover:bg-white/10 active:scale-95"
        >
          +
        </button>
      </div>
    </div>
  );
}

// ── 결과 카드 — 자식 순서 고정: [값 엘리먼트] → [tone 엘리먼트] → [<p>sub</p>] → [<span>한글 보조</span>] ──
function ResultCard({
  label, sub, helperKo, value, tone,
}: {
  label: string;
  sub: React.ReactNode;
  helperKo?: string;
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
      {helperKo && <span className="block text-caption text-ink-subtle">{helperKo}</span>}
    </div>
  );
}
