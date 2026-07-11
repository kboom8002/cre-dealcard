"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface BuyerIntentEditFormProps {
  buyerType: string;
  setBuyerType: (val: string) => void;
  budgetDisplay: string;
  setBudgetDisplay: (val: string) => void;
  purchasePurpose: string;
  setPurchasePurpose: (val: string) => void;
  riskTolerance: string;
  setRiskTolerance: (val: string) => void;
  financingNote: string;
  setFinancingNote: (val: string) => void;
  preferredRegions: string[];
  setPreferredRegions: (val: string[]) => void;
  assetTypes: string[];
  setAssetTypes: (val: string[]) => void;
  mustHave: string[];
  setMustHave: (val: string[]) => void;
  niceToHave: string[];
  setNiceToHave: (val: string[]) => void;
  missingQuestions: string[];
  setMissingQuestions: (val: string[]) => void;
  editError: string | null;
  isSaving: boolean;
  onSave: () => void;
  onCancel: () => void;
}

export function BuyerIntentEditForm({
  buyerType,
  setBuyerType,
  budgetDisplay,
  setBudgetDisplay,
  purchasePurpose,
  setPurchasePurpose,
  riskTolerance,
  setRiskTolerance,
  financingNote,
  setFinancingNote,
  preferredRegions,
  setPreferredRegions,
  assetTypes,
  setAssetTypes,
  mustHave,
  setMustHave,
  niceToHave,
  setNiceToHave,
  missingQuestions,
  setMissingQuestions,
  editError,
  isSaving,
  onSave,
  onCancel,
}: BuyerIntentEditFormProps) {
  // Input states for new badges
  const [newRegion, setNewRegion] = useState("");
  const [newAssetType, setNewAssetType] = useState("");
  const [newMustHave, setNewMustHave] = useState("");
  const [newNiceToHave, setNewNiceToHave] = useState("");
  const [newMissingQuestion, setNewMissingQuestion] = useState("");

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

  return (
    <div className="rounded-2xl border border-white/5 bg-slate-900/60 p-6 md:p-8 space-y-6 shadow-elevation-2">
      <div className="flex items-center justify-between border-b border-white/5 pb-4">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <span className="text-indigo-400">✏️</span> 조건 실시간 인라인 편집
        </h2>
        <span className="text-xs text-muted-foreground">중개인 권한</span>
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
          onClick={onCancel}
          className="text-xs hover:bg-white/5"
        >
          취소
        </Button>
        <Button
          onClick={onSave}
          disabled={isSaving}
          className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-4"
        >
          {isSaving ? "저장 중..." : "변경사항 저장"}
        </Button>
      </div>
    </div>
  );
}
