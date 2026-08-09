"use client";

import { useState } from "react";
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
  currentGrade?: string;
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
  currentGrade,
}: CreateMobileImButtonProps) {
  const [showBottomSheet, setShowBottomSheet] = useState(false);
  const [stage, setStage] = useState<'basic' | 'pro'>('basic');

  const isProLocked = currentGrade === 'C' || currentGrade === 'D' || !currentGrade;

  return (
    <>
      <div className="w-full">
        {!hasBasicIM ? (
          <button
            onClick={() => { setStage('basic'); setShowBottomSheet(true); }}
            className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 px-3 py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98] w-full shadow-md shadow-blue-900/30"
            id="cta-mobile-im-basic"
          >
            ⚡ Basic IM 작성
          </button>
        ) : isProLocked ? (
          <button
            onClick={() => { setStage('basic'); setShowBottomSheet(true); }}
            className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-3 py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98] w-full shadow-md shadow-blue-900/30"
            id="cta-mobile-im-edit"
          >
            📝 IM 수정 / 렌더링
          </button>
        ) : (
          <button
            onClick={() => { setStage('pro'); setShowBottomSheet(true); }}
            className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-3 py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98] w-full shadow-md shadow-indigo-900/30"
            id="cta-mobile-im-pro"
          >
            🏆 Pro IM 작성
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
        initialStage={stage}
        targetTier={stage}
        currentDataGrade={currentGrade}
      />
    </>
  );
}
