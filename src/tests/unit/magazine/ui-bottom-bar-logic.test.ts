import { describe, it, expect, vi } from 'vitest';
import {
  computeViewportRatio,
  createSlotRegistry,
  isTextEntryElement,
  shouldHideBar,
  KEYBOARD_RATIO_THRESHOLD,
} from '@/components/ui/bottom-bar-logic';

describe('computeViewportRatio', () => {
  it('visualViewport / innerHeight 비율', () => {
    expect(computeViewportRatio(508, 844)).toBeCloseTo(0.6019, 3);
  });
  it('유효하지 않은 값은 1(키보드 없음)', () => {
    expect(computeViewportRatio(NaN, 800)).toBe(1);
    expect(computeViewportRatio(500, 0)).toBe(1);
    expect(computeViewportRatio(0, 800)).toBe(1);
  });
  it('1을 넘지 않는다(주소창 접힘 등)', () => {
    expect(computeViewportRatio(900, 800)).toBe(1);
  });
});

describe('shouldHideBar — 키보드 감지', () => {
  it('임계값 0.75 미만이면 숨김 (390×508 키보드 케이스)', () => {
    expect(KEYBOARD_RATIO_THRESHOLD).toBe(0.75);
    expect(shouldHideBar({ viewportRatio: 508 / 844 })).toBe(true);
    expect(shouldHideBar({ viewportRatio: 0.74 })).toBe(true);
  });
  it('0.75 이상이고 입력 포커스 없음 → 표시', () => {
    expect(shouldHideBar({ viewportRatio: 0.75 })).toBe(false);
    expect(shouldHideBar({ viewportRatio: 1 })).toBe(false);
  });
  it('입력 포커스 + 0.9 미만(키보드 열리는 중)이면 숨김, 키보드 없으면(≥0.9) 표시', () => {
    expect(shouldHideBar({ viewportRatio: 0.85, inputFocused: true })).toBe(true);
    expect(shouldHideBar({ viewportRatio: 1, inputFocused: true })).toBe(false);
  });
  it('hideOnInputFocus=false 이면 항상 표시', () => {
    expect(shouldHideBar({ viewportRatio: 0.5, inputFocused: true, hideOnInputFocus: false })).toBe(false);
  });
});

describe('isTextEntryElement', () => {
  it('텍스트 입력/textarea/select/contenteditable 은 true', () => {
    expect(isTextEntryElement('INPUT', 'text')).toBe(true);
    expect(isTextEntryElement('input', 'tel')).toBe(true);
    expect(isTextEntryElement('INPUT', undefined)).toBe(true);
    expect(isTextEntryElement('TEXTAREA')).toBe(true);
    expect(isTextEntryElement('SELECT')).toBe(true);
    expect(isTextEntryElement('DIV', null, true)).toBe(true);
  });
  it('체크박스·버튼·range 등은 false', () => {
    expect(isTextEntryElement('INPUT', 'checkbox')).toBe(false);
    expect(isTextEntryElement('INPUT', 'range')).toBe(false);
    expect(isTextEntryElement('BUTTON')).toBe(false);
    expect(isTextEntryElement(null)).toBe(false);
  });
});

describe('createSlotRegistry — 중복 하단 바 방지', () => {
  it('가장 먼저 claim 한 id 가 owner, 해제되면 다음 id 로 승계', () => {
    const r = createSlotRegistry();
    const releaseA = r.claim('a');
    const releaseB = r.claim('b');
    expect(r.owner()).toBe('a');
    expect(r.count()).toBe(2);
    releaseA();
    expect(r.owner()).toBe('b');
    releaseB();
    expect(r.owner()).toBeNull();
    expect(r.count()).toBe(0);
  });
  it('같은 id 중복 claim 은 1회만 등록', () => {
    const r = createSlotRegistry();
    r.claim('a');
    r.claim('a');
    expect(r.count()).toBe(1);
  });
  it('변경 시 구독자에게 알림, unsubscribe 후에는 알림 없음', () => {
    const r = createSlotRegistry();
    const fn = vi.fn();
    const off = r.subscribe(fn);
    const release = r.claim('a');
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    release();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
