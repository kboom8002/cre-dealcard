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
  pageTitle: "실매물 풀루프 클릭스루 검수 가이드 (V2 · 2건 완주)",
  pageSubtitle:
    "화면 왼쪽에 이 가이드를 띄워 두고, 오른쪽 작업창에서 파란 버튼과 복사 칩만 순서대로 누르며 테스트하세요.",
  reportTitle: "CRE DealCard 상보 Hold-out 풀루프 V2 휴먼 클릭스루 검수 결과서 (2선 통합)",
  reportFilePrefix: "CRE_풀루프_V2_Holdout_휴먼검수",
  crossEditionLink: {
    href: "/qa-full-loop-v3",
    label: "🚀 신규 V3 검수 2선 (양평동 250억 · 잠원동 242억) 열기 →",
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
