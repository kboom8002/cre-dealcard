"use client";

import { useState, useEffect } from "react";

interface KakaoShareButtonProps {
  text: string;
  buildingId: string;
  variant?: "primary" | "secondary";
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
  variant = "secondary",
}: KakaoShareButtonProps) {
  const [shared, setShared] = useState(false);
  const [kakaoReady, setKakaoReady] = useState(false);

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

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://credeal.net";
  const dealUrl = `${siteUrl}/broker/deal-card/${buildingId}`;

  function handleShare() {
    // 카카오 SDK 사용 가능한 경우
    if (kakaoReady && window.Kakao?.Share) {
      try {
        window.Kakao.Share.sendDefault({
          objectType: "feed",
          content: {
            title: "🏢 블라인드 딜카드 — JS부동산",
            description: text.slice(0, 120) + (text.length > 120 ? "..." : ""),
            imageUrl: `${siteUrl}/api/og/vibe-card/js-realty`,
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
    const fullText = `${text}\n\n🔗 딜카드 링크: ${dealUrl}`;
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

  if (variant === "primary") {
    return (
      <button
        onClick={handleShare}
        className={`inline-flex items-center justify-center w-full rounded-xl bg-[#FEE500] text-[#3C1E1E] px-6 py-3.5 text-base font-bold shadow-sm transition-all hover:bg-[#FEE500]/90 active:scale-[0.98] ${readyClass}`}
        id="cta-kakao-share-primary"
      >
        {label}
      </button>
    );
  }

  return (
    <button
      onClick={handleShare}
      className={`inline-flex items-center justify-center w-full rounded-lg bg-[#FEE500]/20 text-[#a08000] dark:text-[#FEE500] px-4 py-2.5 text-sm font-medium transition-colors hover:bg-[#FEE500]/30 active:scale-[0.98] ${readyClass}`}
      id="cta-kakao-share"
    >
      {label}
    </button>
  );
}
