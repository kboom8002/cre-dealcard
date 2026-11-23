"use client";

import React from "react";
import {
  BROKER_FULL_LOOP_CASES,
  BROKER_FULL_LOOP_WINDOW_ROLES,
  QA_BROKER_FULL_LOOP_WORKBENCH_ID,
} from "@/lib/testguide/broker-full-loop-data";
import { QaFullLoopWorkbenchClient } from "../../qa-full-loop/_components/QaFullLoopWorkbenchClient";

const BROKER_FULL_LOOP_CONFIG = {
  workbenchId: QA_BROKER_FULL_LOOP_WORKBENCH_ID,
  localStorageKey: "credeal-qa-broker-full-loop-v1",
  sessionPrefix: "brfl1",
  badgeCode: "BR",
  pageTitle: "현업 중개인 전용 전 과정 클릭스루 워크벤치 (10장 샘플 + 내 매물 실전)",
  pageSubtitle:
    "Stage 1에서 서초동 사옥 매물(실사진 10장)로 손에 익힌 뒤, Stage 2에서 대표님의 실제 매물 1건으로 현업 용어·사진 선별·발송 품격을 직접 평가해 주세요.",
  reportTitle:
    "크리딜 (CREDEAL) 현업 중개인 전 과정 클릭스루 검수 결과서 (10장 표준 매물 + 내 매물 실전)",
  reportFilePrefix: "CRE_중개인_실전풀루프_검수",
  crossEditionLink: {
    href: "/qa-broker/signoff",
    label: "↩ 중개인 감수 요약 보드로 이동",
  },
  cases: BROKER_FULL_LOOP_CASES,
  windowRoles: BROKER_FULL_LOOP_WINDOW_ROLES,
  defaultSubscribers: {
    loop1: "010-5581-2390",
    loop2: "",
  },
  secondaryBuyerPlaceholder: "비교용 두 번째 열람 링크 (/im-lite/... 선택)",
} as const;

export default function QaBrokerFullLoopPage() {
  return <QaFullLoopWorkbenchClient config={BROKER_FULL_LOOP_CONFIG} />;
}
