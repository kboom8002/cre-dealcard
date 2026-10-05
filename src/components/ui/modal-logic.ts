/**
 * Modal 순수 로직 (U-01, U2-02)
 *
 * jsdom 없이 단위테스트할 수 있도록 포커스 트랩·키 처리·scroll lock 카운터·inert 처리를
 * DOM 비의존(덕 타이핑) 함수로 분리했다. modal.tsx 는 이 함수들을 얇게 감싼다.
 */

export const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',');

/** Tab 이동 시 포커스를 강제로 옮겨야 하는 대상. null 이면 브라우저 기본 동작을 허용. */
export type TrapTarget = number | 'container' | null;

/**
 * 포커스 트랩 계산.
 * @param count        다이얼로그 안의 포커스 가능 요소 수
 * @param activeIndex  현재 포커스 요소의 인덱스 (다이얼로그 밖이면 -1)
 * @param shiftKey     Shift+Tab 여부
 * @returns 포커스할 인덱스 / 'container'(포커스 가능 요소 없음 → 패널 유지) / null(기본 동작)
 */
export function getFocusableTrapTarget(opts: {
  count: number;
  activeIndex: number;
  shiftKey: boolean;
}): TrapTarget {
  const { count, activeIndex, shiftKey } = opts;
  if (count <= 0) return 'container';
  // 포커스가 다이얼로그 밖에 있으면 안으로 끌어들인다.
  if (activeIndex < 0) return shiftKey ? count - 1 : 0;
  if (!shiftKey && activeIndex === count - 1) return 0;
  if (shiftKey && activeIndex === 0) return count - 1;
  return null;
}

export type ModalKeyAction = 'close' | 'trap' | null;

export function getModalKeyAction(
  key: string,
  opts: { closeOnEscape?: boolean } = {},
): ModalKeyAction {
  const { closeOnEscape = true } = opts;
  if (key === 'Escape' || key === 'Esc') return closeOnEscape ? 'close' : null;
  if (key === 'Tab') return 'trap';
  return null;
}

/** 배경(backdrop) 클릭으로 닫을지 — 패널 내부 클릭은 닫지 않는다. */
export function shouldCloseOnBackdropClick(opts: {
  enabled: boolean;
  targetIsBackdrop: boolean;
}): boolean {
  return opts.enabled && opts.targetIsBackdrop;
}

// ─────────────────────────────────────────────────────────────
// scroll lock 참조 카운터 (모달 중첩 대응)
// ─────────────────────────────────────────────────────────────

export interface LockCounter {
  /** 잠금 획득. 0→1 로 바뀌는 순간 true (실제 잠금 적용 필요). */
  acquire(): boolean;
  /** 잠금 해제. 1→0 으로 바뀌는 순간 true (실제 잠금 복원 필요). */
  release(): boolean;
  count(): number;
}

export function createLockCounter(): LockCounter {
  let n = 0;
  return {
    acquire() {
      n += 1;
      return n === 1;
    },
    release() {
      if (n === 0) return false;
      n -= 1;
      return n === 0;
    },
    count: () => n,
  };
}

// ─────────────────────────────────────────────────────────────
// 배경 inert 처리 (덕 타이핑 — DOM Element 의 최소 부분집합)
// ─────────────────────────────────────────────────────────────

export interface InertCapable {
  hasAttribute(name: string): boolean;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
}

/**
 * `except` 를 제외한 형제 요소에 inert 를 적용하고, 되돌리는 함수를 반환한다.
 * 이미 inert 였던 요소는 건드리지 않아 복원 시에도 그대로 유지된다.
 */
export function setSiblingsInert<T extends InertCapable>(
  siblings: ArrayLike<T>,
  except: T,
): () => void {
  const changed: T[] = [];
  for (let i = 0; i < siblings.length; i++) {
    const el = siblings[i];
    if (el === except) continue;
    if (el.hasAttribute('inert')) continue;
    el.setAttribute('inert', '');
    changed.push(el);
  }
  return () => {
    for (const el of changed) el.removeAttribute('inert');
  };
}

/** 모달 패널 폭 클래스 (size) */
export function modalSizeClass(size: 'sm' | 'md' | 'lg'): string {
  switch (size) {
    case 'sm':
      return 'max-w-sm';
    case 'lg':
      return 'max-w-2xl';
    case 'md':
    default:
      return 'max-w-md';
  }
}

/** 모달 스택 — 가장 위의 모달만 Esc/Tab 을 처리한다. */
export function createModalStack() {
  const ids: string[] = [];
  return {
    push(id: string) {
      if (!ids.includes(id)) ids.push(id);
    },
    remove(id: string) {
      const i = ids.indexOf(id);
      if (i >= 0) ids.splice(i, 1);
    },
    isTop(id: string) {
      return ids.length > 0 && ids[ids.length - 1] === id;
    },
    size: () => ids.length,
  };
}
