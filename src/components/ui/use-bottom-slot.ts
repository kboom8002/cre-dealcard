'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { createSlotRegistry } from './bottom-bar-logic';

/**
 * 하단 바 슬롯 컨텍스트 (U-01, U2-03) — 중복 하단 바 방지.
 *
 * 같은 화면에 BottomBar 가 여러 개 마운트되면 가장 먼저 claim 한 하나만 렌더된다.
 * `useHasBottomBar()` 는 PublicBottomNav 같은 다른 고정 바가 매거진 하단 바 존재 여부를 알아
 * 스스로 숨길 때 쓴다 (Provider 불필요 — 모듈 단위 스토어).
 */
const registry = createSlotRegistry();

/** @returns isOwner — 이 id 가 슬롯의 주인이면 true (바를 렌더해야 함) */
export function useBottomSlot(id: string): { isOwner: boolean } {
  useEffect(() => registry.claim(id), [id]);
  const owner = useSyncExternalStore(
    registry.subscribe,
    () => registry.owner() ?? '',
    () => '',
  );
  return { isOwner: owner === id };
}

/** 어떤 BottomBar 든 마운트되어 있으면 true */
export function useHasBottomBar(): boolean {
  return (
    useSyncExternalStore(
      registry.subscribe,
      () => registry.count(),
      () => 0,
    ) > 0
  );
}
