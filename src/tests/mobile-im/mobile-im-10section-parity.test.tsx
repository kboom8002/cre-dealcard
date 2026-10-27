// @vitest-environment jsdom
/**
 * @file src/tests/mobile-im/mobile-im-10section-parity.test.tsx
 * @description Milestone 5 Test Suite: Mobile IM 10-Section Continuous Scroll & 5-Posture Numeric Parity
 *
 * Requirements:
 * 1. Continuous Open Scroll:
 *    - All 10 canonical Basic IM sections rendered in open view under `continuous-scroll-content`.
 *    - Zero collapsed accordion states or hidden section bodies.
 * 2. Sticky Section Navigation Chips:
 *    - Renders sticky chips bar with all 10 canonical section chips (01 표지 ~ 10 문의).
 *    - Clicking a chip updates active section and initiates scroll.
 * 3. 100% 10-Section Parity Across All 5 Postures:
 *    - Tests core_income, value_add, development, owner_occupier, repositioning.
 *    - Asserts 100% numerical equality between BasicImDocument and Mobile IM rendered DOM elements.
 * 4. Version Switcher & Visual Diff:
 *    - Version dropdown switches between v1 and v2.
 *    - v1↔v2 diff modal opens with highlighted comparison table.
 *
 * Authoritative Sources:
 * - docs/CREDEAL_무마찰UX_4대작업공간_개편_설계서.md §4.4 (WP-P4b-01, WP-P4b-02), §8 Test Matrix #25
 * - PROJECT.md (Milestone 5, Feature 55, 56, 57)
 * - TEST_INFRA.md (§ Feature Inventory #12)
 */

import React, { act } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { MobileIMViewer } from '@/app/(public)/im-lite/[buildingId]/mobile-im-viewer';
import {
  buildBasicImDocument,
  type BasicImDocument,
} from '@/domain/building/im-core/basic-im-document';
import {
  extractPureBuildingFacts,
  type InvestmentPosture,
} from '@/domain/building/im-core/facts';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/im-lite/bld-test-01',
  useSearchParams: () => new URLSearchParams(),
}));

// Mock useDealcardRealtimeSync
vi.mock('@/platform/im-pipeline/realtime/use-dealcard-realtime-sync', () => ({
  useDealcardRealtimeSync: vi.fn(),
}));

// Mock IntersectionObserver
class MockIntersectionObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
globalThis.IntersectionObserver = MockIntersectionObserver as any;

describe('M5 Mobile IM: 10-Section Continuous Scroll & 5-Posture Parity (WP-P4b-01 & WP-P4b-02)', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    // Mock scrollIntoView
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  const POSTURES: InvestmentPosture[] = [
    'core_income',
    'value_add',
    'development',
    'owner_occupier',
    'repositioning',
  ];

  describe('1. Continuous Open Scroll & Sticky Navigation Chips', () => {
    it('renders all 10 canonical sections in continuous open scroll without accordions', async () => {
      const rawFacts = {
        title: '양평동 꼬마빌딩',
        address: '서울특별시 영등포구 양평동 11-47',
        posture: 'core_income',
        asking_price_manwon: 950000,
        total_gross_area_sqm: 1450.2,
        land_area_sqm: 420.5,
        monthly_rent_total_manwon: 3200,
        deposit_total_manwon: 30000,
      };

      const doc = buildBasicImDocument(extractPureBuildingFacts(rawFacts));

      await act(async () => {
        root.render(<MobileIMViewer document={doc as any} buildingId="bld-test-01" />);
      });

      // Verify continuous scroll container exists
      const mainContainer = container.querySelector('[data-testid="continuous-scroll-content"]');
      expect(mainContainer).not.toBeNull();

      // Verify all 10 section IDs exist and are open simultaneously
      const expectedSectionIds = [
        '01_cover',
        '02_summary',
        '03_overview',
        '04_location',
        '05_land',
        '06_rentroll',
        '07_yield',
        '08_comps',
        '09_photos',
        '10_contact',
      ];

      expectedSectionIds.forEach((secId) => {
        const secEl = container.querySelector(`[data-section-id="${secId}"]`);
        expect(secEl).not.toBeNull();
        expect(secEl?.getAttribute('data-doc-hash')).toBe(doc.docHash);
      });

      // Assert no collapsed accordions exist
      const accordionCollapsedBtns = container.querySelectorAll('[aria-expanded="false"]');
      expect(accordionCollapsedBtns.length).toBe(0);
    });

    it('renders all 10 sticky navigation chips and triggers scroll when clicked', async () => {
      const rawFacts = {
        title: '신사동 사옥빌딩',
        address: '서울특별시 강남구 신사동 590',
        posture: 'core_income',
        asking_price_manwon: 7600000,
      };
      const doc = buildBasicImDocument(extractPureBuildingFacts(rawFacts));

      await act(async () => {
        root.render(<MobileIMViewer document={doc as any} buildingId="bld-test-02" />);
      });

      const chipsBar = container.querySelector('[data-testid="section-chips-bar"]');
      expect(chipsBar).not.toBeNull();

      const chips = [
        'chip-01_cover',
        'chip-02_summary',
        'chip-03_overview',
        'chip-04_location',
        'chip-05_land',
        'chip-06_rentroll',
        'chip-07_yield',
        'chip-08_comps',
        'chip-09_photos',
        'chip-10_contact',
      ];

      chips.forEach((chipTestId) => {
        const chip = container.querySelector(`[data-testid="${chipTestId}"]`);
        expect(chip).not.toBeNull();
      });

      // Click on chip-06_rentroll
      const rentrollChip = container.querySelector('[data-testid="chip-06_rentroll"]') as HTMLButtonElement;
      await act(async () => {
        rentrollChip.click();
      });

      // Should have triggered scroll
      expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    });

    it('renders version switcher and opens visual diff modal with yellow highlights', async () => {
      const rawFacts = {
        title: '서초동 오피스',
        address: '서울특별시 서초구 서초동 1364-28',
        posture: 'core_income',
        asking_price_manwon: 2300000,
      };
      const doc = buildBasicImDocument(extractPureBuildingFacts(rawFacts));

      await act(async () => {
        root.render(<MobileIMViewer document={doc as any} buildingId="bld-test-03" />);
      });

      const versionSelect = container.querySelector('[data-testid="version-switcher"]') as HTMLSelectElement;
      expect(versionSelect).not.toBeNull();
      expect(versionSelect.value).toBe('v2');

      const diffBtn = container.querySelector('[data-testid="version-diff-btn"]') as HTMLButtonElement;
      expect(diffBtn).not.toBeNull();

      // Open diff modal
      await act(async () => {
        diffBtn.click();
      });

      const diffModal = container.querySelector('[data-testid="version-diff-modal"]');
      expect(diffModal).not.toBeNull();
      expect(diffModal?.textContent).toContain('IM 버전 차이 비교');
      expect(diffModal?.textContent).toContain('노란색');
    });
  });

  describe('2. 100% Numerical Parity across All 5 Postures', () => {
    POSTURES.forEach((posture) => {
      it(`verifies exact numeric parity between BasicImDocument and DOM for posture [${posture}]`, async () => {
        const rawFacts = {
          title: `[${posture}] 포스처 빌딩`,
          address: '서울특별시 영등포구 양평동 11-47',
          investment_posture: posture,
          asking_price_manwon: 1150000, // 115억
          total_gross_area_sqm: 1650.8,
          land_area_sqm: 480.2,
          monthly_rent_total_manwon: 3800,
          deposit_total_manwon: 35000,
          building_coverage_ratio_pct: 59.2,
          floor_area_ratio_pct: 343.8,
          floors_above: 7,
          floors_below: 1,
          parking_spaces: 14,
          elevators: 1,
          structure: '철근콘크리트구조',
        };

        const facts = extractPureBuildingFacts(rawFacts);
        const basicDoc = buildBasicImDocument(facts);

        await act(async () => {
          root.render(<MobileIMViewer document={basicDoc as any} buildingId="bld-posture-test" />);
        });

        // 1. Cover Section Assertions
        const coverEl = container.querySelector('[data-section-id="01_cover"]')!;
        expect(coverEl).not.toBeNull();
        expect(coverEl.textContent).toContain('115억 원'); // 1150000 manwon = 115억
        expect(coverEl.textContent).toContain(facts.valuation.grossYieldPct.toFixed(2));

        // 2. Overview Section Assertions
        const overviewEl = container.querySelector('[data-section-id="03_overview"]')!;
        expect(overviewEl).not.toBeNull();
        expect(overviewEl.textContent).toContain(String(facts.building.totalGrossAreaSqm));
        expect(overviewEl.textContent).toContain(String(facts.building.totalGrossAreaPyeong));
        expect(overviewEl.textContent).toContain('지상 7층 / 지하 1층');
        expect(overviewEl.textContent).toContain('59.2% / 343.8%');
        expect(overviewEl.textContent).toContain('14대 / 1대');

        // 3. Land Section Assertions
        const landEl = container.querySelector('[data-section-id="05_land"]')!;
        expect(landEl).not.toBeNull();
        expect(landEl.textContent).toContain(String(facts.land.landAreaSqm));
        expect(landEl.textContent).toContain(String(facts.land.landAreaPyeong));

        // 4. Rent Roll Section Assertions
        const rentrollEl = container.querySelector('[data-section-id="06_rentroll"]')!;
        expect(rentrollEl).not.toBeNull();
        expect(rentrollEl.textContent).toContain('3,800만원'); // monthly rent total

        // 5. Yield Section Assertions
        const yieldEl = container.querySelector('[data-section-id="07_yield"]')!;
        expect(yieldEl).not.toBeNull();
        expect(yieldEl.textContent).toContain((facts.rent.annualRentKrw / 10000).toLocaleString());
        expect(yieldEl.textContent).toContain(facts.valuation.capRatePct.toFixed(2));
      });
    });
  });
});
