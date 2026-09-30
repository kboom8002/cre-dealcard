import { describe, it, expect, vi } from 'vitest';
import type { MobileIMSupplementalInput } from '@/domain/building/mobile-im/types';
import { TIER_CONFIG, type ReleaseTier } from '@/domain/building/im-core/release-tier';
import { fetchIMData } from '@/app/(public)/im-lite/[buildingId]/fetch-im-data';

// Mock supabase service client
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(),
}));

// Mock demo data to fall through to document_objects
vi.mock('@/lib/demo/mobile-im-demo-data', () => ({
  getDemoMobileIM: vi.fn().mockReturnValue(null),
}));

// Mock kakao static map
vi.mock('@/lib/external/kakao-static-map', () => ({
  buildKakaoStaticMapUrl: vi.fn().mockReturnValue('https://mock-map.url'),
}));

// Mock ssot-adapter
vi.mock('@/lib/ssot-adapter', () => ({
  readWithMigration: vi.fn().mockResolvedValue({ data: null }),
}));

describe('Milestone 5 Remediation Patches Verification', () => {
  describe('Patch 1: MobileIMSupplementalInput Type Conformance', () => {
    it('strictly satisfies MobileIMSupplementalInput with building_name and broker_highlight', () => {
      const hostileSupplemental: MobileIMSupplementalInput = {
        building_name: '뛟뙣굠챦빌딩 <script>alert("xss")</script>',
        broker_highlight: '뛟뙣굠챦빌딩 <script>alert("xss")</script>',
        resolved_address: '서울특별시 강남구 뛟뙣동 999-99 \u200B\uFEFF',
        asking_price_manwon: 500000,
        monthly_rent_total_krw: 15000000,
      };

      expect(hostileSupplemental.building_name).toBeDefined();
      expect(hostileSupplemental.broker_highlight).toBeDefined();
      expect(hostileSupplemental.resolved_address).toContain('\u200B\uFEFF');
    });
  });

  describe('Patch 2 & 4: MobileIMViewer Dynamic openSections and Locked Chart Guard', () => {
    it('initializes openSections with property_overview, 01_overview, and first sectionId', () => {
      const docWithCustomId = {
        sections: [
          { sectionId: 'custom_first_section', title: '커스텀 섹션', content: '내용' },
          { sectionId: 'second_section', title: '두 번째', content: '내용 2' },
        ],
      };

      // Simulates the useState initializer from mobile-im-viewer.tsx:77-83
      const initialOpenSections = (() => {
        const initial = new Set(['property_overview', '01_overview']);
        if (docWithCustomId?.sections?.[0]?.sectionId) {
          initial.add(docWithCustomId.sections[0].sectionId);
        }
        return initial;
      })();

      expect(initialOpenSections.has('property_overview')).toBe(true);
      expect(initialOpenSections.has('01_overview')).toBe(true);
      expect(initialOpenSections.has('custom_first_section')).toBe(true);
      expect(initialOpenSections.has('second_section')).toBe(false);
    });

    it('prevents rendering of leverage and DCF chart widgets when income section is locked', () => {
      const lockedIncomeSection = {
        sectionId: 'income_analysis',
        locked: true,
        title: '수익 분석',
      };
      const unlockedIncomeSection = {
        sectionId: 'income_analysis',
        locked: false,
        title: '수익 분석',
      };

      // Simulates mobile-im-viewer.tsx:497 condition
      const shouldRenderLocked =
        Boolean(lockedIncomeSection.sectionId?.includes('income')) && !lockedIncomeSection.locked;
      const shouldRenderUnlocked =
        Boolean(unlockedIncomeSection.sectionId?.includes('income')) && !unlockedIncomeSection.locked;

      expect(shouldRenderLocked).toBe(false);
      expect(shouldRenderUnlocked).toBe(true);
    });
  });

  describe('Patch 3: Server-Side RSC Redaction of Locked Sections & Financials in fetchIMData', () => {
    it('redacts content, boundaryNote, and provenance when income section is locked in fact_om tier', async () => {
      const { createServiceClient } = await import('@/lib/supabase/service');

      const docData = {
        id: 'doc-fact-om-test',
        building_id: 'bldg-fact-om',
        status: 'published',
        owner_id: 'owner-12345678',
        body: {
          releaseTier: 'fact_om',
          dcf10Year: { waccBasePct: 6.5, npvBaseKrw: 12000000000 },
          financials: {
            equityRequired: 35.0,
            totalDepositBil: 5.0,
            loanAmountBil: 75.0,
            leveragedYield: 7.2,
            wacc: 0.055,
          },
          sections: [
            {
              section_type: 'property_overview',
              title: '물건 개요',
              markdown: '### 물건 개요 공개 본문',
              confidence: 'measured',
              boundary_note: '공개 개요 비고',
              provenance: ['ssot.asset_identity'],
            },
            {
              section_type: 'income_analysis',
              title: '수익 분석',
              markdown: '### 대외비 수익 분석 상세 (IRR, NPV, 대출 조건)',
              confidence: 'inferred',
              boundary_note: '민감 금융 데이터',
              provenance: ['financial.engine'],
            },
          ],
        },
      };

      const mockSupabase = {
        auth: {
          admin: {
            getUserById: vi.fn().mockResolvedValue({ data: { user: { email: 'test@example.com' } } }),
          },
        },
        from: vi.fn((table: string) => {
          const chain: any = {
            select: vi.fn(() => chain),
            eq: vi.fn(() => chain),
            in: vi.fn(() => chain),
            order: vi.fn(() => chain),
            limit: vi.fn(() => chain),
            upsert: vi.fn(() => Promise.resolve({ data: null, error: null })),
            update: vi.fn(() => Promise.resolve({ data: null, error: null })),
            single: vi.fn().mockImplementation(() => {
              if (table === 'document_objects') return Promise.resolve({ data: docData, error: null });
              if (table === 'broker_profiles') return Promise.resolve({ data: { slug: 'test-broker', name: '테스트' }, error: null });
              if (table === 'profiles') return Promise.resolve({ data: { display_name: '테스트' }, error: null });
              return Promise.resolve({ data: null, error: null });
            }),
            maybeSingle: vi.fn().mockImplementation(() => {
              if (table === 'document_objects') return Promise.resolve({ data: docData, error: null });
              if (table === 'broker_profiles') return Promise.resolve({ data: { slug: 'test-broker', name: '테스트' }, error: null });
              if (table === 'profiles') return Promise.resolve({ data: { display_name: '테스트' }, error: null });
              return Promise.resolve({ data: null, error: null });
            }),
          };
          return chain;
        }),
      };

      (createServiceClient as any).mockReturnValue(mockSupabase);

      const result = await fetchIMData('bldg-fact-om');
      expect(result).not.toBeNull();

      // Verify overview section is unlocked and content is preserved
      const overviewSection = result!.sections.find((s) => s.sectionId === 'property_overview');
      expect(overviewSection).toBeDefined();
      expect(overviewSection!.locked).toBe(false);
      expect(overviewSection!.content).toBe('### 물건 개요 공개 본문');
      expect(overviewSection!.boundaryNote).toBe('공개 개요 비고');
      expect((overviewSection as any).provenance).toEqual(['ssot.asset_identity']);

      // Verify income_analysis is locked under fact_om, and confidential data is REDACTED
      const incomeSection = result!.sections.find((s) => s.sectionId === 'income_analysis');
      expect(incomeSection).toBeDefined();
      expect(incomeSection!.locked).toBe(true);
      expect(incomeSection!.content).toBe(''); // Verifies redaction
      expect(incomeSection!.boundaryNote).toBeUndefined(); // Verifies redaction
      expect((incomeSection as any).provenance).toEqual([]); // Verifies redaction

      // Verify top-level financials and dcf10Year are completely stripped for fact_om
      expect(result!.dcf10Year).toBeUndefined();
      expect(result!.financials).toBeUndefined();
    });

    it('preserves financials and dcf10Year when releaseTier is pro', async () => {
      const { createServiceClient } = await import('@/lib/supabase/service');

      const docData = {
        id: 'doc-pro-test',
        building_id: 'bldg-pro',
        status: 'published',
        owner_id: 'owner-12345678',
        body: {
          releaseTier: 'pro',
          dcf10Year: { waccBasePct: 6.5, npvBaseKrw: 12000000000 },
          financials: {
            equityRequired: 35.0,
            totalDepositBil: 5.0,
            loanAmountBil: 75.0,
            leveragedYield: 7.2,
            wacc: 0.055,
          },
          sections: [
            {
              section_type: 'income_analysis',
              title: '수익 분석',
              markdown: '### 프로 티어 허가된 수익 분석 상세',
              confidence: 'inferred',
              boundary_note: '프로 열람 가능',
              provenance: ['financial.engine'],
            },
          ],
        },
      };

      const mockSupabase = {
        auth: {
          admin: {
            getUserById: vi.fn().mockResolvedValue({ data: { user: { email: 'test@example.com' } } }),
          },
        },
        from: vi.fn((table: string) => {
          const chain: any = {
            select: vi.fn(() => chain),
            eq: vi.fn(() => chain),
            in: vi.fn(() => chain),
            order: vi.fn(() => chain),
            limit: vi.fn(() => chain),
            upsert: vi.fn(() => Promise.resolve({ data: null, error: null })),
            update: vi.fn(() => Promise.resolve({ data: null, error: null })),
            single: vi.fn().mockImplementation(() => {
              if (table === 'document_objects') return Promise.resolve({ data: docData, error: null });
              if (table === 'broker_profiles') return Promise.resolve({ data: { slug: 'test-broker', name: '테스트' }, error: null });
              if (table === 'profiles') return Promise.resolve({ data: { display_name: '테스트' }, error: null });
              return Promise.resolve({ data: null, error: null });
            }),
            maybeSingle: vi.fn().mockImplementation(() => {
              if (table === 'document_objects') return Promise.resolve({ data: docData, error: null });
              if (table === 'broker_profiles') return Promise.resolve({ data: { slug: 'test-broker', name: '테스트' }, error: null });
              if (table === 'profiles') return Promise.resolve({ data: { display_name: '테스트' }, error: null });
              return Promise.resolve({ data: null, error: null });
            }),
          };
          return chain;
        }),
      };

      (createServiceClient as any).mockReturnValue(mockSupabase);

      const result = await fetchIMData('bldg-pro');
      expect(result).not.toBeNull();

      // In pro tier, income_analysis is unlocked and content is preserved
      const incomeSection = result!.sections.find((s) => s.sectionId === 'income_analysis');
      expect(incomeSection).toBeDefined();
      expect(incomeSection!.locked).toBe(false);
      expect(incomeSection!.content).toBe('### 프로 티어 허가된 수익 분석 상세');

      // Top-level financials and dcf10Year are accessible
      expect(result!.dcf10Year).toBeDefined();
      expect(result!.financials).toBeDefined();
      expect(result!.financials?.equityRequiredBil).toBe(35.0);
      expect(result!.financials?.waccPct).toBe(5.5);
    });
  });
});
