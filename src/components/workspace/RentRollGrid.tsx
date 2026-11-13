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
  className = "",
}: RentRollGridProps) {
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [isCompact, setIsCompact] = useState<boolean>(false);
  const [pasteNotice, setPasteNotice] = useState<string | null>(null);
  const [activeCell, setActiveCell] = useState<{ rowIdx: number; colKey: string } | null>(null);
  const [cellDraft, setCellDraft] = useState<{ key: string; value: string } | null>(null);
  const prevNonVacantRef = useRef<Record<string, { use: string; tenantName?: string }>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);

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
            setIsCompact(w < 640);
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
    if (!tableRef.current) return false;
    const direct = tableRef.current.querySelector<HTMLInputElement>(
      `input[data-rr-row="${targetRowIdx}"][data-rr-col="${colKey}"]`
    );
    if (direct && !direct.disabled) {
      direct.focus();
      direct.select?.();
      return true;
    }
    const fallback = tableRef.current.querySelector<HTMLInputElement>(
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
          <div className="p-3 mb-3 bg-[#FEF3C7] text-[#92400E] text-[14px] font-semibold rounded-xl border border-[#FDE68A]">
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
          className="p-3 bg-[#FEF3C7] text-[#92400E] text-[15px] font-medium rounded-xl border border-[#FDE68A] flex items-center justify-between"
        >
          <span>{pasteNotice}</span>
          <button
            type="button"
            onClick={() => setPasteNotice(null)}
            className="min-h-[40px] px-2.5 text-[#92400E] font-bold text-sm hover:underline cursor-pointer ml-2"
          >
            닫기
          </button>
        </div>
      )}

      {/* Grid instructions header */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[#475569] text-sm">
        <span>
          📋 엑셀에서 복사한 임대 표를 오른쪽 버튼으로 바로 붙여넣거나 칸에 직접 입력해 주세요.
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            data-testid="rent-roll-paste-btn"
            onClick={handleClickPasteFromClipboard}
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-sm font-extrabold cursor-pointer shadow-2xs transition"
          >
            📋 복사한 임대 표 붙여넣기
          </button>
          <button
            type="button"
            onClick={handleAddRow}
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white hover:bg-blue-50 border border-[#CBD5E1] text-[#1D4ED8] text-sm font-extrabold cursor-pointer shrink-0 transition"
          >
            + 층 추가
          </button>
        </div>
      </div>

      {/* Table Container */}
      <div className="overflow-x-auto rounded-2xl border-2 border-[#CBD5E1] bg-white shadow-sm">
        <table ref={tableRef} role="grid" className="w-full border-collapse text-left min-w-[560px]">
          <thead>
            <tr className="bg-[#FAF9F5] border-b-2 border-[#CBD5E1] text-[#0F172A] text-sm font-extrabold">
              <th className="py-2 px-1.5 w-[48px] text-center">층</th>
              <th className="py-2 px-1.5 w-[64px]">호수</th>
              <th className="py-2 px-1.5 min-w-[84px]">용도/업종</th>
              <th className="py-2 px-1.5 w-[80px] text-right">보증금(만)</th>
              <th className="py-2 px-1.5 w-[72px] text-right">월세(만)</th>
              <th className="py-2 px-1.5 w-[68px] text-right">관리비(만)</th>
              <th className="py-2 px-1.5 w-[64px]">만기일</th>
              <th className="py-2 px-1.5 w-[144px] text-center">상태</th>
              <th className="py-2 px-1 w-[44px] text-center"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8F0] text-[15px]">
            {rows.map((row, idx) => {
              const isVacant = row.status === "vacant";
              const isSuspicious = Boolean(row.unitMistakeWarning);
              const rowKey = row.id || String(idx);

              return (
                <tr
                  key={row.id || idx}
                  className={`hover:bg-[#F8FAFC] transition-colors ${
                    isVacant ? "bg-[#F8FAFC]/60" : isSuspicious ? "bg-[#FEFCE8]" : ""
                  }`}
                >
                  {/* Floor */}
                  <td className="py-1.5 px-1.5 font-bold text-center text-[#0F172A]">
                    <input
                      type="text"
                      data-rr-cell={`${idx}:floor`}
                      data-rr-row={idx}
                      data-rr-col="floor"
                      value={row.floor}
                      onChange={(e) => handleUpdateRow(idx, { floor: e.target.value })}
                      onBlur={(e) => handleUpdateRow(idx, { floor: normalizeFloorName(e.target.value) })}
                      onKeyDown={(e) => handleKeyDown(e, idx, "floor")}
                      className="w-full text-center font-bold text-[15px] bg-transparent outline-none border-b border-transparent focus:border-[#1D4ED8]"
                    />
                  </td>

                  {/* Unit */}
                  <td className="py-1.5 px-1.5">
                    <input
                      type="text"
                      data-rr-cell={`${idx}:unit`}
                      data-rr-row={idx}
                      data-rr-col="unit"
                      value={row.unit}
                      onChange={(e) => handleUpdateRow(idx, { unit: e.target.value })}
                      onKeyDown={(e) => handleKeyDown(e, idx, "unit")}
                      className="w-full text-[14px] bg-transparent outline-none border-b border-transparent focus:border-[#1D4ED8]"
                    />
                  </td>

                  {/* Use / Tenant */}
                  <td className="py-1.5 px-1.5">
                    <input
                      type="text"
                      data-rr-cell={`${idx}:use`}
                      data-rr-row={idx}
                      data-rr-col="use"
                      disabled={isVacant}
                      value={row.use}
                      placeholder={isVacant ? "공실" : "업종 입력"}
                      onChange={(e) => handleUpdateRow(idx, { use: e.target.value })}
                      onKeyDown={(e) => handleKeyDown(e, idx, "use")}
                      className={`w-full text-[14px] outline-none border-b border-transparent focus:border-[#1D4ED8] ${
                        isVacant ? "text-[#94A3B8] italic" : "text-[#0F172A]"
                      }`}
                    />
                  </td>

                  {/* Deposit */}
                  <td className="py-1.5 px-1.5 text-right">
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
                      className="w-full text-right font-semibold text-[15px] tabular-nums outline-none border-b border-transparent focus:border-[#1D4ED8]"
                    />
                    <div className="text-[13px] text-[#1D4ED8] font-bold">
                      {formatKoreanCurrencyReadout(row.depositManwon)}
                    </div>
                  </td>

                  {/* Monthly Rent */}
                  <td className="py-1.5 px-1.5 text-right">
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
                      className={`w-full text-right font-semibold text-[15px] tabular-nums outline-none border-b border-transparent focus:border-[#1D4ED8] ${
                        isVacant ? "text-[#94A3B8]" : "text-[#0F172A]"
                      }`}
                    />
                    <div className="text-[13px] text-[#1D4ED8] font-bold">
                      {formatKoreanCurrencyReadout(isVacant ? 0 : row.monthlyRentManwon)}
                    </div>
                  </td>

                  {/* Maintenance Fee */}
                  <td className="py-1.5 px-1.5 text-right">
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
                      className={`w-full text-right font-semibold text-[15px] tabular-nums outline-none border-b border-transparent focus:border-[#1D4ED8] ${
                        isVacant ? "text-[#94A3B8]" : "text-[#0F172A]"
                      }`}
                    />
                    <div className="text-[13px] text-[#475569]">
                      {formatKoreanCurrencyReadout(isVacant ? 0 : row.maintenanceManwon)}
                    </div>
                  </td>

                  {/* Expiry */}
                  <td className="py-1.5 px-1.5">
                    <input
                      type="text"
                      data-rr-cell={`${idx}:leaseExpiry`}
                      data-rr-row={idx}
                      data-rr-col="leaseExpiry"
                      disabled={isVacant}
                      value={row.leaseExpiry}
                      placeholder={isVacant ? "-" : "27.05"}
                      onChange={(e) => handleExpiryChange(idx, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, idx, "leaseExpiry")}
                      className={`w-full text-[13px] outline-none border-b border-transparent focus:border-[#1D4ED8] ${
                        row.isExpired ? "text-[#991B1B] font-bold" : "text-[#334155]"
                      }`}
                    />
                    {row.isExpired && (
                      <div className="text-[13px] text-[#991B1B] font-medium">
                        만기 지남
                      </div>
                    )}
                  </td>

                  {/* Status 3 pills */}
                  <td className="py-1.5 px-1.5 text-center">
                    <div className="inline-flex rounded-xl border border-[#CBD5E1] p-0.5 bg-[#FAF9F5]">
                      {(["occupied", "vacant", "owner"] as const).map((st) => {
                        const isCur = row.status === st;
                        const label = st === "occupied" ? "임대" : st === "vacant" ? "공실" : "자가";
                        return (
                          <button
                            key={st}
                            type="button"
                            onClick={() => handleStatusChange(idx, st)}
                            className={`min-h-[40px] px-2.5 py-1.5 text-sm font-bold rounded-lg transition-colors cursor-pointer ${
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
                  </td>

                  {/* Delete button */}
                  <td className="py-1.5 px-1 text-center">
                    <button
                      type="button"
                      disabled={rows.length <= 1}
                      onClick={() => handleDeleteRow(idx)}
                      className={`min-h-[40px] min-w-[40px] inline-flex items-center justify-center text-sm font-bold p-1.5 cursor-pointer ${
                        rows.length <= 1 ? "text-[#CBD5E1] cursor-not-allowed" : "text-[#991B1B] hover:bg-[#FEE2E2] rounded-lg"
                      }`}
                      title="행 삭제"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>

          {/* Sticky summary footer row */}
          <tfoot>
            <tr className="bg-[#F8FAFC] border-t-2 border-[#CBD5E1] font-extrabold text-[#0F172A]">
              <td colSpan={3} className="py-2.5 px-2 text-[15px]">
                합계 ({rows.length}개 층)
                {totals.capRate !== null && (
                  <span className="ml-2 text-[13px] font-bold text-[#065F46] bg-[#D1FAE5] px-2 py-0.5 rounded-full">
                    연 수익률: {totals.capRate.toFixed(2)}%
                  </span>
                )}
              </td>
              <td className="py-2.5 px-1.5 text-right text-[15px] text-[#1D4ED8] tabular-nums">
                {totals.totalDeposit.toLocaleString()}만
                <div className="text-[13px] font-bold">
                  {formatKoreanCurrencyReadout(totals.totalDeposit)}
                </div>
              </td>
              <td className="py-2.5 px-1.5 text-right text-[15px] text-[#1D4ED8] tabular-nums">
                {totals.totalRent.toLocaleString()}만
                <div className="text-[13px] font-bold">
                  {formatKoreanCurrencyReadout(totals.totalRent)}
                </div>
              </td>
              <td className="py-2.5 px-1.5 text-right text-[15px] text-[#475569] tabular-nums">
                {totals.totalMaintenance.toLocaleString()}만
                <div className="text-[13px] font-bold">
                  {formatKoreanCurrencyReadout(totals.totalMaintenance)}
                </div>
              </td>
              <td colSpan={3} className="py-2.5 px-2 text-right text-[13px] text-[#475569]">
                연간 총 임대수익: {(totals.annualRent).toLocaleString()}만 원
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
