/**
 * track-collector.ts — 클라이언트 사이드 이벤트 수집기
 * Spec: DISTRIBUTION_AND_IDENTITY.md §4
 * 
 * IntersectionObserver 기반 섹션 체류, 슬라이더 디바운스, 스크롤 완독 감지.
 * fire-and-forget: 실패해도 열람을 막지 않습니다.
 */

import type { TrackEvent } from './types';

interface CollectorConfig {
  endpoint: string;      // '/api/public/track'
  tenantId: string;
  dealId: string;
  viewerId?: string;
  shareToken?: string;
  grantToken?: string;
}

/**
 * 이벤트를 서버로 전송합니다.
 * 열람 경험을 절대 막지 않습니다 — 실패 시 조용히 삼킵니다.
 */
async function sendEvent(config: CollectorConfig, event: TrackEvent): Promise<void> {
  try {
    await fetch(config.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantId: config.tenantId,
        dealId: config.dealId,
        viewerId: config.viewerId,
        shareToken: config.shareToken,
        grantToken: config.grantToken,
        ...event,
      }),
      keepalive: true,  // 페이지 이탈 시에도 전송 보장
    });
  } catch {
    // 추적이 콘텐츠보다 우선할 수 없다
  }
}

/**
 * 섹션 체류 감지기를 설정합니다.
 * IntersectionObserver 진입 후 3초 이상 체류 시에만 이벤트 전송.
 */
export function observeSections(
  config: CollectorConfig,
  sectionElements: HTMLElement[],
): () => void {
  const DWELL_THRESHOLD_MS = 3000;
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const sent = new Set<string>();

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const sectionId = entry.target.getAttribute('data-section-id');
        if (!sectionId) continue;

        if (entry.isIntersecting && !sent.has(sectionId)) {
          // 진입: 3초 타이머 시작
          const timer = setTimeout(() => {
            sent.add(sectionId);
            sendEvent(config, {
              kind: 'view.section',
              sectionId,
              dwellMs: DWELL_THRESHOLD_MS,
            });
          }, DWELL_THRESHOLD_MS);
          timers.set(sectionId, timer);
        } else if (!entry.isIntersecting) {
          // 이탈: 타이머 취소
          const timer = timers.get(sectionId);
          if (timer) {
            clearTimeout(timer);
            timers.delete(sectionId);
          }
        }
      }
    },
    { threshold: 0.5 },
  );

  for (const el of sectionElements) {
    observer.observe(el);
  }

  // Cleanup 함수 반환
  return () => {
    observer.disconnect();
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
  };
}

/**
 * 슬라이더 조작 이벤트 디바운스 전송기.
 * 500ms 디바운스 — 드래그 중 수십 건 전송 방지.
 */
export function createSliderTracker(
  config: CollectorConfig,
): (param: 'budget' | 'ltv', value: number) => void {
  const DEBOUNCE_MS = 500;
  let timer: ReturnType<typeof setTimeout> | null = null;

  return (param, value) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      sendEvent(config, { kind: 'view.slider', param, value });
      timer = null;
    }, DEBOUNCE_MS);
  };
}

/**
 * 스크롤 완독 감지기.
 * 80% 도달 시 1회만 전송.
 */
export function observeCompletion(
  config: CollectorConfig,
  scrollContainer?: HTMLElement,
): () => void {
  let sent = false;

  const handler = () => {
    if (sent) return;
    const target = scrollContainer || document.documentElement;
    const scrollPct = (target.scrollTop + target.clientHeight) / target.scrollHeight;
    if (scrollPct >= 0.8) {
      sent = true;
      sendEvent(config, { kind: 'view.completed', scrollPct: Math.round(scrollPct * 100) });
    }
  };

  const el = scrollContainer || window;
  el.addEventListener('scroll', handler, { passive: true });
  return () => el.removeEventListener('scroll', handler);
}

/**
 * 열람 시작 이벤트를 즉시 전송합니다.
 */
export function trackOpened(
  config: CollectorConfig,
  tier: 'teaser' | 'basic' | 'pro',
  referrer?: string,
): void {
  sendEvent(config, { kind: 'view.opened', dealId: config.dealId, tier, referrer });
}

/**
 * 의향 이벤트를 전송합니다.
 */
export function trackIntent(
  config: CollectorConfig,
  intent: 'intent.question' | 'intent.watch' | 'intent.detail_request',
): void {
  sendEvent(config, { kind: intent });
}
