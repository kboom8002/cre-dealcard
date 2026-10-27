"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { RentRollRowItem, RentRollStatus } from "@/lib/rent-roll/tsv-parser";
import {
  parseTsvRentRoll,
  formatKoreanCurrencyReadout,
  parseManwonAmount,
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
  const [pasteNotice, setPasteNotice] = useState<string | null>(null);
  const [activeCell, setActiveCell] = useState<{ rowIdx: number; colKey: string } | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);

  // Responsive width detection (<640px)
  useEffect(() => {
    const checkWidth = () => {
      setIsMobile(window.innerWidth < 640);
    };
    checkWidth();
    window.addEventListener("resize", checkWidth);
    return () => window.removeEventListener("resize", checkWidth);
  }, []);

  // Pre-fill scaffolding if rows empty
  useEffect(() => {
    if (!rows || rows.length === 0) {
      const scaffold = generateFloorScaffolding(floorsAbove, floorsBelow);
      onChange(scaffold);
    }
  }, [rows, floorsAbove, floorsBelow, onChange]);

  const handleUpdateRow = (index: number, patch: Partial<RentRollRowItem>) => {
    const next = [...rows];
    next[index] = { ...next[index], ...patch };
    onChange(next);
  };

  const handleStatusChange = (index: number, status: RentRollStatus) => {
    const row = rows[index];
    const isVacant = status === "vacant";
    handleUpdateRow(index, {
      status,
      use: isVacant ? "공실" : (row.use === "공실" ? "근린생활시설" : row.use),
      monthlyRentManwon: isVacant ? 0 : row.monthlyRentManwon,
      maintenanceManwon: isVacant ? 0 : row.maintenanceManwon,
    });
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
    const lastFloor = rows[rows.length - 1];
    let nextFloorName = `${rows.length + 1}F`;
    if (lastFloor) {
      const numMatch = lastFloor.floor.match(/(\d+)/);
      if (numMatch) {
        const nextNum = parseInt(numMatch[1], 10) + 1;
        nextFloorName = lastFloor.floor.startsWith("B") ? `B${nextNum}` : `${nextNum}F`;
      }
    }

    const newRow: RentRollRowItem = {
      id: `rr-${Date.now()}-${rows.length}`,
      floor: nextFloorName,
      unit: `${nextFloorName}01호`,
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
  const handlePaste = (e: React.ClipboardEvent) => {
    const clipboardData = e.clipboardData.getData("text");
    if (!clipboardData || !clipboardData.includes("\t") && !clipboardData.includes("\n")) {
      return; // Regular single text paste, let default event proceed
    }

    e.preventDefault();
    const result = parseTsvRentRoll(clipboardData, rows.length + 1);
    if (result.rows.length > 0) {
      onChange(result.rows);
      setPasteNotice(
        result.hasUnitMistakes
          ? "⚠️ 엑셀 데이터 중 원 단위(예: 50,000,000)가 감지되어 만 원(5,000만 원)으로 자동 보정되었습니다."
          : `✓ ${result.rows.length}개 층 데이터가 엑셀에서 붙여넣어졌습니다.`
      );
      setTimeout(() => setPasteNotice(null), 8000);
    }
  };

  // Keyboard navigation across cells
  const handleKeyDown = (
    e: React.KeyboardEvent,
    rowIdx: number,
    colKey: string
  ) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (rowIdx === rows.length - 1) {
        handleAddRow();
      } else {
        setActiveCell({ rowIdx: rowIdx + 1, colKey });
      }
    } else if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault();
      if (rowIdx > 0) {
        setActiveCell({ rowIdx: rowIdx - 1, colKey });
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
    const totalDeposit = rows.reduce((s, r) => s + (r.depositManwon || 0), 0);
    const totalRent = rows.reduce((s, r) => s + (r.monthlyRentManwon || 0), 0);
    const totalMaintenance = rows.reduce((s, r) => s + (r.maintenanceManwon || 0), 0);
    const annualRent = totalRent * 12;

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
      className={`space-y-3 ${className}`}
      onPaste={handlePaste}
      data-testid="rent-roll-grid"
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
            className="text-[#92400E] font-bold text-[14px] hover:underline cursor-pointer ml-2"
          >
            닫기
          </button>
        </div>
      )}

      {/* Grid instructions header */}
      <div className="flex items-center justify-between text-[#475569] text-[14px]">
        <span>
          📋 엑셀이나 스프레드시트의 셀을 복사(Ctrl+C)하여 표 위에 바로 붙여넣기(Ctrl+V)할 수 있습니다.
        </span>
        <button
          type="button"
          onClick={handleAddRow}
          className="text-[#1D4ED8] font-bold hover:underline cursor-pointer"
        >
          + 층 추가
        </button>
      </div>

      {/* Table Container */}
      <div className="overflow-x-auto rounded-2xl border-2 border-[#CBD5E1] bg-white shadow-sm">
        <table ref={tableRef} className="w-full border-collapse text-left min-w-[760px]">
          <thead>
            <tr className="bg-[#FAF9F5] border-b-2 border-[#CBD5E1] text-[#0F172A] text-[15px] font-extrabold">
              <th className="py-3 px-3 w-[72px] text-center">층</th>
              <th className="py-3 px-3 w-[90px]">호수</th>
              <th className="py-3 px-3 w-[150px]">용도/업종</th>
              <th className="py-3 px-3 w-[130px] text-right">보증금(만)</th>
              <th className="py-3 px-3 w-[120px] text-right">월세(만)</th>
              <th className="py-3 px-3 w-[100px] text-right">관리비(만)</th>
              <th className="py-3 px-3 w-[120px]">만기일</th>
              <th className="py-3 px-3 w-[150px] text-center">상태</th>
              <th className="py-3 px-2 w-[48px] text-center"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8F0] text-[15px]">
            {rows.map((row, idx) => {
              const isVacant = row.status === "vacant";
              const isSuspicious = Boolean(row.unitMistakeWarning);

              return (
                <tr
                  key={row.id || idx}
                  className={`hover:bg-[#F8FAFC] transition-colors ${
                    isVacant ? "bg-[#F8FAFC]/60" : isSuspicious ? "bg-[#FEFCE8]" : ""
                  }`}
                >
                  {/* Floor */}
                  <td className="py-2.5 px-3 font-bold text-center text-[#0F172A]">
                    <input
                      type="text"
                      value={row.floor}
                      onChange={(e) => handleUpdateRow(idx, { floor: e.target.value })}
                      onKeyDown={(e) => handleKeyDown(e, idx, "floor")}
                      className="w-full text-center font-bold text-[16px] bg-transparent outline-none border-b border-transparent focus:border-[#1D4ED8]"
                    />
                  </td>

                  {/* Unit */}
                  <td className="py-2.5 px-3">
                    <input
                      type="text"
                      value={row.unit}
                      onChange={(e) => handleUpdateRow(idx, { unit: e.target.value })}
                      onKeyDown={(e) => handleKeyDown(e, idx, "unit")}
                      className="w-full text-[15px] bg-transparent outline-none border-b border-transparent focus:border-[#1D4ED8]"
                    />
                  </td>

                  {/* Use / Tenant */}
                  <td className="py-2.5 px-3">
                    <input
                      type="text"
                      disabled={isVacant}
                      value={row.use}
                      placeholder={isVacant ? "공실" : "업종 입력"}
                      onChange={(e) => handleUpdateRow(idx, { use: e.target.value })}
                      onKeyDown={(e) => handleKeyDown(e, idx, "use")}
                      className={`w-full text-[15px] outline-none border-b border-transparent focus:border-[#1D4ED8] ${
                        isVacant ? "text-[#94A3B8] italic" : "text-[#0F172A]"
                      }`}
                    />
                  </td>

                  {/* Deposit */}
                  <td className="py-2.5 px-3 text-right">
                    <input
                      type="number"
                      value={row.depositManwon || ""}
                      placeholder="0"
                      onChange={(e) =>
                        handleUpdateRow(idx, {
                          depositManwon: parseManwonAmount(e.target.value).manwon,
                        })
                      }
                      onKeyDown={(e) => handleKeyDown(e, idx, "depositManwon")}
                      className="w-full text-right font-semibold text-[16px] tabular-nums outline-none border-b border-transparent focus:border-[#1D4ED8]"
                    />
                    <div className="text-[14px] text-[#1D4ED8] font-bold">
                      {formatKoreanCurrencyReadout(row.depositManwon)}
                    </div>
                  </td>

                  {/* Monthly Rent */}
                  <td className="py-2.5 px-3 text-right">
                    <input
                      type="number"
                      disabled={isVacant}
                      value={isVacant ? "" : (row.monthlyRentManwon || "")}
                      placeholder={isVacant ? "0" : "0"}
                      onChange={(e) =>
                        handleUpdateRow(idx, {
                          monthlyRentManwon: parseManwonAmount(e.target.value).manwon,
                        })
                      }
                      onKeyDown={(e) => handleKeyDown(e, idx, "monthlyRentManwon")}
                      className={`w-full text-right font-semibold text-[16px] tabular-nums outline-none border-b border-transparent focus:border-[#1D4ED8] ${
                        isVacant ? "text-[#94A3B8]" : "text-[#0F172A]"
                      }`}
                    />
                    <div className="text-[14px] text-[#1D4ED8] font-bold">
                      {formatKoreanCurrencyReadout(isVacant ? 0 : row.monthlyRentManwon)}
                    </div>
                  </td>

                  {/* Maintenance Fee */}
                  <td className="py-2.5 px-3 text-right">
                    <input
                      type="number"
                      disabled={isVacant}
                      value={isVacant ? "" : (row.maintenanceManwon || "")}
                      placeholder={isVacant ? "0" : "0"}
                      onChange={(e) =>
                        handleUpdateRow(idx, {
                          maintenanceManwon: parseManwonAmount(e.target.value).manwon,
                        })
                      }
                      onKeyDown={(e) => handleKeyDown(e, idx, "maintenanceManwon")}
                      className={`w-full text-right font-semibold text-[16px] tabular-nums outline-none border-b border-transparent focus:border-[#1D4ED8] ${
                        isVacant ? "text-[#94A3B8]" : "text-[#0F172A]"
                      }`}
                    />
                    <div className="text-[14px] text-[#475569]">
                      {formatKoreanCurrencyReadout(isVacant ? 0 : row.maintenanceManwon)}
                    </div>
                  </td>

                  {/* Expiry */}
                  <td className="py-2.5 px-3">
                    <input
                      type="text"
                      disabled={isVacant}
                      value={row.leaseExpiry}
                      placeholder={isVacant ? "-" : "27.05"}
                      onChange={(e) => handleExpiryChange(idx, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(e, idx, "leaseExpiry")}
                      className={`w-full text-[14px] outline-none border-b border-transparent focus:border-[#1D4ED8] ${
                        row.isExpired ? "text-[#991B1B] font-bold" : "text-[#334155]"
                      }`}
                    />
                    {row.isExpired && (
                      <div className="text-[14px] text-[#991B1B] font-medium">
                        만기 지남
                      </div>
                    )}
                  </td>

                  {/* Status 3 pills */}
                  <td className="py-2.5 px-2 text-center">
                    <div className="inline-flex rounded-lg border border-[#CBD5E1] p-0.5 bg-[#FAF9F5]">
                      {(["occupied", "vacant", "owner"] as const).map((st) => {
                        const isCur = row.status === st;
                        const label = st === "occupied" ? "임대" : st === "vacant" ? "공실" : "자가";
                        return (
                          <button
                            key={st}
                            type="button"
                            onClick={() => handleStatusChange(idx, st)}
                            className={`px-2 py-1 text-[14px] font-bold rounded-md transition-colors cursor-pointer ${
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
                  <td className="py-2.5 px-2 text-center">
                    <button
                      type="button"
                      disabled={rows.length <= 1}
                      onClick={() => handleDeleteRow(idx)}
                      className={`text-[14px] font-bold p-1 cursor-pointer ${
                        rows.length <= 1 ? "text-[#CBD5E1] cursor-not-allowed" : "text-[#991B1B] hover:bg-[#FEE2E2] rounded"
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
              <td colSpan={3} className="py-3 px-4 text-[16px]">
                합계 ({rows.length}개 층)
                {totals.capRate !== null && (
                  <span className="ml-3 text-[14px] font-bold text-[#065F46] bg-[#D1FAE5] px-2 py-0.5 rounded-full">
                    연 수익률: {totals.capRate.toFixed(2)}%
                  </span>
                )}
              </td>
              <td className="py-3 px-3 text-right text-[16px] text-[#1D4ED8] tabular-nums">
                {totals.totalDeposit.toLocaleString()}만
                <div className="text-[14px] font-bold">
                  {formatKoreanCurrencyReadout(totals.totalDeposit)}
                </div>
              </td>
              <td className="py-3 px-3 text-right text-[16px] text-[#1D4ED8] tabular-nums">
                {totals.totalRent.toLocaleString()}만
                <div className="text-[14px] font-bold">
                  {formatKoreanCurrencyReadout(totals.totalRent)}
                </div>
              </td>
              <td className="py-3 px-3 text-right text-[16px] text-[#475569] tabular-nums">
                {totals.totalMaintenance.toLocaleString()}만
                <div className="text-[14px] font-bold">
                  {formatKoreanCurrencyReadout(totals.totalMaintenance)}
                </div>
              </td>
              <td colSpan={3} className="py-3 px-3 text-right text-[14px] text-[#475569]">
                연간 총 임대수익: {(totals.annualRent).toLocaleString()}만 원
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
