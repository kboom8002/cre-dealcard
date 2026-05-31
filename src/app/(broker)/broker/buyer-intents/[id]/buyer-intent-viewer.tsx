"use client";

interface BuyerIntent {
  id: string;
  buyer_type: string | null;
  budget_display: string | null;
  preferred_regions: string[] | null;
  asset_types: string[] | null;
  purchase_purpose: string | null;
  must_have: string[] | null;
  nice_to_have: string[] | null;
  risk_tolerance: string | null;
  financing_note: string | null;
  normalized: {
    missingQuestions?: string[];
    privacyNotes?: string[];
  } | null;
  created_at: string;
}

interface BuyerIntentViewerProps {
  intent: BuyerIntent;
  preferredRegions: string[];
  assetTypes: string[];
  mustHave: string[];
  niceToHave: string[];
}

export function BuyerIntentViewer({
  intent,
  preferredRegions,
  assetTypes,
  mustHave,
  niceToHave,
}: BuyerIntentViewerProps) {
  const riskLabels: Record<string, string> = {
    low: "낮음 (보수적)",
    medium: "중간",
    high: "높음 (적극적)",
    unknown: "미확인",
  };

  const riskColors: Record<string, string> = {
    low: "bg-blue-950/40 text-blue-400 border-blue-800/50",
    medium: "bg-yellow-950/40 text-yellow-400 border-yellow-800/50",
    high: "bg-red-950/40 text-red-400 border-red-800/50",
    unknown: "bg-zinc-800/50 text-zinc-400 border-zinc-700/50",
  };

  return (
    <div className="space-y-6">
      {/* View Mode: Summary Scorecard */}
      <div className="rounded-2xl border border-white/5 bg-slate-900/40 p-6 md:p-8 space-y-6 shadow-elevation-2">
        <div className="flex items-center justify-between border-b border-white/5 pb-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <span>🎯</span> 핵심 매수 조건
          </h2>
          <span className="text-xs text-muted-foreground">요약 보고서</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-y-6 gap-x-4">
          <div className="space-y-1">
            <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">매수자 유형</p>
            <p className="font-semibold text-sm text-slate-200">{intent.buyer_type || "미확인"}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">예산 규모</p>
            <p className="font-semibold text-sm text-indigo-300">{intent.budget_display || "미확인"}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">매입 목적</p>
            <p className="font-semibold text-sm text-slate-200">{intent.purchase_purpose || "미확인"}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">리스크 허용 성향</p>
            <span className={`inline-flex items-center border rounded px-2 py-0.5 text-xs font-semibold ${riskColors[intent.risk_tolerance || "unknown"]}`}>
              {riskLabels[intent.risk_tolerance || "unknown"]}
            </span>
          </div>
          <div className="space-y-1 col-span-2">
            <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">선호 지역</p>
            <div className="flex flex-wrap gap-1 mt-0.5">
              {preferredRegions.map((region, idx) => (
                <span key={idx} className="bg-slate-800/80 border border-slate-700/50 rounded px-1.5 py-0.5 text-[11px] text-slate-300 font-medium">
                  {region}
                </span>
              ))}
              {preferredRegions.length === 0 && (
                <span className="text-xs text-muted-foreground">미확인</span>
              )}
            </div>
          </div>
          <div className="space-y-1 col-span-2 md:col-span-3">
            <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">선호 자산</p>
            <div className="flex flex-wrap gap-1 mt-0.5">
              {assetTypes.map((type, idx) => (
                <span key={idx} className="bg-indigo-950/20 border border-indigo-900/40 rounded px-1.5 py-0.5 text-[11px] text-indigo-300 font-medium">
                  {type}
                </span>
              ))}
              {assetTypes.length === 0 && (
                <span className="text-xs text-muted-foreground">미확인</span>
              )}
            </div>
          </div>
        </div>

        {/* Condition List: Must / Nice Card UI */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-white/5 pt-6">
          {/* Must Have Card */}
          <div className="rounded-xl border border-red-900/30 bg-red-950/5 p-4 space-y-3">
            <p className="text-xs font-bold text-red-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              필수 조건 (Must Have)
            </p>
            {mustHave.length > 0 ? (
              <ul className="space-y-2">
                {mustHave.map((item, i) => (
                  <li key={i} className="text-xs text-slate-300 flex items-start gap-1.5 leading-relaxed">
                    <span className="text-red-500 font-extrabold select-none">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground italic">명시된 필수 요건이 없습니다.</p>
            )}
          </div>

          {/* Nice to Have Card */}
          <div className="rounded-xl border border-blue-900/30 bg-blue-950/5 p-4 space-y-3">
            <p className="text-xs font-bold text-blue-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              우대 조건 (Nice to Have)
            </p>
            {niceToHave.length > 0 ? (
              <ul className="space-y-2">
                {niceToHave.map((item, i) => (
                  <li key={i} className="text-xs text-slate-300 flex items-start gap-1.5 leading-relaxed">
                    <span className="text-blue-500 font-extrabold select-none">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground italic">명시된 우대 요건이 없습니다.</p>
            )}
          </div>
        </div>

        {/* Financing Note Display */}
        {intent.financing_note && (
          <div className="rounded-xl border border-white/5 bg-slate-950/30 p-4 space-y-1.5">
            <p className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <span>💰</span> 대출 및 에쿼티 조달 상황
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
              {intent.financing_note}
            </p>
          </div>
        )}
      </div>

      {/* Missing Questions & Privacy Notes */}
      {intent.normalized && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Missing Questions */}
          {Array.isArray(intent.normalized.missingQuestions) &&
            intent.normalized.missingQuestions.length > 0 && (
              <div className="rounded-xl border border-white/5 bg-slate-900/40 p-5 space-y-3">
                <h3 className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <span>❓</span> 추가 확인 권장 사항
                </h3>
                <ol className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {intent.normalized.missingQuestions.map((q: string, i: number) => (
                    <li key={i} className="text-xs flex gap-1.5 leading-relaxed text-slate-400">
                      <span className="text-indigo-400 font-semibold shrink-0">{i + 1}.</span>
                      <span>{String(q)}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

          {/* Privacy Notes */}
          {Array.isArray(intent.normalized.privacyNotes) &&
            intent.normalized.privacyNotes.length > 0 && (
              <div className="rounded-xl border border-white/5 bg-slate-900/40 p-5 space-y-3">
                <h3 className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <span>🔒</span> 정보 보안 및 규정 주의사항
                </h3>
                <ul className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {intent.normalized.privacyNotes.map((note: string, i: number) => (
                    <li key={i} className="text-xs flex gap-1.5 leading-relaxed text-slate-400">
                      <span className="text-amber-500 shrink-0">🛡️</span>
                      <span>{String(note)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
        </div>
      )}
    </div>
  );
}
