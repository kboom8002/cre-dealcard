"use client";

/**
 * RoiIsland — 수지분석 계산기 클라이언트 섬 (E-03 U-06)
 * RoiCalculator(입력 상태 + 계산) 에 분석 추적(`calc_simulate`)을 연결한다.
 * 서버 셸은 함수를 직렬화할 수 없으므로 onInteract 는 여기서 `useViewerTrack()` 로 만든다.
 * 직접 import 하지 말고 `LazyIslands` 의 `LazyRoiCalculator`(next/dynamic)로 지연 로드한다.
 */
import React from "react";
import { RoiCalculator } from "@/components/magazine/RoiCalculator";
import { useViewerTrack } from "@/components/magazine/viewer-track";

export default function RoiIsland({ accentColor, defaultPrice }: { accentColor: string; defaultPrice?: number }) {
  const onTrack = useViewerTrack();
  return (
    <RoiCalculator
      accentColor={accentColor}
      defaultPrice={defaultPrice}
      onInteract={(field) => onTrack("calc_simulate", { field })}
    />
  );
}
