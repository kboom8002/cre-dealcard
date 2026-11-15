// @vitest-environment jsdom
/**
 * @file src/tests/unit/wave2-wp06-mobile-im-ssot-ocr.test.tsx
 * @description Wave 2 — WP-06 Verification Suite:
 *  (a) Real Vision Rent-Roll OCR (`vision-ocr.ts` & `/api/broker/rent-roll/vision-ocr`) — zero fabricated rows
 *  (b) `im-core/facts` & `basic-im-document.ts` — zero fake statutory/physical fallbacks & SSoT parity
 *  (c) `mobile-im-viewer.tsx` — 15-row rent-roll toggle + print parity, zero `'2027-12'`, provenance badge gate, real `previousVersion` gate, SSoT financial/occupancy parity
 */

import React, { act } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { NextRequest } from 'next/server';

import {
  extractLandFacts,
  extractBuildingSpecs,
  extractTransactionFacts,
  extractValuationFacts,
  extractPureBuildingFacts,
} from '@/domain/building/im-core/facts';
import { buildBasicImDocument } from '@/domain/building/im-core/basic-im-document';
import { MobileIMViewer } from '@/app/(public)/im-lite/[buildingId]/mobile-im-viewer';
import {
  parseRentRollPhotoOcr,
  mapVisionOcrRowsToRentRollItems,
} from '@/lib/rent-roll/vision-ocr';
import { POST as postVisionOcr } from '@/app/api/broker/rent-roll/vision-ocr/route';
import { clearRateLimitBuckets } from '@/lib/rate-limiter';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/im-lite/bld-wp06-test',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/platform/im-pipeline/realtime/use-dealcard-realtime-sync', () => ({
  useDealcardRealtimeSync: vi.fn(),
}));

class MockIntersectionObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
globalThis.IntersectionObserver = MockIntersectionObserver as any;

const SAMPLE_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('Wave 2 — WP-06: Mobile IM ↔ PPTX IM SSoT Unification, Placeholder Elimination & Real Vision OCR', () => {
  const originalOpenAiKey = process.env.OPENAI_API_KEY;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    clearRateLimitBuckets();
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    process.env.OPENAI_API_KEY = originalOpenAiKey;
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('(a) Vision Rent-Roll OCR: Zero Fabrication & Structured Extraction', () => {
    it('NEVER returns fabricated 3500/230/2027.12 rows when API returns 503 or network error', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: false,
            error:
              '렌트롤 사진 AI 인식이 현재 비활성화되어 있습니다. 엑셀 업로드 또는 표 붙여넣기를 이용해주세요.',
          }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        )
      ) as any;

      const res503 = await parseRentRollPhotoOcr(SAMPLE_PNG_DATA_URL);
      expect(res503.success).toBe(false);
      expect(res503.rows).toEqual([]);
      expect(res503.reviewNotice).toBe(
        '사진 인식을 완료할 수 없어 엑셀 업로드 또는 직접 입력 모드로 전환합니다.'
      );
      const serialized503 = JSON.stringify(res503);
      expect(serialized503).not.toContain('3500');
      expect(serialized503).not.toContain('230');
      expect(serialized503).not.toContain('2027.12');
      expect(serialized503).not.toContain('27.12');
      expect(serialized503).not.toContain('근린생활시설 (소매점)');

      globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error('Network down')) as any;
      const resErr = await parseRentRollPhotoOcr(SAMPLE_PNG_DATA_URL);
      expect(resErr.success).toBe(false);
      expect(resErr.rows).toEqual([]);
    });

    it('maps real structured Vision JSON response into RentRollRowItem[] with needsReview: true and empty expiry when absent', async () => {
      const visionRows = [
        {
          floor: '1F',
          unit: '101호',
          use: '스페셜티 카페',
          depositManwon: 5000,
          monthlyRentManwon: 420,
          maintenanceManwon: 35,
          leaseExpiry: '2028-04-30',
          status: 'occupied' as const,
          confidence: 0.96,
        },
        {
          floor: '2F',
          unit: '201호',
          use: '공실',
          depositManwon: 0,
          monthlyRentManwon: 0,
          maintenanceManwon: 0,
          leaseExpiry: '',
          status: 'vacant' as const,
          confidence: 0.82,
        },
      ];

      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, rows: visionRows }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      ) as any;

      const blob = new Blob([Uint8Array.from([137, 80, 78, 71])], { type: 'image/png' });
      const result = await parseRentRollPhotoOcr(blob);

      expect(result.success).toBe(true);
      expect(result.rows).toHaveLength(2);

      expect(result.rows[0].floor).toBe('1F');
      expect(result.rows[0].unit).toBe('101호');
      expect(result.rows[0].use).toBe('스페셜티 카페');
      expect(result.rows[0].depositManwon).toBe(5000);
      expect(result.rows[0].monthlyRentManwon).toBe(420);
      expect(result.rows[0].maintenanceManwon).toBe(35);
      expect(result.rows[0].leaseExpiry).toBe('28.04');
      expect(result.rows[0].status).toBe('occupied');
      expect(result.rows[0].needsReview).toBe(true);

      // Missing leaseExpiry MUST remain '' and never '2027.12' / '27.12'
      expect(result.rows[1].floor).toBe('2F');
      expect(result.rows[1].status).toBe('vacant');
      expect(result.rows[1].leaseExpiry).toBe('');
      expect(result.rows[1].normalizedExpiry).toBeUndefined();
      expect(result.rows[1].needsReview).toBe(true);

      const directMapped = mapVisionOcrRowsToRentRollItems(visionRows);
      expect(directMapped.every((r) => r.needsReview === true)).toBe(true);
    });

    it('POST /api/broker/rent-roll/vision-ocr returns 503 when OPENAI_API_KEY is missing/mock and extracts via gpt-4o when configured', async () => {
      delete process.env.OPENAI_API_KEY;

      const reqMissingKey = new NextRequest('http://localhost/api/broker/rent-roll/vision-ocr', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-broker-token',
        },
        body: JSON.stringify({ imageDataUrl: SAMPLE_PNG_DATA_URL }),
      });

      const res503 = await postVisionOcr(reqMissingKey);
      expect(res503.status).toBe(503);
      const body503 = await res503.json();
      expect(body503).toEqual({
        ok: false,
        error:
          '렌트롤 사진 AI 인식이 현재 비활성화되어 있습니다. 엑셀 업로드 또는 표 붙여넣기를 이용해주세요.',
      });

      // Configure real-format key and mock OpenAI Vision API response
      process.env.OPENAI_API_KEY = 'sk-proj-real-vision-test-key';
      globalThis.fetch = vi.fn().mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    rows: [
                      {
                        floor: '3F',
                        unit: '301호',
                        use: '세무회계사무소',
                        depositManwon: 4000,
                        monthlyRentManwon: 290,
                        maintenanceManwon: 30,
                        leaseExpiry: '',
                        status: 'occupied',
                        confidence: 0.91,
                      },
                    ],
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      ) as any;

      const reqValid = new NextRequest('http://localhost/api/broker/rent-roll/vision-ocr', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-broker-token',
        },
        body: JSON.stringify({ imageDataUrl: SAMPLE_PNG_DATA_URL }),
      });

      const res200 = await postVisionOcr(reqValid);
      expect(res200.status).toBe(200);
      const body200 = await res200.json();
      expect(body200.ok).toBe(true);
      expect(body200.rows).toHaveLength(1);
      expect(body200.rows[0]).toMatchObject({
        floor: '3F',
        unit: '301호',
        use: '세무회계사무소',
        depositManwon: 4000,
        monthlyRentManwon: 290,
        leaseExpiry: '',
        status: 'occupied',
      });
    });
  });

  describe('(b) im-core/facts & BasicImDocument: Zero Fake Statutory/Physical Fallbacks & SSoT Parity', () => {
    it('does NOT emit fabricated statutory/physical defaults when ledger inputs are empty', () => {
      const land = extractLandFacts({});
      expect(land.zoning).toBe('공적장부 확인 필요');
      expect(land.roadConditions).toBe('');
      expect(land.terrainShape).toBe('공적장부 확인 필요');
      expect(land.usageRegulation).toEqual(['공적장부 확인 필요']);

      const building = extractBuildingSpecs({ floors_above: 6 });
      expect(building.completionDate).toBe('공적장부 확인 필요');
      expect(building.structure).toBe('공적장부 확인 필요');
      expect(building.mainUsage).toBe('공적장부 확인 필요');
      // Must NOT fabricate 1 elevator just because floorsAbove >= 5
      expect(building.elevators).toBe(0);

      const pureFacts = extractPureBuildingFacts({
        title: '역삼동 테스트 빌딩',
        address: '서울특별시 강남구 역삼동 700-1',
        asking_price_manwon: 800000,
      });
      const basicDoc = buildBasicImDocument(pureFacts);
      const serialized = JSON.stringify(basicDoc);

      expect(serialized).not.toContain('토지거래허가구역 외');
      expect(serialized).not.toContain('과밀억제권역');
      expect(serialized).not.toContain('일반상업지역');
      expect(serialized).not.toContain('25m 광대로 접함');
      expect(serialized).not.toContain('세로장방형 평지');
      expect(serialized).not.toContain('2015-06-01');
      expect(serialized).not.toContain('철근콘크리트구조');
      expect(serialized).not.toContain('제1·2종 근린생활시설');
    });

    it('exposes authoritative FinancialCalculator / YieldSet numbers without divergence', () => {
      const tx = extractTransactionFacts(
        {
          asking_price_manwon: 1000000, // 100억
          financials: {
            loanAmountBil: 55, // 55억
            equityRequired: 40, // 40억 (매매가 100억 - 보증금 5억 - 대출 55억)
          },
        },
        100,
        300,
        50000 * 10000
      );
      expect(tx.expectedLoanKrw).toBe(5_500_000_000);
      expect(tx.estimatedEquityKrw).toBe(4_000_000_000);

      const val = extractValuationFacts(
        tx.askingPriceKrw,
        500_000_000,
        35_000_000,
        0,
        tx.expectedLoanKrw,
        4.5,
        {
          noiBaseKrw: 378_000_000,
          capRatePct: 3.78,
          grossYieldPct: 4.42,
        }
      );
      expect(val.netAnnualOperatingIncomeKrw).toBe(378_000_000);
      expect(val.capRatePct).toBe(3.78);
      expect(val.grossYieldPct).toBe(4.42);
    });
  });

  describe('(c) MobileIMViewer: 15-Row Rent-Roll Toggle, Zero Fake Expiry/Diff, Provenance Badge & SSoT Parity', () => {
    let root: Root;
    let container: HTMLDivElement;

    beforeEach(() => {
      container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);
    });

    afterEach(() => {
      act(() => {
        root.unmount();
      });
      container.remove();
    });

    it('renders "전체 15개 호실 모두 보기" toggle for 15 rent-roll rows, keeps print rows in DOM, excludes 공실/사옥 from rent sum, and never fabricates 2027-12', async () => {
      const fifteenRows = Array.from({ length: 15 }, (_, idx) => {
        const num = idx + 1;
        if (num === 14) {
          return {
            floor: '14F',
            use: '공실',
            status: 'vacant',
            depositManwon: 5000,
            monthlyRentManwon: 400,
            leaseExpiry: '',
          };
        }
        if (num === 15) {
          return {
            floor: '15F',
            use: '본사 사옥',
            status: 'owner',
            depositManwon: 10000,
            monthlyRentManwon: 500,
            leaseExpiry: '',
          };
        }
        return {
          floor: `${num}F`,
          use: `임차인-${num}호`,
          status: 'occupied',
          depositManwon: 2000,
          monthlyRentManwon: 100, // 13 leased units * 100만 = 1,300만원
          leaseExpiry: '',
        };
      });

      const docPayload = {
        blindName: '강남 15층 프라임 빌딩',
        areaSignal: '서울특별시 강남구 논현동',
        heroCard: {
          askingPriceDisplay: '120억',
          capRateBase: 3.91,
          noiBaseBil: 4.692,
          equityRequiredBil: 45.4,
        },
        financials: {
          noiBaseKrw: 469_200_000,
          capRate: { best: 4.2, base: 3.91, worst: 3.6 },
          loanAmountBil: 72,
          equityRequired: 45.4,
        },
        rentRoll: fifteenRows,
      };

      await act(async () => {
        root.render(<MobileIMViewer document={docPayload as any} buildingId="bld-15rows" />);
      });

      const rentSec = container.querySelector('[data-section-id="06_rentroll"]')!;
      expect(rentSec).not.toBeNull();

      // All 15 rows remain in DOM for @media print (`print:table-row`), with rows 11-15 collapsed on screen initially
      const allDomRows = rentSec.querySelectorAll('tbody tr');
      expect(allDomRows.length).toBe(15);
      const collapsedRowsBefore = rentSec.querySelectorAll('tbody tr.hidden');
      expect(collapsedRowsBefore.length).toBe(5);
      expect(allDomRows[14].className).toContain('print:table-row');

      // Toggle button exists with exact Korean text
      const toggleBtn = rentSec.querySelector('[data-testid="rentroll-toggle-btn"]') as HTMLButtonElement;
      expect(toggleBtn).not.toBeNull();
      expect(toggleBtn.textContent).toContain('전체 15개 호실 모두 보기');

      // Click toggle -> expands all 15 rows on screen and switches label to "10개 호실만 접기"
      await act(async () => {
        toggleBtn.click();
      });

      expect(toggleBtn.textContent).toContain('10개 호실만 접기');
      expect(rentSec.querySelectorAll('tbody tr.hidden').length).toBe(0);
      expect(rentSec.textContent).toContain('15F');
      expect(rentSec.textContent).toContain('임차인-13호');

      // Never fabricates '2027-12' or '27.12'
      expect(container.textContent).not.toContain('2027-12');
      expect(container.textContent).not.toContain('27.12');

      // SSoT Leased Rent Sum excludes 14F ('공실') AND 15F ('본사 사옥') -> 13 * 100 = 1,300만원
      expect(rentSec.textContent).toContain('월 수익 합계: 1,300만원');

      // SSoT Cap Rate & NOI match FinancialCalculator / heroCard (3.91%, 46,920만 원)
      const yieldSec = container.querySelector('[data-section-id="07_yield"]')!;
      expect(yieldSec.textContent).toContain('3.91%');
      expect(yieldSec.textContent).toContain('46,920만 원');

      // No previousVersion -> fake v1 diff button MUST NOT be rendered
      expect(container.querySelector('[data-testid="version-diff-btn"]')).toBeNull();

      // No PNU / buildingRegister / officialLandPrice / comps -> shows pending provenance badge, NOT verified badge
      const coverSec = container.querySelector('[data-section-id="01_cover"]')!;
      expect(coverSec.textContent).toContain('중개인 입력 기준 · 공적장부 대조 예정');
      expect(coverSec.textContent).not.toContain('✓ 공적장부·실거래 검증필');
    });

    it('renders "✓ 공적장부·실거래 검증필" and real v1↔v2 diff ONLY when verified provenance and previousVersion exist', async () => {
      const v1Facts = extractPureBuildingFacts({
        title: '검증 완료 빌딩',
        address: '서울특별시 서초구 서초동 1320-1',
        pnu: '1165010800113200001',
        asking_price_manwon: 1050000,
        monthly_rent_total_manwon: 3400,
        deposit_total_manwon: 30000,
      });
      const v2Facts = extractPureBuildingFacts({
        title: '검증 완료 빌딩',
        address: '서울특별시 서초구 서초동 1320-1',
        pnu: '1165010800113200001',
        asking_price_manwon: 1000000,
        monthly_rent_total_manwon: 3500,
        deposit_total_manwon: 30000,
      });

      const v2Doc = {
        ...buildBasicImDocument(v2Facts),
        previousVersion: buildBasicImDocument(v1Facts),
      };

      await act(async () => {
        root.render(<MobileIMViewer document={v2Doc as any} buildingId="bld-verified" isBroker={true} />);
      });

      const coverSec = container.querySelector('[data-section-id="01_cover"]')!;
      expect(coverSec.textContent).toContain('✓ 공적장부·실거래 검증필');

      const diffBtn = container.querySelector('[data-testid="version-diff-btn"]') as HTMLButtonElement;
      expect(diffBtn).not.toBeNull();

      await act(async () => {
        diffBtn.click();
      });

      const diffModal = container.querySelector('[data-testid="version-diff-modal"]')!;
      expect(diffModal).not.toBeNull();
      expect(diffModal.textContent).toContain('105억 원');
      expect(diffModal.textContent).toContain('100억 원');
    });
  });
});
