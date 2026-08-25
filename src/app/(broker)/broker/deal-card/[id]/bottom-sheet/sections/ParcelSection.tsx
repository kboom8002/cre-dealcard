"use client";

import React, { useMemo } from "react";
import { checkX05 } from "@/domain/ontology/rules/parcel";

interface ParcelEntry {
  pnu: string;
  landCategory: string;
  areaM2: string;
  shareRatio: string;
  officialPricePerM2: string;
}

interface ParcelSectionProps {
  parcels: ParcelEntry[];
  setParcels: (v: ParcelEntry[]) => void;
  ledgerTotalM2: number;
}

const EMPTY_PARCEL: ParcelEntry = {
  pnu: "", landCategory: "", areaM2: "", shareRatio: "1", officialPricePerM2: "",
};

export function ParcelSection({ parcels, setParcels, ledgerTotalM2 }: ParcelSectionProps) {
  // X05 실시간 교차 검증
  const x05Result = useMemo(() => {
    const parsed = parcels
      .filter(p => p.areaM2)
      .map(p => ({
        ledgerAreaM2: parseFloat(p.areaM2) || 0,
        shareRatio: parseFloat(p.shareRatio) || 1,
      }));
    return checkX05(parsed, ledgerTotalM2);
  }, [parcels, ledgerTotalM2]);

  const updateParcel = (idx: number, field: keyof ParcelEntry, value: string) => {
    const updated = [...parcels];
    updated[idx] = { ...updated[idx], [field]: value };
    setParcels(updated);
  };

  const addParcel = () => setParcels([...parcels, { ...EMPTY_PARCEL }]);
  const removeParcel = (idx: number) => setParcels(parcels.filter((_, i) => i !== idx));

  return (
    <div className="border border-teal-500/30 rounded-xl p-4 bg-teal-500/5 space-y-3">
      <div className="flex justify-between items-center border-b border-teal-500/20 pb-2">
        <span className="text-xs font-bold text-teal-300">📐 필지 정보</span>
        <button
          type="button"
          onClick={addParcel}
          className="text-[10px] text-teal-400 hover:text-teal-300 font-medium"
        >
          + 필지 추가
        </button>
      </div>

      {/* X05 교차 검증 경고 */}
      {!x05Result.passed && (
        <div className="text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2">
          ⚠️ {x05Result.message}
        </div>
      )}

      {parcels.map((parcel, idx) => (
        <div key={idx} className="grid grid-cols-2 gap-2 border border-border/30 rounded-lg p-2.5 relative">
          {parcels.length > 1 && (
            <button
              type="button"
              onClick={() => removeParcel(idx)}
              className="absolute top-1 right-1 text-red-400 text-[10px] hover:text-red-300"
            >
              ✕
            </button>
          )}
          <div className="col-span-2">
            <label className="block text-[10px] text-muted-foreground mb-1">PNU (필지고유번호)</label>
            <input
              type="text"
              placeholder="예: 1114010100-10001-0000"
              value={parcel.pnu}
              onChange={(e) => updateParcel(idx, "pnu", e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
            />
          </div>
          <div>
            <label className="block text-[10px] text-muted-foreground mb-1">지목</label>
            <select
              value={parcel.landCategory}
              onChange={(e) => updateParcel(idx, "landCategory", e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
            >
              <option value="">선택</option>
              <option value="대">대</option>
              <option value="전">전</option>
              <option value="답">답</option>
              <option value="임야">임야</option>
              <option value="잡종지">잡종지</option>
              <option value="공장용지">공장용지</option>
              <option value="창고용지">창고용지</option>
              <option value="도로">도로</option>
              <option value="기타">기타</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-muted-foreground mb-1">면적 (㎡)</label>
            <input
              type="number"
              step="0.01"
              placeholder="예: 450.00"
              value={parcel.areaM2}
              onChange={(e) => updateParcel(idx, "areaM2", e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
            />
          </div>
          <div>
            <label className="block text-[10px] text-muted-foreground mb-1">지분율</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="1"
              placeholder="예: 1.0"
              value={parcel.shareRatio}
              onChange={(e) => updateParcel(idx, "shareRatio", e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
            />
          </div>
          <div>
            <label className="block text-[10px] text-muted-foreground mb-1">공시지가 (원/㎡)</label>
            <input
              type="number"
              placeholder="예: 28000000"
              value={parcel.officialPricePerM2}
              onChange={(e) => updateParcel(idx, "officialPricePerM2", e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
            />
          </div>
        </div>
      ))}
    </div>
  );
}
