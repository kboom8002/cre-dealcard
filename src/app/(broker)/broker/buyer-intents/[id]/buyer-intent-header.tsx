"use client";

import { Button } from "@/components/ui/button";

interface BuyerIntentHeaderProps {
  isEditing: boolean;
  isMatching: boolean;
  matchingStatus: string | null;
  matchingError: string | null;
  onToggleEdit: () => void;
  onReMatch: () => void;
}

export function BuyerIntentHeader({
  isEditing,
  isMatching,
  matchingStatus,
  matchingError,
  onToggleEdit,
  onReMatch,
}: BuyerIntentHeaderProps) {
  return (
    <div className="relative rounded-2xl border border-white/5 bg-slate-950/40 backdrop-blur-xl p-6 md:p-8 overflow-hidden shadow-elevation-3">
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-transparent to-blue-500/5 -z-10" />
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 px-3 py-1 text-xs font-medium text-indigo-300 mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
            BROKER ESSENTIALS
          </span>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-foreground via-slate-100 to-indigo-200 bg-clip-text text-transparent">
            매수자 조건 상세 분석
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            요건 기반 최적 매칭 스코어와 조건 관리
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={onToggleEdit}
            className="border-white/10 hover:bg-white/5 text-xs h-9"
          >
            {isEditing ? "취소" : "조건 편집"}
          </Button>
          
          <Button
            onClick={onReMatch}
            disabled={isMatching}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs h-9 shadow-lg shadow-indigo-600/20 active:scale-[0.98] transition-all"
          >
            <svg className="w-3.5 h-3.5 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89M9 11l3-3 3 3" />
            </svg>
            수동 재매칭 실행
          </Button>
        </div>
      </div>

      {/* Global messages (success/error) */}
      {matchingStatus && (
        <div className="mt-4 rounded-lg bg-emerald-950/30 border border-emerald-800/40 px-4 py-3 text-xs text-emerald-400">
          ✨ {matchingStatus}
        </div>
      )}
      {matchingError && (
        <div className="mt-4 rounded-lg bg-red-950/30 border border-red-800/40 px-4 py-3 text-xs text-red-400">
          ⚠️ {matchingError}
        </div>
      )}
    </div>
  );
}
