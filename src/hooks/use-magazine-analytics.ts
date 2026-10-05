/**
 * 매거진 뷰어에서 조회/체류/스크롤/클릭 이벤트를 magazine_analytics_events 에 기록 (E-04).
 * DB 스키마 event_type CHECK: page_view, section_view, click, scroll_depth, dwell
 *
 * - 방문자 식별: 1st-party 랜덤 UUID(localStorage, 13개월). 기기 지문 아님. 서버는 HMAC 해시만 저장 (lib/magazine/visitor-id.ts, visitor-hash.ts).
 * - 체류(T3-13): `visibilitychange`(hidden) + `pagehide` 에서 sendBeacon 으로 **누적 초**를 기록한다
 *   (모바일은 beforeunload 가 거의 발화하지 않는다). 탭이 숨겨진 시간은 체류에서 제외.
 * - 섹션 체류(T3-26): `trackSection(id,'enter'|'leave')` — 첫 enter 에 section_view, 누적 체류는 flush 시 dwell(section_id) 로 기록.
 * - 클릭(T3-25): `trackClick(target, meta?)` — target 은 어휘 토큰(CLICK_TARGETS: im_request/phone_click/listing_click/…).
 * - 미리보기(T1-13): `enabled:false`, `?preview=1`, iframe 안에서는 어떤 비콘도 보내지 않는다.
 * - 구독자 귀속: URL `?sid=<서명 토큰>` 이 있으면 metadata.sid 로 전송(서버가 서명 검증, 위조는 익명 처리). broker 는 서버가 에디션으로 결정하므로 보내지 않는다.
 */
'use client';
import { useEffect, useRef, useCallback } from 'react';
import {
  buildClickPayload,
  defaultIdGenerator,
  isPreviewContext,
  readSubscriberSid,
  resolveVisitorId,
  type ClickPayload,
} from '@/lib/magazine/visitor-id';

interface MagazineAnalyticsConfig {
  editionId: string;
  /** 하위 호환용(서버가 에디션에서 broker 를 결정하므로 전송하지 않는다) */
  brokerId: string;
  /** false 면 비콘을 전혀 보내지 않는다 (에디터 미리보기 오염 차단, T1-13). 기본 true */
  enabled?: boolean;
}

const ENDPOINT = '/api/public/magazine/analytics';
const SID_SESSION_KEY = 'cre_mag_sid';
const SECTION_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

interface SectionTimer {
  open: boolean;
  startedAt: number | null;
  totalMs: number;
}

interface HookState {
  active: boolean;
  visitorId: string | null;
  sid: string | null;
  pv: string;
  /** 페이지가 보이는 상태의 시작 시각 (hidden 이면 null) */
  visibleSince: number | null;
  accumulatedMs: number;
  sections: Map<string, SectionTimer>;
  viewedSections: Set<string>;
  lastSent: Map<string, number>;
}

function newState(): HookState {
  return {
    active: false,
    visitorId: null,
    sid: null,
    pv: '',
    visibleSince: null,
    accumulatedMs: 0,
    sections: new Map(),
    viewedSections: new Set(),
    lastSent: new Map(),
  };
}

function safeStorage(kind: 'local' | 'session'): Storage | null {
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null; // 사생활 보호 모드 등
  }
}

export function useMagazineAnalytics({ editionId, enabled = true }: MagazineAnalyticsConfig) {
  const stateRef = useRef<HookState>(newState());
  const editionRef = useRef(editionId);
  // 반드시 아래 수집 effect 보다 먼저 선언 — 같은 커밋에서 최신 editionId 를 보장
  useEffect(() => {
    editionRef.current = editionId;
  }, [editionId]);

  const send = useCallback((eventType: string, extra: Record<string, unknown> = {}, metaExtra: Record<string, unknown> = {}) => {
    const st = stateRef.current;
    if (!st.active || !st.visitorId || typeof window === 'undefined') return;
    const payload = {
      edition_id: editionRef.current,
      visitor_id: st.visitorId,
      event_type: eventType,
      ...extra,
      metadata: {
        referrer: document.referrer || undefined,
        pv: st.pv,
        ...(st.sid ? { sid: st.sid } : {}),
        ...metaExtra,
      },
    };
    const body = JSON.stringify(payload);
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(ENDPOINT, body)) return;
    } catch {
      // 아래 fetch 폴백
    }
    try {
      void fetch(ENDPOINT, { method: 'POST', body, keepalive: true, headers: { 'content-type': 'text/plain;charset=UTF-8' } }).catch(() => {});
    } catch {
      // 수집 실패는 사용자 경험에 영향을 주지 않는다
    }
  }, []);

  /** 누적 체류(페이지·섹션)를 서버에 기록. 같은 값은 다시 보내지 않는다. */
  const flush = useCallback(() => {
    const st = stateRef.current;
    if (!st.active) return;
    const now = Date.now();
    const pageMs = st.accumulatedMs + (st.visibleSince != null ? now - st.visibleSince : 0);
    const pageSec = Math.round(pageMs / 1000);
    if (pageSec >= 1 && st.lastSent.get('page') !== pageSec) {
      st.lastSent.set('page', pageSec);
      send('dwell', { dwell_seconds: pageSec });
    }
    for (const [id, t] of st.sections) {
      const ms = t.totalMs + (t.startedAt != null ? now - t.startedAt : 0);
      const sec = Math.round(ms / 1000);
      const key = `sec:${id}`;
      if (sec >= 1 && st.lastSent.get(key) !== sec) {
        st.lastSent.set(key, sec);
        send('dwell', { section_id: id, dwell_seconds: sec });
      }
    }
  }, [send]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const st = (stateRef.current = newState());
    if (!enabled) return;
    if (isPreviewContext(window.location.search, window.self !== window.top)) return;

    const visitorId = resolveVisitorId(safeStorage('local'));
    if (!visitorId) return; // 난수 생성기 없음 — 지문 폴백 대신 수집하지 않는다
    st.visitorId = visitorId;
    st.pv = (defaultIdGenerator() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`).replace(/-/g, '').slice(0, 16);

    const ss = safeStorage('session');
    const urlSid = readSubscriberSid(window.location.search);
    if (urlSid) {
      st.sid = urlSid;
      try { ss?.setItem(SID_SESSION_KEY, urlSid); } catch { /* 무시 */ }
    } else {
      try {
        const saved = ss?.getItem(SID_SESSION_KEY) ?? null;
        st.sid = saved ? readSubscriberSid(`?sid=${encodeURIComponent(saved)}`) : null;
      } catch {
        st.sid = null;
      }
    }

    st.active = true;
    st.visibleSince = document.visibilityState === 'visible' ? Date.now() : null;
    send('page_view');

    const pause = () => {
      const now = Date.now();
      if (st.visibleSince != null) {
        st.accumulatedMs += now - st.visibleSince;
        st.visibleSince = null;
      }
      for (const t of st.sections.values()) {
        if (t.startedAt != null) {
          t.totalMs += now - t.startedAt;
          t.startedAt = null;
        }
      }
    };
    const resume = () => {
      const now = Date.now();
      if (st.visibleSince == null) st.visibleSince = now;
      for (const t of st.sections.values()) {
        if (t.open && t.startedAt == null) t.startedAt = now;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        pause();
        flush();
      } else {
        resume();
      }
    };
    const onPageHide = () => {
      pause();
      flush();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);

    // Scroll depth: 25%, 50%, 75%, 100%
    const scrollThresholds = new Set<number>();
    const handleScroll = () => {
      const denom = document.documentElement.scrollHeight - window.innerHeight;
      const pct = denom > 0 ? Math.round((window.scrollY / denom) * 100) : 100;
      for (const t of [25, 50, 75, 100]) {
        if (pct >= t && !scrollThresholds.has(t)) {
          scrollThresholds.add(t);
          send('scroll_depth', { scroll_pct: t });
        }
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      // SPA 이동·언마운트: 마지막 체류를 기록하고 종료
      pause();
      flush();
      st.active = false;
    };
  }, [editionId, enabled, send, flush]);

  /** section_view 1회 (체류 없음). 같은 섹션은 페이지 로드당 한 번만. */
  const trackSectionView = useCallback((sectionId: string) => {
    const st = stateRef.current;
    if (!st.active || !SECTION_ID_RE.test(sectionId) || st.viewedSections.has(sectionId)) return;
    st.viewedSections.add(sectionId);
    send('section_view', { section_id: sectionId });
  }, [send]);

  /** 섹션 진입/이탈 — 진입 시 section_view(1회) + 체류 타이머, 이탈 시 타이머 정지. 누적 체류는 flush 때 기록된다. */
  const trackSection = useCallback((sectionId: string, state: 'enter' | 'leave' = 'enter') => {
    const st = stateRef.current;
    if (!st.active || !SECTION_ID_RE.test(sectionId)) return;
    const now = Date.now();
    let t = st.sections.get(sectionId);
    if (!t) {
      t = { open: false, startedAt: null, totalMs: 0 };
      st.sections.set(sectionId, t);
    }
    if (state === 'enter') {
      if (!st.viewedSections.has(sectionId)) {
        st.viewedSections.add(sectionId);
        send('section_view', { section_id: sectionId });
      }
      t.open = true;
      if (t.startedAt == null && st.visibleSince != null) t.startedAt = now;
    } else {
      t.open = false;
      if (t.startedAt != null) {
        t.totalMs += now - t.startedAt;
        t.startedAt = null;
      }
    }
  }, [send]);

  /**
   * 클릭 기록. 신규: `trackClick('im_request', { url, listing_id })`. 레거시 `(targetUrl, targetParam)` 도 허용.
   * target 은 소문자 토큰(CLICK_TARGETS) — 형식 불가면 전송하지 않는다.
   */
  const trackClick = useCallback((target: string, meta?: Record<string, unknown> | string) => {
    const payload: ClickPayload | null = buildClickPayload(target, meta);
    if (!payload) return;
    const { meta: extraMeta, ...cols } = payload;
    send('click', cols, extraMeta ? { meta: extraMeta } : {});
  }, [send]);

  /** Track high-engagement interactions (poll vote, calculator use, referral copy) */
  const trackInteraction = useCallback((action: 'poll_vote' | 'calc_simulate' | 'referral_copy', detail?: Record<string, unknown>) => {
    trackClick(action, detail);
  }, [trackClick]);

  return { trackSectionView, trackSection, trackClick, trackInteraction };
}
