"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { RentRollRowItem, RentRollStatus } from "@/lib/rent-roll/tsv-parser";
import {
  parseTsvRentRoll,
  formatKoreanCurrencyReadout,
  parseManwonAmount,
  normalizeFloorName,
} from "@/lib/rent-roll/tsv-parser";
import { parseLeaseExpiryDate } from "@/lib/rent-roll/date-parser";
import { MobileRentRollCards } from "./MobileRentRollCards";

export interface RentRollGridProps {
  rows: RentRollRowItem[];
  onChange: (rows: RentRollRowItem[]) => void;
  floorsAbove?: number;
  floorsBelow?: number;
  askingPriceManwon?: number;
  extraToolbarAction?: React.ReactNode;
  className?: string;
}

function parseManwonCellValue(raw: string | number): number {
  if (typeof raw === "number") {
    return Number.isFinite(raw) && raw > 0 ? Math.round(raw * 10) / 10 : 0;
  }
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return 0;

  if (trimmed.includes("억")) {
    return parseManwonAmount(trimmed).manwon;
  }
  if (trimmed.includes("원") && !trimmed.includes("만")) {
    const digits = trimmed.replace(/[^0-9.]/g, "");
    const krw = parseFloat(digits);
    return Number.isFinite(krw) && krw > 0 ? Math.round((krw / 10000) * 10) / 10 : 0;
  }

  const cleaned = trimmed.replace(/,/g, "").replace(/만\s*원?$/g, "").trim();
  const num = parseFloat(cleaned);
  return Number.isFinite(num) && num > 0 ? Math.round(num * 10) / 10 : 0;
}

/**
 * Generates initial scaffolding rows from building register floors (e.g. B1 ~ 5F).
 */
export function generateFloorScaffolding(
  floorsAbove: number = 4,
  floorsBelow: number = 1
): RentRollRowItem[] {
  const generated: RentRollRowItem[] = [];
  let idCounter = 1;

  for (let b = floorsBelow; b >= 1; b--) {
    generated.push({
      id: `scaffold-b${b}`,
      floor: `B${b}`,
      unit: `B${b}01호`,
      use: "근린생활시설",
      depositManwon: 0,
      monthlyRentManwon: 0,
      maintenanceManwon: 0,
      leaseExpiry: "",
      status: "occupied",
    });
    idCounter++;
  }

  for (let f = 1; f <= floorsAbove; f++) {
    generated.push({
      id: `scaffold-${f}f`,
      floor: `${f}F`,
      unit: `${f}01호`,
      use: f === 1 ? "근린생활시설" : "업무시설",
      depositManwon: 0,
      monthlyRentManwon: 0,
      maintenanceManwon: 0,
      leaseExpiry: "",
      status: "occupied",
    });
    idCounter++;
  }

  return generated;
}

export function RentRollGrid({
  rows,
  onChange,
  floorsAbove = 5,
  floorsBelow = 1,
  askingPriceManwon,
  extraToolbarAction,
  className = "",
}: RentRollGridProps) {
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [isCompact, setIsCompact] = useState<boolean>(true);
  const [pasteNotice, setPasteNotice] = useState<string | null>(null);
  const [activeCell, setActiveCell] = useState<{ rowIdx: number; colKey: string } | null>(null);
  const [cellDraft, setCellDraft] = useState<{ key: string; value: string } | null>(null);
  const prevNonVacantRef = useRef<Record<string, { use: string; tenantName?: string }>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // Responsive width detection (<640px mobile viewport, ResizeObserver for compact container)
  useEffect(() => {
    const checkWidth = () => {
      setIsMobile(window.innerWidth < 640);
    };
    checkWidth();
    window.addEventListener("resize", checkWidth);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && containerRef.current) {
      observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const w = entry.contentRect.width;
          if (w > 0) {
            setIsCompact(w < 880);
          }
        }
      });
      observer.observe(containerRef.current);
    }

    return () => {
      window.removeEventListener("resize", checkWidth);
      observer?.disconnect();
    };
  }, []);

  // Pre-fill scaffolding if rows empty
  useEffect(() => {
    if (!rows || rows.length === 0) {
      const scaffold = generateFloorScaffolding(floorsAbove, floorsBelow);
      onChange(scaffold);
    }
  }, [rows, floorsAbove, floorsBelow, onChange]);

  const handleUpdateRow = (index: number, patch: Partial<RentRollRowItem>) => {
    if (index < 0 || index >= rows.length) return;
    const next = [...rows];
    next[index] = { ...next[index], ...patch };
    onChange(next);
  };

  const handleStatusChange = (index: number, status: RentRollStatus) => {
    if (index < 0 || index >= rows.length) return;
    const row = rows[index];
    if (!row) return;
    const rowKey = row.id || String(index);
    const isVacant = status === "vacant";

    if (isVacant) {
      if (row.status !== "vacant") {
        prevNonVacantRef.current[rowKey] = {
          use: row.use && row.use !== "공실" ? row.use : "",
          tenantName: row.tenantName && row.tenantName !== "공실" ? row.tenantName : undefined,
        };
      }
      handleUpdateRow(index, {
        status,
        use: "공실",
        tenantName: undefined,
      });
    } else {
      const saved = prevNonVacantRef.current[rowKey];
      const restoredUse = row.status === "vacant"
        ? (saved?.use ?? (row.use === "공실" ? "" : row.use))
        : (row.use === "공실" ? "" : row.use);
      const restoredTenant = row.status === "vacant"
        ? (saved?.tenantName ?? (row.tenantName === "공실" ? undefined : row.tenantName))
        : row.tenantName;
      handleUpdateRow(index, {
        status,
        use: restoredUse,
        tenantName: restoredTenant,
      });
    }
  };

  const handleExpiryChange = (index: number, rawExpiry: string) => {
    const parsed = parseLeaseExpiryDate(rawExpiry);
    handleUpdateRow(index, {
      leaseExpiry: rawExpiry,
      normalizedExpiry: parsed.normalized,
      isExpired: parsed.isExpired,
    });
  };

  const handleAddRow = useCallback(() => {
    let maxGround = 0;
    for (const r of rows) {
      const norm = normalizeFloorName(r.floor);
      if (!/^B/i.test(norm)) {
        const m = norm.match(/(\d+)/);
        if (m) {
          const n = parseInt(m[1], 10);
          if (n > maxGround) maxGround = n;
        }
      }
    }
    const nextFloorNum = maxGround + 1;
    const nextFloorName = `${nextFloorNum}F`;

    const newRow: RentRollRowItem = {
      id: `rr-${Date.now()}-${rows.length}`,
      floor: nextFloorName,
      unit: `${nextFloorNum}01호`,
      use: "근린생활시설",
      depositManwon: 0,
      monthlyRentManwon: 0,
      maintenanceManwon: 0,
      leaseExpiry: "",
      status: "occupied",
    };
    onChange([...rows, newRow]);
  }, [rows, onChange]);

  const handleDeleteRow = (index: number) => {
    if (rows.length <= 1) return;
    onChange(rows.filter((_, idx) => idx !== index));
  };

  // TSV Clipboard Paste Handler
  const applyTsvText = useCallback(
    (clipboardData: string): boolean => {
      if (!clipboardData || (!clipboardData.includes("\t") && !clipboardData.includes("\n"))) {
        return false;
      }
      const result = parseTsvRentRoll(clipboardData, rows.length + 1);
      if (result.rows.length > 0) {
        onChange(result.rows);
        setPasteNotice(
          result.hasUnitMistakes
            ? "⚠️ 엑셀 데이터 중 원 단위(예: 50,000,000)가 감지되어 만 원(5,000만 원)으로 자동 보정되었습니다."
            : `✓ ${result.rows.length}개 층 데이터가 엑셀에서 붙여넣어졌습니다.`
        );
        setTimeout(() => setPasteNotice(null), 8000);
        return true;
      }
      return false;
    },
    [onChange, rows.length]
  );

  const handlePaste = (e: React.ClipboardEvent) => {
    const clipboardData = e.clipboardData.getData("text");
    if (!clipboardData || (!clipboardData.includes("\t") && !clipboardData.includes("\n"))) {
      return; // Regular single text paste, let default event proceed
    }
    e.preventDefault();
    applyTsvText(clipboardData);
  };

  const handleClickPasteFromClipboard = async () => {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.readText === "function") {
        const text = await navigator.clipboard.readText();
        if (applyTsvText(text)) return;
      }
    } catch {
      // Fallback if clipboard read permission denied
    }
    setPasteNotice(
      "💡 아래 표의 아무 칸이나 클릭한 뒤 복사한 임대 표를 붙여넣어 주세요."
    );
    setTimeout(() => setPasteNotice(null), 6000);
  };

  // Global paste listener while RentRollGrid is visible on screen
  useEffect(() => {
    const onWindowPaste = (e: ClipboardEvent) => {
      if (!containerRef.current || containerRef.current.offsetParent === null) return;
      const activeEl = document.activeElement as HTMLElement | null;
      if (
        activeEl &&
        (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA") &&
        !containerRef.current.contains(activeEl)
      ) {
        return;
      }
      const text = e.clipboardData?.getData("text") || "";
      if (text && (text.includes("\t") || text.includes("\n"))) {
        e.preventDefault();
        applyTsvText(text);
      }
    };
    window.addEventListener("paste", onWindowPaste);
    return () => window.removeEventListener("paste", onWindowPaste);
  }, [applyTsvText]);

  const focusGridCell = useCallback((targetRowIdx: number, colKey: string): boolean => {
    if (!gridRef.current) return false;
    const direct = gridRef.current.querySelector<HTMLInputElement>(
      `input[data-rr-row="${targetRowIdx}"][data-rr-col="${colKey}"]`
    );
    if (direct && !direct.disabled) {
      direct.focus();
      direct.select?.();
      return true;
    }
    const fallback = gridRef.current.querySelector<HTMLInputElement>(
      `input[data-rr-row="${targetRowIdx}"]:not([disabled])`
    );
    if (fallback) {
      fallback.focus();
      fallback.select?.();
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    if (!activeCell) return;
    focusGridCell(activeCell.rowIdx, activeCell.colKey);
  }, [activeCell, rows.length, focusGridCell]);

  // Keyboard navigation across cells
  const handleKeyDown = (
    e: React.KeyboardEvent,
    rowIdx: number,
    colKey: string
  ) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (rowIdx >= rows.length - 1) {
        handleAddRow();
        setActiveCell({ rowIdx: rowIdx + 1, colKey });
      } else {
        setActiveCell({ rowIdx: rowIdx + 1, colKey });
        focusGridCell(rowIdx + 1, colKey);
      }
    } else if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault();
      if (rowIdx > 0) {
        setActiveCell({ rowIdx: rowIdx - 1, colKey });
        focusGridCell(rowIdx - 1, colKey);
      }
    } else if (e.ctrlKey && (e.key === "d" || e.key === "D")) {
      // Ctrl+D copies cell from above row
      if (rowIdx > 0) {
        e.preventDefault();
        const aboveVal = (rows[rowIdx - 1] as any)[colKey];
        handleUpdateRow(rowIdx, { [colKey]: aboveVal });
      }
    }
  };

  // Summary calculations
  const totals = useMemo(() => {
    const totalDeposit =
      Math.round(
        rows.reduce((s, r) => s + (r.status !== "vacant" ? r.depositManwon || 0 : 0), 0) * 10
      ) / 10;
    const totalRent =
      Math.round(
        rows.reduce((s, r) => s + (r.status !== "vacant" ? r.monthlyRentManwon || 0 : 0), 0) * 10
      ) / 10;
    const totalMaintenance =
      Math.round(
        rows.reduce((s, r) => s + (r.status !== "vacant" ? r.maintenanceManwon || 0 : 0), 0) * 10
      ) / 10;
    const annualRent = Math.round(totalRent * 12 * 10) / 10;

    let capRate: number | null = null;
    if (askingPriceManwon && askingPriceManwon > 0) {
      // net yield = annualRent / (price - deposit)
      const netInvestment = askingPriceManwon - totalDeposit;
      if (netInvestment > 0) {
        capRate = (annualRent / netInvestment) * 100;
      }
    }

    return {
      totalDeposit,
      totalRent,
      totalMaintenance,
      annualRent,
      capRate,
    };
  }, [rows, askingPriceManwon]);

  if (isMobile) {
    return (
      <div onPaste={handlePaste}>
        {pasteNotice && (
          <div className="p-3 mb-3 bg-[#FEF3C7] text-[#92400E] text-sm font-semibold rounded-xl border border-[#FDE68A]">
            {pasteNotice}
          </div>
        )}
        <MobileRentRollCards
          rows={rows}
          onChange={onChange}
          onAddFloor={handleAddRow}
          className={className}
        />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`space-y-3 ${className}`}
      onPaste={handlePaste}
      data-testid="rent-roll-grid"
      data-compact={isCompact ? "true" : "false"}
    >
      {/* Notice & TSV paste banner */}
      {pasteNotice && (
        <div
          role="alert"
          className="p-3 bg-[#FEF3C7] text-[#92400E] text-sm font-medium rounded-xl border border-[#FDE68A] flex items-center justify-between"
        >
          <span>{pasteNotice}</span>
          <button
            type="button"
            onClick={() => setPasteNotice(null)}
            className="min-h-[44px] px-3 text-[#92400E] font-bold text-sm hover:underline cursor-pointer ml-2 shrink-0"
          >
            닫기
          </button>
        </div>
      )}

      {/* Unified single-row toolbar (Paste + Optional Excel File + Add Floor) */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] px-3.5 py-2.5 text-[#475569] text-sm">
        <span className="font-medium text-[#334155]">
          엑셀 표 복사 붙여넣기 또는 층별 직접 입력
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="rent-roll-paste-btn"
            onClick={handleClickPasteFromClipboard}
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-sm font-extrabold cursor-pointer shadow-2xs transition"
          >
            📋 복사한 임대 표 붙여넣기
          </button>
          {extraToolbarAction}
          <button
            type="button"
            onClick={handleAddRow}
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white hover:bg-blue-50 border border-[#CBD5E1] text-[#1D4ED8] text-sm font-extrabold cursor-pointer shrink-0 transition"
          >
            + 층 추가
          </button>
        </div>
      </div>

      {/* Spacious 2-Line Floor Row Grid (Zero Clipping on 640px Column 2 & xlarge 21px) */}
      <div
        ref={gridRef}
        role="grid"
        aria-label="층별 임대 현황 입력표"
        className="overflow-hidden rounded-2xl border-2 border-[#CBD5E1] bg-white shadow-sm divide-y divide-[#E2E8F0]"
      >
        {rows.map((row, idx) => {
          const isVacant = row.status === "vacant";
          const isSuspicious = Boolean(row.unitMistakeWarning);
          const rowKey = row.id || String(idx);

          return (
            <div
              key={row.id || idx}
              role="row"
              className={`p-3.5 space-y-2.5 transition-colors ${
                isVacant
                  ? "bg-[#F8FAFC]/80"
                  : isSuspicious
                  ? "bg-[#FEFCE8]"
                  : "bg-white hover:bg-[#FAFBFD]"
              }`}
            >
              {/* Line 1: Floor + Unit + Use/Tenant + Status Pills + Delete */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Floor */}
                <div className="w-[72px] shrink-0">
                  <input
                    type="text"
                    aria-label={`${idx + 1}행 층`}
                    data-rr-cell={`${idx}:floor`}
                    data-rr-row={idx}
                    data-rr-col="floor"
                    value={row.floor}
                    onChange={(e) => handleUpdateRow(idx, { floor: e.target.value })}
                    onBlur={(e) => handleUpdateRow(idx, { floor: normalizeFloorName(e.target.value) })}
                    onKeyDown={(e) => handleKeyDown(e, idx, "floor")}
                    className="w-full min-h-[44px] rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] px-2 text-center font-extrabold text-base text-[#0F172A] outline-none focus:border-[#1D4ED8] focus:bg-white"
                  />
                </div>

                {/* Unit */}
                <div className="w-[104px] shrink-0">
                  <input
                    type="text"
                    aria-label={`${idx + 1}행 호수`}
                    data-rr-cell={`${idx}:unit`}
                    data-rr-row={idx}
                    data-rr-col="unit"
                    value={row.unit}
                    placeholder="호수"
                    onChange={(e) => handleUpdateRow(idx, { unit: e.target.value })}
                    onKeyDown={(e) => handleKeyDown(e, idx, "unit")}
                    className="w-full min-h-[44px] rounded-xl border border-[#E2E8F0] bg-white px-2.5 text-sm font-semibold text-[#0F172A] outline-none focus:border-[#1D4ED8]"
                  />
                </div>

                {/* Use / Tenant */}
                <div className="min-w-[140px] flex-1">
                  <input
                    type="text"
                    aria-label={`${idx + 1}행 용도 및 업종`}
                    data-rr-cell={`${idx}:use`}
                    data-rr-row={idx}
                    data-rr-col="use"
                    disabled={isVacant}
                    value={row.use}
                    placeholder={isVacant ? "공실" : "용도·업종 입력 (예: 카페, 의원)"}
                    onChange={(e) => handleUpdateRow(idx, { use: e.target.value })}
                    onKeyDown={(e) => handleKeyDown(e, idx, "use")}
                    className={`w-full min-h-[44px] rounded-xl border border-[#E2E8F0] px-3 text-sm font-semibold outline-none focus:border-[#1D4ED8] ${
                      isVacant
                        ? "bg-[#F1F5F9] text-[#64748B] italic"
                        : "bg-white text-[#0F172A]"
                    }`}
                  />
                </div>

                {/* Status 3 pills + Delete */}
                <div className="flex items-center gap-1.5 ml-auto shrink-0">
                  <div className="inline-flex rounded-xl border border-[#CBD5E1] p-0.5 bg-[#FAF9F5]">
                    {(["occupied", "vacant", "owner"] as const).map((st) => {
                      const isCur = row.status === st;
                      const label = st === "occupied" ? "임대" : st === "vacant" ? "공실" : "자가";
                      return (
                        <button
                          key={st}
                          type="button"
                          onClick={() => handleStatusChange(idx, st)}
                          className={`min-h-[44px] px-3 py-1.5 text-sm font-bold rounded-lg transition-colors cursor-pointer ${
                            isCur
                              ? "bg-[#0F172A] text-white shadow-xs"
                              : "text-[#475569] hover:text-[#0F172A]"
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    disabled={rows.length <= 1}
                    onClick={() => handleDeleteRow(idx)}
                    className={`min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-sm font-bold p-2 cursor-pointer ${
                      rows.length <= 1
                        ? "text-[#CBD5E1] cursor-not-allowed"
                        : "text-[#991B1B] hover:bg-[#FEE2E2] rounded-xl"
                    }`}
                    title="층 삭제"
                    aria-label={`${row.floor || idx + 1}층 삭제`}
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Line 2: 4-Column Financials & Lease Expiry */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {/* Deposit */}
                <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC]/70 px-3 py-2">
                  <div className="flex items-center justify-between gap-1 text-sm font-bold text-[#475569]">
                    <span>보증금(만)</span>
                  </div>
                  <input
                    type="text"
                    inputMode="decimal"
                    data-rr-cell={`${idx}:depositManwon`}
                    data-rr-row={idx}
                    data-rr-col="depositManwon"
                    value={
                      cellDraft?.key === `${rowKey}:depositManwon`
                        ? cellDraft.value
                        : (row.depositManwon || "")
                    }
                    placeholder="0"
                    onFocus={() =>
                      setCellDraft({
                        key: `${rowKey}:depositManwon`,
                        value: row.depositManwon ? String(row.depositManwon) : "",
                      })
                    }
                    onChange={(e) => {
                      const raw = e.target.value;
                      setCellDraft({ key: `${rowKey}:depositManwon`, value: raw });
                      handleUpdateRow(idx, {
                        depositManwon: parseManwonCellValue(raw),
                      });
                    }}
                    onBlur={(e) => {
                      setCellDraft(null);
                      handleUpdateRow(idx, {
                        depositManwon: parseManwonCellValue(e.target.value),
                      });
                    }}
                    onKeyDown={(e) => handleKeyDown(e, idx, "depositManwon")}
                    className="mt-1 w-full bg-transparent text-right font-extrabold text-base text-[#0F172A] tabular-nums outline-none border-b border-transparent focus:border-[#1D4ED8]"
                  />
                  <div className="mt-0.5 truncate text-right text-sm text-[#1D4ED8] font-bold">
                    {formatKoreanCurrencyReadout(row.depositManwon)}
                  </div>
                </div>

                {/* Monthly Rent */}
                <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC]/70 px-3 py-2">
                  <div className="flex items-center justify-between gap-1 text-sm font-bold text-[#475569]">
                    <span>월세(만)</span>
                  </div>
                  <input
                    type="text"
                    inputMode="decimal"
                    data-rr-cell={`${idx}:monthlyRentManwon`}
                    data-rr-row={idx}
                    data-rr-col="monthlyRentManwon"
                    disabled={isVacant}
                    value={
                      isVacant
                        ? ""
                        : cellDraft?.key === `${rowKey}:monthlyRentManwon`
                        ? cellDraft.value
                        : (row.monthlyRentManwon || "")
                    }
                    placeholder="0"
                    onFocus={() =>
                      setCellDraft({
                        key: `${rowKey}:monthlyRentManwon`,
                        value: row.monthlyRentManwon ? String(row.monthlyRentManwon) : "",
                      })
                    }
                    onChange={(e) => {
                      const raw = e.target.value;
                      setCellDraft({ key: `${rowKey}:monthlyRentManwon`, value: raw });
                      handleUpdateRow(idx, {
                        monthlyRentManwon: parseManwonCellValue(raw),
                      });
                    }}
                    onBlur={(e) => {
                      setCellDraft(null);
                      handleUpdateRow(idx, {
                        monthlyRentManwon: parseManwonCellValue(e.target.value),
                      });
                    }}
                    onKeyDown={(e) => handleKeyDown(e, idx, "monthlyRentManwon")}
                    className={`mt-1 w-full bg-transparent text-right font-extrabold text-base tabular-nums outline-none border-b border-transparent focus:border-[#1D4ED8] ${
                      isVacant ? "text-[#94A3B8]" : "text-[#0F172A]"
                    }`}
                  />
                  <div className="mt-0.5 truncate text-right text-sm text-[#1D4ED8] font-bold">
                    {formatKoreanCurrencyReadout(isVacant ? 0 : row.monthlyRentManwon)}
                  </div>
                </div>

                {/* Maintenance Fee */}
                <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC]/70 px-3 py-2">
                  <div className="flex items-center justify-between gap-1 text-sm font-bold text-[#475569]">
                    <span>관리비(만)</span>
                  </div>
                  <input
                    type="text"
                    inputMode="decimal"
                    data-rr-cell={`${idx}:maintenanceManwon`}
                    data-rr-row={idx}
                    data-rr-col="maintenanceManwon"
                    disabled={isVacant}
                    value={
                      isVacant
                        ? ""
                        : cellDraft?.key === `${rowKey}:maintenanceManwon`
                        ? cellDraft.value
                        : (row.maintenanceManwon || "")
                    }
                    placeholder="0"
                    onFocus={() =>
                      setCellDraft({
                        key: `${rowKey}:maintenanceManwon`,
                        value: row.maintenanceManwon ? String(row.maintenanceManwon) : "",
                      })
                    }
                    onChange={(e) => {
                      const raw = e.target.value;
                      setCellDraft({ key: `${rowKey}:maintenanceManwon`, value: raw });
                      handleUpdateRow(idx, {
                        maintenanceManwon: parseManwonCellValue(raw),
                      });
                    }}
                    onBlur={(e) => {
                      setCellDraft(null);
                      handleUpdateRow(idx, {
                        maintenanceManwon: parseManwonCellValue(e.target.value),
                      });
                    }}
                    onKeyDown={(e) => handleKeyDown(e, idx, "maintenanceManwon")}
                    className={`mt-1 w-full bg-transparent text-right font-extrabold text-base tabular-nums outline-none border-b border-transparent focus:border-[#1D4ED8] ${
                      isVacant ? "text-[#94A3B8]" : "text-[#0F172A]"
                    }`}
                  />
                  <div className="mt-0.5 truncate text-right text-sm text-[#475569] font-semibold">
                    {formatKoreanCurrencyReadout(isVacant ? 0 : row.maintenanceManwon)}
                  </div>
                </div>

                {/* Expiry */}
                <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC]/70 px-3 py-2">
                  <div className="flex items-center justify-between gap-1 text-sm font-bold text-[#475569]">
                    <span>계약 만기일</span>
                  </div>
                  <input
                    type="text"
                    data-rr-cell={`${idx}:leaseExpiry`}
                    data-rr-row={idx}
                    data-rr-col="leaseExpiry"
                    disabled={isVacant}
                    value={row.leaseExpiry}
                    placeholder={isVacant ? "-" : "예: 2027.05"}
                    onChange={(e) => handleExpiryChange(idx, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, idx, "leaseExpiry")}
                    className={`mt-1 w-full bg-transparent text-right font-bold text-base tabular-nums outline-none border-b border-transparent focus:border-[#1D4ED8] ${
                      row.isExpired ? "text-[#991B1B]" : "text-[#0F172A]"
                    }`}
                  />
                  <div
                    className={`mt-0.5 truncate text-right text-sm font-semibold ${
                      row.isExpired ? "text-[#991B1B]" : "text-[#64748B]"
                    }`}
                  >
                    {row.isExpired ? "만기 지남" : row.normalizedExpiry || "\u00A0"}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {/* Summary footer card */}
        <div className="bg-[#F8FAFC] border-t-2 border-[#CBD5E1] p-4 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base font-extrabold text-[#0F172A]">
                합계 ({rows.length}개 층)
              </span>
              {totals.capRate !== null && (
                <span className="text-sm font-bold text-[#065F46] bg-[#D1FAE5] px-2.5 py-0.5 rounded-full">
                  연 수익률 {totals.capRate.toFixed(2)}%
                </span>
              )}
            </div>
            <span className="text-sm font-extrabold text-[#334155] tabular-nums">
              연간 총 임대수익 {totals.annualRent.toLocaleString()}만 원
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 border-t border-[#E2E8F0]">
            <div className="flex items-baseline justify-between sm:block">
              <div className="text-sm font-semibold text-[#64748B]">총 보증금</div>
              <div className="text-base font-extrabold text-[#1D4ED8] tabular-nums">
                {formatKoreanCurrencyReadout(totals.totalDeposit).replace(/^=\s*/, "") ||
                  `${totals.totalDeposit.toLocaleString()}만 원`}
              </div>
            </div>
            <div className="flex items-baseline justify-between sm:block">
              <div className="text-sm font-semibold text-[#64748B]">월 임대료 합계</div>
              <div className="text-base font-extrabold text-[#1D4ED8] tabular-nums">
                {formatKoreanCurrencyReadout(totals.totalRent).replace(/^=\s*/, "") ||
                  `${totals.totalRent.toLocaleString()}만 원`}
              </div>
            </div>
            <div className="flex items-baseline justify-between sm:block">
              <div className="text-sm font-semibold text-[#64748B]">월 관리비 합계</div>
              <div className="text-base font-extrabold text-[#334155] tabular-nums">
                {formatKoreanCurrencyReadout(totals.totalMaintenance).replace(/^=\s*/, "") ||
                  `${totals.totalMaintenance.toLocaleString()}만 원`}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
