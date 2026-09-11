"use client";

import { useState, useEffect } from "react";
import { ImDataBottomSheet } from "./im-data-bottom-sheet";

interface CreateMobileImButtonProps {
  buildingId: string;
  hasBasicIM?: boolean;
  areaSignal?: string;
  assetType?: string;
  priceBand?: string;
  sizeSignal?: string;
  vacancySignal?: string;
  fitSummary?: string;
  cautionSummary?: string;
  existingPhotoUrls?: string[];
  initialAddress?: string;
  initialPnu?: string;
  currentGrade?: string;
  prefillAskingPrice?: number;
  prefillLoanAmount?: number;
  prefillTotalDeposit?: number;
  prefillMonthlyRent?: number;
  prefillMgmtFee?: number;
  prefillVacancyPct?: number;
  initialInvestmentPosture?: string;
  postureProposal?: {
    value: string;
    confidence: number;
    reason: string;
  };
  existingDocBody?: any;
}

export function CreateMobileImButton({
  buildingId,
  hasBasicIM = false,
  areaSignal,
  assetType,
  priceBand,
  sizeSignal,
  vacancySignal,
  fitSummary,
  cautionSummary,
  existingPhotoUrls,
  initialAddress,
  initialPnu,
  currentGrade,
  prefillAskingPrice,
  prefillLoanAmount,
  prefillTotalDeposit,
  prefillMonthlyRent,
  prefillMgmtFee,
  prefillVacancyPct,
  initialInvestmentPosture = "income",
  postureProposal,
  existingDocBody,
}: CreateMobileImButtonProps) {
  const [showBottomSheet, setShowBottomSheet] = useState(false);
  const [stage, setStage] = useState<'basic' | 'pro'>('basic');

  useEffect(() => {
    const handleOpen = (e: Event) => {
      const customEvent = e as CustomEvent<{ stage?: 'basic' | 'pro' }>;
      if (customEvent.detail?.stage) {
        setStage(customEvent.detail.stage);
      }
      setShowBottomSheet(true);
    };
    window.addEventListener("open-mobile-im-sheet", handleOpen);
    return () => window.removeEventListener("open-mobile-im-sheet", handleOpen);
  }, []);

  return (
    <>
      <div className="flex w-full gap-2">
        <button
          onClick={() => { setStage('basic'); setShowBottomSheet(true); }}
          className="flex-1 inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 px-2 py-3 text-xs sm:text-sm font-bold text-white transition-all hover:opacity-90 active:scale-[0.98] shadow-md shadow-blue-900/30"
          id="cta-mobile-im-basic"
        >
          {!hasBasicIM ? '⚡ 기본 IM' : '📝 수정'}
        </button>
        <button
          onClick={() => { setStage('pro'); setShowBottomSheet(true); }}
          className="flex-1 inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 px-2 py-3 text-xs sm:text-sm font-bold text-white transition-all hover:opacity-90 active:scale-[0.98] shadow-md shadow-purple-900/30"
          id="cta-mobile-im-pro"
        >
          🎯 전문 IM
        </button>
      </div>

      <ImDataBottomSheet
        buildingId={buildingId}
        isOpen={showBottomSheet}
        onClose={() => setShowBottomSheet(false)}
        areaSignal={areaSignal}
        assetType={assetType}
        priceBand={priceBand}
        sizeSignal={sizeSignal}
        vacancySignal={vacancySignal}
        fitSummary={fitSummary}
        cautionSummary={cautionSummary}
        existingPhotoUrls={existingPhotoUrls}
        initialAddress={initialAddress}
        initialPnu={initialPnu}
        initialStage={stage}
        targetTier={stage}
        currentDataGrade={currentGrade}
        prefillAskingPrice={prefillAskingPrice}
        prefillLoanAmount={prefillLoanAmount}
        prefillTotalDeposit={prefillTotalDeposit}
        prefillMonthlyRent={prefillMonthlyRent}
        prefillMgmtFee={prefillMgmtFee}
        prefillVacancyPct={prefillVacancyPct}
        initialInvestmentPosture={initialInvestmentPosture}
        postureProposal={postureProposal}
        existingDocBody={existingDocBody}
      />
    </>
  );
}
