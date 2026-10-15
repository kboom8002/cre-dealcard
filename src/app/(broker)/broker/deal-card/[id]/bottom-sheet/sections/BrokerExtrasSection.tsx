"use client";

import React, { useState } from "react";
import { Trash2 } from "lucide-react";
import {
  BROKER_EXTRAS_LIMITS as L,
  REGULATORY_KINDS,
  REGULATORY_KIND_LABELS,
  type AcquisitionPlanUnit,
  type BrokerCompRowForm,
  type BrokerExtrasFormState,
  type BrokerRegulatoryRowForm,
} from "@/domain/building/mobile-im/broker-extras";
import { parseCompsPasteText, type MarketCompItem } from "@/domain/building/mobile-im/comps-paste-parser";

const MAX_MARKET_COMPS = L.marketCompsMax; // 10
const MAX_PLAN_UNITS = L.postAcquisitionUnitsMax; // 10
const PYEONG_TO_SQM = 3.305785;

export type ExtendedBrokerExtrasFormState = BrokerExtrasFormState & {
  post_acquisition_plan_units?: AcquisitionPlanUnit[];
  post_acquisition_units?: AcquisitionPlanUnit[];
};

type SetForm = React.Dispatch<React.SetStateAction<BrokerExtrasFormState>>;

const INPUT_CLASS =
  "text-[11px] px-2 py-1.5 rounded-lg border border-border/60 bg-secondary/30 text-foreground placeholder-muted-foreground/50 focus:border-primary/50 focus:outline-none";
const LABEL_CLASS = "text-[11px] font-semibold text-muted-foreground";

function lineCount(text: string): number {
  return (text ?? "").split(/\r?\n/).filter((s) => s.trim().length > 0).length;
}

function computeAutoLandPriceManwon(priceEokStr?: string, landAreaPyStr?: string): string | undefined {
  const priceEok = Number((priceEokStr ?? "").replace(/,/g, "").trim());
  const landPy = Number((landAreaPyStr ?? "").replace(/,/g, "").trim());
  if (Number.isFinite(priceEok) && priceEok > 0 && Number.isFinite(landPy) && landPy > 0) {
    return String(Math.round((priceEok * 10000) / landPy));
  }
  return undefined;
}

/** 입력된 항목 수 (배지용) — 목표 임대료는 별도 입력이라 제외 */
export function countBrokerExtrasFormFilled(f: BrokerExtrasFormState): number {
  const ext = f as ExtendedBrokerExtrasFormState;
  const planUnitsCount = (ext.post_acquisition_plan_units ?? ext.post_acquisition_units ?? []).filter(
    (u) => u && u.floor?.trim() && (u.rent_manwon > 0 || u.deposit_manwon > 0)
  ).length;
  return (
    lineCount(f.investmentPointsText) +
    (f.closingLine.trim() ? 1 : 0) +
    f.regulatoryRows.filter((r) => r.detail.trim()).length +
    f.compRows.filter((c) => c.location.trim()).length +
    (f.locationNote.trim() ? 1 : 0) +
    lineCount(f.postAcquisitionPlanText) +
    planUnitsCount
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
  const extForm = form as ExtendedBrokerExtrasFormState;
  const [isPasteOpen, setIsPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [enrichingIdx, setEnrichingIdx] = useState<number | null>(null);
  const [manualLandPriceSet, setManualLandPriceSet] = useState<Record<number, boolean>>({});
  const [localPlanUnits, setLocalPlanUnits] = useState<AcquisitionPlanUnit[]>([]);

  const planUnits: AcquisitionPlanUnit[] =
    extForm.post_acquisition_plan_units ?? extForm.post_acquisition_units ?? localPlanUnits;

  const setPlanUnits = (updater: (prev: AcquisitionPlanUnit[]) => AcquisitionPlanUnit[]) => {
    const nextUnits = updater(planUnits).slice(0, MAX_PLAN_UNITS);
    setLocalPlanUnits(nextUnits);
    setForm((prev) => ({
      ...prev,
      post_acquisition_plan_units: nextUnits,
      post_acquisition_units: nextUnits,
    } as BrokerExtrasFormState));
  };

  const filled = countBrokerExtrasFormFilled({
    ...form,
    post_acquisition_plan_units: planUnits,
  } as BrokerExtrasFormState);

  const patch = (p: Partial<BrokerExtrasFormState>) => setForm((prev) => ({ ...prev, ...p }));

  const updateReg = (i: number, p: Partial<BrokerRegulatoryRowForm>) =>
    setForm((prev) => ({
      ...prev,
      regulatoryRows: prev.regulatoryRows.map((r, idx) => (idx === i ? { ...r, ...p } : r)),
    }));

  const updateComp = (i: number, p: Partial<BrokerCompRowForm>) =>
    setForm((prev) => ({
      ...prev,
      compRows: prev.compRows.map((c, idx) => {
        if (idx !== i) return c;
        const next: BrokerCompRowForm = { ...c, ...p };
        const editedPriceOrLand = "price_eok" in p || "land_area_pyeong" in p;
        const isManual = Boolean(manualLandPriceSet[i]) && next.land_price_per_pyeong_manwon.trim() !== "";
        if (editedPriceOrLand && !isManual) {
          const autoVal = computeAutoLandPriceManwon(next.price_eok, next.land_area_pyeong);
          if (autoVal !== undefined) {
            next.land_price_per_pyeong_manwon = autoVal;
          }
        }
        return next;
      }),
    }));

  const handlePasteApply = () => {
    const parsedItems = parseCompsPasteText(pasteText, "listing");
    if (parsedItems.length === 0) return;

    const newRows: BrokerCompRowForm[] = parsedItems.map((item) => ({
      kind: item.kind,
      location: item.location,
      price_eok: item.price_eok !== undefined ? String(item.price_eok) : "",
      land_price_per_pyeong_manwon:
        item.land_price_per_pyeong_manwon !== undefined ? String(item.land_price_per_pyeong_manwon) : "",
      note: item.note ?? item.date ?? item.as_of ?? "",
      road_side: item.road_condition ?? item.road_side ?? "",
      station_walk: item.station_walk ?? "",
      land_area_pyeong: item.land_area_pyeong !== undefined ? String(item.land_area_pyeong) : "",
      gfa_pyeong:
        (item.gross_floor_area_pyeong ?? item.gfa_pyeong) !== undefined
          ? String(item.gross_floor_area_pyeong ?? item.gfa_pyeong)
          : "",
      as_of: item.date ?? item.as_of ?? "",
      selected: item.selected ?? true,
    }));

    setForm((prev) => {
      const nonEmptyExisting = prev.compRows.filter(
        (r) => r.location.trim() !== "" || r.price_eok.trim() !== "" || r.land_price_per_pyeong_manwon.trim() !== ""
      );
      return {
        ...prev,
        compRows: [...nonEmptyExisting, ...newRows].slice(0, MAX_MARKET_COMPS),
      };
    });

    setPasteText("");
    setIsPasteOpen(false);
  };

  const handleEnrichComp = async (i: number) => {
    const c = form.compRows[i];
    if (!c || !c.location.trim() || enrichingIdx !== null) return;

    setEnrichingIdx(i);
    try {
      const priceNum = Number(c.price_eok.replace(/,/g, "").trim());
      const res = await fetch("/api/broker/im-lite/comps-enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: c.location.trim(),
          price_eok: Number.isFinite(priceNum) && priceNum > 0 ? priceNum : undefined,
          kind: c.kind,
        }),
      });
      if (!res.ok) return;
      const data = await res.json();
      const item: Partial<MarketCompItem> | undefined = data?.item;
      if (!item) return;

      const resolvedLandPy =
        item.land_area_pyeong ??
        (item.land_area_sqm !== undefined && item.land_area_sqm > 0
          ? Math.round((item.land_area_sqm / PYEONG_TO_SQM) * 10) / 10
          : undefined);
      const resolvedGfaPy =
        item.gross_floor_area_pyeong ??
        item.gfa_pyeong ??
        ((item.gross_floor_area_sqm ?? item.gfa_sqm) !== undefined &&
        (item.gross_floor_area_sqm ?? item.gfa_sqm)! > 0
          ? Math.round(((item.gross_floor_area_sqm ?? item.gfa_sqm)! / PYEONG_TO_SQM) * 10) / 10
          : undefined);
      const resolvedRoad = item.road_condition ?? item.road_side;
      const resolvedLandPrice =
        item.land_price_per_pyeong_manwon !== undefined
          ? String(item.land_price_per_pyeong_manwon)
          : resolvedLandPy !== undefined
            ? computeAutoLandPriceManwon(c.price_eok, String(resolvedLandPy))
            : undefined;

      updateComp(i, {
        ...(resolvedLandPy !== undefined ? { land_area_pyeong: String(resolvedLandPy) } : {}),
        ...(resolvedGfaPy !== undefined ? { gfa_pyeong: String(resolvedGfaPy) } : {}),
        ...(resolvedRoad ? { road_side: resolvedRoad } : {}),
        ...(item.station_walk ? { station_walk: item.station_walk } : {}),
        ...(resolvedLandPrice !== undefined ? { land_price_per_pyeong_manwon: resolvedLandPrice } : {}),
      });
    } catch {
      // 네트워크 오류 시 기존 입력값 유지
    } finally {
      setEnrichingIdx(null);
    }
  };

  const totalPlanDeposit = planUnits.reduce((acc, u) => acc + (Number(u.deposit_manwon) || 0), 0);
  const totalPlanRent = planUnits.reduce((acc, u) => acc + (Number(u.rent_manwon) || 0), 0);

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

        {/* ── 인근 시세 비교 (R11: 텍스트/표 붙여넣기 + 주소 자동채움) ── */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <label className={LABEL_CLASS}>인근 시세 비교 (최대 {MAX_MARKET_COMPS}행)</label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="broker-extras-comp-paste-toggle"
                onClick={() => setIsPasteOpen((prev) => !prev)}
                className="text-[10px] px-2 py-0.5 rounded border border-border/60 bg-secondary/40 text-foreground hover:bg-secondary/70 font-medium"
              >
                텍스트/표 붙여넣기
              </button>
              {form.compRows.length < MAX_MARKET_COMPS && (
                <button
                  type="button"
                  data-testid="broker-extras-comp-add"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      compRows: [
                        ...prev.compRows,
                        {
                          kind: "transaction",
                          location: "",
                          price_eok: "",
                          land_price_per_pyeong_manwon: "",
                          note: "",
                          road_side: "",
                          station_walk: "",
                          land_area_pyeong: "",
                          gfa_pyeong: "",
                          selected: true,
                        },
                      ],
                    }))
                  }
                  className="text-[10px] text-primary hover:text-primary/80 font-medium"
                >
                  + 비교 사례 추가
                </button>
              )}
            </div>
          </div>

          {isPasteOpen && (
            <div className="rounded-lg border border-primary/30 bg-background/60 p-2 space-y-1.5">
              <textarea
                data-testid="broker-extras-comp-paste-input"
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                rows={3}
                placeholder="디스코·밸류맵·엑셀에서 복사한 행을 붙여넣으세요 (예: 당산동4가 32-1 | 95억 | 대지 112평 | 연면적 340평 | 대로변 | 당산역 도보 5분)"
                className={`w-full ${INPUT_CLASS}`}
              />
              <div className="flex items-center justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsPasteOpen(false)}
                  className="text-[10px] px-2 py-1 rounded text-muted-foreground hover:text-foreground"
                >
                  취소
                </button>
                <button
                  type="button"
                  data-testid="broker-extras-comp-paste-apply"
                  disabled={!pasteText.trim()}
                  onClick={handlePasteApply}
                  className="text-[10px] px-2.5 py-1 rounded bg-primary text-primary-foreground font-semibold disabled:opacity-40"
                >
                  붙여넣기 반영
                </button>
              </div>
            </div>
          )}

          {form.compRows.map((c, i) => (
            <div key={i} className="rounded-lg border border-border/30 bg-background/50 p-2 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  data-testid={`broker-extras-comp-selected-${i}`}
                  checked={c.selected !== false}
                  onChange={(e) => updateComp(i, { selected: e.target.checked })}
                  title="IM 비교표에 포함"
                  className="h-3.5 w-3.5 accent-primary shrink-0"
                />
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
                  placeholder={`소재지/별칭 (최대 ${L.compLocationChars}자)`}
                  className={`flex-1 min-w-0 ${INPUT_CLASS}`}
                />
                <button
                  type="button"
                  data-testid={`broker-extras-comp-enrich-${i}`}
                  disabled={!c.location.trim() || enrichingIdx === i}
                  onClick={() => handleEnrichComp(i)}
                  className="text-[10px] px-2 py-1 rounded border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-40 shrink-0 font-medium"
                >
                  {enrichingIdx === i ? "조회중..." : "자동채움"}
                </button>
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
                  onChange={(e) => {
                    const val = e.target.value;
                    setManualLandPriceSet((prev) => ({ ...prev, [i]: val.trim() !== "" }));
                    updateComp(i, { land_price_per_pyeong_manwon: val });
                  }}
                  placeholder="토지평당가 (만원)"
                  className={INPUT_CLASS}
                />
                <input
                  data-testid={`broker-extras-comp-road-${i}`}
                  type="text"
                  value={c.road_side ?? ""}
                  maxLength={L.compRoadSideChars}
                  onChange={(e) => updateComp(i, { road_side: e.target.value })}
                  placeholder="도로 조건 (선택, 예: 대로변/이면)"
                  className={INPUT_CLASS}
                />
                <input
                  data-testid={`broker-extras-comp-station-${i}`}
                  type="text"
                  value={c.station_walk ?? ""}
                  maxLength={L.compStationWalkChars}
                  onChange={(e) => updateComp(i, { station_walk: e.target.value })}
                  placeholder="지하철 도보 (선택, 예: 당산역 5분)"
                  className={INPUT_CLASS}
                />
                <input
                  data-testid={`broker-extras-comp-landarea-${i}`}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  value={c.land_area_pyeong ?? ""}
                  onChange={(e) => updateComp(i, { land_area_pyeong: e.target.value })}
                  placeholder="토지면적 (평, 선택)"
                  className={INPUT_CLASS}
                />
                <input
                  data-testid={`broker-extras-comp-gfa-${i}`}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  value={c.gfa_pyeong ?? ""}
                  onChange={(e) => updateComp(i, { gfa_pyeong: e.target.value })}
                  placeholder="연면적 (평, 선택)"
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

        {/* ── 매입 후 전략 (R9: 구조화 전환 호실 + 추가 전략 메모) ── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className={LABEL_CLASS}>매입 후 전략 (안정화 기대수익률 산출)</label>
            {planUnits.length < MAX_PLAN_UNITS && (
              <button
                type="button"
                data-testid="broker-extras-plan-unit-add"
                onClick={() =>
                  setPlanUnits((prev) => [
                    ...prev,
                    {
                      floor: "B1",
                      action: "owner_use_to_lease",
                      deposit_manwon: 0,
                      rent_manwon: 0,
                    },
                  ])
                }
                className="text-[10px] text-primary hover:text-primary/80 font-medium"
              >
                + 전환 호실 추가
              </button>
            )}
          </div>

          {planUnits.map((unit, i) => (
            <div
              key={i}
              data-testid={`broker-extras-plan-unit-row-${i}`}
              className="rounded-lg border border-border/30 bg-background/50 p-2 grid grid-cols-12 gap-1.5 items-center"
            >
              <input
                type="text"
                data-testid={`broker-extras-plan-unit-floor-${i}`}
                value={unit.floor}
                onChange={(e) =>
                  setPlanUnits((prev) =>
                    prev.map((u, idx) => (idx === i ? { ...u, floor: e.target.value } : u))
                  )
                }
                placeholder="층(B1,4F)"
                className={`col-span-2 ${INPUT_CLASS}`}
              />
              <select
                data-testid={`broker-extras-plan-unit-action-${i}`}
                value={unit.action}
                onChange={(e) =>
                  setPlanUnits((prev) =>
                    prev.map((u, idx) =>
                      idx === i ? { ...u, action: e.target.value as AcquisitionPlanUnit["action"] } : u
                    )
                  )
                }
                className={`col-span-4 ${INPUT_CLASS}`}
              >
                <option value="owner_use_to_lease">자가사용 → 임대</option>
                <option value="vacant_lease">공실 → 임대</option>
              </select>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                data-testid={`broker-extras-plan-unit-deposit-${i}`}
                value={unit.deposit_manwon || ""}
                onChange={(e) =>
                  setPlanUnits((prev) =>
                    prev.map((u, idx) =>
                      idx === i ? { ...u, deposit_manwon: Number(e.target.value) || 0 } : u
                    )
                  )
                }
                placeholder="보증금(만원)"
                className={`col-span-3 ${INPUT_CLASS}`}
              />
              <input
                type="number"
                inputMode="decimal"
                min={0}
                data-testid={`broker-extras-plan-unit-rent-${i}`}
                value={unit.rent_manwon || ""}
                onChange={(e) =>
                  setPlanUnits((prev) =>
                    prev.map((u, idx) =>
                      idx === i ? { ...u, rent_manwon: Number(e.target.value) || 0 } : u
                    )
                  )
                }
                placeholder="월세(만원)"
                className={`col-span-2 ${INPUT_CLASS}`}
              />
              <button
                type="button"
                data-testid={`broker-extras-plan-unit-remove-${i}`}
                onClick={() => setPlanUnits((prev) => prev.filter((_, idx) => idx !== i))}
                title="전환 호실 삭제"
                className="col-span-1 flex items-center justify-center text-rose-400 hover:text-rose-300"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}

          {planUnits.length > 0 && (
            <div
              data-testid="broker-extras-plan-units-summary"
              className="rounded-lg bg-primary/10 border border-primary/20 px-2.5 py-1.5 text-[10px] font-medium text-primary"
            >
              합산 전환 보증금 +{totalPlanDeposit.toLocaleString()}만원 · 전환 월세 +{totalPlanRent.toLocaleString()}만원 (안정화 기대수익률 자동 반영)
            </div>
          )}

          <div className="space-y-1 pt-1">
            <label className="text-[10px] font-medium text-muted-foreground">
              추가 전략 메모 (선택, 줄바꿈으로 구분, 최대 {L.postAcquisitionPlanMax}개 · 각 {L.postAcquisitionPlanChars}자)
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
