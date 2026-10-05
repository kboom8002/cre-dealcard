/**
 * PublicBottomNav 표시 로직 (U2-03): 매거진 BottomBar 가 있으면 숨기고, 없는 페이지는 기존 동작 불변.
 */
import { describe, expect, it } from 'vitest';
import { createSlotRegistry, shouldShowPublicNav } from '@/components/ui/bottom-bar-logic';

describe('shouldShowPublicNav', () => {
  it('BottomBar 가 없으면 스크롤 표시 상태를 그대로 따른다 (매거진 외 페이지 불변)', () => {
    expect(shouldShowPublicNav({ scrollVisible: true, hasBottomBar: false })).toBe(true);
    expect(shouldShowPublicNav({ scrollVisible: false, hasBottomBar: false })).toBe(false);
  });

  it('BottomBar 가 있으면 스크롤 상태와 무관하게 숨긴다', () => {
    expect(shouldShowPublicNav({ scrollVisible: true, hasBottomBar: true })).toBe(false);
    expect(shouldShowPublicNav({ scrollVisible: false, hasBottomBar: true })).toBe(false);
  });

  it('슬롯 레지스트리와 연동: claim 동안만 숨기고 해제하면 복귀', () => {
    const reg = createSlotRegistry();
    const visibleWith = () => shouldShowPublicNav({ scrollVisible: true, hasBottomBar: reg.count() > 0 });
    expect(visibleWith()).toBe(true);
    const release = reg.claim('magazine-viewer');
    expect(visibleWith()).toBe(false);
    release();
    expect(visibleWith()).toBe(true);
  });
});
