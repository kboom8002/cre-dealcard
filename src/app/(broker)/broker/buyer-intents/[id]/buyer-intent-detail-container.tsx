"use client";

import { useState } from "react";
import { updateBuyerIntent, triggerReMatching } from "./actions";
import { Button } from "@/components/ui/button";

interface BuyerIntent {
  id: string;
  buyer_type: string | null;
  budget_display: string | null;
  preferred_regions: any;
  asset_types: any;
  purchase_purpose: string | null;
  must_have: any;
  nice_to_have: any;
  risk_tolerance: string | null;
  financing_note: string | null;
  normalized: any;
  created_at: string;
}

interface Building {
  id: string;
  area_signal: string | null;
  asset_type: string | null;
  price_band: string | null;
}

interface MatchHistory {
  id: string;
  grade: string;
  score: number;
  reasoning: string | null;
  created_at: string;
  building_ssot_lite_id: string;
  building_ssot_lite: any;
}

interface BuyerIntentDetailContainerProps {
  intent: BuyerIntent;
  matchHistory: MatchHistory[] | null;
  buyerMemoSectionComponent: React.ReactNode;
}

export function BuyerIntentDetailContainer({
  intent,
  matchHistory,
  buyerMemoSectionComponent,
}: BuyerIntentDetailContainerProps) {
  // Editing State
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Form Fields
  const [buyerType, setBuyerType] = useState(intent.buyer_type || "");
  const [budgetDisplay, setBudgetDisplay] = useState(intent.budget_display || "");
  const [purchasePurpose, setPurchasePurpose] = useState(intent.purchase_purpose || "");
  const [riskTolerance, setRiskTolerance] = useState(intent.risk_tolerance || "unknown");
  const [financingNote, setFinancingNote] = useState(intent.financing_note || "");

  // Arrays
  const [preferredRegions, setPreferredRegions] = useState<string[]>(
    Array.isArray(intent.preferred_regions) ? intent.preferred_regions : []
  );
  const [assetTypes, setAssetTypes] = useState<string[]>(
    Array.isArray(intent.asset_types) ? intent.asset_types : []
  );
  const [mustHave, setMustHave] = useState<string[]>(
    Array.isArray(intent.must_have) ? intent.must_have : []
  );
  const [niceToHave, setNiceToHave] = useState<string[]>(
    Array.isArray(intent.nice_to_have) ? intent.nice_to_have : []
  );
  const [missingQuestions, setMissingQuestions] = useState<string[]>(
    intent.normalized && Array.isArray((intent.normalized as any).missingQuestions)
      ? (intent.normalized as any).missingQuestions
      : []
  );

  // Individual input handlers for badges
  const [newRegion, setNewRegion] = useState("");
  const [newAssetType, setNewAssetType] = useState("");
  const [newMustHave, setNewMustHave] = useState("");
  const [newNiceToHave, setNewNiceToHave] = useState("");
  const [newMissingQuestion, setNewMissingQuestion] = useState("");

  // Re-matching State
  const [isMatching, setIsMatching] = useState(false);
  const [matchingStatus, setMatchingStatus] = useState<string | null>(null);
  const [matchingError, setMatchingError] = useState<string | null>(null);

  // Accordion open states for match history items
  const [expandedMatches, setExpandedMatches] = useState<Record<string, boolean>>({});

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

  // Toggle Accordion
  const toggleMatchExpand = (id: string) => {
    setExpandedMatches((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Add Badge Handlers
  const handleAddRegion = (e: React.KeyboardEvent | React.MouseEvent) => {
    if (e.type === "keydown" && (e as React.KeyboardEvent).key !== "Enter") return;
    e.preventDefault();
    if (newRegion.trim() && !preferredRegions.includes(newRegion.trim())) {
      setPreferredRegions([...preferredRegions, newRegion.trim()]);
      setNewRegion("");
    }
  };

  const handleAddAssetType = (e: React.KeyboardEvent | React.MouseEvent) => {
    if (e.type === "keydown" && (e as React.KeyboardEvent).key !== "Enter") return;
    e.preventDefault();
    if (newAssetType.trim() && !assetTypes.includes(newAssetType.trim())) {
      setAssetTypes([...assetTypes, newAssetType.trim()]);
      setNewAssetType("");
    }
  };

  const handleAddMustHave = (e: React.KeyboardEvent | React.MouseEvent) => {
    if (e.type === "keydown" && (e as React.KeyboardEvent).key !== "Enter") return;
    e.preventDefault();
    if (newMustHave.trim() && !mustHave.includes(newMustHave.trim())) {
      setMustHave([...mustHave, newMustHave.trim()]);
      setNewMustHave("");
    }
  };

  const handleAddNiceToHave = (e: React.KeyboardEvent | React.MouseEvent) => {
    if (e.type === "keydown" && (e as React.KeyboardEvent).key !== "Enter") return;
    e.preventDefault();
    if (newNiceToHave.trim() && !niceToHave.includes(newNiceToHave.trim())) {
      setNiceToHave([...niceToHave, newNiceToHave.trim()]);
      setNewNiceToHave("");
    }
  };

  // Save Handlers
  const handleSave = async () => {
    setIsSaving(true);
    setEditError(null);

    const updatedNormalized = {
      ...(intent.normalized || {}),
      missingQuestions: missingQuestions,
    };

    const result = await updateBuyerIntent(intent.id, {
      buyer_type: buyerType,
      budget_display: budgetDisplay,
      preferred_regions: preferredRegions,
      asset_types: assetTypes,
      purchase_purpose: purchasePurpose,
      risk_tolerance: riskTolerance,
      financing_note: financingNote,
      must_have: mustHave,
      nice_to_have: niceToHave,
      normalized: updatedNormalized,
    });

    setIsSaving(false);
    if (result.success) {
      setIsEditing(false);
    } else {
      setEditError(result.error || "수정 사항 저장 중 에러가 발생했습니다.");
    }
  };

  // Re-matching Trigger Handler
  const handleReMatch = async () => {
    setIsMatching(true);
    setMatchingStatus("AI 매칭 엔진 가동 중...");
    setMatchingError(null);

    try {
      const result = await triggerReMatching(intent.id);
      if (result.success) {
        setMatchingStatus(`재매칭 완료! ${result.count}개 매물 정보 갱신 완료.`);
        setTimeout(() => setMatchingStatus(null), 3000);
      } else {
        setMatchingError(result.error || "재매칭 수행에 실패했습니다.");
      }
    } catch (err) {
      setMatchingError("시스템 오류가 발생했습니다.");
    } finally {
      setIsMatching(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-8 relative">
      {/* Glow background effects (Slate/Indigo modern vibe) */}
      <div className="absolute -top-40 left-1/4 w-72 h-72 bg-indigo-500/10 rounded-full blur-3xl -z-10" />
      <div className="absolute top-1/2 right-1/4 w-80 h-80 bg-blue-500/5 rounded-full blur-3xl -z-10" />

      {/* Manual Matching Loader Overlay */}
      {isMatching && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-md z-50 flex flex-col items-center justify-center space-y-6">
          <div className="relative">
            <div className="w-16 h-16 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-indigo-400">
              CRE
            </div>
          </div>
          <div className="text-center space-y-2">
            <h3 className="text-lg font-bold text-foreground">실시간 재매칭 수행 중</h3>
            <p className="text-sm text-muted-foreground animate-pulse">
              AI 접합도 평가 모델이 매수자 조건과 상업용 부동산 데이터를 매칭하고 있습니다...
            </p>
          </div>
        </div>
      )}

      {/* Header section with Glassmorphism */}
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
              onClick={() => {
                if (isEditing) {
                  // Cancel - restore fields
                  setBuyerType(intent.buyer_type || "");
                  setBudgetDisplay(intent.budget_display || "");
                  setPurchasePurpose(intent.purchase_purpose || "");
                  setRiskTolerance(intent.risk_tolerance || "unknown");
                  setFinancingNote(intent.financing_note || "");
                  setPreferredRegions(Array.isArray(intent.preferred_regions) ? intent.preferred_regions : []);
                  setAssetTypes(Array.isArray(intent.asset_types) ? intent.asset_types : []);
                  setMustHave(Array.isArray(intent.must_have) ? intent.must_have : []);
                  setNiceToHave(Array.isArray(intent.nice_to_have) ? intent.nice_to_have : []);
                  setMissingQuestions(intent.normalized && Array.isArray((intent.normalized as any).missingQuestions) ? (intent.normalized as any).missingQuestions : []);
                  setEditError(null);
                }
                setIsEditing(!isEditing);
              }}
              className="border-white/10 hover:bg-white/5 text-xs h-9"
            >
              {isEditing ? "취소" : "조건 편집"}
            </Button>
            
            <Button
              onClick={handleReMatch}
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

      {/* Main Content: Info & Editing */}
      {isEditing ? (
        <div className="rounded-2xl border border-white/5 bg-slate-900/60 p-6 md:p-8 space-y-6 shadow-elevation-2">
          <div className="flex items-center justify-between border-b border-white/5 pb-4">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <span className="text-indigo-400">✏️</span> 조건 실시간 인라인 편집
            </h2>
            <span className="text-xs text-muted-foreground">브로커 권한</span>
          </div>

          {editError && (
            <div className="rounded-lg bg-red-950/30 border border-red-800/40 px-4 py-3 text-xs text-red-400">
              ⚠️ {editError}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Buyer Type */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">매수자 유형</label>
              <input
                type="text"
                value={buyerType}
                onChange={(e) => setBuyerType(e.target.value)}
                placeholder="예: 시행사, 개인 투자자, 프롭테크 등"
                className="w-full bg-slate-950/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-indigo-500/80 transition-colors"
              />
            </div>

            {/* Budget */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">예산 범위</label>
              <input
                type="text"
                value={budgetDisplay}
                onChange={(e) => setBudgetDisplay(e.target.value)}
                placeholder="예: 300억 ~ 450억"
                className="w-full bg-slate-950/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-indigo-500/80 transition-colors"
              />
            </div>

            {/* Purchase Purpose */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">매입 목적</label>
              <input
                type="text"
                value={purchasePurpose}
                onChange={(e) => setPurchasePurpose(e.target.value)}
                placeholder="예: 리모델링 후 밸류애드, 사옥 확보"
                className="w-full bg-slate-950/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-indigo-500/80 transition-colors"
              />
            </div>

            {/* Risk Tolerance */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">리스크 성향</label>
              <select
                value={riskTolerance}
                onChange={(e) => setRiskTolerance(e.target.value)}
                className="w-full bg-slate-950/50 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-indigo-500/80 transition-colors"
              >
                <option value="low">낮음 (보수적)</option>
                <option value="medium">중간</option>
                <option value="high">높음 (적극적)</option>
                <option value="unknown">미확인</option>
              </select>
            </div>
          </div>

          {/* Preferred Regions Badge Editor */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300">선호 지역</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {preferredRegions.map((region, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 rounded bg-slate-800 border border-white/5 px-2 py-0.5 text-xs text-foreground"
                >
                  {region}
                  <button
                    type="button"
                    onClick={() => setPreferredRegions(preferredRegions.filter((_, i) => i !== idx))}
                    className="text-red-400 hover:text-red-300 font-bold ml-1"
                  >
                    ×
                  </button>
                </span>
              ))}
              {preferredRegions.length === 0 && (
                <span className="text-xs text-muted-foreground">선택된 지역 없음</span>
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newRegion}
                onChange={(e) => setNewRegion(e.target.value)}
                onKeyDown={handleAddRegion}
                placeholder="새 지역 입력 후 엔터 또는 추가"
                className="flex-1 bg-slate-950/50 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-indigo-500/80"
              />
              <button
                type="button"
                onClick={handleAddRegion}
                className="bg-slate-800 hover:bg-slate-700 text-foreground px-3 py-1.5 rounded-lg text-xs font-medium"
              >
                추가
              </button>
            </div>
          </div>

          {/* Asset Types Badge Editor */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300">선호 자산 종류</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {assetTypes.map((type, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 rounded bg-slate-800 border border-white/5 px-2 py-0.5 text-xs text-foreground"
                >
                  {type}
                  <button
                    type="button"
                    onClick={() => setAssetTypes(assetTypes.filter((_, i) => i !== idx))}
                    className="text-red-400 hover:text-red-300 font-bold ml-1"
                  >
                    ×
                  </button>
                </span>
              ))}
              {assetTypes.length === 0 && (
                <span className="text-xs text-muted-foreground">선택된 자산 종류 없음</span>
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newAssetType}
                onChange={(e) => setNewAssetType(e.target.value)}
                onKeyDown={handleAddAssetType}
                placeholder="새 자산종류 입력 후 엔터 또는 추가"
                className="flex-1 bg-slate-950/50 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-indigo-500/80"
              />
              <button
                type="button"
                onClick={handleAddAssetType}
                className="bg-slate-800 hover:bg-slate-700 text-foreground px-3 py-1.5 rounded-lg text-xs font-medium"
              >
                추가
              </button>
            </div>
          </div>

          {/* Must Have Badge Editor */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-red-400 flex items-center gap-1">
              <span>🔴</span> 필수 조건 (Must Have)
            </label>
            <div className="flex flex-col gap-1.5 mb-2 max-h-36 overflow-y-auto pr-1">
              {mustHave.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-2 rounded bg-red-950/20 border border-red-900/30 px-3 py-1.5 text-xs text-red-300"
                >
                  <span className="line-clamp-1">{item}</span>
                  <button
                    type="button"
                    onClick={() => setMustHave(mustHave.filter((_, i) => i !== idx))}
                    className="text-red-400 hover:text-red-300 font-bold text-sm shrink-0"
                  >
                    ×
                  </button>
                </div>
              ))}
              {mustHave.length === 0 && (
                <span className="text-xs text-muted-foreground">등록된 필수 조건 없음</span>
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newMustHave}
                onChange={(e) => setNewMustHave(e.target.value)}
                onKeyDown={handleAddMustHave}
                placeholder="필수조건 입력 후 엔터 또는 추가"
                className="flex-1 bg-slate-950/50 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-indigo-500/80"
              />
              <button
                type="button"
                onClick={handleAddMustHave}
                className="bg-red-950/50 hover:bg-red-900/40 text-red-300 px-3 py-1.5 rounded-lg text-xs font-medium border border-red-800/30"
              >
                추가
              </button>
            </div>
          </div>

          {/* Nice to Have Badge Editor */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-blue-400 flex items-center gap-1">
              <span>🔵</span> 우대 조건 (Nice to Have)
            </label>
            <div className="flex flex-col gap-1.5 mb-2 max-h-36 overflow-y-auto pr-1">
              {niceToHave.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-2 rounded bg-blue-950/20 border border-blue-900/30 px-3 py-1.5 text-xs text-blue-300"
                >
                  <span className="line-clamp-1">{item}</span>
                  <button
                    type="button"
                    onClick={() => setNiceToHave(niceToHave.filter((_, i) => i !== idx))}
                    className="text-blue-400 hover:text-blue-300 font-bold text-sm shrink-0"
                  >
                    ×
                  </button>
                </div>
              ))}
              {niceToHave.length === 0 && (
                <span className="text-xs text-muted-foreground">등록된 우대 조건 없음</span>
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newNiceToHave}
                onChange={(e) => setNewNiceToHave(e.target.value)}
                onKeyDown={handleAddNiceToHave}
                placeholder="우대조건 입력 후 엔터 또는 추가"
                className="flex-1 bg-slate-950/50 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-indigo-500/80"
              />
              <button
                type="button"
                onClick={handleAddNiceToHave}
                className="bg-blue-950/50 hover:bg-blue-900/40 text-blue-300 px-3 py-1.5 rounded-lg text-xs font-medium border border-blue-800/30"
              >
                추가
              </button>
            </div>
          </div>

          {/* Missing Questions Badge Editor */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-indigo-400 flex items-center gap-1">
              <span>❓</span> 추가 확인 필요 질문 (Missing Questions)
            </label>
            <div className="flex flex-col gap-1.5 mb-2 max-h-36 overflow-y-auto pr-1">
              {missingQuestions.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-2 rounded bg-indigo-950/20 border border-indigo-900/30 px-3 py-1.5 text-xs text-indigo-300"
                >
                  <span className="line-clamp-1">{item}</span>
                  <button
                    type="button"
                    onClick={() => setMissingQuestions(missingQuestions.filter((_, i) => i !== idx))}
                    className="text-indigo-400 hover:text-indigo-300 font-bold text-sm shrink-0"
                  >
                    ×
                  </button>
                </div>
              ))}
              {missingQuestions.length === 0 && (
                <span className="text-xs text-muted-foreground">등록된 추가 확인 질문 없음</span>
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newMissingQuestion}
                onChange={(e) => setNewMissingQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (newMissingQuestion.trim() && !missingQuestions.includes(newMissingQuestion.trim())) {
                      setMissingQuestions([...missingQuestions, newMissingQuestion.trim()]);
                      setNewMissingQuestion("");
                    }
                  }
                }}
                placeholder="추가 확인 필요한 질문 입력 후 엔터 또는 추가"
                className="flex-1 bg-slate-950/50 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-indigo-500/80"
              />
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  if (newMissingQuestion.trim() && !missingQuestions.includes(newMissingQuestion.trim())) {
                    setMissingQuestions([...missingQuestions, newMissingQuestion.trim()]);
                    setNewMissingQuestion("");
                  }
                }}
                className="bg-indigo-950/50 hover:bg-indigo-900/40 text-indigo-300 px-3 py-1.5 rounded-lg text-xs font-medium border border-indigo-800/30"
              >
                추가
              </button>
            </div>
          </div>

          {/* Financing Note */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">자금 조달 / 대출 관련 특이사항</label>
            <textarea
              value={financingNote}
              onChange={(e) => setFinancingNote(e.target.value)}
              placeholder="예: LTV 70%선 확보 필요, 에쿼티 100억 선 보유 중"
              rows={3}
              className="w-full bg-slate-950/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-indigo-500/80 transition-colors resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-white/5 pt-4">
            <Button
              variant="ghost"
              onClick={() => setIsEditing(false)}
              className="text-xs hover:bg-white/5"
            >
              취소
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-4"
            >
              {isSaving ? "저장 중..." : "변경사항 저장"}
            </Button>
          </div>
        </div>
      ) : (
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
              {Array.isArray((intent.normalized as any).missingQuestions) &&
                (intent.normalized as any).missingQuestions.length > 0 && (
                  <div className="rounded-xl border border-white/5 bg-slate-900/40 p-5 space-y-3">
                    <h3 className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                      <span>❓</span> 추가 확인 권장 사항
                    </h3>
                    <ol className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {(intent.normalized as any).missingQuestions.map((q: any, i: number) => (
                        <li key={i} className="text-xs flex gap-1.5 leading-relaxed text-slate-400">
                          <span className="text-indigo-400 font-semibold shrink-0">{i + 1}.</span>
                          <span>{String(q)}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

              {/* Privacy Notes */}
              {Array.isArray((intent.normalized as any).privacyNotes) &&
                (intent.normalized as any).privacyNotes.length > 0 && (
                  <div className="rounded-xl border border-white/5 bg-slate-900/40 p-5 space-y-3">
                    <h3 className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                      <span>🔒</span> 정보 보안 및 규정 주의사항
                    </h3>
                    <ul className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {(intent.normalized as any).privacyNotes.map((note: any, i: number) => (
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

          {/* Buyer Memo Section Component */}
          {buyerMemoSectionComponent}

          {/* P2-3: Premium Match History List */}
          <div className="rounded-2xl border border-white/5 bg-slate-900/40 p-6 md:p-8 space-y-6 shadow-elevation-2">
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <span>🏆</span> 실시간 매칭 적합도 분석
              </h2>
              <span className="text-xs text-muted-foreground">
                총 {matchHistory?.length || 0}건 매칭됨
              </span>
            </div>

            {matchHistory && matchHistory.length > 0 ? (
              <div className="space-y-4">
                {matchHistory.map((m) => {
                  const b = Array.isArray(m.building_ssot_lite)
                    ? m.building_ssot_lite[0]
                    : m.building_ssot_lite;

                  if (!b) return null;

                  const isExpanded = !!expandedMatches[m.id];

                  // HSL color matching for grades S/A/B/C with glow and border
                  const gradeStyles: Record<
                    string,
                    { badge: string; border: string; glow: string; text: string }
                  > = {
                    S: {
                      badge: "bg-amber-500/15 border-amber-500/30 text-amber-400",
                      border: "border-amber-500/20 hover:border-amber-500/40",
                      glow: "shadow-[inset_0_0_12px_rgba(245,158,11,0.08)]",
                      text: "text-amber-400",
                    },
                    A: {
                      badge: "bg-emerald-500/15 border-emerald-500/30 text-emerald-400",
                      border: "border-emerald-500/20 hover:border-emerald-500/40",
                      glow: "shadow-[inset_0_0_12px_rgba(52,211,153,0.08)]",
                      text: "text-emerald-400",
                    },
                    B: {
                      badge: "bg-blue-500/15 border-blue-500/30 text-blue-400",
                      border: "border-blue-500/20 hover:border-blue-500/40",
                      glow: "shadow-[inset_0_0_12px_rgba(96,165,250,0.08)]",
                      text: "text-blue-400",
                    },
                    C: {
                      badge: "bg-slate-500/15 border-slate-500/30 text-slate-400",
                      border: "border-slate-800 hover:border-slate-700",
                      glow: "",
                      text: "text-slate-400",
                    },
                  };

                  const style = gradeStyles[m.grade] ?? gradeStyles["C"];
                  const matchPercentage = Math.round(m.score * 100);

                  return (
                    <div
                      key={m.id}
                      className={`group relative rounded-xl border bg-slate-950/60 transition-all duration-300 overflow-hidden ${style.border} ${style.glow}`}
                    >
                      <div
                        onClick={() => toggleMatchExpand(m.id)}
                        className="flex items-center justify-between gap-4 p-4 cursor-pointer select-none"
                      >
                        <div className="flex items-center gap-3">
                          {/* Grade Badge */}
                          <span
                            className={`w-10 h-10 rounded-lg border flex items-center justify-center text-lg font-black tracking-tight shrink-0 shadow-sm ${style.badge}`}
                          >
                            {m.grade}
                          </span>

                          <div className="min-w-0">
                            <h3 className="text-sm font-bold text-slate-100 group-hover:text-white transition-colors truncate">
                              {b.area_signal || "권역 미상"} · {b.asset_type || "자산 미상"}
                            </h3>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {b.price_band || "가격 미확인"} · 연산일자 {new Date(m.created_at).toLocaleDateString("ko-KR")}
                            </p>
                          </div>
                        </div>

                        {/* Match score gauge */}
                        <div className="flex items-center gap-4">
                          <div className="text-right shrink-0">
                            <span className={`text-base font-extrabold ${style.text}`}>
                              {matchPercentage}%
                            </span>
                            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                              FIT SCORE
                            </p>
                          </div>

                          {/* Navigation Icon */}
                          <div className="text-muted-foreground group-hover:text-foreground transition-colors">
                            <svg
                              className={`w-4 h-4 transition-transform duration-200 ${
                                isExpanded ? "rotate-180" : ""
                              }`}
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </div>
                      </div>

                      {/* Accordion Content for Reasoning */}
                      {isExpanded && (
                        <div className="border-t border-white/5 bg-slate-900/20 px-4 pb-4 pt-3 space-y-3.5 animate-fadeIn">
                          {/* Progress gauge bar */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                              <span>접합도 등급 분포</span>
                              <span className="font-semibold">{matchPercentage} / 100</span>
                            </div>
                            <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                              <div
                                style={{ width: `${matchPercentage}%` }}
                                className={`h-full rounded-full bg-gradient-to-r from-indigo-500 to-indigo-400`}
                              />
                            </div>
                          </div>

                          {/* Reasoning texts */}
                          <div className="space-y-1.5">
                            <p className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                              <span>⚡</span> AI 매칭 심층 리포트
                            </p>
                            <p className="text-xs text-slate-400 leading-relaxed bg-slate-950/40 rounded-lg p-3 border border-white/5 whitespace-pre-line">
                              {m.reasoning || "상세 매칭 접합 분석 사유가 기재되지 않았습니다."}
                            </p>
                          </div>

                          {/* Direct Nav Button */}
                          <div className="flex justify-end pt-1">
                            <a
                              href={`/broker/deal-card/${b.id}`}
                              className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-bold border border-indigo-500/20 hover:border-indigo-500/40 rounded-lg px-3 py-1.5 bg-indigo-950/10 hover:bg-indigo-950/20 transition-all active:scale-[0.98]"
                            >
                              이 매물의 딜카드 확인하기
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                              </svg>
                            </a>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-white/10 p-8 text-center space-y-2">
                <p className="text-sm text-muted-foreground">현재 매칭된 매물 이력이 없습니다.</p>
                <p className="text-xs text-muted-foreground">
                  우측 상단의 "수동 재매칭 실행" 버튼을 눌러 첫 매칭 연산을 시도해 보세요.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer Info */}
      <div className="flex items-center justify-between text-xs text-muted-foreground px-1 border-t border-white/5 pt-4">
        <span>의향서 고유 식별코드: {intent.id}</span>
        <span>등록일자: {new Date(intent.created_at).toLocaleDateString("ko-KR")}</span>
      </div>
    </div>
  );
}
