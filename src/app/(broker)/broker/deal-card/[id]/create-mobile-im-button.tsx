"use client";

import { useState } from "react";
import { ImDataBottomSheet } from "./im-data-bottom-sheet";

interface CreateMobileImButtonProps {
  buildingId: string;
  areaSignal?: string;
  assetType?: string;
  priceBand?: string;
  sizeSignal?: string;
  vacancySignal?: string;
  fitSummary?: string;
  cautionSummary?: string;
}

export function CreateMobileImButton({
  buildingId,
  areaSignal,
  assetType,
  priceBand,
  sizeSignal,
  vacancySignal,
  fitSummary,
  cautionSummary,
}: CreateMobileImButtonProps) {
  const [showBottomSheet, setShowBottomSheet] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowBottomSheet(true)}
        className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 px-3 py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98] w-full shadow-md shadow-blue-900/30"
        id="cta-mobile-im"
      >
        📱 모바일 투자설명서 만들기
      </button>

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
      />
    </>
  );
}
