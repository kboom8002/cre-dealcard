"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";

interface KakaoShareButtonProps {
  text: string;
  buildingId: string;
  dealTitle?: string;
  brokerSlug?: string;
  areaSignal?: string;
  variant?: "primary" | "secondary" | "compact" | "utility";
  showEditForm?: boolean;
}

declare global {
  interface Window {
    Kakao?: {
      isInitialized: () => boolean;
      init: (key: string) => void;
      Share: {
        sendDefault: (options: Record<string, unknown>) => void;
      };
    };
  }
}

export function KakaoShareButton({
  text,
  buildingId,
  dealTitle = "블라인드 딜카드",
  brokerSlug,
  areaSignal,
  variant = "secondary",
  showEditForm = false,
}: KakaoShareButtonProps) {
  const [shared, setShared] = useState(false);
  const [kakaoReady, setKakaoReady] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState(text);

  useEffect(() => {
    setEditedText(text);
  }, [text]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.Kakao) {
      if (!window.Kakao.isInitialized()) {
        const appKey = process.env.NEXT_PUBLIC_KAKAO_APP_KEY;
        if (appKey) window.Kakao.init(appKey);
      }
      setKakaoReady(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js";
    script.async = true;
    script.onload = () => {
      if (window.Kakao && !window.Kakao.isInitialized()) {
        const appKey = process.env.NEXT_PUBLIC_KAKAO_APP_KEY;
        if (appKey) window.Kakao.init(appKey);
      }
      setKakaoReady(true);
    };
    document.head.appendChild(script);
  }, []);

  const siteUrl = "https://credeal.net";
  const dealUrl = `${siteUrl}/dc/${buildingId}`;
  const ogImageUrl = `${siteUrl}/api/og/deal/${buildingId}`;

  function handleShare() {
    const finalText = typeof window !== 'undefined' 
      ? sessionStorage.getItem(`kakao_text_${buildingId}`) || editedText 
      : editedText;

    const currentOgImageUrl = `${ogImageUrl}?t=${Date.now()}`;

    if (kakaoReady && window.Kakao?.Share) {
      try {
        (window.Kakao.Share as any).sendDefault({
          objectType: "feed",
          content: {
            title: dealTitle || "블라인드 딜카드",
            description: finalText.slice(0, 200),
            imageUrl: currentOgImageUrl,
            imageWidth: 1200,
            imageHeight: 630,
            link: {
              webUrl: dealUrl,
              mobileWebUrl: dealUrl,
            },
          },
          buttons: [
            {
              title: "딜카드 보기",
              link: {
                webUrl: dealUrl,
                mobileWebUrl: dealUrl,
              },
            },
          ],
        });
        setShared(true);
        setTimeout(() => setShared(false), 3000);
        return;
      } catch {
        // fallback
      }
    }

    const fullText = `${finalText}\n\n🔗 딜카드 링크: ${dealUrl}`;
    navigator.clipboard
      .writeText(fullText)
      .then(() => {
        setShared(true);
        setTimeout(() => setShared(false), 3000);
        if (/Android|iPhone|iPad/i.test(navigator.userAgent)) {
          window.location.href = `kakaolink://send?text=${encodeURIComponent(fullText)}`;
        }
      })
      .catch(() => {
        toast.error('딜카드 링크 복사에 실패했습니다.');
      });
  }

  const handleDownloadCardImage = async () => {
    try {
      toast.info("📸 티저 이미지 생성 중...");
      const cardImgUrl = `/api/og/deal/${buildingId}/card`;
      const res = await fetch(cardImgUrl);
      if (!res.ok) {
        throw new Error(`이미지 생성 실패 (${res.status})`);
      }
      const contentType = res.headers.get('content-type');
      if (!contentType?.includes('image')) {
        throw new Error('이미지 응답이 아닙니다');
      }
      const blob = await res.blob();
      if (blob.size < 1000) {
        throw new Error('이미지가 손상되었습니다');
      }
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `deal_card_${buildingId}_teaser.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("📸 1페이지 티저 이미지가 저장되었습니다.");
    } catch (e) {
      console.error("Card image download failed:", e);
      toast.error("이미지 다운로드 중 오류가 발생했습니다.");
    }
  };

  const handleCopyCardImageUrl = () => {
    const cardImgUrl = `${siteUrl}/api/og/deal/${buildingId}/card`;
    navigator.clipboard.writeText(cardImgUrl).then(() => {
      toast.success("📸 1페이지 티저 이미지 링크가 클립보드에 복사되었습니다!");
    });
  };

  const label = shared ? "✅ 완료!" : (variant === "compact" ? "🟡 카톡" : "🟡 카톡으로 전송");
  const readyClass = kakaoReady ? "" : "opacity-80";

  const handleSaveText = () => {
    sessionStorage.setItem(`kakao_text_${buildingId}`, editedText);
    window.dispatchEvent(new Event(`kakao_update_${buildingId}`));
    setIsEditing(false);
  };

  const handleEditClick = () => {
    const currentStorageText = sessionStorage.getItem(`kakao_text_${buildingId}`);
    if (currentStorageText) setEditedText(currentStorageText);
    setIsEditing(true);
  };

  const renderEditModal = () => (
    isEditing && !showEditForm && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in">
        <div className="bg-card w-full max-w-sm rounded-xl p-5 space-y-4 shadow-xl">
          <h3 className="text-base font-semibold">카톡 문구 수정</h3>
          <textarea
            value={editedText}
            onChange={(e) => setEditedText(e.target.value)}
            className="w-full min-h-[160px] p-3 text-sm rounded-lg border border-border bg-background focus:ring-1 focus:ring-primary outline-none"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setIsEditing(false)}
              className="flex-1 py-2.5 text-sm font-medium rounded-lg border border-border bg-muted/50 hover:bg-muted"
            >
              취소
            </button>
            <button
              onClick={handleSaveText}
              className="flex-1 py-2.5 text-sm font-bold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
            >
              수정 완료
            </button>
          </div>
        </div>
      </div>
    )
  );

  // Compact Variant (for Sticky Bottom CTA Bar)
  if (variant === "compact") {
    return (
      <div className="flex w-full gap-1.5">
        <button
          onClick={handleShare}
          className={`flex-1 flex items-center justify-center rounded-xl bg-[#FEE500] text-[#3C1E1E] px-3 py-2.5 text-sm font-bold shadow-sm transition-all hover:bg-[#FEE500]/90 active:scale-[0.98] ${readyClass}`}
          id="cta-kakao-share-compact"
        >
          {label}
        </button>
        <button
          onClick={handleEditClick}
          className="w-10 shrink-0 flex items-center justify-center rounded-xl bg-[#FEE500]/20 text-[#a08000] dark:text-[#FEE500] hover:bg-[#FEE500]/30 transition-all text-sm font-bold"
          aria-label="카톡 문구 수정"
          title="카톡 문구 수정"
        >
          ✏️
        </button>
        {renderEditModal()}
      </div>
    );
  }

  // Utility Variant (for Scroll Area)
  if (variant === "utility") {
    return (
      <div className="flex gap-2 w-full">
        <button
          onClick={handleDownloadCardImage}
          className="flex-1 py-2.5 px-3 bg-secondary/60 hover:bg-secondary text-secondary-foreground rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 border border-border transition-colors shadow-sm"
        >
          <span>📸</span> 1페이지 티저 이미지 다운로드
        </button>
        <button
          onClick={handleCopyCardImageUrl}
          className="py-2.5 px-3 bg-secondary/40 hover:bg-secondary/70 text-secondary-foreground rounded-xl text-xs font-medium border border-border transition-colors"
          title="티저 이미지 URL 복사"
        >
          📋 URL 복사
        </button>
      </div>
    );
  }

  // Default Primary / Secondary
  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="flex w-full gap-2">
        <button
          onClick={handleShare}
          className={`flex-1 inline-flex items-center justify-center rounded-lg bg-[#FEE500]/20 text-[#a08000] dark:text-[#FEE500] px-4 py-2.5 text-sm font-medium transition-colors hover:bg-[#FEE500]/30 active:scale-[0.98] ${readyClass}`}
          id="cta-kakao-share"
        >
          {label}
        </button>
        <button
          onClick={handleEditClick}
          className={`shrink-0 inline-flex items-center justify-center rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm font-medium transition-colors hover:bg-muted active:scale-[0.98]`}
          title="문구 수정"
        >
          ✏️ 수정
        </button>
      </div>

      <div className="flex gap-2 w-full">
        <button
          onClick={handleDownloadCardImage}
          className="flex-1 py-2 px-3 bg-secondary/40 hover:bg-secondary text-secondary-foreground rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 border border-border transition-colors"
        >
          <span>📸</span> 1페이지 이미지 저장 (스마트폰 앨범용)
        </button>
        <button
          onClick={handleCopyCardImageUrl}
          className="py-2 px-3 bg-secondary/20 hover:bg-secondary/40 text-secondary-foreground rounded-lg text-xs font-medium border border-border transition-colors"
        >
          📋 링크 복사
        </button>
      </div>
      {renderEditModal()}
    </div>
  );
}
