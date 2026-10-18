"use client";

import React, { useEffect, useMemo, useRef } from "react";
import { Eye, ChevronRight } from "lucide-react";
import { MagazineView } from "@/app/(magazine)/magazine/[brokerId]/[date]/magazine-view";
import {
  PREVIEW_IFRAME_ENABLED,
  PREVIEW_MSG_READY,
  buildDraftMessage,
  buildPreviewSrc,
  isAllowedOrigin,
  parsePreviewMessage,
  toTransferableContent,
} from "@/lib/magazine/preview-bridge";

interface MagazinePhonePreviewProps {
  previewData: any;
  brokerSlug?: string | null;
  today: string;
  dateLabel?: string;
  brokerVibe?: Record<string, any> | null;
  /** 초안 에디션 id — iframe 미리보기(`?edition=`)에 필요 */
  editionId?: string | null;
  /** 'auto'(기본): 뷰어 수신기가 준비되면 iframe, 아니면 인라인 폴백 */
  mode?: "auto" | "inline" | "iframe";
}

/**
 * 폰 프레임 안에서 position:fixed 요소(뷰어 하단 바 등)가 프레임 밖으로 탈출하지 않도록
 * 프레임 자체를 새 containing block 으로 만든다 (U-02 인라인 폴백).
 */
export const PHONE_FRAME_ISOLATION_STYLE: React.CSSProperties = {
  transform: "translateZ(0)",
  contain: "layout paint",
};

export function resolvePreviewMode(
  mode: "auto" | "inline" | "iframe",
  opts: { editionId?: string | null; brokerSlug?: string | null; iframeEnabled?: boolean },
): "iframe" | "inline" {
  const enabled = opts.iframeEnabled ?? PREVIEW_IFRAME_ENABLED;
  if (mode === "inline") return "inline";
  if (!opts.editionId || !opts.brokerSlug) return "inline";
  if (mode === "iframe") return "iframe";
  return enabled ? "iframe" : "inline";
}

export function MagazinePhonePreview({
  previewData,
  brokerSlug,
  today,
  dateLabel,
  brokerVibe,
  editionId,
  mode = "auto",
}: MagazinePhonePreviewProps) {
  const resolved = resolvePreviewMode(mode, { editionId, brokerSlug });
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const readyRef = useRef(false);
  const [iframeReady, setIframeReady] = React.useState(false);
  const seqRef = useRef(0);
  const content = useMemo(() => toTransferableContent(previewData), [previewData]);
  const contentRef = useRef(content);

  // 최신 content 를 ref 로 유지 (ready 핸드셰이크 시점에 최신값 전송)
  useEffect(() => {
    contentRef.current = content;
  });

  const postDraft = (id: string) => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    seqRef.current += 1;
    win.postMessage(
      buildDraftMessage(id, contentRef.current, seqRef.current),
      window.location.origin
    );
  };

  // iframe → 부모 ready 수신 후 초안 전달 (same-origin 만)
  useEffect(() => {
    if (resolved !== "iframe" || !editionId) return;
    const onMessage = (ev: MessageEvent) => {
      if (!isAllowedOrigin(ev.origin, window.location.origin)) return;
      if (ev.source !== iframeRef.current?.contentWindow) return;
      const msg = parsePreviewMessage(ev.data);
      if (!msg || msg.editionId !== editionId) return;
      if (msg.type === PREVIEW_MSG_READY) {
        readyRef.current = true;
        setIframeReady(true);
        postDraft(editionId);
      }
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      readyRef.current = false;
      setIframeReady(false);
    };
  }, [resolved, editionId]);

  // 편집 내용이 바뀌면 iframe 에 재전송
  useEffect(() => {
    if (resolved !== "iframe" || !editionId || !readyRef.current) return;
    postDraft(editionId);
  }, [resolved, editionId, content]);

  return (
    <div className="flex-1 bg-[#E8E6DF] dark:bg-slate-950 bg-[radial-gradient(#94A3B8_1px,transparent_1px)] dark:bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:22px_22px] flex items-center justify-center p-4 lg:p-8 overflow-y-auto">
      <div className="flex flex-col items-center gap-4">
        {/* 미리보기 스튜디오 배지 */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/95 dark:bg-slate-900/90 border border-slate-300/90 dark:border-slate-700 shadow-xs text-xs font-extrabold text-slate-800 dark:text-slate-200 backdrop-blur-md">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
          <Eye className="w-3.5 h-3.5 text-blue-600 dark:text-indigo-400" aria-hidden="true" />
          <span>실시간 고객 화면 미리보기</span>
          <ChevronRight className="w-3 h-3 text-slate-400" aria-hidden="true" />
          <span className="text-slate-600 dark:text-slate-400 font-semibold">스마트폰 화면 (375×812)</span>
        </div>

        {/* 폰 목업 — data-theme-lock="dark"로 주간 모드에서도 아이폰 블랙 베젤·노치·다크 리더 원형 100% 보존 */}
        <div
          data-testid="phone-frame"
          data-theme-lock="dark"
          data-preview-mode={resolved}
          style={{
            ...PHONE_FRAME_ISOLATION_STYLE,
            backgroundColor: "#0B1120",
            borderColor: "#18181B",
          }}
          className="w-[375px] h-[812px] bg-[#0B1120] border-[10px] border-[#18181B] rounded-[3.2rem] overflow-hidden shadow-[0_28px_60px_-12px_rgba(15,23,42,0.38),0_0_0_2px_rgba(255,255,255,0.22)] relative flex flex-col shrink-0 transition-transform duration-300"
        >
          {/* 노치 (Dynamic Island / Notch) */}
          <div
            aria-hidden="true"
            style={{ backgroundColor: "#09090B" }}
            className="absolute top-0 inset-x-0 h-6 bg-[#09090B] rounded-b-2xl z-20 mx-auto w-36 shadow-xs"
          />

          {resolved === "iframe" && brokerSlug && editionId ? (
            <div className="relative flex-1 w-full bg-[#0B1120] overflow-hidden flex flex-col">
              {!iframeReady && previewData && (
                <div
                  aria-hidden="true"
                  className="absolute inset-0 z-0 overflow-y-auto w-full no-scrollbar bg-[#0B1120] text-white pointer-events-none"
                >
                  <MagazineView
                    data={previewData}
                    brokerId={brokerSlug}
                    brokerSlug={brokerSlug}
                    date={today}
                    dateLabel={dateLabel}
                    brokerVibe={brokerVibe}
                    preview
                  />
                </div>
              )}
              <iframe
                ref={iframeRef}
                title="매거진 실시간 미리보기"
                src={buildPreviewSrc(brokerSlug, today, editionId)}
                style={{
                  backgroundColor: iframeReady ? "#0B1120" : "transparent",
                  opacity: iframeReady ? 1 : 0,
                }}
                className="relative z-10 flex-1 w-full border-0 transition-opacity duration-200"
              />
            </div>
          ) : (
            /* 매거진 뷰 (인라인 폴백) */
            <div className="flex-1 overflow-y-auto w-full no-scrollbar relative bg-[#0B1120] text-white">
              {previewData && brokerSlug ? (
                <MagazineView
                  data={previewData}
                  brokerId={brokerSlug}
                  brokerSlug={brokerSlug}
                  date={today}
                  dateLabel={dateLabel}
                  brokerVibe={brokerVibe}
                  preview
                />
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

