"use client";

import React, { useState } from "react";
import type { RentRollRowItem, RentRollStatus } from "@/lib/rent-roll/tsv-parser";
import { formatKoreanCurrencyReadout, parseManwonAmount } from "@/lib/rent-roll/tsv-parser";
import { parseLeaseExpiryDate } from "@/lib/rent-roll/date-parser";

export interface MobileRentRollCardsProps {
  rows: RentRollRowItem[];
  onChange: (rows: RentRollRowItem[]) => void;
  onAddFloor?: () => void;
  className?: string;
}

export function MobileRentRollCards({
  rows,
  onChange,
  onAddFloor,
  className = "",
}: MobileRentRollCardsProps) {
  const [activeFloorIndex, setActiveFloorIndex] = useState<number>(0);

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

  const handleDeleteRow = (index: number) => {
    if (rows.length <= 1) return;
    const next = rows.filter((_, idx) => idx !== index);
    onChange(next);
    if (activeFloorIndex >= next.length) {
      setActiveFloorIndex(Math.max(0, next.length - 1));
    }
  };

  const currentFloor = rows[activeFloorIndex] || rows[0];

  return (
    <div className={`space-y-4 ${className}`} data-testid="mobile-rent-roll-cards">
      {/* Floor navigation tabs (<640px) */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        {rows.map((row, idx) => {
          const isActive = idx === activeFloorIndex;
          const isVacant = row.status === "vacant";
          return (
            <button
              key={row.id || idx}
              type="button"
              onClick={() => setActiveFloorIndex(idx)}
              className={`min-h-[48px] px-4 py-2 rounded-xl text-[16px] font-bold border transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                isActive
                  ? "bg-[#0F172A] text-white border-[#0F172A] shadow-sm"
                  : isVacant
                  ? "bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]"
                  : "bg-white text-[#334155] border-[#CBD5E1] hover:bg-[#F3F2EE]"
              }`}
            >
              <span>{row.floor}</span>
              <span
                className={`text-[14px] px-1.5 py-0.5 rounded ${
                  isActive ? "bg-white/20 text-white" : "bg-[#F3F2EE] text-[#475569]"
                }`}
              >
                {row.status === "vacant" ? "공실" : row.status === "owner" ? "자가" : "임대중"}
              </span>
            </button>
          );
        })}

        {onAddFloor && (
          <button
            type="button"
            onClick={onAddFloor}
            className="min-h-[48px] px-3 py-2 rounded-xl text-[15px] font-semibold text-[#1D4ED8] bg-[#EFF6FF] border border-[#BFDBFE] hover:bg-[#DBEAFE] cursor-pointer whitespace-nowrap"
          >
            + 층 추가
          </button>
        )}
      </div>

      {/* Active Floor Card Detail */}
      {currentFloor && (
        <div className="bg-white rounded-2xl border-2 border-[#CBD5E1] p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0]">
            <div className="flex items-center gap-2">
              <span className="text-[20px] font-extrabold text-[#0F172A]">
                {currentFloor.floor} 층 입력
              </span>
              <span className="text-[14px] text-[#475569]">
                ({activeFloorIndex + 1} / {rows.length})
              </span>
            </div>

            {rows.length > 1 && (
              <button
                type="button"
                onClick={() => handleDeleteRow(activeFloorIndex)}
                className="text-[14px] font-semibold text-[#991B1B] hover:underline cursor-pointer min-h-[48px] px-2 flex items-center"
              >
                삭제
              </button>
            )}
          </div>

          {/* Status selector 3 pills */}
          <div>
            <label className="block text-[15px] font-bold text-[#0F172A] mb-2">
              임대 현황 (상태)
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(["occupied", "vacant", "owner"] as const).map((st) => {
                const label = st === "occupied" ? "임대중" : st === "vacant" ? "공실" : "자가";
                const isSelected = currentFloor.status === st;
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => handleStatusChange(activeFloorIndex, st)}
                    className={`min-h-[48px] py-2.5 px-3 rounded-xl text-[16px] font-bold border transition-all cursor-pointer ${
                      isSelected
                        ? "bg-[#0F172A] text-white border-[#0F172A] shadow-sm"
                        : "bg-[#FAF9F5] text-[#334155] border-[#CBD5E1] hover:bg-white"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Floor & Unit */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[14px] font-semibold text-[#334155] mb-1">
                층 표기
              </label>
              <input
                type="text"
                value={currentFloor.floor}
                onChange={(e) => handleUpdateRow(activeFloorIndex, { floor: e.target.value })}
                className="w-full min-h-[48px] px-3 text-[17px] rounded-xl border border-[#64748B] focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/20 outline-none"
              />
            </div>
            <div>
              <label className="block text-[14px] font-semibold text-[#334155] mb-1">
                호수/위치
              </label>
              <input
                type="text"
                value={currentFloor.unit}
                onChange={(e) => handleUpdateRow(activeFloorIndex, { unit: e.target.value })}
                className="w-full min-h-[48px] px-3 text-[17px] rounded-xl border border-[#64748B] focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/20 outline-none"
              />
            </div>
          </div>

          {/* Use / Tenant */}
          <div>
            <label className="block text-[14px] font-semibold text-[#334155] mb-1">
              업종 또는 임차인명
            </label>
            <input
              type="text"
              disabled={currentFloor.status === "vacant"}
              value={currentFloor.use}
              placeholder={currentFloor.status === "vacant" ? "공실 (입력 불필요)" : "예: 카페, 의원, 사무실"}
              onChange={(e) => handleUpdateRow(activeFloorIndex, { use: e.target.value })}
              className={`w-full min-h-[48px] px-3 text-[17px] rounded-xl border outline-none ${
                currentFloor.status === "vacant"
                  ? "bg-[#F1F5F9] text-[#94A3B8] border-[#CBD5E1]"
                  : "border-[#64748B] focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/20"
              }`}
            />
          </div>

          {/* Deposit & Rent */}
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[14px] font-semibold text-[#334155]">
                  보증금 (만 원)
                </label>
                <span className="text-[14px] font-bold text-[#1D4ED8]">
                  {formatKoreanCurrencyReadout(currentFloor.depositManwon)}
                </span>
              </div>
              <input
                type="number"
                value={currentFloor.depositManwon || ""}
                placeholder="0"
                onChange={(e) =>
                  handleUpdateRow(activeFloorIndex, {
                    depositManwon: parseManwonAmount(e.target.value).manwon,
                  })
                }
                className="w-full min-h-[48px] px-3 text-[18px] font-semibold text-right tabular-nums rounded-xl border border-[#64748B] focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/20 outline-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[14px] font-semibold text-[#334155]">
                  월 임대료 (만 원)
                </label>
                <span className="text-[14px] font-bold text-[#1D4ED8]">
                  {formatKoreanCurrencyReadout(currentFloor.monthlyRentManwon)}
                </span>
              </div>
              <input
                type="number"
                disabled={currentFloor.status === "vacant"}
                value={currentFloor.status === "vacant" ? "" : (currentFloor.monthlyRentManwon || "")}
                placeholder={currentFloor.status === "vacant" ? "0" : "0"}
                onChange={(e) =>
                  handleUpdateRow(activeFloorIndex, {
                    monthlyRentManwon: parseManwonAmount(e.target.value).manwon,
                  })
                }
                className={`w-full min-h-[48px] px-3 text-[18px] font-semibold text-right tabular-nums rounded-xl border outline-none ${
                  currentFloor.status === "vacant"
                    ? "bg-[#F1F5F9] text-[#94A3B8] border-[#CBD5E1]"
                    : "border-[#64748B] focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/20"
                }`}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[14px] font-semibold text-[#334155]">
                  월 관리비 (만 원)
                </label>
                <span className="text-[14px] font-bold text-[#1D4ED8]">
                  {formatKoreanCurrencyReadout(currentFloor.maintenanceManwon)}
                </span>
              </div>
              <input
                type="number"
                disabled={currentFloor.status === "vacant"}
                value={currentFloor.status === "vacant" ? "" : (currentFloor.maintenanceManwon || "")}
                placeholder={currentFloor.status === "vacant" ? "0" : "0"}
                onChange={(e) =>
                  handleUpdateRow(activeFloorIndex, {
                    maintenanceManwon: parseManwonAmount(e.target.value).manwon,
                  })
                }
                className={`w-full min-h-[48px] px-3 text-[18px] font-semibold text-right tabular-nums rounded-xl border outline-none ${
                  currentFloor.status === "vacant"
                    ? "bg-[#F1F5F9] text-[#94A3B8] border-[#CBD5E1]"
                    : "border-[#64748B] focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#1D4ED8]/20"
                }`}
              />
            </div>
          </div>

          {/* Lease Expiry */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[14px] font-semibold text-[#334155]">
                계약 만기일
              </label>
              {currentFloor.isExpired && (
                <span className="text-[14px] font-bold text-[#991B1B]">
                  ⚠️ 만기 지남, 연장 확인
                </span>
              )}
            </div>
            <input
              type="text"
              disabled={currentFloor.status === "vacant"}
              value={currentFloor.leaseExpiry}
              placeholder="예: 2027.05, 27년 5월, 만기 2년"
              onChange={(e) => handleExpiryChange(activeFloorIndex, e.target.value)}
              className={`w-full min-h-[48px] px-3 text-[17px] rounded-xl border outline-none ${
                currentFloor.status === "vacant"
                  ? "bg-[#F1F5F9] text-[#94A3B8] border-[#CBD5E1]"
                  : currentFloor.isExpired
                  ? "bg-[#FEF2F2] border-[#FCA5A5] text-[#991B1B]"
                  : "border-[#64748B] focus:border-[#1D4ED8]"
              }`}
            />
            {currentFloor.normalizedExpiry && !currentFloor.isExpired && (
              <p className="text-[14px] text-[#475569] mt-1">
                정규화: {currentFloor.normalizedExpiry}
              </p>
            )}
          </div>

          {/* Next / Prev Buttons */}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              disabled={activeFloorIndex === 0}
              onClick={() => setActiveFloorIndex((prev) => Math.max(0, prev - 1))}
              className={`min-h-[48px] px-4 py-2 rounded-xl text-[15px] font-semibold cursor-pointer ${
                activeFloorIndex === 0
                  ? "text-[#94A3B8] cursor-not-allowed"
                  : "text-[#334155] hover:bg-[#F3F2EE]"
              }`}
            >
              ‹ 이전 층
            </button>

            {activeFloorIndex < rows.length - 1 ? (
              <button
                type="button"
                onClick={() => setActiveFloorIndex((prev) => prev + 1)}
                className="min-h-[48px] px-5 py-2.5 rounded-xl text-[16px] font-bold bg-[#1D4ED8] text-white hover:bg-[#1E40AF] cursor-pointer shadow-sm"
              >
                다음 층 ›
              </button>
            ) : onAddFloor ? (
              <button
                type="button"
                onClick={onAddFloor}
                className="min-h-[48px] px-5 py-2.5 rounded-xl text-[16px] font-bold bg-[#065F46] text-white hover:bg-[#047857] cursor-pointer shadow-sm"
              >
                + 새 층 추가
              </button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
