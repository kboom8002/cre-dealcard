/**
 * 매거진 뷰어에서 조회/체류/스크롤 이벤트를 magazine_analytics_events에 기록.
 * DB 스키마 event_type CHECK: page_view, section_view, click, scroll_depth, dwell
 */
'use client';
import { useEffect, useRef, useCallback } from 'react';

interface MagazineAnalyticsConfig {
  editionId: string;
  brokerId: string;
}

export function useMagazineAnalytics({ editionId, brokerId }: MagazineAnalyticsConfig) {
  const startTime = useRef(Date.now());
  const visitorId = useRef('');
  const sentPageView = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Anonymous visitor fingerprint (SHA256 of UA + screen)
    visitorId.current = btoa(`${navigator.userAgent}-${window.screen.width}x${window.screen.height}`)
      .slice(0, 32);
    
    if (!sentPageView.current) {
      sendEvent('page_view');
      sentPageView.current = true;
    }

    // Dwell time: 기록 on beforeunload
    const handleUnload = () => {
      const dwellSeconds = Math.round((Date.now() - startTime.current) / 1000);
      sendEvent('dwell', { dwell_seconds: dwellSeconds });
    };
    window.addEventListener('beforeunload', handleUnload);

    // Scroll depth: 25%, 50%, 75%, 100%
    const scrollThresholds = new Set<number>();
    const handleScroll = () => {
      const pct = Math.round(
        (window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100
      );
      for (const t of [25, 50, 75, 100]) {
        if (pct >= t && !scrollThresholds.has(t)) {
          scrollThresholds.add(t);
          sendEvent('scroll_depth', { scroll_pct: t });
        }
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      window.removeEventListener('scroll', handleScroll);
    };
  }, [editionId, brokerId]);

  const trackSectionView = useCallback((sectionId: string) => {
    sendEvent('section_view', { section_id: sectionId });
  }, [editionId, brokerId]);

  const trackClick = useCallback((targetUrl: string, targetParam?: string) => {
    sendEvent('click', { target_url: targetUrl, target_param: targetParam });
  }, [editionId, brokerId]);

  function sendEvent(eventType: string, extra: Record<string, any> = {}) {
    if (typeof window === 'undefined') return;

    const payload = {
      edition_id: editionId,
      visitor_id: visitorId.current,
      event_type: eventType,
      ...extra,
      metadata: { referrer: document.referrer, broker_id: brokerId },
    };

    const body = JSON.stringify(payload);
    // Use sendBeacon for reliability
    navigator.sendBeacon('/api/public/magazine/analytics', body);
  }

  return { trackSectionView, trackClick };
}
