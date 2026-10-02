/**
 * @file e2e/smoke/basic-im-smoke.auth.spec.ts
 * @description 일상 회귀 방지 스모크 테스트
 *
 * 당산동 income R3 단일 매물로 Phase 1~4 + 9종 단언만 실행.
 * 약 5분 소요 — CI/CD 파이프라인 일상 실행용.
 *
 * 실행: npx playwright test e2e/smoke/ --project=authenticated
 */
import { test } from '@playwright/test';
import { createGoldenTest } from '../helpers/golden-test-factory';

const factory = createGoldenTest({
  name: 'smoke-dangsan-income',
  dataDir: 'docs/golden-test-data/p1-dangsan-income/r3-verified',
  posture: 'income',
  askingPriceManwon: 1150000,
  resolution: 'R3',
  expectedMinSlides: 8,
  expectedMaxSlides: 12,
  expectedFloors: ['B1', '1F', '2F', '3F', '4F', '5F'],
  expectedKeywords: ['당산', '115억'],
  timeout: 300_000, // 5분 — 스모크용 타이트 타임아웃
});

test.describe.serial(factory.suiteName, () => {
  // 스모크: Phase 1~4 공통만 실행 (뷰어/승인/오버플로우 스킵)
  factory.registerCommonPhases();
});
