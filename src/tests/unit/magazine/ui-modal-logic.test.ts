import { describe, it, expect } from 'vitest';
import {
  createLockCounter,
  createModalStack,
  getFocusableTrapTarget,
  getModalKeyAction,
  modalSizeClass,
  setSiblingsInert,
  shouldCloseOnBackdropClick,
  FOCUSABLE_SELECTOR,
  type InertCapable,
} from '@/components/ui/modal-logic';

describe('Modal 포커스 트랩 (getFocusableTrapTarget)', () => {
  it('마지막 요소에서 Tab → 첫 요소로 순환', () => {
    expect(getFocusableTrapTarget({ count: 3, activeIndex: 2, shiftKey: false })).toBe(0);
  });
  it('첫 요소에서 Shift+Tab → 마지막 요소로 순환', () => {
    expect(getFocusableTrapTarget({ count: 3, activeIndex: 0, shiftKey: true })).toBe(2);
  });
  it('중간 요소는 브라우저 기본 이동 허용(null)', () => {
    expect(getFocusableTrapTarget({ count: 3, activeIndex: 1, shiftKey: false })).toBeNull();
    expect(getFocusableTrapTarget({ count: 3, activeIndex: 1, shiftKey: true })).toBeNull();
  });
  it('포커스가 다이얼로그 밖(-1)이면 안으로 끌어들임', () => {
    expect(getFocusableTrapTarget({ count: 3, activeIndex: -1, shiftKey: false })).toBe(0);
    expect(getFocusableTrapTarget({ count: 3, activeIndex: -1, shiftKey: true })).toBe(2);
  });
  it('포커스 가능 요소가 없으면 패널(container)에 유지', () => {
    expect(getFocusableTrapTarget({ count: 0, activeIndex: -1, shiftKey: false })).toBe('container');
  });
  it('요소가 1개면 Tab/Shift+Tab 모두 자기 자신(0)으로', () => {
    expect(getFocusableTrapTarget({ count: 1, activeIndex: 0, shiftKey: false })).toBe(0);
    expect(getFocusableTrapTarget({ count: 1, activeIndex: 0, shiftKey: true })).toBe(0);
  });
});

describe('Modal 키 처리', () => {
  it('Esc → close, Tab → trap, 그 외 null', () => {
    expect(getModalKeyAction('Escape')).toBe('close');
    expect(getModalKeyAction('Tab')).toBe('trap');
    expect(getModalKeyAction('Enter')).toBeNull();
  });
  it('closeOnEscape=false 이면 Esc 무시', () => {
    expect(getModalKeyAction('Escape', { closeOnEscape: false })).toBeNull();
  });
  it('배경 클릭은 옵션이 켜져 있고 backdrop 자체를 눌렀을 때만 닫힘', () => {
    expect(shouldCloseOnBackdropClick({ enabled: true, targetIsBackdrop: true })).toBe(true);
    expect(shouldCloseOnBackdropClick({ enabled: true, targetIsBackdrop: false })).toBe(false);
    expect(shouldCloseOnBackdropClick({ enabled: false, targetIsBackdrop: true })).toBe(false);
  });
  it('포커스 가능 셀렉터에 disabled·tabindex=-1 제외 규칙 포함', () => {
    expect(FOCUSABLE_SELECTOR).toContain('button:not([disabled])');
    expect(FOCUSABLE_SELECTOR).toContain('[tabindex]:not([tabindex="-1"])');
  });
});

describe('scroll lock 카운터 (모달 중첩)', () => {
  it('첫 acquire 에서만 잠금, 마지막 release 에서만 해제', () => {
    const c = createLockCounter();
    expect(c.acquire()).toBe(true);
    expect(c.acquire()).toBe(false);
    expect(c.count()).toBe(2);
    expect(c.release()).toBe(false);
    expect(c.release()).toBe(true);
    expect(c.count()).toBe(0);
  });
  it('과다 release 는 음수가 되지 않는다', () => {
    const c = createLockCounter();
    expect(c.release()).toBe(false);
    expect(c.count()).toBe(0);
    expect(c.acquire()).toBe(true);
  });
});

describe('모달 스택 — 최상단만 Esc/Tab 처리', () => {
  it('push 순서대로 top 판정, remove 후 이전 모달이 top', () => {
    const s = createModalStack();
    s.push('a');
    s.push('b');
    expect(s.isTop('b')).toBe(true);
    expect(s.isTop('a')).toBe(false);
    s.remove('b');
    expect(s.isTop('a')).toBe(true);
    s.remove('a');
    expect(s.size()).toBe(0);
  });
});

class FakeEl implements InertCapable {
  attrs = new Map<string, string>();
  constructor(public name: string, inert = false) {
    if (inert) this.attrs.set('inert', '');
  }
  hasAttribute(n: string) {
    return this.attrs.has(n);
  }
  setAttribute(n: string, v: string) {
    this.attrs.set(n, v);
  }
  removeAttribute(n: string) {
    this.attrs.delete(n);
  }
}

describe('배경 inert (setSiblingsInert)', () => {
  it('모달 루트를 제외한 형제에 inert 적용, 복원 시 제거', () => {
    const app = new FakeEl('app');
    const nav = new FakeEl('nav');
    const modal = new FakeEl('modal');
    const restore = setSiblingsInert([app, nav, modal], modal);
    expect(app.hasAttribute('inert')).toBe(true);
    expect(nav.hasAttribute('inert')).toBe(true);
    expect(modal.hasAttribute('inert')).toBe(false);
    restore();
    expect(app.hasAttribute('inert')).toBe(false);
    expect(nav.hasAttribute('inert')).toBe(false);
  });
  it('원래 inert 였던 요소는 복원 후에도 inert 유지', () => {
    const pre = new FakeEl('pre', true);
    const modal = new FakeEl('modal');
    const restore = setSiblingsInert([pre, modal], modal);
    restore();
    expect(pre.hasAttribute('inert')).toBe(true);
  });
});

describe('size 클래스', () => {
  it('sm/md/lg 매핑', () => {
    expect(modalSizeClass('sm')).toBe('max-w-sm');
    expect(modalSizeClass('md')).toBe('max-w-md');
    expect(modalSizeClass('lg')).toBe('max-w-2xl');
  });
});
