"use client";

import { useState, useEffect } from "react";
import type { IdealBuyerPersonasOutput } from "@/ai/schemas/ideal-buyer-persona";

interface IdealBuyerPersonaSectionProps {
  buildingId: string;
  areaSignal: string;
  assetType: string;
  priceBand: string;
  sizeSignal: string;
  vacancyStatus?: string;
  currentUseSignal?: string;
  rawInput?: string;
  fitSummary?: string;
  cautionSummary?: string;
  curiosityScore?: number;
}

const LOADING_STEPS = [
  "매물 특성 추출 중...",
  "가중치 매칭 프로파일 계산 중...",
  "매수 동기 및 니즈 시나리오 도출 중...",
  "어필 메시지 및 접근 전략 생성 중...",
  "브로커 액션 플랜 수립 중...",
];

export function IdealBuyerPersonaSection({
  buildingId,
  areaSignal,
  assetType,
  priceBand,
  sizeSignal,
  vacancyStatus,
  currentUseSignal,
  rawInput,
  fitSummary,
  cautionSummary,
  curiosityScore,
}: IdealBuyerPersonaSectionProps) {
  const [personas, setPersonas] = useState<IdealBuyerPersonasOutput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Load from local storage on mount
  useEffect(() => {
    const cached = localStorage.getItem(`ideal_personas_${buildingId}`);
    if (cached) {
      try {
        setPersonas(JSON.parse(cached));
      } catch (e) {
        console.error("Failed to parse cached personas:", e);
      }
    }
  }, [buildingId]);

  // Loading animation simulation
  useEffect(() => {
    if (!isLoading) return;
    const interval = setInterval(() => {
      setLoadingStep((prev) => (prev < LOADING_STEPS.length - 1 ? prev + 1 : prev));
    }, 1200);
    return () => clearInterval(interval);
  }, [isLoading]);

  const handleGenerate = async () => {
    setIsLoading(true);
    setError(null);
    setLoadingStep(0);

    try {
      const res = await fetch("/api/broker/ideal-buyer-persona", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          areaSignal: areaSignal || "미확인",
          assetType: assetType || "미확인",
          priceBand: priceBand || "미확인",
          sizeSignal: sizeSignal || "연면적 미확인",
          vacancyStatus: vacancyStatus || "확인 필요",
          currentUseSignal,
          rawInput,
          fitSummary: fitSummary || "분석 중",
          cautionSummary: cautionSummary || "특이사항 없음",
          curiosityScore: curiosityScore ?? 50,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "페르소나 생성에 실패했습니다.");
      }

      setPersonas(json.data);
      localStorage.setItem(`ideal_personas_${buildingId}`, JSON.stringify(json.data));
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "페르소나 생성 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearCache = () => {
    localStorage.removeItem(`ideal_personas_${buildingId}`);
    setPersonas(null);
  };

  // Profile icon & style mappings
  const getProfileStyle = (profile: string) => {
    switch (profile) {
      case "사옥":
        return {
          bg: "bg-gradient-to-br from-indigo-500/10 via-indigo-500/5 to-transparent border-indigo-500/30 shadow-sm",
          text: "text-indigo-600 dark:text-indigo-400",
          badge: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20",
          emoji: "🏢",
        };
      case "투자":
        return {
          bg: "bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent border-emerald-500/30 shadow-sm",
          text: "text-emerald-600 dark:text-emerald-400",
          badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
          emoji: "📈",
        };
      case "증여":
        return {
          bg: "bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent border-amber-500/30 shadow-sm",
          text: "text-amber-600 dark:text-amber-400",
          badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
          emoji: "🎁",
        };
      default:
        return {
          bg: "bg-gradient-to-br from-purple-500/10 via-purple-500/5 to-transparent border-purple-500/30 shadow-sm",
          text: "text-purple-600 dark:text-purple-400",
          badge: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
          emoji: "🔮",
        };
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      {/* Title */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <span>🧠</span> AI 가상 매수자 페르소나
        </h2>
        {personas && (
          <button
            onClick={handleClearCache}
            className="text-[11px] text-muted-foreground hover:text-foreground underline transition-colors"
            title="다시 생성하기"
          >
            초기화
          </button>
        )}
      </div>

      {isLoading ? (
        // Loading State
        <div className="py-6 space-y-4 text-center">
          <div className="inline-block w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
          <div className="space-y-1">
            <p className="text-sm font-semibold">{LOADING_STEPS[loadingStep]}</p>
            <p className="text-xs text-muted-foreground">
              매물의 SSoT 신호를 바탕으로 매칭 시나리오를 계산하는 중입니다. (약 5초 소요)
            </p>
          </div>
          {/* Progress bar */}
          <div className="w-full bg-secondary rounded-full h-1.5 overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
              style={{ width: `${((loadingStep + 1) / LOADING_STEPS.length) * 100}%` }}
            />
          </div>
        </div>
      ) : personas ? (
        // Results State
        <div className="space-y-4 animate-in fade-in duration-300">
          {/* Summary */}
          <div className="rounded-lg bg-muted/60 dark:bg-muted/40 p-3.5 border border-border/50">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">
              매물 핵심 컨셉 요약
            </p>
            <p className="text-sm font-medium leading-relaxed">{personas.propertySummary}</p>
          </div>

          {/* 3 Personas */}
          <div className="space-y-4">
            {personas.personas.map((persona, index) => {
              const style = getProfileStyle(persona.purposeProfile);
              return (
                <div
                  key={index}
                  className={`rounded-xl border p-4 space-y-3 transition-all ${style.bg}`}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm select-none">{style.emoji}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${style.badge}`}>
                          {persona.purposeProfile}형 페르소나
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          매칭 적합도 {persona.fitScore}%
                        </span>
                      </div>
                      <h3 className="text-sm font-bold text-foreground">
                        {persona.label}
                      </h3>
                    </div>
                    {/* Score badge */}
                    <div className={`text-xs font-bold px-2 py-0.5 rounded-full ${style.badge}`}>
                      {persona.fitScore}점
                    </div>
                  </div>

                  {/* Summary Grid */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] bg-black/5 dark:bg-white/5 rounded-lg p-2.5">
                    <div>
                      <span className="text-muted-foreground block mb-0.5">매수자 유형</span>
                      <span className="font-semibold text-foreground">{persona.buyerType}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block mb-0.5">추정 예산</span>
                      <span className="font-semibold text-foreground">{persona.budgetRange}</span>
                    </div>
                  </div>

                  {/* Motivation */}
                  <div className="text-[12px] space-y-1">
                    <span className="text-muted-foreground font-semibold">💡 매입 동기:</span>
                    <p className="text-muted-foreground leading-relaxed pl-1">
                      {persona.motivation}
                    </p>
                  </div>

                  {/* Core Needs */}
                  <div className="space-y-1">
                    <span className="text-[11px] text-muted-foreground font-semibold">🎯 핵심 요구사항:</span>
                    <div className="flex flex-wrap gap-1 pl-1">
                      {persona.coreNeeds.map((need, idx) => (
                        <span
                          key={idx}
                          className="text-[10px] bg-card border border-border/80 text-foreground px-2 py-0.5 rounded-md"
                        >
                          {need}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Where To Find */}
                  <div className="text-[12px] space-y-1">
                    <span className="text-muted-foreground font-semibold">📍 발굴 및 타겟팅 경로:</span>
                    <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground text-[11px]">
                      {persona.whereToFind.map((path, idx) => (
                        <li key={idx}>{path}</li>
                      ))}
                    </ul>
                  </div>

                  {/* Approach Strategy */}
                  <div className="mt-2 pt-2 border-t border-border/40 space-y-1 text-[12px] bg-primary/5 p-2.5 rounded-lg border border-primary/10">
                    <span className="text-primary font-bold">💬 브로커 어필 및 접근 전략:</span>
                    <p className="text-foreground leading-relaxed">
                      {persona.approachStrategy}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Action Plan */}
          <div className="rounded-lg border border-border p-4 bg-muted/20 space-y-2">
            <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <span>📋</span> 브로커 실행 추천 플랜
            </p>
            <ul className="space-y-1.5 pl-4 list-decimal text-xs text-muted-foreground">
              {personas.brokerActionPlan.map((action, idx) => (
                <li key={idx} className="leading-relaxed">
                  {action}
                </li>
              ))}
            </ul>
          </div>

          {/* Boundary Note */}
          <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
            ⚠️ {personas.boundaryNote}
          </p>

          {/* Re-generate button */}
          <button
            onClick={handleGenerate}
            className="w-full inline-flex items-center justify-center rounded-xl bg-secondary border border-border px-3 py-2 text-xs font-semibold text-foreground transition-all hover:bg-muted"
          >
            🔄 페르소나 AI 분석 다시 실행
          </button>
        </div>
      ) : (
        // Empty State
        <div className="py-6 text-center space-y-4">
          <div className="max-w-xs mx-auto space-y-1">
            <p className="text-sm font-semibold">이 매물은 어떤 사람이 사야 할까요?</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              매물 SSoT 데이터를 AI 에이전트가 분석하여 가장 적합한 3가지 가상 매수자 프로파일과 전략을 도출합니다.
            </p>
          </div>
          <div className="relative group inline-block">
            <button
              onClick={handleGenerate}
              className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground shadow-sm transition-all hover:bg-primary/95"
              id="cta-generate-buyer-personas"
            >
              ✨ AI 매수자 페르소나 도출
            </button>
            {(!areaSignal || !assetType || !priceBand) && (
               <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max px-2 py-1 bg-black/80 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                 일부 핵심 정보가 부족하여 추정 결과가 포함될 수 있습니다.
               </div>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive">
          ❌ {error}
        </div>
      )}
    </div>
  );
}
