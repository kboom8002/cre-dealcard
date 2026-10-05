/**
 * BottomBar 순수 로직 (U-01, U2-03)
 * visualViewport 기반 키보드 감지와 하단 슬롯(중복 하단 바 방지) 레지스트리.
 * DOM 비의존 → node 환경에서 단위테스트한다.
 */

/** visualViewport.height / window.innerHeight 가 이 값 미만이면 키보드가 열린 것으로 본다. */
export const KEYBOARD_RATIO_THRESHOLD = 0.75;
/** 입력 포커스 중 이 값 미만이면(키보드 애니메이션 도중 포함) 바를 숨긴다. */
export const INPUT_FOCUS_RATIO_THRESHOLD = 0.9;

/** visualViewport 높이 비율. 값이 유효하지 않으면 1(키보드 없음)로 간주. */
export function computeViewportRatio(visualViewportHeight: number, innerHeight: number): number {
  if (
    !Number.isFinite(visualViewportHeight) ||
    !Number.isFinite(innerHeight) ||
    innerHeight <= 0 ||
    visualViewportHeight <= 0
  ) {
    return 1;
  }
  return Math.min(1, visualViewportHeight / innerHeight);
}

/**
 * 하단 바를 숨길지 결정.
 * - `<0.75` → 키보드가 열림 → 숨김
 * - 텍스트 입력에 포커스가 있고 `<0.9` → 키보드가 열리는 중 → 숨김
 * - hideOnInputFocus=false 이면 항상 표시
 */
export function shouldHideBar(opts: {
  viewportRatio: number;
  inputFocused?: boolean;
  hideOnInputFocus?: boolean;
}): boolean {
  const { viewportRatio, inputFocused = false, hideOnInputFocus = true } = opts;
  if (!hideOnInputFocus) return false;
  if (viewportRatio < KEYBOARD_RATIO_THRESHOLD) return true;
  return inputFocused && viewportRatio < INPUT_FOCUS_RATIO_THRESHOLD;
}

/**
 * PublicBottomNav(공용 하단 탐색) 표시 여부 (U2-03).
 * - 매거진 BottomBar 가 마운트돼 있으면 하단 바 중복을 막기 위해 숨긴다.
 * - BottomBar 가 없는 페이지에서는 기존 스크롤 기반 표시(scrollVisible) 동작을 그대로 따른다.
 */
export function shouldShowPublicNav(opts: { scrollVisible: boolean; hasBottomBar: boolean }): boolean {
  return opts.scrollVisible && !opts.hasBottomBar;
}

const NON_TEXT_INPUT_TYPES = new Set([
  'button',
  'submit',
  'reset',
  'checkbox',
  'radio',
  'range',
  'file',
  'image',
  'color',
  'hidden',
]);

/** 소프트 키보드를 띄우는 텍스트 입력 요소인지. */
export function isTextEntryElement(
  tagName: string | null | undefined,
  inputType?: string | null,
  isContentEditable = false,
): boolean {
  if (isContentEditable) return true;
  const tag = (tagName ?? '').toUpperCase();
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    return !NON_TEXT_INPUT_TYPES.has((inputType ?? 'text').toLowerCase());
  }
  return false;
}

// ─────────────────────────────────────────────────────────────
// 하단 슬롯 레지스트리 — 같은 화면에 하단 바가 2개 이상 뜨는 것을 방지
// ─────────────────────────────────────────────────────────────

export interface SlotRegistry {
  claim(id: string): () => void;
  /** 가장 먼저 claim 한 id (없으면 null) */
  owner(): string | null;
  count(): number;
  subscribe(listener: () => void): () => void;
}

export function createSlotRegistry(): SlotRegistry {
  let claims: string[] = [];
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  return {
    claim(id) {
      if (!claims.includes(id)) {
        claims = [...claims, id];
        emit();
      }
      return () => {
        if (claims.includes(id)) {
          claims = claims.filter((c) => c !== id);
          emit();
        }
      };
    },
    owner: () => (claims.length ? claims[0] : null),
    count: () => claims.length,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
