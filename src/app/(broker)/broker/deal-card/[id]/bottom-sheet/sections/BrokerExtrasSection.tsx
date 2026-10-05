"use client";

import React from "react";
import {
  BROKER_EXTRAS_LIMITS as L,
  REGULATORY_KINDS,
  REGULATORY_KIND_LABELS,
  type BrokerCompRowForm,
  type BrokerExtrasFormState,
  type BrokerRegulatoryRowForm,
} from "@/domain/building/mobile-im/broker-extras";

type SetForm = React.Dispatch<React.SetStateAction<BrokerExtrasFormState>>;

const INPUT_CLASS =
  "text-[11px] px-2 py-1.5 rounded-lg border border-border/60 bg-secondary/30 text-foreground placeholder-muted-foreground/50 focus:border-primary/50 focus:outline-none";
const LABEL_CLASS = "text-[11px] font-semibold text-muted-foreground";

function lineCount(text: string): number {
  return (text ?? "").split(/\r?\n/).filter((s) => s.trim().length > 0).length;
}

/** 입력된 항목 수 (배지용) — 목표 임대료는 별도 입력이라 제외 */
export function countBrokerExtrasFormFilled(f: BrokerExtrasFormState): number {
  return (
    lineCount(f.investmentPointsText) +
    (f.closingLine.trim() ? 1 : 0) +
    f.regulatoryRows.filter((r) => r.detail.trim()).length +
    f.compRows.filter((c) => c.location.trim()).length +
    (f.locationNote.trim() ? 1 : 0) +
    lineCount(f.postAcquisitionPlanText)
  );
}

interface BrokerExtrasSectionProps {
  form: BrokerExtrasFormState;
  setForm: SetForm;
}

/**
 * D4: 중개인 추가 정보 (선택) — 접이식 그룹. 입력한 내용은 원문 그대로 IM 에 반영된다(AI 미관여).
 * 한도는 broker-extras.ts (BROKER_EXTRAS_LIMITS) 단일 소스.
 */
export function BrokerExtrasSection({ form, setForm }: BrokerExtrasSectionProps) {
  const filled = countBrokerExtrasFormFilled(form);
  const patch = (p: Partial<BrokerExtrasFormState>) => setForm((prev) => ({ ...prev, ...p }));

  const updateReg = (i: number, p: Partial<BrokerRegulatoryRowForm>) =>
    setForm((prev) => ({
      ...prev,
      regulatoryRows: prev.regulatoryRows.map((r, idx) => (idx === i ? { ...r, ...p } : r)),
    }));
  const updateComp = (i: number, p: Partial<BrokerCompRowForm>) =>
    setForm((prev) => ({
      ...prev,
      compRows: prev.compRows.map((c, idx) => (idx === i ? { ...c, ...p } : c)),
    }));

  return (
    <details
      data-testid="broker-extras-section"
      className="col-span-2 rounded-xl border border-border/40 bg-secondary/10 p-3 group"
    >
      <summary
        data-testid="broker-extras-summary"
        className="cursor-pointer select-none flex items-center justify-between gap-2 text-xs font-semibold text-muted-foreground"
      >
        <span>중개인 추가 정보 (선택)</span>
        <span
          data-testid="broker-extras-badge"
          className={`text-[10px] px-1.5 py-0.5 rounded ${
            filled > 0 ? "bg-primary/10 text-primary" : "bg-secondary/40 text-muted-foreground/60"
          }`}
        >
          {filled > 0 ? `${filled}개 입력됨` : "입력 없음"}
        </span>
      </summary>

      <p className="mt-2 text-[10px] text-muted-foreground/70">
        입력한 내용은 <b>중개인 입력</b>으로 표기되어 원문 그대로 IM 에 반영됩니다 (AI 가 다시 쓰지 않습니다).
      </p>

      <div className="mt-3 space-y-4">
        {/* ── 투자 포인트 + 마무리 한줄 ── */}
        <div className="space-y-1.5">
          <label className={LABEL_CLASS}>
            투자 포인트 (줄바꿈으로 구분, 최대 {L.investmentPointsMax}개 · 각 {L.investmentPointChars}자)
          </label>
          <textarea
            data-testid="broker-extras-investment-points"
            value={form.investmentPointsText}
            onChange={(e) => patch({ investmentPointsText: e.target.value })}
            rows={4}
            placeholder={"한 줄에 하나씩 입력하세요"}
            className={`w-full ${INPUT_CLASS}`}
          />
          <div className="text-[10px] text-muted-foreground/60 text-right">
            {lineCount(form.investmentPointsText)}/{L.investmentPointsMax}
          </div>
          <input
            data-testid="broker-extras-closing-line"
            type="text"
            value={form.closingLine}
            maxLength={L.closingLineChars + 20}
            onChange={(e) => patch({ closingLine: e.target.value })}
            placeholder={`마무리 한줄 (최대 ${L.closingLineChars}자)`}
            className={`w-full ${INPUT_CLASS}`}
          />
        </div>

        {/* ── 규제·계획 메모 ── */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className={LABEL_CLASS}>규제·계획 메모 (최대 {L.regulatoryNotesMax}건)</label>
            {form.regulatoryRows.length < L.regulatoryNotesMax && (
              <button
                type="button"
                data-testid="broker-extras-reg-add"
                onClick={() =>
                  setForm((prev) => ({
                    ...prev,
                    regulatoryRows: [
                      ...prev.regulatoryRows,
                      { kind: "district_plan", detail: "", basis: "", restricted_acts: "", period: "" },
                    ],
                  }))
                }
                className="text-[10px] text-primary hover:text-primary/80 font-medium"
              >
                + 추가
              </button>
            )}
          </div>
          {form.regulatoryRows.map((r, i) => (
            <div key={i} className="rounded-lg border border-border/30 bg-background/50 p-2 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <select
                  data-testid={`broker-extras-reg-kind-${i}`}
                  value={r.kind}
                  onChange={(e) => updateReg(i, { kind: e.target.value as BrokerRegulatoryRowForm["kind"] })}
                  className={INPUT_CLASS}
                >
                  {REGULATORY_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {REGULATORY_KIND_LABELS[k]}
                    </option>
                  ))}
                </select>
                <input
                  data-testid={`broker-extras-reg-detail-${i}`}
                  type="text"
                  value={r.detail}
                  maxLength={L.regDetailChars + 20}
                  onChange={(e) => updateReg(i, { detail: e.target.value })}
                  placeholder={`내용 (최대 ${L.regDetailChars}자)`}
                  className={`flex-1 min-w-0 ${INPUT_CLASS}`}
                />
                <button
                  type="button"
                  data-testid={`broker-extras-reg-remove-${i}`}
                  onClick={() =>
                    setForm((prev) => ({ ...prev, regulatoryRows: prev.regulatoryRows.filter((_, idx) => idx !== i) }))
                  }
                  className="text-[10px] text-rose-400 hover:text-rose-300 shrink-0"
                >
                  삭제
                </button>
              </div>
              {r.kind === "dev_restriction" && (
                <div className="grid grid-cols-1 gap-1.5">
                  <input
                    data-testid={`broker-extras-reg-basis-${i}`}
                    type="text"
                    value={r.basis}
                    maxLength={L.regBasisChars + 20}
                    onChange={(e) => updateReg(i, { basis: e.target.value })}
                    placeholder={`근거 (예: 고시 번호, 최대 ${L.regBasisChars}자)`}
                    className={INPUT_CLASS}
                  />
                  <input
                    data-testid={`broker-extras-reg-acts-${i}`}
                    type="text"
                    value={r.restricted_acts}
                    maxLength={L.regRestrictedActsChars + 20}
                    onChange={(e) => updateReg(i, { restricted_acts: e.target.value })}
                    placeholder={`제한행위 (최대 ${L.regRestrictedActsChars}자)`}
                    className={INPUT_CLASS}
                  />
                  <input
                    data-testid={`broker-extras-reg-period-${i}`}
                    type="text"
                    value={r.period}
                    maxLength={L.regPeriodChars + 20}
                    onChange={(e) => updateReg(i, { period: e.target.value })}
                    placeholder={`기한 (최대 ${L.regPeriodChars}자)`}
                    className={INPUT_CLASS}
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── 인근 시세 비교 ── */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className={LABEL_CLASS}>인근 시세 비교 (최대 {L.marketCompsMax}행)</label>
            {form.compRows.length < L.marketCompsMax && (
              <button
                type="button"
                data-testid="broker-extras-comp-add"
                onClick={() =>
                  setForm((prev) => ({
                    ...prev,
                    compRows: [
                      ...prev.compRows,
                      { kind: "transaction", location: "", price_eok: "", land_price_per_pyeong_manwon: "", note: "" },
                    ],
                  }))
                }
                className="text-[10px] text-primary hover:text-primary/80 font-medium"
              >
                + 행 추가
              </button>
            )}
          </div>
          {form.compRows.map((c, i) => (
            <div key={i} className="rounded-lg border border-border/30 bg-background/50 p-2 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <select
                  data-testid={`broker-extras-comp-kind-${i}`}
                  value={c.kind}
                  onChange={(e) => updateComp(i, { kind: e.target.value as BrokerCompRowForm["kind"] })}
                  className={INPUT_CLASS}
                >
                  <option value="transaction">실거래</option>
                  <option value="listing">매물</option>
                </select>
                <input
                  data-testid={`broker-extras-comp-location-${i}`}
                  type="text"
                  value={c.location}
                  maxLength={L.compLocationChars + 20}
                  onChange={(e) => updateComp(i, { location: e.target.value })}
                  placeholder={`소재지 (최대 ${L.compLocationChars}자)`}
                  className={`flex-1 min-w-0 ${INPUT_CLASS}`}
                />
                <button
                  type="button"
                  data-testid={`broker-extras-comp-remove-${i}`}
                  onClick={() => setForm((prev) => ({ ...prev, compRows: prev.compRows.filter((_, idx) => idx !== i) }))}
                  className="text-[10px] text-rose-400 hover:text-rose-300 shrink-0"
                >
                  삭제
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  data-testid={`broker-extras-comp-price-${i}`}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  value={c.price_eok}
                  onChange={(e) => updateComp(i, { price_eok: e.target.value })}
                  placeholder="가격 (억)"
                  className={INPUT_CLASS}
                />
                <input
                  data-testid={`broker-extras-comp-landprice-${i}`}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  value={c.land_price_per_pyeong_manwon}
                  onChange={(e) => updateComp(i, { land_price_per_pyeong_manwon: e.target.value })}
                  placeholder="토지평당가 (만원)"
                  className={INPUT_CLASS}
                />
                <input
                  data-testid={`broker-extras-comp-note-${i}`}
                  type="text"
                  value={c.note}
                  maxLength={L.compNoteChars + 20}
                  onChange={(e) => updateComp(i, { note: e.target.value })}
                  placeholder={`비고 (최대 ${L.compNoteChars}자)`}
                  className={`col-span-2 ${INPUT_CLASS}`}
                />
              </div>
            </div>
          ))}
          {form.compRows.length > 0 && (
            <p className="text-[10px] text-muted-foreground/60">가격(억) 또는 토지평당가(만원) 중 하나는 입력해야 합니다.</p>
          )}
        </div>

        {/* ── 입지 설명 ── */}
        <div className="space-y-1.5">
          <label className={LABEL_CLASS}>입지 설명 (최대 {L.locationNoteChars}자)</label>
          <textarea
            data-testid="broker-extras-location-note"
            value={form.locationNote}
            onChange={(e) => patch({ locationNote: e.target.value })}
            rows={3}
            placeholder="역세권·상권·접근성 등 입지 특징"
            className={`w-full ${INPUT_CLASS}`}
          />
          <div className="text-[10px] text-muted-foreground/60 text-right">
            {form.locationNote.trim().length}/{L.locationNoteChars}
          </div>
        </div>

        {/* ── 매입 후 전략 ── */}
        <div className="space-y-1.5">
          <label className={LABEL_CLASS}>
            매입 후 전략 (줄바꿈으로 구분, 최대 {L.postAcquisitionPlanMax}개 · 각 {L.postAcquisitionPlanChars}자)
          </label>
          <textarea
            data-testid="broker-extras-plan"
            value={form.postAcquisitionPlanText}
            onChange={(e) => patch({ postAcquisitionPlanText: e.target.value })}
            rows={3}
            placeholder={"한 줄에 하나씩 입력하세요"}
            className={`w-full ${INPUT_CLASS}`}
          />
          <div className="text-[10px] text-muted-foreground/60 text-right">
            {lineCount(form.postAcquisitionPlanText)}/{L.postAcquisitionPlanMax}
          </div>
        </div>
      </div>
    </details>
  );
}

/** 목표 임대료 (평당 만원/월) — 렌트롤 입력 근처에 배치. 안정화 수익률 산출용 (선택) */
export function BrokerTargetRentField({ form, setForm }: BrokerExtrasSectionProps) {
  return (
    <div className="col-span-2 flex flex-col gap-1">
      <label className="text-xs font-semibold text-muted-foreground" htmlFor="broker-extras-target-rent">
        목표 임대료 (평당 만원/월)
      </label>
      <input
        id="broker-extras-target-rent"
        data-testid="broker-extras-target-rent"
        type="number"
        inputMode="decimal"
        min={0}
        step="any"
        value={form.targetRent}
        onChange={(e) => setForm((prev) => ({ ...prev, targetRent: e.target.value }))}
        placeholder="예: 12"
        className="bg-secondary/50 border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:border-primary focus:ring-primary"
      />
      <p className="text-[10px] text-muted-foreground/70">공실·자가사용분 임대 시 안정화 수익률 산출에 사용 (선택)</p>
    </div>
  );
}
