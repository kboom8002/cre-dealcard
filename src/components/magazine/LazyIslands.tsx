"use client";

/**
 * LazyIslands — 하단 무거운 섹션의 지연 로드 래퍼 (E-03 U-06)
 *
 * Next 문서(lazy-loading): Server Component 에서 호출한 `next/dynamic` 은 클라이언트 컴포넌트를 코드 분할하지 않고
 * `ssr:false` 도 허용되지 않는다 → `dynamic()` 은 반드시 이 **클라이언트 파일** 안에서 호출한다.
 * SSR 은 유지(기본값)하므로 초기 HTML 에는 그대로 렌더되고, 해당 청크의 JS 만 별도로 늦게 받는다.
 *  - LazyRoiCalculator: 수지분석 계산기(입력 상태·계산 로직·용어 설명)
 *  - LazyForwardSection: 전달하기(클립보드/Web Share/toast)
 */
import React from "react";
import dynamic from "next/dynamic";

function IslandSkeleton({ className }: { className: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-2xl bg-white/[0.04] motion-reduce:animate-none ${className}`} />;
}

export const LazyRoiCalculator = dynamic(() => import("@/components/magazine/RoiIsland"), {
  loading: () => <IslandSkeleton className="h-64" />,
});

export const LazyForwardSection = dynamic(
  () => import("@/components/magazine/ForwardSection").then((m) => m.ForwardSection),
  { loading: () => <IslandSkeleton className="h-36" /> },
);
