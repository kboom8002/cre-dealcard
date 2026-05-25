"use client";

import React from "react";

interface MatchReasonBreakdownProps {
  stage1Passed: boolean;
  failReasons?: string[];
  stage2Similarity: number;
  stage3Score: number;
  purposeProfile: string;
}

export function MatchReasonBreakdown({
  stage1Passed,
  failReasons = [],
  stage2Similarity,
  stage3Score,
  purposeProfile,
}: MatchReasonBreakdownProps) {
  return (
    <div className="mt-3 pt-3 border-t border-black/5 dark:border-white/5 space-y-3">
      <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
        🎯 3-Stage 매칭 엔진 분석 결과
      </p>

      <div className="relative pl-5 space-y-4 before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-0.5 before:bg-muted">
        {/* Stage 1: Hard Filter */}
        <div className="relative">
          <div className={`absolute -left-[23px] top-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shadow-sm ${
            stage1Passed ? "bg-emerald-500" : "bg-rose-500"
          }`}>
            {stage1Passed ? "✓" : "✕"}
          </div>
          <div className="space-y-0.5">
            <p className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
              Stage 1: 조건 하드 필터
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-medium ${
                stage1Passed
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                  : "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
              }`}>
                {stage1Passed ? "적합 통과" : "조건 불일치"}
              </span>
            </p>
            {stage1Passed ? (
              <p className="text-[11px] text-muted-foreground">
                권역, 가격대, 자산 유형 조건이 모두 부합합니다.
              </p>
            ) : (
              <div className="text-[11px] text-rose-600 dark:text-rose-400 font-medium pl-1.5 border-l-2 border-rose-300 dark:border-rose-800 space-y-0.5 mt-1">
                {failReasons.length > 0 ? (
                  failReasons.map((reason, idx) => <p key={idx}>• {reason}</p>)
                ) : (
                  <p>• 선호 조건과 매물 스펙이 부합하지 않습니다.</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Stage 2: AI Semantic Similarity */}
        <div className="relative">
          <div className={`absolute -left-[23px] top-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shadow-sm ${
            stage1Passed ? "bg-blue-500" : "bg-slate-300 dark:bg-slate-800"
          }`}>
            2
          </div>
          <div className="space-y-0.5">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              Stage 2: AI 시맨틱 분석
              {stage1Passed && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full font-medium bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
                  유사도 {(stage2Similarity * 100).toFixed(1)}%
                </span>
              )}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {stage1Passed ? (
                <>
                  매수 성향 메모와 매물 소안 간의 의도 매칭 분석 완료.
                  <span className="block mt-1 w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1 overflow-hidden">
                    <span
                      className="bg-blue-500 h-full block rounded-full"
                      style={{ width: `${Math.min(100, Math.max(0, stage2Similarity * 100))}%` }}
                    />
                  </span>
                </>
              ) : (
                "하드 필터 미통과로 분석이 생략되었습니다."
              )}
            </p>
          </div>
        </div>

        {/* Stage 3: Ensemble Scoring */}
        <div className="relative">
          <div className={`absolute -left-[23px] top-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shadow-sm ${
            stage1Passed ? "bg-purple-500" : "bg-slate-300 dark:bg-slate-800"
          }`}>
            3
          </div>
          <div className="space-y-0.5">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              Stage 3: 앙상블 종합 스코어링
              {stage1Passed && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full font-medium bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-300">
                  {stage3Score.toFixed(1)}점
                </span>
              )}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {stage1Passed ? (
                <span>
                  매수 목적(<b>{purposeProfile}</b>) 가중치 프로파일이 적용되어 최종 매칭률을 도출했습니다.
                </span>
              ) : (
                "최종 종합 스코어링이 실행되지 않았습니다."
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
