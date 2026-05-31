"use client";

import { useState } from "react";
import { updateBuyerIntent, triggerReMatching } from "./actions";
import { BuyerIntentHeader } from "./buyer-intent-header";
import { BuyerIntentEditForm } from "./buyer-intent-edit-form";
import { BuyerIntentViewer } from "./buyer-intent-viewer";
import { BuyerMatchHistory } from "./buyer-match-history";

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
  building_ssot_lite: Building | Building[] | null;
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
    intent.normalized && Array.isArray(intent.normalized.missingQuestions)
      ? intent.normalized.missingQuestions
      : []
  );

  // Re-matching State
  const [isMatching, setIsMatching] = useState(false);
  const [matchingStatus, setMatchingStatus] = useState<string | null>(null);
  const [matchingError, setMatchingError] = useState<string | null>(null);

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

  const handleToggleEdit = () => {
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
      setMissingQuestions(intent.normalized && Array.isArray(intent.normalized.missingQuestions) ? intent.normalized.missingQuestions : []);
      setEditError(null);
    }
    setIsEditing(!isEditing);
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-8 relative">
      {/* Glow background effects */}
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

      {/* Header section */}
      <BuyerIntentHeader
        isEditing={isEditing}
        isMatching={isMatching}
        matchingStatus={matchingStatus}
        matchingError={matchingError}
        onToggleEdit={handleToggleEdit}
        onReMatch={handleReMatch}
      />

      {/* Main Content: Info & Editing */}
      {isEditing ? (
        <BuyerIntentEditForm
          buyerType={buyerType}
          setBuyerType={setBuyerType}
          budgetDisplay={budgetDisplay}
          setBudgetDisplay={setBudgetDisplay}
          purchasePurpose={purchasePurpose}
          setPurchasePurpose={setPurchasePurpose}
          riskTolerance={riskTolerance}
          setRiskTolerance={setRiskTolerance}
          financingNote={financingNote}
          setFinancingNote={setFinancingNote}
          preferredRegions={preferredRegions}
          setPreferredRegions={setPreferredRegions}
          assetTypes={assetTypes}
          setAssetTypes={setAssetTypes}
          mustHave={mustHave}
          setMustHave={setMustHave}
          niceToHave={niceToHave}
          setNiceToHave={setNiceToHave}
          missingQuestions={missingQuestions}
          setMissingQuestions={setMissingQuestions}
          editError={editError}
          isSaving={isSaving}
          onSave={handleSave}
          onCancel={handleToggleEdit}
        />
      ) : (
        <div className="space-y-6">
          <BuyerIntentViewer
            intent={intent}
            preferredRegions={preferredRegions}
            assetTypes={assetTypes}
            mustHave={mustHave}
            niceToHave={niceToHave}
          />

          {/* Buyer Memo Section Component */}
          {buyerMemoSectionComponent}

          {/* Match History list */}
          <BuyerMatchHistory matchHistory={matchHistory} />
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
