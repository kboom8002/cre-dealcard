"use client";

import React from "react";
import { Building2, MapPin, DollarSign, CheckCircle2, ShieldCheck, Sparkles, TrendingUp } from "lucide-react";

interface BlindDealCardPreviewProps {
  title: string;
  shortSummary?: string;
  areaSignal?: string;
  assetType?: string;
  priceBand?: string;
  dealPoints?: string[];
  specs?: {
    landAreaPyung?: number | string;
    totalFloorAreaPyung?: number | string;
    floors?: string;
    buildYear?: number | string;
    elevator?: boolean | string;
    currentUse?: string;
  };
  fitSummary?: string;
  hookCopy?: string;
  curiosityScore?: number;
}

export function BlindDealCardPreview({
  title,
  shortSummary,
  areaSignal,
  assetType,
  priceBand,
  dealPoints = [],
  specs = {},
  fitSummary,
  hookCopy,
  curiosityScore,
}: BlindDealCardPreviewProps) {
  return (
    <div className="rounded-2xl border-2 border-primary/30 bg-gradient-to-b from-card to-background p-5 shadow-lg space-y-4 relative overflow-hidden">
      {/* Decorative background glow */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-2xl pointer-events-none -mr-8 -mt-8" />

      {/* Top Badges */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {areaSignal && (
            <span className="px-2.5 py-1 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {areaSignal}
            </span>
          )}
          {assetType && (
            <span className="px-2.5 py-1 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 text-xs font-semibold flex items-center gap-1">
              <Building2 className="w-3 h-3" />
              {assetType}
            </span>
          )}
          {priceBand && (
            <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-xs font-bold flex items-center gap-1">
              <DollarSign className="w-3 h-3" />
              {priceBand}
            </span>
          )}
        </div>
        
        <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[11px] font-medium flex items-center gap-1 border border-amber-500/20">
          <ShieldCheck className="w-3 h-3" />
          블라인드 보호
        </span>
      </div>

      {/* Main Title & Hook */}
      <div className="space-y-1.5 pt-1">
        <h2 className="text-xl font-black tracking-tight text-foreground leading-snug">
          {title}
        </h2>
        {(hookCopy || shortSummary) && (
          <p className="text-sm text-muted-foreground leading-relaxed">
            {hookCopy || shortSummary}
          </p>
        )}
      </div>

      {/* 3-Core Deal Highlights */}
      {dealPoints && dealPoints.length > 0 && (
        <div className="space-y-2 bg-primary/[0.04] border border-primary/20 rounded-xl p-3.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-primary">
            <Sparkles className="w-3.5 h-3.5" />
            <span>핵심 딜 포인트</span>
          </div>
          <div className="space-y-1.5">
            {dealPoints.map((point, idx) => (
              <div key={idx} className="flex items-start gap-2 text-xs text-foreground font-medium leading-relaxed">
                <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                <span>{point}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Building Physical Specs Grid */}
      <div className="grid grid-cols-2 gap-2 text-xs pt-1">
        {specs.landAreaPyung && (
          <div className="bg-muted/40 rounded-lg p-2 flex items-center justify-between border border-border/40">
            <span className="text-muted-foreground">대지면적</span>
            <span className="font-semibold text-foreground">{specs.landAreaPyung}평</span>
          </div>
        )}
        {specs.totalFloorAreaPyung && (
          <div className="bg-muted/40 rounded-lg p-2 flex items-center justify-between border border-border/40">
            <span className="text-muted-foreground">연면적</span>
            <span className="font-semibold text-foreground">{specs.totalFloorAreaPyung}평</span>
          </div>
        )}
        {specs.floors && (
          <div className="bg-muted/40 rounded-lg p-2 flex items-center justify-between border border-border/40">
            <span className="text-muted-foreground">규모</span>
            <span className="font-semibold text-foreground">{specs.floors}</span>
          </div>
        )}
        {specs.buildYear && (
          <div className="bg-muted/40 rounded-lg p-2 flex items-center justify-between border border-border/40">
            <span className="text-muted-foreground">준공연도</span>
            <span className="font-semibold text-foreground">{specs.buildYear}년</span>
          </div>
        )}
      </div>

      {/* Fit Summary / Target Buyer */}
      {fitSummary && (
        <div className="text-xs bg-muted/30 border border-border/40 rounded-xl p-3 flex items-start gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-foreground block mb-0.5">추천 매수자</span>
            <p className="text-muted-foreground leading-relaxed">{fitSummary}</p>
          </div>
        </div>
      )}

      {/* Safe Sharing Assurance Banner */}
      <div className="text-[11px] text-muted-foreground text-center bg-secondary/50 rounded-lg py-1.5 px-3 border border-border/40">
        🔒 정확한 번지수, 소유주/임차인 정보는 안전하게 마스킹되어 있습니다.
      </div>
    </div>
  );
}
