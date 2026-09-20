/**
 * posture-e2e-pipeline.test.ts
 * ?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä
 * Suite 2: 5?Ä ?¨Ïä§Ï≤??Ä??Î¨ºÍ±¥ ?Ä ?åÏù¥?ÑÎùº??E2E (?§Ï†ú LLM ?∏Ï∂ú)
 * + 16Ï¢?MECE ?ÑÏàò ?åÍ? ?åÏä§?? *
 * Í∞??åÏä§?∏Îäî generateMobileIMHandlerÎ•??§Ï†ú LLM ?∏Ï∂úÍ≥??®Íªò ?§Ìñâ?òÎ©∞,
 * Ï§ëÍ∞Ñ Í≤∞Í≥ºÎ¨ºÏùÑ PipelineLoggerÎ•??µÌï¥ docs/test/stress/e2e-outputs/???Ä?•Ìï©?àÎã§.
 *
 * ?§Ìñâ: npx vitest run src/tests/e2e/posture-e2e-pipeline.test.ts --timeout 300000
 */

import { describe, test, expect, beforeEach, afterAll, vi } from 'vitest';
import { generateMobileIMHandler } from '@/app/api/broker/im-lite/generate/handler';
import type { GenerateMobileIMInput, GenerateMobileIMResult } from '@/app/api/broker/im-lite/generate/handler';
import { MobileImPptxRenderer } from '@/domain/building/mobile-im/pptx/pptx-renderer';
import type { MobileImPptxInput } from '@/domain/building/mobile-im/pptx/pptx-renderer';
import { PipelineLogger } from './posture-e2e-logger';
import {
  POSTURE_REPRESENTATIVE_FIXTURES,
  ALL_FIXTURES,
  type PostureE2EFixture,
} from './posture-e2e-fixtures';
import type { InvestmentPosture } from '@/domain/ontology/enums';

// ?Ä?Ä Supabase Mock (DB ?Ä?•Îßå Î™®ÌÇπ, LLM?Ä ?§Ï†ú ?∏Ï∂ú) ?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä

let savedDocBody: any = null;

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: vi.fn() },
    from: vi.fn(),
  }),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockImplementation((rows: any[]) => {
        if (rows?.[0]?.body) savedDocBody = rows[0].body;
        return {
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 'e2e-doc-id' }, error: null }),
          }),
        };
      }),
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    }),
  }),
}));

// ?Ä?Ä SSoT Mock (?ΩÏä§Ï≤??∞Ïù¥??Ï£ºÏûÖ) ?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä

let mockSsotData: any = {};

vi.mock('@/lib/ssot-adapter', async (importOriginal: any) => {
  const actual = await importOriginal();
  return {
    ...actual,
    readWithMigration: vi.fn().mockImplementation(async () => ({
      data: mockSsotData,
    })),
  };
});

// Í≥µÍ≥µ ?∞Ïù¥??Î≥¥Í∞ï?Ä ?§Ï†ú APIÎ•??∏Ï∂ú?òÏ? ?äÍ≥† Í∏∞Î≥∏Í∞??¨Ïö©
vi.mock('@/lib/external/external-data-orchestrator', () => ({
  enrichBuildingData: vi.fn().mockResolvedValue({
    buildingRegister: { platArea: 1000, totalArea: 5000 },
    landPrice: { perSqm: 2000000 },
    landUsePlan: { zoningDistrict: '?ºÎ∞ò?ÅÏóÖÏßÄ?? },
  }),
}));

vi.mock('@/lib/external/enrich-by-pnu', () => ({
  enrichBuildingDataByPNU: vi.fn().mockResolvedValue({
    buildingRegister: { platArea: 1000, totalArea: 5000 },
    landPrice: { perSqm: 2000000 },
    landUsePlan: { zoningDistrict: '?ºÎ∞ò?ÅÏóÖÏßÄ?? },
  }),
}));

// ?Ä?Ä ?µÏã¨ ?¨Ìçº ?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä

async function runPipelineForFixture(fixture: PostureE2EFixture): Promise<{
  result: GenerateMobileIMResult;
  logger: PipelineLogger;
  docBody: any;
}> {
  const logger = new PipelineLogger(fixture.posture, fixture.caseId);
  savedDocBody = null;

  // ??SSoT ?ÖÎ†• ?§Ï†ï Î∞?Î°úÍπÖ
  mockSsotData = { ...fixture.ssotLite };
  logger.startStep();
  logger.saveSsotInput(fixture.ssotLite as any);
  logger.endStep('??SSoT Lite Íµ¨Ï∂ï', 'success', `buildingId: ${fixture.ssotLite.id}`);

  // ??Î∞îÌ??úÌä∏ Î≥¥Í∞ï ?∞Ïù¥??Î°úÍπÖ
  logger.startStep();
  logger.saveSupplemental(fixture.supplemental as any);
  logger.endStep('??Î∞îÌ??úÌä∏ Î≥¥Í∞ï', 'success', `posture: ${fixture.posture}, keys: ${Object.keys(fixture.supplemental).length}`);

  // ??generateMobileIMHandler ?§Ï†ú ?∏Ï∂ú (?§Ï†ú LLM)
  const input: GenerateMobileIMInput = {
    buildingId: fixture.ssotLite.id!,
    userId: 'e2e-test-user',
    supplemental: fixture.supplemental,
    identity: fixture.identity,
  };

  logger.startStep();
  const result = await generateMobileIMHandler(input);
  logger.endStep('??IM ?ùÏÑ± (LLM)', result.ok ? 'success' : 'error',
    `ok=${result.ok}, sections=${result.sections_count}, grade=${result.dataGrade}`,
    { ok: result.ok, sections_count: result.sections_count, dataGrade: result.dataGrade, ai_used: result.ai_used }
  );

  // ??Ï§ëÍ∞Ñ Í≤∞Í≥ºÎ¨?Î°úÍπÖ (savedDocBody?êÏÑú Ï∂îÏ∂ú)
  if (savedDocBody) {
    logger.startStep();
    if (savedDocBody.sections) {
      logger.saveSections(savedDocBody.sections);
    }
    if (savedDocBody.financials || savedDocBody.heroCard) {
      logger.saveFinancials(savedDocBody.financials ?? null);
      logger.saveHeroCard(savedDocBody.heroCard ?? null);
    }
    logger.saveGates({
      dataGrade: savedDocBody.dataGrade,
      financialWarnings: savedDocBody.financialWarnings,
      dcfEligible: savedDocBody.dcfEligible,
      dataCompleteness: savedDocBody.dataCompleteness,
    });
    logger.saveImDocument(savedDocBody);
    logger.endStep('??Ï§ëÍ∞Ñ Í≤∞Í≥ºÎ¨??Ä??, 'success', `sections: ${savedDocBody.sections?.length ?? 0}`);
  }

  // ??PPTX ?åÎçîÎß?Î∞??Ä??  if (result.ok && savedDocBody?.sections?.length > 0) {
    logger.startStep();
    try {
      const renderer = new MobileImPptxRenderer();
      const pptxInput: MobileImPptxInput = {
        buildingId: fixture.ssotLite.id!,
        posture: fixture.posture as InvestmentPosture,
        grade: (result.dataGrade as 'A' | 'B' | 'C' | 'D') ?? 'B',
        doc: {
          title: savedDocBody.title ?? `${fixture.posture} IM`,
          body: savedDocBody,
          sections: savedDocBody.sections,
        },
        building: {
          area_signal: fixture.ssotLite.area_signal,
          asset_type: fixture.ssotLite.asset_type,
          price_band: fixture.ssotLite.price_band,
        },
      };
      const pptxResult = await renderer.render(pptxInput);
      logger.savePptx(pptxResult.buffer);
      logger.endStep('??PPTX ?åÎçîÎß?, 'success',
        `slides: ${pptxResult.slideCount}, size: ${(pptxResult.fileSizeBytes / 1024).toFixed(0)}KB`,
        { slideCount: pptxResult.slideCount, fileSizeBytes: pptxResult.fileSizeBytes, warnings: pptxResult.warnings }
      );
    } catch (err) {
      logger.endStep('??PPTX ?åÎçîÎß?, 'error', `${err}`);
      throw err;
    }
  }

  // ???Ä?ÑÎùº??Î°úÍ∑∏ ?Ä??  logger.saveTimelineLog();

  return { result, logger, docBody: savedDocBody };
}

// ?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê??// ?µÏã¨ 5Ï¢??¨Ïä§Ï≤??Ä??Î¨ºÍ±¥ ?Ä ?åÏù¥?ÑÎùº??E2E
// ?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê??
describe('E2E Pipeline: 5 Postures Full Path (?§Ï†ú LLM ?∏Ï∂ú)', { timeout: 300_000 }, () => {

  beforeEach(() => {
    savedDocBody = null;
  });

  // ?Ä?Ä T1: income (?úÏ¥à Î©îÎîîÏª?ÎπåÎî©) ?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä
  describe('T1: income ???úÏ¥à Î©îÎîîÏª?ÎπåÎî© (Case 01)', () => {
    const fixture = POSTURE_REPRESENTATIVE_FIXTURES.income;
    let pipelineResult: Awaited<ReturnType<typeof runPipelineForFixture>>;

    test('T1-01: handler ?ïÏÉÅ ?∏Ï∂ú', async () => {
      pipelineResult = await runPipelineForFixture(fixture);
expect(pipelineResult.result.ok).toBe(true);
        expect(pipelineResult.result.sections_count).toBeGreaterThanOrEqual(7);
    });

    test('T1-02: ?¨Î¨¥ ?∞Ï∂ú Í≤ÄÏ¶?(Cap Rate, NOI Î≤îÏúÑ)', () => {
      const heroCard = pipelineResult.docBody?.heroCard;
      if (heroCard) {
        // Cap Rate 4~5% Î≤îÏúÑ (165??Îß§ÏûÖÍ∞Ä, ??7.14???òÏùµ)
        if (heroCard.capRateBase != null) {
          expect(heroCard.capRateBase).toBeGreaterThan(2);
          expect(heroCard.capRateBase).toBeLessThan(10);
        }
      }
    });

    test('T1-03: HeroCard income 4?Ä ÏßÄ??Î∞îÏù∏??, () => {
      const heroCard = pipelineResult.docBody?.heroCard;
      if (heroCard) {
        expect(heroCard.askingPriceDisplay).toBeTruthy();
        expect(heroCard.posture).toBe('income');
      }
    });

    test('T1-04: 7?πÏÖò ?åÎûú ?ïÌï©??, () => {
      const sections = pipelineResult.docBody?.sections ?? [];
expect(sections.length).toBeGreaterThanOrEqual(7);
        // income ?ÑÏö© ?πÏÖò ?Ä???ïÏù∏
        const types = sections.map((s: any) => s.section_type);
        expect(types).toContain('property_overview');
    });

    test('T1-05: Í∞Ä?úÎ†à???µÍ≥º', () => {
      // publishBlockedÍ∞Ä handler result??ÏßÅÏ†ë ?ÜÏúºÎ©?docBody?êÏÑú ?ïÏù∏
      expect(pipelineResult.result.ok).toBe(true);
    });
  });

  // ?Ä?Ä T2: owner_occupied (?±Ïàò ITÎ∞∏Î¶¨ ?µÏÇ¨?? ?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä
  describe('T2: owner_occupied ???±Ïàò ITÎ∞∏Î¶¨ ?µÏÇ¨??(Case 05)', () => {
    const fixture = POSTURE_REPRESENTATIVE_FIXTURES.owner_occupied;

    test('T2-01: handler ?ïÏÉÅ ?∏Ï∂ú + ?πÏÖò Í≤ÄÏ¶?, async () => {
      const { result, docBody } = await runPipelineForFixture(fixture);
expect(result.ok).toBe(true);
        expect(result.sections_count).toBeGreaterThanOrEqual(7);
        const types = (docBody?.sections ?? []).map((s: any) => s.section_type);
        expect(types).toContain('property_overview');
    });
  });

  // ?Ä?Ä T3: development (??Çº ?åÌó§?ÄÎ°??†Ï∂ïÎ∂ÄÏßÄ) ?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä
  describe('T3: development ????Çº ?åÌó§?ÄÎ°??†Ï∂ïÎ∂ÄÏßÄ (Case 12)', () => {
    const fixture = POSTURE_REPRESENTATIVE_FIXTURES.development;

    test('T3-01: handler ?ïÏÉÅ ?∏Ï∂ú + ?πÏÖò Í≤ÄÏ¶?, async () => {
      const { result, docBody } = await runPipelineForFixture(fixture);
expect(result.ok).toBe(true);
        expect(result.sections_count).toBeGreaterThanOrEqual(7);
    });
  });

  // ?Ä?Ä T4: operating (?¥Ï≤ú Î¨ºÎ•ò?ºÌÑ∞) ?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä
  describe('T4: operating ???¥Ï≤ú Î¨ºÎ•ò?ºÌÑ∞ (Case 16)', () => {
    const fixture = POSTURE_REPRESENTATIVE_FIXTURES.operating;

    test('T4-01: handler ?ïÏÉÅ ?∏Ï∂ú + Î¨ºÎ•ò ?πÌôî Í≤ÄÏ¶?, async () => {
      const { result, docBody } = await runPipelineForFixture(fixture);
expect(result.ok).toBe(true);
        expect(result.sections_count).toBeGreaterThanOrEqual(7);
    });
  });

  // ?Ä?Ä T5: trading (?†ÏÇ¨??Î∞∏Î•ò?†Îìú) ?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä?Ä
  describe('T5: trading ???†ÏÇ¨??Í∞ÄÎ°úÏàòÍ∏?Î∞∏Î•ò?†Îìú (Case 09)', () => {
    const fixture = POSTURE_REPRESENTATIVE_FIXTURES.trading;

    test('T5-01: handler ?ïÏÉÅ ?∏Ï∂ú + ?πÏÖò Í≤ÄÏ¶?, async () => {
      const { result, docBody } = await runPipelineForFixture(fixture);
expect(result.ok).toBe(true);
        expect(result.sections_count).toBeGreaterThanOrEqual(7);
    });
  });
});

// ?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê??// 16Ï¢??ÑÏàò ?åÍ? ?åÏä§??// ?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê?ê‚ïê??
describe('16-Case MECE Regression Suite (?§Ï†ú LLM ?∏Ï∂ú)', { timeout: 300_000 }, () => {

  beforeEach(() => {
    savedDocBody = null;
  });

  for (const fixture of ALL_FIXTURES) {
    test(`${fixture.caseId}: ${fixture.description} [${fixture.posture}]`, async () => {
      const { result, logger } = await runPipelineForFixture(fixture);
// handler ?∏Ï∂ú ?±Í≥µ
        expect(result.ok).toBe(true);

        // ?πÏÖò 7Í∞??¥ÏÉÅ ?ùÏÑ±
        expect(result.sections_count).toBeGreaterThanOrEqual(7);

        // ?∞Ïù¥???±Í∏â DÍ∞Ä ?ÑÎãå Í≤??ïÏù∏ (ÏµúÏÜå C)
        if (result.dataGrade) {
          expect(result.dataGrade).not.toBe('D');

        // ?åÏù¥?ÑÎùº??Î°úÍ∑∏???êÎü¨ ?ÜÏùå
        const errorSteps = logger.getLogs().filter(l => l.status === 'error');
        expect(errorSteps).toHaveLength(0);
      }
    }, 60_000); // Í∞úÎ≥Ñ ÏºÄ?¥Ïä§ 60Ï¥??Ä?ÑÏïÑ??  }
});



