"use client";

import React, { useState } from "react";

interface MatchStageBreakdownProps {
  stage1Passed: boolean;
  stage1Details: { region: boolean; budget: boolean; asset: boolean };
  stage2Similarity: number;
  stage3Score: number;
  stage3Weights: Record<string, number>;
  grade: "S" | "A" | "B" | "C";
  matchId?: string;
}

const GRADE_CONFIG = {
  S: { color: "text-emerald-500 bg-emerald-50 border-emerald-200", label: "최우선 매칭 (S)" },
  A: { color: "text-blue-500 bg-blue-50 border-blue-200", label: "우수 매칭 (A)" },
  B: { color: "text-amber-500 bg-amber-50 border-amber-200", label: "참고 가능 (B)" },
  C: { color: "text-rose-500 bg-rose-50 border-rose-200", label: "적합도 낮음 (C)" },
};

const STAGE1_LABELS: Record<string, string> = {
  region: "지역 조건",
  budget: "예산 부합",
  asset: "자산 유형",
};

export function MatchStageBreakdown({
  stage1Passed,
  stage1Details = { region: false, budget: false, asset: false },
  stage2Similarity,
  stage3Score,
  stage3Weights = {},
  grade,
  matchId,
}: MatchStageBreakdownProps) {
  const [feedback, setFeedback] = useState<"like" | "dislike" | null>(null);
  const [showAgreement, setShowAgreement] = useState(false);
  const [copied, setCopied] = useState(false);
  const config = GRADE_CONFIG[grade] || GRADE_CONFIG.C;

  const handleFeedback = (type: "like" | "dislike") => {
    setFeedback(type);
    console.log(`[Feedback Saved] MatchId: ${matchId ?? "temp"}, Type: ${type}`);
  };

  const getAgreementTemplate = () => {
    const today = new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
    return `[공동중개 업무협약 확인서]
--------------------------------------------
• 발급일자: ${today}
• 대상 매칭: SSoT 매칭 (ID: ${matchId ?? "임시"})
• 매칭등급: ${grade}등급 (적합도 점수: ${Math.round(stage3Score)}점)
--------------------------------------------
1. [공동중개 원칙 확약]
본 협약에 서명 또는 동의한 양측 중개사는 신의성실의 원칙에 의거하여 공동중개를 성실히 수행할 것을 확약합니다.

2. [중개보수 수수료율 분할]
매도(임대)측 중개사와 매수(임차)측 중개사는 각각 자기 측 의뢰인으로부터 법정 중개보수를 100% 수령하는 5:5 공동중개 방식을 원칙으로 협의합니다.

3. [비밀유지 의무]
상호 제공된 매도/매수의 비공개 정보(임차인, 소유주 실명, 상세 주소 등)는 계약 성사 전후를 불문하고 제3자에게 누설하지 않습니다.

--------------------------------------------
본 확인서는 JS 1분 딜카드 매칭 엔진 분석을 기반으로 상호 신뢰 하에 자동 발급되었습니다.`;
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(getAgreementTemplate());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full space-y-4 p-4 bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl shadow-sm">
      {/* Grade and Title Header */}
      <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
        <div>
          <h4 className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
            AI 매칭 엔진 정밀 분석
          </h4>
          <p className="text-sm font-bold text-zinc-800 dark:text-zinc-100 mt-0.5">
            {config.label}
          </p>
        </div>
        <div className={`px-3 py-1 rounded-full text-xs font-bold border ${config.color}`}>
          {Math.round(stage3Score)}점
        </div>
      </div>

      {/* Stage 1: Hard Filter Checks */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
            Stage 1: 하드 필터 검증
          </span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${stage1Passed ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}>
            {stage1Passed ? "필터 통과" : "필터 탈락"}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(stage1Details).map(([key, ok]) => (
            <div
              key={key}
              className={`flex items-center justify-center gap-1 py-1 px-2 rounded-lg border text-[11px] font-medium transition-all ${
                ok
                  ? "bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-400"
                  : "bg-rose-50/50 dark:bg-rose-950/20 border-rose-100 dark:border-rose-900/50 text-rose-700 dark:text-rose-400"
              }`}
            >
              <span>{ok ? "✓" : "✗"}</span>
              <span>{STAGE1_LABELS[key] || key}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Stage 2: Semantic Similarity */}
      <div className="space-y-1.5">
        <div className="flex justify-between items-center text-xs font-semibold text-zinc-500 dark:text-zinc-400">
          <span>Stage 2: 시맨틱 문장 유사도</span>
          <span className="font-mono text-zinc-700 dark:text-zinc-300 font-bold">
            {(stage2Similarity * 100).toFixed(1)}%
          </span>
        </div>
        <div className="w-full h-2.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 dark:bg-blue-600 rounded-full transition-all duration-500"
            style={{ width: `${Math.min(100, Math.max(0, stage2Similarity * 100))}%` }}
          />
        </div>
      </div>

      {/* Stage 3: Ensemble Breakdown (Optional details) */}
      {Object.keys(stage3Weights).length > 0 && (
        <div className="space-y-1 bg-zinc-50 dark:bg-zinc-950 p-2.5 rounded-lg border border-zinc-100 dark:border-zinc-900">
          <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 block mb-1">
            Stage 3: 앙상블 기여 가중치 프로파일
          </span>
          <div className="grid grid-cols-4 gap-1 text-[10px] text-zinc-600 dark:text-zinc-400">
            {Object.entries(stage3Weights).map(([field, weight]) => (
              <div key={field} className="flex justify-between border-r border-zinc-200 dark:border-zinc-800 pr-1 last:border-none">
                <span className="capitalize">{field}</span>
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">{(weight * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Co-Brokerage Agreement Button (Phase 4: F13-4) */}
      {(grade === "S" || grade === "A") && (
        <div className="pt-1.5 space-y-2">
          <button
            onClick={() => setShowAgreement(!showAgreement)}
            className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border border-primary/20 bg-primary/5 hover:bg-primary/10 text-primary text-[11px] font-bold transition-all shadow-sm"
          >
            <span>🤝</span>
            <span>{showAgreement ? "공동중개 확인서 닫기" : "공동중개 업무확약서 자동 생성 (5:5)"}</span>
          </button>

          {showAgreement && (
            <div className="p-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/60 dark:border-zinc-800 rounded-xl space-y-3 animate-fadeIn">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-zinc-400">📜 공동중개 협약 확약서 초안</span>
                <button
                  onClick={handleCopy}
                  className="text-[9px] px-2 py-0.5 rounded bg-card border border-border text-foreground hover:text-primary transition-all font-semibold"
                >
                  {copied ? "✓ 복사완료" : "📋 텍스트 복사"}
                </button>
              </div>
              <pre className="text-[9px] font-mono leading-relaxed whitespace-pre-wrap text-zinc-700 dark:text-zinc-300 max-h-36 overflow-y-auto bg-card/50 p-2.5 rounded-lg border border-border/20">
                {getAgreementTemplate()}
              </pre>
              <p className="text-[8px] text-muted-foreground text-center">
                *본 협약은 계약 전 상호 보수 확보 및 비밀 유지를 서약하는 사전 매칭 확약서입니다.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Interactive Feedback buttons */}
      <div className="flex items-center justify-between pt-3 border-t border-zinc-100 dark:border-zinc-800">
        <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
          이 분석 결과가 적합한가요?
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => handleFeedback("like")}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded-full border transition-all ${
              feedback === "like"
                ? "bg-emerald-500 text-white border-emerald-500 shadow-sm"
                : "bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700"
            }`}
          >
            <span>👍</span>
            <span>적합</span>
          </button>
          <button
            onClick={() => handleFeedback("dislike")}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded-full border transition-all ${
              feedback === "dislike"
                ? "bg-rose-500 text-white border-rose-500 shadow-sm"
                : "bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700"
            }`}
          >
            <span>👎</span>
            <span>부적합</span>
          </button>
        </div>
      </div>
    </div>
  );
}
