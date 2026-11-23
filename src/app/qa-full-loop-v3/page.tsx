"use client";

import React from "react";
import {
  FULL_LOOP_V3_CASES,
  FULL_LOOP_V3_WINDOW_ROLES,
  QA_FULL_LOOP_V3_WORKBENCH_ID,
} from "@/lib/testguide/full-loop-v3-holdout-data";
import { QaFullLoopWorkbenchClient } from "../qa-full-loop/_components/QaFullLoopWorkbenchClient";

const V3_HOLDOUT_CONFIG = {
  workbenchId: QA_FULL_LOOP_V3_WORKBENCH_ID,
  localStorageKey: "credeal-qa-full-loop-v3-holdout",
  sessionPrefix: "fl3v3",
  badgeCode: "V3",
  pageTitle: "실매물 풀루프 클릭스루 검수 가이드 (V3 · 신규 양평동 250억 + 잠원동 242억)",
  pageSubtitle:
    "화면 왼쪽에 이 가이드를 띄워 두고, 오른쪽 작업창에서 파란 버튼과 복사 칩만 순서대로 눌러 확인하세요 (파일명 모두 V3_ 전용).",
  reportTitle: "CRE DealCard 상용화 직전 신규 매물 풀루프 V3 휴먼 클릭스루 검수 결과서 (2선 통합)",
  reportFilePrefix: "CRE_풀루프_V3_Holdout_휴먼검수",
  crossEditionLink: {
    href: "/qa-full-loop-v2",
    label: "↩ 이전 V2 검수 2선 (당산 · 잠원) 보기",
  },
  cases: FULL_LOOP_V3_CASES,
  windowRoles: FULL_LOOP_V3_WINDOW_ROLES,
  defaultSubscribers: {
    loop1: "010-5842-7390",
    loop2: "010-8426-3190",
  },
  secondaryBuyerPlaceholder: "송미경 원장 승인 링크 (/im-lite/...)",
} as const;

export default function QaFullLoopV3HoldoutPage() {
  return <QaFullLoopWorkbenchClient config={V3_HOLDOUT_CONFIG} />;
}
