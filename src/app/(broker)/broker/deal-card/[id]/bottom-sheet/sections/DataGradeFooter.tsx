"use client";

import React from "react";
import type { NextStep, DataGrade } from "@/domain/asset/grade-engine";
import { getKoreanFieldLabel } from "@/constants/ui-lexicon";

interface LockedMetric {
  slotKey: string;
  label: string;
  value: string;
}

interface DataGradeFooterProps {
  currentGrade?: string;
  gradeUpItems?: Array<{ field: string; label: string; gradeContribution: string }>;
  nextStep?: NextStep;
  lockedMetrics?: LockedMetric[];
}

export function DataGradeFooter({
  currentGrade,
  gradeUpItems,
  nextStep,
  lockedMetrics,
}: DataGradeFooterProps) {
  return (
    <div className="space-y-3">
      {/* NextStep 안내 카드 */}
      {nextStep && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <p className="text-xs font-medium text-amber-400">
            💡 <strong>{getKoreanFieldLabel(nextStep.slotLabel)}</strong>을(를) 입력하면
            → {nextStep.unlocks?.join(", ")}이(가) 열립니다
          </p>
          <span className="text-[11px] text-amber-400/80">
            [{currentGrade} → {nextStep.gradeAfter}등급] · {nextStep.axis === "L" ? "권리·임대 정보" : "건물 제원 정보"} · 약 {nextStep.effortMinutes}분 소요
          </span>
        </div>
      )}

      {/* 잠긴 지표 인라인 (등급 C/D에서 상위 지표 비활성 표시) */}
      {lockedMetrics && lockedMetrics.length > 0 && (
        <div className="space-y-1">
          {lockedMetrics.map((m) => (
            <div key={m.slotKey} className="flex items-center gap-2 text-muted-foreground text-[11px]">
              <span>🔒</span>
              <span>{getKoreanFieldLabel(m.label)}: {m.value}</span>
              <span className="text-muted-foreground/50">— 등급 {currentGrade}에서 비공개</span>
            </div>
          ))}
        </div>
      )}

      {/* 등급 업 필요 항목 */}
      {gradeUpItems && gradeUpItems.length > 0 && (
        <div className="space-y-1">
          <p className="text-[11px] text-muted-foreground font-medium">완성도 등급을 높이기 위해 권장되는 항목:</p>
          {gradeUpItems.map((item, i) => (
            <div key={i} className="flex items-center justify-between text-[11px]">
              <span className="text-amber-600 dark:text-amber-400">⚠️ {getKoreanFieldLabel(item.label)}</span>
              <span className="text-muted-foreground bg-secondary/80 px-1.5 py-0.5 rounded text-[10px]">{item.gradeContribution}</span>
            </div>
          ))}
        </div>
      )}

      {/* 등급별 IM 구성 안내 */}
      <div className="flex items-center gap-2">
        <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-semibold ${
          currentGrade === "C" || currentGrade === "D"
            ? "bg-amber-500/15 text-amber-500"
            : "bg-emerald-500/15 text-emerald-500"
        }`}>
          {currentGrade === "C" || currentGrade === "D"
            ? "⚠️ 기본 정보 보강 권장"
            : `🟢 9면 표준 IM 작성 가능 (${currentGrade}등급)`}
        </span>
        {currentGrade !== "A" && (
          <span className="text-[11px] px-2.5 py-0.5 rounded-full font-medium bg-blue-500/15 text-blue-400">
            💡 A등급 달성 시 상세 수지·가치 분석 포함
          </span>
        )}
      </div>
    </div>
  );
}
