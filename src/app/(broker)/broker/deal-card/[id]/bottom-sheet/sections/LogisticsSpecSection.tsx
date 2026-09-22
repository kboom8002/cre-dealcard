"use client";

import React from "react";

interface LogisticsSpecSectionProps {
  stage: 'basic' | 'pro';
  assetType?: string;
  ceilingHeight: string; setCeilingHeight: (v: string) => void;
  columnSpan: string; setColumnSpan: (v: string) => void;
  floorLoadTon: string; setFloorLoadTon: (v: string) => void;
  powerCapacity: string; setPowerCapacity: (v: string) => void;
  dockCount: string; setDockCount: (v: string) => void;
  dockLevelerCount: string; setDockLevelerCount: (v: string) => void;
  maxVehicleTon: string; setMaxVehicleTon: (v: string) => void;
  loadingArea: string; setLoadingArea: (v: string) => void;
  coldStorageArea: string; setColdStorageArea: (v: string) => void;
  coldStorageType: string; setColdStorageType: (v: string) => void;
  vehicleAccessType: string; setVehicleAccessType: (v: string) => void;
  fireRating: string; setFireRating: (v: string) => void;
  sprinkler: boolean; setSprinkler: (v: boolean) => void;
  hasOfficeSpace: boolean; setHasOfficeSpace: (v: boolean) => void;
  officeArea: string; setOfficeArea: (v: string) => void;
  icName: string; setIcName: (v: string) => void;
  distanceToIc: string; setDistanceToIc: (v: string) => void;
}

/**
 * W-2: Logistics center spec fields — extracted from im-data-bottom-sheet.tsx
 */
export function LogisticsSpecSection({
  stage, assetType,
  ceilingHeight, setCeilingHeight,
  columnSpan, setColumnSpan,
  floorLoadTon, setFloorLoadTon,
  powerCapacity, setPowerCapacity,
  dockCount, setDockCount,
  dockLevelerCount, setDockLevelerCount,
  maxVehicleTon, setMaxVehicleTon,
  loadingArea, setLoadingArea,
  coldStorageArea, setColdStorageArea,
  coldStorageType, setColdStorageType,
  vehicleAccessType, setVehicleAccessType,
  fireRating, setFireRating,
  sprinkler, setSprinkler,
  hasOfficeSpace, setHasOfficeSpace,
  officeArea, setOfficeArea,
  icName, setIcName,
  distanceToIc, setDistanceToIc,
}: LogisticsSpecSectionProps) {
  const isLogistics = assetType?.includes("물류") || assetType?.toLowerCase().includes("logistics");
  if (stage !== 'pro' || !isLogistics) return null;

  const inputClass = "w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary";

  return (
    <div className="border border-border/80 rounded-xl p-4 bg-secondary/20 space-y-4">
      <div className="flex justify-between items-center border-b border-border/60 pb-2">
        <span className="text-xs font-bold text-foreground">🏗️ 물류센터 상세 스펙</span>
        <span className="text-[10px] text-muted-foreground">정밀한 분석을 위해 수동 입력을 권장합니다.</span>
      </div>
      
      <div className="grid grid-cols-2 gap-3">
        {/* 1. 건물 스펙 */}
        <div className="col-span-2 text-[11px] font-bold text-muted-foreground/80 mt-1">기본 제원</div>
        <div>
          <label className="block text-[10px] text-muted-foreground mb-1">천장고 (m)</label>
          <input type="number" step="0.1" placeholder="예: 10.5" value={ceilingHeight}
            onChange={(e) => setCeilingHeight(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="block text-[10px] text-muted-foreground mb-1">기둥 간격 (m)</label>
          <input type="text" placeholder="예: 10x12" value={columnSpan}
            onChange={(e) => setColumnSpan(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="block text-[10px] text-muted-foreground mb-1">바닥 하중 (ton/㎡)</label>
          <input type="number" step="0.1" placeholder="예: 5.0" value={floorLoadTon}
            onChange={(e) => setFloorLoadTon(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="block text-[10px] text-muted-foreground mb-1">전기 용량 (kW)</label>
          <input type="number" placeholder="예: 500" value={powerCapacity}
            onChange={(e) => setPowerCapacity(e.target.value)} className={inputClass} />
        </div>

        {/* 2. 도크/하역 */}
        <div className="col-span-2 text-[11px] font-bold text-muted-foreground/80 mt-2 border-t border-border/40 pt-2">도크 및 접안</div>
        <div>
          <label className="block text-[10px] text-muted-foreground mb-1">도크 수</label>
          <input type="number" placeholder="예: 24" value={dockCount}
            onChange={(e) => setDockCount(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="block text-[10px] text-muted-foreground mb-1">도크 레벨러 수</label>
          <input type="number" placeholder="예: 12" value={dockLevelerCount}
            onChange={(e) => setDockLevelerCount(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="block text-[10px] text-muted-foreground mb-1">최대 접안 차량 (톤)</label>
          <input type="number" placeholder="예: 25" value={maxVehicleTon}
            onChange={(e) => setMaxVehicleTon(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="block text-[10px] text-muted-foreground mb-1">하역장 면적 (평)</label>
          <input type="number" placeholder="예: 150" value={loadingArea}
            onChange={(e) => setLoadingArea(e.target.value)} className={inputClass} />
        </div>

        {/* 3. 냉동/냉장 */}
        <div className="col-span-2 text-[11px] font-bold text-muted-foreground/80 mt-2 border-t border-border/40 pt-2">설비 및 보관</div>
        <div>
          <label className="block text-[10px] text-muted-foreground mb-1">냉동/냉장 면적 (평)</label>
          <input type="number" placeholder="예: 500" value={coldStorageArea}
            onChange={(e) => setColdStorageArea(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="block text-[10px] text-muted-foreground mb-1">냉장 유형</label>
          <select value={coldStorageType} onChange={(e) => setColdStorageType(e.target.value)} className={inputClass}>
            <option value="none">없음</option>
            <option value="frozen">냉동 전용</option>
            <option value="chilled">냉장 전용</option>
            <option value="both">냉동/냉장 혼용</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] text-muted-foreground mb-1">차량 접근 방식</label>
          <select value={vehicleAccessType} onChange={(e) => setVehicleAccessType(e.target.value)} className={inputClass}>
            <option value="dock">도크 접안</option>
            <option value="ramp">램프 이동</option>
            <option value="both">혼합 방식</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] text-muted-foreground mb-1">내화 등급</label>
          <input type="text" placeholder="예: 1급 내화" value={fireRating}
            onChange={(e) => setFireRating(e.target.value)} className={inputClass} />
        </div>

        {/* 4. 부대시설 및 안전 */}
        <div className="col-span-2 text-[11px] font-bold text-muted-foreground/80 mt-2 border-t border-border/40 pt-2">소방 및 부대시설</div>
        <div className="flex items-center gap-2 py-1">
          <input type="checkbox" id="sprinkler" checked={sprinkler}
            onChange={(e) => setSprinkler(e.target.checked)}
            className="rounded border-border text-primary focus:ring-primary w-4 h-4 bg-background" />
          <label htmlFor="sprinkler" className="text-xs text-muted-foreground cursor-pointer">스프링클러 작동 완료</label>
        </div>
        <div className="flex items-center gap-2 py-1">
          <input type="checkbox" id="hasOfficeSpace" checked={hasOfficeSpace}
            onChange={(e) => setHasOfficeSpace(e.target.checked)}
            className="rounded border-border text-primary focus:ring-primary w-4 h-4 bg-background" />
          <label htmlFor="hasOfficeSpace" className="text-xs text-muted-foreground cursor-pointer">사무공간 보유</label>
        </div>
        {hasOfficeSpace && (
          <div className="col-span-2">
            <label className="block text-[10px] text-muted-foreground mb-1">사무공간 면적 (평)</label>
            <input type="number" placeholder="예: 50" value={officeArea}
              onChange={(e) => setOfficeArea(e.target.value)} className={inputClass} />
          </div>
        )}

        {/* 5. 고속도로 IC 정보 */}
        <div className="col-span-2 text-[11px] font-bold text-muted-foreground/80 mt-2 border-t border-border/40 pt-2">교통 입지 (고속도로 IC)</div>
        <div>
          <label className="block text-[10px] text-muted-foreground mb-1">IC 명칭</label>
          <input type="text" placeholder="예: 성수IC" value={icName}
            onChange={(e) => setIcName(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="block text-[10px] text-muted-foreground mb-1">IC까지의 거리 (km)</label>
          <input type="number" step="0.1" placeholder="예: 3.5" value={distanceToIc}
            onChange={(e) => setDistanceToIc(e.target.value)} className={inputClass} />
        </div>
      </div>
    </div>
  );
}
