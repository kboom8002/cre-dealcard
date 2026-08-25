"use client";

import React from "react";

const UNIT_KINDS = [
  { value: "room", label: "객실 (호텔/모텔)" },
  { value: "bed", label: "병상 (메디컬)" },
  { value: "parking", label: "주차면 (파킹)" },
  { value: "tee", label: "타석 (골프)" },
  { value: "seat", label: "좌석 (F&B/극장)" },
  { value: "other", label: "기타" },
] as const;

const OPERATION_MODELS = [
  { value: "direct", label: "직영" },
  { value: "lease", label: "임대 위탁" },
  { value: "management", label: "위탁 경영" },
  { value: "franchise", label: "프랜차이즈" },
] as const;

interface OperatingPerfSectionProps {
  investmentPosture: string;
  assetType?: string;
  // 기본 숙박 필드 (HospitalitySpec 원래 필드)
  roomCount: string; setRoomCount: (v: string) => void;
  averageDailyRate: string; setAverageDailyRate: (v: string) => void;
  occupancyRate: string; setOccupancyRate: (v: string) => void;
  gopMargin: string; setGopMargin: (v: string) => void;
  // 확장 운영형 필드
  unitKind: string; setUnitKind: (v: string) => void;
  unitCount: string; setUnitCount: (v: string) => void;
  operationModel: string; setOperationModel: (v: string) => void;
  licenceTransferable: boolean | null; setLicenceTransferable: (v: boolean | null) => void;
  annualRevenue: string; setAnnualRevenue: (v: string) => void;
  annualGop: string; setAnnualGop: (v: string) => void;
}

export function OperatingPerfSection({
  investmentPosture, assetType,
  roomCount, setRoomCount,
  averageDailyRate, setAverageDailyRate,
  occupancyRate, setOccupancyRate,
  gopMargin, setGopMargin,
  unitKind, setUnitKind,
  unitCount, setUnitCount,
  operationModel, setOperationModel,
  licenceTransferable, setLicenceTransferable,
  annualRevenue, setAnnualRevenue,
  annualGop, setAnnualGop,
}: OperatingPerfSectionProps) {
  if (investmentPosture !== "operating") return null;

  const isHotel = ["hotel", "resort", "motel", "pension", "guest_house"].some(
    (t) => assetType?.toLowerCase().includes(t) || assetType?.includes("호텔")
  );

  return (
    <div className="border border-amber-500/30 rounded-xl p-4 bg-amber-500/5 space-y-4">
      <div className="flex justify-between items-center border-b border-amber-500/20 pb-2">
        <span className="text-xs font-bold text-amber-300">🏨 운영 실적 (Operating Performance)</span>
        <span className="text-[10px] text-amber-400/80 font-medium">Grade A 승격 필수</span>
      </div>

      {/* 운영 모델 공통 */}
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className="block text-[10px] text-muted-foreground mb-1">운영 단위</label>
          <select
            value={unitKind}
            onChange={(e) => setUnitKind(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
          >
            {UNIT_KINDS.map((u) => (
              <option key={u.value} value={u.value}>{u.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] text-muted-foreground mb-1">총 단위 수</label>
          <input
            type="number"
            placeholder="예: 45"
            value={unitCount || roomCount}
            onChange={(e) => { setUnitCount(e.target.value); setRoomCount(e.target.value); }}
            className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
          />
        </div>
        <div>
          <label className="block text-[10px] text-muted-foreground mb-1">운영 모델</label>
          <select
            value={operationModel}
            onChange={(e) => setOperationModel(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
          >
            {OPERATION_MODELS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] text-muted-foreground mb-1">면허/인허가 양도</label>
          <select
            value={licenceTransferable === null ? "" : String(licenceTransferable)}
            onChange={(e) => setLicenceTransferable(e.target.value === "" ? null : e.target.value === "true")}
            className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
          >
            <option value="">미확인</option>
            <option value="true">양도 가능</option>
            <option value="false">양도 불가</option>
          </select>
        </div>
      </div>

      {/* 숙박형 상세 (호텔/모텔) */}
      {isHotel && (
        <div className="border-t border-amber-500/20 pt-3 space-y-2">
          <p className="text-[10px] text-amber-400 font-semibold">숙박 시설 상세</p>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[10px] text-muted-foreground mb-1">평균 객단가 ADR (만원)</label>
              <input
                type="number"
                placeholder="예: 12"
                value={averageDailyRate}
                onChange={(e) => setAverageDailyRate(e.target.value)}
                className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
              />
            </div>
            <div>
              <label className="block text-[10px] text-muted-foreground mb-1">객실 점유율 OCC (%)</label>
              <input
                type="number"
                placeholder="예: 75"
                value={occupancyRate}
                onChange={(e) => setOccupancyRate(e.target.value)}
                className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
              />
            </div>
          </div>
        </div>
      )}

      {/* 실적 요약 */}
      <div className="border-t border-amber-500/20 pt-3 space-y-2">
        <p className="text-[10px] text-amber-400 font-semibold">연간 실적</p>
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="block text-[10px] text-muted-foreground mb-1">연 매출 (만원)</label>
            <input
              type="number"
              placeholder="예: 150000"
              value={annualRevenue}
              onChange={(e) => setAnnualRevenue(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
            />
          </div>
          <div>
            <label className="block text-[10px] text-muted-foreground mb-1">연 실질 영업이익 GOP (만원)</label>
            <input
              type="number"
              placeholder="예: 45000"
              value={annualGop}
              onChange={(e) => setAnnualGop(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
            />
          </div>
          <div>
            <label className="block text-[10px] text-muted-foreground mb-1">GOP 마진율 (%)</label>
            <input
              type="number"
              placeholder="예: 30"
              value={gopMargin}
              onChange={(e) => setGopMargin(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
