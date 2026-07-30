'use client';

import { useEffect } from 'react';

interface TeaserEventTrackerProps {
  teaserConfigId: string;
  visitorFp?: string;
}

/**
 * Client-side teaser event tracker.
 * Fires 'view' event on mount and provides CTA tracking.
 */
export function TeaserEventTracker({ teaserConfigId, visitorFp }: TeaserEventTrackerProps) {
  useEffect(() => {
    const fp = visitorFp || `anon_${Math.random().toString(36).slice(2, 10)}`;

    // Fire view event
    fetch('/api/public/teaser/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teaserConfigId,
        visitorFp: fp,
        eventType: 'view',
        eventData: { url: window.location.href, referrer: document.referrer },
      }),
    }).catch(() => {});
  }, [teaserConfigId, visitorFp]);

  return null; // Invisible tracker component
}

export async function trackTeaserCta(
  teaserConfigId: string,
  visitorFp: string,
  eventType: 'cta_click' | 'gate_request' | 'slider_interact' | 'share',
  eventData: Record<string, unknown> = {}
) {
  try {
    const res = await fetch('/api/public/teaser/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teaserConfigId, visitorFp, eventType, eventData }),
    });
    return res.json();
  } catch {
    return null;
  }
}
