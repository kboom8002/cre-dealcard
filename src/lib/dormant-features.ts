/**
 * DORMANT FEATURES REGISTRY
 * ─────────────────────────
 * 이 파일은 휴면(dormant) 상태인 기능을 중앙 관리합니다.
 * 향후 기능 복구 시 해당 키를 DORMANT_FEATURES에서 제거하면
 * 모든 UI/라우트 차단이 자동으로 해제됩니다.
 *
 * grep "DORMANT" 으로 프로젝트 내 모든 차단 지점을 검색할 수 있습니다.
 *
 * @see docs/dormant/dormant-features-manifest.md
 */

export const DORMANT_FEATURES = [
  "onboarding",       // B. 온보딩 (Shock & Awe)
  "vibe-card",        // V. Vibe 명함 (my-card)
  "leasing-studio",   // I. 임대/리싱 스튜디오 (lease-card, leasing, tenant-intents)
  "funding-gate-nda", // L. 펀딩/게이트/NDA (funding, nda, marketplace)
  "public-pages",     // M. 공개 페이지 (pulse, insight, explore, market)
] as const;

export type DormantFeatureKey = (typeof DORMANT_FEATURES)[number];

/** 특정 기능이 현재 휴면 상태인지 확인 */
export function isDormant(key: DormantFeatureKey): boolean {
  return DORMANT_FEATURES.includes(key);
}

/** 휴면 기능 접근 시 리다이렉트할 경로 */
export const DORMANT_REDIRECT = {
  broker: "/broker",
  public: "/hub",
} as const;
