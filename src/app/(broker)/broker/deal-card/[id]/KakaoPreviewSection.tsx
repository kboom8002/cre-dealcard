"use client";

import { useState, useEffect } from "react";
import { KakaoShareButton } from "./kakao-share-button";

interface KakaoPreviewSectionProps {
  initialText: string;
  buildingId: string;
  dealTitle?: string;
  brokerSlug?: string;
}

export function KakaoPreviewSection({
  initialText,
  buildingId,
  dealTitle,
  brokerSlug,
}: KakaoPreviewSectionProps) {
  const [currentText, setCurrentText] = useState(initialText);

  useEffect(() => {
    // Check initial
    const stored = sessionStorage.getItem(`kakao_text_${buildingId}`);
    if (stored) setCurrentText(stored);

    // Custom event listener for same-tab updates
    const handleUpdate = () => {
      const updated = sessionStorage.getItem(`kakao_text_${buildingId}`);
      if (updated) setCurrentText(updated);
    };

    window.addEventListener(`kakao_update_${buildingId}`, handleUpdate);
    return () => window.removeEventListener(`kakao_update_${buildingId}`, handleUpdate);
  }, [buildingId]);

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-3">
      <h2 className="text-base font-semibold flex items-center gap-2">
        <span>💬</span> 카톡 문구
      </h2>
      <div className="rounded-lg bg-muted/60 dark:bg-muted/40 px-4 py-3 text-sm whitespace-pre-line leading-relaxed">
        {currentText}
      </div>
      <KakaoShareButton 
        text={currentText} 
        buildingId={buildingId} 
        dealTitle={dealTitle} 
        brokerSlug={brokerSlug} 
        showEditForm 
      />
    </div>
  );
}
