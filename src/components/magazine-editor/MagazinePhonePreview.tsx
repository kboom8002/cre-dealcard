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
        postDraft(editionId);
      }
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      readyRef.current = false;
    };
  }, [resolved, editionId]);

  // 편집 내용이 바뀌면 iframe 에 재전송
  useEffect(() => {
    if (resolved !== "iframe" || !editionId || !readyRef.current) return;
    postDraft(editionId);
  }, [resolved, editionId, content]);

  return (
    <div className="flex-1 bg-slate-950 flex items-center justify-center p-4 lg:p-10 overflow-y-auto">
      <div className="flex flex-col items-center gap-4">
        {/* 미리보기 라벨 */}
        <div className="flex items-center gap-2 text-ink-subtle">
          <Eye className="w-3.5 h-3.5" aria-hidden="true" />
          <span className="text-caption font-medium">실시간 미리보기</span>
          <ChevronRight className="w-3 h-3" aria-hidden="true" />
          <span className="text-caption text-ink-subtle">iPhone 14 Pro (375×812)</span>
        </div>

        {/* 폰 목업 */}
        <div
          data-testid="phone-frame"
          data-preview-mode={resolved}
          style={PHONE_FRAME_ISOLATION_STYLE}
          className="w-[375px] h-[812px] bg-[#0B1120] border-[8px] border-slate-900 rounded-[3rem] overflow-hidden shadow-2xl relative flex flex-col shrink-0"
        >
          {/* 노치 */}
          <div
            aria-hidden="true"
            className="absolute top-0 inset-x-0 h-6 bg-slate-900 rounded-b-xl z-20 mx-auto w-40"
          />

          {resolved === "iframe" && brokerSlug && editionId ? (
            <iframe
              ref={iframeRef}
              title="매거진 실시간 미리보기"
              src={buildPreviewSrc(brokerSlug, today, editionId)}
              className="flex-1 w-full border-0 bg-[#0B1120]"
            />
          ) : (
            /* 매거진 뷰 (인라인 폴백) */
            <div className="flex-1 overflow-y-auto w-full no-scrollbar relative">
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
