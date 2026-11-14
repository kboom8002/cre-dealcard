'use client';

import { useEffect, useRef } from 'react';

interface TeaserEventTrackerProps {
  teaserConfigId: string;
  visitorFp?: string;
  shareToken?: string;
}

function resolveClientShareToken(explicit?: string): string | undefined {
  if (explicit && explicit.trim()) return explicit.trim();
  if (typeof window === 'undefined') return undefined;
  const fromQuery = new URLSearchParams(window.location.search).get('token');
  return fromQuery && fromQuery.trim() ? fromQuery.trim() : undefined;
}

/**
 * Client-side teaser event tracker.
 * Fires 'view' event on mount and 'dwell' event on visibilitychange/pagehide.
 */
export function TeaserEventTracker({
  teaserConfigId,
  visitorFp,
  shareToken,
}: TeaserEventTrackerProps) {
  const mountedAtRef = useRef<number>(Date.now());
  const dwellSentRef = useRef<boolean>(false);

  useEffect(() => {
    const fp = visitorFp || `anon_${Math.random().toString(36).slice(2, 10)}`;
    const token = resolveClientShareToken(shareToken);
    mountedAtRef.current = Date.now();
    dwellSentRef.current = false;

    // Fire view event
    fetch('/api/public/teaser/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teaserConfigId,
        buildingId: teaserConfigId,
        visitorFp: fp,
        shareToken: token,
        eventType: 'view',
        eventData: { url: window.location.href, referrer: document.referrer },
      }),
    }).catch(() => {});

    const sendDwell = () => {
      if (dwellSentRef.current) return;
      dwellSentRef.current = true;
      const dwellSeconds = Math.max(1, Math.round((Date.now() - mountedAtRef.current) / 1000));
      fetch('/api/public/teaser/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        body: JSON.stringify({
          teaserConfigId,
          buildingId: teaserConfigId,
          visitorFp: fp,
          shareToken: token,
          eventType: 'dwell',
          eventData: {
            dwell_seconds: dwellSeconds,
            url: window.location.href,
            referrer: document.referrer,
          },
        }),
      }).catch(() => {});
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        sendDwell();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', sendDwell);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', sendDwell);
    };
  }, [teaserConfigId, visitorFp, shareToken]);

  return null; // Invisible tracker component
}

export async function trackTeaserCta(
  teaserConfigId: string,
  visitorFp: string,
  eventType: 'cta_click' | 'gate_request' | 'slider_interact' | 'share',
  eventData: Record<string, unknown> = {}
) {
  try {
    const token = resolveClientShareToken();
    const res = await fetch('/api/public/teaser/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teaserConfigId,
        buildingId: teaserConfigId,
        visitorFp,
        shareToken: token,
        eventType,
        eventData,
      }),
    });
    return await res.json();
  } catch {
    return null;
  }
}
