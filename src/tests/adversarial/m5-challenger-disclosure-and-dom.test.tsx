import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { fetchIMData } from '@/app/(public)/im-lite/[buildingId]/fetch-im-data';
import { MobileIMViewer } from '@/app/(public)/im-lite/[buildingId]/mobile-im-viewer';
import type { MobileIMDocument, MobileIMSection, MobileIMBroker } from '@/lib/demo/mobile-im-demo-data';

// ── Mocks for fetchIMData ──
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(),
}));

vi.mock('@/lib/demo/mobile-im-demo-data', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    getDemoMobileIM: vi.fn().mockReturnValue(null),
  };
});

vi.mock('@/lib/external/kakao-static-map', () => ({
  buildKakaoStaticMapUrl: vi.fn().mockReturnValue('https://mock-map.url'),
}));

vi.mock('@/lib/ssot-adapter', () => ({
  readWithMigration: vi.fn().mockResolvedValue({ data: null }),
}));

// ── Mocks for MobileIMViewer ──
vi.mock('@/platform/im-pipeline/realtime/use-dealcard-realtime-sync', () => ({
  useDealcardRealtimeSync: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: any) => <a href={href} {...rest}>{children}</a>,
}));

vi.mock('next/image', () => ({
  default: ({ src, alt, ...rest }: any) => <img src={src} alt={alt} {...rest} />,
}));

vi.mock('next/script', () => ({
  default: () => null,
}));

describe('Empirical Challenger: M5 Remediation Retest Probes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Adversarial Probe: Locked Section Data Disclosure Prevention (fetchIMData)', () => {
    function setupMockSupabase(docData: any) {
      const mockSupabase = {
        auth: {
          admin: {
            getUserById: vi.fn().mockResolvedValue({ data: { user: { email: 'broker@example.com' } } }),
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
              if (table === 'broker_profiles') return Promise.resolve({ data: { slug: 'test-broker', name: '김중개' }, error: null });
              if (table === 'profiles') return Promise.resolve({ data: { display_name: '김중개' }, error: null });
              return Promise.resolve({ data: null, error: null });
            }),
            maybeSingle: vi.fn().mockImplementation(() => {
              if (table === 'document_objects') return Promise.resolve({ data: docData, error: null });
              if (table === 'broker_profiles') return Promise.resolve({ data: { slug: 'test-broker', name: '김중개' }, error: null });
              if (table === 'profiles') return Promise.resolve({ data: { display_name: '김중개' }, error: null });
              return Promise.resolve({ data: null, error: null });
            }),
          };
          return chain;
        }),
      };
      return mockSupabase;
    }

    const testFinancialBody = {
      dcf10Year: {
        npvBase: 12000000000,
        irrBase: 7.1,
        cashFlows: [-10000000000, 500000000, 520000000, 15000000000],
        sensitivityMatrix: [
          { discountRate: 0.05, rentGrowthRate: 0.015, npv: 13000000000, irr: 7.2 },
          { discountRate: 0.05, rentGrowthRate: 0.02, npv: 13500000000, irr: 7.5 },
          { discountRate: 0.05, rentGrowthRate: 0.025, npv: 14000000000, irr: 7.8 },
          { discountRate: 0.055, rentGrowthRate: 0.015, npv: 12000000000, irr: 6.8 },
          { discountRate: 0.055, rentGrowthRate: 0.02, npv: 12500000000, irr: 7.1 },
          { discountRate: 0.055, rentGrowthRate: 0.025, npv: 13000000000, irr: 7.4 },
          { discountRate: 0.06, rentGrowthRate: 0.015, npv: 11000000000, irr: 6.4 },
          { discountRate: 0.06, rentGrowthRate: 0.02, npv: 11500000000, irr: 6.7 },
          { discountRate: 0.06, rentGrowthRate: 0.025, npv: 12000000000, irr: 7.0 },
        ],
      },
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
          markdown: '### 물건 개요 일반 공개 내용',
          confidence: 'measured',
          boundary_note: '공개 기본 개요',
          provenance: ['ssot.asset_identity'],
        },
        {
          section_type: 'income_analysis',
          title: '수익 분석',
          markdown: '### 기밀 수익 분석 상세: IRR 7.2%, 대출금 75억, 순영업소득 5.2억',
          confidence: 'inferred',
          boundary_note: '기밀 금융 데이터 비고',
          provenance: ['financial.engine', 'rent_roll'],
        },
        {
          section_type: 'stabilized_scenario',
          title: '정상화 시나리오',
          markdown: '### 대외비 시나리오: 임대료 15% 상승 및 공실 해소 방안',
          confidence: 'inferred',
          boundary_note: '시나리오 민감 분석',
          provenance: ['scenario.model'],
        },
        {
          section_type: 'value_add_plan',
          title: '밸류애드 플랜',
          markdown: '### 대외비 밸류애드: 용도변경 및 리모델링 견적 12억',
          confidence: 'inferred',
          boundary_note: '건축사 가설계 검토서',
          provenance: ['architect.report'],
        },
        {
          section_type: 'market_rent_gap',
          title: '적정 임대료 갭 분석',
          markdown: '### 대외비 갭 분석: 인근 대비 18% 저평가 상태',
          confidence: 'inferred',
          boundary_note: '상권 임대시세 실거래',
          provenance: ['market.comparables'],
        },
      ],
    };

    it('rigorously verifies ZERO disclosure in fact_om release tier: content empty, notes suppressed, provenance stripped, top-level financials undefined', async () => {
      const { createServiceClient } = await import('@/lib/supabase/service');
      const docData = {
        id: 'doc-fact-om-deep',
        building_id: 'bldg-fact-om',
        status: 'published',
        owner_id: 'owner-adv',
        body: {
          releaseTier: 'fact_om',
          ...testFinancialBody,
        },
      };

      (createServiceClient as any).mockReturnValue(setupMockSupabase(docData));

      const imDoc = await fetchIMData('bldg-fact-om');
      expect(imDoc).not.toBeNull();

      // Top-level financial models must be completely undefined
      expect(imDoc!.dcf10Year).toBeUndefined();
      expect(imDoc!.financials).toBeUndefined();

      // Unlocked overview must remain fully accessible
      const overview = imDoc!.sections.find((s) => s.sectionId === 'property_overview');
      expect(overview).toBeDefined();
      expect(overview!.locked).toBe(false);
      expect(overview!.content).toBe('### 물건 개요 일반 공개 내용');
      expect(overview!.boundaryNote).toBe('공개 기본 개요');
      expect((overview as any).provenance).toEqual(['ssot.asset_identity']);

      // Restricted sections in fact_om:
      // income_analysis, stabilized_scenario, value_add_plan, market_rent_gap
      const restrictedTypes = ['income_analysis', 'stabilized_scenario', 'value_add_plan', 'market_rent_gap'];
      for (const st of restrictedTypes) {
        const sec = imDoc!.sections.find((s) => s.sectionId === st);
        expect(sec, `Section ${st} should be present in sections list`).toBeDefined();
        expect(sec!.locked, `Section ${st} must be locked in fact_om`).toBe(true);
        expect(sec!.content, `Section ${st} content must be strictly empty string`).toBe('');
        expect(sec!.boundaryNote, `Section ${st} boundaryNote must be suppressed`).toBeUndefined();
        expect((sec as any).provenance, `Section ${st} provenance must be empty array`).toEqual([]);
      }
    });

    it('verifies data disclosure resistance under snake_case release_tier and legacy tier aliases', async () => {
      const { createServiceClient } = await import('@/lib/supabase/service');
      const docData = {
        id: 'doc-fact-om-alias',
        building_id: 'bldg-fact-om-alias',
        status: 'published',
        owner_id: 'owner-adv',
        body: {
          release_tier: 'fact_om', // snake_case variation
          ...testFinancialBody,
        },
      };

      (createServiceClient as any).mockReturnValue(setupMockSupabase(docData));

      const imDoc = await fetchIMData('bldg-fact-om-alias');
      expect(imDoc).not.toBeNull();

      expect(imDoc!.dcf10Year).toBeUndefined();
      expect(imDoc!.financials).toBeUndefined();

      const incomeSec = imDoc!.sections.find((s) => s.sectionId === 'income_analysis');
      expect(incomeSec!.locked).toBe(true);
      expect(incomeSec!.content).toBe('');
      expect(incomeSec!.boundaryNote).toBeUndefined();
      expect((incomeSec as any).provenance).toEqual([]);
    });

    it('verifies strict redaction for internal_only and expert_required tiers', async () => {
      const { createServiceClient } = await import('@/lib/supabase/service');

      for (const tier of ['internal_only', 'expert_required'] as const) {
        const docData = {
          id: `doc-${tier}`,
          building_id: `bldg-${tier}`,
          status: 'published',
          owner_id: 'owner-adv',
          body: {
            releaseTier: tier,
            ...testFinancialBody,
          },
        };

        (createServiceClient as any).mockReturnValue(setupMockSupabase(docData));

        const imDoc = await fetchIMData(`bldg-${tier}`);
        expect(imDoc).not.toBeNull();

        expect(imDoc!.dcf10Year).toBeUndefined();
        expect(imDoc!.financials).toBeUndefined();

        const incomeSec = imDoc!.sections.find((s) => s.sectionId === 'income_analysis');
        expect(incomeSec!.locked).toBe(true);
        expect(incomeSec!.content).toBe('');
        expect(incomeSec!.boundaryNote).toBeUndefined();
        expect((incomeSec as any).provenance).toEqual([]);
      }
    });

    it('verifies server-side redaction for pre-rendered sections containing { content, locked: true }', async () => {
      const { createServiceClient } = await import('@/lib/supabase/service');

      const preformattedDocData = {
        id: 'doc-preformatted',
        building_id: 'bldg-preformatted',
        status: 'published',
        owner_id: 'owner-adv',
        body: {
          releaseTier: 'fact_om',
          sections: [
            {
              sectionId: 'income_analysis',
              title: '수익 분석',
              content: '### 대외비 캐시플로우 및 차입금 상환 계획',
              locked: true,
              boundaryNote: '누출되면 안 되는 비고',
              provenance: ['confidential.source'],
            },
          ],
        },
      };

      (createServiceClient as any).mockReturnValue(setupMockSupabase(preformattedDocData));

      const imDoc = await fetchIMData('bldg-preformatted');
      expect(imDoc).not.toBeNull();

      const sec = imDoc!.sections.find((s) => s.sectionId === 'income_analysis');
      expect(sec).toBeDefined();
      expect(sec!.locked).toBe(true);
      expect(sec!.content).toBe('');
      expect(sec!.boundaryNote).toBeUndefined();
      expect((sec as any).provenance).toEqual([]);
    });

    it('verifies positive control: pro and decision_im tiers preserve financials and unlocked contents', async () => {
      const { createServiceClient } = await import('@/lib/supabase/service');

      const docData = {
        id: 'doc-decision-im',
        building_id: 'bldg-decision-im',
        status: 'published',
        owner_id: 'owner-adv',
        body: {
          releaseTier: 'decision_im',
          ...testFinancialBody,
        },
      };

      (createServiceClient as any).mockReturnValue(setupMockSupabase(docData));

      const imDoc = await fetchIMData('bldg-decision-im');
      expect(imDoc).not.toBeNull();

      expect(imDoc!.dcf10Year).toBeDefined();
      expect(imDoc!.financials).toBeDefined();

      const incomeSec = imDoc!.sections.find((s) => s.sectionId === 'income_analysis');
      expect(incomeSec!.locked).toBe(false);
      expect(incomeSec!.content).toContain('### 기밀 수익 분석 상세');
      expect(incomeSec!.boundaryNote).toBe('기밀 금융 데이터 비고');
      expect((incomeSec as any).provenance).toEqual(['financial.engine', 'rent_roll']);
    });
  });

  describe('2. Adversarial Probe: Real DOM Chart Rendering Guard in MobileIMViewer', () => {
    const mockBroker: MobileIMBroker = {
      userId: 'usr-1234',
      displayName: '박프로',
      company: '크리파트너스',
      phone: '010-1234-5678',
      tagline: '상업용 전문 파트너',
      photoUrl: 'https://images.example.com/avatar.jpg',
      slug: 'park-pro',
      vibeTemplateId: 'modern-clean',
    };

    const baseMockDoc: MobileIMDocument = {
      buildingId: 'bldg-viewer-test',
      blindName: '강남구 역삼동 테헤란로 빌딩',
      fullName: '테헤란로 프라임 오피스',
      areaSignal: '강남 테헤란로',
      assetType: '오피스',
      priceBand: '200억',
      sizeSignal: '대형',
      completenessScore: 85,
      tier: 'pro',
      releaseTier: 'fact_om',
      generatedAt: '2026-09-30T00:00:00.000Z',
      status: 'published',
      disclaimer: '참고용 자료입니다.',
      fullImUpgradeCta: {
        enabled: true,
        label: 'Full IM 요청',
        description: '상세 IM 열람 요청',
      },
      protectedFieldsRemoved: ['상세 지번'],
      broker: mockBroker,
      // Note: Financials and DCF outputs are provided in document
      financials: {
        equityRequiredBil: 40.0,
        totalDepositBil: 10.0,
        loanAmountBil: 150.0,
        leveragedYieldPct: 6.8,
        waccPct: 5.5,
      },
      dcf10Year: {
        npvBase: 15000000000,
        irrBase: 7.1,
        cashFlows: [-12000000000, 600000000, 620000000, 18000000000],
        sensitivityMatrix: [
          { discountRate: 0.05, rentGrowthRate: 0.015, npv: 16000000000, irr: 7.2 },
          { discountRate: 0.05, rentGrowthRate: 0.02, npv: 16500000000, irr: 7.5 },
          { discountRate: 0.05, rentGrowthRate: 0.025, npv: 17000000000, irr: 7.8 },
          { discountRate: 0.055, rentGrowthRate: 0.015, npv: 15000000000, irr: 6.8 },
          { discountRate: 0.055, rentGrowthRate: 0.02, npv: 15500000000, irr: 7.1 },
          { discountRate: 0.055, rentGrowthRate: 0.025, npv: 16000000000, irr: 7.4 },
          { discountRate: 0.06, rentGrowthRate: 0.015, npv: 14000000000, irr: 6.4 },
          { discountRate: 0.06, rentGrowthRate: 0.02, npv: 14500000000, irr: 6.7 },
          { discountRate: 0.06, rentGrowthRate: 0.025, npv: 15000000000, irr: 7.0 },
        ],
      },
      sections: [],
    };

    function createMockSection(partial: Partial<MobileIMSection> & { sectionId: string; title: string; locked: boolean; content: string }): MobileIMSection {
      return {
        icon: '📄',
        dataSource: 'SSoT 데이터',
        aiRole: 'auto',
        ...partial,
      };
    }

    it('empirically verifies ZERO chart elements render in the DOM when income section is locked', () => {
      const docWithLockedIncome: MobileIMDocument = {
        ...baseMockDoc,
        sections: [
          createMockSection({
            sectionId: 'property_overview',
            title: '물건 개요',
            icon: '🏢',
            content: '개요 공개 본문',
            locked: false,
          }),
          createMockSection({
            sectionId: 'income_analysis',
            title: '수익 분석',
            icon: '💰',
            content: '',
            locked: true,
            lockedReason: '상세 열람 권한 필요 (Full IM 요청)',
          }),
        ],
      };

      const renderedHtml = renderToStaticMarkup(
        <MobileIMViewer document={docWithLockedIncome} buildingId="bldg-viewer-test" />
      );

      // 1. Verify locked narrative message is present
      expect(renderedHtml).toContain('상세 열람 권한 필요 (Full IM 요청)');

      // 2. Crucial Negative Assertions: LeverageChart DOM elements MUST NOT exist
      expect(renderedHtml).not.toContain('자금 구조 분석');
      expect(renderedHtml).not.toContain('자금 구조 도넛 차트');
      expect(renderedHtml).not.toContain('자기자본');
      expect(renderedHtml).not.toContain('대출');

      // 3. Crucial Negative Assertions: DCFHeatmap DOM elements MUST NOT exist
      expect(renderedHtml).not.toContain('10년 DCF 민감도 분석');
      expect(renderedHtml).not.toContain('할인율 ＼ 상승률');
    });

    it('empirically verifies chart elements DO render in the DOM when income section is UNLOCKED (positive pair check)', () => {
      const docWithUnlockedIncome: MobileIMDocument = {
        ...baseMockDoc,
        sections: [
          createMockSection({
            sectionId: 'property_overview',
            title: '물건 개요',
            icon: '🏢',
            content: '개요 공개 본문',
            locked: false,
          }),
          createMockSection({
            sectionId: 'income_analysis',
            title: '수익 분석',
            icon: '💰',
            content: '수익 분석 공개 본문',
            locked: false,
          }),
        ],
      };

      const renderedHtml = renderToStaticMarkup(
        <MobileIMViewer document={docWithUnlockedIncome} buildingId="bldg-viewer-test" />
      );

      // Positive assertions: when unlocked, charts are legitimately rendered into the DOM
      expect(renderedHtml).toContain('자금 구조 분석');
      expect(renderedHtml).toContain('자금 구조 도넛 차트');
      expect(renderedHtml).toContain('10년 DCF 민감도 분석');
      expect(renderedHtml).toContain('할인율 ＼ 상승률');
    });

    it('verifies dynamic openSections expands the first section on initial load across custom section IDs', () => {
      const docWithCustomLead: MobileIMDocument = {
        ...baseMockDoc,
        sections: [
          createMockSection({
            sectionId: 'custom_flagship_section',
            title: '플래그십 핵심 섹션',
            icon: '⭐',
            content: '플래그십 상세 분석 내용이 초기 로딩 시 펼쳐져 있어야 함',
            locked: false,
          }),
          createMockSection({
            sectionId: 'second_collapsed_section',
            title: '두 번째 섹션',
            icon: '📋',
            content: '두 번째 섹션 내용은 초기 로딩 시 접혀 있어야 함',
            locked: false,
          }),
        ],
      };

      const renderedHtml = renderToStaticMarkup(
        <MobileIMViewer document={docWithCustomLead} buildingId="bldg-viewer-test" />
      );

      // The first section's content must be rendered in expanded form
      expect(renderedHtml).toContain('플래그십 상세 분석 내용이 초기 로딩 시 펼쳐져 있어야 함');
    });

    it('defense-in-depth: verifies NO charts render if section.locked is false but financials/dcf10Year were server-redacted', () => {
      const docWithRedactedFinancials: MobileIMDocument = {
        ...baseMockDoc,
        financials: undefined, // Redacted by server
        dcf10Year: undefined,  // Redacted by server
        sections: [
          createMockSection({
            sectionId: 'income_analysis',
            title: '수익 분석',
            icon: '💰',
            content: '섹션 자체는 열려 있으나 서버에서 금융 모델이 차단된 경우',
            locked: false,
          }),
        ],
      };

      const renderedHtml = renderToStaticMarkup(
        <MobileIMViewer document={docWithRedactedFinancials} buildingId="bldg-viewer-test" />
      );

      // Defense in depth: child charts must not render even when section.locked is false
      expect(renderedHtml).not.toContain('자금 구조 분석');
      expect(renderedHtml).not.toContain('자금 구조 도넛 차트');
      expect(renderedHtml).not.toContain('10년 DCF 민감도 분석');
    });

    it('edge-stress: handles null document, empty sections, and degenerate zero financials without crashing', () => {
      // 1. Null document
      expect(() => {
        renderToStaticMarkup(<MobileIMViewer document={null} buildingId="bldg-viewer-test" />);
      }).not.toThrow();

      // 2. Empty sections
      const emptyDoc: MobileIMDocument = {
        ...baseMockDoc,
        sections: [],
      };
      expect(() => {
        renderToStaticMarkup(<MobileIMViewer document={emptyDoc} buildingId="bldg-viewer-test" />);
      }).not.toThrow();

      // 3. Degenerate zero financials
      const zeroFinDoc: MobileIMDocument = {
        ...baseMockDoc,
        financials: {
          equityRequiredBil: 0,
          totalDepositBil: 0,
          loanAmountBil: 0,
          leveragedYieldPct: 0,
          waccPct: 0,
        },
        sections: [
          createMockSection({
            sectionId: 'income_analysis',
            title: '수익 분석',
            icon: '💰',
            content: '수익 분석 내용',
            locked: false,
          }),
        ],
      };
      const renderedZero = renderToStaticMarkup(
        <MobileIMViewer document={zeroFinDoc} buildingId="bldg-viewer-test" />
      );
      // When all capital amounts are 0, LeverageChart returns null
      expect(renderedZero).not.toContain('자금 구조 도넛 차트');
    });
  });
});
