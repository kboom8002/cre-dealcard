"use client";

import React from "react";

interface SectionalSpecSectionProps {
  assetType?: string;
  sectionalOwnerCount: string;
  setSectionalOwnerCount: (v: string) => void;
  sectionalLandSharePct: string;
  setSectionalLandSharePct: (v: string) => void;
  sectionalManagementBody: string;
  setSectionalManagementBody: (v: string) => void;
  sectionalMasterLease: string;
  setSectionalMasterLease: (v: string) => void;
  /** C32: 공동담보 그룹명 */
  jointCollateralGroup: string;
  setJointCollateralGroup: (v: string) => void;
}

export function SectionalSpecSection({
  assetType,
  sectionalOwnerCount, setSectionalOwnerCount,
  sectionalLandSharePct, setSectionalLandSharePct,
  sectionalManagementBody, setSectionalManagementBody,
  sectionalMasterLease, setSectionalMasterLease,
  jointCollateralGroup, setJointCollateralGroup,
}: SectionalSpecSectionProps) {
  const isSectional = ['officetel', 'knowledge_center', 'retail_strip', 'serviced_residence'].some(
    t => assetType?.toLowerCase().includes(t) || assetType?.includes('오피스텔') || assetType?.includes('지식산업') || assetType?.includes('상가')
  );

  if (!isSectional) return null;

  // C30: 대지지분 합계 실시간 검증
  const landShareVal = parseFloat(sectionalLandSharePct) || 0;
  const landShareWarning = landShareVal > 0 && Math.abs(landShareVal - 100) > 1;

  return (
    <div className="border border-purple-500/30 rounded-xl p-4 bg-purple-500/5 space-y-3">
      <div className="flex justify-between items-center border-b border-purple-500/20 pb-2">
        <span className="text-xs font-bold text-purple-300">📊 구분소유 상세 정보</span>
        <span className="text-[10px] text-purple-400 font-medium">지분/권리관계 확인</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] text-muted-foreground mb-1">구분소유자 수 (명)</label>
          <input
            type="number"
            placeholder="예: 45"
            value={sectionalOwnerCount}
            onChange={(e) => setSectionalOwnerCount(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
          />
        </div>
        <div>
          <label className="block text-[10px] text-muted-foreground mb-1">토지지분 비율 (%)</label>
          <input
            type="number"
            step="0.1"
            placeholder="예: 100"
            value={sectionalLandSharePct}
            onChange={(e) => setSectionalLandSharePct(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
          />
          {landShareWarning && (
            <p className="text-[10px] text-red-400 mt-0.5">⚠️ 대지지분 비율이 100%와 ±1% 이상 차이납니다. 확인해 주세요.</p>
          )}
        </div>
        <div>
          <label className="block text-[10px] text-muted-foreground mb-1">관리단 구성 여부</label>
          <select
            value={sectionalManagementBody}
            onChange={(e) => setSectionalManagementBody(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
          >
            <option value="yes">관리단 구성됨</option>
            <option value="no">관리단 없음</option>
            <option value="unknown">미확인</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] text-muted-foreground mb-1">마스터리스 계약</label>
          <select
            value={sectionalMasterLease}
            onChange={(e) => setSectionalMasterLease(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
          >
            <option value="no">없음 (개별 임대)</option>
            <option value="yes">있음 (통임대 운영중)</option>
          </select>
        </div>
        {/* C32: 공동담보 그룹명 */}
        <div className="col-span-2">
          <label className="block text-[10px] text-muted-foreground mb-1">공동담보 그룹명 (해당 시)</label>
          <input
            type="text"
            placeholder="예: 강남역 삼성타운 A블록"
            value={jointCollateralGroup}
            onChange={(e) => setJointCollateralGroup(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
          />
          {jointCollateralGroup && (
            <p className="text-[10px] text-purple-400/70 mt-0.5">
              ℹ️ 공동담보 설정 시 그룹 내 채권최고액이 IM 리스크에 자동 반영됩니다.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
