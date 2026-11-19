"use client";

import React, { useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import {
  buildKakaoExternalOpenUrl,
  isInAppWebView,
} from "@/lib/ux/inapp-webview";
import { COPY_FAILED_MESSAGE, copyText } from "@/lib/ux/clipboard";

const subscribeNoop = () => () => {};
const getIsInAppSnapshot = () =>
  typeof navigator !== "undefined" && isInAppWebView(navigator.userAgent);
const getIsInAppServerSnapshot = () => false;

export interface InAppBrowserBannerProps {
  message?: string;
  forceShowForTest?: boolean;
}

/**
 * 카카오톡·네이버·라인 등 인앱 브라우저 접속 시 외부 브라우저(Safari/Chrome)로 안전하게 열어주는 공용 배너 (WP 4-D).
 */
export function InAppBrowserBanner({
  message = "카카오톡 등 인앱 브라우저에서는 파일 저장·전화·인증이 제한될 수 있습니다.",
  forceShowForTest = false,
}: InAppBrowserBannerProps) {
  const detectedInApp = useSyncExternalStore(
    subscribeNoop,
    getIsInAppSnapshot,
    getIsInAppServerSnapshot
  );
  const [dismissed, setDismissed] = useState(false);
  const visible = forceShowForTest || detectedInApp;

  if (!visible || dismissed) return null;

  const handleOpenExternal = async () => {
    if (typeof window === "undefined") return;
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const externalUrl = buildKakaoExternalOpenUrl(window.location.href, ua);
    if (externalUrl) {
      window.location.href = externalUrl;
      return;
    }
    const ok = await copyText(window.location.href);
    if (ok) {
      toast.success("주소가 복사되었습니다. Safari 또는 Chrome 주소창에 붙여넣어 열어 주세요.");
    } else {
      toast.error(COPY_FAILED_MESSAGE);
    }
  };

  const handleCopy = async () => {
    if (typeof window === "undefined") return;
    const ok = await copyText(window.location.href);
    if (ok) {
      toast.success("매물 링크가 복사되었습니다.");
    } else {
      toast.error(COPY_FAILED_MESSAGE);
    }
  };

  return (
    <div
      data-testid="inapp-webview-banner"
      role="region"
      aria-label="외부 브라우저 전환 안내"
      className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950 shadow-xs space-y-2.5"
    >
      <p className="text-sm font-bold leading-snug break-keep">{message}</p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-testid="open-external-browser-btn"
          onClick={() => void handleOpenExternal()}
          className="min-h-[44px] rounded-xl bg-slate-900 px-3.5 py-2 text-sm font-extrabold text-white hover:bg-slate-800 transition-colors cursor-pointer"
        >
          외부 브라우저(Safari/Chrome)로 열기
        </button>
        <button
          type="button"
          data-testid="copy-inapp-link-btn"
          onClick={() => void handleCopy()}
          className="min-h-[44px] rounded-xl border border-amber-400 bg-white px-3.5 py-2 text-sm font-bold text-amber-950 hover:bg-amber-100 transition-colors cursor-pointer"
        >
          링크 복사
        </button>
        <button
          type="button"
          aria-label="인앱 안내 닫기"
          onClick={() => setDismissed(true)}
          className="min-h-[44px] min-w-[44px] ml-auto rounded-xl px-2.5 py-2 text-sm font-bold text-amber-900 hover:bg-amber-100 transition-colors cursor-pointer"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
