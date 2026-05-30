/**
 * Broker Card Generator
 *
 * 브로커 딜카드를 5가지 유형별로 생성합니다:
 *   seller  (매도자용)  — 매도 실적 강조
 *   buyer   (매수자용)  — 블라인드 딜 보유 강조
 *   tenant  (임차인용)  — 임대 가능 공간 강조
 *   network (네트워킹)  — 협업/네트워크 실적 강조
 *   owner   (건물주용)  — 자산관리 역량 강조
 */
import type { BrokerStats } from "./broker-stats-aggregator";

// ── Types ───────────────────────────────────────────────────────────

export type BrokerCardType =
  | "seller"
  | "buyer"
  | "tenant"
  | "network"
  | "owner";

export interface CardStat {
  label: string;
  value: string;
  icon: string;
}

export interface CardCta {
  label: string;
  href: string;
  icon: string;
}

export interface BrokerCardContent {
  type: BrokerCardType;
  title: string;
  subtitle: string;
  stats: CardStat[];
  highlights: string[];
  ctas: CardCta[];
  kakaoText: string;
}

// ── Generator ───────────────────────────────────────────────────────

export function generateBrokerCard(
  stats: BrokerStats,
  type: BrokerCardType,
  brokerName: string,
): BrokerCardContent {
  switch (type) {
    case "seller":
      return buildSellerCard(stats, brokerName);
    case "buyer":
      return buildBuyerCard(stats, brokerName);
    case "tenant":
      return buildTenantCard(stats, brokerName);
    case "network":
      return buildNetworkCard(stats, brokerName);
    case "owner":
      return buildOwnerCard(stats, brokerName);
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function regionLabel(regions: string[]): string {
  return regions.length > 0 ? regions.join(", ") : "전국";
}

// ── Type Builders ───────────────────────────────────────────────────

function buildSellerCard(
  stats: BrokerStats,
  brokerName: string,
): BrokerCardContent {
  return {
    type: "seller",
    title: `${brokerName} — 매도 전문 브로커`,
    subtitle: `${regionLabel(stats.specialtyRegions)} 지역 매도 실적 ${stats.totalDealCards}건`,
    stats: [
      { label: "총 딜카드", value: `${stats.totalDealCards}건`, icon: "📋" },
      { label: "S/A 매칭률", value: pct(stats.sGradeMatchRate), icon: "🎯" },
      { label: "평균 딜 소요일", value: `${stats.avgDealDays}일`, icon: "⏱️" },
      { label: "케이스팩", value: `${stats.totalCasePacks}건`, icon: "📦" },
    ],
    highlights: [
      `${stats.specialtyAssetTypes.join(", ") || "다양한"} 자산유형 전문`,
      `평균 ${stats.avgDealDays}일 내 딜 클로징`,
      `현재 ${stats.activeDealCount}건 활성 딜 진행 중`,
    ],
    ctas: [
      { label: "매물 상담 요청", href: "/contact?type=seller", icon: "💬" },
      { label: "포트폴리오 보기", href: `/broker/${encodeURIComponent(brokerName)}/deals`, icon: "📁" },
    ],
    kakaoText: buildKakaoText("매도", stats, brokerName),
  };
}

function buildBuyerCard(
  stats: BrokerStats,
  brokerName: string,
): BrokerCardContent {
  return {
    type: "buyer",
    title: `${brokerName} — 매수 기회 제공`,
    subtitle: `보유 블라인드 딜 ${stats.activeDealCount}건 | ${regionLabel(stats.specialtyRegions)}`,
    stats: [
      { label: "활성 딜", value: `${stats.activeDealCount}건`, icon: "🔥" },
      { label: "S/A 매칭률", value: pct(stats.sGradeMatchRate), icon: "🎯" },
      { label: "전문 지역", value: regionLabel(stats.specialtyRegions), icon: "📍" },
      { label: "총 실적", value: `${stats.totalDealCards}건`, icon: "📋" },
    ],
    highlights: [
      `${stats.activeDealCount}건의 블라인드 매물 보유`,
      `매수자 맞춤 S/A 등급 매칭 ${pct(stats.sGradeMatchRate)}`,
      `${stats.specialtyAssetTypes.join(", ") || "복합"} 자산 중심`,
    ],
    ctas: [
      { label: "매수 조건 등록", href: "/buyer-intent/new", icon: "✍️" },
      { label: "블라인드 딜 보기", href: `/broker/${encodeURIComponent(brokerName)}/blind`, icon: "🔒" },
    ],
    kakaoText: buildKakaoText("매수", stats, brokerName),
  };
}

function buildTenantCard(
  stats: BrokerStats,
  brokerName: string,
): BrokerCardContent {
  return {
    type: "tenant",
    title: `${brokerName} — 임대 공간 전문`,
    subtitle: `${regionLabel(stats.specialtyRegions)} 임대 매물 ${stats.activeDealCount}건 보유`,
    stats: [
      { label: "임대 매물", value: `${stats.activeDealCount}건`, icon: "🏢" },
      { label: "전문 지역", value: regionLabel(stats.specialtyRegions), icon: "📍" },
      { label: "케이스팩", value: `${stats.totalCasePacks}건`, icon: "📦" },
      { label: "매칭률", value: pct(stats.sGradeMatchRate), icon: "🎯" },
    ],
    highlights: [
      `${regionLabel(stats.specialtyRegions)} 지역 임대 전문`,
      `맞춤 공간 매칭 서비스 제공`,
      `${stats.totalCasePacks}건의 레퍼런스 보유`,
    ],
    ctas: [
      { label: "임차 조건 등록", href: "/tenant-intent/new", icon: "✍️" },
      { label: "공간 둘러보기", href: `/broker/${encodeURIComponent(brokerName)}/spaces`, icon: "🏢" },
    ],
    kakaoText: buildKakaoText("임대", stats, brokerName),
  };
}

function buildNetworkCard(
  stats: BrokerStats,
  brokerName: string,
): BrokerCardContent {
  return {
    type: "network",
    title: `${brokerName} — 네트워크 & 협업`,
    subtitle: `총 ${stats.totalDealCards}건 딜 | ${stats.totalCasePacks}건 케이스팩`,
    stats: [
      { label: "총 딜카드", value: `${stats.totalDealCards}건`, icon: "📋" },
      { label: "케이스팩", value: `${stats.totalCasePacks}건`, icon: "📦" },
      { label: "S/A 매칭률", value: pct(stats.sGradeMatchRate), icon: "🎯" },
      { label: "활성 딜", value: `${stats.activeDealCount}건`, icon: "🔥" },
    ],
    highlights: [
      `${stats.specialtyRegions.length}개 지역 네트워크 보유`,
      `${stats.totalCasePacks}건의 협업 레퍼런스`,
      `다양한 자산유형 커버: ${stats.specialtyAssetTypes.join(", ") || "복합"}`,
    ],
    ctas: [
      { label: "협업 제안하기", href: "/contact?type=network", icon: "🤝" },
      { label: "실적 상세보기", href: `/broker/${encodeURIComponent(brokerName)}`, icon: "📊" },
    ],
    kakaoText: buildKakaoText("네트워크", stats, brokerName),
  };
}

function buildOwnerCard(
  stats: BrokerStats,
  brokerName: string,
): BrokerCardContent {
  return {
    type: "owner",
    title: `${brokerName} — 자산관리 전문`,
    subtitle: `${regionLabel(stats.specialtyRegions)} 건물주 맞춤 서비스`,
    stats: [
      { label: "관리 실적", value: `${stats.totalDealCards}건`, icon: "🏗️" },
      { label: "평균 소요일", value: `${stats.avgDealDays}일`, icon: "⏱️" },
      { label: "매칭 성공률", value: pct(stats.sGradeMatchRate), icon: "🎯" },
      { label: "케이스팩", value: `${stats.totalCasePacks}건`, icon: "📦" },
    ],
    highlights: [
      `${stats.specialtyAssetTypes.join(", ") || "복합"} 자산 관리 경험`,
      `평균 ${stats.avgDealDays}일 내 매칭 완료`,
      `건물주 전용 리포트 & 파이프라인 관리 제공`,
    ],
    ctas: [
      { label: "자산 관리 상담", href: "/contact?type=owner", icon: "💼" },
      { label: "관리 실적 보기", href: `/broker/${encodeURIComponent(brokerName)}/management`, icon: "📊" },
    ],
    kakaoText: buildKakaoText("자산관리", stats, brokerName),
  };
}

// ── Kakao Share Text ────────────────────────────────────────────────

function buildKakaoText(
  category: string,
  stats: BrokerStats,
  brokerName: string,
): string {
  return [
    `[${brokerName} ${category} 브로커 카드]`,
    `✅ 총 딜카드: ${stats.totalDealCards}건`,
    `🎯 S/A 매칭률: ${pct(stats.sGradeMatchRate)}`,
    `⏱️ 평균 딜 소요: ${stats.avgDealDays}일`,
    `📍 전문 지역: ${regionLabel(stats.specialtyRegions)}`,
    ``,
    `👉 자세히 보기: /broker/${brokerName}`,
  ].join("\n");
}
