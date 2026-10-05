"use client";

/**
 * 매거진 라우트 크롬 효과 (E-03 U-07)
 * `<html>` 에만 줄 수 있는 두 가지를 마운트 동안만 적용하고 언마운트 시 원복한다 (임시 `<style>` 우회 제거).
 *  - scroll-padding-bottom: 앵커/포커스 이동 시 하단 고정 바(ViewerBottomBar)에 가려지지 않도록 여백 확보
 *  - color-scheme: dark — 폼 컨트롤·스크롤바를 어두운 뷰어 배경과 맞춘다
 */
import { useEffect } from "react";

export function MagazineRouteEffects() {
  useEffect(() => {
    const root = document.documentElement;
    const prevPadding = root.style.scrollPaddingBottom;
    const prevScheme = root.style.colorScheme;
    root.style.scrollPaddingBottom = "6rem";
    root.style.colorScheme = "dark";
    return () => {
      root.style.scrollPaddingBottom = prevPadding;
      root.style.colorScheme = prevScheme;
    };
  }, []);
  return null;
}
