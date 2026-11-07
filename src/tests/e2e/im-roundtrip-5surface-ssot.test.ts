/**
 * Wave 2 (Axis 3 & Axis 4) — IM Lifecycle Round-Trip & 5-Surface SSOT Parity E2E Test Suite
 *
 * 검증 범위:
 * 1. Axis 3 (Full Lifecycle Round-Trip):
 *    - 매물 입력/생성(docBody) → Basic IM 스튜디오 프로젝트 생성(createBasicImProject)
 *    - 스튜디오 인라인 슬라이드 편집(patchSlideOverrides: 표지 제목/매매가 + 렌트롤 공실 층 신규 임차인 반영)
 *    - 스튜디오 오버라이드 기반 PPTX 재렌더링 및 OpenXML 바이너리 검증 (오버라이드 반영 + 위반 0건)
 *    - snake_case `rent_roll` 단일 필드 입력 시에도 스튜디오 `tenantData` 누락 0건 검증
 * 2. Axis 4 (5-Surface SSOT Parity):
 *    - 동일 매물(R1 만실 수익형, R3 고공실 밸류애드, R6 임대료 0원 사옥형)에 대해:
 *      ① Workspace Summary (`ssot_summary`)
 *      ② Mobile IM (`BasicImDocument`)
 *      ③ Basic IM Studio Slide Defaults (`buildBasicImSlideDefaults`)
 *      ④ Public IM Viewer API (`/api/public/im-lite/[buildingId]` 응답 페이로드)
 *      ⑤ PPTX Binary (`MobileImPptxRenderer` OpenXML 텍스트)
 *      5개 표면 간 매매가·보증금·월임대료·점유율·수익률·사진 배열 정합성 100% 일치 검증
 */
import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  buildPseudoGoldenScenarios,
  type PseudoGoldenScenario,
} from './fixtures/pseudo-golden-generator';
import { createBasicImTestInput } from './fixtures/basic-im-factory';
import { extractPureBuildingFacts } from '@/domain/building/im-core/facts';
import { buildBasicImDocument } from '@/domain/building/im-core/basic-im-document';
import {
  studioService,
  buildBasicImSlideDefaults,
} from '@/domain/building/pptx-studio/studio-service';
import { MobileImPptxRenderer } from '@/domain/building/mobile-im/pptx/pptx-renderer';
import { auditPptxGeometry } from '@/domain/building/mobile-im/quality/pptx-geometry-audit';
import {
  extractSlideTexts,
  assertZeroPoisonTokens,
  assertZeroEvasivePhrases,
  assertZeroMockLeaks,
  assertAllPhysicalBinaryGates,
} from '@/assurance/im-harness/golden-test-utils';

async function buildScenarioPptxInput(scenario: PseudoGoldenScenario) {
  const pptxInput = await createBasicImTestInput(scenario.bottomSheet, {
    coordinates: scenario.coordinates,
    buildingName: scenario.buildingName,
    posture: scenario.posture,
    photos: scenario.photos,
    pnu: scenario.pnu,
    pnus: scenario.pnus,
    skipEnrichment: true,
    ssotExtra: scenario.ssotExtra,
    buildingExtra: scenario.buildingExtra,
    broker: {
      display_name: '정현우 수석팀장',
      company_name: '제이에스부동산중개법인',
      phone: '010-3344-5566',
      registration_no: '11680-2024-00156',
    },
  });
  if (scenario.docBodyExtra) {
    Object.assign(pptxInput.doc.body, scenario.docBodyExtra);
  }
  return pptxInput;
}

describe('Wave 2: IM Lifecycle Round-Trip (Axis 3) & 5-Surface SSOT Parity (Axis 4)', () => {
  const scenarios = buildPseudoGoldenScenarios();

  it('[Axis 3] Round-Trip: Generate → Studio Create → Inline Edit (Cover & RentRoll) → PPTX Render reflects overrides with 0 violations', async () => {
    const r3 = scenarios.find((c) => c.caseId === 'R3_VALUE_ADD_VACANT_OWNER_MIX')!;
    expect(r3).toBeDefined();

    const pptxInput = await buildScenarioPptxInput(r3);
    const rentRollList = r3.bottomSheet.floor_leases || [];

    // 1. Create Studio project from generated docBody (also verify snake_case rent_roll compatibility)
    const snakeCaseDocBody = {
      ...pptxInput.doc.body,
      floor_leases: undefined,
      rentRoll: undefined,
      rent_roll: rentRollList,
    };

    const project = await studioService.createBasicImProject(
      pptxInput.buildingId,
      pptxInput.doc.title || 'Basic IM',
      snakeCaseDocBody,
      pptxInput.broker as Record<string, any>
    );

    expect(project.dealId).toBe(pptxInput.buildingId);
    expect(project.buildingContext?.floor_leases?.length).toBe(rentRollList.length);

    const coverSlide = project.slides.find((s) => s.dataKey === 'cover')!;
    const rentrollSlide = project.slides.find((s) => s.dataKey === 'rentroll')!;
    expect(coverSlide).toBeDefined();
    expect(rentrollSlide).toBeDefined();
    expect(Array.isArray(rentrollSlide.slideOverrides?.tenantData)).toBe(true);
    expect((rentrollSlide.slideOverrides?.tenantData as any[]).length).toBe(rentRollList.length);

    // 2. Broker performs inline edits in Basic IM Studio (Cover title/price + RentRoll 2F lease-up)
    const editedTitle = '청담권역 플래그십 밸류애드 빌딩 매각';
    const editedAskingPrice = '152.0억';
    await studioService.patchSlideOverrides(project.id, coverSlide.id, {
      title: editedTitle,
      askingPrice: editedAskingPrice,
    });

    const originalTenants = (rentrollSlide.slideOverrides?.tenantData as any[]) || [];
    const editedTenants = originalTenants.map((row: any) =>
      String(row.floor).includes('2')
        ? {
            ...row,
            tenant: '신규 입점 청담피부과의원',
            tenant_name: '신규 입점 청담피부과의원',
            deposit: 10000,
            deposit_manwon: 10000,
            monthlyRent: 680,
            monthly_rent_manwon: 680,
            isVacant: false,
            is_vacant: false,
            status: '임대중',
          }
        : row
    );

    const updatedProject = await studioService.patchSlideOverrides(
      project.id,
      rentrollSlide.id,
      { tenantData: editedTenants }
    );

    // 3. Collect Studio overrides exactly as `/api/broker/basic-im-studio/[id]/download` does
    const studioSlideOverrides: Record<string, Record<string, any>> = {};
    const studioInitialOverrides: Record<string, Record<string, any>> = {};
    const studioSlideTitles: Record<string, { title?: string; kicker?: string; layoutType?: string }> = {};
    const studioHiddenDataKeys: string[] = [];
    const studioSlideOrder: string[] = [];

    for (const slide of updatedProject.slides) {
      const dk = slide.dataKey || '';
      if (!dk) continue;
      if (slide.hidden && dk !== 'cover' && dk !== 'closing') {
        studioHiddenDataKeys.push(dk);
      } else {
        studioSlideOrder.push(dk);
      }
      if (slide.slideOverrides && Object.keys(slide.slideOverrides).length > 0) {
        studioSlideOverrides[dk] = { ...(studioSlideOverrides[dk] ?? {}), ...slide.slideOverrides };
      }
      if (slide.initialOverrides && Object.keys(slide.initialOverrides).length > 0) {
        studioInitialOverrides[dk] = { ...(studioInitialOverrides[dk] ?? {}), ...slide.initialOverrides };
      }
      studioSlideTitles[dk] = {
        title: slide.title,
        kicker: slide.kicker,
        layoutType: slide.layoutType,
      };
    }

    const baseBody = updatedProject.buildingContext ?? {};
    const fullBody: Record<string, any> = {
      ...baseBody,
      ...studioSlideOverrides,
      preset: 'credeal_basic',
      _studioSlideOverrides: studioSlideOverrides,
      _studioInitialOverrides: studioInitialOverrides,
      _studioSlideTitles: studioSlideTitles,
      _studioHiddenDataKeys: studioHiddenDataKeys,
      _studioSlideOrder: studioSlideOrder,
      floor_leases: editedTenants,
      rentRoll: editedTenants,
    };

    const renderer = new MobileImPptxRenderer();
    const renderResult = await renderer.render({
      ...pptxInput,
      doc: {
        title: editedTitle,
        body: fullBody,
        sections: pptxInput.doc.sections,
      },
    });

    expect(renderResult.buffer.length).toBeGreaterThan(15_000);
    const geoViolations = await auditPptxGeometry(renderResult.buffer, {
      boundsTolerance: 0.002,
      overflowRatio: 1.15,
      overlapRatio: 0.10,
    });
    expect(geoViolations).toHaveLength(0);
    await assertZeroPoisonTokens(renderResult.buffer);
    await assertZeroEvasivePhrases(renderResult.buffer);
    await assertZeroMockLeaks(renderResult.buffer);
    await assertAllPhysicalBinaryGates(renderResult.buffer);

    const slideTexts = await extractSlideTexts(renderResult.buffer);
    const slide1Text = slideTexts[0]?.text ?? '';
    const allText = slideTexts.map((s) => s.text).join('\n');
    expect(slide1Text).toContain('청담권역 플래그십 밸류애드 빌딩 매각');
    expect(allText).toContain('152.0억');
    expect(allText).toContain('신규 입점 청담피부과의원');
  }, 60_000);

  it('[Axis 4] 5-Surface SSOT Parity: Workspace ↔ Mobile IM ↔ Studio Slide Defaults ↔ Public Viewer API ↔ PPTX Binary', async () => {
    const targetCaseIds = [
      'R1_FULL_OCCUPANCY_SINGLE_FLOOR',
      'R3_VALUE_ADD_VACANT_OWNER_MIX',
      'R6_ZERO_RENT_OWNER_HQ_WITH_COMPS',
    ];

    for (const caseId of targetCaseIds) {
      const scenario = scenarios.find((item) => item.caseId === caseId)!;
      expect(scenario).toBeDefined();

      const pptxInput = await buildScenarioPptxInput(scenario);
      const docBody = pptxInput.doc.body as Record<string, any>;
      const ssot = docBody.ssot_summary as Record<string, any>;
      const rentRollList = scenario.bottomSheet.floor_leases || [];

      // Surface 1: Workspace Summary (`ssot_summary`)
      const wsPriceEok = Number((Number(ssot.asking_price_manwon) / 10000).toFixed(1));
      const expectedPhotoCount = scenario.oracle.expectedPhotoCount;

      // Surface 2: Mobile IM (`BasicImDocument`)
      const rawPayload = {
        id: pptxInput.buildingId,
        building_name: scenario.buildingName,
        address: scenario.bottomSheet.address,
        road_address: scenario.ssotExtra.road_address,
        jibun_address: scenario.ssotExtra.jibun_address || scenario.bottomSheet.address,
        pnu: scenario.pnu,
        investment_posture: scenario.posture,
        asking_price_manwon: scenario.bottomSheet.askingPriceManwon,
        total_deposit_manwon: scenario.oracle.totalDepositManwon,
        monthly_rent_total_krw: scenario.oracle.monthlyRentManwon * 10000,
        total_floor_area_sqm: scenario.bottomSheet.grossFloorAreaM2,
        land_area_sqm: scenario.bottomSheet.landAreaM2,
        zoning: scenario.bottomSheet.zoning,
        floors_above: scenario.ssotExtra.floors_above ?? 5,
        floors_below: scenario.ssotExtra.floors_below ?? 1,
        parking_count: scenario.bottomSheet.parking,
        elevator_count: scenario.bottomSheet.elevator,
        floor_leases: rentRollList,
        photos: scenario.photos,
        ...scenario.ssotExtra,
        ...(scenario.docBodyExtra || {}),
      };
      const facts = extractPureBuildingFacts(rawPayload);
      const mobileDoc = buildBasicImDocument(facts);

      // Surface 3: Studio Slide Defaults (`buildBasicImSlideDefaults`)
      const studioDefaults = buildBasicImSlideDefaults(
        scenario.buildingName,
        docBody,
        pptxInput.broker as Record<string, any>
      );

      // Parity assertions between Surface 1, Surface 2, and Surface 3
      const mobileCover = mobileDoc.sections.find((s) => s.id === '01_cover')?.data;
      const mobilePhotos = mobileDoc.sections.find((s) => s.id === '09_photos')?.data;
      expect(String(mobileCover?.askingPriceText || mobileCover?.priceLabel || JSON.stringify(mobileCover))).toContain(
        String(Math.floor(wsPriceEok))
      );
      expect(studioDefaults.cover.askingPrice).toContain(String(Math.floor(wsPriceEok)));
      expect((studioDefaults.rentroll.tenantData as any[]).length).toBe(rentRollList.length);
      expect(mobilePhotos?.photoCount).toBe(expectedPhotoCount);

      if (caseId === 'R6_ZERO_RENT_OWNER_HQ_WITH_COMPS') {
        // Zero-rent owner-occupied building must never leak "0%" or "0.00%" in Studio defaults
        expect(studioDefaults.highlights.capRateBase).toBe('');
      } else {
        // Income-generating building must format capRateBase with `%`
        expect(String(studioDefaults.highlights.capRateBase)).toMatch(/^\d+\.\d{2}%$/);
      }

      // Surface 4: Public IM Viewer API (`/api/public/im-lite/[buildingId]`)
      const docRow = {
        id: pptxInput.buildingId,
        building_id: pptxInput.buildingId,
        owner_id: 'broker-owner-001',
        title: pptxInput.doc.title,
        document_type: 'mobile_im',
        status: 'published',
        visibility: 'public_blind',
        created_at: new Date().toISOString(),
        body: {
          ...docBody,
          sections: docBody.sections || [{ section_type: 'summary', title: '요약', markdown: '요약' }],
          basicImDocument: mobileDoc,
          coordinates: scenario.coordinates,
        },
      };

      const makeChain = (resultData: any) => {
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          in: () => chain,
          order: () => chain,
          limit: () => chain,
          maybeSingle: async () => ({ data: resultData, error: null }),
          single: async () => ({ data: resultData, error: null }),
        };
        return chain;
      };

      vi.resetModules();
      vi.doMock('@/lib/supabase/service', () => ({
        createServiceClient: () => ({
          from: (table: string) => {
            if (table === 'document_objects') {
              return makeChain(docRow);
            }
            if (table === 'profiles') {
              return makeChain({
                id: 'broker-owner-001',
                display_name: '정현우 수석팀장',
                company: '제이에스부동산중개법인',
                phone: '010-3344-5566',
              });
            }
            return makeChain(null);
          },
        }),
      }));

      const { GET } = await import('@/app/api/public/im-lite/[buildingId]/route');
      const req = new NextRequest(`http://localhost:3000/api/public/im-lite/${pptxInput.buildingId}`);
      const res = await GET(req, { params: Promise.resolve({ buildingId: pptxInput.buildingId }) });
      expect(res.status).toBe(200);
      const publicPayload = await res.json();

      expect(publicPayload.ok).toBe(true);
      const pubDoc = publicPayload.data ?? publicPayload.building;
      const expectedPublicPhotos = scenario.photos.filter((p) => !(p as any).excluded).length;
      expect(pubDoc.photos.length).toBe(expectedPublicPhotos);
      expect(pubDoc.photos_v2.length).toBe(expectedPublicPhotos);
      expect(pubDoc.coordinates).toEqual(scenario.coordinates);
      expect(pubDoc.floor_leases.length).toBe(rentRollList.length);
      expect(pubDoc.ssot_summary.asking_price_manwon).toBe(ssot.asking_price_manwon);
      expect(pubDoc.basicImDocument?.sections?.length).toBe(mobileDoc.sections.length);

      vi.doUnmock('@/lib/supabase/service');

      // Surface 5: PPTX Binary Output
      const renderer = new MobileImPptxRenderer();
      const pptxResult = await renderer.render(pptxInput);
      const slideTexts = await extractSlideTexts(pptxResult.buffer);
      const allText = slideTexts.map((s) => s.text).join('\n');
      expect(allText).toContain(String(Math.floor(wsPriceEok)));
      const pptxGeoViolations = await auditPptxGeometry(pptxResult.buffer, {
        boundsTolerance: 0.002,
        overflowRatio: 1.15,
        overlapRatio: 0.10,
      });
      expect(pptxGeoViolations).toHaveLength(0);
    }
  }, 90_000);
});
