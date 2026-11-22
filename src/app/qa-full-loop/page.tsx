"use client";

import React from "react";
import {
  FULL_LOOP_CASES,
  FULL_LOOP_WINDOW_ROLES,
  QA_FULL_LOOP_WORKBENCH_ID,
} from "@/lib/testguide/full-loop-2cases-data";
import { QaFullLoopWorkbenchClient } from "./_components/QaFullLoopWorkbenchClient";

const V1_CONFIG = {
  workbenchId: QA_FULL_LOOP_WORKBENCH_ID,
  localStorageKey: "credeal-qa-full-loop-2cases-v1",
  sessionPrefix: "fl2",
  badgeCode: "2X",
  pageTitle: "실매물 골든 풀루프 휴먼 클릭스루 워크벤치 (2선 완주)",
  pageSubtitle:
    "딜카드 → IM·발표자료(PPT) → 뉴스레터 → 카톡·시크릿 매수자 열람·문의 → 고객 소통 승인·링크 닫기까지 한 매물로 끝까지 관통합니다.",
  reportTitle: "CRE DealCard 실매물 골든 데이터 풀루프 휴먼 클릭스루 검수 결과서 (2선 통합)",
  reportFilePrefix: "CRE_풀루프_2선_휴먼검수",
  crossEditionLink: {
    href: "/qa-full-loop-v2",
    label: "🧪 상보 Hold-out V2 (당산 XLSX · 잠원 신축) 열기 ↗",
  },
  cases: FULL_LOOP_CASES,
  windowRoles: FULL_LOOP_WINDOW_ROLES,
  defaultSubscribers: {
    loop1: "010-5501-2389",
    loop2: "010-2849-7105",
  },
  secondaryBuyerPlaceholder: "박매수 상무 승인 링크 (/im-lite/...)",
} as const;

export default function QaFullLoopTwoCasesPage() {
  return <QaFullLoopWorkbenchClient config={V1_CONFIG} />;
}
