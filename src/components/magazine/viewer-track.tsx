"use client";

/**
 * 뷰어 분석 추적 아일랜드 (E-03 U-06)
 *
 * 매거진 뷰어 본문은 Server Component 로 렌더되고, 분석/클릭 추적만 이 클라이언트 아일랜드가 맡는다.
 *  - `ViewerTrackProvider`: `useMagazineAnalytics` 1회 구독 + 섹션 노출/체류(IntersectionObserver) +
 *    `[data-track]` 링크 클릭 위임. 서버 본문은 onClick 함수 대신 `data-track*` 속성만 내려보낸다.
 *  - `useViewerTrack()`: 다른 클라이언트 섬(PollSection·ForwardSection·ViewerBottomBar·RoiIsland)이 쓰는 `onTrack`.
 * 에디터 미리보기(preview)·Provider 밖에서는 모두 no-op (분석 오염 방지, T1-13).
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { useMagazineAnalytics } from "@/hooks/use-magazine-analytics";
import { SCANNER_OR_BOT_UA_RE } from "@/lib/magazine/public-page-data";
import { safeTrackClick } from "@/lib/magazine/view-helpers";

export type ViewerTrack = (target: string, meta?: Record<string, unknown>) => void;

const noopTrack: ViewerTrack = () => {};
const ViewerTrackContext = createContext<ViewerTrack>(noopTrack);

export function useViewerTrack(): ViewerTrack {
  return useContext(ViewerTrackContext);
}

interface ProviderProps {
  editionId: string;
  brokerId: string;
  /** 에디터 미리보기: 분석 비콘 비활성 */
  preview: boolean;
  /** 서버 추적 마스터 스위치 (기본 true) */
  trackingEnabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

export function ViewerTrackProvider({
  editionId,
  brokerId,
  preview,
  trackingEnabled = true,
  className,
  style,
  children,
}: ProviderProps) {
  const isScannerClient =
    typeof navigator !== "undefined" && SCANNER_OR_BOT_UA_RE.test(navigator.userAgent || "");
  const active = !preview && trackingEnabled && !isScannerClient;
  const analytics = useMagazineAnalytics({
    editionId,
    brokerId,
    // 에디터 미리보기·추적 비활성·봇/스캐너 UA 에서는 분석 비콘을 발사하지 않는다 (T1-13, P1-4)
    enabled: active,
  });
  const { trackSection, trackInteraction } = analytics;
  const rootRef = useRef<HTMLDivElement>(null);

  // 섹션 노출/체류 추적 — 한 번만 observe 하고 unmount 시 정리한다.
  useEffect(() => {
    if (!active) return;
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const entered = new Set<string>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).dataset.sectionId;
        if (!id) continue;
        if (entry.isIntersecting) {
          entered.add(id);
          trackSection(id, "enter");
        } else if (entered.has(id)) {
          entered.delete(id);
          trackSection(id, "leave");
        }
      }
    }, { threshold: 0.3 });
    root.querySelectorAll<HTMLElement>("[data-section-id]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [active, trackSection]);

  const onTrack = useCallback<ViewerTrack>((trackTarget, meta) => {
    if (!active) return;
    if (trackTarget === "poll_vote") trackInteraction("poll_vote", meta);
    else if (trackTarget === "referral_copy") trackInteraction("referral_copy", meta);
    else if (trackTarget === "calc_simulate") trackInteraction("calc_simulate", meta);
    else safeTrackClick(analytics, trackTarget, meta);
  }, [active, analytics, trackInteraction]);

  // 서버 본문의 `<a data-track="listing_click" data-track-listing-id=… data-track-from=…>` 클릭 위임
  const onClickCapture = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!active) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-track]");
    if (!el || !rootRef.current?.contains(el)) return;
    const target = el.dataset.track;
    if (!target) return;
    const meta: Record<string, unknown> = {};
    if (el.dataset.trackListingId) meta.listing_id = el.dataset.trackListingId;
    if (el.dataset.trackFrom) meta.from = el.dataset.trackFrom;
    onTrack(target, Object.keys(meta).length > 0 ? meta : undefined);
  }, [active, onTrack]);

  const value = useMemo(() => onTrack, [onTrack]);

  return (
    <ViewerTrackContext.Provider value={value}>
      <div ref={rootRef} className={className} style={style} onClickCapture={onClickCapture}>
        {children}
      </div>
    </ViewerTrackContext.Provider>
  );
}
