// @vitest-environment jsdom
/**
 * useMagazineAnalytics — 비콘 계약 (E-04 · T3-13 / T3-26 / T3-25 / T1-13)
 * - 백그라운드 전환(visibilitychange hidden) 시 누적 dwell 기록
 * - 미리보기(enabled:false / ?preview=1) 비콘 0
 * - 클릭은 어휘 토큰으로, 구독자 sid 는 형식이 맞을 때만 전달
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMagazineAnalytics } from '@/hooks/use-magazine-analytics';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ED = '99999999-9999-4999-8999-999999999999';
type Api = ReturnType<typeof useMagazineAnalytics>;

let beacons: Array<Record<string, any>>;
let api: Api | null;
let root: Root | null;
let host: HTMLElement | null;

function Probe({ enabled = true }: { enabled?: boolean }) {
  api = useMagazineAnalytics({ editionId: ED, brokerId: 'ignored-broker', enabled });
  return null;
}

async function mount(enabled = true) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(React.createElement(Probe, { enabled }));
  });
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-06T03:00:00Z'));
  beacons = [];
  api = null;
  root = null;
  host = null;
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState({}, '', '/');
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  Object.defineProperty(navigator, 'sendBeacon', {
    configurable: true,
    value: (_url: string, body: string) => {
      beacons.push(JSON.parse(body));
      return true;
    },
  });
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  vi.useRealTimers();
});

describe('page_view · 식별자', () => {
  it('마운트 시 page_view 1회: 랜덤 uuid visitor, pv, edition_id — broker_id 는 보내지 않는다', async () => {
    await mount();
    const pv = beacons.filter((b) => b.event_type === 'page_view');
    expect(pv).toHaveLength(1);
    expect(pv[0].edition_id).toBe(ED);
    expect(pv[0].visitor_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(pv[0].metadata.pv).toMatch(/^[A-Za-z0-9_-]{4,32}$/);
    expect(JSON.stringify(pv[0])).not.toContain('ignored-broker');
    // 재방문 시 같은 visitor (localStorage 영속)
    expect(JSON.parse(window.localStorage.getItem('cre_mag_vid')!).id).toBe(pv[0].visitor_id);
  });

  it('유효 형식의 ?sid= 만 metadata.sid 로 전달, 형식 불가는 버린다', async () => {
    const tok = `${'a'.repeat(40)}.${'b'.repeat(43)}`;
    window.history.replaceState({}, '', `/?sid=${tok}`);
    await mount();
    expect(beacons[0].metadata.sid).toBe(tok);
  });

  it('잘못된 sid 는 전달하지 않는다', async () => {
    window.history.replaceState({}, '', '/?sid=12345');
    await mount();
    expect(beacons[0].metadata.sid).toBeUndefined();
  });
});

describe('백그라운드 전환 dwell (T3-13)', () => {
  it('7초 보고 탭을 숨기면 누적 dwell 7초가 기록된다', async () => {
    await mount();
    await act(async () => {
      vi.advanceTimersByTime(7000);
      setVisibility('hidden');
    });
    const dwell = beacons.filter((b) => b.event_type === 'dwell' && !b.section_id);
    expect(dwell).toHaveLength(1);
    expect(dwell[0].dwell_seconds).toBe(7);
  });

  it('숨겨진 시간은 체류에서 제외, 다시 보고 숨기면 누적값 갱신', async () => {
    await mount();
    await act(async () => {
      vi.advanceTimersByTime(5000);
      setVisibility('hidden');
      vi.advanceTimersByTime(60_000); // 백그라운드 1분 (제외)
      setVisibility('visible');
      vi.advanceTimersByTime(3000);
      setVisibility('hidden');
    });
    const secs = beacons.filter((b) => b.event_type === 'dwell' && !b.section_id).map((b) => b.dwell_seconds);
    expect(secs).toEqual([5, 8]);
  });

  it('섹션 enter 후 hidden → 섹션 dwell 기록 + section_view 1회', async () => {
    await mount();
    await act(async () => {
      api!.trackSection('market', 'enter');
      api!.trackSection('market', 'enter'); // 중복 enter 는 section_view 1회
      vi.advanceTimersByTime(4000);
      setVisibility('hidden');
    });
    expect(beacons.filter((b) => b.event_type === 'section_view' && b.section_id === 'market')).toHaveLength(1);
    const sec = beacons.filter((b) => b.event_type === 'dwell' && b.section_id === 'market');
    expect(sec).toHaveLength(1);
    expect(sec[0].dwell_seconds).toBe(4);
  });

  it('언마운트 시 마지막 체류를 기록', async () => {
    await mount();
    await act(async () => {
      vi.advanceTimersByTime(12_000);
      root!.unmount();
    });
    root = null;
    const dwell = beacons.filter((b) => b.event_type === 'dwell' && !b.section_id);
    expect(dwell.at(-1)?.dwell_seconds).toBe(12);
  });
});

describe('미리보기 비콘 0 (T1-13)', () => {
  it('enabled:false → 비콘 0 (page_view·dwell·click 모두)', async () => {
    await mount(false);
    await act(async () => {
      vi.advanceTimersByTime(5000);
      api!.trackClick('im_request', { url: 'https://x.kr' });
      api!.trackSection('market', 'enter');
      setVisibility('hidden');
    });
    expect(beacons).toHaveLength(0);
  });

  it('?preview=1 → 비콘 0', async () => {
    window.history.replaceState({}, '', '/?preview=1');
    await mount();
    await act(async () => {
      vi.advanceTimersByTime(5000);
      setVisibility('hidden');
    });
    expect(beacons).toHaveLength(0);
  });
});

describe('클릭 (T3-25)', () => {
  it('trackClick(target, meta) → click 이벤트의 target_param 은 어휘 토큰, url 은 target_url', async () => {
    await mount();
    await act(async () => {
      api!.trackClick('im_request', { url: 'https://credeal.net/im-lite/abc', listing_id: 'L1' });
    });
    const click = beacons.find((b) => b.event_type === 'click')!;
    expect(click.target_param).toBe('im_request');
    expect(click.target_url).toBe('https://credeal.net/im-lite/abc');
    expect(click.metadata.meta).toEqual({ listing_id: 'L1' });
  });

  it('레거시 trackClick(url, param) 호출도 전달', async () => {
    await mount();
    await act(async () => {
      api!.trackClick('https://x.kr/a', 'listing_click');
    });
    const click = beacons.find((b) => b.event_type === 'click')!;
    expect(click).toMatchObject({ target_url: 'https://x.kr/a', target_param: 'listing_click' });
  });

  it('tel: 링크는 target_param 이 아니라 target_url 로 전달', async () => {
    await mount();
    await act(async () => {
      api!.trackClick('tel:01012345678');
    });
    const click = beacons.find((b) => b.event_type === 'click')!;
    expect(click.target_param).toBeUndefined();
    expect(click.target_url).toBe('tel:01012345678');
  });

  it('trackInteraction(poll_vote) → poll_vote 클릭', async () => {
    await mount();
    await act(async () => {
      api!.trackInteraction('poll_vote');
    });
    expect(beacons.find((b) => b.event_type === 'click')!.target_param).toBe('poll_vote');
  });
});
