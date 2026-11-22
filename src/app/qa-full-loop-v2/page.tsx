"use client";

import React from "react";
import {
  FULL_LOOP_V2_CASES,
  FULL_LOOP_V2_WINDOW_ROLES,
  QA_FULL_LOOP_V2_WORKBENCH_ID,
} from "@/lib/testguide/full-loop-v2-holdout-data";
import { QaFullLoopWorkbenchClient } from "../qa-full-loop/_components/QaFullLoopWorkbenchClient";

const V2_HOLDOUT_CONFIG = {
  workbenchId: QA_FULL_LOOP_V2_WORKBENCH_ID,
  localStorageKey: "credeal-qa-full-loop-v2-holdout",
  sessionPrefix: "fl2v2",
  badgeCode: "V2",
  pageTitle: "실매물 상보 Hold-out 풀루프 휴먼 클릭스루 워크벤치 (V2 · 2선)",
  pageSubtitle:
    "XLSX v1.5 업로드(당산 115억 · 기계실/자가/전세) + 신축·개발형 2필지(잠원 242억 · 역전 스왑 가드 · 직교 회수)로 AI 미검증 경로까지 끝까지 관통합니다.",
  reportTitle: "CRE DealCard 상보 Hold-out 풀루프 V2 휴먼 클릭스루 검수 결과서 (2선 통합)",
  reportFilePrefix: "CRE_풀루프_V2_Holdout_휴먼검수",
  crossEditionLink: {
    href: "/qa-full-loop",
    label: "↩ 기존 V1 회귀 2선 (부천 · 역삼) 보기",
  },
  cases: FULL_LOOP_V2_CASES,
  windowRoles: FULL_LOOP_V2_WINDOW_ROLES,
  defaultSubscribers: {
    loop1: "010-6193-4470",
    loop2: "010-7782-1940",
  },
  secondaryBuyerPlaceholder: "한유진 소장 승인 링크 (/im-lite/...)",
} as const;

export default function QaFullLoopV2HoldoutPage() {
  return <QaFullLoopWorkbenchClient config={V2_HOLDOUT_CONFIG} />;
}
