"use client";

import { useState, useEffect } from "react";

interface KakaoShareButtonProps {
  text: string;
  buildingId: string;
  dealTitle?: string;
  brokerSlug?: string;
  areaSignal?: string;
  variant?: "primary" | "secondary";
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

  // Sync initial text to editedText if text prop changes
  useEffect(() => {
    setEditedText(text);
  }, [text]);

  // 카카오 SDK 로드
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

  // 카카오 SDK은 등록된 도메인에서만 작동함 → 항상 credeal.net 사용
  const siteUrl = "https://credeal.net";
  // 공유 대상 페이지: /dc/[id] (공개 딜카드 단축 페이지 — 한글 없이 안정적 접근)
  const dealUrl = `${siteUrl}/dc/${buildingId}`;
  // 딜카드별 동적 OG 이미지: /api/og/deal/[id]
  // 브로커 바이브카드 이미지는 보조 fallback
  const ogImageUrl = `${siteUrl}/api/og/deal/${buildingId}`;
  const vibeCardOgUrl = brokerSlug
    ? `${siteUrl}/api/og/vibe-card/${brokerSlug}`
    : `${siteUrl}/api/og/vibe-card/js-realty`;

  function handleShare() {
    const finalText = typeof window !== 'undefined' 
      ? sessionStorage.getItem(`kakao_text_${buildingId}`) || editedText 
      : editedText;

    // 카카오 SDK 사용 가능한 경우
    if (kakaoReady && window.Kakao?.Share) {
      try {
        window.Kakao.Share.sendDefault({
          objectType: "feed",
          content: {
            title: `🏢 ${dealTitle}`,
            description: finalText.slice(0, 120) + (finalText.length > 120 ? "..." : ""),
            imageUrl: ogImageUrl,
            imageWidth: 1200,
            imageHeight: 630,
            link: {
              mobileWebUrl: dealUrl,
              webUrl: dealUrl,
            },
          },
          buttons: [
            {
              title: "딜카드 보기",
              link: {
                mobileWebUrl: dealUrl,
                webUrl: dealUrl,
              },
            },
            {
              title: "브로커 프로필",
              link: {
                mobileWebUrl: `${siteUrl}/vibe-card/${brokerSlug ?? "js-realty"}`,
                webUrl: `${siteUrl}/vibe-card/${brokerSlug ?? "js-realty"}`,
              },
            },
          ],
        });
        setShared(true);
        setTimeout(() => setShared(false), 3000);
        return;
      } catch {
        // SDK 실패 시 fallback
      }
    }

    // 폴백: 카톡 문구 + 링크를 클립보드에 복사 후 카카오 앱 열기
    const fullText = `${finalText}\n\n🔗 딜카드 링크: ${dealUrl}`;
    navigator.clipboard
      .writeText(fullText)
      .then(() => {
        setShared(true);
        setTimeout(() => setShared(false), 3000);
        // 모바일에서 카카오 앱 스킴 시도
        if (/Android|iPhone|iPad/i.test(navigator.userAgent)) {
          window.location.href = `kakaolink://send?text=${encodeURIComponent(fullText)}`;
        }
      })
      .catch(() => {
        alert(`딜카드 링크:\n${dealUrl}\n\n카카오에 붙여넣기 하세요.`);
      });
  }

  const label = shared ? "✅ 전송 완료!" : "🟡 카톡으로 전송";
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

  if (isEditing && showEditForm) {
    return (
      <div className="space-y-3 w-full">
        <textarea
          value={editedText}
          onChange={(e) => setEditedText(e.target.value)}
          className="w-full min-h-[160px] p-3 text-sm rounded-lg border border-border bg-background focus:ring-1 focus:ring-primary outline-none"
        />
        <div className="flex gap-2">
          <button
            onClick={() => setIsEditing(false)}
            className="flex-1 py-2 text-sm font-medium rounded-lg border border-border bg-muted/50 hover:bg-muted"
          >
            취소
          </button>
          <button
            onClick={handleSaveText}
            className="flex-1 py-2 text-sm font-bold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
          >
            수정 완료
          </button>
        </div>
      </div>
    );
  }

  if (variant === "primary") {
    return (
      <>
        <div className="flex w-full gap-1.5">
          <button
            onClick={handleShare}
            className={`flex-1 flex items-center justify-center rounded-xl bg-[#FEE500] text-[#3C1E1E] px-4 py-3.5 text-base font-bold shadow-sm transition-all hover:bg-[#FEE500]/90 active:scale-[0.98] ${readyClass}`}
            id="cta-kakao-share-primary"
          >
            {label}
          </button>
          <button
            onClick={handleEditClick}
            className={`w-14 shrink-0 flex flex-col items-center justify-center rounded-xl bg-[#FEE500]/20 text-[#a08000] dark:text-[#FEE500] hover:bg-[#FEE500]/30 transition-all active:scale-[0.98]`}
            aria-label="카톡 문구 수정"
          >
            <span className="text-lg">✏️</span>
            <span className="text-[10px] font-bold mt-0.5">수정</span>
          </button>
        </div>

        {/* Edit Modal (used when sticky primary CTA triggers edit but showEditForm isn't true here, so we show a modal) */}
        {isEditing && !showEditForm && (
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
                  수정 및 저장
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // Secondary Button Layout (Inside Preview)
  return (
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
  );
}
