"use client";

import React from "react";

interface DevelopmentSpecSectionProps {
  investmentPosture: string;
  devTargetUse: string;
  setDevTargetUse: (v: string) => void;
  devTargetScalePyung: string;
  setDevTargetScalePyung: (v: string) => void;
  devExpectedSalePricePerPyung: string;
  setDevExpectedSalePricePerPyung: (v: string) => void;
  devConstructionCostPerPyung: string;
  setDevConstructionCostPerPyung: (v: string) => void;
  vacateResponsibility: string;
  setVacateResponsibility: (v: string) => void;
  vacateTenantCount: string;
  setVacateTenantCount: (v: string) => void;
  vacateEstimatedCostManwon: string;
  setVacateEstimatedCostManwon: (v: string) => void;
  vacateEstimatedMonths: string;
  setVacateEstimatedMonths: (v: string) => void;
  permitStatus: string;
  setPermitStatus: (v: string) => void;
  permitEstimatedMonths: string;
  setPermitEstimatedMonths: (v: string) => void;
}

export function DevelopmentSpecSection({
  investmentPosture,
  devTargetUse, setDevTargetUse,
  devTargetScalePyung, setDevTargetScalePyung,
  devExpectedSalePricePerPyung, setDevExpectedSalePricePerPyung,
  devConstructionCostPerPyung, setDevConstructionCostPerPyung,
  vacateResponsibility, setVacateResponsibility,
  vacateTenantCount, setVacateTenantCount,
  vacateEstimatedCostManwon, setVacateEstimatedCostManwon,
  vacateEstimatedMonths, setVacateEstimatedMonths,
  permitStatus, setPermitStatus,
  permitEstimatedMonths, setPermitEstimatedMonths,
}: DevelopmentSpecSectionProps) {
  if (investmentPosture !== 'development') return null;

  return (
    <div className="border border-indigo-500/30 rounded-xl p-4 bg-indigo-500/5 space-y-4">
      <div className="flex justify-between items-center border-b border-indigo-500/20 pb-2">
        <span className="text-xs font-bold text-indigo-300">🏗️ 개발 계획 &amp; 명도 조건 &amp; 인허가</span>
        <span className="text-[10px] text-indigo-400 font-medium">개발형 위젯 및 Grade A 승격 필수</span>
      </div>
      
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 text-[11px] font-bold text-muted-foreground/80">1. 개발 계획</div>
        <div>
          <label className="block text-[10px] text-muted-foreground mb-1">목표 용도</label>
          <select
            value={devTargetUse}
            onChange={(e) => setDevTargetUse(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
          >
            <option value="office">오피스 빌딩</option>
            <option value="commercial">근린생활시설/상가</option>
            <option value="residential">주거/오피스텔</option>
            <option value="mixed">복합개발</option>
            <option value="logistics">물류센터</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] text-muted-foreground mb-1">목표 연면적 (평)</label>
          <input
            type="number"
            placeholder="예: 1200"
            value={devTargetScalePyung}
            onChange={(e) => setDevTargetScalePyung(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
          />
        </div>
        <div>
          <label className="block text-[10px] text-muted-foreground mb-1">예상 분양/매각가 (만원/평)</label>
          <input
            type="number"
            placeholder="예: 4500"
            value={devExpectedSalePricePerPyung}
            onChange={(e) => setDevExpectedSalePricePerPyung(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
          />
        </div>
        <div>
          <label className="block text-[10px] text-muted-foreground mb-1">예상 공사비 (만원/평)</label>
          <input
            type="number"
            placeholder="예: 750"
            value={devConstructionCostPerPyung}
            onChange={(e) => setDevConstructionCostPerPyung(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
          />
        </div>

        <div className="col-span-2 text-[11px] font-bold text-muted-foreground/80 mt-2 border-t border-border/40 pt-2">2. 명도 조건</div>
        <div>
          <label className="block text-[10px] text-muted-foreground mb-1">명도 책임</label>
          <select
            value={vacateResponsibility}
            onChange={(e) => setVacateResponsibility(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
          >
            <option value="seller">매도인 책임 명도</option>
            <option value="buyer">매수인 인수 후 명도</option>
            <option value="negotiation">매도/매수 협의</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] text-muted-foreground mb-1">현재 임차인 수</label>
          <input
            type="number"
            placeholder="예: 8"
            value={vacateTenantCount}
            onChange={(e) => setVacateTenantCount(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
          />
        </div>
        <div>
          <label className="block text-[10px] text-muted-foreground mb-1">예상 명도 비용 (만원)</label>
          <input
            type="number"
            placeholder="예: 5000"
            value={vacateEstimatedCostManwon}
            onChange={(e) => setVacateEstimatedCostManwon(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
          />
        </div>
        <div>
          <label className="block text-[10px] text-muted-foreground mb-1">예상 명도 기간 (개월)</label>
          <input
            type="number"
            placeholder="예: 6"
            value={vacateEstimatedMonths}
            onChange={(e) => setVacateEstimatedMonths(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
          />
        </div>

        <div className="col-span-2 text-[11px] font-bold text-muted-foreground/80 mt-2 border-t border-border/40 pt-2">3. 인허가 리스크</div>
        <div>
          <label className="block text-[10px] text-muted-foreground mb-1">인허가 진행 상태</label>
          <select
            value={permitStatus}
            onChange={(e) => setPermitStatus(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
          >
            <option value="completed">허가 완료</option>
            <option value="in_progress">심의/진행 중</option>
            <option value="not_started">미착수 (매수 후 착수)</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] text-muted-foreground mb-1">예상 인허가 기간 (개월)</label>
          <input
            type="number"
            placeholder="예: 4"
            value={permitEstimatedMonths}
            onChange={(e) => setPermitEstimatedMonths(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground"
          />
        </div>
      </div>
    </div>
  );
}
