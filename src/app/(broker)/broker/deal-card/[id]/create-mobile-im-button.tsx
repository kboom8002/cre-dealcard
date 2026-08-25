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
}: CreateMobileImButtonProps) {
  const [showBottomSheet, setShowBottomSheet] = useState(false);
  const [stage, setStage] = useState<'basic'>('basic');

  useEffect(() => {
    const handleOpen = (e: Event) => {
      const customEvent = e as CustomEvent<{ stage?: 'basic' | 'pro' }>;
      if (customEvent.detail?.stage) {
        setStage('basic');
      }
      setShowBottomSheet(true);
    };
    window.addEventListener("open-mobile-im-sheet", handleOpen);
    return () => window.removeEventListener("open-mobile-im-sheet", handleOpen);
  }, []);

  return (
    <>
      <div className="w-full">
        {!hasBasicIM ? (
          <button
            onClick={() => { setStage('basic'); setShowBottomSheet(true); }}
            className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 px-2 py-3 text-xs sm:text-sm font-bold text-white transition-all hover:opacity-90 active:scale-[0.98] w-full shadow-md shadow-blue-900/30"
            id="cta-mobile-im-basic"
          >
            ⚡ IM 생성
          </button>
        ) : (
          <button
            onClick={() => { setStage('basic'); setShowBottomSheet(true); }}
            className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-2 py-3 text-xs sm:text-sm font-bold text-white transition-all hover:opacity-90 active:scale-[0.98] w-full shadow-md shadow-blue-900/30"
            id="cta-mobile-im-edit"
          >
            📝 IM 수정
          </button>
        )}
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
      />
    </>
  );
}
